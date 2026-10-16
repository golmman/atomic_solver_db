# plan3 — Board navigation (look and feel preserved)

**Session scope:** single session. Ends with `docs/plans/redesign/report3.md`.
**Contract:** brief §4 (semantics you must not get wrong), §7 (navigation by
path), global_proof_store §3 (partial tree, open semantics), D4, D6.
**Preconditions:** plan1 + plan2 done; engine available from
`fe/public/vendor/engine/`; `report1.md`/`report2.md` record results.

## Goal

Replace the placeholder board area with real board + move navigation along
the DB, keeping the existing look and feel (D4): three-column layout,
`style.css` palette, unicode pieces, hover arrow, last-move highlight,
`fen-box`, history sidebar with undo. This session's UI is the full
feature "board + move navigation along stored lines" (brief §7.1) with
the §4 discipline baked in (absence + open).

## Steps

1. **Position state from the engine.** Navigation state = current path
   (list of UCI moves) + resolved node-id chain. Resolve per ply with the
   indexed lookup `SELECT id FROM nodes WHERE parent_id = ? AND
   move_uci = ?` — node identity is the path, never a position (§1,
   invariant 6). The board renders `engine_fen()` of the current node —
   positions always come from replay, never from the DB (it stores no FENs).
2. **Board rendering (look preserved).** Port the old `app.js` board code
   (kept semantics: `#board` grid, piece chars, `.last-from`/`.last-to`
   classes, `#arrow` svg on move-button hover, `#fen` text) onto the
   engine FEN. No restyling; only additions this session makes: status
   colors for move buttons (below).
3. **Move list (right sidebar, kept look).** Two visibly separate groups:
   - **Recorded children** — stored rows ordered by id: label the UCI move
     plus its recorded fact (`win`/`loss` + `depth_bound` + exact/bound);
     color: win → `--accent`, loss → `--danger`, open → neutral. Click
     navigates (arrow hover + last-move highlight apply).
   - **Legal replies without rows** — from the engine legal set minus the
     recorded set: plain "unknown" style, clicking navigates too, showing
     the replayed position with the "no recorded facts" state (D6). Per
     §4.1 they are never rendered as refuted or illegal.
   Open nodes are labelled **undecided**; the word "draw" must not appear
   anywhere (§4.2).
4. **History sidebar (left, kept look).** Breadcrumb of the current path
   (move-number grouping as in the old renderer), entries clickable to
   jump back, `Undo` button as before; last-move highlight + arrow
   behavior unchanged.
5. **Interactivity at unrecorded nodes.** Navigating into a no-row node
   shows the engine position with: "no recorded facts for this position"
   (facts panel arrives plan4), empty recorded-children group, the legal
   no-row group continuing from the engine. No "open/undecided" label at
   no-row nodes — unknown is undecided-but-unsearched-free wording: use
   "unknown (not in the database)".
6. **Absence discipline review (§8.4).** Manual gate, session-end: `rg` the
   client code for any rendering of missing children as
   refuted/illegal/draw; list findings in `report3.md`. Re-read brief §4
   before step 3.
7. **Absence of writes.** No code writes to the DB; no `censor` reads.
8. **Docs.** `AGENTS.md`: UI architecture (state = path, per-ply indexed
   resolution, engine FEN, recorded/unknown move groups); pointer to
   `docs/plans/redesign/`. `README.md` touch if needed.

## Acceptance criteria

- Board, move list, history, arrow, undo, and last-move highlight work as
  before (look preserved); move buttons carry outcome colors.
- From the root, the seven recorded children (`g1f3, g1h3, a2a3, a2a4,
  c2c3, e2e3, e2e4`) appear, all `undecided`; legal no-row replies appear
  in the unknown group; clicking an unknown move shows the replayed
  position with the "no recorded facts" state.
- No UI distinguishes "searched budget" from "never searched" (§3, the
  DB does not carry that) and never renders `censor` (§2.1).
- Navigation state survives page reload? (Optional: not required — record
  the choice in `report3.md`.)

## Finish checklist

- Write `docs/plans/redesign/report3.md`: UI implemented (files), the
  recorded/unknown groups as built, absence-discipline review results,
  deviations, open items for plan4.
- Update `AGENTS.md` / `README.md` where drifted.
