import React from 'react';
import { Icon } from '../../components/core/Icon.jsx';
import { Button } from '../../components/core/Button.jsx';
import { IconButton } from '../../components/core/IconButton.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Avatar } from '../../components/core/Avatar.jsx';
import { Toggle } from '../../components/forms/Toggle.jsx';
import { TopBar } from '../../components/navigation/TopBar.jsx';
import { H, Label, Muted, Row, Page } from '../shared/kit.jsx';
import { trip, people } from '../shared/data.js';
export function Shared({ go, toast }) {
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <TopBar title="Your people" leading={<IconButton tone="ghost" label="Back" onClick={() => go('home')}><Icon name="chevron-left" size={22} /></IconButton>} />
      <Page>
        <Card tone="lilac" shadow={3} radius="xl" padding={18}>
          <Label>Trip link</Label>
          <Row justify="space-between" style={{ marginTop: 8 }}><span style={{ font: 'var(--type-h5)', fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>teepee.app/j/autumn-26</span><Button size="s" variant="secondary" onClick={() => toast('Link copied')}>Copy</Button></Row>
          <Toggle checked={open} onChange={setOpen} label={open ? 'Anyone with the link can edit' : 'Invite only'} style={{ marginTop: 14 }} />
        </Card>
        <Card>
          <Row justify="space-between"><H size="h4">On this trip</H><Chip size="s">{people.length}</Chip></Row>
          {people.map(p => <Row key={p.initials} gap={12} style={{ marginTop: 12 }}><Avatar initials={p.initials} tone={p.tone} size={40} /><span style={{ flex: 1, font: 'var(--type-body)' }}>{p.name}{p.you ? ' (you)' : ''}<br/><Muted>{p.you ? 'owner · pays for beds' : p.initials === 'JM' ? 'editor · food person' : 'editor · train nerd'}</Muted></span><Chip size="s" tone={p.tone}>{p.you ? 'owner' : 'edit'}</Chip></Row>)}
          <Button variant="dashed" size="s" block style={{ marginTop: 12 }} onClick={() => go('invite')}>+ Invite someone</Button>
        </Card>
        <Card>
          <H size="h4">What's been happening</H>
          {trip.activity.map((a, i) => { const p = people.find(x => x.initials === a.who); return <Row key={i} gap={10} align="flex-start" style={{ marginTop: 12 }}><Avatar initials={p.initials} tone={p.tone} size={26} /><span style={{ flex: 1, font: 'var(--type-body-s)', lineHeight: 1.4, whiteSpace: 'normal' }}><b>{p.name}</b> {a.text}<br/><Muted>{a.when}</Muted></span></Row>; })}
        </Card>
        <Card tone="sun">
          <Label>Forks</Label>
          <Row justify="space-between" style={{ marginTop: 8 }}><span style={{ font: 'var(--type-body)' }}>Real plan <Muted style={{ display: 'inline' }}>· everyone</Muted><br/>Slow Kyoto <Muted style={{ display: 'inline' }}>· Jess, 2 days ago</Muted></span><Button size="s" variant="secondary">Compare</Button></Row>
        </Card>
      </Page>
    </>
  );
}
