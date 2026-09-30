# New trip flow

Routes: `app/(app)/trips/new/page.tsx` (Server; it keeps `requireUser()` and the `?past=1` switch) and a new **client** flow that replaces `new-trip-form.tsx`.

**Keep the server action.** `createTrip(input, cover)` takes the same input it does today: `name`, `homeCurrency`, optional `startDate` / `endDate` / `homeName`, and optional `cover` (compressed with `compressImage`). What changes is how the answers are collected: one question per screen, with a live card preview.

This is usually the user's **first real screen** after sign-in, which comes from the "Where to first?" tile on Trips. It has to feel like the rest of the app: sun-coloured chrome, ink borders, big Bricolage headings and the same trip card they'll see afterwards.

---

## 1. Shell (focus mode)

- **No app sidebar and no tab bar.** Render it outside the trip/app shell layout, for example in a `(focus)` route group with its own `layout.tsx`, or with a `hideNav` flag on the existing shell.
- The page background is `bg-background`, and the page takes the full viewport (`h-dvh`).

**Desktop top bar:** 84px tall, `bg-sun border-b-2`, with `grid grid-cols-[1fr_auto_1fr] items-center px-10`.
- **Left:** the lockup logo, 32px tall. It links to `/trips` and asks for confirmation if any answers are filled in.
- **Centre:** the step pills. There are four: **Name · When · From · Cover**, `flex gap-2`. Each pill is 36px tall, `border-2 rounded-full pl-1.5 pr-3.5 text-sm font-bold`, with a 22px number dot inside.
  - **Done:** `bg-card`. The dot is `bg-foreground` with a white `Check`. Clicking it goes back to that step.
  - **Current:** `bg-coral shadow-1`. The dot is `bg-card` with the number.
  - **Upcoming:** transparent. The dot is outlined with the number. It isn't clickable.
- **Right:** "✕ Cancel", a 44px `bg-card border-2 rounded-full` pill that goes back to `/trips`. If any answer is filled in, it confirms first with a Dialog: "Leave without saving?", with the buttons "Keep going" (primary) and "Leave" (ghost).

**Desktop body:** `grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)]`, filling the rest of the height.
- **Question column:** `pt-14 pr-20 pb-12 pl-24 flex flex-col`. Step 1 uses `pt-[88px]`. The action row is pinned to the bottom (`mt-auto`).
- **Preview column:** `bg-canvas border-l-2`, with a dot-grid background (radial 1.5px dots in `border-soft`, on a 22px grid). The preview card is centred (§7).

**Mobile (< 768):**
- The top row is 56px, `px-[18px] flex items-center gap-3`, and holds:
  - a 44px square button: `X` on step 1, `ArrowLeft` after that
  - a 4-segment progress bar (`grid-cols-4 gap-[5px]`, each segment 8px `rounded-full`: done = `bg-foreground`, current = `bg-coral border-[1.5px]`, upcoming = `bg-muted`)
  - "1 of 4" in `text-[13px] font-bold text-muted-foreground`
- There's no sun bar on mobile, to keep it light. The body is `px-5 pt-[22px]`.
- The action button is pinned to the bottom, inside the safe area: `px-5 pt-3.5 pb-[34px]`.
- The preview card is a small tilted mini card on step 1 only. On step 2 it shrinks to a countdown strip. See the per-step notes below.

**Tablet (768–1279):** the desktop layout, with the preview column at `minmax(0,4fr)` and the preview card scaled to 0.85.

**State:** keep it in one client component (`useReducer`), with this shape:
```ts
{ step: 1|2|3|4, name, dateMode: "exact"|"rough"|"none", startDate?, endDate?, roughMonth?,
  homeName?, homePlaceId?, homeCurrency, coverFile?, coverPreviewUrl? }
```
- Mirror `step` into the URL (`?step=2`), using `router.replace` with `scroll: false`, so the browser Back button moves between steps and a refresh doesn't lose your place.
- Persist the draft in `sessionStorage` (`teepee:new-trip-draft`) and clear it when the trip is created.

