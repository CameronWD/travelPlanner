import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Avatar } from '../../components/core/Avatar.jsx';
import { Icon } from '../../components/core/Icon.jsx';
import { ProgressBar } from '../../components/core/ProgressBar.jsx';
import { Checkbox } from '../../components/forms/Checkbox.jsx';
import { Segmented } from '../../components/forms/Segmented.jsx';
import { Toggle } from '../../components/forms/Toggle.jsx';
import { H, Label, Muted, Row, Col } from './kit.jsx';

const grid = (desktop, cols) => ({ display: 'grid', gridTemplateColumns: desktop ? cols : 'minmax(0,1fr)', gap: desktop ? 18 : 12, alignItems: 'start' });
const Tile = ({ icon, tone = 'white', size = 34, children }) => <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 10, border: 'var(--border)', display: 'grid', placeItems: 'center', background: tone === 'white' ? 'var(--surface-card)' : `var(--accent-${{ coral: 'primary', sun: 'money', teal: 'route', lilac: 'stay' }[tone]})`, color: tone === 'white' ? 'var(--text-primary)' : 'var(--on-accent-text)', flex: 'none', font: 'var(--type-label)', fontWeight: 800 }}>{children || <Icon name={icon} size={size * .47} />}</span>;
const Photo = ({ h = 120, label = 'Photo', tone }) => <div style={{ height: h, borderRadius: 'var(--radius-m)', border: '2px dashed var(--outline-soft)', background: tone ? `var(--accent-${tone})` : 'var(--surface-canvas)', opacity: tone ? .5 : 1, display: 'grid', placeItems: 'center', font: 'var(--type-caption)', color: 'var(--text-muted)' }}><Row gap={6}><Icon name="camera" size={16} />{label}</Row></div>;

