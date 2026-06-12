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
    // TurboWarp extension sources reference `Scratch`, a global injected by the
    // host page (the plugin's IIFE wrapper binds it as a parameter).
    files: [
      '**/tw-plugin-webpack/examples/**/*.js',
      '**/tw-plugin-rollup/examples/**/*.js',
    ],
    languageOptions: { globals: { Scratch: 'readonly' } },
  },
  {
    // Build output and sample projects are not ours to lint.
    ignores: ['**/dist/**', '**/doc_build/**', '**/example_project/**'],
  },
];
