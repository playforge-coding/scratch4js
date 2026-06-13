import { emptyProjectBytes } from './empty-project.js';
import { createScratchVM } from './vm.js';
import VMScratchBlocks from './vm-blocks.js';

/** Base64-encode a (possibly unicode) string without overflowing the stack. */
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Owns the single Scratch VM + the scratch-blocks instance bound to it, shared
 * between the BlocksEditor and the Stage. Loads an empty project, runs the VM,
 * and loads the freshly-built extension into it via a same-origin blob: URL —
 * which is why none of the TurboWarp cross-origin/data-URL problems apply: the
 * VM runs in *our* page.
 */
class ScratchController {
  constructor() {
    this.vm = createScratchVM();
    this.ScratchBlocks = VMScratchBlocks(this.vm);
    this.ScratchBlocks.ScratchMsgs.setLocale('en');
    this._configureSecurity();

    /** id of the currently-loaded extension (so rebuilds can refresh it) */
    this.loadedExtensionId = null;
    this.ready = this._init();
  }

  async _init() {
    this.vm.setLocale('en', {});
    this.vm.start();
    await this.vm.loadProject(emptyProjectBytes());
  }

  // Trust everything: the user wrote this extension and it runs locally.
  _configureSecurity() {
    const sm = this.vm.extensionManager.securityManager;
    if (!sm) return;
    sm.getSandboxMode = () => 'unsandboxed';
    sm.canLoadExtensionFromProject = () => true;
    sm.canFetch = () => true;
    sm.canEmbed = () => true;
    sm.canOpenWindow = () => true;
    sm.canRedirect = () => true;
    sm.canNotify = () => true;
  }

  /**
   * Load (or reload) the built extension into the VM. Its category appears in
   * the blocks palette and its blocks become runnable on the stage.
   *
   * Uses a `data:` URL, not a blob: URL — scratch-vm's loadExtensionURL only
   * accepts http/https/data/file. Length isn't a concern: the VM is local, so
   * the runner just appends a same-origin <script src=…> (no Cloudflare/CORS).
   *
   * @param {string} contents the built single-file extension source
   */
  async loadExtension(contents) {
    await this.ready;
    const url = `data:text/javascript;base64,${toBase64(contents)}`;
    await this.vm.extensionManager.loadExtensionURL(url);
  }

  greenFlag() {
    this.vm.greenFlag();
  }

  stopAll() {
    this.vm.stopAll();
  }
}

export const scratch = new ScratchController();
