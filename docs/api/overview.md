---
title: API overview
description: The full public surface of scratch4js at a glance.
---

# API overview

Everything below is exported from the package root:

```js
import {
  Project,
  Target,
  Stage,
  Sprite,
  Costume,
  Sound,
  md5,
  uid,
  sniffFormat,
} from 'scratch4js';
```

## Exports

| Export                                      | Kind             | Summary                                                                            |
| ------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| [`Project`](/api/project)                   | class            | A loaded `.sb3`: load, save, look up and add/remove sprites.                       |
| [`Target`](/api/target)                     | class (abstract) | Shared base for the stage and sprites: costumes, sounds, variables, lists, blocks. |
| [`Sprite`](/api/sprite)                     | class            | A movable target with position, size and orientation.                              |
| [`Stage`](/api/stage)                       | class            | The single backdrop-bearing target; owns broadcasts.                               |
| [`Costume`](/api/costume-sound#costume)     | class            | An image a target can display.                                                     |
| [`Sound`](/api/costume-sound#sound)         | class            | An audio clip a target can play.                                                   |
| [`md5`](/api/utilities#md5)                 | function         | Lowercase hex MD5 digest of some bytes.                                            |
| [`uid`](/api/utilities#uid)                 | function         | A fresh 20-character Scratch-style id.                                             |
| [`sniffFormat`](/api/utilities#sniffformat) | function         | Guess an asset's `dataFormat` from its bytes.                                      |

## Class hierarchy

```
Project                       // owns json + assets
Target (abstract)
 ├─ Stage                     // tempo, video, broadcasts
 └─ Sprite                    // x, y, size, direction, ...
Asset (abstract, not exported)
 ├─ Costume                   // rotationCenter, bitmapResolution
 └─ Sound                     // rate, sampleCount
```

## Conventions

These hold across the whole API:

- **Bytes** are `Uint8Array | ArrayBuffer` (and `Buffer` in Node). Inputs are
  normalised to `Uint8Array`; outputs are always `Uint8Array`.
- **Wrappers are stateless.** `Stage`, `Sprite`, `Costume` and `Sound` instances
  are thin views over `project.json` / `project.assets`. Creating one is cheap,
  and two wrappers over the same entry always agree.
- **Lookups return `undefined`** when nothing matches (e.g. `sprite()`,
  `getCostume()`); **removals return `boolean`**.
- **Setters coerce** their input (`Number`, `Boolean`, `String`) so loosely-typed
  values are safe to assign.
- **Async only where I/O happens** — [`Project.load`](/api/project#project-load)
  and [`project.save`](/api/project#project-save) are `Promise`-returning;
  everything else is synchronous.

## TypeScript

The package ships `.d.ts` declarations generated from the source JSDoc, so all of
the above is fully typed with no extra `@types` package.
