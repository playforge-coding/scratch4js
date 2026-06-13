/*
 * index.js — TurboWarp Desktop userscript entry.
 *
 * Bundled by Rsbuild into a single self-executing script (dist/userscript.js)
 * that TurboWarp Desktop loads from its config directory. It wires up two
 * independent features:
 *
 *   - live-reload: scratch-mcp live preview (ws://localhost:9060)
 *   - collab:      real-time collaboration via a relay (ws://…:9070)
 *
 * They share nothing but this entry point and the status styles.
 */
import { initLiveReload } from './live-reload.js';
import { initCollab } from './collab/transport.js';

if (!window.__scratchUserscriptLoaded) {
  window.__scratchUserscriptLoaded = true;
  initLiveReload();
  initCollab();
}
