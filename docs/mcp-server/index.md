---
title: The MCP server
description: Drive scratch4js from an AI agent with scratch-mcp, and live-reload edits into TurboWarp Desktop.
---

# The MCP server (`scratch-mcp`)

[`scratch-mcp`](https://github.com/playforge-coding/scratch4js/tree/main/packages/scratch-mcp)
is a companion [Model Context Protocol](https://modelcontextprotocol.io) server
built on scratch4js. It keeps one project open in memory, exposes the library's
editing surface as **MCP tools**, and saves back to disk — so an AI agent can
edit `.sb3` projects through tool calls.

It also hosts a **live-reload bridge** on `http://localhost:9060`. With the
[TurboWarp Desktop userscript](https://github.com/playforge-coding/scratch4js/tree/main/userscript)
installed, every `save_project` reloads the project live in the editor, so an
agent's edits appear instantly.

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

This section covers the [tool reference](/mcp-server/tools),
[editing scripts](/mcp-server/editing-scripts) with the block catalog,
[running & testing](/mcp-server/running-and-testing) in the headless VM, and
[how live reload works](/mcp-server/live-reload).

## Run it

```bash
pnpm install
pnpm --filter scratch4js build   # the server imports the built library
pnpm --filter scratch-mcp start  # serves MCP over stdio
```

## Configure an MCP client

```json
{
  "mcpServers": {
    "scratch": {
      "command": "node",
      "args": ["/abs/path/to/packages/scratch-mcp/src/index.js"]
    }
  }
}
```

Set `SCRATCH_MCP_BRIDGE_PORT` to change the bridge port (default `9060`). If the
port is taken the server still starts; only live reload is disabled.

## Install as an MCP Bundle (`.mcpb`)

For one-click installation in Claude Desktop and other MCPB-aware clients, build
an [MCP Bundle](https://github.com/anthropics/mcpb) — a single `.mcpb` file with
the server and a self-contained `node_modules`:

```bash
pnpm --filter scratch-mcp mcpb   # → packages/scratch-mcp/dist/scratch-mcp-<version>.mcpb
```

Open the resulting file in your client (in Claude Desktop, drag it into
Settings → Extensions). Its one setting is the live-reload bridge port; nothing
else needs configuring.
