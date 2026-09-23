import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function Select({ label, value, options, onChange, size = 'm', style }) {
  const h = size === 's' ? 36 : 48;
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label && <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase' }}>{label}</span>}
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <select value={value} onChange={e => onChange && onChange(e.target.value)} style={{ appearance: 'none', WebkitAppearance: 'none', height: h, padding: size === 's' ? '0 30px 0 12px' : '0 40px 0 16px', background: 'var(--surface-card)', color: 'var(--text-primary)', border: '2px solid var(--outline-control)', borderRadius: size === 's' ? 'var(--radius-pill)' : 'var(--radius-m)', font: size === 's' ? 'var(--type-caption)' : 'var(--type-body-l)', fontWeight: 700, cursor: 'pointer', width: '100%' }}>
          {options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span aria-hidden="true" style={{ position: 'absolute', right: size === 's' ? 10 : 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}><Icon name="chevron-down" size={size === 's' ? 14 : 18} /></span>
      </span>
    </label>
  );
}
