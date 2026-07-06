# The Globe (cross-trip wishlist) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single shared, account-level "Globe" — a cross-trip world map of Markers (places/things/events the two members want to visit someday) — with a Leaflet map view, a filterable list, add-via-search and add-via-map-click, and email-match invite sharing.

**Architecture:** A new account-level aggregate (`Globe` + `GlobeMember` + `GlobeInvite`) sits above Trips, structurally parallel to `Trip`/`TripMember`/`Invite` (see ADR 0023). Each user belongs to at most one Globe (DB-enforced), lazily created on first `/globe` visit and joined by the partner via the existing app-load invite reconciler (ADR 0017). `Marker`s hang off the Globe; their location (`lat`/`lng`/`city`/`country`/`countryCode`) is auto-derived by extending the existing Nominatim helper in `lib/geocode.ts` (forward search + reverse). The map reuses the existing Leaflet pattern from `components/trip/wishlist-map.tsx` (ADR 0024 — flat map, not 3D).

**Tech Stack:** Next.js 16 (App Router, Server Components + server actions), React 19, Prisma 7 (driver-adapter over Postgres), Zod 4, next-auth v5, Leaflet 1.9, Radix UI, lucide-react, Tailwind v4, Vitest.

## Global Constraints

- **Never work on `main`** — all work is on branch `feat/globe-cross-trip-wishlist` (already created).
- **Node** `>=20.19`.
- **Enum-ish columns are plain `String`** validated by Zod unions in `lib/enums.ts` / `lib/categories.ts` — never Prisma `enum` (portability).
- **Categories reuse the existing set** in `lib/categories.ts`: `SIGHTSEEING | FOOD | ACTIVITY | NIGHTLIFE | SHOPPING | OTHER`. Do not invent a new category list.
- **Roles reuse `MEMBER_ROLES`** from `lib/enums.ts`: `"owner" | "member"`.
- **Dates/timestamps** stored as they are elsewhere; `Marker` has no calendar date — only a free-text `timing` (the glossary "when").
- **Geocoding uses OpenStreetMap Nominatim only** (no paid geocoder), never throws, times out at 5s, honours the existing `NOMINATIM_CONTACT` User-Agent rule.
- **Links** must pass `safeWebHref` from `lib/url.ts` (reject `javascript:`/`data:` — stored-XSS guard), mirroring `lib/validations/item.ts`.
- **Server actions** follow the house shape: `"use server"`, Zod `safeParse`, `requireGlobeAccess()` gate, return `{ success: true, ... } | { success: false, errors: Record<string, string[]> }`, then `revalidatePath("/globe")`.
- **Tests**: Vitest, run with `npx vitest run <path>`. Mock `@/lib/db`, guards, and `@/lib/geocode` the way `server/actions/*.test.ts` do. Never hit the network in tests.
- **"Globe" is a product name; it renders as a flat Leaflet map** (ADR 0024). Do not add a 3D globe library.
- **Prisma migrations** are named `YYYYMMDDHHMMSS_slug`; this feature uses `20260706000000_add_globe`.
- **A user belongs to at most one Globe** — enforced by `@@unique([userId])` on `GlobeMember` (ADR 0023).

---

## File Structure

**New — data & logic**
- `prisma/schema.prisma` (modify) — add `Globe`, `GlobeMember`, `GlobeInvite`, `Marker`; add relations on `User`.
- `prisma/migrations/20260706000000_add_globe/migration.sql` (create, via `migrate dev`).
- `lib/geocode.ts` (modify) — add `searchPlaces()` + `reverseGeocode()` returning `GeoCandidate`.
- `lib/validations/marker.ts` (create) — `markerSchema`, `MarkerInput`, `MarkerOutput`.
- `lib/globe.ts` (create) — `getUserGlobe()`, `getOrCreateUserGlobe()`, `requireGlobeAccess()`.
- `lib/globe-invites.ts` (create) — `decideGlobeMembership()` (pure) + `acceptPendingGlobeInvitesForUser()` (side-effect).
- `lib/globe-list.ts` (create) — pure `filterMarkers()` + `groupMarkersByCountry()` for the list view.
- `server/actions/globe.ts` (create) — `searchPlacesAction`, `reverseGeocodeAction`, `createMarker`, `updateMarker`, `deleteMarker`, `inviteToGlobe`.

**New — UI**
- `app/(app)/globe/page.tsx` (create) — server component; loads/creates the globe, its markers + members.
- `components/globe/globe-view.tsx` (create) — client orchestrator (map + list + filters + dialogs + invite).
- `components/globe/globe-map.tsx` (create) — Leaflet map (generalised `wishlist-map`): pins + `onSelect` + `onMapClick`.
- `components/globe/globe-map-loader.tsx` (create) — `next/dynamic` `ssr:false` boundary.
- `components/globe/marker-list.tsx` (create) — list grouped by country.
- `components/globe/marker-filters.tsx` (create) — category + country + text filters.
- `components/globe/marker-form.tsx` (create) — add/edit dialog: place search, map-click prefill, fields, submit/delete.
- `components/globe/globe-invite-button.tsx` (create) — invite partner by email.
- `components/globe/types.ts` (create) — shared `MarkerView`, `GlobeMemberView` types.

**Modify — wiring**
- `app/(app)/layout.tsx` — call `acceptPendingGlobeInvitesForUser` next to the trip reconciler; add a top-bar "Globe" link.
- `components/command-palette.tsx` — add a global "Globe" command.

---

## Task 1: Schema — Globe, GlobeMember, GlobeInvite, Marker

**Files:**
- Modify: `prisma/schema.prisma` (User model relations; add four models near the `Trip`/`Invite` blocks)
- Create: `prisma/migrations/20260706000000_add_globe/migration.sql` (generated)

**Interfaces:**
- Produces (Prisma models used by every later task):
  - `Globe { id, createdById, createdBy, members, markers, invites, createdAt, updatedAt }`
  - `GlobeMember { id, globeId, userId, role, globe, user, createdAt }` with `@@unique([userId])`, `@@index([globeId])`
  - `GlobeInvite { id, globeId, email, token, role, acceptedAt, globe, createdAt }` with `@@unique([globeId, email])`, `@@index([email])`, `@@index([globeId])`
  - `Marker { id, globeId, title, category, note?, link?, timing?, lat?, lng?, city?, country?, countryCode?, createdById, globe, createdBy, createdAt, updatedAt }` with `@@index([globeId])`

- [ ] **Step 1: Add relations to the `User` model**

In `prisma/schema.prisma`, inside `model User { ... }`, add these relation fields alongside the existing ones (e.g. after `activities Activity[]`):

```prisma
  globeMembership GlobeMember?
  globesCreated   Globe[]       @relation("GlobeCreatedBy")
  markersCreated  Marker[]      @relation("MarkerCreatedBy")
```

- [ ] **Step 2: Add the four new models**

Append to `prisma/schema.prisma` (after the `Invite` model is a natural home):

```prisma
// ---------------------------------------------------------------------------
// The Globe — a single shared, cross-trip collection of places to visit.
// Account-level aggregate, decoupled from Trip (see ADR 0023). Rendered as a
// flat Leaflet map (see ADR 0024).
// ---------------------------------------------------------------------------

model Globe {
  id          String @id @default(cuid())
  createdById String

  createdBy User          @relation("GlobeCreatedBy", fields: [createdById], references: [id])
  members   GlobeMember[]
  markers   Marker[]
  invites   GlobeInvite[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([createdById])
}

model GlobeMember {
  id      String @id @default(cuid())
  globeId String
  userId  String
  role    String // lib/enums.ts MEMBER_ROLES: "owner" | "member"

  globe Globe @relation(fields: [globeId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  // A user belongs to at most one Globe (ADR 0023) — enforced globally, not
  // just per-globe, so a userId appears in exactly one GlobeMember row.
  @@unique([userId])
  @@index([globeId])
}

model GlobeInvite {
  id         String    @id @default(cuid())
  globeId    String
  email      String
  token      String    @unique
  role       String    @default("member")
  acceptedAt DateTime?

  globe Globe @relation(fields: [globeId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@unique([globeId, email])
  @@index([globeId])
  @@index([email])
}

model Marker {
  id          String  @id @default(cuid())
  globeId     String
  title       String
  category    String // lib/categories.ts CATEGORY_VALUES
  note        String?
  link        String?
  timing      String? // rough free-text "when" (e.g. "late Sept") — never a scheduled date
  lat         Float?
  lng         Float?
  city        String? // auto-derived town/city
  country     String? // auto-derived country name
  countryCode String? // auto-derived ISO 3166-1 alpha-2 (lowercase, from Nominatim)
  createdById String

  globe     Globe @relation(fields: [globeId], references: [id], onDelete: Cascade)
  createdBy User  @relation("MarkerCreatedBy", fields: [createdById], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([globeId])
  @@index([createdById])
}
```

