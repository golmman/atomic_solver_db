// DB access layer (DECISIONS.md D2): fetch the delivery file verbatim and
// open it with the vendored sql.js WASM SQLite. All access is read-only;
// the `censor` table (producer scheduling state) is never read, and unknown
// tables are tolerated.
const VENDOR = 'vendor/sqljs';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

// sha256Hex(bytes) → hex. crypto.subtle requires a secure context —
// http://localhost counts as one.
export function sha256Hex(bytes) {
  return crypto.subtle
    .digest('SHA-256', bytes)
    .then((hash) =>
      Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    );
}

// Fetch the delivery file and open it in sql.js. Returns the raw bytes (for
// the file-sha256 stamp) plus the opened database handle.
export async function openDelivery(onProgress) {
  onProgress?.('Fetching proofdb.db …');
  const res = await fetch('proofdb.db');
  if (!res.ok) {
    throw new Error(`proofdb.db fetch failed: HTTP ${res.status} (run npm start, not a raw file server)`);
  }
  const bytes = await res.arrayBuffer();

  onProgress?.('Loading sql.js WASM …');
  if (typeof window.initSqlJs !== 'function') {
    await loadScript(`${VENDOR}/sql-wasm.js`);
  }
  if (typeof window.initSqlJs !== 'function') {
    throw new Error('initSqlJs not available after loading sql-wasm.js');
  }
  const SQL = await window.initSqlJs({ locateFile: (file) => `${VENDOR}/${file}` });

  onProgress?.('Opening database …');
  const db = new SQL.Database(new Uint8Array(bytes));
  return { bytes: new Uint8Array(bytes), db };
}

// Table census from sqlite_master. Tolerates unknown tables; `censor` is
// listed but never queried.
export function tableCensus(db) {
  const names = [];
  const stmt = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
  );
  while (stmt.step()) names.push(stmt.getAsObject().name);
  stmt.free();
  return names;
}

export function readMeta(db) {
  const meta = {};
  const stmt = db.prepare('SELECT key, value FROM meta');
  while (stmt.step()) {
    const row = stmt.getAsObject();
    meta[row.key] = row.value;
  }
  stmt.free();
  return meta;
}

export function readShardCount(db) {
  const stmt = db.prepare('SELECT COUNT(*) AS n FROM shards');
  stmt.step();
  const n = stmt.getAsObject().n;
  stmt.free();
  return n;
}

// Node census: the numbers that stamp a database version.
export function readCensus(db) {
  const single = (sql) => {
    const stmt = db.prepare(sql);
    stmt.step();
    const v = stmt.getAsObject()[Object.keys(stmt.getAsObject())[0]];
    stmt.free();
    return v;
  };
  return {
    total: single('SELECT COUNT(*) FROM nodes'),
    win: single("SELECT COUNT(*) FROM nodes WHERE outcome = 'win'"),
    loss: single("SELECT COUNT(*) FROM nodes WHERE outcome = 'loss'"),
    open: single('SELECT COUNT(*) FROM nodes WHERE outcome IS NULL'),
    terminals: single(
      'SELECT COUNT(*) FROM nodes WHERE outcome IS NOT NULL AND depth_bound = 0'
    ),
    maxPly: single('SELECT MAX(ply) FROM nodes'),
  };
}

// Indexed per-ply resolution (global_proof_store §7): the node for one more
// move of the current path. Node identity is the path — resolution always
// goes through (parent_id, move_uci), never through a position.
export function findChildByMove(db, parentId, moveUci) {
  const stmt = db.prepare(
    'SELECT id, parent_id, ply, move_uci, move_code, outcome, depth_bound, depth_status, provenance\n     FROM nodes WHERE parent_id = ? AND move_uci = ?'
  );
  stmt.bind([parentId, moveUci]);
  let row = null;
  if (stmt.step()) {
    const r = stmt.getAsObject();
    row = {
      id: r.id,
      parentId: r.parent_id,
      ply: r.ply,
      moveUci: r.move_uci,
      moveCode: r.move_code,
      outcome: r.outcome,
      depthBound: r.depth_bound,
      depthStatus: r.depth_status,
      provenance: r.provenance,
    };
  }
  stmt.free();
  return row;
}

