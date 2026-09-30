// The languages the app can trace, in the order they appear in the header.
//   engine  'server'  the Java backend (JVM debugger)
//           'worker'  a Web Worker in the browser (JavaScript, C, C++ interpreter; Python via Pyodide)

export const LANGUAGES = [
  { id: 'java', label: 'Java', monaco: 'java', engine: 'server', note: 'Java · traced with the JVM debugger' },
  { id: 'javascript', label: 'JavaScript', monaco: 'javascript', engine: 'worker', note: 'JavaScript · traced in your browser' },
  { id: 'python', label: 'Python', monaco: 'python', engine: 'worker', note: 'Python 3 · traced in your browser (Pyodide)' },
  { id: 'cpp', label: 'C++', monaco: 'cpp', engine: 'worker', note: 'C++ · traced by the built-in interpreter' },
  { id: 'c', label: 'C', monaco: 'c', engine: 'worker', note: 'C · traced by the built-in interpreter' },
];

export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id);

export function languageInfo(id) {
  return LANGUAGES.find((l) => l.id === id) || LANGUAGES[0];
}
