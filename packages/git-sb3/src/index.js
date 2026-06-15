#!/usr/bin/env node
/**
 * git-sb3 — a git extension that makes version-controlling Scratch `.sb3`
 * projects actually work. Installed on your PATH as `git-sb3`, git discovers it
 * as a subcommand, so every command below also runs as `git sb3 <command>`.
 *
 * An sb3 is a zip wrapping a single-line project.json, so out of the box git
 * only ever says "Binary files differ". git-sb3 adds:
 *
 *   - `unpack` / `pack`  — explode an sb3 into a line-diffable tree and back.
 *   - `text`             — print a project as readable text (scratchblocks +
 *                          variables + assets); also the `textconv` driver that
 *                          turns `git diff` into a meaningful diff.
 *   - `diff`             — a visual HTML report rendering scripts as real
 *                          scratchblocks SVGs with added/removed/changed tinted.
 *   - `watch`            — serve that report live, refreshing as you edit (on
 *                          file save or via the TurboWarp userscript).
 *   - `install`          — wire the textconv driver into the current repo.
 *
 * @module index
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { unpack, pack, readSb3, loadSb3 } from './sb3.js';
import { projectToText } from './textconv.js';
import { diffProjects, renderReport } from './visual-diff.js';
import { startLiveDiff } from './live.js';
import {
  DRIVER,
  showAtRef,
  repoRoot,
  setConfig,
  ensureAttribute,
} from './git.js';

const program = new Command();

program
  .name('git-sb3')
  .description(
    'Version-control Scratch .sb3 projects: diffable unpack/pack, readable ' +
      'git diffs, and visual scratchblocks diff reports.',
  )
  .version('1.2.2');

program
  .command('unpack')
  .description(
    'Explode an .sb3 into a diffable tree (pretty project.json + assets/).',
  )
  .argument('<file.sb3>', 'the .sb3 file to unpack')
  .option('-o, --out <dir>', 'output directory (default: <file> without .sb3)')
  .action(async (file, opts) => {
    const dir = opts.out || stripExt(file);
    const { assetCount } = await unpack(file, dir);
    process.stderr.write(
      `Unpacked ${file} → ${dir}/ (project.json + ${assetCount} asset(s)).\n`,
    );
  });

program
  .command('pack')
  .description('Reassemble a tree produced by `unpack` back into an .sb3.')
  .argument('<dir>', 'directory produced by `git sb3 unpack`')
  .option('-o, --out <file.sb3>', 'output .sb3 path (default: <dir>.sb3)')
  .option('-c, --compression <level>', 'DEFLATE level 1–9', '6')
  .action(async (dir, opts) => {
    const out = opts.out || stripTrailingSlash(dir) + '.sb3';
    const { assetCount } = await pack(dir, out, {
      compressionLevel: clampLevel(opts.compression),
    });
    process.stderr.write(`Packed ${dir}/ → ${out} (${assetCount} asset(s)).\n`);
  });

program
  .command('text')
  .alias('textconv')
  .description(
    'Print a project as readable text (the git textconv diff driver target).',
  )
  .argument('<file.sb3>', 'the .sb3 file to render as text')
  .option('-l, --language <code>', 'block language for labels', 'en')
  .action(async (file, opts) => {
    const { json } = await readSb3(file);
    process.stdout.write(projectToText(json, { language: opts.language }));
  });

program
  .command('diff')
  .description(
    'Generate a visual scratchblocks HTML diff between two project versions.',
  )
  .argument('<a>', 'old .sb3 file, or a git ref (e.g. HEAD) when <b> is given')
  .argument(
    '[b]',
    'new .sb3 file; omit to diff <a> in the working tree vs HEAD',
  )
  .option('-o, --out <file.html>', 'output HTML path')
  .option('-l, --language <code>', 'block language for labels', 'en')
  .option('--no-stdout', 'do not print the output path')
  .action(async (a, b, opts) => {
    const { oldJson, newJson, oldLabel, newLabel, newPath } = await resolvePair(
      a,
      b,
    );
    const model = diffProjects(oldJson, newJson, { language: opts.language });
    const html = renderReport(model, {
      title: `${path.basename(newPath)} diff`,
      oldLabel,
      newLabel,
    });
    const out = opts.out || stripExt(newPath) + '.diff.html';
    await fs.writeFile(out, html);
    const s = model.summary;
    process.stderr.write(
      `Diff: ${s.changedTargets} target(s), +${s.addedScripts}/−${s.removedScripts} ` +
        `script(s), ${s.changedScripts} modified.\n`,
    );
    if (opts.stdout) process.stdout.write(out + '\n');
  });

program
  .command('watch')
  .description(
    'Serve a live visual diff that refreshes as you edit (save or via the ' +
      'TurboWarp userscript).',
  )
  .argument(
    '<a>',
    'baseline .sb3 file, or a git ref (e.g. HEAD) when <b> is given',
  )
  .argument('[b]', 'working .sb3 file to watch; omit to watch <a> vs HEAD')
  .option('-p, --port <port>', 'port to serve the live diff on', '9061')
  .option('-l, --language <code>', 'block language for labels', 'en')
  .option(
    '--no-watch-file',
    'only refresh from userscript pushes, not file saves',
  )
  .action(async (a, b, opts) => {
    const { oldJson, newJson, oldLabel, newLabel, newPath } = await resolvePair(
      a,
      b,
    );
    const server = await startLiveDiff({
      baselineJson: oldJson,
      newPath,
      initialNewJson: newJson,
      title: `${path.basename(newPath)} live diff`,
      oldLabel,
      newLabel,
      language: opts.language,
      port: Number(opts.port),
      watchFile: opts.watchFile,
    });
    process.stderr.write(
      `Live diff: ${server.url}\n` +
        `Open it in a browser — it refreshes when ${path.basename(newPath)} is ` +
        `saved` +
        (opts.watchFile ? '' : ' (file watching disabled)') +
        `, or live as you edit if the TurboWarp userscript is running.\n` +
        `Press Ctrl-C to stop.\n`,
    );
    const shutdown = async () => {
      await server.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

program
  .command('install')
  .description(
    'Wire the .sb3 textconv diff driver into git (so `git diff` is readable).',
  )
  .option('-g, --global', 'configure git globally instead of for this repo')
  .option('--bin <name>', 'git-sb3 executable name to call from git', 'git-sb3')
  .action(async (opts) => {
    await setConfig(`diff.${DRIVER}.textconv`, `${opts.bin} text`, {
      global: opts.global,
    });
    await setConfig(`diff.${DRIVER}.binary`, 'true', { global: opts.global });
    await setConfig(`diff.${DRIVER}.cachetextconv`, 'true', {
      global: opts.global,
    });

    const attrLine = `*.sb3 diff=${DRIVER}`;
    if (opts.global) {
      process.stderr.write(
        `Configured global diff driver "${DRIVER}".\n` +
          `Add this line to your global attributes file ` +
          `(git config --global core.attributesFile):\n  ${attrLine}\n`,
      );
    } else {
      const root = await repoRoot();
      const attrPath = path.join(root, '.gitattributes');
      const wrote = await ensureAttribute(attrPath, attrLine);
      process.stderr.write(
        `Configured diff driver "${DRIVER}" for this repo.\n` +
          (wrote
            ? `Added "${attrLine}" to ${attrPath}.\n`
            : `"${attrLine}" already present in ${attrPath}.\n`) +
          `\n\`git diff\` on .sb3 files now shows readable script changes.\n` +
          `For the visual report, run: git sb3 diff <file.sb3>\n`,
      );
    }
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`git-sb3: ${err.message}\n`);
  process.exit(1);
});

/* ----------------------------------------------------------------- helpers */

