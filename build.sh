#!/usr/bin/env bash
set -euo pipefail

image="localhost/atomic_solver_db:latest"
build_args=(-t "$image")

if [[ "${1:-}" == "--rebuild" ]]; then
  build_args+=(--no-cache --pull)
  podman rmi -f "$image" >/dev/null 2>&1 || true
fi

cp ../atomic_solver/proof_tree.sql .

podman build "${build_args[@]}" .
