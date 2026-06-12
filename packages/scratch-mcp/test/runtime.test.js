/**
 * Client-driven, single-session tests for the headless runtime. Unlike
 * `e2e.test.js` (which drives the Inspector CLI, one method per process), these
 * hold ONE persistent MCP stdio session through the official SDK client so a
 * real multi-step flow — `open_project` → `vm_load` → `vm_green_flag` →
 * `vm_run` → `vm_input` — runs against the same in-memory project and VM.
 *
 * They run the fixture project and assert on *runtime state* (variables, say
 * bubbles, the event timeline, the pending question). This is the coverage the
 * contract tests can't give: it exercises the VM event wiring and the
 * `vm_run`/`vm_state` snapshot, where a bug (e.g. listening for `SAY` on the
 * wrong emitter, so bubbles were never reported) would otherwise slip through.
 *
 * @module test/runtime.test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { EXPECTED, writeFixture } from './fixture.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = dirname(here);
const serverEntry = join(pkgRoot, 'src', 'index.js');

let client;
let transport;
let fixtureDir;
let fixturePath;

before(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), 'scratch-mcp-rt-'));
  fixturePath = join(fixtureDir, 'fixture.sb3');
  await writeFixture(fixturePath);

  transport = new StdioClientTransport({
    command: process.execPath, // absolute path to this node, no PATH games
    args: [serverEntry],
    cwd: pkgRoot,
    // Bind the live-reload bridge to a free port; its absence is non-fatal.
    env: { ...process.env, SCRATCH_MCP_BRIDGE_PORT: '0' },
  });
  client = new Client({ name: 'scratch-mcp-runtime-test', version: '1.0.0' });
  await client.connect(transport);
});

after(async () => {
  await client?.close().catch(() => {});
});

after(async () => {
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
});

/** Call a tool over the persistent session; return its parsed JSON result. */
async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.find((c) => c.type === 'text')?.text ?? '';
  assert.notEqual(res.isError, true, `${name} errored: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

test('runs the fixture project and reports variables, the say bubble and the event timeline', async () => {
  await call('open_project', { path: fixturePath });
  await call('vm_load');
  await call('vm_green_flag');
  const state = await call('vm_run', { seconds: 1 });

  // 1. Execution: the Cat's script wrote its variable.
  const cat = state.targets.find((t) => t.name === EXPECTED.sprite);
  assert.ok(
    cat,
    `Cat target present in ${JSON.stringify(state.targets.map((t) => t.name))}`,
  );
  assert.equal(
    cat.variables[EXPECTED.run.greetingVar],
    EXPECTED.run.sayText,
    'variable should be written by the script',
  );

  // 2. Reporting (the regression guard): the say bubble is captured, and its
  //    text is resolved from the variable reporter — not empty, not missing.
  const bubble = state.bubbles.find((b) => b.sprite === EXPECTED.sprite);
  assert.ok(
    bubble,
    `expected a say bubble for ${EXPECTED.sprite}; got bubbles=${JSON.stringify(state.bubbles)}`,
  );
  assert.equal(bubble.type, 'say');
  assert.equal(bubble.text, EXPECTED.run.sayText);

  // 3. The event timeline records the say (agent-facing channel).
  const sayEvent = state.events?.find(
    (e) => e.type === 'say' && e.text === EXPECTED.run.sayText,
  );
  assert.ok(
    sayEvent,
    `expected a 'say' event with text ${JSON.stringify(EXPECTED.run.sayText)}; got events=${JSON.stringify(state.events)}`,
  );

  // 4. The stage's `ask and wait` is pending and captured.
  assert.equal(state.question, EXPECTED.run.question);
});

test('vm_input answers the pending question and clears it', async () => {
  // Continues in the same session: the question from the previous run is still
  // pending (the stage thread is blocked on `ask and wait`).
  const before = await call('vm_state');
  assert.equal(
    before.question,
    EXPECTED.run.question,
    'question still pending',
  );

  await call('vm_input', { answer: EXPECTED.run.answer });

  const after = await call('vm_state');
  assert.equal(after.question, null, 'question cleared after answering');
});

test('patch_target edits a script, and the edit runs in the VM', async () => {
  // Reopen for an isolated run, then rewrite the Cat's say text via a JSON Patch
  // and confirm the running VM reflects the patched value — exercising the
  // patch_target → vm_load → vm_run loop end to end.
  await call('open_project', { path: fixturePath });
  const patched = 'patched!';
  const result = await call('patch_target', {
    name: EXPECTED.sprite,
    patch: [
      {
        op: 'replace',
        path: '/blocks/cat_set/inputs/VALUE',
        value: [1, [10, patched]],
      },
    ],
  });
  assert.equal(result.patched, EXPECTED.sprite);

  await call('vm_load');
  await call('vm_green_flag');
  const state = await call('vm_run', { seconds: 1 });

  const cat = state.targets.find((t) => t.name === EXPECTED.sprite);
  assert.equal(cat.variables[EXPECTED.run.greetingVar], patched);
  const bubble = state.bubbles.find((b) => b.sprite === EXPECTED.sprite);
  assert.equal(bubble?.text, patched, 'say bubble reflects the patched value');
});
