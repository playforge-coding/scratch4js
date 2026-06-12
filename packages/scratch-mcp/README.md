# scratch-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for editing
Scratch `.sb3` projects, built on [`scratch4js`](../scratch4js). It keeps one
project open in memory, exposes the library's editing surface as MCP tools, and
saves back to disk.

It also hosts a **live-reload bridge** on `http://localhost:9060`. With the
[TurboWarp Desktop userscript](../../userscript) installed, every `save_project`
reloads the project live in the editor — so an agent's edits appear instantly.

## Run

```bash
pnpm install
pnpm --filter scratch4js build   # the server imports the built library
pnpm --filter scratch-mcp start  # serves MCP over stdio
```

### Configure an MCP client

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

**Run & test** (headless [TurboWarp VM](https://github.com/TurboWarp/scratch-vm), in-process)

- `vm_load` — load the open project into a headless VM (reflects in-memory edits).
- `vm_green_flag` — press the green flag (clears bubbles, question, errors).
- `vm_run { seconds?, frames?, untilIdle?, paced? }` — advance the VM, then return state
  plus an `events` timeline (say/think, broadcasts, question/answer, errors) since the last run.
- `vm_state` — snapshot: every target's position/size/direction/costume/visibility,
  variables, lists, monitors, say/think bubbles, pending question, running threads, errors.
- `vm_input { keys?, mouseX?, mouseY?, mouseDown?, answer? }` — feed keyboard/mouse input
  and answer `ask and wait`.
- `vm_stop` — stop all scripts.

**Live reload & screenshots** (require the bridge + userscript)

- `reload { path? }` — load an `.sb3` from disk in the editor.
- `run_project` / `stop_project` — green flag / stop.
- `screenshot` — capture a PNG of the live stage from the connected editor.

## Running and testing a project

The `vm_*` tools embed [TurboWarp's `scratch-vm`](https://github.com/TurboWarp/scratch-vm)
(the JIT fork) **in this process** — no browser, no WebGL. The loop is: edit →
`vm_load` → `vm_green_flag` → `vm_run` → read `vm_state` → assert. It returns
**structured state** (variable values, sprite positions, say bubbles), which an
agent can assert against directly — far better than reasoning over pixels, and
deterministic enough for CI.

The headless VM has no renderer or audio: costume _metadata_ still loads (so
costume-by-name/number logic works), but renderer-backed blocks (touching
colour/sprite/edge, pen) and sound playback are inert. To see the _real_ rendered
stage, run the project in TurboWarp Desktop and call `screenshot`.

### Events

Notable events — `say`/`think`, `broadcast`, `greenflag`, `stop`,
`question`/`answer` and runtime/compile `error`s, each `{ level, type, message,
…fields }` — are surfaced two ways:

- **In `vm_run`'s result** (`events`): the ordered timeline since the previous
  `vm_run`. This is the **agent-facing** channel — the model reads it directly in
  the tool result and can assert on _sequence_, not just final state. Always on.
- **As MCP log notifications** (`notifications/message`, `logger: "scratch-vm"`):
  the **client/human-facing** channel for a host's log view. Off until the client
  raises its log level via `logging/setLevel` — `"info"` for activity, `"debug"`
  to also include run boundaries and bubble-clears, `"warning"`+ for errors only.
  (Most clients don't feed notifications back to the model, which is why the
  `vm_run` channel exists.)

Repeated identical `say`/`think` bubbles are de-duplicated so a `say` in a loop
doesn't flood either channel.

## How live reload works

The bridge is a plain WebSocket + HTTP server. The userscript connects over
WebSocket and answers JSON requests (`loadSB3` / `start` / `stop` / `screenshot`).
On `loadSB3` it fetches the bytes from `GET /get.sb3?path=…` and loads them into
the TurboWarp VM; `save_project` writes the file then sends `loadSB3`, so the
editor always shows the latest save. `screenshot` returns the stage as a PNG.
