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

## Tools

**Project**

- `open_project { path }` — load an `.sb3` into memory.
- `save_project { path?, compressionLevel? }` — write it back (and live-reload).
- `project_info` — targets, extensions, monitors, meta.

**Reading**

- `list_sprites` — every sprite with position/size/media.
- `get_target { name }` — full details for a sprite or `"Stage"`.

**Sprites & stage**

- `set_sprite { name, x?, y?, size?, direction?, visible?, draggable?, rotationStyle?, layerOrder?, volume? }`
- `add_sprite { name, ...props }` / `remove_sprite { name }` / `rename_target { name, newName }`
- `set_stage { tempo?, videoState?, videoTransparency?, volume? }`

**Variables, lists, broadcasts** (`target` is a sprite name or `"Stage"`)

- `set_variable { target, name, value }` / `delete_variable { target, name }`
- `set_list { target, name, items }` / `delete_list { target, name }`
- `add_broadcast { name }`

**Costumes & sounds**

- `add_costume { target, name, path, dataFormat?, rotationCenterX?, rotationCenterY? }`
- `remove_costume { target, name }`
- `add_sound { target, name, path, dataFormat? }` / `remove_sound { target, name }`

**Live reload** (require the bridge + userscript)

- `reload { path? }` — load an `.sb3` from disk in the editor.
- `run_project` / `stop_project` — green flag / stop.

## How live reload works

The bridge is a plain WebSocket + HTTP server. The userscript connects over
WebSocket and answers JSON requests (`loadSB3` / `start` / `stop`). On `loadSB3`
it fetches the bytes from `GET /get.sb3?path=…` and loads them into the TurboWarp
VM. `save_project` writes the file then sends `loadSB3`, so the editor always
shows the latest save.
