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
