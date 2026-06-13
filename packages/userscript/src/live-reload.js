/*
 * live-reload.js — scratch-mcp live preview.
 *
 * Connects to the scratch-mcp bridge over a plain WebSocket and, on command,
 * (re)loads or runs the project — so edits an agent makes through the MCP server
 * appear in the editor instantly.
 *
 * Protocol (JSON over WebSocket):
 *   bridge → us:  { id, method: "loadSB3" | "start" | "stop" | "screenshot", params? }
 *   us → bridge:  { id, ok: true, result? } | { id, ok: false, error }
 */
export function initLiveReload() {
  const PORT = 9060;
  const HTTP_ORIGIN = `http://localhost:${PORT}`;
  const WS_URL = `ws://localhost:${PORT}`;
  const RECONNECT_MS = 2000;

  // TurboWarp Desktop exposes the Scratch VM as a global.
  const vm = window.vm;
  if (!vm) {
    console.warn('[scratch-mcp] window.vm not found — live reload disabled.');
    return;
  }

  /** Methods the bridge can invoke. Each returns/throws; the result is acked. */
  const methods = {
    async loadSB3({ path }) {
      const res = await fetch(
        `${HTTP_ORIGIN}/get.sb3?path=${encodeURIComponent(path)}`,
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`fetch ${res.status}: ${detail}`);
      }
      const buffer = await res.arrayBuffer();
      await vm.loadProject(buffer);
      ui.setProject(path);
    },
    async start() {
      vm.greenFlag();
    },
    async stop() {
      vm.stopAll();
    },
    // Snapshot the live stage as a PNG data URL. `requestSnapshot` forces a
    // render and reads the pixels back, so it works regardless of whether the
    // WebGL context preserves its drawing buffer.
    async screenshot() {
      const renderer = vm.renderer;
      if (!renderer || typeof renderer.requestSnapshot !== 'function') {
        throw new Error('renderer unavailable');
      }
      const dataURL = await new Promise((resolve) =>
        renderer.requestSnapshot(resolve),
      );
      return { dataURL };
    },
  };

  let socket = null;
  let reconnectTimer = null;

  function connect() {
    ui.setStatus('connecting');
    socket = new WebSocket(WS_URL);
    socket.addEventListener('open', () => ui.setStatus('connected'));
    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', () => {
      ui.setStatus('disconnected');
      scheduleReconnect();
    });
    // An error is always followed by close, which handles reconnection.
    socket.addEventListener('error', () => {});
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_MS);
  }

  async function onMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    const { id, method, params } = msg;
    const handler = methods[method];
    if (!handler) {
      reply(id, false, `unknown method: ${method}`);
      return;
    }
    try {
      const result = await handler(params || {});
      reply(id, true, result);
    } catch (err) {
      reply(id, false, err && err.message ? err.message : String(err));
    }
  }

  // On success `payload` is the handler's return value (sent as `result`); on
  // failure it is the error message (sent as `error`).
  function reply(id, ok, payload) {
    if (id == null || !socket || socket.readyState !== WebSocket.OPEN) return;
    const msg = ok
      ? { id, ok: true, result: payload }
      : { id, ok: false, error: payload };
    socket.send(JSON.stringify(msg));
  }

  // --- Status toolbar (styled by userstyle.css) -----------------------------

  const ui = (() => {
    let el = null;
    let status = 'disconnected';
    let project = '';

    function mount() {
      if (el || !document.body) return;
      el = document.createElement('div');
      el.id = 'scratch-mcp-status';
      el.innerHTML =
        '<span class="label">scratch-mcp</span><span class="path"></span>';
      document.body.appendChild(el);
      render();
    }

    function render() {
      if (!el) return;
      el.dataset.status = status;
      el.querySelector('.path').textContent = project
        ? `· ${project.split(/[/\\]/).pop()}`
        : '';
      el.title = project ? `${status} · ${project}` : status;
    }

    return {
      setStatus(next) {
        status = next;
        mount();
        render();
      },
      setProject(path) {
        project = path;
        render();
      },
    };
  })();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect);
  } else {
    connect();
  }
}
