/**
 * A machine-readable catalog of Scratch's standard blocks, so an agent driving
 * `patch_target` knows which opcodes exist and exactly how to fill each one's
 * `inputs` and `fields` — rather than guessing from memory.
 *
 * The catalog is generated at startup from the installed `scratch-vm`:
 *   - `serialization/sb2_specmap.js` enumerates every standard block as
 *     `{ opcode, argMap }`, where each arg is either an `input` (with a
 *     `scratch-blocks` shadow type, `inputOp`) or a `field` (`fieldName`).
 *   - the sb3 input encoding (the `[1, [10, "hi"]]` shapes) is reproduced from
 *     the small, stable primitive map mirrored below (see `sb3.js`).
 * On top of that we layer a curated block *shape* (hat / stack / c-block / cap /
 * reporter / boolean), since the spec map does not record it.
 *
 * @module blocks
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Mirror of `scratch-vm/src/serialization/sb3.js`'s `primitiveOpcodeInfoMap`:
 * a primitive shadow type → `[sb3 primitive code, field name]`. Codes 4–10 hold
 * a literal value; 11–13 also need an id (broadcast/variable/list).
 */
const PRIMITIVES = {
  math_number: [4, 'NUM'],
  math_positive_number: [5, 'NUM'],
  math_whole_number: [6, 'NUM'],
  math_integer: [7, 'NUM'],
  math_angle: [8, 'NUM'],
  colour_picker: [9, 'COLOUR'],
  text: [10, 'TEXT'],
  event_broadcast_menu: [11, 'BROADCAST'],
  data_variable: [12, 'VARIABLE'],
  data_listcontents: [13, 'LIST'],
};

/** A sensible literal default per primitive code, used in examples. */
const PRIMITIVE_DEFAULT = {
  4: '0',
  5: '0',
  6: '10',
  7: '0',
  8: '90',
  9: '#990000',
  10: 'hello',
};

// --- Dropdown menus ---------------------------------------------------------
// The spec map records which args are menus but not their option values (those
// live in `scratch-blocks`, which isn't installed). These tables enumerate the
// *static* options; the strings were verified against the installed scratch-vm
// block implementations (e.g. the `case` labels in `blocks/scratch3_*.js`).

const KEY_OPTIONS = [
  'space',
  'up arrow',
  'down arrow',
  'right arrow',
  'left arrow',
  'enter',
  'any',
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'0123456789'.split(''),
];

/** Static field dropdowns, keyed by opcode → field name → options. */
const FIELD_MENUS = {
  motion_setrotationstyle: {
    STYLE: ['left-right', "don't rotate", 'all around'],
  },
  control_stop: {
    STOP_OPTION: ['all', 'this script', 'other scripts in sprite'],
  },
  looks_seteffectto: {
    EFFECT: [
      'COLOR',
      'FISHEYE',
      'WHIRL',
      'PIXELATE',
      'MOSAIC',
      'BRIGHTNESS',
      'GHOST',
    ],
  },
  looks_changeeffectby: {
    EFFECT: [
      'COLOR',
      'FISHEYE',
      'WHIRL',
      'PIXELATE',
      'MOSAIC',
      'BRIGHTNESS',
      'GHOST',
    ],
  },
  looks_gotofrontback: { FRONT_BACK: ['front', 'back'] },
  looks_goforwardbackwardlayers: { FORWARD_BACKWARD: ['forward', 'backward'] },
  looks_costumenumbername: { NUMBER_NAME: ['number', 'name'] },
  looks_backdropnumbername: { NUMBER_NAME: ['number', 'name'] },
  sound_seteffectto: { EFFECT: ['PITCH', 'PAN'] },
  sound_changeeffectby: { EFFECT: ['PITCH', 'PAN'] },
  sensing_setdragmode: { DRAG_MODE: ['draggable', 'not draggable'] },
  sensing_current: {
    CURRENTMENU: [
      'year',
      'month',
      'date',
      'dayofweek',
      'hour',
      'minute',
      'second',
    ],
  },
  operator_mathop: {
    OPERATOR: [
      'abs',
      'floor',
      'ceiling',
      'sqrt',
      'sin',
      'cos',
      'tan',
      'asin',
      'acos',
      'atan',
      'ln',
      'log',
      'e ^',
      '10 ^',
    ],
  },
};

/** The `sensing_of` PROPERTY field: static properties, plus the target's vars. */
const SENSING_OF_PROPERTIES = [
  'x position',
  'y position',
  'direction',
  'costume #',
  'costume name',
  'size',
  'volume',
  'backdrop #',
  'backdrop name',
];

