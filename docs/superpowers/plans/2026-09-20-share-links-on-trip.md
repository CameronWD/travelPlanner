# Share Links, Ready for the Trip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Trip holds many labelled, scoped Share links (per-audience), and the public share page becomes phase-aware — leading with a today card (day number, local time, weather, today's plan) while the Trip is Travelling.

**Architecture:** Drop the one-link-per-trip unique constraint on `ShareLink`; add a required `label` and three scope booleans (dials). Server actions become per-link CRUD returning the unified `ActionResult`. The public page (`app/share/[token]/page.tsx`) gates its Prisma queries by the link's dials (data the scope hides is never fetched), computes the Trip's Phase with the existing engine (`lib/trip-phase.ts`, `lib/tz.ts`), and renders a new `ShareTodayCard` server component while Travelling. Settings' single toggle becomes a list-of-links panel.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Prisma 7 / Postgres, Vitest + Testing Library (colocated `*.test.ts[x]`), Tailwind.

## Global Constraints

- **Branch:** all work on `feat/share-on-trip`. NEVER commit to `main`, never merge, never deploy (no `vercel` commands). These come from the operator's standing instructions.
- **DANGER — production database:** `.env.production.local` in this repo points at the **production** Neon Postgres. NEVER run `prisma migrate dev`, `prisma migrate deploy`, `prisma db push`, or `prisma migrate reset`. Author migration SQL **by hand** (the repo's established pattern — see `prisma/migrations/20260916000000_digest_and_alarms/`). `npx prisma generate` and `npx prisma validate` are safe (no DB connection).
- **Never-shared floor (spec):** money/costs/budget, Notes, confirmation numbers, booking references, Journal, Checklists, Attachments, Wishlist, and Forks are NEVER exposed on any share link, regardless of dials. No new query in `app/share/` may select those fields. Every share query keeps `forkId: null`.
- **Migration grandfathering (spec):** every existing `ShareLink` row must come out labelled exactly `'Shared link'` with all three dials `true` and its `token` unchanged.
- **Naming:** the third dial is `includeDailyPlans` (scheduled Items) — never `includeActivities` ("Activity" is reserved for the change-log feed, per CONTEXT.md). UI copy says "Daily plans", "Accommodation", "Transport". The feature is a "Share link" (CONTEXT.md entry exists).
- **Tests:** run with `TZ=UTC` via `npm test` (already in the script). Colocate tests next to sources. Server-action tests mock `@/lib/db`, `@/lib/guards`, `next/cache` and use `expectAccessCheckedBeforeWrite` from `@/test/helpers/access-order`.
- **Commits:** conventional style, lowercase subject (match `git log` — e.g. `feat(share): ...`), each ending with the Claude co-author trailer.
- Targeted test runs during a task: `TZ=UTC npx vitest run <path>`. Full `npm test` + `npm run lint` at each task's end; `npm run build` only in the final task (slow).

---

### Task 1: Schema — many scoped ShareLinks per Trip

**Files:**
- Modify: `prisma/schema.prisma` (ShareLink model ~line 532; `Trip.shareLink` relation ~line 147)
- Create: `prisma/migrations/20260920120000_share_links_per_audience/migration.sql`
- Test: `prisma/share-links-migration.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma model `ShareLink` with fields `id, tripId (indexed, not unique), token (unique), label: string (required, no default), includeAccommodation/includeTransport/includeDailyPlans: boolean @default(true), createdAt`; `Trip.shareLinks: ShareLink[]`.

- [ ] **Step 1: Write the failing migration test**

Create `prisma/share-links-migration.test.ts` (pattern: `prisma/digest-and-alarms-migration.test.ts` — it asserts on the SQL text because migrations run unattended in the production deploy):

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `20260920120000_share_links_per_audience` turns the single share link into
 * many labelled, scoped links per trip. It runs unattended on deploy
 * (`prisma migrate deploy`), and its one hard promise is grandfathering:
 * every existing link keeps its token and comes out as a full-scope link
 * labelled 'Shared link', so nobody holding an old URL sees content change.
 */
const FILE = readFileSync(
  path.join(
    __dirname,
    "migrations",
    "20260920120000_share_links_per_audience",
    "migration.sql",
  ),
  "utf8",
);

// Statements only — never match against comments.
const SQL = FILE.replace(/^\s*--.*$/gm, "");

function at(needle: string): number {
  const index = SQL.indexOf(needle);
  expect(index, `migration.sql is missing: ${needle}`).toBeGreaterThan(-1);
  return index;
}

describe("share_links_per_audience migration", () => {
  it("backfills label as 'Shared link' before dropping the default", () => {
    const add = at(
      `ALTER TABLE "ShareLink" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'Shared link'`,
    );
    const drop = at(`ALTER TABLE "ShareLink" ALTER COLUMN "label" DROP DEFAULT`);
    expect(add).toBeLessThan(drop);
  });

  it("adds the three dials defaulting on, so existing links keep full scope", () => {
    at(`ADD COLUMN "includeAccommodation" BOOLEAN NOT NULL DEFAULT true`);
    at(`ADD COLUMN "includeTransport" BOOLEAN NOT NULL DEFAULT true`);
    at(`ADD COLUMN "includeDailyPlans" BOOLEAN NOT NULL DEFAULT true`);
  });

  it("swaps the tripId unique for a plain index", () => {
    at(`DROP INDEX "ShareLink_tripId_key"`);
    at(`CREATE INDEX "ShareLink_tripId_idx" ON "ShareLink"("tripId")`);
  });

  it("never destroys rows or the token column", () => {
    expect(SQL).not.toMatch(/DELETE\s+FROM/i);
    expect(SQL).not.toMatch(/TRUNCATE/i);
    expect(SQL).not.toMatch(/DROP\s+TABLE/i);
    expect(SQL).not.toMatch(/DROP\s+COLUMN/i);
  });
});
```

- [ ] **Step 2: Run it — must fail (file missing)**

Run: `TZ=UTC npx vitest run prisma/share-links-migration.test.ts`
Expected: FAIL — ENOENT reading migration.sql.

- [ ] **Step 3: Write the migration SQL by hand**

Create `prisma/migrations/20260920120000_share_links_per_audience/migration.sql`:

```sql
-- Many scoped share links per trip (ADR 0051).
-- Grandfather: every existing link becomes a full-scope link labelled
-- 'Shared link', keeping its token — holders of an old URL see exactly
-- what they saw before, no more and no less.

ALTER TABLE "ShareLink" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'Shared link';
ALTER TABLE "ShareLink" ALTER COLUMN "label" DROP DEFAULT;

ALTER TABLE "ShareLink" ADD COLUMN "includeAccommodation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShareLink" ADD COLUMN "includeTransport" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShareLink" ADD COLUMN "includeDailyPlans" BOOLEAN NOT NULL DEFAULT true;

-- One trip, many links: the unique constraint becomes a plain lookup index.
DROP INDEX "ShareLink_tripId_key";
CREATE INDEX "ShareLink_tripId_idx" ON "ShareLink"("tripId");
```

(`label` keeps NO default in the schema — new links must be labelled explicitly; the SQL default exists only to backfill, then is dropped. The dials DO keep their defaults, mirroring `CalendarFeed`'s include-toggles.)

- [ ] **Step 4: Update `prisma/schema.prisma`**

Replace the `ShareLink` model with:

```prisma
model ShareLink {
  id        String   @id @default(cuid())
  tripId    String
  token     String   @unique
  label     String
  createdAt DateTime @default(now())

  // Scope dials — what this audience sees (ADR 0051). Money, notes,
  // confirmations and booking refs are never shared regardless of dials.
  includeAccommodation Boolean @default(true)
  includeTransport     Boolean @default(true)
  includeDailyPlans    Boolean @default(true)

  trip Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)

  @@index([tripId])
}
```

In the `Trip` model, change `shareLink ShareLink?` to `shareLinks ShareLink[]`.

- [ ] **Step 5: Regenerate the client and validate**

Run: `npx prisma generate && npx prisma validate`
Expected: both succeed. (Do NOT run any `prisma migrate`/`db push` command — Global Constraints.)

- [ ] **Step 6: Run the migration test — passes**

Run: `TZ=UTC npx vitest run prisma/share-links-migration.test.ts`
Expected: PASS (4 tests).

Note: `npm test` will NOT be fully green at the end of this task — `server/actions/share.ts` still upserts on `where: { tripId }`, which the regenerated client no longer accepts as a unique selector, and its tests still assert the old shape. Task 2 fixes both. Run the migration test plus one unrelated suite (e.g. `TZ=UTC npx vitest run lib/trip-phase.test.ts`) to confirm the generate didn't break the world, and commit.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260920120000_share_links_per_audience/migration.sql prisma/share-links-migration.test.ts
git commit -m "feat(share): schema — many labelled, scoped share links per trip"
```

---

### Task 2: Server actions — per-link CRUD on the unified ActionResult

**Files:**
- Rewrite: `server/actions/share.ts`
- Rewrite: `server/actions/share.test.ts`
- Modify: `docs/adr/0027-unified-action-result.md` (line ~13: `share.ts` is listed as a raw-partial holdout — mark it migrated by this change)

**Interfaces:**
- Consumes: `ActionResult`, `ok`, `fail` from `@/lib/action-result`; `requireTripAccess` from `@/lib/guards`; Task 1's Prisma model.
- Produces (exact exports later tasks call):

```ts
export interface ShareLinkView {
  id: string;
  token: string;
  label: string;
  includeAccommodation: boolean;
  includeTransport: boolean;
  includeDailyPlans: boolean;
  createdAt: string; // ISO
}
export interface ShareScopeInput {
  includeAccommodation?: boolean;
  includeTransport?: boolean;
  includeDailyPlans?: boolean;
}
export async function listShareLinks(tripId: string): Promise<ShareLinkView[]>;
export async function createShareLink(tripId: string, input: { label: string } & ShareScopeInput): Promise<ActionResult<{ link: ShareLinkView }>>;
export async function updateShareLink(tripId: string, linkId: string, input: { label?: string } & ShareScopeInput): Promise<ActionResult<{ link: ShareLinkView }>>;
export async function rotateShareLink(tripId: string, linkId: string): Promise<ActionResult<{ link: ShareLinkView }>>;
export async function revokeShareLink(tripId: string, linkId: string): Promise<ActionResult>;
```

Build-greenness note: this task retires `getShareLink` and changes signatures, which leaves `components/trip/settings/share-panel.tsx`, its test, and the settings page stale. **In this task**, update the two test files' *mocks* only as far as needed to keep `npm test` green (see Step 5); Task 4 replaces the stale UI. Do not run `next build` until Task 7.

- [ ] **Step 1: Rewrite the test file**

Replace `server/actions/share.test.ts` wholesale. Keep the existing mock scaffold style (vi.hoisted, `expectAccessCheckedBeforeWrite`), with mocks for `findMany`, `findFirst`, `create`, `updateMany`, `deleteMany`. Cover:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

const {
  requireTripAccessMock,
  revalidatePathMock,
  shareFindManyMock,
  shareFindFirstMock,
  shareCreateMock,
  shareUpdateManyMock,
  shareDeleteManyMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  revalidatePathMock: vi.fn(),
  shareFindManyMock: vi.fn(),
  shareFindFirstMock: vi.fn(),
  shareCreateMock: vi.fn(),
  shareUpdateManyMock: vi.fn(),
  shareDeleteManyMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/db", () => ({
  db: {
    shareLink: {
      findMany: shareFindManyMock,
      findFirst: shareFindFirstMock,
      create: shareCreateMock,
      updateMany: shareUpdateManyMock,
      deleteMany: shareDeleteManyMock,
    },
  },
}));

import {
  listShareLinks,
  createShareLink,
  updateShareLink,
  rotateShareLink,
  revokeShareLink,
} from "./share";

const TRIP_ID = "trip-abc";
const LINK_ID = "link-1";

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: LINK_ID,
  token: "tok-1",
  label: "Mum & Dad",
  includeAccommodation: true,
  includeTransport: true,
  includeDailyPlans: true,
  createdAt: new Date("2026-09-20T00:00:00Z"),
  ...over,
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("listShareLinks", () => {
  it("is access-checked and returns views ordered oldest-first", async () => {
    shareFindManyMock.mockResolvedValue([row()]);
    const links = await listShareLinks(TRIP_ID);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expect(shareFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: TRIP_ID },
        orderBy: { createdAt: "asc" },
      }),
    );
    expect(links).toEqual([
      expect.objectContaining({
        id: LINK_ID,
        label: "Mum & Dad",
        createdAt: "2026-09-20T00:00:00.000Z",
      }),
    ]);
  });
});

describe("createShareLink", () => {
  it("is access-checked before the write", async () => {
    shareCreateMock.mockResolvedValue(row());
    await createShareLink(TRIP_ID, { label: "Mum & Dad" });
    expectAccessCheckedBeforeWrite(requireTripAccessMock, shareCreateMock);
  });

  it("rejects a blank label without touching the database", async () => {
    const result = await createShareLink(TRIP_ID, { label: "   " });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.label).toBeDefined();
    expect(shareCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a label over 60 characters", async () => {
    const result = await createShareLink(TRIP_ID, { label: "x".repeat(61) });
    expect(result.success).toBe(false);
    expect(shareCreateMock).not.toHaveBeenCalled();
  });

  it("defaults every dial on and trims the label", async () => {
    shareCreateMock.mockResolvedValue(row());
    await createShareLink(TRIP_ID, { label: "  Mum & Dad  " });
    expect(shareCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tripId: TRIP_ID,
          label: "Mum & Dad",
          includeAccommodation: true,
          includeTransport: true,
          includeDailyPlans: true,
          token: expect.any(String),
        }),
      }),
    );
  });

  it("honours explicit false dials", async () => {
    shareCreateMock.mockResolvedValue(row({ includeDailyPlans: false }));
    await createShareLink(TRIP_ID, { label: "Group chat", includeDailyPlans: false });
    expect(shareCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ includeDailyPlans: false }),
      }),
    );
  });
});

describe("updateShareLink", () => {
  it("scopes the write to id AND tripId — a linkId from another trip is unreachable", async () => {
    shareUpdateManyMock.mockResolvedValue({ count: 1 });
    shareFindFirstMock.mockResolvedValue(row({ label: "Nana" }));
    await updateShareLink(TRIP_ID, LINK_ID, { label: "Nana" });
    expect(shareUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: LINK_ID, tripId: TRIP_ID } }),
    );
  });

  it("fails with a form error when no row matches", async () => {
    shareUpdateManyMock.mockResolvedValue({ count: 0 });
    const result = await updateShareLink(TRIP_ID, LINK_ID, { label: "Nana" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.form).toBeDefined();
  });

  it("rejects a blank label without writing", async () => {
    const result = await updateShareLink(TRIP_ID, LINK_ID, { label: " " });
    expect(result.success).toBe(false);
    expect(shareUpdateManyMock).not.toHaveBeenCalled();
  });

  it("updates dials without requiring a label", async () => {
    shareUpdateManyMock.mockResolvedValue({ count: 1 });
    shareFindFirstMock.mockResolvedValue(row({ includeTransport: false }));
    const result = await updateShareLink(TRIP_ID, LINK_ID, { includeTransport: false });
    expect(shareUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { includeTransport: false } }),
    );
    expect(result.success).toBe(true);
  });
});

describe("rotateShareLink", () => {
  it("writes a fresh token scoped to id AND tripId", async () => {
    shareUpdateManyMock.mockResolvedValue({ count: 1 });
    shareFindFirstMock.mockResolvedValue(row({ token: "tok-2" }));
    const result = await rotateShareLink(TRIP_ID, LINK_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, shareUpdateManyMock);
    expect(shareUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LINK_ID, tripId: TRIP_ID },
        data: { token: expect.any(String) },
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.link.token).toBe("tok-2");
  });

  it("fails with a form error when the link is gone", async () => {
    shareUpdateManyMock.mockResolvedValue({ count: 0 });
    const result = await rotateShareLink(TRIP_ID, LINK_ID);
    expect(result.success).toBe(false);
  });
});

describe("revokeShareLink", () => {
  it("deletes scoped to id AND tripId, and is a no-op-safe ok() when already gone", async () => {
    shareDeleteManyMock.mockResolvedValue({ count: 0 });
    const result = await revokeShareLink(TRIP_ID, LINK_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, shareDeleteManyMock);
    expect(shareDeleteManyMock).toHaveBeenCalledWith({
      where: { id: LINK_ID, tripId: TRIP_ID },
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `TZ=UTC npx vitest run server/actions/share.test.ts`
Expected: FAIL — `listShareLinks` etc. not exported.

- [ ] **Step 3: Rewrite `server/actions/share.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { type ActionResult, ok, fail } from "@/lib/action-result";

// ---------------------------------------------------------------------------
// Share link actions (ADR 0051)
//
// A trip holds many share links — one per audience, each labelled and scoped
// by three dials. Every mutation is scoped to { id, tripId } so a linkId from
// another trip can never be reached through this trip's access check.
// Money, notes, confirmations and booking refs are never shared on any link;
// that floor is enforced where the public page queries, not here.
// ---------------------------------------------------------------------------

export interface ShareLinkView {
  id: string;
  token: string;
  label: string;
  includeAccommodation: boolean;
  includeTransport: boolean;
  includeDailyPlans: boolean;
  createdAt: string; // ISO
}

export interface ShareScopeInput {
  includeAccommodation?: boolean;
  includeTransport?: boolean;
  includeDailyPlans?: boolean;
}

const LABEL_MAX = 60;

const LINK_SELECT = {
  id: true,
  token: true,
  label: true,
  includeAccommodation: true,
  includeTransport: true,
  includeDailyPlans: true,
  createdAt: true,
} as const;

type LinkRow = {
  id: string;
  token: string;
  label: string;
  includeAccommodation: boolean;
  includeTransport: boolean;
  includeDailyPlans: boolean;
  createdAt: Date;
};

function toView(row: LinkRow): ShareLinkView {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/** Trimmed label, or null when blank/too long — the caller turns null into a field error. */
function cleanLabel(raw: string): string | null {
  const label = raw.trim();
  if (!label || label.length > LABEL_MAX) return null;
  return label;
}

function labelError() {
  return fail({
    label: [`Give this link a label (1–${LABEL_MAX} characters) — who is it for?`],
  });
}

function scopeData(input: ShareScopeInput) {
  const data: Record<string, boolean> = {};
  if (input.includeAccommodation !== undefined) data.includeAccommodation = input.includeAccommodation;
  if (input.includeTransport !== undefined) data.includeTransport = input.includeTransport;
  if (input.includeDailyPlans !== undefined) data.includeDailyPlans = input.includeDailyPlans;
  return data;
}

/** All of a trip's share links, oldest first. Access-checked. */
export async function listShareLinks(tripId: string): Promise<ShareLinkView[]> {
  await requireTripAccess(tripId);
  const rows = await db.shareLink.findMany({
    where: { tripId },
    orderBy: { createdAt: "asc" },
    select: LINK_SELECT,
  });
  return rows.map(toView);
}

/** Create a labelled, scoped link. Dials default on. Access-checked. */
export async function createShareLink(
  tripId: string,
  input: { label: string } & ShareScopeInput,
): Promise<ActionResult<{ link: ShareLinkView }>> {
  await requireTripAccess(tripId);
  const label = cleanLabel(input.label);
  if (!label) return labelError();

  const row = await db.shareLink.create({
    data: {
      tripId,
      token: crypto.randomUUID(),
      label,
      includeAccommodation: input.includeAccommodation ?? true,
      includeTransport: input.includeTransport ?? true,
      includeDailyPlans: input.includeDailyPlans ?? true,
    },
    select: LINK_SELECT,
  });

  revalidatePath(`/trips/${tripId}/settings`);
  return ok({ link: toView(row) });
}

/** Rename a link and/or move its dials. Access-checked; scoped to the trip. */
export async function updateShareLink(
  tripId: string,
  linkId: string,
  input: { label?: string } & ShareScopeInput,
): Promise<ActionResult<{ link: ShareLinkView }>> {
  await requireTripAccess(tripId);

  const data: Record<string, string | boolean> = scopeData(input);
  if (input.label !== undefined) {
    const label = cleanLabel(input.label);
    if (!label) return labelError();
    data.label = label;
  }

  const { count } = await db.shareLink.updateMany({
    where: { id: linkId, tripId },
    data,
  });
  if (count === 0) return fail({ form: ["Share link not found."] });

  const row = await db.shareLink.findFirst({
    where: { id: linkId, tripId },
    select: LINK_SELECT,
  });
  if (!row) return fail({ form: ["Share link not found."] });

  revalidatePath(`/trips/${tripId}/settings`);
  return ok({ link: toView(row) });
}

/** Replace one link's token. The old URL dies immediately; siblings are untouched. */
export async function rotateShareLink(
  tripId: string,
  linkId: string,
): Promise<ActionResult<{ link: ShareLinkView }>> {
  await requireTripAccess(tripId);

  const { count } = await db.shareLink.updateMany({
    where: { id: linkId, tripId },
    data: { token: crypto.randomUUID() },
  });
  if (count === 0) return fail({ form: ["Share link not found."] });

  const row = await db.shareLink.findFirst({
    where: { id: linkId, tripId },
    select: LINK_SELECT,
  });
  if (!row) return fail({ form: ["Share link not found."] });

  revalidatePath(`/trips/${tripId}/settings`);
  return ok({ link: toView(row) });
}

/** Delete one link. No-op-safe: revoking an already-gone link still returns ok(). */
export async function revokeShareLink(
  tripId: string,
  linkId: string,
): Promise<ActionResult> {
  await requireTripAccess(tripId);

  await db.shareLink.deleteMany({ where: { id: linkId, tripId } });

  revalidatePath(`/trips/${tripId}/settings`);
  return ok();
}
```

- [ ] **Step 4: Run the new suite — passes**

Run: `TZ=UTC npx vitest run server/actions/share.test.ts`
Expected: PASS.

- [ ] **Step 5: Quiet the two stale consumer TESTS (UI itself waits for Task 4)**

`npm test` must be green at commit. Two suites reference retired exports:

1. `app/(app)/trips/[tripId]/settings/page.test.tsx` line 31 mocks `getShareLink`. Change that mock line to:

```ts
vi.mock("@/server/actions/share", () => ({ listShareLinks: vi.fn(async () => []) }));
```

The page still calls `getShareLink` until Task 4 — but the page test imports the page with panels marker-mocked; if the suite fails because the page code calls the now-unmocked name, ALSO update the page's data call now (two-line edit, safe ahead of Task 4): in `app/(app)/trips/[tripId]/settings/page.tsx`, replace the `getShareLink` import with `listShareLinks`, replace `getShareLink(tripId)` with `listShareLinks(tripId)` in the `Promise.all` (rename the destructured `shareLink` to `shareLinks`), and change the `SharePanel` mount to `<SharePanel tripId={tripId} initialToken={shareLinks[0]?.token ?? null} />` as a stopgap.

2. Delete `components/trip/settings/share-panel.test.tsx` (the toggle panel it tests is replaced in Task 4; its component remains only as a stopgap and is deleted then too).

- [ ] **Step 6: Update ADR 0027's holdout note**

In `docs/adr/0027-unified-action-result.md`, the table row/line listing `share.ts` as a raw-partial holdout: annotate it, e.g. change the example cell to `share.ts (migrated to ActionResult with the per-audience share links work — ADR 0051)`.

- [ ] **Step 7: Full test run + lint, then commit**

Run: `npm test && npm run lint`
Expected: PASS (everything green).

```bash
git add server/actions/share.ts server/actions/share.test.ts docs/adr/0027-unified-action-result.md "app/(app)/trips/[tripId]/settings/page.test.tsx" "app/(app)/trips/[tripId]/settings/page.tsx"
git rm components/trip/settings/share-panel.test.tsx
git commit -m "feat(share): per-link CRUD actions on the unified ActionResult"
```

---

### Task 3: Pure view helpers — `lib/share-view.ts`

**Files:**
- Create: `lib/share-view.ts`
- Test: `lib/share-view.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:

```ts
export interface ShareScope {
  includeAccommodation: boolean;
  includeTransport: boolean;
  includeDailyPlans: boolean;
}
/** Human caption for a link row: "Full itinerary", "Route & dates only", or "Route & dates · Accommodation · Daily plans". */
export function scopeCaption(scope: ShareScope): string;
/** The accommodation covering tonight: checkIn <= today < checkOut; latest check-in wins on overlap. Null when none. */
export function tonightsStay<A extends { checkIn: string; checkOut: string }>(
  accommodations: A[],
  todayISO: string,
): A | null;
```

- [ ] **Step 1: Write the failing tests**

Create `lib/share-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scopeCaption, tonightsStay } from "./share-view";

const scope = (over: Partial<Parameters<typeof scopeCaption>[0]> = {}) => ({
  includeAccommodation: true,
  includeTransport: true,
  includeDailyPlans: true,
  ...over,
});

describe("scopeCaption", () => {
  it("calls the all-on scope a full itinerary", () => {
    expect(scopeCaption(scope())).toBe("Full itinerary");
  });

  it("calls the all-off scope route & dates only", () => {
    expect(
      scopeCaption(
        scope({
          includeAccommodation: false,
          includeTransport: false,
          includeDailyPlans: false,
        }),
      ),
    ).toBe("Route & dates only");
  });

  it("lists the on dials in a fixed order for a partial scope", () => {
    expect(scopeCaption(scope({ includeTransport: false }))).toBe(
      "Route & dates · Accommodation · Daily plans",
    );
    expect(
      scopeCaption(
        scope({ includeAccommodation: false, includeDailyPlans: false }),
      ),
    ).toBe("Route & dates · Transport");
  });
});

describe("tonightsStay", () => {
  const stay = (checkIn: string, checkOut: string, name = "Hotel") => ({
    checkIn,
    checkOut,
    name,
  });

  it("returns the stay covering tonight", () => {
    const s = stay("2026-12-06", "2026-12-10");
    expect(tonightsStay([s], "2026-12-08")).toBe(s);
  });

  it("includes the check-in day and excludes the check-out day", () => {
    const s = stay("2026-12-06", "2026-12-10");
    expect(tonightsStay([s], "2026-12-06")).toBe(s);
    expect(tonightsStay([s], "2026-12-10")).toBeNull();
  });

  it("prefers the latest check-in when stays overlap (changeover day)", () => {
    const leaving = stay("2026-12-06", "2026-12-10", "Munich");
    const arriving = stay("2026-12-10", "2026-12-14", "Strasbourg");
    expect(tonightsStay([leaving, arriving], "2026-12-10")).toBe(arriving);
  });

  it("returns null when nothing covers tonight", () => {
    expect(tonightsStay([stay("2026-12-06", "2026-12-10")], "2026-12-20")).toBeNull();
    expect(tonightsStay([], "2026-12-08")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — must fail (module missing)**

Run: `TZ=UTC npx vitest run lib/share-view.test.ts`
Expected: FAIL — cannot resolve `./share-view`.

- [ ] **Step 3: Implement `lib/share-view.ts`**

```ts
/**
 * Pure helpers for the public share view and the settings share-links panel.
 *
 * A ShareScope is one link's three dials (ADR 0051). The floor beneath the
 * dials — money, notes, confirmations, booking refs never shared — is not
 * modelled here because no scope can express it: the public page simply
 * never queries those fields.
 */

export interface ShareScope {
  includeAccommodation: boolean;
  includeTransport: boolean;
  includeDailyPlans: boolean;
}

const DIAL_LABELS: Array<[keyof ShareScope, string]> = [
  ["includeAccommodation", "Accommodation"],
  ["includeTransport", "Transport"],
  ["includeDailyPlans", "Daily plans"],
];

/** Human caption for a link row in Settings. */
export function scopeCaption(scope: ShareScope): string {
  const on = DIAL_LABELS.filter(([key]) => scope[key]).map(([, label]) => label);
  if (on.length === DIAL_LABELS.length) return "Full itinerary";
  if (on.length === 0) return "Route & dates only";
  return ["Route & dates", ...on].join(" · ");
}

/**
 * The accommodation covering tonight: you sleep there on `todayISO` when
 * checkIn <= today < checkOut. On a changeover day two stays can both match
 * the calendar (you check out of one and into the other); the latest check-in
 * is where you actually sleep.
 */
export function tonightsStay<A extends { checkIn: string; checkOut: string }>(
  accommodations: A[],
  todayISO: string,
): A | null {
  const covering = accommodations.filter(
    (a) => a.checkIn <= todayISO && todayISO < a.checkOut,
  );
  if (covering.length === 0) return null;
  return covering.reduce((latest, a) => (a.checkIn > latest.checkIn ? a : latest));
}
```

- [ ] **Step 4: Run — passes**

Run: `TZ=UTC npx vitest run lib/share-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/share-view.ts lib/share-view.test.ts
git commit -m "feat(share): pure scope-caption and tonights-stay helpers"
```

---

### Task 4: Settings — the share-links list panel

**Files:**
- Create: `components/trip/settings/share-links-panel.tsx`
- Test: `components/trip/settings/share-links-panel.test.tsx`
- Modify: `app/(app)/trips/[tripId]/settings/page.tsx` (imports at ~lines 5, 17; data fetch at ~73–74; mount at ~153)
- Modify: `app/(app)/trips/[tripId]/settings/page.test.tsx` (panel marker-mock at ~line 39)
- Delete: `components/trip/settings/share-panel.tsx`

**Interfaces:**
- Consumes: `listShareLinks`, `createShareLink`, `updateShareLink`, `rotateShareLink`, `revokeShareLink`, `ShareLinkView` (Task 2); `scopeCaption` (Task 3); `Button` from `@/components/ui/button`; `Input` from `@/components/ui/input`; `cn` from `@/lib/cn`.
- Produces: `export function ShareLinksPanel({ tripId, initialLinks }: { tripId: string; initialLinks: ShareLinkView[] })`.

- [ ] **Step 1: Write the failing component test**

Create `components/trip/settings/share-links-panel.test.tsx` (mock style copied from the retired share-panel test):

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ShareLinkView } from "@/server/actions/share";

const createShareLink = vi.fn();
const updateShareLink = vi.fn();
const rotateShareLink = vi.fn();
const revokeShareLink = vi.fn();
vi.mock("@/server/actions/share", () => ({
  get createShareLink() { return createShareLink; },
  get updateShareLink() { return updateShareLink; },
  get rotateShareLink() { return rotateShareLink; },
  get revokeShareLink() { return revokeShareLink; },
}));

Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  configurable: true,
});

import { ShareLinksPanel } from "./share-links-panel";

const link = (over: Partial<ShareLinkView> = {}): ShareLinkView => ({
  id: "l1",
  token: "tok-1",
  label: "Mum & Dad",
  includeAccommodation: true,
  includeTransport: true,
  includeDailyPlans: true,
  createdAt: "2026-09-20T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  createShareLink.mockReset();
  updateShareLink.mockReset();
  rotateShareLink.mockReset();
  revokeShareLink.mockReset();
});

describe("ShareLinksPanel", () => {
  it("renders each link with its label and scope caption", () => {
    render(
      <ShareLinksPanel
        tripId="t"
        initialLinks={[link(), link({ id: "l2", token: "tok-2", label: "Group chat", includeDailyPlans: false })]}
      />,
    );
    expect(screen.getByText("Mum & Dad")).toBeInTheDocument();
    expect(screen.getByText("Full itinerary")).toBeInTheDocument();
    expect(screen.getByText("Group chat")).toBeInTheDocument();
    expect(screen.getByText("Route & dates · Accommodation · Transport")).toBeInTheDocument();
  });

  it("creates a link with the typed label and dial choices, all dials defaulting on", async () => {
    createShareLink.mockResolvedValue({ success: true, link: link({ id: "new", label: "Nana", includeTransport: false }) });
    render(<ShareLinksPanel tripId="t" initialLinks={[]} />);

    await userEvent.click(screen.getByRole("button", { name: /new share link/i }));
    await userEvent.type(screen.getByLabelText(/label/i), "Nana");
    await userEvent.click(screen.getByLabelText("Transport")); // untick one dial
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(createShareLink).toHaveBeenCalledWith("t", {
      label: "Nana",
      includeAccommodation: true,
      includeTransport: false,
      includeDailyPlans: true,
    });
    expect(await screen.findByText("Nana")).toBeInTheDocument();
  });

  it("shows the label error when create fails validation", async () => {
    createShareLink.mockResolvedValue({ success: false, errors: { label: ["Give this link a label (1–60 characters) — who is it for?"] } });
    render(<ShareLinksPanel tripId="t" initialLinks={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /new share link/i }));
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(await screen.findByText(/give this link a label/i)).toBeInTheDocument();
  });

  it("revokes only the clicked link", async () => {
    revokeShareLink.mockResolvedValue({ success: true });
    render(<ShareLinksPanel tripId="t" initialLinks={[link(), link({ id: "l2", token: "tok-2", label: "Group chat" })]} />);
    await userEvent.click(screen.getAllByRole("button", { name: /revoke/i })[1]);
    expect(revokeShareLink).toHaveBeenCalledWith("t", "l2");
    expect(screen.queryByText("Group chat")).not.toBeInTheDocument();
    expect(screen.getByText("Mum & Dad")).toBeInTheDocument();
  });

  it("rotates a link and swaps in the fresh token", async () => {
    rotateShareLink.mockResolvedValue({ success: true, link: link({ token: "tok-9" }) });
    render(<ShareLinksPanel tripId="t" initialLinks={[link()]} />);
    await userEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    expect(rotateShareLink).toHaveBeenCalledWith("t", "l1");
    expect(await screen.findByText(/tok-9/)).toBeInTheDocument();
  });

  it("saves dial edits through updateShareLink", async () => {
    updateShareLink.mockResolvedValue({ success: true, link: link({ includeDailyPlans: false }) });
    render(<ShareLinksPanel tripId="t" initialLinks={[link()]} />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByLabelText("Daily plans"));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(updateShareLink).toHaveBeenCalledWith("t", "l1", {
      label: "Mum & Dad",
      includeAccommodation: true,
      includeTransport: true,
      includeDailyPlans: false,
    });
    expect(await screen.findByText("Route & dates · Accommodation · Transport")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — must fail (component missing)**

Run: `TZ=UTC npx vitest run components/trip/settings/share-links-panel.test.tsx`
Expected: FAIL — cannot resolve `./share-links-panel`.

- [ ] **Step 3: Implement the panel**

Create `components/trip/settings/share-links-panel.tsx`:

```tsx
"use client";

import * as React from "react";
import { useTransition } from "react";
import { Copy, Check, RefreshCw, Trash2, Pencil, Plus } from "lucide-react";
import {
  createShareLink,
  updateShareLink,
  rotateShareLink,
  revokeShareLink,
  type ShareLinkView,
  type ShareScopeInput,
} from "@/server/actions/share";
import { scopeCaption } from "@/lib/share-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Share links panel — one row per audience (ADR 0051).
// Label + three dials per link; money/notes/confirmations are never shared
// on any link, so no dial for them exists.
// ---------------------------------------------------------------------------

const DIALS: Array<{ key: keyof Required<ShareScopeInput>; label: string }> = [
  { key: "includeAccommodation", label: "Accommodation" },
  { key: "includeTransport", label: "Transport" },
  { key: "includeDailyPlans", label: "Daily plans" },
];

type ScopeState = Record<keyof Required<ShareScopeInput>, boolean>;

const FULL_SCOPE: ScopeState = {
  includeAccommodation: true,
  includeTransport: true,
  includeDailyPlans: true,
};

function shareUrl(token: string): string {
  const path = `/share/${token}`;
  return typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
}

function DialChecks({
  scope,
  onChange,
  idPrefix,
}: {
  scope: ScopeState;
  onChange: (next: ScopeState) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {DIALS.map(({ key, label }) => (
        <label key={key} htmlFor={`${idPrefix}-${key}`} className="flex items-center gap-2 text-sm text-foreground">
          <input
            id={`${idPrefix}-${key}`}
            type="checkbox"
            className="size-4 accent-primary"
            checked={scope[key]}
            onChange={(e) => onChange({ ...scope, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

function CopyUrlBar({ token }: { token: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate rounded-[10px] border border-border px-3 py-2 font-mono text-xs text-muted-foreground">
        {shareUrl(token)}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(shareUrl(token)).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? (
          <>
            <Check className="size-4" aria-hidden="true" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="size-4" aria-hidden="true" />
            Copy
          </>
        )}
      </Button>
    </div>
  );
}

function LinkRow({
  tripId,
  link,
  onChanged,
  onRevoked,
}: {
  tripId: string;
  link: ShareLinkView;
  onChanged: (link: ShareLinkView) => void;
  onRevoked: (id: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [label, setLabel] = React.useState(link.label);
  const [scope, setScope] = React.useState<ScopeState>({
    includeAccommodation: link.includeAccommodation,
    includeTransport: link.includeTransport,
    includeDailyPlans: link.includeDailyPlans,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateShareLink(tripId, link.id, { label, ...scope });
      if (result.success) {
        onChanged(result.link);
        setEditing(false);
        setError(null);
      } else {
        setError(result.errors.label?.[0] ?? result.errors.form?.[0] ?? "Something went wrong.");
      }
    });
  }

  function handleRotate() {
    startTransition(async () => {
      const result = await rotateShareLink(tripId, link.id);
      if (result.success) onChanged(result.link);
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      const result = await revokeShareLink(tripId, link.id);
      if (result.success) onRevoked(link.id);
    });
  }

  return (
    <li className="rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{link.label}</p>
          <p className="text-xs text-muted-foreground">
            {scopeCaption(link)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing((v) => !v)} disabled={isPending}>
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleRotate} loading={isPending}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Regenerate
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRevoke}
            loading={isPending}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Revoke
          </Button>
        </div>
      </div>

      <CopyUrlBar token={link.token} />

      {editing && (
        <div className="space-y-3 rounded-xl bg-muted/30 p-3">
          <div className="space-y-1">
            <label htmlFor={`label-${link.id}`} className="text-xs font-medium text-muted-foreground">
              Label
            </label>
            <Input
              id={`label-${link.id}`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
            />
          </div>
          <DialChecks idPrefix={`edit-${link.id}`} scope={scope} onChange={setScope} />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleSave} loading={isPending}>
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function ShareLinksPanel({
  tripId,
  initialLinks,
}: {
  tripId: string;
  initialLinks: ShareLinkView[];
}) {
  const [links, setLinks] = React.useState<ShareLinkView[]>(initialLinks);
  const [creating, setCreating] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState("");
  const [newScope, setNewScope] = React.useState<ScopeState>(FULL_SCOPE);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      const result = await createShareLink(tripId, { label: newLabel, ...newScope });
      if (result.success) {
        setLinks((prev) => [...prev, result.link]);
        setCreating(false);
        setNewLabel("");
        setNewScope(FULL_SCOPE);
        setCreateError(null);
      } else {
        setCreateError(result.errors.label?.[0] ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-bold tracking-tight text-foreground">
          Share links
        </h3>
        <Button type="button" variant="outline" size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="size-4" aria-hidden="true" />
          New share link
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        One link per audience — each read-only, each scoped. Costs, notes and
        booking confirmations are never shared, whatever the dials.
      </p>

      {creating && (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
          <div className="space-y-1">
            <label htmlFor="new-link-label" className="text-xs font-medium text-muted-foreground">
              Label
            </label>
            <Input
              id="new-link-label"
              placeholder="e.g. Mum & Dad"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              maxLength={60}
            />
          </div>
          <DialChecks idPrefix="new-link" scope={newScope} onChange={setNewScope} />
          {createError && <p className="text-xs text-destructive">{createError}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleCreate} loading={isPending}>
              Create
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {links.length === 0 && !creating ? (
        <p className="text-sm text-muted-foreground">
          No share links yet. Create one to give family or friends a read-only
          view of the itinerary.
        </p>
      ) : (
        <ul className="space-y-3">
          {links.map((link) => (
            <LinkRow
              key={link.id}
              tripId={tripId}
              link={link}
              onChanged={(next) => setLinks((prev) => prev.map((l) => (l.id === next.id ? next : l)))}
              onRevoked={(id) => setLinks((prev) => prev.filter((l) => l.id !== id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
```

Note: check `components/ui/input.tsx`'s export name (`Input`) and `Button`'s `loading` prop before relying on them — both are used exactly this way by the old `share-panel.tsx` (Button) and other settings panels (Input). If `Input` doesn't exist with that name, use a plain `<input>` with the repo's standard input classes copied from a sibling settings panel.

- [ ] **Step 4: Run — passes**

Run: `TZ=UTC npx vitest run components/trip/settings/share-links-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Swap the settings page to the new panel and delete the old one**

In `app/(app)/trips/[tripId]/settings/page.tsx`:
- Import `ShareLinksPanel` from `@/components/trip/settings/share-links-panel`; remove the `SharePanel` import.
- The data fetch already calls `listShareLinks(tripId)` (Task 2 stopgap); rename the destructured variable to `shareLinks` if not already.
- Replace the mount `<SharePanel tripId={tripId} initialToken={...} />` with `<ShareLinksPanel tripId={tripId} initialLinks={shareLinks} />`.

In `app/(app)/trips/[tripId]/settings/page.test.tsx` (~line 39), replace the marker mock:

```ts
vi.mock("@/components/trip/settings/share-links-panel", () => ({ ShareLinksPanel: () => null }));
```

Delete `components/trip/settings/share-panel.tsx`.

- [ ] **Step 6: Full tests + lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A components/trip/settings "app/(app)/trips/[tripId]/settings"
git commit -m "feat(share): settings lists many labelled share links with per-link dials"
```

---

### Task 5: Public share page — scope gating

**Files:**
- Modify: `app/share/[token]/page.tsx`

**Interfaces:**
- Consumes: the ShareLink dials (Task 1). No new exports.
- Produces: the page's data shape for Task 6 — keep variable names `trip`, `stops`, `transports`, `accommodations`, `items`, `itinerary`, `scope` (new: `const scope: ShareScope`).

The floor stays structural: a dial that is off means the corresponding query **never runs** — hidden data never leaves the database, so no rendering bug can leak it.

- [ ] **Step 1: Thread the dials into the page**

In `app/share/[token]/page.tsx`:

Add to the `shareLink.findUnique` select (it currently only `include`s the trip — add a top-level `select` keeping the trip include):

```ts
const shareLink = await db.shareLink.findUnique({
  where: { token },
  select: {
    includeAccommodation: true,
    includeTransport: true,
    includeDailyPlans: true,
    trip: {
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        homeName: true,
        homeLat: true,
        homeLng: true,
        roundTrip: true,
        // homeCurrency intentionally omitted — no money on public page
      },
    },
  },
});
```

After the `notFound()` guard, build the scope (import `type ShareScope` from `@/lib/share-view`):

```ts
const scope: ShareScope = {
  includeAccommodation: shareLink.includeAccommodation,
  includeTransport: shareLink.includeTransport,
  includeDailyPlans: shareLink.includeDailyPlans,
};
```

- [ ] **Step 2: Gate the three queries**

In the `Promise.all`, replace the transport/accommodation/item fetches so an off dial fetches nothing (keep the existing `select`s verbatim — they are the never-shared floor):

```ts
const [rawStops, transports, accommodations, items] = await Promise.all([
  db.stop.findMany({ /* unchanged */ }),
  scope.includeTransport
    ? db.transport.findMany({ /* unchanged select */ })
    : Promise.resolve([]),
  scope.includeAccommodation
    ? db.accommodation.findMany({ /* unchanged select */ })
    : Promise.resolve([]),
  scope.includeDailyPlans
    ? db.item.findMany({ /* unchanged select */ })
    : Promise.resolve([]),
]);
```

(TypeScript: annotate the fallback arrays if inference complains, e.g. `Promise.resolve([] as Awaited<ReturnType<typeof db.transport.findMany<...>>>)` is overkill — simplest is to declare the three fetches as `const transports = scope.includeTransport ? await db.transport.findMany({...}) : [];` style OUTSIDE `Promise.all` if the union types fight; sequential awaits are acceptable here.)

- [ ] **Step 3: Gate the Day-by-Day section**

Downstream rendering already collapses naturally (empty maps → no accommodation/transport blocks in the stop cards; `buildItinerary` gets empty arrays → days render "Nothing planned."). One explicit gate: when ALL THREE dials are off, the Day-by-Day section is pure noise (every card says "Nothing planned"), so wrap the `<section aria-labelledby="timeline-heading">` in:

```tsx
{(scope.includeAccommodation || scope.includeTransport || scope.includeDailyPlans) && (
  <section aria-labelledby="timeline-heading"> ... existing content ... </section>
)}
```

- [ ] **Step 4: Verify by lint + full tests**

Run: `npm test && npm run lint`
Expected: PASS (this page has no unit test — the scope logic lives in the queries and is covered by review; Task 7 runs `next build` which type-checks this file).

- [ ] **Step 5: Commit**

```bash
git add "app/share/[token]/page.tsx"
git commit -m "feat(share): the public page fetches only what the link's scope allows"
```

---

### Task 6: Phase-aware share page — today card, weather, countdown, past line

**Files:**
- Create: `app/share/[token]/share-today-card.tsx`
- Test: `app/share/[token]/share-today-card.test.tsx`
- Modify: `app/share/[token]/page.tsx`

**Interfaces:**
- Consumes: `computeTripPhase`, `describePhase` from `@/lib/trip-phase`; `todayISOInZone`, `currentTripTimezone`, `instantToZonedTime` from `@/lib/tz`; `getDayWeather` from `@/lib/weather`; `daylight`, `utcHmToZone` from `@/lib/daylight`; `tzAbbrev` from `@/lib/dates`; `WeatherDaylightCard` from `@/components/trip/weather-daylight-card`; `tonightsStay`, `ShareScope` from `@/lib/share-view`; `DayPlan`, `orderDayEntries` from `@/lib/itinerary`.
- Produces: `export async function ShareTodayCard(props: ShareTodayCardProps)` (async server component) with:

```ts
export interface ShareTodayCardProps {
  countdown: string; // e.g. "Day 5 of 14" from describePhase
  timeZone: string;  // trip's current reference zone
  todayISO: string;  // today in that zone
  stop: { name: string; country: string | null; lat: number | null; lng: number | null } | null; // today's stop
  day: DayPlan | null;   // today's built itinerary day (queries already scope-gated)
  stay: { name: string; address: string | null } | null; // tonight's accommodation, or null (hidden OR none)
  scope: ShareScope;     // to tell "hidden by scope" apart from "empty day"
}
```

- [ ] **Step 1: Write the failing card test**

Async server components render in vitest by awaiting the component function. Create `app/share/[token]/share-today-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/weather", () => ({
  getDayWeather: vi.fn(async () => ({
    source: "forecast",
    highC: 3,
    lowC: -2,
    code: 71,
    label: "Snow",
  })),
}));

import { ShareTodayCard } from "./share-today-card";
import type { DayPlan } from "@/lib/itinerary";

const emptyDay = (dateISO: string): DayPlan =>
  ({
    dateISO,
    stop: null,
    timedItems: [],
    untimedItems: [],
    transportEntries: [],
    accommodationEntries: [],
  }) as unknown as DayPlan;

const baseProps = {
  countdown: "Day 5 of 14",
  timeZone: "Europe/Paris",
  todayISO: "2026-12-10",
  stop: { name: "Strasbourg", country: "France", lat: 48.58, lng: 7.75 },
  scope: {
    includeAccommodation: true,
    includeTransport: true,
    includeDailyPlans: true,
  },
};

describe("ShareTodayCard", () => {
  it("leads with the day number and the current stop", async () => {
    render(
      await ShareTodayCard({
        ...baseProps,
        day: emptyDay("2026-12-10"),
        stay: null,
      }),
    );
    expect(screen.getByText("Day 5 of 14")).toBeInTheDocument();
    expect(screen.getByText(/Strasbourg/)).toBeInTheDocument();
  });

  it("shows tonight's stay when given one", async () => {
    render(
      await ShareTodayCard({
        ...baseProps,
        day: emptyDay("2026-12-10"),
        stay: { name: "Hôtel Gutenberg", address: "31 Rue des Serruriers" },
      }),
    );
    expect(screen.getByText(/Tonight/)).toBeInTheDocument();
    expect(screen.getByText(/Hôtel Gutenberg/)).toBeInTheDocument();
  });

  it("says nothing planned when daily plans are in scope but the day is empty", async () => {
    render(
      await ShareTodayCard({
        ...baseProps,
        day: emptyDay("2026-12-10"),
        stay: null,
      }),
    );
    expect(screen.getByText(/nothing planned today/i)).toBeInTheDocument();
  });

  it("omits the plan section entirely when daily plans are out of scope", async () => {
    render(
      await ShareTodayCard({
        ...baseProps,
        scope: { ...baseProps.scope, includeDailyPlans: false },
        day: emptyDay("2026-12-10"),
        stay: null,
      }),
    );
    expect(screen.queryByText(/nothing planned today/i)).toBeNull();
  });

  it("renders the weather label from the forecast", async () => {
    render(
      await ShareTodayCard({
        ...baseProps,
        day: emptyDay("2026-12-10"),
        stay: null,
      }),
    );
    expect(screen.getByText(/Snow/)).toBeInTheDocument();
  });
});
```

(If `WeatherDaylightCard`'s internals make the last assertion ambiguous, assert on a `data-testid="share-weather"` wrapper's presence/absence instead — presence when `stop` has coordinates, absence when `stop.lat` is null. Adjust while keeping the scope-gating tests intact.)

- [ ] **Step 2: Run — must fail**

Run: `TZ=UTC npx vitest run "app/share/[token]/share-today-card.test.tsx"`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `share-today-card.tsx`**

```tsx
import { MapPin, Home, ArrowRight } from "lucide-react";
import { getDayWeather } from "@/lib/weather";
import { daylight, utcHmToZone } from "@/lib/daylight";
import { instantToZonedTime } from "@/lib/tz";
import { tzAbbrev } from "@/lib/dates";
import { WeatherDaylightCard } from "@/components/trip/weather-daylight-card";
import { orderDayEntries, type DayPlan } from "@/lib/itinerary";
import type { ShareScope } from "@/lib/share-view";

// ---------------------------------------------------------------------------
// The share page's lead card while the trip is Travelling: where they are,
// what time it is there, the weather, and today's plan — each section only
// as the link's scope allows. Read by family at home, so it summarises;
// the full day-by-day below carries the detail.
// ---------------------------------------------------------------------------

export interface ShareTodayCardProps {
  countdown: string;
  timeZone: string;
  todayISO: string;
  stop: { name: string; country: string | null; lat: number | null; lng: number | null } | null;
  day: DayPlan | null;
  stay: { name: string; address: string | null } | null;
  scope: ShareScope;
}

const MODE_LABELS: Record<string, string> = {
  FLIGHT: "Flight",
  TRAIN: "Train",
  BUS: "Bus",
  CAR: "Car",
  FERRY: "Ferry",
  OTHER: "Transport",
};

export async function ShareTodayCard({
  countdown,
  timeZone,
  todayISO,
  stop,
  day,
  stay,
  scope,
}: ShareTodayCardProps) {
  // Weather + daylight for today at the current stop (public data; leaks nothing).
  const wx =
    stop?.lat != null && stop?.lng != null
      ? await getDayWeather({ lat: stop.lat, lng: stop.lng, dateISO: todayISO, today: todayISO })
      : null;
  const dlRaw = stop?.lat != null && stop?.lng != null ? daylight(stop.lat, stop.lng, todayISO) : null;
  const dl = dlRaw
    ? {
        sunrise: dlRaw.sunriseUTC != null ? utcHmToZone(todayISO, dlRaw.sunriseUTC, timeZone) : null,
        sunset: dlRaw.sunsetUTC != null ? utcHmToZone(todayISO, dlRaw.sunsetUTC, timeZone) : null,
        dayLengthMin: dlRaw.dayLengthMin,
        polarDay: dlRaw.polarDay,
        polarNight: dlRaw.polarNight,
        tzLabel: tzAbbrev(timeZone, todayISO),
      }
    : null;

  const localTime = instantToZonedTime(new Date(), timeZone);
  const ordered = day ? orderDayEntries(day) : null;
  const transportEntries = ordered
    ? ordered.entries.filter(
        (e) => e.kind === "transport-departure" || e.kind === "transport-arrival",
      )
    : [];
  const itemEntries = ordered ? ordered.entries.filter((e) => e.kind === "item") : [];
  const anytime = ordered?.anytime ?? [];

  return (
    <section
      aria-labelledby="today-heading"
      className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {countdown}
          </p>
          <h2 id="today-heading" className="font-display text-2xl font-bold text-foreground">
            {stop ? (
              <span className="flex items-center gap-2">
                <MapPin className="size-5 text-primary" aria-hidden="true" />
                {stop.name}
                {stop.country && (
                  <span className="text-base font-normal text-muted-foreground">{stop.country}</span>
                )}
              </span>
            ) : (
              "On the move"
            )}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {localTime} local time · {tzAbbrev(timeZone, todayISO)}
          </p>
        </div>
        {dl && (
          <div data-testid="share-weather">
            <WeatherDaylightCard compact weather={wx} daylight={dl} />
          </div>
        )}
      </div>

      {/* Today's transport (scope-gated at fetch; entries absent when off) */}
      {scope.includeTransport && transportEntries.length > 0 && (
        <div className="space-y-1.5">
          {transportEntries.map((entry) => {
            if (entry.kind !== "transport-departure" && entry.kind !== "transport-arrival") return null;
            const t = entry.transport;
            const isDep = entry.kind === "transport-departure";
            const time = isDep
              ? "depTimeLabel" in entry ? entry.depTimeLabel : null
              : "arrTimeLabel" in entry ? entry.arrTimeLabel : null;
            return (
              <div key={`${entry.kind}-${t.id}`} className="flex items-center gap-2 text-sm">
                {time && <span className="font-mono text-xs text-muted-foreground w-10 text-right shrink-0">{time}</span>}
                <span className="font-medium text-foreground">
                  {isDep ? "Departs" : "Arrives"} — {MODE_LABELS[t.mode] ?? t.mode}
                </span>
                {t.depPlace && t.arrPlace && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                    <span className="truncate">{t.depPlace}</span>
                    <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{t.arrPlace}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Today's plan (only when the link shares daily plans) */}
      {scope.includeDailyPlans && (
        <div className="space-y-1.5">
          {itemEntries.length === 0 && anytime.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Nothing planned today.</p>
          ) : (
            <>
              {itemEntries.map((entry) => {
                if (entry.kind !== "item") return null;
                const { item } = entry;
                return (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground w-10 text-right shrink-0">
                      {item.startTime}
                    </span>
                    <span className="text-foreground">{item.title}</span>
                  </div>
                );
              })}
              {anytime.map((entry) => (
                <div key={entry.item.id} className="flex items-center gap-2 text-sm">
                  <span className="w-10 shrink-0" aria-hidden="true" />
                  <span className="text-foreground/80">{entry.item.title}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Tonight's stay (null when scope hides accommodation OR none exists) */}
      {stay && (
        <div className="flex items-center gap-2 border-t border-primary/10 pt-3 text-sm text-muted-foreground">
          <Home className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Tonight — <span className="font-medium text-foreground">{stay.name}</span>
            {stay.address && <span className="ml-1 text-xs">· {stay.address}</span>}
          </span>
        </div>
      )}
    </section>
  );
}
```

(Check the exact `TransportDepartureEntry`/`TransportArrivalEntry` label field names in `lib/itinerary.ts:72-104` — the share page's Day-by-Day already reads `entry.depTimeLabel` / `entry.arrTimeLabel`; mirror whatever it does.)

- [ ] **Step 4: Run — passes**

Run: `TZ=UTC npx vitest run "app/share/[token]/share-today-card.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Wire the phase into the page**

In `app/share/[token]/page.tsx`, after `itinerary` is built:

```ts
import { computeTripPhase, describePhase } from "@/lib/trip-phase";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";
import { tonightsStay } from "@/lib/share-view";
import { ShareTodayCard } from "./share-today-card";
import { stopForDate } from "@/lib/itinerary"; // only if needed; today's stop also lives on todayPlan.stop

const timeZone = currentTripTimezone(stops);
const todayISO = todayISOInZone(timeZone);
const phaseDesc = describePhase({
  startDate: trip.startDate,
  endDate: trip.endDate,
  today: todayISO,
});
const phase = phaseDesc.phase;

const todayPlan = phase === "travelling"
  ? itinerary.find((d) => d.dateISO === todayISO) ?? null
  : null;
const todayStop = todayPlan?.stop
  ? stops.find((s) => s.id === todayPlan.stop!.id) ?? null
  : null;
const stay = phase === "travelling"
  ? tonightsStay(accommodations, todayISO)
  : null;
```

(If `itinerary` days' `stop` lacks lat/lng — check `DayPlan`'s stop shape — resolve today's stop from the `stops` array by id as above; that array has `lat`/`lng`.)

Render changes:

1. **Header meta row** (the `flex flex-wrap` div with date range / nights / stops): append a phase line for the non-travelling phases:

```tsx
{(phase === "planning" || phase === "final-prep") && (
  <span className="font-medium text-primary">{phaseDesc.countdown}</span>
)}
{phase === "past" && (
  <span>This trip has ended · {phaseDesc.countdown}</span>
)}
```

2. **Today card** — insert immediately BEFORE the Route section:

```tsx
{phase === "travelling" && (
  <ShareTodayCard
    countdown={phaseDesc.countdown}
    timeZone={timeZone}
    todayISO={todayISO}
    stop={todayStop ? { name: todayStop.name, country: todayStop.country, lat: todayStop.lat, lng: todayStop.lng } : null}
    day={todayPlan}
    stay={stay ? { name: stay.name, address: stay.address } : null}
    scope={scope}
  />
)}
```

3. **Today highlight in Day-by-Day** — in the day loop:

```tsx
const isToday = phase === "travelling" && day.dateISO === todayISO;
```

and on the day card's outer div, swap the static classes for:

```tsx
className={isToday
  ? "rounded-2xl border border-primary bg-card ring-1 ring-primary/40"
  : "rounded-2xl border border-border bg-card"}
```

plus a "Today" badge in the day header next to the date:

```tsx
{isToday && (
  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
    Today
  </span>
)}
```

- [ ] **Step 6: Full tests + lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/share/[token]/share-today-card.tsx" "app/share/[token]/share-today-card.test.tsx" "app/share/[token]/page.tsx"
git commit -m "feat(share): the public page reads the phase and leads with today while travelling"
```

---

### Task 7: ADR 0051, doc sweep, final verification

**Files:**
- Create: `docs/adr/0051-share-links-per-audience-with-a-never-shared-floor.md`
- Modify: `DESIGN-BRIEF.md` (lines ~321, ~323), `SPEC.md` (line ~100, the P6 bullet)

**Interfaces:** none — docs and verification only.

- [ ] **Step 1: Write ADR 0051**

Match the tone/format of recent ADRs (read `docs/adr/0049-*.md` for shape). Content to cover:

```markdown
# ADR 0051 — Share links per audience, with a never-shared floor

## Context

Sharing had no ADR: one bearer-token `ShareLink` per trip, a single public
page, everything-or-nothing. The trip-ready feature needed different levels
of detail for different audiences (family vs the group chat), and a share
page that is useful *during* the trip, not only before it.

Two designs were considered for "not everyone gets every detail":
one link with content toggles (the CalendarFeed pattern), or many links,
each labelled for its audience and carrying its own scope.

## Decision

1. **Many links per trip, scoped per link.** `ShareLink` drops its
   `tripId` unique; each link carries a required `label` and three dials —
   `includeAccommodation`, `includeTransport`, `includeDailyPlans`. One
   link per audience; revoking one never touches another. A single toggled
   link cannot serve two audiences holding it at the same time — that
   requirement is inherently per-audience.
2. **A never-shared floor no dial can pierce.** Money/costs/budget, Notes,
   confirmation numbers, booking references, Journal, Checklists,
   Attachments, Wishlist and Forks are never exposed on any link. The floor
   is structural: the public page never selects those fields, and an
   off dial means the corresponding query never runs. No configuration —
   present or future — can leak a booking reference, because there is no
   code path that reads one.
3. **The public page reads the Phase.** Same engine as the Home
   (`computeTripPhase`, today in the trip's current-stop timezone):
   pre-trip shows a countdown line, Travelling leads with a today card
   (day number, local time, weather, today's plan within scope), Past shows
   an ended line. Deliberately excluded: live check-ins/status, countdown
   timers, journal sharing — the share answers "where are they and what's
   the plan", not "are they safe right now".
4. **Grandfathering.** The migration turns each existing link into a
   full-scope link labelled 'Shared link' with its token unchanged —
   holders of an old URL see exactly what they saw before.

## Consequences

- Viewers still have no identity: a link names an audience, not a person;
  anyone holding the URL sees that audience's view. Rotation remains the
  remedy for a leaked URL.
- `share.ts` now returns the unified ActionResult (closes the ADR 0027
  holdout).
- The dials gate the today card and the day-by-day identically; a section
  can never appear in one and be hidden in the other.
```

- [ ] **Step 2: Sweep stale doc mentions**

- `DESIGN-BRIEF.md` ~line 321: change `share link (copy/revoke)` to `share links (per-audience list: label + scope dials, copy/rotate/revoke)`.
- `DESIGN-BRIEF.md` ~line 323: change the Share bullet to note the page is phase-aware and per-link scoped, keeping the never-shared sentence, e.g.: `**Share** ('/share/[token]') — public, no-auth, read-only, scoped per link (accommodation/transport/daily-plans dials); phase-aware — leads with a today card while Travelling. **No costs, notes, confirmations, or links — ever, on any link.**`
- `SPEC.md` P6 bullet: `read-only share link` → `read-only share links (per-audience, scoped)`.

- [ ] **Step 3: Full verification — tests, lint, build**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS. The build is the first full type-check across the reworked pages — fix any type errors it surfaces (they should be confined to files this plan touched).

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0051-share-links-per-audience-with-a-never-shared-floor.md DESIGN-BRIEF.md SPEC.md
git commit -m "docs(adr-0051): share links per audience, with a never-shared floor"
```

---

## Self-review notes

- **Spec coverage:** multiple labelled scoped links (T1–T4), defaults all-on + required label (T2/T4), grandfather migration (T1), never-shared floor incl. journal (Global Constraints + T5 query gating + ADR), phase-aware page with today card + weather + local time, no countdown timers (T6), pre-trip countdown line + past line (T6), today highlight (T6), Settings list UI with per-link copy/edit/rotate/revoke (T4), ADR 0051 (T7). ✓
- **Known intentional gaps:** no viewer identity/expiry (out of scope, recorded in ADR consequences); share page not offline-warmed (pre-existing); `mobile-pwa-checklist.md`'s stale sign-in-CTA row left as-is (pre-existing staleness, unrelated).
- **Type consistency:** `ShareLinkView`/`ShareScopeInput` (T2) are what T4 imports; `ShareScope`/`scopeCaption`/`tonightsStay` (T3) are what T4/T5/T6 import; `DayPlan` + `orderDayEntries` come from `@/lib/itinerary` as verified against the existing page.
