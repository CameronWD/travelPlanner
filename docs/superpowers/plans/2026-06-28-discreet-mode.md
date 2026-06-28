# Discreet "Workspace" Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A device-local "discreet mode" that disguises TEEPEE as a generic spreadsheet/work tool, with the plan page becoming a genuinely editable stop-by-stop spreadsheet, so a trip can be planned on a work screen without reading as trip-planning.

**Architecture:** Discreet state lives in **cookies** (`teepee-discreet`, `teepee-discreet-label`) so authenticated **server** layouts/pages render the disguise directly — flash-free, no double-render, and the existing theme no-flash script is untouched. The `.discreet` skin is confined to the `(app)` route group (public `/signin` and `/share` are unaffected). Two structural swaps (trips list → project table, plan page → editable spreadsheet) branch on the cookie server-side. In-cell editing reuses the existing `setStopDates` ripple and two new thin actions (`setStopNights`, `setStopNotes`). **No DB/schema changes.**

**Tech Stack:** Next.js 16 (App Router, server components, `generateMetadata`, cookies via `next/headers`), React 19, TypeScript, Prisma 7, Tailwind v4, Vitest + jsdom + Testing Library.

**Scope boundary:** In-cell editing lives ONLY on the plan spreadsheet. Other surfaces (day, settings, costs) inherit the muted skin via CSS but keep their existing layouts and edit screens. Editable columns: **Nights, Notes, Dates** (Location stays read-only). No panic/boss-key hotkey.

---

## File Structure

**Create:**
- `lib/discreet.ts` — pure constants + helpers: cookie names, default label, `resolveDiscreetLabel`, `columnLetter`, `buildStopSheetRows` (pure row derivation).
- `lib/discreet.test.ts`
- `lib/discreet-server.ts` — `getDiscreetState()` (reads cookies via `next/headers`).
- `lib/discreet-server.test.ts`
- `components/discreet/discreet-toggle.tsx` — client toggle + label field (mounted in account dropdown).
- `components/discreet/discreet-toggle.test.tsx`
- `components/discreet/project-table.tsx` — trips-list disguise (server presentational).
- `components/discreet/project-table.test.tsx`
- `components/discreet/stop-spreadsheet.tsx` — client editable spreadsheet.
- `components/discreet/stop-spreadsheet.test.tsx`
- `public/discreet-icon.svg` — generic grid favicon for the disguise.

**Modify:**
- `server/actions/stops.ts` — add `setStopNotes`, `setStopNights` (reuse `setStopDates`).
- `server/actions/stops.test.ts` — tests for the two new actions.
- `app/(app)/layout.tsx` — discreet chrome, wrapper class, `generateMetadata`, mount toggle.
- `app/(app)/layout.test.tsx` — chrome assertions on/off.
- `app/(app)/trips/page.tsx` — branch to `ProjectTable` when discreet.
- `app/(app)/trips/[tripId]/plan/page.tsx` — branch to `StopSpreadsheet` when discreet.
- `app/globals.css` — `.discreet` skin rules.
- `CONTEXT.md` — glossary entry.

---

## Task 1: Backend — `setStopNotes` + `setStopNights` actions

These are the only new server actions. `setStopNotes` is a plain field update. `setStopNights` branches: rough stops set the `nights` field; scheduled stops recompute `departDate` and delegate to the existing `setStopDates` (inheriting its ripple + conflicts). Existing `setStopDates` is reused, never modified.

**Files:**
- Modify: `server/actions/stops.ts`
- Test: `server/actions/stops.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `server/actions/stops.test.ts` (mirror the existing mocks in that file — `@/lib/db`, `@/lib/guards`, `next/cache`, `@/server/actions/activity`). Reference the existing `requireStopAccess`/`db.stop.findUnique` mock shape already used by `setStopDates` tests.

```ts
import { setStopNotes, setStopNights, setStopDates } from "@/server/actions/stops";

