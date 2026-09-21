function IconGlyph({ children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function ChevronRightIcon() {
  return (
    <IconGlyph>
      <path d="m9 6 6 6-6 6" />
    </IconGlyph>
  );
}

export function ChevronDownIcon() {
  return (
    <IconGlyph>
      <path d="m6 9 6 6 6-6" />
    </IconGlyph>
  );
}

export function PencilIcon() {
  return (
    <IconGlyph>
      <path d="M4.6 16.7 15.8 5.5a1.9 1.9 0 0 1 2.7 0l.2.2a1.9 1.9 0 0 1 0 2.7L7.5 19.6 4 20.2z" />
      <path d="M14.2 7.1 17 9.9" />
    </IconGlyph>
  );
}

export function TrashIcon() {
  return (
    <IconGlyph>
      <path d="M5 7.2h14" />
      <path d="M9.4 7.2V5.4h5.2v1.8" />
      <path d="M8.2 7.2 9 19.2h6l.8-12" />
    </IconGlyph>
  );
}

export function ChatBubbleIcon() {
  return (
    <IconGlyph>
      <path d="M20.4 11.2c0 4.1-3.7 7.4-8.3 7.4-1 0-2-.2-2.9-.5L4.6 20.2l1.4-3.3c-.8-1.1-1.3-2.4-1.3-3.7 0-4.1 3.7-7.4 8.3-7.4s8.4 3.3 8.4 7.4z" />
      <circle cx="9.3" cy="11.2" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="12.1" cy="11.2" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="14.9" cy="11.2" r="1.05" fill="currentColor" stroke="none" />
    </IconGlyph>
  );
}

export function CardExpandHint({ open }) {
  return (
    <span className={`duty-expand-hint is-icon${open ? ' is-open' : ''}`} aria-hidden="true">
      {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
    </span>
  );
}

export function CardIconButton({
  className = '',
  title,
  onClick,
  disabled = false,
  children,
}) {
  return (
    <button
      type="button"
      className={`work-icon-button ${className}`.trim()}
      title={title}
      aria-label={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
