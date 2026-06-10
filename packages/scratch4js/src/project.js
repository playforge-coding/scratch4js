import JSZip from '@turbowarp/jszip';
import { Sprite, Stage } from './target.js';

const DEFAULT_META = {
  semver: '3.0.0',
  vm: '14.0.0',
  agent: '',
};

/**
 * A loaded Scratch project (`.sb3`). An sb3 is a zip holding a `project.json`
 * description plus the costume/sound asset files it references. This class is
 * the entry point: load bytes, edit declaratively through {@link Stage} and
 * {@link Sprite}, then save back to bytes.
 *
 * @example
 * import { Project } from 'scratch4js';
 * import { readFile, writeFile } from 'node:fs/promises';
 *
 * const project = await Project.load(await readFile('game.sb3'));
 * const cat = project.sprite('Sprite1');
 * cat.x = 0;
 * cat.size = 150;
 * project.stage.setVariable('score', 0);
 * await writeFile('game.edited.sb3', await project.save());
 */
export class Project {
  /**
   * Prefer {@link Project.load}. Construct directly only when you already hold a
   * parsed `project.json` and its asset bytes.
   *
   * @param {object} json - Parsed project.json.
   * @param {Map<string, Uint8Array>} [assets] - Asset bytes keyed by `md5ext`.
   */
  constructor(json, assets = new Map()) {
    /** @type {object} The parsed project.json. */
    this.json = json;
    /** @type {Map<string, Uint8Array>} Asset bytes keyed by `<md5>.<ext>`. */
    this.assets = assets;
  }

  /**
   * Load a project from the raw bytes of an `.sb3` file.
   *
   * @param {Uint8Array | ArrayBuffer | Buffer} data - The sb3 zip bytes.
   * @returns {Promise<Project>}
   */
  static async load(data) {
    const zip = await JSZip.loadAsync(data);
    const projectFile = zip.file('project.json');
    if (!projectFile)
      throw new Error('Not a valid sb3: project.json is missing.');
    const json = JSON.parse(await projectFile.async('string'));

    const assets = new Map();
    const reads = [];
    zip.forEach((path, file) => {
      if (file.dir || path === 'project.json') return;
      reads.push(
        file.async('uint8array').then((bytes) => assets.set(path, bytes)),
      );
    });
    await Promise.all(reads);

    return new Project(json, assets);
  }

  /**
   * Create a new, empty project containing just a bare stage.
   *
   * @returns {Project}
   */
  static create() {
    const json = {
      targets: [
        {
          isStage: true,
          name: 'Stage',
          variables: {},
          lists: {},
          broadcasts: {},
          blocks: {},
          comments: {},
          currentCostume: 0,
          costumes: [],
          sounds: [],
          volume: 100,
          layerOrder: 0,
          tempo: 60,
          videoTransparency: 50,
          videoState: 'on',
          textToSpeechLanguage: null,
        },
      ],
      monitors: [],
      extensions: [],
      meta: { ...DEFAULT_META },
    };
    return new Project(json);
  }

  /** @returns {Stage} The project's single stage. */
  get stage() {
    const json = this.json.targets.find((t) => t.isStage);
    return new Stage(json, this);
  }

  /** @returns {Sprite[]} All non-stage targets, in array order. */
  get sprites() {
    return this.json.targets
      .filter((t) => !t.isStage)
      .map((t) => new Sprite(t, this));
  }

  /** @returns {Array<Stage | Sprite>} Every target, stage included. */
  get targets() {
    return this.json.targets.map((t) =>
      t.isStage ? new Stage(t, this) : new Sprite(t, this),
    );
  }

  /** @returns {object} The project's `meta` block (semver, vm, agent). */
  get meta() {
    return this.json.meta;
  }

  /** @returns {object[]} The raw `monitors` (variable/list watchers) array. */
  get monitors() {
    return this.json.monitors;
  }

  /** @returns {string[]} Ids of enabled extensions (e.g. `pen`, `music`). */
  get extensions() {
    return this.json.extensions;
  }

  /**
   * Find a sprite by name.
   *
   * @param {string} name
   * @returns {Sprite | undefined}
   */
  sprite(name) {
    const json = this.json.targets.find((t) => !t.isStage && t.name === name);
    return json ? new Sprite(json, this) : undefined;
  }

  /**
   * Find any target (sprite or stage) by name.
   *
   * @param {string} name
   * @returns {Stage | Sprite | undefined}
   */
  target(name) {
    const json = this.json.targets.find((t) => t.name === name);
    if (!json) return undefined;
    return json.isStage ? new Stage(json, this) : new Sprite(json, this);
  }

  /**
   * Add a new, empty sprite. It starts with no costumes, so add at least one
   * with {@link Sprite#addCostume} before opening the project in the editor.
   *
   * @param {string} name - Sprite name (must be unique among sprites).
   * @param {object} [props] - Initial property overrides (`x`, `y`, `size`, …).
   * @returns {Sprite} The new sprite.
   */
  addSprite(name, props = {}) {
    if (this.sprite(name))
      throw new Error(`A sprite named "${name}" already exists.`);
    const maxLayer = Math.max(
      0,
      ...this.json.targets.map((t) => t.layerOrder ?? 0),
    );
    const json = {
      isStage: false,
      name: String(name),
      variables: {},
      lists: {},
      broadcasts: {},
      blocks: {},
      comments: {},
      currentCostume: 0,
      costumes: [],
      sounds: [],
      volume: 100,
      layerOrder: maxLayer + 1,
      visible: true,
      x: 0,
      y: 0,
      size: 100,
      direction: 90,
      draggable: false,
      rotationStyle: 'all around',
      ...props,
    };
    this.json.targets.push(json);
    return new Sprite(json, this);
  }

  /**
   * Remove a sprite by name or instance. Assets it solely owned are dropped.
   *
   * @param {string | Sprite} nameOrSprite
   * @returns {boolean} True if a sprite was removed.
   */
  removeSprite(nameOrSprite) {
    const name =
      typeof nameOrSprite === 'string' ? nameOrSprite : nameOrSprite.name;
    const index = this.json.targets.findIndex(
      (t) => !t.isStage && t.name === name,
    );
    if (index < 0) return false;
    const [removed] = this.json.targets.splice(index, 1);
    for (const media of [...removed.costumes, ...removed.sounds]) {
      this._maybeDropAsset(media.md5ext);
    }
    return true;
  }

  /**
   * Drop an asset's bytes if no costume or sound anywhere still references it.
   * Called automatically when media is removed or its bytes are replaced.
   *
   * @param {string} md5ext
   * @private
   */
  _maybeDropAsset(md5ext) {
    if (!md5ext) return;
    const stillUsed = this.json.targets.some(
      (t) =>
        t.costumes.some((c) => c.md5ext === md5ext) ||
        t.sounds.some((s) => s.md5ext === md5ext),
    );
    if (!stillUsed) this.assets.delete(md5ext);
  }

  /**
   * Serialize the project back into `.sb3` bytes.
   *
   * @param {object} [options]
   * @param {number} [options.compressionLevel=6] - DEFLATE level, 1–9.
   * @returns {Promise<Uint8Array>} The sb3 zip bytes.
   */
  async save({ compressionLevel = 6 } = {}) {
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(this.json));
    for (const [path, bytes] of this.assets) {
      zip.file(path, bytes);
    }
    return zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    });
  }
}
