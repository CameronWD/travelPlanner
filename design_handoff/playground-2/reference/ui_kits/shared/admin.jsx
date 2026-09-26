import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { IconButton } from '../../components/core/IconButton.jsx';
import { Chip } from '../../components/core/Chip.jsx';
import { Card } from '../../components/core/Card.jsx';
import { Avatar } from '../../components/core/Avatar.jsx';
import { Icon } from '../../components/core/Icon.jsx';
import { Logo } from '../../components/core/Logo.jsx';
import { Input } from '../../components/forms/Input.jsx';
import { Select } from '../../components/forms/Select.jsx';
import { Toggle } from '../../components/forms/Toggle.jsx';
import { Segmented } from '../../components/forms/Segmented.jsx';
import { ListRow } from '../../components/navigation/ListRow.jsx';
import { H, Label, Muted, Row, Col } from './kit.jsx';

const grid = (desktop, cols) => ({ display: 'grid', gridTemplateColumns: desktop ? cols : 'minmax(0,1fr)', gap: desktop ? 18 : 12, alignItems: 'start' });
const Section = ({ title, sub, children, tone }) => <Card tone={tone} padding={18}><H size="h4">{title}</H>{sub && <Muted style={{ whiteSpace: 'normal', marginTop: 2 }}>{sub}</Muted>}<Col gap={12} style={{ marginTop: 14 }}>{children}</Col></Card>;
const Two = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>{children}</div>;

/* ---------- TRIP SETTINGS ---------- */
export function TripSettings({ desktop, toast }) {
  const [round, setRound] = React.useState(true);
  return <div style={grid(desktop, 'minmax(0,1fr) minmax(0,1fr)')}>
    <Col gap={desktop ? 18 : 12}>
      <Section title="The trip">
        <div style={{ height: 120, borderRadius: 'var(--radius-m)', border: '2px dashed var(--outline-soft)', background: 'var(--accent-primary)', display: 'grid', placeItems: 'center', position: 'relative' }}><Row gap={6} style={{ font: 'var(--type-body-s)', fontWeight: 800, color: 'var(--on-accent-text)' }}><Icon name="camera" size={16} />Cover photo</Row><Button size="s" variant="secondary" style={{ position: 'absolute', right: 10, bottom: 10 }}>Change</Button></div>
        <Input label="Name" value="Japan in Autumn" />
        <Two><Input label="Starts" value="Sun 12 Oct" /><Input label="Hard end date" value="Fri 24 Oct" hint="Flight home, back at work, etc." /></Two>
        <Muted style={{ whiteSpace: 'normal', marginTop: -4 }}>We'll flag it if the plan runs past the hard end date. It never stops you planning.</Muted>
      </Section>
      <Section title="Home base" sub="Where you leave from. It isn't a stop: no nights, just the first and last legs.">
        <Input label="Home" value="Sydney, Australia" leading={<Icon name="home" size={18} />} />
        <Toggle checked={round} onChange={setRound} label="Round trip, coming back here" />
      </Section>
    </Col>
    <Col gap={desktop ? 18 : 12}>
      <Section title="Money" sub="Everything is one shared pot, totalled in your home currency.">
        <Select label="Home currency" value="AUD · Australian dollar" options={['AUD · Australian dollar', 'JPY · Japanese yen', 'USD']} />
        <div style={{ border: 'var(--border)', borderRadius: 'var(--radius-m)', overflow: 'hidden' }}>{[['JPY', '0.0100', 'auto · 22 Sep', false], ['USD', '1.52', 'you set this', true]].map(([c, r, src, manual], i) => <Row key={c} gap={10} style={{ padding: '10px 12px', borderTop: i ? '1px solid var(--outline-soft)' : 0 }}><b style={{ width: 40 }}>{c}</b><span style={{ flex: 1, font: 'var(--type-body-s)' }}>1 {c} = A${r}</span><Chip size="s" tone={manual ? 'sun' : 'white'}>{src}</Chip><Button size="s" variant="ghost">{manual ? 'Reset' : 'Override'}</Button></Row>)}</div>
        <Muted style={{ whiteSpace: 'normal' }}>Each cost keeps the rate from the day you entered it, so old totals don't drift.</Muted>
      </Section>
      <Section title="Travellers">
        {[['CW', 'teal', 'Cameron', 'you · owner'], ['JM', 'sun', 'Jess', 'can edit']].map(([i, t, n, r]) => <Row key={i} gap={10}><Avatar initials={i} tone={t} size={34} /><div style={{ flex: 1 }}><b>{n}</b><Muted>{r}</Muted></div></Row>)}
        <Row gap={10}><Avatar initials="?" tone="white" size={34} /><div style={{ flex: 1, minWidth: 0 }}><b>alex@hey.com</b><Muted>invited · joins when they sign in with this email</Muted></div><Button size="s" variant="ghost">Resend</Button></Row>
        <Button variant="dashed" block>+ Invite by email</Button>
      </Section>
      <Section title="Share and export">
        <ListRow tile={<Icon name="link" size={16} />} tileTone="teal" title="Read-only link" sub="Anyone with it can view · costs hidden" trailing={<Toggle checked onChange={() => {}} label={<span className="sr-only">Read-only link on</span>} />} />
        <ListRow tile={<Icon name="calendar" size={16} />} tileTone="sun" title="Calendar feed" sub="Subscribe from any calendar app" onClick={() => toast && toast('Feed link copied')} />
        <ListRow tile={<Icon name="copy" size={16} />} tileTone="lilac" title="Duplicate trip" sub="Copies stops and ideas without dates or costs" onClick={() => {}} />
      </Section>
      <Button variant="ghost" style={{ alignSelf: 'flex-start', color: 'var(--accent-primary-text)' }} leading={<Icon name="trash-2" size={16} />}>Delete this trip</Button>
    </Col>
  </div>;
}

