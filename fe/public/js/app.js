// Module boot: open the DB, run the version-stamp gate (§8.1) and the
// structural invariant gate (§8.2), then show the data version-stamp
// surface. No delivery stamp is fetched: uptake is drop-in (D5 as amended
// by plan6) and the stamp is read from the DB itself — the gates are all
// self-describing, DB-only checks. Any gate failure renders the blocking
// error page.
import {
  openDelivery,
  sha256Hex,
  tableCensus,
  readMeta,
  readCensus,
  readShardCount,
  readAllNodes,
  readShardDigestInput,
} from './db.js';
import { runGate1, runGate2, runGate3 } from './gates.js';
import { loadEngine } from './engine.js';
import { initNav, navigateToNode } from './nav.js';
import { initViews } from './views.js';

const gatePanel = document.getElementById('gate-panel');

function setProgress(text) {
  gatePanel.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'boot-status';
  p.textContent = text;
  gatePanel.appendChild(p);
}

// Blocking error page — replaces the boot surface entirely.
function renderErrorPage(title, details) {
  gatePanel.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'error-page';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  box.appendChild(h2);
  const pre = document.createElement('pre');
  pre.className = 'error-details';
  pre.textContent = details.join('\n');
  box.appendChild(pre);
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent =
    'The load gate is blocking: the database is not displayed until every check passes.';
  box.appendChild(p);
  gatePanel.appendChild(box);
}

function fmt(n) {
  return Number(n).toLocaleString('en-US');
}

function stampRow(dt, dd) {
  const row = document.createElement('div');
  row.className = 'stamp-row';
  const d1 = document.createElement('span');
  d1.className = 'stamp-key';
  d1.textContent = dt;
  const d2 = document.createElement('span');
  d2.className = 'stamp-value';
  d2.textContent = dd;
  row.append(d1, d2);
  return row;
}

function renderStampPanel({ fileSha, meta, census, shardCount, foldDigest, foldDigestCaveat, checks, replay }) {
  gatePanel.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'stamp-panel';

  const h2 = document.createElement('h2');
  h2.textContent = 'Data version stamp';
  panel.appendChild(h2);

  panel.appendChild(stampRow('built_from', meta.built_from));
  panel.appendChild(
    stampRow('file sha256 (display only)', fileSha)
  );
  panel.appendChild(
    stampRow(
      'stamp source',
      'database (self-describing); drop-in uptake, no pinned delivery stamp'
    )
  );
  panel.appendChild(stampRow('schema_version', meta.schema_version));
  panel.appendChild(
    stampRow('root_fen', meta.root_fen)
  );
  panel.appendChild(
    stampRow(
      'node census',
      `${fmt(census.total)} nodes — ${fmt(census.win)} win / ${fmt(census.loss)} loss / ${fmt(census.open)} open`
    )
  );
  panel.appendChild(stampRow('terminals', fmt(census.terminals)));
  panel.appendChild(stampRow('max ply', census.maxPly));
  panel.appendChild(stampRow('shards', fmt(shardCount)));
  panel.appendChild(
    stampRow(
      'built_from fold digest',
      foldDigestCaveat ?? `over ${fmt(shardCount)} shard rows: verified`
    )
  );
  gatePanel.appendChild(panel);

  const summary = document.createElement('div');
  summary.className = 'gate-summary';
  const h3 = document.createElement('h3');
  h3.textContent = 'Structural invariant gate (§8.2)';
  summary.appendChild(h3);
  const list = document.createElement('ul');
  for (const check of checks) {
    const li = document.createElement('li');
    const status = document.createElement('span');
    status.className = check.pass ? 'gate-pass' : 'gate-fail';
    status.textContent = check.pass ? 'pass' : `FAIL (${check.violations} violations)`;
    li.appendChild(status);
    li.appendChild(document.createTextNode(` ${check.label}`));
    list.appendChild(li);
  }
  summary.appendChild(list);
  gatePanel.appendChild(summary);

  if (replay) {
    const replayPanel = document.createElement('div');
    replayPanel.className = 'gate-summary';
    const h3 = document.createElement('h3');
    h3.textContent = 'Replay gate (§8.3, engine-verified)';
    replayPanel.appendChild(h3);
    const ul = document.createElement('ul');
    const head = document.createElement('li');
    const headStatus = document.createElement('span');
    headStatus.className = replay.pass ? 'gate-pass' : 'gate-fail';
    headStatus.textContent = replay.pass
      ? `pass — ${fmt(replay.stats.visited)} nodes replayed in ${replay.elapsedMs} ms`
      : `FAIL — ${replay.checks.reduce((n, c) => n + c.violations, 0)} violation(s) in ${fmt(replay.stats.visited)} replayed nodes`;
    head.appendChild(headStatus);
    head.appendChild(
      document.createTextNode(
        ` full replay from root_fen (${fmt(replay.stats.legalChecks)} legal-move checks)${
          replay.stats.skippedSubtrees > 0
            ? `, ${fmt(replay.stats.skippedSubtrees)} subtrees skipped (unreplayable moves)`
            : ''
        }`
      )
    );
    ul.appendChild(head);
    for (const check of replay.checks) {
      const li = document.createElement('li');
      const status = document.createElement('span');
      status.className = check.pass ? 'gate-pass' : 'gate-fail';
      status.textContent = check.pass ? 'pass' : `FAIL (${check.violations})`;
      li.appendChild(status);
      li.appendChild(document.createTextNode(` ${check.label}`));
      ul.appendChild(li);
    }
    replayPanel.appendChild(ul);
    gatePanel.appendChild(replayPanel);
  }
}

