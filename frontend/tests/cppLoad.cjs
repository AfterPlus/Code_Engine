// Loads the C/C++ engine under Node for tests: tree-sitter from the vendored WebAssembly, then the interpreter files.
const path = require('node:path');
const fs = require('node:fs');

const js = path.join(__dirname, '..', 'js');
const TreeSitter = require(path.join(js, 'vendor', 'tree-sitter.js'));
const NS = require(path.join(js, 'runners', 'cpp', 'cppValues.js'));
require(path.join(js, 'runners', 'cpp', 'cppParse.js'));
require(path.join(js, 'runners', 'cpp', 'cppInterp.js'));
require(path.join(js, 'runners', 'cpp', 'cppLib.js'));
require(path.join(js, 'runners', 'cpp', 'cppTracer.js'));

let ready = null;
function init() {
  if (!ready) {
    ready = NS.parseInit({
      TreeSitter,
      locateFile: (name) => path.join(js, 'vendor', name),
      wasmPath: fs.readFileSync(path.join(js, 'vendor', 'tree-sitter-cpp.wasm')),
    });
  }
  return ready;
}

/** Runs one solution against one test case: {status, output, steps, error, stdout}. */
async function run(language, code, testCase, opts = {}) {
  await init();
  return NS.runTrace(code, opts.definitions || '', testCase || {}, { language, maxSteps: opts.maxSteps || 5000, timeoutMs: opts.timeoutMs || 20000 });
}

module.exports = { NS, init, run };
