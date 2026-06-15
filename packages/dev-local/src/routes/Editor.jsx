import { useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Eraser,
  FolderGit2,
  MonitorPlay,
  TerminalSquare,
} from 'lucide-react';
import {
  CodeEditor,
  EditorProvider,
  EditorTabs,
  FileTree,
  IconButton,
  Panel,
  SplitPane,
  StatusBadge,
  TerminalPanel,
  Tooltip,
  TooltipProvider,
  useEditorState,
} from 'browser-ide-kit';

import { repoDirFor, saveProject } from '../db.js';
import { createProjectEditor } from '../editor.js';
import { GitEngine } from '../gitEngine.js';
import { GitPanel } from '../GitPanel.jsx';
import { Preview } from '../Preview.jsx';
import { navigate } from '../router.js';

function TopBar({ name }) {
  const { status } = useEditorState();
  return (
    <div className="flex items-center justify-between border-b border-border bg-surface-1 px-3 py-2">
      <div className="flex items-center gap-2">
        <Tooltip label="Back to dashboard">
          <IconButton
            aria-label="Back to dashboard"
            onClick={() => navigate('/dashboard', { reload: true })}
          >
            <ArrowLeft size={16} />
          </IconButton>
        </Tooltip>
        <span className="text-sm font-semibold text-fg">dev-local</span>
        <span className="truncate text-xs text-fg-subtle">{name}</span>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

function Workspace({ git, name }) {
  const terminalApi = useRef(null);

  return (
    <div className="flex h-full flex-col bg-surface-0">
      <TopBar name={name} />
      <div className="min-h-0 flex-1 p-2">
        <SplitPane
          direction="horizontal"
          storageKey="devlocal:cols3"
          defaultSizes={[16, 42, 42]}
          minSize={[150, 320, 320]}
          className="gap-0"
        >
          <SplitPane
            direction="vertical"
            storageKey="devlocal:left-rows"
            defaultSizes={[58, 42]}
            minSize={[120, 120]}
          >
            <Panel className="rounded-tl-[var(--radius-panel)]" flush>
              <FileTree />
            </Panel>
            <Panel
              className="rounded-bl-[var(--radius-panel)]"
              icon={<FolderGit2 size={14} />}
              title="Source Control"
              flush
            >
              <GitPanel git={git} />
            </Panel>
          </SplitPane>

          <SplitPane
            direction="vertical"
            storageKey="devlocal:editor-rows"
            defaultSizes={[68, 32]}
            minSize={[120, 90]}
          >
            <Panel flush>
              <div className="flex h-full flex-col">
                <EditorTabs />
                <div className="min-h-0 flex-1">
                  <CodeEditor />
                </div>
              </div>
            </Panel>
            <Panel
              icon={<TerminalSquare size={14} />}
              title="Terminal"
              actions={
                <Tooltip label="Clear terminal">
                  <IconButton
                    aria-label="Clear terminal"
                    onClick={() => terminalApi.current?.clear()}
                  >
                    <Eraser size={14} />
                  </IconButton>
                </Tooltip>
              }
              flush
            >
              <TerminalPanel apiRef={terminalApi} />
            </Panel>
          </SplitPane>

          <Panel
            className="rounded-r-[var(--radius-panel)]"
            icon={<MonitorPlay size={14} />}
            title="Preview"
            flush
          >
            <Preview />
          </Panel>
        </SplitPane>
      </div>
    </div>
  );
}

/**
 * The editor for one stored project. Boots a WebContainer from the record,
 * wires a per-project git engine, and persists file edits back to IndexedDB.
 *
 * @param {{ record: import('../db.js').ProjectRecord }} props
 */
export function Editor({ record }) {
  const editor = useMemo(() => createProjectEditor(record), [record.id]);
  const git = useMemo(
    () => new GitEngine({ repoDir: repoDirFor(record.id) }),
    [record.id],
  );

  useEffect(() => {
    editor.actions.init();

    // Debounced persistence: any store change flushes the latest files to IDB.
    let timer;
    const unsub = editor.store.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const { files } = editor.store.get();
        saveProject({ ...record, files, updatedAt: Date.now() });
      }, 800);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [editor, record]);

  return (
    <EditorProvider editor={editor}>
      <TooltipProvider>
        <Workspace git={git} name={record.name} />
      </TooltipProvider>
    </EditorProvider>
  );
}