/**
 * Menu *inputs* (a shadow block holds the value), keyed by the shadow opcode.
 * `static` lists fixed options; `source` names a project-derived list resolved
 * at request time (see {@link getBlockSchema}), with any fixed `constants`.
 */
const INPUT_MENUS = {
  looks_costume: { source: 'costumes' },
  looks_backdrops: { source: 'backdrops' },
  sound_sounds_menu: { source: 'sounds' },
  motion_goto_menu: { source: 'sprites', constants: ['_random_', '_mouse_'] },
  motion_glideto_menu: {
    source: 'sprites',
    constants: ['_random_', '_mouse_'],
  },
  motion_pointtowards_menu: {
    source: 'sprites',
    constants: ['_mouse_', '_random_'],
  },
  control_create_clone_of_menu: { source: 'sprites', constants: ['_myself_'] },
  sensing_touchingobjectmenu: {
    source: 'sprites',
    constants: ['_mouse_', '_edge_'],
  },
  sensing_distancetomenu: { source: 'sprites', constants: ['_mouse_'] },
  sensing_of_object_menu: { source: 'targets', constants: ['_stage_'] },
  sensing_keyoptions: { static: KEY_OPTIONS },
};

// Curated block shapes (the spec map omits them). These opcode sets are stable
// standard-Scratch facts; anything not listed defaults to "stack", except
// blocks that carry a `substack` input, which are detected as "c-block".
const HATS = new Set([
  'event_whenflagclicked',
  'event_whenkeypressed',
  'event_whenthisspriteclicked',
  'event_whenstageclicked',
  'event_whenbackdropswitchesto',
  'event_whengreaterthan',
  'event_whenbroadcastreceived',
  'control_start_as_clone',
  'procedures_definition',
]);
const CAPS = new Set(['control_stop', 'control_delete_this_clone']);
const BOOLEANS = new Set([
  'operator_gt',
  'operator_lt',
  'operator_equals',
  'operator_and',
  'operator_or',
  'operator_not',
  'operator_contains',
  'sensing_touchingobject',
  'sensing_touchingcolor',
  'sensing_coloristouchingcolor',
  'sensing_keypressed',
  'sensing_mousedown',
  'data_listcontainsitem',
]);
const REPORTERS = new Set([
  'motion_xposition',
  'motion_yposition',
  'motion_direction',
  'looks_costumenumbername',
  'looks_backdropnumbername',
  'looks_size',
  'sound_volume',
  'sensing_distanceto',
  'sensing_answer',
  'sensing_mousex',
  'sensing_mousey',
  'sensing_loudness',
  'sensing_timer',
  'sensing_of',
  'sensing_current',
  'sensing_dayssince2000',
  'sensing_username',
  'operator_add',
  'operator_subtract',
  'operator_multiply',
  'operator_divide',
  'operator_random',
  'operator_join',
  'operator_letter_of',
  'operator_length',
  'operator_mod',
  'operator_round',
  'operator_mathop',
  'data_itemoflist',
  'data_itemnumoflist',
  'data_lengthoflist',
]);

/** Core opcode category prefixes — used to scope "unknown opcode" warnings. */
const CORE_CATEGORIES = new Set([
  'motion',
  'looks',
  'sound',
  'event',
  'control',
  'sensing',
  'operator',
  'data',
  'procedures',
  'argument',
]);

/** Opcodes that take dynamic inputs/fields; never validated as "standard". */
const DYNAMIC_OPCODES = new Set([
  'procedures_call',
  'procedures_prototype',
  'procedures_definition',
  'argument_reporter_string_number',
  'argument_reporter_boolean',
]);

/** @returns {string} The category prefix of an opcode (e.g. "motion"). */
const categoryOf = (opcode) => opcode.split('_')[0];

/** Describe one input arg from its spec-map shadow type (`inputOp`). */
function describeInput(name, inputOp) {
  if (inputOp === 'substack') return { name, kind: 'substack' };
  if (inputOp === 'boolean') return { name, kind: 'boolean' };
  const prim = PRIMITIVES[inputOp];
  if (prim) {
    const [code] = prim;
    if (code <= 10) return { name, kind: 'primitive', shadow: inputOp, code };
    // 11/12/13 also carry an id (broadcast/variable/list).
    return { name, kind: 'primitive-ref', shadow: inputOp, code };
  }
  // Everything else is a dropdown backed by a shadow "menu" block whose field
  // is, by Scratch convention, named the same as the input.
  const input = { name, kind: 'menu', menuOpcode: inputOp, menuField: name };
  const menu = INPUT_MENUS[inputOp];
  if (menu?.static) input.options = menu.static;
  else if (menu?.source) {
    input.optionsSource = menu.source; // resolved per-project in getBlockSchema
    if (menu.constants) input.constants = menu.constants;
  }
  return input;
}

