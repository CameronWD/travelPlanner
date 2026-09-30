# Share link page

Route: `app/share/[token]/page.tsx`. **No auth.** It stays a Server Component (the journal photo strip can be client).

The page has one job: to show someone **without an account** the trip in the way that matters at that moment. That's "where are they going?" before the trip, "where are they now, are they OK?" during it, and "how did it go, could I do this?" after it. It is also Teepee's shop window, so it ends with a calm invitation to start a trip of your own.

## 1. Stage

This is decided by the existing `describePhase({ startDate, endDate, today })` in the trip's reference timezone:

| Phase | Stage | Hero | Lead section after the hero |
|---|---|---|---|
| `upcoming` / `sketching` | **Before** | Countdown | Map + route |
| `travelling` | **During** | Day X of Y, with a progress bar | **Right now** |
| `past` | **After** | Home again, with the cover | **Tally**, then **How it went** (journal) |

Export `shareStage(phase): "before" | "during" | "after"` from `lib/share-view.ts` and unit-test it.

**Section order by stage** (sections hidden by the link's options are skipped):

- **Before:** Hero → Map → Route → Day by day (open at the first stop) → CTA → footer
- **During:** Hero → Right now → Next → How it's going (latest 2, on mobile) → Map → Route → Day by day (open at the current stop) → CTA → footer
- **After:** Hero → Tally → How it went → Route → Map (desktop only) → Day by day (all folded) → "Use this route" CTA → footer

The desktop layout (`share-desktop-during.png`) puts the hero and Right now side by side, and the map and route side by side, then Day by day with a sticky stop index. On desktop, Before and After use the same two-column rows, with the right column holding the route list, and the Tally in After.

---

## 2. Top bar

- **Desktop:** 76px tall, `bg-sun border-b-2 px-12 flex items-center justify-between`. It holds the `Logo` (30px) and, on the right, the text "You're viewing a shared trip" (`text-sm font-semibold text-on-accent-muted`) plus a **Plan your own trip** ink pill (`shadow-cta`) linking to `/signin?from=share`.
- **Mobile:** 56px tall, `bg-background` with no border. It holds the logo (24px) and a **Plan your own** outline pill (40px).
- **Tracking:** add `?ref=share&t={token-hash-prefix}` to the CTA links, so sign-ups from share pages can be counted. Use a hash prefix, **never the raw token**.

## 3. Hero

The card is `bg-coral border-2 rounded-[28px] shadow-5`: `p-7 lg:p-8`, `min-h-80` on desktop, and `rounded-3xl p-4` on mobile.

**Pill** (the status-pill style, `bg-card`):

| Stage | Pill text |
|---|---|
| Before | "SHARED TRIP" (mobile) or "UP NEXT" (desktop) |
| During | "ON THE ROAD · DAY 9 OF 35", with an 8px coral dot before it (see `MOTION.md` S2) |
| After | "HOME AGAIN" |

**Title:** `noOrphan(trip.name)`, in `font-display font-extrabold tracking-[-0.05em]`:
- desktop: 80px, `leading-[.9]`
- mobile: 44px before, 36px during, 34px after

**Sub line** (`font-bold`, 17px on desktop, 14px on mobile):
- Before and during: "Fri 4 Dec – Fri 8 Jan · 35 nights · 6 stops"
- After: "Dec 2026 – Jan 2027", the month span only

**Stage block:**
- **Before:** "67 / sleeps to go", using the countdown type from the Trips carousel (64px number on mobile, 84px on desktop).
- **During:**
  - A 16px progress bar (`border-2 rounded-full bg-card`) with a `bg-foreground` fill at `dayIndex / totalDays`.
  - Under it, a row with "Cameron & Sam" on the left and "26 nights to go" on the right.
  - On desktop the bar isn't shown. The pill carries the day count, and the Right now card sits beside the hero.
- **After:** no number. The Tally row follows the hero instead (§6).

**Travellers** (only when `shareLink.showTravellers`, §9):
- Overlapping `TravellerAvatar`s at 34px (28px on mobile), with `-ml-2.5` and a 2px ink ring.
- The label is "{A} & {B}'s trip", or "{A}, {B} & 2 others". Use display names, never emails.

**Cover polaroid** (desktop always, mobile After only):
- 190px wide on desktop, 96px on mobile, rotated 4°.
- It's the trip's cover: the photo if there is one, otherwise the route sketch or passport stamp from `TRIP_COVER.md`.
- Draw the route sketch **solid** in After (the whole trip has happened) and dashed in Before.
- The same render feeds the page's **OG image**. Update `app/share/[token]/opengraph-image.tsx` (or add it) to use the hero layout at 1200×630: coral, title, sub line and polaroid. That way the link preview in a messaging app matches the page.

## 4. Right now (During only)

This **replaces `ShareTodayCard`.** The card is `bg-card border-2 rounded-[28px] shadow-5 p-6` on desktop, beside the hero (`grid-cols-[7fr_5fr]`); on mobile it's the full width under the hero.

- **Head row:**
  - Left: "RIGHT NOW" (label).
  - Right: the local time and day, "Sat 12 Dec · 14:20 CET", from the current stop's timezone (`Intl.DateTimeFormat` with `timeZone`), rendered on the server.
  - Add `export const revalidate = 300` so the time and the done-strikes stay reasonably fresh. Or make the time a tiny client component that ticks each minute.
- **Place:**
  - "In Paris" (`font-display text-[40px]`, 34px on mobile).
  - Under it, the sub line "France · Night 3 of 5 · then Rome on Tue". On mobile it's "Night 3 of 5 · {day title}".
- **Between stops** (a transport is in progress, i.e. now falls between `depAt` and `arrAt`):
  - The place line becomes "Travelling to Rome".
  - The sub line becomes "✈ Flight · lands 12:15 local".
  - The today list shows that leg as its first row.
- **Today list** (only if `includeDailyPlans`):
  - A `bg-background border-2 rounded-2xl` box with the day title (`font-display`) and then rows of time, dot and title.
  - Items whose end time (or start time + 1h) has passed in local time get `line-through text-muted-foreground`.
  - It shows at most 5 rows, then "+2 more".
- **Tonight** (only if `includeAccommodation` and `tonightsStay` returns one):
  - A `bg-sun border-2 rounded-[14px]` row with the `Moon` icon, the label "Tonight" and the stay name.
  - The address is **not** shown here; it stays in Day by day, as today.
- **Next** (mobile, as a separate row under the card; on desktop it's folded into the sub line):
  - A dashed card row: "NEXT", the next stop's dot and name, and on the right the outgoing leg: "✈ Tue 15 · 10:05" (when `includeTransport`) or just the date.

## 5. Map + route

**Map:**
- 400px tall on desktop, 200px before and 180px during on mobile.
- It's the existing `RouteMap`, restyled per the map spec, with `rounded-3xl border-2 shadow-4`.
- **During:**
  - The legs already travelled are drawn **solid**, the rest dashed.
  - The current stop's pin is bigger (40px on desktop, 32px on mobile) and has a 6px coral halo (`box-shadow: 0 0 0 6px hsl(var(--coral)/.35)`).
  - A "THEY'RE HERE" coral pill sits above the current pin.
- **After:** all legs solid, no halo.
- The home pin and the return leg are unchanged: `homeMapPoint`, `showReturn`.

**Route list** (`bg-card border-2 rounded-3xl shadow-4 p-5`):
- Head: "The route" (`font-display text-[22px]`), with a count on the right: "1 of 6 done" during, "All 6 ✓" after, nothing before.
- **Rows:** at least 50px, `border-b-2 border-muted`, each with:
  - a 28px numbered dot in the stop colour
  - the name (`font-display text-base`) and "Country · N nights" underneath
  - a right-hand tag:
    - **Before:** compact dates
    - **During:**
      - past stops: "✓ Been", in `text-teal-text`
      - the current stop: "Here now", in `text-coral-text`, and the row gets a `bg-coral/20 rounded-xl` highlight
      - later stops: dates
    - **After:** "N nights"
- Outbound transport and accommodation no longer show here; they live in Day by day. This makes the list shorter than today's.

## 6. Tally (After only)

- One card split into three equal cells with 2px dividers: **nights**, **stops**, **countries**. Each is a `font-display text-[30px]` number with a `text-xs font-bold` label.
- All three come from data already on the page: nights from `nightsBetween`, stops from `stops.length`, and countries from a `Set` of `stop.country`.
- **Don't add distance or spend.** Money never appears on this page.

## 7. Day by day

This replaces the grid of day cards. It's shown when any of `includeAccommodation`, `includeTransport` or `includeDailyPlans` is on, as today.

**Desktop:** `grid-cols-[240px_minmax(0,1fr)] gap-6 items-start`.

**Left, the stop index** (`sticky top-6`):
- The H2 "Day by day" (28px), then one 40px row per stop: dot, name and compact dates.
- The current stop (or the one in view) is `bg-teal/15 border-2`.
- Clicking a row scrolls to that stop's card. Reuse `scrollToId` from Plan.

**Right, one block per stop,** in plan order:
- **Folded stop** (past stops during the trip, all stops after it, and every stop except the first before it):
  - A row card: `bg-card border-2 rounded-[18px] px-4 py-3`, dashed for past stops.
  - It contains the dot, "{Stop} · {n} days" (`font-display text-[17px]`), and a right-hand status:
    - "✓ Done" (`text-teal-text`) for past stops
    - the dates for future ones
  - Then a **Show ⌄** toggle, which is a client `<details>` or a small component.
- **Open stop:** `bg-card border-2 rounded-[22px] shadow-4 overflow-hidden`.
  - **Head band:** filled with the stop colour, `border-b-2 px-4 py-3`. It has a 28px white numbered dot, the name (`font-display text-[22px]`) and, on the right, "Thu 10 – Tue 15 Dec · 5 nights".
  - **Day rows** (`grid-cols-[110px_minmax(0,1fr)] gap-4 py-3 border-b-2 border-muted`):
    - The date is `text-base font-extrabold`. The current day gets a "TODAY" coral pill under the date and a `bg-sun/15` row tint.
    - The day title, if any, is `font-display text-[17px]` (only when `includeDailyPlans`).
    - Then the items. Each is a 44px time column, a 12px category dot and the title (`text-[15px] font-bold`).
    - Accommodation check-in/out and transport rows appear as items with their own glyph, from the existing `buildItinerary`, which already interleaves them.
- **Leg lines** between stop blocks (only when `includeTransport`): a plain row with the mode icon, the label ("Flight to Rome") and the times ("Tue 15 Dec · CDG 10:05 → FCO 12:15"). Never show the booking reference.

**Mobile:**
- The stop index becomes a pill dropdown next to the H2 ("Paris ⌄"), which switches which stop is open.
- Only one stop is open at a time.
- The day rows stack: the date line first, then the items.

Keep `data-testid="share-day"` on each day row and `aria-current="date"` on today.

## 8. How it's going / How it went (journal)

This is shown only when `shareLink.includeJournal`, with **exactly** the current query-level gating. That means only arrived days, `hiddenFromShares` filtered in the `where`, and photos excluding hidden (date, author) pairs.

- **Head:** the H2 "How it's going" during the trip, or "How it went" after it. Beside it, "From their journal" on desktop, or "{n} entries ›" on mobile, which expands to show them all.
- **Polaroid card:**
  - `bg-card border-2 rounded-xl shadow-4 p-[9px_9px_14px]`, rotated between −2° and +2°. Derive the angle from the entry id, not `Math.random()`, so it's stable between server and client.
  - The photo is 4:3 (1:1 in the After grid), with `border-2 rounded-[5px] object-cover`. It's served by the existing link-scoped photo route.
  - Under the photo: a 22px author avatar and "Sat 5 Dec · London", then the body text (`text-sm leading-[1.4]`, `line-clamp-3`).
- **Entries with no photo:** the same card with no photo area, and the body at `text-base`.
- **Layout:**
  - Desktop, both during and after: a horizontal scroller of 250px cards, `gap-6`, newest first.
  - Mobile during: a horizontal scroller of 200px cards, showing the latest 2 with "{n} entries ›" to see the rest.
  - Mobile after: a 2-column grid of 4, with "{n} entries ›" to see the rest.
- This replaces the current `JournalSection` markup. Keep its data props.

## 9. CTA + footer

**Before / During:**
- A `bg-sun border-2 rounded-[28px] shadow-5 p-7` card (`rounded-[22px] p-4` on mobile).
- Heading: "Got a trip of your own coming up?" (mobile: "Got a trip of your own?"), in `font-display text-4xl` (24px on mobile).
- Body: "Teepee keeps the route, the days and the money in one place, for everyone who's going. It's free to start."
- Button: **Start your own trip** (ink with `shadow-cta`, 56px), linking to `/signin?from=share&ref=…`.

**After:**
- Heading: "Fancy doing this one?"
- Body: "Start a trip with the same 6 stops. You pick the dates."
- Primary button: **Use this route**. Secondary link: "or start from scratch".

**Footer:** one centred line, "View only. Costs, notes and booking references stay private to the people on the trip." (`text-[13px] font-semibold text-muted-foreground`).

**Removed:** the lilac "Money" card, and the old footer line "Made with Teepee · plan it with your people", which the CTA replaces.

### "Use this route" (the new feature)
- The link goes to `/trips/new?fromShare={token}`. It sends visitors who aren't signed in through sign-in first, then returns them here.
- New trip then starts at step 1 with the name "{trip name} (my version)". After the trip is created, the stops are copied from the share's **public projection only**: name, country, lat/lng and nights, where nights = `nightsBetween(arrive, depart)`, all as **rough** stops.
- Nothing else is copied: no dates, items, stays, transport or journal.
- Server action: `copyRouteFromShare(token)`. It must go through the same `shareLink` lookup, and it must refuse if the link has been revoked.
- Record `sourceShareLinkId` on the new trip, for attribution.

## 10. Data changes (the only ones)

| Change | Why | Where |
|---|---|---|
| `ShareLink.showTravellers Boolean @default(true)` | Travellers on the hero | Prisma migration. Add a switch in Settings → Share links: "Show who's going". |
| Select trip members with `TRAVELLER_SELECT` (display name + photo only) when `showTravellers` | Hero avatars | `app/share/[token]/page.tsx`. **Never select email.** |
| Current transport (now between `depAt` and `arrAt`) | "Travelling to…" | Already fetched when `includeTransport`; just compute it. |
| `Trip.sourceShareLinkId String?` | "Use this route" attribution | Prisma migration. |

Everything else is already on the page. `robots: noindex` stays.

## 11. Files

```
app/share/[token]/page.tsx                  Server. Stage switch, section order
app/share/[token]/opengraph-image.tsx       OG image = hero at 1200×630
app/share/[token]/share-top-bar.tsx
app/share/[token]/share-hero.tsx            Stage variants + travellers + cover polaroid
app/share/[token]/right-now-card.tsx        Replaces share-today-card.tsx
app/share/[token]/share-route-list.tsx
app/share/[token]/share-tally.tsx
app/share/[token]/day-by-day.tsx            Stop index + stop blocks (client only for fold toggles / mobile picker)
app/share/[token]/journal-polaroids.tsx     Replaces journal-section.tsx markup (same props)
app/share/[token]/share-cta.tsx             Before/During vs After (Use this route)
lib/share-view.ts                           + shareStage(), currentLeg(transports, now), dayIndex()
server/actions/copy-route-from-share.ts     New
```

**Tests:**
- `shareStage`, `currentLeg` and `dayIndex`.
- A page test that for each stage asserts the section order.
- **Privacy regression tests:** the rendered HTML never contains `reference`, `confirmation`, `costMinor`, or an email.
- `copyRouteFromShare` refuses a revoked token and copies rough stops only.
