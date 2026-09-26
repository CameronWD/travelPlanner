import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Segmented } from '../../components/forms/Segmented.jsx';
import { H, Label, Muted, Row, Col, TONE } from '../shared/kit.jsx';
import { trip, people, trips, wishlist, october, dayPlan, yen, yenFull } from '../shared/data.js';
export function DDays({ openSheet, sel, setSel }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', padding: '0 2px' }}>{['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => <span key={d}>{d}</span>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
        {october.slice(0, 28).map((c, i) => { const on = c.tone; const selected = c.d === sel; return (
          <div key={i} onClick={() => c.d && setSel(c.d)} style={{ height: 96, borderRadius: 'var(--radius-m)', border: c.d ? (on ? 'var(--border)' : '2px solid var(--outline-soft)') : '2px solid transparent', background: on ? TONE[on] : 'transparent', color: on === 'ink' ? 'var(--text-inverse)' : 'var(--text-primary)', padding: 10, font: 'var(--type-h4)', opacity: c.d && !on ? .5 : 1, boxShadow: selected ? 'var(--shadow-2)' : 'none', transform: selected ? 'translate(-2px,-2px)' : 'none', transition: 'transform var(--dur-fast), box-shadow var(--dur-fast)', cursor: c.d ? 'pointer' : 'default', visibility: c.d ? 'visible' : 'hidden' }}>{c.d}{c.label && <div style={{ font: 'var(--type-micro)', letterSpacing: 'var(--tracking-micro)', marginTop: 8, lineHeight: 1.3 }}>{c.label}</div>}{c.d === 18 && <Chip size="s" tone="coral" style={{ marginTop: 6 }}>6 things</Chip>}</div>); })}
      </div>
      <Row gap={6}><Chip size="s" tone="teal">Tokyo</Chip><Chip size="s" tone="coral">Hakone</Chip><Chip size="s" tone="lilac">Kyoto</Chip><Chip size="s" tone="sun">Osaka</Chip><Chip size="s" tone="ink">Flights</Chip></Row>
    </>
  );
}
export function DDayPanel({ openSheet }) {
  return (
    <>
      <Chip tone="coral" size="s" uppercase style={{ alignSelf: 'flex-start' }}>Packed · 6 things</Chip>
      <H size="h2">{dayPlan.date}</H>
      <Muted style={{ marginTop: -6 }}>Kyoto · check-in day</Muted>
      <Col gap={0}>{dayPlan.items.map(([t, txt], i) => <Row key={t} gap={12} style={{ padding: '10px 0', borderTop: i ? '2px dotted var(--outline-soft)' : 0 }}><span style={{ width: 44, font: 'var(--type-label)', color: 'var(--text-muted)' }}>{t}</span><span style={{ font: 'var(--type-body)' }}>{txt}</span></Row>)}</Col>
      <Card tone="sun" padding={12}><Muted style={{ color: 'var(--text-primary)', whiteSpace: 'normal' }}>Heads up — that's a lot for a travel day. Move one to Sunday?</Muted></Card>
      <Button variant="secondary" block onClick={() => openSheet('thing')}>+ Add to this day</Button>
    </>
  );
}