- [ ] **Step 3: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Create the migration and regenerate the client**

Run: `npx prisma migrate dev --name add_globe`
Expected: migration `..._add_globe` created and applied; `prisma generate` runs. (Postgres must be up — `docker compose up -d` if not. If the auto-timestamp differs from `20260706000000`, that is fine — the name suffix `_add_globe` is what matters.)

- [ ] **Step 5: Typecheck that generated types compile**

Run: `npx tsc --noEmit`
Expected: no errors (the new `db.globe` / `db.marker` etc. are now typed).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(globe): add Globe/GlobeMember/GlobeInvite/Marker schema (ADR 0023)"
```

---

## Task 2: Marker validation schema

**Files:**
- Create: `lib/validations/marker.ts`
- Test: `lib/validations/marker.test.ts`

**Interfaces:**
- Consumes: `categorySchema` from `@/lib/categories`; `safeWebHref` from `@/lib/url`.
- Produces:
  - `markerSchema` (Zod)
  - `type MarkerInput = z.input<typeof markerSchema>`
  - `type MarkerOutput = z.output<typeof markerSchema>`

- [ ] **Step 1: Write the failing test**

Create `lib/validations/marker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { markerSchema } from "./marker";

describe("markerSchema", () => {
  it("accepts a minimal marker (title + category)", () => {
    const parsed = markerSchema.safeParse({ title: "Tokyo Tower", category: "SIGHTSEEING" });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty title", () => {
    const parsed = markerSchema.safeParse({ title: "  ", category: "OTHER" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown category", () => {
    const parsed = markerSchema.safeParse({ title: "X", category: "NOPE" });
    expect(parsed.success).toBe(false);
  });

  it("accepts full auto-derived location + optional fields", () => {
    const parsed = markerSchema.safeParse({
      title: "Tokyo Tower",
      category: "SIGHTSEEING",
      note: "sunset views",
      link: "https://example.com",
      timing: "late Sept",
      lat: 35.6586,
      lng: 139.7454,
      city: "Tokyo",
      country: "Japan",
      countryCode: "jp",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a javascript: link", () => {
    const parsed = markerSchema.safeParse({
      title: "X",
      category: "OTHER",
      link: "javascript:alert(1)",
    });
    expect(parsed.success).toBe(false);
  });

  it("coerces empty-string optionals to undefined", () => {
    const parsed = markerSchema.safeParse({
      title: "X",
      category: "OTHER",
      note: "",
      link: "",
      timing: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.note).toBeUndefined();
      expect(parsed.data.link).toBeUndefined();
      expect(parsed.data.timing).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/validations/marker.test.ts`
Expected: FAIL — `Cannot find module './marker'`.

- [ ] **Step 3: Write the schema**

Create `lib/validations/marker.ts`:

```ts
import { z } from "zod";
import { categorySchema } from "@/lib/categories";
import { safeWebHref } from "@/lib/url";

/** "" | undefined -> undefined; otherwise the trimmed string. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v));

/**
 * Zod schema for creating/updating a Marker on the Globe.
 *
 * `title` + `category` are the only required fields. Location fields
 * (lat/lng/city/country/countryCode) are auto-derived on the client from a
 * chosen geocode candidate and passed through here; they are optional because
 * a Marker with no resolvable location is still valid (it shows in the list,
 * not on the map). `timing` is the rough free-text "when" — never a date.
 */
export const markerSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(140, "Title must be 140 characters or fewer"),
  category: categorySchema,
  note: optionalText(2000),
  link: z
    .string()
    .trim()
    .optional()
    .refine((v) => v == null || v === "" || safeWebHref(v) !== null, {
      message: "Link must be a valid web address (http/https)",
    })
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  timing: optionalText(120),
  lat: z.number().optional(),
  lng: z.number().optional(),
  city: optionalText(140),
  country: optionalText(140),
  // ISO 3166-1 alpha-2, lowercase as Nominatim returns it.
  countryCode: z
    .string()
    .trim()
    .length(2)
    .toLowerCase()
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
});

/** Pre-transform input type (what callers pass). */
export type MarkerInput = z.input<typeof markerSchema>;
/** Post-parse type (internal use). */
export type MarkerOutput = z.output<typeof markerSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/validations/marker.test.ts`
Expected: PASS (all 6).

- [ ] **Step 5: Commit**

```bash
git add lib/validations/marker.ts lib/validations/marker.test.ts
git commit -m "feat(globe): add marker validation schema"
```

---

## Task 3: Geocode — forward search + reverse

**Files:**
- Modify: `lib/geocode.ts` (add functions; leave `geocodePlace` untouched)
- Test: `lib/geocode.test.ts` (append describe blocks)

**Interfaces:**
- Produces:
  - `interface GeoCandidate { name: string; lat: number; lng: number; city: string | null; country: string | null; countryCode: string | null }`
  - `searchPlaces(query: string, limit?: number): Promise<GeoCandidate[]>`
  - `reverseGeocode(lat: number, lng: number): Promise<GeoCandidate | null>`

- [ ] **Step 1: Write the failing tests**

Append to `lib/geocode.test.ts`:

```ts
import { searchPlaces, reverseGeocode } from "./geocode";

describe("searchPlaces", () => {
  it("maps candidates with derived city/country/countryCode", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          display_name: "Tokyo Tower, Minato, Tokyo, Japan",
          lat: "35.6586",
          lon: "139.7454",
          address: { city: "Tokyo", country: "Japan", country_code: "jp" },
        },
      ],
    });

    const results = await searchPlaces("Tokyo Tower");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      name: "Tokyo Tower, Minato, Tokyo, Japan",
      city: "Tokyo",
      country: "Japan",
      countryCode: "jp",
    });
    expect(results[0].lat).toBeCloseTo(35.6586);
    expect(results[0].lng).toBeCloseTo(139.7454);
  });

  it("falls back through town/village when city is absent", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          display_name: "Hallstatt, Austria",
          lat: "47.56",
          lon: "13.64",
          address: { village: "Hallstatt", country: "Austria", country_code: "at" },
        },
      ],
    });
    const results = await searchPlaces("Hallstatt");
    expect(results[0].city).toBe("Hallstatt");
  });

  it("returns [] on empty result, non-ok, or network error", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    expect(await searchPlaces("nowhere")).toEqual([]);

    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => [] });
    expect(await searchPlaces("paris")).toEqual([]);

    fetchMock.mockRejectedValue(new Error("network"));
    expect(await searchPlaces("paris")).toEqual([]);
  });
});

