import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function Stepper({ value, min = 0, max = 99, onChange, unit, style }) {
  const btn = (glyph, d, ink) => <button type="button" aria-label={d < 0 ? 'Decrease' : 'Increase'} disabled={d < 0 ? value <= min : value >= max} onClick={() => onChange && onChange(Math.min(max, Math.max(min, value + d)))} style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--outline-control)', background: ink ? 'var(--surface-inverse)' : 'var(--surface-card)', color: ink ? 'var(--text-inverse)' : 'var(--text-primary)', font: 'var(--type-button-l)', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}>{glyph}</button>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 4, background: 'var(--surface-page)', border: '2px solid var(--outline-control)', borderRadius: 'var(--radius-pill)', ...style }}>
      {btn(<Icon name="minus" size={18} />, -1)}
      <span aria-live="polite" style={{ minWidth: 34, textAlign: 'center', font: 'var(--type-h4)', whiteSpace: 'nowrap' }}>{value}{unit && <span style={{ font: 'var(--type-caption)', marginLeft: 3 }}>{unit}</span>}</span>
      {btn(<Icon name="plus" size={18} />, 1, true)}
    </span>
  );
}
