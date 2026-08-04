import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Pool } from 'pg';
import { Atomic } from 'chessops/variant';
import { parseFen, makeFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { loadProofTree } from './bin-loader.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');

const PORT = Number(process.env.PORT) || 7000;
const HOST = process.env.HOST || '127.0.0.1';

function getDbConfig() {
  return {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'proof_tree',
    user: process.env.PGUSER || process.env.POSTGRES_USER || 'admin',
    password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || 'secret',
  };
}

function findBinPath() {
  const candidates = [
    process.env.PROOF_TREE_BIN,
    join(__dirname, '..', 'db', 'proof_tree.bin'),
    join(__dirname, '..', '..', 'atomic_solver', 'proof_tree.bin'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function loadFromDatabase() {
  const pool = new Pool({ ...getDbConfig(), connectionTimeoutMillis: 5000 });
  try {
    const metaResult = await pool.query('SELECT * FROM proof_tree_meta LIMIT 1');
    if (metaResult.rowCount === 0) {
      throw new Error('proof_tree_meta is empty');
    }
    const meta = metaResult.rows[0];

    const rowsResult = await pool.query(
      'SELECT id, parent_id, uci_move, depth FROM proof_tree ORDER BY id'
    );
    return { source: 'database', meta, rows: rowsResult.rows };
  } finally {
    await pool.end();
  }
}

async function loadFromBin() {
  const binPath = findBinPath();
  if (!binPath) {
    throw new Error('Could not find proof_tree.bin for fallback loading');
  }
  console.log(`Loading proof tree from ${binPath}...`);
  const { metadata, rows } = loadProofTree(binPath);
  return { source: binPath, meta: metadata, rows };
}

async function loadData() {
  if (process.env.USE_BIN === '1') {
    return loadFromBin();
  }

  try {
    const data = await loadFromDatabase();
    console.log(`Loaded ${data.rows.length} nodes from database.`);
    return data;
  } catch (err) {
    console.warn(`Database load failed: ${err.message}`);
    const binPath = findBinPath();
    if (binPath) {
      console.warn(`Falling back to ${binPath}`);
      return loadFromBin();
    }
    throw err;
  }
}

function buildTree(rows) {
  const nodeById = new Map();
  const childrenByParent = new Map();

  for (const row of rows) {
    nodeById.set(row.id, {
      id: row.id,
      parentId: row.parent_id,
      uciMove: row.uci_move,
      depth: row.depth,
      children: [],
    });
  }

  for (const node of nodeById.values()) {
    if (node.parentId !== null && node.parentId !== undefined) {
      const siblings = childrenByParent.get(node.parentId);
      if (siblings) {
        siblings.push(node.id);
      } else {
        childrenByParent.set(node.parentId, [node.id]);
      }
    }
  }

  // Sort children for a stable move list.
  for (const [parentId, children] of childrenByParent) {
    children.sort((a, b) => {
      const ua = nodeById.get(a).uciMove;
      const ub = nodeById.get(b).uciMove;
      if (ua === ub) return a - b;
      return ua.localeCompare(ub);
    });
    nodeById.get(parentId).children = children;
  }

  return { nodeById, childrenByParent };
}

function computeFens(meta, nodeById) {
  const positions = new Map();
  const fens = new Map();

  const rootSetup = parseFen(meta.fen);
  if (!rootSetup.isOk) {
    throw new Error(`Invalid root FEN: ${meta.fen}`);
  }
  const rootResult = Atomic.fromSetup(rootSetup.value);
  if (!rootResult.isOk) {
    throw new Error(`Invalid atomic setup from root FEN: ${meta.fen}`);
  }

  positions.set(0, rootResult.value);
  fens.set(0, makeFen(rootResult.value.toSetup()));

  const sortedIds = Array.from(nodeById.keys()).sort((a, b) => a - b);
  for (const id of sortedIds) {
    if (id === 0) continue;
    const node = nodeById.get(id);
    const parent = nodeById.get(node.parentId);
    if (!parent) {
      throw new Error(`Node ${id} references unknown parent ${node.parentId}`);
    }
    const parentPos = positions.get(node.parentId).clone();
    const move = parseUci(node.uciMove);
    if (!move) {
      throw new Error(`Node ${id} has invalid UCI move ${node.uciMove}`);
    }
    if (!parentPos.isLegal(move)) {
      console.warn(
        `Node ${id} move ${node.uciMove} is not legal in the computed position. Applying anyway.`
      );
    }
    parentPos.play(move);
    positions.set(id, parentPos);
    fens.set(id, makeFen(parentPos.toSetup()));
  }

  return fens;
}

async function main() {
  const { meta, rows } = await loadData();
  const { nodeById } = buildTree(rows);
  const fens = computeFens(meta, nodeById);

  const app = express();
  app.use(express.static(PUBLIC_DIR));

  app.get('/api/meta', (_req, res) => {
    res.json({
      fen: meta.fen,
      version: meta.version,
      root_outcome: meta.root_outcome,
      root_depth: meta.root_depth,
      node_count: meta.node_count,
    });
  });

  app.get('/api/node/:id', (req, res) => {
    const id = Number(req.params.id);
    const node = nodeById.get(id);
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }

    const path = [];
    let n = node;
    while (n) {
      path.unshift({ nodeId: n.id, uciMove: n.uciMove });
      n = n.parentId === null || n.parentId === undefined
        ? null
        : nodeById.get(n.parentId);
    }

    res.json({
      nodeId: node.id,
      uciMove: node.uciMove,
      fen: fens.get(node.id),
      children: node.children.map((childId) => {
        const child = nodeById.get(childId);
        return { nodeId: child.id, uciMove: child.uciMove };
      }),
      path,
    });
  });

  app.get('/', async (_req, res) => {
    const indexPath = join(PUBLIC_DIR, 'index.html');
    res.type('html');
    res.send(await readFile(indexPath, 'utf8'));
  });

  app.listen(PORT, HOST, () => {
    console.log(`Frontend server listening on http://${HOST}:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
