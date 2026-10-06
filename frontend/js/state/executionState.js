// State builder: turns a raw trace (structural snapshots from either tracer) into frames the UI can render.
//
// Each raw step is the program state *paused before* `line` runs. Diffing it against the previous step tells us
// what the previous line just did; that is where semantic events (ARRAY_WRITE, MAP_PUT, STACK_POP, ...) come
// from. No algorithm-specific knowledge is involved: only runtime structure and the source text.

import { analyzeSource, lineOperations } from './sourceAnalysis.js';
import { isRef, keyOf, fmt } from '../util/values.js';

export const EVENT_PRIORITY = [
  'EXCEPTION', 'FUNCTION_ENTER', 'RETURN', 'ARRAY_SWAP', 'ARRAY_WRITE', 'MAP_PUT', 'MAP_REMOVE', 'SET_ADD', 'SET_REMOVE',
  'STACK_PUSH', 'STACK_POP', 'QUEUE_PUSH', 'QUEUE_POP', 'POINTER_UPDATE', 'OBJECT_UPDATE', 'OBJECT_CREATE',
  'VARIABLE_DECLARE', 'VARIABLE_UPDATE', 'PRINT', 'MAP_GET', 'ARRAY_READ', 'CONDITION_TRUE', 'CONDITION_FALSE',
  'LOOP_EXIT', 'LOOP_ITERATION', 'LOOP_ENTER', 'COMPARISON', 'STEP',
];

/** Category used for colors (timeline ticks, badges). */
export function eventCategory(ev) {
  if (ev === 'EXCEPTION') return 'err';
  if (ev === 'FUNCTION_ENTER') return 'call';
  if (ev === 'RETURN' || ev === 'FUNCTION_EXIT' || ev === 'PROGRAM_END') return 'ret';
  if (/WRITE|SWAP|PUT|REMOVE|ADD|PUSH|POP|UPDATE|CREATE|DECLARE/.test(ev)) return ev === 'POINTER_UPDATE' ? 'ptr' : 'write';
  if (/READ|GET|CONDITION|COMPARISON/.test(ev)) return 'read';
  return 'step';
}

export function buildExecution(result, code, language) {
  const raw = result.steps || [];
  const src = analyzeSource(code, language);
  const frames = [];
  const calls = new Map();
  const seenIds = new Set();
  const dequeMode = dequeModes(raw, src);
  let consoleText = '';

  for (let k = 0; k < raw.length; k++) {
    const s = raw[k];
    const stack = s.callStack || [];
    consoleText += s.out || '';
    const frame = {
      index: k,
      raw: s,
      depth: s.stackDepth || stack.length,
      line: s.line,
      rawEvent: s.event,
      function: s.function,
      callId: s.callId,
      stack,
      top: stack[stack.length - 1] || null,
      heap: s.heap || {},
      globals: s.globals || {},
      console: consoleText,
      out: s.out || '',
      returnValue: s.returnValue,
      exception: s.exception,
      prevLine: null,
      events: [],
      desc: [],
      changes: { locals: new Map(), heap: new Map(), created: new Set() },
      ops: { reads: [], lookups: [] },
    };
    const prev = frames[k - 1] || null;
    frame.prevFrame = prev;
    frame.language = language;

    // ---- calls (for the call tree)
    if (s.event === 'FUNCTION_ENTER' || !calls.has(s.callId)) {
      for (const fr of stack) {
        if (!calls.has(fr.id)) {
          calls.set(fr.id, {
            id: fr.id, parentId: fr.parentId ?? null, name: fr.name, args: (fr.args || []).map((a) => [a, fr.locals[a]]),
            argHeap: frame.heap, enter: k, exit: null, ret: undefined, depth: frame.depth - stack.length + stack.indexOf(fr) + 1,
          });
        }
      }
    }
    if (s.event === 'FUNCTION_EXIT' && calls.has(s.callId)) {
      const c = calls.get(s.callId);
      c.exit = k;
      c.ret = s.returnValue;
      c.retHeap = frame.heap;
    }

    derive(frame, prev, src, seenIds, dequeMode, language);
    Object.keys(frame.heap).forEach((id) => seenIds.add(id));
    frames.push(frame);
  }

  const last = frames[frames.length - 1];
  if (last && result.status === 'SUCCESS') last.events.push('PROGRAM_END');

  // recursion: some call has an ancestor with the same name
  let recursive = false;
  let maxDepth = frames.reduce((m, f) => Math.max(m, f.depth), 0);
  for (const c of calls.values()) {
    for (let p = calls.get(c.parentId); p && !recursive; p = calls.get(p.parentId)) if (p.name === c.name) recursive = true;
  }

  return { result, frames, calls, src, language, recursive, maxDepth, code, dequeModes: dequeMode };
}

