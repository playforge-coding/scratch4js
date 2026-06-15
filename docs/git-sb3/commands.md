---
title: Commands
description: Reference for every git-sb3 command — install, text, diff, unpack and pack — with all options.
---

# Commands

Every command runs as either `git sb3 <command>` or `git-sb3 <command>`. Pass
`--help` to any of them for inline usage.

| Command                              | What it does                                                          |
| ------------------------------------ | --------------------------------------------------------------------- |
| `git sb3 install [--global]`         | Register the `.sb3` textconv diff driver and update `.gitattributes`. |
| `git sb3 text <file.sb3>`            | Print a project as readable text (the `git diff` driver target).      |
| `git sb3 diff <a> [b]`               | Generate a visual scratchblocks HTML diff.                            |
| `git sb3 watch <a> [b]`              | Serve a [live](/git-sb3/live) visual diff that refreshes as you edit. |
| `git sb3 unpack <file.sb3> [-o dir]` | Explode an sb3 into a diffable tree.                                  |
| `git sb3 pack <dir> [-o file.sb3]`   | Reassemble an unpacked tree into an `.sb3`.                           |

## `install`

Wire the readable diff driver into git.

```bash
git sb3 install            # configure this repo + write .gitattributes
git sb3 install --global   # configure global git config instead
```

| Option         | Default   | Description                                             |
| -------------- | --------- | ------------------------------------------------------- |
| `-g, --global` | off       | Configure git globally instead of for the current repo. |
| `--bin <name>` | `git-sb3` | Executable name git should call for the `textconv`.     |

See [How the diff driver works](/git-sb3/getting-started#how-the-diff-driver-works)
for the exact git config it writes.

## `text`

Print a project as readable, diff-friendly text: each target's scripts as
scratchblocks, plus its variables, lists, broadcasts, costumes and sounds. This
is the program git invokes for `*.sb3` once the driver is installed.

```bash
git sb3 text game.sb3
```

| Option                  | Default | Description                              |
| ----------------------- | ------- | ---------------------------------------- |
| `-l, --language <code>` | `en`    | Block language for scratchblocks labels. |

`text` is also exposed under the alias `textconv` for clarity in git config.

## `diff`

Generate a [visual HTML report](/git-sb3/visual-diff) of the differences between
two versions of a project. The two arguments are resolved flexibly:

```bash
git sb3 diff game.sb3              # working tree vs HEAD
git sb3 diff HEAD~3 game.sb3       # an older commit vs the working tree
git sb3 diff before.sb3 after.sb3  # two files on disk
```

- **One path** → compares the working-tree file against `HEAD`.
- **`<ref> <path>`** (first arg isn't an existing file) → extracts the old side
  from git history (`git show <ref>:<path>`).
- **Two paths** → compares the two files directly.

| Option                  | Default            | Description                            |
| ----------------------- | ------------------ | -------------------------------------- |
| `-o, --out <file.html>` | `<name>.diff.html` | Output HTML path.                      |
| `-l, --language <code>` | `en`               | Block language for labels.             |
| `--no-stdout`           | —                  | Don't print the output path on stdout. |

## `watch`

Serve the [visual diff](/git-sb3/visual-diff) as a **live page** that refreshes
as you edit — on file save, or in real time via the
[TurboWarp userscript](/git-sb3/live). The two arguments resolve like
[`diff`](#diff); the baseline (old) side is fixed for the session and the new
side updates.

```bash
git sb3 watch game.sb3            # baseline HEAD, refreshes as game.sb3 changes
git sb3 watch HEAD~3 game.sb3     # baseline an older commit
git sb3 watch before.sb3 after.sb3
```

Open the printed URL (default `http://localhost:9061/`) in a browser and leave
it up while you work. See [Live diffs](/git-sb3/live) for the full workflow.

| Option                  | Default | Description                                        |
| ----------------------- | ------- | -------------------------------------------------- |
| `-p, --port <port>`     | `9061`  | Port to serve the live diff on.                    |
| `-l, --language <code>` | `en`    | Block language for labels.                         |
| `--no-watch-file`       | —       | Only refresh from userscript pushes, not on saves. |

## `unpack`

Explode an `.sb3` into a tidy, line-diffable tree:

```bash
git sb3 unpack game.sb3 -o game/
```

```
game/
  project.json   # pretty-printed (2-space), stable key order
  assets/        # one file per costume/sound, named by its md5ext
```

Assets are content-addressed by MD5 already, so they round-trip byte-for-byte
and only appear in a diff when actually added or removed.

| Option            | Default                 | Description       |
| ----------------- | ----------------------- | ----------------- |
| `-o, --out <dir>` | `<file>` without `.sb3` | Output directory. |

## `pack`

Reassemble a tree produced by `unpack` back into a normal `.sb3` that opens in
the editor and on the website:

```bash
git sb3 pack game/ -o game.sb3
```

| Option                    | Default     | Description                |
| ------------------------- | ----------- | -------------------------- |
| `-o, --out <file.sb3>`    | `<dir>.sb3` | Output `.sb3` path.        |
| `-c, --compression <1-9>` | `6`         | DEFLATE compression level. |

::: tip Commit the expanded form
If you'd rather review changes in plain `git diff` without the textconv driver,
commit the `unpack` output (`project.json` + `assets/`) and run `pack` to
rebuild the `.sb3` when you need it.
:::
