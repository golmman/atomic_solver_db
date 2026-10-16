// Load gate (BROWSER_BRIEF §8.1, §8.2 / global_proof_store.md §4).
// Gate 1 — version-stamp gate: schema_version, node_count == COUNT(*).
// Gate 2 — structural invariants a–f over the in-memory nodes rows.
// Any violation is a blocking error, not a warning.
const ALLOWED_SCHEMA_VERSIONS = [1, 2];

function childMap(nodes) {
  const byParent = new Map(); // parentId -> [child, ...]
  for (const n of nodes) {
    if (n.parentId === null || n.parentId === undefined) continue;
    const list = byParent.get(n.parentId);
    if (list) list.push(n);
    else byParent.set(n.parentId, [n]);
  }
  return byParent;
}

// Gate 1: schema_version ∈ {1, 2}; meta.node_count == actual row count.
// `built_from` is read for display, not compared here (census is the data
// stamp; the file sha is checked by the delivery gate in app.js).
export function runGate1(meta, nodes) {
  const violations = [];
  const schemaVersion = Number(meta.schema_version);
  if (!ALLOWED_SCHEMA_VERSIONS.includes(schemaVersion)) {
    violations.push(
      `schema_version ${meta.schema_version} is not in {${ALLOWED_SCHEMA_VERSIONS.join(', ')}}`
    );
  }
  const declared = Number(meta.node_count);
  if (Number.isNaN(declared) || declared !== nodes.length) {
    violations.push(
      `node_count mismatch: meta says ${meta.node_count}, nodes table has ${nodes.length}`
    );
  }
  return { violations, builtFrom: meta.built_from ?? null };
}

// Gate 2: structural invariants a–f. Returns each check with its violation
// count; an empty violations list means pass.
export function runGate2(nodes) {
  const byParent = childMap(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const violations = { a: [], b: [], c: [], d: [], e: [], f: [] };

  for (const n of nodes) {
    const children = byParent.get(n.id) || [];
    const proven = n.outcome !== null && n.outcome !== undefined;
    const nonTerminal = proven && n.depthBound > 0;

    // a. proven non-terminal OR-node: exactly one 'loss' child and
    //    depth_bound = child.depth_bound + 1
    if (nonTerminal && n.outcome === 'win') {
      const lossChildren = children.filter((c) => c.outcome === 'loss');
      if (lossChildren.length !== 1) {
        violations.a.push(
          `node ${n.id} (win, depth_bound ${n.depthBound}): ${lossChildren.length} 'loss' children`
        );
      } else if (n.depthBound !== lossChildren[0].depthBound + 1) {
        violations.a.push(
          `node ${n.id} (win): depth_bound ${n.depthBound} != child ${lossChildren[0].id}.depth_bound ${lossChildren[0].depthBound} + 1`
        );
      }
    }

    // b. proven non-terminal AND-node: depth_bound = max(child depth_bound) + 1
    if (nonTerminal && n.outcome === 'loss') {
      if (children.length === 0) {
        violations.b.push(
          `node ${n.id} (loss, depth_bound ${n.depthBound}): no children rows`
        );
      } else {
        const maxChild = Math.max(...children.map((c) => c.depthBound));
        if (n.depthBound !== maxChild + 1) {
          violations.b.push(
            `node ${n.id} (loss): depth_bound ${n.depthBound} != max(child depth_bound) ${maxChild} + 1`
          );
        }
      }
    }

    // c. terminal (outcome NOT NULL AND depth_bound = 0): no children rows
    if (proven && n.depthBound === 0 && children.length > 0) {
      violations.c.push(
        `terminal node ${n.id} has ${children.length} children rows`
      );
    }

    // d. depth_status NULL iff outcome NULL
    const statusNull = n.depthStatus === null || n.depthStatus === undefined;
    if (statusNull !== !proven) {
      violations.d.push(
        `node ${n.id}: outcome ${JSON.stringify(n.outcome)}, depth_status ${JSON.stringify(n.depthStatus)}`
      );
    }

    // e. id prefix ordering along parent chains: child.id > parent.id and
    //    child.ply = parent.ply + 1
    if (n.parentId !== null && n.parentId !== undefined) {
      const parent = byId.get(n.parentId);
      if (parent) {
        if (!(n.id > parent.id)) {
          violations.e.push(
            `node ${n.id}: id not greater than parent ${parent.id}`
          );
        }
        if (n.ply !== parent.ply + 1) {
          violations.e.push(
            `node ${n.id}: ply ${n.ply} != parent ${parent.id}.ply ${parent.ply} + 1`
          );
        }
      }
    }

    // f. every parent_id reference resolves to an existing row
    if (n.parentId !== null && n.parentId !== undefined && !byId.has(n.parentId)) {
      violations.f.push(`node ${n.id}: parent_id ${n.parentId} has no row`);
    }
  }

  const labels = {
    a: "a. proven non-terminal OR-node: exactly one 'loss' child, depth = child + 1",
    b: 'b. proven non-terminal AND-node: depth = max(child depth) + 1',
    c: 'c. terminal nodes have no children rows',
    d: "d. depth_status NULL iff outcome NULL",
    e: 'e. id prefix ordering (child.id > parent.id, ply + 1)',
    f: 'f. every parent_id reference resolves',
  };
  const checks = Object.keys(labels).map((k) => ({
    id: k,
    label: labels[k],
    violations: violations[k].length,
    pass: violations[k].length === 0,
    samples: violations[k].slice(0, 5),
  }));
  return { checks, pass: checks.every((c) => c.pass) };
}
