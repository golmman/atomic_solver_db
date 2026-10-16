# report3 — plan3 results

**Date:** 2026-10-17 (single session). **Plan:** `plan3.md`. **Status:** all
steps completed; acceptance criteria met; gates unchanged and passing
(version stamp, structural §8.2, full replay §8.3 over all 43,092 nodes).

## What was built (steps 1–5)

- **`fe/public/js/nav.js` (new, ~370 lines)** — board + move navigation
  module, `initNav({ db, engine, rootFen, root })` called by `app.js` after
  all gates pass:
  - **State = the path** (step 1): `state.path` (list of `{ uci, code }`)
    plus the resolved node-id chain `state.ids` (`null` entries for paths
    without a row). Each ply resolves with the indexed lookup
    `SELECT id FROM nodes WHERE parent_id = ? AND move_uci = ?`
    (`db.findChildByMove`, added to `db.js`); children of a node come from
    `SELECT … WHERE parent_id = ? ORDER BY id` (`db.readChildren`, added).
    The board renders `engine.fen()` only — the DB stores no FENs and is
    never asked for a position.
  - One engine board is created over `root_fen` at boot and kept for the
    session; navigation is `engine.apply` on descend, paired
    `engine.undo` on backtrack (the facade the replay gate initialised is
    reused — report2 open item honoured). Verified: after navigating a
    4-ply chain of *unknown* (rowless) moves and undoing everything, the
    board's Zobrist hash is bit-identical to a freshly parsed root
    (`6537059646018418590`).
  - **Board rendering (step 2)** — the pre-redesign renderer ported
    essentially verbatim from `git show 7ab9486:fe/public/app.js`:
    `#board` grid, unicode `pieceChars`, `.last-from`/`.last-to`
    highlight, `#arrow` svg (marker + line, computed from bounding
    rects) on move-button hover, `#fen` text. Look untouched; the only
    CSS additions are the move-status colors and the two group
    subheadings (below).
  - **Move list (step 3)** — two visibly separate groups in the right
    sidebar under "Available moves":
    - *Recorded children* — stored rows in id order, label
      `uci — <fact>`: `win · ≤ d plies (at most)` / `win · ≤ d plies
      (exact)` rendered as "exact"/"at most", `outcome · terminal` for
      `depth_bound = 0`, `undecided` for open rows. Colors (plan3's only
      visual addition): win → `--accent`, loss → `--danger`, open →
      neutral. Clicking navigates; arrow hover + last-move highlight
      apply.
    - *Legal replies without records* — engine legal set minus the
      recorded move-code set, label `uci — unknown`, neutral dashed
      style. Clicking navigates into the replayed position; the word
      "refuted"/"illegal" appears nowhere. Beyond a row-free node there
      are no rows at all (child rows reference existing parents), so the
      recorded group is empty there and every legal reply is unknown.
  - **History sidebar (step 4)** — breadcrumb with the old move-number
    grouping (`1. e2e4 c7c6` / `2. a2a3 …`), every half-move (and the
    "Start position" entry) clickable to jump back, `Undo` button as
    before (disabled at the root).
  - **No-row nodes (step 5)** — navigating into a path without a row
    shows the engine-replayed position with the status line "No recorded
    facts for this position — unknown (not in the database)." and an
    empty recorded group; no "undecided" label is shown there. Deeper
    navigation continues from the engine (all further positions
    row-free). A minimal status line also renders for recorded nodes:
    `Undecided — …` / `Proven: win within ≤ d plies (exact|at most)` /
    `Proven: loss — terminal (…)`. The full facts panel remains plan4.
- **`fe/public/index.html`** — board area markup restored (board wrapper,
  arrow svg, fen box) around the retained gate panel; the moves sidebar
  gained the two group subheadings; a `#node-status` box sits between
  board and fen box.
- **`fe/public/style.css`** — additions only: `.move-win/.move-loss/
  .move-open/.move-unknown` button colors, `#moves-panel h3` group
  subheadings, `#unknown-moves` list styles, `#node-status` box (shares
  the existing meta-box look), clickable `#history .hist-move` spans.
  Nothing existing was restyled (D4).
- **`fe/public/js/app.js`** — after the gates pass, resolves the root row
  and calls `initNav` (failure → the same blocking error page treatment).
  The gate-3 `engine` variable was hoisted so the facade can be reused.
- **`fe/public/js/db.js`** — added `findChildByMove(db, parentId, uci)`
  and `readChildren(db, nodeId)`; no other changes, still SELECT-only.

