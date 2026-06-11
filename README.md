# scratch4js

A pnpm monorepo for working with Scratch `.sb3` projects from JavaScript —
edit them programmatically, drive them from an AI agent, and preview the results
live in TurboWarp Desktop.

📖 **Documentation:** https://playforge-coding.github.io/scratch4js/

## Packages

| Path                                                       | Package             | What it is                                                                                            |
| ---------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| [`packages/scratch4js`](packages/scratch4js)               | `scratch4js`        | The core library: read/edit `.sb3` files with a small, declarative API.                               |
| [`packages/scratch-mcp`](packages/scratch-mcp)             | `scratch-mcp`       | An MCP server exposing the library's editing surface as tools, plus a TurboWarp live-reload bridge.   |
| [`packages/tw-plugin-webpack`](packages/tw-plugin-webpack) | `tw-plugin-webpack` | webpack/Rspack plugin that bundles a multi-file TurboWarp extension into one IIFE-wrapped file.       |
| [`packages/tw-plugin-rollup`](packages/tw-plugin-rollup)   | `tw-plugin-rollup`  | Rollup/Rolldown/Vite plugin that bundles a multi-file TurboWarp extension into one IIFE-wrapped file. |
| [`userscript`](userscript)                                 | —                   | Prebuilt TurboWarp Desktop userscript + userstyle that live-reload the project the MCP server edits.  |

## How they fit together

```
  AI agent / MCP client
          │  (MCP tools over stdio)
          ▼
   ┌──────────────┐   edits in memory   ┌────────────┐
   │  scratch-mcp │ ──────────────────► │ scratch4js │
   └──────┬───────┘   save → .sb3 file  └────────────┘
          │ socket.io bridge (localhost:9060)
          ▼  "loadSB3" → fetch /get.sb3
   TurboWarp Desktop + userscript  ──►  live preview
```

An agent edits a project through `scratch-mcp`; on save the server writes the
`.sb3` and signals the userscript, which reloads it into TurboWarp Desktop
instantly.

## Getting started

```bash
pnpm install
pnpm build          # build every package (scratch4js → dist/)
pnpm lint
pnpm format
```

Then:

1. Install the [userscript](userscript) into TurboWarp Desktop (per-OS paths in
   its README).
2. Run the [MCP server](packages/scratch-mcp) and point your MCP client at it.
3. Open `.sb3` files, edit, and `save_project` to see changes live.

## Workspace layout

```
.
├── packages/
│   ├── scratch4js/     # the library (+ example_project fixture)
│   └── scratch-mcp/    # the MCP server + live-reload bridge
├── userscript/         # prebuilt TurboWarp Desktop userscript + userstyle
├── pnpm-workspace.yaml
└── package.json        # workspace root (build/lint/format delegate to -r)
```
