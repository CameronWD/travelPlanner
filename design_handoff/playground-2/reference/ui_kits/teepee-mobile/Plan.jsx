import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Select } from '../../components/forms/Select.jsx';
import { TopBar } from '../../components/navigation/TopBar.jsx';
import { EmptyState } from '../../components/feedback/EmptyState.jsx';
import { H, Muted, Row, Page, Label } from '../shared/kit.jsx';
import { trip } from '../shared/data.js';
export function Plan({ go, openSheet, fork, setFork, empty }) {
  const chap = n => trip.chapters.find(c => c.name === n);
  return (
    <>
      <TopBar title="The plan" trailing={<Select size="s" value={fork} onChange={setFork} options={['Real plan', 'Slow Kyoto', '+ New fork']} />} />
      {!empty && <Row gap={6} style={{ padding: '12px var(--page-gutter) 0', flexWrap: 'wrap' }}>{trip.chapters.map(c => <Chip key={c.name} tone={c.tone}>{c.name} · {c.dates.replace('Oct ', '')}</Chip>)}<Chip>{trip.nights} nights ✓</Chip></Row>}
      <Page gap={10}>
        {empty ? <>
          <EmptyState glyph="→" tone="teal" title="Where first?" body="Add your first stop. Nights, beds and trains hang off it." action="+ Add a stop" onAction={() => openSheet('place')} style={{ marginTop: 20 }} />
          <Card tone="sun" padding={14}><Label>Tip</Label><Muted style={{ color: 'var(--text-primary)', marginTop: 4, whiteSpace: 'normal' }}>Not sure yet? Add a few and fork the plan later — "Real plan" vs "Slow Kyoto".</Muted></Card>
        </> : <>
          <Row gap={8} style={{ padding: '0 4px', font: 'var(--type-caption)', color: 'var(--text-muted)' }}><span style={{ width: 22, height: 22, borderRadius: 'var(--radius-xs)', background: 'var(--surface-inverse)', color: 'var(--text-inverse)', display: 'grid', placeItems: 'center', font: 'var(--type-label)' }}>H</span>{trip.home.city} · {trip.home.flight} · {trip.home.dep}<span style={{ flex: 1, borderTop: '2px dotted var(--outline)' }} /></Row>
          {trip.stops.map((s, i) => {
            const first = i === 0 || trip.stops[i - 1].chapter !== s.chapter;
            return <React.Fragment key={s.id}>
              <Card onClick={() => go('stop', s.id)} sticker={first ? <Chip tone={chap(s.chapter).tone} uppercase size="s">{s.chapter}</Chip> : null} style={{ marginTop: first ? 6 : 0 }}>
                <Row justify="space-between" align="baseline" style={{ marginTop: first ? 4 : 0 }}><H size="h4" style={{ fontSize: 22 }}>{s.name}</H><span style={{ font: 'var(--type-caption)', fontWeight: 700 }}>{s.nights} night{s.nights > 1 ? 's' : ''}</span></Row>
                <Muted>{s.from} – {s.to}</Muted>
                <Row gap={6} style={{ marginTop: 10, flexWrap: 'wrap' }}>
                  {s.stay ? <Chip tone="lilac">Zz {s.stay} {s.paid ? '✓' : '· unpaid'}</Chip> : <Chip tone="coral">No bed yet — add one</Chip>}
                  <Chip tone="sun">{s.todos.length} to do</Chip>
                </Row>
              </Card>
              {s.out ? <div style={{ padding: '0 4px' }}><Chip tone="sun">→ {s.out.label} · {s.out.time.split(' → ')[0].split(' ').pop()}</Chip></div>
                : <div style={{ padding: '0 4px' }}><Chip dashed onClick={() => openSheet('transport')} style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary-text)' }}>→ {s.name} → {trip.stops[i + 1] && trip.stops[i + 1].name} · nothing yet · add</Chip></div>}
            </React.Fragment>;
          })}
        </>}
      </Page>
      {!empty && <div style={{ padding: '10px var(--page-gutter) 0' }}><Button block size="l" onClick={() => openSheet('place')}>+ Add a place</Button></div>}
    </>
  );
}
