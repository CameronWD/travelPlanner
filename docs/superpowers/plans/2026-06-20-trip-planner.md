# Trip Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A collaborative, mobile-first web app for two partners to plan any holiday — scope stops, build a day-by-day itinerary, track multi-currency costs, and get an auto-flagged trip summary.

**Architecture:** A single Next.js (App Router, TypeScript) app serving UI + API (server actions / route handlers), backed by Prisma. Local dev uses SQLite (zero provisioning); production swaps to Postgres via `DATABASE_URL` + provider. Auth.js handles Google sign-in with a dev-only credentials shim so the app runs locally without real OAuth. Pure domain logic (money conversion, budget roll-ups, date/timezone math, summary flags) lives in framework-free modules under `lib/` and is the focus of TDD. A deliberate design system (tokens + typography + Radix-based primitives, themed warm & playful) underpins all UI.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Radix UI primitives + class-variance-authority (shadcn-style) · Prisma (SQLite dev / Postgres prod) · Auth.js (NextAuth v5, Google) · Zod · Vitest + @testing-library/react · Leaflet + OpenStreetMap (route map) · Frankfurter API (FX, no key) · next/font (Fraunces + Plus Jakarta Sans).

---

## Conventions (apply to every task)

- **TDD.** For pure logic in `lib/` and `server/`, write the failing Vitest test first, watch it fail, implement minimally, watch it pass, commit. For UI, write a focused component test for behaviour (not snapshots) where it adds value; visual polish is verified by running the app.
- **DRY / YAGNI.** Reuse design-system primitives and `lib/` helpers; don't build features beyond this plan.
- **Frequent commits.** One commit per task (or per red→green cycle). Conventional Commits. Co-author trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Server actions** for mutations (typed, Zod-validated). Reads via server components. Sync = `router.refresh()` + refetch-on-focus (no socket).
- **Money is integer minor units** (cents) + ISO currency code — never floats.
- **All entity access is authorization-checked**: a Traveller may only read/write Trips they own or are invited to. Centralise in `server/guards.ts`.
- **Dates**: store calendar dates as `YYYY-MM-DD` strings; store times with the Stop's IANA timezone; persist instants as UTC. Helpers in `lib/dates.ts` / `lib/tz.ts`.
- **No secrets in code.** Everything external via env; `.env.example` documents each var.

## File Structure (created across the plan)

```
app/
  layout.tsx                       # root: fonts, theme provider, <html>
  globals.css                      # Tailwind v4 + design tokens (CSS vars)
  page.tsx                         # redirect → /trips or /signin
  signin/page.tsx                  # Google + dev sign-in
  api/auth/[...nextauth]/route.ts  # Auth.js handler
  api/fx/route.ts                  # cached FX rate proxy (Frankfurter)
  api/uploads/route.ts             # file upload (dev: local disk)
  (app)/
    layout.tsx                     # authed shell (top bar, traveller menu, theme toggle)
    trips/
      page.tsx                     # trips list
      new/page.tsx                 # create trip
      [tripId]/
        layout.tsx                 # trip nav (overview/calendar/today/wishlist/budget/summary/checklists/files/settings)
        page.tsx                   # Overview: stops + route map + per-stop cost
        calendar/page.tsx          # agenda by day
        day/[date]/page.tsx        # single day timeline
        today/page.tsx             # focused "today" view
        wishlist/page.tsx          # wishlist board + voting
        budget/page.tsx            # budget roll-up
        summary/page.tsx           # summary + flags
        checklists/page.tsx        # pre-trip + packing
        files/page.tsx             # attachments
        settings/page.tsx          # currency, rates, invite, theme, danger zone
components/
  ui/                              # design-system primitives (button, card, input, select,
                                   #   dialog, sheet, tabs, badge, toast, dropdown, avatar,
                                   #   field, money-input, date-field, empty-state, skeleton)
  trip/                            # domain components (stop-card, transport-card,
                                   #   accommodation-card, item-card, timeline, wishlist-board,
                                   #   budget-table, route-map, flag-list, checklist, vote-control,
                                   #   note-thread, attachment-list, day-nav, category-pill)
lib/
  db.ts  auth.ts  guards.ts  money.ts  fx.ts  dates.ts  tz.ts  flags.ts
  storage.ts  categories.ts  cn.ts  validations/*.ts
server/actions/                    # trips, stops, transport, accommodation, items, costs,
                                   #   notes, votes, checklists, attachments, settings
prisma/schema.prisma  prisma/seed.ts
public/manifest.webmanifest  public/icons/*  public/sw.js
test/                              # vitest setup + unit tests colocated as *.test.ts(x)
```

