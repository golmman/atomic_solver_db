# DECISIONS — proofdb browser redesign

Recorded before any UI code, per the kickoff brief (§6, §10). Amendment
policy: later sessions may append `Dn` entries; never silently edit a
recorded decision.

## D1 — Rules engine: Option B, Rust/WASM of `atomic-movegen` 2.3

**Decision:** compile a thin Rust wrapper crate over `atomic-movegen`
v2.3.0 (crates.io, the producer's engine) to `wasm32-unknown-unknown` and
load it in the browser. No TypeScript re-implementation of the rules.

**Rationale:**

- The brief names fidelity as this project's top quality attribute and
  recommends B when the toolchain is acceptable. It is — verified in this
  repo's environment: cargo 1.99.0, `wasm32-unknown-unknown` target
  installable, crate downloads and its API surface fits (see below).
- Bit-exact producer engine turns invariant 1 (replay-verifiable paths)
  into a hard oracle: we can replay **all** 43092 paths and assert the
  stored facts against generated legal-move sets (§8.3), not just a sample.
- `atomic-movegen` is a pure-Rust library with no wasm bindings of its
  own, so wrapping is cheap: `Board::from_fen / do_move / generate_legal /
  hash / outcome / is_terminal`, and `Move` is a plain `u16` whose bit
  layout is exactly the `nodes.move_code` encoding (bits 0–5 `to_sq`,
  6–11 `from_sq`, 12–13 move type, 14–15 promo), with `to_uci()` for the
  UCI column.
- Option A's rules-drift risk (halfmove clock, en passant, castling,
  atomic explosion + check rules) buys nothing we need.

**Toolchain risk fallback:** prefer the standard `wasm-bindgen` glue; if
`wasm-bindgen-cli` proves unavailable in a session, fall back to a raw
`cdylib` with a hand-written `extern "C"` ABI (pointer/marshal-based).
The wrapper must stay below ~300 lines either way.

**Build output policy:** the generated `.wasm` + glue under
`fe/public/vendor/engine/` is a build artifact and stays out of Git
(established convention: no generated binaries committed). `npm start`
rebuilds it if missing; cargo + the wasm target are prerequisites.

## D2 — DB access: `sql.js` (WASM SQLite) in the browser, serving the
delivery file verbatim

The 3.2 MB `proofdb.db` is fetched as-is and opened with `sql.js`. No
JSON pre-conversion: consuming the actual delivery file keeps the
version gate (file sha256, `built_from`, census) meaningful with zero
conversion steps. The `censor` table is never read. All SQL stays
read-only. `sql.js` dist files are vendored into `fe/public/vendor/` by
a deterministic copy step at install/start time (no CDN fetch).

## D3 — Server: dependency-free static file server

`fe/server.mjs` is replaced by a plain `node:http` static server on
`localhost:7000` (no API endpoints, no directory listing). The old
express/pg/chessops stack is removed. All logic is client-side.

## D4 — Look and feel preserved

`fe/public/style.css`, the three-column layout, unicode pieces, hover
arrow, last-move highlight, and history sidebar are kept as-is. The
redesign extends them (outcome status colors on move buttons, node facts
panel, version-stamp/gate panel) rather than restyling.

## D5 — DB delivery location and gate

The delivery lives at `data/proofdb/proofdb.db` (gitignored, as before).
Verified on receipt 2026-10-16: sha256
`02fc7d60bc588ef5a1589671c7dc8dcd899ae8f8afe11d23c208dfc0300210ae`,
census matches HANDOFF (43092 nodes; 21514/21514/64; 20220 terminals;
max ply 22), and a SQL pre-check of the §4 structural invariants
reported 0 failures. `fe/delivery.json` carries the expected stamp
(sha + `built_from` + census); the load gate compares against it and a
new delivery means deliberately updating that file.

### Addendum (plan5, 2026-10-20 delivery uptake) — verified on receipt

The provider re-cut the delivery on 2026-10-20 (byte-identical tree; the
producer migrated its standing layer to the v2 source-of-truth model).
Verified on receipt:

- sha256(proofdb.db) =
  `375a2b1fc8a2959e3d60aa6737ba6b479988f23de3e953a3233fbae72b69f430`
  (`sha256sum` against the delivered file).
- `built_from` =
  `47b25861d0f56776e04dc534cd8c781fdc45e180a54898e179264fbc6c3c5d72` —
  the §2.2 **fold digest**; cross-checked by computing SHA-256 over the
  sorted `"<tag> <sha256>\n"` lines of the 405 `shards` rows, which
  yields exactly this value.
- Census unchanged and confirmed by SQL: 43,092 nodes (21,514 win /
  21,514 loss / 64 open), 20,220 terminals, max ply 22, 405 shards.
- SQL pre-check of the relaxed §4 invariant 2/4: zero proven
  non-terminal OR-nodes have more than one `'loss'` child (so the
  current DB also satisfies the old stricter check — the shipped gates
  were relaxed anyway so future deliveries storing extra proven-loss
  lines are not falsely rejected).

This supersedes the 2026-10-16 stamp above (kept as history);
`fe/delivery.json` now records the 2026-10-20 stamp.

## D6 — Navigating into unrecorded territory

Stored children are navigable facts. A *legal* reply without a row is
rendered as **unknown** and may be clicked to show the replayed position
with an explicit "no recorded facts" state — never as refuted/illegal.
Open nodes are labelled *undecided*, never "draw".
