# report4 — plan4 results (redesign complete)

**Date:** 2026-10-17 (single session). **Plan:** `plan4.md`. **Status:** all
steps completed; acceptance criteria met; gates unchanged and passing
(version stamp, structural §8.2 all a–f, full replay §8.3 over all 43,092
nodes, 0 violations). **The redesign is complete — nothing further is
planned.**

## What was built

- **Node facts panel (step 1)** — `renderFacts()` in `fe/public/js/nav.js`
  replaces plan3's minimal status line in the same `#node-status` box
  (existing meta-box look, CSS extended only). Per node it shows:
  - the prose status line (as in plan3: `Undecided — …` / `Proven: win
    within ≤ d plies (exact|bound)` / `Proven: … — terminal`);
  - key/value rows: `ply`, `node id`, `outcome` (`win — the side to move
    wins` / `loss — …` / `undecided (open)` — NULL is never rendered as
    "draw"), `depth` (`≤ d plies (exact — proven minimal)` / `(bound —
    upper bound)` / `0 plies — terminal` / `—` for open), `terminal`
    (derivable per spec §3: `outcome NOT NULL AND depth_bound = 0` →
    "yes — rule-terminal: decided statically in this position"), and the
    full UCI `path` (from the in-memory path — no recursive-chain query
    needed; the cheap option, as the plan allows);
  - `provenance`: the comma-separated shard tags rendered as evidence
    chips (spec §3: evidence only, no proof semantics); each chip's
    tooltip comes from a cheap batched `SELECT tag, file, n_nodes FROM
    shards WHERE tag IN (…)` (chunked at 100, cached per tag).
  - At the root the panel additionally shows `root_fen`, `built_from`
    (full) and the census summary (the data version stamp, brief §5).
  - A row-free position shows **only** the "No recorded facts for this
    position — unknown (not in the database)" state, per plan.
- **Version stamp in the running UI (step 2)** — a `#meta-box` under the
  FEN box (the previously unused CSS block is now live) always shows
  `built_from` (short, full value in the tooltip) and the node census —
  matching the boot panel's styling (D4: extend, not restyle).
- **Cheap views (step 3, done)** — new `fe/public/js/views.js` renders two
  link lists in a new `#views-panel` section of the left sidebar:
  - *Open frontier* — `SELECT id, ply FROM nodes WHERE outcome IS NULL
    ORDER BY ply, id` (64 rows) — all of them shown.
  - *Shallowest proven wins* — the spec §7 query (min `depth_bound` among
    `'win'`) matches **20,220 rows**, far more than a "small link list";
    the list is capped at the first 50 (ordered by ply, id) with the full
    count stated alongside. Cap rationale recorded here per the plan's
    instruction.
  - Each entry is a button that calls `nav.navigateToNode(id)`: the node's
    UCI path is reconstructed by walking the parent chain (≤ ply indexed
    lookups via the new `db.readNodeById`; all ancestors of a stored row
    are stored), the board is rewound to the root and the path replayed
    with the per-ply `(parent_id, move_uci)` lookup. A lazy `title`
    tooltip shows the entry's full path. Both views list stored rows only
    (open = undecided); no facts are inferred from absent rows.
- **Absence discipline review (step 4)** — see below.
- **Dead-file sweep (step 5)** — `docs/plans/fe/prompt.md` (obsolete
  postgres-frontend prompt) and `docs/notes.md` (consumed redesign prompt)
  deleted (`git rm`); the now-empty `docs/plans/fe/` removed. Kept:
  `docs/plans/redesign/` (contract + plans + reports), `engine/`, `fe/`,
  `DECISIONS.md`. `git status` shows only the intended session changes; no
  generated artifacts are tracked (`.gitignore` unchanged — it already
  covers `data/`, `fe/public/vendor/`, `fe/public/proofdb.db`,
  `fe/public/delivery.json`, `fe/node_modules/`, `fe/package-lock.json`,
  `engine/target/`). A stray untracked file (`--full-page`, accidentally
  created by a screenshot command during verification) was deleted.
- **Final docs pass (step 6)** — `AGENTS.md` and `README.md` fully
  rewritten to describe the shipped repo: overview (static browser over a
  partial AND/OR proof tree), engine build prerequisites, build/run,
  delivery + gate, key files (incl. `views.js`, `sync-engine.mjs`),
  schema summary (meta/shards/nodes, censor ignored), conventions
  (read-only, no generated binaries, absence discipline), verification,
  and the full UI architecture (plan3 + plan4). "Pending" section removed —
  nothing is pending.

## File changes

- `fe/public/js/nav.js` — facts panel (`renderFacts`, `factsRow`,
  `outcomeText`, `depthText`, `terminalText`), shard-tooltip cache +
  `fillShardInfo`, `renderMetaBox`, `navigateToNode`; `initNav` takes the
  stamp (`builtFrom`, census).