/* ---------- ACCOUNT ---------- */
export function Account({ desktop, go }) {
  const [theme, setTheme] = React.useState('System');
  return <div style={grid(desktop, 'minmax(0,1fr) minmax(0,1fr)')}>
    <Col gap={12}>
      <Card tone="teal" padding={20}><Row gap={14}><Avatar initials="CW" tone="white" size={56} /><div><H size="h3">Cameron W</H><div style={{ font: 'var(--type-body-s)' }}>cameron@gmail.com · Google</div></div></Row></Card>
      <Section title="Look"><Segmented options={['Light', 'Dark', 'System']} value={theme} onChange={setTheme} tone="ink" /></Section>
      <Section title="Notifications" sub="Per event and channel. Quiet hours follow the trip's local time."><ListRow tile={<Icon name="bell" size={16} />} tileTone="sun" title="Notification settings" sub="Push on · email for money and reminders" onClick={() => {}} /></Section>
    </Col>
    <Col gap={12}>
      <Section title="Help and more">
        <ListRow tile="?" tileTone="lilac" title="How Teepee works" sub="Guide, chapters, rough stops, forks" onClick={() => go && go('help')} />
        <ListRow tile="✦" tileTone="coral" title="What's new" sub="3 updates since you last looked" onClick={() => go && go('whatsnew')} />
        <ListRow tile={<Icon name="mail" size={16} />} tileTone="teal" title="Send feedback" sub="Goes straight to the builders" onClick={() => go && go('feedback')} />
      </Section>
      <Button variant="secondary" leading={<Icon name="log-out" size={16} />} style={{ alignSelf: 'flex-start' }}>Sign out</Button>
    </Col>
  </div>;
}

