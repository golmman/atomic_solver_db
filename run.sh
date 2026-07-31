#!/usr/bin/env bash
set -euo pipefail

# Locate the proof tree binary produced by the atomic_solver build.
if [[ -f ../atomic_solver/proof_tree.bin ]]; then
    cp ../atomic_solver/proof_tree.bin ./proof_tree.bin
    chmod a+r ./proof_tree.bin
elif [[ ! -f ./proof_tree.bin ]]; then
    echo "error: proof_tree.bin not found (expected at ../atomic_solver/proof_tree.bin or ./proof_tree.bin)" >&2
    exit 1
fi

# Ensure the container's postgres user can read the mounted file.
chmod a+r ./proof_tree.bin

container_name="atomic_solver_db"
image_name="localhost/atomic_solver_db:latest"

podman run --rm -it \
  --name $container_name \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=proof_tree \
  -p 5432:5432 \
  -v "$(pwd)/proof_tree.bin:/proof_tree.bin:Z" \
  $image_name
