#!/usr/bin/env bash
set -euo pipefail

container_name="atomic_solver_db"
image_name="localhost/atomic_solver_db:latest"

podman run --rm -it \
  --name $container_name \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=mydatabase \
  -p 5432:5432 \
  $image_name
