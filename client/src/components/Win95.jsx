import { PixelIcon } from './PixelIcon.jsx';

// ---------------------------------------------------------------------------
// Shared retro chrome. Hard edges only: 2px bevels made of four flat tones, no
// curves, no fades, and progress that moves in whole block characters instead of
// smooth bars. Styled after old windowing systems without copying any one brand.
// ---------------------------------------------------------------------------

export function Window({
  title,
  icon,
  children,
  className = '',
  bodyClassName = 'p-2',
  actions = null,
  onClose = null,
  closeLabel = 'Close',
  idle = false,
}) {
  return (
    <section className={`window ${className}`}>
      <div className={`titlebar ${idle ? 'titlebar-idle' : ''}`}>
        {icon ? (
          <span className="icon-cell h-4 w-4">
            <PixelIcon name={icon} size={14} />
          </span>
        ) : null}
        <span className="flex-1 truncate text-xs">{title}</span>
        {actions}
        {onClose ? (
          <button type="button" className="tbtn" onClick={onClose} title={closeLabel}>
            ×
          </button>
        ) : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  primary = false,
  className = '',
  title,
  pressed = false,
  type = 'button',
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${primary ? 'btn btn-default' : 'btn'} ${pressed ? 'is-down' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

/** <fieldset>/<legend> - the original grouped-box control. */
export function Group({ label, children, className = '' }) {
  return (
    <fieldset className={`etched px-2 pb-2 pt-1 ${className}`}>
      <legend className="px-1 text-xs font-bold">{label}</legend>
      {children}
    </fieldset>
  );
}

export function Led({ color, title = '' }) {
  return <span className="led" style={{ backgroundColor: color }} title={title} />;
}

/** ▓▓▓▓░░░░ - a hard-edged progress bar you could typeset on a terminal. */
export function BlockBar({ value, max = 10, width = 12, color = '#57c7d0', track = '#1a232c' }) {
  const ratio = Number(value) || 0;
  const filled = Math.max(0, Math.min(width, Math.round((ratio / (max || 1)) * width)));
  return (
    <span className="ascii whitespace-nowrap" title={`${value} / ${max}`}>
      <span style={{ color }}>{'\u2593'.repeat(filled)}</span>
      <span style={{ color: track }}>{'\u2591'.repeat(width - filled)}</span>
    </span>
  );
}

export function Marquee({ children, className = '' }) {
  return (
    <span className={`marquee-window overflow-hidden ${className}`}>
      <span className="marquee-track">{children}</span>
    </span>
  );
}

export function StatusCell({ children, className = '', grow = false }) {
  return <span className={`status-cell ${grow ? 'flex-1' : ''} ${className}`}>{children}</span>;
}

export function RainbowRule() {
  return <hr className="hr-rainbow" />;
}

export function Counter({ value, digits = 5 }) {
  const text = String(Math.max(0, Math.floor(Number(value) || 0)))
    .padStart(digits, '0')
    .slice(-digits);
  return (
    <span className="inline-flex gap-[1px]">
      {text.split('').map((d, i) => (
        <span key={i} className="counter-digit">
          {d}
        </span>
      ))}
    </span>
  );
}