---

# PHASE 0 — Foundation & Design System

Produces: a themed, authenticated shell where a Traveller signs in, sees their trips, and creates a trip. Establishes the design language used everywhere.

### Task 0.1: Scaffold Next.js + tooling

**Files:** `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `test/setup.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.env.example`

- [ ] Init Next.js 15 (App Router, TS, Tailwind v4, ESLint) in `/work` (non-interactive: `npx create-next-app@latest . --ts --app --tailwind --eslint --src-dir=false --import-alias "@/*" --no-turbopack`). If the dir is non-empty, scaffold in a temp dir and merge, preserving `CONTEXT.md`, `SPEC.md`, `docs/`, `.git`, `.gitignore`.
- [ ] Add deps: `prisma @prisma/client next-auth@beta @auth/prisma-adapter zod class-variance-authority clsx tailwind-merge lucide-react @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs @radix-ui/react-select @radix-ui/react-popover @radix-ui/react-toast @radix-ui/react-avatar leaflet`. Dev: `vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom @types/leaflet`.
- [ ] Configure Vitest (jsdom env, `@/` alias, `test/setup.ts` importing `@testing-library/jest-dom`). Add `"test": "vitest run"`, `"test:watch": "vitest"`.
- [ ] `.env.example` with `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `NEXT_PUBLIC_APP_NAME`, `ALLOW_DEV_LOGIN`.
- [ ] **Test (sanity):** `lib/cn.ts` exports `cn(...classes)` merging via `clsx` + `tailwind-merge`; test `cn('p-2', 'p-4') === 'p-4'`. Red → green → commit.

### Task 0.2: Design tokens & typography

**Files:** `app/globals.css`, `app/layout.tsx`, `tailwind` theme via CSS vars, `components/ui/theme-provider.tsx`, `components/ui/theme-toggle.tsx`

- [ ] Load fonts with `next/font/google`: **Fraunces** (display, weights 400–600, optical) as `--font-display`; **Plus Jakarta Sans** (UI/body) as `--font-sans`. Wire both CSS vars on `<html>`.
- [ ] Define a **warm & playful** token set in `globals.css` as CSS variables for light + dark (`.dark`): background, surface/card, foreground, muted, border, ring, and brand ramps — **primary = warm coral/terracotta**, **accent = teal**, plus semantic success/warning/danger. Generous radii (`--radius: 1rem`), soft shadows. Map tokens into Tailwind v4 `@theme`.
- [ ] Type scale: display (Fraunces) for h1/h2 hero/section titles; body in Plus Jakarta Sans; define `.text-display`, heading sizes, and a sensible modular scale. Set base line-heights and tracking.
- [ ] Theme provider (class strategy, respects system, persists choice) + accessible theme toggle. **Test:** toggle updates `document.documentElement` class; default follows `prefers-color-scheme`.

### Task 0.3: UI primitives (design system)

**Files:** `components/ui/{button,card,input,field,label,select,dialog,sheet,tabs,badge,dropdown-menu,toast,toaster,avatar,empty-state,skeleton,money-input,date-field,segmented}.tsx`

- [ ] Build each primitive with `cva` variants, themed to the tokens, fully keyboard-accessible (Radix where interactive). `Button` (variants: primary/secondary/ghost/destructive/outline; sizes sm/md/lg/icon; loading state). `Card` (rounded-2xl, soft shadow, header/title/description/content/footer). `Field`/`Input`/`Label` with error text. `Select`, `Dialog`, `Sheet` (mobile bottom-sheet), `Tabs`, `Badge`, `DropdownMenu`, `Toast`+`Toaster`, `Avatar`, `EmptyState`, `Skeleton`, `Segmented` control.
- [ ] `MoneyInput` (amount + currency picker; emits minor units + code). `DateField` (native-friendly date input, themed).
- [ ] **Tests:** `Button` renders variant classes + shows spinner + disables when `loading`; `Dialog` opens/closes via trigger and traps focus; `MoneyInput` emits correct minor-unit value for "12.50". Red → green per component group → commit.

### Task 0.4: Prisma schema + db client + seed