- `fe/public/js/db.js` — added `readShardInfo` (batched, chunked),
  `readNodeById`, `readViews`; still SELECT-only.
- `fe/public/js/views.js` — new (~70 lines).
- `fe/public/js/app.js` — passes the stamp to `initNav`, wires
  `initViews`.
- `fe/public/index.html` — `#views-panel` section; `#meta-box` div.
- `fe/public/style.css` — additions only: `.facts-row/.facts-key/
  .facts-value/.facts-prov/.prov-tag`, `#views-panel` + view-list styles,
  updated one stale comment. Nothing existing restyled (D4).
- `AGENTS.md`, `README.md` — rewritten.
- Deleted: `docs/notes.md`, `docs/plans/fe/prompt.md`.

## Absence discipline review (§8.4 findings)

`rg -in "draw|refut|illegal|censor"` over `fe/public/js/` +
`fe/public/index.html` finds only:

- comments stating the discipline itself (nav.js, views.js, db.js);
- gate-internal violation-category names in `gates.js` (`illegalMove`,
  `orIllegalProof`) and the stalemate-convention comment — never rendered
  as move states;
- `engine.js`'s comment documenting the engine's own `'draw'` outcome
  value (used only inside gate 3's terminal check, which overrides the
  stalemate-draw per the producer convention).

User-visible strings: "undecided", "unknown", "unknown (not in the
database)", "Proven: …", "No recorded facts for this position", "No legal
moves in this position." No "draw"; no refuted/illegal rendering of
missing children; no searched-vs-unsearched distinction (the DB does not
carry it). The new views render stored open rows as "open frontier"
entries and never claim anything about unrecorded lines. **No code reads
`censor`** (only never-read comments mention it) and **no code writes to
the DB** — every query in `db.js` is a SELECT; the engine operates on an
in-memory copy.

## Deviations from the plan

1. **Shallowest-proven-wins list capped at 50** (of 20,220 rows): the
   plan says "small link lists"; rendering 20k buttons is neither small
   nor cheap in DOM terms. The full count is always displayed, the order
   is the spec's (ply, id), and the cap is stated in the UI and here.
2. The root's facts-panel stamp rows duplicate the persistent `#meta-box`
   by design: step 1 asks for root extras in the panel, step 2 for an
   always-visible stamp near the fen box — both implemented as written.
3. View-entry labels show `ply N — #id` (with the full UCI path in the
   hover tooltip) rather than rendering each entry's whole path inline —
   same information, readable list.

## Not implemented (out of redesign scope, recorded as future work)

- Principal-line renderer (brief §7.3) and shard/provenance browser
  (§7.4) — explicitly excluded by plan4.
- Path persistence across reload (hash/URL encoding) — plan3's optional
  leftover; state = the path makes it a pure additive change.

## Verification performed

- Fresh boot at `http://localhost:7000`: version-stamp panel matches
  `HANDOFF.md` (built_from `70a160a6…`, sha256 `02fc7d60…`, census
  43,092 / 21,514 / 21,514 / 64, 20,220 terminals, max ply 22, 405
  shards); structural gate a–f all `pass`; replay gate `pass — 43,092
  nodes replayed in 106 ms`.
- Facts panel at every node type: root (ply 0, id #0, undecided,
  provenance chips + root extras `root_fen`/`built_from`/`census`);
  recorded open (`e2e4`, id #41971); proven bound (`a7a5` win ≤ 5 at
  most; `d1h5` loss ≤ 4); AND-node (`d1h5` position, 18 recorded replies);
  rule-terminal (`h5f7`: depth `0 plies — terminal`, terminality "yes —
  rule-terminal: decided statically in this position"); row-free unknown
  (`b2b3` → absence message only).
- Provenance tooltip verified: chip title `h_01019f948815ddc8 —
  h_01019f948815ddc8.bin (1002 nodes)`.
- Meta box: `built_from 70a160a65c9b…` + `census 43,092 nodes (21,514 win
  / 21,514 loss / 64 open)` visible at all times.
- Views: open frontier shows all 64 rows (ply 0–6); shallowest wins shows
  20,220 total with first 50 links; clicking `ply 4 — #4` from a row-free
  ply-1 position correctly rewound and replayed `g1f3 a7a5 f3e5 a5a4`
  (win ≤ 1); clicking a frontier entry landed on an undecided ply-5 node.
- `node fe/sync-db.mjs` reports the delivery verified (unchanged).
- Acceptance `rg`: no live `proof_tree|podman|postgres|pg|chessops|
  bin-loader` references outside `docs/plans/redesign/`.
- `git status` clean of generated artifacts; only the intended session
  changes.

## Redesign status

All four plans are executed (plan1–plan4, reports 1–4). The shipped site
is the complete redesign scope: load gates, engine-verified replay, board
navigation, node facts panel, version-stamp surface, cheap views, dead
files removed, docs truthful. Nothing further is planned.
