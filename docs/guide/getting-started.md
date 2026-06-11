---
title: Getting started
description: Install scratch4js and make your first edit to an .sb3 project.
---

# Getting started

## Install

```bash
pnpm add scratch4js
# or
npm install scratch4js
# or
yarn add scratch4js
```

scratch4js ships ESM, CJS and UMD builds and bundles its only runtime
dependency, [`@turbowarp/jszip`](https://github.com/TurboWarp/jszip). It requires
**Node 18 or newer** (or any modern browser).

## Your first edit

Load a project from its bytes, change a sprite, and save it back:

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

Open `game.edited.sb3` in [TurboWarp](https://turbowarp.org) or the Scratch
editor to see the changes.

## The shape of the API

Almost everything flows through four kinds of object:

| Object                                                                        | What it represents                                               |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [`Project`](/api/project)                                                     | The whole `.sb3`: load, save, look up and add/remove sprites.    |
| [`Stage`](/api/stage) / [`Sprite`](/api/sprite)                               | A single **target** — its costumes, sounds, variables and lists. |
| [`Costume`](/api/costume-sound#costume) / [`Sound`](/api/costume-sound#sound) | A piece of media owned by a target.                              |

`Stage` and `Sprite` both extend a shared [`Target`](/api/target) base class, so
costumes, sounds, variables and lists work the same way on either one.

## Editing model

Every accessor reads from and writes straight through to the underlying
`project.json` — there is no separate "commit" step. A `Sprite` or `Costume`
instance is a thin, **stateless wrapper** created on demand: calling
`project.sprite('Sprite1')` twice gives you two wrappers over the _same_ JSON, so
edits through either are always consistent. Your changes are only persisted to
disk when you call [`project.save()`](/api/project#project-save).

## Running the examples

The repository ships runnable example scripts that exercise the library against
a bundled `example.sb3`:

```bash
git clone https://github.com/playforge-coding/scratch4js
cd scratch4js
pnpm install
pnpm build                       # examples import the built package
node packages/scratch4js/examples/01-inspect.js
```

| Script                      | What it shows                                      |
| --------------------------- | -------------------------------------------------- |
| `01-inspect.js`             | Print a report of every target, costume and sound. |
| `02-arrange-sprites.js`     | Reposition, resize and reorient sprites.           |
| `03-variables-and-lists.js` | Variables, lists and broadcasts.                   |
| `04-costumes-and-sounds.js` | Export, swap and share binary assets.              |
| `05-build-from-scratch.js`  | Build a valid `.sb3` from `Project.create()`.      |

## Next steps

- [Core concepts](/guide/concepts) — understand the data model.
- [Working with sprites & the stage](/guide/sprites-and-stage).
- [API reference](/api/overview).