**Files:** `prisma/schema.prisma`, `lib/db.ts`, `prisma/seed.ts`, `.env`

- [ ] Schema (SQLite dev). Models — keep Postgres-compatible types:
  - `User` (Auth.js: id, name, email, image) + Auth.js `Account`,`Session`,`VerificationToken`.
  - `Trip` (id, name, startDate, endDate (date strings), homeCurrency, createdById, timestamps).
  - `TripMember` (tripId, userId, role: owner|member) — join for sharing; unique (tripId,userId).
  - `Invite` (tripId, email, token, acceptedAt) for inviting a partner by email.
  - `Stop` (id, tripId, name, country, lat?, lng?, timezone, arriveDate, departDate, sortOrder, notes?).
  - `Transport` (id, tripId, fromStopId?, toStopId?, mode enum, depPlace, depAt (instant), arrPlace, arrAt, reference?, notes?).
  - `Accommodation` (id, tripId, stopId, name, address?, checkIn (date), checkOut (date), confirmation?, notes?, lat?, lng?).
  - `Item` (id, tripId, stopId?, title, category enum, date? (date), startTime?, endTime?, lat?, lng?, address?, link?, booking?, notes?, sortOrder, scheduled boolean derived from date).
  - `Cost` (id, tripId, amountMinor int, currency, estimatedMinor int, actualMinor int?, rateToHome float?, paidAt?, ownerType enum {TRANSPORT,ACCOMMODATION,ITEM,OTHER}, ownerId?, label? (for OTHER), category?).
  - `ExchangeRate` (tripId, base, quote, rate, fetchedAt, manual boolean) unique (tripId,base,quote).
  - `Note` (id, tripId, authorId, targetType, targetId, body, createdAt).
  - `Vote` (id, tripId, itemId, userId, level enum {MUST,KEEN,MEH}) unique (tripId,itemId,userId).
  - `ChecklistItem` (id, tripId, kind enum {PRETRIP,PACKING}, text, done, dueDate?, sortOrder, assignedToId?).
  - `Attachment` (id, tripId, targetType, targetId?, filename, mime, size, url, uploadedById, createdAt).
  - `PackingTemplate` (id, ownerId, name, itemsJson).
  - `Reminder` (id, tripId, title, fireAt, sent boolean, targetType?, targetId?).
- [ ] `lib/db.ts` singleton Prisma client (avoid hot-reload leaks).
- [ ] `prisma/seed.ts`: two demo users (you + partner), one "Europe Summer 2026" trip with 3 stops (London→Paris→Rome), transport, accommodation, a few items + wishlist, sample costs, home currency AUD. Used for local running/screenshots.
- [ ] Run `prisma migrate dev`; **test** `lib/categories.ts` (the Item category list + colors) round-trips. Commit.

### Task 0.5: Auth.js (Google + dev shim) & guards

**Files:** `lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/signin/page.tsx`, `lib/guards.ts`, `middleware.ts`

- [ ] Auth.js v5 config with Prisma adapter + Google provider. When `ALLOW_DEV_LOGIN=true` (dev only), add a Credentials provider that logs in seeded users by email (no password) so the app is fully usable without real Google creds.
- [ ] `/signin` page: "Continue with Google" + (dev) quick-login buttons for the two seeded travellers. Warm, branded.
- [ ] `middleware.ts` protects `(app)` routes; unauthenticated → `/signin`.
- [ ] `lib/guards.ts`: `requireUser()`, `requireTripAccess(tripId)` returning membership or throwing `notFound()`/`forbidden`. **Test** guard logic with a mocked db (member allowed, non-member denied). Commit.

### Task 0.6: Authed shell + Trips list + Create/Invite

**Files:** `app/(app)/layout.tsx`, `app/(app)/trips/page.tsx`, `app/(app)/trips/new/page.tsx`, `server/actions/trips.ts`, `lib/validations/trip.ts`, `components/trip/trip-card.tsx`

- [ ] App shell: top bar with app name (Fraunces wordmark), traveller avatar menu (sign out), theme toggle; responsive.
- [ ] Trips list: cards (name, dates, stop count, cover gradient), `EmptyState` when none, "New trip" CTA.
- [ ] `createTrip` server action (Zod: name, dates, homeCurrency) → creates Trip + owner TripMember; redirect to overview.
- [ ] Settings-side invite (stub here, full in P5 settings): `inviteToTrip(email)` creates Invite + TripMember on accept. **Test** `createTrip` validation + that creator becomes owner member. Commit.
- [ ] **Phase gate:** run app, sign in as dev traveller, create a trip, see it listed. Manual verify + commit.