// ------------------------------------------------------------------------------------------ derivation

function derive(frame, prev, src, seenIds, dequeMode, language) {
  const ev = frame.events;
  const desc = frame.desc;

  if (!prev) {
    ev.push('PROGRAM_START', 'FUNCTION_ENTER');
    desc.push(`call ${callSignature(frame.top, frame.heap)}`);
    frame.primary = 'FUNCTION_ENTER';
    return;
  }
  frame.prevLine = prev.line;

  if (frame.rawEvent === 'FUNCTION_ENTER') {
    ev.push('FUNCTION_ENTER');
    desc.push(`call ${callSignature(frame.top, frame.heap)}`);
  } else if (frame.rawEvent === 'FUNCTION_EXIT') {
    ev.push('RETURN', 'FUNCTION_EXIT');
    const rv = frame.returnValue;
    desc.push(rv === undefined || (rv && rv.u) ? `${frame.function} returns` : `${frame.function} returns ${fmt(rv, frame.heap, 1)}`);
  } else if (frame.rawEvent === 'EXCEPTION') {
    ev.push('EXCEPTION');
    const e = frame.exception || {};
    desc.push(`${e.type || 'Exception'}${e.message ? ': ' + e.message : ''}`);
  }

  // ---- locals
  const prevFrames = new Map(prev.stack.map((f) => [f.id, f]));
  for (const f of frame.stack) {
    const pf = prevFrames.get(f.id);
    if (!pf) continue;
    const changes = new Map();
    for (const [name, v] of Object.entries(f.locals)) {
      if (!(name in pf.locals)) {
        changes.set(name, { kind: 'declare', to: v });
      } else if (keyOf(pf.locals[name]) !== keyOf(v)) {
        changes.set(name, { kind: 'update', from: pf.locals[name], to: v });
      }
    }
    if (changes.size) frame.changes.locals.set(f.id, changes);
    if (f === frame.top && frame.rawEvent === 'LINE') {
      for (const [name, c] of changes) {
        if (name === 'this') continue;
        const isPtr = isRef(c.to) || isRef(c.from) || (c.to === null && isRef(c.from));
        ev.push(c.kind === 'declare' ? 'VARIABLE_DECLARE' : isPtr ? 'POINTER_UPDATE' : 'VARIABLE_UPDATE');
        desc.push(c.kind === 'declare' ? `${name} = ${fmt(c.to, frame.heap)}` : `${name}: ${fmt(c.from, prev.heap)} → ${fmt(c.to, frame.heap)}`);
      }
    }
  }
  for (const [name, v] of Object.entries(frame.globals)) {
    if (name in prev.globals && keyOf(prev.globals[name]) !== keyOf(v)) {
      ev.push('VARIABLE_UPDATE');
      desc.push(`${name}: ${fmt(prev.globals[name], prev.heap)} → ${fmt(v, frame.heap)}`);
      if (!frame.changes.globals) frame.changes.globals = new Map();
      frame.changes.globals.set(name, { kind: 'update', from: prev.globals[name], to: v });
    }
  }

  // ---- heap
  const nameOf = (id) => referrerName(frame, id) || referrerName(prev, id) || frame.heap[id]?.type || 'obj';
  for (const [id, h] of Object.entries(frame.heap)) {
    const ph = prev.heap[id];
    if (!ph) {
      if (!seenIds.has(id)) {
        frame.changes.created.add(id);
        if (h.kind !== 'opaque') {
          ev.push('OBJECT_CREATE');
          if (frame.rawEvent === 'LINE') desc.push(`new ${h.type}`);
        }
      }
      continue;
    }
    const c = diffHeap(ph, h);
    if (!c) continue;
    frame.changes.heap.set(id, c);
    describeHeapChange(c, h, ph, nameOf(id), frame, prev, dequeMode, id);
  }

  if (frame.out) {
    ev.push('PRINT');
    desc.push(`print ${JSON.stringify(frame.out.replace(/\r?\n$/, '').slice(0, 40))}`);
  }

  // ---- what did the previous line read / query? (evaluated against the state before it ran)
  const sameCall = prev.top && frame.stack.some((f) => f.id === prev.top.id);
  if (prev.rawEvent !== 'FUNCTION_EXIT' && prev.line && (sameCall || frame.rawEvent === 'FUNCTION_EXIT')) {
    const ops = lineOperations(src, prev.line, prev, language);
    frame.ops = ops;
    const written = new Set();
    for (const [id, c] of frame.changes.heap) (c.indices || []).forEach((i) => written.add(id + ':' + i));
    ops.reads = ops.reads.filter((r) => !written.has(r.heapId + ':' + r.index));
    if (ops.reads.length) ev.push('ARRAY_READ');
    for (const l of ops.lookups) {
      ev.push('MAP_GET');
      const keyText = l.key !== undefined ? fmt(l.key, prev.heap, 0) : '';
      const resText = typeof l.result === 'boolean' ? String(l.result) : l.result === undefined ? '' : fmt(l.result, prev.heap, 1);
      l.text = `${l.recv}.${l.method}(${keyText})${resText !== '' ? ' → ' + resText : ''}`;
      desc.push(l.text);
    }

    // conditions and loops, from where execution went next
    const kind = src.lineKind(prev.line);
    const range = kind ? src.bodyRange(prev.line) : null;
    if (kind && range && frame.rawEvent === 'LINE' && frame.callId === prev.callId) {
      const inside = frame.line >= range[0] && frame.line <= range[1];
      if (kind === 'if') { ev.push(inside ? 'CONDITION_TRUE' : 'CONDITION_FALSE'); desc.push(`condition ${inside}`); }
      else if (!inside && frame.line !== prev.line) { ev.push('LOOP_EXIT'); desc.push('loop ends'); }
      else ev.push('CONDITION_TRUE');
    }
  }
  if (frame.rawEvent === 'LINE' && src.lineKind(frame.line) === 'loop') {
    const range = src.bodyRange(frame.line);
    const fromBody = range && prev.line >= range[0] && prev.line <= range[1] && prev.callId === frame.callId;
    ev.push(fromBody || prev.line === frame.line ? 'LOOP_ITERATION' : 'LOOP_ENTER');
  }

  frame.primary = EVENT_PRIORITY.find((e) => ev.includes(e)) || 'STEP';
}

