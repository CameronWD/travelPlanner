# Share/Summary width, storage quota, Recently deleted Trips — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Long names can no longer widen the Share page or Summary on a phone; file storage is capped per Trip and app-wide; a deleted Trip waits 30 days in Recently deleted and can be restored; images that fail to load fall back gracefully and Attachments warm for offline once per device.

**Architecture:** Pure helpers in `lib/` (quota, purge, rate limit, cron auth) with unit tests; Server Actions call them after the existing access guards. Soft delete is one nullable column gated in `requireTripAccess` plus `deletedAt: null` filters on the handful of reads that do not go through the guard. Layout fixes are Tailwind class changes pinned by class-assertion tests (jsdom does no layout).

**Tech Stack:** Next.js (App Router, read `node_modules/next/dist/docs/` before touching routes), Prisma + Postgres (Neon), Vitest + Testing Library (jsdom), Tailwind, a hand-written service worker (`public/sw.js`).

**Spec:** `docs/specs/2026-10-02-share-width-storage-quota-trip-trash.md` — read it first. CONTEXT.md defines **Recently deleted**; ADR 0067 records the soft-delete decision.

## Global Constraints

- Branch is `fix/summary-width-and-safety-2026-10-02`. Never commit to `main`. Never deploy, never run `npm run feedback:*`.
- Run `npm test` (Vitest, `TZ=UTC`) and `npx tsc --noEmit` before every commit; `npm run lint` before the final commit of each task.
- Every Server Action export in a `"use server"` file calls a guard (`requireUser`, `requireTripAccess`, …) BEFORE any read of request data that costs anything (file buffering, storage, DB writes). Tests assert order with `expectAccessCheckedBeforeWrite` from `test/helpers/access-order.ts`.
- Quota numbers: `TRIP_QUOTA_BYTES = 500 * 1024 * 1024`, `GLOBAL_QUOTA_BYTES = 8 * 1024 * 1024 * 1024`. Warm cap: `MAX_WARM_TRIP_BYTES = 200 * 1024 * 1024`. Trash: 30 days.
- Copy (verbatim): Trip quota — "This Trip has used its 500 MB of file storage. Delete some files to add more." Global — "Teepee's file storage is full. Cam has been told." Delete dialog — button **Delete**, description "Goes to Recently deleted for 30 days. Only you can restore it." Files note — "Files from the last 200 MB are kept on this device for offline use."
- Terminology: **Recently deleted**, **Restore**, **Trip**, **Traveller**, **Attachment**, **Share link** — as CONTEXT.md. Never "trash", "bin", "archive".
- Prisma migrations are hand-written SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`, additive only, with a header comment explaining why the old build survives the migrate-then-build window (see `20261002130000_traveller_details`).
- Mock `@/lib/db` with `vi.mock` + `vi.hoisted` as the neighbouring tests do; never hit a database from `npm test`.
- Commit messages: conventional prefix, end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

Inputs the spec implies but no requirement names; each has a test pinned in the owning task:

1. **A 60-character unbroken Item title in a Share day row on a 390px phone** must wrap inside its grid cell, not widen the page (Task 1).
2. **An upload that would land exactly on the cap** passes; one byte over fails, with no `Attachment` row and no blob written (Tasks 3, 4).
3. **A Traveller who is a member but not the owner** of a Trip in Recently deleted must not be able to restore it, and must get `notFound` opening it (Tasks 6, 7).
4. **A Share link or calendar token for a deleted Trip** answers 404 while deleted and works again after Restore (Task 6).
5. **The purge must never destroy a Trip deleted 29 days ago**, and must schedule the cover and every Attachment blob for the sweep before the row goes (Task 8).

---

### Task 1: Share page — long text cannot widen the page

**Files:**
- Modify: `app/share/[token]/day-by-day.tsx:118-168`
- Modify: `app/share/[token]/share-rows.tsx:155-178`
- Modify: `app/share/[token]/share-hero.tsx:100-104, 179-190`
- Modify: `app/share/[token]/share-cta.tsx:34-60`
- Modify: `app/share/[token]/page.tsx:584`
- Test: `app/share/[token]/share-rows.test.tsx`, `app/share/[token]/day-by-day.test.tsx` (create if absent)

**Why these spots.** `share-route-list.tsx` and the hero `<h1>` already carry `min-w-0`/`truncate`/`break-words`. The remaining risks are: a day `<li>` that is `grid gap-1` with no explicit columns on mobile (implicit `auto` column = min-content width, so one long unbroken word widens the list, then the section, then the page); the `ShareRow` title span with no `break-words`; `LegLine`'s `flex-wrap` row with unbroken label text; the hero's contact spans; the CTA.

- [ ] **Step 1: Write the failing tests**

In `app/share/[token]/share-rows.test.tsx` add (match the file's existing imports and the `ShareRowModel` shape it already builds):

```tsx
it("breaks a long unbroken title inside its grid cell", () => {
  const long = "Supercalifragilisticexpialidocious-museum-of-very-long-names-and-things";
  const { container } = render(<ShareRow row={{ ...baseRow, title: long }} />);
  const title = screen.getByText(long);
  expect(title.className).toMatch(/\bbreak-words\b/);
  expect(title.className).toMatch(/\bmin-w-0\b/);
  // the grid must size its text column with minmax(0, …), never auto
  expect(container.firstElementChild!.className).toMatch(/minmax\(0,1fr\)/);
});
```

Create `app/share/[token]/day-by-day.test.tsx` if it does not exist; render `DayByDay` (or the exported `StopBlock`/day component — read the file and use whatever is exported for one Stop with one day) with a Stop named with 60 unbroken characters and a day title of 60 unbroken characters, then:

```tsx
const li = screen.getByTestId("share-day");
expect(li.className).toMatch(/grid-cols-\[minmax\(0,1fr\)\]/);
for (const child of Array.from(li.children)) expect(child.className).toMatch(/\bmin-w-0\b/);
expect(screen.getByText(longTitle).className).toMatch(/\bbreak-words\b/);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/share/[token]/share-rows.test.tsx app/share/[token]/day-by-day.test.tsx`
Expected: FAIL on the class assertions.

- [ ] **Step 3: Apply the classes**

`day-by-day.tsx`:
- Day `<li>` (line ~128): `"grid grid-cols-[minmax(0,1fr)] gap-1 border-b-2 … lg:grid-cols-[110px_minmax(0,1fr)] lg:gap-4"`; both child `<div>`s get `min-w-0`; the day-title `<p>` and the `<h3>` keep/get `break-words` (the `<h3>` already truncates — leave it).
- `LegLine` (line ~161): add `min-w-0` to the wrapper and `break-words` to the label span.

`share-rows.tsx` `ShareRow` (line ~161): title `<span>` → `cn("min-w-0 break-words text-[15px] font-bold", …)`; the grid is already `minmax(0,1fr)` — keep.

`share-hero.tsx`: the `<p className="mt-2 text-sm font-bold …">` gets `break-words`; each contact `<li>` gets `min-w-0`, each inner `<span>` `break-words`.

`share-cta.tsx`: the `lg:flex` wrapper's text child gets `min-w-0`; headline/paragraph `break-words`.

`page.tsx:584`: `<main className="… overflow-x-clip">` (clip, not hidden — hidden would create a scroll container that breaks the desktop sticky column from the 2026-10-02 §F work).

- [ ] **Step 4: Run tests, typecheck**

Run: `npx vitest run app/share && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/share
git commit -m "fix(share): long names wrap inside their cells instead of widening the page

