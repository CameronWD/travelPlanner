import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Avatar } from '../../components/core/Avatar.jsx';
import { Toggle } from '../../components/forms/Toggle.jsx';
import { Select } from '../../components/forms/Select.jsx';
import { Segmented } from '../../components/forms/Segmented.jsx';
import { ListRow } from '../../components/navigation/ListRow.jsx';
import { H, Label, Muted, Row, Col, TONE } from '../shared/kit.jsx';
export function DSettings({ dark, setDark, go }) {
  const [notif, setNotif] = React.useState({ sleeps: true, people: true, money: false }); const [cur, setCur] = React.useState('AUD'); const [tone, setTone] = React.useState('teal');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 900 }}>
      <Card tone={tone} shadow={3} radius="xl" padding={22} style={{ gridColumn: 'span 2' }}><Row gap={16}><Avatar initials="CW" tone="ink" size={64} /><div><H size="h2">Cameron W.</H><Muted style={{ color: 'var(--text-primary)' }}>cam@hey.com · Sydney</Muted></div><Row gap={8} style={{ marginLeft: 'auto' }}><Label>Your colour</Label>{['coral', 'sun', 'teal', 'lilac'].map(t => <span key={t} onClick={() => setTone(t)} style={{ width: 32, height: 32, borderRadius: '50%', border: 'var(--border)', background: TONE[t], boxShadow: tone === t ? 'var(--shadow-1)' : 'none', transform: tone === t ? 'translate(-1px,-1px)' : 'none', cursor: 'pointer' }} />)}</Row></Row></Card>
      <Card><H size="h4">Show me</H>
        <Row justify="space-between" style={{ marginTop: 14 }}><span>Costs in</span><Select size="s" value={cur} onChange={setCur} options={['AUD', 'JPY', 'USD', 'EUR']} /></Row>
        <Row justify="space-between" style={{ marginTop: 12 }}><span>Countdown</span><Segmented options={['Sleeps', 'Days']} value="Sleeps" tone="ink" /></Row>
        <Row justify="space-between" style={{ marginTop: 12 }}><span>Theme</span><Segmented options={['Light', 'Dark']} value={dark ? 'Dark' : 'Light'} onChange={v => setDark(v === 'Dark')} tone="ink" /></Row></Card>
      <Card><H size="h4">Nudge me about</H><Col gap={12} style={{ marginTop: 14 }}><Toggle checked={notif.sleeps} onChange={v => setNotif({ ...notif, sleeps: v })} label="Sleeps milestones (30, 7, 1)" /><Toggle checked={notif.people} onChange={v => setNotif({ ...notif, people: v })} label="When my people change the plan" /><Toggle checked={notif.money} onChange={v => setNotif({ ...notif, money: v })} label="Going over a jar" /></Col></Card>
      <Card padding={10} style={{ gridColumn: 'span 2' }}><Row gap={0} style={{ flexWrap: 'wrap' }}><ListRow tile="↗" tileTone="sun" title="Export trip as PDF" style={{ padding: '4px 8px', flex: 1 }} /><ListRow tile="?" tileTone="teal" title="Help & feedback" style={{ padding: '4px 8px', flex: 1 }} /><ListRow tile="←" tileTone="white" title="Sign out" trailing="" style={{ padding: '4px 8px', flex: 1 }} onClick={() => go('landing')} /></Row></Card>
    </div>
  );
}
