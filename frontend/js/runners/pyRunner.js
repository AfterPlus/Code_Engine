// Python runs in the browser: CPython compiled to WebAssembly (Pyodide) inside a Web Worker, traced with
// sys.settrace (see pyTracer.py). The worker is kept between runs because the runtime takes a few seconds to load.

import { runInWorker } from './workerRunner.js';

export function runPython({ code, definitions, testCase, maxSteps, timeoutMs = 10000, onProgress }) {
  return runInWorker({
    key: 'python', language: 'python', url: new URL('./pyWorker.js', import.meta.url), options: { type: 'module' }, timeoutMs, onProgress,
    payload: { code, definitions, testCase, maxSteps },
  });
}
