import React from 'react';

const TONES = { white: 'var(--surface-card)', paper: 'var(--surface-page)', coral: 'var(--accent-primary)', sun: 'var(--accent-money)', teal: 'var(--accent-route)', lilac: 'var(--accent-stay)', ink: 'var(--surface-inverse)' };
const ISLAND = { '--text-primary': 'var(--on-accent-text)', '--text-body': 'var(--on-accent-body)', '--text-muted': 'var(--on-accent-muted)', '--surface-card': 'var(--on-accent-surface)', '--surface-page': 'var(--on-accent-surface)', '--surface-inverse': 'var(--on-accent-text)', '--text-inverse': 'var(--on-accent-inverse)', '--outline': 'var(--on-accent-outline)', '--outline-soft': 'var(--on-accent-muted)', '--border': '2px solid var(--on-accent-outline)', '--border-dashed': '2px dashed var(--on-accent-outline)' };
const ACCENTS = ['coral', 'sun', 'teal', 'lilac'];
const onKey = fn => e => { if (fn && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fn(e); } };
export function Card({ tone = 'white', shadow = 2, radius = 'l', padding = 14, dashed, sticker, children, style, onClick, ...rest }) {
  const shadows = { 0: 'none', 1: 'var(--shadow-1)', 2: 'var(--shadow-2)', 3: 'var(--shadow-3)', 4: 'var(--shadow-4)', 5: 'var(--shadow-5)' };
  return (
    <div onClick={onClick} {...(onClick ? { role: 'button', tabIndex: 0, onKeyDown: onKey(onClick) } : null)} {...rest} style={{ ...(ACCENTS.includes(tone) && !dashed ? ISLAND : null), position: 'relative', padding, background: dashed ? 'transparent' : TONES[tone], color: tone === 'ink' ? 'var(--text-inverse)' : 'var(--text-primary)', border: dashed ? 'var(--border-dashed)' : 'var(--border)', borderColor: dashed ? 'var(--outline-soft)' : 'var(--outline)', borderRadius: `var(--radius-${radius})`, boxShadow: dashed ? 'none' : shadows[shadow], cursor: onClick ? 'pointer' : 'default', boxSizing: 'border-box', ...style }}>
      {sticker && <span style={{ position: 'absolute', top: -11, left: 14 }}>{sticker}</span>}
      {children}
    </div>
  );
}
