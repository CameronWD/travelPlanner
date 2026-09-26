import React from 'react';
import { Icon } from '../../components/core/Icon.jsx';
import { Button } from '../../components/core/Button.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Avatar } from '../../components/core/Avatar.jsx';
import { H, Label, Muted, Row, Col, TONE } from '../shared/kit.jsx';
import { trip, people, trips, wishlist, october, dayPlan, yen, yenFull } from '../shared/data.js';
export function DWishlist({ openSheet, toast }) {
  const [votes, setVotes] = React.useState({}); const [filter, setFilter] = React.useState('All');
  return (
    <>
      <Row gap={6} style={{ marginTop: -8 }}>{['All', 'Tokyo', 'Kyoto', 'Day trips', 'Food', 'Unplaced'].map(f => <Chip key={f} tone={filter === f ? 'coral' : 'white'} selected={filter === f} onClick={() => setFilter(f)}>{f}</Chip>)}</Row>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18, padding: '8px 4px' }}>
        {wishlist.map((w, i) => { const v = w.votes + (votes[w.title] ? 1 : 0); return (
          <Card key={w.title} tone={w.planned ? 'teal' : i % 3 === 1 ? 'sun' : 'white'} padding={18} style={{ display: 'flex', flexDirection: 'column', minHeight: 170 }}>
            <Row justify="space-between"><Row gap={6}><Avatar initials={w.who} tone={w.tone} size={26} /><Muted>{people.find(p => p.initials === w.who).name}</Muted></Row><Chip size="s" tone={votes[w.title] ? 'coral' : 'white'} onClick={() => setVotes({ ...votes, [w.title]: !votes[w.title] })}><Icon name="heart" size={12} strokeWidth={3} /> {v}</Chip></Row>
            <H wrap size="h3" style={{ marginTop: 14 }}>{w.title}</H>
            <Muted style={{ marginTop: 'auto', paddingTop: 10, color: w.planned ? 'var(--text-primary)' : undefined }}>{w.where}</Muted>
            {!w.planned && <Button size="s" variant="secondary" style={{ marginTop: 10, alignSelf: 'flex-start' }} onClick={() => toast(w.title + ' → added to a stop')}>Add to a stop</Button>}
          </Card>); })}
        <Card dashed style={{ display: 'grid', placeItems: 'center', minHeight: 170, color: 'var(--text-muted)', font: 'var(--type-button-l)' }} onClick={() => openSheet('idea')}>+ Add an idea</Card>
      </div>
    </>
  );
}