/** The example sb3 encoding for one input descriptor. */
function exampleInput(input) {
  switch (input.kind) {
    case 'primitive':
      return [
        1,
        [input.code, input.default ?? PRIMITIVE_DEFAULT[input.code] ?? ''],
      ];
    case 'primitive-ref': {
      // [code, "name", "id"] — the id must reference a real broadcast/var/list.
      const label = { 11: 'message1', 12: 'my variable', 13: 'my list' }[
        input.code
      ];
      return [1, [input.code, label, `<${input.shadow}Id>`]];
    }
    case 'boolean':
      return [2, null]; // plug a boolean reporter's id here, or omit when empty
    case 'substack':
      return [2, '<firstChildBlockId>'];
    case 'menu':
      return [1, '<menuBlockId>'];
    case 'special':
      return [1, '<shadowBlockId>']; // needs a `${shadowType}` shadow block
    default:
      return [1, null];
  }
}

/** Build the example block JSON for an opcode + its arg descriptors. */
function buildExample(opcode, shape, inputs, fields) {
  const block = {
    opcode,
    next: null,
    parent: null,
    inputs: {},
    fields: {},
    shadow: false,
    topLevel: shape === 'hat',
  };
  for (const input of inputs) block.inputs[input.name] = exampleInput(input);
  for (const field of fields) {
    block.fields[field.name] = field.byRef
      ? [`<${field.kind} name>`, `<${field.kind}Id>`]
      : [field.options ? field.options[0] : '<value>', null];
  }
  if (shape === 'hat') {
    block.x = 0;
    block.y = 0;
  }
  return block;
}

/** Classify a block's shape from curated sets + a substack-input check. */
function shapeOf(opcode, hasSubstack) {
  if (HATS.has(opcode)) return 'hat';
  if (hasSubstack) return 'c-block';
  if (CAPS.has(opcode)) return 'cap';
  if (BOOLEANS.has(opcode)) return 'boolean';
  if (REPORTERS.has(opcode)) return 'reporter';
  return 'stack';
}

/**
 * Build the full catalog: opcode → schema. Lazily memoized so the spec map is
 * required only once, and never on a path that does not use it.
 *
 * @returns {Map<string, object>}
 */
let catalog = null;
export function getCatalog() {
  if (catalog) return catalog;
  catalog = new Map();
  const specMap = require('scratch-vm/src/serialization/sb2_specmap.js');
  for (const block of Object.values(specMap)) {
    const { opcode, argMap } = block;
    // Skip blanks, duplicates, and pen/music opcodes — those were core in
    // Scratch 2.0 (so they appear here) but are extensions in 3.0; let the
    // extension catalog own them so their menus and enable hints are correct.
    if (
      !opcode ||
      catalog.has(opcode) ||
      BUILTIN_EXTENSION_IDS.has(categoryOf(opcode))
    )
      continue;
    const inputs = [];
    const fields = [];
    for (const arg of argMap ?? []) {
      if (arg.type === 'field') {
        // A `variableType` key (even `""` for scalars) marks a variable/list/
        // broadcast *reference* field; otherwise it is a plain dropdown.
        const byRef = 'variableType' in arg;
        const kind = !byRef
          ? 'dropdown'
          : arg.variableType === 'list'
            ? 'list'
            : arg.variableType === 'broadcast_msg'
              ? 'broadcast'
              : 'variable';
        fields.push({ name: arg.fieldName, kind, byRef });
      } else if (arg.type === 'input') {
        inputs.push(describeInput(arg.inputName, arg.inputOp));
      }
    }
    // Attach enumerated options to known dropdown fields, adding any the spec
    // map omits entirely (e.g. `looks_gotofrontback` has an empty argMap).
    const fieldMenus = {
      ...FIELD_MENUS[opcode],
      ...(opcode === 'sensing_of'
        ? { PROPERTY: SENSING_OF_PROPERTIES }
        : undefined),
    };
    for (const [fieldName, options] of Object.entries(fieldMenus)) {
      const existing = fields.find((f) => f.name === fieldName);
      if (existing) existing.options = options;
      else
        fields.push({
          name: fieldName,
          kind: 'dropdown',
          byRef: false,
          options,
        });
    }
    const shape = shapeOf(
      opcode,
      inputs.some((i) => i.kind === 'substack'),
    );
    catalog.set(opcode, {
      opcode,
      category: categoryOf(opcode),
      shape,
      inputs,
      fields,
      example: buildExample(opcode, shape, inputs, fields),
    });
  }
  return catalog;
}

