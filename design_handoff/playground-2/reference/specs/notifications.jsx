TeepeeDS.ready.then(() => {
const { Logo, Icon, Button, IconButton, Chip, Badge, Card, Avatar, Toggle, Segmented, Toast } = TeepeeDS;
// Catalogue: one row per event. ch = push | inapp | email; default on unless noted
const EVENTS = [
  { key: 'plan', tone: 'teal', icon: 'route', who: 'AL', name: 'Plan changed', title: 'Alex moved Arashiyama', body: 'Now Mon 20 Oct · Kyoto', ch: ['push', 'inapp'], timing: 'Batched: 10 min window, max 1 per trip per hour', group: '"Alex and Jess made 4 changes"' },
  { key: 'idea', tone: 'lilac', icon: 'heart', who: 'JM', name: 'New idea / vote', title: 'Jess added an idea', body: 'Kawaii Monster Cafe · Tokyo. Vote?', ch: ['inapp'], timing: 'In-app only', group: 'Daily roll-up' },
  { key: 'cost', tone: 'sun', icon: 'wallet', who: 'JM', name: 'Payment due', title: 'Nohga Hotel is due on arrival', body: '¥96,000 · Osaka, Tue 21 Oct · not paid yet', ch: ['push', 'inapp', 'email'], timing: '3 days before, 10:00 local', group: 'All due that day in one' },
  { key: 'leave', tone: 'coral', icon: 'train-front', who: null, name: 'Time to leave', title: 'Leave in 30 min for Romancecar', body: 'Shinjuku 09:00 · ticket saved offline', ch: ['push'], timing: 'Travel days only, local time. Ignores quiet hours', group: 'Never grouped' },
  { key: 'gap', tone: 'lilac', icon: 'bed', who: null, name: 'Gap in the plan', title: 'Hakone still needs a bed', body: '7 sleeps to go · 1 night, Fri 17 Oct', ch: ['push', 'inapp', 'email'], timing: 'T-14, T-7, T-2 days · 10:00 local', group: 'All gaps in one message' },
  { key: 'join', tone: 'teal', icon: 'users', who: 'RK', name: 'Someone joined', title: 'Rin joined Japan in Autumn', body: 'Say hi, or give them a job', ch: ['push', 'inapp'], timing: 'Immediate', group: '"3 people joined"' },
  { key: 'booking', tone: 'teal', icon: 'ticket', who: 'CW', name: 'Booking saved', title: 'Shinkansen Hikari saved', body: 'Sat 18 · 11:12 · ticket works offline', ch: ['inapp', 'email'], timing: 'Immediate · email to the booker only', group: 'Never grouped' },
];
const CH = { push: 'Push', inapp: 'In-app', email: 'Email' };
const ACC = { teal: 'var(--accent-route)', lilac: 'var(--accent-stay)', sun: 'var(--accent-money)', coral: 'var(--accent-primary)' };
const Tile = ({ e, size = 34 }) => <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 'var(--radius-s)', border: 'var(--border)', background: ACC[e.tone], color: 'var(--on-accent-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name={e.icon} size={size * .5} /></span>;
const H2 = ({ children, sub }) => <div><h2 style={{ margin: 0, font: 'var(--type-h2)', letterSpacing: 'var(--tracking-display)' }}>{children}</h2>{sub && <p style={{ margin: '6px 0 0', color: 'var(--text-body)', maxWidth: 720, textWrap: 'pretty' }}>{sub}</p>}</div>;
const Panel = ({ children, style }) => <section style={{ background: 'var(--surface-page)', border: 'var(--border)', borderRadius: 'var(--radius-xl)', padding: 24, boxShadow: 'var(--shadow-2)', display: 'flex', flexDirection: 'column', gap: 18, ...style }}>{children}</section>;

// OS-agnostic push previews: the OS draws these; we control icon, title (≤ 40), body (≤ 90), badge, actions
const PushLock = ({ e }) => <div style={{ background: 'rgba(255,251,243,.82)', backdropFilter: 'blur(10px)', borderRadius: 20, padding: '12px 14px', display: 'flex', gap: 10, color: '#1D1D1B' }}>
  <img src="../assets/logo/export/app-icon/icon-192.png" width="38" height="38" alt="" style={{ borderRadius: 9, flex: 'none' }} />
  <div style={{ minWidth: 0, flex: 1 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}><span>{e.title}</span><span style={{ fontWeight: 400, opacity: .6, flex: 'none', marginLeft: 8 }}>now</span></div><div style={{ fontSize: 13, lineHeight: 1.35, marginTop: 1 }}>{e.body}</div></div>
</div>;
const PushDesk = ({ e }) => <div style={{ width: '100%', maxWidth: 340, background: 'var(--surface-card)', border: '1px solid var(--outline-soft)', borderRadius: 14, padding: 12, display: 'flex', gap: 10, boxShadow: '0 10px 30px rgba(0,0,0,.15)' }}>
  <img src="../assets/logo/export/app-icon/icon-192.png" width="36" height="36" alt="" style={{ borderRadius: 8, flex: 'none' }} />
  <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Teepee · teepee.app</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{e.title}</div><div style={{ fontSize: 13, color: 'var(--text-body)' }}>{e.body}</div>
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}><span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: 'var(--surface-canvas)', whiteSpace: 'nowrap' }}>{e.key === 'cost' ? 'Mark paid' : e.key === 'leave' ? 'Open ticket' : 'Open'}</span><span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: 'var(--surface-canvas)', whiteSpace: 'nowrap' }}>Mute trip</span></div></div>
</div>;

