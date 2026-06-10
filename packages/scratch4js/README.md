# scratch4js

Read and edit Scratch **`.sb3`** projects with a small, declarative API.

An `.sb3` file is just a zip containing a `project.json` (the stage, the
sprites, their scripts) plus the costume and sound files it references.
scratch4js wraps that with plain objects you can read and mutate, then zip back
up. It uses [`@turbowarp/jszip`](https://github.com/TurboWarp/jszip) for fast
(de)compression and pure JSON for everything else — no Scratch VM, no DOM.

Works in Node and the browser. Written in plain JS with JSDoc types.

## Install

```bash
pnpm add scratch4js
```

## Quick start

```js
import { Project } from 'scratch4js';
import { readFile, writeFile } from 'node:fs/promises';

// Load an .sb3 from its bytes.
const project = await Project.load(await readFile('game.sb3'));

// Edit sprites declaratively.
const cat = project.sprite('Sprite1');
cat.x = 0;
cat.y = -20;
cat.size = 150;
cat.visible = true;

// Variables, lists and broadcasts.
project.stage.setVariable('score', 0);
project.stage.setList('inventory', ['sword', 'shield']);
project.stage.addBroadcast('game over');

// Save back to .sb3 bytes.
await writeFile('game.edited.sb3', await project.save());
```

In the browser, `Project.load` accepts an `ArrayBuffer`/`Uint8Array` (e.g. from a
file input) and `save()` returns a `Uint8Array` you can wrap in a `Blob`.

## API

### `Project`

| Member                                          | Description                                            |
| ----------------------------------------------- | ------------------------------------------------------ |
| `await Project.load(bytes)`                     | Parse an `.sb3` (`Uint8Array`/`ArrayBuffer`/`Buffer`). |
| `Project.create()`                              | A new, empty project with a bare stage.                |
| `project.stage`                                 | The `Stage` target.                                    |
| `project.sprites`                               | Array of `Sprite` targets.                             |
| `project.targets`                               | Every target, stage included.                          |
| `project.sprite(name)` / `project.target(name)` | Look up by name.                                       |
| `project.addSprite(name, props?)`               | Add a sprite (give it a costume before use).           |
| `project.removeSprite(name)`                    | Remove a sprite; drops assets it solely owned.         |
| `project.meta` / `monitors` / `extensions`      | Raw project-level fields.                              |
| `await project.save({ compressionLevel })`      | Serialize to `.sb3` bytes.                             |

### `Sprite` / `Stage` (extend `Target`)

Shared `Target` accessors: `name`, `volume`, `costumes`, `currentCostume`,
`sounds`, and the raw `blocks` object.

- **Costumes & sounds:** `getCostume(name)`, `addCostume(name, bytes, opts?)`,
  `removeCostume(nameOrIndex)`, and the matching `getSound` / `addSound` /
  `removeSound`. Asset bytes are stored under their MD5 automatically, and the
  file type is sniffed from the bytes (override with `opts.dataFormat`).
- **Variables & lists:** `getVariable(name)`, `setVariable(name, value)`,
  `deleteVariable(name)`, `variableNames`, plus `getList` / `setList` /
  `deleteList` / `listNames`.

`Sprite` adds: `x`, `y`, `size`, `direction`, `visible`, `draggable`,
`rotationStyle`, `layerOrder`.

`Stage` adds: `tempo`, `videoState`, `videoTransparency`, `broadcastNames`, and
`addBroadcast(name)`.

### `Costume` / `Sound`

`name`, `dataFormat`, `md5ext`, and `data` (the raw bytes). Assigning to `data`
re-hashes and rewrites `assetId`/`md5ext`. Costumes also expose
`rotationCenterX/Y` and `bitmapResolution`; sounds expose `rate` and
`sampleCount`.

### Utilities

`md5(bytes)`, `uid()` (Scratch-style id), and `sniffFormat(bytes)` are exported
for convenience.

## Example: swap a costume's image

```js
import { Project } from 'scratch4js';
import { readFile, writeFile } from 'node:fs/promises';

const project = await Project.load(await readFile('game.sb3'));

const cat = project.sprite('Sprite1');
cat.getCostume('costume1').data = await readFile('new-cat.png');
cat.addSound('boop', await readFile('boop.wav'));

await writeFile('game.edited.sb3', await project.save());
```

## Develop

```bash
pnpm install
pnpm run build   # bundle to dist/ (esm, cjs, umd)
pnpm run dev     # watch mode
pnpm run lint
pnpm run format
```
