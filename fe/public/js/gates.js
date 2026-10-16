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


// ============================================================================
// Gate 3 — replay checks (BROWSER_BRIEF §8.3 / global_proof_store.md §4
// invariants 1–3), verified by the producer's rules engine (D1) over ALL
// stored paths, not a sample.
//
// Depth-first replay of the whole stored tree from meta.root_fen: one
// engine apply per edge, one undo per backtrack. At every node:
//   e. root parse: engine.new(meta.root_fen) succeeds;
//   d. terminal claim (outcome NOT NULL, depth_bound = 0): the replayed
//      position is statically terminal with the same side-to-move outcome;
//   a. every stored child's move_code is a generated legal move code AND
//      its move_uci equals that move's UCI rendering;
//   c. proven non-terminal OR-node: its single 'loss' child is legal;
//   b. proven non-terminal AND-node ('loss', depth_bound > 0): the set of
//      generated legal replies EQUALS the set of stored children
//      (AND/OR completeness, invariant 2 — the oracle for the
//      partial-tree semantics).
//
// A child whose move_code is not legal cannot be replayed past; the
// violation is recorded and that subtree is skipped (counted separately).
export function runGate3(meta, nodes, engine) {
  const t0 = performance.now();
  const violations = {
    rootParse: [],
    illegalMove: [],
    uciMismatch: [],
    orIllegalProof: [],
    andSetMismatch: [],
    terminalMismatch: [],
  };
  const stats = { visited: 0, skippedSubtrees: 0, legalChecks: 0 };

  const children = new Map(); // parentId -> [child, ...] (id order)
  for (const n of nodes) {
    if (n.parentId === null || n.parentId === undefined) continue;
    const list = children.get(n.parentId);
    if (list) list.push(n);
    else children.set(n.parentId, [n]);
  }

//  const sample = (list, text) => {
//    if (list.length < 5) list.push(text);
//  };
  const sample = (list, text) => {
    list.push(text);
  };

  // e. root parse
  let boardId;
  try {
    boardId = engine.new(meta.root_fen ?? '');
  } catch (err) {
    violations.rootParse.push(
      `root_fen ${JSON.stringify(meta.root_fen)} does not parse: ${err?.message ?? err}`
    );
    return finish(violations, stats, t0);
  }

  const root = nodes.find((n) => n.parentId == null);
  if (!root) {
    violations.rootParse.push('no root row (parent_id IS NULL) found');
    engine.free(boardId);
    return finish(violations, stats, t0);
  }

  // Iterative DFS. Each frame carries the node, its children (id order),
  // a cursor, the legal-code set generated on arrival, and the move_code
  // applied to reach this node (for the paired undo on backtrack).
  const stack = [
    {
      node: root,
      kids: children.get(root.id) || [],
      cursor: 0,
      legalSet: null,
      appliedCode: null,
    },
  ];
  stats.visited = 1;

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const node = frame.node;
    const proven = node.outcome !== null && node.outcome !== undefined;
    const nonTerminal = proven && node.depthBound > 0;

    // Arrival: run the per-node position checks once.
    if (frame.legalSet === null) {
      const legalCodes = engine.legal(boardId);
      stats.legalChecks += 1;
      const legalSet = new Set(legalCodes);
      frame.legalSet = legalSet;

      // d. terminal claims are static (invariant 3). Atomic-chess terminal
      // semantics as the producer plays them: a position is decided when
      // one side has lost all commoners (engine outcome 'win'/'loss'), or
      // when the side to move has NO legal replies — stalemate loses
      // (atomic variant rule; the crates.io outcome() helper would call
      // that a draw, but the proof tree never emits draw nodes, and the
      // stored terminals at no-legal-reply positions read 'loss').
      if (proven && node.depthBound === 0) {
        const outcome = engine.outcome(boardId);
        const stalemate = legalCodes.length === 0;
        const effective =
          outcome === 'win' || outcome === 'loss'
            ? outcome
            : stalemate
              ? 'loss'
              : null;
        if (effective !== node.outcome) {
          sample(
            violations.terminalMismatch,
            `node ${node.id}: stored (${node.outcome}, depth_bound 0), engine says (outcome ${outcome}, legal replies ${legalCodes.length})`
          );
        }
      }

      // b. AND-node completeness: generated legal set == stored child set
      if (nonTerminal && node.outcome === 'loss') {
        const storedCodes = new Set(
          frame.kids.filter((k) => k.moveCode != null).map((k) => k.moveCode)
        );
        const same =
          storedCodes.size === legalSet.size &&
          legalCodes.every((c) => storedCodes.has(c));
        if (!same) {
          const extra = legalCodes.filter((c) => !storedCodes.has(c));
          const missing = [...storedCodes].filter((c) => !legalSet.has(c));
          sample(
            violations.andSetMismatch,
            `node ${node.id} (loss, depth_bound ${node.depthBound}): legal replies != stored children (legal-only: ${
              extra.slice(0, 4).map((c) => engine.uci(boardId, c)).join(' ') || '—'
            }; stored-only: ${missing.slice(0, 4).join(' ') || '—'})`
          );
        }
      }

      // c. OR-node: its single 'loss' child must be a legal move
      if (nonTerminal && node.outcome === 'win') {
        const lossKids = frame.kids.filter((k) => k.outcome === 'loss');
        if (lossKids.length === 1 && lossKids[0].moveCode != null) {
          if (!legalSet.has(lossKids[0].moveCode)) {
            sample(
              violations.orIllegalProof,
              `node ${node.id} (win): proving child ${lossKids[0].id} (${lossKids[0].moveUci}) is not legal in the replayed position`
            );
          }
        }
      }
    }

    // Advance to the next stored child (checking a. on the way), descend
    // into the first replayable one.
    let kid = null;
    while (frame.cursor < frame.kids.length) {
      const k = frame.kids[frame.cursor++];
      // a. move_code is legal and move_uci matches its UCI rendering
      if (k.moveCode === null || k.moveCode === undefined) {
        sample(violations.illegalMove, `node ${k.id}: move_code IS NULL`);
        stats.skippedSubtrees += 1;
        continue;
      }
      if (!frame.legalSet.has(k.moveCode)) {
        sample(
          violations.illegalMove,
          `node ${k.id} (move ${k.moveUci}): move_code ${k.moveCode} is not legal in the replayed parent`
        );
        stats.skippedSubtrees += 1;
        continue;
      }
      const uci = engine.uci(boardId, k.moveCode);
      if (uci !== k.moveUci) {
        sample(
          violations.uciMismatch,
          `node ${k.id}: move_uci ${JSON.stringify(k.moveUci)} != uci(${k.moveCode}) ${JSON.stringify(uci)}`
        );
      }
      kid = k;
      break;
    }

    if (kid === null) {
      // Backtrack: pop and undo the move that produced this node.
      stack.pop();
      if (frame.appliedCode !== null) engine.undo(boardId, frame.appliedCode);
      continue;
    }

    engine.apply(boardId, kid.moveCode);
    stack.push({
      node: kid,
      kids: children.get(kid.id) || [],
      cursor: 0,
      legalSet: null,
      appliedCode: kid.moveCode,
    });
    stats.visited += 1;
  }

  engine.free(boardId);
  return finish(violations, stats, t0);
}

function finish(violations, stats, t0) {
  const categories = [
    ['rootParse', 'e. root_fen parses in the engine'],
    ['terminalMismatch', 'd. terminal claims match the replayed position (invariant 3)'],
    ['illegalMove', 'a. every stored child move_code is a legal move'],
    ['uciMismatch', "a. move_uci matches uci(move_code)"],
    ['orIllegalProof', 'c. OR-node proving child is a legal move'],
    ['andSetMismatch', 'b. AND-node: legal replies equal stored children (invariant 2)'],
  ];
  const checks = categories.map(([key, label]) => ({
    id: `replay-${key}`,
    label,
    violations: violations[key].length,
    pass: violations[key].length === 0,
    samples: violations[key].slice(0, 5),
  }));
  return {
    checks,
    pass: checks.every((c) => c.pass),
    stats,
    elapsedMs: Math.round(performance.now() - t0),
  };
}