function Inbox({ desktop }) {
  const [filter, setFilter] = React.useState('All'); const [read, setRead] = React.useState({ plan: false, cost: false, idea: true, gap: true, join: true });
  const items = [['Today', ['cost', 'plan']], ['Yesterday', ['idea', 'join']], ['Mon', ['gap']]];
  return <div style={{ width: '100%', maxWidth: desktop ? 400 : undefined, background: 'var(--surface-page)', border: 'var(--border)', borderRadius: desktop ? 'var(--radius-xl)' : 0, boxShadow: desktop ? 'var(--shadow-4)' : 'none', overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px 12px' }}><span style={{ font: 'var(--type-h3)', flex: 1 }}>What's new</span><Button size="s" variant="ghost" onClick={() => setRead({})}>Mark all read</Button></div>
    <div style={{ padding: '0 18px 10px' }}><Segmented options={['All', 'Needs you']} value={filter} onChange={setFilter} tone="ink" /></div>
    {items.map(([day, keys]) => { const list = keys.map(k => EVENTS.find(e => e.key === k)).filter(e => filter === 'All' || ['cost', 'gap'].includes(e.key)); if (!list.length) return null; return <div key={day}>
      <div style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '10px 18px 4px' }}>{day}</div>
      {list.map(e => { const unread = read[e.key] === false; return <div key={e.key} role="button" tabIndex={0} onClick={() => setRead({ ...read, [e.key]: true })} style={{ display: 'flex', gap: 12, padding: '10px 18px', alignItems: 'flex-start', background: unread ? 'var(--surface-card)' : 'transparent', borderTop: '1px solid var(--outline-soft)', cursor: 'pointer' }}>
        <Tile e={e} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ font: 'var(--type-body-s)', fontWeight: unread ? 800 : 600 }}>{e.title}</div><div style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', marginTop: 2 }}>{e.body}</div>{e.key === 'cost' && unread && <div style={{ display: 'flex', gap: 6, marginTop: 8 }}><Button size="s">Mark paid</Button><Button size="s" variant="ghost">Later</Button></div>}</div>
        {unread && <span aria-label="Unread" style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-primary)', border: '2px solid var(--outline)', flex: 'none', marginTop: 6 }}></span>}
      </div>; })}</div>; })}
  </div>;
}
function Prefs() {
  const [on, setOn] = React.useState(() => Object.fromEntries(EVENTS.flatMap(e => e.ch.map(c => [e.key + c, true]))));
  const [quiet, setQuiet] = React.useState(true);
  return <div style={{ background: 'var(--surface-card)', border: 'var(--border)', borderRadius: 'var(--radius-l)', overflow: 'hidden' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) repeat(3, 76px)', padding: '10px 16px', background: 'var(--surface-page)', borderBottom: 'var(--border)', font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase' }}><span>Tell me when</span>{Object.values(CH).map(c => <span key={c} style={{ textAlign: 'center' }}>{c}</span>)}</div>
    {EVENTS.map(e => <div key={e.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) repeat(3, 76px)', padding: '10px 16px', alignItems: 'center', borderTop: '1px solid var(--outline-soft)' }}>
      <span style={{ font: 'var(--type-body-s)', fontWeight: 700 }}>{e.name}</span>
      {Object.keys(CH).map(c => <span key={c} style={{ display: 'flex', justifyContent: 'center' }}>{e.ch.includes(c) ? <TeepeeDS.Checkbox checked={on[e.key + c]} onChange={v => setOn({ ...on, [e.key + c]: v })} label={e.name + ' by ' + CH[c]} style={{ gap: 0, fontSize: 0, width: 24, overflow: 'hidden' }} /> : <span style={{ color: 'var(--text-muted)' }}>–</span>}</span>)}
    </div>)}
    <div style={{ padding: '14px 16px', borderTop: 'var(--border)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}><Toggle checked={quiet} onChange={setQuiet} label="Quiet hours 22:00 – 08:00 (trip's local time)" /><span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>"Time to leave" still comes through.</span></div>
  </div>;
}
const EMAILS = [['invite', 'Invite', 'Cameron invited you to Japan in Autumn'], ['magic-link', 'Sign-in link', 'Your Teepee sign-in link'], ['trip-reminder', 'Trip reminder (T-7)', '7 sleeps until Japan'], ['booking-confirmed', 'Booking saved', 'Saved: Shinkansen Hikari, Sat 18 Oct']];

