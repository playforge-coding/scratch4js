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
    root.id = 'scratch-collab-panel';
    root.innerHTML =
      '<div class="scollab-head">' +
      '<span class="scollab-dot"></span>' +
      '<span class="scollab-title">Collaboration</span>' +
      '<button class="scollab-x" title="Hide">–</button>' +
      '</div>' +
      '<div class="scollab-sub"></div>' +
      '<div class="scollab-form">' +
      '<input class="scollab-url" type="text" spellcheck="false" ' +
      'placeholder="ws://host:9070" />' +
      '<button class="scollab-connect">Connect</button>' +
      '</div>' +
      '<button class="scollab-leave" hidden>Disconnect</button>';
    (document.body || document.documentElement).appendChild(root);
    titleEl = root.querySelector('.scollab-title');
    subEl = root.querySelector('.scollab-sub');
    form = root.querySelector('.scollab-form');
    urlInput = root.querySelector('.scollab-url');
    connectBtn = root.querySelector('.scollab-connect');
    leaveBtn = root.querySelector('.scollab-leave');

    urlInput.value = localStorage.getItem('scratchCollabUrl') || defaultUrl;
    connectBtn.addEventListener('click', () => {
      const u = urlInput.value.trim() || defaultUrl;
      localStorage.setItem('scratchCollabUrl', u);
      onConnect(u);
    });
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') connectBtn.click();
    });
    leaveBtn.addEventListener('click', () => onDisconnect());
    root
      .querySelector('.scollab-x')
      .addEventListener('click', () =>
        root.classList.toggle('scollab-collapsed'),
      );
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
