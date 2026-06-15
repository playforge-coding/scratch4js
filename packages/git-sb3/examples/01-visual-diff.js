/**
 * Programmatic visual diff: read two .sb3 files, compute a script-level diff,
 * and write a self-contained HTML report rendering the changed scripts as
 * scratchblocks SVGs.
 *
 * Run: node examples/01-visual-diff.js before.sb3 after.sb3 [out.html]
 */
import { promises as fs } from 'node:fs';
import { readSb3 } from '../src/sb3.js';
import { diffProjects, renderReport } from '../src/visual-diff.js';

const [, , beforePath, afterPath, outPath = 'diff.html'] = process.argv;
if (!beforePath || !afterPath) {
  console.error(
    'usage: node 01-visual-diff.js <before.sb3> <after.sb3> [out.html]',
  );
  process.exit(1);
}

const { json: before } = await readSb3(beforePath);
const { json: after } = await readSb3(afterPath);

const model = diffProjects(before, after);
const html = renderReport(model, {
  title: 'Scratch project diff',
  oldLabel: beforePath,
  newLabel: afterPath,
});

await fs.writeFile(outPath, html);
console.log(
  `Wrote ${outPath}: ${model.summary.changedTargets} target(s), ` +
    `+${model.summary.addedScripts}/-${model.summary.removedScripts} script(s), ` +
    `${model.summary.changedScripts} modified.`,
);
