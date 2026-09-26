import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { IconButton } from '../../components/core/IconButton.jsx';
import { Card } from '../../components/core/Card.jsx';
import { TopBar } from '../../components/navigation/TopBar.jsx';
import { H, Label, Muted, Row, Col, Page } from '../shared/kit.jsx';
import { Skeleton, SkeletonCard, Loading, OfflineBanner, SyncChip, ErrorPanel, InlineError, PermissionCard } from '../shared/states.jsx';
import { trip } from '../shared/data.js';

// System states, one per `kind`: loading | offline | error | push | install
export function States({ kind, toast }) {
  if (kind === 'loading') return <><Loading /><Row justify="space-between" style={{ padding: '14px var(--page-gutter) 0' }}><Col gap={8}><Skeleton w={80} h={10} /><Skeleton w={200} h={28} /></Col><Skeleton w={84} h={30} r={999} /></Row>
    <Page><SkeletonCard h={180} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><SkeletonCard /><SkeletonCard /></div><SkeletonCard h={140}><Skeleton w="45%" h={16} />{[0, 1, 2].map(i => <Row key={i} gap={10}><Skeleton w={34} h={34} r={10} /><Col gap={6} style={{ flex: 1 }}><Skeleton w="70%" h={12} /><Skeleton w="40%" h={10} /></Col></Row>)}</SkeletonCard></Page></>;
  if (kind === 'offline') return <><TopBar title="The plan" /><Page>
    <OfflineBanner queued={2} />
    {trip.stops.slice(0, 3).map((s, i) => <Card key={s.id} tone={i === 1 ? 'white' : s.chapter === 'Kanto' ? 'teal' : 'lilac'} padding={14}><Row justify="space-between"><H size="h4">{s.name}</H>{i === 1 ? <SyncChip state="queued" /> : <Muted style={{ color: 'var(--text-primary)' }}>{s.nights}n</Muted>}</Row><Muted style={{ color: 'var(--text-primary)', marginTop: 4 }}>{i === 1 ? 'You added "Onsen" · saved on this phone' : s.stay}</Muted></Card>)}
    <Card padding={14}><Row justify="space-between"><div><Label>Tickets</Label><div style={{ font: 'var(--type-body-s)', marginTop: 4 }}>Romancecar · Shinkansen Hikari</div></div><SyncChip state="synced" /></Row><Muted style={{ marginTop: 6, whiteSpace: 'normal' }}>Saved for offline. They open even with no signal.</Muted></Card>
    <InlineError onRetry={() => toast('Retrying…')}>Jess's photo from Hakone didn't upload</InlineError>
  </Page></>;
  if (kind === 'error') return <><TopBar title="Money" /><Page style={{ justifyContent: 'center' }}><ErrorPanel onRetry={() => toast('Back online')} /></Page></>;
  if (kind === 'push' || kind === 'install') return <><TopBar title="Japan in Autumn" size="m" /><Page style={{ justifyContent: 'flex-end', paddingBottom: 28 }}><PermissionCard kind={kind} onYes={() => toast(kind === 'push' ? 'Notifications on' : 'Added · find Teepee on your home screen')} onNo={() => toast('No worries · change it in You')} /></Page></>;
  return null;
}
