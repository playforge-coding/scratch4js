// Package-manager detection.
//
// When this scaffolder is invoked through `npm create`, `pnpm create`,
// `yarn create`, or `bun create`, the launching package manager exports
// `npm_config_user_agent` (e.g. "pnpm/11.5.2 npm/? node/v26.2.0 …"). That string
// is the most reliable signal for which tool the user actually typed, so we read
// the leading token from it. This is the value the interactive UI pre-selects
// and the non-interactive default — "the one that is already selected".

export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'];

/**
 * Best-effort guess of the package manager the user launched us with.
 *
 * @returns {'npm' | 'pnpm' | 'yarn' | 'bun'}
 */
export function detectPackageManager() {
  const ua = process.env.npm_config_user_agent || '';
  const name = ua.split('/')[0];
  if (PACKAGE_MANAGERS.includes(name)) {
    return /** @type {'npm' | 'pnpm' | 'yarn' | 'bun'} */ (name);
  }

  // Fall back to the executable path of the process that spawned us — covers the
  // case where the env var is missing (e.g. running the bin directly via a PM).
  const execpath = process.env.npm_execpath || '';
  if (execpath.includes('pnpm')) return 'pnpm';
  if (execpath.includes('yarn')) return 'yarn';
  if (execpath.includes('bun')) return 'bun';

  return 'npm';
}

/**
 * The shell command each package manager uses to install dependencies.
 *
 * @param {'npm' | 'pnpm' | 'yarn' | 'bun'} pm
 * @returns {string}
 */
export function installCommand(pm) {
  // `yarn` (classic) and `bun` both treat a bare invocation as "install"; npm
  // and pnpm want the explicit `install` verb. All four understand `install`,
  // so we use it uniformly for clarity.
  return `${pm} install`;
}

/**
 * The command a user runs to invoke a package.json script with this PM, used in
 * the generated README ("next steps").
 *
 * @param {'npm' | 'pnpm' | 'yarn' | 'bun'} pm
 * @param {string} script
 * @returns {string}
 */
export function runCommand(pm, script) {
  if (pm === 'npm') return `npm run ${script}`;
  return `${pm} ${script}`;
}
