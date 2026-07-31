#!/usr/bin/env bash
set -euo pipefail

image_name="localhost/atomic_solver_db:latest"
build_args=(-t "$image_name")

if [[ "${1:-}" == "--rebuild" ]]; then
  build_args+=(--no-cache --pull)
  podman rmi -f "$image_name" >/dev/null 2>&1 || true
fi

podman build "${build_args[@]}" .
