import React from 'react';
import { Logo } from '../../components/core/Logo.jsx';
import { Button } from '../../components/core/Button.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Badge } from '../../components/core/Badge.jsx';
import { Card } from '../../components/core/Card.jsx';
import { StatCard } from '../../components/core/StatCard.jsx';
import { AvatarStack } from '../../components/core/AvatarStack.jsx';
import { ListRow } from '../../components/navigation/ListRow.jsx';
import { EmptyState } from '../../components/feedback/EmptyState.jsx';
import { H, Label, Row, Page } from '../shared/kit.jsx';
import { trip, people, yen } from '../shared/data.js';
export function Home({ go, openSheet, empty }) {
  return (
    <>
      <Row justify="space-between" style={{ padding: '14px var(--page-gutter) 0' }}><Logo size={22} /><AvatarStack people={people} /></Row>
      <Page>
        {empty ? <>
          <H size="h1" style={{ marginTop: 8 }}>Hey Cameron</H>
          <EmptyState glyph="✈" tone="coral" title="Nothing planned yet" body="Start with where. Dates, beds and money can come later." action="+ Start a trip" onAction={() => go('onboarding')} style={{ marginTop: 8 }} />
          <Card tone="sun"><Label>Or</Label><ListRow tile="⇥" tileTone="white" title="Join a friend's trip" sub="Paste an invite link" style={{ marginTop: 8 }} /></Card>
        </> : <>
          <Card tone="coral" shadow={3} radius="xl" padding={18} onClick={() => go('plan')}>
            <Row justify="space-between" align="flex-start"><Chip size="s" uppercase tone="white">Planning</Chip><Label>{trip.dates} · {trip.currency}</Label></Row>
            <H size="h1" style={{ fontSize: 34, marginTop: 14 }}>{trip.name}</H>
            <Row gap={8} align="baseline" style={{ marginTop: 10 }}><span style={{ font: 'var(--type-display-xl)', letterSpacing: 'var(--tracking-display-xl)', whiteSpace: 'nowrap' }}>{trip.sleeps}</span><span style={{ font: 'var(--type-h4)', fontSize: 22, lineHeight: 1.05 }}>sleeps<br/>to go</span></Row>
          </Card>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <StatCard label="Spent" value={yen(trip.spent)} progress={Math.round(trip.spent / trip.est * 100)} sub={`of ${yen(trip.est)} est`} />
            <Card tone="teal" onClick={() => go('plan')}><Label>Route</Label><div style={{ font: 'var(--type-h5)', lineHeight: 1.3, marginTop: 6 }}>{trip.stops.map((s, i) => <span key={s.id}>{s.name}{i < trip.stops.length - 1 ? ' →' : ''}<br/></span>)}</div></Card>
          </div>
          <Card>
            <Row justify="space-between"><H size="h4">Sort these out</H><Badge count={trip.todo.length} /></Row>
            {trip.todo.map(t => <ListRow key={t.title} tile={t.tile} tileTone={t.tone} title={t.title} sub={t.sub} style={{ marginTop: 12 }} onClick={() => go('stop', t.stop)} />)}
          </Card>
          <Row gap={8} style={{ flexWrap: 'wrap' }}><Button size="s" onClick={() => openSheet('place')}>+ Add place</Button><Button size="s" variant="secondary" onClick={() => openSheet('cost')}>+ Cost</Button><Button size="s" variant="secondary" onClick={() => go('wishlist')}>Wishlist</Button></Row>
        </>}
      </Page>
    </>
  );
}
