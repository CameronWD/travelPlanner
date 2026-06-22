# Calendar Feed Type Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let trip members choose which event types (Transport / Accommodation / Activities) the trip's single calendar feed publishes, defaulting to all-on so existing feeds are unchanged.

**Architecture:** Add three boolean flags to the existing `CalendarFeed` row (one feed per trip). The public ICS route reads the flags and passes empty arrays for excluded types into the unchanged `buildICS` serializer. The settings panel gains three auto-saving checkboxes wired to a new server action. No new feed, no token change.

**Tech Stack:** Next.js 16 App Router (server actions + route handlers), Prisma 7 / Postgres, React 19, Tailwind v4, Vitest + Testing Library (jsdom; all DB-touching tests mock `@/lib/db`).

**Branch:** `feat/calendar-feed-filter` (already created off `main`). Do NOT touch `main`, the `feat/mobile-ui-sweep` branch, push, or deploy.

**Conventions every task must follow:**
- The unit suite mocks `@/lib/db` (`vi.mock("@/lib/db", ...)`) and `requireTripAccess` — there is NO live database in this environment. Migrations are authored, not run here; they apply at deploy via `prisma migrate deploy`.
- After each task: `npm run test` and `npm run build` must both exit 0 (baseline on this branch is 885 tests green — the UI-sweep tests are NOT on this branch). Do not regress.
- Match existing house style (the files quoted below show it: `"use server"` actions with `requireTripAccess` + `revalidatePath`; `select`-narrowed Prisma queries; `cn()`; lucide icons with `aria-hidden`).
- Commit at the end of each task with the message given.
- The feature is gated behind an existing feed: filter UI only shows when a feed exists, and the flags live on the `CalendarFeed` row.

---

### Task 1: Schema flags + migration + client

**Files:**
- Modify: `prisma/schema.prisma` (the `CalendarFeed` model)
- Create: `prisma/migrations/20260622120000_calendar_feed_filter/migration.sql`

> **Why first:** every later task references the new fields, and the generated Prisma client must know about them before the action/route/UI can compile.

- [ ] **Step 1: Add the three flags to the `CalendarFeed` model**

In `prisma/schema.prisma`, the model is currently:
```prisma
model CalendarFeed {
  id        String   @id @default(cuid())
  tripId    String   @unique
  token     String   @unique
  createdAt DateTime @default(now())

  trip Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)
}
```
Change it to:
```prisma
model CalendarFeed {
  id        String   @id @default(cuid())
  tripId    String   @unique
  token     String   @unique
  createdAt DateTime @default(now())

  // Which event types this feed publishes. All default true so existing
  // feeds keep publishing everything until a member narrows them.
  includeTransport     Boolean @default(true)
  includeAccommodation Boolean @default(true)
  includeActivities    Boolean @default(true)

  trip Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2: Author the migration**

Create `prisma/migrations/20260622120000_calendar_feed_filter/migration.sql` with exactly:
```sql
-- Add per-feed type filters to CalendarFeed (default true = publish everything).
ALTER TABLE "CalendarFeed" ADD COLUMN "includeTransport" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CalendarFeed" ADD COLUMN "includeAccommodation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CalendarFeed" ADD COLUMN "includeActivities" BOOLEAN NOT NULL DEFAULT true;
```
(The `NOT NULL DEFAULT true` backfills any existing row. Do NOT touch `prisma/migrations/migration_lock.toml` — it already pins `postgresql`. The folder name sorts after `0_init`, so `prisma migrate deploy` applies it second.)

- [ ] **Step 3: Validate the schema and regenerate the client**

```bash
npx prisma validate
npx prisma generate
```
Expected: both succeed. `prisma generate` makes the new fields available on the TypeScript client (it reads `schema.prisma`, not the DB).

- [ ] **Step 4: Verify nothing regressed**

```bash
npm run test && npm run build
```
Expected: both exit 0 (no code references the new fields yet, so this is purely a no-op safety check that schema+generate didn't break the build).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260622120000_calendar_feed_filter/migration.sql
git commit -m "feat(feed): add type-filter flags to CalendarFeed schema

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Server actions — read + update the filter

**Files:**
- Modify: `server/actions/calendar-feed.ts`
- Test: `server/actions/calendar-feed.test.ts` (extend if it exists; create if not — first check with `ls server/actions/calendar-feed.test.ts`)

> **Why:** the settings panel needs to read the current flags (extend `getCalendarFeed`) and persist changes (new `updateCalendarFeedFilter`).

- [ ] **Step 1: Extend `getCalendarFeed` to return the flags**

In `server/actions/calendar-feed.ts`, change `getCalendarFeed` (currently returns `{ token } | null`) to:
```ts
export type CalendarFeedState = {
  token: string;
  includeTransport: boolean;
  includeAccommodation: boolean;
  includeActivities: boolean;
};