/* ---------- CHECKLISTS: pre-trip + packing, with templates ---------- */
export function Checklists({ desktop }) {
  const [tab, setTab] = React.useState('Pre-trip');
  const DATA = {
    'Pre-trip': [['Documents', [['Passports valid to Apr 27', true, 'CW'], ['Japan visa-free check', true, 'JM'], ['Travel insurance', false, 'CW']]], ['Money', [['Tell the bank', false, 'JM'], ['Order ¥50k cash', false, 'CW']]], ['Bookings', [['JR Pass or not?', false, null], ['Ghibli Museum tickets (drop on the 10th)', false, 'JM']]]],
    Packing: [['Clothes', [['Layers for 12–20°', true, null], ['Walking shoes', true, null], ['Onsen-friendly swimwear', false, null]]], ['Tech', [['Type A adapters × 2', false, 'CW'], ['eSIM installed', false, 'JM'], ['Power bank', true, 'CW']]], ['Carry-on', [['Snacks for the flight', false, null], ['Pen for arrival card', false, null]]]],
  };
  const [st, setSt] = React.useState(() => JSON.parse(JSON.stringify(DATA)));
  const groups = st[tab]; const all = groups.flatMap(g => g[1]); const n = all.filter(x => x[1]).length;
  const toggle = (gi, ii, v) => { const c = JSON.parse(JSON.stringify(st)); c[tab][gi][1][ii][1] = v; setSt(c); };
  return <Col gap={desktop ? 18 : 12}>
    <Row justify="space-between" style={{ flexWrap: 'wrap', gap: 8 }}><Segmented options={['Pre-trip', 'Packing']} value={tab} onChange={setTab} tone="teal" /><Muted>{n} of {all.length} done</Muted></Row>
    <ProgressBar value={n / all.length * 100} label={tab + ' progress'} fill="var(--accent-route)" height={12} />
    <div style={grid(desktop, 'repeat(3, minmax(0,1fr))')}>
      {groups.map(([g, items], gi) => <Card key={g} padding={desktop ? 18 : 14}>
        <Row justify="space-between"><H size="h4">{g}</H><Muted>{items.filter(x => x[1]).length}/{items.length}</Muted></Row>
        <Col gap={0} style={{ marginTop: 6 }}>{items.map(([t, done, who], ii) => <Row key={t} gap={8} style={{ borderTop: ii ? '1px solid var(--outline-soft)' : 0 }}><Checkbox checked={done} onChange={v => toggle(gi, ii, v)} label={t} style={{ flex: 1, minWidth: 0 }} />{who && <Avatar initials={who} tone={who === 'CW' ? 'teal' : 'sun'} size={24} />}</Row>)}</Col>
        <Button size="s" variant="ghost" style={{ marginTop: 6, color: 'var(--text-muted)' }}>+ Add item</Button>
      </Card>)}
      {tab === 'Packing' && <Card dashed padding={desktop ? 18 : 14}><Label style={{ color: 'var(--text-muted)' }}>Start from a template</Label><Row gap={6} style={{ flexWrap: 'wrap', marginTop: 10 }}>{['City break', 'Beach', 'Cold weather', 'Carry-on only', 'Onsen'].map(t => <Chip key={t} onClick={() => {}}>+ {t}</Chip>)}</Row><Muted style={{ marginTop: 10, whiteSpace: 'normal' }}>Templates add items you don't already have. Save this list as a template from the menu.</Muted></Card>}
    </div>
  </Col>;
}

/* ---------- FILES: attachments, scoped to trip / stop / booking, cached offline ---------- */
export function Files({ desktop, toast }) {
  const [f, setF] = React.useState('All');
  const FILES = [['Romancecar e-ticket', 'PDF', 'Transport · Fri 17', 'coral', true], ['Shinkansen Hikari', 'PDF', 'Transport · Sat 18', 'coral', true], ['Machiya Gion booking', 'PDF', 'Stay · Kyoto', 'lilac', true], ['Passport scans', 'IMG', 'Trip', 'teal', false], ['Travel insurance', 'PDF', 'Trip', 'teal', true], ['Ghibli Museum QR', 'IMG', 'Thing to do · Tokyo', 'sun', false]];
  const cats = { All: () => true, Tickets: x => x[2].startsWith('Transport'), Stays: x => x[2].startsWith('Stay'), Trip: x => x[2] === 'Trip' };
  return <Col gap={desktop ? 18 : 12}>
    <Row justify="space-between" style={{ flexWrap: 'wrap', gap: 8 }}><Row gap={6} style={{ flexWrap: 'wrap' }}>{Object.keys(cats).map(c => <Chip key={c} tone={f === c ? 'ink' : 'white'} selected={f === c} onClick={() => setF(c)}>{c}</Chip>)}</Row><Muted>4 of 6 saved for offline · 3.2 MB</Muted></Row>
    <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(3, minmax(0,1fr))' : 'minmax(0,1fr)', gap: 12 }}>
      <Card dashed padding={16} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: desktop ? 150 : 90, textAlign: 'center' }}><Icon name="paperclip" size={24} /><div style={{ font: 'var(--type-h5)' }}>Drop files or tap to add</div><Muted>PDF or photos, up to 20 MB</Muted></Card>
      {FILES.filter(cats[f]).map(([n, type, scope, tone, off]) => <Card key={n} padding={14} onClick={() => toast && toast(off ? 'Opened from this device' : 'Downloading…')} style={{ display: 'flex', gap: 12, alignItems: desktop ? 'flex-start' : 'center', flexDirection: desktop ? 'column' : 'row' }}>
        <Tile tone={tone} size={desktop ? 48 : 40}>{type}</Tile>
        <div style={{ minWidth: 0, flex: 1 }}><div style={{ font: 'var(--type-body-s)', fontWeight: 800 }}>{n}</div><Muted>{scope}</Muted></div>
        {off ? <Chip size="s" tone="teal"><Icon name="check" size={11} strokeWidth={3.5} /> offline</Chip> : <Chip size="s" dashed>online only</Chip>}
      </Card>)}
    </div>
  </Col>;
}

