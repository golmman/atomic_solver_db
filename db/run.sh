#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_PROOF_TREE="$(cd "$REPO_DIR/.." && pwd)/atomic_solver/proof_tree.bin"
LOCAL_PROOF_TREE="${SCRIPT_DIR}/proof_tree.bin"

# Locate the proof tree binary produced by the atomic_solver build.
if [[ -f "$SOURCE_PROOF_TREE" ]]; then
    cp "$SOURCE_PROOF_TREE" "$LOCAL_PROOF_TREE"
elif [[ ! -f "$LOCAL_PROOF_TREE" ]]; then
    echo "error: proof_tree.bin not found (expected at ${SOURCE_PROOF_TREE} or ${LOCAL_PROOF_TREE})" >&2
    exit 1
fi

# Ensure the container's postgres user can read the mounted file.
chmod a+r "$LOCAL_PROOF_TREE"

container_name="atomic_solver_db"
image_name="localhost/atomic_solver_db:latest"

podman run --rm -it \
  --name $container_name \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=proof_tree \
  -p 5432:5432 \
  -v "${LOCAL_PROOF_TREE}:/proof_tree.bin:Z" \
  $image_name
