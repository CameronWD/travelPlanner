import React from 'react';

export function TopBar({ title, leading, trailing, size = 'l', style }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px var(--page-gutter) 0', ...style }}>
      {leading}
      <h1 style={{ margin: 0, flex: 1, minWidth: 0, font: size === 'l' ? 'var(--type-h2)' : 'var(--type-h4)', letterSpacing: 'var(--tracking-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
      {trailing}
    </header>
  );
}
