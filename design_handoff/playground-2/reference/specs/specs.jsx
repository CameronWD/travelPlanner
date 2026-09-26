TeepeeDS.ready.then(() => {
const DS = TeepeeDS;
const { Logo, Icon, Button, IconButton, Chip, Badge, Card, ProgressBar, StatCard, Avatar, AvatarStack, Input, Select, Stepper, Toggle, Checkbox, Segmented, TabBar, Dock, TopBar, ListRow, Sheet, Toast, Tooltip, EmptyState } = DS;

const HOVER = { transform: 'translate(-1px,-1px)', boxShadow: 'var(--shadow-2)' };
const PRESS = { transform: 'translate(2px,2px)', boxShadow: 'var(--shadow-pressed)' };
const FOCUS = { outline: 'var(--focus-ring-width) solid var(--focus-ring)', outlineOffset: 'var(--focus-ring-offset)' };
const tabs = [{ key: 'home', label: 'Home' }, { key: 'plan', label: 'Plan' }, { key: 'days', label: 'Days' }, { key: 'money', label: 'Money' }];
const crew = [{ initials: 'CW', tone: 'coral' }, { initials: 'JM', tone: 'sun' }, { initials: 'AL', tone: 'lilac' }, { initials: 'RK', tone: 'teal' }, { initials: 'SB', tone: 'coral' }];
const S = (label, el, note) => ({ label, el, note });
const Live = ({ C, init, ...p }) => { const [v, setV] = React.useState(init); return <C {...p} value={v} checked={v} onChange={setV} />; };
const FocusedInput = () => <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 200 }}><span style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase' }}>Where to?</span><span style={{ display: 'flex', alignItems: 'center', height: 48, padding: '0 16px', background: 'var(--surface-card)', border: '2px solid var(--outline)', borderRadius: 'var(--radius-m)', boxShadow: 'var(--shadow-2)', transform: 'translate(-2px,-2px)', outline: 'var(--focus-ring-width) solid var(--focus-ring)', outlineOffset: 3, font: 'var(--type-body-l)', fontSize: 15 }}>Hako<span style={{ width: 2, height: 20, background: 'var(--text-primary)', marginLeft: 1 }}></span></span></label>;
const SheetDemo = () => <div style={{ position: 'relative', width: 300, height: 250, border: 'var(--border)', borderRadius: 'var(--radius-l)', overflow: 'hidden', background: 'var(--surface-canvas)' }}><Sheet open title="Add a place" onClose={() => {}} footer={<Button block>Add Hakone</Button>}><Input placeholder="Where?" /></Sheet></div>;

