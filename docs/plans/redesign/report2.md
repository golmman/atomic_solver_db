# report2 — plan2 results

**Date:** 2026-10-16 (single session). **Plan:** `plan2.md`. **Status:** all
steps completed; acceptance criteria met; no degradation — full replay over
all 43,092 paths.

## Engine surface as built (step 1)

`engine/` — crate `atomic-solver-engine`, a **193-line** wasm-bindgen
wrapper over `atomic-movegen = "=2.3.0"` (pinned exact; `wasm-bindgen =
"=0.2.129"` pinned to the vendored CLI). Nothing else is depended on.
Exports:

- `engine_new(fen) -> Result<u32>` / `engine_free(id)` — board registry
  (thread-local `Vec<Option<Engine>>`, freed slots reused).
- `engine_apply(id, move_u16)` / `engine_undo(id, move_u16)` — each apply
  pushes `(move_code, StateInfo)` onto a per-board undo stack; undo pops
  and calls `undo_move`. DFS-friendly: one `do_move` per edge, one
  `undo_move` per backtrack, no re-replay from the root.
- `engine_fen(id) -> String`, `engine_hash(id) -> u64` (Zobrist incl.
  halfmove clock), `engine_terminal(id) -> bool`, `engine_outcome(id) ->
  "win" | "loss" | "draw" | null`.
- `engine_legal(id) -> Vec<u32>` (`generate_legal`, codes as u16 values),
  `engine_uci(id, u16) -> String`, plus `engine_rule50(id)` (diagnostic).

Bit-exactness note: `atomic_movegen::Move` keeps its `u16` private, so the
wrapper converts u16 ↔ `Move` through the public constructors
(`make_move` / `make_promotion` / `make_enpassant` / `make_castling`),
which encode exactly the producer's `move_code` layout
(`to_sq:6 | from_sq:6 | type:2 | promo:2`) — round-trip is bit-exact, and
the replay gate confirms it over every stored code (see below).

## Build route (step 2)

**wasm-bindgen route as planned — no fallback needed.**

- `engine/build.sh` (`set -euo pipefail`): checks cargo + wasm32 target,
  `cargo build --release --target wasm32-unknown-unknown`, then
  `wasm-bindgen --target web` into `fe/public/vendor/engine/`
  (`atomic_solver_engine.js` + `atomic_solver_engine_bg.wasm` + d.ts).
- `wasm-bindgen-cli` was not installed in the session; installed
  **0.2.129** (x86_64-linux-musl release build, runs fine on glibc) to
  match the crate pin exactly. If a session lacks it, `build.sh` fails
  with the install command (`cargo install wasm-bindgen-cli --version
  0.2.129`).
- `fe/sync-engine.mjs` (new step in `npm start`): skips the build when the
  vendor output exists; otherwise runs `sh engine/build.sh`; cargo absence
  → hard error with the build command (no silent skip). Verified by
  removing the vendor dir and re-running: rebuild succeeded.

## Client wrapper + replay gate (steps 3–5)

- `fe/public/js/engine.js`: loads the vendored `--target-web` glue (ES
  module), initialises the WASM, and returns the synchronous facade
  (`new/free/apply/undo/fen/hash/terminal/outcome/legal/uci`) used by the
  gate (and later, board navigation).
- `fe/public/js/gates.js` adds **gate 3 (`runGate3`)**: iterative DFS from
  `meta.root_fen` over the whole stored tree — all 43,092 nodes, one
  engine `apply` per edge and paired `undo` per backtrack, one
  `generate_legal` per node. Checks per §8.3: root parse (e), terminal
  claims vs replayed position (d), stored child `move_code` legality +
  `move_uci` equality (a), OR-node proving-child legality (c), AND-node
  legal-reply set == stored-child set (b, invariant 2 — the partial-tree
  oracle). A child with an illegal `move_code` cannot be replayed past:
  violation recorded, subtree skipped (counted).
- `db.js` `readAllNodes` now also selects `move_code`.
- `app.js`: gate 3 runs after gates 1–2; failure → blocking error page
  (including the engine-unavailable case with build instructions); pass →
  the gate summary gains a "Replay gate (§8.3, engine-verified)" panel
  with per-category pass/violation counts, replayed-node count, timing,
  and skipped-subtree count. Plan1's stamp panel and UI untouched
  otherwise.

## Replay results (the §8.3 finding)