## Absence discipline review (step 6)

Brief §4 re-read before step 3, as instructed. `rg -in
"draw|refut|illegal|censor"` over `fe/public/js/` + `fe/public/index.html`
finds only:

- comments stating the discipline itself (nav.js, db.js);
- gate-internal violation-category names in `gates.js` (`illegalMove`,
  `orIllegalProof`) and the stalemate-convention comment — never rendered
  as move-button states;
- `engine.js`'s comment documenting the engine's own `'draw'` outcome
  value (used only inside gate 3's terminal check, which overrides the
  stalemate-draw per the producer convention; no UI path reads it).

User-visible strings in the UI: "undecided", "unknown", "unknown (not in
the database)", "Proven: …", "No recorded facts for this position", "No
legal moves in this position." No "draw", no refuted/illegal rendering of
missing children, no searched-vs-unsearched distinction (the DB does not
carry it).

## Absence of writes (step 7)

No code writes to the DB: the client issues SELECTs only (`findChildByMove`,
`readChildren`, and the pre-existing reads); the engine operates on an
in-memory copy. No `censor` read or render anywhere (`rg` confirms: only
never-read comments).

## Docs (step 8)

- `AGENTS.md`: new "UI architecture (plan3)" section (state = path,
  per-ply indexed resolution, engine FEN, recorded/unknown move groups,
  no-row wording); "Pending" updated to plan4 only.
- `README.md`: architecture list gains `nav.js`; the closing pointer now
  says board navigation is implemented, facts panel next.

## Verification performed

- Fresh boot at `http://localhost:7000`: version-stamp panel matches
  `HANDOFF.md` (built_from `70a160a6…`, sha256 `02fc7d60…`, census
  43,092 / 21,514 / 21,514 / 64, 20,220 terminals, max ply 22, 405
  shards); structural gate all `pass`; replay gate `pass — 43,092 nodes
  replayed`.
- Root state: 7 recorded children (`g1f3, g1h3, a2a3, a2a4, c2c3, e2e3,
  e2e4`), all labelled `undecided`; 13 unknown buttons (20 legal total);
  startpos FEN + board.
- Navigation: recorded e2e4 → its open node renders 13 recorded
  (`win · ≤ d plies`) + 7 unknown; unknown c7c6 → "no recorded facts"
  state, empty recorded group, all legal replies unknown; deeper unknown
  chain (d7d5) stays row-free; proven line e2e4 → a7a5 (`win ≤ 5, at
  most`) → single proving child d1h5 (`loss ≤ 4`) → AND-node with all 18
  legal replies recorded, 0 unknown → e7e5 (`win ≤ 1`) → h5f7 `loss ·
  terminal` → "No legal moves in this position." with both groups empty.
- History: click-to-jump-back at every depth (including landing on a
  row-free node), `Undo` steps back one ply and disables at root;
  last-move highlight (`.last-from` h5 / `.last-to` f7) and hover arrow
  (show/hide + positioned line) verified.
- `node fe/sync-db.mjs` still reports the delivery verified (unchanged).

## Deviations from the plan

1. **Navigation state survives page reload: not implemented** (the plan
   marks it optional). Recorded as the deliberate choice: single-session
   scope kept the surface minimal; the state is the path, so a future
   hash/URL encoding is a pure additive change left for plan4 polish.
2. The move-button fact label renders `depth_status` as
   "exact"/"at most" (`win · ≤ 5 plies (at most)`) rather than the raw
   token `bound` — same semantics (§3: a bound is an upper bound), more
   readable; `terminal` replaces `≤ 0 plies` for `depth_bound = 0`.
3. The status line for recorded nodes (plan3 step 5's minimal state
   display) was placed in a dedicated `#node-status` box under the board
   reusing the existing `#meta-box` styling (that CSS block, previously
   unused, is now live). Plan4's facts panel can absorb or extend it.

## Open items for plan4

- Node facts panel: outcome, depth_bound, depth_status, terminality,
  provenance (render provenance tags as "evidence", no semantics) — the
  `#node-status` box is the natural anchor.
- Optional: path persistence across reload (hash/URL), now that state =
  path makes it trivial.
- Unused `#meta-box` CSS is now in use; remaining plan4 leftovers from
  report2 unchanged.
- `docs/plans/fe/prompt.md` still contains historical
  `proof_tree`/`postgres` wording — historical documentation, not a live
  reference (unchanged from report2).

## How to run

```sh
make fe_run    # cd fe && npm install && npm start
# open http://localhost:7000
```
