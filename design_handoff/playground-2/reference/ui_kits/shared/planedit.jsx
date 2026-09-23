import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { IconButton } from '../../components/core/IconButton.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Icon } from '../../components/core/Icon.jsx';
import { Input } from '../../components/forms/Input.jsx';
import { Select } from '../../components/forms/Select.jsx';
import { Segmented } from '../../components/forms/Segmented.jsx';
import { Checkbox } from '../../components/forms/Checkbox.jsx';
import { H, Label, Muted, Row, Col } from './kit.jsx';

const Two = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>{children}</div>;
const ACC = { teal: 'var(--accent-route)', lilac: 'var(--accent-stay)', coral: 'var(--accent-primary)', sun: 'var(--accent-money)' };

/* Cost fields (ADR 0037): Cost is required; ticking Paid reveals "You paid", pre-filled with the cost. FX snapshot shown. */
export function CostFields({ initial = '13080', cur = 'JPY' }) {
  const [cost, setCost] = React.useState(initial); const [paid, setPaid] = React.useState(false); const [amt, setAmt] = React.useState(initial);
  const home = n => 'A$' + Math.round((+String(n).replace(/\D/g, '') || 0) * 0.01).toLocaleString();
  return <Col gap={10}>
    <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr)', gap: 10 }}><Select label="Currency" value={cur} options={['JPY', 'AUD', 'USD']} /><Input label="Cost" value={cost} onChange={v => { setCost(v); if (!paid) setAmt(v); }} hint={'≈ ' + home(cost) + ' at today\u2019s rate, locked on save'} /></div>
    <Checkbox checked={paid} onChange={v => { setPaid(v); if (v) setAmt(cost); }} label="Paid" strike={false} />
    {paid && <Two><Input label="You paid" value={amt} onChange={setAmt} hint={+amt === +cost ? 'Same as the cost' : (+amt > +cost ? '⚠ ' : '') + 'Differs from cost by ' + Math.abs(+amt - +cost).toLocaleString()} /><Input label="On" value="Today" /></Two>}
  </Col>;
}

/* Transport form: modes incl. drive estimate; times in each endpoint's zone; next-day arrivals; home endpoints. */
export function TransportForm() {
  const [mode, setMode] = React.useState('Flight');
  const drive = mode === 'Drive';
  return <Col gap={14}>
    <Segmented options={['Flight', 'Train', 'Drive', 'Bus', 'Ferry']} value={mode} onChange={setMode} tone="sun" />
    <Two><Select label="From" value={drive ? 'Tokyo' : 'Home · Sydney'} options={['Home · Sydney', 'Tokyo', 'Hakone']} /><Select label="To" value={drive ? 'Hakone' : 'Tokyo'} options={['Tokyo', 'Hakone', 'Kyoto', 'Home · Sydney']} /></Two>
    {drive ? <Card tone="teal" padding={14}><Row gap={10}><Icon name="route" size={20} /><div style={{ flex: 1 }}><div style={{ font: 'var(--type-h5)' }}>≈ 1 h 40 m · 92 km</div><div style={{ font: 'var(--type-caption)' }}>Estimate by road. Traffic not included.</div></div></Row></Card>
      : <><Two><Input label="Departs · SYD time" value="Sat 11 Oct · 21:35" /><Input label="Arrives · Tokyo time" value="Sun 12 Oct · 06:15" hint="+1 day · 10 h 40 m" /></Two><Two><Input label="Flight / service" value="JQ 19" /><Input label="Booking ref" placeholder="e.g. 4F7K2Q" /></Two></>}
    <CostFields initial={drive ? '9000' : '98000'} />
    <Button variant="dashed" block leading={<Icon name="paperclip" size={16} />}>Attach ticket</Button>
  </Col>;
}

