---
title: Sprites & the stage
description: Look up, reposition, add and remove targets.
---

# Working with sprites & the stage

Targets are the heart of a project. This guide covers the task-level workflows;
for an exhaustive member list see the [`Sprite`](/api/sprite),
[`Stage`](/api/stage) and [`Target`](/api/target) references.

## Finding targets

```js
project.stage; // the single Stage
project.sprites; // Sprite[] in array order
project.targets; // every target, stage included

project.sprite('Sprite1'); // a Sprite by name, or undefined
project.target('Stage'); // any target (sprite or stage) by name
```

`sprite()` only matches sprites; `target()` matches the stage too. Each call
returns a fresh wrapper over the same underlying JSON.

## Moving and styling a sprite

A `Sprite` exposes its spatial state as plain properties. Read or assign them
directly:

```js
const cat = project.sprite('Sprite1');

cat.x = 120; // −240…240
cat.y = -40; // −180…180
cat.size = 150; // percent; 100 = original
cat.direction = 90; // degrees; 90 = pointing right
cat.visible = true;
cat.draggable = false;
cat.rotationStyle = 'all around'; // 'all around' | 'left-right' | "don't rotate"
cat.layerOrder = 3; // higher draws on top
```

Every setter coerces its input (`Number(...)`, `Boolean(...)`, `String(...)`), so
assigning `cat.x = '120'` is safe.

## Stacking order

`layerOrder` controls which sprite draws on top — higher is nearer the front.
When you [`addSprite`](/api/project#addsprite), it is automatically given a layer
above every existing target, so new sprites appear in front by default.

## The stage

The stage is a target too, so it shares all the costume/sound/variable/list
machinery. It adds a few stage-only properties:

```js
const { stage } = project;

stage.tempo = 120; // BPM for music blocks
stage.videoState = 'off'; // 'on' | 'off' | 'on-flipped'
stage.videoTransparency = 50; // 0…100
```

The stage's "costumes" are the project's **backdrops** — add and remove them
exactly like sprite costumes (see [Costumes & sounds](/guide/costumes-and-sounds)).

## Adding a sprite

```js
const star = project.addSprite('Star', { x: -100, y: 60, size: 80 });
star.addCostume('star', await readFile('star.svg')); // give it a costume!
```

::: warning Give new sprites a costume
A sprite created by `addSprite` starts with **no costumes**. Scratch and
TurboWarp expect every sprite to have at least one, so add one with
[`addCostume`](/api/target#addcostume) before opening the project in an editor.
:::

The optional second argument lets you override any initial property (`x`, `y`,
`size`, `direction`, `visible`, …). Names must be unique among sprites — adding a
duplicate name throws.

## Renaming and removing

```js
cat.name = 'Hero'; // rename in place

project.removeSprite('Star'); // by name → true if removed
project.removeSprite(someSprite); // or by instance
```

Removing a sprite also drops any costume or sound bytes that **only it** used;
assets shared with another target are kept.

## Next steps

- [Costumes & sounds](/guide/costumes-and-sounds)
- [Variables, lists & broadcasts](/guide/variables-lists-broadcasts)
- [Building a project from scratch](/guide/building-from-scratch)
