import { RotateCw } from 'lucide-react';
import {
  IconButton,
  Switch,
  Tooltip,
  useEditorApi,
  useEditorState,
} from 'web-editor';

/**
 * Live preview of the built project. The engine reads the build's single output
 * file back and hands us a blob: URL in `built.url`; we just point an iframe at
 * it. A small toolbar exposes the auto-build toggle and a manual rebuild.
 */
export function Preview() {
  const { actions } = useEditorApi();
  const { built, autoBuild, status } = useEditorState();
  const building = status === 'building';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-2 py-1.5">
        <label className="flex items-center gap-1.5 text-xs text-fg-muted select-none">
          <Switch
            checked={autoBuild}
            onCheckedChange={(v) => actions.setAutoBuild(v)}
          />
          Auto-build
        </label>
        <Tooltip label="Rebuild now">
          <IconButton
            aria-label="Rebuild now"
            disabled={building}
            onClick={() => actions.build()}
          >
            <RotateCw size={14} className={building ? 'animate-spin' : ''} />
          </IconButton>
        </Tooltip>
      </div>
      <div className="min-h-0 flex-1 bg-white">
        {built?.url ? (
          <iframe
            key={built.builtAt}
            src={built.url}
            title="Preview"
            className="h-full w-full border-0"
            sandbox="allow-scripts"
          />
        ) : (
          <div className="grid h-full place-items-center bg-surface-0 text-sm text-fg-subtle">
            {building ? 'Building…' : 'Edit a file to build the preview.'}
          </div>
        )}
      </div>
    </div>
  );
}
