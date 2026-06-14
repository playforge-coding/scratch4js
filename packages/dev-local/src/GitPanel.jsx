import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Cloud,
  CloudDownload,
  CloudUpload,
  Database,
  DownloadCloud,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  History,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  Button,
  IconButton,
  Tooltip,
  useEditorApi,
  useEditorState,
} from 'web-editor';

// Short-status code → a small colored badge letter, à la VS Code's Source Control.
const BADGE = {
  Modified: { ch: 'M', cls: 'text-warn' },
  Added: { ch: 'A', cls: 'text-ok' },
  Untracked: { ch: 'U', cls: 'text-ok' },
  Deleted: { ch: 'D', cls: 'text-err' },
  Renamed: { ch: 'R', cls: 'text-accent' },
  Copied: { ch: 'C', cls: 'text-accent' },
};

/**
 * A "Source Control" panel backed by {@link GitEngine} (wasm-git). It mirrors
 * the editor's files into an in-browser git repo (persisted to IndexedDB) and
 * exposes init / stage+commit / status / log plus remote clone / pull / push.
 *
 * @param {{ git: import('./gitEngine.js').GitEngine }} props
 */
export function GitPanel({ git }) {
  const { actions, store } = useEditorApi();
  const { files, activeFile } = useEditorState();

  const [status, setStatus] = useState({
    initialized: false,
    branch: null,
    entries: [],
  });
  const [log, setLog] = useState([]);
  const [tab, setTab] = useState('changes'); // 'changes' | 'history' | 'remote'
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [persistent, setPersistent] = useState(false);
  const [restored, setRestored] = useState(false);

  // Always read the freshest files from the store at call time (the reactive
  // `files` is only used to *trigger* a refresh).
  const currentFiles = () => store.get().files;

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const s = await git.status(currentFiles());
      setStatus(s);
      if (s.initialized) setLog(await git.log());
    } catch (err) {
      setError(err?.message || String(err));
    }
  }, [git]);

  // On mount: restore a persisted repo (if any), then start refreshing.
  useEffect(() => {
    git
      .restore()
      .then((r) => {
        setPersistent(r.persistent);
        setRestored(r.initialized);
      })
      .catch(() => {});
  }, [git]);

  // Debounced refresh whenever the project files change.
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(refresh, 700);
    return () => clearTimeout(timer.current);
  }, [files, refresh]);

  const withBusy = async (fn, successNote) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
      await refresh();
      if (successNote) setNote(successNote);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const init = () => withBusy(() => git.init(currentFiles()));
  const commit = () =>
    withBusy(async () => {
      await git.commit(currentFiles(), message.trim());
      setMessage('');
    });
  const loadFromRepo = () =>
    withBusy(async () => {
      actions.loadFiles(await git.readFiles());
      setRestored(false);
    }, 'Loaded files from the repository.');
  const deleteRepo = () =>
    withBusy(async () => {
      await git.deleteRepo();
      setRestored(false);
      setLog([]);
    }, 'Repository deleted.');

  const canCommit =
    status.initialized && status.entries.length > 0 && message.trim() && !busy;

  return (
    <div className="flex h-full flex-col text-sm">
      <Header
        branch={status.branch}
        persistent={persistent}
        tab={tab}
        setTab={setTab}
        onRefresh={refresh}
        busy={busy}
      />

      {restored && tab !== 'remote' && (
        <Banner
          onLoad={loadFromRepo}
          busy={busy}
          onDismiss={() => setRestored(false)}
        />
      )}
      {error && <Message tone="err">{error}</Message>}
      {note && <Message tone="ok">{note}</Message>}

      {tab === 'remote' ? (
        <Remote git={git} actions={actions} withBusy={withBusy} busy={busy} />
      ) : !status.initialized ? (
        <Uninitialized onInit={init} busy={busy} />
      ) : tab === 'changes' ? (
        <Changes
          status={status}
          activeFile={activeFile}
          onOpen={actions.setActive}
          message={message}
          setMessage={setMessage}
          onCommit={commit}
          canCommit={canCommit}
        />
      ) : (
        <HistoryView
          log={log}
          onLoad={loadFromRepo}
          onDelete={deleteRepo}
          busy={busy}
        />
      )}
    </div>
  );
}

