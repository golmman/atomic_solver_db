// Module boot: load the delivery file, run the version-stamp gate (§8.1)
// and the structural invariant gate (§8.2), then show the data
// version-stamp surface. Any gate failure renders the blocking error page.
import {
  openDelivery,
  sha256Hex,
  tableCensus,
  readMeta,
  readCensus,
  readShardCount,
  readAllNodes,
} from './db.js';
import { runGate1, runGate2, runGate3 } from './gates.js';
import { loadEngine } from './engine.js';

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

function renderStampPanel({ stamp, fileSha, meta, census, shardCount, checks, replay }) {
  gatePanel.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'stamp-panel';

  const h2 = document.createElement('h2');
  h2.textContent = 'Data version stamp';
  panel.appendChild(h2);

  panel.appendChild(stampRow('built_from', stamp.built_from));
  panel.appendChild(
    stampRow('file sha256', fileSha)
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
  let expected;
  try {
    const res = await fetch('delivery.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    expected = await res.json();
  } catch (err) {
    renderErrorPage('Load gate failed: delivery stamp unavailable', [
      `Could not fetch delivery.json (${err.message}).`,
      'This file is copied from fe/delivery.json by the sync step — start the site with `npm start`.',
    ]);
    return;
  }

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

  // Delivery gate (D5): file sha256 must match the recorded delivery stamp.
  if (fileSha !== expected.file_sha256) {
    renderErrorPage('Load gate failed: delivery sha256 mismatch', [
      `expected (fe/delivery.json): ${expected.file_sha256}`,
      `actual (served file):        ${fileSha}`,
      '',
      'A new delivery is recorded deliberately: place it at',
      'data/proofdb/proofdb.db, verify it against the producer handoff,',
      'update fe/delivery.json, and commit that change.',
    ]);
    return;
  }

  // Gate 1 (§8.1): schema_version, node_count == COUNT(*).
  const gate1 = runGate1(meta, nodes);
  const censusMismatch = [];
  if (census.total !== expected.census.node_count) censusMismatch.push(`node_count ${census.total} != ${expected.census.node_count}`);
  if (census.win !== expected.census.win) censusMismatch.push(`win ${census.win} != ${expected.census.win}`);
  if (census.loss !== expected.census.loss) censusMismatch.push(`loss ${census.loss} != ${expected.census.loss}`);
  if (census.open !== expected.census.open) censusMismatch.push(`open ${census.open} != ${expected.census.open}`);
  if (census.terminals !== expected.terminal_count) censusMismatch.push(`terminals ${census.terminals} != ${expected.terminal_count}`);
  if (census.maxPly !== expected.max_ply) censusMismatch.push(`max ply ${census.maxPly} != ${expected.max_ply}`);
  if (shardCount !== expected.shard_count) censusMismatch.push(`shards ${shardCount} != ${expected.shard_count}`);
  if (meta.built_from !== expected.built_from) censusMismatch.push(`built_from ${meta.built_from} != ${expected.built_from}`);

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
  try {
    const engine = await loadEngine();
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
    stamp: expected,
    fileSha,
    meta,
    census,
    shardCount,
    checks: gate2.checks,
    replay,
  });
  void tables;
}

boot().catch((err) => {
  console.error(err);
  renderErrorPage('Unexpected boot failure', [String(err?.stack ?? err)]);
});