**Keyboard:**
- **Enter** submits the current step.
- **Esc** triggers Cancel (with the confirmation above).
- Autofocus goes to each step's main input when the step mounts.
- Each step's `<h2>` is the accessible name of its `<form>`. When the step changes, move focus to the new heading, and announce "Step 2 of 4, When" with `aria-live="polite"`.

---

## 2. Step 1: Name (required)

- **Eyebrow:**
  - First trip: "Welcome, Cameron. Let's start your first trip."
  - Later trips: "New trip". It's `text-[15px] font-bold text-muted-foreground`.
- **H2:** "Where to?", in `font-display text-[88px] leading-[.9] tracking-[-0.045em]`, 52px on mobile.
- **Input:**
  - 80px tall on desktop (64px on mobile), `bg-card border-2 rounded-[20px] shadow-3 px-6`.
  - Text is `text-[30px] font-bold` (22px on mobile), with the caret in `caret-coral`.
  - Placeholder: "Japan in spring".
  - `maxLength` is whatever the schema allows, and `autoComplete="off"`.
- **Helper line:** "A place, a season, an excuse. You can change it later." (mobile: "You can change it later."), `text-[15px] font-medium text-muted-foreground`.
- **Validation:** if the name is empty on Continue, the input gets a `border-coral-text` border and `tp-wiggle`, and the helper text changes to "Give it a name to keep going" in `text-coral-text`. Server errors on `name` also show here.
- **Actions:** **Continue** (ink pill, 56px, `text-[17px] font-extrabold shadow-cta`, with a `↵` kbd hint on desktop only), plus "Already been? **Log a past trip**", which goes to `?past=1` and keeps the name.
- **Arriving from the "Where to first?" tile** on Trips, which already has a name field: go to `/trips/new?name=…&step=2`. Step 1 is then already done.

## 3. Step 2: When (optional)

- **H2:** "When are you going?", 64px (44px on mobile).
- **Mode segmented control:**
  - Desktop options: **Exact dates · Roughly · Not sure yet**.
  - Mobile labels are shorter: **Dates · Roughly · Not sure**, full width in `grid-cols-3`.
  - Style: `border-2 rounded-full bg-card`, with the active segment `bg-foreground text-background`.

**Exact dates** is a range picker.
- **Desktop:** two months side by side. Each month is a `bg-card border-2 rounded-[20px] shadow-2 p-4` card with a month title (`font-display text-lg`), weekday initials (`text-muted-foreground`) and a 7-column day grid with 38px cells.
- **Mobile:** one month, with swipe or arrows to change month, and 36px cells. Each cell's hit area is at least 44px wide, which it is at a 390 width.
- **Range styling:**
  - Start and end days: `bg-foreground text-background rounded-full`.
  - Days in between: a `bg-coral/25` band with no rounding. The mock uses `#FFD9CF`. Define it once as `bg-range` with `hsl(var(--coral) / .25)`.
  - Days today and before are disabled (`text-muted-foreground/50`) in normal mode.
  - Build on the existing `DateField` / react-day-picker if the repo already has one, and restyle it. Don't add a second date library.
- **Summary** next to Continue: "Fri 4 Dec – Fri 8 Jan · 35 nights", in `text-[15px] font-bold`, built with `formatRange()` and `nightsBetween()`.
- **Mobile:** under the calendar there's a coral countdown strip (`bg-coral border-2 rounded-2xl`), with "67" in `font-display text-4xl`, "sleeps / to go" beside it, and the range and nights right-aligned.

**Roughly:**
- A 4×3 grid of month chips for the next 12 months, plus an optional "How long?" stepper that counts nights.
- **Check with the schema:** if `Trip` can't store a month without exact dates, save nothing and put the month in `roughMonth` for the preview only. Otherwise add `roughStart` (YYYY-MM).
- The preview shows "Sometime in April" instead of a countdown.

**Not sure yet:** a single line, "No problem. Add dates when you've picked your stops.", and Continue is enabled straight away.

**Validation:** end must be on or after start. Show errors under the grid in `text-coral-text`.

## 4. Step 3: From (optional)

The mobile mock (`2d`, third phone) is the spec. On desktop, the same content sits in the left column.

