import { X } from 'lucide-react';

import { useEditorApi, useEditorState } from './editorContext.jsx';
import { fileIcon } from './icons.js';

/**
 * Horizontal strip of open-file tabs for the code editor. Clicking a tab
 * activates that file; the × closes it. Sits above <CodeEditor /> and reflects
 * the editor store's `openFiles` / `activeFile`.
 */
export function EditorTabs() {
  const { actions } = useEditorApi();
  const { openFiles, activeFile } = useEditorState();

  if (!openFiles?.length) return null;

  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-surface-2">
      {openFiles.map((path) => {
        const name = path.split('/').at(-1);
        const isActive = path === activeFile;
        return (
          <div
            key={path}
            className={`group/tab flex shrink-0 items-center border-r border-border ${
              isActive
                ? 'bg-surface-1 text-fg'
                : 'text-fg-muted hover:bg-surface-3'
            }`}
          >
            <button
              onClick={() => actions.setActive(path)}
              title={path}
              className="flex min-w-0 items-center gap-1.5 py-1 pr-1.5 pl-3 text-xs"
            >
              <img
                src={fileIcon(path)}
                alt=""
                className="h-3.5 w-3.5 shrink-0"
              />
              <span className="max-w-[12rem] truncate">{name}</span>
            </button>
            <button
              onClick={() => actions.closeFile(path)}
              aria-label={`Close ${name}`}
              className={`mr-1.5 shrink-0 rounded p-0.5 text-fg-subtle hover:bg-surface-3 hover:text-fg ${
                isActive ? '' : 'opacity-0 group-hover/tab:opacity-100'
              }`}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
