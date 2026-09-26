import React from 'react';
// Tiny layout helpers shared by the UI kits (not components — just style shorthands).
export const H = ({ size = 'h2', wrap, children, style }) => <div style={{ font: `var(--type-${size})`, letterSpacing: 'var(--tracking-display)', whiteSpace: wrap ? 'normal' : 'nowrap', ...style }}>{children}</div>;
export const Label = ({ children, style }) => <div style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', whiteSpace: 'nowrap', ...style }}>{children}</div>;
export const Muted = ({ children, style }) => <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.4, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', ...style }}>{children}</div>;
export const Row = ({ children, gap = 10, align = 'center', justify, style, ...r }) => <div {...r} style={{ display: 'flex', gap, alignItems: align, justifyContent: justify, ...style }}>{children}</div>;
export const Col = ({ children, gap = 12, style, ...r }) => <div {...r} style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>;
export const Page = ({ children, gap = 12, style }) => <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap, padding: '12px var(--page-gutter) 20px', ...style }}>{children}</div>;
export const TONE = { coral: 'var(--accent-primary)', sun: 'var(--accent-money)', teal: 'var(--accent-route)', lilac: 'var(--accent-stay)', ink: 'var(--surface-inverse)', white: 'var(--surface-card)' };
