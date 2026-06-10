// 01 — Inspect a project
//
// Load example.sb3 and print a readable report of everything inside it: the
// stage, every sprite, their costumes/sounds, variables/lists, and the
// project-level broadcasts and extensions. A read-only tour of the API.
//
//   node examples/01-inspect.js

import { Project } from 'scratch4js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sb3 = fileURLToPath(new URL('../example.sb3', import.meta.url));
const project = await Project.load(await readFile(sb3));

// `project.targets` yields the stage first, then every sprite.
console.log(`Project — ${project.targets.length} targets`);
console.log(`  meta: vm ${project.meta.vm}, semver ${project.meta.semver}`);
console.log(`  extensions: ${project.extensions.join(', ') || '(none)'}`);
console.log(
  `  broadcasts: ${project.stage.broadcastNames.join(', ') || '(none)'}`,
);
console.log();

for (const target of project.targets) {
  const kind = target.isStage ? 'Stage' : 'Sprite';
  console.log(`${kind}: ${target.name}`);

  // Sprites carry a position, size and orientation; the stage does not.
  if (!target.isStage) {
    console.log(
      `  at (${target.x}, ${target.y}), size ${target.size}%, ` +
        `dir ${target.direction}°, ${target.visible ? 'visible' : 'hidden'}`,
    );
  }

  console.log(`  costumes: ${target.costumes.map((c) => c.name).join(', ')}`);
  console.log(
    `  sounds:   ${target.sounds.map((s) => s.name).join(', ') || '(none)'}`,
  );

  if (target.variableNames.length) {
    const vars = target.variableNames.map(
      (n) => `${n}=${target.getVariable(n)}`,
    );
    console.log(`  vars:     ${vars.join(', ')}`);
  }
  if (target.listNames.length) {
    console.log(`  lists:    ${target.listNames.join(', ')}`);
  }
  console.log();
}
