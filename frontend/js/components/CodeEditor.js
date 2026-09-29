// Code editor: Monaco from the CDN, with a plain textarea fallback so the app still works offline.
// Highlights the line about to run (▶), the line that just ran (●), and the failing line (✕).

import { h, mount } from '../util/dom.js';

const MONACO_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs';
const MONACO_LANG = { java: 'java', javascript: 'javascript' };

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
  constructor(host, { value = '', language = 'java', onChange = () => {} } = {}) {
    this.host = host;
    this.value = value;
    this.language = language;
    this.onChange = onChange;
    this.monaco = null;
    this.editor = null;
    this.decorations = null;
    this.banner = h('div', { class: 'lcv-stale-banner', hidden: true }, 'code changed — run again');
    this.highlightState = null;
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
    this.editor = monaco.editor.create(this.host, {
      value: this.value,
      language: MONACO_LANG[this.language],
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
    });
    this.decorations = this.editor.createDecorationsCollection([]);
    this.editor.onDidChangeModelContent(() => {
      this.value = this.editor.getValue();
      this.onChange(this.value);
    });
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

  initFallback() {
    this.textarea = h('textarea', { class: 'fallback-text', spellcheck: 'false', wrap: 'off' });
    this.textarea.value = this.value;
    this.gutter = h('div', { class: 'fallback-gutter' });
    this.textarea.addEventListener('input', () => {
      this.value = this.textarea.value;
      this.renderGutter();
      this.autosize();
      this.onChange(this.value);
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
    const n = this.value.split('\n').length;
    const st = this.highlightState || {};
    mount(this.gutter, Array.from({ length: n }, (_, i) => h('div', { class: [i + 1 === st.line && 'next', i + 1 === st.prevLine && 'prev'] }, i + 1)));
  }

  getValue() {
    return this.editor ? this.editor.getValue() : this.value;
  }

  setValue(v) {
    this.value = v;
    if (this.editor) this.editor.setValue(v);
    else if (this.textarea) { this.textarea.value = v; this.renderGutter(); this.autosize(); }
  }

  setLanguage(lang) {
    this.language = lang;
    if (this.editor) this.monaco.editor.setModelLanguage(this.editor.getModel(), MONACO_LANG[lang]);
  }

  setStale(stale) {
    this.banner.hidden = !stale;
  }

  /** @param {{line?: number, prevLine?: number, errorLine?: number, reveal?: boolean}} st */
  highlight(st) {
    this.highlightState = st;
    if (this.textarea) { this.renderGutter(); return; }
    if (!this.editor) return;
    const monaco = this.monaco;
    const decos = [];
    const lineCount = this.editor.getModel().getLineCount();
    const valid = (l) => l && l >= 1 && l <= lineCount;
    if (valid(st.prevLine) && st.prevLine !== st.line) {
      decos.push({ range: new monaco.Range(st.prevLine, 1, st.prevLine, 1), options: { isWholeLine: true, className: 'lcv-line-prev', glyphMarginClassName: 'lcv-glyph-prev' } });
    }
    if (valid(st.errorLine)) {
      decos.push({ range: new monaco.Range(st.errorLine, 1, st.errorLine, 1), options: { isWholeLine: true, className: 'lcv-line-error', glyphMarginClassName: 'lcv-glyph-error' } });
    } else if (valid(st.line)) {
      decos.push({ range: new monaco.Range(st.line, 1, st.line, 1), options: { isWholeLine: true, className: 'lcv-line-next', glyphMarginClassName: 'lcv-glyph-next' } });
    }
    this.decorations.set(decos);
    const focusLine = st.errorLine || st.line;
    if (st.reveal !== false && valid(focusLine)) this.editor.revealLineInCenterIfOutsideViewport(focusLine);
  }

  clearHighlight() {
    this.highlight({});
  }

  /** Compile diagnostics as squiggles. */
  setMarkers(diagnostics) {
    if (!this.editor) return;
    const model = this.editor.getModel();
    const markers = (diagnostics || []).filter((d) => d.line > 0).map((d) => ({
      severity: this.monaco.MarkerSeverity.Error,
      message: d.message,
      startLineNumber: d.line,
      startColumn: Math.max(1, d.column || 1),
      endLineNumber: d.line,
      endColumn: model.getLineMaxColumn(Math.min(d.line, model.getLineCount())),
    }));
    this.monaco.editor.setModelMarkers(model, 'lcv', markers);
  }
}