// --- Built-in extensions ----------------------------------------------------
// Extensions expose their blocks via `getInfo()` (richer than the core spec map
// — it includes menu items). We instantiate each bundled extension with a stub
// runtime and translate its `getInfo()` into the same schema shape as core.

/** Bundled extension directory → its `getInfo().id`. */
const BUILTIN_EXTENSIONS = {
  scratch3_pen: 'pen',
  scratch3_music: 'music',
  scratch3_video_sensing: 'videoSensing',
  scratch3_text2speech: 'text2speech',
  scratch3_translate: 'translate',
  scratch3_makeymakey: 'makeymakey',
  scratch3_microbit: 'microbit',
  scratch3_ev3: 'ev3',
  scratch3_boost: 'boost',
  scratch3_wedo2: 'wedo2',
  scratch3_gdx_for: 'gdxfor',
};
/** Ids of all bundled extensions (known even if `getInfo()` fails to load). */
export const BUILTIN_EXTENSION_IDS = new Set(Object.values(BUILTIN_EXTENSIONS));

/** `blockType` (extension-support/block-type.js) → our shape vocabulary. */
const BLOCK_TYPE_SHAPE = {
  command: 'stack',
  reporter: 'reporter',
  Boolean: 'boolean',
  hat: 'hat',
  event: 'hat',
  conditional: 'c-block',
  loop: 'c-block',
};
/** `ArgumentType` (extension-support/argument-type.js) → a primitive shadow. */
const ARG_TYPE_PRIMITIVE = {
  number: { shadow: 'math_number', code: 4 },
  angle: { shadow: 'math_angle', code: 8 },
  color: { shadow: 'colour_picker', code: 9 },
  string: { shadow: 'text', code: 10 },
};

/** A throwaway runtime exposing just enough for extensions' `getInfo()`. */
function stubRuntime() {
  const noop = () => {};
  return {
    on: noop,
    off: noop,
    emit: noop,
    addListener: noop,
    getTargetForStage: () => null,
    registerPeripheralExtension: noop,
    makeMessageContextForTarget: () => ({}),
    formatMessage: (m) => (m && (m.default ?? m.id)) || '',
    ioDevices: {
      video: {
        enableVideo: noop,
        disableVideo: noop,
        setPreviewGhost: noop,
        getFrame: () => null,
        mirror: true,
        provider: null,
      },
      keyboard: {},
      mouse: {},
      mouseWheel: {},
      userData: {},
      cloud: {},
    },
    peripheralExtensions: {},
  };
}

/** Normalize a `getInfo()` menu definition to an array of option values. */
function menuOptions(menuDef) {
  const items = Array.isArray(menuDef) ? menuDef : menuDef?.items;
  if (!Array.isArray(items)) return null; // dynamic menu (function/method name)
  return items
    .filter((it) => it !== '---')
    .map((it) => (it && typeof it === 'object' ? it.value : it));
}

/** Translate one extension argument into an input descriptor. */
function describeExtArg(name, arg, info) {
  if (arg.menu) {
    const input = {
      name,
      kind: 'menu',
      menuOpcode: `${info.id}_menu_${arg.menu}`,
      menuField: arg.menu,
    };
    const options = menuOptions(info.menus?.[arg.menu]);
    if (options) input.options = options;
    else input.optionsNote = `dynamic menu "${arg.menu}".`;
    return input;
  }
  if (arg.type === 'Boolean') return { name, kind: 'boolean' };
  const prim = ARG_TYPE_PRIMITIVE[arg.type];
  if (prim)
    return {
      name,
      kind: 'primitive',
      shadow: prim.shadow,
      code: prim.code,
      default: arg.defaultValue,
    };
  // matrix / note / image / costume / sound without a menu: a real shadow block.
  return { name, kind: 'special', shadowType: arg.type };
}

