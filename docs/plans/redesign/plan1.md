# plan1 — Old stack removal, static scaffold, load gate + structural invariants

**Session scope:** single session. Ends with `docs/plans/redesign/report1.md`.
**Contract:** `docs/plans/redesign/handoff/global_proof_store.md` (normative),
`handoff/BROWSER_BRIEF.md` §7–§9, `handoff/HANDOFF.md`.
**Decisions already made:** `docs/plans/redesign/DECISIONS.md` (D1 WASM engine —
not this session; D2 sql.js; D3 static server; D5 gate + delivery.json).

## Goal

Remove the old `proof_tree.bin` → PostgreSQL stack entirely, and scaffold the
new static site with everything that does **not** need the rules engine:
DB load (D2), version-stamp gate (§8.1), structural invariant checks
(§8.2), and the data version-stamp surface. Board navigation (plan3) and
the node facts panel (plan4) are explicitly out of scope.

## Preconditions

- `docs/plans/redesign/DECISIONS.md` exists; read D2, D3, D5, D6.
- `data/proofdb/proofdb.db` delivery present, sha256 =
  `02fc7d60bc588ef5a1589671c7dc8dcd899ae8f8afe11d23c208dfc0300210ae`,
  census per HANDOFF (verified; re-verify as step 1 of this session).

## Steps

1. **Verify the delivery** — recompute the sha256 and census
   (win/loss/open/terminals, max ply, root children) against `HANDOFF.md`.
   Abort with a clear message on mismatch.
2. **Remove the old stack.** Delete the whole `db/` directory
   (Dockerfile, build.sh, run.sh, init-proof-tree.sh, load_proof_tree.py,
   proof_tree_dump.md, local proof_tree.bin). Delete `fe/bin-loader.mjs`.
   Remove `db_build` / `db_rebuild` / `db_run` targets from the Makefile
   (`fe_run` stays). Drop `express`, `pg`, `chessops` from
   `fe/package.json` (only `sql.js` remains, added in step 3).
3. **Scaffold.**
   - `fe/server.mjs` → new dependency-free static server (D3): serves
     `fe/public/` on `localhost:7000`, correct MIME types, 404s, no
     directory listing. Port/env override parity with the old one.
   - `fe/sync-db.mjs` (D5): computes sha256 of `data/proofdb/proofdb.db`,
     compares it against `fe/delivery.json` (created this session from
     HANDOFF's "Version stamp" block), hard-fails on mismatch with a
     message telling how a new delivery is recorded; then copies the file
     to `fe/public/proofdb.db`.
   - `fe/sync-vendor.mjs`: copies `node_modules/sql.js/dist/`
     (`sql-wasm.js`, `sql-wasm.wasm`) to `fe/public/vendor/sqljs/`.
   - `fe/public/vendor/` and `fe/public/proofdb.db` are gitignored
     (no generated files in Git, per convention).
   - `npm start` runs `node fe/server.mjs` after the two sync scripts
     (npm `prestart` or a `start` shell line).
4. **Load + version-stamp gate (§8.1).** New client code, ES modules:
   - `fe/public/js/db.js`: fetch `proofdb.db` → `sql-wasm.js` → open
     read-only; table census (sqlite_master); helpers: meta read,
     `SELECT id, parent_id, ply, move_uci, outcome, depth_bound,
     depth_status, provenance FROM nodes ORDER BY id` (whole-table, it is
     3.2 MB). Never read `censor` (D2/D6, §2.1 — tolerate unknown tables).
   - `fe/public/js/gates.js`: gate 1 (schema_version ∈ {1, 2} — 2 is this
     delivery; `node_count` == `COUNT(*)`; surface `built_from`) and gate
     2 structural invariants over the in-memory rows:
     a. proven non-terminal OR-node (`outcome='win'`, `depth_bound>0`):
        exactly one `'loss'` child and `depth_bound = child.depth_bound + 1`;
     b. proven non-terminal AND-node (`outcome='loss'`, `depth_bound>0`):
        `depth_bound = max(child.depth_bound) + 1` over all children;
     c. terminal (`outcome NOT NULL AND depth_bound = 0`): no children rows;
     d. `depth_status` NULL iff `outcome` NULL;
     e. id prefix ordering: `child.id > parent.id` and `child.ply =
        parent.ply + 1` for every row with `parent_id NOT NULL`;
     f. child `parent_id` equality for every `parent_id` reference.
     Each check counts violations; any violation is a **blocking** error
     page (this is the load gate, not a warning).
5. **Boot UI (look preserved, D4).** Keep `index.html`'s header + layout;
   the board area initially shows the gate/boot status: progress, then the
   version-stamp panel — `built_from`, node census (win/loss/open),
   terminal count, max ply, shard count, file sha256 — and the gate
   summary (checks a–f, each `pass` with violation counts). Fail states
   render the blocking error page. Replace `app.js` with the new module
   boot (`js/app.js`); the old fetch-API `app.js` content goes away.
6. **Absence discipline review (§8.4)** — this session ships no UI that
   renders children; confirm no code reads `censor` and nothing writes to
   the DB (read-only URI where applicable).
7. **Docs.** Rewrite `AGENTS.md` for the new architecture (this is now the
   truthful shape of the repo): overview = static proofdb browser, no
   Podman/PostgreSQL; build/run = `make fe_run` (`cd fe && npm install &&
   npm start`); key files; the delivery at `data/proofdb/proofdb.db` +
   `fe/delivery.json` gate; sql.js + (pending) engine vendoring; the
   redesign pointer to `docs/plans/redesign/` with the plans, DECISIONS.md
   and handoff docs. Minimal `README.md` update (remove old db claims,
   keep build/run instructions).

## Acceptance criteria

- `npm start` serves `http://localhost:7000`; page loads the DB, shows the
  gate summary with all structural checks `pass` and the version stamp
  matching HANDOFF.
- Old implementation fully gone: no `db/`, no `bin-loader.mjs`, no
  express/pg/chessops deps, no db Makefile targets; `rg 'proof_tree|podman|postgres|pg\b|chessops|bin-loader'` (case-insensitive) finds no live references.
- `git status` clean of generated files; `.gitignore` updated
  (`data/`, `fe/public/vendor/`, `fe/public/proofdb.db`).

## Finish checklist

- Write `docs/plans/redesign/report1.md`: what changed (incl. deletions),
  gate results (census + violation counts = 0 expected), how to run,
  deviations from this plan, open items for plan2.
- Update `AGENTS.md` / `README.md` if they drifted beyond step 7.
