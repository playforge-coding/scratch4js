// Opt-in tracing shared by the userscript features. Set
// window.__scratchCollabDebug = true in the editor console to watch the sync path.
export function debug(...args) {
  if (window.__scratchCollabDebug) console.log('[scratch-collab]', ...args);
}
