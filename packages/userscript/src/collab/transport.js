/*
 * transport.js — WebSocket transport for collaboration.
 *
 * Holds one WebSocket to the relay server (see server/server.mjs). The relay is
 * a dumb star hub: it fans out {t:'sync'} edits to all other clients and routes
 * project snapshots between the host and joining peers. The host is just the
 * first client to connect — its live project seeds everyone else.
 *
 * This module owns connection/session state (role, peers, project-received) and
 * drives the engine + UI; the engine owns all VM/Blockly state.
 */
import { debug } from '../util.js';
import { createUI } from './ui.js';
import {
  startEngine,
  isEngineReady,
  whenEngineReady,
  applyRemote,
  saveProjectBytes,
  loadProjectBytes,
  onSendLocal,
} from './engine.js';

const DEFAULT_URL = 'ws://localhost:9070';
const RECONNECT_MS = 2000;

let ws = null;
let role = null; // 'host' | 'guest'
let myId = null;
let serverUrl = '';
let connected = false;
let lastError = null;
let projectReceived = false; // guests: have we loaded the host's project yet
let peerCount = 0;
let manualClose = false;
let ui = null;

function state() {
  if (lastError) return 'error';
  if (!ws || ws.readyState > 1) return 'idle';
  if (!connected) return 'connecting';
  if (role === 'guest' && !projectReceived) return 'connecting';
  return role === 'host' ? 'hosting' : 'connected';
}

function postStatus() {
  ui?.render({
    state: state(),
    role,
    url: serverUrl || DEFAULT_URL,
    peers: peerCount,
    error: lastError,
  });
}

function sendRaw(obj) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(obj));
    } catch (e) {
      console.error('[scratch-collab] send failed', e);
    }
  }
}

/** Engine seam: mirror a locally-produced edit to peers (the relay fans out). */
function sendLocal(msg) {
  if (!isEngineReady()) return;
  if (role === 'guest' && !projectReceived) return;
  let json;
  try {
    json = JSON.stringify(msg);
  } catch (e) {
    console.error('[scratch-collab] could not serialize message', e, msg);
    return;
  }
  debug('send', msg.meta || msg.type);
  sendRaw({ t: 'sync', json });
}

// ---- base64 <-> ArrayBuffer: project bytes ride inside JSON frames ----
function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK)
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}
function base64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Host: stream the current project to a single joining peer. */
async function sendProjectTo(id) {
  try {
    const buf = await saveProjectBytes();
    debug('sending project', buf.byteLength, 'bytes ->', id);
    sendRaw({ t: 'project', to: id, sb3: bufToBase64(buf) });
  } catch (e) {
    console.error('[scratch-collab] failed to send project', e);
  }
}

async function onServerMessage(env) {
  if (!env || !env.t) return;
  switch (env.t) {
    case 'welcome':
      myId = env.id;
      role = env.role;
      connected = true;
      lastError = null;
      if (typeof env.peers === 'number') peerCount = env.peers;
      if (role === 'host') projectReceived = true; // host already has it
      debug('welcome: id', myId, 'role', role);
      postStatus();
      break;
    case 'role': // promoted (e.g. the previous host left)
      role = env.role;
      if (role === 'host') projectReceived = true;
      debug('role ->', role);
      postStatus();
      break;
    case 'peers':
      if (typeof env.count === 'number') peerCount = env.count;
      postStatus();
      break;
    case 'peer-joined':
      // The host streams the current project to each freshly-joined peer.
      if (role === 'host') sendProjectTo(env.id);
      break;
    case 'project':
      debug('received project', env.sb3 ? 'ok' : 'empty');
      if (env.sb3) {
        await loadProjectBytes(base64ToBuf(env.sb3));
        projectReceived = true;
        postStatus();
      }
      break;
    case 'sync': {
      let msg;
      try {
        msg = JSON.parse(env.json);
      } catch {
        return;
      }
      debug('recv', msg.meta || msg.type);
      await applyRemote(msg);
      break;
    }
    case 'error':
      lastError = env.message || 'Server error.';
      postStatus();
      break;
  }
}

function connect(url) {
  disconnect(true);
  serverUrl = (url || DEFAULT_URL).trim();
  lastError = null;
  manualClose = false;
  projectReceived = false;
  role = null;
  try {
    ws = new WebSocket(serverUrl);
  } catch {
    lastError = 'Invalid server address.';
    postStatus();
    return;
  }
  ws.onopen = () => {
    debug('socket open'); // role/id arrive in the server's welcome message
    postStatus();
  };
  ws.onmessage = (ev) => {
    let env;
    try {
      env = JSON.parse(ev.data);
    } catch {
      return;
    }
    onServerMessage(env);
  };
  ws.onclose = () => {
    connected = false;
    debug('socket closed');
    postStatus();
    if (!manualClose)
      setTimeout(() => {
        if (!manualClose) connect(serverUrl);
      }, RECONNECT_MS);
  };
  ws.onerror = () => {
    if (!connected) lastError = 'Could not reach the relay server.';
  };
  postStatus();
}

function disconnect(silent) {
  manualClose = true;
  if (ws) {
    try {
      ws.onclose = null;
      ws.close();
    } catch {
      /* ignore */
    }
  }
  ws = null;
  connected = false;
  role = null;
  myId = null;
  peerCount = 0;
  projectReceived = false;
  if (!silent) {
    lastError = null;
    postStatus();
  }
}

/** Wire engine + UI + transport together and start trapping the editor. */
export function initCollab() {
  onSendLocal(sendLocal);
  ui = createUI({
    onConnect: connect,
    onDisconnect: () => disconnect(false),
    defaultUrl: DEFAULT_URL,
  });
  // Don't gate trapping on a connection — trap now so we're ready to sync the
  // moment the user connects.
  whenEngineReady().then(postStatus);
  startEngine();
  postStatus();
}
