import { createRequire } from 'node:module';

import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

const require = createRequire(import.meta.url);
const { BannerPlugin } = require('@rsbuild/core').rspack;

// This is a CLI app, not a library — so it's built with Rsbuild (SWC), which
// lets the Ink UI be written as JSX (see src/ui/app.jsx) instead of hand-rolled
// React.createElement calls. The output is a single Node ESM bundle.
export default defineConfig({
  // pluginReact wires up the SWC JSX transform (automatic runtime → React).
  plugins: [pluginReact()],
  source: {
    entry: { cli: './src/cli.js' },
  },
  output: {
    target: 'node',
    distPath: { root: './dist', js: '.' },
    filename: { js: '[name].js' },
    minify: false,
    // Keep runtime deps external: Ink is ESM-only and loads native layout
    // assets, so it must be required from node_modules at run time, not inlined.
    // Anything that isn't a relative/absolute path is a bare specifier → external.
    externals: [/^[^./]/],
  },
  tools: {
    rspack: {
      // Emit a real ESM bundle so `import … from 'ink'` resolves at run time.
      experiments: { outputModule: true },
      externalsType: 'module',
      output: {
        module: true,
        chunkFormat: 'module',
        library: { type: 'module' },
      },
      // One self-contained file for the bin — no split or runtime chunks.
      optimization: { runtimeChunk: false, splitChunks: false },
      plugins: [
        // Make dist/cli.js directly executable.
        new BannerPlugin({
          banner: '#!/usr/bin/env node',
          raw: true,
          entryOnly: true,
        }),
      ],
    },
  },
});
