import React from 'react';
import { Dock } from '../../components/navigation/Dock.jsx';
import { Button } from '../../components/core/Button.jsx';
import { H, Label, Muted, Row, Col, TONE } from '../shared/kit.jsx';
import { people } from '../shared/data.js';
const NAV = [{ key: 'today', label: 'Today' }, { key: 'home', label: 'Home' }, { key: 'plan', label: 'Plan' }, { key: 'days', label: 'Days' }, { key: 'money', label: 'Money' }, { key: 'wishlist', label: 'Wishlist' }, { key: 'more', label: 'More' }, { key: 'trips', label: 'Trips', muted: true }, { key: 'globe', label: 'Globe', muted: true }, { key: 'settings', label: 'You', muted: true }];
export function Shell({ screen, go, dark, children, aside, title, trailing, cta, onCta }) {
  return (
    <div data-theme={dark ? 'dark' : undefined} style={{ width: 1280, height: 800, flex: 'none', background: 'var(--surface-page)', color: 'var(--text-primary)', border: '2px solid #1D1D1B', borderRadius: 'var(--radius-2xl)', boxShadow: '8px 8px 0 #1D1D1B', overflow: 'hidden', display: 'grid', gridTemplateColumns: aside ? '96px 1fr 340px' : '96px 1fr', font: 'var(--type-body)', position: 'relative' }}>
      <Dock items={NAV} value={screen} onChange={go} people={people} />
      <div style={{ padding: '28px 32px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {title && <Row gap={12} style={{ marginBottom: 18 }}><H size="h1">{title}</H>{trailing}{cta && <Button style={{ marginLeft: 'auto' }} onClick={onCta}>{cta}</Button>}</Row>}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4, paddingBottom: 8 }}>{children}</div>
      </div>
      {aside && <aside style={{ borderLeft: 'var(--border)', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--surface-card)', overflowY: 'auto', minWidth: 0 }}>{aside}</aside>}
    </div>
  );
}
