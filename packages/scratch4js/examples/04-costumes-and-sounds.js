// 04 — Costumes and sounds
//
// Work with the binary media inside a project: export every asset to disk,
// re-skin a sprite by copying another costume's bytes onto it, and share a
// sound clip from one sprite to another. Shows Costume/Sound `.data`, plus
// addCostume / addSound and how assets are addressed by MD5.
//
//   node examples/04-costumes-and-sounds.js
// → writes examples/out/assets/* and examples/out/reskinned.sb3

import { Project } from 'scratch4js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sb3 = fileURLToPath(new URL('../example.sb3', import.meta.url));
const project = await Project.load(await readFile(sb3));

const outDir = fileURLToPath(new URL('./out/', import.meta.url));
const assetDir = `${outDir}assets/`;
await mkdir(assetDir, { recursive: true });

// 1. Export every distinct asset. The project stores bytes keyed by md5ext, so
//    iterating the map gives each unique file exactly once.
for (const [md5ext, bytes] of project.assets) {
  await writeFile(`${assetDir}${md5ext}`, bytes);
}
console.log(`Exported ${project.assets.size} assets → examples/out/assets/`);

// 2. Re-skin: copy the stage's "kristina" backdrop bytes onto the girl sprite's
//    costume. Assigning `.data` re-hashes and rewrites the md5ext automatically.
const source = project.stage.getCostume('kristina');
const girl = project.sprite('girl');
const target = girl.costumes[0];
console.log(`\nReskinning girl/${target.name}: ${target.md5ext}`);
target.data = source.data; // same bytes are now shared, deduped by hash
console.log(`                       → ${target.md5ext}`);

// 3. Add a brand-new costume from raw bytes (here, reusing the backdrop image).
girl.addCostume('borrowed backdrop', source.data, {
  dataFormat: source.dataFormat,
});

// 4. Share a sound: copy ipod's "Beatbox" clip onto the girl.
const beatbox = project.sprite('ipod').getSound('Beatbox');
girl.addSound('Beatbox', beatbox.data, { dataFormat: beatbox.dataFormat });

console.log(
  `\ngirl now has costumes: ${girl.costumes.map((c) => c.name).join(', ')}`,
);
console.log(
  `girl now has sounds:   ${girl.sounds.map((s) => s.name).join(', ')}`,
);

await writeFile(`${outDir}reskinned.sb3`, await project.save());
console.log('\nSaved → examples/out/reskinned.sb3');
