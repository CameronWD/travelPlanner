import React from 'react';
import { Icon } from '../../components/core/Icon.jsx';
import { Button } from '../../components/core/Button.jsx';
import { IconButton } from '../../components/core/IconButton.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Avatar } from '../../components/core/Avatar.jsx';
import { Input } from '../../components/forms/Input.jsx';
import { Segmented } from '../../components/forms/Segmented.jsx';
import { H, Col, Row, Muted, Label } from '../shared/kit.jsx';
const STEPS = ['Who', 'Where', 'When'];
export function Onboarding({ onDone, onBack }) {
  const [step, setStep] = React.useState(0);
  const [who, setWho] = React.useState('With people');
  const [names, setNames] = React.useState(['Jess']);
  const [name, setName] = React.useState('');
  const [where, setWhere] = React.useState('');
  const [when, setWhen] = React.useState('Rough month');
  const tones = ['sun', 'lilac', 'coral'];
  const canNext = step === 0 || (step === 1 ? where.length > 1 : true);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Row style={{ padding: '10px var(--page-gutter) 0' }} justify="space-between">
        <IconButton tone="ghost" label="Back" onClick={() => step ? setStep(step - 1) : onBack()}><Icon name="chevron-left" size={22} /></IconButton>
        <Row gap={6}>{STEPS.map((s, i) => <Chip key={s} size="s" uppercase tone={i === step ? 'coral' : i < step ? 'teal' : 'white'}>{i < step ? '✓ ' : ''}{s}</Chip>)}</Row>
        <Button variant="ghost" size="s" onClick={onDone}>Skip</Button>
      </Row>
      <div style={{ flex: 1, padding: '26px var(--page-gutter) 0', overflowY: 'auto' }}>
        {step === 0 && <Col gap={16}>
          <H size="h1" style={{ fontSize: 40 }}>Who's coming?</H>
          <Segmented options={['Just me', 'With people']} value={who} onChange={setWho} />
          {who === 'With people' && <Card padding={14}>
            <Label>Your people</Label>
            <Row gap={8} style={{ flexWrap: 'wrap', marginTop: 10 }}>
              <Avatar initials="CW" size={40} />
              {names.map((n, i) => <Row key={n} gap={6}><Avatar initials={n.slice(0, 2).toUpperCase()} tone={tones[i % 3]} size={40} /><span style={{ font: 'var(--type-body)' }}>{n}</span></Row>)}
            </Row>
            <Input placeholder="Add a name or email" value={name} onChange={setName} style={{ marginTop: 12 }} trailing={<Button size="s" variant="secondary" onClick={() => { if (name) { setNames([...names, name]); setName(''); } }}>Add</Button>} />
            <Muted style={{ marginTop: 8, whiteSpace: 'normal' }}>They can edit everything. You can always invite more later.</Muted>
          </Card>}
        </Col>}
        {step === 1 && <Col gap={16}>
          <H size="h1" style={{ fontSize: 40 }}>Where are we going?</H>
          <Input size="l" placeholder="A country, a city, a vibe…" value={where} onChange={setWhere} autoFocus />
          <Label style={{ color: 'var(--text-muted)' }}>Or start with</Label>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>{['Japan', 'NZ South Island', 'Europe by rail', 'Somewhere warm', 'Bali', 'Vietnam'].map((s, i) => <Chip key={s} size="l" tone={where === s ? 'coral' : ['white', 'sun', 'teal', 'lilac'][i % 4]} onClick={() => setWhere(s)}>{s}</Chip>)}</Row>
        </Col>}
        {step === 2 && <Col gap={16}>
          <H size="h1" style={{ fontSize: 40 }}>When, roughly?</H>
          <Segmented options={['Exact dates', 'Rough month', 'No idea yet']} value={when} onChange={setWhen} tone="sun" />
          {when === 'Exact dates' && <Row gap={10}><Input label="Leave" placeholder="12 Oct" style={{ flex: 1 }} /><Input label="Back" placeholder="24 Oct" style={{ flex: 1 }} /></Row>}
          {when === 'Rough month' && <Row gap={8} style={{ flexWrap: 'wrap' }}>{['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'].map((m, i) => <Chip key={m} size="l" tone={i === 0 ? 'sun' : 'white'} selected={i === 0}>{m} 26</Chip>)}</Row>}
          {when === 'No idea yet' && <Card tone="lilac">We'll count sleeps once you pick a day. Nothing else needs dates.</Card>}
          <Card tone="teal" padding={16}><Label>Your trip so far</Label><H size="h3" style={{ marginTop: 6 }}>{where || 'Somewhere'}</H><Muted style={{ color: 'var(--text-primary)', marginTop: 2 }}>{who === 'Just me' ? 'Solo' : 'You + ' + names.join(', ')} · {when === 'No idea yet' ? 'no dates' : 'October'}</Muted></Card>
        </Col>}
      </div>
      <div style={{ padding: '12px var(--page-gutter) 26px' }}>
        <Button block size="l" disabled={!canNext} onClick={() => step < 2 ? setStep(step + 1) : onDone()}>{step < 2 ? 'Next' : "Let's go"}</Button>
      </div>
    </div>
  );
}
