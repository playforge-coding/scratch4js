/**
 * Reading, unpacking and repacking `.sb3` files. An sb3 is a zip holding a
 * single-line `project.json` plus the costume/sound assets it references
 * (named `<md5>.<ext>`). Git treats the zip as an opaque binary blob and the
 * minified JSON as one giant line, so neither diffs usefully. This module
 * explodes an sb3 into a tidy, line-diffable tree and reassembles it.
 *
 * @module sb3
 */
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
// @turbowarp/jszip ships CJS; load it through require so this stays ESM.
const JSZip = require('@turbowarp/jszip');

/**
 * A project read from an sb3.
 *
 * @typedef {object} LoadedProject
 * @property {object} json - Parsed `project.json`.
 * @property {Map<string, Uint8Array>} assets - Asset bytes keyed by filename.
 */

/**
 * Read an `.sb3` file into its parsed JSON and asset bytes.
 *
 * @param {string} file - Path to the `.sb3` file.
 * @returns {Promise<LoadedProject>}
 */
export async function readSb3(file) {
  return loadSb3(await fs.readFile(file));
}

/**
 * Parse `.sb3` bytes into project JSON and asset bytes.
 *
 * @param {Uint8Array | Buffer | ArrayBuffer} data - The sb3 zip bytes.
 * @returns {Promise<LoadedProject>}
 */
export async function loadSb3(data) {
  const zip = await JSZip.loadAsync(data);
  const projectFile = zip.file('project.json');
  if (!projectFile)
    throw new Error('Not a valid sb3: project.json is missing.');
  const json = JSON.parse(await projectFile.async('string'));

  const assets = new Map();
  const reads = [];
  zip.forEach((entryPath, entry) => {
    if (entry.dir || entryPath === 'project.json') return;
    reads.push(
      entry.async('uint8array').then((bytes) => assets.set(entryPath, bytes)),
    );
  });
  await Promise.all(reads);

  return { json, assets };
}

/** Name of the folder that holds extracted asset files in an unpacked tree. */
export const ASSETS_DIR = 'assets';
/** Name of the pretty-printed project description in an unpacked tree. */
export const PROJECT_JSON = 'project.json';

/**
 * Unpack an sb3 into a diffable directory tree:
 *
 * ```
 * <dir>/
 *   project.json     # pretty-printed (2-space), stable key order
 *   assets/          # one file per costume/sound, named by its md5ext
 * ```
 *
 * Assets are content-addressed by md5 already, so they round-trip byte-for-byte
 * and only show up in a diff when actually added or removed.
 *
 * @param {string} file - Path to the `.sb3` file.
 * @param {string} dir - Output directory (created if absent).
 * @returns {Promise<{ assetCount: number }>}
 */
export async function unpack(file, dir) {
  const { json, assets } = await readSb3(file);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, PROJECT_JSON),
    prettyProjectJson(json) + '\n',
  );

  const assetsDir = path.join(dir, ASSETS_DIR);
  await fs.mkdir(assetsDir, { recursive: true });
  for (const [name, bytes] of assets) {
    await fs.writeFile(path.join(assetsDir, name), bytes);
  }

  return { assetCount: assets.size };
}

/**
 * Repack a directory tree produced by {@link unpack} back into an `.sb3` file.
 * The project.json is re-minified (Scratch accepts either form), so the output
 * is a normal sb3 that opens in the editor and on the website.
 *
 * @param {string} dir - Directory produced by {@link unpack}.
 * @param {string} outFile - Destination `.sb3` path.
 * @param {object} [options]
 * @param {number} [options.compressionLevel=6] - DEFLATE level, 1–9.
 * @returns {Promise<{ assetCount: number }>}
 */
export async function pack(dir, outFile, { compressionLevel = 6 } = {}) {
  const json = JSON.parse(
    await fs.readFile(path.join(dir, PROJECT_JSON), 'utf8'),
  );

  const zip = new JSZip();
  zip.file('project.json', JSON.stringify(json));

  let assetCount = 0;
  const assetsDir = path.join(dir, ASSETS_DIR);
  let entries = [];
  try {
    entries = await fs.readdir(assetsDir);
  } catch {
    // No assets folder: a project with no costumes/sounds is unusual but legal.
  }
  for (const name of entries) {
    const full = path.join(assetsDir, name);
    const stat = await fs.stat(full);
    if (!stat.isFile()) continue;
    zip.file(name, await fs.readFile(full));
    assetCount++;
  }

  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });
  await fs.mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
  await fs.writeFile(outFile, bytes);

  return { assetCount };
}

/**
 * Pretty-print a project.json with 2-space indentation. Object key order is
 * preserved from the source, which keeps unpack output stable across edits
 * (Scratch writes keys in a consistent order) so diffs stay tight.
 *
 * @param {object} json - Parsed project.json.
 * @returns {string}
 */
export function prettyProjectJson(json) {
  return JSON.stringify(json, null, 2);
}
