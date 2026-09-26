import React from 'react';

const TONES = { white: 'var(--surface-card)', coral: 'var(--accent-primary)', sun: 'var(--accent-money)', teal: 'var(--accent-route)', lilac: 'var(--accent-stay)', ink: 'var(--surface-inverse)' };
const onKey = fn => e => { if (fn && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fn(e); } };
export function Chip({ tone = 'white', size = 'm', dashed, uppercase, selected, children, style, onClick, ...rest }) {
  const pad = size === 's' ? '2px 8px' : size === 'l' ? '8px 14px' : '4px 9px';
  const font = size === 's' ? 'var(--type-micro)' : size === 'l' ? 'var(--type-caption)' : 'var(--type-label)';
  return (
    <span onClick={onClick} {...(onClick ? { role: 'button', tabIndex: 0, onKeyDown: onKey(onClick), 'aria-pressed': selected } : null)} {...rest} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: pad, font, fontWeight: 800, letterSpacing: uppercase ? 'var(--tracking-label)' : 0, textTransform: uppercase ? 'uppercase' : 'none', background: dashed ? 'transparent' : TONES[tone], color: tone === 'ink' ? 'var(--text-inverse)' : dashed ? 'var(--text-muted)' : tone === 'white' ? 'var(--text-primary)' : 'var(--text-on-accent)', border: dashed ? 'var(--border-dashed)' : 'var(--border)', borderColor: dashed ? 'var(--outline-soft)' : 'var(--outline)', borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default', boxShadow: selected ? 'var(--shadow-1)' : 'none', transform: selected ? 'translate(-1px,-1px)' : 'none', transition: 'transform var(--dur-fast), box-shadow var(--dur-fast)', lineHeight: 1.2, minHeight: onClick ? 28 : undefined, boxSizing: 'border-box', ...style }}>
      {children}
    </span>
  );
}
