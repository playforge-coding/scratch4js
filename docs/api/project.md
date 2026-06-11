---
title: Project
description: The Project class — load, save, inspect and reshape an .sb3.
---

# `Project`

A loaded Scratch project (`.sb3`). An sb3 is a zip holding a `project.json`
description plus the costume/sound asset files it references. `Project` is the
entry point: load bytes, edit declaratively through [`Stage`](/api/stage) and
[`Sprite`](/api/sprite), then save back to bytes.

```js
import { Project } from 'scratch4js';

const project = await Project.load(bytes);
project.sprite('Sprite1').x = 0;
const out = await project.save();
```

## Instance fields

A `Project` holds exactly the two things an sb3 zip contains.

### `project.json`

- **Type:** `object`

The parsed `project.json`. Fully mutable; every accessor on `Project`,
`Target` and the asset classes reads and writes through it. You can reach into it
directly for fields the typed API doesn't cover.

### `project.assets` {#project-assets}

- **Type:** `Map<string, Uint8Array>`

Asset bytes keyed by `md5ext` (`<md5>.<ext>`, e.g. `b7f1cf69….wav`). This is the
set of files written alongside `project.json` when you [`save()`](#project-save).

## Static methods

### `Project.load(data)` {#project-load}

- **`data`**: `Uint8Array | ArrayBuffer | Buffer` — the sb3 zip bytes.
- **Returns:** `Promise<Project>`
- **Throws:** if `project.json` is missing from the zip.

Parse a project from the raw bytes of an `.sb3` file. The zip is decompressed,
`project.json` is parsed, and every other file is read into
[`project.assets`](#project-assets).

```js
import { readFile } from 'node:fs/promises';
const project = await Project.load(await readFile('game.sb3'));
```

### `Project.create()` {#project-create}

- **Returns:** `Project`

Create a new, empty project containing just a bare stage (named `Stage`, with
default volume, tempo and video settings). The starting point for
[building a project from scratch](/guide/building-from-scratch).

```js
const project = Project.create();
project.addSprite('Hero').addCostume('hero', svgBytes);
```

## Accessors

### `project.stage` {#project-stage}

- **Type:** [`Stage`](/api/stage) (getter)

The project's single stage.

### `project.sprites`

- **Type:** [`Sprite[]`](/api/sprite) (getter)

All non-stage targets, in array order.

### `project.targets`

- **Type:** `Array<Stage | Sprite>` (getter)

Every target, the stage included.

### `project.meta`

- **Type:** `ProjectMeta` (getter)

The project's `meta` block:

| Field    | Type     | Description                                    |
| -------- | -------- | ---------------------------------------------- |
| `semver` | `string` | Scratch project schema version (e.g. `3.0.0`). |
| `vm`     | `string` | VM version that wrote the project.             |
| `agent`  | `string` | User-agent string of the editor, if any.       |

### `project.monitors` {#monitors}

- **Type:** `object[]` (getter)

The raw `monitors` array — the on-stage variable/list watchers. Exposed raw;
mutate directly to add or change a watcher.

### `project.extensions`

- **Type:** `string[]` (getter)

Ids of enabled extensions (e.g. `pen`, `music`).

## Methods

### `project.sprite(name)` {#project-sprite}

- **`name`**: `string`
- **Returns:** [`Sprite`](/api/sprite) `| undefined`

Find a sprite by name. Does **not** match the stage.

### `project.target(name)`

- **`name`**: `string`
- **Returns:** [`Stage`](/api/stage) `|` [`Sprite`](/api/sprite) `| undefined`

Find any target — sprite or stage — by name.

```js
project.target('Stage'); // the stage
project.target('Sprite1'); // a sprite
```

### `project.addSprite(name, props?)` {#addsprite}

- **`name`**: `string` — must be unique among sprites.
- **`props`**: `object` _(optional)_ — initial property overrides (`x`, `y`,
  `size`, `direction`, `visible`, …).
- **Returns:** [`Sprite`](/api/sprite) — the new sprite.
- **Throws:** if a sprite with that name already exists.

Add a new, empty sprite. It is placed on a layer above every existing target. It
starts with **no costumes**, so add at least one with
[`addCostume`](/api/target#addcostume) before opening the project in an editor.

```js
const star = project.addSprite('Star', { x: -100, y: 60, size: 80 });
star.addCostume('star', svgBytes);
```

### `project.removeSprite(nameOrSprite)`

- **`nameOrSprite`**: `string |` [`Sprite`](/api/sprite)
- **Returns:** `boolean` — `true` if a sprite was removed.

Remove a sprite by name or instance. Costume and sound bytes the sprite **solely
owned** are dropped; assets shared with another target are kept.

### `project.save(options?)` {#project-save}

- **`options.compressionLevel`**: `number` _(default `6`)_ — DEFLATE level, 1–9.
- **Returns:** `Promise<Uint8Array>` — the sb3 zip bytes.

Serialize the project back into `.sb3` bytes: `project.json` is stringified and
written, then every entry of [`project.assets`](#project-assets) is added, and the
whole thing is DEFLATE-compressed.

```js
await writeFile('out.sb3', await project.save({ compressionLevel: 9 }));
```

## Asset cleanup {#asset-cleanup}

Internally, removing or replacing media calls a private `_maybeDropAsset(md5ext)`
helper that deletes an asset's bytes **only if no costume or sound anywhere still
references them**. You never call it directly, but it is why removing one of two
sprites that share an image does not break the other.

## Constructor

```js
new Project(json, assets?)
```

- **`json`**: `object` — a parsed `project.json`.
- **`assets`**: `Map<string, Uint8Array>` _(default empty)_ — asset bytes keyed
  by `md5ext`.

Prefer [`Project.load`](#project-load) or [`Project.create`](#project-create).
Construct directly only when you already hold a parsed `project.json` and its
asset bytes.