- **H2:** "Leaving from?"
- **Helper:** "Your home base. It's where the trip starts and ends."
- **Combobox:**
  - `bg-card border-2 rounded-[18px] shadow-2`, with a 60px input row (`text-xl font-bold`).
  - Results sit in the same box under a 2px divider. Each row is at least 52px: a 12px `bg-sun` dot, the name (`font-bold`) and the region (`text-xs text-muted-foreground`). The highlighted row is `bg-sun/25`.
  - Use the same place search as Plan's "Add a place". If there's no geocoder available client-side, fall back to a free-text input, which is how `homeName` works today.
- **Show money in:**
  - A label, then a `bg-sun border-2 rounded-2xl` row showing the code (`font-display text-[22px]`), the full name, and a **Change** link in `text-coral-text`.
  - Change opens a searchable `Select` built from `CURRENCIES`.
- **Currency default:**
  - When a place is picked, set `homeCurrency` from the place's country. Add a small `lib/currency-for-country.ts` map, covering at least the countries in `CURRENCIES`.
  - If no place is picked, use the `DEFAULT_HOME_CURRENCY` or `Intl` locale guess, as today.
- **Note under the row:** "Picked from Sydney. Costs in other currencies convert to this." If no place is picked, it reads "Costs in other currencies convert to this."
- **Actions:** **Skip** (outline pill) and **Continue**. Skip keeps the default currency.

## 5. Step 4: Cover + review

- **H2:** "Got a photo for it?"
- **Body:** "Totally optional. Skip it and we'll stamp the card for you, then sketch your route once you add stops." (`text-base text-foreground/80 max-w-[560px]`)
- **Dropzone polaroid:**
  - 200px wide, `bg-card border-2 rounded-xl shadow-3 p-[9px_9px_34px] -rotate-3`.
  - The inner 3:4 area has a `border-2 border-dashed` border, with a 44px `bg-sun` round **+**, "Drop a photo", and "or choose one" underneath.
  - Reuse the `CoverDropzone` logic: drag and drop plus a file input, `accept="image/*"`.
  - Once a photo is chosen, show it with `object-cover` inside the frame, the border goes solid, and a small "Replace" / "Remove" pill sits under the polaroid.
- **Review list:** "YOUR TRIP" label, then one row per answered step. Each row is at least 48px, `bg-card border-2 rounded-[14px]`, and has:
  - a 28px step tile in the step's colour: 1 = coral, 2 = sun, 3 = teal
  - a small label (`text-xs text-muted-foreground`) and the value (`text-[15px] font-bold`)
  - an **Edit** link that jumps to that step. The review is kept when you come back.
- Skipped steps show as "No dates yet" or "Home base not set" in `text-muted-foreground`.
- **Primary CTA:** **Create trip →**. This is the only coral CTA in the flow (`bg-coral border-2 shadow-3 text-foreground`), because it's the moment the trip actually gets made.
  - On submit, call `createTrip`.
  - While it's pending, the button shows `loading`, and all inputs and the step pills are disabled.
  - Put validation errors from the server on the right step, and jump to the first step with an error.
- **Next hint:** "Next: add your first stop", `text-[15px] font-bold text-on-accent-muted`.

**After create:**
- `createTrip` already redirects. It should redirect to the trip's **home**.
- Trip home, for a trip with 0 stops, shows its "Add your first stop" next step. That comes from the Home handoff.
- Clear the sessionStorage draft.
- The first time only, show a toast (`tp-toast-in`): "Japan at Christmas is ready. Add your first stop to start the route."

---

## 6. Past-trip mode (`?past=1`)

It uses the same shell and components, with different copy and rules:

| Step | Normal | Past |
|---|---|---|
| Pills | Name · When · From · Cover | Name · When · Where · Cover |
| 1 | "Where to?" | "Where did you go?", with the eyebrow "Log a past trip" |
| 2 | "When are you going?"; optional; 3 modes | "When did you go?"; **required**. The modes are **Exact dates** and **Month**. Only past dates are enabled. |
| 3 | Leaving from? (home and currency) | "Where did you stop?". Add 1+ places with the same combobox, as removable chips. Currency is under a small "Show money in" row, the same as normal. |
| 4 | Cover + review | Cover + review. The CTA is **Add trip →** |
| After | Trip home | `/globe`, focused on the new pins, with the toast "Added to your map". |

