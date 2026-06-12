/**
 * The TurboWarp Desktop live-reload bridge.
 *
 * The userscript shipped in this repo connects here as a plain WebSocket client.
 * The protocol is one JSON object per message, request/ack:
 *
 *   server → client:  { id, method: "loadSB3" | "start" | "stop" | "screenshot", params? }
 *   client → server:  { id, ok: true, result? } | { id, ok: false, error }
 *
 * To (re)load a project the server sends `loadSB3` with a file path; the client
 * fetches the bytes back from `GET /get.sb3?path=…` and loads them into the VM.
 * `start`/`stop` drive the green flag. `screenshot` returns a PNG data URL of
 * the live stage in its `result`, so an agent can see what the VM rendered.
 *
 * All logging goes to stderr — stdout is reserved for the MCP JSON-RPC stream.
 *
 * @module scratch-mcp/bridge
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { WebSocketServer } from 'ws';

const ACK_TIMEOUT_MS = 10000;

const log = (...args) => console.error('[scratch-mcp:bridge]', ...args);

/**
 * Start the live-reload bridge. Resolves once it is listening, or rejects if
 * the port is unavailable (the caller may then run without live reload).
 *
 * @param {object} [options]
 * @param {number} [options.port=9060] - Port to listen on.
 * @returns {Promise<Bridge>}
 */
export function startBridge({ port = 9060 } = {}) {
  return new Promise((resolve, reject) => {
    const http = createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/get.sb3') {
        const path = url.searchParams.get('path');
        try {
          const bytes = await readFile(path);
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          res.end(bytes);
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end(`Cannot read "${path}": ${err.message}`);
        }
        return;
      }
      res.writeHead(404).end();
    });

    const wss = new WebSocketServer({ server: http });
    const bridge = new Bridge(http, wss, port);

    wss.on('connection', (ws) => {
      log(`userscript connected (${wss.clients.size} total)`);
      ws.on('message', (data) => bridge._onMessage(data));
      ws.on('close', () =>
        log(`userscript disconnected (${wss.clients.size} total)`),
      );
      ws.on('error', (err) => log('socket error:', err.message));
    });

    http.once('error', reject);
    http.listen(port, () => {
      http.removeListener('error', reject);
      log(`listening on http://localhost:${port}`);
      resolve(bridge);
    });
  });
}

/** A running bridge: knows the connected userscripts and can drive them. */
export class Bridge {
  /**
   * @param {import('node:http').Server} http
   * @param {import('ws').WebSocketServer} wss
   * @param {number} port
   */
  constructor(http, wss, port) {
    this.http = http;
    this.wss = wss;
    this.port = port;
    this._nextId = 1;
    /** @type {Map<number, (ack: { ok: boolean, error?: string }) => void>} */
    this._pending = new Map();
  }

  /** @returns {number} Number of connected userscripts. */
  get clients() {
    return this.wss.clients.size;
  }

  /**
   * Resolve a pending request when its ack arrives.
   *
   * @param {import('ws').RawData} data
   * @private
   */
  _onMessage(data) {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    const settle = this._pending.get(msg?.id);
    if (settle) {
      this._pending.delete(msg.id);
      settle(
        msg.ok
          ? { ok: true, result: msg.result }
          : { ok: false, error: msg.error },
      );
    }
  }

  /**
   * Send a request to one client and await its ack.
   *
   * @param {import('ws').WebSocket} ws
   * @param {string} method
   * @param {object} [params]
   * @returns {Promise<{ ok: boolean, error?: string }>}
   * @private
   */
  _send(ws, method, params) {
    return new Promise((resolve) => {
      const id = this._nextId++;
      const timer = setTimeout(() => {
        if (this._pending.delete(id)) resolve({ ok: false, error: 'timeout' });
      }, ACK_TIMEOUT_MS);
      this._pending.set(id, (ack) => {
        clearTimeout(timer);
        resolve(ack);
      });
      ws.send(JSON.stringify(params ? { id, method, params } : { id, method }));
    });
  }

  /**
   * Send a request to every connected userscript and await their acks.
   *
   * @param {string} method
   * @param {object} [params]
   * @returns {Promise<Array<{ ok: boolean, error?: string }>>}
   * @private
   */
  _broadcast(method, params) {
    const open = [...this.wss.clients].filter(
      (ws) => ws.readyState === ws.OPEN,
    );
    return Promise.all(open.map((ws) => this._send(ws, method, params)));
  }

  /**
   * Tell every connected userscript to load the sb3 at `path`.
   *
   * @param {string} path - Absolute path the userscript can fetch back.
   * @returns {Promise<number>} How many userscripts loaded it successfully.
   */
  async loadSB3(path) {
    const acks = await this._broadcast('loadSB3', { path });
    return acks.filter((a) => a.ok).length;
  }

  /** Press the green flag on every connected userscript. */
  start() {
    return this._broadcast('start');
  }

  /** Stop every connected userscript. */
  stop() {
    return this._broadcast('stop');
  }

  /**
   * Ask one connected userscript for a PNG snapshot of the live stage.
   *
   * @returns {Promise<string|null>} A `data:image/png;base64,…` URL, or null if
   *   no userscript is connected.
   * @throws If the userscript is connected but the snapshot fails.
   */
  async screenshot() {
    const [ws] = [...this.wss.clients].filter((c) => c.readyState === c.OPEN);
    if (!ws) return null;
    const ack = await this._send(ws, 'screenshot');
    if (!ack.ok) throw new Error(ack.error || 'screenshot failed');
    const dataURL = ack.result?.dataURL;
    if (!dataURL) throw new Error('userscript returned no image');
    return dataURL;
  }

  /** Shut the bridge down. */
  close() {
    return new Promise((resolve) => {
      this.wss.close(() => this.http.close(() => resolve()));
    });
  }
}
