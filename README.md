# atomic_solver_db

A static, dependency-free proof-line browser over the atomic-chess startpos
proof database (`proofdb.db`, SQLite, schema v2). All logic runs in the
browser; the server only serves static files.

## Run

```sh
make fe_run          # cd fe && npm install && npm start
```

Open `http://localhost:7000` (override with `PORT`/`HOST`).

`npm start` first runs the sync steps: vendoring sql.js into
`fe/public/vendor/sqljs/`, verifying the delivery — the sha256 of
`data/proofdb/proofdb.db` must match `fe/delivery.json` (hard failure with
instructions otherwise), after which the file is copied to `fe/public/` —
and building the WASM rules engine if the vendored output is missing (see
below).

On load, the page enforces a version-stamp gate (schema version, node
census, `built_from`), structural invariant checks, and a full replay of
all stored paths with the producer's rules engine; any violation shows a
blocking error page instead of the data.

## Rules engine (Rust → WASM)

The load gate replays all 43k proof-tree paths with the producer's own
rules engine, `atomic-movegen` 2.3 (crates.io), compiled to WASM — no
TypeScript re-implementation of atomic-chess rules.

- Source: `engine/` (a thin wasm-bindgen wrapper, ~200 lines).
- Output: `fe/public/vendor/engine/` (gitignored build artifact).
- Build: `sh engine/build.sh`; prerequisites: `cargo` with the
  `wasm32-unknown-unknown` target and `wasm-bindgen-cli` 0.2.129.
  `npm start` runs the build automatically when the vendor output is
  missing.

## Architecture

- `fe/server.mjs` — plain `node:http` static server, no API endpoints.
- `fe/public/js/db.js` — fetches the DB and opens it read-only with the
  vendored sql.js WASM SQLite.
- `fe/public/js/gates.js` + `fe/public/js/app.js` — load gates (version
  stamp, structural invariants, engine replay) and the data version-stamp
  surface.
- `fe/public/js/engine.js` — browser wrapper over the vendored WASM
  engine.
- `fe/delivery.json` — the recorded delivery stamp.

Board navigation and the node facts panel are planned next — see
`docs/plans/redesign/` (plans, decisions, and the normative data contract
in `docs/plans/redesign/handoff/`).

## License

MIT — see `LICENSE`.
