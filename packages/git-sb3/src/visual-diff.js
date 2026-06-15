/**
 * Visual diffing of two project versions. Scripts are rendered to real
 * scratchblocks SVGs (see {@link module:render}); added and removed scripts are
 * tinted by injecting a translucent background rect into the SVG, and scripts
 * that changed are shown old-vs-new with a precise scratchblocks text diff so
 * you can see exactly which blocks moved. The result is a self-contained HTML
 * report.
 *
 * @module visual-diff
 */
import { diffArrays } from 'diff';
import { createRenderer } from './render.js';
import { targetScripts } from './blocks.js';

const ADDED_TINT = 'rgba(76, 175, 80, 0.16)';
const REMOVED_TINT = 'rgba(244, 67, 54, 0.16)';
const SIMILARITY_THRESHOLD = 0.35;

/**
 * Compute a structured diff between two parsed project.json objects.
 *
 * @param {object} oldJson - Previous project.json (or null for a new project).
 * @param {object} newJson - Current project.json.
 * @param {object} [options]
 * @param {string} [options.language='en']
 * @returns {object} A diff model consumed by {@link renderReport}.
 */
export function diffProjects(oldJson, newJson, { language = 'en' } = {}) {
  const oldTargets = indexTargets(oldJson);
  const newTargets = indexTargets(newJson);
  const names = orderedUnion(oldTargets, newTargets);

  const targets = [];
  let changedScripts = 0;
  let addedScripts = 0;
  let removedScripts = 0;

  for (const name of names) {
    const before = oldTargets.get(name);
    const after = newTargets.get(name);

    let status = 'changed';
    if (!before) status = 'added';
    else if (!after) status = 'removed';

    const oldScripts = before ? targetScripts(before, { language }) : [];
    const newScripts = after ? targetScripts(after, { language }) : [];
    const scriptDiff = diffScripts(oldScripts, newScripts);

    addedScripts += scriptDiff.added.length;
    removedScripts += scriptDiff.removed.length;
    changedScripts += scriptDiff.changed.length;

    const assets = diffAssets(before, after);

    const hasChanges =
      status !== 'changed' ||
      scriptDiff.added.length ||
      scriptDiff.removed.length ||
      scriptDiff.changed.length ||
      assets.added.length ||
      assets.removed.length;

    targets.push({
      name: after ? targetLabel(after) : targetLabel(before),
      isStage: (after || before).isStage,
      status,
      scripts: scriptDiff,
      assets,
      hasChanges,
    });
  }

  return {
    targets,
    summary: {
      addedScripts,
      removedScripts,
      changedScripts,
      changedTargets: targets.filter((t) => t.hasChanges).length,
    },
  };
}

/**
 * Match scripts between two versions of a target and classify each as added,
 * removed, unchanged, or changed (paired by similarity).
 *
 * @param {import('./blocks.js').Script[]} oldScripts
 * @param {import('./blocks.js').Script[]} newScripts
 * @returns {{ added: object[], removed: object[], unchanged: object[], changed: object[] }}
 */
function diffScripts(oldScripts, newScripts) {
  const remainingOld = [...oldScripts];
  const remainingNew = [...newScripts];
  const unchanged = [];

  // 1. Pull out byte-identical scripts (order-independent).
  for (let i = remainingNew.length - 1; i >= 0; i--) {
    const match = remainingOld.findIndex(
      (s) => s.code === remainingNew[i].code,
    );
    if (match >= 0) {
      unchanged.push(remainingNew[i]);
      remainingOld.splice(match, 1);
      remainingNew.splice(i, 1);
    }
  }

  // 2. Pair the rest by best similarity; leftovers are pure add/remove.
  const changed = [];
  for (let i = remainingNew.length - 1; i >= 0; i--) {
    let best = -1;
    let bestScore = SIMILARITY_THRESHOLD;
    for (let j = 0; j < remainingOld.length; j++) {
      const score = similarity(remainingOld[j].code, remainingNew[i].code);
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    }
    if (best >= 0) {
      changed.push({ old: remainingOld[best], new: remainingNew[i] });
      remainingOld.splice(best, 1);
      remainingNew.splice(i, 1);
    }
  }

  return {
    added: remainingNew.reverse(),
    removed: remainingOld,
    unchanged,
    changed: changed.reverse(),
  };
}

/**
 * Line-overlap similarity of two scratchblocks scripts, in [0, 1].
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function similarity(a, b) {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  let common = 0;
  for (const part of diffArrays(aLines, bLines)) {
    if (!part.added && !part.removed) common += part.count || 0;
  }
  return (2 * common) / (aLines.length + bLines.length || 1);
}

/**
 * Diff a target's costume and sound lists by name+md5.
 *
 * @param {object} before
 * @param {object} after
 * @returns {{ added: string[], removed: string[] }}
 */
