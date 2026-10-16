// Cheap views (brief §7.4): the open frontier and the shallowest proven
// wins, as small link lists that launch navigation. Both queries are the
// spec §7 examples; node identity is the path, so navigation goes through
// the per-ply (parent_id, move_uci) lookup from the root (nav.navigateToNode).
//
// Absence discipline: both views list stored rows only (open = undecided);
// nothing here infers facts from absent rows. The `censor` table is never
// read.
import { readViews, readNodeById } from './db.js';

const fmt = (n) => Number(n).toLocaleString('en-US');

// Full UCI path of a node (spec §7 recursive chain query, walked row by
// row — ≤ ply indexed lookups, all recorded ancestors by invariant).
function pathOfNode(db, id) {
  const ucis = [];
  let cur = id;
  while (cur !== null && cur !== undefined) {
    const row = readNodeById(db, cur);
    if (!row) return null;
    if (row.moveUci !== null && row.moveUci !== undefined) ucis.push(row.moveUci);
    cur = row.parentId;
  }
  return ucis.reverse().join(' ');
}

function viewButton(db, row, navigateToNode) {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.textContent = `ply ${row.ply} — #${fmt(row.id)}`;
  btn.addEventListener('click', () => navigateToNode(row.id));
  // Lazy path tooltip (evidence of where the link leads; not proof semantics).
  btn.addEventListener('mouseenter', () => {
    if (btn.dataset.path === undefined) {
      const path = pathOfNode(db, row.id);
      btn.dataset.path = path ?? 'path unavailable';
    }
    btn.title = btn.dataset.path;
  });
  li.appendChild(btn);
  return li;
}

export function initViews({ db, navigateToNode }) {
  const panel = document.getElementById('views-panel');
  const views = readViews(db);

  const h2 = document.createElement('h2');
  h2.textContent = 'Views';
  panel.appendChild(h2);

  // Open frontier: undecided rows a future harvest pass would open.
  const h3a = document.createElement('h3');
  h3a.textContent = `Open frontier (${fmt(views.openFrontier.length)})`;
  panel.appendChild(h3a);
  const listA = document.createElement('ul');
  listA.id = 'view-frontier';
  for (const row of views.openFrontier) {
    listA.appendChild(viewButton(db, row, navigateToNode));
  }
  panel.appendChild(listA);

  // Shallowest proven wins (min depth_bound among 'win'). The list is
  // capped: the full count is stated, only the first rows are links.
  const h3b = document.createElement('h3');
  h3b.textContent = `Shallowest proven wins (${fmt(views.shallowWins.total)})`;
  panel.appendChild(h3b);
  const listB = document.createElement('ul');
  listB.id = 'view-wins';
  for (const row of views.shallowWins.rows) {
    listB.appendChild(viewButton(db, row, navigateToNode));
  }
  panel.appendChild(listB);
  if (views.shallowWins.capped) {
    const note = document.createElement('p');
    note.className = 'empty';
    note.textContent = `Showing the first ${views.shallowWins.rows.length} of ${fmt(views.shallowWins.total)} rows (ordered by ply, id).`;
    panel.appendChild(note);
  }
}
