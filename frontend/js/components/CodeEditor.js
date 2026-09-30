// Code editor: Monaco from the CDN, with a plain textarea fallback so the app still works offline.
// Highlights the line about to run (▶), the line that just ran (●), and the failing line (✕).
// Two documents share the editor: the solution, and the definitions (LeetCode's Node classes) that run before it.
// Hovering a name in the solution shows its value at the current step (see setHoverResolver).

import { h, mount } from '../util/dom.js';
import { LANGUAGES } from '../languages.js';

const MONACO_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs';
const MONACO_LANG = Object.fromEntries(LANGUAGES.map((l) => [l.id, l.monaco]));
const TABS = ['solution', 'defs'];

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function loadMonaco(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!window.require || !window.require.config) { reject(new Error('Monaco loader unavailable')); return; }
    const timer = setTimeout(() => reject(new Error('Monaco load timeout')), timeoutMs);
    window.MonacoEnvironment = {
      getWorkerUrl: () => 'data:text/javascript;charset=utf-8,' + encodeURIComponent(
        `self.MonacoEnvironment = { baseUrl: '${MONACO_BASE}/../' }; importScripts('${MONACO_BASE}/base/worker/workerMain.js');`),
    };
    window.require.config({ paths: { vs: MONACO_BASE } });
    window.require(['vs/editor/editor.main'], () => { clearTimeout(timer); resolve(window.monaco); }, (err) => { clearTimeout(timer); reject(err); });
  });
}

export class CodeEditor {
  constructor(host, { value = '', defs = '', language = 'java', onChange = () => {} } = {}) {
    this.host = host;
    this.values = { solution: value, defs };
    this.tab = 'solution';
    this.language = language;
    this.onChange = onChange;
    this.monaco = null;
    this.editor = null;
    this.models = {};
    this.decoIds = [];
    this.hoverResolver = null;
    this.banner = h('div', { class: 'lcv-stale-banner', hidden: true }, 'code changed — run again');
    this.highlightState = null;
    this.viewStates = {};
  }

  async init() {
    try {
      this.monaco = await loadMonaco();
      this.initMonaco();
    } catch (e) {
      this.initFallback();
    }
    this.host.appendChild(this.banner);
  }

  initMonaco() {
    const monaco = this.monaco;
    this.defineThemes();
    for (const tab of TABS) {
      const model = monaco.editor.createModel(this.values[tab], MONACO_LANG[this.language]);
      model.onDidChangeContent(() => {
        this.values[tab] = model.getValue();
        this.onChange(this.values[tab], tab);
      });
      this.models[tab] = model;
    }
    this.editor = monaco.editor.create(this.host, {
      model: this.models[this.tab],
      theme: this.themeName(),
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: "'JetBrains Mono', Consolas, monospace",
      fontSize: 13,
      lineHeight: 20,
      glyphMargin: true,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'none',
      tabSize: 4,
      padding: { top: 8 },
      fixedOverflowWidgets: true,
      stickyScroll: { enabled: false },
      hover: { enabled: true, delay: 150, sticky: true },
    });
    this.registerHover();
  }

  defineThemes() {
    const monaco = this.monaco;
    monaco.editor.defineTheme('lcv-dark', { base: 'vs-dark', inherit: true, rules: [], colors: { 'editor.background': '#151922', 'editorGutter.background': '#151922', 'editorLineNumber.foreground': '#4b5366' } });
    monaco.editor.defineTheme('lcv-light', { base: 'vs', inherit: true, rules: [], colors: { 'editor.background': '#ffffff' } });
  }

  themeName() {
    return cssVar('color-scheme') === 'light' ? 'lcv-light' : 'lcv-dark';
  }

  refreshTheme() {
    if (this.monaco) this.monaco.editor.setTheme(this.themeName());
  }

  // ------------------------------------------------------------------------------------------ hover

  /**
   * @param {(ctx: {word: string, line: number, column: number, lineText: string, before: string, after: string}) =>
   *   ({title?: string, body: string, range?: [number, number]} | null)} fn
   *   Called for a hover over the solution. `before` / `after` are the line text either side of the word.
   */
  setHoverResolver(fn) {
    this.hoverResolver = fn;
  }

  registerHover() {
    const monaco = this.monaco;
    const provider = {
      provideHover: (model, position) => {
        if (!this.hoverResolver || model !== this.models.solution) return null;
        const w = model.getWordAtPosition(position);
        if (!w) return null;
        const lineText = model.getLineContent(position.lineNumber);
        let out;
        try {
          out = this.hoverResolver({
            word: w.word, line: position.lineNumber, column: w.startColumn, lineText,
            before: lineText.slice(0, w.startColumn - 1), after: lineText.slice(w.endColumn - 1),
          });
        } catch (e) {
          return null;
        }
        if (!out) return null;
        const range = new monaco.Range(position.lineNumber, out.range ? out.range[0] : w.startColumn, position.lineNumber, out.range ? out.range[1] : w.endColumn);
        const contents = [];
        if (out.title) contents.push({ value: out.title });
        contents.push({ value: out.body });
        return { range, contents };
      },
    };
    this.hoverDisposables = [...new Set(Object.values(MONACO_LANG))].map((id) => monaco.languages.registerHoverProvider(id, provider));
  }

