import { defineConfig } from '@rslib/core';

// The plugin is a build-tool module consumed inside Rollup/Rolldown/Vite
// configs, so we ship plain ESM (./dist/esm) and CJS (./dist/cjs) for Node — no
// browser bundle. `.d.ts` files are emitted from the JSDoc types in src/.
export default defineConfig({
  lib: [
    {
      format: 'esm',
      syntax: ['node 18'],
      output: { target: 'node', distPath: { root: './dist/esm' } },
      dts: true,
    },
    {
      format: 'cjs',
      syntax: ['node 18'],
      output: { target: 'node', distPath: { root: './dist/cjs' } },
    },
  ],
  output: {
    // Keep the source readable — this is a tiny Node module, not shipped to the
    // browser, so there's nothing to gain from minifying it.
    minify: false,
  },
});
