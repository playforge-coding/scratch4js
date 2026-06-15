/**
 * Thin wrappers over the `git` CLI used by the diff command and the installer.
 * Kept dependency-free (just `child_process`) so git-sb3 has no runtime tie to
 * any particular git library.
 *
 * @module git
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Name of the git diff driver git-sb3 registers (`diff=sb3` in attributes). */
export const DRIVER = 'sb3';

/**
 * Run `git` and resolve with stdout. Rejects on non-zero exit.
 *
 * @param {string[]} args - Arguments passed to `git`.
 * @param {object} [options]
 * @param {'utf8' | 'buffer'} [options.encoding='utf8']
 * @param {string} [options.cwd]
 * @returns {Promise<string | Buffer>}
 */
export function git(args, { encoding = 'utf8', cwd } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { encoding, cwd, maxBuffer: 256 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          err.message = `git ${args.join(' ')} failed: ${stderr || err.message}`;
          reject(err);
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

/**
 * Read a file's bytes at a given git revision (e.g. `HEAD`, a branch, a SHA).
 *
 * @param {string} ref - Git revision.
 * @param {string} filePath - Path to the file (repo-relative or absolute).
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @returns {Promise<Buffer>}
 */
export async function showAtRef(ref, filePath, { cwd } = {}) {
  const rel = await toRepoRelative(filePath, cwd);
  return /** @type {Buffer} */ (
    await git(['show', `${ref}:${rel}`], { encoding: 'buffer', cwd })
  );
}

/**
 * Convert a path to one relative to the repository root (git's `show` syntax
 * wants repo-relative paths with forward slashes).
 *
 * @param {string} filePath
 * @param {string} [cwd]
 * @returns {Promise<string>}
 */
export async function toRepoRelative(filePath, cwd) {
  const top = (await git(['rev-parse', '--show-toplevel'], { cwd })).trim();
  const abs = path.resolve(cwd || process.cwd(), filePath);
  return path.relative(top, abs).split(path.sep).join('/');
}

/** @returns {Promise<string>} The repository root directory. */
export async function repoRoot(cwd) {
  return (await git(['rev-parse', '--show-toplevel'], { cwd })).trim();
}

/**
 * Set a git config value.
 *
 * @param {string} key
 * @param {string} value
 * @param {object} [options]
 * @param {boolean} [options.global=false]
 * @returns {Promise<void>}
 */
export async function setConfig(key, value, { global = false } = {}) {
  await git(['config', ...(global ? ['--global'] : []), key, value]);
}

/**
 * Ensure a line exists in a `.gitattributes` file, creating it if needed.
 * Returns whether the file was modified.
 *
 * @param {string} attributesPath - Path to the `.gitattributes` file.
 * @param {string} line - The attribute line to ensure (without trailing \n).
 * @returns {Promise<boolean>}
 */
export async function ensureAttribute(attributesPath, line) {
  let current = '';
  try {
    current = await fs.readFile(attributesPath, 'utf8');
  } catch {
    // File doesn't exist yet; we'll create it.
  }
  const lines = current.split('\n').map((l) => l.trim());
  if (lines.includes(line.trim())) return false;
  const next =
    current && !current.endsWith('\n')
      ? current + '\n' + line + '\n'
      : current + line + '\n';
  await fs.writeFile(attributesPath, next);
  return true;
}
