// web-editor — reusable in-browser IDE building blocks.

// Editor instance + context
export { createEditor } from './createEditor.js';
export { WebContainerEngine, toFileSystemTree } from './engine.js';
export {
  EditorProvider,
  useEditorApi,
  useEditorState,
} from './editorContext.jsx';

// Components
export { SplitPane } from './layout/SplitPane.jsx';
export { Panel } from './layout/Panel.jsx';
export { CodeEditor } from './editor/CodeEditor.jsx';
export { TerminalPanel } from './Terminal.jsx';
export { FileTree } from './FileTree.jsx';
export {
  Button,
  IconButton,
  Tooltip,
  TooltipProvider,
  Switch,
  StatusBadge,
} from './ui.jsx';

// Helpers
export { fileIcon, folderIcon } from './icons.js';
