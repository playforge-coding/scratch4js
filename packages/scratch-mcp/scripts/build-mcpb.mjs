#!/usr/bin/env node
/**
 * Build an `.mcpb` bundle (https://github.com/anthropics/mcpb) for scratch-mcp.
 *
 * MCPB bundles must ship a self-contained `node_modules`, but some of our
 * dependencies don't install from a plain consumer manifest as-is:
 *   - `scratch-vm` is a git dependency (TurboWarp's JIT fork), and
 *   - `scratch4js` and `s-api4js` are `workspace:*` dependencies.
 * So we stage a clean directory, vendor the workspace packages as `npm pack`
 * tarballs, `npm install --omit=dev` to materialise a flat `node_modules`, then
 * `mcpb pack`. The committed `manifest.json` / `icon.png` are the source of
 * truth; everything under `build/` and `dist/` is generated.
 *
 * Usage: node scripts/build-mcpb.mjs   (or: pnpm --filter scratch-mcp mcpb)
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  cpSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(pkgDir, '..', '..');
const buildDir = join(pkgDir, 'build');
const distDir = join(pkgDir, 'dist');

/** Workspace packages the bundle depends on, vendored as tarballs below. */
const workspaceDeps = ['scratch4js', 's-api4js'];

const run = (cmd, args, cwd) => {
  console.log(`$ ${cmd} ${args.join(' ')}  (in ${cwd})`);
  return execFileSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
};

const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

console.log('• Cleaning staging dirs');
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(join(buildDir, 'server'), { recursive: true });
mkdirSync(distDir, { recursive: true });

console.log(
  '• Building workspace packages (the bundle needs their built dist)',
);
for (const name of workspaceDeps)
  run('pnpm', ['--filter', name, 'build'], repoRoot);

console.log('• Vendoring workspace packages as tarballs');
/** @type {Record<string, string>} package name → `file:` tarball spec. */
const vendored = {};
for (const name of workspaceDeps) {
  const packOut = run(
    'npm',
    ['pack', '--silent', '--pack-destination', buildDir],
    join(repoRoot, 'packages', name),
  );
  const tarball = packOut.trim().split('\n').pop().trim();
  if (!tarball.endsWith('.tgz'))
    throw new Error(`Unexpected npm pack output: ${JSON.stringify(packOut)}`);
  vendored[name] = `file:${tarball}`;
}

console.log('• Copying server sources and bundle metadata');
for (const file of readdirSync(join(pkgDir, 'src')))
  cpSync(join(pkgDir, 'src', file), join(buildDir, 'server', file));
cpSync(join(pkgDir, 'icon.png'), join(buildDir, 'icon.png'));
cpSync(join(pkgDir, 'README.md'), join(buildDir, 'README.md'));
// Stamp the bundle version from package.json so the two can never drift.
const manifest = JSON.parse(
  readFileSync(join(pkgDir, 'manifest.json'), 'utf8'),
);
manifest.version = pkg.version;
writeFileSync(
  join(buildDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);

console.log('• Writing the bundle package.json');
// Replace the workspace dependencies with their vendored tarballs, and pull
// scratch-vm's peer (`@turbowarp/scratch-svg-renderer`) up to a direct
// dependency so npm's flat install definitely materialises it — pnpm provides
// it transitively in dev, but a plain consumer install won't unless asked.
const deps = {
  ...pkg.dependencies,
  ...vendored,
  '@turbowarp/scratch-svg-renderer':
    pkg.dependencies['@turbowarp/scratch-svg-renderer'] ?? '^1.1.0',
};
writeFileSync(
  join(buildDir, 'package.json'),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      type: 'module',
      private: true,
      license: pkg.license,
      dependencies: deps,
      // svg-renderer peer-requests a git build of scratch-render-fonts; force
      // it to the runtime-compatible npm release the dev workspace uses, so
      // npm's strict peer resolution accepts the tree without dropping peers.
      overrides: { 'scratch-render-fonts': deps['scratch-render-fonts'] },
    },
    null,
    2,
  ) + '\n',
);

console.log('• Installing production dependencies (flat node_modules)');
run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], buildDir);

console.log('• Packing the .mcpb');
const out = join(distDir, `${pkg.name}-${pkg.version}.mcpb`);
const packLog = run(
  'npx',
  ['-y', '@anthropic-ai/mcpb@latest', 'pack', buildDir, out],
  pkgDir,
);
console.log(packLog.trim());

console.log(`\n✓ Built ${out}`);
