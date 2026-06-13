// The `colours` object passed to ScratchBlocks.inject() — it themes the whole
// workspace (palette, flyout, scrollbars, grid) plus every block category.
// Derived from scratch-gui's dark theme (src/lib/themes/{gui,blocks}/dark.js),
// retuned to web-editor's palette (see styles.css tokens) so the blocks editor
// matches the rest of the app rather than scratch-gui.

// web-editor palette
const SURFACE_0 = '#0e0f13';
const SURFACE_1 = '#16181f';
const SURFACE_2 = '#1d2029';
const SURFACE_3 = '#272b36';
const BORDER = '#2c303b';
const FG = '#e6e8ef';
const FG_MUTED = '#9aa1b2';
const ACCENT = '#6b5cff';

// Per-category block colours (primary = block body on dark, tertiary = accent).
const category = (tertiary, primary) => ({
  primary,
  secondary: '#3a3f4d',
  tertiary,
  quaternary: tertiary,
});

export const BLOCKS_DARK_COLOURS = {
  // Workspace chrome
  workspace: SURFACE_1,
  toolbox: SURFACE_0,
  toolboxSelected: SURFACE_2,
  toolboxText: FG_MUTED,
  flyout: SURFACE_0,
  flyoutLabelColor: FG_MUTED,
  scrollbar: '#3a3f4d',
  scrollbarHover: '#4a5060',
  insertionMarker: FG,
  insertionMarkerOpacity: 0.3,
  fieldShadow: 'rgba(0,0,0,0.3)',
  dragShadowOpacity: 0.4,
  gridColor: '#23262f',
  stackGlow: ACCENT,
  // Value-report bubbles / context menus
  valueReportBackground: SURFACE_2,
  valueReportBorder: BORDER,
  valueReportForeground: FG,
  contextMenuBackground: SURFACE_2,
  contextMenuBorder: '#ffffff26',
  contextMenuForeground: FG,
  contextMenuActiveBackground: SURFACE_3,
  contextMenuDisabledForeground: '#666666',
  checkboxInactiveBackground: SURFACE_2,
  checkboxInactiveBorder: '#c8c8c8',
  buttonBorder: BORDER,
  buttonActiveBackground: SURFACE_2,
  buttonForeground: FG_MUTED,
  zoomIconFilter: 'invert(100%)',
  // Text
  text: 'rgba(255,255,255,0.85)',
  textField: '#3a3f4d',
  textFieldText: FG,
  menuHover: 'rgba(255,255,255,0.3)',
  // Categories (Scratch standard hues, dark bodies)
  motion: category('#4C97FF', '#0F1E33'),
  looks: category('#9966FF', '#1E1433'),
  sounds: category('#CF63CF', '#291329'),
  control: category('#FFAB19', '#332205'),
  event: category('#FFBF00', '#332600'),
  sensing: category('#5CB1D6', '#12232A'),
  pen: category('#0FBD8C', '#03251C'),
  operators: category('#59C059', '#112611'),
  data: category('#FF8C1A', '#331C05'),
  data_lists: category('#FF661A', '#331405'),
  more: category('#FF6680', '#331419'),
};
