// Generates a starter extension project for a chosen bundler + package manager,
// reusing the exact templates `create-tw-extension` scaffolds (same configs,
// same `tw-plugin-*` wiring, same example blocks) so the in-browser maker and
// the CLI stay in sync. Also derives the install / build commands the
// WebContainer runs.

import {
  buildFileMap,
  metaFor,
  toExtensionId,
} from 'create-tw-extension/src/templates.js';

// Rspack-based bundlers only run in a WebContainer from the version that ships
// the wasm32-wasi binding; pin at-or-above it.
const RSBUILD_MIN = '^1.5.0';

export const BUNDLERS = [
  { id: 'rsbuild', label: 'Rsbuild', hint: 'Rspack-based. Recommended.' },
  { id: 'rspack', label: 'Rspack', hint: 'Rust-powered, webpack-compatible.' },
  { id: 'webpack', label: 'webpack', hint: 'The original. Pure JS.' },
  { id: 'rollup', label: 'Rollup', hint: 'ESM-first.' },
  { id: 'rolldown', label: 'Rolldown', hint: 'Rust port of Rollup.' },
  { id: 'vite', label: 'Vite', hint: 'Consumes the Rollup plugin.' },
];

export const PACKAGE_MANAGERS = [
  { id: 'npm', label: 'npm' },
  { id: 'pnpm', label: 'pnpm' },
  { id: 'yarn', label: 'yarn' },
  { id: 'bun', label: 'bun' },
];

/**
 * Build the file map + extension id for a new project.
 *
 * @param {{ name: string, bundler: string, packageManager: string }} opts
 * @returns {{ files: Record<string,string>, id: string }}
 */
export function createProjectFiles({ name, bundler, packageManager }) {
  const opts = {
    projectName: name,
    bundler,
    // @turbowarp/types installs from a git URL; the WebContainer has no git and
    // we inject the `Scratch` ambient type into Monaco ourselves.
    types: false,
    packageManager,
  };
  const files = buildFileMap(opts);
  files['package.json'] = pinDependencies(files['package.json']);
  Object.assign(files, wasmArchConfig(packageManager));
  const { id } = metaFor(opts);
  return { files, id };
}

// The WebContainer runs Node, but can't execute native prebuilt binaries, so
// napi-based bundlers (Rspack, Rolldown) need their wasm32-wasip1-threads
// binding. npm takes CLI flags (see installCommand); pnpm/yarn read a config
// file declaring the supported architectures.
const SUPPORTED_ARCHITECTURES = `supportedArchitectures:
  os:
    - current
    - wasip1-threads
  cpu:
    - current
    - wasm32
`;

function wasmArchConfig(packageManager) {
  if (packageManager === 'pnpm') {
    return { 'pnpm-workspace.yaml': SUPPORTED_ARCHITECTURES };
  }
  if (packageManager === 'yarn') {
    return { '.yarnrc.yml': SUPPORTED_ARCHITECTURES };
  }
  return {};
}

/**
 * The build descriptor web-editor's engine runs after install.
 *
 * @param {{ id: string, name: string, packageManager: string }} opts
 */
export function buildDescriptor({ id, name, packageManager }) {
  return {
    command: [packageManager, 'run', 'build'],
    outputPath: `dist/${id}.js`,
    mimeType: 'text/javascript',
    label: name,
    // Force the wasm/WASI binding for napi-based bundlers (Rolldown, etc.) since
    // the WebContainer can't run native prebuilt binaries.
    env: { NAPI_RS_FORCE_WASI: 'error' },
  };
}

/**
 * The install command for a package manager. For npm we pass the wasm/WASI
 * target on the CLI so napi bundlers get their wasm binding (pnpm/yarn read it
 * from the config file written by {@link wasmArchConfig}).
 */
export function installCommand(packageManager) {
  if (packageManager === 'npm') {
    return ['npm', 'install', '--cpu', 'wasm32', '--os', 'wasip1-threads'];
  }
  return [packageManager, 'install'];
}

export { toExtensionId };

function pinDependencies(packageJsonSource) {
  const pkg = JSON.parse(packageJsonSource);
  pkg.devDependencies = pkg.devDependencies || {};
  if (pkg.devDependencies['@rsbuild/core']) {
    pkg.devDependencies['@rsbuild/core'] = RSBUILD_MIN;
  }
  return JSON.stringify(pkg, null, 2) + '\n';
}
