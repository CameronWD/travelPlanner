import React from 'react';

export function Avatar({ initials, tone = 'teal', size = 30, square, style }) {
  const bg = { coral: 'var(--accent-primary)', sun: 'var(--accent-money)', teal: 'var(--accent-route)', lilac: 'var(--accent-stay)', ink: 'var(--surface-inverse)' }[tone];
  return <span style={{ width: size, height: size, borderRadius: square ? 'var(--radius-s)' : '50%', background: bg, color: tone === 'ink' ? 'var(--text-inverse)' : 'var(--text-on-accent)', border: 'var(--border)', display: 'inline-grid', placeItems: 'center', font: 'var(--type-label)', fontSize: Math.round(size * 0.37), fontWeight: 800, flex: 'none', boxSizing: 'border-box', ...style }}>{initials}</span>;
}
