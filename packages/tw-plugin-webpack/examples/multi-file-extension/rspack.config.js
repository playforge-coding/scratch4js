import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// In your own project this is just:
//   import { TurboWarpExtensionPlugin } from 'tw-plugin-webpack';
// Here we point at the workspace package directly so the example builds in-repo.
import { TurboWarpExtensionPlugin } from 'tw-plugin-webpack';

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('@rspack/core').Configuration} */
export default {
  // `webpack build -c rspack.config.js` works too — this config is bundler
  // agnostic. The only Scratch-specific part is the plugin.
  mode: 'production',
  target: 'web',
  // No source maps: the output is a single file meant to be pasted into the
  // TurboWarp custom-extension box or served as one .js file.
  devtool: false,
  entry: resolve(here, 'src/index.js'),
  output: {
    path: resolve(here, 'dist'),
    filename: 'multi-file-example.js',
    clean: true,
  },
  plugins: [
    new TurboWarpExtensionPlugin({
      // Registry metadata — injected as the `// Name:` / `// ID:` / … header
      // the TurboWarp extensions gallery requires. `id` must match getInfo().id.
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
