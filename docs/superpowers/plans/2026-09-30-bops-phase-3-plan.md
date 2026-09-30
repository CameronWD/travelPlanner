# Phase 3 — Plan redesign, Checklists, Calendar, Wishlist — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Plan page's presentation to the 2026-09-30 handoff: a PageHeader, folded stop rows that open into a stay/ideas strip, a day strip and a selected-day panel, leg pills between stops, dashed Home base bookends, a sticky rail with a mini map, Fit tile and Jump list on desktop, and a mobile list with five sheets (stop, pick a day, add a stop, fill a leg, stop actions). Then remove the Checklists booking-parser tab, add counts and restyle Reminders, and give Calendar and Wishlist their PageHeader and empty-state copy. Motion last.

**Architecture:** The page (`app/(app)/trips/[tripId]/plan/page.tsx`) stays a Server Component with the same queries. It wraps everything in a new client provider, `PlanBody` (`components/plan/plan-body.tsx`), which owns the fold state (the open set of stops), the selected day per stop, the `#open=…&day=…` / `#stop-<id>` hash and a small actions registry. The registry lets the server-rendered header buttons ("+ Add a stop", Chapters) and the rail's Jump list call handlers that live in `ItineraryManager`. `ItineraryManager` keeps every piece of state, every handler, dnd-kit and every dialog it has today. Only its render changes: it now composes new presentational components from `components/plan/` (StopRow, LegPill, StopOpenBody, DayStrip, SelectedDay and so on) that take data plus callbacks. It renders two lists, a desktop list (`hidden lg:flex`, the only one with `id="stop-<id>"`) and a mobile list (`lg:hidden`, ids `m-stop-<id>`), each in its own `DndContext` that shares the same handlers. The rail (mini map, Fit tile, Jump list) is rendered by the page next to the list. Pure logic (leg labels, day slots, stop actions, hash, plan model) lives in `lib/plan/` and `components/plan/stop-actions.ts` and is fully unit-tested.

**Tech Stack:** Next.js 16 App Router (**this version differs from your training data: read `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` ("Native History API") before Task 6 and Task 18, and `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` before Task 16**), React 19, Tailwind v4, Radix (dialog, dropdown, popover, toggle-group, select), `@dnd-kit/core` 6 + `@dnd-kit/sortable` 10, `motion` 12 (`motion/react`), lucide-react, Vitest + Testing Library (jsdom).

**Spec:** `docs/specs/2026-09-30-budget-onboard-plan-share.md` §D and the Phase 3 row. The handoff is `design_handoff/budget-onboard-plan-share/plan-share-audit-handoff/PLAN.md` (all of it), `MOTION.md` rows P1–P13, and the Checklists, Calendar and Wishlist rows of `AUDIT.md`. Images: `plan-share-audit-handoff/images/plan-desktop.png`, `plan-desktop-long-stop.png`, `plan-mobile.png`, `plan-mobile-editing.png`. The spec wins where it and the handoff differ.

## Global Constraints

- Work only on branch `feat/budget-onboard-plan-share-2026-09-30` (already checked out in /work). Never commit to `main`, never push, never deploy, never run any `feedback:*` script.
- If `node`/`npm` isn't on PATH: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use`.
- Every commit message ends with these two lines:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8`
- No `Resolves-Feedback:` trailers (the inbox is empty).
- Tests: `npm test -- <path>` (sets TZ=UTC). Before each commit `npx tsc --noEmit` and `npm run lint` must be clean.
- Tokens only, no raw hex in components; 2px ink borders + hard shadows; `shadow-soft`, `shadow-soft-lg`, `border-border/70`, `bg-card/40` must not appear in any touched file (extend the existing ban assertions to new components). `formatMoney()` for money; `formatDay()/formatRange()/formatDateRange*` for dates, never ISO. Chips/pills `whitespace-nowrap shrink-0`. Touch targets ≥44px on mobile. `tabular-nums` on amounts/times. Respect reduced motion. lucide icons, not unicode glyphs.
- Do not add npm dependencies unless the task says so (check `package.json` — `motion`, dnd-kit, Radix, react-day-picker may already be present; verify). **Verified:** `motion` 12, `@dnd-kit/core`/`sortable`/`utilities` and the Radix packages are present. No task in this phase adds a dependency.
- Comment only a non-obvious why.

Phase-specific constraints:

- **Consume Phases 1–2 exactly as named:** `PageHeader` / `PageHeaderProps` from `components/ui/page-header.tsx`; `TripHeaderTrailing({ tripId, slug })` from `components/trip/trip-header-trailing.tsx`; `isPageHeaderPath` (and its `PAGE_HEADER_ROUTES` list) in `components/shell/app-paths.ts`; `RangeCalendar` from `components/ui/range-calendar.tsx`; `PlaceCombobox` / `PickedPlace` from `components/ui/place-combobox.tsx`. Read each file before using it. If a prop you need is missing, stop and report; don't change another phase's component.
- **This phase produces** `lib/scroll-to.ts` → `export function scrollToId(id: string, opts?: { reduced?: boolean; offset?: number }): void` (Task 4). Phase 4 consumes it. Do not rename it.
- **Token names in this repo differ from the handoff's:** the handoff's `shadow-1`…`shadow-5` are the utilities `shadow-hard-1`…`shadow-hard-5`. There is no `shadow-4` utility. `shadow-cta`, `shadow-pressed`, `pressable`, `tap-target`, `tp-rise-in`, `tp-pop`, `tp-pop-in`, `tp-pop-out`, `tp-wiggle`, `tp-slide-up`, `tp-slide-down` and `tp-toast-in` exist in `app/globals.css`. The colours `bg-teal`, `bg-sun`, `bg-coral`, `text-coral-text`, `text-teal-text`, `text-sun-text` and `text-on-accent-muted` exist.
- **Date helpers in this repo:** the handoff's `formatDay()` / `formatRange()` don't exist. Use `formatDayLabel` ("Fri 11 Dec"), `formatDateRange`, `formatDateRangeCompact` ("10–15 Dec") and `formatLongDate` from `lib/dates.ts`, plus the new `formatStayRange` ("Tue 15 – Tue 22 Dec") from `lib/plan/plan-model.ts` (Task 5).
- **Breakpoints:** the desktop list and rail start at `lg` (1024px). The rail is 280px at `lg` and 320px from `xl` (1280px). Below `lg` the mobile list and sheets apply (PLAN.md §1.2, "Below 1024").
- **Data layer unchanged** (spec D, PLAN.md intro). The one exception: the page's existing `db.trip.findUnique` select gains `name`, `homeLat` and `homeLng`, and the page also calls `tripSlugFor(tripId)` and `isAiConfigured()`. Checklists and Calendar add `name` to their trip select for the eyebrow.
- **Deliberate deviations (decided here, don't re-litigate):**
  1. There is no server action that reorders Items within a day, so **selected-day rows are draggable onto strip slots only**. They don't re-order within the day. Rows show in `buildStopDays` order: timed by time, then untimed.
  2. **Leg pills are not draggable.** The transport `SortableContext` and the `activeType === "transport"` branch of `handleDragEnd` are removed. A leg's slot is still set through the transport sheet's existing "Position in plan" select, which shows in edit mode.
  3. **Dated stops keep their drag handle** (ADR 0021), but it only shows on hover or focus (`pointer-fine:opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100`). Rough stops always show it, as mocked.
  4. **Chapter groups no longer collapse.** They are a divider row (PLAN.md §1.3). The `collapsedGroups` localStorage state and its tests are deleted.
  5. **The chapters on/off switch moves to Settings** (Cam's decision, 2026-09-30). Settings gets an always-visible "Group this trip into chapters" `Switch` calling `setChaptersEnabled`, with the Chapters card below it only when on (Task 21a). The Plan header's **Chapters** pill then renders **only when `chaptersEnabled`**, exactly as PLAN.md §1.1, and offers New chapter and Suggest from countries — no "Turn off chapters" / "Group into chapters…" items anywhere on Plan.
  6. **Mobile keeps Chapters and Paste a booking reachable** as two quiet outline pills after the mobile list (`lg:hidden`). PageHeader collapses them away on mobile.
  7. **Firm up survives.** "Firm up all stops" becomes a slim dashed sun row at the top of the list whenever rough stops exist, and rough chapter dividers carry a "Firm up" pill. The ungrouped per-segment "Firm up" button is dropped: the whole-trip one covers it.
  8. **The transport sheet's Paste a booking** swaps the sheet over to the existing `AiBookingParser`. That component takes only `tripId`/`aiConfigured`, so it isn't "pre-scoped to this leg".
- **New files live in** `components/plan/` (UI) and `lib/plan/` (pure). Every test file for a new component asserts, on its rendered HTML, `expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/)`. The source scan in `components/plan/banned-classes.test.ts` (Task 3) must list every file this phase touches. Each task adds its files to that list.

## Review Focus

1. **A changeover day belongs to two stops** (ADR 0049). The slot shows in both strips, with an `ArrowRight` before the day name on the arriving stop. A plan dragged onto a slot moves only within the strip it came from, so dropping onto another stop's strip is a no-op. Expectation: `daySlots` flags `changeover: "arrive" | "depart"`, and the drop handler compares `active.data.stopId` with `over.data.stopId`. Tests: Task 2 "flags the changeover days from the neighbours" and Task 13 "a drop on another stop's slot does nothing".
2. **The hash states coexist.** `#stop-<id>` (from Home's route map, the Day view's Tonight card and "Sort these out") wins: it opens that stop and rings it. `#open=a,b&day=…` restores the fold state. On a phone the desktop row is `display:none`, so the ring and scroll go to `m-stop-<id>`. Tests: Task 4 "a #stop- hash wins" and Task 6 "on mount, #stop-<id> opens and rings that stop; falls back to the mobile row when the desktop one is hidden".
3. **Rough stops are different everywhere.** No day strip, no stay chip on the folded row, "Needs dates first" in the open body, no leg pill between two rough stops (only a dashed line), and "Move up / Move down / Give it dates" in place of "Adjust dates / Pin / Make rough". Tests: Task 1 `legSlotKind` "line", Task 3 rough groups, Task 7 rough row, Task 12 rough body.
4. **Undo after a drag onto a slot restores the prior date *and* times**, including an untimed item: no `startTime` key is sent when there was none. Test: Task 13 "undo calls scheduleItem with the prior date and times".
5. **Every Fit state renders.** `ok`, `approaching` with 0 spare ("right on it"), `over` (with Make it fit and "RUNS OVER"), `unset` (the HardEndDateControl trigger) and `dormant`, with singular/plural "night(s)". The live region is the words only, never the control. Tests: Task 5 `fitTileModel` table and Task 14 "over renders Make it fit and a live region without the control".

---

### Task 1: `legLabel` — the words on a leg pill

**Files:**
- Create: `lib/plan/leg-label.ts`
- Test: `lib/plan/leg-label.test.ts`

**Interfaces:**
- Consumes: `TRANSPORT_MODE_META`, `formatDuration` (`lib/transport.ts`); `transportTimeDisplay` (`lib/time-display.ts`); `formatDayLabel` (`lib/dates.ts`); `TransportMode` (`lib/enums.ts`).
- Produces:
  - `interface LegTransport { mode: TransportMode; depPlace?: string | null; arrPlace?: string | null; depAt?: Date | null; arrAt?: Date | null; fromStopId?: string | null; toStopId?: string | null; depIsHome?: boolean | null; arrIsHome?: boolean | null; driveEstimate?: { minutes: number; roadKm: number } | null }`
  - `interface LegStop { id: string; name: string; timezone: string | null; arriveDate: string | null; departDate: string | null }`
  - `interface LegLabel { icon: LucideIcon | null; label: string; sub: string; missing: boolean; accessibleName: string }`
  - `placeCode(place: string): string`
  - `legLabel(t: LegTransport, stops: readonly LegStop[], homeName?: string | null): LegLabel`
  - `missingLegLabel(from: { name: string }, to: { name: string }): LegLabel`
  - `legSlotKind(from: { arriveDate: string | null }, to: { arriveDate: string | null }, legCount: number): "legs" | "missing" | "line"`

- [ ] **Step 1: Write the failing test** — `lib/plan/leg-label.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Car, Plane, Train } from "lucide-react";
import { legLabel, legSlotKind, missingLegLabel, placeCode } from "./leg-label";

const PARIS = { id: "p", name: "Paris", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-15" };
const ROME = { id: "r", name: "Rome", timezone: "Europe/Rome", arriveDate: "2026-12-15", departDate: "2026-12-22" };
const FLORENCE = { id: "f", name: "Florence", timezone: "Europe/Rome", arriveDate: "2026-12-22", departDate: "2026-12-27" };
const MUNICH = { id: "m", name: "Munich", timezone: null, arriveDate: null, departDate: null };
const STOPS = [PARIS, ROME, FLORENCE, MUNICH];

describe("placeCode", () => {
  it("pulls a three-letter code out of a place, else keeps the place", () => {
    expect(placeCode("Paris CDG")).toBe("CDG");
    expect(placeCode("FCO")).toBe("FCO");
    expect(placeCode("Roma Termini")).toBe("Roma Termini");
  });
});

describe("legLabel", () => {
  it("timed: mode + codes, the departure day and time in the departure zone", () => {
    const l = legLabel(
      { mode: "FLIGHT", depPlace: "Paris CDG", arrPlace: "Rome FCO", depAt: new Date("2026-12-15T09:05:00Z"), arrAt: new Date("2026-12-15T11:10:00Z"), fromStopId: "p", toStopId: "r" },
      STOPS,
    );
    expect(l).toMatchObject({ icon: Plane, label: "Flight CDG → FCO", sub: "Tue 15 Dec 10:05", missing: false });
    expect(l.accessibleName).toBe("Flight from Paris to Rome, Tuesday 15 December 10:05. Edit.");
  });

  it("timed with no places: falls back to the stop names", () => {
    const l = legLabel(
      { mode: "TRAIN", depAt: new Date("2026-12-22T08:00:00Z"), arrAt: new Date("2026-12-22T09:40:00Z"), fromStopId: "r", toStopId: "f" },
      STOPS,
    );
    expect(l.label).toBe("Train Rome → Florence");
    expect(l.sub).toBe("Tue 22 Dec 09:00");
  });

  it("a car with no times reads Drive with the drive estimate", () => {
    const l = legLabel({ mode: "CAR", fromStopId: "r", toStopId: "f", driveEstimate: { minutes: 200, roadKm: 240 } }, STOPS);
    expect(l).toMatchObject({ icon: Car, label: "Drive", sub: "~3h 20m · 240 km" });
    expect(l.accessibleName).toBe("Drive from Rome to Florence, ~3h 20m · 240 km. Edit.");
  });

  it("a car with no times and no estimate falls back to the change-over date", () => {
    expect(legLabel({ mode: "CAR", fromStopId: "r", toStopId: "f" }, STOPS).sub).toBe("Tue 22 Dec");
  });

  it("not a car, no times: the mode and the date only", () => {
    const l = legLabel({ mode: "TRAIN", fromStopId: "r", toStopId: "f" }, STOPS);
    expect(l).toMatchObject({ icon: Train, label: "Train", sub: "Tue 22 Dec" });
    expect(l.accessibleName).toBe("Train from Rome to Florence, Tuesday 22 December. Edit.");
  });

  it("names the Home base for a home endpoint and dates it by the arriving stop", () => {
    const l = legLabel({ mode: "FLIGHT", depIsHome: true, toStopId: "p" }, STOPS, "Sydney");
    expect(l.sub).toBe("Thu 10 Dec");
    expect(l.accessibleName).toBe("Flight from Sydney to Paris, Thursday 10 December. Edit.");
  });

  it("no endpoints known: just the mode", () => {
    const l = legLabel({ mode: "BUS" }, STOPS);
    expect(l.label).toBe("Bus");
    expect(l.sub).toBe("");
    expect(l.accessibleName).toBe("Bus. Edit.");
  });
});

describe("missingLegLabel", () => {
  it("asks how you're getting to the next stop", () => {
    expect(missingLegLabel({ name: "Rome" }, { name: "Florence" })).toEqual({
      icon: null,
      label: "How are you getting to Florence?",
      sub: "Add",
      missing: true,
      accessibleName: "Add transport from Rome to Florence",
    });
  });
});

describe("legSlotKind", () => {
  it("legs when any exist, missing between two dated stops, a bare line otherwise", () => {
    expect(legSlotKind(PARIS, ROME, 1)).toBe("legs");
    expect(legSlotKind(PARIS, ROME, 0)).toBe("missing");
    expect(legSlotKind(FLORENCE, MUNICH, 0)).toBe("line");
    expect(legSlotKind(MUNICH, MUNICH, 2)).toBe("legs");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- lib/plan/leg-label.test.ts`
Expected: FAIL, "Cannot find module './leg-label'".

- [ ] **Step 3: Implement** — `lib/plan/leg-label.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import type { TransportMode } from "@/lib/enums";
import { TRANSPORT_MODE_META, formatDuration } from "@/lib/transport";
import { transportTimeDisplay } from "@/lib/time-display";
import { formatDayLabel } from "@/lib/dates";

export interface LegTransport {
  mode: TransportMode;
  depPlace?: string | null;
  arrPlace?: string | null;
  depAt?: Date | null;
  arrAt?: Date | null;
  fromStopId?: string | null;
  toStopId?: string | null;
  depIsHome?: boolean | null;
  arrIsHome?: boolean | null;
  driveEstimate?: { minutes: number; roadKm: number } | null;
}

export interface LegStop {
  id: string;
  name: string;
  timezone: string | null;
  arriveDate: string | null;
  departDate: string | null;
}

export interface LegLabel {
  icon: LucideIcon | null;
  label: string;
  sub: string;
  missing: boolean;
  accessibleName: string;
}

const SPOKEN_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const spokenDay = (iso: string) => SPOKEN_DAY.format(new Date(`${iso}T00:00:00Z`));

/** PLAN.md §2: shorten a place to its IATA/station code when one is in it. */
export function placeCode(place: string): string {
  return /\b([A-Z]{3})\b/.exec(place)?.[1] ?? place;
}

export function legLabel(t: LegTransport, stops: readonly LegStop[], homeName?: string | null): LegLabel {
  const from = stops.find((s) => s.id === t.fromStopId) ?? null;
  const to = stops.find((s) => s.id === t.toStopId) ?? null;
  const meta = TRANSPORT_MODE_META[t.mode];
  const isCar = t.mode === "CAR";
  const word = isCar ? "Drive" : meta.label;
  const home = homeName ?? "home";
  const fromName = t.depIsHome ? home : (from?.name ?? t.depPlace ?? null);
  const toName = t.arrIsHome ? home : (to?.name ?? t.arrPlace ?? null);
  const fromShort = t.depPlace ? placeCode(t.depPlace) : fromName;
  const toShort = t.arrPlace ? placeCode(t.arrPlace) : toName;

  let label = word;
  let sub = "";
  let spoken = "";
  if (t.depAt) {
    if (fromShort && toShort) label = `${word} ${fromShort} → ${toShort}`;
    const { dep } = transportTimeDisplay({
      depAt: t.depAt,
      arrAt: t.arrAt ?? null,
      fromTimezone: from?.timezone,
      toTimezone: to?.timezone,
    });
    if (dep) {
      sub = `${formatDayLabel(dep.dateISO)} ${dep.time}`;
      spoken = `${spokenDay(dep.dateISO)} ${dep.time}`;
    }
  } else if (isCar && t.driveEstimate) {
    sub = `~${formatDuration(t.driveEstimate.minutes)} · ${t.driveEstimate.roadKm} km`;
    spoken = sub;
  } else {
    const day = from?.departDate ?? to?.arriveDate ?? null;
    if (day) {
      sub = formatDayLabel(day);
      spoken = spokenDay(day);
    }
  }

  const route = fromName && toName ? ` from ${fromName} to ${toName}` : "";
  return {
    icon: meta.icon,
    label,
    sub,
    missing: false,
    accessibleName: `${word}${route}${spoken ? `, ${spoken}` : ""}. Edit.`,
  };
}

export function missingLegLabel(from: { name: string }, to: { name: string }): LegLabel {
  return {
    icon: null,
    label: `How are you getting to ${to.name}?`,
    sub: "Add",
    missing: true,
    accessibleName: `Add transport from ${from.name} to ${to.name}`,
  };
}

/** PLAN.md §2: no nagging about legs until both stops have dates. */
export function legSlotKind(
  from: { arriveDate: string | null },
  to: { arriveDate: string | null },
  legCount: number,
): "legs" | "missing" | "line" {
  if (legCount > 0) return "legs";
  return from.arriveDate && to.arriveDate ? "missing" : "line";
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- lib/plan/leg-label.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/plan/leg-label.ts lib/plan/leg-label.test.ts
git commit -m "feat(plan): legLabel for the leg pill (PLAN.md §2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 2: `daySlots` — the day strip's model

**Files:**
- Create: `lib/plan/day-density.ts`
- Test: `lib/plan/day-density.test.ts`

**Interfaces:**
- Consumes: `enumerateTripDays` (`lib/itinerary.ts`); `parseISODate` (`lib/dates.ts`); `Category` (`lib/categories.ts`).
- Produces:
  - `DOT_CAP = 5`, `FULL_DAY_PLANS = 5`
  - `interface DaySlotItem { id: string; date?: string | null; category: string }`
  - `interface DaySlot { dateISO: string; dow: string; num: number; title?: string; dots: Category[]; count: number; changeover: "arrive" | "depart" | null }`
  - `daySlots(stop: { arriveDate: string; departDate: string }, items: readonly DaySlotItem[], dayTitles?: Record<string, { title: string }>, neighbours?: { prevDepartDate?: string | null; nextArriveDate?: string | null }): DaySlot[]`
  - `dayLoadLabel(slot: Pick<DaySlot, "count" | "title">, tag?: "Arrive" | "Leave" | null): string`
  - `defaultSelectedDay(slots: readonly DaySlot[], today: string): string | null`
  - `dayTag(stop: { arriveDate: string; departDate: string }, dateISO: string): "Arrive" | "Leave" | null`

- [ ] **Step 1: Write the failing test** — `lib/plan/day-density.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { daySlots, dayLoadLabel, dayTag, defaultSelectedDay, DOT_CAP } from "./day-density";

const ROME = { arriveDate: "2026-12-15", departDate: "2026-12-18" };
const busy = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, date: "2026-12-16", category: i % 2 ? "FOOD" : "SIGHTSEEING" }));
const ITEMS = [{ id: "a", date: "2026-12-15", category: "FOOD" }, ...busy, { id: "x", date: "2026-12-30", category: "FOOD" }];

describe("daySlots", () => {
  it("one slot per day of the stay, arrive → depart inclusive", () => {
    const slots = daySlots(ROME, ITEMS);
    expect(slots.map((s) => s.dateISO)).toEqual(["2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18"]);
    expect(slots[0]).toMatchObject({ dow: "TUE", num: 15, count: 1, dots: ["FOOD"] });
  });

  it("caps the dots at five but counts every plan", () => {
    const slot = daySlots(ROME, ITEMS)[1];
    expect(slot.count).toBe(6);
    expect(slot.dots).toHaveLength(DOT_CAP);
  });

  it("an empty day has no dots; items outside the stay are ignored", () => {
    const slots = daySlots(ROME, ITEMS);
    expect(slots[2]).toMatchObject({ count: 0, dots: [] });
    expect(slots.reduce((n, s) => n + s.count, 0)).toBe(7);
  });

  it("carries the day title", () => {
    expect(daySlots(ROME, [], { "2026-12-17": { title: "Vatican day" } })[2].title).toBe("Vatican day");
  });

  it("flags the changeover days from the neighbours (ADR 0049)", () => {
    const slots = daySlots(ROME, [], undefined, { prevDepartDate: "2026-12-15", nextArriveDate: "2026-12-18" });
    expect(slots.map((s) => s.changeover)).toEqual(["arrive", null, null, "depart"]);
    expect(daySlots(ROME, []).every((s) => s.changeover === null)).toBe(true);
  });
});

describe("dayLoadLabel", () => {
  it("free, counted, full, titled, tagged", () => {
    expect(dayLoadLabel({ count: 0 })).toBe("Free day");
    expect(dayLoadLabel({ count: 1 })).toBe("1 plan");
    expect(dayLoadLabel({ count: 2 })).toBe("2 plans");
    expect(dayLoadLabel({ count: 5, title: "Versailles day" })).toBe("Versailles day · full");
    expect(dayLoadLabel({ count: 2, title: "Versailles day" })).toBe("Versailles day · 2 plans");
    expect(dayLoadLabel({ count: 2 }, "Arrive")).toBe("Arrive · 2 plans");
    expect(dayLoadLabel({ count: 0 }, "Leave")).toBe("Leave · Free day");
  });
});

describe("defaultSelectedDay", () => {
  const slots = daySlots(ROME, ITEMS);
  it("today when it falls in the stay", () => {
    expect(defaultSelectedDay(slots, "2026-12-17")).toBe("2026-12-17");
  });
  it("else the first day with plans, else the first day", () => {
    expect(defaultSelectedDay(slots, "2027-01-01")).toBe("2026-12-15");
    expect(defaultSelectedDay(daySlots(ROME, []), "2027-01-01")).toBe("2026-12-15");
    expect(defaultSelectedDay([], "2027-01-01")).toBeNull();
  });
});

