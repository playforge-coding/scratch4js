import { useEffect, useRef, useState } from 'react';
import { Flag, RotateCw, Square } from 'lucide-react';
import { IconButton, Tooltip, useEditorState } from 'browser-ide-kit';

import { scratch } from './controller.js';
import { attachStage, STAGE_H, STAGE_W } from './vm.js';

/**
 * The Scratch stage: a scratch-render canvas running the shared VM, with
 * green-flag / stop controls. Loads the freshly-built extension (same-origin
 * blob URL) and lets the user run their test project.
 */
export function Stage() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const { built } = useEditorState();
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = attachStage(scratch.vm, canvas);

    const resize = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      // Fit 480×360 into the wrapper, preserving aspect ratio.
      const scale = Math.min(rect.width / STAGE_W, rect.height / STAGE_H);
      const w = Math.round(STAGE_W * scale);
      const h = Math.round(STAGE_H * scale);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      renderer.resize(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapRef.current);

    const toStageCoords = (e) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: STAGE_W * ((e.clientX - rect.left) / rect.width - 0.5),
        y: -STAGE_H * ((e.clientY - rect.top) / rect.height - 0.5),
      };
    };
    const onMove = (e) => {
      const { x, y } = toStageCoords(e);
      scratch.vm.postIOData('mouse', { x, y });
    };
    const onDown = (e) => {
      const { x, y } = toStageCoords(e);
      scratch.vm.postIOData('mouse', { x, y, isDown: true });
    };
    const onUp = (e) => {
      const { x, y } = toStageCoords(e);
      scratch.vm.postIOData('mouse', { x, y, isDown: false });
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);

    return () => {
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Auto-load the extension into the VM whenever a new build lands.
  useEffect(() => {
    if (!built) return;
    let cancelled = false;
    scratch.loadExtension(built.contents).then(() => {
      if (!cancelled) setLoadedAt(built.builtAt);
    });
    return () => {
      cancelled = true;
    };
  }, [built?.builtAt]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border bg-surface-2 px-2 py-1">
        <Tooltip label="Green flag — run">
          <IconButton
            aria-label="Green flag"
            onClick={() => scratch.greenFlag()}
            className="text-ok hover:text-ok"
          >
            <Flag size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip label="Stop all">
          <IconButton
            aria-label="Stop"
            onClick={() => scratch.stopAll()}
            className="text-err hover:text-err"
          >
            <Square size={14} fill="currentColor" />
          </IconButton>
        </Tooltip>
        <Tooltip label="Reload extension into the VM">
          <IconButton
            aria-label="Reload extension"
            disabled={!built}
            onClick={() => built && scratch.loadExtension(built.contents)}
          >
            <RotateCw size={14} />
          </IconButton>
        </Tooltip>
        <span className="ml-auto pr-1 text-[11px] text-fg-subtle">
          {loadedAt ? 'extension loaded' : 'no extension yet'}
        </span>
      </div>
      <div
        ref={wrapRef}
        className="grid min-h-0 flex-1 place-items-center overflow-hidden bg-surface-0 p-2"
      >
        <canvas
          ref={canvasRef}
          className="rounded bg-white"
          width={STAGE_W}
          height={STAGE_H}
        />
      </div>
    </div>
  );
}