describe("reverseGeocode", () => {
  it("maps a reverse hit to a GeoCandidate", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: "Eiffel Tower, Paris, France",
        lat: "48.8584",
        lon: "2.2945",
        address: { city: "Paris", country: "France", country_code: "fr" },
      }),
    });
    const result = await reverseGeocode(48.8584, 2.2945);
    expect(result).toMatchObject({ name: "Eiffel Tower, Paris, France", city: "Paris", countryCode: "fr" });
  });

  it("returns null on error / no address", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect(await reverseGeocode(0, 0)).toBeNull();

    fetchMock.mockRejectedValue(new Error("network"));
    expect(await reverseGeocode(0, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/geocode.test.ts`
Expected: FAIL — `searchPlaces`/`reverseGeocode` are not exported.

- [ ] **Step 3: Implement the two functions**

Add to `lib/geocode.ts` (below the existing `geocodePlace`; reuse the existing `NOMINATIM_URL`, `USER_AGENT`, `TIMEOUT_MS` constants — do not redeclare them):

```ts
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

/** A resolved place from Nominatim, with the address components we care about. */
export interface GeoCandidate {
  name: string;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
  countryCode: string | null;
}

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  country?: string;
  country_code?: string;
}

interface NominatimDetailedResult {
  display_name?: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
}

/** Best-effort city/town from Nominatim's address components. */
function pickCity(address: NominatimAddress | undefined): string | null {
  if (!address) return null;
  return (
    address.city ??
    address.town ??
    address.village ??
    address.hamlet ??
    address.municipality ??
    null
  );
}

function toCandidate(r: NominatimDetailedResult): GeoCandidate | null {
  const lat = parseFloat(r.lat);
  const lng = parseFloat(r.lon);
  if (isNaN(lat) || isNaN(lng)) return null;
  return {
    name: r.display_name ?? "",
    lat,
    lng,
    city: pickCity(r.address),
    country: r.address?.country ?? null,
    countryCode: r.address?.country_code ?? null,
  };
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Forward-search a free-text place query, returning up to `limit` candidates
 * with derived city/country. Never throws; returns [] on any failure.
 */
export async function searchPlaces(query: string, limit = 5): Promise<GeoCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("q", trimmed);

  const data = await fetchJson(url.toString());
  if (!Array.isArray(data)) return [];
  return (data as NominatimDetailedResult[])
    .map(toCandidate)
    .filter((c): c is GeoCandidate => c !== null);
}

/**
 * Reverse-geocode a coordinate to a single named place with derived
 * city/country. Never throws; returns null on any failure.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoCandidate | null> {
  const url = new URL(NOMINATIM_REVERSE_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));

  const data = await fetchJson(url.toString());
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const result = data as NominatimDetailedResult;
  if (!result.lat || !result.lon) return null;
  return toCandidate(result);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/geocode.test.ts`
Expected: PASS (existing `geocodePlace` tests + new ones).

- [ ] **Step 5: Commit**

```bash
git add lib/geocode.ts lib/geocode.test.ts
git commit -m "feat(globe): add forward-search + reverse geocoding with address components"
```

---

## Task 4: Globe access + lazy creation

**Files:**
- Create: `lib/globe.ts`
- Test: `lib/globe.test.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/db`; `requireUser` from `@/lib/guards`.
- Produces:
  - `getUserGlobe(userId: string): Promise<{ id: string } | null>`
  - `getOrCreateUserGlobe(userId: string): Promise<{ id: string }>`
  - `requireGlobeAccess(): Promise<{ user: { id: string }; globe: { id: string } }>` — the current user's single Globe, creating it if needed.

- [ ] **Step 1: Write the failing test**

Create `lib/globe.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    globeMember: { findUnique: vi.fn() },
    globe: { create: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { getUserGlobe, getOrCreateUserGlobe } from "./globe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbm = db as any;

beforeEach(() => vi.clearAllMocks());

describe("getUserGlobe", () => {
  it("returns the globe id when the user is a member", async () => {
    dbm.globeMember.findUnique.mockResolvedValue({ globeId: "g1" });
    expect(await getUserGlobe("u1")).toEqual({ id: "g1" });
  });

  it("returns null when the user has no globe", async () => {
    dbm.globeMember.findUnique.mockResolvedValue(null);
    expect(await getUserGlobe("u1")).toBeNull();
  });
});

describe("getOrCreateUserGlobe", () => {
  it("returns the existing globe without creating", async () => {
    dbm.globeMember.findUnique.mockResolvedValue({ globeId: "g1" });
    const res = await getOrCreateUserGlobe("u1");
    expect(res).toEqual({ id: "g1" });
    expect(dbm.globe.create).not.toHaveBeenCalled();
  });

  it("creates a globe with the user as owner when none exists", async () => {
    dbm.globeMember.findUnique.mockResolvedValue(null);
    dbm.globe.create.mockResolvedValue({ id: "gNew" });
    const res = await getOrCreateUserGlobe("u1");
    expect(res).toEqual({ id: "gNew" });
    expect(dbm.globe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: "u1",
          members: { create: { userId: "u1", role: "owner" } },
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/globe.test.ts`
Expected: FAIL — `Cannot find module './globe'`.

- [ ] **Step 3: Implement `lib/globe.ts`**

```ts
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";

/** Return the id of the Globe this user belongs to, or null. */
export async function getUserGlobe(userId: string): Promise<{ id: string } | null> {
  const membership = await db.globeMember.findUnique({
    where: { userId },
    select: { globeId: true },
  });
  return membership ? { id: membership.globeId } : null;
}

/**
 * Return the user's Globe, lazily creating one (with the user as owner) if they
 * don't have one yet. A user belongs to at most one Globe (ADR 0023).
 *
 * If a concurrent request created the membership first, the unique constraint on
 * GlobeMember.userId trips (P2002); we recover by re-reading.
 */
export async function getOrCreateUserGlobe(userId: string): Promise<{ id: string }> {
  const existing = await getUserGlobe(userId);
  if (existing) return existing;

  try {
    const globe = await db.globe.create({
      data: {
        createdById: userId,
        members: { create: { userId, role: "owner" } },
      },
      select: { id: true },
    });
    return { id: globe.id };
  } catch (err) {
    // Lost a create race — the other request made the membership. Re-read.
    const now = await getUserGlobe(userId);
    if (now) return now;
    throw err;
  }
}

/**
 * Gate for Globe routes/actions: require an authed user and return their Globe,
 * creating it on first access.
 */
export async function requireGlobeAccess(): Promise<{
  user: { id: string };
  globe: { id: string };
}> {
  const user = await requireUser();
  const globe = await getOrCreateUserGlobe(user.id);
  return { user: { id: user.id }, globe };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/globe.test.ts`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
git add lib/globe.ts lib/globe.test.ts
git commit -m "feat(globe): add globe access + lazy creation helpers"
```

---

## Task 5: Globe invite reconciliation + app-load wiring

**Files:**
- Create: `lib/globe-invites.ts`
- Test: `lib/globe-invites.test.ts`
- Modify: `app/(app)/layout.tsx` (call the new reconciler)

**Interfaces:**
- Consumes: `db`; `getUserGlobe` from `@/lib/globe`.
- Produces:
  - `interface PendingGlobeInviteLike { id: string; globeId: string; email: string }`
  - `decideGlobeMembership(pending: readonly PendingGlobeInviteLike[], userAlreadyHasGlobe: boolean, userEmail: string): PendingGlobeInviteLike | null` — pure; returns the single invite to accept, or null.
  - `acceptPendingGlobeInvitesForUser(userId: string, email: string): Promise<void>` — side-effect.

- [ ] **Step 1: Write the failing test**

Create `lib/globe-invites.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decideGlobeMembership } from "./globe-invites";

const inv = (id: string, email: string) => ({ id, globeId: `globe-${id}`, email });

describe("decideGlobeMembership", () => {
  it("returns null when the user already has a globe (defer merge)", () => {
    expect(decideGlobeMembership([inv("1", "a@x.com")], true, "a@x.com")).toBeNull();
  });

  it("returns the matching invite when the user has no globe", () => {
    const chosen = decideGlobeMembership([inv("1", "a@x.com")], false, "a@x.com");
    expect(chosen?.id).toBe("1");
  });

  it("matches email case-insensitively", () => {
    const chosen = decideGlobeMembership([inv("1", "A@X.com")], false, "a@x.com");
    expect(chosen?.id).toBe("1");
  });

  it("ignores invites addressed to a different email", () => {
    expect(decideGlobeMembership([inv("1", "b@x.com")], false, "a@x.com")).toBeNull();
  });

  it("picks the first matching invite when several exist", () => {
    const chosen = decideGlobeMembership(
      [inv("1", "a@x.com"), inv("2", "a@x.com")],
      false,
      "a@x.com",
    );
    expect(chosen?.id).toBe("1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/globe-invites.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/globe-invites.ts`**

```ts
/**
 * Globe invite acceptance — mirrors lib/invites.ts, but for the account-level
 * Globe aggregate. A user joins at most one Globe (ADR 0023), so acceptance
 * resolves to a single invite. If the user already has a Globe we defer (the
 * two-populated-globes merge is out of scope for v1).
 */

import { db } from "@/lib/db";
import { getUserGlobe } from "@/lib/globe";

export interface PendingGlobeInviteLike {
  id: string;
  globeId: string;
  email: string;
}

/**
 * Pure decision: which pending Globe invite (if any) to accept for this user.
 * Returns null if the user already belongs to a Globe or no invite matches.
 */
export function decideGlobeMembership(
  pending: readonly PendingGlobeInviteLike[],
  userAlreadyHasGlobe: boolean,
  userEmail: string,
): PendingGlobeInviteLike | null {
  if (userAlreadyHasGlobe) return null;
  const normal = userEmail.toLowerCase();
  return pending.find((i) => i.email.toLowerCase() === normal) ?? null;
}

/**
 * Find un-accepted Globe invites for this email and, if the user has no Globe
 * yet, add them to the invited Globe and mark the invite accepted. Best-effort
 * and idempotent — never throws (never blocks app load).
 */
export async function acceptPendingGlobeInvitesForUser(
  userId: string,
  email: string,
): Promise<void> {
  try {
    const normalEmail = email.toLowerCase();
    const pending = await db.globeInvite.findMany({
      where: { email: normalEmail, acceptedAt: null },
      select: { id: true, globeId: true, email: true },
    });
    if (pending.length === 0) return;

    const existing = await getUserGlobe(userId);
    const chosen = decideGlobeMembership(pending, existing !== null, normalEmail);
    if (!chosen) return;

    const now = new Date();
    try {
      await db.globeMember.create({
        data: { globeId: chosen.globeId, userId, role: "member" },
      });
    } catch (err) {
      // P2002 = the membership already exists (a race, or the unique userId
      // guard) — that's the end-state we want, so fall through to mark accepted.
      if (!isUniqueConstraintError(err)) {
        console.error(
          `acceptPendingGlobeInvitesForUser: failed to add member to globe ${chosen.globeId}`,
          err,
        );
        return;
      }
    }

    await db.globeInvite.update({ where: { id: chosen.id }, data: { acceptedAt: now } });
  } catch (err) {
    console.error("acceptPendingGlobeInvitesForUser failed", err);
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/globe-invites.test.ts`
Expected: PASS (5).

- [ ] **Step 5: Wire into the app-load reconciler**

In `app/(app)/layout.tsx`, add the import near the existing invites import:

```ts
import { acceptPendingGlobeInvitesForUser } from "@/lib/globe-invites";
```

Then, in the `if (email) { ... }` block that already calls `acceptPendingInvitesForUser`, add the Globe reconciler right after it:

```ts
  if (email) {
    await acceptPendingInvitesForUser(session.user.id, email);
    await acceptPendingGlobeInvitesForUser(session.user.id, email);
  }
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/globe-invites.ts lib/globe-invites.test.ts "app/(app)/layout.tsx"
git commit -m "feat(globe): reconcile globe invites on app load (ADR 0017 pattern)"
```

---

## Task 6: Globe server actions

**Files:**
- Create: `server/actions/globe.ts`
- Test: `server/actions/globe.test.ts`

**Interfaces:**
- Consumes: `requireGlobeAccess` from `@/lib/globe`; `requireUser` from `@/lib/guards`; `markerSchema`/`MarkerInput` from `@/lib/validations/marker`; `searchPlaces`/`reverseGeocode`/`GeoCandidate` from `@/lib/geocode`; `db`.
- Produces:
  - `type GlobeActionResult = { success: true } | { success: false; errors: Record<string, string[]> }`
  - `searchPlacesAction(query: string): Promise<GeoCandidate[]>`
  - `reverseGeocodeAction(lat: number, lng: number): Promise<GeoCandidate | null>`
  - `createMarker(input: MarkerInput): Promise<GlobeActionResult>`
  - `updateMarker(markerId: string, input: MarkerInput): Promise<GlobeActionResult>`
  - `deleteMarker(markerId: string): Promise<GlobeActionResult>`
  - `inviteToGlobe(email: string): Promise<GlobeActionResult>`

- [ ] **Step 1: Write the failing test**

Create `server/actions/globe.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/globe", () => ({
  requireGlobeAccess: vi.fn(async () => ({ user: { id: "u1" }, globe: { id: "g1" } })),
}));
vi.mock("@/lib/guards", () => ({ requireUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/lib/geocode", () => ({
  searchPlaces: vi.fn(),
  reverseGeocode: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    marker: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    globeInvite: { create: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { createMarker, updateMarker, deleteMarker, inviteToGlobe } from "./globe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbm = db as any;
beforeEach(() => vi.clearAllMocks());

describe("createMarker", () => {
  it("rejects an invalid marker without touching the db", async () => {
    const res = await createMarker({ title: "", category: "OTHER" });
    expect(res.success).toBe(false);
    expect(dbm.marker.create).not.toHaveBeenCalled();
  });

  it("creates a marker on the user's globe", async () => {
    dbm.marker.create.mockResolvedValue({ id: "m1" });
    const res = await createMarker({
      title: "Tokyo Tower",
      category: "SIGHTSEEING",
      lat: 35.6,
      lng: 139.7,
      city: "Tokyo",
      country: "Japan",
      countryCode: "jp",
    });
    expect(res.success).toBe(true);
    expect(dbm.marker.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ globeId: "g1", createdById: "u1", title: "Tokyo Tower" }),
      }),
    );
  });
});

describe("updateMarker", () => {
  it("404s (throws) when the marker is on another globe", async () => {
    dbm.marker.findUnique.mockResolvedValue({ id: "m1", globeId: "OTHER" });
    await expect(updateMarker("m1", { title: "X", category: "OTHER" })).rejects.toBeDefined();
    expect(dbm.marker.update).not.toHaveBeenCalled();
  });

  it("updates a marker on the user's globe", async () => {
    dbm.marker.findUnique.mockResolvedValue({ id: "m1", globeId: "g1" });
    dbm.marker.update.mockResolvedValue({ id: "m1" });
    const res = await updateMarker("m1", { title: "New", category: "FOOD" });
    expect(res.success).toBe(true);
    expect(dbm.marker.update).toHaveBeenCalled();
  });
});

describe("deleteMarker", () => {
  it("deletes a marker on the user's globe", async () => {
    dbm.marker.findUnique.mockResolvedValue({ id: "m1", globeId: "g1" });
    dbm.marker.delete.mockResolvedValue({ id: "m1" });
    const res = await deleteMarker("m1");
    expect(res.success).toBe(true);
    expect(dbm.marker.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
  });
});

describe("inviteToGlobe", () => {
  it("rejects an invalid email", async () => {
    const res = await inviteToGlobe("not-an-email");
    expect(res.success).toBe(false);
    expect(dbm.globeInvite.create).not.toHaveBeenCalled();
  });

  it("creates a pending invite on the user's globe (lowercased email)", async () => {
    dbm.globeInvite.create.mockResolvedValue({ id: "i1" });
    const res = await inviteToGlobe("Partner@Example.com");
    expect(res.success).toBe(true);
    expect(dbm.globeInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ globeId: "g1", email: "partner@example.com" }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/actions/globe.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/actions/globe.ts`**

```ts
"use server";

import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireGlobeAccess } from "@/lib/globe";
import { markerSchema, type MarkerInput } from "@/lib/validations/marker";
import { searchPlaces, reverseGeocode, type GeoCandidate } from "@/lib/geocode";

export type GlobeActionResult =
  | { success: true }
  | { success: false; errors: Record<string, string[]> };

function validationErrors(error: {
  flatten(): { fieldErrors: Record<string, string[] | undefined> };
}): GlobeActionResult {
  const fieldErrors: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(error.flatten().fieldErrors)) fieldErrors[k] = v ?? [];
  return { success: false, errors: fieldErrors };
}

/** Verify a marker exists and belongs to the current user's globe. */
async function requireMarkerOnGlobe(markerId: string, globeId: string) {
  const marker = await db.marker.findUnique({
    where: { id: markerId },
    select: { id: true, globeId: true },
  });
  if (!marker || marker.globeId !== globeId) notFound();
  return marker;
}

/** Map validated MarkerOutput fields to the db columns (create + update share). */
function markerData(parsed: {
  title: string;
  category: string;
  note?: string;
  link?: string;
  timing?: string;
  lat?: number;
  lng?: number;
  city?: string;
  country?: string;
  countryCode?: string;
}) {
  return {
    title: parsed.title,
    category: parsed.category,
    note: parsed.note ?? null,
    link: parsed.link ?? null,
    timing: parsed.timing ?? null,
    lat: parsed.lat ?? null,
    lng: parsed.lng ?? null,
    city: parsed.city ?? null,
    country: parsed.country ?? null,
    countryCode: parsed.countryCode ?? null,
  };
}

// --- Geocoding proxies (server-side so Nominatim gets our User-Agent) --------

export async function searchPlacesAction(query: string): Promise<GeoCandidate[]> {
  await requireGlobeAccess(); // access-gate; also lazily creates the globe
  return searchPlaces(query);
}

export async function reverseGeocodeAction(
  lat: number,
  lng: number,
): Promise<GeoCandidate | null> {
  await requireGlobeAccess();
  return reverseGeocode(lat, lng);
}

// --- Marker CRUD -------------------------------------------------------------

export async function createMarker(input: MarkerInput): Promise<GlobeActionResult> {
  const { user, globe } = await requireGlobeAccess();
  const parsed = markerSchema.safeParse(input);
  if (!parsed.success) return validationErrors(parsed.error);

  await db.marker.create({
    data: { ...markerData(parsed.data), globeId: globe.id, createdById: user.id },
  });
  revalidatePath("/globe");
  return { success: true };
}

export async function updateMarker(
  markerId: string,
  input: MarkerInput,
): Promise<GlobeActionResult> {
  const { globe } = await requireGlobeAccess();
  await requireMarkerOnGlobe(markerId, globe.id);
  const parsed = markerSchema.safeParse(input);
  if (!parsed.success) return validationErrors(parsed.error);

  await db.marker.update({ where: { id: markerId }, data: markerData(parsed.data) });
  revalidatePath("/globe");
  return { success: true };
}

export async function deleteMarker(markerId: string): Promise<GlobeActionResult> {
  const { globe } = await requireGlobeAccess();
  await requireMarkerOnGlobe(markerId, globe.id);
  await db.marker.delete({ where: { id: markerId } });
  revalidatePath("/globe");
  return { success: true };
}

// --- Invite ------------------------------------------------------------------

const inviteEmailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

export async function inviteToGlobe(email: string): Promise<GlobeActionResult> {
  const { globe } = await requireGlobeAccess();
  const parsed = inviteEmailSchema.safeParse(email);
  if (!parsed.success) return validationErrors(parsed.error);

  try {
    await db.globeInvite.create({
      data: { globeId: globe.id, email: parsed.data, token: randomUUID(), role: "member" },
    });
  } catch (err) {
    // Already invited (unique [globeId, email]) — treat as success (idempotent).
    if (isUniqueConstraintError(err)) return { success: true };
    throw err;
  }
  revalidatePath("/globe");
  return { success: true };
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
```

> Note: Zod v4 keeps `.email()` on strings. If a lint/type error flags it, use `z.email()` (top-level) — both exist in v4; match whatever `lib/validations/*.ts` already use.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/actions/globe.test.ts`
Expected: PASS (7).

- [ ] **Step 5: Commit**

```bash
git add server/actions/globe.ts server/actions/globe.test.ts
git commit -m "feat(globe): add marker CRUD + geocode proxy + invite server actions"
```

---

## Task 7: List helpers + shared view types

**Files:**
- Create: `components/globe/types.ts`
- Create: `lib/globe-list.ts`
- Test: `lib/globe-list.test.ts`

**Interfaces:**
- Produces (`components/globe/types.ts`):
  - `interface MarkerView { id: string; title: string; category: string; note: string | null; link: string | null; timing: string | null; lat: number | null; lng: number | null; city: string | null; country: string | null; countryCode: string | null }`
  - `interface GlobeMemberView { userId: string; name: string | null; email: string | null; role: string }`
- Produces (`lib/globe-list.ts`):
  - `interface MarkerFilter { category: string | null; country: string | null; query: string }`
  - `filterMarkers(markers: MarkerView[], filter: MarkerFilter): MarkerView[]`
  - `groupMarkersByCountry(markers: MarkerView[]): Array<{ country: string; markers: MarkerView[] }>` — sorted alphabetically; unresolved country grouped last under `"Unpinned"`.
  - `distinctCountries(markers: MarkerView[]): string[]` — sorted, excludes null.

- [ ] **Step 1: Write the failing test**

Create `lib/globe-list.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterMarkers, groupMarkersByCountry, distinctCountries } from "./globe-list";
import type { MarkerView } from "@/components/globe/types";

const m = (over: Partial<MarkerView>): MarkerView => ({
  id: "x",
  title: "X",
  category: "OTHER",
  note: null,
  link: null,
  timing: null,
  lat: 0,
  lng: 0,
  city: null,
  country: null,
  countryCode: null,
  ...over,
});

const markers: MarkerView[] = [
  m({ id: "1", title: "Tokyo Tower", category: "SIGHTSEEING", country: "Japan", city: "Tokyo" }),
  m({ id: "2", title: "Ramen bar", category: "FOOD", country: "Japan", city: "Osaka" }),
  m({ id: "3", title: "Eiffel Tower", category: "SIGHTSEEING", country: "France", city: "Paris" }),
  m({ id: "4", title: "Someday place", category: "OTHER", country: null }),
];

describe("filterMarkers", () => {
  it("filters by category", () => {
    const r = filterMarkers(markers, { category: "FOOD", country: null, query: "" });
    expect(r.map((x) => x.id)).toEqual(["2"]);
  });
  it("filters by country", () => {
    const r = filterMarkers(markers, { category: null, country: "France", query: "" });
    expect(r.map((x) => x.id)).toEqual(["3"]);
  });
  it("filters by case-insensitive text across title/city/country", () => {
    expect(filterMarkers(markers, { category: null, country: null, query: "paris" }).map((x) => x.id)).toEqual(["3"]);
    expect(filterMarkers(markers, { category: null, country: null, query: "osaka" }).map((x) => x.id)).toEqual(["2"]);
  });
  it("returns all when filter is empty", () => {
    expect(filterMarkers(markers, { category: null, country: null, query: "" })).toHaveLength(4);
  });
});

describe("groupMarkersByCountry", () => {
  it("groups alphabetically with unresolved last as 'Unpinned'", () => {
    const groups = groupMarkersByCountry(markers);
    expect(groups.map((g) => g.country)).toEqual(["France", "Japan", "Unpinned"]);
    expect(groups[1].markers.map((x) => x.id)).toEqual(["1", "2"]);
  });
});

describe("distinctCountries", () => {
  it("returns sorted unique non-null countries", () => {
    expect(distinctCountries(markers)).toEqual(["France", "Japan"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/globe-list.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create the types and helpers**

Create `components/globe/types.ts`:

```ts
/** A Marker as rendered by the Globe UI (subset of the Prisma Marker row). */
export interface MarkerView {
  id: string;
  title: string;
  category: string;
  note: string | null;
  link: string | null;
  timing: string | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
}

/** A Globe member for the sharing UI. */
export interface GlobeMemberView {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
}
```

Create `lib/globe-list.ts`:

```ts
import type { MarkerView } from "@/components/globe/types";

export interface MarkerFilter {
  category: string | null;
  country: string | null;
  query: string;
}

const UNPINNED = "Unpinned";

/** Apply category + country + free-text filters (all optional / ANDed). */
export function filterMarkers(markers: MarkerView[], filter: MarkerFilter): MarkerView[] {
  const q = filter.query.trim().toLowerCase();
  return markers.filter((mk) => {
    if (filter.category && mk.category !== filter.category) return false;
    if (filter.country && mk.country !== filter.country) return false;
    if (q) {
      const hay = [mk.title, mk.city, mk.country].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Group by country A→Z; markers with no country fall under "Unpinned", last. */
export function groupMarkersByCountry(
  markers: MarkerView[],
): Array<{ country: string; markers: MarkerView[] }> {
  const byCountry = new Map<string, MarkerView[]>();
  for (const mk of markers) {
    const key = mk.country ?? UNPINNED;
    const arr = byCountry.get(key) ?? [];
    arr.push(mk);
    byCountry.set(key, arr);
  }
  return [...byCountry.entries()]
    .sort(([a], [b]) => {
      if (a === UNPINNED) return 1;
      if (b === UNPINNED) return -1;
      return a.localeCompare(b);
    })
    .map(([country, list]) => ({ country, markers: list }));
}

/** Sorted, unique, non-null country names (for the country filter dropdown). */
export function distinctCountries(markers: MarkerView[]): string[] {
  return [...new Set(markers.map((m) => m.country).filter((c): c is string => c !== null))].sort(
    (a, b) => a.localeCompare(b),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/globe-list.test.ts`
Expected: PASS (6).

- [ ] **Step 5: Commit**

```bash
git add components/globe/types.ts lib/globe-list.ts lib/globe-list.test.ts
git commit -m "feat(globe): add marker view types + list filter/group helpers"
```

---

## Task 8: Leaflet globe map component

**Files:**
- Create: `components/globe/globe-map.tsx`
- Create: `components/globe/globe-map-loader.tsx`

**Interfaces:**
- Consumes: `MarkerView` from `@/components/globe/types`.
- Produces:
  - `interface GlobeMapProps { markers: MarkerView[]; onSelect: (id: string) => void; onMapClick: (lat: number, lng: number) => void }`
  - `GlobeMap(props: GlobeMapProps)` (client-only)
  - `GlobeMapLoader(props: GlobeMapProps)` (dynamic `ssr:false` wrapper)

This generalises `components/trip/wishlist-map.tsx`: same category-colour `divIcon`, click-a-pin → `onSelect`; **new**: default world view when there are no located markers, and a `map.on("click")` handler → `onMapClick(lat, lng)` for drop-a-pin. There is no unit test (DOM/Leaflet-heavy, matching the existing `wishlist-map.tsx` which has none) — verification is typecheck + manual.

- [ ] **Step 1: Create `components/globe/globe-map.tsx`**

```tsx
"use client";

/**
 * Leaflet world map for the Globe. Generalises components/trip/wishlist-map.tsx:
 *   - category-coloured divIcon marker per located Marker
 *   - click a pin  -> onSelect(id)
 *   - click the map -> onMapClick(lat, lng)  (drop-a-pin add flow)
 *   - fits bounds to located markers, or shows a whole-world view when none.
 * Client-only; loaded via GlobeMapLoader (ssr:false). See ADR 0024.
 */

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { MarkerView } from "@/components/globe/types";

export interface GlobeMapProps {
  markers: MarkerView[];
  onSelect: (id: string) => void;
  onMapClick: (lat: number, lng: number) => void;
}

const CATEGORY_HEX: Record<string, string> = {
  SIGHTSEEING: "#0ea5e9",
  FOOD: "#f59e0b",
  ACTIVITY: "#10b981",
  NIGHTLIFE: "#8b5cf6",
  SHOPPING: "#f43f5e",
  OTHER: "#78716c",
};
const pinHex = (c: string) => CATEGORY_HEX[c] ?? CATEGORY_HEX.OTHER;

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function categoryIcon(L: typeof import("leaflet"), category: string): import("leaflet").DivIcon {
  const hex = pinHex(category);
  return L.divIcon({
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${hex};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">●</div>`,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

export function GlobeMap({ markers, onSelect, onMapClick }: GlobeMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);
  // Keep latest callbacks without re-initialising the map.
  const onSelectRef = useRef(onSelect);
  const onMapClickRef = useRef(onMapClick);
  onSelectRef.current = onSelect;
  onMapClickRef.current = onMapClick;

  const located = markers.filter(
    (m): m is MarkerView & { lat: number; lng: number } => m.lat != null && m.lng != null,
  );

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    import("leaflet").then((leaflet) => {
      const L = leaflet.default ?? leaflet;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "/leaflet/marker-icon-2x.png",
        iconUrl: "/leaflet/marker-icon.png",
        shadowUrl: "/leaflet/marker-shadow.png",
      });
      if (!mapRef.current) return;

      const map = L.map(mapRef.current, { zoomControl: true, worldCopyJump: true });
      leafletMapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        onMapClickRef.current(e.latlng.lat, e.latlng.lng);
      });

      if (located.length > 0) {
        map.fitBounds(L.latLngBounds(located.map((m) => [m.lat, m.lng] as [number, number])), {
          padding: [40, 40],
          maxZoom: 8,
        });
      } else {
        map.setView([20, 0], 2); // whole-world view
      }
    });

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers whenever the located set changes.
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    import("leaflet").then((leaflet) => {
      const L = leaflet.default ?? leaflet;
      // Clear existing markers (layer group kept on the map instance).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any)._globeMarkers?.forEach((mk: import("leaflet").Marker) => mk.remove());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any)._globeMarkers = [];
      for (const mk of located) {
        const marker = L.marker([mk.lat, mk.lng], { icon: categoryIcon(L, mk.category) })
          .addTo(map)
          .bindPopup(
            `<div style="min-width:min(140px,80vw);max-width:min(240px,90vw);line-height:1.5"><strong style="font-size:13px">${escapeHtml(
              mk.title,
            )}</strong></div>`,
          );
        marker.on("click", () => onSelectRef.current(mk.id));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any)._globeMarkers.push(marker);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located.map((m) => `${m.id}:${m.lat},${m.lng}:${m.category}`).join("|")]);

  return (
    <div
      ref={mapRef}
      style={{ height: 440 }}
      className="w-full rounded-2xl overflow-hidden border border-border shadow-sm"
      aria-label="Globe map"
    />
  );
}
```

- [ ] **Step 2: Create `components/globe/globe-map-loader.tsx`**

```tsx
"use client";

/** Client boundary that dynamically loads the Leaflet GlobeMap (ssr:false). */

import dynamic from "next/dynamic";
import type { GlobeMapProps } from "./globe-map";

const Inner = dynamic(() => import("./globe-map").then((m) => m.GlobeMap), { ssr: false });

export function GlobeMapLoader(props: GlobeMapProps) {
  return <Inner {...props} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/globe/globe-map.tsx components/globe/globe-map-loader.tsx
git commit -m "feat(globe): add Leaflet globe map with pin-select + click-to-drop (ADR 0024)"
```

---

## Task 9: Marker form dialog (add / edit / delete + place search)

**Files:**
- Create: `components/globe/marker-form.tsx`

**Interfaces:**
- Consumes: `createMarker`, `updateMarker`, `deleteMarker`, `searchPlacesAction` from `@/server/actions/globe`; `GeoCandidate` from `@/lib/geocode`; `MarkerView` from `@/components/globe/types`; `CATEGORIES` from `@/lib/categories`; existing UI primitives in `components/ui/*` (`Dialog`, `Button`, `Input`, etc. — match how `components/trip/*` import them).
- Produces:
  - `interface MarkerFormProps { open: boolean; onOpenChange: (open: boolean) => void; marker?: MarkerView | null; prefill?: { lat: number; lng: number } | null; onSaved: () => void }`
  - `MarkerForm(props: MarkerFormProps)` — one dialog serving add (no `marker`) and edit (with `marker`). When `prefill` is set (from a map click), it pre-resolves the place via `reverseGeocodeAction` on open.

Study `components/trip/wishlist-board.tsx` and the item add/edit dialog it uses for the house dialog + `useTransition` + server-action-result pattern; mirror those primitives and error display. Keep the component under ~200 lines.

- [ ] **Step 1: Implement the form**

Create `components/globe/marker-form.tsx`. Requirements the implementation MUST satisfy (use the codebase's existing `Dialog`/`Button`/`Input`/`Label`/`Select`/`Textarea` primitives — confirm exact import paths from a sibling in `components/trip/`):

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { CATEGORIES } from "@/lib/categories";
import {
  createMarker,
  updateMarker,
  deleteMarker,
  searchPlacesAction,
} from "@/server/actions/globe";
import type { GeoCandidate } from "@/lib/geocode";
import type { MarkerView } from "@/components/globe/types";
// Import Dialog/Button/Input/Label/Textarea/Select from components/ui/* to match
// the paths used in components/trip/wishlist-board.tsx.

export interface MarkerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marker?: MarkerView | null;
  prefill?: { lat: number; lng: number } | null;
  onSaved: () => void;
}

interface ResolvedPlace {
  lat: number | null;
  lng: number | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
}

export function MarkerForm({ open, onOpenChange, marker, prefill, onSaved }: MarkerFormProps) {
  const isEdit = !!marker;
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("SIGHTSEEING");
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [timing, setTiming] = useState("");
  const [place, setPlace] = useState<ResolvedPlace | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<GeoCandidate[]>([]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  // Reset the form each time the dialog opens, seeding from marker/prefill.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setCandidates([]);
    if (marker) {
      setTitle(marker.title);
      setCategory(marker.category);
      setNote(marker.note ?? "");
      setLink(marker.link ?? "");
      setTiming(marker.timing ?? "");
      setPlace({
        lat: marker.lat,
        lng: marker.lng,
        city: marker.city,
        country: marker.country,
        countryCode: marker.countryCode,
      });
      setQuery(marker.title);
    } else {
      setTitle("");
      setCategory("SIGHTSEEING");
      setNote("");
      setLink("");
      setTiming("");
      setQuery("");
      setPlace(prefill ? { lat: prefill.lat, lng: prefill.lng, city: null, country: null, countryCode: null } : null);
      // If dropped via map click, resolve the place name in the background.
      if (prefill) {
        void import("@/server/actions/globe").then(({ reverseGeocodeAction }) =>
          reverseGeocodeAction(prefill.lat, prefill.lng).then((c) => {
            if (!c) return;
            setTitle((t) => t || c.name.split(",")[0]);
            setQuery((q) => q || c.name);
            setPlace({ lat: c.lat, lng: c.lng, city: c.city, country: c.country, countryCode: c.countryCode });
          }),
        );
      }
    }
  }, [open, marker, prefill]);

  const runSearch = () => {
    const q = query.trim();
    if (!q) return;
    startTransition(async () => {
      setCandidates(await searchPlacesAction(q));
    });
  };

  const chooseCandidate = (c: GeoCandidate) => {
    setTitle((t) => t || c.name.split(",")[0]);
    setPlace({ lat: c.lat, lng: c.lng, city: c.city, country: c.country, countryCode: c.countryCode });
    setCandidates([]);
  };

  const submit = () => {
    const input = {
      title,
      category,
      note,
      link,
      timing,
      lat: place?.lat ?? undefined,
      lng: place?.lng ?? undefined,
      city: place?.city ?? undefined,
      country: place?.country ?? undefined,
      countryCode: place?.countryCode ?? undefined,
    };
    startTransition(async () => {
      const res = isEdit ? await updateMarker(marker!.id, input) : await createMarker(input);
      if (res.success) {
        onOpenChange(false);
        onSaved();
      } else {
        setErrors(res.errors);
      }
    });
  };

  const remove = () => {
    if (!marker) return;
    startTransition(async () => {
      const res = await deleteMarker(marker.id);
      if (res.success) {
        onOpenChange(false);
        onSaved();
      }
    });
  };

  // Render a Dialog with:
  //  - a place search row (Input bound to query + a "Search" button calling runSearch),
  //    a candidate list rendering c.name with an onClick={() => chooseCandidate(c)},
  //    and a small resolved-location caption ("Tokyo, Japan" from `place`).
  //  - Title (Input), Category (Select over CATEGORIES), When/timing (Input),
  //    Link (Input), Note (Textarea), each showing errors[field]?.join(", ").
  //  - Footer: Delete (only when isEdit) + Cancel + Save; disable while `pending`.
  // Use the same Dialog/Button/Input/Label/Select/Textarea primitives as
  // components/trip/wishlist-board.tsx. Keep markup minimal and accessible.
  return null; // replace with the Dialog JSX described above
}
```

The `return null` is a scaffold marker — the implementer MUST replace it with the Dialog JSX per the comment (search row, fields, footer). Follow the exact primitive imports and styling from `components/trip/wishlist-board.tsx`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke (dev server)**

Run: `npm run dev`, open `/globe`, add a marker via search ("Tokyo Tower"), confirm it resolves to Tokyo, Japan and saves. (Deferred to Task 11 once the page exists — if the page isn't wired yet, skip and rely on typecheck here.)

- [ ] **Step 4: Commit**

```bash
git add components/globe/marker-form.tsx
git commit -m "feat(globe): add marker add/edit/delete dialog with place search"
```

---

## Task 10: Marker list + filters components

**Files:**
- Create: `components/globe/marker-filters.tsx`
- Create: `components/globe/marker-list.tsx`

**Interfaces:**
- Consumes: `MarkerView` from `@/components/globe/types`; `MarkerFilter`, `groupMarkersByCountry`, `distinctCountries` from `@/lib/globe-list`; `CATEGORIES`, `categoryLabel` from `@/lib/categories`.
- Produces:
  - `interface MarkerFiltersProps { filter: MarkerFilter; countries: string[]; onChange: (f: MarkerFilter) => void }` + `MarkerFilters(props)`
  - `interface MarkerListProps { markers: MarkerView[]; onSelect: (id: string) => void }` + `MarkerList(props)` — renders `groupMarkersByCountry` output as country sections with clickable rows; shows a category colour dot + title + city + optional "when".

Both are presentational; the parent (`globe-view`) owns filter state and passes already-filtered markers to `MarkerList`. `MarkerFilters` gets the full `countries` list so options don't disappear as filters narrow.

- [ ] **Step 1: Implement `components/globe/marker-filters.tsx`**

```tsx
"use client";

import { CATEGORIES } from "@/lib/categories";
import type { MarkerFilter } from "@/lib/globe-list";
// Import Input/Select from components/ui/* matching sibling components.

export interface MarkerFiltersProps {
  filter: MarkerFilter;
  countries: string[];
  onChange: (f: MarkerFilter) => void;
}

export function MarkerFilters({ filter, countries, onChange }: MarkerFiltersProps) {
  // Render: a text Input (query), a category <select> (All + CATEGORIES),
  // a country <select> (All + countries). Each control calls
  // onChange({ ...filter, <field>: value || null }). "" => null for selects.
  // Lay out in a responsive flex row (wrap on mobile). Keep it compact.
  return null; // replace with the controls described above
}
```

- [ ] **Step 2: Implement `components/globe/marker-list.tsx`**

```tsx
"use client";

import { groupMarkersByCountry } from "@/lib/globe-list";
import { categoryLabel } from "@/lib/categories";
import type { MarkerView } from "@/components/globe/types";

const CATEGORY_HEX: Record<string, string> = {
  SIGHTSEEING: "#0ea5e9",
  FOOD: "#f59e0b",
  ACTIVITY: "#10b981",
  NIGHTLIFE: "#8b5cf6",
  SHOPPING: "#f43f5e",
  OTHER: "#78716c",
};

export interface MarkerListProps {
  markers: MarkerView[];
  onSelect: (id: string) => void;
}

export function MarkerList({ markers, onSelect }: MarkerListProps) {
  const groups = groupMarkersByCountry(markers);
  if (markers.length === 0) {
    return <p className="text-sm text-muted-foreground">No markers yet.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.country}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.country}
          </h3>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {group.markers.map((mk) => (
              <li key={mk.id}>
                <button
                  type="button"
                  onClick={() => onSelect(mk.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
                >
                  <span
                    aria-hidden
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ background: CATEGORY_HEX[mk.category] ?? CATEGORY_HEX.OTHER }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {mk.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[mk.city, categoryLabel(mk.category as never), mk.timing]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

> If `categoryLabel`'s parameter type rejects a plain string, cast via the codebase's existing helper usage; match how `components/trip/item-card.tsx` calls it.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/globe/marker-filters.tsx components/globe/marker-list.tsx
git commit -m "feat(globe): add marker list (grouped by country) + filters"
```

---

## Task 11: Globe page + view orchestrator + invite button

**Files:**
- Create: `app/(app)/globe/page.tsx`
- Create: `components/globe/globe-view.tsx`
- Create: `components/globe/globe-invite-button.tsx`

**Interfaces:**
- Consumes: `requireGlobeAccess` from `@/lib/globe`; `db`; `MarkerView`/`GlobeMemberView` from `@/components/globe/types`; `GlobeMapLoader`, `MarkerList`, `MarkerFilters`, `MarkerForm`, `inviteToGlobe`.
- Produces:
  - `app/(app)/globe/page.tsx` — default export server component.
  - `interface GlobeViewProps { markers: MarkerView[]; members: GlobeMemberView[] }` + `GlobeView(props)` (client).
  - `interface GlobeInviteButtonProps { members: GlobeMemberView[] }` + `GlobeInviteButton(props)` (client).

- [ ] **Step 1: Create the page (server component)**

Create `app/(app)/globe/page.tsx`:

```tsx
import type { Metadata } from "next";
import { requireGlobeAccess } from "@/lib/globe";
import { db } from "@/lib/db";
import { getDiscreetState } from "@/lib/discreet-server";
import { GlobeView } from "@/components/globe/globe-view";
import type { MarkerView, GlobeMemberView } from "@/components/globe/types";

export async function generateMetadata(): Promise<Metadata> {
  const { discreet, label } = await getDiscreetState();
  return { title: discreet ? label : "Globe · TEEPEE" };
}

export default async function GlobePage() {
  const { globe } = await requireGlobeAccess();

  const [markersRaw, membersRaw] = await Promise.all([
    db.marker.findMany({
      where: { globeId: globe.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, title: true, category: true, note: true, link: true, timing: true,
        lat: true, lng: true, city: true, country: true, countryCode: true,
      },
    }),
    db.globeMember.findMany({
      where: { globeId: globe.id },
      select: { userId: true, role: true, user: { select: { name: true, email: true } } },
    }),
  ]);

  const markers: MarkerView[] = markersRaw;
  const members: GlobeMemberView[] = membersRaw.map((m) => ({
    userId: m.userId,
    role: m.role,
    name: m.user.name,
    email: m.user.email,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Globe</h1>
      </div>
      <GlobeView markers={markers} members={members} />
    </div>
  );
}
```

- [ ] **Step 2: Create the view orchestrator (client)**

Create `components/globe/globe-view.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GlobeMapLoader } from "./globe-map-loader";
import { MarkerList } from "./marker-list";
import { MarkerFilters } from "./marker-filters";
import { MarkerForm } from "./marker-form";
import { GlobeInviteButton } from "./globe-invite-button";
import { filterMarkers, distinctCountries, type MarkerFilter } from "@/lib/globe-list";
import type { MarkerView, GlobeMemberView } from "./types";
// Import Button from components/ui/button.

export interface GlobeViewProps {
  markers: MarkerView[];
  members: GlobeMemberView[];
}

export function GlobeView({ markers, members }: GlobeViewProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<MarkerFilter>({ category: null, country: null, query: "" });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MarkerView | null>(null);
  const [prefill, setPrefill] = useState<{ lat: number; lng: number } | null>(null);

  const filtered = useMemo(() => filterMarkers(markers, filter), [markers, filter]);
  const countries = useMemo(() => distinctCountries(markers), [markers]);
  const byId = useMemo(() => new Map(markers.map((m) => [m.id, m])), [markers]);

  const openAdd = () => { setEditing(null); setPrefill(null); setFormOpen(true); };
  const openEdit = (id: string) => { setEditing(byId.get(id) ?? null); setPrefill(null); setFormOpen(true); };
  const openDrop = (lat: number, lng: number) => { setEditing(null); setPrefill({ lat, lng }); setFormOpen(true); };
  const onSaved = () => router.refresh();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Everywhere you want to go. Tap the map to drop a marker, or search to add one.
        </p>
        <div className="flex items-center gap-2">
          <GlobeInviteButton members={members} />
          {/* Button: onClick={openAdd} -> "Add marker" */}
        </div>
      </div>

      <GlobeMapLoader markers={filtered} onSelect={openEdit} onMapClick={openDrop} />

      <MarkerFilters filter={filter} countries={countries} onChange={setFilter} />
      <MarkerList markers={filtered} onSelect={openEdit} />

      <MarkerForm
        open={formOpen}
        onOpenChange={setFormOpen}
        marker={editing}
        prefill={prefill}
        onSaved={onSaved}
      />
    </div>
  );
}
```

(Add the "Add marker" `Button` where the comment indicates, using the codebase's `Button` primitive.)

- [ ] **Step 3: Create the invite button (client)**

Create `components/globe/globe-invite-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { inviteToGlobe } from "@/server/actions/globe";
import type { GlobeMemberView } from "./types";
// Import Dialog/Button/Input from components/ui/*.

export interface GlobeInviteButtonProps {
  members: GlobeMemberView[];
}

export function GlobeInviteButton({ members }: GlobeInviteButtonProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await inviteToGlobe(email);
      if (res.success) { setDone(true); setEmail(""); }
      else setError(res.errors.email?.join(", ") ?? "Could not send invite");
    });
  };

  // Render a Button ("Share") that opens a Dialog listing current `members`
  // (name/email + role) and, if fewer than 2 members, an email Input + "Invite"
  // button calling submit(). Show `error` and a "Invited — they'll join when
  // they next sign in" confirmation when `done`. Use components/ui primitives.
  return null; // replace with the Dialog described above
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint app/\(app\)/globe components/globe`
Expected: no errors.

- [ ] **Step 5: Manual smoke**

Run: `npm run dev`, sign in, open `/globe`. Verify: empty world map; "Add marker" → search "Eiffel Tower" → resolves Paris, France → saves → pin appears + list shows it under France; click a pin → edit dialog; tap empty map → drop dialog with reverse-geocoded name; filters narrow the list; "Share" opens the invite dialog.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/globe" components/globe/globe-view.tsx components/globe/globe-invite-button.tsx
git commit -m "feat(globe): add /globe page, view orchestrator, and invite dialog"
```

