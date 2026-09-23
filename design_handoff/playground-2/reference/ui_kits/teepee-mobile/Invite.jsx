import React from 'react';
import { Icon } from '../../components/core/Icon.jsx';
import { Button } from '../../components/core/Button.jsx';
import { IconButton } from '../../components/core/IconButton.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { AvatarStack } from '../../components/core/AvatarStack.jsx';
import { Input } from '../../components/forms/Input.jsx';
import { Segmented } from '../../components/forms/Segmented.jsx';
import { TopBar } from '../../components/navigation/TopBar.jsx';
import { H, Label, Muted, Row, Col, Page } from '../shared/kit.jsx';
import { people } from '../shared/data.js';

// Invite flow: add people → pick access → sent. Shared by desktop (dialog) via InviteBody.
export function InviteBody({ onDone, toast, compact }) {
  const [step, setStep] = React.useState(0);
  const [list, setList] = React.useState([{ v: 'rin@hey.com', ok: true }]);
  const [v, setV] = React.useState('sam.b@');
  const [role, setRole] = React.useState('Can edit');
  const valid = /.+@.+\..+/.test(v);
  const add = () => { if (!v) return; setList([...list, { v, ok: valid }]); setV(''); };
  if (step === 1) return <Col gap={14} style={{ alignItems: 'center', textAlign: 'center', padding: '12px 0' }}>
    <span aria-hidden="true" style={{ width: 72, height: 72, borderRadius: 'var(--radius-l)', background: 'var(--accent-route)', border: 'var(--border)', boxShadow: 'var(--shadow-2)', display: 'grid', placeItems: 'center', font: 'var(--type-h1)', color: 'var(--on-accent-text)' }}>✓</span>
    <H size="h2" wrap>Invites sent</H>
    <div style={{ font: 'var(--type-body-s)', color: 'var(--text-body)', maxWidth: 280 }}>{list.filter(x => x.ok).map(x => x.v).join(', ')} will get an email. They'll show as "invited" until they join.</div>
    <Row gap={8}><Button onClick={onDone}>Done</Button><Button variant="ghost" onClick={() => setStep(0)}>Invite more</Button></Row>
  </Col>;
  return <Col gap={14}>
    <Input label="Email or phone" value={v} onChange={setV} placeholder="jess@example.com" id="inv" hint={v && !valid ? '⚠ Finish the email address to add it' : 'Press Enter to add several'} aria-invalid={v && !valid ? 'true' : undefined} onKeyDown={e => e.key === 'Enter' && valid && add()} trailing={<Button size="s" variant="secondary" disabled={!valid} onClick={add}>Add</Button>} />
    {list.length > 0 && <Row gap={6} style={{ flexWrap: 'wrap' }}>{list.map((x, i) => <Chip key={x.v} tone={x.ok ? 'lilac' : 'coral'} onClick={() => setList(list.filter((_, j) => j !== i))} aria-label={'Remove ' + x.v}>{x.v} ×</Chip>)}</Row>}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><Label>They can</Label><Segmented options={['Can edit', 'Can view']} value={role} onChange={setRole} tone="lilac" /><Muted style={{ whiteSpace: 'normal' }}>{role === 'Can edit' ? 'Add stops, costs and ideas. Only you can delete the trip.' : 'See everything, vote on ideas. No edits.'}</Muted></div>
    <Card tone="sun" padding={14}><Row justify="space-between" gap={10}><div style={{ minWidth: 0 }}><Label>Or share the link</Label><div style={{ font: 'var(--type-body-s)', fontFamily: 'ui-monospace, monospace', fontWeight: 700, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>teepee.app/j/autumn-26</div></div><Button size="s" variant="secondary" onClick={() => toast && toast('Link copied')}>Copy</Button></Row></Card>
    <Button block size="l" disabled={!list.some(x => x.ok)} onClick={() => setStep(1)}>Send {list.filter(x => x.ok).length || ''} invite{list.filter(x => x.ok).length === 1 ? '' : 's'}</Button>
  </Col>;
}
export function Invite({ go, toast }) {
  return <>
    <TopBar title="Invite people" size="m" leading={<IconButton tone="ghost" label="Back" onClick={() => go('shared')}><Icon name="chevron-left" size={22} /></IconButton>} />
    <Page><AvatarStack people={people} size={34} /><InviteBody onDone={() => go('shared')} toast={toast} /></Page>
  </>;
}
