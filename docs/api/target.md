---
title: Target
description: The abstract base shared by Stage and Sprite — costumes, sounds, variables, lists and blocks.
---

# `Target`

A target is anything that lives in the project's `targets` array: either the
single [`Stage`](/api/stage) or a [`Sprite`](/api/sprite). This abstract base
class covers everything the two share. You never instantiate `Target` directly;
you get a `Stage` or `Sprite` from a [`Project`](/api/project) and use the members
below on it.

```js
const cat = project.sprite('Sprite1'); // a Sprite, which is a Target
cat.addCostume('hat', pngBytes);
cat.setVariable('lives', 3);
```

## Instance fields

### `target.json`

- **Type:** `object`

The raw target entry from `project.json`. The accessors below keep it in sync;
reach into it for fields the typed API doesn't expose.

### `target.project`

- **Type:** [`Project`](/api/project)

The owning project — where the asset bytes live.

## Identity & audio

### `target.isStage`

- **Type:** `boolean` (getter)

`true` for the stage, `false` for sprites. Overridden as a constant on each
subclass, so it discriminates the union without a runtime check.

### `target.name`

- **Type:** `string` (get/set)

The target's name. Setting coerces to a string.

### `target.volume`

- **Type:** `number` (get/set) — output volume, 0–100. Defaults to `100`.

## Costumes

### `target.costumes`

- **Type:** [`Costume[]`](/api/costume-sound#costume) (getter)

The target's costumes, in order.

### `target.currentCostume`

- **Type:** `number` (get/set)

Index of the currently selected costume. Defaults to `0`.

### `target.getCostume(name)`

- **`name`**: `string`
- **Returns:** [`Costume`](/api/costume-sound#costume) `| undefined`

Find a costume by name.

### `target.addCostume(name, data, options?)` {#addcostume}

- **`name`**: `string` — costume name.
- **`data`**: `Uint8Array | ArrayBuffer` — image bytes (PNG/SVG/JPG/…).
- **`options.dataFormat`**: `string` _(optional)_ — override the detected file
  type. When omitted it is sniffed from the bytes, falling back to `png`.
- **`options.rotationCenterX`**: `number` _(default `0`)_ — anchor X, in costume
  pixels.
- **`options.rotationCenterY`**: `number` _(default `0`)_ — anchor Y.
- **`options.bitmapResolution`**: `number` _(default `1` for SVG, `2` otherwise)_
  — pixels per unit.
- **Returns:** [`Costume`](/api/costume-sound#costume) — the new costume.

Add a costume from raw image bytes. The bytes are hashed and stored in
[`project.assets`](/api/project#project-assets) under their `md5ext`, and a costume
entry pointing at them is appended.

```js
cat.addCostume('logo', svgBytes, {
  dataFormat: 'svg',
  rotationCenterX: 24,
  rotationCenterY: 24,
});
```

### `target.removeCostume(nameOrIndex)`

- **`nameOrIndex`**: `string | number`
- **Returns:** `boolean` — `true` if a costume was removed.

Remove a costume by name or index. If the removed costume was the selected one,
`currentCostume` is clamped back into range. The underlying bytes are dropped only
if nothing else references them.

## Sounds

### `target.sounds`

- **Type:** [`Sound[]`](/api/costume-sound#sound) (getter)

The target's sounds, in order.

### `target.getSound(name)`

- **`name`**: `string`
- **Returns:** [`Sound`](/api/costume-sound#sound) `| undefined`

Find a sound by name.

### `target.addSound(name, data, options?)` {#addsound}

- **`name`**: `string` — sound name.
- **`data`**: `Uint8Array | ArrayBuffer` — audio bytes (WAV/MP3).
- **`options.dataFormat`**: `string` _(optional)_ — override the detected type
  (sniffed, falling back to `wav`).
- **`options.rate`**: `number` _(default `48000`)_ — sample rate in Hz.
- **`options.sampleCount`**: `number` _(default `0`)_ — number of samples.
- **Returns:** [`Sound`](/api/costume-sound#sound) — the new sound.

Add a sound from raw audio bytes, stored under its `md5ext` like a costume.

### `target.removeSound(nameOrIndex)`

- **`nameOrIndex`**: `string | number`
- **Returns:** `boolean` — `true` if a sound was removed.

## Variables

Variables are stored by name; the library manages the underlying ids. A variable
on the [`Stage`](/api/stage) is global; one on a [`Sprite`](/api/sprite) is local.

### `target.variableNames`

- **Type:** `string[]` (getter) — names of this target's variables.

### `target.getVariable(name)`

- **`name`**: `string`
- **Returns:** `string | number | boolean | undefined`

Read a variable's value by name.

### `target.setVariable(name, value)`

- **`name`**: `string`
- **`value`**: `string | number | boolean`
- **Returns:** `string` — the variable's id.

Create **or** update a variable by name (an upsert). Returns the id, which you
rarely need.

### `target.deleteVariable(name)`

- **`name`**: `string`
- **Returns:** `boolean` — `true` if a variable was deleted.

## Lists

### `target.listNames`

- **Type:** `string[]` (getter) — names of this target's lists.

### `target.getList(name)`

- **`name`**: `string`
- **Returns:** `Array<string | number> | undefined`

Read a list's contents by name.

### `target.setList(name, items?)`

- **`name`**: `string`
- **`items`**: `Array<string | number>` _(default `[]`)_
- **Returns:** `string` — the list's id.

Create or **replace** a list by name.

### `target.deleteList(name)`

- **`name`**: `string`
- **Returns:** `boolean` — `true` if a list was deleted.

## Blocks

### `target.blocks`

- **Type:** `object` (getter)

The raw `blocks` object for advanced scripting edits. Keys are block ids; values
are block definitions. Mutate it directly for low-level script changes — generate
fresh ids with [`uid()`](/api/utilities#uid). See
[Authoring scripts](/guide/building-from-scratch#authoring-scripts).

## Subclasses

`Target` is never used directly. See:

- [`Sprite`](/api/sprite) — adds `x`, `y`, `size`, `direction`, `visible`,
  `draggable`, `rotationStyle`, `layerOrder`.
- [`Stage`](/api/stage) — adds `tempo`, `videoState`, `videoTransparency`,
  `broadcastNames`, `addBroadcast`.
