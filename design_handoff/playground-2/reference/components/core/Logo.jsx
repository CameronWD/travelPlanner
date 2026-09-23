import React from 'react';

const TENT = (
  <g>
    <path d="M24 5 L43 38 Q44.5 41 41 41 H30 L24 47 L18 41 H7 Q3.5 41 5 38 Z" fill="var(--accent-primary)" stroke="var(--outline)" strokeWidth="2.5" strokeLinejoin="round"/>
    <path d="M24 20 L32 41 H30 L24 47 L18 41 H16 Z" fill="var(--outline)"/>
    <path d="M18 5 L24 12 L30 5" fill="none" stroke="var(--outline)" strokeWidth="2.5" strokeLinecap="round"/>
  </g>
);
export function Logo({ variant = 'lockup', size = 28, color, style }) {
  const mark = <svg width={size} height={size} viewBox="0 0 48 48" style={{ flex: 'none' }}>{TENT}</svg>;
  const word = (
    <span style={{ font: '800 1em/1 var(--font-display)', letterSpacing: '-0.04em', color: color || 'var(--text-primary)', whiteSpace: 'nowrap' }}>
      teepee<span style={{ color: 'var(--accent-primary)' }}>.</span>
    </span>
  );
  if (variant === 'mark') return mark;
  if (variant === 'wordmark') return <span style={{ fontSize: size, display: 'inline-flex', ...style }}>{word}</span>;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.28, fontSize: size * 0.95, ...style }}>{mark}{word}</span>;
}
