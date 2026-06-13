---
title: web-editor — reusable in-browser IDE building blocks
description: A React framework for building browser IDEs — resizable split-pane layout, Monaco editor, an xterm terminal bound to a WebContainer, a Seti-iconed file tree, and Radix UI primitives.
---

# `web-editor`

[`web-editor`](https://github.com/playforge-coding/scratch4js/tree/main/packages/web-editor)
is a small React framework for building **in-browser IDEs**. It's the engine
behind the [TurboWarp Extension Maker](/web-editor/extension-maker) — but it's
deliberately generic: nothing in it knows about TurboWarp.

It gives you:

- **A custom resizable split-pane layout** (`SplitPane`, `Panel`) — nestable,
  with sizes persisted to `localStorage`. No third-party panel library.
- **A Monaco editor** (`CodeEditor`) with locally-bundled language workers (so it
  works under cross-origin isolation, where CDN workers are blocked).
- **An xterm.js terminal** (`TerminalPanel`) bound to an interactive
  [WebContainer](https://webcontainers.io) shell — full ANSI, real `ls`/`cat`/
  `npm`/`node`.
- **A file tree** (`FileTree`) with [Seti](https://github.com/jesseweed/seti-ui)
  file-type icons.
- **A WebContainer build engine** (`WebContainerEngine`) — boot, `npm install`,
  run a build, read the output back out, stream all of it to the terminal.
- **Radix UI primitives** (`Button`, `Tooltip`, `Dialog`-based dialogs, `Switch`,
  …) themed with a dark Tailwind palette.

## Install

```sh
npm install web-editor
# peer deps you provide:
npm install react react-dom
```

It's published built (via [Rslib](https://rslib.rs)) and ships its components,
the Seti icon set, and a raw `styles.css` you process with **Tailwind CSS v4**.

## How it fits together

You create an **editor instance** with `createEditor()`, describing the project
to scaffold and how to build it, then render the components inside an
`EditorProvider`:

```jsx
import {
  createEditor,
  EditorProvider,
  SplitPane,
  Panel,
  FileTree,
  CodeEditor,
  TerminalPanel,
} from 'web-editor';
import 'web-editor/styles.css';

const editor = createEditor({
  name: 'My Project',
  // npm install command run in the WebContainer
  installCommand: ['npm', 'install'],
  // produce the starter files + how to build them
  createProject: () => ({
    files: { 'package.json': '…', 'src/index.js': '…' },
    entryFile: 'src/index.js',
    build: { command: ['npm', 'run', 'build'], outputPath: 'dist/out.js' },
  }),
});

function App() {
  useEffect(() => editor.actions.init(), []);
  return (
    <EditorProvider editor={editor}>
      <SplitPane direction="horizontal" defaultSizes={[20, 80]}>
        <Panel flush>
          <FileTree />
        </Panel>
        <SplitPane direction="vertical" defaultSizes={[70, 30]}>
          <Panel title="Editor" flush>
            <CodeEditor />
          </Panel>
          <Panel title="Terminal" flush>
            <TerminalPanel />
          </Panel>
        </SplitPane>
      </SplitPane>
    </EditorProvider>
  );
}
```

The engine boots a WebContainer, mounts the files, installs, builds on demand
(or on save), and streams everything to the terminal. The editor's blocks plug
into whatever your `createProject` returns — your app supplies the
domain-specific parts (the project template, the build command, what to do with
the built output).

## Tailwind setup

`web-editor/styles.css` is Tailwind v4 source (it declares `@import
'tailwindcss'`, the theme tokens, and `@source` for its own built components).
Import it from your app's stylesheet and add a `@source` for your own files:

```css
@import 'web-editor/styles.css';
@source './';
```

## Cross-origin isolation

WebContainers (and Monaco's bundled workers) require the page to be
**cross-origin isolated** — `COOP: same-origin` + `COEP: credentialless`. Set
those headers on your dev server and host, or use a
[`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker) shim on a
static host that can't set headers.

## A complete app

The [TurboWarp Extension Maker](/web-editor/extension-maker) is a full
application built on `web-editor` — read it to see the framework wired up end to
end (and try the live version).
