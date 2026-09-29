// Linked lists found at runtime (objects with one self-typed link, usually `next`). Each chain gets its own row,
// so reversing a list shows `prev` and `cur` as two chains that trade nodes step by step.

import { s } from '../util/dom.js';
import { h } from '../util/dom.js';
import { isRef, nodeLabel } from '../util/values.js';
import { viewShell, svgCanvas } from './common.js';

const W = 52;
const H = 34;
const GAP = 42;
const PAD = 14;

export function renderLinkedList(view, ctx) {
  const { frame } = ctx;
  const heap = frame.heap;
  const nextField = view.info.next;
  const extra = view.info.extra || [];
  const nextOf = (id) => (isRef(heap[id].fields[nextField]) ? heap[id].fields[nextField].ref : null);
  const inComp = new Set(view.nodes);

  const incoming = new Set();
  for (const id of view.nodes) { const n = nextOf(id); if (n) incoming.add(n); }
  const heads = view.nodes.filter((id) => !incoming.has(id));
  heads.sort((a, b) => rank(view, b) - rank(view, a));

  const rows = [];
  const drawn = new Map(); // id -> {row, col}
  const walk = (start) => {
    const row = { ids: [], tail: null };
    let cur = start;
    while (cur && inComp.has(cur) && !drawn.has(cur)) {
      drawn.set(cur, { row: rows.length, col: row.ids.length });
      row.ids.push(cur);
      cur = nextOf(cur);
    }
    row.tail = cur; // null, or an already-drawn node (cycle / merge)
    rows.push(row);
  };
  heads.forEach(walk);
  for (const id of view.nodes) if (!drawn.has(id)) walk(view.pointers.has(id) ? id : id);

  const labelRows = Math.max(1, ...[...view.pointers.values()].map((l) => l.length));
  const rowH = H + labelRows * 13 + 34 + (extra.length ? 18 : 0);
  const cols = Math.max(...rows.map((r) => r.ids.length + 1));
  const width = PAD * 2 + cols * (W + GAP) + 30;
  const height = PAD + rows.length * rowH;
  const { svg, marker } = svgCanvas(width, height);
  const x = (col) => PAD + col * (W + GAP);
  const y = (row) => PAD + row * rowH + labelRows * 13 + 6;

  rows.forEach((row, r) => {
    row.ids.forEach((id, c) => {
      const o = heap[id];
      const change = frame.changes.heap.get(id);
      const linkChanged = change && change.type === 'fields' && change.fields.includes(nextField);
      const cls = ['node', view.pointers.has(id) && 'pointed', view.visited.has(id) && 'visited', view.queued.has(id) && 'queued',
        change && 'changed', frame.changes.created.has(id) && 'created'].filter(Boolean).join(' ');
      svg.appendChild(s('g', { class: cls },
        s('rect', { x: x(c), y: y(r), width: W, height: H, rx: 7 }),
        s('text', { x: x(c) + W / 2, y: y(r) + H / 2 }, String(nodeLabel(o)).slice(0, 6))));
      (view.pointers.get(id) || []).forEach((name, i) => {
        svg.appendChild(s('text', { class: 'ptr-label', x: x(c) + W / 2, y: y(r) - 6 - i * 13 }, name + ' ↓'));
      });
      const isLast = c === row.ids.length - 1;
      const ay = y(r) + H / 2;
      if (!isLast) {
        svg.appendChild(s('line', { x1: x(c) + W, y1: ay, x2: x(c + 1) - 2, y2: ay, class: 'edge' + (linkChanged ? ' changed' : ''), 'marker-end': marker }));
      } else if (row.tail === null) {
        svg.appendChild(s('line', { x1: x(c) + W, y1: ay, x2: x(c) + W + GAP - 8, y2: ay, class: 'edge' + (linkChanged ? ' changed' : ''), 'marker-end': marker }));
        svg.appendChild(s('text', { class: 'null-label', x: x(c) + W + GAP - 4, y: ay + 4 }, 'null'));
      } else {
        // points back into a node drawn earlier: a cycle or a merge
        const t = drawn.get(row.tail);
        const tx = x(t.col) + W / 2;
        const ty = y(t.row) + H;
        const sx = x(c) + W / 2;
        const sy = y(r) + H;
        const d = t.row === r
          ? `M${sx},${sy} C${sx},${sy + 28} ${tx},${ty + 28} ${tx},${ty + 2}`
          : `M${x(c) + W},${ay} C${x(c) + W + 30},${ay} ${tx},${ty + 30} ${tx},${ty + 2}`;
        svg.appendChild(s('path', { d, class: 'edge' + (linkChanged ? ' changed' : ''), 'marker-end': marker }));
      }
      // secondary links (prev, random): thin curves under the row
      for (const f of extra) {
        const target = isRef(o.fields[f]) ? drawn.get(o.fields[f].ref) : null;
        if (!target || target.row !== r) continue;
        const sx = x(c) + W / 2;
        const tx = x(target.col) + W / 2;
        const by = y(r) + H;
        svg.appendChild(s('path', { d: `M${sx},${by} C${sx},${by + 18} ${tx},${by + 18} ${tx},${by + 2}`, class: 'edge', 'stroke-dasharray': '3 3', 'marker-end': marker }));
      }
    });
  });

  return viewShell(view, ctx, {
    type: `${view.type} list · ${view.nodes.length} node${view.nodes.length === 1 ? '' : 's'}`,
    body: h('div', { class: 'svg-host' }, svg),
    caption: extra.length ? `dashed: ${extra.join(', ')}` : null,
    wide: cols > 6,
  });
}

function rank(view, id) {
  return view.pointers.has(id) ? 1 : 0;
}
