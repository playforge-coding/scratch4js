import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// In your own project this is just:
//   import { turbowarpExtension } from 'tw-plugin-rollup';
// Here we point at the workspace package directly so the example builds in-repo.
import { turbowarpExtension } from 'tw-plugin-rollup';

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('rollup').RollupOptions} */
export default {
  input: resolve(here, 'src/index.js'),
  output: {
    file: resolve(here, 'dist/multi-file-example.js'),
    // The plugin forces `format: 'iife'` and captures the entry export, then
    // wraps the whole thing in the TurboWarp `(function (Scratch) { … })(Scratch)`
    // template. No source maps: the output is a single file meant to be pasted
    // into the TurboWarp custom-extension box or served as one .js file.
    sourcemap: false,
  },
  plugins: [
    turbowarpExtension({
      // Registry metadata — injected as the `// Name:` / `// ID:` / … header the
      // TurboWarp extensions gallery requires. `id` must match getInfo().id.
      metadata: {
        name: 'Multi-File Example',
        id: 'multifileexample',
        description: 'A demo extension bundled from several files.',
        by: 'playforge-coding',
        license: 'MPL-2.0',
      },
      // This example uses Scratch.BlockType but not the VM, so it works both
      // sandboxed and unsandboxed. Set `unsandboxed: true` if you need the VM.
      unsandboxed: false,
    }),
  ],
};