Day rows size their text column minmax(0,1fr) on every width, row titles
and leg labels break-words, the hero's contact lines and the CTA shrink,
and <main> clips sideways overflow as a backstop (spec 2026-10-02 §A).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Summary page and Trip shell header — same treatment

**Files:**
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx` at: 171-182 and 505-517 (rough stop cards), 553-568 (chapter header), 593-615 (stop header), 617-640 (budget column), 641-648 (accommodation), 652-668 (transport), 735-741 (category rows), 787-795 (`StatCard`), 451 (page root)
- Modify: `app/(app)/trips/[tripId]/layout.tsx:133-136`
- Test: `app/(app)/trips/[tripId]/summary/page.test.tsx` (extend; it exists — read its mocking first)

- [ ] **Step 1: Write the failing test**

In the existing summary page test, add a Stop whose `name` is 60 unbroken characters, an accommodation `name` of 60, and a transport with `depPlace` of 60. Then:

```tsx
const stopName = screen.getByRole("heading", { level: 3, name: longStop });
expect(stopName.className).toMatch(/\bbreak-words\b/);
expect(stopName.className).toMatch(/\bmin-w-0\b/);
expect(stopName.parentElement!.className).toMatch(/\bmin-w-0\b/);        // flex row
expect(stopName.parentElement!.parentElement!.className).toMatch(/\bmin-w-0\b/); // left column
expect(screen.getByText(longAccom).className).toMatch(/\btruncate\b|\bbreak-words\b/);
expect(screen.getByText(new RegExp(longPlace)).className).toMatch(/\bmin-w-0\b/);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "app/(app)/trips/[tripId]/summary"`
Expected: FAIL.

- [ ] **Step 3: Apply the classes**

- Stop header (`:593-615`): outer `div` → add `min-w-0`; left `<div>` → `min-w-0 flex-1`; inner `flex items-center gap-2` → `flex min-w-0 items-center gap-2`; `<h3>` → add `min-w-0 break-words`; country span `shrink-0`. Budget `div.text-right` → add `shrink-0`.
- Rough stop cards (`:171-182`, `:505-517`): `<h3>` → add `min-w-0 break-words`.
- Chapter header (`:554`): inner div → `flex min-w-0 items-center gap-2`.
- Accommodation (`:641`): wrapper → add `min-w-0`; `<span>{accom.name}</span>` → `className="min-w-0 truncate"`; dates span `shrink-0`.
- Transport (`:652`): wrapper → add `min-w-0`; text span → `className="min-w-0 break-words"`; the Badge keeps `ml-auto` and gets `shrink-0`.
- Category row (`:735`): category span → `min-w-0 truncate`; amount `shrink-0`.
- `StatCard` value `<p>` (`:793`): add `truncate`.
- Page root (`:451`): `flex flex-col gap-8` → `flex min-w-0 flex-col gap-8 overflow-x-clip`.
- `layout.tsx:134`: `<div className="flex flex-col gap-1">` → `flex min-w-0 flex-col gap-1`.

- [ ] **Step 4: Run tests, typecheck**

Run: `npx vitest run "app/(app)/trips/[tripId]" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/trips/[tripId]/summary" "app/(app)/trips/[tripId]/layout.tsx"
git commit -m "fix(summary): long Stop, place and Trip names wrap instead of widening the page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Storage quota helper

**Files:**
- Create: `lib/storage-quota.ts`
- Test: `lib/storage-quota.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const TRIP_QUOTA_BYTES: number;    // 500 MiB
  export const GLOBAL_QUOTA_BYTES: number;  // 8 GiB
  export class QuotaExceeded extends Error { scope: "trip" | "global"; }
  export const QUOTA_MESSAGES: { trip: string; global: string };
  /** Reads usage from db.attachment.aggregate; throws QuotaExceeded. Never writes. */
  export async function assertQuota(opts: { tripId?: string | null; size: number }): Promise<void>;
  /** Sum of Attachment.size for a Trip (0 when none). */
  export async function tripStorageUsed(tripId: string): Promise<number>;
  ```
- Design: Attachments are the only unbounded uploads (covers and profile photos are one-per-owner and already 10 MiB-capped), so usage = `SUM(Attachment.size)`. A Trip in Recently deleted still counts (its rows exist). Globe-scoped uploads pass `tripId: null` and are checked against the global cap only.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/storage-quota.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { aggregateMock } = vi.hoisted(() => ({ aggregateMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { attachment: { aggregate: aggregateMock } } }));

import { assertQuota, QuotaExceeded, TRIP_QUOTA_BYTES, GLOBAL_QUOTA_BYTES, tripStorageUsed } from "./storage-quota";

beforeEach(() => aggregateMock.mockReset());

/** aggregate is called twice per assertQuota with a tripId: trip scope, then global. */
function usage(trip: number, global: number) {
  aggregateMock
    .mockResolvedValueOnce({ _sum: { size: trip } })
    .mockResolvedValueOnce({ _sum: { size: global } });
}

