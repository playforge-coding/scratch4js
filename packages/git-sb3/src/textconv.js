/**
 * Rendering a whole project as readable plain text. This is what git shows for
 * an `.sb3` once git-sb3 is wired in as a `textconv` diff driver: instead of
 * "Binary files differ", `git diff` prints each target's scripts (as
 * scratchblocks), variables, lists, costumes and sounds, so a commit's actual
 * effect on the project is reviewable line by line.
 *
 * @module textconv
 */
import { targetScripts } from './blocks.js';

/**
 * Render a parsed project.json as a readable, diff-friendly text document.
 *
 * @param {object} json - Parsed project.json.
 * @param {object} [options]
 * @param {string} [options.language='en'] - Block language for labels.
 * @returns {string}
 */
export function projectToText(json, { language = 'en' } = {}) {
  const out = [];
  const targets = (json && json.targets) || [];

  const extensions = json.extensions || [];
  if (extensions.length) out.push(`extensions: ${extensions.join(', ')}`, '');

  // Stage first, then sprites in their layer order, so the text is stable.
  const ordered = [...targets].sort((a, b) => {
    if (a.isStage !== b.isStage) return a.isStage ? -1 : 1;
    return (a.layerOrder ?? 0) - (b.layerOrder ?? 0);
  });

  for (const target of ordered) {
    out.push(...targetToText(target, { language }), '');
  }

  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}

/**
 * Render a single target (stage or sprite) as text.
 *
 * @param {object} target - A `project.json` target.
 * @param {object} [options]
 * @param {string} [options.language='en']
 * @returns {string[]} Lines.
 */
export function targetToText(target, { language = 'en' } = {}) {
  const lines = [];
  const heading = target.isStage ? 'Stage' : `Sprite: ${target.name}`;
  lines.push(`# ${heading}`);

  const variables = entriesToText(target.variables, ([, v]) => {
    const [name, value] = v;
    return `  ${name} = ${formatValue(value)}`;
  });
  if (variables.length) lines.push('', 'variables:', ...variables);

  const lists = entriesToText(target.lists, ([, v]) => {
    const [name, items] = v;
    return `  ${name} = [${items.map(formatValue).join(', ')}]`;
  });
  if (lists.length) lines.push('', 'lists:', ...lists);

  const broadcasts = entriesToText(
    target.broadcasts,
    ([, name]) => `  ${name}`,
  );
  if (broadcasts.length) lines.push('', 'broadcasts:', ...broadcasts);

  const costumes = (target.costumes || []).map(
    (c) => `  ${c.name} (${c.md5ext})`,
  );
  if (costumes.length) lines.push('', 'costumes:', ...costumes);

  const sounds = (target.sounds || []).map((s) => `  ${s.name} (${s.md5ext})`);
  if (sounds.length) lines.push('', 'sounds:', ...sounds);

  const scripts = targetScripts(target, { language });
  if (scripts.length) {
    lines.push('', 'scripts:');
    scripts.forEach((script, i) => {
      if (i > 0) lines.push('');
      lines.push(...script.code.split('\n').map((l) => `  ${l}`));
    });
  }

  return lines;
}

/**
 * Map an object of entries to sorted text lines, dropping empties.
 *
 * @param {object} obj
 * @param {(entry: [string, any]) => string} format
 * @returns {string[]}
 */
function entriesToText(obj, format) {
  if (!obj) return [];
  return Object.entries(obj)
    .map(format)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Format a scalar variable/list value for display.
 *
 * @param {string | number | boolean} value
 * @returns {string}
 */
function formatValue(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}
