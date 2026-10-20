# plan5 — Handoff update uptake: 2026-10-20 delivery, relaxed OR-node proofs, fold-digest stamp

**Session scope:** single session. Ends with `docs/plans/redesign/report5.md`.
**Contract:** the updated handoff docs at commit `d882e4f` —
`global_proof_store.md` (§2.2 fold digest, §4 invariants 2 & 4 & 7, §5
shard transport, §6 source of truth), `BROWSER_BRIEF.md` (§5 stamp, §8.2
structural checks), `HANDOFF.md` (2026-10-20 stamp). D1–D6 unchanged.
**Preconditions:** plan1–plan4 done (reports 1–4 on record; the redesign
itself is complete). This is a **new-scope** session triggered by the
provider's handoff update (see `docs/notes.md`).

## What changed in the handoff (and what it implies)

The provider re-cut the delivery on 2026-10-20 and updated the handoff
docs. The tree content is **byte-identical** to the 2026-10-16 delivery
(`nodes`, `censor`, `shards` rows unchanged; only `built_from` and the
file bytes changed — the producer migrated its standing layer to the v2
source-of-truth model). Four changes are consumer-relevant:

1. **New delivery stamp.** `sha256(proofdb.db) =
   375a2b1fc8a2959e3d60aa6737ba6b479988f23de3e953a3233fbae72b69f430`,
   `built_from =
   47b25861d0f56776e04dc534cd8c781fdc45e180a54898e179264fbc6c3c5d72`.
   Census is unchanged (43,092 nodes: 21,514 win + 21,514 loss, 64 open;
   20,220 terminals; max ply 22; 405 shards) — verified by SQL against
   the delivered file, which is already in place at
   `data/proofdb/proofdb.db` with the matching sha256.
2. **OR-node proof structure relaxed (spec §4 invariant 2, brief §8.2).**
   An OR-node now stores **at least one** proven `'loss'` child
   (additional proven-loss children are permitted — annotations from
   merged alternatives), and depth monotonicity becomes
   `depth_bound = min(child.depth_bound) + 1` over the proven-loss
   children (was: exactly one child, `child.depth_bound + 1`).
   The current DB happens to contain zero OR-nodes with more than one
   loss child (verified), so today's gates still pass — but the shipped
   checks would **falsely fail any future delivery** that stores extra
   proven-loss lines. Both gate 2 check (a) and gate 3 check (c) in
   `fe/public/js/gates.js` hard-code "exactly one".
3. **`built_from` is now a fold digest (spec §2.2).** It is the SHA-256
   over the sorted lines `"<tag> <sha256>\n"` where tag/sha256 are the
   `shards`-table rows — i.e. **internally verifiable from the DB
   alone**. Verified externally: computing the digest over the 405
   `shards` rows of the delivered DB yields exactly `47b25861…`. This
   adds a cheap new integrity check for the browser gate (web platform
   `crypto.subtle.digest('SHA-256', …)`).
4. **Invariant 7 renamed "Determinism" → "Row identity".** Ids are
   stable surrogate keys; node identity is the path; a fold preserves
   existing ids forever and appends new ones past `max(id)`; path-order
   id assignment only holds at fresh-DB initialization. The site's gate 2
   check (e) (`child.id > parent.id`, `child.ply = parent.ply + 1`)
   remains valid under the fold model — a graft's parent must already
   exist in the standing tree before the child is appended — but its
   comment/label cite the old determinism rationale and should follow
   the new wording.

Explicitly **unaffected** (checked, no changes needed): `nav.js` move
lists (recorded children are rendered by stored fact; multiple loss
children would simply appear as more loss-labelled rows), the facts
panel and provenance chips, `views.js` (`ORDER BY ply, id` is ordering
only, no identity semantics), `engine/`, the censor/absence discipline,
and the schema-version gate (v2 unchanged). The principal-line renderer
remains unimplemented future work; its brief description changed
("minimum-depth proven-loss child if several are stored") and should be
quoted when that future work is ever taken up — nothing to do now.

## Goal

Take up the 2026-10-20 delivery, align the load gates with the relaxed
OR-node contract, add the fold-digest verification of `built_from`, and
update the repo docs so they state the current delivery truthfully.

## Steps

1. **Delivery uptake (`fe/delivery.json`).** The new file is already at
   `data/proofdb/proofdb.db`. Verify `sha256sum` matches the brief §5
   (`375a2b1f…`) and the census via SQL (43,092 / 21,514 / 21,514 / 64;
   20,220 terminals; max ply 22; 405 shards; `built_from 47b25861…`).
   Then update `fe/delivery.json`: `file_sha256` → `375a2b1f…`,
   `built_from` → `47b25861…`, description → 2026-10-20 delivery. All
   census fields keep their values (they are unchanged). Run
   `node fe/sync-db.mjs` — must report the delivery verified.
