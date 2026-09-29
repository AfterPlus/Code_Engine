// Binary trees found at runtime (objects with two self-typed fields), plus the generic tree drawing used for
// binary heaps. Shows pointer variables, visited nodes (members of a set), queued nodes (members of a
// queue/stack), and nodes whose links just changed.

import { s, h } from '../util/dom.js';
import { isRef, nodeLabel } from '../util/values.js';
import { viewShell, svgCanvas, trimLine } from './common.js';

const R = 18;
const DX = 46;
const DY = 64;
const PAD = 26;

/**
 * @param {Map<string, {label, left, right, cls: string[]}>} nodes
 * @param {string[]} roots
 * @param {Map<string, string[]>} pointers  node id -> variable names
 * @param {Set<string>} changedEdges  "id:left" / "id:right"
 */
export function drawBinaryTree(nodes, roots, pointers, changedEdges = new Set()) {
  const pos = new Map();
  let x = 0;
  let maxDepth = 0;
  const seen = new Set();
  const place = (id, depth) => {
    if (!id || !nodes.has(id) || seen.has(id)) return;
    seen.add(id);
    const n = nodes.get(id);
    place(n.left, depth + 1);
    pos.set(id, { x: x++, depth });
    maxDepth = Math.max(maxDepth, depth);
    place(n.right, depth + 1);
  };
  roots.forEach((r, i) => { if (i) x += 0.6; place(r, 0); });
  // detached nodes (e.g. mid-rotation) still get a spot
  for (const id of nodes.keys()) if (!seen.has(id)) place(id, 0);

  const labelRows = Math.max(1, ...[...pointers.values()].map((l) => l.length));
  const top = PAD + labelRows * 13;
  const width = Math.max(120, x * DX + PAD * 2);
  const height = top + maxDepth * DY + R * 2 + 16;
  const { svg, marker } = svgCanvas(width, height);
  const cx = (id) => PAD + pos.get(id).x * DX + R;
  const cy = (id) => top + pos.get(id).depth * DY + R;

  for (const [id, n] of nodes) {
    if (!pos.has(id)) continue;
    for (const side of ['left', 'right']) {
      const c = n[side];
      if (!c || !pos.has(c)) continue;
      const [x1, y1, x2, y2] = trimLine(cx(id), cy(id), cx(c), cy(c), R, R + 2);
      svg.appendChild(s('line', { x1, y1, x2, y2, class: ['edge', changedEdges.has(`${id}:${side}`) && 'changed'].filter(Boolean).join(' '), 'marker-end': marker }));
    }
  }
  for (const [id, n] of nodes) {
    if (!pos.has(id)) continue;
    const g = s('g', { class: ['node', ...(n.cls || [])].join(' ') },
      s('circle', { cx: cx(id), cy: cy(id), r: R }),
      s('text', { x: cx(id), y: cy(id) }, String(n.label).slice(0, 5)));
    svg.appendChild(g);
    (pointers.get(id) || []).forEach((name, i) => {
      svg.appendChild(s('text', { class: 'ptr-label', x: cx(id), y: cy(id) - R - 6 - i * 13 }, name));
    });
  }
  return h('div', { class: 'svg-host' }, svg);
}

export function renderTree(view, ctx) {
  const { frame } = ctx;
  const heap = frame.heap;
  const { left, right } = view.info;
  const nodes = new Map();
  const incoming = new Set();
  const changedEdges = new Set();
  for (const id of view.nodes) {
    const o = heap[id];
    const l = isRef(o.fields[left]) ? o.fields[left].ref : null;
    const r = isRef(o.fields[right]) ? o.fields[right].ref : null;
    if (l) incoming.add(l);
    if (r) incoming.add(r);
    const c = frame.changes.heap.get(id);
    if (c && c.type === 'fields') {
      if (c.fields.includes(left)) changedEdges.add(`${id}:left`);
      if (c.fields.includes(right)) changedEdges.add(`${id}:right`);
    }
    nodes.set(id, {
      label: nodeLabel(o), left: l, right: r,
      cls: [view.pointers.has(id) && 'pointed', view.visited.has(id) && 'visited', view.queued.has(id) && 'queued',
        c && 'changed', frame.changes.created.has(id) && 'created'].filter(Boolean),
    });
  }
  const roots = view.nodes.filter((id) => !incoming.has(id));
  roots.sort((a, b) => (view.pointers.has(b) ? 1 : 0) - (view.pointers.has(a) ? 1 : 0));
  const legend = [];
  if (view.visited.size) legend.push('filled = visited');
  if (view.queued.size) legend.push('dashed = queued');
  return viewShell(view, ctx, {
    type: `${view.type} tree · ${view.nodes.length} nodes`,
    body: drawBinaryTree(nodes, roots.length ? roots : [view.nodes[0]], view.pointers, changedEdges),
    caption: legend.length ? legend.join(' · ') : null,
    wide: view.nodes.length > 7,
  });
}
