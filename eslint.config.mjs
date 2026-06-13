import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  js.configs.recommended,
  {
    // The create-tw-extension CLI's Ink UI is written as JSX (built by Rsbuild).
    files: ['**/*.jsx'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  {
    // The scratch-p2p browser extension uses the WebExtension APIs (chrome/browser).
    files: ['**/scratch-p2p/src/**/*.js'],
    languageOptions: { globals: { ...globals.webextensions } },
  },
  {
    // TurboWarp extension sources reference `Scratch`, a global injected by the
    // host page (the plugin's IIFE wrapper binds it as a parameter).
    files: [
      '**/tw-plugin-webpack/examples/**/*.js',
      '**/tw-plugin-rollup/examples/**/*.js',
    ],
    languageOptions: { globals: { Scratch: 'readonly' } },
  },
  {
    // The vendored scratch-gui (reference only) and scratch glue files use
    // upstream's lint config and a different style; don't lint them here.
    files: [
      '**/scratch/make-toolbox-xml.js',
      '**/scratch/vm-blocks.js',
      '**/scratch/define-dynamic-block.js',
    ],
    rules: { 'no-unused-vars': 'off' },
  },
  {
    // Build output, sample projects, and vendored upstreams are not ours to lint.
    ignores: [
      '**/dist/**',
      '**/doc_build/**',
      '**/example_project/**',
      'scratch-gui/**',
      '**/scratch-stubs/**',
    ],
  },
];
