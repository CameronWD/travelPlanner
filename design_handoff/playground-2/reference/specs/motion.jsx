TeepeeDS.ready.then(() => {
const { Logo, Button, Chip, Badge, Card, ProgressBar, Toggle, Segmented, TabBar, Toast, Input } = TeepeeDS;
const EASES = { '--ease-pop': [.2, .8, .2, 1], '--ease-bounce': [.34, 1.56, .64, 1], '--ease-exit': [.4, 0, 1, 1] };
const Curve = ({ name }) => { const [a, b, c, d] = EASES[name]; const Y = v => 70 - v * 50; return <svg width="96" height="80" viewBox="0 0 96 80" aria-label={name + ' curve'}><rect x="8" y="10" width="80" height="60" fill="none" stroke="var(--outline-soft)" strokeDasharray="3 3" /><path d={`M8 ${Y(0)} C ${8 + a * 80} ${Y(b)} ${8 + c * 80} ${Y(d)} 88 ${Y(1)}`} fill="none" stroke="var(--text-primary)" strokeWidth="3" strokeLinecap="round" /></svg>; };
const Tag = ({ children }) => <code style={{ padding: '2px 7px', border: '1px solid var(--outline-soft)', borderRadius: 6, color: 'var(--text-body)', background: 'var(--surface-card)' }}>{children}</code>;
const Stage = ({ children, h = 180 }) => <div style={{ position: 'relative', height: h, border: 'var(--border)', borderRadius: 'var(--radius-l)', background: 'var(--surface-canvas)', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>{children}</div>;
function Demo({ title, when, spec, children, replay }) {
  return <section style={{ background: 'var(--surface-page)', border: 'var(--border)', borderRadius: 'var(--radius-xl)', padding: 22, boxShadow: 'var(--shadow-2)', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}><div><h3 style={{ margin: 0, font: 'var(--type-h3)', letterSpacing: 'var(--tracking-display)' }}>{title}</h3><div style={{ font: 'var(--type-body-s)', color: 'var(--text-body)', marginTop: 4, textWrap: 'pretty' }}>{when}</div></div>{replay && <Button size="s" variant="secondary" onClick={replay}>Replay</Button>}</div>
    {children}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{spec.map(s => <Tag key={s}>{s}</Tag>)}</div>
  </section>;
}
function SheetDemo() {
  const [st, setSt] = React.useState('closed');
  const open = () => setSt('open'); const close = () => { setSt('closing'); setTimeout(() => setSt('closed'), 200); };
  return <><Stage h={240}>
    <Button onClick={open}>Open sheet</Button>
    {st !== 'closed' && <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(29,29,27,.35)', animation: st === 'closing' ? 'tp-scrim-in var(--dur-exit) var(--ease-exit) reverse forwards' : 'tp-scrim-in var(--dur-base) linear' }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, background: 'var(--surface-page)', border: 'var(--border)', borderBottom: 0, borderRadius: '28px 28px 0 0', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, animation: st === 'closing' ? 'tp-sheet-out var(--dur-exit) var(--ease-exit) forwards' : 'tp-sheet-in var(--dur-slow) var(--ease-pop)' }}>
        <span style={{ width: 44, height: 5, borderRadius: 3, background: 'var(--outline)', alignSelf: 'center' }}></span><div style={{ font: 'var(--type-h4)' }}>Add a place</div><Button block onClick={close}>Add it</Button>
      </div></div>}
  </Stage></>;
}
function ToastDemo() {
  const [k, setK] = React.useState(0); const [out, setOut] = React.useState(false);
  React.useEffect(() => { setOut(false); const t = setTimeout(() => setOut(true), 2200); return () => clearTimeout(t); }, [k]);
  return [<Stage key="s" h={140}><div key={k} style={{ animation: out ? 'tp-toast-out var(--dur-exit) var(--ease-exit) forwards' : 'tp-toast-in var(--dur-slow) var(--ease-bounce)' }}><Toast action="Undo" style={{ animation: 'none' }}>Hakone added · 1 night</Toast></div></Stage>, () => setK(k + 1)];
}
function ListDemo() {
  const [k, setK] = React.useState(0);
  return [<Stage key="s" h={200}><div key={k} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 110px)', gap: 10 }}>{['Tokyo', 'Hakone', 'Kyoto', 'Osaka', 'Nara', 'Naoshima'].map((n, i) => <div key={n} style={{ animation: `tp-rise-in var(--dur-slow) var(--ease-pop) calc(${i} * var(--stagger)) both` }}><Card tone={['teal', 'coral', 'lilac', 'sun', 'white', 'teal'][i]} padding={12}><div style={{ font: 'var(--type-h5)' }}>{n}</div></Card></div>)}</div></Stage>, () => setK(k + 1)];
}
function App() {
  const [theme, setTheme] = React.useState(localStorage.getItem('tp-spec-theme') || 'light');
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('tp-spec-theme', theme); }, [theme]);
  const [tab, setTab] = React.useState('plan'); const [tog, setTog] = React.useState(false); const [pct, setPct] = React.useState(30); const [count, setCount] = React.useState(2); const [bad, setBad] = React.useState(0); const [seg, setSeg] = React.useState('Month');
  const [toastEl, toastReplay] = ToastDemo(); const [listEl, listReplay] = ListDemo();
  const rm = reduced ? { '--dur-fast': '1ms', '--dur-base': '1ms', '--dur-slow': '1ms', '--dur-exit': '1ms', '--stagger': '0ms', '--ease-bounce': 'linear' } : {};
  return <div style={{ maxWidth: 1180, margin: '0 auto', padding: 28, display: 'flex', flexDirection: 'column', gap: 22, ...rm }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}><Logo size={24} /><h1 style={{ margin: 0, font: 'var(--type-h2)', flex: 1 }}>Motion spec</h1><Toggle checked={reduced} onChange={setReduced} label="Simulate reduced motion" /><Segmented tone="ink" value={theme} onChange={setTheme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></div>
    <div style={{ background: 'var(--surface-inverse)', color: 'var(--text-inverse)', borderRadius: 'var(--radius-xl)', padding: '24px 28px', display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 24 }}>
      <div><div style={{ font: 'var(--type-display-l)', fontSize: 44, letterSpacing: 'var(--tracking-display)', lineHeight: 1 }}>Quick, springy, never floaty.</div><p style={{ margin: '12px 0 0', textWrap: 'pretty' }}>Things push and pop like cardboard stickers. Everything responds in under 120ms, nothing takes longer than 320ms, and exits are faster than entrances. Only transform and opacity animate, never layout. With reduced motion on, durations drop to 1ms and nothing slides; state changes stay visible through colour and shadow.</p></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: '6px 14px', font: 'var(--type-body-s)', alignContent: 'start' }}>
        {[['--dur-fast', '120ms', 'press, hover, chips, colour'], ['--dur-base', '180ms', 'tabs, toggles, scrims'], ['--dur-slow', '320ms', 'sheets, toasts, fills, lists'], ['--dur-exit', '200ms', 'anything leaving'], ['--stagger', '40ms', 'per list item, max 6']].map(([t, v, u]) => <React.Fragment key={t}><code style={{ color: 'inherit', fontWeight: 700 }}>{t} · {v}</code><span>{u}</span></React.Fragment>)}
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16 }}>
      {Object.keys(EASES).map(n => <div key={n} style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--surface-page)', border: 'var(--border)', borderRadius: 'var(--radius-l)', padding: 12 }}><Curve name={n} /><div><code style={{ fontWeight: 700 }}>{n}</code><div style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', marginTop: 4 }}>{{ '--ease-pop': 'default enter. Fast out, soft landing', '--ease-bounce': 'playful overshoot for toggles, tabs, toasts', '--ease-exit': 'accelerates away for dismissals' }[n]}</div><code style={{ color: 'var(--text-muted)' }}>cubic-bezier({EASES[n].join(', ')})</code></div></div>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16 }}>
      <Demo title="Press" when="Anything with a hard shadow. It pushes into the page, like pressing a sticker." spec={['pointerdown', 'translate(2px,2px)', 'shadow → 1px', '--dur-fast', '--ease-pop']}><Stage h={120}><div style={{ display: 'flex', gap: 12 }}><Button>Press me</Button><Button variant="secondary">Or me</Button></div></Stage></Demo>
      <Demo title="Hover" when="Mouse only (pointerType mouse). Lifts toward you. Never on touch." spec={['translate(-1px,-1px)', 'shadow +1 step', '--dur-fast', '@media (hover:hover)']}><Stage h={120}><div style={{ display: 'flex', gap: 12 }}><Button>Hover me</Button><Button variant="secondary">Me too</Button></div></Stage></Demo>
      <Demo title="Sheet" when="Rises from the bottom edge on mobile. Scrim fades separately. Swipe down or tap the scrim to close." spec={['enter: translateY(100%) → 0', '--dur-slow', '--ease-pop', 'exit: --dur-exit', '--ease-exit', 'scrim --dur-base']}><SheetDemo /></Demo>
      <Demo title="Toast" when="Pops up with a small overshoot, stays ≥ 5s (pauses on hover/focus), then drops away." spec={['enter: y 24 → 0, scale .9 → 1', '--dur-slow', '--ease-bounce', 'exit: --dur-exit', 'role=status']} replay={toastReplay}>{toastEl}</Demo>
      <Demo title="Tab move" when="The active pill slides to the new tab and the label colour swaps. Same for Segmented." spec={['indicator translateX', '--dur-base', '--ease-bounce', 'label colour --dur-fast']}><Stage h={150}><div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 14 }}><div style={{ border: 'var(--border)', borderRadius: 'var(--radius-l)', overflow: 'hidden' }}><TabBar items={[{ key: 'home', label: 'Home' }, { key: 'plan', label: 'Plan' }, { key: 'days', label: 'Days' }, { key: 'money', label: 'Money' }]} value={tab} onChange={setTab} style={{ padding: 10 }} /></div><Segmented options={['Month', 'Week']} value={seg} onChange={setSeg} tone="sun" /></div></Stage></Demo>
      <Demo title="Toggle" when="The knob bounces across. The track colour follows at the same speed." spec={['knob left 2 → 24', '--dur-base', '--ease-bounce']}><Stage h={120}><Toggle checked={tog} onChange={setTog} label={tog ? 'Split costs: on' : 'Split costs: off'} /></Stage></Demo>
      <Demo title="List enter" when="First load of a page, or new results. Items rise 10px in sequence. Not on every re-render." spec={['rise-in y 10 → 0', '--dur-slow', '--ease-pop', 'delay i × --stagger', 'cap 6 items']} replay={listReplay}>{listEl}</Demo>
      <Demo title="Fill and count" when="Budget bars and jars fill when the value changes. Badges pop when the count changes." spec={['width/height', '--dur-slow', '--ease-pop', 'badge: tp-pop --dur-base']}><Stage h={140}><div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 14 }}><ProgressBar value={pct} height={14} label="Paid" /><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Button size="s" variant="secondary" onClick={() => { setPct(p => p >= 90 ? 20 : p + 25); setCount(c => c + 1); }}>+ Add cost</Button><span key={count} style={{ display: 'inline-flex', animation: 'tp-pop var(--dur-base) var(--ease-bounce)' }}><Badge count={count} /></span></div></div></Stage></Demo>
      <Demo title="Nope" when="Invalid submit. The field shakes once and the hint explains why. Reduced motion: no shake, the hint alone carries it." spec={['tp-wiggle 4px', '--dur-base × 1', 'aria-invalid + hint']}><Stage h={140}><div style={{ width: 300, display: 'flex', gap: 10, alignItems: 'flex-end' }}><div key={bad} style={{ flex: 1, animation: bad ? 'tp-wiggle var(--dur-base) var(--ease-pop)' : 'none' }}><Input label="Date" value="31 Feb" hint={bad ? '⚠ That date doesn\u2019t exist' : ' '} aria-invalid={bad ? 'true' : undefined} /></div><Button size="s" onClick={() => setBad(bad + 1)} style={{ marginBottom: 22 }}>Save</Button></div></Stage></Demo>
    </div>
    <section style={{ background: 'var(--surface-page)', border: 'var(--border)', borderRadius: 'var(--radius-xl)', padding: 22 }}>
      <h3 style={{ margin: '0 0 10px', font: 'var(--type-h3)' }}>Rules</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '6px 24px', font: 'var(--type-body-s)', color: 'var(--text-body)' }}>
        {['Animate transform and opacity only. Heights and widths snap, except progress fills.', 'Exits are faster than entrances (200ms vs 320ms), using --ease-exit.', 'Page transitions: none. Next.js route changes swap content instantly, with list enter on first paint only.', 'Keyframes live in tokens/motion.css (tp-*). In Tailwind: animate-sheet-in, animate-toast-in, etc.', 'shadcn Dialog/Drawer: map data-[state=open] → tp-sheet-in and data-[state=closed] → tp-sheet-out.', 'Reduced motion: tokens drop to 1ms in a11y.css. Never put meaning in motion alone.', 'No looping animation except loading skeletons, which stop under reduced motion.', 'Haptics (PWA): navigator.vibrate(8) on press-and-hold actions only, and never on tap.'].map(r => <div key={r}>• {r}</div>)}
      </div>
    </section>
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
});
