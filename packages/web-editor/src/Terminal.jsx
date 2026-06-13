import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';

import { useEditorApi, useEditorState } from './editorContext.jsx';

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

const BUSY = new Set(['idle', 'booting', 'installing']);

/**
 * One xterm.js instance bound to a single engine terminal session. Stays mounted
 * (just hidden) when its tab is inactive so scrollback and live processes
 * survive tab switches.
 *
 * @param {object} props
 * @param {string} props.id  engine terminal id
 * @param {boolean} props.active
 * @param {Map<string, () => void>} props.clearRegistry  id → clear fn, shared
 */
function TerminalInstance({ id, active, clearRegistry }) {
  const { engine } = useEditorApi();
  const hostRef = useRef(null);
  const termRef = useRef(null);

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
    termRef.current = { term, fit };

    const sync = () => {
      const el = hostRef.current;
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
      try {
        fit.fit();
        engine.resizeTerminal(id, term.cols, term.rows);
      } catch {
        /* renderer not ready this frame; the ResizeObserver will retry */
      }
    };
    const raf = requestAnimationFrame(sync);

    const offOutput = engine.onTerminalOutput(id, (chunk) => term.write(chunk));
    const onData = term.onData((data) => engine.writeTerminalInput(id, data));

    const ro = new ResizeObserver(sync);
    ro.observe(hostRef.current);

    clearRegistry.set(id, () => term.reset());

    return () => {
      cancelAnimationFrame(raf);
      offOutput();
      onData.dispose();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      clearRegistry.delete(id);
    };
  }, [engine, id, clearRegistry]);

  // When this tab becomes active it transitions from hidden to visible; refit
  // and focus so it fills the (possibly resized) panel.
  useEffect(() => {
    if (!active || !termRef.current) return;
    const raf = requestAnimationFrame(() => {
      const inst = termRef.current;
      if (!inst) return;
      try {
        inst.fit.fit();
        engine.resizeTerminal(id, inst.term.cols, inst.term.rows);
        inst.term.focus();
      } catch {
        /* not laid out yet */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [active, engine, id]);

  return (
    <div
      ref={hostRef}
      className={`absolute inset-0 bg-surface-0 px-2 py-1 ${active ? 'z-10' : 'invisible'}`}
    />
  );
}

/**
 * Tabbed terminal area. Renders one xterm per engine terminal session and lets
 * the user open/close/switch between them. `apiRef.current` is populated with
 * `{ clear }`, which clears the *active* terminal.
 *
 * @param {{ apiRef?: import('react').MutableRefObject<any> }} props
 */
export function TerminalPanel({ apiRef }) {
  const { engine } = useEditorApi();
  const { status } = useEditorState();
  const [terminals, setTerminals] = useState(() => engine.listTerminals());
  const [activeId, setActiveId] = useState(() => engine.mainTerminalId);
  const clearFns = useRef(new Map());

  useEffect(() => engine.onTerminals(setTerminals), [engine]);

  // Keep the active selection pointing at a terminal that still exists.
  useEffect(() => {
    if (terminals.length && !terminals.some((t) => t.id === activeId)) {
      setActiveId(terminals.at(-1).id);
    }
  }, [terminals, activeId]);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = { clear: () => clearFns.current.get(activeId)?.() };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, activeId]);

  const addTerminal = async () => {
    try {
      const id = await engine.openTerminal();
      setActiveId(id);
    } catch {
      /* container not ready yet */
    }
  };

  return (
    <div className="flex h-full flex-col bg-surface-0">
      <div className="flex h-8 shrink-0 items-stretch overflow-x-auto border-b border-border bg-surface-2">
        {terminals.map((t) => {
          const isActive = t.id === activeId;
          return (
            <div
              key={t.id}
              className={`group/tab flex shrink-0 items-center border-r border-border ${
                isActive
                  ? 'bg-surface-0 text-fg'
                  : 'text-fg-muted hover:bg-surface-3'
              }`}
            >
              <button
                onClick={() => setActiveId(t.id)}
                className="py-1 pr-2 pl-3 text-xs font-medium"
              >
                {t.title}
              </button>
              {!t.main && (
                <button
                  onClick={() => engine.closeTerminal(t.id)}
                  aria-label={`Close ${t.title}`}
                  className={`mr-1.5 shrink-0 rounded p-0.5 text-fg-subtle hover:bg-surface-3 hover:text-fg ${
                    isActive ? '' : 'opacity-0 group-hover/tab:opacity-100'
                  }`}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={addTerminal}
          disabled={BUSY.has(status)}
          aria-label="New terminal"
          title="New terminal"
          className="flex shrink-0 items-center px-2 text-fg-subtle hover:bg-surface-3 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {terminals.map((t) => (
          <TerminalInstance
            key={t.id}
            id={t.id}
            active={t.id === activeId}
            clearRegistry={clearFns.current}
          />
        ))}
      </div>
    </div>
  );
}
