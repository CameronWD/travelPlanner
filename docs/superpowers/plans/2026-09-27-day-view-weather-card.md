# Day view, Weather card and shell fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the redesigned Day view and its Weather card from the 2026-09-27 design handoff, fix the sidebar search panel, and split "Days" (Day view) from a new "Calendar" nav row.

**Architecture:** A pure theme module (`lib/weather/theme.ts`) turns the extended Open-Meteo reading into a theme key, condition label and one chip; a Server Component `WeatherCard` renders one fixed layout with a CSS-only scene per theme. The Day view page is rebuilt on a new `getDay` loader plus small pure helpers (`lib/day-view-model.ts`), with client islands only for the day strip, keyboard/swipe navigation, journal editing and the Item dialog. Navigation changes live in `components/trip/trip-nav.tsx`, the single source both the Dock and the sidebar read.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before touching routes), React Server Components, Tailwind v4 tokens in `app/globals.css`, Radix/shadcn primitives in `components/ui/`, lucide-react, Prisma, Vitest 4 + Testing Library (jsdom), `TZ=UTC npm test`.

**Spec:** `docs/specs/2026-09-27-day-view-weather-card.md` (decisions and name mapping) and `design_handoff/home-day-design-279-handoff/` (`DAY_VIEW.md`, `WEATHER_CARD.md`, `images/`) for chrome and copy. Where they disagree, the spec wins.

## Global Constraints

- **Branch:** all work on `feat/day-view-weather-card-2026-09-27`. Never commit to `main` or `beta`; never deploy.
- **No raw hex in components.** Colours come from tokens in `app/globals.css`; new `--wx-*` tokens are added there as HSL triplets (`H S% L%`) and exposed under `@theme` as `--color-wx-*` (so `bg-wx-sunny` works). Dark mode uses the **same values** for `--wx-*`.
- **Name mapping (handoff → repo):** `--surface-page`→`bg-background`; `--surface-canvas`→`bg-canvas`; `--outline`→`border-border`; `--outline-soft`/`--status-neutral`→`border-border-soft`; `--accent-primary`→`bg-coral`; `--accent-money`→`bg-sun`; `--on-accent-text`→`text-on-accent` (via the `island` utility); `--text-muted`→`text-muted-foreground`; `5px 5px 0`→`shadow-hard-3`; `4px 4px 0`→`shadow-hard-2`; `3px 3px 0`→`shadow-hard-1`; coral CTA shadow→`shadow-cta`; `formatDay()`→`formatDayLabel()` from `@/lib/dates`.
- **Fonts:** headings and big numbers `font-display font-extrabold` (Bricolage Grotesque 800); everything else the default sans (Plus Jakarta Sans).
- **Dates:** never show an ISO date to a person. `formatDayLabel("2026-12-12")` → `"Sat 12 Dec"`.
- **Copy:** "+ Add a stop" (never "Add a place"); "a place, an activity, a note"; future journal: "Come back on {Sat 12 Dec} to jot down a memory."
- **Nav:** no "Today" row. Sidebar order: Home, Plan, Days, Calendar, Money, Wishlist, More. Phone tab bar unchanged (Home, Plan, Days, Money, More); Calendar in the More sheet.
- **Route:** the Day view stays at `/trips/[tripId]/day/[date]`; `/trips/[tripId]/day` redirects to the default date.
- **Daylight** comes from `lib/daylight.ts` (offline NOAA), never from the API (ADR 0015). "Weather by Open-Meteo" attribution must appear on the Day view.
- **Accessibility:** one `h1` per page; 44px touch targets on phone; the global focus ring; `prefers-reduced-motion` respected (`motion-reduce:animate-none`); text on coloured fills is ink (`island`), paper only on the night card.
- **Tests:** behaviour assertions, no `toMatchSnapshot`. Run `TZ=UTC npx vitest run <file>` per task and `npm test` before the final task. Commit after every task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Server Components by default.** `"use client"` only on: `SearchField`, `DayStrip`, `DayKeyboardNav`, `DaySwipe`, `DayIdeasRows`, `JournalEditor`, the Item dialog.
- **Subagents must not run `npm run feedback:pull` or `feedback:resolve`.**

## Review Focus

1. **Trip spanning a year boundary** (4 Dec 2026 – 8 Jan 2027): the h1 for 2 Jan must read "Sat 2 Jan 2027", 12 Dec must read "Sat 12 Dec" — pinned in Task 7's `dayHeading` tests.
2. **A day with no Stop** (a gap day between Stops, or the date-less edge): eyebrow falls back to "DAY N OF M", the sub line is empty, the weather card is absent, Day ideas are absent — pinned in Task 7 (`dayEyebrow`/`daySubLine` with `stop: null`) and Task 10 page test "gap day".
3. **Changeover day** (ADR 0049, one date owned by two Stops): the departing Stop's check-out and the arriving Stop's "Night 1 of N" must both show; the sub line names the arriving Stop — pinned in Task 7 `nightOfStay` tests and Task 10 "travel day".
4. **Open-Meteo returns a partial payload** (missing `precipitation_probability_max` or `uv_index_max` arrays): the reading must still parse with those fields `null` and the chip must be omitted rather than reading "Rain undefined%" — pinned in Task 3 and Task 4.
5. **Polar day / polar night** (`sunriseUTC` null): the daylight bar shows a full or empty segment and the label reads "Daylight all day" / "Polar night" without NaN widths — pinned in Task 6.

---

### Task 1: Sidebar search results panel — opaque and floating over the page

**Files:**
- Modify: `components/shell/search-field.tsx`
- Test: `components/shell/search-field.test.tsx` (existing; add a `describe("results panel placement")`)

**Interfaces:**
- Consumes: `CommandResults`, `useCommandResults`, `useRunCommand` from `@/components/command-palette-results` (unchanged).
- Produces: nothing new. The panel now renders through `createPortal` into `document.body` with `data-search-panel`.

Why: the sidebar's `island` utility (`app/globals.css`, `@utility island`) redefines `--card` at 38% alpha, so `bg-card` inside it is see-through; and the panel is `absolute` inside the scrolling `<aside>`, so it sits over the trip switcher and nav. Portal it to the body, position it fixed to the right of the sidebar at the field's top, opaque.

- [ ] **Step 1: Write the failing test**

