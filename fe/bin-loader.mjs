import { readFileSync } from 'node:fs';

const OUTCOME_NAMES = { 0: 'Draw', 1: 'Win', 2: 'Loss' };

function sqStr(sq) {
  const file = sq % 8;
  const rank = Math.floor(sq / 8);
  return String.fromCharCode('a'.charCodeAt(0) + file) + (rank + 1);
}

function moveToUci(moveCode) {
  const toSq = moveCode & 0x3f;
  const fromSq = (moveCode >> 6) & 0x3f;
  const moveType = (moveCode >> 12) & 0x3;
  const promotionIdx = (moveCode >> 14) & 0x3;

  const fromStr = sqStr(fromSq);

  let toStr;
  if (moveType === 3) {
    // Castling: normalize to king-destination squares g1/c1/g8/c8.
    if (fromSq === 4 || fromSq === 60) {
      const fromFile = fromSq % 8;
      const toFile = toSq % 8;
      const rank = Math.floor(fromSq / 8);
      const targetFile = toFile > fromFile ? 'g' : 'c';
      toStr = targetFile + (rank + 1);
    } else {
      toStr = sqStr(toSq);
    }
  } else {
    toStr = sqStr(toSq);
  }

  let uci = fromStr + toStr;
  if (moveType === 1) {
    uci += ['q', 'r', 'b', 'n'][promotionIdx];
  }
  return uci;
}

export function loadProofTree(path) {
  const buf = readFileSync(path);
  let offset = 0;

  function read(size) {
    if (offset + size > buf.length) {
      throw new Error(`Unexpected end of file at offset ${offset}`);
    }
    const chunk = buf.subarray(offset, offset + size);
    offset += size;
    return chunk;
  }

  const magic = read(8);
  if (magic.toString('ascii') !== 'ATOMTREE') {
    throw new Error(`Bad magic: ${magic.toString('ascii')}`);
  }

  const version = read(1)[0];
  if (version !== 1) {
    throw new Error(`Unsupported version: ${version}`);
  }

  const fenEnd = buf.indexOf(0x0a, offset);
  if (fenEnd === -1) {
    throw new Error('FEN not terminated by newline');
  }
  const fen = buf.subarray(offset, fenEnd).toString('ascii');
  offset = fenEnd + 1;

  const rootOutcomeCode = read(1)[0];
  if (!(rootOutcomeCode in OUTCOME_NAMES)) {
    throw new Error(`Invalid root_outcome: ${rootOutcomeCode}`);
  }
  const rootOutcome = OUTCOME_NAMES[rootOutcomeCode];

  const rootDepth = buf.readUInt32LE(offset);
  offset += 4;

  const recordsBytes = buf.length - offset;
  if (recordsBytes % 6 !== 0) {
    throw new Error('Records do not fill the file evenly');
  }
  const n = Math.floor(recordsBytes / 6);
  if (n === 0) {
    throw new Error('No node records found');
  }

  const parents = [];
  const moveCodes = [];
  for (let i = 0; i < n; i++) {
    parents.push(buf.readUInt32LE(offset));
    offset += 4;
    moveCodes.push(buf.readUInt16LE(offset));
    offset += 2;
  }

  if (parents[0] !== 0xffffffff) {
    throw new Error('Root node must have parent_id 0xFFFFFFFF');
  }
  if (moveCodes[0] !== 0) {
    throw new Error('Root node must have move_code 0');
  }

  for (let i = 1; i < n; i++) {
    if (parents[i] >= i) {
      throw new Error(`Node ${i} has invalid parent_id ${parents[i]}`);
    }
  }

  const depths = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    depths[i] = depths[parents[i]] + 1;
  }

  const rows = [];
  for (let i = 0; i < n; i++) {
    const parentId = i === 0 ? null : parents[i];
    const uci = i === 0 ? null : moveToUci(moveCodes[i]);
    rows.push({ id: i, parent_id: parentId, uci_move: uci, depth: depths[i] });
  }

  const metadata = {
    fen,
    version,
    root_outcome: rootOutcome,
    root_depth: rootDepth,
    node_count: n,
  };

  return { metadata, rows };
}
