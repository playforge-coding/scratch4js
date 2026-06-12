#!/usr/bin/env node
/**
 * Copy `userscript.js` + `userstyle.css` into TurboWarp Desktop's config
 * directory, where the app loads them from. Run after editing either file:
 *
 *   pnpm install-userscript
 *
 * TurboWarp Desktop must have been launched at least once (so its config dir
 * exists), and must be fully restarted afterwards to pick up the new script.
 *
 * Override the destination with TWD_CONFIG_DIR if your install lives elsewhere.
 */
import { copyFile, access } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILES = ['userscript.js', 'userstyle.css'];

/** Candidate config directories, most-specific first, per platform. */
function candidates() {
  const home = homedir();
  if (process.env.TWD_CONFIG_DIR) return [process.env.TWD_CONFIG_DIR];
  switch (platform()) {
    case 'win32':
      return [
        join(
          process.env.APPDATA ?? join(home, 'AppData', 'Roaming'),
          'turbowarp-desktop',
        ),
      ];
    case 'darwin':
      return [
        join(
          home,
          'Library',
          'Containers',
          'org.turbowarp.desktop',
          'Data',
          'Library',
          'Application Support',
          'turbowarp-desktop',
        ),
        join(home, 'Library', 'Application Support', 'turbowarp-desktop'),
      ];
    default: // linux
      return [
        join(
          home,
          '.var',
          'app',
          'org.turbowarp.TurboWarp',
          'config',
          'turbowarp-desktop',
        ), // Flatpak
        join(home, '.config', 'turbowarp-desktop'), // native / .deb / AppImage
      ];
  }
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const tried = candidates();
let dest = null;
for (const dir of tried) {
  if (await exists(dir)) {
    dest = dir;
    break;
  }
}

if (!dest) {
  console.error(
    'Could not find a TurboWarp Desktop config directory. Looked in:\n' +
      tried.map((d) => `  - ${d}`).join('\n') +
      '\n\nLaunch TurboWarp Desktop once so it creates the directory, or set ' +
      'TWD_CONFIG_DIR to its path.',
  );
  process.exit(1);
}

for (const name of FILES) {
  await copyFile(join(HERE, name), join(dest, name));
  console.log(`copied ${name} -> ${dest}`);
}
console.log(
  '\nDone. Fully restart TurboWarp Desktop to load the new userscript.',
);
