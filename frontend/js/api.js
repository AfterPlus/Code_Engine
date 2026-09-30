// Execution API. Java goes to the Spring Boot backend; JavaScript, Python, C and C++ run in Web Workers in the
// browser. All of them resolve to the same normalized result shape.

import { runJavaScript } from './runners/jsRunner.js';
import { runPython } from './runners/pyRunner.js';
import { runCpp } from './runners/cppRunner.js';

const TERMINAL = new Set(['SUCCESS', 'COMPILE_ERROR', 'RUNTIME_ERROR', 'TIMEOUT', 'MEMORY_LIMIT', 'STEP_LIMIT',
  'SECURITY_VIOLATION', 'INVALID_INPUT', 'CANCELLED', 'INTERNAL_ERROR']);

export function defaultBackend() {
  return /^https?:$/.test(location.protocol) ? location.origin : 'http://localhost:8080';
}

/**
 * @returns {{promise: Promise<object>, cancel: () => void}}
 */
export function execute({ language, code, definitions, testCase, maxSteps, backend, onProgress }) {
  if (language === 'javascript') return runJavaScript({ code, definitions, testCase, maxSteps });
  if (language === 'python') return runPython({ code, definitions, testCase, maxSteps, onProgress });
  if (language === 'cpp' || language === 'c') return runCpp({ language, code, definitions, testCase, maxSteps, onProgress });
  return runRemote({ language, code, definitions, testCase, maxSteps }, (backend || defaultBackend()).replace(/\/+$/, ''));
}

function runRemote(request, base) {
  const controller = new AbortController();
  let executionId = null;
  let cancelled = false;

  const promise = (async () => {
    let res;
    try {
      res = await fetch(`${base}/api/v1/execution/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (e) {
      if (cancelled) return cancelledResult();
      return offline(base);
    }
    if (res.status === 429) return failure('INTERNAL_ERROR', 'Busy', 'The execution queue is full. Try again in a moment.');
    if (!res.ok) return failure('INTERNAL_ERROR', 'Server Error', `The backend responded with HTTP ${res.status}.`);
    let result = await res.json();
    executionId = result.executionId;
    while (!TERMINAL.has(result.status)) {
      if (cancelled) return cancelledResult();
      await new Promise((r) => setTimeout(r, 400));
      try {
        const poll = await fetch(`${base}/api/v1/execution/${executionId}`, { signal: controller.signal });
        if (!poll.ok) return failure('INTERNAL_ERROR', 'Server Error', `Polling failed with HTTP ${poll.status}.`);
        result = await poll.json();
      } catch (e) {
        if (cancelled) return cancelledResult();
        return offline(base);
      }
    }
    return result;
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (executionId) fetch(`${base}/api/v1/execution/${executionId}/cancel`, { method: 'POST' }).catch(() => {});
      controller.abort();
    },
  };
}

function offline(base) {
  return failure('INTERNAL_ERROR', 'Backend Unreachable',
    `Could not reach the Java backend at ${base}.\nStart it with:  cd backend && ./mvnw spring-boot:run\n(JavaScript solutions run in the browser and need no backend.)`);
}

function cancelledResult() {
  return failure('CANCELLED', 'Cancelled', 'Execution was cancelled.');
}

function failure(status, type, message) {
  return { status, steps: [], error: { type, message } };
}