function describeHeapChange(c, h, ph, name, frame, prev, dequeMode, id) {
  const ev = frame.events;
  const desc = frame.desc;
  const vals = (list) => list.map((v) => fmt(v, frame.heap, 0)).join(', ');
  switch (c.type) {
    case 'swap':
      ev.push('ARRAY_SWAP');
      desc.push(`swap ${name}[${c.indices[0]}] ↔ ${name}[${c.indices[1]}]`);
      return;
    case 'write':
      ev.push('ARRAY_WRITE');
      c.indices.slice(0, 3).forEach((i) => desc.push(`${name}[${i}] = ${fmt(h.elems[i], frame.heap, 0)}`));
      return;
    case 'append': {
      const added = c.indices.map((i) => h.elems[i]);
      if (h.kind === 'stack') { ev.push('STACK_PUSH'); desc.push(`${name}.push(${vals(added)})`); }
      else if (h.kind === 'queue' || h.kind === 'pq') { ev.push('QUEUE_PUSH'); desc.push(`${name}.offer(${vals(added)})`); }
      else if (h.kind === 'deque' && dequeMode.get(id) === 'stack') { ev.push('STACK_PUSH'); desc.push(`${name}.push(${vals(added)})`); }
      else if (h.kind === 'deque') { ev.push('QUEUE_PUSH'); desc.push(`${name}.offer(${vals(added)})`); }
      else { ev.push('ARRAY_WRITE'); desc.push(`${name}.add(${vals(added)})`); }
      return;
    }
    case 'prepend': {
      const added = c.indices.map((i) => h.elems[i]);
      if (h.kind === 'deque' || h.kind === 'queue') { ev.push('STACK_PUSH'); desc.push(`${name}.push(${vals(added)})`); }
      else { ev.push('ARRAY_WRITE'); desc.push(`${name}.add(0, ${vals(added)})`); }
      return;
    }
    case 'popBack':
      if (h.kind === 'stack' || h.kind === 'deque') { ev.push('STACK_POP'); desc.push(`${name}.pop() → ${vals(c.removed)}`); }
      else { ev.push('ARRAY_WRITE'); desc.push(`${name}: removed ${vals(c.removed)}`); }
      return;
    case 'popFront':
      if (h.kind === 'deque' && dequeMode.get(id) === 'stack') { ev.push('STACK_POP'); desc.push(`${name}.pop() → ${vals(c.removed)}`); }
      else if (h.kind === 'queue' || h.kind === 'deque' || h.kind === 'pq') { ev.push('QUEUE_POP'); desc.push(`${name}.poll() → ${vals(c.removed)}`); }
      else { ev.push('ARRAY_WRITE'); desc.push(`${name}: removed ${vals(c.removed)}`); }
      return;
    case 'reorder': {
      if (h.kind !== 'pq') { ev.push('ARRAY_WRITE'); desc.push(`${name} changed`); return; }
      // heap order shuffles elements, so compare as multisets to find what went in / came out
      const count = (list) => list.reduce((m, v) => m.set(keyOf(v), (m.get(keyOf(v)) || 0) + 1), new Map());
      const before = count(ph.elems);
      const after = count(h.elems);
      const added = h.elems.filter((v) => { const k = keyOf(v); const n = before.get(k) || 0; before.set(k, n - 1); return n <= 0; });
      const removed = ph.elems.filter((v) => { const k = keyOf(v); const n = after.get(k) || 0; after.set(k, n - 1); return n <= 0; });
      if (added.length) { ev.push('QUEUE_PUSH'); desc.push(`${name}.offer(${vals(added)})`); }
      if (removed.length) { ev.push('QUEUE_POP'); desc.push(`${name}.poll() → ${vals(removed)}`); }
      if (!added.length && !removed.length) { ev.push('ARRAY_WRITE'); desc.push(`${name} reordered`); }
      return;
    }
    case 'map':
      c.added.concat(c.changed).slice(0, 3).forEach((k) => {
        const entry = h.entries.find((e) => keyOf(e[0]) === k);
        ev.push('MAP_PUT');
        desc.push(`${name}.put(${fmt(entry[0], frame.heap, 0)}, ${fmt(entry[1], frame.heap, 0)})`);
      });
      c.removed.slice(0, 3).forEach((k) => { ev.push('MAP_REMOVE'); desc.push(`${name}.remove(${fmt(JSON.parse(k), prev.heap, 0)})`); });
      return;
    case 'set':
      c.added.slice(0, 3).forEach((k) => { ev.push('SET_ADD'); desc.push(`${name}.add(${fmt(JSON.parse(k), frame.heap, 0)})`); });
      c.removed.slice(0, 3).forEach((k) => { ev.push('SET_REMOVE'); desc.push(`${name}.remove(${fmt(JSON.parse(k), prev.heap, 0)})`); });
      return;
    case 'fields': {
      const ptr = c.fields.some((f) => isRef(h.fields[f]) || isRef(ph.fields[f]));
      ev.push(ptr ? 'POINTER_UPDATE' : 'OBJECT_UPDATE');
      c.fields.slice(0, 2).forEach((f) => desc.push(`${name}.${f} = ${fmt(h.fields[f], frame.heap, 0)}`));
      return;
    }
    default:
  }
}