- **Full replay: 43,092 / 43,092 nodes, 43,092 legal-move checks, 0
  skipped subtrees — pass — in ~91–113 ms** (browser 91 ms; Node
  cross-check 106–113 ms). No degradation needed; the "sample" fallback
  was not used.
- Negative tests (in-memory row tampering, restored afterwards) prove the
  gate detects: a flipped terminal outcome (d), an illegal `move_code`
  (a, subtree correctly skipped), and a dropped AND-node child (b, set
  incompleteness).
- **Deviation discovered and adopted: stalemate semantics.** The crates.io
  `outcome()` helper treats "no legal replies" as a stalemate **draw**;
  125 stored terminals (`depth_bound = 0`) are exactly such positions and
  the producer recorded them as **`loss`**. Atomic-chess rules as played
  by the producer (Fairy-Stockfish/Lichess atomic variant) make a
  stalemated side lose, and the proof-tree format never emits draw nodes
  — so the consumer convention encoded in gate d is: *no legal replies ⇒
  side to move loses; commoner extinction ⇒ engine outcome; a rule50
  (≥100) "draw" position may not back a terminal claim*. With that
  convention all 20,220 terminal claims verify. Movegen itself agrees
  bit-exactly everywhere (checks a/b/c: 0 violations over all nodes).
- Zobrist hashes were exercised via the engine smoke test (FEN + hash
  round-trip through apply/undo at startpos); hash equality per node was
  not separately asserted since positions are reproduced by construction
  (the same engine applies exactly the stored codes, and every stored code
  was proven legal, so position identity follows from replay alone).

## Absence discipline review (step 6)

- `rg -in censor` outside `docs/`: only comments stating the table is
  never read; no SQL statement touches it; `readAllNodes` selects only the
  §7 columns (now including `move_code`).
- No DB write path exists anywhere: client issues SELECTs only; sync
  scripts copy files; the engine is loaded from an immutable in-memory
  copy. No code renders children this session (board navigation is
  plan3), so missing children are rendered nowhere.

## Docs (step 7)

- `AGENTS.md`: new "Rules engine (D1)" section (crate, pinning, build
  prerequisites, `engine/build.sh`, vendored output policy, `npm start`
  hook), gate-3 semantics incl. the stalemate-loss convention, updated
  verification checklist, pending moved to plan3/plan4.
- `README.md`: engine section (prerequisites, build command, auto-build)
  and gate-3 mention.

## How to run

```sh
make fe_run    # cd fe && npm install && npm start
# open http://localhost:7000
# rebuild the engine by hand: sh engine/build.sh
```

## Acceptance criteria

- ✅ `engine/build.sh` produces `fe/public/vendor/engine/*`; verified from
  a missing-vendor state via `npm start` (auto-rebuild) and directly.
- ✅ Gate summary shows replay `pass` over all 43,092 nodes, 0 violations,
  0 skipped subtrees, ~91 ms.
- ✅ No generated files in Git: `fe/public/vendor/` and `engine/target/`
  are gitignored; `git add -A -n engine/` stages source only. `engine/`
  source (Cargo.toml, src/lib.rs, build.sh) is untracked-but-addable.

## Deviations from the plan

1. Terminal check (d) uses the stalemate-loses convention described above
   instead of a literal `engine_terminal() && engine_outcome()` match —
   the crates.io helper's stalemate-draw contradicts the producer's
   recorded terminal outcomes (125 nodes); the adopted rule is
   deterministic from the replayed position alone, satisfying invariant 3.
2. `runGate3` counts violations fully and keeps ≤5 samples per category
   (an earlier draft capped the counts themselves — fixed during the
   session).
3. `engine_undo(id, move_u16)` ignores the passed code if the undo stack
   is empty and asserts (debug) code pairing otherwise; the gate always
   calls it in strict apply/undo pairs.

## Open items for plan3

- `engine.js` facade already exposes everything board navigation needs
  (`new`, `apply`, `undo`, `legal`, `fen`, `uci`); plan3 should reuse the
  single boot engine instance rather than re-initialising.
- `app.js` still passes gate data through one boot function (report1
  open item) — the shared proof-store extraction is still pending.
- Minor plan4 leftovers unchanged: unused `#fen-box`/`#meta-box` CSS.
- `docs/plans/fe/prompt.md` (the pre-redesign kickoff prompt) still
  contains the words `proof_tree`/`postgres`; it is historical
  documentation, not a live reference — left in place.
