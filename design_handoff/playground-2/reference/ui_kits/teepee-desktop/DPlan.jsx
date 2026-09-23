import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { IconButton } from '../../components/core/IconButton.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Stepper } from '../../components/forms/Stepper.jsx';
import { Checkbox } from '../../components/forms/Checkbox.jsx';
import { ListRow } from '../../components/navigation/ListRow.jsx';
import { EmptyState } from '../../components/feedback/EmptyState.jsx';
import { H, Label, Muted, Row, Col, TONE } from '../shared/kit.jsx';
import { trip, people, trips, wishlist, october, dayPlan, yen, yenFull } from '../shared/data.js';
export function DPlan({ stopId, setStopId, openSheet, empty }) {
  const chap = n => trip.chapters.find(c => c.name === n);
  if (empty) return <div style={{ maxWidth: 520 }}><EmptyState glyph="→" tone="teal" title="Where first?" body="Add your first stop. Nights, beds and trains hang off it." action="+ Add a stop" onAction={() => openSheet('place')} /></div>;
  return (
    <>
      <Row gap={6} style={{ marginTop: -8 }}>{trip.chapters.map(c => <Chip key={c.name} tone={c.tone}>{c.name} · {c.dates}</Chip>)}<Chip dashed onClick={() => openSheet('place')}>+ chapter</Chip><Muted style={{ marginLeft: 'auto' }}>{trip.stops.length} stops · {trip.nights} nights ✓</Muted></Row>
      <Row gap={8} style={{ padding: '4px 4px 0', font: 'var(--type-caption)', color: 'var(--text-muted)' }}><span style={{ width: 22, height: 22, borderRadius: 'var(--radius-xs)', background: 'var(--surface-inverse)', color: 'var(--text-inverse)', display: 'grid', placeItems: 'center', font: 'var(--type-label)' }}>H</span>Home · {trip.home.city} · {trip.home.flight} {trip.home.dep} → {trip.home.arr}<span style={{ flex: 1, borderTop: '2px dotted var(--outline)' }} /></Row>
      {trip.stops.map((s, i) => <React.Fragment key={s.id}>
        <Card onClick={() => setStopId(s.id)} shadow={stopId === s.id ? 3 : 2} style={{ display: 'grid', gridTemplateColumns: '1fr 220px 200px 30px', gap: 14, alignItems: 'center', padding: '14px 16px', outline: stopId === s.id ? '2px solid var(--accent-primary)' : 'none', outlineOffset: 2 }}>
          <div><Row gap={8} align="baseline"><H size="h3">{s.name}</H><Chip tone={chap(s.chapter).tone} uppercase size="s">{s.chapter}</Chip></Row><Muted>{s.from} – {s.to} · {s.nights} night{s.nights > 1 ? 's' : ''}</Muted></div>
          {s.stay ? <Card tone="lilac" shadow={0} radius="m" padding="8px 12px" style={{ font: 'var(--type-caption)', fontWeight: 700, lineHeight: 1.3 }}>Zz {s.stay}<br/><span style={{ fontWeight: 600 }}>{yenFull(s.stayCost)} · {s.paid ? 'paid ✓' : 'unpaid'}</span></Card>
            : <Card tone="coral" shadow={0} radius="m" padding="8px 12px" onClick={e => { e.stopPropagation(); setStopId(s.id); openSheet('stay'); }} style={{ font: 'var(--type-caption)', fontWeight: 800, lineHeight: 1.3 }}>No bed yet<br/><span style={{ fontWeight: 600 }}>+ add a stay</span></Card>}
          <Card tone="sun" shadow={0} radius="m" padding="8px 12px" style={{ font: 'var(--type-caption)', fontWeight: 700, lineHeight: 1.3, overflow: 'hidden' }}>{s.todos.length} to do<br/><span style={{ fontWeight: 600, whiteSpace: 'nowrap', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.todos.slice(0, 2).join(', ')}…</span></Card>
          <span style={{ font: 'var(--type-button-l)', color: 'var(--text-muted)', textAlign: 'center' }}>⋮</span>
        </Card>
        <div style={{ padding: '0 4px' }}>{s.out ? <Chip tone="sun">→ {s.out.label} · {s.out.time}{s.out.cost ? ' · ' + yenFull(s.out.cost) : ''}</Chip> : <Chip dashed onClick={() => openSheet('transport')} style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary-text)' }}>→ {s.name} → {trip.stops[i + 1].name} · nothing yet · add</Chip>}</div>
      </React.Fragment>)}
    </>
  );
}
export function DStopPanel({ stopId, openSheet }) {
  const i = trip.stops.findIndex(s => s.id === stopId); const s = trip.stops[i]; const prev = trip.stops[i - 1]; const next = trip.stops[i + 1];
  const [nights, setNights] = React.useState(s.nights); React.useEffect(() => setNights(s.nights), [stopId]);
  const [done, setDone] = React.useState({});
  return (
    <>
      <Row justify="space-between"><Chip tone={trip.chapters.find(c => c.name === s.chapter).tone} uppercase size="s">{s.chapter}</Chip><Muted>stop {i + 1}/{trip.stops.length}</Muted></Row>
      <Row justify="space-between" align="flex-end"><H size="h1">{s.name}</H><Stepper value={nights} min={1} onChange={setNights} unit="n" /></Row>
      <Muted style={{ marginTop: -6 }}>{s.from} – {s.to}</Muted>
      {s.stay ? <Card tone="lilac"><Label>Stay</Label><H size="h5" style={{ marginTop: 4 }}>Zz {s.stay}</H><Muted style={{ color: 'var(--text-primary)', marginTop: 2 }}>{yenFull(s.stayCost)} · {s.paid ? 'paid ✓' : 'unpaid'}</Muted></Card>
        : <Card tone="coral" onClick={() => openSheet('stay')}><Label>Stay</Label><Row justify="space-between" style={{ marginTop: 4 }}><H size="h5">No bed yet</H><span style={{ font: 'var(--type-button-l)' }}>+</span></Row><Muted style={{ color: 'var(--text-primary)', marginTop: 2 }}>ryokan or onsen hotel?</Muted></Card>}
      <Card><Row justify="space-between"><H size="h5">Things to do</H><Chip tone="sun" size="s">{s.todos.length}</Chip></Row><Col gap={8} style={{ marginTop: 10 }}>{s.todos.map(t => <Checkbox key={t} label={t} checked={!!done[t]} onChange={v => setDone({ ...done, [t]: v })} />)}</Col></Card>
      <Card><H size="h5">In & out</H>{prev && prev.out && <ListRow tile="→" tileTone="sun" title={'In · ' + prev.out.label} sub={prev.out.time} trailing="" style={{ marginTop: 10 }} />}{s.out ? <ListRow tile="→" tileTone="sun" title={'Out · ' + s.out.label} sub={s.out.time} trailing="" style={{ marginTop: 8 }} /> : <ListRow tile="?" tileTone="coral" title={'Out · to ' + (next ? next.name : 'home')} sub="nothing booked" trailing="+" style={{ marginTop: 8 }} onClick={() => openSheet('transport')} />}</Card>
      <Muted style={{ marginTop: 'auto', whiteSpace: 'normal' }}>Fork: "Slow Kyoto" keeps Hakone 2 nights · <b>Compare →</b></Muted>
    </>
  );
}
