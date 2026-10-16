# report1 — plan1 results

**Date:** 2026-10-16 (single session). **Plan:** `plan1.md`. **Status:** all
steps completed; acceptance criteria met.

## Delivery verification (step 1)

Re-verified on session start, all match HANDOFF:

- sha256 `data/proofdb/proofdb.db` = `02fc7d60bc588ef5a1589671c7dc8dcd899ae8f8afe11d23c208dfc0300210ae`
- meta: `schema_version=2`, `built_from=70a160a65c9b…79a58`, `node_count=43092`
- census: 21514 win / 21514 loss / 64 open (43028 proven); 20220 terminals;
  max ply 22; 20220 `exact` rows; 405 shards; 3617 `censor` rows
- root children (7): g1f3, g1h3, a2a3, a2a4, c2c3, e2e3, e2e4 — all open

## What changed (steps 2–5)

**Deletions (old stack fully removed):**

- `db/` directory entirely (Dockerfile, build.sh, run.sh,
  init-proof-tree.sh, load_proof_tree.py, proof_tree_dump.md, local
  proof_tree.bin)
- `fe/bin-loader.mjs`, `fe/public/app.js` (old fetch-API boot)
- Makefile targets `db_build` / `db_rebuild` / `db_run` (`fe_run` kept)
- `express`, `pg`, `chessops` dependencies (only `sql.js@^1.13.0` remains)

**New scaffold:**

- `fe/server.mjs` — rewritten as a dependency-free `node:http` static
  server (D3): `fe/public/` on `localhost:7000`, `PORT`/`HOST` env
  override parity with the old server, MIME map, 404s, no directory
  listing, path-traversal guard, GET/HEAD only.
- `fe/sync-db.mjs` (D5) — sha256 gate over the delivery; on mismatch it
  hard-fails with the "how to record a new delivery" instructions; on
  success copies the file into `fe/public/proofdb.db`.
- `fe/sync-vendor.mjs` — copies sql.js dist (`sql-wasm.js`,
  `sql-wasm.wasm`) to `fe/public/vendor/sqljs/`.
- `fe/delivery.json` — created from HANDOFF's version-stamp block (file
  sha256, schema_version, built_from, root_fen, census, terminal count,
  max ply, shard count).
- `.gitignore` — added `fe/public/vendor/`, `fe/public/proofdb.db`,
  `fe/public/delivery.json`; dropped `db/proof_tree.bin`.
- `npm start` = `npm run sync && node server.mjs` (sync = both scripts).

**Client (ES modules under `fe/public/js/`):**

- `db.js` — fetches `proofdb.db` verbatim, loads the vendored
  `sql-wasm.js`, opens it in memory (read-only in practice: no write or
  schema-modifying statement exists anywhere), helpers for meta, table
  census (`sqlite_master`, tolerates unknown tables), node census, shard
  count, and the whole-table nodes read (`id, parent_id, ply, move_uci,
  outcome, depth_bound, depth_status, provenance` ordered by id). `censor`
  is never read.
- `gates.js` — gate 1: `schema_version ∈ {1,2}`, `node_count == COUNT(*)`,
  surfaces `built_from`. Gate 2: structural checks a–f over the in-memory
  rows, each counting violations (samples kept for error display).
- `app.js` — boot with progress states; verifies the file sha256 against
  `delivery.json` (D5 delivery gate) and the census/`built_from` against
  the stamp; renders the blocking error page on any gate failure;
  otherwise renders the version-stamp panel (built_from, file sha256,
  schema_version, root_fen, census win/loss/open, terminals, max ply,
  shards) plus the gate summary (a–f each `pass` with violation counts).

**Boot UI (D4):** `index.html` keeps header + three-column layout and
`style.css` is extended (not restyled) with `.stamp-panel`, `.gate-summary`,
`.error-page`, `.boot-status` styles. History/moves panels keep their look
with explicit "board navigation arrives with the board phase" placeholders.

## Gate results (verified in a real browser)

- Version stamp panel shows exactly the HANDOFF values (sha256,
  built_from, census 43,092 = 21,514/21,514/64, 20,220 terminals,
  max ply 22, 405 shards).
- Structural checks a–f: **6/6 pass, 0 violations** over all 43,092 rows.
- Blocking-error path exercised: tampering the served `delivery.json`
  sha256 produced the sha-mismatch error page; restoring it returned to
  the all-pass state. No console errors.

## Absence discipline (step 6)

- `rg -i censor` over all shipped code: only comments stating it is never
  read; no SQL touches the table.
- No write path exists: the client only issues SELECTs; the sync scripts
  copy files, never open the DB.

## Acceptance criteria

- ✅ `npm start` serves the site; gates all pass; stamp matches HANDOFF.
- ✅ No `db/`, no `bin-loader.mjs`, no express/pg/chessops, no db Makefile
  targets. The case-insensitive `rg` sweep finds no live references
  outside `docs/plans/redesign/` (the only AGENTS.md hit is the
  acceptance command text itself).
- ✅ `git status` clean of generated files (delivery + vendor + db copy +
  `data/` all ignored); untracked files are source only.

## How to run

```sh
make fe_run    # cd fe && npm install && npm start
# open http://localhost:7000
```

## Deviations from the plan

1. `sync-db.mjs` also copies `fe/delivery.json` to `fe/public/` (the
   client-side gate needs the expected stamp; serving it via the static
   server avoids extra server routes).
2. Gate 2 check f is implemented as referential integrity of `parent_id`
   references (each reference resolves to an existing row); the plan's
   wording ("child `parent_id` equality for every `parent_id` reference")
   is ambiguous — this reading matches the spec's guarantee that parent
   chains replay (check e covers ordering/ply on resolved references).
3. sql.js is loaded as a classic script tag (its UMD build defines
   `window.initSqlJs` only in classic script context); all other client
   code is ES modules as planned.

## Open items for plan2

- D1: Rust/WASM engine — thin wrapper crate over `atomic-movegen` 2.3 →
  wasm32-unknown-unknown, vendored under `fe/public/vendor/engine/`
  (gitignored), rebuild hook in `npm start`; fallback raw-ABI `cdylib` if
  wasm-bindgen-cli is unavailable.
- Replay gate (§8.3): replay all 43,092 paths with the bit-exact engine
  and assert stored facts; add to the boot gates or a self-check surface.
- `app.js` currently passes gate data around in one boot function; when
  board navigation lands, extract a shared store (handoff notes a global
  proof-store shape) so plan3/plan4 don't re-read the DB.
- Minor: `style.css` still carries unused `#fen-box`/`#meta-box` rules
  from the removed board; can be cleaned during plan4 polish.
