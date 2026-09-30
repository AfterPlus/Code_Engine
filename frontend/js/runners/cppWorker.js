/*
 * Web Worker for C and C++. tree-sitter (WebAssembly, vendored under js/vendor) parses the program and the
 * interpreter in js/runners/cpp runs it, reporting every statement to the tracer. The worker is long-lived: the
 * grammar is a few MB of WebAssembly, so it is loaded once. The main thread kills the worker on timeout or cancel.
 */
/* global importScripts, TreeSitter, LCVCpp */
importScripts(
  '../vendor/tree-sitter.js', './structures.js',
  './cpp/cppValues.js', './cpp/cppParse.js', './cpp/cppInterp.js', './cpp/cppLib.js', './cpp/cppTracer.js',
);

const post = self.postMessage.bind(self);

const ready = (async () => {
  post({ type: 'progress', text: 'Loading the C/C++ parser…' });
  const wasm = await (await fetch(new URL('../vendor/tree-sitter-cpp.wasm', self.location.href))).arrayBuffer();
  await LCVCpp.parseInit({
    TreeSitter,
    locateFile: (name) => new URL('../vendor/' + name, self.location.href).href,
    wasmPath: new Uint8Array(wasm),
  });
  // User code has no business talking to the network.
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'Worker', 'SharedWorker', 'BroadcastChannel']) {
    try { self[name] = undefined; } catch (e) { /* non-writable in some browsers */ }
  }
  post({ type: 'ready' });
})();
ready.catch((e) => {
  post({ type: 'result', id: 0, result: { language: 'cpp', status: 'INTERNAL_ERROR', steps: [], error: { type: 'Runtime Unavailable', message: String(e && e.message || e) } } });
});

self.onmessage = async (event) => {
  const m = event.data || {};
  if (m.type !== 'run') return;
  let result;
  try {
    await ready;
    result = LCVCpp.runTrace(m.code, m.definitions || '', m.testCase || {}, { language: m.language, maxSteps: m.maxSteps, timeoutMs: m.timeoutMs });
  } catch (e) {
    result = { language: m.language, status: 'INTERNAL_ERROR', steps: [], error: { type: 'Internal Error', message: String(e && e.stack || e) } };
  }
  try {
    post({ type: 'result', id: m.id, result });
  } catch (e) {
    post({ type: 'result', id: m.id, result: JSON.parse(JSON.stringify(result)) });
  }
};
