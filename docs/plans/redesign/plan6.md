# plan6 — Drop-in delivery uptake: remove the `fe/delivery.json` pin

**Session scope:** single session. Ends with `docs/plans/redesign/report6.md`.
**Trigger:** owner decision (see `docs/notes.md`) — new deliveries should be
taken up by simply copying the updated `proofdb.db` over
`data/proofdb/proofdb.db`; no handoff step that edits `fe/delivery.json`.
**Contract:** the handoff docs at `docs/plans/redesign/handoff/` stay the
provider's record (not touched here, see step 6). D1–D4, D6 unchanged;
**D5 is amended** (delivery gate → drop-in uptake, see step 5).
**Preconditions:** plans 1–5 done (reports 1–5 on record). The site is in
the state described by `report5.md` (2026-10-20 delivery, relaxed OR-node
gates, fold-digest verification of `built_from` in place).

## Rationale and the trade-off being accepted

Today two places pin the delivery to a human-verified stamp in
`fe/delivery.json`:

- `fe/sync-db.mjs` — hard-fails `npm start` when the sha256 of
  `data/proofdb/proofdb.db` differs from `delivery.json.file_sha256`.
- `fe/public/js/app.js` — boot fetches `delivery.json` and blocks (error
  page) on any mismatch of file sha256, census fields, or `built_from`.

After this plan a delivery is taken up by copying the file; the load gates
that remain are all **self-describing, DB-only** checks:

- gate 1: `schema_version` ∈ {1, 2}, `meta.node_count` == row count;
- gate 2: structural invariants a–f;
- fold digest (§2.2): `built_from` == SHA-256 over the sorted
  `"<tag> <sha256>\n"` lines of the `shards` table (plan5, via
  `crypto.subtle`; caveat row if unavailable — never silently);
- gate 3: full replay of every stored path through the WASM engine.

**Accepted trade-off (record it in the docs and report):** the pinned
external file sha256 was the only check tying the served file to the
producer's announcement. What remains proves the DB is *internally
consistent and rules-correct* (invariants, fold digest, full replay), but
cannot distinguish a *different, self-consistent* proof tree from the
agreed one. The owner accepts this: the file arrives by a trusted copy
from the producer pipeline, and the fold digest remains a strong content
fingerprint. The live-computed file sha256 stays **displayed** in the
stamp panel (per-delivery provenance, per brief §5) — it is just no
longer compared to anything.

## Steps

1. **`fe/sync-db.mjs` — drop-in copy.** Rewrite: remove the stamp load,
   the sha comparison, and the mismatch instructions. Keep:
   - the hard error when `data/proofdb/proofdb.db` cannot be read
     (unchanged message, minus the HANDOFF/delivery.json references);
   - `mkdir` + `copyFile` of the DB to `fe/public/proofdb.db`.
   Remove the `copyFile` of `delivery.json` to `public/`. New success
   line, e.g. `delivery copied to public/ (sha256 ${actual.slice(0,12)}…)`.
   Header comment: drop-in uptake per D5 as amended (plan6); no stamp.
2. **Delete `fe/delivery.json`** and the stale generated
   `fe/public/delivery.json`; remove the `fe/public/delivery.json` line
   from `.gitignore` (the file no longer exists, generated or otherwise).
