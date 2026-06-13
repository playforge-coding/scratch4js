import { forwardRef } from 'react';
import { Switch as RSwitch, Tooltip as RTooltip } from 'radix-ui';

/**
 * Small shared UI kit built on Radix primitives (accessible behavior) styled
 * with Tailwind. Kept in one file because each piece is tiny.
 */

const VARIANTS = {
  primary:
    'bg-accent text-accent-fg hover:bg-accent-hover disabled:bg-accent/40',
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-3 hover:text-fg',
  surface:
    'bg-surface-2 text-fg border border-border hover:bg-surface-3 hover:border-border-strong',
};

/**
 * @param {object} props
 * @param {keyof typeof VARIANTS} [props.variant]
 */
export const Button = forwardRef(function Button(
  { variant = 'surface', className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
});

/** Square icon-only button. */
export const IconButton = forwardRef(function IconButton(
  { variant = 'ghost', className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
});

/**
 * @param {object} props
 * @param {import('react').ReactNode} props.label
 * @param {import('react').ReactNode} props.children  the trigger element
 */
export function Tooltip({ label, children, side = 'bottom' }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 rounded-md border border-border-strong bg-surface-3 px-2 py-1 text-xs text-fg shadow-lg select-none"
        >
          {label}
          <RTooltip.Arrow className="fill-surface-3" />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function TooltipProvider({ children }) {
  return (
    <RTooltip.Provider delayDuration={300} skipDelayDuration={150}>
      {children}
    </RTooltip.Provider>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.checked
 * @param {(v: boolean) => void} props.onCheckedChange
 */
export function Switch({ checked, onCheckedChange, id }) {
  return (
    <RSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="relative h-4 w-7 shrink-0 rounded-full bg-surface-3 transition-colors outline-none data-[state=checked]:bg-accent"
    >
      <RSwitch.Thumb className="block h-3 w-3 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-3.5" />
    </RSwitch.Root>
  );
}

const STATUS_META = {
  idle: { color: 'bg-fg-subtle', label: 'Idle' },
  booting: { color: 'bg-warn animate-pulse', label: 'Booting' },
  installing: { color: 'bg-warn animate-pulse', label: 'Installing' },
  ready: { color: 'bg-ok', label: 'Ready' },
  building: { color: 'bg-accent animate-pulse', label: 'Building' },
  built: { color: 'bg-ok', label: 'Built' },
  error: { color: 'bg-err', label: 'Error' },
};

/** A colored dot + label reflecting the WebContainer status. */
export function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.idle;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted select-none">
      <span className={`h-2 w-2 rounded-full ${meta.color}`} />
      {meta.label}
    </span>
  );
}
