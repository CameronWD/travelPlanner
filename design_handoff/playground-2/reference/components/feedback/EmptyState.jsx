import React from 'react';

import { Button } from '../core/Button.jsx';
export function EmptyState({ title, body, action, onAction, tone = 'sun', glyph, style }) {
  const bg = { sun: 'var(--accent-money)', teal: 'var(--accent-route)', lilac: 'var(--accent-stay)', coral: 'var(--accent-primary)' }[tone];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: '28px 20px', border: 'var(--border-dashed)', borderColor: 'var(--outline-soft)', borderRadius: 'var(--radius-xl)', ...style }}>
      <span style={{ width: 64, height: 64, borderRadius: 'var(--radius-l)', background: bg, border: 'var(--border)', boxShadow: 'var(--shadow-2)', display: 'grid', placeItems: 'center', font: 'var(--type-h2)', transform: 'rotate(-6deg)' }}>{glyph}</span>
      <div style={{ font: 'var(--type-h3)', letterSpacing: 'var(--tracking-display)', marginTop: 6, whiteSpace: 'nowrap' }}>{title}</div>
      {body && <div style={{ font: 'var(--type-body-s)', color: 'var(--text-muted)', maxWidth: 260 }}>{body}</div>}
      {action && <Button onClick={onAction} style={{ marginTop: 6 }}>{action}</Button>}
    </div>
  );
}
