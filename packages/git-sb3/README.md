# git-sb3

A git extension that makes version-controlling Scratch `.sb3` projects actually
work. Installed on your `PATH` as `git-sb3`, so git finds it as a subcommand —
every command runs as **`git sb3 <command>`**.

An `.sb3` is a zip wrapping a single-line `project.json` plus its costume and
sound assets. To git it's an opaque binary blob, so every commit just says
**"Binary files differ"** — useless for review, blame, or merge. `git-sb3`
fixes that:

- **`git diff` becomes readable.** A `textconv` driver renders each project as
  text — scripts as [scratchblocks](https://scratchblocks.github.io/), plus
  variables, lists, costumes and sounds — so a commit's real effect shows up
  line by line.
- **Visual diffs.** `git sb3 diff` produces a self-contained HTML report that
  renders scripts as real scratchblocks **SVGs**, tinting added scripts green,
  removed scripts red, and showing modified scripts old-vs-new with a precise
  block-level text diff.
- **Live diffs.** `git sb3 watch` serves that report and refreshes it as you
  edit — on file save, or in real time from the TurboWarp Desktop userscript
  over WebSockets.
- **Diffable working trees.** `unpack` explodes an sb3 into a pretty-printed,
  line-diffable tree (and `pack` puts it back), if you'd rather commit the
  expanded form.

## Install

```bash
npm install -g git-sb3
# or run without installing:
npx git-sb3 <command>
```

Requires Node ≥ 18 and `git` on your `PATH`. Once it's installed globally, git
discovers it automatically — `git sb3 <command>` and `git-sb3 <command>` are
equivalent.

## Quick start

In a repo that contains `.sb3` files:

```bash
git sb3 install          # wire the readable diff driver into this repo
git add .gitattributes
```

Now `git diff`, `git log -p`, and `git show` print readable script changes for
any `.sb3`. For a visual report of your uncommitted changes:

```bash
git sb3 diff game.sb3    # writes game.diff.html (working tree vs HEAD)
```

Open the HTML in a browser to see the scripts that changed, rendered as blocks.

## Commands

| Command                              | What it does                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `git sb3 install [--global]`         | Register the `.sb3` textconv diff driver and add `*.sb3 diff=sb3` to `.gitattributes`. |
| `git sb3 text <file.sb3>`            | Print a project as readable text. This is the driver `git diff` calls (`textconv`).    |
| `git sb3 diff <a> [b]`               | Visual HTML diff. See forms below.                                                     |
| `git sb3 watch <a> [b]`              | Serve a live visual diff that refreshes as you edit. See live refresh below.           |
| `git sb3 unpack <file.sb3> [-o dir]` | Explode an sb3 into `project.json` (pretty-printed) + `assets/`.                       |
| `git sb3 pack <dir> [-o file.sb3]`   | Reassemble an unpacked tree into an `.sb3`.                                            |

### `git sb3 diff` forms

```bash
git sb3 diff game.sb3              # working tree vs HEAD
git sb3 diff HEAD~3 game.sb3       # an older commit vs the working tree
git sb3 diff before.sb3 after.sb3  # two files on disk
```

Use `-o/--out <file.html>` to choose the output path and `-l/--language <code>`
to render block labels in another language.

### Live refresh

`git sb3 watch` serves the visual diff and keeps it fresh — leave it open in a
browser while you work:

```bash
git sb3 watch game.sb3            # → http://localhost:9061/
```

The page refreshes whenever the project changes, from either:

- a **file save** (any tool that writes the `.sb3`), via an `fs.watch`; or
- a **live push** from the [TurboWarp Desktop userscript](../userscript), which
  streams the project to the watch server (`ws://localhost:9061`) on every edit
  (`PROJECT_CHANGED`), so the diff updates in real time before anything hits
  disk.

Only the report body is swapped over the WebSocket, so the stylesheet stays put
and scroll position is preserved. The argument forms match `diff`; the baseline
(old) side is fixed for the session.

## How it works

- **Reading.** `.sb3` zips are read with `@turbowarp/jszip` (the same reader the
  sibling [`scratch4js`](../scratch4js) package uses).
- **Scripts → blocks.** Each target's flat block map is reconstructed into
  scratchblocks source with
  [`parse-sb3-blocks`](https://www.npmjs.com/package/parse-sb3-blocks).
- **Blocks → SVG.** Scripts are rendered headlessly with
  [`scratchblocks`](https://scratchblocks.github.io/) running on a `jsdom`
  window. scratchblocks normally measures text with a real `<canvas>`; git-sb3
  ships a small Helvetica advance-width shim instead, so no native `canvas`
  dependency is needed.

## License

MPL-2.0
