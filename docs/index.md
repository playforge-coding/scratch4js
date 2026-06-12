---
pageType: home

hero:
  name: scratch4js
  text: The SB3 format for JavaScript
  tagline: Read and edit Scratch .sb3 projects with a small, declarative API. No Scratch VM, no DOM — just plain objects you can read and mutate.
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
  - title: Declarative editing
    details: Load bytes into a Project, tweak sprites, costumes, sounds, variables and lists through plain getters and setters, then save back to bytes.
    icon: ✏️
  - title: Node & browser
    details: Pure JavaScript with JSDoc types. Project.load accepts a Uint8Array, ArrayBuffer or Buffer; save() returns a Uint8Array you can write to disk or wrap in a Blob.
    icon: 🌐
  - title: Zero heavy deps
    details: Uses @turbowarp/jszip for fast (de)compression and pure JSON for everything else. No Scratch VM, no headless browser.
    icon: 🪶
  - title: Assets by content hash
    details: Costume and sound bytes are stored under their MD5 automatically, the file type is sniffed from the bytes, and unused assets are dropped for you.
    icon: 🔑
  - title: Build from nothing
    details: Project.create() gives you a valid, empty project with a bare stage — add sprites, costumes and scripts entirely from code.
    icon: 🏗️
  - title: Drive it from an AI agent
    details: The companion scratch-mcp server exposes the whole editing surface as MCP tools — including a block catalog and JSON-patch script editing — with a live-reload bridge into TurboWarp Desktop.
    icon: 🤖
---