  // ------------------------------------------------------------------------------------------ fallback

  initFallback() {
    this.textarea = h('textarea', { class: 'fallback-text', spellcheck: 'false', wrap: 'off' });
    this.textarea.value = this.values[this.tab];
    this.gutter = h('div', { class: 'fallback-gutter' });
    this.textarea.addEventListener('input', () => {
      this.values[this.tab] = this.textarea.value;
      this.renderGutter();
      this.autosize();
      this.onChange(this.values[this.tab], this.tab);
    });
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const { selectionStart: a, selectionEnd: b } = this.textarea;
        this.textarea.setRangeText('    ', a, b, 'end');
        this.textarea.dispatchEvent(new Event('input'));
      }
    });
    mount(this.host, h('div', { class: 'fallback-editor' }, this.gutter, this.textarea));
    this.renderGutter();
    this.autosize();
  }

  autosize() {
    this.textarea.style.height = 'auto';
    this.textarea.style.height = this.textarea.scrollHeight + 'px';
  }

  renderGutter() {
    const n = this.values[this.tab].split('\n').length;
    const st = (this.tab === 'solution' && this.highlightState) || {};
    mount(this.gutter, Array.from({ length: n }, (_, i) => h('div', { class: [i + 1 === st.line && 'next', i + 1 === st.prevLine && 'prev'] }, i + 1)));
  }

  // ------------------------------------------------------------------------------------------ documents

  getValue(tab = 'solution') {
    const m = this.models[tab];
    return m ? m.getValue() : this.values[tab];
  }

  setValue(v, tab = 'solution') {
    this.values[tab] = v;
    if (this.models[tab]) {
      if (this.models[tab].getValue() !== v) this.models[tab].setValue(v);
    } else if (this.textarea && tab === this.tab) {
      this.textarea.value = v; this.renderGutter(); this.autosize();
    }
  }

  showTab(tab) {
    if (tab === this.tab) return;
    if (this.editor) this.viewStates[this.tab] = this.editor.saveViewState();
    this.tab = tab;
    if (this.editor) {
      this.editor.setModel(this.models[tab]);
      if (this.viewStates[tab]) this.editor.restoreViewState(this.viewStates[tab]);
      this.editor.focus();
    } else if (this.textarea) {
      this.textarea.value = this.values[tab];
      this.renderGutter();
      this.autosize();
    }
    this.banner.hidden = tab !== 'solution' || this.bannerWanted !== true;
  }

  setLanguage(lang) {
    this.language = lang;
    if (!this.monaco) return;
    for (const tab of TABS) this.monaco.editor.setModelLanguage(this.models[tab], MONACO_LANG[lang]);
  }

  setStale(stale) {
    this.bannerWanted = stale;
    this.banner.hidden = !stale || this.tab !== 'solution';
  }

  // ------------------------------------------------------------------------------------------ decorations

  /** @param {{line?: number, prevLine?: number, errorLine?: number, reveal?: boolean}} st  (solution tab) */
  highlight(st) {
    this.highlightState = st;
    if (this.textarea) { this.renderGutter(); return; }
    if (!this.editor) return;
    const monaco = this.monaco;
    const model = this.models.solution;
    const decos = [];
    const lineCount = model.getLineCount();
    const valid = (l) => l && l >= 1 && l <= lineCount;
    if (valid(st.prevLine) && st.prevLine !== st.line) {
      decos.push({ range: new monaco.Range(st.prevLine, 1, st.prevLine, 1), options: { isWholeLine: true, className: 'lcv-line-prev', glyphMarginClassName: 'lcv-glyph-prev' } });
    }
    if (valid(st.errorLine)) {
      decos.push({ range: new monaco.Range(st.errorLine, 1, st.errorLine, 1), options: { isWholeLine: true, className: 'lcv-line-error', glyphMarginClassName: 'lcv-glyph-error' } });
    } else if (valid(st.line)) {
      decos.push({ range: new monaco.Range(st.line, 1, st.line, 1), options: { isWholeLine: true, className: 'lcv-line-next', glyphMarginClassName: 'lcv-glyph-next' } });
    }
    this.decoIds = model.deltaDecorations(this.decoIds, decos);
    const focusLine = st.errorLine || st.line;
    if (this.tab === 'solution' && st.reveal !== false && valid(focusLine)) this.editor.revealLineInCenterIfOutsideViewport(focusLine);
  }

  clearHighlight() {
    this.highlight({});
  }

  /** Compile diagnostics as squiggles, on the solution or the definitions document. */
  setMarkers(diagnostics, tab = 'solution') {
    if (!this.editor) return;
    const model = this.models[tab];
    const markers = (diagnostics || []).filter((d) => d.line > 0).map((d) => ({
      severity: this.monaco.MarkerSeverity.Error,
      message: d.message,
      startLineNumber: Math.min(d.line, model.getLineCount()),
      startColumn: Math.max(1, d.column || 1),
      endLineNumber: Math.min(d.line, model.getLineCount()),
      endColumn: model.getLineMaxColumn(Math.min(d.line, model.getLineCount())),
    }));
    this.monaco.editor.setModelMarkers(model, 'lcv', markers);
  }

  clearMarkers() {
    this.setMarkers([], 'solution');
    this.setMarkers([], 'defs');
  }
}
