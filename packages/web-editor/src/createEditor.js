import { WebContainerEngine } from './engine.js';

/** Minimal external store for useSyncExternalStore. */
function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set: (patch) => {
      state = {
        ...state,
        ...(typeof patch === 'function' ? patch(state) : patch),
      };
      subs.forEach((f) => f());
    },
    subscribe: (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

/**
 * Create an editor instance: a state store + actions wired to a
 * {@link WebContainerEngine}, parameterized by the consuming app.
 *
 * @param {object} config
 * @param {string} config.name  human label for the project
 * @param {(name: string) => {
 *   files: Record<string,string>,
 *   entryFile?: string,
 *   project?: object,
 *   build: { command: string[], outputPath: string, mimeType?: string, label?: string },
 * }} config.createProject  produce the starter project + build descriptor
 * @param {string} [config.serveDir]  build-output dir the preview server serves
 * @param {{ extraLibs?: {content:string, filePath?:string}[] }} [config.monaco]
 *   extra ambient TypeScript libs to register with Monaco (e.g. host globals)
 * @returns {{ store: any, actions: any, engine: WebContainerEngine, config: object }}
 */
export function createEditor(config) {
  const engine = new WebContainerEngine({
    serveDir: config.serveDir,
    installCommand: config.installCommand,
  });

  const store = createStore({
    /** flat in-memory source of truth: { path: contents } */
    files: {},
    /** @type {string|null} */
    activeFile: null,
    /** ordered paths of files open as editor tabs @type {string[]} */
    openFiles: [],
    /** project metadata returned by createProject */
    project: null,
    /** build descriptor: { command, outputPath, mimeType, label } */
    build: null,
    /** engine status: idle|booting|installing|ready|building|built|error */
    status: 'idle',
    /** @type {{contents:string,url:string,builtAt:number}|null} */
    built: null,
    /** cross-origin URL of the in-container preview server */
    previewUrl: null,
    autoBuild: true,
    booted: false,
  });

  /** @type {Record<string, ReturnType<typeof setTimeout>>} */
  const writeTimers = {};
  let buildPending = false;

  const actions = {
    async init() {
      if (store.get().booted) return;
      const result = config.createProject(config.name);
      const entryFile =
        result.entryFile ?? Object.keys(result.files)[0] ?? null;
      store.set({
        files: result.files,
        project: result.project ?? null,
        build: result.build,
        activeFile: entryFile,
        openFiles: entryFile ? [entryFile] : [],
        booted: true,
      });

      engine.onStatus((status) => store.set({ status }));
      engine.onPreviewUrl((previewUrl) => store.set({ previewUrl }));

      try {
        await engine.start(result.files, config.name);
        if (store.get().autoBuild) actions.build();
      } catch {
        /* status + terminal output already reflect the failure */
      }
    },

    /** Activate a file, opening it as a tab if it isn't already. */
    setActive(path) {
      store.set((s) => ({
        activeFile: path,
        openFiles: s.openFiles.includes(path)
          ? s.openFiles
          : [...s.openFiles, path],
      }));
    },

    /** Close an editor tab; if it was active, fall back to a neighbouring tab. */
    closeFile(path) {
      store.set((s) => {
        const idx = s.openFiles.indexOf(path);
        if (idx === -1) return {};
        const openFiles = s.openFiles.filter((p) => p !== path);
        const activeFile =
          s.activeFile === path
            ? (openFiles[idx] ?? openFiles[idx - 1] ?? null)
            : s.activeFile;
        return { openFiles, activeFile };
      });
    },

    updateFile(path, contents) {
      store.set((s) => ({ files: { ...s.files, [path]: contents } }));
      clearTimeout(writeTimers[path]);
      writeTimers[path] = setTimeout(async () => {
        try {
          await engine.writeFile(path, contents);
          if (store.get().autoBuild) actions.build();
        } catch {
          /* container may not be ready yet; next save retries */
        }
      }, 600);
    },

    async addFile(path, contents = '') {
      if (store.get().files[path] != null) return;
      store.set((s) => ({
        files: { ...s.files, [path]: contents },
        activeFile: path,
        openFiles: s.openFiles.includes(path)
          ? s.openFiles
          : [...s.openFiles, path],
      }));
      try {
        await engine.addFile(path, contents);
      } catch {
        /* not ready yet */
      }
    },

    async deleteFile(path) {
      store.set((s) => {
        const files = { ...s.files };
        delete files[path];
        const openFiles = s.openFiles.filter((p) => p !== path);
        const activeFile =
          s.activeFile === path
            ? (openFiles.at(-1) ?? Object.keys(files)[0] ?? null)
            : s.activeFile;
        return { files, openFiles, activeFile };
      });
      try {
        await engine.removeFile(path);
      } catch {
        /* not ready yet */
      }
    },

    setAutoBuild(value) {
      store.set({ autoBuild: Boolean(value) });
    },

    async build() {
      const { status, build } = store.get();
      if (!build) return;
      if (status === 'idle' || status === 'booting' || status === 'installing')
        return;
      if (status === 'building') {
        buildPending = true; // coalesce — rebuild once the current one finishes
        return;
      }
      try {
        const { contents } = await engine.build(build);
        if (contents != null) {
          store.set((s) => {
            if (s.built?.url) URL.revokeObjectURL(s.built.url);
            const url = URL.createObjectURL(
              new Blob([contents], { type: build.mimeType ?? 'text/plain' }),
            );
            return { built: { contents, url, builtAt: Date.now() } };
          });
        }
      } finally {
        if (buildPending) {
          buildPending = false;
          actions.build();
        }
      }
    },
  };

  return { store, actions, engine, config };
}
