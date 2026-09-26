# Beta feedback fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the eleven "unambiguous fixes" Feedback notes written on beta on 2026-09-26, each as its own reviewable commit carrying a `Resolves-Feedback:` trailer.

**Architecture:** Ten independent tasks, each touching one surface: a lib rule (`orderDayEntries`), the rail (`trip-nav` / `mobile-tab-bar`), Next metadata (trip layout + subpages), the home map's colour source, the shared Button primitive, the trip home's banner stacking, the Item dialog (delete + date default), the Days toolbar, and the day page's Timeline gaining an in-place edit island. Nothing changes the database. Tests are colocated `*.test.ts(x)` files run by vitest with jsdom.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before touching metadata — this Next differs from training data), React 19, TypeScript, Tailwind v4, vitest + Testing Library, Prisma (read-only here), Radix dialogs, Leaflet.

**Spec:** `docs/specs/2026-09-26-beta-feedback-fixes.md`

## Global Constraints

- Branch: `fix/beta-feedback-fixes-2026-09-26` (already checked out, cut from `beta`). Never commit to `beta`, `main` or `master`. Never deploy. Never run `npm run feedback:pull` or `npm run feedback:resolve` (they touch production).
- Vocabulary is `CONTEXT.md`: Trip, Stop, Item, "thing to do", Transport, Accommodation, Traveller, Days (the calendar), Money (the budget). Never label an Item "activity" or "event" in UI copy.
- Every commit that closes a note ends with the trailer lines shown in that task, then `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Do not hand-edit `docs/feedback/inbox.md`.
- `npx vitest run <file>` for the task's files, then before each commit: `npx tsc --noEmit` clean. Run `npm run lint` at the end of the plan (Task 11).
- `CLAUDE.md` shows as modified in `git status` (a block `next dev` re-adds). Do not stage it.
- Mocks in tests follow the file's existing pattern; when a test file already mocks `@/server/actions/items`, add the new action to that same mock rather than a second `vi.mock`.

## Review Focus

- **A Transport with a departure instant but no `depTimeLabel`** (e.g. `depAt` null → dropped earlier, or label undefined) must stay in the untimed top-of-day block, never throw or sort as `"undefined"`. Test in Task 1.
- **A trip that has vanished between layout render and `generateMetadata`** must give `{}` (root "Teepee" title), not throw. Test in Task 3.
- **The date field must not be overwritten by a Stop change once the Traveller has typed a date.** Test in Task 8.
- **`Button asChild` while loading must not wrap its child** (Radix Slot needs exactly one child; wrapping would put the href on a span). Test in Task 5.
- **A day URL like `/trips/t1/daybook`** must not light "Days" — only `/trips/t1/day` and `/trips/t1/day/…`. Test in Task 2.

---

### Task 1: Transport slots into the day by its departure time

**Files:**
- Modify: `lib/itinerary.ts:455-508` (`TIMED_RANK`, `timedKey`, `orderDayEntries`)
- Test: `lib/itinerary.test.ts` (existing `describe("orderDayEntries")` at ~line 704)

**Interfaces:**
- Consumes: `DayPlan`, `DayEntry`, `TransportDepartureEntry.depTimeLabel`, `TransportArrivalEntry.arrTimeLabel` (all already in `lib/itinerary.ts`).
- Produces: unchanged signature `orderDayEntries(day: DayPlan): OrderedDay`. New ordering contract (documented in the docblock): untimed check-outs → transports with no time label → the timed merge (timed check-outs, timed transports by dep/arr label, timed items, timed check-ins, by HH:MM; ties: check-out, transport-departure, item, transport-arrival, check-in) → untimed check-ins placed **immediately after the last transport entry of the day** (timed or not), or before the timed merge when the day has no transport.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("orderDayEntries", ...)` block in `lib/itinerary.test.ts`, using the file's `makeItem`, `makeTransport`, `makeAccom`, `PARIS`, `ROME` helpers (check their exact names at the top of the file; Paris is `Europe/Paris`, so `08:00Z` is `10:00` local in July):

```ts
  it("slots a timed transport among timed items by its departure time (breakfast 09:00 before a 14:00 train)", () => {
    const plans = buildItinerary({
      ...BASE,
      items: [
        makeItem({ id: "item-bfast", date: "2026-07-05", startTime: "09:00", title: "Breakfast" }),
        makeItem({ id: "item-dinner", date: "2026-07-05", startTime: "20:00", title: "Dinner" }),
      ],
      transports: [
        makeTransport({
          id: "t-train",
          mode: "TRAIN",
          fromStopId: "stop-paris",
          toStopId: "stop-rome",
          depAt: new Date("2026-07-05T12:00:00Z"), // 14:00 Europe/Paris
        }),
      ],
      accommodations: [],
    });
    const day = plans.find((d) => d.dateISO === "2026-07-05")!;
    const order = orderDayEntries(day).entries.map((e) =>
      e.kind === "item" ? e.item.id : e.kind,
    );
    expect(order).toEqual(["item-bfast", "transport-departure", "item-dinner"]);
  });

  it("keeps an untimed check-in right after the day's transport even when that transport is timed", () => {
    const plans = buildItinerary({
      ...BASE,
      items: [
        makeItem({ id: "item-bfast", date: "2026-07-05", startTime: "09:00", title: "Breakfast" }),
        makeItem({ id: "item-dinner", date: "2026-07-05", startTime: "20:00", title: "Dinner" }),
      ],
      transports: [
        makeTransport({
          id: "t-train",
          mode: "TRAIN",
          fromStopId: "stop-paris",
          toStopId: "stop-rome",
          depAt: new Date("2026-07-05T12:00:00Z"),
        }),
      ],
      accommodations: [
        makeAccom({ id: "acc-in", stopId: "stop-rome", checkIn: "2026-07-05", checkOut: "2026-07-10", checkInTime: null }),
      ],
    });
    const day = plans.find((d) => d.dateISO === "2026-07-05")!;
    const kinds = orderDayEntries(day).entries.map((e) => (e.kind === "item" ? e.item.id : e.kind));
    expect(kinds).toEqual(["item-bfast", "transport-departure", "accommodation-checkin", "item-dinner"]);
  });

  it("leaves a transport with no time label in the top-of-day block", () => {
    // Build a day by hand: a departure entry whose depTimeLabel is undefined.
    const day: DayPlan = {
      dateISO: "2026-07-05",
      stop: null,
      timedItems: [
        { kind: "item", item: { id: "item-a", title: "A", category: "OTHER", date: "2026-07-05", startTime: "09:00" } },
      ],
      untimedItems: [],
      transportEntries: [
        {
          kind: "transport-departure",
          transport: { id: "t-x", mode: "BUS" },
          arrivesSameDay: false,
        },
      ],
      accommodationEntries: [],
    };
    const kinds = orderDayEntries(day).entries.map((e) => (e.kind === "item" ? e.item.id : e.kind));
    expect(kinds).toEqual(["transport-departure", "item-a"]);
  });
```

If `DayPlan` has fields beyond those shown (check the interface at `lib/itinerary.ts:131`), add them to the hand-built fixture so it type-checks.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/itinerary.test.ts -t "orderDayEntries"`
Expected: the first two new tests FAIL (transport comes first); the third PASSES already (that is fine — it pins current behaviour).

- [ ] **Step 3: Implement**

Replace `TIMED_RANK`, `timedKey` and `orderDayEntries` in `lib/itinerary.ts` with:

```ts
/** Tie-break rank inside the timed merge: leave before go before do before arrive before settle. */
const TIMED_RANK: Record<string, number> = {
  "accommodation-checkout": 0,
  "transport-departure": 1,
  item: 2,
  "transport-arrival": 3,
  "accommodation-checkin": 4,
};

function timedKey(entry: DayEntry): string | null {
  switch (entry.kind) {
    case "item":
      return entry.item.startTime ?? null;
    case "accommodation-checkin":
      return entry.accommodation.checkInTime ?? null;
    case "accommodation-checkout":
      return entry.accommodation.checkOutTime ?? null;
    case "transport-departure":
      return entry.depTimeLabel ?? null;
    case "transport-arrival":
      return entry.arrTimeLabel ?? null;
    default:
      return null;
  }
}

const isTransport = (e: DayEntry) => e.kind === "transport-departure" || e.kind === "transport-arrival";

/**
 * Flatten a DayPlan into reading order (CONTEXT.md "Accommodation"):
 * untimed check-outs → transports with no time → the timed merge (timed
 * items, check-ins/outs and transports by HH:MM) → with untimed check-ins
 * placed right after the day's last transport entry (a check-in follows
 * that day's Transport whether or not the Transport has a time), or before
 * the timed merge when the day has no transport at all. Untimed items stay
 * a separate "Anytime" bucket.
 */