describe("assertQuota", () => {
  it("passes when the upload lands exactly on the Trip cap", async () => {
    usage(TRIP_QUOTA_BYTES - 10, TRIP_QUOTA_BYTES - 10);
    await expect(assertQuota({ tripId: "t1", size: 10 })).resolves.toBeUndefined();
  });
  it("throws trip scope one byte over the Trip cap", async () => {
    usage(TRIP_QUOTA_BYTES - 10, TRIP_QUOTA_BYTES - 10);
    await expect(assertQuota({ tripId: "t1", size: 11 })).rejects.toMatchObject({ scope: "trip" });
  });
  it("throws global scope when the app is full even if the Trip has room", async () => {
    usage(0, GLOBAL_QUOTA_BYTES);
    await expect(assertQuota({ tripId: "t1", size: 1 })).rejects.toMatchObject({ scope: "global" });
  });
  it("checks only the global cap for a Globe upload (no tripId)", async () => {
    aggregateMock.mockResolvedValueOnce({ _sum: { size: 5 } });
    await assertQuota({ tripId: null, size: 1 });
    expect(aggregateMock).toHaveBeenCalledTimes(1);
    expect(aggregateMock.mock.calls[0][0]).toEqual({ _sum: { size: true } });
  });
  it("treats an empty table as zero usage", async () => {
    aggregateMock.mockResolvedValue({ _sum: { size: null } });
    await expect(assertQuota({ tripId: "t1", size: 1 })).resolves.toBeUndefined();
  });
  it("is a QuotaExceeded instance with the user-facing message", async () => {
    usage(TRIP_QUOTA_BYTES, 0);
    const err = await assertQuota({ tripId: "t1", size: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(QuotaExceeded);
    expect(err.message).toBe("This Trip has used its 500 MB of file storage. Delete some files to add more.");
  });
});

describe("tripStorageUsed", () => {
  it("returns the sum, or 0", async () => {
    aggregateMock.mockResolvedValueOnce({ _sum: { size: 42 } });
    expect(await tripStorageUsed("t1")).toBe(42);
    aggregateMock.mockResolvedValueOnce({ _sum: { size: null } });
    expect(await tripStorageUsed("t1")).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/storage-quota.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/storage-quota.ts
import { db } from "@/lib/db";

/** Spec 2026-10-02 §B. Covers and profile photos are one-per-owner and 10 MiB-capped,
 *  so Attachments (files, Item photos, Journal photos) are the only unbounded uploads
 *  and the only rows counted. A Trip in Recently deleted still counts: its files exist. */
export const TRIP_QUOTA_BYTES = 500 * 1024 * 1024;
export const GLOBAL_QUOTA_BYTES = 8 * 1024 * 1024 * 1024;

export const QUOTA_MESSAGES = {
  trip: "This Trip has used its 500 MB of file storage. Delete some files to add more.",
  global: "Teepee's file storage is full. Cam has been told.",
} as const;

export class QuotaExceeded extends Error {
  constructor(public readonly scope: "trip" | "global") {
    super(QUOTA_MESSAGES[scope]);
    this.name = "QuotaExceeded";
  }
}

export async function tripStorageUsed(tripId: string): Promise<number> {
  const r = await db.attachment.aggregate({ _sum: { size: true }, where: { tripId } });
  return r._sum.size ?? 0;
}

async function globalStorageUsed(): Promise<number> {
  const r = await db.attachment.aggregate({ _sum: { size: true } });
  return r._sum.size ?? 0;
}

/** Throws QuotaExceeded when `size` more bytes would exceed a cap. Reads only. */
export async function assertQuota(opts: { tripId?: string | null; size: number }): Promise<void> {
  if (opts.tripId) {
    const used = await tripStorageUsed(opts.tripId);
    if (used + opts.size > TRIP_QUOTA_BYTES) throw new QuotaExceeded("trip");
  }
  const total = await globalStorageUsed();
  if (total + opts.size > GLOBAL_QUOTA_BYTES) throw new QuotaExceeded("global");
}
```

- [ ] **Step 4: Run tests** — `npx vitest run lib/storage-quota.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/storage-quota.ts lib/storage-quota.test.ts
git commit -m "feat(storage): assertQuota — 500 MB per Trip, 8 GB app-wide, from Attachment sizes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Quota on every upload path; access before buffering

**Files:**
- Modify: `server/actions/attachments.ts:100-135, 205-260` (`uploadAttachment`)
- Modify: `server/actions/item-photo.ts:64-90` (`setItemPhoto`)
- Modify: `server/actions/cover.ts:19-55` (`setTripCover`) and `server/actions/profile.ts:69-95` (`setProfilePhoto`) — global cap only (they create no Attachment row, so pass `tripId: null`)
- Test: `server/actions/attachments.test.ts`, `server/actions/item-photo.test.ts`, `server/actions/cover.test.ts`, `server/actions/profile.test.ts`

**Interfaces:**
- Consumes: `assertQuota`, `QuotaExceeded` from Task 3.
- Pattern in every action:
  ```ts
  try { await assertQuota({ tripId, size: file.size }); }
  catch (e) { if (e instanceof QuotaExceeded) return { success: false, error: e.message }; throw e; }
  ```
  placed AFTER the guard and BEFORE `file.arrayBuffer()` / `storage.save` / any `db.*.create`.

- [ ] **Step 1: Write failing tests**

In each action test, add a hoisted `assertQuotaMock` and `vi.mock("@/lib/storage-quota", async (orig) => ({ ...(await orig()), assertQuota: assertQuotaMock }))` — import `QuotaExceeded` from the real module to construct the rejection. For `uploadAttachment` (trip path):

```ts
it("refuses an over-quota upload with the Trip message and writes nothing", async () => {
  assertQuotaMock.mockRejectedValueOnce(new QuotaExceeded("trip"));
  const result = await uploadAttachment(tripFormData({ size: 1024 }));
  expect(result).toEqual({ success: false, error: "This Trip has used its 500 MB of file storage. Delete some files to add more." });
  expect(attachmentCreateMock).not.toHaveBeenCalled();
  expect(storageSaveMock).not.toHaveBeenCalled();
});
it("checks access before the quota and before reading the file", async () => {
  await uploadAttachment(tripFormData({ size: 1024 }));
  expectAccessCheckedBeforeWrite(requireTripAccessMock, assertQuotaMock);
  expectAccessCheckedBeforeWrite(requireTripAccessMock, storageSaveMock);
});
it("passes the global message through for a Globe upload", async () => {
  assertQuotaMock.mockRejectedValueOnce(new QuotaExceeded("global"));
  const result = await uploadAttachment(globeFormData());
  expect(result).toEqual({ success: false, error: "Teepee's file storage is full. Cam has been told." });
});
```

Use whatever FormData builder the test file already has (read it; `tripFormData`/`globeFormData` are placeholders for its helpers). Add the over-quota + no-write test to `item-photo`, `cover`, `profile` tests; for `cover`/`profile` assert `assertQuotaMock` was called with `{ tripId: null, size: file.size }`.

- [ ] **Step 2: Run** — `npx vitest run server/actions/attachments server/actions/item-photo server/actions/cover server/actions/profile` — Expected: FAIL.

- [ ] **Step 3: Implement**

`uploadAttachment`: restructure so the order is: parse fields → `if (!(file instanceof File))` → parse targetType → **branch on globe/trip, do the guard** → `validateUpload` → `assertQuota` → `await file.arrayBuffer()` → the rest unchanged. Concretely, hoist the globe guard (`requireGlobeAccess`, id match) and the trip guard (`requireTripAccess(tripId)`) above the `validateUpload` call; move `const bytes = Buffer.from(await file.arrayBuffer())` to immediately before its first use in each branch. Keep every comment that explains the Journal replace ordering.

`setItemPhoto`: after `requireTripAccess(item.tripId)` and `validateUpload`, call `assertQuota({ tripId: item.tripId, size: file.size })` before `createAttachmentFromFile`.

`setTripCover` / `setProfilePhoto`: after the guard and `validateUpload`, `assertQuota({ tripId: null, size: file.size })` before `file.arrayBuffer()`.

- [ ] **Step 4: Run** the four test files + `npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/actions/attachments.ts server/actions/item-photo.ts server/actions/cover.ts server/actions/profile.ts server/actions/*.test.ts
git commit -m "feat(storage): every upload checks the quota after access and before buffering the file

uploadAttachment also moves its access guard above validateUpload and
arrayBuffer() (spec 2026-10-02 §B, §D).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Operator notice at the global ceiling; "Used X of 500 MB" on Files

**Files:**
- Modify: `prisma/schema.prisma` — add model `OperatorNotice { key String @id; lastSentAt DateTime }`
- Create: `prisma/migrations/20261002150000_operator_notice/migration.sql`
- Create: `lib/storage-ceiling-notice.ts`, `lib/storage-ceiling-notice.test.ts`
- Modify: `server/actions/attachments.ts`, `server/actions/item-photo.ts`, `server/actions/cover.ts`, `server/actions/profile.ts` — in the `QuotaExceeded` catch, `if (e.scope === "global") void notifyStorageCeiling();`
- Modify: `app/(app)/trips/[tripId]/files/page.tsx:119-125` — `PageHeader` gets a `description` (or the nearest supported prop — read `components/ui/page-header.tsx`) "Used 123 MB of 500 MB"; amber (`text-sun-text`, or the hue token the codebase uses for warnings — check `lib/hues.ts` `text` for `sun`) at ≥ 90 %.
- Create: `lib/format-bytes.ts` + test: `formatMB(bytes)` → `"123 MB"` (rounded, `"0 MB"` for 0).

**Interfaces:**
- Consumes: `notifyAdmins(title, body, url)` from `lib/admin-notify.ts` (web-push to Admin Devices — the codebase's documented operator channel; the spec's "email" is implemented as this push, recorded in the spec's status line in Task 12). `tripStorageUsed` from Task 3.
- Produces: `export async function notifyStorageCeiling(now?: Date): Promise<void>` — never throws; sends at most once per 24 h using `OperatorNotice` key `"storage-ceiling"`.

- [ ] **Step 1: Migration + schema**

```sql
-- Operator notices (spec 2026-10-02 §B): a one-row-per-key ledger so the
-- "storage is at its ceiling" push goes out once a day, not once per refused
-- upload. Additive: a new table nothing in the running build reads.
CREATE TABLE "OperatorNotice" (
  "key" TEXT NOT NULL,
  "lastSentAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperatorNotice_pkey" PRIMARY KEY ("key")
);
```
Run `npx prisma generate` (no `migrate dev` — there is no local DB in the sandbox; the migration applies on deploy as the others do).

- [ ] **Step 2: Failing tests for the notice**

```ts
const { noticeFind, noticeUpsert, notifyAdminsMock } = vi.hoisted(() => ({
  noticeFind: vi.fn(), noticeUpsert: vi.fn(), notifyAdminsMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db", () => ({ db: { operatorNotice: { findUnique: noticeFind, upsert: noticeUpsert } } }));
vi.mock("@/lib/admin-notify", () => ({ notifyAdmins: notifyAdminsMock }));

it("pushes once and records the time", async () => {
  noticeFind.mockResolvedValue(null);
  await notifyStorageCeiling(new Date("2026-10-02T10:00:00Z"));
  expect(notifyAdminsMock).toHaveBeenCalledWith("Teepee storage is at its 8 GB ceiling", expect.any(String), "/admin");
  expect(noticeUpsert).toHaveBeenCalledOnce();
});
it("stays quiet within 24 hours of the last push", async () => {
  noticeFind.mockResolvedValue({ key: "storage-ceiling", lastSentAt: new Date("2026-10-02T00:00:00Z") });
  await notifyStorageCeiling(new Date("2026-10-02T10:00:00Z"));
  expect(notifyAdminsMock).not.toHaveBeenCalled();
});
it("pushes again after 24 hours", async () => {
  noticeFind.mockResolvedValue({ key: "storage-ceiling", lastSentAt: new Date("2026-10-01T09:00:00Z") });
  await notifyStorageCeiling(new Date("2026-10-02T10:00:00Z"));
  expect(notifyAdminsMock).toHaveBeenCalledOnce();
});
it("never throws when the db fails", async () => {
  noticeFind.mockRejectedValue(new Error("down"));
  await expect(notifyStorageCeiling()).resolves.toBeUndefined();
});
```
Plus `lib/format-bytes.test.ts`: `formatMB(0) === "0 MB"`, `formatMB(123 * 1024 * 1024) === "123 MB"`, `formatMB(500 * 1024 * 1024) === "500 MB"`.

- [ ] **Step 3: Implement** `notifyStorageCeiling` (findUnique → if within 24 h return → upsert lastSentAt → `notifyAdmins("Teepee storage is at its 8 GB ceiling", "Every upload now fails until files are deleted. Cloudflare R2 free tier is 10 GB.", "/admin")`, whole body in try/catch). Wire the `void notifyStorageCeiling()` call into the four actions' catch blocks. Files page: load `tripStorageUsed(tripId)` alongside the existing queries and render the line.

- [ ] **Step 4: Run** `npm test && npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma lib/storage-ceiling-notice.ts lib/storage-ceiling-notice.test.ts lib/format-bytes.ts lib/format-bytes.test.ts server/actions "app/(app)/trips/[tripId]/files/page.tsx"
git commit -m "feat(storage): one push a day when the app hits its 8 GB ceiling; Files shows Used X of 500 MB

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `Trip.deletedAt` — schema, guard, and every read that bypasses the guard

**Files:**
- Modify: `prisma/schema.prisma` Trip model (after `slug`): `deletedAt DateTime?` + `@@index([deletedAt])`
- Create: `prisma/migrations/20261002160000_trip_deleted_at/migration.sql`
- Modify: `lib/guards.ts:71-83` (`requireTripAccess`)
- Modify (add `trip: { deletedAt: null }` to the `tripMember.findMany` where, or `deletedAt: null` to a `trip.findMany` where):
  `lib/trips/trips-page-loader.ts:43`, `app/(app)/layout.tsx:101`, `app/(app)/trips/[tripId]/page.tsx:109`, `server/actions/search.ts:88`, `lib/travel-stats-loader.ts:70`, `server/actions/digest.ts:160`, `app/api/cron/digest/route.ts:229`
- Modify (token lookups — `findUnique` cannot filter on a relation, so switch to `findFirst({ where: { token, trip: { deletedAt: null } } })`):
  `lib/share-lookup.ts:27`, `app/api/calendar/[token]/route.ts:12`, `app/share/[token]/journal-photo/[attachmentId]/route.ts:49`, `app/share/[token]/traveller-photo/[userId]/route.ts:42`
- Modify: `lib/digest-dispatch.ts:97` — select `deletedAt` and return the empty result when set.
- Test: `lib/guards.test.ts`, `lib/share-lookup.test.ts` (create if absent), `lib/trips/trips-page-loader.test.ts`

**Interfaces:**
- Produces: `requireTripAccess` now `notFound()`s for a deleted Trip. Its membership query becomes
  `db.tripMember.findMany({ where: { tripId }, select: { userId: true, role: true, lastReadActivityAt: true, trip: { select: { deletedAt: true } } } })`
  and the check is `if (!membership || members.some((m) => m.trip?.deletedAt)) notFound();` — `m.trip?.` so existing mocks without `trip` keep working.

- [ ] **Step 1: Migration**

```sql
-- Recently deleted (ADR 0067, CONTEXT.md): a deleted Trip is stamped, not
-- destroyed, and purged 30 days later. Additive and nullable: the running
-- build never writes it and reads every Trip as live, which is exactly the
-- state every row is in until the new build's deleteTrip runs.
ALTER TABLE "Trip" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Trip_deletedAt_idx" ON "Trip"("deletedAt");
```
`npx prisma generate`.

- [ ] **Step 2: Failing tests**

`lib/guards.test.ts`, in `describe("requireTripAccess")`:
```ts
it("denies a member of a Trip in Recently deleted with notFound", async () => {
  authMock.mockResolvedValue({ user: { id: "u1" } });
  findManyMock.mockResolvedValue([{ userId: "u1", role: "owner", trip: { deletedAt: new Date() } }]);
  await expect(requireTripAccess("trip1")).rejects.toThrow("NEXT_NOT_FOUND");
});
it("asks for the Trip's deletedAt alongside membership", async () => {
  authMock.mockResolvedValue({ user: { id: "u1" } });
  findManyMock.mockResolvedValue([{ userId: "u1", role: "owner", trip: { deletedAt: null } }]);
  await requireTripAccess("trip1");
  expect(findManyMock.mock.calls[0][0].select.trip).toEqual({ select: { deletedAt: true } });
});
```
`lib/trips/trips-page-loader.test.ts`: assert `m.findMany.mock.calls[0][0].where` equals `{ userId: "u1", trip: { deletedAt: null } }`.
`lib/share-lookup.test.ts`: mock `db.shareLink.findFirst`, call `findShareLink("tok")`, assert `where` is `{ token: "tok", trip: { deletedAt: null } }`.

- [ ] **Step 3: Implement** all the edits listed under Files. For `digest-dispatch.ts`, after the `trip` query: `if (!trip || trip.deletedAt) return <the function's existing empty result>` — read the function to find what "nothing to send" returns and reuse it. Update any existing test whose `where` assertion now differs.

- [ ] **Step 4: Run** `npm test && npx tsc --noEmit` — Expected: PASS. `grep -rn "shareLink.findUnique\|calendarFeed.findUnique" app lib server` must return nothing outside member-gated actions.

- [ ] **Step 5: Commit**

```bash
git add prisma lib app server
git commit -m "feat(trips): Trip.deletedAt — the guard and every token or list read skip a Trip in Recently deleted

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Soft `deleteTrip`, `restoreTrip`, the Recently deleted section, dialog copy

**Files:**
- Modify: `server/actions/trips.ts:336-368` (`deleteTrip`), add `restoreTrip` below it
- Create: `lib/trips/recently-deleted-loader.ts` + test
- Create: `components/trips/recently-deleted.tsx` + test
- Modify: `app/(app)/trips/page.tsx` — render `<RecentlyDeleted trips={deleted} />` after the travels row, inside the `FRAME` div, only when non-empty
- Modify: `components/trip/settings/danger-zone.tsx:71-78, 106-109`
- Test: `server/actions/trips.test.ts` (extend; read how it mocks `db.trip`)

**Interfaces:**
- Consumes: `isTripOwnerOrAdmin(membership, email)` from `lib/access.ts`; `requireUser` from `lib/guards.ts`.
- Produces:
  ```ts
  // server/actions/trips.ts
  export type RestoreTripResult = { success: true; slug: string } | { success: false; error: string };
  export async function restoreTrip(tripId: string): Promise<RestoreTripResult>;
  // lib/trips/recently-deleted-loader.ts
  export interface RecentlyDeletedTrip { id: string; name: string; slug: string | null; deletedAt: Date }
  export async function loadRecentlyDeleted(userId: string): Promise<RecentlyDeletedTrip[]>;
  ```
- `deleteTrip`: keep the guard + `isTripOwnerOrAdmin` check; REMOVE the `scheduleBlobDeletion` block (Task 8's purge schedules blobs when the row actually goes — scheduling now would let the 35-day sweep destroy a restorable Trip's files); replace `db.trip.delete` with `db.trip.update({ where: { id: tripId }, data: { deletedAt: new Date() } })`; keep `redirect("/trips")`.
- `restoreTrip`: `requireUser()` → `db.tripMember.findFirst({ where: { tripId, userId: user.id }, select: { role: true } })` (NOT `requireTripAccess` — it notFounds on deleted) → `if (!membership || !isTripOwnerOrAdmin(membership, user.email)) return { success: false, error: "Only the trip owner can restore the trip." }` → `db.trip.update({ where: { id: tripId }, data: { deletedAt: null }, select: { slug: true } })` → `revalidatePath("/trips")` → `{ success: true, slug }`.
- `loadRecentlyDeleted`: `db.tripMember.findMany({ where: { userId, role: "owner", trip: { deletedAt: { not: null } } }, select: { trip: { select: { id, name, slug, deletedAt } } }, orderBy: { trip: { deletedAt: "desc" } } })` — confirm the owner role literal in `prisma/schema.prisma` (`TripMember.role`) and `lib/access.ts` before writing it.
- `RecentlyDeleted` (client component): `<section aria-labelledby="recently-deleted-heading">`, `<h2>Recently deleted</h2>`, one row per Trip: name (`min-w-0 truncate`), "Deleted 3 days ago · gone in 27 days" (compute from `deletedAt` and `now` prop with `Math.floor` days; 30 − elapsed, min 0), and a `Button variant="outline" size="sm"` **Restore** that calls `restoreTrip` in a transition and `router.push(tripPath(slug ?? id))` on success (import `tripPath` from wherever `lib/offline.ts` gets it).

- [ ] **Step 1: Failing tests**

`server/actions/trips.test.ts`:
```ts
it("deleteTrip stamps deletedAt instead of deleting, and schedules no blobs", async () => {
  await deleteTrip("t1").catch(() => {}); // redirect throws
  expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: "t1" }, data: { deletedAt: expect.any(Date) } });
  expect(tripDeleteMock).not.toHaveBeenCalled();
  expect(scheduleBlobDeletionMock).not.toHaveBeenCalled();
});
it("restoreTrip refuses a non-owner member", async () => {
  tripMemberFindFirstMock.mockResolvedValue({ role: "member" });
  expect(await restoreTrip("t1")).toEqual({ success: false, error: "Only the trip owner can restore the trip." });
  expect(tripUpdateMock).not.toHaveBeenCalled();
});
it("restoreTrip clears deletedAt for the owner and returns the slug", async () => {
  tripMemberFindFirstMock.mockResolvedValue({ role: "owner" });
  tripUpdateMock.mockResolvedValue({ slug: "eu-trip" });
  expect(await restoreTrip("t1")).toEqual({ success: true, slug: "eu-trip" });
  expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: "t1" }, data: { deletedAt: null }, select: { slug: true } });
});
it("restoreTrip does not use requireTripAccess (which hides deleted Trips)", async () => {
  tripMemberFindFirstMock.mockResolvedValue({ role: "owner" });
  await restoreTrip("t1");
  expect(requireTripAccessMock).not.toHaveBeenCalled();
});
```
`components/trips/recently-deleted.test.tsx`: renders the heading, the "Deleted 3 days ago · gone in 27 days" line for a `deletedAt` 3 days before `now`, a Restore button per Trip, and renders `null` for an empty list. `danger-zone.test.tsx` (create or extend): the dialog shows "Goes to Recently deleted for 30 days. Only you can restore it." and the confirm button text is exactly "Delete".

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** per Interfaces. Dialog: replace the description sentence with `Goes to Recently deleted for 30 days. Only you can restore it.` (keep the bold trip name sentence before it: "This will delete **{tripName}** and all its stops, items, costs, checklists, and files."), button text `Delete`.

- [ ] **Step 4: Run** `npm test && npx tsc --noEmit && npm run lint` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/actions/trips.ts server/actions/trips.test.ts lib/trips components/trips components/trip/settings "app/(app)/trips/page.tsx"
git commit -m "feat(trips): deleting a Trip moves it to Recently deleted; the owner can Restore for 30 days (ADR 0067)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The purge — library, cron route, workflow

**Files:**
- Create: `lib/cron-auth.ts` — move `safeEqual` + `isAuthorized` out of `app/api/cron/digest/route.ts:90-116` as `export function isCronAuthorized(req: NextRequest): boolean`; the digest route imports it. Test: `lib/cron-auth.test.ts` (header match, query match, unset secret → false, wrong secret → false).
- Create: `lib/trip-purge.ts` + `lib/trip-purge.test.ts`
- Create: `app/api/cron/purge-trips/route.ts` + `route.test.ts`
- Create: `.github/workflows/purge-trips-cron.yml` — copy `digest-cron.yml`'s job verbatim (same `APP_URL` variable, `CRON_SECRET` secret, same skip-when-unconfigured and non-2xx semantics), schedule `cron: "17 3 * * *"`, path `/api/cron/purge-trips`. Trim the digest-specific comment block to three lines saying what this one does.
- Modify: `docs/DEPLOY.md` §5 (where the digest cron is documented) — one paragraph: the purge workflow reuses the same secret and variable; nothing new to set.

**Interfaces:**
- Consumes: `scheduleBlobDeletion(keys)` from `lib/blob-retention.ts`.
- Produces:
  ```ts
  export const RECENTLY_DELETED_DAYS = 30;
  /** Hard-deletes Trips whose deletedAt is older than `days`; schedules their cover and Attachment blobs first. */
  export async function purgeExpiredDeletedTrips(opts?: { now?: Date; days?: number }): Promise<{ purged: string[] }>;
  ```

- [ ] **Step 1: Failing tests**

```ts
// lib/trip-purge.test.ts
it("purges only Trips past 30 days, scheduling cover and attachment blobs before the delete", async () => {
  const now = new Date("2026-11-02T00:00:00Z");
  tripFindManyMock.mockResolvedValue([{ id: "old", coverImageKey: "covers/old.webp", attachments: [{ storageKey: "a/1" }, { storageKey: null }] }]);
  const result = await purgeExpiredDeletedTrips({ now });
  expect(tripFindManyMock.mock.calls[0][0].where).toEqual({ deletedAt: { lt: new Date("2026-10-03T00:00:00Z") } });
  expect(scheduleBlobDeletionMock).toHaveBeenCalledWith(["covers/old.webp", "a/1"]);
  expectAccessCheckedBeforeWrite(scheduleBlobDeletionMock, tripDeleteMock); // "before" — the helper only checks order
  expect(tripDeleteMock).toHaveBeenCalledWith({ where: { id: "old" } });
  expect(result).toEqual({ purged: ["old"] });
});
it("does nothing when no Trip has expired", async () => {
  tripFindManyMock.mockResolvedValue([]);
  expect(await purgeExpiredDeletedTrips()).toEqual({ purged: [] });
  expect(tripDeleteMock).not.toHaveBeenCalled();
});
it("a Trip deleted 29 days ago is left alone (cutoff is strictly older than 30 days)", async () => {
  // asserted through the where clause: lt cutoff, where cutoff = now - 30d
});
```
Route test: 401 without the secret; with it, calls `purgeExpiredDeletedTrips` and returns `{ purged: n }` JSON.

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** `purgeExpiredDeletedTrips`: `findMany({ where: { deletedAt: { lt: cutoff } }, select: { id, coverImageKey, attachments: { where: { storageKey: { not: null } }, select: { storageKey } } } })`; per Trip: `scheduleBlobDeletion([coverImageKey, ...keys].filter(Boolean))`, then `db.trip.delete`. One Trip failing must not stop the others (try/catch per Trip, `console.error`). Route: `GET` → `isCronAuthorized` → purge → `NextResponse.json({ purged: result.purged.length })`.

- [ ] **Step 4: Run** `npm test && npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cron-auth.ts lib/cron-auth.test.ts lib/trip-purge.ts lib/trip-purge.test.ts app/api/cron .github/workflows/purge-trips-cron.yml docs/DEPLOY.md
git commit -m "feat(trips): a daily cron purges Trips 30 days after deletion, scheduling their blobs for the sweep

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Rate limit on `POST /api/client-error`

**Files:**
- Create: `lib/rate-limit.ts` + `lib/rate-limit.test.ts`
- Modify: `app/api/client-error/route.ts:104-130`

**Interfaces:**
- Produces:
  ```ts
  /** In-memory fixed-window limiter, per process. `allow(key)` → true while under `limit` per `windowMs`. */
  export function createRateLimiter(opts: { limit: number; windowMs: number; now?: () => number }): { allow(key: string): boolean };
  export function clientIp(headers: Headers): string; // first x-forwarded-for entry, else "unknown"
  ```
- Behaviour: the route keeps its "always 204" contract (the module doc explains why a reporting endpoint must never surface failure). Over the limit it returns 204 and skips `reportError`. Limit 10 per 60 s per IP. Document in the route's module comment that this is per-instance, best-effort, on top of ADR 0059's existing bounds.

- [ ] **Step 1: Failing tests** — limiter: 10 allowed, 11th refused, refreshes after the window; distinct keys independent; `clientIp` parses `"1.2.3.4, 10.0.0.1"` → `"1.2.3.4"`. Route test (`app/api/client-error/route.test.ts`, extend): after 10 POSTs from one IP, the 11th returns 204 and `reportError` was called 10 times.

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/rate-limit.ts lib/rate-limit.test.ts app/api/client-error
git commit -m "fix(api): client-error reports are limited to 10 a minute per IP (still always 204)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Cover and Item photo fallbacks

**Files:**
- Modify: `components/trips/cover-photo-image.tsx`
- Modify: `components/trips/trip-cover.tsx:30-70` (`CoverArt`)
- Modify: `components/trip/item-photo-thumb.tsx`
- Test: `components/trips/cover-photo-image.test.tsx` (create), `components/trips/trip-cover.test.tsx` (extend or create), `components/trip/item-photo-thumb.test.tsx` (extend)

**Interfaces:**
- `CoverPhotoImage` (already a Client Component) gains state: `loaded` and `failed`. Renders `null` when failed; otherwise the `Image` with `onLoad={() => setLoaded(true)}`, `onError={() => setFailed(true)}`, `className={cn("object-cover transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0")}`. Add `data-testid="cover-photo"`.
- `CoverArt`: always compute the generated art (`sketchModel` → `CoverRouteSketch`, else `CoverStamp`) as before; when `photo` is set render `<>{generatedArt}<CoverPhotoImage … /></>` so the photo layers over the art (the `fill` Image is already absolutely positioned inside the `relative size-full` wrapper). `caption` stays `null` when a photo exists (the polaroid caption is for the sketch).
- `ItemPhotoThumb`: `failed` state; on error the `<img>` is replaced by `<span aria-label="Photo unavailable" className="flex size-full items-center justify-center bg-muted text-muted-foreground"><ImageIcon className="size-4" aria-hidden /></span>` (lucide `Image as ImageIcon`), the trigger button gets `disabled`, and the dialog does not open.

- [ ] **Step 1: Failing tests**

```tsx
// cover-photo-image.test.tsx
it("starts invisible, shows on load, and unmounts on error", () => {
  const { container, rerender } = render(<CoverPhotoImage url="/api/trips/t/cover?v=1" alt="x" focalX={null} focalY={null} sizes="100px" />);
  const img = container.querySelector("img")!;
  expect(img.className).toMatch(/opacity-0/);
  fireEvent.load(img);
  expect(img.className).toMatch(/opacity-100/);
  fireEvent.error(img);
  expect(container.querySelector("img")).toBeNull();
});
// trip-cover.test.tsx
it("renders the generated art underneath a photo", () => {
  render(<CoverArt {...baseInput} photo={{ url: "/api/trips/t/cover?v=1", focalX: null, focalY: null }} size="hero" />);
  expect(screen.getByTestId("cover-photo")).toBeInTheDocument();
  expect(document.querySelector("[data-cover-sketch], [data-cover-stamp]")).not.toBeNull(); // add these data attrs to CoverRouteSketch/CoverStamp roots if absent
});
// item-photo-thumb.test.tsx
it("falls back to a glyph and disables the lightbox when the photo fails", () => {
  render(<ItemPhotoThumb src="/api/attachments/a" alt="Museum" />);
  fireEvent.error(screen.getByRole("img", { name: "Museum" }));
  expect(screen.getByLabelText("Photo unavailable")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /View Museum photo/ })).toBeDisabled();
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** per Interfaces (note `next/image` in jsdom renders a plain `<img>`; if an existing test mocks `next/image`, follow that mock). **Step 4: Run** `npx vitest run components/trips components/trip/item-photo-thumb && npx tsc --noEmit` — PASS.

- [ ] **Step 5: Commit**

```bash
git add components/trips components/trip/item-photo-thumb.tsx components/trip/item-photo-thumb.test.tsx
git commit -m "feat(covers): a cover fades in over its generated art and falls back to it on error; Item photos fall back to a glyph

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Attachments warm once per device; 200 MB cap; ADR 0043 amendment

**Files:**
- Modify: `lib/offline.ts:19-80` (`WarmAttachment`, `tripOfflinePaths`), `:185-195` (Rule 3a split)
- Modify: `public/sw.js:10-11, 24, 105-107` — `CACHE_VERSION = 'trip-planner-v6'`; attachments → `'cache-first'`, cover stays `'network-first'`
- Modify: `components/offline-warmer.tsx:32-44` — skip paths `caches.match` already answers
- Modify: `app/(app)/trips/[tripId]/layout.tsx:70-73, 104` — select `createdAt`, pass it through
- Modify: `app/(app)/trips/[tripId]/files/page.tsx` — the note when the Trip's total exceeds the cap
- Modify: `docs/adr/0043-…md` — append "Amended 2026-10-02" section
- Test: `lib/offline.test.ts`, `components/offline-warmer.test.tsx`

**Interfaces:**
- `export interface WarmAttachment { url: string; size: number; createdAt?: string | Date }`
- `export const MAX_WARM_TRIP_BYTES = 200 * 1024 * 1024;`
- `tripOfflinePaths` sorts attachments by `createdAt` desc (undefined last), skips any over `MAX_WARM_ATTACHMENT_BYTES`, and stops adding once the running total would exceed `MAX_WARM_TRIP_BYTES` (a file that would cross the line is skipped; later smaller ones may still fit — simplest: skip any file where `total + size > cap`).
- `cacheStrategyFor`: `isAttachmentRoute(url)` → `'cache-first'`; `isCoverRoute(url)` → `'network-first'`.
- Warmer: before `fetch(path, …)`: `if (typeof caches !== "undefined" && (await caches.match(path).catch(() => undefined))) continue;`

- [ ] **Step 1: Failing tests**

`lib/offline.test.ts`:
```ts
it('serves attachments cache-first (an Attachment id never changes content)', () => {
  expect(cacheStrategyFor({ method: 'GET', url: 'https://x/api/attachments/a1', sameOrigin: true })).toBe('cache-first');
});
it('keeps the cover network-first (its ?v= can change)', () => { /* '/api/trips/t/cover?v=1' → 'network-first' */ });
it('warms newest attachments first and stops at 200 MB', () => {
  const MiB = 1024 * 1024;
  const atts = Array.from({ length: 30 }, (_, i) => ({ url: `/api/attachments/a${i}`, size: 10 * MiB, createdAt: new Date(2026, 0, i + 1) }));
  const paths = tripOfflinePaths('eu', null, null, atts).filter((p) => p.startsWith('/api/attachments/'));
  expect(paths).toHaveLength(20);
  expect(paths[0]).toBe('/api/attachments/a29');
  expect(paths).not.toContain('/api/attachments/a0');
});
it('at exactly 200 MB nothing is skipped', () => { /* 20 × 10 MiB → 20 paths */ });
```
Update the existing `'caches attachment bytes network-first'` test to the new strategy. `components/offline-warmer.test.tsx`: stub `globalThis.caches = { match: vi.fn(async (p) => p === "/cached" ? new Response("") : undefined) }`; render with paths `["/cached", "/fresh"]`; expect `fetch` called once, with `/fresh`.

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**, mirroring the `lib/offline.ts` change in `public/sw.js` by hand (plain JS, no imports) and updating the sw.js header comment lines 10–11. Files page note: compute `total = attachments.reduce((n, a) => n + a.size, 0)` from the rows it already loads; when `total > MAX_WARM_TRIP_BYTES` render `<p className="text-sm text-muted-foreground">Files from the last 200 MB are kept on this device for offline use.</p>` under the header.

ADR 0043 amendment text (append):
```md
## Amended 2026-10-02 — warm once per device; 200 MB per Trip

The warmer fetched every Attachment with `cache: "no-store"` on every Trip open and
Rule 3a was network-first, so a Trip's whole file set re-downloaded each visit — a
membership query per file on Neon and a function invocation per file on Vercel, for
bytes the device already held. Two changes (spec 2026-10-02 §F):

- `/api/attachments/<id>` is now **cache-first** (`CACHE_VERSION` → `trip-planner-v6`).
  An Attachment's id never changes content — a replaced file is a new id — so a cached
  copy cannot be stale. The cover keeps network-first because its `?v=` can change.
  Sign-out still purges the cache. Accepted: a Traveller removed from a Trip keeps the
  files already on that device until they sign out, as if they had saved them.
- The warmer skips any path `caches.match` already answers, and `tripOfflinePaths` warms
  Attachments newest-first up to `MAX_WARM_TRIP_BYTES` (200 MB) per Trip. Files shows a
  one-line note only when a Trip exceeds that.
```

- [ ] **Step 4: Run** `npm test && npx tsc --noEmit` — PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/offline.ts lib/offline.test.ts public/sw.js components/offline-warmer.tsx components/offline-warmer.test.tsx "app/(app)/trips/[tripId]/layout.tsx" "app/(app)/trips/[tripId]/files/page.tsx" docs/adr/0043-attachments-warm-offline-through-the-authenticated-serve-route.md
git commit -m "feat(offline): attachments warm once per device (cache-first, skip-if-cached), newest-first up to 200 MB a Trip

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Docs — restore runbook, spec status, DEPLOY notes

**Files:**
- Create: `docs/restore-runbook.md`
- Modify: `docs/specs/2026-10-02-share-width-storage-quota-trip-trash.md` — Status line → "built on the branch (plan docs/superpowers/plans/2026-10-02-share-width-storage-quota-trip-trash.md); awaiting merge and deploy." Add under §B a one-line note: "Built as a web-push to Admin Devices via `lib/admin-notify` — the codebase's operator channel — rather than email; covers and profile photos are one-per-owner and so are not counted, only Attachments." Under §C: "The purge runs from `/api/cron/purge-trips` (daily GitHub Action, same `CRON_SECRET`) rather than inside `sweep:blobs`." Under §D: "The error endpoint keeps answering 204 over the limit and drops the write; it never returns 429, honouring its documented never-fail contract."
- Modify: `docs/DEPLOY.md` — under the R2 section, a "Cost guardrails" paragraph: the 500 MB / 8 GB quotas, the operator push, and the manual step: set a Cloudflare billing notification on R2 (Dashboard → Notifications → Add → Billing).

**Restore runbook contents** (write it fully — this is a procedure for Cam):
1. Prerequisites: `pg_restore`/`psql` locally, the Neon connection string for a *scratch branch*, GitHub CLI.
2. Fetch the artifact: `gh run list --workflow db-backup.yml --limit 5`, `gh run download <run-id> -n <artifact-name>` (read `.github/workflows/db-backup.yml` for the artifact name and dump format and quote them exactly).
3. Restore into a Neon branch, never production: create a branch in the Neon console from the current state, then `pg_restore --clean --no-owner -d "$SCRATCH_URL" <dump>`.
4. Find the Trip: `SELECT id, name, "deletedAt" FROM "Trip" WHERE name ILIKE '%…%';`
5. Prefer **Restore** in the app (Recently deleted) when the Trip still exists with `deletedAt` set — the runbook is only for a Trip already purged or lost another way.
6. Copy one Trip across: the ordered list of tables with a `tripId` FK (from `prisma/schema.prisma`: Trip, Fork, TripMember, Invite, Chapter, Stop, Transport, Accommodation, Item, Cost, ExchangeRate, Note, Vote, ChecklistItem, Attachment, Reminder, ShareLink, CalendarFeed, JournalEntry, Activity, DigestPreference, DigestDispatch, TripSlug) using `\copy (SELECT * FROM "Stop" WHERE "tripId" = '…') TO 'stop.csv' CSV HEADER` on the scratch branch and `\copy "Stop" FROM 'stop.csv' CSV HEADER` on production, parents before children; note `TripSlug` must come last and may conflict if the slug was reused.
7. Blobs: Attachments and the cover point at R2 keys; if the 35-day blob sweep has run since, the files are gone — say so plainly.
8. Verify in the app, then delete the Neon scratch branch.

- [ ] **Step 1: Write the three docs.** **Step 2:** `npm test && npx tsc --noEmit && npm run lint` — PASS (docs only, but the final gate for the branch).

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs: restore runbook; spec status and build notes; DEPLOY cost guardrails and the Cloudflare billing alert

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