function diffAssets(before, after) {
  const list = (t) =>
    t
      ? [...(t.costumes || []), ...(t.sounds || [])].map(
          (m) => `${m.name} (${m.md5ext})`,
        )
      : [];
  const beforeSet = new Set(list(before));
  const afterSet = new Set(list(after));
  return {
    added: [...afterSet].filter((m) => !beforeSet.has(m)),
    removed: [...beforeSet].filter((m) => !afterSet.has(m)),
  };
}

/* ------------------------------------------------------------------ report */

/**
 * Render the inner report content (header + per-target sections) for a diff
 * model. This is the part that changes between versions, so the live server
 * re-renders just this and swaps it into the open page without reloading the
 * stylesheet.
 *
 * @param {object} model - Output of {@link diffProjects}.
 * @param {import('./render.js').Renderer} renderer - Reused across re-renders.
 * @param {object} [options]
 * @param {string} [options.title='git4sb3 diff'] - Heading text.
 * @param {string} [options.oldLabel='old'] - Label for the previous version.
 * @param {string} [options.newLabel='new'] - Label for the current version.
 * @returns {string} HTML for the report body (no `<html>`/`<head>`).
 */
export function renderDiffBody(model, renderer, options = {}) {
  const {
    title = 'git4sb3 diff',
    oldLabel = 'old',
    newLabel = 'new',
  } = options;

  const sections = model.targets
    .filter((t) => t.hasChanges)
    .map((t) => renderTargetSection(t, renderer, { oldLabel, newLabel }))
    .join('\n');

  const s = model.summary;
  const summary =
    `${s.changedTargets} target(s) changed · ` +
    `+${s.addedScripts} / −${s.removedScripts} script(s) · ` +
    `${s.changedScripts} modified`;

  return `<header>
  <h1>${escapeHtml(title)}</h1>
  <p class="summary">${escapeHtml(summary)}</p>
  <p class="legend">
    <span class="chip added">added (${escapeHtml(newLabel)})</span>
    <span class="chip removed">removed (${escapeHtml(oldLabel)})</span>
    <span class="chip changed">modified</span>
  </p>
</header>
${sections || '<p class="empty">No script or asset changes.</p>'}`;
}

/**
 * The combined stylesheet a report page needs: the report layout CSS plus the
 * scratchblocks block styles from the renderer.
 *
 * @param {import('./render.js').Renderer} renderer
 * @returns {string}
 */
export function reportStyles(renderer) {
  return `${REPORT_CSS}\n${renderer.styleSheet()}`;
}

/**
 * Wrap report body HTML in a complete, standalone HTML document.
 *
 * @param {object} args
 * @param {string} args.title - Document title.
 * @param {string} args.styles - Stylesheet (see {@link reportStyles}).
 * @param {string} args.body - Report body (see {@link renderDiffBody}).
 * @param {boolean} [args.live=false] - Inject the live-refresh client + badge.
 * @returns {string}
 */
