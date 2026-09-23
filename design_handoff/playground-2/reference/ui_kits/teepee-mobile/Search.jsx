import React from 'react';
import { Icon } from '../../components/core/Icon.jsx';
import { Button } from '../../components/core/Button.jsx';
import { IconButton } from '../../components/core/IconButton.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Avatar } from '../../components/core/Avatar.jsx';
import { Input } from '../../components/forms/Input.jsx';
import { ListRow } from '../../components/navigation/ListRow.jsx';
import { H, Label, Muted, Row, Page } from '../shared/kit.jsx';
import { EmptyScreen } from '../shared/states.jsx';
import { searchIndex } from '../shared/search.js';

export function Search({ go }) {
  const [q, setQ] = React.useState('kyo');
  const hits = searchIndex(q);
  return (
    <>
      <Row gap={8} style={{ padding: '12px var(--page-gutter) 0' }}>
        <IconButton tone="ghost" label="Back" onClick={() => go('home')}><Icon name="chevron-left" size={22} /></IconButton>
        <Input value={q} onChange={setQ} placeholder="Places, days, people, costs" aria-label="Search this trip" style={{ flex: 1 }} trailing={q && <IconButton tone="ghost" size={32} label="Clear" onClick={() => setQ('')}><Icon name="x" size={16} /></IconButton>} />
      </Row>
      <Page>
        {!q && <>
          <Label style={{ color: 'var(--text-muted)' }}>Recent</Label>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>{['Hakone', 'Sat 18', 'Jess', 'Trains'].map(s => <Chip key={s} onClick={() => setQ(s)}>{s}</Chip>)}</Row>
          <Label style={{ color: 'var(--text-muted)', marginTop: 8 }}>Jump to</Label>
          <Card padding={10}>{[['Zz', 'lilac', 'Beds with no booking', '1 · Hakone'], ['→', 'sun', 'Legs to book', '2 · ¥15.5k'], ['♥', 'coral', 'Top-voted ideas', 'Naoshima · 3 votes']].map(([t, tone, title, sub]) => <ListRow key={title} tile={t} tileTone={tone} title={title} sub={sub} style={{ padding: '4px' }} onClick={() => {}} />)}</Card>
        </>}
        {q && hits.total === 0 && <EmptyScreen kind="Search" />}
        {q && hits.groups.map(g => <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Row justify="space-between"><Label style={{ color: 'var(--text-muted)' }}>{g.label}</Label><Muted>{g.items.length}</Muted></Row>
          <Card padding={10}>{g.items.map(it => <ListRow key={it.title} tile={it.tile} tileTone={it.tone} title={<Hl text={it.title} q={q} />} sub={it.sub} style={{ padding: '4px' }} onClick={() => go(it.go, it.id)} />)}</Card>
        </div>)}
      </Page>
    </>
  );
}
export const Hl = ({ text, q }) => { const i = text.toLowerCase().indexOf(q.toLowerCase()); if (i < 0 || !q) return text; return <>{text.slice(0, i)}<mark style={{ background: 'var(--accent-money)', color: 'var(--on-accent-text)', borderRadius: 4, padding: '0 2px' }}>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>; };
