# plan2 — Rules engine (WASM) + replay gate

**Session scope:** single session. Ends with `docs/plans/redesign/report2.md`.
**Contract:** `handoff/global_proof_store.md` invariant 1 (replay-verifiable
paths), invariant 2 (AND/OR completeness), §7 (consumer SQL), brief §6/§8.3.
**Decisions:** `docs/plans/redesign/DECISIONS.md` D1 (Rust/WASM of
`atomic-movegen` 2.3, fallback hand-written ABI), D2, D6.

## Goal

Build the WASM rules engine over `atomic-movegen` 2.3.0 (D1) and wire the
replay spot-checks (§8.3) into the load gate, extending plan1's `gates.js`.
No new UI features beyond gate results; board rendering is plan3.

## Preconditions

- plan1 done and `report1.md` present; static site loads, gates pass.
- Toolchain: cargo present with `wasm32-unknown-unknown` target; crates.io
  reachable (verified at decision time).

## Steps

1. **Wrapper crate `engine/`** at repo root (wasm-bindgen route, per D1;
   keep the wrapper under ~300 lines). Export a minimal surface:
   - `engine_new(fen: string) -> BoardId` / `engine_free(id)`;
   - `engine_apply(id, move_u16)` (advance; keep undo states internally
     for a DFS-friendly `engine_undo(id, move_u16)`);
   - `engine_fen(id) -> string`, `engine_hash(id) -> u64`,
     `engine_terminal(id) -> bool`, `engine_outcome(id) -> string | null`;
   - `engine_legal(id) -> array<u16>` (generated legal move codes,
     atomic-movegen `generate_legal`, codes are the producer's 16-bit
     `move_code` layout), `engine_uci(id, u16) -> string`.
   The crate pins `atomic-movegen = "2.3"` and nothing else but
   wasm-bindgen.
2. **Build script `engine/build.sh`** (`set -euo pipefail`): `cargo build
   --release --target wasm32-unknown-unknown`, then `wasm-bindgen-cli` to
   emit ES-module glue into `fe/public/vendor/engine/`. `npm start` runs
   the build only if the vendor output is missing (cargo absent → clear
   error with the build command; no silent skip). Vendor output stays out
   of Git (D1 output policy).
   **Fallback (D1):** if `wasm-bindgen-cli` cannot be installed, switch to
   a raw `cdylib` with a hand-written `extern "C"` ABI; document the
   switch in `report2.md`.
3. **Client wrapper `fe/public/js/engine.js`:** load the vendor glue,
   init, expose replay helpers; allocate/free around the replay walk.
4. **Replay gate (§8.3) in `gates.js`.** Depth-first replay of the whole
   stored tree from `meta.root_fen` (43,092 nodes; one `do_move` per
   edge, undo per backtrack). For every node:
   a. every stored child's `move_code` equals a generated legal move code
      and its `move_uci` equals that move's `to_uci()`;
   b. AND-node (`outcome='loss'`, `depth_bound>0`): the set of generated
      legal replies **equals** the set of stored children (completeness,
      invariant 2 — the oracle for the partial-tree semantics);
   c. OR-node (`outcome='win'`, `depth_bound>0`): its single `'loss'`
      child is a legal move in the replayed position;
   d. terminal (`depth_bound = 0`): `engine_terminal()` is true and
      `engine_outcome()` matches the stored `outcome` (invariant 3);
   e. root parse: `Board::from_fen(meta.root_fen)` succeeds.
   This is engine-verified over **all** paths (D1), not a sample. Counts
   and timing surface in the gate summary; any violation is blocking.
   If full replay proves too slow in practice, degrade to replaying all
   AND-node subtrees plus a 1000-path random OR sample, and record the
   degradation in `report2.md` (target: full).
5. **Keep plan1's UI intact**; add the replay gate results to the gate
   summary panel.
6. **Absence discipline review (§8.4)** — no UI renders children this
   session; confirm no `censor` reads, no DB writes.
7. **Docs.** `AGENTS.md`: engine crate + build prerequisites (cargo,
   wasm32 target, wasm-bindgen-cli), vendored output location,
   `engine/build.sh`, replay-gate semantics. `README.md` touch if needed.

## Acceptance criteria

- `engine/build.sh` produces `fe/public/vendor/engine/*` on a clean
  checkout after `cargo` prerequisites; `npm start` uses it.
- Gate summary shows the replay check `pass` over all 43,092 nodes with
  violation counts 0 (or a recorded, justified degradation).
- No generated files in Git; `engine/` source is in Git, vendor output is
  not.

## Finish checklist

- Write `docs/plans/redesign/report2.md`: engine surface as built, build
  route (wasm-bindgen vs fallback), replay results (counts, timing, any
  degradation), how to run, deviations, open items for plan3.
- Update `AGENTS.md` / `README.md` where drifted.
