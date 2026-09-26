import React from 'react';
import { Icon } from '../../components/core/Icon.jsx';
import { Button } from '../../components/core/Button.jsx';
import { IconButton } from '../../components/core/IconButton.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Avatar } from '../../components/core/Avatar.jsx';
import { TopBar } from '../../components/navigation/TopBar.jsx';
import { H, Muted, Row, Page } from '../shared/kit.jsx';
import { wishlist } from '../shared/data.js';
export function Wishlist({ go, openSheet, toast }) {
  const [votes, setVotes] = React.useState({});
  const [filter, setFilter] = React.useState('All');
  return (
    <>
      <TopBar title="Wishlist" leading={<IconButton tone="ghost" label="Back" onClick={() => go('home')}><Icon name="chevron-left" size={22} /></IconButton>} trailing={<Chip size="s">{wishlist.length} ideas</Chip>} />
      <Row gap={6} style={{ padding: '12px var(--page-gutter) 0', flexWrap: 'wrap' }}>{['All', 'Tokyo', 'Kyoto', 'Day trips', 'Food'].map(f => <Chip key={f} tone={filter === f ? 'coral' : 'white'} selected={filter === f} onClick={() => setFilter(f)}>{f}</Chip>)}</Row>
      <Page>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          {wishlist.map((w, i) => { const v = w.votes + (votes[w.title] ? 1 : 0); return (
            <Card key={w.title} tone={w.planned ? 'teal' : i % 3 === 1 ? 'sun' : 'white'} padding={14} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 128 }}>
              <Row justify="space-between"><Avatar initials={w.who} tone={w.tone} size={24} /><Chip size="s" tone={votes[w.title] ? 'coral' : 'white'} onClick={() => setVotes({ ...votes, [w.title]: !votes[w.title] })}><Icon name="heart" size={12} strokeWidth={3} /> {v}</Chip></Row>
              <H wrap size="h5" style={{ marginTop: 10, fontSize: 17, lineHeight: 1.15, overflowWrap: 'anywhere' }}>{w.title}</H>
              <Muted style={{ marginTop: 'auto', paddingTop: 8, color: w.planned ? 'var(--text-primary)' : undefined }}>{w.where}</Muted>
              {!w.planned && <Button size="s" variant="secondary" style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={() => toast(w.title + ' → added to a stop')}>Add to a stop</Button>}
            </Card>); })}
        </div>
        <Button block variant="secondary" onClick={() => openSheet('idea')}>+ Add an idea</Button>
      </Page>
    </>
  );
}
