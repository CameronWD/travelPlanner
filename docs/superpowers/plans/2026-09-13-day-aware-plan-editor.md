# Day-Aware Plan Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The plan page shows each scheduled Stop's days as condensed, expandable rows with full item editing (add / edit / move-day / unschedule), keeps the dateless things-to-do pool as a distinct labelled section with a "pick a day" scheduler, and condenses accommodation to a one-line expandable row.

**Architecture:** A new pure helper (`lib/stop-days.ts`) buckets a stop's scheduled Items into per-day groups. A new client component (`components/trip/stop-day-list.tsx`) renders those days inside `StopCard`, reusing the existing `ItemFormDialog`, `UnscheduleItemButton`, and server actions (`scheduleItem`, `rescheduleItem`). A new `AccommodationRow` wraps the existing `AccommodationCard` behind a collapsed one-liner. The plan page (`app/(app)/trips/[tripId]/plan/page.tsx`) adds one query for scheduled items and threads a `dayItemsByStopId` map down through `ItineraryManager` → `StopCard`.

**Tech Stack:** Next.js App Router (server components + server actions), React 19 client components, Prisma, Tailwind, dnd-kit (untouched), Vitest + @testing-library/react + userEvent.

## Global Constraints

- Never call a thing-to-do an "Activity" in UI or code — "Activity" is the change-log feed (CONTEXT.md **Item**).
- Dateless things-to-do (ADR 0022) survive: stop-level "Add Thing to Do" still creates `date: null` items; the pool renders on every stop (rough and scheduled).
- Day rows show **Items only** — no accommodation or transport duplication (grilling 2026-09-13, Q1: b).
- Day rows are collapsed by default; expansion state is ephemeral component state (no persistence).
- Empty days still render, muted, with their own "+ Add" (Q3: a).
- Collapsed row format: `Sun 6 Dec` + inline truncated item titles with category dots + `+N` overflow (Q3: b).
- Moving/scheduling uses a "pick a day" menu — NO item-level drag-and-drop in this pass (Q2b: a).
- Transport cards between stops are untouched (Q5 rider).
- All copy uses existing domain language: "Things to do", "Nothing planned", "Unschedule".
- All new client components start with `"use client"`.
- Tests: Vitest + @testing-library/react; mock server actions with `vi.mock` exactly as `components/trip/stop-card.test.tsx` does.
- Commit after every task. Never commit to main — work stays on the current working branch (`chore/feedback-check-2026-09-13`).

---

### Task 1: Pure helpers — `buildStopDays` + `formatDayLabel`

**Files:**
- Create: `lib/stop-days.ts`
- Create: `lib/stop-days.test.ts`
- Modify: `lib/dates.ts` (add `formatDayLabel` next to `formatLongDate`, ~line 116)
- Modify: `lib/dates.test.ts` (append)

**Interfaces:**
- Consumes: `enumerateTripDays(startDate, endDate): string[]` from `@/lib/itinerary`; `parseISODate`, `DAY_SHORT`/`MONTH_SHORT` idiom from `lib/dates.ts`.
- Produces:
  - `formatDayLabel(s: string): string` — `"Sun 6 Dec"` (no year), exported from `@/lib/dates`.
  - From `@/lib/stop-days`:
    ```ts
    export interface StopDayItem {
      id: string; title: string; category: string;
      date?: string | null; startTime?: string | null; endTime?: string | null;
      address?: string | null; link?: string | null; booking?: string | null;
      notes?: string | null; stopId?: string | null;
    }
    export interface StopDay {
      dateISO: string;
      timed: StopDayItem[];   // startTime set, sorted ascending by startTime
      untimed: StopDayItem[]; // no startTime, input order preserved
    }
    export function buildStopDays(arriveDate: string, departDate: string, items: StopDayItem[]): StopDay[]
    ```

- [ ] **Step 1: Write the failing tests**

`lib/stop-days.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildStopDays, type StopDayItem } from "./stop-days";

const item = (over: Partial<StopDayItem>): StopDayItem => ({
  id: "i1", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-06",
  startTime: null, endTime: null, stopId: "s1", ...over,
});

describe("buildStopDays", () => {
  it("returns one StopDay per calendar day, arrive to depart inclusive", () => {
    const days = buildStopDays("2026-12-05", "2026-12-08", []);
    expect(days.map((d) => d.dateISO)).toEqual([
      "2026-12-05", "2026-12-06", "2026-12-07", "2026-12-08",
    ]);
    expect(days.every((d) => d.timed.length === 0 && d.untimed.length === 0)).toBe(true);
  });

  it("buckets items onto their date, splitting timed (sorted) from untimed", () => {
    const days = buildStopDays("2026-12-05", "2026-12-07", [
      item({ id: "a", title: "Seine cruise", date: "2026-12-06", startTime: "14:00" }),
      item({ id: "b", title: "Louvre", date: "2026-12-06", startTime: "09:30" }),
      item({ id: "c", title: "Wander Marais", date: "2026-12-06", startTime: null }),
    ]);
    const dec6 = days.find((d) => d.dateISO === "2026-12-06")!;
    expect(dec6.timed.map((i) => i.id)).toEqual(["b", "a"]);
    expect(dec6.untimed.map((i) => i.id)).toEqual(["c"]);
  });

  it("excludes items dated outside the stay (ADR 0038 un-slots those; defensive here)", () => {
    const days = buildStopDays("2026-12-05", "2026-12-07", [
      item({ id: "out", date: "2026-12-20" }),
      item({ id: "undated", date: null }),
    ]);
    expect(days.flatMap((d) => [...d.timed, ...d.untimed])).toEqual([]);
  });

  it("handles a same-day visit (arrive === depart) as a single day", () => {
    const days = buildStopDays("2026-12-05", "2026-12-05", [item({ id: "a", date: "2026-12-05" })]);
    expect(days).toHaveLength(1);
    expect(days[0].untimed.map((i) => i.id)).toEqual(["a"]);
  });
});
```

Append to `lib/dates.test.ts`:

```ts
describe("formatDayLabel", () => {
  it("formats YYYY-MM-DD as 'Sun 6 Dec' with no year", () => {
    expect(formatDayLabel("2026-12-06")).toBe("Sun 6 Dec");
    expect(formatDayLabel("2026-07-03")).toBe("Fri 3 Jul");
  });
});
```

(Add `formatDayLabel` to the existing import from `./dates` at the top of the file; use the file's existing `describe`/`it` import style.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/stop-days.test.ts lib/dates.test.ts`
Expected: FAIL — `stop-days` module not found; `formatDayLabel` not exported.

- [ ] **Step 3: Implement**

In `lib/dates.ts`, directly below `formatLongDate` (~line 125):

```ts
/**
 * Format a YYYY-MM-DD string to a short in-trip day label like "Fri 3 Jul".
 * No year — used inside a Stop's day rows where the year is already evident.
 */
export function formatDayLabel(s: string): string {
  const d = parseISODate(s);
  return `${DAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
}
```

Create `lib/stop-days.ts`:

```ts
/**
 * Per-stop day bucketing for the plan editor — PURE, framework-free.
 *
 * Groups a scheduled Stop's scheduled Items (date != null) into one bucket per
 * calendar day of the stay, arrive → depart inclusive. Items dated outside the
 * stay are excluded: ADR 0038 un-slots those back to things-to-do, so any that
 * appear here are transient and must not invent extra day rows.
 */

import { enumerateTripDays } from "@/lib/itinerary";

export interface StopDayItem {
  id: string;
  title: string;
  category: string;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  address?: string | null;
  link?: string | null;
  booking?: string | null;
  notes?: string | null;
  stopId?: string | null;
}

export interface StopDay {
  /** YYYY-MM-DD */
  dateISO: string;
  /** Items with a startTime, sorted ascending by startTime. */
  timed: StopDayItem[];
  /** Items without a startTime, input order preserved. */
  untimed: StopDayItem[];
}

export function buildStopDays(
  arriveDate: string,
  departDate: string,
  items: StopDayItem[],
): StopDay[] {
  const byDate = new Map<string, StopDayItem[]>();
  for (const it of items) {
    if (!it.date) continue;
    const existing = byDate.get(it.date) ?? [];
    existing.push(it);
    byDate.set(it.date, existing);
  }
  return enumerateTripDays(arriveDate, departDate).map((dateISO) => {
    const dayItems = byDate.get(dateISO) ?? [];
    return {
      dateISO,
      timed: dayItems
        .filter((i) => Boolean(i.startTime))
        .sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1)),
      untimed: dayItems.filter((i) => !i.startTime),
    };
  });
}
```

`DAY_SHORT`/`MONTH_SHORT` are module-level consts in `lib/dates.ts` already — no export change needed since `formatDayLabel` lives in the same file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/stop-days.test.ts lib/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stop-days.ts lib/stop-days.test.ts lib/dates.ts lib/dates.test.ts
git commit -m "feat(plan): add buildStopDays bucketing and formatDayLabel helpers"
```

---

### Task 2: `ItemFormDialog` gains a `defaultDate` prop

**Files:**
- Modify: `components/trip/item-form-dialog.tsx` (props ~line 60, dialog wrapper ~line 140, `ItemFormProps` ~line 263, date state init ~line 308)
- Modify: `components/trip/item-form-dialog.test.tsx` (append)

**Interfaces:**
- Produces: `ItemFormDialogProps.defaultDate?: string` — pre-fills the Date field on create (ignored in edit mode). Callers pass `defaultUnscheduled={false}` alongside it to open in scheduled mode.

- [ ] **Step 1: Write the failing test**

Append to `components/trip/item-form-dialog.test.tsx` (reuse the file's existing mocks and render helpers — read the top of the file first and match its idiom for rendering the dialog open):

```tsx
it("pre-fills the date field from defaultDate on create", () => {
  render(
    <ItemFormDialog
      tripId="t1"
      stops={[{ id: "s1", name: "Paris" }]}
      defaultUnscheduled={false}
      defaultDate="2026-12-06"
      open={true}
      onOpenChange={() => {}}
    />,
  );
  expect(screen.getByLabelText(/date/i)).toHaveValue("2026-12-06");
});

it("ignores defaultDate in edit mode — the item's own date wins", () => {
  render(
    <ItemFormDialog
      tripId="t1"
      stops={[{ id: "s1", name: "Paris" }]}
      item={{
        id: "i1", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-07",
        startTime: null, endTime: null, address: null, link: null,
        booking: null, notes: null, stopId: "s1",
      }}
      defaultDate="2026-12-06"
      open={true}
      onOpenChange={() => {}}
    />,
  );
  expect(screen.getByLabelText(/date/i)).toHaveValue("2026-12-07");
});
```

If `getByLabelText(/date/i)` matches multiple inputs (the paid-date field is also a date), tighten to the field's exact label as rendered — check how the existing tests in this file target the Date field and copy that selector.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/trip/item-form-dialog.test.tsx`
Expected: the two new tests FAIL (unknown prop has no effect / TS error on `defaultDate`).

- [ ] **Step 3: Implement**

1. `ItemFormDialogProps` (~line 89, next to `defaultStopId`):

```ts
  /**
   * Pre-fill the Date field on create (for "+ Add" on a specific day row).
   * Ignored in edit mode where the item's own date wins.
   */
  defaultDate?: string;
```

2. `ItemFormDialog` function: accept `defaultDate` in the destructure and pass it through like `defaultStopId` is passed (line 173):

```tsx
        defaultDate={item ? undefined : defaultDate}
```

3. `ItemFormProps` (~line 276): add `defaultDate?: string;`

4. `ItemForm` destructure: add `defaultDate,` — and change the date state init (line 308-310) to:

```ts
  const [date, setDate] = React.useState(
    item?.date ?? defaultDate ?? (defaultUnscheduled ? "" : (tripStartDate ?? "")),
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/trip/item-form-dialog.test.tsx`
Expected: PASS (all — old tests must stay green).

- [ ] **Step 5: Commit**

```bash
git add components/trip/item-form-dialog.tsx components/trip/item-form-dialog.test.tsx
git commit -m "feat(items): ItemFormDialog accepts defaultDate for day-row adds"
```

---

### Task 3: `DayPickerMenu` — "pick a day" dropdown

**Files:**
- Create: `components/trip/day-picker-menu.tsx`
- Create: `components/trip/day-picker-menu.test.tsx`

**Interfaces:**
- Consumes: `formatDayLabel` from `@/lib/dates` (Task 1); `DropdownMenu` primitives from `@/components/ui/dropdown-menu`; `Button` from `@/components/ui/button`.
- Produces:
  ```ts
  export interface DayPickerMenuProps {
    /** YYYY-MM-DD days of the stop's stay, in order. */
    days: string[];
    /** Accessible label for the trigger button, e.g. `Pick a day for Louvre`. */
    label: string;
    /** Called with the chosen YYYY-MM-DD. */
    onPick: (dateISO: string) => void;
    /** The item's current date — rendered disabled so you can't "move" in place. */
    currentDate?: string | null;
    disabled?: boolean;
  }
  export function DayPickerMenu(props: DayPickerMenuProps): React.JSX.Element | null
  ```
  Pure UI — no server calls; callers wire `scheduleItem` / `rescheduleItem`.

- [ ] **Step 1: Write the failing test**

`components/trip/day-picker-menu.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { DayPickerMenu } from "./day-picker-menu";

const days = ["2026-12-05", "2026-12-06", "2026-12-07"];

it("lists each day of the stay and reports the picked day", async () => {
  const user = userEvent.setup();
  const onPick = vi.fn();
  render(<DayPickerMenu days={days} label="Pick a day for Louvre" onPick={onPick} />);
  await user.click(screen.getByRole("button", { name: "Pick a day for Louvre" }));
  await user.click(await screen.findByRole("menuitem", { name: "Sun 6 Dec" }));
  expect(onPick).toHaveBeenCalledWith("2026-12-06");
});

it("disables the item's current day", async () => {
  const user = userEvent.setup();
  render(
    <DayPickerMenu days={days} label="Move Louvre" onPick={() => {}} currentDate="2026-12-06" />,
  );
  await user.click(screen.getByRole("button", { name: "Move Louvre" }));
  const current = await screen.findByRole("menuitem", { name: "Sun 6 Dec" });
  expect(current).toHaveAttribute("aria-disabled", "true");
});

it("renders nothing when there are no days", () => {
  const { container } = render(<DayPickerMenu days={[]} label="x" onPick={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/trip/day-picker-menu.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`components/trip/day-picker-menu.tsx`:

```tsx
"use client";

import * as React from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDayLabel } from "@/lib/dates";