/**
 * Resolve the `diff` command's two arguments into a pair of parsed projects.
 * Supports: two file paths; `<ref> <path>`; or a lone `<path>` (working tree
 * vs HEAD).
 *
 * @param {string} a
 * @param {string} [b]
 * @returns {Promise<{ oldJson: object, newJson: object, oldLabel: string, newLabel: string, newPath: string }>}
 */
async function resolvePair(a, b) {
  if (!b) {
    // Single path: compare working tree against HEAD.
    const newJson = (await readSb3(a)).json;
    const oldJson = await loadFromRef('HEAD', a);
    return {
      oldJson,
      newJson,
      oldLabel: 'HEAD',
      newLabel: 'working tree',
      newPath: a,
    };
  }
  if (await isFile(a)) {
    // Two file paths.
    return {
      oldJson: (await readSb3(a)).json,
      newJson: (await readSb3(b)).json,
      oldLabel: path.basename(a),
      newLabel: path.basename(b),
      newPath: b,
    };
  }
  // <ref> <path>: extract the old side from git history.
  return {
    oldJson: await loadFromRef(a, b),
    newJson: (await readSb3(b)).json,
    oldLabel: a,
    newLabel: `working tree`,
    newPath: b,
  };
}

/**
 * Load and parse an sb3 from a git revision.
 *
 * @param {string} ref
 * @param {string} filePath
 * @returns {Promise<object>}
 */
async function loadFromRef(ref, filePath) {
  const bytes = await showAtRef(ref, filePath);
  return (await loadSb3(bytes)).json;
}

/** @param {string} p @returns {Promise<boolean>} */
async function isFile(p) {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}

/** @param {string} file @returns {string} `file` with a trailing `.sb3` removed. */
function stripExt(file) {
  return file.replace(/\.sb3$/i, '') || file;
}

/** @param {string} dir @returns {string} */
function stripTrailingSlash(dir) {
  return dir.replace(/[\\/]+$/, '');
}

/** @param {string} value @returns {number} */
function clampLevel(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return 6;
  return Math.min(9, Math.max(1, n));
}
