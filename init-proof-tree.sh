#!/usr/bin/env bash
set -euo pipefail

# This script is run by the postgres container's docker-entrypoint-initdb.d
# mechanism on the first startup. It loads /proof_tree.bin (mounted from the
# host) into the proof_tree database.

: "${POSTGRES_DB:?"POSTGRES_DB is not set"}"
: "${POSTGRES_USER:?"POSTGRES_USER is not set"}"
: "${POSTGRES_PASSWORD:?"POSTGRES_PASSWORD is not set"}"

export PGHOST="${PGHOST:-/var/run/postgresql}"
export PGDATABASE="${POSTGRES_DB}"
export PGUSER="${POSTGRES_USER}"
export PGPASSWORD="${POSTGRES_PASSWORD}"

PROOF_TREE_BIN="${PROOF_TREE_BIN:-/proof_tree.bin}"

if [[ ! -f "$PROOF_TREE_BIN" ]]; then
    echo "error: $PROOF_TREE_BIN not found; make sure the host file is mounted to /proof_tree.bin" >&2
    exit 1
fi

python3 /usr/local/bin/load_proof_tree.py "$PROOF_TREE_BIN"
