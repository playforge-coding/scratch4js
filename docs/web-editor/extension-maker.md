---
title: TurboWarp Extension Maker — build extensions in your browser
description: An in-browser IDE for TurboWarp/Scratch extensions. Edit a multi-file project in Monaco, bundle it with Rsbuild/Rollup/Rolldown/Vite inside a WebContainer, and run it on an embedded Scratch blocks editor and stage — no install.
---

# TurboWarp Extension Maker

A complete **in-browser IDE for building [TurboWarp](https://turbowarp.org) /
Scratch extensions** — the reference application built on
[`web-editor`](/web-editor/). It's a self-hostable, reusable alternative to
spinning up a StackBlitz each time: everything runs client-side, with your work
saved in your browser.

<div style={{margin: '1.5rem 0'}}>
  <a
    href="/scratch4js/tw-ext/"
    style={{
      display: 'inline-block', padding: '0.6rem 1.1rem', borderRadius: '8px',
      background: 'var(--rp-c-brand, #6b5cff)', color: '#fff', fontWeight: 600,
      textDecoration: 'none',
    }}
  >
    Open the Extension Maker →
  </a>
</div>

It's hosted from this same site at
[`/scratch4js/tw-ext/`](https://playforge-coding.github.io/scratch4js/tw-ext/).

## What you get

- **A dashboard** to create and manage extensions. Pick a **bundler** (Rsbuild,
  Rspack, webpack, Rollup, Rolldown, or Vite) and a **package manager** (npm,
  pnpm, yarn, bun) per project.
- **A Monaco editor** over a real multi-file project — split your extension
  across as many files as you like.
- **A real WebContainer** that runs `npm install` and the bundler (the same
  setup [`create-tw-extension`](/create-tw-extension/) scaffolds, via
  [`tw-plugin-webpack`](/tw-plugin-webpack/) / [`tw-plugin-rollup`](/tw-plugin-rollup/)).
  napi-based bundlers (Rspack, Rolldown) run via their WASM/WASI builds.
- **An interactive terminal** — run `ls`, `cat`, `node`, `npm` yourself.
- **An embedded Scratch editor + stage**: the freshly-built extension loads into
  a real Scratch VM (`scratch-vm` + `scratch-blocks` + `scratch-render`,
  dark-themed to match), so its blocks appear in the palette and run on the
  stage — no need to round-trip through turbowarp.org.
- **Copy / Download / Open in TurboWarp** for the finished single-file extension.
- **IndexedDB persistence** — projects and edits survive reloads.

## How it works

```
┌── TurboWarp Extension Maker ──────────────────────────────────────────┐
│  web-editor (Monaco · xterm · WebContainer · split-pane layout)       │
│                                                                       │
│   edit files ──▶ WebContainer: npm install → bundler build           │
│                    → dist/<id>.js (single-file extension)             │
│                         │                                             │
│                         ▼                                             │
│   scratch-vm + scratch-blocks + scratch-render (in-page)             │
│     loads the extension → blocks in the palette, runnable on stage   │
└───────────────────────────────────────────────────────────────────────┘
```

Because the Scratch VM runs **in the page**, the extension loads from a
same-origin `data:` URL — no cross-origin limits, no server.

## Run it locally

```sh
git clone https://github.com/playforge-coding/scratch4js
cd scratch4js && pnpm install
pnpm --filter tw-extension-maker dev
```

See the
[package README](https://github.com/playforge-coding/scratch4js/tree/main/packages/tw-extension-maker)
for the full architecture and the cross-origin-isolation / GitHub Pages notes.
