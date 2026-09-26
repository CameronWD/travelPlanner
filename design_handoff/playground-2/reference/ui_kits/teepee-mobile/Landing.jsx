import React from 'react';
import { Logo } from '../../components/core/Logo.jsx';
import { Button } from '../../components/core/Button.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Input } from '../../components/forms/Input.jsx';
import { H, Col, Row, Muted } from '../shared/kit.jsx';
export function Landing({ onSignIn }) {
  const [email, setEmail] = React.useState('');
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '14px var(--page-gutter) 0' }}><Logo size={26} /></div>
      <div style={{ flex: 1, position: 'relative', padding: '28px var(--page-gutter) 0' }}>
        <H size="display-l" wrap style={{ fontSize: 50, lineHeight: 0.95 }}>Plan it with your people<span style={{ color: 'var(--accent-primary)' }}>.</span></H>
        <Muted style={{ font: 'var(--type-body-l)', color: 'var(--text-body)', marginTop: 14, maxWidth: 300, whiteSpace: 'normal' }}>Stops, sleeps, trains and money in one place — shared with whoever's coming.</Muted>
        <div style={{ position: 'relative', height: 210, marginTop: 22 }}>
          <Card tone="coral" shadow={3} radius="xl" padding={16} style={{ position: 'absolute', left: 0, top: 0, width: 210, transform: 'rotate(-4deg)' }}><Chip size="s" uppercase>Planning</Chip><H size="h4" style={{ marginTop: 10, fontSize: 20 }}>Japan in Autumn</H><Row gap={6} align="baseline"><span style={{ font: 'var(--type-display-l)', letterSpacing: '-.05em' }}>26</span><span style={{ font: 'var(--type-h5)' }}>sleeps<br/>to go</span></Row></Card>
          <Card tone="lilac" padding={12} style={{ position: 'absolute', right: 0, top: 96, width: 140, transform: 'rotate(5deg)' }}><Chip tone="white" size="s">Zz Machiya Gion ✓</Chip><Muted style={{ marginTop: 8, color: 'var(--text-primary)' }}>Kyoto · 4 nights</Muted></Card>
          <Chip tone="sun" style={{ position: 'absolute', left: 120, top: 150, transform: 'rotate(-8deg)', boxShadow: 'var(--shadow-1)' }}>→ Shinkansen · 11:12</Chip>
          <Chip tone="teal" style={{ position: 'absolute', right: 20, top: 170, transform: 'rotate(6deg)', boxShadow: 'var(--shadow-1)' }}>let's go</Chip>
        </div>
      </div>
      <Col gap={10} style={{ padding: '14px var(--page-gutter) 26px', borderTop: 'var(--border)', background: 'var(--surface-card)' }}>
        <Input placeholder="you@email.com" value={email} onChange={setEmail} trailing={<Button size="s" onClick={onSignIn}>Continue</Button>} style={{ }} />
        <Row gap={8}><Button variant="secondary" block onClick={onSignIn} leading={<span style={{ font: 'var(--type-button-l)' }}></span>}>Apple</Button><Button variant="secondary" block onClick={onSignIn} leading={<span style={{ font: 'var(--type-button-l)' }}>G</span>}>Google</Button></Row>
        <Muted style={{ textAlign: 'center', fontSize: 11 }}>No passwords. We'll email you a link.</Muted>
      </Col>
    </div>
  );
}
