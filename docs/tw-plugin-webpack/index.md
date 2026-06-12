---
title: TurboWarp extension bundler
description: Bundle a multi-file TurboWarp/Scratch extension into one IIFE-wrapped file with webpack or Rspack.
---

# `tw-plugin-webpack`

[`tw-plugin-webpack`](https://github.com/playforge-coding/scratch4js/tree/main/packages/tw-plugin-webpack)
is a **webpack** and **Rspack** plugin that lets you write a
[TurboWarp / Scratch extension](https://github.com/TurboWarp/docs/tree/master/docs/development/extensions)
across as many files as you like, then bundles it into the single
self-contained file TurboWarp expects.

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

1. Configures the build to emit a **single self-executing file** whose entry
   export is captured in a local variable.
2. Wraps the whole bundle in the standard `(function (Scratch) { … })(Scratch)`
   template.
3. Appends `Scratch.extensions.register(new YourExtension())`.

Because the entire bundle lives **inside** the IIFE, every bare reference to the
`Scratch` global in your code binds to the local parameter — the "personal copy
of the Scratch API" the TurboWarp docs recommend. No `import` of `Scratch` is
needed (or possible); it's a host global, just like in a hand-written extension.

## Install

```sh
npm install -D tw-plugin-webpack
# plus whichever bundler you use:
npm install -D @rspack/core   # or: npm install -D webpack webpack-cli
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

Add the plugin to your bundler config (this example uses Rspack; webpack is
identical):

```js
// rspack.config.js
import { TurboWarpExtensionPlugin } from 'tw-plugin-webpack';

export default {
  mode: 'production',
  target: 'web',
  devtool: false, // single pasteable file — source maps just bloat it
  entry: './src/index.js',
  output: {
    path: new URL('./dist', import.meta.url).pathname,
    filename: 'my-extension.js',
  },
  plugins: [new TurboWarpExtensionPlugin({ name: 'My Extension' })],
};
```

The plugin reaches the bundler only through `compiler.webpack`, which resolves
on both webpack 5 and Rspack — so the same config shape works for either.

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
new TurboWarpExtensionPlugin({
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
_after_ minification, so it's never stripped.

## Icons

`menuIconURI` / `blockIconURI` expect a `data:` URI. With `inlineAssets` on (the
default), just **import the image** — the plugin configures the bundler to
inline it as a base64 `data:` URI string:

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
- If you build with **Rsbuild/Rslib** (which already handle SVG imports), set
  `inlineAssets: false` to avoid a duplicate asset rule.

## Notes & caveats

- **One file only.** TurboWarp loads a single `<script>`, so don't use dynamic
  `import()` / code splitting — keep it one synchronous bundle.
- **`Scratch` is a global**, not an import. Your editor/linter may flag it;
  declare it as a readonly global (e.g. in ESLint `languageOptions.globals`).
  For TypeScript, [`@turbowarp/types`](https://github.com/TurboWarp/types)
  provides the `Scratch` typings for **Scratch** extensions. If you're targeting
  **TurboWarp or one of its forks**, use
  [`types-tw`](https://github.com/TurboWarp/types-tw) instead, which adds the
  TurboWarp-specific APIs. It's no longer published to npm, so install it from
  git — it keeps the `@turbowarp/types` package name as a drop-in replacement:
  `npm install @turbowarp/types@git+https://github.com/TurboWarp/types-tw.git#tw`.
- **Source maps:** prefer `devtool: false`. A trailing `//# sourceMappingURL=`
  comment would otherwise sit in the middle of the wrapped file.
