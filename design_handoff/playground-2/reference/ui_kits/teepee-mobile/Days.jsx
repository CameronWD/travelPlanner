import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Segmented } from '../../components/forms/Segmented.jsx';
import { TopBar } from '../../components/navigation/TopBar.jsx';
import { H, Muted, Row, Page, TONE } from '../shared/kit.jsx';
import { october, dayPlan } from '../shared/data.js';
export function Days({ openSheet }) {
  const [view, setView] = React.useState('Month');
  const [sel, setSel] = React.useState(18);
  return (
    <>
      <TopBar title="October" trailing={<Segmented options={['Month', 'Week']} value={view} onChange={setView} tone="sun" />} />
      <Page gap={10}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', font: 'var(--type-micro)', letterSpacing: 'var(--tracking-micro)', color: 'var(--text-muted)', textAlign: 'center' }}>{'MTWTFSS'.split('').map((d, i) => <span key={i}>{d}</span>)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {october.slice(0, 28).map((c, i) => {
            const on = c.tone; const selected = c.d === sel;
            return <div key={i} onClick={() => c.d && setSel(c.d)} style={{ height: 50, borderRadius: 'var(--radius-s)', border: c.d ? (on ? 'var(--border)' : '2px solid var(--outline-soft)') : '2px solid transparent', background: on ? TONE[on] : 'transparent', color: on === 'ink' ? 'var(--text-inverse)' : c.d ? 'var(--text-primary)' : 'transparent', padding: 4, font: 'var(--type-label)', fontWeight: 800, opacity: c.d && !on ? .5 : 1, boxShadow: selected ? 'var(--shadow-1)' : 'none', transform: selected ? 'translate(-1px,-1px)' : 'none', cursor: c.d ? 'pointer' : 'default', overflow: 'hidden', lineHeight: 1 }}>{c.d}{c.label && <div style={{ font: 'var(--type-micro)', fontSize: 7, letterSpacing: 0, marginTop: 4, lineHeight: 1.2 }}>{c.label}</div>}</div>;
          })}
        </div>
        <Row gap={6} style={{ flexWrap: 'wrap' }}><Chip size="s" tone="teal">Tokyo</Chip><Chip size="s" tone="coral">Hakone</Chip><Chip size="s" tone="lilac">Kyoto</Chip><Chip size="s" tone="sun">Osaka</Chip><Chip size="s" tone="ink">Flights</Chip></Row>
        <Card sticker={dayPlan.packed ? <Chip tone="coral" size="s" uppercase>Packed · 6 things</Chip> : null} style={{ marginTop: 8 }}>
          <H size="h4" style={{ marginTop: 4 }}>{dayPlan.date}</H>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>{dayPlan.items.map(([t, txt], i) => <Row key={t} gap={12} style={{ padding: '8px 0', borderTop: i ? '2px dotted var(--outline-soft)' : 0, font: 'var(--type-body)' }}><span style={{ width: 44, font: 'var(--type-label)', color: 'var(--text-muted)' }}>{t}</span><span>{txt}</span></Row>)}</div>
          <Muted style={{ marginTop: 8, whiteSpace: 'normal' }}>Heads up — that's a lot for a travel day. Move one to Sunday?</Muted>
        </Card>
        <Button variant="secondary" block onClick={() => openSheet('thing')}>+ Add to this day</Button>
      </Page>
    </>
  );
}
