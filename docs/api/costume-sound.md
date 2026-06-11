---
title: Costume & Sound
description: The two kinds of media a target owns, and how their bytes are addressed by content hash.
---

# `Costume` & `Sound`

Costumes and sounds are the two kinds of media a target owns. Both wrap a raw
entry in `project.json` plus the bytes stored in the surrounding zip, keyed by
[`md5ext`](#md5ext). They share a (non-exported) `Asset` base, so the common
members are identical; only the format-specific extras differ.

Get them from a [`Target`](/api/target): `target.costumes`, `target.getCostume(name)`,
`target.sounds`, `target.getSound(name)`, or the return value of `addCostume` /
`addSound`.

## Shared members

These exist on both `Costume` and `Sound`.

### `asset.json`

- **Type:** `object` — the raw costume/sound entry from `project.json`.

### `asset.project`

- **Type:** [`Project`](/api/project) — the owning project, which holds the bytes.

### `asset.name`

- **Type:** `string` (get/set) — display name shown in the editor.

### `asset.dataFormat`

- **Type:** `string` (getter) — file extension/type, e.g. `png`, `svg`, `wav`,
  `mp3`. Read-only; to change the format, remove the media and re-add it.

### `asset.md5ext` {#md5ext}

- **Type:** `string` (getter) — the `<md5>.<ext>` filename of this asset inside
  the zip, and its key in [`project.assets`](/api/project#project-assets).

### `asset.data` {#data}

- **Type:** `Uint8Array | undefined` (get/set)

The raw bytes of this asset, read from / written to the project's zip.

**Assigning** new bytes recomputes the MD5 and rewrites `assetId` / `md5ext`, so
the file is always addressed by the hash of its current contents. The old bytes
are dropped if nothing else references them. The `dataFormat` is **kept**, so the
new bytes should be the same type.

```js
// Export:
await writeFile('costume1.png', costume.data);

// Replace the image in place (keeps name and format):
costume.data = await readFile('new-cat.png');
```

## `Costume` {#costume}

An image (bitmap or SVG) a target can display. Adds three accessors on top of the
shared members.

### `costume.bitmapResolution`

- **Type:** `number` (get/set) — pixels per unit for bitmaps (1 for SVG, 2 for HD
  bitmaps). Default `1`.

### `costume.rotationCenterX`

- **Type:** `number` (get/set) — X of the rotation/anchor center, in costume
  pixels. Default `0`.

### `costume.rotationCenterY`

- **Type:** `number` (get/set) — Y of the rotation/anchor center, in costume
  pixels. Default `0`.

The **rotation center** is the point the sprite is positioned and rotates around.
For a centred costume, set it to half the image's width and height.

## `Sound` {#sound}

An audio clip a target can play. Adds two accessors on top of the shared members.

### `sound.rate`

- **Type:** `number` (get/set) — sample rate in Hz.

### `sound.sampleCount`

- **Type:** `number` (get/set) — number of samples in the clip.

## Why content hashing matters

Because `md5ext` is derived from the bytes, two costumes or sounds with identical
content share one file in the zip automatically. scratch4js drops an asset's bytes
only when the **last** costume or sound referencing it goes away — so replacing
one costume's `data`, or removing one of two sprites that share an image, never
corrupts the other. See [Core concepts](/guide/concepts#assets-are-addressed-by-content-hash).
