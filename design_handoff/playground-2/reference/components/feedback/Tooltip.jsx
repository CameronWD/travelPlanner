import React from 'react';

export function Tooltip({ label, children, side = 'top' }) {
  const [on, setOn] = React.useState(false);
  const pos = side === 'top' ? { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' } : side === 'bottom' ? { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' } : side === 'left' ? { right: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' } : { left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' };
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }} onMouseEnter={() => setOn(true)} onMouseLeave={() => setOn(false)}>
      {children}
      {on && <span role="tooltip" style={{ position: 'absolute', ...pos, background: 'var(--surface-inverse)', color: 'var(--text-inverse)', padding: '6px 10px', borderRadius: 'var(--radius-s)', font: 'var(--type-caption)', fontWeight: 700, whiteSpace: 'nowrap', zIndex: 30, boxShadow: '2px 2px 0 var(--accent-primary)' }}>{label}</span>}
    </span>
  );
}
