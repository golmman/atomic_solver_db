# AGENTS.md

## Project overview

`atomic_solver_db` is a static, dependency-free proof-line browser over the
startpos proof database of atomic chess (`proofdb.db`, SQLite, schema v2 —
see `docs/plans/redesign/handoff/global_proof_store.md`). The data is a
**partial AND/OR proof tree** rooted at the standard starting position,
keyed by move path; a missing child row means "no recorded fact", and an
open node is *undecided*. All logic runs client-side; the server only
serves static files.

The redesign (planned in `docs/plans/redesign/`) is **complete** — all four
single-session plans are done and each has a `reportN.md`:

- `handoff/` — the data contract: `global_proof_store.md` (normative
  schema-v2 spec), `BROWSER_BRIEF.md`, `HANDOFF.md`.
- `DECISIONS.md` — decisions D1–D6 (D1: Rust/WASM engine of
  `atomic-movegen` 2.3, built as the `engine/` crate; D2 sql.js; D3
  static server; D4 preserved look; D5 delivery gate; D6 absence
  semantics).
- `plan1.md` … `plan4.md` + `report1.md` … `report4.md` — plans and their
  session reports. Read the latest report (`report4.md`) for the state of
  the shipped site. Nothing further is planned; treat new work as new
  scope.

## Rules engine (D1)

`engine/` is a thin wasm-bindgen wrapper (~200 lines) over
`atomic-movegen` 2.3 — the producer's rules crate, pinned `=2.3.0`. The
16-bit `move_code` encoding in `nodes.move_code` is exactly this crate's
`Move` u16 layout, so the replay gate can compare stored codes bit-exactly.

Build prerequisites:

- `cargo` (any recent stable) and the `wasm32-unknown-unknown` target
  (`rustup target add wasm32-unknown-unknown`).
- `wasm-bindgen-cli` **0.2.129** — must match the `wasm-bindgen` crate
  version pinned in `engine/Cargo.toml`.

Build: `sh engine/build.sh` → compiles to wasm32-unknown-unknown and
runs wasm-bindgen with `--target web`, vendoring the ES-module glue into
`fe/public/vendor/engine/` (gitignored build artifact). `npm start`
(`fe/sync-engine.mjs`) runs the build only when the vendor output is
missing; cargo absence is a hard error with the build command, never a
silent skip.

## Build and run

- `make fe_run` — equivalently `cd fe && npm install && npm start`.
- Site: `http://localhost:7000` (override with `PORT`/`HOST`).
- `npm start` first runs the sync steps:
  - `sync-vendor.mjs` copies sql.js dist files to `fe/public/vendor/sqljs/`.
  - `sync-db.mjs` verifies the sha256 of `data/proofdb/proofdb.db`
    against `fe/delivery.json` and copies the file (+ the stamp) to
    `fe/public/`. A mismatch hard-fails with instructions.
  - `sync-engine.mjs` builds the WASM engine when
    `fe/public/vendor/engine/` is missing (see above).

## Data delivery

- The database lives at `data/proofdb/proofdb.db` (gitignored).
- `fe/delivery.json` carries the expected version stamp (file sha256,
  `built_from`, census). A new delivery means deliberately updating that
  file after verifying it against `docs/plans/redesign/handoff/HANDOFF.md`.
- On load, the browser enforces the version-stamp gate (§8.1), the
  structural invariant gate a–f (§8.2), and the replay gate (§8.3):
  a depth-first replay of the whole stored tree from `meta.root_fen`
  through the WASM engine (one apply per edge, one undo per backtrack,
  all 43k+ paths — not a sample), asserting at every node that stored
  child move codes are legal moves with matching UCI, that AND-node
  legal-reply sets equal stored children (invariant 2), that terminal
  claims (`depth_bound = 0`) match the replayed position (invariant 3),
  and that `root_fen` parses. Violations render a blocking error page.
  Terminal semantics follow the producer's atomic-variant convention:
  a stalemate (no legal replies) is a **loss** for the side to move —
  the crates.io `outcome()` helper's stalemate-draw is not the producer
  convention; the proof tree never emits draw nodes.

## Key files

- `fe/server.mjs` — dependency-free static server (no API endpoints).
- `fe/sync-db.mjs`, `fe/sync-vendor.mjs`, `fe/sync-engine.mjs` —
  start-time sync steps.
- `fe/delivery.json` — the delivery stamp the gate compares against.
- `fe/public/js/db.js` — fetch + open the DB with sql.js, read helpers
  (children, per-ply child lookup, shard metadata, view queries).
- `fe/public/js/gates.js` — gate 1 (version stamp), gate 2 (structural
  invariants a–f), gate 3 (replay checks).
- `fe/public/js/engine.js` — browser wrapper over the vendored WASM
  engine (`fe/public/vendor/engine/`, produced by `engine/build.sh`).
