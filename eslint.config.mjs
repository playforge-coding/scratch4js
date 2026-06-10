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
    // Build output and sample projects are not ours to lint.
    ignores: ['**/dist/**', '**/example_project/**'],
  },
];