/* ---------- HELP ---------- */
export function Help({ desktop }) {
  const T = [['Rough stops vs dated stops', 'Sketch a place with just a number of nights. Set dates when you\u2019re ready, and everything after it moves to fit.', 'route', 'teal'], ['Chapters', 'Group stops into parts of the trip (Kanto, Kansai). The bands work themselves out from the dates.', 'list', 'lilac'], ['Plan B (forks)', 'Try a different version without touching the real plan. Compare them, then keep one.', 'copy', 'coral'], ['Hard end date', 'Your real deadline. We flag it if the plan runs past it.', 'calendar', 'sun'], ['Costs and paying', 'Every cost has an amount. Ticking \u201cpaid\u201d asks what actually left your account.', 'wallet', 'sun'], ['Offline', 'Your itinerary, bookings and saved tickets open with no signal. Edits need a connection.', 'wifi-off', 'teal']];
  return <Col gap={desktop ? 18 : 12}>
    <Input placeholder="Search the guide" leading={<Icon name="search" size={18} />} aria-label="Search help" size={desktop ? 'l' : undefined} />
    <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(3, minmax(0,1fr))' : 'minmax(0,1fr)', gap: 12 }}>{T.map(([t, b, ic, tone]) => <Card key={t} padding={16} onClick={() => {}}><Row gap={10} align="flex-start"><span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, border: 'var(--border)', background: `var(--accent-${{ teal: 'route', lilac: 'stay', coral: 'primary', sun: 'money' }[tone]})`, color: 'var(--on-accent-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name={ic} size={16} /></span><div><div style={{ font: 'var(--type-h5)' }}>{t}</div><div style={{ font: 'var(--type-body-s)', color: 'var(--text-body)', marginTop: 4, textWrap: 'pretty' }}>{b}</div></div></Row></Card>)}</div>
  </Col>;
}

/* ---------- WHAT'S NEW ---------- */
export function WhatsNew({ desktop }) {
  const N = [['22 Sep', 'coral', 'A whole new look', 'Chunkier, brighter, easier to read in the sun. Dark mode is warmer too.', true], ['15 Sep', 'teal', 'Changeover days', 'Travel days now show check-out, the journey and check-in in one place.', true], ['8 Sep', 'sun', 'Feedback from inside the app', 'Tap "Send feedback" in You. It lands with us, screenshot and all.', true], ['28 Aug', 'lilac', 'Cost vs paid', '"Estimated" is now just "Cost". Ticking paid asks what you actually paid.', false]];
  return <Col gap={12} style={{ maxWidth: desktop ? 720 : undefined }}>{N.map(([d, tone, t, b, isNew], i) => <Card key={t} tone={i === 0 ? tone : 'white'} padding={18} shadow={i === 0 ? 4 : 2}><Row justify="space-between"><Label style={{ color: i === 0 ? undefined : 'var(--text-muted)' }}>{d}</Label>{isNew && <Chip size="s" uppercase tone={i === 0 ? 'white' : tone}>new</Chip>}</Row><H size={i === 0 ? 'h2' : 'h4'} wrap style={{ marginTop: 6 }}>{t}</H><div style={{ font: 'var(--type-body-s)', marginTop: 4, color: i === 0 ? undefined : 'var(--text-body)' }}>{b}</div></Card>)}</Col>;
}

