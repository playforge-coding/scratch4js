/**
 * Turning a target's raw sb3 block soup into human-readable scratchblocks
 * scripts. In project.json each target has a flat `blocks` map keyed by id;
 * scripts are reconstructed by following `next`/input pointers from each
 * top-level block. We delegate the per-script conversion to `parse-sb3-blocks`
 * and just locate the script roots and order them stably.
 *
 * @module blocks
 */
import { toScratchblocks } from 'parse-sb3-blocks';

/**
 * One reconstructed script.
 *
 * @typedef {object} Script
 * @property {string} id - Id of the script's top block.
 * @property {number} x - Editor x position of the script (for stable ordering).
 * @property {number} y - Editor y position of the script.
 * @property {string} code - scratchblocks source text.
 */

/**
 * Extract every top-level script from a target as scratchblocks text.
 *
 * Scripts are returned ordered top-to-bottom then left-to-right by their editor
 * position, matching how a person reads the canvas, so two versions of a target
 * line their scripts up the same way for diffing.
 *
 * @param {object} target - A single entry from `project.json` `targets`.
 * @param {object} [options]
 * @param {string} [options.language='en'] - Block language for labels.
 * @param {string} [options.tabs='    '] - Indent for C/E block bodies.
 * @returns {Script[]}
 */
export function targetScripts(target, { language = 'en', tabs = '    ' } = {}) {
  const blocks = target && target.blocks;
  if (!blocks) return [];

  const roots = [];
  for (const [id, block] of Object.entries(blocks)) {
    // Array-form entries are top-level reporters (e.g. a variable monitor)
    // dropped on the canvas; they aren't scripts, so skip them.
    if (Array.isArray(block)) continue;
    if (!block || !block.topLevel) continue;
    roots.push({ id, x: block.x ?? 0, y: block.y ?? 0 });
  }

  roots.sort((a, b) => a.y - b.y || a.x - b.x);

  const scripts = [];
  for (const root of roots) {
    let code;
    try {
      code = toScratchblocks(root.id, blocks, language, { tabs }).trim();
    } catch (err) {
      // A single unsupported/odd block shouldn't sink the whole diff; surface
      // it inline so the script still shows up and the rest stays readable.
      code = `// (git-sb3: could not render script ${root.id}: ${err.message})`;
    }
    if (code) scripts.push({ id: root.id, x: root.x, y: root.y, code });
  }
  return scripts;
}
