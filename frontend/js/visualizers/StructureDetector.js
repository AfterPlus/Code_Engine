// Automatic data-structure detection. Views are chosen from runtime shape and references (arrays of arrays,
// objects whose fields point at the same type, lists of ints that index their own outer list, ...), never from
// what the problem is "about". Variable names only label things, and only break ties for all-null fields.

import { isRef, scalar } from '../util/values.js';

const SEQ = new Set(['array', 'list', 'stack', 'queue', 'deque', 'pq']);
const NULL_SELF_HINTS = /^(next|prev|left|right|parent|child|children|neighbors|neighbours|random|down|up)$/;

/**
 * Variables in scope for the active frame (locals, `this.field`s, globals, a returned value), then the
 * callers' variables marked `outer` — e.g. a grid captured by a closure is still worth drawing.
 */
export function rootBindings(frame) {
  const out = [];
  const top = frame.top;
  if (top) {
    for (const [name, v] of Object.entries(top.locals)) {
      if (name === 'this') {
        const self = isRef(v) && frame.heap[v.ref];
        if (self && self.fields) for (const [f, fv] of Object.entries(self.fields)) out.push({ name: 'this.' + f, value: fv });
      } else {
        out.push({ name, value: v });
      }
    }
  }
  for (const [name, v] of Object.entries(frame.globals || {})) out.push({ name, value: v });
  if (frame.rawEvent === 'FUNCTION_EXIT' && isRef(frame.returnValue)) out.push({ name: 'return', value: frame.returnValue });
  for (const f of frame.stack.slice(0, -1).reverse()) {
    for (const [name, v] of Object.entries(f.locals)) if (name !== 'this') out.push({ name, value: v, outer: true });
  }
  return out;
}

export function analyzeNodeTypes(heap) {
  const types = new Map();
  const objects = Object.values(heap).filter((h) => h.kind === 'object' && h.fields);
  for (const h of objects) {
    if (!types.has(h.type)) types.set(h.type, { type: h.type, self: new Set(), lists: new Set(), nullish: new Set(), order: Object.keys(h.fields) });
    const t = types.get(h.type);
    for (const [f, v] of Object.entries(h.fields)) {
      if (v === null || (v && v.u)) { t.nullish.add(f); continue; }
      if (!isRef(v)) continue;
      const target = heap[v.ref];
      if (!target) continue;
      if (target.kind === 'object' && target.type === h.type) t.self.add(f);
      else if (SEQ.has(target.kind) && (target.elems || []).some((e) => isRef(e) && heap[e.ref] && heap[e.ref].type === h.type)) t.lists.add(f);
    }
  }
  for (const t of types.values()) {
    // an all-null field can't reveal its type at runtime; fall back to conventional names
    for (const f of t.nullish) if (!t.self.has(f) && NULL_SELF_HINTS.test(f) && !t.lists.has(f)) t.self.add(f);
    const self = t.order.filter((f) => t.self.has(f));
    if (t.lists.size) t.shape = 'graph';
    else if (self.includes('next') || self.length === 1) {
      t.shape = 'linkedlist';
      t.next = self.includes('next') ? 'next' : self[0];
      t.extra = self.filter((f) => f !== t.next);
    } else if (self.length >= 2) {
      t.shape = 'tree';
      t.left = self.includes('left') ? 'left' : self[0];
      t.right = self.includes('right') ? 'right' : self.find((f) => f !== t.left);
      t.extra = self.filter((f) => f !== t.left && f !== t.right);
    }
    t.selfFields = self;
    t.listFields = [...t.lists];
  }
  return types;
}

