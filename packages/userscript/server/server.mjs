#!/usr/bin/env node
/*
 * server.mjs — the scratch-p2p relay.
 *
 * One participant runs this; everyone's TurboWarp Desktop connects to it over a
 * plain WebSocket. It is a dumb star-topology relay with no Scratch knowledge:
 *
 *   - The FIRST client to connect is the host. Its live project is the shared
 *     source of truth.
 *   - When another client joins, the relay tells the host ({t:'peer-joined'}),
 *     the host saves its current .sb3 and sends it addressed to that peer
 *     ({t:'project', to}), and the relay routes it on.
 *   - Every {t:'sync'} message is fanned out to all other clients.
 *   - If the host leaves, the oldest remaining client is promoted to host so
 *     future joiners still have a project source.
 *
 * Run it from the repo:  pnpm --filter scratch-p2p serve
 * Change the port with the SCRATCH_P2P_PORT env var (default 9070).
 */
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.SCRATCH_P2P_PORT || 9070);

const wss = new WebSocketServer({ host: '0.0.0.0', port: PORT });

let nextId = 1;
/** @type {Map<string, {ws: import('ws').WebSocket}>} insertion-ordered. */
const clients = new Map();
let hostId = null;

const log = (...a) => console.log('[scratch-p2p-server]', ...a);

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}
function broadcast(obj, exceptId) {
  for (const [id, c] of clients) if (id !== exceptId) send(c.ws, obj);
}
function announcePeers() {
  broadcast({ t: 'peers', count: clients.size });
}

wss.on('connection', (ws) => {
  const id = String(nextId++);
  const isHost = hostId === null;
  if (isHost) hostId = id;
  clients.set(id, { ws });

  send(ws, {
    t: 'welcome',
    id,
    role: isHost ? 'host' : 'guest',
    peers: clients.size,
  });
  // Ask the host to stream the current project to this new peer.
  if (!isHost && hostId) send(clients.get(hostId).ws, { t: 'peer-joined', id });
  announcePeers();
  log(`+ ${id} (${isHost ? 'host' : 'guest'}) — ${clients.size} online`);

  ws.on('message', (data) => {
    let env;
    try {
      env = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (env.t === 'project' && env.to) {
      // Route a project snapshot to the specific joining peer.
      const dest = clients.get(env.to);
      if (dest) send(dest.ws, { t: 'project', sb3: env.sb3 });
    } else if (env.t === 'sync') {
      broadcast({ t: 'sync', json: env.json }, id);
    }
  });

  ws.on('close', () => {
    clients.delete(id);
    log(`- ${id} — ${clients.size} online`);
    if (id === hostId) {
      // Promote the oldest remaining client so new joiners still get a project.
      hostId = clients.keys().next().value ?? null;
      if (hostId) {
        send(clients.get(hostId).ws, { t: 'role', role: 'host' });
        log(`host left; promoted ${hostId}`);
      }
    }
    broadcast({ t: 'peer-left', id });
    announcePeers();
  });

  ws.on('error', () => {
    /* the close handler does the cleanup */
  });
});

wss.on('listening', () =>
  log(
    `relay listening on ws://0.0.0.0:${PORT} (share your LAN IP + this port)`,
  ),
);
