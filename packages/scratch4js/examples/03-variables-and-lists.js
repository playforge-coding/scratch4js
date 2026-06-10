// 03 — Variables, lists and broadcasts
//
// Add a little game-state layer to the project: a stage-wide `score` variable,
// a `high scores` list, a per-sprite `health` variable, and a fresh broadcast.
// Demonstrates the get/set/delete helpers shared by Stage and Sprite.
//
//   node examples/03-variables-and-lists.js
// → writes examples/out/with-state.sb3

import { Project } from 'scratch4js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sb3 = fileURLToPath(new URL('../example.sb3', import.meta.url));
const project = await Project.load(await readFile(sb3));

// Global state lives naturally on the stage.
project.stage.setVariable('score', 0);
project.stage.setVariable('level', 1);
project.stage.setList('high scores', [500, 320, 150]);

// setVariable is idempotent by name — calling it again updates in place.
project.stage.setVariable('score', 9001);

// Give every sprite its own local `health` variable.
for (const sprite of project.sprites) {
  sprite.setVariable('health', 100);
}

// Broadcasts are owned by the stage; addBroadcast is a no-op if it exists.
project.stage.addBroadcast('game over');
project.stage.addBroadcast('game over'); // deduped

console.log('Stage variables:', project.stage.variableNames);
console.log('  score =', project.stage.getVariable('score'));
console.log('Stage lists:    ', project.stage.listNames);
console.log('  high scores =', project.stage.getList('high scores'));
console.log('Broadcasts:     ', project.stage.broadcastNames);
console.log('girl.health =', project.sprite('girl').getVariable('health'));

const outDir = fileURLToPath(new URL('./out/', import.meta.url));
await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}with-state.sb3`, await project.save());
console.log('\nSaved → examples/out/with-state.sb3');
