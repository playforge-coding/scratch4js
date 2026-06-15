#!/usr/bin/env node
/**
 * scratch-mcp — a Model Context Protocol server that lets an agent edit Scratch
 * `.sb3` projects through {@link https://www.npmjs.com/package/scratch4js scratch4js}.
 *
 * It keeps a single project open in memory: `open_project` loads it, the editing
 * tools mutate it, and `save_project` writes it back to disk. Pair it with the
 * TurboWarp Desktop userscript in this repo and saves reload live in the editor.
 *
 * @module scratch-mcp
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import sharp from 'sharp';
import { Project } from 'scratch4js';
import { ScratchSession } from 's-api4js';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startBridge } from './bridge.js';
import { HeadlessRuntime } from './runtime.js';
import { applyPatch, getPointer } from './jsonpatch.js';
import {
  listBlocks,
  getBlockSchema,
  validateBlocks,
  BUILTIN_EXTENSION_IDS,
} from './blocks.js';

/**
 * Headless VM for running and testing the open project. It loads a fresh copy
 * of whatever is in memory (via `vm_load`), so an agent's edits are reflected
 * on the next load. Lazy: the VM is only required the first time it is used.
 */
const runtime = new HeadlessRuntime();

/**
 * The TurboWarp Desktop live-reload bridge, or null if it could not start
 * (e.g. the port is already in use). Editing tools work either way.
 *
 * @type {import('./bridge.js').Bridge | null}
 */
let bridge = null;

/** The single project currently held open by the server. */
const state = {
  /** @type {string | null} Absolute path the project was loaded from, if any. */
  path: null,
  /** @type {import('scratch4js').Project | null} */
  project: null,
  /**
   * @type {import('s-api4js').ScratchSession | null} The Scratch session used
   * for online reads/edits. Created on first use; authenticated by `scratch_login`.
   */
  session: null,
  /**
   * @type {number | string | null} The scratch.mit.edu project id the open
   * project came from (set by `open_scratch_project`), used as the default
   * target for `push_to_scratch` / `share_project`.
   */
  scratchProjectId: null,
};

/** @returns {import('s-api4js').ScratchSession} An (unauthenticated) session, created on demand. */
function scratchSession() {
  if (!state.session) state.session = new ScratchSession();
  return state.session;
}

/** @returns {import('s-api4js').ScratchSession} The session, requiring login. */
function loggedInSession() {
  if (!state.session?.loggedIn)
    throw new Error('Not logged in to Scratch. Call `scratch_login` first.');
  return state.session;
}

/**
 * Resolve the Scratch project id to act on: an explicit argument wins,
 * otherwise the id the open project was loaded from.
 *
 * @param {number | string | undefined} projectId
 * @returns {number | string}
 */
function resolveProjectId(projectId) {
  const id = projectId ?? state.scratchProjectId;
  if (id === null || id === undefined)
    throw new Error(
      'No Scratch project id. Pass `projectId`, or open one with `open_scratch_project` first.',
    );
  return id;
}

/** @returns {import('scratch4js').Project} The open project, or throws. */
function openProject() {
  if (!state.project)
    throw new Error('No project is open. Call `open_project` first.');
  return state.project;
}

/**
 * Resolve a target (sprite or the stage) by name.
 *
 * @param {string} name - Sprite name, or "Stage".
 * @returns {import('scratch4js').Sprite | import('scratch4js').Stage}
 */
function target(name) {
  const found = openProject().target(name);
  if (!found) throw new Error(`No target named "${name}".`);
  return found;
}

/**
 * Resolve a sprite by name (rejecting the stage).
 *
 * @param {string} name
 * @returns {import('scratch4js').Sprite}
 */
function sprite(name) {
  const found = openProject().sprite(name);
  if (!found) throw new Error(`No sprite named "${name}".`);
  return found;
}

/** Build a plain summary of a sprite for tool output. */
const spriteSummary = (s) => ({
  name: s.name,
  x: s.x,
  y: s.y,
  size: s.size,
  direction: s.direction,
  visible: s.visible,
  rotationStyle: s.rotationStyle,
  draggable: s.draggable,
  layerOrder: s.layerOrder,
  costumes: s.costumes.map((c) => c.name),
  sounds: s.sounds.map((c) => c.name),
});

/** Build a plain summary of a workspace comment for tool output. */
const commentSummary = (c) => ({
  id: c.id,
  text: c.text,
  blockId: c.blockId,
  x: c.x,
  y: c.y,
  width: c.width,
  height: c.height,
  minimized: c.minimized,
});

/** Wrap a value as an MCP text-content result. */
const ok = (value) => ({
  content: [
    {
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    },
  ],
});

const server = new McpServer(
  { name: 'scratch-mcp', version: '1.2.4' },
  { capabilities: { tools: {}, logging: {} } },
);

// Stream notable runtime events (say/think, broadcasts, green flag, question/
// answer, errors) to the client as MCP log notifications. The client controls
// the firehose with the standard `logging/setLevel` request — the SDK drops any
// message below the level it asked for — so this is silent until a client opts
// in (e.g. by selecting "info" or "debug"). Activity events are `info`, run
// boundaries and bubble-clears are `debug`, and runtime/compile errors `error`.
runtime.onEvent = (event) => {
  server
    .sendLoggingMessage({
      level: event.level,
      logger: 'scratch-vm',
      data: event,
    })
    .catch(() => {
      // Never let a logging failure (e.g. not yet connected) break a tool call.
    });
};