/** Lazily build opcode → schema for every loadable bundled extension. */
let extensionCatalog = null;
function getExtensionCatalog() {
  if (extensionCatalog) return extensionCatalog;
  extensionCatalog = new Map();
  // `getInfo()` resolves block text via format-message, which warns loudly for
  // every missing translation; mute that chatter while we harvest metadata.
  const warn = console.warn;
  console.warn = () => {};
  try {
    buildExtensionCatalogInto(extensionCatalog);
  } finally {
    console.warn = warn;
  }
  return extensionCatalog;
}

function buildExtensionCatalogInto(extensionCatalog) {
  for (const [dir, fallbackId] of Object.entries(BUILTIN_EXTENSIONS)) {
    let info;
    try {
      const Ext = require(`scratch-vm/src/extensions/${dir}/index.js`);
      info = new Ext(stubRuntime()).getInfo();
    } catch {
      continue; // id stays known via BUILTIN_EXTENSION_IDS; just no schema
    }
    const id = info.id ?? fallbackId;
    for (const block of info.blocks ?? []) {
      if (!block || typeof block !== 'object' || !block.opcode) continue;
      const shape = BLOCK_TYPE_SHAPE[block.blockType];
      if (!shape) continue; // button / label / xml are not real blocks
      const opcode = `${id}_${block.opcode}`;
      const inputs = Object.entries(block.arguments ?? {}).map(([n, a]) =>
        describeExtArg(n, a, info),
      );
      extensionCatalog.set(opcode, {
        opcode,
        category: id,
        extension: id,
        shape,
        inputs,
        fields: [],
        example: buildExample(opcode, shape, inputs, []),
      });
    }
  }
  return extensionCatalog;
}

/** Look up a schema in the core catalog, then the extension catalog. */
function lookupSchema(opcode) {
  return getCatalog().get(opcode) ?? getExtensionCatalog().get(opcode);
}

/**
 * A compact listing for `list_blocks`: opcode, shape and the names of its
 * inputs/fields. With no `category`, lists core blocks; pass a core category or
 * a built-in extension id (e.g. "pen") to filter.
 *
 * @param {string} [category]
 * @returns {object[]}
 */
export function listBlocks(category) {
  const source = BUILTIN_EXTENSION_IDS.has(category)
    ? getExtensionCatalog()
    : getCatalog();
  const out = [];
  for (const b of source.values()) {
    if (category && b.category !== category) continue;
    out.push({
      opcode: b.opcode,
      category: b.category,
      shape: b.shape,
      inputs: b.inputs.map((i) => i.name),
      fields: b.fields.map((f) => f.name),
      ...(b.extension ? { extension: b.extension } : {}),
    });
  }
  return out;
}

/**
 * The full schema for one opcode, or a not-found result with close matches.
 * Dynamic menus (sounds, sprites, broadcasts, …) are resolved against the
 * provided project context so their options reflect the actual project.
 *
 * @param {string} opcode
 * @param {object} [context] - Project-derived name lists for dynamic menus:
 *   `{ sprites, targets, costumes, sounds, backdrops, broadcasts, variables }`.
 * @returns {object}
 */
export function getBlockSchema(opcode, context = {}) {
  const base = lookupSchema(opcode);
  if (!base) {
    return {
      opcode,
      found: false,
      message: `"${opcode}" is not in the standard-block catalog (it may be a custom/third-party extension — mirror an existing block via get_target_json).`,
      closest: closestOpcodes(opcode, 5),
    };
  }
  const schema = structuredClone(base);
  if (schema.extension) {
    schema.requiresExtension = schema.extension;
    schema.enableHint = `Add the "${schema.extension}" extension first: enable_extension { id: "${schema.extension}" }. Menu inputs need a "${schema.extension}_menu_<MENU>" shadow block.`;
  }
  for (const input of schema.inputs) {
    if (input.optionsSource) {
      const names = context[input.optionsSource];
      input.options = [...(input.constants ?? []), ...(names ?? [])];
      if (!names)
        input.optionsNote = `plus the project's ${input.optionsSource} (open a project / pass \`target\` to enumerate).`;
      delete input.optionsSource;
      delete input.constants;
    } else if (input.shadow === 'event_broadcast_menu') {
      if (context.broadcasts?.length) input.options = context.broadcasts;
      else input.optionsNote = "the project's broadcast messages.";
    }
  }
  if (opcode === 'sensing_of') {
    const prop = schema.fields.find((f) => f.name === 'PROPERTY');
    if (prop) prop.optionsNote = "plus the selected target's variable names.";
  }
  return schema;
}

