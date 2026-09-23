Mobile bottom tab bar — the active tab is a coloured sticker tile with a hard shadow.

```jsx
<TabBar items={[{ key: 'home', label: 'Home' }, { key: 'plan', label: 'Plan' }, { key: 'days', label: 'Days' }, { key: 'money', label: 'Money' }, { key: 'more', label: 'More' }]} value={tab} onChange={setTab} />
```

Words, not icons. Sticker moves to the new tab; the bar itself is paper with a 2px top rule. 22px bottom padding clears the home indicator.
