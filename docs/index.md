---
pageType: home

hero:
  name: scratch4js
  text: A JavaScript toolkit for Scratch & TurboWarp
  tagline: A family of small, focused packages for working with Scratch from JavaScript — read and edit .sb3 projects, talk to the Scratch website, drive it all from an AI agent, and build & bundle TurboWarp extensions.
  image:
    src: /favicon.svg
    alt: scratch4js logo
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: API reference
      link: /api/overview

features:
  - title: Edit .sb3 from JavaScript
    details: The scratch4js library loads bytes into a Project, then tweaks sprites, costumes, sounds, variables and lists through plain getters and setters before saving back to bytes. No Scratch VM, no DOM.
    icon: ✏️
  - title: Node & browser
    details: Pure JavaScript with JSDoc types. Project.load accepts a Uint8Array, ArrayBuffer or Buffer; save() returns a Uint8Array you can write to disk or wrap in a Blob. ESM, CJS and UMD builds.
    icon: 🌐
  - title: Talk to scratch.mit.edu
    details: The s-api4js wrapper reads public data (users, projects, studios, search) and logs in to download, edit and publish a project's .sb3 directly on the website. Cookies handled for you.
    icon: 🔌
  - title: Drive it from an AI agent
    details: The scratch-mcp server exposes the whole editing surface as MCP tools — block catalog, JSON-patch script editing and a headless VM — with a live-reload bridge into TurboWarp Desktop.
    icon: 🤖
  - title: Build TurboWarp extensions
    details: Scaffold a project with npm create tw-extension, then bundle a multi-file extension into one unsandboxed file with the webpack/Rspack or Rollup/Rolldown/Vite plugin.
    icon: 🧩
  - title: Build extensions in the browser
    details: The tw-extension-maker IDE bundles your extension in a WebContainer and previews it live in an embedded Scratch editor — built on web-editor's reusable Monaco + xterm building blocks.
    icon: 🛠️
  - title: Collaborate in real time
    details: The TurboWarp Desktop userscript adds real-time, multi-editor collaboration over a small WebSocket relay one participant runs — blocks, sprites, costumes and sounds stay in sync — plus scratch-mcp live-reload.
    icon: 👥
---