---

## Task 12: Navigation — top-bar link + command palette

**Files:**
- Modify: `app/(app)/layout.tsx` (top-bar link)
- Modify: `components/command-palette.tsx` (global command)
- Test: `components/command-palette.test.tsx` (assert the Globe command exists)

**Interfaces:**
- Consumes: existing nav markup + command list.

- [ ] **Step 1: Add a Globe link to the top bar**

In `app/(app)/layout.tsx`, inside the right-hand controls `div` (before `<ThemeToggle />`), add a link (hidden in discreet mode, matching how other chrome respects `discreet`):

```tsx
{!discreet && (
  <Link
    href="/globe"
    className="rounded-md px-2 py-1 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
  >
    Globe
  </Link>
)}
```

(`Link` is already imported in this file.)

- [ ] **Step 2: Write the failing command-palette test**

Add to `components/command-palette.test.tsx` a test asserting a global "Globe" command routes to `/globe`. Match the existing test style in that file (it already inspects command labels/hrefs). Example shape:

```tsx
it("offers a global Globe command", async () => {
  // render the palette as the existing tests do, then:
  expect(screen.getByText("Globe")).toBeInTheDocument();
});
```

Adapt to the file's actual render/query helpers (see the existing `label: "Paris"` / `href` test around line 142).

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run components/command-palette.test.tsx`
Expected: FAIL — no "Globe" command yet.

- [ ] **Step 4: Add the command**

In `components/command-palette.tsx`, add a global navigation entry that is always available (not trip-scoped). Near the global `DoCmd` list (around line 235, where `"New trip"` lives) add:

```tsx
{ label: "Globe", onActivate: () => go("/globe") },
```

If the palette separates page-links from actions, instead add `{ label: "Globe", href: "/globe" }` to the global links list — match the existing structure.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run components/command-palette.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/layout.tsx" components/command-palette.tsx components/command-palette.test.tsx
git commit -m "feat(globe): add Globe to top-bar nav + command palette"
```

