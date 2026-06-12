# create-tw-extension

Scaffold a new [TurboWarp](https://turbowarp.org) / Scratch extension with the
bundler of your choice. The generated project bundles your multi-file extension
into a single file using the scratch4js build plugins
([`tw-plugin-webpack`](https://www.npmjs.com/package/tw-plugin-webpack) or
[`tw-plugin-rollup`](https://www.npmjs.com/package/tw-plugin-rollup)).

## Usage

Interactive (recommended) — run with no arguments and answer the prompts:

```sh
npm create tw-extension
# or: pnpm create tw-extension / yarn create tw-extension / bun create tw-extension
```

The wizard (built with [Ink](https://github.com/vadimdemedes/ink)) asks for the
project name, bundler, whether to install types, and the package manager. The
package manager you launched with (`npm` / `pnpm` / `yarn` / `bun`) is
**auto-detected and pre-selected**.

Non-interactive — pass a name and flags:

```sh
npm create tw-extension my-extension -- --bundler rollup --types
```

## Bundlers

| Choice     | Plugin used         | Notes                                 |
| ---------- | ------------------- | ------------------------------------- |
| `webpack`  | `tw-plugin-webpack` | The original.                         |
| `rspack`   | `tw-plugin-webpack` | webpack-compatible, Rust-powered.     |
| `rsbuild`  | `tw-plugin-webpack` | Rspack-based; uses the Rspack plugin. |
| `rollup`   | `tw-plugin-rollup`  | ESM-first.                            |
| `rolldown` | `tw-plugin-rollup`  | Rust port of Rollup.                  |
| `vite`     | `tw-plugin-rollup`  | Consumes the Rollup plugin.           |

## Options

| Flag                         | Description                                             |
| ---------------------------- | ------------------------------------------------------- |
| `-b, --bundler <bundler>`    | `webpack` `rspack` `rsbuild` `rollup` `rolldown` `vite` |
| `-p, --package-manager <pm>` | `npm` `pnpm` `yarn` `bun` (defaults to detected)        |
| `--types` / `--no-types`     | Install `@turbowarp/types` for autocomplete             |
| `--no-install`               | Skip installing dependencies                            |
| `-f, --force`                | Scaffold into a non-empty directory                     |
