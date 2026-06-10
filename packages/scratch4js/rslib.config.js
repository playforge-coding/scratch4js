import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    // Node/bundler consumers: ESM (./dist/index.js) and CJS (./dist/index.cjs).
    // @turbowarp/jszip stays external — it's a declared dependency.
    {
      format: 'esm',
      syntax: ['node 18'],
      output: { target: 'node' },
    },
    {
      format: 'cjs',
      syntax: ['node 18'],
      output: { target: 'node' },
    },
    // Browser consumers via <script>: a self-contained UMD bundle (jszip inlined)
    // in its own folder so it doesn't collide with the ESM output.
    {
      format: 'umd',
      umdName: 'scratch4js',
      syntax: ['es2021'],
      output: {
        target: 'web',
        distPath: { root: './dist/umd' },
      },
    },
  ],
  output: {
    minify: { js: true },
  },
});
