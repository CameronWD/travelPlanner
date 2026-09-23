import React from 'react';

export function ProgressBar({ value = 0, height = 10, fill = 'var(--surface-inverse)', label, style }) {
  return (
    <div role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label} style={{ height, border: 'var(--border)', borderRadius: 'var(--radius-pill)', background: 'var(--surface-page)', overflow: 'hidden', boxSizing: 'border-box', ...style }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', background: fill, transition: 'width var(--dur-slow) var(--ease-pop)' }} />
    </div>
  );
}
