import { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  Hammer,
} from 'lucide-react';
import {
  Button,
  IconButton,
  StatusBadge,
  Switch,
  Tooltip,
  useEditorApi,
  useEditorState,
} from 'browser-ide-kit';

import { turbowarpExtensionUrl } from '../lib/turbowarp.js';
import { navigate } from '../router.js';

export function TopBar() {
  const { actions } = useEditorApi();
  const { project, status, built, autoBuild, previewUrl } = useEditorState();
  const [copied, setCopied] = useState(false);

  const busy =
    status === 'building' || status === 'booting' || status === 'installing';
  const canBuild =
    status === 'ready' || status === 'built' || status === 'error';

  const copy = async () => {
    if (!built) return;
    try {
      await navigator.clipboard.writeText(built.contents);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  };

  const download = () => {
    if (!built || !project) return;
    const a = document.createElement('a');
    a.href = built.url;
    a.download = `${project.id}.js`;
    a.click();
  };

  // TurboWarp refuses to be iframed as an editor, so we open it in a new tab.
  // It loads the extension from the in-container server URL (short, avoids the
  // Cloudflare 520 a giant data: URL triggers), falling back to a data: URL.
  const openInTurboWarp = () => {
    if (!built || !project) return;
    const url = turbowarpExtensionUrl(built.contents, {
      previewUrl,
      filename: `${project.id}.js`,
    });
    window.open(url, '_blank', 'noopener');
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface-1 px-3">
      <Tooltip label="Back to dashboard">
        <IconButton
          aria-label="Back to dashboard"
          variant="surface"
          onClick={() => navigate('/dashboard')}
        >
          <ArrowLeft size={16} />
        </IconButton>
      </Tooltip>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-fg">
          {project ? project.name : 'Loading…'}
        </div>
        <div className="text-[11px] text-fg-subtle">
          {project ? `${project.bundler} · ${project.packageManager}` : ''}
        </div>
      </div>

      <div className="ml-2">
        <StatusBadge status={status} />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted select-none">
          <Switch
            id="autobuild"
            checked={autoBuild}
            onCheckedChange={actions.setAutoBuild}
          />
          Auto-build on save
        </label>

        <div className="h-5 w-px bg-border" />

        <Tooltip label="Copy the extension source">
          <Button variant="ghost" onClick={copy} disabled={!built}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </Tooltip>
        <Tooltip label={project ? `Download ${project.id}.js` : 'Download'}>
          <Button variant="ghost" onClick={download} disabled={!built}>
            <Download size={14} />
            Download
          </Button>
        </Tooltip>
        <Tooltip label="Open in TurboWarp (new tab) with this extension loaded">
          <Button variant="surface" onClick={openInTurboWarp} disabled={!built}>
            <ExternalLink size={14} />
            Open in TurboWarp
          </Button>
        </Tooltip>

        <Button
          variant="primary"
          onClick={actions.build}
          disabled={!canBuild}
          className="min-w-24"
        >
          <Hammer size={14} />
          {busy ? 'Working…' : 'Build'}
        </Button>
      </div>
    </header>
  );
}
