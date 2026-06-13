import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

/*
  Monaco normally lazy-loads its editor + language workers from a CDN. Under
  cross-origin isolation (COEP) a CDN load is blocked, so we bundle Monaco and
  its workers locally and spawn them with the `new Worker(new URL(...))` pattern
  the bundler understands. Each worker becomes its own same-origin chunk.
*/
self.MonacoEnvironment = {
  getWorker(_id, label) {
    switch (label) {
      case 'json':
        return new Worker(
          new URL(
            'monaco-editor/esm/vs/language/json/json.worker.js',
            import.meta.url,
          ),
        );
      case 'css':
      case 'scss':
      case 'less':
        return new Worker(
          new URL(
            'monaco-editor/esm/vs/language/css/css.worker.js',
            import.meta.url,
          ),
        );
      case 'html':
      case 'handlebars':
      case 'razor':
        return new Worker(
          new URL(
            'monaco-editor/esm/vs/language/html/html.worker.js',
            import.meta.url,
          ),
        );
      case 'typescript':
      case 'javascript':
        return new Worker(
          new URL(
            'monaco-editor/esm/vs/language/typescript/ts.worker.js',
            import.meta.url,
          ),
        );
      default:
        return new Worker(
          new URL(
            'monaco-editor/esm/vs/editor/editor.worker.js',
            import.meta.url,
          ),
        );
    }
  },
};

// Use the bundled Monaco instead of the CDN loader.
loader.config({ monaco });

// A dark theme aligned with the app's palette (see styles.css tokens).
monaco.editor.defineTheme('web-editor', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6a7080', fontStyle: 'italic' },
    { token: 'keyword', foreground: '9d8bff' },
    { token: 'string', foreground: '7ed29b' },
    { token: 'number', foreground: 'd6a32a' },
  ],
  colors: {
    'editor.background': '#16181f',
    'editor.foreground': '#e6e8ef',
    'editorLineNumber.foreground': '#3a3f4d',
    'editorLineNumber.activeForeground': '#9aa1b2',
    'editor.selectionBackground': '#6b5cff44',
    'editor.lineHighlightBackground': '#1d2029',
    'editorIndentGuide.background1': '#23262f',
    'editorWidget.background': '#1d2029',
    'editorWidget.border': '#2c303b',
    'input.background': '#0e0f13',
    focusBorder: '#6b5cff',
  },
});

// Relax JS validation (this is a quick playground, not a type checker).
monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
  target: monaco.languages.typescript.ScriptTarget.ESNext,
  allowNonTsExtensions: true,
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  module: monaco.languages.typescript.ModuleKind.ESNext,
  allowJs: true,
  checkJs: false,
});
monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});

const registered = new Set();

/**
 * Register extra ambient TypeScript libs (e.g. host globals) with Monaco, once
 * each. Consumers pass these via the editor config.
 *
 * @param {{content: string, filePath?: string}[]} [extraLibs]
 */
export function applyExtraLibs(extraLibs) {
  if (!extraLibs) return;
  for (const lib of extraLibs) {
    const filePath = lib.filePath ?? `ts:lib-${registered.size}.d.ts`;
    if (registered.has(filePath)) continue;
    registered.add(filePath);
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      lib.content,
      filePath,
    );
  }
}

export { monaco };
