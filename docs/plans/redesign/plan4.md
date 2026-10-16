# plan4 — Node facts panel, version stamp, final polish

**Session scope:** single session. Ends with `docs/plans/redesign/report4.md`.
**Contract:** brief §5 (version stamp), §7.2 (facts panel), §7.4–7.5
(views/stamp — in scope where cheap), global_proof_store §3 (provenance),
D4, D6.
**Preconditions:** plan1–plan3 done; gate + navigation working; reports
`report1.md`–`report3.md` on record.

## Goal

Complete the third UI tier — the node facts panel — surface the data
version stamp in the running UI, and finish the redesign: full
`AGENTS.md`/`README.md` truth pass and a final dead-file sweep so the
repo ends with no dead files.

## Steps

1. **Node facts panel.** New panel (look preserved; styled like the
   existing `--panel` boxes) showing for the current node:
   - `outcome` (win/loss from the side-to-move perspective, *undecided*
     for `NULL` — never "draw"), `depth_bound` with
     `depth_status` (`exact` = proven minimal / `bound` = upper bound),
   - derivable terminality (`outcome NOT NULL AND depth_bound = 0`) and
     what it means ("rule-terminal: decided statically in this position"),
   - `provenance`: shard tags comma-separated — displayed as evidence,
     no semantics implied (§3; the `shards` table's `tag/file/sha256/…`
     may back a tooltip via a cheap `SELECT ... WHERE tag IN (...)`,
     never as proof semantics),
   - `ply`, node `id`, and the full UCI path (the recursive chain query of
     §7 or from the in-memory node-id chain — pick the cheap one),
   - for the root: `root_fen`, `built_from`, census summary (this is the
     data version stamp, brief §5: always surface `built_from` + census).
   No-row nodes show the "no recorded facts for this position" state only.
2. **Version stamp in the header/meta box.** `built_from` (short) + node
   census near the `fen-box`/`meta-box` area, matching the boot panel
   from plan1 (D4: extend, don't restyle).
3. **Optional cheap views (brief §7.4, only if cheap).** Open frontier
   (`outcome IS NULL ORDER BY ply, id`) and shallowest proven wins
   (`min depth_bound` among `'win'`) as small link lists launching
   navigation. Skip anything needing facts the schema does not carry;
   record skip rationale in `report4.md`. Do **not** implement the
   principal-line renderer or shard browser this session (out of the
   redesign scope; note as future work).
4. **Absence discipline review (§8.4).** Session-end manual gate: no code
   path renders a missing child as anything other than
   unknown/undecided; no "draw" wording; no `censor` reads; no DB
   writes. List findings in `report4.md`.
5. **Dead-file sweep.** The repo should end with no dead files:
   - `docs/plans/fe/prompt.md` — obsolete (describes the postgres
     frontend): delete. `docs/notes.md` — consumed redesign prompt:
     delete. `docs/plans/redesign/handoff/` stays (delivery contract).
     `engine/`, `fe/`, plans, DECISIONS.md, reports stay.
   - Confirm: `rg` for dead references, no orphaned files, `git status`
     clean of generated artifacts, `.gitignore` final.
6. **Final docs pass.**
   - `AGENTS.md` final truth rewrite: overview (static proofdb browser,
     partial AND/OR proof tree, look preserved), build/run
     (`make fe_run`; cargo prerequisites for the engine build from
     plan2), delivery location + `fe/delivery.json` gate, key files
     (fe/public/{js,vendor}, engine/, docs/plans/redesign/), schema
     summary (meta/shards/nodes — censor ignored), conventions
     (read-only, no generated binaries in Git, absence discipline),
     verification (gates pass; census matches `fe/delivery.json`).
   - `README.md` full rewrite to match.

## Acceptance criteria

- Facts panel shows outcome/depth/depth_status/terminality/provenance/
  path for every node type (recorded, open, no-row).
- `built_from` + census are visible in the running UI; gate summary from
  plan1/2 still passes.
- No dead files: old DB implementation gone (plan1), obsolete docs gone
  (step 5), no orphaned code, `.gitignore` final, `git status` clean.
- `AGENTS.md` and `README.md` describe the shipped repo truthfully (a
  fresh session can orient itself from AGENTS.md alone).

## Finish checklist

- Write `docs/plans/redesign/report4.md`: facts panel as built, stamp
  surface, cheap views (done/skipped + rationale), absence-discipline
  findings, dead-file sweep results, final verification, redesign done —
  nothing further planned.
- Update `AGENTS.md` / `README.md` (step 6 is the final pass).
