---
title: Building from scratch
description: Create a valid .sb3 entirely from code with Project.create().
---

# Building a project from scratch

[`Project.create()`](/api/project#project-create) returns a valid, empty project
with a bare stage and nothing else. From there you can assemble a complete `.sb3`
in code.

## A minimal project

```js
import { Project } from 'scratch4js';
import { writeFile } from 'node:fs/promises';

const project = Project.create();

// A simple SVG costume, authored inline.
const circle = new TextEncoder().encode(
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">
     <circle cx="24" cy="24" r="20" fill="#ff8c1a" />
   </svg>`,
);

// Give the stage a backdrop and add a sprite with a costume.
project.stage.addCostume('backdrop1', circle, { dataFormat: 'svg' });

const ball = project.addSprite('Ball', { x: 0, y: 0, size: 100 });
ball.addCostume('ball', circle, {
  dataFormat: 'svg',
  rotationCenterX: 24,
  rotationCenterY: 24,
});

// Some data to go with it.
project.stage.setVariable('score', 0);
project.stage.addBroadcast('start');

await writeFile('new-project.sb3', await project.save());
```

Open the result in [TurboWarp](https://turbowarp.org) or the Scratch editor — it
will load as a real, editable project.

## Checklist for a valid project

- **Every sprite needs at least one costume.** A costume-less sprite confuses the
  editor. The stage should have at least one backdrop.
- **Set a sensible rotation center** on costumes (typically half the image's
  width and height) so sprites rotate around their middle.
- **`dataFormat` matters for text assets.** SVGs are text, so sniffing usually
  works, but passing `dataFormat: 'svg'` explicitly is the safe choice when you
  generate them inline.

## Authoring scripts

scratch4js does not include a high-level block-builder. To add scripts, write
into the target's raw [`blocks`](/api/target#blocks) object using the Scratch
block format (block ids → block definitions). Generate fresh ids with
[`uid()`](/api/utilities#uid):

```js
import { uid } from 'scratch4js';

const hatId = uid();
ball.blocks[hatId] = {
  opcode: 'event_whenflagclicked',
  next: null,
  parent: null,
  inputs: {},
  fields: {},
  topLevel: true,
  x: 0,
  y: 0,
};
```

Building large scripts this way is verbose; for that workload consider editing an
existing project as a template, or driving the editor through the
[MCP server](/guide/mcp-server).

## Next steps

- [Using scratch4js in the browser](/guide/browser-usage)
- [`Project` API reference](/api/project)
