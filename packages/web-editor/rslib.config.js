import { pluginReact } from '@rsbuild/plugin-react';
import { defineConfig } from '@rslib/core';

// web-editor is a browser React component library that imports JSX, CSS, web
// workers (Monaco), and SVG assets (the Seti icons, via webpackContext).
//
// We build it "bundleless" (bundle: false): each source file is transpiled
// individually (JSX → JS) and its imports are preserved, so the *consumer's*
// bundler resolves Monaco's workers, the icon context, and the externalized
// peer deps — exactly as if it were consuming the source. That keeps the
// published package thin (no inlined React/Monaco/xterm) and avoids the worker
// pitfalls of a fully-bundled library.
export default defineConfig({
  plugins: [pluginReact()],
  source: {
    // Transpile every JS/JSX module; the standalone styles.css ships raw (it's
    // Tailwind source the consumer processes) and the icons ship as-is.
    entry: {
      index: ['./src/**/*.{js,jsx}'],
    },
  },
  lib: [
    {
      format: 'esm',
      bundle: false,
      dts: false,
      syntax: 'es2022',
      output: {
        target: 'web',
        distPath: { root: './dist' },
      },
    },
  ],
  output: {
    // Preserve class names verbatim so the consumer's Tailwind can scan them.
    minify: false,
  },
});
