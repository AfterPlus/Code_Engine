// Graphs, from either representation found at runtime:
//  - indexed: adjacency lists (List<List<Integer>>, int[][] graph, Map<k, List<k>>) or edge lists (int[][] edges)
//  - objects: node objects with a list of neighbours / children
// Current node = integer variables the code uses to index the structure; visited = boolean arrays or sets in
// scope; frontier = members of queues/stacks in scope.

import { s, h } from '../util/dom.js';
import { isRef, scalar, keyOf, nodeLabel, fmt, typeLabel } from '../util/values.js';
import { viewShell, svgCanvas, trimLine, intVars } from './common.js';

const R = 17;

function layoutCircle(ids) {
  const n = ids.length;
  const radius = Math.max(70, (n * (R * 2 + 18)) / (2 * Math.PI));
  const size = radius * 2 + R * 2 + 50;
  const pos = new Map();
  ids.forEach((id, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    pos.set(id, { x: size / 2 + radius * Math.cos(a), y: size / 2 + radius * Math.sin(a) });
  });
  return { pos, width: size, height: size };
}

function layoutLayered(ids, edges, roots) {
  const adj = new Map(ids.map((id) => [id, []]));
  edges.forEach(([a, b]) => { if (adj.has(a) && adj.has(b)) adj.get(a).push(b); });
  const layer = new Map();
  const queue = [];
  for (const r of roots) if (!layer.has(r)) { layer.set(r, 0); queue.push(r); }
  const bfs = () => {
    while (queue.length) {
      const u = queue.shift();
      for (const v of adj.get(u) || []) if (!layer.has(v)) { layer.set(v, layer.get(u) + 1); queue.push(v); }
    }
  };
  bfs();
  for (const id of ids) if (!layer.has(id)) { layer.set(id, 0); queue.push(id); bfs(); }
  const byLayer = new Map();
  for (const id of ids) {
    const l = layer.get(id);
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l).push(id);
  }
  const widest = Math.max(...[...byLayer.values()].map((l) => l.length));
  const width = Math.max(160, widest * 64 + 40);
  const height = byLayer.size * 72 + 30;
  const pos = new Map();
  for (const [l, list] of byLayer) {
    list.forEach((id, i) => pos.set(id, { x: (width / (list.length + 1)) * (i + 1), y: 30 + l * 72 }));
  }
  return { pos, width, height };
}

function draw({ ids, edges, labels, classes, pointers, layout, directed }) {
  const { pos, width, height } = layout;
  const { svg, marker } = svgCanvas(width, height);
  const drawnPairs = new Set();
  for (const [a, b, cls] of edges) {
    if (!pos.has(a) || !pos.has(b)) continue;
    if (a === b) continue;
    const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!directed && drawnPairs.has(pair)) continue;
    drawnPairs.add(pair);
    const p = pos.get(a);
    const q = pos.get(b);
    const [x1, y1, x2, y2] = trimLine(p.x, p.y, q.x, q.y, R, R + (directed ? 3 : 0));
    const attrs = { x1, y1, x2, y2, class: 'edge' + (cls ? ' ' + cls : '') };
    if (directed) attrs['marker-end'] = marker;
    svg.appendChild(s('line', attrs));
  }
  for (const id of ids) {
    const p = pos.get(id);
    svg.appendChild(s('g', { class: ['node', ...(classes.get(id) || [])].join(' ') },
      s('circle', { cx: p.x, cy: p.y, r: R }),
      s('text', { x: p.x, y: p.y }, String(labels.get(id)).slice(0, 5))));
    (pointers.get(id) || []).forEach((name, i) => svg.appendChild(s('text', { class: 'ptr-label', x: p.x, y: p.y - R - 5 - i * 12 }, name)));
  }
  return h('div', { class: 'svg-host' }, svg);
}

/** Node count of an adjacency list held in a list/array (maps are keyed, so per-node arrays don't apply). */
function n0(view, heap) {
  const src = heap[view.id];
  return src && src.kind !== 'map' ? (src.elems || []).length : -1;
}

/** Scope-derived highlights for integer-labelled graphs. */
function indexedHighlights(frame, exec, view, n, nodeKeys) {
  const heap = frame.heap;
  const classes = new Map();
  const addCls = (k, c) => { if (!classes.has(k)) classes.set(k, []); classes.get(k).push(c); };
  const pointers = new Map();
  const name = view.names[0].replace(/^this\./, '');
  const vars = new Set(exec.src.rowVars(name));
  // variables indexing per-node arrays (visited[next], dist[v]) also name nodes
  if (frame.top) {
    for (const [n, v] of Object.entries(frame.top.locals)) {
      const o = isRef(v) && heap[v.ref];
      if (o && o.kind === 'array' && (o.elems || []).length === n0(view, heap)) exec.src.rowVars(n).forEach((x) => vars.add(x));
    }
  }
  const ints = intVars(frame);
  for (const [v, value] of ints) {
    const k = keyOf(value);
    if (vars.has(v) && nodeKeys.has(k)) {
      if (!pointers.has(k)) pointers.set(k, []);
      pointers.get(k).push(v);
      addCls(k, 'pointed');
    }
  }
  // visited: boolean arrays of the right length, or sets of node labels
  const locals = frame.top ? Object.values(frame.top.locals).concat(Object.values(frame.globals || {})) : [];
  for (const v of locals) {
    if (!isRef(v) || v.ref === view.id) continue;
    const o = heap[v.ref];
    if (!o) continue;
    if (o.kind === 'array' && (o.elems || []).length === n && o.elems.every((e) => typeof e === 'boolean')) {
      o.elems.forEach((e, i) => { if (e) addCls(keyOf(i), 'visited'); });
    } else if (o.kind === 'set') {
      (o.elems || []).forEach((e) => nodeKeys.has(keyOf(e)) && addCls(keyOf(e), 'visited'));
    } else if (['queue', 'deque', 'stack'].includes(o.kind)) {
      (o.elems || []).forEach((e) => nodeKeys.has(keyOf(e)) && addCls(keyOf(e), 'queued'));
    }
  }
  return { classes, pointers };
}

