import React from 'react';

export function Toggle({ checked, onChange, label, style }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', font: 'var(--type-body)', ...style }}>
      <span onClick={() => onChange && onChange(!checked)} role="switch" aria-checked={checked} aria-label={typeof label === 'string' ? label : undefined} tabIndex={0} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange && onChange(!checked); } }} style={{ width: 52, height: 30, borderRadius: 'var(--radius-pill)', border: '2px solid var(--outline-control)', background: checked ? 'var(--accent-route)' : 'var(--surface-card)', position: 'relative', transition: 'background var(--dur-base)', boxSizing: 'border-box', flex: 'none' }}>
        <span style={{ position: 'absolute', top: 2, left: checked ? 24 : 2, width: 22, height: 22, borderRadius: '50%', background: 'var(--surface-inverse)', transition: 'left var(--dur-base) var(--ease-bounce)' }} />
      </span>
      {label}
    </label>
  );
}
