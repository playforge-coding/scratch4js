import { useEffect, useState } from 'react';
import {
  CloudDownload,
  Code2,
  FileCode,
  FolderGit2,
  Plus,
  Terminal,
  Trash2,
} from 'lucide-react';
import { Button } from 'browser-ide-kit';

import {
  deleteProject,
  listProjects,
  newId,
  repoDirFor,
  saveProject,
} from '../db.js';
import { deleteGitDatabase, GitEngine } from '../gitEngine.js';
import { navigate } from '../router.js';
import { TEMPLATES, getTemplate } from '../templates.js';

const TEMPLATE_ICON = {
  vanilla: Code2,
  static: FileCode,
  node: Terminal,
};

const inputClass =
  'h-9 w-full rounded-md border border-border bg-surface-0 px-3 text-sm text-fg outline-none focus:border-accent';

function Logo() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-accent">
      <Code2 size={20} />
    </span>
  );
}

function deriveName(url) {
  const clean = url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
  const last = clean.slice(clean.lastIndexOf('/') + 1);
  return last || 'cloned-repo';
}

function guessEntry(files) {
  const keys = Object.keys(files);
  return (
    keys.find((k) => /^readme\.md$/i.test(k)) ??
    keys.find((k) => k === 'index.html' || k === 'src/index.html') ??
    keys.find((k) => k === 'package.json') ??
    keys[0] ??
    null
  );
}

export function Dashboard() {
  const [projects, setProjects] = useState(null);

  useEffect(() => {
    listProjects().then(setProjects);
  }, []);

  const open = (id) => navigate(`/edit/${id}`, { reload: true });

  const remove = async (id) => {
    await deleteProject(id);
    deleteGitDatabase(repoDirFor(id));
    setProjects((p) => p.filter((x) => x.id !== id));
  };

  return (
    <div className="h-full overflow-auto bg-surface-0 text-fg">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-lg font-semibold">dev-local</h1>
            <p className="text-sm text-fg-subtle">
              A general-purpose in-browser code editor — edit, run, build, and
              version, all client-side.
            </p>
          </div>
        </header>

        <NewProject onCreated={open} />
        <CloneRepo onCloned={open} />

        <section className="mt-8">
          <h2 className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
            Your projects
          </h2>
          {projects === null ? (
            <p className="mt-4 text-sm text-fg-subtle">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="mt-4 text-sm text-fg-subtle">
              No projects yet — create one from a template or clone a repo
              above.
            </p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onOpen={() => open(p.id)}
                  onRemove={() => remove(p.id)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function NewProject({ onCreated }) {
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [name, setName] = useState('My Project');
  const [creating, setCreating] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    const tpl = getTemplate(templateId);
    const { files, entryFile, build } = tpl.scaffold();
    const now = Date.now();
    const record = {
      id: newId(),
      name: name.trim() || 'My Project',
      source: 'template',
      templateId: tpl.id,
      files,
      entryFile,
      build,
      createdAt: now,
      updatedAt: now,
    };
    await saveProject(record);
    onCreated(record.id);
  };

  return (
    <section className="mt-8 rounded-[var(--radius-panel)] border border-border bg-surface-1 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Plus size={16} className="text-accent" />
        New project
      </h2>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TEMPLATES.map((t) => {
          const Icon = TEMPLATE_ICON[t.id] ?? Code2;
          const active = t.id === templateId;
          return (
            <button
              key={t.id}
              onClick={() => setTemplateId(t.id)}
              className={`flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors ${
                active
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-surface-0 hover:border-border-strong'
              }`}
            >
              <Icon
                size={18}
                className={active ? 'text-accent' : 'text-fg-subtle'}
              />
              <span className="text-sm font-medium">{t.label}</span>
              <span className="text-xs text-fg-subtle">{t.description}</span>
            </button>
          );
        })}
      </div>

      <form onSubmit={create} className="mt-4 flex items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-xs text-fg-muted">
          <span className="font-medium tracking-wide uppercase">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            spellCheck={false}
            className={inputClass}
            placeholder="My Project"
          />
        </label>
        <Button type="submit" variant="primary" disabled={creating}>
          {creating ? 'Creating…' : 'Create'}
        </Button>
      </form>
    </section>
  );
}

function CloneRepo({ onCloned }) {
  const [url, setUrl] = useState('');
  const [proxy, setProxy] = useState('https://cors.isomorphic-git.org');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const clone = async (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const id = newId();
    try {
      const git = new GitEngine({
        repoDir: repoDirFor(id),
        corsProxy: proxy,
      });
      git.setAuth({ token });
      const files = await git.clone(trimmed);
      const now = Date.now();
      await saveProject({
        id,
        name: deriveName(trimmed),
        source: 'clone',
        cloneUrl: trimmed,
        files,
        entryFile: guessEntry(files),
        build: null, // unknown for an arbitrary repo; configure in the terminal
        createdAt: now,
        updatedAt: now,
      });
      onCloned(id);
    } catch (err) {
      deleteGitDatabase(repoDirFor(id));
      setError(err?.message || String(err));
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 rounded-[var(--radius-panel)] border border-border bg-surface-1 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <FolderGit2 size={16} className="text-accent" />
        Clone a git repository
      </h2>

      <form onSubmit={clone} className="mt-4 flex flex-col gap-3">
        <div className="flex items-end gap-3">
          <label className="flex flex-1 flex-col gap-1 text-xs text-fg-muted">
            <span className="font-medium tracking-wide uppercase">
              Repository URL
            </span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              spellCheck={false}
              className={inputClass}
              placeholder="https://github.com/owner/repo.git"
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || !url.trim()}
          >
            <CloudDownload size={14} /> {busy ? 'Cloning…' : 'Clone'}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            <span className="font-medium tracking-wide uppercase">
              CORS proxy
            </span>
            <input
              value={proxy}
              onChange={(e) => setProxy(e.target.value)}
              spellCheck={false}
              className={inputClass}
              placeholder="(none)"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            <span className="font-medium tracking-wide uppercase">
              Token (private repos)
            </span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              spellCheck={false}
              className={inputClass}
              placeholder="(optional)"
            />
          </label>
        </div>
      </form>
      {error && (
        <p className="mt-3 rounded bg-err/10 px-2 py-1 text-xs break-words text-err">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-fg-subtle">
        Most hosts need a CORS proxy in the browser. The default is a shared
        test proxy — run your own for real use.
      </p>
    </section>
  );
}

function ProjectCard({ project, onOpen, onRemove }) {
  const cloned = project.source === 'clone';
  const Icon = cloned
    ? FolderGit2
    : (TEMPLATE_ICON[project.templateId] ?? Code2);
  const sub = cloned
    ? project.cloneUrl
    : (getTemplate(project.templateId).label ?? 'Project');
  return (
    <li className="group flex items-center gap-3 rounded-[var(--radius-panel)] border border-border bg-surface-1 p-4 transition-colors hover:border-border-strong">
      <button
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface-3 text-accent">
          <Icon size={18} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{project.name}</span>
          <span className="mt-0.5 block truncate text-xs text-fg-subtle">
            {sub}
          </span>
        </span>
      </button>
      <button
        onClick={onRemove}
        title={`Delete ${project.name}`}
        className="rounded-md p-2 text-fg-subtle opacity-0 transition hover:bg-surface-3 hover:text-err group-hover:opacity-100"
      >
        <Trash2 size={15} />
      </button>
    </li>
  );
}
