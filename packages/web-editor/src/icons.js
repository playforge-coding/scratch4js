// Seti file icons (https://github.com/jesseweed/seti-ui). Each SVG carries its
// Seti colour. We eagerly import the whole set as URLs and map file
// names/extensions onto the appropriate icon, falling back to `default`.

// `sync` (not `eager`) so each module resolves to the URL synchronously — `eager`
// returns a Promise per module.
const ctx = import.meta.webpackContext('../icons', {
  regExp: /\.svg$/,
  mode: 'sync',
});

/** @type {Record<string, string>} icon name → asset URL */
const ICONS = {};
for (const key of ctx.keys()) {
  const name = key.replace(/^\.\//, '').replace(/\.svg$/, '');
  const mod = ctx(key);
  ICONS[name] = mod.default ?? mod;
}

// Exact file names (case-insensitive) → icon.
const BY_FILENAME = {
  'package.json': 'npm',
  'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm',
  '.npmrc': 'npm',
  '.npmignore': 'npm_ignored',
  'yarn.lock': 'yarn',
  'pnpm-lock.yaml': 'yarn',
  'pnpm-workspace.yaml': 'yarn',
  '.gitignore': 'git_ignore',
  '.gitattributes': 'git',
  '.gitmodules': 'git',
  '.git': 'git',
  'tsconfig.json': 'tsconfig',
  'jsconfig.json': 'tsconfig',
  '.babelrc': 'babel',
  'babel.config.js': 'babel',
  '.eslintrc': 'eslint',
  '.eslintrc.js': 'eslint',
  '.eslintrc.json': 'eslint',
  'eslint.config.js': 'eslint',
  'eslint.config.mjs': 'eslint',
  '.editorconfig': 'editorconfig',
  '.stylelintrc': 'stylelint',
  dockerfile: 'docker',
  '.dockerignore': 'docker',
  makefile: 'makefile',
  'cargo.toml': 'rust',
  'go.mod': 'go',
  'go.sum': 'go',
  'webpack.config.js': 'webpack',
  'rspack.config.js': 'webpack',
  'rsbuild.config.js': 'webpack',
  'rsbuild.config.mjs': 'webpack',
  'rollup.config.js': 'rollup',
  'rollup.config.mjs': 'rollup',
  'vite.config.js': 'vite',
  'vite.config.mjs': 'vite',
  license: 'license',
  'license.md': 'license',
  'readme.md': 'info',
  '.prettierrc': 'config',
  '.prettierignore': 'config',
  '.env': 'config',
  'gulpfile.js': 'gulp',
  'gruntfile.js': 'grunt',
};

// File extension → icon.
const BY_EXT = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  es6: 'javascript',
  jsx: 'react',
  ts: 'typescript',
  tsx: 'react',
  mts: 'typescript',
  cts: 'typescript',
  json: 'json',
  json5: 'json',
  jsonc: 'json',
  svg: 'svg',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  css: 'css',
  scss: 'sass',
  sass: 'sass',
  less: 'less',
  styl: 'stylus',
  vue: 'vue',
  svelte: 'svelte',
  py: 'python',
  rb: 'ruby',
  php: 'php',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'c-sharp',
  fs: 'f-sharp',
  ex: 'elixir',
  exs: 'elixir_script',
  elm: 'elm',
  clj: 'clojure',
  hs: 'haskell',
  lua: 'lua',
  pl: 'perl',
  r: 'R',
  dart: 'dart',
  scala: 'scala',
  zig: 'zig',
  nim: 'nim',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ps1: 'powershell',
  yml: 'yml',
  yaml: 'yml',
  toml: 'config',
  ini: 'config',
  cfg: 'config',
  conf: 'config',
  env: 'config',
  lock: 'lock',
  wasm: 'wasm',
  wat: 'wat',
  sql: 'db',
  db: 'db',
  graphql: 'graphql',
  gql: 'graphql',
  prisma: 'prisma',
  dockerfile: 'docker',
  tf: 'terraform',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  ico: 'favicon',
  bmp: 'image',
  avif: 'image',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  flac: 'audio',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  pdf: 'pdf',
  zip: 'zip',
  gz: 'zip',
  tar: 'zip',
  rar: 'zip',
  ttf: 'font',
  otf: 'font',
  woff: 'font',
  woff2: 'font',
  eot: 'font',
  doc: 'word',
  docx: 'word',
  xls: 'xls',
  xlsx: 'xls',
  csv: 'csv',
  txt: 'default',
};

/**
 * Resolve a file path to a Seti icon asset URL.
 *
 * @param {string} path
 * @returns {string}
 */
export function fileIcon(path) {
  const base = (path.split('/').pop() || '').toLowerCase();
  if (BY_FILENAME[base]) return ICONS[BY_FILENAME[base]] || ICONS.default;
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : '';
  const name = BY_EXT[ext];
  return (name && ICONS[name]) || ICONS.default;
}

/** Folder icon asset URL (open/closed share the same glyph here). */
export function folderIcon() {
  return ICONS.folder;
}
