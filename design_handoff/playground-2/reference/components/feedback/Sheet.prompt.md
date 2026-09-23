Bottom sheet (mobile) / centred dialog (desktop) for add-flows: add a place, add a cost.

```jsx
<Sheet open={open} title="Add a place" onClose={close} footer={<Button block>Add Hakone</Button>}>…fields…</Sheet>
```

Positioned absolute inside the device frame. Slides up in 320ms. One primary action, always at the bottom.
