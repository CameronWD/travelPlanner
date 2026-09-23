import React from 'react';
export function Frame({ children, dark }) {
  return (
    <div data-theme={dark ? 'dark' : undefined} style={{ width: 390, height: 844, flex: 'none', background: 'var(--surface-page)', color: 'var(--text-primary)', borderRadius: 44, border: '10px solid #1D1D1B', boxShadow: 'var(--shadow-float)', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative', font: 'var(--type-body)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 26px 0', font: 'var(--type-caption)', fontWeight: 700, flex: 'none', whiteSpace: 'nowrap' }}><span>09:41</span><span>●●● ▲</span></div>
      {children}
    </div>
  );
}
