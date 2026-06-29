# Trip Cover Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every trip a cover image — an uploaded photo when set, otherwise a stylised SVG "route render" of the trip's located stops, otherwise a monogram panel — shown on the trips-list cards and the trip-home hero, replacing the hashed gradient blobs.

**Architecture:** A new nullable `Trip.coverImageKey` holds the storage key of an uploaded photo (reusing the existing `getStorage`/`validateUpload`/`generateKey` pipeline, served by a new member-gated route). A pure `TripCover` decision component picks photo → route-render → monogram. The route-render is a pure, deterministic inline SVG (no tiles, no keys) so it renders in server components, lists, and offline. Upload is settable at creation (optional `coverFile` arg to `createTrip`) and in Settings (`setTripCover`/`removeTripCover` actions).

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Prisma 7 + Postgres, React 19, Tailwind v4, Vitest + Testing Library.

**Glossary:** "Trip cover image" and "route render" are defined in `CONTEXT.md`. The route render is NOT the interactive Leaflet "route map" on the Summary.

---

### Task 1: Schema — `Trip.coverImageKey`

**Files:**
- Modify: `prisma/schema.prisma` (the `Trip` model, near `hardEndDate`)
- Create: `prisma/migrations/20260629000000_add_trip_cover_image_key/migration.sql`

- [ ] **Step 1: Add the field to the Trip model**

In `prisma/schema.prisma`, add under `hardEndDate`:

```prisma
  coverImageKey String? // storage key of the uploaded cover photo; null = use the route-render/monogram fallback
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260629000000_add_trip_cover_image_key/migration.sql`:

```sql
-- Add optional cover-image storage key to Trip
ALTER TABLE "Trip" ADD COLUMN "coverImageKey" TEXT;
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors. (DB apply happens on deploy via `prisma migrate deploy`; the sandbox has no Postgres, so do NOT run `migrate dev` here.)

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exit 0 (the new field is now on the generated `Trip` type).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(cover): add Trip.coverImageKey column + migration"
```

---

### Task 2: Cover storage actions — `setTripCover` / `removeTripCover`

**Files:**
- Create: `server/actions/cover.ts`
- Test: `server/actions/cover.test.ts`

Mirror the upload/delete pattern in `server/actions/attachments.ts` (read it). Cover is image-only and one-per-trip: replacing deletes the previous blob.

- [ ] **Step 1: Write failing tests**

Create `server/actions/cover.test.ts`. Mock `@/lib/db`, `@/lib/guards` (so `requireTripAccess` resolves to `{ user: { id: "u1" } }`), and `@/lib/storage` (`getStorage` returns a `{ save, delete, read }` spy object; keep the real `validateUpload`/`generateKey`). Follow the mocking style already used in `server/actions/attachments.test.ts`.

Tests:
1. `setTripCover` rejects a non-image mime: build `FormData` with `tripId` + a `File(["x"], "x.pdf", {type:"application/pdf"})`; expect `{ success: false }` and that `storage.save` was NOT called.
2. `setTripCover` rejects a missing file: `FormData` with only `tripId`; expect `{ success:false, error:/file/i }`.
3. `setTripCover` happy path: `FormData` with `tripId="t1"` + `File(["img"],"p.png",{type:"image/png"})`; mock `db.trip.findUnique` → `{ coverImageKey: null }`; expect `storage.save` called once, `db.trip.update` called with `coverImageKey` matching `trips/t1/...`, and `{ success: true }`.
4. `setTripCover` replacing an existing cover deletes the old blob: `db.trip.findUnique` → `{ coverImageKey: "trips/t1/old" }`; expect `storage.delete("trips/t1/old")` called before/around the new `save`.
5. `removeTripCover` clears the key and deletes the blob: `db.trip.findUnique` → `{ coverImageKey: "trips/t1/old" }`; expect `storage.delete("trips/t1/old")` and `db.trip.update` with `{ coverImageKey: null }`, returns `{ success: true }`.
6. `removeTripCover` on a trip with no cover is a no-op success: `findUnique` → `{ coverImageKey: null }`; no `storage.delete`; returns `{ success:true }`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/actions/cover.test.ts`
Expected: FAIL (module `cover.ts` does not exist).

- [ ] **Step 3: Implement `server/actions/cover.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { getStorage, generateKey, validateUpload } from "@/lib/storage";

