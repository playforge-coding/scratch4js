/*
 * Builds the extension and packages dist/ into an installable .xpi (Firefox)
 * / .zip (Chrome Web Store).
 *
 * The one rule that makes or breaks an XPI: `manifest.json` MUST sit at the
 * ROOT of the archive. If you zip the *folder* (so entries look like
 * `dist/manifest.json`), Firefox reports the add-on as "corrupt". So we zip the
 * *contents* of dist/ with `cwd: dist`, which puts manifest.json at the top.
 */
import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const artifacts = join(root, 'artifacts');
const out = join(artifacts, 'scratch-p2p.xpi');

// 1. Build dist/.
await run('npx', ['rsbuild', 'build'], { cwd: root, stdio: 'inherit' }).catch(
  () => {},
);

// 2. Zip the *contents* of dist/ — manifest.json at the archive root.
await rm(artifacts, { recursive: true, force: true });
await mkdir(artifacts, { recursive: true });

try {
  await run('zip', ['-r', '-FS', '-X', out, '.'], { cwd: dist });
  console.log(`\nscratch-p2p: packaged ${out}`);
  console.log(
    'Firefox: release/stable builds only install *signed* add-ons. Either load\n' +
      'it unsigned via about:debugging → "Load Temporary Add-on" (pick dist/manifest.json),\n' +
      'use Developer Edition/Nightly/ESR with xpinstall.signatures.required=false,\n' +
      'or sign it through addons.mozilla.org.',
  );
} catch {
  console.error(
    'scratch-p2p: could not create the archive — is the `zip` CLI installed?\n' +
      'You can still load packages/scratch-p2p/dist unpacked (about:debugging /\n' +
      'chrome://extensions) without packaging.',
  );
  process.exitCode = 1;
}
