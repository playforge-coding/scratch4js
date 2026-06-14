import { createRequire } from 'node:module';
import path from 'node:path';

import { defineConfig } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';

const require = createRequire(import.meta.url);

// wasm-git (libgit2 → wasm) powers the Source Control panel. We ship its async
// build verbatim under vendor/wasm-git/ instead of bundling it: it's loaded with
// a native dynamic import so Emscripten resolves lg2_async.wasm next to its own
// script URL. Keeping the two files side by side is what makes that work.
const wasmGitDir = path.dirname(require.resolve('wasm-git/lg2_async.js'));

// WebContainers require the page to be **cross-origin isolated**
// (`crossOriginIsolated === true`), which needs these two response headers on
// the document. The dev/preview servers set them directly. We use COEP
// `credentialless` so the same-page preview iframe can load freely.
const COOP_COEP_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

// GitHub Pages serves a project site under /<repo>/, so assets need that prefix.
// The docs deploy sets PUBLIC_PATH=/scratch4js/dev-local/ (see the root
// `build:dev-local` script); defaults to '/' for local dev/preview.
const assetPrefix = process.env.PUBLIC_PATH || '/';

export default defineConfig({
  // @webcontainer/api references a couple of Node built-ins; the polyfill keeps
  // the bundle happy in the browser.
  plugins: [pluginReact(), pluginNodePolyfill()],
  html: {
    template: './index.html',
    title: 'dev-local — in-browser code editor',
  },
  source: {
    entry: { index: './src/index.jsx' },
  },
  output: {
    assetPrefix,
    distPath: { root: 'dist' },
    copy: [
      { from: 'lg2_async.js', context: wasmGitDir, to: 'vendor/wasm-git' },
      { from: 'lg2_async.wasm', context: wasmGitDir, to: 'vendor/wasm-git' },
    ],
  },
  server: {
    headers: COOP_COEP_HEADERS,
  },
  dev: {
    // Monaco's language workers and the WebContainer must load under isolation.
    headers: COOP_COEP_HEADERS,
  },
  tools: {
    rspack: {
      // Monaco's language workers are spawned via `new Worker(new URL(...))`;
      // this just makes the chunk naming predictable.
      output: { workerChunkLoading: 'import-scripts' },
    },
  },
  performance: {
    // Monaco is heavy — let Rsbuild split it off so the shell paints fast.
    chunkSplit: { strategy: 'split-by-experience' },
  },
});
