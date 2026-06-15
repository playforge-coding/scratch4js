/*
 * diff-sync.js — live visual-diff streaming for git-sb3.
 *
 * Connects to a `git sb3 watch` server (ws://localhost:9061) and pushes the
 * current project's `.sb3` bytes whenever the project changes, so the diff
 * report open in a browser refreshes live as you edit — before anything is
 * saved to disk.
 *
 * The protocol is intentionally tiny and one-directional: we send a single
 * binary WebSocket frame (the serialized .sb3) per change; the server diffs it
 * against its baseline and updates connected report pages. We never read from
 * the socket. If no watch server is running the connection just retries quietly.
 */
export function initDiffSync() {
  const PORT = 9061;
  const WS_URL = `ws://localhost:${PORT}`;
  const RECONNECT_MS = 2000;
  const DEBOUNCE_MS = 500;

  // TurboWarp Desktop exposes the Scratch VM as a global.
  const vm = window.vm;
  if (!vm) return;

  let socket = null;
  let reconnectTimer = null;
  let debounceTimer = null;
  let sending = false;

  function connect() {
    socket = new WebSocket(WS_URL);
    socket.binaryType = 'arraybuffer';
    // Push the current project as soon as we connect so a freshly opened report
    // reflects the live editor, not just the on-disk file.
    socket.addEventListener('open', () => push());
    socket.addEventListener('close', () => {
      socket = null;
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

  async function push() {
    if (!socket || socket.readyState !== WebSocket.OPEN || sending) return;
    sending = true;
    try {
      // Ask the VM to serialize the project. Older builds ignore the type
      // argument and return a Blob, so handle both.
      let out = await vm.saveProjectSb3('arraybuffer');
      if (out instanceof Blob) out = await out.arrayBuffer();
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(out);
    } catch {
      // Serialization can fail mid-edit; the next change will try again.
    } finally {
      sending = false;
    }
  }

  function schedulePush() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(push, DEBOUNCE_MS);
  }

  // PROJECT_CHANGED fires on every edit (and can fire rapidly), so debounce.
  vm.on('PROJECT_CHANGED', schedulePush);

  connect();
}
