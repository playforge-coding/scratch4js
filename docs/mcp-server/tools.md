---
title: Tool reference
description: Every MCP tool scratch-mcp exposes — project, sprites, costumes, blocks, extensions, and the headless VM.
---

# Tool reference

Every tool the server exposes, grouped by what it touches. For the script-editing
workflow see [Editing scripts](/mcp-server/editing-scripts); for the VM tools see
[Running & testing](/mcp-server/running-and-testing).

**Project**

- `open_project { path }` — load an `.sb3` into memory.
- `save_project { path?, compressionLevel? }` — write it back (and live-reload).
- `project_info` — targets, extensions, monitors, meta.

**Scratch website** (online projects, via [`s-api4js`](/s-api4js/)) — see [Online projects](/mcp-server/online-projects)

- `scratch_login { username?, password? }` — log in to scratch.mit.edu (defaults
  to `$SCRATCH_USER` / `$SCRATCH_PASS`).
- `open_scratch_project { projectId }` — download a project by id and open it for
  editing (shared projects need no login; your own unshared ones do).
- `push_to_scratch { projectId?, confirm? }` — save the open project back to
  scratch.mit.edu. **Always asks the user to confirm first.**
- `share_project { projectId?, confirm? }` — publish a project publicly.
  **Always asks the user to confirm first.**

**Reading**

- `list_sprites` — every sprite with position/size/media.
- `get_target { name }` — full details for a sprite or `"Stage"`.
- `get_target_json { name, pointer? }` — the target's raw `project.json` entry
  (blocks, costumes, sounds, …), or a subtree at a JSON Pointer. Read this before
  authoring a `patch_target` edit.

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

**Block reference** (so the agent knows which blocks exist and how to fill them)

- `list_blocks { category? }` — the catalog of standard opcodes, each with its
  category, shape (hat / stack / c-block / cap / reporter / boolean) and the names
  of its inputs and fields. With no `category`, lists core blocks; pass a core
  category or a built-in extension id (`pen`, `music`, …) to filter.
- `get_block_schema { opcode, target? }` — the full schema for one opcode: every
  input with its sb3 shadow encoding (a text input is `[1, [10, "hi"]]`), every
  field with enumerated dropdown `options`, and a ready-to-adapt example block
  JSON. Dynamic menu options (sprites, sounds, costumes, broadcasts, …) are filled
  from the open project; pass `target` to enumerate that sprite's own media.

**Extensions**

- `enable_extension { id, url? }` — register an extension so its blocks load and
  show in the palette (required before using any `<id>_…` block). Pass just `id`
  for a built-in (`pen`, `music`, `videoSensing`, `text2speech`, `translate`,
  `makeymakey`, `microbit`, `ev3`, `boost`, `wedo2`, `gdxfor`); add `url` for a
  custom/third-party (TurboWarp) extension.

**Editing scripts (raw JSON, diff/patch)** — see [Editing scripts](/mcp-server/editing-scripts)

- `patch_target { name, patch }` — apply an
  [RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902) JSON Patch to a
  target's raw JSON. This is how you edit a sprite's scripts (`blocks`) or any
  field the higher-level tools don't cover. Paths are JSON Pointers into
  `get_target_json`; the patch applies atomically (all-or-nothing) and the result
  reports advisory `warnings` for unknown opcodes, unexpected inputs, bad dropdown
  values, or extensions that aren't enabled.

**Run & test** (headless [TurboWarp VM](https://github.com/TurboWarp/scratch-vm), in-process) — see [Running & testing](/mcp-server/running-and-testing)

- `vm_load` — load the open project into a headless VM (reflects in-memory edits).
- `vm_green_flag` — press the green flag (clears bubbles, question, errors).
- `vm_run { seconds?, frames?, untilIdle?, paced? }` — advance the VM, then return state
  plus an `events` timeline (say/think, broadcasts, question/answer, errors) since the last run.
- `vm_state` — snapshot: every target's position/size/direction/costume/visibility,
  variables, lists, monitors, say/think bubbles, pending question, running threads, errors.
- `vm_input { keys?, mouseX?, mouseY?, mouseDown?, answer? }` — feed keyboard/mouse input
  and answer `ask and wait`.
- `vm_stop` — stop all scripts.

**Live reload & screenshots** (require the bridge + userscript) — see [Live reload](/mcp-server/live-reload)

- `reload { path? }` — load an `.sb3` from disk in the editor.
- `run_project` / `stop_project` — green flag / stop.
- `screenshot` — capture the live stage as a lossless **PNG**, for when exact
  pixels matter (crisp edges, precise colours, thin lines). Takes no parameters.
- `screenshot_jpeg { quality? }` — the same capture re-encoded as a compressed
  **JPEG** (smaller, cheaper to read; `quality` 1–100, default 80). Prefer this
  for eyeballing the stage unless you need pixel fidelity.