/**
 * Return the trip's calendar feed (token + type filters), or null if none.
 *
 * Access-checked: the calling user must be a member of the trip.
 */
export async function getCalendarFeed(
  tripId: string,
): Promise<CalendarFeedState | null> {
  await requireTripAccess(tripId);

  const feed = await db.calendarFeed.findFirst({
    where: { tripId },
    select: {
      token: true,
      includeTransport: true,
      includeAccommodation: true,
      includeActivities: true,
    },
  });

  return feed ?? null;
}
```

- [ ] **Step 2: Add `updateCalendarFeedFilter`**

Append to `server/actions/calendar-feed.ts`:
```ts
/**
 * Update which event types the trip's calendar feed publishes. No-op (safe)
 * when no feed exists. Same token/URL — calendars pick up the change on their
 * next refresh.
 *
 * Access-checked: the calling user must be a member of the trip.
 */
export async function updateCalendarFeedFilter(
  tripId: string,
  filter: {
    includeTransport: boolean;
    includeAccommodation: boolean;
    includeActivities: boolean;
  },
): Promise<void> {
  await requireTripAccess(tripId);

  await db.calendarFeed.updateMany({
    where: { tripId },
    data: {
      includeTransport: filter.includeTransport,
      includeAccommodation: filter.includeAccommodation,
      includeActivities: filter.includeActivities,
    },
  });

  revalidatePath(`/trips/${tripId}/settings`);
}
```

- [ ] **Step 3: Tests (write/extend, following the existing mock pattern)**

First read `server/actions/calendar-feed.test.ts` (if present) to copy its `vi.mock("@/lib/db", ...)` / `requireTripAccess` mocking style. If absent, mirror the mocking pattern used in a neighbouring action test (e.g. `server/actions/*.test.ts`). Add tests:
- `getCalendarFeed` returns the flags from the mocked `db.calendarFeed.findFirst` result (e.g. returns `{ token, includeTransport:false, ... }` when the mock yields that), and `null` when the mock yields `null`.
- `updateCalendarFeedFilter` calls `db.calendarFeed.updateMany` with `where: { tripId }` and the exact `data` flags passed, calls `requireTripAccess(tripId)`, and calls `revalidatePath`.

Run: `npx vitest run server/actions/calendar-feed.test.ts`
Expected: PASS.

- [ ] **Step 4: Verify + commit**

```bash
npm run test && npm run build
```
Expected: both exit 0.
```bash
git add server/actions/calendar-feed.ts server/actions/calendar-feed.test.ts
git commit -m "feat(feed): read and update calendar-feed type filters

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Feed route applies the filter

**Files:**
- Modify: `app/api/calendar/[token]/route.ts`
- Test: the route's existing test (find with `ls app/api/calendar/\[token\]/` and `grep -rln "api/calendar" --include=*.test.ts .`); extend it, or create one mirroring the repo's route-test style if none exists.

> **Why:** the route must read the feed's flags and exclude the unticked types. `buildICS` stays untouched — we just pass empty arrays for excluded types.

- [ ] **Step 1: Read the flags in the feed lookup**

In `app/api/calendar/[token]/route.ts`, change the `findUnique` select (currently `select: { trip: { select: { id: true, name: true } } }`) to also pull the flags:
```ts
  const feed = await db.calendarFeed.findUnique({
    where: { token },
    select: {
      includeTransport: true,
      includeAccommodation: true,
      includeActivities: true,
      trip: { select: { id: true, name: true } },
    },
  });
  if (!feed) {
    return NextResponse.json({ error: "Feed not found" }, { status: 404 });
  }
```

- [ ] **Step 2: Pass empty arrays for excluded types**

Change the `buildICS({...})` call so each filtered collection is gated on its flag (stops always passed — they're only for timezone lookup):
```ts
  const ics = buildICS({
    tripName: feed.trip.name,
    stops,
    items: feed.includeActivities ? items : [],
    transports: feed.includeTransport ? transports : [],
    accommodations: feed.includeAccommodation ? accommodations : [],
    generatedAt: new Date(),
  });
```
Leave the `Promise.all` queries and the response headers exactly as they are.

- [ ] **Step 3: Tests**

Find the existing route test. Extend it (or create one in the repo's style) with cases that mock `db.calendarFeed.findUnique` to return specific flag combinations and the four `findMany` calls to return one row each, then assert on the returned ICS string body:
- All flags true → body contains the transport marker (`✈`), the accommodation marker (`🛏 Stay:`), and an item summary.
- `includeTransport:false` → body does NOT contain `✈` / `CATEGORIES:Transport`, but still contains accommodation + item events.
- `includeAccommodation:false` → body does NOT contain `🛏 Stay:` / `CATEGORIES:Accommodation`.
- `includeActivities:false` → body does NOT contain the item's summary.

> Read `lib/ics.ts` to confirm the exact marker strings (`✈`, `🛏 Stay:`, `CATEGORIES:Transport`, `CATEGORIES:Accommodation`) before asserting, and read the existing route test to match how it invokes `GET` and reads the response body.

Run: `npx vitest run` against the route test path.
Expected: PASS.

- [ ] **Step 4: Verify + commit**

```bash
npm run test && npm run build
```
Expected: both exit 0.
```bash
git add "app/api/calendar/[token]/route.ts" "app/api/calendar/[token]/route.test.ts"
git commit -m "feat(feed): exclude unticked event types from the ICS feed

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
(Adjust the test path in `git add` to wherever the route test actually lives.)

---

### Task 4: Settings panel filter checkboxes

**Files:**
- Modify: `components/trip/settings/calendar-feed-panel.tsx`
- Modify: the settings page that renders `CalendarFeedPanel` (find with `grep -rn "CalendarFeedPanel\|getCalendarFeed" app components`)
- Test: `components/trip/settings/calendar-feed-panel.test.tsx` (extend if it exists; else create mirroring an existing component test)

> **Why:** expose the flags as three auto-saving checkboxes when a feed exists. There is no Checkbox primitive — use accessible native `<input type="checkbox">` inside a `<label>`.

- [ ] **Step 1: Extend the panel props + state**

In `components/trip/settings/calendar-feed-panel.tsx`:
- Import the new action: add `updateCalendarFeedFilter` to the existing import from `@/server/actions/calendar-feed`.
- Extend `CalendarFeedPanelProps`:
```ts
export interface CalendarFeedPanelProps {
  tripId: string;
  initialToken: string | null;
  initialFilter?: {
    includeTransport: boolean;
    includeAccommodation: boolean;
    includeActivities: boolean;
  };
}
```
- In the component signature destructure `initialFilter` with a default of all-true:
```ts
export function CalendarFeedPanel({
  tripId,
  initialToken,
  initialFilter = {
    includeTransport: true,
    includeAccommodation: true,
    includeActivities: true,
  },
}: CalendarFeedPanelProps) {
```
- Add filter state near the other `useState` hooks:
```ts
  const [filter, setFilter] = React.useState(initialFilter);
```
- Add an updater that optimistically sets local state then persists:
```ts
  const setType = (
    key: "includeTransport" | "includeAccommodation" | "includeActivities",
    value: boolean,
  ) => {
    const next = { ...filter, [key]: value };
    setFilter(next);
    startTransition(async () => {
      await updateCalendarFeedFilter(tripId, next);
    });
  };
```

- [ ] **Step 2: Render the checkboxes (only in the feed-exists branch)**

In the `return (...)` block that renders when a feed exists, insert this block between the URL box (`</div>` after `httpsUrl`) and the action buttons `<div className="flex flex-wrap gap-2">`:
```tsx
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">Include in feed</legend>
        {([
          ["includeTransport", "Transport"],
          ["includeAccommodation", "Accommodation"],
          ["includeActivities", "Activities"],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={filter[key]}
              disabled={isPending}
              onChange={(e) => setType(key, e.target.checked)}
            />
            {label}
          </label>
        ))}
      </fieldset>
```
Leave the existing copy/subscribe/regenerate/revoke buttons and the info paragraph unchanged. (The no-feed branch is unchanged — no filter UI without a feed.)

- [ ] **Step 3: Pass the initial filter from the settings page**

Open the settings page found via the grep above. It currently calls `getCalendarFeed(tripId)` and passes `initialToken={...}` to `<CalendarFeedPanel>`. `getCalendarFeed` now returns the full state (or null). Update the render so both token and filter are passed, e.g.:
```tsx
const feed = await getCalendarFeed(tripId);
// ...
<CalendarFeedPanel
  tripId={tripId}
  initialToken={feed?.token ?? null}
  initialFilter={
    feed
      ? {
          includeTransport: feed.includeTransport,
          includeAccommodation: feed.includeAccommodation,
          includeActivities: feed.includeActivities,
        }
      : undefined
  }
/>
```
Match the page's existing variable names/structure — read it first and adapt (it may already destructure `token`; if so, switch it to keep the whole `feed` object).

- [ ] **Step 4: Tests**

Mirror an existing component test's setup (mock `@/server/actions/calendar-feed`). Add to `calendar-feed-panel.test.tsx`:
- When rendered with a token and `initialFilter={{includeTransport:false, includeAccommodation:true, includeActivities:true}}`, the three checkboxes render with the matching checked state (query by accessible name "Transport"/"Accommodation"/"Activities").
- Toggling the "Transport" checkbox calls `updateCalendarFeedFilter` with `tripId` and the new flag set (`includeTransport:true`).
- When rendered with no token (`initialToken={null}`), the checkboxes are NOT shown (the create-feed prompt is shown instead).

Run: `npx vitest run components/trip/settings/calendar-feed-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify + commit**

```bash
npm run test && npm run build
```
Expected: both exit 0.
```bash
git add components/trip/settings/calendar-feed-panel.tsx components/trip/settings/calendar-feed-panel.test.tsx <settings-page-path>
git commit -m "feat(feed): settings checkboxes to choose which event types sync

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** one configurable feed (no new feed/token); three type toggles (Transport/Accommodation/Activities) defaulting on (T1 schema defaults); read+persist via actions (T2); route excludes unticked types via empty arrays into the unchanged `buildICS` (T3); auto-saving checkboxes shown only when a feed exists (T4). Place/country filtering and per-category granularity are intentionally OUT of scope (agreed fast-follow).
- **Placeholders:** none — schema, migration SQL, both actions, the route change, and the panel block are given in full. The two "find the file" steps (existing test location in T2/T3, settings-page render site in T4) are bounded greps with the exact edit specified.
- **Type/name consistency:** `CalendarFeedState` (T2) and the `initialFilter` shape (T4) use the same three field names as the schema (T1) and the route (T3): `includeTransport`, `includeAccommodation`, `includeActivities`. `updateCalendarFeedFilter(tripId, filter)` signature matches its call site in the panel.
- **Risk notes:** No live DB here, so the migration is authored not run — verified by `prisma validate` + `prisma generate` + green build; it applies at deploy. `updateMany` (not `update`) keeps the action a safe no-op if a feed was concurrently revoked. Unticking all three types yields a valid empty calendar (allowed by design). The only cross-file discovery is the settings-page render site — T4 Step 3 specifies exactly how to adapt it.
