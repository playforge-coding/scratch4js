// Generators for every file in a scaffolded project that isn't the bundler
// config (that lives in bundlers.js). `buildFileMap` returns a flat
// { relativePath: contents } map the scaffolder writes verbatim.

import { BUNDLERS } from './bundlers.js';

// The git dependency spec the user asked for. Installed as a devDependency and
// wired into jsconfig so the global `Scratch` API is typed in editors.
const TYPES_PACKAGE = '@turbowarp/types';
const TYPES_SPEC = 'git+https://github.com/TurboWarp/types-tw.git#tw';

/**
 * @typedef {Object} Meta
 * @property {string} name        human-readable extension name
 * @property {string} id          extension id (also the output filename)
 * @property {string} description short description for the gallery header
 * @property {string} by          author credit
 */

/**
 * @typedef {Object} ScaffoldOptions
 * @property {string} projectName directory name the user typed
 * @property {string} bundler     a key of BUNDLERS
 * @property {boolean} types      whether to install @turbowarp/types
 * @property {'npm'|'pnpm'|'yarn'|'bun'} packageManager
 */

/**
 * Turn an arbitrary project name into a valid TurboWarp extension id: lowercase
 * alphanumerics only (the gallery uses it as a global key and filename).
 *
 * @param {string} projectName
 */
export function toExtensionId(projectName) {
  const id = projectName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return id || 'myextension';
}

/**
 * @param {ScaffoldOptions} opts
 * @returns {Meta}
 */
export function metaFor(opts) {
  return {
    name: opts.projectName,
    id: toExtensionId(opts.projectName),
    description: `A TurboWarp extension built with ${BUNDLERS[opts.bundler].label}.`,
    by: 'you',
  };
}

/**
 * Build the complete { path: contents } map for a project.
 *
 * @param {ScaffoldOptions} opts
 * @returns {Record<string, string>}
 */
export function buildFileMap(opts) {
  const bundler = BUNDLERS[opts.bundler];
  const meta = metaFor(opts);

  /** @type {Record<string, string>} */
  const files = {
    'package.json': packageJson(opts, meta),
    [bundler.configFile]: bundler.config(meta),
    'src/index.js': indexJs(meta),
    'src/blocks/greeting.js': greetingJs(),
    'src/icon.svg': ICON_SVG,
    '.gitignore': GITIGNORE,
    'README.md': readme(opts, meta),
  };

  if (opts.types) {
    files['jsconfig.json'] = jsconfig();
  }

  return files;
}

/**
 * @param {ScaffoldOptions} opts
 * @param {Meta} meta
 */
function packageJson(opts, meta) {
  const bundler = BUNDLERS[opts.bundler];

  /** @type {Record<string, string>} */
  const devDependencies = { ...bundler.devDependencies(meta) };
  if (opts.types) {
    devDependencies[TYPES_PACKAGE] = TYPES_SPEC;
  }

  // Sort dev deps so the generated file is stable regardless of insertion order.
  const sortedDev = Object.fromEntries(
    Object.entries(devDependencies).sort(([a], [b]) => a.localeCompare(b)),
  );

  const pkg = {
    name: meta.id,
    version: '0.1.0',
    private: true,
    type: 'module',
    description: meta.description,
    scripts: {
      build: bundler.scripts.build,
      dev: bundler.scripts.dev,
    },
    devDependencies: sortedDev,
  };

  return JSON.stringify(pkg, null, 2) + '\n';
}

