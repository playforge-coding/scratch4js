---
title: Online projects
description: Log in, open a project from scratch.mit.edu, edit it, and (with your confirmation) save and publish it back.
---

# Online projects

Besides opening `.sb3` files from disk, `scratch-mcp` can work with projects
**directly on scratch.mit.edu**, using the [`s-api4js`](/s-api4js/) wrapper. An
agent can log in, download one of your projects, edit it with the usual tools,
then — **only after you confirm** — save the changes back and publish them.

```
   scratch_login ──► open_scratch_project ──► (edit tools) ──► push_to_scratch
                                                                     │  confirm
                                                                     ▼
                                                            scratch.mit.edu
                                                                     │
                                                            share_project (confirm)
```

## The tools

| Tool                                       | What it does                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scratch_login { username?, password? }`   | Authenticate with scratch.mit.edu. Credentials default to `$SCRATCH_USER` / `$SCRATCH_PASS`. The session lives in memory for the server process only. |
| `open_scratch_project { projectId }`       | Download a project by id and open it as the in-memory project — the same one every editing tool acts on.                                              |
| `push_to_scratch { projectId?, confirm? }` | Save the open project back to scratch.mit.edu (uploads assets, then `project.json`). **Asks you to confirm first.**                                   |
| `share_project { projectId?, confirm? }`   | Publish a project so it's publicly visible. **Asks you to confirm first.**                                                                            |

`projectId` defaults to the id the open project was loaded from, so once you've
called `open_scratch_project` you can omit it.

## A typical session

```text
scratch_login                        → { loggedIn: true, username, userId }
open_scratch_project { projectId }   → opens it in memory (sprites, assets, …)
set_variable { … }                   → edit with the normal tools
vm_load / vm_run                     → test it headlessly (optional)
push_to_scratch                      → confirm → saved back to Scratch
share_project                        → confirm → now public
```

Shared projects open without logging in; your own **unshared** projects need
`scratch_login` first. Saving and publishing always require login and ownership.

## Confirmation is mandatory

`push_to_scratch` and `share_project` change the **live** project, so the server
never performs them silently. It prefers MCP
[elicitation](https://modelcontextprotocol.io/specification/draft/client/elicitation)
— a prompt the **user** (not the model) answers — so the human approves each
edit or publish:

- **Client supports elicitation** (e.g. Claude Desktop): you get a yes/no prompt;
  declining cancels the action.
- **Client can't elicit:** the tool refuses unless called with `confirm: true`,
  which the agent should set only after you've explicitly agreed.

Either way, an agent cannot overwrite or publish your project without a human
saying yes.

## Credentials

Pass `username` / `password` to `scratch_login`, or set them in the environment
so they never appear in the conversation:

```json
{
  "mcpServers": {
    "scratch": {
      "command": "node",
      "args": ["/abs/path/to/packages/scratch-mcp/src/index.js"],
      "env": {
        "SCRATCH_USER": "your-username",
        "SCRATCH_PASS": "your-password"
      }
    }
  }
}
```

With those set, `scratch_login` needs no arguments. The login session is held in
memory for the life of the server process and is never written to disk.

## Saving to disk vs. to Scratch

The disk and online flows are independent and can be mixed:

- `open_project` / `save_project` work with local `.sb3` files (and the
  [live-reload bridge](/mcp-server/live-reload)).
- `open_scratch_project` / `push_to_scratch` work with projects on the website.

Both load into the **same** in-memory project, so you can open from disk and push
to Scratch, or open from Scratch and save a local copy — whatever fits.
