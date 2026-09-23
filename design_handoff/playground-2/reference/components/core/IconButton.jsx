import React from 'react';

export function IconButton({ children, size = 44, tone = 'card', label, style, ...rest }) {
  const [down, setDown] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const bg = { card: 'var(--surface-card)', ink: 'var(--surface-inverse)', accent: 'var(--accent-primary)', ghost: 'transparent' }[tone];
  const color = tone === 'ink' ? 'var(--text-inverse)' : 'var(--text-primary)';
  return (
    <button type="button" aria-label={label} title={label} onPointerDown={() => setDown(true)} onPointerUp={() => setDown(false)} onPointerLeave={() => { setDown(false); setHover(false); }} onPointerEnter={e => e.pointerType === 'mouse' && setHover(true)} {...rest}
      style={{ width: size, height: size, display: 'inline-grid', placeItems: 'center', background: bg, color, border: 'var(--border)', borderColor: tone === 'ghost' ? 'transparent' : 'var(--outline)', borderRadius: size >= 44 ? 'var(--radius-m)' : 'var(--radius-s)', boxShadow: tone === 'ghost' ? 'none' : down ? 'var(--shadow-pressed)' : hover ? 'var(--shadow-2)' : 'var(--shadow-1)', transform: tone === 'ghost' ? 'none' : down ? 'var(--press-offset)' : hover ? 'translate(-1px,-1px)' : 'none', ...(tone === 'ghost' && hover ? { background: 'var(--surface-canvas)' } : null), transition: 'transform var(--dur-fast) var(--ease-pop), box-shadow var(--dur-fast)', cursor: 'pointer', padding: 0, font: 'var(--type-button-l)', ...style }}>
      {children}
    </button>
  );
}
