import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function Checkbox({ checked, onChange, label, style }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', font: 'var(--type-body)', ...style }}>
      <span onClick={() => onChange && onChange(!checked)} role="checkbox" aria-checked={checked} aria-label={typeof label === 'string' ? label : undefined} tabIndex={0} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange && onChange(!checked); } }} style={{ width: 24, height: 24, borderRadius: 'var(--radius-xs)', border: '2px solid var(--outline-control)', background: checked ? 'var(--surface-inverse)' : 'var(--surface-card)', color: 'var(--text-inverse)', display: 'grid', placeItems: 'center', font: 'var(--type-label)', fontWeight: 800, boxSizing: 'border-box', flex: 'none', transition: 'background var(--dur-fast)' }}>{checked && <Icon name="check" size={16} strokeWidth={3.5} />}</span>
      <span style={{ textDecoration: checked ? 'line-through' : 'none', color: checked ? 'var(--text-muted)' : 'var(--text-primary)' }}>{label}</span>
    </label>
  );
}
