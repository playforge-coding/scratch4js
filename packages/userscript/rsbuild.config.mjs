import { defineConfig } from '@rsbuild/core';

// The userscript source is authored as ES modules (src/) and bundled here into
// ONE self-executing classic script, dist/userscript.js, which TurboWarp
// Desktop loads from its config directory. `chunkSplit: all-in-one` keeps it a
// single file (no runtime/vendor chunks a userscript couldn't load), and the
// userstyle is copied alongside it.
export default defineConfig({
  source: {
    entry: {
      userscript: './src/index.js',
    },
  },
  output: {
    target: 'web',
    distPath: {
      root: 'dist',
      js: '', // emit userscript.js at the dist root, not dist/static/js
    },
    filenameHash: false,
    injectStyles: true, // no separate CSS chunk; we ship userstyle.css ourselves
    copy: [
      { from: 'src/userstyle.css', to: 'userstyle.css' },
      // The minified bundle strips comments, so ship the ISC notice alongside it.
      { from: 'THIRD-PARTY-NOTICES.md', to: 'THIRD-PARTY-NOTICES.md' },
    ],
  },
  performance: {
    chunkSplit: { strategy: 'all-in-one' },
  },
  tools: {
    htmlPlugin: false, // a userscript, not a web page
  },
});