/** @param {Meta} meta */
function indexJs(meta) {
  return `// The entry module. Import from sibling files (the bundler inlines them into a
// single file) and \`export default\` the extension class. The scratch4js plugin
// wraps everything in the TurboWarp IIFE and calls
// \`Scratch.extensions.register()\` for you — don't call it yourself here.

import { greet } from './blocks/greeting.js';
// Imported assets are inlined as base64 \`data:\` URIs you can hand to
// menuIconURI / blockIconURI.
import iconURI from './icon.svg';

export default class ${className(meta.id)} {
  getInfo() {
    return {
      id: '${meta.id}',
      name: '${meta.name}',
      menuIconURI: iconURI,
      blocks: [
        {
          opcode: 'hello',
          blockType: Scratch.BlockType.REPORTER,
          text: 'greet [WHO]',
          arguments: {
            WHO: { type: Scratch.ArgumentType.STRING, defaultValue: 'world' },
          },
        },
      ],
    };
  }

  hello(args) {
    return greet(args.WHO);
  }
}
`;
}

function greetingJs() {
  return `// A helper module — proof the extension can be split across files. Plain code
// the bundler inlines into the final single-file output.

/** @param {string} name */
export function greet(name) {
  return \`Hello, \${name}!\`;
}
`;
}

/** Derive a PascalCase class name from the extension id. */
function className(id) {
  const base = id.replace(/[^a-zA-Z0-9]/g, '') || 'Extension';
  const pascal = base.charAt(0).toUpperCase() + base.slice(1);
  return /^[a-zA-Z]/.test(pascal) ? pascal : `Ext${pascal}`;
}

function jsconfig() {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ESNext',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          checkJs: true,
          noEmit: true,
          // Pulls in the global `Scratch` API declarations from @turbowarp/types.
          types: [TYPES_PACKAGE],
        },
        include: ['src', '*.config.js', '*.config.mjs'],
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * @param {ScaffoldOptions} opts
 * @param {Meta} meta
 */
