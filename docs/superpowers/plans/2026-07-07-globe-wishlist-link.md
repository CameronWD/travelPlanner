# Globe → Wishlist Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Trip seed its Wishlist from the shared Globe — a member pulls chosen Markers into a Trip's Wishlist (a copy), and the board proactively suggests Markers that overlap where the Trip is going.

**Architecture:** Two workstreams over one copy action. **WS-A** (manual pull): an "Add from Globe" dialog on the Wishlist board copies a Marker into the Trip's Wishlist via a new `addMarkerToWishlist` server action, tracked by a nullable `Item.sourceMarkerId`. **WS-B** (auto-surface): a pure `suggestMarkersForTrip` function matches Markers to Trip Stops on ISO `countryCode` (country decides inclusion) and ranks by proximity (order only); results render in a "Suggested from your Globe" strip that reuses the same copy action. A new nullable `Stop.countryCode`, derived via the existing geocode path, makes the country match reliable.

**Tech Stack:** Next.js (App Router, server actions), Prisma 7 + `@prisma/adapter-pg` (PostgreSQL), Zod, Vitest + React Testing Library, Tailwind. Geocoding via OpenStreetMap Nominatim (`lib/geocode.ts`).

## Global Constraints

- **Never work on `main`.** Work happens on branch `feat/globe-wishlist-link` (already created).
- **Migrations are hand-written SQL** in timestamped folders under `prisma/migrations/<UTCstamp>_<name>/migration.sql`; provider is `postgresql`. After editing `schema.prisma`, run `npx prisma migrate dev` (or `npx prisma generate` when only regenerating the client). Do NOT add a `url` to the `datasource` block (Prisma 7 — the URL lives in `prisma.config.ts`).
- **Tests:** `npm test` (= `vitest run`). Server-action and lib tests mock `@/lib/db`, `@/lib/geocode`, and `next/cache` (see `server/actions/globe.test.ts` for the pattern). Pure functions are tested directly. Geocode network functions are never hit in tests — the consumer mocks them.
- **Categories are shared:** `Marker.category` and `Item.category` both draw from `lib/categories.ts` `CATEGORY_VALUES` — map directly, no translation.
- **Nominatim `country_code` is lowercase ISO 3166-1 alpha-2** (per schema comment on `Marker.countryCode`). All country-code matching is on lowercase equality.
- **Wishlist ideas are `forkId: null, stopId: null, date: null`** (ADR 0022). Seeded items are always created in that shape.
- **Copy semantics (ADR 0025):** seeding is a one-time copy; the Item is independent of its source Marker thereafter. `Item.sourceMarkerId` exists only to answer "is this Marker already in this Trip's Wishlist?".
- **Lint/typecheck:** `npm run lint` and `npm run build` must pass before a task is considered done.
- TDD, DRY, YAGNI, frequent commits.

---

## File Structure

- `prisma/schema.prisma` — add `Item.sourceMarkerId` (+ relation + index), `Marker.wishlistCopies` back-relation, `Stop.countryCode`.
- `prisma/migrations/20260707000000_globe_wishlist_link/migration.sql` — the DDL.
- `lib/marker-to-item.ts` (+ `.test.ts`) — pure Marker→Wishlist-Item field mapping.
- `lib/globe-suggestions.ts` (+ `.test.ts`) — pure country-match + proximity-rank suggestion selection.
- `lib/geocode.ts` — add `geocodePlaceDetailed(query)` returning a full `GeoCandidate` (lat/lng/country/countryCode).
- `server/actions/items.ts` — add `addMarkerToWishlist(markerId, tripId)`; `server/actions/items.test.ts` covers it.
- `server/actions/stops.ts` (+ `.test.ts`) — derive & store `countryCode` in every stop geocode path.
- `app/(app)/trips/[tripId]/wishlist/page.tsx` — load viewer's Globe markers, compute added set + suggestions, pass new props.
- `components/trip/add-from-globe-dialog.tsx` (+ `.test.tsx`) — WS-A dialog (list + filter + add).
- `components/trip/globe-suggestions-strip.tsx` (+ `.test.tsx`) — WS-B strip.
- `components/trip/wishlist-board.tsx` (+ existing `.test.tsx`) — wire in the button, dialog, and strip.

---

## Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (Item ~314-347, Marker ~619-642, Stop ~202-234)
- Create: `prisma/migrations/20260707000000_globe_wishlist_link/migration.sql`

**Interfaces:**
- Produces: `Item.sourceMarkerId: String?` (FK → `Marker.id`, `onDelete: SetNull`), `Marker.wishlistCopies: Item[]`, `Stop.countryCode: String?`.

- [ ] **Step 1: Add `sourceMarkerId` + relation to the `Item` model**

In `prisma/schema.prisma`, in `model Item`, add the field near `sourceItemId` and the relation near the `sourceItem` relation:

```prisma
  sourceItemId String?
  sourceMarkerId String?
```

```prisma
  sourceItem   Item?  @relation("ItemPlacedFrom", fields: [sourceItemId], references: [id], onDelete: SetNull)
  placements   Item[] @relation("ItemPlacedFrom")
  sourceMarker Marker? @relation("ItemFromMarker", fields: [sourceMarkerId], references: [id], onDelete: SetNull)
```

And add an index alongside the existing ones:

```prisma
  @@index([sourceItemId])
  @@index([sourceMarkerId])
```

- [ ] **Step 2: Add the back-relation to `Marker` and `countryCode` to `Stop`**

In `model Marker`, add the back-relation (relations do not create columns):

```prisma
  globe     Globe @relation(fields: [globeId], references: [id], onDelete: Cascade)
  createdBy User  @relation("MarkerCreatedBy", fields: [createdById], references: [id])
  wishlistCopies Item[] @relation("ItemFromMarker")
```

In `model Stop`, add the column after `country`:

```prisma
  country          String?
  countryCode      String? // auto-derived ISO 3166-1 alpha-2 (lowercase, from Nominatim); null while un-derived
```

- [ ] **Step 3: Write the migration SQL**

