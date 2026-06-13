// A no-op Rspack/webpack loader. scratch-vm references its sandboxed-extension
// worker via webpack-4-specific inline loaders (`worker-loader!…`). We always
// load extensions UNSANDBOXED, so that worker is never constructed — this loader
// replaces the module body with a harmless no-op constructor so the build
// doesn't try to honor the webpack-4 loader machinery.
module.exports = function () {
  return 'module.exports = function NoopExtensionWorker() {};\nmodule.exports.default = module.exports;\n';
};
