/**
 * End-to-end tests for the scratch-mcp server, driven through the official
 * MCP Inspector (`@modelcontextprotocol/inspector`) CLI. Every assertion goes
 * over a real stdio MCP session — Inspector spawns `node src/index.js`, speaks
 * the protocol, and prints the JSON result we parse here.
 *
 * Inspector's CLI runs one method per process, so the server's in-memory open
 * project does not survive between calls. That shapes the suite: it verifies
 * the deployed MCP *contract* — the tool surface, the project-load path, and
 * error handling. Multi-step editing/running flows that need a single persistent
 * session (open → load → run → assert on runtime state) live in
 * `runtime.test.js`, which drives the server through the MCP SDK client.
 *
 * @module test/e2e.test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { EXPECTED, writeFixture } from './fixture.js';

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = dirname(here);
const serverEntry = join(pkgRoot, 'src', 'index.js');
const inspectorBin = join(pkgRoot, 'node_modules', '.bin', 'mcp-inspector');

// Inspector spawns a child `node` to run the server. The sandbox has a stray
// non-executable `node` directory ahead of the real one on PATH, so pin the
// directory of the node running this test to the front for the child too.
const childEnv = {
  ...process.env,
  PATH: `${dirname(process.execPath)}:${process.env.PATH}`,
  // Avoid binding the live-reload bridge to the default port across runs; a
  // failed bind is non-fatal anyway, but 0 keeps the server quiet.
  SCRATCH_MCP_BRIDGE_PORT: '0',
};

/**
 * Run one Inspector CLI command against a freshly spawned server and return the
 * parsed JSON it prints. Inspector exits 0 even for tool/validation errors
 * (they come back as an `isError` result), so we parse stdout regardless.
 *
 * @param {...string} args - Args after `--cli node <serverEntry>`.
 * @returns {Promise<any>}
 */
async function inspect(...args) {
  const { stdout } = await execFileAsync(
    inspectorBin,
    ['--cli', 'node', serverEntry, ...args],
    {
      env: childEnv,
      cwd: pkgRoot,
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  try {
    return JSON.parse(stdout);
  } catch (err) {
    throw new Error(`Inspector did not return JSON:\n${stdout}`, {
      cause: err,
    });
  }
}

/** List the server's tools. */
const listTools = () => inspect('--method', 'tools/list');

/**
 * Call a tool with string/scalar args (Inspector takes `key=value` pairs).
 *
 * @param {string} name
 * @param {Record<string, string|number|boolean>} [args]
 */
function callTool(name, args = {}) {
  const toolArgs = Object.entries(args).flatMap(([k, v]) => [
    '--tool-arg',
    `${k}=${v}`,
  ]);
  return inspect('--method', 'tools/call', '--tool-name', name, ...toolArgs);
}

/** Pull the first text-content block out of a tools/call result. */
const textOf = (result) =>
  result?.content?.find((c) => c.type === 'text')?.text ?? '';

let fixtureDir;
let fixturePath;

before(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), 'scratch-mcp-e2e-'));
  fixturePath = join(fixtureDir, 'fixture.sb3');
  await writeFixture(fixturePath);
});

after(async () => {
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
});

test('tools/list exposes the full tool surface with schemas', async () => {
  const { tools } = await listTools();
  const names = tools.map((t) => t.name);

  // The contract the editor/agent depends on. Update deliberately if the
  // server's tool set changes.
  const expected = [
    'open_project',
    'save_project',
    'project_info',
    'list_sprites',
    'get_target',
    'get_target_json',
    'list_blocks',
    'get_block_schema',
    'enable_extension',
    'patch_target',
    'set_sprite',
    'add_sprite',
    'remove_sprite',
    'rename_target',
    'set_stage',
    'set_variable',
    'delete_variable',
    'set_list',
    'delete_list',
    'add_broadcast',
    'add_costume',
    'remove_costume',
    'add_sound',
    'remove_sound',
    'reload',
    'run_project',
    'stop_project',
    'vm_load',
    'vm_green_flag',
    'vm_run',
    'vm_stop',
    'vm_state',
    'vm_input',
    'screenshot',
    'screenshot_pixelperfect',
  ];
  for (const name of expected) {
    assert.ok(names.includes(name), `missing tool: ${name}`);
  }

  // Every advertised tool must carry a JSON-Schema object for its input.
  for (const t of tools) {
    assert.equal(
      t.inputSchema?.type,
      'object',
      `tool ${t.name} has no object inputSchema`,
    );
  }
});

test('open_project loads a real .sb3 and reports its contents', async () => {
  const result = await callTool('open_project', { path: fixturePath });
  assert.notEqual(result.isError, true, textOf(result));

  const summary = JSON.parse(textOf(result));
  assert.equal(summary.opened, fixturePath);
  assert.deepEqual(summary.sprites, [EXPECTED.sprite]);
  assert.ok(
    summary.variables.includes(EXPECTED.variable.name),
    `variables: ${JSON.stringify(summary.variables)}`,
  );
  assert.ok(
    summary.lists.includes(EXPECTED.list.name),
    `lists: ${JSON.stringify(summary.lists)}`,
  );
  assert.equal(typeof summary.assets, 'number');
});

test('open_project on a missing file returns a clean error result', async () => {
  const result = await callTool('open_project', {
    path: join(fixtureDir, 'does-not-exist.sb3'),
  });
  assert.equal(result.isError, true);
  assert.match(textOf(result), /ENOENT|no such file/i);
});

test('open_project rejects missing required arguments', async () => {
  const result = await callTool('open_project'); // no `path`
  assert.equal(result.isError, true);
  assert.match(textOf(result), /validation|required/i);
});

test('editing tools error cleanly when no project is open', async () => {
  // Each Inspector call is its own process, so these never see an open project
  // — exactly the path an agent hits if it edits before `open_project`.
  for (const name of ['list_sprites', 'project_info', 'save_project']) {
    const result = await callTool(name);
    assert.equal(result.isError, true, `${name} should error`);
    assert.match(textOf(result), /No project is open/i, `${name} message`);
  }
});

test('runtime tools error cleanly before the project is loaded into the VM', async () => {
  // The headless VM is loaded separately (`vm_load`), so these guard on the
  // runtime, not the open project.
  for (const name of ['vm_state', 'vm_run', 'vm_green_flag']) {
    const result = await callTool(name);
    assert.equal(result.isError, true, `${name} should error`);
    assert.match(
      textOf(result),
      /No project loaded in the runtime/i,
      `${name} message`,
    );
  }
});

test('run_project drives the bridge even with no userscript connected', async () => {
  // SCRATCH_MCP_BRIDGE_PORT=0 binds the bridge to a free port with no clients.
  const result = await callTool('run_project');
  assert.notEqual(result.isError, true, textOf(result));
  assert.deepEqual(JSON.parse(textOf(result)), { started: 0 });
});

test('screenshot tools error cleanly when no TurboWarp userscript is connected', async () => {
  for (const name of ['screenshot', 'screenshot_pixelperfect']) {
    const result = await callTool(name);
    assert.equal(result.isError, true, `${name} should error`);
    assert.match(
      textOf(result),
      /no turbowarp desktop userscript is connected/i,
      `${name} message`,
    );
  }
});