Create `prisma/migrations/20260707000000_globe_wishlist_link/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "sourceMarkerId" TEXT;

-- AlterTable
ALTER TABLE "Stop" ADD COLUMN     "countryCode" TEXT;

-- CreateIndex
CREATE INDEX "Item_sourceMarkerId_idx" ON "Item"("sourceMarkerId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_sourceMarkerId_fkey" FOREIGN KEY ("sourceMarkerId") REFERENCES "Marker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply the migration and regenerate the client**

Run: `npx prisma migrate dev --name globe_wishlist_link`
Expected: "Your database is now in sync with your schema" (or applies the existing migration folder), and the Prisma client regenerates without error. If the DB is unreachable in this environment, run `npx prisma generate` and `npx prisma validate` instead and note that the migration must be applied at deploy.

- [ ] **Step 5: Verify the schema compiles**

Run: `npx prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀"

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260707000000_globe_wishlist_link
git commit -m "feat(globe-wishlist): add Item.sourceMarkerId + Stop.countryCode (ADR 0025)"
```

---

## Task 2: Marker → Wishlist-Item field mapping (pure lib)

**Files:**
- Create: `lib/marker-to-item.ts`
- Test: `lib/marker-to-item.test.ts`

**Interfaces:**
- Consumes: `MarkerView` from `@/components/globe/types`.
- Produces:
  ```ts
  export interface WishlistItemSeed {
    title: string;
    category: string;
    lat: number | null;
    lng: number | null;
    address: string | null;
    link: string | null;
    notes: string | null;
  }
  export function markerToWishlistItemData(marker: MarkerView): WishlistItemSeed
  ```

- [ ] **Step 1: Write the failing test**

Create `lib/marker-to-item.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { markerToWishlistItemData } from "./marker-to-item";
import type { MarkerView } from "@/components/globe/types";

function marker(overrides: Partial<MarkerView> = {}): MarkerView {
  return {
    id: "m1",
    title: "Tokyo Tower",
    category: "SIGHTSEEING",
    note: null,
    link: null,
    timing: null,
    lat: 35.6586,
    lng: 139.7454,
    city: "Tokyo",
    country: "Japan",
    countryCode: "jp",
    ...overrides,
  };
}