/** Levenshtein distance, for "did you mean" suggestions. */
function editDistance(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** The `n` catalog opcodes closest to `opcode` by edit distance. */
function closestOpcodes(opcode, n) {
  return [...getCatalog().keys(), ...getExtensionCatalog().keys()]
    .map((o) => [o, editDistance(opcode, o)])
    .sort((a, b) => a[1] - b[1])
    .slice(0, n)
    .map(([o]) => o);
}

/**
 * Advisory validation of a target's `blocks` map against the catalog. Flags
 * unknown standard opcodes (with a suggestion), unexpected input/field names,
 * out-of-range dropdown values, and extension blocks whose extension is not
 * enabled. Never errors — custom/third-party blocks are intentionally ignored.
 *
 * @param {object} blocks - A target's raw `blocks` object.
 * @param {object} [options]
 * @param {string[]} [options.enabledExtensions] - Ids in `project.extensions`.
 * @returns {string[]} Human-readable warnings (possibly empty).
 */
export function validateBlocks(blocks, { enabledExtensions = [] } = {}) {
  const warnings = [];
  if (!blocks || typeof blocks !== 'object') return warnings;
  const enabled = new Set(enabledExtensions);
  const missingExtensions = new Set(); // dedupe "not enabled" by id
  for (const [id, block] of Object.entries(blocks)) {
    // Variable/list reporters are stored as compressed arrays, not objects.
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    const opcode = block.opcode;
    if (typeof opcode !== 'string' || DYNAMIC_OPCODES.has(opcode)) continue;
    const schema = getCatalog().get(opcode);
    if (!schema) {
      const extSchema = getExtensionCatalog().get(opcode);
      const cat = categoryOf(opcode);
      if (extSchema) {
        if (!enabled.has(extSchema.extension))
          missingExtensions.add(extSchema.extension);
        const known = new Set(extSchema.inputs.map((i) => i.name));
        for (const name of Object.keys(block.inputs ?? {}))
          if (!known.has(name))
            warnings.push(
              `block ${id} (${opcode}): unexpected input "${name}" (expected ${listOr(known)}).`,
            );
      } else if (BUILTIN_EXTENSION_IDS.has(cat)) {
        // A bundled extension whose schema didn't load, or an opcode typo.
        if (!enabled.has(cat)) missingExtensions.add(cat);
      } else if (CORE_CATEGORIES.has(cat)) {
        // Only flag core-looking opcodes, so custom extensions stay quiet.
        const [near] = closestOpcodes(opcode, 1);
        warnings.push(
          `block ${id}: unknown opcode "${opcode}"${near ? ` (did you mean "${near}"?)` : ''}.`,
        );
      }
      continue;
    }
    const knownInputs = new Set(schema.inputs.map((i) => i.name));
    for (const name of Object.keys(block.inputs ?? {})) {
      if (!knownInputs.has(name))
        warnings.push(
          `block ${id} (${opcode}): unexpected input "${name}" (expected ${listOr(knownInputs)}).`,
        );
    }
    // The spec map under-lists some plain dropdown fields, so only flag extras
    // for blocks whose schema actually declares fields (keeps false positives
    // off blocks like `looks_gotofrontback`).
    if (schema.fields.length > 0) {
      const knownFields = new Set(schema.fields.map((f) => f.name));
      for (const name of Object.keys(block.fields ?? {})) {
        if (!knownFields.has(name))
          warnings.push(
            `block ${id} (${opcode}): unexpected field "${name}" (expected ${listOr(knownFields)}).`,
          );
      }
    }
    // Check values against fully-enumerated ("closed") static dropdowns only —
    // never dynamic menus (sensing_of, variable fields) whose options vary.
    for (const f of schema.fields) {
      if (!FIELD_MENUS[opcode]?.[f.name]) continue;
      const entry = block.fields?.[f.name];
      if (entry === undefined) continue;
      const value = Array.isArray(entry) ? entry[0] : entry;
      if (!f.options.includes(value))
        warnings.push(
          `block ${id} (${opcode}): field "${f.name}" value ${JSON.stringify(value)} is not one of ${f.options.map((o) => JSON.stringify(o)).join(', ')}.`,
        );
    }
  }
  for (const ext of missingExtensions)
    warnings.push(
      `uses the "${ext}" extension, which is not enabled — call enable_extension { id: "${ext}" }.`,
    );
  return warnings;
}

/** Format a set of names as `none` / `"A"` / `"A", "B"` for messages. */
function listOr(set) {
  const names = [...set];
  if (names.length === 0) return 'none';
  return names.map((n) => `"${n}"`).join(', ');
}