---

## Task 13: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: all tests pass (including the new globe/marker/geocode suites).

- [ ] **Step 2: Lint + typecheck**

Run: `npx eslint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds; `/globe` appears in the route list.

- [ ] **Step 4: Manual end-to-end pass**

With `npm run dev`: add markers by search and by map-click; edit; delete; filter by category/country/text; confirm list groups by country with unresolved under "Unpinned"; open the Share dialog and send an invite; confirm the top-bar + command-palette entries navigate to `/globe`.

- [ ] **Step 5: Final commit (if any residual changes)**

```bash
git add -A
git commit -m "chore(globe): verification pass — tests, lint, build green" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
| --- | --- |
| One shared Globe aggregate + membership (ADR 0023) | 1, 4 |
| At most one Globe per user (DB-enforced) | 1 (`@@unique([userId])`), 4 |
| Lazy creation on first visit; born-once-then-joined | 4, 11 |
| Email-match invite reconciliation (ADR 0017) | 5 |
| Marker = name + category + note + link + rough "when" | 1, 2 |
| Auto-derived lat/lng/city/country/countryCode | 3, 6, 9 |
| Search-to-add + confirm candidate | 6 (`searchPlacesAction`), 9 |
| Click-map-to-drop + reverse geocode | 6 (`reverseGeocodeAction`), 8, 9 |
| Marker saves even with no resolvable location | 2 (optional loc), 6 |
| Either member can add/edit/remove | 6 (globe-scoped access), 9 |
| Leaflet flat map, reuse wishlist-map pattern (ADR 0024) | 8 |
| List grouped by country + category/country/text filters | 7, 10 |
| Top-level `/globe` route, peer of `/trips` | 11 |
| Nav: top bar + command palette | 12 |
| Reuse existing categories | 2, 9, 10 (from `lib/categories.ts`) |
| Trip pull + auto-overlap | **Deferred to v1.1 — intentionally not in this plan** |