Append to `components/shell/search-field.test.tsx` (reuse that file's existing render helper and mocks; if it renders `<SearchField tripId="t1" />` inside a wrapper, keep doing so):

```tsx
describe("results panel placement (spec decision 2)", () => {
  it("renders the open panel in document.body, fixed and opaque, not inside the field's own tree", async () => {
    const { container } = renderField(); // the file's existing helper
    const input = screen.getByRole("combobox", { name: "Search or jump" });
    fireEvent.focus(input);
    const panel = document.querySelector("[data-search-panel]") as HTMLElement;
    expect(panel).toBeTruthy();
    expect(container.contains(panel)).toBe(false);
    const cls = panel.className.split(/\s+/);
    expect(cls).toContain("fixed");
    expect(cls).toContain("bg-popover");
    expect(cls).not.toContain("bg-card");
    // aria-controls still points at the listbox inside the portal
    expect(document.getElementById(input.getAttribute("aria-controls")!)).toBeTruthy();
  });

  it("closes the panel when focus leaves the field", () => {
    renderField();
    const input = screen.getByRole("combobox", { name: "Search or jump" });
    fireEvent.focus(input);
    expect(document.querySelector("[data-search-panel]")).toBeTruthy();
    fireEvent.blur(input, { relatedTarget: document.body });
    expect(document.querySelector("[data-search-panel]")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `TZ=UTC npx vitest run components/shell/search-field.test.tsx`
Expected: the two new tests FAIL (`container.contains(panel)` is true; class list lacks `fixed`).

- [ ] **Step 3: Implement the portal**

In `components/shell/search-field.tsx`:

```tsx
import { createPortal } from "react-dom";
```

Add state and a layout effect that measures the field when the panel opens:

```tsx
const [anchor, setAnchor] = React.useState<{ top: number; left: number } | null>(null);

React.useLayoutEffect(() => {
  if (!open) return;
  function measure() {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    // Flyout to the right of the sidebar, level with the field: the sidebar
    // is 248px wide with 16px side padding, so the field's right edge + 16px
    // + 12px gap clears the sidebar's 2px border.
    setAnchor({ top: r.top, left: r.right + 28 });
  }
  measure();
  window.addEventListener("resize", measure);
  return () => window.removeEventListener("resize", measure);
}, [open]);
```

Replace the `{open && (<div className="absolute ...">…</div>)}` block with:

```tsx
{open &&
  typeof document !== "undefined" &&
  createPortal(
    <div
      data-search-panel
      role="presentation"
      style={anchor ? { top: anchor.top, left: anchor.left } : undefined}
      className="fixed z-50 w-[400px] max-w-[calc(100vw-280px)] rounded-xl border-2 border-border bg-popover p-2 text-popover-foreground shadow-hard-2"
      // Presses inside the panel (headings, notices) keep the caret.
      onMouseDown={(e) => e.preventDefault()}
    >
      <CommandResults
        id={listboxId}
        groups={groups}
        activeIndex={active}
        focusableOptions={false}
        onSelect={run}
        className="flex max-h-[min(60vh,28rem)] flex-col gap-1 overflow-y-auto"
      />
    </div>,
    document.body,
  )}
```

Keep the existing `onBlur` on the root: React synthetic blur still fires there, and `relatedTarget` outside the root closes the panel (the panel is not focusable, so a click on an option keeps focus in the input via the `onMouseDown` preventDefault).

- [ ] **Step 4: Run the tests**

Run: `TZ=UTC npx vitest run components/shell/search-field.test.tsx components/shell/sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/shell/search-field.tsx components/shell/search-field.test.tsx
git commit -m "fix(shell): search results panel is opaque and floats beside the sidebar

The sidebar's island utility makes --card translucent, so the panel was
see-through and sat over the switcher and nav rows. It now portals to the
body, fixed to the right of the sidebar, on bg-popover.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Navigation — Days opens the Day view, Calendar gets its own row

**Files:**
- Create: `lib/day-view-default.ts`, `lib/day-view-default.test.ts`
- Create: `app/(app)/trips/[tripId]/day/page.tsx`
- Modify: `components/trip/trip-nav.tsx` (primaryNav, TripRailItem, tripRailItems, isDaysActive)
- Modify: `components/trip/mobile-tab-bar.tsx` (sheet items)
- Modify: `app/(app)/trips/[tripId]/more/page.tsx` (add the Calendar row)
- Modify tests: `components/shell/sidebar.test.tsx`, `components/trip/trip-nav.test.tsx` (if present), `components/trip/mobile-tab-bar.test.tsx` (if present), `lib/help-guide.test.ts` / `lib/help-guide.ts` (only if its label guard fails)

**Interfaces:**
- Produces: `defaultDayISO({ startDate, endDate, today }): string | null` in `lib/day-view-default.ts`. `primaryNav` now returns Home, Plan, Days (`/day`), Calendar (`/calendar`), Money, Summary. `tripRailItems` returns seven items with `label` union widened to include `"Calendar"`.

- [ ] **Step 1: Failing tests for the default day**

`lib/day-view-default.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { defaultDayISO } from "@/lib/day-view-default";

describe("defaultDayISO (spec decision 3)", () => {
  const trip = { startDate: "2026-12-04", endDate: "2027-01-08" };
  it("is today while travelling", () => {
    expect(defaultDayISO({ ...trip, today: "2026-12-12" })).toBe("2026-12-12");
  });
  it("is the first day before the trip", () => {
    expect(defaultDayISO({ ...trip, today: "2026-09-27" })).toBe("2026-12-04");
  });
  it("is the first day after the trip", () => {
    expect(defaultDayISO({ ...trip, today: "2027-02-01" })).toBe("2026-12-04");
  });
  it("is null for a date-less trip", () => {
    expect(defaultDayISO({ startDate: null, endDate: null, today: "2026-12-12" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `TZ=UTC npx vitest run lib/day-view-default.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

`lib/day-view-default.ts`:

```ts
/**
 * Which day "Days" opens when no date was picked (spec 2026-09-27 decision 3):
 * today (in the trip's zone) while the Trip is underway, otherwise the first
 * day. A date-less Trip has no days at all → null (the caller sends the
 * Traveller to the Plan instead).
 */
export function defaultDayISO(input: {
  startDate: string | null;
  endDate: string | null;
  today: string;
}): string | null {
  const { startDate, endDate, today } = input;
  if (!startDate || !endDate) return null;
  if (today >= startDate && today <= endDate) return today;
  return startDate;
}
```

`app/(app)/trips/[tripId]/day/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { requireTripAccess } from "@/lib/guards";
import { tripTodayISO } from "@/lib/trip-today";
import { defaultDayISO } from "@/lib/day-view-default";

/** /trips/:id/day → the default day (spec decision 3); date-less → Plan. */
export default async function DayIndexPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  await requireTripAccess(tripId);
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      startDate: true,
      endDate: true,
      stops: {
        where: { ...REAL_PLAN, arriveDate: { not: null } },
        orderBy: { sortOrder: "asc" },
        select: { id: true, sortOrder: true, timezone: true, arriveDate: true, departDate: true },
      },
    },
  });
  if (!trip) redirect(`/trips/${tripId}`);
  const date = defaultDayISO({ startDate: trip.startDate, endDate: trip.endDate, today: tripTodayISO(trip.stops) });
  redirect(date ? `/trips/${tripId}/day/${date}` : `/trips/${tripId}/plan`);
}
```

In `components/trip/trip-nav.tsx`:

```ts
export function primaryNav(tripId: string, planParam?: string | null): NavItem[] {
  const base = `/trips/${tripId}`;
  const plan = planParam ? `?plan=${encodeURIComponent(planParam)}` : "";
  return [
    { label: "Home", href: base },
    { label: "Plan", href: `${base}/plan${plan}` },
    { label: "Days", href: `${base}/day` },
    { label: "Calendar", href: `${base}/calendar` },
    { label: "Money", href: `${base}/budget${plan}` },
    { label: "Summary", href: `${base}/summary` },
  ];
}
```

Update the docblock above it: Days now opens the Day view (`/day`, which redirects to the default date) and Calendar is the month grid + agenda (spec 2026-09-27 decision 3). `isDaysActive` becomes a plain prefix match and no longer lights on `/calendar`:

```ts
/** Days is the Day view: /trips/:id/day and every /trips/:id/day/:date. */
export function isDaysActive(daysHref: string, pathname: string, base: string): boolean {
  return isNavActive(daysHref, pathname, base);
}
```

`TripRailItem.label` union: `"Home" | "Plan" | "Days" | "Calendar" | "Money" | "Wishlist" | "More"`. In `tripRailItems`, `simple` accepts `"Calendar"` too, and the returned array is:

```ts
return [
  simple("Home"),
  simple("Plan"),
  { label: "Days", href: daysHref, match: (p) => isDaysActive(daysHref, p, base) },
  simple("Calendar"),
  simple("Money"),
  simple("Wishlist"),
  { label: "More", href: moreHref, match: (p) => moreItems.some((item) => isNavActive(item.href, p, base)) },
];
```

Update the docblock ("seven rows — Home, Plan, Days, Calendar, Money, Wishlist, More").

In `components/trip/mobile-tab-bar.tsx`, the sheet lists Calendar first (phone has no Calendar tab):

```ts
const sheetItems = [byLabel("Calendar"), byLabel("Summary"), ...more];
```

and the comment above it now says nine routes (Calendar, Summary, Wishlist, Journal, Checklists, Files, Activity, Settings, Help) live behind the sheet.

In `app/(app)/trips/[tripId]/more/page.tsx`, add as the first entry of its sections list:

```ts
{ segment: "calendar", label: "Calendar", description: "Every day at once, as a month or a list" },
```

- [ ] **Step 4: Fix the tests that pinned the old behaviour**

`components/shell/sidebar.test.tsx`: the "six trip items" expectation becomes `["Home", "Plan", "Days", "Calendar", "Money", "Wishlist", "More", "Trips", "Globe"]`; `expect(href("Days")).toBe("/trips/t1/day")`; add `expect(href("Calendar")).toBe("/trips/t1/calendar")`; the "lights Days on a single day page" test still holds; add a case that `/trips/t1/calendar` lights only `Calendar`.

Run `grep -rn '"/calendar"\|/calendar' components/trip/*.test.tsx components/shell/*.test.tsx components/ui/*.test.tsx app --include='*.test.tsx'` and update every assertion that says Days → `/calendar` to Days → `/day`, adding a Calendar assertion beside it.

Run `TZ=UTC npx vitest run lib/help-guide.test.ts`. If its label guard asserts that every nav label is in `GUIDE_NAV_LABELS`, add `"Calendar"` after `"Days"` in `lib/help-guide.ts` `GUIDE_NAV_LABELS`. If it only asserts guide labels ⊆ nav labels, leave it.

- [ ] **Step 5: Run the affected tests**

Run: `TZ=UTC npx vitest run lib/day-view-default.test.ts components/shell components/trip/trip-nav components/trip/mobile-tab-bar lib/help-guide.test.ts app/\(app\)/trips/\[tripId\]/more`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/day-view-default.ts lib/day-view-default.test.ts "app/(app)/trips/[tripId]/day/page.tsx" components/trip/trip-nav.tsx components/trip/mobile-tab-bar.tsx "app/(app)/trips/[tripId]/more/page.tsx" components/shell/sidebar.test.tsx lib/help-guide.ts lib/help-guide.test.ts
git add -u
git commit -m "feat(nav): Days opens the Day view; Calendar becomes its own row

Days → /trips/:id/day (redirects to today while travelling, else the first
day). Calendar → the month grid and agenda. Sidebar and Dock read Home,
Plan, Days, Calendar, Money, Wishlist, More; the phone tab bar is unchanged
and Calendar lives in the More sheet.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Weather data — richer reading, stale cache, current conditions

**Files:**
- Modify: `lib/weather.ts`
- Test: `lib/weather.test.ts` (existing cases must keep passing; add new ones)

**Interfaces:**
- Produces (exported from `lib/weather.ts`):

```ts
export interface DayWeather {
  source: "forecast" | "typical";
  highC: number | null;
  lowC: number | null;
  code: number | null;
  label: string;
  /** Daily max precipitation probability, 0–100; null when the API omits it (archive). */
  precipProbMax: number | null;
  /** Daily max wind gusts, km/h. */
  gustsKph: number | null;
  /** Daily max UV index; null from the archive. */
  uvMax: number | null;
  /** Snowfall sum, cm. */
  snowfallCm: number | null;
  /** Only when `withCurrent` was requested (today): the current reading. */
  current: { tempC: number; isDay: boolean } | null;
  /** Epoch ms when this reading was fetched. */
  fetchedAt: number;
  /** True when the fetch failed and this is the last cached reading. */
  stale: boolean;
}
export async function getDayWeather(args: {
  lat: number; lng: number; dateISO: string; today: string;
  /** Also fetch current temperature + is_day (Today view only). */
  withCurrent?: boolean;
  /** Injectable clock for tests; defaults to Date.now. */
  now?: () => number;
}): Promise<DayWeather | null>;
export const FORECAST_WINDOW_DAYS = 16;
```

The old fields keep their names so `app/share/[token]/share-today-card.tsx` needs no change.

- [ ] **Step 1: Write the failing tests**

Append to `lib/weather.test.ts` (keep its `makeFetchOk` helper; add a richer payload helper):

```ts
function richPayload(over: Partial<Record<string, unknown[]>> = {}, current?: { temperature_2m: number; is_day: number }) {
  return {
    daily: {
      temperature_2m_max: [9],
      temperature_2m_min: [5],
      weathercode: [3],
      precipitation_probability_max: [70],
      wind_gusts_10m_max: [55],
      uv_index_max: [2.4],
      snowfall_sum: [0],
      ...over,
    },
    ...(current ? { current } : {}),
  };
}

describe("getDayWeather — extended reading (handoff WEATHER_CARD §1)", () => {
  it("requests the extra daily fields and parses them", async () => {
    const fetchMock = makeFetchOk(richPayload());
    vi.stubGlobal("fetch", fetchMock);
    const { getDayWeather } = await import("@/lib/weather");
    const wx = await getDayWeather({ lat: 48.58, lng: 7.75, dateISO: "2026-07-05", today: "2026-06-29" });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    const daily = url.searchParams.get("daily")!.split(",");
    for (const f of ["precipitation_probability_max", "wind_gusts_10m_max", "uv_index_max", "snowfall_sum"]) {
      expect(daily).toContain(f);
    }
    expect(url.searchParams.get("current")).toBeNull();
    expect(wx).toMatchObject({ precipProbMax: 70, gustsKph: 55, uvMax: 2.4, snowfallCm: 0, current: null, stale: false });
    expect(typeof wx!.fetchedAt).toBe("number");
  });

  it("with withCurrent, requests current temperature_2m,is_day and parses it", async () => {
    const fetchMock = makeFetchOk(richPayload({}, { temperature_2m: -2.3, is_day: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    const { getDayWeather } = await import("@/lib/weather");
    const wx = await getDayWeather({ lat: 47.55, lng: 7.59, dateISO: "2026-06-29", today: "2026-06-29", withCurrent: true });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("current")).toBe("temperature_2m,is_day");
    expect(wx!.current).toEqual({ tempC: -2.3, isDay: false });
  });

  it("a partial payload leaves missing fields null (review focus 4)", async () => {
    vi.stubGlobal("fetch", makeFetchOk({ daily: { temperature_2m_max: [9], temperature_2m_min: [5], weathercode: [3] } }));
    const { getDayWeather } = await import("@/lib/weather");
    const wx = await getDayWeather({ lat: 50.11, lng: 8.68, dateISO: "2026-07-06", today: "2026-06-29" });
    expect(wx).toMatchObject({ precipProbMax: null, gustsKph: null, uvMax: null, snowfallCm: null });
  });

  it("serves the last cached reading flagged stale when a refetch fails after the TTL", async () => {
    let t = 1_000_000;
    const now = () => t;
    const ok = makeFetchOk(richPayload());
    vi.stubGlobal("fetch", ok);
    const { getDayWeather } = await import("@/lib/weather");
    const args = { lat: 51.5, lng: -0.12, dateISO: "2026-07-07", today: "2026-06-29", now };
    const first = await getDayWeather(args);
    expect(first!.stale).toBe(false);
    t += 2 * 3600 * 1000; // past the 1h forecast TTL
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const second = await getDayWeather(args);
    expect(second).toMatchObject({ highC: 9, stale: true, fetchedAt: 1_000_000 });
  });

  it("returns null when the fetch fails and nothing is cached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { getDayWeather } = await import("@/lib/weather");
    expect(await getDayWeather({ lat: 41.9, lng: 12.5, dateISO: "2026-07-08", today: "2026-06-29" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `TZ=UTC npx vitest run lib/weather.test.ts` → the new cases FAIL (missing fields / `current` param).

- [ ] **Step 3: Implement**

Rewrite the cache and fetch in `lib/weather.ts` (keep `weatherBucket`, `weatherLabel`, `WeatherBucket` exactly as they are):

```ts
export const FORECAST_WINDOW_DAYS = 16;
const FORECAST_TTL_MS = 3600 * 1000;
const TYPICAL_TTL_MS = 86400 * 1000;

interface CacheEntry { value: DayWeather | null; fetchedAt: number; ttlMs: number }
const cache = new Map<string, CacheEntry>();

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseDaily(j: any, source: DayWeather["source"], fetchedAt: number): DayWeather {
  const d = j?.daily ?? {};
  const code = num(d.weathercode?.[0]);
  const cur = j?.current;
  return {
    source,
    highC: num(d.temperature_2m_max?.[0]),
    lowC: num(d.temperature_2m_min?.[0]),
    code,
    label: weatherLabel(code),
    precipProbMax: num(d.precipitation_probability_max?.[0]),
    gustsKph: num(d.wind_gusts_10m_max?.[0]),
    uvMax: num(d.uv_index_max?.[0]),
    snowfallCm: num(d.snowfall_sum?.[0]),
    current:
      cur && num(cur.temperature_2m) != null
        ? { tempC: cur.temperature_2m as number, isDay: cur.is_day === 1 }
        : null,
    fetchedAt,
    stale: false,
  };
}
```

`getDayWeather` logic:

1. `const nowMs = (args.now ?? Date.now)();` key = `${round(lat)},${round(lng)},${dateISO},${withCurrent ? "c" : "d"}`.
2. Cache hit within TTL (`nowMs - entry.fetchedAt < entry.ttlMs`) → return `entry.value`.
3. Otherwise fetch. Forecast (`0 <= out <= FORECAST_WINDOW_DAYS`): `daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,wind_gusts_10m_max,uv_index_max,snowfall_sum`, plus `current=temperature_2m,is_day` when `withCurrent`. Archive: `daily=temperature_2m_max,temperature_2m_min,weathercode,wind_gusts_10m_max,snowfall_sum` (the archive has no probability or UV). Keep the leap-day fallback and `timezone=UTC`. Keep `{ next: { revalidate } }` on fetch.
4. On `res.ok` → `value = parseDaily(json, source, nowMs)`, store `{ value, fetchedAt: nowMs, ttlMs }`, return.
5. On failure or `!res.ok`: if a previous entry with a non-null value exists → return `{ ...entry.value, stale: true }` (do not overwrite the entry); else store `{ value: null, fetchedAt: nowMs, ttlMs: 60_000 }` (retry after a minute) and return `null`.

Update the header comment to say readings carry `fetchedAt`/`stale` for the Weather card's Offline state (spec §B).

- [ ] **Step 4: Run the tests**

Run: `TZ=UTC npx vitest run lib/weather.test.ts lib/weather-tone.test.ts app/share` → PASS. If an old case asserted the exact `daily=` string, update it to `toContain("temperature_2m_max")`.

- [ ] **Step 5: Commit**

```bash
git add lib/weather.ts lib/weather.test.ts
git commit -m "feat(weather): richer Open-Meteo reading with stale cache and current conditions

Adds precipitation probability, gusts, UV and snowfall to the daily read,
optional current temperature/is_day for today, and fetchedAt/stale so a
failed refetch serves the last reading for the card's Offline state.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `lib/weather/theme.ts` — pure theme, condition and chip

**Files:**
- Create: `lib/weather/theme.ts`, `lib/weather/theme.test.ts`

**Interfaces:**
- Consumes: `DayWeather` from `@/lib/weather` (Task 3).
- Produces:

```ts
export type SceneKey = "sunny" | "partly" | "overcast" | "fog" | "rain" | "snow" | "storm" | "wind" | "heat" | "night";
export type ThemeKey = SceneKey | "too-far";
export interface WeatherTheme {
  key: ThemeKey;
  /** null on the Offline state (fill kept, scene dropped) and on too-far. */
  scene: SceneKey | null;
  /** "Sunny", "Partly cloudy", "Overcast", "Fog", "Showers"/"Drizzle"/"Rain", "Light snow"/"Snow", "Storms", "Windy", "Scorcher", "Clear night"; "" for too-far. */
  condition: string;
  /** The one white chip, or null. Offline is NOT here — see `offline`. */
  chip: string | null;
  /** "Offline · updated 2h ago" when the reading is stale, else null. */
  offline: string | null;
  /** True when the reading is last year's archive value. */
  typical: boolean;
}
export interface ThemeInput {
  day: DayWeather | null;
  /** dateISO − today in days (negative = past). */
  daysOut: number;
  /** The day is today in the Stop's zone (enables the night card). */
  isToday: boolean;
  /** Month name for the typical chip, e.g. "Dec". */
  monthShort: string;
  /** Clock for the "updated Nh ago" age; defaults to Date.now. */
  now?: () => number;
}
/** null → render no card (fetch failed inside the forecast window, nothing cached). */
export function getWeatherTheme(input: ThemeInput): WeatherTheme | null;
export function themeFill(key: ThemeKey): string; // Tailwind bg-* class for the card
```

- [ ] **Step 1: Write the failing tests**

`lib/weather/theme.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getWeatherTheme, themeFill } from "@/lib/weather/theme";
import type { DayWeather } from "@/lib/weather";

function wx(over: Partial<DayWeather> = {}): DayWeather {
  return {
    source: "forecast", highC: 12, lowC: 4, code: 0, label: "Clear",
    precipProbMax: null, gustsKph: null, uvMax: null, snowfallCm: null,
    current: null, fetchedAt: 1_000_000, stale: false, ...over,
  };
}
const base = { daysOut: 3, isToday: false, monthShort: "Dec", now: () => 1_000_000 + 2 * 3600 * 1000 };

describe("getWeatherTheme — code table (WEATHER_CARD §3.6)", () => {
  it.each([
    [0, "sunny", "Sunny"], [1, "sunny", "Sunny"], [2, "partly", "Partly cloudy"], [3, "overcast", "Overcast"],
    [45, "fog", "Fog"], [48, "fog", "Fog"],
    [51, "rain", "Drizzle"], [55, "rain", "Drizzle"], [61, "rain", "Rain"], [67, "rain", "Rain"], [80, "rain", "Showers"], [82, "rain", "Showers"],
    [71, "snow", "Light snow"], [75, "snow", "Snow"], [77, "snow", "Snow"], [85, "snow", "Light snow"], [86, "snow", "Snow"],
    [95, "storm", "Storms"], [99, "storm", "Storms"],
  ])("code %i → %s / %s", (code, key, condition) => {
    const t = getWeatherTheme({ ...base, day: wx({ code }) })!;
    expect(t.key).toBe(key);
    expect(t.scene).toBe(key);
    expect(t.condition).toBe(condition);
  });
  it("an unknown gap code (e.g. 30) falls back to overcast", () => {
    expect(getWeatherTheme({ ...base, day: wx({ code: 30 }) })!.key).toBe("overcast");
  });
});

describe("overrides, in priority order (§3.1–3.5)", () => {
  it("stale → keeps the theme, drops the scene, offline chip with the age", () => {
    const t = getWeatherTheme({ ...base, day: wx({ code: 3, stale: true }) })!;
    expect(t).toMatchObject({ key: "overcast", scene: null, offline: "Offline · updated 2h ago", chip: null });
  });
  it("beyond 16 days with no reading → too-far", () => {
    const t = getWeatherTheme({ ...base, daysOut: 40, day: null })!;
    expect(t).toMatchObject({ key: "too-far", scene: null, condition: "", chip: null });
  });
  it("beyond 16 days with a typical reading → themed card with the typical chip", () => {
    const t = getWeatherTheme({ ...base, daysOut: 40, day: wx({ source: "typical", code: 3 }) })!;
    expect(t).toMatchObject({ key: "overcast", typical: true, chip: "Typical for Dec" });
  });
  it("inside the window with no reading → null (no card)", () => {
    expect(getWeatherTheme({ ...base, day: null })).toBeNull();
  });
  it("night: today only, is_day 0, code 0–2", () => {
    const night = wx({ code: 1, current: { tempC: -2, isDay: false } });
    expect(getWeatherTheme({ ...base, isToday: true, day: night })!.key).toBe("night");
    expect(getWeatherTheme({ ...base, isToday: false, day: night })!.key).toBe("sunny");
    expect(getWeatherTheme({ ...base, isToday: true, day: wx({ code: 3, current: { tempC: -2, isDay: false } }) })!.key).toBe("overcast");
  });
  it("heat: max ≥ 35 and code 0–2, beats wind", () => {
    const t = getWeatherTheme({ ...base, day: wx({ code: 1, highC: 36, gustsKph: 60 }) })!;
    expect(t).toMatchObject({ key: "heat", condition: "Scorcher", chip: "Heat warning · shade 12–3pm" });
    expect(getWeatherTheme({ ...base, day: wx({ code: 3, highC: 36 }) })!.key).toBe("overcast");
  });
  it("wind: gusts ≥ 40 and code 0–3", () => {
    const t = getWeatherTheme({ ...base, day: wx({ code: 3, gustsKph: 55 }) })!;
    expect(t).toMatchObject({ key: "wind", condition: "Windy", chip: "Gusts 55 km/h" });
    expect(getWeatherTheme({ ...base, day: wx({ code: 61, gustsKph: 55 }) })!.key).toBe("rain");
  });
});

describe("chip (§4)", () => {
  it("rain/storm show the probability; omitted when unknown (review focus 4)", () => {
    expect(getWeatherTheme({ ...base, day: wx({ code: 61, precipProbMax: 70 }) })!.chip).toBe("Rain 70%");
    expect(getWeatherTheme({ ...base, day: wx({ code: 95, precipProbMax: 40 }) })!.chip).toBe("Rain 40%");
    expect(getWeatherTheme({ ...base, day: wx({ code: 61, precipProbMax: null }) })!.chip).toBeNull();
  });
  it("sunny shows UV only from 8", () => {
    expect(getWeatherTheme({ ...base, day: wx({ code: 0, uvMax: 11 }) })!.chip).toBe("UV 11 · pack sunscreen");
    expect(getWeatherTheme({ ...base, day: wx({ code: 0, uvMax: 5 }) })!.chip).toBeNull();
  });
  it("snow shows the amount when > 0", () => {
    expect(getWeatherTheme({ ...base, day: wx({ code: 73, snowfallCm: 2 }) })!.chip).toBe("2 cm · icy paths");
    expect(getWeatherTheme({ ...base, day: wx({ code: 73, snowfallCm: 0 }) })!.chip).toBeNull();
  });
  it("a typical reading with a themed fact shows the fact, else the typical chip", () => {
    expect(getWeatherTheme({ ...base, daysOut: 30, day: wx({ source: "typical", code: 73, snowfallCm: 3 }) })!.chip).toBe("3 cm · icy paths");
    expect(getWeatherTheme({ ...base, daysOut: 30, day: wx({ source: "typical", code: 0 }) })!.chip).toBe("Typical for Dec");
  });
});

describe("themeFill", () => {
  it.each([
    ["sunny", "bg-wx-sunny"], ["night", "bg-wx-night"], ["too-far", "bg-background"],
  ])("%s → %s", (key, cls) => expect(themeFill(key as never)).toBe(cls));
});
```

- [ ] **Step 2: Run to see it fail** — `TZ=UTC npx vitest run lib/weather/theme.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `lib/weather/theme.ts`**

```ts
import { FORECAST_WINDOW_DAYS, type DayWeather } from "@/lib/weather";

export type SceneKey = "sunny" | "partly" | "overcast" | "fog" | "rain" | "snow" | "storm" | "wind" | "heat" | "night";
export type ThemeKey = SceneKey | "too-far";

export interface WeatherTheme { key: ThemeKey; scene: SceneKey | null; condition: string; chip: string | null; offline: string | null; typical: boolean }
export interface ThemeInput { day: DayWeather | null; daysOut: number; isToday: boolean; monthShort: string; now?: () => number }

const HEAT_MIN_C = 35;
const WIND_MIN_KPH = 40;
const UV_WARN = 8;

/** WMO code → scene + condition label (WEATHER_CARD §3 table). Gap codes fall to overcast. */
function byCode(code: number | null): { scene: SceneKey; condition: string } {
  if (code == null) return { scene: "overcast", condition: "Overcast" };
  if (code <= 1) return { scene: "sunny", condition: "Sunny" };
  if (code === 2) return { scene: "partly", condition: "Partly cloudy" };
  if (code === 3) return { scene: "overcast", condition: "Overcast" };
  if (code === 45 || code === 48) return { scene: "fog", condition: "Fog" };
  if (code >= 51 && code <= 57) return { scene: "rain", condition: "Drizzle" };
  if (code >= 61 && code <= 67) return { scene: "rain", condition: "Rain" };
  if (code >= 80 && code <= 82) return { scene: "rain", condition: "Showers" };
  if (code === 71 || code === 85) return { scene: "snow", condition: "Light snow" };
  if ((code >= 72 && code <= 77) || code === 86) return { scene: "snow", condition: "Snow" };
  if (code >= 95 && code <= 99) return { scene: "storm", condition: "Storms" };
  return { scene: "overcast", condition: "Overcast" };
}

function ageLabel(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

function themedChip(scene: SceneKey, day: DayWeather): string | null {
  switch (scene) {
    case "rain":
    case "storm":
      return day.precipProbMax != null ? `Rain ${Math.round(day.precipProbMax)}%` : null;
    case "sunny":
    case "partly":
      return day.uvMax != null && day.uvMax >= UV_WARN ? `UV ${Math.round(day.uvMax)} · pack sunscreen` : null;
    case "snow":
      return day.snowfallCm != null && day.snowfallCm > 0 ? `${Math.round(day.snowfallCm * 10) / 10} cm · icy paths` : null;
    case "wind":
      return day.gustsKph != null ? `Gusts ${Math.round(day.gustsKph)} km/h` : null;
    case "heat":
      return "Heat warning · shade 12–3pm";
    default:
      return null;
  }
}

export function getWeatherTheme(input: ThemeInput): WeatherTheme | null {
  const { day, daysOut, isToday, monthShort } = input;
  const nowMs = (input.now ?? Date.now)();
  if (!day) {
    return daysOut > FORECAST_WINDOW_DAYS
      ? { key: "too-far", scene: null, condition: "", chip: null, offline: null, typical: false }
      : null;
  }
  const typical = day.source === "typical";
  const code = day.code;
  let picked: { scene: SceneKey; condition: string };
  if (isToday && day.current && !day.current.isDay && code != null && code <= 2) picked = { scene: "night", condition: "Clear night" };
  else if (day.highC != null && day.highC >= HEAT_MIN_C && code != null && code <= 2) picked = { scene: "heat", condition: "Scorcher" };
  else if (day.gustsKph != null && day.gustsKph >= WIND_MIN_KPH && code != null && code <= 3) picked = { scene: "wind", condition: "Windy" };
  else picked = byCode(code);

  if (day.stale) {
    return { key: picked.scene, scene: null, condition: picked.condition, chip: null, offline: `Offline · updated ${ageLabel(nowMs - day.fetchedAt)} ago`, typical };
  }
  const chip = themedChip(picked.scene, day) ?? (typical ? `Typical for ${monthShort}` : null);
  return { key: picked.scene, scene: picked.scene, condition: picked.condition, chip, offline: null, typical };
}

const FILL: Record<ThemeKey, string> = {
  sunny: "bg-wx-sunny", partly: "bg-wx-partly", overcast: "bg-wx-overcast", fog: "bg-wx-fog", rain: "bg-wx-rain",
  snow: "bg-wx-snow", storm: "bg-wx-storm", wind: "bg-wx-wind", heat: "bg-wx-heat", night: "bg-wx-night", "too-far": "bg-background",
};
export function themeFill(key: ThemeKey): string { return FILL[key]; }
```

- [ ] **Step 4: Run** — `TZ=UTC npx vitest run lib/weather/theme.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/weather/theme.ts lib/weather/theme.test.ts
git commit -m "feat(weather): pure theme picker — scene, condition and the one chip

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `--wx-*` tokens

**Files:**
- Modify: `app/globals.css` (the `:root` light block near `--canvas`, the `.dark` block near its `--canvas`, and the `@theme` block near `--color-canvas`)
- Test: `app/globals.test.ts` (create) — a plain file read.

- [ ] **Step 1: Failing test**

`app/globals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
const NAMES = ["sunny", "partly", "overcast", "fog", "rain", "snow", "storm", "wind", "heat", "night", "sun-disc", "cloud", "cloud-back", "cloud-storm", "night-track"];

describe("weather tokens (WEATHER_CARD §2)", () => {
  it.each(NAMES)("--wx-%s is defined twice (light + dark) and exposed as --color-wx-*", (n) => {
    const defs = css.match(new RegExp(`^\\s*--wx-${n}:`, "gm")) ?? [];
    expect(defs.length).toBe(2);
    expect(css).toMatch(new RegExp(`--color-wx-${n}: hsl\\(var\\(--wx-${n}\\)\\);`));
  });
  it("uses the same HSL in light and dark", () => {
    for (const n of NAMES) {
      const vals = [...css.matchAll(new RegExp(`--wx-${n}:\\s*([^;]+);`, "g"))].map((m) => m[1].trim());
      expect(new Set(vals).size).toBe(1);
    }
  });
});
```

- [ ] **Step 2: Run** — `TZ=UTC npx vitest run app/globals.test.ts` → FAIL.

- [ ] **Step 3: Add the tokens**

Insert this block after `--canvas: 37 33% 91%; /* #EFE9DF */` in the light `:root`, and the identical block after the dark block's `--canvas:` line (the card is a coloured object, same in both themes — WEATHER_CARD §2):

```css
  /* Weather card fills and scene parts (WEATHER_CARD.md §2). Same in dark. */
  --wx-sunny: 42 100% 70%; /* #FFD166 = sun */
  --wx-partly: 44 100% 83%; /* #FFE8A8 */
  --wx-overcast: 40 16% 82%; /* #D9D4CA */
  --wx-fog: 41 23% 86%; /* #E4DFD4 */
  --wx-rain: 179 44% 55%; /* #5BC0BE = teal */
  --wx-snow: 258 100% 93%; /* #E6DBFF */
  --wx-storm: 264 100% 82%; /* #C7A2FF = lilac */
  --wx-wind: 177 44% 83%; /* #BFE6E4 */
  --wx-heat: 11 100% 65%; /* #FF6B4A = coral */
  --wx-night: 60 4% 11%; /* #1D1D1B = ink */
  --wx-sun-disc: 25 100% 68%; /* #FF9F5A */
  --wx-cloud: 0 0% 100%; /* #FFFFFF */
  --wx-cloud-back: 38 26% 92%; /* #EFEBE4 */
  --wx-cloud-storm: 35 9% 63%; /* #A9A298 */
  --wx-night-track: 34 8% 17%; /* #302D29 */
```

And after `--color-canvas: hsl(var(--canvas));` in `@theme`:

```css
  --color-wx-sunny: hsl(var(--wx-sunny));
  --color-wx-partly: hsl(var(--wx-partly));
  --color-wx-overcast: hsl(var(--wx-overcast));
  --color-wx-fog: hsl(var(--wx-fog));
  --color-wx-rain: hsl(var(--wx-rain));
  --color-wx-snow: hsl(var(--wx-snow));
  --color-wx-storm: hsl(var(--wx-storm));
  --color-wx-wind: hsl(var(--wx-wind));
  --color-wx-heat: hsl(var(--wx-heat));
  --color-wx-night: hsl(var(--wx-night));
  --color-wx-sun-disc: hsl(var(--wx-sun-disc));
  --color-wx-cloud: hsl(var(--wx-cloud));
  --color-wx-cloud-back: hsl(var(--wx-cloud-back));
  --color-wx-cloud-storm: hsl(var(--wx-cloud-storm));
  --color-wx-night-track: hsl(var(--wx-night-track));
```

Also add the scene keyframes next to `@keyframes tp-pulse` (WEATHER_CARD §5 motion):

```css
@keyframes wx-drift { from { transform: translateX(0); } to { transform: translateX(6px); } }
@keyframes wx-fall-rain { from { transform: translateY(0) rotate(18deg); opacity: 1; } to { transform: translateY(8px) rotate(18deg); opacity: 0.4; } }
@keyframes wx-fall-snow { from { transform: translateY(0); } to { transform: translateY(10px); } }
@keyframes wx-spin { to { transform: rotate(360deg); } }
@utility wx-drift { animation: wx-drift 8s ease-in-out infinite alternate; }
@utility wx-rain { animation: wx-fall-rain 1.2s linear infinite; }
@utility wx-snow { animation: wx-fall-snow 3s ease-in-out infinite alternate; }
@utility wx-spin { animation: wx-spin 40s linear infinite; }
```

- [ ] **Step 4: Run** — `TZ=UTC npx vitest run app/globals.test.ts` → PASS. Then `npx next build --no-lint 2>&1 | tail -5` is NOT required here; `npm run lint` is.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/globals.test.ts
git commit -m "feat(tokens): weather card fills, scene parts and motion utilities

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: WeatherCard, scenes and skeleton

**Files:**
- Create: `components/weather/scenes.tsx`, `components/weather/WeatherCard.tsx`, `components/weather/WeatherCardSkeleton.tsx`, `components/weather/daylight-bar.tsx`
- Test: `components/weather/WeatherCard.test.tsx`, `components/weather/daylight-bar.test.tsx`

**Interfaces:**
- Consumes: `getWeatherTheme`, `themeFill`, `SceneKey`, `WeatherTheme` (Task 4); `DayWeather` (Task 3); `DaylightResult` from `@/lib/daylight`.
- Produces:

```ts
// components/weather/WeatherCard.tsx (Server Component)
export interface WeatherCardProps {
  size: "regular" | "compact";
  /** "SAT 12 DEC · STRASBOURG" pieces; eyebrow hidden on compact. */
  dateLabel: string;   // formatDayLabel(date) → "Sat 12 Dec"
  placeName: string;
  theme: WeatherTheme; // already resolved by the caller (Task 4)
  day: DayWeather | null;
  daylight: DaylightView;
  /** Only for the night card's "now" tick and "−2° now": local HH:MM now at the Stop. */
  nowLocal?: string | null;
  /** too-far only: "Fri 18 Dec" — when the forecast will open. */
  forecastOpensOn?: string | null;
  className?: string;
}
export function WeatherCard(props: WeatherCardProps): JSX.Element;

// components/weather/daylight-bar.tsx
export interface DaylightView { sunrise: string | null; sunset: string | null; dayLengthMin: number; polarDay: boolean; polarNight: boolean }
export function daylightGeometry(d: DaylightView): { leftPct: number; widthPct: number }; // pure
export function daylightLabel(d: DaylightView): string; // "Daylight 08:12 to 16:33, 8 hours 22 minutes"
export function formatDayLength(min: number): string; // "8h 22m"
export function DaylightBar(props: { daylight: DaylightView; size: "regular" | "compact"; segmentClass: string; trackClass: string; nowPct?: number | null }): JSX.Element;

// components/weather/scenes.tsx — all aria-hidden, absolute, pure CSS
export function Scene({ scene }: { scene: SceneKey }): JSX.Element;
export function Cloud({ fill, className, drift }: { fill: string; className?: string; drift?: boolean }): JSX.Element;

// components/weather/WeatherCardSkeleton.tsx
export function WeatherCardSkeleton({ size }: { size: "regular" | "compact" }): JSX.Element;
```

- [ ] **Step 1: Failing tests — daylight geometry**

`components/weather/daylight-bar.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { daylightGeometry, daylightLabel, formatDayLength, DaylightBar } from "@/components/weather/daylight-bar";

const day = { sunrise: "08:12", sunset: "16:33", dayLengthMin: 501, polarDay: false, polarNight: false };

describe("daylight bar", () => {
  it("places the segment at sunrise/24h with width (sunset−sunrise)/24h", () => {
    const g = daylightGeometry(day);
    expect(g.leftPct).toBeCloseTo((8 * 60 + 12) / 1440 * 100, 3);
    expect(g.widthPct).toBeCloseTo(501 / 1440 * 100, 3);
  });
  it("polar day is a full bar, polar night an empty one (review focus 5)", () => {
    expect(daylightGeometry({ ...day, sunrise: null, sunset: null, dayLengthMin: 1440, polarDay: true })).toEqual({ leftPct: 0, widthPct: 100 });
    expect(daylightGeometry({ ...day, sunrise: null, sunset: null, dayLengthMin: 0, polarNight: true })).toEqual({ leftPct: 0, widthPct: 0 });
    expect(daylightLabel({ ...day, sunrise: null, sunset: null, dayLengthMin: 1440, polarDay: true })).toBe("Daylight all day");
    expect(daylightLabel({ ...day, sunrise: null, sunset: null, dayLengthMin: 0, polarNight: true })).toBe("Polar night");
  });
  it("labels", () => {
    expect(formatDayLength(501)).toBe("8h 22m");
    expect(daylightLabel(day)).toBe("Daylight 08:12 to 16:33, 8 hours 22 minutes");
  });
  it("renders role=img with the label and the sunrise/sunset captions", () => {
    render(<DaylightBar daylight={day} size="regular" segmentClass="bg-wx-sunny" trackClass="bg-card" />);
    expect(screen.getByRole("img", { name: "Daylight 08:12 to 16:33, 8 hours 22 minutes" })).toBeInTheDocument();
    expect(screen.getByText("↑ 08:12")).toBeInTheDocument();
    expect(screen.getByText("16:33 ↓")).toBeInTheDocument();
    expect(screen.getByText("8h 22m daylight")).toBeInTheDocument();
  });
  it("compact shortens the middle caption", () => {
    render(<DaylightBar daylight={day} size="compact" segmentClass="bg-wx-sunny" trackClass="bg-card" />);
    expect(screen.getByText("8h 22m")).toBeInTheDocument();
    expect(screen.queryByText("8h 22m daylight")).toBeNull();
  });
});
```

- [ ] **Step 2: Failing tests — the card**

`components/weather/WeatherCard.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeatherCard } from "@/components/weather/WeatherCard";
import { WeatherCardSkeleton } from "@/components/weather/WeatherCardSkeleton";
import { getWeatherTheme } from "@/lib/weather/theme";
import type { DayWeather } from "@/lib/weather";

function wx(over: Partial<DayWeather> = {}): DayWeather {
  return { source: "forecast", highC: 9, lowC: 5, code: 3, label: "Overcast", precipProbMax: null, gustsKph: null, uvMax: null, snowfallCm: null, current: null, fetchedAt: 0, stale: false, ...over };
}
const daylight = { sunrise: "08:12", sunset: "16:33", dayLengthMin: 501, polarDay: false, polarNight: false };
const base = { daysOut: 3, isToday: false, monthShort: "Dec", now: () => 2 * 3600 * 1000 };
function card(day: DayWeather | null, size: "regular" | "compact" = "regular", extra: Partial<Parameters<typeof WeatherCard>[0]> = {}, themeIn: Partial<typeof base> = {}) {
  const theme = getWeatherTheme({ ...base, ...themeIn, day })!;
  return render(<WeatherCard size={size} dateLabel="Sat 12 Dec" placeName="Strasbourg" theme={theme} day={day} daylight={daylight} {...extra} />);
}
const article = () => screen.getByRole("region", { name: "Weather" });

describe("WeatherCard — every theme at both sizes (WEATHER_CARD §7, behaviour not snapshots)", () => {
  const themes: Array<[string, DayWeather, string, string]> = [
    ["sunny", wx({ code: 0 }), "bg-wx-sunny", "Sunny"],
    ["partly", wx({ code: 2 }), "bg-wx-partly", "Partly cloudy"],
    ["overcast", wx({ code: 3 }), "bg-wx-overcast", "Overcast"],
    ["fog", wx({ code: 45 }), "bg-wx-fog", "Fog"],
    ["rain", wx({ code: 80, precipProbMax: 70 }), "bg-wx-rain", "Showers"],
    ["snow", wx({ code: 71, snowfallCm: 2 }), "bg-wx-snow", "Light snow"],
    ["storm", wx({ code: 95, precipProbMax: 60 }), "bg-wx-storm", "Storms"],
    ["wind", wx({ code: 1, gustsKph: 55 }), "bg-wx-wind", "Windy"],
    ["heat", wx({ code: 0, highC: 36 }), "bg-wx-heat", "Scorcher"],
  ];
  for (const size of ["regular", "compact"] as const) {
    it.each(themes)(`${size}: %s → fill, scene, condition`, (key, day, fill, condition) => {
      card(day, size);
      const el = article();
      expect(el.className.split(/\s+/)).toContain(fill);
      expect(el.querySelector(`[data-scene="${key}"]`)).toBeTruthy();
      expect(screen.getByText(condition)).toBeInTheDocument();
      expect(el.className).toContain(size === "regular" ? "h-[236px]" : "h-[140px]");
      if (size === "compact") expect(screen.queryByText(/SAT 12 DEC/i)).toBeNull();
      else expect(screen.getByText("Sat 12 Dec · Strasbourg")).toBeInTheDocument();
    });
  }
  it("night: ink fill, paper text, coral shadow, moon scene, '−2° now', now tick", () => {
    card(wx({ code: 0, current: { tempC: -2, isDay: false } }), "regular", { nowLocal: "21:00" }, { isToday: true });
    const el = article();
    expect(el.className).toContain("bg-wx-night");
    expect(el.className).toContain("text-primary-foreground");
    expect(el.className).toContain("shadow-[5px_5px_0_var(--color-coral)]");
    expect(el.querySelector('[data-scene="night"]')).toBeTruthy();
    expect(screen.getByText("-2°")).toBeInTheDocument();
    expect(screen.getByText("now")).toBeInTheDocument();
    expect(el.querySelector("[data-now-tick]")).toBeTruthy();
  });
  it("shows exactly one chip, or none", () => {
    card(wx({ code: 80, precipProbMax: 70 }));
    expect(screen.getAllByTestId("wx-chip")).toHaveLength(1);
    expect(screen.getByTestId("wx-chip")).toHaveTextContent("Rain 70%");
    card(wx({ code: 0, uvMax: 3 }));
    expect(screen.queryAllByTestId("wx-chip").filter((c) => c.textContent === "")).toHaveLength(0);
  });
  it("offline: keeps the fill, drops the scene, ink chip top right", () => {
    card(wx({ code: 3, stale: true }));
    const el = article();
    expect(el.className).toContain("bg-wx-overcast");
    expect(el.querySelector("[data-scene]")).toBeNull();
    expect(screen.getByTestId("wx-offline")).toHaveTextContent("Offline · updated 2h ago");
  });
  it("too far out: dashed paper card, no shadow, 'Too far out' copy with the date, daylight chip", () => {
    card(null, "regular", { forecastOpensOn: "Fri 18 Dec" }, { daysOut: 40 });
    const el = article();
    expect(el.className).toContain("border-dashed");
    expect(el.className).not.toMatch(/shadow-hard/);
    expect(el.querySelector("[data-scene]")).toBeNull();
    expect(screen.getByText(/Too far out for a forecast\. We'll switch to the real one on Fri 18 Dec, 15 days before\./)).toBeInTheDocument();
    expect(screen.getByText("↑ 08:12 · 16:33 ↓")).toBeInTheDocument();
  });
  it("high/low read as one accessible phrase", () => {
    card(wx({ code: 3 }));
    expect(screen.getByText("9°")).toBeInTheDocument();
    expect(screen.getByText("/ 5°")).toBeInTheDocument();
    expect(screen.getByText("High 9 degrees, low 5 degrees")).toHaveClass("sr-only");
  });
  it("skeleton has the same sizes and the pulse", () => {
    const { container } = render(<WeatherCardSkeleton size="regular" />);
    expect(container.firstElementChild!.className).toContain("h-[236px]");
    expect(container.querySelector(".tp-pulse")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Loading weather" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run both** — `TZ=UTC npx vitest run components/weather` → FAIL (modules missing).

- [ ] **Step 4: Implement `components/weather/daylight-bar.tsx`**

```tsx
import { cn } from "@/lib/cn";

export interface DaylightView { sunrise: string | null; sunset: string | null; dayLengthMin: number; polarDay: boolean; polarNight: boolean }

const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };

export function formatDayLength(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** left = sunrise/24h, width = (sunset − sunrise)/24h (WEATHER_CARD §4). */
export function daylightGeometry(d: DaylightView): { leftPct: number; widthPct: number } {
  if (d.polarDay) return { leftPct: 0, widthPct: 100 };
  if (d.polarNight || !d.sunrise || !d.sunset) return { leftPct: 0, widthPct: 0 };
  const rise = toMin(d.sunrise);
  return { leftPct: (rise / 1440) * 100, widthPct: (d.dayLengthMin / 1440) * 100 };
}

export function daylightLabel(d: DaylightView): string {
  if (d.polarDay) return "Daylight all day";
  if (d.polarNight || !d.sunrise || !d.sunset) return "Polar night";
  const h = Math.floor(d.dayLengthMin / 60);
  const m = d.dayLengthMin % 60;
  return `Daylight ${d.sunrise} to ${d.sunset}, ${h} hour${h === 1 ? "" : "s"} ${m} minute${m === 1 ? "" : "s"}`;
}

export function DaylightBar({ daylight, size, segmentClass, trackClass, nowPct = null, captionClass }: {
  daylight: DaylightView; size: "regular" | "compact"; segmentClass: string; trackClass: string; nowPct?: number | null; captionClass?: string;
}) {
  const g = daylightGeometry(daylight);
  const compact = size === "compact";
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="img"
        aria-label={daylightLabel(daylight)}
        className={cn("relative w-full overflow-hidden rounded-full border-2 border-current", compact ? "h-2.5" : "h-3", trackClass)}
      >
        {g.widthPct > 0 ? (
          <span
            data-daylight-segment
            className={cn("absolute inset-y-0 border-x-2 border-current", segmentClass)}
            style={{ left: `${g.leftPct}%`, width: `${g.widthPct}%` }}
          />
        ) : null}
        {nowPct != null ? <span data-now-tick className="absolute inset-y-0 w-1 bg-coral" style={{ left: `${nowPct}%` }} /> : null}
      </div>
      <div className={cn("flex items-baseline justify-between font-bold", compact ? "text-[11px]" : "text-xs", captionClass)}>
        <span>{daylight.sunrise ? `↑ ${daylight.sunrise}` : ""}</span>
        <span>{compact ? formatDayLength(daylight.dayLengthMin) : `${formatDayLength(daylight.dayLengthMin)} daylight`}</span>
        <span>{daylight.sunset ? `${daylight.sunset} ↓` : ""}</span>
      </div>
    </div>
  );
}
```

Note: the border uses `border-current`, so the card sets `text-*` (ink via `island`, paper on the night card) and the bar's outline follows. The night card passes `trackClass="bg-wx-night-track"`.

- [ ] **Step 5: Implement `components/weather/scenes.tsx`**

Positions are the handoff's for the 420×236 regular card; the compact card scales the whole scene (`scale-[.62] origin-top-right`). Every part is `absolute` and `aria-hidden`; the wrapper carries `data-scene`.

```tsx
import { cn } from "@/lib/cn";
import type { SceneKey } from "@/lib/weather/theme";

const MOTION = "motion-reduce:animate-none";

/** Cloud recipe (WEATHER_CARD §5): outlined layer, then the same shapes inset 2px without a border. */
export function Cloud({ fill, className, drift = false }: { fill: string; className?: string; drift?: boolean }) {
  const outline = "absolute rounded-full border-2 border-border bg-border";
  const inner = cn("absolute rounded-full", fill);
  return (
    <div className={cn("absolute h-[92px] w-[170px]", drift && `wx-drift ${MOTION}`, className)}>
      <span className={outline} style={{ left: 0, top: 40, width: 160, height: 50 }} />
      <span className={outline} style={{ left: 30, top: 10, width: 60, height: 60 }} />
      <span className={outline} style={{ left: 75, top: 0, width: 70, height: 70 }} />
      <span className={inner} style={{ left: 2, top: 42, width: 156, height: 46 }} />
      <span className={inner} style={{ left: 32, top: 12, width: 56, height: 56 }} />
      <span className={inner} style={{ left: 77, top: 2, width: 66, height: 66 }} />
    </div>
  );
}

function BackCloud({ className }: { className?: string }) {
  const outline = "absolute rounded-full border-2 border-border bg-border";
  const inner = "absolute rounded-full bg-wx-cloud-back";
  return (
    <div className={cn("absolute h-[60px] w-[110px]", className)}>
      <span className={outline} style={{ left: 0, top: 26, width: 100, height: 32 }} />
      <span className={outline} style={{ left: 22, top: 4, width: 44, height: 44 }} />
      <span className={inner} style={{ left: 2, top: 28, width: 96, height: 28 }} />
      <span className={inner} style={{ left: 24, top: 6, width: 40, height: 40 }} />
    </div>
  );
}

const RAIN_DROPS = [[230, 106], [252, 132], [274, 110], [296, 140], [318, 108], [340, 134], [360, 152]];
const SNOW_DOTS = [[228, 14, 10], [262, 38, 14], [300, 10, 18], [330, 44, 8], [360, 22, 12], [392, 60, 16], [246, 76, 8], [286, 92, 12], [340, 84, 10], [372, 104, 14], [316, 128, 8], [396, 140, 10]];
const FOG_PILLS = [[190, -20, 24], [150, 40, 56], [170, -30, 88], [110, 60, 120]];
const WIND_BARS = [[150, 30, 40], [110, 60, 80], [170, 20, 120]];
const STARS = [[250, 20, 3], [290, 60, 4], [330, 30, 3], [380, 70, 3], [270, 120, 4], [350, 140, 3], [400, 110, 4], [240, 170, 3]];

export function Scene({ scene }: { scene: SceneKey }) {
  const wrap = (children: React.ReactNode) => (
    <div aria-hidden="true" data-scene={scene} className="pointer-events-none absolute inset-0 overflow-hidden">{children}</div>
  );
  switch (scene) {
    case "sunny":
      return wrap(<>
        <span className={cn("absolute size-[176px] rounded-full border-[3px] border-dashed border-border wx-spin", MOTION)} style={{ right: -34, top: -34 }} />
        <span className="absolute size-[120px] rounded-full border-2 border-border bg-wx-sun-disc" style={{ right: -6, top: -6 }} />
      </>);
    case "partly":
      return wrap(<>
        <span className="absolute size-[110px] rounded-full border-2 border-border bg-wx-sunny" style={{ right: 30, top: -10 }} />
        <Cloud fill="bg-wx-cloud" drift className="right-[-20px] top-[50px]" />
      </>);
    case "overcast":
      return wrap(<>
        <BackCloud className="right-[92px] top-[74px]" />
        <Cloud fill="bg-wx-cloud" drift className="right-[-10px] top-[14px]" />
      </>);
    case "fog":
      return wrap(FOG_PILLS.map(([w, r, t], i) => (
        <span key={i} className="absolute h-5 rounded-full border-2 border-border bg-wx-cloud" style={{ width: w, right: r, top: t }} />
      )));
    case "rain":
      return wrap(<>
        <Cloud fill="bg-wx-cloud" drift className="right-[-10px] top-[10px]" />
        {RAIN_DROPS.map(([x, y], i) => (
          <span key={i} className={cn("absolute h-[18px] w-1 rounded-sm bg-border wx-rain", MOTION)} style={{ left: x, top: y, transform: "rotate(18deg)", animationDelay: `${(i * 0.17) % 1.2}s` }} />
        ))}
      </>);
    case "snow":
      return wrap(SNOW_DOTS.map(([x, y, s], i) => (
        <span key={i} className={cn("absolute rounded-full border-2 border-border bg-wx-cloud wx-snow", MOTION)} style={{ left: x, top: y, width: s, height: s, animationDelay: `${(i * 0.25) % 3}s` }} />
      )));
    case "storm":
      return wrap(<>
        <Cloud fill="bg-wx-cloud-storm" drift className="right-[-10px] top-[10px]" />
        <span className="absolute h-[78px] w-12 bg-border" style={{ right: 60, top: 96, transform: "translate(4px, 4px)", clipPath: "polygon(55% 0,0 58%,40% 58%,25% 100%,100% 36%,58% 36%,80% 0)" }} />
        <span className="absolute h-[78px] w-12 bg-wx-sunny" style={{ right: 60, top: 96, clipPath: "polygon(55% 0,0 58%,40% 58%,25% 100%,100% 36%,58% 36%,80% 0)" }} />
      </>);
    case "wind":
      return wrap(WIND_BARS.map(([w, r, t], i) => (
        <span key={i} className="absolute" style={{ right: r, top: t, width: w, height: 26 }}>
          <span className="absolute left-0 top-[10px] h-1.5 rounded-[3px] bg-border" style={{ width: w - 14 }} />
          <span className="absolute right-0 top-0 size-[26px] rounded-full border-[6px] border-border border-b-transparent border-l-transparent" style={{ transform: "rotate(45deg)" }} />
        </span>
      )));
    case "heat":
      return wrap(<>
        <span className="absolute size-[200px] rounded-full border-[3px] border-dashed border-border" style={{ right: -46, top: -46 }} />
        <span className="absolute size-[156px] rounded-full border-[3px] border-dashed border-border" style={{ right: -24, top: -24 }} />
        <span className="absolute size-[108px] rounded-full border-2 border-border bg-wx-sunny" style={{ right: 0, top: 0 }} />
      </>);
    case "night":
      return wrap(<>
        {STARS.map(([x, y, s], i) => (
          <span key={i} className="absolute rounded-full bg-primary-foreground" style={{ left: x, top: y, width: s, height: s }} />
        ))}
        <span className="absolute size-24 rounded-full bg-wx-sunny" style={{ right: 28, top: 22 }} />
        <span className="absolute size-[84px] rounded-full bg-wx-night" style={{ right: 28 - 18, top: 22 - 12 }} />
      </>);
  }
}
```

- [ ] **Step 6: Implement `components/weather/WeatherCard.tsx`**

```tsx
import { cn } from "@/lib/cn";
import type { DayWeather } from "@/lib/weather";
import { themeFill, type WeatherTheme } from "@/lib/weather/theme";
import { Scene } from "@/components/weather/scenes";
import { DaylightBar, type DaylightView } from "@/components/weather/daylight-bar";

export interface WeatherCardProps {
  size: "regular" | "compact";
  dateLabel: string;
  placeName: string;
  theme: WeatherTheme;
  day: DayWeather | null;
  daylight: DaylightView;
  nowLocal?: string | null;
  forecastOpensOn?: string | null;
  className?: string;
}

const deg = (n: number | null) => (n == null ? "—" : `${Math.round(n)}°`);
const nowPctOf = (hm: string | null | undefined) => { if (!hm) return null; const [h, m] = hm.split(":").map(Number); return ((h * 60 + m) / 1440) * 100; };

function Chip({ children, ink = false, testId = "wx-chip", className }: { children: React.ReactNode; ink?: boolean; testId?: string; className?: string }) {
  return (
    <span data-testid={testId} className={cn("inline-flex items-center whitespace-nowrap rounded-full border-2 border-border px-2 py-0.5 text-[11px] font-bold", ink ? "bg-primary text-primary-foreground" : "bg-card text-foreground", className)}>
      {children}
    </span>
  );
}

/**
 * The Weather card (WEATHER_CARD.md): one fixed layout; the theme sets the
 * fill and the scene. Server Component. Text on every fill is ink via the
 * island utility; the night card is ink with paper text.
 */
export function WeatherCard({ size, dateLabel, placeName, theme, day, daylight, nowLocal, forecastOpensOn, className }: WeatherCardProps) {
  const compact = size === "compact";
  const night = theme.key === "night";
  const tooFar = theme.key === "too-far";
  const box = cn(
    "relative flex w-full flex-col overflow-hidden border-2",
    compact ? "h-[140px] rounded-[20px] p-[14px_16px]" : "h-[236px] rounded-3xl p-[20px_22px]",
    tooFar
      ? "border-dashed border-border bg-background text-foreground"
      : cn(themeFill(theme.key), night ? "border-border text-primary-foreground shadow-[5px_5px_0_var(--color-coral)]" : cn("island border-border", compact ? "shadow-hard-2" : "shadow-hard-3")),
    className,
  );
  const eyebrow = !compact ? (
    <p className={cn("text-[11px] font-extrabold uppercase tracking-[0.08em]", tooFar && "text-muted-foreground")}>{dateLabel} · {placeName}</p>
  ) : null;

  if (tooFar) {
    return (
      <section aria-label="Weather" className={box}>
        <h2 className="sr-only">Weather</h2>
        {eyebrow}
        <p className={cn("font-display font-extrabold leading-none tracking-[-0.03em]", compact ? "mt-1 text-[26px]" : "mt-2 text-[40px]")}>Too far out</p>
        <p className={cn("mt-2 font-semibold text-muted-foreground", compact ? "text-[12px]" : "text-sm")}>
          Too far out for a forecast.{forecastOpensOn ? ` We'll switch to the real one on ${forecastOpensOn}, 15 days before.` : ""}
        </p>
        <div className="mt-auto flex flex-wrap gap-2">
          {daylight.sunrise && daylight.sunset ? <Chip>{`↑ ${daylight.sunrise} · ${daylight.sunset} ↓`}</Chip> : null}
        </div>
      </section>
    );
  }

  const high = night && day?.current ? day.current.tempC : day?.highC ?? null;
  return (
    <section aria-label="Weather" className={box}>
      <h2 className="sr-only">Weather</h2>
      {theme.scene ? (
        <div className={cn("absolute inset-0", compact && "origin-top-right scale-[.62]")}><Scene scene={theme.scene} /></div>
      ) : null}
      {theme.offline ? <Chip ink testId="wx-offline" className="absolute right-3 top-3">{theme.offline}</Chip> : null}

      <div className="relative flex flex-col">
        {eyebrow}
        <p className={cn("flex items-baseline gap-2 font-display font-extrabold tracking-[-0.04em]", compact ? "mt-1 text-[44px] leading-[.9]" : "mt-2 text-[60px] leading-[.9]")}>
          <span className="sr-only">{night && day?.current ? `${Math.round(day.current.tempC)} degrees now` : `High ${day?.highC == null ? "unknown" : Math.round(day.highC)} degrees, low ${day?.lowC == null ? "unknown" : Math.round(day.lowC)} degrees`}</span>
          <span aria-hidden="true">{deg(high)}</span>
          <span aria-hidden="true" className={cn("font-display font-extrabold tracking-[-0.02em]", compact ? "text-[20px]" : "text-[26px]")}>{night ? "now" : `/ ${deg(day?.lowC ?? null)}`}</span>
        </p>
        <p className={cn("mt-1 flex flex-wrap items-center gap-2", compact ? "text-[17px]" : "text-[20px]")}>
          <span className="font-display font-extrabold tracking-[-0.02em]">{theme.condition}</span>
          {theme.chip ? <Chip className={compact ? "text-[10px]" : undefined}>{theme.chip}</Chip> : null}
        </p>
      </div>

      <div className="relative mt-auto">
        <DaylightBar
          daylight={daylight}
          size={size}
          segmentClass={theme.key === "sunny" ? "bg-wx-sun-disc" : "bg-wx-sunny"}
          trackClass={night ? "bg-wx-night-track border-primary-foreground" : "bg-card"}
          nowPct={night ? nowPctOf(nowLocal) : null}
        />
      </div>
    </section>
  );
}
```

`components/weather/WeatherCardSkeleton.tsx`:

```tsx
import { cn } from "@/lib/cn";

/** Same footprint as the card; canvas bars where the text will be (WEATHER_CARD §6). */
export function WeatherCardSkeleton({ size }: { size: "regular" | "compact" }) {
  const compact = size === "compact";
  const bar = "tp-pulse rounded-full bg-canvas";
  return (
    <div role="status" aria-label="Loading weather" className={cn("relative flex w-full flex-col overflow-hidden border-2 border-border bg-card", compact ? "h-[140px] rounded-[20px] p-[14px_16px] shadow-hard-2" : "h-[236px] rounded-3xl p-[20px_22px] shadow-hard-3")}>
      <span className={cn(bar, "absolute right-4 top-4 rounded-full", compact ? "size-14" : "size-24")} />
      {!compact ? <span className={cn(bar, "h-3 w-[130px]")} /> : null}
      <span className={cn(bar, "mt-3 h-[52px] w-[150px]", compact && "h-9 w-28")} />
      <span className={cn(bar, "mt-3 h-[18px] w-[180px]", compact && "h-3.5 w-32")} />
      <span className={cn(bar, "mt-auto h-3 w-full")} />
    </div>
  );
}
```

- [ ] **Step 7: Run** — `TZ=UTC npx vitest run components/weather` → PASS. Also `npm run lint`.

- [ ] **Step 8: Commit**

```bash
git add components/weather
git commit -m "feat(weather): WeatherCard with CSS scenes, daylight bar and skeleton

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `lib/day-view-model.ts` — pure Day view helpers

**Files:**
- Create: `lib/day-view-model.ts`, `lib/day-view-model.test.ts`

**Interfaces:**
- Consumes: `formatDayLabel`, `formatLongDate`, `addDays`, `daysBetween`, `nightsBetween`, `dayNumberInTrip` from `@/lib/dates`.
- Produces:

```ts
export function dayHeading(dateISO: string, tripStart: string, tripEnd: string): string;
// "Sat 12 Dec"; "Sat 2 Jan 2027" when the trip spans years and the date is outside the first year.
export function dayEyebrow(i: { dayNumber: number; totalDays: number; chapterName: string | null; country: string | null; travelDay: boolean }): string;
// "DAY 9 OF 36 · EUROPE" | "DAY 11 OF 36 · TRAVEL DAY" | "DAY 9 OF 36 · FRANCE" | "DAY 9 OF 36"
export interface SubLineInput { stopName: string | null; country: string | null; zone: string | null; nightOf: { night: number; of: number } | null; travel: { from: string; to: string; toZone: string | null } | null; compact: boolean }
export function daySubLine(i: SubLineInput): string;
// "Strasbourg, France · GMT+1 · night 3 of 4" | phone: "Strasbourg · GMT+1 · night 3 of 4" | travel: "Strasbourg → Colmar · GMT+1" | zone change: "Strasbourg → Colmar · GMT+1 → GMT+2" | no stop: ""
export function nightOfStay(dateISO: string, checkIn: string, checkOut: string): { night: number; of: number } | null; // null when the date is not a night of the stay
export function dayStripWindow(dateISO: string, tripStart: string, tripEnd: string, count: number): string[]; // `count` ISO dates centred on dateISO, clamped to the trip
export function dotsFor(count: number): number; // min(count, 3)
export interface CitySegment { name: string; startIndex: number; span: number; hueIndex: number }
export function citySegments(window: string[], stops: Array<{ name: string; arriveDate: string; departDate: string; sortOrder: number }>): CitySegment[];
// one segment per Stop whose nights intersect the window; a night belongs to the Stop whose [arrive, depart) contains it; hueIndex = the Stop's position in the sorted list
export function planCountLabel(n: number): string; // "Nothing planned yet" | "1 thing" | "3 things"
export interface IdeaRow { id: string; title: string; category: string; hint: string | null; pool: "todo" | "wishlist" }
export function dayIdeasRows(i: { stopName: string; thingsToDo: Array<{ id: string; title: string; category: string; startTime: string | null }>; wishlist: Array<{ id: string; title: string; category: string; distanceKm: number | null; reason: "nearby" | "country" | "unlocated" }>; limit?: number }): { rows: IdeaRow[]; more: number; eyebrow: string | null };
// things to do first, then wishlist; limit 3; eyebrow "IDEAS FOR STRASBOURG" (mixed or todo-only) / "FROM YOUR WISHLIST IN STRASBOURG" (wishlist only) / null (no rows). hint: todo → startTime ("from 12:30") or null; wishlist nearby → "1.2 km away" (or "≈300 m away"), country → "same country", unlocated → null
export function forecastOpensOn(dateISO: string): string; // formatDayLabel(addDays(dateISO, -15))
```

- [ ] **Step 1: Failing tests** — `lib/day-view-model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dayHeading, dayEyebrow, daySubLine, nightOfStay, dayStripWindow, dotsFor, citySegments, planCountLabel, dayIdeasRows, forecastOpensOn } from "@/lib/day-view-model";

const T = { start: "2026-12-04", end: "2027-01-08" };

describe("dayHeading (review focus 1)", () => {
  it("no year inside the first year", () => expect(dayHeading("2026-12-12", T.start, T.end)).toBe("Sat 12 Dec"));
  it("year once the trip crosses into the next", () => expect(dayHeading("2027-01-02", T.start, T.end)).toBe("Sat 2 Jan 2027"));
  it("no year on a single-year trip", () => expect(dayHeading("2026-07-20", "2026-07-10", "2026-07-30")).toBe("Mon 20 Jul"));
});

describe("dayEyebrow", () => {
  it("chapter", () => expect(dayEyebrow({ dayNumber: 9, totalDays: 36, chapterName: "Europe", country: "France", travelDay: false })).toBe("DAY 9 OF 36 · EUROPE"));
  it("travel day wins", () => expect(dayEyebrow({ dayNumber: 11, totalDays: 36, chapterName: "Europe", country: "France", travelDay: true })).toBe("DAY 11 OF 36 · TRAVEL DAY"));
  it("country when no chapter", () => expect(dayEyebrow({ dayNumber: 9, totalDays: 36, chapterName: null, country: "France", travelDay: false })).toBe("DAY 9 OF 36 · FRANCE"));
  it("bare when no stop (review focus 2)", () => expect(dayEyebrow({ dayNumber: 9, totalDays: 36, chapterName: null, country: null, travelDay: false })).toBe("DAY 9 OF 36"));
});

describe("daySubLine", () => {
  const base = { stopName: "Strasbourg", country: "France", zone: "GMT+1", nightOf: { night: 3, of: 4 }, travel: null, compact: false };
  it("desktop", () => expect(daySubLine(base)).toBe("Strasbourg, France · GMT+1 · night 3 of 4"));
  it("phone drops the country", () => expect(daySubLine({ ...base, compact: true })).toBe("Strasbourg · GMT+1 · night 3 of 4"));
  it("travel day", () => expect(daySubLine({ ...base, travel: { from: "Strasbourg", to: "Colmar", toZone: "GMT+1" } })).toBe("Strasbourg → Colmar · GMT+1"));
  it("zone change", () => expect(daySubLine({ ...base, travel: { from: "Paris", to: "Vienna", toZone: "GMT+2" } })).toBe("Paris → Vienna · GMT+1 → GMT+2"));
  it("no stop → empty", () => expect(daySubLine({ ...base, stopName: null, country: null, zone: null, nightOf: null })).toBe(""));
});

describe("nightOfStay (review focus 3)", () => {
  it("counts nights inclusively from check-in", () => {
    expect(nightOfStay("2026-12-12", "2026-12-10", "2026-12-14")).toEqual({ night: 3, of: 4 });
    expect(nightOfStay("2026-12-10", "2026-12-10", "2026-12-14")).toEqual({ night: 1, of: 4 });
  });
  it("check-out day is not a night", () => expect(nightOfStay("2026-12-14", "2026-12-10", "2026-12-14")).toBeNull());
});

describe("dayStripWindow", () => {
  it("centres the date", () => expect(dayStripWindow("2026-12-12", T.start, T.end, 9)).toEqual(["2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13", "2026-12-14", "2026-12-15", "2026-12-16"]));
  it("clamps at the start", () => expect(dayStripWindow("2026-12-05", T.start, T.end, 9)[0]).toBe("2026-12-04"));
  it("clamps at the end", () => expect(dayStripWindow("2027-01-07", T.start, T.end, 9).at(-1)).toBe("2027-01-08"));
  it("shorter trips give fewer chips", () => expect(dayStripWindow("2026-07-12", "2026-07-10", "2026-07-14", 9)).toHaveLength(5));
});

it("dotsFor caps at 3", () => { expect(dotsFor(0)).toBe(0); expect(dotsFor(2)).toBe(2); expect(dotsFor(7)).toBe(3); });

describe("citySegments", () => {
  const stops = [
    { name: "Paris", arriveDate: "2026-12-06", departDate: "2026-12-10", sortOrder: 0 },
    { name: "Strasbourg", arriveDate: "2026-12-10", departDate: "2026-12-13", sortOrder: 1 },
    { name: "Colmar", arriveDate: "2026-12-13", departDate: "2026-12-15", sortOrder: 2 },
  ];
  it("one segment per stop across its nights in the window", () => {
    const w = dayStripWindow("2026-12-12", "2026-12-06", "2026-12-20", 9); // 08..16
    expect(citySegments(w, stops)).toEqual([
      { name: "Paris", startIndex: 0, span: 2, hueIndex: 0 },
      { name: "Strasbourg", startIndex: 2, span: 3, hueIndex: 1 },
      { name: "Colmar", startIndex: 5, span: 2, hueIndex: 2 },
    ]);
  });
});

it("planCountLabel", () => { expect(planCountLabel(0)).toBe("Nothing planned yet"); expect(planCountLabel(1)).toBe("1 thing"); expect(planCountLabel(3)).toBe("3 things"); });

describe("dayIdeasRows (spec decision 5)", () => {
  const todo = [{ id: "a", title: "Cathédrale", category: "SIGHTSEEING", startTime: "12:30" }];
  const wish = [
    { id: "b", title: "Christkindelsmärik", category: "SIGHTSEEING", distanceKm: 0.3, reason: "nearby" as const },
    { id: "c", title: "Petite France walk", category: "WALK", distanceKm: 1.2, reason: "nearby" as const },
    { id: "d", title: "Kehl bridge", category: "SIGHTSEEING", distanceKm: null, reason: "country" as const },
  ];
  it("things to do first, three total, counts the rest", () => {
    const r = dayIdeasRows({ stopName: "Strasbourg", thingsToDo: todo, wishlist: wish });
    expect(r.rows.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(r.more).toBe(1);
    expect(r.eyebrow).toBe("IDEAS FOR STRASBOURG");
    expect(r.rows[0].hint).toBe("from 12:30");
    expect(r.rows[1].hint).toBe("≈300 m away");
    expect(r.rows[2].hint).toBe("1.2 km away");
  });
  it("wishlist only → wishlist eyebrow", () => expect(dayIdeasRows({ stopName: "Strasbourg", thingsToDo: [], wishlist: wish }).eyebrow).toBe("FROM YOUR WISHLIST IN STRASBOURG"));
  it("nothing → no eyebrow", () => expect(dayIdeasRows({ stopName: "Strasbourg", thingsToDo: [], wishlist: [] })).toEqual({ rows: [], more: 0, eyebrow: null }));
});

it("forecastOpensOn is 15 days before", () => expect(forecastOpensOn("2027-01-02")).toBe("Fri 18 Dec"));
```

- [ ] **Step 2: Run** — `TZ=UTC npx vitest run lib/day-view-model.test.ts` → FAIL.

- [ ] **Step 3: Implement `lib/day-view-model.ts`**

```ts
import { addDays, daysBetween, formatDayLabel, formatLongDate, nightsBetween } from "@/lib/dates";

export function dayHeading(dateISO: string, tripStart: string, tripEnd: string): string {
  const spansYears = tripStart.slice(0, 4) !== tripEnd.slice(0, 4);
  return spansYears && dateISO.slice(0, 4) !== tripStart.slice(0, 4) ? formatLongDate(dateISO) : formatDayLabel(dateISO);
}

export function dayEyebrow(i: { dayNumber: number; totalDays: number; chapterName: string | null; country: string | null; travelDay: boolean }): string {
  const head = `DAY ${i.dayNumber} OF ${i.totalDays}`;
  const tail = i.travelDay ? "TRAVEL DAY" : (i.chapterName ?? i.country);
  return tail ? `${head} · ${tail.toUpperCase()}` : head;
}

export interface SubLineInput { stopName: string | null; country: string | null; zone: string | null; nightOf: { night: number; of: number } | null; travel: { from: string; to: string; toZone: string | null } | null; compact: boolean }

export function daySubLine(i: SubLineInput): string {
  if (i.travel) {
    const zone = i.travel.toZone && i.zone && i.travel.toZone !== i.zone ? `${i.zone} → ${i.travel.toZone}` : (i.zone ?? i.travel.toZone);
    return [`${i.travel.from} → ${i.travel.to}`, zone].filter(Boolean).join(" · ");
  }
  if (!i.stopName) return "";
  const place = i.compact || !i.country ? i.stopName : `${i.stopName}, ${i.country}`;
  const night = i.nightOf ? `night ${i.nightOf.night} of ${i.nightOf.of}` : null;
  return [place, i.zone, night].filter(Boolean).join(" · ");
}

export function nightOfStay(dateISO: string, checkIn: string, checkOut: string): { night: number; of: number } | null {
  if (dateISO < checkIn || dateISO >= checkOut) return null;
  return { night: daysBetween(checkIn, dateISO) + 1, of: nightsBetween(checkIn, checkOut) };
}

export function dayStripWindow(dateISO: string, tripStart: string, tripEnd: string, count: number): string[] {
  const total = daysBetween(tripStart, tripEnd) + 1;
  const n = Math.min(count, total);
  let first = daysBetween(tripStart, dateISO) - Math.floor(n / 2);
  first = Math.max(0, Math.min(first, total - n));
  return Array.from({ length: n }, (_, k) => addDays(tripStart, first + k));
}

export const dotsFor = (count: number) => Math.min(count, 3);

export interface CitySegment { name: string; startIndex: number; span: number; hueIndex: number }

export function citySegments(window: string[], stops: Array<{ name: string; arriveDate: string; departDate: string; sortOrder: number }>): CitySegment[] {
  const sorted = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const out: CitySegment[] = [];
  sorted.forEach((s, hueIndex) => {
    let startIndex = -1; let span = 0;
    window.forEach((d, idx) => {
      if (d >= s.arriveDate && d < s.departDate) { if (startIndex < 0) startIndex = idx; span += 1; }
    });
    if (span > 0) out.push({ name: s.name, startIndex, span, hueIndex });
  });
  return out;
}

export const planCountLabel = (n: number) => (n === 0 ? "Nothing planned yet" : n === 1 ? "1 thing" : `${n} things`);

export interface IdeaRow { id: string; title: string; category: string; hint: string | null; pool: "todo" | "wishlist" }

function distanceHint(km: number): string { return km < 1 ? `≈${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`; }

export function dayIdeasRows(i: { stopName: string; thingsToDo: Array<{ id: string; title: string; category: string; startTime: string | null }>; wishlist: Array<{ id: string; title: string; category: string; distanceKm: number | null; reason: "nearby" | "country" | "unlocated" }>; limit?: number }): { rows: IdeaRow[]; more: number; eyebrow: string | null } {
  const limit = i.limit ?? 3;
  const all: IdeaRow[] = [
    ...i.thingsToDo.map((t) => ({ id: t.id, title: t.title, category: t.category, hint: t.startTime ? `from ${t.startTime}` : null, pool: "todo" as const })),
    ...i.wishlist.map((w) => ({ id: w.id, title: w.title, category: w.category, hint: w.reason === "nearby" && w.distanceKm != null ? distanceHint(w.distanceKm) : w.reason === "country" ? "same country" : null, pool: "wishlist" as const })),
  ];
  const rows = all.slice(0, limit);
  if (rows.length === 0) return { rows, more: 0, eyebrow: null };
  const onlyWishlist = rows.every((r) => r.pool === "wishlist");
  const stop = i.stopName.toUpperCase();
  return { rows, more: all.length - rows.length, eyebrow: onlyWishlist ? `FROM YOUR WISHLIST IN ${stop}` : `IDEAS FOR ${stop}` };
}

export const forecastOpensOn = (dateISO: string) => formatDayLabel(addDays(dateISO, -15));
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(day): pure Day view helpers (heading, eyebrow, sub line, strip window, ideas rows)` with the trailer.

---

### Task 8: `lib/day-view-loader.ts` — `getDay()`

**Files:**
- Create: `lib/day-view-loader.ts`, `lib/day-view-loader.test.ts`
- Reference (read, do not edit yet): `app/(app)/trips/[tripId]/day/[date]/page.tsx` — its queries and `buildItinerary` call move here almost verbatim.

**Interfaces:**
- Consumes: Task 7 helpers; `buildItinerary`, `orderDayEntries`, `isFreeFormDay`, `dayHasEntries` from `@/lib/itinerary`; `chapterForDate` from `@/lib/chapters`; `dayIdeasWishlist`, `nearbyWishlistItems` from `@/lib/nearby`; `loadDayTitles`; `groupJournalDayByAuthor`; `canWriteJournal`; `tripTodayISO`; `zoneLabel`; `daylight`, `utcHmToZone`; `getDayWeather` (Task 3); `getWeatherTheme` (Task 4); `itemPhotoUrl`; `flagTightConnections`; `buildDayMapModel`, `buildItemDirections`.
- Produces:

```ts
export interface DayViewData {
  tripId: string; viewerId: string;
  trip: { name: string; startDate: string; endDate: string; homeCurrency: string; homeName: string | null };
  date: string;                 // the effective (clamped) date
  today: string;                // in the trip's zone
  isToday: boolean;
  phase: TripPhase;
  dayNumber: number; totalDays: number;
  heading: string;              // dayHeading
  eyebrow: string;              // dayEyebrow
  subLine: string; subLineCompact: string;
  isFirst: boolean; isLast: boolean; prevDate: string | null; nextDate: string | null;
  stop: { id: string; name: string; country: string | null; countryCode: string | null; timezone: string; lat: number | null; lng: number | null } | null;
  travelDay: boolean;
  dayTitle: string | null;
  plan: DayPlan; ordered: OrderedDay; hasEntries: boolean; freeForm: boolean; planCount: number;
  editor: DayEntryEditor; itemDirections: Record<string, ItemDirections>; attachmentsByTarget: Record<string, AttachmentView[]>;
  stopOptions: Array<{ id: string; name: string; arriveDate: string | null }>;
  ideas: ReturnType<typeof dayIdeasRows>;   // rows/more/eyebrow (every phase — ADR 0044 amendment)
  nearby: NearbyResult[];                   // planned-day nearby rail (unchanged behaviour)
  tonight: { id: string; name: string; nightOf: { night: number; of: number }; checkOut: string } | null;
  strip: { dates: Array<{ iso: string; count: number; isCurrent: boolean; isToday: boolean }>; segments: CitySegment[] };
  journal: { open: boolean; mine: { body: string; updatedAt: Date | null; photo: AttachmentView | null; extraPhotos: AttachmentView[]; hiddenFromShares: boolean } | null; others: Array<{ authorId: string; body: string; updatedAt: Date; author: TravellerLike | null; photos: AttachmentView[] }> };
  feasibility: Array<{ severity: string; message: string }>;
  weatherInput: { lat: number; lng: number; timezone: string } | null; // for the Suspense island
}
export async function getDay(tripId: string, dateParam: string, viewerId: string): Promise<DayViewData | "invalid" | "out-of-range" | "dateless">;

/** Separate, awaited inside a Suspense boundary (DAY_VIEW §4). */
export interface DayWeatherView { theme: WeatherTheme; day: DayWeather | null; daylight: DaylightView; nowLocal: string | null; forecastOpensOn: string | null; dateLabel: string; placeName: string }
export async function getDayWeatherView(i: { lat: number; lng: number; timezone: string; dateISO: string; today: string; placeName: string }): Promise<DayWeatherView | null>;
```

- [ ] **Step 1: Failing tests** — `lib/day-view-loader.test.ts`. Mirror the mocking approach at the top of the existing `app/(app)/trips/[tripId]/day/[date]/page.test.tsx` (per-model `vi.fn()`s for `db.trip.findUnique`, `db.stop.findMany`, `db.item.findMany`, `db.item.groupBy`, `db.transport.findMany`, `db.accommodation.findMany`, `db.journalEntry.findMany`, `db.attachment.findMany`, `db.cost.findMany`, `db.dayTitle.findMany`, `db.chapter.findMany`; mock `@/lib/tz` `todayISOInZone` and `@/lib/trip-today`). Keep `@/lib/itinerary`, `@/lib/day-view-model`, `@/lib/nearby`, `@/lib/dates` real. Cases:

```ts
it("returns 'invalid' for a malformed date and 'dateless' for a trip without dates");
it("clamps a date inside the 2-day buffer to the trip range and returns 'out-of-range' beyond it");
it("Strasbourg 2026-12-12: heading, eyebrow with the chapter, sub line with night 3 of 4, tonight card, strip of 9 with counts from groupBy", ...)
  // trip 2026-12-04..2027-01-08, chaptersEnabled true, chapter "Europe" 2026-12-06..2027-01-06;
  // stop Strasbourg arrive 12-10 depart 12-13 (Europe/Paris); accommodation checkIn 12-10 checkOut 12-14 "Hôtel Cour du Corbeau";
  // groupBy resolves [{ date: "2026-12-11", _count: { _all: 3 } }] → strip entry for 12-11 has count 3, 12-12 has 0
  // expect eyebrow "DAY 9 OF 36 · EUROPE", subLine "Strasbourg, France · CET · night 3 of 4" (zoneLabel gives "CET" for Europe/Paris in Dec — assert with the real zoneLabel value), tonight.nightOf {3,4}
it("a travel day (transport departing that date) sets travelDay and the → sub line");
it("Day ideas in every phase: planning-phase free-form day fetches things to do and returns three rows (ADR 0044 amendment)");
it("a gap day (no stop) has stop null, weatherInput null, ideas empty (review focus 2)");
it("journal is closed on a future date and open on the day");
```

Write each with concrete fixtures; the exact assertions above are the contract.

- [ ] **Step 2: Run** → FAIL (module missing).

- [ ] **Step 3: Implement**

Move the query block and the derivations from the current page into `getDay` (same selects, same `buildItinerary` input, same editor/attachments/day-map/nearby/feasibility/journal code), then add:

```ts
// eyebrow: chapter only when chapters are on
const chapters = trip.chaptersEnabled
  ? await db.chapter.findMany({ where: { tripId, ...REAL_PLAN }, select: { id: true, name: true, colour: true, startDate: true, endDate: true, sortOrder: true } })
  : [];
const chapter = chapters.length ? chapterForDate(effectiveDate, chapters) : null;
const travelDay = dayPlan.transportEntries.length > 0;
const dep = dayPlan.transportEntries.find((e) => e.kind === "transport-departure");
const travel = dep ? { from: stopById.get(dep.transport.fromStopId ?? "")?.name ?? dep.transport.depPlace ?? trip.homeName ?? "Home", to: stopById.get(dep.transport.toStopId ?? "")?.name ?? dep.transport.arrPlace ?? trip.homeName ?? "Home", toZone: zoneLabel(stopById.get(dep.transport.toStopId ?? "")?.timezone, effectiveDate) } : null;
// tonight
const tonightRaw = accommodations.find((a) => a.checkIn <= effectiveDate && a.checkOut > effectiveDate) ?? null;
const tonight = tonightRaw ? { id: tonightRaw.id, name: tonightRaw.name, nightOf: nightOfStay(effectiveDate, tonightRaw.checkIn, tonightRaw.checkOut)!, checkOut: tonightRaw.checkOut } : null;
// strip
const windowDates = dayStripWindow(effectiveDate, trip.startDate, trip.endDate, 9);
const counts = await db.item.groupBy({ by: ["date"], where: { tripId, ...REAL_PLAN, date: { in: windowDates } }, _count: { _all: true } });
const countByDate = new Map(counts.map((c) => [c.date as string, c._count._all]));
const strip = {
  dates: windowDates.map((iso) => ({ iso, count: countByDate.get(iso) ?? 0, isCurrent: iso === effectiveDate, isToday: iso === today })),
  segments: citySegments(windowDates, stops.map((s) => ({ name: s.name, arriveDate: s.arriveDate!, departDate: s.departDate!, sortOrder: s.sortOrder }))),
};
// ideas — every phase now
const thingsToDo = freeForm && dayStop ? await db.item.findMany({ where: { tripId, ...REAL_PLAN, ...THINGS_TO_DO_WHERE, stopId: dayStop.id }, orderBy: { sortOrder: "asc" }, select: { id: true, title: true, category: true, startTime: true } }) : [];
const ideas = freeForm && dayStop ? dayIdeasRows({ stopName: dayStop.name, thingsToDo, wishlist: dayIdeasWishlist({ stop: dayStop, candidates: wishlist }) }) : { rows: [], more: 0, eyebrow: null };
```

`today` = `tripTodayISO(stops)` (stops already carry `sortOrder`/`timezone`/dates). `isToday = today === effectiveDate`. `heading = dayHeading(...)`, `eyebrow = dayEyebrow({ dayNumber: dayNumberInTrip(effectiveDate, trip.startDate), totalDays: daysBetween(trip.startDate, trip.endDate) + 1, chapterName: chapter?.name ?? null, country: dayStop?.country ?? null, travelDay })`, `subLine = daySubLine({...compact:false})`, `subLineCompact = daySubLine({...compact:true})` with `zone = dayStop ? zoneLabel(dayStop.timezone, effectiveDate) : null` and `nightOf = tonight?.nightOf ?? null`. `planCount = ordered.entries.length + ordered.anytime.length`.

`getDayWeatherView`: `daylight(lat,lng,date)` → convert with `utcHmToZone` as the page does today; `daysOut = daysBetween(today, dateISO)`; `day = await getDayWeather({ lat, lng, dateISO, today, withCurrent: daysOut === 0 })`; `theme = getWeatherTheme({ day, daysOut, isToday: daysOut === 0, monthShort: MONTH_SHORT_OF(dateISO) })` (month from `formatDayLabel(dateISO).split(" ")[2]`); return null when theme is null; `nowLocal` = `instantToZonedTime(new Date(), timezone)` from `@/lib/tz` when `daysOut === 0` else null; `forecastOpensOn = theme.key === "too-far" ? forecastOpensOn(dateISO) : null`; `dateLabel = formatDayLabel(dateISO)`.

- [ ] **Step 4: Run** — `TZ=UTC npx vitest run lib/day-view-loader.test.ts` → PASS.

- [ ] **Step 5: Commit** `feat(day): getDay loader for the Day view` with the trailer.

---

### Task 9: Day strip and the client islands (keyboard, swipe, ideas rows)

**Files:**
- Create: `components/trip/day/day-strip.tsx` (client), `components/trip/day/day-strip.test.tsx`
- Create: `components/trip/day/day-keyboard-nav.tsx` (client), `components/trip/day/day-swipe.tsx` (client), `components/trip/day/day-nav-islands.test.tsx`
- Create: `components/trip/day/day-ideas-rows.tsx` (client), `components/trip/day/day-ideas-rows.test.tsx`

**Interfaces:**
- Consumes: `CitySegment`, `IdeaRow`, `dotsFor` (Task 7); `stopDotClass` from `@/lib/stop-colours`; `categoryClasses` from `@/lib/categories`; `scheduleItem` from `@/server/actions/items`; `toast` from `@/components/ui/use-toast`.
- Produces:

```ts
export function DayStrip(p: { tripId: string; dates: Array<{ iso: string; count: number; isCurrent: boolean; isToday: boolean }>; segments: CitySegment[]; size: "desktop" | "phone" }): JSX.Element;
// desktop: grid of N equal columns (9, 7 at tablet via `md:grid-cols-7 lg:grid-cols-9` when N=9), city line under; phone: 48×58 chips, scroll-snap, bleeds right, scrollLeft to current on mount, no city line
export function DayKeyboardNav(p: { prevHref: string | null; nextHref: string | null }): null; // ← → keys, not while typing
export function DaySwipe(p: { prevHref: string | null; nextHref: string | null; children: React.ReactNode }): JSX.Element; // 40px threshold, ignores gestures starting in [data-day-strip] or [data-journal]
export function DayIdeasRows(p: { tripId: string; date: string; dateLabel: string; rows: IdeaRow[]; more: number; eyebrow: string | null; seeAllHref: string; size: "desktop" | "phone" }): JSX.Element | null;
```

- [ ] **Step 1: Failing tests — strip**

`components/trip/day/day-strip.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DayStrip } from "@/components/trip/day/day-strip";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

const dates = ["2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13"].map((iso, i) => ({ iso, count: [1, 1, 3, 0, 2][i], isCurrent: iso === "2026-12-12", isToday: iso === "2026-12-11" }));
const segments = [{ name: "Paris", startIndex: 0, span: 1, hueIndex: 0 }, { name: "Strasbourg", startIndex: 1, span: 4, hueIndex: 1 }];

describe("DayStrip", () => {
  it("is a nav of day links with aria-current=date on the current chip", () => {
    render(<DayStrip tripId="t1" dates={dates} segments={segments} size="desktop" />);
    const nav = screen.getByRole("navigation", { name: "Days" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links[3]).toHaveAttribute("href", "/trips/t1/day/2026-12-12");
    expect(links[3]).toHaveAttribute("aria-current", "date");
    expect(links[3].className).toContain("bg-coral");
    expect(links[2].className).not.toContain("bg-coral");
  });
  it("shows weekday, date and up to three dots", () => {
    render(<DayStrip tripId="t1" dates={dates} segments={segments} size="desktop" />);
    const fri = screen.getByRole("link", { name: /Fri 11 Dec, 3 things planned/ });
    expect(within(fri).getByText("FRI")).toBeInTheDocument();
    expect(within(fri).getByText("11")).toBeInTheDocument();
    expect(fri.querySelectorAll("[data-dot]")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Sat 12 Dec, nothing planned/ }).querySelectorAll("[data-dot]")).toHaveLength(0);
  });
  it("underlines the real today", () => {
    render(<DayStrip tripId="t1" dates={dates} segments={segments} size="desktop" />);
    expect(screen.getByRole("link", { name: /Fri 11 Dec/ }).querySelector("[data-today-underline]")).toBeTruthy();
  });
  it("desktop shows the city line with one segment per stop; phone hides it", () => {
    const { unmount } = render(<DayStrip tripId="t1" dates={dates} segments={segments} size="desktop" />);
    expect(screen.getByText("Paris")).toBeInTheDocument();
    expect(screen.getByText("Strasbourg").closest("[data-city-segment]")).toHaveStyle({ gridColumn: "2 / span 4" });
    unmount();
    render(<DayStrip tripId="t1" dates={dates} segments={segments} size="phone" />);
    expect(screen.queryByText("Paris")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Days" }).className).toContain("snap-x");
  });
});
```

- [ ] **Step 2: Failing tests — islands**

`components/trip/day/day-nav-islands.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { DayKeyboardNav } from "@/components/trip/day/day-keyboard-nav";
import { DaySwipe } from "@/components/trip/day/day-swipe";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("DayKeyboardNav", () => {
  beforeEach(() => push.mockClear());
  it("← and → navigate", () => {
    render(<DayKeyboardNav prevHref="/p" nextHref="/n" />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(push.mock.calls.map((c) => c[0])).toEqual(["/n", "/p"]);
  });
  it("does nothing while typing or at the boundary", () => {
    render(<><DayKeyboardNav prevHref={null} nextHref="/n" /><textarea aria-label="j" /></>);
    fireEvent.keyDown(screen.getByLabelText("j"), { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(push).not.toHaveBeenCalled();
  });
});

describe("DaySwipe", () => {
  beforeEach(() => push.mockClear());
  const swipe = (el: Element, from: number, to: number) => {
    fireEvent.touchStart(el, { touches: [{ clientX: from, clientY: 100 }] });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: to, clientY: 100 }] });
  };
  it("a left swipe over 40px goes to the next day; a short one does nothing", () => {
    render(<DaySwipe prevHref="/p" nextHref="/n"><p>body</p></DaySwipe>);
    swipe(screen.getByText("body"), 200, 100);
    expect(push).toHaveBeenCalledWith("/n");
    swipe(screen.getByText("body"), 200, 180);
    expect(push).toHaveBeenCalledTimes(1);
  });
  it("ignores gestures that start in the strip or the journal", () => {
    render(<DaySwipe prevHref="/p" nextHref="/n"><div data-day-strip><span>strip</span></div><div data-journal><span>journal</span></div></DaySwipe>);
    swipe(screen.getByText("strip"), 200, 100);
    swipe(screen.getByText("journal"), 100, 200);
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Failing tests — ideas rows**

`components/trip/day/day-ideas-rows.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DayIdeasRows } from "@/components/trip/day/day-ideas-rows";

const scheduleItem = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/server/actions/items", () => ({ scheduleItem: (...a: unknown[]) => scheduleItem(...a) }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));

const rows = [
  { id: "b", title: "Christkindelsmärik", category: "SIGHTSEEING", hint: "≈300 m away", pool: "wishlist" as const },
  { id: "a", title: "Cathédrale", category: "SIGHTSEEING", hint: "from 12:30", pool: "todo" as const },
];

describe("DayIdeasRows", () => {
  it("renders the eyebrow, list items and accessible add buttons", () => {
    render(<DayIdeasRows tripId="t1" date="2026-12-12" dateLabel="Sat 12 Dec" rows={rows} more={2} eyebrow="IDEAS FOR STRASBOURG" seeAllHref="/trips/t1/wishlist" size="desktop" />);
    expect(screen.getByText("IDEAS FOR STRASBOURG")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add Christkindelsmärik to Sat 12 Dec" })).toHaveTextContent("+ Add");
    expect(screen.getByRole("link", { name: /See all/ })).toHaveAttribute("href", "/trips/t1/wishlist");
  });
  it("phone: the add control is a 44px square", () => {
    render(<DayIdeasRows tripId="t1" date="2026-12-12" dateLabel="Sat 12 Dec" rows={rows} more={0} eyebrow="IDEAS FOR STRASBOURG" seeAllHref="/x" size="phone" />);
    expect(screen.getByRole("button", { name: "Add Cathédrale to Sat 12 Dec" }).className).toContain("size-11");
  });
  it("+ Add schedules the item on the date with no time", async () => {
    render(<DayIdeasRows tripId="t1" date="2026-12-12" dateLabel="Sat 12 Dec" rows={rows} more={0} eyebrow="x" seeAllHref="/x" size="desktop" />);
    fireEvent.click(screen.getByRole("button", { name: "Add Christkindelsmärik to Sat 12 Dec" }));
    await waitFor(() => expect(scheduleItem).toHaveBeenCalledWith("b", { date: "2026-12-12" }));
  });
  it("renders nothing with no rows", () => {
    const { container } = render(<DayIdeasRows tripId="t1" date="d" dateLabel="d" rows={[]} more={0} eyebrow={null} seeAllHref="/x" size="desktop" />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 4: Run all three** → FAIL (modules missing).

- [ ] **Step 5: Implement `day-strip.tsx`**

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatDayLabel, parseISODate } from "@/lib/dates";
import { stopDotClass } from "@/lib/stop-colours";
import { dotsFor, type CitySegment } from "@/lib/day-view-model";

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function DayStrip({ tripId, dates, segments, size }: { tripId: string; dates: Array<{ iso: string; count: number; isCurrent: boolean; isToday: boolean }>; segments: CitySegment[]; size: "desktop" | "phone" }) {
  const phone = size === "phone";
  const scroller = React.useRef<HTMLElement>(null);

  // Phone: put the current chip in view with scrollLeft (not scrollIntoView — DAY_VIEW §3.3).
  React.useEffect(() => {
    if (!phone || !scroller.current) return;
    const el = scroller.current.querySelector<HTMLElement>('[aria-current="date"]');
    if (el) scroller.current.scrollLeft = el.offsetLeft - 18;
  }, [phone]);

  const onWheel = (e: React.WheelEvent) => {
    if (!scroller.current || e.deltaY === 0 || e.deltaX !== 0) return;
    scroller.current.scrollLeft += e.deltaY;
  };

  const n = dates.length;
  return (
    <div data-day-strip className={cn("flex flex-col gap-2", phone && "-mr-[18px]")}>
      <nav
        ref={scroller}
        aria-label="Days"
        onWheel={phone ? undefined : onWheel}
        className={cn(
          phone
            ? "flex snap-x snap-mandatory gap-2 overflow-x-auto pr-[18px] [scrollbar-width:none]"
            : "grid gap-2 overflow-x-auto [scrollbar-width:none]",
        )}
        style={phone ? undefined : { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {dates.map((d) => {
          const dt = parseISODate(d.iso);
          const dots = dotsFor(d.count);
          const label = `${formatDayLabel(d.iso)}, ${d.count === 0 ? "nothing planned" : `${d.count} ${d.count === 1 ? "thing" : "things"} planned`}`;
          return (
            <Link
              key={d.iso}
              href={`/trips/${tripId}/day/${d.iso}`}
              aria-current={d.isCurrent ? "date" : undefined}
              aria-label={label}
              className={cn(
                "relative flex shrink-0 snap-start flex-col items-center justify-center rounded-[14px] border-2 border-border text-foreground",
                phone ? "h-[58px] w-12" : "h-[62px] min-w-0",
                d.isCurrent ? "island bg-coral shadow-hard-1" : "bg-card",
              )}
            >
              <span className="text-[11px] font-bold leading-none">{WEEKDAY[dt.getUTCDay()]}</span>
              <span className="mt-0.5 font-display text-[20px] font-extrabold leading-none">{dt.getUTCDate()}</span>
              <span className="mt-1 flex h-1.5 gap-1">
                {Array.from({ length: dots }, (_, i) => <span key={i} data-dot className="size-1.5 rounded-full bg-current" />)}
              </span>
              {d.isToday ? <span data-today-underline aria-hidden="true" className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-coral" /> : null}
            </Link>
          );
        })}
      </nav>
      {!phone && segments.length > 0 ? (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden="true">
          {segments.map((s) => (
            <div key={`${s.name}-${s.startIndex}`} data-city-segment className="flex min-w-0 items-center gap-1.5" style={{ gridColumn: `${s.startIndex + 1} / span ${s.span}` }}>
              <span className={cn("size-2 shrink-0 rounded-full border border-border", stopDotClass(s.hueIndex))} />
              <span className="truncate text-xs font-bold text-foreground">{s.name}</span>
              <span className="h-0.5 min-w-2 flex-1 rounded-full bg-border-soft" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

`day-keyboard-nav.tsx`:

```tsx
"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

/** ← / → change day (DAY_VIEW §2), never while typing or inside a dialog. */
export function DayKeyboardNav({ prevHref, nextHref }: { prevHref: string | null; nextHref: string | null }) {
  const router = useRouter();
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (TYPING.test(t.tagName) || t.isContentEditable || t.closest("[role=dialog]"))) return;
      if (e.key === "ArrowRight" && nextHref) router.push(nextHref);
      else if (e.key === "ArrowLeft" && prevHref) router.push(prevHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prevHref, nextHref]);
  return null;
}
```

`day-swipe.tsx`:

```tsx
"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

const THRESHOLD = 40;

/** Horizontal swipe on the page body changes day (DAY_VIEW §3.4). */
export function DaySwipe({ prevHref, nextHref, children }: { prevHref: string | null; nextHref: string | null; children: React.ReactNode }) {
  const router = useRouter();
  const start = React.useRef<{ x: number; y: number; ignore: boolean } | null>(null);
  const [leaving, setLeaving] = React.useState<"left" | "right" | null>(null);
  return (
    <div
      className={cn("transition-[transform,opacity] duration-150 motion-reduce:transition-none", leaving === "left" && "-translate-x-6 opacity-0", leaving === "right" && "translate-x-6 opacity-0")}
      onTouchStart={(e) => {
        const t = e.target as HTMLElement;
        start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ignore: !!t.closest("[data-day-strip],[data-journal]") };
      }}
      onTouchEnd={(e) => {
        const s = start.current; start.current = null;
        if (!s || s.ignore) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) < THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
        const href = dx < 0 ? nextHref : prevHref;
        if (!href) return;
        setLeaving(dx < 0 ? "left" : "right");
        router.push(href);
      }}
    >
      {children}
    </div>
  );
}
```

`day-ideas-rows.tsx`:

```tsx
"use client";
import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { categoryClasses } from "@/lib/categories";
import type { IdeaRow } from "@/lib/day-view-model";
import { scheduleItem } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";

/** The empty day's Day ideas (spec decision 5, ADR 0044 amendment): three rows, "+ Add" schedules with no time. */
export function DayIdeasRows({ tripId, date, dateLabel, rows, more, eyebrow, seeAllHref, size }: { tripId: string; date: string; dateLabel: string; rows: IdeaRow[]; more: number; eyebrow: string | null; seeAllHref: string; size: "desktop" | "phone" }) {
  const [pending, setPending] = React.useState<string | null>(null);
  const [, start] = React.useTransition();
  if (rows.length === 0) return null;
  const phone = size === "phone";
  function add(row: IdeaRow) {
    setPending(row.id);
    start(async () => {
      try {
        const r = await scheduleItem(row.id, { date });
        if (r.success) toast({ title: `Added to ${dateLabel}`, description: row.title });
        else toast({ variant: "destructive", title: "Couldn't add it", description: r.errors ? Object.values(r.errors)[0]?.[0] : undefined });
      } finally { setPending(null); }
    });
  }
  return (
    <div className="flex flex-col gap-2.5">
      {eyebrow ? <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{eyebrow}</p> : null}
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 rounded-2xl border-2 border-border bg-card px-3 py-2.5">
            <span aria-hidden="true" className={cn("grid size-10 shrink-0 place-items-center rounded-xl border-2 border-border", categoryClasses(row.category).fill, "text-on-accent")}>
              <span className="size-2.5 rounded-full bg-current" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold text-foreground">{row.title}</span>
              {row.hint ? <span className="block truncate text-[13px] text-muted-foreground">{row.hint}</span> : null}
            </span>
            <button
              type="button"
              aria-label={`Add ${row.title} to ${dateLabel}`}
              disabled={pending === row.id}
              onClick={() => add(row)}
              className={cn("pressable inline-flex shrink-0 items-center justify-center rounded-full border-2 border-border bg-card font-extrabold text-foreground shadow-[2px_2px_0_hsl(var(--shadow-ink))] disabled:opacity-50", phone ? "size-11 rounded-xl" : "h-[34px] px-3 text-[13px]")}
            >
              {phone ? <Plus className="size-5" aria-hidden="true" /> : "+ Add"}
            </button>
          </li>
        ))}
      </ul>
      {more > 0 ? <Link href={seeAllHref} className="text-[13px] font-bold text-foreground underline underline-offset-2">See all ({more} more)</Link> : null}
    </div>
  );
}
```

(Use the category's lucide icon instead of the dot if `categoryMeta(category).icon` maps cleanly via the same `CATEGORY_ICON` table `components/trip/timeline.tsx` keeps — export that table from timeline.tsx as `CATEGORY_ICON` and import it here; otherwise keep the dot. Prefer the icon: the handoff shows icons in the tiles.)

- [ ] **Step 6: Run** — `TZ=UTC npx vitest run components/trip/day` → PASS. `npm run lint`.

- [ ] **Step 7: Commit** `feat(day): day strip, keyboard and swipe navigation, Day ideas rows` with the trailer.

---

### Task 10: The Day view page — desktop and phone

**Files:**
- Rewrite: `app/(app)/trips/[tripId]/day/[date]/page.tsx`
- Rewrite: `app/(app)/trips/[tripId]/day/[date]/page.test.tsx`
- Rewrite: `app/(app)/trips/[tripId]/day/[date]/loading.tsx`
- Create: `components/trip/day/day-header.tsx`, `components/trip/day/day-plan-card.tsx`, `components/trip/day/tonight-card.tsx`, `components/trip/day/journal-card.tsx`, `components/trip/day/day-weather.tsx`, and tests `components/trip/day/tonight-card.test.tsx`, `components/trip/day/journal-card.test.tsx`, `components/trip/day/day-header.test.tsx`
- Modify: `components/shell/app-paths.ts` (add `isTripDayPath`), `components/shell/app-paths.test.ts`, `components/trip/trip-header-frame.tsx` (hide at lg on day pages too)
- Modify: `components/trip/item-form-dialog.tsx` (`AddItemButton` gains `defaultDate?: string` passed to `ItemFormDialog`)
- Modify: `components/trip/timeline.tsx` (`variant="day"`: 40px `rounded-xl` tile, 46px time column at 13px extrabold, 2px solid `border-border-soft` dividers)
- Delete: `components/trip/day-nav.tsx` and its test (no other callers after this task — verify with grep)

**Interfaces:**
- Consumes: `getDay`, `getDayWeatherView`, `DayViewData` (Task 8); `DayStrip`, `DayKeyboardNav`, `DaySwipe`, `DayIdeasRows` (Task 9); `WeatherCard`, `WeatherCardSkeleton` (Task 6); `Timeline`; `JournalEditor`, `JournalEntryView`; `AddItemButton`; `NotificationBell`, `TravellerAvatar`; `getUnreadActivityCount`, `getRecentActivity` from `@/server/actions/activity`; `TRAVELLER_SELECT`.
- Produces:

```ts
// app-paths.ts
export function isTripDayPath(path: string | null): boolean; // /trips/:id/day and /trips/:id/day/:date
// day-header.tsx (server)
export function DayHeader(p: { tripId: string; eyebrow: string; heading: string; subLine: string; subLineCompact: string; dayTitle: string | null; prevHref: string | null; nextHref: string | null; prevLabel: string | null; nextLabel: string | null; unreadCount: number; recent: RecentActivity[]; members: TravellerLike[]; addButton: React.ReactNode }): JSX.Element;
// tonight-card.tsx (server)
export function TonightCard(p: { tripId: string; tonight: DayViewData["tonight"]; isLastDay: boolean; stopId: string | null; size: "desktop" | "phone" }): JSX.Element | null;
// journal-card.tsx (server)
export function JournalCard(p: { tripId: string; date: string; dateLabel: string; journal: DayViewData["journal"]; className?: string }): JSX.Element;
// day-plan-card.tsx (server)
export function DayPlanCard(p: { data: DayViewData; size: "desktop" | "phone"; addButton: React.ReactNode }): JSX.Element;
// day-weather.tsx (server, async) — awaited inside <Suspense fallback={<WeatherCardSkeleton size=…/>}>
export async function DayWeather(p: { input: NonNullable<DayViewData["weatherInput"]>; dateISO: string; today: string; placeName: string; size: "regular" | "compact" }): Promise<JSX.Element | null>;
```

- [ ] **Step 1: Failing tests — small components**

`components/trip/day/tonight-card.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TonightCard } from "@/components/trip/day/tonight-card";
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }));

const tonight = { id: "acc1", name: "Hôtel Cour du Corbeau", nightOf: { night: 3, of: 4 }, checkOut: "2026-12-14" };

describe("TonightCard", () => {
  it("names the bed, the night and the check-out day, and links to the stay", () => {
    render(<TonightCard tripId="t1" tonight={tonight} isLastDay={false} stopId="s1" size="desktop" />);
    expect(screen.getByText("TONIGHT")).toBeInTheDocument();
    expect(screen.getByText("Hôtel Cour du Corbeau")).toBeInTheDocument();
    expect(screen.getByText("Night 3 of 4 · check-out Mon 14 Dec")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/trips/t1/plan#accommodation-acc1");
    expect(screen.getByRole("link").className).toContain("bg-lilac");
  });
  it("no bed → 'No bed yet' and an add link to the Plan at that Stop", () => {
    render(<TonightCard tripId="t1" tonight={null} isLastDay={false} stopId="s1" size="desktop" />);
    expect(screen.getByText("No bed yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+ Add a stay" })).toHaveAttribute("href", "/trips/t1/plan#stop-s1");
  });
  it("hidden on the last day", () => {
    const { container } = render(<TonightCard tripId="t1" tonight={tonight} isLastDay stopId="s1" size="desktop" />);
    expect(container.firstChild).toBeNull();
  });
});
```

`components/trip/day/journal-card.test.tsx` (mock `@/components/trip/journal-editor` to `({ date }) => <div data-testid="editor">{date}</div>` and `@/components/trip/journal-entry-view` to `({ body }) => <p>{body}</p>`):

```tsx
it("future date: 'Opens on the day' and the honest copy, no editor", () => {
  render(<JournalCard tripId="t1" date="2026-12-12" dateLabel="Sat 12 Dec" journal={{ open: false, mine: null, others: [] }} />);
  expect(screen.getByRole("heading", { name: "Journal" })).toBeInTheDocument();
  expect(screen.getByText("Opens on the day")).toBeInTheDocument();
  expect(screen.getByText("Come back on Sat 12 Dec to jot down a memory.")).toBeInTheDocument();
  expect(screen.queryByTestId("editor")).toBeNull();
});
it("on the day: the editor, and co-travellers' entries above it", () => {
  render(<JournalCard tripId="t1" date="2026-12-12" dateLabel="Sat 12 Dec" journal={{ open: true, mine: { body: "", updatedAt: null, photo: null, extraPhotos: [], hiddenFromShares: false }, others: [{ authorId: "u2", body: "Snow!", updatedAt: new Date(), author: null, photos: [] }] }} />);
  expect(screen.getByTestId("editor")).toHaveTextContent("2026-12-12");
  expect(screen.getByText("Snow!")).toBeInTheDocument();
  expect(screen.queryByText("Opens on the day")).toBeNull();
});
```

`components/trip/day/day-header.test.tsx` (mock `next/link` as above; mock `@/components/trip/notification-bell` to a `<button aria-label="Notifications">` stub):

```tsx
it("h1 is the date; eyebrow and sub line; arrows are links with day labels; disabled at the boundary", () => {
  render(<DayHeader tripId="t1" eyebrow="DAY 9 OF 36 · EUROPE" heading="Sat 12 Dec" subLine="Strasbourg, France · CET · night 3 of 4" subLineCompact="Strasbourg · CET · night 3 of 4" dayTitle={null} prevHref="/trips/t1/day/2026-12-11" nextHref={null} prevLabel="Previous day: Fri 11 Dec" nextLabel={null} unreadCount={0} recent={[]} members={[]} addButton={<button>+ Add to this day</button>} />);
  expect(screen.getByRole("heading", { level: 1, name: "Sat 12 Dec" })).toBeInTheDocument();
  expect(screen.getByText("DAY 9 OF 36 · EUROPE")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Previous day: Fri 11 Dec" })).toHaveAttribute("href", "/trips/t1/day/2026-12-11");
  expect(screen.getByLabelText("Next day")).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByText("Strasbourg, France · CET · night 3 of 4").className).toContain("md:block");
  expect(screen.getByText("Strasbourg · CET · night 3 of 4").className).toContain("md:hidden");
});
```

`components/shell/app-paths.test.ts`: add

```ts
it("isTripDayPath", () => {
  expect(isTripDayPath("/trips/t1/day")).toBe(true);
  expect(isTripDayPath("/trips/t1/day/2026-12-12")).toBe(true);
  expect(isTripDayPath("/trips/t1/calendar")).toBe(false);
  expect(isTripDayPath(null)).toBe(false);
});
```

- [ ] **Step 2: Failing test — the page**

Rewrite `app/(app)/trips/[tripId]/day/[date]/page.test.tsx`: mock `@/lib/day-view-loader` (`getDay`, `getDayWeatherView`), `@/lib/guards`, `@/server/actions/activity` (`getUnreadActivityCount` → 4, `getRecentActivity` → []), `@/lib/db` (`db.trip.findUnique` → members/name), `next/navigation` (`notFound`, `redirect`), `next/link`, and the client islands (`DayStrip` → `<nav aria-label="Days"/>`, `DayKeyboardNav` → null, `DaySwipe` → children, `DayIdeasRows` → `<ul data-testid="ideas">…rows.length</ul>`, `JournalEditor`, `AddItemButton` → `<button>{label}</button>`, `@/components/weather/WeatherCard` → `<section aria-label="Weather"/>`). Build one fixture `DayViewData` (Strasbourg 12 Dec, empty day with 3 ideas, tonight set, journal closed) and vary it per case:

```ts
it("renders the h1 date, the strip, the plan card empty state with three idea rows, tonight and the future journal", ...)
  // getByRole("heading", { level: 1, name: "Sat 12 Dec" }); getByRole("navigation", { name: "Days" }); getByText("Nothing planned yet"); getByTestId("ideas") has 3; getByText("Hôtel Cour du Corbeau"); getByText("Opens on the day"); getByText("Weather by Open-Meteo")
it("with items renders the Timeline and the count, and the dashed row reads '+ Add to this day' on phone / '+ Add something else · a place, an activity, a note' on desktop")
it("no ideas → 'Nothing planned yet. Add a place, an activity or a note.'")
it("gap day (stop null): no weather section, no tonight card (review focus 2)")
it("travel day: eyebrow 'DAY 11 OF 36 · TRAVEL DAY' and the arrow sub line (review focus 3)")
it("last day hides Tonight")
it("calls notFound for 'invalid'/'out-of-range' and redirects a 'dateless' trip to the Plan")
```

- [ ] **Step 3: Run** all new tests → FAIL.

- [ ] **Step 4: Implement the pieces**

`components/shell/app-paths.ts`:

```ts
/** The Day view: /trips/:id/day and /trips/:id/day/:date. */
export function isTripDayPath(path: string | null): boolean {
  if (!isTripPath(path)) return false;
  const seg = path!.replace(/\/+$/, "").split("/");
  return seg[3] === "day" && seg.length <= 5;
}
```

`components/trip/trip-header-frame.tsx`: `const hideAtLg = isTripHomePath(pathname) || isTripDayPath(pathname);` and use it for `lg:hidden` and the data attribute (`data-trip-home` stays for Home; add `data-trip-day`).

`components/trip/item-form-dialog.tsx` `AddItemButton`: add `defaultDate?: string` to its props and pass `defaultDate={defaultDate}` into `<ItemFormDialog>`.

`components/trip/timeline.tsx`: thread `variant` into `DayRow`/`TimeGutter`/`Tile` (they are module-private, so add a `dense?: boolean` or read `variant` via a React context created in the file). For `variant === "day"`: `TimeGutter` → `w-[46px] text-[13px] font-extrabold text-foreground`; `Tile` → `size-10 rounded-xl` with `size-[18px]` icon; `DayRow` divider → `border-t-2 border-border-soft` (solid). Keep the agenda variant pixel-identical; add one test in `components/trip/timeline.test.tsx` asserting a `variant="day"` tile has `size-10`.

`components/trip/day/day-header.tsx`:

```tsx
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TravellerLike } from "@/lib/traveller";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { NotificationBell, type RecentActivity } from "@/components/trip/notification-bell";

const ARROW = "pressable inline-grid size-11 shrink-0 place-items-center rounded-xl border-2 border-border bg-card text-foreground shadow-hard-1";
const ARROW_OFF = "inline-grid size-11 shrink-0 place-items-center rounded-xl border-2 border-border bg-card text-foreground opacity-40";

function Arrow({ href, label, dir }: { href: string | null; label: string | null; dir: "prev" | "next" }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  if (!href) return <span aria-label={dir === "prev" ? "Previous day" : "Next day"} aria-disabled="true" className={ARROW_OFF}><Icon className="size-5" strokeWidth={2.5} aria-hidden="true" /></span>;
  return <Link href={href} aria-label={label ?? undefined} className={ARROW}><Icon className="size-5" strokeWidth={2.5} aria-hidden="true" /></Link>;
}

export function DayHeader({ tripId, eyebrow, heading, subLine, subLineCompact, dayTitle, prevHref, nextHref, prevLabel, nextLabel, unreadCount, recent, members, addButton }: { /* as in Interfaces */ }) {
  return (
    <header className="flex items-end gap-4">
      <div className="flex min-w-0 flex-1 items-center justify-center gap-3.5 md:justify-start">
        <Arrow href={prevHref} label={prevLabel} dir="prev" />
        <div className="flex min-w-0 flex-col items-center text-center md:items-start md:text-left">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground md:text-[11px]">{eyebrow}</p>
          {dayTitle ? <p className="text-sm font-bold text-muted-foreground">{dayTitle}</p> : null}
          <h1 className="font-display text-[30px] font-extrabold leading-none tracking-[-0.02em] text-foreground md:text-[40px]">{heading}</h1>
          {subLine ? <p className="hidden text-[15px] font-semibold text-foreground md:block">{subLine}</p> : null}
          {subLineCompact ? <p className="text-[13px] font-semibold text-foreground md:hidden">{subLineCompact}</p> : null}
        </div>
        <Arrow href={nextHref} label={nextLabel} dir="next" />
      </div>
      <div className="hidden shrink-0 items-center gap-2.5 lg:flex">
        <NotificationBell tripId={tripId} unreadCount={unreadCount} recent={recent} />
        {members.length > 0 ? (
          <Link href={`/trips/${tripId}/settings#travellers`} aria-label={`Trip members (${members.length})`} className="inline-flex min-h-11 items-center rounded-full px-1">
            <span className="flex -space-x-2.5">{members.slice(0, 5).map((m) => <TravellerAvatar key={m.id} traveller={m} size={40} className="border-2 border-border" />)}</span>
          </Link>
        ) : null}
        {addButton}
      </div>
    </header>
  );
}
```

`components/trip/day/tonight-card.tsx`:

```tsx
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDayLabel } from "@/lib/dates";
import type { DayViewData } from "@/lib/day-view-loader";

export function TonightCard({ tripId, tonight, isLastDay, stopId, size }: { tripId: string; tonight: DayViewData["tonight"]; isLastDay: boolean; stopId: string | null; size: "desktop" | "phone" }) {
  if (isLastDay) return null;
  const phone = size === "phone";
  const shell = cn("island flex flex-col gap-1 rounded-3xl border-2 border-border bg-lilac text-on-accent", phone ? "p-[14px_16px] shadow-hard-2" : "p-[18px_22px] shadow-hard-3");
  const eyebrow = <p className="text-[11px] font-extrabold uppercase tracking-[0.08em]">Tonight</p>;
  if (!tonight) {
    return (
      <div className={shell}>
        {eyebrow}
        <p className={cn("font-display font-extrabold", phone ? "text-[18px]" : "text-[20px]")}>No bed yet</p>
        <Link href={`/trips/${tripId}/plan${stopId ? `#stop-${stopId}` : ""}`} className="text-[13px] font-bold underline underline-offset-2">+ Add a stay</Link>
      </div>
    );
  }
  return (
    <Link href={`/trips/${tripId}/plan#accommodation-${tonight.id}`} className={cn(shell, "pressable")}>
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          {eyebrow}
          <span className={cn("block truncate font-display font-extrabold", phone ? "text-[18px]" : "text-[20px]")}>{tonight.name}</span>
          <span className="block text-[13px] font-semibold">{`Night ${tonight.nightOf.night} of ${tonight.nightOf.of} · check-out ${formatDayLabel(tonight.checkOut)}`}</span>
        </span>
        <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
      </span>
    </Link>
  );
}
```

(If the Plan page has no `#accommodation-…` / `#stop-…` anchors, link to `/trips/${tripId}/plan` and note it in the commit; grep `id={\`stop-` in `components/trip/itinerary-manager.tsx` first — beta-feedback §G added Stop anchors.)

`components/trip/day/journal-card.tsx`:

```tsx
import { cn } from "@/lib/cn";
import { JournalEditor } from "@/components/trip/journal-editor";
import { JournalEntryView } from "@/components/trip/journal-entry-view";
import type { DayViewData } from "@/lib/day-view-loader";

export function JournalCard({ tripId, date, dateLabel, journal, className }: { tripId: string; date: string; dateLabel: string; journal: DayViewData["journal"]; className?: string }) {
  return (
    <section data-journal aria-labelledby="journal-heading" className={cn("flex flex-col gap-3 rounded-3xl border-2 border-border bg-card p-[18px_22px] shadow-hard-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="journal-heading" className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-foreground">Journal</h2>
        {!journal.open ? <span className="text-[13px] font-semibold text-muted-foreground">Opens on the day</span> : null}
      </div>
      {!journal.open ? (
        <p className="text-sm font-medium text-muted-foreground">Come back on {dateLabel} to jot down a memory.</p>
      ) : null}
      {journal.others.map((o) => <JournalEntryView key={o.authorId} body={o.body} updatedAt={o.updatedAt} author={o.author} photos={o.photos} framed={false} />)}
      {journal.open && journal.mine ? (
        <JournalEditor tripId={tripId} date={date} initialBody={journal.mine.body} updatedAt={journal.mine.updatedAt} photo={journal.mine.photo} extraPhotos={journal.mine.extraPhotos} hiddenFromShares={journal.mine.hiddenFromShares} framed={false} />
      ) : null}
    </section>
  );
}
```

`components/trip/day/day-plan-card.tsx`: white card (`rounded-3xl border-2 border-border bg-card shadow-hard-3 p-[22px_24px]` desktop; `rounded-[20px] shadow-hard-2 p-4` phone), `flex flex-col gap-3.5 min-h-0`. Header: `<h2 class="font-display text-[22px] font-extrabold">Day plan</h2>` + `<span class="text-[13px] font-semibold text-muted-foreground">{planCountLabel(data.planCount)}</span>`. Body (desktop `overflow-y-auto min-h-0 flex-1`): `hasEntries ? <Timeline day={plan} variant="day" itemDirections attachmentsByTarget showUnschedule editor /> : ideas.rows.length ? <DayIdeasRows …/> : <p class="text-sm text-muted-foreground">Nothing planned yet. Add a place, an activity or a note.</p>`. Footer `mt-auto`: the `addButton` rendered as a dashed row — pass `AddItemButton` with `variant="dashed"`, `className="h-[52px] w-full rounded-2xl border-2 border-dashed border-border text-sm font-extrabold text-foreground"` and `label` = desktop: "+ Add something else · a place, an activity, a note"; phone: hasEntries ? "+ Add to this day" : "+ Add something else". (`AddItemButton` already prefixes a Plus icon; pass the label without the leading "+" and let the icon carry it, OR hide the icon — keep the icon and drop the "+" from the label strings.)

`components/trip/day/day-weather.tsx`:

```tsx
import { WeatherCard } from "@/components/weather/WeatherCard";
import { getDayWeatherView } from "@/lib/day-view-loader";

export async function DayWeather({ input, dateISO, today, placeName, size }: { input: { lat: number; lng: number; timezone: string }; dateISO: string; today: string; placeName: string; size: "regular" | "compact" }) {
  const v = await getDayWeatherView({ ...input, dateISO, today, placeName });
  if (!v) return null;
  return <WeatherCard size={size} dateLabel={v.dateLabel} placeName={v.placeName} theme={v.theme} day={v.day} daylight={v.daylight} nowLocal={v.nowLocal} forecastOpensOn={v.forecastOpensOn} />;
}
```

`app/(app)/trips/[tripId]/day/[date]/page.tsx` (new):

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { dayTitle } from "@/lib/page-title";
import { formatDayLabel } from "@/lib/dates";
import { TRAVELLER_SELECT } from "@/lib/traveller";
import { getDay } from "@/lib/day-view-loader";
import { getUnreadActivityCount, getRecentActivity } from "@/server/actions/activity";
import { AddItemButton } from "@/components/trip/item-form-dialog";
import { WeatherCardSkeleton } from "@/components/weather/WeatherCardSkeleton";
import { DayHeader } from "@/components/trip/day/day-header";
import { DayStrip } from "@/components/trip/day/day-strip";
import { DayKeyboardNav } from "@/components/trip/day/day-keyboard-nav";
import { DaySwipe } from "@/components/trip/day/day-swipe";
import { DayPlanCard } from "@/components/trip/day/day-plan-card";
import { TonightCard } from "@/components/trip/day/tonight-card";
import { JournalCard } from "@/components/trip/day/journal-card";
import { DayWeather } from "@/components/trip/day/day-weather";

export async function generateMetadata({ params }: { params: Promise<{ tripId: string; date: string }> }): Promise<Metadata> {
  const { date } = await params;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { title: dayTitle(date) } : {};
}

export default async function DayPage({ params }: { params: Promise<{ tripId: string; date: string }> }) {
  const { tripId, date } = await params;
  const { user } = await requireTripAccess(tripId);
  // Policy: this dated view always shows the real plan and ignores ?plan=.
  const [data, unreadCount, recent, trip] = await Promise.all([
    getDay(tripId, date, user.id),
    getUnreadActivityCount(tripId),
    getRecentActivity(tripId, 10),
    db.trip.findUnique({ where: { id: tripId }, select: { members: { select: { user: { select: TRAVELLER_SELECT } } } } }),
  ]);
  if (data === "dateless") redirect(`/trips/${tripId}/plan`);
  if (data === "invalid" || data === "out-of-range") notFound();
  const d = data;
  const base = `/trips/${tripId}`;
  const prevHref = d.prevDate ? `${base}/day/${d.prevDate}` : null;
  const nextHref = d.nextDate ? `${base}/day/${d.nextDate}` : null;
  const dateLabel = formatDayLabel(d.date);
  const add = (size: "desktop" | "phone") => (
    <AddItemButton tripId={tripId} stops={d.stopOptions} tripStartDate={d.date} defaultDate={d.date} defaultUnscheduled={false} homeCurrency={d.trip.homeCurrency}
      label={size === "desktop" ? "Add something else · a place, an activity, a note" : d.hasEntries ? "Add to this day" : "Add something else"}
      variant="dashed" size="md" className={size === "desktop" ? "h-[52px] w-full rounded-2xl border-border text-sm font-extrabold text-foreground" : "h-12 w-full rounded-2xl border-border text-sm font-extrabold text-foreground"} />
  );
  const headerAdd = (
    <AddItemButton tripId={tripId} stops={d.stopOptions} tripStartDate={d.date} defaultDate={d.date} defaultUnscheduled={false} homeCurrency={d.trip.homeCurrency} label="Add to this day" variant="primary" size="md" className="h-11 rounded-full px-5 text-sm font-extrabold" />
  );
  const weather = (size: "regular" | "compact") => d.weatherInput && d.stop ? (
    <Suspense fallback={<WeatherCardSkeleton size={size} />}>
      <DayWeather input={d.weatherInput} dateISO={d.date} today={d.today} placeName={d.stop.name} size={size} />
    </Suspense>
  ) : null;

  return (
    <DaySwipe prevHref={prevHref} nextHref={nextHref}>
      <DayKeyboardNav prevHref={prevHref} nextHref={nextHref} />
      <div className="flex flex-col gap-3.5 lg:gap-[18px]">
        <DayHeader tripId={tripId} eyebrow={d.eyebrow} heading={d.heading} subLine={d.subLine} subLineCompact={d.subLineCompact} dayTitle={d.dayTitle}
          prevHref={prevHref} nextHref={nextHref} prevLabel={d.prevDate ? `Previous day: ${formatDayLabel(d.prevDate)}` : null} nextLabel={d.nextDate ? `Next day: ${formatDayLabel(d.nextDate)}` : null}
          unreadCount={unreadCount} recent={recent} members={(trip?.members ?? []).map((m) => m.user)} addButton={headerAdd} />
        <div className="md:hidden"><DayStrip tripId={tripId} dates={d.strip.dates} segments={d.strip.segments} size="phone" /></div>
        <div className="hidden md:block"><DayStrip tripId={tripId} dates={d.strip.dates} segments={d.strip.segments} size="desktop" /></div>
        <div className="md:hidden">{weather("compact")}</div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3.5 lg:grid-cols-[7fr_5fr] lg:gap-[18px]">
          <div className="md:hidden"><DayPlanCard data={d} size="phone" addButton={add("phone")} /></div>
          <div className="hidden md:block"><DayPlanCard data={d} size="desktop" addButton={add("desktop")} /></div>
          <div className="flex min-h-0 flex-col gap-3.5 lg:gap-[18px]">
            <div className="hidden md:block">{weather("regular")}</div>
            <div className="md:hidden"><TonightCard tripId={tripId} tonight={d.tonight} isLastDay={d.isLast} stopId={d.stop?.id ?? null} size="phone" /></div>
            <div className="hidden md:block"><TonightCard tripId={tripId} tonight={d.tonight} isLastDay={d.isLast} stopId={d.stop?.id ?? null} size="desktop" /></div>
            <JournalCard tripId={tripId} date={d.date} dateLabel={dateLabel} journal={d.journal} className="flex-1" />
            <p className="text-[11px] font-semibold text-muted-foreground">
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">Weather by Open-Meteo</a>
            </p>
          </div>
        </div>
      </div>
    </DaySwipe>
  );
}
```

Rendering both phone and desktop variants and hiding one with `md:hidden`/`hidden md:block` is the same pattern the Home route uses (`lg:hidden` phone tree + `hidden lg:flex` desktop). Keep `<DayStrip>` client work cheap: the hidden one still mounts; that's acceptable here.

`loading.tsx`:

```tsx
import { WeatherCardSkeleton } from "@/components/weather/WeatherCardSkeleton";
export default function DayLoading() {
  const bar = "tp-pulse rounded-full bg-canvas";
  return (
    <div role="status" aria-label="Loading day" className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-2"><span className={`${bar} h-3 w-32`} /><span className={`${bar} h-10 w-56`} /><span className={`${bar} h-4 w-72`} /></div>
      <div className="grid grid-cols-9 gap-2">{Array.from({ length: 9 }, (_, i) => <span key={i} className={`${bar} h-[62px] rounded-[14px]`} />)}</div>
      <div className="grid gap-[18px] lg:grid-cols-[7fr_5fr]">
        <div className="h-[480px] rounded-3xl border-2 border-border bg-card p-6"><span className={`${bar} h-6 w-28`} /></div>
        <div className="flex flex-col gap-[18px]"><WeatherCardSkeleton size="regular" /><span className={`${bar} h-24 rounded-3xl`} /></div>
      </div>
    </div>
  );
}
```

Delete `components/trip/day-nav.tsx` and `components/trip/day-nav.test.tsx` after `grep -rn "day-nav" app components lib` shows no other importers.

- [ ] **Step 5: Run** — `TZ=UTC npx vitest run components/trip/day components/shell/app-paths.test.ts components/trip/trip-header-frame components/trip/timeline "app/(app)/trips/[tripId]/day"` → PASS. Then `npm run lint` and `npx tsc --noEmit`.

- [ ] **Step 6: Commit** `feat(day): redesigned Day view — header, strip, plan card, weather, tonight, journal` with the trailer.

---

### Task 11: Visual check against the handoff images, then the full gate

**Files:**
- Create (scratchpad, not committed): a screenshot script driven with `tsx` that imports `scripts/lib/audit-browser.ts` helpers.
- Modify: whatever the comparison shows is off (Day view components, Home tiles), plus `docs/specs/2026-09-27-day-view-weather-card.md` §D notes if a deviation is accepted.

Playwright is installed globally (`npm root -g` lists it) and Postgres at `host.docker.internal:5432` is reachable. `ALLOW_DEV_LOGIN` must be `true` in `.env.local` for the audit sign-in.

- [ ] **Step 1: Seed and run**

```bash
npm run db:seed:real            # Christmas in Europe 2026 for the dev account
npm run dev &                   # http://localhost:3000
```

Wait for "Ready", then find the trip id: `curl -s -c /tmp/c http://localhost:3000/trips | grep -o 'trips/[a-z0-9]\{20,\}' | head -1` (or via the seeded output).

- [ ] **Step 2: Screenshot**

Write `/tmp/claude-1000/-work/<session>/scratchpad/shots.ts` using `scripts/lib/audit-browser.ts`'s launch + dev sign-in helpers (read that file's exported functions first) to capture, light theme:

| URL | Viewport | Compare with |
|---|---|---|
| `/trips/<id>` | 1440×900 | `images/home-desktop-photo.png` or `home-desktop-no-photo.png` |
| `/trips/<id>/day/2026-12-12` | 1440×900 | `images/day-desktop.png` |
| `/trips/<id>/day/2026-12-12` | 390×844 | `images/day-mobile-empty.png` |
| `/trips/<id>/day/2026-12-14` | 390×844 | `images/day-mobile-planned.png` |
| `/trips/<id>/day/2026-12-06` (Munich, fog/snow likely typical) | 1440×900 | `images/weather-core.png` |

Run with `npx tsx <script>`; view each PNG with the Read tool beside its handoff image.

- [ ] **Step 3: Fix visible deviations**

Compare card radii, shadows, type sizes, the strip, the weather scene placement, the Tonight card, the Journal card, and Home's tiles against the images. Also check on the 390px shots that the floating feedback button clears the tab bar by 24px (DAY_VIEW §1) and adjust its inset in `components/feedback/` if it overlaps. Two deviations are already accepted and go straight into §D: the strip shows 9 chips at every width from md up (the handoff's 7-at-tablet is dropped), and the phone tab bar has no Today item. Fix each deviation in the component that owns it, re-run the affected tests, re-screenshot. Record any deliberate deviation (e.g. no "Today" tab on phone, no "Usually" line) under a new "## D. Accepted deviations" heading in `docs/specs/2026-09-27-day-view-weather-card.md`.

- [ ] **Step 4: Full gate**

```bash
TZ=UTC npm test
npm run lint
npx tsc --noEmit
```

All green. Kill the dev server.

- [ ] **Step 5: Commit**

```bash
git add -A components app lib docs/specs
git commit -m "fix(day): align Day view and Home with the 2026-09-27 handoff images

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
