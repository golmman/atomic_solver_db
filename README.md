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
`fe/public/vendor/sqljs/` and verifying the delivery — the sha256 of
`data/proofdb/proofdb.db` must match `fe/delivery.json` (hard failure with
instructions otherwise), after which the file is copied to `fe/public/`.

On load, the page enforces a version-stamp gate (schema version, node
census, `built_from`) and structural invariant checks; any violation shows
a blocking error page instead of the data.

## Architecture

- `fe/server.mjs` — plain `node:http` static server, no API endpoints.
- `fe/public/js/db.js` — fetches the DB and opens it read-only with the
  vendored sql.js WASM SQLite.
- `fe/public/js/gates.js` + `fe/public/js/app.js` — load gates and the
  data version-stamp surface.
- `fe/delivery.json` — the recorded delivery stamp.

Board navigation and the node facts panel are planned next — see
`docs/plans/redesign/` (plans, decisions, and the normative data contract
in `docs/plans/redesign/handoff/`).

## License

MIT — see `LICENSE`.
