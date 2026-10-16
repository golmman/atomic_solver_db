# AGENTS.md

## Project overview

`atomic_solver_db` is a static, dependency-free proof-line browser over the
startpos proof database of atomic chess (`proofdb.db`, SQLite, schema v2 —
see `docs/plans/redesign/handoff/global_proof_store.md`). All logic runs
client-side; the server only serves static files.

A redesign is in progress, planned in `docs/plans/redesign/`:

- `handoff/` — the data contract: `global_proof_store.md` (normative
  schema-v2 spec), `BROWSER_BRIEF.md`, `HANDOFF.md`.
- `DECISIONS.md` — decisions D1–D6 (D1: Rust/WASM engine of
  `atomic-movegen` 2.3, built as the `engine/` crate; D2 sql.js; D3
  static server; D4 preserved look; D5 delivery gate; D6 absence
  semantics).
- `plan1.md` … `plan4.md` — consecutive single-session plans (plan1 done:
  old stack removed, scaffold + load gate; plan2 done: WASM engine +
  replay gate; plan3: board navigation; plan4: node facts panel +
  polish). Each ends with `reportN.md`; read the latest report before
  continuing.

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
- `fe/sync-db.mjs`, `fe/sync-vendor.mjs` — start-time sync steps.
- `fe/delivery.json` — the delivery stamp the gate compares against.
- `fe/public/js/db.js` — fetch + open the DB with sql.js, read helpers.
- `fe/public/js/gates.js` — gate 1 (version stamp), gate 2 (structural
  invariants a–f), gate 3 (replay checks).
- `fe/public/js/engine.js` — browser wrapper over the vendored WASM
  engine (`fe/public/vendor/engine/`, produced by `engine/build.sh`).
- `fe/public/js/app.js` — boot: progress, gates, version-stamp panel.
- `fe/public/index.html`, `fe/public/style.css` — look and feel
  (preserved per D4; extended, not restyled).

## Conventions

- No generated files in Git: `data/`, `fe/public/vendor/`,
  `fe/public/proofdb.db`, `fe/public/delivery.json`,
  `fe/node_modules/`, `fe/package-lock.json` are gitignored.
- Plain ES modules, no build step, no framework.
- The `censor` table (schema v2) is producer scheduling state: never read
  it, never render anything from it. The DB is never written to.
- Missing child rows mean "no recorded fact", never "illegal" or
  "refuted"; open nodes are *undecided*, never "draw" (D6).

## Verification

- Start with `make fe_run` and open `http://localhost:7000`: the page must
  show the version-stamp panel matching `HANDOFF.md`, all structural
  checks `pass` (0 violations), and the replay gate `pass` over all
  43,092 nodes (0 violations).
- `node fe/sync-db.mjs` must report the delivery verified.
- Acceptance for redesign sessions: `rg -i 'proof_tree|podman|postgres|pg\b|chessops|bin-loader'`
  finds no live references outside `docs/plans/redesign/`.

## Pending (plan3/plan4)

Board navigation (plan3) and the node facts panel (plan4) are next; the
rules-engine surface (`fe/public/js/engine.js`) is in place for them.
