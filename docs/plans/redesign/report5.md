# report5 — Handoff update uptake: 2026-10-20 delivery, relaxed OR-node proofs, fold-digest stamp

**Session type:** new scope on top of the completed redesign (plans 1–4,
reports 1–4 on record). This session takes up the provider's 2026-10-20
handoff update (commit `d882e4f`); the redesign itself was complete before
it started. All four changes below trace to that handoff update; nothing
else was touched.

## What changed

### 1. Delivery uptake (`fe/delivery.json`)

The 2026-10-20 re-cut is byte-identical in tree content to 2026-10-16
(`nodes`, `censor`, `shards` unchanged) — only `built_from` (now the §2.2
fold digest) and the file bytes changed. Verified on receipt before
touching anything:

- `sha256sum data/proofdb/proofdb.db` →
  `375a2b1fc8a2959e3d60aa6737ba6b479988f23de3e953a3233fbae72b69f430`
  (matches brief §5).
- SQL census against the delivered file: 43,092 nodes (21,514 win /
  21,514 loss / 64 open), 20,220 terminals, max ply 22, 405 shards,
  `meta.built_from = 47b25861d0f5…` — all match.
- Fold-digest cross-check (§2.2): SHA-256 over the sorted
  `"<tag> <sha256>\n"` lines of the 405 `shards` rows yields exactly
  `47b25861d0f56776e04dc534cd8c781fdc45e180a54898e179264fbc6c3c5d72`.
- SQL pre-check of the relaxed invariant: zero proven non-terminal
  OR-nodes have more than one `'loss'` child (so the DB satisfies both
  the old strict check and the new relaxed one).

`fe/delivery.json`: `file_sha256` → `375a2b1f…`, `built_from` →
`47b25861…`, description → 2026-10-20 re-cut; census fields unchanged.
`node fe/sync-db.mjs` reports: `delivery verified (sha256 375a2b1fc8a2…)
and copied to public/`.

### 2. Gate 2 check (a) — relaxed OR-node monotonicity (`fe/public/js/gates.js`)

Before: exactly one `'loss'` child and `depth_bound = child.depth_bound + 1`;
any node with a second stored proven-loss child failed.

After (spec §4.2/§4.4 as relaxed 2026-10-20):

- 0 `'loss'` children → violation (message reports the count only in the
  0 case: `node … (win, depth_bound …): 0 'loss' children`);
- >1 loss children is fine;
- `depth_bound = min(lossChildren.depth_bound) + 1`, with a violation
  message naming the min.

Label: `a. proven non-terminal OR-node: ≥1 'loss' child, depth = min(loss child depth) + 1`.

### 3. Gate 3 check (c) — all proven-loss children legal (`fe/public/js/gates.js`)

Before: only the single loss child (`length === 1`) was checked.

After: every child with `outcome = 'loss'` and `move_code != NULL` must be
a legal move code in the replayed position (loop over `lossKids`, one
violation message per offending child, subtree replay unaffected).
Label: `c. OR-node proven-loss children are legal moves`.

### 4. Gate 2 check (e) — re-commented under "Row identity" (`fe/public/js/gates.js`)

Check logic unchanged (a fold appends new ids past `max(id)`, so a graft's
child is always appended after its existing parent — the ordering still
holds). Comment and label now cite spec §4.7 row identity instead of
path-order determinism:
`e. id chain ordering (child.id > parent.id, ply + 1 — §4.7 row identity)`.

### 5. New check — fold-digest verification of `built_from` (spec §2.2)

- `fe/public/js/db.js` gains `readShardDigestInput(db)` — the sorted
  `"<tag> <sha256>\n"` lines of the `shards` table as one string
  (405 rows, cheap).
- `fe/public/js/app.js` (boot is async; `runGate1` stays synchronous)
  computes `sha256Hex(new TextEncoder().encode(readShardDigestInput(db)))`
  via `crypto.subtle.digest('SHA-256', …)` and compares to
  `meta.built_from`. A mismatch is pushed to the `censusMismatch` list →
  blocking gate-1 failure, message
  `built_from … != fold digest over 405 shard rows (…)`.
- Secure-context note: `crypto.subtle` requires a secure context;
  `http://localhost` counts as one. If `crypto.subtle` is unavailable the
  check is skipped with an explicit caveat row in the stamp panel
  (`not verified — crypto.subtle unavailable (insecure context)`), never
  silently. (In practice the file-sha256 gate already needs
  `crypto.subtle`, so an insecure context fails loudly earlier anyway.)
