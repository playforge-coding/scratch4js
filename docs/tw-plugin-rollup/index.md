---
title: TurboWarp extension bundler (Rollup/Rolldown/Vite)
description: Bundle a multi-file TurboWarp/Scratch extension into one IIFE-wrapped file with Rollup, Rolldown, or Vite.
---

# `tw-plugin-rollup`

[`tw-plugin-rollup`](https://github.com/playforge-coding/scratch4js/tree/main/packages/tw-plugin-rollup)
is a **Rollup**, **Rolldown**, and **Vite** plugin that lets you write a
[TurboWarp / Scratch extension](https://github.com/TurboWarp/docs/tree/master/docs/development/extensions)
across as many files as you like, then bundles it into the single
self-contained file TurboWarp expects.

It is the Rollup-ecosystem twin of
[`tw-plugin-webpack`](/tw-plugin-webpack/) — same output, same options, for the
other half of the bundler world. Because it relies only on the standard Rollup
plugin API, the exact same plugin object works in **Rollup 3/4**, **Rolldown**,
and **Vite** (including **Vite 8**, which builds on Rolldown).

A normal TurboWarp extension is one file wrapped in an IIFE that registers
itself:

```js
(function (Scratch) {
  'use strict';
  class MyExtension {
    /* getInfo() + block methods */
  }
  Scratch.extensions.register(new MyExtension());
})(Scratch);
```

That works, but it forces every block, helper, and constant into one file. This
plugin lets you split the extension into real ES modules and produces exactly
that IIFE for you, with `Scratch.extensions.register(...)` wired up
automatically.

## How it works

Point your bundler at an entry module that `export default`s the extension class
(or instance). The plugin:

1. Configures the build to emit a **single self-executing file**
   (`format: 'iife'`) whose entry export is captured in a local variable.
2. Wraps the whole bundle in the standard `(function (Scratch) { … })(Scratch)`
   template.
3. Appends `Scratch.extensions.register(new YourExtension())`.

Because the entire bundle lives **inside** the IIFE, every bare reference to the
`Scratch` global in your code binds to the local parameter — the "personal copy
of the Scratch API" the TurboWarp docs recommend. No `import` of `Scratch` is
needed (or possible); it's a host global, just like in a hand-written extension.

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

The plugin forces `output.format = 'iife'` and captures the entry export itself,
so you don't set `format`/`name` — just give it an `input` and an output `file`.
For **Rolldown**, import from `rolldown` instead of `rollup`; nothing else
changes.

### Vite (incl. Vite 8 / Rolldown)

Build the extension as a single-file library. The plugin carries
`enforce: 'pre'`, so its asset inlining runs ahead of Vite's own:

```js
// vite.config.mjs
import { defineConfig } from 'vite';
import { turbowarpExtension } from 'tw-plugin-rollup';

export default defineConfig({
  build: {
    lib: { entry: './src/index.js', formats: ['iife'], name: 'extension' },
    rollupOptions: { output: { entryFileNames: 'my-extension.js' } },
    sourcemap: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
  // Vite already inlines assets, so let it: pass `inlineAssets: false`.
  plugins: [turbowarpExtension({ name: 'My Extension', inlineAssets: false })],
});
```

Build it, then load `dist/my-extension.js` in TurboWarp via **add extension →
Custom Extension**, or serve it and use `?extension=<url>`.

## Options

| Option          | Type                 | Default                    | Description                                                                                                                                                |
| --------------- | -------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metadata`      | `object`             | —                          | Registry header injected as `// Name:` / `// ID:` / … comment lines (see below).                                                                           |
| `inlineAssets`  | `boolean \| RegExp`  | `true`                     | Inline imported assets (svg/png/…) as base64 `data:` URIs so `import icon from './icon.svg'` works (see below). `RegExp` to customize, `false` to disable. |
| `register`      | `boolean`            | `true`                     | Append the `Scratch.extensions.register(...)` call. Set `false` to call `register()` yourself inside your code.                                            |
| `unsandboxed`   | `boolean`            | `false`                    | Emit a guard that throws unless the extension runs unsandboxed (`Scratch.extensions.unsandboxed`).                                                         |
| `name`          | `string`             | `metadata.name`            | Name used in the unsandboxed-guard error message. Falls back to `metadata.name`, then `"This extension"`.                                                  |
| `libraryExport` | `string \| string[]` | `"default"`                | Which export of the entry module is the extension. Use a named export instead of the default if you prefer.                                                |
| `varName`       | `string`             | `"__turbowarpExtension__"` | Internal identifier the export is assigned to before registration. Change only on an unlucky name collision.                                               |

`register` accepts either a **class** (instantiated with `new`) or an
already-constructed **instance** (registered as-is).

## Submitting to the gallery

The [TurboWarp extensions gallery](https://github.com/TurboWarp/extensions)
requires a metadata header — a block of `// Key: Value` comments at the very top
of the file. Pass `metadata` and the plugin emits it above the IIFE:

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

Fields are emitted in the conventional order **Name → ID → Description → By →
Original → License → Context**; `by`/`original` accept an array for multiple
lines, and any extra keys you add are appended verbatim. The header is injected
in `renderChunk` (after minification), so it's never stripped.

## Icons

`menuIconURI` / `blockIconURI` expect a `data:` URI. With `inlineAssets` on (the
default), just **import the image** — the plugin's `load` hook reads the file
and resolves the import to a base64 `data:` URI string:

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

- `svg`, `png`, `jpg`, `gif`, `webp`, and `avif` imports are inlined by default.
  Pass a `RegExp` to match your own set (`inlineAssets: /\.(svg|png)$/i`), or
  `inlineAssets: false` to leave asset handling to your own config.
- Inlining (rather than emitting a separate file) is required: a TurboWarp
  extension is a **single file** and can't reference external assets.
- **TypeScript:** add an asset module declaration so the import is typed, e.g.
  `declare module '*.svg' { const url: string; export default url; }`.
- **Vite** already inlines assets of its own accord. Set `inlineAssets: false`
  and let Vite handle it (raising `build.assetsInlineLimit`), to avoid two
  layers fighting over the same import.

## Notes & caveats

- **One file only.** TurboWarp loads a single `<script>`, so don't use dynamic
  `import()` / code splitting — keep it one synchronous bundle. The plugin sets
  `output.inlineDynamicImports` to enforce a single chunk.
- **`Scratch` is a global**, not an import. Your editor/linter may flag it;
  declare it as a readonly global (e.g. in ESLint `languageOptions.globals`).
  For TypeScript, [`@turbowarp/types`](https://github.com/TurboWarp/types)
  provides the `Scratch` typings.
- **Source maps:** prefer `sourcemap: false`. A trailing `//# sourceMappingURL=`
  comment would otherwise sit in the middle of the wrapped file. (When
  sourcemaps are on, the plugin uses `magic-string` to keep the mapping correct
  across the wrapper.)