function App() {
  const [theme, setTheme] = React.useState(localStorage.getItem('tp-spec-theme') || 'light');
  React.useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('tp-spec-theme', theme); }, [theme]);
  const [ev, setEv] = React.useState('cost'); const e = EVENTS.find(x => x.key === ev);
  const [mail, setMail] = React.useState('invite');
  return <div style={{ maxWidth: 1200, margin: '0 auto', padding: 28, display: 'flex', flexDirection: 'column', gap: 22 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}><Logo size={24} /><h1 style={{ margin: 0, font: 'var(--type-h2)', flex: 1 }}>Notifications & email</h1><Segmented tone="ink" value={theme} onChange={setTheme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></div>
    <div style={{ background: 'var(--surface-inverse)', color: 'var(--text-inverse)', borderRadius: 'var(--radius-xl)', padding: '24px 28px' }}>
      <div style={{ font: 'var(--type-display-l)', fontSize: 40, letterSpacing: 'var(--tracking-display)', lineHeight: 1 }}>Only ping when it's about you, or it's time to go.</div>
      <p style={{ margin: '12px 0 0', maxWidth: 820, textWrap: 'pretty' }}>Seven events, three channels. Edits by other people are batched. Money and travel-day messages are never batched. Every push has one action and a "Mute trip". Titles ≤ 40 characters, bodies ≤ 90, in sentence case, with names up front and no exclamation marks.</p>
    </div>

    <Panel><H2 sub="Pick an event to preview it in every channel below.">Catalogue</H2>
      <div style={{ border: 'var(--border)', borderRadius: 'var(--radius-l)', overflow: 'hidden', background: 'var(--surface-card)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1.1fr) minmax(0,1.5fr) minmax(0,.9fr) minmax(0,1.3fr)', gap: 12, padding: '10px 14px', background: 'var(--surface-page)', borderBottom: 'var(--border)', font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase' }}><span></span><span>Event</span><span>Copy</span><span>Channels</span><span>Timing · grouping</span></div>
        {EVENTS.map(x => <div key={x.key} role="button" tabIndex={0} aria-pressed={ev === x.key} onClick={() => setEv(x.key)} onKeyDown={k => (k.key === 'Enter' || k.key === ' ') && setEv(x.key)} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1.1fr) minmax(0,1.5fr) minmax(0,.9fr) minmax(0,1.3fr)', gap: 12, padding: '12px 14px', alignItems: 'center', borderTop: '1px solid var(--outline-soft)', background: ev === x.key ? 'var(--surface-page)' : 'transparent', boxShadow: ev === x.key ? 'inset 4px 0 0 var(--accent-primary)' : 'none', cursor: 'pointer' }}>
          <Tile e={x} /><span style={{ font: 'var(--type-body-s)', fontWeight: 800 }}>{x.name}</span>
          <span style={{ font: 'var(--type-body-s)' }}><b>{x.title}</b><br /><span style={{ color: 'var(--text-muted)' }}>{x.body}</span></span>
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{x.ch.map(c => <Chip key={c} size="s" tone={{ push: 'coral', inapp: 'teal', email: 'sun' }[c]}>{CH[c]}</Chip>)}</span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-body)' }}>{x.timing}<br /><span style={{ color: 'var(--text-muted)' }}>Group: {x.group}</span></span>
        </div>)}
      </div>
    </Panel>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 22 }}>
      <Panel><H2 sub={e.ch.includes('push') ? 'Web Push from the PWA. The OS draws the frame. We control the icon, title, body, badge and actions.' : 'This event doesn\u2019t push. Preview shown for reference.'}>Push</H2>
        <div style={{ borderRadius: 28, padding: '40px 16px 22px', background: 'linear-gradient(160deg, #5C9694, #2C2924)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ textAlign: 'center', color: '#FFFBF3', font: '800 54px/1 var(--font-display)', letterSpacing: '-.03em' }}>9:41</div>
          <div style={{ textAlign: 'center', color: '#FFFBF3', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Friday 17 October</div>
          <PushLock e={e} /><PushLock e={EVENTS[0]} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 16, borderRadius: 'var(--radius-l)', background: 'var(--surface-canvas)', border: '1px solid var(--outline-soft)' }}><PushDesk e={e} /></div>
        <div style={{ font: 'var(--type-caption)', color: 'var(--text-body)', lineHeight: 1.6 }}><code>badge</code>: monochrome tent 96px · <code>icon</code>: icon-192.png · <code>tag</code>: trip id + event (replaces older) · <code>data.url</code>: deep link · iOS needs the PWA installed (16.4+)</div>
      </Panel>
      <Panel><H2 sub="Bell in the top bar (desktop) or on Home (mobile). The badge counts unread items that need you.">In-app</H2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ position: 'relative' }}><IconButton label="What's new, 2 unread"><Icon name="bell" size={20} /></IconButton><span style={{ position: 'absolute', top: -8, right: -8 }}><Badge count={2} size={20} /></span></span><span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>Opens a popover on desktop, a full screen on mobile</span></div>
        <Inbox desktop />
        <div style={{ display: 'flex', justifyContent: 'center' }}><Toast tone="ink" action="View">{e.title}</Toast></div>
        <div style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', textAlign: 'center', marginTop: -10 }}>Live toast while the app is open (replaces the push)</div>
      </Panel>
    </div>

    <Panel><H2 sub="Settings › Notifications. Defaults are shown. Per-trip mute is on each trip's menu.">Preferences</H2><Prefs /></Panel>

    <Panel><H2 sub="Send-ready HTML: table layout, inline styles, system fonts, bulletproof buttons, dark-mode safe. Files are in /emails. In Next.js, port them to React Email and send with Resend or Postmark.">Email</H2>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{EMAILS.map(([k, l]) => <Chip key={k} tone={mail === k ? 'coral' : 'white'} selected={mail === k} onClick={() => setMail(k)}>{l}</Chip>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 22, alignItems: 'start' }}>
        <iframe title={'Email preview: ' + mail} src={'../emails/' + mail + '.html'} style={{ width: '100%', maxWidth: 640, height: 820, border: 'var(--border)', borderRadius: 'var(--radius-l)', background: '#EFE9DF' }}></iframe>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card padding={16}><div style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Inbox view</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}><img src="../assets/logo/export/app-icon/icon-192.png" width="36" height="36" alt="" style={{ borderRadius: 18 }} /><div style={{ minWidth: 0 }}><div style={{ font: 'var(--type-body-s)', fontWeight: 800 }}>Teepee</div><div style={{ font: 'var(--type-body-s)' }}>{EMAILS.find(m => m[0] === mail)[2]}</div><div style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>From: Teepee &lt;hello@teepee.app&gt;</div></div></div></Card>
          <Card tone="sun" padding={16}><div style={{ font: 'var(--type-h5)' }}>Rules</div><ul style={{ margin: '8px 0 0', paddingLeft: 18, font: 'var(--type-body-s)', display: 'flex', flexDirection: 'column', gap: 4 }}><li>Subject = the push title. Preheader = the push body.</li><li>One button per email, verb first.</li><li>Transactional only. The footer links to settings, not "unsubscribe from everything".</li><li>Costs are never in subject lines (shared inboxes).</li><li>600px max, and fine at 320px.</li></ul></Card>
          <Button variant="secondary" onClick={() => window.open('../emails/' + mail + '.html', '_blank')}>Open {mail}.html</Button>
        </div>
      </div>
    </Panel>
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
});
