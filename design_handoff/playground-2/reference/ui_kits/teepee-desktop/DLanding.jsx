import React from 'react';
import { Logo } from '../../components/core/Logo.jsx';
import { Button } from '../../components/core/Button.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Input } from '../../components/forms/Input.jsx';
import { Avatar } from '../../components/core/Avatar.jsx';
import { H, Label, Muted, Row, Col, TONE } from '../shared/kit.jsx';
export function DLanding({ onSignIn }) {
  const [email, setEmail] = React.useState('');
  return (
    <div style={{ width: 1280, height: 800, flex: 'none', background: 'var(--surface-page)', color: 'var(--text-primary)', border: '2px solid #1D1D1B', borderRadius: 'var(--radius-2xl)', boxShadow: '8px 8px 0 #1D1D1B', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 440px', font: 'var(--type-body)' }}>
      <div style={{ padding: '32px 48px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        <Row justify="space-between"><Logo size={30} /><Row gap={8}><Button variant="ghost" size="s">How it works</Button><Button variant="secondary" size="s" onClick={onSignIn}>Sign in</Button></Row></Row>
        <H size="display-xl" wrap style={{ fontSize: 88, lineHeight: .92, marginTop: 64, maxWidth: 640 }}>Plan it with your people<span style={{ color: 'var(--accent-primary)' }}>.</span></H>
        <div style={{ font: 'var(--type-body-l)', fontSize: 19, lineHeight: 1.45, color: 'var(--text-body)', marginTop: 22, maxWidth: 480 }}>Stops, sleeps, trains and money in one place — shared with whoever's coming. Fork the plan when you disagree. Count sleeps, not days.</div>
        <Row gap={10} style={{ marginTop: 28 }}><Button size="l" onClick={onSignIn}>Start a trip</Button><Chip tone="sun" size="l">free for up to 6 people</Chip></Row>
        <div style={{ position: 'absolute', left: 48, right: 48, bottom: -30, height: 260 }}>
          <Card tone="coral" shadow={4} radius="xl" padding={20} style={{ position: 'absolute', left: 0, bottom: 40, width: 300, transform: 'rotate(-5deg)' }}><Chip size="s" uppercase tone="white">Planning</Chip><H size="h2" style={{ marginTop: 12 }}>Japan in Autumn</H><Row gap={8} align="baseline"><span style={{ font: 'var(--type-display-xl)', letterSpacing: '-.05em' }}>26</span><span style={{ font: 'var(--type-h4)', fontSize: 22 }}>sleeps<br/>to go</span></Row></Card>
          <Card tone="lilac" shadow={2} padding={16} style={{ position: 'absolute', left: 330, bottom: 90, width: 250, transform: 'rotate(3deg)' }}><Label>Kyoto · 4 nights</Label><H size="h4" style={{ marginTop: 6 }}>Zz Machiya near Gion</H><Chip tone="teal" size="s" style={{ marginTop: 10 }}>paid ✓</Chip></Card>
          <Chip tone="sun" size="l" style={{ position: 'absolute', left: 360, bottom: 30, transform: 'rotate(-7deg)', boxShadow: 'var(--shadow-2)' }}>→ Shinkansen · Odawara 11:12</Chip>
          <Card tone="teal" padding={14} style={{ position: 'absolute', left: 620, bottom: 70, width: 150, transform: 'rotate(6deg)' }}><Row gap={6}><Avatar initials="JM" tone="sun" size={26} /><Avatar initials="AL" tone="lilac" size={26} /></Row><Muted style={{ color: 'var(--text-primary)', marginTop: 8 }}>Jess forked<br/>"Slow Kyoto"</Muted></Card>
        </div>
      </div>
      <div style={{ borderLeft: 'var(--border)', background: 'var(--accent-money)', padding: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Card shadow={4} radius="xl" padding={28}>
          <H size="h2">Come on in</H>
          <Muted style={{ marginTop: 6, whiteSpace: 'normal' }}>No passwords. We'll email you a link.</Muted>
          <Col gap={10} style={{ marginTop: 22 }}>
            <Input label="Email" placeholder="you@email.com" value={email} onChange={setEmail} />
            <Button block size="l" onClick={onSignIn}>Continue</Button>
            <Row gap={8} style={{ margin: '6px 0' }}><span style={{ flex: 1, borderTop: '2px dotted var(--outline-soft)' }} /><Muted>or</Muted><span style={{ flex: 1, borderTop: '2px dotted var(--outline-soft)' }} /></Row>
            <Row gap={8}><Button variant="secondary" block onClick={onSignIn}> Apple</Button><Button variant="secondary" block onClick={onSignIn}>G  Google</Button></Row>
          </Col>
        </Card>
      </div>
    </div>
  );
}
