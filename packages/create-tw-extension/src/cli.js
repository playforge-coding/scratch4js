// Entry point. Parses arguments (Commander) into a fully-resolved answer set,
// then hands off to the Ink app — which renders prompts only for the fields we
// ask it to. No args ⇒ prompt for everything (interactive). With args ⇒ prompt
// for nothing and scaffold straight away. Either way it's the same Ink UI.
//
// The shebang is added at build time by the BannerPlugin (see rsbuild.config).

import { Command } from 'commander';

import { BUNDLERS, BUNDLER_IDS } from './bundlers.js';
import { PACKAGE_MANAGERS, detectPackageManager } from './detect.js';
import { runApp } from './ui/app.jsx';

const detectedPm = detectPackageManager();

async function main() {
  // "If they don't pass any args, go into interactive mode."
  const noArgs = process.argv.slice(2).length === 0;
  if (noArgs) {
    return launch({
      initial: {
        projectName: 'my-tw-extension',
        bundler: 'rspack',
        types: true,
        packageManager: detectedPm,
      },
      // Prompt for everything; the detected package manager is pre-selected.
      prompts: ['name', 'bundler', 'types', 'pm'],
      install: true,
      force: false,
    });
  }

  const program = new Command();
  program
    .name('create-tw-extension')
    .description('Scaffold a new TurboWarp/Scratch extension.')
    .argument('[name]', 'project directory / extension name')
    .option(
      '-b, --bundler <bundler>',
      `bundler to use (${BUNDLER_IDS.join(', ')})`,
      'rspack',
    )
    .option(
      '-p, --package-manager <pm>',
      `package manager (${PACKAGE_MANAGERS.join(', ')})`,
      detectedPm,
    )
    .option('--types', 'install @turbowarp/types for editor autocomplete')
    .option('--no-types', 'skip installing @turbowarp/types')
    .option('--no-install', 'skip installing dependencies')
    .option('-f, --force', 'scaffold into a non-empty directory')
    .showHelpAfterError()
    .action(async (name, opts) => {
      if (!name) {
        program.error(
          'Missing project name. Run with no arguments for interactive mode.',
        );
      }
      const bundler = String(opts.bundler).toLowerCase();
      if (!BUNDLERS[bundler]) {
        program.error(
          `Unknown bundler "${opts.bundler}". Choose one of: ${BUNDLER_IDS.join(', ')}`,
        );
      }
      const pm = String(opts.packageManager).toLowerCase();
      if (!PACKAGE_MANAGERS.includes(pm)) {
        program.error(
          `Unknown package manager "${opts.packageManager}". Choose one of: ${PACKAGE_MANAGERS.join(', ')}`,
        );
      }

      await launch({
        initial: {
          projectName: name,
          bundler,
          // Commander sets opts.types=false for --no-types; default → true.
          types: opts.types !== false,
          packageManager: pm,
        },
        prompts: [], // everything was supplied on the command line
        install: opts.install !== false,
        force: Boolean(opts.force),
      });
    });

  await program.parseAsync(process.argv);
}

/**
 * Run the Ink app and translate its result into an exit code.
 *
 * @param {Parameters<typeof runApp>[0]} config
 */
async function launch(config) {
  const result = await runApp(config);
  if (result.cancelled) process.exitCode = 130;
  else if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\nError: ${err?.message || err}`);
  process.exit(1);
});