export function wrapReportPage({ title, styles, body, live = false }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${styles}</style>
</head>
<body>
${live ? '<div id="g4-live" data-state="connecting">○ connecting…</div>' : ''}
<div id="g4-report">
${body}
</div>
${live ? `<script>${LIVE_CLIENT_SCRIPT}</script>` : ''}
</body>
</html>
`;
}

/**
 * Render a diff model into a complete, standalone HTML page.
 *
 * @param {object} model - Output of {@link diffProjects}.
 * @param {object} [options]
 * @param {string} [options.title='git4sb3 diff'] - Page title.
 * @param {string} [options.oldLabel='old'] - Label for the previous version.
 * @param {string} [options.newLabel='new'] - Label for the current version.
 * @param {boolean} [options.live=false] - Inject the live-refresh client.
 * @returns {string} A complete HTML document.
 */
export function renderReport(model, options = {}) {
  const {
    title = 'git4sb3 diff',
    oldLabel = 'old',
    newLabel = 'new',
    live = false,
  } = options;
  const renderer = createRenderer();
  const body = renderDiffBody(model, renderer, { title, oldLabel, newLabel });
  return wrapReportPage({
    title,
    styles: reportStyles(renderer),
    body,
    live,
  });
}

/**
 * Browser-side client injected into a live report. Connects back to the
 * serving origin over WebSocket and swaps `#g4-report`'s contents whenever the
 * server pushes a re-rendered body (on file save or a userscript project push).
 * The stylesheet stays in `<head>`, so only the changed markup is replaced.
 */
const LIVE_CLIENT_SCRIPT = `(function () {
  var root = document.getElementById('g4-report');
  var badge = document.getElementById('g4-live');
  function setState(state, text) {
    if (!badge) return;
    badge.dataset.state = state;
    badge.textContent = text;
  }
  var ws, retry;
  function connect() {
    setState('connecting', '○ connecting…');
    ws = new WebSocket('ws://' + location.host + '/');
    ws.onopen = function () { setState('connected', '● live'); };
    ws.onmessage = function (event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      if (msg && (msg.type === 'update' || msg.type === 'init') && typeof msg.html === 'string') {
        root.innerHTML = msg.html;
      }
    };
    ws.onclose = function () {
      setState('reconnecting', '○ reconnecting…');
      clearTimeout(retry);
      retry = setTimeout(connect, 1000);
    };
    ws.onerror = function () {};
  }
  connect();
})();`;

/**
 * Render the report section for one target.
 *
 * @param {object} target - A target entry from the diff model.
 * @param {import('./render.js').Renderer} renderer
 * @param {{ oldLabel: string, newLabel: string }} labels
 * @returns {string}
 */
function renderTargetSection(target, renderer, labels) {
  const parts = [];
  const badge =
    target.status === 'added'
      ? '<span class="chip added">new</span>'
      : target.status === 'removed'
        ? '<span class="chip removed">deleted</span>'
        : '';
  parts.push(
    `<section class="target"><h2>${escapeHtml(target.name)} ${badge}</h2>`,
  );

  const { assets } = target;
  if (assets.added.length || assets.removed.length) {
    parts.push('<ul class="assets">');
    for (const a of assets.added)
      parts.push(`<li class="added">+ ${escapeHtml(a)}</li>`);
    for (const a of assets.removed)
      parts.push(`<li class="removed">− ${escapeHtml(a)}</li>`);
    parts.push('</ul>');
  }

  for (const pair of target.scripts.changed) {
    parts.push(renderChangedScript(pair, renderer, labels));
  }
  for (const script of target.scripts.added) {
    parts.push(renderSingleScript(script, renderer, 'added', 'Added script'));
  }
  for (const script of target.scripts.removed) {
    parts.push(
      renderSingleScript(script, renderer, 'removed', 'Removed script'),
    );
  }

  if (
    !target.scripts.changed.length &&
    !target.scripts.added.length &&
    !target.scripts.removed.length &&
    !assets.added.length &&
    !assets.removed.length
  ) {
    parts.push('<p class="empty">No script changes.</p>');
  }

  parts.push('</section>');
  return parts.join('\n');
}

/**
 * Render an added or removed script as a tinted scratchblocks SVG card.
 *
 * @param {import('./blocks.js').Script} script
 * @param {import('./render.js').Renderer} renderer
 * @param {'added' | 'removed'} kind
 * @param {string} heading
 * @returns {string}
 */
function renderSingleScript(script, renderer, kind, heading) {
  const tint = kind === 'added' ? ADDED_TINT : REMOVED_TINT;
  const { svg } = renderer.render(script.code);
  return `<div class="script ${kind}">
  <div class="script-head">${heading}</div>
  <div class="script-body">${tintSvg(svg, tint)}</div>
</div>`;
}

/**
 * Render a changed script: old vs new SVGs side by side plus a text diff.
 *
 * @param {{ old: import('./blocks.js').Script, new: import('./blocks.js').Script }} pair
 * @param {import('./render.js').Renderer} renderer
 * @param {{ oldLabel: string, newLabel: string }} labels
 * @returns {string}
 */
function renderChangedScript(pair, renderer, { oldLabel, newLabel }) {
  const oldSvg = tintSvg(renderer.render(pair.old.code).svg, REMOVED_TINT);
  const newSvg = tintSvg(renderer.render(pair.new.code).svg, ADDED_TINT);
  return `<div class="script changed">
  <div class="script-head">Modified script</div>
  <div class="columns">
    <div class="col"><div class="col-label removed">${escapeHtml(oldLabel)}</div>${oldSvg}</div>
    <div class="col"><div class="col-label added">${escapeHtml(newLabel)}</div>${newSvg}</div>
  </div>
  <details><summary>text diff</summary>${renderTextDiff(pair.old.code, pair.new.code)}</details>
</div>`;
}

/**
 * Render a line-level scratchblocks text diff as colored <pre> lines.
 *
 * @param {string} oldCode
 * @param {string} newCode
 * @returns {string}
 */
function renderTextDiff(oldCode, newCode) {
  const lines = [];
  for (const part of diffArrays(oldCode.split('\n'), newCode.split('\n'))) {
    const cls = part.added ? 'added' : part.removed ? 'removed' : 'ctx';
    const sign = part.added ? '+' : part.removed ? '−' : ' ';
    for (const line of part.value) {
      lines.push(
        `<span class="diff-line ${cls}">${sign} ${escapeHtml(line)}</span>`,
      );
    }
  }
  return `<pre class="textdiff">${lines.join('\n')}</pre>`;
}

/**
 * Inject a full-size translucent background rect into a serialized SVG so the
 * whole script reads as added/removed at a glance.
 *
 * @param {string} svg - Serialized SVG string.
 * @param {string} fill - CSS color for the background.
 * @returns {string}
 */
function tintSvg(svg, fill) {
  const width = /\bwidth="([\d.]+)"/.exec(svg)?.[1] || '100%';
  const height = /\bheight="([\d.]+)"/.exec(svg)?.[1] || '100%';
  const rect = `<rect x="0" y="0" width="${width}" height="${height}" rx="6" fill="${fill}"/>`;
  // Place the rect right after </defs> so it sits behind the block content.
  if (svg.includes('</defs>')) return svg.replace('</defs>', `</defs>${rect}`);
  return svg.replace(/(<svg[^>]*>)/, `$1${rect}`);
}

/* ----------------------------------------------------------------- helpers */

/**
 * Build a name→target map from a project.json.
 *
 * @param {object} json
 * @returns {Map<string, object>}
 */
function indexTargets(json) {
  const map = new Map();
  for (const t of (json && json.targets) || []) {
    map.set(targetKey(t), t);
  }
  return map;
}

/** @param {object} t @returns {string} Stable identity key for a target. */
function targetKey(t) {
  return t.isStage ? ' stage' : `sprite:${t.name}`;
}

/** @param {object} t @returns {string} Human label for a target. */
function targetLabel(t) {
  return t.isStage ? 'Stage' : t.name;
}

/**
 * Union of target keys, stage first, preserving new-version order then any
 * old-only targets.
 *
 * @param {Map<string, object>} oldTargets
 * @param {Map<string, object>} newTargets
 * @returns {string[]}
 */
function orderedUnion(oldTargets, newTargets) {
  const seen = new Set();
  const order = [];
  for (const key of newTargets.keys()) {
    seen.add(key);
    order.push(key);
  }
  for (const key of oldTargets.keys()) {
    if (!seen.has(key)) order.push(key);
  }
  // Stage first.
  return order.sort((a, b) => (a === ' stage' ? -1 : b === ' stage' ? 1 : 0));
}

/**
 * Escape text for safe inclusion in HTML.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const REPORT_CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 24px;
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f6f7f9; color: #1a1a1a;
}
#g4-live {
  position: fixed; top: 12px; right: 16px; z-index: 10;
  font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px;
  background: #fff3cd; color: #8a6d3b; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
#g4-live[data-state='connected'] { background: #d7f0d8; color: #1b5e20; }
#g4-live[data-state='offline'] { background: #fbdcda; color: #b71c1c; }
header { margin-bottom: 24px; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; }
.summary { color: #555; margin: 0 0 8px; }
.legend { margin: 0; display: flex; gap: 8px; }
.chip {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px;
  text-transform: uppercase; letter-spacing: 0.03em;
}
.chip.added { background: #d7f0d8; color: #1b5e20; }
.chip.removed { background: #fbdcda; color: #b71c1c; }
.chip.changed { background: #e3ecfa; color: #1a47a3; }
.target {
  background: #fff; border: 1px solid #e3e6ea; border-radius: 10px;
  padding: 16px 20px; margin-bottom: 20px;
}
.assets { list-style: none; padding: 0; margin: 0 0 12px; font-family: ui-monospace, monospace; }
.assets .added { color: #1b5e20; }
.assets .removed { color: #b71c1c; }
.script { margin: 16px 0; }
.script-head { font-weight: 600; font-size: 13px; margin-bottom: 6px; color: #444; }
.script-body, .col { overflow-x: auto; }
.columns { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
.col { flex: 1 1 280px; }
.col-label {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.03em; margin-bottom: 6px;
}
.col-label.added { color: #1b5e20; }
.col-label.removed { color: #b71c1c; }
details { margin-top: 10px; }
summary { cursor: pointer; color: #1a47a3; font-size: 12px; }
.textdiff {
  margin: 8px 0 0; padding: 10px; border-radius: 8px; overflow-x: auto;
  background: #0d1117; color: #c9d1d9; font: 12px/1.5 ui-monospace, monospace;
}
.diff-line { display: block; white-space: pre; }
.diff-line.added { background: rgba(46, 160, 67, 0.25); }
.diff-line.removed { background: rgba(248, 81, 73, 0.25); }
.empty { color: #888; font-style: italic; }
@media (prefers-color-scheme: dark) {
  body { background: #15171a; color: #e6e6e6; }
  .target { background: #1e2125; border-color: #2c3036; }
  .summary { color: #aaa; }
  .script-head { color: #bbb; }
}
`;
