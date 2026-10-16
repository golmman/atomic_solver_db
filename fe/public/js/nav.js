// Board + move navigation along the stored proof tree (redesign plan3).
//
// Navigation state is the PATH (list of UCI moves), never a position
// (global_proof_store §1): each ply is resolved with the indexed lookup
// SELECT id FROM nodes WHERE parent_id = ? AND move_uci = ?. The board
// always renders engine.fen() of the replayed position — the DB stores no
// FENs, positions come from the engine replay only.
//
// Absence discipline (brief §4): a missing child row is rendered as
// "unknown", never as refuted/illegal; open nodes are "undecided", never
// "draw". The `censor` table is never read.
import { findChildByMove, readChildren } from './db.js';

const pieceChars = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

const arrowSvg = document.getElementById('arrow');
const arrowLine = document.getElementById('arrow-line');

// ---------------------------------------------------------------------------
// State: path (UCI + engine move code per ply) + resolved node-id chain.
// ids[i] is the node row id after i+1 plies, or null when that path has no
// row (the position is then unknown to the database; its subtree is
// necessarily row-free, so the DB is simply not consulted past it).
// ---------------------------------------------------------------------------
const state = {
  boardId: null,
  rootId: null,
  path: [], // [{ uci, code }]
  ids: [], // node row id per ply (null = no row for this path)
  nodeId: null, // row id of the current position (null = no row)
};

// ---------------------------------------------------------------------------
// Board rendering (ported from the pre-redesign renderer; look preserved).
// ---------------------------------------------------------------------------

function squareName(fileIndex, rankIndex) {
  const file = String.fromCharCode('a'.charCodeAt(0) + fileIndex);
  const rank = 8 - rankIndex;
  return file + rank;
}

function expandRank(rank) {
  const squares = [];
  for (const ch of rank) {
    if (/\d/.test(ch)) {
      for (let i = 0; i < Number(ch); i++) squares.push(null);
    } else {
      squares.push(ch);
    }
  }
  return squares;
}

function uciToSquares(uci) {
  if (!uci || uci.length < 4) return [null, null];
  return [uci.slice(0, 2), uci.slice(2, 4)];
}

function getSquareElement(name) {
  if (!name) return null;
  return document.querySelector(`.square[data-square="${name}"]`);
}

function showArrow(uci) {
  const [from, to] = uciToSquares(uci);
  const fromSq = getSquareElement(from);
  const toSq = getSquareElement(to);
  if (!fromSq || !toSq) return;

  const wrapper = document.getElementById('board-wrapper');
  const wrapRect = wrapper.getBoundingClientRect();
  const fromRect = fromSq.getBoundingClientRect();
  const toRect = toSq.getBoundingClientRect();

  const x1 = fromRect.left - wrapRect.left + fromRect.width / 2;
  const y1 = fromRect.top - wrapRect.top + fromRect.height / 2;
  const x2 = toRect.left - wrapRect.left + toRect.width / 2;
  const y2 = toRect.top - wrapRect.top + toRect.height / 2;

  arrowLine.setAttribute('x1', x1);
  arrowLine.setAttribute('y1', y1);
  arrowLine.setAttribute('x2', x2);
  arrowLine.setAttribute('y2', y2);
  arrowSvg.style.display = 'block';
}

function hideArrow() {
  arrowSvg.style.display = 'none';
}

function renderBoard(fen, lastMoveUci) {
  const boardPart = fen.split(' ')[0];
  const ranks = boardPart.split('/');
  const board = document.getElementById('board');
  board.innerHTML = '';

  for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
    const rank = expandRank(ranks[rankIndex]);
    for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
      const piece = rank[fileIndex];
      const square = document.createElement('div');
      const isDark = (rankIndex + fileIndex) % 2 === 1;
      square.className = `square ${isDark ? 'dark' : 'light'}`;
      square.dataset.square = squareName(fileIndex, rankIndex);

      if (piece) {
        const span = document.createElement('span');
        span.className = `piece ${piece === piece.toUpperCase() ? 'white' : 'black'}`;
        span.textContent = pieceChars[piece] || piece;
        square.appendChild(span);
      }

      board.appendChild(square);
    }
  }

  if (lastMoveUci) {
    const [from, to] = uciToSquares(lastMoveUci);
    const fromSq = getSquareElement(from);
    const toSq = getSquareElement(to);
    if (fromSq) fromSq.classList.add('last-from');
    if (toSq) toSq.classList.add('last-to');
  }
}

