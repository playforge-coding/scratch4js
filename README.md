# scratch4js

A pnpm monorepo of small, focused JavaScript packages for working with Scratch
and TurboWarp — edit `.sb3` projects programmatically, talk to the Scratch
website, drive it all from an AI agent, and build & bundle TurboWarp extensions.

📖 **Documentation:** https://playforge-coding.github.io/scratch4js/

## Packages

| Path                                                           | Package               | What it is                                                                                                                      |
| -------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/scratch4js`](packages/scratch4js)                   | `scratch4js`          | The core library: read/edit `.sb3` files with a small, declarative API.                                                         |
| [`packages/s-api4js`](packages/s-api4js)                       | `s-api4js`            | A class-based wrapper for the Scratch website API: read public data, and log in to download/edit/publish `.sb3`.                |
| [`packages/scratch-mcp`](packages/scratch-mcp)                 | `scratch-mcp`         | An MCP server exposing the library's editing surface as tools, plus a TurboWarp live-reload bridge.                             |
| [`packages/tw-plugin-webpack`](packages/tw-plugin-webpack)     | `tw-plugin-webpack`   | webpack/Rspack plugin that bundles a multi-file TurboWarp extension into one IIFE-wrapped file.                                 |
| [`packages/tw-plugin-rollup`](packages/tw-plugin-rollup)       | `tw-plugin-rollup`    | Rollup/Rolldown/Vite plugin that bundles a multi-file TurboWarp extension into one IIFE-wrapped file.                           |
| [`packages/create-tw-extension`](packages/create-tw-extension) | `create-tw-extension` | Scaffolder (`npm create tw-extension`) for a new TurboWarp extension project with your choice of bundler.                       |
| [`packages/web-editor`](packages/web-editor)                   | `web-editor`          | Reusable React building blocks for in-browser IDEs: split-pane layout, Monaco, an xterm/WebContainer terminal, file tree.       |
| [`packages/tw-extension-maker`](packages/tw-extension-maker)   | `tw-extension-maker`  | In-browser IDE (built on `web-editor`) that bundles a TurboWarp extension in a WebContainer and previews it live.               |
| [`packages/userscript`](packages/userscript)                   | `userscript`          | TurboWarp Desktop userscript (ES modules → one IIFE): scratch-mcp live-reload + real-time collaboration over a WebSocket relay. |

## How they fit together

```
  AI agent / MCP client
          │  (MCP tools over stdio)
          ▼
   ┌──────────────┐   edits in memory   ┌────────────┐
   │  scratch-mcp │ ──────────────────► │ scratch4js │
   └──────┬───────┘   save → .sb3 file  └────────────┘
          │ WebSocket bridge (localhost:9060)
          ▼  "loadSB3" → fetch /get.sb3
   TurboWarp Desktop + userscript  ──►  live preview
```

An agent edits a project through `scratch-mcp`; on save the server writes the
`.sb3` and signals the userscript, which reloads it into TurboWarp Desktop
instantly.

## Getting started

```bash
pnpm install
pnpm build          # build every package (-r build)
pnpm lint
pnpm fmt            # prettier --write .
```

Then:

1. Install the [userscript](packages/userscript) into TurboWarp Desktop
   (`pnpm --filter userscript deploy`; per-OS paths in its README).
2. Run the [MCP server](packages/scratch-mcp) and point your MCP client at it.
3. Open `.sb3` files, edit, and `save_project` to see changes live.

## Workspace layout

```
.
├── packages/
│   ├── scratch4js/          # the core library (+ examples + example.sb3)
│   ├── s-api4js/            # Scratch website API wrapper
│   ├── scratch-mcp/         # the MCP server + live-reload bridge
│   ├── tw-plugin-webpack/   # webpack/Rspack extension bundler plugin
│   ├── tw-plugin-rollup/    # Rollup/Rolldown/Vite extension bundler plugin
│   ├── create-tw-extension/ # extension scaffolder CLI
│   ├── web-editor/          # in-browser IDE building blocks
│   ├── tw-extension-maker/  # in-browser extension IDE
│   └── userscript/          # TurboWarp Desktop userscript: live-reload + collaboration
├── docs/                    # Rspress documentation site
├── pnpm-workspace.yaml
└── package.json             # workspace root (build/lint/fmt delegate to -r)
```
