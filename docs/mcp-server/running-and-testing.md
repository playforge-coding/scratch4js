---
title: Running & testing
description: Run and assert on a project in the in-process headless TurboWarp VM.
---

# Running and testing a project

The run-&-test tools embed [TurboWarp's `scratch-vm`](https://github.com/TurboWarp/scratch-vm)
(the fork with a JIT compiler) **directly in the server process** — no browser, no
WebGL. The loop is: edit (scratch4js) → `vm_load` → `vm_green_flag` → `vm_run` →
read `vm_state` → assert.

This returns **structured state** (`score = 42`, `Cat at (120, -30)`, `said "You win!"`)
rather than pixels, which is far easier for an agent to assert against and is
deterministic and CI-friendly. The headless VM has no renderer or audio engine:
costume _metadata_ still loads (so switching costumes by name/number works), but a
few renderer-backed blocks (touching colour/sprite/edge, pen) and sound playback
are inert. When you need to _see_ the real rendered stage, run the project in
TurboWarp Desktop and call `screenshot` — that uses the editor's real renderer
(see [Live reload](/mcp-server/live-reload)).

## Events

Notable events — `say`/`think`, `broadcast`, `greenflag`, `stop`,
`question`/`answer` and runtime/compile `error`s, each `{ level, type, message,
…fields }` — are surfaced two ways:

- **In `vm_run`'s result** (`events`): the ordered timeline since the previous
  `vm_run`. This is the **agent-facing** channel — the model reads it straight
  from the tool result and can assert on _sequence_, not just final state. Always on.
- **As MCP log notifications** (`notifications/message`, `logger: "scratch-vm"`):
  the **client/human-facing** channel for a host's log view. Off until the client
  raises its level via `logging/setLevel` — `"info"` for activity, `"debug"` to
  also include run boundaries and bubble-clears, `"warning"`+ for errors only.
  Most clients don't feed notifications back to the model, which is why the
  `vm_run` channel exists.

Repeated identical `say`/`think` bubbles are de-duplicated, so a `say` inside a
loop doesn't flood either channel.
