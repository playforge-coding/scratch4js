/**
 * tw-plugin-webpack — bundle a multi-file TurboWarp / Scratch extension into a
 * single unsandboxed-extension file with **webpack** or **Rspack**.
 *
 * Write your extension across as many ES modules as you like, `export default`
 * the extension class (or an already-constructed instance) from the entry
 * module, and this plugin wraps the bundle in the standard TurboWarp IIFE
 * template and calls `Scratch.extensions.register()` for you:
 *
 * ```js
 * (function (Scratch) {
 *   "use strict";
 *   // ...all of your bundled modules, inlined...
 *   Scratch.extensions.register(new MyExtension());
 * })(Scratch);
 * ```
 *
 * Because the entire bundle lives inside the IIFE, every bare reference to the
 * `Scratch` global inside your code resolves to the local parameter — exactly
 * the "personal copy of the Scratch API" the TurboWarp docs recommend.
 *
 * @module tw-plugin-webpack
 */

const PLUGIN_NAME = 'TurboWarpExtensionPlugin';

/**
 * @typedef {object} TurboWarpExtensionPluginOptions
 * @property {boolean} [register=true] Append a
 *   `Scratch.extensions.register(...)` call for the entry's chosen export. Set
 *   to `false` if you would rather call `register()` yourself somewhere in your
 *   own code (it still runs inside the IIFE, so the `Scratch` global is
 *   available there too).
 * @property {boolean} [unsandboxed=false] Emit a guard at the top of the bundle
 *   that throws unless the extension is running unsandboxed
 *   (`Scratch.extensions.unsandboxed`). Use this for extensions that require
 *   direct access to the VM.
 * @property {string} [name="This extension"] Human-readable name used in the
 *   unsandboxed-guard error message.
 * @property {string} [varName="__turbowarpExtension__"] Identifier the bundle's
 *   export is assigned to before registration. Only change it if it somehow
 *   collides with a global your extension relies on.
 * @property {string | string[]} [libraryExport="default"] Which export of the
 *   entry module is the extension. Defaults to the default export; pass a named
 *   export (or a path like `['nested', 'Extension']`) to use something else.
 */

/**
 * Webpack / Rspack plugin that turns a normal multi-module bundle into a
 * single-file TurboWarp unsandboxed extension.
 *
 * Structurally compatible with both `webpack.WebpackPluginInstance` and
 * `@rspack/core`'s `RspackPluginInstance`. The `compiler` parameter is typed
 * loosely (`any`) on purpose so the published types don't force a dependency on
 * either bundler — pick whichever one you build with.
 */
class TurboWarpExtensionPlugin {
  /** @param {TurboWarpExtensionPluginOptions} [options] */
  constructor(options = {}) {
    /** @type {Required<TurboWarpExtensionPluginOptions>} */
    this.options = {
      register: true,
      unsandboxed: false,
      name: 'This extension',
      varName: '__turbowarpExtension__',
      libraryExport: 'default',
      ...options,
    };
  }

  /** @param {any} compiler A webpack or Rspack `Compiler`. */
  apply(compiler) {
    // `compiler.webpack` is the bundler's own API namespace. It exists on both
    // webpack 5 and Rspack, so the plugin never has to import (or even depend
    // on) either one directly.
    const webpack = /** @type {any} */ (compiler).webpack;
    const { Compilation, sources, library } = webpack;
    const { ConcatSource } = sources;
    const output = compiler.options.output;

    // Shape the bundle so the entry's export is reachable: a single
    // self-executing file that assigns the chosen export to a local `var`,
    // which the IIFE wrapper below reads and registers.
    output.iife = true;
    output.library = {
      type: 'var',
      name: this.options.varName,
      export: this.options.libraryExport,
    };
    // `EnableLibraryPlugin` is auto-applied only for library types declared in
    // the *initial* config. We set the type programmatically here, so we have
    // to enable support for it ourselves.
    new library.EnableLibraryPlugin('var').apply(compiler);

    const prefix = buildPrefix(this.options);
    const suffix = buildSuffix(this.options);

    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          // Run after minification (OPTIMIZE_SIZE) but before hashing
          // (OPTIMIZE_HASH) so [contenthash] filenames stay correct.
          stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
        },
        () => {
          for (const file of entryJsFiles(compilation)) {
            compilation.updateAsset(
              file,
              (old) => new ConcatSource(prefix, '\n', old, '\n', suffix),
            );
          }
        },
      );
    });
  }
}

/**
 * Opening of the TurboWarp IIFE template, plus an optional unsandboxed guard.
 *
 * @param {Required<TurboWarpExtensionPluginOptions>} options
 * @returns {string}
 */
function buildPrefix(options) {
  const lines = ['(function (Scratch) {', '"use strict";'];
  if (options.unsandboxed) {
    const message = JSON.stringify(`${options.name} must be run unsandboxed.`);
    lines.push(
      `if (!Scratch.extensions.unsandboxed) { throw new Error(${message}); }`,
    );
  }
  return lines.join('\n');
}

/**
 * Closing of the IIFE template. When `register` is enabled, the entry's export
 * is registered — instantiated first if it is a class (a function), or passed
 * straight through if it is already an instance.
 *
 * @param {Required<TurboWarpExtensionPluginOptions>} options
 * @returns {string}
 */
function buildSuffix(options) {
  const lines = [];
  if (options.register) {
    lines.push(
      '(function () {',
      `  var extension = ${options.varName};`,
      '  Scratch.extensions.register(',
      '    typeof extension === "function" ? new extension() : extension',
      '  );',
      '})();',
    );
  }
  lines.push('})(Scratch);');
  return lines.join('\n');
}

/**
 * Collect the `.js` files that make up the initial (synchronously loaded)
 * entrypoints — those are what end up inside the single extension file.
 *
 * @param {any} compilation A webpack or Rspack `Compilation`.
 * @returns {Set<string>}
 */
function entryJsFiles(compilation) {
  const files = new Set();
  for (const entrypoint of compilation.entrypoints.values()) {
    for (const file of entrypoint.getFiles()) {
      if (file.endsWith('.js')) files.add(file);
    }
  }
  // Fallback for unusual setups that don't surface entrypoint files: wrap
  // every emitted .js asset instead.
  if (files.size === 0) {
    for (const name of Object.keys(compilation.assets)) {
      if (name.endsWith('.js')) files.add(name);
    }
  }
  return files;
}

export { TurboWarpExtensionPlugin };
export default TurboWarpExtensionPlugin;
