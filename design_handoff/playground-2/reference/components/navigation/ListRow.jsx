import React from 'react';
import { Icon } from '../core/Icon.jsx';

const onKey = fn => e => { if (fn && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fn(e); } };
export function ListRow({ tile, tileTone = 'lilac', title, sub, trailing = <Icon name="chevron-right" size={18} />, onClick, style }) {
  const bg = { coral: 'var(--accent-primary)', sun: 'var(--accent-money)', teal: 'var(--accent-route)', lilac: 'var(--accent-stay)', ink: 'var(--surface-inverse)', white: 'var(--surface-card)' }[tileTone];
  return (
    <div onClick={onClick} {...(onClick ? { role: 'button', tabIndex: 0, onKeyDown: onKey(onClick) } : null)} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, cursor: onClick ? 'pointer' : 'default', ...style }}>
      {tile != null && <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-s)', background: bg, color: tileTone === 'ink' ? 'var(--text-inverse)' : 'var(--text-on-accent)', border: 'var(--border)', flex: 'none', display: 'grid', placeItems: 'center', font: 'var(--type-label)', fontSize: 13, fontWeight: 800 }}>{tile}</span>}
      <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', lineHeight: 1.3 }}>
        <span style={{ display: 'block' }}>{title}</span>
        {sub && <span style={{ display: 'block', font: 'var(--type-caption)', fontWeight: 500, color: 'var(--text-muted)' }}>{sub}</span>}
      </span>
      <span aria-hidden="true" style={{ font: 'var(--type-button-l)', flex: 'none', display: 'flex', color: 'var(--text-muted)' }}>{trailing}</span>
    </div>
  );
}
