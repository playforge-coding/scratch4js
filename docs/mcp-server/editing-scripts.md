---
title: Editing scripts
description: Author Scratch scripts by patching a target's raw blocks JSON, guided by the block catalog.
---

# Editing scripts (blocks)

The sprite, costume, sound and variable tools cover a project's _structure_, but
a sprite's behaviour lives in its **scripts** — the `blocks` map in each target's
raw JSON. There is no high-level "add block" tool because the block format is too
open-ended; instead the agent edits the raw JSON directly with **`patch_target`**,
guided by a **block catalog** so it doesn't have to invent opcodes or encodings
from memory.

The loop is:

1. **`get_target_json { name, pointer: "/blocks" }`** — read the current scripts
   (and the ids you'll wire `next` / `parent` / `SUBSTACK` against).
2. **`list_blocks`** then **`get_block_schema { opcode }`** — discover the opcode
   and copy its example. The schema gives the exact `inputs` (with sb3 shadow
   encodings like `[1, [10, "hi"]]`), `fields`, enumerated dropdown `options`, and
   the block's shape, so the emitted JSON is valid.
3. **`patch_target { name, patch }`** — apply an RFC 6902 JSON Patch (typically
   `add` ops into `/blocks`). It's atomic, and the result lists advisory
   `warnings` (unknown opcode with a "did you mean", unexpected input/field, an
   out-of-range dropdown value, or an extension that isn't enabled) so the agent
   can self-correct without the patch being rejected.
4. **`vm_load` → `vm_run`** — run the edited project and assert on the result
   (see [Running & testing](/mcp-server/running-and-testing)).

The catalog is generated at startup from the installed `scratch-vm`: the ~130
standard opcodes come from its sb2→sb3 spec map, and built-in extension blocks
(`pen_*`, `music_*`, `microbit_*`, …) from each extension's `getInfo()`. To use an
extension, call **`enable_extension`** first so its id is added to the project's
`extensions` (custom URL extensions are recorded in `extensionURLs`); blocks from
custom/third-party extensions are opaque, so mirror an existing one read via
`get_target_json`.
