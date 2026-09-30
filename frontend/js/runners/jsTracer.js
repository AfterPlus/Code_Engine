/*
 * JavaScript tracer runtime + harness.
 *
 * `runTrace` instruments the user's code, runs it, calls the selected function with the test case, and returns
 * a result in exactly the normalized shape the Java backend produces (see ExecutionResult.java), so the rest of
 * the frontend never knows which language ran.
 *
 * Works as a classic-worker script (defines self.LCVTracer) and as a CommonJS module (for tests).
 */
(function (root) {
  'use strict';

  const HALT = Object.freeze({ __lcvHalt: true });
  const MAX_ELEMENTS = 256;
  const MAX_OBJECTS = 400;
  const MAX_OUTPUT = 65536;
  const MAX_FRAMES = 50; // frames captured per step; deep recursion reports its real depth in stackDepth

  // ---------------------------------------------------------------------- heap encoding

  class HeapWalker {
    constructor(ids) {
      this.ids = ids;          // WeakMap object -> id, shared across steps so ids are stable
      this.heap = {};
      this.pending = [];
      this.queued = new Set();
    }

    idOf(obj) {
      let id = this.ids.map.get(obj);
      if (!id) { id = String(++this.ids.seq); this.ids.map.set(obj, id); }
      return id;
    }

    encode(v) {
      switch (typeof v) {
        case 'undefined': return { u: 1 };
        case 'boolean': return v;
        case 'number': return Number.isFinite(v) ? v : { n: String(v) };
        case 'bigint': return { n: v.toString() };
        case 'string': return { str: v.length > 500 ? v.slice(0, 500) + '…' : v };
        case 'symbol': return { str: v.toString() };
        case 'function': return { fn: v.name || 'anonymous' };
        default: break;
      }
      if (v === null) return null;
      const id = this.idOf(v);
      if (!this.queued.has(id) && this.queued.size < MAX_OBJECTS) {
        this.queued.add(id);
        this.pending.push([id, v]);
      }
      return { ref: id };
    }

    drain() {
      while (this.pending.length) {
        const [id, obj] = this.pending.shift();
        this.heap[id] = this.describe(id, obj);
      }
      return this.heap;
    }

    seq(values, length) {
      const elems = [];
      const n = Math.min(length, MAX_ELEMENTS);
      for (let i = 0; i < n; i++) elems.push(this.encode(values[i]));
      return elems;
    }

    describe(id, obj) {
      const h = { id };
      if (Array.isArray(obj)) {
        h.kind = 'array'; h.type = 'Array';
        h.elems = this.seq(obj, obj.length);
        if (obj.length > MAX_ELEMENTS) { h.length = obj.length; h.truncated = true; }
      } else if (ArrayBuffer.isView(obj) && !(obj instanceof DataView)) {
        h.kind = 'array'; h.type = obj.constructor.name;
        h.elems = this.seq(obj, obj.length);
        if (obj.length > MAX_ELEMENTS) { h.length = obj.length; h.truncated = true; }
      } else if (obj instanceof Map) {
        h.kind = 'map'; h.type = 'Map'; h.entries = [];
        for (const [k, v] of obj) {
          if (h.entries.length >= MAX_ELEMENTS) { h.length = obj.size; h.truncated = true; break; }
          h.entries.push([this.encode(k), this.encode(v)]);
        }
      } else if (obj instanceof Set) {
        h.kind = 'set'; h.type = 'Set'; h.elems = [];
        for (const v of obj) {
          if (h.elems.length >= MAX_ELEMENTS) { h.length = obj.size; h.truncated = true; break; }
          h.elems.push(this.encode(v));
        }
      } else if (obj instanceof Date || obj instanceof RegExp || obj instanceof Promise || obj instanceof WeakMap || obj instanceof WeakSet) {
        h.kind = 'opaque'; h.type = obj.constructor.name;
      } else {
        const proto = Object.getPrototypeOf(obj);
        h.kind = 'object';
        h.type = proto === null ? 'Object' : (proto.constructor && proto.constructor.name) || 'Object';
        h.fields = {};
        let n = 0;
        for (const k of Object.keys(obj)) {
          if (n++ >= MAX_ELEMENTS) { h.truncated = true; break; }
          let val;
          try { val = obj[k]; } catch (e) { val = undefined; }
          h.fields[k] = this.encode(val);
        }
      }
      return h;
    }
  }

  // ---------------------------------------------------------------------- tracer (`__t`)

  class Tracer {
    constructor(sites, opts) {
      this.sites = sites;
      this.maxSteps = opts.maxSteps;
      this.deadline = opts.deadline;
      this.tracing = false;
      this.halted = null;          // 'STEP_LIMIT' | 'TIMEOUT'
      this.steps = [];
      this.stack = [];
      this.callSeq = 0;
      this.ids = { map: new WeakMap(), seq: 0 };
      this.out = '';
      this.outSeen = 0;
      this.globalsGetter = null;
      this.globalNames = [];
      this.errorInfo = new WeakMap();
      this.lastErrorInfo = null;
    }

    enter(name, line, siteId, getter, self) {
      if (!this.tracing) return null;
      if (this.halted) throw HALT;
      const parent = this.stack[this.stack.length - 1];
      const f = {
        id: ++this.callSeq, parentId: parent ? parent.id : null, name, line, siteId, getter,
        argNames: this.sites[siteId] || [], self, retVal: undefined,
      };
      this.stack.push(f);
      this.snap('FUNCTION_ENTER', f, false);
      f.justEntered = true;
      return f;
    }

    s(f, line, siteId, getter) {
      if (!f) return;
      if (this.halted) throw HALT;
      const sameAsEntry = f.justEntered && f.line === line;
      f.justEntered = false;
      f.line = line;
      f.siteId = siteId;
      f.getter = getter;
      // the FUNCTION_ENTER frame already shows the first line of the body
      if (!sameAsEntry) this.snap('LINE', f, false);
    }

    ret(f, v) {
      if (f) f.retVal = v;
      return v;
    }

    error(f, e) {
      if (!f || this.isHalt(e)) return;
      const info = { line: f.line, function: f.name };
      if (e !== null && typeof e === 'object') { if (!this.errorInfo.has(e)) this.errorInfo.set(e, info); }
      else this.lastErrorInfo = info;
    }

    isHalt(e) {
      return e === HALT;
    }

    leave(f) {
      if (!f) return;
      try {
        if (!this.halted) this.snap('FUNCTION_EXIT', f, true);
      } finally {
        const i = this.stack.lastIndexOf(f);
        if (i >= 0) this.stack.length = i;
      }
    }

    print(text) {
      if (this.out.length < MAX_OUTPUT) this.out += text.slice(0, MAX_OUTPUT - this.out.length);
    }

    snap(event, f, isExit) {
      if (this.steps.length >= this.maxSteps) { this.halted = 'STEP_LIMIT'; throw HALT; }
      if ((this.steps.length & 63) === 0 && Date.now() > this.deadline) { this.halted = 'TIMEOUT'; throw HALT; }
      const heap = new HeapWalker(this.ids);
      const callStack = this.stack.slice(-MAX_FRAMES).map((fr) => {
        let values = [];
        try { values = fr.getter ? fr.getter() : []; } catch (e) { values = []; }
        const names = this.sites[fr.siteId] || [];
        const locals = {};
        names.forEach((n, i) => { locals[n] = heap.encode(values[i]); });
        if (fr.self && typeof fr.self === 'object' && fr.self !== globalThis && Object.keys(fr.self).length) locals.this = heap.encode(fr.self);
        return { id: fr.id, parentId: fr.parentId, name: fr.name, line: fr.line, args: fr.argNames, locals };
      });
      const step = {
        step: this.steps.length, line: f.line, event, function: f.name,
        callId: f.id, parentCallId: f.parentId, callStack, stackDepth: this.stack.length,
      };
      if (isExit) step.returnValue = heap.encode(f.retVal);
      if (this.globalsGetter && this.globalNames.length) {
        let vals = [];
        try { vals = this.globalsGetter(); } catch (e) { vals = []; }
        step.globals = {};
        this.globalNames.forEach((n, i) => {
          if (typeof vals[i] !== 'function') step.globals[n] = heap.encode(vals[i]);
        });
      }
      step.heap = heap.drain();
      if (this.out.length > this.outSeen) {
        step.out = this.out.slice(this.outSeen);
        this.outSeen = this.out.length;
      }
      this.steps.push(step);
    }
  }

  // ---------------------------------------------------------------------- harness

  const HELPERS = {
    ListNode: 'function ListNode(val, next) { this.val = (val === undefined ? 0 : val); this.next = (next === undefined ? null : next); }',
    TreeNode: 'function TreeNode(val, left, right) { this.val = (val === undefined ? 0 : val); this.left = (left === undefined ? null : left); this.right = (right === undefined ? null : right); }',
  };

  function formatForConsole(v, depth = 0) {
    if (typeof v === 'string') return depth ? JSON.stringify(v) : v;
    if (v === undefined) return 'undefined';
    if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
    if (typeof v !== 'object' || v === null) return String(v);
    if (depth > 2) return Array.isArray(v) ? '[Array]' : '[Object]';
    if (Array.isArray(v)) return '[' + v.map((x) => formatForConsole(x, depth + 1)).join(', ') + ']';
    if (v instanceof Map) return 'Map(' + v.size + ') {' + [...v].map(([k, x]) => formatForConsole(k, depth + 1) + ' => ' + formatForConsole(x, depth + 1)).join(', ') + '}';
    if (v instanceof Set) return 'Set(' + v.size + ') {' + [...v].map((x) => formatForConsole(x, depth + 1)).join(', ') + '}';
    const name = v.constructor && v.constructor.name !== 'Object' ? v.constructor.name + ' ' : '';
    return name + '{' + Object.keys(v).map((k) => k + ': ' + formatForConsole(v[k], depth + 1)).join(', ') + '}';
  }

  // ---- structures (see structures.js): plain JS objects through a tiny adapter
  const S = () => root.LCVStructures || (typeof require !== 'undefined' ? require('./structures.js') : null);
  const adapter = (classes) => ({
    make: (cls, val) => { const C = classes[cls]; if (!C) throw new InvalidInput('class ' + cls + ' is not defined (add it in the Definitions tab)'); return new C(val); },
    get: (n, f) => (n[f] === undefined ? null : n[f]),
    set: (n, f, v) => { n[f] = v; },
    has: (n, f) => n !== null && typeof n === 'object' && f in n,
    newList: (items) => items,
    items: (l) => (Array.isArray(l) ? l : null),
    isNode: (x) => x !== null && typeof x === 'object' && 'val' in x,
    className: (n) => (n && n.constructor && n.constructor.name) || '',
  });

  /** JSDoc types as LeetCode writes them: `Node|null`, `?TreeNode`, `_Node` -> the class name. */
  const normType = (type) => (type || '').replace(/\s+/g, '').replace(/\|null|\|undefined|^\?/g, '').replace(/^_(?=Node$)/, '');

  function convertArg(value, type, env) {
    if (value === null || value === undefined) return value;
    const t = normType(type);
    const kind = env.kinds[t];
    if (kind && env.classes[t]) {
      // `p = 5` in a tree problem means the node with value 5 in a tree given earlier
      if (!Array.isArray(value)) return S().findNodeByValue(env.built, value, env.adapter);
      let built;
      try {
        built = S().build(kind, t, value, env.adapter);
      } catch (e) {
        throw new InvalidInput(e.message);
      }
      if (built) env.built.push(built);
      return built;
    }
    const arr = /^(.*)\[\]$/.exec(t) || /^Array<(.*)>$/.exec(t);
    if (arr && Array.isArray(value)) return value.map((v) => convertArg(v, arr[1], env));
    return value;
  }

  /** LeetCode's linked-list-cycle input: the tail links back to the node at index `pos` (-1: no cycle). */
  function linkCycle(args, pos) {
    if (typeof pos !== 'number' || pos < 0) return;
    const head = args.find((a) => a && typeof a === 'object' && 'next' in a);
    if (!head) return;
    let target = null;
    let tail = head;
    for (let i = 0; ; i++) {
      if (i === pos) target = tail;
      if (!tail.next) break;
      tail = tail.next;
    }
    if (!target) throw new InvalidInput('pos ' + pos + ' is outside the list');
    tail.next = target;
  }

  /** What a bare `Node` class is, judged from the definitions that declare it. */
  function nodeKind(text) {
    if (/\bchildren\b/.test(text)) return 'nary';
    if (/\bneighbou?rs\b/.test(text)) return 'graph';
    if (/\brandom\b/.test(text)) return 'random';
    if (/\b(left|right)\b/.test(text)) return 'nextptr';
    return 'list';
  }

  class InvalidInput extends Error {}

  /**
   * Matches values to parameters by name; values whose names match no parameter fill the remaining
   * parameters in order (so raw positional input works, and so do differently named keys).
   */
  function resolveArgs(fn, testCase, env) {
    const tc = testCase || {};
    const names = new Set(fn.params);
    const cyclePos = fn.params.some((p) => normType(fn.types[p]) === 'ListNode') && 'pos' in tc && !names.has('pos');
    const spare = Object.keys(tc).filter((k) => !names.has(k) && !(cyclePos && k === 'pos')).map((k) => tc[k]);
    env.built = [];
    const args = fn.params.map((p) => {
      let raw;
      if (Object.prototype.hasOwnProperty.call(tc, p)) raw = tc[p];
      else if (spare.length) raw = spare.shift();
      else {
        const keys = Object.keys(tc);
        throw new InvalidInput("Missing test-case value for parameter '" + p + "'" +
          (keys.length ? ' (the test case provides: ' + keys.join(', ') + ')' : ' (the test case is empty)'));
      }
      return convertArg(JSON.parse(JSON.stringify(raw === undefined ? null : raw)), fn.types[p], env);
    });
    if (cyclePos) linkCycle(args, tc.pos);
    return { args, unused: spare.length };
  }

  function pickTarget(topLevel, testCase, env) {
    let best = null;
    let bestScore = -Infinity;
    const keys = Object.keys(testCase || {});
    const consider = (fn, owner) => {
      let score = 0;
      try {
        score += 100 - 20 * resolveArgs(fn, testCase, env).unused;
      } catch (e) {
        // not a fit; still a fallback
      }
      fn.params.forEach((p) => { if (keys.includes(p)) score += 10; });
      if (fn.params.length === keys.length) score += 5;
      if (score > bestScore) { bestScore = score; best = { ...fn, owner }; }
    };
    for (const fn of topLevel.functions) {
      if (fn.isClass) fn.methods.forEach((m) => consider(m, fn.name));
      else consider(fn, null);
    }
    return best;
  }

  /** LeetCode's class-design format: ["MinStack","push",...] with [[],[-2],...]. */
  function designProblem(testCase, fns) {
    const vals = Object.values(testCase || {});
    if (vals.length !== 2) return null;
    const [ops, params] = vals;
    if (!Array.isArray(ops) || !Array.isArray(params) || !ops.length || ops.length !== params.length) return null;
    if (!ops.every((o) => typeof o === 'string') || !params.every(Array.isArray)) return null;
    const C = fns[ops[0]];
    return typeof C === 'function' ? { C, ops, params } : null;
  }

  function toJson(v, depth = 0) {
    if (v === undefined) return null;
    if (v === null || typeof v !== 'object') return typeof v === 'bigint' ? v.toString() : v;
    if (depth > 50) return String(v);
    if (Array.isArray(v) || ArrayBuffer.isView(v)) return Array.from(v, (x) => toJson(x, depth + 1));
    if (v instanceof Set) return [...v].map((x) => toJson(x, depth + 1));
    if (v instanceof Map) { const o = {}; for (const [k, x] of v) o[String(k)] = toJson(x, depth + 1); return o; }
    if ('val' in v) {
      const ad = adapter({});
      const kind = S().kindOfNode(v, ad);
      if (kind) return S().serialize(kind, v, ad, (x) => toJson(x, depth + 1));
    }
    const o = {};
    for (const k of Object.keys(v)) o[k] = toJson(v[k], depth + 1);
    return o;
  }

  function pickTarget(topLevel, args) {
    const keys = Object.keys(args || {});
    let best = null;
    let bestScore = -Infinity;
    const consider = (fn, owner) => {
      let score = 0;
      fn.params.forEach((p) => { if (keys.includes(p)) score += 10; });
      if (fn.params.length === keys.length) score += 5;
      if (score > bestScore) { bestScore = score; best = { ...fn, owner }; }
    };
    for (const fn of topLevel.functions) {
      if (fn.isClass) fn.methods.forEach((m) => consider(m, fn.name));
      else consider(fn, null);
    }
    return best;
  }

  /**
   * @param {string} code user source
   * @param {object} testCase named arguments
   * @param {{acorn, astring, instrumenter, maxSteps?: number, timeoutMs?: number}} deps
   */
  function runTrace(code, testCase, deps) {
    const started = Date.now();
    const maxSteps = deps.maxSteps || 5000;
    const result = { language: 'javascript', status: 'SUCCESS', steps: [], stdout: '' };
    const finish = () => { result.executionTimeMs = Date.now() - started; return result; };

    let inst;
    try {
      inst = deps.instrumenter.instrument(code, deps.acorn, deps.astring);
    } catch (e) {
      result.status = 'COMPILE_ERROR';
      const line = e.loc ? e.loc.line : null;
      const message = String(e.message).replace(/\s*\(\d+:\d+\)$/, '');
      result.error = { type: 'Syntax Error', message, line };
      result.diagnostics = [{ line: line || 0, column: e.loc ? e.loc.column + 1 : 0, severity: 'error', message }];
      return finish();
    }

    const T = new Tracer(inst.sites, { maxSteps, deadline: started + (deps.timeoutMs || 10000) });
    const fakeConsole = {};
    for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
      fakeConsole[m] = (...a) => T.print(a.map((x) => formatForConsole(x)).join(' ') + '\n');
    }
    const defs = (deps.definitions || '').trim() ? deps.definitions + '\n' : '';
    const declaredIn = (text, n) => new RegExp('(?:\b(?:function|class)\s+' + n + '\b|\b(?:var|let|const)\s+' + n + '\s*=)').test(text);
    const fnNames = inst.topLevel.functions.map((f) => f.name);
    const globalNames = inst.topLevel.globals;
    const CLASS_NAMES = ['ListNode', 'TreeNode', 'Node'];
    const epilogue = '\n;return { fns: {' + fnNames.map((n) => JSON.stringify(n) + ': ' + n).join(', ') + '}, ' +
      'globals: () => [' + globalNames.join(', ') + '], classes: {' +
      CLASS_NAMES.map((n) => n + ': typeof ' + n + ' === "undefined" ? undefined : ' + n).join(', ') + '} };';
    const buildFactory = (definitions) => {
      const fallback = Object.keys(HELPERS)
        .filter((h) => !inst.topLevel.declared.includes(h) && !declaredIn(definitions, h)).map((h) => HELPERS[h]).join('\n');
      // Shadow the obvious escape hatches; the worker also deletes network APIs before running anything.
      return new Function('__t', 'console', 'self', 'globalThis', 'postMessage', 'importScripts', 'fetch', 'XMLHttpRequest', 'WebSocket',
        definitions + fallback + '\n' + inst.code + epilogue);
    };


    let mod;
    let activeDefs = defs;
    try {
      let factory;
      try {
        factory = buildFactory(defs);
      } catch (e) {
        // the solution declares a name the definitions also declare: the solution's own declaration wins
        if (!defs || !(e instanceof SyntaxError)) throw e;
        activeDefs = '';
        factory = buildFactory('');
      }
      try {
        mod = factory(T, fakeConsole);
      } catch (e) {
        if (!defs || !(e instanceof SyntaxError || (e instanceof TypeError && /redeclar|already/i.test(e.message)))) throw e;
        activeDefs = '';
        mod = buildFactory('')(T, fakeConsole);
      }
    } catch (e) {
      result.status = 'RUNTIME_ERROR';
      result.error = { type: (e && e.name) || 'Error', message: String(e && e.message || e) };
      result.stdout = T.out;
      return finish();
    }

    const invalid = (message) => {
      result.status = 'INVALID_INPUT';
      result.error = { type: 'Invalid Input', message };
      result.stdout = T.out;
      return finish();
    };
    const kinds = {};
    const defined = (n) => typeof mod.classes[n] === 'function';
    if (defined('TreeNode')) kinds.TreeNode = 'tree';
    if (defined('ListNode')) kinds.ListNode = 'list';
    if (defined('Node')) kinds.Node = nodeKind(activeDefs || code);
    const env = { classes: mod.classes, kinds, adapter: adapter(mod.classes), built: [] };
    let call;
    const design = designProblem(testCase, mod.fns);
    if (design) {
      const clean = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
      call = () => {
        // constructor arguments typed by the JSDoc of `var BSTIterator = function(root)` (a tree or list is built)
        const ctorInfo = inst.topLevel.functions.find((f) => f.name === design.ops[0] && !f.isClass);
        env.built = [];
        const ctorArgs = clean(design.params[0]).map((v, i) => (ctorInfo ? convertArg(v, ctorInfo.types[ctorInfo.params[i]], env) : v));
        const obj = new design.C(...ctorArgs);
        const outputs = [null];
        for (let i = 1; i < design.ops.length; i++) {
          const m = obj[design.ops[i]];
          if (typeof m !== 'function') throw new InvalidInput(`Operation ${i + 1}: ${design.ops[0]} has no method ${design.ops[i]}`);
          const r = m.apply(obj, clean(design.params[i]));
          outputs.push(r === undefined ? null : toJson(r));
        }
        return outputs;
      };
    } else {
      const target = pickTarget(inst.topLevel, testCase, env);
      if (!target) return invalid('No top-level function was found to call.');
      let args;
      try {
        args = resolveArgs(target, testCase, env).args;
      } catch (e) {
        return invalid(`Calling ${target.name}(${target.params.join(', ')}): ${e.message}`);
      }
      let fn = mod.fns[target.owner || target.name];
      let self;
      if (target.owner) {
        self = new fn();
        fn = self[target.name];
      }
      const returnsNode = Boolean(kinds[normType(target.types.$return)]);
      call = () => {
        const ret = fn.apply(self, args);
        if (ret === undefined) result.inPlace = true;
        if (ret === null && returnsNode) return []; // an empty list/tree prints as [] like LeetCode
        return toJson(ret === undefined && args.length ? args[0] : ret);
      };
    }

    T.globalNames = globalNames;
    T.globalsGetter = mod.globals;
    T.tracing = true;
    try {
      result.output = call();
    } catch (e) {
      if (e instanceof InvalidInput) {
        T.tracing = false;
        result.steps = T.steps;
        return invalid(e.message);
      }
      if (T.halted === 'STEP_LIMIT') {
        result.status = 'STEP_LIMIT';
        result.error = { type: 'Step Limit', message: 'Execution exceeded ' + maxSteps + ' steps (infinite loop?). The first ' + maxSteps + ' steps are shown.', line: lastLine(T) };
      } else if (T.halted === 'TIMEOUT') {
        result.status = 'TIMEOUT';
        result.error = { type: 'Timeout', message: 'Execution exceeded ' + Math.round((deps.timeoutMs || 10000) / 1000) + ' seconds.', line: lastLine(T) };
      } else {
        const info = (e !== null && typeof e === 'object' && T.errorInfo.get(e)) || T.lastErrorInfo || {};
        const isRange = e instanceof RangeError && /call stack/i.test(e.message);
        result.status = 'RUNTIME_ERROR';
        result.error = {
          type: isRange ? 'Stack Overflow' : (e && e.name) || 'Error',
          message: String(e && e.message !== undefined ? e.message : e), line: info.line, function: info.function,
        };
        const last = T.steps[T.steps.length - 1];
        if (last) T.steps.push({ ...last, step: T.steps.length, event: 'EXCEPTION', line: info.line || last.line, exception: result.error, out: undefined });
      }
    } finally {
      T.tracing = false;
    }
    result.steps = T.steps;
    result.stdout = T.out;
    return finish();
  }

  function lastLine(T) {
    const last = T.steps[T.steps.length - 1];
    return last ? last.line : null;
  }

  const api = { runTrace, Tracer, HeapWalker };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LCVTracer = api;
})(typeof self !== 'undefined' ? self : this);
