The colour block. Every idea on a Playground screen is one Card: outline, hard shadow, chunky radius.

```jsx
<Card tone="coral" shadow={3} radius="xl" padding={18}>…hero…</Card>
<Card sticker={<Chip tone="teal" uppercase size="s">Kanto</Chip>}>Tokyo · 4 nights</Card>
<Card dashed>+ Add a stop</Card>
```

Hero card = shadow 3, radius xl. Standard = shadow 2, radius l. Nested tiles inside a card = shadow 0. Never stack more than 2 levels of outline.
