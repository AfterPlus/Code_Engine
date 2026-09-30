// C and C++ run in the browser too: tree-sitter parses the source and a tree-walking interpreter executes it,
// reporting every statement to the tracer. The worker is kept between runs (the grammar is a few MB of WebAssembly).

import { runInWorker } from './workerRunner.js';

export function runCpp({ language, code, definitions, testCase, maxSteps, timeoutMs = 10000, onProgress }) {
  return runInWorker({
    key: 'cpp', language, url: new URL('./cppWorker.js', import.meta.url), timeoutMs, onProgress,
    payload: { language, code, definitions, testCase, maxSteps },
  });
}