For past mode, `createTrip` needs to accept `stops: {name, placeId}[]`, or you can create the stops in a follow-up action straight after. The current form error "Add the dates you went" is kept as the step 2 validation message.

---

## 7. Live preview card (desktop right column)

This is the **real** Trips carousel hero card (`components/trips/trip-card-hero.tsx`, from the carousel handoff), rendered with the draft data. Build it as a pure presentational component so it can take a draft object. Don't fork the styles.

- **Frame:** 420×280, `bg-coral border-2 rounded-3xl shadow-4 p-[22px]`.
- **Above the card:** the label "ON YOUR TRIPS PAGE".
- **Below the card:** a caption in `text-sm font-semibold text-on-accent-muted`:
  - step 1: "Fills in as you answer"
  - step 2: "Dates start the countdown and date the stamp"
  - steps 3–4: "Ready to go"

What the preview shows at each point:

| Draft state | Pill | Title | Bottom | Polaroid |
|---|---|---|---|---|
| Name only | NEW TRIP | the name, updating live on each keystroke | two grey skeleton bars (`bg-foreground/15 rounded-full`, 14px tall, 120px and 84px wide) | stamp: `★ SOON ★`, a place word (§8) and `— — —` |
| + exact dates | UP NEXT, plus the "4 Dec – 8 Jan" range | name | **67** sleeps to go (84px number) | the stamp's date line becomes `04 DEC 26` |
| + rough month | UP NEXT | name | "Sometime in" and "April" at 40px | stamp date `APR 27` |
| + cover photo | same | same | same | the photo, `object-cover`, replaces the stamp |
| Step 4 | same | same | adds the "+ Add your first stop ›" chip | same |

- If the name is empty, the title shows the placeholder "Your trip" in `text-foreground/40`.
- Long names get `line-clamp-2`.

**Mobile:**
- Step 1 shows a 250px mini card at `-rotate-2`, holding the pill, the name and a 70px polaroid with the stamp.
- Step 2 shows the countdown strip instead.
- Steps 3 and 4 have no preview; the review list covers it.

## 8. Stamp word

This builds on the stamp rule in `TRIP_COVER.md`. While the trip has no stops, the stamp's big word comes from the name:
1. If the name contains a known country or city (check against `lib/countries` or the geocoder's country list), use it upper-cased. For example, "Japan at Christmas" → `JAPAN`.
2. Otherwise use the name's first word upper-cased, truncated to 8 characters.

The ink colour is `coral-text` for the coral hero. For other trip colours, follow `TRIP_COVER.md`.

## 9. Files

```
app/(app)/trips/new/page.tsx                 Server. requireUser, reads ?past, ?name, ?step; renders <NewTripFlow>
app/(focus)/layout.tsx                       (or hideNav on the shell) Focus shell without nav
components/new-trip/new-trip-flow.tsx        client. Reducer, URL step sync, sessionStorage, submit → createTrip
components/new-trip/flow-top-bar.tsx         Logo, step pills, Cancel (+ confirm dialog)
components/new-trip/flow-progress-mobile.tsx 4-segment bar + back/close
components/new-trip/step-name.tsx            client
components/new-trip/step-when.tsx            client. Mode switch, range calendar, rough months
components/new-trip/step-from.tsx            client. Place combobox, currency row
components/new-trip/step-where-past.tsx      client. Multi-place chips (past mode)
components/new-trip/step-cover.tsx           client. Polaroid dropzone + review list
components/new-trip/trip-preview.tsx         Pure. Wraps TripCardHero with draft → card props
lib/new-trip/draft.ts                        Pure: reducer, validation per step, toCreateInput()
lib/new-trip/stamp-word.ts                   Pure: stampWord(name, stops) — unit-test
lib/currency-for-country.ts                  Pure: ISO country → currency code
```

`new-trip-form.tsx` and `NEW_TRIP_FORM_GRID_CLASS` get deleted. Rewrite `new-trip-form.test.tsx` as `new-trip-flow.test.tsx`, covering:
- the name-required gate
- past mode's required dates
- skipping steps 2–4 still creating a trip with just a name
- currency following the home place
- Edit from the review going back to the right step
