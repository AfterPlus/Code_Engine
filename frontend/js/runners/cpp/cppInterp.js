/*
 * C / C++ tree-walking interpreter. Runs the AST from cppParse.js and reports every statement to a tracer.
 *
 * It is dynamically typed at heart (values carry their own kind, see cppValues.js) but keeps the *declared* types
 * where C++ semantics depend on them: integer width on store, double vs int, references vs copies, and how
 * `{1, 2}` / `(n, 0)` initializers build containers and structs.
 */
(function (root) {
  'use strict';
  const NS = root.LCVCpp || (root.LCVCpp = {});
  const {
    Dbl, Chr, Vec, Deq, Stk, Que, PQ, Pair, Tup, Obj, Ptr, Ref, Cell, InitList, RawAlloc, MapObj, Iter, Fn, CppError, CppThrow,
    wrapInt, num, toInt, arith, compare, ptrEq, truthy, copyVal,
  } = NS;

  const LITERAL_NAMES = { true: 'true', false: 'false', nullptr: 'null', NULL: 'null' };
  const BRK = { k: 'break' };
  const CNT = { k: 'continue' };
  class Ret { constructor(v) { this.v = v; } }

  // ------------------------------------------------------------------------------------------ types

  const SCALAR = {
    int: 'i32', signed: 'i32', 'signed int': 'i32', short: 'i16', 'short int': 'i16', long: 'i64', 'long int': 'i64', 'long long': 'i64',
    'long long int': 'i64', unsigned: 'u32', 'unsigned int': 'u32', 'unsigned short': 'u16', 'unsigned short int': 'u16',
    'unsigned long': 'u64', 'unsigned long int': 'u64', 'unsigned long long': 'u64', 'unsigned long long int': 'u64',
    char: 'char', 'signed char': 'char', 'unsigned char': 'char', bool: 'bool', float: 'f32', double: 'f64', 'long double': 'f64', void: 'void',
    int8_t: 'i8', uint8_t: 'u8', int16_t: 'i16', uint16_t: 'u16', int32_t: 'i32', uint32_t: 'u32', int64_t: 'i64', uint64_t: 'u64',
    size_t: 'u64', ssize_t: 'i64', ptrdiff_t: 'i64', intptr_t: 'i64', uintptr_t: 'u64', string: 'string', wchar_t: 'i32', char16_t: 'u16', char32_t: 'u32',
    __int128: 'i64',
  };

  const mkType = (n, a, p) => ({ n, a: a || [], p: p || 0, r: false, cls: SCALAR[n] || 'obj' });

  /** "long unsigned int" and friends, in one canonical order. */
  function normSized(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const unsigned = words.includes('unsigned');
    const longs = words.filter((w) => w === 'long').length;
    let base = words.includes('char') ? 'char' : words.includes('short') ? 'short' : words.includes('double') ? 'double' : words.includes('float') ? 'float' : 'int';
    if (base === 'double' && longs) return 'long double';
    if (base === 'int' && longs === 1) base = 'long';
    if (base === 'int' && longs >= 2) base = 'long long';
    if (base === 'char' && words.includes('signed') && !unsigned) return 'signed char';
    return (unsigned ? 'unsigned ' : '') + base;
  }

  function typeName(t) {
    if (!t) return 'auto';
    let s = t.n + (t.a.length ? '<' + t.a.map(typeName).join(', ') + '>' : '');
    s += '*'.repeat(t.p);
    return s;
  }

  const SIZES = { i8: 1, u8: 1, char: 1, bool: 1, i16: 2, u16: 2, i32: 4, u32: 4, f32: 4, i64: 8, u64: 8, f64: 8 };

  // ------------------------------------------------------------------------------------------ environments and frames

  class Env {
    constructor(parent, root) {
      this.vars = new Map();
      this.parent = parent || null;
      this.root = !!root;
      this.fr = parent ? parent.fr : null;
      this.thisPtr = parent ? parent.thisPtr : null;
      this.cls = parent ? parent.cls : null;
    }
  }

  class FieldRef extends Ref {
    constructor(o, name, t) { super(); this.o = o; this.name = name; this.t = t; }
    get v() { return this.o.f[this.name]; }
    set v(x) { this.o.f[this.name] = this.t ? NS.interp.coerce(this.t, x) : x; }
  }
  class PairRef extends Ref {
    constructor(p, which) { super(); this.p = p; this.which = which; }
    get v() { return this.p[this.which]; }
    set v(x) { this.p[this.which] = x; }
  }
  class ElemRef extends Ref {
    constructor(a, i, et, owner) { super(); this.a = a; this.i = i; this.et = et; this.owner = owner || null; }
    get v() { return this.a[this.i]; }
    set v(x) { this.a[this.i] = this.et ? NS.interp.coerce(this.et, x) : x; }
  }
  class StrCharRef extends Ref {
    constructor(ref, i) { super(); this.ref = ref; this.i = i; }
    get v() { return new Chr(this.ref.v.charCodeAt(this.i)); }
    set v(x) { const s = this.ref.v; this.ref.v = s.slice(0, this.i) + String.fromCharCode(num(x)) + s.slice(this.i + 1); }
  }
  class MapRef extends Ref {
    constructor(m, k, interp) { super(); this.m = m; this.k = k; this.interp = interp; }
    get v() { return this.interp.lib.mapEntry(this.m, this.k, true).second; }
    set v(x) { const e = this.interp.lib.mapEntry(this.m, this.k, true); e.second = this.m.vt ? this.interp.coerce(this.m.vt, x) : x; }
  }
  class PtrRef extends Ref {
    constructor(p, interp) { super(); this.p = p; this.interp = interp; }
    get v() { return this.interp.derefValue(this.p); }
    set v(x) { this.interp.derefSet(this.p, x); }
  }
  const valueOf = (a) => (a instanceof Ref ? a.v : a);

  // ------------------------------------------------------------------------------------------ interpreter

  class Interp {
    constructor(opts) {
      NS.interp = this;
      this.T = opts.tracer || null;
      this.lib = NS.makeLib(this);
      this.G = new Env(null, true);
      this.funcs = new Map();       // name -> [FuncDef]
      this.classes = new Map();     // name -> ClassDef
      this.typedefs = new Map();    // name -> Type
      this.consts = new Map();      // enum constants (also Enum::NAME)
      this.macros = new Map();
      this.macroCache = new Map();
      this.templateParams = new Set();
      this.unitFile = null;
      this.tracedFile = 'user';
      this.userGlobals = [];
      this.curLine = 0;
      this.depth = 0;
      this.maxDepth = opts.maxDepth || 1500;
      this.callSeq = 0;
      this.statics = new WeakMap();
      this.mode = opts.mode || 'cpp';
      this.parseSnippet = opts.parseSnippet || null;
      this.write = opts.write || (() => {});
    }

    // ---------------------------------------------------------------------------------------- loading

    /** Registers a translation unit's declarations and runs its global initializers. */
    load(ast, file) {
      this.unitFile = file;
      for (const n of ast.c) this.topLevel(n, this.G);
    }

    topLevel(n, env) {
      switch (n.t) {
        case 'comment': case 'preproc_include': case 'using_declaration': case 'namespace_alias_definition': case 'static_assert_declaration': case 'preproc_call': return;
        case 'function_definition': this.defineFunction(n, null); return;
        case 'class_specifier': case 'struct_specifier': case 'union_specifier': this.defineClass(n); return;
        case 'enum_specifier': this.defineEnum(n); return;
        case 'type_definition': this.defineTypedef(n); return;
        case 'alias_declaration': this.typedefs.set(n.f.name.x, this.typeFrom(n.f.type)); return;
        case 'template_declaration': {
          const saved = new Set(this.templateParams);
          const params = n.f.parameters;
          if (params) for (const p of params.c) { const id = p.c.find((c) => c.t === 'type_identifier') || p.f.declarator; if (id && id.x) this.templateParams.add(id.x); }
          for (const c of n.c) if (c !== params) this.topLevel(c, env);
          this.templateParams = saved;
          return;
        }
        case 'namespace_definition': if (n.f.body) for (const c of n.f.body.c) this.topLevel(c, env); return;
        case 'linkage_specification': { const b = n.f.body; if (b) for (const c of (b.t === 'declaration_list' ? b.c : [b])) this.topLevel(c, env); return; }
        case 'preproc_def': this.macros.set(n.f.name.x, n.f.value ? n.f.value.x.trim() : '1'); return;
        case 'preproc_ifdef': case 'preproc_if': case 'preproc_else': case 'preproc_elif':
          for (const c of n.c) if (c.t !== 'identifier' && c.t !== 'preproc_defined') this.topLevel(c, env);
          return;
        case 'declaration': this.globalDeclaration(n, env); return;
        case 'expression_statement': return;
        default: return;
      }
    }

    globalDeclaration(n, env) {
      // a bare struct/class/enum type declared with a variable: `struct P {..} p;`
      const tn = n.f.type;
      if (tn && ['struct_specifier', 'class_specifier', 'union_specifier'].includes(tn.t) && tn.f.body) this.defineClass(tn);
      if (tn && tn.t === 'enum_specifier' && tn.f.body) this.defineEnum(tn);
      this.declare(n, env, true);
      if (this.unitFile === this.tracedFile) {
        for (const d of (n.f.declarator ? (Array.isArray(n.f.declarator) ? n.f.declarator : [n.f.declarator]) : [])) {
          const info = this.declInfo(d);
          if (info.name && !info.isFunc && !this.userGlobals.includes(info.name)) this.userGlobals.push(info.name);
        }
      }
    }

    defineTypedef(n) {
      const tn = n.f.type;
      if (tn && ['struct_specifier', 'class_specifier', 'union_specifier'].includes(tn.t) && tn.f.body) this.defineClass(tn);
      if (tn && tn.t === 'enum_specifier' && tn.f.body) this.defineEnum(tn);
      const decls = Array.isArray(n.f.declarator) ? n.f.declarator : [n.f.declarator];
      for (const d of decls) {
        if (!d) continue;
        const info = this.declInfo(d);
        let t = this.typeFrom(tn);
        if (!t) continue;
        t = { ...t, p: t.p + info.p };
        if (info.name) this.typedefs.set(info.name, t);
      }
    }

    defineEnum(n) {
      const name = n.f.name ? n.f.name.x : null;
      const list = n.f.body;
      if (!list) return;
      let next = 0;
      for (const e of list.c) {
        if (e.t !== 'enumerator') continue;
        if (e.f.value) next = toInt(this.ev(e.f.value, this.G));
        this.consts.set(e.f.name.x, next);
        if (name) this.consts.set(name + '::' + e.f.name.x, next);
        next += 1;
      }
    }

    defineClass(n) {
      const name = n.f.name ? n.f.name.x : null;
      if (!name || !n.f.body) return null;
      let cd = this.classes.get(name);
      if (!cd) {
        cd = { name, fields: [], fieldTypes: Object.create(null), methods: new Map(), ctors: [], statics: new Map(), bases: [], node: n, inits: new Map(), isStruct: n.t === 'struct_specifier', file: this.unitFile, templ: new Set(this.templateParams) };
        this.classes.set(name, cd);
      }
      const baseClause = n.c.find((c) => c.t === 'base_class_clause');
      if (baseClause) for (const b of baseClause.c) if (b.t === 'type_identifier' || b.t === 'template_type' || b.t === 'qualified_identifier') cd.bases.push(this.typeFrom(b).n);
      for (const m of n.f.body.c) this.classMember(cd, m);
      return cd;
    }

    classMember(cd, m) {
      switch (m.t) {
        case 'field_declaration': {
          const isStatic = m.c.some((c) => c.t === 'storage_class_specifier' && c.x === 'static');
          const base = this.typeFrom(m.f.type);
          if (m.f.type && ['struct_specifier', 'class_specifier'].includes(m.f.type.t) && m.f.type.f.body) this.defineClass(m.f.type);
          const decls = m.f.declarator ? (Array.isArray(m.f.declarator) ? m.f.declarator : [m.f.declarator]) : [];
          for (const d of decls) {
            const info = this.declInfo(d);
            if (!info.name) continue;
            if (info.isFunc) continue; // a method prototype: the definition supplies the body
            let t = base ? { ...base, p: base.p + info.p, r: info.r } : null;
            if (t && info.dims.length) t = { ...t, dims: info.dims };
            if (isStatic) {
              cd.statics.set(info.name, new Cell(m.f.default_value ? this.ev(m.f.default_value, this.G) : this.defaultValue(t), t));
            } else {
              cd.fields.push(info.name);
              cd.fieldTypes[info.name] = t;
              if (m.f.default_value) cd.inits.set(info.name, m.f.default_value);
              else if (info.init) cd.inits.set(info.name, info.init);
            }
          }
          return;
        }
        case 'function_definition': this.defineFunction(m, cd); return;
        case 'template_declaration': {
          const saved = new Set(this.templateParams);
          const params = m.f.parameters;
          if (params) for (const p of params.c) { const id = p.c.find((c) => c.t === 'type_identifier'); if (id) this.templateParams.add(id.x); }
          for (const c of m.c) if (c !== params) this.classMember(cd, c);
          this.templateParams = saved;
          return;
        }
        case 'declaration': case 'alias_declaration': case 'type_definition': this.topLevel(m, this.G); return;
        case 'struct_specifier': case 'class_specifier': this.defineClass(m); return;
        case 'enum_specifier': this.defineEnum(m); return;
        default: return;
      }
    }

    /** function_definition -> FuncDef, registered as a free function or as a method of `cd`. */
    defineFunction(n, cd) {
      const d = n.f.declarator;
      if (!d) return;
      let fd = d;
      let extraPtr = 0;
      let retRef = false;
      while (fd && fd.t !== 'function_declarator') {
        if (fd.t === 'pointer_declarator') extraPtr++;
        else if (fd.t === 'reference_declarator') retRef = true;
        fd = fd.f.declarator || fd.c[0];
      }
      if (!fd) return;
      let nameNode = fd.f.declarator;
      if (!nameNode) return;
      let owner = cd;
      let fname;
      if (nameNode.t === 'qualified_identifier') {
        const scope = nameNode.f.scope ? nameNode.f.scope.x : null;
        if (scope && this.classes.has(scope)) owner = this.classes.get(scope);
        nameNode = nameNode.f.name;
      }
      if (nameNode.t === 'destructor_name') return;
      fname = nameNode.t === 'operator_name' ? nameNode.x.replace(/\s+/g, '') : nameNode.x;
      if (nameNode.t === 'template_function') fname = nameNode.f.name.x;
      const body = n.f.body;
      if (!body || body.t !== 'compound_statement') return;
      const isCtor = owner && fname === owner.name;
      const params = this.paramList(fd.f.parameters);
      const ret = n.f.type ? this.typeFrom(n.f.type) : null;
      const isStatic = n.c.some((c) => c.t === 'storage_class_specifier' && c.x === 'static');
      const def = {
        name: fname, params, body, ret: ret && extraPtr ? { ...ret, p: ret.p + extraPtr } : ret, cls: owner || null, isCtor, isStatic,
        node: n, initList: n.c.find((c) => c.t === 'field_initializer_list') || null,
        traced: this.unitFile === this.tracedFile, file: this.unitFile, retRef, templ: new Set(this.templateParams),
      };
      def.required = params.filter((p) => !p.def).length;
      if (owner) {
        if (isCtor) owner.ctors.push(def);
        else {
          if (!owner.methods.has(fname)) owner.methods.set(fname, []);
          owner.methods.get(fname).push(def);
        }
      } else {
        if (!this.funcs.has(fname)) this.funcs.set(fname, []);
        this.funcs.get(fname).push(def);
      }
    }

    paramList(pl) {
      const out = [];
      if (!pl) return out;
      for (const p of pl.c) {
        if (p.t !== 'parameter_declaration' && p.t !== 'optional_parameter_declaration') continue;
        const info = p.f.declarator ? this.declInfo(p.f.declarator) : { name: null, p: 0, r: false, dims: [] };
        let t = this.typeFrom(p.f.type);
        if (t) t = { ...t, p: t.p + info.p + info.dims.length, r: info.r };
        out.push({ name: info.name, type: t, def: p.f.default_value || null });
      }
      // `(void)` means no parameters
      if (out.length === 1 && !out[0].name && out[0].type && out[0].type.n === 'void' && !out[0].type.p) return [];
      return out;
    }

    // ---------------------------------------------------------------------------------------- types and declarators

    typeFrom(n) {
      if (!n) return null;
      switch (n.t) {
        case 'primitive_type': return mkType(n.x);
        case 'sized_type_specifier': return mkType(normSized(n.x));
        case 'type_identifier': case 'identifier': case 'namespace_identifier': {
          if (this.templateParams.has(n.x)) return mkType('auto');
          const alias = this.typedefs.get(n.x);
          if (alias) return { ...alias, a: alias.a.slice() };
          return mkType(n.x);
        }
        case 'template_type': {
          const name = n.f.name.t === 'qualified_identifier' ? n.f.name.f.name.x : n.f.name.x;
          const args = [];
          if (n.f.arguments) for (const a of n.f.arguments.c) args.push(a.t === 'type_descriptor' ? this.typeFrom(a) : a.t === 'number_literal' ? mkType('#' + a.x) : this.typeFrom(a) || mkType('auto'));
          const alias = this.typedefs.get(name);
          return alias ? { ...alias } : mkType(name, args);
        }
        case 'qualified_identifier': return this.typeFrom(n.f.name);
        case 'placeholder_type_specifier': case 'decltype': case 'dependent_type': return mkType('auto');
        case 'struct_specifier': case 'class_specifier': case 'union_specifier': case 'enum_specifier':
          return n.f.name ? this.typeFrom(n.f.name) : mkType('auto');
        case 'type_descriptor': {
          let t = this.typeFrom(n.f.type);
          if (t && n.f.declarator) { t = { ...t }; let d = n.f.declarator; while (d) { if (d.t === 'abstract_pointer_declarator') t.p++; else if (d.t === 'abstract_reference_declarator') t.r = true; d = d.f.declarator || d.c[0]; } }
          return t;
        }
        default: return mkType('auto');
      }
    }

    /** Peels a declarator: {name, names (structured binding), p (pointer depth), r (reference), dims, init, isFunc}. */
    declInfo(d) {
      const info = { name: null, names: null, p: 0, r: false, rr: false, dims: [], init: null, initKind: null, isFunc: false };
      let cur = d;
      while (cur) {
        switch (cur.t) {
          case 'init_declarator': {
            const v = cur.f.value;
            info.init = v;
            info.initKind = v ? (v.t === 'argument_list' ? 'paren' : v.t === 'initializer_list' ? 'brace' : 'eq') : null;
            cur = cur.f.declarator; break;
          }
          case 'pointer_declarator': info.p++; cur = cur.f.declarator || cur.c[0]; break;
          case 'reference_declarator': info.r = true; if (cur.tokens && cur.tokens.includes('&&')) info.rr = true; cur = cur.c[0]; break;
          case 'array_declarator': info.dims.push(cur.f.size || null); cur = cur.f.declarator; break;
          case 'parenthesized_declarator': cur = cur.c[0]; break;
          case 'function_declarator': if (!info.isFunc) info.params = cur.f.parameters; info.isFunc = true; cur = cur.f.declarator; break;
          case 'structured_binding_declarator': info.names = cur.c.map((c) => c.x); cur = null; break;
          case 'qualified_identifier': info.name = cur.f.name.x; info.scope = cur.f.scope ? cur.f.scope.x : null; cur = null; break;
          case 'identifier': case 'field_identifier': case 'type_identifier': info.name = cur.x; cur = null; break;
          default: cur = null;
        }
      }
      info.dims.reverse(); // a[3][4] peels the outer declarator (4) first
      return info;
    }

    /** The value a variable of this type holds before anything is assigned. */
    defaultValue(t) {
      if (!t) return 0;
      if (t.p > 0) return null;
      if (t.dims && t.dims.length) return this.makeArray(t);
      switch (t.cls) {
        case 'f64': case 'f32': return new Dbl(0);
        case 'char': return new Chr(0);
        case 'bool': return false;
        case 'string': return '';
        case 'void': return undefined;
        case 'obj': return this.constructValue(t, []);
        default: return 0;
      }
    }

    makeArray(t) {
      const sizes = t.dims.map((d) => (d ? toInt(this.ev(d, this.G.fr ? this.G : this.G)) : 0));
      return this.buildArray({ ...t, dims: undefined }, sizes, 0);
    }

    buildArray(elemType, sizes, k) {
      const n = Number(sizes[k]);
      const et = k + 1 < sizes.length ? null : elemType;
      const a = [];
      for (let i = 0; i < n; i++) a.push(k + 1 < sizes.length ? this.buildArray(elemType, sizes, k + 1) : this.defaultValue(elemType));
      const tname = typeName(elemType) + '[]';
      return new Vec(a, et || (k + 1 < sizes.length ? null : elemType), 'array', tname);
    }

    // ---------------------------------------------------------------------------------------- coercion

    /** Converts a value to a declared type on store: integer width, double, char, bool, pointers, initializer lists. */
    coerce(t, v) {
      if (!t || v === undefined) return v;
      if (v instanceof Ref) v = v.v;
      if (t.p > 0) {
        if (v instanceof RawAlloc) return this.materialize(t, v);
        if (v === 0 || v === 0n) return null;
        if (v instanceof Vec && v.kind === 'array') return new Ptr('elem', v, 0);
        return v;
      }
      switch (t.cls) {
        case 'i32': case 'u32': case 'i64': case 'u64': case 'i16': case 'u16': case 'i8': case 'u8':
          if (typeof v === 'number' && !Number.isInteger(v)) v = toInt(v);
          if (typeof v === 'number' && t.cls === 'i32' && v >= -2147483648 && v <= 2147483647) return v;
          return wrapInt(toInt(v), t.cls);
        case 'f64': return v instanceof Dbl ? v : new Dbl(Number(num(v)));
        case 'f32': return new Dbl(Math.fround(Number(num(v))));
        case 'char': return v instanceof Chr ? v : new Chr(Number(toInt(v)) & 255);
        case 'bool': return truthy(v);
        case 'string':
          if (v instanceof Chr) return String.fromCharCode(v.c);
          if (v instanceof Ptr && v.k === 'elem') return this.lib.cString(v);
          return v;
        case 'void': return v;
        default: break;
      }
      if (v instanceof InitList) return this.fromInitList(t, v);
      if (t.n === 'auto' || t.n === 'function') return v;
      if (v instanceof Obj && this.classes.has(t.n) && v.cls.name !== t.n) return v; // derived -> base, sliced by reference
      if (t.a.length && v instanceof Vec && (t.n === 'vector' || t.n === 'array' || t.n === 'deque')) return v;
      return v;
    }

    /** `(int*)malloc(n)` / `Node* p = malloc(...)`: memory becomes an object or an array once the pointee type is known. */
    materialize(t, raw) {
      const pointee = { ...t, p: t.p - 1 };
      if (pointee.p === 0 && this.classes.has(pointee.n)) return new Ptr('obj', this.newObject(this.classes.get(pointee.n)));
      const size = this.sizeOfType(pointee);
      const n = Math.max(1, Math.floor(raw.bytes / Math.max(1, size)));
      const a = [];
      for (let i = 0; i < n; i++) a.push(this.defaultValue(pointee));
      return new Ptr('elem', new Vec(a, pointee, 'array', typeName(pointee) + '[]'), 0);
    }

    sizeOfType(t) {
      if (!t) return 4;
      if (t.dims && t.dims.length) return t.dims.reduce((s, d) => s * (d ? Number(toInt(this.ev(d, this.G))) : 1), 1) * this.sizeOfType({ ...t, dims: undefined });
      if (t.p > 0) return 8;
      if (SIZES[t.cls]) return SIZES[t.cls];
      const cd = this.classes.get(t.n);
      if (cd) {
        let size = 0;
        let align = 1;
        for (const f of cd.fields) {
          const ft = cd.fieldTypes[f];
          const sz = this.sizeOfType(ft);
          const al = Math.min(8, Math.max(1, ft && ft.p === 0 && SIZES[ft.cls] ? sz : ft && ft.p ? 8 : 8));
          align = Math.max(align, al);
          size = Math.ceil(size / al) * al + sz;
        }
        return Math.max(1, Math.ceil(size / align) * align);
      }
      if (t.n === 'vector' || t.n === 'string') return 24;
      return 8;
    }

    /** `{a, b, c}` meeting its type. */
    fromInitList(t, il) {
      const items = il.items;
      const n = t.n;
      const et = t.a[0] || null;
      const elems = () => items.map((x) => copyVal(this.coerce(et, x)));
      switch (n) {
        case 'vector': case 'list': case 'forward_list': case 'initializer_list': return new Vec(elems(), et, 'list', typeName(t));
        case 'array': {
          const size = t.a[1] && t.a[1].n.startsWith('#') ? Number(t.a[1].n.slice(1)) : items.length;
          const a = elems();
          while (a.length < size) a.push(this.defaultValue(et));
          return new Vec(a, et, 'array', typeName(t));
        }
        case 'deque': return new Deq(elems(), et);
        case 'stack': return new Stk(items.length ? this.vecItems(items[0], et) : [], et);
        case 'queue': return new Que(items.length ? this.vecItems(items[0], et) : [], et);
        case 'priority_queue': { const pq = this.constructValue(t, []); for (const x of items) this.lib.pqPush(pq, this.coerce(et, x)); return pq; }
        case 'pair': return new Pair(this.coerce(t.a[0], items[0]), this.coerce(t.a[1], items[1]));
        case 'tuple': return new Tup(items.map((x, i) => this.coerce(t.a[i], x)));
        case 'map': case 'unordered_map': case 'multimap': case 'unordered_multimap': {
          const m = this.constructValue(t, []);
          for (const e of items) {
            const p = e instanceof InitList ? e.items : e instanceof Pair ? [e.first, e.second] : [e, 0];
            this.lib.mapInsert(m, this.coerce(m.kt, p[0]), this.coerce(m.vt, p[1]));
          }
          return m;
        }
        case 'set': case 'unordered_set': case 'multiset': case 'unordered_multiset': {
          const s = this.constructValue(t, []);
          for (const x of items) this.lib.setInsert(s, this.coerce(s.kt, x));
          return s;
        }
        case 'string': return items.map((x) => (x instanceof Chr ? String.fromCharCode(x.c) : String(x))).join('');
        case 'auto': return new Vec(items.map(copyVal), null, 'list', 'vector');
        default: break;
      }
      const cd = this.classes.get(n);
      if (cd) {
        if (cd.ctors.length) return this.constructValue(t, items);
        const o = this.newObject(cd, true);
        let i = 0;
        for (const f of this.allFields(cd)) { if (i < items.length) o.f[f] = this.coerce(this.fieldType(cd, f), copyVal(items[i++])); }
        return o;
      }
      if (t.cls !== 'obj') return items.length ? this.coerce(t, items[0]) : this.defaultValue(t);
      return new Vec(items.map(copyVal), null, 'list', 'vector');
    }

    vecItems(x, et) {
      if (x instanceof Vec || x instanceof Deq) return x.a.map((e) => copyVal(this.coerce(et, e)));
      return [];
    }

    // ---------------------------------------------------------------------------------------- classes and objects

    allFields(cd) {
      const out = [];
      for (const b of cd.bases) { const bc = this.classes.get(b); if (bc) for (const f of this.allFields(bc)) if (!out.includes(f)) out.push(f); }
      for (const f of cd.fields) if (!out.includes(f)) out.push(f);
      return out;
    }

    fieldType(cd, f) {
      if (cd.fieldTypes[f]) return cd.fieldTypes[f];
      for (const b of cd.bases) { const bc = this.classes.get(b); if (bc) { const t = this.fieldType(bc, f); if (t) return t; } }
      return null;
    }

    findMethods(cd, name) {
      const own = cd.methods.get(name);
      if (own) return own;
      for (const b of cd.bases) { const bc = this.classes.get(b); if (bc) { const m = this.findMethods(bc, name); if (m) return m; } }
      return null;
    }

    findStatic(cd, name) {
      if (cd.statics.has(name)) return cd.statics.get(name);
      for (const b of cd.bases) { const bc = this.classes.get(b); if (bc) { const s = this.findStatic(bc, name); if (s) return s; } }
      return null;
    }

    /** A new object with fields at their defaults (member initializers evaluated), no constructor run. */
    newObject(cd, skipInit) {
      const o = new Obj(cd);
      const env = new Env(this.G, true);
      env.thisPtr = new Ptr('obj', o);
      for (const f of this.allFields(cd)) o.f[f] = this.defaultValue(this.fieldType(cd, f));
      if (!skipInit) this.applyMemberInits(cd, o, env);
      return o;
    }

    applyMemberInits(cd, o, env) {
      for (const b of cd.bases) { const bc = this.classes.get(b); if (bc) this.applyMemberInits(bc, o, env); }
      for (const [f, init] of cd.inits) {
        const t = this.fieldType(cd, f);
        o.f[f] = this.initValue(t, init, env);
      }
    }

    /** Value of `T x = init` / `T x{init}` / `T x(args)` given the initializer node. */
    initValue(t, init, env) {
      if (!init) return this.defaultValue(t);
      if (init.t === 'argument_list') return this.constructValue(t, this.evalArgs(init.c, env));
      if (init.t === 'initializer_list') {
        const il = this.ev(init, env);
        if (t && t.p === 0 && t.cls === 'obj' && t.n !== 'auto') return this.fromInitList(t, il);
        return t ? this.coerce(t, il) : il;
      }
      const v = this.ev(init, env);
      return this.coerce(t, copyVal(v));
    }

    /** `T(args)`: builds a value of type t (containers, pairs, strings, user classes, scalars). */
    constructValue(t, args) {
      const A = args.map(valueOf);
      const et = t.a[0] || null;
      switch (t.n) {
        case 'vector': case 'list': case 'forward_list': {
          const name = typeName(t);
          if (!A.length) return new Vec([], et, 'list', name);
          if (A.length === 1 && A[0] instanceof Vec) return copyVal(new Vec(A[0].a, et, 'list', name));
          if (A.length >= 1 && (typeof A[0] === 'number' || typeof A[0] === 'bigint' || A[0] instanceof Chr) && !(A.length === 2 && A[1] instanceof Iter)) {
            const n = Number(toInt(A[0]));
            if (n < 0) throw new CppError('Length Error', 'cannot create std::vector larger than max_size()');
            const a = [];
            for (let i = 0; i < n; i++) a.push(A.length > 1 ? copyVal(this.coerce(et, A[1])) : this.defaultValue(et));
            return new Vec(a, et, 'list', name);
          }
          if (A.length >= 2 && A[0] instanceof Iter) return new Vec(this.lib.iterRange(A[0], A[1]).map((x) => copyVal(this.coerce(et, x))), et, 'list', name);
          if (A[0] instanceof InitList) return this.fromInitList(t, A[0]);
          if (A[0] instanceof Deq || A[0] instanceof Que) return new Vec(A[0].a.map(copyVal), et, 'list', name);
          return new Vec([], et, 'list', name);
        }
        case 'array': {
          const size = t.a[1] && t.a[1].n.startsWith('#') ? Number(t.a[1].n.slice(1)) : 0;
          const a = [];
          for (let i = 0; i < size; i++) a.push(this.defaultValue(et));
          return new Vec(a, et, 'array', typeName(t));
        }
        case 'deque': {
          if (!A.length) return new Deq([], et);
          if (A[0] instanceof Deq || A[0] instanceof Vec) return new Deq(A[0].a.map(copyVal), et);
          const a = [];
          for (let i = 0; i < Number(toInt(A[0])); i++) a.push(A.length > 1 ? copyVal(A[1]) : this.defaultValue(et));
          return new Deq(a, et);
        }
        case 'stack': return new Stk(A[0] && A[0].a ? A[0].a.map(copyVal) : [], et);
        case 'queue': return new Que(A[0] && A[0].a ? A[0].a.map(copyVal) : [], et);
        case 'priority_queue': {
          let cmp = null;
          const ct = t.a[2];
          if (ct) cmp = this.comparatorFromType(ct);
          const pq = new PQ([], et, cmp);
          for (const x of A) {
            if (x instanceof Fn || (x instanceof Obj && this.findMethods(x.cls, 'operator()'))) pq.cmp = x;
            else if (x instanceof Vec || x instanceof Deq) for (const e of x.a) this.lib.pqPush(pq, copyVal(e));
            else if (x instanceof Iter) { /* range: handled below */ }
          }
          if (A.length >= 2 && A[0] instanceof Iter) for (const e of this.lib.iterRange(A[0], A[1])) this.lib.pqPush(pq, copyVal(e));
          return pq;
        }
        case 'map': case 'multimap': case 'unordered_map': case 'unordered_multimap': {
          const m = new MapObj({ ordered: t.n === 'map' || t.n === 'multimap', multi: t.n.includes('multi'), kt: t.a[0] || null, vt: t.a[1] || null, tname: typeName(t) });
          if (t.a[2] && (t.n === 'map' || t.n === 'multimap')) m.cmp = this.comparatorFromType(t.a[2]);
          for (const x of A) {
            if (x instanceof MapObj) for (const e of this.lib.mapEntries(x)) this.lib.mapInsert(m, copyVal(e.first), copyVal(e.second));
            else if (x instanceof InitList) return this.fromInitList(t, x);
            else if (x instanceof Fn || x instanceof Obj) m.cmp = x;
          }
          return m;
        }
        case 'set': case 'multiset': case 'unordered_set': case 'unordered_multiset': {
          const s = new MapObj({ ordered: t.n === 'set' || t.n === 'multiset', multi: t.n.includes('multi'), kt: et, isSet: true, tname: typeName(t) });
          if (t.a[1] && (t.n === 'set' || t.n === 'multiset')) s.cmp = this.comparatorFromType(t.a[1]);
          for (const x of A) {
            if (x instanceof MapObj) for (const e of this.lib.mapEntries(x)) this.lib.setInsert(s, copyVal(e.first));
            else if (x instanceof Vec || x instanceof Deq) for (const e of x.a) this.lib.setInsert(s, copyVal(this.coerce(et, e)));
            else if (x instanceof InitList) return this.fromInitList(t, x);
            else if (x instanceof Fn || x instanceof Obj) s.cmp = x;
          }
          if (A.length >= 2 && A[0] instanceof Iter) for (const e of this.lib.iterRange(A[0], A[1])) this.lib.setInsert(s, copyVal(e));
          return s;
        }
        case 'pair': return new Pair(A.length ? copyVal(this.coerce(t.a[0], A[0])) : this.defaultValue(t.a[0]), A.length > 1 ? copyVal(this.coerce(t.a[1], A[1])) : this.defaultValue(t.a[1]));
        case 'tuple': return new Tup(t.a.map((tt, i) => (i < A.length ? copyVal(this.coerce(tt, A[i])) : this.defaultValue(tt))));
        case 'string': {
          if (!A.length) return '';
          if (typeof A[0] === 'string') return A.length >= 3 ? A[0].substr(Number(toInt(A[1])), Number(toInt(A[2]))) : A.length === 2 ? A[0].slice(Number(toInt(A[1]))) : A[0];
          if (typeof A[0] === 'number' && A.length >= 2) return String.fromCharCode(num(A[1])).repeat(A[0]);
          if (A[0] instanceof Iter) return this.lib.iterRange(A[0], A[1]).map((c) => String.fromCharCode(num(c))).join('');
          if (A[0] instanceof Ptr) return this.lib.cString(A[0]);
          if (A[0] instanceof InitList) return this.fromInitList(t, A[0]);
          return '';
        }
        case 'function': return A.length ? A[0] : null;
        case 'stringstream': case 'istringstream': case 'ostringstream': return this.lib.makeSStream(A.length ? String(A[0]) : '');
        case 'auto': return A.length ? A[0] : 0;
        default: break;
      }
      const cd = this.classes.get(t.n);
      if (cd) return this.constructObject(cd, args);
      if (t.cls !== 'obj') return A.length ? this.coerce(t, A[0]) : this.defaultValue(t);
      const lib = this.lib.constructBuiltin(t, A);
      if (lib !== undefined) return lib;
      throw new CppError('Unsupported', `the type '${typeName(t)}' is not supported by this interpreter`);
    }

    comparatorFromType(ct) {
      if (ct.n === 'greater') return 'greater';
      if (ct.n === 'less') return null;
      const cd = this.classes.get(ct.n);
      if (cd) return this.newObject(cd);
      return null;
    }

    constructObject(cd, args) {
      const o = this.newObject(cd, true);
      const env = new Env(this.G, true);
      env.thisPtr = new Ptr('obj', o);
      // constructor overloads
      let def = null;
      if (cd.ctors.length) {
        def = this.pickOverload(cd.ctors, args);
        if (!def) throw new CppError('Type Error', `no matching constructor for ${cd.name}(${args.length} argument${args.length === 1 ? '' : 's'})`);
      }
      // default member initializers, then the constructor's initializer list overrides them
      if (!def) {
        this.applyMemberInits(cd, o, env);
        if (args.length) {
          // aggregate initialization: Point p(1, 2) with no constructor (C++20) or a base-class ctor pass-through
          let i = 0;
          for (const f of this.allFields(cd)) if (i < args.length) o.f[f] = this.coerce(this.fieldType(cd, f), copyVal(valueOf(args[i++])));
        }
        return o;
      }
      this.callFunction(def, args, o, true);
      return o;
    }

    /** Runs a constructor body on an existing object: fields first, then the initializer list, then the body. */
    initObjectFor(def, o, penv) {
      const cd = def.cls;
      this.applyMemberInits(cd, o, penv);
      if (def.initList) {
        for (const fi of def.initList.c) {
          if (fi.t !== 'field_initializer') continue;
          const nameNode = fi.c[0];
          const name = nameNode.x;
          const argl = fi.c.find((c) => c.t === 'argument_list' || c.t === 'initializer_list');
          const args = argl ? (argl.t === 'argument_list' ? this.evalArgs(argl.c, penv) : argl.c.map((c) => this.ev(c, penv))) : [];
          if (Object.prototype.hasOwnProperty.call(o.f, name)) {
            const ft = this.fieldType(cd, name);
            if (ft && ft.p === 0 && ft.cls === 'obj' && ft.n !== 'auto') o.f[name] = this.constructValue(ft, args);
            else o.f[name] = args.length ? this.coerce(ft, copyVal(valueOf(args[0]))) : this.defaultValue(ft);
          } else if (cd.bases.includes(name)) {
            const bc = this.classes.get(name);
            if (bc) { const bo = this.constructObject(bc, args); for (const k of Object.keys(bo.f)) o.f[k] = bo.f[k]; }
          }
        }
      } else {
        // base default constructors
        for (const b of cd.bases) { const bc = this.classes.get(b); if (bc && bc.ctors.length) { const bo = this.constructObject(bc, []); for (const k of Object.keys(bo.f)) o.f[k] = bo.f[k]; } }
      }
    }

    // ---------------------------------------------------------------------------------------- calls

    pickOverload(cands, args) {
      const n = args.length;
      const fit = cands.filter((d) => d.params.length >= n && d.required <= n);
      if (fit.length === 1) return fit[0];
      if (!fit.length) return null;
      let best = fit[0];
      let bestScore = -Infinity;
      for (const d of fit) {
        let score = -Math.abs(d.params.length - n);
        for (let i = 0; i < n; i++) score += this.typeScore(d.params[i].type, valueOf(args[i]));
        if (score > bestScore) { bestScore = score; best = d; }
      }
      return best;
    }

    typeScore(t, v) {
      if (!t || t.n === 'auto') return 1;
      const isNumV = typeof v === 'number' || typeof v === 'bigint';
      if (t.p > 0) return v === null || v instanceof Ptr ? 3 : -10;
      switch (t.cls) {
        case 'i32': case 'i64': case 'u32': case 'u64': case 'i16': case 'u16': case 'i8': case 'u8': return isNumV ? 3 : v instanceof Chr || typeof v === 'boolean' ? 1 : v instanceof Dbl ? 0 : -10;
        case 'f64': case 'f32': return v instanceof Dbl ? 3 : isNumV ? 1 : -10;
        case 'char': return v instanceof Chr ? 3 : isNumV ? 1 : -10;
        case 'bool': return typeof v === 'boolean' ? 3 : 0;
        case 'string': return typeof v === 'string' ? 3 : -10;
        default: break;
      }
      if (t.n === 'vector') return v instanceof Vec ? 3 : v instanceof InitList ? 1 : -10;
      if (t.n === 'map' || t.n === 'unordered_map') return v instanceof MapObj ? 3 : -10;
      if (v instanceof Obj) return v.cls.name === t.n ? 3 : 0;
      return 0;
    }

    /**
     * Calls a user function. `args` are values or Refs (a Ref where the caller passed an lvalue and the parameter is a
     * reference). `thisObj` is the receiver for methods; `isCtor` builds on it.
     */
    callFunction(def, args, thisObj, isCtor) {
      if (++this.depth > this.maxDepth) { this.depth--; throw new CppError('Stack Overflow', 'stack overflow: the recursion is too deep'); }
      const env = new Env(this.G, true);
      env.thisPtr = thisObj ? (thisObj instanceof Ptr ? thisObj : new Ptr('obj', thisObj)) : null;
      env.cls = def.cls;
      env.fr = null;
      const names = [];
      let frame = null;
      try {
        const params = def.params;
        for (let i = 0; i < params.length; i++) {
          const p = params[i];
          let arg;
          if (i < args.length) arg = args[i];
          else if (p.def) arg = this.ev(p.def, env);
          else arg = undefined;
          if (p.name) names.push(p.name);
          const t = p.type;
          if (t && t.r) {
            if (arg instanceof Ref) { if (p.name) env.vars.set(p.name, arg); } else if (p.name) env.vars.set(p.name, new Cell(this.coerce(t, arg), t));
          } else if (p.name) {
            env.vars.set(p.name, new Cell(this.coerce(t, copyVal(valueOf(arg))), t));
          }
        }
        if (def.traced && this.T) {
          const first = def.body.c.find((c) => c.t !== 'comment');
          frame = this.T.enter({ name: def.cls ? (isCtor ? 'new ' + def.cls.name : def.cls.name + '::' + def.name) : def.name, line: first ? first.line : def.node.line, args: names, env, thisObj: env.thisPtr });
          env.fr = frame;
        }
        if (isCtor) this.initObjectFor(def, thisObj instanceof Ptr ? thisObj.o : thisObj, env);
        const r = this.execBlock(def.body, env);
        let ret;
        if (r instanceof Ret) ret = r.v;
        const cp = r && r.copy && !def.retRef;
        ret = ret === undefined ? undefined : (def.ret && def.ret.n !== 'auto' && def.ret.n !== 'void' ? this.coerce(def.ret, cp ? copyVal(ret) : ret) : (cp ? copyVal(ret) : ret));
        if (frame) frame.retVal = ret;
        return ret;
      } finally {
        this.depth--;
        if (frame) this.T.leave(frame);
      }
    }

    /** Body of a function: a compound statement sharing the parameter scope. */
    execBlock(body, env) {
      const e = new Env(env);
      for (const c of body.c) {
        if (c.t === 'comment') continue;
        const r = this.exec(c, e);
        if (r) return r;
      }
      return undefined;
    }

    callValue(f, args) {
      f = valueOf(f);
      if (f instanceof Fn) {
        switch (f.kind) {
          case 'lambda': return this.callLambda(f, args);
          case 'func': { const d = this.pickOverload(f.defs, args); if (!d) throw new CppError('Type Error', `no matching call to ${f.defs[0].name}`); return this.callFunction(d, args, f.thisObj, false); }
          case 'builtin': return f.fn(args.map(valueOf));
          default: break;
        }
      }
      if (f instanceof Obj) {
        const ms = this.findMethods(f.cls, 'operator()');
        if (ms) { const d = this.pickOverload(ms, args); return this.callFunction(d, args, f, false); }
      }
      throw new CppError('Type Error', 'this value is not callable');
    }

    callLambda(f, args) {
      if (++this.depth > this.maxDepth) { this.depth--; throw new CppError('Stack Overflow', 'stack overflow: the recursion is too deep'); }
      const n = f.node;
      const env = new Env(f.cap, true);
      env.fr = null;
      env.thisPtr = f.cap.thisPtr;
      let frame = null;
      try {
        const params = f.params;
        const names = [];
        for (let i = 0; i < params.length; i++) {
          const p = params[i];
          let arg = i < args.length ? args[i] : (p.def ? this.ev(p.def, env) : undefined);
          if (p.name) names.push(p.name);
          const t = p.type;
          if (!p.name) continue;
          if (t && t.r && arg instanceof Ref) env.vars.set(p.name, arg);
          else env.vars.set(p.name, new Cell(this.coerce(t && t.n !== 'auto' ? t : null, copyVal(valueOf(arg))), t));
        }
        if (f.traced && this.T) {
          const first = n.f.body.c.find((c) => c.t !== 'comment');
          frame = this.T.enter({ name: 'lambda', line: first ? first.line : n.line, args: names, env, thisObj: env.thisPtr });
          env.fr = frame;
        }
        const r = this.execBlock(n.f.body, env);
        let ret = r instanceof Ret ? r.v : undefined;
        if (ret !== undefined && f.ret && f.ret.n !== 'auto') ret = this.coerce(f.ret, ret);
        if (frame) frame.retVal = ret;
        return ret;
      } finally {
        this.depth--;
        if (frame) this.T.leave(frame);
      }
    }

    /** Identifier names used in a lambda body (cached on the node), for by-value captures. */
    freeNames(n) {
      if (n.free) return n.free;
      const set = new Set();
      (function walk(x) {
        if (x.t === 'identifier') set.add(x.x);
        for (const c of x.c) walk(c);
      })(n.f.body);
      // default arguments and captured initializers may use names too
      n.free = set;
      return set;
    }

    makeLambda(n, env) {
      const traced = env.fr !== null || this.unitFile === this.tracedFile;
      const declarator = n.f.declarator;
      const params = this.paramList(declarator ? declarator.f.parameters : null);
      let ret = null;
      const trailing = declarator ? declarator.c.find((c) => c.t === 'trailing_return_type') : null;
      if (trailing) ret = this.typeFrom(trailing.c.find((c) => c.t === 'type_descriptor'));
      const specs = n.f.captures ? n.f.captures.c : [];
      const hasRef = specs.some((c) => c.t === 'lambda_default_capture' && c.x === '&');
      const hasCopy = specs.some((c) => c.t === 'lambda_default_capture' && c.x === '=');
      const explicit = specs.filter((c) => c.t !== 'lambda_default_capture');
      let cap;
      if (hasRef && !explicit.length) {
        cap = env;
      } else {
        cap = new Env(this.G, true);
        cap.thisPtr = env.thisPtr;
        cap.fr = env.fr;
        if (hasRef) cap.parent = env;
        else if (hasCopy) {
          for (const name of this.freeNames(n)) {
            const c = this.lookupCell(name, env);
            if (c) cap.vars.set(name, new Cell(copyVal(c.v), c.t));
          }
        }
        for (const e of explicit) {
          if (e.t === 'identifier') {
            const c = this.lookupCell(e.x, env);
            if (c) cap.vars.set(e.x, e.byRef ? c : new Cell(copyVal(c.v), c.t));
          } else if (e.t === 'pointer_expression') { const c = this.lookupCell(e.f.argument.x, env); if (c) cap.vars.set(e.f.argument.x, c); } else if (e.t === 'assignment_expression' || e.t === 'lambda_capture_initializer') {
            const name = e.f.left.x;
            cap.vars.set(name, e.byRef ? new Cell(this.ev(e.f.right, env), null) : new Cell(copyVal(this.ev(e.f.right, env)), null));
          }
        }
      }
      return new Fn('lambda', { node: n, cap, params, ret, traced });
    }

    /** A named variable's Cell/Ref (locals, this-fields, globals, class statics); null when there is none. */
    lookupCell(name, env) {
      for (let e = env; e; e = e.parent) {
        const c = e.vars.get(name);
        if (c) return c;
      }
      const tp = env.thisPtr;
      if (tp && tp.o instanceof Obj) {
        const o = tp.o;
        if (Object.prototype.hasOwnProperty.call(o.f, name)) return new FieldRef(o, name, this.fieldType(o.cls, name));
        const st = this.findStatic(o.cls, name);
        if (st) return st;
      }
      if (env.cls) { const st = this.findStatic(env.cls, name); if (st) return st; }
      return null;
    }

    // ---------------------------------------------------------------------------------------- statements

    step(n, env) {
      this.curLine = n.line;
      const fr = env.fr;
      if (fr && this.T) this.T.step(fr, n.line, env);
    }

    stepLine(line, env) {
      this.curLine = line;
      const fr = env.fr;
      if (fr && this.T) this.T.step(fr, line, env);
    }

    exec(n, env) {
      switch (n.t) {
        case 'compound_statement': {
          const e = new Env(env);
          for (const c of n.c) {
            if (c.t === 'comment') continue;
            const r = this.exec(c, e);
            if (r) return r;
          }
          return undefined;
        }
        case 'declaration': this.step(n, env); this.declare(n, env, false); return undefined;
        case 'expression_statement':
          if (!n.c.length) return undefined;
          this.step(n, env);
          this.ev(n.c[0], env);
          return undefined;
        case 'return_statement': {
          this.step(n, env);
          const e = n.c.find((c) => c.t !== 'comment');
          if (!e) return new Ret(undefined);
          const isPlainLocal = e.t === 'identifier' && this.lookupCellLocal(e.x, env);
          const v = e.t === 'initializer_list' ? this.retInit(e, env) : this.ev(e, env);
          const r = new Ret(v);
          r.copy = !isPlainLocal;
          return r;
        }
        case 'if_statement': return this.execIf(n, env);
        case 'for_statement': return this.execFor(n, env);
        case 'for_range_loop': return this.execRange(n, env);
        case 'while_statement': return this.execWhile(n, env);
        case 'do_statement': return this.execDo(n, env);
        case 'switch_statement': return this.execSwitch(n, env);
        case 'break_statement': this.step(n, env); return BRK;
        case 'continue_statement': this.step(n, env); return CNT;
        case 'try_statement': return this.execTry(n, env);
        case 'throw_statement': {
          this.step(n, env);
          const e = n.c.find((c) => c.t !== 'comment');
          throw new CppThrow(e ? copyVal(this.ev(e, env)) : null);
        }
        case 'function_definition': this.defineFunction(n, null); return undefined;
        case 'class_specifier': case 'struct_specifier': this.defineClass(n); return undefined;
        case 'enum_specifier': this.defineEnum(n); return undefined;
        case 'type_definition': this.defineTypedef(n); return undefined;
        case 'alias_declaration': this.typedefs.set(n.f.name.x, this.typeFrom(n.f.type)); return undefined;
        case 'using_declaration': case 'comment': case 'static_assert_declaration': case 'preproc_def': case 'preproc_include': return undefined;
        case 'labeled_statement': return this.exec(n.c[n.c.length - 1], env);
        case 'goto_statement': throw new CppError('Unsupported', 'goto is not supported by this interpreter', n.line);
        case 'condition_clause': return undefined;
        case ';': return undefined;
        default:
          // a bare expression used as a statement (e.g. in a for-init)
          this.step(n, env);
          this.ev(n, env);
          return undefined;
      }
    }

    retInit(e, env) {
      const il = this.ev(e, env);
      const f = env.fr;
      return il;
    }

    lookupCellLocal(name, env) {
      for (let e = env; e; e = e.parent) {
        if (e.vars.has(name)) return !e.vars.get(name).t || !e.vars.get(name).t.r;
        if (e.root) return false;
      }
      return false;
    }

    /** The loop/if condition: `(x)` or `(auto* p = f())` / `(int x = 1; x < n)`. */
    cond(n, env) {
      if (!n) return true;
      if (n.t === 'condition_clause') {
        if (n.f.initializer) this.execInit(n.f.initializer, env);
        const v = n.f.value;
        if (v.t === 'declaration') {
          this.declare(v, env, false);
          const info = this.declInfo(Array.isArray(v.f.declarator) ? v.f.declarator[0] : v.f.declarator);
          const c = env.vars.get(info.name);
          return truthy(c ? c.v : 0);
        }
        return truthy(this.ev(v, env));
      }
      return truthy(this.ev(n, env));
    }

    execInit(n, env) {
      if (n.t === 'declaration') this.declare(n, env, false);
      else if (n.t === 'expression_statement') { if (n.c.length) this.ev(n.c[0], env); } else this.ev(n, env);
    }

    execIf(n, env) {
      this.step(n, env);
      const e = new Env(env);
      const ok = this.cond(n.f.condition, e);
      if (ok) return this.exec(n.f.consequence, e);
      const alt = n.f.alternative;
      if (alt) {
        const body = alt.c.find((c) => c.t !== 'comment');
        return this.exec(body, e);
      }
      return undefined;
    }

    execWhile(n, env) {
      for (;;) {
        const e = new Env(env);
        this.step(n, e);
        if (!this.cond(n.f.condition, e)) break;
        const r = this.exec(n.f.body, e);
        if (r === BRK) break;
        if (r instanceof Ret) return r;
      }
      return undefined;
    }

    execDo(n, env) {
      this.step(n, env);
      for (;;) {
        const r = this.exec(n.f.body, env);
        if (r === BRK) break;
        if (r instanceof Ret) return r;
        const line = n.f.condition ? n.f.condition.line : n.line;
        this.stepLine(line, env);
        if (!this.cond(n.f.condition, env)) break;
      }
      return undefined;
    }

    execFor(n, env) {
      const e = new Env(env);
      if (n.f.initializer) this.execInit(n.f.initializer, e);
      for (;;) {
        this.step(n, e);
        if (n.f.condition && !this.cond(n.f.condition, e)) break;
        const r = this.exec(n.f.body, e);
        if (r === BRK) break;
        if (r instanceof Ret) return r;
        if (n.f.update) this.ev(n.f.update, e);
      }
      return undefined;
    }

    execRange(n, env) {
      const e0 = new Env(env);
      if (n.f.initializer) this.execInit(n.f.initializer, e0);
      const rightNode = n.f.right;
      let coll;
      if (this.isLvalueNode(rightNode)) coll = this.lv(rightNode, e0);
      else coll = this.ev(rightNode, e0);
      const collVal = valueOf(coll);
      const info = this.declInfo(n.f.declarator);
      const baseType = this.typeFrom(n.f.type);
      const type = baseType ? { ...baseType, p: baseType.p + info.p, r: info.r } : null;
      const items = this.lib.rangeItems(collVal, coll);
      for (let i = 0; i < items.length(); i++) {
        const e = new Env(e0);
        const item = items.get(i);
        if (info.names) {
          this.bindStructured(info.names, item, e, info.r);
        } else if (info.r) {
          e.vars.set(info.name, item.ref || new Cell(item.value, type));
        } else {
          e.vars.set(info.name, new Cell(this.coerce(type && type.n !== 'auto' ? type : null, copyVal(item.value)), type));
        }
        this.step(n, e);
        const r = this.exec(n.f.body, e);
        if (r === BRK) break;
        if (r instanceof Ret) return r;
      }
      return undefined;
    }

    /** `auto [a, b] = expr` / `for (auto& [k, v] : m)`: names bound to the parts of a pair, tuple, array or struct. */
    bindStructured(names, item, env, byRef) {
      const v = item.value !== undefined ? item.value : valueOf(item);
      let refs = [];
      if (v instanceof Pair) refs = [new PairRef(v, 'first'), new PairRef(v, 'second')];
      else if (v instanceof Tup) refs = v.a.map((_, i) => new ElemRef(v.a, i, null));
      else if (v instanceof Vec) refs = v.a.map((_, i) => new ElemRef(v.a, i, v.et));
      else if (v instanceof Obj) refs = this.allFields(v.cls).map((f) => new FieldRef(v, f, this.fieldType(v.cls, f)));
      else throw new CppError('Type Error', 'cannot destructure this value');
      names.forEach((nm, i) => {
        if (!refs[i]) return;
        env.vars.set(nm, byRef ? refs[i] : new Cell(copyVal(refs[i].v), null));
      });
    }

    execSwitch(n, env) {
      this.step(n, env);
      const e = new Env(env);
      const cv = n.f.condition.t === 'condition_clause' ? this.ev(n.f.condition.f.value, e) : this.ev(n.f.condition, e);
      const cases = n.f.body.c.filter((c) => c.t === 'case_statement');
      let start = -1;
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        if (c.f.value && compare('==', cv, this.ev(c.f.value, e))) { start = i; break; }
      }
      if (start < 0) start = cases.findIndex((c) => !c.f.value);
      if (start < 0) return undefined;
      for (let i = start; i < cases.length; i++) {
        for (const s of cases[i].c) {
          if (s === cases[i].f.value || s.t === 'comment') continue;
          const r = this.exec(s, e);
          if (r === BRK) return undefined;
          if (r) return r;
        }
      }
      return undefined;
    }

    execTry(n, env) {
      try {
        return this.exec(n.f.body, env);
      } catch (ex) {
        let thrown = ex;
        if (ex instanceof CppError && ex.type !== 'Stack Overflow' && ex.catchable) thrown = new CppThrow(this.lib.makeException(ex));
        if (!(thrown instanceof CppThrow)) throw ex;
        for (const c of n.c) {
          if (c.t !== 'catch_clause') continue;
          const params = c.f.parameters ? c.f.parameters.c.filter((p) => p.t === 'parameter_declaration') : [];
          if (params.length && !this.catchMatches(params[0], thrown.value)) continue;
          const e = new Env(env);
          if (params.length && params[0].f.declarator) {
            const info = this.declInfo(params[0].f.declarator);
            if (info.name) e.vars.set(info.name, new Cell(thrown.value, null));
          }
          return this.exec(c.f.body, e);
        }
        throw thrown;
      }
    }

    catchMatches(param, v) {
      const t = this.typeFrom(param.f.type);
      if (!t || t.n === 'auto') return true;
      if (t.n === 'exception' || t.n === 'runtime_error' || t.n === 'logic_error' || t.n === 'out_of_range' || t.n === 'invalid_argument' || t.n === 'length_error') return v instanceof Obj && v.cls.builtinException;
      if (v instanceof Obj) { let cd = v.cls; while (cd) { if (cd.name === t.n) return true; cd = cd.bases.length ? this.classes.get(cd.bases[0]) : null; } return false; }
      if (t.cls === 'string' || (t.p > 0 && t.n === 'char')) return typeof v === 'string';
      if (['i32', 'i64', 'u32', 'u64', 'i16', 'u16'].includes(t.cls)) return typeof v === 'number' || typeof v === 'bigint';
      if (t.cls === 'f64' || t.cls === 'f32') return v instanceof Dbl;
      if (t.cls === 'char') return v instanceof Chr;
      if (t.cls === 'bool') return typeof v === 'boolean';
      return false;
    }

    // ---------------------------------------------------------------------------------------- declarations

    /** A `declaration` statement: one or more variables. */
    declare(n, env, isGlobal) {
      const tn = n.f.type;
      if (tn && ['struct_specifier', 'class_specifier', 'union_specifier'].includes(tn.t) && tn.f.body && !isGlobal) this.defineClass(tn);
      if (tn && tn.t === 'enum_specifier' && tn.f.body && !isGlobal) this.defineEnum(tn);
      const isStatic = n.c.some((c) => c.t === 'storage_class_specifier' && c.x === 'static');
      const decls = n.f.declarator ? (Array.isArray(n.f.declarator) ? n.f.declarator : [n.f.declarator]) : [];
      const base = this.typeFrom(tn);
      for (const d of decls) {
        const info = this.declInfo(d);
        if (info.isFunc && !info.init) {
          // `Foo f(x);` / `priority_queue<...> pq(cmp);` parse as a prototype when the arguments are bare names
          if (!isGlobal && this.looksLikeConstruction(info, env)) {
            const args = info.params.c.filter((p) => p.t === 'parameter_declaration').map((p) => this.ev({ t: LITERAL_NAMES[p.f.type.x] || 'identifier', x: p.f.type.x, line: p.line, c: [], f: {} }, env));
            let t2 = base ? { ...base, a: base.a.slice(), p: base.p + info.p } : null;
            const cell2 = new Cell(undefined, t2);
            env.vars.set(info.name, cell2);
            cell2.v = this.constructValue(t2, args);
          }
          continue; // otherwise a prototype
        }
        if (info.scope) { // `int Solution::count = 0;` defines a class static
          const cd = this.classes.get(info.scope);
          const st = cd && this.findStatic(cd, info.name);
          if (st) st.v = info.init ? this.initValue(st.t, info.init, env) : st.v;
          continue;
        }
        let t = base ? { ...base, a: base.a.slice(), p: base.p + info.p, r: info.r } : null;
        if (t && info.dims.length) t = { ...t, dims: info.dims, dimVals: null };
        if (info.names) {
          const v = info.init ? this.ev(info.init, env) : undefined;
          const item = info.r && v !== undefined ? { value: valueOf(v) } : { value: copyVal(valueOf(v)) };
          this.bindStructured(info.names, item, env, info.r);
          continue;
        }
        const name = info.name;
        if (!name) continue;
        if (isStatic && !isGlobal) {
          let store = this.statics.get(d);
          if (!store) { store = new Cell(this.declValue(t, info, env), t); this.statics.set(d, store); }
          env.vars.set(name, store);
          continue;
        }
        // the variable exists (empty) while its own initializer runs, so a recursive lambda can capture it
        const cell = new Cell(undefined, t);
        if (info.r && info.init) {
          const iv = info.init.t === 'initializer_list' || info.init.t === 'argument_list' ? this.ev(info.init, env) : (this.isLvalueNode(info.init) ? this.lv(info.init, env) : this.ev(info.init, env));
          if (iv instanceof Ref) { env.vars.set(name, iv); continue; }
          cell.v = this.coerce(t, iv);
          env.vars.set(name, cell);
          continue;
        }
        env.vars.set(name, cell);
        cell.v = this.declValue(t, info, env);
        if (isGlobal) this.G.vars.set(name, cell);
      }
    }

    /** A parameter list of bare identifiers that name variables in scope is really a constructor call. */
    looksLikeConstruction(info, env) {
      const ps = info.params ? info.params.c.filter((p) => p.t === 'parameter_declaration') : [];
      if (!ps.length) return false;
      return ps.every((p) => !p.f.declarator && p.f.type && (p.f.type.t === 'type_identifier' || p.f.type.t === 'identifier') && (LITERAL_NAMES[p.f.type.x] || this.lookupCell(p.f.type.x, env)));
    }

    declValue(t, info, env) {
      if (t && t.dims) {
        const sizes = t.dims.map((dm) => (dm ? Number(toInt(this.ev(dm, env))) : null));
        const init = info.init;
        if (sizes[0] === null && init && init.t === 'initializer_list') sizes[0] = init.c.length;
        const lit = init && init.t === 'string_literal' ? this.unescape(init.x.slice(init.x.indexOf('"') + 1, init.x.lastIndexOf('"'))) : null;
        if (sizes[0] === null && lit !== null) sizes[0] = lit.length + 1;
        const arr = this.buildArray({ ...t, dims: undefined }, sizes.map((x) => x || 0), 0);
        if (init && init.t === 'initializer_list') this.fillArray(arr, init, env, t);
        else if (lit !== null) { for (let i = 0; i < lit.length && i < arr.a.length; i++) arr.a[i] = new Chr(lit.charCodeAt(i)); }
        return arr;
      }
      if (!info.init) return this.defaultValue(t);
      if (t && t.n === 'auto') {
        const v = this.ev(info.init, env);
        if (v instanceof InitList) return new Vec(v.items.map(copyVal), null, 'list', 'vector');
        return copyVal(v);
      }
      return this.initValue(t, info.init, env);
    }

    fillArray(arr, init, env, t) {
      init.c.forEach((c, i) => {
        if (i >= arr.a.length) return;
        if (c.t === 'initializer_list' && arr.a[i] instanceof Vec) this.fillArray(arr.a[i], c, env, t);
        else arr.a[i] = this.coerce(arr.et || { ...t, dims: undefined }, this.ev(c, env));
      });
    }

    // ---------------------------------------------------------------------------------------- expressions

    isLvalueNode(n) {
      switch (n.t) {
        case 'identifier': case 'subscript_expression': case 'field_expression': case 'this': return true;
        case 'pointer_expression': return n.op === '*';
        case 'parenthesized_expression': return this.isLvalueNode(n.c[0]);
        case 'qualified_identifier': return true;
        default: return false;
      }
    }

    evalArgs(nodes, env, specs) {
      const out = [];
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        if (a.t === 'comment') continue;
        const sp = specs && specs[i];
        if (sp && sp.type && sp.type.r && this.isLvalueNode(a)) out.push(this.lv(a, env));
        else out.push(this.ev(a, env));
      }
      return out;
    }

    /** Evaluates to a Ref (an lvalue). Non-lvalues become a temporary Cell. */
    lv(n, env) {
      switch (n.t) {
        case 'identifier': {
          const c = this.lookupCell(n.x, env);
          if (c) return c;
          return new Cell(this.ev(n, env));
        }
        case 'parenthesized_expression': return this.lv(n.c[0], env);
        case 'subscript_expression': return this.subscriptRef(n, env);
        case 'field_expression': return this.fieldRef(n, env);
        case 'pointer_expression': if (n.op === '*') return new PtrRef(this.ev(n.f.argument, env), this); return new Cell(this.ev(n, env));
        case 'qualified_identifier': {
          const c = this.qualifiedCell(n);
          return c || new Cell(this.ev(n, env));
        }
        case 'this': return new Cell(env.thisPtr);
        case 'call_expression': return this.callLvalue(n, env);
        default: return new Cell(this.ev(n, env));
      }
    }

    /** `v.back() += 1`, `v.at(i) = x`, `*max_element(...)`: calls that yield a reference into a container. */
    callLvalue(n, env) {
      const fn = n.f.function;
      if (fn.t === 'field_expression') {
        const name = fn.f.field.x;
        if (['back', 'front', 'at', 'top'].includes(name)) {
          let recv = this.ev(fn.f.argument, env);
          if (fn.op === '->' || recv instanceof Ptr) recv = this.derefValue(recv);
          const args = this.evalArgs(n.f.arguments.c, env);
          if ((recv instanceof Vec || recv instanceof Deq || recv instanceof Stk || recv instanceof Que) && recv.a.length) {
            let i = 0;
            if (name === 'back' || name === 'top') i = recv.a.length - 1;
            else if (name === 'at') i = Number(toInt(args[0]));
            if (i < 0 || i >= recv.a.length) throw new CppError('Out Of Range', `index ${i} is out of range`, n.line);
            return new ElemRef(recv.a, i, recv.et, recv);
          }
          if (recv instanceof MapObj && name === 'at') { const e = this.lib.mapEntry(recv, args[0], false); return new PairRef(e, 'second'); }
        }
      }
      return new Cell(this.ev(n, env));
    }

    qualifiedCell(n) {
      const scope = n.f.scope ? n.f.scope.x : null;
      const name = n.f.name.x;
      const cd = scope && this.classes.get(scope);
      if (cd) return this.findStatic(cd, name);
      return this.lookupCell(name, this.G);
    }

    subscriptRef(n, env) {
      const baseNode = n.f.argument;
      const idxNode = n.f.indices.c.find((c) => c.t !== 'comment');
      let base = this.isLvalueNode(baseNode) ? this.lv(baseNode, env) : this.ev(baseNode, env);
      const idx = this.ev(idxNode, env);
      return this.indexRef(base, idx, n);
    }

    indexRef(baseRef, idx, n) {
      const b = valueOf(baseRef);
      if (b instanceof MapObj) return new MapRef(b, idx, this);
      const i = Number(toInt(idx));
      if (b instanceof Vec || b instanceof Deq) {
        if (i < 0 || i >= b.a.length) throw new CppError('Out Of Range', `index ${i} is out of range for a container of size ${b.a.length}`, n && n.line);
        return new ElemRef(b.a, i, b.et, b);
      }
      if (typeof b === 'string') {
        if (i < 0 || i > b.length) throw new CppError('Out Of Range', `index ${i} is out of range for a string of length ${b.length}`, n && n.line);
        return new StrCharRef(baseRef instanceof Ref ? baseRef : new Cell(b), i);
      }
      if (b instanceof MapObj) return new MapRef(b, idx, this);
      if (b instanceof Ptr) {
        if (b.k === 'elem') {
          const at = b.i + i;
          if (at < 0 || at >= b.o.a.length) throw new CppError('Segmentation Fault', `pointer index ${at} is outside the array (size ${b.o.a.length})`, n && n.line);
          return new ElemRef(b.o.a, at, b.o.et, b.o);
        }
        if (b.k === 'obj' && i === 0) return new PtrRef(b, this);
        throw new CppError('Segmentation Fault', 'cannot index this pointer', n && n.line);
      }
      if (b === null) throw new CppError('Segmentation Fault', 'indexing a null pointer', n && n.line);
      if (b instanceof Obj) {
        const ms = this.findMethods(b.cls, 'operator[]');
        if (ms) { const r = this.callFunction(ms[0], [idx], b, false); return r instanceof Ref ? r : new Cell(r); }
      }
      if (b instanceof Que || b instanceof Stk) throw new CppError('Type Error', 'this container cannot be indexed');
      throw new CppError('Type Error', 'this value cannot be indexed');
    }

    fieldRef(n, env) {
      const arrow = n.op === '->';
      let obj = this.ev(n.f.argument, env);
      if (arrow) obj = this.derefValue(obj);
      else if (obj instanceof Ptr) obj = this.derefValue(obj);
      const fname = n.f.field.t === 'template_method' ? n.f.field.f.name.x : n.f.field.x;
      return this.memberRef(obj, fname, n);
    }

    memberRef(obj, fname, n) {
      if (obj instanceof Obj) {
        if (Object.prototype.hasOwnProperty.call(obj.f, fname)) return new FieldRef(obj, fname, this.fieldType(obj.cls, fname));
        const st = this.findStatic(obj.cls, fname);
        if (st) return st;
        throw new CppError('Type Error', `'${obj.cls.name}' has no member named '${fname}'`, n && n.line);
      }
      if (obj instanceof Pair) {
        if (fname === 'first' || fname === 'second') return new PairRef(obj, fname);
      }
      if (obj instanceof Iter) return this.memberRef(this.lib.iterDeref(obj), fname, n);
      if (obj === null) throw new CppError('Segmentation Fault', `reading '${fname}' through a null pointer`, n && n.line);
      throw new CppError('Type Error', `no member named '${fname}' on this value`, n && n.line);
    }

    /** `*p` / `p->` : the object a pointer (or iterator) refers to. */
    derefValue(p) {
      if (p instanceof Ref) p = p.v;
      if (p === null || p === undefined) throw new CppError('Segmentation Fault', 'dereferencing a null pointer', this.curLine);
      if (p instanceof Ptr) {
        switch (p.k) {
          case 'obj': return p.o;
          case 'cell': return p.o.v;
          case 'elem': {
            if (p.i < 0 || p.i >= p.o.a.length) throw new CppError('Segmentation Fault', 'dereferencing a pointer outside its array', this.curLine);
            return p.o.a[p.i];
          }
          default: break;
        }
      }
      if (p instanceof Iter) return this.lib.iterDeref(p);
      if (p instanceof Obj || p instanceof Vec || p instanceof MapObj || p instanceof Pair) return p;
      if (p instanceof Fn) return p;
      throw new CppError('Type Error', 'this value is not a pointer');
    }

    derefSet(p, v) {
      if (p instanceof Ref) p = p.v;
      if (p === null) throw new CppError('Segmentation Fault', 'writing through a null pointer', this.curLine);
      if (p instanceof Ptr) {
        if (p.k === 'cell') { p.o.v = p.o.t ? this.coerce(p.o.t, v) : v; return; }
        if (p.k === 'elem') { p.o.a[p.i] = p.o.et ? this.coerce(p.o.et, v) : v; return; }
        if (p.k === 'obj') { // assign a whole object: overwrite its contents
          const src = copyVal(v);
          const dst = p.o;
          if (dst instanceof Obj && src instanceof Obj) { for (const k of Object.keys(src.f)) dst.f[k] = src.f[k]; return; }
          if (dst instanceof Vec && src instanceof Vec) { dst.a = src.a; return; }
        }
      }
      if (p instanceof Iter) { this.lib.iterSet(p, v); return; }
      throw new CppError('Type Error', 'cannot assign through this pointer');
    }

    /** Expression evaluation: returns a value (never a Ref). */
    ev(n, env) {
      switch (n.t) {
        case 'identifier': return this.identifier(n, env);
        case 'number_literal': return this.numberLiteral(n.x);
        case 'string_literal': return this.stringLiteral(n);
        case 'concatenated_string': return n.c.map((c) => this.stringLiteral(c)).join('');
        case 'char_literal': return new Chr(this.unescape(n.x.slice(1, -1)).charCodeAt(0) || 0);
        case 'true': return true;
        case 'false': return false;
        case 'null': return null;
        case 'this': return env.thisPtr;
        case 'parenthesized_expression': return this.ev(n.c[0], env);
        case 'binary_expression': return this.binary(n, env);
        case 'unary_expression': return this.unary(n, env);
        case 'pointer_expression': return this.pointerExpr(n, env);
        case 'update_expression': return this.update(n, env);
        case 'assignment_expression': return this.assignment(n, env);
        case 'conditional_expression': return truthy(this.ev(n.f.condition, env)) ? this.ev(n.f.consequence, env) : this.ev(n.f.alternative, env);
        case 'comma_expression': this.ev(n.f.left, env); return this.ev(n.f.right, env);
        case 'call_expression': return this.call(n, env);
        case 'field_expression': { const r = this.fieldRef(n, env); return r.v; }
        case 'subscript_expression': return this.subscriptRef(n, env).v;
        case 'cast_expression': return this.cast(this.typeFrom(n.f.type), this.ev(n.f.value, env));
        case 'sizeof_expression': return this.sizeofExpr(n, env);
        case 'new_expression': return this.newExpr(n, env);
        case 'delete_expression': this.ev(n.c[n.c.length - 1], env); return undefined;
        case 'lambda_expression': return this.makeLambda(n, env);
        case 'initializer_list': return new InitList(n.c.filter((c) => c.t !== 'comment').map((c) => this.ev(c, env)));
        case 'qualified_identifier': return this.qualified(n, env);
        case 'template_function': return this.templateFunctionValue(n, env);
        case 'compound_literal_expression': { const t = this.typeFrom(n.f.type); return this.initValue(t, n.f.value, env); }
        case 'user_defined_literal': return this.numberLiteral(n.x);
        case 'raw_string_literal': return n.x.replace(/^R"[^(]*\(/, '').replace(/\)[^"]*"$/, '');
        case 'condition_clause': return this.ev(n.f.value, env);
        case 'type_descriptor': return this.typeFrom(n);
        case 'primitive_type': case 'sized_type_specifier': return this.typeFrom(n);
        case 'field_identifier': return n.x;
        case 'co_await_expression': throw new CppError('Unsupported', 'coroutines are not supported');
        case 'extension_expression': return this.ev(n.c[0], env);
        default: throw new CppError('Unsupported', `unsupported expression '${n.t}'`, n.line);
      }
    }

    identifier(n, env) {
      const name = n.x;
      const c = this.lookupCell(name, env);
      if (c) return c.v;
      const gc = this.G.vars.get(name);
      if (gc) return gc.v;
      if (this.consts.has(name)) return this.consts.get(name);
      if (this.macros.has(name)) return this.macroValue(name);
      const lc = this.lib.constant(name);
      if (lc !== undefined) return lc;
      if (this.funcs.has(name)) return new Fn('func', { defs: this.funcs.get(name), thisObj: null });
      // an unqualified method name used as a value inside a class
      if (env.thisPtr && env.thisPtr.o instanceof Obj) {
        const ms = this.findMethods(env.thisPtr.o.cls, name);
        if (ms) return new Fn('func', { defs: ms, thisObj: env.thisPtr });
      }
      if (this.lib.hasFree(name)) return new Fn('builtin', { name, fn: (args) => this.lib.callFree(name, args, null) });
      throw new CppError('Name Error', `'${name}' was not declared in this scope`, n.line);
    }

    macroValue(name) {
      if (this.macroCache.has(name)) return this.macroCache.get(name);
      const text = this.macros.get(name);
      let v = 0;
      if (this.parseSnippet) {
        const expr = this.parseSnippet('auto __m = (' + text + ');');
        if (expr) v = this.ev(expr, this.G);
      }
      this.macroCache.set(name, v);
      return v;
    }

    numberLiteral(text) {
      if (text[0] === '-' || text[0] === '+') { const v = this.numberLiteral(text.slice(1)); return text[0] === '-' ? (v instanceof Dbl ? new Dbl(-v.v) : arith('-', 0, v)) : v; }
      let t = text.replace(/'/g, '');
      const lower = t.toLowerCase();
      if (/^0x[0-9a-f]+[ul]*$/.test(lower)) return this.intLit(BigInt('0x' + lower.slice(2).replace(/[ul]+$/, '')), lower);
      if (/^0b[01]+[ul]*$/.test(lower)) return this.intLit(BigInt('0b' + lower.slice(2).replace(/[ul]+$/, '')), lower);
      if (/^[0-9]+[ul]*$/.test(lower)) {
        if (lower.length > 1 && lower[0] === '0' && /^[0-7]+[ul]*$/.test(lower)) return this.intLit(BigInt('0o' + lower.replace(/[ul]+$/, '')), lower);
        return this.intLit(BigInt(lower.replace(/[ul]+$/, '')), lower);
      }
      const f = /f$/.test(lower) && !/^0x/.test(lower);
      const x = parseFloat(lower.replace(/[fl]$/, ''));
      return new Dbl(f ? Math.fround(x) : x);
    }

    intLit(b, lower) {
      const isLong = /l/.test(lower);
      const unsigned = /u/.test(lower);
      if (!isLong && !unsigned && b <= 2147483647n) return Number(b);
      return NS.norm(unsigned ? BigInt.asUintN(64, b) : BigInt.asIntN(64, b));
    }

    unescape(s) {
      return s.replace(/\\(x[0-9a-fA-F]+|[0-7]{1,3}|u[0-9a-fA-F]{4}|.)/g, (m, e) => {
        switch (e[0]) {
          case 'n': return '\n'; case 't': return '\t'; case 'r': return '\r'; case '0': if (e.length === 1) return '\0'; return String.fromCharCode(parseInt(e, 8));
          case 'a': return '\x07'; case 'b': return '\b'; case 'f': return '\f'; case 'v': return '\v';
          case 'x': return String.fromCharCode(parseInt(e.slice(1), 16));
          case 'u': return String.fromCharCode(parseInt(e.slice(1), 16));
          case '\\': return '\\'; case "'": return "'"; case '"': return '"'; case '?': return '?';
          default: return /[1-7]/.test(e[0]) ? String.fromCharCode(parseInt(e, 8)) : e;
        }
      });
    }

    stringLiteral(n) {
      const s = this.unescape(n.x.slice(n.x.indexOf('"') + 1, n.x.lastIndexOf('"')));
      return this.mode === 'c' ? this.lib.cStringLiteral(s) : s;
    }

    qualified(n, env) {
      const scope = n.f.scope;
      const nameNode = n.f.name;
      const name = nameNode.t === 'template_function' ? nameNode.f.name.x : nameNode.x;
      const sname = scope ? scope.x : null;
      if (sname === 'std' || sname === null || sname === '') {
        const c = this.G.vars.get(name);
        if (c) return c.v;
        if (this.consts.has(name)) return this.consts.get(name);
        const lc = this.lib.constant(name);
        if (lc !== undefined) return lc;
        if (this.funcs.has(name)) return new Fn('func', { defs: this.funcs.get(name), thisObj: null });
        if (this.lib.hasFree(name)) return new Fn('builtin', { name, fn: (args) => this.lib.callFree(name, args, null) });
        throw new CppError('Name Error', `'std::${name}' is not supported`, n.line);
      }
      if (this.consts.has(sname + '::' + name)) return this.consts.get(sname + '::' + name);
      const cd = this.classes.get(sname);
      if (cd) {
        const st = this.findStatic(cd, name);
        if (st) return st.v;
        const ms = this.findMethods(cd, name);
        if (ms) return new Fn('func', { defs: ms, thisObj: ms[0].isStatic ? null : env.thisPtr });
      }
      if (scope && scope.t === 'template_type') {
        const lc = this.lib.scopedConstant(this.typeFrom(scope), name);
        if (lc !== undefined) return lc;
      }
      const lc = this.lib.scopedConstant(mkType(sname), name);
      if (lc !== undefined) return lc;
      const c = this.G.vars.get(name);
      if (c) return c.v;
      if (this.funcs.has(name)) return new Fn('func', { defs: this.funcs.get(name), thisObj: null });
      throw new CppError('Name Error', `'${sname}::${name}' was not declared`, n.line);
    }

    templateFunctionValue(n, env) {
      const name = n.f.name.x;
      if (this.funcs.has(name)) return new Fn('func', { defs: this.funcs.get(name), thisObj: null });
      const t = this.typeFrom({ t: 'template_type', f: { name: n.f.name, arguments: n.f.arguments }, c: [] });
      return new Fn('builtin', { name, fn: (args) => this.lib.callFree(name, args, t) });
    }

    // -- operators

    binary(n, env) {
      const op = n.op;
      if (op === '&&') return truthy(this.ev(n.f.left, env)) && truthy(this.ev(n.f.right, env));
      if (op === '||') return truthy(this.ev(n.f.left, env)) || truthy(this.ev(n.f.right, env));
      if (op === '<<' || op === '>>') {
        const l = this.ev(n.f.left, env);
        if (l instanceof NS.Stream) return this.lib.streamOp(op, l, n.f.right, env);
        const r = this.ev(n.f.right, env);
        return this.binop(op, l, r, n);
      }
      const l = this.ev(n.f.left, env);
      const r = this.ev(n.f.right, env);
      return this.binop(op, l, r, n);
    }

    binop(op, l, r, n) {
      if ((op === '+' || op === '-') && l instanceof Vec && l.kind === 'array') l = new Ptr('elem', l, 0);
      if (op === '+' && r instanceof Vec && r.kind === 'array') r = new Ptr('elem', r, 0);
      if (l instanceof Obj || r instanceof Obj) {
        const o = this.userOperator(op, l, r);
        if (o !== undefined) return o.v;
      }
      switch (op) {
        case '+': case '-': case '*': case '/': case '%': case '&': case '|': case '^': case '<<': case '>>': {
          if (op === '+' && (typeof l === 'string' || typeof r === 'string')) return this.concat(l, r);
          if (l instanceof Ptr || r instanceof Ptr) return this.ptrArith(op, l, r);
          if (l instanceof Iter || r instanceof Iter) return this.lib.iterArith(op, l, r);
          if (l === null && typeof r === 'number' && op === '+') return null;
          const res = arith(op, l, r);
          return res;
        }
        case '==': case '!=': {
          const eq = this.equals(l, r);
          return op === '==' ? eq : !eq;
        }
        case '<': case '>': case '<=': case '>=': {
          if (this.isNumeric(l) && this.isNumeric(r) || (typeof l === 'string' && typeof r === 'string') || l instanceof Ptr || r instanceof Ptr || l === null || r === null) return compare(op, l, r);
          if (l instanceof Iter && r instanceof Iter) return compare(op, l.i, r.i);
          const lt = this.lib.less(l, r);
          const gt = this.lib.less(r, l);
          switch (op) { case '<': return lt; case '>': return gt; case '<=': return !gt; default: return !lt; }
        }
        case '<=>': { const lt = this.lib.less(l, r); const gt = this.lib.less(r, l); return lt ? -1 : gt ? 1 : 0; }
        default: throw new CppError('Unsupported', `unsupported operator ${op}`, n && n.line);
      }
    }

    isNumeric(v) { return typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean' || v instanceof Dbl || v instanceof Chr; }

    concat(l, r) {
      const s = (x) => (typeof x === 'string' ? x : x instanceof Chr ? String.fromCharCode(x.c) : this.lib.toStringValue(x));
      return s(l) + s(r);
    }

    ptrArith(op, l, r) {
      if (l instanceof Ptr && l.k === 'elem' && (op === '+' || op === '-') && !(r instanceof Ptr)) return new Ptr('elem', l.o, l.i + (op === '+' ? 1 : -1) * Number(toInt(r)));
      if (r instanceof Ptr && r.k === 'elem' && op === '+') return new Ptr('elem', r.o, r.i + Number(toInt(l)));
      if (l instanceof Ptr && r instanceof Ptr && op === '-') return l.i - r.i;
      throw new CppError('Type Error', 'unsupported pointer arithmetic');
    }

    equals(l, r) {
      if (l instanceof Iter && r instanceof Iter) return l.c === r.c && (l.assoc ? l.e === r.e : l.i === r.i);
      if (l instanceof Ptr || r instanceof Ptr || l === null || r === null || l === undefined || r === undefined) {
        if ((l === null || r === null) && (this.isNumeric(l) || this.isNumeric(r))) return truthy(l) === truthy(r) && !(l !== null && r !== null);
        return ptrEq(l, r);
      }
      if (this.isNumeric(l) && this.isNumeric(r)) return compare('==', l, r);
      if (typeof l === 'string' && typeof r === 'string') return l === r;
      return this.lib.deepEq(l, r);
    }

    userOperator(op, l, r) {
      if (l instanceof Obj) {
        const ms = this.findMethods(l.cls, 'operator' + op);
        if (ms) { const d = this.pickOverload(ms, [r]); if (d) return { v: this.callFunction(d, [r], l, false) }; }
        if (op === '!=') { const eq = this.findMethods(l.cls, 'operator=='); if (eq) return { v: !truthy(this.callFunction(eq[0], [r], l, false)) }; }
        if (op === '>') { const lt = this.findMethods(l.cls, 'operator<'); if (lt) return { v: truthy(this.callFunction(lt[0], [l], r, false)) }; }
      }
      const free = this.funcs.get('operator' + op);
      if (free) { const d = this.pickOverload(free, [l, r]); if (d) return { v: this.callFunction(d, [l, r], null, false) }; }
      return undefined;
    }

    unary(n, env) {
      const op = n.op;
      const v = this.ev(n.f.argument, env);
      switch (op) {
        case '!': return !truthy(v);
        case '-': if (v instanceof Dbl) return new Dbl(-v.v); if (v instanceof Obj) { const ms = this.findMethods(v.cls, 'operator-'); if (ms) return this.callFunction(ms[0], [], v, false); } return arith('-', 0, v);
        case '+': return v instanceof Chr || typeof v === 'boolean' ? toInt(v) : v;
        case '~': return arith('-', -1, v);
        default: throw new CppError('Unsupported', `unsupported unary operator ${op}`, n.line);
      }
    }

    pointerExpr(n, env) {
      if (n.op === '*') return this.derefValue(this.ev(n.f.argument, env));
      // &x
      const arg = n.f.argument;
      if (arg.t === 'identifier' || arg.t === 'field_expression' || arg.t === 'subscript_expression' || arg.t === 'qualified_identifier' || arg.t === 'parenthesized_expression') {
        const ref = this.lv(arg, env);
        if (ref instanceof ElemRef) return new Ptr('elem', ref.owner || { a: ref.a, et: ref.et }, ref.i);
        const v = ref.v;
        if (v instanceof Fn) return v;
        if (v instanceof Obj || v instanceof Vec || v instanceof MapObj || v instanceof Deq || v instanceof Stk || v instanceof Que || v instanceof PQ || v instanceof Pair || v instanceof Tup) return new Ptr('obj', v);
        return new Ptr('cell', ref);
      }
      const v = this.ev(arg, env);
      return new Ptr('cell', new Cell(v));
    }

    update(n, env) {
      const prefix = n.opIndex !== undefined && n.opIndex < (n.c[0] ? n.c[0].index : 1);
      const ref = this.lv(n.f.argument, env);
      const old = ref.v;
      let nv;
      const d = n.op === '++' ? 1 : -1;
      if (old instanceof Ptr) nv = this.ptrArith('+', old, d);
      else if (old instanceof Iter) nv = this.lib.iterArith('+', old, d);
      else if (old instanceof Dbl) nv = new Dbl(old.v + d);
      else if (old instanceof Chr) nv = new Chr((old.c + d) & 255);
      else if (typeof old === 'boolean') nv = true;
      else nv = arith('+', old, d);
      ref.v = ref instanceof Cell && ref.t ? this.coerce(ref.t, nv) : nv;
      return prefix ? ref.v : old;
    }

    assignment(n, env) {
      const op = n.op;
      const leftNode = n.f.left;
      const ref = this.lv(leftNode, env);
      let rv;
      if (op === '=') {
        const rn = n.f.right;
        rv = rn.t === 'initializer_list' ? this.ev(rn, env) : this.ev(rn, env);
        const t = ref instanceof Cell ? ref.t : (ref instanceof ElemRef ? ref.et : null);
        if (rv instanceof InitList && t) rv = this.coerce(t, rv);
        else if (rv instanceof InitList) rv = this.lib.initListFor(ref.v, rv);
        if (!this.isMove(rn)) rv = copyVal(rv);
        if (ref instanceof Cell && ref.t) rv = this.coerce(ref.t, rv);
        else if (ref instanceof Cell && ref.v instanceof Obj && rv instanceof Obj && ref.v.cls.ctors.length === 0 && false) rv = rv;
        // assigning a whole struct through a variable that already holds one keeps the object identity of the variable
        ref.v = rv;
        return rv;
      }
      const cur = ref.v;
      const r = this.ev(n.f.right, env);
      const bop = op.slice(0, -1);
      if (cur instanceof Obj) {
        const ms = this.findMethods(cur.cls, 'operator' + op);
        if (ms) { this.callFunction(ms[0], [r], cur, false); return cur; }
      }
      let res;
      if (bop === '+' && (typeof cur === 'string')) res = this.concat(cur, r);
      else if (cur instanceof Ptr) res = this.ptrArith(bop, cur, r);
      else if (cur instanceof Iter) res = this.lib.iterArith(bop, cur, r);
      else if (cur instanceof Chr) res = new Chr(Number(toInt(arith(bop, cur, r))) & 255);
      else if (typeof cur === 'boolean') res = truthy(arith(bop, cur, r));
      else res = arith(bop, cur, r);
      if (ref instanceof Cell && ref.t) res = this.coerce(ref.t, res);
      else if (ref instanceof ElemRef && ref.et) res = this.coerce(ref.et, res);
      else if (ref instanceof FieldRef) { /* coerces in the setter */ } else if (typeof cur === 'number' && res instanceof Dbl) res = toInt(res);
      ref.v = res;
      return res;
    }

    isMove(n) {
      return n.t === 'call_expression' && n.f.function.t !== 'field_expression' && /(^|::)move$/.test(n.f.function.x || (n.f.function.f && n.f.function.f.name && n.f.function.f.name.x) || '');
    }

    cast(t, v) {
      if (!t) return v;
      if (v instanceof Ref) v = v.v;
      if (t.p > 0) {
        if (v instanceof RawAlloc) return this.materialize(t, v);
        if (v instanceof Ptr && t.n !== 'void') return v;
        return this.coerce(t, v);
      }
      return this.coerce(t, v);
    }

    sizeofExpr(n, env) {
      if (n.f.type) return this.sizeOfType(this.typeFrom(n.f.type));
      const v = n.f.value;
      const inner = v.t === 'parenthesized_expression' ? v.c[0] : v;
      if (inner.t === 'identifier' && !this.lookupCell(inner.x, env) && !this.G.vars.has(inner.x) && (this.classes.has(inner.x) || this.typedefs.has(inner.x) || SCALAR[inner.x])) return this.sizeOfType(this.typeFrom(inner));
      const val = this.ev(inner, env);
      return this.sizeOfValue(val, inner, env);
    }

    sizeOfValue(val) {
      if (val instanceof Vec) return val.kind === 'array' ? val.a.length * this.sizeOfType(val.et) : 24;
      if (val instanceof Chr) return 1;
      if (val instanceof Dbl) return 8;
      if (typeof val === 'boolean') return 1;
      if (typeof val === 'number') return 4;
      if (typeof val === 'bigint') return 8;
      if (val instanceof Obj) return this.sizeOfType(mkType(val.cls.name));
      if (typeof val === 'string') return 32;
      return 8;
    }

    newExpr(n, env) {
      const t0 = this.typeFrom(n.f.type);
      const decl = n.f.declarator;
      if (decl && decl.t === 'new_declarator') {
        const len = Number(toInt(this.ev(decl.f.length, env)));
        const a = [];
        for (let i = 0; i < len; i++) a.push(this.defaultValue(t0));
        return new Ptr('elem', new Vec(a, t0, 'array', typeName(t0) + '[]'), 0);
      }
      const args = n.f.arguments ? (n.f.arguments.t === 'argument_list' ? this.evalArgs(n.f.arguments.c, env) : [this.ev(n.f.arguments, env)]) : [];
      if (t0.cls === 'obj' && t0.n !== 'auto') {
        const v = this.constructValue(t0, args);
        return new Ptr('obj', v);
      }
      return new Ptr('cell', new Cell(args.length ? this.coerce(t0, valueOf(args[0])) : this.defaultValue(t0), t0));
    }

    // -- calls

    call(n, env) {
      const fn = n.f.function;
      const argNodes = n.f.arguments ? n.f.arguments.c : [];
      switch (fn.t) {
        case 'identifier': return this.callNamed(fn.x, argNodes, env, n);
        case 'field_expression': return this.callMethod(fn, argNodes, env, n);
        case 'qualified_identifier': return this.callQualified(fn, argNodes, env, n);
        case 'template_function': return this.callTemplate(fn, argNodes, env, n);
        case 'primitive_type': case 'sized_type_specifier': {
          const t = this.typeFrom(fn);
          const a = this.evalArgs(argNodes, env);
          return a.length ? this.cast(t, valueOf(a[0])) : this.defaultValue(t);
        }
        default: {
          const f = this.ev(fn, env);
          return this.callValue(f, this.evalArgs(argNodes, env));
        }
      }
    }

    callNamed(name, argNodes, env, n) {
      // a callable variable (lambda, function<>, function pointer)
      const cell = this.lookupCell(name, env) || this.G.vars.get(name);
      if (cell) {
        const f = cell.v;
        if (f instanceof Fn || f instanceof Obj) return this.callValue(f, this.evalArgs(argNodes, env, f instanceof Fn && f.kind === 'lambda' ? f.params : null));
      }
      // a method of the current class
      if (env.thisPtr && env.thisPtr.o instanceof Obj) {
        const ms = this.findMethods(env.thisPtr.o.cls, name);
        if (ms) {
          const args = this.evalArgs(argNodes, env, this.paramSpecsFor(ms, argNodes.length));
          const d = this.pickOverload(ms, args);
          if (!d) throw new CppError('Type Error', `no matching call to ${name}`, n.line);
          return this.callFunction(d, args, d.isStatic ? null : env.thisPtr, false);
        }
      }
      const defs = this.funcs.get(name);
      if (defs) {
        const args = this.evalArgs(argNodes, env, this.paramSpecsFor(defs, argNodes.length));
        const d = this.pickOverload(defs, args);
        if (!d) throw new CppError('Type Error', `no matching call to ${name}(${args.length} argument${args.length === 1 ? '' : 's'})`, n.line);
        return this.callFunction(d, args, null, false);
      }
      const cd = this.classes.get(name) || (this.typedefs.has(name) ? this.classes.get(this.typedefs.get(name).n) : null);
      if (cd) return this.constructObject(cd, this.evalArgs(argNodes, env));
      if (this.typedefs.has(name)) {
        const t = this.typedefs.get(name);
        return this.constructValue(t, this.evalArgs(argNodes, env));
      }
      if (SCALAR[name] || name === 'string' || name === 'vector' || name === 'pair') {
        return this.constructValue(mkType(name), this.evalArgs(argNodes, env));
      }
      if (this.macros.has(name)) {
        const f = this.macroValue(name);
        return this.callValue(f, this.evalArgs(argNodes, env));
      }
      return this.callBuiltin(name, argNodes, env, null, n);
    }

    paramSpecsFor(defs, n) {
      const d = defs.length === 1 ? defs[0] : defs.find((x) => x.params.length >= n && x.required <= n);
      return d ? d.params : null;
    }

    callBuiltin(name, argNodes, env, targs, n) {
      if (!this.lib.hasFree(name)) throw new CppError('Name Error', `'${name}' was not declared in this scope`, n && n.line);
      const refs = this.lib.refArgs(name);
      const args = [];
      argNodes.forEach((a, i) => {
        if (a.t === 'comment') return;
        args.push(refs && refs.includes(i) && this.isLvalueNode(a) ? this.lv(a, env) : this.ev(a, env));
      });
      return this.lib.callFree(name, args, targs, n);
    }

    callQualified(fn, argNodes, env, n) {
      const scope = fn.f.scope;
      const nameNode = fn.f.name;
      const name = nameNode.t === 'template_function' ? nameNode.f.name.x : (nameNode.t === 'destructor_name' ? nameNode.x : nameNode.x);
      const sname = scope ? scope.x : null;
      if (scope && scope.t === 'template_type') {
        const t = this.typeFrom(scope);
        const args = this.evalArgs(argNodes, env);
        const r = this.lib.scopedCall(t, name, args.map(valueOf));
        if (r !== undefined) return r;
      }
      if (sname && sname !== 'std') {
        const cd = this.classes.get(sname);
        if (cd) {
          const ms = this.findMethods(cd, name);
          if (ms) {
            const args = this.evalArgs(argNodes, env, this.paramSpecsFor(ms, argNodes.length));
            const d = this.pickOverload(ms, args);
            return this.callFunction(d, args, d.isStatic ? null : env.thisPtr, false);
          }
          if (name === sname) return this.constructObject(cd, this.evalArgs(argNodes, env));
        }
        const r = this.lib.scopedCall(mkType(sname), name, this.evalArgs(argNodes, env).map(valueOf));
        if (r !== undefined) return r;
      }
      const targs = nameNode.t === 'template_function' ? this.typeFrom({ t: 'template_type', f: { name: nameNode.f.name, arguments: nameNode.f.arguments }, c: [] }) : null;
      if (this.funcs.has(name) && (!sname || sname === 'std' || !this.lib.hasFree(name))) return this.callNamed(name, argNodes, env, n);
      if (this.typedefs.has(name) || SCALAR[name] || ['vector', 'string', 'pair', 'map', 'set', 'unordered_map', 'unordered_set', 'queue', 'stack', 'deque', 'priority_queue', 'tuple', 'array'].includes(name)) {
        const t = targs || this.typedefs.get(name) || mkType(name);
        return this.constructValue(t, this.evalArgs(argNodes, env));
      }
      return this.callBuiltin(name, argNodes, env, targs, n);
    }

    callTemplate(fn, argNodes, env, n) {
      const name = fn.f.name.x;
      const t = this.typeFrom({ t: 'template_type', f: { name: fn.f.name, arguments: fn.f.arguments }, c: [] });
      switch (name) {
        case 'static_cast': case 'reinterpret_cast': case 'const_cast': case 'dynamic_cast': case 'bit_cast': {
          const tt = t.a[0];
          return this.cast(tt, this.ev(argNodes[0], env));
        }
        default: break;
      }
      if (this.funcs.has(name)) return this.callNamed(name, argNodes, env, n);
      if (this.classes.has(name)) return this.constructObject(this.classes.get(name), this.evalArgs(argNodes, env));
      if (this.typedefs.has(name)) return this.constructValue(this.typedefs.get(name), this.evalArgs(argNodes, env));
      if (['vector', 'pair', 'map', 'unordered_map', 'set', 'unordered_set', 'queue', 'stack', 'deque', 'priority_queue', 'tuple', 'array', 'multiset', 'multimap', 'list', 'string'].includes(name)) {
        return this.constructValue(t, this.evalArgs(argNodes, env));
      }
      return this.callBuiltin(name, argNodes, env, t, n);
    }

    callMethod(fn, argNodes, env, n) {
      const objNode = fn.f.argument;
      const arrow = fn.op === '->';
      const fieldNode = fn.f.field;
      const name = fieldNode.t === 'template_method' ? fieldNode.f.name.x : fieldNode.x;
      let recvRef = null;
      let recv;
      if (this.isLvalueNode(objNode)) { recvRef = this.lv(objNode, env); recv = recvRef.v; } else recv = this.ev(objNode, env);
      if (arrow || recv instanceof Ptr) {
        if (recv === null) throw new CppError('Segmentation Fault', `calling '${name}' through a null pointer`, n.line);
        if (recv instanceof Ptr && recv.k === 'cell') recvRef = recv.o;
        recv = this.derefValue(recv);
        if (!(recv instanceof Ref) && recvRef && !(recvRef instanceof Ref)) recvRef = null;
      }
      if (recv instanceof Obj) {
        const ms = this.findMethods(recv.cls, name);
        if (ms) {
          const args = this.evalArgs(argNodes, env, this.paramSpecsFor(ms, argNodes.length));
          const d = this.pickOverload(ms, args);
          if (!d) throw new CppError('Type Error', `no matching call to ${recv.cls.name}::${name}`, n.line);
          return this.callFunction(d, args, d.isStatic ? null : recv, false);
        }
        if (recv.cls.builtinException && name === 'what') return recv.f.msg;
        // a user functor object whose member is a callable
        throw new CppError('Type Error', `'${recv.cls.name}' has no method '${name}'`, n.line);
      }
      const args = this.evalArgs(argNodes, env);
      return this.lib.callMethod(recv, name, args, recvRef, n);
    }
  }

  NS.Interp = Interp;
  NS.Env = Env;
  NS.Ret = Ret;
  NS.mkType = mkType;
  NS.typeName = typeName;
  NS.SCALAR = SCALAR;
  NS.valueOf = valueOf;
  NS.FieldRef = FieldRef;
  NS.PairRef = PairRef;
  NS.ElemRef = ElemRef;
  NS.StrCharRef = StrCharRef;
  NS.MapRef = MapRef;
  NS.PtrRef = PtrRef;
  if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof self !== 'undefined' ? self : globalThis);
