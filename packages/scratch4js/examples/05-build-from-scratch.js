// 05 — Build a project from scratch
//
// Start from an empty project (no example.sb3 needed), generate an SVG costume
// in code, attach it to a new sprite, give the stage a backdrop, set some
// state, and save a fully valid .sb3 you can open in Scratch / TurboWarp.
//
//   node examples/05-build-from-scratch.js
// → writes examples/out/generated.sb3

import { Project } from 'scratch4js';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// A tiny SVG costume built as a string. sniffFormat detects `svg` from the
// markup, so we don't have to pass dataFormat — but we set the rotation center
// to the middle of the 100×100 canvas so the sprite spins about its center.
const circle = (color) =>
  new TextEncoder().encode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">` +
      `<circle cx="50" cy="50" r="45" fill="${color}"/></svg>`,
  );

const project = Project.create();

// Give the bare stage a backdrop so the editor has something to show.
project.stage.addCostume('backdrop', circle('#1e293b'), {
  rotationCenterX: 50,
  rotationCenterY: 50,
});

// Add three colored "ball" sprites in a row, each with its own costume.
const colors = ['#ef4444', '#22c55e', '#3b82f6'];
colors.forEach((color, i) => {
  const ball = project.addSprite(`ball-${i + 1}`, {
    x: -120 + i * 120,
    y: 0,
    size: 80,
  });
  ball.addCostume('ball', circle(color), {
    rotationCenterX: 50,
    rotationCenterY: 50,
  });
  ball.setVariable('hits', 0);
});

project.stage.setVariable('score', 0);
project.stage.addBroadcast('start');

console.log(`Built project with ${project.targets.length} targets:`);
for (const t of project.targets) {
  console.log(
    `  ${t.isStage ? 'Stage ' : 'Sprite'} ${t.name} — costume "${t.costumes[0].name}"`,
  );
}
console.log(`Assets stored: ${project.assets.size}`);

const outDir = fileURLToPath(new URL('./out/', import.meta.url));
await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}generated.sb3`, await project.save());
console.log('\nSaved → examples/out/generated.sb3');
