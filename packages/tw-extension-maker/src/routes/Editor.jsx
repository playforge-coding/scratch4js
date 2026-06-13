import { useEffect, useMemo, useRef } from 'react';
import { Blocks, Eraser, MonitorPlay, TerminalSquare } from 'lucide-react';
import {
  CodeEditor,
  EditorProvider,
  EditorTabs,
  FileTree,
  IconButton,
  Panel,
  SplitPane,
  TerminalPanel,
  Tooltip,
  TooltipProvider,
} from 'web-editor';

import { saveProject } from '../db.js';
import { createMakerEditor } from '../makerEditor.js';
import { TopBar } from '../components/TopBar.jsx';
import { BlocksEditor } from '../scratch/BlocksEditor.jsx';
import { Stage } from '../scratch/Stage.jsx';

function Workspace() {
  const terminalApi = useRef(null);

  return (
    <div className="flex h-full flex-col bg-surface-0">
      <TopBar />
      <div className="min-h-0 flex-1 p-2">
        <SplitPane
          direction="horizontal"
          storageKey="twmaker:cols3"
          defaultSizes={[16, 42, 42]}
          minSize={[150, 320, 320]}
          className="gap-0"
        >
          <Panel className="rounded-l-[var(--radius-panel)]" flush>
            <FileTree />
          </Panel>

          <SplitPane
            direction="vertical"
            storageKey="twmaker:editor-rows"
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

          <SplitPane
            direction="vertical"
            storageKey="twmaker:scratch-rows"
            defaultSizes={[58, 42]}
            minSize={[140, 140]}
          >
            <Panel
              className="rounded-tr-[var(--radius-panel)]"
              icon={<Blocks size={14} />}
              title="Blocks"
              flush
            >
              <BlocksEditor />
            </Panel>
            <Panel
              className="rounded-br-[var(--radius-panel)]"
              icon={<MonitorPlay size={14} />}
              title="Stage"
              flush
            >
              <Stage />
            </Panel>
          </SplitPane>
        </SplitPane>
      </div>
    </div>
  );
}

/**
 * The editor for one stored project. Creates a web-editor instance from the
 * record, boots its WebContainer, and persists file edits back to IndexedDB.
 *
 * @param {{ record: import('../db.js').ProjectRecord & { extensionId: string } }} props
 */
export function Editor({ record }) {
  const editor = useMemo(() => createMakerEditor(record), [record.id]);

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
        <Workspace />
      </TooltipProvider>
    </EditorProvider>
  );
}
