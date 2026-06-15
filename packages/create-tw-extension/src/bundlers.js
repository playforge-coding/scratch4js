// The bundler registry.
//
// Each entry knows everything that differs between the six supported bundlers:
// which scratch4js plugin to pull in, what the config file is called and
// contains, which dev-dependencies to install, and the build/dev scripts.
//
// There are only two plugins under the hood:
//   • tw-plugin-webpack — a webpack/Rspack plugin. Rsbuild builds on Rspack and
//     accepts Rspack plugins, so it uses this one too (via `tools.rspack`).
//   • tw-plugin-rollup  — a Rollup plugin, and therefore works in Rolldown and
//     Vite (both of which consume the Rollup plugin API) unchanged.

const PLUGIN_WEBPACK = 'tw-plugin-webpack';
const PLUGIN_ROLLUP = 'tw-plugin-rollup';

// Published versions of the scratch4js build plugins.
const PLUGIN_VERSIONS = {
  [PLUGIN_WEBPACK]: '^1.2.1',
  [PLUGIN_ROLLUP]: '^1.2.1',
};

/**
 * The shared `// Key: Value` registry metadata literal that every config embeds.
 * Kept identical across bundlers so switching tools doesn't change the output
 * header the TurboWarp gallery reads.
 *
 * @param {import('./templates.js').Meta} meta
 * @param {string} indent
 */
function metadataLiteral(meta, indent) {
  const pad = indent;
  return [
    `${pad}metadata: {`,
    `${pad}  name: ${JSON.stringify(meta.name)},`,
    `${pad}  id: ${JSON.stringify(meta.id)},`,
    `${pad}  description: ${JSON.stringify(meta.description)},`,
    `${pad}  by: ${JSON.stringify(meta.by)},`,
    `${pad}  license: 'MPL-2.0',`,
    `${pad}},`,
  ].join('\n');
}

/** @typedef {import('./templates.js').Meta} Meta */

/**
 * @typedef {Object} Bundler
 * @property {string} id          machine name, also the CLI/flag value
 * @property {string} label       human label shown in the interactive picker
 * @property {string} hint        one-line description shown beside the label
 * @property {string} plugin      which scratch4js plugin package it uses
 * @property {string} configFile  filename written to the project root
 * @property {(meta: Meta) => string} config  config-file contents
 * @property {(meta: Meta) => Record<string, string>} devDependencies
 * @property {{ build: string, dev: string }} scripts
 */