/* PLAN EDITOR: home base bookends, chapter bands, dated vs rough stops, drag (rough only), connections, projected end. */
export function PlanEditor({ desktop, toast, openSheet }) {
  const [rough, setRough] = React.useState([{ id: 'nara', name: 'Nara', nights: 1 }, { id: 'naoshima', name: 'Naoshima', nights: 2 }]);
  const [drag, setDrag] = React.useState(null);
  const dated = [{ name: 'Tokyo', d: 'Sun 12 – Thu 16', n: 4, ch: 'Kanto', tone: 'teal', out: ['Romancecar', '1 h 25 m · booked'] }, { name: 'Hakone', d: 'Thu 16 – Fri 17', n: 1, ch: 'Kanto', tone: 'teal', bed: false, out: ['Shinkansen', '2 h 08 m · booked'] }, { name: 'Kyoto', d: 'Fri 17 – Tue 21', n: 4, ch: 'Kansai', tone: 'lilac', out: null }, { name: 'Osaka', d: 'Tue 21 – Thu 23', n: 2, ch: 'Kansai', tone: 'lilac', out: null }];
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= rough.length) return; const r = [...rough]; [r[i], r[j]] = [r[j], r[i]]; setRough(r); };
  const Home = ({ label, sub }) => <Row gap={12} style={{ padding: '12px 14px', border: '2px dashed var(--outline-soft)', borderRadius: 'var(--radius-l)' }}><span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-inverse)', color: 'var(--text-inverse)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="home" size={18} /></span><div style={{ flex: 1, minWidth: 0 }}><div style={{ font: 'var(--type-h5)' }}>{label}</div><Muted>{sub}</Muted></div></Row>;
  const Leg = ({ leg, missing, tone }) => <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0 4px 17px' }}>
    <span style={{ width: 2, height: 30, background: missing ? 'transparent' : 'var(--outline)', borderLeft: missing ? '2px dashed var(--accent-primary-text)' : 0 }}></span>
    {missing ? <Button size="s" variant="dashed" onClick={() => openSheet && openSheet('transport')} style={{ color: 'var(--accent-primary-text)', borderColor: 'var(--accent-primary-text)' }}>+ How do you get there?</Button> : <Chip size="s" tone={tone || 'sun'}><Icon name="train-front" size={12} strokeWidth={3} /> {leg[0]} · {leg[1]}</Chip>}
  </div>;
  const chapters = [['Kanto', 'teal', dated.filter(s => s.ch === 'Kanto')], ['Kansai', 'lilac', dated.filter(s => s.ch === 'Kansai')]];
  const plan = <Col gap={0}>
    <Home label="Sydney" sub="Home base · leave Sat 11 Oct 21:35" />
    <Leg leg={['JQ 19', '10 h 40 m · booked']} tone="white" />
    {chapters.map(([ch, tone, stops], ci) => <div key={ch} style={{ display: 'grid', gridTemplateColumns: '8px minmax(0,1fr)', gap: 12 }}>
      <span aria-hidden="true" style={{ borderRadius: 4, background: ACC[tone], border: '1.5px solid var(--outline)' }}></span>
      <div><Label style={{ color: 'var(--text-muted)', padding: '6px 0' }}>{ch} · {stops.reduce((a, s) => a + s.n, 0)} nights</Label>
        {stops.map((s, i) => <React.Fragment key={s.name}>
          <Card tone={s.bed === false ? 'white' : tone} padding={14}><Row justify="space-between" gap={10}><div style={{ minWidth: 0, flex: 1 }}><Row gap={6}><Icon name="map-pin" size={14} /><H size="h4">{s.name}</H></Row><div style={{ font: 'var(--type-caption)', marginTop: 2 }}>{s.d} · {s.n} night{s.n > 1 ? 's' : ''}</div></div>{s.bed === false ? <Chip size="s" tone="coral">! no bed</Chip> : <IconButton tone="ghost" size={36} label={'Edit ' + s.name} onClick={() => openSheet && openSheet('editStop')}><Icon name="pencil" size={16} /></IconButton>}</Row></Card>
          {(i < stops.length - 1 || ci < chapters.length - 1) && <Leg leg={s.out} missing={!s.out} />}
        </React.Fragment>)}
      </div>
    </div>)}
    <div style={{ marginTop: 16 }}><Row justify="space-between"><Label style={{ color: 'var(--text-muted)' }}>Rough stops · no dates yet</Label><Muted>drag to reorder</Muted></Row>
      <Col gap={8} style={{ marginTop: 8 }}>{rough.map((r, i) => <div key={r.id} draggable onDragStart={() => setDrag(i)} onDragOver={e => { e.preventDefault(); if (drag !== null && drag !== i) { move(drag, i - drag); setDrag(i); } }} onDragEnd={() => setDrag(null)} style={{ opacity: drag === i ? .6 : 1 }}>
        <Card dashed padding={12} style={{ borderColor: 'var(--outline)', background: 'var(--surface-card)' }}><Row gap={10}>
          <span aria-hidden="true" style={{ cursor: 'grab', color: 'var(--text-muted)', font: '800 14px/1 var(--font-body)', letterSpacing: -2 }}>⋮⋮</span>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: 'var(--type-h5)' }}>{r.name}</div><Muted>~{r.nights} night{r.nights > 1 ? 's' : ''} · after Osaka</Muted></div>
          <IconButton tone="ghost" size={36} label={'Move ' + r.name + ' up'} onClick={() => move(i, -1)}><Icon name="chevron-left" size={16} style={{ transform: 'rotate(90deg)' }} /></IconButton>
          <IconButton tone="ghost" size={36} label={'Move ' + r.name + ' down'} onClick={() => move(i, 1)}><Icon name="chevron-down" size={16} /></IconButton>
        </Row></Card></div>)}</Col>
      <Row gap={8} style={{ marginTop: 10, flexWrap: 'wrap' }}><Button size="s" variant="secondary" onClick={() => toast && toast('Dates set · Nara Thu 23, Naoshima Fri 24')}>Set dates for all stops</Button><Button size="s" variant="dashed" onClick={() => openSheet && openSheet('place')}>+ Add a stop</Button></Row>
    </div>
    <Leg missing />
    <Home label="Back to Sydney" sub="Round trip · no flight home yet" />
  </Col>;
  const side = <Col gap={12}>
    <Card tone="coral" padding={16}><Label>Heads up</Label><H size="h4" wrap style={{ marginTop: 4 }}>1 night past your hard end date</H><div style={{ font: 'var(--type-body-s)', marginTop: 4 }}>With the rough stops, the plan ends Sat 25. Your hard end date is Fri 24.</div><Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}><Button size="s" onClick={() => toast && toast('Naoshima trimmed to 1 night')}>Make it fit</Button><Button size="s" variant="ghost">Change end date</Button></Row></Card>
    <Card padding={16}><Label style={{ color: 'var(--text-muted)' }}>Next steps</Label><Col gap={6} style={{ marginTop: 8 }}>{['Book a bed in Hakone', 'Add how you get Kyoto → Osaka', 'Add your flight home', 'Set dates for Nara and Naoshima'].map((t, i) => <Row key={t} gap={8}><span style={{ width: 22, height: 22, borderRadius: '50%', border: 'var(--border)', display: 'grid', placeItems: 'center', font: '800 11px/1 var(--font-body)', flex: 'none' }}>{i + 1}</span><span style={{ font: 'var(--type-body-s)' }}>{t}</span></Row>)}</Col></Card>
    <Card padding={16}><Row justify="space-between"><Label style={{ color: 'var(--text-muted)' }}>Totals</Label><Muted>real plan</Muted></Row><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>{[['Nights', '11 + 3'], ['Ends', 'Sat 25'], ['Legs', '3 of 6']].map(([l, v]) => <div key={l}><Label>{l}</Label><div style={{ font: 'var(--type-h4)' }}>{v}</div></div>)}</div></Card>
  </Col>;
  return <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'minmax(0,1.5fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: desktop ? 22 : 14, alignItems: 'start' }}>{desktop ? <>{plan}{side}</> : <>{side.props.children[0]}{plan}</>}</div>;
}
