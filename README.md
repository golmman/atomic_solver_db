# atomic_solver_db

Loads the `proof_tree.bin` from atomic_solver into a containerized postgres db.

## Build and run

- `make db_build` — build the Podman image (`localhost/atomic_solver_db:latest`).
- `make db_rebuild` — rebuild the image with `--no-cache --pull`.
- `make db_run` — start the PostgreSQL container on `localhost:5432`.
- `make fe_run` — start the frontend on `localhost:7000`.

## Quick query guide

See proof tree meta data:

```sql
SELECT * FROM proof_tree_meta;
```

See all children of root:

```sql
SELECT * FROM proof_tree WHERE parent_id = 0;
```

## Web frontend

A simple web frontend is in `fe/`. Start the database first, then:

```bash
cd fe
npm install
npm start
```

Open `http://localhost:7000` to browse the proof tree from the start position, make moves, undo, and view the current line.
