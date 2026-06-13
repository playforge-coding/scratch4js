import { defineConfig } from '@rsbuild/core';

// scratch-p2p is a browser extension, not a web app. We bundle each script
// (PeerJS is pulled from npm and inlined into the page script) and copy the
// static files (manifest, icons, popup markup) into dist/, which is the
// unpacked extension you load into Chrome/Firefox.
//
// Three independent entries, each emitted as a single self-contained classic
// script (chunkSplit: all-in-one) so they can be loaded as a content script,
// an injected page script, and a popup script respectively.
export default defineConfig({
  source: {
    entry: {
      content: './src/content.js',
      'page/sync': './src/page/sync.js',
      'popup/popup': './src/popup/popup.js',
    },
  },
  output: {
    target: 'web',
    distPath: {
      root: 'dist',
      js: '', // emit JS at the dist root (preserving the entry-name subpaths)
    },
    filenameHash: false,
    // We write popup.html ourselves; don't let rsbuild generate HTML pages.
    copy: [
      { from: 'src/manifest.json', to: 'manifest.json' },
      { from: 'src/icons', to: 'icons' },
      { from: 'src/popup/popup.html', to: 'popup/popup.html' },
      { from: 'src/popup/popup.css', to: 'popup/popup.css' },
    ],
  },
  performance: {
    // Keep every entry as one file — no shared runtime/vendor chunks, which a
    // content script can't load.
    chunkSplit: { strategy: 'all-in-one' },
  },
  tools: {
    // No generated HTML — the popup uses our hand-written popup.html.
    htmlPlugin: false,
  },
});
