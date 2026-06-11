---
title: Stage
description: The single backdrop-bearing target that owns the project's broadcasts.
---

# `Stage`

The stage: the single backdrop-bearing target that also owns the project's
broadcasts. Extends [`Target`](/api/target), so its backdrops are just
"costumes", and variables defined on it are **global**. This page covers the
stage-specific additions.

```js
const { stage } = project;
stage.tempo = 120;
stage.addCostume('backdrop1', svgBytes, { dataFormat: 'svg' });
stage.setVariable('score', 0); // a global variable
```

Get the stage from [`project.stage`](/api/project#project-stage).

## Accessors

### `stage.isStage`

- **Type:** `true` (getter) — always `true`. Discriminates `Stage` from
  [`Sprite`](/api/sprite) in the union.

### `stage.tempo`

- **Type:** `number` (get/set) — tempo for music blocks, in BPM. Default `60`.

### `stage.videoState`

- **Type:** `string` (get/set) — video input state: `on`, `off`, or `on-flipped`.
  Default `off`.

### `stage.videoTransparency`

- **Type:** `number` (get/set) — video transparency, 0–100. Default `50`.

## Broadcasts

Broadcast messages are project-wide and owned by the stage.

### `stage.broadcastNames`

- **Type:** `string[]` (getter) — names of all broadcast messages in the project.

### `stage.addBroadcast(name)`

- **`name`**: `string`
- **Returns:** `string` — the broadcast's id.

Add a broadcast message if it does not already exist (idempotent). The id is
derived as `broadcastMsgId-<name>`.

```js
stage.addBroadcast('game over');
stage.addBroadcast('game over'); // no-op, returns the same id
```

## Inherited from `Target`

Costumes (backdrops), sounds, variables, lists and blocks all come from
[`Target`](/api/target). Note that because the stage's costumes **are** the
project's backdrops, `addCostume` / `removeCostume` manage backdrops:

```js
stage.addCostume('night', await readFile('night.png'));
stage.currentCostume = 1; // switch the displayed backdrop
```
