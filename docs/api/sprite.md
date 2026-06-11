---
title: Sprite
description: A movable target with position, size and orientation.
---

# `Sprite`

A sprite: a movable target with a position, size and orientation. Extends
[`Target`](/api/target), so it has all the costume, sound, variable, list and
block members documented there — this page covers only the sprite-specific
additions.

```js
const cat = project.sprite('Sprite1');
cat.x = 120;
cat.size = 150;
cat.direction = 45;
```

Get a sprite from [`project.sprite(name)`](/api/project#project-sprite),
[`project.sprites`](/api/project), or [`project.addSprite(...)`](/api/project#addsprite).

## Accessors

All are get/set, all coerce on assignment, and all read through to
`sprite.json`.

### `sprite.isStage`

- **Type:** `false` (getter) — always `false`. Discriminates `Sprite` from
  [`Stage`](/api/stage) in the union.

### `sprite.x`

- **Type:** `number` — X position on the stage (−240…240). Default `0`.

### `sprite.y`

- **Type:** `number` — Y position on the stage (−180…180). Default `0`.

### `sprite.size`

- **Type:** `number` — size as a percentage (100 = original). Default `100`.

### `sprite.direction`

- **Type:** `number` — direction in degrees (90 = pointing right). Default `90`.

### `sprite.visible`

- **Type:** `boolean` — whether the sprite is shown. Default `true`.

### `sprite.draggable`

- **Type:** `boolean` — whether the sprite can be dragged in the player. Default
  `false`.

### `sprite.rotationStyle`

- **Type:** `string` — one of `all around`, `left-right`, `don't rotate`. Default
  `all around`.

### `sprite.layerOrder`

- **Type:** `number` — stacking order; higher draws on top. New sprites from
  [`addSprite`](/api/project#addsprite) are placed above every existing target.

## Inherited from `Target`

Name, volume, costumes, sounds, variables, lists and blocks all come from
[`Target`](/api/target). For example:

```js
cat.name = 'Hero';
cat.addCostume('hat', pngBytes);
cat.setVariable('lives', 3);
cat.setList('inventory', ['sword']);
```
