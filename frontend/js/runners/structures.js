/*
 * LeetCode's serialization of node-based structures, shared by the JavaScript and C/C++ engines:
 *
 *   list      [1,2,3]                              ListNode chain
 *   tree      [1,null,2,3]                         level order, TreeNode
 *   nary      [1,null,3,2,4,null,5,6]              level order, a null closes each sibling group
 *   graph     [[2,4],[1,3],[2,4],[1,3]]            adjacency list, node i has value i+1
 *   random    [[7,null],[13,0],[11,4]]             [value, index of the random pointer]
 *   nextptr   [1,2,3,4,5,6,7]  ->  [1,"#",2,3,"#"] a perfect tree; output is level order with "#" row ends
 *
 * Everything goes through an *adapter* so the same code builds real JS objects and interpreter objects:
 *   make(cls, val)  get(node, field)  set(node, field, value)  has(node, field)
 *   newList(items)  items(list)  isNode(x)  className(node)
 */
(function (root) {
  'use strict';

  class StructureError extends Error {}

  const isNullish = (v) => v === null || v === undefined;

  // ---------------------------------------------------------------------------------------------- build

  function buildList(cls, values, a) {
    let head = null;
    let tail = null;
    for (const v of values) {
      const n = a.make(cls, v);
      a.set(n, 'next', null);
      if (!head) head = n; else a.set(tail, 'next', n);
      tail = n;
    }
    return head;
  }

  function buildTree(cls, values, a, fields = ['left', 'right']) {
    if (!values.length || isNullish(values[0])) return null;
    const mk = (v) => { const n = a.make(cls, v); fields.forEach((f) => a.set(n, f, null)); return n; };
    const rootNode = mk(values[0]);
    const q = [rootNode];
    let i = 1;
    while (q.length && i < values.length) {
      const p = q.shift();
      if (i < values.length && !isNullish(values[i])) { const c = mk(values[i]); a.set(p, fields[0], c); q.push(c); }
      i++;
      if (i < values.length && !isNullish(values[i])) { const c = mk(values[i]); a.set(p, fields[1], c); q.push(c); }
      i++;
    }
    return rootNode;
  }

  function buildNary(cls, values, a) {
    if (!values.length || isNullish(values[0])) return null;
    const mk = (v) => { const n = a.make(cls, v); a.set(n, 'children', a.newList([])); return n; };
    const rootNode = mk(values[0]);
    const q = [rootNode];
    let i = 2; // values[1] is the null closing the root
    while (q.length && i < values.length) {
      const p = q.shift();
      const kids = [];
      while (i < values.length && !isNullish(values[i])) { const c = mk(values[i]); kids.push(c); q.push(c); i++; }
      a.set(p, 'children', a.newList(kids));
      i++;
    }
    return rootNode;
  }

  function buildGraph(cls, adjacency, a) {
    if (!adjacency.length) return null;
    const nodes = adjacency.map((_, i) => { const n = a.make(cls, i + 1); a.set(n, 'neighbors', a.newList([])); return n; });
    adjacency.forEach((list, i) => {
      const nb = list.map((v) => {
        if (v < 1 || v > nodes.length) throw new StructureError('graph neighbor ' + v + ' is out of range');
        return nodes[v - 1];
      });
      a.set(nodes[i], 'neighbors', a.newList(nb));
    });
    return nodes[0];
  }

  function buildRandom(cls, entries, a) {
    if (!entries.length) return null;
    const nodes = entries.map((e) => { const n = a.make(cls, e[0]); a.set(n, 'next', null); a.set(n, 'random', null); return n; });
    nodes.forEach((n, i) => {
      if (i + 1 < nodes.length) a.set(n, 'next', nodes[i + 1]);
      const r = entries[i][1];
      if (!isNullish(r)) {
        if (r < 0 || r >= nodes.length) throw new StructureError('random index ' + r + ' is out of range');
        a.set(n, 'random', nodes[r]);
      }
    });
    return nodes[0];
  }

  function build(kind, cls, values, a) {
    if (!Array.isArray(values)) throw new StructureError('expected an array to build a ' + cls);
    switch (kind) {
      case 'list': return buildList(cls, values, a);
      case 'tree': return buildTree(cls, values, a);
      case 'nextptr': return buildTree(cls, values, a, ['left', 'right']);
      case 'nary': return buildNary(cls, values, a);
      case 'graph': return buildGraph(cls, values, a);
      case 'random': return buildRandom(cls, values, a);
      default: throw new StructureError('building a ' + cls + ' from an array is not supported');
    }
  }

  // ---------------------------------------------------------------------------------------------- serialize

  function listToJson(head, a, plain) {
    const out = [];
    const seen = new Set();
    for (let n = head; !isNullish(n) && out.length < 10000; n = a.get(n, 'next')) {
      if (seen.has(n)) { out.push('...cycle'); break; }
      seen.add(n);
      out.push(plain(a.get(n, 'val')));
    }
    return out;
  }

  function treeToJson(rootNode, a, plain) {
    const out = [];
    const q = [rootNode];
    let head = 0;
    while (head < q.length && out.length < 10000) {
      const n = q[head++];
      if (isNullish(n)) { out.push(null); continue; }
      out.push(plain(a.get(n, 'val')));
      q.push(a.get(n, 'left'), a.get(n, 'right'));
    }
    while (out.length && out[out.length - 1] === null) out.pop();
    return out;
  }

  function naryToJson(rootNode, a, plain) {
    const out = [plain(a.get(rootNode, 'val')), null];
    const q = [rootNode];
    let head = 0;
    while (head < q.length && out.length < 10000) {
      const n = q[head++];
      const kids = a.items(a.get(n, 'children')) || [];
      for (const c of kids) { out.push(plain(a.get(c, 'val'))); q.push(c); }
      out.push(null);
    }
    while (out.length && out[out.length - 1] === null) out.pop();
    return out;
  }

  function graphToJson(start, a, plain) {
    const byVal = new Map();
    const q = [start];
    const seen = new Set([start]);
    for (let head = 0; head < q.length && q.length < 10000; head++) {
      const n = q[head];
      byVal.set(plain(a.get(n, 'val')), n);
      for (const m of a.items(a.get(n, 'neighbors')) || []) if (!seen.has(m)) { seen.add(m); q.push(m); }
    }
    const max = Math.max(...byVal.keys());
    const out = [];
    for (let v = 1; v <= max; v++) {
      const n = byVal.get(v);
      out.push(n ? (a.items(a.get(n, 'neighbors')) || []).map((m) => plain(a.get(m, 'val'))) : []);
    }
    return out;
  }

  function randomToJson(head, a, plain) {
    const nodes = [];
    for (let n = head; !isNullish(n) && nodes.length < 10000 && !nodes.includes(n); n = a.get(n, 'next')) nodes.push(n);
    // the random pointer may leave the list (an invalid deep copy): show it as -1 rather than hiding it
    return nodes.map((n) => {
      const r = a.get(n, 'random');
      return [plain(a.get(n, 'val')), isNullish(r) ? null : nodes.indexOf(r)];
    });
  }

  function nextptrToJson(rootNode, a, plain) {
    const out = [];
    let level = rootNode;
    while (!isNullish(level) && out.length < 10000) {
      let firstNext = null;
      for (let n = level; !isNullish(n); n = a.get(n, 'next')) {
        out.push(plain(a.get(n, 'val')));
        if (firstNext === null) firstNext = a.get(n, 'left') || a.get(n, 'right') || null;
      }
      out.push('#');
      level = firstNext;
    }
    return out;
  }

  /** `plain` converts one payload value (number, string, ...) to plain JSON. */
  function serialize(kind, node, a, plain) {
    if (isNullish(node)) return [];
    switch (kind) {
      case 'list': return listToJson(node, a, plain);
      case 'tree': return treeToJson(node, a, plain);
      case 'nary': return naryToJson(node, a, plain);
      case 'graph': return graphToJson(node, a, plain);
      case 'random': return randomToJson(node, a, plain);
      case 'nextptr': return nextptrToJson(node, a, plain);
      default: return null;
    }
  }

  /** Which kind of structure a node object is, judged by its own fields (when the definitions are not known). */
  function kindOfNode(n, a) {
    if (a.has(n, 'children')) return 'nary';
    if (a.has(n, 'neighbors')) return 'graph';
    if (a.has(n, 'random')) return 'random';
    if (a.has(n, 'left') && a.has(n, 'right')) return a.has(n, 'next') ? 'nextptr' : 'tree';
    if (a.has(n, 'next')) return 'list';
    return null;
  }

  /** LeetCode passes a node "by value" (p = 5): find the node holding that value in the structures built earlier. */
  function findNodeByValue(roots, value, a) {
    const seen = new Set();
    const queue = [...roots];
    while (queue.length) {
      const n = queue.shift();
      if (isNullish(n) || seen.has(n)) continue;
      seen.add(n);
      if (a.get(n, 'val') === value) return n;
      for (const f of ['next', 'left', 'right', 'random', 'child']) if (a.has(n, f)) queue.push(a.get(n, f));
      for (const f of ['children', 'neighbors']) if (a.has(n, f)) queue.push(...(a.items(a.get(n, f)) || []));
    }
    throw new StructureError('no node with value ' + JSON.stringify(value) + ' in the earlier arguments');
  }

  const api = { build, serialize, kindOfNode, findNodeByValue, StructureError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LCVStructures = api;
})(typeof self !== 'undefined' ? self : this);
