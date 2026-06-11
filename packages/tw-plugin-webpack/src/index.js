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

// Assets imported by the extension are inlined as base64 `data:` URIs by
// default — a TurboWarp extension is a single file and can't reference separate
// asset files. SVG/PNG/etc. imports become the `data:` strings you hand to
// `menuIconURI` / `blockIconURI`.
const DEFAULT_ASSET_PATTERN = /\.(svg|png|jpe?g|gif|webp|avif)$/i;

/**
 * Registry metadata. Each field becomes a `// Key: Value` comment line at the
 * very top of the file — the header the
 * [TurboWarp extensions gallery](https://github.com/TurboWarp/extensions)
 * requires for submission:
 *
 * ```js
 * // Name: Consoles
 * // ID: sipcconsole
 * // Description: Blocks that interact with the developer console.
 * // By: -SIPC-
 * // License: MIT
 * ```
 *
 * @typedef {object} TurboWarpExtensionMetadata
 * @property {string} [name] Display name shown in the extension list.
 * @property {string} [id] Unique extension id. **Must match** the `id` your
 *   `getInfo()` returns.
 * @property {string} [description] One-line description for the gallery.
 * @property {string | string[]} [by] Author(s). Each entry becomes its own
 *   `// By:` line and may include a profile link, e.g.
 *   `"GarboMuffin <https://scratch.mit.edu/users/GarboMuffin/>"`.
 * @property {string | string[]} [original] Original author(s) when this is a
 *   derivative — one `// Original:` line each.
 * @property {string} [license] SPDX license id, e.g. `"MPL-2.0"`.
 * @property {string} [context] Extra `// Context:` line.
 */

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
 * @property {TurboWarpExtensionMetadata} [metadata] Registry metadata injected
 *   as the `// Name:` / `// ID:` / … comment header the TurboWarp gallery reads.
 *   Omit it for extensions you only ever load manually.
 * @property {boolean | RegExp} [inlineAssets=true] Configure the bundler so
 *   importing an asset inlines it as a base64 `data:` URI — the form TurboWarp
 *   wants for `menuIconURI` / `blockIconURI`. With this on you can
 *   `import iconURI from './icon.svg'` and use `iconURI` directly. Defaults to
 *   matching `svg`, `png`, `jpg`, `gif`, `webp`, `avif`; pass a `RegExp` to use
 *   your own test, or `false` to leave asset handling to your own config.
 * @property {string} [name] Human-readable name used in the unsandboxed-guard
 *   error message. Defaults to `metadata.name` when set, otherwise
 *   `"This extension"`.
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
      metadata: null,
      inlineAssets: true,
      name: undefined,
      varName: '__turbowarpExtension__',
      libraryExport: 'default',
      ...options,
    };
    // Fall back to the metadata name so the guard message reads naturally
    // without having to repeat the name in two places.
    this.options.name =
      this.options.name ?? this.options.metadata?.name ?? 'This extension';
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

    // Inline asset imports as base64 `data:` URIs so `import icon from
    // './icon.svg'` yields a string usable as `menuIconURI` — and so nothing is
    // emitted as a separate file (the extension must be self-contained).
    if (this.options.inlineAssets) {
      const test =
        this.options.inlineAssets instanceof RegExp
          ? this.options.inlineAssets
          : DEFAULT_ASSET_PATTERN;
      const module = compiler.options.module || (compiler.options.module = {});
      const rules = module.rules || (module.rules = []);
      rules.push({ test, type: 'asset/inline' });
    }

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
 * The registry metadata header (`// Name:` / `// ID:` / …), in the order the
 * gallery conventionally lists them, followed by the opening of the TurboWarp
 * IIFE template and an optional unsandboxed guard.
 *
 * @param {Required<TurboWarpExtensionPluginOptions>} options
 * @returns {string}
 */
function buildPrefix(options) {
  const lines = [];
  const header = buildMetadataHeader(options.metadata);
  if (header) lines.push(header, ''); // blank line between header and code
  lines.push('(function (Scratch) {', '"use strict";');
  if (options.unsandboxed) {
    const message = JSON.stringify(`${options.name} must be run unsandboxed.`);
    lines.push(
      `if (!Scratch.extensions.unsandboxed) { throw new Error(${message}); }`,
    );
  }
  return lines.join('\n');
}

// Known metadata fields, paired with the exact label the gallery expects, in
// conventional order. Unlisted fields are emitted afterwards using their key
// verbatim as the label.
const METADATA_FIELDS = [
  ['name', 'Name'],
  ['id', 'ID'],
  ['description', 'Description'],
  ['by', 'By'],
  ['original', 'Original'],
  ['license', 'License'],
  ['context', 'Context'],
];

/**
 * Render registry metadata as a block of `// Key: Value` comment lines.
 * Array-valued fields (e.g. `by`) produce one line per entry, and every value
 * is collapsed onto a single line so it can't break out of the comment.
 *
 * @param {TurboWarpExtensionMetadata | null | undefined} metadata
 * @returns {string} The joined comment lines, or `''` when there's nothing.
 */
function buildMetadataHeader(metadata) {
  if (!metadata) return '';
  const lines = [];
  const emit = (label, value) => {
    if (value == null) return;
    for (const entry of Array.isArray(value) ? value : [value]) {
      const text = String(entry)
        .replace(/[\r\n]+/g, ' ')
        .trim();
      if (text) lines.push(`// ${label}: ${text}`);
    }
  };
  const known = new Set();
  for (const [key, label] of METADATA_FIELDS) {
    known.add(key);
    if (key in metadata) emit(label, metadata[key]);
  }
  for (const key of Object.keys(metadata)) {
    if (!known.has(key)) emit(key, metadata[key]);
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
