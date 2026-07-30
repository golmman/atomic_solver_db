#!/usr/bin/env bash
set -euo pipefail

./build.sh

container_name="atomic_solver_db"
image_name="localhost/atomic_solver_db:latest"

podman run --rm -it \
  --name $container_name \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=proof_db \
  -p 5432:5432 \
  $image_name
