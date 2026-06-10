# scratch4js examples

Runnable scripts that exercise the library against the bundled
[`example.sb3`](../example.sb3). Each is a standalone ES module — run it with
Node 18+ from the package root:

```bash
pnpm build        # examples import the built `scratch4js` package
node examples/01-inspect.js
```

| Script                                                   | What it shows                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| [`01-inspect.js`](./01-inspect.js)                       | Load a project and print a report of every target, costume and sound. |
| [`02-arrange-sprites.js`](./02-arrange-sprites.js)       | Reposition, resize and reorient sprites, then save.                   |
| [`03-variables-and-lists.js`](./03-variables-and-lists.js) | Stage/sprite variables, lists and broadcasts.                       |
| [`04-costumes-and-sounds.js`](./04-costumes-and-sounds.js) | Export, swap and share binary assets via `.data`.                   |
| [`05-build-from-scratch.js`](./05-build-from-scratch.js) | Build a valid `.sb3` from `Project.create()` with generated SVGs.     |

Scripts that save a project write to `examples/out/` (git-ignored). Open any
generated `.sb3` in [TurboWarp](https://turbowarp.org) or the Scratch editor to
see the result.
