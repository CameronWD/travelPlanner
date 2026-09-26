import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Avatar } from '../../components/core/Avatar.jsx';
import { Logo } from '../../components/core/Logo.jsx';
import { Input } from '../../components/forms/Input.jsx';
import { Segmented } from '../../components/forms/Segmented.jsx';
import { ListRow } from '../../components/navigation/ListRow.jsx';
import { H, Label, Muted, Row, Col } from '../shared/kit.jsx';
import { Skeleton, SkeletonCard, Loading, OfflineBanner, SyncChip, ErrorPanel, InlineError, PermissionCard } from '../shared/states.jsx';
import { searchIndex } from '../shared/search.js';
import { SharePage, Unfurl, ShareOG } from '../shared/share.jsx';
import { Hl } from '../teepee-mobile/Search.jsx';
import { trip } from '../shared/data.js';

const STEPS = ['Who', 'Where', 'When'];
export function DOnboarding({ onDone, dark }) {
  const [step, setStep] = React.useState(0);
  const [who, setWho] = React.useState('With people'); const [names, setNames] = React.useState(['Jess']); const [name, setName] = React.useState('');
  const [where, setWhere] = React.useState(''); const [when, setWhen] = React.useState('Rough month'); const [month, setMonth] = React.useState('Oct');
  const tones = ['sun', 'lilac', 'coral'];
  return <div data-theme={dark ? 'dark' : undefined} style={{ width: 1280, height: 800, background: 'var(--surface-page)', color: 'var(--text-primary)', border: '2px solid #1D1D1B', borderRadius: 'var(--radius-2xl)', boxShadow: '8px 8px 0 #1D1D1B', overflow: 'hidden', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 520px', font: 'var(--type-body)' }}>
    <div style={{ padding: '32px 56px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Row justify="space-between"><Logo size={26} /><Row gap={6}>{STEPS.map((s, i) => <Chip key={s} size="s" uppercase tone={i === step ? 'coral' : i < step ? 'teal' : 'white'} onClick={i < step ? () => setStep(i) : undefined}>{i < step ? '✓ ' : ''}{s}</Chip>)}</Row><Button variant="ghost" size="s" onClick={onDone}>Skip for now</Button></Row>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 560, gap: 20 }}>
        <Label style={{ color: 'var(--text-muted)' }}>Step {step + 1} of 3</Label>
        {step === 0 && <><H size="display-l" style={{ fontSize: 64 }}>Who's coming?</H><Segmented options={['Just me', 'With people']} value={who} onChange={setWho} />
          {who === 'With people' && <Col gap={12}><Input label="Add a name or email" id="ob-name" value={name} onChange={setName} placeholder="jess@example.com" onKeyDown={e => { if (e.key === 'Enter' && name) { setNames([...names, name]); setName(''); } }} trailing={<Button size="s" variant="secondary" disabled={!name} onClick={() => { setNames([...names, name]); setName(''); }}>Add</Button>} hint="They'll get an invite once the trip exists. They can edit everything." />
            <Row gap={8} style={{ flexWrap: 'wrap' }}><Chip tone="teal">CW · you</Chip>{names.map((n, i) => <Chip key={n} tone={tones[i % 3]} onClick={() => setNames(names.filter(x => x !== n))} aria-label={'Remove ' + n}>{n} ×</Chip>)}</Row></Col>}</>}
        {step === 1 && <><H size="display-l" style={{ fontSize: 64 }}>Where are we going?</H><Input size="l" id="ob-where" label="Destination" placeholder="A country, a city, a vibe…" value={where} onChange={setWhere} autoFocus />
          <Row gap={8} style={{ flexWrap: 'wrap' }}>{['Japan', 'NZ South Island', 'Europe by rail', 'Somewhere warm', 'Bali', 'Vietnam'].map((s, i) => <Chip key={s} size="l" tone={where === s ? 'coral' : ['white', 'sun', 'teal', 'lilac'][i % 4]} selected={where === s} onClick={() => setWhere(s)}>{s}</Chip>)}</Row></>}
        {step === 2 && <><H size="display-l" style={{ fontSize: 64 }}>When, roughly?</H><Segmented options={['Exact dates', 'Rough month', 'No idea yet']} value={when} onChange={setWhen} tone="sun" />
          {when === 'Exact dates' && <Row gap={12}><Input label="Leave" placeholder="12 Oct" style={{ flex: 1 }} /><Input label="Back" placeholder="24 Oct" style={{ flex: 1 }} /></Row>}
          {when === 'Rough month' && <Row gap={8} style={{ flexWrap: 'wrap' }}>{['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'].map(m => <Chip key={m} size="l" tone={m === month ? 'sun' : 'white'} selected={m === month} onClick={() => setMonth(m)}>{m} 26</Chip>)}</Row>}
          {when === 'No idea yet' && <Card tone="lilac" style={{ maxWidth: 420 }}>We'll count sleeps once you pick a day. Nothing else needs dates.</Card>}</>}
      </div>
      <Row gap={10}>{step > 0 && <Button variant="secondary" size="l" onClick={() => setStep(step - 1)}>Back</Button>}<Button size="l" disabled={step === 1 && where.length < 2} onClick={() => step < 2 ? setStep(step + 1) : onDone()}>{step < 2 ? 'Next' : "Let's go"}</Button></Row>
    </div>
    <div style={{ background: 'var(--accent-money)', borderLeft: 'var(--border)', padding: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18, position: 'relative' }}>
      <Label style={{ color: 'var(--on-accent-text)' }}>Your trip so far</Label>
      <Card tone="coral" shadow={4} radius="xl" padding={24}>
        <Chip size="s" uppercase tone="white">{step < 2 ? 'Drafting' : 'Ready'}</Chip>
        <H size="h1" wrap style={{ fontSize: 44, marginTop: 18, lineHeight: 1 }}>{where || 'Somewhere'}</H>
        <div style={{ font: 'var(--type-body)', marginTop: 8 }}>{when === 'No idea yet' ? 'No dates yet' : when === 'Rough month' ? month + ' 2026' : '12 – 24 Oct'}</div>
        <Row gap={6} style={{ marginTop: 18 }}><Avatar initials="CW" tone="teal" />{who === 'With people' && names.map((n, i) => <Avatar key={n} initials={n.slice(0, 2).toUpperCase()} tone={tones[i % 3]} />)}</Row>
      </Card>
      <Card padding={16}><ListRow tile="▲" tileTone="teal" title="Next: add your first stop" sub="We'll draw the route as you go" /></Card>
    </div>
  </div>;
}

export function DSearch({ go, onClose }) {
  const [q, setQ] = React.useState('kyo'); const hits = searchIndex(q); const flat = hits.groups.flatMap(g => g.items); const [i, setI] = React.useState(0);
  return <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(29,29,27,.35)', display: 'flex', justifyContent: 'center', paddingTop: 96, zIndex: 30 }}>
    <div role="dialog" aria-modal="true" aria-label="Search this trip" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(flat.length - 1, i + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, i - 1)); } if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && flat[i]) go(flat[i].go, flat[i].id); }} style={{ width: 640, maxHeight: 520, background: 'var(--surface-page)', border: 'var(--border)', borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-5)', display: 'flex', flexDirection: 'column', overflow: 'hidden', alignSelf: 'flex-start' }}>
      <div style={{ padding: 16, borderBottom: 'var(--border)' }}><Input value={q} onChange={v => { setQ(v); setI(0); }} placeholder="Search places, days, people, costs" aria-label="Search" autoFocus trailing={<Chip size="s">esc</Chip>} /></div>
      <div role="listbox" style={{ overflowY: 'auto', padding: '8px 12px 12px' }}>
        {hits.total === 0 && <div style={{ padding: 28, textAlign: 'center' }}><H size="h4">Nothing called "{q}"</H><Muted style={{ marginTop: 4 }}>Try a place, a day like "Sat 18", or a person.</Muted></div>}
        {hits.groups.map(g => <div key={g.label} style={{ marginTop: 8 }}><Label style={{ color: 'var(--text-muted)', padding: '4px 8px' }}>{g.label}</Label>
          {g.items.map(it => { const k = flat.indexOf(it); const on = k === i; return <div key={it.title + it.sub} role="option" aria-selected={on} onMouseEnter={() => setI(k)} style={{ borderRadius: 'var(--radius-m)', border: on ? 'var(--border)' : '2px solid transparent', background: on ? 'var(--surface-card)' : 'transparent', boxShadow: on ? 'var(--shadow-1)' : 'none', padding: '2px 8px' }}><ListRow tile={it.tile} tileTone={it.tone} title={<Hl text={it.title} q={q} />} sub={it.sub} trailing={on ? '↵' : ''} onClick={() => go(it.go, it.id)} /></div>; })}</div>)}
      </div>
      <Row gap={14} style={{ padding: '10px 18px', borderTop: 'var(--border)', background: 'var(--surface-card)' }}><Muted>↑↓ move</Muted><Muted>↵ open</Muted><Muted>esc close</Muted><Muted style={{ marginLeft: 'auto' }}>⌘K from anywhere</Muted></Row>
    </div>
  </div>;
}

export function DShare({ dark }) {
  const [view, setView] = React.useState('Page');
  return <div data-theme={dark ? 'dark' : undefined} style={{ width: 1280, height: 800, background: 'var(--surface-canvas)', color: 'var(--text-primary)', border: '2px solid #1D1D1B', borderRadius: 'var(--radius-2xl)', boxShadow: '8px 8px 0 #1D1D1B', overflow: 'hidden', display: 'flex', flexDirection: 'column', font: 'var(--type-body)' }}>
    <Row gap={10} style={{ padding: '10px 16px', borderBottom: 'var(--border)', background: 'var(--surface-card)' }}><span style={{ display: 'flex', gap: 6 }}>{['#FF6B4A', '#FFD166', '#5BC0BE'].map(c => <span key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c, border: '1.5px solid #1D1D1B' }}></span>)}</span><span style={{ flex: 1, font: 'var(--type-caption)', fontFamily: 'ui-monospace, monospace', padding: '6px 12px', borderRadius: 999, background: 'var(--surface-page)', border: '1px solid var(--outline-soft)' }}>teepee.app/j/autumn-26</span><Segmented options={['Page', 'Link preview']} value={view} onChange={setView} tone="ink" /></Row>
    {view === 'Page' ? <SharePage desktop /> : <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, padding: 48, alignItems: 'center' }}>
      <Col gap={14}><Label style={{ color: 'var(--text-muted)' }}>Open Graph image · 1200 × 630</Label><div style={{ border: 'var(--border)', borderRadius: 16, overflow: 'hidden', width: 'fit-content', boxShadow: 'var(--shadow-3)' }}><ShareOG scale={0.44} /></div><Muted style={{ whiteSpace: 'normal', maxWidth: 520 }}>Generated per trip by app/j/[slug]/opengraph-image.tsx. Always light theme, and costs are never shown.</Muted></Col>
      <Col gap={14}><Label style={{ color: 'var(--text-muted)' }}>In a group chat</Label><div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: '18px 18px 18px 4px', background: 'var(--surface-card)', border: '1px solid var(--outline-soft)', font: 'var(--type-body-s)' }}>ok here's the plan, add yourselves ↓</div><Unfurl scale={0.3} /></Col>
    </div>}
  </div>;
}