// Stored children of a node, in id order (spec §7 children query). A missing
// row means "no recorded fact", never "illegal" or "refuted".
export function readChildren(db, nodeId) {
  const rows = [];
  const stmt = db.prepare(
    `SELECT id, move_uci, move_code, outcome, depth_bound, depth_status
     FROM nodes WHERE parent_id = ? ORDER BY id`
  );
  stmt.bind([nodeId]);
  while (stmt.step()) {
    const r = stmt.getAsObject();
    rows.push({
      id: r.id,
      moveUci: r.move_uci,
      moveCode: r.move_code,
      outcome: r.outcome,
      depthBound: r.depth_bound,
      depthStatus: r.depth_status,
    });
  }
  stmt.free();
  return rows;
}

// Fold-digest input for `built_from` (spec §2.2): the sorted lines
// "<tag> <sha256>\n" over the shards table (405 rows here — a cheap read).
// SHA-256 over these lines must equal meta.built_from; the digest itself
// is computed by the caller (crypto.subtle, app.js).
export function readShardDigestInput(db) {
  const lines = [];
  const stmt = db.prepare(
    'SELECT tag, sha256 FROM shards ORDER BY tag'
  );
  while (stmt.step()) {
    const r = stmt.getAsObject();
    lines.push(`${r.tag} ${r.sha256}\n`);
  }
  stmt.free();
  return lines.join('');
}

// Shard metadata for a node's provenance tags (evidence display only —
// spec §3: provenance tags imply no proof semantics). One batched SELECT,
// chunked to keep the IN lists small.
export function readShardInfo(db, tags) {
  const byTag = {};
  for (let i = 0; i < tags.length; i += 100) {
    const chunk = tags.slice(i, i + 100);
    const stmt = db.prepare(
      `SELECT tag, file, n_nodes FROM shards WHERE tag IN (${chunk.map(() => '?').join(',')})`
    );
    stmt.bind(chunk);
    while (stmt.step()) {
      const r = stmt.getAsObject();
      byTag[r.tag] = { file: r.file, nNodes: r.n_nodes };
    }
    stmt.free();
  }
  return byTag;
}

// One node by id (parent chain walks for view navigation; ≤ ply lookups).
export function readNodeById(db, id) {
  const stmt = db.prepare('SELECT id, parent_id, move_uci FROM nodes WHERE id = ?');
  stmt.bind([id]);
  let row = null;
  if (stmt.step()) {
    const r = stmt.getAsObject();
    row = { id: r.id, parentId: r.parent_id, moveUci: r.move_uci };
  }
  stmt.free();
  return row;
}

// The two cheap views (brief §7.4, spec §7 queries). The shallowest proven
// wins list is capped: only the first `winLimit` rows are returned, with the
// full count alongside — the view stays a small link list.
export function readViews(db, winLimit = 50) {
  const rows = (sql, params) => {
    const stmt = db.prepare(sql);
    stmt.bind(params ?? []);
    const out = [];
    while (stmt.step()) {
      const r = stmt.getAsObject();
      out.push({ id: r.id, ply: r.ply });
    }
    stmt.free();
    return out;
  };
  const openFrontier = rows(
    'SELECT id, ply FROM nodes WHERE outcome IS NULL ORDER BY ply, id'
  );
  const minWin = rows(
    "SELECT id, ply FROM nodes WHERE outcome = 'win' AND depth_bound =\n      (SELECT MIN(depth_bound) FROM nodes WHERE outcome = 'win') ORDER BY ply, id"
  );
  return {
    openFrontier,
    shallowWins: { total: minWin.length, rows: minWin.slice(0, winLimit), capped: minWin.length > winLimit },
  };
}

// Whole-table read of nodes (≈43k rows, well within one tab). `censor` is
// never read.
export function readAllNodes(db) {
  const nodes = [];
  const stmt = db.prepare(
    `SELECT id, parent_id, ply, move_uci, move_code, outcome, depth_bound, depth_status, provenance
     FROM nodes ORDER BY id`
  );
  while (stmt.step()) {
    const r = stmt.getAsObject();
    nodes.push({
      id: r.id,
      parentId: r.parent_id,
      ply: r.ply,
      moveUci: r.move_uci,
      moveCode: r.move_code,
      outcome: r.outcome,
      depthBound: r.depth_bound,
      depthStatus: r.depth_status,
      provenance: r.provenance,
    });
  }
  stmt.free();
  return nodes;
}