describe("dayTag", () => {
  it("Arrive on the first day, Leave on the last, nothing between", () => {
    expect(dayTag(ROME, "2026-12-15")).toBe("Arrive");
    expect(dayTag(ROME, "2026-12-18")).toBe("Leave");
    expect(dayTag(ROME, "2026-12-16")).toBeNull();
    expect(dayTag({ arriveDate: "2026-12-15", departDate: "2026-12-15" }, "2026-12-15")).toBe("Arrive");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- lib/plan/day-density.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `lib/plan/day-density.ts`:

```ts
import { enumerateTripDays } from "@/lib/itinerary";
import { parseISODate } from "@/lib/dates";
import type { Category } from "@/lib/categories";

export const DOT_CAP = 5;
/** PLAN.md §7.3: a day counts as full at this many plans. */
export const FULL_DAY_PLANS = 5;

export interface DaySlotItem {
  id: string;
  date?: string | null;
  category: string;
}

export interface DaySlot {
  dateISO: string;
  dow: string;
  num: number;
  title?: string;
  dots: Category[];
  count: number;
  changeover: "arrive" | "depart" | null;
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function daySlots(
  stop: { arriveDate: string; departDate: string },
  items: readonly DaySlotItem[],
  dayTitles?: Record<string, { title: string }>,
  neighbours?: { prevDepartDate?: string | null; nextArriveDate?: string | null },
): DaySlot[] {
  const byDate = new Map<string, Category[]>();
  for (const it of items) {
    if (!it.date) continue;
    const list = byDate.get(it.date) ?? [];
    list.push(it.category as Category);
    byDate.set(it.date, list);
  }
  return enumerateTripDays(stop.arriveDate, stop.departDate).map((dateISO) => {
    const d = parseISODate(dateISO);
    const cats = byDate.get(dateISO) ?? [];
    let changeover: DaySlot["changeover"] = null;
    if (dateISO === stop.arriveDate && neighbours?.prevDepartDate === dateISO) changeover = "arrive";
    else if (dateISO === stop.departDate && neighbours?.nextArriveDate === dateISO) changeover = "depart";
    return {
      dateISO,
      dow: DOW[d.getUTCDay()],
      num: d.getUTCDate(),
      title: dayTitles?.[dateISO]?.title,
      dots: cats.slice(0, DOT_CAP),
      count: cats.length,
      changeover,
    };
  });
}

export function dayLoadLabel(slot: Pick<DaySlot, "count" | "title">, tag?: "Arrive" | "Leave" | null): string {
  const parts: string[] = [];
  if (tag) parts.push(tag);
  if (slot.title) parts.push(slot.title);
  if (slot.count >= FULL_DAY_PLANS) parts.push("full");
  else if (slot.count > 0) parts.push(`${slot.count} plan${slot.count === 1 ? "" : "s"}`);
  else if (!slot.title) parts.push("Free day");
  return parts.join(" · ");
}

export function defaultSelectedDay(slots: readonly DaySlot[], today: string): string | null {
  if (slots.length === 0) return null;
  return (
    slots.find((s) => s.dateISO === today)?.dateISO ??
    slots.find((s) => s.count > 0)?.dateISO ??
    slots[0].dateISO
  );
}

export function dayTag(stop: { arriveDate: string; departDate: string }, dateISO: string): "Arrive" | "Leave" | null {
  if (dateISO === stop.arriveDate) return "Arrive";
  if (dateISO === stop.departDate) return "Leave";
  return null;
}
```

Note the edge in `dayLoadLabel`: a titled day with 0 plans reads just its title ("Versailles day"), not "Versailles day · Free day". `{count:0}` with tag "Leave" gives "Leave · Free day". Both are asserted above.

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- lib/plan/day-density.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/plan/day-density.ts lib/plan/day-density.test.ts
git commit -m "feat(plan): daySlots, day load label and default day for the day strip (PLAN.md §4.2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 3: `buildStopActions`, the grouped ⋯ menu, the stop actions sheet and the ban scan

**Files:**
- Create: `components/plan/stop-actions.ts`, `components/plan/stop-actions.test.ts`
- Create: `components/plan/stop-actions-sheet.tsx`, `components/plan/stop-actions-sheet.test.tsx`
- Create: `components/plan/banned-classes.test.ts`
- Modify: `components/trip/card-actions.tsx` (`MoreActionsMenu` gains `groups` and `triggerClassName`)
- Modify: `components/trip/card-actions.test.tsx`

**Interfaces:**
- Consumes: `CardActionItem` (`components/trip/card-actions.tsx`); `Sheet`, `SheetContent`, `SheetTitle` (`components/ui/sheet.tsx`); `HUE_CLASSES`, `Hue` (`lib/hues.ts`).
- Produces:
  - `interface StopActionFlags { isFirst: boolean; isLast: boolean; isPending: boolean; isOwner: boolean; chaptersEnabled: boolean; canRemind: boolean; notesCount: number | null; filesCount: number | null }`
  - `interface StopActionHandlers { onEdit(): void; onAdjustDates(): void; onTogglePin(): void; onMakeRough(): void; onMoveUp(): void; onMoveDown(): void; onGiveDates(): void; onStartChapter(): void; onAssignChapter(): void; onAddReminder(): void; onNotes(): void; onFiles(): void; onDelete(): void }`
  - `buildStopActions(stop: { name: string; arriveDate: string | null; departDate: string | null; pinned: boolean }, flags: StopActionFlags, h: StopActionHandlers): CardActionItem[][]`
  - `MoreActionsMenu({ label, items?, groups?, triggerClassName? })`: `groups` wins over `items`, with a `DropdownMenuSeparator` between groups.
  - `StopActionsSheet({ open, onOpenChange, number, hue, rough, name, meta, groups }: { open: boolean; onOpenChange(o: boolean): void; number: number; hue: Hue; rough: boolean; name: string; meta: string; groups: CardActionItem[][] })`

- [ ] **Step 1: Write the failing tests**

`components/plan/stop-actions.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { buildStopActions, type StopActionFlags, type StopActionHandlers } from "./stop-actions";

const handlers = (): StopActionHandlers => ({
  onEdit: vi.fn(), onAdjustDates: vi.fn(), onTogglePin: vi.fn(), onMakeRough: vi.fn(),
  onMoveUp: vi.fn(), onMoveDown: vi.fn(), onGiveDates: vi.fn(), onStartChapter: vi.fn(),
  onAssignChapter: vi.fn(), onAddReminder: vi.fn(), onNotes: vi.fn(), onFiles: vi.fn(), onDelete: vi.fn(),
});
const DATED = { name: "Rome", arriveDate: "2026-12-15", departDate: "2026-12-22", pinned: false };
const ROUGH = { name: "Munich", arriveDate: null, departDate: null, pinned: false };
const FLAGS: StopActionFlags = {
  isFirst: false, isLast: false, isPending: false, isOwner: true,
  chaptersEnabled: true, canRemind: true, notesCount: 2, filesCount: 1,
};
const keys = (g: ReturnType<typeof buildStopActions>) => g.map((grp) => grp.map((i) => i.key));

describe("buildStopActions (PLAN.md §7.6)", () => {
  it("a dated stop: dates group, then chapter/reminder/notes/files, then delete", () => {
    const g = buildStopActions(DATED, FLAGS, handlers());
    expect(keys(g)).toEqual([
      ["edit", "adjust-dates", "pin", "make-rough"],
      ["start-chapter", "add-reminder", "notes", "files"],
      ["delete"],
    ]);
    expect(g[0][0].label).toBe("Edit name & place");
    expect(g[0][1]).toMatchObject({ label: "Adjust dates", hint: "moves later stops" });
    expect(g[0][2]).toMatchObject({ label: "Pin dates", hint: "stops the shuffle" });
    expect(g[1][2].label).toBe("Notes (2)");
    expect(g[1][3].label).toBe("Files (1)");
    expect(g[2][0]).toMatchObject({ label: "Delete Rome", destructive: true, hint: "owner only" });
  });

  it("a pinned stop offers Unpin dates", () => {
    expect(buildStopActions({ ...DATED, pinned: true }, FLAGS, handlers())[0][2].label).toBe("Unpin dates");
  });

  it("a rough stop: move up/down and Give it dates; Assign to chapter; no pin", () => {
    expect(keys(buildStopActions(ROUGH, FLAGS, handlers()))).toEqual([
      ["edit", "up", "down", "give-dates"],
      ["start-chapter", "assign-chapter", "add-reminder", "notes", "files"],
      ["delete"],
    ]);
  });

  it("first and last disable their move", () => {
    const g = buildStopActions(ROUGH, { ...FLAGS, isFirst: true, isLast: true }, handlers());
    expect(g[0].find((i) => i.key === "up")?.disabled).toBe(true);
    expect(g[0].find((i) => i.key === "down")?.disabled).toBe(true);
  });

  it("drops what the viewer can't do: non-owner, fork, chapters off, no counts", () => {
    const g = buildStopActions(
      DATED,
      { ...FLAGS, isOwner: false, canRemind: false, chaptersEnabled: false, notesCount: null, filesCount: null },
      handlers(),
    );
    expect(keys(g)).toEqual([["edit", "adjust-dates", "pin", "make-rough"]]);
  });

  it("zero counts read plain Notes / Files", () => {
    const g = buildStopActions(DATED, { ...FLAGS, notesCount: 0, filesCount: 0 }, handlers());
    expect(g[1].map((i) => i.label)).toEqual(["Start a chapter here", "Add a reminder", "Notes", "Files"]);
  });

  it("pending disables every mutating item but not Notes / Files", () => {
    const g = buildStopActions(DATED, { ...FLAGS, isPending: true }, handlers());
    for (const item of g.flat()) {
      expect(item.disabled ?? false).toBe(!["notes", "files"].includes(item.key));
    }
  });

  it("each item calls its own handler", () => {
    const h = handlers();
    const g = buildStopActions(ROUGH, FLAGS, h);
    g.flat().forEach((i) => i.onSelect());
    expect(h.onEdit).toHaveBeenCalledTimes(1);
    expect(h.onGiveDates).toHaveBeenCalledTimes(1);
    expect(h.onAssignChapter).toHaveBeenCalledTimes(1);
    expect(h.onDelete).toHaveBeenCalledTimes(1);
    expect(h.onAdjustDates).not.toHaveBeenCalled();
  });
});
```

`components/plan/stop-actions-sheet.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StopActionsSheet } from "./stop-actions-sheet";

const groups = [
  [{ key: "edit", label: "Edit name & place", onSelect: vi.fn() }, { key: "adjust-dates", label: "Adjust dates", hint: "moves later stops", onSelect: vi.fn() }],
  [{ key: "notes", label: "Notes (2)", onSelect: vi.fn() }],
  [{ key: "delete", label: "Delete Rome", hint: "owner only", destructive: true, onSelect: vi.fn() }],
];

describe("StopActionsSheet (PLAN.md §7.6)", () => {
  it("renders one card per group with 48px rows, hints on the right, delete in coral", () => {
    render(<StopActionsSheet open onOpenChange={vi.fn()} number={3} hue="coral" rough={false} name="Rome" meta="15–22 Dec · 7 nights" groups={groups} />);
    const cards = screen.getAllByRole("group");
    expect(cards).toHaveLength(3);
    const adjust = within(cards[0]).getByRole("button", { name: /Adjust dates/ });
    expect(adjust.className).toContain("min-h-12");
    expect(within(adjust).getByText("moves later stops")).toBeInTheDocument();
    expect(within(cards[2]).getByRole("button", { name: /Delete Rome/ }).className).toContain("text-coral-text");
    expect(screen.getByText("Rome")).toBeInTheDocument();
  });

  it("closes the sheet, then runs the item", async () => {
    const onOpenChange = vi.fn();
    render(<StopActionsSheet open onOpenChange={onOpenChange} number={3} hue="coral" rough={false} name="Rome" meta="" groups={groups} />);
    await userEvent.click(screen.getByRole("button", { name: /Notes \(2\)/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(groups[1][0].onSelect).toHaveBeenCalled();
  });

  it("uses no banned soft classes", () => {
    render(<StopActionsSheet open onOpenChange={vi.fn()} number={1} hue="sun" rough name="Munich" meta="" groups={groups} />);
    expect(document.body.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
```

Add to `components/trip/card-actions.test.tsx` (read it first and follow its render and open idiom):

```tsx
it("groups render with a separator between them", async () => {
  render(
    <MoreActionsMenu
      label="More actions for Rome"
      groups={[[{ key: "a", label: "A", onSelect: () => {} }], [{ key: "b", label: "B", onSelect: () => {} }], [{ key: "c", label: "C", onSelect: () => {} }]]}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "More actions for Rome" }));
  expect(await screen.findAllByRole("separator")).toHaveLength(2);
});
```

`components/plan/banned-classes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIRS = ["components/plan", "lib/plan"];
// Every file this phase touches outside those folders. Each task appends its own.
const FILES = ["components/trip/card-actions.tsx"];
const BANNED = [/shadow-soft/, /border-border\/70/, /bg-card\/40/];
const RAW_HEX = /["'\s]#[0-9a-fA-F]{6}\b/;

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((name) => {
    const rel = path.join(dir, name);
    return statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

const targets = [...DIRS.flatMap(walk), ...FILES].filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

describe("Phase 3 ban scan (handoff ground rules)", () => {
  it.each(targets)("%s has no soft shadows, 70% borders, translucent cards or raw hex", (file) => {
    const src = readFileSync(path.join(ROOT, file), "utf8");
    for (const re of BANNED) expect(src).not.toMatch(re);
    expect(src).not.toMatch(RAW_HEX);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- components/plan components/trip/card-actions.test.tsx`
Expected: FAIL (modules missing, no `groups` prop).

- [ ] **Step 3: Implement `buildStopActions`**

`components/plan/stop-actions.ts` is a pure function returning `CardActionItem[][]` with empty groups filtered out. Icons (lucide, `className="size-4" aria-hidden="true"`):

| key | label | icon | hint | disabled | shown when |
|---|---|---|---|---|---|
| edit | Edit name & place | `Pencil` | | isPending | always |
| adjust-dates | Adjust dates | `CalendarClock` | moves later stops | isPending | dated |
| pin | Pin dates / Unpin dates | `Pin` (`fill-current` when pinned) | stops the shuffle | isPending | dated |
| make-rough | Make rough | `Sparkles` | | isPending | dated |
| up | Move up | `ChevronUp` | | isFirst \|\| isPending | rough |
| down | Move down | `ChevronDown` | | isLast \|\| isPending | rough |
| give-dates | Give it dates | `CalendarPlus` | | isPending | rough |
| start-chapter | Start a chapter here | `BookOpen` | | isPending | chaptersEnabled |
| assign-chapter | Assign to chapter | `FolderInput` | | isPending | chaptersEnabled && rough |
| add-reminder | Add a reminder | `Bell` | | isPending | canRemind |
| notes | Notes / Notes (n) | `MessageCircle` | | never | notesCount !== null |
| files | Files / Files (n) | `Paperclip` | | never | filesCount !== null |
| delete | Delete {name} | `Trash2` | owner only | isPending | isOwner (own group 3, `destructive: true`) |

Group 1 is the rows from edit to give-dates, in table order, filtered by dated or rough. Group 2 runs start-chapter to files. Group 3 is delete. "Rough" means `!arriveDate || !departDate`. The file is `.ts` but builds React elements, so write the icons as `React.createElement(Pencil, { className: "size-4", "aria-hidden": true })`, or name it `stop-actions.tsx` if you'd rather use JSX. Then update the file names in this task, the tests and later imports. Keep the export name.

- [ ] **Step 4: Extend `MoreActionsMenu`**

In `components/trip/card-actions.tsx`, change the props to `{ label: string; items?: CardActionItem[]; groups?: CardActionItem[][]; triggerClassName?: string }`. Set `const sets = groups ?? (items ? [items] : [])`, filter out empty sets, and return null when there are none. Render each set's items exactly as today, with `<DropdownMenuSeparator />` (imported from `@/components/ui/dropdown-menu`) between sets. `triggerClassName` is merged with `cn()` into the trigger Button's existing class. Existing callers pass `items` and are unchanged.

- [ ] **Step 5: Implement `StopActionsSheet`** (`components/plan/stop-actions-sheet.tsx`, client)

- `<Sheet open onOpenChange><SheetContent side="bottom" hideClose overlayClassName="bg-foreground/45 backdrop-blur-none">`.
- Head row, `flex items-center gap-3`:
  - a number tile `grid size-11 shrink-0 place-items-center rounded-xl border-2 border-border font-display text-lg font-extrabold`, filled `HUE_CLASSES[hue].fill`, or `border-dashed bg-muted` when `rough`
  - `<SheetTitle className="font-display text-[28px] leading-none">{name}</SheetTitle>`
  - `meta` in `text-xs font-semibold text-muted-foreground`
- Groups: `<div role="group" aria-label={`Actions ${i + 1}`} className="flex flex-col divide-y-2 divide-muted overflow-hidden rounded-[14px] border-2 border-border bg-card">`.
- Each row is `<button type="button" disabled={item.disabled} className={cn("flex min-h-12 w-full items-center gap-3 px-3.5 text-left text-sm font-bold disabled:opacity-45", item.destructive && "text-coral-text")}>` holding the icon, `<span className="flex-1">{label}</span>` and, when there's a hint, `<span className="max-w-[40%] text-right text-xs font-semibold text-muted-foreground">{hint}</span>`.
- On click: `onOpenChange(false)` and then `item.onSelect()`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm test -- components/plan components/trip/card-actions.test.tsx`
Expected: PASS.

- [ ] **Step 7: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/plan components/trip/card-actions.tsx components/trip/card-actions.test.tsx
git commit -m "feat(plan): grouped stop actions for the ⋯ menu and the mobile actions sheet (PLAN.md §7.6)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 4: `scrollToId` and the plan hash

**Files:**
- Create: `lib/scroll-to.ts`, `lib/scroll-to.test.ts`
- Create: `lib/plan/plan-hash.ts`, `lib/plan/plan-hash.test.ts`

**Interfaces:**
- Produces (cross-phase contract, exact):
  - `scrollToId(id: string, opts?: { reduced?: boolean; offset?: number }): void`
  - `HIGHLIGHT_MS = 1600`; `ringId(id: string, ms?: number): void`, which sets `data-highlight="true"` and removes it after `ms`
  - `interface PlanHash { open: string[]; day: string | null; stopTarget: string | null }`
  - `parsePlanHash(hash: string): PlanHash`; `serializePlanHash(s: { open: readonly string[]; day: string | null }): string`
  - `defaultOpenStops(stops: readonly { id: string; arriveDate: string | null; departDate: string | null }[], planCounts: Readonly<Record<string, number>>, today: string): string[]`

- [ ] **Step 1: Write the failing tests**

`lib/scroll-to.test.ts`:

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { scrollToId, ringId, HIGHLIGHT_MS } from "./scroll-to";

let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollTo = vi.fn();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
  document.body.innerHTML = `<div id="stop-a"></div>`;
  document.getElementById("stop-a")!.getBoundingClientRect = () => ({ top: 300 }) as DOMRect;
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("scrollToId", () => {
  it("scrolls the window so the element sits 24px under the top, smoothly", () => {
    scrollToId("stop-a");
    expect(scrollTo).toHaveBeenCalledWith({ top: 776, behavior: "smooth" });
  });
  it("honours reduced motion and a custom offset", () => {
    scrollToId("stop-a", { reduced: true, offset: 0 });
    expect(scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "auto" });
  });
  it("does nothing for a missing id", () => {
    scrollToId("nope");
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe("ringId", () => {
  it("rings the element for HIGHLIGHT_MS, then clears it", () => {
    vi.useFakeTimers();
    ringId("stop-a");
    const el = document.getElementById("stop-a")!;
    expect(el.getAttribute("data-highlight")).toBe("true");
    vi.advanceTimersByTime(HIGHLIGHT_MS);
    expect(el.hasAttribute("data-highlight")).toBe(false);
  });
});
```

`lib/plan/plan-hash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { defaultOpenStops, parsePlanHash, serializePlanHash } from "./plan-hash";

describe("parsePlanHash", () => {
  it("reads the open set and the day", () => {
    expect(parsePlanHash("#open=a,b&day=2026-12-11")).toEqual({ open: ["a", "b"], day: "2026-12-11", stopTarget: null });
  });
  it("a #stop- hash wins: it opens that stop and targets it", () => {
    expect(parsePlanHash("#stop-s2")).toEqual({ open: ["s2"], day: null, stopTarget: "s2" });
  });
  it("drops a bad day, empty ids and duplicates; tolerates no leading #", () => {
    expect(parsePlanHash("open=a,,a&day=11-12")).toEqual({ open: ["a"], day: null, stopTarget: null });
  });
  it("anything else is empty", () => {
    expect(parsePlanHash("")).toEqual({ open: [], day: null, stopTarget: null });
    expect(parsePlanHash("#travellers")).toEqual({ open: [], day: null, stopTarget: null });
  });
});

describe("serializePlanHash", () => {
  it("round-trips and omits empty parts", () => {
    expect(serializePlanHash({ open: ["a", "b"], day: "2026-12-11" })).toBe("open=a,b&day=2026-12-11");
    expect(serializePlanHash({ open: ["a"], day: null })).toBe("open=a");
    expect(serializePlanHash({ open: [], day: null })).toBe("");
    expect(parsePlanHash(`#${serializePlanHash({ open: ["x"], day: "2026-01-02" })}`).open).toEqual(["x"]);
  });
});