/**
 * Register a tool whose handler may throw; thrown errors become a clean,
 * non-fatal MCP error result instead of crashing the connection.
 *
 * @param {string} name
 * @param {object} config - `{ title, description, inputSchema }`.
 * @param {(args: object) => unknown | Promise<unknown>} handler
 */
function tool(name, config, handler) {
  server.registerTool(name, config, async (args) => {
    try {
      return ok(await handler(args ?? {}));
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  });
}

/**
 * Require explicit human confirmation before an outward-facing action (editing
 * or publishing a live Scratch project). Prefers MCP elicitation so the *user*
 * — not the model — approves; falls back to an explicit `confirm: true` tool
 * argument when the client can't elicit. Throws (cancelling the action) if the
 * user declines or confirmation can't be obtained.
 *
 * @param {string} message - What the user is being asked to approve.
 * @param {boolean | undefined} fallbackConfirm - The tool's `confirm` argument.
 */
async function requireConfirmation(message, fallbackConfirm) {
  const caps = server.server.getClientCapabilities?.();
  if (caps?.elicitation) {
    try {
      const result = await server.server.elicitInput({
        message,
        requestedSchema: {
          type: 'object',
          title: 'Confirm',
          properties: {
            confirm: {
              type: 'boolean',
              title: 'Proceed',
              description: message,
            },
          },
          required: ['confirm'],
        },
      });
      if (result.action === 'accept' && result.content?.confirm === true)
        return;
      throw new Error('Cancelled: the user did not confirm this action.');
    } catch (err) {
      // A genuine decline is final; only fall back when elicitation itself is
      // unsupported by this client (older form-less capability advertisement).
      if (/did not confirm|cancelled/i.test(String(err?.message))) throw err;
    }
  }
  if (fallbackConfirm !== true)
    throw new Error(
      'This action affects the live Scratch project and needs confirmation. ' +
        'Confirm with the user, then call again with `confirm: true`.',
    );
}

// --- Project lifecycle ------------------------------------------------------

tool(
  'open_project',
  {
    title: 'Open project',
    description: 'Load an .sb3 file from disk into memory for editing.',
    inputSchema: { path: z.string().describe('Path to the .sb3 file.') },
  },
  async ({ path }) => {
    const abs = resolve(path);
    state.project = await Project.load(await readFile(abs));
    state.path = abs;
    const p = state.project;
    return {
      opened: abs,
      sprites: p.sprites.map((s) => s.name),
      variables: p.stage.variableNames,
      lists: p.stage.listNames,
      broadcasts: p.stage.broadcastNames,
      assets: p.assets.size,
      meta: p.meta,
    };
  },
);

tool(
  'save_project',
  {
    title: 'Save project',
    description:
      'Write the open project back to an .sb3 file (defaults to the path it was opened from). ' +
      'If the TurboWarp Desktop userscript is installed, the editor reloads the file automatically.',
    inputSchema: {
      path: z
        .string()
        .optional()
        .describe('Destination path. Defaults to the opened file.'),
      compressionLevel: z.number().int().min(1).max(9).optional(),
    },
  },
  async ({ path, compressionLevel }) => {
    const p = openProject();
    const dest = path ? resolve(path) : state.path;
    if (!dest) throw new Error('No destination path; pass `path`.');
    const bytes = await p.save(
      compressionLevel ? { compressionLevel } : undefined,
    );
    await writeFile(dest, bytes);
    const reloaded = bridge ? await bridge.loadSB3(dest) : 0;
    return { saved: dest, bytes: bytes.length, reloaded };
  },
);

tool(
  'project_info',
  {
    title: 'Project info',
    description:
      'Summarize the open project: targets, extensions, monitors and meta.',
    inputSchema: {},
  },
  () => {
    const p = openProject();
    return {
      path: state.path,
      targets: p.targets.map((t) => t.name),
      sprites: p.sprites.map((s) => s.name),
      extensions: p.extensions,
      monitors: p.monitors.length,
      meta: p.meta,
    };
  },
);

// --- Scratch website (online projects, via s-api4js) ------------------------

tool(
  'scratch_login',
  {
    title: 'Log in to Scratch',
    description:
      'Authenticate with a scratch.mit.edu account so the server can open your ' +
      'projects from the website and (with your confirmation) save edits back ' +
      'and publish them. Credentials default to the SCRATCH_USER / SCRATCH_PASS ' +
      'environment variables if omitted. The session is kept in memory for this ' +
      'server process only.',
    inputSchema: {
      username: z
        .string()
        .optional()
        .describe('Scratch username. Defaults to $SCRATCH_USER.'),
      password: z
        .string()
        .optional()
        .describe('Scratch password. Defaults to $SCRATCH_PASS.'),
    },
  },
  async ({ username, password }) => {
    const user = username ?? process.env.SCRATCH_USER;
    const pass = password ?? process.env.SCRATCH_PASS;
    if (!user || !pass)
      throw new Error(
        'Missing credentials. Pass `username`/`password`, or set SCRATCH_USER and SCRATCH_PASS.',
      );
    state.session = await ScratchSession.login(user, pass);
    return {
      loggedIn: true,
      username: state.session.username,
      userId: state.session.userId,
    };
  },
);

tool(
  'open_scratch_project',
  {
    title: 'Open a Scratch project from the website',
    description:
      'Download a project from scratch.mit.edu by id and hold it open in memory ' +
      'for editing — the same in-memory project the other editing tools act on. ' +
      'Shared projects open without login; your own unshared projects need ' +
      '`scratch_login` first. Use `push_to_scratch` to save edits back.',
    inputSchema: {
      projectId: z
        .union([z.number(), z.string()])
        .describe('The scratch.mit.edu project id.'),
    },
  },
  async ({ projectId }) => {
    const { json, assets } =
      await scratchSession().projects.download(projectId);
    state.project = new Project(json, assets);
    state.path = null;
    state.scratchProjectId = projectId;
    const p = state.project;
    return {
      opened: `scratch:${projectId}`,
      sprites: p.sprites.map((s) => s.name),
      variables: p.stage.variableNames,
      lists: p.stage.listNames,
      broadcasts: p.stage.broadcastNames,
      assets: p.assets.size,
      meta: p.meta,
    };
  },
);

tool(
  'push_to_scratch',
  {
    title: 'Save edits to the Scratch project',
    description:
      'Save the open project back to scratch.mit.edu, overwriting the online ' +
      "project's contents (uploads its costumes/sounds, then writes project.json). " +
      'Requires login and ownership of the project. This edits the live project, ' +
      'so it always asks the user to confirm first (set `confirm: true` only ' +
      'after the user has agreed).',
    inputSchema: {
      projectId: z
        .union([z.number(), z.string()])
        .optional()
        .describe('Target project id. Defaults to the opened Scratch project.'),
      confirm: z
        .boolean()
        .optional()
        .describe(
          'Set true only after the user confirmed (used if the client cannot prompt).',
        ),
    },
  },
  async ({ projectId, confirm }) => {
    const session = loggedInSession();
    const id = resolveProjectId(projectId);
    const p = openProject();
    await requireConfirmation(
      `Save your edits to Scratch project ${id}? This overwrites the online project.`,
      confirm,
    );
    await session.projects.save(id, p);
    return { saved: `scratch:${id}`, assets: p.assets.size };
  },
);

tool(
  'share_project',
  {
    title: 'Publish (share) the Scratch project',
    description:
      'Publish a project on scratch.mit.edu so it becomes publicly visible ' +
      '(PUT /proxy/projects/<id>/share). Requires login and ownership. ' +
      'Publishing is public and outward-facing, so it always asks the user to ' +
      'confirm first (set `confirm: true` only after the user has agreed).',
    inputSchema: {
      projectId: z
        .union([z.number(), z.string()])
        .optional()
        .describe(
          'Project id to share. Defaults to the opened Scratch project.',
        ),
      confirm: z
        .boolean()
        .optional()
        .describe(
          'Set true only after the user confirmed (used if the client cannot prompt).',
        ),
    },
  },
  async ({ projectId, confirm }) => {
    const session = loggedInSession();
    const id = resolveProjectId(projectId);
    await requireConfirmation(
      `Publish (share) Scratch project ${id} so it is publicly visible?`,
      confirm,
    );
    await session.projects.share(id);
    return { shared: `scratch:${id}` };
  },
);

// --- Reading ----------------------------------------------------------------

tool(
  'list_sprites',
  {
    title: 'List sprites',
    description: 'List every sprite with its position, size and media.',
    inputSchema: {},
  },
  () => openProject().sprites.map(spriteSummary),
);

tool(
  'get_target',
  {
    title: 'Get target',
    description:
      'Full details for one target (a sprite or the stage), including variables and lists.',
    inputSchema: { name: z.string().describe('Sprite name, or "Stage".') },
  },
  ({ name }) => {
    const t = target(name);
    const base = {
      name: t.name,
      isStage: t.isStage,
      volume: t.volume,
      costumes: t.costumes.map((c) => ({
        name: c.name,
        format: c.dataFormat,
        md5ext: c.md5ext,
      })),
      sounds: t.sounds.map((s) => ({
        name: s.name,
        format: s.dataFormat,
        md5ext: s.md5ext,
      })),
      variables: Object.fromEntries(
        t.variableNames.map((n) => [n, t.getVariable(n)]),
      ),
      lists: Object.fromEntries(t.listNames.map((n) => [n, t.getList(n)])),
    };
    return t.isStage
      ? { ...base, ...spriteStageExtras(t) }
      : { ...base, ...spriteSummary(t) };
  },
);

/** Stage-only fields for `get_target`. */
const spriteStageExtras = (s) => ({
  tempo: s.tempo,
  videoState: s.videoState,
  videoTransparency: s.videoTransparency,
  broadcasts: s.broadcastNames,
});

// --- Raw JSON editing (diff/patch) ------------------------------------------

/**
 * A compact digest of a target's raw JSON, returned after a patch so the agent
 * can confirm the shape without echoing the (often huge) `blocks` map.
 */
const targetDigest = (json) => ({
  name: json.name,
  isStage: Boolean(json.isStage),
  costumes: (json.costumes ?? []).map((c) => c.name),
  sounds: (json.sounds ?? []).map((s) => s.name),
  variables: Object.values(json.variables ?? {}).map(([n]) => n),
  lists: Object.values(json.lists ?? {}).map(([n]) => n),
  blocks: Object.keys(json.blocks ?? {}).length,
});

tool(
  'get_target_json',
  {
    title: 'Get raw target JSON',
    description:
      "A target's complete raw project.json entry — `blocks` (scripts), " +
      'costumes, sounds, variables, lists and properties — exactly as stored. ' +
      'Read this first to author a `patch_target` edit, since the patch paths ' +
      'are JSON Pointers into this object. Pass `pointer` to fetch just a subtree ' +
      '(e.g. "/blocks" or "/blocks/abc123") and keep the response small.',
    inputSchema: {
      name: z.string().describe('Sprite name, or "Stage".'),
      pointer: z
        .string()
        .optional()
        .describe(
          'Optional JSON Pointer (RFC 6901) to a subtree, e.g. "/blocks". ' +
            'Omit or pass "" for the whole target.',
        ),
    },
  },
  ({ name, pointer }) => {
    const { json } = target(name);
    return pointer ? getPointer(json, pointer) : json;
  },
);

tool(
  'list_blocks',
  {
    title: 'List block types',
    description:
      'The catalog of standard Scratch block opcodes you can use in a ' +
      "target's `blocks` map — each with its category, shape (hat / stack / " +
      'c-block / cap / reporter / boolean) and the names of its inputs and ' +
      'fields. Use this to discover opcodes, then `get_block_schema` for how to ' +
      'fill one in. With no `category`, lists core blocks; pass a core category ' +
      '(motion, looks, sound, event, control, sensing, operator, data, ' +
      'procedures) or a built-in extension id (pen, music, videoSensing, ' +
      'text2speech, translate, makeymakey, microbit, ev3, boost, wedo2, gdxfor) ' +
      'to filter.',
    inputSchema: {
      category: z
        .string()
        .optional()
        .describe('A core category or a built-in extension id.'),
    },
  },
  ({ category }) => listBlocks(category),
);

tool(
  'get_block_schema',
  {
    title: 'Get block schema',
    description:
      'The full schema for one block opcode: its shape, every input (with the ' +
      'sb3 shadow encoding to use, e.g. a text input is `[1, [10, "hi"]]`), ' +
      'every field (with enumerated dropdown `options` where applicable), and a ' +
      'ready-to-adapt example block JSON. Read this before writing a block with ' +
      '`patch_target`. In the example, `<…>` placeholders (block ids, variable ' +
      'ids) must be replaced with real ones; menu inputs also need a matching ' +
      'shadow block (opcode `menuOpcode`, a field named `menuField`, ' +
      '`shadow: true`). Dynamic menu `options` (sprites, sounds, costumes, …) ' +
      'are filled from the open project; pass `target` to enumerate that ' +
      "sprite's own costumes and sounds.",
    inputSchema: {
      opcode: z
        .string()
        .describe('A block opcode, e.g. "looks_say" or "control_if".'),
      target: z
        .string()
        .optional()
        .describe(
          'Sprite name (or "Stage") whose costumes/sounds should populate ' +
            'dynamic menus.',
        ),
    },
  },
  ({ opcode, target: targetName }) => {
    const context = {};
    if (state.project) {
      const p = state.project;
      context.sprites = p.sprites.map((s) => s.name);
      context.targets = ['Stage', ...context.sprites];
      context.backdrops = p.stage.costumes.map((c) => c.name);
      context.broadcasts = p.stage.broadcastNames;
      const t = targetName ? p.target(targetName) : undefined;
      if (t) {
        context.costumes = t.costumes.map((c) => c.name);
        context.sounds = t.sounds.map((s) => s.name);
      }
    }
    return getBlockSchema(opcode, context);
  },
);

tool(
  'enable_extension',
  {
    title: 'Enable an extension',
    description:
      'Register an extension on the project so its blocks load and show in the ' +
      'palette — required before using any `<id>_…` extension block. For a ' +
      'built-in extension pass just its `id` (pen, music, videoSensing, ' +
      'text2speech, translate, makeymakey, microbit, ev3, boost, wedo2, ' +
      'gdxfor). For a custom/third-party (TurboWarp) extension, also pass the ' +
      "loader `url` so the editor can fetch it. Adds the id to the project's " +
      '`extensions` and, with a url, records it in `extensionURLs`.',
    inputSchema: {
      id: z
        .string()
        .describe('The extension id, e.g. "pen" or a custom extension id.'),
      url: z
        .string()
        .optional()
        .describe('Loader URL for a custom/third-party extension.'),
    },
  },
  ({ id, url }) => {
    const p = openProject();
    if (!Array.isArray(p.json.extensions)) p.json.extensions = [];
    const added = !p.json.extensions.includes(id);
    if (added) p.json.extensions.push(id);
    if (url)
      p.json.extensionURLs = { ...(p.json.extensionURLs ?? {}), [id]: url };
    const builtin = BUILTIN_EXTENSION_IDS.has(id);
    return {
      enabled: id,
      added,
      builtin,
      extensions: p.json.extensions,
      ...(!builtin && !url
        ? {
            note: `"${id}" is not a built-in extension; pass \`url\` so the editor can load it.`,
          }
        : {}),
    };
  },
);

tool(
  'patch_target',
  {
    title: 'Patch target JSON',
    description:
      "Apply an RFC 6902 JSON Patch to a target's raw JSON — the way to edit a " +
      "sprite's scripts (`blocks`) or any field a higher-level tool does not " +
      'cover, on a sprite you just made or an existing one. Paths are JSON ' +
      'Pointers into the object returned by `get_target_json`; read that first. ' +
      'To write `blocks`, discover opcodes with `list_blocks` and get the exact ' +
      'input/field shapes from `get_block_schema` — the result reports advisory ' +
      '`warnings` for unknown opcodes or inputs. ' +
      'The patch is applied atomically: if any operation fails the target is left ' +
      'unchanged. Notes: patching the `costumes`/`sounds` arrays does not touch ' +
      'stored asset bytes (use `add_costume`/`remove_costume` for those), and you ' +
      'are responsible for keeping `blocks` internally consistent (ids, ' +
      '`next`/`parent` links).',
    inputSchema: {
      name: z.string().describe('Sprite name, or "Stage".'),
      patch: z
        .array(
          z
            .object({
              op: z.enum(['add', 'remove', 'replace', 'move', 'copy', 'test']),
              path: z.string().describe('JSON Pointer target of the op.'),
              from: z
                .string()
                .optional()
                .describe('Source pointer for `move`/`copy`.'),
              value: z
                .any()
                .optional()
                .describe('Value for `add`/`replace`/`test`.'),
            })
            .passthrough(),
        )
        .describe('A JSON Patch document (array of operations).'),
    },
  },
  ({ name, patch }) => {
    const t = target(name);
    const patched = applyPatch(t.json, patch);
    if (!patched || typeof patched !== 'object' || Array.isArray(patched))
      throw new Error('Patch must leave the target as a JSON object.');
    if (Boolean(patched.isStage) !== t.isStage)
      throw new Error(
        'A patch may not change a target between stage and sprite.',
      );
    // Commit by replacing the entry in place so all references stay valid.
    const targets = openProject().json.targets;
    targets[targets.indexOf(t.json)] = patched;
    // Advisory only: surface likely-wrong opcodes/inputs without rejecting the
    // patch (custom/third-party extension blocks are intentionally not flagged).
    const warnings = validateBlocks(patched.blocks, {
      enabledExtensions: openProject().extensions,
    });
    return {
      patched: name,
      ops: patch.length,
      target: targetDigest(patched),
      ...(warnings.length ? { warnings } : {}),
    };
  },
);

// --- Sprites ----------------------------------------------------------------

const spriteProps = {
  x: z.number().optional(),
  y: z.number().optional(),
  size: z.number().optional(),
  direction: z.number().optional(),
  visible: z.boolean().optional(),
  draggable: z.boolean().optional(),
  rotationStyle: z
    .enum(['all around', 'left-right', "don't rotate"])
    .optional(),
  layerOrder: z.number().optional(),
  volume: z.number().optional(),
};

/** Apply any provided sprite props to a sprite. */
function applyProps(s, props) {
  for (const key of Object.keys(spriteProps)) {
    if (props[key] !== undefined) s[key] = props[key];
  }
}

tool(
  'set_sprite',
  {
    title: 'Set sprite properties',
    description:
      'Update one or more properties of a sprite (position, size, direction, visibility, …).',
    inputSchema: { name: z.string(), ...spriteProps },
  },
  ({ name, ...props }) => {
    const s = sprite(name);
    applyProps(s, props);
    return spriteSummary(s);
  },
);

tool(
  'add_sprite',
  {
    title: 'Add sprite',
    description:
      'Add a new, empty sprite. Add at least one costume before opening it in the editor.',
    inputSchema: { name: z.string(), ...spriteProps },
  },
  ({ name, ...props }) => {
    const s = openProject().addSprite(name);
    applyProps(s, props);
    return spriteSummary(s);
  },
);

tool(
  'remove_sprite',
  {
    title: 'Remove sprite',
    description: 'Delete a sprite and any assets only it used.',
    inputSchema: { name: z.string() },
  },
  ({ name }) => ({ removed: openProject().removeSprite(name) }),
);

tool(
  'rename_target',
  {
    title: 'Rename target',
    description: 'Rename a sprite (or the stage).',
    inputSchema: { name: z.string(), newName: z.string() },
  },
  ({ name, newName }) => {
    target(name).name = newName;
    return { renamed: newName };
  },
);

tool(
  'set_stage',
  {
    title: 'Set stage properties',
    description:
      'Update stage-level properties: tempo, video state/transparency, volume.',
    inputSchema: {
      tempo: z.number().optional(),
      videoState: z.enum(['on', 'off', 'on-flipped']).optional(),
      videoTransparency: z.number().optional(),
      volume: z.number().optional(),
    },
  },
  (props) => {
    const stage = openProject().stage;
    for (const [k, v] of Object.entries(props))
      if (v !== undefined) stage[k] = v;
    return spriteStageExtras(stage);
  },
);

// --- Variables, lists, broadcasts -------------------------------------------

const scalar = z.union([z.string(), z.number(), z.boolean()]);

tool(
  'set_variable',
  {
    title: 'Set variable',
    description: 'Create or update a variable on a target by name.',
    inputSchema: {
      target: z.string().describe('Sprite name, or "Stage".'),
      name: z.string(),
      value: scalar,
    },
  },
  ({ target: t, name, value }) => {
    target(t).setVariable(name, value);
    return { target: t, variable: name, value };
  },
);

tool(
  'delete_variable',
  {
    title: 'Delete variable',
    description: 'Delete a variable from a target by name.',
    inputSchema: { target: z.string(), name: z.string() },
  },
  ({ target: t, name }) => ({ deleted: target(t).deleteVariable(name) }),
);

tool(
  'set_list',
  {
    title: 'Set list',
    description: 'Create or replace a list on a target by name.',
    inputSchema: {
      target: z.string(),
      name: z.string(),
      items: z.array(scalar),
    },
  },
  ({ target: t, name, items }) => {
    target(t).setList(name, items);
    return { target: t, list: name, length: items.length };
  },
);

tool(
  'delete_list',
  {
    title: 'Delete list',
    description: 'Delete a list from a target by name.',
    inputSchema: { target: z.string(), name: z.string() },
  },
  ({ target: t, name }) => ({ deleted: target(t).deleteList(name) }),
);

tool(
  'add_broadcast',
  {
    title: 'Add broadcast',
    description:
      'Add a broadcast message to the project (no-op if it already exists).',
    inputSchema: { name: z.string() },
  },
  ({ name }) => ({ id: openProject().stage.addBroadcast(name) }),
);

// --- Comments ---------------------------------------------------------------

const commentBox = {
  x: z.number().optional().describe('Canvas X position.'),
  y: z.number().optional().describe('Canvas Y position.'),
  width: z.number().optional().describe('Box width in pixels.'),
  height: z.number().optional().describe('Box height in pixels.'),
  minimized: z
    .boolean()
    .optional()
    .describe('Whether the comment is collapsed to its title bar.'),
};

tool(
  'list_comments',
  {
    title: 'List comments',
    description:
      "List a target's workspace comments — the yellow sticky notes shown in " +
      'the editor. Each has an `id`, its `text`, and either a `blockId` (when ' +
      'attached to a block) or `null` (when floating free on the canvas).',
    inputSchema: { target: z.string().describe('Sprite name, or "Stage".') },
  },
  ({ target: t }) => target(t).comments.map(commentSummary),
);

tool(
  'add_comment',
  {
    title: 'Add comment',
    description:
      'Add a workspace comment to a target. With no `blockId` the comment ' +
      "floats free on the canvas; pass a `blockId` (a key in the target's " +
      '`blocks` map — see `get_target_json`) to attach it to that block, which ' +
      "also sets the block's `comment` back-reference so the editor anchors it.",
    inputSchema: {
      target: z.string().describe('Sprite name, or "Stage".'),
      text: z.string().describe('The comment text.'),
      blockId: z
        .string()
        .optional()
        .describe('Block id to attach to. Omit for a free-floating comment.'),
      ...commentBox,
    },
  },
  ({ target: t, text, ...options }) =>
    commentSummary(target(t).addComment(text, options)),
);

tool(
  'set_comment',
  {
    title: 'Set comment',
    description:
      'Update an existing comment on a target by id: its `text`, position, ' +
      'size, `minimized` state, or the `blockId` it is attached to (pass an ' +
      'empty string or null to detach it). Only the fields you pass change.',
    inputSchema: {
      target: z.string().describe('Sprite name, or "Stage".'),
      id: z.string().describe('The comment id (from `list_comments`).'),
      text: z.string().optional().describe('New comment text.'),
      blockId: z
        .string()
        .nullable()
        .optional()
        .describe('Block id to attach to, or null/"" to detach.'),
      ...commentBox,
    },
  },
  ({ target: t, id, ...props }) => {
    const resolved = target(t);
    const comment = resolved.getComment(id);
    if (!comment) throw new Error(`No comment with id "${id}".`);
    // Re-attaching changes which block points back at this comment; clear the
    // old block's pointer and set the new one so the editor anchors it right.
    if (props.blockId !== undefined) {
      const next = props.blockId === '' ? null : props.blockId;
      const blocks = resolved.json.blocks ?? {};
      if (comment.blockId && blocks[comment.blockId]?.comment === id)
        delete blocks[comment.blockId].comment;
      if (next && blocks[next]) blocks[next].comment = id;
      comment.blockId = next;
    }
    for (const key of ['text', 'x', 'y', 'width', 'height', 'minimized'])
      if (props[key] !== undefined) comment[key] = props[key];
    return commentSummary(comment);
  },
);

tool(
  'remove_comment',
  {
    title: 'Remove comment',
    description:
      'Delete a workspace comment from a target by id. If it was attached to a ' +
      "block, the block's `comment` back-reference is cleared too.",
    inputSchema: {
      target: z.string().describe('Sprite name, or "Stage".'),
      id: z.string().describe('The comment id (from `list_comments`).'),
    },
  },
  ({ target: t, id }) => ({ removed: target(t).removeComment(id) }),
);

// --- Costumes & sounds ------------------------------------------------------

tool(
  'add_costume',
  {
    title: 'Add costume',
    description:
      'Add a costume to a sprite (or the stage) from an image file on disk.',
    inputSchema: {
      target: z.string().describe('Sprite name, or "Stage".'),
      name: z.string(),
      path: z.string().describe('Path to the image file (PNG/SVG/JPG).'),
      dataFormat: z
        .string()
        .optional()
        .describe('Override the detected file type.'),
      rotationCenterX: z.number().optional(),
      rotationCenterY: z.number().optional(),
    },
  },
  async ({ target: t, name, path, ...opts }) => {
    const bytes = await readFile(resolve(path));
    const c = target(t).addCostume(name, bytes, opts);
    return { added: c.name, md5ext: c.md5ext };
  },
);

tool(
  'remove_costume',
  {
    title: 'Remove costume',
    description: 'Remove a costume from a target by name.',
    inputSchema: { target: z.string(), name: z.string() },
  },
  ({ target: t, name }) => ({ removed: target(t).removeCostume(name) }),
);

tool(
  'add_sound',
  {
    title: 'Add sound',
    description:
      'Add a sound to a sprite (or the stage) from an audio file on disk.',
    inputSchema: {
      target: z.string().describe('Sprite name, or "Stage".'),
      name: z.string(),
      path: z.string().describe('Path to the audio file (WAV/MP3).'),
      dataFormat: z.string().optional(),
    },
  },
  async ({ target: t, name, path, ...opts }) => {
    const bytes = await readFile(resolve(path));
    const s = target(t).addSound(name, bytes, opts);
    return { added: s.name, md5ext: s.md5ext };
  },
);

tool(
  'remove_sound',
  {
    title: 'Remove sound',
    description: 'Remove a sound from a target by name.',
    inputSchema: { target: z.string(), name: z.string() },
  },
  ({ target: t, name }) => ({ removed: target(t).removeSound(name) }),
);

// --- Live reload (TurboWarp Desktop bridge) ---------------------------------

tool(
  'reload',
  {
    title: 'Reload in TurboWarp',
    description:
      'Tell connected TurboWarp Desktop userscripts to load an .sb3 from disk (defaults to the open project). ' +
      'Use after editing on disk without going through `save_project`.',
    inputSchema: {
      path: z
        .string()
        .optional()
        .describe('Path to load. Defaults to the open file.'),
    },
  },
  async ({ path }) => {
    if (!bridge) throw new Error('Live-reload bridge is not running.');
    const dest = path ? resolve(path) : state.path;
    if (!dest)
      throw new Error('No path to reload; open a project or pass `path`.');
    return { reloaded: await bridge.loadSB3(dest), clients: bridge.clients };
  },
);

tool(
  'run_project',
  {
    title: 'Run project',
    description:
      'Press the green flag in connected TurboWarp Desktop userscripts.',
    inputSchema: {},
  },
  async () => {
    if (!bridge) throw new Error('Live-reload bridge is not running.');
    await bridge.start();
    return { started: bridge.clients };
  },
);

tool(
  'stop_project',
  {
    title: 'Stop project',
    description: 'Stop running in connected TurboWarp Desktop userscripts.',
    inputSchema: {},
  },
  async () => {
    if (!bridge) throw new Error('Live-reload bridge is not running.');
    await bridge.stop();
    return { stopped: bridge.clients };
  },
);

// --- Headless runtime (run & test the project in-process) -------------------

tool(
  'vm_load',
  {
    title: 'Load project into the runtime',
    description:
      'Load the open project into a headless Scratch VM (TurboWarp, JIT) for ' +
      'running and testing — no browser needed. Reflects the current in-memory ' +
      'edits; call again after editing to pick up changes. Returns a state snapshot.',
    inputSchema: {},
  },
  async () => {
    const bytes = await openProject().save();
    return runtime.loadFromBytes(bytes);
  },
);

tool(
  'vm_green_flag',
  {
    title: 'Green flag',
    description:
      'Press the green flag in the headless runtime (clears bubbles, the pending ' +
      'question and errors, then starts scripts). Does not advance time on its ' +
      'own — call `vm_run` to step the VM. Run `vm_load` first.',
    inputSchema: {},
  },
  () => {
    runtime.greenFlag();
    return { greenFlag: true };
  },
);

tool(
  'vm_run',
  {
    title: 'Run the runtime',
    description:
      'Advance the headless VM, then return a state snapshot. By default it runs ' +
      'in real time until every script finishes (so waits, timers and glides ' +
      'behave) or the budget elapses. Returns sprite positions, variables, lists, ' +
      'monitors, say/think bubbles, any pending question, running-thread count and errors. ' +
      'Also returns `events`: the ordered timeline of what happened since the previous ' +
      'vm_run (say/think, broadcasts, question/answer, errors), so you can assert on ' +
      'sequence, not just final state.',
    inputSchema: {
      seconds: z
        .number()
        .positive()
        .optional()
        .describe('Real-time budget in seconds (default 10, max 60).'),
      frames: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Frame budget instead of `seconds` (1 frame ≈ 1/30 s).'),
      untilIdle: z
        .boolean()
        .optional()
        .describe('Stop early once no scripts are running (default true).'),
      paced: z
        .boolean()
        .optional()
        .describe(
          'Sleep one frame between steps so time-based blocks elapse (default ' +
            'true). Set false to step as fast as possible.',
        ),
    },
  },
  (opts) => runtime.run(opts),
);

tool(
  'vm_stop',
  {
    title: 'Stop the runtime',
    description: 'Stop every running script in the headless VM.',
    inputSchema: {},
  },
  () => {
    runtime.stop();
    return { stopped: true };
  },
);

tool(
  'vm_state',
  {
    title: 'Runtime state',
    description:
      'A structured snapshot of the headless VM right now: every target with its ' +
      'position/size/direction/costume/visibility, variables and lists, visible ' +
      'monitors, say/think bubbles, the pending question, running-thread count and errors. ' +
      'Assert against these rather than a screenshot.',
    inputSchema: {},
  },
  () => runtime.summary(),
);

tool(
  'vm_input',
  {
    title: 'Send input',
    description:
      'Feed input into the headless VM the way the editor would: key presses, ' +
      'mouse position/clicks, and answers to `ask and wait`. Stage coordinates ' +
      'run -240..240 (x) and -180..180 (y).',
    inputSchema: {
      keys: z
        .array(
          z.object({
            key: z
              .string()
              .describe('Scratch key name: "space", "up arrow", "a", "1", …'),
            isDown: z
              .boolean()
              .optional()
              .describe('Hold (true) or release (false). Omit for a full tap.'),
          }),
        )
        .optional(),
      mouseX: z
        .number()
        .optional()
        .describe('Mouse x in stage coords (-240..240).'),
      mouseY: z
        .number()
        .optional()
        .describe('Mouse y in stage coords (-180..180).'),
      mouseDown: z.boolean().optional().describe('Mouse button state.'),
      answer: z
        .string()
        .optional()
        .describe('Answer the pending `ask and wait` question.'),
    },
  },
  (input) => runtime.input(input),
);

server.registerTool(
  'screenshot',
  {
    title: 'Screenshot the stage',
    description:
      'Capture a PNG of the live stage from a connected TurboWarp Desktop editor ' +
      '(via the live-reload bridge + userscript). This is the real renderer, so ' +
      'load and run the project there first (`save_project`/`run_project`). For ' +
      'logic checks prefer `vm_state` — pixels are a poor substitute for values. ' +
      'For a much smaller payload use `screenshot_jpeg`.',
    inputSchema: {},
  },
  async () => {
    try {
      if (!bridge) throw new Error('Live-reload bridge is not running.');
      const dataURL = await bridge.screenshot();
      if (!dataURL)
        throw new Error(
          'No TurboWarp Desktop userscript is connected to screenshot.',
        );
      const base64 = dataURL.replace(/^data:image\/png;base64,/, '');
      return {
        content: [{ type: 'image', data: base64, mimeType: 'image/png' }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

server.registerTool(
  'screenshot_jpeg',
  {
    title: 'Screenshot the stage (JPEG)',
    description:
      'Same capture as `screenshot`, but re-encoded as JPEG (via sharp) for a ' +
      'much smaller payload. Prefer this version unless you need pixel fidelity — ' +
      'JPEG is lossy, so fine UI detail and flat color edges may soften. Optional ' +
      '`quality` (1-100, default 80).',
    inputSchema: {
      quality: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          'JPEG quality, 1-100. Higher is sharper and larger. Default 80.',
        ),
    },
  },
  async ({ quality }) => {
    try {
      if (!bridge) throw new Error('Live-reload bridge is not running.');
      const dataURL = await bridge.screenshot();
      if (!dataURL)
        throw new Error(
          'No TurboWarp Desktop userscript is connected to screenshot.',
        );
      const png = Buffer.from(
        dataURL.replace(/^data:image\/png;base64,/, ''),
        'base64',
      );
      const jpeg = await sharp(png)
        .jpeg({ quality: quality ?? 80 })
        .toBuffer();
      return {
        content: [
          {
            type: 'image',
            data: jpeg.toString('base64'),
            mimeType: 'image/jpeg',
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

// Start the live-reload bridge (best effort), then serve MCP over stdio.
const bridgePort = Number(process.env.SCRATCH_MCP_BRIDGE_PORT ?? 9060);
try {
  bridge = await startBridge({ port: bridgePort });
} catch (err) {
  console.error(
    `[scratch-mcp] live-reload bridge unavailable on port ${bridgePort} (${err.message}); ` +
      'editing tools still work.',
  );
}

await server.connect(new StdioServerTransport());
