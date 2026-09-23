# Account, Devices and the Digest rename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give TEEPEE an account-level **Account** surface that tells the truth about a Traveller's **Device**s — so a Device that has quietly lost permission is visible and recoverable instead of silently swallowing every Digest.

**Architecture:** No new data *model* — `PushSubscription` is already keyed on `userId` and `DigestPreference` on `(userId, tripId)`. What is new is (a) two columns that let a Device be named and aged (`label`, `lastSeenAt`), (b) a reconcile server action the browser calls on every visit so the Device itself answers "am I still alive, and what zone am I in?", and (c) a `/account` page that renders the result. The Trip Settings panel keeps the per-trip switch and the test send, and links to `/account` when the *Device* is what's wrong.

**Tech Stack:** Next.js 15 App Router (server components + server actions), Prisma 7 with `@prisma/adapter-pg`, Postgres (Neon), Vitest + Testing Library (jsdom), Tailwind, web-push.

## Global Constraints

- **Glossary is binding.** `CONTEXT.md` defines **Digest** (the push), **Reminder** (a Traveller's dated note), **Alarm** (fired by the Traveller's calendar app), **notification** (the Activity bell's unread count), **Device** and **Account**. User-facing copy MUST use these words and no others. The word "notification" must not appear in any Digest-related copy.
- **`DEVICE_STALE_AFTER_DAYS = 14`** — a Device unseen for longer is flagged, never deleted.
- **`DEVICE_TOUCH_AFTER_MS = 6 * 60 * 60 * 1000`** — reconcile writes `lastSeenAt` only when the stored value is older than this.
- **Device labels come from a fixed allow-list only:** `"iPhone" | "iPad" | "Mac" | "Android" | "Windows" | "Linux"`, or `null`. Never any other string, never re-derived after the row is created.
- **A Device is never auto-deleted.** Not by age, not by the dispatcher. Only a 404/410 from the push service (existing behaviour in `lib/digest-dispatch.ts`) or an explicit Remove deletes a row.
- **No global mute.** The per-trip `DigestPreference` switch is the only control that silences a Digest. Do not add an account-level enabled flag.
- **`[+ Enable on this device]` renders unconditionally** whenever this browser is not a known Device. It must never be hidden because *some other* Device exists — that is the defect this plan exists to fix.
- **Tests run with a mocked `@/lib/db`.** Follow the `vi.hoisted()` + `vi.mock("@/lib/db", …)` pattern in `server/actions/digest.test.ts`. No test may touch a real database.
- **Never commit to `main`.** All work lands on the current branch `fix/digest-delivery-diagnosis`.
- Run `npm test` before every commit. Run `npx tsc --noEmit` before every commit that changes types.

---

### Task 1: ADR 0048 and the glossary

Documentation only — no code, no tests. It goes first because every later task's copy and naming is checked against it.

**Files:**
- Create: `docs/adr/0048-devices-are-account-level-and-never-silently-dropped.md`
- Modify: `CONTEXT.md` (already edited in the grilling session — verify, do not re-edit)
- Modify: `docs/follow-ups/2026-09-17-reminders-follow-ups.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the canonical wording later tasks quote — the terms **Account** and **Device**, and the two decisions (no global mute; never auto-delete).

- [ ] **Step 1: Verify the CONTEXT.md edits are present**

Run: `grep -n "^\*\*Account\*\*:\|^\*\*Device\*\*:" CONTEXT.md`

Expected: two hits. Also confirm the **Digest** entry now reads "from either the Trip's Settings or **Account**" and "in the timezone the **Device** last reported". If any is missing, stop and report — do not invent replacement wording.

- [ ] **Step 2: Write ADR 0048**

Create `docs/adr/0048-devices-are-account-level-and-never-silently-dropped.md` following the shape of `docs/adr/0047-calendar-alarms-fire-on-the-clock-one-daily-digest-carries-the-rest.md` (`# 0048 — <title>`, then `## Status`, `## Context`, `## Decision`, `## Considered Options`, `## Consequences`).

It must record, at minimum:

- **Context:** on 2026-09-17 a test Digest reported `sent: 1`; `web-push` received `201` with an `apns-id` from `web.push.apple.com`; nothing arrived. The iPhone had no entry under iOS Settings → Notifications — the web app had lost permission while the push token stayed valid. Every observable layer reported success. Recovery was impossible from inside the app because `EnableNotifications` rendered only when zero Devices existed (`components/trip/settings/reminders-panel.tsx`), so a database write was required to restore the button.
- **Decision 1 — a Device is account-level, and `Account` is where it lives.** Rendering an account-wide fact inside one Trip's Settings is what made the failure unreadable.
- **Decision 2 — the account layer is a capability, not a setting.** No global mute. A third mute layer creates a state where the per-Trip switch reads ON and nothing arrives, which is the same class of silent failure this ADR is a response to.
- **Decision 3 — only the Device can report its own health,** so it does, on every visit; and a Device that stops reporting is flagged `unseen since`, never deleted. Success from a push service proves nothing: Apple accepted a push for a dead subscription and said 201.
- **Considered options:** a global on/off switch (rejected — see Decision 2); tombstoning removed endpoints so self-heal cannot resurrect them (rejected — a new table plus a rule for lifting a tombstone, to stop a Device that genuinely still wants Digests from re-registering); auto-expiring stale Devices (rejected — indistinguishable from a laptop nobody opened for a month).
- **Consequences:** `Remove` on a Device other than the current one deletes the row but cannot revoke permission, so that Device re-registers on its next visit; the copy says so. `PushTimezoneSync` moves to the root authenticated layout and becomes the general Device reconcile. `unsubscribeFromPush` finally gets a caller. The service worker still has no `pushsubscriptionchange` handler (follow-up item 1's other half), so an endpoint rotated while the app is closed is still only healed on the next visit.

- [ ] **Step 3: Update the follow-ups doc**

In `docs/follow-ups/2026-09-17-reminders-follow-ups.md`, mark items **3** (the naming collision), **4** (timezone refresh only on trip screens) and **5** (the missing push icon) as addressed by ADR 0048 and this plan, and note that item **1** is half-addressed — `unsubscribeFromPush` now has a caller, the `pushsubscriptionchange` handler still does not exist. Leave items 2, 6, 7 and 8 exactly as they are.

- [ ] **Step 4: Commit**

```bash
git add CONTEXT.md docs/adr/0048-devices-are-account-level-and-never-silently-dropped.md docs/follow-ups/2026-09-17-reminders-follow-ups.md
git commit -m "docs(adr): 0048 — devices are account-level and never silently dropped"
```

---

### Task 2: Pure device helpers

Two pure modules with no I/O. They exist separately from the server action so the label allow-list and the staleness arithmetic can be tested without a database.

**Files:**
- Create: `lib/device-label.ts`
- Create: `lib/device-label.test.ts`
- Create: `lib/devices.ts`
- Create: `lib/devices.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type DeviceLabel = "iPhone" | "iPad" | "Mac" | "Android" | "Windows" | "Linux"`
  - `function deviceLabelFromUserAgent(ua: string | null | undefined): DeviceLabel | null`
  - `const DEVICE_STALE_AFTER_DAYS: number` (14)
  - `const DEVICE_TOUCH_AFTER_MS: number` (21_600_000)
  - `function isDeviceStale(lastSeenAt: Date, now: Date): boolean`
  - `function needsTouch(lastSeenAt: Date, now: Date): boolean`
  - `function formatLastSeen(lastSeenAt: Date, now: Date): string`

- [ ] **Step 1: Write the failing test for the label allow-list**

Create `lib/device-label.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deviceLabelFromUserAgent } from "@/lib/device-label";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const LINUX =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

describe("deviceLabelFromUserAgent", () => {
  it("names the Apple mobile devices", () => {
    expect(deviceLabelFromUserAgent(IPHONE)).toBe("iPhone");
    expect(deviceLabelFromUserAgent(IPAD)).toBe("iPad");
  });

  it("names a Mac", () => {
    expect(deviceLabelFromUserAgent(MAC)).toBe("Mac");
  });

  // Android carries "Linux" in its UA string, so order of checks is the whole
  // test: a naive Linux check first would label every phone "Linux".
  it("prefers Android over the Linux its UA also claims", () => {
    expect(deviceLabelFromUserAgent(ANDROID)).toBe("Android");
  });

  it("names the desktop platforms", () => {
    expect(deviceLabelFromUserAgent(WINDOWS)).toBe("Windows");
    expect(deviceLabelFromUserAgent(LINUX)).toBe("Linux");
  });

  it("returns null rather than guessing", () => {
    expect(deviceLabelFromUserAgent(null)).toBeNull();
    expect(deviceLabelFromUserAgent(undefined)).toBeNull();
    expect(deviceLabelFromUserAgent("")).toBeNull();
    expect(deviceLabelFromUserAgent("curl/8.4.0")).toBeNull();
  });

  // The value is rendered straight into the device list and stored forever.
  // Nothing outside the allow-list may ever reach the database.
  it("only ever returns a value from the allow-list", () => {
    const allowed = ["iPhone", "iPad", "Mac", "Android", "Windows", "Linux", null];
    for (const ua of [IPHONE, IPAD, MAC, ANDROID, WINDOWS, LINUX, "nonsense", ""]) {
      expect(allowed).toContain(deviceLabelFromUserAgent(ua));
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/device-label.test.ts`
Expected: FAIL — cannot resolve `@/lib/device-label`.

- [ ] **Step 3: Implement the label helper**

Create `lib/device-label.ts`:

```ts
/**
 * lib/device-label.ts — a coarse, fixed name for a **Device** (CONTEXT.md).
 *
 * Captured ONCE, when a Device is first enabled, purely so a Traveller can tell
 * their phone from their laptop in the Account device list. It is never
 * re-derived and never used for a decision — a user agent is a string a browser
 * chose to send, and the moment anything depends on it we have a bug waiting.
 *
 * The allow-list is closed on purpose: this value is stored forever and
 * rendered directly, so an unrecognised agent gets `null` ("A device") rather
 * than a fragment of somebody's UA string.
 */
export type DeviceLabel =
  | "iPhone"
  | "iPad"
  | "Mac"
  | "Android"
  | "Windows"
  | "Linux";

export function deviceLabelFromUserAgent(
  ua: string | null | undefined,
): DeviceLabel | null {
  if (!ua) return null;

  // Order matters. Android's UA contains "Linux", and an iPad masquerading as
  // a Mac contains "Mac OS X" — so the most specific claim is tested first.
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux|X11/.test(ua)) return "Linux";

  return null;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run lib/device-label.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing test for the staleness arithmetic**

Create `lib/devices.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEVICE_STALE_AFTER_DAYS,
  DEVICE_TOUCH_AFTER_MS,
  formatLastSeen,
  isDeviceStale,
  needsTouch,
} from "@/lib/devices";

const NOW = new Date("2026-09-17T10:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000);

describe("isDeviceStale", () => {
  it("is false for a device seen today", () => {
    expect(isDeviceStale(NOW, NOW)).toBe(false);
  });

  it("is false right up to the threshold", () => {
    expect(isDeviceStale(daysAgo(DEVICE_STALE_AFTER_DAYS - 1), NOW)).toBe(false);
  });

  it("is true past the threshold", () => {
    expect(isDeviceStale(daysAgo(DEVICE_STALE_AFTER_DAYS + 1), NOW)).toBe(true);
  });

  // A clock skew between browser and server must not invent staleness.
  it("is false for a future timestamp", () => {
    expect(isDeviceStale(new Date(NOW.getTime() + 60_000), NOW)).toBe(false);
  });
});

describe("needsTouch", () => {
  it("is false for a device seen within the window", () => {
    expect(needsTouch(hoursAgo(1), NOW)).toBe(false);
  });

  it("is true once the window has passed", () => {
    expect(needsTouch(new Date(NOW.getTime() - DEVICE_TOUCH_AFTER_MS - 1), NOW)).toBe(true);
  });
});

describe("formatLastSeen", () => {
  it("says just now inside the hour", () => {
    expect(formatLastSeen(hoursAgo(0), NOW)).toBe("seen just now");
  });

  it("counts hours, then days", () => {
    expect(formatLastSeen(hoursAgo(3), NOW)).toBe("seen 3 hours ago");
    expect(formatLastSeen(daysAgo(1), NOW)).toBe("seen 1 day ago");
    expect(formatLastSeen(daysAgo(4), NOW)).toBe("seen 4 days ago");
  });

  // Past the threshold the wording changes from a reassurance to a warning:
  // "seen 20 days ago" reads as fine, "unseen since" reads as a question.
  it("switches to a date once stale", () => {
    expect(formatLastSeen(daysAgo(20), NOW)).toBe("unseen since 28 Aug 2026");
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run lib/devices.test.ts`
Expected: FAIL — cannot resolve `@/lib/devices`.

- [ ] **Step 7: Implement the staleness helpers**

Create `lib/devices.ts`:

```ts
/**
 * lib/devices.ts — how long a **Device** (CONTEXT.md) may stay quiet.
 *
 * Pure arithmetic, no I/O, no clock of its own: `now` always arrives as an
 * argument so a test can put it anywhere. Every threshold that decides what a
 * Traveller is told about a Device lives here and nowhere else.
 */

/**
 * A Device unseen for longer than this is FLAGGED — never deleted (ADR 0048).
 * Two weeks is the compromise: shorter cries wolf over a laptop nobody opened
 * for a fortnight, longer is useless for catching a dead Device before it
 * swallows a trip's worth of Digests.
 */
export const DEVICE_STALE_AFTER_DAYS = 14;

/**
 * Reconcile touches `lastSeenAt` only when the stored value is older than
 * this. Every authenticated page already wakes Neon for the session, so the
 * read is free; this keeps the WRITE down to a handful a day per Device
 * (ADR 0047 denominates everything in CU-hours).
 */
export const DEVICE_TOUCH_AFTER_MS = 6 * 60 * 60 * 1000;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Whole days from `lastSeenAt` to `now`, never negative (clocks disagree). */
function daysSince(lastSeenAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - lastSeenAt.getTime()) / DAY_MS));
}

export function isDeviceStale(lastSeenAt: Date, now: Date): boolean {
  return daysSince(lastSeenAt, now) > DEVICE_STALE_AFTER_DAYS;
}

export function needsTouch(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() > DEVICE_TOUCH_AFTER_MS;
}

/**
 * How the device list says when it last heard from a Device.
 *
 * Deliberately changes register at the staleness threshold: a relative age
 * reads as reassurance ("seen 4 days ago" — fine), an absolute date reads as a
 * question ("unseen since 28 Aug 2026" — is that thing still alive?).
 */
export function formatLastSeen(lastSeenAt: Date, now: Date): string {
  if (isDeviceStale(lastSeenAt, now)) {
    return `unseen since ${lastSeenAt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  }

  const days = daysSince(lastSeenAt, now);
  if (days >= 1) return `seen ${days} ${days === 1 ? "day" : "days"} ago`;

  const hours = Math.max(0, Math.floor((now.getTime() - lastSeenAt.getTime()) / HOUR_MS));
  if (hours >= 1) return `seen ${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  return "seen just now";
}
```

- [ ] **Step 8: Run both test files and watch them pass**

Run: `npx vitest run lib/devices.test.ts lib/device-label.test.ts`
Expected: PASS, 12 tests total.

- [ ] **Step 9: Commit**

```bash
git add lib/device-label.ts lib/device-label.test.ts lib/devices.ts lib/devices.test.ts
git commit -m "feat(devices): coarse device labels and staleness arithmetic"
```

---

### Task 3: Schema — `label` and `lastSeenAt`

**Files:**
- Modify: `prisma/schema.prisma:561-573`
- Create: `prisma/migrations/20260917000000_device_label_and_last_seen/migration.sql`
- Create: `prisma/device-columns-migration.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PushSubscription.label: String?` and `PushSubscription.lastSeenAt: DateTime` (non-null, defaulted) for every later task.

- [ ] **Step 1: Write the failing migration test**

Model it on the existing `prisma/digest-and-alarms-migration.test.ts` (read that file first for the house pattern). Create `prisma/device-columns-migration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = join(
  __dirname,
  "migrations/20260917000000_device_label_and_last_seen/migration.sql",
);
const SCHEMA = join(__dirname, "schema.prisma");

describe("device columns migration", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const schema = readFileSync(SCHEMA, "utf8");

  it("adds both columns", () => {
    expect(sql).toMatch(/ALTER TABLE "PushSubscription" ADD COLUMN "label" TEXT/);
    expect(sql).toMatch(/ALTER TABLE "PushSubscription" ADD COLUMN "lastSeenAt"/);
  });

  // Existing rows must NOT arrive already stale. A device subscribed
  // yesterday would otherwise be flagged "unseen since" on the first render
  // after deploy, which is exactly the false alarm the threshold exists to
  // avoid.
  it("backfills lastSeenAt from createdAt before making it NOT NULL", () => {
    const backfill = sql.indexOf('SET "lastSeenAt" = "createdAt"');
    const notNull = sql.indexOf('ALTER COLUMN "lastSeenAt" SET NOT NULL');
    expect(backfill).toBeGreaterThan(-1);
    expect(notNull).toBeGreaterThan(-1);
    expect(backfill).toBeLessThan(notNull);
  });

  it("never deletes a subscription row", () => {
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"PushSubscription"/i);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
  });

  it("is reflected in schema.prisma", () => {
    const model = schema.slice(
      schema.indexOf("model PushSubscription"),
      schema.indexOf("model JournalEntry"),
    );
    expect(model).toMatch(/label\s+String\?/);
    expect(model).toMatch(/lastSeenAt\s+DateTime\s+@default\(now\(\)\)/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run prisma/device-columns-migration.test.ts`
Expected: FAIL — `ENOENT` on the migration file.

- [ ] **Step 3: Write the migration**

Create `prisma/migrations/20260917000000_device_label_and_last_seen/migration.sql`:

```sql
-- A Device gains a name and an age (ADR 0048).
--
-- `label` is a coarse, fixed string captured once when the Device is enabled
-- (lib/device-label.ts) so a Traveller can tell their phone from their laptop.
-- Nullable forever: an unrecognised user agent gets no label rather than a
-- guess, and every row that exists before this migration has none.
--
-- `lastSeenAt` is the load-bearing one. It is stamped by the Device's OWN
-- browser on visit, so a Device that loses notification permission stops
-- answering and its row visibly goes quiet — the only signal available, since
-- a push service reports success for a subscription whose web app is gone.
--
-- Order is load-bearing: the column is added nullable, backfilled from
-- `createdAt`, and only then made NOT NULL. Defaulting straight to now() would
-- claim every existing Device had just checked in, and backfilling to the
-- epoch would flag every one of them as stale on the first render after
-- deploy. `createdAt` is the last moment we actually know the Device was real.
ALTER TABLE "PushSubscription" ADD COLUMN "label" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
UPDATE "PushSubscription" SET "lastSeenAt" = "createdAt" WHERE "lastSeenAt" IS NULL;
ALTER TABLE "PushSubscription" ALTER COLUMN "lastSeenAt" SET NOT NULL;
ALTER TABLE "PushSubscription" ALTER COLUMN "lastSeenAt" SET DEFAULT CURRENT_TIMESTAMP;
```

- [ ] **Step 4: Update the Prisma model**

In `prisma/schema.prisma`, replace the `PushSubscription` model body (currently lines 561-573) with:

```prisma
model PushSubscription {
  id       String  @id @default(cuid())
  userId   String
  endpoint String  @unique
  p256dh   String
  auth     String
  timezone String? // IANA zone, re-reported by the Device on every visit (ADR 0047)
  label    String? // Coarse Device name from lib/device-label.ts; set once (ADR 0048)

  createdAt DateTime @default(now())
  // Stamped by this Device's own browser on visit. A Device that loses
  // permission stops reporting, which is the ONLY way TEEPEE can notice —
  // the push service reports success either way (ADR 0048).
  lastSeenAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

- [ ] **Step 5: Regenerate the client and verify**

Run: `npx prisma generate && npx vitest run prisma/device-columns-migration.test.ts && npx tsc --noEmit`
Expected: generate succeeds; 4 tests PASS; `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260917000000_device_label_and_last_seen/migration.sql prisma/device-columns-migration.test.ts
git commit -m "feat(devices): add label and lastSeenAt to PushSubscription"
```

---

### Task 4: Device server actions

**Files:**
- Create: `server/actions/devices.ts`
- Create: `server/actions/devices.test.ts`
- Modify: `server/actions/push.ts` (accept `label` on `subscribeToPush`)

**Interfaces:**
- Consumes: `deviceLabelFromUserAgent`, `isDeviceStale`, `needsTouch` (Task 2); `PushSubscription.label`/`lastSeenAt` (Task 3); `requireUser` from `@/lib/guards`.
- Produces — later tasks depend on these exact names and shapes:

```ts
export interface DeviceSummary {
  id: string;
  label: string | null;
  timezone: string | null;
  subscribedAt: Date;
  lastSeenAt: Date;
  /** True for the Device whose endpoint the caller passed in. */
  isThisDevice: boolean;
  stale: boolean;
}

export interface ReconcileDeviceInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  timezone?: string;
  userAgent?: string;
}

export type ReconcileDeviceResult =
  /** `healed` means the row was missing and has just been recreated. */
  { known: boolean; healed: boolean };

export async function reconcileDevice(input: ReconcileDeviceInput): Promise<ReconcileDeviceResult>;
export async function listDevices(currentEndpoint: string | null): Promise<DeviceSummary[]>;
export async function removeDeviceById(id: string): Promise<{ ok: true } | { ok: false; error: string }>;
```

**Do not add an endpoint-scoped remove.** `unsubscribeFromPush(endpoint)` in `server/actions/push.ts` already is one, already scopes the delete to the caller, and has never had a caller — Task 6 gives it one. A second function doing the same delete by a different key is the duplication this note exists to prevent.

- [ ] **Step 1: Write the failing tests**

Create `server/actions/devices.test.ts`. Follow the `vi.hoisted()` mock style from `server/actions/digest.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireUserMock,
  findManyMock,
  findUniqueMock,
  createMock,
  updateMock,
  deleteManyMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn().mockResolvedValue({ id: "user-1" }),
  findManyMock: vi.fn(),
  findUniqueMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteManyMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/db", () => ({
  db: {
    pushSubscription: {
      findMany: findManyMock,
      findUnique: findUniqueMock,
      create: createMock,
      update: updateMock,
      deleteMany: deleteManyMock,
    },
  },
}));

import { listDevices, reconcileDevice, removeDeviceById } from "@/server/actions/devices";

const NOW = new Date("2026-09-17T10:00:00.000Z");
const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "sub-1",
  userId: "user-1",
  endpoint: "https://web.push.apple.com/AAA",
  p256dh: "p",
  auth: "a",
  timezone: "Australia/Brisbane",
  label: "iPhone",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  lastSeenAt: new Date("2026-09-17T09:59:00.000Z"),
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  // Clear queued once-values too: a leftover mockResolvedValueOnce survives
  // clearAllMocks and makes the NEXT test order-dependent (see follow-up 8).
  findUniqueMock.mockReset();
  findManyMock.mockReset();
  requireUserMock.mockResolvedValue({ id: "user-1" });
});

describe("reconcileDevice", () => {
  it("checks the user first", async () => {
    findUniqueMock.mockResolvedValue(row());
    await reconcileDevice({ endpoint: "https://web.push.apple.com/AAA", keys: { p256dh: "p", auth: "a" } });
    expect(requireUserMock).toHaveBeenCalled();
  });

  it("reports a known device without writing when nothing changed", async () => {
    findUniqueMock.mockResolvedValue(row());
    const result = await reconcileDevice({
      endpoint: "https://web.push.apple.com/AAA",
      keys: { p256dh: "p", auth: "a" },
      timezone: "Australia/Brisbane",
    });
    expect(result).toEqual({ known: true, healed: false });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("writes when the timezone has moved", async () => {
    findUniqueMock.mockResolvedValue(row());
    await reconcileDevice({
      endpoint: "https://web.push.apple.com/AAA",
      keys: { p256dh: "p", auth: "a" },
      timezone: "Europe/Vienna",
    });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ timezone: "Europe/Vienna" }),
      }),
    );
  });

  it("writes when lastSeenAt has gone stale enough to touch", async () => {
    findUniqueMock.mockResolvedValue(
      row({ lastSeenAt: new Date("2026-09-17T00:00:00.000Z") }),
    );
    await reconcileDevice({
      endpoint: "https://web.push.apple.com/AAA",
      keys: { p256dh: "p", auth: "a" },
      timezone: "Australia/Brisbane",
    });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastSeenAt: NOW }),
      }),
    );
  });

  // This is the self-heal: the browser holds a live subscription the server
  // has never seen (or has lost). Recreating it silently is the whole point —
  // the Traveller already granted permission on this Device.
  it("recreates a missing row and reports healed", async () => {
    findUniqueMock.mockResolvedValue(null);
    const result = await reconcileDevice({
      endpoint: "https://web.push.apple.com/BBB",
      keys: { p256dh: "p2", auth: "a2" },
      timezone: "Australia/Brisbane",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15",
    });
    expect(result).toEqual({ known: true, healed: true });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          endpoint: "https://web.push.apple.com/BBB",
          label: "iPhone",
          timezone: "Australia/Brisbane",
        }),
      }),
    );
  });

  // A row belonging to somebody else must never be silently reassigned by
  // whoever happens to be signed in on that machine.
  it("refuses to adopt another user's row", async () => {
    findUniqueMock.mockResolvedValue(row({ userId: "user-2" }));
    const result = await reconcileDevice({
      endpoint: "https://web.push.apple.com/AAA",
      keys: { p256dh: "p", auth: "a" },
    });
    expect(result).toEqual({ known: false, healed: false });
    expect(updateMock).not.toHaveBeenCalled();
  });

  // The label is a one-time capture. Re-deriving it on every visit would let a
  // browser update quietly rewrite history.
  it("never overwrites an existing label", async () => {
    findUniqueMock.mockResolvedValue(row({ timezone: "Europe/Vienna" }));
    await reconcileDevice({
      endpoint: "https://web.push.apple.com/AAA",
      keys: { p256dh: "p", auth: "a" },
      timezone: "Australia/Brisbane",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });
    const data = updateMock.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("label");
  });
});

describe("listDevices", () => {
  it("marks the caller's own device and flags stale ones", async () => {
    findManyMock.mockResolvedValue([
      row(),
      row({
        id: "sub-2",
        endpoint: "https://web.push.apple.com/OLD",
        label: "Mac",
        lastSeenAt: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ]);

    const devices = await listDevices("https://web.push.apple.com/AAA");

    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({ id: "sub-1", isThisDevice: true, stale: false });
    expect(devices[1]).toMatchObject({ id: "sub-2", isThisDevice: false, stale: true });
  });

  // The endpoint is a capability URL. It may travel to the browser that owns
  // it and nowhere else, so it must not appear in a list rendered to a page.
  it("never returns endpoints or keys", async () => {
    findManyMock.mockResolvedValue([row()]);
    const devices = await listDevices(null);
    expect(devices[0]).not.toHaveProperty("endpoint");
    expect(devices[0]).not.toHaveProperty("p256dh");
    expect(devices[0]).not.toHaveProperty("auth");
  });

  it("marks nothing as this device when the caller has no subscription", async () => {
    findManyMock.mockResolvedValue([row()]);
    const devices = await listDevices(null);
    expect(devices[0].isThisDevice).toBe(false);
  });
});

describe("removeDeviceById", () => {
  // Scoped to the caller. One Traveller must never be able to remove the
  // other's device by guessing an id.
  it("deletes only the caller's own row", async () => {
    deleteManyMock.mockResolvedValue({ count: 1 });
    const result = await removeDeviceById("sub-1");
    expect(result).toEqual({ ok: true });
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { id: "sub-1", userId: "user-1" },
    });
  });

  it("reports failure rather than throwing into the error boundary", async () => {
    deleteManyMock.mockRejectedValue(new Error("db down"));
    const result = await removeDeviceById("sub-1");
    expect(result).toEqual({ ok: false, error: "Couldn't remove that device." });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run server/actions/devices.test.ts`
Expected: FAIL — cannot resolve `@/server/actions/devices`.

- [ ] **Step 3: Implement the actions**

Create `server/actions/devices.ts`:

```ts
"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { deviceLabelFromUserAgent } from "@/lib/device-label";
import { isDeviceStale, needsTouch } from "@/lib/devices";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * A **Device** as the Account list renders it.
 *
 * Deliberately carries NO endpoint and no keys. The endpoint is a capability
 * URL — anyone holding it can push to that Device — and it belongs only to the
 * browser that owns it. `isThisDevice` is resolved on the server precisely so
 * the page never has to receive the set of endpoints in order to compare them.
 */
export interface DeviceSummary {
  id: string;
  label: string | null;
  timezone: string | null;
  subscribedAt: Date;
  lastSeenAt: Date;
  isThisDevice: boolean;
  stale: boolean;
}

export interface ReconcileDeviceInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  timezone?: string;
  userAgent?: string;
}

export interface ReconcileDeviceResult {
  known: boolean;
  healed: boolean;
}

export type RemoveDeviceResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * "I am here, I still have permission, and this is my timezone."
 *
 * Called on every authenticated page load by the browser that owns the
 * subscription (components/account/device-sync.tsx). It is the ONLY evidence
 * TEEPEE ever gets that a Device is alive: a push service accepts and reports
 * success for a subscription whose web app has been deleted, so silence from
 * the Device is the single available signal (ADR 0048).
 *
 * Reads always, writes rarely — only when the timezone moved, the row was
 * missing, or `lastSeenAt` has aged past `DEVICE_TOUCH_AFTER_MS`. Any
 * signed-in request has already woken the database for the session, so the
 * read costs nothing extra; the write is what ADR 0047's CU-hour budget cares
 * about.
 */
export async function reconcileDevice(
  input: ReconcileDeviceInput,
): Promise<ReconcileDeviceResult> {
  const user = await requireUser();
  const now = new Date();

  const existing = await db.pushSubscription.findUnique({
    where: { endpoint: input.endpoint },
  });

  // Self-heal. The browser holds a live subscription we have no record of —
  // the Traveller already granted permission on this Device, so recreating the
  // row is restoring a fact, not subscribing somebody without asking.
  if (!existing) {
    await db.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        label: deviceLabelFromUserAgent(input.userAgent),
        lastSeenAt: now,
        ...(input.timezone ? { timezone: input.timezone } : {}),
      },
    });
    return { known: true, healed: true };
  }

  // Someone else's row on this machine — a shared computer, or an account
  // switch. Reassigning it would hand one person's Digest to another.
  if (existing.userId !== user.id) {
    return { known: false, healed: false };
  }

  const zoneMoved = !!input.timezone && input.timezone !== existing.timezone;
  const shouldTouch = needsTouch(existing.lastSeenAt, now);

  if (zoneMoved || shouldTouch) {
    await db.pushSubscription.update({
      where: { endpoint: input.endpoint },
      // `label` is absent on purpose: it is captured once, when the Device is
      // enabled, and never re-derived. A browser update must not be able to
      // quietly rename a Device that has been in the list for months.
      data: {
        lastSeenAt: now,
        ...(zoneMoved ? { timezone: input.timezone } : {}),
      },
    });
  }

  return { known: true, healed: false };
}

/**
 * Every Device this Traveller has, newest first.
 *
 * `currentEndpoint` is the caller's own live subscription endpoint, or null
 * when this browser holds none — which is itself the answer the Account page
 * most needs, since a Traveller with Devices on file but none of them *here*
 * is exactly the state that made a dead phone look healthy.
 */
export async function listDevices(
  currentEndpoint: string | null,
): Promise<DeviceSummary[]> {
  const user = await requireUser();
  const now = new Date();

  const rows = await db.pushSubscription.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    timezone: r.timezone,
    subscribedAt: r.createdAt,
    lastSeenAt: r.lastSeenAt,
    isThisDevice: !!currentEndpoint && r.endpoint === currentEndpoint,
    stale: isDeviceStale(r.lastSeenAt, now),
  }));
}

/**
 * Forget a Device.
 *
 * Takes a row id, not an endpoint: `DeviceSummary` deliberately carries no
 * endpoint, and this is the action for removing a Device that is NOT the one
 * you are holding. Scoped to the caller's own rows, so one Traveller can never
 * remove the other's.
 *
 * This only deletes TEEPEE's record — no server can revoke a browser's
 * permission remotely, so a Device that still holds one re-registers itself
 * through `reconcileDevice` the next time it is opened, and the UI says so out
 * loud (ADR 0048). Removing the CURRENT Device is a different job and takes a
 * different path: `subscription.unsubscribe()` in the browser first, then
 * `unsubscribeFromPush(endpoint)`.
 */
export async function removeDeviceById(id: string): Promise<RemoveDeviceResult> {
  const user = await requireUser();

  try {
    await db.pushSubscription.deleteMany({ where: { id, userId: user.id } });
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't remove that device." };
  }
}
```

- [ ] **Step 4: Add `label` capture to `subscribeToPush`**

In `server/actions/push.ts`, extend the `subscribeToPush` signature with an optional `userAgent?: string` and set `label` **on create only**:

```ts
import { deviceLabelFromUserAgent } from "@/lib/device-label";

export async function subscribeToPush(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  timezone?: string;
  userAgent?: string;
}): Promise<PushActionResult> {
  const user = await requireUser();

  try {
    const tz = sub.timezone ? { timezone: sub.timezone } : {};

    await db.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        // Captured once, here, at the moment a Device is enabled. Absent from
        // `update` on purpose (ADR 0048): re-deriving it would let a browser
        // upgrade rename a Device that has been listed for months.
        label: deviceLabelFromUserAgent(sub.userAgent),
        lastSeenAt: new Date(),
        ...tz,
      },
      update: {
        userId: user.id,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        lastSeenAt: new Date(),
        ...tz,
      },
    });

    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save push subscription." };
  }
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run server/actions/devices.test.ts server/actions/push.test.ts && npx tsc --noEmit`
Expected: `devices.test.ts` PASS (13 tests). If `server/actions/push.test.ts` exists and fails on the new `label`/`lastSeenAt` fields, update its expectations — do not weaken the assertions in `devices.test.ts` to compensate.

- [ ] **Step 6: Commit**

```bash
git add server/actions/devices.ts server/actions/devices.test.ts server/actions/push.ts server/actions/push.test.ts
git commit -m "feat(devices): reconcile, list and remove server actions"
```

---

### Task 5: The reconcile client, mounted app-wide

Replaces `PushTimezoneSync` with a component that answers all three questions (permission, live subscription, timezone) and reports on every authenticated page — not only trip screens. This closes follow-up item 4.

**Files:**
- Create: `components/account/device-sync.tsx`
- Create: `components/account/device-sync.test.tsx`
- Modify: `app/(app)/layout.tsx` (mount it)
- Modify: `app/(app)/trips/[tripId]/layout.tsx` (remove `PushTimezoneSync` and the `pushDevice` query that fed it)
- Modify: `components/trip/enable-notifications.tsx` (delete `PushTimezoneSync`)

**Interfaces:**
- Consumes: `reconcileDevice` (Task 4), `deviceTimeZone` from `@/lib/tz`.
- Produces:
  - `function DeviceSync(): null` — headless, mounted once in the authenticated layout.
  - `async function readLocalDeviceState(): Promise<LocalDeviceState>` exported from `components/account/device-state.ts` — see Task 6, which consumes it. Define it **here**:

```ts
// components/account/device-state.ts
export type DevicePermission = "granted" | "denied" | "default" | "unsupported";

export interface LocalDeviceState {
  permission: DevicePermission;
  /** The live PushSubscription endpoint in THIS browser, or null. */
  endpoint: string | null;
  keys: { p256dh: string; auth: string } | null;
  /** True on an iOS browser that is not an installed PWA — it cannot subscribe. */
  needsInstall: boolean;
}

export async function readLocalDeviceState(): Promise<LocalDeviceState>;
```

- [ ] **Step 1: Write the failing test**

Create `components/account/device-sync.test.tsx`:

```tsx
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { reconcileDeviceMock, deviceTimeZoneMock } = vi.hoisted(() => ({
  reconcileDeviceMock: vi.fn().mockResolvedValue({ known: true, healed: false }),
  deviceTimeZoneMock: vi.fn(() => "Australia/Brisbane"),
}));

vi.mock("@/server/actions/devices", () => ({ reconcileDevice: reconcileDeviceMock }));
vi.mock("@/lib/tz", () => ({ deviceTimeZone: deviceTimeZoneMock }));

import { DeviceSync } from "@/components/account/device-sync";

function stubPush(subscription: unknown) {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
      }),
    },
  });
  // @ts-expect-error — test stub
  window.PushManager = function () {};
  // @ts-expect-error — test stub
  window.Notification = { permission: "granted" };
}

const LIVE = {
  endpoint: "https://web.push.apple.com/AAA",
  toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }),
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-key");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("DeviceSync", () => {
  it("reports a live subscription with its zone", async () => {
    stubPush(LIVE);
    render(<DeviceSync />);
    await waitFor(() =>
      expect(reconcileDeviceMock).toHaveBeenCalledWith({
        endpoint: "https://web.push.apple.com/AAA",
        keys: { p256dh: "p", auth: "a" },
        timezone: "Australia/Brisbane",
        userAgent: expect.any(String),
      }),
    );
  });

  // Nothing to report and nothing to create. Subscribing here would be
  // granting permission on somebody's behalf.
  it("does nothing when this browser holds no subscription", async () => {
    stubPush(null);
    render(<DeviceSync />);
    await waitFor(() => expect(reconcileDeviceMock).not.toHaveBeenCalled());
  });

  it("renders nothing", () => {
    stubPush(LIVE);
    const { container } = render(<DeviceSync />);
    expect(container).toBeEmptyDOMElement();
  });

  // A failed reconcile leaves the stored state as it was — wrong, but no worse
  // than before, and the Account page says out loud when it disagrees.
  it("survives a failing reconcile", async () => {
    stubPush(LIVE);
    reconcileDeviceMock.mockRejectedValueOnce(new Error("offline"));
    const { container } = render(<DeviceSync />);
    await waitFor(() => expect(reconcileDeviceMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run components/account/device-sync.test.tsx`
Expected: FAIL — cannot resolve `@/components/account/device-sync`.

- [ ] **Step 3: Implement `device-state.ts` and `device-sync.tsx`**

Create `components/account/device-state.ts`:

```ts
"use client";

/**
 * What THIS browser knows about itself as a **Device** (CONTEXT.md).
 *
 * Three facts live only here and can be obtained nowhere else: whether
 * notification permission is granted, whether a live PushSubscription exists,
 * and what timezone the machine is in. The server can observe none of them —
 * which is why a Device that had lost permission went on looking healthy from
 * every angle TEEPEE could see (ADR 0048).
 */
export type DevicePermission = "granted" | "denied" | "default" | "unsupported";

export interface LocalDeviceState {
  permission: DevicePermission;
  endpoint: string | null;
  keys: { p256dh: string; auth: string } | null;
  needsInstall: boolean;
}

/**
 * iOS permits web push only from a PWA installed to the Home Screen; a plain
 * Safari tab cannot subscribe at all (ADR 0047). Detected so the UI can
 * explain itself instead of offering a button that cannot work.
 */
export function isIosWithoutInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function readLocalDeviceState(): Promise<LocalDeviceState> {
  if (!isPushSupported()) {
    return { permission: "unsupported", endpoint: null, keys: null, needsInstall: isIosWithoutInstall() };
  }

  const permission = Notification.permission as DevicePermission;
  const needsInstall = isIosWithoutInstall();

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return { permission, endpoint: null, keys: null, needsInstall };
    }
    const json = subscription.toJSON();
    const keys = (json.keys ?? {}) as Record<string, string>;
    return {
      permission,
      endpoint: subscription.endpoint,
      keys: { p256dh: keys.p256dh ?? "", auth: keys.auth ?? "" },
      needsInstall,
    };
  } catch {
    // A service worker that never becomes ready is indistinguishable from one
    // with no subscription, for every decision the UI makes.
    return { permission, endpoint: null, keys: null, needsInstall };
  }
}
```

Create `components/account/device-sync.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { deviceTimeZone } from "@/lib/tz";
import { reconcileDevice } from "@/server/actions/devices";
import { readLocalDeviceState } from "@/components/account/device-state";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/**
 * Report this **Device** to the server on every visit.
 *
 * Replaces `PushTimezoneSync` and widens its job. That component refreshed the
 * stored timezone and mounted in the *trip* layout, so "each visit" meant each
 * visit to a trip. This one mounts in the authenticated root layout, so the
 * trips list, the Globe and Account count too (follow-up item 4) — which is
 * what makes `lastSeenAt` mean "last used the app" rather than "last opened
 * Settings".
 *
 * It only ever reports a subscription that ALREADY exists. Creating one here
 * would be granting notification permission on a Traveller's behalf, which is
 * theirs to give from the Account page.
 *
 * Silent by design: the write is one nobody asked for, and Account is where
 * the state is explained. A ref guards against the effect running twice under
 * React strict mode.
 */
export function DeviceSync() {
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;

    if (!VAPID_PUBLIC_KEY) return;

    void (async () => {
      try {
        const state = await readLocalDeviceState();
        if (!state.endpoint || !state.keys) return;

        const zone = deviceTimeZone();
        await reconcileDevice({
          endpoint: state.endpoint,
          keys: state.keys,
          ...(zone ? { timezone: zone } : {}),
          userAgent: navigator.userAgent,
        });
      } catch (err) {
        // A failed report leaves the stored state as it was — wrong, but no
        // worse than before, and Account says so out loud.
        console.error("[DeviceSync] failed to report this device:", err);
      }
    })();
  }, []);

  return null;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run components/account/device-sync.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Move the mount**

In `app/(app)/layout.tsx`, import `DeviceSync` from `@/components/account/device-sync` and render `<DeviceSync />` inside the authenticated shell, alongside `<CommandPaletteMount />`.

In `app/(app)/trips/[tripId]/layout.tsx`: delete the `PushTimezoneSync` import (line 15), the `<PushTimezoneSync … />` render (line 174), and the `db.pushSubscription.findFirst({…})` query and its `pushDevice` binding (around lines 80-88) that existed only to feed it.

In `components/trip/enable-notifications.tsx`: delete the `PushTimezoneSync` export and its `persistSubscription`/`useRef` imports if nothing else uses them. Leave `EnableNotifications` itself alone — Task 7 rewrites it.

- [ ] **Step 6: Verify nothing still references the old component**

Run: `grep -rn "PushTimezoneSync" app components lib server docs | grep -v node_modules`
Expected: no hits in `app/`, `components/`, `lib/`, `server/`. Hits in `docs/` are historical prose — leave them, except `docs/HANDOFF.md`, which Task 8 updates.

Run: `npm test && npx tsc --noEmit`
Expected: all green. The trip layout test may assert on the removed query — update it.

- [ ] **Step 7: Commit**

```bash
git add components/account/device-state.ts components/account/device-sync.tsx components/account/device-sync.test.tsx "app/(app)/layout.tsx" "app/(app)/trips/[tripId]/layout.tsx" components/trip/enable-notifications.tsx
git commit -m "feat(devices): report device state app-wide, not only on trip screens"
```

---

### Task 6: The devices panel

**Files:**
- Create: `components/account/devices-panel.tsx`
- Create: `components/account/devices-panel.test.tsx`
- Modify: `components/trip/enable-notifications.tsx` (rewrite `EnableNotifications` to take an `onEnabled` callback and Digest-correct copy)

**Interfaces:**
- Consumes: `DeviceSummary`, `removeDeviceById` (Task 4); `unsubscribeFromPush` (`server/actions/push.ts`, existing); `readLocalDeviceState`, `isIosWithoutInstall` (Task 5); `formatLastSeen` (Task 2).
- Produces: `function DevicesPanel({ initial }: { initial: DeviceSummary[] }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

Create `components/account/devices-panel.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceSummary } from "@/server/actions/devices";

const {
  readLocalDeviceStateMock,
  removeDeviceByIdMock,
  listDevicesMock,
  unsubscribeFromPushMock,
} = vi.hoisted(() => ({
  readLocalDeviceStateMock: vi.fn(),
  removeDeviceByIdMock: vi.fn().mockResolvedValue({ ok: true }),
  listDevicesMock: vi.fn().mockResolvedValue([]),
  unsubscribeFromPushMock: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/components/account/device-state", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  readLocalDeviceState: readLocalDeviceStateMock,
}));
vi.mock("@/server/actions/devices", () => ({
  removeDeviceById: removeDeviceByIdMock,
  listDevices: listDevicesMock,
}));
vi.mock("@/server/actions/push", () => ({ unsubscribeFromPush: unsubscribeFromPushMock }));

import { DevicesPanel } from "@/components/account/devices-panel";

const device = (over: Partial<DeviceSummary> = {}): DeviceSummary => ({
  id: "sub-1",
  label: "iPhone",
  timezone: "Australia/Brisbane",
  subscribedAt: new Date("2026-09-01T00:00:00.000Z"),
  lastSeenAt: new Date("2026-09-17T09:00:00.000Z"),
  isThisDevice: true,
  stale: false,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-17T10:00:00.000Z"));
  readLocalDeviceStateMock.mockResolvedValue({
    permission: "granted",
    endpoint: "https://web.push.apple.com/AAA",
    keys: { p256dh: "p", auth: "a" },
    needsInstall: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("DevicesPanel", () => {
  it("names a device and when it was last seen", async () => {
    render(<DevicesPanel initial={[device()]} />);
    expect(await screen.findByText(/iPhone/)).toBeInTheDocument();
    expect(screen.getByText(/Australia\/Brisbane/)).toBeInTheDocument();
    expect(screen.getByText(/seen 1 hour ago/)).toBeInTheDocument();
  });

  it("calls out a stale device without offering to delete it for you", async () => {
    render(<DevicesPanel initial={[device({ isThisDevice: false, stale: true, lastSeenAt: new Date("2026-08-20T00:00:00.000Z") })]} />);
    expect(await screen.findByText(/unseen since 20 Aug 2026/)).toBeInTheDocument();
  });

  // THE regression test for this whole plan. A Traveller with a device on file
  // that is not this one must still be offered a way to subscribe here.
  it("offers Enable on this device even when other devices exist", async () => {
    readLocalDeviceStateMock.mockResolvedValue({
      permission: "default",
      endpoint: null,
      keys: null,
      needsInstall: false,
    });
    render(<DevicesPanel initial={[device({ isThisDevice: false })]} />);
    expect(await screen.findByRole("button", { name: /enable on this device/i })).toBeInTheDocument();
  });

  it("says so when this browser has blocked digests", async () => {
    readLocalDeviceStateMock.mockResolvedValue({
      permission: "denied",
      endpoint: null,
      keys: null,
      needsInstall: false,
    });
    render(<DevicesPanel initial={[]} />);
    expect(await screen.findByText(/blocked/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enable on this device/i })).not.toBeInTheDocument();
  });

  it("tells an uninstalled iPhone to add TEEPEE to the Home Screen first", async () => {
    readLocalDeviceStateMock.mockResolvedValue({
      permission: "default",
      endpoint: null,
      keys: null,
      needsInstall: true,
    });
    render(<DevicesPanel initial={[]} />);
    expect(await screen.findByText(/home screen/i)).toBeInTheDocument();
  });

  // Removing another device cannot revoke its permission, so the copy must
  // not pretend otherwise (ADR 0048).
  it("warns that a removed other device may come back", async () => {
    const user = (await import("@testing-library/user-event")).default.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    render(<DevicesPanel initial={[device({ isThisDevice: false })]} />);
    await user.click(await screen.findByRole("button", { name: /remove/i }));
    await waitFor(() => expect(removeDeviceByIdMock).toHaveBeenCalledWith("sub-1"));
    expect(await screen.findByText(/re-appear/i)).toBeInTheDocument();
  });

  // Removing THIS device must revoke the browser subscription too. Deleting
  // the row alone leaves a live subscription the server has forgotten — which
  // reconcileDevice would heal straight back on the next visit.
  it("unsubscribes the browser when removing this device", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: { getSubscription: vi.fn().mockResolvedValue({ unsubscribe }) },
        }),
      },
    });
    const user = (await import("@testing-library/user-event")).default.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    render(<DevicesPanel initial={[device({ isThisDevice: true })]} />);
    await user.click(await screen.findByRole("button", { name: /remove/i }));
    await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
    expect(unsubscribeFromPushMock).toHaveBeenCalledWith("https://web.push.apple.com/AAA");
  });

  it("never renders the word notification", async () => {
    const { container } = render(<DevicesPanel initial={[device()]} />);
    await screen.findByText(/iPhone/);
    expect(container.textContent?.toLowerCase()).not.toContain("notification");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run components/account/devices-panel.test.tsx`
Expected: FAIL — cannot resolve `@/components/account/devices-panel`.

- [ ] **Step 3: Implement the panel**

Create `components/account/devices-panel.tsx` as a client component. Required behaviour, in order of the checks:

1. On mount, `readLocalDeviceState()` into state. Until it resolves, render the server-supplied `initial` list with no this-device marker and no Enable button (there is nothing truthful to say yet).
2. `needsInstall` → a disabled button reading **"Add to Home Screen first"** and the explanation: *"iPhone only sends a digest to an installed app. Tap Share, then “Add to Home Screen”, open TEEPEE from there, and this will work."*
3. `permission === "denied"` → no Enable button; the line *"This device has blocked digests. Allow them for TEEPEE in your browser or phone settings, then come back."*
4. `permission === "unsupported"` → *"This browser can't receive a digest."*
5. Otherwise, when no device in the list has `isThisDevice` → render **`[+ Enable on this device]`**, **unconditionally, regardless of how many other devices exist.** This is the defect the plan exists to fix; it has its own test above.
6. Each device row: `label ?? "A device"` · `timezone ?? "Timezone unknown"` · `this device` marker when `isThisDevice` · `formatLastSeen(lastSeenAt, new Date())` · `[Remove]`. A `stale` row is marked with a `TriangleAlert` and destructive text.
7. A device with `timezone === null` keeps the existing destructive warning from `reminders-panel.tsx:179-189` — it is skipped every run and no Digest can ever reach it.
8. `[Remove]` on **this** device must genuinely end it, which takes three steps in this order — the local `unsubscribe()` first, because a row deleted while the browser subscription survives is the exact orphan state ADR 0048 exists to prevent, only inverted:

```ts
async function removeThisDevice(endpoint: string) {
  // 1. Revoke the browser's own subscription. Only this machine can do this,
  //    and if it fails there is no point deleting the row — reconcileDevice
  //    would simply heal it back on the next visit.
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe();

  // 2. Drop the server's record. `unsubscribeFromPush` already exists and has
  //    never had a caller anywhere in the app (follow-up item 1); this is it.
  const result = await unsubscribeFromPush(endpoint);

  // 3. Re-read local state so the panel flips to offering Enable again.
  setLocal(await readLocalDeviceState());
  return result;
}
```

Import `unsubscribeFromPush` from `@/server/actions/push`. On success show: *"Removed from this device."*

9. `[Remove]` on **another** device calls `removeDeviceById(id)` — `DeviceSummary` deliberately carries no endpoint, and this browser cannot revoke a permission it does not hold. On success drop the row from local state and show: *"Removed. If that device still has permission it will re-appear next time it's opened — turn its digest off there to stop it for good."*

`removeDeviceById` and its tests already exist from Task 4 — import it, do not redefine it.

- [ ] **Step 4: Rewrite `EnableNotifications`**

In `components/trip/enable-notifications.tsx`, keep the subscribe flow (`Notification.requestPermission()` → `navigator.serviceWorker.ready` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → persist) and change:

- the props to `{ className?: string; onEnabled?: () => void }`, calling `onEnabled` after a successful persist so `DevicesPanel` can refresh its list;
- `persistSubscription` to pass `userAgent: navigator.userAgent` through to `subscribeToPush`;
- the button label from **"Enable trip reminders"** to **"Enable on this device"**;
- the enabled state from **"Reminders enabled"** to **"Digest enabled on this device"**;
- the denied state from **"Notifications blocked"** / *"Allow notifications in your browser settings to enable reminders."* to **"Digests blocked"** / *"Allow them for TEEPEE in your browser or phone settings, then come back."*;
- the unavailable state from **"Notifications unavailable"** / *"Notifications need setup — ask the admin to configure VAPID keys."* to **"Digests unavailable"** / *"Digests need setup — ask the admin to configure the VAPID keys."*;
- the error line from *"Failed to enable notifications. Please try again."* to *"Couldn't enable digests on this device. Please try again."*

Move the file to `components/account/enable-device.tsx` and rename the export to `EnableDevice`, since it is no longer trip-scoped. Update `components/trip/enable-notifications.test.tsx` accordingly (rename to `components/account/enable-device.test.tsx`), including the `isIosWithoutInstall` tests — which now import from `@/components/account/device-state`.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run components/account server/actions/devices.test.ts && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add components/account server/actions/devices.ts server/actions/devices.test.ts
git rm components/trip/enable-notifications.tsx components/trip/enable-notifications.test.tsx
git commit -m "feat(account): devices panel with three-way device state and always-available enable"
```

---

### Task 7: The `/account` page

**Files:**
- Create: `app/(app)/account/page.tsx`
- Create: `app/(app)/account/page.test.tsx`
- Create: `components/account/trip-digests-panel.tsx`
- Create: `components/account/trip-digests-panel.test.tsx`
- Modify: `server/actions/digest.ts` (add `listDigestSettingsForUser`)
- Modify: `server/actions/digest.test.ts`
- Modify: `app/(app)/layout.tsx` (Account entry in the avatar dropdown)

**Interfaces:**
- Consumes: `listDevices` (Task 4), `DevicesPanel` (Task 6), `setDigestEnabled` (existing).
- Produces:

```ts
export interface TripDigestSetting {
  tripId: string;
  tripName: string;
  enabled: boolean;
}
export async function listDigestSettingsForUser(): Promise<TripDigestSetting[]>;
```

- [ ] **Step 1: Write the failing test for `listDigestSettingsForUser`**

Add to `server/actions/digest.test.ts`:

```ts
describe("listDigestSettingsForUser", () => {
  it("lists every trip the traveller is on, defaulting a missing preference to on", async () => {
    tripFindManyMock.mockResolvedValue([
      { id: "trip-1", name: "Europe Christmas 2026", digestPreferences: [{ enabled: false }] },
      { id: "trip-2", name: "Japan 2027", digestPreferences: [] },
    ]);

    const result = await listDigestSettingsForUser();

    // A MISSING row means enabled — subscribing a Device is itself the opt-in,
    // so an absent preference must never read as a false "off".
    expect(result).toEqual([
      { tripId: "trip-1", tripName: "Europe Christmas 2026", enabled: false },
      { tripId: "trip-2", tripName: "Japan 2027", enabled: true },
    ]);
  });
});
```

Add `tripFindManyMock` to the file's `vi.hoisted()` block and to the `db` mock as `trip: { findMany: tripFindManyMock }`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run server/actions/digest.test.ts`
Expected: FAIL — `listDigestSettingsForUser` is not exported.

- [ ] **Step 3: Implement it**

Append to `server/actions/digest.ts`:

```ts
export interface TripDigestSetting {
  tripId: string;
  tripName: string;
  enabled: boolean;
}

/**
 * Every Trip this Traveller is on, with their own Digest switch for each.
 *
 * The Account view of the same `DigestPreference` rows the Trips' own Settings
 * carry — one fact, two places (CONTEXT.md **Account**). It exists so "am I
 * getting digests, and for what?" is answerable without opening every Trip.
 */
export async function listDigestSettingsForUser(): Promise<TripDigestSetting[]> {
  const user = await requireUser();

  const trips = await db.trip.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      digestPreferences: {
        where: { userId: user.id },
        select: { enabled: true },
      },
    },
  });

  return trips.map((t) => ({
    tripId: t.id,
    tripName: t.name,
    // A missing row means enabled (see `getDigestSettings`): subscribing a
    // Device is itself the opt-in, so absence must not read as "off".
    enabled: t.digestPreferences[0]?.enabled ?? true,
  }));
}
```

Add `import { requireUser } from "@/lib/guards";` alongside the existing `requireTripAccess` import. Verify the relation name on `Trip` for `DigestPreference` and the membership relation name in `prisma/schema.prisma` before writing this — use whatever the schema actually calls them.

- [ ] **Step 4: Build the page and the trips panel**

`components/account/trip-digests-panel.tsx` — a client component taking `{ initial: TripDigestSetting[] }`, rendering one checkbox per trip wired to `setDigestEnabled(tripId, next)` with optimistic state and rollback on failure, exactly as `reminders-panel.tsx:95-111` does today. Empty state: *"You're not on any trips yet."*

`app/(app)/account/page.tsx` — a server component:

```tsx
export const metadata = { title: "Account" };

export default async function AccountPage() {
  const [devices, trips] = await Promise.all([
    // The page cannot know this browser's endpoint; DevicesPanel resolves
    // `isThisDevice` itself once it has read the local state.
    listDevices(null),
    listDigestSettingsForUser(),
  ]);

  return ( /* two Cards: "Devices" then "Which trips send you a digest" */ );
}
```

Match the Card/CardHeader/CardTitle/CardContent structure and class names used in `app/(app)/trips/[tripId]/settings/page.tsx:99-120`.

Write `app/(app)/account/page.test.tsx` asserting: both section headings render; a trip with `enabled: false` renders an unchecked box; the page requires a signed-in user.

- [ ] **Step 5: Add the avatar-menu entry**

In `app/(app)/layout.tsx`, add a `DropdownMenuItem` linking to `/account` labelled **Account**, immediately above the `DropdownMenuSeparator` that precedes `SignOutMenuItem`. Update `app/(app)/layout.test.tsx` to assert the link is present.

- [ ] **Step 6: Run everything**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/account" "app/(app)/layout.tsx" "app/(app)/layout.test.tsx" components/account/trip-digests-panel.tsx components/account/trip-digests-panel.test.tsx server/actions/digest.ts server/actions/digest.test.ts
git commit -m "feat(account): /account page with devices and per-trip digest switches"
```

---

### Task 8: Trip Settings — keep the switch, hand off the device

**Files:**
- Modify: `components/trip/settings/reminders-panel.tsx` → rename to `components/trip/settings/digest-panel.tsx`
- Modify: `components/trip/settings/reminders-panel.test.tsx` → rename to `digest-panel.test.tsx`
- Modify: `app/(app)/trips/[tripId]/settings/page.tsx`
- Modify: `app/(app)/trips/[tripId]/settings/page.test.tsx`
- Modify: `server/actions/digest.ts` (`getDigestSettings` returns all devices)

**Interfaces:**
- Consumes: `readLocalDeviceState` (Task 5).
- Produces: `DigestSettings.devices: Array<{ timezone: string | null; subscribedAt: Date; label: string | null }>` — replacing the single `device` field.

- [ ] **Step 1: Write the failing test for the widened `getDigestSettings`**

In `server/actions/digest.test.ts`, replace the assertions that expect a single `device` with one expecting `devices` to carry **every** row, and add:

```ts
// Reporting only the newest device is how "1 device · Brisbane" came to
// describe a machine the traveller wasn't holding (ADR 0048).
it("returns every device, not just the newest", async () => {
  pushSubscriptionFindManyMock.mockResolvedValue([
    { timezone: "Australia/Brisbane", createdAt: new Date("2026-09-17"), label: "iPhone" },
    { timezone: "Europe/Vienna", createdAt: new Date("2026-09-01"), label: "Mac" },
  ]);
  digestPreferenceFindUniqueMock.mockResolvedValue({ enabled: true });

  const settings = await getDigestSettings("trip-1");

  expect(settings.devices).toHaveLength(2);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run server/actions/digest.test.ts`
Expected: FAIL — `settings.devices` is undefined.

- [ ] **Step 3: Widen `getDigestSettings`**

In `server/actions/digest.ts`, change `DigestSettings` to:

```ts
export interface DigestSettings {
  enabled: boolean;
  /**
   * Every **Device** this Traveller has, newest first — not just the newest.
   * The panel used to show only `devices[0]`, which let one healthy laptop
   * stand in for a phone that had quietly died (ADR 0048).
   */
  devices: Array<{ timezone: string | null; subscribedAt: Date; label: string | null }>;
}
```

and return `devices: devices.map((d) => ({ timezone: d.timezone, subscribedAt: d.createdAt, label: d.label }))`, selecting `label` in the query.

- [ ] **Step 4: Rework the trip panel**

Rename `reminders-panel.tsx` → `digest-panel.tsx`, export `DigestPanel`, and:

- **Keep:** the per-trip switch, the "what a digest carries" copy, **Send me a test** and its result lines, and the "silence is by design" note. Change the switch label from *"Your digest"* to *"Your digest for this trip"*.
- **Remove:** `<EnableNotifications />` and the whole `device ? … : …` branch. Device management is Account's job now.
- **Add:** a device-state line driven by `readLocalDeviceState()`:
  - no live subscription here → *"This device isn't set up to receive your digest."* + a `Link` to `/account` reading **Manage devices**;
  - live subscription here → *"This device will receive it · {zone}"*;
  - `settings.devices.length === 0` → *"No device is set up yet, so there's nowhere to send this."* + the same link.
- **Keep** the stale-zone and unserved-zone warnings (`zoneIsStale`, `zoneIsUnserved`), reading the zone from *this* device's state rather than `devices[0]`.
- Replace every remaining use of "reminders"/"notifications" in the copy with Digest wording.

Update the settings page to import `DigestPanel` and retitle the card from **Reminders** to **Digest**.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npm test && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add components/trip/settings "app/(app)/trips/[tripId]/settings" server/actions/digest.ts server/actions/digest.test.ts
git commit -m "feat(digest): trip settings keeps the switch and hands devices to Account"
```

---

### Task 9: The route rename and the docs

Land this **atomically**, and not within ~15 minutes of 06:00, 09:00, 10:00, 19:00 or 20:00 UTC — GitHub reads the workflow from `main` at schedule time while Vercel takes a minute or two to deploy the same commit, so a run in that window would hit a path that does not exist yet. Worst case is one skipped Digest; the ledger releases on failure, so nothing gets stuck.

**Files:**
- Move: `app/api/cron/reminders/` → `app/api/cron/digest/` (both `route.ts` and `route.test.ts`)
- Modify: `.github/workflows/reminders-cron.yml` → rename to `digest-cron.yml`
- Modify: `docs/DEPLOY.md`, `docs/HANDOFF.md`

- [ ] **Step 1: Move the route and its test**

```bash
git mv app/api/cron/reminders app/api/cron/digest
```

Update every in-file reference: the `GET /api/cron/reminders` doc comment at `route.ts:2`, the three `[cron/reminders]` log prefixes (`route.ts:166,213,222`) → `[cron/digest]`, and both URLs plus the four `describe` titles in `route.test.ts` (lines 45, 46, 72, 107, 130).

- [ ] **Step 2: Move the workflow**

```bash
git mv .github/workflows/reminders-cron.yml .github/workflows/digest-cron.yml
```

Change `name: Reminders cron` → `name: Digest cron`, the curl path `/api/cron/reminders` → `/api/cron/digest`, and the comment at the `schedule:` block that names `app/api/cron/reminders/route.ts`. **Do not touch the five cron hours** — `lib/digest-schedule.test.ts` fails if the UTC hours and the route's local windows are edited apart.

- [ ] **Step 3: Update the docs**

- `docs/DEPLOY.md:126` — the workflow name and the path.
- `docs/DEPLOY.md` §5 — add: *"Land the cron route rename away from 06/09/10/19/20 UTC: GitHub reads the workflow from `main` at schedule time, Vercel needs a minute or two to deploy, and a run inside that gap 404s and costs one Digest."*
- `docs/HANDOFF.md:260, 292, 311, 386` — the endpoint path in all four places.
- `docs/HANDOFF.md` — the deploy step reading "press Enable in Settings → Reminders" becomes "press **Enable on this device** in **Account**". This is load-bearing instructions; get it right.

- [ ] **Step 4: Verify nothing still points at the old path**

Run: `grep -rn "cron/reminders\|Reminders cron\|reminders-cron" app lib server docs .github | grep -v node_modules`
Expected: no hits outside `docs/adr/0047-*` and `docs/follow-ups/` and `docs/superpowers/plans/` (historical records — leave them).

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green, including `lib/digest-schedule.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A app/api/cron .github/workflows docs/DEPLOY.md docs/HANDOFF.md
git commit -m "refactor(digest): rename the cron route and its docs from reminders to digest"
```

---

### Task 10: The push icon, and a last sweep for the old vocabulary

**Files:**
- Modify: `public/sw.js`
- Modify: any remaining file using "reminder"/"notification" for a Digest

- [ ] **Step 1: Fix the icon paths**

> **Correction, 2026-09-23 (ADR 0060): do NOT follow Step 1 below as
> written.** It was written on the premise that `public/icons/` does not
> exist. `feat/playground-visual-system` created and populated
> `public/icons/` (this is what the "generated `/icon` route was retired"
> comment in current `public/sw.js` refers to) and deleted the `/icon` and
> `/apple-icon` routes entirely. Setting `icon`/`badge` back to `/icon`
> would point at a route that no longer exists and would re-introduce the
> exact bug the final review of that branch found and fixed. If this task
> is ever picked up, confirm current `public/sw.js` first — as of this
> correction it already reads `icon: '/icons/icon-192.png'`, `badge:
> '/icons/push-badge-96.png'`, which is correct and should be left alone.
> See ADR 0060.

In `public/sw.js`, in the `push` listener, change both `icon` and `badge` from `/icons/icon-192.png` to `/icon`. `public/icons/` does not exist; `app/manifest.ts` serves the app icon from `/icon`. Add a comment:

```js
      // `/icon` — served by app/manifest.ts. NOT `/icons/icon-192.png`, which
      // nothing has ever served: this path had never been exercised because no
      // push had ever been delivered (follow-up item 5).
      icon: '/icon',
      badge: '/icon',
```

Bump `CACHE_VERSION` from `'trip-planner-v3'` to `'trip-planner-v4'` so installed clients pick the new worker up.

- [ ] **Step 2: Sweep the vocabulary**

Run: `grep -rni "reminder\|notification" app components lib server public --include="*.ts" --include="*.tsx" --include="*.js" | grep -v node_modules | grep -v "\.test\."`

For each hit decide, against `CONTEXT.md`:
- **Correct, leave it** — `server/actions/reminders.ts`, `components/trip/reminders-card.tsx`, `lib/validations/reminder.ts` and the `Reminder` model are dated notes. The Activity bell's unread count is legitimately a notification.
- **Wrong, fix it** — anything naming the Digest, a Device, or push delivery.

Report the list and the verdict for each in your task report.

- [ ] **Step 3: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add public/sw.js
git commit -m "fix(sw): point the push icon at a path that is actually served"
```

---

## Done means

- `npm test`, `npx tsc --noEmit` and `npm run lint` all clean.
- `/account` lists Devices with labels, zones and last-seen, and **always** offers Enable when this browser is not among them.
- A Device that loses permission goes quiet and is shown as `unseen since …`, and is never deleted automatically.
- Trip → Settings → **Digest** keeps the switch and the test send, and links to `/account` when the Device is the problem.
- No user-facing Digest copy uses "reminder" or "notification".
- `main` untouched; everything on `fix/digest-delivery-diagnosis`.

**Still not proven by any of this:** that a scheduled Digest reaches a phone. Only a test send has ever been delivered. The first real proof is an unprompted 8pm Brisbane Digest — the cron path has never once fired successfully.
