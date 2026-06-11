/**
 * tw-plugin-rollup — bundle a multi-file TurboWarp / Scratch extension into a
 * single unsandboxed-extension file with **Rollup**, **Rolldown**, or **Vite**
 * (including Vite 8, which builds on Rolldown).
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
 * The plugin uses only the standard Rollup plugin API plus Node's `fs`, so the
 * exact same object works in Rollup, Rolldown, and Vite without depending on
 * any one of them.
 *
 * @module tw-plugin-rollup
 */

import { readFileSync } from 'node:fs';

import MagicString from 'magic-string';

const PLUGIN_NAME = 'turbowarp-extension';

// Assets imported by the extension are inlined as base64 `data:` URIs by
// default — a TurboWarp extension is a single file and can't reference separate
// asset files. SVG/PNG/etc. imports become the `data:` strings you hand to
// `menuIconURI` / `blockIconURI`.
const DEFAULT_ASSET_PATTERN = /\.(svg|png|jpe?g|gif|webp|avif)$/i;

// Maps the file extensions we inline to the MIME type the `data:` URI advertises.
const MIME_TYPES = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
};

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
 * @property {boolean | RegExp} [inlineAssets=true] Have the plugin resolve asset
 *   imports to a base64 `data:` URI — the form TurboWarp wants for
 *   `menuIconURI` / `blockIconURI`. With this on you can
 *   `import iconURI from './icon.svg'` and use `iconURI` directly. Defaults to
 *   matching `svg`, `png`, `jpg`, `gif`, `webp`, `avif`; pass a `RegExp` to use
 *   your own test, or `false` to leave asset handling to your own config (e.g.
 *   Vite's, which already inlines assets).
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
 * Rollup / Rolldown / Vite plugin that turns a normal multi-module bundle into
 * a single-file TurboWarp unsandboxed extension.
 *
 * Returns a plain Rollup plugin object, so it slots straight into a Rollup or
 * Rolldown `plugins` array, or a Vite config's `plugins`. It carries an
 * `enforce: 'pre'` hint so that, under Vite, its asset `load` hook runs before
 * Vite's own asset handling.
 *
 * @param {TurboWarpExtensionPluginOptions} [options]
 * @returns {import('rollup').Plugin}
 */
function turbowarpExtension(options = {}) {
  /** @type {Required<TurboWarpExtensionPluginOptions>} */
  const resolved = {
    register: true,
    unsandboxed: false,
    metadata: null,
    inlineAssets: true,
    name: undefined,
    varName: '__turbowarpExtension__',
    libraryExport: 'default',
    ...options,
  };
  // Fall back to the metadata name so the guard message reads naturally without
  // having to repeat the name in two places.
  resolved.name = resolved.name ?? resolved.metadata?.name ?? 'This extension';

  const assetPattern =
    resolved.inlineAssets instanceof RegExp
      ? resolved.inlineAssets
      : DEFAULT_ASSET_PATTERN;

  const prefix = buildPrefix(resolved);
  const suffix = buildSuffix(resolved);

  return {
    name: PLUGIN_NAME,
    // Vite-only hint (ignored by Rollup/Rolldown): run our `load` hook ahead of
    // Vite's asset plugins so `import icon from './icon.svg'` reaches us first.
    enforce: 'pre',

    // Shape the bundle so the entry's export is reachable: a single
    // self-executing IIFE that captures the chosen export in `varName`, which
    // the wrapper below reads and registers.
    outputOptions(outputOptions) {
      outputOptions.format = 'iife';
      outputOptions.name = resolved.varName;
      // `default` exposes the bare default export as `varName`; any other export
      // selector needs the namespace object so we can index into it (see
      // `exportAccessor`).
      outputOptions.exports =
        resolved.libraryExport === 'default' ? 'default' : 'named';
      // Single pasteable file: never split, even if the graph has dynamic imports.
      outputOptions.inlineDynamicImports = true;
      return outputOptions;
    },

    // Inline asset imports as base64 `data:` URIs so `import icon from
    // './icon.svg'` yields a string usable as `menuIconURI` — and so nothing is
    // emitted as a separate file (the extension must be self-contained).
    load(id) {
      if (!resolved.inlineAssets) return null;
      // Strip any query/hash suffix bundlers tack on (e.g. Vite's `?import`).
      const path = id.replace(/[?#].*$/, '');
      if (!assetPattern.test(path)) return null;
      const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const base64 = readFileSync(path).toString('base64');
      const dataUri = `data:${mime};base64,${base64}`;
      return { code: `export default ${JSON.stringify(dataUri)};`, map: null };
    },

    // Wrap the entry chunk in the TurboWarp IIFE template. Runs after Rollup has
    // produced the inner `var varName = (function () { … })()` IIFE, so the
    // export is already captured by the time the registration suffix reads it.
    renderChunk(code, chunk, outputOptions) {
      if (!chunk.isEntry) return null;
      const magic = new MagicString(code);
      magic.prepend(`${prefix}\n`);
      magic.append(`\n${suffix}`);
      return {
        code: magic.toString(),
        map: outputOptions.sourcemap
          ? magic.generateMap({ hires: true })
          : null,
      };
    },
  };
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
 * Build the JS expression that reads the chosen export off `varName`. For the
 * default export that's just `varName`; a named export (or a nested path)
 * indexes into the namespace object Rollup assigns to `varName`.
 *
 * @param {Required<TurboWarpExtensionPluginOptions>} options
 * @returns {string}
 */
function exportAccessor(options) {
  if (options.libraryExport === 'default') return options.varName;
  const path = Array.isArray(options.libraryExport)
    ? options.libraryExport
    : [options.libraryExport];
  return path.reduce(
    (expr, key) => `${expr}[${JSON.stringify(key)}]`,
    options.varName,
  );
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
      `  var extension = ${exportAccessor(options)};`,
      '  Scratch.extensions.register(',
      '    typeof extension === "function" ? new extension() : extension',
      '  );',
      '})();',
    );
  }
  lines.push('})(Scratch);');
  return lines.join('\n');
}

export { turbowarpExtension };
export default turbowarpExtension;
