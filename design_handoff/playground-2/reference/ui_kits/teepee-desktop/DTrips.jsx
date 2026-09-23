import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { Card } from '../../components/core/Card.jsx';
import { H, Label, Muted, Row, Col, TONE } from '../shared/kit.jsx';
import { trip, people, trips, wishlist, october, dayPlan, yen, yenFull } from '../shared/data.js';
export function DTrips({ go }) {
  return (
    <>
      <Muted style={{ marginTop: -12 }}>3 planned · 1 done · 12 countries so far</Muted>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {trips.map((t, i) => <Card key={t.name} tone={t.tone} radius="xl" padding={22} shadow={t.big ? 3 : 2} onClick={() => go('home')} style={{ gridColumn: t.big ? 'span 2' : 'auto', minHeight: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          <span style={{ position: 'absolute', right: -14, top: -14, width: 110, height: 110, borderRadius: '50%', border: '3px dashed var(--outline)', opacity: .4, transform: 'rotate(-12deg)', display: 'grid', placeItems: 'center', font: 'var(--type-micro)', letterSpacing: 'var(--tracking-micro)', textAlign: 'center' }}>{['JPN', 'NZ', 'EU', 'TAS'][i]}<br/>{['OCT 26', 'DEC 26', '27', 'MAR 26'][i]}</span>
          <Label style={{ color: t.tone === 'white' ? 'var(--text-muted)' : undefined }}>{t.status}</Label>
          <H size={t.big ? 'h1' : 'h3'} style={{ marginTop: 8, fontSize: t.big ? 44 : 26 }}>{t.name}</H>
          <Muted style={{ marginTop: 'auto', color: t.tone === 'white' ? undefined : 'var(--text-primary)' }}>{t.sub}</Muted>
        </Card>)}
        <Card dashed radius="xl" style={{ display: 'grid', placeItems: 'center', minHeight: 200, color: 'var(--text-muted)', font: 'var(--type-button-l)' }} onClick={() => go('home')}>+ Start a new trip</Card>
      </div>
    </>
  );
}
