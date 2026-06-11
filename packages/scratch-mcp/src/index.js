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
import { Project } from 'scratch4js';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startBridge } from './bridge.js';

/**
 * The TurboWarp Desktop live-reload bridge, or null if it could not start
 * (e.g. the port is already in use). Editing tools work either way.
 *
 * @type {import('./bridge.js').Bridge | null}
 */
let bridge = null;

/** The single project currently held open by the server. */
const state = {
  /** @type {string | null} Absolute path the project was loaded from. */
  path: null,
  /** @type {import('scratch4js').Project | null} */
  project: null,
};

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
  { name: 'scratch-mcp', version: '1.0.1' },
  { capabilities: { tools: {} } },
);

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