/* State matrices: each row = one variant, each cell = one state */
const SPECS = {
  Button: { group: 'core', rows: ['primary', 'secondary', 'accent', 'ghost', 'dashed'].map(v => ({ label: v, cells: [
    S('default', <Button variant={v}>Add a stop</Button>),
    S('hover', <Button variant={v} style={v === 'ghost' ? { background: 'var(--surface-canvas)' } : v === 'dashed' ? { color: 'var(--text-primary)', borderColor: 'var(--outline)' } : { ...HOVER, boxShadow: v === 'primary' ? '5px 5px 0 var(--pg-coral)' : 'var(--shadow-2)' }}>Add a stop</Button>),
    S('pressed', <Button variant={v} style={v === 'ghost' || v === 'dashed' ? { transform: 'translate(2px,2px)' } : PRESS}>Add a stop</Button>),
    S('focus', <Button variant={v} style={FOCUS}>Add a stop</Button>),
    S('disabled', <Button variant={v} disabled>Add a stop</Button>),
  ] })).concat([{ label: 'sizes', cells: [S('s · 36', <Button size="s">Small</Button>), S('m · 44', <Button>Medium</Button>), S('l · 52', <Button size="l">Large</Button>), S('leading', <Button variant="secondary" leading={<Icon name="plus" size={16} />}>With icon</Button>)] }]),
    a11y: ['Native <button>. One primary per screen.', 'Disabled uses the disabled attribute (skipped by Tab); explain why nearby.', 'Press = physical push: translate(2,2) + 1px shadow. Hover only on mouse pointers.'] },
  IconButton: { group: 'core', rows: ['card', 'ink', 'accent', 'ghost'].map(t => ({ label: t, cells: [
    S('default', <IconButton tone={t} label="Share"><Icon name="share" size={20} /></IconButton>),
    S('hover', <IconButton tone={t} label="Share" style={t === 'ghost' ? { background: 'var(--surface-canvas)' } : HOVER}><Icon name="share" size={20} /></IconButton>),
    S('pressed', <IconButton tone={t} label="Share" style={t === 'ghost' ? {} : PRESS}><Icon name="share" size={20} /></IconButton>),
    S('focus', <IconButton tone={t} label="Share" style={FOCUS}><Icon name="share" size={20} /></IconButton>),
    S('small · 36', <IconButton tone={t} size={36} label="Share"><Icon name="share" size={16} /></IconButton>),
  ] })), a11y: ['label is required. It becomes aria-label and the tooltip title.', '44px default. 36px only inside dense toolbars with ≥ 8px spacing.'] },
  Chip: { group: 'core', rows: [
    { label: 'tones', cells: ['white', 'coral', 'sun', 'teal', 'lilac', 'ink'].map(t => S(t, <Chip tone={t}>Kyoto</Chip>)) },
    { label: 'states', cells: [S('static', <Chip>4 nights</Chip>), S('clickable', <Chip onClick={() => {}}>Food</Chip>), S('selected', <Chip tone="coral" selected onClick={() => {}}>Food</Chip>), S('focus', <Chip onClick={() => {}} style={FOCUS}>Food</Chip>), S('dashed', <Chip dashed onClick={() => {}}>+ Add</Chip>)] },
    { label: 'sizes', cells: [S('s', <Chip size="s">♥ 3</Chip>), S('m', <Chip>Tokyo</Chip>), S('l', <Chip size="l">free for 6</Chip>), S('uppercase', <Chip size="s" uppercase tone="sun">Planning</Chip>)] },
  ], a11y: ['With onClick: role="button", Tab stop, Enter/Space, aria-pressed = selected.', 'Clickable chips are ≥ 28px tall. Keep ≥ 8px between them.', 'Static chips are plain text. Never put onClick on a chip inside a clickable Card.'] },
  Badge: { group: 'core', rows: [{ label: 'tones', cells: ['coral', 'sun', 'teal', 'lilac', 'ink'].map(t => S(t, <Badge tone={t} count={3} />)) }, { label: 'content', cells: [S('1 digit', <Badge count={4} />), S('2 digits', <Badge count={12} />), S('overflow', <Badge count="9+" />), S('size 18', <Badge count={2} size={18} />)] }],
    a11y: ['Decorative count. Put the meaning in the parent\u2019s accessible name, e.g. "Days, 3 unplanned".'] },
  Card: { group: 'core', rows: [
    { label: 'tones', cells: ['white', 'paper', 'coral', 'sun', 'teal', 'lilac', 'ink'].map(t => S(t, <Card tone={t} style={{ width: 110 }}><div style={{ font: 'var(--type-h5)' }}>Kyoto</div><div style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>4 nights</div></Card>)) },
    { label: 'states', cells: [S('static', <Card style={{ width: 130 }}>Static</Card>), S('clickable', <Card onClick={() => {}} style={{ width: 130 }}>Clickable</Card>), S('hover', <Card onClick={() => {}} style={{ width: 130, ...HOVER, boxShadow: 'var(--shadow-3)' }}>Hover</Card>), S('pressed', <Card onClick={() => {}} style={{ width: 130, ...PRESS }}>Pressed</Card>), S('focus', <Card onClick={() => {}} style={{ width: 130, ...FOCUS }}>Focus</Card>), S('dashed', <Card dashed style={{ width: 130, color: 'var(--text-muted)' }}>+ Add</Card>)] },
    { label: 'shadow', cells: [0, 1, 2, 3, 4, 5].map(s => S('shadow ' + s, <Card shadow={s} style={{ width: 70, height: 50 }} />)) },
    { label: 'sticker', cells: [S('sticker', <Card sticker={<Chip size="s" tone="coral" uppercase>Now</Chip>} style={{ width: 150, marginTop: 10 }}>Kyoto · day 2</Card>)] },
  ], a11y: ['Accent tones (coral, sun, teal, lilac) re-scope text, outline and surface tokens, so children stay ≥ 4.5:1 in both themes.', 'With onClick: role="button" + Enter/Space. Don\u2019t nest other buttons inside a clickable card.', 'Hover (mouse): lift 1px, shadow +1 step. Press: push 2px, 1px shadow.'] },
  ProgressBar: { group: 'core', rows: [{ label: 'values', cells: [0, 25, 59, 100].map(v => S(v + '%', <ProgressBar value={v} label="Paid" style={{ width: 140 }} />)) }, { label: 'fills', cells: ['var(--surface-inverse)', 'var(--accent-primary)', 'var(--accent-route)'].map((f, i) => S(['ink', 'coral', 'teal'][i], <ProgressBar value={60} fill={f} style={{ width: 140 }} />)).concat([S('on sun card', <Card tone="sun" style={{ width: 160 }}><ProgressBar value={60} /></Card>)]) }],
    a11y: ['role="progressbar" with aria-valuenow. Pass label, or it must sit next to visible text.', 'Always pair with a number ("59% locked in"). The bar alone is not enough.'] },
  StatCard: { group: 'core', rows: [{ label: 'tones', cells: ['sun', 'teal', 'lilac', 'coral', 'white'].map(t => S(t, <StatCard tone={t} label="Spent" value="¥184k" progress={59} sub="of ¥312k est" style={{ width: 150 }} />)) }, { label: 'variants', cells: [S('no progress', <StatCard label="Beds" value="3 of 4" style={{ width: 150 }} />), S('big', <StatCard big label="Days to go" value="19" style={{ width: 200 }} />)] }],
    a11y: ['Label comes before the value in DOM order, so it reads "Spent, ¥184k, of ¥312k est".'] },
  Avatar: { group: 'core', rows: [{ label: 'tones', cells: ['coral', 'sun', 'teal', 'lilac', 'ink'].map(t => S(t, <Avatar tone={t} initials="CW" />)) }, { label: 'sizes', cells: [24, 30, 40, 56].map(s => S(s + 'px', <Avatar initials="JM" tone="sun" size={s} />)).concat([S('square', <Avatar square initials="AL" tone="lilac" size={40} />)]) }],
    a11y: ['Initials are decorative. Put the person\u2019s name in adjacent text or aria-label on the parent.'] },
  AvatarStack: { group: 'core', rows: [{ label: 'counts', cells: [S('2', <AvatarStack people={crew.slice(0, 2)} />), S('4', <AvatarStack people={crew.slice(0, 4)} />), S('overflow', <AvatarStack people={crew} max={3} />), S('size 40', <AvatarStack people={crew.slice(0, 3)} size={40} />)] }],
    a11y: ['Wrap in an element with aria-label="Cameron, Jess and 3 others".'] },
  Logo: { group: 'core', rows: [{ label: 'variants', cells: [S('lockup', <Logo />), S('mark', <Logo variant="mark" size={40} />), S('wordmark', <Logo variant="wordmark" size={28} />)] }],
    a11y: ['In a link: aria-label="Teepee home". The mark alone is aria-hidden.', 'Dark backgrounds: sticker mark (A) at ≥ 24px, sun tile (D) below. See Brand.'] },
  Icon: { group: 'core', rows: [{ label: 'sizes', cells: [16, 20, 24, 32].map(s => S(s + 'px', <Icon name="map-pin" size={s} />)) }, { label: 'stroke', cells: [1.5, 2, 2.5].map(w => S(String(w), <Icon name="calendar" size={28} strokeWidth={w} />)) }],
    a11y: ['aria-hidden by default. Icon-only buttons put the name on the button (IconButton label).'] },
  Input: { group: 'forms', rows: [{ label: 'states', cells: [
    S('empty', <Input label="Where to?" placeholder="Somewhere warm?" style={{ width: 200 }} />),
    S('filled', <Input label="Where to?" value="Hakone" style={{ width: 200 }} />),
    S('focus', <FocusedInput />, 'lift + ring'),
    S('hint', <Input label="Budget" value="¥312,000" hint="Shared pot · ≈ A$3,120" style={{ width: 200 }} />),
    S('error', <Input label="Date" value="31 Feb" hint="⚠ That date doesn\u2019t exist" style={{ width: 200 }} aria-invalid="true" />, 'error via hint + aria-invalid'),
    S('disabled', <Input label="Currency" value="JPY" disabled style={{ width: 200, opacity: .45 }} />),
  ] }, { label: 'sizes', cells: [S('m · 48', <Input placeholder="Search stops" leading={<Icon name="search" size={18} />} style={{ width: 220 }} />), S('l · 56', <Input size="l" placeholder="Trip name" style={{ width: 220 }} />)] }],
    a11y: ['Visible label always. Placeholder is a prompt, not the label.', 'Pass id so the hint is linked via aria-describedby. Errors: aria-invalid + hint starting with ⚠.', 'Border uses --outline-control (≥ 3:1 in dark).'] },
  Select: { group: 'forms', rows: [{ label: 'sizes', cells: [S('m', <Select label="Currency" value="JPY" options={['JPY', 'AUD']} style={{ width: 160 }} />), S('s (pill)', <Select size="s" value="Real plan" options={['Real plan', 'Plan B']} />), S('focus', <Select size="s" value="JPY" options={['JPY']} style={FOCUS} />)] }],
    a11y: ['Native <select>, so the OS picker handles keyboard, screen readers and mobile.'] },
  Stepper: { group: 'forms', rows: [{ label: 'states', cells: [S('default', <Live C={Stepper} init={2} unit="nights" />), S('at min', <Stepper value={0} min={0} />), S('at max', <Stepper value={6} max={6} unit="ppl" />)] }],
    a11y: ['Buttons are labelled Decrease/Increase and disable at the limits. The value is announced (aria-live).'] },
  Toggle: { group: 'forms', rows: [{ label: 'states', cells: [S('off', <Toggle checked={false} label="Share costs" />), S('on', <Toggle checked label="Share costs" />), S('live', <Live C={Toggle} init={true} label="Try me" />)] }],
    a11y: ['role="switch", Space/Enter toggles. Use for settings that apply immediately.'] },
  Checkbox: { group: 'forms', rows: [{ label: 'states', cells: [S('unchecked', <Checkbox checked={false} label="Book JR pass" />), S('checked', <Checkbox checked label="Book JR pass" />), S('live', <Live C={Checkbox} init={false} label="Pack adapters" />)] }],
    a11y: ['role="checkbox". The checked label gets strikethrough plus muted colour, and the ✓ is aria-hidden.'] },
  Segmented: { group: 'forms', rows: [{ label: 'tones', cells: ['coral', 'teal', 'ink'].map(t => S(t, <Segmented tone={t} value="Map" options={['List', 'Map']} />)).concat([S('live', <Live C={Segmented} init="Day" options={['Day', 'Week', 'Trip']} />)]) }],
    a11y: ['role="radiogroup" / radio + aria-checked. 2 to 4 options, short labels.'] },
  TabBar: { group: 'navigation', rows: [{ label: 'tones', cells: ['coral', 'teal'].map(t => S(t, <div style={{ width: 320, border: 'var(--border)', borderRadius: 'var(--radius-l)', overflow: 'hidden' }}><TabBar tone={t} items={tabs} value="plan" style={{ padding: 10 }} /></div>)) }],
    a11y: ['Mobile only (< 768px). 4 or 5 items max. Active tab has aria-current="page" (add in app).', 'Inactive labels use text-muted (≥ 5.5:1).'] },
  Dock: { group: 'navigation', rows: [{ label: 'default', cells: [S('desktop rail', <div style={{ height: 300, border: 'var(--border)', borderRadius: 'var(--radius-l)', overflow: 'hidden', display: 'flex' }}><Dock items={tabs} value="days" people={crew.slice(0, 2)} /></div>)] }],
    a11y: ['Desktop (≥ 1024px). A <nav> landmark with aria-label="Trip".'] },
  TopBar: { group: 'navigation', rows: [{ label: 'sizes', cells: [S('l', <div style={{ width: 320, background: 'var(--surface-page)', paddingBottom: 12, border: 'var(--border)', borderRadius: 'var(--radius-l)' }}><TopBar title="Japan in Autumn" leading={<IconButton tone="ghost" label="Back">‹</IconButton>} trailing={<Chip size="s">12 nights</Chip>} /></div>), S('m', <div style={{ width: 320, background: 'var(--surface-page)', paddingBottom: 12, border: 'var(--border)', borderRadius: 'var(--radius-l)' }}><TopBar size="m" title="Stop detail" leading={<IconButton tone="ghost" label="Back">‹</IconButton>} /></div>)] }],
    a11y: ['Title is the page <h1>. Long titles truncate with ellipsis, so keep the full name in document.title.'] },
  ListRow: { group: 'navigation', rows: [{ label: 'variants', cells: [S('tile + sub', <Card style={{ width: 260 }}><ListRow tile="Zz" title="Hakone needs a bed" sub="1 night · Oct 17" /></Card>), S('clickable', <Card style={{ width: 260 }}><ListRow tile="→" tileTone="sun" title="Kyoto → Osaka" sub="no transport yet" onClick={() => {}} /></Card>), S('focus', <Card style={{ width: 260 }}><ListRow tile="→" tileTone="sun" title="Kyoto → Osaka" onClick={() => {}} style={FOCUS} /></Card>)] }],
    a11y: ['44px min height. The trailing arrow is aria-hidden. With onClick: role="button".'] },
  Sheet: { group: 'feedback', rows: [{ label: 'mobile', cells: [S('open', <SheetDemo />)] }],
    a11y: ['role="dialog" aria-modal. Focus moves in, Esc closes, focus returns to the trigger.', 'Close is 44px with aria-label="Close". Desktop renders centred (desktop prop).', 'In Next.js, build on shadcn Dialog/Drawer (Radix) for the focus trap.'] },
  Toast: { group: 'feedback', rows: [{ label: 'tones', cells: ['teal', 'coral', 'sun', 'lilac', 'ink'].map(t => S(t, <Toast tone={t}>Saved</Toast>)) }, { label: 'action', cells: [S('with undo', <Toast action="Undo">Hakone added · 1 night</Toast>)] }],
    a11y: ['role="status" (polite). Auto-dismiss ≥ 5s, and pause on hover/focus.', 'Undo must also be reachable another way (e.g. in the list).'] },
  Tooltip: { group: 'feedback', rows: [{ label: 'sides', cells: ['top', 'right', 'bottom', 'left'].map(s => S(s, <div style={{ padding: 30 }}><Tooltip side={s} label="Share trip"><IconButton label="Share"><Icon name="share" size={18} /></IconButton></Tooltip></div>, 'hover to show')) }],
    a11y: ['Supplementary only. Never the sole label. Needs a focus trigger too (add onFocus/onBlur in app).'] },
  EmptyState: { group: 'feedback', rows: [{ label: 'tones', cells: [['sun', '¥', 'No costs yet'], ['lilac', 'Zz', 'No beds yet'], ['teal', '→', 'No route yet']].map(([t, g, h]) => S(t, <EmptyState tone={t} glyph={g} title={h} body="Add the first one and we\u2019ll do the maths." action="+ Add" style={{ width: 240 }} />)) }],
    a11y: ['Title is a heading in the page outline. One clear action.'] },
};
const ORDER = { core: ['Button', 'IconButton', 'Chip', 'Badge', 'Card', 'StatCard', 'ProgressBar', 'Avatar', 'AvatarStack', 'Logo', 'Icon'], forms: ['Input', 'Select', 'Stepper', 'Toggle', 'Checkbox', 'Segmented'], navigation: ['TabBar', 'Dock', 'TopBar', 'ListRow'], feedback: ['Sheet', 'Toast', 'Tooltip', 'EmptyState'] };

