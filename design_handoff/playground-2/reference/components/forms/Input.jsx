import React from 'react';

export function Input({ label, hint, value, onChange, placeholder, size = 'm', leading, trailing, type = 'text', style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const h = size === 'l' ? 56 : 48;
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label && <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{label}</span>}
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, height: h, padding: '0 16px', background: 'var(--surface-card)', border: '2px solid var(--outline-control)', borderColor: focus ? 'var(--outline)' : 'var(--outline-control)', outline: focus ? 'var(--focus-ring-width) solid var(--focus-ring)' : 'none', outlineOffset: 3, borderRadius: 'var(--radius-m)', boxShadow: focus ? 'var(--shadow-2)' : 'none', transform: focus ? 'translate(-2px,-2px)' : 'none', transition: 'transform var(--dur-fast) var(--ease-pop), box-shadow var(--dur-fast)', boxSizing: 'border-box' }}>
        {leading}
        <input type={type} value={value} onChange={e => onChange && onChange(e.target.value)} placeholder={placeholder} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} aria-describedby={hint ? rest.id && rest.id + '-hint' : undefined} {...rest}
          style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: 'var(--type-body-l)', fontSize: size === 'l' ? 17 : 15, color: 'var(--text-primary)' }} />
        {trailing}
      </span>
      {hint && <span id={rest.id ? rest.id + '-hint' : undefined} style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{hint}</span>}
    </label>
  );
}
