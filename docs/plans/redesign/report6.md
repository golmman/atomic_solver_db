# report6 — Drop-in delivery uptake: `fe/delivery.json` removed

**Session type:** new scope on top of the completed redesign (plans 1–5,
reports 1–5 on record). Owner decision (`docs/notes.md`): new deliveries
should be taken up by simply copying the updated `proofdb.db` over
`data/proofdb/proofdb.db` — no handoff step that edits a stamp file.
**D5 is amended** (second addendum in `DECISIONS.md`); D1–D4, D6 are
unchanged. The handoff docs were not touched (provider's record).

## What changed

### 1. `fe/sync-db.mjs` — drop-in copy

Rewritten. Removed: the stamp load, the sha256 comparison, the mismatch
instructions, and the `copyFile` of `delivery.json` to `public/`. Kept:
the hard error when `data/proofdb/proofdb.db` cannot be read (message
unchanged, minus the HANDOFF/delivery.json references) and
`mkdir` + `copyFile` of the DB to `fe/public/proofdb.db`. New success
line: `delivery copied to public/ (sha256 7f12b92a097e…)`. Header
comment states the drop-in uptake per D5 as amended.

### 2. Stamp files removed

- `fe/delivery.json` deleted (was the tracked external pin).
- `fe/public/delivery.json` (generated) deleted.
- `.gitignore`: the `fe/public/delivery.json` line removed.

### 3. `fe/public/js/app.js` — boot gate de-pinned

- The `fetch('delivery.json')` block and the `expected` variable are
  gone entirely; no replacement fetch — the stamp is read from the DB.
- The file-sha comparison and its "delivery sha256 mismatch" error page
  are gone, as are all `censusMismatch` comparisons against
  `expected.*` (node_count/win/loss/open/terminals/max_ply/shards/
  built_from). Census, max ply, shard count, `root_fen` and
  `built_from` are read live from the DB and now shown, not compared.
- The fold-digest check is unchanged: SHA-256 over the sorted
  `"<tag> <sha256>\n"` lines of `shards`, compared to `meta.built_from`
  (blocking gate-1 failure on mismatch; caveat row when `crypto.subtle`
  is unavailable — never silently).
- `renderStampPanel`: the `stamp` parameter is dropped — `built_from`
  renders `meta.built_from`; `fileSha` stays as a display-only row
  (labelled `file sha256 (display only)`). One additive row:
  `stamp source` → `database (self-describing); drop-in uptake, no
  pinned delivery stamp`.
- Header comment updated: boot no longer loads a delivery stamp.

### 4. Comment truth pass (`fe/public/js/gates.js`, `fe/public/js/db.js`)

- `runGate1` comment now says `built_from` is verified from the DB alone
  via the fold digest and that no file sha is compared anywhere
  (was: "the file sha is checked by the delivery gate in app.js").
  Check logic unchanged.
- `db.js` header: "delivery file" wording → "the proofdb.db delivery"
  (it fetches `proofdb.db` directly; nothing else changed).

### 5. Docs

- `AGENTS.md`: "Data delivery" rewritten (drop-in uptake, no
  `fe/delivery.json`, gates are schema/invariants/fold digest/replay,
  accepted trade-off stated); "Build and run" sync-step bullet and the
  Verification bullet updated; key-files list and Conventions updated
  (no stamp file); overview plan list refreshed to plans 1–6 and the D5
  descriptor notes the plan6 amendment.
- `DECISIONS.md`: **Addendum 2 under D5** — delivery gate amended to
  drop-in uptake, old text kept as history, trade-off restated.
- Handoff docs untouched.

### 6. Housekeeping (report5's flagged item)

`docs/plans/fe/prompt.md` (stale pre-redesign prompt) is deleted; the
`docs/plans/fe/` directory is gone. The acceptance sweep below is clean.

## Removed gate surface — before/after

| Check | Before | After |
| --- | --- | --- |
| `npm start` sha256 vs `delivery.json` | hard fail on mismatch | removed (sync copies unconditionally) |
| `npm start` copies `delivery.json` | yes | removed |
| Boot `fetch('delivery.json')` | blocking error page if unavailable | removed |
| Boot file-sha vs pin | blocking error page | removed (sha displayed only) |
| Boot census/max_ply/shards/built_from vs pin | blocking error page per field | removed (displayed only) |
| Gate 1 schema_version / node_count == COUNT(*) | kept | kept (unchanged) |
| Gate 2 structural invariants a–f | kept | kept (unchanged) |
| Fold digest vs `meta.built_from` (§2.2) | kept | kept (unchanged; the only `built_from` check) |
| Gate 3 full WASM-engine replay | kept | kept (unchanged) |

## Accepted trade-off (recorded, per plan)

The pinned external file sha256 was the only check tying the served file
to the producer's announcement. What remains proves the DB is
*internally consistent and rules-correct* (invariants, fold digest, full
replay), but cannot distinguish a *different, self-consistent* proof
tree from the agreed one. The owner accepts this: the file arrives by a
trusted copy from the producer pipeline, and the fold digest remains a
strong content fingerprint. The live-computed file sha256 stays
displayed in the stamp panel (brief §5 per-delivery provenance) — it is
just no longer compared to anything.

## Verification transcript

**A note on the delivery on disk:** the workspace's
`data/proofdb/proofdb.db` is *not* the 2026-10-20 delivery the plan
text anticipated — it is a newer producer cut
(`generator = proofdb_merge 0.1.0`): 87,576 nodes (43,737 win /
43,737 loss / 102 open), 37,607 terminals, max ply 33, 630 shards,
`built_from = fe19b1233d95122f2f55c4cdfcc71f9487a37e948ecc2064a5f7095ee3a69117`,
file sha256
`7f12b92a097edd268a6b9a5cb59f86f3af34f7635c17113b0d51d24c0c7ba698`.
This turns the plan's rehearsal into a real uptake: a *different*
delivery was taken up by file copy alone, with no stamp edit possible or
needed. The DB-only gates validated it from its own contents.

- Pre-check (SQL, independent of the browser): SHA-256 over the sorted
  `"<tag> <sha256>\n"` lines of the 630 `shards` rows equals
  `meta.built_from` (`fe19b123…`) — the fold digest holds for the new
  delivery.
- `node fe/sync-db.mjs` → `delivery copied to public/ (sha256
  7f12b92a097e…)`. No comparison, no stamp.
- `make fe_run` → server boots; page loaded in Chromium (agent-browser):
  - stamp panel: `built_from fe19b1233d95…` (from the DB),
    `file sha256 (display only) 7f12b92a097e…`, the new
    `stamp source` row
    (`database (self-describing); drop-in uptake, no pinned delivery
    stamp`), `schema_version 2`, `root_fen` startpos, census
    `87,576 nodes — 43,737 win / 43,737 loss / 102 open`,
    terminals `37,607`, max ply `33`, shards `630`,
    `built_from fold digest: over 630 shard rows: verified`;
  - structural invariant gate (§8.2): checks a–f all `pass`
    (0 violations);
  - replay gate (§8.3): `pass — 87,576 nodes replayed in 173 ms`,
    full replay from `root_fen` (87,576 legal-move checks), checks
    a–e all `pass` (0 violations);
  - no request for `delivery.json` (the fetch no longer exists in
    `app.js`); views render (open frontier 102, shallowest proven wins
    37,607 rows, list capped at 50).
- Drop-in rehearsal: `shasum -a 256 data/proofdb/proofdb.db` recorded
  (above); the file was copied out and back over itself (touch-free),
  `node fe/sync-db.mjs` re-run, and the page reloaded — everything
  passes again with no stamp edit anywhere.
- `rg -n "delivery.json"`: no live code references. Remaining mentions
  are `AGENTS.md` ("no longer exists"), the owner's note
  (`docs/notes.md`), and historical text in
  `docs/plans/redesign/plan*/report*` + `DECISIONS.md` history +
  provider-side handoff docs.
- Acceptance sweep: `rg -i 'proof_tree|podman|postgres|pg\b|chessops|bin-loader'`
  finds no live references outside `docs/plans/redesign/`; the stale
  `docs/plans/fe/prompt.md` is gone (step 6).
- `git status`: only intended source/doc changes; `fe/public/proofdb.db`
  is still gitignored; no generated artifacts staged.

## Scope

This session is new scope on top of plans 1–5 (the redesign itself was
complete before it). No UI restyle beyond the additive `stamp source`
row and switching `built_from` to its DB value (D4); gate 2 / gate 3
logic, the engine, `nav.js`, `views.js`, and the facts panel are
untouched; `ALLOWED_SCHEMA_VERSIONS` unchanged; the DB is never written
to and the `censor` table stays unread. The soft-notice middle ground
discussed before plan6 was not chosen — no generated stamp remains; if
the owner ever wants an external pin back, that is a new plan.
