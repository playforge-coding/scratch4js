import { useEffect, useState } from 'react';
import { Boxes, Package, Plus, Trash2 } from 'lucide-react';
import { Button } from 'web-editor';

import { deleteProject, listProjects, newId, saveProject } from '../db.js';
import { navigate } from '../router.js';
import { BUNDLERS, PACKAGE_MANAGERS, createProjectFiles } from '../template.js';

function ScratchMark() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-accent">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M4 5.5A1.5 1.5 0 0 1 5.5 4h6a4 4 0 0 1 0 8H8v6.5a1.5 1.5 0 0 1-3 0V5.5Zm4 3.5h3.5a1 1 0 0 0 0-2H8v2Zm9-5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z"
        />
      </svg>
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-fg-muted">
      <span className="font-medium tracking-wide uppercase">{label}</span>
      {children}
    </label>
  );
}

const selectClass =
  'h-9 rounded-md border border-border bg-surface-0 px-2 text-sm text-fg outline-none focus:border-accent';

export function Dashboard() {
  const [projects, setProjects] = useState(null);
  const [name, setName] = useState('My Extension');
  const [bundler, setBundler] = useState('rsbuild');
  const [pm, setPm] = useState('npm');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listProjects().then(setProjects);
  }, []);

  const create = async (e) => {
    e.preventDefault();
    const trimmed = name.trim() || 'My Extension';
    setCreating(true);
    const { files, id: extensionId } = createProjectFiles({
      name: trimmed,
      bundler,
      packageManager: pm,
    });
    const now = Date.now();
    const record = {
      id: newId(),
      extensionId,
      name: trimmed,
      bundler,
      packageManager: pm,
      files,
      createdAt: now,
      updatedAt: now,
    };
    await saveProject(record);
    navigate(`/edit/${record.id}`, { reload: true });
  };

  const remove = async (id) => {
    await deleteProject(id);
    setProjects((p) => p.filter((x) => x.id !== id));
  };

  return (
    <div className="h-full overflow-auto bg-surface-0 text-fg">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="flex items-center gap-3">
          <ScratchMark />
          <div>
            <h1 className="text-lg font-semibold">TurboWarp Extension Maker</h1>
            <p className="text-sm text-fg-subtle">
              Build TurboWarp/Scratch extensions in your browser.
            </p>
          </div>
        </header>

        <section className="mt-8 rounded-[var(--radius-panel)] border border-border bg-surface-1 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Plus size={16} className="text-accent" />
            New extension
          </h2>
          <form
            onSubmit={create}
            className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_auto_auto]"
          >
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                spellCheck={false}
                className={`${selectClass} min-w-48`}
                placeholder="My Extension"
              />
            </Field>
            <Field label="Bundler">
              <select
                value={bundler}
                onChange={(e) => setBundler(e.target.value)}
                className={selectClass}
              >
                {BUNDLERS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Package manager">
              <select
                value={pm}
                onChange={(e) => setPm(e.target.value)}
                className={selectClass}
              >
                {PACKAGE_MANAGERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" variant="primary" disabled={creating}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
          <p className="mt-3 text-xs text-fg-subtle">
            {BUNDLERS.find((b) => b.id === bundler)?.hint}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
            Your extensions
          </h2>
          {projects === null ? (
            <p className="mt-4 text-sm text-fg-subtle">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="mt-4 text-sm text-fg-subtle">
              No extensions yet — create one above.
            </p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="group flex items-center gap-3 rounded-[var(--radius-panel)] border border-border bg-surface-1 p-4 transition-colors hover:border-border-strong"
                >
                  <button
                    onClick={() => navigate(`/edit/${p.id}`, { reload: true })}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface-3 text-accent">
                      <Boxes size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {p.name}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle">
                        <Package size={12} />
                        {p.bundler} · {p.packageManager}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    title={`Delete ${p.name}`}
                    className="rounded-md p-2 text-fg-subtle opacity-0 transition hover:bg-surface-3 hover:text-err group-hover:opacity-100"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
