---
title: Utilities
description: The standalone helpers — md5, uid and sniffFormat.
---

# Utilities

Three standalone helpers are exported for convenience. The library uses them
internally; they are exposed because they are handy when working with the same
formats by hand.

```js
import { md5, uid, sniffFormat } from 'scratch4js';
```

## `md5(input)` {#md5}

- **`input`**: `Uint8Array | ArrayBuffer` — bytes to hash.
- **Returns:** `string` — 32-character lowercase hex digest.

Compute the lowercase hex MD5 digest of some bytes. This is a dependency-free,
pure-JS implementation of RFC 1321 that runs identically in Node and the browser.
Scratch names asset files by the MD5 of their bytes, which is why the library
needs it — and why `md5(bytes)` matches the `assetId` of a costume/sound holding
those same bytes.

```js
md5(new Uint8Array([1, 2, 3]));
// → '5289df737df57326fcdd22597afb1fac'
```

## `uid()` {#uid}

- **Returns:** `string` — a fresh 20-character Scratch-style id.

Generate a unique id drawn from the same character "soup" Scratch uses for
blocks, variables, lists and broadcasts, so generated ids look native and stay
clear of JSON-unsafe characters. Use it when writing raw
[`blocks`](/api/target#blocks) or other id-keyed entries by hand.

```js
const id = uid(); // e.g. 'p!Qm,4@z.b{Tn]Wc#3rh'
```

::: tip
Ids are random per call. The library's `setVariable` / `setList` /
`addBroadcast` already mint ids for you — reach for `uid()` only for low-level
edits the typed API doesn't cover, such as authoring blocks.
:::

## `sniffFormat(bytes)` {#sniffformat}

- **`bytes`**: `Uint8Array` — the asset contents.
- **Returns:** `string | undefined` — the detected `dataFormat`, or `undefined`
  if unknown.

Guess a Scratch `dataFormat` (file extension) from raw asset bytes by inspecting
their leading bytes. Recognises:

| Format | Detected from                                             |
| ------ | --------------------------------------------------------- |
| `png`  | PNG signature `89 50 4E 47`                               |
| `jpg`  | JPEG signature `FF D8 FF`                                 |
| `gif`  | `GIF` magic                                               |
| `wav`  | `RIFF` magic                                              |
| `mp3`  | `ID3` tag or an MPEG audio frame sync                     |
| `svg`  | a leading XML prolog or `<svg` tag in the first 256 bytes |

This is what lets [`addCostume`](/api/target#addcostume) and
[`addSound`](/api/target#addsound) accept a bare buffer without you spelling out
`dataFormat`. When detection fails they fall back to `png` / `wav` respectively;
pass `options.dataFormat` to be explicit.

```js
sniffFormat(pngBytes); // 'png'
sniffFormat(unknown); // undefined
```