async function boot() {
  let opened;
  try {
    opened = await openDelivery((t) => setProgress(t));
  } catch (err) {
    renderErrorPage('Load gate failed: could not open the delivery', [
      String(err.message ?? err),
    ]);
    return;
  }
  const { bytes, db } = opened;

  setProgress('Computing file sha256 …');
  const fileSha = await sha256Hex(bytes);

  setProgress('Reading meta and census …');
  const meta = readMeta(db);
  const tables = tableCensus(db);
  const census = readCensus(db);
  const shardCount = readShardCount(db);

  setProgress('Reading nodes table (whole table) …');
  const nodes = readAllNodes(db);

  // Gate 1 (§8.1): schema_version, node_count == COUNT(*). The census,
  // max ply, shard count, root_fen and built_from are read live from the
  // DB and shown in the stamp panel — displayed, not compared to a pin.
  const gate1 = runGate1(meta, nodes);
  const censusMismatch = [];

  // Fold-digest verification of built_from (spec §2.2): SHA-256 over the
  // sorted "<tag> <sha256>\n" lines of the shards table, computed in the
  // browser via crypto.subtle — internally verifiable from the DB alone.
  // crypto.subtle requires a secure context (http://localhost counts). If
  // it is unavailable the check is skipped with a stated caveat in the
  // stamp panel — never silently. A digest mismatch is a gate-1 failure
  // (blocking, same as any other internal inconsistency).
  let foldDigest = null;
  let foldDigestCaveat = null;
  if (globalThis.crypto?.subtle) {
    setProgress('Computing built_from fold digest over the shards table …');
    foldDigest = await sha256Hex(new TextEncoder().encode(readShardDigestInput(db)));
    if (foldDigest !== meta.built_from) {
      censusMismatch.push(
        `built_from ${meta.built_from} != fold digest over ${shardCount} shard rows (${foldDigest})`
      );
    }
  } else {
    foldDigestCaveat =
      'not verified — crypto.subtle unavailable (insecure context)';
  }

  const gate1Failures = [...gate1.violations, ...censusMismatch];

  setProgress('Running structural invariant checks …');
  const gate2 = runGate2(nodes);

  if (gate1Failures.length > 0) {
    renderErrorPage('Load gate failed: version stamp mismatch (§8.1)', [
      'Gate 1 violations:',
      ...gate1Failures.map((v) => `  - ${v}`),
    ]);
    return;
  }
  if (!gate2.pass) {
    renderErrorPage('Load gate failed: structural invariants (§8.2)', [
      'Gate 2 violations:',
      ...gate2.checks
        .filter((c) => !c.pass)
        .flatMap((c) => [
          `  ${c.label}: ${c.violations} violation(s)`,
          ...c.samples.map((s) => `      e.g. ${s}`),
        ]),
    ]);
    return;
  }

  // Gate 3 (§8.3): replay the whole tree with the producer's rules engine.
  setProgress('Replaying all stored paths with the rules engine …');
  let replay;
  let engine;
  try {
    engine = await loadEngine();
    replay = runGate3(meta, nodes, engine);
  } catch (err) {
    renderErrorPage('Load gate failed: rules engine unavailable', [
      String(err?.message ?? err),
      '',
      'The engine is built from engine/ by sh engine/build.sh and vendored',
      'into fe/public/vendor/engine/ — npm start runs the build when the',
      'vendor output is missing.',
    ]);
    return;
  }
  if (!replay.pass) {
    renderErrorPage('Load gate failed: replay checks (§8.3)', [
      `Replayed ${replay.stats.visited} nodes in ${replay.elapsedMs} ms.`,
      'Replay violations:',
      ...replay.checks
        .filter((c) => !c.pass)
        .flatMap((c) => [
          `  ${c.label}: ${c.violations} violation(s)`,
          ...c.samples.map((s) => `      e.g. ${s}`),
        ]),
    ]);
    return;
  }

  renderStampPanel({
    fileSha,
    meta,
    census,
    shardCount,
    foldDigest,
    foldDigestCaveat,
    checks: gate2.checks,
    replay,
  });
  void tables;

  // Board + move navigation (plan3) + node facts panel and cheap views
  // (plan4): the gates passed, so the replayed tree is trusted. Reuse the
  // engine facade the replay gate initialised.
  const root = nodes.find((n) => n.parentId === null || n.parentId === undefined);
  try {
    initNav({
      db,
      engine,
      rootFen: meta.root_fen,
      root,
      stamp: { builtFrom: meta.built_from, census },
    });
    initViews({ db, navigateToNode });
  } catch (err) {
    console.error(err);
    renderErrorPage('Board navigation failed to start', [String(err?.stack ?? err)]);
  }
}

boot().catch((err) => {
  console.error(err);
  renderErrorPage('Unexpected boot failure', [String(err?.stack ?? err)]);
});
