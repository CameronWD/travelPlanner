# Landing: centred card fan, shuffle and route ribbon

Repo files: `app/landing/landing.tsx`, `app/landing/sample-cards.tsx`, `app/landing/sign-in-panel.tsx` (`LandingActions`), `app/globals.css`, and their tests.

## 1. Why

Before this change, the phone put ten pieces into about 310px, pinned by percentages. They collided (the "let's go" chip and the fork card sat on the day plan's text), and the bottom edge cut through three cards at different heights. Some pieces bled off the left edge and some off the right, with no pattern.

The new rules, on both breakpoints:
- **Symmetry:** the cards are one group, mirrored around a centre axis.
- **Nothing hides text:** where cards overlap, the overlap only covers padding.
- **One bleed:** only the route ribbon runs off the edges.
- **Centred:** the group is centred vertically in whatever space is left.

## 2. Phone (below `lg`), `data-slot="landing-phone"`

### 2.1 Hero: now centred
Only the alignment changes; sizes, weights and copy stay as they are.

```
container   flex h-dvh flex-col items-center overflow-hidden px-6 text-center lg:hidden
logo        pt-3.5 (centred by the container)
h1          pt-7 text-[50px] … (unchanged) text-balance
p           mt-3.5 max-w-[310px] text-[15px] font-semibold leading-[1.4] text-balance
actions     mt-5 self-stretch → <LandingActions size="md" align="center" />
```

**`LandingActions`:** add a prop, `align?: "start" | "center"`, defaulting to `"start"`. With `"center"`, the legal row gets `justify-center`. Give the legal row `whitespace-nowrap` in both modes; at 393px it must stay on one line.

### 2.2 Card area
The area fills the rest of the screen and centres a fixed-height stage inside it:

```
area   relative -mx-6 flex min-h-0 flex-1 items-center justify-center self-stretch overflow-hidden text-left
stage  relative h-[268px] w-full max-w-[393px] shrink-0
```

There are five pieces (previously ten). The day plan, wishlist, fork, money and "let's go" pieces are removed from phone.

Each piece is a **positioned wrapper** that the shuffle animates, containing the **card**, which carries `tp-card-in` and its tilt. See §5 for why they're split.

| piece | wrapper (position) | card | tilt |
|---|---|---|---|
| `lilac` | `absolute left-3.5 top-[34px] w-[116px]` | `Card tone="lilac" shadow={1} p-3`. Label 11px bold: `place`. Title `font-display text-[15px] font-extrabold leading-[1.2]`: `bed`. Then a 40px spacer. | −7° |
| `weather` | `absolute right-3.5 top-[34px] w-[116px]` | `Card tone="teal" shadow={1} p-3 text-right`. 10px bold `city`. `font-display text-[26px] font-extrabold` `temp` + Sun/Cloud (18px). 11px medium `wear`. Then a 26px spacer. | +7° |
| `countdown` | `absolute left-1/2 -ml-[90px] top-2.5 z-20 w-[180px]` | `<button>`, styled as `Card tone="coral" shadow={2} radius="xl" p-4 flex flex-col items-center text-center`. Badge caps `status`. Name `mt-2.5 font-display text-[18px] font-extrabold whitespace-nowrap`. Big `text-[56px]` + small `text-[15px]`, two lines, left-aligned. `RefreshCw` 14px at `absolute right-3 top-2.5`. | 0° |
| `train` | `absolute inset-x-0 top-[166px] z-30 flex justify-center pointer-events-none` | `Badge variant="sun" px-2.5 py-1 text-[11px] shadow-hard-1`: `ArrowRight` + `leg` | −4° |
| `stops` | `absolute -inset-x-3 top-[216px]` | Ribbon (§2.3) | 0° |

**Narrow phones (under 380px wide):** make the side cards `w-[104px]` and the front card `w-[168px] -ml-[84px]`, so the side cards' text stays clear of the coral card.

The front card is not tilted, so the fan reads as symmetrical. That also leaves hover and press free to use `pressable`.

### 2.3 Route ribbon (phone)
```
band   border-y-2 border-border bg-card py-2.5 shadow-[0_3px_0_hsl(var(--shadow-ink))] overflow-hidden
track  flex w-max tp-marquee [--tp-marquee-dur:22s]
half   flex items-center gap-2.5 pr-2.5 text-[13px] font-bold whitespace-nowrap   (render TWO identical halves)
item   flex items-center gap-2 → dot (size-2 rounded-full bg-coral), stop name, ArrowRight 12px text-muted-foreground
```

Each half holds the trip's four stops twice (eight items), so a half is always wider than the band. The track moves by −50%, which means it loops with no seam.

## 3. Desktop (`lg` and up), `data-slot="landing-desktop"`

The left column is unchanged. The right panel stays `relative overflow-hidden border-l-2 border-border bg-sun`.

Stage: `absolute left-1/2 top-1/2 h-[630px] w-[600px] -translate-x-1/2 -translate-y-1/2`. Keep the existing per-breakpoint `scale-*` ladder.

There are nine pieces, the same set as today, laid out as a mirrored fan in three rows. The colours cross over: lilac/teal in the middle row, teal/lilac in the bottom row.

| piece | wrapper | card | tilt |
|---|---|---|---|
| `day` | `left-10 top-[18px] w-[210px]` | `Card shadow={3} radius="xl" p-4`. `text-label text-muted-foreground` `date`. Then three rows `text-[13px] font-semibold truncate`: `tabular-nums text-muted-foreground` time + what. | −8° |
| `money` | `right-10 top-[18px] w-[210px]` | `Card shadow={3} radius="xl" p-4 flex flex-col items-end text-right`. 12px bold `spend` (nowrap). `font-display text-[32px] tabular-nums` `amount`. `Badge variant="sun" mt-2` `owes`. | +8° |
| `lilac` | `left-3 top-[196px] w-[170px]` | `Card tone="lilac" shadow={2} p-4`. 11px bold `place`. `font-display text-lg` `bed`. `Badge variant="teal" mt-2.5`: paid + `Check`. Then an 18px spacer. | −5° |
| `weather` | `right-3 top-[196px] w-[170px]` | `Card tone="teal" shadow={2} radius="xl" p-4 text-right`. 11px `city`. `font-display text-[40px]` `temp` + icon. 12px `wear`. Then a 30px spacer. | +5° |
| `countdown` | `left-[170px] top-[150px] z-20 w-[260px]` | `<button>` as `Card tone="coral" shadow={4} radius="xl" p-5`, centred. Name `mt-3 font-display text-[24px] whitespace-nowrap`. Big `text-[76px]`, small `text-[20px]`. `RefreshCw` 16px `absolute right-4 top-3.5`. | 0° |
| `train` | `inset-x-0 top-[360px] z-30 flex justify-center pointer-events-none` | `Badge variant="sun" px-3.5 py-2 text-xs shadow-hard-2` | −4° |
| `fork` | `left-[70px] top-[418px] w-[180px]` | `Card tone="teal" shadow={2} p-3.5`. Two `Initials` (the first on sun, the second on lilac). `mt-2 text-[13px] font-medium`: `note[0]`, a line break, then `note[1]`. | +6° |
| `wishlist` | `right-[70px] top-[418px] w-[190px]` | `Card tone="lilac" shadow={2} radius="xl" p-4`. `text-label` "Wishlist". `font-display text-lg` `wish`. `Badge mt-2`: `Heart` + `hearts`. | −6° |
| `stops` | `-inset-x-10 top-[574px]` | Ribbon, as §2.3 but `py-3`, `text-[15px]`, gap-3, a 9px dot, `shadow-[0_4px_0_…]`, `[--tp-marquee-dur:30s]`, and three repeats of the stops per half | 0° |

Unlike the old collage, nothing runs off the panel except the ribbon.

## 4. Sample trips
Use `app/landing/sample-trips.ts`, copied verbatim from this handoff. There are four trips: planning, on the road, done, planning. Index 0 (Japan) is what renders on the server and on first paint.

The copy is final. It replaces the old strings "Zz Machiya near Gion" and "→ Shinkansen · Odawara 11:12". None of it uses "stay", "staying" or "hotel", so the existing test rule still holds.

## 5. Motion

### 5.1 First load: unchanged
The cards keep `tp-card-in` with `entrance(tilt, i, delayMs)` and the existing uneven delays.

That class puts the tilt on the element's `transform`. This is why every piece is split into wrapper and card: **the shuffle animates the wrapper, and the card keeps its tilt and hover.** Never run the shuffle on the `tp-card-in` element.

### 5.2 Shuffle (tap the front card, or auto-rotate)
`sample-cards.tsx` becomes `"use client"`. Use one hook per tree, `useTripShuffle(pieceOrder)`, which returns the trip index, a ref callback per piece, and `shuffle()`. Use the Web Animations API (`el.animate`); the mock's logic class is a working reference.

1. **Guard:** if a shuffle is already running, ignore the call.
2. **Out:** every wrapper runs `{transform:none, opacity:1} → {transform:translateY(24px) scale(.9), opacity:0}` over 170ms with `var(--ease-exit)` easing and `fill:"forwards"`. The stagger follows DOM order: 30ms per piece on phone, 20ms on desktop. The ribbon fades opacity only.
3. Await every out animation, then set the next index, and wait for the commit. In React 19 that means `flushSync`, or awaiting a state-effect. **Don't wait on `requestAnimationFrame`:** it never fires in a background tab, and the cards stay hidden.
4. **In:** every wrapper runs `{translateY(-36px) rotate(±6deg) scale(1.06), opacity:0} → {none, 1}` over 380ms with `var(--ease-bounce)` easing and `fill:"backwards"`. The rotation alternates −6° / +6° by position in the order.
   - Phone order: countdown, lilac, weather, train, stops. Stagger 70ms.
   - Desktop order: countdown, lilac, weather, day, money, fork, wishlist, train, stops. Stagger 55ms.
5. **Cancel the out animations as soon as the in animations have started.** If you don't, a card that lands early falls back to the out animation's forwards fill (opacity 0) and flashes until the last card lands. That bug was in the mock and is fixed there.
6. **In a `finally`:** make sure the index advanced, cancel every animation still on the wrappers, and clear the guard.

With reduced motion, just swap the index; no animation.

### 5.3 Auto-rotate
- Advance the trip every **8s**.
- Skip a tick when:
  - `document.hidden` is true
  - `prefers-reduced-motion: reduce` is set
  - a shuffle is running
  - the user tapped within the last **16s** (two intervals)
- The phone and desktop trees rotate independently; only one is ever displayed.
- Clear the interval on unmount.

### 5.4 Ribbon marquee
Add to `globals.css`, next to `tp-card-in`:

```css
@keyframes tp-marquee { to { transform: translateX(-50%); } }
.tp-marquee { animation: tp-marquee var(--tp-marquee-dur, 22s) linear infinite; }
.tp-marquee:active { animation-play-state: paused; }       /* press to read */
@media (prefers-reduced-motion: reduce) { .tp-marquee { animation: none; } }
```

The reduced-motion rule has to be explicit. The global rule would otherwise run the animation once and leave the track at −50%. That happens to show the same content, but it's still one moving frame.

Update the comment above `tp-card-in`, which says "nothing loops". The ribbon is now the one looping element.

## 6. Accessibility
- **No `aria-hidden` on the containers:** remove it from both `collage-cards` and `sample-cards-phone`, because an `aria-hidden` ancestor would hide the button. Put `aria-hidden="true"` on every decorative piece instead.
- **The front card is the only focusable element:**
  - `<button type="button" aria-label="Show another sample trip">`, with its visible content `aria-hidden`.
  - The focus ring comes from the base `:focus-visible` rule.
  - It uses `pressable` for hover and press.
- **No live region.** The cards are illustrative, and announcing each rotation would be noise.
- The phone button is 180 × ~150, so its hit target is fine.

## 7. Tests to update or add

`sample-cards.test.tsx`:
- **Desktop:** still nine `[data-piece]`, and each card still has `tp-card-in`, a `--tp-tilt` and uneven delays. Change the content list to the Japan copy in `sample-trips.ts`. Replace "nothing is focusable" with "exactly one button, named 'Show another sample trip'".
- **Phone:** five pieces instead of ten (`countdown`, `lilac`, `weather`, `train`, `stops`). The area classes still include `overflow-hidden flex-1 min-h-0`. Apply the same one-button rule.
- **New:**
  - Clicking the button shows "Portugal by rail". Mock `el.animate` in jsdom so the promises resolve.
  - With `vi.useFakeTimers()`, 8s advances the trip, but not within 16s of a click.
  - Under a reduced-motion `matchMedia` mock, there is no interval and a click swaps the trip immediately.
  - The two ribbon halves have identical text.

Other files:
- **`landing.test.tsx`:** the phone tree has `items-center text-center`, and the legal row is centred on phone.
- **`globals.landing-motion.test.ts`:** assert the `tp-marquee` keyframe, the `:active` pause and the reduced-motion `animation: none`.
- **`scripts/landing-cards-audit.ts`:** it checks coverage for the old percentage spread. Retarget it: no text may overlap, and every piece except `stops` sits inside the area at 360×640 and 430×932. If it no longer earns its place, retire it.
