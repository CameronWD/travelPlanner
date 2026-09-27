# Teepee — Desktop Home page spec

> **Read with the amendments in `docs/specs/2026-09-27-beta-feedback.md` §A–§D,
> which override this file where they differ:** full sidebar at ≥1280px, Dock at
> 768–1279px with no top bar; search is a real inline field with no ⌘K keycap;
> no "Today" nav item; "+ Add a stop"; map clusters are geographic, not
> chapters; "Sort these out" is built from Next steps; this layout is for the
> Sketching/Planning/Final prep phases (Travelling/Past per §D).

Build this from the description alone — no image reference. Replaces the current desktop Home and desktop app shell.

Stack: Next.js App Router, Tailwind v4 tokens (`app/globals.css`), shadcn/Radix primitives in `components/ui/`, `cn` from `@/lib/cn`, lucide-react icons. Use existing tokens — never hard-code hex in components.

---

## 0. Visual language (applies to everything below)

- Page background: `--surface-page` (paper, #FFFBF3).
- Cards: 2px solid `--outline` (ink) border, radius 24px, hard offset shadow `5px 5px 0 var(--shadow-ink)`, no blur.
- Small controls (pills, inputs): same 2px ink border; small cards use a `3px 3px 0` shadow.
- Headings + big numbers: Bricolage Grotesque 800. Everything else: Plus Jakarta Sans.
- Eyebrow labels: 11px, weight 800, uppercase, letter-spacing 0.08em.
- Text on coloured cards is always ink (`--on-accent-text`). Never white.
- One colour per idea: **coral** = the trip / "now" / primary CTA · **sun** = money, transport, to-dos · **teal** = route / places · **lilac** = beds / people.
- Muted text: `--text-muted` on paper/white, `--on-accent-muted` on coloured cards.
- Dark mode comes free from tokens — don't add dark-specific classes.

---

## 1. App shell — full sidebar

Applies to **every signed-in desktop page** at ≥1280px, not just Home. Always visible; does not scroll with the page (`position: sticky; top: 0; height: 100dvh`).

**Remove the desktop top app bar entirely.** There is exactly one logo on screen, in the sidebar.

Layout: `grid grid-cols-[248px_1fr]`.

### Sidebar (Server Component except where marked)

- Container: 248px wide, background `--accent-money` (sun), 2px ink right border, padding 22px top/bottom × 16px sides, vertical flex, gap 4px.
- **Lockup** — full teepee logo (tent-pin mark + wordmark), 34px tall, left-aligned with 6px inset, 18px below. Links to `/trips`.
- **Search button** (client) — full width, 44px tall, white fill, 2px ink border, radius 12px. Search icon, "Search or jump" in muted text, and a `⌘K` keycap on the right (11px bold, 1.5px `--outline-soft` border, radius 6px). Opens the existing command palette on click and on ⌘K. 10px below.
- **Trip switcher** (client, Radix DropdownMenu) — white card, 2px ink border, radius 14px, `3px 3px 0` shadow, padding 10px 12px. Row: 10px coral dot with 2px ink border · trip name (14px bold, single line, ellipsis) over "68 sleeps to go" (12px muted; "Day 5 of 35" while travelling, "Back home" after) · chevron-down. Menu lists the user's trips (same dot + name + status), then "All trips" and "+ New trip". 14px below.
- **Trip nav** — Today, Home, Plan, Days, Money, Wishlist, More. Each row 42px tall, radius 12px, padding 0 12px, 15px bold, label left, optional count right (11px, weight 800). Counts: Plan (open items), Wishlist (saved places); hide when 0.
  - Active: coral fill, 2px ink border, `3px 3px 0` ink shadow, `aria-current="page"`.
  - Inactive: transparent, transparent 2px border (no layout shift); hover gives a 2px ink border.
  - Focus: the global focus ring.
- **"ALL TRIPS"** eyebrow label (`--on-accent-muted`, margin 16px 12px 4px), then Trips and Globe as nav rows (same style, no counts).
- **Footer** — pinned to the bottom (`mt-auto`), 2px ink top border, padding 14px 6px 0. Row: 36px avatar · name (14px bold) over "Account" (12px, `--on-accent-muted`) — links to account settings · theme toggle on the right (36px square, white, 2px ink border, radius 10px, moon/sun icon).

### Responsive

- **1024–1279px:** sidebar collapses to the existing 96px Dock (mark only, labels under icons, search as icon button). Trip switcher moves into the page header as a compact pill.
- **Below 1024px:** existing tablet/mobile nav — don't change.

### Main area

Padding 32px 40px. Vertical flex, gap 20px. `min-width: 0` so the grid can shrink.

---

## 2. Page header

One row, `items-end`, gap 16px.

**Left** (grows):
- "Hey Cameron" — 15px, weight 500, muted. Use the user's first name.
- Trip name as `h1` — Bricolage 800, 40px, line-height 1.05, letter-spacing -0.02em.
- One meta line: `4 Dec 2026 – 8 Jan 2027 · 35 nights · 11 stops · AUD` — 15px, weight 600, `--text-body`.
- This is the **only** place on the page that shows dates or currency. Don't repeat them in any tile. No currency chips.

**Right** — row, gap 10px:
1. **Bell** — 44px square, white, 2px ink border, radius 12px. Unread badge: coral pill, 2px ink border, 11px bold number, offset −8px top/right. Opens the existing notifications panel.
2. **People** — stack of 40px avatars overlapping by −10px, each with a 2px ink border. Opens the trip people/invite sheet.
3. **Primary button** — "+ Add a place". 44px tall, pill, ink fill, paper text, 14px weight 800, shadow `4px 4px 0 var(--accent-primary)` (coral hard shadow). Opens the add-stop flow.

No other action buttons on the page. Remove the existing Add a cost / Wishlist / Checklists cluster.

---

## 3. Content grid

```
grid grid-cols-12 gap-[18px] flex-1 min-h-0
grid-template-rows: <row1> 1fr
```

Two layouts, depending on whether the trip has a cover photo:

| | Row 1 height | Countdown | Shared pot |
|---|---|---|---|
| **Has photo** | 300px | `col-span-8` | `col-span-4` |
| **No photo** | 200px | `col-span-6` | `col-span-6` |

Row 2 is always: Route map `col-span-7`, Sort these out `col-span-5`. It fills the remaining height. With no photo, row 1 is shorter, so the map and list get ~100px more.

Every tile fills its grid cell. Nothing is auto-width, no empty space on the right.

---

## 4. Countdown tile (coral)

Card: coral fill (`--accent-primary`), radius 24px, `5px 5px 0` ink shadow, `overflow-hidden`. The whole tile links to Plan.

### Has photo

Padding 24px. Horizontal flex, gap 24px.

**Left column** (flex-1, vertical flex):
- "PLANNING" chip, top left: white pill, 2px ink border, eyebrow text, padding 3px 10px. Values: PLANNING / TRAVELLING / HOME.
- Pinned to the bottom (`mt-auto`), a baseline-aligned row:
  - The number, e.g. **68** — Bricolage 800, 132px, line-height 0.85, letter-spacing −0.06em.
  - "sleeps" over "to go" — Bricolage 800, 32px, line-height 1.02, gap 12px.
- 16px below: first leg — "Fri 4 Dec · Sydney → Denpasar, Bali" (15px, weight 600).

**Right — polaroid** (cover photo):
- White frame, 2px ink border, radius 10px, `4px 4px 0` ink shadow.
- Padding 8px on three sides, 30px at the bottom (real polaroid proportions).
- 176px wide, `rotate-[4deg]`, vertically centred, 18px right margin.
- Image: `aspect-[3/4]`, `object-cover`, 2px ink border, radius 4px. Use `next/image` with `fill` and `sizes="176px"`. Photos are usually iPhone shots or screenshots, so portrait is the default crop. Never add a blurred backdrop.
- A centred "Change" label in the bottom strip (11px bold, muted). Opens the cover uploader (client).
- Respect reduced motion: static rotation is fine, don't animate it.

### No photo

Padding 22px 24px. Vertical flex.

- Top row (space-between): PLANNING chip · a **"+ Add a photo"** pill (2px *dashed* ink border, 12px bold, padding 4px 10px, `whitespace-nowrap`) that opens the cover uploader.
- Bottom (`mt-auto`): the same number row but smaller — number 96px, "sleeps / to go" 26px, gap 10px.
- First leg 12px below (14px, weight 600).
- No placeholder image, no empty slot.

### Content rules

- Number = nights until departure. Use "sleep" when it's 1. On the day, show "Today" instead of the number row.
- While travelling: status TRAVELLING; big number = day of trip, e.g. "5" with "of 35 / days"; the line shows today's stop.
- First leg = the first transport leg's day and date, then origin → first stop. If there's no leg, show just the first stop's name.

---

## 5. Shared pot tile (sun)

Card: sun fill (`--accent-money`), radius 24px, `5px 5px 0` ink shadow. Links to Money.

Money is a **shared pot** — no per-person splitting anywhere.

### Has photo (4 columns, vertical)

Padding 22px. Vertical flex.
- "SHARED POT" eyebrow.
- 6px below: total planned — **$11.1k** (Bricolage 800, 40px, line-height 1, −0.02em).
- "planned so far" (14px, weight 600).
- 14px below: progress bar — 12px tall, pill, white track, 2px ink border, ink fill = paid %.
- 6px below: "$4,000 paid · 36%" (13px, weight 600).
- Pinned to the bottom (`mt-auto`), with a 2px ink top border and 12px padding above: "NEXT PAYMENT" eyebrow · "$115.20 · Kuta pool villa" (15px, weight 700) · "Due Sun 1 Dec" (13px, `--on-accent-muted`).

### No photo (6 columns, two inner columns)

Padding 22px 24px. `grid grid-cols-[1.2fr_1fr] gap-6`.
- **Left:** eyebrow, total, "planned so far", then pinned to the bottom the progress bar and paid line.
- **Right:** 2px ink left border, 22px left padding. "NEXT PAYMENT" eyebrow · 8px below, **$115.20** (Bricolage 800, 28px) · "Kuta pool villa" (14px, weight 600) · pinned to the bottom, "Due Sun 1 Dec" (13px, `--on-accent-muted`).

### Content rules

- Abbreviate large totals ($11.1k). Any amount that isn't abbreviated shows 2 decimals ($115.20, never $115.2). Use the trip currency symbol.
- Nothing costed yet: show "$0" and "Add your first cost" as a link instead of the paid line. Hide the progress bar.
- No upcoming payment: next-payment area shows "Nothing due".
- Progress bar needs `role="progressbar"`, `aria-valuenow`, and the label "Paid".

---

## 6. Route map tile

Card: white fill, radius 24px, `5px 5px 0` ink shadow, `overflow-hidden`, position relative. The map fills the whole tile. Client component.

- **Viewport:** fit bounds to the **current chapter** — the largest group of stops close together (e.g. Europe). Stops outside that group don't widen the map; each one appears as an **inset card** instead.
- **Tiles:** use the approved map palette file (`lib/map-palette.ts` or wherever the blessed hexes live). English labels only. `zoomControl: false`, scroll-wheel zoom off. Dragging is fine.
- **Pins:** 30px circles, 2px ink border, `2px 2px 0` ink shadow, stop number in the middle (12px, weight 800). Fill = the stop's chapter colour from the category ramp. At the fitted zoom, pins must not overlap — if two would, nudge them apart or group them into a count pin.
- **Chips, top left** (16px inset, gap 8px) — a segmented control that changes the viewport:
  - "Route" — white, label only.
  - "Europe · 10 stops" — ink fill, paper text, selected.
  - "Whole trip" — white. Fits every stop.
- **Inset card, bottom right** (16px inset), one per outlying stop, stacked: white, 2px ink border, radius 16px, `3px 3px 0` shadow, padding 12px, 190px wide. Pin + name ("Kuta, Bali", 14px bold) over a line ("4 nights · then fly to Europe", 12px muted). Clicking pans the map to that stop.
- **Attribution, bottom left:** "© OpenStreetMap · CARTO", 11px, weight 600, `--text-muted`. Restyle the default Leaflet attribution — no flag, no blue links.
- Clicking a pin opens that stop's detail.

---

## 7. "Sort these out" tile

Card: white fill, radius 24px, `5px 5px 0` ink shadow, padding 22px. Vertical flex, gap 4px.

- Header row (space-between, 6px below): "Sort these out" (`h2`, Bricolage 800, 22px) · count badge (26px coral pill, 2px ink border, 12px weight 800).
- Up to **4** rows. Each row: flex, gap 14px, padding 10px 0, 2px `--status-neutral` top border.
  - Tile: 40px square, radius 12px, 2px ink border, category colour fill, lucide icon.
  - Middle: title (15px bold) over subtitle (13px muted).
  - Right: chevron.
  - The whole row is a link.
- Footer link (`mt-auto`): "See all in Summary →" (14px bold, ink).

### Row types and tile colours

| Type | Tile | Icon | Example |
|---|---|---|---|
| Transport missing times | sun | `plane` | "Add times to 6 transport legs" / "Nothing booked with times yet" |
| Packing | teal | `list-checks` | "Start your packing list" / "Nothing added yet" |
| Pre-trip to-dos | lilac | `clipboard-list` | "Add pre-trip to-dos" / "Visas, insurance, eSIM" |
| Empty day | pink (`--hue-pink`) | `calendar` | "Plan Sat 12 Dec in Paris" / "Nothing scheduled that day" |
| Reminder due | coral | `bell` | reminder title / "Due Tue 8 Dec" |

### Content rules

- Order: reminders due within 7 days first, then transport, then everything else.
- Dates always via `formatDay()` → "Sat 12 Dec". Never show an ISO date.
- Nothing to do: replace the rows with a single teal row — "You're all sorted" / "We'll flag anything new here".

---

## 8. Removed from Home

- Reminders stat tile and the full-width Reminders panel. Reminders only appear as rows in "Sort these out". No tile ever shows a bare "0".
- The standalone cover photo tile and its blurred side fill.
- The separate "Next payment" tile — merged into Shared pot.
- Duplicate dates and currency in the countdown tile, and the "AUD $" chips.
- The quick-action button cluster.
- The desktop top app bar and the second logo.

---

## 9. Loading, empty and error states

- **Loading:** use the skeleton archetypes. Countdown and Shared pot: tile skeletons at the correct spans for the photo/no-photo layout (you know which from the trip record before the photo loads). Map: flat `--surface-canvas` fill. Sort these out: 4 row skeletons.
- **No stops yet:** countdown shows sleeps if there are dates, otherwise "Pick your dates". Map tile becomes the "Add your first place" empty state. Sort these out suggests adding a place.
- **Map fails to load:** ErrorPanel (compact) inside the map tile. The rest of the page still renders.

---

## 10. Accessibility

- Landmarks: `<nav aria-label="Main">` for the sidebar, `<main>` for content, one `h1` (the trip name).
- Each tile's heading is an `h2`. The countdown's hidden heading reads "Countdown".
- All text is ink on coloured fills, meeting 4.5:1.
- Every interactive element is keyboard-reachable — including map chips and inset cards — and shows the global focus ring.
- Touch targets ≥44px (the 42px nav rows get 1px padding either side of the hit area).
- Screen reader text: the countdown number reads as "68 sleeps to go"; the progress bar has its label and value; badge counts have `aria-label`s ("4 things to sort out", "4 unread notifications").
