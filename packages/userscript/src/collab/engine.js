/*
 * engine.js — the VM/Blockly collaboration sync engine.
 *
 * Adapted (with small modifications) from LiveScratch by Waakul
 * (https://github.com/Waakul/livescratch), used under the ISC license — see
 * THIRD-PARTY-NOTICES.md at the package root for the full notice. It traps the
 * editor's scratch-vm and ScratchBlocks, mirrors local edits to the transport,
 * and applies remote edits locally. It is transport-agnostic: it pushes outgoing
 * edits through the `sendLocal` seam (registered by the transport via
 * onSendLocal) and exposes applyRemote() / loadProjectBytes() /
 * saveProjectBytes() for the transport to call.
 */

// The transport registers its gated sender here; the engine calls it for every
// locally-produced edit. Default no-op until collaboration is wired up.
let sendLocal = () => {};
export function onSendLocal(fn) {
  sendLocal = fn;
}

// ====================================================== engine state ======
let vm;
let ScratchBlocks;
let engineReady = false;
let pauseEventHandling = false;
let BL_UTILS;
let dispatch = async () => {};

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
    queued.forEach((m) => dispatch(m));
  }
  const toDelete = [];
  queryList.forEach((q) => {
    const elem = document.querySelector(q.query);
    if (elem && !elem.__scratchCollabSeen) {
      if (q.once) toDelete.push(q);
      else elem.__scratchCollabSeen = true;
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
    obj.__scratchCollabSeen = true;
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

/** Get the React fiber hanging off a DOM node (handles old + new React). */
function getReactFiber(el) {
  const key = Object.keys(el).find(
    (k) =>
      k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'),
  );
  return key ? el[key] : null;
}

/**
 * Breadth-first search of the whole fiber tree reachable from `start`,
 * walking children, siblings AND parents (`.return`). The thing we want
 * (the `vm` prop, the `ScratchBlocks` stateNode) lives on an *ancestor* of
 * the DOM node we start from, so a child-only walk never reaches it.
 */
function searchFiber(start, predicate) {
  if (!start) return null;
  const visited = new Set();
  const queue = [start];
  while (queue.length) {
    const node = queue.shift();
    if (!node || visited.has(node)) continue;
    visited.add(node);
    try {
      if (predicate(node)) return node;
    } catch {
      /* ignore */
    }
    if (node.child) queue.push(node.child);
    if (node.sibling) queue.push(node.sibling);
    if (node.return) queue.push(node.return);
  }
  return null;
}

async function trap() {
  // TurboWarp Desktop exposes the VM as a global, which is far more robust
  // than digging through React internals. Fall back to a fiber search for
  // plain scratch-gui builds that don't expose window.vm.
  if (window.vm) {
    vm = window.vm;
  } else {
    const reactElem = await getObj(
      'div[class^="stage-header_stage-menu-wrapper_"]',
    );
    const vmFiber = searchFiber(
      getReactFiber(reactElem),
      (n) => n.memoizedProps && n.memoizedProps.vm,
    );
    if (!vmFiber) {
      console.error(
        '[scratch-collab] could not locate the scratch-vm; retrying',
      );
      setTimeout(trap, 500);
      return;
    }
    vm = vmFiber.memoizedProps.vm;
  }

  installEngine();

  // Once the blocks workspace mounts, trap ScratchBlocks (the Blockly
  // namespace) — block-level sync needs it both to capture local edits and to
  // replay remote ones.
  listenForObj('[class^="gui_blocks-wrapper"]', () => trapScratchBlocks());

  // Lightweight probe so the user can check what got trapped from the console.
  window.__scratchCollabStatus = () => ({
    vm: !!vm,
    scratchBlocks: !!ScratchBlocks,
    workspace: !!getWorkspace(),
    listenerAttached: !!blockListenerAttachedTo,
    engineReady,
  });

  engineReady = true;
  engineReadyWaiters.splice(0).forEach((r) => r());
  console.log('[scratch-collab] editor trapped, engine ready');
}

// ScratchBlocks may not exist the instant the wrapper div mounts (the blocks
// component creates it a beat later), and different builds surface it
// differently — on the React instance, or as a global. Try every route and
// retry until it appears, logging the outcome so failures aren't silent.
function looksLikeScratchBlocks(o) {
  return !!(o && o.Workspace && o.Workspace.WorkspaceDB_ && o.Events);
}
function trapScratchBlocks(tries = 0) {
  if (ScratchBlocks) return;
  let sb = null;
  if (looksLikeScratchBlocks(window.ScratchBlocks)) sb = window.ScratchBlocks;
  else if (looksLikeScratchBlocks(window.Blockly)) sb = window.Blockly;
  else {
    const el = document.querySelector('[class^="gui_blocks-wrapper"]');
    const fiber =
      el &&
      searchFiber(
        getReactFiber(el),
        (n) => n.stateNode && looksLikeScratchBlocks(n.stateNode.ScratchBlocks),
      );
    if (fiber) sb = fiber.stateNode.ScratchBlocks;
  }
  if (!sb) {
    if (tries < 50) setTimeout(() => trapScratchBlocks(tries + 1), 200);
    else
      console.warn(
        '[scratch-collab] could not find ScratchBlocks — block edits will not sync',
      );
    return;
  }
  ScratchBlocks = sb;
  if (!window.Blockly) window.Blockly = ScratchBlocks;
  console.log('[scratch-collab] ScratchBlocks trapped');
  attachBlockListener();
}

// The Blockly workspace that drives block-level sync often finishes injecting
// a beat AFTER the blocks-wrapper div mounts, so getWorkspace() can be empty
// at first. Keep retrying until it exists, then attach our change listener —
// without this, block edits are silently never captured (no error, no sync).
let blockListenerAttachedTo = null;
function attachBlockListener(tries = 0) {
  const ws = getWorkspace();
  if (!ws) {
    if (tries < 50) setTimeout(() => attachBlockListener(tries + 1), 200);
    else
      console.warn(
        '[scratch-collab] gave up waiting for the Blockly workspace; block edits will not sync',
      );
    return;
  }
  if (ws === blockListenerAttachedTo) return;
  ws.removeChangeListener(blockListener);
  ws.addChangeListener(blockListener);
  blockListenerAttachedTo = ws;
  console.log('[scratch-collab] block sync listener attached');
}

// ============================================ ported sync engine ==========
// The functions below are adapted from LiveScratch's editor.js. They are
// hoisted (function declarations) so trap()/wireConnection can reference
// them, but rely on `vm`, `store`, `ScratchBlocks` being set first.

// STAGE IDENTIFIER — a string no sprite should ever be named.
const stageName = 'jHHVSbKjDsRhSWhIlYtd...___+_0)0+-collab';

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
  const numberEl = item.querySelector("[class*='sprite-selector-item_number']");
  if (!numberEl) return -1;
  return +numberEl.textContent - 1;
};
function getPaper() {
  const paperContainer = document.querySelector(
    "[class^='paint-editor_canvas-container']",
  );
  if (!paperContainer) return null;
  const fiber = searchFiber(
    getReactFiber(paperContainer),
    (n) => n.stateNode && n.stateNode.canvas,
  );
  return fiber ? fiber.stateNode : null;
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
      rep += Math.round(e.newCoordinate_?.x) + Math.round(e.newCoordinate_?.y);
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
          const oldParentId = d.extrargs.blockVarParent || d.event.oldParentId;
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
          const oldCoordinate = d.extrargs.blockVarPos || d.event.oldCoordinate;
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
        ((targetToName(oldEditingTarget) === d.target && !pauseEventHandling) ||
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
            if (blockElement) blockElement.style.transition = 'transform 0.5s';
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
      console.error('[scratch-collab] error applying block event', e);
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
    const topBlockDeleteMarks = [];
    getWorkspace()?.topBlocks_.forEach((block) => {
      const rep = getStringEventRep({ type: 'delete', blockId: block.id });
      livescratchEvents[rep] = true;
      topBlockDeleteMarks.push(rep);
    });
    Object.keys(vm.editingTarget.blocks._blocks).forEach((blockId) => {
      livescratchEvents[getStringEventRep({ type: 'create', blockId })] = true;
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
    Object.entries(vm.runtime.getTargetForStage().variables).forEach((varr) => {
      livescratchEvents[
        getStringEventRep({
          type: 'var_create',
          varId: varr[0],
          isCloud: varr[1].isCloud,
          varName: varr[1].name,
          isLocal: false,
        })
      ] = true;
    });
    oldEWU();
    // The marks above suppress the delete events fired *while* the workspace
    // rebuilds (oldEWU triggers a synchronous rebuild). Unlike move/create, a
    // `delete<blockId>` fingerprint has no distinguishing position/content, so
    // any mark the rebuild didn't consume would permanently shadow a genuine
    // user deletion of that block — deletes would silently never sync. Clear
    // the survivors now that the rebuild is done.
    topBlockDeleteMarks.forEach((rep) => delete livescratchEvents[rep]);
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
          console.error('[scratch-collab] error on proxy run', e);
        }
        if (then) {
          if (retVal?.then)
            retVal.then((res) => then(prevTarget, vm.editingTarget, data, res));
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
          console.error('[scratch-collab] error on proxy run', e);
        }
        if (then) {
          if (retVal?.then)
            retVal.then((res) => then(prevTarget, vm.editingTarget, data, res));
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

  // ---------- costume bitmap/svg paint edits (bytes sent to peers) ----------
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
      newTargetEvents[b.sprite.name]?.forEach((event) => dispatch(event));
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
  dispatch = async (msg) => {
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
      console.error('[scratch-collab] error handling remote message', e);
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
        console.warn('[scratch-collab] error loading bitmap image', error);
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

// ===================================================== module API =========
// The transport drives the engine through these. `dispatch` is the live
// remote-message handler assigned inside installEngine(); applyRemote() is a
// stable wrapper around it so importers get a fixed binding.
function startEngine() {
  return trap();
}
function isEngineReady() {
  return engineReady;
}
function applyRemote(msg) {
  return dispatch(msg);
}

/** Host: serialize the current project to .sb3 bytes for a joining peer. */
async function saveProjectBytes() {
  await whenEngineReady();
  const blob = await vm.saveProjectSb3();
  return blob.arrayBuffer();
}

/** Load a shared .sb3 (ArrayBuffer) received from the host into the editor. */
async function loadProjectBytes(buf) {
  await whenEngineReady();
  pauseEventHandling = true;
  try {
    await vm.loadProject(buf);
  } finally {
    pauseEventHandling = false;
  }
  try {
    vm.emitWorkspaceUpdate();
    vm.emitTargetsUpdate();
    setTimeout(() => BL_UTILS && BL_UTILS.refreshFlyout(), 120);
  } catch {
    /* ignore */
  }
}

export {
  startEngine,
  isEngineReady,
  whenEngineReady,
  applyRemote,
  saveProjectBytes,
  loadProjectBytes,
};
