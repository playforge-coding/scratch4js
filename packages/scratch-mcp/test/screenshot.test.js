/**
 * Happy-path test for the screenshot tools. Spawns the server on a known bridge
 * port, connects a fake "userscript" WebSocket that answers `screenshot` with a
 * real PNG data URL (what TurboWarp Desktop would send), then checks that
 * `screenshot` returns a JPEG (transcoded via sharp) and `screenshot_pixelperfect`
 * passes the lossless PNG through unchanged.
 *
 * @module test/screenshot.test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocket } from 'ws';
import sharp from 'sharp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = dirname(here);
const serverEntry = join(pkgRoot, 'src', 'index.js');

/** Grab a currently-free TCP port (small reuse race, fine for a test). */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

let client;
let userscript;
let pngBase64;
let dataURL;

before(async () => {
  // A real little PNG to hand back, as the userscript would.
  const png = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  pngBase64 = png.toString('base64');
  dataURL = `data:image/png;base64,${pngBase64}`;

  const port = await freePort();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    cwd: pkgRoot,
    env: { ...process.env, SCRATCH_MCP_BRIDGE_PORT: String(port) },
  });
  client = new Client({
    name: 'scratch-mcp-screenshot-test',
    version: '1.0.0',
  });
  await client.connect(transport);
  // The server starts its bridge before accepting MCP, so the port is listening
  // now. Connect the fake userscript and answer screenshot requests.
  userscript = new WebSocket(`ws://localhost:${port}`);
  await new Promise((resolve, reject) => {
    userscript.once('open', resolve);
    userscript.once('error', reject);
  });
  userscript.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.method === 'screenshot') {
      userscript.send(
        JSON.stringify({ id: msg.id, ok: true, result: { dataURL } }),
      );
    }
  });
});

after(async () => {
  userscript?.close();
  await client?.close().catch(() => {});
});

/** Pull the single image-content block out of a tools/call result. */
function imageOf(result) {
  assert.notEqual(
    result.isError,
    true,
    result.content?.find((c) => c.type === 'text')?.text,
  );
  const img = result.content?.find((c) => c.type === 'image');
  assert.ok(
    img,
    `expected image content, got ${JSON.stringify(result.content)}`,
  );
  return img;
}

test('screenshot returns a JPEG transcoded from the captured PNG', async () => {
  const img = imageOf(
    await client.callTool({ name: 'screenshot', arguments: {} }),
  );
  assert.equal(img.mimeType, 'image/jpeg');
  const bytes = Buffer.from(img.data, 'base64');
  assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff', 'JPEG magic');
  // sharp can read it back as a real JPEG.
  const meta = await sharp(bytes).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 8);
  assert.equal(meta.height, 8);
});

test('screenshot honours the quality argument (lower quality = fewer bytes)', async () => {
  const hi = imageOf(
    await client.callTool({ name: 'screenshot', arguments: { quality: 90 } }),
  );
  const lo = imageOf(
    await client.callTool({ name: 'screenshot', arguments: { quality: 20 } }),
  );
  assert.ok(
    Buffer.from(lo.data, 'base64').length <=
      Buffer.from(hi.data, 'base64').length,
    'lower quality should not be larger',
  );
});

test('screenshot_pixelperfect passes the lossless PNG through unchanged', async () => {
  const img = imageOf(
    await client.callTool({ name: 'screenshot_pixelperfect', arguments: {} }),
  );
  assert.equal(img.mimeType, 'image/png');
  assert.equal(img.data, pngBase64, 'PNG bytes unchanged');
});
