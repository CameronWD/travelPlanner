import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { ProgressBar } from '../../components/core/ProgressBar.jsx';
import { Avatar } from '../../components/core/Avatar.jsx';
import { Select } from '../../components/forms/Select.jsx';
import { H, Label, Muted, Row, Col, TONE } from '../shared/kit.jsx';
import { trip, people, trips, wishlist, october, dayPlan, yen, yenFull } from '../shared/data.js';
export function DMoney({ openSheet }) {
  const pct = Math.round(trip.spent / trip.est * 100);
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14 }}>
        <Card tone="sun" shadow={3} radius="xl" padding={22}>
          <Row justify="space-between"><Label>Paid</Label><Label>Estimated</Label></Row>
          <Row justify="space-between" align="baseline"><H size="display-l" style={{ fontSize: 64 }}>{yen(trip.spent)}</H><H size="h2" style={{ color: 'var(--text-body)' }}>{yen(trip.est)}</H></Row>
          <ProgressBar value={pct} height={14} style={{ marginTop: 12 }} />
          <Row justify="space-between" style={{ marginTop: 8 }}><Muted style={{ color: 'var(--text-primary)' }}>{pct}% locked in</Muted><Muted style={{ color: 'var(--text-primary)' }}>≈ A$3,120 total · A$1,040 each</Muted></Row>
        </Card>
        <Card><Row justify="space-between"><H size="h4">Still to pay</H><Chip size="s" tone="sun">3 costs</Chip></Row>
          <Row gap={10} style={{ marginTop: 12 }}><Avatar square initials="Zz" tone="lilac" /><span style={{ flex: 1, font: 'var(--type-body)' }}>Nohga Hotel<br/><Muted>Osaka · due on arrival</Muted></span><span style={{ font: 'var(--type-h5)' }}>¥96,000</span></Row>
          <Row gap={10} style={{ marginTop: 10 }}><Avatar square initials="→" tone="sun" /><span style={{ flex: 1, font: 'var(--type-body)' }}>Romancecar<br/><Muted>Tokyo → Hakone</Muted></span><span style={{ font: 'var(--type-h5)' }}>¥2,470</span></Row>
          <Button variant="secondary" size="s" style={{ marginTop: 12 }}>Mark one as paid</Button></Card>
      </div>
      <Label style={{ color: 'var(--text-muted)', marginTop: 4 }}>Jars · click to add a cost</Label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        {trip.costs.map(c => { const p = c.est ? Math.round(c.spent / c.est * 100) : 100; return (
          <Card key={c.cat} padding={0} onClick={() => openSheet('cost')} style={{ overflow: 'hidden' }}>
            <div style={{ height: 130, position: 'relative', background: 'var(--surface-page)', borderBottom: 'var(--border)' }}><div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: p + '%', background: c.tone === 'white' ? 'var(--outline-soft)' : TONE[c.tone] }} /><div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', font: 'var(--type-h3)', color: p > 45 && c.tone !== 'white' ? 'var(--on-accent-text)' : 'var(--text-primary)' }}>{c.est ? yen(c.spent) : '✓'}</div></div>
            <div style={{ padding: '10px 12px' }}><div style={{ font: 'var(--type-body)', fontWeight: 800 }}>{c.cat}</div><Muted>{c.est ? 'of ' + yen(c.est) + ' · ' + c.note : c.note}</Muted></div>
          </Card>); })}
        <Card dashed padding={0} onClick={() => openSheet('cost')} style={{ display: 'grid', placeItems: 'center', color: 'var(--text-muted)', font: 'var(--type-h2)' }}>+</Card>
      </div>
      <Card><H size="h4">Recent</H>{[['Machiya near Gion · 4 nights', 'CW · Beds', 88000], ['Nohga Hotel Ueno · 4 nights', 'CW · Beds', 96000], ['Shinkansen Hikari ×3', 'AL · Trains · not paid', 39240]].map(([t, s, v], i) => <Row key={i} justify="space-between" style={{ marginTop: 10, font: 'var(--type-body)' }}><span style={{ whiteSpace: 'nowrap' }}>{t}<Muted>{s}</Muted></span><span style={{ font: 'var(--type-h5)' }}>{yenFull(v)}</span></Row>)}</Card>
    </>
  );
}
