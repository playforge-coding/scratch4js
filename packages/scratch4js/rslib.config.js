import { defineConfig } from '@rslib/core';
import { rspack } from '@rspack/core';

export default defineConfig({
  lib: [
    // Node/bundler consumers: ESM (./dist/esm) and CJS (./dist/cjs), each in
    // its own folder. @turbowarp/jszip stays external — it's a declared
    // dependency.
    {
      format: 'esm',
      syntax: ['node 18'],
      output: { target: 'node', distPath: { root: './dist/esm' } },
      // Emit .d.ts from the JSDoc types in src/ so consumers (and the
      // examples) get intellisense. See tsconfig.json.
      dts: true,
    },
    {
      format: 'cjs',
      syntax: ['node 18'],
      output: { target: 'node', distPath: { root: './dist/cjs' } },
    },
    // Browser consumers via <script>: a self-contained UMD bundle (jszip inlined)
    // in its own folder so it doesn't collide with the other outputs.
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
    sourceMap: {
      js: 'json-source-map',
      css: false,
      extract: false,
    },
  },
  tools: {
    rspack: {
      plugins: [
        new rspack.CopyRspackPlugin({
          patterns: [{ from: '../../LICENSE', to: '../' }],
        }),
      ],
    },
  },
});
