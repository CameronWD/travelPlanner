# Teepee — Desktop Home page spec

Build this from the description alone. There is no image reference. It replaces the current desktop Home and the desktop app shell.

Stack: Next.js App Router, Tailwind v4 tokens (`app/globals.css`), shadcn/Radix primitives in `components/ui/`, `cn` from `@/lib/cn`, lucide-react icons. Use existing tokens. Never hard-code hex values in components.

---

## 0. Visual language (applies to everything below)

- **Page background:** `--surface-page` (paper, #FFFBF3).
- **Cards:** 2px solid `--outline` (ink) border, radius 24px, hard offset shadow `5px 5px 0 var(--shadow-ink)`, with no blur.
- **Small controls:** pills and inputs use the same 2px ink border. Small cards use a `3px 3px 0` shadow.
- **Fonts:** headings and big numbers use Bricolage Grotesque 800. Everything else uses Plus Jakarta Sans.
- **Eyebrow labels:** 11px, weight 800, uppercase, letter-spacing 0.08em.
- **Text on coloured cards:** always ink (`--on-accent-text`). Never white.
- **One colour per idea:** coral = the trip / "now" / primary CTA; sun = money, transport and to-dos; teal = route / places; lilac = beds and people.
- **Muted text:** `--text-muted` on paper and white. `--on-accent-muted` on coloured cards.
- **Dark mode:** comes free from the tokens. Don't add dark-specific classes.

---

## 1. App shell — full sidebar

Applies to **every signed-in desktop page** at ≥1280px, not just Home. It is always visible and does not scroll with the page: `position: sticky; top: 0; height: 100dvh`.

Remove the desktop top app bar entirely. There is only one logo on screen, and it lives in the sidebar.

Layout: `grid grid-cols-[248px_1fr]`.

### Sidebar (Server Component, except where marked)

- **Container**
  - 248px wide, background `--accent-money` (sun), 2px ink right border.
  - Padding 22px top/bottom, 16px left/right.
  - Vertical flex, gap 4px.
- **Lockup:** the full teepee logo (tent-pin mark + wordmark), 34px tall. Left-aligned with a 6px inset and 18px space below. Links to `/trips`.
- **Search button** (client)
  - Full width, 44px tall, white fill, 2px ink border, radius 12px.
  - Contents: search icon, "Search or jump" in muted text, and a `⌘K` keycap on the right (11px bold, 1.5px `--outline-soft` border, radius 6px).
  - Clicking it or pressing ⌘K opens the existing command palette.
  - 10px space below.
- **Trip switcher** (client, Radix DropdownMenu)
  - White card: 2px ink border, radius 14px, `3px 3px 0` shadow, padding 10px 12px.
  - Row contents:
    - a 10px coral dot with a 2px ink border;
    - the trip name (14px bold, single line with ellipsis) with "68 sleeps to go" under it (12px, muted). While travelling this reads "Day 5 of 35"; after the trip it reads "Back home";
    - a chevron-down.
  - The menu lists the user's trips (same dot + name + status), then "All trips" and "+ New trip".
  - 14px space below.
- **Trip nav:** Today, Home, Plan, Days, Money, Wishlist, More.
  - **Row:** 42px tall, radius 12px, padding 0 12px, 15px bold. Label on the left, optional count on the right (11px, weight 800).
  - **Counts:** Plan shows the number of open items; Wishlist shows the number of saved places. Hide the count when it's 0.
  - **Active row:** coral fill, 2px ink border, `3px 3px 0` ink shadow, `aria-current="page"`.
  - **Inactive rows:** transparent, with a transparent 2px border so nothing shifts. Hover gives a 2px ink border.
  - **Focus:** the global focus ring.
- **"ALL TRIPS" label:** eyebrow style, `--on-accent-muted`, margin 16px 12px 4px.
  - Under it, Trips and Globe as nav rows in the same style (no counts).
- **Footer:** pinned to the bottom with `mt-auto`.
  - 2px ink top border, padding 14px 6px 0.
  - Row contents:
    - a 36px avatar;
    - name (14px bold) with "Account" under it (12px, `--on-accent-muted`). This links to account settings;
    - the theme toggle on the right (36px square, white, 2px ink border, radius 10px, moon/sun icon).

### Responsive

- **1024–1279px:** the sidebar collapses to the existing 96px Dock: mark only, labels under icons, search as an icon button. The trip switcher moves into the page header as a compact pill.
- **Below 1024px:** use the existing tablet and mobile navigation. Don't change it.

### Main area

Padding 32px 40px. Vertical flex, gap 20px. `min-width: 0` so the grid can shrink.

---

## 2. Page header

One row, `items-end`, gap 16px.

**Left** (grows):
- "Hey Cameron" (15px, weight 500, muted), using the user's first name.
- The trip name as an `h1`: Bricolage 800, 40px, line-height 1.05, letter-spacing -0.02em.
- One meta line: `4 Dec 2026 – 8 Jan 2027 · 35 nights · 11 stops · AUD` (15px, weight 600, `--text-body`).
- This is the **only** place on the page that shows the dates and the currency. Don't repeat them in any tile, and don't add currency chips.

**Right:** a row with gap 10px.
1. **Bell:** 44px square, white, 2px ink border, radius 12px.
   - Unread badge: a coral pill with a 2px ink border and 11px bold number, offset −8px top/right.
   - Opens the existing notifications panel.
2. **People:** a stack of 40px avatars overlapping by −10px, each with a 2px ink border. Opens the trip's people/invite sheet.
3. **Primary button, "+ Add a place":**
   - 44px tall, pill shape, ink fill, paper text, 14px weight 800.
   - Shadow `4px 4px 0 var(--accent-primary)` (a coral hard shadow).
   - Opens the add-stop flow.

There are no other action buttons on the page. Remove the existing Add a cost / Wishlist / Checklists cluster.

---

## 3. Content grid

```
grid grid-cols-12 gap-[18px] flex-1 min-h-0
grid-template-rows: <row1> 1fr
```

The grid has two layouts, depending on whether the trip has a cover photo.

| | Row 1 height | Countdown | Shared pot |
|---|---|---|---|
| **Has photo** | 300px | `col-span-8` | `col-span-4` |
| **No photo** | 200px | `col-span-6` | `col-span-6` |

Row 2 is always: Route map `col-span-7`, Sort these out `col-span-5`. It fills the remaining height. With no photo, row 1 is shorter, so the map and list get about 100px more.

Every tile fills its grid cell. Nothing is auto-width, and there's no empty space on the right.

---

## 4. Countdown tile (coral)

A card with coral fill (`--accent-primary`), radius 24px, `5px 5px 0` ink shadow, `overflow-hidden`. The whole tile links to Plan.

### Has photo

Padding 24px. Horizontal flex, gap 24px.

**Left column** (flex-1, vertical flex):
- A "PLANNING" chip at the top left: white pill, 2px ink border, eyebrow text, padding 3px 10px.
  - Status values: PLANNING / TRAVELLING / HOME.
- Pinned to the bottom (`mt-auto`), a baseline-aligned row:
  - the number, e.g. **68**: Bricolage 800, 132px, line-height 0.85, letter-spacing −0.06em;
  - "sleeps" on one line and "to go" under it: Bricolage 800, 32px, line-height 1.02, gap 12px.
- The first leg, 16px below: "Fri 4 Dec · Sydney → Denpasar, Bali" (15px, weight 600).

**Right: a polaroid** (the cover photo):
- White frame, 2px ink border, radius 10px, `4px 4px 0` ink shadow.
- Padding 8px on three sides and 30px at the bottom, like a real polaroid.
- 176px wide, `rotate-[4deg]`, vertically centred, 18px right margin.
- **Image:** `aspect-[3/4]`, `object-cover`, 2px ink border, radius 4px. Use `next/image` with `fill` and `sizes="176px"`.
  - The photos are usually iPhone shots or screenshots, so portrait is the default crop. Never add a blurred backdrop.
- A centred "Change" label in the bottom strip (11px bold, muted). It opens the cover uploader (client).
- Respect reduced motion. It's fine to keep the static rotation, but don't animate it.

### No photo

Padding 22px 24px. Vertical flex.

- **Top row** (space-between):
  - the PLANNING chip;
  - a **"+ Add a photo"** pill: 2px *dashed* ink border, 12px bold, padding 4px 10px, `whitespace-nowrap`. It opens the cover uploader.
- **Bottom** (`mt-auto`): the same number row, but smaller:
  - number 96px;
  - "sleeps / to go" 26px, gap 10px.
- The first leg, 12px below (14px, weight 600).
- No placeholder image and no empty slot.

### Content rules

- **Number:** the number of nights until departure. Use "sleep" when it's 1. On the day, show "Today" in place of the number row.
- **While travelling:**
  - status TRAVELLING;
  - the big number is the day of the trip, e.g. "5" with "of 35 / days";
  - the line shows today's stop.
- **First leg:** the day and date of the first transport leg, then origin → first stop. If there's no leg, show just the first stop's name.

---

## 5. Shared pot tile (sun)

Card with sun fill (`--accent-money`), radius 24px, `5px 5px 0` ink shadow. Links to Money.

Money is a **shared pot**. There's no per-person splitting anywhere.

### Has photo (4 columns, vertical)

Padding 22px. Vertical flex.

- "SHARED POT" eyebrow.
- The total planned: **$11.1k** (Bricolage 800, 40px, line-height 1, −0.02em), 6px below the eyebrow.
- "planned so far" (14px, weight 600).
- Progress bar, 14px below:
  - 12px tall, pill shape, white track, 2px ink border;
  - ink fill at the paid %.
- "$4,000 paid · 36%" (13px, weight 600), 6px below the bar.
- Pinned to the bottom (`mt-auto`), with a 2px ink top border and 12px padding above:
  - "NEXT PAYMENT" eyebrow;
  - "$115.20 · Kuta pool villa" (15px, weight 700);
  - "Due Sun 1 Dec" (13px, `--on-accent-muted`).

### No photo (6 columns, two inner columns)

Padding 22px 24px. `grid grid-cols-[1.2fr_1fr] gap-6`.

- **Left column:**
  - eyebrow, total and "planned so far" (as above);
  - then, pinned to the bottom, the progress bar and the paid line.
- **Right column:** 2px ink left border, 22px left padding.
  - "NEXT PAYMENT" eyebrow;
  - **$115.20** (Bricolage 800, 28px), 8px below the eyebrow;
  - "Kuta pool villa" (14px, weight 600);
  - pinned to the bottom, "Due Sun 1 Dec" (13px, `--on-accent-muted`).

### Content rules

- **Money formatting:** abbreviate large totals ($11.1k). Show any amount that isn't abbreviated with 2 decimals ($115.20, never $115.2). Use the trip currency symbol.
- **Nothing costed yet:** show "$0" with "Add your first cost" as a link in place of the paid line. Hide the progress bar.
- **No upcoming payment:** show "Nothing due" in the next-payment area.
- **The progress bar needs** `role="progressbar"`, `aria-valuenow`, and the label "Paid".

---

## 6. Route map tile

Card with white fill, radius 24px, `5px 5px 0` ink shadow, `overflow-hidden`, position relative. The map fills the whole tile. It's a client component.

- **Viewport:** fit bounds to the **current chapter**: the largest group of stops close together (e.g. Europe).
  - Stops outside that group don't widen the map. Each one appears as an **inset card** instead.
- **Tiles:**
  - use the approved map palette file (`lib/map-palette.ts`, or wherever the blessed hexes live);
  - English labels only;
  - `zoomControl: false`, scroll-wheel zoom off. Dragging is fine.
- **Pins:**
  - 30px circles, 2px ink border, `2px 2px 0` ink shadow;
  - the stop number in the middle (12px, weight 800);
  - fill is the stop's chapter colour from the category ramp.
  - At the fitted zoom, pins must not overlap. If two would, nudge them apart or group them into a count pin.
- **Chips, top left** (16px inset, gap 8px). A segmented control that changes the viewport:
  - "Route": white, a label only;
  - "Europe · 10 stops": ink fill, paper text, selected;
  - "Whole trip": white. Fits every stop.
- **Inset card, bottom right** (16px inset), one per outlying stop, stacked:
  - white, 2px ink border, radius 16px, `3px 3px 0` shadow, padding 12px, 190px wide;
  - contents: the pin, the name ("Kuta, Bali", 14px bold), and a line under it ("4 nights · then fly to Europe", 12px, muted);
  - clicking it pans the map to that stop.
- **Attribution, bottom left:** "© OpenStreetMap · CARTO", 11px, weight 600, `--text-muted`. Restyle the default Leaflet attribution. No flag, and no blue links.
- **Clicking a pin** opens that stop's detail.

---

## 7. "Sort these out" tile

Card with white fill, radius 24px, `5px 5px 0` ink shadow, padding 22px. Vertical flex, gap 4px.

- **Header row** (space-between, 6px below):
  - "Sort these out" (`h2`, Bricolage 800, 22px);
  - a count badge: 26px coral pill, 2px ink border, 12px weight 800.
- **Rows:** show at most 4.
  - Each row: flex, gap 14px, padding 10px 0, 2px `--status-neutral` top border.
  - **Tile:** 40px square, radius 12px, 2px ink border, category colour fill, lucide icon.
  - **Middle:** title (15px bold) with a subtitle under it (13px, muted).
  - **Right:** chevron.
  - The whole row is a link.
- **Footer link** (`mt-auto`): "See all in Summary →" (14px bold, ink).

### Row types and tile colours

| Type | Tile | Icon | Example |
|---|---|---|---|
| Transport missing times | sun | `plane` | "Add times to 6 transport legs" / "Nothing booked with times yet" |
| Packing | teal | `list-checks` | "Start your packing list" / "Nothing added yet" |
| Pre-trip to-dos | lilac | `clipboard-list` | "Add pre-trip to-dos" / "Visas, insurance, eSIM" |
| Empty day | pink (`--hue-pink`) | `calendar` | "Plan Sat 12 Dec in Paris" / "Nothing scheduled that day" |
| Reminder due | coral | `bell` | reminder title / "Due Tue 8 Dec" |

### Content rules

- **Order:** reminders due within 7 days first, then transport, then everything else.
- **Dates:** always use `formatDay()`, which gives "Sat 12 Dec". Never show an ISO date.
- **Nothing to do:** replace the rows with a single teal row: "You're all sorted" / "We'll flag anything new here".

---

## 8. Removed from Home

- Reminders stat tile and the full-width Reminders panel. Reminders now show up only as rows in "Sort these out". No tile ever shows a bare "0".
- The standalone cover photo tile and its blurred side fill.
- The separate "Next payment" tile. It's merged into Shared pot.
- The duplicate dates and currency in the countdown tile and the "AUD $" chips.
- The quick-action button cluster.
- The desktop top app bar and the second logo.

---

## 9. Loading, empty and error states

- **Loading:** use the skeleton archetypes.
  - Countdown and Shared pot: tile skeletons at the correct spans for the photo/no-photo layout (you know which from the trip record before the photo loads).
  - Map: a flat `--surface-canvas` fill.
  - "Sort these out": 4 row skeletons.
- **No stops yet:**
  - the countdown shows the number of sleeps if there are dates, otherwise "Pick your dates";
  - the map tile becomes the "Add your first place" empty state;
  - "Sort these out" suggests adding a place.
- **Map fails to load:** use the ErrorPanel (compact) inside the map tile. The rest of the page still renders.

---

## 10. Accessibility

- **Landmarks:** `<nav aria-label="Main">` for the sidebar, `<main>` for the content, and one `h1` (the trip name).
- **Headings:** each tile's heading is an `h2`. The countdown's hidden heading reads "Countdown".
- **Contrast:** all text is ink on coloured fills, meeting 4.5:1.
- **Keyboard:** every interactive element is reachable, including the map chips and inset cards, and shows the global focus ring.
- **Touch targets:** at least 44px (the 42px nav rows get 1px of padding either side of the hit area).
- **Screen reader text:**
  - the countdown number reads as "68 sleeps to go";
  - the progress bar has its label and value;
  - the badge counts have `aria-label`s ("4 things to sort out", "4 unread notifications").
