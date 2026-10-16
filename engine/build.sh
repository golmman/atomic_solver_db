#!/usr/bin/env sh
# Build the WASM rules engine (DECISIONS.md D1) and vendor the output into
# fe/public/vendor/engine/. Prerequisites: cargo with the
# wasm32-unknown-unknown target, and wasm-bindgen-cli 0.2.129 (must match
# the wasm-bindgen crate version pinned in Cargo.toml).
#
# Output (gitignored, per D1's build-output policy):
#   fe/public/vendor/engine/atomic_solver_engine.js   ES-module glue
#   fe/public/vendor/engine/atomic_solver_engine_bg.wasm
set -euo pipefail
cd "$(dirname "$0")"

TARGET=wasm32-unknown-unknown
WASM=target/$TARGET/release/atomic_solver_engine.wasm
OUT=../fe/public/vendor/engine

if ! command -v cargo >/dev/null 2>&1; then
    echo "error: cargo not found. Build the engine with:" >&2
    echo "  rustup target add wasm32-unknown-unknown" >&2
    echo "  sh engine/build.sh" >&2
    echo "(see AGENTS.md — Engine build prerequisites)" >&2
    exit 1
fi
rustup target list --installed 2>/dev/null | grep -qx "$TARGET" || {
    echo "error: rust target $TARGET missing. Run: rustup target add $TARGET" >&2
    exit 1
}

cargo build --release --target "$TARGET"

if ! command -v wasm-bindgen >/dev/null 2>&1; then
    echo "error: wasm-bindgen-cli not found (must be 0.2.129, matching the" >&2
    echo "wasm-bindgen crate pinned in engine/Cargo.toml). Install it, e.g.:" >&2
    echo "  cargo install wasm-bindgen-cli --version 0.2.129" >&2
    echo "then re-run: sh engine/build.sh" >&2
    exit 1
fi

mkdir -p "$OUT"
wasm-bindgen --target web --out-dir "$OUT" --out-name atomic_solver_engine "$WASM"

echo "engine vendored: $OUT"