function readme(opts, meta) {
  const bundler = BUNDLERS[opts.bundler];
  const pm = opts.packageManager;
  const run = (script) =>
    pm === 'npm' ? `npm run ${script}` : `${pm} ${script}`;

  return `# ${meta.name}

A [TurboWarp](https://turbowarp.org) / Scratch extension, bundled with **${bundler.label}** via [\`${bundler.plugin}\`](https://www.npmjs.com/package/${bundler.plugin}).

## Develop

\`\`\`sh
${run('dev')}
\`\`\`

Rebuilds \`dist/${meta.id}.js\` whenever you change a file in \`src/\`.

## Build

\`\`\`sh
${run('build')}
\`\`\`

Produces \`dist/${meta.id}.js\` — a single self-contained file.

## Load it into TurboWarp

1. Open the [TurboWarp editor](https://turbowarp.org/editor).
2. Click the **Add Extension** button (bottom-left).
3. Choose **Custom Extension**, then the **Files** tab, and select
   \`dist/${meta.id}.js\` (or paste its contents into the **Text** tab).

## Project layout

\`\`\`
${bundler.configFile}   ${' '.repeat(Math.max(0, 18 - bundler.configFile.length))}# bundler + scratch4js plugin config
src/index.js         # extension class (export default)
src/blocks/greeting.js  # example helper module
src/icon.svg         # menu icon (inlined as a data: URI)
\`\`\`

Add more blocks by editing \`getInfo().blocks\` and adding the matching methods
in \`src/index.js\`. Split logic across as many files in \`src/\` as you like — the
bundler inlines them all into the single output file.
${
  opts.types
    ? `
## Types

\`${TYPES_PACKAGE}\` provides the global \`Scratch\` API types, wired up through
\`jsconfig.json\`. Your editor will autocomplete \`Scratch.BlockType\`,
\`Scratch.ArgumentType\`, and friends.
`
    : ''
}`;
}

const GITIGNORE = `node_modules
dist
*.log
.DS_Store
`;

// The scratch4js logo, used as the starter menu icon. Inlined verbatim so the
// published scaffolder doesn't depend on any sibling example files.
const ICON_SVG = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="66.56603" height="59.29033" viewBox="0,0,66.56603,59.29033"><g transform="translate(-206.62538,-150.45522)"><g data-paper-data="{&quot;isPaintingLayer&quot;:true}" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" stroke-dasharray="" stroke-dashoffset="0" style="mix-blend-mode: normal"><path d="M249.19141,150.95445c0.3,-0.2 0.8,-0.1 0.9,0.3l2.6,10.7c0,0 6.4,4.7 8.3,8c3.2,5.5 3.3,10 3.3,10c0,0 7.1,2.1 8.3,7.8c1.2,5.7 -3.2,16.5 -22,20.2c-18.8,3.7 -33.9,-1.4 -41,-12.8c-7.1,-11.4 4.1,-25 3.5,-24.2l-2.1,-17.9c-0.1,-0.4 0.4,-0.7 0.8,-0.5l12.1,7.9c0,0 4.5,-1.7 9.2,-1.9c2.8,-0.2 5.2,0 7.5,0.4z" fill="#eed94d" fill-rule="evenodd" stroke="#001026" stroke-width="1.2"/><path d="M226.53685,195.91284c-1.95918,-0.14404 -3.7526,-0.93813 -5.01961,-2.22259c-0.74073,-0.75094 -1.69094,-2.20443 -1.53226,-2.34384c0.15215,-0.13367 3.90404,-2.36881 3.97627,-2.36881c0.04409,0 0.18223,0.18034 0.307,0.40076c0.97893,1.72947 2.17132,2.37191 3.77245,2.03254c1.13043,-0.2396 1.6642,-0.93441 1.81455,-2.36202c0.04539,-0.43102 0.07637,-4.14485 0.07716,-9.25051l0.00132,-8.53038h2.48087h2.48087l-0.00236,9.02656c-0.00139,5.31546 -0.03252,9.25891 -0.07571,9.59172c-0.54308,4.18393 -3.55249,6.37417 -8.28056,6.02657zM245.80613,195.91826c-3.35595,-0.23338 -5.97292,-1.66746 -7.63754,-4.1853c-0.28879,-0.43681 -0.52507,-0.81644 -0.52507,-0.84363c0,-0.04784 3.74228,-2.24033 3.97893,-2.33115c0.08226,-0.03157 0.2047,0.08696 0.41019,0.39713c0.71296,1.07611 1.75039,1.91241 2.83342,2.2841c0.79472,0.27274 2.24201,0.34261 3.00083,0.14486c1.41678,-0.36921 2.16762,-1.18962 2.16762,-2.3685c0,-1.27426 -0.72237,-1.99732 -3.00316,-3.00605c-0.56606,-0.25035 -1.53886,-0.68018 -2.16177,-0.95517c-3.19283,-1.40951 -4.74646,-2.89592 -5.43797,-5.20269c-0.27047,-0.90225 -0.34715,-2.6508 -0.15665,-3.57195c0.27044,-1.30773 0.7924,-2.2633 1.7578,-3.21806c1.06651,-1.05477 2.22534,-1.62897 3.86254,-1.91393c0.99381,-0.17297 3.04125,-0.11399 3.95366,0.1139c1.80654,0.45122 3.23647,1.46797 4.31691,3.06957l0.43096,0.63883l-0.1956,0.15267c-0.10758,0.08397 -0.98221,0.65713 -1.94362,1.2737l-1.74802,1.12103l-0.346,-0.52046c-0.69357,-1.04328 -1.48798,-1.52364 -2.62719,-1.58859c-1.19555,-0.06817 -2.00634,0.32696 -2.42645,1.18249c-0.18266,0.37198 -0.21514,0.52999 -0.20967,1.01981c0.01548,1.38413 0.66592,1.93419 3.96291,3.35132c2.5383,1.09102 3.88257,1.87776 4.94874,2.89626c1.48739,1.42089 2.10109,3.06361 2.01226,5.38631c-0.04908,1.28324 -0.17189,1.80483 -0.66777,2.83594c-1.27942,2.66036 -4.52583,4.11742 -8.55027,3.83755z" fill="#31322f" fill-rule="nonzero" stroke="none" stroke-width="1"/></g></g></svg>`;
