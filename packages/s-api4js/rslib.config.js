import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    // Node/bundler consumers: ESM (./dist/esm) and CJS (./dist/cjs), each in
    // its own folder. `tough-cookie` stays external — it's a declared
    // dependency and pulls in Node built-ins, so it should not be inlined.
    {
      format: 'esm',
      syntax: ['node 18'],
      output: { target: 'node', distPath: { root: './dist/esm' } },
      // Emit .d.ts from the JSDoc types in src/ so consumers get intellisense.
      dts: true,
    },
    {
      format: 'cjs',
      syntax: ['node 18'],
      output: { target: 'node', distPath: { root: './dist/cjs' } },
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
});
