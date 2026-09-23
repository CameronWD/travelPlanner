import React from 'react';

export function TabBar({ items, value, onChange, tone = 'coral', style }) {
  const bg = { coral: 'var(--accent-primary)', sun: 'var(--accent-money)', teal: 'var(--accent-route)', lilac: 'var(--accent-stay)' }[tone];
  const n = items.length; const idx = Math.max(0, items.findIndex(it => it.key === value));
  return (
    <nav aria-label="Main" style={{ padding: '10px 12px 22px', background: 'var(--surface-page)', borderTop: 'var(--border)', ...style }}>
      <div style={{ position: 'relative', display: 'flex', gap: 6 }}>
        <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, height: 44, width: `calc((100% - ${(n - 1) * 6}px) / ${n})`, transform: `translateX(calc(${idx} * (100% + 6px)))`, borderRadius: 'var(--radius-m)', border: 'var(--border)', background: bg, boxShadow: 'var(--shadow-1)', boxSizing: 'border-box', transition: 'transform var(--dur-base) var(--ease-bounce)' }}></span>
        {items.map(it => { const on = it.key === value; return (
          <button key={it.key} type="button" aria-current={on ? 'page' : undefined} onClick={() => onChange && onChange(it.key)} style={{ position: 'relative', flex: 1, minWidth: 0, height: 44, borderRadius: 'var(--radius-m)', border: '2px solid transparent', background: 'transparent', color: on ? 'var(--on-accent-text)' : 'var(--text-muted)', font: on ? 'var(--type-button)' : 'var(--type-caption)', fontSize: 12, cursor: 'pointer', transition: 'color var(--dur-fast)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: 0 }}>{it.label}</button>
        ); })}
      </div>
    </nav>
  );
}
