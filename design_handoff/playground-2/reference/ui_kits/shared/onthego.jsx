import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { IconButton } from '../../components/core/IconButton.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Avatar } from '../../components/core/Avatar.jsx';
import { Icon } from '../../components/core/Icon.jsx';
import { StatCard } from '../../components/core/StatCard.jsx';
import { Checkbox } from '../../components/forms/Checkbox.jsx';
import { Segmented } from '../../components/forms/Segmented.jsx';
import { Input } from '../../components/forms/Input.jsx';
import { ListRow } from '../../components/navigation/ListRow.jsx';
import { H, Label, Muted, Row, Col } from './kit.jsx';

const grid = (desktop, cols = '1fr 1fr') => ({ display: 'grid', gridTemplateColumns: desktop ? cols : 'minmax(0,1fr)', gap: desktop ? 18 : 12, alignItems: 'start' });

/* Schematic map: projects lat/lng into a card. In the app this is the Leaflet + Carto map (ADR 0024/0033). */
export function MapBox({ points, route = true, h = 220, bbox, label = 'Map · Carto tiles render here' }) {
  const [minLng, minLat, maxLng, maxLat] = bbox || [Math.min(...points.map(p => p.lng)) - 1, Math.min(...points.map(p => p.lat)) - 1, Math.max(...points.map(p => p.lng)) + 1, Math.max(...points.map(p => p.lat)) + 1];
  const xy = p => [((p.lng - minLng) / (maxLng - minLng)) * 100, (1 - (p.lat - minLat) / (maxLat - minLat)) * 100];
  const TONE = { teal: 'var(--accent-route)', lilac: 'var(--accent-stay)', sun: 'var(--accent-money)', coral: 'var(--accent-primary)', ink: 'var(--surface-inverse)', white: 'var(--surface-card)' };
  return <div role="img" aria-label={'Map: ' + points.map(p => p.name).join(', ')} style={{ position: 'relative', height: h, border: 'var(--border)', borderRadius: 'var(--radius-l)', overflow: 'hidden', background: 'var(--surface-canvas)', backgroundImage: 'linear-gradient(var(--outline-soft) 1px, transparent 1px), linear-gradient(90deg, var(--outline-soft) 1px, transparent 1px)', backgroundSize: '32px 32px' }}>
    {route && <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true"><polyline points={points.filter(p => !p.off).map(p => xy(p).join(',')).join(' ')} fill="none" stroke="var(--text-primary)" strokeWidth="0.8" strokeDasharray="2 1.5" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2.5 }} /></svg>}
    {points.map((p, i) => { const [x, y] = xy(p); return <div key={p.name} style={{ position: 'absolute', left: x + '%', top: y + '%', transform: { left: 'translate(calc(-100% + 8px),-50%)', above: 'translate(-8px, calc(-100% + 8px))', below: 'translate(-8px,-8px)' }[p.side] || 'translate(-50%,-50%)', display: 'flex', flexDirection: { left: 'row-reverse', above: 'column-reverse', below: 'column' }[p.side] || 'row', alignItems: p.side === 'above' || p.side === 'below' ? 'flex-start' : 'center', gap: p.side === 'above' || p.side === 'below' ? 3 : 6 }}>
      <span style={{ width: p.big ? 22 : 16, height: p.big ? 22 : 16, borderRadius: '50%', border: 'var(--border)', background: TONE[p.tone || 'teal'], boxShadow: 'var(--shadow-1)', display: 'grid', placeItems: 'center', font: '800 10px/1 var(--font-body)', color: 'var(--on-accent-text)', flex: 'none' }}>{p.n || ''}</span>
      {p.label !== false && <span style={{ font: 'var(--type-caption)', fontWeight: 800, background: 'var(--surface-page)', border: '1.5px solid var(--outline)', borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap' }}>{p.name}</span>}
    </div>; })}
    <span style={{ position: 'absolute', right: 8, bottom: 6, font: 'var(--type-caption)', fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
  </div>;
}
export const JAPAN = [{ name: 'Tokyo', lat: 35.68, lng: 139.76, tone: 'teal', n: 1 }, { name: 'Hakone', lat: 35.23, lng: 139.1, tone: 'coral', n: 2 }, { name: 'Kyoto', lat: 35.01, lng: 135.77, tone: 'lilac', n: 3 }, { name: 'Osaka', lat: 34.69, lng: 135.5, tone: 'lilac', n: 4 }];

/* ---------- TODAY: the travel-day view. Works offline. ---------- */
export function Today({ desktop, toast }) {
  const [done, setDone] = React.useState({ 0: true });
  const items = [['07:30', 'Check out · Hotel Gracery', 'bed', 'Shinjuku'], ['09:00', 'Romancecar to Hakone-Yumoto', 'train-front', 'Platform 3 · ticket saved'], ['11:30', 'Hakone Open-Air Museum', 'ticket', '¥2,000 each · pay at door'], ['14:00', 'Ropeway to Owakudani', 'route', 'Black eggs'], ['19:00', 'Dinner · Gyoza Center', 'utensils', 'No booking needed']];
  const next = (
    <Card tone="coral" shadow={4} radius="xl" padding={desktop ? 24 : 18}>
      <Row justify="space-between"><Chip size="s" uppercase tone="white">Up next · in 32 min</Chip><Chip size="s" tone="white"><Icon name="wifi-off" size={12} strokeWidth={3} /> saved offline</Chip></Row>
      <H size={desktop ? 'h1' : 'h2'} wrap style={{ marginTop: 14 }}>Romancecar to Hakone-Yumoto</H>
      <Row gap={18} style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <div><Label>Leaves</Label><div style={{ font: 'var(--type-h2)' }}>09:00</div><Muted style={{ color: 'var(--text-primary)' }}>Shinjuku · plat. 3</Muted></div>
        <Icon name="arrow-right" size={22} />
        <div><Label>Arrives</Label><div style={{ font: 'var(--type-h2)' }}>10:25</div><Muted style={{ color: 'var(--text-primary)' }}>Hakone-Yumoto</Muted></div>
      </Row>
      <Row gap={8} style={{ marginTop: 16, flexWrap: 'wrap' }}><Button onClick={() => toast && toast('Ticket opened · works offline')} leading={<Icon name="ticket" size={16} />}>Open ticket</Button><Button variant="secondary" leading={<Icon name="map-pin" size={16} />}>Directions</Button></Row>
    </Card>);
  const timeline = (
    <Card padding={desktop ? 20 : 14}>
      <Row justify="space-between"><H size="h4">Today's plan</H><Muted>{Object.values(done).filter(Boolean).length} of {items.length} done</Muted></Row>
      <Col gap={0} style={{ marginTop: 10 }}>{items.map(([t, title, icon, sub], i) => <div key={t} style={{ display: 'grid', gridTemplateColumns: '48px 28px minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: i ? '1px solid var(--outline-soft)' : 0, opacity: done[i] ? .55 : 1 }}>
        <span style={{ font: 'var(--type-h5)', fontVariantNumeric: 'tabular-nums' }}>{t}</span>
        <span style={{ width: 28, height: 28, borderRadius: 8, border: 'var(--border)', display: 'grid', placeItems: 'center', background: i === 1 ? 'var(--accent-primary)' : 'var(--surface-page)', color: i === 1 ? 'var(--on-accent-text)' : 'var(--text-primary)' }}><Icon name={icon} size={15} /></span>
        <div style={{ minWidth: 0 }}><div style={{ font: 'var(--type-body-s)', fontWeight: 800, textDecoration: done[i] ? 'line-through' : 'none' }}>{title}</div><Muted>{sub}</Muted></div>
        <Checkbox checked={!!done[i]} onChange={v => setDone({ ...done, [i]: v })} label={<span className="sr-only">Done: {title}</span>} style={{ minHeight: 44 }} />
      </div>)}</Col>
    </Card>);
  const tonight = (
    <Card tone="lilac" padding={desktop ? 20 : 16}>
      <Row justify="space-between"><Label>Tonight</Label><Chip size="s" tone="coral">! no bed yet</Chip></Row>
      <H size="h3" wrap style={{ marginTop: 6 }}>Hakone needs a bed</H>
      <div style={{ font: 'var(--type-body-s)', marginTop: 4 }}>1 night · Fri 17 Oct. Last ryokan search: Yumoto area, under ¥30k.</div>
      <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}><Button size="s" variant="secondary">Add a booking</Button><Button size="s" variant="ghost">Search nearby</Button></Row>
    </Card>);
  const side = <Col gap={desktop ? 18 : 12}>
    {tonight}
    <Card padding={16}><Label style={{ color: 'var(--text-muted)' }}>Tomorrow · Sat 18</Label><ListRow tile="→" tileTone="sun" title="Shinkansen Hikari 11:12" sub="Odawara → Kyoto · booked" style={{ marginTop: 8 }} /><ListRow tile="Zz" tileTone="lilac" title="Machiya Gion" sub="Check in from 15:00" /></Card>
    <Card padding={16}><Row justify="space-between"><Label style={{ color: 'var(--text-muted)' }}>Spent today</Label><Muted>shared pot</Muted></Row><div style={{ font: 'var(--type-h2)', marginTop: 4 }}>¥8,400</div><Button size="s" variant="dashed" block style={{ marginTop: 10 }}>+ Log a cost</Button></Card>
  </Col>;
  return <Col gap={desktop ? 18 : 12}>
    <Row justify="space-between" style={{ flexWrap: 'wrap', gap: 8 }}><div><Label style={{ color: 'var(--text-muted)' }}>Day 6 of 12 · Hakone</Label><H size={desktop ? 'h1' : 'h2'}>Fri 17 Oct</H></div><Row gap={6}><Chip size="s">JST · home +2h</Chip><Chip size="s" tone="sun">☼ 18°</Chip></Row></Row>
    <div style={grid(desktop, 'minmax(0,1.5fr) minmax(0,1fr)')}><Col gap={desktop ? 18 : 12}>{next}{timeline}</Col>{side}</div>
  </Col>;
}

/* ---------- SUMMARY: overview, flags, route map ---------- */
export const FLAGS = [
  { lvl: 'warning', icon: 'bed', title: 'Hakone has no bed', sub: '1 night · Fri 17 Oct', fix: 'Add a booking' },
  { lvl: 'warning', icon: 'calendar', title: 'Past your hard end date', sub: 'Projected end Sat 25 Oct · hard end Fri 24', fix: 'Make it fit' },
  { lvl: 'info', icon: 'plane', title: 'No flight home yet', sub: 'Osaka → Sydney · round trip', fix: 'Add transport' },
  { lvl: 'info', icon: 'clock', title: 'Tue 21 is empty', sub: 'Kyoto · nothing scheduled', fix: 'Plan the day' },
  { lvl: 'info', icon: 'route', title: 'Very short stay', sub: 'Hakone · 1 night after a 1h40 trip', fix: 'Add a night' },
];
export const FlagRow = ({ f, onFix }) => <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--outline-soft)' }}>
  <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, border: 'var(--border)', display: 'grid', placeItems: 'center', background: f.lvl === 'warning' ? 'var(--accent-primary)' : 'var(--accent-money)', color: 'var(--on-accent-text)', flex: 'none' }}><Icon name={f.icon} size={16} /></span>
  <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: 'var(--type-body-s)', fontWeight: 800 }}>{f.title} <span className="sr-only">({f.lvl})</span></div><Muted style={{ whiteSpace: 'normal' }}>{f.sub}</Muted></div>
  <Button size="s" variant="secondary" onClick={onFix}>{f.fix}</Button>
</div>;
export function Summary({ desktop, toast }) {
  const stops = [['Tokyo', 'teal', '12–16 Oct', 4, 'Hotel Gracery', '¥98k', '¥24.5k'], ['Hakone', 'coral', '16–17 Oct', 1, null, '¥12k', '¥12k'], ['Kyoto', 'lilac', '17–21 Oct', 4, 'Machiya Gion', '¥124k', '¥31k'], ['Osaka', 'lilac', '21–23 Oct', 2, 'Nohga Hotel', '¥78k', '¥39k']];
  return <Col gap={desktop ? 18 : 12}>
    <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(4, minmax(0,1fr))' : '1fr 1fr', gap: 12 }}>
      <StatCard tone="teal" label="Nights" value="11" sub="4 stops · 2 chapters" />
      <StatCard tone="sun" label="Trip cost" value="¥312k" sub="≈ A$3,120 · shared" />
      <StatCard tone="lilac" label="Paid so far" value="¥184k" progress={59} sub="59% of cost" />
      <StatCard tone="coral" label="Flags" value="5" sub="2 need fixing" />
    </div>
    <div style={grid(desktop, 'minmax(0,1.2fr) minmax(0,1fr)')}>
      <Card padding={desktop ? 20 : 14}><Row justify="space-between"><H size="h4">Worth a look</H><Muted>sorted by urgency</Muted></Row><div style={{ marginTop: 6 }}>{FLAGS.map(f => <FlagRow key={f.title} f={f} onFix={() => toast && toast(f.fix + '…')} />)}</div></Card>
      <Col gap={12}><MapBox points={[{ name: 'Sydney', lat: 33.4, lng: 141.2, tone: 'ink', label: 'Home', off: true }, ...JAPAN]} h={desktop ? 300 : 220} bbox={[134.6, 33.2, 141.6, 36.4]} /><Muted>Home base Sydney · round trip. The route is dashed where there's no transport yet.</Muted></Col>
    </div>
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'minmax(0,1.3fr) .8fr .5fr minmax(0,1.2fr) .7fr .7fr' : 'minmax(0,1fr) auto auto', gap: 10, padding: '10px 16px', background: 'var(--surface-page)', borderBottom: 'var(--border)', font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase' }}><span>Stop</span>{desktop && <span>Dates</span>}<span>Nights</span>{desktop && <span>Bed</span>}<span>Cost</span>{desktop && <span>Per day</span>}</div>
      {stops.map(([n, tone, d, nights, bed, cost, day]) => <div key={n} style={{ display: 'grid', gridTemplateColumns: desktop ? 'minmax(0,1.3fr) .8fr .5fr minmax(0,1.2fr) .7fr .7fr' : 'minmax(0,1fr) auto auto', gap: 10, padding: '10px 16px', borderTop: '1px solid var(--outline-soft)', alignItems: 'center', font: 'var(--type-body-s)' }}>
        <Row gap={8}><span style={{ width: 12, height: 12, borderRadius: '50%', border: 'var(--border)', background: `var(--accent-${{ teal: 'route', coral: 'primary', lilac: 'stay' }[tone]})`, flex: 'none' }}></span><b>{n}</b></Row>
        {desktop && <span>{d}</span>}<span style={{ fontWeight: 800 }}>{nights}</span>
        {desktop && (bed ? <span>{bed}</span> : <Chip size="s" tone="coral" style={{ justifySelf: 'start' }}>! none</Chip>)}
        <span style={{ fontWeight: 800 }}>{cost}</span>{desktop && <span style={{ color: 'var(--text-muted)' }}>{day}</span>}
      </div>)}
    </Card>
  </Col>;
}

/* ---------- GLOBE: account-level map of everywhere (ADR 0023–0025) ---------- */
export function Globe({ desktop, toast }) {
  const [f, setF] = React.useState('All');
  const M = [{ name: 'Kyoto', lat: 35, lng: 135.8, tone: 'lilac', kind: 'Been', trip: 'Japan in Autumn', side: 'above' }, { name: 'Lisbon', lat: 38.7, lng: -9.1, tone: 'lilac', kind: 'Been', trip: 'Iberia 2024' }, { name: 'Queenstown', lat: -45, lng: 168.7, tone: 'lilac', kind: 'Been', trip: 'NZ ski week' },
    { name: 'Naoshima', lat: 34.5, lng: 134, tone: 'coral', kind: 'Want', trip: null, side: 'below' }, { name: 'Hội An', lat: 15.9, lng: 108.3, tone: 'coral', kind: 'Want', trip: null }, { name: 'Oaxaca', lat: 17, lng: -96.7, tone: 'coral', kind: 'Want', trip: null }, { name: 'Tromsø', lat: 69.6, lng: 18.9, tone: 'coral', kind: 'Want', trip: null }, { name: 'Sydney', lat: -33.9, lng: 151.2, tone: 'ink', kind: 'Home', trip: null }];
  const shown = M.filter(m => f === 'All' || m.kind === f || m.kind === 'Home');
  const list = <Card padding={desktop ? 18 : 14}>
    <Input placeholder="Search places" leading={<Icon name="search" size={18} />} aria-label="Search the globe" />
    <Col gap={0} style={{ marginTop: 8 }}>{shown.filter(m => m.kind !== 'Home').map(m => <div key={m.name} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--outline-soft)' }}>
      <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', border: 'var(--border)', background: m.kind === 'Been' ? 'var(--accent-stay)' : 'var(--accent-primary)', flex: 'none' }}></span>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: 'var(--type-body-s)', fontWeight: 800 }}>{m.name}</div><Muted>{m.trip || 'On your someday list'}</Muted></div>
      {m.kind === 'Want' ? <Button size="s" variant="secondary" onClick={() => toast && toast(m.name + ' added to a trip wishlist')}>+ To a trip</Button> : <Chip size="s" tone="lilac">been</Chip>}
    </div>)}</Col>
  </Card>;
  return <Col gap={desktop ? 18 : 12}>
    <Row justify="space-between" style={{ flexWrap: 'wrap', gap: 8 }}><Row gap={6}><Chip tone="lilac">14 countries</Chip><Chip tone="coral">23 someday</Chip><Chip>3 trips</Chip></Row><Segmented options={['All', 'Been', 'Want']} value={f} onChange={setF} tone="ink" /></Row>
    <div style={grid(desktop, 'minmax(0,1.7fr) minmax(0,1fr)')}>
      <Col gap={8}><MapBox points={shown} route={false} h={desktop ? 460 : 260} bbox={[-120, -50, 180, 72]} label="Flat map · Leaflet + Carto" /><Row gap={12}><Row gap={6}><span style={{ width: 12, height: 12, borderRadius: '50%', border: 'var(--border)', background: 'var(--accent-stay)' }}></span><Muted>been</Muted></Row><Row gap={6}><span style={{ width: 12, height: 12, borderRadius: '50%', border: 'var(--border)', background: 'var(--accent-primary)' }}></span><Muted>want to go</Muted></Row><Muted style={{ marginLeft: 'auto' }}>Tap the map to drop a pin</Muted></Row></Col>
      {list}
    </div>
  </Col>;
}
