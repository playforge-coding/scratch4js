import { Costume, Sound } from './assets.js';
import { Comment } from './comment.js';
import { sniffFormat } from './format.js';
import { md5 } from './md5.js';
import { uid } from './ids.js';

/**
 * A target is anything that lives in the project's `targets` array: either the
 * single {@link Stage} or a {@link Sprite}. This base class covers everything
 * the two share — name, costumes, sounds, variables, lists and raw blocks.
 *
 * @abstract
 */
export class Target {
  /**
   * @param {object} json - The raw target entry from project.json.
   * @param {import('./project.js').Project} project - Owning project.
   */
  constructor(json, project) {
    /** @type {object} The underlying JSON; the accessors below keep it in sync. */
    this.json = json;
    /** @type {import('./project.js').Project} */
    this.project = project;
  }

  /** @returns {boolean} True for the stage, false for sprites. */
  get isStage() {
    return Boolean(this.json.isStage);
  }

  /** @returns {string} The target's name. */
  get name() {
    return this.json.name;
  }
  set name(value) {
    this.json.name = String(value);
  }

  /** @returns {number} Output volume, 0–100. */
  get volume() {
    return this.json.volume ?? 100;
  }
  set volume(value) {
    this.json.volume = Number(value);
  }

  // --- Costumes -------------------------------------------------------------

  /** @returns {Costume[]} The target's costumes, in order. */
  get costumes() {
    return this.json.costumes.map((c) => new Costume(c, this.project));
  }

  /** @returns {number} Index of the currently selected costume. */
  get currentCostume() {
    return this.json.currentCostume ?? 0;
  }
  set currentCostume(value) {
    this.json.currentCostume = Number(value);
  }

  /**
   * Find a costume by name.
   *
   * @param {string} name
   * @returns {Costume | undefined}
   */
  getCostume(name) {
    const entry = this.json.costumes.find((c) => c.name === name);
    return entry ? new Costume(entry, this.project) : undefined;
  }