/* ---------- JOURNAL: photos + notes per day ---------- */
export function Journal({ desktop }) {
  const E = [['Thu 16 Oct', 'Tokyo', 'CW', 'teal', 'Found the tiny jazz bar in Golden Gai again. Eight seats, one guy, a thousand records.', 2], ['Wed 15 Oct', 'Tokyo', 'JM', 'sun', 'teamLab was worth the queue. Wear shorts, the floor is water.', 3], ['Tue 14 Oct', 'Tokyo', 'CW', 'teal', 'Jet lag won: asleep at 8pm, up at 4. Tsukiji at dawn though.', 1]];
  return <Col gap={desktop ? 18 : 12}>
    <Row justify="space-between"><Muted>3 entries · 6 photos</Muted><Button size="s" leading={<Icon name="pencil" size={14} />}>Write today</Button></Row>
    <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(2, minmax(0,1fr))' : 'minmax(0,1fr)', gap: desktop ? 18 : 12 }}>
      {E.map(([d, where, who, tone, text, ph], i) => <Card key={d} padding={desktop ? 18 : 14} shadow={i === 0 ? 3 : 2}>
        <Row justify="space-between"><div><Label style={{ color: 'var(--text-muted)' }}>{where}</Label><H size="h4">{d}</H></div><Avatar initials={who} tone={tone} size={30} /></Row>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(ph, 3)}, minmax(0,1fr))`, gap: 8, marginTop: 12 }}>{Array.from({ length: ph }).map((_, k) => <Photo key={k} h={ph === 1 ? 180 : 110} label={ph === 1 ? 'Photo' : ''} />)}</div>
        <p style={{ margin: '12px 0 0', font: 'var(--type-body)', textWrap: 'pretty' }}>{text}</p>
      </Card>)}
    </div>
  </Col>;
}

/* ---------- ACTIVITY: who changed what (ADR 0012) ---------- */
export function Activity({ desktop }) {
  const A = [['Today', [['AL', 'lilac', 'moved', 'Arashiyama', 'to Mon 20 Oct', '10:42'], ['JM', 'sun', 'paid', 'Machiya Gion', '¥37,200 · marked paid', '09:15']]], ['Yesterday', [['CW', 'teal', 'added', 'Hakone', '1 night · Fri 17', '21:03'], ['JM', 'sun', 'voted for', 'Naoshima', 'now 3 votes', '18:40'], ['CW', 'teal', 'uploaded', 'Romancecar e-ticket', 'saved offline', '18:12']]], ['Mon 29 Sep', [['AL', 'lilac', 'joined', 'the trip', 'via invite link', '12:00']]]];
  return <Card padding={desktop ? 22 : 14} style={{ maxWidth: desktop ? 760 : undefined }}>
    {A.map(([day, rows]) => <div key={day} style={{ marginBottom: 8 }}><Label style={{ color: 'var(--text-muted)', padding: '8px 0 4px' }}>{day}</Label>
      {rows.map(([who, tone, verb, what, sub, t], i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: '30px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--outline-soft)' }}>
        <Avatar initials={who} tone={tone} size={30} /><div style={{ minWidth: 0 }}><div style={{ font: 'var(--type-body-s)' }}><b>{{ AL: 'Alex', JM: 'Jess', CW: 'You' }[who]}</b> {verb} <b>{what}</b></div><Muted>{sub}</Muted></div><Muted>{t}</Muted>
      </div>)}</div>)}
  </Card>;
}

/* ---------- COMPARE: real plan vs a fork (ADR 0020) ---------- */
export function Compare({ desktop, toast }) {
  const A = [['Tokyo', 4, 'same'], ['Hakone', 1, 'removed'], ['Kyoto', 4, 'same'], ['Osaka', 2, 'same']];
  const B = [['Tokyo', 4, 'same'], ['Kyoto', 5, 'changed'], ['Naoshima', 1, 'added'], ['Osaka', 2, 'same']];
  const col = (name, tone, rows, stats, you) => <Card tone={tone} padding={desktop ? 20 : 14} shadow={you ? 2 : 4}>
    <Row justify="space-between"><H size="h3">{name}</H>{you ? <Chip size="s" uppercase tone="white">real plan</Chip> : <Chip size="s" uppercase tone="white">fork</Chip>}</Row>
    <Col gap={6} style={{ marginTop: 12 }}>{rows.map(([n, nights, s]) => <div key={n} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 10, border: s === 'same' ? '2px solid transparent' : '2px solid var(--outline)', background: s === 'same' ? 'transparent' : 'var(--surface-card)', textDecoration: s === 'removed' ? 'line-through' : 'none' }}>
      <b style={{ font: 'var(--type-body-s)', fontWeight: 800 }}>{s === 'added' ? '+ ' : s === 'removed' ? '− ' : ''}{n}</b><span style={{ font: 'var(--type-body-s)' }}>{nights}n{s === 'changed' ? ' (+1)' : ''}</span>
    </div>)}</Col>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>{stats.map(([l, v]) => <div key={l}><Label>{l}</Label><div style={{ font: 'var(--type-h4)' }}>{v}</div></div>)}</div>
  </Card>;
  return <Col gap={desktop ? 18 : 12}>
    <Row gap={6} style={{ flexWrap: 'wrap' }}><Chip tone="ink">Real plan</Chip><span style={{ font: 'var(--type-h5)' }}>vs</span><Chip tone="coral" selected>Plan B · Naoshima</Chip><Chip dashed onClick={() => {}}>+ New fork</Chip></Row>
    <div style={grid(desktop, 'minmax(0,1fr) minmax(0,1fr)')}>
      {col('Real plan', 'white', A, [['Nights', '11'], ['Cost', '¥312k'], ['Legs', '5']], true)}
      {col('Plan B', 'lilac', B, [['Nights', '12'], ['Cost', '¥338k'], ['Legs', '6']])}
    </div>
    <Card padding={16}><Row justify="space-between" style={{ flexWrap: 'wrap', gap: 10 }}><div style={{ minWidth: 0 }}><div style={{ font: 'var(--type-h5)' }}>Plan B adds a night and ¥26k</div><Muted style={{ whiteSpace: 'normal' }}>Drops Hakone, adds Naoshima and 1 more night in Kyoto. Past your hard end date by 1 night.</Muted></div><Row gap={8}><Button variant="ghost">Discard Plan B</Button><Button onClick={() => toast && toast('Plan B is now the real plan')}>Make Plan B real</Button></Row></Row></Card>
  </Col>;
}

/* ---------- PRINT / EXPORT ---------- */
export function PrintView({ desktop, toast }) {
  const [o, setO] = React.useState({ costs: false, addr: true, notes: true, perDay: false });
  const days = [['Sun 12', 'Tokyo', ['06:15 Land HND · JQ 19', '15:00 Check in · Hotel Gracery', '19:00 Omoide Yokocho']], ['Mon 13', 'Tokyo', ['09:00 Tsukiji outer market', '13:00 teamLab Planets', '18:30 Shibuya Sky']], ['Tue 14', 'Tokyo', ['10:00 Ghibli Museum', 'Evening free']]];
  const page = <div style={{ background: '#FFFFFF', color: '#1D1D1B', border: '1px solid var(--outline-soft)', boxShadow: 'var(--shadow-3)', borderRadius: 6, padding: desktop ? '40px 44px' : '22px 20px', aspectRatio: '210 / 297', maxWidth: 560, width: '100%', overflow: 'hidden', font: '500 12px/1.45 var(--font-body)' }}>
    <Row justify="space-between" style={{ borderBottom: '2px solid #1D1D1B', paddingBottom: 10 }}><div><div style={{ font: '800 26px/1 var(--font-display)', letterSpacing: '-.03em' }}>Japan in Autumn</div><div style={{ marginTop: 4 }}>12 – 24 Oct 2026 · 11 nights · Cameron, Jess, Alex</div></div><div style={{ font: '800 16px/1 var(--font-display)' }}>teepee<span style={{ color: '#B8391D' }}>.</span></div></Row>
    {days.map(([d, where, items]) => <div key={d} style={{ marginTop: 14, breakInside: 'avoid' }}><div style={{ font: '800 14px/1.2 var(--font-display)' }}>{d} · {where}</div><div style={{ marginTop: 4 }}>{items.map(i => <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: '1px solid #E5E0D6' }}><span>{i}</span></div>)}</div>{o.addr && d === 'Sun 12' && <div style={{ marginTop: 4, color: '#5E5953' }}>Hotel Gracery · 1-19-1 Kabukicho, Shinjuku · Conf. 88213</div>}</div>)}
    {o.costs && <div style={{ marginTop: 14, padding: 8, border: '1.5px solid #1D1D1B', borderRadius: 6 }}>Trip cost ¥312,000 · paid ¥184,000</div>}
  </div>;
  return <div style={grid(desktop, 'minmax(0,1.4fr) minmax(0,1fr)')}>
    <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--surface-canvas)', border: 'var(--border)', borderRadius: 'var(--radius-l)', padding: desktop ? 24 : 12 }}>{page}</div>
    <Col gap={12}>
      <Card padding={16}><H size="h4">Include</H><Col gap={4} style={{ marginTop: 8 }}>{[['addr', 'Addresses and confirmation numbers'], ['notes', 'Notes'], ['costs', 'Costs (off for printouts you might hand out)'], ['perDay', 'One day per page']].map(([k, l]) => <Toggle key={k} checked={o[k]} onChange={v => setO({ ...o, [k]: v })} label={l} />)}</Col></Card>
      <Button size="l" block onClick={() => toast && toast('Opening print dialog')} leading={<Icon name="download" size={18} />}>Print or save PDF</Button>
      <Card padding={16}><H size="h4">Calendar feed</H><Muted style={{ whiteSpace: 'normal', marginTop: 4 }}>Subscribe in Google, Apple or Outlook calendar. It's one-way and updates every few hours.</Muted><Row gap={8} style={{ marginTop: 10 }}><code style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '8px 10px', border: '1px solid var(--outline-soft)', borderRadius: 8, font: '600 12px ui-monospace, monospace' }}>webcal://teepee.app/api/calendar/k3…9f</code><Button size="s" variant="secondary" onClick={() => toast && toast('Feed link copied')}>Copy</Button></Row></Card>
    </Col>
  </div>;
}
