const pieceChars = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

const state = {
  nodeId: 0,
  path: [],
};

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

function renderBoard(fen) {
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

      if (piece) {
        const span = document.createElement('span');
        span.className = `piece ${piece === piece.toUpperCase() ? 'white' : 'black'}`;
        span.textContent = pieceChars[piece] || piece;
        square.appendChild(span);
      }

      board.appendChild(square);
    }
  }
}

function renderChildren(children) {
  const list = document.getElementById('moves');
  const empty = document.getElementById('no-moves');
  list.innerHTML = '';

  if (children.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  for (const child of children) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = child.uciMove;
    btn.addEventListener('click', () => loadNode(child.nodeId));
    li.appendChild(btn);
    list.appendChild(li);
  }
}

function renderHistory(path) {
  state.path = path;
  const list = document.getElementById('history');
  list.innerHTML = '';

  if (path.length <= 1) {
    const rootLi = document.createElement('li');
    rootLi.className = 'start';
    rootLi.textContent = 'Start position';
    list.appendChild(rootLi);
  } else {
    // Pair white and black moves: 1. e2e4 e7e5
    let currentLi = null;
    for (let i = 1; i < path.length; i++) {
      const moveNum = Math.floor((i + 1) / 2);
      const uci = path[i].uciMove;
      if (i % 2 === 1) {
        currentLi = document.createElement('li');
        currentLi.textContent = `${moveNum}. ${uci}`;
        list.appendChild(currentLi);
      } else if (currentLi) {
        currentLi.textContent += ` ${uci}`;
      }
    }
  }

  document.getElementById('undo').disabled = path.length <= 1;
}

async function loadNode(id) {
  const res = await fetch(`/api/node/${id}`);
  if (!res.ok) {
    console.error('Failed to load node', id, await res.text());
    return;
  }
  const data = await res.json();

  state.nodeId = data.nodeId;
  document.getElementById('fen').textContent = data.fen;
  renderBoard(data.fen);
  renderChildren(data.children);
  renderHistory(data.path);
}

async function loadMeta() {
  const res = await fetch('/api/meta');
  if (!res.ok) {
    console.error('Failed to load meta', await res.text());
    return;
  }
  const meta = await res.json();
  document.getElementById('root-outcome').textContent = meta.root_outcome;
  document.getElementById('root-depth').textContent = meta.root_depth;
  document.getElementById('node-count').textContent = meta.node_count;
}

function undo() {
  if (state.path.length <= 1) return;
  const parent = state.path[state.path.length - 2];
  loadNode(parent.nodeId);
}

async function init() {
  await loadMeta();
  await loadNode(0);
  document.getElementById('undo').addEventListener('click', undo);
}

init().catch(console.error);
