---
title: Costumes & sounds
description: Add, swap, export and share the binary media a target owns.
---

# Costumes & sounds

Costumes (images) and sounds (audio) are the two kinds of media a target owns.
They behave almost identically, so most of what follows applies to both.

## Listing and finding

```js
const cat = project.sprite('Sprite1');

cat.costumes; // Costume[] in order
cat.currentCostume; // index of the selected costume
cat.getCostume('costume1'); // a Costume by name, or undefined

cat.sounds; // Sound[]
cat.getSound('meow'); // a Sound by name, or undefined
```

## Adding media from bytes

Pass a name and the raw bytes. The file type is sniffed from the bytes, the
asset is stored under its MD5, and a new entry pointing at it is appended:

```js
import { readFile } from 'node:fs/promises';

cat.addCostume('hat', await readFile('hat.png'));
cat.addSound('boop', await readFile('boop.wav'));
```

### Costume options

[`addCostume`](/api/target#addcostume) accepts an options object:

```js
cat.addCostume('logo', svgBytes, {
  dataFormat: 'svg', // override the sniffed type
  rotationCenterX: 24, // anchor point, in costume pixels (default 0)
  rotationCenterY: 24,
  bitmapResolution: 1, // 1 for SVG, 2 for HD bitmaps (the default for non-SVG)
});
```

The **rotation center** is the point a sprite rotates and is positioned around.
For a centred costume, set it to half the image's width and height.

### Sound options

[`addSound`](/api/target#addsound) takes `dataFormat`, `rate` (sample rate in Hz,
default `48000`) and `sampleCount` (default `0`).

## Swapping a costume's image

Assign new bytes to a costume's [`data`](/api/costume-sound#data) to replace the
picture while keeping the costume's name and place in the list. The asset is
automatically re-hashed:

```js
cat.getCostume('costume1').data = await readFile('new-cat.png');
```

::: tip Match the format
`data` keeps the costume's existing `dataFormat`. To swap a PNG for an SVG,
remove the old costume and `addCostume` the new one instead, so the file
extension stays correct.
:::

## Exporting media

`data` is the raw `Uint8Array`, so writing a costume or sound to disk is just:

```js
await writeFile('costume1.png', cat.getCostume('costume1').data);
```

## Sharing assets between targets

Because assets are keyed by content hash, two targets that hold bytes with the
same MD5 transparently share one file in the zip. A common pattern is to copy one
costume's bytes onto another sprite:

```js
const shared = cat.getCostume('costume1').data;
project.sprite('Sprite2').addCostume('catCopy', shared);
```

When you later remove one of them, the shared bytes survive until the **last**
reference is gone.

## Removing media

```js
cat.removeCostume('hat'); // by name
cat.removeCostume(0); // or by index
cat.removeSound('boop');
```

Removing a costume that was the selected one clamps `currentCostume` back into
range. The underlying bytes are dropped only if nothing else references them.

## Costume vs. sound properties

|        | Costume                                                  | Sound                                  |
| ------ | -------------------------------------------------------- | -------------------------------------- |
| Shared | `name`, `dataFormat`, `md5ext`, `data`                   | `name`, `dataFormat`, `md5ext`, `data` |
| Extra  | `rotationCenterX`, `rotationCenterY`, `bitmapResolution` | `rate`, `sampleCount`                  |

See the [`Costume` / `Sound` reference](/api/costume-sound) for full details.

## Next steps

- [Variables, lists & broadcasts](/guide/variables-lists-broadcasts)
- [Building a project from scratch](/guide/building-from-scratch)