  /**
   * Add a costume from raw image bytes. The asset is stored in the zip keyed by
   * its MD5, and a costume entry pointing at it is appended.
   *
   * @param {string} name - Costume name.
   * @param {Uint8Array | ArrayBuffer} data - Image bytes (PNG/SVG/JPG/…).
   * @param {object} [options]
   * @param {string} [options.dataFormat] - Override the detected file type.
   * @param {number} [options.rotationCenterX] - Anchor X (defaults to 0).
   * @param {number} [options.rotationCenterY] - Anchor Y (defaults to 0).
   * @param {number} [options.bitmapResolution] - 1 for SVG, 2 for HD bitmaps.
   * @returns {Costume} The newly added costume.
   */
  addCostume(name, data, options = {}) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const dataFormat = options.dataFormat ?? sniffFormat(bytes) ?? 'png';
    const hash = md5(bytes);
    const entry = {
      name: String(name),
      bitmapResolution:
        options.bitmapResolution ?? (dataFormat === 'svg' ? 1 : 2),
      dataFormat,
      assetId: hash,
      md5ext: `${hash}.${dataFormat}`,
      rotationCenterX: options.rotationCenterX ?? 0,
      rotationCenterY: options.rotationCenterY ?? 0,
    };
    this.project.assets.set(entry.md5ext, bytes);
    this.json.costumes.push(entry);
    return new Costume(entry, this.project);
  }

  /**
   * Remove a costume by name or index.
   *
   * @param {string | number} nameOrIndex
   * @returns {boolean} True if a costume was removed.
   */
  removeCostume(nameOrIndex) {
    return this._removeMedia('costumes', nameOrIndex);
  }

  // --- Sounds ---------------------------------------------------------------

  /** @returns {Sound[]} The target's sounds, in order. */
  get sounds() {
    return this.json.sounds.map((s) => new Sound(s, this.project));
  }

  /**
   * Find a sound by name.
   *
   * @param {string} name
   * @returns {Sound | undefined}
   */
  getSound(name) {
    const entry = this.json.sounds.find((s) => s.name === name);
    return entry ? new Sound(entry, this.project) : undefined;
  }

  /**
   * Add a sound from raw audio bytes.
   *
   * @param {string} name - Sound name.
   * @param {Uint8Array | ArrayBuffer} data - Audio bytes (WAV/MP3).
   * @param {object} [options]
   * @param {string} [options.dataFormat] - Override the detected file type.
   * @param {number} [options.rate] - Sample rate in Hz (default 48000).
   * @param {number} [options.sampleCount] - Number of samples (default 0).
   * @returns {Sound} The newly added sound.
   */
  addSound(name, data, options = {}) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const dataFormat = options.dataFormat ?? sniffFormat(bytes) ?? 'wav';
    const hash = md5(bytes);
    const entry = {
      name: String(name),
      assetId: hash,
      dataFormat,
      format: '',
      rate: options.rate ?? 48000,
      sampleCount: options.sampleCount ?? 0,
      md5ext: `${hash}.${dataFormat}`,
    };
    this.project.assets.set(entry.md5ext, bytes);
    this.json.sounds.push(entry);
    return new Sound(entry, this.project);
  }

  /**
   * Remove a sound by name or index.
   *
   * @param {string | number} nameOrIndex
   * @returns {boolean} True if a sound was removed.
   */
  removeSound(nameOrIndex) {
    return this._removeMedia('sounds', nameOrIndex);
  }

  /**
   * @param {'costumes' | 'sounds'} kind
   * @param {string | number} nameOrIndex
   * @returns {boolean}
   * @private
   */
  _removeMedia(kind, nameOrIndex) {
    const list = this.json[kind];
    const index =
      typeof nameOrIndex === 'number'
        ? nameOrIndex
        : list.findIndex((m) => m.name === nameOrIndex);
    if (index < 0 || index >= list.length) return false;
    const [removed] = list.splice(index, 1);
    if (kind === 'costumes' && this.json.currentCostume >= list.length) {
      this.json.currentCostume = Math.max(0, list.length - 1);
    }
    this.project._maybeDropAsset(removed.md5ext);
    return true;
  }

  // --- Variables & lists ----------------------------------------------------

  /** @returns {string[]} Names of this target's variables. */
  get variableNames() {
    return Object.values(this.json.variables).map(([name]) => name);
  }

  /**
   * Read a variable's value by name.
   *
   * @param {string} name
   * @returns {string | number | boolean | undefined}
   */
  getVariable(name) {
    const found = Object.values(this.json.variables).find(([n]) => n === name);
    return found ? found[1] : undefined;
  }

  /**
   * Create or update a variable by name.
   *
   * @param {string} name
   * @param {string | number | boolean} value
   * @returns {string} The variable's id.
   */
  setVariable(name, value) {
    for (const [id, entry] of Object.entries(this.json.variables)) {
      if (entry[0] === name) {
        entry[1] = value;
        return id;
      }
    }
    const id = uid();
    this.json.variables[id] = [name, value];
    return id;
  }

  /**
   * Delete a variable by name.
   *
   * @param {string} name
   * @returns {boolean} True if a variable was deleted.
   */
  deleteVariable(name) {
    for (const [id, entry] of Object.entries(this.json.variables)) {
      if (entry[0] === name) {
        delete this.json.variables[id];
        return true;
      }
    }
    return false;
  }

  /** @returns {string[]} Names of this target's lists. */
  get listNames() {
    return Object.values(this.json.lists).map(([name]) => name);
  }

  /**
   * Read a list's contents by name.
   *
   * @param {string} name
   * @returns {Array<string | number> | undefined}
   */
  getList(name) {
    const found = Object.values(this.json.lists).find(([n]) => n === name);
    return found ? found[1] : undefined;
  }

  /**
   * Create or replace a list by name.
   *
   * @param {string} name
   * @param {Array<string | number>} items
   * @returns {string} The list's id.
   */
  setList(name, items = []) {
    for (const [id, entry] of Object.entries(this.json.lists)) {
      if (entry[0] === name) {
        entry[1] = items;
        return id;
      }
    }
    const id = uid();
    this.json.lists[id] = [name, items];
    return id;
  }

  /**
   * Delete a list by name.
   *
   * @param {string} name
   * @returns {boolean} True if a list was deleted.
   */
  deleteList(name) {
    for (const [id, entry] of Object.entries(this.json.lists)) {
      if (entry[0] === name) {
        delete this.json.lists[id];
        return true;
      }
    }
    return false;
  }

  // --- Comments -------------------------------------------------------------

  /** @returns {Comment[]} The target's workspace comments. */
  get comments() {
    return Object.entries(this.json.comments ?? {}).map(
      ([id, entry]) => new Comment(id, entry),
    );
  }

  /**
   * Find a comment by id.
   *
   * @param {string} id
   * @returns {Comment | undefined}
   */
  getComment(id) {
    const entry = this.json.comments?.[id];
    return entry ? new Comment(id, entry) : undefined;
  }

  /**
   * Add a workspace comment. With no `blockId` the comment floats free on the
   * canvas; pass a `blockId` to attach it to one of this target's blocks (the
   * block's `comment` pointer is updated to match).
   *
   * @param {string} text - The comment's text.
   * @param {object} [options]
   * @param {string | null} [options.blockId] - Block to attach to (default none).
   * @param {number} [options.x] - Canvas X (default 0).
   * @param {number} [options.y] - Canvas Y (default 0).
   * @param {number} [options.width] - Box width (default 200).
   * @param {number} [options.height] - Box height (default 200).
   * @param {boolean} [options.minimized] - Start collapsed (default false).
   * @returns {Comment} The newly added comment.
   */
  addComment(text, options = {}) {
    if (!this.json.comments) this.json.comments = {};
    const id = uid();
    const blockId = options.blockId ?? null;
    this.json.comments[id] = {
      blockId,
      x: options.x ?? 0,
      y: options.y ?? 0,
      width: options.width ?? 200,
      height: options.height ?? 200,
      minimized: options.minimized ?? false,
      text: String(text),
    };
    // Keep the block → comment back-reference in sync so the editor renders the
    // comment anchored to its block.
    if (blockId && this.json.blocks?.[blockId])
      this.json.blocks[blockId].comment = id;
    return new Comment(id, this.json.comments[id]);
  }

  /**
   * Remove a comment by id.
   *
   * @param {string} id
   * @returns {boolean} True if a comment was removed.
   */
  removeComment(id) {
    const entry = this.json.comments?.[id];
    if (!entry) return false;
    delete this.json.comments[id];
    // Clear the dangling back-reference on the block it was attached to.
    if (entry.blockId && this.json.blocks?.[entry.blockId]?.comment === id)
      delete this.json.blocks[entry.blockId].comment;
    return true;
  }

  /**
   * The raw `blocks` object for advanced scripting edits. Keys are block ids;
   * values are the block definitions. Mutate directly for low-level changes.
   *
   * @returns {object}
   */
  get blocks() {
    return this.json.blocks;
  }
}

