import React from 'react';

import { Card } from './Card.jsx';
import { ProgressBar } from './ProgressBar.jsx';
export function StatCard({ label, value, sub, tone = 'sun', progress, big, style }) {
  return (
    <Card tone={tone} style={style}>
      <div style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ font: big ? 'var(--type-display-l)' : 'var(--type-h3)', fontSize: big ? 56 : 26, letterSpacing: big ? 'var(--tracking-display-xl)' : 'var(--tracking-display)', marginTop: 4, whiteSpace: 'nowrap' }}>{value}</div>
      {progress != null && <ProgressBar value={progress} style={{ marginTop: 8 }} />}
      {sub && <div style={{ font: 'var(--type-caption)', marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