// ---------------------------------------------------------------------------
// Move lists (right sidebar). Two visibly separate groups:
//   recorded children — stored rows in id order, labelled with the recorded
//   fact (win/loss + depth_bound + exact/bound; open = undecided);
//   legal replies without rows — engine legal set minus the recorded set,
//   rendered as plain "unknown".
// ---------------------------------------------------------------------------

function factText(row) {
  if (row.outcome === null || row.outcome === undefined) return 'undecided';
  if (row.depthBound === 0) return `${row.outcome} · terminal`;
  const scope = row.depthStatus === 'exact' ? 'exact' : 'at most';
  return `${row.outcome} · ≤ ${row.depthBound} plies (${scope})`;
}

function moveButton(uci, label, cls, onClick) {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.className = cls;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  btn.addEventListener('mouseenter', () => showArrow(uci));
  btn.addEventListener('mouseleave', hideArrow);
  li.appendChild(btn);
  return li;
}

function renderMoves(children, legalCodes) {
  const list = document.getElementById('moves');
  const noMoves = document.getElementById('no-moves');
  const unknownList = document.getElementById('unknown-moves');
  const unknownIntro = document.getElementById('unknown-intro');
  const noLegal = document.getElementById('no-legal');
  list.innerHTML = '';
  unknownList.innerHTML = '';

  const recorded = new Set(
    children.filter((c) => c.moveCode !== null && c.moveCode !== undefined).map((c) => c.moveCode)
  );

  for (const child of children) {
    const cls =
      child.outcome === 'win'
        ? 'move-win'
        : child.outcome === 'loss'
          ? 'move-loss'
          : 'move-open';
    list.appendChild(
      moveButton(child.moveUci, `${child.moveUci} — ${factText(child)}`, cls, () =>
        navigate(child.moveUci, child.moveCode)
      )
    );
  }
  noMoves.classList.toggle('hidden', children.length > 0);

  // Legal replies without a stored row: unknown, never refuted/illegal.
  // Beyond a row-free node there are no rows at all (children reference
  // existing parent rows), so the recorded set is empty there.
  let unknownCount = 0;
  for (const code of legalCodes) {
    if (recorded.has(code)) continue;
    const uci = engine.uci(state.boardId, code);
    unknownList.appendChild(
      moveButton(uci, `${uci} — unknown`, 'move-unknown', () => navigate(uci, code))
    );
    unknownCount += 1;
  }
  unknownIntro.classList.toggle('hidden', !(state.nodeId === null && legalCodes.length > 0));
  noLegal.classList.toggle('hidden', legalCodes.length > 0);
  if (legalCodes.length === 0) {
    noMoves.classList.add('hidden');
    unknownIntro.classList.add('hidden');
  }
}

// ---------------------------------------------------------------------------
// Node status line (minimal; the full facts panel is plan4). Wording per
// brief §4: open = "undecided"; a path without a row = "unknown (not in the
// database)". The word "draw" must not appear.
// ---------------------------------------------------------------------------
function renderNodeStatus() {
  const box = document.getElementById('node-status');
  box.innerHTML = '';
  const p = document.createElement('p');
  if (state.nodeId === null) {
    p.textContent =
      'No recorded facts for this position — unknown (not in the database).';
  } else {
    const row = currentNode;
    if (!row) {
      p.textContent = 'No recorded facts for this position.';
    } else if (row.outcome === null || row.outcome === undefined) {
      p.textContent = 'Undecided — no proven outcome recorded for this node.';
    } else if (row.depthBound === 0) {
      p.textContent = `Proven: ${row.outcome} — terminal (decided in the position itself).`;
    } else {
      p.textContent = `Proven: ${row.outcome} within ≤ ${row.depthBound} plies (${row.depthStatus}).`;
    }
  }
  box.appendChild(p);
}

