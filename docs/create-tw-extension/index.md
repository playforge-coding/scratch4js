---
title: Scaffold a TurboWarp extension (create-tw-extension)
description: Create a new multi-file TurboWarp/Scratch extension project with the bundler of your choice — webpack, Rspack, Rsbuild, Rollup, Rolldown, or Vite.
---

# `create-tw-extension`

[`create-tw-extension`](https://github.com/playforge-coding/scratch4js/tree/main/packages/create-tw-extension)
scaffolds a ready-to-build [TurboWarp / Scratch extension](https://github.com/TurboWarp/docs/tree/master/docs/development/extensions)
project. You pick a bundler; it wires up the matching scratch4js plugin
([`tw-plugin-webpack`](/tw-plugin-webpack/) or [`tw-plugin-rollup`](/tw-plugin-rollup/)),
writes a working starter extension, and installs the dependencies — so
`npm run build` produces the single self-contained file TurboWarp expects.

## Quick start

Run it with your package manager's `create` command — no global install needed:

```sh
npm create tw-extension
# or: pnpm create tw-extension
# or: yarn create tw-extension
# or: bun create tw-extension
```

With **no arguments** it launches an interactive wizard (built with
[Ink](https://github.com/vadimdemedes/ink)). Answer four questions and it
scaffolds, installs, and prints the next steps:

```text
create-tw-extension  scaffold a TurboWarp extension

? Project name: my-extension
? Which bundler? › Rspack — Rust-powered, webpack-compatible. Very fast.
? Install @turbowarp/types for editor autocomplete? › Yes
? Package manager?  (detected pnpm) › pnpm
```

## Non-interactive

Pass a project name and flags to skip the prompts — handy for scripts and CI:

```sh
npm create tw-extension my-extension -- --bundler rollup --types
```

> The `--` separates `npm create`'s own arguments from the ones forwarded to the
> scaffolder. `pnpm`/`yarn`/`bun` forward trailing args directly, so the `--`
> isn't needed there.

### Options

| Flag                         | Description                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `[name]`                     | Project directory and extension name (required outside the wizard).                          |
| `-b, --bundler <bundler>`    | `webpack` · `rspack` · `rsbuild` · `rollup` · `rolldown` · `vite` (default `rspack`).        |
| `-p, --package-manager <pm>` | `npm` · `pnpm` · `yarn` · `bun` (defaults to the **detected** one).                          |
| `--types` / `--no-types`     | Install [`@turbowarp/types`](https://github.com/TurboWarp/types-tw) for editor autocomplete. |
| `--no-install`               | Write the files but skip installing dependencies.                                            |
| `-f, --force`                | Scaffold into a directory that already exists and isn't empty.                               |

## Choosing a bundler

All six options produce the same single-file extension; pick whichever toolchain
you prefer. Under the hood each maps to one of the two scratch4js plugins:

| Choice     | Plugin              | Notes                                           |
| ---------- | ------------------- | ----------------------------------------------- |
| `webpack`  | `tw-plugin-webpack` | The original. Mature, huge plugin ecosystem.    |
| `rspack`   | `tw-plugin-webpack` | Rust-powered, webpack-compatible. Very fast.    |
| `rsbuild`  | `tw-plugin-webpack` | Rspack-based toolchain; accepts Rspack plugins. |
| `rollup`   | `tw-plugin-rollup`  | Lean, ESM-first bundler.                        |
| `rolldown` | `tw-plugin-rollup`  | Rust port of Rollup. Same config, faster.       |
| `vite`     | `tw-plugin-rollup`  | Consumes the Rollup plugin.                     |

See the [webpack / Rspack](/tw-plugin-webpack/) and
[Rollup / Rolldown / Vite](/tw-plugin-rollup/) plugin docs for the full set of
options the generated config exposes.

## Package-manager detection

When you run through `npm create` / `pnpm create` / `yarn create` /
`bun create`, the launching tool sets `npm_config_user_agent`. The scaffolder
reads it and **pre-selects that package manager** in the wizard (and uses it as
the default in non-interactive mode), so the tool you already typed is the one
that runs the install. Override it any time with `--package-manager`.

## Types

Choosing **Yes** (or passing `--types`) adds
[`@turbowarp/types`](https://github.com/TurboWarp/types-tw) as a dev dependency
and a `jsconfig.json` that pulls in its declarations, so your editor
autocompletes the global `Scratch` API (`Scratch.BlockType`,
`Scratch.ArgumentType`, and friends). It's installed straight from git:

```text
@turbowarp/types@git+https://github.com/TurboWarp/types-tw.git#tw
```

## What gets generated

```text
my-extension/
├─ <bundler>.config.*      # bundler + scratch4js plugin, pre-wired
├─ package.json            # build/dev scripts + the right dependencies
├─ jsconfig.json           # only with --types
├─ src/
│  ├─ index.js             # the extension class (export default)
│  ├─ blocks/greeting.js   # example helper module
│  └─ icon.svg             # menu icon (inlined as a data: URI)
├─ .gitignore
└─ README.md
```

The entry module `export default`s the extension class and imports a sibling
helper — the plugin inlines everything into one file and wires up
`Scratch.extensions.register()` for you (no `register()` call in your source).

## Next steps

```sh
cd my-extension
npm run build      # → dist/my-extension.js
```

Then load `dist/<id>.js` into TurboWarp via **Add Extension → Custom Extension**
(the **Files** tab, or paste the contents into the **Text** tab). Use
`npm run dev` to rebuild on every change while you work.