/**
 * Whether each deque is used as a stack (pushes at the front) or a queue. Decided over the whole run, so the
 * very first push onto an empty deque is labelled correctly too.
 */
function dequeModes(raw, src) {
  const modes = new Map();
  const names = new Map(); // deque id -> variable names that referenced it
  for (let k = 1; k < raw.length; k++) {
    for (const f of raw[k].callStack || []) {
      for (const [n, v] of Object.entries(f.locals || {})) {
        if (v && v.ref && raw[k].heap && raw[k].heap[v.ref] && raw[k].heap[v.ref].kind === 'deque') {
          if (!names.has(v.ref)) names.set(v.ref, new Set());
          names.get(v.ref).add(n);
        }
      }
    }
    for (const [id, h] of Object.entries(raw[k].heap || {})) {
      const ph = raw[k - 1].heap && raw[k - 1].heap[id];
      if (h.kind !== 'deque' || !ph || !ph.elems || !ph.elems.length || modes.has(id)) continue;
      const c = diffHeap(ph, h);
      if (c && c.type === 'prepend') modes.set(id, 'stack');
      else if (c && c.type === 'append') modes.set(id, 'queue');
    }
  }
  // Never held two items at once? Then the code says how it is used: stack.push/pop vs queue.offer/poll.
  const text = src.lines.map((_, i) => src.masked(i + 1)).join('\n');
  for (const [id, set] of names) {
    if (modes.has(id)) continue;
    for (const n of set) {
      const call = (m) => new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\s*\\.\\s*(?:${m})\\s*\\(`).test(text);
      // Python (append/popleft) and C++ (push_back/pop_front/pop_back/push_front) deques
      if (call('popleft') || (call('pop_front') && !call('push_front'))) { modes.set(id, 'queue'); break; }
      if (call('appendleft|push_front|pop_back')) { modes.set(id, 'stack'); break; }
      if (call('push|pop|addFirst|removeFirst')) { modes.set(id, 'stack'); break; }
      if (call('offer|poll|addLast|pollFirst|add|remove|append')) { modes.set(id, 'queue'); break; }
    }
  }
  return modes;
}

/** How a heap object changed between two snapshots, or null if it didn't. */
export function diffHeap(ph, h) {
  if (h.kind === 'map') {
    const pm = new Map((ph.entries || []).map((e) => [keyOf(e[0]), keyOf(e[1])]));
    const cm = new Map((h.entries || []).map((e) => [keyOf(e[0]), keyOf(e[1])]));
    const added = [];
    const changed = [];
    const removed = [];
    for (const [k, v] of cm) { if (!pm.has(k)) added.push(k); else if (pm.get(k) !== v) changed.push(k); }
    for (const k of pm.keys()) if (!cm.has(k)) removed.push(k);
    return added.length || changed.length || removed.length ? { type: 'map', added, changed, removed } : null;
  }
  if (h.kind === 'set') {
    const pk = new Set((ph.elems || []).map(keyOf));
    const ck = new Set((h.elems || []).map(keyOf));
    const added = [...ck].filter((k) => !pk.has(k));
    const removed = [...pk].filter((k) => !ck.has(k));
    return added.length || removed.length ? { type: 'set', added, removed } : null;
  }
  if (h.kind === 'object') {
    const fields = Object.keys(h.fields || {}).filter((f) => keyOf(h.fields[f]) !== keyOf((ph.fields || {})[f]));
    return fields.length ? { type: 'fields', fields } : null;
  }
  if (!h.elems || !ph.elems) return null;
  const pe = ph.elems.map(keyOf);
  const ce = h.elems.map(keyOf);
  if (pe.length === ce.length) {
    const indices = [];
    ce.forEach((k, i) => { if (k !== pe[i]) indices.push(i); });
    if (!indices.length) return null;
    if (h.kind === 'pq') return { type: 'reorder', indices };
    if (indices.length === 2 && ce[indices[0]] === pe[indices[1]] && ce[indices[1]] === pe[indices[0]]) return { type: 'swap', indices };
    return { type: 'write', indices };
  }
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  if (h.kind === 'pq') return { type: 'reorder', indices: [] };
  if (ce.length > pe.length) {
    const d = ce.length - pe.length;
    if (pe.every((k, i) => ce[i] === k)) return { type: 'append', indices: range(pe.length, ce.length) };
    if (pe.every((k, i) => ce[i + d] === k)) return { type: 'prepend', indices: range(0, d) };
  } else {
    const d = pe.length - ce.length;
    if (ce.every((k, i) => pe[i] === k)) return { type: 'popBack', removed: ph.elems.slice(ce.length), indices: [] };
    if (ce.every((k, i) => pe[i + d] === k)) return { type: 'popFront', removed: ph.elems.slice(0, d), indices: [] };
  }
  const indices = [];
  ce.forEach((k, i) => { if (k !== pe[i]) indices.push(i); });
  return { type: 'write', indices };
}

/** A variable name that currently points at a heap object, for descriptions ("map", "this.memo", "stack"). */
export function referrerName(frame, id) {
  if (!frame || !frame.top) return null;
  for (const [n, v] of Object.entries(frame.top.locals)) if (isRef(v) && v.ref === id && n !== 'this') return n;
  const self = frame.top.locals.this;
  if (isRef(self) && frame.heap[self.ref]?.fields) {
    for (const [n, v] of Object.entries(frame.heap[self.ref].fields)) if (isRef(v) && v.ref === id) return 'this.' + n;
  }
  for (const [n, v] of Object.entries(frame.globals || {})) if (isRef(v) && v.ref === id) return n;
  for (const f of frame.stack) for (const [n, v] of Object.entries(f.locals)) if (isRef(v) && v.ref === id) return n;
  return rowName(frame, id);
}

/** "dp[3]" for a row of a table that a variable points at: a row has no variable of its own to be named by. */
function rowName(frame, id) {
  const holders = [...Object.entries(frame.top.locals), ...Object.entries(frame.globals || {})];
  const self = frame.top.locals.this;
  if (isRef(self) && frame.heap[self.ref]?.fields) holders.push(...Object.entries(frame.heap[self.ref].fields).map(([n, v]) => ['this.' + n, v]));
  for (const [n, v] of holders) {
    const holder = isRef(v) ? frame.heap[v.ref] : null;
    const at = holder && holder.elems ? holder.elems.findIndex((e) => isRef(e) && e.ref === id) : -1;
    if (at >= 0) return `${n}[${at}]`;
  }
  return null;
}

export function callSignature(fr, heap) {
  if (!fr) return '?';
  const args = (fr.args || []).map((a) => `${a}=${fmt(fr.locals[a], heap, 1)}`);
  return `${fr.name}(${args.join(', ')})`;
}
