import React from 'react';

import { Logo } from '../core/Logo.jsx';
import { Avatar } from '../core/Avatar.jsx';
export function Dock({ items, value, onChange, people = [], tone = 'sun', style }) {
  const bg = { sun: 'var(--accent-money)', teal: 'var(--accent-route)', lilac: 'var(--accent-stay)', coral: 'var(--accent-primary)' }[tone];
  return (
    <nav aria-label="Trip" style={{ width: 96, flex: 'none', background: bg, borderRight: 'var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: 8, boxSizing: 'border-box', ...style }}>
      <span style={{ width: 44, height: 44, borderRadius: 'var(--radius-m)', background: 'var(--surface-inverse)', display: 'grid', placeItems: 'center', marginBottom: 14 }}><Logo variant="mark" size={30} /></span>
      {items.map(it => { const on = it.key === value; return (
        <button key={it.key} type="button" aria-current={on ? 'page' : undefined} onClick={() => onChange && onChange(it.key)} style={{ width: 64, height: 40, borderRadius: 'var(--radius-m)', border: on ? 'var(--border)' : '2px solid transparent', background: on ? 'var(--accent-primary)' : 'transparent', color: on ? 'var(--on-accent-text)' : it.muted ? 'var(--on-accent-muted)' : 'var(--on-accent-text)', font: 'var(--type-label)', fontWeight: on ? 800 : 700, boxShadow: on ? 'var(--shadow-1)' : 'none', cursor: 'pointer', padding: 0 }}>{it.label}</button>
      ); })}
      <span style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>{people.map(p => <Avatar key={p.initials} {...p} size={32} />)}</span>
    </nav>
  );
}
