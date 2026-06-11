# tw-plugin-webpack

Write a [TurboWarp / Scratch extension](https://github.com/TurboWarp/docs/tree/master/docs/development/extensions) across **as many files as you like**, then let **webpack** or **Rspack** bundle it into the single self-contained file TurboWarp expects.

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

## How it works

Point your bundler at an entry module that `export default`s the extension class (or instance). The plugin:

1. Configures the build to emit a **single self-executing file** whose entry export is captured in a local variable.
2. Wraps the whole bundle in the standard `(function (Scratch) { … })(Scratch)` template.
3. Appends `Scratch.extensions.register(new YourExtension())`.

Because the entire bundle lives **inside** the IIFE, every bare reference to the `Scratch` global in your code binds to the local parameter — the "personal copy of the Scratch API" the TurboWarp docs recommend. No `import` of `Scratch` is needed (or possible); it's a host global, just like in a hand-written extension.

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

### Rspack

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

### webpack

Identical — it's a standard plugin. `const { TurboWarpExtensionPlugin } = require('tw-plugin-webpack')` and drop it in `plugins`. The plugin touches no bundler-specific internals (it goes through `compiler.webpack`), so the same config shape works for both.

Build it, then load `dist/my-extension.js` in TurboWarp via **add extension → Custom Extension**, or serve it and use `?extension=<url>`.

## Options

| Option          | Type                 | Default                    | Description                                                                                                     |
| --------------- | -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `register`      | `boolean`            | `true`                     | Append the `Scratch.extensions.register(...)` call. Set `false` to call `register()` yourself inside your code. |
| `unsandboxed`   | `boolean`            | `false`                    | Emit a guard that throws unless the extension runs unsandboxed (`Scratch.extensions.unsandboxed`).              |
| `name`          | `string`             | `"This extension"`         | Name used in the unsandboxed-guard error message.                                                               |
| `libraryExport` | `string \| string[]` | `"default"`                | Which export of the entry module is the extension. Use a named export instead of the default if you prefer.     |
| `varName`       | `string`             | `"__turbowarpExtension__"` | Internal identifier the export is assigned to before registration. Change only on an unlucky name collision.    |

`register` accepts either a **class** (it's instantiated with `new`) or an already-constructed **instance** (registered as-is).

## Notes & caveats

- **One file only.** TurboWarp loads a single `<script>`, so don't use dynamic `import()` / code splitting — keep it one synchronous bundle.
- **`Scratch` is a global**, not an import. Your editor/linter may flag it; declare it as a readonly global (e.g. in ESLint `languageOptions.globals`). For TypeScript, [`@turbowarp/types`](https://github.com/TurboWarp/types) provides the `Scratch` typings.
- **Source maps:** prefer `devtool: false`. A trailing `//# sourceMappingURL=` comment would otherwise sit in the middle of the wrapped file.

## Is a plugin the best way to do this?

For the common case, **yes** — it's one import and zero config beyond a name. But it's worth knowing the alternatives:

- **Plain banner/footer.** The wrapper is static text, so you can skip the plugin entirely and use two `BannerPlugin` instances (`{ raw: true }`, one with `footer: true`) around a `var`-library build. The plugin just packages that up, detects the entry chunk, and handles registration/guards for you.
- **Rslib / Rsbuild `format`.** If you build libraries with Rslib, a `umd` build plus a custom `banner`/`footer` gets you most of the way. The downside is you still have to hand-write the register call and reach into the UMD export.

The dedicated plugin wins when you want it to "just work" and stay bundler-agnostic (webpack **and** Rspack) — which is exactly what it's for.

## Example

A runnable multi-file example lives in [`examples/multi-file-extension`](./examples/multi-file-extension). Build it with:

```sh
pnpm build          # build the plugin first
pnpm build:example  # bundles src/{index,blocks/*}.js -> dist/multi-file-example.js
```

## License

MPL-2.0
