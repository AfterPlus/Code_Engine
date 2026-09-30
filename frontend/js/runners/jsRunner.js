// Main-thread side of the JavaScript runner: one short-lived Web Worker per execution, killed on timeout/cancel.

export function runJavaScript({ code, definitions, testCase, maxSteps, timeoutMs = 10000 }) {
  let worker;
  let timer;
  let settle;
  const promise = new Promise((resolve) => {
    settle = (r) => {
      clearTimeout(timer);
      if (worker) worker.terminate();
      worker = null;
      resolve(r);
    };
    const started = performance.now();
    try {
      worker = new Worker(new URL('./jsWorker.js', import.meta.url));
    } catch (e) {
      settle(failure('INTERNAL_ERROR', 'Internal Error', 'Could not start the JavaScript sandbox: ' + e.message));
      return;
    }
    worker.onmessage = (ev) => settle(ev.data);
    worker.onerror = (ev) => {
      ev.preventDefault();
      settle(failure('INTERNAL_ERROR', 'Internal Error', ev.message || 'The JavaScript sandbox crashed.'));
    };
    // The tracer checks its own deadline between steps; this is the backstop for code that never yields.
    timer = setTimeout(() => {
      const r = failure('TIMEOUT', 'Timeout', `Execution exceeded ${Math.round(timeoutMs / 1000)} seconds.`);
      r.executionTimeMs = Math.round(performance.now() - started);
      settle(r);
    }, timeoutMs + 2000);
    worker.postMessage({ code, definitions, testCase, maxSteps, timeoutMs });
  });
  return {
    promise,
    cancel: () => settle && settle(failure('CANCELLED', 'Cancelled', 'Execution was cancelled.')),
  };
}

function failure(status, type, message) {
  return { language: 'javascript', status, steps: [], error: { type, message } };
}
