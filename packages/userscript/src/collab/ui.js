/*
 * ui.js — the in-editor collaboration control panel (styled by userstyle.css).
 *
 * Pure view: it renders a status object and reports Connect/Disconnect intents
 * back through the callbacks it is created with. It knows nothing about the
 * transport or the engine.
 */
export function createUI({ onConnect, onDisconnect, defaultUrl }) {
  let root, titleEl, subEl, form, urlInput, connectBtn, leaveBtn;

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'scratch-p2p-panel';
    root.innerHTML =
      '<div class="sp2p-head">' +
      '<span class="sp2p-dot"></span>' +
      '<span class="sp2p-title">Collaboration</span>' +
      '<button class="sp2p-x" title="Hide">–</button>' +
      '</div>' +
      '<div class="sp2p-sub"></div>' +
      '<div class="sp2p-form">' +
      '<input class="sp2p-url" type="text" spellcheck="false" ' +
      'placeholder="ws://host:9070" />' +
      '<button class="sp2p-connect">Connect</button>' +
      '</div>' +
      '<button class="sp2p-leave" hidden>Disconnect</button>';
    (document.body || document.documentElement).appendChild(root);
    titleEl = root.querySelector('.sp2p-title');
    subEl = root.querySelector('.sp2p-sub');
    form = root.querySelector('.sp2p-form');
    urlInput = root.querySelector('.sp2p-url');
    connectBtn = root.querySelector('.sp2p-connect');
    leaveBtn = root.querySelector('.sp2p-leave');

    urlInput.value = localStorage.getItem('scratchP2PUrl') || defaultUrl;
    connectBtn.addEventListener('click', () => {
      const u = urlInput.value.trim() || defaultUrl;
      localStorage.setItem('scratchP2PUrl', u);
      onConnect(u);
    });
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') connectBtn.click();
    });
    leaveBtn.addEventListener('click', () => onDisconnect());
    root
      .querySelector('.sp2p-x')
      .addEventListener('click', () => root.classList.toggle('sp2p-collapsed'));
  }

  function render(s) {
    build();
    root.dataset.state = s.state;
    const labels = {
      idle: 'Not connected',
      connecting: 'Connecting…',
      hosting: 'Hosting',
      connected: 'Connected',
      error: 'Error',
    };
    titleEl.textContent = labels[s.state] || s.state;
    const active = ['hosting', 'connected', 'connecting'].includes(s.state);
    if (s.state === 'error') subEl.textContent = s.error || 'Disconnected.';
    else if (s.state === 'hosting')
      subEl.textContent = `${s.peers} online · sharing your project`;
    else if (s.state === 'connected')
      subEl.textContent = `${s.peers} online · joined`;
    else if (s.state === 'connecting') subEl.textContent = s.url;
    else subEl.textContent = 'Start the relay, then connect.';
    form.hidden = active;
    leaveBtn.hidden = !active && s.state !== 'error';
  }

  return { render };
}
