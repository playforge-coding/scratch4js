/*
 * sync.js — runs in the page's MAIN world (Scratch / TurboWarp editor).
 *
 * Responsibilities:
 *   - Open a fully peer-to-peer WebRTC connection with PeerJS (no backend; the
 *     PeerJS broker is used only for signalling, all project data flows P2P).
 *   - Trap the editor's scratch-vm + ScratchBlocks instances.
 *   - Mirror local edits to peers and apply remote edits locally.
 *
 * The VM/Blockly sync engine is adapted from LiveScratch (Waakul, MPL-2.0),
 * with its socket.io/backend transport replaced by PeerJS and a star topology
 * where the host relays. The whole .sb3 (including assets) is transferred over
 * the data channel when a peer joins, so collaboration needs no shared server.
 *
 * PeerJS is bundled in from npm by rsbuild (see rsbuild.config.mjs).
 */
import { Peer } from 'peerjs';

(() => {
  'use strict';
  if (window.__scratchP2PLoaded) return;
  window.__scratchP2PLoaded = true;

  // ============================================================== bridge ====
  const PAGE_TO_BRIDGE = 'scratch-p2p:page->bridge';
  const BRIDGE_TO_PAGE = 'scratch-p2p:bridge->page';

  function toBridge(msg) {
    window.postMessage({ channel: PAGE_TO_BRIDGE, msg }, '*');
  }

  // ========================================================== transport =====
  // PeerJS star topology: guests connect to the host; the host relays every
  // sync message to the other guests. Local edits are broadcast to all conns.

  let peer = null;
  let role = null; // 'host' | 'guest'
  let roomId = null;
  let lastError = null;
  /** @type {Object<string, import('peerjs').DataConnection>} */
  const connections = {};
  let projectReceived = false; // guests: have we loaded the host's project yet

  function genRoomId() {
    // 14 chars of base36 — long enough to avoid collisions on the public broker.
    let s = '';
    for (let i = 0; i < 14; i++)
      s += Math.floor(Math.random() * 36).toString(36);
    return s;
  }

  function state() {
    if (lastError) return 'error';
    if (role === 'host') return 'hosting';
    if (role === 'guest') return projectReceived ? 'connected' : 'connecting';
    return 'idle';
  }

  function postStatus() {
    toBridge({
      type: 'status',
      state: state(),
      role,
      roomId,
      peers: Object.keys(connections),
      error: lastError,
    });
  }

  function send(conn, envelope) {
    try {
      conn.send(envelope);
    } catch (e) {
      console.error('[scratch-p2p] send failed', e);
    }
  }

  /** Broadcast an envelope to every connection except `exceptId`. */
  function broadcast(envelope, exceptId) {
    Object.entries(connections).forEach(([id, conn]) => {
      if (id !== exceptId && conn.open) send(conn, envelope);
    });
  }

  /** Mirror a locally-produced edit to peers (host -> guests, guest -> host). */
  function sendLocal(msg) {
    if (!engineReady) return;
    if (role === 'guest' && !projectReceived) return;
    let json;
    try {
      json = JSON.stringify(msg);
    } catch (e) {
      console.error('[scratch-p2p] could not serialize message', e, msg);
      return;
    }
    broadcast({ t: 'sync', json });
  }

  async function sendProjectTo(conn) {
    try {
      const blob = await vm.saveProjectSb3();
      const buf = await blob.arrayBuffer();
      send(conn, { t: 'project', sb3: buf });
    } catch (e) {
      console.error('[scratch-p2p] failed to send project', e);
    }
  }

  function wireConnection(conn) {
    conn.on('open', () => {
      connections[conn.peer] = conn;
      lastError = null;
      // The host pushes the current project to every freshly-joined guest.
      if (role === 'host') sendProjectTo(conn);
      postStatus();
    });
    conn.on('data', (env) => onData(conn, env));
    conn.on('close', () => {
      delete connections[conn.peer];
      postStatus();
    });
    conn.on('error', (e) => {
      console.error('[scratch-p2p] connection error', e);
    });
  }

  async function onData(conn, env) {
    if (!env || !env.t) return;
    if (env.t === 'project') {
      await loadIncomingProject(env.sb3);
      return;
    }
    if (env.t === 'sync') {
      let msg;
      try {
        msg = JSON.parse(env.json);
      } catch {
        return;
      }
      await applyRemote(msg);
      // Host relays to the other guests so everyone converges.
      if (role === 'host') broadcast(env, conn.peer);
    }
  }

  async function loadIncomingProject(sb3) {
    await whenEngineReady();
    pauseEventHandling = true;
    try {
      await vm.loadProject(sb3);
      projectReceived = true;
    } catch (e) {
      console.error('[scratch-p2p] failed to load shared project', e);
    }
    pauseEventHandling = false;
    try {
      vm.emitWorkspaceUpdate();
      vm.emitTargetsUpdate();
      setTimeout(() => BL_UTILS && BL_UTILS.refreshFlyout(), 120);
    } catch {
      /* ignore */
    }
    postStatus();
  }

  function startHost() {
    teardownPeer();
    role = 'host';
    projectReceived = true; // the host already has the project
    lastError = null;
    roomId = genRoomId();
    peer = new Peer(roomId);
    peer.on('open', () => {
      postStatus();
    });
    peer.on('connection', wireConnection);
    peer.on('error', onPeerError);
    postStatus();
  }

  function startGuest(targetRoom) {
    teardownPeer();
    role = 'guest';
    projectReceived = false;
    lastError = null;
    roomId = targetRoom;
    peer = new Peer();
    peer.on('open', () => {
      const conn = peer.connect(targetRoom, { reliable: true });
      wireConnection(conn);
      postStatus();
    });
    peer.on('error', onPeerError);
    postStatus();
  }

  function onPeerError(e) {
    console.error('[scratch-p2p] peer error', e);
    const fatal = [
      'unavailable-id',
      'peer-unavailable',
      'network',
      'server-error',
      'browser-incompatible',
    ];
    if (fatal.includes(e.type)) {
      if (e.type === 'peer-unavailable')
        lastError = 'No session found for that room code.';
      else if (e.type === 'unavailable-id')
        lastError = 'Room code is taken — try hosting again.';
      else lastError = 'Connection error: ' + e.type;
      postStatus();
    }
  }

  function teardownPeer() {
    Object.values(connections).forEach((c) => {
      try {
        c.close();
      } catch {
        /* ignore */
      }
    });
    for (const k of Object.keys(connections)) delete connections[k];
    if (peer) {
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
    }
    peer = null;
    role = null;
    roomId = null;
    projectReceived = false;
  }

  function leave() {
    teardownPeer();
    lastError = null;
    postStatus();
  }

  // commands from the popup, relayed by the content-script bridge
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || data.channel !== BRIDGE_TO_PAGE) return;
    const cmd = data.msg && data.msg.cmd;
    if (cmd === 'host') startHost();
    else if (cmd === 'join') startGuest(data.msg.roomId);
    else if (cmd === 'leave') leave();
  });

  // ====================================================== engine state ======
  let vm;
  let ScratchBlocks;
  let engineReady = false;
  let pauseEventHandling = false;
  let BL_UTILS;
  let applyRemote = async () => {};

  const engineReadyWaiters = [];
  function whenEngineReady() {
    if (engineReady) return Promise.resolve();
    return new Promise((res) => engineReadyWaiters.push(res));
  }

  // ===================================================== dom utilities ======
  let queryList = [];
  let playAfterDragStop = [];

  function mutationCallback() {
    if (BL_UTILS && !BL_UTILS.isDragging() && playAfterDragStop.length > 0) {
      const queued = playAfterDragStop;
      playAfterDragStop = [];
      queued.forEach((m) => applyRemote(m));
    }
    const toDelete = [];
    queryList.forEach((q) => {
      const elem = document.querySelector(q.query);
      if (elem && !elem.__p2pSeen) {
        if (q.once) toDelete.push(q);
        else elem.__p2pSeen = true;
        q.callback(elem);
      }
    });
    toDelete.forEach((q) => queryList.splice(queryList.indexOf(q), 1));
  }
  new MutationObserver(mutationCallback).observe(document.documentElement, {
    subtree: true,
    childList: true,
  });

  function getObj(query) {
    const obj = document.querySelector(query);
    if (obj) return Promise.resolve(obj);
    return new Promise((res) =>
      queryList.push({ query, callback: res, once: true }),
    );
  }
  function listenForObj(query, callback) {
    const obj = document.querySelector(query);
    if (obj) {
      obj.__p2pSeen = true;
      callback(obj);
    }
    queryList.push({ query, callback, once: false });
  }
  function waitFor(lambda) {
    return new Promise((res) => {
      const tick = () => {
        const out = lambda();
        if (out) res(out);
        else setTimeout(tick, 100);
      };
      tick();
    });
  }

  // ========================================================= vm trap ========
  async function trap() {
    const reactElem = await getObj(
      'div[class^="stage-header_stage-menu-wrapper_"]',
    );
    const reactKey = Object.keys(reactElem).find((k) =>
      k.startsWith('__reactFiber'),
    );
    let inst = reactElem[reactKey];
    let loop = inst;
    while (loop && (!loop.memoizedProps || !loop.memoizedProps.vm))
      loop = loop.child;
    vm = loop.memoizedProps.vm;

    installEngine();

    // Trap ScratchBlocks once the blocks workspace mounts.
    listenForObj('[class^="gui_blocks-wrapper"]', (el) => {
      const k = Object.keys(el).find((kk) => kk.startsWith('__reactFiber'));
      let l = el[k];
      while (l && (!l.stateNode || !l.stateNode.ScratchBlocks)) l = l.child;
      if (!l) return;
      ScratchBlocks = l.stateNode.ScratchBlocks;
      if (!window.Blockly) window.Blockly = ScratchBlocks;
      const ws = getWorkspace();
      if (ws) {
        ws.removeChangeListener(blockListener);
        ws.addChangeListener(blockListener);
      }
    });

    engineReady = true;
    engineReadyWaiters.splice(0).forEach((r) => r());
    console.log('[scratch-p2p] editor trapped, engine ready');
  }

  // ============================================ ported sync engine ==========
  // The functions below are adapted from LiveScratch's editor.js. They are
  // hoisted (function declarations) so trap()/wireConnection can reference
  // them, but rely on `vm`, `store`, `ScratchBlocks` being set first.

  // STAGE IDENTIFIER — a string no sprite should ever be named.
  const stageName = 'jHHVSbKjDsRhSWhIlYtd...___+_0)0+-p2p';

  function targetToName(target) {
    return target?.isStage ? stageName : target?.sprite.name;
  }
  function nameToTarget(name) {
    return name === stageName
      ? vm.runtime.getTargetForStage()
      : vm.runtime.getSpriteTargetByName(name);
  }
  function isWorkspaceAccessable() {
    return !!document.querySelector('.blocklyWorkspace');
  }
  function getWorkspace() {
    let ret = window.Blockly?.getMainWorkspace?.();
    if (typeof ScratchBlocks === 'undefined' || !ScratchBlocks) return ret;
    Object.entries(ScratchBlocks.Workspace.WorkspaceDB_).forEach((wkv) => {
      if (!wkv[1].isFlyout && wkv[1].deleteAreaToolbox_) ret = wkv[1];
    });
    return ret;
  }
  function getFlyout() {
    if (typeof ScratchBlocks === 'undefined' || !ScratchBlocks) return null;
    let ret = null;
    Object.entries(ScratchBlocks.Workspace.WorkspaceDB_).forEach((wkv) => {
      if (wkv[1].isFlyout) ret = wkv[1];
    });
    return ret;
  }
  function getDraggingId() {
    return window.Blockly?.getMainWorkspace?.()
      ?.getBlockDragSurface()
      ?.getCurrentBlock()
      ?.getAttribute('data-id');
  }
  function isDragging() {
    return window.Blockly?.getMainWorkspace?.()?.isDragging();
  }
  const getSelectedCostumeIndex = () => {
    const item = document.querySelector(
      "[class*='selector_list-item'][class*='sprite-selector-item_is-selected']",
    );
    if (!item) return -1;
    const numberEl = item.querySelector(
      "[class*='sprite-selector-item_number']",
    );
    if (!numberEl) return -1;
    return +numberEl.textContent - 1;
  };
  function getPaper() {
    const paperContainer = document.querySelector(
      "[class^='paint-editor_canvas-container']",
    );
    if (!paperContainer) return null;
    const k = Object.keys(paperContainer).find((kk) =>
      kk.startsWith('__reactFiber'),
    );
    let l = paperContainer[k];
    while (l && (!l.stateNode || !l.stateNode.canvas)) l = l.child;
    return l ? l.stateNode : null;
  }
  function refreshFlyout() {
    vm.emitWorkspaceUpdate();
    if (!isWorkspaceAccessable()) return;
    getWorkspace().getToolbox().refreshSelection();
    setTimeout(() => {
      if (isWorkspaceAccessable()) getWorkspace().toolboxRefreshEnabled_ = true;
    }, 130);
  }

  // ---- briefly highlight a block another collaborator just touched ----
  function outlineBlock(blockId) {
    try {
      const block = getWorkspace()?.getBlockById(blockId);
      const svg = block?.getSvgRoot?.();
      if (!svg) return;
      const path = svg.querySelector('.blocklyPath');
      if (!path) return;
      const prev = path.style.stroke;
      path.style.stroke = '#855cd6';
      path.style.strokeWidth = '2px';
      setTimeout(() => {
        path.style.stroke = prev;
        path.style.strokeWidth = '';
      }, 600);
    } catch {
      /* ignore */
    }
  }

  // ---- echo suppression: a string fingerprint per event ----
  let livescratchEvents = {};
  function getStringEventRep(e) {
    let rep = e.type + e.blockId + e.commentId + e.varId;
    switch (e.type) {
      case 'move':
        rep +=
          parseInt(e.newCoordinate?.x) +
          '' +
          parseInt(e.newCoordinate?.y) +
          '' +
          e.newParentId +
          '';
        break;
      case 'change':
        rep += e.name + e.newValue + e.element;
        break;
      case 'var_create':
      case 'var_delete':
        rep += e.varName + e.isCloud + e.isLocal;
        break;
      case 'var_rename':
        rep += e.newName;
        break;
      case 'comment_change':
        rep += JSON.stringify(e.newContents_, (k, v) =>
          v?.toFixed ? Number(v.toFixed(0)) : v,
        );
        break;
      case 'comment_move':
        rep +=
          Math.round(e.newCoordinate_?.x) + Math.round(e.newCoordinate_?.y);
        break;
    }
    return rep.replaceAll('undefined', 'null');
  }

  // ---- the giant install: proxies + listeners + overrides ----
  let blockListener; // assigned in installEngine
  function installEngine() {
    // ---------- workspace-update suppression ----------
    let bl_workspaceUpdatingPaused = false;
    let bl_workspaceUpdateRequested = false;
    function pauseWorkspaceUpdating() {
      bl_workspaceUpdatingPaused = true;
    }
    function continueWorkspaceUpdating() {
      bl_workspaceUpdatingPaused = false;
      if (bl_workspaceUpdateRequested) vm.emitWorkspaceUpdate();
      bl_workspaceUpdateRequested = false;
    }

    // ---------- event filters ----------
    let lastDeletedBlock;
    function isBadToSend(event, target) {
      switch (event.type) {
        case 'create':
          if (event.xml.nodeName === 'SHADOW') return true;
        // falls through
        case 'delete':
          if (event.oldXml?.nodeName === 'SHADOW') return true;
        // falls through
        case 'move': {
          const block = target.blocks.getBlock(event.blockId);
          if (block?.shadow) return true;
        }
      }
      return false;
    }
    function isBadToRun(event, target) {
      switch (event.type) {
        case 'create':
          return !!target.blocks.getBlock(event.blockId);
        case 'delete':
          return !target.blocks.getBlock(event.blockId);
        case 'comment_create':
          return event.commentId in target.comments;
        case 'move': {
          if (!target.blocks.getBlock(event.blockId)) return true;
          if (!!event.newCoordinate?.x && !!event.newCoordinate?.y) {
            const lb = target.blocks.getBlock(event.blockId);
            if (
              Math.round(lb.x) === Math.round(event.newCoordinate.x) &&
              Math.round(lb.y) === Math.round(event.newCoordinate.y)
            )
              return true;
          }
          if (event.newParentId) {
            const lb = target.blocks.getBlock(event.blockId);
            if (lb.parent === event.newParentId) return true;
          }
        }
      }
      return false;
    }
    function isBadToRunBlockly(event, workspace) {
      switch (event.type) {
        case 'create':
          return !!workspace.getBlockById(event.blockId);
      }
    }

    // ---------- local blockly events -> peers ----------
    const createEventMap = {};
    const toBeMoved = {};
    blockListener = function (e) {
      if (pauseEventHandling) return;
      const stringRep = getStringEventRep(e);
      if (stringRep in livescratchEvents) {
        delete livescratchEvents[stringRep];
        return;
      }
      if (
        e.isLivescratch ||
        ['endDrag', 'ui', 'dragOutside'].indexOf(e.type) !== -1 ||
        isBadToSend(e, vm.editingTarget) ||
        e.element === 'stackclick'
      )
        return;

      const extrargs = {};
      if (e.type === 'move') {
        const block = vm.editingTarget.blocks.getBlock(e.blockId);
        if (block && (block.fields.VARIABLE || block.fields.LIST)) {
          extrargs.blockVarId = block.fields.VARIABLE
            ? block.fields.VARIABLE.id
            : block.fields.LIST.id;
        }
      } else if (
        e.type === 'change' &&
        (e.name === 'VARIABLE' || e.name === 'LIST')
      ) {
        const block = vm.editingTarget.blocks.getBlock(e.blockId);
        if (
          block &&
          (block.opcode === 'data_variable' ||
            block.opcode === 'data_listcontents')
        ) {
          extrargs.blockVarId = e.oldValue;
          extrargs.blockVarParent = block.parent;
          extrargs.blockVarPos = { x: block.x, y: block.y };
          extrargs.blockVarInput = Object.values(
            new Object(vm.editingTarget.blocks.getBlock(block.parent)?.inputs),
          )?.find((input) => input.block === e.blockId)?.name;
        }
      } else if (
        e.type === 'delete' &&
        (e.oldXml?.firstElementChild?.getAttribute('name') === 'VARIABLE' ||
          e.oldXml?.firstElementChild?.getAttribute('name') === 'LIST')
      ) {
        const block = vm.editingTarget.blocks._blocks[e.blockId]
          ? vm.editingTarget.blocks._blocks[e.blockId]
          : lastDeletedBlock;
        extrargs.blockVarId = block.fields.VARIABLE
          ? block.fields.VARIABLE.id
          : block.fields.LIST.id;
        extrargs.blockVarParent = block.parent;
        extrargs.blockVarPos = { x: block.x, y: block.y };
        extrargs.blockVarInput = Object.values(
          new Object(vm.editingTarget.blocks.getBlock(block.parent)?.inputs),
        )?.find((input) => input.block === e.blockId)?.name;
      }

      if (e.element === 'field') {
        if (vm.editingTarget.blocks.getBlock(e.blockId).shadow) {
          const fieldInputId = e.blockId;
          const fieldInput = vm.editingTarget.blocks.getBlock(fieldInputId);
          const parentId = fieldInput.parent;
          if (parentId) {
            const parentBlock = vm.editingTarget.blocks.getBlock(parentId);
            const inputTag = Object.values(new Object(parentBlock.inputs)).find(
              (input) => input.shadow === fieldInputId,
            ).name;
            extrargs.parentId = parentId;
            extrargs.fieldTag = inputTag;
          }
        }
      }

      if (e.type === 'change' && e.name === 'BROADCAST_OPTION') {
        extrargs.broadcastName =
          vm.runtime.getTargetForStage().variables[e.newValue]?.name;
        extrargs.broadcastId =
          vm.runtime.getTargetForStage().variables[e.newValue]?.id;
      }

      if (e.xml) {
        extrargs.xml = { outerHTML: e.xml.outerHTML };
        extrargs.isCBCreateOrDelete =
          e.xml?.getAttribute('type') === 'procedures_definition';
      }
      if (e.oldXml) {
        extrargs.isCBCreateOrDelete =
          extrargs.isCBCreateOrDelete ||
          e.oldXml?.getAttribute('type') === 'procedures_definition';
      }

      let message = {
        meta: 'vm.blockListen',
        type: e.type,
        extrargs,
        event: e,
        json: e.toJson(),
        target: targetToName(vm.editingTarget),
      };

      if (e.type === 'create') {
        createEventMap[e.blockId] = message;
      } else if (e.type === 'move' && e.blockId in toBeMoved) {
        const moveEvents = toBeMoved[e.blockId];
        delete toBeMoved[e.blockId];
        moveEvents.forEach((moveMessage) => onBlockRecieve(moveMessage));
      } else {
        if (e.blockId in createEventMap) {
          if (e.type === 'delete') message = null;
          else sendLocal(createEventMap[e.blockId]);
          delete createEventMap[e.blockId];
        }
        if (e.commentId in createEventMap) {
          if (e.type === 'comment_delete') message = null;
          else sendLocal(createEventMap[e.commentId]);
          delete createEventMap[e.commentId];
        }
        if (message) sendLocal(message);
      }
    };

    const getDistance = (p1, p2) =>
      Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

    // ---------- peers' blockly events -> local ----------
    function onBlockRecieve(d) {
      if (d.type === 'comment_change') d.json.newValue = d.json.newContents;

      const oldEditingTarget = vm.editingTarget;
      vm.editingTarget = nameToTarget(d.target);
      vm.runtime._editingTarget = vm.editingTarget;
      pauseWorkspaceUpdating();

      try {
        const vEvent = d.event;
        let bEvent = {};
        if (isWorkspaceAccessable())
          bEvent = ScratchBlocks.Events.fromJson(d.json, getWorkspace());
        bEvent.isLivescratch = true;
        vEvent.type = d.type;

        if (
          d.extrargs.blockVarId &&
          !(d.event.blockId in toBeMoved) &&
          !vm.editingTarget.blocks.getBlock(d.event.blockId)
        ) {
          if (d.event.oldParentId || d.extrargs.blockVarParent) {
            const oldParentId =
              d.extrargs.blockVarParent || d.event.oldParentId;
            const realId =
              vm.editingTarget.blocks.getBlock(oldParentId).inputs[
                d.extrargs.blockVarInput || d.event.oldInputName
              ].block;
            vEvent.blockId = realId;
            bEvent.blockId = realId;
            if (d.type === 'delete') {
              bEvent.ids = [realId];
              vEvent.ids = [realId];
            }
          } else if (d.event.oldCoordinate || d.extrargs.blockVarPos) {
            const oldCoordinate =
              d.extrargs.blockVarPos || d.event.oldCoordinate;
            const varBlocks = vm.editingTarget.blocks._scripts.filter(
              (blockId) => {
                const block = vm.editingTarget.blocks.getBlock(blockId);
                return (
                  block?.fields?.VARIABLE?.id === d.extrargs.blockVarId ||
                  block?.fields?.LIST?.id === d.extrargs.blockVarId
                );
              },
            );
            let closestBlock;
            let closestDistance = -1;
            varBlocks.forEach((blockId) => {
              const block = vm.editingTarget.blocks.getBlock(blockId);
              if (!block.parent) {
                const distance = getDistance(
                  { x: block.x, y: block.y },
                  oldCoordinate,
                );
                if (!closestBlock || distance < closestDistance) {
                  closestBlock = block;
                  closestDistance = distance;
                }
              }
            });
            if (closestBlock) {
              vEvent.blockId = closestBlock.id;
              bEvent.blockId = closestBlock.id;
              if (d.type === 'delete') {
                bEvent.ids = [closestBlock.id];
                vEvent.ids = [closestBlock.id];
              }
            }
          }
        }

        if (d.extrargs.fieldTag) {
          const realId = vm.editingTarget.blocks.getBlock(d.extrargs.parentId)
            .inputs[d.extrargs.fieldTag].shadow;
          vEvent.blockId = realId;
          bEvent.blockId = realId;
        }

        if (
          d.extrargs.broadcastName &&
          !vm.runtime.getTargetForStage().variables[d.json.newValue]
        ) {
          const createVmEvent = {
            isCloud: false,
            isLocal: false,
            type: 'var_create',
            varId: d.extrargs.broadcastId,
            varName: d.extrargs.broadcastName,
            varType: 'broadcast_msg',
          };
          vm.blockListener(createVmEvent);
          if (isWorkspaceAccessable()) {
            const createBlEvent = ScratchBlocks.Events.fromJson(
              createVmEvent,
              getWorkspace(),
            );
            livescratchEvents[getStringEventRep(createBlEvent)] = true;
            createBlEvent.run(true);
          }
        }

        if (d.extrargs.xml) vEvent.xml = d.extrargs.xml;
        if (d.type === 'comment_create') bEvent.xy = d.event.xy;

        if (
          ((targetToName(oldEditingTarget) === d.target &&
            !pauseEventHandling) ||
            (['var_create', 'var_delete'].indexOf(d.type) !== -1 &&
              !d.json.isLocal)) &&
          isWorkspaceAccessable()
        ) {
          if (
            (bEvent.type === 'move' || bEvent.type === 'delete') &&
            bEvent.blockId in toBeMoved
          ) {
            toBeMoved[bEvent.blockId].push(d);
          } else if (
            !isBadToRunBlockly(bEvent, getWorkspace()) &&
            !isBadToRun(bEvent, vm.editingTarget)
          ) {
            if (bEvent.type === 'create' && !d.extrargs.isCBCreateOrDelete)
              toBeMoved[bEvent.blockId] = [];
            livescratchEvents[getStringEventRep(bEvent)] = true;

            if (bEvent.type === 'move') {
              const blockElement = getWorkspace()
                ?.getBlockById(bEvent.blockId)
                ?.getSvgRoot();
              if (blockElement)
                blockElement.style.transition = 'transform 0.5s';
            }

            bEvent.run(true);

            if (bEvent.element === 'mutation' || d.extrargs.isCBCreateOrDelete)
              getWorkspace().getToolbox().refreshSelection();

            if (['create', 'move', 'change'].indexOf(bEvent.type) !== -1) {
              try {
                outlineBlock(bEvent.blockId);
              } catch {
                /* ignore */
              }
            }
          }
        } else if (!isBadToRun(vEvent, vm.editingTarget)) {
          vm.editingTarget.blocks.blocklyListen(vEvent);
        }
      } catch (e) {
        console.error('[scratch-p2p] error applying block event', e);
      }

      if (oldEditingTarget && vm.runtime.getTargetById(oldEditingTarget.id)) {
        vm.editingTarget = oldEditingTarget;
        vm.runtime._editingTarget = oldEditingTarget;
      }
      continueWorkspaceUpdating();
    }

    // ---------- emit overrides ----------
    let etuListeners = [];
    const oldTargUp = vm.emitTargetsUpdate.bind(vm);
    vm.emitTargetsUpdate = function (...args) {
      etuListeners.forEach((f) => {
        try {
          f?.();
        } catch (e) {
          console.error(e);
        }
      });
      etuListeners = [];
      if (pauseEventHandling) return;
      oldTargUp(...args);
    };

    const oldEWU = vm.emitWorkspaceUpdate.bind(vm);
    vm.emitWorkspaceUpdate = function () {
      if (pauseEventHandling) return;
      if (bl_workspaceUpdatingPaused) {
        bl_workspaceUpdateRequested = true;
        return;
      }
      if (!isWorkspaceAccessable()) return;
      getWorkspace()
        ?.getTopComments()
        .forEach((comment) => {
          livescratchEvents[
            getStringEventRep({ type: 'comment_delete', commentId: comment.id })
          ] = true;
        });
      Object.keys(vm.editingTarget.comments).forEach((commentId) => {
        livescratchEvents[
          getStringEventRep({ type: 'comment_create', commentId })
        ] = true;
      });
      getWorkspace()?.topBlocks_.forEach((block) => {
        livescratchEvents[
          getStringEventRep({ type: 'delete', blockId: block.id })
        ] = true;
      });
      Object.keys(vm.editingTarget.blocks._blocks).forEach((blockId) => {
        livescratchEvents[getStringEventRep({ type: 'create', blockId })] =
          true;
        const block = vm.editingTarget.blocks._blocks[blockId];
        if (!block.parent) {
          livescratchEvents[
            getStringEventRep({
              type: 'move',
              blockId,
              newCoordinate: { x: block.x, y: block.y },
              newParentId: block.parent,
            })
          ] = true;
        }
      });
      Object.entries(vm.editingTarget.variables).forEach((varr) => {
        livescratchEvents[
          getStringEventRep({
            type: 'var_delete',
            varId: varr[0],
            isCloud: varr[1].isCloud,
            varName: varr[1].name,
            isLocal: false,
          })
        ] = true;
        livescratchEvents[
          getStringEventRep({
            type: 'var_create',
            varId: varr[0],
            isCloud: varr[1].isCloud,
            varName: varr[1].name,
            isLocal: true,
          })
        ] = true;
      });
      Object.entries(vm.runtime.getTargetForStage().variables).forEach(
        (varr) => {
          livescratchEvents[
            getStringEventRep({
              type: 'var_create',
              varId: varr[0],
              isCloud: varr[1].isCloud,
              varName: varr[1].name,
              isLocal: false,
            })
          ] = true;
        },
      );
      oldEWU();
    };

    // ---------- proxy machinery ----------
    const proxyActions = {};
    let prevTarg = null;
    function anyproxy(
      bindTo,
      action,
      name,
      extrargs,
      mutator,
      before,
      then,
      dontSend,
      dontDo,
      senderThen,
    ) {
      const proxiedFunction = function (...args) {
        if (args[0] === 'linguini') {
          args.splice(0, 1);
          const data = args.splice(0, 1)[0];
          if (mutator) args = mutator(data);
          const prevTarget = vm.editingTarget;
          if (before) before(data);
          if (dontDo?.(data)) return;
          let retVal;
          try {
            retVal = action.bind(bindTo)(...args);
          } catch (e) {
            console.error('[scratch-p2p] error on proxy run', e);
          }
          if (then) {
            if (retVal?.then)
              retVal.then((res) =>
                then(prevTarget, vm.editingTarget, data, res),
              );
            else then(prevTarget, vm.editingTarget, data, retVal);
          }
          return retVal;
        }
        if (pauseEventHandling) return action.bind(bindTo)(...args);
        let extrargsObj = null;
        if (extrargs) extrargsObj = extrargs(args);
        const retVal = action.bind(bindTo)(...args);
        if (!dontSend?.(...args))
          sendLocal({
            meta: 'sprite.proxy',
            data: { name, args, extrargs: extrargsObj },
          });
        if (senderThen) {
          if (retVal?.then) retVal.then(senderThen);
          else senderThen();
        }
        return retVal;
      };
      proxyActions[name] = proxiedFunction;
      return proxiedFunction;
    }
    function asyncAnyproxy(
      bindTo,
      action,
      name,
      extrargs,
      mutator,
      before,
      then,
      dontSend,
      dontDo,
      senderThen,
    ) {
      const proxiedFunction = async function (...args) {
        if (args[0] === 'linguini') {
          args.splice(0, 1);
          const data = args.splice(0, 1)[0];
          if (mutator) args = await mutator(data);
          const prevTarget = vm.editingTarget;
          if (before) before(data);
          if (dontDo?.(data)) return;
          let retVal;
          try {
            retVal = action.bind(bindTo)(...args);
          } catch (e) {
            console.error('[scratch-p2p] error on proxy run', e);
          }
          if (then) {
            if (retVal?.then)
              retVal.then((res) =>
                then(prevTarget, vm.editingTarget, data, res),
              );
            else then(prevTarget, vm.editingTarget, data, retVal);
          }
          return retVal;
        }
        if (pauseEventHandling) return action.bind(bindTo)(...args);
        let extrargsObj = null;
        if (extrargs) extrargsObj = extrargs(args);
        const retVal = action.bind(bindTo)(...args);
        if (!dontSend?.(...args))
          sendLocal({
            meta: 'sprite.proxy',
            data: { name, args, extrargs: extrargsObj },
          });
        if (senderThen) {
          if (retVal?.then) retVal.then(senderThen);
          else senderThen();
        }
        return retVal;
      };
      proxyActions[name] = proxiedFunction;
      return proxiedFunction;
    }
    const proxy = (
      action,
      name,
      extrargs,
      mutator,
      before,
      then,
      dontSend,
      dontDo,
      senderThen,
    ) =>
      anyproxy(
        vm,
        action,
        name,
        extrargs,
        mutator,
        before,
        then,
        dontSend,
        dontDo,
        senderThen,
      );
    function editingProxy(action, name, before, after, extrargs, mutator) {
      return proxy(
        action,
        name,
        (a) => ({
          target: targetToName(vm.editingTarget),
          ...(extrargs ? extrargs(a) : null),
        }),
        mutator,
        (data) => {
          if (before) before(data);
          prevTarg = vm.editingTarget;
          vm.editingTarget = nameToTarget(data.extrargs.target);
          vm.runtime._editingTarget = vm.editingTarget;
        },
        (_a, _b, data) => {
          if (prevTarg && vm.runtime.getTargetById(prevTarg.id)) {
            vm.editingTarget = prevTarg;
            vm.runtime._editingTarget = prevTarg;
          }
          vm.emitTargetsUpdate();
          if (after) after(_a, _b, data);
        },
      );
    }
    function asyncEditingProxy(action, name, before, after, extrargs, mutator) {
      return asyncAnyproxy(
        vm,
        action,
        name,
        (a) => ({
          target: targetToName(vm.editingTarget),
          ...(extrargs ? extrargs(a) : null),
        }),
        mutator,
        (data) => {
          if (before) before(data);
          prevTarg = vm.editingTarget;
          vm.editingTarget = nameToTarget(data.extrargs.target);
          vm.runtime._editingTarget = vm.editingTarget;
        },
        (_a, _b, data) => {
          if (prevTarg && vm.runtime.getTargetById(prevTarg.id)) {
            vm.editingTarget = prevTarg;
            vm.runtime._editingTarget = prevTarg;
          }
          vm.emitTargetsUpdate();
          if (after) after(_a, _b, data);
        },
      );
    }

    function replaceBlockly(msg) {
      const target = nameToTarget(msg.target);
      const blocks = target.blocks;
      Object.keys(blocks._blocks).forEach((v) => blocks.deleteBlock(v));
      Object.values(msg.blocks).forEach((block) => blocks.createBlock(block));
      if (targetToName(vm.editingTarget) === targetToName(target))
        vm.emitWorkspaceUpdate();
    }

    // ---------- deferred events for not-yet-existing targets ----------
    const newTargetEvents = {};
    function addNewTargetEvent(targetName, event) {
      if (!(targetName in newTargetEvents)) newTargetEvents[targetName] = [];
      newTargetEvents[targetName].push(event);
    }

    // ---------- sounds ----------
    vm.updateSoundBuffer = asyncEditingProxy(
      vm.updateSoundBuffer,
      'updatesound',
      null,
      null,
      () => ({}),
      async (data) => {
        const retArgs = data.args;
        retArgs[2] = Uint8Array.from(Object.values(retArgs[2]));
        retArgs[1] = await new AudioContext({
          sampleRate: retArgs[1].sampleRate,
        }).decodeAudioData(retArgs[2].buffer.slice(0));
        return retArgs;
      },
    );
    vm.addSound = proxy(
      vm.addSound,
      'addsound',
      (args) => ({
        target: args[1]
          ? targetToName(vm.runtime.getTargetById(args[1]))
          : targetToName(vm.editingTarget),
      }),
      (data) => {
        const ret = [data.args[0], nameToTarget(data.extrargs.target)?.id];
        if (ret[0]?.asset?.data) {
          ret[0].asset = vm.runtime.storage.createAsset(
            ret[0].asset.assetType,
            ret[0].asset.dataFormat,
            Uint8Array.from(Object.values(ret[0].asset.data)),
            null,
            true,
          );
          ret[0] = {
            name: ret[0].name,
            dataFormat: ret[0].asset.dataFormat,
            asset: ret[0].asset,
            md5: `${ret[0].asset.assetId}.${ret[0].asset.dataFormat}`,
            assetId: ret[0].asset.assetId,
          };
        }
        return ret;
      },
    );
    vm.duplicateSound = editingProxy(vm.duplicateSound, 'duplicatesound');
    vm.deleteSound = editingProxy(vm.deleteSound, 'deletesound');
    vm.renameSound = editingProxy(vm.renameSound, 'renamesound');
    vm.shareSoundToTarget = editingProxy(vm.shareSoundToTarget, 'sharesound');
    vm.reorderSound = proxy(
      vm.reorderSound,
      'reordersound',
      (args) => ({ target: targetToName(vm.runtime.getTargetById(args[0])) }),
      (data) => [
        nameToTarget(data.extrargs.target).id,
        data.args[1],
        data.args[2],
      ],
      null,
    );

    // ---------- costumes ----------
    vm.renameCostume = editingProxy(vm.renameCostume, 'renamecostume');
    vm.duplicateCostume = editingProxy(vm.duplicateCostume, 'dupecostume');
    vm.deleteCostume = editingProxy(vm.deleteCostume, 'deletecostume');
    vm.reorderCostume = proxy(
      vm.reorderCostume,
      'reordercostume',
      (args) => ({ target: targetToName(vm.runtime.getTargetById(args[0])) }),
      (data) => [
        nameToTarget(data.extrargs.target).id,
        data.args[1],
        data.args[2],
      ],
      null,
      () => {
        vm.emitTargetsUpdate();
      },
    );
    vm.shareCostumeToTarget = editingProxy(
      vm.shareCostumeToTarget,
      'sharecostume',
      null,
      null,
      (args) => ({
        targettarget: targetToName(vm.runtime.getTargetById(args[1])),
      }),
      (data) => [data.args[0], nameToTarget(data.extrargs.targettarget)?.id],
    );
    vm.addCostume = proxy(
      vm.addCostume,
      'addcostume',
      (args) => ({
        target: args[2]
          ? targetToName(vm.runtime.getTargetById(args[2]))
          : targetToName(vm.editingTarget),
      }),
      (data) => {
        const ret = [
          data.args[0],
          data.args[1],
          nameToTarget(data.extrargs.target)?.id,
          data.args[3],
        ];
        if (ret[1]?.asset?.data) {
          ret[1].asset = vm.runtime.storage.createAsset(
            ret[1].asset.assetType,
            ret[1].asset.dataFormat,
            Uint8Array.from(Object.values(ret[1].asset.data)),
            null,
            true,
          );
          ret[1] = {
            name: null,
            dataFormat: ret[1].asset.dataFormat,
            asset: ret[1].asset,
            md5: `${ret[1].asset.assetId}.${ret[1].asset.dataFormat}`,
            assetId: ret[1].asset.assetId,
          };
        }
        return ret;
      },
    );
    vm.addBackdrop = proxy(vm.addBackdrop, 'addbackdrop', null, (data) => {
      const ret = [data.args[0], data.args[1]];
      if (ret[1]?.asset?.data) {
        ret[1].asset = vm.runtime.storage.createAsset(
          ret[1].asset.assetType,
          ret[1].asset.dataFormat,
          Uint8Array.from(Object.values(ret[1].asset.data)),
          null,
          true,
        );
        ret[1] = {
          name: null,
          dataFormat: ret[1].asset.dataFormat,
          asset: ret[1].asset,
          md5: `${ret[1].asset.assetId}.${ret[1].asset.dataFormat}`,
          assetId: ret[1].asset.assetId,
        };
      }
      return ret;
    });

    // ---------- costume bitmap/svg paint edits (bytes sent P2P) ----------
    const oldUpdateBitmap = vm.updateBitmap;
    vm.updateBitmap = (...args) => {
      oldUpdateBitmap.bind(vm)(...args);
      etuListeners.push(async () => {
        const target = targetToName(vm.editingTarget);
        const costumeIndex = args[0];
        const bitmapResolution = args[4];
        const costume = vm.editingTarget.getCostumes()[costumeIndex];
        const sendCostume = JSON.parse(JSON.stringify(costume));
        delete sendCostume.asset;
        const asset = costume.asset;
        sendLocal({
          meta: 'vm.updateBitmap',
          costume: sendCostume,
          target,
          costumeIndex,
          assetType: asset.assetType,
          dataArray: Array.from(asset.data),
          bitmapResolution,
        });
      });
    };
    const oldUpdateSvg = vm.updateSvg;
    vm.updateSvg = (...args) => {
      oldUpdateSvg.bind(vm)(...args);
      (async () => {
        const target = targetToName(vm.editingTarget);
        const costumeIndex = args[0];
        const costume = vm.editingTarget.getCostumes()[costumeIndex];
        const sendCostume = JSON.parse(JSON.stringify(costume));
        delete sendCostume.asset;
        const asset = costume.asset;
        sendLocal({
          meta: 'vm.updateSvg',
          costume: sendCostume,
          target,
          costumeIndex,
          assetType: asset.assetType,
          dataArray: Array.from(asset.data),
        });
      })();
    };

    async function applyAssetUpdate(msg, isSvg) {
      const target = nameToTarget(msg.target);
      const costume = target.getCostumes()[msg.costumeIndex];
      const data = Uint8Array.from(msg.dataArray);
      const asset = vm.runtime.storage.createAsset(
        msg.assetType,
        msg.costume.dataFormat,
        data,
        msg.costume.assetId,
        false,
      );
      costume.asset = asset;
      Object.entries(msg.costume).forEach((entry) => {
        if (isSvg && entry[0] === 'skinId') return;
        costume[entry[0]] = entry[1];
      });
      vm.emitTargetsUpdate();

      if (isSvg && vm?.runtime?.renderer) {
        const svg = new TextDecoder().decode(asset.data);
        vm.runtime.renderer.updateSVGSkin(costume.skinId, svg, [
          costume.rotationCenterX,
          costume.rotationCenterY,
        ]);
      } else if (!isSvg) {
        try {
          await BL_load_costume.loadCostume(costume.md5, costume, vm.runtime);
        } catch {
          /* ignore */
        }
      }

      const selectedCostumeIndex = getSelectedCostumeIndex();
      if (
        targetToName(vm.editingTarget) === msg.target &&
        selectedCostumeIndex !== -1 &&
        msg.costumeIndex === selectedCostumeIndex
      ) {
        const paper = getPaper();
        if (paper)
          paper.switchCostume(
            costume.dataFormat,
            costume.asset.encodeDataURI(),
            costume.rotationCenterX,
            costume.rotationCenterY,
            paper.props.zoomLevelId,
            paper.props.zoomLevelId,
          );
      }
      target.updateAllDrawableProperties();
    }

    // ---------- sprites ----------
    vm.addSprite = proxy(
      vm.addSprite,
      'addsprite',
      (args) =>
        args[0] instanceof ArrayBuffer
          ? { spritearray: Array.from(new Uint8Array(args[0])) }
          : {},
      (data) =>
        data.extrargs.spritearray
          ? [Uint8Array.from(data.extrargs.spritearray).buffer]
          : [...data.args],
      null,
      (a) => {
        vm.setEditingTarget(a.id);
      },
    );
    vm.duplicateSprite = proxy(
      vm.duplicateSprite,
      'duplicatesprite',
      (args) => ({ name: targetToName(vm.runtime.getTargetById(args[0])) }),
      (data) => [nameToTarget(data.extrargs.name)?.id],
      () => {
        pauseEventHandling = true;
      },
      (a, b) => {
        vm.setEditingTarget(a.id);
        pauseEventHandling = false;
        newTargetEvents[b.sprite.name]?.forEach((event) => applyRemote(event));
      },
      null,
      null,
      () => {
        sendLocal({
          meta: 'vm.replaceBlocks',
          target: targetToName(vm.editingTarget),
          blocks: vm.editingTarget.blocks._blocks,
        });
      },
    );
    vm.deleteSprite = proxy(
      vm.deleteSprite,
      'deletesprite',
      (args) => ({ name: targetToName(vm.runtime.getTargetById(args[0])) }),
      (data) => [nameToTarget(data.extrargs.name).id],
    );
    vm.renameSprite = proxy(
      vm.renameSprite,
      'renamesprite',
      (args) => ({ oldName: targetToName(vm.runtime.getTargetById(args[0])) }),
      (data) => [nameToTarget(data.extrargs.oldName).id, data.args[1]],
    );
    vm.reorderTarget = proxy(vm.reorderTarget, 'reordertarget');

    // ---------- block sharing (drag a script onto another sprite) ----------
    let shareCreates = [];
    let isTargetSharing = false;
    waitFor(() => vm.editingTarget).then(() => {
      const proto = vm.editingTarget.blocks.__proto__;
      const oldCreateBlock = proto.createBlock;
      proto.createBlock = function (...a) {
        if (isTargetSharing) shareCreates.push(a);
        return oldCreateBlock.call(this, ...a);
      };
      const oldDeleteBlock = proto.deleteBlock;
      proto.deleteBlock = function (...a) {
        lastDeletedBlock = this._blocks[a[0]];
        return oldDeleteBlock.call(this, ...a);
      };
    });
    waitFor(() => vm.extensionManager).then(() => {
      vm.extensionManager.loadExtensionURL = asyncAnyproxy(
        vm.extensionManager,
        vm.extensionManager.loadExtensionURL,
        'loadextensionurl',
      );
    });
    const oldShareBlocksToTarget = vm.shareBlocksToTarget;
    vm.shareBlocksToTarget = function (blocks, targetId, optFromTargetId) {
      shareCreates = [];
      isTargetSharing = true;
      return oldShareBlocksToTarget
        .bind(vm)(blocks, targetId, optFromTargetId)
        .then(() => {
          isTargetSharing = false;
          sendLocal({
            meta: 'vm.shareBlocks',
            target: targetToName(vm.runtime.getTargetById(targetId)),
            from: targetToName(vm.runtime.getTargetById(optFromTargetId)),
            blocks: shareCreates,
          });
        });
    };
    function doShareBlocksMessage(msg) {
      const target = nameToTarget(msg.target);
      const targetId = target.id;
      msg.blocks.forEach((bargs) => target.blocks.createBlock(...bargs));
      target.blocks.updateTargetSpecificBlocks(target.isStage);
      if (targetId === vm.editingTarget.id) vm.emitWorkspaceUpdate();
      if (!isWorkspaceAccessable()) return;
      getWorkspace().getToolbox().refreshSelection();
    }

    // ---------- BL_load_costume (from scratch-vm import/load-costume) ----------
    installLoadCostume();

    // ---------- expose helpers ----------
    BL_UTILS = {
      isWorkspaceAccessable,
      getWorkspace,
      getFlyout,
      getDraggingId,
      isDragging,
      targetToName,
      nameToTarget,
      getSelectedCostumeIndex,
      refreshFlyout,
      stageName,
    };

    // ---------- the remote-message dispatcher ----------
    applyRemote = async (msg) => {
      if (BL_UTILS && BL_UTILS.isDragging()) {
        if (
          msg.meta === 'vm.blockListen' &&
          msg.type === 'move' &&
          msg.event.blockId === getDraggingId()
        )
          return;
        playAfterDragStop.push(msg);
        return;
      }
      try {
        if (msg.meta === 'sprite.proxy') {
          await proxyActions[msg.data.name](
            ...['linguini'].concat(msg.data).concat(msg.data.args),
          );
        } else if (msg.meta === 'vm.blockListen') {
          onBlockRecieve(msg);
        } else if (msg.meta === 'vm.shareBlocks') {
          doShareBlocksMessage(msg);
        } else if (msg.meta === 'vm.replaceBlocks') {
          if (!nameToTarget(msg.target)?.blocks)
            addNewTargetEvent(msg.target, msg);
          else replaceBlockly(msg);
        } else if (msg.meta === 'vm.updateBitmap') {
          await applyAssetUpdate(msg, false);
        } else if (msg.meta === 'vm.updateSvg') {
          await applyAssetUpdate(msg, true);
        }
      } catch (e) {
        console.error('[scratch-p2p] error handling remote message', e);
      }
    };

    // ===== load-costume port (renderer needs this for bitmap paint sync) =====
    function installLoadCostume() {
      const canvasPool = (function () {
        class CanvasPool {
          constructor() {
            this.pool = [];
            this.clearSoon = null;
          }
          clear() {
            if (!this.clearSoon)
              this.clearSoon = new Promise((resolve) =>
                setTimeout(resolve, 1000),
              ).then(() => {
                this.pool.length = 0;
                this.clearSoon = null;
              });
          }
          create() {
            return this.pool.pop() || document.createElement('canvas');
          }
          release(canvas) {
            this.clear();
            this.pool.push(canvas);
          }
        }
        return new CanvasPool();
      })();

      const fetchBitmapCanvas_ = function (costume, runtime, rotationCenter) {
        if (!costume || !costume.asset)
          return Promise.reject('Costume load failed. Assets were missing.');
        if (!runtime.v2BitmapAdapter)
          return Promise.reject('No V2 Bitmap adapter present.');
        return Promise.all(
          [costume.asset, costume.textLayerAsset].map((asset) => {
            if (!asset) return null;
            if (typeof createImageBitmap !== 'undefined')
              return createImageBitmap(
                new Blob([asset.data], { type: asset.assetType.contentType }),
              );
            return new Promise((resolve, reject) => {
              const image = new Image();
              image.onload = function () {
                resolve(image);
                image.onload = null;
                image.onerror = null;
              };
              image.onerror = function () {
                reject('Costume load failed. Asset could not be read.');
                image.onload = null;
                image.onerror = null;
              };
              image.src = asset.encodeDataURI();
            });
          }),
        )
          .then(([baseImageElement, textImageElement]) => {
            const mergeCanvas = canvasPool.create();
            const scale = costume.bitmapResolution === 1 ? 2 : 1;
            mergeCanvas.width = baseImageElement.width;
            mergeCanvas.height = baseImageElement.height;
            const ctx = mergeCanvas.getContext('2d');
            ctx.drawImage(baseImageElement, 0, 0);
            if (textImageElement) ctx.drawImage(textImageElement, 0, 0);
            let canvas = mergeCanvas;
            if (scale !== 1)
              canvas = runtime.v2BitmapAdapter.resize(
                mergeCanvas,
                canvas.width * scale,
                canvas.height * scale,
              );
            if (rotationCenter) {
              rotationCenter[0] = rotationCenter[0] * scale;
              rotationCenter[1] = rotationCenter[1] * scale;
              costume.rotationCenterX = rotationCenter[0];
              costume.rotationCenterY = rotationCenter[1];
            }
            costume.bitmapResolution = 2;
            delete costume.textLayerMD5;
            delete costume.textLayerAsset;
            return {
              canvas,
              mergeCanvas,
              rotationCenter,
              assetMatchesBase: scale === 1 && !textImageElement,
            };
          })
          .finally(() => {
            delete costume.textLayerMD5;
            delete costume.textLayerAsset;
          });
      };

      const loadBitmap_ = function (costume, runtime, _rotationCenter) {
        return fetchBitmapCanvas_(costume, runtime, _rotationCenter)
          .then((fetched) => {
            const updateCostumeAsset = function (dataURI) {
              if (!runtime.v2BitmapAdapter)
                return Promise.reject('No V2 Bitmap adapter present.');
              const storage = runtime.storage;
              costume.asset = storage.createAsset(
                storage.AssetType.ImageBitmap,
                storage.DataFormat.PNG,
                runtime.v2BitmapAdapter.convertDataURIToBinary(dataURI),
                null,
                true,
              );
              costume.dataFormat = storage.DataFormat.PNG;
              costume.assetId = costume.asset.assetId;
              costume.md5 = `${costume.assetId}.${costume.dataFormat}`;
            };
            if (!fetched.assetMatchesBase)
              updateCostumeAsset(fetched.canvas.toDataURL());
            return fetched;
          })
          .then(({ canvas, mergeCanvas, rotationCenter }) => {
            let center;
            if (rotationCenter)
              center = [rotationCenter[0] / 2, rotationCenter[1] / 2];
            costume.skinId = runtime.renderer.createBitmapSkin(
              canvas,
              costume.bitmapResolution,
              center,
            );
            canvasPool.release(mergeCanvas);
            const renderSize = runtime.renderer.getSkinSize(costume.skinId);
            costume.size = [renderSize[0] * 2, renderSize[1] * 2];
            if (!rotationCenter) {
              rotationCenter = runtime.renderer.getSkinRotationCenter(
                costume.skinId,
              );
              costume.rotationCenterX = rotationCenter[0] * 2;
              costume.rotationCenterY = rotationCenter[1] * 2;
              costume.bitmapResolution = 2;
            }
            return costume;
          });
      };

      const loadCostumeFromAsset = function (costume, runtime) {
        costume.assetId = costume.asset.assetId;
        if (!runtime.renderer) return Promise.resolve(costume);
        let rotationCenter;
        if (
          typeof costume.rotationCenterX === 'number' &&
          !isNaN(costume.rotationCenterX) &&
          typeof costume.rotationCenterY === 'number' &&
          !isNaN(costume.rotationCenterY)
        )
          rotationCenter = [costume.rotationCenterX, costume.rotationCenterY];
        return loadBitmap_(costume, runtime, rotationCenter).catch((error) => {
          console.warn('[scratch-p2p] error loading bitmap image', error);
          return costume;
        });
      };

      const loadCostume = function (md5ext, costume, runtime) {
        const idParts = md5ext.split('.');
        costume.dataFormat = idParts[1].toLowerCase();
        if (costume.asset) return loadCostumeFromAsset(costume, runtime);
        return Promise.resolve(costume);
      };

      BL_load_costume = { loadCostume, loadCostumeFromAsset };
    }
  }

  let BL_load_costume = { loadCostume: () => Promise.resolve() };

  // ============================================================ boot ========
  trap();
  postStatus();
})();