export function renderIndexedGraph(view, ctx) {
  const { frame, exec } = ctx;
  const heap = frame.heap;
  const src = heap[view.id];
  let ids;
  let labels;
  const edges = [];
  const mode = view.kind; // 'graph' (adjacency) or 'edges'
  if (src.kind === 'map') {
    const keys = new Set();
    for (const [k, v] of src.entries || []) {
      keys.add(keyOf(k));
      for (const e of heap[v.ref]?.elems || []) { keys.add(keyOf(e)); edges.push([keyOf(k), keyOf(e)]); }
    }
    ids = [...keys];
    labels = new Map(ids.map((k) => [k, fmt(JSON.parse(k), heap, 0)]));
  } else if (mode === 'edges') {
    const keys = new Set();
    for (const r of src.elems || []) {
      const row = heap[r.ref].elems;
      keys.add(keyOf(row[0])); keys.add(keyOf(row[1]));
      edges.push([keyOf(row[0]), keyOf(row[1])]);
    }
    ids = [...keys].sort((a, b) => scalar(JSON.parse(a)) - scalar(JSON.parse(b)));
    labels = new Map(ids.map((k) => [k, fmt(JSON.parse(k), heap, 0)]));
  } else {
    const n = (src.elems || []).length;
    ids = Array.from({ length: n }, (_, i) => keyOf(i));
    labels = new Map(ids.map((k, i) => [k, i]));
    (src.elems || []).forEach((r, i) => (heap[r.ref]?.elems || []).forEach((e) => edges.push([keyOf(i), keyOf(e)])));
  }
  const edgeSet = new Set(edges.map(([a, b]) => a + '>' + b));
  const directed = mode !== 'edges' && edges.some(([a, b]) => !edgeSet.has(b + '>' + a));
  const { classes, pointers } = indexedHighlights(frame, exec, view, ids.length, new Set(ids));
  // edge being explored: from a pointed node to a pointed neighbour
  const pointed = new Set(pointers.keys());
  const styled = edges.map(([a, b]) => [a, b, pointed.has(a) && pointed.has(b) ? 'active' : null]);
  return viewShell(view, ctx, {
    type: `${typeLabel(src)} · ${ids.length} nodes · ${directed ? 'directed' : 'undirected'}`,
    body: draw({ ids, edges: styled, labels, classes, pointers, layout: ids.length <= 16 ? layoutCircle(ids) : layoutLayered(ids, edges, ids.slice(0, 1)), directed }),
    caption: [classes.size && [...classes.values()].flat().includes('visited') ? 'filled = visited' : null,
      [...classes.values()].flat().includes('queued') ? 'dashed = in queue/stack' : null].filter(Boolean).join(' · ') || null,
  });
}

export function renderNodeGraph(view, ctx) {
  const { frame } = ctx;
  const heap = frame.heap;
  const info = view.info;
  const edges = [];
  for (const id of view.nodes) {
    const o = heap[id];
    for (const f of info.selfFields) if (isRef(o.fields[f])) edges.push([id, o.fields[f].ref]);
    for (const f of info.listFields) {
      const list = isRef(o.fields[f]) && heap[o.fields[f].ref];
      (list && list.elems || []).forEach((e) => isRef(e) && edges.push([id, e.ref]));
    }
  }
  const edgeSet = new Set(edges.map(([a, b]) => a + '>' + b));
  const directed = edges.some(([a, b]) => !edgeSet.has(b + '>' + a));
  const classes = new Map(view.nodes.map((id) => [id, [view.pointers.has(id) && 'pointed', view.visited.has(id) && 'visited',
    view.queued.has(id) && 'queued', frame.changes.created.has(id) && 'created'].filter(Boolean)]));
  const roots = view.nodes.filter((id) => view.pointers.has(id));
  const labels = new Map(view.nodes.map((id) => [id, nodeLabel(heap[id])]));
  return viewShell(view, ctx, {
    type: `${view.type} graph · ${view.nodes.length} nodes`,
    body: draw({ ids: view.nodes, edges: edges.map((e) => [...e, null]), labels, classes, pointers: view.pointers, layout: layoutLayered(view.nodes, edges, roots.length ? roots : view.nodes.slice(0, 1)), directed }),
    caption: view.visited.size ? 'filled = visited' : null,
    wide: view.nodes.length > 8,
  });
}