export interface DayPickerMenuProps {
  days: string[];
  label: string;
  onPick: (dateISO: string) => void;
  currentDate?: string | null;
  disabled?: boolean;
}

/**
 * "Pick a day" dropdown for scheduling a thing-to-do onto (or moving a
 * scheduled Item between) a Stop's days. Pure UI — the caller performs the
 * server action (grilling 2026-09-13, Q2b: menu, no drag).
 */
export function DayPickerMenu({
  days,
  label,
  onPick,
  currentDate,
  disabled = false,
}: DayPickerMenuProps) {
  if (days.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          disabled={disabled}
          aria-label={label}
          title={label}
        >
          <CalendarClock className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {days.map((d) => (
          <DropdownMenuItem
            key={d}
            disabled={d === currentDate}
            onSelect={() => onPick(d)}
          >
            {formatDayLabel(d)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/trip/day-picker-menu.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/trip/day-picker-menu.tsx components/trip/day-picker-menu.test.tsx
git commit -m "feat(plan): DayPickerMenu dropdown for pick-a-day scheduling"
```

---

### Task 4: `StopDayList` — the condensed, expandable day rows

**Files:**
- Create: `components/trip/stop-day-list.tsx`
- Create: `components/trip/stop-day-list.test.tsx`

**Interfaces:**
- Consumes: `buildStopDays`, `StopDayItem` (`@/lib/stop-days`, Task 1); `formatDayLabel` (`@/lib/dates`, Task 1); `DayPickerMenu` (Task 3); `ItemFormDialog` with `defaultDate` (Task 2); `UnscheduleItemButton` (`@/components/trip/unschedule-item-button`, existing); `rescheduleItem` from `@/server/actions/items` (existing — moves an item to a date, keeps its times); `categoryDotClass` (`@/components/trip/category-dot`); `StopOption` (`@/components/trip/item-form-dialog`); `ItemCardItem` (`@/components/trip/item-card`); `CostRow` (`@/server/actions/costs`); `AttachmentView` (`@/components/trip/attachment-list`); `toast` from `@/components/ui/use-toast`; `useRouter` from `next/navigation`.
- Produces:
  ```ts
  export interface StopDayListProps {
    tripId: string;
    stop: { id: string; arriveDate: string; departDate: string };
    /** Scheduled items for this stop (stopId = stop.id, date != null). */
    items: StopDayItem[];
    stops: StopOption[];
    forkId?: string | null;
    homeCurrency?: string;
    itemCostsById?: Map<string, CostRow[]>;
    itemAttachmentsById?: Map<string, AttachmentView[]>;
    isPending?: boolean;
  }
  export function StopDayList(props: StopDayListProps): React.JSX.Element
  ```

- [ ] **Step 1: Write the failing tests**

`components/trip/stop-day-list.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { it, expect, vi, describe } from "vitest";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock("@/server/actions/items", () => ({
  createItem: vi.fn().mockResolvedValue({ success: true }),
  updateItem: vi.fn().mockResolvedValue({ success: true }),
  scheduleItem: vi.fn().mockResolvedValue({ success: true }),
  unscheduleItem: vi.fn().mockResolvedValue({ success: true, mode: "unslotted", sourceItemId: null }),
  rescheduleItem: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));
import { rescheduleItem } from "@/server/actions/items";

import { StopDayList } from "./stop-day-list";
import type { StopDayItem } from "@/lib/stop-days";

const stop = { id: "s1", arriveDate: "2026-12-05", departDate: "2026-12-07" };
const items: StopDayItem[] = [
  { id: "a", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-06", startTime: "09:30", stopId: "s1" },
  { id: "b", title: "Seine cruise", category: "ACTIVITY", date: "2026-12-06", startTime: "14:00", stopId: "s1" },
  { id: "c", title: "Wander Marais", category: "SIGHTSEEING", date: "2026-12-06", startTime: null, stopId: "s1" },
];

const baseProps = {
  tripId: "t1",
  stop,
  items,
  stops: [{ id: "s1", name: "Paris" }],
};

describe("collapsed day rows", () => {
  it("renders one row per day of the stay with an inline item preview", () => {
    render(<StopDayList {...baseProps} />);
    expect(screen.getByRole("button", { name: /Sat 5 Dec/ })).toBeInTheDocument();
    const dec6 = screen.getByRole("button", { name: /Sun 6 Dec/ });
    expect(dec6).toHaveTextContent("Louvre");
    expect(dec6).toHaveTextContent("Seine cruise");
    expect(dec6).toHaveTextContent("+1");
    expect(screen.getByRole("button", { name: /Mon 7 Dec/ })).toBeInTheDocument();
  });

  it("marks empty days as 'Nothing planned' and keeps them collapsed by default", () => {
    render(<StopDayList {...baseProps} />);
    const dec5 = screen.getByRole("button", { name: /Sat 5 Dec/ });
    expect(dec5).toHaveTextContent(/nothing planned/i);
    expect(dec5).toHaveAttribute("aria-expanded", "false");
  });
});

describe("expanded day", () => {
  it("expands to timed rows in time order plus an Anytime group and an open-day link", async () => {
    const user = userEvent.setup();
    render(<StopDayList {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /Sun 6 Dec/ }));
    const region = screen.getByTestId("day-detail-2026-12-06");
    const times = within(region).getAllByText(/^\d{2}:\d{2}$/).map((el) => el.textContent);
    expect(times).toEqual(["09:30", "14:00"]);
    expect(within(region).getByText("Anytime")).toBeInTheDocument();
    expect(within(region).getByText("Wander Marais")).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: /open day/i })).toHaveAttribute(
      "href",
      "/trips/t1/day/2026-12-06",
    );
  });

  it("offers + Add on an expanded empty day, opening the item dialog with that date", async () => {
    const user = userEvent.setup();
    render(<StopDayList {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /Sat 5 Dec/ }));
    const region = screen.getByTestId("day-detail-2026-12-05");
    await user.click(within(region).getByRole("button", { name: /add to this day/i }));
    expect(await screen.findByLabelText(/^date$/i)).toHaveValue("2026-12-05");
  });

  it("moves an item to another day via the pick-a-day menu", async () => {
    const user = userEvent.setup();
    render(<StopDayList {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /Sun 6 Dec/ }));
    const region = screen.getByTestId("day-detail-2026-12-06");
    await user.click(within(region).getByRole("button", { name: "Move Louvre to another day" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mon 7 Dec" }));
    expect(rescheduleItem).toHaveBeenCalledWith("a", "2026-12-07");
  });

  it("offers Unschedule on each expanded item row", async () => {
    const user = userEvent.setup();
    render(<StopDayList {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /Sun 6 Dec/ }));
    const region = screen.getByTestId("day-detail-2026-12-06");
    expect(within(region).getAllByTitle("Unschedule").length).toBeGreaterThanOrEqual(3);
  });
});
```

Note on the Date-field selector: if `getByLabelText(/^date$/i)` is ambiguous or misses, match how `item-form-dialog.test.tsx` targets the Date input and copy that selector.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/trip/stop-day-list.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`components/trip/stop-day-list.tsx`:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Plus, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { formatDayLabel } from "@/lib/dates";
import { buildStopDays, type StopDayItem } from "@/lib/stop-days";
import { rescheduleItem } from "@/server/actions/items";
import { categoryDotClass } from "./category-dot";
import { DayPickerMenu } from "./day-picker-menu";
import { ItemFormDialog, type StopOption } from "./item-form-dialog";
import { UnscheduleItemButton } from "./unschedule-item-button";
import type { ItemCardItem } from "./item-card";
import type { CostRow } from "@/server/actions/costs";
import type { AttachmentView } from "./attachment-list";

export interface StopDayListProps {
  tripId: string;
  stop: { id: string; arriveDate: string; departDate: string };
  /** Scheduled items for this stop (stopId = stop.id, date != null). */
  items: StopDayItem[];
  stops: StopOption[];
  forkId?: string | null;
  homeCurrency?: string;
  itemCostsById?: Map<string, CostRow[]>;
  itemAttachmentsById?: Map<string, AttachmentView[]>;
  isPending?: boolean;
}

const PREVIEW_COUNT = 2;

/**
 * The Stop card's day-by-day view of its slice of the Timeline (CONTEXT.md
 * "Timeline"; grilling 2026-09-13). Items only — accommodation and transport
 * render elsewhere on the plan. Rows are collapsed by default; expansion is
 * ephemeral. Every day of the stay renders, empty ones muted with their own
 * "+ Add".
 */
export function StopDayList({
  tripId,
  stop,
  items,
  stops,
  forkId,
  homeCurrency,
  itemCostsById,
  itemAttachmentsById,
  isPending = false,
}: StopDayListProps) {
  const router = useRouter();
  const days = React.useMemo(
    () => buildStopDays(stop.arriveDate, stop.departDate, items),
    [stop.arriveDate, stop.departDate, items],
  );
  const dayISOs = React.useMemo(() => days.map((d) => d.dateISO), [days]);

  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [addForDate, setAddForDate] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<ItemCardItem | null>(null);

  function toggle(dateISO: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dateISO)) next.delete(dateISO);
      else next.add(dateISO);
      return next;
    });
  }

  async function handleMove(item: StopDayItem, targetDateISO: string) {
    const res = await rescheduleItem(item.id, targetDateISO);
    if (!res.success) {
      toast({ title: "Couldn't move it", variant: "destructive" });
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col border-t border-border/40 pt-2" data-testid="stop-day-list">
      {days.map((day) => {
        const isOpen = expanded.has(day.dateISO);
        const all = [...day.timed, ...day.untimed];
        return (
          <div key={day.dateISO} className="flex flex-col">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(day.dateISO)}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-muted/50"
            >
              <span className="w-24 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                {formatDayLabel(day.dateISO)}
              </span>
              {all.length === 0 ? (
                <span className="flex-1 truncate text-xs italic text-muted-foreground/60">
                  Nothing planned
                </span>
              ) : (
                <span className="flex flex-1 items-center gap-2 truncate">
                  {all.slice(0, PREVIEW_COUNT).map((it) => (
                    <span key={it.id} className="inline-flex min-w-0 items-center gap-1">
                      <span
                        className={cn("size-1.5 shrink-0 rounded-full", categoryDotClass(it.category))}
                        aria-hidden="true"
                      />
                      <span className="truncate text-xs text-foreground">{it.title}</span>
                    </span>
                  ))}
                  {all.length > PREVIEW_COUNT && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      +{all.length - PREVIEW_COUNT}
                    </span>
                  )}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform",
                  isOpen && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>

            {isOpen && (
              <div
                data-testid={`day-detail-${day.dateISO}`}
                className="ml-3 flex flex-col gap-1 border-l border-border/40 pb-2 pl-4"
              >
                {day.timed.map((it) => (
                  <DayItemRow
                    key={it.id}
                    item={it}
                    timeLabel={it.startTime!}
                    days={dayISOs}
                    isPending={isPending}
                    onEdit={() => setEditing(toItemCardItem(it))}
                    onMove={(d) => handleMove(it, d)}
                  />
                ))}
                {day.untimed.length > 0 && (
                  <>
                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Anytime
                    </div>
                    {day.untimed.map((it) => (
                      <DayItemRow
                        key={it.id}
                        item={it}
                        timeLabel={null}
                        days={dayISOs}
                        isPending={isPending}
                        onEdit={() => setEditing(toItemCardItem(it))}
                        onMove={(d) => handleMove(it, d)}
                      />
                    ))}
                  </>
                )}
                <div className="mt-1 flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-0 text-xs text-primary hover:bg-transparent hover:text-primary/80"
                    disabled={isPending}
                    onClick={() => setAddForDate(day.dateISO)}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    Add to this day
                  </Button>
                  <Link
                    href={`/trips/${tripId}/day/${day.dateISO}`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Open day
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Create dialog — pre-dated to the chosen day, scheduled mode */}
      {addForDate && (
        <ItemFormDialog
          tripId={tripId}
          stops={stops}
          defaultUnscheduled={false}
          defaultDate={addForDate}
          defaultStopId={stop.id}
          open={addForDate !== null}
          onOpenChange={(open) => { if (!open) setAddForDate(null); }}
          forkId={forkId}
          homeCurrency={homeCurrency}
        />
      )}

      {/* Edit dialog */}
      {editing && (
        <ItemFormDialog
          tripId={tripId}
          stops={stops}
          item={editing}
          open={editing !== null}
          onOpenChange={(open) => { if (!open) setEditing(null); }}
          forkId={forkId}
          homeCurrency={homeCurrency}
          costs={itemCostsById?.get(editing.id)}
          attachments={itemAttachmentsById?.get(editing.id) ?? []}
        />
      )}
    </div>
  );
}

function toItemCardItem(it: StopDayItem): ItemCardItem {
  return {
    id: it.id,
    title: it.title,
    category: it.category,
    date: it.date ?? null,
    startTime: it.startTime ?? null,
    endTime: it.endTime ?? null,
    address: it.address ?? null,
    link: it.link ?? null,
    booking: it.booking ?? null,
    notes: it.notes ?? null,
    stopId: it.stopId ?? null,
  };
}

function DayItemRow({
  item,
  timeLabel,
  days,
  isPending,
  onEdit,
  onMove,
}: {
  item: StopDayItem;
  timeLabel: string | null;
  days: string[];
  isPending: boolean;
  onEdit: () => void;
  onMove: (dateISO: string) => void;
}) {
  return (
    <div className="group/dayitem flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
        {timeLabel ?? ""}
      </span>
      <span
        className={cn("size-2 shrink-0 rounded-full", categoryDotClass(item.category))}
        aria-hidden="true"
      />
      <span className="flex-1 truncate text-sm text-foreground">{item.title}</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-muted-foreground"
        disabled={isPending}
        onClick={onEdit}
        aria-label={`Edit ${item.title}`}
        title="Edit"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </Button>
      <DayPickerMenu
        days={days}
        label={`Move ${item.title} to another day`}
        currentDate={item.date}
        onPick={onMove}
        disabled={isPending}
      />
      <UnscheduleItemButton
        itemId={item.id}
        itemTitle={item.title}
        date={item.date!}
        startTime={item.startTime ?? null}
        endTime={item.endTime ?? null}
        hadStop={Boolean(item.stopId)}
      />
    </div>
  );
}
```

Check `ItemCardItem`'s actual shape in `components/trip/item-card.tsx` before finishing `toItemCardItem` — include every required field it declares (the shape used in `stop-card.tsx:495-507` is the reference).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/trip/stop-day-list.test.tsx`
Expected: PASS. If the `UnscheduleItemButton` label assertion fails, adjust to its rendered accessible name (it renders text "Unschedule" with `title="Unschedule"`).

- [ ] **Step 5: Commit**

```bash
git add components/trip/stop-day-list.tsx components/trip/stop-day-list.test.tsx
git commit -m "feat(plan): StopDayList — condensed expandable day rows with item editing"
```

---

### Task 5: `AccommodationRow` — collapsed one-line accommodation

**Files:**
- Create: `components/trip/accommodation-row.tsx`
- Create: `components/trip/accommodation-row.test.tsx`

**Interfaces:**
- Consumes: `AccommodationCard` and its prop types from `./accommodation-card` (existing); `formatDateRange` from `@/lib/dates`; `accommodationDateWarnings` from `@/lib/validations/accommodation`.
- Produces: `AccommodationRow(props: AccommodationRowProps)` where `AccommodationRowProps` is exactly the existing `AccommodationCardProps` shape (re-declared as an exported interface with the same fields: `accommodation`, `stop`, `isPending?`, `onEdit?`, `onDelete?`, `costs?`, `tripId?`, `homeCurrency?`, `notes?`, `currentUserId?`, `attachments?`). Collapsed: one line (name + check-in→out range + warning icon when dates fall outside the stop). Expanded: renders `<AccommodationCard {...props} />` unchanged.

- [ ] **Step 1: Write the failing test**

`components/trip/accommodation-row.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/notes", () => ({
  addNote: vi.fn(),
  deleteNote: vi.fn(),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));
vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));

import { AccommodationRow } from "./accommodation-row";

const accommodation = {
  id: "acc1",
  stopId: "s1",
  name: "Hotel du Louvre",
  address: "Place André Malraux",
  checkIn: "2026-12-05",
  checkOut: "2026-12-07",
  confirmation: "ABC123",
  notes: null,
  lat: null,
  lng: null,
};
const stop = { arriveDate: "2026-12-05", departDate: "2026-12-07" };

it("renders collapsed by default: name + date range, no address", () => {
  render(<AccommodationRow accommodation={accommodation} stop={stop} />);
  const row = screen.getByRole("button", { name: /Hotel du Louvre/ });
  expect(row).toHaveAttribute("aria-expanded", "false");
  expect(row).toHaveTextContent("5–7 Dec 2026");
  expect(screen.queryByText("Place André Malraux")).not.toBeInTheDocument();
});

it("expands to the full AccommodationCard", async () => {
  const user = userEvent.setup();
  render(<AccommodationRow accommodation={accommodation} stop={stop} />);
  await user.click(screen.getByRole("button", { name: /Hotel du Louvre/ }));
  expect(screen.getByText("Place André Malraux")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/trip/accommodation-row.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`components/trip/accommodation-row.tsx`:

```tsx
"use client";

import * as React from "react";
import { ChevronDown, Home, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDateRange } from "@/lib/dates";
import { accommodationDateWarnings } from "@/lib/validations/accommodation";
import {
  AccommodationCard,
  type AccommodationCardAccommodation,
  type AccommodationCardStop,
} from "./accommodation-card";
import type { CostRow } from "@/server/actions/costs";
import type { NoteView } from "./note-thread";
import type { AttachmentView } from "./attachment-list";

export interface AccommodationRowProps {
  accommodation: AccommodationCardAccommodation;
  stop: AccommodationCardStop;
  isPending?: boolean;
  onEdit?: (a: AccommodationCardAccommodation) => void;
  onDelete?: (id: string) => void;
  costs?: CostRow[];
  tripId?: string;
  homeCurrency?: string;
  notes?: NoteView[];
  currentUserId?: string;
  attachments?: AttachmentView[];
}

/**
 * Collapsed one-line accommodation row for the compact plan editor (grilling
 * 2026-09-13, Q5: b). Expands in place to the full AccommodationCard; the
 * expanded card is unchanged, so all editing/cost/notes affordances live there.
 */
export function AccommodationRow(props: AccommodationRowProps) {
  const { accommodation: a, stop, isPending = false } = props;
  const [open, setOpen] = React.useState(false);
  const warnings = accommodationDateWarnings(
    { checkIn: a.checkIn, checkOut: a.checkOut },
    stop,
  );

  if (open) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          aria-expanded={true}
          onClick={() => setOpen(false)}
          className="inline-flex items-center gap-1 self-start px-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className="size-3.5 rotate-180" aria-hidden="true" />
          Collapse
        </button>
        <AccommodationCard {...props} />
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-expanded={false}
      onClick={() => setOpen(true)}
      disabled={isPending}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-sm shadow-soft transition-shadow hover:shadow-soft-lg dark:border-emerald-900 dark:bg-emerald-950/40",
        isPending && "pointer-events-none opacity-60",
      )}
    >
      <Home className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-medium text-emerald-900 dark:text-emerald-100">
        {a.name}
      </span>
      <span className="shrink-0 text-xs text-emerald-700/80 dark:text-emerald-300/80">
        {formatDateRange(a.checkIn, a.checkOut)}
      </span>
      {warnings.length > 0 && (
        <AlertTriangle
          className="size-3.5 shrink-0 text-amber-600"
          aria-label="Dates fall outside the stop"
        />
      )}
      <ChevronDown className="size-3.5 shrink-0 text-emerald-700/60 dark:text-emerald-300/60" aria-hidden="true" />
    </button>
  );
}
```

Check `accommodationDateWarnings`'s return type in `lib/validations/accommodation.ts` before use — `AccommodationCard` (accommodation-card.tsx:75) calls it with exactly these arguments, so mirror that call.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/trip/accommodation-row.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/trip/accommodation-row.tsx components/trip/accommodation-row.test.tsx
git commit -m "feat(plan): AccommodationRow — collapsed accommodation line, expands to full card"
```

---

### Task 6: StopCard integration — day rows + labelled Things to do with pick-a-day

**Files:**
- Modify: `components/trip/stop-card.tsx`
- Modify: `components/trip/stop-card.test.tsx` (append)

**Interfaces:**
- Consumes: `StopDayList` + `StopDayItem` (Task 4), `DayPickerMenu` (Task 3), `scheduleItem` from `@/server/actions/items`, `enumerateTripDays` from `@/lib/itinerary`, `useRouter` from `next/navigation`, `toast` from `@/components/ui/use-toast`.
- Produces: three new optional `StopCardProps`:
  ```ts
  /** Scheduled items for this stop (date != null) — drives the day rows. */
  dayItems?: StopDayItem[];
  ```
  (reuses existing `thingsToDoItemCosts` / `thingsToDoItemAttachments` maps for the day rows' edit pre-fill — the plan page will merge costs for both pools into the same map in Task 8.)

- [ ] **Step 1: Write the failing tests**

Append to `components/trip/stop-card.test.tsx`. First extend the existing `vi.mock("@/server/actions/items", ...)` factory (line 18) with `scheduleItem`, `unscheduleItem`, `rescheduleItem` (all `vi.fn().mockResolvedValue({ success: true })`; `unscheduleItem` resolves `{ success: true, mode: "unslotted", sourceItemId: null }`), and add a `vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))` at the top with the other mocks. Then:

```tsx
// Day-aware plan editor (grilling 2026-09-13)

import { scheduleItem } from "@/server/actions/items";

describe("day rows (scheduled stops)", () => {
  const dayItems = [
    { id: "d1", title: "Colosseum", category: "SIGHTSEEING", date: "2026-07-11", startTime: "10:00", stopId: "a" },
  ];

  it("renders a day row for every day of the stay, including empty ones", () => {
    render(
      <StopCard stop={scheduledStop} isFirst isLast tripId="t1" dayItems={dayItems} />,
    );
    // 10 → 13 Jul inclusive = 4 rows
    expect(screen.getByRole("button", { name: /Fri 10 Jul/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sat 11 Jul/ })).toHaveTextContent("Colosseum");
    expect(screen.getByRole("button", { name: /Sun 12 Jul/ })).toHaveTextContent(/nothing planned/i);
    expect(screen.getByRole("button", { name: /Mon 13 Jul/ })).toBeInTheDocument();
  });

  it("renders no day rows on a rough stop", () => {
    render(<StopCard stop={roughStop} isFirst isLast tripId="t1" dayItems={[]} />);
    expect(screen.queryByTestId("stop-day-list")).not.toBeInTheDocument();
  });
});

describe("things to do section", () => {
  const thing = { id: "th1", title: "Trevi Fountain", category: "SIGHTSEEING", stopId: "a" };

  it("labels the dateless pool 'Things to do'", () => {
    render(
      <StopCard stop={scheduledStop} isFirst isLast tripId="t1" thingsToDo={[thing]} />,
    );
    expect(screen.getByText("Things to do")).toBeInTheDocument();
    expect(screen.getByText("Trevi Fountain")).toBeInTheDocument();
  });

  it("schedules a thing-to-do onto a picked day", async () => {
    const user = userEvent.setup();
    render(
      <StopCard stop={scheduledStop} isFirst isLast tripId="t1" thingsToDo={[thing]} />,
    );
    await user.click(screen.getByRole("button", { name: "Pick a day for Trevi Fountain" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sat 11 Jul" }));
    expect(scheduleItem).toHaveBeenCalledWith("th1", { date: "2026-07-11" });
  });

  it("shows no pick-a-day control on a rough stop (no days exist yet)", () => {
    render(<StopCard stop={roughStop} isFirst isLast tripId="t1" thingsToDo={[thing]} />);
    expect(
      screen.queryByRole("button", { name: "Pick a day for Trevi Fountain" }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/trip/stop-card.test.tsx`
Expected: the new tests FAIL; existing tests still pass.

- [ ] **Step 3: Implement in `stop-card.tsx`**

1. New imports:

```tsx
import { useRouter } from "next/navigation";
import { enumerateTripDays } from "@/lib/itinerary";
import { scheduleItem } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import { StopDayList } from "./stop-day-list";
import { DayPickerMenu } from "./day-picker-menu";
import type { StopDayItem } from "@/lib/stop-days";
```

Add `"use client";` at the top of the file if not already present (check line 1 — it currently starts with `import * as React`; the file renders inside the client-side ItineraryManager, but `useRouter` requires the directive if absent).

2. `StopCardProps`: add after `thingsToDo`:

```ts
  /** Scheduled items for this stop (date != null) — drives the day rows. */
  dayItems?: StopDayItem[];
```

3. In the component: destructure `dayItems`, add `const router = useRouter();`, and compute the stay's days once:

```ts
  const stayDays = React.useMemo(
    () => (isRough ? [] : enumerateTripDays(stop.arriveDate!, stop.departDate!)),
    [isRough, stop.arriveDate, stop.departDate],
  );

  async function handleScheduleThing(thingId: string, dateISO: string) {
    const res = await scheduleItem(thingId, { date: dateISO });
    if (!res.success) {
      toast({ title: "Couldn't schedule it", variant: "destructive" });
      return;
    }
    router.refresh();
  }
```

4. Render the day rows between the notes preview (line 459-463) and the things-to-do block (line 465):

```tsx
      {/* Day rows — the stop's slice of the Timeline (grilling 2026-09-13) */}
      {tripId && !isRough && (
        <StopDayList
          tripId={tripId}
          stop={{ id: stop.id, arriveDate: stop.arriveDate!, departDate: stop.departDate! }}
          items={dayItems ?? []}
          stops={stops}
          forkId={forkId}
          homeCurrency={homeCurrency}
          itemCostsById={thingsToDoItemCosts}
          itemAttachmentsById={thingsToDoItemAttachments}
          isPending={isPending}
        />
      )}
```

5. Things-to-do section: add a heading directly above the existing `<ul>` (line 469-470) and render it whenever `tripId` is set and there are things (keep the existing conditional structure):

```tsx
          {thingsToDo && thingsToDo.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-border/40 pt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Things to do
              </div>
              <ul className="flex flex-col gap-1.5">
                {/* existing <li> content unchanged, EXCEPT: */}
              </ul>
            </div>
          )}
```

(The `border-t/pt-2` moves from the `<ul>` to the wrapper.) Inside each `<li>`, between the time span and the edit `<Button>`, add the pick-a-day control — scheduled stops only:

```tsx
                  {!isRough && stayDays.length > 0 && (
                    <DayPickerMenu
                      days={stayDays}
                      label={`Pick a day for ${thing.title}`}
                      onPick={(d) => handleScheduleThing(thing.id, d)}
                      disabled={isPending}
                    />
                  )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/trip/stop-card.test.tsx components/trip/stop-day-list.test.tsx`
Expected: PASS — all new and pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add components/trip/stop-card.tsx components/trip/stop-card.test.tsx
git commit -m "feat(plan): StopCard renders day rows and a labelled Things to do section with pick-a-day"
```

---

### Task 7: ItineraryManager — thread `dayItemsByStopId`, swap in AccommodationRow

**Files:**
- Modify: `components/trip/itinerary-manager.tsx` (props ~line 135-200, StopCard render ~line 1529-1555, AccommodationCard render ~line 1567-1590)
- Modify: `components/trip/itinerary-manager.test.tsx` (fix accommodation-flow tests)

**Interfaces:**
- Consumes: `AccommodationRow` (Task 5), `StopDayItem` (Task 1).
- Produces: new `ItineraryManagerProps` member:
  ```ts
  /** Scheduled items keyed by stopId (date != null) — drives StopCard day rows. */
  dayItemsByStopId?: Map<string, StopDayItem[]>;
  ```

- [ ] **Step 1: Write the failing test**

Append to `components/trip/itinerary-manager.test.tsx` (reuse the file's existing render helpers/fixtures — read how it builds `initialStops` and copy the minimal scheduled-stop fixture):

```tsx
describe("day-aware plan editor wiring", () => {
  it("passes each stop's scheduled items through to its day rows", () => {
    renderManager({
      // use the file's existing helper/fixture idiom for a scheduled stop with id "s1"
      dayItemsByStopId: new Map([
        ["s1", [{ id: "d1", title: "Colosseum", category: "SIGHTSEEING", date: "2026-07-11", startTime: "10:00", stopId: "s1" }]],
      ]),
    });
    expect(screen.getByTestId("stop-day-list")).toBeInTheDocument();
    expect(screen.getByText("Colosseum")).toBeInTheDocument();
  });

  it("renders accommodation collapsed to a one-line row", () => {
    renderManager({}); // fixture must include one accommodation on a scheduled stop
    const row = screen.getByRole("button", { name: /Hotel/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
  });
});
```

Adapt `renderManager` to whatever helper the file actually uses (it may render `<ItineraryManager {...defaultProps} {...overrides} />` inline). The assertions are the contract; the setup mirrors the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/trip/itinerary-manager.test.tsx`
Expected: new tests FAIL (unknown prop, full card rendered).

- [ ] **Step 3: Implement**

1. Import `AccommodationRow` from `./accommodation-row` and `type StopDayItem` from `@/lib/stop-days`.
2. Add `dayItemsByStopId?: Map<string, StopDayItem[]>;` to `ItineraryManagerProps` (next to `thingsToDoByStopId`, ~line 180) and destructure it.
3. In `renderStop` (~line 1529), pass to `StopCard`:

```tsx
        dayItems={dayItemsByStopId?.get(stop.id)}
```

4. Replace the `<AccommodationCard ... />` usage (lines 1570-1587) with `<AccommodationRow ... />` — identical props, only the component name changes. Keep the `AccommodationCard` type imports (`AccommodationCardAccommodation` is still used at line 12/523).

5. Fix pre-existing accommodation tests: any test that clicks an edit/delete control inside the accommodation card must first expand the row (click the collapsed row button by accommodation name). Update those tests — do not weaken their assertions, just add the expand click.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/trip/itinerary-manager.test.tsx`
Expected: PASS — including all pre-existing accommodation-flow tests.

- [ ] **Step 5: Commit**

```bash
git add components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "feat(plan): thread dayItemsByStopId to StopCard and collapse accommodation to rows"
```

---

### Task 8: Plan page data — scheduled-items query, cost merge, final verification

**Files:**
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx` (Promise.all ~line 46-155, item costs ~line 269-292, ItineraryManager props ~line 349-370)

**Interfaces:**
- Consumes: everything above. No new exports — this is the wiring + verification task.

- [ ] **Step 1: Add the scheduled-items query**

In the `Promise.all` (line 46), add a seventh query after `thingsToDoItems` and destructure it as `scheduledItems`:

```ts
    // Per-stop scheduled items: plan-owned items with stopId set and a date —
    // the stop's slice of the Timeline, rendered as day rows (grilling 2026-09-13)
    db.item.findMany({
      where: { tripId, ...planScope(activeForkId), stopId: { not: null }, date: { not: null } },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        title: true,
        category: true,
        date: true,
        startTime: true,
        endTime: true,
        address: true,
        link: true,
        booking: true,
        notes: true,
        stopId: true,
        lat: true,
        lng: true,
      },
    }),
```

- [ ] **Step 2: Merge costs and group by stop**

Replace the `thingsToDoItemIds` line (line 270) so the cost query covers both pools:

```ts
  const planItemIds = [...thingsToDoItems, ...scheduledItems].map((i) => i.id);
```

…and use `planItemIds` in the `ownerId: { in: ... }` filter (line 278). The resulting map (`thingsToDoItemCostsById`, line 286) now carries costs for both pools — leave its variable name as is; it feeds the single `thingsToDoItemCostsById` prop.

Below the `thingsToDoByStopId` grouping (line 295-301), add:

```ts
  // Group scheduled items by stopId for the day rows
  const dayItemsByStopId = new Map<string, typeof scheduledItems>();
  for (const item of scheduledItems) {
    if (!item.stopId) continue;
    const existing = dayItemsByStopId.get(item.stopId) ?? [];
    existing.push(item);
    dayItemsByStopId.set(item.stopId, existing);
  }
```

- [ ] **Step 3: Pass the new prop**

In the `<ItineraryManager>` render (line 349), add next to `thingsToDoByStopId`:

```tsx
            dayItemsByStopId={dayItemsByStopId}
```

- [ ] **Step 4: Full verification**

Run each; all must pass before committing:

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

Expected: type-check clean, lint clean, full unit suite green, production build succeeds. If `npm run build` needs env vars that aren't available, note the failure mode; type-check + lint + tests are the required gates.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/trips/\[tripId\]/plan/page.tsx
git commit -m "feat(plan): load scheduled items per stop and thread day rows through the plan page"
```

---

## Out of scope (open Feedback notes NOT covered)

- Weather card layout on the day page (`cmtzfitb3…`)
- Checkout-first ordering in the day Timeline (`cmtzfouiz…`)
- Payment model rework (`cmtzg1rl8…`, `cmtzfz4vi…`)

Feedback notes `cmtzfewkd000204l2fpiai7eq` and `cmtzfn4vy000004jm7m9kbp5g` are resolved by this plan — resolve them (via `npm run feedback:resolve`) only after Task 8's verification passes.
