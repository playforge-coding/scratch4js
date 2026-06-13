import Editor from '@monaco-editor/react';

import { useEditorApi, useEditorState } from '../editorContext.jsx';
import { applyExtraLibs } from './monaco-env.js';

/** Map a filename to a Monaco language id. */
function languageFor(path) {
  if (!path) return 'plaintext';
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'ts':
    case 'mts':
    case 'cts':
      return 'typescript';
    case 'json':
      return 'json';
    case 'svg':
    case 'xml':
      return 'xml';
    case 'css':
      return 'css';
    case 'html':
      return 'html';
    case 'md':
      return 'markdown';
    default:
      return 'plaintext';
  }
}

export function CodeEditor() {
  const { actions, config } = useEditorApi();
  const { activeFile, files } = useEditorState();

  // Register any host-global ambient libs (e.g. `Scratch`) once Monaco is up.
  applyExtraLibs(config.monaco?.extraLibs);

  if (!activeFile) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-fg-subtle">
        Select a file to start editing.
      </div>
    );
  }

  return (
    <Editor
      key={activeFile}
      className="h-full"
      theme="web-editor"
      language={languageFor(activeFile)}
      path={activeFile}
      value={files[activeFile] ?? ''}
      onChange={(value) => actions.updateFile(activeFile, value ?? '')}
      loading={
        <div className="flex h-full items-center justify-center text-sm text-fg-subtle">
          Loading editor…
        </div>
      }
      options={{
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        lineHeight: 20,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        tabSize: 2,
        renderLineHighlight: 'all',
        padding: { top: 12, bottom: 12 },
        fixedOverflowWidgets: true,
        automaticLayout: true,
        guides: { indentation: true },
      }}
    />
  );
}