**2. Placeholder scan:** The only intentional scaffolds are the `return null` markers in Tasks 9, 10 (filters), and 11 (invite button), each paired with an explicit spec of the JSX to write and a named sibling component to mirror (`components/trip/wishlist-board.tsx`, `item-card.tsx`). These are UI-shell tasks where reproducing 150 lines of the codebase's bespoke Radix primitives verbatim would be guesswork; the implementer has the exact behaviour, props, and pattern source. All logic tasks (1–8, 12) contain complete code.

**3. Type consistency:** `MarkerView` (11 fields) is defined once in `components/globe/types.ts` (Task 7) and consumed unchanged by Tasks 8–11 and the page's `select`. `GeoCandidate` (Task 3) flows through `searchPlacesAction`/`reverseGeocodeAction` (Task 6) into `marker-form` (Task 9). `MarkerInput` (Task 2) is the argument type for `createMarker`/`updateMarker` (Task 6) and what `marker-form` builds. `GlobeActionResult` shape is identical across all actions. `MarkerFilter` is defined in `lib/globe-list.ts` (Task 7) and used by `marker-filters` + `globe-view`. Method names (`getOrCreateUserGlobe`, `requireGlobeAccess`, `filterMarkers`, `groupMarkersByCountry`, `distinctCountries`) are used consistently.