export type CoverActionResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Set (or replace) a trip's cover photo. FormData: tripId (string), file (File).
 * Image-only, one per trip — replacing deletes the previous blob (best-effort).
 */
export async function setTripCover(formData: FormData): Promise<CoverActionResult> {
  const tripId = formData.get("tripId");
  const file = formData.get("file");

  if (typeof tripId !== "string" || !tripId) {
    return { success: false, error: "Missing tripId." };
  }
  if (!(file instanceof File)) {
    return { success: false, error: "No file provided." };
  }

  await requireTripAccess(tripId);

  const validation = validateUpload({ mime: file.type, size: file.size });
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }
  if (!file.type.startsWith("image/")) {
    return { success: false, error: "Cover must be an image (PNG, JPEG, WebP or GIF)." };
  }

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { coverImageKey: true },
  });
  if (!trip) return { success: false, error: "Trip not found." };

  const bytes = Buffer.from(await file.arrayBuffer());
  const storage = getStorage();
  const key = generateKey(tripId, crypto.randomUUID(), `cover-${file.name}`);
  await storage.save(key, bytes, file.type);

  // Best-effort cleanup of the previous cover blob.
  if (trip.coverImageKey && trip.coverImageKey !== key) {
    await storage.delete(trip.coverImageKey).catch(() => {});
  }

  await db.trip.update({ where: { id: tripId }, data: { coverImageKey: key } });

  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/settings`);
  return { success: true };
}

/** Remove a trip's cover photo (reverts to the route-render/monogram fallback). */
export async function removeTripCover(tripId: string): Promise<CoverActionResult> {
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { coverImageKey: true },
  });
  if (!trip) return { success: false, error: "Trip not found." };

  if (trip.coverImageKey) {
    await getStorage().delete(trip.coverImageKey).catch(() => {});
    await db.trip.update({ where: { id: tripId }, data: { coverImageKey: null } });
  }

  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/settings`);
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/actions/cover.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add server/actions/cover.ts server/actions/cover.test.ts
git commit -m "feat(cover): setTripCover/removeTripCover storage actions"
```

---

### Task 3: Serve route — `GET /api/trips/[tripId]/cover`

**Files:**
- Create: `app/api/trips/[tripId]/cover/route.ts`

Member-gated; streams the cover bytes. Read `app/api/attachments/[id]/route.ts` first and mirror its streaming + content-type + caching approach.

- [ ] **Step 1: Implement the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { getStorage } from "@/lib/storage";

/**
 * Stream a trip's cover photo. Member-gated (private trip data). 404 when the
 * trip has no uploaded cover — callers fall back to the route-render/monogram.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  await requireTripAccess(tripId); // throws/redirects if not a member

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { coverImageKey: true },
  });
  if (!trip?.coverImageKey) {
    return new NextResponse("Not found", { status: 404 });
  }

  const bytes = await getStorage().read(trip.coverImageKey);
  if (!bytes) return new NextResponse("Not found", { status: 404 });

  // Derive a content type from the key extension (cover is always an image).
  const ext = trip.coverImageKey.split(".").pop()?.toLowerCase();
  const mime =
    ext === "png" ? "image/png"
    : ext === "webp" ? "image/webp"
    : ext === "gif" ? "image/gif"
    : "image/jpeg";

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      // Private (per-user, member-gated) but fine to cache in the browser briefly.
      "Cache-Control": "private, max-age=300",
    },
  });
}
```

- [ ] **Step 2: Verify types + lint**