---

# PHASE 1 — Core Itinerary (the usable planner)

Produces: full Stops/Transport/Accommodation/Items with Wishlist→schedule, overview, calendar, and day views.

### Task 1.1: Stops CRUD + ordering + overview list
**Files:** `server/actions/stops.ts`, `lib/validations/stop.ts`, `app/(app)/trips/[tripId]/page.tsx`, `app/(app)/trips/[tripId]/layout.tsx`, `components/trip/stop-card.tsx`, `lib/tz.ts`
- [ ] Trip nav (tabs/sidebar) in trip layout. Overview lists Stops in `sortOrder` with nights computed from arrive/depart, add/edit/delete Stop (Dialog form: name, country, dates, timezone auto-suggested from country/coords with override). Reorder (move up/down or drag). Geocode lat/lng best-effort via Nominatim helper (optional; manual override).
- [ ] **TDD** `lib/tz.ts` (timezone guess from country, nights-between two dates honouring dates not instants) + stop sort/reorder pure helper. Commit.

### Task 1.2: Transport between stops
**Files:** `server/actions/transport.ts`, `lib/validations/transport.ts`, `components/trip/transport-card.tsx`, overview integration
- [ ] CRUD Transport (mode: flight/train/bus/car/ferry/other; from/to Stop; dep/arr place + datetime in relevant tz; reference; notes). Shown between stop cards on overview in order. **TDD** validation + a `lib/transport.ts` helper computing duration across timezones. Commit.

### Task 1.3: Accommodation per stop
**Files:** `server/actions/accommodation.ts`, `lib/validations/accommodation.ts`, `components/trip/accommodation-card.tsx`
- [ ] CRUD Accommodation attached to a Stop (name, address, check-in/out, confirmation, notes). Validate check-in/out within (or warn outside) stop dates. **TDD** date-within-stop validator. Commit.

### Task 1.4: Items + categories + wishlist
**Files:** `server/actions/items.ts`, `lib/validations/item.ts`, `lib/categories.ts`, `components/trip/item-card.tsx`, `components/trip/category-pill.tsx`, `app/(app)/trips/[tripId]/wishlist/page.tsx`, `components/trip/wishlist-board.tsx`
- [ ] CRUD Item (title, category, optional stop, optional date+times, address/coords, link, booking, notes). An Item with no date = unscheduled (Wishlist). Wishlist board groups unscheduled items (optionally by intended stop) with a "Schedule" action (pick date + optional time) that moves it onto the timeline; and an "Unschedule" that returns it.
- [ ] **TDD** scheduled/unscheduled predicate + the schedule/unschedule state transition (pure function over item fields). Commit.

### Task 1.5: Calendar (agenda) + Day view
**Files:** `app/(app)/trips/[tripId]/calendar/page.tsx`, `app/(app)/trips/[tripId]/day/[date]/page.tsx`, `components/trip/timeline.tsx`, `components/trip/day-nav.tsx`, `lib/dates.ts`
- [ ] Calendar = vertical agenda across trip date range: each day shows its Stop, transport on that day, timed items in order, untimed items in a "no set time" group, accommodation check-in/out markers. Day view = one day in detail with same grouping + quick-add.
- [ ] **TDD** `lib/dates.ts`: enumerate trip days, bucket items/transport/accommodation onto days (a transport spanning midnight shows on departure day with arrival note; accommodation shows on check-in & check-out days). This is the core scheduling projection — test thoroughly. Commit.
- [ ] **Phase gate:** build the seeded trip's itinerary end-to-end in the UI; verify overview/calendar/day. Commit.

---

# PHASE 2 — Budget (multi-currency)

### Task 2.1: Money core
**Files:** `lib/money.ts`, `lib/validations/cost.ts`
- [ ] `lib/money.ts`: minor-unit math, formatting per currency/locale, `convert(amountMinor, fromRate, toRate)` using snapshotted rates, summing across currencies into home. **TDD** heavily (rounding, zero-decimal currencies like JPY, conversion identity). Commit.