2. **Gate 2 check (a) — relaxed OR-node monotonicity (`gates.js`).**
   Replace "exactly one `'loss'` child" with:
   - at least one `'loss'` child (0 loss children is a violation, more
     than one is fine);
   - `depth_bound = min(lossChildren.depth_bound) + 1`.
   Update the violation messages (report the loss-child count only when
   it is 0) and the check label to the brief §8.2 wording, e.g.
   `a. proven non-terminal OR-node: ≥1 'loss' child, depth = min(child depth) + 1`.
3. **Gate 3 check (c) — all proven-loss children legal (`gates.js`).**
   Currently only the single loss child is checked. Change to: every
   child with `outcome = 'loss'` and `moveCode != null` must be a legal
   move code in the replayed position (loop over `lossKids` instead of
   asserting `length === 1`). Update the label to
   `c. OR-node proven-loss children are legal moves`. Keep the violation
   message per offending child.
4. **Gate 2 check (e) — re-comment under "Row identity" (`gates.js`).**
   Keep the check unchanged (it still holds: a fold appends children
   after their existing graft parents). Update the comment and label to
   cite spec §4.7 row identity rather than path-order determinism, e.g.
   `e. id chain ordering (child.id > parent.id, ply + 1 — §4.7 row identity)`.
5. **New check — fold-digest verification of `built_from` (spec §2.2).**
   Compute SHA-256 over the sorted lines `"<tag> <sha256>\n"` from the
   `shards` table (utf-8, no trailing extra newline beyond each line's
   `\n`) with `crypto.subtle.digest('SHA-256', …)` and compare to
   `meta.built_from`. Implementation notes:
   - `db.js` gains a cheap read helper (`readShardDigestInput(db)` → the
     sorted `tag sha256\n` lines as a single string; the `shards` table
     is only 405 rows).
   - `app.js`'s boot is already async — compute the digest there
     (keep `runGate1` itself synchronous) and treat a mismatch as a
     gate-1 failure (added to the `censusMismatch` list, blocking),
     e.g. message `built_from 47b25861… != fold digest over shards (375a2b1f…)`.
   - Surface the result in the stamp panel as a row
     (`built_from fold digest over 405 shard rows: verified`).
   - `crypto.subtle` requires a secure context; the site is served over
     `http://localhost`, which counts as secure — note this in
     `report5.md`, and degrade gracefully (skip with a stated caveat in
     the stamp panel) only if `crypto.subtle` is unavailable, never
     silently.
6. **Docs truth pass.**
   - `AGENTS.md` — update the delivery paragraph: current stamp is the
     2026-10-20 re-cut; the replay gate / structural gate / fold-digest
     check sentences reflect the relaxed OR-node contract and the new
     built_from verification. Keep everything else.
   - `docs/plans/redesign/DECISIONS.md` — append a short addendum:
     verified-on-receipt record for the 2026-10-20 delivery (sha256,
     `built_from`, census, fold digest cross-check) superseding the
     2026-10-16 stamp recorded there (keep the old text as history).
   - `docs/notes.md` — leave as-is (the provider's note is the session
     trigger).
   - Do not touch the handoff docs (they are the provider's contract).
7. **Verification.**
   - `make fe_run` → the page shows the version-stamp panel with
     `built_from 47b25861d0f5…`, file sha `375a2b1f…`, the fold-digest
     row `verified`, all structural checks `pass` (0 violations), and
     the replay gate `pass` over all 43,092 nodes (0 violations).
   - `node fe/sync-db.mjs` reports the delivery verified.
   - Spot-check a proven win node in the UI (facts panel + move list)
     to confirm no rendering regression from the gate changes.
   - Acceptance sweep: `rg -i 'proof_tree|podman|postgres|pg\b|chessops|bin-loader'`
     finds no live references outside `docs/plans/redesign/`;
     `git status` clean of generated artifacts.
8. **Write `report5.md`** — what changed, gate diffs before/after,
   verification transcript, and a note that this session was new scope
   on top of the completed redesign (plans 1–4).

## Out of scope

- No UI changes beyond the stamp-panel fold-digest row (D4 look is
  preserved; this is an additive row in an existing panel).
- No principal-line renderer, no shard browser (still future work).
- No engine changes; no DB writes; the `censor` table stays unread.
- No schema-version work (schema stays v2; `ALLOWED_SCHEMA_VERSIONS`
  unchanged).
