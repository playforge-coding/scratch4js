# tw-plugin-rollup

Write a [TurboWarp / Scratch extension](https://github.com/TurboWarp/docs/tree/master/docs/development/extensions) across **as many files as you like**, then let **Rollup**, **Rolldown**, or **Vite** bundle it into the single self-contained file TurboWarp expects.

> The same plugin for **webpack / Rspack** lives in [`tw-plugin-webpack`](../tw-plugin-webpack).

A normal TurboWarp extension is one file wrapped in an IIFE that registers itself:

```js
(function (Scratch) {
  'use strict';
  class MyExtension {
    /* getInfo() + block methods */
  }
  Scratch.extensions.register(new MyExtension());
})(Scratch);
```

That's fine for a toy, but it means everything — every block, helper, and constant — has to live in one file. This plugin lets you split the extension into real ES modules and produces exactly that IIFE for you, with `Scratch.extensions.register(...)` wired up automatically.

It uses only the standard Rollup plugin API (plus Node's `fs`), so the exact same plugin object works in **Rollup 3/4**, **Rolldown**, and **Vite** — including **Vite 8**, which builds on Rolldown.

## How it works

Point your bundler at an entry module that `export default`s the extension class (or instance). The plugin:

1. Configures the build to emit a **single self-executing file** (`format: 'iife'`) whose entry export is captured in a local variable.
2. Wraps the whole bundle in the standard `(function (Scratch) { … })(Scratch)` template.
3. Appends `Scratch.extensions.register(new YourExtension())`.

Because the entire bundle lives **inside** the IIFE, every bare reference to the `Scratch` global in your code binds to the local parameter — the "personal copy of the Scratch API" the TurboWarp docs recommend. No `import` of `Scratch` is needed (or possible); it's a host global, just like in a hand-written extension.

## Install

```sh
npm install -D tw-plugin-rollup
# plus whichever bundler you use:
npm install -D rollup     # or: rolldown, or: vite
```

## Usage

Split your extension however you like:

```js
// src/blocks/greeting.js
export const greet = (name) => `Hello, ${name}!`;
```

```js
// src/index.js — the entry. Default-export the class; do NOT call register().
import { greet } from './blocks/greeting.js';

export default class MyExtension {
  getInfo() {
    return {
      id: 'myextension',
      name: 'My Extension',
      blocks: [
        {
          opcode: 'hello',
          blockType: Scratch.BlockType.REPORTER,
          text: 'greet [WHO]',
          arguments: {
            WHO: { type: Scratch.ArgumentType.STRING, defaultValue: 'world' },
          },
        },
      ],
    };
  }
  hello(args) {
    return greet(args.WHO);
  }
}
```

### Rollup / Rolldown

```js
// rollup.config.mjs  (rolldown.config.mjs is identical — same plugin API)
import { turbowarpExtension } from 'tw-plugin-rollup';

export default {
  input: './src/index.js',
  output: {
    file: './dist/my-extension.js',
    sourcemap: false, // single pasteable file — source maps just bloat it
  },
  plugins: [turbowarpExtension({ name: 'My Extension' })],
};
```

The plugin forces `output.format = 'iife'` and captures the entry export itself, so you don't set `format`/`name` — just give it an `input` and an output `file`.

For **Rolldown**, import from `rolldown` instead of `rollup`; the config and plugin are otherwise unchanged.

### Vite (incl. Vite 8 / Rolldown)

Build the extension as a single-file library. The plugin carries `enforce: 'pre'`, so its asset inlining runs ahead of Vite's own asset handling:

```js
// vite.config.mjs
import { defineConfig } from 'vite';
import { turbowarpExtension } from 'tw-plugin-rollup';

export default defineConfig({
  build: {
    // One entry → one chunk. The plugin turns it into the IIFE template.
    lib: { entry: './src/index.js', formats: ['iife'], name: 'extension' },
    rollupOptions: { output: { entryFileNames: 'my-extension.js' } },
    sourcemap: false,
    // Vite already inlines small assets; let it (and pass `inlineAssets: false`),
    // or keep the plugin's inlining and raise this so it doesn't double up.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
  plugins: [turbowarpExtension({ name: 'My Extension', inlineAssets: false })],
});
```

Build it, then load `dist/my-extension.js` in TurboWarp via **add extension → Custom Extension**, or serve it and use `?extension=<url>`.

## Options

| Option          | Type                 | Default                    | Description                                                                                                                                                          |
| --------------- | -------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metadata`      | `object`             | —                          | Registry header injected as `// Name:` / `// ID:` / … comment lines (see [below](#submitting-to-the-gallery)).                                                       |
| `inlineAssets`  | `boolean \| RegExp`  | `true`                     | Inline imported assets (svg/png/…) as base64 `data:` URIs so `import icon from './icon.svg'` works (see [below](#icons)). `RegExp` to customize, `false` to disable. |
| `register`      | `boolean`            | `true`                     | Append the `Scratch.extensions.register(...)` call. Set `false` to call `register()` yourself inside your code.                                                      |
| `unsandboxed`   | `boolean`            | `false`                    | Emit a guard that throws unless the extension runs unsandboxed (`Scratch.extensions.unsandboxed`).                                                                   |
| `name`          | `string`             | `metadata.name`            | Name used in the unsandboxed-guard error message. Falls back to `metadata.name`, then `"This extension"`.                                                            |
| `libraryExport` | `string \| string[]` | `"default"`                | Which export of the entry module is the extension. Use a named export instead of the default if you prefer.                                                          |
| `varName`       | `string`             | `"__turbowarpExtension__"` | Internal identifier the export is assigned to before registration. Change only on an unlucky name collision.                                                         |

`register` accepts either a **class** (it's instantiated with `new`) or an already-constructed **instance** (registered as-is).

## Submitting to the gallery

The [TurboWarp extensions gallery](https://github.com/TurboWarp/extensions) requires a metadata header — a block of `// Key: Value` comments at the very top of the file. Pass `metadata` and the plugin emits it above the IIFE:

```js
turbowarpExtension({
  metadata: {
    name: 'Consoles',
    id: 'sipcconsole', // must match getInfo().id
    description: 'Blocks that interact with the developer console.',
    by: '-SIPC-', // or an array → one `// By:` line each
    license: 'MIT',
  },
});
```

produces, at the top of the bundle:

```js
// Name: Consoles
// ID: sipcconsole
// Description: Blocks that interact with the developer console.
// By: -SIPC-
// License: MIT

(function (Scratch) {
  /* …your bundle… */
})(Scratch);
```

Fields are emitted in the conventional order **Name → ID → Description → By → Original → License → Context**; `by`/`original` accept an array for multiple lines, and any extra keys you add are appended verbatim (`// extra: …`). The header is added in `renderChunk` (after minification), so it's never stripped.

## Icons

`menuIconURI` / `blockIconURI` expect a `data:` URI. With `inlineAssets` on (the default), just **import the image** — the plugin's `load` hook reads the file and resolves the import to a base64 `data:` URI string:

```js
import iconURI from './icon.svg'; // → "data:image/svg+xml;base64,…"

export default class MyExtension {
  getInfo() {
    return {
      id: 'myextension',
      name: 'My Extension',
      menuIconURI: iconURI,
      blocks: [
        /* … */
      ],
    };
  }
}
```

Details:

- `svg`, `png`, `jpg`, `gif`, `webp`, and `avif` imports are inlined by default. Pass a `RegExp` to match your own set (`inlineAssets: /\.(svg|png)$/i`), or `inlineAssets: false` to leave asset handling to your own config.
- Inlining (rather than emitting a separate file) is required: a TurboWarp extension is a **single file** and can't reference external assets.
- **TypeScript:** add an asset module declaration so the import is typed, e.g. `declare module '*.svg' { const url: string; export default url; }`.
- **Vite** already inlines assets of its own accord. Set `inlineAssets: false` and let Vite handle it (raising `build.assetsInlineLimit` so nothing is emitted as a separate file), to avoid two layers fighting over the same import.

## Notes & caveats

- **One file only.** TurboWarp loads a single `<script>`, so don't use dynamic `import()` / code splitting — keep it one synchronous bundle. The plugin sets `output.inlineDynamicImports` to enforce a single chunk.
- **`Scratch` is a global**, not an import. Your editor/linter may flag it; declare it as a readonly global (e.g. in ESLint `languageOptions.globals`). For TypeScript, [`@turbowarp/types`](https://github.com/TurboWarp/types) provides the `Scratch` typings for **Scratch** extensions. If you're targeting **TurboWarp or one of its forks**, use [`types-tw`](https://github.com/TurboWarp/types-tw) instead, which adds the TurboWarp-specific APIs. It's no longer published to npm, so install it from git — it keeps the `@turbowarp/types` package name as a drop-in replacement: `npm install @turbowarp/types@git+https://github.com/TurboWarp/types-tw.git#tw`.
- **Source maps:** prefer `sourcemap: false`. A trailing `//# sourceMappingURL=` comment would otherwise sit in the middle of the wrapped file. (When sourcemaps are on, the plugin uses `magic-string` to keep the mapping correct across the wrapper.)

## Is a plugin the best way to do this?

For the common case, **yes** — it's one import and zero config beyond a name. But it's worth knowing the alternatives:

- **Plain `banner`/`footer`.** The wrapper is static text, so you can skip the plugin and use Rollup's `output.banner` / `output.footer` around an `iife`-format build with a `name`. The plugin just packages that up, handles the registration/guards, and inlines assets for you.
- **Vite library mode.** If you already build libraries with Vite, an `iife` lib build plus a custom `banner`/`footer` gets you most of the way. The downside is you still have to hand-write the register call and reach into the IIFE export.

The dedicated plugin wins when you want it to "just work" and stay bundler-agnostic (Rollup **and** Rolldown **and** Vite) — which is exactly what it's for.

## Example

A runnable multi-file example lives in [`examples/multi-file-extension`](./examples/multi-file-extension). Build it with:

```sh
pnpm build          # build the plugin first
pnpm build:example  # bundles src/{index,blocks/*}.js -> dist/multi-file-example.js
```

## License

MPL-2.0
