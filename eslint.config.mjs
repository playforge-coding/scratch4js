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
    // TurboWarp extension sources reference `Scratch`, a global injected by the
    // host page (the plugin's IIFE wrapper binds it as a parameter).
    files: ['**/tw-plugin-webpack/examples/**/*.js'],
    languageOptions: { globals: { Scratch: 'readonly' } },
  },
  {
    // Build output and sample projects are not ours to lint.
    ignores: ['**/dist/**', '**/example_project/**'],
  },
];