describe("defaultOpenStops (PLAN.md §3 fold state)", () => {
  const STOPS = [
    { id: "lon", arriveDate: "2026-12-05", departDate: "2026-12-10" },
    { id: "par", arriveDate: "2026-12-10", departDate: "2026-12-15" },
    { id: "mun", arriveDate: null, departDate: null },
  ];
  it("the current stop when travelling (the arriving one on a changeover day)", () => {
    expect(defaultOpenStops(STOPS, {}, "2026-12-12")).toEqual(["par"]);
    expect(defaultOpenStops(STOPS, {}, "2026-12-10")).toEqual(["par"]);
  });
  it("else the first stop with any plans, else none", () => {
    expect(defaultOpenStops(STOPS, { par: 3 }, "2026-01-01")).toEqual(["par"]);
    expect(defaultOpenStops(STOPS, {}, "2026-01-01")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- lib/scroll-to.test.ts lib/plan/plan-hash.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`lib/scroll-to.ts`:

```ts
/** How long a jumped-to card's ring stays on; mirrors the `tp-stop-highlight` animation in app/globals.css. */
export const HIGHLIGHT_MS = 1600;

/**
 * Scrolls the window, not the nearest scroller, so the sticky rail and the
 * day strip's own overflow never swallow the jump (PLAN.md §6.3 replaces
 * `scrollIntoView`).
 */
export function scrollToId(id: string, opts: { reduced?: boolean; offset?: number } = {}): void {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - (opts.offset ?? 24);
  window.scrollTo({ top, behavior: opts.reduced ? "auto" : "smooth" });
}

export function ringId(id: string, ms: number = HIGHLIGHT_MS): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.setAttribute("data-highlight", "true");
  window.setTimeout(() => el.removeAttribute("data-highlight"), ms);
}
```

`lib/plan/plan-hash.ts`:

```ts
export interface PlanHash {
  open: string[];
  day: string | null;
  stopTarget: string | null;
}

const EMPTY: PlanHash = { open: [], day: null, stopTarget: null };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function parsePlanHash(hash: string): PlanHash {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw.startsWith("stop-")) {
    const id = raw.slice(5).split("&")[0];
    return id ? { open: [id], day: null, stopTarget: id } : EMPTY;
  }
  if (!raw.startsWith("open=") && !raw.includes("&day=") && !raw.startsWith("day=")) return EMPTY;
  const params = new URLSearchParams(raw);
  const open = [...new Set((params.get("open") ?? "").split(",").filter(Boolean))];
  const day = params.get("day");
  return { open, day: day && ISO.test(day) ? day : null, stopTarget: null };
}

export function serializePlanHash({ open, day }: { open: readonly string[]; day: string | null }): string {
  const parts: string[] = [];
  if (open.length > 0) parts.push(`open=${open.join(",")}`);
  if (day) parts.push(`day=${day}`);
  return parts.join("&");
}

export function defaultOpenStops(
  stops: readonly { id: string; arriveDate: string | null; departDate: string | null }[],
  planCounts: Readonly<Record<string, number>>,
  today: string,
): string[] {
  const dated = stops.filter((s) => s.arriveDate && s.departDate);
  const current =
    dated.find((s) => s.arriveDate! <= today && today < s.departDate!) ??
    dated.find((s) => s.arriveDate! <= today && today <= s.departDate!);
  if (current) return [current.id];
  const planned = stops.find((s) => (planCounts[s.id] ?? 0) > 0);
  return planned ? [planned.id] : [];
}
```

Note that `serializePlanHash` writes the ids unescaped. Stop ids are cuids (`[a-z0-9]`), so they need no escaping.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -- lib/scroll-to.test.ts lib/plan/plan-hash.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/scroll-to.ts lib/scroll-to.test.ts lib/plan/plan-hash.ts lib/plan/plan-hash.test.ts
git commit -m "feat(plan): scrollToId, ringId and the #open=/#stop- plan hash (PLAN.md §3, §6.3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 5: The plan model — stay status, ranges, header meta, add-stop consequence, Fit tile

**Files:**
- Create: `lib/plan/plan-model.ts`, `lib/plan/plan-model.test.ts`

**Interfaces:**
- Consumes: `uncoveredNights` (`lib/accommodation-coverage.ts`); `nightsBetween`, `daysBetween`, `addDays`, `formatDayLabel`, `parseISODate` (`lib/dates.ts`); `PlanSummary` (`lib/plan-overview.ts`).
- Produces:
  - `type StayStatus = { kind: "covered" | "partial" | "none"; name: string | null; totalNights: number; coveredNights: number; extra: number; checkInTime: string | null }`
  - `stayStatus(stop: { arriveDate: string | null; departDate: string | null }, accs: readonly { name: string; checkIn: string; checkOut: string; checkInTime?: string | null }[]): StayStatus | null`, which is null for a rough or same-day stop
  - `formatStayRange(arrive: string, depart: string): string`
  - `tripEyebrow(name: string, startDate: string | null): string`
  - `planHeaderMeta(s: { stopCount: number; roughCount: number }, start: string | null, end: string | null): string`
  - `addStopConsequence(i: { mode: "exact" | "rough"; nights: number; range?: { arrive: string; depart: string } | null; after: { departDate: string | null } | null; projectedEnd: string | null; hardEndDate: string | null }): { text: string; over: boolean } | null`
  - `routeCentroid(stops: readonly { lat?: number | null; lng?: number | null }[]): { lat: number; lng: number } | null`
  - `type FitTone = "teal" | "sun" | "coral" | "card"`
  - `fitTileModel(s: PlanSummary): { tone: FitTone; big: number | null; words: string; pill: "FITS YOUR DATES" | "RUNS OVER" | null; bar: { setPct: number; roughPct: number; overPct: number } | null; legendLeft: string; legendRight: string | null }`

- [ ] **Step 1: Write the failing test** — `lib/plan/plan-model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { PlanSummary } from "@/lib/plan-overview";
import {
  addStopConsequence, fitTileModel, formatStayRange, planHeaderMeta, routeCentroid, stayStatus, tripEyebrow,
} from "./plan-model";

const ROME = { arriveDate: "2026-12-15", departDate: "2026-12-20" }; // 5 nights

describe("stayStatus (PLAN.md §3 stay chip, §4.1)", () => {
  it("covered, with the first place, extras and check-in time", () => {
    expect(
      stayStatus(ROME, [
        { name: "Hotel Artemide", checkIn: "2026-12-15", checkOut: "2026-12-20", checkInTime: "15:00" },
        { name: "Spare", checkIn: "2026-12-15", checkOut: "2026-12-16" },
      ]),
    ).toEqual({ kind: "covered", name: "Hotel Artemide", totalNights: 5, coveredNights: 5, extra: 1, checkInTime: "15:00" });
  });
  it("partial and none", () => {
    expect(stayStatus(ROME, [{ name: "A", checkIn: "2026-12-15", checkOut: "2026-12-18" }])).toMatchObject({ kind: "partial", coveredNights: 3, totalNights: 5 });
    expect(stayStatus(ROME, [])).toMatchObject({ kind: "none", name: null, totalNights: 5, coveredNights: 0 });
  });
  it("null for a rough or same-day stop", () => {
    expect(stayStatus({ arriveDate: null, departDate: null }, [])).toBeNull();
    expect(stayStatus({ arriveDate: "2026-12-15", departDate: "2026-12-15" }, [])).toBeNull();
  });
});

describe("formatStayRange", () => {
  it("same month collapses the month; across months keeps both", () => {
    expect(formatStayRange("2026-12-15", "2026-12-22")).toBe("Tue 15 – Tue 22 Dec");
    expect(formatStayRange("2026-12-27", "2027-01-03")).toBe("Sun 27 Dec – Sun 3 Jan");
  });
});

describe("tripEyebrow / planHeaderMeta (PLAN.md §1.1)", () => {
  it("adds the start year unless the name already ends with it", () => {
    expect(tripEyebrow("Christmas in Europe", "2026-12-04")).toBe("Christmas in Europe 2026");
    expect(tripEyebrow("Europe 2026", "2026-12-04")).toBe("Europe 2026");
    expect(tripEyebrow("Someday", null)).toBe("Someday");
  });
  it("stops · rough · range, dropping empty parts", () => {
    expect(planHeaderMeta({ stopCount: 6, roughCount: 1 }, "2026-12-04", "2027-01-08")).toBe("6 stops · 1 rough · Fri 4 Dec – Fri 8 Jan");
    expect(planHeaderMeta({ stopCount: 1, roughCount: 0 }, null, null)).toBe("1 stop");
  });
});

describe("addStopConsequence (PLAN.md §7.4 live line)", () => {
  const base = { after: { departDate: "2026-12-22" }, projectedEnd: "2027-01-03", hardEndDate: "2027-01-08" };
  it("rough: lands after the goes-after stop and counts the spare", () => {
    expect(addStopConsequence({ ...base, mode: "rough", nights: 5 })).toEqual({ text: "Lands on Tue 22 – Sun 27 Dec. 0 nights spare after this.", over: false });
  });
  it("pushes past the home-by date in coral", () => {
    expect(addStopConsequence({ ...base, mode: "rough", nights: 7 })).toEqual({ text: "Pushes you 2 nights past Fri 8 Jan.", over: true });
  });
  it("exact: uses the picked range", () => {
    expect(addStopConsequence({ ...base, mode: "exact", nights: 0, range: { arrive: "2026-12-22", depart: "2026-12-24" } })).toEqual({ text: "Lands on Tue 22 – Thu 24 Dec. 3 nights spare after this.", over: false });
  });
  it("no home-by: just where it lands; nothing to say at all → null", () => {
    expect(addStopConsequence({ ...base, hardEndDate: null, mode: "rough", nights: 2 })?.text).toBe("Lands on Tue 22 – Thu 24 Dec.");
    expect(addStopConsequence({ mode: "rough", nights: 2, after: null, projectedEnd: null, hardEndDate: null })).toBeNull();
  });
  it("singular night", () => {
    expect(addStopConsequence({ ...base, mode: "rough", nights: 4 })?.text).toBe("Lands on Tue 22 – Sat 26 Dec. 1 night spare after this.");
  });
});

describe("routeCentroid", () => {
  it("averages the located stops, null with none", () => {
    expect(routeCentroid([{ lat: 10, lng: 20 }, { lat: 20, lng: 40 }, { lat: null, lng: null }])).toEqual({ lat: 15, lng: 30 });
    expect(routeCentroid([{}])).toBeNull();
  });
});

const summary = (over: Partial<PlanSummary>): PlanSummary => ({
  stopCount: 6, roughCount: 1, scheduledNights: 28, projectedNights: 33,
  spanStart: "2026-12-04", scheduledEnd: "2027-01-01", projectedEnd: "2027-01-06",
  hardEndDate: "2027-01-08", hardEndState: "ok", hardEndSlackNights: 2, ...over,
});

describe("fitTileModel (PLAN.md §6.2)", () => {
  it("ok: teal, slack nights spare, a set + rough bar of the window", () => {
    const m = fitTileModel(summary({ hardEndState: "ok", hardEndSlackNights: 4 }));
    expect(m).toMatchObject({ tone: "teal", big: 4, words: "nights spare", pill: "FITS YOUR DATES", legendLeft: "28 set · ~5 rough", legendRight: "of 35" });
    expect(m.bar!.setPct).toBeCloseTo(80);
    expect(m.bar!.roughPct).toBeCloseTo((5 / 35) * 100);
    expect(m.bar!.overPct).toBe(0);
  });
  it("approaching: sun, 1 night spare or 0 right on it", () => {
    expect(fitTileModel(summary({ hardEndState: "approaching", hardEndSlackNights: 1 }))).toMatchObject({ tone: "sun", big: 1, words: "night spare" });
    expect(fitTileModel(summary({ hardEndState: "approaching", hardEndSlackNights: 0 }))).toMatchObject({ tone: "sun", big: 0, words: "right on it" });
  });
  it("over: coral, nights over, RUNS OVER, an overflow hatch", () => {
    const m = fitTileModel(summary({ hardEndState: "over", hardEndSlackNights: -2, projectedNights: 37 }));
    expect(m).toMatchObject({ tone: "coral", big: 2, words: "nights over", pill: "RUNS OVER" });
    expect(m.bar!.overPct).toBeGreaterThan(0);
  });
  it("unset and dormant: card, no number, no bar", () => {
    expect(fitTileModel(summary({ hardEndState: "unset", hardEndSlackNights: null, hardEndDate: null }))).toMatchObject({ tone: "card", big: null, words: "Set a home-by date", pill: null, bar: null });
    expect(fitTileModel(summary({ hardEndState: "dormant", hardEndSlackNights: null }))).toMatchObject({ tone: "card", big: null, words: "Set a start date to check this" });
  });
  it("no rough: the legend drops the rough part", () => {
    expect(fitTileModel(summary({ roughCount: 0, projectedNights: 28 })).legendLeft).toBe("28 set");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- lib/plan/plan-model.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `lib/plan/plan-model.ts`:

```ts
import { uncoveredNights } from "@/lib/accommodation-coverage";
import { addDays, daysBetween, formatDayLabel, nightsBetween, parseISODate } from "@/lib/dates";
import type { PlanSummary } from "@/lib/plan-overview";

export type StayStatus = {
  kind: "covered" | "partial" | "none";
  name: string | null;
  totalNights: number;
  coveredNights: number;
  extra: number;
  checkInTime: string | null;
};

export function stayStatus(
  stop: { arriveDate: string | null; departDate: string | null },
  accs: readonly { name: string; checkIn: string; checkOut: string; checkInTime?: string | null }[],
): StayStatus | null {
  if (!stop.arriveDate || !stop.departDate) return null;
  const total = nightsBetween(stop.arriveDate, stop.departDate);
  if (total === 0) return null;
  const open = uncoveredNights({ arriveDate: stop.arriveDate, departDate: stop.departDate }, [...accs]);
  const first = accs[0] ?? null;
  return {
    kind: accs.length === 0 ? "none" : open === 0 ? "covered" : "partial",
    name: first?.name ?? null,
    totalNights: total,
    coveredNights: total - open,
    extra: Math.max(0, accs.length - 1),
    checkInTime: first?.checkInTime ?? null,
  };
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 15 – Tue 22 Dec" / "Sun 27 Dec – Sun 3 Jan": the stop row and header range (PLAN.md §1.1, §3). */
export function formatStayRange(arrive: string, depart: string): string {
  const [a, d] = [arrive, depart].map(formatDayLabel);
  const sameMonth = parseISODate(arrive).getUTCMonth() === parseISODate(depart).getUTCMonth();
  return sameMonth ? `${a.replace(/ [A-Z][a-z]{2}$/, "")} – ${d}` : `${a} – ${d}`;
}

export function tripEyebrow(name: string, startDate: string | null): string {
  if (!startDate) return name;
  const year = startDate.slice(0, 4);
  return name.trimEnd().endsWith(year) ? name : `${name} ${year}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function planHeaderMeta(s: { stopCount: number; roughCount: number }, start: string | null, end: string | null): string {
  const parts = [plural(s.stopCount, "stop")];
  if (s.roughCount > 0) parts.push(`${s.roughCount} rough`);
  if (start && end) parts.push(formatStayRange(start, end));
  return parts.join(" · ");
}

export function addStopConsequence(i: {
  mode: "exact" | "rough";
  nights: number;
  range?: { arrive: string; depart: string } | null;
  after: { departDate: string | null } | null;
  projectedEnd: string | null;
  hardEndDate: string | null;
}): { text: string; over: boolean } | null {
  const lands =
    i.mode === "exact"
      ? (i.range ?? null)
      : i.after?.departDate
        ? { arrive: i.after.departDate, depart: addDays(i.after.departDate, i.nights) }
        : null;
  const shift = i.mode === "exact" ? (i.range ? nightsBetween(i.range.arrive, i.range.depart) : 0) : i.nights;
  const newEnd = i.projectedEnd ? addDays(i.projectedEnd, shift) : (lands?.depart ?? null);
  const slack = i.hardEndDate && newEnd ? daysBetween(newEnd, i.hardEndDate) : null;
  const landsText = lands ? `Lands on ${formatStayRange(lands.arrive, lands.depart)}.` : "";
  if (slack !== null && slack < 0) {
    return { text: `Pushes you ${plural(-slack, "night")} past ${formatDayLabel(i.hardEndDate!)}.`, over: true };
  }
  if (slack !== null) return { text: `${landsText} ${plural(slack, "night")} spare after this.`.trim(), over: false };
  return landsText ? { text: landsText, over: false } : null;
}

export function routeCentroid(stops: readonly { lat?: number | null; lng?: number | null }[]): { lat: number; lng: number } | null {
  const located = stops.filter((s): s is { lat: number; lng: number } => s.lat != null && s.lng != null);
  if (located.length === 0) return null;
  return {
    lat: located.reduce((n, s) => n + s.lat, 0) / located.length,
    lng: located.reduce((n, s) => n + s.lng, 0) / located.length,
  };
}

export type FitTone = "teal" | "sun" | "coral" | "card";

export function fitTileModel(s: PlanSummary): {
  tone: FitTone;
  big: number | null;
  words: string;
  pill: "FITS YOUR DATES" | "RUNS OVER" | null;
  bar: { setPct: number; roughPct: number; overPct: number } | null;
  legendLeft: string;
  legendRight: string | null;
} {
  const rough = s.projectedNights - s.scheduledNights;
  const legendLeft = rough > 0 ? `${s.scheduledNights} set · ~${rough} rough` : `${s.scheduledNights} set`;
  const of = s.spanStart && s.hardEndDate ? daysBetween(s.spanStart, s.hardEndDate) : null;
  const bar =
    of && of > 0 && (s.hardEndState === "ok" || s.hardEndState === "approaching" || s.hardEndState === "over")
      ? (() => {
          const setPct = Math.min(100, (s.scheduledNights / of) * 100);
          const roughPct = Math.min(100 - setPct, (rough / of) * 100);
          const overPct = s.projectedNights > of ? Math.min(20, ((s.projectedNights - of) / of) * 100) : 0;
          return { setPct, roughPct, overPct };
        })()
      : null;
  const legendRight = of ? `of ${of}` : null;
  const slack = s.hardEndSlackNights ?? 0;
  const nightsWord = (n: number, tail: string) => `night${n === 1 ? "" : "s"} ${tail}`;
  switch (s.hardEndState) {
    case "ok":
      return { tone: "teal", big: slack, words: nightsWord(slack, "spare"), pill: "FITS YOUR DATES", bar, legendLeft, legendRight };
    case "approaching":
      return { tone: "sun", big: slack, words: slack === 0 ? "right on it" : nightsWord(slack, "spare"), pill: "FITS YOUR DATES", bar, legendLeft, legendRight };
    case "over":
      return { tone: "coral", big: -slack, words: nightsWord(-slack, "over"), pill: "RUNS OVER", bar, legendLeft, legendRight };
    case "unset":
      return { tone: "card", big: null, words: "Set a home-by date", pill: null, bar: null, legendLeft, legendRight: null };
    default:
      return { tone: "card", big: null, words: "Set a start date to check this", pill: null, bar: null, legendLeft, legendRight: null };
  }
}
```

Check the Fit fixture: `spanStart` 2026-12-04 → `hardEndDate` 2027-01-08 is 35 days (`daysBetween`), so the legend reads "of 35" and `setPct` is 28/35 = 80%.

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- lib/plan/plan-model.test.ts`
Expected: PASS. If `formatStayRange`'s same-month regex misfires, fix the implementation, not the test.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/plan/plan-model.ts lib/plan/plan-model.test.ts
git commit -m "feat(plan): plan model — stay status, stay range, header meta, add-stop consequence, Fit tile

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---
### Task 6: `PlanBody`, the fold state, selected days, hash and actions registry

**Read first:** `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`, the "Native History API" section. `window.history.replaceState(null, "", url)` integrates with the App Router. Use `null` for the state, as the docs do.

**Files:**
- Create: `components/plan/plan-body.tsx`, `components/plan/plan-body.test.tsx`

**Interfaces:**
- Consumes: `parsePlanHash`, `serializePlanHash` (Task 4); `scrollToId`, `ringId` (Task 4).
- Produces:
  - `interface PlanActions { addStop(): void; newChapter(): void; suggestChapters(): void; toggleChapters(): void }`
  - `interface PlanBodyValue { today: string; hashDay: string | null; isOpen(stopId: string): boolean; toggle(stopId: string): void; open(stopId: string): void; selectedDay(stopId: string): string | null; selectDay(stopId: string, dateISO: string): void; jumpTo(stopId: string): void; actions: PlanActions; registerActions(a: Partial<PlanActions>): () => void }`
  - `PlanBody({ initialOpen, today, children }: { initialOpen: string[]; today: string; children: React.ReactNode })` (client)
  - `usePlanBody(): PlanBodyValue`. Without a provider it returns an inert default: nothing open, every call a no-op, `today: ""`. That way components still render in isolation and existing tests.
  - `useRegisterPlanActions(a: Partial<PlanActions>): void`

- [ ] **Step 1: Write the failing test** — `components/plan/plan-body.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setMatchMedia } from "@/test/setup";
import { PlanBody, usePlanBody, useRegisterPlanActions } from "./plan-body";

function Probe({ id }: { id: string }) {
  const b = usePlanBody();
  return (
    <div>
      <span data-testid={`open-${id}`}>{String(b.isOpen(id))}</span>
      <span data-testid={`day-${id}`}>{b.selectedDay(id) ?? b.hashDay ?? "none"}</span>
      <button onClick={() => b.toggle(id)}>toggle {id}</button>
      <button onClick={() => b.selectDay(id, "2026-12-11")}>day {id}</button>
      <button onClick={() => b.jumpTo(id)}>jump {id}</button>
      <button onClick={() => b.actions.addStop()}>add</button>
    </div>
  );
}
function Registrar({ onAdd }: { onAdd: () => void }) {
  useRegisterPlanActions({ addStop: onAdd });
  return null;
}

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  window.history.replaceState(null, "", "/trips/t/plan");
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("PlanBody", () => {
  it("starts from initialOpen when there is no hash", () => {
    render(<PlanBody initialOpen={["a"]} today="2026-12-12"><Probe id="a" /><Probe id="b" /></PlanBody>);
    expect(screen.getByTestId("open-a")).toHaveTextContent("true");
    expect(screen.getByTestId("open-b")).toHaveTextContent("false");
  });

  it("toggling and picking a day write #open=…&day=… with replaceState", async () => {
    render(<PlanBody initialOpen={[]} today="2026-12-12"><Probe id="a" /></PlanBody>);
    await userEvent.click(screen.getByText("toggle a"));
    expect(window.location.hash).toBe("#open=a");
    await userEvent.click(screen.getByText("day a"));
    expect(window.location.hash).toBe("#open=a&day=2026-12-11");
    await userEvent.click(screen.getByText("toggle a"));
    expect(window.location.hash).toBe("#day=2026-12-11");
  });

  it("on mount, #open= restores the open set and hands the day over", async () => {
    window.history.replaceState(null, "", "/trips/t/plan#open=b&day=2026-12-20");
    render(<PlanBody initialOpen={["a"]} today="2026-12-12"><Probe id="a" /><Probe id="b" /></PlanBody>);
    await waitFor(() => expect(screen.getByTestId("open-b")).toHaveTextContent("true"));
    expect(screen.getByTestId("open-a")).toHaveTextContent("false");
    expect(screen.getByTestId("day-b")).toHaveTextContent("2026-12-20");
  });

  it("on mount, #stop-<id> opens and rings that stop (desktop row)", async () => {
    setMatchMedia((q) => q === "(min-width: 1024px)");
    window.history.replaceState(null, "", "/trips/t/plan#stop-s1");
    render(
      <PlanBody initialOpen={[]} today="2026-12-12">
        <div id="stop-s1" />
        <div id="m-stop-s1" />
        <Probe id="s1" />
      </PlanBody>,
    );
    await waitFor(() => expect(screen.getByTestId("open-s1")).toHaveTextContent("true"));
    await waitFor(() => expect(document.getElementById("stop-s1")).toHaveAttribute("data-highlight", "true"));
    expect(document.getElementById("m-stop-s1")).not.toHaveAttribute("data-highlight");
  });

  it("falls back to the mobile row below lg", async () => {
    setMatchMedia(false);
    window.history.replaceState(null, "", "/trips/t/plan#stop-s1");
    render(<PlanBody initialOpen={[]} today="2026-12-12"><div id="stop-s1" /><div id="m-stop-s1" /></PlanBody>);
    await waitFor(() => expect(document.getElementById("m-stop-s1")).toHaveAttribute("data-highlight", "true"));
  });

  it("jumpTo with reduced motion scrolls, opens and rings at once", async () => {
    setMatchMedia((q) => q.includes("reduce"));
    render(<PlanBody initialOpen={[]} today="2026-12-12"><div id="stop-a" /><Probe id="a" /></PlanBody>);
    await userEvent.click(screen.getByText("jump a"));
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
    expect(screen.getByTestId("open-a")).toHaveTextContent("true");
    expect(document.getElementById("stop-a")).toHaveAttribute("data-highlight", "true");
  });

  it("header buttons reach handlers ItineraryManager registers", async () => {
    const onAdd = vi.fn();
    render(<PlanBody initialOpen={[]} today="2026-12-12"><Registrar onAdd={onAdd} /><Probe id="a" /></PlanBody>);
    await userEvent.click(screen.getByText("add"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("without a provider everything is inert", async () => {
    render(<Probe id="a" />);
    await act(async () => { await userEvent.click(screen.getByText("toggle a")); });
    expect(screen.getByTestId("open-a")).toHaveTextContent("false");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- components/plan/plan-body.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `components/plan/plan-body.tsx` (`"use client"`)

- State:
  - `const [openIds, setOpenIds] = useState<string[]>(initialOpen)`
  - `const [days, setDays] = useState<Record<string, string>>({})`
  - `const [hashDay, setHashDay] = useState<string | null>(null)`
  - `lastDayRef = useRef<string | null>(null)` (the most recent `selectDay`)
  - `registry = useRef<Partial<PlanActions>>({})`
- `writeHash(open: string[], day: string | null)`: `const h = serializePlanHash({ open, day })`, then `window.history.replaceState(null, "", `${location.pathname}${location.search}${h ? `#${h}` : ""}`)`. Call it **inside the event handlers** (`toggle`, `open`, `selectDay`), never from an effect. That way the default open set never clobbers an incoming `#stop-` before it is read.
- `toggle(id)`: compute the next array (remove if present, else append), `setOpenIds(next)`, `writeHash(next, lastDayRef.current)`. `open(id)` does the same but is a no-op when already open.
- `selectDay(stopId, date)`: `setDays((d) => ({ ...d, [stopId]: date }))`, `lastDayRef.current = date`, `writeHash(openIds, date)`.
- `selectedDay(stopId)` returns `days[stopId] ?? null`. Consumers fall back to `hashDay` when it falls in their strip, then to `defaultSelectedDay`.
- `const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false`.
- `targetFor(id)`: `const desktop = window.matchMedia?.("(min-width: 1024px)").matches`. Prefer `stop-${id}` when `desktop`, else `m-stop-${id}`, and fall back to the other id if that element is missing.
- `jumpTo(id)` (PLAN.md §6.3, MOTION.md P9): `const target = targetFor(id)`, then `scrollToId(target, { reduced: reduced() })`, then define `settle = () => { open(id); ringId(target) }`. With reduced motion, call `settle()` at once. Otherwise run `settle` once, either on the first `window` `scrollend` event or after a 600 ms timeout, whichever comes first (guard with a `done` flag, and remove the listener).
- Mount effect (`useEffect(() => {…}, [])`): define `apply(hash)`: `const p = parsePlanHash(hash)`.
  - If `p.stopTarget`: `void Promise.resolve().then(() => { setOpenIds((o) => o.includes(p.stopTarget!) ? o : [...o, p.stopTarget!]); requestAnimationFrame(() => { const t = targetFor(p.stopTarget!); scrollToId(t, { reduced: reduced() }); ringId(t); }); })`.
  - Else, if `p.open.length || p.day`: `void Promise.resolve().then(() => { setOpenIds(p.open); setHashDay(p.day); lastDayRef.current = p.day; })`.
  - Call `apply(window.location.hash)`, and also subscribe `hashchange` → `apply(location.hash)`. Unsubscribe on cleanup.
  - The microtask deferral follows the repo's `react-hooks/set-state-in-effect` idiom (see `itinerary-manager.tsx`'s accommodation-nudge effect). jsdom has `requestAnimationFrame`. If the test's `waitFor` misses it, use `setTimeout(…, 0)`.
- `actions`: a `useMemo` object whose four methods call `registry.current.<name>?.()`.
- `registerActions(a)`: merge `a` into `registry.current` and return a cleanup that deletes exactly those keys when they still hold the same functions.
- `useRegisterPlanActions(a)`: `const { registerActions } = usePlanBody(); React.useEffect(() => registerActions(a));`. There is deliberately no dependency array, so the latest closures are registered every render. Add a one-line comment saying why.
- Memoise the context value (`useMemo` over `openIds`, `days`, `hashDay`). `PlanBody` renders `<PlanBodyContext.Provider value={value}>{children}</PlanBodyContext.Provider>` and no DOM of its own.

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- components/plan/plan-body.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/plan/plan-body.tsx components/plan/plan-body.test.tsx
git commit -m "feat(plan): PlanBody — fold state, selected days, #open=/#stop- hash, actions registry

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 7: `StopRow` — the folded stop (desktop)

**Files:**
- Create: `components/plan/stop-row.tsx`, `components/plan/stop-row.test.tsx`
- Create: `components/plan/types.ts`. It is the new home of `StopCardStop` and `ThingToDo`, copied verbatim from `components/trip/stop-card.tsx`. `stop-card.tsx` re-exports them for now (`export type { StopCardStop, ThingToDo } from "@/components/plan/types"`), until Task 16 deletes it.

**Interfaces:**
- Consumes: `StayStatus`, `formatStayRange` (Task 5); `MoreActionsMenu` with `groups` (Task 3); `stopHue` (`lib/stop-colours.ts`); `HUE_CLASSES` (`lib/hues.ts`); `nightsBetween`, `tzAbbrev`, `formatNights` (`lib/dates.ts`); `MapLink` (`components/trip/map-link.tsx`); `CardActionItem`.
- Produces:
  - `StopRow(props: StopRowProps)`, where `interface StopRowProps { stop: StopCardStop; number: number; open: boolean; onToggle(): void; bodyId: string; stay: StayStatus | null; plansCount: number; ideasCount: number; menuGroups: CardActionItem[][]; dragHandle?: React.ReactNode; isPending?: boolean; children?: React.ReactNode }`
  - `STOP_ROW_GRID = "grid grid-cols-[40px_minmax(0,1fr)_auto_auto] items-center gap-3.5 px-4 py-3.5"` (exported for the test)

- [ ] **Step 1: Write the failing test** — `components/plan/stop-row.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HUE_CLASSES } from "@/lib/hues";
import { stopHue } from "@/lib/stop-colours";
import { StopRow, type StopRowProps } from "./stop-row";

const DATED = {
  id: "r", name: "Rome", country: "Italy", timezone: "Europe/Rome", arriveDate: "2026-12-15", departDate: "2026-12-22",
  nights: null, pinned: false, chapterId: null, sortOrder: 2, notes: null, lat: 41.9, lng: 12.5,
};
const ROUGH = { ...DATED, id: "m", name: "Munich", country: "Germany", arriveDate: null, departDate: null, nights: 5, timezone: null, lat: null, lng: null };
const COVERED = { kind: "covered" as const, name: "Hotel Artemide", totalNights: 7, coveredNights: 7, extra: 0, checkInTime: "15:00" };

function renderRow(p: Partial<StopRowProps> = {}) {
  const props: StopRowProps = {
    stop: DATED, number: 3, open: false, onToggle: vi.fn(), bodyId: "body-r", stay: COVERED,
    plansCount: 4, ideasCount: 3, menuGroups: [[{ key: "edit", label: "Edit name & place", onSelect: vi.fn() }]], ...p,
  };
  return { props, ...render(<StopRow {...props}>{p.children ?? <p>open body</p>}</StopRow>) };
}

describe("StopRow (PLAN.md §3)", () => {
  it("keeps the jump-list anchor and never shrinks", () => {
    const { container } = renderRow();
    const card = container.querySelector("#stop-r")!;
    expect(card).toHaveAttribute("data-stop-id", "r");
    expect(card.className).toMatch(/scroll-mt-6/);
    expect(card.className).toMatch(/flex-none/);
    expect(card.className).toMatch(/rounded-\[20px\]/);
    expect(card.className).toMatch(/shadow-hard-4/);
  });

  it("number tile in the stop colour, name, country, map pin", () => {
    renderRow();
    const tile = screen.getByText("3");
    expect(tile.className).toContain(HUE_CLASSES[stopHue(2)].fill);
    expect(screen.getByRole("heading", { name: "Rome" })).toBeInTheDocument();
    expect(screen.getByText("Italy")).toBeInTheDocument();
  });

  it("dates, nights pill and chips", () => {
    renderRow();
    expect(screen.getByText("Tue 15 – Tue 22 Dec")).toBeInTheDocument();
    expect(screen.getByText("7n")).toBeInTheDocument();
    expect(screen.getByText("Hotel Artemide")).toBeInTheDocument();
    expect(screen.getByText("4 plans")).toBeInTheDocument();
    expect(screen.getByText("3 ideas")).toBeInTheDocument();
  });

  it("hides zero counts; partial and no-bed stay chips", () => {
    const { rerender, props } = renderRow({ plansCount: 0, ideasCount: 0, stay: { ...COVERED, kind: "partial", coveredNights: 5 } });
    expect(screen.queryByText(/plans?$/)).toBeNull();
    const partial = screen.getByText(/Hotel Artemide · 2 nights open/);
    expect(partial.closest("[data-chip]")!.className).toContain("bg-sun/30");
    rerender(<StopRow {...props} stay={{ ...COVERED, kind: "none", name: null, coveredNights: 0 }} />);
    const none = screen.getByText("No bed yet");
    expect(none.closest("[data-chip]")!.className).toMatch(/border-dashed/);
    expect(none.closest("[data-chip]")!.className).toContain("bg-coral/20");
  });

  it("fold toggle: aria, sun when open, body only when open", async () => {
    const { props, rerender } = renderRow();
    const toggle = screen.getByRole("button", { name: "Open Rome" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "body-r");
    expect(screen.queryByText("open body")).toBeNull();
    await userEvent.click(toggle);
    expect(props.onToggle).toHaveBeenCalled();
    rerender(<StopRow {...props} open><p>open body</p></StopRow>);
    const fold = screen.getByRole("button", { name: "Fold Rome" });
    expect(fold.className).toContain("bg-sun");
    expect(document.getElementById("body-r")).toContainElement(screen.getByText("open body"));
  });

  it("the ⋯ menu is the grouped MoreActionsMenu", () => {
    renderRow();
    expect(screen.getByRole("button", { name: "More actions for Rome" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit Rome$/ })).toBeNull();
  });

  it("a same-day visit says so", () => {
    renderRow({ stop: { ...DATED, departDate: "2026-12-15" }, stay: null });
    expect(screen.getByText("Same day")).toBeInTheDocument();
  });

  it("a rough stop: dashed, muted tile, Rough + ~5n, handle, no stay chip", () => {
    const { container } = renderRow({ stop: ROUGH, stay: null, dragHandle: <button>drag Munich</button> });
    const card = container.querySelector("#stop-m")!;
    expect(card.className).toMatch(/border-dashed/);
    expect(card.className).toContain("bg-background");
    expect(card.className).not.toMatch(/shadow-hard/);
    expect(screen.getByText("Rough")).toBeInTheDocument();
    expect(screen.getByText("~5n")).toBeInTheDocument();
    expect(screen.getByText("3").className).toContain("bg-muted");
    expect(screen.getByRole("button", { name: "drag Munich" })).toBeInTheDocument();
    expect(screen.queryByText("No bed yet")).toBeNull();
  });

  it("shows the stop's own notes as a one-line preview", () => {
    renderRow({ stop: { ...DATED, notes: "Book the Vatican early" } });
    expect(screen.getByText("Book the Vatican early").className).toMatch(/truncate/);
  });

  it("uses no banned soft classes", () => {
    const { container } = renderRow({ open: true });
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- components/plan/stop-row.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** (`"use client"`, PLAN.md §3)

- Outer: `<article id={`stop-${stop.id}`} data-stop-id={stop.id} className={cn("group/row relative flex-none scroll-mt-6 overflow-hidden rounded-[20px] border-2 border-border", rough ? "border-dashed bg-background" : "bg-card shadow-hard-4", isPending && "pointer-events-none opacity-60")}>`, where `rough = !stop.arriveDate || !stop.departDate`.
- Head: `<div className={STOP_ROW_GRID}>`:
  1. Number tile (rough stops put `dragHandle` before it in a `flex items-center gap-1` cell, and the grid's first column becomes `auto`: `cn(STOP_ROW_GRID, dragHandle && "grid-cols-[auto_40px_minmax(0,1fr)_auto_auto]")`). The tile is `<span className={cn("grid size-10 place-items-center rounded-xl border-2 border-border font-display text-lg font-extrabold text-on-accent", rough ? "border-dashed bg-muted text-foreground" : HUE_CLASSES[stopHue(stop.sortOrder)].fill)}>{number}</span>`.
  2. Place: `<div className="min-w-0">`, then `<div className="flex min-w-0 items-baseline gap-2"><h2 className="truncate font-display text-2xl font-extrabold tracking-[-0.02em]">{stop.name}</h2>{stop.country && <span className="shrink-0 text-[13px] font-semibold text-muted-foreground">{stop.country}</span>}{coords && <MapLink … />}</div>`. Copy the `MapLink` props from `stop-card.tsx` lines 435–442. Then the chips row `mt-1.5 flex flex-wrap gap-1.5`. Each chip is `<span data-chip className="inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-border px-2.5 text-xs font-bold …">`:
     - Stay, when `stay` is set: covered → `bg-teal/15` with `<Check className="size-3.5" aria-hidden />` and the name; partial → `bg-sun/30`, the same check and `{name} · {total − covered} nights open` ("1 night open" when singular); none → `border-dashed bg-coral/20` with "No bed yet".
     - `{plansCount} plan(s)` when > 0, and `{ideasCount} idea(s)` when > 0, both on `bg-card`.
     - When `stop.notes`: `<p className="mt-1 truncate text-xs text-muted-foreground">{stop.notes}</p>`.
  3. Dates: `<div className="flex flex-col items-end gap-1 whitespace-nowrap">`.
     - Dated: `<span className="text-sm font-bold">{nights === 0 ? "Same day" : formatStayRange(a, d)}</span>`, then `<span className="flex items-center gap-1.5"><span className="text-[11px] font-semibold text-muted-foreground">{tzAbbrev(tz, a)}</span>{nights > 0 && <span className={cn("rounded-full border-2 border-border px-2 text-xs font-extrabold tabular-nums", HUE_CLASSES[stopHue(stop.sortOrder)].fill)}>{nights}n</span>}</span>`.
     - Rough: "Rough" (`text-sm font-bold`) over a `~{stop.nights ?? 1}n` pill (`border-dashed bg-background`).
  4. Actions: `flex items-center gap-2`. `<MoreActionsMenu label={`More actions for ${stop.name}`} groups={menuGroups} triggerClassName="tap-target size-9 rounded-[10px] border-2 border-border bg-card" />` and the fold toggle `<button type="button" aria-expanded={open} aria-controls={bodyId} aria-label={`${open ? "Fold" : "Open"} ${stop.name}`} onClick={onToggle} className={cn("tap-target pressable grid size-9 place-items-center rounded-[10px] border-2 border-border transition-colors duration-[var(--dur-fast)]", open ? "bg-sun" : "bg-card")}>`. Put one `<ChevronDown className={cn("size-4 transition-transform duration-[var(--dur-base)]", open && "rotate-180")} />` inside, so P2 rotates it rather than swapping icons.
- Body: `{open && <div id={bodyId}>{children}</div>}`. Task 24 wraps this in motion.
- Nights: `nightsBetween(a, d)`. Use `whitespace-nowrap shrink-0` on every chip and pill.

- [ ] **Step 4: Run it to see it pass, then the ban scan**

Run: `npm test -- components/plan`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/plan components/trip/stop-card.tsx
git commit -m "feat(plan): folded StopRow (PLAN.md §3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 8: Leg pill, Home base bookend and chapter divider

**Files:**
- Create: `components/plan/leg-pill.tsx`, `components/plan/leg-pill.test.tsx`
- Create: `components/plan/home-base-bookend.tsx`, `components/plan/home-base-bookend.test.tsx`
- Create: `components/plan/chapter-divider.tsx`, `components/plan/chapter-divider.test.tsx`

**Interfaces:**
- Consumes: `LegLabel` (Task 1); `useTripHref` (`components/trip/use-trip-href.ts`); `formatDayLabel`; `hueClasses` (`lib/hues.ts`).
- Produces:
  - `LegRow({ kind, compact, children }: { kind: "legs" | "missing" | "line"; compact?: boolean; children?: React.ReactNode })`
  - `LegPill({ label, onClick, compact }: { label: LegLabel; onClick(): void; compact?: boolean })`
  - `HomeBaseBookend({ tripId, name, variant, dateISO }: { tripId: string; name: string; variant: "origin" | "return"; dateISO: string | null })`
  - `ChapterDivider({ name, colour, summary, dragHandle, actions }: { name: string; colour: string; summary: string; dragHandle?: React.ReactNode; actions?: React.ReactNode })`

- [ ] **Step 1: Write the failing tests**

`components/plan/leg-pill.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plane } from "lucide-react";
import { LegPill, LegRow } from "./leg-pill";

const FLIGHT = { icon: Plane, label: "Flight CDG → FCO", sub: "Tue 15 Dec 10:05", missing: false, accessibleName: "Flight from Paris to Rome, Tuesday 15 December 10:05. Edit." };
const MISSING = { icon: null, label: "How are you getting to Florence?", sub: "Add", missing: true, accessibleName: "Add transport from Rome to Florence" };

describe("LegRow / LegPill (PLAN.md §2)", () => {
  it("a solid connector for legs, dashed otherwise; 52px desktop, 40px compact", () => {
    const { container, rerender } = render(<LegRow kind="legs" />);
    const row = container.firstElementChild as HTMLElement;
    expect(row).toHaveAttribute("data-leg-kind", "legs");
    expect(row.className).toContain("min-h-[52px]");
    expect(row.querySelector("[data-connector]")!.className).not.toMatch(/border-dashed/);
    rerender(<LegRow kind="line" compact />);
    expect((container.firstElementChild as HTMLElement).className).toContain("min-h-10");
    expect(container.querySelector("[data-connector]")!.className).toMatch(/border-dashed/);
  });

  it("a transport pill: icon, label, sub, spoken name, click", async () => {
    const onClick = vi.fn();
    render(<LegPill label={FLIGHT} onClick={onClick} />);
    const pill = screen.getByRole("button", { name: FLIGHT.accessibleName });
    expect(pill.className).toContain("h-[34px]");
    expect(pill.className).toContain("bg-card");
    expect(pill.className).toContain("whitespace-nowrap");
    expect(screen.getByText("Tue 15 Dec 10:05").className).toContain("tabular-nums");
    await userEvent.click(pill);
    expect(onClick).toHaveBeenCalled();
  });

  it("the missing pill is dashed on paper with a coral Add", () => {
    render(<LegPill label={MISSING} onClick={vi.fn()} />);
    const pill = screen.getByRole("button", { name: "Add transport from Rome to Florence" });
    expect(pill.className).toMatch(/border-dashed/);
    expect(pill.className).toContain("bg-background");
    expect(screen.getByText("Add").className).toContain("text-coral-text");
  });

  it("compact: 28px, text-xs; the missing one reads + Add transport", () => {
    render(<LegPill label={MISSING} onClick={vi.fn()} compact />);
    const pill = screen.getByRole("button", { name: "Add transport from Rome to Florence" });
    expect(pill.className).toContain("h-7");
    expect(pill).toHaveTextContent("Add transport");
  });

  it("uses no banned soft classes", () => {
    const { container } = render(<LegRow kind="legs"><LegPill label={FLIGHT} onClick={vi.fn()} /></LegRow>);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
```

`components/plan/home-base-bookend.test.tsx`: use the same `vi.mock("next/link", …)` block as `components/trip/home-base-card.test.tsx` lines 5–10. Then:

```tsx
import { HomeBaseBookend } from "./home-base-bookend";

describe("HomeBaseBookend (PLAN.md §1.3)", () => {
  it("a 44px dashed row linking to settings, with the jump ids", () => {
    const { rerender } = render(<HomeBaseBookend tripId="t1" name="Sydney" variant="origin" dateISO="2026-12-04" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("id", "home-base-top");
    expect(link).toHaveAttribute("href", "/trips/t1/settings");
    expect(link.className).toContain("h-11");
    expect(link.className).toMatch(/border-dashed/);
    expect(screen.getByText("Home base · leave Fri 4 Dec")).toBeInTheDocument();
    rerender(<HomeBaseBookend tripId="t1" name="Sydney" variant="return" dateISO="2027-01-08" />);
    expect(screen.getByRole("link")).toHaveAttribute("id", "home-base-bottom");
    expect(screen.getByText("Home base · back Fri 8 Jan")).toBeInTheDocument();
  });
  it("no date: just Home base", () => {
    render(<HomeBaseBookend tripId="t1" name="Sydney" variant="origin" dateISO={null} />);
    expect(screen.getByText("Home base")).toBeInTheDocument();
  });
});
```

`components/plan/chapter-divider.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { hueClasses } from "@/lib/hues";
import { ChapterDivider } from "./chapter-divider";

describe("ChapterDivider (PLAN.md §1.3)", () => {
  it("an upper-cased pill in the chapter colour, a rule, and the summary", () => {
    const { container } = render(<ChapterDivider name="Italy" colour="rose" summary="2 stops · 15–27 Dec" actions={<button>Firm up</button>} />);
    const pill = screen.getByText("Italy");
    expect(pill.className).toContain("uppercase");
    expect(pill.className).toContain(hueClasses("rose").fill);
    expect(container.querySelector("[data-rule]")!.className).toContain("bg-muted");
    expect(screen.getByText("2 stops · 15–27 Dec")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Firm up" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- components/plan/leg-pill.test.tsx components/plan/home-base-bookend.test.tsx components/plan/chapter-divider.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`leg-pill.tsx`:
- `LegRow`: `<div data-leg-kind={kind} className={cn("flex items-stretch", compact ? "min-h-10" : "min-h-[52px]")}>`.
  - The connector: `<span data-connector aria-hidden className={cn("shrink-0 border-l-2 border-border", compact ? "ml-5" : "ml-[26px]", kind !== "legs" && "border-dashed")} />`.
  - Children, when present: `<div className={cn("flex flex-wrap items-center gap-1.5 py-2", compact ? "ml-3" : "ml-[18px]")}>{children}</div>`. The 6px gap stacks several transports on one line (PLAN.md §2).
- `LegPill`: `<button type="button" aria-label={label.accessibleName} onClick={onClick} className={cn("pressable inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-2 border-border font-bold", compact ? "h-7 px-2.5 text-xs" : "h-[34px] px-3 text-[13px]", label.missing ? "border-dashed bg-background" : "bg-card")}>`.
  - Not missing: `{Icon && <Icon className="size-4" aria-hidden />}`, `<span>{label.label}</span>`, and, when `label.sub`, `<span className="text-xs font-semibold text-muted-foreground tabular-nums">{label.sub}</span>`.
  - Missing, desktop: `<span>{label.label}</span><span className="text-coral-text">{label.sub}</span>`.
  - Missing, compact: `<Plus className="size-3.5" aria-hidden /><span>Add transport</span>`.

`home-base-bookend.tsx` (client, because it uses `useTripHref`): `<Link id={variant === "origin" ? "home-base-top" : "home-base-bottom"} href={tripHref("/settings")} aria-label={`Home base: ${name} — edit in trip settings`} className="pressable flex h-11 scroll-mt-6 items-center gap-2.5 rounded-[14px] border-2 border-dashed border-border bg-background px-3.5">`. Inside go `<House className="size-4" aria-hidden />`, `<span className="text-sm font-bold">{name}</span>` and `<span className="text-[13px] font-semibold text-muted-foreground">{dateISO ? `Home base · ${variant === "origin" ? "leave" : "back"} ${formatDayLabel(dateISO)}` : "Home base"}</span>`.

`chapter-divider.tsx`: `<div className="flex items-center gap-2.5 py-1">{dragHandle}<span className={cn("shrink-0 whitespace-nowrap rounded-full border-2 border-border px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-on-accent", hueClasses(colour).fill)}>{name}</span><span data-rule className="h-0.5 flex-1 bg-muted" /><span className="shrink-0 whitespace-nowrap text-xs font-bold text-muted-foreground">{summary}</span>{actions}</div>`.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -- components/plan`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/plan
git commit -m "feat(plan): leg pill, Home base bookend and chapter divider (PLAN.md §1.3, §2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 9: Stay chip, ideas box and the stay dialog

**Files:**
- Create: `components/plan/stay-chip.tsx`, `components/plan/stay-chip.test.tsx`
- Create: `components/plan/ideas-box.tsx`, `components/plan/ideas-box.test.tsx`
- Modify: `components/trip/day-picker-menu.tsx` (optional `trigger` prop), `components/trip/day-picker-menu.test.tsx`
- Modify: `components/trip/fit-titles.ts` (optional `itemPx`), `components/trip/fit-titles.test.ts`

**Interfaces:**
- Consumes: `StayStatus` (Task 5); `ThingToDo` (`components/plan/types.ts`); `DayPickerMenu`; `fitTitles`; `categoryDotClass` (`components/trip/category-dot.ts`); `Popover`, `PopoverTrigger`, `PopoverContent` (`components/ui/popover.tsx`); `Dialog*` (`components/ui/dialog.tsx`).
- Produces:
  - `StayChip({ stay, rough, onOpen, onAdd }: { stay: StayStatus | null; rough?: boolean; onOpen(): void; onAdd(): void })`
  - `StayDialog({ open, onOpenChange, stopName, rows, onAdd }: { open: boolean; onOpenChange(o: boolean): void; stopName: string; rows: React.ReactNode; onAdd?: () => void })`
  - `IdeasBox({ ideas, days, onPick, onAdd, disabled }: { ideas: ThingToDo[]; days: string[]; onPick(idea: ThingToDo, dateISO: string): void; onAdd(): void; disabled?: boolean })`
  - `DayPickerMenu` gains `trigger?: React.ReactNode` (rendered through `DropdownMenuTrigger asChild` instead of the icon button)
  - `fitTitles(titles, widthPx, { charPx?, gapPx?, overflowPx?, itemPx? })`, where `itemPx` (default 0) adds a fixed per-title cost for chip chrome

- [ ] **Step 1: Write the failing tests**

`components/plan/stay-chip.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StayChip, StayDialog } from "./stay-chip";

const COVERED = { kind: "covered" as const, name: "Hôtel Grands Boulevards", totalNights: 5, coveredNights: 5, extra: 0, checkInTime: "15:00" };

describe("StayChip (PLAN.md §4.1)", () => {
  it("covered: teal, name, ✓ All 5 nights · in 15:00, opens the stay", async () => {
    const onOpen = vi.fn();
    render(<StayChip stay={COVERED} onOpen={onOpen} onAdd={vi.fn()} />);
    const chip = screen.getByRole("button", { name: /Hôtel Grands Boulevards/ });
    expect(chip.className).toContain("bg-teal/15");
    expect(screen.getByText(/All 5 nights · in 15:00/).className).toContain("text-teal-text");
    await userEvent.click(chip);
    expect(onOpen).toHaveBeenCalled();
  });
  it("+1 more when there are several", () => {
    render(<StayChip stay={{ ...COVERED, extra: 1 }} onOpen={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText(/\+1 more/)).toBeInTheDocument();
  });
  it("partial: 3 of 5 nights · Add another place in coral", () => {
    render(<StayChip stay={{ ...COVERED, kind: "partial", coveredNights: 3 }} onOpen={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText("3 of 5 nights · Add another place").className).toContain("text-coral-text");
  });
  it("none: a dashed coral chip that adds a stay", async () => {
    const onAdd = vi.fn();
    render(<StayChip stay={{ ...COVERED, kind: "none", name: null, coveredNights: 0 }} onOpen={vi.fn()} onAdd={onAdd} />);
    const chip = screen.getByRole("button", { name: /No bed yet · \+ Add a stay/ });
    expect(chip.className).toMatch(/border-dashed/);
    await userEvent.click(chip);
    expect(onAdd).toHaveBeenCalled();
  });
  it("rough: Needs dates first, not interactive", () => {
    render(<StayChip stay={null} rough onOpen={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText("Needs dates first")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("StayDialog", () => {
  it("hosts the accommodation rows and + Add a stay", async () => {
    const onAdd = vi.fn();
    render(<StayDialog open onOpenChange={vi.fn()} stopName="Paris" rows={<div>row</div>} onAdd={onAdd} />);
    expect(screen.getByRole("dialog", { name: "Staying in Paris" })).toBeInTheDocument();
    expect(screen.getByText("row")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ Add a stay" }));
    expect(onAdd).toHaveBeenCalled();
  });
});
```

`components/plan/ideas-box.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IdeasBox } from "./ideas-box";

const idea = (id: string, title: string, extra = {}) => ({ id, title, category: "SIGHTSEEING", startTime: null, endTime: null, ...extra });
const IDEAS = [idea("i1", "Musée d'Orsay"), idea("i2", "Sainte-Chapelle", { hiddenFromShares: true }), idea("i3", "Le Bon Marché")];
const DAYS = ["2026-12-10", "2026-12-11"];

afterEach(() => { vi.unstubAllGlobals(); });

describe("IdeasBox (PLAN.md §4.1)", () => {
  it("labels the count and renders one chip per idea, EyeOff on hidden ones", () => {
    render(<IdeasBox ideas={IDEAS} days={DAYS} onPick={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText("3 IDEAS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pick a day for Musée d'Orsay/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Hidden from shares" })).toBeInTheDocument();
  });

  it("a chip opens the day picker and schedules on pick", async () => {
    const onPick = vi.fn();
    render(<IdeasBox ideas={IDEAS} days={DAYS} onPick={onPick} onAdd={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Pick a day for Musée d'Orsay/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Fri 11 Dec" }));
    expect(onPick).toHaveBeenCalledWith(IDEAS[0], "2026-12-11");
  });

  it("+ Add an idea; with no ideas it is all the box shows", async () => {
    const onAdd = vi.fn();
    render(<IdeasBox ideas={[]} days={DAYS} onPick={vi.fn()} onAdd={onAdd} />);
    expect(screen.queryByText(/IDEAS/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "+ Add an idea" }));
    expect(onAdd).toHaveBeenCalled();
  });

  it("overflows into a +N chip when the chips don't fit", async () => {
    vi.stubGlobal("ResizeObserver", class { cb: () => void; constructor(cb: () => void) { this.cb = cb; } observe() { this.cb(); } disconnect() {} });
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 260 } as DOMRect);
    render(<IdeasBox ideas={IDEAS} days={DAYS} onPick={vi.fn()} onAdd={vi.fn()} />);
    const more = await screen.findByRole("button", { name: /^\+\d more ideas$/ });
    await userEvent.click(more);
    expect(await screen.findByText("Le Bon Marché")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("a rough stop's ideas are plain chips (no days to pick)", () => {
    render(<IdeasBox ideas={IDEAS} days={[]} onPick={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Pick a day/ })).toBeNull();
    expect(screen.getByText("Musée d'Orsay")).toBeInTheDocument();
  });

  it("uses no banned soft classes", () => {
    const { container } = render(<IdeasBox ideas={IDEAS} days={DAYS} onPick={vi.fn()} onAdd={vi.fn()} />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
```

Add to `components/trip/fit-titles.test.ts`: `it("itemPx charges each title a fixed chrome cost", () => { expect(fitTitles(["abc", "def"], 100).shown).toBe(2); expect(fitTitles(["abc", "def"], 100, { itemPx: 60 }).shown).toBe(1); });`

Add to `components/trip/day-picker-menu.test.tsx`: `it("renders a custom trigger when given", async () => { render(<DayPickerMenu days={["2026-12-11"]} label="Pick a day for X" onPick={vi.fn()} trigger={<button>X chip</button>} />); await userEvent.click(screen.getByRole("button", { name: "X chip" })); expect(await screen.findByRole("menuitem", { name: "Fri 11 Dec" })).toBeInTheDocument(); });`

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- components/plan/stay-chip.test.tsx components/plan/ideas-box.test.tsx components/trip/fit-titles.test.ts components/trip/day-picker-menu.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`fit-titles.ts`: `const itemPx = opts?.itemPx ?? 0;` and `const widths = titles.map((t) => t.length * charPx + itemPx);`. Nothing else changes.

`day-picker-menu.tsx`: `<DropdownMenuTrigger asChild>{trigger ?? <Button …existing… />}</DropdownMenuTrigger>`. When `trigger` is given, the caller owns its accessible name.

`stay-chip.tsx` (client):
- Base: `"flex-none rounded-[14px] border-2 border-border px-3 py-1.5 text-left"`.
- covered/partial: `<button className={cn(base, "pressable bg-teal/15")} onClick={onOpen}>`, holding `<span className="flex items-center gap-1.5 text-[13px] font-bold"><BedDouble className="size-4" aria-hidden />{name}</span>` and the sub line `text-[11px] font-semibold`:
  - covered: `text-teal-text`, `<Check …/> All {total} nights{checkInTime ? ` · in ${checkInTime}` : ""}{extra ? ` · +${extra} more` : ""}`
  - partial: `text-coral-text`, `{covered} of {total} nights · Add another place`
- none: `<button className={cn(base, "pressable border-dashed bg-coral/20 text-[13px] font-bold")} onClick={onAdd}>No bed yet · + Add a stay</button>`.
- rough (or a null stay): `<div className={cn(base, "border-dashed bg-background text-[13px] font-bold text-muted-foreground")}>Needs dates first</div>`.
- `StayDialog`: `<Dialog open onOpenChange><DialogContent><DialogHeader><DialogTitle>Staying in {stopName}</DialogTitle></DialogHeader><div className="flex flex-col gap-2">{rows}</div>{onAdd && <Button variant="outline" size="md" onClick={onAdd}>+ Add a stay</Button>}</DialogContent></Dialog>`.

`ideas-box.tsx` (client, PLAN.md §4.1):
- Box: `<div className={cn("flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-[14px] border-2 border-dashed border-border px-2.5 py-1.5")}>`.
- With ideas: first `<span className="shrink-0 whitespace-nowrap text-[11px] font-extrabold tracking-[0.08em]">{n} IDEAS</span>`, then a measured `<div ref={chipsRef} className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">`.
- Width: copy `useElementWidth` from `components/trip/stop-day-list.tsx` lines 57–73 into this file. Then `const shown = width ? fitTitles(ideas.map((i) => i.title), width, { charPx: 7, gapPx: 6, overflowPx: 40, itemPx: 44 }).shown : ideas.length`.
- Chip: `const chip = <button type="button" aria-label={`Pick a day for ${idea.title}`} disabled={disabled} className="pressable inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-border bg-card px-2.5 text-xs font-bold"><span className={cn("size-[9px] rounded-full", categoryDotClass(idea.category))} aria-hidden /><span className="max-w-[10rem] truncate">{idea.title}</span>{idea.hiddenFromShares && <span role="img" aria-label="Hidden from shares"><EyeOff className="size-3" aria-hidden /></span>}<ChevronDown className="size-3.5 text-coral-text" aria-hidden /></button>`.
  - With days: `<DayPickerMenu days={days} label={`Pick a day for ${idea.title}`} onPick={(d) => onPick(idea, d)} trigger={chip} />`.
  - With no days (a rough stop): the same visual as a `<span>` with no chevron and no aria-label.
- Overflow: when `shown < ideas.length`, add `<Popover><PopoverTrigger asChild><button aria-label={`+${rest} more ideas`} className="…same chip…">+{rest}</button></PopoverTrigger><PopoverContent align="end" className="flex w-64 flex-col gap-1.5">{the rest, each as the same DayPickerMenu chip}</PopoverContent></Popover>`.
- It ends with `<button type="button" onClick={onAdd} className="shrink-0 whitespace-nowrap text-xs font-bold text-coral-text">+ Add an idea</button>`. With zero ideas the box shows only that button.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -- components/plan components/trip/fit-titles.test.ts components/trip/day-picker-menu.test.tsx components/trip/stop-day-list.test.tsx`
Expected: PASS. `stop-day-list` still uses `fitTitles`/`DayPickerMenu` unchanged.

- [ ] **Step 5: Gates and commit.** Add `components/trip/day-picker-menu.tsx` and `components/trip/fit-titles.ts` to `FILES` in `banned-classes.test.ts`.

```bash
npx tsc --noEmit && npm run lint
git add components/plan components/trip/day-picker-menu.tsx components/trip/day-picker-menu.test.tsx components/trip/fit-titles.ts components/trip/fit-titles.test.ts
git commit -m "feat(plan): stay chip, stay dialog and ideas box with day-picker chips (PLAN.md §4.1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 10: `DayStrip` — slots, tablist, overflow arrows, drop targets

**Files:**
- Create: `lib/plan/strip-scroll.ts`, `lib/plan/strip-scroll.test.ts`
- Create: `components/plan/day-strip.tsx`, `components/plan/day-strip.test.tsx`

**Interfaces:**
- Consumes: `DaySlot` (Task 2); `useDroppable` (`@dnd-kit/core`); `categoryClasses` (`lib/categories.ts`).
- Produces:
  - `stripScrollLeft(i: { slotLeft: number; slotWidth: number; viewportWidth: number; scrollLeft: number; pad?: number }): number`
  - `SLOT_DROP_PREFIX = "slot:"`; `slotDropId(stopId: string, dateISO: string): string`
  - `DayStrip({ stopId, slots, selected, onSelect, onOpen, panelId, flashDate }: { stopId: string; slots: DaySlot[]; selected: string; onSelect(dateISO: string): void; onOpen(dateISO: string): void; panelId: string; flashDate?: string | null })`
  - Each slot registers `useDroppable({ id: slotDropId(stopId, date), data: { type: "slot", stopId, date } })`. Tab ids are `${panelId}-tab-${date}`.

- [ ] **Step 1: Write the failing tests**

`lib/plan/strip-scroll.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stripScrollLeft } from "./strip-scroll";

describe("stripScrollLeft (PLAN.md §4.2: scrollLeft maths, never scrollIntoView)", () => {
  it("leaves a visible slot alone", () => {
    expect(stripScrollLeft({ slotLeft: 100, slotWidth: 60, viewportWidth: 400, scrollLeft: 50 })).toBe(50);
  });
  it("brings a slot off the left edge in, with padding", () => {
    expect(stripScrollLeft({ slotLeft: 20, slotWidth: 60, viewportWidth: 400, scrollLeft: 100 })).toBe(12);
    expect(stripScrollLeft({ slotLeft: 4, slotWidth: 60, viewportWidth: 400, scrollLeft: 100 })).toBe(0);
  });
  it("brings a slot off the right edge in, with padding", () => {
    expect(stripScrollLeft({ slotLeft: 500, slotWidth: 60, viewportWidth: 400, scrollLeft: 0 })).toBe(168);
  });
});
```

`components/plan/day-strip.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { daySlots } from "@/lib/plan/day-density";
import { DayStrip } from "./day-strip";

const STOP = { arriveDate: "2026-12-10", departDate: "2026-12-14" };
const SLOTS = daySlots(
  STOP,
  [{ id: "a", date: "2026-12-11", category: "FOOD" }, { id: "b", date: "2026-12-11", category: "SIGHTSEEING" }],
  { "2026-12-12": { title: "Versailles day" } },
  { prevDepartDate: "2026-12-10" },
);

function renderStrip(p: Partial<React.ComponentProps<typeof DayStrip>> = {}) {
  const props = { stopId: "par", slots: SLOTS, selected: "2026-12-11", onSelect: vi.fn(), onOpen: vi.fn(), panelId: "panel-par", ...p };
  return { props, ...render(<DayStrip {...props} />) };
}

describe("DayStrip (PLAN.md §4.2)", () => {
  it("a tablist with one tab per day, the selected one coral", () => {
    renderStrip();
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    expect(tabs).toHaveLength(5);
    const fri = screen.getByRole("tab", { name: /FRI 11/ });
    expect(fri).toHaveAttribute("aria-selected", "true");
    expect(fri).toHaveAttribute("aria-controls", "panel-par");
    expect(fri).toHaveAttribute("tabindex", "0");
    expect(fri.className).toContain("bg-coral");
    expect(screen.getByRole("tab", { name: /SAT 12/ })).toHaveAttribute("tabindex", "-1");
  });

  it("dots per plan, a sun band for a titled day, Free on an empty day", () => {
    renderStrip();
    expect(screen.getByRole("tab", { name: /FRI 11/ }).querySelectorAll("[data-dot]")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: /SAT 12/ }).querySelector("[data-band]")!.className).toContain("bg-sun");
    const sun = screen.getByRole("tab", { name: /SUN 13/ });
    expect(sun.className).toMatch(/border-dashed/);
    expect(within(sun).getByText("Free")).toBeInTheDocument();
  });

  it("marks the arriving changeover day", () => {
    renderStrip();
    expect(screen.getByRole("tab", { name: /THU 10/ }).querySelector("[data-changeover='arrive']")).not.toBeNull();
  });

  it("click selects; arrows, Home and End move; Enter opens the day", async () => {
    const { props } = renderStrip();
    await userEvent.click(screen.getByRole("tab", { name: /SAT 12/ }));
    expect(props.onSelect).toHaveBeenLastCalledWith("2026-12-12");
    screen.getByRole("tab", { name: /FRI 11/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(props.onSelect).toHaveBeenLastCalledWith("2026-12-12");
    await userEvent.keyboard("{ArrowLeft}");
    expect(props.onSelect).toHaveBeenLastCalledWith("2026-12-10");
    await userEvent.keyboard("{End}");
    expect(props.onSelect).toHaveBeenLastCalledWith("2026-12-14");
    await userEvent.keyboard("{Home}");
    expect(props.onSelect).toHaveBeenLastCalledWith("2026-12-10");
    await userEvent.keyboard("{Enter}");
    expect(props.onOpen).toHaveBeenCalledWith("2026-12-11");
  });

  it("more than 11 days: a scroller with arrow buttons", () => {
    const long = daySlots({ arriveDate: "2026-12-01", departDate: "2026-12-14" }, []);
    renderStrip({ slots: long, selected: "2026-12-01" });
    expect(screen.getByRole("tablist").className).toMatch(/overflow-x-auto/);
    expect(screen.getByRole("button", { name: "Later days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Earlier days" })).toBeInTheDocument();
  });

  it("uses no banned soft classes", () => {
    const { container } = renderStrip();
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- lib/plan/strip-scroll.test.ts components/plan/day-strip.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/plan/strip-scroll.ts`:

```ts
export function stripScrollLeft({ slotLeft, slotWidth, viewportWidth, scrollLeft, pad = 8 }: {
  slotLeft: number; slotWidth: number; viewportWidth: number; scrollLeft: number; pad?: number;
}): number {
  if (slotLeft < scrollLeft) return Math.max(0, slotLeft - pad);
  if (slotLeft + slotWidth > scrollLeft + viewportWidth) return slotLeft + slotWidth - viewportWidth + pad;
  return scrollLeft;
}
```

`components/plan/day-strip.tsx` (client):
- `const scrolls = slots.length > 11`.
- Wrapper `relative flex items-center gap-1.5`. When `scrolls`, round arrow buttons sit at each end: `<button aria-label="Earlier days" className={cn("tap-target grid size-9 shrink-0 place-items-center rounded-full border-2 border-border bg-card transition-opacity duration-[var(--dur-fast)]", !canLeft && "pointer-events-none opacity-0")}>` with `ChevronLeft`, and "Later days" with `ChevronRight`. They scroll the list by `clientWidth * 0.8` via `el.scrollTo({ left, behavior })`.
- `canLeft`/`canRight` state comes from an `onScroll` handler (`scrollLeft > 0`, `scrollLeft + clientWidth < scrollWidth - 1`). Set the initial values in a microtask after mount. In jsdom both widths are 0, so render the arrows anyway, just faded.
- List: `<div role="tablist" aria-label="Days" ref={listRef} className={cn("flex flex-1 gap-1.5", scrolls && "snap-x overflow-x-auto [scrollbar-width:none]")}>`.
- Keep the selected slot in view: `useEffect([selected])` reads the selected tab's `offsetLeft`/`offsetWidth` and the list's `clientWidth`/`scrollLeft`. When `stripScrollLeft(...)` differs, call `list.scrollTo({ left, behavior: reduced ? "auto" : "smooth" })`, where `reduced = useReducedMotion()` from `motion/react`.
- Slot is an inner component that calls `useDroppable` (`const { setNodeRef, isOver } = useDroppable({ id: slotDropId(stopId, s.dateISO), data: { type: "slot", stopId, date: s.dateISO } })`). It renders:
  - `<button ref={setNodeRef} role="tab" id={`${panelId}-tab-${s.dateISO}`} aria-selected={sel} aria-controls={panelId} tabIndex={sel ? 0 : -1} data-over={isOver || undefined} data-flash={flashDate === s.dateISO || undefined} onClick={() => onSelect(s.dateISO)} onKeyDown={onKey} className={cn("@container pressable flex h-16 min-w-[58px] flex-1 snap-start flex-col items-center overflow-hidden rounded-[14px] border-2 border-border", s.count === 0 && !sel ? "border-dashed bg-background" : "bg-card", sel && "-translate-y-0.5 bg-coral text-on-accent shadow-hard-1")}>`
  - `<span data-band aria-hidden className={cn("h-1.5 w-full shrink-0", s.title && "border-b-[1.5px] border-border bg-sun")} />`
  - `<span className="mt-1 flex items-center gap-0.5 text-[10px] font-extrabold tracking-[0.08em]">{s.changeover === "arrive" && <ArrowRight data-changeover="arrive" className="size-3" aria-hidden />}{s.dow} {s.num}</span>`
  - The title line `<span className="hidden max-w-full truncate px-1 font-display text-[13px] @[90px]:block">{s.title ?? (s.count === 0 ? "Free" : "")}</span>`. On an empty untitled day show "Free" at every width: give that span `block` instead of `hidden`.
  - `<span className="mt-auto mb-1.5 flex gap-[3px]">{s.dots.map((c, i) => <span key={i} data-dot className={cn("size-[7px] rounded-full border border-border", sel ? "bg-card" : categoryClasses(c).fill)} />)}</span>`
- `onKey`: ArrowRight/ArrowLeft select the neighbour (clamped), Home the first, End the last, and each moves focus to that tab (`document.getElementById(tabId)?.focus()`). Enter calls `onOpen(s.dateISO)`. `preventDefault` on each.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -- lib/plan/strip-scroll.test.ts components/plan`
Expected: PASS. `useDroppable` works without a `DndContext` ancestor (dnd-kit supplies a default context). If it throws in jsdom, wrap the test render in `<DndContext>` from `@dnd-kit/core`.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add lib/plan/strip-scroll.ts lib/plan/strip-scroll.test.ts components/plan
git commit -m "feat(plan): day strip — tablist slots, density dots, changeover arrow, overflow arrows, drop targets (PLAN.md §4.2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 11: `SelectedDay` — the day panel

**Files:**
- Create: `components/plan/selected-day.tsx`, `components/plan/selected-day.test.tsx`

**Interfaces:**
- Consumes: `useDayTitleEditor`, `DAY_TITLE_MAX_LENGTH` (`components/trip/day-title-editor.ts`); `useTripHref`; `useDraggable` (`@dnd-kit/core`); `StopDayItem` (`lib/stop-days.ts`); `CostRow`; `formatMoney`, `sumMinorToHome` (`lib/money.ts`); `formatDayLabel`; `categoryDotClass`; `ItemPhotoThumb`.
- Produces:
  - `ITEM_DRAG_PREFIX = "item:"`
  - `SelectedDay(props: SelectedDayProps)`, where `interface SelectedDayProps { tripId: string; stopId: string; dateISO: string; dayTitle?: string; items: StopDayItem[]; costsById?: Map<string, CostRow[]>; homeCurrency?: string; ideasCount: number; panelId: string; tabId: string; showDragHint: boolean; onAdd(dateISO: string): void; onEditItem(item: StopDayItem): void; onPickIdea(): void }`
  - `claimDragHint(): boolean`. It returns true the first time in a browser session and records it in `sessionStorage["plan-drag-hint"]`. It returns false after that, and when storage throws.
  - Rows register `useDraggable({ id: `item:${item.id}`, data: { type: "item", stopId, date: dateISO, itemId: item.id, title: item.title, startTime: item.startTime ?? null, endTime: item.endTime ?? null } })`.

- [ ] **Step 1: Write the failing test** — `components/plan/selected-day.test.tsx`. Mock `next/link` as in Task 8. Mock `next/navigation` (`useRouter: () => ({ refresh: vi.fn() })`). Mock `@/server/actions/day-titles` (`setDayTitle: vi.fn(async () => ({ success: true }))`).

```tsx
import { SelectedDay, claimDragHint } from "./selected-day";
import { setDayTitle } from "@/server/actions/day-titles";

const ITEMS = [
  { id: "a", title: "Café Kitsuné", category: "FOOD", date: "2026-12-11", startTime: "09:00", address: "Palais Royal" },
  { id: "b", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-11", startTime: "10:00", booking: "LVR-123", notes: "Richelieu entrance" },
  { id: "c", title: "Picnic", category: "FOOD", date: "2026-12-11", hiddenFromShares: true },
];
const COSTS = new Map([["b", [{ id: "k", costMinor: 2200, paidMinor: null, currency: "EUR", rateToHome: 1.65, paidAt: null, dueDate: null, ownerType: "ITEM", ownerId: "b", label: null, category: null, settlement: "BEFORE" }]]]);

function renderDay(p = {}) {
  const props = { tripId: "t1", stopId: "par", dateISO: "2026-12-11", dayTitle: "Museums & Septime", items: ITEMS, costsById: COSTS, homeCurrency: "EUR", ideasCount: 3, panelId: "panel-par", tabId: "panel-par-tab-2026-12-11", showDragHint: true, onAdd: vi.fn(), onEditItem: vi.fn(), onPickIdea: vi.fn(), ...p };
  return { props, ...render(<SelectedDay {...props} />) };
}

describe("SelectedDay (PLAN.md §4.3)", () => {
  it("a tabpanel labelled by its tab, with a sun head", () => {
    renderDay();
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "panel-par");
    expect(panel).toHaveAttribute("aria-labelledby", "panel-par-tab-2026-12-11");
    expect(screen.getByText("FRI 11 DEC")).toBeInTheDocument();
    expect(screen.getByText("3 plans · 1 booked · €22.00 so far")).toBeInTheDocument();
  });

  it("Open day links to the Day view; + Add presets the date", async () => {
    const { props } = renderDay();
    expect(screen.getByRole("link", { name: /Open day/ })).toHaveAttribute("href", "/trips/t1/day/2026-12-11");
    await userEvent.click(screen.getByRole("button", { name: "+ Add" }));
    expect(props.onAdd).toHaveBeenCalledWith("2026-12-11");
  });

  it("rows: time or dash, title, sub line, Booked, cost, EyeOff; click edits", async () => {
    const { props } = renderDay();
    expect(screen.getByText("09:00").className).toContain("tabular-nums");
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Palais Royal")).toBeInTheDocument();
    expect(screen.getByText("Richelieu entrance")).toBeInTheDocument();
    expect(screen.getByText(/Booked/)).toBeInTheDocument();
    expect(screen.getByText("€22.00")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Hidden from shares" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit Louvre" }));
    expect(props.onEditItem).toHaveBeenCalledWith(ITEMS[1]);
    expect(screen.getByRole("button", { name: "Drag Louvre to another day" })).toBeInTheDocument();
  });

  it("edits the day title inline: Enter saves via setDayTitle", async () => {
    renderDay();
    await userEvent.click(screen.getByRole("button", { name: /Edit the day title/ }));
    const input = screen.getByRole("textbox", { name: /Day title/ });
    await userEvent.clear(input);
    await userEvent.type(input, "Paris museums{Enter}");
    expect(setDayTitle).toHaveBeenCalledWith({ stopId: "par", date: "2026-12-11", title: "Paris museums" });
  });

  it("untitled: Add a title", () => {
    renderDay({ dayTitle: undefined });
    expect(screen.getByRole("button", { name: /Add a title/ })).toBeInTheDocument();
  });

  it("empty day: Nothing planned yet, + Add to Fri 11, or pick an idea", async () => {
    const { props } = renderDay({ items: [] });
    expect(screen.getByText("Nothing planned yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ Add to Fri 11" }));
    expect(props.onAdd).toHaveBeenCalledWith("2026-12-11");
    await userEvent.click(screen.getByRole("button", { name: "or pick an idea" }));
    expect(props.onPickIdea).toHaveBeenCalled();
  });

  it("footer: + Add to the day and the drag hint only when asked", () => {
    const { rerender, props } = renderDay();
    expect(screen.getByText("Drag a plan onto a day above to move it")).toBeInTheDocument();
    rerender(<SelectedDay {...props} showDragHint={false} />);
    expect(screen.queryByText("Drag a plan onto a day above to move it")).toBeNull();
  });

  it("claimDragHint is true once per session", () => {
    sessionStorage.clear();
    expect(claimDragHint()).toBe(true);
    expect(claimDragHint()).toBe(false);
  });

  it("uses no banned soft classes", () => {
    const { container } = renderDay();
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
```

Check the sum: one EUR cost of 2200 minor in a EUR home gives "€22.00". `formatMoney(2200, "EUR")` in en-AU prints "€22.00". If the runtime prints "EUR 22.00", assert `formatMoney(2200, "EUR")` instead of the literal.

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- components/plan/selected-day.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** (`"use client"`, PLAN.md §4.3)

- Card: `<section role="tabpanel" id={panelId} aria-labelledby={tabId} className="overflow-hidden rounded-2xl border-2 border-border bg-card shadow-hard-3">`.
- Head: `<div className="flex flex-wrap items-center gap-2.5 border-b-2 border-border bg-sun px-3.5 py-2.5 text-on-accent">`:
  - `<span className="text-[11px] font-extrabold tracking-[0.08em]">{formatDayLabel(dateISO).toUpperCase()}</span>`.
  - Title: use `const ed = useDayTitleEditor({ stopId, date: dateISO, title: dayTitle })`.
    - Editing: `<label htmlFor={id} className="sr-only">Day title for {formatDayLabel(dateISO)}</label><input id={id} autoFocus value={ed.value} onChange={(e) => ed.setValue(e.target.value)} onBlur={() => void ed.save()} onKeyDown={ed.onKeyDown} maxLength={DAY_TITLE_MAX_LENGTH} className="min-w-0 flex-1 bg-transparent font-display text-[22px] font-extrabold outline-none" />`. Same font and size, so there's no size jump (P5).
    - Idle and titled: `<button onClick={ed.startEditing} aria-label={`Edit the day title, ${dayTitle}`} className="inline-flex min-w-0 items-center gap-1.5 font-display text-[22px] font-extrabold"><span className="truncate">{dayTitle}</span><Pencil className="size-4" aria-hidden /></button>`.
    - Untitled: the same button with `aria-label="Add a title"`, showing `<span className="text-foreground/45">Add a title</span>`.
  - Summary: `<span className="text-xs font-semibold text-on-accent-muted">{summary}</span>`. Build it from `plural(n, "plan")`, then `${booked} booked` when > 0, then `${formatMoney(total, homeCurrency)} so far` when the day has any costs. `total` is `sumMinorToHome(costs.map((c) => ({ amountMinor: c.costMinor, currency: c.currency })), homeCurrency, (cur) => costs.find((c) => c.currency.toUpperCase() === cur)?.rateToHome ?? undefined).totalMinor`, over every cost of the day's items.
  - `ml-auto` group: `<Link href={tripHref(`/day/${dateISO}`)} className="pressable inline-flex h-9 items-center gap-1 rounded-full border-2 border-border bg-card px-3 text-[13px] font-extrabold">Open day <ChevronRight className="size-4" aria-hidden /></Link>` and `<Button variant="primary" size="sm" onClick={() => onAdd(dateISO)}>+ Add</Button>`.
- Rows: order is `[...timed, ...untimed]` from `buildStopDays(dateISO, dateISO, items)[0]` (`lib/stop-days.ts`). Each row is an inner component that calls `useDraggable`:
  - `<div ref={setNodeRef} data-row className="grid min-h-10 grid-cols-[14px_46px_12px_minmax(0,1fr)_auto] items-center gap-2.5 border-b-2 border-muted px-3.5 last:border-b-0">`
  - `<button {...listeners} {...attributes} aria-label={`Drag ${title} to another day`} className="tap-target cursor-grab touch-none text-muted-foreground"><GripVertical className="size-3.5" /></button>`
  - `<span className={cn("text-[13px] font-extrabold tabular-nums", !startTime && "text-muted-foreground")}>{startTime ?? "—"}</span>`
  - `<span className={cn("size-[11px] rounded-full border border-border", categoryDotClass(category))} aria-hidden />`
  - `<button aria-label={`Edit ${title}`} onClick={() => onEditItem(item)} className="flex min-w-0 items-baseline gap-2 text-left"><span className="shrink-0 text-sm font-bold">{title}</span><span className="truncate text-xs text-muted-foreground">{address ?? notes?.split("\n")[0]}</span></button>`
  - Tags, `flex items-center gap-1.5`: Booked (`rounded-full border-2 border-border bg-teal/15 px-2 text-xs font-bold` "Booked" + `<Check className="size-3" />`) when `booking`; the cost chip `formatMoney(sum of that item's costs in the first cost's currency, currency)` in `tabular-nums`; `<ItemPhotoThumb src={photoUrl} alt={title} />` when `photoUrl`; and `<span role="img" aria-label="Hidden from shares"><EyeOff className="size-3.5" /></span>` when `hiddenFromShares`.
- Empty day: one row, `px-3.5 py-3 text-sm`: "Nothing planned yet", then `<button className="font-bold text-coral-text" onClick={() => onAdd(dateISO)}>+ Add to {formatDayLabel(dateISO) without the month}</button>`, then, when `ideasCount > 0`, `<button onClick={onPickIdea}>or pick an idea</button>`. The label is "+ Add to Fri 11": strip the month with `.replace(/ [A-Z][a-z]{2}$/, "")`.
- Footer, when there are rows: `<div className="flex items-center justify-between px-3.5 py-2">`, holding `<button className="text-[13px] font-bold text-coral-text" onClick={() => onAdd(dateISO)}>+ Add to Fri 11</button>` and, when `showDragHint`, `<span className="text-[13px] text-on-accent-muted">Drag a plan onto a day above to move it</span>`.
- `claimDragHint()`: `try { if (sessionStorage.getItem("plan-drag-hint")) return false; sessionStorage.setItem("plan-drag-hint", "1"); return true; } catch { return false; }`.

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- components/plan`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/plan
git commit -m "feat(plan): selected-day panel — inline day title, draggable rows, tags, once-a-session hint (PLAN.md §4.3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 12: `StopOpenBody`, the extras link row and the extras dialog

**Files:**
- Create: `components/plan/stop-open-body.tsx`, `components/plan/stop-open-body.test.tsx`
- Create: `components/plan/stop-extras-dialog.tsx`, `components/plan/stop-extras-dialog.test.tsx`

**Interfaces:**
- Consumes: `StayChip` and `IdeasBox` (Task 9), `DayStrip` (Task 10), `SelectedDay` (Task 11), `usePlanBody` (Task 6), `daySlots`/`defaultSelectedDay` (Task 2); `NoteThread` (`components/trip/note-thread.tsx`), `AttachmentList` (`components/trip/attachment-list.tsx`), `ReminderItem` (`server/actions/reminders.ts`), `formatDayLabel`.
- Produces:
  - `type ExtrasKind = "notes" | "files" | "reminders"`
  - `StopOpenBody(props: StopOpenBodyProps)`, where `interface StopOpenBodyProps { tripId: string; stop: StopCardStop; slots: DaySlot[]; dayItems: StopDayItem[]; dayTitles?: Record<string, { title: string }>; ideas: ThingToDo[]; costsById?: Map<string, CostRow[]>; homeCurrency?: string; stay: StayStatus | null; counts: { files: number; notes: number; reminders: number }; showDragHint: boolean; flashDate?: string | null; onOpenStay(): void; onAddStay(): void; onAddIdea(): void; onScheduleIdea(idea: ThingToDo, dateISO: string): void; onAddPlan(dateISO: string): void; onEditItem(item: StopDayItem): void; onGiveDates(): void; onOpenExtras(kind: ExtrasKind): void }`
  - `StopExtrasDialog({ kind, onOpenChange, tripId, stopId, stopName, notes, attachments, reminders, currentUserId, onAddReminder }: { kind: ExtrasKind | null; onOpenChange(open: boolean): void; tripId: string; stopId: string; stopName: string; notes: NoteView[]; attachments: AttachmentView[]; reminders: ReminderItem[]; currentUserId?: string; onAddReminder?: () => void })`

- [ ] **Step 1: Write the failing tests**

`components/plan/stop-open-body.test.tsx`: mock `next/link`, `next/navigation` and `@/server/actions/day-titles` as in Task 11. Wrap renders in `<PlanBody initialOpen={["par"]} today={…}>`, from Task 6. It defaults to a date outside the stay, so the "first day with plans" rule is what's exercised.

```tsx
const PARIS = { id: "par", name: "Paris", country: "France", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-14", nights: null, pinned: false, chapterId: null, sortOrder: 1, notes: null, lat: null, lng: null };
const MUNICH = { ...PARIS, id: "mun", name: "Munich", arriveDate: null, departDate: null, nights: 5, timezone: null };
const ITEMS = [{ id: "a", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-11", startTime: "10:00" }];
const baseProps = (over = {}) => ({
  tripId: "t1", stop: PARIS, slots: daySlots(PARIS, ITEMS), dayItems: ITEMS, ideas: [], stay: null,
  counts: { files: 2, notes: 3, reminders: 1 }, showDragHint: false,
  onOpenStay: vi.fn(), onAddStay: vi.fn(), onAddIdea: vi.fn(), onScheduleIdea: vi.fn(), onAddPlan: vi.fn(),
  onEditItem: vi.fn(), onGiveDates: vi.fn(), onOpenExtras: vi.fn(), ...over,
});
const wrap = (ui: React.ReactNode, today = "2026-12-30") => render(<PlanBody initialOpen={["par"]} today={today}>{ui}</PlanBody>);

describe("StopOpenBody (PLAN.md §4, §5; spec D2)", () => {
  it("dated: strip row, day strip, and the default day selected (first with plans)", () => {
    wrap(<StopOpenBody {...baseProps()} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /FRI 11/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Louvre");
  });

  it("selecting a day switches the panel", async () => {
    wrap(<StopOpenBody {...baseProps()} />);
    await userEvent.click(screen.getByRole("tab", { name: /SAT 12/ }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Nothing planned yet");
  });

  it("today wins when it falls in the stay", () => {
    wrap(<StopOpenBody {...baseProps()} />, "2026-12-12");
    expect(screen.getByRole("tab", { name: /SAT 12/ })).toHaveAttribute("aria-selected", "true");
  });

  it("the quiet link row: 2 files · 3 notes · 1 reminder, each opening its dialog", async () => {
    const props = baseProps();
    wrap(<StopOpenBody {...props} />);
    const row = screen.getByTestId("stop-extras-links");
    expect(row.className).toContain("text-[13px]");
    await userEvent.click(within(row).getByRole("button", { name: "3 notes" }));
    expect(props.onOpenExtras).toHaveBeenCalledWith("notes");
    await userEvent.click(within(row).getByRole("button", { name: "2 files" }));
    expect(props.onOpenExtras).toHaveBeenCalledWith("files");
    expect(within(row).getByRole("button", { name: "1 reminder" })).toBeInTheDocument();
  });

  it("no extras: no link row", () => {
    wrap(<StopOpenBody {...baseProps({ counts: { files: 0, notes: 0, reminders: 0 } })} />);
    expect(screen.queryByTestId("stop-extras-links")).toBeNull();
  });

  it("rough: Needs dates first, ideas, Give it dates; no strip", async () => {
    const props = baseProps({ stop: MUNICH, slots: [], dayItems: [] });
    wrap(<StopOpenBody {...props} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("Needs dates first")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Give it dates" }));
    expect(props.onGiveDates).toHaveBeenCalled();
  });

  it("uses no banned soft classes", () => {
    const { container } = wrap(<StopOpenBody {...baseProps()} />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
```

`components/plan/stop-extras-dialog.test.tsx`: mock `@/components/trip/note-thread` to `NoteThread: () => <div>note thread</div>`. Mock `@/components/trip/attachment-list` to `AttachmentList: () => <div>attachment list</div>`.

```tsx
describe("StopExtrasDialog (spec D2)", () => {
  const base = { onOpenChange: vi.fn(), tripId: "t1", stopId: "par", stopName: "Paris", notes: [], attachments: [], currentUserId: "u1",
    reminders: [{ id: "r1", title: "Book the Louvre", date: "2026-11-20", stopId: "par", stopName: "Paris" }] };
  it("notes hosts the NoteThread", () => {
    render(<StopExtrasDialog kind="notes" {...base} />);
    expect(screen.getByRole("dialog", { name: "Notes · Paris" })).toHaveTextContent("note thread");
  });
  it("files hosts the AttachmentList", () => {
    render(<StopExtrasDialog kind="files" {...base} />);
    expect(screen.getByRole("dialog", { name: "Files · Paris" })).toHaveTextContent("attachment list");
  });
  it("reminders lists them with their day and offers Add a reminder", async () => {
    const onAddReminder = vi.fn();
    render(<StopExtrasDialog kind="reminders" {...base} onAddReminder={onAddReminder} />);
    expect(screen.getByText("Book the Louvre")).toBeInTheDocument();
    expect(screen.getByText("Fri 20 Nov")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add a reminder" }));
    expect(onAddReminder).toHaveBeenCalled();
  });
  it("closed when kind is null", () => {
    render(<StopExtrasDialog kind={null} {...base} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- components/plan/stop-open-body.test.tsx components/plan/stop-extras-dialog.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`stop-open-body.tsx` (client):
- Container: `<div className="flex flex-col gap-2.5 border-t-2 border-border bg-background px-4 pb-3.5 pt-3">`.
- `rough = !stop.arriveDate || !stop.departDate`.
- Strip row: `<div className="flex items-stretch gap-2.5"><StayChip stay={stay} rough={rough} onOpen={onOpenStay} onAdd={onAddStay} /><IdeasBox ideas={ideas} days={rough ? [] : slots.map((s) => s.dateISO)} onPick={onScheduleIdea} onAdd={onAddIdea} /></div>`.
- Rough: then `<Button variant="primary" size="sm" className="self-start" onClick={onGiveDates}>Give it dates</Button>`.
- Dated, the selected day:
  - `const b = usePlanBody()`
  - `const fromHash = b.hashDay && slots.some((s) => s.dateISO === b.hashDay) ? b.hashDay : null`
  - `const selected = b.selectedDay(stop.id) ?? fromHash ?? defaultSelectedDay(slots, b.today) ?? slots[0]?.dateISO`
  - `onSelect={(d) => b.selectDay(stop.id, d)}`
  - Keep a local fallback state for tests without a provider: `const [local, setLocal] = useState<string | null>(null)`. Use `b.today ? b-flow : local-flow`. The inert default has `today: ""`.
  - `panelId = `day-panel-${stop.id}``
  - `<DayStrip stopId={stop.id} slots={slots} selected={selected} onSelect={…} onOpen={(d) => router.push(tripHref(`/day/${d}`))} panelId={panelId} flashDate={flashDate} />`. Get `router` from `useRouter()` (next/navigation) and `tripHref` from `useTripHref(tripId)`.
  - `<SelectedDay … dateISO={selected} items={dayItems.filter((i) => i.date === selected)} dayTitle={dayTitles?.[selected]?.title} tabId={`${panelId}-tab-${selected}`} ideasCount={ideas.length} onPickIdea={…} />`. `onPickIdea` focuses the first idea chip: `document.querySelector<HTMLButtonElement>(`#stop-${stop.id} [aria-label^="Pick a day for"]`)?.click()`.
- Link row (spec D2), shown when any count is > 0: `<div data-testid="stop-extras-links" className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">`. Each non-zero part is a `<button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onOpenExtras(kind)}>`: `Paperclip` "{n} file(s)", `MessageCircle` "{n} note(s)", `Bell` "{n} reminder(s)". Put `<span aria-hidden>·</span>` between them.

`stop-extras-dialog.tsx`: `<Dialog open={kind !== null} onOpenChange={onOpenChange}><DialogContent>`, then `<DialogHeader><DialogTitle>{Notes|Files|Reminders} · {stopName}</DialogTitle></DialogHeader>`, then:
- notes, when `currentUserId`: `<NoteThread inline tripId={tripId} targetType="STOP" targetId={stopId} notes={notes} currentUserId={currentUserId} />`
- files: `<AttachmentList tripId={tripId} targetType="STOP" targetId={stopId} attachments={attachments} compact />`
- reminders: move the reminders `<ul>` markup from `components/trip/stop-card.tsx` lines 562–572 in verbatim. Then, when `onAddReminder`, add `<Button variant="outline" size="sm" onClick={onAddReminder}><Bell /> Add a reminder</Button>`.

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -- components/plan`
Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/plan
git commit -m "feat(plan): open stop body with stay/ideas strip, day strip, selected day, extras links and dialog (PLAN.md §4, §5; spec D2)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---
### Task 13: `ItineraryManager` renders the new desktop list (and drags plans onto days)

This is the big one. **Keep every handler, every piece of state apart from `collapsedGroups`, every dialog, `summariseReorder`, `undoPayloadFor`, the derived-state resync and the stop/chapter drag logic exactly as they are.** Replace only the JSX that lays out stops, legs, bookends and chapter groups. Read the whole of `components/trip/itinerary-manager.tsx` (2531 lines) and `components/trip/stop-card.tsx` before starting. `StopCard` currently owns the things-to-do dialogs and `handleScheduleThing`. They move up into the manager here.

**Files:**
- Create: `components/plan/plan-dnd.ts`, `components/plan/plan-dnd.test.ts`
- Modify: `components/plan/types.ts` (add `toItemCardItem`)
- Modify: `components/trip/itinerary-manager.tsx`
- Modify: `components/trip/itinerary-manager.test.tsx`
- Modify: `components/trip/transport-form-dialog.tsx` (optional `onDelete` prop only. Task 20 restyles it.)
- Modify: `components/plan/banned-classes.test.ts` (add `components/trip/itinerary-manager.tsx` and `components/trip/transport-form-dialog.tsx` to `FILES`, then fix any hit)

**Interfaces:**
- Consumes: everything from Tasks 1–12; `scheduleItem` (`server/actions/items.ts`); `toastWithUndo` (`components/ui/undo-toast.tsx`); `pointerWithin`, `closestCenter`, `CollisionDetection` (`@dnd-kit/core`); `ItemFormDialog` (`components/trip/item-form-dialog.tsx`); `ItemCardItem` (`components/trip/item-card.tsx`).
- Produces:
  - `plan-dnd.ts`:
    - `interface ItemDragData { type: "item"; stopId: string; date: string; itemId: string; title: string; startTime: string | null; endTime: string | null }`
    - `interface ItemDrop { itemId: string; title: string; stopId: string; from: { date: string; startTime: string | null; endTime: string | null }; to: string }`
    - `resolveItemDrop(active: unknown, over: unknown): ItemDrop | null`
    - `scheduleInputFor(date: string, times: { startTime: string | null; endTime: string | null }): { date: string; startTime?: string; endTime?: string }`
    - `planCollisionDetection: CollisionDetection`
  - `types.ts`: `toItemCardItem(it: StopDayItem | ThingToDo): ItemCardItem`. Move the body verbatim from `components/trip/stop-day-list.tsx`'s `toItemCardItem`.
  - `TransportFormDialog` gains `onDelete?: () => void`. When it's set and the dialog is in edit mode, the footer shows a ghost "Delete leg" button that calls it.
  - `ItineraryManager` gains `aiConfigured?: boolean`, which is stored and passed on in Task 20. It now registers `{ addStop, newChapter, suggestChapters, toggleChapters }` through `useRegisterPlanActions`.
  - The desktop list container is `data-testid="plan-desktop-list"`, with `className="hidden flex-col lg:flex"`.

- [ ] **Step 1: Write the failing pure test** — `components/plan/plan-dnd.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveItemDrop, scheduleInputFor } from "./plan-dnd";

const ACTIVE = { type: "item", stopId: "par", date: "2026-12-11", itemId: "a", title: "Louvre", startTime: "10:00", endTime: "12:00" };

describe("resolveItemDrop (spec D5)", () => {
  it("a slot in the same stop's strip on another day is a move", () => {
    expect(resolveItemDrop(ACTIVE, { type: "slot", stopId: "par", date: "2026-12-13" })).toEqual({
      itemId: "a", title: "Louvre", stopId: "par",
      from: { date: "2026-12-11", startTime: "10:00", endTime: "12:00" }, to: "2026-12-13",
    });
  });
  it("another stop's strip, the same day, a non-slot or nothing: no move", () => {
    expect(resolveItemDrop(ACTIVE, { type: "slot", stopId: "rom", date: "2026-12-15" })).toBeNull();
    expect(resolveItemDrop(ACTIVE, { type: "slot", stopId: "par", date: "2026-12-11" })).toBeNull();
    expect(resolveItemDrop(ACTIVE, { type: "stop" })).toBeNull();
    expect(resolveItemDrop(ACTIVE, undefined)).toBeNull();
    expect(resolveItemDrop({ type: "stop" }, { type: "slot", stopId: "par", date: "2026-12-13" })).toBeNull();
  });
});

describe("scheduleInputFor", () => {
  it("passes times through and sends no key for an untimed item", () => {
    expect(scheduleInputFor("2026-12-13", { startTime: "10:00", endTime: "12:00" })).toEqual({ date: "2026-12-13", startTime: "10:00", endTime: "12:00" });
    expect(scheduleInputFor("2026-12-13", { startTime: null, endTime: null })).toEqual({ date: "2026-12-13" });
  });
});
```

- [ ] **Step 2: Implement `plan-dnd.ts` and run it**

```ts
import { closestCenter, pointerWithin, type CollisionDetection } from "@dnd-kit/core";

export interface ItemDragData { type: "item"; stopId: string; date: string; itemId: string; title: string; startTime: string | null; endTime: string | null }
export interface ItemDrop { itemId: string; title: string; stopId: string; from: { date: string; startTime: string | null; endTime: string | null }; to: string }

const isItem = (d: unknown): d is ItemDragData => !!d && (d as { type?: string }).type === "item";
const isSlot = (d: unknown): d is { type: "slot"; stopId: string; date: string } => !!d && (d as { type?: string }).type === "slot";

/** Spec D5: a plan moves only within its own stop's strip; a changeover day shows in two strips, but each strip is its own target. */
export function resolveItemDrop(active: unknown, over: unknown): ItemDrop | null {
  if (!isItem(active) || !isSlot(over)) return null;
  if (over.stopId !== active.stopId || over.date === active.date) return null;
  return {
    itemId: active.itemId,
    title: active.title,
    stopId: active.stopId,
    from: { date: active.date, startTime: active.startTime, endTime: active.endTime },
    to: over.date,
  };
}

/** scheduleItem overwrites times wholesale when they're absent, so an item keeps its own. */
export function scheduleInputFor(date: string, t: { startTime: string | null; endTime: string | null }) {
  return { date, ...(t.startTime ? { startTime: t.startTime } : {}), ...(t.endTime ? { endTime: t.endTime } : {}) };
}

export const planCollisionDetection: CollisionDetection = (args) => {
  if (isItem(args.active.data.current)) {
    return pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => isSlot(c.data.current)) });
  }
  return closestCenter(args);
};
```

Run: `npm test -- components/plan/plan-dnd.test.ts`. Expected: PASS.

- [ ] **Step 3: Rewrite the manager tests first** (`components/trip/itinerary-manager.test.tsx`)

Keep the file's mocks (lines 1–230). Add these:
- `vi.mock("next/link", …)` as in `home-base-card.test.tsx`.
- `scheduleItem: vi.fn().mockResolvedValue({ success: true })` into the existing `@/server/actions/items` mock, if it isn't there.
- `vi.mock("@/components/ui/undo-toast", () => ({ toastWithUndo: vi.fn() }))`.

Add a helper and use it for **every** query about stop, leg or bookend markup:

```tsx
import { PlanBody } from "@/components/plan/plan-body";
const desktop = () => within(screen.getByTestId("plan-desktop-list"));
function renderPlan(ui: React.ReactElement, open: string[] = []) {
  return render(<PlanBody initialOpen={open} today="2030-01-01">{ui}</PlanBody>);
}
```

Every query goes through `desktop()` from now on. Task 17 adds a second (mobile) list, and unscoped queries would then find duplicates.

Update or replace these existing describe blocks (the line numbers are today's):
- Everywhere: `getByRole("button", { name: "Edit Paris" })` becomes opening `More actions for Paris` and choosing `Edit name & place`. "Attachments" labels become "Files".
- **delete confirmation gating (231)** and **reorder controls (360)**: same flows through the grouped ⋯ menu. `Delete Paris` and `Move up`/`Move down` keep their labels.
- **firm-up (424)**: the ungrouped "Firm up" button is gone. Delete "calls firmUpSegment with tripId and chapterId=null for ungrouped rough stops". Keep the conflict and anchor-error tests, but drive them from a rough chapter divider's "Firm up" pill: a `chapters` fixture with one rough chapter holding a rough stop.
- **optimistic pending state (509)**, **whole-trip firm-up (722)** and **Task 12 prominent firm-up (1761)**: the button is "Firm up all stops" in the top dashed row. Delete the separate "Firm up the whole trip" assertions and point them at that button.
- **zero-stops empty state (615)**: the title becomes "No stops yet" and the CTA "Add a stop" opens the add-stop dialog.
- **drag handle rendering (630)** and **Task 10 (1423–1488)**: `drag-handle-stop` and `drag-handle-chapter` test ids stay, as does the `tap-target` class.
- **chapter collapse localStorage persistence (820)**: delete (deviation 4).
- **empty chapter remove control (1319)**: the button `Remove Asia chapter` now sits on the empty chapter's divider.
- **home base bookends (1861)**:
  - `#home-base-top` / `#home-base-bottom` links.
  - The outbound prompt is the dashed pill `Add transport from Sydney to Paris` (Paris dated).
  - A bookend leg renders as a pill whose accessible name starts with its mode ("Flight from …").
  - The return prompt is `Add transport from {last} to Sydney`.
  - With no Home base there are no bookends.
- **optimistic transport delete (1997)**: click the leg pill, then "Delete leg" in the dialog, then confirm. It asserts the same optimistic removal and rollback.
- **context-aware Add transport (2094)**: the dashed pill between two dated stops creates with `fromStopId`, `toStopId` and `anchorStopId`. The last stop has no pill.
- **Task 8 anchor-slot (2159)** and **Task 14 HEAD_SLOT (2201)**: assert a `LegPill` (`getByRole("button", { name: /^Train/ })`) in the right place.
- **day-aware wiring (2455)**: render with `open=["stop-1"]`. The stop's tabpanel shows its day items.
- **"renders accommodation collapsed to a one-line row"**: the stay chip opens `StayDialog`, which contains the `accommodation-card` test id.
- **Add a reminder (2521)**: the ⋯ item is unchanged. "lists a stop's reminders on its card" becomes: the open body's "1 reminder" link opens a dialog listing it.
- **Chapters menu (2284)** and **bottom action row (795)**: keep them for now. The footer still exists until Task 16.

New tests to add:

```tsx
describe("desktop list (PLAN.md §1.3–§4)", () => {
  const PARIS = makeStop({ id: "par", name: "Paris", arriveDate: "2026-12-10", departDate: "2026-12-15", timezone: "Europe/Paris", sortOrder: 0 });
  const ROME = makeStop({ id: "rom", name: "Rome", arriveDate: "2026-12-15", departDate: "2026-12-22", timezone: "Europe/Rome", sortOrder: 1 });
  const MUNICH = makeStop({ id: "mun", name: "Munich", sortOrder: 2 });
  const ITEM = { id: "it1", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-11", startTime: "10:00", endTime: null, stopId: "par" };

  it("numbers the stops in plan order", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME, MUNICH]} />);
    expect(desktop().getByRole("heading", { name: "Rome" }).closest("article")).toHaveTextContent("2");
  });

  it("a dashed add pill between dated stops; a bare line into a rough stop", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME, MUNICH]} />);
    expect(desktop().getByRole("button", { name: "Add transport from Paris to Rome" })).toBeInTheDocument();
    expect(desktop().queryByRole("button", { name: /Add transport from Rome to Munich/ })).toBeNull();
    expect(screen.getByTestId("plan-desktop-list").querySelectorAll("[data-leg-kind='line']")).toHaveLength(1);
  });

  it("the fold toggle opens the body with the day strip", async () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} dayItemsByStopId={new Map([["par", [ITEM]]])} />);
    await userEvent.click(desktop().getByRole("button", { name: "Open Paris" }));
    expect(desktop().getByRole("tab", { name: /FRI 11/ })).toHaveAttribute("aria-selected", "true");
    expect(desktop().getByRole("tabpanel")).toHaveTextContent("Louvre");
  });

  it("dropping a plan on another day of the same strip moves it, keeping its times, with Undo", async () => {
    const { scheduleItem } = await import("@/server/actions/items");
    const { toastWithUndo } = await import("@/components/ui/undo-toast");
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} dayItemsByStopId={new Map([["par", [ITEM]]])} />, ["par"]);
    await act(async () => {
      await dndCapture.onDragEnd!({
        active: { id: "item:it1", data: { current: { type: "item", stopId: "par", date: "2026-12-11", itemId: "it1", title: "Louvre", startTime: "10:00", endTime: null } } },
        over: { id: "slot:par:2026-12-13", data: { current: { type: "slot", stopId: "par", date: "2026-12-13" } } },
      });
    });
    expect(scheduleItem).toHaveBeenCalledWith("it1", { date: "2026-12-13", startTime: "10:00" });
    const call = vi.mocked(toastWithUndo).mock.calls.at(-1)![0];
    expect(call.title).toBe("Moved to Sun 13");
    call.onUndo();
    expect(scheduleItem).toHaveBeenLastCalledWith("it1", { date: "2026-12-11", startTime: "10:00" });
  });

  it("a drop on another stop's slot does nothing", async () => {
    const { scheduleItem } = await import("@/server/actions/items");
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
    await act(async () => {
      await dndCapture.onDragEnd!({
        active: { id: "item:it1", data: { current: { type: "item", stopId: "par", date: "2026-12-15", itemId: "it1", title: "Louvre", startTime: null, endTime: null } } },
        over: { id: "slot:rom:2026-12-15", data: { current: { type: "slot", stopId: "rom", date: "2026-12-15" } } },
      });
    });
    expect(scheduleItem).not.toHaveBeenCalled();
  });

  it("registers Add a stop with PlanBody", async () => {
    function Trigger() { const { actions } = usePlanBody(); return <button onClick={actions.addStop}>header add</button>; }
    render(<PlanBody initialOpen={[]} today="2030-01-01"><Trigger /><ItineraryManager {...baseProps} initialStops={[PARIS]} /></PlanBody>);
    await userEvent.click(screen.getByRole("button", { name: "header add" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("uses no banned soft classes", () => {
    const { container } = renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME, MUNICH]} />, ["par"]);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
```

(`dndCapture` records the **last** `DndContext` rendered. Until Task 17 there is only one.)

Run: `npm test -- components/trip/itinerary-manager.test.tsx`. Expected: many FAILs.

- [ ] **Step 4: Rewrite the render**

In `itinerary-manager.tsx`:

1. **Imports.**
   - Remove: `StopCard`, `QuickAddStops`, `TransportCard`, `HomeBaseCard`, `ChapterChip`, `reorderTransports`, `reorderTransportItems`.
   - Add: `StopRow`, `LegRow`, `LegPill`, `HomeBaseBookend`, `ChapterDivider`, `StopOpenBody`, `StayDialog`, `StopExtrasDialog`, `ExtrasKind`, `buildStopActions`, `legLabel`, `missingLegLabel`, `legSlotKind`, `daySlots`, `stayStatus`, `planCollisionDetection`, `resolveItemDrop`, `scheduleInputFor`, `usePlanBody`, `useRegisterPlanActions`, `claimDragHint`, `toItemCardItem`, `ItemFormDialog`, `scheduleItem`, `formatDayLabel`, `formatDateRangeCompact`, `GripVertical`.
   - Keep `StopCardStop` as a type import from `@/components/plan/types`.
2. **Drag handles.** In `SortableStop` and `SortableChapterHeader`, replace the dotted `<svg>` with `<GripVertical className="size-4" aria-hidden="true" />`. Keep every attribute: `aria-label`, `data-testid`, `tap-target cursor-grab touch-none`. `SortableStop` gains a `rough: boolean` prop. When it's false, the handle adds `pointer-fine:opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100` (deviation 3). Delete `SortableTransport` and `EmptyRoughDroppable`'s `bg-muted/60` in favour of `bg-muted`.
3. **Remove.** Delete `collapsedGroups`/`toggleGroup`, `renderLegCard`, `renderHeadSlot`, `renderSortableLegCard`, `renderBookendLeg`, the `activeType === "transport"` branch of `handleDragEnd`, and every `QuickAddStops`. **Keep** `chaptersMenu`, `addStopButton`, the `data-slot="plan-flow-actions"` footer and the aside portal. Task 16 removes them. Delete only the footer's "Add transport" and "Firm up the whole trip" buttons.
4. **New state.**
   - `itemForm: { mode: "create"; stopId: string; date?: string; unscheduled?: boolean } | { mode: "edit"; item: ItemCardItem } | null`
   - `stayStopId: string | null`
   - `extras: { stopId: string; kind: ExtrasKind } | null`
   - `flash: { stopId: string; date: string } | null`
   - `dragHint: boolean`, set once: `useEffect(() => { void Promise.resolve().then(() => setDragHint(claimDragHint())); }, [])`
   - `const planBody = usePlanBody()`
   - `useRegisterPlanActions({ addStop: () => setAddStopOpen(true), newChapter: handleNewChapter, suggestChapters: handleSuggestChapters, toggleChapters: handleToggleChapters })`
5. **Handlers moved up.**
   - `handleScheduleThing(thing, dateISO)`: move it verbatim from `stop-card.tsx` lines 249–265, using the manager's `router`.
   - `handleMoveItem(drop: ItemDrop)`:
     - `scheduleItem(drop.itemId, scheduleInputFor(drop.to, drop.from))`. On failure, `toast({ variant: "destructive", title: "Couldn't move it" })`.
     - On success, `setFlash({ stopId: drop.stopId, date: drop.to })`, clear it after 400 ms, and call `router.refresh()`.
     - Then `toastWithUndo({ title: `Moved to ${formatDayLabel(drop.to).replace(/ [A-Z][a-z]{2}$/, "")}`, onUndo: () => void scheduleItem(drop.itemId, scheduleInputFor(drop.from.date, drop.from)).then((r) => { if (!r.success) toast({ variant: "destructive", title: "Couldn't undo the move." }); router.refresh(); }) })`.
   - At the top of `handleDragEnd`, after `if (!over) return;`: `const drop = resolveItemDrop(active.data.current, over.data.current); if (active.data.current?.type === "item") { if (drop) await handleMoveItem(drop); return; }`.
6. **Per-stop render** (`renderDesktopStop(stop, globalIdx)`), returning a `React.Fragment key={stop.id}`:
   - `<SortableStop stop={stop} chapterId={stop.chapterId} rough={!stop.arriveDate}>{(dragHandle) => <StopRow … />}</SortableStop>`.
   - StopRow props:
     - `number={globalIdx + 1}`, `open={planBody.isOpen(stop.id)}`, `onToggle={() => planBody.toggle(stop.id)}`, `bodyId={`stop-body-${stop.id}`}`
     - `stay={stayStatus(stop, stop.accommodations)}`
     - `plansCount` is the number of `dayItemsByStopId.get(stop.id)` items whose `stopId === stop.id` (owned only, so changeover items don't count twice)
     - `ideasCount={thingsToDoByStopId?.get(stop.id)?.length ?? 0}`
     - `isPending={pendingId === stop.id}`, `dragHandle={dragHandle}`
     - `menuGroups={buildStopActions(stop, flags, handlers)}`. Flags: `{ isFirst, isLast, isPending, isOwner, chaptersEnabled, canRemind: !forkId, notesCount: notesByStopId && currentUserId ? (notesByStopId.get(stop.id)?.length ?? 0) : null, filesCount: attachmentsByStopId ? (attachmentsByStopId.get(stop.id)?.length ?? 0) : null }`. Handlers map to the existing ones:
       - `onEdit → setEditingStop(stop)`, `onAdjustDates` and `onGiveDates → handleAdjustDates(stop)`
       - `onTogglePin → handleTogglePin(stop.id)`, `onMakeRough → handleMakeRough(stop.id)`
       - `onMoveUp`/`onMoveDown → handleMoveStop(stop.id, "up"|"down")`
       - `onStartChapter → handleStartChapterHere(stop)`, `onAssignChapter → setAssigningStop(stop)`, `onAddReminder → setAddReminderStop(stop)`
       - `onNotes`/`onFiles → setExtras({ stopId: stop.id, kind })`
       - `onDelete → handleDeleteStop(stop.id)`
   - StopRow children: `<StopOpenBody … />` with:
     - `slots` from `daySlots(stop, items, dayTitles, { prevDepartDate: stops[globalIdx - 1]?.departDate, nextArriveDate: stops[globalIdx + 1]?.arriveDate })` for dated stops, `[]` for rough
     - `counts={{ files, notes, reminders: remindersByStopId?.get(stop.id)?.length ?? 0 }}`
     - `onOpenStay={() => setStayStopId(stop.id)}`, `onAddStay={() => handleAddAccommodationClick(stop)}`
     - `onAddIdea={() => setItemForm({ mode: "create", stopId: stop.id, unscheduled: true })}`, `onScheduleIdea={handleScheduleThing}`
     - `onAddPlan={(date) => setItemForm({ mode: "create", stopId: stop.id, date })}`, `onEditItem={(it) => setItemForm({ mode: "edit", item: toItemCardItem(it) })}`
     - `onGiveDates={() => handleAdjustDates(stop)}`, `onOpenExtras={(kind) => setExtras({ stopId: stop.id, kind })}`
     - `showDragHint={dragHint}`, `flashDate={flash?.stopId === stop.id ? flash.date : null}`
   - Then the leg after it, `renderLegAfter(stop, globalIdx)`:
     - Skip it when it's the last stop and `hasReturnBookend`.
     - `const legs = legsBySlot.get(stop.id) ?? []` and `const next = stops[globalIdx + 1] ?? null`.
     - With no `next`: render legs only when there are any.
     - Otherwise switch on `legSlotKind(stop, next, legs.length)`. "legs" gives `<LegRow kind="legs">{legs.map((t) => <LegPill key={t.id} label={legLabel(t, legStops, homeBaseName)} onClick={() => { setEditingTransport(enrichTransport(t, stops)); setEditingTransportCosts(t.costs); }} />)}</LegRow>`. "missing" gives `<LegRow kind="missing"><LegPill label={missingLegLabel(stop, next)} onClick={() => setAddTransportDefaults({ fromStopId: stop.id, toStopId: next.id, anchorStopId: stop.id })} /></LegRow>`. "line" gives `<LegRow kind="line" />`.
     - `legStops` is `stops` itself: `ItineraryStop` already satisfies `LegStop`.
7. **List frame** (inside `hasContent`):
   - `<div data-testid="plan-desktop-list" className="hidden flex-col lg:flex"><DndContext sensors={sensors} collisionDetection={planCollisionDetection} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>`.
   - **Rough row**: when any stop is rough, `<div className="mb-3 flex h-11 items-center gap-2.5 rounded-[14px] border-2 border-dashed border-border bg-sun/30 px-3.5"><CalendarClock className="size-4" aria-hidden /><p className="flex-1 text-[13px] font-semibold">Some stops don&apos;t have dates yet.</p><Button variant="primary" size="sm" onClick={handleFirmUpTrip} loading={pendingId === "firm-up-trip"}>Firm up all stops</Button></div>`. Delete the old warning banner.
   - **Origin bookend** when `hasHomeBase`: `<HomeBaseBookend tripId={tripId} name={homeBaseName!} variant="origin" dateISO={firstStop?.arriveDate ?? tripStartDate ?? null} />`. Then the outbound leg:
     - `outboundLeg` gives a pill.
     - Else a dated `firstStop` gives `<LegPill label={missingLegLabel({ name: homeBaseName! }, firstStop)} onClick={() => setAddTransportDefaults({ fromStopId: HOME_ENDPOINT, toStopId: firstStop.id })} />` inside `LegRow kind="missing"`.
     - Else `LegRow kind="line"`.
   - **HEAD_SLOT legs** (not home legs), when any: `<LegRow kind="legs">` with pills.
   - **Groups**: without chapters, one `SortableContext` over every stop id with `renderDesktopStop` each. With chapters, keep today's outer `SortableContext items={populatedChapterIds}`. For each group with a chapter, render `<SortableChapterHeader chapterId>` → `<div ref={setNodeRef} style={style}><ChapterDivider name colour={chapter.colour} summary={`${n} stop${n === 1 ? "" : "s"} · ${chapter.startDate ? formatDateRangeCompact(chapter.startDate, chapter.endDate!) : "rough"}`} dragHandle={dragHandle} actions={rough chapter with rough stops ? <Button variant="outline" size="sm" disabled={pendingId === `firm-up-${id}`} onClick={() => handleFirmUp(id)}>Firm up</Button> : undefined} /></div>`. Follow it with that group's own `SortableContext items={groupStopIds}` and its stops. Ungrouped stops go under `<ChapterDivider name="Ungrouped" colour="stone" summary={…} />` only when chapters exist.
   - **Empty chapters**: `ChapterDivider` with `summary="No stops yet"` and `actions` holding the existing Remove button (`aria-label={`Remove ${chapter.name} chapter`}`, `Trash2`) and the rough "Firm up". For rough ones, `<SortableContext items={[]}><EmptyRoughDroppable chapterId={chapter.id} /></SortableContext>` goes below.
   - **Return bookend** when `hasReturnBookend`: the return leg, which is a pill, or a missing pill `missingLegLabel(lastStop, { name: homeBaseName! })` → `setAddTransportDefaults({ fromStopId: lastStop.id, toStopId: HOME_ENDPOINT })` when `lastStop` is dated, else a line. Then `<HomeBaseBookend variant="return" dateISO={lastStop.departDate ?? tripEndDate ?? null} />`.
   - `</DndContext></div>`, followed by the kept footer.
8. **Empty state** when there's no content: `<EmptyState icon={MapPin} tone="coral" title="No stops yet" description="Add the first place you're going. You can keep it rough and sort dates later." action={<Button variant="primary" size="md" onClick={() => setAddStopOpen(true)}><Plus aria-hidden="true" />Add a stop</Button>} />`.
9. **New dialogs** (next to the existing ones):
   - One create `ItemFormDialog` (`open={itemForm?.mode === "create"}`, `defaultStopId`, `defaultDate`, `defaultUnscheduled={itemForm.unscheduled ?? !itemForm.date}`, `stops={stopOptions}`, `forkId`, `homeCurrency`).
   - One edit `ItemFormDialog` (`item`, `costs={thingsToDoItemCostsById?.get(id)}`, `attachments={attachmentsByItemId?.get(id) ?? []}`).
   - `StayDialog` for `stayStopId`. Its `rows` are the existing `AccommodationRow` mapping (today's lines 1664–1684), extracted into `renderAccommodationRows(stop)`, with `onAdd={() => handleAddAccommodationClick(stop)}`.
   - `StopExtrasDialog` for `extras`, with the stop's notes, attachments and reminders, `currentUserId`, and `onAddReminder={forkId ? undefined : () => { setExtras(null); setAddReminderStop(stop); }}`.
   - Pass `onDelete={() => { const id = editingTransport.id; setEditingTransport(null); void handleDeleteTransport(id); }}` to the edit `TransportFormDialog`.
10. **`TransportFormDialog.onDelete`**: thread it into `TransportForm`. In edit mode, when it's set, render `<Button type="button" variant="ghost" className="text-coral-text" onClick={onDelete}>Delete leg</Button>` at the start of `DialogFooter`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test -- components/trip/itinerary-manager.test.tsx components/trip/transport-form-dialog.test.tsx components/plan`
Expected: PASS. Fix the markup, not the new assertions. Existing handler tests must pass unchanged in intent.

- [ ] **Step 6: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/plan components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx components/trip/transport-form-dialog.tsx
git commit -m "feat(plan): ItineraryManager renders stop rows, leg pills, bookends, chapter dividers and open bodies; plans drag onto days with Undo (PLAN.md §1–5; spec D5)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 14: Fit tile (rail) and Fit strip (mobile)

**Files:**
- Create: `components/plan/fit-tile.tsx`, `components/plan/fit-tile.test.tsx`
- Modify: `components/trip/hard-end-date-control.tsx` (optional `label` prop), `components/trip/hard-end-date-control.test.tsx`

**Interfaces:**
- Consumes: `fitTileModel` (Task 5); `PlanSummary`; `HardEndDateControl`; `MakeItFit` (`components/trip/make-it-fit.tsx`); `FitStop` (`lib/make-it-fit.ts`); `formatDayLabel`.
- Produces:
  - `FitTile({ tripId, summary, startDate, fitStops, isOwner }: { tripId: string; summary: PlanSummary; startDate: string | null; fitStops: FitStop[]; isOwner: boolean })`
  - `FitStrip({ summary, onOpenMap }: { summary: PlanSummary; onOpenMap?: () => void })`
  - `HardEndDateControl` gains `label?: string`. When set, it is the idle trigger's visible text. The aria-label becomes `Edit home-by date (${formatLongDate(hardEndDate)})`, or `label` itself when there's no date. Without `label`, today's markup is unchanged.

- [ ] **Step 1: Write the failing test** — `components/plan/fit-tile.test.tsx`. Mock `@/components/trip/make-it-fit` → `MakeItFit: () => <button>Make it fit</button>`. Mock `@/server/actions/trips` → `setTripHardEndDate: vi.fn()`.

```tsx
const S = (over = {}) => ({ stopCount: 6, roughCount: 1, scheduledNights: 28, projectedNights: 33, spanStart: "2026-12-04",
  scheduledEnd: "2027-01-01", projectedEnd: "2027-01-06", hardEndDate: "2027-01-08", hardEndState: "ok", hardEndSlackNights: 2, ...over });
const base = { tripId: "t1", startDate: "2026-12-04", fitStops: [], isOwner: true };

describe("FitTile (PLAN.md §6.2)", () => {
  it("ok: teal, the number, words in a live region, pill, home-by trigger, bar and legend", () => {
    const { container } = render(<FitTile {...base} summary={S()} />);
    expect(container.firstElementChild!.className).toContain("bg-teal");
    expect(screen.getByText("2").className).toMatch(/font-display/);
    const live = screen.getByRole("status");
    expect(live).toHaveTextContent("nights spare");
    expect(live.querySelector("button")).toBeNull();
    expect(screen.getByText("FITS YOUR DATES")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit home-by date/ })).toHaveTextContent("Home by Fri 8 Jan");
    expect(screen.getByText("28 set · ~5 rough")).toBeInTheDocument();
    expect(screen.getByText("of 35")).toBeInTheDocument();
    expect(container.querySelector("[data-bar-set]")).not.toBeNull();
  });
  it("approaching 0: sun, right on it", () => {
    const { container } = render(<FitTile {...base} summary={S({ hardEndState: "approaching", hardEndSlackNights: 0 })} />);
    expect(container.firstElementChild!.className).toContain("bg-sun");
    expect(screen.getByRole("status")).toHaveTextContent("right on it");
  });
  it("over: coral, RUNS OVER, Make it fit outside the live region", () => {
    const { container } = render(<FitTile {...base} summary={S({ hardEndState: "over", hardEndSlackNights: -2, projectedNights: 37 })} />);
    expect(container.firstElementChild!.className).toContain("bg-coral");
    expect(screen.getByText("RUNS OVER")).toBeInTheDocument();
    const fit = screen.getByRole("button", { name: "Make it fit" });
    expect(screen.getByRole("status")).not.toContainElement(fit);
    expect(container.querySelector("[data-bar-over]")).not.toBeNull();
  });
  it("unset: the trigger reads Set a home-by date; dormant explains", () => {
    const { rerender } = render(<FitTile {...base} summary={S({ hardEndState: "unset", hardEndSlackNights: null, hardEndDate: null })} />);
    expect(screen.getByRole("button", { name: "Set a home-by date" })).toBeInTheDocument();
    rerender(<FitTile {...base} summary={S({ hardEndState: "dormant", hardEndSlackNights: null })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Set a start date to check this");
  });
  it("uses no banned soft classes", () => {
    const { container } = render(<FitTile {...base} summary={S()} />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});

describe("FitStrip (PLAN.md §7.1)", () => {
  it("same colour states, number, words, a 14px bar and Map ⤢", async () => {
    const onOpenMap = vi.fn();
    const { container } = render(<FitStrip summary={S()} onOpenMap={onOpenMap} />);
    expect(container.firstElementChild!.className).toContain("bg-teal");
    expect(screen.getByText("2").className).toContain("text-[30px]");
    await userEvent.click(screen.getByRole("button", { name: /Map/ }));
    expect(onOpenMap).toHaveBeenCalled();
  });
});
```

Add to `hard-end-date-control.test.tsx`: `it("label replaces the ISO trigger text", () => { render(<HardEndDateControl tripId="t" hardEndDate="2027-01-08" startDate={null} label="Home by Fri 8 Jan" />); expect(screen.getByRole("button", { name: "Edit home-by date (Fri 8 Jan 2027)" })).toHaveTextContent("Home by Fri 8 Jan"); });`

- [ ] **Step 2: Run to see it fail.** `npm test -- components/plan/fit-tile.test.tsx components/trip/hard-end-date-control.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** (client)

- `const TONE = { teal: "bg-teal text-on-accent", sun: "bg-sun text-on-accent", coral: "bg-coral text-on-accent", card: "bg-card" }`.
- `FitTile`: `<section aria-label="Fit" className={cn("rounded-[22px] border-2 border-border p-3.5 shadow-hard-4 transition-colors duration-[var(--dur-slow)]", TONE[m.tone])}>`.
  - Row 1, `flex items-center justify-between gap-2`: the pill `rounded-full border-2 border-border bg-card px-2.5 py-0.5 text-[11px] font-extrabold tracking-[0.08em] text-foreground`, and, when `summary.hardEndDate`, `<HardEndDateControl tripId={tripId} hardEndDate={summary.hardEndDate} startDate={startDate} label={`Home by ${formatDayLabel(summary.hardEndDate)}`} />`.
  - Row 2, `mt-2 flex items-end gap-2`:
    - `m.big !== null` gives `<span className="font-display text-[40px] font-extrabold leading-none tabular-nums xl:text-5xl">{m.big}</span>`. Then `<span role="status" aria-live="polite" className="text-[15px] font-extrabold leading-tight">{m.words}</span>`, with the words split across two lines at the first space (`<span className="block">nights</span>spare`).
    - Unset gives `<HardEndDateControl … hardEndDate={null} label="Set a home-by date" />` plus an sr-only `role="status"` holding the words.
    - Dormant gives just the status words.
  - Over: `<div className="mt-2"><MakeItFit tripId={tripId} stops={fitStops} anchor={startDate} hardEndDate={summary.hardEndDate} isOwner={isOwner} /></div>`.
  - Bar, when `m.bar`: `<div className="mt-3 flex h-[18px] overflow-hidden rounded-full border-2 border-border bg-card"><span data-bar-set className="h-full bg-foreground" style={{ width: `${setPct}%` }} /><span data-bar-rough className="h-full bg-[repeating-linear-gradient(135deg,hsl(var(--foreground))_0_3px,hsl(var(--card))_3px_7px)]" style={{ width: `${roughPct}%` }} /></div>`. When `overPct > 0`, add `<span data-bar-over className="-mt-[18px] ml-auto block h-[18px] rounded-r-full border-2 border-l-0 border-border bg-[repeating-linear-gradient(135deg,hsl(var(--coral))_0_3px,hsl(var(--card))_3px_7px)]" style={{ width: `${overPct}%` }} />` so the hatch runs past the end marker. These inline widths are dynamic, not colours, so they're allowed.
  - Legend: `mt-1.5 flex justify-between text-xs font-bold`, with `legendLeft` and `legendRight`.
- `FitStrip`: `<div className={cn("flex items-center gap-2.5 rounded-2xl border-2 border-border px-3.5 py-2.5", TONE[m.tone])}>`, holding:
  - the number `font-display text-[30px] font-extrabold leading-none tabular-nums`, when `m.big !== null`
  - the words `text-sm font-extrabold leading-tight` in `role="status"`
  - a `flex-1` bar `h-3.5` in the same structure as above
  - `onOpenMap && <button className="tap-target inline-flex shrink-0 items-center gap-1 text-sm font-extrabold" onClick={onOpenMap}>Map <Maximize2 className="size-3.5" aria-hidden /></button>`

- [ ] **Step 4: Run to see it pass.** `npm test -- components/plan components/trip/hard-end-date-control.test.tsx`

- [ ] **Step 5: Gates and commit.** Add `components/trip/hard-end-date-control.tsx` to the scan's `FILES`.

```bash
npx tsc --noEmit && npm run lint
git add components/plan components/trip/hard-end-date-control.tsx components/trip/hard-end-date-control.test.tsx
git commit -m "feat(plan): Fit tile and mobile Fit strip from summarizePlan (PLAN.md §6.2, §7.1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 15: Jump list, mini map and the route map dialog

**Files:**
- Create: `components/plan/jump-list.tsx`, `components/plan/jump-list.test.tsx` (port the behaviour tests of `components/trip/plan-stops-nav.test.tsx`)
- Create: `components/plan/plan-mini-map.tsx`, `components/plan/plan-mini-map.test.tsx`
- Modify: `components/trip/route-map.tsx` (`onStopClick`), `components/trip/route-map.test.tsx`

**Interfaces:**
- Consumes: `usePlanBody` (Task 6); `scrollToId`, `ringId` (Task 4); `HUE_CLASSES`, `Hue`; `RouteMapLoader` (`components/trip/route-map-loader.tsx`); `RouteMapStop`; `HomeMapPoint` (`lib/route-map.ts`).
- Produces:
  - `interface JumpListStop { id: string; name: string; colourHue: Hue; dateLabel: string; chapterId: string | null; rough: boolean }`
  - `JumpList({ stops, chapters, homeBase }: { stops: JumpListStop[]; chapters: { id: string; name: string }[] | null; homeBase: { name: string; roundTrip: boolean } | null })`
  - `PlanMiniMap({ stops, home, farHome }: { stops: RouteMapStop[]; home: HomeMapPoint | null; farHome: { name: string } | null })`
  - `PlanMapDialog({ open, onOpenChange, stops, home }: { open: boolean; onOpenChange(o: boolean): void; stops: RouteMapStop[]; home: HomeMapPoint | null })`
  - `RouteMapProps` gains `onStopClick?: (stopId: string) => void`

- [ ] **Step 1: Write the failing tests**

`components/plan/jump-list.test.tsx`: copy the fixture, the `IntersectionObserver` stub and the scroll-spy test from `plan-stops-nav.test.tsx`, including `rough: true` on the third stop. Then assert:
- `getByRole("navigation", { name: "Jump to" })`, with the label "JUMP TO".
- Rows are 36px (`h-9`). A rough row's dot has `border-dashed`.
- Chapter headings render in order. There are no headings when `chapters` is null.
- Scroll-spy: the active row has `aria-current="location"` and `bg-teal/15`.
- Clicking "Florence" with `<div id="stop-s2" />` present and `setMatchMedia((q) => q.includes("min-width: 1024px"))` calls `window.scrollTo` (stub it) and sets `data-highlight` on `#stop-s2` (use reduced motion for synchronous settle: `setMatchMedia(() => true)`).
- Clicking the first "Sydney" row scrolls to `#home-base-top`.
- The footer `+ Add a stop` (`getByRole("button", { name: "Add a stop" })`) calls a handler registered through `useRegisterPlanActions` inside the same `PlanBody`.
- The ban assertion.

Wrap every render in `<PlanBody initialOpen={[]} today="2030-01-01">`.

`components/plan/plan-mini-map.test.tsx`: `vi.mock("@/components/trip/route-map-loader", () => ({ RouteMapLoader: (p: { onStopClick?: (id: string) => void; home: unknown }) => <button data-testid="map" data-home={String(!!p.home)} onClick={() => p.onStopClick?.("s1")}>map</button> }))`. Assert:
- Nothing renders with fewer than two located stops.
- The tile has `h-[210px]` and `rounded-[22px]`.
- "Open map" opens a dialog named "Route map".
- A far home shows "+ Sydney" and passes `home={null}` to the tile map (`data-home="false"`).
- Clicking the map button (the pin stub) calls `jumpTo`: `#stop-s1` gets `data-highlight` with reduced motion on.

Add to `route-map.test.tsx`:

```tsx
it("calls onStopClick with the stop id when its pin is clicked", async () => {
  const onStopClick = vi.fn();
  render(<RouteMap stops={STOPS} onStopClick={onStopClick} />);
  await waitFor(() => expect(hoisted.leaflet!.markers.length).toBeGreaterThan(0));
  const click = hoisted.leaflet!.markers[0].on.mock.calls.find((c: unknown[]) => c[0] === "click")![1] as () => void;
  click();
  expect(onStopClick).toHaveBeenCalledWith("s1");
});
```

- [ ] **Step 2: Run to see them fail.** `npm test -- components/plan/jump-list.test.tsx components/plan/plan-mini-map.test.tsx components/trip/route-map.test.tsx`

- [ ] **Step 3: Implement**

`route-map.tsx`:
- Add the prop.
- `const onStopClickRef = useRef(onStopClick); onStopClickRef.current = onStopClick;`. Assign it in an effect if the lint rule forbids assigning during render: `useEffect(() => { onStopClickRef.current = onStopClick; })`.
- After `.bindPopup(popupContent, POPUP)`, chain `.on("click", () => onStopClickRef.current?.(stop.id))`.
- Don't add `onStopClick` to the build effect's deps (it's read through the ref).

`jump-list.tsx` (client, PLAN.md §6.3):
- Move `buildRows` from `plan-stops-nav.tsx` verbatim, and the scroll-spy effect verbatim (it observes `[data-stop-id]`, which only desktop rows carry). **Don't** move the hash effect: `PlanBody` owns it now.
- `<nav aria-label="Jump to" className="flex min-h-0 flex-col gap-2 rounded-[22px] border-2 border-border bg-card p-3 shadow-hard-4">`, with `<h2 className="px-2 text-[11px] font-extrabold tracking-[0.08em]">JUMP TO</h2>`.
- `<ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">`.
- Row: `<button type="button" aria-current={active ? "location" : undefined} onClick={() => jumpTo(stop.id)} className={cn("tap-target flex h-9 w-full items-center gap-2.5 rounded-[10px] border-2 border-transparent px-2 text-left text-sm font-semibold", active && "border-border bg-teal/15")}>`, holding `<span className={cn("size-3 shrink-0 rounded-full border-2 border-border", stop.rough ? "border-dashed bg-background" : HUE_CLASSES[stop.colourHue].fill)} />`, `<span className="min-w-0 flex-1 truncate">{name}</span>` and `<span className="shrink-0 text-xs tabular-nums text-muted-foreground">{dateLabel}</span>`.
- Chapter heading `<li className="px-2 pb-0.5 pt-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">`.
- Home rows (top, and bottom when `roundTrip`) look the same with a `House` icon. On click: `const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches; scrollToId(id, { reduced }); ringId(id)`, for `home-base-top`/`home-base-bottom`.
- Footer: `<Button variant="outline" size="md" className="w-full" onClick={actions.addStop}><Plus aria-hidden />Add a stop</Button>` (spec D1).

`plan-mini-map.tsx` (client):
- Return null when fewer than two stops have coordinates.
- `<div className="relative h-[210px] overflow-hidden rounded-[22px] border-2 border-border shadow-hard-4"><RouteMapLoader stops={stops} height={206} home={farHome ? null : home} onStopClick={jumpTo} />`.
- Overlays in `absolute z-[500]` (above Leaflet's 400 panes):
  - bottom-right: `<button className="pressable inline-flex h-7 items-center gap-1 rounded-full border-2 border-border bg-card px-2.5 text-xs font-bold" onClick={() => setOpen(true)}>Open map <Maximize2 className="size-3.5" aria-hidden /></button>`
  - bottom-left, when `farHome`: `<span className="inline-flex h-7 items-center gap-1 rounded-full border-2 border-border bg-card px-2.5 text-xs font-bold">+ {farHome.name} <ArrowUpRight className="size-3.5" aria-hidden /></span>`
- `PlanMapDialog`: `<Dialog open onOpenChange><DialogContent size="lg" className="max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none"><DialogHeader><DialogTitle>Route map</DialogTitle></DialogHeader><RouteMapLoader stops={stops} height={480} home={home} onStopClick={(id) => { onOpenChange(false); jumpTo(id); }} /></DialogContent></Dialog>`.

- [ ] **Step 4: Run to see them pass.** `npm test -- components/plan components/trip/route-map.test.tsx`

- [ ] **Step 5: Gates and commit.** Add `components/trip/route-map.tsx` to `FILES`.

```bash
npx tsc --noEmit && npm run lint
git add components/plan components/trip/route-map.tsx components/trip/route-map.test.tsx
git commit -m "feat(plan): Jump list with Add a stop, mini map with pin jumps and a route map dialog (PLAN.md §6.1, §6.3; spec D1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 16: The Plan page — PageHeader, grid, rail; header actions; cleanup

**Read first:** `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`. Also read `components/ui/page-header.tsx`, `components/trip/trip-header-trailing.tsx` and `components/shell/app-paths.ts` (Phase 1) to confirm the prop names in the contract.

**Files:**
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx`, `app/(app)/trips/[tripId]/plan/page.test.tsx`
- Create: `components/plan/plan-header-actions.tsx`, `components/plan/plan-header-actions.test.tsx`
- Modify: `components/shell/app-paths.ts`, `components/shell/app-paths.test.ts` (add the plan route to `PAGE_HEADER_ROUTES`)
- Modify: `components/trip/itinerary-manager.tsx` and its test (remove the footer, the portal, `chaptersMenu`, `addStopButton`, `asideSlot`, `PLAN_ASIDE_ACTIONS_ID`)
- Modify: `components/trip/stop-form-dialog.tsx` (`StopCardStop` now imported from `@/components/plan/types`)
- Delete, after `grep -rn` shows no other importer: `lib/plan-aside.ts`, `components/trip/plan-overview.tsx` + test, `components/trip/plan-stops-nav.tsx` + test, `components/trip/home-base-card.tsx` + test, `components/trip/stop-day-list.tsx` + test, `components/trip/quick-add-stops.tsx` + test, `components/trip/stop-card.tsx` + test, `components/trip/stops-manager.tsx` + test. `components/trip/transport-card.tsx` **stays** (spec D8; used by `transport-form-dialog.tsx`, `day-entry-link.tsx` and `lib/day-view-model.ts`). `lib/plan-overview.ts` stays (`summarizePlan`).

**Interfaces:**
- Consumes: `PageHeader`, `TripHeaderTrailing`, `PlanBody`, `FitTile`, `FitStrip`, `JumpList`, `PlanMiniMap`, `PlanMapDialog`, `tripEyebrow`, `planHeaderMeta`, `routeCentroid`, `defaultOpenStops`; `tripSlugFor` (`lib/trip-slug-read.ts`); `isAiConfigured` (`lib/ai.ts`); `tripTodayISO` (`lib/trip-today.ts`); `haversineKm` (`lib/geo.ts`); `homeMapPoint` (`lib/route-map.ts`); `AiBookingParser`.
- Produces:
  - `PLAN_GRID_CLASS = "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start xl:grid-cols-[minmax(0,1fr)_320px]"`
  - `PLAN_ASIDE_CLASS = "hidden lg:sticky lg:top-6 lg:flex lg:max-h-[calc(100dvh-3rem)] lg:flex-col lg:gap-4 lg:overflow-y-auto"` (same export name as today)
  - `FAR_HOME_KM = 1500`
  - `PlanHeaderActions({ tripId, chaptersEnabled, aiConfigured })` (client): Chapters · Paste a booking · + Add a stop
  - `PlanAddStopButton({ variant }: { variant: "round" | "primary" })` (client)
  - `PlanMobileExtras({ tripId, chaptersEnabled, aiConfigured })` (client, `lg:hidden`, deviation 6)
  - `PlanFitStrip({ summary, stops, home })` (client wrapper: `FitStrip` + `PlanMapDialog`)

- [ ] **Step 1: Write the failing tests**

`components/plan/plan-header-actions.test.tsx`: mock `@/components/trip/ai-booking-parser` → `AiBookingParser: () => <div>parser</div>`. Render inside `<PlanBody>` with a `Registrar` that registers `addStop`/`newChapter`/`toggleChapters` spies (as in Task 6). Assert:
- The order is Chapters, Paste a booking, Add a stop (compare `getAllByRole("button").map(b => b.textContent)`).
- "Add a stop" has `shadow-cta` and calls `addStop`.
- "Paste a booking" opens a dialog containing "parser", and is absent when `aiConfigured={false}`.
- Chapters with chapters on offers exactly New chapter and Suggest from countries. With `chaptersEnabled={false}` there is **no** Chapters button at all (`queryByRole("button", { name: /chapters/i })` is null), on desktop and in `PlanMobileExtras`.
- `PlanAddStopButton variant="round"` is a `size-11 rounded-full` button named "Add a stop".

`app/(app)/trips/[tripId]/plan/page.test.tsx`, updated:
- Add `name: "Christmas in Europe", homeLat: null, homeLng: null` to `BASE_TRIP`.
- Mock `@/components/trip/trip-header-trailing` → `TripHeaderTrailing: () => null`.
- Mock `@/lib/trip-slug-read` → `tripSlugFor: vi.fn(async () => "trip-1")`.
- Mock `@/lib/ai` → `isAiConfigured: () => false`.
- Mock `@/components/plan/fit-tile` → `FitTile: () => <div data-testid="fit-tile" />, FitStrip: () => null`.
- Mock `@/components/plan/jump-list` → `JumpList: () => <div data-testid="jump-list" />`.
- Mock `@/components/plan/plan-mini-map` → `PlanMiniMap: () => <div data-testid="mini-map" />, PlanMapDialog: () => null`.
- Delete the `plan-overview` mock and the two `#plan-aside-actions` tests.

Keep the ItineraryManager capture mock. Replace the aside tests with:

```tsx
it("PageHeader: the h1 is Plan, the eyebrow the trip with year, the meta stops + range", async () => {
  mockDb.stop.findMany.mockResolvedValue([STOP]);
  const div = await renderPlan();
  expect(div.querySelector("h1")!.textContent).toBe("Plan");
  expect(div.textContent).toContain("Christmas in Europe 2026");
  expect(div.textContent).toContain("1 stop · Thu 1 – Sat 10 Jan");
});
it("the rail holds map, Fit tile and Jump list, in that order, after the list", async () => {
  mockDb.stop.findMany.mockResolvedValue([STOP]);
  const div = await renderPlan();
  const aside = div.querySelector("aside")!;
  expect(aside.className).toBe(PLAN_ASIDE_CLASS);
  expect([...aside.children].map((c) => c.getAttribute("data-testid"))).toEqual(["mini-map", "fit-tile", "jump-list"]);
  expect(PLAN_ASIDE_CLASS).toContain("lg:sticky");
  expect(PLAN_ASIDE_CLASS).toContain("lg:max-h-[calc(100dvh-3rem)]");
});
it("no stops → no rail", async () => {
  const div = await renderPlan();
  expect(div.querySelector("aside")).toBeNull();
});
it("hands the manager the AI flag and opens the stop with plans by default", async () => {
  mockDb.stop.findMany.mockResolvedValue([STOP]);
  await renderPlan();
  expect(itineraryManagerCapture.props!.aiConfigured).toBe(false);
});
```

`app-paths.test.ts`: `expect(isPageHeaderPath("/trips/abc/plan")).toBe(true)`.

- [ ] **Step 2: Run to see them fail.** `npm test -- "app/(app)/trips/[tripId]/plan" components/plan/plan-header-actions.test.tsx components/shell/app-paths.test.ts`

- [ ] **Step 3: Implement the header actions** (`components/plan/plan-header-actions.tsx`)

- Chapters: `<DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="md"><BookOpen aria-hidden />Chapters</Button></DropdownMenuTrigger><DropdownMenuContent align="end">…</DropdownMenuContent></DropdownMenu>`. Render it only when `chaptersEnabled`. Move the "New Chapter" and "Suggest from countries" items from the manager's `chaptersMenu` verbatim, calling `actions.newChapter` / `actions.suggestChapters`. Drop the "Turn off chapters" / "Group into chapters…" items (the switch lives in Settings, Task 21a); `toggleChapters` can leave `PlanActions` and the manager's registration.
- Paste a booking (when `aiConfigured`): `<Button variant="outline" size="md" onClick={() => setOpen(true)}>Paste a booking</Button>`, then `<Dialog open={open} onOpenChange={setOpen}><DialogContent size="lg"><DialogHeader><DialogTitle>Paste a booking</DialogTitle></DialogHeader><AiBookingParser tripId={tripId} aiConfigured /></DialogContent></Dialog>`.
- `PlanAddStopButton variant="primary"`: `<Button variant="primary" size="md" onClick={actions.addStop}><Plus aria-hidden />Add a stop</Button>`. `variant="round"`: `<button type="button" aria-label="Add a stop" onClick={actions.addStop} className="pressable grid size-11 place-items-center rounded-full border-2 border-border bg-foreground text-background shadow-cta"><Plus className="size-5" aria-hidden /></button>`.
- `PlanMobileExtras`: `<div className="flex flex-wrap gap-2 lg:hidden">` holding the same Chapters menu (only when `chaptersEnabled`) and Paste a booking; render nothing when neither applies.
- `PlanFitStrip`: `const [open, setOpen] = useState(false)`, then `<FitStrip summary={summary} onOpenMap={stops.length >= 2 ? () => setOpen(true) : undefined} /><PlanMapDialog open={open} onOpenChange={setOpen} stops={stops} home={home} />`.

- [ ] **Step 4: Rewrite the page render** (keep every query and map-building line above `return` unchanged)

- Add `name: true, homeLat: true, homeLng: true` to the trip select. Remove the `PlanOverview`, `PlanStopsNav` and `PLAN_ASIDE_ACTIONS_ID` imports.
- Before `return`:
  - `const slug = await tripSlugFor(tripId);`
  - `const aiConfigured = isAiConfigured();`
  - `const ordered = orderPlanStops(stops);`
  - `const today = tripTodayISO(stops);`
  - `const planCounts = Object.fromEntries([...dayItemsByStopId].map(([id, items]) => [id, items.filter((i) => i.stopId === id).length]));`. Check `dayItemsByStopId`'s type: it's the `Map` returned by `groupScheduledItemsByStop`.
  - `const initialOpen = defaultOpenStops(ordered, planCounts, today);`
  - `const mapStops = ordered.filter((s) => s.arriveDate && s.departDate).map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, arriveDate: s.arriveDate!, departDate: s.departDate!, sortOrder: s.sortOrder }));`
  - `const home = trip ? homeMapPoint(trip) : null;`
  - `const centroid = routeCentroid(mapStops);`
  - `const farHome = home && centroid && haversineKm(home, centroid) > FAR_HOME_KM ? { name: home.name } : null;`
- `planStopsNavStops` becomes `JumpListStop[]`: add `rough: !(stop.arriveDate && stop.departDate)`.
- Return:

```tsx
<PlanBody initialOpen={initialOpen} today={today}>
  <div className="flex flex-col gap-5">
    {activeFork && <VariantBanner tripId={tripId} variantName={activeFork.name} />}
    <PageHeader
      eyebrow={tripEyebrow(trip?.name ?? "", trip?.startDate ?? null)}
      title="Plan"
      meta={planHeaderMeta(planSummary, trip?.startDate ?? null, trip?.endDate ?? null)}
      actions={<PlanHeaderActions tripId={tripId} chaptersEnabled={trip?.chaptersEnabled ?? true} aiConfigured={aiConfigured} />}
      mobileAction={<PlanAddStopButton variant="round" />}
      trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />}
    />
    {stops.length > 0 && <div className="lg:hidden"><PlanFitStrip summary={planSummary} stops={mapStops} home={home} /></div>}
    <div className={stops.length > 0 ? PLAN_GRID_CLASS : "flex flex-col"}>
      <div className="flex min-w-0 flex-col gap-4">
        <ItineraryManager {/* every existing prop */} aiConfigured={aiConfigured} />
        <PlanMobileExtras tripId={tripId} chaptersEnabled={trip?.chaptersEnabled ?? true} aiConfigured={aiConfigured} />
      </div>
      {stops.length > 0 && (
        <aside aria-label="Plan overview" className={PLAN_ASIDE_CLASS}>
          <PlanMiniMap stops={mapStops} home={home} farHome={farHome} />
          <FitTile tripId={tripId} isOwner={isOwner} summary={planSummary} startDate={trip?.startDate ?? null} fitStops={/* existing fitStops mapping */} />
          <JumpList stops={planStopsNavStops} chapters={planStopsNavChapters} homeBase={planStopsNavHomeBase} />
        </aside>
      )}
    </div>
  </div>
</PlanBody>
```

The layout's trip header is hidden on this route by `isPageHeaderPath` (Phase 1). Add the plan route there, in whatever form Phase 1 gave `PAGE_HEADER_ROUTES`.

- [ ] **Step 5: Clean up the manager.** Delete `chaptersMenu`, `addStopButton`, the `data-slot="plan-flow-actions"` footer, `asideSlot` and its effect, `createPortal`, and the `PLAN_ASIDE_ACTIONS_ID` import. In its test file, delete "bottom action row (LA-008)". Move the "Chapters menu" tests (2284–2438) to `plan-header-actions.test.tsx` where they test the menu, but keep "hides per-stop 'Start a chapter here'…" in the manager test. Delete the `plan-aside` assertions.

- [ ] **Step 6: Delete the dead files.** Run `grep -rn "plan-aside\|plan-overview\"\|plan-stops-nav\|home-base-card\|stop-day-list\|quick-add-stops\|/stop-card\"\|stops-manager" app components lib --include=*.ts --include=*.tsx`. Confirm that only the files being deleted, `lib/plan-overview.ts` and comments match. Then `git rm` the list in **Files**. Change `stop-form-dialog.tsx`'s import to `import type { StopCardStop } from "@/components/plan/types";`. Update the comment in `components/trip/day/tonight-card.tsx` line 19 that names `stop-card.tsx` so it names `components/plan/stop-row.tsx`.

- [ ] **Step 7: Run everything touched.** `npm test -- "app/(app)/trips/[tripId]/plan" components/plan components/trip components/shell`. Expected: PASS.

- [ ] **Step 8: Gates and commit.** Add the page, `stop-form-dialog.tsx` and `app-paths.ts` to the scan's `FILES`.

```bash
npx tsc --noEmit && npm run lint
git add -A "app/(app)/trips/[tripId]/plan" components lib
git commit -m "feat(plan): Plan page on PageHeader with Chapters, Paste a booking and Add a stop; sticky rail of map, Fit tile and Jump list; old plan components removed (PLAN.md §1, §6, §8; spec D1)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 17: The mobile list

**Files:**
- Create: `components/plan/mobile/mobile-stop-row.tsx`, `components/plan/mobile/mobile-stop-row.test.tsx`
- Modify: `components/plan/home-base-bookend.tsx` (optional `anchorId`), and its test
- Modify: `components/trip/itinerary-manager.tsx`, `components/trip/itinerary-manager.test.tsx`

**Interfaces:**
- Consumes: `StayStatus`, `formatDateRangeCompact`, `stopHue`/`HUE_CLASSES`, `LegRow`/`LegPill` (`compact`), `useSortable`.
- Produces:
  - `MobileStopRow({ stop, number, stay, plansCount, onOpen, dragProps }: { stop: StopCardStop; number: number; stay: StayStatus | null; plansCount: number; onOpen(): void; dragProps?: React.HTMLAttributes<HTMLButtonElement> })`. The row has `id="m-stop-<id>"` and `data-mobile-stop-id`.
  - `HomeBaseBookend` gains `anchorId?: string`. It defaults to `home-base-top`/`home-base-bottom`, and the mobile list passes `m-home-base-top`/`m-home-base-bottom`.
  - The manager's `openStopSheet(stopId: string)`: `window.history.pushState(null, "", `${pathname}?${params with stop=<id>}${window.location.hash}`)` and `pushedSheetRef.current = true`.
  - The mobile list container is `data-testid="plan-mobile-list"` with `className="flex flex-col lg:hidden"`.

- [ ] **Step 1: Write the failing tests**

`mobile-stop-row.test.tsx`:
- A dated row: one `button` named `Open Paris` with `min-h-16 rounded-[18px] border-2 shadow-hard-3`, id `m-stop-par`, `data-mobile-stop-id="par"`. It shows the number tile `size-9`, the name `font-display text-[19px]`, and the summary "The Hoxton · 9 plans" with a `Check` icon (`svg`). Dates "10–15 Dec" and pill "5n".
- `stay.kind === "none"`: the summary "No bed yet · 4 plans" has `text-coral-text`.
- Rough: dashed, `bg-background`, no `shadow-hard-3`, the sub line "Drag to reorder", "Rough" + "~5n". `dragProps` (for example `{ "aria-roledescription": "sortable" }`) are spread on the button.
- Clicking calls `onOpen`.
- The ban assertion.

In `itinerary-manager.test.tsx`, add a `describe("mobile list (PLAN.md §7.1)")`:

```tsx
it("renders a row per stop, with mobile-only ids, and no duplicate desktop anchors", () => {
  renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
  const mobile = within(screen.getByTestId("plan-mobile-list"));
  expect(mobile.getByRole("button", { name: "Open Paris" })).toHaveAttribute("id", "m-stop-par");
  expect(document.querySelectorAll("#stop-par")).toHaveLength(1);
});
it("tapping a row pushes ?stop=<id>", async () => {
  const push = vi.spyOn(window.history, "pushState");
  renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
  await userEvent.click(within(screen.getByTestId("plan-mobile-list")).getByRole("button", { name: "Open Paris" }));
  expect(push).toHaveBeenCalledWith(null, "", expect.stringContaining("stop=par"));
});
it("compact leg pills: the missing one reads + Add transport", () => {
  renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} />);
  expect(within(screen.getByTestId("plan-mobile-list")).getByRole("button", { name: "Add transport from Paris to Rome" })).toHaveTextContent("Add transport");
});
```

`PARIS`/`ROME` are defined at file scope. Move them out of Task 13's describe.

- [ ] **Step 2: Run to see them fail.** `npm test -- components/plan/mobile components/trip/itinerary-manager.test.tsx`

- [ ] **Step 3: Implement**

`mobile-stop-row.tsx` (client, PLAN.md §7.1):
- `<button type="button" id={`m-stop-${stop.id}`} data-mobile-stop-id={stop.id} aria-label={`Open ${stop.name}`} onClick={onOpen} {...dragProps} className={cn("pressable flex min-h-16 w-full scroll-mt-6 items-center gap-3 rounded-[18px] border-2 border-border px-3 py-2.5 text-left", rough ? "border-dashed bg-background" : "bg-card shadow-hard-3")}>`
- The tile: `size-9 rounded-xl border-2 border-border font-display text-base font-extrabold`, filled as in StopRow (dashed and muted when rough).
- `<span className="min-w-0 flex-1"><span className="block truncate font-display text-[19px] font-extrabold">{name}</span><span className={cn("block truncate text-xs font-semibold", stay?.kind === "none" ? "text-coral-text" : "text-muted-foreground")}>{summary}</span></span>`. The summary is:
  - rough: "Drag to reorder"
  - covered/partial: `<Check className="inline size-3" aria-hidden /> {stay.name}` + ` · ${plansCount} plans` when > 0
  - none: `No bed yet` + ` · n plans`
  - null stay (same day): the plan count, or ""
- Right: `<span className="flex shrink-0 flex-col items-end gap-1"><span className="text-sm font-extrabold tabular-nums">{rough ? "Rough" : formatDateRangeCompact(a, d)}</span><span className={pillClass}>{rough ? `~${nights ?? 1}n` : `${n}n`}</span></span>`.

Manager:
- Add `SortableMobileStop({ stop, chapterId, children: (dragProps) => ReactNode })`, with the same `useSortable` call as `SortableStop`. It passes `{ ...attributes, ...listeners }` only for rough stops (spec D7: rough stops long-press to drag with the existing `TouchSensor` delay), and `undefined` for dated ones.
- Build `renderMobileList()` as a mirror of the desktop frame inside `<div data-testid="plan-mobile-list" className="flex flex-col lg:hidden"><DndContext sensors={sensors} collisionDetection={closestCenter} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>…`:
  - The rough row (as desktop).
  - Bookends with `anchorId="m-home-base-top"` / `"m-home-base-bottom"`.
  - `LegRow compact` / `LegPill compact` using the same `renderLegAfter` logic. Factor the choice into `legNodes(stop, idx, compact)` and share it.
  - Chapter dividers.
  - `SortableContext`s over stop ids.
  - `MobileStopRow` with `onOpen={() => openStopSheet(stop.id)}`.
- No open bodies on mobile.
- `openStopSheet`: build the params from `searchParams` (already read in the manager) and call `window.history.pushState(null, "", `${pathname}?${params}${window.location.hash}`)`.

- [ ] **Step 4: Run to see them pass.** `npm test -- components/plan components/trip/itinerary-manager.test.tsx`. Now there are two `DndContext`s, so `dndCapture` records the mobile one. Both share the handlers, so the Task 13 drag tests still pass.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/plan components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "feat(plan): mobile plan list — stop rows, compact leg pills, rough rows long-press to reorder (PLAN.md §7.1; spec D7)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---
### Task 18: Stop sheet, pick-a-day sheet and the stop actions sheet (mobile)

**Read first:** the "Native History API" section of `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`. `pushState` updates `useSearchParams()`, which is how the sheet opens and how the browser's Back button closes it.

**Files:**
- Create: `components/plan/mobile/stop-sheet.tsx`, `components/plan/mobile/stop-sheet.test.tsx`
- Create: `components/plan/mobile/pick-day-sheet.tsx`, `components/plan/mobile/pick-day-sheet.test.tsx`
- Modify: `components/trip/itinerary-manager.tsx`, `components/trip/itinerary-manager.test.tsx`

**Interfaces:**
- Consumes: `@radix-ui/react-dialog` (as `DialogPrimitive`); `Segmented`, `SegmentedItem` (`components/ui/segmented.tsx`); `Sheet`, `SheetContent`, `SheetTitle`; `StopActionsSheet` (Task 3); `DaySlot`, `dayLoadLabel`, `dayTag` (Task 2); `StayStatus`; `formatDayLabel`, `nightsBetween`, `tzAbbrev`, `formatDateRangeCompact`.
- Produces:
  - `StopSheet(props: StopSheetProps)`, where `interface StopSheetProps { open: boolean; onClose(): void; stop: StopCardStop; number: number; slots: DaySlot[]; dayItems: StopDayItem[]; ideas: ThingToDo[]; stay: StayStatus | null; accommodationRows: React.ReactNode; onAddStay(): void; onEditItem(item: StopDayItem): void; onAddPlan(dateISO?: string): void; onPickDay(idea: ThingToDo): void; onEditDates(): void; onActions(): void }`
  - `PickDaySheet({ open, onOpenChange, title, slots, stop, onPick }: { open: boolean; onOpenChange(o: boolean): void; title: string; slots: DaySlot[]; stop: { arriveDate: string; departDate: string }; onPick(dateISO: string): void })`
  - The manager reads `searchParams.get("stop")` to open the sheet. `closeStopSheet()` calls `history.back()` when this session pushed the entry (`pushedSheetRef`); otherwise it `replaceState`s the URL without `stop`.

- [ ] **Step 1: Write the failing tests**

`stop-sheet.test.tsx`:

```tsx
const PARIS = { id: "par", name: "Paris", country: "France", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-12", nights: null, pinned: false, chapterId: null, sortOrder: 1, notes: null, lat: null, lng: null };
const ITEMS = [{ id: "a", title: "Check in", category: "OTHER", date: "2026-12-10", startTime: "15:00" }, { id: "b", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-11", startTime: "10:00" }];
const IDEAS = [{ id: "i1", title: "Musée d'Orsay", category: "SIGHTSEEING" }];
const COVERED = { kind: "covered" as const, name: "Grands Boulevards", totalNights: 2, coveredNights: 2, extra: 0, checkInTime: null };
function renderSheet(p = {}) {
  const props = { open: true, onClose: vi.fn(), stop: PARIS, number: 2, slots: daySlots(PARIS, ITEMS), dayItems: ITEMS, ideas: IDEAS, stay: COVERED,
    accommodationRows: <div>acc row</div>, onAddStay: vi.fn(), onEditItem: vi.fn(), onAddPlan: vi.fn(), onPickDay: vi.fn(), onEditDates: vi.fn(), onActions: vi.fn(), ...p };
  return { props, ...render(<StopSheet {...props} />) };
}

describe("StopSheet (PLAN.md §7.2)", () => {
  it("a full-screen dialog titled by the stop, with back and actions buttons", async () => {
    const { props } = renderSheet();
    const dialog = screen.getByRole("dialog", { name: "Paris" });
    expect(dialog.className).toMatch(/inset-0/);
    expect(screen.getByText("Thu 10 – Sat 12 Dec · 2 nights", { exact: false })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to the plan" }));
    expect(props.onClose).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Actions for Paris" }));
    expect(props.onActions).toHaveBeenCalled();
  });

  it("Days lists every day with its tag, all items, a + and the free-day copy", async () => {
    const { props } = renderSheet();
    const thu = screen.getByTestId("sheet-day-2026-12-10");
    expect(within(thu).getByText("Arrive")).toBeInTheDocument();
    expect(within(thu).getByText("Check in")).toBeInTheDocument();
    expect(within(screen.getByTestId("sheet-day-2026-12-12")).getByText("Free day. Tap + or pick an idea.")).toBeInTheDocument();
    await userEvent.click(within(thu).getByRole("button", { name: "Add a plan to Thu 10" }));
    expect(props.onAddPlan).toHaveBeenCalledWith("2026-12-10");
    await userEvent.click(screen.getByRole("button", { name: /Louvre/ }));
    expect(props.onEditItem).toHaveBeenCalledWith(ITEMS[1]);
  });

  it("tabs: Days · Stay ✓ · Ideas 1; Stay shows the rows and + Add a stay; Ideas has Pick day", async () => {
    const { props } = renderSheet();
    await userEvent.click(screen.getByRole("radio", { name: /Stay/ }));
    expect(screen.getByText("acc row")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ Add a stay" }));
    expect(props.onAddStay).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("radio", { name: "Ideas 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Pick day for Musée d'Orsay" }));
    expect(props.onPickDay).toHaveBeenCalledWith(IDEAS[0]);
  });

  it("Stay ! in coral when there is no bed", () => {
    renderSheet({ stay: { ...COVERED, kind: "none", name: null, coveredNights: 0 } });
    expect(screen.getByRole("radio", { name: /Stay/ })).toHaveTextContent("Stay !");
  });

  it("the sticky footer: Edit dates and + Add a plan (presets the top day)", async () => {
    const { props } = renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Edit dates" }));
    expect(props.onEditDates).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "+ Add a plan" }));
    expect(props.onAddPlan).toHaveBeenCalledWith("2026-12-10");
  });

  it("uses no banned soft classes", () => {
    renderSheet();
    expect(document.body.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
```

`pick-day-sheet.test.tsx`:

```tsx
const STOP = { arriveDate: "2026-12-10", departDate: "2026-12-14" };
const SLOTS = daySlots(STOP, [
  ...[1, 2].map((i) => ({ id: `a${i}`, date: "2026-12-10", category: "FOOD" })),
  ...[1, 2, 3, 4, 5].map((i) => ({ id: `b${i}`, date: "2026-12-12", category: "FOOD" })),
], { "2026-12-12": { title: "Versailles day" } });

describe("PickDaySheet (PLAN.md §7.3)", () => {
  it("heads with the idea, one row per day with its load", () => {
    render(<PickDaySheet open onOpenChange={vi.fn()} title="Musée d'Orsay" slots={SLOTS} stop={STOP} onPick={vi.fn()} />);
    expect(screen.getByText("Pick a day for")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Musée d'Orsay" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Thu 10.*Arrive · 2 plans/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Sat 12.*Versailles day · full/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Sun 13.*Free day/ })).toBeInTheDocument();
  });
  it("selecting a row fills it teal and the CTA adds to that day", async () => {
    const onPick = vi.fn();
    const onOpenChange = vi.fn();
    render(<PickDaySheet open onOpenChange={onOpenChange} title="Musée d'Orsay" slots={SLOTS} stop={STOP} onPick={onPick} />);
    expect(screen.getByRole("button", { name: /^Add to/ })).toBeDisabled();
    const sun = screen.getByRole("radio", { name: /Sun 13/ });
    await userEvent.click(sun);
    expect(sun).toHaveAttribute("aria-checked", "true");
    expect(sun.className).toContain("bg-teal");
    await userEvent.click(screen.getByRole("button", { name: "Add to Sun 13" }));
    expect(onPick).toHaveBeenCalledWith("2026-12-13");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

Manager test additions (`describe("mobile sheets")`):
- `navState.search = "stop=par"` gives an open `dialog` named "Paris".
- Its "Actions for Paris" opens a dialog with the "Edit name & place" group row.
- The Ideas tab's "Pick day for …" opens a dialog titled with the idea. Choosing a day and "Add to …" calls `scheduleItem` with the idea's id and that date.
- "Back to the plan" with `navState.search = "stop=par"` and no push first calls `window.history.replaceState` with a URL without `stop=`.

Reset `navState.search = ""` in `beforeEach`.

- [ ] **Step 2: Run to see them fail.** `npm test -- components/plan/mobile components/trip/itinerary-manager.test.tsx`

- [ ] **Step 3: Implement**

`stop-sheet.tsx` (client):
- Frame: `<DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}><DialogPrimitive.Portal><DialogPrimitive.Content aria-describedby={undefined} className="fixed inset-0 z-50 flex flex-col bg-background data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down">`.
- Top row, `flex items-center gap-3 border-b-2 border-muted px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]`:
  - `<button aria-label="Back to the plan" onClick={onClose} className="pressable grid size-11 place-items-center rounded-full border-2 border-border bg-card"><ArrowLeft className="size-5" /></button>`
  - a `size-11` number tile (as in StopRow)
  - `<div className="min-w-0 flex-1"><DialogPrimitive.Title className="truncate font-display text-[28px] font-extrabold leading-none">{stop.name}</DialogPrimitive.Title><p className="text-xs font-semibold text-muted-foreground">{meta}</p></div>`. `meta` is `formatStayRange(a, d) · {n} night(s) · {tz}`, or "Rough · ~n nights".
  - `<button aria-label={`Actions for ${stop.name}`} onClick={onActions} className="pressable grid size-11 place-items-center rounded-full border-2 border-border bg-card"><Ellipsis className="size-5" /></button>`.
- Tabs: `<Segmented type="single" tone="ink" value={tab} onValueChange={(v) => v && setTab(v)} aria-label="Stop sections" className="mx-4 mt-3 grid grid-cols-3">`, with `SegmentedItem` "Days", "Stay ✓"/"Stay !" and "Ideas {n}". Render the ✓ as a `<Check className="size-3.5" aria-hidden />` after "Stay", and the "!" as literal text in `text-coral-text` when `stay?.kind === "none"`. The segmented items are Radix toggle items, which carry `role="radio"`.
- The scroll body is `ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"`.
  - **Days** (dated): one block per slot, `<section data-testid={`sheet-day-${d}`} data-day={d} className="border-b-2 border-muted py-3">`.
    - Head `flex items-center gap-2`: `<span className="text-sm font-extrabold">{formatDayLabel(d) without month}</span>`, the tag (`dayTag`) in `text-xs font-semibold text-muted-foreground`, the title when set, then `ml-auto` `<button aria-label={`Add a plan to ${dayLabel}`} onClick={() => onAddPlan(d)} className="pressable grid size-8 place-items-center rounded-full border-2 border-border bg-card"><Plus className="size-4" /></button>`. Its hit area goes to 44px with `tap-target`.
    - Items: every one, as `<button aria-label={`${time ?? ""} ${title}`.trim()} onClick={() => onEditItem(it)} className="flex min-h-11 w-full items-center gap-3 text-left text-sm">`, holding the time (`w-12 tabular-nums text-xs font-bold`), the category dot and the title.
    - An empty day reads `<p className="text-[13px] text-muted-foreground">Free day. Tap + or pick an idea.</p>`.
  - **Days** (rough): "Needs dates first", plus an ink "Give it dates" button that calls `onEditDates`.
  - **Stay**: `{accommodationRows}` and `<Button variant="outline" size="md" onClick={onAddStay}>+ Add a stay</Button>`. Rough stops get "Needs dates first".
  - **Ideas**: rows `flex min-h-[52px] items-center gap-3 border-b-2 border-muted`, holding the dot, the title and `<button aria-label={`Pick day for ${title}`} onClick={() => onPickDay(idea)} className="pressable ml-auto h-8 rounded-full border-2 border-border bg-sun px-3 text-xs font-extrabold">Pick day</button>`. On a rough stop the Pick day pill is hidden.
- Sticky footer: `<div className="flex gap-2.5 border-t-2 border-border bg-background px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"><Button variant="outline" size="lg" onClick={onEditDates}>Edit dates</Button><Button variant="primary" size="lg" className="flex-1" onClick={() => onAddPlan(topDay())}>+ Add a plan</Button></div>`. `topDay()` returns the `data-day` of the first `[data-day]` block whose `offsetTop + offsetHeight > scrollRef.current.scrollTop`, falling back to the first slot. In jsdom every offset is 0, so it's the first day.

`pick-day-sheet.tsx` (client):
- `<Sheet open onOpenChange><SheetContent side="bottom" overlayClassName="bg-foreground/45 backdrop-blur-none">`.
- `<p className="text-[13px] font-semibold text-muted-foreground">Pick a day for</p><SheetTitle className="font-display text-2xl">{title}</SheetTitle>`.
- `<div role="radiogroup" aria-label="Days" className="flex flex-col gap-2">`, with one row per slot: `<button role="radio" aria-checked={sel} onClick={() => setSel(d)} className={cn("pressable flex min-h-[50px] items-center gap-3 rounded-[14px] border-2 border-border px-3.5 text-left", sel ? "bg-teal text-on-accent shadow-hard-1" : "bg-card")}>`. It holds `<span className="w-16 shrink-0 text-sm font-extrabold">{day label without month}</span>`, `<span className="flex-1 text-xs font-semibold">{dayLoadLabel(slot, dayTag(stop, d))}</span>` and, when selected, `<Check className="size-4" />`.
- CTA `<Button variant="primary" size="lg" className="w-full" disabled={!sel} onClick={() => { onPick(sel!); onOpenChange(false); }}>Add to {label of sel}</Button>`. With nothing selected it reads "Add to a day".

Manager:
- `const sheetStopId = searchParams?.get("stop") ?? null`.
- `const pushedSheetRef = useRef(false)`, which `openStopSheet` sets.
- `closeStopSheet()`: `if (pushedSheetRef.current) { pushedSheetRef.current = false; window.history.back(); } else { const p = new URLSearchParams(searchParams?.toString()); p.delete("stop"); window.history.replaceState(null, "", `${pathname}${p.size ? `?${p}` : ""}${window.location.hash}`); }`.
- Render `<StopSheet>` for the stop found by `sheetStopId`, with these wired to the same state setters as desktop: `onEditItem`, `onAddPlan` (`setItemForm` create with date), `onAddStay` (`handleAddAccommodationClick`), `onEditDates` (`handleAdjustDates`), `accommodationRows={renderAccommodationRows(stop)}`, `onActions={() => setActionsStopId(stop.id)}`, and `onPickDay={(idea) => setPickIdea({ stopId: stop.id, idea })}`.
- Render `<StopActionsSheet open={!!actionsStopId} … groups={buildStopActions(…same as desktop…)} />` and `<PickDaySheet open={!!pickIdea} title={pickIdea.idea.title} slots={slotsFor(stop)} stop={stop} onPick={(d) => handleScheduleThing(pickIdea.idea, d)} />`.
- Factor the slot computation into `slotsFor(stop, idx)` so desktop and the sheets share it.

- [ ] **Step 4: Run to see them pass.** `npm test -- components/plan components/trip/itinerary-manager.test.tsx`

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/plan components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "feat(plan): mobile stop sheet on ?stop=, pick-a-day sheet and stop actions sheet (PLAN.md §7.2, §7.3, §7.6; spec D3)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 19: Add a stop — sheet on mobile, 560px dialog on desktop

**Files:**
- Create: `components/plan/mobile/add-stop-sheet.tsx`, `components/plan/mobile/add-stop-sheet.test.tsx`
- Modify: `components/trip/itinerary-manager.tsx` (the add path uses `AddStopSheet`; `StopFormDialog` stays for edit) and its test (`fork-aware createStop`)
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx` (pass `projectedEnd={planSummary.projectedEnd}` and `hardEndDate={trip?.hardEndDate ?? null}` to the manager)

**Interfaces:**
- Consumes: `PlaceCombobox`, `PickedPlace` (Phase 2); `RangeCalendar` (Phase 2); `Stepper` (`components/ui/stepper.tsx`); `Segmented`; `Select*` (`components/ui/select.tsx`); `addStopConsequence`, `routeCentroid` (Task 5); `createStop` (`server/actions/stops.ts`); `guessTimezoneForCountry` (`lib/tz.ts`); `FormError` (`components/ui/form-error.tsx`); `stopHue`/`HUE_CLASSES`.
- Produces:
  - `AddStopSheet(props: AddStopSheetProps)`, where `interface AddStopSheetProps { open: boolean; onOpenChange(o: boolean): void; tripId: string; forkId: string | null; stops: { id: string; name: string; sortOrder: number; arriveDate: string | null; departDate: string | null; lat?: number | null; lng?: number | null }[]; projectedEnd: string | null; hardEndDate: string | null; tripStartDate?: string; defaultRange?: { arriveDate?: string; departDate?: string } }`
  - `ItineraryManager` gains `projectedEnd?: string | null; hardEndDate?: string | null`.

- [ ] **Step 1: Write the failing test** — `add-stop-sheet.test.tsx`

Mock `@/server/actions/stops` → `createStop: vi.fn(async () => ({ success: true }))`. Mock `@/components/ui/place-combobox`:

```tsx
const comboCapture = vi.hoisted(() => ({ props: undefined as Record<string, unknown> | undefined }));
vi.mock("@/components/ui/place-combobox", () => ({
  PlaceCombobox: (p: { value: string; onValueChange: (t: string) => void; onPick: (x: unknown) => void; rankNear?: unknown }) => {
    comboCapture.props = p;
    return (
      <div>
        <input aria-label="Place" value={p.value} onChange={(e) => p.onValueChange(e.target.value)} />
        <button onClick={() => p.onPick({ name: "Florence", region: "Tuscany, Italy", lat: 43.77, lng: 11.25, countryCode: "IT" })}>pick Florence</button>
      </div>
    );
  },
}));
vi.mock("@/components/ui/range-calendar", () => ({
  RangeCalendar: (p: { onChange: (r: { start?: string; end?: string }) => void }) => (
    <button onClick={() => p.onChange({ start: "2026-12-22", end: "2026-12-24" })}>pick range</button>
  ),
}));
```

Then:

```tsx
const STOPS = [
  { id: "par", name: "Paris", sortOrder: 0, arriveDate: "2026-12-10", departDate: "2026-12-15", lat: 48.85, lng: 2.35 },
  { id: "rom", name: "Rome", sortOrder: 1, arriveDate: "2026-12-15", departDate: "2026-12-22", lat: 41.9, lng: 12.5 },
];
const base = { open: true, onOpenChange: vi.fn(), tripId: "t1", forkId: null, stops: STOPS, projectedEnd: "2027-01-03", hardEndDate: "2027-01-08", tripStartDate: "2026-12-10" };

describe("AddStopSheet (PLAN.md §7.4)", () => {
  it("a dialog titled Add a stop; the CTA waits for a place; free text works", async () => {
    render(<AddStopSheet {...base} />);
    expect(screen.getByRole("dialog", { name: "Add a stop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add / })).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Place" }), "Lucca");
    expect(screen.getByRole("button", { name: "Add Lucca" })).toBeEnabled();
  });

  it("ranks results near the route's centre", () => {
    render(<AddStopSheet {...base} />);
    expect(comboCapture.props!.rankNear).toEqual({ lat: (48.85 + 41.9) / 2, lng: (2.35 + 12.5) / 2 });
  });

  it("Roughly: a nights stepper and the live consequence line", async () => {
    render(<AddStopSheet {...base} />);
    await userEvent.click(screen.getByRole("radio", { name: "Roughly" }));
    await userEvent.click(screen.getByRole("button", { name: "Increase Nights" }));
    await userEvent.click(screen.getByRole("button", { name: "Increase Nights" }));
    expect(screen.getByText("Lands on Tue 22 – Sun 27 Dec. 0 nights spare after this.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Increase Nights" }));
    await userEvent.click(screen.getByRole("button", { name: "Increase Nights" }));
    expect(screen.getByText("Pushes you 2 nights past Fri 8 Jan.").className).toContain("text-coral-text");
  });

  it("GOES AFTER defaults to the last stop and submits a rough stop after it", async () => {
    const { createStop } = await import("@/server/actions/stops");
    render(<AddStopSheet {...base} />);
    expect(screen.getByRole("combobox", { name: "Goes after" })).toHaveTextContent("Rome");
    await userEvent.click(screen.getByRole("radio", { name: "Roughly" }));
    await userEvent.click(screen.getByRole("button", { name: "pick Florence" }));
    await userEvent.click(screen.getByRole("button", { name: "Add Florence" }));
    expect(createStop).toHaveBeenCalledWith("t1", { mode: "rough", name: "Florence", country: "Italy", nights: 3, lat: 43.77, lng: 11.25 }, undefined, "rom");
  });

  it("Exact dates: submits a scheduled stop with a guessed timezone", async () => {
    const { createStop } = await import("@/server/actions/stops");
    render(<AddStopSheet {...base} forkId="fork-1" />);
    await userEvent.click(screen.getByRole("radio", { name: "Exact dates" }));
    await userEvent.click(screen.getByRole("button", { name: "pick Florence" }));
    await userEvent.click(screen.getByRole("button", { name: "pick range" }));
    await userEvent.click(screen.getByRole("button", { name: "Add Florence" }));
    expect(createStop).toHaveBeenCalledWith(
      "t1",
      { mode: "scheduled", name: "Florence", country: "Italy", timezone: "Europe/Rome", arriveDate: "2026-12-22", departDate: "2026-12-24", lat: 43.77, lng: 11.25 },
      "fork-1",
      "rom",
    );
  });

  it("uses no banned soft classes", () => {
    render(<AddStopSheet {...base} />);
    expect(document.body.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
```

The default nights is 3, so two clicks make 5. In the manager test, update "fork-aware createStop" to use the same `PlaceCombobox` mock. Open the sheet via `navState.search = "add=stop"` or the header registration, then assert `createStop` got `forkId` as the third argument.

- [ ] **Step 2: Run to see it fail.** `npm test -- components/plan/mobile/add-stop-sheet.test.tsx`

- [ ] **Step 3: Implement** (client)

- `<Dialog open onOpenChange><DialogContent className="sm:max-w-[560px] max-sm:h-[calc(100dvh-118px)]"><DialogHeader><DialogTitle className="font-display text-[26px]">Add a stop</DialogTitle></DialogHeader>`.
- Place: `<PlaceCombobox value={text} onValueChange={(t) => { setText(t); setPicked(null); }} onPick={(p) => { setPicked(p); setText(p.name); }} placeholder="Where to?" rankNear={routeCentroid(stops) ?? undefined} autoFocus />`.
- `<p className={LABEL}>HOW LONG</p>`, with `const LABEL = "text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground"`. Then `<Segmented type="single" tone="ink" value={mode} onValueChange={(v) => v && setMode(v as "exact" | "rough")} aria-label="How long" className="grid grid-cols-2"><SegmentedItem value="exact">Exact dates</SegmentedItem><SegmentedItem value="rough">Roughly</SegmentedItem></Segmented>`.
  - The initial `mode` is `"exact"` when the last stop is dated or `tripStartDate` is set, else `"rough"`.
- Roughly: `<Stepper value={nights} onChange={setNights} min={1} max={60} unit="nights" label="Nights" className="self-start" />`. The initial `nights` is 3.
- Exact: `<RangeCalendar start={range.start} end={range.end} onChange={setRange} months={1} disableBefore={tripStartDate} />`, seeded from `defaultRange`.
- When there are stops: `<p className={LABEL}>GOES AFTER</p>`, then `<Select value={afterId} onValueChange={setAfterId}><SelectTrigger aria-label="Goes after"><SelectValue /></SelectTrigger><SelectContent>{stops.map((s) => <SelectItem key={s.id} value={s.id}><span className="flex items-center gap-2"><span className={cn("size-2.5 rounded-full border-2 border-border", HUE_CLASSES[stopHue(s.sortOrder)].fill)} />{s.name}<span className="text-muted-foreground">{s.arriveDate && s.departDate ? formatDateRangeCompact(s.arriveDate, s.departDate) : "rough"}</span></span></SelectItem>)}</SelectContent></Select>`. `afterId` defaults to the last stop's id.
- Consequence: `const c = addStopConsequence({ mode, nights, range: range.start && range.end ? { arrive: range.start, depart: range.end } : null, after: stops.find((s) => s.id === afterId) ?? null, projectedEnd, hardEndDate })`, rendered as `{c && <p aria-live="polite" className={cn("text-[13px] font-semibold", c.over && "text-coral-text")}>{c.text}</p>}`.
- Submit: `const name = (picked?.name ?? text).trim(); const country = picked?.region?.split(",").pop()?.trim();`. Build the rough or scheduled input exactly as in the test. Omit `country`/`lat`/`lng` when undefined, and pass `timezone: guessTimezoneForCountry(picked?.countryCode ?? country)`. Then `createStop(tripId, input, forkId ?? undefined, afterId ?? undefined)` inside `useTransition`.
  - On `!res.success`, show `<FormError>{Object.values(res.errors).flat()[0]}</FormError>`. On success, `onOpenChange(false)` and reset.
  - Exact mode with no range disables the CTA.
- CTA: `<Button variant="primary" size="lg" className="w-full" disabled={!name || (mode === "exact" && !(range.start && range.end)) || pending} loading={pending}>Add {name || "a stop"}</Button>`.

Manager: replace the add `StopFormDialog` (the block with `open={addStopOpen}`) with `<AddStopSheet open={addStopOpen} onOpenChange={setAddStopOpen} tripId={tripId} forkId={forkId ?? null} stops={stops} projectedEnd={projectedEnd ?? null} hardEndDate={hardEndDate ?? null} tripStartDate={tripStartDate} defaultRange={suggestedStopDates} />`. Check `suggestNextStopDates`' return shape and map it to `{ arriveDate, departDate }`.

- [ ] **Step 4: Run to see it pass.** `npm test -- components/plan components/trip/itinerary-manager.test.tsx "app/(app)/trips/[tripId]/plan"`

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/plan components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx "app/(app)/trips/[tripId]/plan/page.tsx"
git commit -m "feat(plan): Add a stop sheet/dialog — near-route place search, exact or rough, goes-after, live consequence (PLAN.md §7.4; spec D4)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 20: Fill a leg — the transport sheet restyle

**Files:**
- Modify: `components/trip/transport-form-dialog.tsx`, `components/trip/transport-form-dialog.test.tsx`
- Modify: `components/trip/itinerary-manager.tsx` (pass `aiConfigured`, stop hues and dates in `stopOptions`)

**Interfaces:**
- Consumes: `TRANSPORT_MODE_LIST`; `AiBookingParser` (`components/trip/ai-booking-parser.tsx`); `InlineCostFields`; `stopHue`/`HUE_CLASSES`; `formatDayLabel`; `formatDuration`.
- Produces:
  - `StopOption` (transport) gains `sortOrder?: number; departDate?: string | null; arriveDate?: string | null`
  - `TransportFormDialogProps` gains `aiConfigured?: boolean`. It already has `onDelete` from Task 13.
  - `TRANSPORT_MODE_TILES`: display labels, in order Train, Car, Flight, Bus, Ferry, Other. Train uses the `TrainFront` icon (README glyph mapping).

The existing callers (`day-entry-link.tsx`) keep working: every new prop is optional.

- [ ] **Step 1: Write the failing tests** (add to `transport-form-dialog.test.tsx`; follow its existing mocks)

```tsx
const STOPS = [
  { id: "rom", name: "Rome", timezone: "Europe/Rome", sortOrder: 2, arriveDate: "2026-12-15", departDate: "2026-12-22" },
  { id: "flo", name: "Florence", timezone: "Europe/Rome", sortOrder: 3, arriveDate: "2026-12-22", departDate: "2026-12-27" },
];
describe("transport sheet (PLAN.md §7.5)", () => {
  it("create: context row, How are you getting there?, six mode tiles", () => {
    render(<TransportFormDialog tripId="t" stops={STOPS} defaultFromStopId="rom" defaultToStopId="flo" open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "How are you getting there?" })).toBeInTheDocument();
    const ctx = screen.getByTestId("leg-context");
    expect(ctx).toHaveTextContent("Rome");
    expect(ctx).toHaveTextContent("Florence");
    expect(ctx).toHaveTextContent("Tue 22 Dec");
    const tiles = within(screen.getByRole("radiogroup", { name: "Mode" })).getAllByRole("radio");
    expect(tiles.map((t) => t.textContent)).toEqual(["Train", "Car", "Flight", "Bus", "Ferry", "Other"]);
  });
  it("picking a tile fills it coral; Car hides the times; the CTA names the mode", async () => {
    render(<TransportFormDialog tripId="t" stops={STOPS} defaultFromStopId="rom" defaultToStopId="flo" open onOpenChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: "Train" }));
    expect(screen.getByRole("radio", { name: "Train" }).className).toContain("bg-coral");
    expect(screen.getByLabelText("Leaves Rome")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add train" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Car" }));
    expect(screen.queryByLabelText("Leaves Rome")).toBeNull();
  });
  it("booking ref label and the Paste a booking swap", async () => {
    render(<TransportFormDialog tripId="t" stops={STOPS} defaultFromStopId="rom" defaultToStopId="flo" open onOpenChange={vi.fn()} aiConfigured />);
    expect(screen.getByText("Booking ref · only people on the trip see this")).toBeInTheDocument();
    expect(screen.getByText("Got the confirmation email?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Paste a booking" }));
    expect(screen.getByTestId("ai-booking-parser")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to the leg" }));
    expect(screen.getByRole("radiogroup", { name: "Mode" })).toBeInTheDocument();
  });
  it("cost is collapsed behind + Add cost", async () => {
    render(<TransportFormDialog tripId="t" stops={STOPS} open onOpenChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add cost" }));
    expect(screen.getByLabelText(/Amount|Cost/)).toBeInTheDocument();
  });
  it("edit: Train to Florence, Save, Delete leg", async () => {
    const onDelete = vi.fn();
    render(<TransportFormDialog tripId="t" stops={STOPS} transport={{ id: "tr1", mode: "TRAIN", fromStopId: "rom", toStopId: "flo", sortOrder: 0 }} open onOpenChange={vi.fn()} onDelete={onDelete} />);
    expect(screen.getByRole("dialog", { name: "Train to Florence" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete leg" }));
    expect(onDelete).toHaveBeenCalled();
  });
});
```

Mock `@/components/trip/ai-booking-parser` → `AiBookingParser: () => <div data-testid="ai-booking-parser" />`. Check `InlineCostFields`' amount label and adjust the `getByLabelText` regex to match it. Existing tests that select the mode through the Radix `Select` switch to clicking the tile. Tests that assert "Add Transport" / "Edit Transport" / "Save changes" copy switch to the new copy.

- [ ] **Step 2: Run to see them fail.** `npm test -- components/trip/transport-form-dialog.test.tsx`

- [ ] **Step 3: Implement** (restyle only; `TransportForm`'s state, submit, zones and warnings are unchanged)

- Title: `transport ? `${modeLabel(transport.mode)} to ${toName ?? "…"}` : "How are you getting there?"`, where `toName` is the to-stop's name (or `arrPlace`, or the Home base). `FormDialog` receives it as `title`. `modeLabel` for CAR is "Car".
- Context row (`data-testid="leg-context"`, `flex items-center gap-2`), shown when the from or to value is a stop or home: `<span className={cn("rounded-full border-2 border-border px-2.5 text-xs font-extrabold", HUE_CLASSES[stopHue(from.sortOrder ?? 0)].fill)}>{fromName}</span><ArrowRight className="size-3.5" aria-hidden /><span …>{toName}</span><span className="ml-auto text-xs font-semibold text-muted-foreground">{formatDayLabel(fromStop.departDate ?? toStop.arriveDate)}</span>`. The date span shows only when one exists.
- Mode grid, replacing the Mode `Select`: `<div role="radiogroup" aria-label="Mode" className="grid grid-cols-3 gap-2">`. Each tile is `<button type="button" role="radio" aria-checked={mode === m.value} onClick={() => setMode(m.value)} className={cn("pressable flex h-[52px] items-center justify-center gap-2 rounded-[14px] border-2 border-border text-sm font-extrabold", mode === m.value ? "bg-coral text-on-accent shadow-hard-1" : "bg-card")}>`, holding the icon and the label.
- Keep the From/To `LocationCombobox` pair, but in create mode with both defaults set, wrap it in `<details><summary className="text-[13px] font-semibold text-muted-foreground">Change the stops</summary>…</details>`. The context row already says where the leg runs.
- Leaves/Arrives, shown when `mode !== "CAR" || depAt || arrAt`: two field cards, `grid grid-cols-2 gap-2`. Each is `rounded-[14px] border-2 border-border bg-card px-3 py-2`, with `<label htmlFor=… className="block text-[11px] font-semibold text-muted-foreground">Leaves {fromName}</label>` over the existing datetime-local `Input`, restyled `border-0 bg-transparent p-0 text-[17px] font-extrabold tabular-nums`. The same goes for "Arrives {toName}". For a Car with no times, show the drive estimate instead: `transport?.driveEstimate ? `~${formatDuration(m)} · ${km} km` : "We'll estimate the drive once it's saved."`, followed by a `<button>Add times</button>` that sets `showTimes`.
- Booking ref: relabel the `Field` "Booking ref · only people on the trip see this".
- Paste row, when `aiConfigured`: `<div className="flex items-center gap-2 rounded-[14px] border-2 border-border bg-sun px-3.5 py-2.5 text-on-accent"><span className="flex-1 text-[13px] font-extrabold">Got the confirmation email?</span><Button type="button" variant="secondary" size="sm" onClick={() => setPasting(true)}>Paste a booking</Button></div>`. While `pasting` is true, the form body is replaced by `<AiBookingParser tripId={tripId} aiConfigured />` and `<Button variant="ghost" onClick={() => setPasting(false)}>Back to the leg</Button>` (deviation 8).
- Cost: `<div className="flex items-center justify-between"><span className="text-sm font-bold">Cost</span>{!showCost && <button type="button" className="text-sm font-bold text-coral-text" onClick={() => setShowCost(true)}>+ Add cost</button>}</div>`, then `{showCost && <InlineCostFields … />}`. `showCost` starts true when `singleCost || hasMultipleCosts`.
- Notes, Attachments and Position in plan (edit) stay as today, below the cost.
- Footer: remove Cancel. `Delete leg` (edit + `onDelete`, ghost, `text-coral-text`) comes first, then `<Button type="submit" variant="primary" size="lg" className="flex-1" loading={isPending}>{isEdit ? "Save" : `Add ${TRANSPORT_MODE_META[mode].label.toLowerCase()}`}</Button>`.
- Manager: pass `aiConfigured={aiConfigured}` to both `TransportFormDialog`s, and build `stopOptions` with `sortOrder`, `arriveDate` and `departDate`.

- [ ] **Step 4: Run to see them pass.** `npm test -- components/trip/transport-form-dialog.test.tsx components/trip/itinerary-manager.test.tsx components/trip/day-entry-link.test.tsx`

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/trip/transport-form-dialog.tsx components/trip/transport-form-dialog.test.tsx components/trip/itinerary-manager.tsx
git commit -m "feat(plan): transport sheet — leg context, mode tiles, leaves/arrives cards, paste a booking, collapsible cost, delete leg (PLAN.md §7.5)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 21: Checklists — PageHeader with counts, two tabs, Reminders restyle

**Files:**
- Modify: `app/(app)/trips/[tripId]/checklists/page.tsx`, `page.test.tsx`
- Modify: `app/(app)/trips/[tripId]/checklists/checklists-layout.tsx`, `checklists-layout.test.tsx`
- Modify: `components/trip/reminders-card.tsx`, `components/trip/reminders-card.test.tsx`
- Modify: `components/shell/app-paths.ts`, `app-paths.test.ts` (add checklists)

**Interfaces:**
- Consumes: `PageHeader`, `TripHeaderTrailing`, `tripEyebrow` (Task 5), `tripSlugFor`.
- Produces:
  - `export function checklistsMeta(pretrip: { done: boolean }[], packing: { done: boolean }[]): string | undefined` (exported from the page)
  - `ChecklistsPanel.value` becomes `"pretrip" | "packing"`
  - `CHECKLISTS_TITLE_CLASS` is deleted (if Phase 1 hasn't already)

- [ ] **Step 1: Write the failing tests**

In `checklists/page.test.tsx`:
- Add `trip: { findUnique: vi.fn(async () => ({ name: "Christmas in Europe", startDate: "2026-12-04" })) }` to the db mock.
- `vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => null }))`
- `vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: vi.fn(async () => "trip-1") }))`
- Delete the `CHECKLISTS_TITLE_CLASS` describe.
- Change "three panels" to two, and assert `queryByTestId("panel-booking")` is null and `queryByTestId("booking-parser")` is null.
- Add:

```tsx
describe("checklistsMeta (AUDIT.md Checklists)", () => {
  it("to do · packed of total, dropping empty halves", async () => {
    const { checklistsMeta } = await import("./page");
    const pre = [{ done: false }, { done: false }, { done: false }, { done: false }, { done: true }];
    const pack = [...Array(12).fill({ done: true }), ...Array(18).fill({ done: false })];
    expect(checklistsMeta(pre, pack)).toBe("4 to do · 12 packed of 30");
    expect(checklistsMeta(pre, [])).toBe("4 to do");
    expect(checklistsMeta([], pack)).toBe("12 packed of 30");
    expect(checklistsMeta([], [])).toBeUndefined();
  });
});
it("renders the PageHeader h1 with the trip eyebrow", async () => {
  render(await ChecklistsPage({ params: Promise.resolve({ tripId: "trip-1" }) }));
  expect(screen.getByRole("heading", { level: 1, name: "Checklists" })).toBeInTheDocument();
  expect(screen.getByText("Christmas in Europe 2026")).toBeInTheDocument();
});
```

In `checklists-layout.test.tsx`, update the fixtures to two panels. The desktop grid is `lg:grid-cols-2` with no `2xl:grid-cols-3`.

In `reminders-card.test.tsx`, add: `it("is the 2px hard-shadow card with a display heading", () => { const { container } = render(<RemindersCard …existing fixture… />); const card = container.firstElementChild as HTMLElement; expect(card.className).toContain("shadow-hard-3"); expect(card.className).toContain("border-2"); expect(screen.getByRole("heading", { level: 2, name: "Reminders" }).className).toContain("font-extrabold"); expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/); });`

- [ ] **Step 2: Run to see them fail.** `npm test -- "app/(app)/trips/[tripId]/checklists" components/trip/reminders-card.test.tsx`

- [ ] **Step 3: Implement**

- Page:
  - Remove the `AiBookingParser` import and the `booking` panel. Keep `aiConfigured` for `AiPackingSuggestions`.
  - Load `db.trip.findUnique({ where: { id: tripId }, select: { name: true, startDate: true } })` and `const slug = await tripSlugFor(tripId)`.
  - Replace the `<h2>` with `<PageHeader eyebrow={tripEyebrow(trip?.name ?? "", trip?.startDate ?? null)} title="Checklists" meta={checklistsMeta(pretripItems, packingItems)} trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />} />`.
  - Tab count badges become `rounded-full border-2 border-border bg-card px-1.5 text-[11px] font-extrabold tabular-nums`.
  - `checklistsMeta`: `const todo = pre.filter((i) => !i.done).length; const packed = pack.filter((i) => i.done).length; parts = []; if (pre.length) parts.push(`${todo} to do`); if (pack.length) parts.push(`${packed} packed of ${pack.length}`); return parts.join(" · ") || undefined;`.
- Layout: narrow the type to two values. The grid is `grid gap-4 lg:grid-cols-2`. Delete the "Booking parser" clipping remarks from the doc comment of `CHECKLISTS_TAB_CLASS`, keeping the class itself.
- RemindersCard: `<Card radius="2xl" shadow={3} className="flex flex-col gap-3 p-4">`, heading `<h2 className="font-display text-lg font-extrabold">Reminders</h2>` (the page h1 is now above it), `<ul className="divide-y-2 divide-muted">`, and the stop pill `border-2 border-border bg-card text-[10px] font-extrabold`.
- `app-paths.ts`: add the checklists route to `PAGE_HEADER_ROUTES`, and a test case.

- [ ] **Step 4: Run to see them pass.** `npm test -- "app/(app)/trips/[tripId]/checklists" components/trip/reminders-card.test.tsx components/shell`

- [ ] **Step 5: Gates and commit.** Add the three source files to the scan's `FILES`.

```bash
npx tsc --noEmit && npm run lint
git add "app/(app)/trips/[tripId]/checklists" components/trip/reminders-card.tsx components/trip/reminders-card.test.tsx components/shell components/plan/banned-classes.test.ts
git commit -m "feat(checklists): PageHeader with to-do/packed counts, booking-parser tab removed (it lives in Plan), Reminders card restyled (AUDIT.md)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 21a: Settings — the chapters on/off switch

**Files:**
- Create: `components/trip/settings/chapters-switch.tsx`, `components/trip/settings/chapters-switch.test.tsx`
- Modify: `app/(app)/trips/[tripId]/settings/page.tsx` (the Chapters block, ~lines 167–178), `app/(app)/trips/[tripId]/settings/page.test.tsx`

**Interfaces:**
- Consumes: `setChaptersEnabled(tripId: string, enabled: boolean): Promise<SetChaptersEnabledResult>` (`server/actions/trips.ts:475`); `Switch` (`components/ui/switch.tsx` — read it and `components/trip/settings/share-links-panel.tsx` for the house idiom); `useToast`/`toast` as `itinerary-manager.tsx` uses it.
- Produces: `ChaptersSwitch({ tripId, enabled }: { tripId: string; enabled: boolean })` (client).

Why: chapters are a Trip-wide setting (CONTEXT.md "Chapter" — the chapters toggle). The switch used to live only in the Plan editor's Chapters menu; Task 16 removes that, so this is now the one place to turn chapters on or off.

- [ ] **Step 1: Write the failing tests**

`components/trip/settings/chapters-switch.test.tsx`: mock `@/server/actions/trips` → `setChaptersEnabled: vi.fn(async () => ({ success: true }))`. Assert:
- It renders a `role="switch"` named "Group this trip into chapters", `aria-checked` matching `enabled`.
- Clicking it calls `setChaptersEnabled("trip-1", true)` when `enabled={false}` (and `false` when `enabled`).
- While pending the switch is disabled; on `{ success: false }` a destructive toast "Couldn't update chapters. Try again." shows and `aria-checked` returns to the original value.
- The helper line reads "Name stretches of the trip, like “the Italy chapter”. Turning this off hides them; nothing is deleted."

`settings/page.test.tsx`: keep the two existing "hides / shows the Chapters card" tests (the card and the chapters query still follow `chaptersEnabled`), and add: "the chapters switch shows whether chapters are on or off" — render with `chaptersEnabled: false` and with `true`, and assert `getByRole("switch", { name: "Group this trip into chapters" })` exists in both, with `aria-checked` `"false"` / `"true"`.

- [ ] **Step 2: Run to see them fail.** `npm test -- components/trip/settings/chapters-switch.test.tsx "app/(app)/trips/[tripId]/settings"`

- [ ] **Step 3: Implement.** `ChaptersSwitch` keeps an optimistic `checked` state, calls `setChaptersEnabled`, rolls back and toasts on failure (same copy as `handleToggleChapters` in the manager), and relies on the action's `revalidatePath` to refresh the page. Layout: `flex items-start justify-between gap-4` with the label (`text-sm font-bold`) and the helper line (`text-[13px] text-muted-foreground`) on the left, the `Switch` on the right.

In the settings page replace the `{trip.chaptersEnabled && (<Card>…)}` block with an always-rendered Chapters `Card` whose `CardContent` holds `<ChaptersSwitch tripId={tripId} enabled={trip.chaptersEnabled} />` and, only when `trip.chaptersEnabled`, a `border-t-2 border-muted pt-4 mt-4` section with the existing `<ChaptersManager tripId={tripId} chapters={chapters} />`. Update the stale comment above it (drop "turn them back on from the plan editor's Chapters menu"). The chapters query stays gated on `chaptersEnabled`.

- [ ] **Step 4: Run to see them pass**, then `npx tsc --noEmit` and `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add components/trip/settings/chapters-switch.tsx components/trip/settings/chapters-switch.test.tsx "app/(app)/trips/[tripId]/settings/page.tsx" "app/(app)/trips/[tripId]/settings/page.test.tsx"
git commit -m "feat(settings): chapters on/off switch lives in trip settings

The Plan header's Chapters pill now only appears when chapters are on.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

### Task 22: Calendar and Wishlist — PageHeader and empty-state copy

**Files:**
- Modify: `app/(app)/trips/[tripId]/calendar/page.tsx`, `page.test.tsx`
- Modify: `components/trip/calendar-views.tsx` (export `CalendarViewSwitch`; the toolbar loses its `Segmented`), `components/trip/calendar-views.test.tsx`
- Modify: `app/(app)/trips/[tripId]/wishlist/page.tsx`. Create `app/(app)/trips/[tripId]/wishlist/page.test.tsx`.
- Create: `components/trip/wishlist-header-actions.tsx`, `components/trip/wishlist-header-actions.test.tsx`
- Modify: `components/trip/wishlist-board.tsx`, `components/trip/wishlist-board.test.tsx`
- Modify: `components/shell/app-paths.ts`, `app-paths.test.ts` (add calendar and wishlist)

**Interfaces:**
- Consumes: `PageHeader`, `TripHeaderTrailing`, `tripEyebrow`, `tripSlugFor`, `tripPath` (`lib/trip-path.ts`); `AddFromGlobeDialog`; `AddItemButton` (`components/trip/item-form-dialog.tsx`); `MarkerView`.
- Produces:
  - `CalendarViewSwitch()` (client). It is the existing sun `Segmented`, reading and committing the same module-level view store (`subscribeView`/`getViewSnapshot`/`commitView`), `aria-label="Calendar view"`.
  - `WishlistHeaderActions({ tripId, stops, tripStartDate, homeCurrency, hasGlobe, globeMarkers, addedMarkerIds, showAdd }: { tripId: string; stops: { id: string; name: string }[]; tripStartDate?: string | null; homeCurrency: string; hasGlobe: boolean; globeMarkers: MarkerView[]; addedMarkerIds: string[]; showAdd: boolean })`
  - `WishlistBoard` no longer renders a heading, the "Add from Globe" button or the header add. Its `Segmented` List/Map moves to a right-aligned toolbar row.

- [ ] **Step 1: Write the failing tests**

Calendar `page.test.tsx`:
- Mock `@/components/trip/trip-header-trailing` → null, and `@/lib/trip-slug-read` → `tripSlugFor: async () => "t1"`.
- Extend the `calendar-views` mock to also export `CalendarViewSwitch: () => <div data-testid="view-switch" />`.
- `tripFindUniqueMock` resolves `name: "Europe"` in every fixture.
- Update the two empty-state tests:

```tsx
it("a date-less trip: No dates yet, with Set dates → settings", async () => {
  tripFindUniqueMock.mockResolvedValue({ name: "Europe", startDate: null, endDate: null });
  await renderPage();
  expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "No dates yet" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Set dates" })).toHaveAttribute("href", "/trips/t1/settings");
  expect(screen.queryByTestId("view-switch")).toBeNull();
});
it("dated with no stops: No stops yet (sentence case), Add a stop → the Plan add-stop sheet", async () => {
  tripFindUniqueMock.mockResolvedValue({ name: "Europe", startDate: "2026-12-01", endDate: "2026-12-20" });
  await renderPage();
  expect(screen.getByRole("heading", { name: "No stops yet" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Add a stop" })).toHaveAttribute("href", "/trips/t1/plan?add=stop");
});
it("with stops, the Month/Agenda switch is the header action", async () => { /* existing dated fixture */ expect(screen.getByTestId("view-switch")).toBeInTheDocument(); });
```

`calendar-views.test.tsx`: move "the view switch is the kit Segmented (sun)" to render `<CalendarViewSwitch />`, and assert that switching commits to localStorage (`trip-planner-calendar-view`). The `CalendarViews` render no longer contains the `radiogroup`.

`wishlist-header-actions.test.tsx`:
- "Add from Globe" is an outline button that opens a dialog. It is absent without a Globe.
- "Add an idea" is an ink primary button, absent when `showAdd` is false.
- Mock `AddFromGlobeDialog` → `({ open }) => open ? <div role="dialog" aria-label="Add from Globe" /> : null`.

`wishlist-board.test.tsx`:
- Delete "heads the board with the kit's display title and an idea-count badge" and "renders 'Add from Globe' as a kit secondary Button". Their replacements live in the header-actions test and the new page test.
- Update "uses the kit's 'Add an idea' copy for the add action" to the in-board dashed tile and mobile block button.
- Keep the empty state.

`wishlist/page.test.tsx` (new): mock db as `trip.findUnique` returning a minimal trip (with `name`, `stops: []`, `items: []`, `forksEnabled: false`). Mock `@/lib/globe` → `getUserGlobe: async () => null`. Mock `@/lib/globe-suggestions`, the guards and `@/components/trip/wishlist-board` → marker. Then assert the h1 "Wishlist" and the eyebrow.

- [ ] **Step 2: Run to see them fail.** `npm test -- "app/(app)/trips/[tripId]/calendar" "app/(app)/trips/[tripId]/wishlist" components/trip/calendar-views.test.tsx components/trip/wishlist-board.test.tsx components/trip/wishlist-header-actions.test.tsx`

- [ ] **Step 3: Implement**

- Calendar page: add `name: true` to the trip select. Wrap all three returns in `<div className="flex flex-col gap-5"><PageHeader eyebrow={tripEyebrow(trip.name, trip.startDate)} title="Calendar" actions={hasCalendar ? <CalendarViewSwitch /> : undefined} trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />} />{body}</div>`.
  - No dates: `EmptyState tone="sun" title="No dates yet" description="Pick when you leave and we’ll lay your stops across the calendar." action={<Button asChild><Link href={tripPath(slug, "/settings")}><CalendarDays aria-hidden />Set dates</Link></Button>}`.
  - No stops: `EmptyState tone="teal" icon={MapPin} title="No stops yet" description="Add the first place you’re going and it lands on the calendar." action={<Button asChild><Link href={tripPath(slug, "/plan?add=stop")}><Plus aria-hidden />Add a stop</Link></Button>}`. `?add=stop` is the Plan's existing open-the-add-sheet param.
- `calendar-views.tsx`: export `CalendarViewSwitch` (the `Segmented` block moved verbatim) and remove it from the `CalendarViews` toolbar. Keep the month title (`h2`), the arrows and everything else. The external store is module-level, so the switch and the views stay in sync.
- Wishlist page: add `name: true` to the trip select and load the slug. Render `{activeFork && <VariantBanner …/>}<PageHeader eyebrow={tripEyebrow(trip.name, trip.startDate)} title="Wishlist" meta={items.length ? `${items.length} idea${items.length === 1 ? "" : "s"}` : undefined} actions={<WishlistHeaderActions … showAdd={items.length > 0} />} trailing={<TripHeaderTrailing tripId={trip.id} slug={slug} />} /><WishlistBoard …unchanged props… />`.
- `WishlistHeaderActions` (client): when `hasGlobe`, `<Button variant="outline" size="md" onClick={() => setOpen(true)}><Globe2 aria-hidden />Add from Globe</Button>` + `<AddFromGlobeDialog tripId={tripId} markers={globeMarkers} addedMarkerIds={addedMarkerIds} open={open} onOpenChange={setOpen} />`. Then, when `showAdd`, `<AddItemButton tripId={tripId} stops={stops} tripStartDate={tripStartDate ?? undefined} defaultUnscheduled homeCurrency={homeCurrency} label="Add an idea" variant="primary" size="md" />`.
- `WishlistBoard`: delete the header's title, badge, Globe button and header `AddItemButton`. Keep `<div className="flex justify-end"><Segmented …List/Map… /></div>`, the suggestions strip (and its overflow dialog), the empty state, the dashed tile and the mobile block add. Remove `openGlobeBrowser` if nothing else calls it.
- `app-paths.ts`: add the calendar and wishlist routes, with test cases.

- [ ] **Step 4: Run to see them pass.** Rerun the Step 2 command, plus `components/shell`.

- [ ] **Step 5: Gates and commit.** Add every touched source file to the scan's `FILES`.

```bash
npx tsc --noEmit && npm run lint
git add "app/(app)/trips/[tripId]/calendar" "app/(app)/trips/[tripId]/wishlist" components/trip/calendar-views.tsx components/trip/calendar-views.test.tsx components/trip/wishlist-board.tsx components/trip/wishlist-board.test.tsx components/trip/wishlist-header-actions.tsx components/trip/wishlist-header-actions.test.tsx components/shell components/plan/banned-classes.test.ts
git commit -m "feat(calendar,wishlist): PageHeader with Month/Agenda switch and Add from Globe / Add an idea; sentence-case empty states with Add a stop / Set dates (AUDIT.md)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 23: Motion — Plan P1–P13

Use the tokens and utilities in `app/globals.css`, and `motion/react` under the app's existing `<MotionConfig reducedMotion="user">` (`components/ui/motion-provider.tsx`, mounted in `app/layout.tsx`). **Reduced motion:** every CSS utility below already collapses through the global reduced-motion rule. New staggered delays must also go to 0 (see the CSS below), and JS scrolling uses `behavior: "auto"`. Animate only `transform`/`opacity`, except the height transitions called out here, which go through `motion`.

**Files:**
- Modify: `app/globals.css` (add `tp-slot-flash`, `tp-stagger`, and a reduced-motion zero for `--tp-delay`)
- Modify: `components/plan/stop-row.tsx`, `day-strip.tsx`, `selected-day.tsx`, `stop-open-body.tsx`, `ideas-box.tsx`, `fit-tile.tsx`, `leg-pill.tsx`, `mobile/stop-sheet.tsx`, `mobile/pick-day-sheet.tsx`, `mobile/add-stop-sheet.tsx`, `stop-actions-sheet.tsx`, `plan-mini-map.tsx`
- Modify: `components/trip/itinerary-manager.tsx` (DragOverlay, new-stop highlight), `components/trip/transport-form-dialog.tsx` (P13)
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx` (P1 wrappers)
- Create: `components/plan/use-drag-dismiss.ts`, `components/plan/use-drag-dismiss.test.ts`
- Create: `components/plan/motion.test.tsx` (the phase's motion assertions)

**Interfaces:**
- Produces:
  - `useDragDismiss({ onDismiss, threshold = 0.3, flickVelocity = 0.5 }): { handleProps: React.HTMLAttributes<HTMLElement>; style: React.CSSProperties }`. `handleProps` go on the sheet's handle. `style` is a `translateY` while dragging.
  - `shouldDismiss(dy: number, height: number, velocityPxPerMs: number, threshold?: number, flick?: number): boolean` (pure, exported for the test)

- [ ] **Step 1: Write the failing tests**

`use-drag-dismiss.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldDismiss } from "./use-drag-dismiss";
describe("shouldDismiss (MOTION.md P12)", () => {
  it("over 30% of the height or a fast flick closes; an upward drag never does", () => {
    expect(shouldDismiss(310, 1000, 0.1)).toBe(true);
    expect(shouldDismiss(200, 1000, 0.1)).toBe(false);
    expect(shouldDismiss(80, 1000, 0.8)).toBe(true);
    expect(shouldDismiss(-300, 1000, 2)).toBe(false);
  });
});
```

`components/plan/motion.test.tsx` (render with the same fixtures as each component's own test, importing them from there, or repeat minimal fixtures):
- P1: page wrappers. `PlanRiseIn` (see Step 3) with `index={2}` sets `style="--tp-delay: 80ms"` and has class `tp-rise-in tp-stagger`. With `index={9}` there's no class (capped at 8).
- P2: `StopRow` open: the body wrapper is a `motion.div` (`data-motion="fold"`) inside `AnimatePresence`. The chevron has `rotate-180`. The toggle has `transition-colors`.
- P3: a `DayStrip` slot has `transition-[transform,box-shadow,background-color]` and `ease-bounce`. The `SelectedDay` wrapper in `StopOpenBody` is keyed by date: re-render with a new selection and check the `data-day` attribute on the `motion.div` changes.
- P5: after a day-title save, the title `<span>` has `tp-pop` (mock `setDayTitle` resolving success). A slot's band has `origin-left transition-transform` and `scale-x-100` when titled, `scale-x-0` when not.
- P6: a slot with `data-over` gets `data-[over]:scale-[1.06] data-[over]:bg-coral/40`. A slot with `flashDate` has `tp-slot-flash`.
- P10: `FitTile` has `transition-colors duration-[var(--dur-slow)]`. Re-rendering from `ok` to `over` adds `tp-wiggle` to the tile.
- P12: `StopActionsSheet`, `PickDaySheet` and `AddStopSheet` overlays carry `bg-foreground/45`.
- P13: selecting a tile gives it `tp-pop` (key bump).

Run: `npm test -- components/plan/use-drag-dismiss.test.ts components/plan/motion.test.tsx`. Expected: FAIL.

- [ ] **Step 2: CSS** — append to the utilities section of `app/globals.css`, next to `tp-rise-in`:

```css
/* Plan motion (MOTION.md P1, P6). A stagger rides on --tp-delay so reduced
   motion can zero it: the global rule shortens durations, not delays. */
@utility tp-stagger { animation-delay: var(--tp-delay, 0ms); }
@keyframes tp-slot-flash { 0%, 100% { background-color: hsl(var(--card)); } 50% { background-color: hsl(var(--coral)); } }
@utility tp-slot-flash { animation: tp-slot-flash 400ms var(--ease-pop); }
@media (prefers-reduced-motion: reduce) {
  .tp-stagger { animation-delay: 0s !important; }
}
```

- [ ] **Step 3: Implement each row**

- **P1 (page enters):** `components/plan/plan-rise-in.tsx` exports `PlanRiseIn({ index, children, className })`. When `index < 8` it renders a `div` with `tp-rise-in tp-stagger` and `style={{ "--tp-delay": `${index * 40}ms` }}`; otherwise a plain `div`. The page wraps the PageHeader at index 0 and the rail tiles with explicit delays of 60/120/180 ms, passed as `style` via a `delayMs` prop. The manager wraps each desktop and mobile stop at `index = globalIdx`. Add the test file to the scan list.
- **P2 (fold):** in `StopRow`, replace `{open && <div id={bodyId}>…}` with `<AnimatePresence initial={false}>{open && <motion.div key="body" id={bodyId} data-motion="fold" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1, transition: { height: { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }, opacity: { delay: 0.06, duration: 0.18 } } }} exit={{ height: 0, opacity: 0, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }} className="overflow-hidden">{children}</motion.div>}</AnimatePresence>`. The chevron and toggle transitions are already there from Task 7. Rows below move with the animated height, and no `layout` is needed on the sortable wrapper (dnd-kit owns its transform).
- **P3 (select a day):**
  - Slot classes gain `transition-[transform,box-shadow,background-color] duration-[var(--dur-base)] ease-bounce`.
  - In `StopOpenBody`, track the previous selection in a ref. Set `dir = selected > prev ? 1 : -1` and wrap `SelectedDay` in `<motion.div layout transition={{ layout: { duration: 0.18 } }}><AnimatePresence mode="wait" initial={false} custom={dir}><motion.div key={selected} data-day={selected} custom={dir} variants={{ enter: (d: number) => ({ opacity: 0, x: 6 * d }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: -6 * d }) }} initial="enter" animate="center" exit="exit" transition={{ duration: 0.18 }}>…</motion.div></AnimatePresence></motion.div>`.
- **P4 (strip overflow):** already smooth-scrolls and fades its arrows (Task 10). Confirm the arrows carry `transition-opacity duration-[var(--dur-fast)]`.
- **P5 (day title edit):**
  - `SelectedDay` keeps a `popKey` that bumps after a successful save. Detect it by comparing `dayTitle` with the previous prop in a ref: when it changes while `!ed.editing`, bump. The title span gets `key={popKey}` and `className="tp-pop"` once `popKey > 0`.
  - The `DayStrip` band becomes `<span data-band className={cn("h-1.5 w-full origin-left border-border transition-transform duration-[var(--dur-base)]", s.title ? "scale-x-100 border-b-[1.5px] bg-sun" : "scale-x-0")} />`.
- **P6 (drag a plan):**
  - Slots add `data-[over]:scale-[1.06] data-[over]:bg-coral/40 transition-transform duration-[var(--dur-fast)]` and `data-[flash]:tp-slot-flash`.
  - In the manager, track `activeDrag` from `onDragStart` (add the handler: `setActiveDrag(event.active.data.current)`, cleared on end or cancel). Render `<DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }}>{activeDrag?.type === "item" ? <div className="rotate-[-1deg] rounded-xl border-2 border-border bg-card px-3.5 py-2 text-sm font-bold shadow-hard-4">{activeDrag.title}</div> : null}</DragOverlay>` inside the desktop `DndContext`.
  - The dragged row (`isDragging` from `useDraggable`) renders as a `border-2 border-dashed border-border bg-background` placeholder at the same height (`opacity-60`).
  - The new dot on the target slot: in `DayStrip`, when `flashDate === s.dateISO`, the last dot gets `tp-pop`.
  - The toast is already shown in Task 13.
- **P7 (schedule an idea):**
  - `IdeasBox` wraps the chips in `<AnimatePresence initial={false}>`, each chip in `<motion.span key={idea.id} exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}>`.
  - The count uses `<AnimatedNumber value={n} format={(v) => `${Math.round(v)} IDEAS`} />` (`components/ui/animated-number.tsx`).
  - After `handleScheduleThing` succeeds, the manager sets `flash` to that stop and date, exactly as in P6.
  - The new row in `SelectedDay`, when the date is the one selected: rows whose id wasn't in the previous render's ids (a ref) get `tp-rise-in`.
- **P8 (leg pill add hover):** the optional part. Only the label nudge: the missing pill's "Add" span gets `transition-transform duration-[var(--dur-fast)] group-hover:translate-x-0.5`, with `group` on the button. Skip the dash animation.
- **P9 (jump list):** already scroll → settle → open → ring (Task 6). Nothing more.
- **P10 (Fit state change):**
  - `FitTile` renders the big number through `<AnimatedNumber value={m.big} format={(v) => String(Math.round(v))} durationSec={0.32} />`. The tile already has `transition-colors duration-[var(--dur-slow)]`.
  - Track the previous `hardEndState` in a ref. When it becomes `"over"` from anything else, set `wiggle` true and put `tp-wiggle` on the tile, clearing it `onAnimationEnd`.
- **P11 (add a stop):**
  - The sheet closes through its own CSS (`tp-slide-down` / `tp-pop-out`, already in `DialogContent`).
  - In the manager, when `initialStops` resyncs (the existing getDerivedStateFromProps block), compare the ids with the previous set held in a ref. Put any new id in `newStopIds` state. The desktop and mobile row wrappers for those ids get `tp-rise-in`. After render, `ringId(`stop-${id}`)` (or `m-stop-…`) runs once in an effect, deferred with the microtask idiom.
  - Mini-map pin `tp-pop`: `RouteMap` builds its markers once and only rebuilds on coordinate changes (see its "still rebuilds when a stop's coordinates actually change" test). In that rebuild, give the `divIcon` of a stop id not seen in the previous build `className: "tp-pop"`. Track the ids in a ref, and add a test in `route-map.test.tsx`: after rerendering with a third stop, that marker's icon options carry `className: "tp-pop"`.
- **P12 (mobile sheets):**
  - Stop sheet: `data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down` (from Task 18).
  - While the stop sheet is open, the manager sets `data-sheet-open` on the mobile list wrapper, which has `transition-transform duration-[var(--dur-slow)] data-[sheet-open]:scale-[0.97]`.
  - Every bottom sheet passes `overlayClassName="bg-foreground/45 backdrop-blur-none"`. `AddStopSheet` is a `Dialog`, whose overlay is `bg-[hsl(30_4%_11%/0.35)]`: pass the overlay a `className` override if `DialogContent` accepts one; otherwise leave it and note that in the commit.
  - Drag to dismiss: `useDragDismiss` goes on each bottom sheet's handle. `SheetContent` renders its own handle, so pass `hideClose` and render an explicit handle `<div {...handleProps} className="mx-auto mt-3.5 h-[5px] w-11 cursor-grab touch-none rounded-full bg-border" />`, with `style` applied to the content through a wrapper. If `SheetContent` can't take that without changing `components/ui/sheet.tsx`, apply the hook only to `StopActionsSheet` and `PickDaySheet`, where you control the markup.
  - The stop sheet's `Segmented`: if Phase 1 built a shared `layoutId` pill for Money (grep `layoutId` in `components/money`), reuse it. Otherwise leave the `Segmented` as it is.
  - `useDragDismiss`: pointer down records `y0` and `t0`; move sets `dy = max(0, y - y0)`; up calls `onDismiss()` when `shouldDismiss(dy, contentHeight, dy / (now - t0))`, else resets `dy` to 0 with a 180 ms transition. `shouldDismiss = (dy, h, v, threshold = 0.3, flick = 0.5) => dy > 0 && (dy > h * threshold || v > flick)`.
- **P13 (mode tile):** each tile's content gets `key={`${m.value}-${selectedAt}`}` and `className={cn(selected && "tp-pop")}`, where `selectedAt` bumps on each select. When Car hides the time fields, wrap that block in `<AnimatePresence initial={false}>{showTimes && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">…</motion.div>}</AnimatePresence>`, and fade in the drive-estimate line with `tp-rise-in`.

- [ ] **Step 4: Run to see it pass.** `npm test -- components/plan components/trip/itinerary-manager.test.tsx components/trip/transport-form-dialog.test.tsx components/trip/route-map.test.tsx "app/(app)/trips/[tripId]/plan"`. Existing tests must still pass: the `AnimatePresence` wrappers keep the same DOM once the animation settles, and jsdom doesn't animate.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm run lint
git add app/globals.css components "app/(app)/trips/[tripId]/plan/page.tsx"
git commit -m "feat(plan): motion — staggered entrance, fold height, day cross-slide, title pop, drag lift and slot flash, idea exit, Fit cross-fade and wiggle, new-stop ring, sheet slides and drag-to-dismiss, mode tile pop (MOTION.md P1–P13)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8"
```

---

### Task 24: Phase gate

**Files:** none new. Fix whatever the gate turns up, in the files where it's found.

- [ ] **Step 1: The ban scan covers everything touched.** Run `git diff --name-only phase-2-new-trip..HEAD -- '*.ts' '*.tsx' | grep -v '\.test\.'`. Every file listed must sit under `components/plan/` or `lib/plan/`, or be in `FILES` in `components/plan/banned-classes.test.ts`. Add any that aren't. If the `phase-2-new-trip` tag doesn't exist, diff from the commit before this phase's Task 1 instead: `git log --oneline` and find "feat(plan): legLabel".

- [ ] **Step 2: Dead code.** `grep -rn "PLAN_ASIDE_ACTIONS_ID\|PlanOverview\|PlanStopsNav\|HomeBaseCard\|StopDayList\|QuickAddStops\|StopsManager\|CHECKLISTS_TITLE_CLASS\|scrollIntoView" app components lib --include=*.ts --include=*.tsx`. No hits in Plan code: `scrollIntoView` may remain elsewhere in the app, but not in `components/plan` or `components/trip/itinerary-manager.tsx`.

- [ ] **Step 3: Full suite.** Run `npm test`. Expected: all green.

- [ ] **Step 4: Types and lint.** Run `npx tsc --noEmit` and `npm run lint`. Expected: clean.

- [ ] **Step 5: Build.** Run `npx next build`. Expected: success. If a route fails with a Server/Client boundary error (for example a function prop passed from `page.tsx` into a client component), fix it by moving the closure into the client component.

- [ ] **Step 6: Commit any fixes, then tag**

```bash
git add -A
git commit -m "chore(plan): phase 3 gate fixes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gg6xb4nJAsiAx7oToWgpT8" || true
git tag phase-3-plan
```

Do not push the tag.
