# Phase 2 — New trip flow, `Trip.roughMonth`, Globe arrival — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/trips/new` becomes a four-step focus flow — Name · When · From · Cover (past mode: Name · When · Where · Cover) — one question per screen, with the real Trips-page hero card as a live preview, rendered in a `(focus)` route group with no app rail or tab bar. A Trip can carry a **Rough month** ("Sometime in April") that never feeds the date engine and falls away once a start date is set. A past trip logged with stops lands on `/globe?added=<tripId>`, which flies to the new pins, pops them in and toasts "Added to your map · {n} places".

**Architecture:** Pure pieces first: `lib/rough-month.ts`, `lib/currency-for-country.ts`, `lib/picked-place.ts`, `lib/calendar-grid.ts`, `lib/new-trip/{draft,stamp-word,rough-stops}.ts`. Then the shared UI that Phases 3 and 4 reuse (`RangeCalendar`, `PlaceCombobox`, `CurrencyRow` in `components/ui/`). `createTrip` stays the one write path: it grows `roughMonth`, picked home coordinates, rough `stops` and a threaded-through `fromShareToken`, and **returns** `{ tripId, href }` instead of redirecting so the client can play the create motion, toast and `router.push(href)`. The flow is one client component (`components/new-trip/new-trip-flow.tsx`) holding a `useReducer` draft (`lib/new-trip/draft.ts`), mirroring `step` into the URL with `window.history.pushState` and the draft into `sessionStorage`. The preview is `TripCardHeroView` — the markup of `TripCardHero`, split out so a draft can drive it without forking styles. Motion is the last two implementation tasks.

**Tech Stack:** Next.js 16.3 App Router (**read `node_modules/next/dist/docs/` before touching routing — this version differs from training data**), React 19.2, Prisma 7 (Postgres), zod 4, Tailwind v4 tokens, Radix (Dialog, Popover, ToggleGroup via `Segmented`), `motion/react` 12, lucide-react, Leaflet (Globe), Vitest + Testing Library (jsdom).

**Spec:** `docs/specs/2026-09-30-budget-onboard-plan-share.md` §C and the Phase 2 row (wins over the handoff). Handoff: `design_handoff/budget-onboard-plan-share/budget-onboard-2026-09-30/NEW_TRIP.md`, `MOTION.md` rows N1–N14 (no View Transitions morph — spec C5), `design_handoff/budget-onboard-plan-share/plan-share-audit-handoff/AUDIT.md` Globe row. Images: `budget-onboard-2026-09-30/images/new-trip-*.png`. Glossary: `CONTEXT.md` **Rough month**, **Stop** (rough), **Phase**, **Route copy**.

## Global Constraints

- Work only on branch `feat/budget-onboard-plan-share-2026-09-30` (already checked out in /work). Never commit to `main`, never push, never deploy, never run any `feedback:*` script.
- If `node`/`npm` isn't on PATH: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use`.
- Every commit message ends with these two lines:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8`
- No `Resolves-Feedback:` trailers (the inbox is empty).
- Tests: `npm test -- <path>` (sets TZ=UTC). Before each commit `npx tsc --noEmit` and `npm run lint` must be clean.
- Tokens only, no raw hex in components; 2px ink borders + hard shadows; `shadow-soft`, `shadow-soft-lg`, `border-border/70`, `bg-card/40` must not appear in any touched file (extend the existing ban assertions to new components). `formatMoney()` for money; `formatDay()/formatRange()/formatDateRange*` for dates, never ISO. Chips/pills `whitespace-nowrap shrink-0`. Touch targets ≥44px on mobile. `tabular-nums` on amounts/times. Respect reduced motion. lucide icons, not unicode glyphs.
- Do not add npm dependencies unless the task says so (check `package.json` — `motion`, dnd-kit, Radix, react-day-picker may already be present; verify).
- Comment only a non-obvious why.

Phase-specific:

- **Verified facts the handoff gets wrong for this repo — follow these, not the handoff:**
  - There is **no react-day-picker** and no calendar component; `components/ui/date-field.tsx` is a native `<input type="date">`. `RangeCalendar` is hand-built on `lib/calendar-grid.ts` (Task 6). No new date library.
  - There is **no `formatDay()` / `formatRange()`** in the repo. Use `lib/dates.ts`: `formatDayLabel("2026-12-04")` → `"Fri 4 Dec"`, `formatLongDate` → `"Fri 4 Dec 2026"`, `formatDateRangeCompact(s, e)` → `"4 Dec – 8 Jan"`, `formatNights(n)` → `"35 nights"`, `nightsBetween`, `formatMonthYear("2026-12-01")` → `"December 2026"`.
  - Shadows are `shadow-hard-1`…`shadow-hard-5` and `shadow-cta` (the handoff's `shadow-1…5`). Accent fills (`bg-coral`, `bg-sun`, `bg-teal`) also take the `island` utility so text stays legible in dark mode (see `components/trips/trip-card-hero.tsx`).
  - Plan's place search needs a `tripId` (`server/actions/transport.ts` `searchPlacesAction(tripId, q)`), the Globe's creates a Globe as a side effect (`server/actions/globe.ts`). New trip has neither, so Task 5 adds `server/actions/places.ts` → `findPlaces(query)` (session-gated only).
  - The Globe page shows **Markers only**, never Trip Stops. The `?added=` arrival (Task 15) loads that Trip's located real-plan Stops and draws them as their own pins.
  - `createTrip` redirects today; spec C5/N13 need the client to act "when the promise resolves (before the redirect)". Task 3 makes it return `href` instead; the flow navigates.
- Dates the Traveller sees in the flow come from the **device** clock (`todayLocalISO()`), never the server's UTC `todayISO()` (lib/dates.ts warns about this). The flow body only renders on the client (Task 10), so this never causes a hydration mismatch.
- Prisma: hand-write the migration SQL (additive, nullable — docs/DEPLOY.md §4b). `npx prisma validate && npx prisma generate` are always safe. Run `npx prisma migrate deploy` **only** if `.env`'s `DATABASE_URL` host is `localhost`/`127.0.0.1` and `docker compose ps` shows Postgres up; otherwise skip it and say so in the commit body. Never point any Prisma command at `.env.production.local`.
- No `loading.tsx` / `template.tsx` anywhere (ADR 0063; `app/route-conventions.test.ts`).
- Every new `"use server"` export must be added to the allowlist in `lib/server-action-exports.test.ts`.
- Step changes after Task 10 are animated in Task 16. From Task 10 on, every test that moves between steps must await the new heading with `findByRole` (never `getByRole`) so the later `AnimatePresence mode="wait"` doesn't break it.

- **Orchestrator overrides (2026-09-30), these win over any task text below:**
  - **No separate stamp word.** The preview must match the card the Traveller sees next, so it uses the real card's rule: `stampPlace({ stops: [], name, size: "hero" })` from `components/trips/cover-stamp.tsx`. Do **not** create `lib/new-trip/stamp-word.ts` or its tests; wherever a task calls `stampWord(x)`, call `stampPlace({ stops: [], name: x, size: "hero" })` instead (empty name → the preview's `"TRIP"` fallback stays). The debounced-name behaviour in MOTION N5 still applies to that value.
  - **Landing after create:** `/globe?added=` only for a *past* trip with Stops (see Task 3's `href` rule); every other case is trip home. Add a Task 3 test: "an undated trip with rough stops returns trip home".
  - Past-trip stops share the trip's nights evenly (planner's call, confirmed). The eyebrow uses the display name's first word; with no display name it reads "Let's start your first trip." with no name.

## Review Focus

1. **A deep link past an unanswered required step** — `/trips/new?step=3` with no name, a stale draft, or `?past=1&step=4` with no dates. Expectation: the flow clamps to the first step still owed (1, or 2 in past mode) and the URL is rewritten to match. Test: Task 8 `initDraft` "clamps a deep link past an unanswered required step" and Task 10 "cold load at ?step=3 without a name opens on step 1".
2. **A rough month and a start date at the same time.** Expectation: never both on a Trip. `createTrip` stores `roughMonth: null` whenever `startDate` is set; `updateTrip`, `firmUpSegment` and `firmUpTrip` write `roughMonth: null` whenever they write a start date; `countdownFor` prefers the date. Tests: Task 3 "drops a rough month when a start date is given", Task 4 "setting a start date clears the rough month" + the firm-up expectations + "a start date wins over a stale rough month".
3. **Past-mode stops that can't be located.** A typed (not picked) stop, or a geocoder outage. Expectation: the Trip and every Stop are still created, in order, as rough Stops with null coordinates; `href` is still `/globe?added=<id>`; the Globe arrival silently skips unlocated Stops and toasts only the located count. Tests: Task 3 "a stop whose geocode fails is still created with null coords", Task 15 "counts only located stops".
4. **A home place in a country with no supported currency** (Bali → `id`). Expectation: `homeCurrency` is left as it was and the note falls back to "Costs in other currencies convert to this." (no "Picked from Bali."). Tests: Task 5 `currencyForCountry("id")` is undefined, Task 8 "pick-home in an unmapped country keeps the current currency", Task 12 note copy.
5. **Enter / Esc inside the place combobox.** Enter with a result highlighted must pick it, not submit the step; Esc with the list open must close the list, not open "Leave without saving?". Tests: Task 7 "Enter picks the highlighted result and does not submit the form", "Escape closes the list without bubbling"; Task 12 "Enter on a highlighted home result picks it and stays on step 3".

---

### Task 1: `Trip.roughMonth` column and rough-month helpers

**Files:**
- Modify: `prisma/schema.prisma` (model `Trip`, after the `hardEndDate` line)
- Create: `prisma/migrations/20260930100000_trip_rough_month/migration.sql`
- Create: `lib/rough-month.ts`
- Test: `lib/rough-month.test.ts`

**Interfaces:**
- Produces:
  - `Trip.roughMonth String?` ("YYYY-MM").
  - `isRoughMonth(v: unknown): v is string`
  - `roughMonthOptions(today: string, count?: number): string[]` — this month and the next `count - 1` (default 12), as "YYYY-MM".
  - `formatRoughMonth(ym: string, today?: string): string` — `"April"` when `ym` is one of `roughMonthOptions(today)`, else `"April 2027"` (also for past months). `today` defaults to `todayISO()`; UI callers pass the device/trip today.
  - `roughMonthStamp(ym: string): string` — `"APR 27"` (the stamp's date line).
  - `roughMonthChip(ym: string, today: string): string` — `"Apr"`, or `"Jan ’27"` once the year differs from today's.

- [ ] **Step 1: Write the failing test** — `lib/rough-month.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isRoughMonth, roughMonthOptions, formatRoughMonth, roughMonthStamp, roughMonthChip } from "./rough-month";

const TODAY = "2026-09-30";

describe("isRoughMonth", () => {
  it("accepts YYYY-MM with a real month", () => {
    expect(isRoughMonth("2027-04")).toBe(true);
    expect(isRoughMonth("2026-12")).toBe(true);
  });
  it.each(["2027-4", "2027-13", "2027-00", "2027-04-01", "", null, 202704])("rejects %s", (v) => {
    expect(isRoughMonth(v)).toBe(false);
  });
});

