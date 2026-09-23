import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Avatar } from '../../components/core/Avatar.jsx';
import { Toggle } from '../../components/forms/Toggle.jsx';
import { Input } from '../../components/forms/Input.jsx';
import { H, Label, Muted, Row, Col, TONE } from '../shared/kit.jsx';
import { trip, people, trips, wishlist, october, dayPlan, yen, yenFull } from '../shared/data.js';
export function DShared({ toast }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <Col>
        <Card tone="lilac" shadow={3} radius="xl" padding={20}><Label>Trip link</Label><Row justify="space-between" style={{ marginTop: 8 }}><span style={{ font: 'var(--type-h5)', fontFamily: 'ui-monospace, monospace' }}>teepee.app/j/autumn-26</span><Button size="s" variant="secondary" onClick={() => toast('Link copied')}>Copy</Button></Row><Toggle checked={open} onChange={setOpen} label={open ? 'Anyone with the link can edit' : 'Invite only'} style={{ marginTop: 14 }} /></Card>
        <Card><Row justify="space-between"><H size="h4">On this trip</H><Chip size="s">{people.length}</Chip></Row>
          {people.map(p => <Row key={p.initials} gap={12} style={{ marginTop: 12 }}><Avatar initials={p.initials} tone={p.tone} size={40} /><span style={{ flex: 1, font: 'var(--type-body)' }}>{p.name}{p.you ? ' (you)' : ''}<br/><Muted>{p.you ? 'owner · pays for beds' : p.initials === 'JM' ? 'editor · food person' : 'editor · train nerd'}</Muted></span><Chip size="s" tone={p.tone}>{p.you ? 'owner' : 'edit'}</Chip></Row>)}
          <Input placeholder="Invite by email" style={{ marginTop: 14 }} trailing={<Button size="s" variant="secondary">Invite</Button>} /></Card>
        <Card tone="sun"><Label>Forks</Label><Row justify="space-between" style={{ marginTop: 8 }}><span style={{ font: 'var(--type-body)', lineHeight: 1.6 }}>Real plan <Muted style={{ display: 'inline' }}>· everyone</Muted><br/>Slow Kyoto <Muted style={{ display: 'inline' }}>· Jess, 2 days ago</Muted></span><Button size="s" variant="secondary">Compare</Button></Row></Card>
      </Col>
      <Card><H size="h4">What's been happening</H>{[...trip.activity, { who: 'CW', text: 'added Hakone · 1 night', when: 'last week' }, { who: 'AL', text: 'joined the trip', when: 'last week' }].map((a, i) => { const p = people.find(x => x.initials === a.who); return <Row key={i} gap={10} align="flex-start" style={{ marginTop: 14 }}><Avatar initials={p.initials} tone={p.tone} size={28} /><span style={{ flex: 1, font: 'var(--type-body-s)', lineHeight: 1.45 }}><b>{p.name}</b> {a.text}<br/><Muted>{a.when}</Muted></span></Row>; })}</Card>
    </div>
  );
}