export function orderDayEntries(day: DayPlan): OrderedDay {
  const checkouts = day.accommodationEntries.filter((e) => e.kind === "accommodation-checkout");
  const checkins = day.accommodationEntries.filter((e) => e.kind === "accommodation-checkin");
  const untimedTransports = day.transportEntries.filter((e) => timedKey(e) === null);
  const timedTransports = day.transportEntries.filter((e) => timedKey(e) !== null);

  const timed: DayEntry[] = [
    ...checkouts.filter((e) => e.accommodation.checkOutTime),
    ...timedTransports,
    ...day.timedItems,
    ...checkins.filter((e) => e.accommodation.checkInTime),
  ].sort((a, b) => {
    const ta = timedKey(a)!;
    const tb = timedKey(b)!;
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (TIMED_RANK[a.kind] ?? 2) - (TIMED_RANK[b.kind] ?? 2);
  });

  const untimedCheckins = checkins.filter((e) => !e.accommodation.checkInTime);
  const entries: DayEntry[] = [
    ...checkouts.filter((e) => !e.accommodation.checkOutTime),
    ...untimedTransports,
  ];
  const lastTimedTransport = timed.map(isTransport).lastIndexOf(true);
  if (lastTimedTransport === -1) {
    entries.push(...untimedCheckins, ...timed);
  } else {
    entries.push(
      ...timed.slice(0, lastTimedTransport + 1),
      ...untimedCheckins,
      ...timed.slice(lastTimedTransport + 1),
    );
  }
  return { entries, anytime: day.untimedItems };
}
```

- [ ] **Step 4: Run the whole itinerary and timeline suites**

Run: `npx vitest run lib/itinerary.test.ts components/trip/timeline.test.tsx components/trip/agenda-view.test.tsx`
Expected: all PASS, including the pre-existing "untimed check-in after transport" test.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary.ts lib/itinerary.test.ts
git commit -m "fix(days): a timed Transport sits in the day at its departure time

A Transport was always placed above every timed entry regardless of its
time, so a 14:00 train read as the first thing of the day. Timed transports
now join the timed merge; an untimed check-in still follows the day's
Transport, as CONTEXT.md 'Accommodation' says.

Resolves-Feedback: cmuhtad17000404l5sab0wtw1

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: "Today" leaves the rail; Days is active on a day page

**Files:**
- Modify: `components/trip/trip-nav.tsx` (remove the Today item; add `isDaysActive`)
- Modify: `components/trip/mobile-tab-bar.tsx:37-40` (Days uses `isDaysActive`)
- Modify: `components/command-palette.tsx:28` (drop the Today "Go to" entry)
- Modify: `lib/offline.ts:41` (drop `${base}/today` from the warm list; it is a redirect)
- Keep: `app/(app)/trips/[tripId]/today/page.tsx` (redirect stays for old links)
- Test: `components/trip/trip-nav.test.tsx`, `components/trip/mobile-tab-bar.test.tsx`, `lib/offline.test.ts` (if it lists the paths), `components/command-palette.test.tsx` (if it asserts the page list)

**Interfaces:**
- Produces: `export function isDaysActive(daysHref: string, pathname: string, base: string): boolean` in `trip-nav.tsx` — true for the calendar route (via `isNavActive`) and for `${base}/day` or `${base}/day/…`.

- [ ] **Step 1: Write the failing tests**

In `components/trip/trip-nav.test.tsx` add (inside the main `describe`, following the file's `mockUsePathname.mockReturnValue(...)` + `render(<TripNav tripId="t1" />)` pattern):

```tsx
  it("has no Today entry — Home is the Today view while Travelling (ADR 0010)", () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    const { container } = render(<TripNav tripId="t1" />);
    expect(container.querySelector('a[href="/trips/t1/today"]')).toBeNull();
    expect(screen.queryByText("Today")).toBeNull();
  });

  it("gives Days aria-current=page on a single day page", () => {
    mockUsePathname.mockReturnValue("/trips/t1/day/2026-12-04");
    render(<TripNav tripId="t1" />);
    expect(screen.getByRole("link", { name: "Days" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("isDaysActive matches /day and /day/… but not a sibling route that merely starts with 'day'", () => {
    expect(isDaysActive("/trips/t1/calendar", "/trips/t1/day/2026-12-04", "/trips/t1")).toBe(true);
    expect(isDaysActive("/trips/t1/calendar", "/trips/t1/day", "/trips/t1")).toBe(true);
    expect(isDaysActive("/trips/t1/calendar", "/trips/t1/calendar", "/trips/t1")).toBe(true);
    expect(isDaysActive("/trips/t1/calendar", "/trips/t1/daybook", "/trips/t1")).toBe(false);
    expect(isDaysActive("/trips/t1/calendar", "/trips/t1/plan", "/trips/t1")).toBe(false);
  });
```

Import `screen` from Testing Library and `isDaysActive` from `./trip-nav` at the top.

In `components/trip/mobile-tab-bar.test.tsx`, replace the test titled `"marks nothing as current on an unlisted trip route (day view) — Home does not light up"` with:

```tsx
  it("marks Days as current on a single day page, and not Home", () => {
    mockUsePathname.mockReturnValue("/trips/t1/day/2026-12-04");
    render(<MobileTabBar tripId="t1" />);
    expect(screen.getByRole("link", { name: "Days" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });
```

(Keep the file's existing mock names; if the pathname mock is named differently, use that name.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/trip/trip-nav.test.tsx components/trip/mobile-tab-bar.test.tsx`
Expected: the new tests FAIL (Today link present / Days not current / `isDaysActive` not exported).

- [ ] **Step 3: Implement**

In `components/trip/trip-nav.tsx`, add after `isNavActive`:

```ts
/**
 * Days is the calendar route AND every single-day page: /trips/:id/day/:date
 * is one day of the Days view, so the rail keeps Days lit there.
 */
export function isDaysActive(daysHref: string, pathname: string, base: string): boolean {
  if (isNavActive(daysHref, pathname, base)) return true;
  const dayBase = `${base}/day`;
  return pathname === dayBase || pathname.startsWith(dayBase + "/");
}
```

In `TripNav`: delete `const todayHref = ...` and the `{ href: todayHref, label: "Today", ... }` item; change the Days item to `match: (p) => isDaysActive(byLabel("Days").href, p, base)`. Update the component docblock's rail ordering to "Home, Plan, Days, Money, Wishlist, More" and add one line: "No Today slot — ADR 0010: the Today view is the Travelling-phase Home."

In `components/trip/mobile-tab-bar.tsx`: import `isDaysActive` alongside `isNavActive`; change the Days item to `match: (p) => isDaysActive(byLabel("Days").href, p, base)`.

In `components/command-palette.tsx`: remove the `{ label: "Today", href: `${base}/today` }` line.

In `lib/offline.ts`: remove `` `${base}/today` `` from the `paths` array.

- [ ] **Step 4: Run the affected suites**

Run: `npx vitest run components/trip components/command-palette.test.tsx lib/offline.test.ts lib/help-guide.test.ts`
Expected: PASS. If `lib/offline.test.ts` or the command-palette test asserts the exact old path list, update that expectation to drop `/today`.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`

```bash
git add components/trip/trip-nav.tsx components/trip/trip-nav.test.tsx components/trip/mobile-tab-bar.tsx components/trip/mobile-tab-bar.test.tsx components/command-palette.tsx lib/offline.ts
git add lib/offline.test.ts components/command-palette.test.tsx 2>/dev/null
git commit -m "fix(rail): drop the Today entry; Days stays lit on a single day page

The Today route has only redirected to the trip home since ADR 0010 made
the Travelling-phase Home the Today view, so the rail entry was a link to
nowhere new. Days now matches /trips/:id/day/:date as well as the calendar.

Resolves-Feedback: cmuhs3si2000104l51ck81ibo
Resolves-Feedback: cmuhsf6jo000104l6b4hlz1if

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Tab titles name the page and the Trip

**Files:**
- Create: `lib/page-title.ts`, `lib/page-title.test.ts`
- Modify: `app/(app)/trips/[tripId]/layout.tsx` (add `generateMetadata`)
- Modify: `app/(app)/trips/[tripId]/layout.test.tsx` (test it)
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx` (add `generateMetadata`)
- Modify: `app/(app)/trips/[tripId]/help/page.tsx:5-8` (title "Help")
- Modify: add `export const metadata` to each of `app/(app)/trips/[tripId]/{plan,calendar,budget,summary,wishlist,journal,checklists,files,activity,settings,compare,print}/page.tsx`

**Interfaces:**
- Produces: `tripTitle(name: string): { default: string; template: string }` and `dayTitle(dateISO: string): string` in `lib/page-title.ts`.

Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md` (section "template") first. The rule that matters: a layout's `title.default` is itself augmented by the *closest parent* template (root: `%s · Teepee`), while a child page's `title` is augmented only by the closest parent template — the trip layout's — so that template must end in `· Teepee` itself.

- [ ] **Step 1: Write the failing tests**

`lib/page-title.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tripTitle, dayTitle } from "./page-title";

describe("tripTitle", () => {
  it("defaults to the trip name (root template adds · Teepee) and templates subpages page-first", () => {
    expect(tripTitle("Christmas in Europe 2026")).toEqual({
      default: "Christmas in Europe 2026",
      template: "%s · Christmas in Europe 2026 · Teepee",
    });
  });
  it("trims whitespace so a padded name never yields 'Days ·  Name'", () => {
    expect(tripTitle("  Europe  ").default).toBe("Europe");
  });
});

describe("dayTitle", () => {
  it("is the short in-trip day label", () => {
    expect(dayTitle("2026-12-10")).toBe("Thu 10 Dec");
  });
});
```

In `app/(app)/trips/[tripId]/layout.test.tsx` add (after the existing `const { default: TripLayout } = await import("./layout");` line, extend to `const { default: TripLayout, generateMetadata } = await import("./layout");`):

```tsx
describe("generateMetadata", () => {
  it("titles the trip home with the trip name and subpages page-first", async () => {
    mockDb.trip.findUnique.mockResolvedValueOnce({ name: "Test Trip" });
    const md = await generateMetadata({ params: Promise.resolve({ tripId: "trip-1" }) });
    expect(md).toEqual({
      title: { default: "Test Trip", template: "%s · Test Trip · Teepee" },
    });
  });

  it("returns no title when the trip is gone, so the root 'Teepee' stands", async () => {
    mockDb.trip.findUnique.mockResolvedValueOnce(null);
    const md = await generateMetadata({ params: Promise.resolve({ tripId: "trip-1" }) });
    expect(md).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/page-title.test.ts "app/(app)/trips/[tripId]/layout.test.tsx"`
Expected: FAIL (module not found / `generateMetadata` undefined).

- [ ] **Step 3: Implement**

`lib/page-title.ts`:

```ts
import { formatDayLabel } from "@/lib/dates";

/**
 * Browser-tab titles are page-first: "Days · Trip name · Teepee". The root
 * layout's template is "%s · Teepee"; a trip layout's `default` is augmented
 * by that, while its `template` is what the trip's subpages are augmented
 * by (and only by — Next applies the closest template), so it carries the
 * app name itself.
 */
export function tripTitle(name: string): { default: string; template: string } {
  const clean = name.trim();
  return { default: clean, template: `%s · ${clean} · Teepee` };
}

/** Single day page title, e.g. "Thu 10 Dec" — the year is in the trip name's context. */
export function dayTitle(dateISO: string): string {
  return formatDayLabel(dateISO);
}
```

In `app/(app)/trips/[tripId]/layout.tsx` add (imports: `import type { Metadata } from "next";` and `import { tripTitle } from "@/lib/page-title";`):

```ts
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tripId: string }>;
}): Promise<Metadata> {
  const { tripId } = await params;
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { name: true } });
  if (!trip) return {};
  return { title: tripTitle(trip.name) };
}
```

(Membership is enforced by the layout body's `requireTripAccess`; the title query leaks nothing a non-member could reach, because the page itself 404s. If you prefer, call `requireTripAccess(tripId)` first — but then the layout test's mock must allow it; it already does.)

In `app/(app)/trips/[tripId]/day/[date]/page.tsx` add (import `type { Metadata } from "next"` and `dayTitle`):

```ts
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tripId: string; date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return {};
  return { title: dayTitle(date) };
}
```

In `app/(app)/trips/[tripId]/help/page.tsx` change `title: "How to use Teepee"` to `title: "Help"`.

Add to each listed subpage `page.tsx` (top of file, after imports; add `import type { Metadata } from "next";` if absent):

| segment | title |
|---|---|
| plan | `Plan` |
| calendar | `Days` |
| budget | `Money` |
| summary | `Summary` |
| wishlist | `Wishlist` |
| journal | `Journal` |
| checklists | `Checklists` |
| files | `Files` |
| activity | `Activity` |
| settings | `Settings` |
| compare | `Compare plans` |
| print | `Print` |

```ts
export const metadata: Metadata = { title: "Plan" };
```

If a segment's `page.tsx` is a client component (`"use client"` at top — none were at planning time), put the export in that segment's `layout.tsx` instead, creating a pass-through layout if needed.

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run lib/page-title.test.ts "app/(app)/trips/[tripId]/layout.test.tsx" "app/(app)/trips/[tripId]/day/[date]/page.test.tsx" lib/help-guide.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add lib/page-title.ts lib/page-title.test.ts "app/(app)/trips/[tripId]"
git commit -m "feat(titles): browser tab reads 'Page · Trip name · Teepee'

Every trip page showed a bare 'Teepee'. The trip layout now sets a title
template from the trip name; subpages name themselves; the day page uses
its short date. The readable-URL half of this note (slugs) is deferred.

Resolves-Feedback: cmuht5itv000004l5948amusj

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Map pins and route lines use the Stop colour

**Files:**
- Modify: `lib/stop-colours.ts` (export `stopHue`, `stopHex`), `lib/stop-colours.test.ts`
- Modify: `components/trip/route-map.tsx:33-45, 55-96, 235-275` (`RouteMapStop.sortOrder` replaces `chapterColour`)
- Modify: feeds — `components/trip/home/phase-planning.tsx:331-343`, `components/trip/home/phase-past.tsx:245-257`, `app/(app)/trips/[tripId]/summary/page.tsx:423-434`, `app/share/[token]/page.tsx:301-312`
- Test: `components/trip/route-map.test.tsx`, and update `components/trip/home/phase-planning.test.tsx`, `components/trip/home/phase-past.test.tsx`, `app/(app)/trips/[tripId]/summary/page.test.tsx` where they assert `chapterColour`.

**Interfaces:**
- Produces: `stopHue(index: number): Hue` and `stopHex(index: number, dark?: boolean): string` in `lib/stop-colours.ts`.
- Produces: `RouteMapStop` gains `sortOrder: number` and loses `chapterColour`; `chapterName` stays (popup only).

- [ ] **Step 1: Write the failing tests**

`lib/stop-colours.test.ts` — add:

```ts
import { stopHue, stopHex } from "./stop-colours";
import { hueHex } from "@/lib/map-palette";

it("stopHue cycles sky, sun, leaf, lilac, pink, teal and wraps", () => {
  expect([0, 1, 2, 3, 4, 5, 6, -1].map(stopHue)).toEqual([
    "sky", "sun", "leaf", "lilac", "pink", "teal", "sky", "teal",
  ]);
});

it("stopHex is the map palette hex for the same hue, light and dark", () => {
  expect(stopHex(1)).toBe(hueHex("sun", false));
  expect(stopHex(1, true)).toBe(hueHex("sun", true));
});
```

`components/trip/route-map.test.tsx` — give every stop in the `STOPS` / `CHAPTERED` fixtures a `sortOrder` (0, 1, …) and drop `chapterColour`; keep `chapterName` on the chaptered one. Replace the three chapter-colour tests:

```tsx
  it("uses the shared pinHtml stop pin, numbered, in the Stop's own colour (as the calendar)", async () => {
    render(<RouteMap stops={CHAPTERED} />);
    await waitFor(() => expect(hoisted.leaflet!.markers).toHaveLength(2));
    const [first, second] = hoisted.leaflet!.markers;
    expect(iconHtml(first)).toBe(pinHtml({ variant: "stop", fill: stopHex(0), label: "1", dark: false }));
    expect(iconHtml(second)).toBe(pinHtml({ variant: "stop", fill: stopHex(1), label: "2", dark: false }));
    expect(iconHtml(second)).not.toMatch(/221,\s*83%/);
  });

  it("uses the dark stop hex in dark mode", async () => {
    hoisted.theme = "dark";
    render(<RouteMap stops={CHAPTERED} />);
    await waitFor(() => expect(hoisted.leaflet!.markers).toHaveLength(2));
    expect(iconHtml(hoisted.leaflet!.markers[0])).toBe(
      pinHtml({ variant: "stop", fill: stopHex(0, true), label: "1", dark: true }),
    );
  });

  it("colours each route line by its destination Stop", async () => {
    render(<RouteMap stops={CHAPTERED} />);
    await waitFor(() => expect(hoisted.leaflet!.polylines.length).toBeGreaterThan(0));
    expect(String(hoisted.leaflet!.polylines[0].options.color)).toBe(stopHex(1));
  });
```

Update the "recolours pins in place when the theme flips" test's expected `fill` to `stopHex(0, true)`. Import `stopHex` from `@/lib/stop-colours`; remove the now-unused `chapterColourSwatch` import if nothing else uses it.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/stop-colours.test.ts components/trip/route-map.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/stop-colours.ts` — add:

```ts
import { hueHex } from "@/lib/map-palette";
// ...
/** The Stop's hue on the ramp, by its position — the same cycle MonthGrid and StopCard paint. */
export function stopHue(index: number): Hue { return STOP_HUES[idx(index)]; }
/** Leaflet hex for the Stop's hue (divIcon HTML and polylines can't take Tailwind classes). */
export function stopHex(index: number, dark = false): string { return hueHex(stopHue(index), dark); }
```

`components/trip/route-map.tsx`:
- `RouteMapStop`: replace `chapterColour?: string | null` with `/** Stop order — pins and legs take the Stop's own colour (lib/stop-colours), the same as the calendar. */ sortOrder: number;`.
- Replace `stopFill` with `const stopFill = (sortOrder: number, dark: boolean) => stopHex(sortOrder, dark);` and drop the `CHAPTER_COLOURS` import if unused.
- `stopIcon(L, n, sortOrder: number, dark)` passes `fill: stopFill(sortOrder, dark)`.
- `legColour(sortOrder: number, dark)` returns `stopFill(sortOrder, dark)`.
- In the marker loop use `stop.sortOrder`; store `colour: stop.sortOrder` (rename the field to `sortOrder: number` in the `stopMarkers` / `legs` tuples) and update the theme-flip recolour code that reads it.
- Update the comment "Per-segment polylines — each segment coloured by the destination stop's chapter" → "destination Stop's colour".

Feeds: in each of the four `mapStops` builders, replace `chapterColour: ch ? chapterColourSwatch(ch.colour) : null,` with `sortOrder: s.sortOrder,` (the share page builder has no `ch`; just add `sortOrder: s.sortOrder`). Remove `chapterColourSwatch` imports where they become unused. Confirm each feed's Prisma `select` includes `sortOrder: true` (all four did at planning time).

- [ ] **Step 4: Fix dependent tests, run, type-check**

Run: `npx vitest run lib/stop-colours.test.ts components/trip/route-map.test.tsx components/trip/home "app/(app)/trips/[tripId]/summary" && npx tsc --noEmit`
Expected: PASS after updating any assertion in `phase-planning.test.tsx`, `phase-past.test.tsx`, `summary/page.test.tsx` that expected a `chapterColour` prop to expect `sortOrder` instead.

- [ ] **Step 5: Commit**

```bash
git add lib/stop-colours.ts lib/stop-colours.test.ts components/trip/route-map.tsx components/trip/route-map.test.tsx components/trip/home "app/(app)/trips/[tripId]/summary" "app/share/[token]/page.tsx"
git commit -m "fix(map): pins and route lines take the Stop's colour, as the calendar does

The home map coloured by Chapter (neutral with Chapters off) while Days and
the plan editor colour by Stop. One rule now: each pin is its Stop's hue,
each leg its destination Stop's hue, Chapters or not.

Resolves-Feedback: cmuhunvk1000004jqjpuyf69u

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Buttons keep their size while loading

**Files:**
- Modify: `components/ui/button.tsx:52-78`, `components/ui/button.test.tsx`
- Modify: `components/trip/rates-panel.tsx:220-222, 283-287`, `components/trip/fork-switcher.tsx:217-219`, `components/trip/journal-editor.tsx:388-392`, `components/trip/attachment-list.tsx:276-280`

**Interfaces:**
- `Button` API unchanged. While `loading`, the spinner is absolutely centred over the label; the label stays in flow but invisible, so width/height never change. `asChild` buttons are untouched (Slot needs one child).

- [ ] **Step 1: Write the failing tests**

In `components/ui/button.test.tsx` add:

```tsx
  it("keeps its label in flow (invisible) while loading, so the width never changes", () => {
    render(<Button loading>Send</Button>);
    const label = screen.getByText("Send");
    expect(label).toBeInTheDocument();
    expect(label).toHaveClass("invisible");
    const spinner = screen.getByTestId("button-spinner");
    expect(spinner.parentElement).toHaveClass("absolute");
    expect(screen.getByRole("button")).toHaveClass("relative");
  });

  it("does not wrap the child of an asChild button (Slot needs exactly one child)", () => {
    render(
      <Button asChild loading>
        <a href="/x">Go</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Go" });
    expect(link.querySelector("span")).toBeNull();
    expect(screen.queryByTestId("button-spinner")).toBeNull();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/ui/button.test.tsx`
Expected: the first new test FAILS (no `invisible`, spinner not absolute).

- [ ] **Step 3: Implement**

Replace the `Button` body's JSX in `components/ui/button.tsx`:

```tsx
    const content = asChild ? (
      children
    ) : (
      <>
        {showSpinner && (
          <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
            <Loader2 className="animate-spin" data-testid="button-spinner" />
          </span>
        )}
        {/* `contents` keeps children in the flex flow (icons keep their gap);
            `invisible` hides them while loading without changing the box. */}
        <span className={cn("contents", showSpinner && "invisible")}>{children}</span>
      </>
    );
    return (
      <Comp
        ref={ref}
        className={cn(
          buttonVariants({ variant, size, shape }),
          "relative",
          size === "icon" && "rounded-md",
          inertWhenAsChild && "pointer-events-none opacity-45",
          className,
        )}
        disabled={asChild ? undefined : (disabled ?? loading)}
        aria-disabled={inertWhenAsChild || undefined}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        {...props}
      >
        {content}
      </Comp>
    );
```

Then the label-swapping call sites — keep one label and use `loading`:
- `rates-panel.tsx` ~221: `<Button type="submit" variant="primary" size="sm" loading={saving} className="h-8">Lock rate</Button>`.
- `rates-panel.tsx` ~285: label always `Refresh all` (keep the spinning `RefreshCw` icon; delete the `refreshing ? "Refreshing…" :` ternary).
- `fork-switcher.tsx` ~218: `<Button variant="destructive" onClick={onConfirm} loading={isPending}>Discard variant</Button>`.
- `journal-editor.tsx` ~388-392: label always `Save`; use `loading={isSaving}` on that Button and keep the `<Save>` icon (delete the spinner/icon ternary).
- `attachment-list.tsx` ~279: label text always `Add file` (keep the icon/spinner swap — that is a `<label>`, not a Button, and its icon slot is fixed-size). Leave the full-width "Tap to add a file" tile alone: it is block-width and its text swap moves nothing.

Grep for tests asserting the removed strings and update them: `grep -rn "Saving…\|Refreshing…\|Discarding…\|Uploading…" --include=*.test.tsx components app`.

- [ ] **Step 4: Run and type-check**

Run: `npx vitest run components/ui/button.test.tsx components/trip/rates-panel.test.tsx components/trip/fork-switcher.test.tsx components/trip/journal-editor.test.tsx components/trip/attachment-list.test.tsx components/feedback && npx tsc --noEmit`
Expected: PASS (skip any of those test files that don't exist).

- [ ] **Step 5: Commit**

```bash
git add components/ui/button.tsx components/ui/button.test.tsx components/trip/rates-panel.tsx components/trip/fork-switcher.tsx components/trip/journal-editor.tsx components/trip/attachment-list.tsx
git add -u components
git commit -m "fix(ui): a loading Button keeps its size

The spinner used to be added beside the label, growing every loading button
by ~24px and shrinking it back. It now overlays the label, which stays in
flow but invisible. The few buttons that also swapped their label text
while working keep one label.

Resolves-Feedback: cmuhu1c5i000204jwyokb6p5d

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: What's new banner no longer overlaps the trip cover

**Files:**
- Modify: `components/whats-new/whats-new-banner.tsx` (accept `className`), `components/whats-new/whats-new-card.tsx:48` (accept `className`)
- Modify: `app/(app)/trips/[tripId]/page.tsx:80, 126-133`
- Test: `components/whats-new/whats-new-card.test.tsx`, `app/(app)/trips/[tripId]/page.test.tsx`

**Interfaces:**
- `WhatsNewBanner({ className?: string })` → threads to `WhatsNewCard({ notes, totalUnread, className? })`, applied to the card's root `div`.

- [ ] **Step 1: Write the failing tests**

`components/whats-new/whats-new-card.test.tsx` — add, following the file's fixture pattern:

```tsx
  it("applies a caller className to its root, so a page can space it from what follows", () => {
    const { container } = render(<WhatsNewCard notes={NOTES} totalUnread={1} className="mb-6" />);
    expect(container.firstElementChild).toHaveClass("mb-6");
  });
```

`app/(app)/trips/[tripId]/page.test.tsx` — read its mocking pattern first (it marker-mocks child components). Ensure `@/components/whats-new/whats-new-banner` is mocked as a marker that renders its props, e.g. `WhatsNewBanner: (p: { className?: string }) => <div data-testid="whats-new" className={p.className} />`, and `TripCoverCard` renders its `className` on a `data-testid="cover-card"` element. Then:

```tsx
  it("spaces the What's new banner below itself and never pulls the cover up over it", async () => {
    // render the page the way the file's other tests do
    expect(screen.getByTestId("whats-new")).toHaveClass("mb-6");
    expect(screen.getByTestId("cover-card").className).not.toMatch(/-mt-/);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/whats-new/whats-new-card.test.tsx "app/(app)/trips/[tripId]/page.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement**

`whats-new-card.tsx`: add `className?: string` to props; root becomes `className={cn("relative rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5", className)}` (import `cn` from `@/lib/cn`).

`whats-new-banner.tsx`: `export async function WhatsNewBanner({ className }: { className?: string } = {})` and pass `className={className}` to `WhatsNewCard`.

`app/(app)/trips/[tripId]/page.tsx`: `<WhatsNewBanner className="mb-6" />`; change the cover's className from `"-mt-2 mb-2 h-56 w-full sm:h-48"` to `"mb-2 h-56 w-full sm:h-48"`. Fix the comment above it if it mentions tucking under the header.

- [ ] **Step 4: Run and type-check**

Run: `npx vitest run components/whats-new "app/(app)/trips/[tripId]/page.test.tsx" "app/(app)/trips/page.test.tsx" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/whats-new "app/(app)/trips/[tripId]/page.tsx" "app/(app)/trips/[tripId]/page.test.tsx"
git commit -m "fix(home): What's new banner no longer overlaps the trip cover

The cover card's negative top margin assumed nothing sat above it. The
banner now carries its own bottom spacing and the cover keeps its place.

Resolves-Feedback: cmuhtjtvd000904l53q8kdse8

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: A thing to do (any Plan-owned Item) can be deleted from its edit dialog

**Files:**
- Modify: `components/trip/item-form-dialog.tsx` (`ItemForm` footer; `useConfirm`; `deleteItem`)
- Test: `components/trip/item-form-dialog.test.tsx`

**Interfaces:**
- Consumes: `deleteItem(itemId): Promise<ItemActionResult>` from `@/server/actions/items`; `useConfirm()` from `@/components/ui/confirm-dialog` (returns `{ confirm, dialog }`; render `{dialog}` in the tree).
- Produces: in edit mode the dialog's footer has a left-aligned **Delete** button; the confirm dialog title is `Delete "<title>"?`, description `This can't be undone.`, confirm label `Delete`, destructive. On success the form closes (`onClose()`) and calls `onSaved?.()`.

- [ ] **Step 1: Write the failing tests**

In `components/trip/item-form-dialog.test.tsx`: extend the existing `vi.mock("@/server/actions/items", ...)` factory with `deleteItem: vi.fn().mockResolvedValue({ success: true })` and import it. Add:

```tsx
  it("offers Delete only when editing an existing item", () => {
    const { unmount } = render(<ItemFormDialog {...baseProps} item={existingItem} />);
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    unmount();
    render(<ItemFormDialog {...baseProps} />);
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("asks before deleting, then deletes and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ItemFormDialog {...baseProps} onOpenChange={onOpenChange} item={existingItem} />);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    const confirmDialog = await screen.findByRole("dialog", { name: /delete "museum visit"\?/i });
    await user.click(within(confirmDialog).getByRole("button", { name: /^delete$/i }));
    expect(deleteItem).toHaveBeenCalledWith("item-99");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={existingItem} />);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    const confirmDialog = await screen.findByRole("dialog", { name: /delete "museum visit"\?/i });
    await user.click(within(confirmDialog).getByRole("button", { name: /cancel/i }));
    expect(deleteItem).not.toHaveBeenCalled();
  });
```

(If the confirm dialog's cancel button is labelled differently, check `components/ui/confirm-dialog.tsx` and match it.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/trip/item-form-dialog.test.tsx`
Expected: the three new tests FAIL.

- [ ] **Step 3: Implement**

In `item-form-dialog.tsx`:
- imports: `import { createItem, updateItem, deleteItem } from "@/server/actions/items";` (extend the existing import), `import { useConfirm } from "@/components/ui/confirm-dialog";`, `import { Trash2 } from "lucide-react";` (extend the existing lucide import).
- inside `ItemForm`, after `useEntityForm`:

```tsx
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    if (!item) return;
    const ok = await confirm({
      title: `Delete "${item.title}"?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const result = await deleteItem(item.id);
      if (result.success) {
        onSaved?.();
        onClose();
      }
    } finally {
      setDeleting(false);
    }
  }
```

- footer:

```tsx
      <DialogFooter>
        {isEdit && (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void handleDelete()}
            loading={deleting}
            disabled={isPending}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        )}
        <DialogClose asChild>
          <Button variant="outline" type="button" disabled={isPending || deleting}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={isPending} disabled={deleting}>
          {isEdit ? "Save changes" : "Add Item"}
        </Button>
      </DialogFooter>
      {confirmDialog}
```

`DialogFooter` may be `flex-col-reverse` on mobile / `sm:flex-row` — check `components/ui/dialog.tsx`; if `mr-auto` doesn't left-align on `sm+`, add `sm:mr-auto` and accept stacking on phones.

- [ ] **Step 4: Run and type-check**

Run: `npx vitest run components/trip/item-form-dialog.test.tsx components/trip/stop-card.test.tsx components/trip/stop-day-list.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/trip/item-form-dialog.tsx components/trip/item-form-dialog.test.tsx
git commit -m "feat(plan): delete a thing to do (or any Plan Item) from its edit dialog

Only Wishlist ideas could be deleted; a thing to do or a scheduled Item had
Cancel and Save alone. The edit dialog now offers Delete behind the same
confirm the Wishlist uses, via the existing deleteItem action.

Resolves-Feedback: cmuhubk0k000004lclphxproj

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Scheduling defaults to the Stop's first date

**Files:**
- Modify: `components/trip/item-form-dialog.tsx` (`StopOption.arriveDate`; date default; Stop-change re-default)
- Modify: `components/trip/itinerary-manager.tsx:1059` (pass `arriveDate` in `stopOptions`)
- Modify: `components/trip/calendar-views.tsx:~293` (ScheduleItemDialog `defaultDate` from the item's Stop)
- Modify: `components/trip/wishlist-board.tsx:~203` (same rule: the item's Stop first, else first Stop, else trip start)
- Test: `components/trip/item-form-dialog.test.tsx`, `components/trip/calendar-views.test.tsx`

**Interfaces:**
- `StopOption` (item-form-dialog) gains `arriveDate?: string | null`.
- Rule, on **create in scheduled mode** (`defaultUnscheduled === false`) with no `defaultDate`: date = selected Stop's `arriveDate` ?? `tripStartDate` ?? `""`. Changing the Stop select re-applies the rule only while the Traveller has not typed a date. **Unscheduled create and edit keep the field blank / the item's own date** — a blank date is what makes a thing to do dateless (ADR 0022), so a prefilled date there would silently schedule it on Save. (Deliberate narrowing of spec §3; flag it in the task report.)
- `ScheduleItemDialog` callers pass `defaultDate = stopArriveDate(item.stopId) ?? stops[0]?.arriveDate ?? tripStart`.

- [ ] **Step 1: Write the failing tests**

`components/trip/item-form-dialog.test.tsx`:

```tsx
  const STOPS = [
    { id: "stop-a", name: "Denpasar", arriveDate: "2026-12-04" },
    { id: "stop-b", name: "Munich", arriveDate: "2026-12-08" },
  ];

  it("scheduled create defaults the date to the pre-selected Stop's arrive date", () => {
    render(
      <ItemFormDialog {...baseProps} stops={STOPS} defaultUnscheduled={false} defaultStopId="stop-a" tripStartDate="2026-12-01" />,
    );
    expect(screen.getByLabelText(/^date/i)).toHaveValue("2026-12-04");
  });

  it("scheduled create with no Stop falls back to the trip start", () => {
    render(<ItemFormDialog {...baseProps} stops={STOPS} defaultUnscheduled={false} tripStartDate="2026-12-01" />);
    expect(screen.getByLabelText(/^date/i)).toHaveValue("2026-12-01");
  });

  it("unscheduled create keeps the date blank even under a Stop", () => {
    render(<ItemFormDialog {...baseProps} stops={STOPS} defaultUnscheduled defaultStopId="stop-a" />);
    expect(screen.getByLabelText(/^date/i)).toHaveValue("");
  });

  it("changing the Stop re-defaults an untouched date, but never a date the Traveller typed", async () => {
    const user = userEvent.setup();
    render(
      <ItemFormDialog {...baseProps} stops={STOPS} defaultUnscheduled={false} defaultStopId="stop-a" tripStartDate="2026-12-01" />,
    );
    const date = screen.getByLabelText(/^date/i);
    // pick Munich via the Select (Radix): open the trigger, choose the option
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Munich" }));
    expect(date).toHaveValue("2026-12-08");
    await user.clear(date);
    await user.type(date, "2026-12-09");
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Denpasar" }));
    expect(date).toHaveValue("2026-12-09");
  });
```

Check how existing tests in the file interact with the Stop `Select` (Radix Select in jsdom often needs `pointerEvents` shims — the file or `test/setup.ts` may already have them; copy that approach). The `DateField` label text is `Date` — confirm with `components/ui/date-field.tsx`.

`components/trip/calendar-views.test.tsx` — the file mocks `ScheduleItemDialog`; make the mock capture props (`capturedScheduleProps = props; return null;`) and add:

```tsx
  it("schedules a wishlist idea from the calendar defaulting to its Stop's arrive date, not the trip start", async () => {
    // render CalendarViews with stops [{id:"s1", arriveDate:"2026-12-04", ...}] and a wishlistItems entry with stopId "s1",
    // click the idea's CalendarCheck action (see the existing "clicking the title opens the same schedule dialog" test),
    expect(capturedScheduleProps.defaultDate).toBe("2026-12-04");
  });
```

Look at how `CalendarViews` receives stops (its props at the top of the file) to build the fixture.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/trip/item-form-dialog.test.tsx components/trip/calendar-views.test.tsx`
Expected: new tests FAIL.

- [ ] **Step 3: Implement**

`item-form-dialog.tsx`:

```ts
export interface StopOption {
  id: string;
  name: string;
  /** Stop's arrive date (YYYY-MM-DD) — the scheduled-mode date default. Null/absent for a rough Stop. */
  arriveDate?: string | null;
}
```

Inside `ItemForm`:

```ts
  const arriveOf = React.useCallback(
    (id: string) => stops.find((s) => s.id === id)?.arriveDate ?? null,
    [stops],
  );
  const initialStopId = item?.stopId ?? defaultStopId ?? "";
  const [stopId, setStopId] = React.useState(initialStopId);
  const [date, setDate] = React.useState(
    item?.date ??
      defaultDate ??
      (defaultUnscheduled ? "" : (arriveOf(initialStopId) ?? tripStartDate ?? "")),
  );
  // True once the Traveller edits the date by hand; a Stop change then leaves it alone.
  const [dateTouched, setDateTouched] = React.useState(Boolean(item?.date ?? defaultDate));
```

Stop select `onValueChange`:

```ts
            onValueChange={(v) => {
              const next = v === "__none__" ? "" : v;
              setStopId(next);
              if (!isEdit && !defaultUnscheduled && !dateTouched) {
                setDate(arriveOf(next) ?? tripStartDate ?? "");
              }
            }}
```

`DateField.onChange`: add `setDateTouched(true);` before `setDate(e.target.value)`.

`itinerary-manager.tsx:1059`: `stops.map((s) => ({ id: s.id, name: s.name, timezone: s.timezone, arriveDate: s.arriveDate ?? null }))` (confirm `ItineraryStop` carries `arriveDate`; the plan editor's local stop type does).

`calendar-views.tsx` (~293) and `wishlist-board.tsx` (~203): compute

```ts
const stopArrive = (stopId: string | null | undefined) =>
  stops.find((s) => s.id === stopId)?.arriveDate ?? null;
// defaultDate={stopArrive(item.stopId) ?? stops[0]?.arriveDate ?? tripStart}
```

using whatever the local stops array and trip-start variable are called in each file.

- [ ] **Step 4: Run and type-check**

Run: `npx vitest run components/trip/item-form-dialog.test.tsx components/trip/calendar-views.test.tsx components/trip/wishlist-board.test.tsx components/trip/stop-card.test.tsx components/trip/stop-day-list.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/trip/item-form-dialog.tsx components/trip/item-form-dialog.test.tsx components/trip/itinerary-manager.tsx components/trip/calendar-views.tsx components/trip/calendar-views.test.tsx components/trip/wishlist-board.tsx
git commit -m "fix(plan): scheduling defaults the date to the Stop's first day

Scheduled-mode adds and the calendar/wishlist Schedule dialog now default
to the Item's Stop's arrive date, else the Trip's start. Changing the Stop
re-defaults an untouched date. Unscheduled adds and edits stay blank on
purpose: a blank date is what keeps a thing to do dateless.

Resolves-Feedback: cmuhugzni000904jwpz1ggxhj

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Agenda centred; the Days toolbar holds still between views

**Files:**
- Modify: `components/trip/agenda-view.tsx:24` (`mx-auto`)
- Modify: `components/trip/calendar-views.tsx:148-193` (toolbar)
- Test: `components/trip/agenda-view.test.tsx`, `components/trip/calendar-views.test.tsx`

**Interfaces:**
- Toolbar in both views: the `h2` slot is always rendered — month name in Month view, `Agenda` in Agenda view; the prev/next month buttons are always rendered, `invisible` + `disabled` + `aria-hidden` in Agenda view. The Segmented control keeps its DOM position and size.
- Agenda body: `mx-auto w-full max-w-3xl` (matches `DAY_READING_WIDTH_CLASS` on the day page).

- [ ] **Step 1: Write the failing tests**

`agenda-view.test.tsx`:

```tsx
  it("centres the day cards at the Day page's reading width", () => {
    const { container } = render(<AgendaView tripId="t1" days={DAYS} todayISO="2026-07-01" />);
    expect(container.firstElementChild).toHaveClass("mx-auto", "max-w-3xl");
  });
```

`calendar-views.test.tsx` — replace `"agenda view has no month heading"` with:

```tsx
  it("agenda view keeps the title slot (reads 'Agenda') and hides the month arrows without removing them", () => {
    // force agenda view the way the file's other view tests do (stored choice / viewport)
    expect(screen.getByRole("heading", { level: 2, name: "Agenda" })).toBeInTheDocument();
    const prev = screen.getByLabelText("Previous month", { selector: "button" });
    expect(prev).toHaveClass("invisible");
    expect(prev).toBeDisabled();
  });
```

Note `getByLabelText` ignores `aria-hidden` when using `selector`; if it doesn't find the button, query with `container.querySelector('button[aria-label="Previous month"]')` instead.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/trip/agenda-view.test.tsx components/trip/calendar-views.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`agenda-view.tsx:24`: `className="mx-auto flex w-full max-w-3xl flex-col gap-6 pt-2"`; update the docblock ("centred at the Day page's reading width").

`calendar-views.tsx` toolbar:

```tsx
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h2 className="w-full font-display text-[30px] font-extrabold leading-none tracking-[-0.04em] text-foreground sm:w-auto lg:text-4xl">
          {view === "month" ? formatMonthYear(monthAnchor) : "Agenda"}
        </h2>
        <Segmented ...unchanged... />
        <div
          className={cn("ml-auto flex items-center gap-2", view !== "month" && "invisible")}
          aria-hidden={view !== "month" || undefined}
        >
          <Button ... disabled={view !== "month" || !canPrev} ... aria-label="Previous month" />
          <Button ... disabled={view !== "month" || !canNext} ... aria-label="Next month" />
        </div>
      </div>
```

Keep the existing `month view titles the grid with the month` test green (the h2 still shows the month in Month view).

- [ ] **Step 4: Run and type-check**

Run: `npx vitest run components/trip/agenda-view.test.tsx components/trip/calendar-views.test.tsx components/trip/month-grid.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/trip/agenda-view.tsx components/trip/agenda-view.test.tsx components/trip/calendar-views.tsx components/trip/calendar-views.test.tsx
git commit -m "fix(days): centre the Agenda and keep the toolbar still when switching views

Agenda was left-aligned at the reading width the Day page centres. The
month title and arrows also appeared only in Month view, so the view switch
jumped sideways; the title slot now always renders and the arrows stay in
place, invisible in Agenda.

Resolves-Feedback: cmuhtxbjk000b04l5bgnn6ewb
Resolves-Feedback: cmuhs558i000004l6k1xdiqz2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Day-page entries open their details in place

**Files:**
- Create: `components/trip/day-entry-link.tsx` (client island), `components/trip/day-entry-link.test.tsx`
- Modify: `components/trip/timeline.tsx` (optional `editor` prop; wrap titles), `components/trip/timeline.test.tsx`
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx` (fetch costs + fields; build `editor`), `app/(app)/trips/[tripId]/day/[date]/page.test.tsx` (mock `db.cost.findMany`)

**Interfaces:**

`components/trip/day-entry-link.tsx` ("use client"):

```ts
import type { ItemCardItem } from "@/components/trip/item-card";
import type { TransportCardTransport } from "@/components/trip/transport-card";
import type { AccommodationCardAccommodation } from "@/components/trip/accommodation-card";
import type { StopOption } from "@/components/trip/item-form-dialog";
import type { CostRow } from "@/server/actions/costs";
import type { AttachmentView } from "@/components/trip/attachment-list";

export type DayEntryTarget =
  | { kind: "item"; item: ItemCardItem }
  | { kind: "transport"; transport: TransportCardTransport }
  | { kind: "accommodation"; accommodation: AccommodationCardAccommodation; stopDateRange: { arriveDate: string; departDate: string } };

/** Everything the three edit dialogs need, built once by the day page and looked up by entity id. */
export interface DayEntryEditor {
  tripId: string;
  stops: (StopOption & { timezone?: string | null })[];
  homeCurrency?: string;
  homeBaseName?: string | null;
  items: Record<string, ItemCardItem>;
  transports: Record<string, TransportCardTransport>;
  accommodations: Record<string, { accommodation: AccommodationCardAccommodation; stopDateRange: { arriveDate: string; departDate: string } }>;
  costsByOwner: Record<string, CostRow[]>;
}

export function DayEntryLink(props: {
  target: DayEntryTarget;
  editor: DayEntryEditor;
  attachments: AttachmentView[];
  className?: string;
  children: React.ReactNode;
}): JSX.Element;
```

`DayEntryLink` renders `<button type="button" aria-haspopup="dialog" className={cn("min-w-0 text-left underline-offset-2 hover:underline focus-visible:underline", className)}>{children}</button>` and, when open, the matching dialog: `ItemFormDialog` (`item`, `costs`, `attachments`, `stops`, `homeCurrency`, `forkId={null}`), `TransportFormDialog` (`transport`, `costs`, `attachments`, `stops`, `homeCurrency`, `homeBaseName`, `forkId={null}`), `AccommodationFormDialog` (`accommodation`, `stopId`, `stopDateRange`, `costs`, `attachments`, `tripId`, `homeCurrency`, `forkId={null}`). The day page is always the real plan (`forkId` null — see the page's policy comment).

`Timeline` gains `editor?: DayEntryEditor`. When present and the entity id is in the matching map, each row's title is wrapped in `DayEntryLink`; otherwise the plain span renders exactly as today. The Agenda (no `editor`) and the share page are unchanged.

- [ ] **Step 1: Write the failing tests**

`components/trip/day-entry-link.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/trip/item-form-dialog", () => ({
  ItemFormDialog: (p: { open: boolean; item?: { id: string } }) => (p.open ? <div data-testid="item-dialog">{p.item?.id}</div> : null),
}));
vi.mock("@/components/trip/transport-form-dialog", () => ({
  TransportFormDialog: (p: { open: boolean; transport?: { id: string } }) => (p.open ? <div data-testid="transport-dialog">{p.transport?.id}</div> : null),
}));
vi.mock("@/components/trip/accommodation-form-dialog", () => ({
  AccommodationFormDialog: (p: { open: boolean; accommodation?: { id: string }; stopDateRange: { arriveDate: string } }) =>
    p.open ? <div data-testid="accommodation-dialog">{p.accommodation?.id}:{p.stopDateRange.arriveDate}</div> : null,
}));

import { DayEntryLink, type DayEntryEditor } from "./day-entry-link";

const editor: DayEntryEditor = {
  tripId: "t1", stops: [{ id: "s1", name: "Munich", arriveDate: "2026-12-08" }], homeCurrency: "AUD", homeBaseName: null,
  items: {}, transports: {}, accommodations: {}, costsByOwner: {},
};

describe("DayEntryLink", () => {
  it("is a button that opens the Item dialog for an item", async () => {
    const user = userEvent.setup();
    render(
      <DayEntryLink editor={editor} attachments={[]} target={{ kind: "item", item: { id: "i1", title: "Tower", category: "SIGHTSEEING" } }}>
        Tower
      </DayEntryLink>,
    );
    expect(screen.queryByTestId("item-dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Tower" }));
    expect(screen.getByTestId("item-dialog")).toHaveTextContent("i1");
  });

  it("opens the Transport dialog for a transport", async () => {
    const user = userEvent.setup();
    render(
      <DayEntryLink editor={editor} attachments={[]} target={{ kind: "transport", transport: { id: "tr1", mode: "TRAIN", sortOrder: 0 } }}>
        Departs — Train
      </DayEntryLink>,
    );
    await user.click(screen.getByRole("button"));
    expect(screen.getByTestId("transport-dialog")).toHaveTextContent("tr1");
  });

  it("opens the Accommodation dialog with the Stop's date range", async () => {
    const user = userEvent.setup();
    render(
      <DayEntryLink
        editor={editor}
        attachments={[]}
        target={{
          kind: "accommodation",
          accommodation: { id: "a1", stopId: "s1", name: "Hotel", checkIn: "2026-12-08", checkOut: "2026-12-10" },
          stopDateRange: { arriveDate: "2026-12-08", departDate: "2026-12-10" },
        }}
      >
        Check-in — Hotel
      </DayEntryLink>,
    );
    await user.click(screen.getByRole("button"));
    expect(screen.getByTestId("accommodation-dialog")).toHaveTextContent("a1:2026-12-08");
  });
});
```

`components/trip/timeline.test.tsx` — add a `vi.mock("./day-entry-link", ...)` that renders `<button data-testid="entry-link" data-kind={props.target.kind}>{children}</button>` (keep a real-ish `DayEntryEditor` type import), then:

```tsx
  it("wraps entry titles in DayEntryLink when an editor is supplied, and not otherwise", () => {
    const editor = {
      tripId: "t1", stops: [], items: { [ITEM_ID]: { id: ITEM_ID, title: ITEM_TITLE, category: "ACTIVITY" } },
      transports: {}, accommodations: {}, costsByOwner: {},
    };
    const { unmount } = render(<Timeline day={dayPlan} variant="day" editor={editor} />);
    const links = screen.getAllByTestId("entry-link");
    expect(links.map((l) => l.getAttribute("data-kind"))).toContain("item");
    expect(screen.getByRole("button", { name: ITEM_TITLE })).toBeInTheDocument();
    unmount();
    render(<Timeline day={dayPlan} variant="day" />);
    expect(screen.queryByTestId("entry-link")).toBeNull();
  });
```

(`ITEM_ID`/`ITEM_TITLE`/`dayPlan` are the file's existing fixtures. If the fixture has a transport or accommodation entry, extend `editor.transports`/`accommodations` and assert those kinds too.)

`app/(app)/trips/[tripId]/day/[date]/page.test.tsx` — add `costFindManyMock: vi.fn()` to the hoisted mocks, `cost: { findMany: costFindManyMock }` to the `db` mock, default it to `[]` in `beforeEach`, and add:

```tsx
  it("hands the Timeline an editor built from the day's entities and costs", async () => {
    // arrange per the file's existing DayPage invocation helper, with one item, one transport, one accommodation
    costFindManyMock.mockResolvedValue([{ id: "c1", ownerType: "ITEM", ownerId: "item-1", costMinor: 1000, paidMinor: null, currency: "AUD", rateToHome: null, paidAt: null, dueDate: null, label: null, category: null }]);
    // render
    // assert the mocked Timeline received editor.items["item-1"], editor.transports[...] with sortOrder, editor.costsByOwner["item-1"] length 1
  });
```

Read how the file mocks `Timeline` (marker) and capture its props the way other tests there capture props.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/trip/day-entry-link.test.tsx components/trip/timeline.test.tsx "app/(app)/trips/[tripId]/day/[date]/page.test.tsx"`
Expected: FAIL (module missing / no `editor` prop / `db.cost` undefined).

- [ ] **Step 3: Implement `day-entry-link.tsx`**

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { ItemFormDialog, type StopOption } from "@/components/trip/item-form-dialog";
import { TransportFormDialog } from "@/components/trip/transport-form-dialog";
import { AccommodationFormDialog } from "@/components/trip/accommodation-form-dialog";
import type { ItemCardItem } from "@/components/trip/item-card";
import type { TransportCardTransport } from "@/components/trip/transport-card";
import type { AccommodationCardAccommodation } from "@/components/trip/accommodation-card";
import type { CostRow } from "@/server/actions/costs";
import type { AttachmentView } from "@/components/trip/attachment-list";

// (types DayEntryTarget / DayEntryEditor exactly as in Interfaces above)

/**
 * Makes a Timeline row's title a button that opens the same edit dialog the
 * plan editor uses, in place — read or edit the train, the hotel or the
 * Item without leaving the day. The day page is always the real plan, so
 * every dialog gets forkId null.
 */
export function DayEntryLink({ target, editor, attachments, className, children }: Props) {
  const [open, setOpen] = React.useState(false);
  const ownerId =
    target.kind === "item" ? target.item.id
    : target.kind === "transport" ? target.transport.id
    : target.accommodation.id;
  const costs = editor.costsByOwner[ownerId] ?? [];

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn("min-w-0 text-left underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none", className)}
      >
        {children}
      </button>
      {open && target.kind === "item" && (
        <ItemFormDialog tripId={editor.tripId} stops={editor.stops} item={target.item} open onOpenChange={setOpen}
          homeCurrency={editor.homeCurrency} costs={costs} attachments={attachments} forkId={null} />
      )}
      {open && target.kind === "transport" && (
        <TransportFormDialog tripId={editor.tripId} stops={editor.stops} transport={target.transport} open onOpenChange={setOpen}
          homeCurrency={editor.homeCurrency} homeBaseName={editor.homeBaseName} costs={costs} attachments={attachments} forkId={null} />
      )}
      {open && target.kind === "accommodation" && (
        <AccommodationFormDialog tripId={editor.tripId} stopId={target.accommodation.stopId} stopDateRange={target.stopDateRange}
          accommodation={target.accommodation} open onOpenChange={setOpen}
          homeCurrency={editor.homeCurrency} costs={costs} attachments={attachments} forkId={null} />
      )}
    </>
  );
}
```

Check each dialog's exact prop names against its `Props` interface (quoted in this plan's survey: `TransportFormDialogProps`, `AccommodationFormDialogProps`, `ItemFormDialogProps`) and adjust.

- [ ] **Step 4: Implement the Timeline wiring**

In `timeline.tsx`: add `editor?: DayEntryEditor` to `TimelineProps` (import the type from `./day-entry-link`, and the component). Thread `editor` into `TransportRow`, `AccomCheckinRow`, `AccomCheckoutRow`, `TimedItemRow`/`UntimedItemRow` → `DayItemBody`. In each, compute the target from the editor maps and wrap the existing title element:

```tsx
// TransportRow
const tx = editor?.transports[t.id];
const title = (
  <span className="font-semibold text-foreground">
    {isDep ? "Departs" : "Arrives"} — {meta?.label ?? t.mode}
  </span>
);
{tx ? <DayEntryLink target={{ kind: "transport", transport: tx }} editor={editor!} attachments={attachments}>{title}</DayEntryLink> : title}
```

Same shape for accommodation rows (`editor?.accommodations[a.id]` → `target={{ kind: "accommodation", ...entry }}`) and `DayItemBody` (`editor?.items[item.id]` → `{ kind: "item", item }`), keeping every existing class on the inner span so the layout tests stay green.

- [ ] **Step 5: Implement the day page**

In `app/(app)/trips/[tripId]/day/[date]/page.tsx`:
- trip select: add `name: true, homeCurrency: true, homeName: true`.
- transport select: add `sortOrder: true, anchorStopId: true, depIsHome: true, arrIsHome: true`.
- add to the `Promise.all` a cost query:

```ts
      db.cost.findMany({
        where: { tripId, ...REAL_PLAN, ownerType: { in: ["ITEM", "TRANSPORT", "ACCOMMODATION"] }, ownerId: { not: null } },
        orderBy: { createdAt: "asc" },
        select: { id: true, costMinor: true, paidMinor: true, currency: true, rateToHome: true, paidAt: true, dueDate: true, ownerType: true, ownerId: true, label: true, category: true },
      }),
```

- after `stopOptions`, build the editor:

```ts
  const stopById = new Map(stops.map((s) => [s.id, s]));
  const costsByOwner: Record<string, CostRow[]> = {};
  for (const c of costs) if (c.ownerId) (costsByOwner[c.ownerId] ??= []).push(c);
  const editor: DayEntryEditor = {
    tripId,
    stops: stops.map((s) => ({ id: s.id, name: s.name, timezone: s.timezone, arriveDate: s.arriveDate })),
    homeCurrency: trip.homeCurrency,
    homeBaseName: trip.homeName,
    items: Object.fromEntries(items.map((i) => [i.id, i])),
    transports: Object.fromEntries(
      transports.map((t) => [t.id, {
        ...t,
        mode: t.mode as TransportMode,
        fromStopName: t.fromStopId ? stopById.get(t.fromStopId)?.name ?? null : null,
        toStopName: t.toStopId ? stopById.get(t.toStopId)?.name ?? null : null,
        fromStopTimezone: t.fromStopId ? stopById.get(t.fromStopId)?.timezone ?? null : null,
        toStopTimezone: t.toStopId ? stopById.get(t.toStopId)?.timezone ?? null : null,
      }]),
    ),
    accommodations: Object.fromEntries(
      accommodations.map((a) => {
        const st = stopById.get(a.stopId);
        return [a.id, { accommodation: a, stopDateRange: { arriveDate: st?.arriveDate ?? a.checkIn, departDate: st?.departDate ?? a.checkOut } }];
      }),
    ),
    costsByOwner,
  };
```

- pass `editor={editor}` to the `<Timeline variant="day" …>`.
- `stopOptions` used by `AddItemButton` can also carry `arriveDate` (harmless).

Type friction to expect: `items` rows have `date: string | null` etc. — compatible with `ItemCardItem`; `TransportCardTransport.depAt` is `Date | null` (Prisma gives `Date | null`); if `mode` is a plain string in the select, the cast shown handles it.

- [ ] **Step 6: Run, type-check**

Run: `npx vitest run components/trip/day-entry-link.test.tsx components/trip/timeline.test.tsx components/trip/agenda-view.test.tsx "app/(app)/trips/[tripId]/day/[date]/page.test.tsx" components/trip/home/phase-travelling.test.tsx && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add components/trip/day-entry-link.tsx components/trip/day-entry-link.test.tsx components/trip/timeline.tsx components/trip/timeline.test.tsx "app/(app)/trips/[tripId]/day/[date]/page.tsx" "app/(app)/trips/[tripId]/day/[date]/page.test.tsx"
git commit -m "feat(day): click a day-plan entry to open its details in place

Transport, Accommodation and Item rows on the single day page were inert.
Each title is now a button opening the same edit dialog the plan editor
uses, so the train's details are one click away without leaving the day.
The Agenda and the share page stay read-only.

Resolves-Feedback: cmuhtdlz7000504l5tcfrj0mp

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Whole-branch verification

**Files:** none new.

- [ ] **Step 1: Full suite, types, lint**

Run: `npx vitest run 2>&1 | tail -15 && npx tsc --noEmit && npm run lint`
Expected: all passed, 0 failed; tsc clean; lint clean. Fix anything red in the task's own files and amend that task's commit only if the fix is trivial; otherwise a separate `fix:` commit naming the task.

- [ ] **Step 2: Trailer audit**

Run: `git log beta..HEAD --format='%h %s%n%(trailers:key=Resolves-Feedback,valueonly)'`
Expected: every one of these ids appears exactly once: `cmuhtad17000404l5sab0wtw1`, `cmuhs3si2000104l51ck81ibo`, `cmuhsf6jo000104l6b4hlz1if`, `cmuht5itv000004l5948amusj`, `cmuhunvk1000004jqjpuyf69u`, `cmuhu1c5i000204jwyokb6p5d`, `cmuhtjtvd000904l53q8kdse8`, `cmuhubk0k000004lclphxproj`, `cmuhugzni000904jwpz1ggxhj`, `cmuhtxbjk000b04l5bgnn6ewb`, `cmuhs558i000004l6k1xdiqz2`, `cmuhtdlz7000504l5tcfrj0mp`.

- [ ] **Step 3: Manual-verification list for Cam**

Report (do not fix): items 1 (banner), 5 (day-page dialogs), 8 (toolbar) need a look in the running app at 1438×723 and 1920×911; the Strasbourg "train" in the Christmas trip is probably an Item and is data for Cam to convert.