describe("roughMonthOptions", () => {
  it("is this month and the eleven after it", () => {
    const opts = roughMonthOptions(TODAY);
    expect(opts).toHaveLength(12);
    expect(opts[0]).toBe("2026-09");
    expect(opts[3]).toBe("2026-12");
    expect(opts[4]).toBe("2027-01");
    expect(opts[11]).toBe("2027-08");
  });
  it("does not skip a month from the 31st", () => {
    expect(roughMonthOptions("2026-01-31").slice(0, 3)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});

describe("formatRoughMonth", () => {
  it("names the month alone inside the next 12 months", () => {
    expect(formatRoughMonth("2027-04", TODAY)).toBe("April");
    expect(formatRoughMonth("2026-09", TODAY)).toBe("September");
  });
  it("adds the year outside them, past or further out", () => {
    expect(formatRoughMonth("2027-09", TODAY)).toBe("September 2027");
    expect(formatRoughMonth("2026-08", TODAY)).toBe("August 2026");
  });
});

describe("roughMonthStamp", () => {
  it("is MON YY", () => {
    expect(roughMonthStamp("2027-04")).toBe("APR 27");
  });
});

describe("roughMonthChip", () => {
  it("is the short month within today's year", () => {
    expect(roughMonthChip("2026-12", TODAY)).toBe("Dec");
  });
  it("adds a short year once it rolls over", () => {
    expect(roughMonthChip("2027-01", TODAY)).toBe("Jan ’27");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- lib/rough-month.test.ts`
Expected: FAIL — cannot resolve `./rough-month`.

- [ ] **Step 3: Implement** — `lib/rough-month.ts`:

```ts
import { addMonths, monthKey, todayISO } from "@/lib/dates";

/**
 * CONTEXT.md "Rough month": a Trip's loose "when" ("Sometime in April"),
 * stored as "YYYY-MM". A wish, never a date — nothing here feeds the date
 * engine, Flags or the Phase.
 */

const LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isRoughMonth(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function roughMonthOptions(today: string, count = 12): string[] {
  const first = `${monthKey(today)}-01`;
  return Array.from({ length: count }, (_, i) => monthKey(addMonths(first, i)));
}

function monthIndex(ym: string): number {
  return Number(ym.slice(5, 7)) - 1;
}

export function formatRoughMonth(ym: string, today: string = todayISO()): string {
  const month = LONG[monthIndex(ym)];
  return roughMonthOptions(today).includes(ym) ? month : `${month} ${ym.slice(0, 4)}`;
}

export function roughMonthStamp(ym: string): string {
  return `${SHORT[monthIndex(ym)].toUpperCase()} ${ym.slice(2, 4)}`;
}

export function roughMonthChip(ym: string, today: string): string {
  const short = SHORT[monthIndex(ym)];
  return ym.slice(0, 4) === today.slice(0, 4) ? short : `${short} ’${ym.slice(2, 4)}`;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- lib/rough-month.test.ts` — Expected: PASS.

- [ ] **Step 5: Schema + migration**

In `prisma/schema.prisma`, model `Trip`, directly under `hardEndDate`:

```prisma
  roughMonth   String? // "YYYY-MM" — CONTEXT.md "Rough month". A wish, never a date: no date engine, Flags or Phase. Cleared whenever startDate is set.
```

Create `prisma/migrations/20260930100000_trip_rough_month/migration.sql`:

```sql
-- Additive and nullable (docs/DEPLOY.md §4b): the still-running old build
-- never writes roughMonth, so it cannot violate a constraint during the
-- migrate-then-build window, and its reads never select it.
-- CONTEXT.md "Rough month": a wish ("Sometime in April"), never a date.

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "roughMonth" TEXT;
```

Run: `npx prisma validate && npx prisma generate` — Expected: both succeed. Apply locally with `npx prisma migrate deploy` only under the conditions in Global Constraints.

- [ ] **Step 6: Typecheck, lint, commit**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add prisma/schema.prisma prisma/migrations/20260930100000_trip_rough_month lib/rough-month.ts lib/rough-month.test.ts
git commit -m "feat(trip): Trip.roughMonth and rough-month helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 2: "Where to first?" opens the flow instead of creating the trip (spec C4)

**Files:**
- Modify: `components/trips/first-trip-card.tsx`
- Modify: `components/trips/first-trip-card.test.tsx` (rewrite)
- Delete: `app/(app)/trips/actions.ts`, `app/(app)/trips/actions.test.ts` (`startFirstTrip` has no other caller — verified with `grep -rn startFirstTrip app components lib server`)

**Interfaces:**
- Consumes: `useRouter` from `next/navigation`.
- Produces: `FirstTripCard({ variant })` — unchanged props; submitting pushes `/trips/new?name=<encoded>&step=2`. `startFirstTrip` no longer exists.

- [ ] **Step 1: Rewrite the test** — `components/trips/first-trip-card.test.tsx`, full content:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { FirstTripCard } from "./first-trip-card";

describe("FirstTripCard", () => {
  beforeEach(() => push.mockReset());

  it("whitespace keeps the button disabled and goes nowhere", () => {
    render(<FirstTripCard variant="desktop" />);
    const btn = screen.getByRole("button", { name: "Start planning" });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Trip name" }), { target: { value: "   " } });
    expect(btn).toBeDisabled();
    fireEvent.submit(btn.closest("form")!);
    expect(push).not.toHaveBeenCalled();
  });

  it("Start planning opens New trip at step 2 with the trimmed name (spec C4)", () => {
    render(<FirstTripCard variant="desktop" />);
    const input = screen.getByRole("textbox", { name: "Trip name" });
    fireEvent.change(input, { target: { value: " Japan in spring " } });
    fireEvent.submit(input.closest("form")!);
    expect(push).toHaveBeenCalledWith("/trips/new?name=Japan%20in%20spring&step=2");
  });

  it("encodes a name that needs it", () => {
    render(<FirstTripCard variant="mobile" />);
    const input = screen.getByRole("textbox", { name: "Trip name" });
    fireEvent.change(input, { target: { value: "Rock & Roll?" } });
    fireEvent.submit(input.closest("form")!);
    expect(push).toHaveBeenCalledWith("/trips/new?name=Rock%20%26%20Roll%3F&step=2");
  });

  it("renders the heading and placeholder copy", () => {
    render(<FirstTripCard variant="desktop" />);
    expect(screen.getByRole("heading", { name: /Where to first\?/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Name it, e.g. Japan in spring")).toBeInTheDocument();
    expect(screen.getByText("FIRST TRIP")).toBeInTheDocument();
  });

  it("never creates a trip itself", () => {
    const src = readFileSync(join(__dirname, "first-trip-card.tsx"), "utf8");
    expect(src).not.toMatch(/server\/actions|trips\/actions|startFirstTrip/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- components/trips/first-trip-card.test.tsx`
Expected: FAIL — `push` never called (the card still calls `startFirstTrip`), and the source check fails.

- [ ] **Step 3: Implement**

In `components/trips/first-trip-card.tsx`:
- Replace the `startFirstTrip` import with `import { useRouter } from "next/navigation";`.
- Delete the `error` and `pending` state, `useTransition`, and the `role="alert"` paragraph.
- `onSubmit`:

```tsx
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready) return;
    router.push(`/trips/new?name=${encodeURIComponent(name.trim())}&step=2`);
  }
```

- Input `onChange` becomes `(e) => setName(e.target.value)`; drop `disabled={pending}`. Button: `disabled={!ready}`, label always `Start planning`. Keep every class string unchanged.

Delete `app/(app)/trips/actions.ts` and `app/(app)/trips/actions.test.ts`.

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- components/trips/first-trip-card.test.tsx app/\(app\)/trips/page.test.tsx` — Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add -A components/trips/first-trip-card.tsx components/trips/first-trip-card.test.tsx "app/(app)/trips/actions.ts" "app/(app)/trips/actions.test.ts"
git commit -m "feat(trips): Where to first? opens New trip at step 2

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 3: `createTrip` takes a rough month, a picked home, rough stops and `fromShareToken`, and returns `href`

**Files:**
- Modify: `lib/validations/trip.ts`
- Test: `lib/validations/trip.test.ts` (add a describe block)
- Create: `lib/new-trip/rough-stops.ts`
- Test: `lib/new-trip/rough-stops.test.ts`
- Modify: `server/actions/trips.ts` (`createTrip`, `CreateTripResult`)
- Test: `server/actions/trips.test.ts` (`describe("createTrip")`)
- Modify: `app/(app)/trips/new/new-trip-form.tsx` + `new-trip-form.test.tsx` (a two-line shim so the old form keeps working until Task 14 deletes it)

**Interfaces:**
- Consumes: `geocodePlaceDetailed` (`lib/geocode.ts`), `nightsBetween` (`lib/dates.ts`), `tripPath` (`lib/trip-path.ts`).
- Produces:
  - `createTripSchema` accepts, on top of today's fields: `roughMonth?: "YYYY-MM"`, `homeLat?`, `homeLng?`, `homeCountryCode?` (2 letters, stored lower-case), `stops?: { name: string; lat?: number; lng?: number; countryCode?: string; nights?: number }[]` (max 30), `fromShareToken?: string`. `tripSchema` (Settings, `updateTrip`) is **unchanged** and strips those keys.
  - `CreateTripInput` — `z.infer<typeof createTripSchema>` (now includes the fields above).
  - `CreateTripResult = ActionResult<{ tripId: string; href: string }>`; `createTrip` never calls `redirect()`. `href` is `/globe?added=<tripId>` when any Stop was created **and the trip is past** (`endDate` set and `endDate < todayISO()`), else `tripPath(slug)`. (A Route copy from Phase 4 creates rough Stops on an undated trip and must land on trip home.)
  - `lib/new-trip/rough-stops.ts`: `DEFAULT_ROUGH_NIGHTS = 2`; `defaultStopNights(count, startDate?, endDate?): number[]`; `roughStopRows(stops: RoughStopSeed[], dates: { startDate?: string; endDate?: string }): RoughStopRow[]` (the `tx.stop.create` data minus `tripId`); `interface RoughStopSeed { name: string; lat?: number; lng?: number; countryCode?: string; nights?: number }`.
  - `fromShareToken` is parsed and **ignored** server-side in this phase (Phase 4 implements it).

- [ ] **Step 1: Write the failing schema test** — append to `lib/validations/trip.test.ts` (import `createTripSchema, tripSchema` from `./trip` if not already):

```ts
describe("createTripSchema — New trip flow fields", () => {
  const base = { name: "Japan", homeCurrency: "AUD" };

  it("accepts a rough month", () => {
    expect(createTripSchema.safeParse({ ...base, roughMonth: "2027-04" }).success).toBe(true);
  });
  it("rejects a malformed rough month", () => {
    expect(createTripSchema.safeParse({ ...base, roughMonth: "2027-4" }).success).toBe(false);
  });
  it("accepts rough stops with optional coordinates, lower-casing the country", () => {
    const r = createTripSchema.parse({ ...base, stops: [{ name: " Kyoto ", lat: 35.01, lng: 135.77, countryCode: "JP" }, { name: "Nara" }] });
    expect(r.stops).toEqual([{ name: "Kyoto", lat: 35.01, lng: 135.77, countryCode: "jp" }, { name: "Nara" }]);
  });
  it("caps stops at 30", () => {
    const stops = Array.from({ length: 31 }, (_, i) => ({ name: `P${i}` }));
    expect(createTripSchema.safeParse({ ...base, stops }).success).toBe(false);
  });
  it("rejects an out-of-range latitude", () => {
    expect(createTripSchema.safeParse({ ...base, stops: [{ name: "X", lat: 91, lng: 0 }] }).success).toBe(false);
  });
  it("accepts picked home coordinates", () => {
    const r = createTripSchema.parse({ ...base, homeName: "Sydney", homeLat: -33.87, homeLng: 151.21, homeCountryCode: "AU" });
    expect(r).toMatchObject({ homeLat: -33.87, homeLng: 151.21, homeCountryCode: "au" });
  });
  it("threads fromShareToken through", () => {
    expect(createTripSchema.parse({ ...base, fromShareToken: "tok" }).fromShareToken).toBe("tok");
  });
  it("keeps the date rules", () => {
    const r = createTripSchema.safeParse({ ...base, startDate: "2026-12-08", endDate: "2026-12-04" });
    expect(r.success).toBe(false);
  });
  it("tripSchema (Settings) strips the create-only fields", () => {
    const r = tripSchema.parse({ ...base, roughMonth: "2027-04", stops: [{ name: "x" }], homeLat: 1, fromShareToken: "t" });
    expect(r).not.toHaveProperty("roughMonth");
    expect(r).not.toHaveProperty("stops");
    expect(r).not.toHaveProperty("homeLat");
    expect(r).not.toHaveProperty("fromShareToken");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- lib/validations/trip.test.ts` — Expected: FAIL (unknown keys stripped / `tripSchema` identical to `createTripSchema`).

- [ ] **Step 3: Implement the schema** — `lib/validations/trip.ts`, replacing everything from `export const createTripSchema` down:

```ts
const tripFields = {
  name: z.string().trim().min(1, "Trip name is required").max(120, "Trip name must be 120 characters or fewer"),
  startDate: optionalIsoDate,
  endDate: optionalIsoDate,
  hardEndDate: optionalIsoDate,
  homeCurrency: z.enum(CURRENCY_CODES as [string, ...string[]], { error: "Please select a valid currency" }),
  homeName: z.string().trim().max(120, "Home base must be 120 characters or fewer").optional().or(z.literal("")),
  roundTrip: z.boolean().optional(),
};

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
const countryCode = z.string().regex(/^[a-zA-Z]{2}$/).transform((c) => c.toLowerCase());

const roughStopInput = z.object({
  name: z.string().trim().min(1, "Place name is required").max(120, "Place name must be 120 characters or fewer"),
  lat: latitude.optional(),
  lng: longitude.optional(),
  countryCode: countryCode.optional(),
  nights: z.number().int().min(0).max(366).optional(),
});

/** Only New trip sends these; Settings (tripSchema) never does. */
const createOnlyFields = {
  roughMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month").optional(),
  homeLat: latitude.optional(),
  homeLng: longitude.optional(),
  homeCountryCode: countryCode.optional(),
  stops: z.array(roughStopInput).max(30, "Add up to 30 places").optional(),
  fromShareToken: z.string().trim().min(1).max(200).optional(),
};

function withDateRules<T extends z.ZodType<{ startDate?: string; endDate?: string; hardEndDate?: string }>>(schema: T) {
  return schema
    .refine((d) => d.startDate == null || d.endDate == null || d.endDate >= d.startDate, {
      message: "End date must be on or after the start date",
      path: ["endDate"],
    })
    .refine((d) => d.startDate == null || d.hardEndDate == null || d.hardEndDate >= d.startDate, {
      message: "Hard end date must be on or after the start date",
      path: ["hardEndDate"],
    });
}

export const tripSchema = withDateRules(z.object(tripFields));
export type TripInput = z.infer<typeof tripSchema>;

export const createTripSchema = withDateRules(z.object({ ...tripFields, ...createOnlyFields }));
export type CreateTripInput = z.infer<typeof createTripSchema>;
export type RoughStopInput = z.infer<typeof roughStopInput>;
```

If `tsc` rejects the generic helper, drop it and write the two `.refine` calls on each schema inline — behaviour must be identical. Run `npm test -- lib/validations/trip.test.ts` — Expected: PASS (old and new cases).

- [ ] **Step 4: Write the failing rough-stops test** — `lib/new-trip/rough-stops.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { defaultStopNights, roughStopRows, DEFAULT_ROUGH_NIGHTS } from "./rough-stops";

describe("defaultStopNights", () => {
  it("is empty for no stops", () => {
    expect(defaultStopNights(0, "2026-07-01", "2026-07-10")).toEqual([]);
  });
  it("splits the trip's nights, earlier stops taking the remainder", () => {
    expect(defaultStopNights(3, "2026-07-01", "2026-07-11")).toEqual([4, 3, 3]);
  });
  it("gives every stop the default without dates", () => {
    expect(defaultStopNights(2)).toEqual([DEFAULT_ROUGH_NIGHTS, DEFAULT_ROUGH_NIGHTS]);
  });
});

describe("roughStopRows", () => {
  it("builds rough real-plan rows in order", () => {
    const rows = roughStopRows(
      [{ name: "Kyoto", lat: 35, lng: 135.7, countryCode: "JP" }, { name: "Nara", nights: 1 }],
      { startDate: "2026-04-01", endDate: "2026-04-07" },
    );
    expect(rows).toEqual([
      expect.objectContaining({ name: "Kyoto", lat: 35, lng: 135.7, countryCode: "jp", nights: 3, sortOrder: 0, forkId: null, arriveDate: null, departDate: null, timezone: null, pinned: false, chapterId: null }),
      expect.objectContaining({ name: "Nara", lat: null, lng: null, countryCode: null, nights: 1, sortOrder: 1 }),
    ]);
  });
});
```

Run: `npm test -- lib/new-trip/rough-stops.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 5: Implement** — `lib/new-trip/rough-stops.ts`:

```ts
import { nightsBetween } from "@/lib/dates";

/** Same default QuickAddStops offers a new rough Stop. */
export const DEFAULT_ROUGH_NIGHTS = 2;

export interface RoughStopSeed {
  name: string;
  lat?: number;
  lng?: number;
  countryCode?: string;
  nights?: number;
}

export function defaultStopNights(count: number, startDate?: string, endDate?: string): number[] {
  if (count <= 0) return [];
  if (!startDate || !endDate) return Array.from({ length: count }, () => DEFAULT_ROUGH_NIGHTS);
  const total = nightsBetween(startDate, endDate);
  const base = Math.floor(total / count);
  const rem = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

export function roughStopRows(stops: RoughStopSeed[], dates: { startDate?: string; endDate?: string }) {
  const nights = defaultStopNights(stops.length, dates.startDate, dates.endDate);
  return stops.map((s, i) => ({
    forkId: null,
    name: s.name,
    country: null,
    countryCode: s.countryCode?.toLowerCase() ?? null,
    nights: s.nights ?? nights[i],
    chapterId: null,
    chapterSortOrder: 0,
    arriveDate: null,
    departDate: null,
    timezone: null,
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    notes: null,
    pinned: false,
    sortOrder: i,
  }));
}

export type RoughStopRow = ReturnType<typeof roughStopRows>[number];
```

Run: `npm test -- lib/new-trip/rough-stops.test.ts` — Expected: PASS.

- [ ] **Step 6: Write the failing action tests** — in `server/actions/trips.test.ts`, `describe("createTrip")`:
- Replace every `await expect(createTrip(...)).rejects.toThrow("NEXT_REDIRECT")` with `const r = await createTrip(...)` and `expect(r.success).toBe(true)`; replace `expect(redirectMock).toHaveBeenCalledWith("/trips/japan-2026")` with `expect(r).toEqual({ success: true, tripId: "trip-123", href: "/trips/japan-2026" })` and `expect(redirectMock).not.toHaveBeenCalled()`.
- Add:

```ts
  it("stores a rough month on a date-less trip", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-r" });
    await createTrip({ name: "Japan", homeCurrency: "AUD", roughMonth: "2027-04" });
    expect(tripCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ roughMonth: "2027-04", startDate: null }) });
  });

  it("drops a rough month when a start date is given (CONTEXT.md Rough month)", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-r" });
    await createTrip({ ...VALID_INPUT, roughMonth: "2027-04" });
    expect(tripCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ roughMonth: null, startDate: "2026-03-01" }) });
  });

  it("uses picked home coordinates without geocoding", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-h" });
    await createTrip({ name: "Japan", homeCurrency: "AUD", homeName: "Sydney", homeLat: -33.87, homeLng: 151.21, homeCountryCode: "au" });
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    expect(tripCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ homeName: "Sydney", homeLat: -33.87, homeLng: 151.21, homeCountryCode: "au" }) });
  });

  it("creates rough stops in order and sends the traveller to the Globe", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-p" });
    geocodePlaceDetailedMock.mockResolvedValue({ name: "Nara, Japan", lat: 34.68, lng: 135.8, city: "Nara", country: "Japan", countryCode: "jp" });
    const r = await createTrip({
      name: "Kansai", homeCurrency: "AUD", startDate: "2026-04-01", endDate: "2026-04-07",
      stops: [{ name: "Kyoto", lat: 35.01, lng: 135.77, countryCode: "jp" }, { name: "Nara" }],
    });
    expect(geocodePlaceDetailedMock).toHaveBeenCalledTimes(1);
    expect(geocodePlaceDetailedMock).toHaveBeenCalledWith("Nara");
    expect(stopCreateMock).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({ tripId: "trip-p", name: "Kyoto", sortOrder: 0, nights: 3, arriveDate: null, forkId: null }) });
    expect(stopCreateMock).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({ tripId: "trip-p", name: "Nara", sortOrder: 1, lat: 34.68, lng: 135.8, countryCode: "jp" }) });
    expect(r).toEqual({ success: true, tripId: "trip-p", href: "/globe?added=trip-p" });
  });

  it("a stop whose geocode fails is still created with null coords", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-q" });
    geocodePlaceDetailedMock.mockResolvedValue(null);
    const r = await createTrip({ name: "Somewhere", homeCurrency: "AUD", startDate: "2026-04-01", endDate: "2026-04-03", stops: [{ name: "Nowhereville" }] });
    expect(stopCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ name: "Nowhereville", lat: null, lng: null, countryCode: null }) });
    expect(r.success && r.href).toBe("/globe?added=trip-q");
  });

  it("accepts fromShareToken and otherwise creates the trip as usual (Phase 4 implements it)", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-s" });
    const r = await createTrip({ name: "Copy", homeCurrency: "AUD", fromShareToken: "tok" });
    expect(stopCreateMock).not.toHaveBeenCalled();
    expect(r).toEqual({ success: true, tripId: "trip-s", href: "/trips/japan-2026" });
  });
```

Run: `npm test -- server/actions/trips.test.ts` — Expected: FAIL.

- [ ] **Step 7: Implement `createTrip`** — `server/actions/trips.ts`:
- Import `roughStopRows` from `@/lib/new-trip/rough-stops` and `type RoughStopInput` from `@/lib/validations/trip`.
- `export type CreateTripResult = ActionResult<{ tripId: string; href: string }>;` and update the doc comment ("returns `href`; the caller navigates — the flow plays its create motion first").
- Destructure `roughMonth, homeLat, homeLng, homeCountryCode, stops` from `parsed.data` (not `fromShareToken`; add the comment `// fromShareToken is threaded through for Route copy (Phase 4); unused until then.`).
- Home: when `trimmedHome && homeLat !== undefined && homeLng !== undefined`, set `homeFields = { homeName: trimmedHome, homeLat, homeLng, homeCountryCode: homeCountryCode ?? null }` and skip the geocode; otherwise the existing geocode branch.
- Before the transaction (never geocode while holding a transaction — ADR 0007):

```ts
  const located = stops?.length ? await locateRoughStops(stops) : [];
  const stopRows = roughStopRows(located, { startDate, endDate });
```

  with, below `createTrip` (not exported — a "use server" file's exports are public actions):

```ts
async function locateRoughStops(stops: RoughStopInput[]) {
  const out: RoughStopInput[] = [];
  for (const s of stops) {
    if (s.lat !== undefined && s.lng !== undefined) {
      out.push(s);
      continue;
    }
    const geo = await geocodePlaceDetailed(s.name);
    out.push({ ...s, lat: geo?.lat, lng: geo?.lng, countryCode: s.countryCode ?? geo?.countryCode ?? undefined });
  }
  return out;
}
```

- In `tx.trip.create` data add `roughMonth: startDate ? null : (roughMonth ?? null),`. After the owner membership: `for (const row of stopRows) await tx.stop.create({ data: { tripId: newTrip.id, ...row } });`.
- Replace `redirect(tripPath(slug)); return …` with:

```ts
  const isPast = !!endDate && endDate < todayISO();
  return { success: true, tripId: trip.id, href: stopRows.length > 0 && isPast ? `/globe?added=${trip.id}` : tripPath(slug) };
```

  Keep the `redirect` import (deleteTrip still uses it).

Run: `npm test -- server/actions/trips.test.ts` — Expected: PASS.

- [ ] **Step 8: Keep the old form working until Task 14**

`app/(app)/trips/new/new-trip-form.tsx`: add `import { useRouter } from "next/navigation";`, `const router = useRouter();`, and in the transition replace the tail with `if (result.success) router.push(result.href); else setErrors(result.errors);` (delete the "won't be reached" comment). In `new-trip-form.test.tsx` add `const pushMock = vi.fn(); vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));` above the import and, in "submits the trip name and default currency", `mockResolvedValue({ success: true, tripId: "t1", href: "/trips/kyoto-autumn" })` plus `await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/trips/kyoto-autumn"))`.

Run: `npm test -- "app/(app)/trips/new" server/actions/trips.test.ts lib/validations lib/new-trip lib/server-action-exports.test.ts` — Expected: PASS.

- [ ] **Step 9: Typecheck, lint, commit**

```bash
git add lib/validations/trip.ts lib/validations/trip.test.ts lib/new-trip/rough-stops.ts lib/new-trip/rough-stops.test.ts server/actions/trips.ts server/actions/trips.test.ts "app/(app)/trips/new/new-trip-form.tsx" "app/(app)/trips/new/new-trip-form.test.tsx"
git commit -m "feat(trips): createTrip takes a rough month, picked home, rough stops; returns href

The flow navigates itself so it can play the create motion first.
fromShareToken is accepted and ignored until Route copy (phase 4).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 4: A rough month falls away on a start date, and shows on the Trips card and the Home countdown tile

**Files:**
- Modify: `server/actions/trips.ts` (`updateTrip`) + `server/actions/trips.test.ts`
- Modify: `server/actions/stops.ts` (the two `db.trip.update({ … data: { startDate: newStart, endDate: newEnd } })` calls, in `firmUpSegment` ~l.923 and `firmUpTrip` ~l.1053) + `server/actions/stops.test.ts`
- Modify: `lib/countdown.ts` + `lib/countdown.test.ts`
- Modify: `components/trip/home/desktop/countdown-tile.tsx` + `countdown-tile.test.tsx`
- Modify: `lib/trips/trip-status.ts` + `lib/trips/trip-status.test.ts`
- Modify: `components/trips/trip-card.tsx` (`BigNumberBlock`) + `components/trips/trip-card.test.tsx`
- Modify: `components/trips/cover-stamp.tsx` (`dateLabel` prop) + `cover-stamp.test.tsx`
- Modify: `components/trips/trip-cover.tsx` (`TripCoverInput.stampDateLabel`)
- Modify: `lib/trips/trips-page-loader.ts` + `lib/trips/trips-page-loader.test.ts`
- Modify: `app/(app)/trips/[tripId]/page.tsx` (select `roughMonth`, pass it to `countdownFor`, add `roughMonth: string | null` to `renderDesktopHome`'s `trip` type)

**Interfaces:**
- Consumes: `formatRoughMonth`, `roughMonthStamp` (Task 1).
- Produces:
  - `Countdown` gains `{ kind: "rough-month"; month: string }`; `countdownFor({ startDate, endDate, today, roughMonth?: string | null })` returns it only when there is no `startDate`; `countdownLabel` → `"Sometime in April"`.
  - `BigNumber` gains `lead?: string`; `cardBigNumber({ kind, startDate, endDate, today, roughMonth?: string | null })` → `{ value: "April", unit: null, lead: "Sometime in" }` for an Idea with a rough month; `cardAccessibleName` reads the lead.
  - `CoverStamp` prop `dateLabel?: string` — overrides the date row text (and shows the row without a `startDate`).
  - `TripCoverInput.stampDateLabel?: string | null` → passed to `CoverStamp` as `dateLabel`.

- [ ] **Step 1: Write the failing tests**

`server/actions/trips.test.ts`, in `describe("updateTrip")`:

```ts
  it("setting a start date clears the rough month (CONTEXT.md Rough month)", async () => {
    tripUpdateMock.mockResolvedValue({});
    await updateTrip(TRIP_ID, VALID_INPUT);
    expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: TRIP_ID }, data: expect.objectContaining({ roughMonth: null }) });
  });

  it("saving without a start date leaves the rough month alone", async () => {
    tripUpdateMock.mockResolvedValue({});
    await updateTrip(TRIP_ID, { name: "Japan", homeCurrency: "AUD" });
    expect(tripUpdateMock.mock.calls[0][0].data).not.toHaveProperty("roughMonth");
  });
```

`server/actions/stops.test.ts`: every expectation of the form `expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: … }, data: { startDate: …, endDate: … } })` (find them with `grep -n "tripUpdateMock).toHaveBeenCalledWith" server/actions/stops.test.ts`; at least ~l.1485, ~l.2990, ~l.3029 — **not** the `chapterUpdateMock` ones) gets `roughMonth: null` added to `data`.

`lib/countdown.test.ts`:

```ts
describe("countdownFor — rough month", () => {
  it("a date-less trip with a rough month reads Sometime in", () => {
    const c = countdownFor({ startDate: null, endDate: null, today: "2026-09-30", roughMonth: "2027-04" });
    expect(c).toEqual({ kind: "rough-month", month: "April" });
    expect(countdownLabel(c)).toBe("Sometime in April");
  });
  it("a start date wins over a stale rough month", () => {
    expect(countdownFor({ startDate: "2026-12-04", endDate: null, today: "2026-09-30", roughMonth: "2027-04" }).kind).toBe("sleeps");
  });
  it("no rough month is still no-dates", () => {
    expect(countdownFor({ startDate: null, endDate: null, today: "2026-09-30", roughMonth: null }).kind).toBe("no-dates");
  });
});
```

`components/trip/home/desktop/countdown-tile.test.tsx` (use its `renderTile` helper):

```ts
  it("a rough month reads 'Sometime in April' in the number's place", () => {
    renderTile({ countdown: { kind: "rough-month", month: "April" } });
    expect(screen.getByRole("img", { name: "Sometime in April" })).toBeInTheDocument();
    expect(screen.getByText("Sometime in")).toBeInTheDocument();
    expect(screen.getByText("April")).toBeInTheDocument();
  });
```

`lib/trips/trip-status.test.ts`:

```ts
describe("cardBigNumber — rough month", () => {
  it("an Idea with a rough month shows Sometime in + the month", () => {
    expect(cardBigNumber({ kind: "idea", startDate: null, endDate: null, today: "2026-09-30", roughMonth: "2027-04" }))
      .toEqual({ value: "April", unit: null, lead: "Sometime in" });
  });
  it("names it for screen readers", () => {
    expect(cardAccessibleName("Japan", "idea", { value: "April", unit: null, lead: "Sometime in" })).toBe("Japan, idea, Sometime in April");
  });
});
```

`components/trips/trip-card.test.tsx` — reuse the file's model fixture (spread it) with `kind: "idea"` and `big: { value: "April", unit: null, lead: "Sometime in" }`; assert `screen.getByText("Sometime in")` and `screen.getByText("April")` are present.

`components/trips/cover-stamp.test.tsx`:

```ts
  it("a dateLabel shows on the date row even without a start date", () => {
    render(<CoverStamp name="Japan" place="JAPAN" startDate={null} dateLabel="APR 27" hue="coral" size="hero" />);
    expect(screen.getByText("APR 27")).toBeInTheDocument();
    expect(screen.getByText(/SOMEDAY/)).toBeInTheDocument();
  });
```

`lib/trips/trips-page-loader.test.ts` — following the file's existing fixtures (add `roughMonth: null` wherever its trip fixtures list `startDate`), add a case where a date-less trip has `roughMonth: "2027-04"`: its card has `big.lead === "Sometime in"` and `cover.stampDateLabel === "APR 27"`; a dated trip's card has `cover.stampDateLabel === null`.

Run: `npm test -- server/actions lib/countdown.test.ts lib/trips components/trips components/trip/home/desktop/countdown-tile.test.tsx` — Expected: FAIL on each new case.

- [ ] **Step 2: Implement**

- `updateTrip` data: add `...(startDate ? { roughMonth: null } : {}),` beside `hardEndDate`.
- `stops.ts`, both trip updates: `data: { startDate: newStart, endDate: newEnd, roughMonth: null }` with the comment `// A Rough month falls away once the Trip has a start date (CONTEXT.md).`
- `lib/countdown.ts`: add the union member, the `roughMonth?: string | null` parameter, `if (!startDate) return roughMonth ? { kind: "rough-month", month: formatRoughMonth(roughMonth, today) } : { kind: "no-dates" };`, and `case "rough-month": return \`Sometime in ${c.month}\`;`.
- `countdown-tile.tsx`: `countdownParts` returns `{ value: string; unit: [string, string] | null; lead?: string }`; `case "rough-month": return { value: c.month, unit: null, lead: "Sometime in" };`. `numberRow` becomes a `role="img"` wrapper holding, first, `{lead ? <span className={cn("block font-display font-extrabold leading-none", hasPhoto ? "mb-1.5 text-[28px]" : "mb-1 text-[22px]")}>{lead}</span> : null}` and then the existing `flex items-baseline` row (move `role`/`aria-label` to the wrapper).
- `lib/trips/trip-status.ts`: `BigNumber.lead?: string` (doc: "A line above the value — 'Sometime in' for a Rough month"); `cardBigNumber` takes `roughMonth?: string | null` and, in the `kind === "idea"` branch first: `if (roughMonth && !startDate) return { value: formatRoughMonth(roughMonth, today), unit: null, lead: "Sometime in" };`. `cardAccessibleName`: `const countdown = big.lead ? \`${big.lead} ${big.value}\` : …existing…`.
- `BigNumberBlock` (`components/trips/trip-card.tsx`): when `big.lead` is set, return

```tsx
      <div className="flex flex-col">
        <span className="font-display text-[15px] font-extrabold leading-none md:text-[17px]">{big.lead}</span>
        <span className="mt-1 font-display text-[34px] font-extrabold leading-[0.95] tracking-[-0.03em] md:text-[40px]">{big.value}</span>
      </div>
```

  (ignoring `numberClass`/`unitClass` — a month name at 96px would overflow the 220px card).
- `CoverStamp`: `dateLabel?: string` in props; `const date = dateLabel ?? (startDate ? stampDate(startDate) : null);` and render the date row from `date`. The eyebrow logic is unchanged.
- `TripCoverInput`: `stampDateLabel?: string | null;` (doc: "Replaces the stamp's date line — a Rough month's 'APR 27'"); `CoverArt` destructures it and passes `dateLabel={stampDateLabel ?? undefined}` to `CoverStamp`.
- `trips-page-loader.ts`: select `roughMonth: true`; `cardBigNumber({ …, roughMonth: t.roughMonth })`; `cover.stampDateLabel: !t.startDate && t.roughMonth ? roughMonthStamp(t.roughMonth) : null`.
- `app/(app)/trips/[tripId]/page.tsx`: `roughMonth: true` in the trip select; `countdownFor({ startDate: trip.startDate, endDate: trip.endDate, today, roughMonth: trip.roughMonth })`; add `roughMonth: string | null;` to `renderDesktopHome`'s `trip` type.
- Any other `switch (c.kind)` over `Countdown` that `tsc` flags as non-exhaustive (e.g. `lib/trips/trip-status.ts`'s `cardBigNumber` switch): `case "rough-month":` behaves like `"no-dates"` there.

- [ ] **Step 3: Run the tests**

Run: `npm test -- server/actions lib/countdown.test.ts lib/trips components/trips components/trip/home "app/(app)/trips/[tripId]"` — Expected: PASS.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
git add server/actions/trips.ts server/actions/trips.test.ts server/actions/stops.ts server/actions/stops.test.ts lib/countdown.ts lib/countdown.test.ts components/trip/home/desktop/countdown-tile.tsx components/trip/home/desktop/countdown-tile.test.tsx lib/trips components/trips/trip-card.tsx components/trips/trip-card.test.tsx components/trips/cover-stamp.tsx components/trips/cover-stamp.test.tsx components/trips/trip-cover.tsx "app/(app)/trips/[tripId]/page.tsx"
git commit -m "feat(trip): Rough month clears on a start date; shows as Sometime in on cards and Home

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 5: `currencyForCountry`, `PickedPlace` helpers and the session-gated `findPlaces` action

**Files:**
- Create: `lib/currency-for-country.ts` + `lib/currency-for-country.test.ts`
- Create: `lib/picked-place.ts` + `lib/picked-place.test.ts`
- Create: `server/actions/places.ts` + `server/actions/places.test.ts`
- Modify: `lib/server-action-exports.test.ts` (allowlist `"places.ts": ["findPlaces"]`)

**Interfaces:**
- Consumes: `CURRENCY_CODES` (`lib/currencies.ts`), `GeoCandidate`, `searchPlacesWithStatus`, `PlaceSearchOutcome` (`lib/geocode.ts`), `haversineKm` (`lib/geo.ts`), `requireUser` (`lib/guards.ts`).
- Produces:
  - `currencyForCountry(iso2: string): string | undefined` — case-insensitive; only ever returns a code in `CURRENCY_CODES`.
  - `interface PickedPlace { name: string; region?: string; lat: number; lng: number; countryCode?: string }` (countryCode lower-case, as `Stop.countryCode` stores it). Task 7 re-exports it from `components/ui/place-combobox.tsx`.
  - `toPickedPlace(c: GeoCandidate): PickedPlace | null`; `pickedPlaces(cs: GeoCandidate[], rankNear?: { lat: number; lng: number }): PickedPlace[]` (maps, drops nulls and duplicate name+region, sorts by distance when `rankNear` is given).
  - `findPlaces(query: string): Promise<PlaceSearchOutcome>` ("use server").

- [ ] **Step 1: Write the failing tests**

`lib/currency-for-country.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { currencyForCountry } from "./currency-for-country";
import { CURRENCY_CODES } from "./currencies";

describe("currencyForCountry", () => {
  it.each([["au", "AUD"], ["AU", "AUD"], ["nz", "NZD"], ["us", "USD"], ["de", "EUR"], ["fr", "EUR"], ["gb", "GBP"], ["jp", "JPY"], ["ch", "CHF"], ["ca", "CAD"], ["sg", "SGD"], ["th", "THB"]])("%s → %s", (cc, code) => {
    expect(currencyForCountry(cc)).toBe(code);
  });
  it("is undefined for a country whose currency we don't offer", () => {
    expect(currencyForCountry("id")).toBeUndefined();
    expect(currencyForCountry("")).toBeUndefined();
  });
  it("only ever returns a supported currency, and covers every one", async () => {
    const { BY_COUNTRY } = await import("./currency-for-country");
    const values = new Set(Object.values(BY_COUNTRY));
    for (const v of values) expect(CURRENCY_CODES).toContain(v);
    for (const code of CURRENCY_CODES) expect(values.has(code)).toBe(true);
  });
});
```

`lib/picked-place.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toPickedPlace, pickedPlaces } from "./picked-place";

const sydneyAu = { name: "Sydney, Council of the City of Sydney, New South Wales, 2000, Australia", lat: -33.87, lng: 151.21, city: "Sydney", country: "Australia", countryCode: "au" };
const sydneyCa = { name: "Sydney, Cape Breton Regional Municipality, Nova Scotia, B1P 1A1, Canada", lat: 46.14, lng: -60.19, city: "Sydney", country: "Canada", countryCode: "ca" };

describe("toPickedPlace", () => {
  it("takes the first part as the name and the last two non-postcode parts as the region", () => {
    expect(toPickedPlace(sydneyAu)).toEqual({ name: "Sydney", region: "New South Wales, Australia", lat: -33.87, lng: 151.21, countryCode: "au" });
    expect(toPickedPlace(sydneyCa)?.region).toBe("Nova Scotia, Canada");
  });
  it("a country-level result has only the country as its region", () => {
    expect(toPickedPlace({ name: "Japan", lat: 36, lng: 138, city: null, country: "Japan", countryCode: "jp" })).toEqual({ name: "Japan", lat: 36, lng: 138, countryCode: "jp" });
  });
  it("drops a nameless result", () => {
    expect(toPickedPlace({ name: "", lat: 0, lng: 0, city: null, country: null, countryCode: null })).toBeNull();
  });
});

describe("pickedPlaces", () => {
  it("de-duplicates by name and region", () => {
    expect(pickedPlaces([sydneyAu, sydneyAu, sydneyCa])).toHaveLength(2);
  });
  it("ranks nearest first when given a point (Plan's near-route ranking)", () => {
    const near = { lat: 45, lng: -63 };
    expect(pickedPlaces([sydneyAu, sydneyCa], near).map((p) => p.countryCode)).toEqual(["ca", "au"]);
  });
  it("keeps the geocoder's order without a point", () => {
    expect(pickedPlaces([sydneyAu, sydneyCa]).map((p) => p.countryCode)).toEqual(["au", "ca"]);
  });
});
```

`server/actions/places.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireUser, search } = vi.hoisted(() => ({ requireUser: vi.fn(), search: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireUser }));
vi.mock("@/lib/geocode", () => ({ searchPlacesWithStatus: search }));

import { findPlaces } from "./places";

describe("findPlaces", () => {
  beforeEach(() => {
    requireUser.mockReset().mockResolvedValue({ id: "u1" });
    search.mockReset().mockResolvedValue({ status: "ok", candidates: [] });
  });
  it("is session-gated before it searches", async () => {
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(findPlaces("Sydney")).rejects.toThrow();
    expect(search).not.toHaveBeenCalled();
  });
  it("searches five results", async () => {
    await findPlaces("Sydney");
    expect(search).toHaveBeenCalledWith("Sydney", 5);
  });
  it("refuses a non-string and caps the query length", async () => {
    expect(await findPlaces(42 as unknown as string)).toEqual({ status: "ok", candidates: [] });
    await findPlaces("x".repeat(500));
    expect(search.mock.calls[0][0]).toHaveLength(200);
  });
});
```

Run: `npm test -- lib/currency-for-country.test.ts lib/picked-place.test.ts server/actions/places.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 2: Implement**

`lib/currency-for-country.ts`:

```ts
/**
 * ISO 3166-1 alpha-2 → a home currency Teepee offers (lib/currencies.ts).
 * Only countries whose everyday currency is one of those; anything else is
 * undefined and the caller keeps what it had (NEW_TRIP.md §4).
 */
const EUR = ["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES", "AD", "MC", "SM", "VA", "ME", "XK", "GF", "GP", "MQ", "RE", "YT", "PM", "BL", "MF", "AX"];
const USD = ["US", "PR", "GU", "VI", "AS", "MP", "UM", "EC", "SV", "TL", "FM", "MH", "PW", "BQ", "TC", "VG", "IO"];

export const BY_COUNTRY: Record<string, string> = {
  ...Object.fromEntries(EUR.map((c) => [c, "EUR"])),
  ...Object.fromEntries(USD.map((c) => [c, "USD"])),
  AU: "AUD", CX: "AUD", CC: "AUD", NF: "AUD", NR: "AUD", KI: "AUD", TV: "AUD", HM: "AUD",
  NZ: "NZD", CK: "NZD", NU: "NZD", PN: "NZD", TK: "NZD",
  GB: "GBP", IM: "GBP", JE: "GBP", GG: "GBP",
  JP: "JPY",
  CH: "CHF", LI: "CHF",
  CA: "CAD",
  SG: "SGD",
  TH: "THB",
};

export function currencyForCountry(iso2: string): string | undefined {
  return BY_COUNTRY[iso2.trim().toUpperCase()];
}
```

`lib/picked-place.ts`:

```ts
import type { GeoCandidate } from "@/lib/geocode";
import { haversineKm } from "@/lib/geo";

export interface PickedPlace {
  name: string;
  /** "New South Wales, Australia" — tells two Sydneys apart. */
  region?: string;
  lat: number;
  lng: number;
  /** ISO 3166-1 alpha-2, lower-case (as Stop.countryCode stores it). */
  countryCode?: string;
}

export function toPickedPlace(c: GeoCandidate): PickedPlace | null {
  const parts = c.name.split(",").map((p) => p.trim()).filter(Boolean);
  const name = parts[0] ?? c.city ?? "";
  if (!name) return null;
  // Nominatim's display_name runs place → districts → state → postcode → country.
  const rest = parts.slice(1).filter((p) => !/\d/.test(p));
  const region = rest.slice(-2).join(", ");
  return {
    name,
    ...(region ? { region } : {}),
    lat: c.lat,
    lng: c.lng,
    ...(c.countryCode ? { countryCode: c.countryCode.toLowerCase() } : {}),
  };
}

export function pickedPlaces(cs: GeoCandidate[], rankNear?: { lat: number; lng: number }): PickedPlace[] {
  const seen = new Set<string>();
  const out: PickedPlace[] = [];
  for (const c of cs) {
    const p = toPickedPlace(c);
    if (!p) continue;
    const key = `${p.name}|${p.region ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  if (!rankNear) return out;
  return out
    .map((p, i) => ({ p, i, d: haversineKm(rankNear, p) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.p);
}
```

`server/actions/places.ts`:

```ts
"use server";

import { requireUser } from "@/lib/guards";
import { searchPlacesWithStatus, type PlaceSearchOutcome } from "@/lib/geocode";

/**
 * Place search for a page with no Trip or Globe yet (New trip). Server-side so
 * Nominatim sees our User-Agent; session-gated like every action.
 */
export async function findPlaces(query: string): Promise<PlaceSearchOutcome> {
  await requireUser();
  if (typeof query !== "string") return { status: "ok", candidates: [] };
  return searchPlacesWithStatus(query.slice(0, 200), 5);
}
```

Add `"places.ts": ["findPlaces"],` to `ALLOWLIST` in `lib/server-action-exports.test.ts` (alphabetical position).

- [ ] **Step 3: Run the tests**

Run: `npm test -- lib/currency-for-country.test.ts lib/picked-place.test.ts server/actions/places.test.ts lib/server-action-exports.test.ts` — Expected: PASS.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
git add lib/currency-for-country.ts lib/currency-for-country.test.ts lib/picked-place.ts lib/picked-place.test.ts server/actions/places.ts server/actions/places.test.ts lib/server-action-exports.test.ts
git commit -m "feat(places): currencyForCountry, PickedPlace helpers, session-gated findPlaces

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---
### Task 6: `RangeCalendar` on a pure month grid, and the `bg-range` token

Implements NEW_TRIP.md §3 "Exact dates" (the MOTION N8 band fill comes in Task 17; the hover preview is here).

**Files:**
- Create: `lib/calendar-grid.ts` + `lib/calendar-grid.test.ts`
- Create: `components/ui/range-calendar.tsx` + `components/ui/range-calendar.test.tsx`
- Modify: `app/globals.css` (`@theme inline` block, beside `--color-coral-text`) + `app/globals-tokens.test.ts`

**Interfaces:**
- Consumes: `addMonths`, `endOfMonthISO`, `parseISODate`, `addDays`, `formatLongDate`, `formatMonthYear`, `todayLocalISO` (`lib/dates.ts`).
- Produces:
  - `lib/calendar-grid.ts`: `interface DateRange { start?: string; end?: string }`; `type DayState = "none" | "start" | "end" | "single" | "in" | "preview"`; `monthCells(ym): (string | null)[]` (Monday-first, padded to whole weeks); `nextRange(r, day): DateRange`; `dayState(day, r, hover?): DayState`; `isDayDisabled(day, disableBefore?, disableAfter?): boolean` (**`disableBefore`: days strictly before it are disabled; `disableAfter`: days strictly after it**); `shiftDay(day, key): string | null`; `addMonthKey(ym, n): string`.
  - `components/ui/range-calendar.tsx`: `export function RangeCalendar(props: { start?: string; end?: string; onChange: (r: { start?: string; end?: string }) => void; months?: 1 | 2; disableBefore?: string; disableAfter?: string; className?: string })`. `months={2}` shows two months from `md` and one below it (the second card is `hidden md:block`). Each day is a `<button aria-label="Fri 4 Dec 2026" aria-pressed data-day data-state>`.
  - Tailwind colour `range` (`bg-range`, `bg-range/60`) = `hsl(var(--coral) / 0.25)`.

- [ ] **Step 1: Write the failing grid test** — `lib/calendar-grid.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { monthCells, nextRange, dayState, isDayDisabled, shiftDay, addMonthKey } from "./calendar-grid";

describe("monthCells", () => {
  it("starts on Monday and pads to whole weeks", () => {
    const cells = monthCells("2026-12"); // 1 Dec 2026 is a Tuesday
    expect(cells[0]).toBeNull();
    expect(cells[1]).toBe("2026-12-01");
    expect(cells).toContain("2026-12-31");
    expect(cells.length % 7).toBe(0);
  });
  it("needs no lead padding when the 1st is a Monday", () => {
    expect(monthCells("2027-02")[0]).toBe("2027-02-01");
  });
});

describe("nextRange", () => {
  it("first pick starts, second ends", () => {
    expect(nextRange({}, "2026-12-04")).toEqual({ start: "2026-12-04" });
    expect(nextRange({ start: "2026-12-04" }, "2027-01-08")).toEqual({ start: "2026-12-04", end: "2027-01-08" });
  });
  it("a pick before the start restarts", () => {
    expect(nextRange({ start: "2026-12-04" }, "2026-12-01")).toEqual({ start: "2026-12-01" });
  });
  it("a pick after a finished range restarts", () => {
    expect(nextRange({ start: "2026-12-04", end: "2026-12-08" }, "2026-12-10")).toEqual({ start: "2026-12-10" });
  });
  it("the same day twice is a same-day trip", () => {
    expect(nextRange({ start: "2026-12-04" }, "2026-12-04")).toEqual({ start: "2026-12-04", end: "2026-12-04" });
  });
});

describe("dayState", () => {
  const r = { start: "2026-12-04", end: "2026-12-08" };
  it("marks start, in, end and outside", () => {
    expect(dayState("2026-12-04", r)).toBe("start");
    expect(dayState("2026-12-06", r)).toBe("in");
    expect(dayState("2026-12-08", r)).toBe("end");
    expect(dayState("2026-12-09", r)).toBe("none");
  });
  it("a same-day range is single", () => {
    expect(dayState("2026-12-04", { start: "2026-12-04", end: "2026-12-04" })).toBe("single");
  });
  it("previews the band up to the hovered day before the end is picked", () => {
    expect(dayState("2026-12-04", { start: "2026-12-04" }, "2026-12-06")).toBe("start");
    expect(dayState("2026-12-05", { start: "2026-12-04" }, "2026-12-06")).toBe("preview");
    expect(dayState("2026-12-06", { start: "2026-12-04" }, "2026-12-06")).toBe("preview");
    expect(dayState("2026-12-04", { start: "2026-12-04" })).toBe("single");
  });
});

describe("isDayDisabled", () => {
  it("disables strictly before and strictly after", () => {
    expect(isDayDisabled("2026-09-30", "2026-10-01")).toBe(true);
    expect(isDayDisabled("2026-10-01", "2026-10-01")).toBe(false);
    expect(isDayDisabled("2026-10-01", undefined, "2026-09-30")).toBe(true);
    expect(isDayDisabled("2026-09-30", undefined, "2026-09-30")).toBe(false);
  });
});

describe("shiftDay / addMonthKey", () => {
  it("moves by a day or a week", () => {
    expect(shiftDay("2026-12-31", "ArrowRight")).toBe("2027-01-01");
    expect(shiftDay("2026-12-04", "ArrowUp")).toBe("2026-11-27");
    expect(shiftDay("2026-12-04", "Tab")).toBeNull();
  });
  it("pages months across the year", () => {
    expect(addMonthKey("2026-12", 1)).toBe("2027-01");
    expect(addMonthKey("2026-01", -1)).toBe("2025-12");
  });
});
```

Run: `npm test -- lib/calendar-grid.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Implement** — `lib/calendar-grid.ts`:

```ts
import { addDays, addMonths, endOfMonthISO, parseISODate } from "@/lib/dates";

export interface DateRange {
  start?: string;
  end?: string;
}

export type DayState = "none" | "start" | "end" | "single" | "in" | "preview";

export function monthCells(ym: string): (string | null)[] {
  const first = `${ym}-01`;
  const lead = (parseISODate(first).getUTCDay() + 6) % 7;
  const days = Number(endOfMonthISO(first).slice(8, 10));
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function nextRange(r: DateRange, day: string): DateRange {
  if (!r.start || r.end || day < r.start) return { start: day };
  return { start: r.start, end: day };
}

export function dayState(day: string, r: DateRange, hover?: string): DayState {
  const { start, end } = r;
  if (!start) return "none";
  if (end) {
    if (day === start && day === end) return "single";
    if (day === start) return "start";
    if (day === end) return "end";
    return day > start && day < end ? "in" : "none";
  }
  const previewing = hover !== undefined && hover > start;
  if (day === start) return previewing ? "start" : "single";
  return previewing && day > start && day <= hover ? "preview" : "none";
}

export function isDayDisabled(day: string, disableBefore?: string, disableAfter?: string): boolean {
  return (disableBefore !== undefined && day < disableBefore) || (disableAfter !== undefined && day > disableAfter);
}

const STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

export function shiftDay(day: string, key: string): string | null {
  const n = STEP[key];
  return n === undefined ? null : addDays(day, n);
}

export function addMonthKey(ym: string, n: number): string {
  return addMonths(`${ym}-01`, n).slice(0, 7);
}
```

Run: `npm test -- lib/calendar-grid.test.ts` — Expected: PASS.

- [ ] **Step 3: Write the failing component + token tests**

`app/globals-tokens.test.ts`, add inside the describe:

```ts
  it("defines the range band colour once, from coral (NEW_TRIP.md §3)", () => {
    expect(css).toMatch(/--color-range:\s*hsl\(var\(--coral\) \/ 0\.25\);/);
  });
```

`components/ui/range-calendar.test.tsx`:

```tsx
import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RangeCalendar } from "./range-calendar";

type R = { start?: string; end?: string };

function Harness(props: { start?: string; end?: string; onChange?: (r: R) => void; months?: 1 | 2; disableBefore?: string; disableAfter?: string }) {
  const [r, setR] = React.useState<R>({ start: props.start, end: props.end });
  return (
    <RangeCalendar
      months={props.months}
      disableBefore={props.disableBefore}
      disableAfter={props.disableAfter}
      start={r.start}
      end={r.end}
      onChange={(n) => {
        props.onChange?.(n);
        setR(n);
      }}
    />
  );
}

const day = (name: string) => screen.getByRole("button", { name });

describe("RangeCalendar", () => {
  it("opens on the month of disableBefore when nothing is picked", () => {
    render(<Harness disableBefore="2026-10-01" />);
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
  });

  it("first click sets the start, the second the end", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} disableBefore="2026-10-01" />);
    await userEvent.click(day("Thu 15 Oct 2026"));
    expect(onChange).toHaveBeenLastCalledWith({ start: "2026-10-15" });
    await userEvent.click(day("Tue 20 Oct 2026"));
    expect(onChange).toHaveBeenLastCalledWith({ start: "2026-10-15", end: "2026-10-20" });
  });

  it("marks the start, the days between and the end", () => {
    render(<Harness start="2026-10-15" end="2026-10-20" />);
    expect(day("Thu 15 Oct 2026")).toHaveAttribute("data-state", "start");
    expect(day("Sat 17 Oct 2026")).toHaveAttribute("data-state", "in");
    expect(day("Tue 20 Oct 2026")).toHaveAttribute("data-state", "end");
    expect(day("Sat 17 Oct 2026")).toHaveAttribute("aria-pressed", "true");
    expect(day("Wed 21 Oct 2026")).toHaveAttribute("aria-pressed", "false");
  });

  it("disables days before disableBefore and ignores clicks on them", async () => {
    const onChange = vi.fn();
    render(<Harness start="2026-10-15" disableBefore="2026-10-10" onChange={onChange} />);
    expect(day("Fri 9 Oct 2026")).toBeDisabled();
    await userEvent.click(day("Fri 9 Oct 2026"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
  });

  it("with disableAfter opens on the two months that end there (past mode)", () => {
    render(<Harness months={2} disableAfter="2026-09-30" />);
    expect(screen.getByRole("heading", { name: "August 2026" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "September 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });

  it("two months: the second card only shows from md", () => {
    render(<Harness months={2} start="2026-12-04" />);
    const second = screen.getByRole("heading", { name: "January 2027" }).closest("[data-month]")!;
    expect(second.className).toMatch(/\bhidden\b/);
    expect(second.className).toMatch(/\bmd:block\b/);
  });

  it("the arrows page one month", async () => {
    render(<Harness start="2026-10-15" />);
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
  });

  it("previews the band while choosing the end (MOTION N8)", () => {
    render(<Harness start="2026-10-15" />);
    fireEvent.mouseEnter(day("Sat 17 Oct 2026"));
    expect(day("Fri 16 Oct 2026")).toHaveAttribute("data-state", "preview");
  });

  it("arrow keys move focus between days (one tab stop)", async () => {
    render(<Harness start="2026-10-15" />);
    const start = day("Thu 15 Oct 2026");
    expect(start).toHaveAttribute("tabindex", "0");
    expect(day("Fri 16 Oct 2026")).toHaveAttribute("tabindex", "-1");
    start.focus();
    fireEvent.keyDown(start, { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(day("Fri 16 Oct 2026")));
  });

  it("paints the band with the range token only", () => {
    const { container } = render(<Harness start="2026-10-15" end="2026-10-20" />);
    expect(container.innerHTML).toMatch(/bg-range/);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(container.innerHTML).not.toMatch(/shadow-soft|bg-card\/40|border-border\/70/);
  });
});
```

Run: `npm test -- components/ui/range-calendar.test.tsx app/globals-tokens.test.ts` — Expected: FAIL.

- [ ] **Step 4: Implement**

`app/globals.css`, in `@theme inline`, directly after `--color-coral-text: hsl(var(--coral-text));`:

```css
  --color-range: hsl(var(--coral) / 0.25);
```

`components/ui/range-calendar.tsx`:

```tsx
"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatLongDate, formatMonthYear, todayLocalISO } from "@/lib/dates";
import { addMonthKey, dayState, isDayDisabled, monthCells, nextRange, shiftDay, type DateRange, type DayState } from "@/lib/calendar-grid";
import { cn } from "@/lib/cn";

export interface RangeCalendarProps {
  start?: string;
  end?: string;
  onChange: (r: DateRange) => void;
  /** 2 = two months side by side from md; phones always see one. */
  months?: 1 | 2;
  /** Days strictly before this are disabled. */
  disableBefore?: string;
  /** Days strictly after this are disabled. */
  disableAfter?: string;
  className?: string;
}

const WEEKDAYS = [["M", "Monday"], ["T", "Tuesday"], ["W", "Wednesday"], ["T", "Thursday"], ["F", "Friday"], ["S", "Saturday"], ["S", "Sunday"]] as const;

// Where the band sits inside a cell: from the middle out on the ends, full width between.
const BAND: Record<DayState, string> = {
  none: "hidden",
  single: "hidden",
  start: "left-1/2 right-0",
  end: "left-0 right-1/2",
  in: "inset-x-0",
  preview: "inset-x-0",
};
const ENDPOINT = new Set<DayState>(["start", "end", "single"]);

function openingMonth(p: Pick<RangeCalendarProps, "start" | "disableBefore" | "disableAfter">, months: number): string {
  if (p.start) return p.start.slice(0, 7);
  if (p.disableAfter) return addMonthKey(p.disableAfter.slice(0, 7), -(months - 1));
  if (p.disableBefore) return p.disableBefore.slice(0, 7);
  return todayLocalISO().slice(0, 7);
}

export function RangeCalendar({ start, end, onChange, months = 1, disableBefore, disableAfter, className }: RangeCalendarProps) {
  const [first, setFirst] = React.useState(() => openingMonth({ start, disableBefore, disableAfter }, months));
  const [hover, setHover] = React.useState<string>();
  const [focusDay, setFocusDay] = React.useState<string | undefined>(start);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const visible = months === 2 ? [first, addMonthKey(first, 1)] : [first];
  const last = visible[visible.length - 1];
  const canPrev = !disableBefore || addMonthKey(first, -1) >= disableBefore.slice(0, 7);
  const canNext = !disableAfter || addMonthKey(last, 1) <= disableAfter.slice(0, 7);
  const enabledVisible = visible.flatMap(monthCells).filter((d): d is string => d !== null && !isDayDisabled(d, disableBefore, disableAfter));
  const tabDay = focusDay && enabledVisible.includes(focusDay) ? focusDay : enabledVisible[0];
  const range = { start, end };

  function pick(day: string) {
    if (isDayDisabled(day, disableBefore, disableAfter)) return;
    setFocusDay(day);
    setHover(undefined);
    onChange(nextRange(range, day));
  }

  function onDayKeyDown(e: React.KeyboardEvent, day: string) {
    const next = shiftDay(day, e.key);
    if (!next) return;
    e.preventDefault();
    if (isDayDisabled(next, disableBefore, disableAfter)) return;
    const m = next.slice(0, 7);
    if (m < first) setFirst(m);
    else if (m > last) setFirst(addMonthKey(m, -(months - 1)));
    setFocusDay(next);
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus());
  }

  return (
    <div ref={rootRef} className={cn("grid gap-4", months === 2 && "md:grid-cols-2", className)} onMouseLeave={() => setHover(undefined)}>
      {visible.map((ym, idx) => {
        const cells = monthCells(ym);
        const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
        const titleId = `rc-${ym}`;
        return (
          <div key={ym} data-month={ym} className={cn("rounded-[20px] border-2 border-border bg-card p-4 shadow-hard-2", idx === 1 && "hidden md:block")}>
            <div className="flex items-center gap-1">
              {idx === 0 ? (
                <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => setFirst(addMonthKey(first, -1))} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <ChevronLeft aria-hidden="true" className="size-5" />
                </button>
              ) : null}
              <h3 id={titleId} className="flex-1 px-1 font-display text-lg font-extrabold">{formatMonthYear(`${ym}-01`)}</h3>
              {idx === visible.length - 1 ? (
                <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => setFirst(addMonthKey(first, 1))} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <ChevronRight aria-hidden="true" className="size-5" />
                </button>
              ) : null}
            </div>
            <table role="grid" aria-labelledby={titleId} className="mt-2 w-full table-fixed border-collapse">
              <thead>
                <tr>
                  {WEEKDAYS.map(([initial, full], i) => (
                    <th key={i} scope="col" abbr={full} className="pb-1 text-[13px] font-bold text-muted-foreground">{initial}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week, w) => (
                  <tr key={w}>
                    {week.map((d, i) => {
                      if (!d) return <td key={i} className="p-0" />;
                      const state = dayState(d, range, end ? undefined : hover);
                      const disabled = isDayDisabled(d, disableBefore, disableAfter);
                      return (
                        <td key={d} className="p-0 py-0.5">
                          <button
                            type="button"
                            data-day={d}
                            data-state={state}
                            aria-label={formatLongDate(d)}
                            aria-pressed={state !== "none" && state !== "preview"}
                            disabled={disabled}
                            tabIndex={d === tabDay ? 0 : -1}
                            onClick={() => pick(d)}
                            onMouseEnter={() => start && !end && setHover(d)}
                            onKeyDown={(e) => onDayKeyDown(e, d)}
                            className={cn(
                              "relative grid h-9 w-full place-items-center text-[15px] font-bold tabular-nums md:h-[38px]",
                              "focus-visible:z-20 focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring",
                              disabled ? "cursor-not-allowed text-muted-foreground/50" : "cursor-pointer",
                            )}
                          >
                            <span aria-hidden="true" className={cn("absolute inset-y-0", BAND[state], end ? "bg-range" : "bg-range/60")} />
                            <span className={cn("relative z-10 grid size-9 place-items-center rounded-full md:size-[38px]", ENDPOINT.has(state) && "bg-foreground text-background")}>
                              {Number(d.slice(8))}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
```

Mobile cells: 7 columns across a 390px card are ~46px wide, so the hit area is ≥44px wide as NEW_TRIP.md §3 asks.

- [ ] **Step 5: Run the tests**

Run: `npm test -- lib/calendar-grid.test.ts components/ui/range-calendar.test.tsx app/globals-tokens.test.ts` — Expected: PASS.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
git add lib/calendar-grid.ts lib/calendar-grid.test.ts components/ui/range-calendar.tsx components/ui/range-calendar.test.tsx app/globals.css app/globals-tokens.test.ts
git commit -m "feat(ui): RangeCalendar on a pure month grid; bg-range token

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 7: `PlaceCombobox` and `CurrencyRow`

Implements NEW_TRIP.md §4 (combobox, "Show money in" row). Motion N10 is Task 17.

**Files:**
- Create: `components/ui/place-combobox.tsx` + `components/ui/place-combobox.test.tsx`
- Create: `components/ui/currency-row.tsx` + `components/ui/currency-row.test.tsx`

**Interfaces:**
- Consumes: `findPlaces` (`server/actions/places.ts`), `pickedPlaces`, `PickedPlace` (`lib/picked-place.ts`), `CURRENCIES`, `currencyName` (`lib/currencies.ts`), `Popover`, `PopoverTrigger`, `PopoverContent` (`components/ui/popover.tsx`).
- Produces:
  - `export type { PickedPlace } from "@/lib/picked-place"` (re-exported so callers import it from the combobox, per the cross-phase contract).
  - `export function PlaceCombobox(props: { value: string; onValueChange: (text: string) => void; onPick: (p: PickedPlace) => void; placeholder?: string; rankNear?: { lat: number; lng: number }; autoFocus?: boolean; id?: string; "aria-label"?: string; disabled?: boolean })` — debounced (350ms, ≥2 chars) search; `role="combobox"` input + `role="listbox"` results; Enter on a highlighted result picks it and calls `preventDefault()` + `stopPropagation()`; Escape with the list open closes it and stops propagation; a search error shows a free-text fallback line. A picked value is not searched again.
  - `export function CurrencyRow(props: { value: string; onChange: (code: string) => void; note?: React.ReactNode })` — "Show money in" label, `bg-sun` row (code, full name, **Change**), Change opens a Popover with a search box and every `CURRENCIES` entry.

- [ ] **Step 1: Write the failing tests**

`components/ui/place-combobox.test.tsx`:

```tsx
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { findPlaces } = vi.hoisted(() => ({ findPlaces: vi.fn() }));
vi.mock("@/server/actions/places", () => ({ findPlaces: (q: string) => findPlaces(q) }));

import { PlaceCombobox, type PickedPlace } from "./place-combobox";

const SYD_AU = { name: "Sydney, Council of the City of Sydney, New South Wales, 2000, Australia", lat: -33.87, lng: 151.21, city: "Sydney", country: "Australia", countryCode: "au" };
const SYD_CA = { name: "Sydney, Cape Breton Regional Municipality, Nova Scotia, B1P 1A1, Canada", lat: 46.14, lng: -60.19, city: "Sydney", country: "Canada", countryCode: "ca" };

const submitted = vi.fn();
const outerKey = vi.fn();

function Harness({ onPick = vi.fn(), rankNear }: { onPick?: (p: PickedPlace) => void; rankNear?: { lat: number; lng: number } }) {
  const [v, setV] = React.useState("");
  return (
    <div onKeyDown={(e) => outerKey(e.key)}>
      <form onSubmit={(e) => { e.preventDefault(); submitted(); }}>
        <PlaceCombobox value={v} onValueChange={setV} onPick={onPick} rankNear={rankNear} aria-label="Leaving from" />
      </form>
    </div>
  );
}

const input = () => screen.getByRole("combobox", { name: "Leaving from" });
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("PlaceCombobox", () => {
  beforeEach(() => {
    findPlaces.mockReset().mockResolvedValue({ status: "ok", candidates: [SYD_AU, SYD_CA] });
    submitted.mockReset();
    outerKey.mockReset();
  });

  it("searches after a pause and lists name and region", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Syd");
    expect(await screen.findByRole("option", { name: /Sydney.*New South Wales, Australia/ })).toBeInTheDocument();
    expect(findPlaces).toHaveBeenCalledTimes(1);
    expect(findPlaces).toHaveBeenCalledWith("Syd");
    expect(input()).toHaveAttribute("aria-expanded", "true");
  });

  it("does not search under two characters", async () => {
    render(<Harness />);
    await userEvent.type(input(), "S");
    await pause(500);
    expect(findPlaces).not.toHaveBeenCalled();
  });

  it("highlights the first result and follows the arrow keys", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Syd");
    const options = await screen.findAllByRole("option");
    expect(input()).toHaveAttribute("aria-activedescendant", options[0].id);
    await userEvent.keyboard("{ArrowDown}");
    expect(input()).toHaveAttribute("aria-activedescendant", options[1].id);
    expect(options[1]).toHaveAttribute("aria-selected", "true");
  });

  it("Enter picks the highlighted result and does not submit the form", async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith({ name: "Sydney", region: "New South Wales, Australia", lat: -33.87, lng: 151.21, countryCode: "au" });
    expect(submitted).not.toHaveBeenCalled();
    expect(input()).toHaveValue("Sydney");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("a picked value is not searched again", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    await pause(500);
    expect(findPlaces).toHaveBeenCalledTimes(1);
  });

  it("Escape closes the list without bubbling", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(outerKey).not.toHaveBeenCalledWith("Escape");
  });

  it("a search failure falls back to what was typed", async () => {
    findPlaces.mockResolvedValue({ status: "error" });
    render(<Harness />);
    await userEvent.type(input(), "Sydney");
    expect(await screen.findByText(/isn't available right now/)).toBeInTheDocument();
    expect(input()).toHaveValue("Sydney");
  });

  it("rankNear puts the nearest result first", async () => {
    render(<Harness rankNear={{ lat: 45, lng: -63 }} />);
    await userEvent.type(input(), "Syd");
    const options = await screen.findAllByRole("option");
    expect(options[0]).toHaveTextContent("Nova Scotia");
  });

  it("uses tokens only", async () => {
    const { container } = render(<Harness />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(container.innerHTML).not.toMatch(/shadow-soft|bg-card\/40|border-border\/70/);
  });
});
```

`components/ui/currency-row.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CurrencyRow } from "./currency-row";

describe("CurrencyRow", () => {
  it("shows the code, the full name and the note", () => {
    render(<CurrencyRow value="AUD" onChange={vi.fn()} note="Picked from Sydney. Costs in other currencies convert to this." />);
    expect(screen.getByText("Show money in")).toBeInTheDocument();
    expect(screen.getByText("AUD")).toBeInTheDocument();
    expect(screen.getByText("Australian Dollar")).toBeInTheDocument();
    expect(screen.getByText(/Picked from Sydney/)).toBeInTheDocument();
  });

  it("Change opens a searchable list; choosing one calls onChange and closes", async () => {
    const onChange = vi.fn();
    render(<CurrencyRow value="AUD" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Change currency/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "Search currencies" }), "yen");
    expect(screen.queryByRole("button", { name: /USD/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /JPY/ }));
    expect(onChange).toHaveBeenCalledWith("JPY");
    expect(screen.queryByRole("textbox", { name: "Search currencies" })).toBeNull();
  });

  it("Enter in the search picks the first match without submitting a surrounding form", async () => {
    const onChange = vi.fn();
    const submitted = vi.fn();
    render(<form onSubmit={(e) => { e.preventDefault(); submitted(); }}><CurrencyRow value="AUD" onChange={onChange} /></form>);
    await userEvent.click(screen.getByRole("button", { name: /Change currency/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "Search currencies" }), "euro{Enter}");
    expect(onChange).toHaveBeenCalledWith("EUR");
    expect(submitted).not.toHaveBeenCalled();
  });
});
```

Run: `npm test -- components/ui/place-combobox.test.tsx components/ui/currency-row.test.tsx` — Expected: FAIL (modules missing).

- [ ] **Step 2: Implement `PlaceCombobox`** — `components/ui/place-combobox.tsx`:

```tsx
"use client";

import * as React from "react";
import { findPlaces } from "@/server/actions/places";
import { pickedPlaces, type PickedPlace } from "@/lib/picked-place";
import { cn } from "@/lib/cn";

export type { PickedPlace } from "@/lib/picked-place";

export interface PlaceComboboxProps {
  value: string;
  onValueChange: (text: string) => void;
  onPick: (p: PickedPlace) => void;
  placeholder?: string;
  /** Sort results nearest-first to this point (Plan: the route's centroid). */
  rankNear?: { lat: number; lng: number };
  autoFocus?: boolean;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
}

const DEBOUNCE_MS = 350;
const MIN_CHARS = 2;

type Status = "idle" | "empty" | "error";

export function PlaceCombobox({ value, onValueChange, onPick, placeholder = "Search a town or city", rankNear, autoFocus, id, "aria-label": ariaLabel = "Place", disabled }: PlaceComboboxProps) {
  const listId = React.useId();
  const [results, setResults] = React.useState<PickedPlace[]>([]);
  const [status, setStatus] = React.useState<Status>("idle");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const seq = React.useRef(0);
  const pickedValue = React.useRef<string | null>(null);
  const rankNearRef = React.useRef(rankNear);
  React.useEffect(() => {
    rankNearRef.current = rankNear;
  });

  React.useEffect(() => {
    const q = value.trim();
    if (q.length < MIN_CHARS || q === pickedValue.current) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const res = await findPlaces(q);
      if (mine !== seq.current) return;
      if (res.status === "error") {
        setResults([]);
        setStatus("error");
        setOpen(false);
        return;
      }
      const list = pickedPlaces(res.candidates, rankNearRef.current).slice(0, 5);
      setResults(list);
      setActive(list.length ? 0 : -1);
      setStatus(list.length ? "idle" : "empty");
      setOpen(true);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);

  function pick(p: PickedPlace) {
    pickedValue.current = p.name;
    seq.current++;
    onValueChange(p.name);
    onPick(p);
    setOpen(false);
    setResults([]);
    setStatus("idle");
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    pickedValue.current = null;
    if (next.trim().length < MIN_CHARS) {
      seq.current++;
      setOpen(false);
      setResults([]);
      setStatus("idle");
    }
    onValueChange(next);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === "Enter" && open && results[active]) {
      e.preventDefault();
      e.stopPropagation();
      pick(results[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  const showList = open && results.length > 0;
  return (
    <div className="overflow-hidden rounded-[18px] border-2 border-border bg-card shadow-hard-2">
      <input
        id={id}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        className="h-[60px] w-full bg-transparent px-5 text-xl font-bold text-foreground caret-coral outline-none placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring"
      />
      {showList ? (
        <ul id={listId} role="listbox" aria-label="Places" className="border-t-2 border-border">
          {results.map((p, i) => (
            <li
              key={`${p.name}|${p.region ?? ""}|${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(p)}
              className={cn("relative flex min-h-[52px] cursor-pointer items-center gap-3 px-5 py-2", i === active && "bg-sun/25")}
            >
              <span aria-hidden="true" className="size-3 shrink-0 rounded-full border-2 border-border bg-sun" />
              <span className="min-w-0">
                <span className="block truncate font-bold">{p.name}</span>
                {p.region ? <span className="block truncate text-xs text-muted-foreground">{p.region}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {status === "empty" && open ? (
        <p role="status" className="border-t-2 border-border px-5 py-3 text-[13px] font-semibold text-muted-foreground">No places found. Keep typing, or use it as written.</p>
      ) : null}
      {status === "error" ? (
        <p role="status" className="border-t-2 border-border px-5 py-3 text-[13px] font-semibold text-muted-foreground">Place search isn&apos;t available right now. We&apos;ll use what you typed.</p>
      ) : null}
    </div>
  );
}
```

Note the "empty" branch keeps `open` true so the status shows; `showList` is false because there are no results.

- [ ] **Step 3: Implement `CurrencyRow`** — `components/ui/currency-row.tsx`:

```tsx
"use client";

import * as React from "react";
import { Check, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CURRENCIES, currencyName } from "@/lib/currencies";

export interface CurrencyRowProps {
  value: string;
  onChange: (code: string) => void;
  note?: React.ReactNode;
}

export function CurrencyRow({ value, onChange, note }: CurrencyRowProps) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const needle = q.trim().toLowerCase();
  const list = CURRENCIES.filter((c) => !needle || `${c.code} ${c.name}`.toLowerCase().includes(needle));

  function choose(code: string) {
    onChange(code);
    setOpen(false);
    setQ("");
  }

  return (
    <div>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-foreground">Show money in</p>
      <div className="island mt-2 flex min-h-14 items-center gap-3 rounded-2xl border-2 border-border bg-sun px-4 py-2 text-on-accent">
        <span data-currency-code className="shrink-0 font-display text-[22px] font-extrabold leading-none tabular-nums">{value}</span>
        <span className="min-w-0 truncate text-[15px] font-bold">{currencyName(value)}</span>
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
          <PopoverTrigger asChild>
            <button type="button" aria-label={`Change currency, now ${value}`} className="ml-auto min-h-11 shrink-0 whitespace-nowrap px-1 text-sm font-extrabold text-coral-text underline-offset-2 hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring">
              Change
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-2">
            <label className="flex h-11 items-center gap-2 rounded-[12px] border-2 border-border bg-card px-3">
              <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                aria-label="Search currencies"
                placeholder="Search currencies"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (list[0]) choose(list[0].code);
                  }
                }}
                className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none"
              />
            </label>
            <ul aria-label="Currencies" className="mt-2 max-h-64 overflow-y-auto">
              {list.map((c) => (
                <li key={c.code}>
                  <button type="button" onClick={() => choose(c.code)} aria-current={c.code === value ? "true" : undefined} className="flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left hover:bg-muted focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring">
                    <span className="w-12 shrink-0 font-display text-[15px] font-extrabold tabular-nums">{c.code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span>
                    {c.code === value ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
      {note ? <p className="mt-2 text-[13px] font-medium text-muted-foreground">{note}</p> : null}
    </div>
  );
}
```

Check `components/ui/popover.tsx`'s `PopoverContent` class string for any banned class (`shadow-soft`) — if present, that file is now touched-adjacent; leave it unless the ban test in Task 14 flags it.

- [ ] **Step 4: Run the tests**

Run: `npm test -- components/ui/place-combobox.test.tsx components/ui/currency-row.test.tsx` — Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add components/ui/place-combobox.tsx components/ui/place-combobox.test.tsx components/ui/currency-row.tsx components/ui/currency-row.test.tsx
git commit -m "feat(ui): PlaceCombobox and CurrencyRow

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 8: The draft model and the stamp word

Implements NEW_TRIP.md §1 "State", the per-step validation, `toCreateInput()` (§9 `lib/new-trip/draft.ts`) and §8 (stamp word).

**Files:**
- Create: `lib/new-trip/draft.ts` + `lib/new-trip/draft.test.ts`
- Create: `lib/new-trip/stamp-word.ts` + `lib/new-trip/stamp-word.test.ts`
- Modify: `lib/countries.ts` (add `countryNameList`) + `lib/countries.test.ts`

**Interfaces:**
- Consumes: `CURRENCY_CODES`, `DEFAULT_HOME_CURRENCY`; `currencyForCountry` (Task 5); `isRoughMonth`, `formatRoughMonth` (Task 1); `PickedPlace` (Task 5); `CreateTripInput` (Task 3); `formatDayLabel`, `formatNights`, `nightsBetween`.
- Produces (all from `lib/new-trip/draft.ts`):
  - `type Step = 1 | 2 | 3 | 4`; `type DateMode = "exact" | "rough" | "none"`; `interface DraftStop { name: string; lat?: number; lng?: number; countryCode?: string }`.
  - `interface Draft { past: boolean; step: Step; name: string; dateMode: DateMode; startDate?: string; endDate?: string; roughMonth?: string; homeName?: string; homePlace?: PickedPlace; homeCurrency: string; stops: DraftStop[]; stamped: boolean }` (`stamped` = the N6 stamp thunk has played for this draft).
  - `type DraftAction` = `set-name` · `set-mode` · `set-range` · `set-rough-month` · `set-home-text` · `pick-home` · `clear-home` · `set-currency` · `add-stop` · `remove-stop` · `go` · `stamped` (shapes in the code below).
  - `DRAFT_KEY = "teepee:new-trip-draft"`, `MAX_NAME = 120`, `MAX_STOPS = 30`.
  - `emptyDraft(past)`, `draftReducer(d, a)`, `type StepErrors = Partial<Record<"name" | "dates" | "home" | "form", string>>`, `validateStep(d, step): StepErrors`, `firstOwedStep(d): Step | null`, `clampStep(d, want): Step`, `toCreateInput(d, extra?: { fromShareToken?: string }): CreateTripInput`, `errorStep(errors): Step`, `stepErrorsFrom(errors): StepErrors`, `whenLine(d, today): string | null`, `isDirty(d, hasCover): boolean`, `serializeDraft(d): string`, `parseDraft(raw, past): Draft | null`, `initDraft({ past, initialName?, initialStep?, stored? }): Draft`.
  - `lib/new-trip/stamp-word.ts`: `stampWord(name: string, stops?: { name: string }[]): string`.
  - `lib/countries.ts`: `countryNameList(): string[]` (every region name Intl knows, longest first, memoised).

- [ ] **Step 1: Write the failing tests**

`lib/countries.test.ts` — add:

```ts
describe("countryNameList", () => {
  it("lists real countries, longest first, without the unknown sentinel", () => {
    const list = countryNameList();
    expect(list).toContain("Japan");
    expect(list).toContain("New Zealand");
    expect(list).not.toContain("Unknown Region");
    expect(list.indexOf("New Zealand")).toBeLessThan(list.indexOf("Japan"));
  });
});
```

`lib/new-trip/stamp-word.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stampWord } from "./stamp-word";

describe("stampWord (NEW_TRIP.md §8)", () => {
  it("uses a country named in the trip name", () => {
    expect(stampWord("Japan at Christmas")).toBe("JAPAN");
    expect(stampWord("christmas in japan")).toBe("JAPAN");
    expect(stampWord("New Zealand road trip")).toBe("NEW ZEALAND");
  });
  it("matches whole words only", () => {
    expect(stampWord("Japanese food tour")).toBe("JAPANESE");
  });
  it("otherwise the first word, upper-cased, cut to 8", () => {
    expect(stampWord("Christmas in Europe")).toBe("CHRISTMA");
    expect(stampWord("Europe, finally!")).toBe("EUROPE");
  });
  it("one stop names the stamp", () => {
    expect(stampWord("Japan at Christmas", [{ name: "Kyoto" }])).toBe("KYOTO");
  });
  it("is empty for an empty name", () => {
    expect(stampWord("   ")).toBe("");
  });
});
```

`lib/new-trip/draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  emptyDraft, draftReducer, validateStep, clampStep, toCreateInput, errorStep, stepErrorsFrom,
  whenLine, isDirty, serializeDraft, parseDraft, initDraft, MAX_STOPS, type Draft,
} from "./draft";

const TODAY = "2026-09-30";
const PORTLAND = { name: "Portland", region: "Oregon, United States", lat: 45.52, lng: -122.68, countryCode: "us" };
const BALI = { name: "Denpasar", region: "Bali, Indonesia", lat: -8.65, lng: 115.22, countryCode: "id" };
const named = (over: Partial<Draft> = {}): Draft => ({ ...emptyDraft(false), name: "Kyoto", ...over });

describe("draftReducer", () => {
  it("caps the name at 120", () => {
    expect(draftReducer(emptyDraft(false), { type: "set-name", name: "x".repeat(200) }).name).toHaveLength(120);
  });
  it("pick-home sets the home and the currency from its country", () => {
    const d = draftReducer(named(), { type: "pick-home", place: PORTLAND });
    expect(d).toMatchObject({ homeName: "Portland", homePlace: PORTLAND, homeCurrency: "USD" });
  });
  it("pick-home in an unmapped country keeps the current currency", () => {
    expect(draftReducer(named({ homeCurrency: "GBP" }), { type: "pick-home", place: BALI }).homeCurrency).toBe("GBP");
  });
  it("typing after a pick forgets the picked place", () => {
    const picked = draftReducer(named(), { type: "pick-home", place: PORTLAND });
    const d = draftReducer(picked, { type: "set-home-text", text: "Portlan" });
    expect(d.homePlace).toBeUndefined();
    expect(d.homeName).toBe("Portlan");
  });
  it("refuses an unknown currency", () => {
    expect(draftReducer(named(), { type: "set-currency", code: "ZZZ" }).homeCurrency).toBe("AUD");
  });
  it("adds trimmed stops up to the cap and removes by index", () => {
    let d = named({ past: true });
    d = draftReducer(d, { type: "add-stop", stop: { name: "  Kyoto " } });
    d = draftReducer(d, { type: "add-stop", stop: { name: "   " } });
    d = draftReducer(d, { type: "add-stop", stop: { name: "Nara" } });
    expect(d.stops.map((s) => s.name)).toEqual(["Kyoto", "Nara"]);
    expect(draftReducer(d, { type: "remove-stop", index: 0 }).stops.map((s) => s.name)).toEqual(["Nara"]);
    const full = named({ stops: Array.from({ length: MAX_STOPS }, (_, i) => ({ name: `P${i}` })) });
    expect(draftReducer(full, { type: "add-stop", stop: { name: "One more" } }).stops).toHaveLength(MAX_STOPS);
  });
  it("past mode ignores a date-mode switch", () => {
    expect(draftReducer(emptyDraft(true), { type: "set-mode", mode: "rough" }).dateMode).toBe("exact");
  });
});

describe("validateStep", () => {
  it("step 1 needs a name", () => {
    expect(validateStep(emptyDraft(false), 1)).toEqual({ name: "Give it a name to keep going" });
    expect(validateStep(named(), 1)).toEqual({});
  });
  it("past mode needs both dates", () => {
    expect(validateStep(named({ past: true }), 2)).toEqual({ dates: "Add the dates you went" });
    expect(validateStep(named({ past: true, startDate: "2026-07-01", endDate: "2026-07-10" }), 2)).toEqual({});
  });
  it("normal mode: a start with no end asks for the end; nothing picked is fine", () => {
    expect(validateStep(named({ startDate: "2026-12-04" }), 2)).toEqual({ dates: "Pick the day you get back" });
    expect(validateStep(named(), 2)).toEqual({});
    expect(validateStep(named({ dateMode: "none", startDate: "2026-12-04" }), 2)).toEqual({});
  });
});

describe("clampStep / initDraft", () => {
  it("clamps a deep link past an unanswered required step", () => {
    expect(clampStep(emptyDraft(false), 3)).toBe(1);
    expect(clampStep(named({ past: true }), 4)).toBe(2);
    expect(clampStep(named(), 4)).toBe(4);
  });
  it("an initial name starts a fresh draft at the asked step", () => {
    const stored = named({ name: "Old", step: 3, homeCurrency: "JPY" });
    const d = initDraft({ past: false, initialName: " Japan in spring ", initialStep: 2, stored });
    expect(d).toMatchObject({ name: "Japan in spring", step: 2, homeCurrency: "AUD" });
  });
  it("restores a stored draft of the same mode, and ignores one of the other mode", () => {
    expect(initDraft({ past: false, stored: named({ step: 3 }) })).toMatchObject({ name: "Kyoto", step: 3 });
    expect(initDraft({ past: true, stored: named({ step: 3 }) })).toMatchObject({ name: "", step: 1, past: true });
  });
  it("clamps a stored or linked step too", () => {
    expect(initDraft({ past: false, initialStep: 3 }).step).toBe(1);
    expect(initDraft({ past: false, initialStep: 9, stored: named() }).step).toBe(1);
  });
});

describe("toCreateInput", () => {
  it("a name alone is the whole input", () => {
    expect(toCreateInput(named())).toEqual({ name: "Kyoto", homeCurrency: "AUD" });
  });
  it("exact dates are sent only when both are set", () => {
    expect(toCreateInput(named({ startDate: "2026-12-04", endDate: "2027-01-08" }))).toMatchObject({ startDate: "2026-12-04", endDate: "2027-01-08" });
    expect(toCreateInput(named({ startDate: "2026-12-04" }))).not.toHaveProperty("startDate");
  });
  it("roughly sends the month and never dates", () => {
    const d = named({ dateMode: "rough", roughMonth: "2027-04", startDate: "2026-12-04", endDate: "2026-12-08" });
    const input = toCreateInput(d);
    expect(input).toMatchObject({ roughMonth: "2027-04" });
    expect(input).not.toHaveProperty("startDate");
  });
  it("not sure sends neither", () => {
    const input = toCreateInput(named({ dateMode: "none", roughMonth: "2027-04", startDate: "2026-12-04", endDate: "2026-12-08" }));
    expect(input).not.toHaveProperty("roughMonth");
    expect(input).not.toHaveProperty("startDate");
  });
  it("a picked home sends its coordinates; a typed one only its name", () => {
    expect(toCreateInput(draftReducer(named(), { type: "pick-home", place: PORTLAND }))).toMatchObject({ homeName: "Portland", homeLat: 45.52, homeLng: -122.68, homeCountryCode: "us", homeCurrency: "USD" });
    const typed = toCreateInput(named({ homeName: "Somewhere" }));
    expect(typed).toMatchObject({ homeName: "Somewhere" });
    expect(typed).not.toHaveProperty("homeLat");
  });
  it("past mode sends stops and no home", () => {
    const d = named({ past: true, startDate: "2026-07-01", endDate: "2026-07-10", homeName: "Sydney", stops: [{ name: "Kyoto", lat: 35, lng: 135.7, countryCode: "jp" }, { name: "Nara" }] });
    const input = toCreateInput(d);
    expect(input.stops).toEqual([{ name: "Kyoto", lat: 35, lng: 135.7, countryCode: "jp" }, { name: "Nara" }]);
    expect(input).not.toHaveProperty("homeName");
  });
  it("threads fromShareToken", () => {
    expect(toCreateInput(named(), { fromShareToken: "tok" })).toMatchObject({ fromShareToken: "tok" });
  });
});

describe("server errors", () => {
  it("errorStep jumps to the earliest step with an error", () => {
    expect(errorStep({ homeName: ["x"], name: ["y"] })).toBe(1);
    expect(errorStep({ endDate: ["x"] })).toBe(2);
    expect(errorStep({ stops: ["x"] })).toBe(3);
    expect(errorStep({ _: ["x"] })).toBe(4);
  });
  it("stepErrorsFrom maps fields to the step's slot", () => {
    expect(stepErrorsFrom({ name: ["Trip name is required"], endDate: ["End date must be on or after the start date"], _: ["Oops"] }))
      .toEqual({ name: "Trip name is required", dates: "End date must be on or after the start date", form: "Oops" });
  });
});

describe("whenLine / isDirty", () => {
  it("reads exact dates like the review row", () => {
    expect(whenLine(named({ startDate: "2026-12-04", endDate: "2027-01-08" }), TODAY)).toBe("Fri 4 Dec – Fri 8 Jan · 35 nights");
  });
  it("reads a rough month", () => {
    expect(whenLine(named({ dateMode: "rough", roughMonth: "2027-04" }), TODAY)).toBe("Sometime in April");
  });
  it("is null with nothing to say", () => {
    expect(whenLine(named({ dateMode: "none" }), TODAY)).toBeNull();
  });
  it("any answer or a cover makes the draft dirty", () => {
    expect(isDirty(emptyDraft(false), false)).toBe(false);
    expect(isDirty(emptyDraft(false), true)).toBe(true);
    expect(isDirty(named(), false)).toBe(true);
  });
});

describe("persistence", () => {
  it("round-trips", () => {
    const d = draftReducer(named({ step: 3 }), { type: "pick-home", place: PORTLAND });
    expect(parseDraft(serializeDraft(d), false)).toEqual(d);
  });
  it("rejects junk", () => {
    expect(parseDraft("{nope", false)).toBeNull();
    expect(parseDraft(JSON.stringify({ name: 3 }), false)).toBeNull();
    expect(parseDraft(JSON.stringify({ ...named(), homeCurrency: "ZZZ" }), false)).toBeNull();
    expect(parseDraft(null, false)).toBeNull();
  });
});
```

Run: `npm test -- lib/new-trip lib/countries.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement**

`lib/countries.ts` — add below `countryName`:

```ts
let COUNTRY_NAMES: string[] | null = null;

/** Every region name Intl knows ("Japan", "New Zealand"…), longest first so "New Zealand" wins over a shorter name inside it. */
export function countryNameList(): string[] {
  if (COUNTRY_NAMES) return COUNTRY_NAMES;
  const names = new Set<string>();
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const name = REGION_NAMES.of(String.fromCharCode(a, b));
      if (name && name !== "Unknown Region") names.add(name);
    }
  }
  COUNTRY_NAMES = [...names].sort((x, y) => y.length - x.length);
  return COUNTRY_NAMES;
}
```

`lib/new-trip/stamp-word.ts`:

```ts
import { countryNameList } from "@/lib/countries";

let MATCHERS: { word: string; re: RegExp }[] | null = null;

function matchers() {
  if (MATCHERS) return MATCHERS;
  MATCHERS = countryNameList().map((c) => ({
    word: c.toUpperCase(),
    re: new RegExp(`(^|[^\\p{L}])${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu"),
  }));
  return MATCHERS;
}

/** NEW_TRIP.md §8: the stamp's big word while a Trip has no Stops. */
export function stampWord(name: string, stops: { name: string }[] = []): string {
  if (stops.length === 1) return stops[0].name.toUpperCase();
  const text = name.trim();
  if (!text) return "";
  for (const m of matchers()) if (m.re.test(text)) return m.word;
  const first = text.split(/\s+/)[0].replace(/[^\p{L}\p{N}]/gu, "");
  return first.slice(0, 8).toUpperCase();
}
```

`lib/new-trip/draft.ts`:

```ts
import { CURRENCY_CODES, DEFAULT_HOME_CURRENCY } from "@/lib/currencies";
import { currencyForCountry } from "@/lib/currency-for-country";
import { formatDayLabel, formatNights, nightsBetween } from "@/lib/dates";
import { formatRoughMonth, isRoughMonth } from "@/lib/rough-month";
import type { PickedPlace } from "@/lib/picked-place";
import type { CreateTripInput } from "@/lib/validations/trip";

export type Step = 1 | 2 | 3 | 4;
export type DateMode = "exact" | "rough" | "none";

export interface DraftStop {
  name: string;
  lat?: number;
  lng?: number;
  countryCode?: string;
}

export interface Draft {
  past: boolean;
  step: Step;
  name: string;
  dateMode: DateMode;
  startDate?: string;
  endDate?: string;
  roughMonth?: string;
  homeName?: string;
  homePlace?: PickedPlace;
  homeCurrency: string;
  stops: DraftStop[];
  /** MOTION N6: the stamp's first-date thunk has played for this draft. */
  stamped: boolean;
}

export type DraftAction =
  | { type: "set-name"; name: string }
  | { type: "set-mode"; mode: DateMode }
  | { type: "set-range"; start?: string; end?: string }
  | { type: "set-rough-month"; ym?: string }
  | { type: "set-home-text"; text: string }
  | { type: "pick-home"; place: PickedPlace }
  | { type: "clear-home" }
  | { type: "set-currency"; code: string }
  | { type: "add-stop"; stop: DraftStop }
  | { type: "remove-stop"; index: number }
  | { type: "go"; step: Step }
  | { type: "stamped" };

export const DRAFT_KEY = "teepee:new-trip-draft";
export const MAX_NAME = 120;
export const MAX_STOPS = 30;

export function emptyDraft(past: boolean): Draft {
  return { past, step: 1, name: "", dateMode: "exact", homeCurrency: DEFAULT_HOME_CURRENCY, stops: [], stamped: false };
}

export function draftReducer(d: Draft, a: DraftAction): Draft {
  switch (a.type) {
    case "set-name":
      return { ...d, name: a.name.slice(0, MAX_NAME) };
    case "set-mode":
      return d.past ? d : { ...d, dateMode: a.mode };
    case "set-range":
      return { ...d, startDate: a.start, endDate: a.end };
    case "set-rough-month":
      return { ...d, roughMonth: a.ym };
    case "set-home-text":
      return { ...d, homeName: a.text || undefined, homePlace: undefined };
    case "pick-home": {
      const code = a.place.countryCode ? currencyForCountry(a.place.countryCode) : undefined;
      return { ...d, homeName: a.place.name, homePlace: a.place, homeCurrency: code ?? d.homeCurrency };
    }
    case "clear-home":
      return { ...d, homeName: undefined, homePlace: undefined };
    case "set-currency":
      return CURRENCY_CODES.includes(a.code) ? { ...d, homeCurrency: a.code } : d;
    case "add-stop": {
      const name = a.stop.name.trim();
      if (!name || d.stops.length >= MAX_STOPS) return d;
      return { ...d, stops: [...d.stops, { ...a.stop, name }] };
    }
    case "remove-stop":
      return { ...d, stops: d.stops.filter((_, i) => i !== a.index) };
    case "go":
      return { ...d, step: a.step };
    case "stamped":
      return d.stamped ? d : { ...d, stamped: true };
  }
}

export type StepErrors = Partial<Record<"name" | "dates" | "home" | "form", string>>;

export function validateStep(d: Draft, step: Step): StepErrors {
  if (step === 1) return d.name.trim() ? {} : { name: "Give it a name to keep going" };
  if (step === 2) {
    // Past trips are Done only by their dates (ADR: no "past" flag), so they're required.
    if (d.past) return d.startDate && d.endDate ? {} : { dates: "Add the dates you went" };
    if (d.dateMode === "exact" && d.startDate && !d.endDate) return { dates: "Pick the day you get back" };
  }
  return {};
}

export function firstOwedStep(d: Draft): Step | null {
  if (Object.keys(validateStep(d, 1)).length) return 1;
  if (Object.keys(validateStep(d, 2)).length) return 2;
  return null;
}

export function clampStep(d: Draft, want: number): Step {
  const asked = (Number.isInteger(want) && want >= 1 && want <= 4 ? want : 1) as Step;
  const owed = firstOwedStep(d);
  return owed !== null && owed < asked ? owed : asked;
}

export function toCreateInput(d: Draft, extra?: { fromShareToken?: string }): CreateTripInput {
  const exact = d.past || d.dateMode === "exact";
  const home = d.homeName?.trim();
  return {
    name: d.name.trim(),
    homeCurrency: d.homeCurrency,
    ...(exact && d.startDate && d.endDate ? { startDate: d.startDate, endDate: d.endDate } : {}),
    ...(!d.past && d.dateMode === "rough" && d.roughMonth ? { roughMonth: d.roughMonth } : {}),
    ...(!d.past && home ? { homeName: home } : {}),
    ...(!d.past && home && d.homePlace
      ? { homeLat: d.homePlace.lat, homeLng: d.homePlace.lng, ...(d.homePlace.countryCode ? { homeCountryCode: d.homePlace.countryCode } : {}) }
      : {}),
    ...(d.past && d.stops.length
      ? {
          stops: d.stops.map((s) => ({
            name: s.name,
            ...(s.lat !== undefined && s.lng !== undefined ? { lat: s.lat, lng: s.lng } : {}),
            ...(s.countryCode ? { countryCode: s.countryCode } : {}),
          })),
        }
      : {}),
    ...(extra?.fromShareToken ? { fromShareToken: extra.fromShareToken } : {}),
  } as CreateTripInput;
}

const STEP_OF: Record<string, Step> = {
  name: 1,
  startDate: 2, endDate: 2, hardEndDate: 2, roughMonth: 2,
  homeName: 3, homeCurrency: 3, homeLat: 3, homeLng: 3, homeCountryCode: 3, stops: 3,
};
const SLOT_OF: Record<Step, keyof StepErrors> = { 1: "name", 2: "dates", 3: "home", 4: "form" };

export function errorStep(errors: Record<string, string[] | undefined>): Step {
  let best: Step = 4;
  for (const [k, v] of Object.entries(errors)) {
    const s = STEP_OF[k];
    if (v?.length && s && s < best) best = s;
  }
  return best;
}

export function stepErrorsFrom(errors: Record<string, string[] | undefined>): StepErrors {
  const out: StepErrors = {};
  for (const [k, v] of Object.entries(errors)) {
    const slot = SLOT_OF[STEP_OF[k] ?? 4];
    if (v?.[0] && !out[slot]) out[slot] = v[0];
  }
  return out;
}

export function whenLine(d: Draft, today: string): string | null {
  if ((d.past || d.dateMode === "exact") && d.startDate && d.endDate) {
    return `${formatDayLabel(d.startDate)} – ${formatDayLabel(d.endDate)} · ${formatNights(nightsBetween(d.startDate, d.endDate))}`;
  }
  if (!d.past && d.dateMode === "rough" && d.roughMonth) return `Sometime in ${formatRoughMonth(d.roughMonth, today)}`;
  return null;
}

export function isDirty(d: Draft, hasCover: boolean): boolean {
  return hasCover || d.name.trim() !== "" || !!d.startDate || !!d.roughMonth || !!d.homeName || d.stops.length > 0;
}

export function serializeDraft(d: Draft): string {
  return JSON.stringify(d);
}

export function parseDraft(raw: string | null, past: boolean): Draft | null {
  if (!raw) return null;
  let v: Partial<Draft>;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || v.past !== past || typeof v.name !== "string") return null;
  if (![1, 2, 3, 4].includes(v.step as number) || !CURRENCY_CODES.includes(v.homeCurrency as string)) return null;
  const stops = Array.isArray(v.stops) ? v.stops.filter((s) => s && typeof s.name === "string").slice(0, MAX_STOPS) : [];
  const dateMode = (["exact", "rough", "none"] as const).find((m) => m === v.dateMode) ?? "exact";
  return { ...emptyDraft(past), ...v, stops, dateMode, roughMonth: isRoughMonth(v.roughMonth) ? v.roughMonth : undefined } as Draft;
}

export function initDraft({ past, initialName, initialStep, stored }: { past: boolean; initialName?: string; initialStep?: number; stored?: Draft | null }): Draft {
  let d = emptyDraft(past);
  if (initialName !== undefined) d = { ...d, name: initialName.trim().slice(0, MAX_NAME) };
  else if (stored && stored.past === past) d = stored;
  return { ...d, step: clampStep(d, initialStep ?? d.step) };
}
```

(The "persistence round-trips" case relies on `parseDraft` keeping every field it's given; the spread order above does that.)

- [ ] **Step 3: Run the tests**

Run: `npm test -- lib/new-trip lib/countries.test.ts` — Expected: PASS.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
git add lib/new-trip/draft.ts lib/new-trip/draft.test.ts lib/new-trip/stamp-word.ts lib/new-trip/stamp-word.test.ts lib/countries.ts lib/countries.test.ts
git commit -m "feat(new-trip): draft reducer, step validation, create input; stamp word

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 9: The live preview is the real hero card

Implements NEW_TRIP.md §7 (desktop preview, mobile mini card, mobile countdown strip). The preview reuses the Trips-page hero markup: `TripCardHero`'s article is split into `TripCardHeroView` so a draft can drive it — **no forked styles**.

**Files:**
- Modify: `components/trips/trip-card-hero.tsx` (extract `TripCardHeroView`)
- Modify: `components/trips/status-pill.tsx` (optional `label`)
- Create: `components/new-trip/preview-model.ts` + `components/new-trip/preview-model.test.ts`
- Create: `components/new-trip/trip-preview.tsx` + `components/new-trip/trip-preview.test.tsx`
- Test: `components/trips/trip-card.test.tsx` (hero still renders as before)

**Interfaces:**
- Consumes: `StatusPill`, `NextStepChip`, `Polaroid`, `CoverStamp`, `stampDate` (`components/trips/*`), `BigNumberBlock` + `BigNumber` (Task 4), `cardBigNumber` (`lib/trips/trip-status.ts`), `formatDateRangeCompact`, `formatRoughMonth`, `roughMonthStamp`, `stampWord`, `Draft`/`Step`/`DateMode` types.
- Produces:
  - `TripCardHeroView(props: { pill: React.ReactNode; dateLine?: React.ReactNode; name: React.ReactNode; big: React.ReactNode; chip?: React.ReactNode; cover: React.ReactNode; link?: React.ReactNode; className?: string })` — the hero `<article>` markup verbatim; `TripCardHero({ model })` becomes a thin wrapper over it.
  - `StatusPill({ kind, label?, className })` — `label` replaces the text (the preview's "NEW TRIP").
  - `previewModel(input: PreviewInput): PreviewModel` with `interface PreviewInput { past: boolean; step: Step; name: string; dateMode: DateMode; startDate?: string; endDate?: string; roughMonth?: string; today: string }`.
  - `TripPreview(props: PreviewInput & { coverUrl?: string; className?: string })` (desktop column; `aria-hidden`, `inert`, `data-testid="trip-preview"`), `TripPreviewMini(props: PreviewInput)` (phones, step 1), `CountdownStrip({ startDate, endDate, today })` (phones, step 2).

- [ ] **Step 1: Write the failing tests**

`components/new-trip/preview-model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { previewModel, type PreviewInput } from "./preview-model";

const base: PreviewInput = { past: false, step: 1, name: "Japan at Christmas", dateMode: "exact", today: "2026-09-28" };

describe("previewModel (NEW_TRIP.md §7 table)", () => {
  it("name only: NEW TRIP, skeleton bottom, stamp with — — —", () => {
    const m = previewModel(base);
    expect(m.pill).toEqual({ kind: "up-next", label: "NEW TRIP" });
    expect(m.bottom).toEqual({ kind: "skeleton" });
    expect(m.stamp).toEqual({ place: "JAPAN", startDate: null, dateLabel: "— — —" });
    expect(m.dateLine).toBeNull();
    expect(m.caption).toBe("Fills in as you answer");
  });
  it("an empty name shows the Your trip placeholder", () => {
    expect(previewModel({ ...base, name: "  " })).toMatchObject({ title: "Your trip", placeholder: true });
  });
  it("exact dates: UP NEXT, the range, the sleeps and the stamp date", () => {
    const m = previewModel({ ...base, step: 2, startDate: "2026-12-04", endDate: "2027-01-08" });
    expect(m.pill.label).toBe("UP NEXT");
    expect(m.dateLine).toBe("4 Dec – 8 Jan");
    expect(m.bottom).toEqual({ kind: "big", big: { value: "67", unit: ["sleeps", "to go"] } });
    expect(m.stamp).toMatchObject({ startDate: "2026-12-04", dateLabel: "04 DEC 26" });
    expect(m.caption).toBe("Dates start the countdown and date the stamp");
  });
  it("a rough month: UP NEXT, Sometime in April, stamp APR 27", () => {
    const m = previewModel({ ...base, dateMode: "rough", roughMonth: "2027-04" });
    expect(m.pill.label).toBe("UP NEXT");
    expect(m.bottom).toEqual({ kind: "rough", month: "April" });
    expect(m.stamp.dateLabel).toBe("APR 27");
  });
  it("step 4 adds the first-stop chip and reads Ready to go", () => {
    const m = previewModel({ ...base, step: 4 });
    expect(m.chip).toBe(true);
    expect(m.caption).toBe("Ready to go");
  });
  it("past mode with dates reads as a Done card with nights away, and no chip", () => {
    const m = previewModel({ ...base, past: true, step: 4, startDate: "2026-07-01", endDate: "2026-07-10" });
    expect(m.pill).toEqual({ kind: "done", label: "DONE" });
    expect(m.bottom).toEqual({ kind: "big", big: { value: "9", unit: ["nights", "away"] } });
    expect(m.chip).toBe(false);
  });
});
```

`components/new-trip/trip-preview.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TripPreview, TripPreviewMini, CountdownStrip } from "./trip-preview";

const base = { past: false, step: 1 as const, name: "Japan at Christmas", dateMode: "exact" as const, today: "2026-09-28" };

describe("TripPreview", () => {
  it("is decorative: aria-hidden and inert", () => {
    render(<TripPreview {...base} />);
    const el = screen.getByTestId("trip-preview");
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).toHaveAttribute("inert");
  });
  it("renders the hero card with the live name, the skeleton and the stamp word", () => {
    render(<TripPreview {...base} />);
    const el = screen.getByTestId("trip-preview");
    expect(within(el).getByText("ON YOUR TRIPS PAGE", { exact: false })).toBeInTheDocument();
    expect(within(el).getAllByText("Japan at Christmas").length).toBeGreaterThan(0);
    expect(within(el).getByText("NEW TRIP")).toBeInTheDocument();
    expect(el.querySelector("[data-preview-skeleton]")).not.toBeNull();
    expect(within(el).getByText("JAPAN")).toBeInTheDocument();
    expect(el.querySelector("article")?.className).toMatch(/md:w-\[420px\]/);
  });
  it("exact dates show the countdown", () => {
    render(<TripPreview {...base} step={2} startDate="2026-12-04" endDate="2027-01-08" />);
    const el = screen.getByTestId("trip-preview");
    expect(within(el).getByText("67")).toBeInTheDocument();
    expect(within(el).getAllByText("4 Dec – 8 Jan").length).toBeGreaterThan(0);
    expect(within(el).getByText("04 DEC 26")).toBeInTheDocument();
  });
  it("a cover photo replaces the stamp", () => {
    render(<TripPreview {...base} coverUrl="blob:cover" />);
    const el = screen.getByTestId("trip-preview");
    expect(el.querySelector("img")?.getAttribute("src")).toBe("blob:cover");
    expect(within(el).queryByText("JAPAN")).toBeNull();
  });
  it("step 4 shows Add your first stop", () => {
    render(<TripPreview {...base} step={4} />);
    expect(within(screen.getByTestId("trip-preview")).getByText("Add your first stop")).toBeInTheDocument();
  });
});

describe("TripPreviewMini / CountdownStrip", () => {
  it("the mini card is phones-only and tilted", () => {
    render(<TripPreviewMini {...base} />);
    const el = screen.getByTestId("trip-preview-mini");
    expect(el.className).toMatch(/\bmd:hidden\b/);
    expect(el.className).toMatch(/-rotate-2/);
  });
  it("the countdown strip reads sleeps, range and nights", () => {
    render(<CountdownStrip startDate="2026-12-04" endDate="2027-01-08" today="2026-09-28" />);
    expect(screen.getByText("67")).toBeInTheDocument();
    expect(screen.getByText("4 Dec – 8 Jan")).toBeInTheDocument();
    expect(screen.getByText("35 nights")).toBeInTheDocument();
  });
});
```

`components/trips/trip-card.test.tsx` — add (reusing the file's model fixture) a `TripCardHero` case asserting the stretched link's accessible name (`cardAccessibleName`) and that the article still carries `md:w-[600px]` and `bg-coral`.

Run: `npm test -- components/new-trip components/trips/trip-card.test.tsx` — Expected: FAIL.

- [ ] **Step 2: Implement**

`components/trips/status-pill.tsx`: add `label?: string` to the props and render `{label ?? cardLabel(kind)}`.

`components/trips/trip-card-hero.tsx` — full new content (every class string is copied from the current file; do not change any):

```tsx
import type { ReactNode } from "react";
import { StatusPill } from "@/components/trips/status-pill";
import { NextStepChip } from "@/components/trips/next-step-chip";
import { TripCover } from "@/components/trips/trip-cover";
import { StretchedLink, BigNumberBlock, type TripCardModel } from "@/components/trips/trip-card";
import { cn } from "@/lib/cn";

export interface TripCardHeroViewProps {
  pill: ReactNode;
  dateLine?: ReactNode;
  name: ReactNode;
  big: ReactNode;
  chip?: ReactNode;
  cover: ReactNode;
  link?: ReactNode;
  className?: string;
}

/** The hero's markup, data-free, so the New trip preview renders the same card (NEW_TRIP.md §7). */
export function TripCardHeroView({ pill, dateLine, name, big, chip, cover, link, className }: TripCardHeroViewProps) {
  return (
    <article className={cn("island relative flex h-[250px] w-[300px] shrink-0 snap-start gap-5 overflow-hidden rounded-[22px] border-2 border-border bg-coral p-[18px] shadow-hard-2 md:h-[280px] md:w-[600px] md:rounded-[24px] md:px-6 md:py-[22px] md:shadow-hard-3", className)}>
      {link}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          {pill}
          {dateLine ? <span className="hidden truncate text-[13px] font-bold md:block">{dateLine}</span> : null}
        </div>
        <h2 className="mt-3 hidden font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.02em] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden md:[display:-webkit-box]">
          {name}
        </h2>
        <div className="mt-auto">
          {big}
          <h2 className="mt-2 font-display text-[20px] font-extrabold leading-[1.05] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden md:hidden">
            {name}
          </h2>
          {dateLine ? <p className="mt-1 text-[13px] font-semibold md:hidden">{dateLine}</p> : null}
        </div>
        {chip ? <div className="hidden md:block">{chip}</div> : null}
      </div>
      {/* Polaroid's own "hero" frame is responsive (components/trips/polaroid.tsx). */}
      <div className="pointer-events-none absolute right-4 top-[18px] md:static md:flex md:items-center">
        <div className="pointer-events-auto">{cover}</div>
      </div>
    </article>
  );
}

/** "Up next" hero (TRIPS_PAGE.md §4a, §8): coral, 600×280 desktop; 300×250 mobile with the chip dropped. */
export function TripCardHero({ model }: { model: TripCardModel }) {
  return (
    <TripCardHeroView
      link={<StretchedLink model={model} />}
      pill={<StatusPill kind={model.kind} />}
      dateLine={model.dateLine}
      name={model.name}
      big={<BigNumberBlock big={model.big} numberClass="text-[72px] leading-[0.85] tracking-[-0.06em] md:text-[96px]" unitClass="text-[18px] leading-[1.02] md:text-[24px]" />}
      chip={model.nextStep ? <NextStepChip row={model.nextStep} /> : null}
      cover={<TripCover {...model.cover} size="hero" />}
    />
  );
}
```

`components/new-trip/preview-model.ts`:

```ts
import { cardBigNumber, type BigNumber } from "@/lib/trips/trip-status";
import { formatDateRangeCompact } from "@/lib/dates";
import { formatRoughMonth, roughMonthStamp } from "@/lib/rough-month";
import { stampWord } from "@/lib/new-trip/stamp-word";
import { stampDate } from "@/components/trips/cover-stamp";
import type { DateMode, Step } from "@/lib/new-trip/draft";

export interface PreviewInput {
  past: boolean;
  step: Step;
  name: string;
  dateMode: DateMode;
  startDate?: string;
  endDate?: string;
  roughMonth?: string;
  today: string;
}

export interface PreviewModel {
  pill: { kind: "up-next" | "done"; label: string };
  dateLine: string | null;
  title: string;
  placeholder: boolean;
  bottom: { kind: "skeleton" } | { kind: "big"; big: BigNumber } | { kind: "rough"; month: string };
  stamp: { place: string; startDate: string | null; dateLabel: string };
  chip: boolean;
  caption: string;
}

const CAPTION: Record<Step, string> = {
  1: "Fills in as you answer",
  2: "Dates start the countdown and date the stamp",
  3: "Ready to go",
  4: "Ready to go",
};

export function previewModel(i: PreviewInput): PreviewModel {
  const exact = (i.past || i.dateMode === "exact") && i.startDate && i.endDate ? { s: i.startDate, e: i.endDate } : null;
  const rough = !i.past && i.dateMode === "rough" && i.roughMonth ? i.roughMonth : null;
  const kind = i.past ? "done" : "up-next";
  const label = exact ? (i.past ? "DONE" : "UP NEXT") : rough ? "UP NEXT" : "NEW TRIP";
  const title = i.name.trim();
  return {
    pill: { kind, label },
    dateLine: exact ? formatDateRangeCompact(exact.s, exact.e) : null,
    title: title || "Your trip",
    placeholder: !title,
    bottom: exact
      ? { kind: "big", big: cardBigNumber({ kind, startDate: exact.s, endDate: exact.e, today: i.today }) }
      : rough
        ? { kind: "rough", month: formatRoughMonth(rough, i.today) }
        : { kind: "skeleton" },
    stamp: {
      place: stampWord(i.name) || "TRIP",
      startDate: exact?.s ?? null,
      dateLabel: exact ? stampDate(exact.s) : rough ? roughMonthStamp(rough) : "— — —",
    },
    chip: i.step === 4 && !i.past,
    caption: CAPTION[i.step],
  };
}
```

`components/new-trip/trip-preview.tsx` (no hooks; renders inside the client flow):

```tsx
import { StatusPill } from "@/components/trips/status-pill";
import { NextStepChip } from "@/components/trips/next-step-chip";
import { Polaroid } from "@/components/trips/polaroid";
import { CoverStamp } from "@/components/trips/cover-stamp";
import { BigNumberBlock } from "@/components/trips/trip-card";
import { TripCardHeroView } from "@/components/trips/trip-card-hero";
import { cardBigNumber } from "@/lib/trips/trip-status";
import { formatDateRangeCompact, formatNights, nightsBetween } from "@/lib/dates";
import { previewModel, type PreviewInput, type PreviewModel } from "./preview-model";
import { cn } from "@/lib/cn";

function Bottom({ bottom }: { bottom: PreviewModel["bottom"] }) {
  if (bottom.kind === "skeleton") {
    return (
      <div data-preview-skeleton className="flex flex-col gap-2">
        <span className="h-3.5 w-[120px] rounded-full bg-foreground/15" />
        <span className="h-3.5 w-[84px] rounded-full bg-foreground/15" />
      </div>
    );
  }
  const big = bottom.kind === "big" ? bottom.big : { value: bottom.month, unit: null, lead: "Sometime in" };
  return <BigNumberBlock big={big} numberClass="text-[72px] leading-[0.85] tracking-[-0.06em] md:text-[84px]" unitClass="text-[18px] leading-[1.02] md:text-[22px]" />;
}

function Cover({ m, name, coverUrl, size }: { m: PreviewModel; name: string; coverUrl?: string; size: "hero" | "small" }) {
  if (coverUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- local object URL
    return <img src={coverUrl} alt="" className="size-full object-cover" />;
  }
  return <CoverStamp name={name} place={m.stamp.place} startDate={m.stamp.startDate} dateLabel={m.stamp.dateLabel} hue="coral" size={size} />;
}

/** Desktop preview column (NEW_TRIP.md §7): the real Trips hero, fed by the draft. */
export function TripPreview({ coverUrl, className, ...input }: PreviewInput & { coverUrl?: string; className?: string }) {
  const m = previewModel(input);
  return (
    <div data-testid="trip-preview" aria-hidden="true" inert className={cn("w-[420px] max-w-full origin-center md:scale-[0.85] xl:scale-100", className)}>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-foreground">On your trips page</p>
      <div className="mt-3">
        <TripCardHeroView
          className="md:w-[420px] md:shadow-hard-4"
          pill={<StatusPill kind={m.pill.kind} label={m.pill.label} />}
          dateLine={m.dateLine ?? undefined}
          name={<span className={cn(m.placeholder && "text-foreground/40")}>{m.title}</span>}
          big={<Bottom bottom={m.bottom} />}
          chip={m.chip ? <NextStepChip row={{ id: "preview-first-stop", title: "Add your first stop", href: "#", tone: "coral", icon: "map-pin" }} /> : null}
          cover={<Polaroid size="hero"><Cover m={m} name={input.name} coverUrl={coverUrl} size="hero" /></Polaroid>}
        />
      </div>
      <p className="mt-3 text-sm font-semibold text-on-accent-muted">{m.caption}</p>
    </div>
  );
}

/** Phones, step 1: a 250px tilted mini card (NEW_TRIP.md §7 "Mobile"). */
export function TripPreviewMini(input: PreviewInput) {
  const m = previewModel(input);
  return (
    <div data-testid="trip-preview-mini" aria-hidden="true" className="island mx-auto mt-8 flex w-[250px] -rotate-2 gap-3 rounded-[18px] border-2 border-border bg-coral p-3.5 shadow-hard-2 md:hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusPill kind={m.pill.kind} label={m.pill.label} className="self-start" />
        <p className={cn("mt-2 font-display text-[20px] font-extrabold leading-[1.05] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden", m.placeholder && "text-foreground/40")}>{m.title}</p>
      </div>
      <div className="w-[70px] shrink-0 rotate-[5deg] self-center rounded-[8px] border-2 border-border bg-card p-[4px] pb-[12px]">
        <div className="aspect-[3/4] overflow-hidden rounded-[3px] border-2 border-border">
          <Cover m={m} name={input.name} size="small" />
        </div>
      </div>
    </div>
  );
}

/** Phones, step 2: the coral countdown strip under the calendar. */
export function CountdownStrip({ startDate, endDate, today }: { startDate: string; endDate: string; today: string }) {
  const big = cardBigNumber({ kind: "up-next", startDate, endDate, today });
  return (
    <div data-testid="countdown-strip" className="island mt-3 flex items-center gap-3 rounded-2xl border-2 border-border bg-coral px-4 py-2.5 text-on-accent md:hidden">
      <span className="font-display text-4xl font-extrabold leading-none tabular-nums">{big.value}</span>
      {big.unit ? (
        <span className="flex flex-col text-[13px] font-extrabold leading-tight">
          <span>{big.unit[0]}</span>
          <span>{big.unit[1]}</span>
        </span>
      ) : null}
      <span className="ml-auto flex flex-col text-right text-[13px] font-extrabold leading-tight tabular-nums">
        <span>{formatDateRangeCompact(startDate, endDate)}</span>
        <span>{formatNights(nightsBetween(startDate, endDate))}</span>
      </span>
    </div>
  );
}
```

`CoverStamp` hero reads "★ SOMEDAY ★" / "★ ARRIVED ★" (TRIP_COVER.md §4) where the mock draws "★ SOON ★" — keep the shipped stamp so the preview matches the card the Traveller will see.

- [ ] **Step 3: Run the tests**

Run: `npm test -- components/new-trip components/trips` — Expected: PASS.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
git add components/trips/trip-card-hero.tsx components/trips/status-pill.tsx components/trips/trip-card.test.tsx components/new-trip/preview-model.ts components/new-trip/preview-model.test.ts components/new-trip/trip-preview.tsx components/new-trip/trip-preview.test.tsx
git commit -m "feat(new-trip): live preview renders the real Trips hero card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---
### Task 10: The flow shell and step 1 (Name)

Implements NEW_TRIP.md §1 (shell, state, URL, sessionStorage, keyboard, focus/announce) and §2 (step 1). Steps 2–4 are **stubs with their real headings** here (Tasks 11–13 fill them in), so this task's tests can move between steps. The flow is not routed yet (Task 14 does that).

**Files:**
- Create: `components/new-trip/step-props.ts`
- Create: `components/new-trip/step-actions.tsx`
- Create: `components/new-trip/flow-top-bar.tsx`
- Create: `components/new-trip/flow-progress-mobile.tsx`
- Create: `components/new-trip/step-name.tsx`
- Create (stubs): `components/new-trip/step-when.tsx`, `components/new-trip/step-from.tsx`, `components/new-trip/step-where-past.tsx`, `components/new-trip/step-cover.tsx`
- Create: `components/new-trip/new-trip-flow.tsx`
- Test: `components/new-trip/new-trip-flow.test.tsx`

**Interfaces:**
- Consumes: everything from Task 8 (`lib/new-trip/draft.ts`), `TripPreview`, `TripPreviewMini` (Task 9), `Button` (`components/ui/button.tsx`), `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription` (`components/ui/dialog.tsx`), `Logo` (`components/ui/logo.tsx`), `AppLink` (`components/navigation/app-link.tsx`), `todayLocalISO`.
- Produces:
  - `export interface NewTripFlowProps { past: boolean; firstTrip: boolean; displayName?: string | null; initialName?: string; initialStep?: number; fromShareToken?: string }`; `export function NewTripFlow(props: NewTripFlowProps)`.
  - `StepProps` (`step-props.ts`): `{ draft: Draft; dispatch: React.Dispatch<DraftAction>; errors: StepErrors; attempt: number; formRef: React.RefObject<HTMLFormElement | null>; onNext: () => void; onBack: () => void; today: string; pending: boolean }`.
  - `StepActions({ showBack, onBack?, secondary?, primary, hint?, after? })`, `ContinueButton({ label? })`.
  - `stepLabels(past): readonly [string, string, string, string]`, `FlowTopBar({ labels, step, disabled, onGo, onCancel })`, `LeaveDialog({ open, onOpenChange, onLeave })`, `FlowProgressMobile({ step, onBack, disabled })`.
  - `StepName(props: StepProps & { eyebrow: string })`.
  - The URL carries `?step=N` (plus `past=1`, `fromShare=…` if present); `?name=` is dropped once read. The draft lives in `sessionStorage[DRAFT_KEY]`.

- [ ] **Step 1: Write the failing test** — `components/new-trip/new-trip-flow.test.tsx`:

```tsx
import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createTrip, findPlaces, push, toast } = vi.hoisted(() => ({ createTrip: vi.fn(), findPlaces: vi.fn(), push: vi.fn(), toast: vi.fn() }));
vi.mock("@/server/actions/trips", () => ({ createTrip: (...a: unknown[]) => createTrip(...a) }));
vi.mock("@/server/actions/places", () => ({ findPlaces: (q: string) => findPlaces(q) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("@/components/ui/use-toast", () => ({ toast: (o: unknown) => toast(o) }));
vi.mock("@/lib/image-compress", () => ({ compressImage: async (f: File) => f }));

import { NewTripFlow } from "./new-trip-flow";
import { DRAFT_KEY } from "@/lib/new-trip/draft";

type FlowProps = React.ComponentProps<typeof NewTripFlow>;
const flow = (props: Partial<FlowProps> = {}) => render(<NewTripFlow past={false} firstTrip={false} {...props} />);
const heading = (name: string | RegExp) => screen.findByRole("heading", { level: 2, name });
const nameInput = () => screen.getByRole("textbox", { name: "Trip name" });
const clickContinue = () => userEvent.click(screen.getByRole("button", { name: /^Continue/ }));
const stepParam = () => new URLSearchParams(window.location.search).get("step");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T10:00:00Z"));
  createTrip.mockReset().mockResolvedValue({ success: true, tripId: "t1", href: "/trips/kyoto" });
  findPlaces.mockReset().mockResolvedValue({ status: "ok", candidates: [] });
  push.mockReset();
  toast.mockReset();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/trips/new");
});
afterEach(() => vi.useRealTimers());

describe("NewTripFlow — shell and step 1", () => {
  it("opens on Where to? with the name focused", async () => {
    flow();
    expect(await heading("Where to?")).toBeInTheDocument();
    expect(nameInput()).toHaveFocus();
    expect(screen.getByText("New trip")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "New trip progress" })).toHaveAttribute("aria-valuenow", "1");
  });

  it.each<[Partial<FlowProps>, string]>([
    [{ firstTrip: true, displayName: "Cameron" }, "Welcome, Cameron. Let's start your first trip."],
    [{ firstTrip: true, displayName: null }, "Let's start your first trip."],
    [{ past: true }, "Log a past trip"],
  ])("eyebrow for %o", async (props, text) => {
    flow(props);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("past mode asks Where did you go? and labels step 3 Where", async () => {
    flow({ past: true });
    expect(await heading("Where did you go?")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Steps" })).getByText("Where")).toBeInTheDocument();
  });

  it("the name is required to continue", async () => {
    flow();
    await clickContinue();
    expect(await screen.findByText("Give it a name to keep going")).toBeInTheDocument();
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
    expect(nameInput()).toHaveFocus();
    expect(screen.getByRole("heading", { level: 2, name: "Where to?" })).toBeInTheDocument();
  });

  it("Enter in the name continues to When, mirrored in the URL and announced", async () => {
    flow();
    await userEvent.type(nameInput(), "Kyoto{Enter}");
    expect(await heading("When are you going?")).toBeInTheDocument();
    expect(stepParam()).toBe("2");
    expect(screen.getByText("Step 2 of 4, When")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "New trip progress" })).toHaveAttribute("aria-valuenow", "2");
  });

  it("a done pill goes back, keeping the answer", async () => {
    flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    await userEvent.click(screen.getByRole("button", { name: "Step 1: Name, done. Go back" }));
    expect(await heading("Where to?")).toBeInTheDocument();
    expect(nameInput()).toHaveValue("Kyoto");
  });

  it("the phone back button steps back", async () => {
    flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    await userEvent.click(screen.getByRole("button", { name: "Previous step" }));
    expect(await heading("Where to?")).toBeInTheDocument();
  });

  it("browser Back moves between steps", async () => {
    flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    window.history.pushState(null, "", "/trips/new?step=1");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await heading("Where to?")).toBeInTheDocument();
  });

  it("cold load at ?step=3 without a name opens on step 1", async () => {
    window.history.replaceState(null, "", "/trips/new?step=3");
    flow({ initialStep: 3 });
    expect(await heading("Where to?")).toBeInTheDocument();
    expect(stepParam()).toBe("1");
  });

  it("arriving from Where to first? opens on step 2 and drops ?name= from the URL", async () => {
    window.history.replaceState(null, "", "/trips/new?name=Japan&step=2");
    flow({ initialName: "Japan", initialStep: 2 });
    expect(await heading("When are you going?")).toBeInTheDocument();
    expect(window.location.search).toBe("?step=2");
  });

  it("the draft survives a remount", async () => {
    const { unmount } = flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!)).toMatchObject({ name: "Kyoto", step: 2 });
    unmount();
    flow();
    expect(await heading("When are you going?")).toBeInTheDocument();
  });

  it("Log a past trip keeps the name", async () => {
    flow();
    await userEvent.type(nameInput(), "Kyoto");
    expect(screen.getByRole("link", { name: "Log a past trip" })).toHaveAttribute("href", "/trips/new?past=1&name=Kyoto");
  });

  it("Esc on a dirty draft asks first; Keep going stays; Leave goes to /trips and forgets the draft", async () => {
    flow();
    await userEvent.type(nameInput(), "Kyoto");
    await userEvent.keyboard("{Escape}");
    const dialog = await screen.findByRole("dialog", { name: "Leave without saving?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep going" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Leave" }));
    expect(push).toHaveBeenCalledWith("/trips");
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("Cancel on a clean draft leaves at once", async () => {
    flow();
    await heading("Where to?");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).toHaveBeenCalledWith("/trips");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the live preview beside the question", async () => {
    flow();
    await userEvent.type(nameInput(), "Japan at Christmas");
    expect(within(screen.getByTestId("trip-preview")).getAllByText("Japan at Christmas").length).toBeGreaterThan(0);
  });
});
```

Run: `npm test -- components/new-trip/new-trip-flow.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 2: Implement the pieces**

`components/new-trip/step-props.ts`:

```ts
import type * as React from "react";
import type { Draft, DraftAction, StepErrors } from "@/lib/new-trip/draft";

export interface StepProps {
  draft: Draft;
  dispatch: React.Dispatch<DraftAction>;
  errors: StepErrors;
  /** Bumped on every refused Continue, so the error wiggle replays (MOTION N12). */
  attempt: number;
  formRef: React.RefObject<HTMLFormElement | null>;
  onNext: () => void;
  onBack: () => void;
  /** Device today, YYYY-MM-DD. */
  today: string;
  pending: boolean;
}
```

`components/new-trip/step-actions.tsx` — the action row, pinned to the bottom on phones inside the safe area (`px-5 pt-3.5 pb-[34px]`), at the column's foot (`mt-auto`) on desktop:

```tsx
import type { ReactNode } from "react";
import { ArrowLeft, CornerDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ContinueButton({ label = "Continue" }: { label?: string }) {
  return (
    <Button type="submit" className="h-14 flex-1 px-8 text-[17px] md:flex-none">
      {label}
      <kbd aria-hidden="true" className="hidden rounded-md border-2 border-primary-foreground/40 px-1 py-0.5 md:inline-flex">
        <CornerDownLeft className="size-4" />
      </kbd>
    </Button>
  );
}

export function StepActions({ showBack, onBack, secondary, primary, hint, after }: {
  showBack: boolean;
  onBack?: () => void;
  secondary?: ReactNode;
  primary: ReactNode;
  hint?: ReactNode;
  after?: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-auto flex flex-wrap items-center gap-3 bg-background px-5 pb-[calc(34px+env(safe-area-inset-bottom))] pt-3.5 md:static md:mx-0 md:bg-transparent md:px-0 md:pb-0 md:pt-10">
      {showBack ? (
        <Button type="button" variant="outline" onClick={onBack} className="pressable hidden h-14 px-6 text-[17px] md:inline-flex">
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
      ) : null}
      {secondary}
      {primary}
      {hint ? <span className="hidden text-[15px] font-bold tabular-nums md:inline">{hint}</span> : null}
      {after ? <div className="basis-full text-center md:basis-auto md:text-left">{after}</div> : null}
    </div>
  );
}
```

`components/new-trip/flow-top-bar.tsx` (NEW_TRIP.md §1 "Desktop top bar"):

```tsx
"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Step } from "@/lib/new-trip/draft";
import { cn } from "@/lib/cn";

export function stepLabels(past: boolean) {
  return (past ? ["Name", "When", "Where", "Cover"] : ["Name", "When", "From", "Cover"]) as readonly [string, string, string, string];
}

export function FlowTopBar({ labels, step, disabled, onGo, onCancel }: {
  labels: readonly string[];
  step: Step;
  disabled: boolean;
  onGo: (s: Step) => void;
  onCancel: () => void;
}) {
  return (
    <header className="island hidden h-[84px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b-2 border-border bg-sun px-10 text-on-accent md:grid">
      <Link
        href="/trips"
        aria-label="Teepee — back to your trips"
        onClick={(e) => {
          e.preventDefault();
          onCancel();
        }}
        className="justify-self-start rounded-md focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Logo variant="lockup" size={39} />
      </Link>
      <ol aria-label="Steps" className="flex gap-2">
        {labels.map((label, i) => {
          const n = (i + 1) as Step;
          const state = n < step ? "done" : n === step ? "current" : "upcoming";
          const pill = cn(
            "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-2 border-border pl-1.5 pr-3.5 text-sm font-bold text-foreground",
            state === "done" && "pressable bg-card",
            state === "current" && "island bg-coral shadow-hard-1",
            state === "upcoming" && "bg-transparent",
          );
          const dot = cn(
            "grid size-[22px] shrink-0 place-items-center rounded-full text-xs font-extrabold",
            state === "done" && "bg-foreground text-background",
            state === "current" && "border-2 border-border bg-card",
            state === "upcoming" && "border-2 border-border",
          );
          const inner = (
            <>
              <span aria-hidden="true" data-step-dot className={dot}>
                {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : n}
              </span>
              <span>{label}</span>
            </>
          );
          return (
            <li key={label}>
              {state === "done" ? (
                <button type="button" disabled={disabled} onClick={() => onGo(n)} aria-label={`Step ${n}: ${label}, done. Go back`} className={pill}>
                  {inner}
                </button>
              ) : (
                <span aria-current={state === "current" ? "step" : undefined} className={pill}>{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={onCancel} disabled={disabled} className="pressable inline-flex h-11 items-center gap-1.5 justify-self-end whitespace-nowrap rounded-full border-2 border-border bg-card px-4 text-[15px] font-extrabold text-foreground disabled:opacity-45">
        <X aria-hidden="true" className="size-4" />
        Cancel
      </button>
    </header>
  );
}

export function LeaveDialog({ open, onOpenChange, onLeave }: { open: boolean; onOpenChange: (o: boolean) => void; onLeave: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave without saving?</DialogTitle>
          <DialogDescription>Your answers so far won&apos;t be kept.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onLeave}>Leave</Button>
          <Button autoFocus onClick={() => onOpenChange(false)}>Keep going</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`components/new-trip/flow-progress-mobile.tsx` (NEW_TRIP.md §1 "Mobile"):

```tsx
"use client";

import { ArrowLeft, X } from "lucide-react";
import type { Step } from "@/lib/new-trip/draft";
import { cn } from "@/lib/cn";

export function FlowProgressMobile({ step, onBack, disabled }: { step: Step; onBack: () => void; disabled: boolean }) {
  const first = step === 1;
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 px-[18px] md:hidden">
      <button type="button" onClick={onBack} disabled={disabled} aria-label={first ? "Close" : "Previous step"} className="pressable grid size-11 shrink-0 place-items-center rounded-[14px] border-2 border-border bg-card shadow-hard-1">
        {first ? <X aria-hidden="true" className="size-5" /> : <ArrowLeft aria-hidden="true" className="size-5" />}
      </button>
      <div role="progressbar" aria-label="New trip progress" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step} className="grid flex-1 grid-cols-4 gap-[5px]">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            data-segment={n < step ? "done" : n === step ? "current" : "upcoming"}
            className={cn("h-2 rounded-full", n < step && "bg-foreground", n === step && "border-[1.5px] border-border bg-coral", n > step && "bg-muted")}
          />
        ))}
      </div>
      <span className="shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums text-muted-foreground">{step} of 4</span>
    </div>
  );
}
```

`components/new-trip/step-name.tsx` (NEW_TRIP.md §2):

```tsx
"use client";

import * as React from "react";
import { AppLink } from "@/components/navigation/app-link";
import { MAX_NAME } from "@/lib/new-trip/draft";
import { StepActions, ContinueButton } from "./step-actions";
import { TripPreviewMini } from "./trip-preview";
import type { StepProps } from "./step-props";
import { cn } from "@/lib/cn";

export function StepName({ draft, dispatch, errors, attempt, formRef, onNext, today, pending, eyebrow }: StepProps & { eyebrow: string }) {
  const headingId = React.useId();
  const helpId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const error = errors.name;

  React.useEffect(() => {
    if (error) inputRef.current?.focus();
  }, [error, attempt]);

  const trimmed = draft.name.trim();
  const pastHref = `/trips/new?past=1${trimmed ? `&name=${encodeURIComponent(trimmed)}` : ""}`;

  return (
    <form ref={formRef} aria-labelledby={headingId} noValidate onSubmit={(e) => { e.preventDefault(); onNext(); }} className="flex flex-1 flex-col md:pt-8">
      <fieldset disabled={pending} className="contents">
        <p className="text-[15px] font-bold text-muted-foreground">{eyebrow}</p>
        <h2 id={headingId} tabIndex={-1} className="mt-2 font-display text-[52px] font-extrabold leading-[.9] tracking-[-0.045em] outline-none md:text-[88px]">
          {draft.past ? "Where did you go?" : "Where to?"}
        </h2>
        <div key={attempt} className={cn("mt-8", error && "tp-wiggle")}>
          <input
            ref={inputRef}
            aria-label="Trip name"
            aria-invalid={error ? true : undefined}
            aria-describedby={helpId}
            autoFocus
            autoComplete="off"
            maxLength={MAX_NAME}
            placeholder="Japan in spring"
            value={draft.name}
            onChange={(e) => dispatch({ type: "set-name", name: e.target.value })}
            className={cn(
              "h-16 w-full rounded-[20px] border-2 bg-card px-6 text-[22px] font-bold text-foreground caret-coral shadow-hard-3 placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring md:h-20 md:text-[30px]",
              error ? "border-coral-text" : "border-border",
            )}
          />
        </div>
        <p id={helpId} className={cn("mt-3 text-[15px] font-medium", error ? "text-coral-text" : "text-muted-foreground")}>
          {error ?? (
            <>
              <span className="hidden md:inline">A place, a season, an excuse. </span>You can change it later.
            </>
          )}
        </p>
        <TripPreviewMini past={draft.past} step={1} name={draft.name} dateMode={draft.dateMode} today={today} />
        <StepActions
          showBack={false}
          primary={<ContinueButton />}
          after={
            draft.past ? null : (
              <p className="text-[15px] font-semibold">
                Already been?{" "}
                <AppLink href={pastHref} className="font-extrabold text-coral-text underline underline-offset-2">Log a past trip</AppLink>
              </p>
            )
          }
        />
      </fieldset>
    </form>
  );
}
```

Stubs (each a `"use client"` file exporting its step with the **final** export name, `StepProps` props, a `<form ref={formRef} aria-labelledby noValidate onSubmit={(e) => { e.preventDefault(); onNext(); }} className="flex flex-1 flex-col">`, an `h2` with `id`, `tabIndex={-1}` and class `font-display text-[44px] font-extrabold leading-[.95] tracking-[-0.04em] outline-none md:text-[64px]`, and `<StepActions showBack onBack={onBack} primary={<ContinueButton />} />`):
- `step-when.tsx` → `StepWhen`: "When did you go?" (past) / "When are you going?".
- `step-from.tsx` → `StepFrom`: "Leaving from?".
- `step-where-past.tsx` → `StepWherePast`: "Where did you stop?".
- `step-cover.tsx` → `StepCover(props: StepCoverProps)` with `export interface StepCoverProps extends StepProps { cover: { url: string } | null; onCover: (file: File | null) => void; onEdit: (step: Step) => void }`: "Got a photo for it?", primary `<ContinueButton label={draft.past ? "Add trip" : "Create trip"} />`.

- [ ] **Step 3: Implement the flow** — `components/new-trip/new-trip-flow.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { todayLocalISO } from "@/lib/dates";
import {
  DRAFT_KEY, clampStep, draftReducer, initDraft, isDirty, parseDraft, serializeDraft, validateStep,
  type Draft, type Step, type StepErrors,
} from "@/lib/new-trip/draft";
import { FlowTopBar, LeaveDialog, stepLabels } from "./flow-top-bar";
import { FlowProgressMobile } from "./flow-progress-mobile";
import { StepName } from "./step-name";
import { StepWhen } from "./step-when";
import { StepFrom } from "./step-from";
import { StepWherePast } from "./step-where-past";
import { StepCover } from "./step-cover";
import { TripPreview } from "./trip-preview";
import type { StepProps } from "./step-props";

export interface NewTripFlowProps {
  past: boolean;
  firstTrip: boolean;
  /** First word of the Traveller's display name, or null (spec C7). */
  displayName?: string | null;
  initialName?: string;
  initialStep?: number;
  /** Route copy (Phase 4): threaded into createTrip, ignored server-side until then. */
  fromShareToken?: string;
}

const noopSubscribe = () => () => {};

/**
 * The flow reads sessionStorage and the device clock, neither of which the
 * server has; rendering the body only on the client keeps SSR and the first
 * client render identical.
 */
export function NewTripFlow(props: NewTripFlowProps) {
  const mounted = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) {
    return (
      <div aria-busy="true" className="flex h-dvh flex-col bg-background">
        <div className="hidden h-[84px] border-b-2 border-border bg-sun md:block" />
      </div>
    );
  }
  return <FlowBody {...props} />;
}

function readStored(past: boolean): Draft | null {
  try {
    return parseDraft(window.sessionStorage.getItem(DRAFT_KEY), past);
  } catch {
    return null;
  }
}

function writeStepToUrl(step: Step, mode: "push" | "replace") {
  const url = new URL(window.location.href);
  url.searchParams.set("step", String(step));
  url.searchParams.delete("name");
  const next = `${url.pathname}?${url.searchParams.toString()}`;
  // Native history integrates with the App Router (next/dist/docs 01-getting-started/04-linking-and-navigating.md, "Native History API") — no server round trip per step.
  if (mode === "push") window.history.pushState(null, "", next);
  else window.history.replaceState(null, "", next);
}

function eyebrowFor(past: boolean, firstTrip: boolean, displayName?: string | null): string {
  if (past) return "Log a past trip";
  if (firstTrip) return displayName ? `Welcome, ${displayName}. Let's start your first trip.` : "Let's start your first trip.";
  return "New trip";
}

function FlowBody({ past, firstTrip, displayName, initialName, initialStep, fromShareToken }: NewTripFlowProps) {
  const router = useRouter();
  const today = React.useMemo(() => todayLocalISO(), []);
  const [draft, dispatch] = React.useReducer(draftReducer, undefined, () => initDraft({ past, initialName, initialStep, stored: readStored(past) }));
  const [errors, setErrors] = React.useState<StepErrors>({});
  const [attempt, setAttempt] = React.useState(0);
  const [leaving, setLeaving] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");
  const [pending] = React.useState(false); // Task 13 replaces this with useTransition
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const draftRef = React.useRef(draft);
  const labels = stepLabels(past);

  React.useEffect(() => {
    draftRef.current = draft;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, serializeDraft(draft));
    } catch {
      // Private mode / storage full: the draft just won't survive a refresh.
    }
  }, [draft]);

  const mountStep = React.useRef(draft.step);
  React.useEffect(() => {
    writeStepToUrl(mountStep.current, "replace");
  }, []);

  React.useEffect(() => {
    function onPop() {
      const n = Number(new URL(window.location.href).searchParams.get("step"));
      const step = clampStep(draftRef.current, n);
      setErrors({});
      dispatch({ type: "go", step });
      setAnnounce(`Step ${step} of 4, ${labels[step - 1]}`);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [labels]);

  function goTo(step: Step, opts: { keepErrors?: boolean } = {}) {
    if (step === draft.step) return;
    if (!opts.keepErrors) setErrors({});
    dispatch({ type: "go", step });
    setAnnounce(`Step ${step} of 4, ${labels[step - 1]}`);
    writeStepToUrl(step, "push");
  }

  function next() {
    const errs = validateStep(draft, draft.step);
    if (Object.keys(errs).length) {
      setErrors(errs);
      setAttempt((a) => a + 1);
      return;
    }
    if (draft.step < 4) goTo((draft.step + 1) as Step);
    // Step 4 submits — Task 13.
  }

  function leave() {
    try {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // nothing to forget
    }
    router.push("/trips");
  }

  function requestLeave() {
    if (isDirty(draft, false)) setLeaving(true);
    else leave();
  }

  function back() {
    if (draft.step > 1) goTo((draft.step - 1) as Step);
    else requestLeave();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.defaultPrevented) return;
    const t = e.target as HTMLElement;
    // Dialogs and popovers (portalled, but React events still bubble here) own their keys.
    if (t.closest("[data-radix-popper-content-wrapper], [role='dialog']")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      requestLeave();
    } else if (e.key === "Enter" && !t.closest("button, a, input, textarea, select, [role='combobox'], [role='radio']")) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  const stepProps: StepProps = { draft, dispatch, errors, attempt, formRef, onNext: next, onBack: back, today, pending };
  const stepEl =
    draft.step === 1 ? <StepName {...stepProps} eyebrow={eyebrowFor(past, firstTrip, displayName)} />
    : draft.step === 2 ? <StepWhen {...stepProps} />
    : draft.step === 3 ? (past ? <StepWherePast {...stepProps} /> : <StepFrom {...stepProps} />)
    : <StepCover {...stepProps} cover={null} onCover={() => {}} onEdit={(s) => goTo(s)} />;

  return (
    <div onKeyDown={onKeyDown} className="flex h-dvh flex-col bg-background">
      <FlowTopBar labels={labels} step={draft.step} disabled={pending} onGo={(s) => goTo(s)} onCancel={requestLeave} />
      <FlowProgressMobile step={draft.step} onBack={back} disabled={pending} />
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <main className="relative flex min-h-0 flex-col overflow-y-auto overflow-x-hidden px-5 pt-[22px] md:px-10 md:pb-12 md:pt-14 xl:pl-24 xl:pr-20">
          {stepEl}
        </main>
        <aside aria-hidden="true" className="relative hidden items-center justify-center border-l-2 border-border bg-canvas bg-[radial-gradient(hsl(var(--border-soft))_1.5px,transparent_1.5px)] bg-[size:22px_22px] p-8 md:flex">
          <TripPreview past={past} step={draft.step} name={draft.name} dateMode={draft.dateMode} startDate={draft.startDate} endDate={draft.endDate} roughMonth={draft.roughMonth} today={today} />
        </aside>
      </div>
      <p aria-live="polite" className="sr-only">{announce}</p>
      <LeaveDialog open={leaving} onOpenChange={setLeaving} onLeave={leave} />
    </div>
  );
}
```

`labels` is a fresh array each render; memoise it (`React.useMemo(() => stepLabels(past), [past])`) so the popstate effect doesn't re-subscribe every render.

- [ ] **Step 4: Run the tests**

Run: `npm test -- components/new-trip` — Expected: PASS. If `user-event`'s implicit submission doesn't fire on `{Enter}` in the name input, check the form has exactly one `type="submit"` button (ContinueButton) — it's what enables implicit submission.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add components/new-trip
git commit -m "feat(new-trip): focus-flow shell and the Name step

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 11: Step 2 — When

Implements NEW_TRIP.md §3 with spec C1 (no "How long?" stepper) and C2 (past mode: Exact dates only, required, "Add the dates you went").

**Files:**
- Create: `components/new-trip/step-harness.test-utils.tsx` (test helper, not a test file)
- Modify: `components/new-trip/step-when.tsx` (replace the stub)
- Test: `components/new-trip/step-when.test.tsx`

**Interfaces:**
- Consumes: `RangeCalendar` (Task 6), `CountdownStrip` (Task 9), `Segmented`, `SegmentedItem` (`components/ui/segmented.tsx`, `tone="ink"`), `roughMonthOptions`, `roughMonthChip` (Task 1), `whenLine` (Task 8), `addDays`, `formatMonthYear`.
- Produces: `StepWhen(props: StepProps)`; `StepHarness` + `currentDraft()` test helpers.

- [ ] **Step 1: Write the harness and the failing test**

`components/new-trip/step-harness.test-utils.tsx`:

```tsx
import * as React from "react";
import { screen } from "@testing-library/react";
import { draftReducer, emptyDraft, type Draft, type StepErrors } from "@/lib/new-trip/draft";
import type { StepProps } from "./step-props";

type Extra<P> = Omit<P, keyof StepProps>;

export function StepHarness<P extends StepProps>({ Step, initial = {}, errors = {}, onNext = () => {}, onBack = () => {}, today = "2026-09-30", extra }: {
  Step: React.ComponentType<P>;
  initial?: Partial<Draft>;
  errors?: StepErrors;
  onNext?: () => void;
  onBack?: () => void;
  today?: string;
  extra?: Extra<P>;
}) {
  const [draft, dispatch] = React.useReducer(draftReducer, undefined, () => ({ ...emptyDraft(initial.past ?? false), name: "Kyoto", ...initial }));
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const props = { draft, dispatch, errors, attempt: 0, formRef, onNext, onBack, today, pending: false, ...extra } as P;
  return (
    <>
      <Step {...props} />
      <output data-testid="draft">{JSON.stringify(draft)}</output>
    </>
  );
}

export function currentDraft(): Draft {
  return JSON.parse(screen.getByTestId("draft").textContent ?? "{}");
}
```

`components/new-trip/step-when.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StepWhen } from "./step-when";
import { StepHarness, currentDraft } from "./step-harness.test-utils";

const day = (name: string) => screen.getByRole("button", { name });

describe("StepWhen", () => {
  it("offers Exact dates · Roughly · Not sure yet, Exact first", () => {
    render(<StepHarness Step={StepWhen} />);
    expect(screen.getByRole("radio", { name: "Exact dates" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Roughly" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Not sure yet" })).toBeInTheDocument();
  });

  it("focuses its heading on arrival", () => {
    render(<StepHarness Step={StepWhen} />);
    expect(screen.getByRole("heading", { level: 2, name: "When are you going?" })).toHaveFocus();
  });

  it("exact: only days after today, the range lands in the draft, the summary and the phone strip show", async () => {
    render(<StepHarness Step={StepWhen} />);
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    await userEvent.click(day("Thu 15 Oct 2026"));
    await userEvent.click(day("Tue 20 Oct 2026"));
    expect(currentDraft()).toMatchObject({ startDate: "2026-10-15", endDate: "2026-10-20" });
    expect(screen.getByText("Thu 15 Oct – Tue 20 Oct · 5 nights")).toBeInTheDocument();
    expect(within(screen.getByTestId("countdown-strip")).getByText("15")).toBeInTheDocument();
  });

  it("roughly: twelve month chips from this month; a chip sets the rough month", async () => {
    render(<StepHarness Step={StepWhen} />);
    await userEvent.click(screen.getByRole("radio", { name: "Roughly" }));
    const chips = within(screen.getByRole("list", { name: "Months" })).getAllByRole("button");
    expect(chips).toHaveLength(12);
    expect(chips[0]).toHaveTextContent("Sep");
    await userEvent.click(screen.getByRole("button", { name: "April 2027" }));
    expect(currentDraft()).toMatchObject({ dateMode: "rough", roughMonth: "2027-04" });
    expect(screen.getByRole("button", { name: "April 2027" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/How long/)).toBeNull();
  });

  it("not sure yet: one reassuring line", async () => {
    render(<StepHarness Step={StepWhen} />);
    await userEvent.click(screen.getByRole("radio", { name: "Not sure yet" }));
    expect(screen.getByText("No problem. Add dates when you've picked your stops.")).toBeInTheDocument();
    expect(currentDraft().dateMode).toBe("none");
  });

  it("shows a date error under the grid", () => {
    render(<StepHarness Step={StepWhen} errors={{ dates: "Pick the day you get back" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Pick the day you get back");
  });

  it("past mode: no modes, the last two months up to today, and asks when you went", () => {
    render(<StepHarness Step={StepWhen} initial={{ past: true }} />);
    expect(screen.getByRole("heading", { level: 2, name: "When did you go?" })).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("heading", { name: "August 2026" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "September 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    expect(screen.queryByTestId("countdown-strip")).toBeNull();
  });

  it("Continue submits the step", async () => {
    const onNext = vi.fn();
    render(<StepHarness Step={StepWhen} onNext={onNext} />);
    await userEvent.click(screen.getByRole("button", { name: /^Continue/ }));
    expect(onNext).toHaveBeenCalled();
  });
});
```

Run: `npm test -- components/new-trip/step-when.test.tsx` — Expected: FAIL.

- [ ] **Step 2: Implement** — `components/new-trip/step-when.tsx`:

```tsx
"use client";

import * as React from "react";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { RangeCalendar } from "@/components/ui/range-calendar";
import { addDays, formatMonthYear } from "@/lib/dates";
import { roughMonthChip, roughMonthOptions } from "@/lib/rough-month";
import { whenLine, type DateMode } from "@/lib/new-trip/draft";
import { StepActions, ContinueButton } from "./step-actions";
import { CountdownStrip } from "./trip-preview";
import type { StepProps } from "./step-props";
import { cn } from "@/lib/cn";

const MODE_ITEM = "h-10 px-4 text-[15px] font-bold";

export function StepWhen({ draft, dispatch, errors, attempt, formRef, onNext, onBack, today, pending }: StepProps) {
  const headingId = React.useId();
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const exact = draft.past || draft.dateMode === "exact";
  const complete = exact && draft.startDate && draft.endDate ? { start: draft.startDate, end: draft.endDate } : null;

  return (
    <form ref={formRef} aria-labelledby={headingId} noValidate onSubmit={(e) => { e.preventDefault(); onNext(); }} className="flex flex-1 flex-col">
      <fieldset disabled={pending} className="contents">
        <h2 ref={headingRef} id={headingId} tabIndex={-1} className="font-display text-[44px] font-extrabold leading-[.95] tracking-[-0.04em] outline-none md:text-[64px]">
          {draft.past ? "When did you go?" : "When are you going?"}
        </h2>

        {draft.past ? null : (
          <Segmented
            type="single"
            tone="ink"
            aria-label="When"
            value={draft.dateMode}
            onValueChange={(v) => v && dispatch({ type: "set-mode", mode: v as DateMode })}
            className="mt-6 grid w-full grid-cols-3 border-border md:inline-flex md:w-auto md:self-start"
          >
            <SegmentedItem value="exact" aria-label="Exact dates" className={MODE_ITEM}>
              <span className="md:hidden">Dates</span>
              <span className="hidden md:inline">Exact dates</span>
            </SegmentedItem>
            <SegmentedItem value="rough" aria-label="Roughly" className={MODE_ITEM}>Roughly</SegmentedItem>
            <SegmentedItem value="none" aria-label="Not sure yet" className={MODE_ITEM}>
              <span className="md:hidden">Not sure</span>
              <span className="hidden md:inline">Not sure yet</span>
            </SegmentedItem>
          </Segmented>
        )}

        <div className="mt-6">
          {exact ? (
            <>
              <RangeCalendar
                months={2}
                start={draft.startDate}
                end={draft.endDate}
                onChange={(r) => dispatch({ type: "set-range", start: r.start, end: r.end })}
                {...(draft.past ? { disableAfter: today } : { disableBefore: addDays(today, 1) })}
              />
              {complete && !draft.past ? <CountdownStrip startDate={complete.start} endDate={complete.end} today={today} /> : null}
            </>
          ) : draft.dateMode === "rough" ? (
            <ul aria-label="Months" className="grid grid-cols-3 gap-2.5 md:grid-cols-4">
              {roughMonthOptions(today).map((ym) => {
                const on = draft.roughMonth === ym;
                return (
                  <li key={ym}>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={formatMonthYear(`${ym}-01`)}
                      onClick={() => dispatch({ type: "set-rough-month", ym: on ? undefined : ym })}
                      className={cn("pressable h-12 w-full whitespace-nowrap rounded-full border-2 border-border text-[15px] font-bold", on ? "bg-foreground text-background" : "bg-card text-foreground")}
                    >
                      {roughMonthChip(ym, today)}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[17px] font-semibold text-foreground/80">No problem. Add dates when you&apos;ve picked your stops.</p>
          )}
          {errors.dates ? <p key={attempt} role="alert" className="mt-3 text-[15px] font-bold text-coral-text">{errors.dates}</p> : null}
        </div>

        <StepActions showBack onBack={onBack} primary={<ContinueButton />} hint={complete ? whenLine(draft, today) : null} />
      </fieldset>
    </form>
  );
}
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- components/new-trip` — Expected: PASS (the Task 10 flow tests still pass: an empty exact range continues).

- [ ] **Step 4: Typecheck, lint, commit**

```bash
git add components/new-trip/step-when.tsx components/new-trip/step-when.test.tsx components/new-trip/step-harness.test-utils.tsx
git commit -m "feat(new-trip): When step — range calendar, rough months, not sure yet

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 12: Step 3 — From (normal) and Where (past)

Implements NEW_TRIP.md §4 (the mobile `2d` third phone is the spec) and §6 row 3 with spec C3 (optional, Skip).

**Files:**
- Modify: `components/new-trip/step-from.tsx`, `components/new-trip/step-where-past.tsx` (replace the stubs)
- Test: `components/new-trip/step-from.test.tsx`, `components/new-trip/step-where-past.test.tsx`

**Interfaces:**
- Consumes: `PlaceCombobox` (Task 7; `aria-label` "Leaving from" / "Add a place"), `CurrencyRow` (Task 7), `currencyForCountry` (Task 5), `Button`.
- Produces: `StepFrom(props: StepProps)`, `StepWherePast(props: StepProps)`.
- Copy: note is `Picked from {place}. Costs in other currencies convert to this.` only when a place was picked **and** the currency is the one its country maps to; otherwise `Costs in other currencies convert to this.`

- [ ] **Step 1: Write the failing tests**

`components/new-trip/step-from.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { findPlaces } = vi.hoisted(() => ({ findPlaces: vi.fn() }));
vi.mock("@/server/actions/places", () => ({ findPlaces: (q: string) => findPlaces(q) }));

import { StepFrom } from "./step-from";
import { StepHarness, currentDraft } from "./step-harness.test-utils";

const PORTLAND = { name: "Portland, Multnomah County, Oregon, United States", lat: 45.52, lng: -122.68, city: "Portland", country: "United States", countryCode: "us" };
const DENPASAR = { name: "Denpasar, Bali, Indonesia", lat: -8.65, lng: 115.22, city: "Denpasar", country: "Indonesia", countryCode: "id" };
const combo = () => screen.getByRole("combobox", { name: "Leaving from" });

async function pick(query: string) {
  await userEvent.type(combo(), query);
  await screen.findAllByRole("option");
  await userEvent.keyboard("{Enter}");
}

describe("StepFrom", () => {
  beforeEach(() => findPlaces.mockReset().mockResolvedValue({ status: "ok", candidates: [PORTLAND] }));

  it("asks where you're leaving from, with the search focused", () => {
    render(<StepHarness Step={StepFrom} />);
    expect(screen.getByRole("heading", { level: 2, name: "Leaving from?" })).toBeInTheDocument();
    expect(screen.getByText("Your home base. It's where the trip starts and ends.")).toBeInTheDocument();
    expect(combo()).toHaveFocus();
  });

  it("picking a place sets the home and the currency, and says so", async () => {
    render(<StepHarness Step={StepFrom} />);
    await pick("Portl");
    expect(currentDraft()).toMatchObject({ homeName: "Portland", homeCurrency: "USD" });
    expect(screen.getByText("USD")).toBeInTheDocument();
    expect(screen.getByText("Picked from Portland. Costs in other currencies convert to this.")).toBeInTheDocument();
  });

  it("a place whose country has no currency here keeps the currency and the plain note", async () => {
    findPlaces.mockResolvedValue({ status: "ok", candidates: [DENPASAR] });
    render(<StepHarness Step={StepFrom} />);
    await pick("Denp");
    expect(currentDraft()).toMatchObject({ homeName: "Denpasar", homeCurrency: "AUD" });
    expect(screen.getByText("Costs in other currencies convert to this.")).toBeInTheDocument();
    expect(screen.queryByText(/Picked from/)).toBeNull();
  });

  it("Enter on a highlighted home result picks it and stays on step 3", async () => {
    const onNext = vi.fn();
    render(<StepHarness Step={StepFrom} onNext={onNext} />);
    await pick("Portl");
    expect(onNext).not.toHaveBeenCalled();
  });

  it("a typed place with no pick is kept as free text", async () => {
    findPlaces.mockResolvedValue({ status: "ok", candidates: [] });
    render(<StepHarness Step={StepFrom} />);
    await userEvent.type(combo(), "Sydneyish");
    expect(currentDraft().homeName).toBe("Sydneyish");
    expect(currentDraft().homePlace).toBeUndefined();
  });

  it("Change sets another currency", async () => {
    render(<StepHarness Step={StepFrom} />);
    await userEvent.click(screen.getByRole("button", { name: /Change currency/ }));
    await userEvent.click(screen.getByRole("button", { name: /JPY/ }));
    expect(currentDraft().homeCurrency).toBe("JPY");
  });

  it("Skip clears the home and moves on", async () => {
    const onNext = vi.fn();
    render(<StepHarness Step={StepFrom} onNext={onNext} initial={{ homeName: "Somewhere" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onNext).toHaveBeenCalled();
    expect(currentDraft().homeName).toBeUndefined();
  });
});
```

`components/new-trip/step-where-past.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { findPlaces } = vi.hoisted(() => ({ findPlaces: vi.fn() }));
vi.mock("@/server/actions/places", () => ({ findPlaces: (q: string) => findPlaces(q) }));

import { StepWherePast } from "./step-where-past";
import { StepHarness, currentDraft } from "./step-harness.test-utils";

const KYOTO = { name: "Kyoto, Kyoto Prefecture, Japan", lat: 35.01, lng: 135.77, city: "Kyoto", country: "Japan", countryCode: "jp" };
const combo = () => screen.getByRole("combobox", { name: "Add a place" });
const past = { past: true, startDate: "2026-08-01", endDate: "2026-08-10" };

describe("StepWherePast", () => {
  beforeEach(() => findPlaces.mockReset().mockResolvedValue({ status: "ok", candidates: [KYOTO] }));

  it("asks where you stopped, and it's optional", () => {
    render(<StepHarness Step={StepWherePast} initial={past} />);
    expect(screen.getByRole("heading", { level: 2, name: "Where did you stop?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(screen.getByText("Show money in")).toBeInTheDocument();
  });

  it("a picked place becomes a removable chip with its coordinates", async () => {
    render(<StepHarness Step={StepWherePast} initial={past} />);
    await userEvent.type(combo(), "Kyo");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    expect(currentDraft().stops).toEqual([{ name: "Kyoto", lat: 35.01, lng: 135.77, countryCode: "jp" }]);
    expect(combo()).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove Kyoto" }));
    expect(currentDraft().stops).toEqual([]);
  });

  it("Enter with typed text and no result adds it as written, without continuing", async () => {
    const onNext = vi.fn();
    findPlaces.mockResolvedValue({ status: "ok", candidates: [] });
    render(<StepHarness Step={StepWherePast} initial={past} onNext={onNext} />);
    await userEvent.type(combo(), "Nowhereville{Enter}");
    expect(currentDraft().stops).toEqual([{ name: "Nowhereville" }]);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("Enter on an empty search continues", async () => {
    const onNext = vi.fn();
    render(<StepHarness Step={StepWherePast} initial={past} onNext={onNext} />);
    combo().focus();
    await userEvent.keyboard("{Enter}");
    expect(onNext).toHaveBeenCalled();
  });

  it("Continue adds a half-typed place first", async () => {
    const onNext = vi.fn();
    findPlaces.mockResolvedValue({ status: "ok", candidates: [] });
    render(<StepHarness Step={StepWherePast} initial={past} onNext={onNext} />);
    await userEvent.type(combo(), "Nara");
    await userEvent.click(screen.getByRole("button", { name: /^Continue/ }));
    expect(currentDraft().stops).toEqual([{ name: "Nara" }]);
    expect(onNext).toHaveBeenCalled();
  });
});
```

Run: `npm test -- components/new-trip/step-from.test.tsx components/new-trip/step-where-past.test.tsx` — Expected: FAIL.

- [ ] **Step 2: Implement `StepFrom`** — replace `components/new-trip/step-from.tsx`:
- Heading "Leaving from?" (same class as the stub), then `<p className="mt-2 text-[15px] font-medium text-muted-foreground">Your home base. It&apos;s where the trip starts and ends.</p>`.
- `<div className="mt-6"><PlaceCombobox aria-label="Leaving from" autoFocus value={draft.homeName ?? ""} onValueChange={(text) => dispatch({ type: "set-home-text", text })} onPick={(place) => dispatch({ type: "pick-home", place })} /></div>` — `pick()` calls `onValueChange` then `onPick`, so the reducer ends with the picked place.
- `{errors.home ? <p role="alert" className="mt-3 text-[15px] font-bold text-coral-text">{errors.home}</p> : null}`.
- `<div className="mt-6"><CurrencyRow value={draft.homeCurrency} onChange={(code) => dispatch({ type: "set-currency", code })} note={note} /></div>` where

```ts
  const picked = draft.homePlace;
  const fromPlace = picked?.countryCode !== undefined && currencyForCountry(picked.countryCode) === draft.homeCurrency;
  const note = fromPlace ? `Picked from ${picked!.name}. Costs in other currencies convert to this.` : "Costs in other currencies convert to this.";
```

- Actions: `<StepActions showBack onBack={onBack} secondary={<Button type="button" variant="outline" className="pressable h-14 px-6 text-[17px]" onClick={() => { dispatch({ type: "clear-home" }); onNext(); }}>Skip</Button>} primary={<ContinueButton />} />`. Skip keeps whatever currency the row shows (the default unless the Traveller changed it).
- Wrap the body in `<fieldset disabled={pending} className="contents">` like the other steps.

- [ ] **Step 3: Implement `StepWherePast`** — replace `components/new-trip/step-where-past.tsx`:
- Local `const [text, setText] = React.useState("")`.
- `function addTyped(): boolean { if (!text.trim()) return false; dispatch({ type: "add-stop", stop: { name: text } }); setText(""); return true; }`.
- Form `onSubmit={(e) => { e.preventDefault(); addTyped(); onNext(); }}` (Continue adds a half-typed place, then continues).
- Heading "Where did you stop?", helper `<p className="mt-2 text-[15px] font-medium text-muted-foreground">Add the places you stayed. You can skip this and add them later.</p>`.
- The combobox sits in a wrapper that turns Enter-with-text (not already taken by a highlighted result) into "add":

```tsx
        <div
          className="mt-6"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.defaultPrevented && text.trim()) {
              e.preventDefault();
              addTyped();
            }
          }}
        >
          <PlaceCombobox
            aria-label="Add a place"
            placeholder="Add a town or city"
            autoFocus
            value={text}
            onValueChange={setText}
            onPick={(p) => {
              dispatch({ type: "add-stop", stop: { name: p.name, lat: p.lat, lng: p.lng, ...(p.countryCode ? { countryCode: p.countryCode } : {}) } });
              setText("");
            }}
            rankNear={lastLocated}
          />
        </div>
```

  with `const lastLocated = [...draft.stops].reverse().find((s) => s.lat !== undefined && s.lng !== undefined) as { lat: number; lng: number } | undefined;`.
- Chips: `<ul aria-label="Places" className="mt-4 flex flex-wrap gap-2">`, each `<li className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-border bg-card pl-3.5 pr-1 text-[15px] font-bold"><MapPin aria-hidden="true" className="size-4" />{s.name}<button type="button" aria-label={`Remove ${s.name}`} onClick={() => dispatch({ type: "remove-stop", index: i })} className="relative grid size-8 place-items-center rounded-full hover:bg-muted after:absolute after:-inset-1.5 after:content-['']"><X aria-hidden="true" className="size-4" /></button></li>` (the `after` inset makes the 32px button a 44px target).
- `{errors.home ? …alert… : null}`, then `<div className="mt-6"><CurrencyRow value={draft.homeCurrency} onChange={(code) => dispatch({ type: "set-currency", code })} note="Costs in other currencies convert to this." /></div>`.
- Actions: `secondary={draft.stops.length === 0 ? <Button type="button" variant="outline" className="pressable h-14 px-6 text-[17px]" onClick={onNext}>Skip</Button> : null}`, `primary={<ContinueButton />}`.

- [ ] **Step 4: Run the tests**

Run: `npm test -- components/new-trip` — Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add components/new-trip/step-from.tsx components/new-trip/step-from.test.tsx components/new-trip/step-where-past.tsx components/new-trip/step-where-past.test.tsx
git commit -m "feat(new-trip): From step (home + currency) and past-mode Where step

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 13: Step 4 — Cover and review, and creating the trip

Implements NEW_TRIP.md §5 and "After create" (spec C5: pop-and-lift comes in Task 17; no View Transitions morph), plus the §9 test list.

**Files:**
- Modify: `components/new-trip/step-cover.tsx` (replace the stub)
- Test: `components/new-trip/step-cover.test.tsx`
- Modify: `components/new-trip/new-trip-flow.tsx` (cover state, `useTransition` submit, server errors)
- Test: `components/new-trip/new-trip-flow.test.tsx` (add the create describe)

**Interfaces:**
- Consumes: `createTrip` (Task 3), `compressImage` (`lib/image-compress.ts`), `toast` (`components/ui/use-toast.ts`), `toCreateInput`, `errorStep`, `stepErrorsFrom`, `whenLine`, `DRAFT_KEY` (Task 8), `SM_HIT` (`components/ui/touch-target.ts`).
- Produces: `StepCover(props: StepCoverProps)` (interface from Task 10). The flow's submit: compress → `createTrip(toCreateInput(draft, { fromShareToken }), cover)` → on failure put errors on the right step and jump to the earliest one → on success clear the draft, toast on a first (non-past) trip, `router.push(result.href)`.

- [ ] **Step 1: Write the failing tests**

`components/new-trip/step-cover.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StepCover } from "./step-cover";
import { StepHarness } from "./step-harness.test-utils";

const file = () => new File(["x"], "cover.png", { type: "image/png" });

function renderCover(over: { initial?: Parameters<typeof StepHarness>[0]["initial"]; cover?: { url: string } | null; onCover?: (f: File | null) => void; onEdit?: (s: 1 | 2 | 3 | 4) => void; errors?: { form?: string } } = {}) {
  const onCover = over.onCover ?? vi.fn();
  const onEdit = over.onEdit ?? vi.fn();
  render(<StepHarness Step={StepCover} initial={over.initial} errors={over.errors} extra={{ cover: over.cover ?? null, onCover, onEdit }} />);
  return { onCover, onEdit };
}

describe("StepCover", () => {
  it("offers the polaroid dropzone with an image-only file input", () => {
    renderCover();
    expect(screen.getByRole("heading", { level: 2, name: "Got a photo for it?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Drop a photo/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Cover photo")).toHaveAttribute("accept", "image/*");
  });

  it("choosing or dropping a photo hands it up", async () => {
    const { onCover } = renderCover();
    const f = file();
    await userEvent.upload(screen.getByLabelText("Cover photo"), f);
    expect(onCover).toHaveBeenCalledWith(f);
    fireEvent.drop(screen.getByTestId("cover-dropzone"), { dataTransfer: { files: [f] } });
    expect(onCover).toHaveBeenCalledTimes(2);
  });

  it("with a photo: shows it, with Replace and Remove", async () => {
    const { onCover } = renderCover({ cover: { url: "blob:cover" } });
    expect(screen.getByRole("img", { name: "Cover photo preview" })).toHaveAttribute("src", "blob:cover");
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onCover).toHaveBeenCalledWith(null);
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();
  });

  it("the review lists every step; skipped ones read muted", () => {
    renderCover({ initial: { dateMode: "none" } });
    expect(screen.getByText("Your trip")).toBeInTheDocument();
    expect(screen.getByText("Kyoto")).toBeInTheDocument();
    expect(screen.getByText("No dates yet")).toHaveClass("text-muted-foreground");
    expect(screen.getByText("Home base not set · money in AUD")).toHaveClass("text-muted-foreground");
  });

  it("the review reads answered steps", () => {
    renderCover({ initial: { startDate: "2026-12-04", endDate: "2027-01-08", homeName: "Sydney" } });
    expect(screen.getByText("Fri 4 Dec – Fri 8 Jan · 35 nights")).toBeInTheDocument();
    expect(screen.getByText("Sydney · money in AUD")).toBeInTheDocument();
  });

  it("Edit jumps to that step", async () => {
    const { onEdit } = renderCover();
    await userEvent.click(screen.getByRole("button", { name: "Edit When" }));
    expect(onEdit).toHaveBeenCalledWith(2);
  });

  it("Create trip is the one coral CTA, with the next hint", () => {
    renderCover();
    const cta = screen.getByRole("button", { name: /Create trip/ });
    expect(cta.className).toMatch(/\bbg-coral\b/);
    expect(screen.getByText("Next: add your first stop")).toBeInTheDocument();
  });

  it("past mode: Add trip, a Where row, no hint", () => {
    renderCover({ initial: { past: true, startDate: "2026-08-01", endDate: "2026-08-10", stops: [{ name: "Kyoto" }, { name: "Nara" }] } });
    expect(screen.getByRole("button", { name: /Add trip/ })).toBeInTheDocument();
    expect(screen.getByText("Kyoto, Nara · money in AUD")).toBeInTheDocument();
    expect(screen.queryByText("Next: add your first stop")).toBeNull();
  });

  it("shows a form-level server error", () => {
    renderCover({ errors: { form: "Something went wrong. Try again." } });
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
  });
});
```

Append to `components/new-trip/new-trip-flow.test.tsx`:

```tsx
async function toCover(name = "Kyoto") {
  await userEvent.type(nameInput(), name);
  await clickContinue();
  await heading("When are you going?");
  await userEvent.click(screen.getByRole("radio", { name: "Not sure yet" }));
  await clickContinue();
  await heading("Leaving from?");
  await userEvent.click(screen.getByRole("button", { name: "Skip" }));
  await heading("Got a photo for it?");
}

describe("NewTripFlow — create (NEW_TRIP.md §9)", () => {
  it("skipping steps 2–4 still creates a trip with just a name", async () => {
    flow();
    await toCover();
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    await waitFor(() => expect(createTrip).toHaveBeenCalledWith({ name: "Kyoto", homeCurrency: "AUD" }, null));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/trips/kyoto"));
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it("past mode requires the dates", async () => {
    flow({ past: true });
    await userEvent.type(nameInput(), "Bali 2024");
    await clickContinue();
    await heading("When did you go?");
    await clickContinue();
    expect(await screen.findByRole("alert")).toHaveTextContent("Add the dates you went");
    expect(screen.getByRole("heading", { level: 2, name: "When did you go?" })).toBeInTheDocument();
  });

  it("past mode: dates and a stop, then the Globe", async () => {
    createTrip.mockResolvedValue({ success: true, tripId: "t9", href: "/globe?added=t9" });
    findPlaces.mockResolvedValue({ status: "ok", candidates: [{ name: "Kyoto, Kyoto Prefecture, Japan", lat: 35.01, lng: 135.77, city: "Kyoto", country: "Japan", countryCode: "jp" }] });
    flow({ past: true });
    await userEvent.type(nameInput(), "Kansai");
    await clickContinue();
    await heading("When did you go?");
    await userEvent.click(screen.getByRole("button", { name: "Sat 1 Aug 2026" }));
    await userEvent.click(screen.getByRole("button", { name: "Mon 10 Aug 2026" }));
    await clickContinue();
    await heading("Where did you stop?");
    await userEvent.type(screen.getByRole("combobox", { name: "Add a place" }), "Kyo");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    await clickContinue();
    await heading("Got a photo for it?");
    await userEvent.click(screen.getByRole("button", { name: /Add trip/ }));
    await waitFor(() =>
      expect(createTrip).toHaveBeenCalledWith(
        { name: "Kansai", homeCurrency: "AUD", startDate: "2026-08-01", endDate: "2026-08-10", stops: [{ name: "Kyoto", lat: 35.01, lng: 135.77, countryCode: "jp" }] },
        null,
      ),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/globe?added=t9"));
  });

  it("the currency follows the home place", async () => {
    findPlaces.mockResolvedValue({ status: "ok", candidates: [{ name: "Portland, Multnomah County, Oregon, United States", lat: 45.52, lng: -122.68, city: "Portland", country: "United States", countryCode: "us" }] });
    flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    await clickContinue();
    await heading("Leaving from?");
    await userEvent.type(screen.getByRole("combobox", { name: "Leaving from" }), "Portl");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText(/Picked from Portland\./)).toBeInTheDocument();
    await clickContinue();
    await heading("Got a photo for it?");
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    await waitFor(() =>
      expect(createTrip).toHaveBeenCalledWith(expect.objectContaining({ homeName: "Portland", homeCurrency: "USD", homeLat: 45.52, homeLng: -122.68, homeCountryCode: "us" }), null),
    );
  });

  it("Edit from the review goes back to that step, and the review is kept", async () => {
    flow();
    await toCover();
    await userEvent.click(screen.getByRole("button", { name: "Edit When" }));
    await heading("When are you going?");
    await userEvent.click(screen.getByRole("radio", { name: "Roughly" }));
    await userEvent.click(screen.getByRole("button", { name: "April 2027" }));
    await clickContinue();
    await heading("Leaving from?");
    await clickContinue();
    await heading("Got a photo for it?");
    const review = screen.getByRole("region", { name: "Your trip" });
    expect(within(review).getByText("Sometime in April")).toBeInTheDocument();
    expect(within(review).getByText("Kyoto")).toBeInTheDocument();
  });

  it("a server error on the name jumps back to step 1 and shows it there", async () => {
    createTrip.mockResolvedValue({ success: false, errors: { name: ["Trip name must be 120 characters or fewer"] } });
    flow();
    await toCover();
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    expect(await heading("Where to?")).toBeInTheDocument();
    expect(screen.getByText("Trip name must be 120 characters or fewer")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("a first trip toasts once it's created", async () => {
    flow({ firstTrip: true });
    await toCover("Japan at Christmas");
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Japan at Christmas is ready.", description: "Add your first stop to start the route." }));
  });

  it("a chosen cover is previewed and sent", async () => {
    URL.createObjectURL = vi.fn(() => "blob:cover");
    URL.revokeObjectURL = vi.fn();
    flow();
    await toCover();
    const f = new File(["x"], "c.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Cover photo"), f);
    expect(screen.getByRole("img", { name: "Cover photo preview" })).toHaveAttribute("src", "blob:cover");
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    await waitFor(() => expect(createTrip.mock.calls[0][1]).toBe(f));
  });

  // Resolve the pending create before the test ends: a transition left pending
  // across tests hangs this vitest/jsdom/React 19 setup (see first-trip-card history).
  it("while creating, the pills and inputs are disabled", async () => {
    let resolve!: (v: unknown) => void;
    createTrip.mockImplementation(() => new Promise((r) => { resolve = r; }));
    flow();
    await toCover();
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Step 1: Name, done. Go back" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Edit Name" })).toBeDisabled();
    resolve({ success: false, errors: { _: ["Try again"] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
  });
});
```

Run: `npm test -- components/new-trip` — Expected: FAIL.

- [ ] **Step 2: Implement `StepCover`** — replace `components/new-trip/step-cover.tsx`. Keep `StepCoverProps` as defined in Task 10. Structure:
- Heading "Got a photo for it?" (stub class), body `<p className="mt-3 max-w-[560px] text-base text-foreground/80">Totally optional. Skip it and we&apos;ll stamp the card for you, then sketch your route once you add stops.</p>`.
- `<div className="mt-8 flex flex-col items-center gap-8 md:flex-row md:items-start">` holding `<PolaroidDropzone …/>` and `<ReviewList …/>` (both local components in the file).
- `{errors.form ? <p role="alert" className="mt-4 text-[15px] font-bold text-coral-text">{errors.form}</p> : null}`.
- Actions: `<StepActions showBack onBack={onBack} primary={<Button type="submit" variant="accent" loading={pending} className="h-14 flex-1 px-7 text-[17px] text-foreground shadow-hard-3 md:flex-none">{draft.past ? "Add trip" : "Create trip"}<ArrowRight aria-hidden="true" /></Button>} hint={draft.past ? null : <span className="text-on-accent-muted">Next: add your first stop</span>} />`. The fieldset (`disabled={pending}`) disables every control, the review's Edit links included.

`PolaroidDropzone({ cover, onCover, disabled })` (NEW_TRIP.md §5; `CoverDropzone`'s drag/drop + file-input logic, made controlled):

```tsx
function PolaroidDropzone({ cover, onCover, disabled }: { cover: { url: string } | null; onCover: (f: File | null) => void; disabled: boolean }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const take = (f?: File | null) => {
    if (f && f.type.startsWith("image/")) onCover(f);
  };
  return (
    <div className="flex shrink-0 flex-col items-center">
      <div
        data-testid="cover-dropzone"
        data-dragging={dragging ? "" : undefined}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!disabled) take(e.dataTransfer.files?.[0]); }}
        className={cn("w-[200px] rounded-xl border-2 border-border bg-card p-[9px] pb-[34px] shadow-hard-3", dragging ? "rotate-0 scale-[1.03]" : "-rotate-3")}
      >
        <input ref={inputRef} type="file" accept="image/*" aria-label="Cover photo" tabIndex={-1} className="sr-only" disabled={disabled} onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
        <div className={cn("relative grid aspect-[3/4] place-items-center overflow-hidden rounded-[6px] border-2 border-border", cover || dragging ? "border-solid" : "border-dashed")}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img src={cover.url} alt="Cover photo preview" className="absolute inset-0 size-full object-cover" />
          ) : (
            <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="flex size-full flex-col items-center justify-center gap-2 text-center focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring">
              <span aria-hidden="true" className="island grid size-11 place-items-center rounded-full border-2 border-border bg-sun"><Plus className="size-5" strokeWidth={3} /></span>
              <span className="text-[15px] font-extrabold">Drop a photo</span>
              <span className="text-[13px] font-semibold text-muted-foreground">or choose one</span>
            </button>
          )}
        </div>
      </div>
      {cover ? (
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="secondary" size="sm" className={SM_HIT} disabled={disabled} onClick={() => inputRef.current?.click()}>Replace</Button>
          <Button type="button" variant="ghost" size="sm" className={SM_HIT} disabled={disabled} onClick={() => onCover(null)}>Remove</Button>
        </div>
      ) : null}
    </div>
  );
}
```

`ReviewList({ draft, today, onEdit })`: `<section aria-labelledby={id} className="w-full min-w-0 flex-1">`, `<h3 id={id} className="text-[11px] font-extrabold uppercase tracking-[0.08em]">Your trip</h3>`, `<ul className="mt-2.5 flex flex-col gap-2.5">` with three rows:

| step | tile | label | value | when empty |
|---|---|---|---|---|
| 1 | `bg-coral` | Name | `draft.name.trim()` | — |
| 2 | `bg-sun` | When | `whenLine(draft, today)` | `No dates yet` |
| 3 | `bg-teal` | From (past: Where) | `${homeName} · money in ${code}` (past: `${first three stop names joined ", "}${n > 3 ? ` +${n - 3}` : ""} · money in ${code}`) | `Home base not set · money in ${code}` (past: `No places yet · money in ${code}`) |

Each `<li className="flex min-h-12 items-center gap-3 rounded-[14px] border-2 border-border bg-card px-3.5 py-2">`: tile `<span aria-hidden="true" className={cn("island grid size-7 shrink-0 place-items-center rounded-lg border-2 border-border text-[13px] font-extrabold", tone)}>{step}</span>`; text `<span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-muted-foreground">{label}</span><span className={cn("block truncate text-[15px] font-bold tabular-nums", !value && "text-muted-foreground")}>{value || empty}</span></span>`; `<button type="button" aria-label={`Edit ${label}`} onClick={() => onEdit(step)} className="min-h-11 shrink-0 px-2 text-sm font-extrabold text-coral-text underline-offset-2 hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring">Edit</button>`.

- [ ] **Step 3: Wire submit and the cover into the flow** — `components/new-trip/new-trip-flow.tsx`:
- Imports: `createTrip` from `@/server/actions/trips`, `compressImage` from `@/lib/image-compress`, `toast` from `@/components/ui/use-toast`, and `toCreateInput, errorStep, stepErrorsFrom` from the draft module.
- Replace `const [pending] = React.useState(false)` with `const [pending, startTransition] = React.useTransition();`.
- Cover state (not persisted — a File can't go into sessionStorage):

```tsx
  const [cover, setCover] = React.useState<{ file: File; url: string } | null>(null);
  const coverUrlRef = React.useRef<string | null>(null);
  React.useEffect(() => () => { if (coverUrlRef.current) URL.revokeObjectURL(coverUrlRef.current); }, []);
  function onCover(file: File | null) {
    if (coverUrlRef.current) URL.revokeObjectURL(coverUrlRef.current);
    const next = file ? { file, url: URL.createObjectURL(file) } : null;
    coverUrlRef.current = next?.url ?? null;
    setCover(next);
  }
```

- `isDirty(draft, cover != null)` in `requestLeave`.
- `next()`: at step 4, call `submit()`.
- `submit`:

```tsx
  function submit() {
    startTransition(async () => {
      let file: File | null = cover?.file ?? null;
      if (file) {
        try {
          file = await compressImage(file);
        } catch {
          // An image compressImage can't decode goes up as it is.
        }
      }
      const result = await createTrip(toCreateInput(draft, { fromShareToken }), file);
      if (!result.success) {
        setErrors(stepErrorsFrom(result.errors));
        const step = errorStep(result.errors);
        if (step !== draft.step) goTo(step, { keepErrors: true });
        return;
      }
      try {
        window.sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // nothing to forget
      }
      if (firstTrip && !past) toast({ title: `${draft.name.trim()} is ready.`, description: "Add your first stop to start the route." });
      router.push(result.href);
    });
  }
```

- Step 4 element: `<StepCover {...stepProps} cover={cover ? { url: cover.url } : null} onCover={onCover} onEdit={(s) => goTo(s)} />`; pass `coverUrl={cover?.url}` to `TripPreview`.

- [ ] **Step 4: Run the tests**

Run: `npm test -- components/new-trip` — Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add components/new-trip
git commit -m "feat(new-trip): Cover + review step; the flow creates the trip and navigates

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---
### Task 14: Route the flow through a `(focus)` route group; retire the old form

Spec C6: a `(focus)` route group with its own layout, URL unchanged. **Before writing any file, read** `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md` and `…/03-file-conventions/layout.md`. Both groups sit under the one root `app/layout.tsx`, so moving between `/trips` and `/trips/new` stays a client navigation (the "full page load" caveat only applies to multiple *root* layouts), and no two groups may resolve to the same URL.

**Files:**
- Move: `app/(app)/trips/new/{page.tsx,page.test.tsx,error.tsx}` → `app/(focus)/trips/new/` (`git mv`)
- Delete: `app/(app)/trips/new/new-trip-form.tsx`, `app/(app)/trips/new/new-trip-form.test.tsx` (`NEW_TRIP_FORM_GRID_CLASS` goes with it). Also delete `components/trips/cover-dropzone.tsx` and its test if `grep -rn CoverDropzone app components` shows no other user (verified: none besides the old form).
- Create: `app/(focus)/layout.tsx` + `app/(focus)/layout.test.tsx`
- Rewrite: `app/(focus)/trips/new/page.tsx` + `page.test.tsx`
- Modify: `app/route-conventions.test.ts`
- Create: `components/new-trip/style-bans.test.ts`

**Interfaces:**
- Consumes: `auth` (`lib/auth.ts`), `requireUser` (`lib/guards.ts`), `db`, `NewTripFlow` (Tasks 10–13).
- Produces: `/trips/new` renders `NewTripFlow` with no rail, tab bar, top bar, Feedback launcher or `app-main`; `generateMetadata` unchanged ("New trip" / "Log a past trip").

- [ ] **Step 1: Move the route and write the failing tests**

```bash
mkdir -p "app/(focus)/trips"
git mv "app/(app)/trips/new" "app/(focus)/trips/new"
git rm "app/(focus)/trips/new/new-trip-form.tsx" "app/(focus)/trips/new/new-trip-form.test.tsx"
```

`app/(focus)/layout.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { auth, redirect } = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));

import FocusLayout from "./layout";

describe("(focus) layout (spec C6)", () => {
  it("sends a signed-out visitor to /", async () => {
    auth.mockResolvedValue(null);
    await expect(FocusLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });
  it("renders the page with none of the app chrome", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    const { container } = render(await FocusLayout({ children: <p>flow</p> }));
    expect(screen.getByText("flow")).toBeInTheDocument();
    expect(container.querySelector("[data-focus-shell]")).not.toBeNull();
    expect(screen.queryByTestId("app-main")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
```

`app/(focus)/trips/new/page.test.tsx` (replace the moved file):

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const { flowProps, userFind, memberCount } = vi.hoisted(() => ({ flowProps: vi.fn(), userFind: vi.fn(), memberCount: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: userFind }, tripMember: { count: memberCount } } }));
vi.mock("@/components/new-trip/new-trip-flow", () => ({
  NewTripFlow: (p: Record<string, unknown>) => {
    flowProps(p);
    return <div data-testid="flow" />;
  },
}));

import NewTripPage, { generateMetadata } from "./page";

const page = async (sp: Record<string, string> = {}) => render(await NewTripPage({ searchParams: Promise.resolve(sp) }));

describe("/trips/new", () => {
  beforeEach(() => {
    flowProps.mockReset();
    userFind.mockReset().mockResolvedValue({ displayName: "Cameron Williams" });
    memberCount.mockReset().mockResolvedValue(0);
  });

  it("a first trip passes the first word of the display name (spec C7)", async () => {
    await page();
    expect(flowProps).toHaveBeenCalledWith(expect.objectContaining({ past: false, firstTrip: true, displayName: "Cameron" }));
  });
  it("no display name → null, so the eyebrow reads Let's start your first trip.", async () => {
    userFind.mockResolvedValue({ displayName: null });
    await page();
    expect(flowProps).toHaveBeenCalledWith(expect.objectContaining({ displayName: null }));
  });
  it("a Traveller with trips is not on their first", async () => {
    memberCount.mockResolvedValue(3);
    await page();
    expect(flowProps).toHaveBeenCalledWith(expect.objectContaining({ firstTrip: false }));
  });
  it("reads ?past, ?name, ?step and ?fromShare", async () => {
    await page({ past: "1", name: "Bali", step: "2", fromShare: "tok" });
    expect(flowProps).toHaveBeenCalledWith(expect.objectContaining({ past: true, initialName: "Bali", initialStep: 2, fromShareToken: "tok" }));
  });
  it("ignores a junk step", async () => {
    await page({ step: "abc" });
    expect(flowProps.mock.calls[0][0].initialStep).toBeUndefined();
  });
  it("titles the page", async () => {
    expect(await generateMetadata({ searchParams: Promise.resolve({}) })).toEqual({ title: "New trip" });
    expect(await generateMetadata({ searchParams: Promise.resolve({ past: "1" }) })).toEqual({ title: "Log a past trip" });
  });
});
```

`app/route-conventions.test.ts` — add:

```ts
import { existsSync } from "node:fs";

describe("New trip is a focus page (spec C6)", () => {
  it("lives in the (focus) group, outside the app shell", () => {
    expect(existsSync(path.resolve(__dirname, "(app)/trips/new"))).toBe(false);
    expect(existsSync(path.resolve(__dirname, "(focus)/trips/new/page.tsx"))).toBe(true);
  });
  it("(focus) has no loading.tsx or template.tsx (ADR 0063)", () => {
    const FOCUS = path.resolve(__dirname, "(focus)");
    const all = walk(FOCUS).map((f) => path.basename(f));
    expect(all).not.toContain("loading.tsx");
    expect(all).not.toContain("template.tsx");
  });
});
```

`components/new-trip/style-bans.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const newTrip = readdirSync(__dirname)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test(-utils)?\.tsx?$/.test(f))
  .map((f) => path.join("components/new-trip", f));
const FILES = [
  ...newTrip,
  "components/ui/range-calendar.tsx",
  "components/ui/place-combobox.tsx",
  "components/ui/currency-row.tsx",
  "components/trips/trip-card-hero.tsx",
  "app/(focus)/layout.tsx",
  "app/(focus)/trips/new/page.tsx",
];

describe("New trip style bans", () => {
  it.each(FILES)("%s has no soft shadows, faint borders or card tints", (f) => {
    const src = readFileSync(path.join(ROOT, f), "utf8");
    expect(src).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
  it.each(FILES)("%s has no raw hex colours", (f) => {
    const src = readFileSync(path.join(ROOT, f), "utf8");
    expect(src).not.toMatch(/(?<![\w&])#[0-9a-fA-F]{3,8}\b/);
  });
});
```

Run: `npm test -- "app/(focus)" app/route-conventions.test.ts components/new-trip/style-bans.test.ts` — Expected: FAIL (layout missing, page still renders the old form).

- [ ] **Step 2: Implement**

`app/(focus)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Focus shell (spec C6, NEW_TRIP.md §1): signed-in pages with no rail, tab
 * bar or top bar. Shares the root layout with (app), so crossing between
 * them is a client navigation.
 */
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return (
    <div data-focus-shell className="min-h-dvh bg-background">
      {children}
    </div>
  );
}
```

`app/(focus)/trips/new/page.tsx`:

```tsx
import type { Metadata } from "next";
import { requireUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { NewTripFlow } from "@/components/new-trip/new-trip-flow";

type SearchParams = Promise<{ past?: string; name?: string; step?: string; fromShare?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const past = (await searchParams).past === "1";
  return { title: past ? "Log a past trip" : "New trip" };
}

export default async function NewTripPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const past = sp.past === "1";
  const [me, tripCount] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { displayName: true } }),
    db.tripMember.count({ where: { userId: user.id } }),
  ]);
  const displayName = me?.displayName?.trim().split(/\s+/)[0] || null;
  const step = Number(sp.step);

  return (
    <NewTripFlow
      // ?past=1 is the same route: re-key so the draft reducer starts over in the other mode.
      key={past ? "past" : "new"}
      past={past}
      firstTrip={tripCount === 0}
      displayName={displayName}
      initialName={typeof sp.name === "string" ? sp.name : undefined}
      initialStep={Number.isInteger(step) ? step : undefined}
      fromShareToken={typeof sp.fromShare === "string" && sp.fromShare ? sp.fromShare : undefined}
    />
  );
}
```

Keep `error.tsx` as moved (it renders its own panel; check its layout still makes sense without the app shell — add `className="mx-auto max-w-reading px-5 py-16"` to its outer wrapper if it relied on `<main>` padding).

Delete `components/trips/cover-dropzone.tsx` + `cover-dropzone.test.tsx` if unused.

- [ ] **Step 3: Run the tests and a build**

Run: `npm test -- "app/(focus)" app/route-conventions.test.ts components/new-trip components/trips app/page-widths.test.ts` — Expected: PASS.
Run: `npx next build` — Expected: succeeds; the route list shows `/trips/new` once. A "conflicting paths" error means a leftover `app/(app)/trips/new`.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
git add -A "app/(app)/trips/new" "app/(focus)" app/route-conventions.test.ts components/new-trip/style-bans.test.ts components/trips/cover-dropzone.tsx components/trips/cover-dropzone.test.tsx
git commit -m "feat(new-trip): /trips/new renders the focus flow in a (focus) route group

Deletes the old one-page form (and NEW_TRIP_FORM_GRID_CLASS).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 15: Globe `?added=<tripId>` arrival

Implements AUDIT.md §2 "Globe": fly the camera to fit the new pins, pop them in with a 60ms stagger, then toast "Added to your map · {n} places", then remove the param. The Globe shows Markers, not Stops, so the arrival draws the Trip's located real-plan Stops as their own numbered pins (they stay for the visit; they aren't Markers and have no popup).

**Files:**
- Modify: `app/(app)/globe/page.tsx`; Create: `app/(app)/globe/page.test.tsx`
- Modify: `components/globe/types.ts` (`ArrivalPin`, `GlobeArrival`)
- Create: `components/globe/arrival.ts` (constants + toast copy)
- Modify: `components/globe/globe-view.tsx` + `globe-view.test.tsx`
- Modify: `components/globe/globe-map.tsx` + `globe-map.test.tsx`
- Modify: `test/leaflet-mock.ts` (`flyToBounds: vi.fn()` on the fake map)
- Modify: `app/globals.css` (`tp-pin-pop`) + `app/globals.test.ts` or a new `app/globals.new-trip-motion.test.ts`

**Interfaces:**
- Consumes: `db.tripMember.findUnique({ where: { tripId_userId } })`, `REAL_PLAN` (`lib/plan-scope.ts`), `pinHtml`, `pinSize` (`lib/map-pins.ts`), `hueHex` (`lib/map-palette.ts`), `toast`.
- Produces:
  - `interface ArrivalPin { id: string; name: string; lat: number; lng: number }`, `interface GlobeArrival { tripId: string; pins: ArrivalPin[] }`.
  - `components/globe/arrival.ts`: `ARRIVAL_FLY_S = 0.8`, `PIN_STAGGER_MS = 60`, `arrivalToastTitle(n: number): string` ("Added to your map · 2 places" / "· 1 place" / "Added to your map" for 0).
  - `GlobeViewProps.arrival?: GlobeArrival | null`; `GlobeMapProps.arrivalPins?: ArrivalPin[]`.
  - The page passes `arrival` only when the viewer is a member of that Trip.

- [ ] **Step 1: Write the failing tests**

`test/leaflet-mock.ts`: add `flyToBounds: ReturnType<typeof vi.fn>;` to `FakeMap` and `flyToBounds: vi.fn(),` beside `flyTo` in the instance.

`components/globe/globe-map.test.tsx` — add (reusing `hoisted`, `iconHtml` and the file's `beforeEach`; import `setMatchMedia` from `@/test/setup`):

```tsx
describe("GlobeMap arrival (?added=)", () => {
  const PINS = [
    { id: "s1", name: "Kyoto", lat: 35.01, lng: 135.77 },
    { id: "s2", name: "Nara", lat: 34.68, lng: 135.8 },
  ];
  const el = (arrivalPins?: typeof PINS) => (
    <GlobeMap markers={[]} selectedId={null} onSelect={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} onMapClick={vi.fn()} arrivalPins={arrivalPins} />
  );

  it("draws numbered pins that pop in after the fly, 60ms apart, and flies to fit them", async () => {
    render(el(PINS));
    await waitFor(() => expect(hoisted.leaflet!.maps[0].flyToBounds).toHaveBeenCalled());
    const pins = hoisted.leaflet!.markers.filter((m) => m.options.title);
    expect(pins.map((m) => m.options.title)).toEqual(["Kyoto", "Nara"]);
    expect(iconHtml(pins[0])).toMatch(/tp-pin-pop/);
    expect(iconHtml(pins[0])).toMatch(/animation-delay:800ms/);
    expect(iconHtml(pins[1])).toMatch(/animation-delay:860ms/);
    expect(hoisted.leaflet!.maps[0].flyToBounds.mock.calls[0][0]).toEqual([[35.01, 135.77], [34.68, 135.8]]);
    expect(hoisted.leaflet!.maps[0].flyToBounds.mock.calls[0][1]).toMatchObject({ maxZoom: 8, duration: 0.8 });
  });

  it("reduced motion: fits at once with no delay", async () => {
    setMatchMedia((q) => q.includes("prefers-reduced-motion: reduce"));
    render(el(PINS));
    await waitFor(() => expect(hoisted.leaflet!.markers.filter((m) => m.options.title)).toHaveLength(2));
    expect(hoisted.leaflet!.maps[0].flyToBounds).not.toHaveBeenCalled();
    expect(hoisted.leaflet!.maps[0].fitBounds).toHaveBeenLastCalledWith([[35.01, 135.77], [34.68, 135.8]], expect.objectContaining({ maxZoom: 8 }));
    expect(iconHtml(hoisted.leaflet!.markers.filter((m) => m.options.title)[1])).toMatch(/animation-delay:0ms/);
  });

  it("without arrival pins draws nothing extra", async () => {
    render(el());
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.maps[0].flyToBounds).not.toHaveBeenCalled();
    expect(hoisted.leaflet!.markers.filter((m) => m.options.title)).toHaveLength(0);
  });
});
```

`components/globe/globe-view.test.tsx` — add (the file already mocks `toast` and the map loader; import `act` from Testing Library and `toast` from `@/components/ui/use-toast`):

```tsx
describe("GlobeView — arriving from a logged past trip", () => {
  const pin = (id: string, name: string) => ({ id, name, lat: 35, lng: 135 });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/globe?added=t9");
  });
  afterEach(() => vi.useRealTimers());

  it("toasts the located count once the pins land, then drops ?added=", () => {
    render(<GlobeView markers={[]} members={[]} arrival={{ tripId: "t9", pins: [pin("a", "Kyoto"), pin("b", "Nara")] }} />);
    expect(toast).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(toast).toHaveBeenCalledWith({ title: "Added to your map · 2 places" });
    expect(window.location.search).toBe("");
  });
  it("one place reads singular", () => {
    render(<GlobeView markers={[]} members={[]} arrival={{ tripId: "t9", pins: [pin("a", "Kyoto")] }} />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(toast).toHaveBeenCalledWith({ title: "Added to your map · 1 place" });
  });
  it("no arrival, no toast", () => {
    render(<GlobeView markers={[]} members={[]} />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(toast).not.toHaveBeenCalled();
  });
});
```

`app/(app)/globe/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const { viewProps, memberFind, stopFind } = vi.hoisted(() => ({ viewProps: vi.fn(), memberFind: vi.fn(), stopFind: vi.fn() }));
vi.mock("@/lib/globe", () => ({ requireGlobeAccess: vi.fn(async () => ({ user: { id: "u1" }, globe: { id: "g1" } })) }));
vi.mock("@/lib/db", () => ({
  db: {
    marker: { findMany: vi.fn(async () => []) },
    globeMember: { findMany: vi.fn(async () => []) },
    attachment: { findMany: vi.fn(async () => []) },
    tripMember: { findUnique: memberFind },
    stop: { findMany: stopFind },
  },
}));
vi.mock("@/components/globe/globe-view", () => ({
  GlobeView: (p: Record<string, unknown>) => {
    viewProps(p);
    return null;
  },
}));

import GlobePage from "./page";

const page = async (sp: Record<string, string> = {}) => render(await GlobePage({ searchParams: Promise.resolve(sp) }));

describe("/globe", () => {
  beforeEach(() => {
    viewProps.mockReset();
    memberFind.mockReset().mockResolvedValue({ id: "m1" });
    stopFind.mockReset().mockResolvedValue([{ id: "s1", name: "Kyoto", lat: 35.01, lng: 135.77 }]);
  });
  it("without ?added= there is no arrival", async () => {
    await page();
    expect(viewProps).toHaveBeenCalledWith(expect.objectContaining({ arrival: null }));
    expect(stopFind).not.toHaveBeenCalled();
  });
  it("?added= a trip you're on: its located real-plan stops, in order", async () => {
    await page({ added: "t9" });
    expect(memberFind).toHaveBeenCalledWith({ where: { tripId_userId: { tripId: "t9", userId: "u1" } }, select: { id: true } });
    expect(stopFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { tripId: "t9", forkId: null, lat: { not: null }, lng: { not: null } },
      orderBy: { sortOrder: "asc" },
    }));
    expect(viewProps).toHaveBeenCalledWith(expect.objectContaining({ arrival: { tripId: "t9", pins: [{ id: "s1", name: "Kyoto", lat: 35.01, lng: 135.77 }] } }));
  });
  it("?added= a trip you're not on shows nothing", async () => {
    memberFind.mockResolvedValue(null);
    await page({ added: "t9" });
    expect(stopFind).not.toHaveBeenCalled();
    expect(viewProps).toHaveBeenCalledWith(expect.objectContaining({ arrival: null }));
  });
});
```

CSS test (in `app/globals.new-trip-motion.test.ts`, created here and extended in Tasks 16–17):

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const css = readFileSync(join(__dirname, "globals.css"), "utf8");
const reducedDelayReset = () => css.slice(css.indexOf(".tp-card-in, .tp-card-pop-in"), css.indexOf("animation-delay: 0s !important"));

describe("New trip + Globe arrival motion utilities", () => {
  it("defines the Globe pin pop and settles its delay under reduced motion", () => {
    expect(css).toMatch(/@keyframes tp-pin-pop/);
    expect(css).toMatch(/@utility tp-pin-pop \{ animation: tp-pin-pop var\(--dur-slow\) var\(--ease-bounce\) both; \}/);
    expect(reducedDelayReset()).toMatch(/\.tp-pin-pop/);
  });
});
```

Run: `npm test -- components/globe "app/(app)/globe" app/globals.new-trip-motion.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement**

`app/globals.css`, beside the other `@keyframes tp-*`:

```css
@keyframes tp-pin-pop { from { opacity: 0; transform: scale(0.4); } 60% { opacity: 1; transform: scale(1.15); } }
@utility tp-pin-pop { animation: tp-pin-pop var(--dur-slow) var(--ease-bounce) both; }
```

and extend the reduced-motion delay reset (`.tp-card-in, .tp-card-pop-in { animation-delay: 0s !important; }`, ~l.551) to `.tp-card-in, .tp-card-pop-in, .tp-pin-pop { … }` — `!important` there beats the inline `animation-delay` on the pin.

`components/globe/arrival.ts`:

```ts
export const ARRIVAL_FLY_S = 0.8;
export const PIN_STAGGER_MS = 60;

export function arrivalToastTitle(n: number): string {
  if (n <= 0) return "Added to your map";
  return `Added to your map · ${n} ${n === 1 ? "place" : "places"}`;
}
```

`components/globe/types.ts`: add `ArrivalPin` and `GlobeArrival` as in Interfaces.

`app/(app)/globe/page.tsx`: take `{ searchParams }: { searchParams: Promise<{ added?: string }> }`, destructure `user` from `requireGlobeAccess()`, and after the existing `Promise.all`:

```tsx
  const added = (await searchParams).added;
  const arrival = typeof added === "string" && added ? await loadArrival(user.id, added) : null;
```

with (below the page):

```tsx
async function loadArrival(userId: string, tripId: string): Promise<GlobeArrival | null> {
  const member = await db.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } }, select: { id: true } });
  if (!member) return null;
  const stops = await db.stop.findMany({
    where: { tripId, ...REAL_PLAN, lat: { not: null }, lng: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, lat: true, lng: true },
  });
  return { tripId, pins: stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat as number, lng: s.lng as number })) };
}
```

and pass `arrival={arrival}` to `GlobeView`.

`components/globe/globe-view.tsx`: accept `arrival`; pass `arrivalPins={arrival?.pins}` to `GlobeMapLoader`; add

```tsx
  React.useEffect(() => {
    if (!arrival) return;
    const n = arrival.pins.length;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduce || n === 0 ? 0 : ARRIVAL_FLY_S * 1000 + n * PIN_STAGGER_MS + 200;
    const t = window.setTimeout(() => {
      toast({ title: arrivalToastTitle(n) });
      window.history.replaceState(null, "", "/globe");
    }, delay);
    return () => window.clearTimeout(t);
  }, [arrival]);
```

(The timer is set per effect run and cleared on cleanup, so a Strict Mode double-run still toasts exactly once.) Import `useEffect` from react the way the file already imports hooks.

`components/globe/globe-map.tsx`: add `arrivalPins?: ArrivalPin[]` to `GlobeMapProps`; add an effect after the marker effect:

```tsx
  const arrivalDrawnRef = useRef(false);
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !ready || !arrivalPins?.length || arrivalDrawnRef.current) return;
    let cancelled = false;
    import("leaflet").then((leaflet) => {
      if (cancelled || arrivalDrawnRef.current) return;
      arrivalDrawnRef.current = true;
      const L = leaflet.default ?? leaflet;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const size = pinSize("stop");
      arrivalPins.forEach((p, i) => {
        const delay = reduce ? 0 : ARRIVAL_FLY_S * 1000 + i * PIN_STAGGER_MS;
        const html = `<div class="tp-pin-pop" style="animation-delay:${delay}ms">${pinHtml({ variant: "stop", fill: hueHex("coral", isDark), dark: isDark, label: String(i + 1) })}</div>`;
        L.marker([p.lat, p.lng], {
          icon: L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
          title: p.name,
          keyboard: false,
        }).addTo(map);
      });
      const bounds = L.latLngBounds(arrivalPins.map((p) => [p.lat, p.lng] as [number, number]));
      if (reduce) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
      else map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 8, duration: ARRIVAL_FLY_S });
    });
    return () => {
      cancelled = true;
    };
    // isDark is read once: arrival pins are a one-off overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, arrivalPins]);
```

Import `hueHex` from `@/lib/map-palette`, `ARRIVAL_FLY_S`, `PIN_STAGGER_MS` from `./arrival`, `ArrivalPin` from `./types`.

- [ ] **Step 3: Run the tests**

Run: `npm test -- components/globe "app/(app)/globe" app/globals.new-trip-motion.test.ts test` — Expected: PASS.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
git add "app/(app)/globe" components/globe test/leaflet-mock.ts app/globals.css app/globals.new-trip-motion.test.ts
git commit -m "feat(globe): ?added= arrival flies to a logged trip's stops and toasts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 16: Motion, part 1 — entering, moving between steps, pills, mode switch, errors (N1–N4, N9, N12, N14)

MOTION.md "New trip flow" rows N1–N4, N9, N12, N14. Tokens: `--dur-fast` 120ms, `--dur-base` 180ms, `--dur-slow` 320ms, `--dur-exit` 200ms, `--ease-pop`, `--ease-bounce`, `--ease-exit`. JS motion via `motion/react` (already wrapped in `<MotionConfig reducedMotion="user">` by `components/ui/motion-provider.tsx`); under reduced motion slides become an 80ms cross-fade (`useReducedMotion()`).

**Files:**
- Modify: `app/globals.css` + `app/globals.new-trip-motion.test.ts`
- Modify: `components/new-trip/new-trip-flow.tsx`, `flow-top-bar.tsx`, `flow-progress-mobile.tsx`, `step-when.tsx`, `step-name.tsx`
- Test: `components/new-trip/new-trip-flow.test.tsx`, `components/new-trip/step-when.test.tsx`

**Interfaces:**
- Produces: utilities `tp-bar-drop` (top bar from −84px, 320ms pop) and `tp-drop-in` (from `translateY(24px) rotate(-4deg) scale(.96)`, 420ms bounce, 120ms delay — reused by Task 17 on trip home); the step container `motion.div` carries `data-step` and `data-direction="forward" | "back"`.

- [ ] **Step 1: Write the failing tests**

`app/globals.new-trip-motion.test.ts` — add:

```ts
  it("defines the flow's bar drop and card drop-in (MOTION N1)", () => {
    expect(css).toMatch(/@keyframes tp-bar-drop \{ from \{ transform: translateY\(-84px\); \} \}/);
    expect(css).toMatch(/@keyframes tp-drop-in \{ from \{ opacity: 0; transform: translateY\(24px\) rotate\(-4deg\) scale\(0\.96\); \} \}/);
    expect(css).toMatch(/@utility tp-bar-drop \{ animation: tp-bar-drop var\(--dur-slow\) var\(--ease-pop\) both; \}/);
    expect(css).toMatch(/@utility tp-drop-in \{ animation: tp-drop-in 420ms var\(--ease-bounce\) 120ms both; \}/);
    expect(reducedDelayReset()).toMatch(/\.tp-drop-in/);
  });
```

`components/new-trip/new-trip-flow.test.tsx` — add:

```tsx
describe("NewTripFlow — motion hooks (MOTION N1–N4)", () => {
  it("the bar drops in, the question rises, the preview card drops in", async () => {
    const { container } = flow();
    await heading("Where to?");
    expect(container.querySelector("header")?.className).toMatch(/\btp-bar-drop\b/);
    expect(container.querySelector("main > .tp-rise-in")).not.toBeNull();
    expect(screen.getByTestId("trip-preview").className).toMatch(/\btp-drop-in\b/);
  });

  it("forward and back set the slide direction", async () => {
    const { container } = flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    expect(container.querySelector("[data-step='2']")).toHaveAttribute("data-direction", "forward");
    await userEvent.click(screen.getByRole("button", { name: "Step 1: Name, done. Go back" }));
    await heading("Where to?");
    expect(container.querySelector("[data-step='1']")).toHaveAttribute("data-direction", "back");
  });

  it("a done pill's check pops; the phone bar fills by scale", async () => {
    const { container } = flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    const doneDot = within(screen.getByRole("button", { name: "Step 1: Name, done. Go back" })).getByText((_, el) => el?.hasAttribute("data-step-dot") ?? false);
    expect(doneDot.className).toMatch(/\btp-pop\b/);
    const fill = container.querySelector("[data-segment='done'] [data-segment-fill]") as HTMLElement;
    expect(fill.style.transform).toBe("scaleX(1)");
    expect((container.querySelector("[data-segment='upcoming'] [data-segment-fill]") as HTMLElement).style.transform).toBe("scaleX(0)");
  });
});
```

`components/new-trip/step-when.test.tsx` — add:

```tsx
  it("the active mode wears the one shared pill (MOTION N9)", async () => {
    render(<StepHarness Step={StepWhen} />);
    const pills = () => document.querySelectorAll("[data-mode-pill]");
    expect(pills()).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Exact dates" }).contains(pills()[0])).toBe(true);
    await userEvent.click(screen.getByRole("radio", { name: "Roughly" }));
    expect(pills()).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Roughly" }).contains(pills()[0])).toBe(true);
  });
```

Run: `npm test -- components/new-trip app/globals.new-trip-motion.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement**

CSS (`app/globals.css`, beside the other tp keyframes/utilities):

```css
@keyframes tp-bar-drop { from { transform: translateY(-84px); } }
@keyframes tp-drop-in { from { opacity: 0; transform: translateY(24px) rotate(-4deg) scale(0.96); } }
@utility tp-bar-drop { animation: tp-bar-drop var(--dur-slow) var(--ease-pop) both; }
@utility tp-drop-in { animation: tp-drop-in 420ms var(--ease-bounce) 120ms both; }
```

and add `.tp-drop-in` to the reduced-motion delay-reset selector list.

- **N1:** `FlowTopBar`'s `<header>` gets `tp-bar-drop`. In the flow, wrap the `<main>`'s content in `<div className="tp-rise-in flex flex-1 flex-col">` (not keyed, so it plays once on arrival). Pass `className="tp-drop-in"` to `TripPreview`.
- **N2/N3:** in `FlowBody`, replace the ref-free direction with state set in the event handlers (never read a ref during render): `const [dir, setDir] = React.useState<1 | -1>(1);`; in `goTo` call `setDir(step > draft.step ? 1 : -1)` before dispatching; in the popstate handler `setDir(step < draftRef.current.step ? -1 : 1)`. Render:

```tsx
const EASE_POP = [0.2, 0.8, 0.2, 1] as const;
const EASE_EXIT = [0.4, 0, 1, 1] as const;
const SLIDE = {
  enter: (d: 1 | -1) => ({ x: d > 0 ? "100%" : "-100%" }),
  center: { x: 0, transition: { duration: 0.32, ease: EASE_POP } },
  exit: (d: 1 | -1) => ({ x: d > 0 ? "-100%" : "100%", transition: { duration: 0.2, ease: EASE_EXIT } }),
};
const FADE = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.08 } },
  exit: { opacity: 0, transition: { duration: 0.08 } },
};
// …
const reduce = useReducedMotion();
<AnimatePresence mode="wait" initial={false} custom={dir}>
  <motion.div key={draft.step} custom={dir} variants={reduce ? FADE : SLIDE} initial="enter" animate="center" exit="exit" data-step={draft.step} data-direction={dir > 0 ? "forward" : "back"} className="flex flex-1 flex-col">
    {stepEl}
  </motion.div>
</AnimatePresence>
```

  The preview column does not move — only its contents change.
- **N4:** `FlowTopBar` done dot adds `tp-pop` (the class lands when the step completes, so the check pops once); current pill adds `transition-[background-color,box-shadow] duration-[var(--dur-base)]`. `FlowProgressMobile` segments become `<span data-segment={…} className={cn("relative h-2 overflow-hidden rounded-full", n === step ? "border-[1.5px] border-border bg-coral" : "bg-muted")}><span data-segment-fill aria-hidden="true" className="absolute inset-0 origin-left rounded-full bg-foreground transition-transform duration-[var(--dur-slow)] ease-pop" style={{ transform: `scaleX(${n < step ? 1 : 0})` }} /></span>`.
- **N9:** in `StepWhen`, give each `SegmentedItem` `data-[state=on]:bg-transparent data-[state=on]:text-primary-foreground` in its className, wrap its label in `<span className="relative z-10">…</span>`, and render inside the active item only `<motion.span data-mode-pill layoutId="date-mode" aria-hidden="true" className="absolute inset-0 rounded-full bg-primary" transition={{ duration: 0.18, ease: EASE_POP }} />`. Wrap the panel below in `<AnimatePresence mode="wait" initial={false}><motion.div key={exact ? "exact" : draft.dateMode} layout initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.18 } }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ layout: { duration: 0.32, ease: EASE_POP } }}>…</motion.div></AnimatePresence>`.
- **N12:** `StepName`'s helper line cross-fades between help and error: `<AnimatePresence mode="wait" initial={false}><motion.p key={error ? "error" : "help"} id={helpId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} …>`. The wiggle (re-keyed by `attempt`) and focus-return are already in place from Task 10.
- **N14:** `DialogContent` already pops in with `tp-pop-in` from `sm` up (`components/ui/dialog.tsx`); "Leave" navigates with `router.push("/trips")`. Section changes are a hard cut (ADR 0065), so no extra cross-fade is added — note this in the commit body.

- [ ] **Step 3: Run the tests**

Run: `npm test -- components/new-trip app/globals.new-trip-motion.test.ts` — Expected: PASS (every earlier flow test awaits headings with `findByRole`, so the exit animation doesn't break them).

- [ ] **Step 4: Typecheck, lint, commit**

```bash
git add app/globals.css app/globals.new-trip-motion.test.ts components/new-trip
git commit -m "feat(new-trip): flow motion — enter, step slides, pills, mode pill, error fade

N14's Leave is a hard cut (ADR 0065); the dialog's own pop-in stays.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 17: Motion, part 2 — the preview, calendar, places, photo and create (N5–N8, N10, N11, N13)

MOTION.md rows N5–N8, N10, N11 and N13 **without** the View Transitions morph (spec C5): pop-and-lift, navigate, trip-home countdown-tile drop-in, toast.

**Files:**
- Modify: `app/globals.css` + `app/globals.new-trip-motion.test.ts`
- Create: `components/new-trip/use-debounced-value.ts` + `use-debounced-value.test.tsx`
- Create: `lib/new-trip/arrival.ts` + `lib/new-trip/arrival.test.ts`
- Create: `components/trip/home/desktop/arrival-drop-in.tsx` + `arrival-drop-in.test.tsx`
- Modify: `components/new-trip/preview-model.ts` (+test), `trip-preview.tsx` (+test), `new-trip-flow.tsx` (+test), `step-when.tsx`, `step-cover.tsx`
- Modify: `components/trips/trip-card.tsx` (`BigNumberBlock` `valueNode`)
- Modify: `components/ui/range-calendar.tsx` (+test), `components/ui/place-combobox.tsx` (+test), `components/ui/currency-row.tsx`
- Modify: `app/(app)/trips/[tripId]/page.tsx` (wrap the desktop `CountdownTile` in `ArrivalDropIn`)

**Interfaces:**
- Produces: `useDebouncedValue<T>(value: T, ms: number): T`; `ARRIVAL_KEY = "teepee:trip-arrival"`, `markArrival(tripId)`, `takeArrival(tripId): boolean`; `ArrivalDropIn({ tripId, className?, children })`; `PreviewInput.stampName?: string` (the debounced name the stamp word is read from); `TripPreview` prop `thunkKey?: number`; `BigNumberBlock` prop `valueNode?: React.ReactNode`; utilities `tp-stamp-thunk`, `tp-band-fill`.

- [ ] **Step 1: Write the failing tests**

`app/globals.new-trip-motion.test.ts` — add:

```ts
  it("defines the stamp thunk and the range band fill (MOTION N6, N8)", () => {
    expect(css).toMatch(/@keyframes tp-stamp-thunk/);
    expect(css).toMatch(/@utility tp-stamp-thunk \{ animation: tp-stamp-thunk 360ms var\(--ease-bounce\) both; \}/);
    expect(css).toMatch(/@keyframes tp-band-fill \{ from \{ transform: scaleX\(0\); \} \}/);
    expect(css).toMatch(/@utility tp-band-fill \{ animation: tp-band-fill var\(--dur-base\) var\(--ease-pop\) both; \}/);
    expect(reducedDelayReset()).toMatch(/\.tp-band-fill/);
  });
```

`lib/new-trip/arrival.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { ARRIVAL_KEY, markArrival, takeArrival } from "./arrival";

describe("trip-home arrival flag", () => {
  beforeEach(() => sessionStorage.clear());
  it("is taken once, by the trip it was marked for", () => {
    markArrival("t1");
    expect(takeArrival("t2")).toBe(false);
    expect(takeArrival("t1")).toBe(true);
    expect(sessionStorage.getItem(ARRIVAL_KEY)).toBeNull();
    expect(takeArrival("t1")).toBe(false);
  });
});
```

`components/trip/home/desktop/arrival-drop-in.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { markArrival } from "@/lib/new-trip/arrival";
import { ArrivalDropIn } from "./arrival-drop-in";

describe("ArrivalDropIn (MOTION N13 step 3)", () => {
  beforeEach(() => sessionStorage.clear());
  it("drops the countdown tile in when arriving from New trip", () => {
    markArrival("t1");
    render(<ArrivalDropIn tripId="t1" className="h-full"><p>tile</p></ArrivalDropIn>);
    expect(screen.getByText("tile").parentElement!.className).toMatch(/\btp-drop-in\b/);
    expect(screen.getByText("tile").parentElement!.className).toMatch(/\bh-full\b/);
  });
  it("does nothing on an ordinary visit", () => {
    render(<ArrivalDropIn tripId="t1"><p>tile</p></ArrivalDropIn>);
    expect(screen.getByText("tile").parentElement!.className).not.toMatch(/tp-drop-in/);
  });
});
```

`components/new-trip/use-debounced-value.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  it("settles after the pause", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 250), { initialProps: { v: "J" } });
    rerender({ v: "Japan" });
    expect(result.current).toBe("J");
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current).toBe("Japan");
    vi.useRealTimers();
  });
});
```

`components/new-trip/preview-model.test.ts` — add:

```ts
  it("reads the stamp word from the debounced name when given (MOTION N5)", () => {
    expect(previewModel({ ...base, name: "Japan at Christmas", stampName: "Jap" }).stamp.place).toBe("JAP");
  });
```

`components/new-trip/trip-preview.test.tsx` — add:

```tsx
  it("a thunk key plays the stamp press and the polaroid wiggle (MOTION N6)", () => {
    const { container } = render(<TripPreview {...base} startDate="2026-12-04" endDate="2027-01-08" thunkKey={1} />);
    expect(container.querySelector(".tp-stamp-thunk")).not.toBeNull();
    expect(container.querySelector("[data-polaroid].tp-wiggle, .tp-wiggle [data-polaroid]")).not.toBeNull();
  });
  it("without a thunk key, no press", () => {
    const { container } = render(<TripPreview {...base} />);
    expect(container.querySelector(".tp-stamp-thunk")).toBeNull();
  });
```

`components/ui/range-calendar.test.tsx` — add:

```tsx
  it("finishing a range fills the band day by day, 12ms apart, and pops the end (MOTION N8)", async () => {
    render(<Harness disableBefore="2026-10-01" />);
    await userEvent.click(day("Thu 15 Oct 2026"));
    expect(day("Thu 15 Oct 2026").querySelector(".tp-pop")).not.toBeNull();
    await userEvent.click(day("Tue 20 Oct 2026"));
    const band = day("Sat 17 Oct 2026").querySelector(".tp-band-fill") as HTMLElement;
    expect(band.style.animationDelay).toBe("24ms");
    expect(day("Tue 20 Oct 2026").querySelector(".tp-pop")).not.toBeNull();
  });
  it("caps the stagger at 240ms", async () => {
    render(<Harness months={2} disableBefore="2026-10-01" />);
    await userEvent.click(day("Thu 1 Oct 2026"));
    await userEvent.click(day("Sat 31 Oct 2026"));
    expect((day("Fri 30 Oct 2026").querySelector(".tp-band-fill") as HTMLElement).style.animationDelay).toBe("240ms");
  });
```

`components/ui/place-combobox.test.tsx` — add:

```tsx
  it("the highlight is one shared element that follows the keys (MOTION N10)", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Syd");
    const options = await screen.findAllByRole("option");
    expect(document.querySelectorAll("[data-place-hl]")).toHaveLength(1);
    expect(options[0].querySelector("[data-place-hl]")).not.toBeNull();
    await userEvent.keyboard("{ArrowDown}");
    expect(options[1].querySelector("[data-place-hl]")).not.toBeNull();
  });
```

`components/new-trip/new-trip-flow.test.tsx` — add:

```tsx
describe("NewTripFlow — create motion (MOTION N13, spec C5)", () => {
  it("marks trip home for the countdown drop-in, then navigates", async () => {
    flow();
    await toCover();
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/trips/kyoto"));
    expect(sessionStorage.getItem("teepee:trip-arrival")).toBe("t1");
  });
  it("a past trip bound for the Globe is not marked", async () => {
    createTrip.mockResolvedValue({ success: true, tripId: "t9", href: "/globe?added=t9" });
    flow();
    await toCover();
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/globe?added=t9"));
    expect(sessionStorage.getItem("teepee:trip-arrival")).toBeNull();
  });
  it("the first date set presses the stamp once per draft (MOTION N6)", async () => {
    const { container } = flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    await userEvent.click(screen.getByRole("button", { name: "Thu 15 Oct 2026" }));
    expect(container.querySelector("[data-testid='trip-preview'] .tp-stamp-thunk")).not.toBeNull();
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!).stamped).toBe(true);
  });
});
```

Run: `npm test -- components/new-trip components/ui lib/new-trip components/trip/home/desktop app/globals.new-trip-motion.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement**

CSS:

```css
/* Relative to the stamp's own -14°: reads as -22° → -12° → -14° (MOTION N6). */
@keyframes tp-stamp-thunk { 0% { transform: scale(1.35) rotate(-8deg); opacity: 0.4; } 60% { transform: scale(0.92) rotate(2deg); opacity: 1; } 100% { transform: none; opacity: 1; } }
@keyframes tp-band-fill { from { transform: scaleX(0); } }
@utility tp-stamp-thunk { animation: tp-stamp-thunk 360ms var(--ease-bounce) both; }
@utility tp-band-fill { animation: tp-band-fill var(--dur-base) var(--ease-pop) both; }
```

and add `.tp-band-fill` to the reduced-motion delay reset.

`components/new-trip/use-debounced-value.ts`:

```ts
import * as React from "react";

export function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
```

`lib/new-trip/arrival.ts`:

```ts
/** Set by New trip right before it navigates to trip home; read once there (MOTION N13). */
export const ARRIVAL_KEY = "teepee:trip-arrival";

export function markArrival(tripId: string): void {
  try {
    sessionStorage.setItem(ARRIVAL_KEY, tripId);
  } catch {
    // No storage: trip home just skips the drop-in.
  }
}

export function takeArrival(tripId: string): boolean {
  try {
    if (sessionStorage.getItem(ARRIVAL_KEY) !== tripId) return false;
    sessionStorage.removeItem(ARRIVAL_KEY);
    return true;
  } catch {
    return false;
  }
}
```

`components/trip/home/desktop/arrival-drop-in.tsx`:

```tsx
"use client";

import * as React from "react";
import { takeArrival } from "@/lib/new-trip/arrival";

/** Drops the countdown tile in on the first visit after New trip (MOTION N13; no View Transitions morph — spec C5). */
export function ArrivalDropIn({ tripId, className, children }: { tripId: string; className?: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (takeArrival(tripId)) ref.current?.classList.add("tp-drop-in");
  }, [tripId]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
```

In `app/(app)/trips/[tripId]/page.tsx` `renderDesktopHome`, wrap the `CountdownTile` passed as `countdown` in `<ArrivalDropIn tripId={tripId} className="h-full">…</ArrivalDropIn>`.

Preview (N5–N7, N11):
- `PreviewInput.stampName?: string`; `previewModel` uses `stampWord(i.stampName ?? i.name)`.
- `TripPreview` gains `thunkKey?: number`. Wrap the stamp in two layers: outer `<div key={`thunk-${thunkKey ?? 0}`} className={cn("size-full", thunkKey ? "tp-stamp-thunk" : undefined)}>`, inner `<div key={m.stamp.place} className="size-full tp-pop">` (the stamp pops when the word changes; the press plays once, when `thunkKey` first becomes 1). Give the `Polaroid` `className={thunkKey ? "tp-wiggle" : undefined}` inside a wrapper keyed by `thunkKey` so the wiggle replays with the press.
- Title: when `m.placeholder` flips, cross-fade: `<AnimatePresence mode="wait" initial={false}><motion.span key={m.placeholder ? "ph" : "name"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className={cn(m.placeholder && "text-foreground/40")}>{m.title}</motion.span></AnimatePresence>` (no per-character animation).
- Bottom: `<AnimatePresence mode="wait" initial={false}>` keyed by `m.bottom.kind`, exit `opacity: 0` over 0.12s (the skeleton fades out). For `big`, pass `valueNode={<CountUp value={Number(big.value)} />}` to `BigNumberBlock` and add `tp-fade-in [animation-delay:700ms] [animation-fill-mode:backwards]` to its `unitClass` (the "sleeps to go" label fades in 100ms after the 600ms count). `CountUp` (local, `"use client"` file scope): `const [first] = React.useState(value); return <AnimatedNumber value={value} format={(n) => String(Math.round(n))} durationSec={value === first ? 0.6 : 0.32} className="tabular-nums" />` (`components/ui/animated-number.tsx`; it already renders the final value under reduced motion). `BigNumberBlock` renders `{valueNode ?? big.value}` inside its number span.
- Photo swap: wrap `Cover` in `<AnimatePresence mode="wait" initial={false}><motion.div key={coverUrl ?? "stamp"} className="size-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>…</motion.div></AnimatePresence>`.
- Since `trip-preview.tsx` now uses `motion` and state, add `"use client"` at its top.

Flow (N6, N13):
- `const stampName = useDebouncedValue(draft.name, 250);` → `TripPreview stampName={stampName}`.
- Wrap `dispatch` for the steps:

```tsx
  const [thunkKey, setThunkKey] = React.useState(0);
  const act = React.useCallback((a: DraftAction) => {
    const firstDate = (a.type === "set-range" && a.start) || (a.type === "set-rough-month" && a.ym);
    if (firstDate && !draftRef.current.stamped) {
      setThunkKey((k) => k + 1);
      dispatch({ type: "stamped" });
    }
    dispatch(a);
  }, []);
```

  Pass `dispatch: act` in `stepProps` and `thunkKey={thunkKey}` to `TripPreview`. Update `draftRef.current` synchronously too (`draftRef.current = draft` at the top of the render is a ref write during render — instead keep it in the effect and also set `draftRef.current = { ...draftRef.current, stamped: true }` inside `act`), so a second date click in the same frame can't press twice.
- Pop-and-lift: `const [liftScope, animateLift] = useAnimate(); const reduce = useReducedMotion();` Wrap `TripPreview` in `<div ref={liftScope} className="group/lift">` and give the hero article `md:group-data-[lifted]/lift:shadow-hard-5` (via `TripPreview`'s `TripCardHeroView className`). Then:

```tsx
  async function lift() {
    const el = liftScope.current as HTMLElement | null;
    if (reduce || !el) return;
    el.dataset.lifted = "";
    await animateLift(el, { scale: 1.04, y: -6 }, { duration: 0.24, ease: [0.34, 1.56, 0.64, 1] });
  }
```

  In `submit`, after clearing the draft: `await lift(); if (!result.href.startsWith("/globe")) markArrival(result.tripId);` then the toast and `router.push(result.href)`. Buttons and pills stay disabled throughout (still inside the transition).

Calendar (N8) — `components/ui/range-calendar.tsx`:
- State `const [fill, setFill] = React.useState<{ key: number; start: string } | null>(null)` and `const [pop, setPop] = React.useState<{ key: number; day: string } | null>(null)`.
- In `pick(day)`: compute `const next = nextRange(range, day)`; `setPop((p) => ({ key: (p?.key ?? 0) + 1, day }))`; `if (next.end && next.end !== next.start) setFill((f) => ({ key: (f?.key ?? 0) + 1, start: next.start! }))`, else `setFill(null)`.
- Band span for `state === "in"` when `fill`: `key={`band-${fill.key}`}`, extra classes `tp-band-fill origin-left`, `style={{ animationDelay: `${Math.min(daysBetween(fill.start, d) * 12, 240)}ms` }}` (`daysBetween` from `lib/dates.ts`).
- Endpoint span: when `pop?.day === d`, `key={`pop-${pop.key}`}` and add `tp-pop`.
- The hover preview at `bg-range/60` is already there (Task 6).

Places and currency (N10) — `PlaceCombobox`: the listbox becomes `<motion.ul initial={{ height: 0 }} animate={{ height: "auto" }} transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }} className="overflow-hidden border-t-2 border-border" …>`; drop the static `bg-sun/25` from the active `li`, and render inside the active option `<motion.span data-place-hl layoutId={`place-hl-${listId}`} aria-hidden="true" className="absolute inset-0 bg-sun/25" transition={{ duration: 0.18 }} />` with the option's content in `relative` spans. `CurrencyRow`: wrap code + name in `<div key={value} className="flex min-w-0 items-center gap-3 tp-pop">` and cross-fade the code: `<AnimatePresence mode="popLayout" initial={false}><motion.span key={value} data-currency-code initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} …>{value}</motion.span></AnimatePresence>`.

Photo (N11) — `StepCover`'s `PolaroidDropzone`: add `transition-transform` with `duration-[var(--dur-base)] ease-pop` while `dragging` and `duration-[var(--dur-slow)] ease-bounce` otherwise (so it settles back to −3° with bounce); the preview `<img>` gets `tp-fade-in`.

Strip (N7, phones) — `StepWhen`: wrap `CountdownStrip` in `<AnimatePresence initial={false}>{complete && !draft.past ? <motion.div key="strip" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }} className="overflow-hidden md:hidden">…</motion.div> : null}</AnimatePresence>`.

- [ ] **Step 3: Run the tests**

Run: `npm test -- components/new-trip components/ui components/trips components/trip/home lib/new-trip "app/(app)/trips/[tripId]" app/globals.new-trip-motion.test.ts` — Expected: PASS.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
git add app/globals.css app/globals.new-trip-motion.test.ts components/new-trip lib/new-trip components/trip/home/desktop/arrival-drop-in.tsx components/trip/home/desktop/arrival-drop-in.test.tsx components/trips/trip-card.tsx components/ui/range-calendar.tsx components/ui/range-calendar.test.tsx components/ui/place-combobox.tsx components/ui/place-combobox.test.tsx components/ui/currency-row.tsx "app/(app)/trips/[tripId]/page.tsx"
git commit -m "feat(new-trip): preview, calendar, places, photo and create motion

Pop-and-lift, then trip home drops its countdown tile in; no View
Transitions morph (spec C5).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 18: Phase gate

**Files:** none new.

- [ ] **Step 1: Full test suite**

Run: `npm test` — Expected: every file passes. Fix any test that still imports `startFirstTrip`, `NewTripForm`, `NEW_TRIP_FORM_GRID_CLASS`, `CoverDropzone` or expects `createTrip` to throw `NEXT_REDIRECT` (`grep -rn "startFirstTrip\|NewTripForm\|NEW_TRIP_FORM_GRID_CLASS\|CoverDropzone" app components lib server`).

- [ ] **Step 2: Types and lint**

Run: `npx tsc --noEmit && npm run lint` — Expected: clean.

- [ ] **Step 3: Production build**

Run: `npx next build` — Expected: succeeds; `/trips/new` and `/globe` in the route list; no "conflicting paths".

- [ ] **Step 4: Smoke (only if a local DB is up — Global Constraints)**

`npx prisma migrate deploy` against local Postgres, `npx next dev -p 3100`, sign in with the dev login, then at 1440×900 and 390 wide: Trips → "Where to first?" → lands on step 2 with the name done; Esc asks "Leave without saving?"; a range shows "67 sleeps"-style countdown on the preview; Roughly → the Trips card reads "Sometime in April" after create; a past trip with two stops lands on `/globe` with the pins and the toast, and the URL loses `?added=`. Skip this step (and say so in the tag message) if no local DB.

- [ ] **Step 5: Tag**

```bash
git tag -a phase-2-new-trip -m "Phase 2: New trip focus flow, Trip.roughMonth, Globe ?added= arrival

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

Do not push the tag or the branch.
