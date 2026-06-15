---
title: The git extension
description: Version-control Scratch .sb3 projects with git-sb3 — readable git diffs, visual scratchblocks diff reports, and a diffable unpack/pack workflow.
---

# The git extension (`git-sb3`)

[`git-sb3`](https://github.com/playforge-coding/scratch4js/tree/main/packages/git-sb3)
makes version-controlling Scratch **`.sb3`** projects actually work. Installed on
your `PATH` as `git-sb3`, git discovers it as a subcommand — so every command
runs as **`git sb3 <command>`**.

An `.sb3` is a [zip wrapping a single-line `project.json`](/guide/introduction#what-is-an-sb3)
plus its costume and sound assets. To git it's an opaque binary blob, so every
commit just says **"Binary files differ"** — useless for review, blame, or
merge. `git-sb3` turns that into a real diff.

```
   game.sb3  (zip: project.json + assets)
        │
        ├──►  git sb3 text   ──►  readable text  ──►  used by `git diff`
        │        scripts as scratchblocks, vars, lists, costumes, sounds
        │
        ├──►  git sb3 diff   ──►  game.diff.html  ──►  scratchblocks SVGs,
        │        added green · removed red · modified old-vs-new
        │
        └──►  git sb3 unpack ──►  project.json (pretty) + assets/  ──►  pack
                 a line-diffable working tree you can commit instead
```

## What it does

- **`git diff` becomes readable.** A [`textconv`](/git-sb3/getting-started#how-the-diff-driver-works)
  driver renders each project as text — scripts as
  [scratchblocks](https://scratchblocks.github.io/), plus variables, lists,
  costumes and sounds — so a commit's real effect shows up line by line.
- **Visual diffs.** [`git sb3 diff`](/git-sb3/visual-diff) produces a
  self-contained HTML report that renders scripts as real scratchblocks
  **SVGs**, tinting added scripts green, removed scripts red, and showing
  modified scripts old-vs-new with a precise block-level text diff.
- **Live diffs.** [`git sb3 watch`](/git-sb3/live) serves that report and
  refreshes it as you edit — on file save, or in real time from the
  [TurboWarp userscript](/userscript/) over WebSockets.
- **Diffable working trees.** [`unpack`](/git-sb3/commands#unpack) explodes an
  sb3 into a pretty-printed, line-diffable tree (and `pack` puts it back), if
  you'd rather commit the expanded form.

## How it pairs with scratch4js

`git-sb3` reads `.sb3` zips with the same [`@turbowarp/jszip`](https://github.com/TurboWarp/jszip)
foundation as [`scratch4js`](/api/overview), reconstructs each target's blocks
into scratchblocks source with
[`parse-sb3-blocks`](https://www.npmjs.com/package/parse-sb3-blocks), and renders
them headlessly with [`scratchblocks`](https://scratchblocks.github.io/). Where
`scratch4js` _edits_ a project and the [`scratch-mcp` server](/mcp-server/) lets
an agent _author_ one, `git-sb3` makes the project's **history** reviewable.

## In this section

- **[Getting started](/git-sb3/getting-started)** — install, then wire the
  readable diff driver into a repo.
- **[Commands](/git-sb3/commands)** — `install`, `text`, `diff`, `unpack` and
  `pack`, with every option.
- **[Visual diffs](/git-sb3/visual-diff)** — the scratchblocks HTML report and
  how it's rendered.
- **[Live diffs](/git-sb3/live)** — `git sb3 watch` and live refresh from the
  TurboWarp userscript.

::: tip Try it in one line
In a repo with `.sb3` files: `git sb3 install` wires up readable `git diff`, and
`git sb3 diff game.sb3` writes an HTML report of your uncommitted changes.
:::

## Scope

`git-sb3` is a Node CLI (Node 18+) and needs `git` on your `PATH`. It renders
**block scripts**, **variables / lists / broadcasts**, and **costume / sound**
changes. It does not attempt a three-way _merge_ driver — its focus is making
diffs and history reviewable.
