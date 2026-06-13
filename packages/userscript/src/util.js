// Opt-in tracing shared by the userscript features. Set
// window.__scratchP2PDebug = true in the editor console to watch the sync path.
export function debug(...args) {
  if (window.__scratchP2PDebug) console.log('[scratch-p2p]', ...args);
}
