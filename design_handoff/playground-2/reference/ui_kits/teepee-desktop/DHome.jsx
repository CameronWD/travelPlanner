import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Badge } from '../../components/core/Badge.jsx';
import { Card } from '../../components/core/Card.jsx';
import { StatCard } from '../../components/core/StatCard.jsx';
import { ProgressBar } from '../../components/core/ProgressBar.jsx';
import { AvatarStack } from '../../components/core/AvatarStack.jsx';
import { ListRow } from '../../components/navigation/ListRow.jsx';
import { EmptyState } from '../../components/feedback/EmptyState.jsx';
import { H, Label, Muted, Row, Col, TONE } from '../shared/kit.jsx';
import { trip, people, trips, wishlist, october, dayPlan, yen, yenFull } from '../shared/data.js';
export function DHome({ go, openSheet, empty }) {
  if (empty) return <><H size="h1">Hey Cameron</H><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8, maxWidth: 800 }}><EmptyState glyph="✈" tone="coral" title="Nothing planned yet" body="Start with where. Dates, beds and money can come later." action="+ Start a trip" onAction={() => go('trips')} /><Card tone="sun" padding={20}><Label>Or</Label><ListRow tile="⇥" tileTone="white" title="Join a friend's trip" sub="Paste an invite link" style={{ marginTop: 10 }} /></Card></div></>;
  return (
    <>
      <Row justify="space-between" style={{ marginBottom: 6 }}><div><Muted>Hey Cameron</Muted><H size="h1" style={{ fontSize: 40 }}>{trip.name}</H></div><AvatarStack people={people} size={36} /></Row>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gridTemplateRows: 'auto auto', gap: 14 }}>
        <Card tone="coral" shadow={3} radius="xl" padding={22} onClick={() => go('plan')} style={{ gridRow: 'span 2', display: 'flex', flexDirection: 'column' }}>
          <Row justify="space-between" align="flex-start"><Chip size="s" uppercase tone="white">Planning</Chip><Label>{trip.dates} · {trip.currency}</Label></Row>
          <Row gap={10} align="baseline" style={{ marginTop: 'auto' }}><span style={{ font: 'var(--type-display-xl)', fontSize: 120, letterSpacing: '-.06em', lineHeight: .9 }}>{trip.sleeps}</span><span style={{ font: 'var(--type-h2)', lineHeight: 1.05 }}>sleeps<br/>to go</span></Row>
          <Muted style={{ color: 'var(--text-primary)', marginTop: 12 }}>{trip.home.city} {trip.home.dep} · {trip.home.flight} → {trip.home.arr}</Muted>
        </Card>
        <StatCard label="Spent" value={yen(trip.spent)} progress={Math.round(trip.spent / trip.est * 100)} sub={`of ${yen(trip.est)} est`} />
        <Card tone="teal" onClick={() => go('plan')}><Label>Route · {trip.nights} nights</Label><div style={{ font: 'var(--type-h5)', lineHeight: 1.35, marginTop: 6 }}>{trip.stops.map(s => <div key={s.id}>{s.name} <Muted style={{ display: 'inline', color: 'var(--text-primary)' }}>{s.nights}n</Muted></div>)}</div></Card>
        <Card tone="lilac"><Label>Beds</Label><H size="h3" style={{ marginTop: 4 }}>3 of 4</H><Muted style={{ color: 'var(--text-primary)', marginTop: 6 }}>Hakone still needs one</Muted></Card>
        <Card tone="sun" onClick={() => go('days')}><Label>Busiest day</Label><H size="h3" style={{ marginTop: 4 }}>Sat 18</H><Muted style={{ color: 'var(--text-primary)', marginTop: 6 }}>6 things · travel day</Muted></Card>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card><Row justify="space-between"><H size="h4">Sort these out</H><Badge count={trip.todo.length} /></Row>{trip.todo.map(t => <ListRow key={t.title} tile={t.tile} tileTone={t.tone} title={t.title} sub={t.sub} style={{ marginTop: 12 }} onClick={() => go('plan', t.stop)} />)}</Card>
        <Card><H size="h4">What's been happening</H>{trip.activity.slice(0, 3).map((a, i) => <Row key={i} gap={10} align="flex-start" style={{ marginTop: 12 }}><Chip size="s" tone={people.find(p => p.initials === a.who).tone}>{a.who}</Chip><span style={{ flex: 1, font: 'var(--type-body-s)' }}>{a.text}<Muted style={{ display: 'inline' }}> · {a.when}</Muted></span></Row>)}</Card>
      </div>
    </>
  );
}
