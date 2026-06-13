import {
  Children,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/**
 * A custom resizable split layout — no third-party panel library.
 *
 * Lays its children out in a single row (`direction="horizontal"`) or column
 * (`direction="vertical"`), with a draggable divider between each pair. Sizes
 * are tracked as percentages (one weight per child, summing to 100) so the
 * layout stays proportional when the window resizes. Drag math is done in
 * pixels against the live container rect, then converted back to percentages and
 * clamped by per-pane minimums.
 *
 * Composes with itself: a pane can be another <SplitPane> with the opposite
 * direction, which is how the app builds its full IDE grid.
 *
 * @param {object} props
 * @param {'horizontal'|'vertical'} [props.direction]
 * @param {number[]} [props.defaultSizes]  initial weights (percent), one per child
 * @param {number|number[]} [props.minSize] minimum pane size in px
 * @param {string} [props.storageKey]       persist sizes in localStorage under this key
 * @param {string} [props.className]
 * @param {import('react').ReactNode} props.children
 */
export function SplitPane({
  direction = 'horizontal',
  defaultSizes,
  minSize = 80,
  storageKey,
  className = '',
  children,
}) {
  const panes = Children.toArray(children).filter(Boolean);
  const count = panes.length;
  const horizontal = direction === 'horizontal';

  const containerRef = useRef(null);
  const [sizes, setSizes] = useState(() =>
    loadSizes(storageKey, defaultSizes, count),
  );

  // Keep the weight count in sync if children are added/removed at runtime.
  useLayoutEffect(() => {
    if (sizes.length !== count) {
      setSizes(loadSizes(storageKey, defaultSizes, count));
    }
  }, [count, sizes.length, storageKey, defaultSizes]);

  const minSizes = Array.isArray(minSize)
    ? minSize
    : new Array(count).fill(minSize);

  const drag = useRef(null);

  const onPointerMove = useCallback(
    (e) => {
      const state = drag.current;
      if (!state) return;
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const total = horizontal ? rect.width : rect.height;
      if (total <= 0) return;

      const pos = horizontal ? e.clientX : e.clientY;
      const deltaPx = pos - state.startPos;
      const deltaPct = (deltaPx / total) * 100;

      const i = state.index;
      const a = state.startSizes[i] + deltaPct;
      const b = state.startSizes[i + 1] - deltaPct;

      // Convert min px constraints to percentages of the current container.
      const minA = (minSizes[i] / total) * 100;
      const minB = (minSizes[i + 1] / total) * 100;
      if (a < minA || b < minB) return;

      setSizes((prev) => {
        const next = prev.slice();
        next[i] = a;
        next[i + 1] = b;
        return next;
      });
    },
    [horizontal, minSizes],
  );

  const endDrag = useCallback(() => {
    const state = drag.current;
    drag.current = null;
    document.documentElement.removeAttribute('data-resizing');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    if (state && storageKey) {
      setSizes((prev) => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(prev));
        } catch {
          /* storage may be unavailable (private mode) — sizes still work */
        }
        return prev;
      });
    }
  }, [onPointerMove, storageKey]);

  const startDrag = useCallback(
    (index, e) => {
      e.preventDefault();
      drag.current = {
        index,
        startPos: horizontal ? e.clientX : e.clientY,
        startSizes: sizes,
      };
      document.documentElement.setAttribute(
        'data-resizing',
        horizontal ? 'col' : 'row',
      );
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', endDrag);
    },
    [horizontal, sizes, onPointerMove, endDrag],
  );

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 min-w-0 ${horizontal ? 'flex-row' : 'flex-col'} ${className}`}
      style={{ width: '100%', height: '100%' }}
    >
      {panes.map((pane, i) => (
        <PaneFragment
          key={i}
          index={i}
          last={i === count - 1}
          size={sizes[i] ?? 100 / count}
          horizontal={horizontal}
          onDividerDown={startDrag}
        >
          {pane}
        </PaneFragment>
      ))}
    </div>
  );
}

function PaneFragment({
  index,
  last,
  size,
  horizontal,
  onDividerDown,
  children,
}) {
  return (
    <>
      <div
        className="relative min-h-0 min-w-0 overflow-hidden"
        style={{ flexBasis: `${size}%`, flexGrow: 0, flexShrink: 1 }}
      >
        {children}
      </div>
      {!last && (
        <Divider
          horizontal={horizontal}
          onDown={(e) => onDividerDown(index, e)}
        />
      )}
    </>
  );
}

function Divider({ horizontal, onDown }) {
  return (
    <div
      role="separator"
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      onPointerDown={onDown}
      className={`group relative z-10 shrink-0 bg-border transition-colors hover:bg-accent ${
        horizontal ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize'
      }`}
    >
      {/* Invisible wide hit area so the 1px divider is easy to grab. */}
      <span
        className={`absolute ${
          horizontal
            ? '-left-1.5 -right-1.5 inset-y-0'
            : '-top-1.5 -bottom-1.5 inset-x-0'
        }`}
      />
    </div>
  );
}

function loadSizes(storageKey, defaultSizes, count) {
  if (storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === count) return parsed;
      }
    } catch {
      /* ignore */
    }
  }
  if (defaultSizes && defaultSizes.length === count)
    return defaultSizes.slice();
  return new Array(count).fill(100 / count);
}
