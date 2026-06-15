import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { unpack, pack, loadSb3, readSb3 } from '../src/sb3.js';
import { projectToText } from '../src/textconv.js';
import { targetScripts } from '../src/blocks.js';
import { diffProjects, renderReport } from '../src/visual-diff.js';
import { createRenderer } from '../src/render.js';

const require = createRequire(import.meta.url);
const JSZip = require('@turbowarp/jszip');

/** Build a minimal but valid project.json with one scripted sprite. */
function sampleProject(steps = '10') {
  return {
    targets: [
      {
        isStage: true,
        name: 'Stage',
        variables: {},
        lists: {},
        broadcasts: {},
        blocks: {},
        comments: {},
        currentCostume: 0,
        costumes: [],
        sounds: [],
        volume: 100,
        layerOrder: 0,
      },
      {
        isStage: false,
        name: 'Cat',
        variables: {},
        lists: {},
        broadcasts: {},
        blocks: {
          hat: {
            opcode: 'event_whenflagclicked',
            next: 'mv',
            parent: null,
            inputs: {},
            fields: {},
            shadow: false,
            topLevel: true,
            x: 0,
            y: 0,
          },
          mv: {
            opcode: 'motion_movesteps',
            next: null,
            parent: 'hat',
            inputs: { STEPS: [1, [4, steps]] },
            fields: {},
            shadow: false,
            topLevel: false,
          },
        },
        comments: {},
        currentCostume: 0,
        costumes: [],
        sounds: [],
        volume: 100,
        layerOrder: 1,
        visible: true,
        x: 0,
        y: 0,
        size: 100,
        direction: 90,
      },
    ],
    monitors: [],
    extensions: [],
    meta: { semver: '3.0.0', vm: '0.2.0', agent: '' },
  };
}

/** Zip a project.json (+ optional assets) into sb3 bytes. */
async function makeSb3(json, assets = {}) {
  const zip = new JSZip();
  zip.file('project.json', JSON.stringify(json));
  for (const [name, bytes] of Object.entries(assets)) zip.file(name, bytes);
  return zip.generateAsync({ type: 'uint8array' });
}

async function tmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'git-sb3-test-'));
}

test('blocks: reconstructs a script as scratchblocks text', () => {
  const project = sampleProject();
  const cat = project.targets.find((t) => t.name === 'Cat');
  const scripts = targetScripts(cat);
  assert.equal(scripts.length, 1);
  assert.match(scripts[0].code, /when .*clicked/);
  assert.match(scripts[0].code, /move \(10\) steps/);
});

test('textconv: renders targets, scripts and assets', () => {
  const text = projectToText(sampleProject());
  assert.match(text, /# Stage/);
  assert.match(text, /# Sprite: Cat/);
  assert.match(text, /move \(10\) steps/);
});

test('unpack/pack: round-trips a project byte-equivalently', async () => {
  const dir = await tmpDir();
  const sb3Path = path.join(dir, 'game.sb3');
  const png = new Uint8Array([1, 2, 3, 4]);
  await fs.writeFile(
    sb3Path,
    await makeSb3(sampleProject(), { 'abc.png': png }),
  );

  const unpackDir = path.join(dir, 'unpacked');
  const r1 = await unpack(sb3Path, unpackDir);
  assert.equal(r1.assetCount, 1);

  // project.json is pretty-printed (multi-line) in the unpacked tree.
  const pretty = await fs.readFile(
    path.join(unpackDir, 'project.json'),
    'utf8',
  );
  assert.ok(pretty.includes('\n  '), 'project.json should be pretty-printed');

  const repacked = path.join(dir, 'repacked.sb3');
  const r2 = await pack(unpackDir, repacked);
  assert.equal(r2.assetCount, 1);

  const { json, assets } = await readSb3(repacked);
  assert.equal(json.targets.length, 2);
  assert.deepEqual([...assets.get('abc.png')], [1, 2, 3, 4]);
});

test('loadSb3: rejects a non-sb3', async () => {
  const zip = new JSZip();
  zip.file('not-project.txt', 'nope');
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  await assert.rejects(() => loadSb3(bytes), /project\.json is missing/);
});

test('diffProjects: classifies added, removed and changed scripts', () => {
  const before = sampleProject('10');
  const after = sampleProject('25'); // same script, different input → changed

  // Add a second sprite only in `after` → an added target.
  const extra = JSON.parse(JSON.stringify(after.targets[1]));
  extra.name = 'Dog';
  after.targets.push(extra);

  const model = diffProjects(before, after);
  const cat = model.targets.find((t) => t.name === 'Cat');
  assert.equal(cat.scripts.changed.length, 1, 'Cat script should be "changed"');

  const dog = model.targets.find((t) => t.name === 'Dog');
  assert.equal(dog.status, 'added');
  assert.equal(dog.scripts.added.length, 1);
});

test('renderReport: produces an HTML document with an SVG', () => {
  const model = diffProjects(sampleProject('10'), sampleProject('25'));
  const html = renderReport(model, { title: 'unit test' });
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /<svg/);
  assert.match(html, /unit test/);
});

test('render: produces a sized SVG headlessly', () => {
  const r = createRenderer();
  const out = r.render('when green flag clicked\nmove (10) steps');
  assert.ok(out.width > 0 && out.height > 0);
  assert.match(out.svg, /<svg/);
  assert.equal(out.isEmpty, false);
});
