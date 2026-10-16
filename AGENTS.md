# AGENTS.md

## Redesign in planning (read this first for orientation)

A redesign of this project is planned in `docs/plans/redesign/`:

- `handoff/BROWSER_BRIEF.md`, `handoff/global_proof_store.md` (normative
  schema-v2 contract), `handoff/HANDOFF.md` — the new data: a SQLite
  delivery at `data/proofdb/proofdb.db` (sha256 and census verified on
  receipt, see `docs/plans/redesign/DECISIONS.md` D5).
- `DECISIONS.md` — rules-engine decision (D1: Rust/WASM of
  `atomic-movegen` 2.3; fallback raw ABI) and secondary decisions D2–D6.
- `plan1.md` … `plan4.md` — consecutive single-session implementation
  plans (cleanup + gates, WASM engine + replay gate, board navigation,
  facts panel + final polish). Each ends with `reportN.md` recording
  results; read the latest report before continuing.

The old stack below (Podman/PostgreSQL, `db/`, `proof_tree.bin`) is
scheduled for removal in plan1. Nothing below is invalid yet — sessions
before plan1 must keep it truthful.

## Project overview

`atomic_solver_db` loads a `proof_tree.bin` (produced by the `atomic_solver` project) into a containerized PostgreSQL database for querying.

## Build and run

- `make db_build` — build the Podman image (`localhost/atomic_solver_db:latest`).
- `make db_rebuild` — rebuild the image with `--no-cache --pull`.
- `make db_run` — start the PostgreSQL container on `localhost:5432`.
- `make fe_run` — start the frontend on `localhost:7000`.

Requires **Podman**. The run script expects `atomic_solver/proof_tree.bin` in the parent directory of this repo; otherwise a local `db/proof_tree.bin` must exist.

## Container details

- Image: `postgres:16` with Python 3 and `python3-psycopg2`.
- Database: `proof_tree`
- User/Password: `admin` / `secret`
- Port: `5432`
- The binary is mounted at `/proof_tree.bin` and loaded on first startup via `/docker-entrypoint-initdb.d/init-proof-tree.sh`.

## Schema

- `proof_tree(id, parent_id, uci_move, depth)` — adjacency table, root has `parent_id = NULL` and `uci_move = NULL`.
- `proof_tree_meta(fen, version, root_outcome, root_depth, node_count)` — single-row metadata.

## Key files

- `db/Dockerfile` — container definition.
- `db/build.sh` / `db/run.sh` — Podman build/run wrappers.
- `db/load_proof_tree.py` — parses `proof_tree.bin` and imports into PostgreSQL.
- `db/proof_tree_dump.md` — `proof_tree.bin` format specification.
- `docs/plans/fe/prompt.md` — rough plan for a future frontend.

## Conventions

- Shell scripts use `set -euo pipefail`.
- Python is plain Python 3 with `psycopg2`; no package manager or test runner is configured yet.
- `db/proof_tree.bin` and `__pycache__` are ignored by Git; do not commit generated binaries.

## Verification

There is no automated test or lint setup. After `make run`, verify the import with:

```sql
SELECT * FROM proof_tree_meta;
SELECT * FROM proof_tree WHERE parent_id = 0;
```

## Frontend

A local web frontend lives in `fe/`.

- Install dependencies: `cd fe && npm install`
- Start the server: `cd fe && npm start`
- Open `http://localhost:7000`

The server connects to PostgreSQL on `localhost:5432` (default database `proof_tree`, user `admin`, password `secret`; override with `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`). If the database is not reachable and `db/proof_tree.bin` exists, it falls back to loading the binary directly (`USE_BIN=1` forces the binary path).