/** Connected groups of node objects (one view each). */
function nodeComponents(heap, types) {
  const nodes = Object.values(heap).filter((h) => h.kind === 'object' && types.get(h.type)?.shape);
  const parent = new Map(nodes.map((n) => [n.id, n.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b)); };
  for (const n of nodes) {
    const t = types.get(n.type);
    for (const f of t.selfFields) if (isRef(n.fields[f])) union(n.id, n.fields[f].ref);
    for (const f of t.listFields) {
      const list = isRef(n.fields[f]) && heap[n.fields[f].ref];
      (list && list.elems || []).forEach((e) => { if (isRef(e)) union(n.id, e.ref); });
    }
  }
  const groups = new Map();
  for (const n of nodes) {
    const r = find(n.id);
    if (!groups.has(r)) groups.set(r, { type: n.type, info: types.get(n.type), nodes: [] });
    groups.get(r).nodes.push(n.id);
  }
  return [...groups.values()];
}

/** Which ids appear inside collections (BFS queues, DFS stacks, visited sets). */
function membership(heap, rootIds) {
  const queued = new Set();
  const visited = new Set();
  for (const h of Object.values(heap)) {
    if (h.kind === 'set') (h.elems || []).forEach((e) => isRef(e) && visited.add(e.ref));
    else if (h.kind === 'map') (h.entries || []).forEach(([k]) => isRef(k) && visited.add(k.ref));
    else if (['queue', 'deque', 'stack', 'pq'].includes(h.kind)) (h.elems || []).forEach((e) => isRef(e) && queued.add(e.ref));
    // a plain array/list held in a variable and full of nodes is a work list (JS BFS: const queue = [root])
    else if (rootIds.has(h.id) && (h.kind === 'array' || h.kind === 'list')) {
      (h.elems || []).forEach((e) => isRef(e) && heap[e.ref]?.kind === 'object' && queued.add(e.ref));
    }
  }
  return { queued, visited };
}

const isScalar = (v) => !isRef(v);

function classify(h, heap, exec) {
  if (SEQ.has(h.kind)) {
    const elems = h.elems || [];
    if (h.kind === 'stack') return { kind: 'stack' };
    if (h.kind === 'deque' && exec && exec.dequeModes && exec.dequeModes.get(h.id) === 'stack') return { kind: 'stack' };
    if (h.kind === 'queue' || h.kind === 'deque') return { kind: 'queue' };
    if (h.kind === 'pq') return { kind: 'pq', modes: ['array', 'tree'] };
    const inner = elems.map((e) => (isRef(e) ? heap[e.ref] : null));
    const is2D = elems.length > 0 && inner.every((x) => x && SEQ.has(x.kind) && (x.elems || []).every(isScalar));
    if (is2D) {
      const n = elems.length;
      const ints = inner.every((x) => x.elems.every((v) => Number.isInteger(scalar(v))));
      const indexesItself = ints && inner.every((x) => x.elems.every((v) => v >= 0 && v < n));
      const pairs = ints && inner.every((x) => x.elems.length === 2 || x.elems.length === 3);
      // ragged lists of in-range ints read naturally as an adjacency list; a uniform int[][] is a table
      const ragged = new Set(inner.map((x) => x.elems.length)).size > 1 || h.kind === 'list' || inner.some((x) => x.kind === 'list');
      const modes = ['matrix'];
      if (indexesItself && ragged) modes.push('graph');
      if (pairs) modes.push('edges');
      // bucket arrays ([[],[3],[2],[1],[],[]]) are ragged too; adjacency lists have edges out of most nodes
      const nonEmpty = inner.filter((x) => x.elems.length > 0).length;
      const def = indexesItself && ragged && n > 1 && nonEmpty * 2 >= n ? 'graph' : 'matrix';
      return { kind: def, modes: modes.length > 1 ? modes : null };
    }
    return { kind: 'array' };
  }
  if (h.kind === 'map') {
    const entries = h.entries || [];
    const listValued = entries.length > 0 && entries.every(([k, v]) => isScalar(k) && isRef(v) && heap[v.ref]
      && (SEQ.has(heap[v.ref].kind) || heap[v.ref].kind === 'set') && (heap[v.ref].elems || []).every(isScalar));
    if (listValued) {
      const keys = new Set(entries.map(([k]) => JSON.stringify(k)));
      let hits = 0;
      let total = 0;
      for (const [, v] of entries) for (const e of heap[v.ref].elems || []) { total++; if (keys.has(JSON.stringify(e))) hits++; }
      const graphLike = total > 0 && hits / total >= 0.5;
      return { kind: graphLike ? 'graph' : 'map', modes: ['map', 'graph'] };
    }
    const allScalar = entries.every(([k, v]) => isScalar(k) && isScalar(v));
    return { kind: 'map', dense: allScalar };
  }
  if (h.kind === 'set') return { kind: 'set' };
  if (h.kind === 'object') {
    // plain JS objects used as dictionaries
    const vals = Object.values(h.fields || {});
    if (h.type === 'Object' && vals.every(isScalar)) return { kind: 'map', objectAsMap: true };
    return { kind: 'object' };
  }
  return null;
}

