# dev-local

A **general-purpose, in-browser code editor**. It runs a real Node environment
(a [WebContainer](https://webcontainers.io)) entirely client-side, so you can
edit a multi-file project, run `npm` and a real shell, build it, and live-preview
the result — no server, nothing installed on your machine. Built on the
[`web-editor`](../web-editor) toolkit.

It's deployed alongside the docs at
**<https://playforge-coding.github.io/scratch4js/dev-local/>** — open it and start
editing.

## What's in it

A **dashboard** (`#/dashboard`) lists your projects and lets you start one two
ways:

- **From a template** — a few zero-dependency starters so the first WebContainer
  boot is instant (see [`src/templates.js`](./src/templates.js)):
  - **Vanilla web app** — JS + CSS bundled into a live HTML preview.
  - **Static HTML** — one self-contained page, served as-is.
  - **Node script** — a Node program; the preview shows its output.
- **By cloning a git repo** — clone any repo (through a CORS proxy, with an
  optional token for private ones); its files load straight into a new project.

Projects are saved in **IndexedDB** and survive reloads. Opening one
(`#/edit/<id>`) loads the **editor** — a resizable 3-pane layout:

- a **Monaco** editor with tabs,
- an **xterm** terminal bound to a real **WebContainer** shell (`ls`, `cat`,
  `node`, `npm`, …),
- a **Seti-iconed** file tree,
- a live **preview** pane with auto-build on save,
- a **Source Control** panel — in-browser **git** powered by
  [wasm-git](https://github.com/petersalomonsen/wasm-git) (libgit2 → WebAssembly),
  with **IndexedDB persistence** and **remote** clone / pull / push.

Each project boots its own WebContainer (one per page — opening a project reloads
on purpose) and gets its own git repository, isolated in a per-project IndexedDB
database. The editor wiring is in [`src/editor.js`](./src/editor.js); routes live
in [`src/routes/`](./src/routes/).

## Git (Source Control)

The **Source Control** panel gives the project real version control without a
server, using [wasm-git](https://github.com/petersalomonsen/wasm-git) — libgit2
compiled to WebAssembly. Initialize a repository, then stage-and-commit, see the
short status of changed files, and browse history — all client-side.

How it's wired (see [`src/gitEngine.js`](./src/gitEngine.js)):

- wasm-git runs on its **own in-memory filesystem**, separate from the
  WebContainer. The editor's in-memory file store is the source of truth; before
  each git operation the engine mirrors the current files into a working tree at
  `/repo`, so `status` / `commit` / `log` reflect exactly what's in the editor.
- We load the **async** build (`lg2_async.js` + `.wasm`) on the main thread. It's
  copied verbatim to `vendor/wasm-git/` at build time (see `rsbuild.config.mjs`)
  and loaded with a native dynamic import so Emscripten resolves the `.wasm` next
  to its own script URL.
- The committer identity defaults to `dev-local <dev-local@users.noreply.github.com>`
  (written to a global `.gitconfig`); pass `new GitEngine({ author })` to change it.

### Persistence (IndexedDB)

The `/repo` working tree is mounted on **IDBFS**, so the repository (history and
all) is **synced to IndexedDB** after every mutating operation and restored on
boot — it survives reloads. When a saved repo is found at startup, the panel
offers to load its files back into the editor (the editor's own files aren't
otherwise persisted). It degrades to in-memory automatically if IndexedDB is
unavailable (e.g. private browsing). "Delete repo" clears it.

### Remotes (clone / pull / push)

The **Remote** tab does `clone`, `pull`, and `push` over HTTP:

- Browsers can't reach most git servers directly (no CORS), so requests are
  routed through a **CORS proxy** (default `https://cors.isomorphic-git.org`,
  configurable / clearable). This is done by wrapping wasm-git's own
  `emscriptenhttpconnect` transport — no other page requests are affected.
- An optional **personal access token** is injected as HTTP Basic auth (works
  with GitHub / GitLab / Gitea PATs); it's only ever sent to the proxy/remote.
- **clone** loads the cloned files straight into the editor; **pull**
  (`fetch` + `merge origin/<branch>`) loads the merged result; **push** sends
  your commits (it configures `origin` + a push refspec when needed).

> Note: the default public CORS proxy is rate-limited and meant for testing —
> point it at your own [cors-proxy](https://github.com/isomorphic-git/cors-proxy)
> for real use, or clear it for a CORS-enabled host.

## Run it locally

From the repo root (installs the whole workspace, including the `browser-ide-kit`
package this app depends on):

```bash
pnpm install
pnpm --filter browser-ide-kit build   # build the library this app imports
pnpm --filter dev-local dev
```

Then open the printed URL (default <http://localhost:3000>).

The dev server sets the `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`
headers that WebContainers (and Monaco's web workers) require, so the in-browser
container can boot.

## Build & deploy

```bash
pnpm --filter dev-local build     # outputs to dist/
pnpm --filter dev-local preview   # serve dist/ locally with the right headers
```

dev-local is published as part of the docs site. The root `docs:build` script
builds it with `PUBLIC_PATH=/scratch4js/dev-local/` and copies `dist/` into
`doc_build/dev-local/`, so GitHub Pages serves it at `/scratch4js/dev-local/`.

Because GitHub Pages can't set COOP/COEP response headers, `index.html` loads a
vendored [`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker)
shim (in `public/`) that injects them and reloads once, making the page
cross-origin isolated. It's a no-op in dev, where the rsbuild server already
sets the headers.
