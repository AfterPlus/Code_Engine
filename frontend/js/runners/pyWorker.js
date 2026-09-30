/*
 * Module Web Worker that traces Python with Pyodide (CPython compiled to WebAssembly, loaded from the jsDelivr CDN the
 * first time and cached by the browser after; recent Pyodide releases no longer support classic workers). pyTracer.py does the tracing; this file only loads the runtime and
 * relays runs. The main thread kills the worker on timeout or cancel and starts a fresh one for the next run.
 */
import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs';

const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
const post = self.postMessage.bind(self);
let runTrace = null;

const ready = (async () => {
  post({ type: 'progress', text: 'Loading the Python runtime (first run only)…' });
  const py = await loadPyodide({ indexURL: PYODIDE_BASE });
  const source = await (await fetch(new URL('./pyTracer.py', self.location.href))).text();
  py.FS.mkdirTree('/lcv');
  py.FS.writeFile('/lcv/pyTracer.py', source);
  py.runPython('import sys; sys.path.insert(0, "/lcv")');
  runTrace = py.pyimport('pyTracer').lcv_run;
  // User code has no business talking to the network.
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'Worker', 'SharedWorker', 'BroadcastChannel']) {
    try { self[name] = undefined; } catch (e) { /* non-writable in some browsers */ }
  }
  post({ type: 'ready' });
})();
ready.catch((e) => {
  post({ type: 'result', id: 0, result: { language: 'python', status: 'INTERNAL_ERROR', steps: [], error: { type: 'Runtime Unavailable', message: String(e && e.message || e) } } });
});

self.onmessage = async (event) => {
  const m = event.data || {};
  if (m.type !== 'run') return;
  let result;
  try {
    await ready;
    const json = runTrace(m.code, m.definitions || '', JSON.stringify(m.testCase || {}), m.maxSteps || 5000, m.timeoutMs || 10000);
    result = JSON.parse(json);
  } catch (e) {
    result = { language: 'python', status: 'INTERNAL_ERROR', steps: [], error: { type: 'Internal Error', message: String(e && e.message || e) } };
  }
  try {
    post({ type: 'result', id: m.id, result });
  } catch (e) {
    post({ type: 'result', id: m.id, result: JSON.parse(JSON.stringify(result)) });
  }
};
