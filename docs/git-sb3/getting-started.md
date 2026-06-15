---
title: Getting started
description: Install git-sb3, wire the readable diff driver into a repo, and see your first readable .sb3 diff.
---

# Getting started

## Install

```bash
npm install -g git-sb3
# or run without installing:
npx git-sb3 <command>
```

`git-sb3` needs **Node 18 or newer** and `git` on your `PATH`. Once it's
installed globally, git discovers it automatically — `git sb3 <command>` and
`git-sb3 <command>` are equivalent, because git runs any `git-<name>` executable
on your `PATH` as the subcommand `git <name>`.

## Wire it into a repo

In a repository that contains `.sb3` files:

```bash
git sb3 install
git add .gitattributes
```

`install` does two things:

1. Registers a [`textconv`](#how-the-diff-driver-works) diff driver named `sb3`
   in your git config.
2. Adds `*.sb3 diff=sb3` to the repo's `.gitattributes` so git uses that driver
   for every `.sb3`.

Commit the `.gitattributes` change so collaborators get readable diffs too (they
each run `git sb3 install` once to register the driver locally).

::: tip Configure it globally instead
`git sb3 install --global` writes the driver to your global git config. It then
prints the one `*.sb3 diff=sb3` line to add to your global attributes file
(`git config --global core.attributesFile`).
:::

## Your first readable diff

Edit a project — through the Scratch editor, [`scratch4js`](/api/overview), or
by hand via [`unpack`](/git-sb3/commands#unpack) — then ask git what changed:

```bash
git diff -- game.sb3
```

Instead of `Binary files differ`, you'll see scripts as scratchblocks and the
exact variables, costumes and sounds that changed:

```diff
@@ scripts:
   when @greenFlag clicked
-  set [score v] to (0)
+  set [score v] to (100)
   forever
```

`git log -p`, `git show`, and `git diff <commit>` all use the same driver, so the
whole history is reviewable.

## Then: a visual report

For a graphical view of your uncommitted changes, render an HTML report:

```bash
git sb3 diff game.sb3   # writes game.diff.html (working tree vs HEAD)
```

Open it in a browser to see the changed scripts drawn as real Scratch blocks.
See [Visual diffs](/git-sb3/visual-diff) for the forms and what the report
contains.

## How the diff driver works

A git [`textconv`](https://git-scm.com/docs/gitattributes#_performing_text_diffs_of_binary_files)
driver tells git: "before diffing this binary file, run it through a program and
diff the program's text output instead." `install` configures:

```ini
[diff "sb3"]
    textconv = git-sb3 text
    binary = true
    cachetextconv = true
```

So git calls `git-sb3 text <file>` (the [`text` command](/git-sb3/commands#text))
on each side of a change and diffs the readable output. `cachetextconv` caches
that output by blob, so repeated diffs of unchanged history are instant.

## Next steps

- [Commands](/git-sb3/commands) — every command and option.
- [Visual diffs](/git-sb3/visual-diff) — the scratchblocks HTML report.