- `fe/public/js/nav.js` — board + move navigation and the node facts
  panel: navigation state is the path, positions come from engine replay,
  move lists split into recorded children (status-coloured) and rowless
  legal replies ("unknown"); the facts panel shows outcome/depth/
  terminality/provenance/ply/id/path per node.
- `fe/public/js/views.js` — cheap views (brief §7.4): open frontier and
  shallowest proven wins as link lists that launch navigation.
- `fe/public/js/app.js` — boot: progress, gates, version-stamp panel.
- `fe/public/index.html`, `fe/public/style.css` — look and feel
  (preserved per D4; extended, not restyled).

## Schema summary (schema v2)

- `meta` — key/value: `schema_version`, `root_fen`, `node_count`,
  `built_from` (the data version stamp together with the census).
- `nodes` — one row per position-by-path: `id`, `parent_id`, `ply`,
  `move_uci`, `move_code`, `outcome` (`'win'`/`'loss'`/NULL = open),
  `depth_bound`, `depth_status` (`'exact'`/`'bound'`, NULL iff outcome
  NULL), `provenance` (comma-separated shard tags). Terminality is
  derivable (`outcome NOT NULL AND depth_bound = 0`), never stored.
- `shards` — producer provenance metadata (tag, file, sha256, n_nodes,
  …); used only to back evidence tooltips.
- `censor` — producer scheduling state: never read, never rendered.

## Conventions

- No generated files in Git: `data/`, `fe/public/vendor/`,
  `fe/public/proofdb.db`, `fe/public/delivery.json`,
  `fe/node_modules/`, `fe/package-lock.json` are gitignored.
- Plain ES modules, no build step, no framework.
- The `censor` table is never read and never rendered. The DB is never
  written to (all client access is SELECT-only).
- Missing child rows mean "no recorded fact", never "illegal" or
  "refuted"; open nodes are *undecided*, never "draw" (D6). No UI path
  renders absence as anything other than unknown/undecided.

## Verification

- Start with `make fe_run` and open `http://localhost:7000`: the page must
  show the version-stamp panel matching `HANDOFF.md`, all structural
  checks `pass` (0 violations), and the replay gate `pass` over all
  43,092 nodes (0 violations).
- `node fe/sync-db.mjs` must report the delivery verified.
- Acceptance for redesign sessions: `rg -i 'proof_tree|podman|postgres|pg\b|chessops|bin-loader'`
  finds no live references outside `docs/plans/redesign/`.

## UI architecture

- **State = the path.** The navigation state is the list of UCI moves from
  the root plus the resolved node-id chain (one entry per ply, `null` when
  the path has no row). Node identity is the path: each ply resolves via
  the indexed lookup `SELECT id FROM nodes WHERE parent_id = ? AND
  move_uci = ?` (`db.findChildByMove`); positions are never looked up in
  the DB (it stores no FENs) — the board renders `engine.fen()` of the
  replayed position.
- **Engine board.** One engine board is created over `root_fen` at boot
  and kept for the session; navigation applies/undoes moves on it
  (`engine.apply`/`engine.undo`), reusing the facade the replay gate
  initialised. `nav.navigateToNode(id)` reconstructs a stored node's path
  by walking its parent chain and replays it from the root.
- **Move lists** (right sidebar, two visibly separate groups):
  recorded children (stored rows in id order, labelled with the recorded
  fact — win → `--accent`, loss → `--danger`, open → neutral, labelled
  *undecided*) and legal replies without rows (engine legal set minus the
  recorded set — neutral dashed, labelled *unknown*). Both navigate.
  Beyond a row-free node there are no rows at all, so the recorded group
  is empty there and every legal reply is unknown.
- **Node facts panel** (under the board): prose status line plus
  key/value rows — ply, node id, outcome (side-to-move perspective),
  depth_bound with depth_status (exact = proven minimal, bound = upper
  bound), derivable terminality and its meaning, the full UCI path, and
  provenance shard tags rendered as evidence chips (tooltip from a cheap
  `shards` SELECT, no proof semantics). At the root it also shows
  `root_fen`, `built_from`, and the census. A row-free position shows
  only the "No recorded facts for this position — unknown (not in the
  database)" state.
- **Version stamp in the running UI**: a `#meta-box` under the FEN box
  shows `built_from` (short) + node census at all times; the full stamp +
  gate summary panel sits below it (boot surface).
- **Views** (left sidebar, below history): the open frontier
  (`outcome IS NULL ORDER BY ply, id`, 64 rows) and the shallowest proven
  wins (`min depth_bound` among `'win'`; 20,220 rows, list capped at 50
  with the full count stated). Every entry launches navigation to that
  node's path. Not implemented (recorded future work): principal-line
  renderer and shard browser.
- **History** (left sidebar): path breadcrumb with move-number grouping,
  entries clickable to jump back, `Undo` button; hover arrow and
  last-move highlight on every move button.
