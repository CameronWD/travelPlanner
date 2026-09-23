import React from 'react';
import { Logo } from '../../components/core/Logo.jsx';
import { Button } from '../../components/core/Button.jsx';
import { Card } from '../../components/core/Card.jsx';
import { H, Label, Muted, Page, Row } from '../shared/kit.jsx';
import { trips } from '../shared/data.js';
const Stamp = ({ text, tone, rot = -12 }) => <span style={{ width: 84, height: 84, borderRadius: '50%', border: '3px dashed var(--outline)', opacity: .45, transform: `rotate(${rot}deg)`, display: 'grid', placeItems: 'center', font: 'var(--type-micro)', letterSpacing: 'var(--tracking-micro)', textAlign: 'center', lineHeight: 1.3, position: 'absolute', right: -8, top: -8 }}>{text}</span>;
export function Trips({ go }) {
  return (
    <>
      <div style={{ padding: '14px var(--page-gutter) 0' }}><Logo size={22} /><H size="h2" style={{ marginTop: 14 }}>Your trips</H><Muted style={{ marginTop: 4 }}>3 planned · 1 done · 12 countries so far</Muted></div>
      <Page>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {trips.map((t, i) => <Card key={t.name} tone={t.tone} radius={t.big ? 'xl' : 'l'} padding={t.big ? 20 : 16} onClick={() => go('home')} style={{ gridColumn: t.big || i === 3 ? 'span 2' : 'auto', overflow: 'hidden', minHeight: t.big ? 0 : 124, display: 'flex', flexDirection: 'column' }}>
            {t.big && <Stamp text={<>JPN<br/>OCT 26</>} />}
            {i === 3 && <Stamp text="TAS" rot={8} />}
            <Label style={{ color: t.tone === 'white' ? 'var(--text-muted)' : undefined }}>{t.status}</Label>
            <H size={t.big ? 'h2' : 'h4'} style={{ marginTop: 6 }}>{t.name}</H>
            <Muted style={{ marginTop: 'auto', paddingTop: 6, color: t.tone === 'white' ? 'var(--text-muted)' : 'var(--text-primary)' }}>{t.sub}</Muted>
          </Card>)}
        </div>
        <Button variant="dashed" block onClick={() => go('onboarding')}>+ Start a new trip</Button>
      </Page>
    </>
  );
}
