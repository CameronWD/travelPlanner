import React from 'react';

export function Badge({ count, tone = 'coral', size = 24, style }) {
  const bg = { coral: 'var(--accent-primary)', sun: 'var(--accent-money)', teal: 'var(--accent-route)', lilac: 'var(--accent-stay)', ink: 'var(--surface-inverse)' }[tone];
  return <span style={{ width: size, height: size, minWidth: size, padding: '0 5px', boxSizing: 'border-box', borderRadius: 'var(--radius-pill)', background: bg, color: tone === 'ink' ? 'var(--text-inverse)' : 'var(--text-on-accent)', border: 'var(--border)', display: 'inline-grid', placeItems: 'center', font: 'var(--type-label)', fontWeight: 800, ...style }}>{count}</span>;
}
