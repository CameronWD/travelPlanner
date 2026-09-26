import React from 'react';

export function Segmented({ options, value, onChange, tone = 'coral', style }) {
  return (
    <span role="radiogroup" style={{ display: 'inline-flex', padding: 4, gap: 4, background: 'var(--surface-card)', border: '2px solid var(--outline-control)', borderRadius: 'var(--radius-pill)', ...style }}>
      {options.map(o => { const v = typeof o === 'string' ? o : o.value; const on = v === value; return (
        <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange && onChange(v)} style={{ height: 32, padding: '0 14px', borderRadius: 'var(--radius-pill)', border: on ? 'var(--border)' : '2px solid transparent', background: on ? { coral: 'var(--accent-primary)', sun: 'var(--accent-money)', teal: 'var(--accent-route)', lilac: 'var(--accent-stay)', ink: 'var(--surface-inverse)' }[tone] : 'transparent', color: on && tone === 'ink' ? 'var(--text-inverse)' : on ? 'var(--text-on-accent)' : 'var(--text-body)', font: 'var(--type-button)', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background var(--dur-fast)' }}>{typeof o === 'string' ? o : o.label}</button>
      ); })}
    </span>
  );
}
