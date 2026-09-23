import React from 'react';

export function Toast({ children, tone = 'teal', action, onAction, style }) {
  const bg = { teal: 'var(--accent-route)', coral: 'var(--accent-primary)', sun: 'var(--accent-money)', lilac: 'var(--accent-stay)', ink: 'var(--surface-inverse)' }[tone];
  return (
    <div role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: bg, color: tone === 'ink' ? 'var(--text-inverse)' : 'var(--text-on-accent)', border: 'var(--border)', borderRadius: 'var(--radius-m)', boxShadow: 'var(--shadow-2)', font: 'var(--type-body)', fontWeight: 700, animation: 'pg-toast-in var(--dur-slow) var(--ease-bounce)', ...style }}>
      <span style={{ flex: 1 }}>{children}</span>
      {action && <button type="button" onClick={onAction} style={{ border: 'var(--border)', background: 'var(--surface-page)', color: 'var(--text-primary)', borderRadius: 'var(--radius-pill)', padding: '6px 12px', font: 'var(--type-button)', cursor: 'pointer' }}>{action}</button>}
      <style>{'@keyframes pg-toast-in{from{transform:translateY(16px) scale(.96);opacity:0}to{transform:none;opacity:1}}'}</style>
    </div>
  );
}
