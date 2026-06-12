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

## Install as an MCP Bundle (`.mcpb`)

For one-click installation in Claude Desktop and other MCPB-aware clients, this
server packages as an [MCP Bundle](https://github.com/anthropics/mcpb) — a single
`.mcpb` file containing the server plus a self-contained `node_modules`.

```bash
pnpm --filter scratch-mcp mcpb   # → packages/scratch-mcp/dist/scratch-mcp-<version>.mcpb
```

Then open the `.mcpb` in your client (in Claude Desktop, drag it into
Settings → Extensions). The bundle exposes one setting — the live-reload bridge
port — and needs no other configuration. The build (`scripts/build-mcpb.mjs`)
vendors the `scratch4js` workspace package as a tarball and installs the git
`scratch-vm` and its peers into a flat `node_modules`, as MCPB requires. The
[`manifest.json`](./manifest.json) is the bundle's source of truth (its version
is stamped from `package.json` at build time).

## Tools

**Project**

- `open_project { path }` — load an `.sb3` into memory.
- `save_project { path?, compressionLevel? }` — write it back (and live-reload).
- `project_info` — targets, extensions, monitors, meta.

**Scratch website** (online projects, via [`s-api4js`](../s-api4js))

- `scratch_login { username?, password? }` — log in to scratch.mit.edu
  (defaults to `$SCRATCH_USER` / `$SCRATCH_PASS`). The session lives in memory
  for the server process only.
- `open_scratch_project { projectId }` — download a project by id and open it
  for editing (shared projects need no login; your own unshared ones do).
- `push_to_scratch { projectId?, confirm? }` — save the open project back to
  scratch.mit.edu, overwriting it online (uploads assets, then `project.json`).
- `share_project { projectId?, confirm? }` — publish a project so it's public.

> `push_to_scratch` and `share_project` change the **live** project, so they
> always ask you to confirm first — via an MCP
> [elicitation](https://modelcontextprotocol.io/specification/draft/client/elicitation)
> prompt when your client supports it, otherwise by requiring `confirm: true`
> (which the agent should only set after you've agreed).

**Reading**

- `list_sprites` — every sprite with position/size/media.
- `get_target { name }` — full details for a sprite or `"Stage"`.
- `get_target_json { name, pointer? }` — the target's raw `project.json` entry
  (blocks, costumes, sounds, …), or a subtree at a JSON Pointer. Read this before
  authoring a `patch_target`.

**Block reference** (so the agent knows which blocks exist and how to fill them)

- `list_blocks { category? }` — the catalog of standard opcodes, each with its
  category, shape (hat / stack / c-block / cap / reporter / boolean) and the
  names of its inputs and fields. Generated at startup from the installed
  `scratch-vm`, so it stays in sync.
- `get_block_schema { opcode, target? }` — full schema for one opcode: every
  input with its sb3 shadow encoding (e.g. a text input is `[1, [10, "hi"]]`),
  every field with enumerated dropdown `options`, and a ready-to-adapt example
  block JSON. Dynamic menu options (sprites, sounds, costumes, broadcasts, …) are
  filled from the open project; pass `target` to enumerate that sprite's own
  costumes and sounds. Covers built-in **extension** blocks too (`pen_*`,
  `music_*`, `microbit_*`, …), generated from each extension's `getInfo()`.

**Extensions**

- `enable_extension { id, url? }` — register an extension so its blocks load and
  show in the palette (required before using any `<id>_…` block). Pass just `id`
  for a built-in (pen, music, videoSensing, text2speech, translate, makeymakey,
  microbit, ev3, boost, wedo2, gdxfor); add `url` for a custom/third-party
  (TurboWarp) extension. `list_blocks { category: "<id>" }` and `get_block_schema`
  describe built-in extension blocks; `patch_target` warns when a block uses an
  extension that isn't enabled. Custom extensions are opaque — mirror an existing
  block via `get_target_json`.

**Editing raw JSON (diff/patch)**

- `patch_target { name, patch }` — apply an [RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902)
  JSON Patch to a target's raw JSON. This is how you edit a sprite's scripts
  (`blocks`) or any field the higher-level tools don't cover — on a sprite you
  just created or an existing one. Paths are JSON Pointers into `get_target_json`;
  the patch applies atomically (all-or-nothing) and the result reports advisory
  `warnings` for unknown opcodes or inputs. Patching `costumes`/`sounds` arrays
  doesn't move asset bytes — use `add_costume`/`remove_costume` for that.

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
- `screenshot { quality? }` — capture the live stage as a compressed JPEG
  (smaller, cheaper to read; the default).
- `screenshot_pixelperfect` — capture the live stage as a lossless PNG, for when
  exact pixels matter.

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
editor always shows the latest save. A snapshot comes back as a PNG, which the
server serves as a compressed JPEG (`screenshot`) or unchanged
(`screenshot_pixelperfect`).
