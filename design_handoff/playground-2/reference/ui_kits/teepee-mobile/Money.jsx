import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { ProgressBar } from '../../components/core/ProgressBar.jsx';
import { Avatar } from '../../components/core/Avatar.jsx';
import { Select } from '../../components/forms/Select.jsx';
import { TopBar } from '../../components/navigation/TopBar.jsx';
import { H, Label, Muted, Row, Page } from '../shared/kit.jsx';
import { trip, people, yen, yenFull } from '../shared/data.js';
export function Money({ openSheet }) {
  const [cur, setCur] = React.useState('JPY');
  const pct = Math.round(trip.spent / trip.est * 100);
  return (
    <>
      <TopBar title="Money" trailing={<Select size="s" value={cur} onChange={setCur} options={['JPY', 'AUD']} />} />
      <Page>
        <Card tone="sun" shadow={3} radius="xl" padding={18}>
          <Row justify="space-between"><Label>Paid</Label><Label>Estimated</Label></Row>
          <Row justify="space-between" align="baseline" style={{ marginTop: 2 }}><H size="h1" style={{ fontSize: 40 }}>{yen(trip.spent)}</H><H size="h3" style={{ color: 'var(--text-body)' }}>{yen(trip.est)}</H></Row>
          <ProgressBar value={pct} height={12} style={{ marginTop: 10 }} />
          <Row justify="space-between" style={{ marginTop: 8 }}><Muted style={{ color: 'var(--text-primary)' }}>{pct}% locked in</Muted><Muted style={{ color: 'var(--text-primary)' }}>≈ A$3,120 total</Muted></Row>
        </Card>
        <Label style={{ color: 'var(--text-muted)', padding: '4px 4px 0' }}>Jars · tap to add a cost</Label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {trip.costs.map(c => { const p = c.est ? Math.round(c.spent / c.est * 100) : 100; return (
            <Card key={c.cat} tone="white" padding={0} onClick={() => openSheet('cost')} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: 78, position: 'relative', background: 'var(--surface-page)', borderBottom: 'var(--border)' }}>
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: p + '%', background: { coral: 'var(--accent-primary)', sun: 'var(--accent-money)', teal: 'var(--accent-route)', lilac: 'var(--accent-stay)', white: 'var(--outline-soft)' }[c.tone], transition: 'height var(--dur-slow) var(--ease-pop)' }} />
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', font: 'var(--type-h5)', color: p > 45 && c.tone !== 'white' ? 'var(--on-accent-text)' : 'var(--text-primary)' }}>{c.est ? yen(c.spent) : '✓'}</div>
              </div>
              <div style={{ padding: '8px 10px' }}><div style={{ font: 'var(--type-caption)', fontWeight: 800 }}>{c.cat}</div><Muted style={{ fontSize: 10 }}>{c.est ? 'of ' + yen(c.est) : c.note}</Muted></div>
            </Card>); })}
          <Card dashed padding={0} onClick={() => openSheet('cost')} style={{ display: 'grid', placeItems: 'center', color: 'var(--text-muted)', font: 'var(--type-h3)' }}>+</Card>
        </div>
        <Card><Row justify="space-between"><H size="h4">Still to pay</H><Chip size="s" tone="sun">3 costs</Chip></Row>
          <Row gap={10} style={{ marginTop: 12 }}><Avatar square initials="Zz" tone="lilac" /><span style={{ flex: 1, font: 'var(--type-body)' }}>Nohga Hotel<br/><Muted>Osaka · due on arrival</Muted></span><span style={{ font: 'var(--type-h5)' }}>¥96,000</span></Row>
          <Row gap={10} style={{ marginTop: 10 }}><Avatar square initials="→" tone="sun" /><span style={{ flex: 1, font: 'var(--type-body)' }}>Romancecar<br/><Muted>Tokyo → Hakone</Muted></span><span style={{ font: 'var(--type-h5)' }}>¥2,470</span></Row>
          <Button variant="secondary" size="s" block style={{ marginTop: 12 }}>Mark one as paid</Button></Card>
      </Page>
    </>
  );
}
