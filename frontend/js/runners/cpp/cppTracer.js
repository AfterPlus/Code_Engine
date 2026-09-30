/*
 * C / C++ tracer + LeetCode harness. `runTrace` parses the definitions and the solution, runs the selected function
 * with the test case, and returns a result in exactly the normalized shape the other engines produce (see
 * ExecutionResult.java): steps with call stacks, locals and a heap snapshot, output, status and error.
 */
(function (root) {
  'use strict';
  const NS = root.LCVCpp || (root.LCVCpp = {});
  const {
    Dbl, Chr, Vec, Deq, Stk, Que, PQ, Pair, Tup, Obj, Ptr, Ref, Cell, MapObj, Iter, Fn, CppError, CppThrow,
  } = NS;

  const HALT = Object.freeze({ __lcvHalt: true });
  const MAX_ELEMENTS = 256;
  const MAX_OBJECTS = 400;
  const MAX_OUTPUT = 65536;
  const MAX_FRAMES = 50;

  // ---------------------------------------------------------------------------------------------- heap encoding

  class HeapWalker {
    constructor(ids, interp) {
      this.ids = ids; this.interp = interp; this.heap = {}; this.pending = []; this.queued = new Set();
    }

    idOf(obj) {
      let id = this.ids.map.get(obj);
      if (!id) { id = String(++this.ids.seq); this.ids.map.set(obj, id); }
      return id;
    }

    ref(obj) {
      const id = this.idOf(obj);
      if (!this.queued.has(id) && this.queued.size < MAX_OBJECTS) { this.queued.add(id); this.pending.push([id, obj]); }
      return { ref: id };
    }

    encode(v) {
      if (v === null || v === undefined) return null;
      switch (typeof v) {
        case 'boolean': return v;
        case 'number': return Number.isFinite(v) ? v : { n: String(v) };
        case 'bigint': return { n: v.toString() };
        case 'string': return { str: v.length > 500 ? v.slice(0, 500) + '…' : v };
        default: break;
      }
      if (v instanceof Dbl) return Number.isFinite(v.v) ? v.v : { n: Number.isNaN(v.v) ? 'nan' : v.v > 0 ? 'inf' : '-inf' };
      if (v instanceof Chr) return { c: v.c === 0 ? '\\0' : String.fromCharCode(v.c) };
      if (v instanceof Ptr) {
        if (v.k === 'cell') return this.encode(v.o.v);
        if (v.k === 'elem') return v.i === 0 || !(v.o instanceof Vec) ? this.ref(v.o) : this.ref(v.o);
        return this.ref(v.o);
      }
      if (v instanceof Fn) return { fn: v.kind === 'lambda' ? 'lambda' : (v.name || (v.defs && v.defs[0].name) || 'function') };
      if (v instanceof Iter) {
        if (v.assoc) return v.e ? this.ref(v.c.isSet ? v.e : v.e) : { str: 'end()' };
        return { str: 'iterator[' + v.i + ']' };
      }
      if (v instanceof Ref) return this.encode(v.v);
      if (typeof v === 'object') return this.ref(v);
      return { str: String(v) };
    }

    drain() {
      while (this.pending.length) {
        const [id, obj] = this.pending.shift();
        this.heap[id] = this.describe(id, obj);
      }
      return this.heap;
    }

    seq(values) {
      const out = [];
      const n = Math.min(values.length, MAX_ELEMENTS);
      for (let i = 0; i < n; i++) out.push(this.encode(values[i]));
      return out;
    }

    describe(id, o) {
      const h = { id };
      const trunc = (len) => { if (len > MAX_ELEMENTS) { h.length = len; h.truncated = true; } };
      if (o instanceof Vec) {
        h.kind = o.kind; h.type = o.tname || 'vector'; h.elems = this.seq(o.a); trunc(o.a.length);
      } else if (o instanceof Deq) {
        h.kind = 'deque'; h.type = 'deque'; h.elems = this.seq(o.a); trunc(o.a.length);
      } else if (o instanceof Stk) {
        h.kind = 'stack'; h.type = 'stack'; h.elems = this.seq(o.a); trunc(o.a.length);
      } else if (o instanceof Que) {
        h.kind = 'queue'; h.type = 'queue'; h.elems = this.seq(o.a); trunc(o.a.length);
      } else if (o instanceof PQ) {
        h.kind = 'pq'; h.type = 'priority_queue'; h.elems = this.seq(o.a); trunc(o.a.length);
      } else if (o instanceof MapObj) {
        const list = this.interp.lib.mapEntries(o);
        if (o.isSet) { h.kind = 'set'; h.type = o.tname; h.elems = this.seq(list.map((e) => e.first)); } else {
          h.kind = 'map'; h.type = o.tname; h.entries = [];
          for (const e of list) { if (h.entries.length >= MAX_ELEMENTS) break; h.entries.push([this.encode(e.first), this.encode(e.second)]); }
        }
        trunc(list.length);
      } else if (o instanceof Pair) {
        h.kind = 'array'; h.type = 'pair'; h.elems = [this.encode(o.first), this.encode(o.second)];
      } else if (o instanceof Tup) {
        h.kind = 'array'; h.type = 'tuple'; h.elems = this.seq(o.a);
      } else if (o instanceof Obj) {
        h.kind = 'object'; h.type = o.cls.name; h.fields = {};
        for (const k of Object.keys(o.f)) h.fields[k] = this.encode(o.f[k]);
      } else {
        h.kind = 'opaque'; h.type = (o.constructor && o.constructor.name) || 'object';
      }
      return h;
    }
  }

  // ---------------------------------------------------------------------------------------------- tracer

  class Tracer {
    constructor(opts) {
      this.maxSteps = opts.maxSteps;
      this.deadline = opts.deadline;
      this.tracing = false;
      this.halted = null;
      this.steps = [];
      this.stack = [];
      this.callSeq = 0;
      this.ids = { map: new WeakMap(), seq: 0 };
      this.out = '';
      this.outSeen = 0;
      this.interp = null;
      this.lastErrorInfo = null;
    }

    print(text) {
      if (this.out.length < MAX_OUTPUT) this.out += text.slice(0, MAX_OUTPUT - this.out.length);
    }

    enter(info) {
      if (!this.tracing) return null;
      if (this.halted) throw HALT;
      const parent = this.stack[this.stack.length - 1];
      const f = { id: ++this.callSeq, parentId: parent ? parent.id : null, name: info.name, line: info.line, argNames: info.args, env: info.env, thisObj: info.thisObj, retVal: undefined, justEntered: false };
      this.stack.push(f);
      this.snap('FUNCTION_ENTER', f, false);
      f.justEntered = true;
      return f;
    }

    step(f, line, env) {
      if (!this.tracing || !f) return;
      if (this.halted) throw HALT;
      const same = f.justEntered && f.line === line;
      f.justEntered = false;
      f.line = line;
      f.env = env;
      this.lastErrorInfo = { line, function: f.name };
      if (!same) this.snap('LINE', f, false);
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

    localsOf(f, hw) {
      const chain = [];
      for (let e = f.env; e; e = e.parent) { chain.push(e); if (e.root) break; }
      chain.reverse();
      const out = {};
      for (const e of chain) {
        for (const [k, cell] of e.vars) {
          const v = cell.v;
          if (v instanceof Fn || v === undefined) { if (k in out) delete out[k]; continue; }
          out[k] = hw.encode(v);
        }
      }
      const self = f.thisObj && f.thisObj instanceof Ptr ? f.thisObj.o : null;
      if (self instanceof Obj && Object.keys(self.f).length) out.this = hw.encode(f.thisObj);
      return out;
    }

    snap(event, f, isExit) {
      if (this.steps.length >= this.maxSteps) { this.halted = 'STEP_LIMIT'; throw HALT; }
      if ((this.steps.length & 63) === 0 && Date.now() > this.deadline) { this.halted = 'TIMEOUT'; throw HALT; }
      const hw = new HeapWalker(this.ids, this.interp);
      const callStack = this.stack.slice(-MAX_FRAMES).map((fr) => ({
        id: fr.id, parentId: fr.parentId, name: fr.name, line: fr.line, args: fr.argNames, locals: this.localsOf(fr, hw),
      }));
      const step = { step: this.steps.length, line: f.line, event, function: f.name, callId: f.id, parentCallId: f.parentId, callStack, stackDepth: this.stack.length };
      if (isExit && f.retVal !== undefined) step.returnValue = hw.encode(f.retVal);
      const names = this.interp ? this.interp.userGlobals : [];
      if (names.length) {
        const g = {};
        for (const n of names) {
          const c = this.interp.G.vars.get(n);
          if (c && !(c.v instanceof Fn)) g[n] = hw.encode(c.v);
        }
        if (Object.keys(g).length) step.globals = g;
      }
      step.heap = hw.drain();
      if (this.out.length > this.outSeen) { step.out = this.out.slice(this.outSeen); this.outSeen = this.out.length; }
      this.steps.push(step);
    }
  }

  // ---------------------------------------------------------------------------------------------- LeetCode structures over interpreter objects

  const structureAdapter = (I) => ({
    make(cls, val) {
      const cd = I.classes.get(cls);
      if (!cd) throw new (NS.Structures().StructureError)('class ' + cls + ' is not defined (add it in the Definitions tab)');
      const usable = cd.ctors.some((c) => c.params.length >= 1 && c.required <= 1);
      let o;
      if (usable) o = I.constructObject(cd, [val]);
      else { o = I.newObject(cd); if ('val' in o.f) o.f.val = I.coerce(I.fieldType(cd, 'val'), val); }
      return new Ptr('obj', o);
    },
    get: (n, f) => { const v = n.o.f[f]; return v === undefined ? null : v; },
    set: (n, f, v) => { n.o.f[f] = v; },
    has: (n, f) => n instanceof Ptr && n.o instanceof Obj && Object.prototype.hasOwnProperty.call(n.o.f, f),
    newList: (items) => new Vec(items, NS.mkType('Node', [], 1), 'list', 'vector<Node*>'),
    items: (l) => (l instanceof Vec ? l.a : null),
    isNode: (x) => x instanceof Ptr && x.o instanceof Obj,
    className: (n) => n.o.cls.name,
  });

  NS.Structures = () => root.LCVStructures || (typeof require !== 'undefined' ? require('../structures.js') : null);

  function nodeKindOfClass(I, cd) {
    const fields = I.allFields(cd);
    if (fields.includes('children')) return 'nary';
    if (fields.includes('neighbors') || fields.includes('neighbours')) return 'graph';
    if (fields.includes('random')) return 'random';
    if (fields.includes('left') && fields.includes('right')) return fields.includes('next') ? 'nextptr' : 'tree';
    if (fields.includes('next')) return 'list';
    return null;
  }

  // ---------------------------------------------------------------------------------------------- JSON <-> values

  class InvalidInput extends Error {}

  function plainJson(I, v, depth) {
    const S = NS.Structures();
    if (depth > 40) return '…';
    if (v === null || v === undefined) return null;
    switch (typeof v) {
      case 'boolean': case 'string': return v;
      case 'number': return v;
      case 'bigint': return v >= -9007199254740991n && v <= 9007199254740991n ? Number(v) : v.toString();
      default: break;
    }
    if (v instanceof Dbl) return Number.isFinite(v.v) ? v.v : String(v.v);
    if (v instanceof Chr) return String.fromCharCode(v.c);
    if (v instanceof Vec || v instanceof Deq) {
      if (v instanceof Vec && v.kind === 'array' && v.et && v.et.cls === 'char' && v.a.length && v.a[v.a.length - 1] instanceof Chr && v.a[v.a.length - 1].c === 0) {
        return I.lib.cString(new Ptr('elem', v, 0));
      }
      return v.a.map((x) => plainJson(I, x, depth + 1));
    }
    if (v instanceof Stk || v instanceof Que || v instanceof PQ) return v.a.map((x) => plainJson(I, x, depth + 1));
    if (v instanceof Pair) return [plainJson(I, v.first, depth + 1), plainJson(I, v.second, depth + 1)];
    if (v instanceof Tup) return v.a.map((x) => plainJson(I, x, depth + 1));
    if (v instanceof MapObj) {
      const list = I.lib.mapEntries(v);
      if (v.isSet) return list.map((e) => plainJson(I, e.first, depth + 1));
      const o = {};
      for (const e of list) o[typeof e.first === 'string' ? e.first : String(plainJson(I, e.first, depth + 1))] = plainJson(I, e.second, depth + 1);
      return o;
    }
    if (v instanceof Ptr) {
      if (v.k === 'obj' && v.o instanceof Obj) {
        const ad = structureAdapter(I);
        const kind = S.kindOfNode(v, ad);
        if (kind) return S.serialize(kind, v, ad, (x) => plainJson(I, x, depth + 1));
        return plainJson(I, v.o, depth + 1);
      }
      if (v.k === 'cell') return plainJson(I, v.o.v, depth + 1);
      if (v.k === 'elem') return plainJson(I, v.o, depth + 1);
      return plainJson(I, v.o, depth + 1);
    }
    if (v instanceof Obj) {
      const o = {};
      for (const k of Object.keys(v.f)) o[k] = plainJson(I, v.f[k], depth + 1);
      return o;
    }
    return String(v);
  }

  /** JSON test-case value -> interpreter value of the declared parameter type. */
  function fromJson(I, json, t, ctx) {
    if (t && t.r) t = { ...t, r: false };
    if (json === null || json === undefined) {
      return t && t.p > 0 ? null : (t ? I.defaultValue(t) : null);
    }
    if (!t || t.n === 'auto') return jsonPlain(I, json);
    const S = NS.Structures();
    if (t.p > 0) {
      const cd = I.classes.get(t.n);
      if (cd && t.p === 1) {
        const kind = ctx.kinds[t.n] || nodeKindOfClass(I, cd);
        if (!Array.isArray(json)) return S.findNodeByValue(ctx.built, json, ctx.adapter);
        if (!kind) throw new InvalidInput(`cannot build a ${t.n} from an array`);
        let node;
        try { node = S.build(kind, t.n, json, ctx.adapter); } catch (e) { throw new InvalidInput(e.message); }
        if (node) ctx.built.push(node);
        return node;
      }
      // C-style pointer to an array
      if (Array.isArray(json)) {
        const inner = { ...t, p: t.p - 1 };
        const a = json.map((x) => fromJson(I, x, inner, ctx));
        const tn = NS.typeName(inner) + '[]';
        return new Ptr('elem', new Vec(a, inner, 'array', tn), 0);
      }
      if (typeof json === 'string' && t.n === 'char') return I.lib.cStringLiteral(json);
      return null;
    }
    switch (t.cls) {
      case 'i32': case 'u32': case 'i64': case 'u64': case 'i16': case 'u16': case 'i8': case 'u8':
        if (typeof json === 'string' && /^-?\d+$/.test(json)) return I.coerce(t, BigInt(json));
        if (typeof json !== 'number') throw new InvalidInput(`expected a number for ${NS.typeName(t)}`);
        return I.coerce(t, json);
      case 'f64': case 'f32': return I.coerce(t, typeof json === 'number' ? json : parseFloat(json));
      case 'bool': return Boolean(json);
      case 'char': return new Chr(typeof json === 'string' ? json.charCodeAt(0) : json);
      case 'string': if (Array.isArray(json)) return json.join(''); return String(json);
      default: break;
    }
    switch (t.n) {
      case 'vector': case 'list': case 'deque': case 'array': case 'initializer_list': case 'forward_list': {
        if (!Array.isArray(json)) throw new InvalidInput(`expected an array for ${NS.typeName(t)}`);
        const et = t.a[0] || null;
        const a = json.map((x) => fromJson(I, x, et, ctx));
        if (t.n === 'deque') return new Deq(a, et);
        return new Vec(a, et, t.n === 'array' ? 'array' : 'list', NS.typeName(t));
      }
      case 'pair': return new Pair(fromJson(I, json[0], t.a[0], ctx), fromJson(I, json[1], t.a[1], ctx));
      case 'tuple': return new Tup(json.map((x, i) => fromJson(I, x, t.a[i], ctx)));
      case 'set': case 'unordered_set': case 'multiset': {
        const s = I.constructValue(t, []);
        for (const x of json) I.lib.setInsert(s, fromJson(I, x, t.a[0], ctx));
        return s;
      }
      case 'map': case 'unordered_map': {
        const m = I.constructValue(t, []);
        const entries = Array.isArray(json) ? json : Object.entries(json);
        for (const [k, v] of entries) I.lib.mapInsert(m, fromJson(I, k, t.a[0], ctx), fromJson(I, v, t.a[1], ctx));
        return m;
      }
      default: break;
    }
    const cd = I.classes.get(t.n);
    if (cd) {
      if (Array.isArray(json)) return I.constructValue(t, json.map((x) => jsonPlain(I, x)));
      return jsonPlain(I, json);
    }
    return jsonPlain(I, json);
  }

  function jsonPlain(I, json) {
    if (json === null) return null;
    if (typeof json === 'number') return json;
    if (typeof json === 'boolean' || typeof json === 'string') return json;
    if (Array.isArray(json)) return new Vec(json.map((x) => jsonPlain(I, x)), null, 'list', 'vector');
    return json;
  }

  // ---------------------------------------------------------------------------------------------- default definitions

  const DEFAULT_DEFS = {
    ListNode: `struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};
`,
    TreeNode: `struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};
`,
  };
  const DEFAULT_DEFS_C = {
    ListNode: 'struct ListNode {\n    int val;\n    struct ListNode *next;\n};\n',
    TreeNode: 'struct TreeNode {\n    int val;\n    struct TreeNode *left;\n    struct TreeNode *right;\n};\n',
  };

  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

  // ---------------------------------------------------------------------------------------------- harness

  /**
   * @param {string} code  the solution
   * @param {string} definitions  LeetCode's helper types (TreeNode, ListNode, Node ...), never traced
   * @param {object} testCase  named arguments
   * @param {{language: 'c'|'cpp', maxSteps?: number, timeoutMs?: number}} opts
   */
  function runTrace(code, definitions, testCase, opts) {
    const started = Date.now();
    const language = opts.language === 'c' ? 'c' : 'cpp';
    const maxSteps = opts.maxSteps || 5000;
    const result = { language, status: 'SUCCESS', steps: [], stdout: '' };
    const finish = (T) => { if (T) { result.steps = T.steps; result.stdout = T.out; } result.executionTimeMs = Date.now() - started; return result; };
    testCase = testCase || {};

    // ---- parse
    let defsText = (definitions || '').trim() ? definitions + '\n' : '';
    const codeMasked = stripComments(code);
    const declared = (text, n) => new RegExp(`\\b(?:struct|class)\\s+${n}\\s*(?::[^{;]*)?\\{|\\}\\s*${n}\\s*;|\\busing\\s+${n}\\s*=`).test(text);
    const table = language === 'c' ? DEFAULT_DEFS_C : DEFAULT_DEFS;
    for (const name of Object.keys(table)) {
      if (new RegExp(`\\b${name}\\b`).test(codeMasked) && !declared(codeMasked, name) && !declared(stripComments(defsText), name)) defsText += table[name];
    }
    let defsAst = null;
    if (defsText.trim()) {
      const d = NS.parse(defsText, 'defs');
      if (d.error) return compileError(result, d.error, 'definitions', finish);
      defsAst = d.ast;
    }
    const u = NS.parse(code, 'user');
    if (u.error) return compileError(result, u.error, 'solution', finish);

    const T = new Tracer({ maxSteps, deadline: started + (opts.timeoutMs || 10000) });
    const I = new NS.Interp({
      tracer: T, mode: language, write: (t) => T.print(t),
      parseSnippet: (text) => { const r = NS.parse(text, 'macro'); if (r.error) return null; const decl = r.ast.c[0]; return decl && decl.f.declarator ? decl.f.declarator.f.value : null; },
    });
    T.interp = I;

    const fail = (status, type, message, line, fn) => {
      result.status = status;
      result.error = { type, message, line: line || null };
      if (fn) result.error.function = fn;
      return finish(T);
    };
    const runtimeFailure = (e) => {
      if (e === HALT || (e && e.__lcvHalt)) return haltResult();
      if (e instanceof CppThrow) {
        const what = e.value instanceof Obj && e.value.cls.builtinException ? e.value.f.msg : String(plainJson(I, e.value, 0));
        return errorResult('Uncaught Exception', `terminate called after throwing an exception: ${what}`);
      }
      if (e instanceof CppError) return errorResult(e.type, e.message, e.line);
      if (e instanceof RangeError && /call stack/i.test(e.message)) return errorResult('Stack Overflow', 'stack overflow: the recursion is too deep');
      if (e instanceof InvalidInput) { result.status = 'INVALID_INPUT'; result.error = { type: 'Invalid Input', message: e.message }; return finish(T); }
      if (NS.Structures() && e instanceof NS.Structures().StructureError) { result.status = 'INVALID_INPUT'; result.error = { type: 'Invalid Input', message: e.message }; return finish(T); }
      return errorResult('Internal Error', String(e && e.stack || e));
    };
    function errorResult(type, message, line) {
      const info = T.lastErrorInfo || {};
      result.status = 'RUNTIME_ERROR';
      result.error = { type, message, line: line || info.line || null, function: info.function };
      const last = T.steps[T.steps.length - 1];
      if (last) T.steps.push({ ...last, step: T.steps.length, event: 'EXCEPTION', line: result.error.line || last.line, exception: result.error, out: undefined, returnValue: undefined });
      return finish(T);
    }
    function haltResult() {
      const last = T.steps[T.steps.length - 1];
      if (T.halted === 'TIMEOUT') {
        result.status = 'TIMEOUT';
        result.error = { type: 'Timeout', message: 'Execution exceeded ' + Math.round((opts.timeoutMs || 10000) / 1000) + ' seconds.', line: last ? last.line : null };
      } else {
        result.status = 'STEP_LIMIT';
        result.error = { type: 'Step Limit', message: 'Execution exceeded ' + maxSteps + ' steps (infinite loop?). The first ' + maxSteps + ' steps are shown.', line: last ? last.line : null };
      }
      return finish(T);
    }

    // ---- load
    try {
      if (defsAst) I.load(defsAst, 'defs');
      I.load(u.ast, 'user');
    } catch (e) {
      return runtimeFailure(e);
    }

    // ---- pick what to call
    const S = NS.Structures();
    const kinds = {};
    for (const [name, cd] of I.classes) { const k = nodeKindOfClass(I, cd); if (k) kinds[name] = k; }
    const ctx = { kinds, built: [], adapter: structureAdapter(I) };

    const userFuncs = [];
    for (const [name, defs] of I.funcs) for (const d of defs) if (d.file === 'user' && name !== 'main') userFuncs.push({ owner: null, name, def: d });
    for (const [cname, cd] of I.classes) {
      if (cd.file !== 'user') continue;
      for (const [mname, defs] of cd.methods) for (const d of defs) if (!mname.startsWith('operator') && !d.isCtor) userFuncs.push({ owner: cd, name: mname, def: d });
    }
    const mainDefs = I.funcs.get('main');

    // class-design problems: ["MinStack","push","top"] with [[],[-2],[]]
    const design = designProblem(testCase, I);
    let call;
    let returnsNode = false;
    if (design) {
      call = () => {
        const cd = design.cd;
        const obj = I.constructObject(cd, design.params[0].map((x, i) => fromJson(I, x, ctorParamType(cd, design.params[0].length, i), ctx)));
        const ptr = new Ptr('obj', obj);
        const outs = [null];
        for (let i = 1; i < design.ops.length; i++) {
          const ms = I.findMethods(cd, design.ops[i]);
          if (!ms) throw new InvalidInput(`Operation ${i + 1}: ${cd.name} has no method ${design.ops[i]}`);
          const d = I.pickOverload(ms, design.params[i]);
          if (!d) throw new InvalidInput(`Operation ${i + 1}: ${design.ops[i]} does not take ${design.params[i].length} argument(s)`);
          const args = design.params[i].map((x, k) => fromJson(I, x, d.params[k] && d.params[k].type, ctx));
          const r = I.callFunction(d, args, ptr, false);
          outs.push(r === undefined ? null : plainJson(I, r, 0));
        }
        return outs;
      };
    } else if (mainDefs && (!userFuncs.length || Object.keys(testCase).length === 0)) {
      call = () => { const r = I.callFunction(mainDefs[0], [], null, false); return r === undefined ? 0 : plainJson(I, r, 0); };
    } else {
      const target = pickTarget(userFuncs, testCase);
      if (!target) return invalidInput(result, T, finish, 'No function was found to call.');
      const def = target.def;
      let argInfo;
      try {
        argInfo = resolveArgs(I, def, testCase, ctx, language);
      } catch (e) {
        if (e instanceof InvalidInput) return invalidInput(result, T, finish, `Calling ${target.name}(${def.params.map((p) => p.name).join(', ')}): ${e.message}`);
        return runtimeFailure(e);
      }
      let thisObj = null;
      if (target.owner) {
        try { thisObj = new Ptr('obj', I.constructObject(target.owner, [])); } catch (e) { return runtimeFailure(e); }
      }
      returnsNode = Boolean(def.ret && def.ret.p === 1 && kinds[def.ret.n]);
      call = () => {
        const ret = I.callFunction(def, argInfo.args, def.isStatic ? null : thisObj, false);
        return language === 'c' ? cResult(I, def, ret, argInfo, returnsNode) : cppResult(I, def, ret, argInfo, returnsNode, result);
      };
    }

    // ---- run
    T.tracing = true;
    try {
      result.output = call();
    } catch (e) {
      T.tracing = false;
      if (e === HALT || (e && e.__lcvHalt)) return haltResult();
      return runtimeFailure(e);
    } finally {
      T.tracing = false;
    }
    void S;
    return finish(T);
  }

  function ctorParamType(cd, n, i) {
    const c = cd.ctors.find((x) => x.params.length === n) || cd.ctors[0];
    return c && c.params[i] ? c.params[i].type : null;
  }

  function compileError(result, err, which, finish) {
    result.status = 'COMPILE_ERROR';
    const inDefs = which === 'definitions';
    result.error = { type: 'Syntax Error', message: (inDefs ? 'In the Definitions tab: ' : '') + err.message, line: err.line };
    if (inDefs) result.error.file = 'definitions';
    result.diagnostics = [{ line: err.line, column: err.column, severity: 'error', message: err.message, file: inDefs ? 'definitions' : undefined }];
    return finish(null);
  }

  function invalidInput(result, T, finish, message) {
    result.status = 'INVALID_INPUT';
    result.error = { type: 'Invalid Input', message };
    return finish(T);
  }

  function designProblem(tc, I) {
    const vals = Object.values(tc);
    if (vals.length !== 2) return null;
    const [ops, params] = vals;
    if (!Array.isArray(ops) || !Array.isArray(params) || !ops.length || ops.length !== params.length) return null;
    if (!ops.every((o) => typeof o === 'string') || !params.every(Array.isArray)) return null;
    const cd = I.classes.get(ops[0]);
    return cd && cd.file === 'user' ? { cd, ops, params } : null;
  }

  function pickTarget(funcs, tc) {
    const keys = Object.keys(tc);
    let best = null;
    let bestScore = -Infinity;
    for (const f of funcs) {
      const names = f.def.params.map((p) => p.name);
      let score = 0;
      for (const n of names) if (keys.includes(n)) score += 10;
      if (names.length === keys.length) score += 5;
      // C conventions: the *Size / returnSize parameters are not part of the test case
      const visible = names.filter((n) => !isSizeParam(n, names));
      if (visible.length === keys.length) score += 6;
      if (score > bestScore) { bestScore = score; best = f; }
    }
    return best;
  }

  const isSizeParam = (n, names) => n === 'returnSize' || n === 'returnColumnSizes' || (/^(.+?)(Size|ColSize|Len|Length)$/.test(n) && names.includes(n.replace(/(Size|ColSize|Len|Length)$/, '')));

  /** Matches test-case values to parameters by name, then in order; C's size / return conventions are filled in. */
  function resolveArgs(I, def, tc, ctx, language) {
    const names = def.params.map((p) => p.name);
    const provided = names.filter((n) => Object.prototype.hasOwnProperty.call(tc, n));
    const spare = Object.keys(tc).filter((k) => !names.includes(k)).map((k) => tc[k]);
    const info = { args: [], returnSize: null, colSizes: null, arrays: {} };
    const rawByName = {};
    const argsList = [];
    def.params.forEach((p) => {
      const n = p.name;
      if (language === 'c' && isSizeParam(n, names)) { argsList.push({ p, size: true }); return; }
      let raw;
      if (Object.prototype.hasOwnProperty.call(tc, n)) raw = tc[n];
      else if (spare.length) raw = spare.shift();
      else throw new InvalidInput(`Missing test-case value for parameter '${n}'` + (Object.keys(tc).length ? ` (the test case provides: ${Object.keys(tc).join(', ')})` : ' (the test case is empty)'));
      rawByName[n] = raw;
      argsList.push({ p, raw });
    });
    void provided;
    for (const a of argsList) {
      const p = a.p;
      if (a.size) {
        const n = p.name;
        if (n === 'returnSize') { const cell = new Cell(0, NS.mkType('int')); info.returnSize = cell; info.args.push(new Ptr('cell', cell)); continue; }
        if (n === 'returnColumnSizes') { const cell = new Cell(null, NS.mkType('int', [], 1)); info.colSizes = cell; info.args.push(new Ptr('cell', cell)); continue; }
        const base = n.replace(/(Size|ColSize|Len|Length)$/, '');
        const raw = JSON.parse(JSON.stringify(rawByName[base] === undefined ? null : rawByName[base]));
        let len = Array.isArray(raw) ? raw.length : typeof raw === 'string' ? raw.length : 0;
        if (/ColSize$/.test(n) && Array.isArray(raw)) {
          const lens = raw.map((r) => (Array.isArray(r) ? r.length : 0));
          info.args.push(new Ptr('elem', new Vec(lens, NS.mkType('int'), 'array', 'int[]'), 0));
          continue;
        }
        info.args.push(I.coerce(p.type, len));
        continue;
      }
      let t = p.type;
      const raw = JSON.parse(JSON.stringify(a.raw === undefined ? null : a.raw));
      if (language === 'c' && t && t.p === 1 && t.n === 'char' && typeof raw === 'string') { info.args.push(I.lib.cStringLiteral(raw)); continue; }
      const v = fromJson(I, raw, t, ctx);
      if (t && t.p > 0 && v instanceof Ptr && v.k === 'elem') info.arrays[p.name] = v;
      info.args.push(v);
    }
    return info;
  }

  function cppResult(I, def, ret, argInfo, returnsNode, result) {
    const isVoid = def.ret && def.ret.n === 'void' && def.ret.p === 0;
    if (ret === undefined || isVoid) {
      result.inPlace = true;
      const first = argInfo.args[0];
      return first === undefined ? null : plainJson(I, first, 0);
    }
    if (ret === null && returnsNode) return [];
    return plainJson(I, ret, 0);
  }

  /** C conventions: an `int*` return with `*returnSize`, `char*` strings, `void` results in place. */
  function cResult(I, def, ret, argInfo, returnsNode) {
    const isVoid = def.ret && def.ret.n === 'void' && def.ret.p === 0;
    if (isVoid || ret === undefined) {
      const first = argInfo.args.find((a) => a instanceof Ptr && a.k === 'elem');
      if (!first) return null;
      const size = sizeOfArg(def, argInfo, first);
      return arrayToJson(I, first, size, null);
    }
    if (ret === null && returnsNode) return [];
    if (ret instanceof Ptr && ret.k === 'elem' && def.ret && def.ret.n === 'char' && def.ret.p === 1) return I.lib.cString(ret);
    if (ret instanceof Ptr && ret.k === 'elem' && argInfo.returnSize) {
      const n = Number(NS.toInt(argInfo.returnSize.v));
      const cols = argInfo.colSizes && argInfo.colSizes.v instanceof Ptr ? argInfo.colSizes.v : null;
      return arrayToJson(I, ret, n, cols);
    }
    return plainJson(I, ret, 0);
  }

  function sizeOfArg(def, argInfo, ptr) {
    return ptr.o.a.length - ptr.i;
  }

  function arrayToJson(I, ptr, n, colSizes) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const el = ptr.o.a[ptr.i + i];
      if (el instanceof Ptr && el.k === 'elem') {
        const len = colSizes ? Number(NS.toInt(colSizes.o.a[colSizes.i + i])) : null;
        if (len === null && ptr.o.et && ptr.o.et.n === 'char') out.push(I.lib.cString(el));
        else out.push(len === null ? plainJson(I, el, 1) : arrayToJson(I, el, len, null));
      } else out.push(plainJson(I, el, 1));
    }
    return out;
  }

  NS.runTrace = runTrace;
  NS.Tracer = Tracer;
  if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof self !== 'undefined' ? self : globalThis);