### Task 2.2: FX rates (fetch + cache + override)
**Files:** `lib/fx.ts`, `app/api/fx/route.ts`, `server/actions/rates.ts`
- [ ] `lib/fx.ts` fetches from Frankfurter (`https://api.frankfurter.app/latest?from=X&to=Y`), no key; `/api/fx` caches per trip in `ExchangeRate` and serves cached when offline/failed. Manual override action sets `manual=true` and is never overwritten by auto-fetch. **TDD** fx merge logic (manual wins; stale fallback) with mocked fetch. Commit.

### Task 2.3: Costs on entities + Other costs
**Files:** `server/actions/costs.ts`, `components/ui/money-input.tsx` (reuse), cost UI in transport/accommodation/item cards + an "Other costs" manager on budget page
- [ ] Attach a Cost (estimated always, actual optional, own currency, snapshot rate at save) to Transport/Accommodation/Item; standalone Other costs (label + category). **TDD** cost create snapshots current home rate. Commit.

### Task 2.4: Budget roll-up view
**Files:** `app/(app)/trips/[tripId]/budget/page.tsx`, `components/trip/budget-table.tsx`, `lib/budget.ts`
- [ ] `lib/budget.ts`: totals in home currency; breakdowns by Category, by Stop, by day (accommodation spread across nights); estimated vs actual + gap. Budget page renders tables/bars (no targets). **TDD** roll-ups including nightly spread + multi-currency conversion + est/actual gap. Commit.

---

# PHASE 3 — Summary & Route Map

### Task 3.1: Flags engine
**Files:** `lib/flags.ts`
- [ ] Pure functions detecting: stop without accommodation; empty day; transport dep/arr outside stop dates or arriving after next accommodation check-in; very short stay (< 1 night); route backtracking (a later stop closer to an earlier one — heuristic on coords/order). Each returns `{severity, message, targetType, targetId}`. **TDD** each rule with crafted fixtures. Commit.

### Task 3.2: Route map
**Files:** `components/trip/route-map.tsx`, dynamic import (client-only Leaflet), `app/(app)/trips/[tripId]/summary/page.tsx`
- [ ] Leaflet map with OSM tiles, markers per Stop in order + polyline route; popups with stop name/dates. No API key. Graceful fallback when coords missing. Commit.

### Task 3.3: Summary page
**Files:** `app/(app)/trips/[tripId]/summary/page.tsx`, `components/trip/flag-list.tsx`
- [ ] Overview: stops with nights, transport between, per-stop & per-day cost, route map, and the Flag list grouped by severity with deep links to fix. **TDD** the summary assembly selector (pure). Commit. **Phase gate:** verify flags fire on a deliberately broken seeded trip.

---

# PHASE 4 — On-the-go & Offline

### Task 4.1: Today view
**Files:** `app/(app)/trips/[tripId]/today/page.tsx`
- [ ] Focused screen: next transport (countdown), today's items with times + addresses, today's accommodation, all tap-to-map. Uses `lib/dates.ts` "today within trip" (falls back to trip start if not currently travelling). **TDD** "pick today's slice" selector. Commit.

### Task 4.2: Map/directions links + time-zone-aware display
**Files:** `lib/maps.ts`, `lib/tz.ts` (extend), apply across cards
- [ ] `lib/maps.ts` builds Google/Apple Maps URLs from coords or address. Times render in their Stop's timezone with a small tz label; cross-midnight transport shows "+1 day". **TDD** url builder + tz formatting. Commit.

### Task 4.3: PWA + offline read cache
**Files:** `public/manifest.webmanifest`, `public/icons/*`, `public/sw.js`, register in `app/layout.tsx`
- [ ] Web manifest (name, theme color = brand, icons, standalone). Service worker: cache app shell + last-viewed trip data (stale-while-revalidate for GET) so itinerary/budget are viewable offline; mutations require network. **TDD** the SW cache-key/strategy helper (pure module imported by sw). Commit. **Phase gate:** install to home screen, go offline, confirm itinerary readable.

---

# PHASE 5 — Deciding Together & Prep

### Task 5.1: Notes/comments
**Files:** `server/actions/notes.ts`, `components/trip/note-thread.tsx`
- [ ] Add/list/delete Notes on a Stop/Item/booking; show author + time. Authorization: trip members only. **TDD** create/list authorization. Commit.

### Task 5.2: Wishlist voting
**Files:** `server/actions/votes.ts`, `components/trip/vote-control.tsx`, integrate into wishlist board
- [ ] Each traveller sets MUST/KEEN/MEH per wishlist item; board shows both travellers' votes + a combined sort. **TDD** vote upsert (one per user/item) + combined ranking. Commit.