/** @type {Record<string, Bundler>} */
export const BUNDLERS = {
  webpack: {
    id: 'webpack',
    label: 'webpack',
    hint: 'The original. Mature, huge plugin ecosystem.',
    plugin: PLUGIN_WEBPACK,
    configFile: 'webpack.config.js',
    config: (meta) => `import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { TurboWarpExtensionPlugin } from 'tw-plugin-webpack';

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('webpack').Configuration} */
export default {
  mode: 'production',
  target: 'web',
  // A TurboWarp extension is a single pasted-in file, so no source maps.
  devtool: false,
  entry: resolve(here, 'src/index.js'),
  output: {
    path: resolve(here, 'dist'),
    filename: '${meta.id}.js',
    clean: true,
  },
  plugins: [
    new TurboWarpExtensionPlugin({
${metadataLiteral(meta, '      ')}
      // Set to true if your extension needs the unsandboxed VM (Scratch.vm).
      unsandboxed: false,
    }),
  ],
};
`,
    devDependencies: () => ({
      webpack: '^5.1.0',
      'webpack-cli': '^6.0.0',
      [PLUGIN_WEBPACK]: PLUGIN_VERSIONS[PLUGIN_WEBPACK],
    }),
    scripts: { build: 'webpack build', dev: 'webpack build --watch' },
  },

  rspack: {
    id: 'rspack',
    label: 'Rspack',
    hint: 'Rust-powered, webpack-compatible. Very fast.',
    plugin: PLUGIN_WEBPACK,
    configFile: 'rspack.config.js',
    config: (meta) => `import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { TurboWarpExtensionPlugin } from 'tw-plugin-webpack';

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('@rspack/core').Configuration} */
export default {
  mode: 'production',
  target: 'web',
  // A TurboWarp extension is a single pasted-in file, so no source maps.
  devtool: false,
  entry: resolve(here, 'src/index.js'),
  output: {
    path: resolve(here, 'dist'),
    filename: '${meta.id}.js',
    clean: true,
  },
  plugins: [
    new TurboWarpExtensionPlugin({
${metadataLiteral(meta, '      ')}
      // Set to true if your extension needs the unsandboxed VM (Scratch.vm).
      unsandboxed: false,
    }),
  ],
};
`,
    devDependencies: () => ({
      '@rspack/core': '^2.0.8',
      '@rspack/cli': '^2.0.0',
      [PLUGIN_WEBPACK]: PLUGIN_VERSIONS[PLUGIN_WEBPACK],
    }),
    scripts: { build: 'rspack build', dev: 'rspack build --watch' },
  },

  rsbuild: {
    id: 'rsbuild',
    label: 'Rsbuild',
    hint: 'Rspack-based toolchain. Accepts Rspack plugins.',
    plugin: PLUGIN_WEBPACK,
    configFile: 'rsbuild.config.js',
    config: (meta) => `import { defineConfig } from '@rsbuild/core';

import { TurboWarpExtensionPlugin } from 'tw-plugin-webpack';

export default defineConfig({
  source: {
    entry: { index: './src/index.js' },
  },
  output: {
    target: 'web',
    // Emit one un-hashed file next to dist/ — the extension is a single .js.
    distPath: { root: 'dist', js: '.' },
    filename: { js: '${meta.id}.js' },
    sourceMap: false,
    cleanDistPath: true,
  },
  // Roll everything into a single chunk; an extension can't load split chunks.
  performance: {
    chunkSplit: { strategy: 'all-in-one' },
  },
  tools: {
    // No HTML output — this isn't a web app, just one bundled file.
    htmlPlugin: false,
    // Rsbuild builds on Rspack, so the Rspack plugin drops straight in here.
    rspack: {
      plugins: [
        new TurboWarpExtensionPlugin({
${metadataLiteral(meta, '          ')}
          // Set to true if your extension needs the unsandboxed VM (Scratch.vm).
          unsandboxed: false,
        }),
      ],
    },
  },
});
`,
    devDependencies: () => ({
      '@rsbuild/core': '^1.3.22',
      [PLUGIN_WEBPACK]: PLUGIN_VERSIONS[PLUGIN_WEBPACK],
    }),
    scripts: { build: 'rsbuild build', dev: 'rsbuild build --watch' },
  },

  rollup: {
    id: 'rollup',
    label: 'Rollup',
    hint: 'Lean, ESM-first bundler.',
    plugin: PLUGIN_ROLLUP,
    configFile: 'rollup.config.mjs',
    config: (meta) => `import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { turbowarpExtension } from 'tw-plugin-rollup';

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('rollup').RollupOptions} */
export default {
  input: resolve(here, 'src/index.js'),
  output: {
    file: resolve(here, 'dist/${meta.id}.js'),
    // The plugin forces 'iife' and wraps the bundle in the TurboWarp template.
    sourcemap: false,
  },
  plugins: [
    turbowarpExtension({
${metadataLiteral(meta, '      ')}
      // Set to true if your extension needs the unsandboxed VM (Scratch.vm).
      unsandboxed: false,
    }),
  ],
};
`,
    devDependencies: () => ({
      rollup: '^4.0.0',
      [PLUGIN_ROLLUP]: PLUGIN_VERSIONS[PLUGIN_ROLLUP],
    }),
    scripts: { build: 'rollup -c', dev: 'rollup -c --watch' },
  },

  rolldown: {
    id: 'rolldown',
    label: 'Rolldown',
    hint: 'Rust port of Rollup. Same config, faster.',
    plugin: PLUGIN_ROLLUP,
    configFile: 'rolldown.config.mjs',
    config: (meta) => `import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { turbowarpExtension } from 'tw-plugin-rollup';

const here = dirname(fileURLToPath(import.meta.url));

// Rolldown is a near drop-in for Rollup and consumes the same plugin object.
/** @type {import('rolldown').RolldownOptions} */
export default {
  input: resolve(here, 'src/index.js'),
  output: {
    file: resolve(here, 'dist/${meta.id}.js'),
    sourcemap: false,
  },
  plugins: [
    turbowarpExtension({
${metadataLiteral(meta, '      ')}
      // Set to true if your extension needs the unsandboxed VM (Scratch.vm).
      unsandboxed: false,
    }),
  ],
};
`,
    devDependencies: () => ({
      rolldown: 'latest',
      [PLUGIN_ROLLUP]: PLUGIN_VERSIONS[PLUGIN_ROLLUP],
    }),
    scripts: { build: 'rolldown -c', dev: 'rolldown -c --watch' },
  },

  vite: {
    id: 'vite',
    label: 'Vite',
    hint: 'Uses the Rollup plugin via build.rollupOptions.',
    plugin: PLUGIN_ROLLUP,
    configFile: 'vite.config.mjs',
    config: (meta) => `import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { defineConfig } from 'vite';
import { turbowarpExtension } from 'tw-plugin-rollup';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    rollupOptions: {
      input: resolve(here, 'src/index.js'),
      // The plugin reads the entry's default export and forces 'iife' itself, so
      // don't let Vite tree-shake the entry signature away.
      preserveEntrySignatures: 'strict',
      output: {
        entryFileNames: '${meta.id}.js',
      },
    },
  },
  // Vite consumes Rollup plugins directly.
  plugins: [
    turbowarpExtension({
${metadataLiteral(meta, '      ')}
      // Set to true if your extension needs the unsandboxed VM (Scratch.vm).
      unsandboxed: false,
    }),
  ],
});
`,
    devDependencies: () => ({
      vite: '^6.0.0',
      [PLUGIN_ROLLUP]: PLUGIN_VERSIONS[PLUGIN_ROLLUP],
    }),
    scripts: { build: 'vite build', dev: 'vite build --watch' },
  },
};

/** Ordered list of bundler ids — drives the interactive picker and `--help`. */
export const BUNDLER_IDS = Object.keys(BUNDLERS);
