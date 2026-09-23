import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function Sheet({ open, title, onClose, children, footer, desktop, style }) {
  const panel = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    panel.current && panel.current.focus();
    const k = e => { if (e.key === 'Escape' && onClose) onClose(); };
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('keydown', k); prev && prev.focus && prev.focus(); };
  }, [open]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(29,29,27,.35)', display: 'flex', alignItems: desktop ? 'center' : 'flex-end', justifyContent: 'center', zIndex: 20, padding: desktop ? 24 : 0 }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="pg-sheet-title" tabIndex={-1} onClick={e => e.stopPropagation()} style={{ width: desktop ? 480 : '100%', maxHeight: '90%', background: 'var(--surface-page)', border: 'var(--border)', borderBottom: desktop ? 'var(--border)' : 0, borderRadius: desktop ? 'var(--radius-2xl)' : '28px 28px 0 0', boxShadow: desktop ? 'var(--shadow-5)' : 'none', padding: '14px var(--page-gutter) 22px', display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box', outline: 'none', animation: 'pg-sheet-in var(--dur-slow) var(--ease-pop)', ...style }}>
        {!desktop && <span aria-hidden="true" style={{ width: 44, height: 5, borderRadius: 3, background: 'var(--outline)', alignSelf: 'center' }} />}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span id="pg-sheet-title" style={{ font: 'var(--type-h3)', letterSpacing: 'var(--tracking-display)', whiteSpace: 'nowrap' }}>{title}</span>
          <button type="button" aria-label="Close" onClick={onClose} style={{ width: 44, height: 44, borderRadius: 'var(--radius-s)', border: 'var(--border)', background: 'var(--surface-card)', font: 'var(--type-button-l)', cursor: 'pointer', padding: 0, display: 'grid', placeItems: 'center', color: 'var(--text-primary)' }}><Icon name="x" size={20} /></button>
        </div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
        {footer}
      </div>
      <style>{'@keyframes pg-sheet-in{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}'}</style>
    </div>
  );
}