/**
 * The stage: the single backdrop-bearing target that also owns the project's
 * broadcasts.
 */
export class Stage extends Target {
  /** @returns {true} Always the stage. Discriminates {@link Stage} from {@link Sprite}. */
  get isStage() {
    return true;
  }

  /** @returns {number} Tempo for music blocks, in BPM. */
  get tempo() {
    return this.json.tempo ?? 60;
  }
  set tempo(value) {
    this.json.tempo = Number(value);
  }

  /** @returns {string} Video input state: `on`, `off`, or `on-flipped`. */
  get videoState() {
    return this.json.videoState ?? 'off';
  }
  set videoState(value) {
    this.json.videoState = String(value);
  }

  /** @returns {number} Video transparency, 0–100. */
  get videoTransparency() {
    return this.json.videoTransparency ?? 50;
  }
  set videoTransparency(value) {
    this.json.videoTransparency = Number(value);
  }

  /** @returns {string[]} Names of all broadcast messages in the project. */
  get broadcastNames() {
    return Object.values(this.json.broadcasts);
  }

  /**
   * Add a broadcast message if it does not already exist.
   *
   * @param {string} name
   * @returns {string} The broadcast's id.
   */
  addBroadcast(name) {
    for (const [id, n] of Object.entries(this.json.broadcasts)) {
      if (n === name) return id;
    }
    const id = `broadcastMsgId-${name}`;
    this.json.broadcasts[id] = name;
    return id;
  }
}

/**
 * A sprite: a movable target with a position, size and orientation.
 */
export class Sprite extends Target {
  /** @returns {false} Never the stage. Discriminates {@link Sprite} from {@link Stage}. */
  get isStage() {
    return false;
  }

  /** @returns {number} X position on the stage (−240…240). */
  get x() {
    return this.json.x ?? 0;
  }
  set x(value) {
    this.json.x = Number(value);
  }

  /** @returns {number} Y position on the stage (−180…180). */
  get y() {
    return this.json.y ?? 0;
  }
  set y(value) {
    this.json.y = Number(value);
  }

  /** @returns {number} Size as a percentage (100 = original). */
  get size() {
    return this.json.size ?? 100;
  }
  set size(value) {
    this.json.size = Number(value);
  }

  /** @returns {number} Direction in degrees (90 = pointing right). */
  get direction() {
    return this.json.direction ?? 90;
  }
  set direction(value) {
    this.json.direction = Number(value);
  }

  /** @returns {boolean} Whether the sprite is shown. */
  get visible() {
    return this.json.visible ?? true;
  }
  set visible(value) {
    this.json.visible = Boolean(value);
  }

  /** @returns {boolean} Whether the sprite can be dragged in the player. */
  get draggable() {
    return this.json.draggable ?? false;
  }
  set draggable(value) {
    this.json.draggable = Boolean(value);
  }

  /** @returns {string} Rotation style: `all around`, `left-right`, `don't rotate`. */
  get rotationStyle() {
    return this.json.rotationStyle ?? 'all around';
  }
  set rotationStyle(value) {
    this.json.rotationStyle = String(value);
  }

  /** @returns {number} Stacking order; higher draws on top. */
  get layerOrder() {
    return this.json.layerOrder ?? 0;
  }
  set layerOrder(value) {
    this.json.layerOrder = Number(value);
  }
}
