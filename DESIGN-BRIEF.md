# TEEPEE — Design System & Product Brief

A self-contained handoff for redesigning TEEPEE in Claude Design. It covers what the
product is, the visual system it runs on, its domain model, and the anatomy of every
screen and component — enough to redesign **look *and* layout** with confidence.

> **Read first — two things that shape everything:**
>
> 1. **TEEPEE is heavily design-token driven.** Colour, type, radius, shadow, and
>    spacing live as CSS custom properties consumed by ~20 primitives. So a *reskin*
>    is mostly "new token values," and it cascades to ~140 components for free.
> 2. **But you are not limited to a reskin.** You may redesign **layout, card anatomy,
>    navigation, and component structure**. Those are real rebuilds (not token swaps),
>    so this brief documents the *anatomy* of each surface — the content, data, states
>    and interactions each must keep — so a new layout still holds the real product.
>
> **Deliver in two tiers** (see [§A2](#a2--what-to-deliver-the-two-tiers)):
> **Tier 1 — Foundation** (tokens, type, scales) and **Tier 2 — Structure** (layouts and
> component redesigns, handed back as mockups). Flag which parts are which.

---

## Contents

- **Part A — Foundations:** [A1 Product](#a1--the-product-in-a-paragraph) · [A2 Deliverables](#a2--what-to-deliver-the-two-tiers) · [A3 Tokens](#a3--design-tokens-current-values) · [A4 Type](#a4--typography) · [A5 Layout & shell](#a5--layout-spacing-elevation--the-shell) · [A6 Primitives](#a6--ui-primitive-library) · [A7 Category colours](#a7--category-colour-system) · [A8 Constraints](#a8--hard-constraints)
- **Part B — [Domain model](#part-b--domain-model)**
- **Part C — Screen & component anatomy:** [C1 Shell/nav](#c1--app-shell--navigation) · [C2 Globe & maps](#c2--globe--maps) · [C3 Trips list](#c3--trips-list--new-trip) · [C4 Trip Home / phases](#c4--trip-home-phase-adaptive) · [C5 Itinerary/Plan](#c5--itinerary--plan-editor) · [C6 Day & Calendar](#c6--day--calendar) · [C7 Budget & costs](#c7--budget--costs) · [C8 Wishlist](#c8--wishlist) · [C9 Journal/Files/Checklists](#c9--journal-files-checklists) · [C10 Summary/Compare/Activity/Settings/Share](#c10--summary-compare-activity-settings-share-print) · [C11 Cross-cutting](#c11--cross-cutting-patterns)

---

# Part A — Foundations

## A1 · The product in a paragraph

TEEPEE is a **collaborative trip-planning PWA** — a warm, playful place for (usually) two
people to plan travel together. Two top-level surfaces: a **Globe** (a shared, cross-trip
world map of places you want to go) and **Trips** (each with an itinerary, budget, calendar,
journal, checklists, files, and more). It's **mobile-first** and **installable** (offline,
home-screen icon, safe-area insets), works in **light and dark**, and is co-edited in real
time by trip members. Today's look is "warm & playful": a coral/terracotta primary, a teal
accent, 1rem radii, a serif display font (Fraunces), and soft warm-tinted shadows.

## A2 · What to deliver (the two tiers)

**Architecture, top to bottom:**
```
CSS custom properties        --primary: 12 84% 60%;   (HSL *channels*, no hsl() wrapper)
   ↓  @theme inline (Tailwind v4)   --color-primary: hsl(var(--primary));
Tailwind utilities           bg-primary, text-primary, bg-primary/90   (opacity via "/NN")
   ↓  class-variance-authority + cn()
Component variants           <Button variant="primary">
```

**Tier 1 — Foundation (ports back as edits to `globals.css`):**
- [ ] A value for **every token** in [§A3](#a3--design-tokens-current-values), in **light and dark**.
- [ ] Font choices + the heading/display type scale ([§A4](#a4--typography)).
- [ ] Radius, shadow, and spacing scales ([§A5](#a5--layout-spacing-elevation--the-shell)).
- [ ] A six-hue **category palette**, light + dark ([§A7](#a7--category-colour-system)).
- [ ] A **dark map tile style** (there is none today — a real gap; see [§C2](#c2--globe--maps)).

**Tier 2 — Structure (ports back as component rebuilds):**
- [ ] Redesigned **layouts / card anatomy / navigation** for whichever surfaces you're
      reworking, handed back as **mockups or component designs**, each noting what data it
      shows (use Part C as the checklist of what must survive).
- [ ] Restyle notes for the **primitives** in [§A6](#a6--ui-primitive-library) (fills, borders, states).

**Format rules that keep the port mechanical:**
- Colours as **HSL channel triplets** (`36 40% 97%`), not `hsl(...)`, not hex (give hex too if easier). Raw channels are required so opacity utilities (`bg-primary/10`) work.
- **Every token needs light *and* dark.** Dark is first-class and heavily used.
- Clearly **label Tier-1 vs Tier-2** so we know what's a value change vs a rebuild.

## A3 · Design tokens (current values)

HSL channels (`H S% L%`). "L / D" = light / dark.

### Surfaces & text
| Token | Role | Light | Dark |
|---|---|---|---|
| `--background` | app background | `36 40% 97%` | `24 14% 9%` |
| `--foreground` | default text | `24 14% 15%` | `36 30% 92%` |
| `--card` / `--card-foreground` | raised surface / text | `0 0% 100%` / `24 14% 15%` | `24 12% 13%` / `36 30% 92%` |
| `--popover` / `-foreground` | menus, dialogs | `0 0% 100%` / `24 14% 15%` | `24 12% 13%` / `36 30% 92%` |
| `--muted` / `-foreground` | subtle fill / secondary text | `32 26% 93%` / `28 8% 42%` | `24 10% 18%` / `30 10% 64%` |
| `--border`, `--input` | borders / input borders | `30 20% 87%` | `24 10% 22%` |
| `--ring` | focus ring (a11y-critical) | `12 84% 60%` | `12 84% 63%` |

### Brand & status (each has a matching `-foreground`)
| Token | Role | Light | Dark |
|---|---|---|---|
| `--primary` | **brand / primary actions (coral)** | `12 84% 60%` | `12 84% 63%` |
| `--secondary` | secondary fills/buttons | `32 32% 92%` | `24 10% 26%` |
| `--accent` | accent (teal) | `174 60% 38%` | `174 52% 46%` |
| `--success` | success / confirmed / under-budget | `152 52% 40%` | `152 48% 50%` |
| `--warning` | caution / offline / soon | `35 92% 52%` | `35 90% 60%` |
| `--destructive` | delete / errors | `2 75% 55%` | `2 72% 58%` |
| `--over` | **budget over-spend** (louder than destructive) | `350 78% 50%` | `350 80% 62%` |

`--primary-foreground` is white in light / near-dark in dark; other `-foreground`s follow suit.

### Shape & elevation
| Token | Role | Value |
|---|---|---|
| `--radius` | base radius (drives the scale) | `1rem` |
| `--radius-lg / -md / -sm` | `= radius` / `radius−0.35rem` / `radius−0.6rem` | `1rem / 0.65rem / 0.4rem` |
| `--shadow-soft` | default card shadow (warm-tinted) | `0 1px 2px …/.04, 0 4px 12px …/.06` |
| `--shadow-soft-lg` | raised/floating | `0 2px 6px …/.06, 0 12px 32px …/.10` |

Shadows are warm-tinted (`hsl(24 30% 20% / …)`) in light, near-black + deeper in dark.

## A4 · Typography

- **Display / headings:** **Fraunces** (variable serif, optical sizing) → `--font-display`; used by `h1`–`h4` and `.text-display` (hero titles).
- **Body / UI:** **Plus Jakarta Sans** → `--font-sans`; body `line-height: 1.6`.

Current heading scale (weight 600, tight negative tracking, `text-wrap: balance`):

| Element | Size (clamp) | LH | Tracking |
|---|---|---|---|
| `.text-display` | `2.5→4rem` | 1.05 | −0.02em |
| `h1` | `2→2.75rem` | 1.1 | −0.02em |
| `h2` | `1.5→2rem` | 1.2 | −0.015em |
| `h3` | `1.25→1.5rem` | 1.3 | −0.01em |
| `h4` | `1.125rem` | 1.4 | — |

Swapping fonts is fair game (nominate a display + a UI face; say if body should be serif).

## A5 · Layout, spacing, elevation & the shell

- **Content column:** centered, `max-width: 64rem` (`max-w-5xl`), padding `1rem`→`1.5rem` (≥sm).
- **Spacing:** Tailwind 4px scale; sections typically `gap-3`/`gap-6`.
- **Radii in use:** controls `rounded-md`; sections `rounded-lg`; cards `rounded-xl`→`rounded-2xl`; large/empty containers `rounded-2xl`. (Card radius isn't perfectly uniform today — a redesign can standardise it.)
- **Icon buttons:** standard `size-8` (32px), expanding to a 44px touch target on coarse pointers.
- **Top bar** (`app/(app)/layout.tsx`): sticky, `h-14`, translucent (`bg-background/60` + backdrop-blur), bottom border. Holds the 🛖 **TEEPEE** wordmark (Space Grotesk), a command-palette trigger (⌘K), a Globe link, the light/dark toggle, and an avatar dropdown (profile, help, sign out).
- **Trip shell** adds a trip header (title + date range + currency badge + member avatar stack + fork switcher + notification bell), a horizontal **TripNav** (desktop) and a **fixed bottom tab bar** (mobile; content pads for it + safe-area). Full detail in [§C1](#c1--app-shell--navigation).

## A6 · UI primitive library

Radix UI + class-variance-authority + lucide-react icons + subtle Framer Motion. Restyling
these ~20 covers ~140 feature components. Give fills / text / border / radius / shadow +
hover/active/focus/disabled for each.

**Actions & indicators**
- **Button** — variants `primary` · `secondary` · `ghost` · `outline` · `destructive`; sizes `sm` (h-9) · `md` (h-11, default) · `lg` (h-12) · `icon` (44²). `rounded-md`, focus ring, `active:scale-.98`, built-in loading spinner.
- **Badge** — `default` (primary) · `secondary` · `outline` · `accent` · `success` · `warning` · `destructive` · `muted`. `rounded-full`, `text-xs`.

**Surfaces & overlays**
- **Card** (`Card/Header/Title/Description/Content/Footer`, `rounded-2xl border shadow-soft`), **Dialog** (Radix; bottom-sheet on mobile / centered on desktop; `bare` & `hideClose` opts), **Sheet** (side/bottom drawer), **Popover**, **DropdownMenu** (items, checkbox/radio items, submenus), **Toast/Toaster/UndoToast**, **Skeleton** (`animate-pulse`), **EmptyState** (dashed card + icon + title + desc + action).

**Inputs & forms**
- **Input**, **Textarea**, **Select** (Radix), **Label**, **Field** (label + description + error wiring, `aria-invalid`), **DateField** (native date), **MoneyInput** (amount + currency select → `{amountMinor,currency}`), **Segmented** (Radix toggle-group), **Tabs**, **Avatar** (image + initials fallback).

**Composed (styled from the above, seen everywhere)**
- **FormDialog** (dialog shell that remounts on `recordId` to reset form state), **ConfirmDialog** (+ `useConfirm`), **RowActions** (edit ✏️ / delete 🗑 ghost icon pair), **SectionHeader** (icon + title + count + action slot), **AnimatedList/AnimatedItem** (staggered enter, reorder), **AnimatedNumber** (count-up), **PageTransition**, **ThemeToggle**.

## A7 · Category colour system

Trip items are colour-coded by **category**, using Tailwind's *named palette* (independent of
brand tokens). Provide six equivalents that stay distinct as a filled pill **and** an 8px dot,
in light + dark.

| Category | Label | Named hue | Map dot hex |
|---|---|---|---|
| `SIGHTSEEING` | Sightseeing | sky | `#0ea5e9` |
| `FOOD` | Food & Drink | amber | `#f59e0b` |
| `ACTIVITY` | Activity | emerald | `#10b981` |
| `NIGHTLIFE` | Nightlife | violet | `#8b5cf6` |
| `SHOPPING` | Shopping | rose | `#f43f5e` |
| `OTHER` | Other | stone | `#78716c` |

Pills today: `bg-{hue}-100 text-{hue}-700 border-{hue}-200` (light) / `-950 / -300 / -800` (dark).
Map markers use the flat hexes above.

## A8 · Hard constraints

1. **Light AND dark, both fully designed.** Every token needs both.
2. **Mobile-first PWA.** Phone-first; safe-area insets; the mobile bottom tab bar is a fixture on trip pages; must work installed/offline (read-only when offline).
3. **Leaflet maps are their own layer.** Tiles/markers/popups/routes are *not* token-driven and need explicit treatment — **including a dark tile style** (none exists today). Maps: Globe, Route (summary), Day, Wishlist. See [§C2](#c2--globe--maps).
4. **Accessibility.** Visible focus ring via `--ring` (keep high-contrast vs `--background`); WCAG AA text contrast (the `warning` badge already skirts it); honour `prefers-reduced-motion` (animations are gated).
5. **Money & status colours are semantic:** under-budget uses `success`/emerald, over-budget uses `--over` (rose, *not* `destructive`), caution uses `warning`. Amounts are right-aligned `tabular-nums`.

---

# Part B — Domain model

What the nouns are and how they nest — so any redesigned layout still presents the right data.
(Terminology is strict; mirror it in labels.)

- **Trip** — one named travel project; may be **date-less** early on. Has a **Home currency**, an optional **Home base** (origin/return point, shown as bookend cards), an optional **Hard end date** (a ceiling) vs the computed **soft/projected end**, and a **cover image** (photo → stylised route-render → monogram fallback).
- **Phase** (derived, never stored): **Sketching** (date-less ideas) → **Planning** → **Final prep** (imminent) → **Travelling** → **Past**. Drives what the **Home** screen leads with.
- **Plan** — the itinerary *arrangement*. A Trip has one **real plan** (what all dated views/summary/sharing follow) + zero-or-more **Forks** (what-if variant plans, compared then one **Promoted**). Trip-wide things (Wishlist, Checklists, Journal, Notes, rates, home base, cover, members) are shared across all plans.
- **Stop** — a place you're based for a stretch; **rough** (place + rough nights, no dates) or **scheduled** (arrive/depart dates); can be **Pinned** (fixed). **Firm up** flows dates forward from an anchor. Ordered sequence; drag-reorder re-flows dates.
- **Chapter** — a named, coloured date-range grouping a run of Stops (e.g. "Italy"); optional, non-overlapping; itinerary/budget/summary roll up per chapter.
- **Transport** — a movement between two Stops (or Home base): mode, places, times, reference, cost. **Accommodation** — a stay attached to a Stop: dates, address, confirmation, cost.
- **Item** — a thing to do/see on the **Timeline**. Three forms: **Wishlist idea** (trip-wide, unscheduled), **thing-to-do** (attached to a Stop, no day yet), **scheduled** (has date/time). Carries a **Category**, optional cost/location/link/booking. Scheduling a wishlist idea places a *copy* on the plan.
- **Wishlist** (trip-scoped) vs **Globe/Marker** (account-level, cross-trip world map). A trip seeds its Wishlist from Globe Markers (a copy); the board suggests Markers near the trip's Stops. **Vote** = a traveller's interest mark (must/keen/meh) on a Wishlist idea.
- **Money:** **Cost** (estimated always + optional actual, in its own currency, converted via **Exchange rate**), **Other cost** (standalone), **Budget** (read-only roll-up by category/stop/chapter/day), **Spend so far** (cash-flow lens: paid vs estimated).
- **Summary** raises **Flags** (auto-detected fixable problems: missing accommodation/transport, over hard-end-date, packed/spread days, etc.). **Next steps** = Flags + forward nudges, shown on Home.
- **Supporting:** **Make it fit** (trim/drop to meet hard end date), **Day map** (one day's route), **Today view** (the Travelling Home), **Checklist** (pre-trip + packing templates), **Attachment** (files on entities), **Note** (comments), **Activity** (change log → notifications bell), **Calendar feed** (read-only ICS), **Duplicate** (clone structure into a new trip), **Traveller/Invite** (membership by email-match), public **share link**.

---

# Part C — Screen & component anatomy

Compact per-surface reference: **what it shows · data it must present · states · interactions · responsive · primitives used.** Use this as the checklist of what any redesign must still carry.

## C1 · App shell & navigation

**Top bar** (`app/(app)/layout.tsx`) — sticky, translucent, `max-w-5xl`. Left: 🛖 TEEPEE wordmark. Right: ⌘K command-palette trigger, Globe link, ThemeToggle, avatar dropdown (name/email, help, sign out).

**Trip header + shell** (`trips/[tripId]/layout.tsx`) — Trip name (h1, display), date range (or "No dates yet"), currency **Badge** (mono), member **Avatar** stack (`-space-x-2`, "+N" overflow), **ForkSwitcher** (hidden when travelling/past), **NotificationBell**. Content area pads bottom for the mobile tab bar + safe-area.

**TripNav** (desktop, `hidden md:flex`) — horizontal, scrollable tab row with an active **underline** (primary). Primary tabs: Home · Plan · Calendar · Budget · Summary. **NavMoreMenu** dropdown holds Wishlist · Journal · Checklists · Files · Activity · Settings.

**MobileTabBar** (`md:hidden`) — fixed bottom, `bg-background/95` + blur, safe-area inset. Four icon tabs (Home/Plan/Calendar/Budget) + a **More** button opening a bottom **Sheet** with the rest. Active tab = primary colour.

**ForkSwitcher** — outline button (GitBranch + active plan label + chevron) → dropdown listing the real plan + forks, each with rename/duplicate/discard icons; "New variant" (disabled at ~4-fork cap) and "Compare plans". Uses rename/discard/create **Dialogs**. Sets `?plan=<forkId>`.

**VariantBanner** — amber banner shown when editing a fork: "Editing variant "X" — not live…" + "Switch to real plan" / "Compare".

**NotificationBell** — bell + count badge (caps at "9+"). Dropdown: "Notifications" + "Mark all read", a scrollable recent-activity list (actor · headline · relative time), and "See all activity".

**Command palette** (⌘K) — a `bare` Dialog: search input + grouped results (**Go to** pages, **Do** actions like New trip / Add item / Toggle theme, **Find** fuzzy search over stops/items/transport). Keyboard-driven; Find disabled offline.

## C2 · Globe & maps

**Globe** (`/globe`) — cross-trip world map of **Markers**. Shows: title + hint, a Leaflet map (`h-56`→`sm:h-[440px]`), **MarkerFilters** (search + category + country), and a **MarkerList** grouped by country (row = category dot + title + `city · category · timing` + attachment popover + edit/delete). Top actions: "Add Marker", "Share" (globe invite). *Data:* markers (title, category, note, link, timing, lat/lng, city, country), members, attachments-by-marker. *States:* empty ("No markers yet"), editing/deleting/sharing dialogs. *Interactions:* tap map to drop a pin (reverse-geocode), click marker → fly + popup (edit/delete), live filter, share by email.

**GlobeMap** — OSM tiles; markers are category-coloured **divIcon circles** (24px, white border, shadow; selected 34px). Popup = title + 📎 count + Edit/Delete. Fits bounds (else whole-world). Click background → drop-pin; select → fly (0.6s).

**MarkerForm** (in FormDialog) — place search (+ candidate list), resolved "City, Country", title (req), category **Select**, "when", link, note, and **Attachments** (edit-mode only). Delete (edit only).

**Other map surfaces:** **Route map** (Summary — numbered stop pins, chapter-coloured dashed polylines, home bookends, fallback list if <2 coords), **Day map** (numbered items + accommodation "H" + transport "T", dashed route, external "Open in Maps"/directions links), **Wishlist map** (category-coloured item pins, selection syncs to board).

**Shared map notes for redesign:** all maps are dynamic-imported (never SSR'd) via a `createMapLoader` factory; markers/popups are hand-built HTML (not Leaflet defaults). **No dark tile style exists** — pick a provider (e.g. Carto Positron/Dark Matter) + confirm attribution. Provide marker assets/states, popup styling, and container heights per surface. `.leaflet-container { isolation: isolate }` keeps maps below `z-50` dialogs — preserve that.

## C3 · Trips list & New trip

**Trips list** (`/trips`) — responsive card grid (1/2/3 cols), sorted by phase. **TripCard**: cover image (photo → route-render SVG → monogram), a **phase badge** top-left ("Planning · In 26 days" / "Day 5 of 11"), an **unread count** badge top-right (primary), trip name, date range (or "No dates yet"), stop-count badge, and a hover ⋯ menu ("Duplicate"). Empty state with "New trip" CTA.

**TripCover** — decision tree: uploaded photo → stylised **route-render** SVG (dashed path through located stops, `secondary`/`primary`) → **monogram** (gradient + first letter).

**New trip** (`/trips/new`) — form: name (req), optional home base (geocoded search), start/end dates, home currency. Leaving dates blank starts the trip in **Sketching**.

## C4 · Trip Home (phase-adaptive)

`trips/[tripId]/page.tsx` renders a **cover** + one of four phase dashboards:

- **Sketching** — "Let's shape this trip" empty state, or a "shape so far" card (rough stops list with country + nights + chapter chips) + "Set dates / firm up" + quick actions (Add a place, Wishlist).
- **Planning / Final-prep** — **CountdownHero** (phase + countdown + date range; final-prep turns urgent/amber), **NextStepsCard** (ranked Flags + nudges, each icon + title + chevron; "You're all set" empty), **BudgetGlance** (total + link), **RouteMap**, and phase-specific **QuickActions**.
- **Travelling** (the **Today view**) — "Today" + long date + "Day N of M" + chapter chip (with out-of-trip notices); "Where you are" card (location + map link); compact **SpendSoFarCard**; "Next departure" **TransportCountdown**; today's **Timeline**; collapsible **DayMapPanel**; **NearbyWishlist**; "Tonight's stay"; **RemindersCard**.
- **Past** — "That's a wrap" (stops, nights, total spent) + full SpendSoFar + **RouteMap** + CTAs ("Write journal", "Plan another trip").

## C5 · Itinerary / Plan editor

**Plan editor** (`/plan`, `ItineraryManager`) — the product core. Shows: a **firm-up toolbar** (amber, when rough stops exist), a **HomeBaseCard** bookend (top), a stop list grouped by **Chapter** (collapsible headers with chip + date range + drag handle + actions), and a return HomeBaseCard bookend. Between consecutive stops sit **TransportCard**s (cross-chapter legs render on the seam); under each dated stop sit **AccommodationCard**s and inline **things-to-do**. Plus an "other transports" section and **PlanOverview**. *Interactions:* add/edit/delete stops, transport, accommodation, chapters; **drag-reorder** (dnd-kit; re-flows dates with an **undo toast**); pin / make-rough / adjust-dates; firm-up (chapter or whole trip); "start chapter here". Notes/attachments via popover (desktop) or bottom-sheet (mobile).

**StopCard** — name + country + map link; rough → "~N nights" dashed pill; scheduled → date range + timezone + nights. Notes preview; things-to-do list (title + edit; "Add Thing to Do"). Actions differ rough vs scheduled (chapter / pin / clear-dates / edit / notes / attach / delete; overflow menu on mobile). Draggable handle.

**StopFormDialog** — mode **Segmented** (Rough ↔ Scheduled); name (req), country (auto-guesses timezone), then nights + chapter (rough) *or* timezone + arrive/depart (scheduled, constrained to trip window); notes; attachments (after save).

**ItemCard** — title, stop link, category pill, time range, address/link/booking, notes snippet; **wishlist mode** adds VoteControl + notes/attachments + Schedule button; **scheduled mode** adds Unschedule. Inline **CostEditor** when costs present.

**ItemFormDialog** — title (req), interactive category pills, stop picker (things-to-do), optional date (unset = unscheduled) + start/end times, address/link/booking, notes, **InlineCostFields**, attachments.

**ScheduleItemDialog** — "Pick a date for X" + optional times → places a copy on the timeline (leaves the wishlist idea intact).

**QuickAddStops** — inline row: place name + nights + Add; clears & refocuses for rapid entry.

**Chapters** — `ChaptersManager` (list + add/edit/delete + "Suggest from countries"), **ChapterChip** (coloured pill), **ChapterFormDialog** (name, 7-colour swatch picker, optional dates).

**TransportCard / FormDialog** — mode icon + label + reference, From → To (stops or 🏠 Home), dep/arr datetime in stop timezones (+ multi-day notice), drive estimate, notes, cost. Form: mode/stops/places/times/reference/notes/inline cost.

**AccommodationCard / FormDialog** — name + address + map link, date range + nights, confirmation, notes, soft date warnings, cost. Form constrains check-in/out to the stop's dates.

**HomeBaseCard** — bookend (origin/return) with Home icon + name + country badge; links to settings. **TransportCountdown** — live "Departing in Xh Ym" card. **MakeItFit** — dialog with side-by-side **Trim nights** (per-stop spinners + live "ends… / fits ✓") and **Drop stop** (per-candidate preview). **HardEndDateControl** — inline set/edit/clear.

## C6 · Day & Calendar

**Day view** (`/day/[date]`) — day header (long date + stop + timezone), **DayNav** (prev/next + "Day N of M" + back-to-calendar), **WeatherDaylightCard** (temp range + condition + sunrise/sunset/day-length, polar-aware), **DayMapPanel** (collapsible), **NearbyWishlist**, **DayFeasibility** (advisory badges), the detailed **Timeline**, quick "Add to this day", and the **JournalEditor**.

**Timeline** (`variant="day"|"agenda"`) — chronological rows: accommodation check-in/out (emerald), transport (mode icon, From→To, times, multi-day notice), timed items (time gutter + range + category pill + address/link/booking + directions), untimed items (dot). Agenda variant is denser.

**AgendaView** — one collapsible Timeline section per day; "Today" highlighted (`bg-primary/5`), "Travel day" badge; day headers link to the Day view.

**Calendar** (`/calendar`, `CalendarViews`) — **Segmented** Month ↔ Agenda toggle (persisted; month default desktop, agenda default mobile). Month view: prev/next nav + **MonthGrid** + a **wishlist rail** (draggable pills → drop on a day to schedule via ScheduleItemDialog). **MonthGrid** — 7-col grid; active cells show date, transport/accommodation icons, packed-day dot, stop name/country (left-border colour per stop), item-count pill; drag-over highlights; cells link to the Day view. Horizontal-scroll on mobile.

## C7 · Budget & costs

**Budget** (`/budget`) — **grand-total hero** (estimated vs spent, trend icon), **SpendSoFarCard** (estimated / paid / variance badge / remaining / % elapsed), then roll-ups **By Category** (row + % + progress bar + est/actual), **By Destination**, **By Chapter** (chapter chips + Ungrouped/Between-legs/Other reconciliation), **Day by day**. Plus an **Exchange Rates** section (**RatesPanel**) and **Other Costs** (**OtherCostEditor**). Amber banner when rates are missing. Empty states for no-dates / no-costs.

- **CostEditor** (entity-level) — animated list of costs (**CostSummary**: est + home-equiv + actual + paid ✓) with edit/delete; "Add Cost" → dialog (MoneyInput est/actual + date paid).
- **CostAmounts** — the standard est/actual pair (tabular-nums; actual green when >0, muted dash when 0).
- **OtherCostEditor** — standalone costs (insurance, visas, eSIM…): label + category + est→actual; empty state + dialog.
- **InlineCostFields** — the est + currency + actual + paid-date trio embedded in entity forms; hidden when >1 cost exists (CostEditor takes over).
- **SpendSoFarCard** — full or compact; variance badge uses `--over`/emerald with trend icons.
- **RatesPanel** — per foreign currency: pair (mono) + source badge (**Manual** violet / **Live** emerald / **Stale** amber / **No rate** muted) + rate + set/lock/unlock inline form + "Refresh all".
- **AnimatedMoney** — count-up wrapper for big totals.

## C8 · Wishlist

**Wishlist** (`/wishlist`, `WishlistBoard`) — trip-wide ideas grouped by Stop (or "Anywhere"); **Segmented** List ↔ Map toggle. List: **ItemCard** (wishlist mode) with **VoteControl**, notes, schedule/unschedule. Map: **WishlistMap** + stop-filter chips. **GlobeSuggestionsStrip** (country-matched Markers, capped 5 + "+N more"). "Add item" and "Add from Globe" (**AddFromGlobeDialog**). Empty state.

**VoteControl** — a **Segmented** must 🔥 / keen 👍 / meh 🤷 for the current user (click active to clear; spring-animated), plus partner votes as avatar + coloured chip (must=warning, keen=accent, meh=muted).

## C9 · Journal, Files, Checklists

**Journal** (`/journal`, `JournalEditor`) — date-headed sections (link to Day view); per date an entry card (title/body/author + relative time) + a photo grid; editor = textarea (autosave on blur, char count /5000, last-edited-by) + photo upload strip (hover-delete).

**Files** (`/files`) — attachments grouped by entity type (Trip/Stops/Activities/Transport/Accommodation/Journal/Markers). Row = colour-coded mime icon + filename + type badge + size + open + delete. Dashed upload control. A **compact** variant is reused inside cards/popovers.

**Checklists** (`/checklists`) — **Tabs**: Pre-trip · Packing · Booking parser. Items = checkbox + text (strikethrough when done) + (pre-trip) due-date badge (normal/soon-amber/overdue-red) + assignee avatar; inline add row; drag-reorder. Packing adds a **templates bar** (apply/save template).

## C10 · Summary, Compare, Activity, Settings, Share, Print

**Summary** (`/summary`) — read-only: **PlanOverview** (stops/nights/date span/hard-end status), interactive **RouteMap**, **FlagList** (severity icon + description + action link), **CostSummary** totals + by category/stop/day, and per-stop breakdown (accommodation/transport/items). **MakeItFit** appears when projected end > hard end.

**Compare** (`/compare`, `CompareTable`) — real plan vs forks side-by-side (desktop: sticky-left scroll table; mobile: stacked cards). Rows: Route (with **diff** — added/dropped/reordered/re-nighted, colour-coded), Projected end + hard-end badge, Budget, Flags, Stops, Nights, Transit, Driving, Flights. Fork columns show **delta badges** (emerald + / rose −). Reorder arrows + **Promote** per fork.

**Activity** (`/activity`, `ActivityFeed`) — chronological (newest first): actor avatar + name + verb/entity headline + relative time; UPDATED rows show field old→new; NOTED rows show an excerpt. Marks all read on view.

**Settings** (`/settings`) — `max-w-2xl` **Card** sections: trip details (name/dates/hard-end/currency), cover upload, invite panel (email → pending → member list), share link (copy/revoke), calendar feed (copy/revoke), driving estimates, **ChaptersManager**, and a **danger zone** (duplicate / delete, confirmed).

**Share** (`/share/[token]`) — public, no-auth, read-only: trip name + dates + RouteMap + day-by-day agenda (accommodation/transport/items). **No costs, notes, confirmations, or links.** **Print** (`/print`) — printer-friendly itinerary **with** costs; A4 layout; print button hidden in print media.

## C11 · Cross-cutting patterns

- **Form + dialog:** `FormDialog` (remounts on `recordId` to reset) wraps a form using `useEntityForm` → server action → `ActionResult`; **Field** shows label + description, routes errors to the field (`aria-invalid`) with form-level errors as a toast. Submit disabled while pending.
- **Toasts & undo:** success/error toasts; destructive actions emit an **UndoToast** ("… deleted · Undo"). Swipe-to-dismiss on mobile.
- **Empty / loading:** `Skeleton` shapes while loading → `EmptyState` (icon + title + description + optional action) when empty → content.
- **Offline / PWA:** an amber offline banner (`useOnlineStatus`), a service worker caching visited trip pages for read-only offline use, and a push-notification opt-in (**EnableNotifications**).
- **AI features:** violet-accented (distinct from primary) `AiSuggestButton` ("✨ …"), per-stop **AiActivitySuggestions**, **AiBookingParser** (in Checklists), **AiPackingSuggestions** — collapsible panels, disabled with helper text when unconfigured.

---

## Deliverables recap

Design both modes, mind the map surfaces + mobile shell, and hand back **(Tier 1)** a full
token/type/scale/category sheet and **(Tier 2)** layout/component mockups for the surfaces you
restructure — each noting what data it presents (Part C is the checklist). Label every piece
Tier 1 (value change) or Tier 2 (rebuild) so the port is predictable.
