import { BitmapAdapter } from '@turbowarp/scratch-svg-renderer';
import AudioEngine from 'scratch-audio';
import Renderer from 'scratch-render';
import ScratchStorage from '@turbowarp/scratch-storage';
import VM from 'scratch-vm';

export const STAGE_W = 480;
export const STAGE_H = 360;

/**
 * Create a Scratch VM wired with storage, audio, and a bitmap adapter — the
 * minimum to load and run a project. The renderer is attached separately once
 * we have a canvas (see {@link attachStage}). One VM is shared between the
 * blocks editor and the stage.
 */
export function createScratchVM() {
  const vm = new VM();
  vm.attachStorage(new ScratchStorage());
  vm.attachAudioEngine(new AudioEngine());
  vm.attachV2BitmapAdapter(new BitmapAdapter());
  vm.setCompatibilityMode(true);
  vm.setTurboMode(false);
  return vm;
}

/**
 * Attach a renderer to `canvas` and size the stage.
 *
 * @param {import('scratch-vm')} vm
 * @param {HTMLCanvasElement} canvas
 */
export function attachStage(vm, canvas) {
  if (vm.renderer) return vm.renderer;
  const renderer = new Renderer(
    canvas,
    -STAGE_W / 2,
    STAGE_W / 2,
    -STAGE_H / 2,
    STAGE_H / 2,
  );
  vm.setStageSize(STAGE_W, STAGE_H);
  vm.attachRenderer(renderer);
  renderer.draw(); // paint white instead of black before a project loads
  return renderer;
}