// The current node's own row (null at the root of a row-free path).
let currentNode = null;

// ---------------------------------------------------------------------------
// History breadcrumb (left sidebar; grouping as in the old renderer). Every
// entry is clickable and jumps back to the position after that half-move.
// ---------------------------------------------------------------------------
function renderHistory() {
  const list = document.getElementById('history');
  list.innerHTML = '';

  const rootLi = document.createElement('li');
  rootLi.className = 'start';
  if (state.path.length === 0) {
    rootLi.textContent = 'Start position';
  } else {
    const span = document.createElement('span');
    span.className = 'hist-move';
    span.textContent = 'Start position';
    span.addEventListener('click', () => jumpBack(0));
    rootLi.appendChild(span);
  }
  list.appendChild(rootLi);

  let currentLi = null;
  for (let j = 0; j < state.path.length; j++) {
    const moveNum = Math.floor(j / 2) + 1;
    const uci = state.path[j].uci;
    if (j % 2 === 0) {
      currentLi = document.createElement('li');
      currentLi.appendChild(document.createTextNode(`${moveNum}. `));
      currentLi.appendChild(histSpan(uci, j));
      list.appendChild(currentLi);
    } else if (currentLi) {
      currentLi.appendChild(document.createTextNode(' '));
      currentLi.appendChild(histSpan(uci, j));
    }
  }

  document.getElementById('undo').disabled = state.path.length === 0;
}

function histSpan(uci, j) {
  const span = document.createElement('span');
  span.className = 'hist-move';
  span.textContent = uci;
  span.title = `Back to move ${Math.floor(j / 2) + 1}${j % 2 === 0 ? '.' : '…'}`;
  span.addEventListener('click', () => jumpBack(j + 1));
  return span;
}

// ---------------------------------------------------------------------------
// Navigation.
// ---------------------------------------------------------------------------

function navigate(uci, code) {
  hideArrow();
  const parentForLookup = state.nodeId;
  const row =
    parentForLookup === null ? null : findChildByMove(db, parentForLookup, uci);
  engine.apply(state.boardId, code);
  state.path.push({ uci, code });
  state.ids.push(row ? row.id : null);
  state.nodeId = row ? row.id : null;
  currentNode = row;
  render();
}

// Jump back to the position after `keep` half-moves (undo the rest).
function jumpBack(keep) {
  hideArrow();
  while (state.path.length > keep) {
    const last = state.path.pop();
    state.ids.pop();
    engine.undo(state.boardId, last.code);
  }
  state.nodeId = state.path.length === 0 ? state.rootId : state.ids[state.path.length - 1];
  currentNode =
    state.path.length === 0
      ? rootRow
      : findChildByMove(db, state.ids[state.path.length - 2] ?? state.rootId, state.path[state.path.length - 1].uci);
  render();
}

function undo() {
  if (state.path.length === 0) return;
  jumpBack(state.path.length - 1);
}

// ---------------------------------------------------------------------------
// Render + boot.
// ---------------------------------------------------------------------------

function render() {
  const fen = engine.fen(state.boardId);
  const lastUci = state.path.length > 0 ? state.path[state.path.length - 1].uci : null;
  renderBoard(fen, lastUci);
  document.getElementById('fen').textContent = fen;
  renderNodeStatus();
  const children = state.nodeId === null ? [] : readChildren(db, state.nodeId);
  const legalCodes = engine.legal(state.boardId);
  renderMoves(children, legalCodes);
  renderHistory();
}

let db = null;
let engine = null;
let rootRow = null;

// Reuse the engine facade already initialised for the replay gate; the nav
// board is a fresh engine board over root_fen (kept for the whole session).
export function initNav({ db: dbHandle, engine: engineFacade, rootFen, root }) {
  db = dbHandle;
  engine = engineFacade;
  rootRow = root;
  state.rootId = root.id;
  state.nodeId = root.id;
  state.path = [];
  state.ids = [];
  currentNode = root;
  state.boardId = engine.new(rootFen);

  document.getElementById('undo').addEventListener('click', undo);
  render();
}
