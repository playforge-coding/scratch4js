/**
 * Panel chrome used by every region of the IDE: a titled, bordered surface with
 * an optional toolbar slot on the right of the header and a flex body that fills
 * the remaining space. Bodies are responsible for their own scrolling.
 *
 * @param {object} props
 * @param {import('react').ReactNode} [props.title]
 * @param {import('react').ReactNode} [props.icon]
 * @param {import('react').ReactNode} [props.actions]  right-aligned header controls
 * @param {boolean} [props.flush]   remove body padding (for editors/iframes)
 * @param {string} [props.className]
 * @param {string} [props.bodyClassName]
 * @param {import('react').ReactNode} props.children
 */
export function Panel({
  title,
  icon,
  actions,
  flush = false,
  className = '',
  bodyClassName = '',
  children,
}) {
  return (
    <section
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-surface-1 ${className}`}
    >
      {(title || actions) && (
        <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-3 text-xs font-medium text-fg-muted select-none">
          {icon && <span className="text-fg-subtle">{icon}</span>}
          <span className="truncate uppercase tracking-wide">{title}</span>
          {actions && (
            <div className="ml-auto flex items-center gap-1">{actions}</div>
          )}
        </header>
      )}
      <div
        className={`min-h-0 flex-1 ${flush ? '' : 'overflow-auto p-3'} ${bodyClassName}`}
      >
        {children}
      </div>
    </section>
  );
}
