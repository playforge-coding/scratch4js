---
title: dev-local — a general-purpose in-browser code editor
description: Edit a multi-file project in Monaco, run npm and a real shell in a WebContainer, build it, and live-preview the result — all client-side, nothing installed. The reference general-purpose app built on web-editor.
---

# dev-local

**dev-local** is a general-purpose, in-browser code editor. It runs a real Node
environment — a [WebContainer](https://webcontainers.io) — entirely in your
browser, so you can edit a multi-file project, run `npm` and a real shell, build
it, and live-preview the result. Nothing is installed on your machine and nothing
runs on a server.

It's the general-purpose companion to the
[TurboWarp Extension Maker](/web-editor/extension-maker): same
[`web-editor`](/web-editor/) foundation, but with no domain-specific tooling —
just a clean editor + terminal + preview.

<div style={{margin: '1.5rem 0'}}>
  <a
    href="/scratch4js/dev-local/"
    style={{
      display: 'inline-block', padding: '0.6rem 1.1rem', borderRadius: '8px',
      background: 'var(--rp-c-brand, #6b5cff)', color: '#fff', fontWeight: 600,
      textDecoration: 'none',
    }}
  >
    Open dev-local →
  </a>
</div>

It's hosted from this same site at
[`/scratch4js/dev-local/`](https://playforge-coding.github.io/scratch4js/dev-local/).

## What you get

- **A dashboard** to manage projects (saved in IndexedDB). Start one from a
  **template** — Vanilla web app, Static HTML, or Node script — or by **cloning a
  git repo** straight into a new project.
- **A resizable 3-pane layout** — file tree · editor + terminal · live preview.
- **A Monaco editor** with tabs over a real multi-file project.
- **A real WebContainer**: run `npm install`, build scripts, `node`, anything.
- **An interactive terminal** — `ls`, `cat`, `npm`, `node` are all real.
- **A Seti-iconed file tree** for navigating the project.
- **A live preview** that auto-builds on save (toggle it off for manual builds).
- **A Source Control panel** — in-browser **git** via
  [wasm-git](https://github.com/petersalomonsen/wasm-git) (libgit2 → WebAssembly):
  initialize a repo, stage-and-commit, view the short status of changed files,
  and browse history. It **persists to IndexedDB** (survives reloads) and can
  **clone / pull / push** to remotes over HTTP through a configurable CORS proxy
  with an optional access token.

The project that opens by default is a tiny zero-dependency web app so the first
boot is instant — but it's only a starting point. It's a real shell, so add
dependencies, change the build command, or replace the whole project.

## How it works

```
┌── dev-local ──────────────────────────────────────────────┐
│  web-editor (Monaco · xterm · WebContainer · split-pane)  │
│                                                           │
│   edit files ──▶ WebContainer: npm install → build       │
│                    → dist/index.html                      │
│                         │                                 │
│                         ▼                                 │
│                  live preview iframe                      │
└───────────────────────────────────────────────────────────┘
```

The build engine reads the build's single output file back out and hands the app
a `blob:` URL, which the preview pane points an `<iframe>` at. Point dev-local at
a different stack by changing the starter project and its build descriptor — see
`src/project.js` and `src/editor.js` in the package.

Git is independent of the WebContainer: wasm-git runs on its own filesystem, and
dev-local mirrors the editor's files into a `/repo` working tree before each git
command (see `src/gitEngine.js`). The async wasm-git build is served from
`vendor/wasm-git/` and loaded with a native dynamic import so Emscripten can
locate its `.wasm` next to its script. It works under the same cross-origin
isolation the page already requires.

`/repo` is mounted on **IDBFS**, so commits are saved to IndexedDB and restored
on reload. Remote operations route through a configurable **CORS proxy** (most
git hosts don't send CORS headers) with an optional token as HTTP Basic auth —
implemented by wrapping wasm-git's `emscriptenhttpconnect` transport, leaving the
rest of the page's networking untouched.

## Run it locally

```sh
git clone https://github.com/playforge-coding/scratch4js
cd scratch4js && pnpm install
pnpm --filter web-editor build      # build the toolkit dev-local imports
pnpm --filter dev-local dev
```

Then open the printed URL (default <http://localhost:3000>).

WebContainers and Monaco's workers require the page to be **cross-origin
isolated** (`COOP: same-origin` + `COEP: credentialless`). The dev/preview
servers set those headers directly; the deployed build uses a
[`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker) shim since
GitHub Pages can't set response headers. See the
[package README](https://github.com/playforge-coding/scratch4js/tree/main/packages/dev-local)
for details.