/* ---------- FEEDBACK (ADR 0040: in-product notes, chat-shaped) ---------- */
export function Feedback({ desktop, toast }) {
  const [v, setV] = React.useState('');
  return <Card padding={0} style={{ maxWidth: desktop ? 560 : undefined, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 260 }}>
      <div style={{ alignSelf: 'flex-start', maxWidth: '82%', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', border: 'var(--border)', background: 'var(--accent-money)', color: 'var(--on-accent-text)', font: 'var(--type-body-s)' }}>What's bugging you, or what do you wish Teepee did? We read every one.</div>
      <div style={{ alignSelf: 'flex-end', maxWidth: '82%', padding: '10px 14px', borderRadius: '16px 16px 4px 16px', background: 'var(--surface-inverse)', color: 'var(--text-inverse)', font: 'var(--type-body-s)' }}>Drag to reorder should work on dated stops too</div>
      <div style={{ alignSelf: 'flex-start', maxWidth: '82%', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', border: 'var(--border)', background: 'var(--surface-page)', font: 'var(--type-body-s)' }}>Got it, noted with the Plan page attached. Anything else?</div>
    </div>
    <Row gap={8} style={{ padding: 12, borderTop: 'var(--border)', background: 'var(--surface-page)' }}><IconButton tone="ghost" label="Attach screenshot"><Icon name="camera" size={20} /></IconButton><Input value={v} onChange={setV} placeholder="Type a note…" aria-label="Feedback" style={{ flex: 1 }} /><Button disabled={!v} onClick={() => { setV(''); toast && toast('Sent · thanks'); }}>Send</Button></Row>
  </Card>;
}

/* ---------- SIGN IN ---------- */
export function SignIn({ desktop }) {
  return <div style={{ flex: 1, display: 'grid', gridTemplateColumns: desktop ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', minHeight: desktop ? 560 : '100%' }}>
    <div style={{ padding: desktop ? 56 : 24, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
      <Logo size={desktop ? 32 : 26} />
      <H size="display-l" wrap style={{ fontSize: desktop ? 64 : 44, lineHeight: .92 }}>Plan it with your people<span style={{ color: 'var(--accent-primary-text)' }}>.</span></H>
      <div style={{ font: 'var(--type-body-l)', color: 'var(--text-body)', maxWidth: 380 }}>One trip, everyone on it. Stops, days, money and the maybe-list.</div>
      <Button size="l" variant="secondary" style={{ alignSelf: desktop ? 'flex-start' : 'stretch' }} leading={<span aria-hidden="true" style={{ font: '800 18px/1 var(--font-body)' }}>G</span>}>Continue with Google</Button>
      <Muted style={{ whiteSpace: 'normal' }}>Got an invite? Sign in with the email it was sent to and the trip will be waiting.</Muted>
    </div>
    {desktop && <div style={{ background: 'var(--accent-money)', borderLeft: 'var(--border)', display: 'grid', placeItems: 'center', padding: 40 }}><Card tone="coral" shadow={5} radius="xl" padding={28} style={{ width: 360, transform: 'rotate(-3deg)' }}><Chip size="s" uppercase tone="white">19 sleeps</Chip><H size="h1" wrap style={{ marginTop: 22 }}>Japan in Autumn</H><div style={{ marginTop: 6 }}>12 – 24 Oct · 4 stops</div></Card></div>}
  </div>;
}

/* ---------- MORE (mobile): every trip page beyond the 4 tabs ---------- */
export function More({ go }) {
  const G = [['This trip', [['today', 'Today', 'Travel-day view · works offline', 'sun', 'clock'], ['summary', 'Summary', '5 flags · route map', 'coral', 'circle-alert'], ['wishlist', 'Wishlist', '6 ideas · 3 with votes', 'lilac', 'heart'], ['checklists', 'Checklists', 'Pre-trip 2/7 · packing 3/8', 'teal', 'check'], ['files', 'Files', '6 · 4 saved offline', 'sun', 'paperclip'], ['journal', 'Journal', '3 entries', 'lilac', 'camera'], ['shared', 'Your people', 'Jess, Alex · 1 invite pending', 'lilac', 'users'], ['compare', 'Compare plans', 'Real plan vs Plan B', 'coral', 'copy'], ['activity', 'Activity', '2 changes today', 'teal', 'refresh-cw'], ['print', 'Print and export', 'PDF · calendar feed', 'white', 'download'], ['tripSettings', 'Trip settings', 'Dates, home base, money, people', 'white', 'settings']]], ['You', [['trips', 'Your trips', '3 planned · 1 done', 'sun', 'tent'], ['globe', 'Your globe', '14 countries · 23 someday', 'teal', 'globe'], ['account', 'Account', 'Theme, notifications', 'white', 'users']]]];
  return <Col gap={14}>{G.map(([g, rows]) => <div key={g}><Label style={{ color: 'var(--text-muted)', marginBottom: 8 }}>{g}</Label><Card padding={10}>{rows.map(([k, t, s, tone, ic]) => <ListRow key={k} tile={<Icon name={ic} size={16} />} tileTone={tone} title={t} sub={s} onClick={() => go(k)} style={{ padding: 4 }} />)}</Card></div>)}</Col>;
}