export function DStates({ kind, toast }) {
  if (kind === 'loading') return <><Loading /><Row justify="space-between"><Col gap={8}><Skeleton w={100} h={10} /><Skeleton w={320} h={36} /></Col><Skeleton w={120} h={36} r={999} /></Row>
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 14 }}><SkeletonCard h={290} style={{ gridRow: 'span 2' }} /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}><SkeletonCard h={160} /><SkeletonCard h={160} /></div></>;
  if (kind === 'offline') return <><OfflineBanner queued={2} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>{trip.stops.map((s, i) => <Card key={s.id} tone={i === 1 ? 'white' : s.chapter === 'Kanto' ? 'teal' : 'lilac'} padding={18}><Row justify="space-between"><H size="h3">{s.name}</H>{i === 1 ? <SyncChip state="queued" /> : i === 3 ? <SyncChip state="failed" /> : <SyncChip state="synced" />}</Row><Muted style={{ color: 'var(--text-primary)', marginTop: 6 }}>{i === 1 ? 'You added "Onsen" · saved on this device' : i === 3 ? 'Alex\u2019s edit clashed with yours' : s.stay}</Muted>{i === 3 && <Row gap={8} style={{ marginTop: 12 }}><Button size="s" variant="secondary">Keep mine</Button><Button size="s" variant="ghost">Keep Alex's</Button></Row>}</Card>)}</div>
    <InlineError onRetry={() => toast('Retrying…')}>Jess's photo from Hakone didn't upload</InlineError></>;
  if (kind === 'error') return <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}><ErrorPanel onRetry={() => toast('Back online')} style={{ width: 460 }} /></div>;
  return <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}><PermissionCard kind={kind} style={{ width: 440 }} onYes={() => toast(kind === 'push' ? 'Notifications on' : 'Installed · Teepee is in your apps')} onNo={() => toast('No worries · change it in You')} /></div>;
}
