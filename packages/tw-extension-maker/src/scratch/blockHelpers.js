// Minimal replacements for scratch-gui's themes/blockHelpers. We don't recolor
// extension blocks per-theme — extensions declare their own colours via
// getInfo().color1/2/3, which we keep. These passthroughs let the vendored
// make-toolbox-xml / define-dynamic-block files work without pulling in
// scratch-gui's whole theme system.

/** @param {object} json @returns {object} */
export function injectExtensionBlockTheme(json) {
  return json;
}

/** @param {string} categoriesXML @returns {string} */
export function injectExtensionCategoryTheme(categoriesXML) {
  return categoriesXML;
}