/**
 * @returns {Array<object>} views, ordered by the first variable that references them
 */
export function detectViews(frame, overrides = {}, exec = null) {
  const heap = frame.heap;
  const roots = rootBindings(frame);
  const byId = new Map();
  roots.forEach((r, i) => {
    if (!isRef(r.value) || !heap[r.value.ref]) return;
    const id = r.value.ref;
    if (!byId.has(id)) byId.set(id, { names: [], outerNames: [], order: r.outer ? 1000 + i : i });
    const b = byId.get(id);
    if (r.outer) b.outerNames.push(r.name);
    else {
      b.names.push(r.name);
      b.order = Math.min(b.order, i);
    }
  });

  const types = analyzeNodeTypes(heap);
  const { queued, visited } = membership(heap, new Set(byId.keys()));
  const views = [];
  const claimed = new Set();

  for (const comp of nodeComponents(heap, types)) {
    const pointers = new Map();
    let order = Infinity;
    for (const id of comp.nodes) {
      const b = byId.get(id);
      // only the active frame's variables label nodes; callers' copies would be ambiguous (every `node`)
      if (b && b.names.length) pointers.set(id, b.names);
      if (b) order = Math.min(order, b.order);
      claimed.add(id);
    }
    // collections of nodes that reference this component also make it relevant
    if (order === Infinity) {
      for (const [id, b] of byId) {
        const h = heap[id];
        if (h && (h.elems || []).some((e) => isRef(e) && comp.nodes.includes(e.ref))) order = Math.min(order, b.order + 0.5);
      }
    }
    if (order === Infinity) continue;
    const names = [...new Set([...pointers.values()].flat())];
    views.push({
      kind: comp.info.shape, key: 'node:' + comp.type + ':' + (names[0] || ''), title: names.join(', ') || comp.type,
      type: comp.type, info: comp.info, nodes: comp.nodes, pointers, queued, visited, order,
    });
  }

  for (const [id, b] of byId) {
    if (claimed.has(id)) continue;
    const h = heap[id];
    const c = classify(h, heap, exec);
    if (!c) continue;
    if (!b.names.length) b.names = b.outerNames.slice(0, 1);
    const key = b.names[0];
    const chosen = c.modes && c.modes.includes(overrides[key]) ? overrides[key] : null;
    // a priority queue keeps its kind; the mode only switches between its array and heap-tree drawings
    const kind = c.kind === 'pq' ? 'pq' : chosen || c.kind;
    const mode = c.kind === 'pq' ? chosen || 'array' : kind;
    const view = { kind, key, id, names: b.names, title: b.names.join(', '), order: b.order, modes: c.modes, mode, dense: c.dense, objectAsMap: c.objectAsMap };
    if (c.kind === 'matrix' || c.kind === 'graph') (h.elems || []).forEach((e) => isRef(e) && claimed.add(e.ref));
    views.push(view);
  }

  views.sort((a, b) => a.order - b.order);
  return views;
}
