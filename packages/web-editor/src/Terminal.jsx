import { useEffect, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';

import { useEditorApi } from './editorContext.jsx';

import '@xterm/xterm/css/xterm.css';

// Theme aligned with the app's palette (see styles.css tokens).
const THEME = {
  background: '#0e0f13',
  foreground: '#e6e8ef',
  cursor: '#6b5cff',
  cursorAccent: '#0e0f13',
  selectionBackground: '#6b5cff55',
  black: '#16181f',
  brightBlack: '#3a3f4d',
  red: '#f0526b',
  brightRed: '#ff6b80',
  green: '#3fb950',
  brightGreen: '#56d364',
  yellow: '#d6a32a',
  brightYellow: '#e3b341',
  blue: '#6b5cff',
  brightBlue: '#7d70ff',
  magenta: '#bd7bff',
  brightMagenta: '#d2a8ff',
  cyan: '#39c5cf',
  brightCyan: '#56d4dd',
  white: '#9aa1b2',
  brightWhite: '#e6e8ef',
};

/**
 * xterm.js front-end bound to the editor engine's interactive WebContainer
 * shell. Renders install/build output (full ANSI) and lets the user run their
 * own commands. `apiRef.current` is populated with `{ clear }`.
 *
 * @param {{ apiRef?: import('react').MutableRefObject<any> }} props
 */
export function TerminalPanel({ apiRef }) {
  const { engine } = useEditorApi();
  const hostRef = useRef(null);

  useEffect(() => {
    const term = new XTerm({
      theme: THEME,
      fontFamily:
        "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 12.5,
      lineHeight: 1.2,
      cursorBlink: true,
      convertEol: false,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);

    const sync = () => {
      const el = hostRef.current;
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
      try {
        fit.fit();
        engine.resize(term.cols, term.rows);
      } catch {
        /* renderer not ready this frame; the ResizeObserver will retry */
      }
    };
    const raf = requestAnimationFrame(sync);

    const offOutput = engine.onOutput((chunk) => term.write(chunk));
    const onData = term.onData((data) => engine.writeInput(data));

    const ro = new ResizeObserver(sync);
    ro.observe(hostRef.current);

    if (apiRef) apiRef.current = { clear: () => term.reset() };

    return () => {
      cancelAnimationFrame(raf);
      offOutput();
      onData.dispose();
      ro.disconnect();
      term.dispose();
      if (apiRef) apiRef.current = null;
    };
  }, [engine, apiRef]);

  return <div ref={hostRef} className="h-full w-full bg-surface-0 px-2 py-1" />;
}
