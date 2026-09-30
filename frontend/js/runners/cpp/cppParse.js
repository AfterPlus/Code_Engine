/*
 * C / C++ front end: tree-sitter (WebAssembly) parses the source; this file turns its concrete syntax tree into a
 * plain-object AST the interpreter walks. Every node is  { t: type, line, endLine, s, e (source offsets), c: [named
 * children], f: { field: node | [nodes] }, op?: operator token, x?: leaf text, file }.
 *
 * Works as a classic-worker script and as a CommonJS module (for tests): both attach to LCVCpp.
 */
(function (root) {
  'use strict';
  const NS = root.LCVCpp || (root.LCVCpp = {});

  const LEAF_TEXT_TYPES = new Set(['string_literal', 'char_literal', 'raw_string_literal', 'concatenated_string', 'number_literal',
    'system_lib_string', 'preproc_arg', 'primitive_type', 'sized_type_specifier', 'type_qualifier', 'storage_class_specifier',
    'lambda_default_capture', 'operator_name', 'auto', 'access_specifier', 'preproc_directive']);

  let parser = null;
  let language = null;

  /**
   * @param {{TreeSitter: any, locateFile?: (name: string) => string, wasmPath: string | Uint8Array}} deps
   */
  async function init(deps) {
    if (parser) return;
    const TS = deps.TreeSitter;
    await TS.init(deps.locateFile ? { locateFile: deps.locateFile } : undefined);
    language = await TS.Language.load(deps.wasmPath);
    parser = new TS();
    parser.setLanguage(language);
  }

  function convert(node, src, file) {
    const o = { t: node.type, line: node.startPosition.row + 1, endLine: node.endPosition.row + 1, col: node.startPosition.column, s: node.startIndex, e: node.endIndex, c: [], f: {}, file };
    const n = node.childCount;
    if (n === 0 || LEAF_TEXT_TYPES.has(node.type)) o.x = src.slice(node.startIndex, node.endIndex);
    let amp = false;
    for (let i = 0; i < n; i++) {
      const ch = node.child(i);
      const field = node.fieldNameForChild(i);
      if (!ch.isNamed) {
        if (field === 'operator') { o.op = ch.type; o.opIndex = i; }
        else if (ch.type === '&' || ch.type === '&&' || ch.type === '*' || ch.type === '...') (o.tokens || (o.tokens = [])).push(ch.type);
        if (ch.type === '&') amp = true;
        continue;
      }
      const c = convert(ch, src, file);
      c.index = i;
      if (amp) { c.byRef = true; amp = false; }
      o.c.push(c);
      if (field) {
        if (o.f[field] === undefined) o.f[field] = c;
        else if (Array.isArray(o.f[field])) o.f[field].push(c);
        else o.f[field] = [o.f[field], c];
      }
    }
    return o;
  }

  /** The first syntax error in the tree as {line, column, message}, or null. */
  function firstError(node) {
    let best = null;
    (function walk(n) {
      if (best) return;
      if (n.type === 'ERROR' || n.isMissing) {
        best = { line: n.startPosition.row + 1, column: n.startPosition.column + 1, message: n.isMissing ? 'Syntax error: missing ' + n.type : 'Syntax error near "' + n.text.slice(0, 30).split('\n')[0] + '"' };
        return;
      }
      if (!n.hasError) return;
      for (let i = 0; i < n.childCount; i++) walk(n.child(i));
    })(node);
    return best;
  }

  /** @returns {{ast: object} | {error: {line, column, message}}} */
  function parse(src, file) {
    const tree = parser.parse(src);
    const root = tree.rootNode;
    if (root.hasError) {
      const err = firstError(root);
      tree.delete();
      return { error: err || { line: 1, column: 1, message: 'Syntax error' } };
    }
    const ast = convert(root, src, file);
    tree.delete();
    return { ast };
  }

  NS.parse = parse;
  NS.parseInit = init;
  if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof self !== 'undefined' ? self : globalThis);
