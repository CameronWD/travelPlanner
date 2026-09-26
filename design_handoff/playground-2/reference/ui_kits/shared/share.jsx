import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { AvatarStack } from '../../components/core/AvatarStack.jsx';
import { Logo } from '../../components/core/Logo.jsx';
import { H, Label, Muted, Row, Col } from './kit.jsx';
import { trip, people } from './data.js';

// Open Graph image (1200×630, rendered by app/j/[slug]/opengraph-image.tsx). Pass scale to preview smaller.
export function ShareOG({ scale = 0.4 }) {
  return <div style={{ width: 1200 * scale, height: 630 * scale, overflow: 'hidden', flex: 'none', borderRadius: 12 * scale / .4 }}>
    <div data-theme="" style={{ width: 1200, height: 630, transform: `scale(${scale})`, transformOrigin: '0 0', background: '#FF6B4A', color: '#1D1D1B', padding: 64, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', position: 'relative', fontFamily: 'var(--font-display)' }}>
      <Row justify="space-between"><Logo size={44} /><span style={{ font: '800 26px/1 var(--font-body)', letterSpacing: '.08em', padding: '10px 18px', border: '3px solid #1D1D1B', borderRadius: 999, background: '#FFFBF3' }}>12 – 24 OCT</span></Row>
      <div style={{ font: '800 120px/0.92 var(--font-display)', letterSpacing: '-.05em', marginTop: 'auto' }}>Japan in Autumn</div>
      <Row gap={14} style={{ marginTop: 28 }}>{trip.stops.map((s, i) => <span key={s.id} style={{ font: '800 30px/1 var(--font-body)', padding: '12px 20px', border: '3px solid #1D1D1B', borderRadius: 999, background: ['#5BC0BE', '#FFD166', '#C7A2FF', '#FFFBF3'][i], boxShadow: '5px 5px 0 #1D1D1B' }}>{s.name}</span>)}<span style={{ marginLeft: 'auto', font: '700 28px/1 var(--font-body)' }}>Cameron, Jess + Alex</span></Row>
    </div>
  </div>;
}
// Chat-app unfurl around the OG image
export function Unfurl({ scale = 0.3 }) {
  return <div style={{ width: 1200 * scale + 24, border: '1px solid var(--outline-soft)', borderRadius: 16, overflow: 'hidden', background: 'var(--surface-card)' }}>
    <div style={{ padding: 12 }}><ShareOG scale={scale} /></div>
    <div style={{ padding: '0 14px 12px' }}><div style={{ font: 'var(--type-body-s)', fontWeight: 800 }}>Japan in Autumn · Teepee</div><Muted style={{ whiteSpace: 'normal' }}>4 stops, 12 nights. Cameron's planning it with Jess and Alex.</Muted><Muted style={{ marginTop: 2 }}>teepee.app</Muted></div>
  </div>;
}

// Public read-only trip page (/j/[slug]) — a Server Component in the app; only the CTA is client
export function SharePage({ desktop, onJoin }) {
  const pad = desktop ? '28px 48px' : '16px var(--page-gutter)';
  return <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--surface-page)' }}>
    <Row justify="space-between" style={{ padding: pad, paddingBottom: 0 }}><Logo size={desktop ? 28 : 22} /><Row gap={8}>{desktop && <Button variant="ghost" size="s">What's Teepee?</Button>}<Button size="s" variant="secondary">Sign in</Button></Row></Row>
    <div style={{ padding: pad, display: 'flex', flexDirection: 'column', gap: desktop ? 20 : 14, maxWidth: desktop ? 1080 : undefined }}>
      <Card tone="coral" shadow={4} radius="xl" padding={desktop ? 32 : 20}>
        <Row justify="space-between" align="flex-start"><Chip size="s" uppercase tone="white">Shared trip · view only</Chip>{desktop && <AvatarStack people={people} size={36} />}</Row>
        <H size={desktop ? 'display-l' : 'h1'} wrap style={{ marginTop: desktop ? 28 : 18, fontSize: desktop ? 72 : 40, lineHeight: .95 }}>{trip.name}</H>
        <div style={{ font: 'var(--type-body-l)', marginTop: 10 }}>{trip.dates} · {trip.nights} nights · {trip.stops.length} stops</div>
        {!desktop && <Row gap={8} style={{ marginTop: 14 }}><AvatarStack people={people} size={30} /><span style={{ font: 'var(--type-body-s)', fontWeight: 700 }}>Cameron, Jess + Alex</span></Row>}
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: desktop ? '1.3fr 1fr' : '1fr', gap: desktop ? 20 : 14 }}>
        <Card padding={desktop ? 22 : 16}>
          <H size="h4">The route</H>
          <Col gap={0} style={{ marginTop: 12 }}>{trip.stops.map((s, i) => <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><span style={{ width: 22, height: 22, borderRadius: '50%', border: 'var(--border)', background: s.chapter === 'Kanto' ? 'var(--accent-route)' : 'var(--accent-stay)', flex: 'none' }}></span>{i < trip.stops.length - 1 && <span style={{ width: 2, flex: 1, minHeight: 28, background: 'var(--outline)' }}></span>}</div>
            <div style={{ paddingBottom: 14 }}><Row justify="space-between"><span style={{ font: 'var(--type-h5)' }}>{s.name}</span><Muted>{s.from} · {s.nights}n</Muted></Row><Muted style={{ whiteSpace: 'normal' }}>{s.todos.slice(0, 3).join(' · ')}</Muted>{s.out && <Chip size="s" tone="sun" style={{ marginTop: 6 }}>→ {s.out.label}</Chip>}</div>
          </div>)}</Col>
        </Card>
        <Col gap={desktop ? 20 : 14}>
          <Card tone="sun" padding={desktop ? 22 : 16}><Label>Busiest day</Label><H size="h3" style={{ marginTop: 4 }}>Sat 18 Oct</H><Muted style={{ color: 'var(--text-primary)', marginTop: 4, whiteSpace: 'normal' }}>Shinkansen to Kyoto, Nishiki market, Gion walk, Pontocho dinner</Muted></Card>
          <Card tone="lilac" padding={desktop ? 22 : 16}><Label>Money</Label><div style={{ font: 'var(--type-body-s)', marginTop: 6 }}>Hidden on shared links. Only people on the trip see costs.</div></Card>
          <Card tone="ink" padding={desktop ? 24 : 18}><H size="h3" wrap>Going too?</H><div style={{ font: 'var(--type-body-s)', marginTop: 6, marginBottom: 14 }}>Ask Cameron to add you, or copy this trip and make it yours.</div><Row gap={8} style={{ flexWrap: 'wrap' }}><Button variant="accent" onClick={onJoin}>Ask to join</Button><Button variant="secondary">Copy this trip</Button></Row></Card>
        </Col>
      </div>
      <Muted style={{ textAlign: 'center', padding: '8px 0 20px' }}>Made with Teepee · plan it with your people</Muted>
    </div>
  </div>;
}
