import React from 'react';

const FILLS = {
  primary: { background: 'var(--surface-inverse)', color: 'var(--text-inverse)', boxShadow: 'var(--shadow-accent)' },
  secondary: { background: 'var(--surface-card)', color: 'var(--text-primary)', boxShadow: 'var(--shadow-1)' },
  accent: { background: 'var(--accent-primary)', color: 'var(--text-on-accent)', boxShadow: 'var(--shadow-1)' },
  ghost: { background: 'transparent', color: 'var(--text-primary)', boxShadow: 'none' },
  dashed: { background: 'transparent', color: 'var(--text-muted)', boxShadow: 'none', borderStyle: 'dashed' },
};
const SIZES = { s: { height: 36, padding: '0 14px', font: 'var(--type-button)' }, m: { height: 44, padding: '0 18px', font: 'var(--type-button)' }, l: { height: 52, padding: '0 22px', font: 'var(--type-button-l)' } };
export function Button({ variant = 'primary', size = 'm', block, disabled, leading, children, style, ...rest }) {
  const [down, setDown] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const fill = FILLS[variant] || FILLS.primary;
  const pressed = down && !disabled && fill.boxShadow !== 'none';
  const lifted = hover && !down && !disabled;
  const HOVER = { primary: { boxShadow: '5px 5px 0 var(--pg-coral)' }, secondary: { boxShadow: 'var(--shadow-2)' }, accent: { boxShadow: 'var(--shadow-2)' }, ghost: { background: 'var(--surface-canvas)' }, dashed: { color: 'var(--text-primary)', borderColor: 'var(--outline)' } }[variant] || {};
  return (
    <button type="button" disabled={disabled} onPointerDown={() => setDown(true)} onPointerUp={() => setDown(false)} onPointerLeave={() => { setDown(false); setHover(false); }} onPointerEnter={e => e.pointerType === 'mouse' && setHover(true)} {...rest}
      style={{ display: block ? 'flex' : 'inline-flex', width: block ? '100%' : undefined, alignItems: 'center', justifyContent: 'center', gap: 8, border: 'var(--border)', borderColor: variant === 'ghost' ? 'transparent' : 'var(--outline)', borderRadius: 'var(--radius-pill)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap', transition: 'transform var(--dur-fast) var(--ease-pop), box-shadow var(--dur-fast) var(--ease-pop)', transform: pressed ? 'var(--press-offset)' : lifted && fill.boxShadow !== 'none' ? 'translate(-1px,-1px)' : 'none', ...SIZES[size], ...fill, ...(lifted ? HOVER : null), boxShadow: pressed ? 'var(--shadow-pressed)' : lifted && HOVER.boxShadow ? HOVER.boxShadow : fill.boxShadow, ...style }}>
      {leading}{children}
    </button>
  );
}