describe("markerToWishlistItemData", () => {
  it("maps title, category, and coordinates directly", () => {
    const r = markerToWishlistItemData(marker());
    expect(r.title).toBe("Tokyo Tower");
    expect(r.category).toBe("SIGHTSEEING");
    expect(r.lat).toBe(35.6586);
    expect(r.lng).toBe(139.7454);
  });

  it("joins city and country into address", () => {
    expect(markerToWishlistItemData(marker()).address).toBe("Tokyo, Japan");
  });

  it("uses whichever of city/country is present for address, or null when neither", () => {
    expect(markerToWishlistItemData(marker({ city: null })).address).toBe("Japan");
    expect(markerToWishlistItemData(marker({ country: null })).address).toBe("Tokyo");
    expect(markerToWishlistItemData(marker({ city: null, country: null })).address).toBeNull();
  });

  it("passes the note through as notes when there is no timing", () => {
    expect(markerToWishlistItemData(marker({ note: "Go at sunset" })).notes).toBe("Go at sunset");
  });

  it("folds timing into notes, appended to an existing note", () => {
    expect(
      markerToWishlistItemData(marker({ note: "Go at sunset", timing: "late Sept" })).notes,
    ).toBe("Go at sunset\n(when: late Sept)");
  });

  it("uses timing alone as notes when there is no note", () => {
    expect(markerToWishlistItemData(marker({ note: null, timing: "late Sept" })).notes).toBe(
      "(when: late Sept)",
    );
  });

  it("returns null notes when neither note nor timing is set", () => {
    expect(markerToWishlistItemData(marker()).notes).toBeNull();
  });

  it("carries the link through", () => {
    expect(markerToWishlistItemData(marker({ link: "https://x.example" })).link).toBe(
      "https://x.example",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/marker-to-item.test.ts`
Expected: FAIL — "Cannot find module './marker-to-item'".

- [ ] **Step 3: Write the implementation**

Create `lib/marker-to-item.ts`:

```ts
import type { MarkerView } from "@/components/globe/types";

/** The Wishlist-Item field values derived from a Globe Marker (ADR 0025). */
export interface WishlistItemSeed {
  title: string;
  category: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  link: string | null;
  notes: string | null;
}

/**
 * Map a Globe Marker onto the fields of a new unscheduled Wishlist Item.
 *
 * - `address` joins city + country (whichever are present), or null.
 * - `notes` = the Marker's note, with its rough `timing` folded in as
 *   "(when: …)" so the loose wish-timing isn't lost (the Item has no timing
 *   field). The copy is thereafter independent of the Marker.
 */
export function markerToWishlistItemData(marker: MarkerView): WishlistItemSeed {
  const address =
    [marker.city, marker.country].filter((v): v is string => Boolean(v)).join(", ") || null;

  const timingLine = marker.timing ? `(when: ${marker.timing})` : null;
  const notes =
    marker.note && timingLine
      ? `${marker.note}\n${timingLine}`
      : marker.note ?? timingLine;

  return {
    title: marker.title,
    category: marker.category,
    lat: marker.lat,
    lng: marker.lng,
    address,
    link: marker.link,
    notes,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/marker-to-item.test.ts`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/marker-to-item.ts lib/marker-to-item.test.ts
git commit -m "feat(globe-wishlist): Marker→Wishlist-Item field mapping"
```

---

## Task 3: `addMarkerToWishlist` server action

**Files:**
- Modify: `server/actions/items.ts` (add export + imports)
- Test: `server/actions/items.test.ts`

**Interfaces:**
- Consumes: `markerToWishlistItemData` (Task 2); `getUserGlobe` from `@/lib/globe`; `requireTripAccess` from `@/lib/guards`; `recordPlanActivity` from `@/lib/activity-guard`; `entityLabel` from `@/lib/activity`; `planScope` from `@/lib/plan-scope`; existing `ItemActionResult`.
- Produces:
  ```ts
  export async function addMarkerToWishlist(
    markerId: string,
    tripId: string,
  ): Promise<ItemActionResult>
  ```
  Behaviour: verifies trip access and that the Marker is on the viewing user's own Globe; if an unscheduled wishlist Item in this Trip already has `sourceMarkerId === markerId`, returns `{ success: true }` idempotently without creating a duplicate; otherwise creates a wishlist Item (`forkId: null, stopId: null, date: null`, `sourceMarkerId: markerId`, `sortOrder = max+1`) from the mapping, logs the same `CREATED`/`ITEM` activity as a manual add, revalidates trip paths.

- [ ] **Step 1: Write the failing tests**

If `server/actions/items.test.ts` does not exist, create it with the standard mock header; if it exists, add the mocks it lacks and this `describe` block. The mock header must include:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn(async () => ({ user: { id: "u1" } })),
}));
vi.mock("@/lib/globe", () => ({ getUserGlobe: vi.fn(async () => ({ id: "g1" })) }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: vi.fn(async () => null) }));
vi.mock("@/lib/activity-guard", () => ({ recordPlanActivity: vi.fn() }));
vi.mock("@/lib/activity", () => ({
  entityLabel: vi.fn(() => "Tokyo Tower"),
  describeChanges: vi.fn(() => ({})),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    item: { findFirst: vi.fn(), create: vi.fn() },
    marker: { findUnique: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { getUserGlobe } from "@/lib/globe";
import { recordPlanActivity } from "@/lib/activity-guard";
import { addMarkerToWishlist } from "./items";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbm = db as any;
beforeEach(() => vi.clearAllMocks());

const MARKER = {
  id: "m1",
  globeId: "g1",
  title: "Tokyo Tower",
  category: "SIGHTSEEING",
  note: null,
  link: null,
  timing: "late Sept",
  lat: 35.6586,
  lng: 139.7454,
  city: "Tokyo",
  country: "Japan",
  countryCode: "jp",
};
```

Then the tests:

```ts
describe("addMarkerToWishlist", () => {
  it("returns an error and creates nothing when the marker is not on the user's globe", async () => {
    dbm.marker.findUnique.mockResolvedValue({ ...MARKER, globeId: "other" });
    const res = await addMarkerToWishlist("m1", "t1");
    expect(res.success).toBe(false);
    expect(dbm.item.create).not.toHaveBeenCalled();
  });

  it("returns an error when the user has no globe", async () => {
    (getUserGlobe as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    dbm.marker.findUnique.mockResolvedValue(MARKER);
    const res = await addMarkerToWishlist("m1", "t1");
    expect(res.success).toBe(false);
    expect(dbm.item.create).not.toHaveBeenCalled();
  });

  it("creates an unscheduled wishlist item from the marker with provenance", async () => {
    dbm.marker.findUnique.mockResolvedValue(MARKER);
    dbm.item.findFirst
      .mockResolvedValueOnce(null) // dedupe check: none exists
      .mockResolvedValueOnce({ sortOrder: 4 }); // max sortOrder
    dbm.item.create.mockResolvedValue({ id: "i1" });

    const res = await addMarkerToWishlist("m1", "t1");

    expect(res.success).toBe(true);
    expect(dbm.item.create).toHaveBeenCalledTimes(1);
    const data = dbm.item.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tripId: "t1",
      forkId: null,
      stopId: null,
      date: null,
      sourceMarkerId: "m1",
      title: "Tokyo Tower",
      category: "SIGHTSEEING",
      lat: 35.6586,
      lng: 139.7454,
      address: "Tokyo, Japan",
      notes: "(when: late Sept)",
      sortOrder: 5,
    });
  });

  it("logs the same CREATED/ITEM activity as a manual add", async () => {
    dbm.marker.findUnique.mockResolvedValue(MARKER);
    dbm.item.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ sortOrder: 0 });
    dbm.item.create.mockResolvedValue({ id: "i1" });

    await addMarkerToWishlist("m1", "t1");

    expect(recordPlanActivity).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ tripId: "t1", verb: "CREATED", entityType: "ITEM", entityId: "i1" }),
    );
  });

  it("is idempotent — does not duplicate when the marker is already in the wishlist", async () => {
    dbm.marker.findUnique.mockResolvedValue(MARKER);
    dbm.item.findFirst.mockResolvedValueOnce({ id: "existing" }); // dedupe hit
    const res = await addMarkerToWishlist("m1", "t1");
    expect(res.success).toBe(true);
    expect(dbm.item.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- server/actions/items.test.ts`
Expected: FAIL — `addMarkerToWishlist` is not exported.

- [ ] **Step 3: Implement the action**

In `server/actions/items.ts`, add `getUserGlobe` to imports:

```ts
import { getUserGlobe } from "@/lib/globe";
import { markerToWishlistItemData } from "@/lib/marker-to-item";
```

Append the action (after `createItem`, before `updateItem` is fine):

```ts
/**
 * Seed a Trip's Wishlist from a Globe Marker (ADR 0025).
 *
 * - Verifies the caller has access to the trip AND that the Marker lives on the
 *   caller's own Globe (a user is in at most one).
 * - Idempotent: if an unscheduled wishlist Item in this trip already points at
 *   this Marker, returns success without creating a duplicate.
 * - Otherwise copies the Marker into a new wishlist idea (forkId/stopId/date all
 *   null), records provenance via sourceMarkerId, and logs the same activity as
 *   a manual wishlist add.
 */
export async function addMarkerToWishlist(
  markerId: string,
  tripId: string,
): Promise<ItemActionResult> {
  const { user } = await requireTripAccess(tripId);

  const globe = await getUserGlobe(user.id);
  if (!globe) {
    return { success: false, errors: { marker: ["You are not part of a Globe."] } };
  }

  const marker = await db.marker.findUnique({
    where: { id: markerId },
    select: {
      id: true, globeId: true, title: true, category: true, note: true, link: true,
      timing: true, lat: true, lng: true, city: true, country: true, countryCode: true,
    },
  });
  if (!marker || marker.globeId !== globe.id) {
    return { success: false, errors: { marker: ["Marker not found on your Globe."] } };
  }

  // Idempotency: already pulled into this trip's wishlist?
  const existing = await db.item.findFirst({
    where: { tripId, forkId: null, stopId: null, date: null, sourceMarkerId: markerId },
    select: { id: true },
  });
  if (existing) return { success: true };

  const maxItem = await db.item.findFirst({
    where: { tripId, ...planScope(null) },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (maxItem?.sortOrder ?? -1) + 1;

  const seed = markerToWishlistItemData(marker);
  const created = await db.item.create({
    data: {
      tripId,
      forkId: null,
      stopId: null,
      date: null,
      sourceMarkerId: markerId,
      title: seed.title,
      category: seed.category,
      lat: seed.lat,
      lng: seed.lng,
      address: seed.address,
      link: seed.link,
      notes: seed.notes,
      sortOrder,
    },
  });

  await recordPlanActivity(null, {
    tripId,
    verb: "CREATED",
    entityType: "ITEM",
    entityId: created.id,
    entityLabel: entityLabel("ITEM", created as unknown as Record<string, unknown>),
  });
  revalidateItemPaths(tripId);
  return { success: true };
}
```

Note: `requireTripAccess` returns `{ user }` (see its use in `page.tsx`). `MarkerView` isn't needed here — `markerToWishlistItemData` accepts the selected marker shape (structurally compatible: it reads title/category/note/link/timing/lat/lng/city/country). If TS complains about the missing `id`/`countryCode` on the param type, pass `marker as unknown as MarkerView` or widen — the mapping only reads the listed fields.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- server/actions/items.test.ts`
Expected: PASS (5 new tests).

- [ ] **Step 5: Typecheck & lint**

Run: `npm run lint`
Expected: no errors in `server/actions/items.ts`.

- [ ] **Step 6: Commit**

```bash
git add server/actions/items.ts server/actions/items.test.ts
git commit -m "feat(globe-wishlist): addMarkerToWishlist server action (copy + provenance)"
```

---

## Task 4: Suggestion selection (pure lib)

**Files:**
- Create: `lib/globe-suggestions.ts`
- Test: `lib/globe-suggestions.test.ts`

**Interfaces:**
- Consumes: `haversineKm` from `@/lib/geo`; `MarkerView` from `@/components/globe/types`.
- Produces:
  ```ts
  export interface TripStopLocation { countryCode: string | null; lat: number | null; lng: number | null }
  export interface SuggestMarkersInput {
    markers: MarkerView[];
    stops: TripStopLocation[];
    addedMarkerIds: string[];
  }
  export function suggestMarkersForTrip(input: SuggestMarkersInput): MarkerView[]
  ```
  Behaviour: a Marker is **included** iff its lowercased `countryCode` equals the lowercased `countryCode` of any stop (country decides inclusion). Already-added markers are excluded. The included set is **ordered** by ascending distance to the nearest stop that has coordinates (proximity ranks only); markers without coordinates, or when no stop has coordinates, sort last (distance = Infinity), tie-broken by original array order (stable).

- [ ] **Step 1: Write the failing test**

Create `lib/globe-suggestions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { suggestMarkersForTrip } from "./globe-suggestions";
import type { MarkerView } from "@/components/globe/types";

function marker(id: string, overrides: Partial<MarkerView> = {}): MarkerView {
  return {
    id,
    title: id,
    category: "OTHER",
    note: null,
    link: null,
    timing: null,
    lat: null,
    lng: null,
    city: null,
    country: null,
    countryCode: null,
    ...overrides,
  };
}

describe("suggestMarkersForTrip", () => {
  it("includes only markers whose countryCode matches a stop's", () => {
    const markers = [
      marker("jp", { countryCode: "jp" }),
      marker("fr", { countryCode: "fr" }),
      marker("none", { countryCode: null }),
    ];
    const out = suggestMarkersForTrip({
      markers,
      stops: [{ countryCode: "jp", lat: null, lng: null }],
      addedMarkerIds: [],
    });
    expect(out.map((m) => m.id)).toEqual(["jp"]);
  });

  it("matches country codes case-insensitively", () => {
    const out = suggestMarkersForTrip({
      markers: [marker("jp", { countryCode: "JP" })],
      stops: [{ countryCode: "jp", lat: null, lng: null }],
      addedMarkerIds: [],
    });
    expect(out.map((m) => m.id)).toEqual(["jp"]);
  });

  it("excludes already-added markers", () => {
    const out = suggestMarkersForTrip({
      markers: [marker("a", { countryCode: "jp" }), marker("b", { countryCode: "jp" })],
      stops: [{ countryCode: "jp", lat: null, lng: null }],
      addedMarkerIds: ["a"],
    });
    expect(out.map((m) => m.id)).toEqual(["b"]);
  });

  it("ranks matched markers by proximity to the nearest stop (nearest first)", () => {
    // Stop at Tokyo (35.68, 139.69). 'near' is Tokyo Tower; 'far' is Osaka.
    const markers = [
      marker("far", { countryCode: "jp", lat: 34.69, lng: 135.5 }),
      marker("near", { countryCode: "jp", lat: 35.66, lng: 139.75 }),
    ];
    const out = suggestMarkersForTrip({
      markers,
      stops: [{ countryCode: "jp", lat: 35.68, lng: 139.69 }],
      addedMarkerIds: [],
    });
    expect(out.map((m) => m.id)).toEqual(["near", "far"]);
  });

  it("sorts markers without coordinates last, preserving input order among them", () => {
    const markers = [
      marker("noCoordsA", { countryCode: "jp" }),
      marker("located", { countryCode: "jp", lat: 35.66, lng: 139.75 }),
      marker("noCoordsB", { countryCode: "jp" }),
    ];
    const out = suggestMarkersForTrip({
      markers,
      stops: [{ countryCode: "jp", lat: 35.68, lng: 139.69 }],
      addedMarkerIds: [],
    });
    expect(out.map((m) => m.id)).toEqual(["located", "noCoordsA", "noCoordsB"]);
  });

  it("returns [] when no stop has a countryCode", () => {
    const out = suggestMarkersForTrip({
      markers: [marker("jp", { countryCode: "jp" })],
      stops: [{ countryCode: null, lat: 1, lng: 1 }],
      addedMarkerIds: [],
    });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/globe-suggestions.test.ts`
Expected: FAIL — "Cannot find module './globe-suggestions'".

- [ ] **Step 3: Write the implementation**

Create `lib/globe-suggestions.ts`:

```ts
import { haversineKm } from "@/lib/geo";
import type { MarkerView } from "@/components/globe/types";

/** A Trip Stop's location fields relevant to Globe-overlap matching. */
export interface TripStopLocation {
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
}

export interface SuggestMarkersInput {
  markers: MarkerView[];
  stops: TripStopLocation[];
  addedMarkerIds: string[];
}

/**
 * Markers that overlap where the Trip is going (ADR 0025).
 *
 * Country decides INCLUSION: a Marker is suggested iff its ISO countryCode
 * (case-insensitive) matches any Stop's countryCode. Proximity only ORDERS the
 * result — nearest stop-coordinate first; markers with no coordinates (or when
 * no stop has coordinates) sort last, keeping their input order. Already-added
 * markers are excluded.
 */
export function suggestMarkersForTrip(input: SuggestMarkersInput): MarkerView[] {
  const stopCodes = new Set(
    input.stops
      .map((s) => s.countryCode?.toLowerCase())
      .filter((c): c is string => Boolean(c)),
  );
  if (stopCodes.size === 0) return [];

  const added = new Set(input.addedMarkerIds);
  const stopCoords = input.stops.filter(
    (s): s is TripStopLocation & { lat: number; lng: number } => s.lat != null && s.lng != null,
  );

  const matched = input.markers
    .map((marker, index) => ({ marker, index }))
    .filter(
      ({ marker }) =>
        !added.has(marker.id) &&
        marker.countryCode != null &&
        stopCodes.has(marker.countryCode.toLowerCase()),
    );

  const distanceOf = (marker: MarkerView): number => {
    if (marker.lat == null || marker.lng == null || stopCoords.length === 0) return Infinity;
    let best = Infinity;
    for (const s of stopCoords) {
      const d = haversineKm({ lat: s.lat, lng: s.lng }, { lat: marker.lat, lng: marker.lng });
      if (d < best) best = d;
    }
    return best;
  };

  return matched
    .map((entry) => ({ ...entry, distance: distanceOf(entry.marker) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .map((entry) => entry.marker);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/globe-suggestions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/globe-suggestions.ts lib/globe-suggestions.test.ts
git commit -m "feat(globe-wishlist): suggestMarkersForTrip (country match + proximity rank)"
```

---

## Task 5: Derive & store `Stop.countryCode` in geocode paths

**Files:**
- Modify: `lib/geocode.ts` (add `geocodePlaceDetailed`)
- Modify: `server/actions/stops.ts` (all stop geocode call sites)
- Test: `server/actions/stops.test.ts`

**Interfaces:**
- Produces: `export async function geocodePlaceDetailed(query: string): Promise<GeoCandidate | null>` — the first `searchPlaces` candidate (lat/lng/city/country/countryCode) or null. Stop rows now persist `countryCode` (lowercase) whenever they are geocoded.

- [ ] **Step 1: Add the detailed geocode helper**

In `lib/geocode.ts`, after `searchPlaces`, add:

```ts
/**
 * Geocode a free-text place to a single candidate WITH derived country/
 * countryCode (unlike `geocodePlace`, which returns coordinates only). Used to
 * stamp a Stop's ISO countryCode for Globe-overlap matching (ADR 0025). Never
 * throws; returns null on any failure or empty result.
 */
export async function geocodePlaceDetailed(query: string): Promise<GeoCandidate | null> {
  const [first] = await searchPlaces(query, 1);
  return first ?? null;
}
```

- [ ] **Step 2: Update the stop write paths to capture countryCode**

In `server/actions/stops.ts`, add `geocodePlaceDetailed` to the geocode import:

```ts
import { geocodePlace, geocodePlaceDetailed } from "@/lib/geocode";
```

Every place that currently derives a scheduled/located Stop's coordinates uses the pattern `const coords = await geocodePlace(query)` then writes `lat: coords?.lat ?? null, lng: coords?.lng ?? null`. For each such **stop-writing** site (createStop scheduled branch, updateStop scheduled branch, firmUpSegment, firmUpTrip), replace the call and add the countryCode field. The transformation is:

```ts
// before
const coords = await geocodePlace(query);
// ...later, in the data object:
lat: coords?.lat ?? null,
lng: coords?.lng ?? null,
```

```ts
// after
const coords = await geocodePlaceDetailed(query);
// ...later, in the data object:
lat: coords?.lat ?? null,
lng: coords?.lng ?? null,
countryCode: coords?.countryCode ?? null,
```

Use grep to find every site: `grep -n "geocodePlace(" server/actions/stops.ts`. Convert each site that writes a Stop's `lat`/`lng`. Where a query variable isn't already extracted (e.g. inline `geocodePlace([name, country].filter(Boolean).join(", "))`), keep the same argument, just swap the function name and add `countryCode` to the written data. Do NOT change `country` (the display name) — it stays user-provided.

- [ ] **Step 3: Update the stops tests' geocode mock and add a countryCode assertion**

In `server/actions/stops.test.ts`, ensure the `@/lib/geocode` mock exposes `geocodePlaceDetailed`:

```ts
vi.mock("@/lib/geocode", () => ({
  geocodePlace: vi.fn(async () => ({ lat: 1, lng: 2 })),
  geocodePlaceDetailed: vi.fn(async () => ({
    lat: 1, lng: 2, city: "Tokyo", country: "Japan", countryCode: "jp", name: "Tokyo",
  })),
}));
```

Add one test asserting a created scheduled stop stores the derived countryCode. Match it to whichever create helper the existing suite uses (look for an existing "creates a scheduled stop" test and mirror its setup):

```ts
it("stamps the derived countryCode on a geocoded scheduled stop", async () => {
  // ...arrange exactly as the existing scheduled-create test does...
  // then assert the create/update data included countryCode:
  const data = dbm.stop.create.mock.calls.at(-1)?.[0]?.data;
  expect(data.countryCode).toBe("jp");
});
```

- [ ] **Step 4: Run the stops tests**

Run: `npm test -- server/actions/stops.test.ts`
Expected: PASS, including the new countryCode assertion. Fix any existing test that broke because its geocode mock only returned `{lat,lng}` (add `countryCode` to that mock's return).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/geocode.ts server/actions/stops.ts server/actions/stops.test.ts
git commit -m "feat(globe-wishlist): derive & store Stop.countryCode on geocode (ADR 0025)"
```

---

## Task 6: Wishlist page loader wiring

**Files:**
- Modify: `app/(app)/trips/[tripId]/wishlist/page.tsx`

**Interfaces:**
- Consumes: `getUserGlobe` from `@/lib/globe`; `suggestMarkersForTrip` from `@/lib/globe-suggestions`; `MarkerView` from `@/components/globe/types`; new `WishlistBoard` props from Task 8.
- Produces (passed to `<WishlistBoard>`): `hasGlobe: boolean`, `globeMarkers: MarkerView[]`, `addedMarkerIds: string[]`, `suggestedMarkers: MarkerView[]`.

- [ ] **Step 1: Add imports**

```ts
import { getUserGlobe } from "@/lib/globe";
import { suggestMarkersForTrip } from "@/lib/globe-suggestions";
import type { MarkerView } from "@/components/globe/types";
```

- [ ] **Step 2: Extend the trip query selects**

In the `db.trip.findUnique` select, add to `stops.select`: `country: true, countryCode: true, lat: true, lng: true`. Add to `items.select`: `sourceMarkerId: true`.

- [ ] **Step 3: Load the viewer's Globe markers (non-creating)**

After `trip` is fetched and null-checked, add:

```ts
const globe = await getUserGlobe(user.id);
const globeMarkers: MarkerView[] = globe
  ? await db.marker.findMany({
      where: { globeId: globe.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, title: true, category: true, note: true, link: true, timing: true,
        lat: true, lng: true, city: true, country: true, countryCode: true,
      },
    })
  : [];
```

Note: use `getUserGlobe` (does NOT create a Globe), never `requireGlobeAccess` (which would create one just from viewing a wishlist).

- [ ] **Step 4: Compute the added set and suggestions**

```ts
// Markers already pulled into THIS trip's wishlist (dedupe scope = unscheduled ideas,
// which is exactly what trip.items already filters to).
const addedMarkerIds = trip.items
  .map((i) => i.sourceMarkerId)
  .filter((id): id is string => id !== null);

const suggestedMarkers = suggestMarkersForTrip({
  markers: globeMarkers,
  stops: trip.stops.map((s) => ({ countryCode: s.countryCode, lat: s.lat, lng: s.lng })),
  addedMarkerIds,
});
```

- [ ] **Step 5: Pass the new props to `<WishlistBoard>`**

```tsx
<WishlistBoard
  // ...existing props...
  hasGlobe={globe !== null}
  globeMarkers={globeMarkers}
  addedMarkerIds={addedMarkerIds}
  suggestedMarkers={suggestedMarkers}
/>
```

- [ ] **Step 6: Typecheck**

Run: `npm run build`
Expected: compiles. (`WishlistBoard` gains these optional props in Task 8; until then TS will error on unknown props — if executing Task 6 before Task 8, add the props to the interface as part of Task 8 and re-run. Recommended: implement Task 8's prop additions first, or run the build at the end of Task 8.)

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/trips/[tripId]/wishlist/page.tsx"
git commit -m "feat(globe-wishlist): load globe markers, added set & suggestions in wishlist page"
```

---

## Task 7: `AddFromGlobeDialog` component (WS-A)

**Files:**
- Create: `components/trip/add-from-globe-dialog.tsx`
- Test: `components/trip/add-from-globe-dialog.test.tsx`

**Interfaces:**
- Consumes: `addMarkerToWishlist` from `@/server/actions/items`; `MarkerView` from `@/components/globe/types`; `filterMarkers`, `distinctCountries` from `@/lib/globe-list`; `MarkerFilters` from `@/components/globe/marker-filters`; existing `Dialog` primitives and `toast`.
- Produces:
  ```ts
  export interface AddFromGlobeDialogProps {
    tripId: string;
    markers: MarkerView[];
    addedMarkerIds: string[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** When set, the list is pre-limited to these marker ids (the "+N more" path). */
    filterToIds?: string[] | null;
  }
  export function AddFromGlobeDialog(props: AddFromGlobeDialogProps): JSX.Element
  ```

- [ ] **Step 1: Confirm the Dialog primitive API**

Run: `grep -n "export" components/ui/dialog.tsx | head` and open `components/trip/item-form-dialog.tsx` to copy the exact `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` usage this codebase uses. Mirror that API in the component and test below (the snippets assume `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` from `@/components/ui/dialog`; adjust if names differ).

- [ ] **Step 2: Write the failing test**

Create `components/trip/add-from-globe-dialog.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddFromGlobeDialog } from "./add-from-globe-dialog";
import type { MarkerView } from "@/components/globe/types";

vi.mock("@/server/actions/items", () => ({ addMarkerToWishlist: vi.fn(async () => ({ success: true })) }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));

import { addMarkerToWishlist } from "@/server/actions/items";

function marker(id: string, overrides: Partial<MarkerView> = {}): MarkerView {
  return {
    id, title: id, category: "SIGHTSEEING", note: null, link: null, timing: null,
    lat: null, lng: null, city: null, country: "Japan", countryCode: "jp", ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("AddFromGlobeDialog", () => {
  it("lists markers and calls addMarkerToWishlist on Add", async () => {
    render(
      <AddFromGlobeDialog
        tripId="t1"
        markers={[marker("Tokyo Tower")]}
        addedMarkerIds={[]}
        open
        onOpenChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add tokyo tower/i }));
    await waitFor(() => expect(addMarkerToWishlist).toHaveBeenCalledWith("Tokyo Tower", "t1"));
  });

  it("shows already-added markers as added and does not call the action", () => {
    render(
      <AddFromGlobeDialog
        tripId="t1"
        markers={[marker("Tokyo Tower")]}
        addedMarkerIds={["Tokyo Tower"]}
        open
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByText(/added/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add tokyo tower/i })).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no markers", () => {
    render(
      <AddFromGlobeDialog tripId="t1" markers={[]} addedMarkerIds={[]} open onOpenChange={() => {}} />,
    );
    expect(screen.getByText(/no markers yet/i)).toBeInTheDocument();
  });

  it("limits the list to filterToIds when provided", () => {
    render(
      <AddFromGlobeDialog
        tripId="t1"
        markers={[marker("Tokyo Tower"), marker("Osaka Castle")]}
        addedMarkerIds={[]}
        filterToIds={["Osaka Castle"]}
        open
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByText("Osaka Castle")).toBeInTheDocument();
    expect(screen.queryByText("Tokyo Tower")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- components/trip/add-from-globe-dialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the component**

Create `components/trip/add-from-globe-dialog.tsx`:

```tsx
"use client";

import * as React from "react";
import { Check, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MarkerFilters } from "@/components/globe/marker-filters";
import { filterMarkers, distinctCountries, type MarkerFilter } from "@/lib/globe-list";
import { addMarkerToWishlist } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import type { MarkerView } from "@/components/globe/types";
import { CATEGORIES } from "@/lib/categories";

export interface AddFromGlobeDialogProps {
  tripId: string;
  markers: MarkerView[];
  addedMarkerIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterToIds?: string[] | null;
}

export function AddFromGlobeDialog({
  tripId,
  markers,
  addedMarkerIds,
  open,
  onOpenChange,
  filterToIds,
}: AddFromGlobeDialogProps) {
  const [filter, setFilter] = React.useState<MarkerFilter>({ query: "", category: null, country: null });
  // Locally-added ids for optimistic "✓ added" without waiting for revalidation.
  const [justAdded, setJustAdded] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState<string | null>(null);

  const added = React.useMemo(
    () => new Set([...addedMarkerIds, ...justAdded]),
    [addedMarkerIds, justAdded],
  );

  const scoped = React.useMemo(() => {
    const base = filterToIds ? markers.filter((m) => filterToIds.includes(m.id)) : markers;
    return filterMarkers(base, filter);
  }, [markers, filterToIds, filter]);

  const countries = React.useMemo(() => distinctCountries(markers), [markers]);
  const categoryLabel = (value: string) =>
    CATEGORIES.find((c) => c.value === value)?.label ?? value;

  async function handleAdd(marker: MarkerView) {
    setPending(marker.id);
    try {
      const result = await addMarkerToWishlist(marker.id, tripId);
      if (result.success) {
        setJustAdded((prev) => new Set(prev).add(marker.id));
        toast({ title: "Added to Wishlist", description: marker.title });
      } else {
        const firstError = Object.values(result.errors)[0]?.[0];
        toast({ variant: "destructive", title: "Couldn't add", description: firstError });
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add from your Globe</DialogTitle>
        </DialogHeader>

        {markers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Your Globe has no markers yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <MarkerFilters filter={filter} countries={countries} onChange={setFilter} />
            <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
              {scoped.map((marker) => {
                const isAdded = added.has(marker.id);
                return (
                  <li
                    key={marker.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {marker.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {[categoryLabel(marker.category), marker.city ?? marker.country]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    {isAdded ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        <Check className="size-3.5" aria-hidden="true" /> Added
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Add ${marker.title}`}
                        disabled={pending === marker.id}
                        onClick={() => handleAdd(marker)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        <Plus className="size-3.5" aria-hidden="true" /> Add
                      </button>
                    )}
                  </li>
                );
              })}
              {scoped.length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  No markers match your filters.
                </li>
              )}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- components/trip/add-from-globe-dialog.test.tsx`
Expected: PASS (4 tests). If the Dialog primitive renders children only when mounted in a portal that RTL can't see, follow how `item-form-dialog.test.tsx` renders/queries its dialog and mirror it.

- [ ] **Step 6: Commit**

```bash
git add components/trip/add-from-globe-dialog.tsx components/trip/add-from-globe-dialog.test.tsx
git commit -m "feat(globe-wishlist): AddFromGlobeDialog (WS-A manual pull)"
```

---

## Task 8: `GlobeSuggestionsStrip` + wire into the Wishlist board (WS-B)

**Files:**
- Create: `components/trip/globe-suggestions-strip.tsx`
- Test: `components/trip/globe-suggestions-strip.test.tsx`
- Modify: `components/trip/wishlist-board.tsx` (props + header button + strip + dialog state)

**Interfaces:**
- Consumes: `addMarkerToWishlist`; `MarkerView`; `AddFromGlobeDialog` (Task 7).
- Produces:
  ```ts
  // globe-suggestions-strip.tsx
  export interface GlobeSuggestionsStripProps {
    tripId: string;
    suggestions: MarkerView[];   // already country-matched, proximity-ranked, added-excluded
    addedMarkerIds: string[];
    onSeeMore: () => void;       // opens the AddFromGlobeDialog filtered to all suggestions
  }
  export function GlobeSuggestionsStrip(props: GlobeSuggestionsStripProps): JSX.Element | null

  // wishlist-board.tsx — new optional props on WishlistBoardProps:
  //   hasGlobe?: boolean
  //   globeMarkers?: MarkerView[]
  //   addedMarkerIds?: string[]
  //   suggestedMarkers?: MarkerView[]
  ```
- Constant: `const SUGGESTIONS_CAP = 5;` in the strip.

- [ ] **Step 1: Write the failing test for the strip**

Create `components/trip/globe-suggestions-strip.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GlobeSuggestionsStrip } from "./globe-suggestions-strip";
import type { MarkerView } from "@/components/globe/types";

vi.mock("@/server/actions/items", () => ({ addMarkerToWishlist: vi.fn(async () => ({ success: true })) }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));

import { addMarkerToWishlist } from "@/server/actions/items";

function marker(id: string): MarkerView {
  return {
    id, title: id, category: "SIGHTSEEING", note: null, link: null, timing: null,
    lat: null, lng: null, city: null, country: "Japan", countryCode: "jp",
  };
}

beforeEach(() => vi.clearAllMocks());

describe("GlobeSuggestionsStrip", () => {
  it("renders nothing when there are no suggestions", () => {
    const { container } = render(
      <GlobeSuggestionsStrip tripId="t1" suggestions={[]} addedMarkerIds={[]} onSeeMore={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows at most 5 suggestions and a '+N more' control for the overflow", () => {
    const suggestions = Array.from({ length: 7 }, (_, i) => marker(`m${i}`));
    const onSeeMore = vi.fn();
    render(
      <GlobeSuggestionsStrip tripId="t1" suggestions={suggestions} addedMarkerIds={[]} onSeeMore={onSeeMore} />,
    );
    // 5 add buttons visible
    expect(screen.getAllByRole("button", { name: /^add / i })).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: /2 more/i }));
    expect(onSeeMore).toHaveBeenCalled();
  });

  it("adds a suggestion via the action", async () => {
    render(
      <GlobeSuggestionsStrip tripId="t1" suggestions={[marker("m0")]} addedMarkerIds={[]} onSeeMore={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add m0/i }));
    await waitFor(() => expect(addMarkerToWishlist).toHaveBeenCalledWith("m0", "t1"));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/trip/globe-suggestions-strip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the strip**

Create `components/trip/globe-suggestions-strip.tsx`:

```tsx
"use client";

import * as React from "react";
import { Check, Globe2, Plus } from "lucide-react";
import { addMarkerToWishlist } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import type { MarkerView } from "@/components/globe/types";

const SUGGESTIONS_CAP = 5;

export interface GlobeSuggestionsStripProps {
  tripId: string;
  suggestions: MarkerView[];
  addedMarkerIds: string[];
  onSeeMore: () => void;
}

export function GlobeSuggestionsStrip({
  tripId,
  suggestions,
  addedMarkerIds,
  onSeeMore,
}: GlobeSuggestionsStripProps) {
  const [justAdded, setJustAdded] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState<string | null>(null);

  const added = React.useMemo(
    () => new Set([...addedMarkerIds, ...justAdded]),
    [addedMarkerIds, justAdded],
  );

  // Exclude anything added since render; then cap.
  const visible = suggestions.filter((m) => !added.has(m.id));
  if (visible.length === 0) return null;

  const shown = visible.slice(0, SUGGESTIONS_CAP);
  const overflow = visible.length - shown.length;

  async function handleAdd(marker: MarkerView) {
    setPending(marker.id);
    try {
      const result = await addMarkerToWishlist(marker.id, tripId);
      if (result.success) {
        setJustAdded((prev) => new Set(prev).add(marker.id));
        toast({ title: "Added to Wishlist", description: marker.title });
      } else {
        const firstError = Object.values(result.errors)[0]?.[0];
        toast({ variant: "destructive", title: "Couldn't add", description: firstError });
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Globe2 className="size-4 text-primary" aria-hidden="true" />
        <h3 className="font-display text-base font-semibold text-foreground">
          Suggested from your Globe
        </h3>
      </div>
      <ul className="flex flex-col gap-2">
        {shown.map((marker) => (
          <li
            key={marker.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
          >
            <div className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">
                {marker.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {marker.city ?? marker.country}
              </span>
            </div>
            <button
              type="button"
              aria-label={`Add ${marker.title}`}
              disabled={pending === marker.id}
              onClick={() => handleAdd(marker)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="size-3.5" aria-hidden="true" /> Add
            </button>
          </li>
        ))}
      </ul>
      {overflow > 0 && (
        <button
          type="button"
          onClick={onSeeMore}
          className="mt-3 text-xs font-medium text-primary hover:underline"
        >
          +{overflow} more from your Globe
        </button>
      )}
    </section>
  );
}
```

Note: the `Check` import is unused here — remove it if lint flags it (kept out of the JSX intentionally; the strip never shows an "added" pill, it just drops added items).

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- components/trip/globe-suggestions-strip.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire props + button + strip + dialog into `wishlist-board.tsx`**

Add imports at the top of `components/trip/wishlist-board.tsx`:

```tsx
import { Globe2 } from "lucide-react";
import type { MarkerView } from "@/components/globe/types";
import { AddFromGlobeDialog } from "./add-from-globe-dialog";
import { GlobeSuggestionsStrip } from "./globe-suggestions-strip";
```

Add to `WishlistBoardProps`:

```ts
  /** Whether the viewing user belongs to a Globe (controls the "Add from Globe" affordance). */
  hasGlobe?: boolean;
  /** All Markers on the viewer's Globe (for the browser dialog). */
  globeMarkers?: MarkerView[];
  /** Marker ids already pulled into this trip's wishlist. */
  addedMarkerIds?: string[];
  /** Country-matched, proximity-ranked, added-excluded suggestions (WS-B). */
  suggestedMarkers?: MarkerView[];
```

Destructure them in the component signature with defaults:

```tsx
  hasGlobe = false,
  globeMarkers = [],
  addedMarkerIds = [],
  suggestedMarkers = [],
```

Add dialog state near the other `useState` hooks:

```tsx
  const [globeDialogOpen, setGlobeDialogOpen] = React.useState(false);
  const [globeDialogFilterIds, setGlobeDialogFilterIds] = React.useState<string[] | null>(null);

  function openGlobeBrowser() {
    setGlobeDialogFilterIds(null);
    setGlobeDialogOpen(true);
  }
  function openGlobeSuggestionsOverflow() {
    setGlobeDialogFilterIds(suggestedMarkers.map((m) => m.id));
    setGlobeDialogOpen(true);
  }
```

In the header actions `<div className="flex items-center gap-3">`, add an "Add from Globe" button before/after `AddItemButton`, shown only when `hasGlobe`:

```tsx
          {hasGlobe && (
            <button
              type="button"
              onClick={openGlobeBrowser}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Globe2 className="size-4" aria-hidden="true" /> Add from Globe
            </button>
          )}
```

Render the suggestions strip directly on the board — place it just inside the outer container, above the empty state / list sections (e.g. right after the header `</div>` block, before the empty-state block):

```tsx
      {hasGlobe && (
        <GlobeSuggestionsStrip
          tripId={tripId}
          suggestions={suggestedMarkers}
          addedMarkerIds={addedMarkerIds}
          onSeeMore={openGlobeSuggestionsOverflow}
        />
      )}
```

Render the dialog alongside the other dialogs (near `{dialog}` at the end):

```tsx
      {hasGlobe && (
        <AddFromGlobeDialog
          tripId={tripId}
          markers={globeMarkers}
          addedMarkerIds={addedMarkerIds}
          filterToIds={globeDialogFilterIds}
          open={globeDialogOpen}
          onOpenChange={setGlobeDialogOpen}
        />
      )}
```

- [ ] **Step 6: Update the board test if it constructs `WishlistBoardProps` strictly**

Run: `npm test -- components/trip/wishlist-board.test.tsx`
Expected: PASS. The new props are optional with defaults, so existing tests should still pass. If a test asserts on the exact header contents, update it to tolerate the new button (only appears when `hasGlobe` is passed, which existing tests don't pass — so default `false` hides it). Add one test that passes `hasGlobe suggestedMarkers={[oneMarker]}` and asserts the "Suggested from your Globe" heading renders.

- [ ] **Step 7: Full test + build + lint**

Run: `npm test`
Expected: all pass.
Run: `npm run build`
Expected: compiles (this also validates Task 6's page wiring against the new props).
Run: `npm run lint`
Expected: no errors (remove any unused imports such as `Check` in the strip).

- [ ] **Step 8: Commit**

```bash
git add components/trip/globe-suggestions-strip.tsx components/trip/globe-suggestions-strip.test.tsx components/trip/wishlist-board.tsx components/trip/wishlist-board.test.tsx
git commit -m "feat(globe-wishlist): suggestions strip + Add-from-Globe wiring on the board (WS-B)"
```

---

## Self-Review

**Spec coverage (docs/specs/globe-wishlist-link.md):**
- WS-A "Add from Globe" button on board → Task 8 (button) + Task 7 (dialog). ✓
- Dialog: list, no map, search + category filter, one-tap Add → Task 7. ✓
- Copy mapping (title/category/lat-lng/address/link/notes+timing) → Task 2, used by Task 3. ✓
- Provenance `Item.sourceMarkerId` + "✓ added" + re-addable after delete/schedule → Task 1 (column), Task 3 (dedupe scoped to unscheduled ideas → scheduling/deleting frees it), Task 7/8 (added state). ✓
- Same Activity event as manual add → Task 3 (CREATED/ITEM, forkId null). ✓
- No Globe → no button; empty Globe → button + empty-state dialog → Task 6 (`hasGlobe`), Task 7 (empty state). ✓
- WS-B `Stop.countryCode` derived via geocode + match rule (country inclusion, proximity rank) → Task 1 (column), Task 5 (derive), Task 4 (selection). ✓
- Suggestions strip on the board, expanded, cap 5, exclude added, "+N more" → dialog filtered to matches → Task 8 (strip cap + onSeeMore), Task 6 (compute), Task 7 (filterToIds). ✓
- Strip hidden when no Globe / no matches / no located stops → Task 4 returns [] when no stop countryCode; strip returns null when empty; board gates on `hasGlobe`. ✓
- Deferred items (wishlist-item proximity, globe-side push, batch add, dialog map) → not in any task, correctly out of scope. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The only softened steps are Task 5's mechanical call-site swap (grep-driven, transformation shown explicitly) and Task 7 Step 1 (verify Dialog primitive API before mirroring) — both give exact patterns, not vague instructions.

**Type consistency:** `MarkerView` (from `@/components/globe/types`) used consistently across Tasks 2/4/6/7/8. `WishlistItemSeed`/`markerToWishlistItemData` (Task 2) consumed in Task 3. `suggestMarkersForTrip`/`TripStopLocation` (Task 4) consumed in Task 6. `addMarkerToWishlist(markerId, tripId)` signature identical in Tasks 3/7/8. New `WishlistBoardProps` fields (`hasGlobe`, `globeMarkers`, `addedMarkerIds`, `suggestedMarkers`) defined in Task 8, supplied in Task 6 — build in Task 8 Step 7 validates the pairing. `geocodePlaceDetailed` returns `GeoCandidate` (existing type). ✓