- Stamp panel gains one row under `shards`:
  `built_from fold digest — over 405 shard rows: verified`.

### 6. Docs truth pass

- `AGENTS.md` — delivery paragraph updated: 2026-10-20 re-cut named with
  both digests; replay-gate sentence states the relaxed OR-node contract
  (≥1 proven-loss child, additional ones permitted); new bullet documents
  the fold-digest verification and the §4.7 re-labelling of gate 2 (e).
  Everything else untouched.
- `docs/plans/redesign/DECISIONS.md` — D5 gains an addendum recording the
  verified-on-receipt facts for 2026-10-20 (sha256, `built_from`, census,
  fold-digest cross-check, relaxed-invariant SQL pre-check), superseding
  the 2026-10-16 stamp which is kept as history.
- `docs/notes.md` and the handoff docs untouched (provider's contract).
- Not implemented (unchanged future work): principal-line renderer and
  shard browser. Note for that future work: its brief description now
  reads "minimum-depth proven-loss child if several are stored".

## Verification transcript

- `node fe/sync-db.mjs` → `delivery verified (sha256 375a2b1fc8a2…) and
  copied to public/`.
- `make fe_run` (fresh `npm install` + full sync chain; the engine was
  rebuilt this session because `fe/public/vendor/engine/` was absent —
  prerequisites installed: `rustup target add wasm32-unknown-unknown`,
  `cargo install wasm-bindgen-cli --version 0.2.129 --locked`, matching
  the `=0.2.129` pin in `engine/Cargo.toml`) → site up on
  `http://localhost:7001`.
- Browser check (Chromium 155 headless via agent-browser):
  - Stamp panel: `built_from 47b25861…`, `file sha256 375a2b1f…`,
    census `43,092 nodes — 21,514 win / 21,514 loss / 64 open`,
    terminals 20,220, max ply 22, shards 405, and the new row
    `built_from fold digest — over 405 shard rows: verified`.
  - Structural gate: a–f all `pass` (0 violations), with the new labels
    for (a) and (e).
  - Replay gate: `pass — 43,092 nodes replayed in 70 ms` (43,092
    legal-move checks), all sub-checks `pass` (0 violations), including
    the relabelled `c. OR-node proven-loss children are legal moves`.
  - Spot-check (no rendering regression): navigated to proven win #4 via
    the shallowest-proven-wins view (`g1f3 a7a5 f3e5 a5a4`): facts panel
    shows ply 4 / id #4 / outcome win / depth ≤ 1 plies (bound) /
    terminal no / path / provenance chip; move list shows the recorded
    child `e5f7 — win · terminal` and the 24 unknown legal replies; then
    into `e5f7` — recorded group empty, all legal replies unknown, as
    designed.
- Acceptance sweep: `rg -i 'proof_tree|podman|postgres|pg\b|chessops|bin-loader'`
  outside `docs/plans/redesign/` matches only `docs/plans/fe/prompt.md` —
  a stale pre-redesign historical prompt doc. **Discrepancy noted:**
  report4 lists it as deleted, but the file is still tracked at
  `docs/plans/fe/prompt.md`. It is not a live reference (it describes the
  abandoned postgres pipeline) and predates this session, so it was left
  untouched here; it should be removed in a future housekeeping pass to
  make the acceptance sweep clean.
- `git status` — only the six deliberately modified source/doc files; no
  generated artifacts (`data/`, `fe/public/vendor/`, `fe/public/proofdb.db`,
  `fe/public/delivery.json` are gitignored and untracked as designed).

## Gate diff summary (before → after)

| Check | Before | After |
| --- | --- | --- |
| Gate 2 (a) | exactly one `'loss'` child; `depth = child + 1` | ≥1 `'loss'` child (0 → violation); `depth = min(loss child depth) + 1` |
| Gate 2 (e) | label cited path-order determinism | label cites §4.7 row identity; logic unchanged |
| Gate 3 (c) | single loss child checked (`length === 1`) | every proven-loss child checked |
| Gate 1 | sha + census vs `delivery.json` | + fold digest over `shards` vs `meta.built_from` (blocking; caveat-only if `crypto.subtle` unavailable) |