3. **`fe/public/js/app.js` — de-pin the boot gate.**
   - Remove the `fetch('delivery.json')` block and the `expected` variable
     entirely (no replacement error page — the stamp is now read from the
     DB, so there is nothing to fetch).
   - Remove the file-sha comparison and error page ("delivery sha256
     mismatch") and all `censusMismatch` comparisons against
     `expected.*` (node_count/win/loss/open/terminals/max_ply/shards/
     built_from). The census, max ply, shard count, `root_fen` and
     `built_from` are read live from the DB already; they are now shown,
     not compared.
   - Keep the fold-digest check exactly as is (blocking on mismatch vs.
     `meta.built_from`; caveat row when `crypto.subtle` is unavailable).
   - `renderStampPanel`: drop the `stamp` parameter — the `built_from`
     row now renders `meta.built_from`; keep `fileSha` as a display-only
     row. Add one row, e.g.
     `stamp source` → `database (self-describing); drop-in uptake, no pinned delivery stamp`
     so the panel remains honest about what is and is not pinned.
   - Update the header comment (boot no longer loads a delivery stamp).
4. **`fe/public/js/gates.js` / `fe/public/js/db.js` — comment truth pass.**
   - `runGate1` comment: `built_from` is verified from the DB alone via
     the fold digest; no file sha is compared anywhere (was: "the file sha
     is checked by the delivery gate in app.js"). Check logic unchanged.
   - `db.js` header: "delivery file" wording → "the proofdb.db delivery"
     (it fetches `proofdb.db` directly; nothing else changes).
5. **Docs truth pass.**
   - `AGENTS.md` — rewrite the "Data delivery" opening: uptake is drop-in
     (copy the new `proofdb.db` over `data/proofdb/proofdb.db`; `npm
     start` copies it to `public/`); `fe/delivery.json` no longer exists;
     the gates are schema/invariants/fold digest/replay; state the
     accepted trade-off sentence (internal consistency proven, external
     pin dropped). Update the "Verification" bullet that says
     `node fe/sync-db.mjs` must report the delivery verified → it now
     reports "copied". Update the key-files list (drop `fe/delivery.json`)
     and the conventions paragraph if it mentions the stamp.
   - `docs/plans/redesign/DECISIONS.md` — append a second addendum under
     D5: delivery gate amended to drop-in uptake (plan6), old text kept
     as history; restate the trade-off in one sentence.
   - Do **not** touch the handoff docs (provider's contract; they
     describe producer-side practice, which is unchanged).
6. **Optional housekeeping (report5 flagged it):** delete the stale
   pre-redesign `docs/plans/fe/prompt.md` so the acceptance sweep is
   clean. If removed, say so in the report; if kept, re-note the
   discrepancy.
7. **Verification.**
   - `make fe_run` → page boots with no `delivery.json` fetch; stamp panel
     shows `built_from 47b25861d0f5…`, live file sha `375a2b1f…` (display
     only), the new `stamp source` row, fold digest `verified`, all
     structural checks `pass` (0 violations), replay gate `pass` over all
     43,092 nodes (0 violations).
   - `node fe/sync-db.mjs` → reports "copied" with the sha.
   - Drop-in rehearsal: `shasum -a 256 data/proofdb/proofdb.db` (record),
     `touch`-free copy test — copy the same file over itself
     (`cp data/proofdb/proofdb.db data/proofdb/proofdb.db`) and re-run
     sync + boot; everything passes without any stamp edit. (A *different*
     delivery cannot be fabricated here; the gate-blocking behaviour of
     gates 1–3 and the fold digest is already covered by reports 1–5.)
   - `rg -n "delivery.json"` → only historical mentions in
     `docs/plans/redesign/plan*/report*` and provider-side handoff text;
     no live code references.
   - Acceptance sweep: `rg -i 'proof_tree|podman|postgres|pg\b|chessops|bin-loader'`
     finds no live references outside `docs/plans/redesign/` (and the
     stale `docs/plans/fe/prompt.md` is gone per step 6).
   - `git status` clean of generated artifacts; `fe/public/proofdb.db`
     still gitignored.
8. **Write `report6.md`** — what changed, the removed gate surface
   (before/after list), the trade-off statement, verification transcript,
   and that this session is new scope on top of plans 1–5.

## Out of scope

- No UI restyle (D4): the only stamp-panel change is the additive
  `stamp source` row and switching `built_from` to its DB value.
- No changes to gate 2 / gate 3 logic, the engine, `nav.js`, `views.js`,
  or the facts panel.
- No schema-version work; `ALLOWED_SCHEMA_VERSIONS` unchanged.
- No re-introduction of a generated stamp (if the owner ever wants the
  external pin back, that is a new plan — the soft-notice middle ground
  discussed before plan6 was *not* chosen).
- The DB is never written to; the `censor` table stays unread.
