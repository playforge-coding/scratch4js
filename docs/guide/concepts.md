---
title: Core concepts
description: The .sb3 data model and how scratch4js maps it onto plain objects.
---

# Core concepts

Understanding a handful of ideas makes the whole API predictable.

## The project is a zip + a JSON

An `.sb3` is a zip with one `project.json` plus the binary assets it references.
scratch4js keeps exactly those two things on a [`Project`](/api/project):

```js
project.json; // the parsed project.json (plain object, fully mutable)
project.assets; // Map<string, Uint8Array> — asset bytes keyed by "<md5>.<ext>"
```

Everything else — `Stage`, `Sprite`, `Costume`, `Sound` — is a **thin wrapper**
that reads and writes into `project.json` or `project.assets`. The wrappers hold
no state of their own, so you can create them freely and throw them away.

## Targets: the stage and the sprites

`project.json.targets` is an array of **targets**. Exactly one is the
[`Stage`](/api/stage); the rest are [`Sprite`](/api/sprite)s. Both extend a shared
[`Target`](/api/target) base, so the things they have in common work identically:

- `name`, `volume`
- costumes: `costumes`, `getCostume`, `addCostume`, `removeCostume`
- sounds: `sounds`, `getSound`, `addSound`, `removeSound`
- variables: `variableNames`, `getVariable`, `setVariable`, `deleteVariable`
- lists: `listNames`, `getList`, `setList`, `deleteList`
- the raw `blocks` object

Only the differences live on the subclasses: a `Sprite` adds spatial properties
(`x`, `y`, `size`, `direction`, …); the `Stage` adds `tempo`, video settings, and
owns the project's broadcasts.

```
Project
 ├─ stage   : Stage   ── extends Target
 └─ sprites : Sprite[] ── each extends Target
```

## Assets are addressed by content hash

Scratch names each asset file by the **MD5 of its bytes** plus a file extension —
e.g. `b7f1cf69e2….svg`. That string is the asset's `md5ext`, and it is both the
key in `project.assets` and the link stored on a costume/sound entry.

scratch4js does the hashing for you:

- [`addCostume`](/api/target#addcostume) / [`addSound`](/api/target#addsound)
  hash the bytes, store them under their `md5ext`, and append an entry that
  points at them.
- Assigning to a costume's or sound's [`data`](/api/costume-sound#data)
  re-hashes the new bytes and rewrites its `assetId` / `md5ext`.
- When media is removed or replaced, the old bytes are dropped **only if no
  other costume or sound still references them** (see
  [`_maybeDropAsset`](/api/project#asset-cleanup)). Two sprites can safely share
  one image.

### Format sniffing

When you add media you usually don't need to name the file type — scratch4js
sniffs it from the leading bytes with [`sniffFormat`](/api/utilities#sniffformat)
(PNG, JPG, GIF, WAV, MP3 and SVG are recognised). Pass `options.dataFormat` to
override the guess.

## Variables and lists

In `project.json` a variable is stored as `id → [name, value]` and a list as
`id → [name, items]`. The library exposes these **by name** so you rarely touch
the ids:

```js
sprite.setVariable('lives', 3); // create or update by name
sprite.getVariable('lives'); // 3
sprite.deleteVariable('lives'); // by name
sprite.variableNames; // ['lives', ...]
```

`setVariable` / `setList` return the underlying id if you do need it. Variables
defined on the `Stage` are _global_ (visible to every sprite); variables on a
`Sprite` are local to it — exactly as in the Scratch editor.

## Nothing is saved until you say so

All edits mutate the in-memory `project.json` / `project.assets` immediately, but
the file on disk only changes when you call
[`project.save()`](/api/project#project-save), which serialises everything back
into `.sb3` zip bytes. `save()` is also where you choose the DEFLATE
`compressionLevel`.

## Next steps

- [Working with sprites & the stage](/guide/sprites-and-stage)
- [Costumes & sounds](/guide/costumes-and-sounds)
- [Variables, lists & broadcasts](/guide/variables-lists-broadcasts)
