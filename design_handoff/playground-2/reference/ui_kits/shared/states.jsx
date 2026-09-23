import React from 'react';
import { Icon } from '../../components/core/Icon.jsx';
import { Button } from '../../components/core/Button.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { EmptyState } from '../../components/feedback/EmptyState.jsx';
import { H, Label, Muted, Row, Col } from './kit.jsx';

// Skeleton: soft block that shimmers; static under reduced motion (a11y.css kills the animation)
export const Skeleton = ({ w = '100%', h = 14, r = 8, style }) => <span aria-hidden="true" style={{ display: 'block', width: w, height: h, borderRadius: r, background: 'var(--outline-soft)', opacity: .55, animation: 'tp-pulse 1.2s ease-in-out infinite alternate', ...style }}></span>;
export const SkeletonCard = ({ h = 120, tone, children, style }) => <div aria-hidden="true" style={{ border: 'var(--border)', borderColor: 'var(--outline-soft)', borderRadius: 'var(--radius-l)', padding: 14, minHeight: h, background: tone ? 'var(--surface-card)' : 'var(--surface-page)', display: 'flex', flexDirection: 'column', gap: 10, ...style }}>{children || <><Skeleton w="40%" h={10} /><Skeleton w="70%" h={22} /><Skeleton w="55%" h={10} style={{ marginTop: 'auto' }} /></>}</div>;
export const Loading = ({ label = 'Loading your trip' }) => <><span role="status" className="sr-only">{label}</span><style>{'@keyframes tp-pulse{from{opacity:.35}to{opacity:.7}}'}</style></>;

// Offline: sticky strip — app keeps working from cache, edits queue
export const OfflineBanner = ({ queued = 2, style }) => <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface-inverse)', color: 'var(--text-inverse)', borderRadius: 'var(--radius-m)', font: 'var(--type-body-s)', fontWeight: 700, ...style }}>
  <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--pg-sun)', flex: 'none' }}></span>
  <span style={{ flex: 1, minWidth: 0 }}>Offline · showing what's saved{queued ? ` · ${queued} edits will sync` : ''}</span>
</div>;
export const SyncChip = ({ state = 'queued' }) => <Chip size="s" tone={state === 'queued' ? 'sun' : state === 'failed' ? 'coral' : 'teal'}>{state === 'queued' ? '↻ waiting to sync' : state === 'failed' ? '! didn\u2019t save' : '✓ synced'}</Chip>;

// Error: friendly, specific, one retry
export const ErrorPanel = ({ title = 'That didn\u2019t load', body = 'Teepee couldn\u2019t reach the server. Your trip is safe — nothing was lost.', onRetry, code = 'ERR 503', style }) => <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: '32px 22px', border: 'var(--border)', borderRadius: 'var(--radius-xl)', background: 'var(--surface-card)', ...style }}>
  <span aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 'var(--radius-l)', background: 'var(--accent-primary)', border: 'var(--border)', boxShadow: 'var(--shadow-2)', display: 'grid', placeItems: 'center', color: 'var(--on-accent-text)' }}><Icon name="wifi-off" size={30} /></span>
  <div style={{ font: 'var(--type-h3)', letterSpacing: 'var(--tracking-display)' }}>{title}</div>
  <div style={{ font: 'var(--type-body-s)', color: 'var(--text-body)', maxWidth: 300, textWrap: 'pretty' }}>{body}</div>
  <Row gap={8}><Button onClick={onRetry}>Try again</Button><Button variant="ghost">Status page</Button></Row>
  <Muted>{code}</Muted>
</div>;
export const InlineError = ({ children, onRetry }) => <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '2px solid var(--accent-primary-text)', borderRadius: 'var(--radius-m)', background: 'var(--surface-card)', font: 'var(--type-body-s)' }}><span aria-hidden="true" style={{ color: 'var(--accent-primary-text)', display: 'flex' }}><Icon name="circle-alert" size={18} /></span><span style={{ flex: 1 }}>{children}</span>{onRetry && <Button size="s" variant="secondary" onClick={onRetry}>Retry</Button>}</div>;

// Permission prompts — our pre-prompt before the browser's, so a "no" is cheap
export const PermissionCard = ({ kind = 'push', onYes, onNo, style }) => {
  const c = { push: { tone: 'sun', title: 'Want a nudge?', body: 'We\u2019ll ping you when someone changes the plan, a booking is still missing, or it\u2019s time to leave for the train. Nothing else.', yes: 'Turn on notifications' },
    install: { tone: 'teal', glyph: '▲', title: 'Put Teepee on your home screen', body: 'Opens like an app, and your tickets and bookings work with no signal.', yes: 'Add to home screen' },
    location: { tone: 'lilac', glyph: '◎', title: 'Show where you are?', body: 'Only while the app is open, to put you on the day map. Never shared with your people unless you say so.', yes: 'Allow while using' } }[kind];
  return <Card tone={c.tone} shadow={3} radius="xl" padding={20} style={style}>
    <Col gap={10}>
      <span aria-hidden="true" style={{ font: 'var(--type-h2)' }}><Icon name={{ push: 'bell', install: 'download', location: 'map-pin' }[kind]} size={30} /></span>
      <H size="h3" wrap>{c.title}</H>
      <div style={{ font: 'var(--type-body-s)', textWrap: 'pretty' }}>{c.body}</div>
      <Row gap={8} style={{ marginTop: 4, flexWrap: 'wrap' }}><Button onClick={onYes}>{c.yes}</Button><Button variant="ghost" onClick={onNo}>Not now</Button></Row>
    </Col>
  </Card>;
};

// Empty screens for every section, used by both kits
export const EMPTY = {
  Home: { glyph: <Icon name="plane" size={30} />, tone: 'coral', title: 'Nothing planned yet', body: 'Start with where. Dates, beds and money can come later.', action: '+ Start a trip', sheet: null },
  Plan: { glyph: <Icon name="route" size={30} />, tone: 'teal', title: 'No stops yet', body: 'Add the first place. We\u2019ll draw the route as you go.', action: '+ Add a place', sheet: 'place' },
  Days: { glyph: <Icon name="calendar" size={30} />, tone: 'sun', title: 'No dates yet', body: 'Pick when you leave and we\u2019ll lay your stops across the calendar.', action: '+ Add dates', sheet: null },
  Money: { glyph: '¥', tone: 'sun', title: 'No costs yet', body: 'Log the first one and we\u2019ll add it up in your home currency.', action: '+ Add a cost', sheet: 'cost' },
  Wishlist: { glyph: <Icon name="heart" size={30} />, tone: 'lilac', title: 'No ideas yet', body: 'Drop in anything you might want to do. Your people can vote.', action: '+ Add an idea', sheet: 'idea' },
  People: { glyph: 'CW', tone: 'lilac', title: 'Just you so far', body: 'Invite your people. They can edit everything, or only look.', action: '+ Invite someone', sheet: 'invite' },
  Search: { glyph: <Icon name="search" size={30} />, tone: 'teal', title: 'Nothing called \u201cnaoshma\u201d', body: 'Try a place, a day like \u201cSat 18\u201d, or a person.', action: null, sheet: null },
};
export const EmptyScreen = ({ kind, openSheet, style }) => { const e = EMPTY[kind]; return <EmptyState glyph={e.glyph} tone={e.tone} title={e.title} body={e.body} action={e.action} onAction={() => e.sheet && openSheet && openSheet(e.sheet)} style={style} />; };