function Header({ branch, persistent, tab, setTab, onRefresh, busy }) {
  return (
    <div className="flex items-center gap-1 px-2 pt-2 pb-1">
      <span className="mr-auto inline-flex items-center gap-1 truncate text-xs text-fg-muted">
        <GitBranch size={13} className="shrink-0" />
        {branch ?? 'no branch'}
        {persistent && (
          <Tooltip label="Persisted to IndexedDB — survives reloads">
            <Database size={12} className="shrink-0 text-fg-subtle" />
          </Tooltip>
        )}
      </span>
      <TabButton
        active={tab === 'changes'}
        onClick={() => setTab('changes')}
        label="Changes"
      >
        <GitCommitHorizontal size={15} />
      </TabButton>
      <TabButton
        active={tab === 'history'}
        onClick={() => setTab('history')}
        label="History"
      >
        <History size={15} />
      </TabButton>
      <TabButton
        active={tab === 'remote'}
        onClick={() => setTab('remote')}
        label="Remote"
      >
        <Cloud size={15} />
      </TabButton>
      <Tooltip label="Refresh">
        <IconButton aria-label="Refresh" onClick={onRefresh} disabled={busy}>
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
        </IconButton>
      </Tooltip>
    </div>
  );
}

function TabButton({ active, onClick, label, children }) {
  return (
    <Tooltip label={label}>
      <IconButton
        aria-label={label}
        onClick={onClick}
        className={active ? 'bg-surface-3 text-fg' : ''}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}

function Message({ tone, children }) {
  const cls = tone === 'err' ? 'bg-err/10 text-err' : 'bg-ok/10 text-ok';
  return (
    <p className={`mx-2 mb-1 rounded px-2 py-1 text-xs break-words ${cls}`}>
      {children}
    </p>
  );
}

function Banner({ onLoad, onDismiss, busy }) {
  return (
    <div className="mx-2 mb-1 rounded border border-border bg-surface-0 px-2 py-1.5 text-xs">
      <p className="text-fg-muted">
        Restored a saved repository from a previous session.
      </p>
      <div className="mt-1.5 flex gap-2">
        <Button
          variant="primary"
          onClick={onLoad}
          disabled={busy}
          className="h-7"
        >
          <DownloadCloud size={13} /> Load its files
        </Button>
        <Button variant="ghost" onClick={onDismiss} className="h-7">
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function Uninitialized({ onInit, busy }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
      <FolderGit2 size={28} className="text-fg-subtle" />
      <p className="text-xs text-fg-muted">
        No repository here yet. Initialize one to start tracking changes, or
        clone a remote from the Remote tab.
      </p>
      <Button variant="primary" onClick={onInit} disabled={busy}>
        <FolderGit2 size={14} /> Initialize repository
      </Button>
    </div>
  );
}

function Changes({
  status,
  activeFile,
  onOpen,
  message,
  setMessage,
  onCommit,
  canCommit,
}) {
  return (
    <>
      <div className="px-2 pb-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Commit message"
          rows={2}
          spellCheck={false}
          className="w-full resize-none rounded-md border border-border bg-surface-0 px-2 py-1.5 text-xs text-fg outline-none focus:border-accent"
        />
        <Button
          variant="primary"
          onClick={onCommit}
          disabled={!canCommit}
          className="mt-1.5 w-full"
        >
          <Check size={14} /> Commit{' '}
          {status.entries.length > 0 ? `(${status.entries.length})` : ''}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
        {status.entries.length === 0 ? (
          <p className="px-2 py-1 text-xs text-fg-subtle">No changes.</p>
        ) : (
          <ul className="select-none">
            {status.entries.map((e) => {
              const badge = BADGE[e.label] ?? { ch: '•', cls: 'text-fg-muted' };
              return (
                <li key={e.path}>
                  <button
                    onClick={() => onOpen(e.path)}
                    title={`${e.label} — ${e.path}`}
                    className={`flex w-full items-center gap-2 rounded px-2 py-0.5 text-left ${
                      activeFile === e.path
                        ? 'bg-surface-3 text-fg'
                        : 'text-fg-muted hover:bg-surface-3'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {e.path}
                    </span>
                    <span
                      className={`shrink-0 font-mono text-xs font-semibold ${badge.cls}`}
                    >
                      {badge.ch}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function HistoryView({ log, onLoad, onDelete, busy }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {log.length === 0 ? (
          <p className="px-1 py-2 text-xs text-fg-subtle">
            No commits yet. Make your first commit from the Changes tab.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {log.map((c) => (
              <li
                key={c.hash}
                className="rounded-md border border-border bg-surface-0 px-2 py-1.5"
              >
                <div className="truncate text-xs text-fg">
                  {c.message.split('\n')[0] || '(no message)'}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-subtle">
                  <code className="font-mono">{c.hash.slice(0, 7)}</code>
                  {c.author && <span className="truncate">{c.author}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex gap-2 border-t border-border p-2">
        <Tooltip label="Replace editor files with the repository's">
          <Button
            variant="ghost"
            onClick={onLoad}
            disabled={busy}
            className="h-7"
          >
            <DownloadCloud size={13} /> Load files
          </Button>
        </Tooltip>
        <Tooltip label="Delete the repository (keeps your editor files)">
          <Button
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            className="ml-auto h-7 text-err hover:bg-err/10"
          >
            <Trash2 size={13} /> Delete repo
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

function Remote({ git, actions, withBusy, busy }) {
  const [url, setUrl] = useState('');
  const [proxy, setProxy] = useState(git.corsProxy);
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');

  // Apply connection settings to the engine before any remote call.
  const apply = () => {
    git.setCorsProxy(proxy);
    git.setAuth({ username, token });
  };

  const clone = () =>
    withBusy(async () => {
      apply();
      actions.loadFiles(await git.clone(url.trim()));
    }, 'Cloned into the editor.');
  const pull = () =>
    withBusy(async () => {
      apply();
      actions.loadFiles(await git.pull());
    }, 'Pulled latest changes.');
  const push = () =>
    withBusy(async () => {
      apply();
      await git.push(url.trim() || undefined);
    }, 'Pushed to remote.');

  return (
    <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
      <Field label="Repository URL">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
          placeholder="https://github.com/owner/repo.git"
          className={inputCls}
        />
      </Field>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button
          variant="surface"
          onClick={clone}
          disabled={busy || !url.trim()}
        >
          <CloudDownload size={14} /> Clone
        </Button>
        <Button variant="surface" onClick={pull} disabled={busy}>
          <CloudDownload size={14} /> Pull
        </Button>
      </div>
      <Button
        variant="primary"
        onClick={push}
        disabled={busy}
        className="mt-2 w-full"
      >
        <CloudUpload size={14} /> Push
      </Button>

      <p className="mt-3 mb-1 text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
        Connection
      </p>
      <Field label="CORS proxy" hint="Most git hosts need one in the browser.">
        <input
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
          spellCheck={false}
          placeholder="(none)"
          className={inputCls}
        />
      </Field>
      <Field label="Username" hint="Optional — defaults to the token.">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          spellCheck={false}
          placeholder="(optional)"
          className={inputCls}
        />
      </Field>
      <Field
        label="Token"
        hint="Personal access token; sent only to the proxy."
      >
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          spellCheck={false}
          placeholder="ghp_…"
          className={inputCls}
        />
      </Field>
    </div>
  );
}

const inputCls =
  'mt-1 h-8 w-full rounded-md border border-border bg-surface-0 px-2 font-mono text-xs text-fg outline-none focus:border-accent';

function Field({ label, hint, children }) {
  return (
    <label className="mt-2 block">
      <span className="text-xs text-fg-muted">{label}</span>
      {children}
      {hint && (
        <span className="mt-0.5 block text-[11px] text-fg-subtle">{hint}</span>
      )}
    </label>
  );
}
