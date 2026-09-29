/*
 * JavaScript instrumenter.
 *
 * Parses user code with acorn, rewrites it so every statement, loop test, call, and return reports to a tracer
 * object (`__t`), and regenerates source with astring. Line numbers are baked into the injected calls, so the
 * generated code's own layout doesn't matter.
 *
 * For each pause point it also records which local names are in scope ("sites"), and passes a closure that
 * reads them. Closures read *live* bindings, so a caller's frame can be re-read while a callee runs.
 *
 * Works as a classic-worker script (defines self.LCVInstrument) and as a CommonJS module (for tests).
 */
(function (root) {
  'use strict';

  const F = '__lcv_f';       // per-call frame handle
  const HALT_CHECK = '__lcv_c';

  function instrument(code, acorn, astring) {
    const comments = [];
    const ast = acorn.parse(code, {
      ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true,
      allowReturnOutsideFunction: false, onComment: comments,
    });
    const sites = [];
    const topLevel = collectTopLevel(ast, code, comments);

    // ------------------------------------------------------------------ AST builders
    const id = (name) => ({ type: 'Identifier', name });
    const lit = (value) => ({ type: 'Literal', value });
    const member = (obj, prop) => ({ type: 'MemberExpression', object: id(obj), property: id(prop), computed: false, optional: false });
    const call = (callee, args) => ({ type: 'CallExpression', callee, arguments: args, optional: false });
    const exprStmt = (expression) => ({ type: 'ExpressionStatement', expression });
    const arrayOf = (names) => ({ type: 'ArrayExpression', elements: names.map(id) });
    const getter = (names) => names.length === 0 ? lit(null) : ({
      type: 'ArrowFunctionExpression', params: [], body: arrayOf(names), expression: true, async: false, generator: false,
    });
    const site = (names) => { sites.push(names); return sites.length - 1; };
    const stepCall = (line, names) => call(member('__t', 's'), [id(F), lit(line), lit(site(names)), getter(names)]);
    const stepStmt = (line, names) => exprStmt(stepCall(line, names));
    const block = (body) => ({ type: 'BlockStatement', body });

    // ------------------------------------------------------------------ scopes
    // A scope is a list of names visible from a point; `hidden` names (function declarations) are excluded
    // from snapshots because they are code, not data.
    function visible(scopes) {
      const seen = new Set();
      const out = [];
      for (let i = scopes.length - 1; i >= 0; i--) {
        for (const n of scopes[i].names) {
          if (!seen.has(n)) { seen.add(n); if (!scopes[i].hidden.has(n)) out.push(n); }
        }
      }
      // outermost first reads more naturally (params before locals)
      return orderOuterFirst(scopes, out);
    }
    function orderOuterFirst(scopes, names) {
      const set = new Set(names);
      const ordered = [];
      for (const s of scopes) for (const n of s.names) if (set.has(n) && !ordered.includes(n)) ordered.push(n);
      return ordered;
    }
    const newScope = (names = [], hidden = new Set()) => ({ names: [...names], hidden });

    // ------------------------------------------------------------------ transforms
    function transformFunction(fn, name, isMethod, isCtor) {
      const params = [];
      fn.params.forEach((p) => patternNames(p, params));
      const vars = [];
      const hoistedFns = [];
      if (fn.body.type === 'BlockStatement') collectVarScope(fn.body.body, vars, hoistedFns);
      const fnScope = newScope([...params, ...vars.filter((v) => !params.includes(v)), ...hoistedFns], new Set(hoistedFns));
      const ctx = { scopes: [fnScope], inFunction: true };

      const originalFirst = fn.body.type === 'BlockStatement' ? fn.body.body.find((st) => st.type !== 'FunctionDeclaration') : null;
      let bodyStatements;
      if (fn.body.type === 'BlockStatement') {
        bodyStatements = transformStatements(fn.body.body, ctx);
      } else {
        // concise arrow body: `x => expr`  ->  `{ return expr; }`
        const line = fn.body.loc.start.line;
        const expr = transformExpr(fn.body, ctx);
        bodyStatements = [
          stepStmt(line, visible(ctx.scopes)),
          { type: 'ReturnStatement', argument: call(member('__t', 'ret'), [id(F), expr]) },
        ];
        fn.expression = false;
      }
      const argNames = params.slice();
      // like a debugger, a call "enters" on the first line of its body
      const firstBodyLine = fn.body.type === 'BlockStatement' && originalFirst ? originalFirst.loc.start.line : fn.body.loc ? fn.body.loc.start.line : fn.loc.start.line;
      const enterArgs = [lit(name), lit(firstBodyLine), lit(site(argNames)), getter(argNames)];
      if (!isCtor && fn.type !== 'ArrowFunctionExpression') enterArgs.push({ type: 'ThisExpression' });
      const enter = {
        type: 'VariableDeclaration', kind: 'const',
        declarations: [{ type: 'VariableDeclarator', id: id(F), init: call(member('__t', 'enter'), enterArgs) }],
      };
      const errId = '__lcv_e';
      const tryStmt = {
        type: 'TryStatement',
        block: block(bodyStatements),
        handler: {
          type: 'CatchClause', param: id(errId),
          body: block([exprStmt(call(member('__t', 'error'), [id(F), id(errId)])), { type: 'ThrowStatement', argument: id(errId) }]),
        },
        finalizer: block([exprStmt(call(member('__t', 'leave'), [id(F)]))]),
      };
      // Derived-class constructors must call super() before anything touches `this`; keep the enter
      // call first anyway (it doesn't touch `this` for constructors).
      fn.body = block([enter, tryStmt]);
    }

    function transformStatements(list, ctx) {
      const out = [];
      // function declarations are hoisted within a block
      const blockScope = ctx.scopes[ctx.scopes.length - 1];
      for (const st of list) {
        if (st.type === 'FunctionDeclaration' && st.id && !blockScope.names.includes(st.id.name)) {
          blockScope.names.push(st.id.name);
          blockScope.hidden.add(st.id.name);
        }
      }
      for (const st of list) {
        const needsStep = ctx.inFunction && !NO_STEP.has(st.type);
        if (needsStep) out.push(stepStmt(st.loc.start.line, visible(ctx.scopes)));
        out.push(transformStatement(st, ctx));
        // let/const/class become visible after their declaration executes (TDZ)
        if (st.type === 'VariableDeclaration' && st.kind !== 'var') {
          st.declarations.forEach((d) => patternNames(d.id, blockScope.names));
        } else if (st.type === 'ClassDeclaration' && st.id) {
          blockScope.names.push(st.id.name);
          blockScope.hidden.add(st.id.name);
        }
      }
      return out;
    }

    const NO_STEP = new Set(['FunctionDeclaration', 'ClassDeclaration', 'EmptyStatement', 'WhileStatement', 'ForStatement']);

    // Wraps a single statement in a block (with its own step) so loop/if bodies step every time.
    function asBlock(st, ctx) {
      if (st.type === 'BlockStatement') return transformStatement(st, ctx);
      ctx.scopes.push(newScope());
      const body = transformStatements([st], ctx);
      ctx.scopes.pop();
      return block(body);
    }

    function transformStatement(st, ctx) {
      switch (st.type) {
        case 'BlockStatement': {
          ctx.scopes.push(newScope());
          st.body = transformStatements(st.body, ctx);
          ctx.scopes.pop();
          return st;
        }
        case 'ExpressionStatement':
          st.expression = transformExpr(st.expression, ctx);
          return st;
        case 'VariableDeclaration':
          st.declarations.forEach((d) => { if (d.init) d.init = transformExpr(d.init, ctx, patternName(d.id)); });
          return st;
        case 'ReturnStatement': {
          const arg = st.argument ? transformExpr(st.argument, ctx) : id('undefined');
          st.argument = ctx.inFunction ? call(member('__t', 'ret'), [id(F), arg]) : arg;
          return st;
        }
        case 'IfStatement':
          st.test = transformExpr(st.test, ctx);
          st.consequent = asBlock(st.consequent, ctx);
          if (st.alternate) st.alternate = st.alternate.type === 'IfStatement'
            ? transformElseIf(st.alternate, ctx) : asBlock(st.alternate, ctx);
          return st;
        case 'ForStatement': {
          ctx.scopes.push(newScope());
          if (st.init) {
            if (st.init.type === 'VariableDeclaration') {
              st.init = transformStatement(st.init, ctx);
              if (st.init.kind !== 'var') st.init.declarations.forEach((d) => patternNames(d.id, ctx.scopes[ctx.scopes.length - 1].names));
            } else st.init = transformExpr(st.init, ctx);
          }
          st.test = loopTest(st.loc.start.line, st.test ? transformExpr(st.test, ctx) : lit(true), ctx);
          if (st.update) st.update = transformExpr(st.update, ctx);
          st.body = asBlock(st.body, ctx);
          ctx.scopes.pop();
          return st;
        }
        case 'WhileStatement':
          st.test = loopTest(st.loc.start.line, transformExpr(st.test, ctx), ctx);
          st.body = asBlock(st.body, ctx);
          return st;
        case 'DoWhileStatement':
          st.body = asBlock(st.body, ctx);
          st.test = transformExpr(st.test, ctx);
          return st;
        case 'ForInStatement':
        case 'ForOfStatement': {
          ctx.scopes.push(newScope());
          st.right = transformExpr(st.right, ctx);
          if (st.left.type === 'VariableDeclaration') st.left.declarations.forEach((d) => patternNames(d.id, ctx.scopes[ctx.scopes.length - 1].names));
          st.body = asBlock(st.body, ctx);
          ctx.scopes.pop();
          return st;
        }
        case 'SwitchStatement':
          st.discriminant = transformExpr(st.discriminant, ctx);
          // One scope per case: a `let` in one case is in its TDZ when another case runs.
          st.cases.forEach((c) => {
            if (c.test) c.test = transformExpr(c.test, ctx);
            ctx.scopes.push(newScope());
            c.consequent = transformStatements(c.consequent, ctx);
            ctx.scopes.pop();
          });
          return st;
        case 'TryStatement':
          st.block = transformStatement(st.block, ctx);
          if (st.handler) {
            if (!st.handler.param) st.handler.param = id(HALT_CHECK);
            const names = [];
            patternNames(st.handler.param, names);
            ctx.scopes.push(newScope(names));
            const body = transformStatements(st.handler.body.body, ctx);
            ctx.scopes.pop();
            // never let user code swallow the tracer's step-limit signal
            const rethrow = {
              type: 'IfStatement',
              test: call(member('__t', 'isHalt'), [st.handler.param.type === 'Identifier' ? id(st.handler.param.name) : lit(null)]),
              consequent: { type: 'ThrowStatement', argument: st.handler.param.type === 'Identifier' ? id(st.handler.param.name) : id('undefined') },
              alternate: null,
            };
            st.handler.body = block([rethrow, ...body]);
          }
          if (st.finalizer) st.finalizer = transformStatement(st.finalizer, ctx);
          return st;
        case 'ThrowStatement':
          st.argument = transformExpr(st.argument, ctx);
          return st;
        case 'LabeledStatement':
          st.body = transformStatement(st.body, ctx);
          return st;
        case 'FunctionDeclaration':
          transformFunction(st, st.id ? st.id.name : 'anonymous', false, false);
          return st;
        case 'ClassDeclaration':
          transformClass(st, ctx);
          return st;
        default:
          return st;
      }
    }

    function transformElseIf(st, ctx) {
      // `else if` chains: give the nested if its own step so the condition line is highlighted.
      const inner = transformStatement(st, ctx);
      if (!ctx.inFunction) return inner;
      return block([stepStmt(st.loc.start.line, visible(ctx.scopes)), inner]);
    }

    function loopTest(line, test, ctx) {
      if (!ctx.inFunction) return test;
      return { type: 'SequenceExpression', expressions: [stepCall(line, visible(ctx.scopes)), test] };
    }

    function transformClass(cls, ctx) {
      const className = cls.id ? cls.id.name : 'AnonymousClass';
      for (const el of cls.body.body) {
        if (el.type === 'MethodDefinition' && el.value) {
          const isCtor = el.kind === 'constructor';
          const mName = isCtor ? className : (el.key.type === 'Identifier' ? el.key.name : 'method');
          transformFunction(el.value, isCtor ? 'new ' + className : className + '.' + mName, true, isCtor);
        } else if (el.type === 'PropertyDefinition' && el.value) {
          el.value = transformExpr(el.value, ctx);
        }
      }
    }

    // Expressions: only nested functions/classes need rewriting.
    function transformExpr(node, ctx, nameHint) {
      if (!node || typeof node !== 'object') return node;
      if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
        const name = (node.id && node.id.name) || nameHint || (node.type === 'ArrowFunctionExpression' ? 'lambda' : 'anonymous');
        transformFunction(node, name, false, false);
        return node;
      }
      if (node.type === 'ClassExpression') {
        transformClass(node, ctx);
        return node;
      }
      for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue;
        const v = node[key];
        if (Array.isArray(v)) node[key] = v.map((c) => (c && typeof c.type === 'string' ? transformExpr(c, ctx) : c));
        else if (v && typeof v.type === 'string') {
          const hint = node.type === 'Property' && key === 'value' && node.key && node.key.type === 'Identifier' ? node.key.name
            : node.type === 'AssignmentExpression' && key === 'right' ? patternName(node.left) : undefined;
          node[key] = transformExpr(v, ctx, hint);
        }
      }
      return node;
    }

    // ------------------------------------------------------------------ program
    const programCtx = { scopes: [newScope()], inFunction: false };
    ast.body = ast.body.map((st) => transformStatement(st, programCtx));

    return { code: astring.generate(ast), sites, topLevel };
  }

  // ---------------------------------------------------------------------- helpers

  function patternName(p) {
    if (!p) return undefined;
    if (p.type === 'Identifier') return p.name;
    if (p.type === 'MemberExpression' && !p.computed && p.property.type === 'Identifier') return p.property.name;
    return undefined;
  }

  function patternNames(p, out) {
    if (!p) return out;
    switch (p.type) {
      case 'Identifier': if (!out.includes(p.name)) out.push(p.name); break;
      case 'AssignmentPattern': patternNames(p.left, out); break;
      case 'RestElement': patternNames(p.argument, out); break;
      case 'ArrayPattern': p.elements.forEach((e) => patternNames(e, out)); break;
      case 'ObjectPattern': p.properties.forEach((pr) => patternNames(pr.type === 'RestElement' ? pr : pr.value, out)); break;
      default: break;
    }
    return out;
  }

  /** `var` declarations and function declarations hoisted to the function scope (not into nested functions). */
  function collectVarScope(stmts, vars, fns) {
    const visit = (node, top) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach((n) => visit(n, top)); return; }
      switch (node.type) {
        case 'FunctionDeclaration':
          if (top && node.id) fns.push(node.id.name);
          return;
        case 'FunctionExpression': case 'ArrowFunctionExpression': case 'ClassDeclaration': case 'ClassExpression':
          return;
        case 'VariableDeclaration':
          if (node.kind === 'var') node.declarations.forEach((d) => patternNames(d.id, vars));
          node.declarations.forEach((d) => visit(d.init, false));
          return;
        default:
          for (const k of Object.keys(node)) {
            if (k === 'loc') continue;
            const v = node[k];
            if (v && typeof v === 'object') visit(v, false);
          }
      }
    };
    stmts.forEach((s) => visit(s, true));
  }

  /** Top-level callables (with JSDoc param types) and data globals, used by the harness. */
  function collectTopLevel(ast, code, comments) {
    const functions = [];
    const globals = [];
    const declared = [];
    const jsdocFor = (node) => {
      let best = null;
      for (const c of comments) {
        if (c.type === 'Block' && c.end <= node.start && code.slice(c.end, node.start).trim() === '') best = c;
      }
      if (!best) return {};
      const types = {};
      const re = /@param\s*\{([^}]+)\}\s*\[?([\w$]+)/g;
      let m;
      while ((m = re.exec(best.value))) types[m[2]] = m[1].trim();
      const ret = /@return[s]?\s*\{([^}]+)\}/.exec(best.value);
      if (ret) types.$return = ret[1].trim();
      return types;
    };
    const paramsOf = (fn) => fn.params.map((p) => patternName(p.type === 'AssignmentPattern' ? p.left : p) || '_');
    for (const st of ast.body) {
      if (st.type === 'FunctionDeclaration' && st.id) {
        functions.push({ name: st.id.name, params: paramsOf(st), types: jsdocFor(st), line: st.loc.start.line });
        declared.push(st.id.name);
      } else if (st.type === 'ClassDeclaration' && st.id) {
        declared.push(st.id.name);
        const methods = st.body.body.filter((el) => el.type === 'MethodDefinition' && el.kind === 'method' && !el.static && el.key.type === 'Identifier');
        functions.push({ name: st.id.name, isClass: true, methods: methods.map((el) => ({ name: el.key.name, params: paramsOf(el.value), types: jsdocFor(el) })) });
      } else if (st.type === 'VariableDeclaration') {
        for (const d of st.declarations) {
          const names = patternNames(d.id, []);
          names.forEach((n) => declared.push(n));
          if (d.id.type === 'Identifier' && d.init && (d.init.type === 'FunctionExpression' || d.init.type === 'ArrowFunctionExpression')) {
            functions.push({ name: d.id.name, params: paramsOf(d.init), types: jsdocFor(st), line: st.loc.start.line });
          } else {
            names.forEach((n) => globals.push(n));
          }
        }
      }
    }
    return { functions, globals, declared };
  }

  const api = { instrument };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LCVInstrument = api;
})(typeof self !== 'undefined' ? self : this);
