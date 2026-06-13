import { createRequire } from 'node:module';

import { defineConfig, rspack } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';

const require = createRequire(import.meta.url);

// WebContainers require the page to be **cross-origin isolated**
// (`crossOriginIsolated === true`), which needs these two response headers on
// the document. The dev server sets them directly; in production (GitHub Pages
// can't set headers) the coi-serviceworker shim in public/ injects them — see
// index.html and README.
//
// We use COEP `credentialless` rather than `require-corp` so we can also embed
// the cross-origin TurboWarp editor in an anonymous (`credentialless`) iframe
// for the live preview — `require-corp` would block it. WebContainers support
// credentialless mode.
const COOP_COEP_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

// GitHub Pages serves a project site under /<repo>/, so assets need that prefix.
// Set PUBLIC_PATH=/scratch4js-maker/ (or whatever) at build time for deploys;
// defaults to '/' for local preview and apex/user-page hosting.
const assetPrefix = process.env.PUBLIC_PATH || '/';

export default defineConfig({
  // scratch-vm and friends assume webpack-4 behavior: Node built-ins are
  // auto-polyfilled (ajv → 'url', etc.). Rspack doesn't, so add the polyfills.
  plugins: [pluginReact(), pluginNodePolyfill()],
  html: {
    template: './index.html',
    title: 'TurboWarp Extension Maker',
  },
  source: {
    entry: { index: './src/index.jsx' },
  },
  output: {
    assetPrefix,
    // Monaco ships its own font (codicon.ttf) and the bundle is large; a stable
    // dist is fine for a static host.
    distPath: { root: 'dist' },
  },
  server: {
    headers: COOP_COEP_HEADERS,
  },
  dev: {
    // Workers (Monaco) and the WebContainer iframe must load under isolation too.
    headers: COOP_COEP_HEADERS,
  },
  tools: {
    // Tailwind CSS v4 is wired up via postcss.config.mjs (auto-detected).
    rspack: {
      // Monaco's language workers are spawned via `new Worker(new URL(...))`
      // (see web-editor's editor/monaco-env.js). Rspack handles that natively;
      // this just makes the chunk naming predictable.
      output: { workerChunkLoading: 'import-scripts' },
      resolveLoader: {
        // scratch-vm references its sandboxed-extension worker via webpack-4's
        // `worker-loader!…` inline loader. We load extensions unsandboxed, so
        // redirect that loader to a no-op (see scratch-stubs/).
        alias: {
          'worker-loader':
            require.resolve('./scratch-stubs/noop-worker-loader.cjs'),
        },
      },
      plugins: [
        // The iframe sandbox worker uses a webpack-4-only inline loader too;
        // replace the whole module with a no-op (never used unsandboxed).
        new rspack.NormalModuleReplacementPlugin(
          /tw-iframe-extension-worker$/,
          require.resolve('./scratch-stubs/iframe-worker-stub.cjs'),
        ),
      ],
    },
  },
  performance: {
    // Monaco is heavy — let Rsbuild split it off so the shell paints fast.
    chunkSplit: { strategy: 'split-by-experience' },
  },
});
