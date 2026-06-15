import { createEditor } from 'browser-ide-kit';

/**
 * Create the web-editor instance that backs one project. It boots a
 * WebContainer, mounts the project's files, and rebuilds on save using the
 * record's stored build descriptor (a template's, or null for a clone with no
 * known build).
 *
 * @param {import('./db.js').ProjectRecord} record
 */
export function createProjectEditor(record) {
  return createEditor({
    name: record.name,
    serveDir: 'dist',
    createProject: () => ({
      files: record.files,
      entryFile: record.entryFile ?? Object.keys(record.files)[0] ?? null,
      project: { id: record.id, name: record.name },
      build: record.build ?? null,
    }),
  });
}
