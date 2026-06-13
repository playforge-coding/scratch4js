import { createContext, useContext, useSyncExternalStore } from 'react';

/**
 * Carries the editor instance produced by `createEditor()` — its store, actions,
 * engine, and config — down to the generic components (FileTree, CodeEditor,
 * Terminal, …) so they aren't bound to a singleton. Apps wrap their UI in
 * <EditorProvider editor={createEditor(...)}>.
 */
const EditorContext = createContext(null);

export function EditorProvider({ editor, children }) {
  return (
    <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
  );
}

/** The full editor instance: `{ store, actions, engine, config }`. */
export function useEditorApi() {
  const editor = useContext(EditorContext);
  if (!editor)
    throw new Error('useEditorApi must be used within <EditorProvider>');
  return editor;
}

/** Subscribe to editor state (files, activeFile, status, built, previewUrl, …). */
export function useEditorState() {
  const { store } = useEditorApi();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
