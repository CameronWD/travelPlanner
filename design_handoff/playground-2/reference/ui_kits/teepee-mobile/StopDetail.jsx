import React from 'react';
import { Icon } from '../../components/core/Icon.jsx';
import { Button } from '../../components/core/Button.jsx';
import { IconButton } from '../../components/core/IconButton.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Stepper } from '../../components/forms/Stepper.jsx';
import { Checkbox } from '../../components/forms/Checkbox.jsx';
import { TopBar } from '../../components/navigation/TopBar.jsx';
import { ListRow } from '../../components/navigation/ListRow.jsx';
import { H, Label, Muted, Row, Page } from '../shared/kit.jsx';
import { trip, yenFull } from '../shared/data.js';
export function StopDetail({ id = 'hakone', go, openSheet, embedded }) {
  const i = trip.stops.findIndex(s => s.id === id); const s = trip.stops[i]; const prev = trip.stops[i - 1]; const next = trip.stops[i + 1];
  const chap = trip.chapters.find(c => c.name === s.chapter);
  const [nights, setNights] = React.useState(s.nights);
  const [done, setDone] = React.useState({});
  return (
    <>
      <TopBar size="m" title={<Chip tone={chap.tone} uppercase size="s">{s.chapter}</Chip>} leading={embedded ? null : <IconButton tone="ghost" label="Back" onClick={() => go('plan')}><Icon name="chevron-left" size={22} /></IconButton>} trailing={<IconButton tone="ghost" label="More">⋮</IconButton>} />
      <Page>
        <Row justify="space-between" align="flex-end"><div><H size="h1" style={{ fontSize: 40 }}>{s.name}</H><Muted style={{ marginTop: 4 }}>{s.from} – {s.to} · stop {i + 1}/{trip.stops.length}</Muted></div><Stepper value={nights} min={1} onChange={setNights} unit="n" /></Row>
        {s.stay ? <Card tone="lilac"><Label>Stay</Label><Row justify="space-between" style={{ marginTop: 6 }}><H size="h4">Zz {s.stay}</H><Chip tone={s.paid ? 'teal' : 'coral'} size="s">{s.paid ? 'paid ✓' : 'unpaid'}</Chip></Row><Muted style={{ color: 'var(--text-primary)', marginTop: 4 }}>{yenFull(s.stayCost)} · {s.nights} nights · check-in 15:00</Muted></Card>
          : <Card tone="coral" onClick={() => openSheet('stay')}><Label>Stay</Label><Row justify="space-between" style={{ marginTop: 6 }}><H size="h4">No bed yet</H><span style={{ font: 'var(--type-button-l)' }}>+</span></Row><Muted style={{ color: 'var(--text-primary)', marginTop: 4 }}>1 night · Oct 17 · ryokan or onsen?</Muted></Card>}
        <Card>
          <Row justify="space-between"><H size="h4">Things to do</H><Chip tone="sun" size="s">{s.todos.length}</Chip></Row>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>{s.todos.map(t => <Checkbox key={t} label={t} checked={!!done[t]} onChange={v => setDone({ ...done, [t]: v })} />)}</div>
          <Button variant="dashed" size="s" style={{ marginTop: 12 }} onClick={() => go('wishlist')}>+ From the wishlist</Button>
        </Card>
        <Card>
          <H size="h4">Getting here & away</H>
          {prev && prev.out && <ListRow tile="→" tileTone="sun" title={`In · ${prev.out.label}`} sub={prev.out.time} style={{ marginTop: 12 }} trailing={yenFull(prev.out.cost)} />}
          {s.out ? <ListRow tile="→" tileTone="sun" title={`Out · ${s.out.label}`} sub={s.out.time} style={{ marginTop: 10 }} trailing={s.out.cost ? yenFull(s.out.cost) : '—'} />
            : <ListRow tile="?" tileTone="coral" title={`Out · ${s.name} → ${next ? next.name : 'home'}`} sub="nothing booked — train or bus?" style={{ marginTop: 10 }} trailing="+" onClick={() => openSheet('transport')} />}
        </Card>
        <Row justify="space-between" style={{ font: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-muted)', padding: '0 4px' }}><span onClick={() => prev && go('stop', prev.id)} style={{ cursor: 'pointer' }}>{prev ? '‹ ' + prev.name : ''}</span><span onClick={() => next && go('stop', next.id)} style={{ cursor: 'pointer' }}>{next ? next.name + ' ›' : ''}</span></Row>
      </Page>
    </>
  );
}
