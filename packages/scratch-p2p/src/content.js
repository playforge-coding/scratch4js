/*
 * content.js — isolated-world bridge.
 *
 * Runs in the extension's isolated content-script world (so it can use the
 * chrome.* APIs) and does three things:
 *   1. Injects page/sync.js (PeerJS is bundled into it) into the page's MAIN
 *      world, where it can reach window.vm / Blockly and open the connection.
 *   2. Relays messages between the popup (chrome.runtime) and the page (window
 *      postMessage), since the two can't talk to each other directly.
 *   3. Caches the latest session status so a freshly-opened popup can render it.
 */
(() => {
  const api = typeof browser !== 'undefined' ? browser : chrome;

  const PAGE_TO_BRIDGE = 'scratch-p2p:page->bridge';
  const BRIDGE_TO_PAGE = 'scratch-p2p:bridge->page';

  // ---- inject the MAIN-world sync script (PeerJS is bundled inside it) ----
  function inject(path) {
    const el = document.createElement('script');
    el.src = api.runtime.getURL(path);
    el.dataset.scratchP2p = 'true';
    (document.head || document.documentElement).appendChild(el);
  }
  inject('page/sync.js');

  // ---- cached status, so the popup can ask "what's going on?" ----
  let currentStatus = { state: 'idle', roomId: null, role: null, peers: [] };

  // ---- page -> bridge -> popup ----
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || data.channel !== PAGE_TO_BRIDGE) return;
    const msg = data.msg;
    if (msg && msg.type === 'status') {
      currentStatus = msg;
      // Fire-and-forget; the popup may be closed (that's fine).
      try {
        api.runtime.sendMessage({ type: 'status', status: msg });
      } catch {
        /* no receiver */
      }
    }
  });

  // ---- popup -> bridge -> page ----
  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.cmd) return false;
    if (message.cmd === 'getStatus') {
      sendResponse(currentStatus);
      return false;
    }
    // host / join / leave: forward into the page world.
    window.postMessage({ channel: BRIDGE_TO_PAGE, msg: message }, '*');
    sendResponse({ ok: true });
    return false;
  });
})();
