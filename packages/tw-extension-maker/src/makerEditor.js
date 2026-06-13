import { createEditor } from 'web-editor';

import { buildDescriptor, installCommand } from './template.js';

/**
 * Create a web-editor instance for a stored project record: its files come from
 * IndexedDB, and the install / build commands follow the record's chosen
 * package manager and (via the generated package.json) bundler.
 *
 * @param {import('./db.js').ProjectRecord & { extensionId: string }} record
 */
export function createMakerEditor(record) {
  return createEditor({
    name: record.name,
    serveDir: 'dist',
    installCommand: installCommand(record.packageManager),
    createProject: () => ({
      files: record.files,
      entryFile: 'src/index.js',
      project: {
        id: record.extensionId,
        name: record.name,
        bundler: record.bundler,
        packageManager: record.packageManager,
      },
      build: buildDescriptor({
        id: record.extensionId,
        name: record.name,
        packageManager: record.packageManager,
      }),
    }),
    monaco: {
      extraLibs: [
        {
          content: 'declare const Scratch: any;',
          filePath: 'ts:scratch-global.d.ts',
        },
      ],
    },
  });
}
