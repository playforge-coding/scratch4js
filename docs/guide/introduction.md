---
title: Introduction
description: What scratch4js is, what it does, and when to reach for it.
---

# Introduction

**scratch4js** reads and edits Scratch **`.sb3`** projects with a small,
declarative JavaScript API. Load the bytes of a project, mutate its stage and
sprites through plain getters and setters, then save back to bytes.

## What is an `.sb3`?

An `.sb3` file is just a **zip** containing:

- a `project.json` — the description of the stage, the sprites, their scripts,
  variables, lists and broadcasts; and
- the **costume and sound files** that `project.json` references, each stored
  under a filename derived from the MD5 hash of its contents (e.g.
  `b7f1cf69….svg`).

scratch4js wraps that structure with plain objects you can read and mutate, then
zips it back up. It uses [`@turbowarp/jszip`](https://github.com/TurboWarp/jszip)
for fast (de)compression and pure JSON for everything else — **no Scratch VM, no
DOM, no headless browser**.

## What you can do

- Inspect every target, costume, sound, variable and list in a project.
- Reposition, resize and reorient sprites.
- Add, replace and remove costumes and sounds from raw image/audio bytes.
- Create or update variables, lists and broadcasts.
- Build a brand-new, valid project from scratch with [`Project.create()`](/api/project#project-create).
- Do all of the above in **Node or the browser**.

## What it is _not_

scratch4js is a **format library**, not a runtime. It does not execute scripts,
render the stage, or interpret blocks. For low-level script edits you have direct
access to the raw [`blocks`](/api/target#blocks) object, but the library does not
provide a high-level block-authoring DSL.

## How it is built

The library is plain JavaScript with [JSDoc](https://jsdoc.app/) types, bundled
with [Rslib](https://rslib.rs/) into three outputs:

| Output | Path       | For                                     |
| ------ | ---------- | --------------------------------------- |
| ESM    | `dist/esm` | Modern bundlers and Node `import`       |
| CJS    | `dist/cjs` | Node `require`                          |
| UMD    | `dist/umd` | Browser `<script>` tags (jszip inlined) |

`.d.ts` declaration files are emitted from the JSDoc, so you get full
intellisense even though the source is `.js`.

## Next steps

- [Get started](/guide/getting-started) — install and make your first edit.
- [Core concepts](/guide/concepts) — the data model behind the API.
- [API reference](/api/overview) — every class, method and property.