### Task 5.3: Pre-trip checklist + packing list (+templates)
**Files:** `server/actions/checklists.ts`, `app/(app)/trips/[tripId]/checklists/page.tsx`, `components/trip/checklist.tsx`
- [ ] Two tabs: Pre-trip (text, done, due date, assignee) and Packing (text, done) with reusable templates (save current as template, apply a template). **TDD** template apply (no dupes) + due-date sort. Commit.

---

# PHASE 6 — Documents & Sharing

### Task 6.1: Storage abstraction + uploads
**Files:** `lib/storage.ts`, `app/api/uploads/route.ts`
- [ ] `Storage` interface with a dev local-disk impl (writes to `./.uploads`, served via route) and a documented prod S3/R2 impl (env-gated). Upload endpoint validates size/mime, returns URL. **TDD** validation + key generation. Commit.

### Task 6.2: Attachments on entities
**Files:** `server/actions/attachments.ts`, `components/trip/attachment-list.tsx`, `app/(app)/trips/[tripId]/files/page.tsx`
- [ ] Attach files to Trip/Transport/Accommodation/Item; list + download + delete; Files page aggregates all. **TDD** attachment create/authorization + delete removes blob. Commit.

### Task 6.3: Export / print / read-only share
**Files:** `app/(app)/trips/[tripId]/print/page.tsx`, `app/share/[token]/page.tsx`, `server/actions/share.ts`
- [ ] Print-optimised itinerary (clean CSS print styles, all stops/days/costs). Generate a read-only share token → public `/share/[token]` rendering a stripped, non-editable itinerary. **TDD** token issue/revoke + that share page enforces read-only + hides private notes. Commit.

---

# PHASE 7 — Notifications & Journal

### Task 7.1: Reminder model + scheduling hook
**Files:** `server/actions/reminders.ts`, `app/api/cron/reminders/route.ts`
- [ ] CRUD Reminders (title, fireAt, optional target). A cron-style route (to be wired to a real scheduler by the user) marks due reminders and dispatches. **TDD** "due reminder" selection. Commit. (VAPID/push keys = user handoff.)

### Task 7.2: Web push delivery
**Files:** `public/sw.js` (push handler), `lib/push.ts`, `server/actions/push-subscribe.ts`
- [ ] Store push subscriptions; SW shows notifications; `lib/push.ts` sends via web-push (keys from env). Gracefully no-op without VAPID keys. **TDD** payload builder. Commit.

### Task 7.3: Photos / journal
**Files:** `server/actions/journal.ts`, `app/(app)/trips/[tripId]/day/[date]/page.tsx` (journal section), reuse storage
- [ ] Per-day journal entry (text + photos via storage). Shows inline in day view + a trip journal feed. **TDD** journal upsert per day. Commit.

---

# PHASE 8 — AI Assistant (future, scaffolded)

### Task 8.1: AI seam
**Files:** `lib/ai.ts`, `server/actions/ai.ts`
- [ ] Define a provider-agnostic `assist()` interface (suggest activities for a stop, draft a packing list, parse a pasted booking confirmation into a Transport/Accommodation draft). Implement against the Anthropic API behind an env-gated key; no-op/disabled UI when absent. **TDD** the prompt/response mapper with a mocked client. Commit. (Reads the `claude-api` skill before implementing.)

---

## Handoff items for the user (external services)
- Google OAuth client (`AUTH_GOOGLE_ID`/`SECRET`) + authorized redirect URIs.
- Production Postgres `DATABASE_URL` (Neon) + switch Prisma provider; run `migrate deploy`.
- File storage bucket (R2/S3) creds for prod `Storage`.
- Web push VAPID keys (P7) + a scheduler hitting `/api/cron/reminders`.
- (Optional) Anthropic API key for P8.

## Self-review notes
- Spec coverage: every confirmed feature maps to a task (Weather intentionally absent). Budget targets/splitting intentionally absent per spec.
- Naming consistency: `homeCurrency`, `amountMinor`/`estimatedMinor`/`actualMinor`, `sortOrder`, `targetType/targetId`, `scheduled` used consistently across tasks.
- Types referenced in later tasks (Cost.ownerType, Item.category, flag shape) are defined in Task 0.4 / 1.4 / 3.1.
