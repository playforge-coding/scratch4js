// 02 — Arrange sprites declaratively
//
// Lay every sprite out evenly around a circle in the middle of the stage, point
// each one toward the center, and scale them to a uniform size. Shows the
// Sprite position/size/orientation accessors and saving back to a new .sb3.
//
//   node examples/02-arrange-sprites.js
// → writes examples/out/arranged.sb3

import { Project } from 'scratch4js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sb3 = fileURLToPath(new URL('../example.sb3', import.meta.url));
const project = await Project.load(await readFile(sb3));

const sprites = project.sprites;
const radius = 120;

sprites.forEach((sprite, i) => {
  const angle = (i / sprites.length) * 2 * Math.PI;
  sprite.x = Math.round(Math.cos(angle) * radius);
  sprite.y = Math.round(Math.sin(angle) * radius);
  sprite.size = 75;
  sprite.visible = true;

  // Face the center of the stage. Scratch directions are clockwise from "up",
  // so convert the math-angle (counter-clockwise from +x) accordingly.
  sprite.direction = Math.round(90 - (angle * 180) / Math.PI + 180) % 360;

  console.log(
    `${sprite.name.padEnd(10)} → (${sprite.x}, ${sprite.y}) dir ${sprite.direction}°`,
  );
});

const outDir = fileURLToPath(new URL('./out/', import.meta.url));
await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}arranged.sb3`, await project.save());
console.log(`\nSaved ${sprites.length} sprites → examples/out/arranged.sb3`);
