import { useMemo, useState } from 'react';
import { Dialog } from 'radix-ui';
import { ChevronDown, ChevronRight, FilePlus, Trash2 } from 'lucide-react';

import { useEditorApi, useEditorState } from './editorContext.jsx';
import { fileIcon, folderIcon } from './icons.js';
import { Button, IconButton, Tooltip } from './ui.jsx';

/** Build a nested { dirs, files } tree from a flat list of paths. */
function buildTree(paths) {
  const root = { dirs: {}, files: [] };
  for (const p of paths) {
    const parts = p.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      node.dirs[parts[i]] ??= { dirs: {}, files: [] };
      node = node.dirs[parts[i]];
    }
    node.files.push({ name: parts.at(-1), path: p });
  }
  return root;
}

function TreeNode({
  node,
  prefix,
  depth,
  expanded,
  toggle,
  activeFile,
  actions,
}) {
  const dirNames = Object.keys(node.dirs).sort();
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ul className="select-none">
      {dirNames.map((name) => {
        const path = prefix ? `${prefix}/${name}` : name;
        const open = expanded.has(path);
        return (
          <li key={path}>
            <button
              onClick={() => toggle(path)}
              className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-sm text-fg-muted hover:bg-surface-3"
              style={{ paddingLeft: depth * 12 + 4 }}
            >
              {open ? (
                <ChevronDown size={14} className="shrink-0" />
              ) : (
                <ChevronRight size={14} className="shrink-0" />
              )}
              <img src={folderIcon()} alt="" className="h-4 w-4 shrink-0" />
              <span className="truncate">{name}</span>
            </button>
            {open && (
              <TreeNode
                node={node.dirs[name]}
                prefix={path}
                depth={depth + 1}
                expanded={expanded}
                toggle={toggle}
                activeFile={activeFile}
                actions={actions}
              />
            )}
          </li>
        );
      })}
      {files.map((f) => (
        <li key={f.path} className="group/file flex items-center">
          <button
            onClick={() => actions.setActive(f.path)}
            className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left text-sm ${
              activeFile === f.path
                ? 'bg-surface-3 text-fg'
                : 'text-fg-muted hover:bg-surface-3'
            }`}
            style={{ paddingLeft: depth * 12 + 20 }}
          >
            <img src={fileIcon(f.path)} alt="" className="h-4 w-4 shrink-0" />
            <span className="truncate">{f.name}</span>
          </button>
          <button
            onClick={() => actions.deleteFile(f.path)}
            title={`Delete ${f.path}`}
            className="mr-1 hidden shrink-0 rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-err group-hover/file:block"
          >
            <Trash2 size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function FileTree() {
  const { actions } = useEditorApi();
  const { files, activeFile } = useEditorState();
  const paths = Object.keys(files);
  const tree = useMemo(() => buildTree(paths), [paths.join('|')]);
  const [expanded, setExpanded] = useState(
    () => new Set(['src', 'src/blocks']),
  );

  const toggle = (path) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-2 pt-2 pb-1">
        <span className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
          Files
        </span>
        <NewFileDialog existing={files} actions={actions}>
          <span>
            <Tooltip label="New file">
              <IconButton aria-label="New file">
                <FilePlus size={15} />
              </IconButton>
            </Tooltip>
          </span>
        </NewFileDialog>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
        <TreeNode
          node={tree}
          prefix=""
          depth={0}
          expanded={expanded}
          toggle={toggle}
          activeFile={activeFile}
          actions={actions}
        />
      </div>
    </div>
  );
}

function NewFileDialog({ existing, actions, children }) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState('src/');
  const trimmed = path.trim().replace(/^\/+/, '');
  const invalid =
    !trimmed || trimmed.endsWith('/') || existing[trimmed] != null;

  const submit = (e) => {
    e.preventDefault();
    if (invalid) return;
    actions.addFile(trimmed, '');
    setOpen(false);
    setPath('src/');
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-strong bg-surface-1 p-4 shadow-2xl">
          <Dialog.Title className="text-sm font-semibold text-fg">
            New file
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-fg-muted">
            Path relative to the project root. Folders are created
            automatically.
          </Dialog.Description>
          <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
            <input
              autoFocus
              value={path}
              onChange={(e) => setPath(e.target.value)}
              spellCheck={false}
              placeholder="src/blocks/my-block.js"
              className="h-9 rounded-md border border-border bg-surface-0 px-3 font-mono text-sm text-fg outline-none focus:border-accent"
            />
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" variant="primary" disabled={invalid}>
                Create
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
