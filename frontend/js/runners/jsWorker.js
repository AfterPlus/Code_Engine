/*
 * Web Worker that traces JavaScript solutions off the main thread. The main thread terminates the worker on
 * timeout or cancel, so a runaway program can never freeze the page.
 */
/* global importScripts, acorn, astring, LCVInstrument, LCVTracer */
importScripts('../vendor/acorn.js', '../vendor/astring.min.js', './jsInstrumenter.js', './jsTracer.js');

const post = self.postMessage.bind(self);

// User code has no business talking to the network or loading more code.
for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'Worker', 'SharedWorker', 'BroadcastChannel']) {
  try { self[name] = undefined; } catch (e) { /* non-writable in some browsers */ }
}

self.onmessage = (event) => {
  const { code, testCase, maxSteps, timeoutMs } = event.data;
  let result;
  try {
    result = LCVTracer.runTrace(code, testCase || {}, { acorn, astring, instrumenter: LCVInstrument, maxSteps, timeoutMs });
  } catch (e) {
    result = { language: 'javascript', status: 'INTERNAL_ERROR', steps: [], error: { type: 'Internal Error', message: String(e && e.stack || e) } };
  }
  try {
    post(result);
  } catch (e) {
    // e.g. the program stored something non-cloneable; fall back to a JSON round trip
    post(JSON.parse(JSON.stringify(result)));
  }
};