function useMeta(name, group) {
  const [m, setM] = React.useState(null);
  React.useEffect(() => { Promise.all(['.d.ts', '.jsx', '.prompt.md'].map(x => fetch(`../components/${group}/${name}${x}`).then(r => r.ok ? r.text() : ''))).then(([dts, jsx, md]) => {
    const desc = (dts.match(/^\/\*\*\s*([\s\S]*?)\s*\*\//) || [])[1] || '';
    const props = [...dts.matchAll(/\/\*\*\s*([\s\S]*?)\s*\*\/\s*\n\s*(\w+)(\??):\s*([^;]+);/g)].map(x => ({ doc: x[1], name: x[2], opt: !!x[3], type: x[4].trim() })).filter(p => !/^[A-Z]/.test(p.name));
    const tokens = [...new Set([...jsx.matchAll(/var\((--[\w-]+)/g)].map(x => x[1]))].sort();
    const hooks = /React\.use(State|Effect|Ref)/.test(jsx);
    const inline = /on[A-Z]\w*=\{\s*(\(|e\s*=>|\w+\s*=>|function)/.test(jsx);
    const pass = /on[A-Z]\w*=\{\s*on[A-Z]\w*\s*\}/.test(jsx) || /\b(Button|IconButton)\b[^\n]*from/.test(jsx);
    const rsc = hooks || inline ? 'client' : pass ? 'shared' : 'server';
    const usage = md.split('```')[2] ? md.split('```')[2].trim() : '';
    setM({ desc, props, tokens, rsc, usage });
  }); }, [name]);
  return m;
}
const RSC = { client: ['"use client"', 'Uses state/effects. Import from Client Components, or render from a Server Component with serialisable props only.', 'var(--accent-primary)'], shared: ['Server-safe', 'No hooks. Renders in a Server Component. Passing onClick makes the caller a Client Component.', 'var(--accent-route)'], server: ['Server Component', 'Pure markup. Keep it server-side.', 'var(--accent-route)'] };

function Spec({ name, group }) {
  const spec = SPECS[name]; const m = useMeta(name, group);
  return <section id={name} style={{ background: 'var(--surface-page)', border: 'var(--border)', borderRadius: 'var(--radius-xl)', padding: 28, boxShadow: 'var(--shadow-2)', display: 'flex', flexDirection: 'column', gap: 22 }}>
    <header style={{ display: 'flex', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0, maxWidth: 640 }}><div style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{group}</div><h2 style={{ margin: '4px 0 0', font: 'var(--type-h1)', letterSpacing: 'var(--tracking-display)' }}>{name}</h2><p style={{ margin: '8px 0 0', color: 'var(--text-body)', textWrap: 'pretty' }}>{m && m.desc}</p></div>
      {m && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', maxWidth: 300 }}><Chip tone={m.rsc === 'client' ? 'coral' : 'teal'}>{RSC[m.rsc][0]}</Chip><div style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', textAlign: 'right' }}>{RSC[m.rsc][1]}</div><code style={{ color: 'var(--text-muted)' }}>components/{group}/{name}.jsx</code></div>}
    </header>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {spec.rows.map(r => <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
        <div style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)', paddingTop: 6 }}>{r.label}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>{r.cells.map((c, i) => <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}><div style={{ minHeight: 36, display: 'flex', alignItems: 'center' }}>{c.el}</div><div style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{c.label}{c.note ? ' · ' + c.note : ''}</div></div>)}</div>
      </div>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
      <div><h3 style={{ margin: '0 0 8px', font: 'var(--type-h5)' }}>Props</h3>
        <div style={{ border: 'var(--border)', borderRadius: 'var(--radius-m)', overflow: 'hidden', background: 'var(--surface-card)' }}>{m && m.props.map((p, i) => <div key={p.name} style={{ padding: '8px 12px', borderTop: i ? '1px solid var(--outline-soft)' : 0, display: 'flex', flexDirection: 'column', gap: 2 }}><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}><code style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}{p.opt ? '?' : ''}</code><code style={{ color: 'var(--accent-stay-text)', overflowWrap: 'anywhere' }}>{p.type}</code></div><div style={{ font: 'var(--type-caption)', color: 'var(--text-body)' }}>{p.doc}</div></div>)}</div></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><h3 style={{ margin: '0 0 8px', font: 'var(--type-h5)' }}>Accessibility</h3><ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--text-body)', font: 'var(--type-body-s)' }}>{spec.a11y.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
        {m && m.usage && <div><h3 style={{ margin: '0 0 8px', font: 'var(--type-h5)' }}>Usage</h3><p style={{ margin: 0, color: 'var(--text-body)', font: 'var(--type-body-s)', textWrap: 'pretty' }}>{m.usage}</p></div>}
        <div><h3 style={{ margin: '0 0 8px', font: 'var(--type-h5)' }}>Tokens</h3><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{m && m.tokens.map(t => <code key={t} style={{ padding: '2px 6px', border: '1px solid var(--outline-soft)', borderRadius: 6, color: 'var(--text-body)' }}>{t}</code>)}</div></div>
      </div>
    </div>
  </section>;
}

function App() {
  const [theme, setTheme] = React.useState(localStorage.getItem('tp-spec-theme') || 'light');
  React.useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('tp-spec-theme', theme); }, [theme]);
  const go = n => { const el = document.getElementById(n); if (el) window.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' }); };
  return <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', minHeight: '100vh' }}>
    <nav aria-label="Components" style={{ position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', padding: '24px 18px', borderRight: 'var(--border)', background: 'var(--surface-page)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Logo size={24} />
      <div style={{ font: 'var(--type-h4)' }}>Component specs</div>
      <Segmented tone="ink" value={theme} onChange={setTheme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      {Object.entries(ORDER).map(([g, list]) => <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><div style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{g}</div>{list.map(n => <a key={n} href={'#' + n} onClick={e => { e.preventDefault(); go(n); }} style={{ padding: '5px 8px', borderRadius: 8, textDecoration: 'none', font: 'var(--type-body-s)', fontWeight: 600 }}>{n}</a>)}</div>)}
    </nav>
    <main style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1180 }}>
      <div style={{ background: 'var(--surface-inverse)', color: 'var(--text-inverse)', borderRadius: 'var(--radius-xl)', padding: '24px 28px' }}>
        <h1 style={{ margin: 0, font: 'var(--type-display-l)', fontSize: 44, letterSpacing: 'var(--tracking-display)' }}>25 components, every state.</h1>
        <p style={{ margin: '10px 0 0', maxWidth: 680, textWrap: 'pretty' }}>Props, tokens and the server/client split are read live from each component's source, so this page can't drift from the code. State rules: <b>hover</b> lifts 1px and the shadow grows one step (mouse only). <b>Pressed</b> pushes 2px and the shadow drops to 1px. <b>Focus</b> is a 3px ink ring with a 3px gap (keyboard only). <b>Disabled</b> is 45% opacity with no shadow motion.</p>
      </div>
      {Object.entries(ORDER).flatMap(([g, list]) => list.map(n => <Spec key={n} name={n} group={g} />))}
    </main>
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
});
