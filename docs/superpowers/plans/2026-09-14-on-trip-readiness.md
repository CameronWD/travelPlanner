# On-Trip Readiness Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TEEPEE trip-ready for December: tickets available offline, a compact weather card, real check-in/checkout times, a "Day ideas" menu on free-form travelling days, one-current-number cost display, due-date payment alerts, and a "Getting around" category.

**Architecture:** Seven mostly-independent slices over the existing Next.js 15 RSC + Prisma + service-worker PWA stack. Pure logic goes in `lib/` (unit-tested), rendering in server components, interactivity in small client components. Schema changes are hand-authored SQL migrations (NEVER run locally — they apply on deploy, per ONBOARDING.md).

**Tech Stack:** Next.js 16.3 (App Router, RSC), Prisma 7.8 (Postgres), zod 4, vitest 4 + Testing Library, Tailwind, web-push.

## Global Constraints

- Work on branch `chore/on-trip-daily-view`. NEVER commit to `main`. NEVER deploy. NEVER run `prisma migrate dev`, `prisma migrate deploy` or `prisma db push` — author migration SQL by hand only. `npx prisma generate` after schema edits is fine (and required for types).
- The environment has `.env.production.local` with a REAL database URL. Do not run any script that writes to the database (`db:seed*`, `backfill:geocode`, `feedback:resolve` — the latter only in the final task).
- Domain language is law: CONTEXT.md defines **Day ideas** (L153-155), **Due date** (L93-95), **Category / Getting around** (L57-59), **Accommodation times** (L45-46), **one current number** (L86-88). Use these exact terms in UI copy and code comments. Never call things-to-do "activities"; never call the menu "suggestions".
- Single test file: `npx vitest run <path>` (preferred). Full suite: `npm test`. Typecheck: `npx tsc --noEmit`. Lint: `npm run lint`.
- Tests colocate next to source. Client components that import server actions MUST `vi.mock` the action module and `@/components/ui/use-toast` (see `components/trip/nearby-wishlist.test.tsx:1-15`). Server components test via `vi.hoisted` per-model db mocks (see `components/trip/home/phase-travelling.test.tsx:9-74`).
- Commit after every task with a conventional-commit message ending in `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Money display: `≈` ALWAYS means home-currency equivalent — never use it to mean "approximate cost".
- All new hand-written migrations go in `prisma/migrations/<YYYYMMDDHHMMSS>_<snake_name>/migration.sql`, timestamps `20260914000000`, `...001`, `...002` as assigned per task. Nullable columns only, no defaults needed.

---

### Task 1: "Getting around" category

**Files:**
- Modify: `lib/categories.ts:17-24`
- Modify: `components/trip/category-pill.tsx:48-59` (CATEGORY_COLOR_CLASSES), `:69-76` (CATEGORY_ACCENT_CLASSES)
- Modify: `components/trip/category-dot.ts:8-15` (DOT_CLASSES)
- Modify: `lib/demo/eu-trip.ts:44` (hand-duplicated union type)
- Test: `lib/categories.test.ts:11-20`

**Interfaces:**
- Produces: category value `"GETTING_AROUND"`, label `"Getting around"`, color `"indigo"` — available via `CATEGORIES` / `CATEGORY_VALUES` / `categorySchema` everywhere (validation, item form pills, globe forms, budget grouping pick it up automatically).

- [ ] **Step 1: Update the failing test first** — in `lib/categories.test.ts`, change the exact-array assertion:

```ts
it("exposes all seven item categories", () => {
  expect(CATEGORIES.map((c) => c.value)).toEqual([
    "SIGHTSEEING", "FOOD", "ACTIVITY", "NIGHTLIFE", "SHOPPING", "GETTING_AROUND", "OTHER",
  ]);
});
```

Add a new test asserting the meta:

```ts
it("labels Getting around in sentence case with the indigo colour", () => {
  expect(categoryMeta("GETTING_AROUND")).toEqual({
    value: "GETTING_AROUND", label: "Getting around", color: "indigo",
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/categories.test.ts` — expect FAIL (array mismatch, unknown category throw).

- [ ] **Step 3: Implement** — in `lib/categories.ts` insert between SHOPPING and OTHER:

```ts
  // Movement that does not change your base — day-trip buses, local trains,
  // metro passes. An Item category, never the Transport entity (CONTEXT.md).
  { value: "GETTING_AROUND", label: "Getting around", color: "indigo" },
```

In `category-pill.tsx` add to `CATEGORY_COLOR_CLASSES`:

```ts
  indigo:
    "border-indigo-200 bg-indigo-100 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
```

and to `CATEGORY_ACCENT_CLASSES`:

```ts
  indigo: { dot: "bg-indigo-500", borderL: "border-l-indigo-500" },
```

In `category-dot.ts` add to `DOT_CLASSES`: `indigo: "bg-indigo-500",`.

In `lib/demo/eu-trip.ts:44` add `| "GETTING_AROUND"` to the hand-written `ItemCategory` union (or replace the union with `import type { Category } from "@/lib/categories"` if the file's imports allow — prefer the import).

- [ ] **Step 4: Run** — `npx vitest run lib/categories.test.ts components/trip/category-pill.test.tsx` (if the pill test exists) — expect PASS. Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(categories): add Getting around category for day-trip transit`

---

### Task 2: Offline cache rules — pure layer

**Files:**
- Modify: `lib/offline.ts` (`isApiRoute` at L77-84, `cacheStrategyFor` at L108-131, JSDoc decision tree at L90-107, `tripOfflinePaths` at L24-38)
- Test: `lib/offline.test.ts`

**Interfaces:**
- Produces:
  - `export function isAttachmentRoute(url: string): boolean` — true only for `/api/attachments/<id>` (one path segment after).
  - `cacheStrategyFor` Rule 3a: GET same-origin attachment routes → `'network-first'` (checked BEFORE the general `/api/*` network-only rule).
  - `export interface WarmAttachment { url: string; size: number }`
  - `export const MAX_WARM_ATTACHMENT_BYTES = 10 * 1024 * 1024;` (matches the `validateUpload` ceiling in `lib/storage.ts:274` — defensive vs legacy rows)
  - `tripOfflinePaths(tripId, startDate, endDate, attachments?: WarmAttachment[]): string[]` — now also includes `/trips/<id>/files` in the base set and appends each attachment `url` with `size <= MAX_WARM_ATTACHMENT_BYTES`.

- [ ] **Step 1: Write failing tests** in `lib/offline.test.ts`. New describe in the URL-classification section:

```ts
describe('isAttachmentRoute', () => {
  it('returns true for attachment serve URLs', () => {
    expect(isAttachmentRoute('http://localhost:3000/api/attachments/abc123')).toBe(true);
  });
  it('returns false for other API routes and lookalikes', () => {
    expect(isAttachmentRoute('http://localhost:3000/api/attachments')).toBe(false);
    expect(isAttachmentRoute('http://localhost:3000/api/attachmentsfoo/x')).toBe(false);
    expect(isAttachmentRoute('http://localhost:3000/api/attachments/a/b')).toBe(false);
    expect(isAttachmentRoute('http://localhost:3000/api/trips/t1/cover')).toBe(false);
    expect(isAttachmentRoute('not a url')).toBe(false);
  });
});
```

In the `cacheStrategyFor` describe, a `// Rule 3a` cluster:

```ts
it('caches attachment bytes network-first (offline tickets)', () => {
  expect(cacheStrategyFor({ method: 'GET', url: `${origin}/api/attachments/abc`, sameOrigin: true }))
    .toBe('network-first');
});
it('keeps non-GET attachment requests network-only', () => {
  expect(cacheStrategyFor({ method: 'POST', url: `${origin}/api/attachments/abc`, sameOrigin: true }))
    .toBe('network-only');
});
it('keeps the trip cover route network-only (deliberately outside the carve-out)', () => {
  expect(cacheStrategyFor({ method: 'GET', url: `${origin}/api/trips/t1/cover`, sameOrigin: true }))
    .toBe('network-only');
});
```

In the `tripOfflinePaths` describe — update the existing exact-array test to include `/trips/t1/files` in the base six→seven, and add:

```ts
it('appends attachment urls within the size cap and skips oversized ones', () => {
  const paths = tripOfflinePaths('t1', null, null, [
    { url: '/api/attachments/small', size: 1024 },
    { url: '/api/attachments/huge', size: MAX_WARM_ATTACHMENT_BYTES + 1 },
  ]);
  expect(paths).toContain('/api/attachments/small');
  expect(paths).not.toContain('/api/attachments/huge');
});
it('warms no attachments when none are passed', () => {
  expect(tripOfflinePaths('t1', null, null).some((p) => p.startsWith('/api/'))).toBe(false);
});
```

- [ ] **Step 2: Run** — `npx vitest run lib/offline.test.ts` — expect FAIL (isAttachmentRoute undefined, array mismatch).

- [ ] **Step 3: Implement** in `lib/offline.ts`:

```ts
/**
 * Returns true for the authenticated attachment serve route
 * (`/api/attachments/<id>`), the ONE api path the service worker may cache:
 * ticket/booking files must be readable offline (ADR 0043, narrows ADR 0016).
 * The cache is purged on sign-out, so this leaks nothing across users.
 */
export function isAttachmentRoute(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return /^\/api\/attachments\/[^/]+$/.test(pathname);
  } catch {
    return false;
  }
}
```

In `cacheStrategyFor`, insert between Rule 2 and Rule 3:

```ts
  // Rule 3a: attachments (tickets, confirmations) are cacheable network-first
  // so they survive offline — the ONLY /api/* exception (ADR 0043).
  if (isAttachmentRoute(url)) {
    return 'network-first';
  }
```

Update the JSDoc decision tree (L90-107) with the 3a line. Extend `tripOfflinePaths`:

```ts
export interface WarmAttachment { url: string; size: number }

/** Attachments above this size are skipped by the warm (matches the upload cap). */
export const MAX_WARM_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function tripOfflinePaths(
  tripId: string,
  startDate: string | null,
  endDate: string | null,
  attachments: WarmAttachment[] = [],
): string[] {
  const base = `/trips/${tripId}`;
  const paths = [base, `${base}/plan`, `${base}/summary`, `${base}/today`, `${base}/checklists`, `${base}/files`, `${base}/help`];
  if (startDate && endDate && endDate >= startDate) {
    const span = Math.min(daysBetween(startDate, endDate), MAX_WARM_DAYS - 1);
    for (let i = 0; i <= span; i++) {
      paths.push(`${base}/day/${addDays(startDate, i)}`);
    }
  }
  for (const att of attachments) {
    if (att.size <= MAX_WARM_ATTACHMENT_BYTES) paths.push(att.url);
  }
  return paths;
}
```

- [ ] **Step 4: Run** — `npx vitest run lib/offline.test.ts` — expect PASS. `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(offline): attachment routes become cacheable and join the warm set`

---

### Task 3: Service worker mirror + cache version + storage.persist()

**Files:**
- Modify: `public/sw.js` (header L10, `isApiRoute` area L41-48, `getCacheStrategy` L62-81, `CACHE_VERSION` L22)
- Modify: `components/pwa-register.tsx`

**Interfaces:**
- Consumes: the Rule 3a semantics from Task 2 (`lib/offline.ts` is the stated source of truth; sw.js mirrors it in plain JS).
- Produces: SW that serves cached attachment bytes offline; `CACHE_VERSION = 'trip-planner-v3'`; best-effort `navigator.storage.persist()` on app load.

- [ ] **Step 1: Mirror the rule in `public/sw.js`** (no test harness exists for sw.js — `lib/offline.test.ts` from Task 2 is the executable spec). Add beside `isApiRoute`:

```js
function isAttachmentRoute(url) {
  try {
    const { pathname } = new URL(url);
    return /^\/api\/attachments\/[^/]+$/.test(pathname);
  } catch {
    return false;
  }
}
```

In `getCacheStrategy`, between Rule 2 and Rule 3:

```js
  // Rule 3a: attachments (tickets) are cacheable network-first — the ONLY
  // /api/* exception (ADR 0043). Cache purged on sign-out via CLEAR_CACHE.
  if (isAttachmentRoute(url)) return 'network-first';
```

Update the header strategy summary (L7-12) with a matching line, and bump L22 to `const CACHE_VERSION = 'trip-planner-v3';` (policy change → purge old caches).

- [ ] **Step 2: Request persistent storage** in `components/pwa-register.tsx`, inside the existing effect after registration:

```tsx
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* Fail silently */
    });
    // Ask the browser to protect our cache from storage-pressure eviction —
    // an installed PWA is generally granted this. Best-effort, fire-and-forget.
    navigator.storage?.persist?.().catch(() => {
      /* Fail silently */
    });
```

- [ ] **Step 3: Verify** — `npm run lint` and `npx tsc --noEmit` pass; eyeball that `lib/offline.ts` and `sw.js` rule order match exactly.

- [ ] **Step 4: Commit** — `feat(offline): mirror attachment rule in sw, bump cache to v3, request persistent storage`

---

### Task 4: Warm attachments end-to-end + open attachments in-app

**Files:**
- Modify: `app/(app)/trips/[tripId]/layout.tsx` (query at L44-75, `offlinePaths` at L93)
- Modify: `components/trip/attachment-links.tsx:9`, `components/trip/attachment-list.tsx:207-215`, `app/(app)/trips/[tripId]/journal/page.tsx:131-140`, `components/trip/journal-editor.tsx:78-90`
- Test: `components/trip/attachment-links.test.tsx`, `components/offline-warmer.test.tsx` (should still pass unchanged — warmer API is untouched)

**Interfaces:**
- Consumes: `tripOfflinePaths(tripId, start, end, attachments)` and `WarmAttachment` from Task 2.
- Produces: layout passes attachment URLs into the existing `<OfflineWarmer paths={...}/>`; all four attachment anchors open same-tab (no `target="_blank"`), so the installed-PWA webview stays under SW control and serves cached bytes offline.

- [ ] **Step 1: Update `attachment-links.test.tsx` to the new expectation first** — keep the `getByRole("link")` + href assertions, add:

```tsx
it("opens attachments in-app so the offline cache can serve them", () => {
  render(<AttachmentLinks attachments={[att]} />);
  const link = screen.getByRole("link", { name: /boarding\.pdf/i });
  expect(link).not.toHaveAttribute("target");
});
```

- [ ] **Step 2: Run** — `npx vitest run components/trip/attachment-links.test.tsx` — expect FAIL (`target="_blank"` present).

- [ ] **Step 3: Implement.** In each of the four anchors, delete `target="_blank" rel="noopener noreferrer"` (rel is only needed with target). Files/lines: `attachment-links.tsx:9`, `attachment-list.tsx:207-215`, `journal/page.tsx:131-140`, `journal-editor.tsx:78-90`. Do NOT touch the non-attachment `target="_blank"`s (external item links, map directions).

  In `layout.tsx`: add a fourth query to the existing `Promise.all` (L71-75):

```ts
    db.attachment.findMany({
      where: { tripId },
      select: { url: true, size: true },
    }),
```

  and thread it through: `const offlinePaths = tripOfflinePaths(tripId, trip.startDate, trip.endDate, warmAttachments);`

- [ ] **Step 4: Run** — `npx vitest run components/trip/attachment-links.test.tsx components/offline-warmer.test.tsx` plus any layout test — expect PASS. `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(offline): warm trip attachments and open them in-app for offline tickets`

---

### Task 5: ADR 0043 + narrow ADR 0016

**Files:**
- Create: `docs/adr/0043-attachments-warm-offline-through-the-authenticated-serve-route.md`
- Modify: `docs/adr/0016-offline-read-only-auto-warm.md` (the L13 consequence bullet)

**Interfaces:** none (docs).

- [ ] **Step 1: Write ADR 0043** following the 0039-0042 format (H1 `# 0043 — <decision as sentence>`, then `## Status` / `## Context` / `## Decision` / `## Considered Options` / `## Consequences`). Content requirements:
  - Status: `Accepted (2026-09-14). Narrows ADR 0016.`
  - Context: ADR 0016 excluded attachments claiming separate-origin + size; both are now false — attachments stream same-origin through `/api/attachments/:id` (authenticated, `Cache-Control: private`) and uploads are capped at 10 MiB (`lib/storage.ts` `validateUpload`).
  - Decision: Rule 3a carve-out (`isAttachmentRoute` → network-first), warm set includes every trip attachment ≤ `MAX_WARM_ATTACHMENT_BYTES`, `/trips/:id/files` joins the warm set, attachments open in-app, `navigator.storage.persist()` requested, `CACHE_VERSION` bumped.
  - Considered Options: per-file "save offline" button (rejected: manual steps get forgotten — same reasoning as 0016); caching inside `networkFirst` via Content-Length check (rejected: warmer already knows `size` from the DB); including `/api/trips/:tripId/cover` (rejected for now: cosmetic, not a ticket — deliberately out).
  - Consequences: the SW cache now holds private file bytes — equivalent exposure to the already-permitted `Cache-Control: private` browser cache, and purged by the same sign-out `CLEAR_CACHE`; the route's "never cache publicly" comment stays true (the SW cache is per-profile, not shared); verification still needs `next build` + prod server (SW is production-only).

- [ ] **Step 2: Narrow 0016** — replace its L13 bullet with:

```markdown
- File attachments were originally excluded from the warm set; ADR 0043 narrows this — they are now warmed through the authenticated same-origin serve route.
```

- [ ] **Step 3: Commit** — `docs(adr): 0043 attachments warm offline; narrow 0016`

---

### Task 6: Weather as a compact card beside the day header

**Files:**
- Modify: `components/trip/weather-daylight-card.tsx`
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx:388-419`
- Test: `components/trip/weather-daylight-card.test.tsx`, `app/(app)/trips/[tripId]/day/[date]/page.test.tsx`

**Interfaces:**
- Produces: `WeatherDaylightCard` gains `compact?: boolean` (intrinsic width, tighter type scale, no `flex-1` stretch). Day page exports `DAY_HEADER_GRID_CLASS = "flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"` and renders header (left) + compact weather card (right) inside it; `DayNav` stays full-width below.

- [ ] **Step 1: Write failing tests.** In `weather-daylight-card.test.tsx` (pure render, no mocks):

```tsx
it("compact variant does not stretch its blocks", () => {
  const { container } = render(
    <WeatherDaylightCard compact weather={weatherFixture} daylight={daylightFixture} />,
  );
  const card = container.querySelector(".bg-gradient-to-br");
  expect(card?.className).not.toMatch(/flex-1/);
});
```

(reuse the file's existing fixtures). In `day/[date]/page.test.tsx` (it already only asserts exported constants):

```tsx
it("lays the header and weather side by side on desktop", async () => {
  const { DAY_HEADER_GRID_CLASS } = await import("./page");
  expect(DAY_HEADER_GRID_CLASS).toContain("lg:grid-cols-[minmax(0,1fr)_auto]");
});
```

- [ ] **Step 2: Run** — `npx vitest run components/trip/weather-daylight-card.test.tsx "app/(app)/trips/[tripId]/day/[date]/page.test.tsx"` — expect FAIL.

- [ ] **Step 3: Implement.** In the card component add the prop and branch the classes — compact keeps the gradient, drops both `flex-1`s (intrinsic width via `w-fit` on the outer div), and keeps the Open-Meteo attribution:

```tsx
export function WeatherDaylightCard({ weather, daylight, compact = false }: Props) {
  ...
  <div className={compact ? "w-fit" : undefined}>
    <div className={cn(
      "flex gap-3 rounded-2xl bg-gradient-to-br from-sky-500 to-teal-500 p-4 text-white shadow-soft-lg",
      compact && "p-3 text-sm",
    )}>
      {/* inner blocks: replace `flex-1` with `flex` when compact */}
```

(Exact class juggling is the implementer's call; the test constraint is: no `flex-1` inside compact, gradient preserved so the existing gradient test keeps passing.)

In the day page, export the constant next to `DAY_READING_WIDTH_CLASS`:

```tsx
/** Header row: date/stop left, compact weather card right on desktop. Exported for tests. */
export const DAY_HEADER_GRID_CLASS =
  "flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start";
```

and restructure L388-419:

```tsx
<div className="flex flex-col gap-4">
  <div className={DAY_HEADER_GRID_CLASS}>
    <div className="flex flex-col gap-1">
      <h2 ...>{formatLongDate(effectiveDate)}</h2>
      {dayPlan.stop && (<p ...>...</p>)}
    </div>
    {dl && <WeatherDaylightCard compact weather={wx} daylight={dl} />}
  </div>
  <DayNav ... />
  <DayMapPanel ... />
```

(the standalone `{dl && <WeatherDaylightCard .../>}` at old L416 is removed — it moves into the grid).

- [ ] **Step 4: Run** — same two test files — expect PASS. `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(day): weather becomes a compact card beside the date header`

---

### Task 7: Accommodation times — schema, validation, actions

**Files:**
- Modify: `prisma/schema.prisma:310-334` (Accommodation model)
- Create: `prisma/migrations/20260914000000_accommodation_times/migration.sql`
- Modify: `lib/validations/accommodation.ts`
- Modify: `server/actions/accommodation.ts` (create data block L94-108, update data block L189-202)
- Modify: `lib/activity.ts:187-193` (ACCOMMODATION describeChanges field list)
- Modify: `lib/fork-plan.ts:252`, `server/actions/forks.ts:466,581,586` (fork copy/promote field passthrough)
- Test: `lib/validations/accommodation.test.ts` (or the existing validations test file)

**Interfaces:**
- Produces: `Accommodation.checkInTime String?` / `checkOutTime String?` (`"HH:mm"` in the stop's local timezone, same convention as `Item.startTime`); `accommodationSchema` accepts optional `checkInTime`/`checkOutTime` validated by the HH:MM regex; both persisted by create/update; fork copy and promote carry them; activity log describes changes to them.

- [ ] **Step 1: Write failing validation tests**:

```ts
it("accepts optional HH:MM check-in/out times", () => {
  const parsed = accommodationSchema.safeParse({
    ...validBase, checkInTime: "15:00", checkOutTime: "10:00",
  });
  expect(parsed.success).toBe(true);
});
it("rejects malformed times", () => {
  const parsed = accommodationSchema.safeParse({ ...validBase, checkInTime: "3pm" });
  expect(parsed.success).toBe(false);
});
```

(`validBase` = an existing minimal valid fixture in that test file; add one if missing: `{ stopId: "s1", name: "Hotel", checkIn: "2026-12-06", checkOut: "2026-12-08" }`.)

- [ ] **Step 2: Run** — `npx vitest run lib/validations/accommodation.test.ts` — expect FAIL.

- [ ] **Step 3: Implement.**

Schema (after `checkOut`):

```prisma
  checkInTime  String? // "HH:mm" in the stop's local timezone — optional (CONTEXT.md Accommodation)
  checkOutTime String? // "HH:mm"
```

Migration `prisma/migrations/20260914000000_accommodation_times/migration.sql`:

```sql
-- Optional check-in/check-out times: a timed check-in/out sits in the day's
-- Timeline at its time like a timed Item; untimed ones keep a fixed reading
-- order (CONTEXT.md "Accommodation"). Nullable, no backfill needed.
ALTER TABLE "Accommodation" ADD COLUMN "checkInTime" TEXT;
ALTER TABLE "Accommodation" ADD COLUMN "checkOutTime" TEXT;
```

Run `npx prisma generate` (types only — do NOT run migrate).

Validation — copy the item-time idiom (`lib/validations/item.ts:11-14`):

```ts
const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format (24h)");
```

add to the schema object: `checkInTime: hhmm.optional(), checkOutTime: hhmm.optional(),`.

Actions — add `checkInTime: parsed.data.checkInTime ?? null, checkOutTime: parsed.data.checkOutTime ?? null,` to both the create (L94-108) and update (L189-202) data blocks.

Activity — add `"checkInTime"` and `"checkOutTime"` to the ACCOMMODATION field list in `lib/activity.ts:187-193` (labels like the neighbours, e.g. `checkInTime: "check-in time"`).

Fork paths — add both fields wherever accommodation fields are copied: `lib/fork-plan.ts:252` and the promote/copy blocks at `server/actions/forks.ts:466,581,586` (grep `checkOut:` in those files to find every copy shape — each gets the two new fields).

- [ ] **Step 4: Run** — `npx vitest run lib/validations/accommodation.test.ts server/actions/accommodation.test.ts lib/fork-plan.test.ts` — expect PASS. `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(accommodation): optional check-in/out times through schema, validation, actions`

---

### Task 8: Accommodation times — itinerary ordering (`orderDayEntries`)

**Files:**
- Modify: `lib/itinerary.ts` (`ItineraryAccommodation` L55-64; new exports at the bottom)
- Test: `lib/itinerary.test.ts`

**Interfaces:**
- Consumes: `checkInTime`/`checkOutTime` from Task 7.
- Produces (later tasks rely on these EXACT names):

```ts
export interface OrderedDay {
  /** Everything above the Anytime section, in reading order. */
  entries: DayEntry[];
  /** Untimed items, rendered under an "Anytime" header. */
  anytime: ItemEntry[];
}
export function orderDayEntries(day: DayPlan): OrderedDay;
/** True when the day has no scheduled Items (Day ideas trigger — CONTEXT.md "free-form"). */
export function isFreeFormDay(day: DayPlan): boolean;
```

Ordering rule (the executable form of CONTEXT.md "Accommodation"):
1. untimed check-outs (check-out first thing on its day)
2. transport entries (existing relative order)
3. untimed check-ins (check-in after that day's Transport)
4. the timed merge — timed items + timed check-outs + timed check-ins, sorted by HH:MM lexicographically; ties break check-out(0) < item(1) < check-in(2)
5. `anytime` = untimed items (unchanged).

- [ ] **Step 1: Write failing tests** in `lib/itinerary.test.ts` (reuse `makeAccom`/`BASE` fixtures; extend `makeAccom` defaults with `checkInTime: null, checkOutTime: null` if the factory needs it):

```ts
describe("orderDayEntries", () => {
  it("puts an untimed check-out first and an untimed check-in after transport", () => {
    // day with: untimed item, one transport departure, checkout (untimed), checkin (untimed)
    const day = buildItinerary({ ...fixtureWithAll }).find((d) => d.dateISO === "2026-07-05")!;
    const kinds = orderDayEntries(day).entries.map((e) => e.kind);
    expect(kinds.indexOf("accommodation-checkout")).toBe(0);
    expect(kinds.indexOf("accommodation-checkin")).toBeGreaterThan(kinds.indexOf("transport-departure"));
  });
  it("slots a timed check-out among timed items by time (bakery 08:00 before 10:00 checkout)", () => {
    // item 08:00 "Bakery", checkout with checkOutTime "10:00", item 11:00
    const ordered = orderDayEntries(day).entries;
    const labels = ordered.map((e) =>
      e.kind === "item" ? e.item.title : e.kind,
    );
    expect(labels).toEqual(["Bakery", "accommodation-checkout", "Museum"]);
  });
  it("ties at the same minute break checkout < item < checkin", () => { ... });
});
describe("isFreeFormDay", () => {
  it("is true when the day has no scheduled items, even with a check-out", () => { ... });
  it("is false when a timed or untimed item exists", () => { ... });
});
```

Build the fixtures with `buildItinerary` directly (the factories exist). Also update `ItineraryAccommodation` fixtures where needed.

- [ ] **Step 2: Run** — `npx vitest run lib/itinerary.test.ts` — expect FAIL (exports missing).

- [ ] **Step 3: Implement** in `lib/itinerary.ts`. Extend the interface:

```ts
export interface ItineraryAccommodation {
  ...
  checkInTime?: string | null;  // HH:MM
  checkOutTime?: string | null; // HH:MM
}
```

Then:

```ts
export interface OrderedDay {
  entries: DayEntry[];
  anytime: ItemEntry[];
}

/** Tie-break rank inside the timed merge: leave before do before arrive. */
const TIMED_RANK: Record<string, number> = {
  "accommodation-checkout": 0,
  item: 1,
  "accommodation-checkin": 2,
};

function timedKey(entry: DayEntry): string | null {
  switch (entry.kind) {
    case "item":
      return entry.item.startTime ?? null;
    case "accommodation-checkin":
      return entry.accommodation.checkInTime ?? null;
    case "accommodation-checkout":
      return entry.accommodation.checkOutTime ?? null;
    default:
      return null;
  }
}

/**
 * Flatten a DayPlan into reading order (CONTEXT.md "Accommodation"):
 * untimed check-outs → transport → untimed check-ins → the timed merge
 * (timed items + timed check-ins/outs by HH:MM). Untimed items stay a
 * separate "Anytime" bucket.
 */
export function orderDayEntries(day: DayPlan): OrderedDay {
  const checkouts = day.accommodationEntries.filter((e) => e.kind === "accommodation-checkout");
  const checkins = day.accommodationEntries.filter((e) => e.kind === "accommodation-checkin");
  const timed: DayEntry[] = [
    ...checkouts.filter((e) => e.accommodation.checkOutTime),
    ...day.timedItems,
    ...checkins.filter((e) => e.accommodation.checkInTime),
  ].sort((a, b) => {
    const ta = timedKey(a)!;
    const tb = timedKey(b)!;
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (TIMED_RANK[a.kind] ?? 1) - (TIMED_RANK[b.kind] ?? 1);
  });
  return {
    entries: [
      ...checkouts.filter((e) => !e.accommodation.checkOutTime),
      ...day.transportEntries,
      ...checkins.filter((e) => !e.accommodation.checkInTime),
      ...timed,
    ],
    anytime: day.untimedItems,
  };
}

/** No scheduled Items on this day — the Day ideas trigger (CONTEXT.md "free-form"). */
export function isFreeFormDay(day: DayPlan): boolean {
  return day.timedItems.length === 0 && day.untimedItems.length === 0;
}
```

- [ ] **Step 4: Run** — `npx vitest run lib/itinerary.test.ts` — expect PASS.

- [ ] **Step 5: Commit** — `feat(itinerary): orderDayEntries merges timed accommodation into the day; isFreeFormDay`

---

### Task 9: Accommodation times — renderers, projections, form

**Files:**
- Modify: `components/trip/timeline.tsx` (render order L86-137; `AccomCheckinRow` L437-475, `AccomCheckoutRow` L477-509)
- Modify: `app/(app)/trips/[tripId]/print/page.tsx:408-424`, `app/share/[token]/page.tsx:414-426, 523-535`
- Modify the five accommodation projection sites (add `checkInTime`/`checkOutTime` to both the Prisma `select` and the `.map()`): `day/[date]/page.tsx` (select L124-139, map L219-228), `calendar/page.tsx` (select ~L75, map ~L173), `print/page.tsx` (select ~L105, map ~L214), `share/[token]/page.tsx` (select ~L121, map ~L198), `components/trip/home/phase-travelling.tsx` (select L119-134, map L253-262)
- Modify: `components/trip/accommodation-form-dialog.tsx` (FormErrors L33-46, state L213-224, payload L278-296, fields L330-348), `components/trip/accommodation-card.tsx:18-29` (`AccommodationCardAccommodation` type)
- Test: `components/trip/timeline.test.tsx`

**Interfaces:**
- Consumes: `orderDayEntries(day): OrderedDay` from Task 8; `checkInTime`/`checkOutTime` on `accommodationSchema` from Task 7.

- [ ] **Step 1: Write failing Timeline tests** (fixtures are full `DayPlan` literals in that file):

```tsx
it("renders an untimed check-out before everything else on the day", () => {
  const { container } = render(<Timeline day={dayWithCheckoutAndItems} variant="day" />);
  const text = container.textContent ?? "";
  expect(text.indexOf("Check-out")).toBeLessThan(text.indexOf(TIMED_ITEM_TITLE));
});
it("slots a timed check-out at its time and shows the time in the gutter", () => {
  render(<Timeline day={dayWithTimedCheckout} variant="day" />);
  expect(screen.getByText("10:00")).toBeInTheDocument();
  // 08:00 bakery renders above the 10:00 check-out
  const text = document.body.textContent ?? "";
  expect(text.indexOf("Bakery")).toBeLessThan(text.indexOf("Check-out"));
});
it("renders an untimed check-in after transport entries", () => { ... });
```

- [ ] **Step 2: Run** — `npx vitest run components/trip/timeline.test.tsx` — expect FAIL (current order: check-in first).

- [ ] **Step 3: Implement.**

`timeline.tsx`: replace the five hard-coded blocks (L86-137) with one loop over `orderDayEntries`:

```tsx
const { entries, anytime } = orderDayEntries(day);
...
{entries.map((entry) => {
  switch (entry.kind) {
    case "accommodation-checkout":
      return <AccomCheckoutRow key={`out-${entry.accommodation.id}`} ... />;
    case "accommodation-checkin":
      return <AccomCheckinRow key={`in-${entry.accommodation.id}`} ... />;
    case "transport-departure":
    case "transport-arrival":
      return <TransportRow key={...} ... />;
    case "item":
      return <TimedItemRow key={entry.item.id} ... />;
  }
})}
{anytime.length > 0 && ( /* existing "Anytime" header + UntimedItemRow loop, unchanged */ )}
```

Preserve every existing prop each row received (itemDirections, attachmentsByTarget, showUnschedule, isDay). In `AccomCheckinRow`/`AccomCheckoutRow`, replace `<TimeGutter time={null} .../>` with `time={a.checkInTime ?? null}` / `time={a.checkOutTime ?? null}`.

`print/page.tsx` and `share/[token]/page.tsx`: replace their hand-rolled accommodation blocks with the same `orderDayEntries(day)` loop shape (they already import from `@/lib/itinerary`); keep their local row markup.

Projections: add the two fields to all five selects and maps (the map lines pass `checkIn`/`checkOut` today — add `checkInTime: a.checkInTime, checkOutTime: a.checkOutTime` beside them).

Form dialog: add to `FormErrors`: `checkInTime?: string[]; checkOutTime?: string[]`. State:

```ts
const [checkInTime, setCheckInTime] = React.useState(accommodation?.checkInTime ?? "");
const [checkOutTime, setCheckOutTime] = React.useState(accommodation?.checkOutTime ?? "");
```

Fields — a second 2-col grid directly under the date grid (copy the `item-form-dialog.tsx:462-488` idiom):

```tsx
<div className="grid grid-cols-2 gap-3">
  <Field label="Check-in time" error={(errors as FormErrors).checkInTime?.[0]}>
    <Input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} disabled={isPending} />
  </Field>
  <Field label="Check-out time" error={(errors as FormErrors).checkOutTime?.[0]}>
    <Input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} disabled={isPending} />
  </Field>
</div>
```

Payload: `...(checkInTime ? { checkInTime } : {}), ...(checkOutTime ? { checkOutTime } : {}),`. Add both fields (`string | null`) to `AccommodationCardAccommodation` so edit prefill works.

Deliberately unchanged: `lib/ics.ts` keeps emitting all-day accommodation VEVENTs (calendar feed granularity is a separate decision); `month-grid.tsx` icon chips.

- [ ] **Step 4: Run** — `npx vitest run components/trip/timeline.test.tsx components/trip/accommodation-form-dialog.test.tsx lib/itinerary.test.ts` then `npx tsc --noEmit` (this catches any missed projection site).

- [ ] **Step 5: Commit** — `feat(accommodation): times render in day order across timeline, print, share; form inputs`

---

### Task 10: One current number on individual cost rows

**Files:**
- Modify: `components/trip/cost-summary.tsx:34-105`
- Modify: `components/trip/other-cost-editor.tsx:447-468`
- Modify: `components/trip/cost-checklist.tsx:118-120`
- Modify: `CONTEXT.md:86-88` (one wording fix)
- Test: `components/trip/cost-summary.test.tsx`, `components/trip/other-cost-editor.test.tsx`, `components/trip/cost-checklist.test.tsx`

**Interfaces:**
- Consumes: `CostRow` (`server/actions/costs.ts:368`), `formatMoney` from `lib/money.ts`.
- Produces: the display rule — a row shows the cost amount while unpaid; once `paidAt` is set it shows the paid amount, emerald, with `CheckCircle2` and the word "paid". `≈ <home amount>` (home-currency equivalent) is unchanged. `CostAmounts` (aggregates) is untouched.

- [ ] **Step 1: Write failing tests.**

`cost-summary.test.tsx`:

```tsx
it("shows only the cost amount while unpaid, even if a stale paidMinor exists", () => {
  render(<CostSummary cost={{ ...base, costMinor: 12000, paidMinor: 11800, paidAt: null }} />);
  expect(screen.getByText(/120\.00/)).toBeInTheDocument();
  expect(screen.queryByText(/118\.00/)).not.toBeInTheDocument();
});
it("shows only the paid amount once paid", () => {
  render(<CostSummary cost={{ ...base, costMinor: 12000, paidMinor: 11800, paidAt: new Date() }} />);
  expect(screen.getByText(/118\.00/)).toBeInTheDocument();
  expect(screen.queryByText(/120\.00/)).not.toBeInTheDocument();
  expect(screen.getByText(/paid/i)).toBeInTheDocument();
});
```

`cost-checklist.test.tsx`: paid rows show `paidMinor` not `costMinor` (same shape). `other-cost-editor.test.tsx`: the row shows one amount; update the existing assertions that expected `→ ... paid` side-by-side.

- [ ] **Step 2: Run** — `npx vitest run components/trip/cost-summary.test.tsx components/trip/cost-checklist.test.tsx components/trip/other-cost-editor.test.tsx` — expect FAIL.

- [ ] **Step 3: Implement.** In each component the shown amount becomes:

```ts
const isPaid = Boolean(cost.paidAt);
const shownMinor = isPaid && cost.paidMinor != null ? cost.paidMinor : cost.costMinor;
```

- `cost-summary.tsx`: render `formatMoney(shownMinor, cost.currency)` once; when `isPaid` add the existing emerald classes + `CheckCircle2` + "paid"; keep the `≈ home` line computed from `shownMinor`.
- `other-cost-editor.tsx:447-468`: one amount + paid state; drop the `→ {paid} paid` arrow pair; keep `≈ home`.
- `cost-checklist.tsx:118-120`: `formatMoney(row.paidAt && row.paidMinor != null ? row.paidMinor : row.costMinor, row.currency)`.
- `CONTEXT.md`: change "(marked approximate)" in the Cost entry to "(the paid state is what gets marked)" — the paid row carries the badge; unpaid is the unmarked default (avoids inventing a second `≈`).

- [ ] **Step 4: Run** — the three test files + `npx vitest run components/trip/cost-amounts.test.tsx` (must still pass untouched) — expect PASS.

- [ ] **Step 5: Commit** — `feat(costs): individual rows show one current number (resolves two-payments feedback)`

---

### Task 11: Due date — schema, validation, editors

**Files:**
- Modify: `prisma/schema.prisma:374-397` (Cost model)
- Create: `prisma/migrations/20260914000001_cost_due_date/migration.sql`
- Modify: `lib/validations/cost.ts`
- Modify: `server/actions/costs.ts` (create L160-172, update L228-248, `CostRow` L368)
- Modify: `components/trip/cost-editor.tsx` (FormState L48-56, costToFormState L68-84, parseFormToInput L229-251, dialog JSX), `components/trip/other-cost-editor.tsx` (FormState L69-77, costToFormState L91-107, parseFormToInput L118-143, dialog JSX ~L271)
- Modify: every cost `select` that feeds `CostRow`/`SpendCost` — add `dueDate: true`: `app/(app)/trips/[tripId]/budget/page.tsx:34-45` (COST_SELECT), `components/trip/home/phase-planning.tsx:32-43` (COST_SELECT), `components/trip/home/phase-travelling.tsx:135-149`, plus grep `paidAt: true` across `app/` and `components/` for any other cost select (plan page / cards) and add it there too.
- Test: `lib/validations/cost.test.ts` (or wherever costSchema tests live), `components/trip/cost-editor.test.tsx`

**Interfaces:**
- Produces: `Cost.dueDate String?` (`"YYYY-MM-DD"` — calendar-date convention per schema header); `costSchema` accepts optional `dueDate`; `CostRow` gains `dueDate: string | null`; both cost editors offer a "Due date (optional)" `DateField` visible only while NOT paid; `createCost`/`updateCost` persist it. Creation-time inline cost fields (`inline-cost-fields.tsx`) deliberately do NOT get the field — a due date is added by editing the cost (keeps three entity schemas untouched; YAGNI).

- [ ] **Step 1: Write failing tests.** Validation:

```ts
it("accepts an optional YYYY-MM-DD due date", () => {
  expect(costSchema.safeParse({ ...validCost, dueDate: "2026-11-20" }).success).toBe(true);
});
it("rejects a malformed or impossible due date", () => {
  expect(costSchema.safeParse({ ...validCost, dueDate: "20-11-2026" }).success).toBe(false);
  expect(costSchema.safeParse({ ...validCost, dueDate: "2026-02-31" }).success).toBe(false);
});
```

`cost-editor.test.tsx`: editing an unpaid cost shows a "Due date" input; a paid cost does not.

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3: Implement.**

Schema (after `paidAt`):

```prisma
  dueDate        String? // "YYYY-MM-DD" — when an unpaid cost's money leaves the account (CONTEXT.md "Due date")
```

and `@@index([dueDate])` beside the existing indexes. Migration:

```sql
-- Due date on unpaid Costs: money committed but not yet taken (a scheduled
-- Airbnb charge). Drives Upcoming payments + push alerts (CONTEXT.md "Due date").
ALTER TABLE "Cost" ADD COLUMN "dueDate" TEXT;
CREATE INDEX "Cost_dueDate_idx" ON "Cost"("dueDate");
```

`npx prisma generate`.

Validation — beside `paidAtStringSchema`:

```ts
const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD")
  .refine(isRealCalendarDate, "Due date must be a real calendar date");
```

add `dueDate: dueDateSchema.optional(),` to `costSchema`.

Actions: `dueDate: parsed.data.dueDate ?? null` in both data blocks; add `dueDate: string | null` to `CostRow`. `markCostPaid` is unchanged — every consumer filters on `paidAt == null`, so paying silences alerts automatically.

Editors: add `dueDate: string` to both FormStates (`""` default; `costToFormState` maps `cost.dueDate ?? ""`); in `parseFormToInput`, `...(form.dueDate && !form.paid ? { dueDate: form.dueDate } : {})`; in the dialog JSX render, between the Paid checkbox and the `{form.paid && ...}` branch:

```tsx
{!form.paid && (
  <DateField
    label="Due date (optional)"
    value={form.dueDate}
    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
    disabled={isPending}
  />
)}
```

(match each file's local state-update idiom; `DateField` is `@/components/ui/date-field`).

- [ ] **Step 4: Run** — validation + both editor test files + `npx tsc --noEmit` (catches missed selects) — expect PASS.

- [ ] **Step 5: Commit** — `feat(costs): due date on unpaid costs through schema, validation, editors`

---

### Task 12: Upcoming payments — lib, card, mounts

**Files:**
- Create: `lib/cost-labels.ts`, `lib/upcoming-payments.ts`
- Create: `components/trip/upcoming-payments-card.tsx`
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx` (reuse label logic L140-156, mount before the checklist Card ~L394)
- Modify: `components/trip/home/phase-planning.tsx` (right rail L357-371), `components/trip/home/phase-travelling.tsx` (right rail, after `SpendSoFarCard` L504)
- Test: `lib/upcoming-payments.test.ts`, `components/trip/upcoming-payments-card.test.tsx`

**Interfaces:**
- Consumes: `CostRow.dueDate` (Task 11), `daysBetween` from `lib/dates.ts` (`daysBetween(today, dueDate)` = days until), `formatMoney`.
- Produces:

```ts
// lib/cost-labels.ts — extraction of budget/page.tsx:140-156, used by budget page, both Homes, and the cron.
export interface CostLabelSources {
  items: { id: string; title: string }[];
  accommodations: { id: string; name: string }[];
  transports: { id: string; mode: string; depPlace: string | null; arrPlace: string | null }[];
}
export function buildCostLabelMap(sources: CostLabelSources): Map<string, string>;
export function costLabel(
  cost: { ownerType: string; ownerId: string | null; label: string | null },
  ownerNames: Map<string, string>,
): string; // OTHER → cost.label ?? "Other cost"; owned → ownerNames.get(ownerId) ?? fallback by type

// lib/upcoming-payments.ts
export interface UpcomingPayment {
  costId: string; label: string; costMinor: number; currency: string;
  dueDate: string; daysUntil: number; // negative = overdue
}
export function buildUpcomingPayments(input: {
  costs: { id: string; costMinor: number; currency: string; paidAt: Date | null; dueDate: string | null;
           ownerType: string; ownerId: string | null; label: string | null }[];
  ownerNames: Map<string, string>;
  today: string; // YYYY-MM-DD
}): UpcomingPayment[]; // unpaid + dueDate != null, sorted dueDate asc

// components/trip/upcoming-payments-card.tsx — server-safe (no "use client")
export function UpcomingPaymentsCard({ payments, tripId }: { payments: UpcomingPayment[]; tripId: string }): JSX.Element | null;
// renders null when payments is empty; each row: label · formatMoney · "comes out in N days" / "comes out today" / "was due N days ago"; links to /trips/<id>/budget
```

- [ ] **Step 1: Write failing lib tests**:

```ts
it("lists only unpaid costs with a due date, soonest first", () => {
  const rows = buildUpcomingPayments({
    costs: [
      cost({ id: "a", dueDate: "2026-11-20" }),
      cost({ id: "b", dueDate: "2026-10-01" }),
      cost({ id: "paid", dueDate: "2026-10-01", paidAt: new Date() }),
      cost({ id: "none", dueDate: null }),
    ],
    ownerNames: new Map(), today: "2026-09-14",
  });
  expect(rows.map((r) => r.costId)).toEqual(["b", "a"]);
});
it("computes daysUntil including overdue as negative", () => { ... });
```

and card tests (pure render): empty → renders nothing; row copy "comes out in 3 days" / "comes out today".

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3: Implement.** `buildCostLabelMap` is a lift-and-move of budget/page.tsx L140-156 (`transportLabel` + ownerName map) — refactor the budget page to import it (behaviour identical). `buildUpcomingPayments` filters `paidAt == null && dueDate != null`, maps `daysUntil: daysBetween(input.today, c.dueDate)`, sorts by `dueDate` then label. Card: a `rounded-2xl border border-border bg-card` section titled "Upcoming payments", rows with the label, `formatMoney(costMinor, currency)`, and the relative phrase (`daysUntil === 0 ? "comes out today" : daysUntil === 1 ? "comes out tomorrow" : daysUntil > 1 ? \`comes out in ${daysUntil} days\` : \`was due ${-daysUntil} day(s) ago\``), overdue rows in `text-amber-600 dark:text-amber-400`.

Mounts (all three surfaces already fetch costs + the label sources):
- Budget page: build `ownerNames` via the new lib, `const upcoming = buildUpcomingPayments({ costs: allCosts, ownerNames, today })` (`today` = `todayISOInZone(...)` — the page already computes or can compute it the way phase-planning does), render `<UpcomingPaymentsCard payments={upcoming} tripId={tripId} />` in the main column above the "Mark off what you've paid" card, real-plan only (`!activeFork`).
- `phase-planning.tsx`: build the same and insert `{upcomingEl}` in the right rail between `{money}` and `{actions}`.
- `phase-travelling.tsx`: insert after `<SpendSoFarCard ... />` in the rail.

- [ ] **Step 4: Run** — new lib + card tests, plus `npx vitest run "app/(app)/trips/[tripId]/budget/page.test.tsx" components/trip/home/phase-travelling.test.tsx` (db-mock tests: add `dueDate: null` to cost fixtures if shapes complain) — expect PASS. `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(budget): upcoming payments list on budget and home (resolves scheduled-payments feedback)`

---

### Task 13: Due-date push alerts in the reminders cron

**Files:**
- Modify: `app/api/cron/reminders/route.ts` (add a second pass after the Reminder loop, ~L161)
- Test: `app/api/cron/reminders/route.test.ts`

**Interfaces:**
- Consumes: `Cost.dueDate`, `buildCostLabelMap`/`costLabel` (Task 12), `sendPush`/`buildNotificationPayload` (`lib/push.ts`), `formatMoney`, `daysBetween`.
- Produces: at most two pushes per due-dated cost — at `daysUntil === 3` and `daysUntil === 0` (UTC calendar) — body `"<label> · <money> comes out in 3 days"` / `"… comes out today"`, url `/trips/<tripId>/budget`. Idempotency: a sent alert writes a marker `Reminder` row `{ tripId, title: <the body>, fireAt: <alert instant>, sent: true, targetType: "COST_DUE", targetId: cost.id }`; before sending, skip if a marker with the same `targetType/targetId/fireAt` exists. Marking the cost paid silences future alerts via the `paidAt: null` filter — no cleanup needed.

- [ ] **Step 1: Write failing route tests** following the file's existing db-mock conventions (it already mocks `db` + `lib/push`). Cases:

```ts
it("pushes a 3-days-before alert for an unpaid cost due in 3 days and records a COST_DUE marker", async () => {
  costFindManyMock.mockResolvedValue([dueCost({ dueDate: threeDaysFromNow })]);
  reminderFindFirstMock.mockResolvedValue(null);
  // ... invoke GET, expect sendPush called with payload containing "comes out in 3 days",
  // expect reminderCreateMock called with { targetType: "COST_DUE", targetId: dueCost.id, sent: true }
});
it("skips a cost whose marker for this alert already exists", async () => { ... });
it("ignores paid costs and costs due at other offsets", async () => { ... });
```

- [ ] **Step 2: Run** — `npx vitest run app/api/cron/reminders/route.test.ts` — expect FAIL.

- [ ] **Step 3: Implement** after the existing loop (reusing `now`, and the trip-members/subscription send machinery — extract the "send payload to a trip's members" block into a local `async function pushToTripMembers(tripId: string, payload: string)` if it isn't already reusable):

```ts
// ── Second pass: due-date payment alerts (CONTEXT.md "Due date") ───────────
const ALERT_OFFSETS_DAYS = [3, 0] as const;
const todayUTC = now.toISOString().slice(0, 10);

const dueCosts = await db.cost.findMany({
  where: { dueDate: { not: null }, paidAt: null, forkId: null },
  select: {
    id: true, tripId: true, dueDate: true, costMinor: true, currency: true,
    label: true, ownerType: true, ownerId: true,
  },
});

for (const cost of dueCosts) {
  const daysUntil = daysBetween(todayUTC, cost.dueDate!);
  if (!ALERT_OFFSETS_DAYS.includes(daysUntil as 3 | 0)) continue;

  const alertInstant = new Date(`${todayUTC}T00:00:00.000Z`);
  const existing = await db.reminder.findFirst({
    where: { targetType: "COST_DUE", targetId: cost.id, fireAt: alertInstant },
    select: { id: true },
  });
  if (existing) continue;

  const label = await labelForCost(cost); // batch-load owner names per trip via buildCostLabelMap
  const money = formatMoney(cost.costMinor, cost.currency);
  const body = daysUntil === 0
    ? `${label} · ${money} comes out today`
    : `${label} · ${money} comes out in ${daysUntil} days`;

  const payload = buildNotificationPayload({
    title: "Payment coming up", body, url: `/trips/${cost.tripId}/budget`,
  });
  await pushToTripMembers(cost.tripId, payload);

  await db.reminder.create({
    data: {
      tripId: cost.tripId, title: body, fireAt: alertInstant, sent: true,
      targetType: "COST_DUE", targetId: cost.id,
    },
  });
}
```

For `labelForCost`, group `dueCosts` by trip and load `{ item.title / accommodation.name / transport places }` per trip in one `Promise.all`, then `costLabel(cost, ownerNames)` — mirror `buildCostLabelMap` inputs. Extend the route's returned JSON with `{ dueAlerts: <count> }`.

- [ ] **Step 4: Run** — the route tests — expect PASS. `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `feat(cron): push alerts 3 days before and on the day a cost comes out`

---

### Task 14: `Item.countryCode` — schema + population + backfill

**Files:**
- Modify: `prisma/schema.prisma:336-372` (Item model)
- Create: `prisma/migrations/20260914000002_item_country_code/migration.sql`
- Modify: `server/actions/items.ts` (geocode-on-create ~L108-115: store the resolved `countryCode`; same in update if it re-geocodes), `lib/marker-to-item.ts` (copy `marker.countryCode`)
- Modify: `scripts/backfill-geocode.ts` (also write `countryCode` for items it locates — author only, never run)
- Test: existing `server/actions/items.test.ts` / `lib/marker-to-item.test.ts` extensions

**Interfaces:**
- Produces: `Item.countryCode String?` — lowercase ISO 3166-1 alpha-2, same convention as `Stop.countryCode` and `Marker.countryCode`. Populated when geocoding resolves on create/update and when seeding from a Globe Marker. Old rows stay null (they fall into Day ideas' "unattributed" bucket, which still shows them — no data dependency).

- [ ] **Step 1: Write failing tests** — `marker-to-item` copies `countryCode`; `createItem` stores the geocoder's `countryCode` when it resolves a location (follow that test file's existing geocode-mock pattern).

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3: Implement.** Schema (after `lng`):

```prisma
  countryCode String? // ISO 3166-1 alpha-2, lowercase, derived by geocoding — same as Stop/Marker
```

Migration:

```sql
-- Derived country on Items so Day ideas can country-match wishlist ideas to
-- the current Stop (CONTEXT.md "Day ideas", ADR 0044). Nullable; backfilled
-- lazily by scripts/backfill-geocode.ts for located rows.
ALTER TABLE "Item" ADD COLUMN "countryCode" TEXT;
```

`npx prisma generate`. In `server/actions/items.ts`, where `reverseGeocode`/geocode results are applied to lat/lng, also set `countryCode: candidate.countryCode?.toLowerCase() ?? null`. In `lib/marker-to-item.ts`, add `countryCode: marker.countryCode ?? null` to the copied fields. In `scripts/backfill-geocode.ts`, include `countryCode` in the item update write.

- [ ] **Step 4: Run** — affected test files + `npx tsc --noEmit` — expect PASS.

- [ ] **Step 5: Commit** — `feat(items): derived countryCode for day-ideas country matching`

---

### Task 15: Day ideas — pure selection logic

**Files:**
- Modify: `lib/nearby.ts`, `lib/plan-scope.ts`
- Test: `lib/nearby.test.ts` (extend), `lib/plan-scope.test.ts` (if exists)

**Interfaces:**
- Consumes: `haversineKm` (`lib/geo.ts`), `Item.countryCode` (Task 14), `isFreeFormDay` (Task 8).
- Produces (Task 16 relies on these EXACT names):

```ts
// lib/plan-scope.ts
export const THINGS_TO_DO_WHERE = { stopId: { not: null }, date: null } as const;

// lib/nearby.ts
export const STOP_NEARBY_RADIUS_KM = 30;
export interface DayIdeaCandidate {
  id: string; title: string; category: string;
  lat: number | null; lng: number | null; countryCode: string | null;
}
export type DayIdeaReason = "nearby" | "country" | "unlocated";
export interface DayIdeaResult {
  id: string; title: string; category: string;
  distanceKm: number | null; reason: DayIdeaReason;
}
export function dayIdeasWishlist(input: {
  stop: { lat: number | null; lng: number | null; countryCode: string | null };
  candidates: DayIdeaCandidate[];
  radiusKm?: number; // default STOP_NEARBY_RADIUS_KM
}): DayIdeaResult[];
```

Inclusion rules (own pools only — nothing external, CONTEXT.md "Day ideas"):
- located candidate + located stop, distance ≤ radius → `"nearby"` (with distanceKm)
- else countryCode match (case-insensitive, both non-null) → `"country"`
- else candidate has NO location AND NO countryCode → `"unlocated"` (a jot like "find a Christmas market mug" surfaces everywhere rather than nowhere)
- everything else (provably elsewhere: located far away, or country mismatch) → excluded.
Ordering: nearby by distance asc, then country (title asc), then unlocated (title asc).

- [ ] **Step 1: Write failing tests** in `lib/nearby.test.ts`:

```ts
describe("dayIdeasWishlist", () => {
  const munich = { lat: 48.14, lng: 11.58, countryCode: "de" };
  it("includes located ideas within 30km as nearby, ordered by distance", () => { ... });
  it("includes far-away same-country ideas as country matches", () => {
    // Nuremberg markets at ~150km, countryCode "de" → reason "country"
  });
  it("includes unlocated, uncountried jots", () => {
    // { lat: null, lng: null, countryCode: null } → reason "unlocated"
  });
  it("excludes ideas that are provably elsewhere", () => {
    // Paris idea (fr, located) and { countryCode: "fr", lat: null } both excluded
  });
  it("falls back to country+unlocated when the stop has no coordinates", () => { ... });
});
```

- [ ] **Step 2: Run** — `npx vitest run lib/nearby.test.ts` — expect FAIL.

- [ ] **Step 3: Implement** in `lib/nearby.ts` (keep `nearbyWishlistItems` untouched — the planned-day collapsed section still uses it):

```ts
/** Radius for "near the Stop" on a free-form day (CONTEXT.md "Day ideas"). */
export const STOP_NEARBY_RADIUS_KM = 30;

export function dayIdeasWishlist(input: {
  stop: { lat: number | null; lng: number | null; countryCode: string | null };
  candidates: DayIdeaCandidate[];
  radiusKm?: number;
}): DayIdeaResult[] {
  const radius = input.radiusKm ?? STOP_NEARBY_RADIUS_KM;
  const stopCC = input.stop.countryCode?.toLowerCase() ?? null;
  const stopLoc = input.stop.lat != null && input.stop.lng != null
    ? { lat: input.stop.lat, lng: input.stop.lng } : null;

  const nearby: DayIdeaResult[] = [];
  const country: DayIdeaResult[] = [];
  const unlocated: DayIdeaResult[] = [];

  for (const c of input.candidates) {
    const located = c.lat != null && c.lng != null;
    const cc = c.countryCode?.toLowerCase() ?? null;
    const distanceKm = located && stopLoc
      ? haversineKm(stopLoc, { lat: c.lat!, lng: c.lng! }) : null;

    if (distanceKm != null && distanceKm <= radius) {
      nearby.push({ id: c.id, title: c.title, category: c.category, distanceKm, reason: "nearby" });
    } else if (cc && stopCC && cc === stopCC) {
      country.push({ id: c.id, title: c.title, category: c.category, distanceKm, reason: "country" });
    } else if (!located && !cc) {
      unlocated.push({ id: c.id, title: c.title, category: c.category, distanceKm: null, reason: "unlocated" });
    }
    // located far away or a different country: provably elsewhere — excluded.
  }

  nearby.sort((a, b) => a.distanceKm! - b.distanceKm!);
  const byTitle = (a: DayIdeaResult, b: DayIdeaResult) => a.title.localeCompare(b.title);
  country.sort(byTitle);
  unlocated.sort(byTitle);
  return [...nearby, ...country, ...unlocated];
}
```

In `lib/plan-scope.ts` add beside `WISHLIST_IDEA_WHERE`:

```ts
/** Plan-owned things to do: attached to a Stop, not yet given a day (ADR 0022). */
export const THINGS_TO_DO_WHERE = { stopId: { not: null }, date: null } as const;
```

and refactor `app/(app)/trips/[tripId]/plan/page.tsx:135-154`'s inline `{ stopId: { not: null }, date: null }` to spread the constant (drift guard).

- [ ] **Step 4: Run** — `npx vitest run lib/nearby.test.ts` and the plan-page test — expect PASS.

- [ ] **Step 5: Commit** — `feat(nearby): day-ideas wishlist selection (30km + country + unattributed jots)`

---

### Task 16: Day ideas — component, mounts, phase gating, ADR 0044

**Files:**
- Create: `components/trip/day-ideas.tsx`
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx` (trip select L42-45, stop select L68-83, wishlist query L161-164, render around the Timeline)
- Modify: `components/trip/home/phase-travelling.tsx` (stop select L61-78, wishlist query L175-183, render after the Timeline card L437-448)
- Create: `docs/adr/0044-day-ideas-draw-only-from-the-travellers-own-pools.md`
- Test: `components/trip/day-ideas.test.tsx`

**Interfaces:**
- Consumes: `dayIdeasWishlist`/`DayIdeaResult`/`STOP_NEARBY_RADIUS_KM` (Task 15), `THINGS_TO_DO_WHERE` (Task 15), `isFreeFormDay` (Task 8), `scheduleItem` (`server/actions/items.ts:464`), `computeTripPhase` + `todayISOInZone(currentTripTimezone(orderPlanStops(stops)))` (the canonical usage at `app/(app)/trips/[tripId]/page.tsx:58-59`), `categoryDotClass` (`components/trip/category-dot.ts`).
- Produces:

```tsx
// components/trip/day-ideas.tsx — "use client"
export interface DayIdeaThingToDo {
  id: string; title: string; category: string;
  startTime: string | null; endTime: string | null;
}
export function DayIdeas({ tripId, date, thingsToDo, wishlistIdeas }: {
  tripId: string;
  date: string;
  thingsToDo: DayIdeaThingToDo[];
  wishlistIdeas: DayIdeaResult[];
}): JSX.Element | null; // null when both lists are empty
```

- [ ] **Step 1: Write failing component tests** (copy the `nearby-wishlist.test.tsx` mock preamble exactly — `vi.mock("@/server/actions/items", ...)` with `scheduleItem`, `vi.mock("@/components/ui/use-toast", ...)`):

```tsx
it("renders the stop's things to do and wishlist ideas with add buttons", () => { ... });
it("schedules a thing-to-do preserving its existing times", async () => {
  render(<DayIdeas tripId="t1" date="2026-12-09"
    thingsToDo={[{ id: "th1", title: "Residenz", category: "SIGHTSEEING", startTime: "14:00", endTime: null }]}
    wishlistIdeas={[]} />);
  await userEvent.click(screen.getByRole("button", { name: /add residenz/i }));
  expect(scheduleItem).toHaveBeenCalledWith("th1", { date: "2026-12-09", startTime: "14:00" });
});
it("renders nothing when there is nothing to offer", () => { ... });
```

- [ ] **Step 2: Run** — `npx vitest run components/trip/day-ideas.test.tsx` — expect FAIL.

- [ ] **Step 3: Implement the component.** Structure (server-safe consumers pass plain props):
  - Header: `Nothing planned today — some ideas from your own lists` (muted lead), inside a `rounded-2xl border border-border bg-card p-4` section labelled "Day ideas".
  - Section 1 "Things to do in this stop": rows with `categoryDotClass(category)` dot, title, and an "Add to today" button using the time-preserving spread (`stop-card.tsx:179-195` idiom):

```tsx
const res = await scheduleItem(thing.id, {
  date,
  ...(thing.startTime ? { startTime: thing.startTime } : {}),
  ...(thing.endTime ? { endTime: thing.endTime } : {}),
});
```

  - Section 2 "From your wishlist": rows show the distance label for `reason === "nearby"` (reuse NearbyWishlist's `<1km → m` formatting), a small muted "same country" tag for `"country"`, nothing for `"unlocated"`; "Add to today" calls `scheduleItem(idea.id, { date })` (wishlist ideas take the copy-in branch, ADR 0019).
  - Toast handling copied from `nearby-wishlist.tsx:90-115` (success + first-error destructive), `pendingId` disable state, footer link "See full wishlist" → `/trips/<id>/wishlist`.

- [ ] **Step 4: Wire the day page.** Add `countryCode: true` to the stops select; broaden the wishlist query (L161-164) from located-only to ALL ideas:

```ts
db.item.findMany({
  where: { tripId, ...WISHLIST_IDEA_WHERE },
  select: { id: true, title: true, category: true, lat: true, lng: true, countryCode: true },
}),
```

(keep `nearbyWishlistItems` working by filtering `wishlist.filter((i) => i.lat != null && i.lng != null)` where the old `wishlistLocated` was used). Compute the phase:

```ts
const today = todayISOInZone(currentTripTimezone(orderPlanStops(stops)));
const phase = computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today });
const freeForm = isFreeFormDay(dayPlan);
```

Fetch things-to-do for the day's stop only when needed:

```ts
const thingsToDo = freeForm && dayStop
  ? await db.item.findMany({
      where: { tripId, forkId: null, ...THINGS_TO_DO_WHERE, stopId: dayStop.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, category: true, startTime: true, endTime: true },
    })
  : [];
```

Render, replacing the current `<NearbyWishlist ...>` slot:

```tsx
{freeForm && phase === "travelling" && dayStop ? (
  <DayIdeas tripId={tripId} date={effectiveDate} thingsToDo={thingsToDo}
    wishlistIdeas={dayIdeasWishlist({
      stop: { lat: dayStop.lat, lng: dayStop.lng, countryCode: dayStop.countryCode },
      candidates: wishlist,
    })} />
) : freeForm ? (
  <p className="text-sm text-muted-foreground">
    Nothing planned yet —{" "}
    <Link href={`/trips/${tripId}/wishlist`} className="underline hover:text-foreground">
      browse your wishlist
    </Link>{" "}
    or add something below.
  </p>
) : (
  <NearbyWishlist tripId={tripId} date={effectiveDate} items={nearby} />
)}
```

- [ ] **Step 5: Wire `phase-travelling.tsx`** the same way (it is always Travelling — no phase check needed): add `countryCode: true` to its stop select, broaden its wishlist query (drop the `lat/lng not null` filter, add `countryCode`), fetch the current stop's things-to-do when `dayPlan && isFreeFormDay(dayPlan)`, and render `<DayIdeas ...>` in place of `<NearbyWishlist ...>` on free-form days (planned days keep NearbyWishlist). Update `phase-travelling.test.tsx` db mocks with the new fields/queries.

- [ ] **Step 6: Write ADR 0044** (`docs/adr/0044-day-ideas-draw-only-from-the-travellers-own-pools.md`, 0043-style format, Status `Accepted (2026-09-14)`): Decision — the free-form-day menu resurfaces only traveller-curated pools (things-to-do + wishlist), never external POI APIs; Items gain a derived `countryCode` so unlocated-but-countried ideas match; unattributable jots show everywhere rather than nowhere; exclusion only when provably elsewhere. Considered options: external places API (rejected: online-only, noise, cost — the phone's map app already does discovery); `sourceMarkerId` join only (rejected: misses hand-typed ideas); no country matching (rejected: strands unlocated jots).

- [ ] **Step 7: Run** — `npx vitest run components/trip/day-ideas.test.tsx components/trip/home/phase-travelling.test.tsx "app/(app)/trips/[tripId]/day/[date]/page.test.tsx"` — expect PASS. `npx tsc --noEmit`.

- [ ] **Step 8: Commit** — `feat(day): day-ideas menu on free-form travelling days (resolves empty-day gap)`

---

### Task 17: Final verification, feedback resolution, inbox refresh

**Files:**
- Modify: `docs/feedback/inbox.md` (regenerated — never hand-edited)

- [ ] **Step 1: Full gate** — `npm test` (expect 267+ files green), `npx tsc --noEmit`, `npm run lint`, `npm run build` (catches RSC/client boundary mistakes). Fix anything that fails before proceeding.

- [ ] **Step 2: Resolve the four feedback notes** (only now that the work has landed):

```bash
npm run feedback:resolve -- cmtzfitb3000004jo780oxqml --note "Weather/daylight is now a compact card beside the date header on desktop instead of spanning the page."
npm run feedback:resolve -- cmtzfouiz000104jmhyzke9um --note "Check-out now renders first on its day and check-in after that day's transport; both accept optional times that slot into the timeline like timed items."
npm run feedback:resolve -- cmtzfz4vi000204jm21p649dp --note "Unpaid costs take an optional due date: Upcoming payments list on Budget and Home, push alerts 3 days before and on the day, silenced automatically when marked paid."
npm run feedback:resolve -- cmtzg1rl8000004lc0ahtd5k9 --note "Individual cost rows now show one current number — the cost amount until paid, the paid amount (marked paid) after. Aggregates still show cost vs paid."
```

- [ ] **Step 3: Refresh the inbox** — `npm run feedback:pull`, then commit `docs/feedback/inbox.md`.

- [ ] **Step 4: Commit** — `docs(feedback): resolve four notes shipped by the on-trip readiness bundle`

- [ ] **Step 5: Report** — summarise the bundle; do NOT merge to main, do NOT deploy (both need Cam's explicit go-ahead).
