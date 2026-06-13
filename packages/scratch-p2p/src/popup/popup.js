/* popup.js — talks to the content-script bridge in the active tab. */
const api = typeof browser !== 'undefined' ? browser : chrome;

const $ = (id) => document.getElementById(id);
const idleView = $('idle-view');
const activeView = $('active-view');
const dot = $('dot');
const hint = $('hint');
const errorLine = $('error-line');

async function activeTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isSupported(url) {
  return (
    !!url &&
    (/^https:\/\/scratch\.mit\.edu\/projects\//.test(url) ||
      /^https:\/\/([^/]*\.)?turbowarp\.org\//.test(url))
  );
}

async function send(cmd) {
  const tab = await activeTab();
  if (!tab || !isSupported(tab.url)) {
    render({ state: 'idle' });
    hint.textContent =
      'Open a project in the Scratch or TurboWarp editor first.';
    return null;
  }
  return new Promise((resolve) => {
    api.tabs.sendMessage(tab.id, cmd, (resp) => {
      // If the content script isn't there, lastError is set — ignore.
      void api.runtime.lastError;
      resolve(resp);
    });
  });
}

function render(status) {
  const state = (status && status.state) || 'idle';
  dot.className = 'dot ' + state;
  dot.title = state;

  errorLine.hidden = !(status && status.error);
  if (status && status.error) errorLine.textContent = status.error;

  if (state === 'hosting' || state === 'connected' || state === 'connecting') {
    idleView.hidden = true;
    activeView.hidden = false;
    hint.hidden = true;

    const role = status.role === 'host' ? 'Hosting' : 'Joined';
    $('role-line').textContent =
      state === 'connecting' ? 'Connecting…' : `${role} a live session`;
    $('room-code').value = status.roomId || '';

    const n = (status.peers && status.peers.length) || 0;
    $('peers-line').textContent =
      n === 0
        ? 'No one else here yet — share the room code.'
        : `${n} collaborator${n === 1 ? '' : 's'} connected.`;
  } else {
    idleView.hidden = false;
    activeView.hidden = true;
    hint.hidden = false;
  }
}

// ---- wire up controls ----
$('host-btn').addEventListener('click', () => send({ cmd: 'host' }));
$('join-btn').addEventListener('click', () => {
  const roomId = $('join-input').value.trim();
  if (roomId) send({ cmd: 'join', roomId });
});
$('join-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('join-btn').click();
});
$('leave-btn').addEventListener('click', () => send({ cmd: 'leave' }));
$('copy-btn').addEventListener('click', async () => {
  const code = $('room-code').value;
  if (code) {
    await navigator.clipboard.writeText(code).catch(() => {});
    $('copy-btn').textContent = 'Copied!';
    setTimeout(() => ($('copy-btn').textContent = 'Copy'), 1200);
  }
});

// ---- live updates pushed from the page ----
api.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'status') render(message.status);
});

// ---- initial state ----
send({ cmd: 'getStatus' }).then((status) => status && render(status));
