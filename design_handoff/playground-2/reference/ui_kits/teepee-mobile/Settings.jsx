import React from 'react';
import { Icon } from '../../components/core/Icon.jsx';
import { Button } from '../../components/core/Button.jsx';
import { IconButton } from '../../components/core/IconButton.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Avatar } from '../../components/core/Avatar.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Toggle } from '../../components/forms/Toggle.jsx';
import { Select } from '../../components/forms/Select.jsx';
import { Segmented } from '../../components/forms/Segmented.jsx';
import { TopBar } from '../../components/navigation/TopBar.jsx';
import { ListRow } from '../../components/navigation/ListRow.jsx';
import { H, Label, Muted, Row, Page } from '../shared/kit.jsx';
export function Settings({ go, dark, setDark }) {
  const [notif, setNotif] = React.useState({ sleeps: true, people: true, money: false });
  const [cur, setCur] = React.useState('AUD');
  const [tone, setTone] = React.useState('teal');
  return (
    <>
      <TopBar title="You" leading={<IconButton tone="ghost" label="Back" onClick={() => go('home')}><Icon name="chevron-left" size={22} /></IconButton>} />
      <Page>
        <Card tone={tone} shadow={3} radius="xl" padding={18}>
          <Row gap={14}><Avatar initials="CW" tone="ink" size={56} /><div><H size="h3">Cameron W.</H><Muted style={{ color: 'var(--text-primary)' }}>cam@hey.com · Sydney</Muted></div></Row>
          <Label style={{ marginTop: 16 }}>Your colour</Label>
          <Row gap={8} style={{ marginTop: 8 }}>{['coral', 'sun', 'teal', 'lilac'].map(t => <span key={t} onClick={() => setTone(t)} style={{ width: 32, height: 32, borderRadius: '50%', border: 'var(--border)', background: { coral: 'var(--accent-primary)', sun: 'var(--accent-money)', teal: 'var(--accent-route)', lilac: 'var(--accent-stay)' }[t], boxShadow: tone === t ? 'var(--shadow-1)' : 'none', transform: tone === t ? 'translate(-1px,-1px)' : 'none', cursor: 'pointer' }} />)}</Row>
        </Card>
        <Card>
          <H size="h4">Show me</H>
          <Row justify="space-between" style={{ marginTop: 12 }}><span style={{ font: 'var(--type-body)' }}>Costs in</span><Select size="s" value={cur} onChange={setCur} options={['AUD', 'JPY', 'USD', 'EUR']} /></Row>
          <Row justify="space-between" style={{ marginTop: 12 }}><span style={{ font: 'var(--type-body)' }}>Countdown</span><Segmented options={['Sleeps', 'Days']} value="Sleeps" tone="ink" /></Row>
          <Row justify="space-between" style={{ marginTop: 12 }}><span style={{ font: 'var(--type-body)' }}>Theme</span><Segmented options={['Light', 'Dark']} value={dark ? 'Dark' : 'Light'} onChange={v => setDark(v === 'Dark')} tone="ink" /></Row>
        </Card>
        <Card>
          <H size="h4">Nudge me about</H>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <Toggle checked={notif.sleeps} onChange={v => setNotif({ ...notif, sleeps: v })} label="Sleeps milestones (30, 7, 1)" />
            <Toggle checked={notif.people} onChange={v => setNotif({ ...notif, people: v })} label="When my people change the plan" />
            <Toggle checked={notif.money} onChange={v => setNotif({ ...notif, money: v })} label="Going over a jar" />
          </div>
        </Card>
        <Card padding={10}>
          <ListRow tile="↗" tileTone="sun" title="Export trip as PDF" style={{ padding: '4px 4px' }} />
          <ListRow tile="?" tileTone="teal" title="Help & feedback" style={{ padding: '4px 4px' }} />
          <ListRow tile="←" tileTone="white" title="Sign out" trailing="" style={{ padding: '4px 4px' }} onClick={() => go('landing')} />
        </Card>
        <Muted style={{ textAlign: 'center' }}>teepee 2.0 · made in Sydney</Muted>
      </Page>
    </>
  );
}
