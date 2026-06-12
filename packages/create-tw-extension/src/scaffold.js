// Filesystem + install primitives. These are pure side-effect helpers with no
// console output — the Ink UI (src/ui/app.js) drives them and renders progress,
// so both interactive and non-interactive runs share one presentation layer.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { buildFileMap } from './templates.js';
import { installCommand } from './detect.js';

/**
 * @typedef {import('./templates.js').ScaffoldOptions & { targetDir?: string }} CreateOptions
 */

/**
 * Absolute path the project will be written to.
 *
 * @param {CreateOptions} opts
 */
export function targetDirFor(opts) {
  return resolve(process.cwd(), opts.targetDir || opts.projectName);
}

/**
 * Whether a directory already exists and has files in it.
 *
 * @param {string} dir
 */
export function isOccupied(dir) {
  return existsSync(dir) && readdirSync(dir).length > 0;
}

/**
 * Write every templated file into `targetDir`, creating parent dirs as needed.
 *
 * @param {CreateOptions} opts
 * @param {string} targetDir
 * @returns {string[]} the relative paths written, in order
 */
export function writeProject(opts, targetDir) {
  const files = buildFileMap(opts);
  const written = [];
  for (const [rel, contents] of Object.entries(files)) {
    const abs = join(targetDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents);
    written.push(rel);
  }
  return written;
}

/**
 * Run `<pm> install` in `cwd`. Output is suppressed (the UI shows a spinner);
 * resolves to whether the install exited cleanly.
 *
 * @param {'npm'|'pnpm'|'yarn'|'bun'} pm
 * @param {string} cwd
 * @returns {Promise<boolean>}
 */
export function installDeps(pm, cwd) {
  const [cmd, ...args] = installCommand(pm).split(' ');
  return new Promise((res) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'ignore',
      // On Windows the PM is a .cmd shim, which needs a shell to launch.
      shell: process.platform === 'win32',
    });
    child.on('error', () => res(false));
    child.on('close', (code) => res(code === 0));
  });
}
