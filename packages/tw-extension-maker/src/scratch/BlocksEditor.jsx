import { useEffect, useRef } from 'react';

import { BLOCKS_DARK_COLOURS } from './blocksTheme.js';
import { scratch } from './controller.js';
import defineDynamicBlock from './define-dynamic-block.js';
import makeToolboxXML from './make-toolbox-xml.js';

// scratch-blocks loads block icons (dropdown carets, extension glyphs) from a
// media folder; we copy scratch-blocks/media → public/blockly-media.
const MEDIA_PATH = new URL('blockly-media/', document.baseURI).href;

/**
 * Build the toolbox XML for the current editing target, including any loaded
 * extension's category (from the VM). Adapted from scratch-gui's getToolboxXML.
 */
function getToolboxXML(vm) {
  try {
    let target = vm.editingTarget;
    const stage = vm.runtime.getTargetForStage();
    if (!target) target = stage;
    if (!target || !stage) return null;
    const stageCostumes = stage.getCostumes();
    const targetCostumes = target.getCostumes();
    const targetSounds = target.getSounds();
    const dynamicBlocksXML = vm.runtime.getBlocksXML(target);
    return makeToolboxXML(
      false,
      target.isStage,
      target.id,
      dynamicBlocksXML,
      targetCostumes[targetCostumes.length - 1].name,
      stageCostumes[stageCostumes.length - 1].name,
      targetSounds.length > 0 ? targetSounds[targetSounds.length - 1].name : '',
      BLOCKS_DARK_COLOURS,
    );
  } catch {
    return null;
  }
}

/**
 * The Scratch blocks editor: a scratch-blocks (Blockly) workspace wired to the
 * shared VM, dark-themed to match the app. Imperative integration adapted from
 * scratch-gui's Blocks container — no scratch-gui React components, so no
 * React-16/19 clash.
 */
export function BlocksEditor() {
  const hostRef = useRef(null);

  useEffect(() => {
    const { vm, ScratchBlocks } = scratch;
    let disposed = false;
    let cleanup = () => {};

    // Inject only once the project is loaded, so the toolbox already has
    // categories — scratch-blocks can't switch into category mode if it was
    // first injected with a categoryless toolbox.
    scratch.ready.then(() => {
      if (disposed) return;
      const host = hostRef.current;
      if (!host) return;

      const workspace = ScratchBlocks.inject(host, {
        toolbox: getToolboxXML(vm) || '<xml></xml>',
        colours: BLOCKS_DARK_COLOURS,
        grid: { spacing: 40, length: 2, colour: BLOCKS_DARK_COLOURS.gridColor },
        media: MEDIA_PATH,
        zoom: { controls: true, wheel: true, startScale: 0.675 },
        comments: true,
        collapse: false,
        sounds: false,
        scrollbars: true,
      });
      // Avoid a full toolbox re-render on every workspace reset.
      workspace.setToolboxRefreshEnabled(false);

      const refreshToolbox = () => {
        const xml = getToolboxXML(vm);
        if (xml) workspace.updateToolbox(xml);
      };

      // Workspace edits → VM (and flyout/monitor listeners for the palette).
      workspace.addChangeListener(vm.blockListener);
      const flyoutWorkspace = workspace.getFlyout().getWorkspace();
      flyoutWorkspace.addChangeListener(vm.flyoutBlockListener);
      flyoutWorkspace.addChangeListener(vm.monitorBlockListener);

      // VM → workspace: load the editing target's blocks.
      const onWorkspaceUpdate = (data) => {
        refreshToolbox();
        workspace.removeChangeListener(vm.blockListener);
        try {
          const dom = ScratchBlocks.Xml.textToDom(data.xml);
          ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml(dom, workspace);
        } catch {
          /* incomplete workspace; what did load still works */
        }
        workspace.addChangeListener(vm.blockListener);
        workspace.clearUndo();
      };

      // Loading an extension defines its blocks and adds its toolbox category.
      const handleExtensionAdded = (categoryInfo) => {
        const defineBlocks = (blockInfoArray) => {
          if (!blockInfoArray || !blockInfoArray.length) return;
          const staticBlocksJson = [];
          const dynamicBlocksInfo = [];
          for (const blockInfo of blockInfoArray) {
            if (blockInfo.info && blockInfo.info.isDynamic) {
              dynamicBlocksInfo.push(blockInfo);
            } else if (blockInfo.json) {
              staticBlocksJson.push(blockInfo.json);
            }
          }
          ScratchBlocks.defineBlocksWithJsonArray(staticBlocksJson);
          for (const blockInfo of dynamicBlocksInfo) {
            const extendedOpcode = `${categoryInfo.id}_${blockInfo.info.opcode}`;
            ScratchBlocks.Blocks[extendedOpcode] = defineDynamicBlock(
              ScratchBlocks,
              categoryInfo,
              blockInfo,
              extendedOpcode,
            );
          }
        };
        defineBlocks(
          Object.getOwnPropertyNames(categoryInfo.customFieldTypes).map(
            (name) =>
              categoryInfo.customFieldTypes[name].scratchBlocksDefinition,
          ),
        );
        defineBlocks(categoryInfo.menus);
        defineBlocks(categoryInfo.blocks);
        refreshToolbox();
      };

      vm.addListener('workspaceUpdate', onWorkspaceUpdate);
      vm.addListener('EXTENSION_ADDED', handleExtensionAdded);
      vm.addListener('BLOCKSINFO_UPDATED', handleExtensionAdded);
      vm.addListener('targetsUpdate', refreshToolbox);

      // Populate from the already-loaded project.
      vm.refreshWorkspace();
      ScratchBlocks.svgResize(workspace);

      const ro = new ResizeObserver(() => {
        try {
          ScratchBlocks.svgResize(workspace);
        } catch {
          /* not laid out yet */
        }
      });
      ro.observe(host);

      cleanup = () => {
        vm.removeListener('workspaceUpdate', onWorkspaceUpdate);
        vm.removeListener('EXTENSION_ADDED', handleExtensionAdded);
        vm.removeListener('BLOCKSINFO_UPDATED', handleExtensionAdded);
        vm.removeListener('targetsUpdate', refreshToolbox);
        ro.disconnect();
        workspace.dispose();
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <div ref={hostRef} className="h-full w-full" />;
}