describe("setStopNotes", () => {
  it("trims and writes notes, records activity, revalidates", async () => {
    db.stop.findUnique.mockResolvedValue({
      id: "s1", tripId: "t1", sortOrder: 0,
      arriveDate: null, departDate: null, nights: 2, pinned: false,
    });
    db.stop.update.mockResolvedValue({ id: "s1", tripId: "t1", notes: "Book ferry" });

    const r = await setStopNotes("s1", "  Book ferry  ");

    expect(r).toEqual({ success: true });
    expect(db.stop.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { notes: "Book ferry" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/t1");
  });

  it("stores null for an empty note", async () => {
    db.stop.findUnique.mockResolvedValue({
      id: "s1", tripId: "t1", sortOrder: 0,
      arriveDate: null, departDate: null, nights: 2, pinned: false,
    });
    db.stop.update.mockResolvedValue({ id: "s1", tripId: "t1", notes: null });

    await setStopNotes("s1", "   ");

    expect(db.stop.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { notes: null },
    });
  });
});

describe("setStopNights", () => {
  it("rejects a negative or non-integer value", async () => {
    const r = await setStopNights("s1", -1);
    expect(r).toEqual({ success: false, errors: { nights: ["Nights must be between 0 and 366"] } });
    expect(db.stop.update).not.toHaveBeenCalled();
  });

  it("updates the nights field for a rough stop", async () => {
    db.stop.findUnique.mockResolvedValue({
      id: "s1", tripId: "t1", sortOrder: 0,
      arriveDate: null, departDate: null, nights: 2, pinned: false,
    });
    db.stop.update.mockResolvedValue({ id: "s1", tripId: "t1", nights: 5 });

    const r = await setStopNights("s1", 5);

    expect(r).toEqual({ success: true });
    expect(db.stop.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { nights: 5 },
    });
  });

  it("recomputes depart date for a scheduled stop (ripple path)", async () => {
    // arrive 2026-07-12 + 3 nights => depart 2026-07-15
    db.stop.findUnique.mockResolvedValue({
      id: "s1", tripId: "t1", sortOrder: 0,
      arriveDate: "2026-07-12", departDate: "2026-07-14", nights: 2, pinned: false,
    });
    db.stop.findMany.mockResolvedValue([]); // no following stops to ripple
    db.trip.findUnique.mockResolvedValue({ endDate: "2026-07-20" });
    db.stop.update.mockResolvedValue({});

    const r = await setStopNights("s1", 3);

    expect(r.success).toBe(true);
    // delegated to setStopDates: arrive unchanged, depart = arrive + 3
    expect(db.stop.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { arriveDate: "2026-07-12", departDate: "2026-07-15" },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/actions/stops.test.ts`
Expected: FAIL — `setStopNotes`/`setStopNights` not exported.

- [ ] **Step 3: Implement the two actions**

Add to `server/actions/stops.ts` (after `setStopDates`). Note `addDays` is already importable from `@/lib/dates`; add it to the existing `@/lib/dates` import line.

```ts
/**
 * Set just a stop's free-text notes (used by discreet-mode in-cell editing).
 * Empty/whitespace becomes null.
 */
export async function setStopNotes(
  stopId: string,
  notes: string,
): Promise<StopActionResult> {
  const stop = await requireStopAccess(stopId);
  const trimmed = notes.trim();

  const before = await db.stop.findUnique({ where: { id: stopId } });
  const updated = await db.stop.update({
    where: { id: stopId },
    data: { notes: trimmed === "" ? null : trimmed },
  });

  await recordActivity({
    tripId: stop.tripId,
    verb: "UPDATED",
    entityType: "STOP",
    entityId: stopId,
    entityLabel: entityLabel("STOP", updated as unknown as Record<string, unknown>),
    changes: describeChanges(
      "STOP",
      (before ?? {}) as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    ),
  });

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}

/**
 * Set a stop's nights.
 *  - Rough stop (no arriveDate): write the `nights` field directly.
 *  - Scheduled stop: recompute departDate = arriveDate + nights and delegate to
 *    setStopDates so the firm-up ripple + conflict reporting are reused.
 */
export async function setStopNights(
  stopId: string,
  nights: number,
): Promise<StopActionResult> {
  if (!Number.isInteger(nights) || nights < 0 || nights > 366) {
    return { success: false, errors: { nights: ["Nights must be between 0 and 366"] } };
  }

  const stop = await requireStopAccess(stopId);

  // Scheduled: recompute depart and reuse the ripple-aware path.
  if (stop.arriveDate) {
    const departDate = addDays(stop.arriveDate, nights);
    return setStopDates(stopId, { arriveDate: stop.arriveDate, departDate });
  }

  // Rough: just the field.
  const before = await db.stop.findUnique({ where: { id: stopId } });
  const updated = await db.stop.update({
    where: { id: stopId },
    data: { nights },
  });

  await recordActivity({
    tripId: stop.tripId,
    verb: "UPDATED",
    entityType: "STOP",
    entityId: stopId,
    entityLabel: entityLabel("STOP", updated as unknown as Record<string, unknown>),
    changes: describeChanges(
      "STOP",
      (before ?? {}) as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    ),
  });

  revalidatePath(`/trips/${stop.tripId}`);
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/actions/stops.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/actions/stops.ts server/actions/stops.test.ts
git commit -m "feat(discreet): setStopNotes + setStopNights actions"
```

---

## Task 2: Pure discreet lib — constants, label, row builder

A pure, fully-unit-tested module: cookie names, default label, label resolution, column-letter helper, and `buildStopSheetRows` which derives the spreadsheet rows from already-fetched domain data (kept pure so the page stays thin and the derivation is testable).

**Files:**
- Create: `lib/discreet.ts`
- Test: `lib/discreet.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import {
  DISCREET_COOKIE, DISCREET_LABEL_COOKIE, DEFAULT_DISCREET_LABEL,
  resolveDiscreetLabel, columnLetter, buildStopSheetRows,
} from "@/lib/discreet";

describe("resolveDiscreetLabel", () => {
  it("defaults when empty/nullish", () => {
    expect(resolveDiscreetLabel(undefined)).toBe(DEFAULT_DISCREET_LABEL);
    expect(resolveDiscreetLabel("")).toBe(DEFAULT_DISCREET_LABEL);
    expect(resolveDiscreetLabel("   ")).toBe(DEFAULT_DISCREET_LABEL);
  });
  it("trims and clamps to 40 chars", () => {
    expect(resolveDiscreetLabel("  Q3 Tracker  ")).toBe("Q3 Tracker");
    expect(resolveDiscreetLabel("x".repeat(60))).toHaveLength(40);
  });
});

describe("columnLetter", () => {
  it("maps 0->A, 25->Z, 26->AA", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
  });
});

describe("buildStopSheetRows", () => {
  const base = {
    transports: [{ mode: "CAR", fromStopId: "s1", toStopId: "s2" }],
    costHomeMinorByStopId: { s2: 18000 },
    homeCurrency: "AUD",
  };

  it("derives nights from dates for scheduled stops and lists transport-in", () => {
    const rows = buildStopSheetRows({
      ...base,
      stops: [
        { id: "s1", name: "Queenstown", country: "NZ", arriveDate: "2026-07-12", departDate: "2026-07-15", nights: null, pinned: false, notes: null, accommodations: [] },
        { id: "s2", name: "Te Anau", country: "NZ", arriveDate: "2026-07-15", departDate: "2026-07-17", nights: null, pinned: true, notes: "ferry", accommodations: [{ name: "Lakeview Motel" }] },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "s1", location: "Queenstown", scheduled: true, nights: 3, transportInLabel: null, estCostMinor: 0 });
    expect(rows[1]).toMatchObject({ id: "s2", scheduled: true, nights: 2, pinned: true, transportInLabel: "Car", stayLabel: "Lakeview Motel", estCostMinor: 18000, notes: "ferry" });
  });

  it("uses the nights field for rough stops and blanks dates", () => {
    const rows = buildStopSheetRows({
      ...base, transports: [], costHomeMinorByStopId: {},
      stops: [{ id: "s1", name: "Milford", country: null, arriveDate: null, departDate: null, nights: 1, pinned: false, notes: null, accommodations: [] }],
    });
    expect(rows[0]).toMatchObject({ scheduled: false, nights: 1, arriveDate: null, departDate: null });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run lib/discreet.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/discreet.ts`**

```ts
import { nightsBetween } from "@/lib/dates";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import type { TransportMode } from "@/lib/enums";

export const DISCREET_COOKIE = "teepee-discreet";
export const DISCREET_LABEL_COOKIE = "teepee-discreet-label";
export const DEFAULT_DISCREET_LABEL = "Workspace";
const LABEL_MAX = 40;

/** Trim a custom label, clamp length, fall back to the default. */
export function resolveDiscreetLabel(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return DEFAULT_DISCREET_LABEL;
  return trimmed.slice(0, LABEL_MAX);
}

/** Spreadsheet-style column letter: 0->A, 25->Z, 26->AA, ... */
export function columnLetter(index: number): string {
  let i = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (i % 26)) + out;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return out;
}

export interface SheetStopInput {
  id: string;
  name: string;
  country: string | null;
  arriveDate: string | null;
  departDate: string | null;
  nights: number | null;
  pinned: boolean;
  notes: string | null;
  accommodations: { name: string }[];
}

export interface SheetTransportInput {
  mode: string;
  fromStopId?: string | null;
  toStopId?: string | null;
}

export interface BuildStopSheetRowsInput {
  stops: SheetStopInput[];
  transports: SheetTransportInput[];
  /** Pre-summed estimated cost (home minor units) keyed by stop id. */
  costHomeMinorByStopId: Record<string, number>;
  homeCurrency: string;
}

export interface SheetRow {
  id: string;
  location: string;
  country: string | null;
  arriveDate: string | null;
  departDate: string | null;
  nights: number;
  scheduled: boolean;
  pinned: boolean;
  transportInLabel: string | null;
  stayLabel: string | null;
  estCostMinor: number;
  notes: string | null;
}

/** Derive spreadsheet rows (one per stop) from already-fetched trip data. Pure. */
export function buildStopSheetRows(input: BuildStopSheetRowsInput): SheetRow[] {
  const { stops, transports, costHomeMinorByStopId } = input;
  return stops.map((s) => {
    const scheduled = Boolean(s.arriveDate && s.departDate);
    const nights = scheduled
      ? nightsBetween(s.arriveDate as string, s.departDate as string)
      : (s.nights ?? 0);
    const tIn = transports.find((t) => t.toStopId === s.id);
    const transportInLabel = tIn
      ? (TRANSPORT_MODE_META[tIn.mode as TransportMode]?.label ?? tIn.mode)
      : null;
    return {
      id: s.id,
      location: s.name,
      country: s.country,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
      nights,
      scheduled,
      pinned: s.pinned,
      transportInLabel,
      stayLabel: s.accommodations[0]?.name ?? null,
      estCostMinor: costHomeMinorByStopId[s.id] ?? 0,
      notes: s.notes,
    };
  });
}
```

> NOTE for implementer: confirm `TRANSPORT_MODE_META[mode].label` exists in `@/lib/transport`; if the property is named differently (e.g. `.title`), adjust the lookup. The test asserts `"Car"` for `mode: "CAR"`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/discreet.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/discreet.ts lib/discreet.test.ts
git commit -m "feat(discreet): pure constants + spreadsheet row builder"
```

---

## Task 3: Server cookie reader — `getDiscreetState()`

**Files:**
- Create: `lib/discreet-server.ts`
- Test: `lib/discreet-server.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { vi, describe, it, expect, beforeEach } from "vitest";
import { getDiscreetState } from "@/lib/discreet-server";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(cookieStore) }));

describe("getDiscreetState", () => {
  beforeEach(() => cookieStore.get.mockReset());

  it("off by default", async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect(await getDiscreetState()).toEqual({ discreet: false, label: "Workspace" });
  });

  it("on with resolved custom label", async () => {
    cookieStore.get.mockImplementation((name: string) =>
      name === "teepee-discreet" ? { value: "1" } : { value: "Q3 Tracker" });
    expect(await getDiscreetState()).toEqual({ discreet: true, label: "Q3 Tracker" });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run lib/discreet-server.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/discreet-server.ts`**

```ts
import { cookies } from "next/headers";
import {
  DISCREET_COOKIE, DISCREET_LABEL_COOKIE, resolveDiscreetLabel,
} from "@/lib/discreet";

export interface DiscreetState {
  discreet: boolean;
  label: string;
}

/** Read the device-local discreet flag + label from cookies (server-side). */
export async function getDiscreetState(): Promise<DiscreetState> {
  const store = await cookies();
  const discreet = store.get(DISCREET_COOKIE)?.value === "1";
  const label = resolveDiscreetLabel(store.get(DISCREET_LABEL_COOKIE)?.value);
  return { discreet, label };
}
```

- [ ] **Step 4: Run to verify pass** → `npx vitest run lib/discreet-server.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/discreet-server.ts lib/discreet-server.test.ts
git commit -m "feat(discreet): server-side cookie state reader"
```

---

## Task 4: Discreet toggle (client)

A client component for the account dropdown: a toggle row + (when on) a label input. Writes cookies and calls `router.refresh()` so the server re-renders the disguise. Receives the current state as props (the server already read it).

**Files:**
- Create: `components/discreet/discreet-toggle.tsx`
- Test: `components/discreet/discreet-toggle.test.tsx`

- [ ] **Step 1: Write failing test**

```ts
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { DiscreetToggle } from "@/components/discreet/discreet-toggle";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("DiscreetToggle", () => {
  beforeEach(() => {
    refresh.mockReset();
    document.cookie = "";
  });

  it("turns discreet mode on (sets cookie + refreshes)", () => {
    render(<DiscreetToggle discreet={false} label="Workspace" />);
    fireEvent.click(screen.getByRole("button", { name: /discreet mode/i }));
    expect(document.cookie).toContain("teepee-discreet=1");
    expect(refresh).toHaveBeenCalled();
  });

  it("saves a custom label on blur", () => {
    render(<DiscreetToggle discreet={true} label="Workspace" />);
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "Q3 Tracker" } });
    fireEvent.blur(input);
    expect(document.cookie).toContain("teepee-discreet-label=Q3%20Tracker");
    expect(refresh).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify fail** → FAIL (module not found).

- [ ] **Step 3: Implement `components/discreet/discreet-toggle.tsx`**

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import {
  DISCREET_COOKIE, DISCREET_LABEL_COOKIE, DEFAULT_DISCREET_LABEL,
} from "@/lib/discreet";

const YEAR = 60 * 60 * 24 * 365;

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${YEAR}; samesite=lax`;
}
function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

export function DiscreetToggle({ discreet, label }: { discreet: boolean; label: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState(label);

  function toggle() {
    if (discreet) clearCookie(DISCREET_COOKIE);
    else setCookie(DISCREET_COOKIE, "1");
    router.refresh();
  }

  function saveLabel() {
    const trimmed = value.trim();
    if (trimmed === "") clearCookie(DISCREET_LABEL_COOKIE);
    else setCookie(DISCREET_LABEL_COOKIE, trimmed);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 px-2 py-1.5">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 text-sm text-foreground"
        aria-pressed={discreet}
      >
        {discreet ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        Discreet mode
        <span className="ml-auto text-xs text-muted-foreground">{discreet ? "On" : "Off"}</span>
      </button>
      {discreet && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Display name
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={saveLabel}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder={DEFAULT_DISCREET_LABEL}
            className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/discreet/discreet-toggle.tsx components/discreet/discreet-toggle.test.tsx
git commit -m "feat(discreet): account-menu toggle + label field"
```

---

## Task 5: Wire `(app)/layout.tsx` — chrome, wrapper class, metadata, favicon

**Files:**
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(app)/layout.test.tsx`
- Create: `public/discreet-icon.svg`

- [ ] **Step 1: Create the favicon asset `public/discreet-icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="4" fill="#107c41"/>
  <rect x="6" y="7" width="20" height="18" rx="1" fill="#fff"/>
  <g stroke="#107c41" stroke-width="1.2">
    <line x1="6" y1="13" x2="26" y2="13"/><line x1="6" y1="19" x2="26" y2="19"/>
    <line x1="13" y1="7" x2="13" y2="25"/><line x1="19" y1="7" x2="19" y2="25"/>
  </g>
</svg>
```

- [ ] **Step 2: Write/adjust failing layout tests**

Add to `app/(app)/layout.test.tsx` (follow the file's existing `auth` mock; add a `getDiscreetState` mock). The layout is async — render via `await AppLayout({ children })` exactly as the existing tests do.

```ts
vi.mock("@/lib/discreet-server", () => ({ getDiscreetState: vi.fn() }));
import { getDiscreetState } from "@/lib/discreet-server";

it("shows the TEEPEE wordmark when discreet is off", async () => {
  (getDiscreetState as Mock).mockResolvedValue({ discreet: false, label: "Workspace" });
  const ui = await AppLayout({ children: <div /> });
  render(ui);
  expect(screen.getByText("TEEPEE")).toBeInTheDocument();
});

it("shows the neutral label and no TEEPEE when discreet is on", async () => {
  (getDiscreetState as Mock).mockResolvedValue({ discreet: true, label: "Q3 Tracker" });
  const ui = await AppLayout({ children: <div /> });
  render(ui);
  expect(screen.getByText("Q3 Tracker")).toBeInTheDocument();
  expect(screen.queryByText("TEEPEE")).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run to verify fail** → FAIL.

- [ ] **Step 4: Implement layout changes**

In `app/(app)/layout.tsx`:
1. Add imports: `import { getDiscreetState } from "@/lib/discreet-server";` and `import { DiscreetToggle } from "@/components/discreet/discreet-toggle";` and `import type { Metadata } from "next";`.
2. Add `generateMetadata`:

```tsx
export async function generateMetadata(): Promise<Metadata> {
  const { discreet, label } = await getDiscreetState();
  if (!discreet) return {};
  return { title: label, icons: { icon: "/discreet-icon.svg" } };
}
```

3. In the component, after `const { name, email, image } = session.user;`:

```tsx
const { discreet, label } = await getDiscreetState();
```

4. Wrap the outer shell so the skin scopes to authenticated routes:

```tsx
return (
  <div className={`flex min-h-full flex-col${discreet ? " discreet" : ""}`}>
```

5. Replace the wordmark `<Link>` inner content with a conditional:

```tsx
<Link
  href="/trips"
  className="flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight text-foreground hover:text-foreground/80 transition-colors"
  aria-label={discreet ? label : "TEEPEE — go to your trips"}
>
  {discreet ? (
    label
  ) : (
    <>
      <span aria-hidden="true">🛖</span>
      TEEPEE
    </>
  )}
</Link>
```

6. Mount the toggle in the dropdown, before `<SignOutMenuItem />`:

```tsx
<DropdownMenuSeparator />
<DiscreetToggle discreet={discreet} label={label} />
<DropdownMenuSeparator />
<SignOutMenuItem />
```

- [ ] **Step 5: Run to verify pass** → `npx vitest run "app/(app)/layout.test.tsx"` → PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/layout.tsx" "app/(app)/layout.test.tsx" public/discreet-icon.svg
git commit -m "feat(discreet): neutral chrome, wrapper class, title + favicon swap"
```

---

## Task 6: Global `.discreet` skin (CSS)

Pure styling: when the `.discreet` wrapper is present, re-map the warm theme tokens to a neutral corporate grey/green palette and swap the display font to plain sans. Because the tokens cascade from the wrapper, descendants pick this up automatically. No structural change.

**Files:**
- Modify: `app/globals.css` (append at end)

- [ ] **Step 1: Append the skin**

```css
/* ── Discreet "Workspace" skin ───────────────────────────────────────────
   Scoped to the .discreet wrapper rendered by the (app) layout. Re-maps the
   warm brand tokens to a neutral spreadsheet-tool palette and neutralises the
   display font. Structural swaps (project table, spreadsheet) are separate. */
.discreet {
  --background: #ffffff;
  --foreground: #1f2933;
  --muted: #f4f5f7;
  --muted-foreground: #6b7280;
  --border: #d8dce1;
  --primary: #107c41;          /* spreadsheet green */
  --primary-foreground: #ffffff;
  --accent: #eef1f4;
  --accent-foreground: #1f2933;
  --ring: #107c41;
}
.discreet.dark {
  --background: #1b1d1f;
  --foreground: #e6e8ea;
  --muted: #26282b;
  --muted-foreground: #9aa0a6;
  --border: #3a3d41;
  --accent: #26282b;
  --accent-foreground: #e6e8ea;
}
/* Plain, work-like headings. */
.discreet .font-display {
  font-family: var(--font-sans-google), ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0;
}
```

- [ ] **Step 2: Verify build + manual check**

Run: `npx tsc --noEmit && npm run build`
Expected: clean. (CSS is presentational — verified via build + the manual checklist; no unit test.)

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(discreet): neutral workspace CSS skin"
```

---

## Task 7: Trips list → project table

**Files:**
- Create: `components/discreet/project-table.tsx`
- Test: `components/discreet/project-table.test.tsx`
- Modify: `app/(app)/trips/page.tsx`

- [ ] **Step 1: Write failing test for ProjectTable**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ProjectTable } from "@/components/discreet/project-table";

describe("ProjectTable", () => {
  it("renders one linked row per project", () => {
    render(
      <ProjectTable
        projects={[
          { id: "t1", name: "South Island", dateRange: "12–22 Jul 2026", status: "Planning", locations: 6 },
          { id: "t2", name: "Japan", dateRange: "Dates TBC", status: "Upcoming", locations: 3 },
        ]}
      />,
    );
    expect(screen.getByText("South Island")).toBeInTheDocument();
    expect(screen.getByText("Japan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /South Island/i })).toHaveAttribute("href", "/trips/t1");
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2
  });
});
```

- [ ] **Step 2: Run to verify fail** → FAIL.

- [ ] **Step 3: Implement `components/discreet/project-table.tsx`** (server presentational; rows link out)

```tsx
import Link from "next/link";
import { columnLetter } from "@/lib/discreet";

export interface ProjectRow {
  id: string;
  name: string;
  dateRange: string;
  status: string;
  locations: number;
}

const HEADERS = ["Project", "Status", "Schedule", "Items"];

export function ProjectTable({ projects }: { projects: ProjectRow[] }) {
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted text-left text-xs font-medium text-muted-foreground">
            {HEADERS.map((h, i) => (
              <th key={h} className="border border-border px-3 py-1.5 font-mono font-normal">
                <span className="mr-2 text-muted-foreground/60">{columnLetter(i)}</span>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} className="hover:bg-accent">
              <td className="border border-border px-3 py-1.5">
                <Link href={`/trips/${p.id}`} className="font-medium text-foreground hover:underline">
                  {p.name}
                </Link>
              </td>
              <td className="border border-border px-3 py-1.5 text-muted-foreground">{p.status}</td>
              <td className="border border-border px-3 py-1.5 font-mono text-muted-foreground">{p.dateRange}</td>
              <td className="border border-border px-3 py-1.5 font-mono text-right text-muted-foreground">{p.locations}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Branch the trips page**

In `app/(app)/trips/page.tsx`:
1. Imports: `import { getDiscreetState } from "@/lib/discreet-server";`, `import { ProjectTable, type ProjectRow } from "@/components/discreet/project-table";`, `import { formatDateRange } from "@/lib/dates";`.
2. After `const sorted = ...`:

```tsx
const { discreet } = await getDiscreetState();
if (discreet && trips.length > 0) {
  const projects: ProjectRow[] = sorted.map((trip) => ({
    id: trip.id,
    name: trip.name,
    status: describePhase({ startDate: trip.startDate, endDate: trip.endDate, today }).label,
    dateRange: trip.startDate && trip.endDate ? formatDateRange(trip.startDate, trip.endDate) : "Dates TBC",
    locations: trip._count.stops,
  }));
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Projects</h1>
      <ProjectTable projects={projects} />
    </div>
  );
}
```

> NOTE: confirm `describePhase(...)` returns an object with a `.label` string (used by `TripCard phase=` already). If it returns a string directly, use it as-is.

- [ ] **Step 5: Run to verify pass** → `npx vitest run components/discreet/project-table.test.tsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git add components/discreet/project-table.tsx components/discreet/project-table.test.tsx "app/(app)/trips/page.tsx"
git commit -m "feat(discreet): trips list renders as a project table"
```

---

## Task 8: Stop spreadsheet (read-only) + plan page branch

Build the spreadsheet with all cells **read-only** first; editing is layered on in Tasks 9–11.

**Files:**
- Create: `components/discreet/stop-spreadsheet.tsx`
- Test: `components/discreet/stop-spreadsheet.test.tsx`
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StopSpreadsheet } from "@/components/discreet/stop-spreadsheet";
import type { SheetRow } from "@/lib/discreet";

vi.mock("@/server/actions/stops", () => ({ setStopNotes: vi.fn(), setStopNights: vi.fn(), setStopDates: vi.fn() }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));

const rows: SheetRow[] = [
  { id: "s1", location: "Queenstown", country: "NZ", arriveDate: "2026-07-12", departDate: "2026-07-15", nights: 3, scheduled: true, pinned: false, transportInLabel: "Flight", stayLabel: "Hotel A", estCostMinor: 42000, notes: "arrive pm" },
  { id: "s2", location: "Milford", country: "NZ", arriveDate: null, departDate: null, nights: 1, scheduled: false, pinned: false, transportInLabel: "Car", stayLabel: null, estCostMinor: 0, notes: null },
];

describe("StopSpreadsheet (read-only)", () => {
  it("renders a row per stop with derived values", () => {
    render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
    expect(screen.getByText("Queenstown")).toBeInTheDocument();
    expect(screen.getByText("Milford")).toBeInTheDocument();
    expect(screen.getByText("Flight")).toBeInTheDocument();
    expect(screen.getByText(/42|420\.00|A\$/)).toBeInTheDocument(); // formatted cost
  });

  it("blanks dates for rough stops", () => {
    render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
    // the Milford row shows an em dash for its arrive cell
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run to verify fail** → FAIL.

- [ ] **Step 3: Implement read-only `components/discreet/stop-spreadsheet.tsx`**

```tsx
"use client";

import * as React from "react";
import { columnLetter, type SheetRow } from "@/lib/discreet";
import { formatMoney } from "@/lib/money";
import { formatLongDate } from "@/lib/dates";

const COLUMNS = ["Location", "Country", "Arrive", "Depart", "Nights", "Transport", "Stay", "Est. cost", "Notes"];

const cellBase = "border border-border px-2 py-1 align-top text-sm";

export interface StopSpreadsheetProps {
  tripId: string;
  rows: SheetRow[];
  homeCurrency: string;
}

export function StopSpreadsheet({ tripId, rows, homeCurrency }: StopSpreadsheetProps) {
  return (
    <div className="flex flex-col">
      {/* faux menu strip — purely cosmetic */}
      <div className="flex gap-4 rounded-t border border-b-0 border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
        {["File", "Edit", "View", "Insert", "Format", "Data"].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="overflow-x-auto rounded-b border border-border">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-muted text-left text-xs text-muted-foreground">
              <th className="border border-border px-2 py-1 font-mono font-normal" />
              {COLUMNS.map((c, i) => (
                <th key={c} className="border border-border px-2 py-1 font-mono font-normal">
                  <span className="mr-2 text-muted-foreground/60">{columnLetter(i)}</span>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className="hover:bg-accent/60">
                <td className="border border-border bg-muted px-2 py-1 text-center font-mono text-xs text-muted-foreground">{i + 1}</td>
                <td className={`${cellBase} font-medium text-foreground`}>
                  {row.location}
                  {row.pinned && <span title="Locked" className="ml-1 text-muted-foreground">📌</span>}
                </td>
                <td className={`${cellBase} text-muted-foreground`}>{row.country ?? "—"}</td>
                <td className={`${cellBase} font-mono`}>{row.arriveDate ? formatLongDate(row.arriveDate) : "—"}</td>
                <td className={`${cellBase} font-mono`}>{row.departDate ? formatLongDate(row.departDate) : "—"}</td>
                <td className={`${cellBase} font-mono`}>{row.nights}</td>
                <td className={`${cellBase} text-muted-foreground`}>{row.transportInLabel ?? "—"}</td>
                <td className={`${cellBase} text-muted-foreground`}>{row.stayLabel ?? "—"}</td>
                <td className={`${cellBase} font-mono text-right`}>{row.estCostMinor > 0 ? formatMoney(row.estCostMinor, homeCurrency) : "—"}</td>
                <td className={`${cellBase} text-muted-foreground`}>{row.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

> The `tripId` prop is unused until Task 9 (editing). Keep it in the signature now to avoid churn; the implementer may add an eslint-disable for the unused arg only if the linter complains, then remove it in Task 9.

- [ ] **Step 4: Branch the plan page**

In `app/(app)/trips/[tripId]/plan/page.tsx`:
1. Imports: `getDiscreetState`, `StopSpreadsheet`, `buildStopSheetRows`.
2. After the data is fetched and `costsByOwnerId` is built, compute per-stop estimated cost in home minor and the rows. Estimated home minor for a cost = `rateToHome ? round(estimatedMinor * rateToHome) : estimatedMinor`. Sum each stop's accommodation costs:

```tsx
const { discreet } = await getDiscreetState();
if (discreet) {
  const costHomeMinorByStopId: Record<string, number> = {};
  for (const s of stops) {
    let sum = 0;
    for (const acc of s.accommodations) {
      for (const c of costsByOwnerId.get(acc.id) ?? []) {
        sum += c.rateToHome ? Math.round(c.estimatedMinor * c.rateToHome) : c.estimatedMinor;
      }
    }
    costHomeMinorByStopId[s.id] = sum;
  }
  const rows = buildStopSheetRows({
    stops: stops.map((s) => ({
      id: s.id, name: s.name, country: s.country,
      arriveDate: s.arriveDate, departDate: s.departDate,
      nights: s.nights, pinned: s.pinned, notes: s.notes,
      accommodations: s.accommodations.map((a) => ({ name: a.name })),
    })),
    transports: transports.map((t) => ({ mode: t.mode, fromStopId: t.fromStopId, toStopId: t.toStopId })),
    costHomeMinorByStopId,
    homeCurrency: trip?.homeCurrency ?? "AUD",
  });
  return (
    <div className="flex flex-col gap-6">
      <StopSpreadsheet tripId={tripId} rows={rows} homeCurrency={trip?.homeCurrency ?? "AUD"} />
    </div>
  );
}
```

Place this branch BEFORE the existing `return (<div>...<ItineraryManager/>...)`. The non-discreet path is unchanged.

- [ ] **Step 5: Run to verify pass** → `npx vitest run components/discreet/stop-spreadsheet.test.tsx` → PASS. Then `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add components/discreet/stop-spreadsheet.tsx components/discreet/stop-spreadsheet.test.tsx "app/(app)/trips/[tripId]/plan/page.tsx"
git commit -m "feat(discreet): read-only stop spreadsheet + plan-page branch"
```

---

## Task 9: Editable Notes cell

Introduce a reusable inline-edit cell and wire Notes to `setStopNotes` with optimistic update + revert-on-error toast.

**Files:**
- Modify: `components/discreet/stop-spreadsheet.tsx`
- Modify: `components/discreet/stop-spreadsheet.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { fireEvent, waitFor } from "@testing-library/react";
import { setStopNotes } from "@/server/actions/stops";
import { toast } from "@/components/ui/use-toast";

it("edits notes inline and calls setStopNotes", async () => {
  (setStopNotes as Mock).mockResolvedValue({ success: true });
  render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
  fireEvent.click(screen.getByText("arrive pm"));          // enter edit
  const input = screen.getByDisplayValue("arrive pm");
  fireEvent.change(input, { target: { value: "arrive 6pm" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(setStopNotes).toHaveBeenCalledWith("s1", "arrive 6pm"));
});

it("reverts + toasts when the notes save fails", async () => {
  (setStopNotes as Mock).mockResolvedValue({ success: false, errors: {} });
  render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
  fireEvent.click(screen.getByText("arrive pm"));
  const input = screen.getByDisplayValue("arrive pm");
  fireEvent.change(input, { target: { value: "x" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
  expect(screen.getByText("arrive pm")).toBeInTheDocument(); // reverted
});
```

- [ ] **Step 2: Run to verify fail** → FAIL.

- [ ] **Step 3: Implement editable Notes**

Add local row state and an `EditableTextCell` to `stop-spreadsheet.tsx`:

```tsx
import { setStopNotes } from "@/server/actions/stops";
import { toast } from "@/components/ui/use-toast";

function EditableTextCell({
  value, onSave, className,
}: { value: string | null; onSave: (next: string) => Promise<boolean>; className?: string }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? "");
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => { setDraft(value ?? ""); }, [value]);

  function commit() {
    setEditing(false);
    if ((value ?? "") === draft) return;
    startTransition(async () => {
      const ok = await onSave(draft);
      if (!ok) setDraft(value ?? "");
    });
  }

  if (editing) {
    return (
      <td className={className}>
        <input
          autoFocus
          value={draft}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
          className="w-full bg-background px-1 outline-none ring-1 ring-primary"
        />
      </td>
    );
  }
  return (
    <td className={`${className} cursor-text`} onClick={() => setEditing(true)}>
      {value ?? "—"}
    </td>
  );
}
```

Convert the table to use local state so optimistic edits render:

```tsx
const [data, setData] = React.useState(rows);
React.useEffect(() => setData(rows), [rows]);

function patchRow(id: string, patch: Partial<SheetRow>) {
  setData((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r)));
}

async function saveNotes(id: string, next: string): Promise<boolean> {
  patchRow(id, { notes: next === "" ? null : next });
  const r = await setStopNotes(id, next);
  if (!r.success) {
    toast({ variant: "destructive", title: "Couldn't save that change." });
    return false;
  }
  return true;
}
```

Replace the Notes `<td>` in the row map with:

```tsx
<EditableTextCell
  value={row.notes}
  onSave={(next) => saveNotes(row.id, next)}
  className={`${cellBase} text-muted-foreground`}
/>
```

(Map over `data`, not `rows`, in the tbody.)

- [ ] **Step 4: Run to verify pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/discreet/stop-spreadsheet.tsx components/discreet/stop-spreadsheet.test.tsx
git commit -m "feat(discreet): inline-editable notes cell"
```

---

## Task 10: Editable Nights cell

**Files:**
- Modify: `components/discreet/stop-spreadsheet.tsx`
- Modify: `components/discreet/stop-spreadsheet.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { setStopNights } from "@/server/actions/stops";

it("edits nights inline and calls setStopNights", async () => {
  (setStopNights as Mock).mockResolvedValue({ success: true });
  render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
  // nights cell for Milford (rough) shows "1"
  fireEvent.click(screen.getByText("1"));
  const input = screen.getByDisplayValue("1");
  fireEvent.change(input, { target: { value: "4" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(setStopNights).toHaveBeenCalledWith("s2", 4));
});

it("shows the ripple heads-up toast on conflicts", async () => {
  (setStopNights as Mock).mockResolvedValue({ success: true, conflicts: [{ stopId: "x" }] });
  render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
  fireEvent.click(screen.getByText("3")); // Queenstown nights (scheduled)
  const input = screen.getByDisplayValue("3");
  fireEvent.change(input, { target: { value: "5" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/pinned/i) })));
});
```

- [ ] **Step 2: Run to verify fail** → FAIL.

- [ ] **Step 3: Implement editable Nights**

Add an `EditableNumberCell` (mirrors `EditableTextCell` but `type="number"`, `min={0}`, parses int) and:

```tsx
import { setStopNights } from "@/server/actions/stops";

async function saveNights(id: string, next: number): Promise<boolean> {
  const prev = data.find((r) => r.id === id)?.nights ?? 0;
  patchRow(id, { nights: next });
  const r = await setStopNights(id, next);
  if (!r.success) {
    toast({ variant: "destructive", title: "Couldn't update nights." });
    patchRow(id, { nights: prev });
    return false;
  }
  if (r.conflicts?.length) {
    toast({ title: "Heads up — earlier stops run past a pinned date; the pin was kept." });
  }
  return true;
}
```

Replace the Nights `<td>` with the editable number cell wired to `saveNights(row.id, n)`.

- [ ] **Step 4: Run to verify pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/discreet/stop-spreadsheet.tsx components/discreet/stop-spreadsheet.test.tsx
git commit -m "feat(discreet): inline-editable nights cell with ripple toast"
```

---

## Task 11: Editable Dates cells (scheduled only) + conflicts

**Files:**
- Modify: `components/discreet/stop-spreadsheet.tsx`
- Modify: `components/discreet/stop-spreadsheet.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { setStopDates } from "@/server/actions/stops";

it("edits a scheduled stop's depart date via setStopDates", async () => {
  (setStopDates as Mock).mockResolvedValue({ success: true });
  render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
  // click the formatted depart date for Queenstown
  fireEvent.click(screen.getByText(formatLongDateForTest("2026-07-15")));
  const input = screen.getByDisplayValue("2026-07-15");
  fireEvent.change(input, { target: { value: "2026-07-16" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(setStopDates).toHaveBeenCalledWith("s1", { arriveDate: "2026-07-12", departDate: "2026-07-16" }));
});

it("does not make rough-stop date cells editable", () => {
  render(<StopSpreadsheet tripId="t1" rows={rows} homeCurrency="AUD" />);
  // Milford (rough) arrive cell is an em dash and clicking it yields no input
  const dashes = screen.getAllByText("—");
  fireEvent.click(dashes[0]);
  expect(screen.queryByDisplayValue("")).not.toBeInTheDocument();
});
```

> The test imports `formatLongDate` from `@/lib/dates` as `formatLongDateForTest` (or just call `formatLongDate`). Adjust to the real helper.

- [ ] **Step 2: Run to verify fail** → FAIL.

- [ ] **Step 3: Implement editable Dates**

Add an `EditableDateCell` that:
- For `scheduled` rows: shows `formatLongDate(value)`; on click renders `<input type="date" value={isoValue}>`; commit calls `onSave(iso)`.
- For non-scheduled rows (or null dates): renders a plain read-only `—` (no edit affordance).

```tsx
import { setStopDates } from "@/server/actions/stops";

async function saveArrive(row: SheetRow, nextISO: string): Promise<boolean> {
  return saveDates(row, { arriveDate: nextISO, departDate: row.departDate as string });
}
async function saveDepart(row: SheetRow, nextISO: string): Promise<boolean> {
  return saveDates(row, { arriveDate: row.arriveDate as string, departDate: nextISO });
}
async function saveDates(row: SheetRow, dates: { arriveDate: string; departDate: string }): Promise<boolean> {
  const prev = { arriveDate: row.arriveDate, departDate: row.departDate };
  patchRow(row.id, dates);
  const r = await setStopDates(row.id, dates);
  if (!r.success) {
    toast({ variant: "destructive", title: "Couldn't update dates." });
    patchRow(row.id, prev);
    return false;
  }
  if (r.conflicts?.length) {
    toast({ title: "Heads up — earlier stops run past a pinned date; the pin was kept." });
  }
  return true;
}
```

Wire the Arrive/Depart `<td>`s: editable date cell when `row.scheduled`, otherwise the existing read-only `—`.

- [ ] **Step 4: Run to verify pass** → PASS. Then run the whole spreadsheet test file: `npx vitest run components/discreet/stop-spreadsheet.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/discreet/stop-spreadsheet.tsx components/discreet/stop-spreadsheet.test.tsx
git commit -m "feat(discreet): inline-editable dates with ripple conflicts"
```

---

## Task 12: Glossary + responsive polish

**Files:**
- Modify: `CONTEXT.md`
- Modify: `components/discreet/stop-spreadsheet.tsx` (sticky first data column on small screens)

- [ ] **Step 1: Add the glossary entry**

In `CONTEXT.md`, add to the glossary (alphabetical or alongside related UI terms):

```markdown
- **Discreet mode** — A device-local display mode (stored in a cookie, per browser) that disguises the app as a generic spreadsheet/"workspace" tool so a trip can be planned unobtrusively on a work screen. The plan view becomes an editable stop-by-stop spreadsheet. It changes presentation only — never the underlying trip data, and it is never shared with other trip members.
```

- [ ] **Step 2: Sticky Location column on mobile**

In `stop-spreadsheet.tsx`, make the row-number + Location cells sticky within the horizontal scroll container so the sheet stays legible on a phone. Add to the row-number `<td>`/`<th>` and the Location `<td>`/header: `sticky left-0 z-10 bg-background` (number cell keeps its `bg-muted`). Verify no overlap glitches.

- [ ] **Step 3: Verify**

Run: `npx vitest run components/discreet/stop-spreadsheet.test.tsx && npx tsc --noEmit`
Expected: PASS / clean.

- [ ] **Step 4: Commit**

```bash
git add CONTEXT.md components/discreet/stop-spreadsheet.tsx
git commit -m "docs(discreet): glossary entry + sticky location column"
```

---

## Final verification (after all tasks)

- [ ] Full suite: `npx vitest run` → all green.
- [ ] Types: `npx tsc --noEmit` → clean.
- [ ] Lint: `npm run lint` → no new warnings.
- [ ] Build: `npm run build` → succeeds.
- [ ] Manual sanity (dev server): toggle discreet on in the account menu → chrome goes neutral, tab title + favicon swap, trips list becomes a project table, plan page becomes the spreadsheet; edit a Notes/Nights/Date cell and confirm it persists; toggle off → everything returns to normal TEEPEE. Confirm `/signin` is unaffected.
- [ ] Dispatch final whole-branch code review, then use **superpowers:finishing-a-development-branch**.

## Self-review notes (spec coverage)

- Trigger model (device-local toggle, account menu) → Tasks 3–5. ✅
- Global skin (chrome + CSS, confined to `(app)`) → Tasks 5–6. ✅
- Structural swaps (trips list, plan page) → Tasks 7–8. ✅
- Spreadsheet rows = stops; columns as specified → Tasks 2, 8. ✅
- Editable Nights/Notes/Dates (Location read-only); reuse `setStopDates` ripple + conflict toast → Tasks 1, 9–11. ✅
- Customizable label + title/favicon swap → Tasks 2, 4, 5. ✅
- No DB/schema change; public routes untouched; theme no-flash script untouched → architecture. ✅
- Glossary entry; no ADR (reversible) → Task 12. ✅