Run: `npx tsc --noEmit && npx eslint "app/api/trips/[tripId]/cover/route.ts"`
Expected: exit 0, no errors. (No unit test — it's thin I/O glue; covered by the action tests + manual verification.)

- [ ] **Step 3: Commit**

```bash
git add "app/api/trips/[tripId]/cover/route.ts"
git commit -m "feat(cover): member-gated cover serve route"
```

---

### Task 4: Pure route-render projection — `lib/route-render.ts`

**Files:**
- Create: `lib/route-render.ts`
- Test: `lib/route-render.test.ts`

Pure equirectangular projection of stop coords into an SVG viewbox, normalised to their bounding box with padding. No React.

- [ ] **Step 1: Write failing tests**

Create `lib/route-render.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { projectStops } from "./route-render";

describe("projectStops", () => {
  it("returns empty for no stops", () => {
    expect(projectStops([], 100, 60, 8)).toEqual([]);
  });

  it("centres a single stop", () => {
    const pts = projectStops([{ lat: 10, lng: 20 }], 100, 60, 8);
    expect(pts).toHaveLength(1);
    expect(pts[0].x).toBeCloseTo(50);
    expect(pts[0].y).toBeCloseTo(30);
  });

  it("maps the bounding box into the padded viewbox, north-up", () => {
    // SW corner (low lat, low lng) and NE corner (high lat, high lng).
    const pts = projectStops(
      [{ lat: 0, lng: 0 }, { lat: 10, lng: 10 }],
      100, 100, 10,
    );
    // lng 0 -> left+pad ; lng 10 -> right-pad
    expect(pts[0].x).toBeCloseTo(10);
    expect(pts[1].x).toBeCloseTo(90);
    // Higher latitude is further NORTH => smaller y (top). lat 10 -> top+pad.
    expect(pts[1].y).toBeCloseTo(10);
    expect(pts[0].y).toBeCloseTo(90);
  });

  it("keeps all points within [pad, size-pad]", () => {
    const pts = projectStops(
      [{ lat: -20, lng: 100 }, { lat: 50, lng: -30 }, { lat: 5, lng: 5 }],
      200, 120, 12,
    );
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(12 - 0.001);
      expect(p.x).toBeLessThanOrEqual(200 - 12 + 0.001);
      expect(p.y).toBeGreaterThanOrEqual(12 - 0.001);
      expect(p.y).toBeLessThanOrEqual(120 - 12 + 0.001);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/route-render.test.ts`
Expected: FAIL (`projectStops` not defined).

- [ ] **Step 3: Implement `lib/route-render.ts`**

```ts
/**
 * Pure projection for the stylised "route render" cover fallback. Maps stop
 * coordinates into an SVG viewbox (equirectangular, north-up), normalised to
 * the bounding box of the stops with uniform padding. Deterministic, no I/O.
 */
export interface LatLng {
  lat: number;
  lng: number;
}
export interface Point {
  x: number;
  y: number;
}

export function projectStops(
  stops: LatLng[],
  width: number,
  height: number,
  pad: number,
): Point[] {
  if (stops.length === 0) return [];

  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);

  if (stops.length === 1) {
    return [{ x: width / 2, y: height / 2 }];
  }

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const s of stops) {
    minLat = Math.min(minLat, s.lat);
    maxLat = Math.max(maxLat, s.lat);
    minLng = Math.min(minLng, s.lng);
    maxLng = Math.max(maxLng, s.lng);
  }
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;

  return stops.map((s) => ({
    // lng increases left→right
    x: pad + ((s.lng - minLng) / spanLng) * innerW,
    // lat increases bottom→top (north-up) ⇒ invert for SVG y-down
    y: pad + (1 - (s.lat - minLat) / spanLat) * innerH,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/route-render.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add lib/route-render.ts lib/route-render.test.ts
git commit -m "feat(cover): pure route-render projection"
```

---

### Task 5: Cover components — `TripCover`, `RouteRender`, `MonogramCover`

**Files:**
- Create: `components/trip/trip-cover.tsx`
- Test: `components/trip/trip-cover.test.tsx`

A pure, server-renderable decision component (no `"use client"`). Decides: uploaded photo → `<img>`; else ≥1 located stop → `<RouteRender>`; else `<MonogramCover>`.

- [ ] **Step 1: Write failing tests**

Create `components/trip/trip-cover.test.tsx` using `@testing-library/react` `render` (jsdom). Mirror the render-test style in `components/trip/trip-card.test.tsx`.

Tests:
1. With `hasCover` true → renders an `<img>` whose `src` is `/api/trips/<id>/cover` and `alt` includes the trip name.
2. With `hasCover` false + two located stops → no `<img>`; renders an `<svg>` containing 2 `<circle>` pins (query `container.querySelectorAll("circle")`).
3. With `hasCover` false + zero located stops → renders the monogram (text content includes the trip's first letter, uppercased) and no `<img>`, no `<circle>`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/trip/trip-cover.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `components/trip/trip-cover.tsx`**

```tsx
import { projectStops, type LatLng } from "@/lib/route-render";

export interface TripCoverProps {
  tripId: string;
  name: string;
  /** True when Trip.coverImageKey is set. */
  hasCover: boolean;
  /** Located stops (lat/lng non-null), in route order. */
  stops: LatLng[];
  /** Extra classes for the cover container (controls aspect/size). */
  className?: string;
}

function monogram(name: string): string {
  const first = name.trim()[0];
  return (first ?? "?").toUpperCase();
}

/** Decision component: photo → route-render → monogram. */
export function TripCover({ tripId, name, hasCover, stops, className }: TripCoverProps) {
  if (hasCover) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- member-gated dynamic blob, not statically optimisable
      <img
        src={`/api/trips/${tripId}/cover`}
        alt={`${name} cover`}
        className={`size-full object-cover ${className ?? ""}`}
      />
    );
  }
  if (stops.length > 0) {
    return <RouteRender name={name} stops={stops} className={className} />;
  }
  return <MonogramCover name={name} className={className} />;
}

const VIEW_W = 400;
const VIEW_H = 240;
const PAD = 28;

function RouteRender({ name, stops, className }: { name: string; stops: LatLng[]; className?: string }) {
  const pts = projectStops(stops, VIEW_W, VIEW_H, PAD);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`${name} route`}
      className={`size-full bg-secondary text-primary ${className ?? ""}`}
    >
      {pts.length > 1 && (
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeDasharray="2 7"
          strokeLinecap="round"
          opacity={0.7}
        />
      )}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={5} fill="currentColor" />
      ))}
    </svg>
  );
}

function MonogramCover({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={`flex size-full items-center justify-center bg-gradient-to-br from-secondary to-muted ${className ?? ""}`}
      aria-label={`${name} cover`}
    >
      <span className="font-display text-5xl font-semibold text-primary/70 select-none">
        {monogram(name)}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run components/trip/trip-cover.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add components/trip/trip-cover.tsx components/trip/trip-cover.test.tsx
git commit -m "feat(cover): TripCover decision component (photo/route/monogram)"
```

---

### Task 6: Wire cover into the trips-list card (retire the gradient)

**Files:**
- Modify: `components/trip/trip-card.tsx`
- Modify: `app/(app)/trips/page.tsx` (fetch located stops + hasCover per trip; pass to `TripCard`)
- Modify: `components/trip/trip-card.test.tsx` (the cover slot now renders `TripCover`)

- [ ] **Step 1: Extend `TripCardProps` and replace the gradient cover**

In `components/trip/trip-card.tsx`: remove `GRADIENT_CLASSES`, `hashString`, `tripGradient`. Add to `TripCardProps`:

```ts
  hasCover: boolean;
  coverStops: { lat: number; lng: number }[];
```

Replace the gradient cover `<div>` (the `h-28` block) with:

```tsx
<div className="relative h-28 w-full overflow-hidden">
  <TripCover tripId={id} name={name} hasCover={hasCover} stops={coverStops} />
  {phase && (
    <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-soft">
      {phase.phase === "travelling" || phase.phase === "past" ? phase.countdown : `${phase.label} · ${phase.countdown}`}
    </span>
  )}
  {unreadCount != null && unreadCount > 0 && (
    <span aria-label={`${unreadCount} new`} className="absolute right-3 top-3 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-soft">
      {unreadCount > 9 ? "9+" : unreadCount}
    </span>
  )}
</div>
```

Add `import { TripCover } from "./trip-cover";`.

- [ ] **Step 2: Feed real data from the trips list**

In `app/(app)/trips/page.tsx`, extend the memberships query `include.trip` to also select cover + located stops:

```ts
include: {
  trip: {
    include: { _count: { select: { stops: true } } },
    // plus, on the trip select, fetch what TripCover needs:
  },
},
```

Since the existing query uses `include`, add a parallel fetch (simplest, avoids reshaping): after `const trips = memberships.map(...)`, fetch located stops + coverImageKey for all trips in one query and build lookups:

```ts
const tripIds = trips.map((t) => t.id);
const coverStopsRaw = await db.stop.findMany({
  where: { tripId: { in: tripIds }, lat: { not: null }, lng: { not: null } },
  orderBy: { sortOrder: "asc" },
  select: { tripId: true, lat: true, lng: true },
});
const coverStopsByTrip = new Map<string, { lat: number; lng: number }[]>();
for (const s of coverStopsRaw) {
  const arr = coverStopsByTrip.get(s.tripId) ?? [];
  arr.push({ lat: s.lat as number, lng: s.lng as number });
  coverStopsByTrip.set(s.tripId, arr);
}
```

Also add `coverImageKey: true` to the trip include's select. The simplest is to widen the `include.trip` to a `select`, but to avoid reshaping all usages, instead fetch cover keys in the same extra query path:

```ts
const coverKeyRows = await db.trip.findMany({
  where: { id: { in: tripIds } },
  select: { id: true, coverImageKey: true },
});
const hasCoverByTrip = new Map(coverKeyRows.map((r) => [r.id, r.coverImageKey != null]));
```

Pass to `<TripCard>` in the map (both the normal grid; discreet path is unaffected — it uses `ProjectTable`):

```tsx
<TripCard
  id={trip.id}
  name={trip.name}
  startDate={trip.startDate}
  endDate={trip.endDate}
  stopCount={trip._count.stops}
  phase={describePhase({ startDate: trip.startDate, endDate: trip.endDate, today })}
  unreadCount={unreadByTrip[trip.id] ?? 0}
  hasCover={hasCoverByTrip.get(trip.id) ?? false}
  coverStops={coverStopsByTrip.get(trip.id) ?? []}
/>
```

- [ ] **Step 3: Update the card test**

In `components/trip/trip-card.test.tsx`, pass the new required props (`hasCover={false}`, `coverStops={[]}`) wherever `TripCard` is rendered, and replace any assertion about the gradient class with: with `hasCover={false}` and `coverStops={[]}`, the card renders the monogram (the trip name's first letter is present). Add one case: `hasCover` true → an `<img>` with `src` `/api/trips/<id>/cover` is present.

- [ ] **Step 4: Run the card + page-affected tests**

Run: `npx vitest run components/trip/trip-card.test.tsx components/trip/trip-cover.test.tsx`
Expected: PASS. Then `npx tsc --noEmit` exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/trip/trip-card.tsx components/trip/trip-card.test.tsx "app/(app)/trips/page.tsx"
git commit -m "feat(cover): trips-list cards use TripCover; retire gradient blobs"
```

---

### Task 7: Trip-home hero cover banner

**Files:**
- Modify: `components/trip/home/countdown-hero.tsx` (read it first) OR add a thin banner above the phase content in `app/(app)/trips/[tripId]/page.tsx`
- Modify: `app/(app)/trips/[tripId]/page.tsx` (fetch coverImageKey + located stops; render banner)

Decision: render the hero banner in the **page** (above the phase switch) so all phases get it without touching each phase component.

- [ ] **Step 1: Fetch cover data in the trip-home page**

In `app/(app)/trips/[tripId]/page.tsx`, widen the `trip` select to include `coverImageKey`, and fetch located stops:

```ts
const trip = await db.trip.findUnique({
  where: { id: tripId },
  select: { id: true, name: true, startDate: true, endDate: true, homeCurrency: true, drivingWindingFactor: true, drivingAvgSpeedKph: true, coverImageKey: true },
});
// ...
const coverStops = await db.stop.findMany({
  where: { tripId, lat: { not: null }, lng: { not: null } },
  orderBy: { sortOrder: "asc" },
  select: { lat: true, lng: true },
});
```

- [ ] **Step 2: Render the banner above the phase content**

Wrap the returned phase element:

```tsx
const cover = (
  <div className="relative -mt-2 mb-2 h-40 w-full overflow-hidden rounded-2xl border border-border shadow-soft sm:h-48">
    <TripCover
      tripId={tripId}
      name={trip.name}
      hasCover={trip.coverImageKey != null}
      stops={coverStops.map((s) => ({ lat: s.lat as number, lng: s.lng as number }))}
    />
  </div>
);

const phaseEl = (() => {
  switch (phase) {
    case "sketching": return <PhaseSketching tripId={tripId} tripName={trip.name} />;
    case "travelling": return <PhaseTravelling tripId={tripId} />;
    case "past": return <PhasePast tripId={tripId} trip={trip} />;
    default: return <PhasePlanning tripId={tripId} trip={trip} today={today} phase={phase} />;
  }
})();

return <>{cover}{phaseEl}</>;
```

Add `import { TripCover } from "@/components/trip/trip-cover";`.

- [ ] **Step 3: Verify types + build**

Run: `npx tsc --noEmit` (exit 0). Then `npx eslint "app/(app)/trips/[tripId]/page.tsx"` (clean).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/trips/[tripId]/page.tsx"
git commit -m "feat(cover): trip-home hero cover banner (all phases)"
```

---

### Task 8: Upload a cover during trip creation

**Files:**
- Modify: `server/actions/trips.ts` (`createTrip` gains an optional `coverFile` arg)
- Modify: `app/(app)/trips/new/new-trip-form.tsx` (file input + pass the file)
- Modify: `server/actions/trips.test.ts` (cover-on-create cases)

- [ ] **Step 1: Failing tests for `createTrip` cover handling**

In `server/actions/trips.test.ts`, add cases (match the existing mock setup):
1. `createTrip(input)` with no `coverFile` behaves exactly as today (trip + member created, redirect). (Keep/confirm the existing happy-path test still passes.)
2. `createTrip(input, imageFile)` with a valid PNG `File` → after the trip is created, `getStorage().save` is called once and `tx.trip.update`/`db.trip.update` sets `coverImageKey`. (Mock storage; assert save called.)
3. `createTrip(input, pdfFile)` with a non-image file → trip is still created, but `getStorage().save` is NOT called and no `coverImageKey` is set (invalid cover is ignored silently, not a hard error — the trip creation must not fail because of a bad cover).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/actions/trips.test.ts`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement the optional cover in `createTrip`**

Change the signature to `export async function createTrip(input: CreateTripInput, coverFile?: File | null): Promise<CreateTripResult>`. After the `db.$transaction` that returns `trip`, before `redirect`:

```ts
// Optional cover uploaded at creation time. A bad/oversized cover must never
// fail trip creation — validate and skip silently on any problem.
if (coverFile instanceof File && coverFile.size > 0) {
  const v = validateUpload({ mime: coverFile.type, size: coverFile.size });
  if (v.ok && coverFile.type.startsWith("image/")) {
    try {
      const bytes = Buffer.from(await coverFile.arrayBuffer());
      const key = generateKey(trip.id, crypto.randomUUID(), `cover-${coverFile.name}`);
      await getStorage().save(key, bytes, coverFile.type);
      await db.trip.update({ where: { id: trip.id }, data: { coverImageKey: key } });
    } catch {
      // Swallow — trip is already created; a missing cover is acceptable.
    }
  }
}
```

Add `import { getStorage, generateKey, validateUpload } from "@/lib/storage";` (note: `getStorage` is already imported — add `generateKey, validateUpload`).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run server/actions/trips.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the file input to the new-trip form + pass the file**

In `app/(app)/trips/new/new-trip-form.tsx`, add (before the Actions row) a cover field:

```tsx
<Field label="Cover photo (optional)" description="Upload a photo for this trip. You can change it later in Settings.">
  <Input type="file" name="cover" accept="image/*" disabled={isPending} />
</Field>
```

In `handleSubmit`, read the file and pass it:

```ts
const coverFile = (data.get("cover") as File | null) ?? null;
// ...
const result = await createTrip(input, coverFile && coverFile.size > 0 ? coverFile : null);
```

- [ ] **Step 6: Verify**

Run: `npx vitest run server/actions/trips.test.ts && npx tsc --noEmit && npx eslint app/\(app\)/trips/new/new-trip-form.tsx`
Expected: all pass/clean.

- [ ] **Step 7: Commit**

```bash
git add server/actions/trips.ts server/actions/trips.test.ts app/\(app\)/trips/new/new-trip-form.tsx
git commit -m "feat(cover): optional cover upload during trip creation"
```

---

### Task 9: Manage the cover in Settings

**Files:**
- Create: `components/trip/settings/cover-image-field.tsx`
- Test: `components/trip/settings/cover-image-field.test.tsx`
- Modify: the trip Settings page (`app/(app)/trips/[tripId]/settings/page.tsx`) to render the field (read it first to match layout; pass `tripId` + `hasCover`).

A client component: shows the current cover (via `TripCover` with the same fallback), a file input that calls `setTripCover`, and a "Remove" button (when a cover is set) that calls `removeTripCover`. Uses `useTransition` + `router.refresh()` after success, like other settings controls.

- [ ] **Step 1: Failing test**

Create `components/trip/settings/cover-image-field.test.tsx`. Mock `@/server/actions/cover` (`setTripCover`/`removeTripCover` as spies returning `{success:true}`) and `next/navigation` (`useRouter` → `{ refresh: vi.fn() }`). Tests:
1. Renders a file input (`type="file"`).
2. Selecting a file calls `setTripCover` with a `FormData` containing `tripId` and the file; on success calls `router.refresh()`.
3. With `hasCover` true, a "Remove" control is shown and clicking it calls `removeTripCover(tripId)`; with `hasCover` false it is not shown.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/trip/settings/cover-image-field.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `components/trip/settings/cover-image-field.tsx`**

```tsx
"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTripCover, removeTripCover } from "@/server/actions/cover";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";

export function CoverImageField({ tripId, hasCover }: { tripId: string; hasCover: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("tripId", tripId);
    fd.set("file", file);
    startTransition(async () => {
      const r = await setTripCover(fd);
      if (!r.success) toast({ variant: "destructive", title: r.error });
      else router.refresh();
    });
  }

  function onRemove() {
    startTransition(async () => {
      const r = await removeTripCover(tripId);
      if (!r.success) toast({ variant: "destructive", title: r.error });
      else router.refresh();
    });
  }

  return (
    <Field label="Cover photo" description="Shown on your trips list and the trip's home. Leave empty to use the auto route render.">
      <div className="flex items-center gap-3">
        <Input type="file" accept="image/*" onChange={onFile} disabled={isPending} />
        {hasCover && (
          <Button type="button" variant="ghost" onClick={onRemove} disabled={isPending}>
            Remove
          </Button>
        )}
      </div>
    </Field>
  );
}
```

- [ ] **Step 4: Render it in Settings**

Read `app/(app)/trips/[tripId]/settings/page.tsx`. Ensure the page selects `coverImageKey` for the trip, and render `<CoverImageField tripId={tripId} hasCover={trip.coverImageKey != null} />` near the trip-details form (import it). Keep it out of Discreet mode if the settings page branches on discreet (match existing pattern).

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run components/trip/settings/cover-image-field.test.tsx && npx tsc --noEmit`
Expected: PASS / exit 0.

- [ ] **Step 6: Commit**

```bash
git add components/trip/settings/cover-image-field.tsx components/trip/settings/cover-image-field.test.tsx "app/(app)/trips/[tripId]/settings/page.tsx"
git commit -m "feat(cover): manage cover (upload/remove) in Settings"
```

---

### Task 10: Full-suite green + cleanup

- [ ] **Step 1: Run the whole suite + lint + typecheck**

Run: `npx vitest run && npx eslint && npx tsc --noEmit`
Expected: all green. Fix any fallout (e.g. other tests that constructed `TripCard` without the new props).

- [ ] **Step 2: Grep for stragglers**

Run: `grep -rn "GRADIENT_CLASSES\|tripGradient" components app` — expected: no matches (gradient fully retired).

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "test(cover): suite green after cover-image feature"
```

---

## Self-Review

**Spec coverage:** upload source ✓ (Task 8 create, Task 9 settings) · two set-points ✓ · display on cards ✓ (Task 6) + hero ✓ (Task 7) · `coverImageKey` ✓ (Task 1) · member-gated serve route ✓ (Task 3) · store original + object-cover ✓ (Task 5 `<img object-cover>`) · no crop tool ✓ · fallback photo→route-render→monogram ✓ (Task 5) · gradient retired ✓ (Task 6/10). No ADR (per spec, ADRs are for drag + weather).

**Type consistency:** `coverImageKey` (schema/actions/route/pages), `TripCover` props `{ tripId, name, hasCover, stops }`, `projectStops(stops,width,height,pad)`, `setTripCover(FormData)`/`removeTripCover(tripId)`, `createTrip(input, coverFile?)` — consistent across tasks.

**Placeholder scan:** none — every code step has complete code.
