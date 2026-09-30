// A long-lived Web Worker per language (Python and C/C++ need a few seconds to load their runtime, so the worker is
// kept between runs). A run that times out or is cancelled kills the worker; the next run starts a fresh one.
//
// The worker protocol: main -> worker  {type:'run', id, ...payload}
//                      worker -> main  {type:'ready'} | {type:'progress', text} | {type:'result', id, result}

const workers = new Map(); // key -> {worker, ready: Promise, current}

function failure(language, status, type, message) {
  return { language, status, steps: [], error: { type, message } };
}

function spawn(key, url, options) {
  const entry = { worker: null, current: null, progress: null };
  entry.worker = new Worker(url, options);
  entry.ready = new Promise((resolve, reject) => {
    entry.worker.addEventListener('message', (ev) => {
      const m = ev.data || {};
      if (m.type === 'ready') resolve();
      else if (m.type === 'progress' && entry.progress) entry.progress(m.text);
      else if (m.type === 'result' && entry.current && entry.current.id === m.id) entry.current.settle(m.result);
    });
    entry.worker.addEventListener('error', (ev) => {
      ev.preventDefault();
      const message = ev.message || 'The runtime failed to load.';
      reject(new Error(message));
      if (entry.current) entry.current.settle(failure(entry.current.language, 'INTERNAL_ERROR', 'Internal Error', message));
    });
  });
  entry.ready.catch(() => {});
  workers.set(key, entry);
  return entry;
}

function kill(key) {
  const entry = workers.get(key);
  if (!entry) return;
  workers.delete(key);
  try { entry.worker.terminate(); } catch (e) { /* already gone */ }
}

let seq = 0;

/**
 * @param {{key: string, language: string, url: URL, options?: object, payload: object, timeoutMs: number,
 *          onProgress?: (text: string) => void, loadTimeoutMs?: number}} req
 * @returns {{promise: Promise<object>, cancel: () => void}}
 */
export function runInWorker(req) {
  const { key, language, url, options, payload, timeoutMs, onProgress, loadTimeoutMs = 90000 } = req;
  let settled = false;
  let timer = null;
  let cancelFn = null;
  const promise = new Promise((resolve) => {
    const started = performance.now();
    const finish = (result, killWorker) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const entry = workers.get(key);
      if (entry) { entry.current = null; entry.progress = null; }
      if (killWorker) kill(key);
      if (result && result.executionTimeMs === undefined) result.executionTimeMs = Math.round(performance.now() - started);
      resolve(result);
    };
    let entry;
    try {
      entry = workers.get(key) || spawn(key, url, options);
    } catch (e) {
      finish(failure(language, 'INTERNAL_ERROR', 'Internal Error', 'Could not start the ' + language + ' runtime: ' + e.message), true);
      return;
    }
    const id = ++seq;
    entry.progress = onProgress || null;
    entry.current = { id, language, settle: (r) => finish(r, false) };
    cancelFn = () => finish(failure(language, 'CANCELLED', 'Cancelled', 'Execution was cancelled.'), true);

    // The first run also has to load the runtime; only start the execution clock once it is ready.
    timer = setTimeout(() => finish(failure(language, 'INTERNAL_ERROR', 'Runtime Unavailable',
      'The ' + language + ' runtime did not load in time. Check your connection and try again.'), true), loadTimeoutMs);
    entry.ready.then(() => {
      if (settled) return;
      clearTimeout(timer);
      // the worker checks its own deadline between steps; this is the backstop for code that never yields
      timer = setTimeout(() => {
        const r = failure(language, 'TIMEOUT', 'Timeout', `Execution exceeded ${Math.round(timeoutMs / 1000)} seconds.`);
        finish(r, true);
      }, timeoutMs + 3000);
      entry.worker.postMessage({ type: 'run', id, timeoutMs, ...payload });
    }, (err) => finish(failure(language, 'INTERNAL_ERROR', 'Runtime Unavailable',
      'Could not load the ' + language + ' runtime: ' + (err && err.message ? err.message : err)), true));
  });
  return { promise, cancel: () => cancelFn && cancelFn() };
}

/** Starts loading a runtime ahead of the first run. */
export function warmUp(key, url, options) {
  if (!workers.has(key)) {
    try { spawn(key, url, options); } catch (e) { /* the first run reports it */ }
  }
}
