---
title: Variables, lists & broadcasts
description: Read and write a project's data — global and local variables, lists, and broadcast messages.
---

# Variables, lists & broadcasts

Variables and lists are defined **per target**. A variable on the
[`Stage`](/api/stage) is global (every sprite can see it); a variable on a
[`Sprite`](/api/sprite) is local to that sprite — the same rule the Scratch editor
uses. Broadcasts are project-wide and live on the stage.

## Variables

You work with variables by name; scratch4js manages the underlying ids.

```js
const { stage } = project;

stage.setVariable('score', 0); // create or update → returns the variable id
stage.getVariable('score'); // 0
stage.variableNames; // ['score', ...]
stage.deleteVariable('score'); // → true if it existed
```

`setVariable` is an **upsert**: if a variable with that name already exists its
value is replaced, otherwise a new one is created. Values may be a string, number
or boolean.

```js
// A local variable, visible only to this sprite:
project.sprite('Player').setVariable('lives', 3);
```

## Lists

Lists work the same way, with array values:

```js
stage.setList('inventory', ['sword', 'shield']);
stage.getList('inventory'); // ['sword', 'shield']
stage.listNames; // ['inventory', ...]
stage.deleteList('inventory'); // → true if it existed
```

`setList` **replaces** the whole list. To append, read, mutate and set again:

```js
const items = stage.getList('inventory') ?? [];
items.push('potion');
stage.setList('inventory', items);
```

## Broadcasts

Broadcast messages are project-wide and owned by the stage:

```js
stage.addBroadcast('game over'); // idempotent → returns the broadcast id
stage.broadcastNames; // ['game over', ...]
```

`addBroadcast` only adds the message if it doesn't already exist, so calling it
twice with the same name is safe.

## Monitors

The on-stage **watchers** that display a variable or list are stored separately,
in [`project.monitors`](/api/project#monitors). scratch4js exposes that array raw —
setting a variable does not automatically create a monitor for it. Mutate
`project.monitors` directly if you need to add or tweak a watcher.

## Next steps

- [Building a project from scratch](/guide/building-from-scratch)
- [`Target` API reference](/api/target)
