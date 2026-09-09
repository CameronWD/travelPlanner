# Feedback Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Traveller write a **Feedback note** about TEEPEE from any signed-in screen, and turn those notes into a committed markdown backlog (`docs/feedback/inbox.md`) that a future working session reads at start-up.

**Architecture:** A `FeedbackNote` row in Postgres is the truth (ADR 0040). A floating button in the bottom-left of the app shell opens a **Feedback panel** — a log of existing notes above a write box. Notes written offline queue in `localStorage` and flush on reconnect, idempotent via a client-generated key (ADR 0041). Two `tsx` scripts move data out and status back in: `feedback:pull` renders the DB to `docs/feedback/inbox.md`, `feedback:resolve` marks a note Done/Won't fix. Nothing in the product reads a Feedback note — it is inert data that exists to be exported.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 + `@prisma/adapter-pg` on Postgres, Zod 4, Radix (`Sheet`), Tailwind 4, Vitest + Testing Library (jsdom), `tsx` for scripts.

## Global Constraints

- **Never work on `main`.** All work lands on the existing branch `feat/feedback-notes`. Never merge, never deploy.
- **Terminology is a contract.** `CONTEXT.md` §"Feedback on the app itself" is already written. Use **Feedback note**, **Feedback panel**, **Feedback inbox**. Never call one a "Note", "Flag", "bug", "issue", "ticket", "report" or "comment" in code, UI copy, comments or commit messages.
- **Prisma schema portability rules** (`prisma/schema.prisma` header): **no Prisma `enum`** — enum-ish columns are `String`, validated by Zod unions in `lib/enums.ts`; **no Prisma `Json`**. Instants are `DateTime`.
- **Server actions return the unified result** from `lib/action-result.ts` (ADR 0027): `ok()` / `fail()` / `validationResult()`. Hand-built form-level failures use the **`_form`** key (matches `use-server-action.ts`); Zod form-level errors land under `_` via `flattenZodErrors` — do not "fix" that.
- **A Feedback note is not trip content.** Never call `recordActivity` for one, never `revalidatePath` for one, never surface one in a planning view, **Summary**, **Flag** or the **Calendar feed**.
- **Tests mock `@/lib/db`** — the suite never touches a real database (see any `server/actions/*.test.ts` for the `vi.hoisted` pattern). This sandbox has **no local Postgres**; do not attempt `prisma migrate dev`. Write the migration SQL by hand.
- **Every task ends green:** `npx vitest run`, `npx tsc --noEmit`, `npm run lint` all clean before commit.
- Commit at the end of every task, on `feat/feedback-notes`.

---

### Task 1: Data model — `FeedbackNote` schema, migration, enum, validation

**Files:**
- Modify: `prisma/schema.prisma` (add relation to `User` at line 51; add model after the `Marker` model at end of file)
- Create: `prisma/migrations/20260908000000_add_feedback_notes/migration.sql`
- Modify: `lib/enums.ts` (append)
- Create: `lib/validations/feedback.ts`
- Test: `lib/validations/feedback.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Prisma model `FeedbackNote` with fields `id, clientKey, authorId, body, route, pageLabel, tripId, tripName, viewport, userAgent, status, resolution, resolvedAt, authoredAt, createdAt`.
  - `FEEDBACK_STATUSES`, `type FeedbackStatus`, `feedbackStatusSchema` from `@/lib/enums`.
  - `createFeedbackNoteSchema`, `type CreateFeedbackNoteInput`, `type CreateFeedbackNoteOutput` from `@/lib/validations/feedback`.

- [ ] **Step 1: Write the failing validation test**

Create `lib/validations/feedback.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createFeedbackNoteSchema } from "@/lib/validations/feedback";

const valid = {
  clientKey: "fk_abc123",
  body: "  The budget total looks wrong after marking paid  ",
  route: "/trips/t1/budget",
  pageLabel: "Budget",
  tripId: "t1",
  tripName: "Europe Summer 2026",
  viewport: "390x844",
  userAgent: "Mozilla/5.0 (iPhone)",
  authoredAt: "2026-09-08T04:05:06.000Z",
};

describe("createFeedbackNoteSchema", () => {
  it("accepts a full note and trims the body", () => {
    const parsed = createFeedbackNoteSchema.parse(valid);
    expect(parsed.body).toBe("The budget total looks wrong after marking paid");
  });

  it("accepts a note written outside any trip", () => {
    const parsed = createFeedbackNoteSchema.parse({
      ...valid,
      tripId: null,
      tripName: null,
    });
    expect(parsed.tripId).toBeNull();
  });

  it("rejects an empty body", () => {
    const result = createFeedbackNoteSchema.safeParse({ ...valid, body: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a body over 4000 characters", () => {
    const result = createFeedbackNoteSchema.safeParse({
      ...valid,
      body: "x".repeat(4001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing clientKey", () => {
    const result = createFeedbackNoteSchema.safeParse({ ...valid, clientKey: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an authoredAt that is not a parseable timestamp", () => {
    const result = createFeedbackNoteSchema.safeParse({
      ...valid,
      authoredAt: "last tuesday",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run lib/validations/feedback.test.ts`
Expected: FAIL — cannot resolve `@/lib/validations/feedback`.

- [ ] **Step 3: Add the status enum to `lib/enums.ts`**

Append to the end of `lib/enums.ts`:

```ts
/** `FeedbackNote.status` — the lifecycle of a Feedback note (ADR 0040). */
export const FEEDBACK_STATUSES = ["OPEN", "DONE", "WONTFIX"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES);
```

- [ ] **Step 4: Write `lib/validations/feedback.ts`**

```ts
import { z } from "zod";

/**
 * Schema for creating a Feedback note (ADR 0040).
 *
 * `authoredAt` comes from the *client* clock, not the server's: a note may be
 * written offline and flushed much later (ADR 0041), and the inbox orders by
 * when it was written. `clientKey` is generated once when the note is written
 * and reused on every retry — it is the sole duplicate guard.
 */
const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

export const createFeedbackNoteSchema = z.object({
  clientKey: z.string().trim().min(1, "clientKey is required").max(64),
  body: z
    .string()
    .trim()
    .min(1, "Feedback cannot be empty")
    .max(4000, "Feedback must be 4000 characters or fewer"),
  route: z.string().trim().min(1, "route is required").max(512),
  pageLabel: z.string().trim().min(1, "pageLabel is required").max(120),
  tripId: optionalText(64),
  tripName: optionalText(200),
  viewport: optionalText(32),
  userAgent: optionalText(512),
  authoredAt: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "authoredAt must be an ISO timestamp"),
});

export type CreateFeedbackNoteInput = z.input<typeof createFeedbackNoteSchema>;
export type CreateFeedbackNoteOutput = z.output<typeof createFeedbackNoteSchema>;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/validations/feedback.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Add the Prisma model**

In `prisma/schema.prisma`, add to the `User` model's domain relations block (after line 51, `markersCreated`):

```prisma
  feedbackNotes      FeedbackNote[]
```

Append at the end of the file:

```prisma
// ---------------------------------------------------------------------------
// Feedback about the app itself — inert product data, read by no feature.
// See ADR 0040 (capture + export) and ADR 0041 (offline queue).
// ---------------------------------------------------------------------------

model FeedbackNote {
  id        String @id @default(cuid())
  /// Client-generated, reused on every retry — the duplicate guard for the
  /// offline flush (ADR 0041).
  clientKey String @unique
  authorId  String
  body      String

  // Circumstances the app records for itself, so a note is understandable
  // without asking the author where they were.
  route     String
  pageLabel String
  /// Snapshots, deliberately NOT foreign keys: feedback outlives the Trip it
  /// was written about (ADR 0040).
  tripId    String?
  tripName  String?
  viewport  String?
  userAgent String?

  status     String    @default("OPEN") // lib/enums.ts FEEDBACK_STATUSES
  resolution String?
  resolvedAt DateTime?

  /// When the author wrote it (client clock) — may precede createdAt.
  authoredAt DateTime
  /// When it reached the server.
  createdAt  DateTime @default(now())

  author User @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([status, authoredAt])
  @@index([authorId])
}
```

- [ ] **Step 7: Write the migration by hand**

Create `prisma/migrations/20260908000000_add_feedback_notes/migration.sql`:

```sql
-- Feedback notes: remarks about the app itself (ADR 0040). Inert product data —
-- no feature reads it; it exists to be exported to docs/feedback/inbox.md.
CREATE TABLE "FeedbackNote" (
    "id" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "pageLabel" TEXT NOT NULL,
    "tripId" TEXT,
    "tripName" TEXT,
    "viewport" TEXT,
    "userAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "authoredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeedbackNote_clientKey_key" ON "FeedbackNote"("clientKey");
CREATE INDEX "FeedbackNote_status_authoredAt_idx" ON "FeedbackNote"("status", "authoredAt");
CREATE INDEX "FeedbackNote_authorId_idx" ON "FeedbackNote"("authorId");

ALTER TABLE "FeedbackNote" ADD CONSTRAINT "FeedbackNote_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 8: Regenerate the Prisma client and verify the schema is valid**

Run: `npx prisma generate && npx prisma validate`
Expected: client generated, schema valid. (`prisma validate` needs no database connection. Do **not** run `prisma migrate dev` — there is no Postgres in this sandbox.)

- [ ] **Step 9: Full baseline**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green (test count = previous baseline + 6).

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/enums.ts lib/validations/feedback.ts lib/validations/feedback.test.ts
git commit -m "feat(feedback): FeedbackNote model, migration and validation"
```

---

### Task 2: Route → page label and inbox area mapping

**Files:**
- Create: `lib/feedback-context.ts`
- Test: `lib/feedback-context.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `pageLabelForRoute(route: string): string` — a human label for the screen a note was written from ("Budget", "Plan editor", "Globe").
  - `tripIdFromRoute(route: string): string | null` — the trip id embedded in a `/trips/<id>/…` path.
  - `areaForRoute(route: string): string` — the coarse grouping heading used by the Feedback inbox ("Plan editor", "Money", "Globe", "Elsewhere").

Both the Feedback panel (client) and the inbox renderer (script) import from here, so it must stay free of React, Prisma and `next/*` imports.

- [ ] **Step 1: Write the failing test**

Create `lib/feedback-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  areaForRoute,
  pageLabelForRoute,
  tripIdFromRoute,
} from "@/lib/feedback-context";

describe("pageLabelForRoute", () => {
  it.each([
    ["/trips", "Trips"],
    ["/trips/new", "New trip"],
    ["/trips/abc123", "Trip home"],
    ["/trips/abc123/plan", "Plan editor"],
    ["/trips/abc123/budget", "Budget"],
    ["/trips/abc123/summary", "Summary"],
    ["/trips/abc123/calendar", "Calendar"],
    ["/trips/abc123/today", "Today"],
    ["/trips/abc123/wishlist", "Wishlist"],
    ["/trips/abc123/checklists", "Checklists"],
    ["/trips/abc123/journal", "Journal"],
    ["/trips/abc123/files", "Files"],
    ["/trips/abc123/activity", "Activity"],
    ["/trips/abc123/compare", "Compare"],
    ["/trips/abc123/settings", "Trip settings"],
    ["/trips/abc123/print", "Print view"],
    ["/trips/abc123/help", "Trip help"],
    ["/globe", "Globe"],
    ["/help", "Help"],
  ])("labels %s as %s", (route, label) => {
    expect(pageLabelForRoute(route)).toBe(label);
  });

  it("ignores a query string", () => {
    expect(pageLabelForRoute("/trips/abc123/budget?fork=f1")).toBe("Budget");
  });

  it("ignores a trailing slash", () => {
    expect(pageLabelForRoute("/globe/")).toBe("Globe");
  });

  it("falls back to the raw path for an unmapped route", () => {
    expect(pageLabelForRoute("/something/new")).toBe("/something/new");
  });
});

describe("tripIdFromRoute", () => {
  it("extracts the id from a trip route", () => {
    expect(tripIdFromRoute("/trips/abc123/budget")).toBe("abc123");
  });

  it("returns null off a trip route", () => {
    expect(tripIdFromRoute("/globe")).toBeNull();
  });

  it("returns null for the trips list and the new-trip route", () => {
    expect(tripIdFromRoute("/trips")).toBeNull();
    expect(tripIdFromRoute("/trips/new")).toBeNull();
  });
});

describe("areaForRoute", () => {
  it.each([
    ["/trips/abc123/plan", "Plan editor"],
    ["/trips/abc123/compare", "Plan editor"],
    ["/trips/abc123/budget", "Money"],
    ["/globe", "Globe"],
    ["/trips/abc123/wishlist", "Wishlist"],
    ["/trips/abc123", "Trip home"],
    ["/trips", "Trips list"],
    ["/help", "Elsewhere"],
  ])("groups %s under %s", (route, area) => {
    expect(areaForRoute(route)).toBe(area);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run lib/feedback-context.test.ts`
Expected: FAIL — cannot resolve `@/lib/feedback-context`.

- [ ] **Step 3: Implement `lib/feedback-context.ts`**

```ts
/**
 * Route → human context for a Feedback note (ADR 0040).
 *
 * Shared by the Feedback panel (browser) and the inbox renderer (node script),
 * so this module must stay free of React, Prisma and next/* imports.
 */

/** Strip query/hash and any trailing slash, keeping a leading "/". */
function normalise(route: string): string {
  const path = route.split(/[?#]/, 1)[0];
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** Trip sub-routes, keyed by the segment after the trip id. */
const TRIP_SUBPAGE_LABELS: Record<string, string> = {
  plan: "Plan editor",
  budget: "Budget",
  summary: "Summary",
  calendar: "Calendar",
  today: "Today",
  wishlist: "Wishlist",
  checklists: "Checklists",
  journal: "Journal",
  files: "Files",
  activity: "Activity",
  compare: "Compare",
  settings: "Trip settings",
  print: "Print view",
  help: "Trip help",
};

const TOP_LEVEL_LABELS: Record<string, string> = {
  "/trips": "Trips",
  "/trips/new": "New trip",
  "/globe": "Globe",
  "/help": "Help",
};

/**
 * The trip id in a `/trips/<id>/…` path, or null. "new" is a route, not an id.
 */
export function tripIdFromRoute(route: string): string | null {
  const segments = normalise(route).split("/").filter(Boolean);
  if (segments[0] !== "trips") return null;
  const id = segments[1];
  if (!id || id === "new") return null;
  return id;
}

/** A human label for the screen a Feedback note was written from. */
export function pageLabelForRoute(route: string): string {
  const path = normalise(route);
  const topLevel = TOP_LEVEL_LABELS[path];
  if (topLevel) return topLevel;

  if (tripIdFromRoute(path)) {
    const segments = path.split("/").filter(Boolean);
    const subpage = segments[2];
    if (!subpage) return "Trip home";
    const label = TRIP_SUBPAGE_LABELS[subpage];
    if (label) return label;
  }

  return path;
}

/** The coarse heading a note is filed under in the Feedback inbox. */
export function areaForRoute(route: string): string {
  const path = normalise(route);
  if (path === "/globe" || path.startsWith("/globe/")) return "Globe";
  if (path === "/trips" || path === "/trips/new") return "Trips list";

  if (tripIdFromRoute(path)) {
    const subpage = path.split("/").filter(Boolean)[2];
    if (!subpage) return "Trip home";
    if (subpage === "plan" || subpage === "compare") return "Plan editor";
    if (subpage === "budget") return "Money";
    if (subpage === "wishlist") return "Wishlist";
    return TRIP_SUBPAGE_LABELS[subpage] ?? "Elsewhere";
  }

  return "Elsewhere";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/feedback-context.test.ts`
Expected: PASS.

- [ ] **Step 5: Baseline and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add lib/feedback-context.ts lib/feedback-context.test.ts
git commit -m "feat(feedback): route to page-label and inbox-area mapping"
```

---

### Task 3: Server actions — create, list, delete

**Files:**
- Create: `server/actions/feedback.ts`
- Test: `server/actions/feedback.test.ts`

**Interfaces:**
- Consumes: `createFeedbackNoteSchema`, `CreateFeedbackNoteInput` (Task 1); `requireUser` from `@/lib/guards`; `ok`/`fail`/`validationResult` from `@/lib/action-result`.
- Produces:
  - `type FeedbackNoteView = { id: string; body: string; route: string; pageLabel: string; tripName: string | null; authorId: string; authorName: string; status: FeedbackStatus; authoredAt: string }` (`authoredAt` is an ISO string — server actions must return serialisable data and the panel only formats it).
  - `createFeedbackNote(input: CreateFeedbackNoteInput): Promise<ActionResult<{ note: FeedbackNoteView }>>`
  - `listFeedbackNotes(): Promise<ActionResult<{ notes: FeedbackNoteView[] }>>`
  - `deleteFeedbackNote(id: string): Promise<ActionResult>`

`requireUser()` returns `{ user }` where `user.id` and `user.name` are available — check `lib/guards.ts` before writing and match its actual shape.

- [ ] **Step 1: Write the failing test**

Create `server/actions/feedback.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for Feedback note server actions.
 *
 * Mocks: lib/db, lib/guards
 */
const {
  requireUserMock,
  feedbackNoteUpsertMock,
  feedbackNoteFindManyMock,
  feedbackNoteFindUniqueMock,
  feedbackNoteDeleteMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  feedbackNoteUpsertMock: vi.fn(),
  feedbackNoteFindManyMock: vi.fn(),
  feedbackNoteFindUniqueMock: vi.fn(),
  feedbackNoteDeleteMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    feedbackNote: {
      upsert: feedbackNoteUpsertMock,
      findMany: feedbackNoteFindManyMock,
      findUnique: feedbackNoteFindUniqueMock,
      delete: feedbackNoteDeleteMock,
    },
  },
}));

vi.mock("@/lib/guards", () => ({
  requireUser: requireUserMock,
}));

import {
  createFeedbackNote,
  deleteFeedbackNote,
  listFeedbackNotes,
} from "@/server/actions/feedback";

const author = { id: "u1", name: "Cam" };

const input = {
  clientKey: "fk_1",
  body: "Drag is fiddly on a phone",
  route: "/trips/t1/plan",
  pageLabel: "Plan editor",
  tripId: "t1",
  tripName: "Europe Summer 2026",
  viewport: "390x844",
  userAgent: "iPhone",
  authoredAt: "2026-09-08T04:05:06.000Z",
};

const row = {
  id: "n1",
  body: input.body,
  route: input.route,
  pageLabel: input.pageLabel,
  tripName: input.tripName,
  authorId: "u1",
  status: "OPEN",
  authoredAt: new Date(input.authoredAt),
  author: { name: "Cam" },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("createFeedbackNote", () => {
  it("stores the note and returns a serialisable view", async () => {
    requireUserMock.mockResolvedValue({ user: author });
    feedbackNoteUpsertMock.mockResolvedValue(row);

    const result = await createFeedbackNote(input);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.note).toEqual({
      id: "n1",
      body: "Drag is fiddly on a phone",
      route: "/trips/t1/plan",
      pageLabel: "Plan editor",
      tripName: "Europe Summer 2026",
      authorId: "u1",
      authorName: "Cam",
      status: "OPEN",
      authoredAt: "2026-09-08T04:05:06.000Z",
    });
  });

  it("upserts on clientKey so a replayed offline flush cannot duplicate", async () => {
    requireUserMock.mockResolvedValue({ user: author });
    feedbackNoteUpsertMock.mockResolvedValue(row);

    await createFeedbackNote(input);

    const args = feedbackNoteUpsertMock.mock.calls[0][0];
    expect(args.where).toEqual({ clientKey: "fk_1" });
    expect(args.update).toEqual({});
    expect(args.create.authorId).toBe("u1");
    expect(args.create.authoredAt).toEqual(new Date(input.authoredAt));
  });

  it("rejects an empty body without touching the database", async () => {
    requireUserMock.mockResolvedValue({ user: author });

    const result = await createFeedbackNote({ ...input, body: "  " });

    expect(result.success).toBe(false);
    expect(feedbackNoteUpsertMock).not.toHaveBeenCalled();
  });
});

describe("listFeedbackNotes", () => {
  it("returns every traveller's notes, oldest first", async () => {
    requireUserMock.mockResolvedValue({ user: author });
    feedbackNoteFindManyMock.mockResolvedValue([row]);

    const result = await listFeedbackNotes();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].authorName).toBe("Cam");
    expect(feedbackNoteFindManyMock.mock.calls[0][0].orderBy).toEqual({
      authoredAt: "asc",
    });
    expect(feedbackNoteFindManyMock.mock.calls[0][0].where).toBeUndefined();
  });
});

describe("deleteFeedbackNote", () => {
  it("deletes the caller's own note", async () => {
    requireUserMock.mockResolvedValue({ user: author });
    feedbackNoteFindUniqueMock.mockResolvedValue({ id: "n1", authorId: "u1" });

    const result = await deleteFeedbackNote("n1");

    expect(result.success).toBe(true);
    expect(feedbackNoteDeleteMock).toHaveBeenCalledWith({ where: { id: "n1" } });
  });

  it("refuses to delete another traveller's note", async () => {
    requireUserMock.mockResolvedValue({ user: author });
    feedbackNoteFindUniqueMock.mockResolvedValue({ id: "n1", authorId: "u2" });

    const result = await deleteFeedbackNote("n1");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors._form).toBeDefined();
    expect(feedbackNoteDeleteMock).not.toHaveBeenCalled();
  });

  it("fails cleanly when the note is already gone", async () => {
    requireUserMock.mockResolvedValue({ user: author });
    feedbackNoteFindUniqueMock.mockResolvedValue(null);

    const result = await deleteFeedbackNote("missing");

    expect(result.success).toBe(false);
    expect(feedbackNoteDeleteMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run server/actions/feedback.test.ts`
Expected: FAIL — cannot resolve `@/server/actions/feedback`.

- [ ] **Step 3: Implement `server/actions/feedback.ts`**

```ts
"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import type { FeedbackStatus } from "@/lib/enums";
import {
  createFeedbackNoteSchema,
  type CreateFeedbackNoteInput,
} from "@/lib/validations/feedback";
import { type ActionResult, fail, ok, validationResult } from "@/lib/action-result";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** A Feedback note as the Feedback panel sees it. Dates are ISO strings. */
export type FeedbackNoteView = {
  id: string;
  body: string;
  route: string;
  pageLabel: string;
  tripName: string | null;
  authorId: string;
  authorName: string;
  status: FeedbackStatus;
  authoredAt: string;
};

type FeedbackNoteRow = {
  id: string;
  body: string;
  route: string;
  pageLabel: string;
  tripName: string | null;
  authorId: string;
  status: string;
  authoredAt: Date;
  author: { name: string | null };
};

const VIEW_SELECT = {
  id: true,
  body: true,
  route: true,
  pageLabel: true,
  tripName: true,
  authorId: true,
  status: true,
  authoredAt: true,
  author: { select: { name: true } },
} as const;

function toView(row: FeedbackNoteRow): FeedbackNoteView {
  return {
    id: row.id,
    body: row.body,
    route: row.route,
    pageLabel: row.pageLabel,
    tripName: row.tripName,
    authorId: row.authorId,
    authorName: row.author.name ?? "Traveller",
    status: row.status as FeedbackStatus,
    authoredAt: row.authoredAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Write a Feedback note (ADR 0040).
 *
 * Deliberately does NOT record an Activity or revalidate any path: a Feedback
 * note is about the software, not the Trip, and no rendered view reads one.
 *
 * Upserts on `clientKey` so an offline flush replayed after a partial failure
 * lands once (ADR 0041).
 */
export async function createFeedbackNote(
  input: CreateFeedbackNoteInput,
): Promise<ActionResult<{ note: FeedbackNoteView }>> {
  const { user } = await requireUser();

  const parsed = createFeedbackNoteSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }
  const { clientKey, authoredAt, ...rest } = parsed.data;

  const row = await db.feedbackNote.upsert({
    where: { clientKey },
    update: {},
    create: {
      clientKey,
      authorId: user.id,
      authoredAt: new Date(authoredAt),
      ...rest,
    },
    select: VIEW_SELECT,
  });

  return ok({ note: toView(row as FeedbackNoteRow) });
}

/**
 * Every Feedback note, from every Traveller, oldest first — the panel reads as
 * a log. Signed-in access only; there is nothing per-user to scope.
 */
export async function listFeedbackNotes(): Promise<
  ActionResult<{ notes: FeedbackNoteView[] }>
> {
  await requireUser();

  const rows = await db.feedbackNote.findMany({
    orderBy: { authoredAt: "asc" },
    select: VIEW_SELECT,
  });

  return ok({ notes: (rows as FeedbackNoteRow[]).map(toView) });
}

/**
 * Delete a Feedback note. Author-only: closing a note is a by-product of the
 * work being done (`npm run feedback:resolve`), never a tidy-up in the app —
 * so the only in-app removal is retracting something you wrote yourself.
 */
export async function deleteFeedbackNote(id: string): Promise<ActionResult> {
  const { user } = await requireUser();

  const note = await db.feedbackNote.findUnique({
    where: { id },
    select: { id: true, authorId: true },
  });
  if (!note) {
    return fail({ _form: ["That feedback has already been removed."] });
  }
  if (note.authorId !== user.id) {
    return fail({ _form: ["You can only delete feedback you wrote."] });
  }

  await db.feedbackNote.delete({ where: { id } });
  return ok();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/actions/feedback.test.ts`
Expected: PASS (7 tests). If `requireUser()` returns a different shape than `{ user }`, fix the *implementation and test* to match `lib/guards.ts` — never the other way round.

- [ ] **Step 5: Baseline and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add server/actions/feedback.ts server/actions/feedback.test.ts
git commit -m "feat(feedback): server actions for writing, listing and deleting notes"
```

---

### Task 4: Offline queue

**Files:**
- Create: `lib/feedback-queue.ts`
- Test: `lib/feedback-queue.test.ts`

**Interfaces:**
- Consumes: nothing (pure `localStorage` logic, no React, no Prisma).
- Produces:
  - `type QueuedFeedbackNote = { clientKey: string; body: string; route: string; pageLabel: string; tripId: string | null; tripName: string | null; viewport: string | null; userAgent: string | null; authoredAt: string }`
  - `readQueue(): QueuedFeedbackNote[]`
  - `enqueue(note: QueuedFeedbackNote): QueuedFeedbackNote[]`
  - `removeFromQueue(clientKey: string): QueuedFeedbackNote[]`
  - `flushQueue(send: (note: QueuedFeedbackNote) => Promise<boolean>): Promise<{ sent: number; remaining: number }>`
  - `newClientKey(): string`

- [ ] **Step 1: Write the failing test**

Create `lib/feedback-queue.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueue,
  flushQueue,
  newClientKey,
  readQueue,
  removeFromQueue,
  type QueuedFeedbackNote,
} from "@/lib/feedback-queue";

const STORAGE_KEY = "teepee.feedback.queue.v1";

function note(overrides: Partial<QueuedFeedbackNote> = {}): QueuedFeedbackNote {
  return {
    clientKey: "fk_1",
    body: "Something is off",
    route: "/trips/t1/plan",
    pageLabel: "Plan editor",
    tripId: "t1",
    tripName: "Europe Summer 2026",
    viewport: "390x844",
    userAgent: "iPhone",
    authoredAt: "2026-09-08T04:05:06.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("readQueue", () => {
  it("is empty when nothing has been queued", () => {
    expect(readQueue()).toEqual([]);
  });

  it("recovers from corrupt storage instead of throwing", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readQueue()).toEqual([]);
  });

  it("discards a stored value that is not an array of notes", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ nope: true }));
    expect(readQueue()).toEqual([]);
  });
});

describe("enqueue", () => {
  it("appends notes in the order they were written", () => {
    enqueue(note({ clientKey: "fk_1" }));
    const queue = enqueue(note({ clientKey: "fk_2" }));
    expect(queue.map((n) => n.clientKey)).toEqual(["fk_1", "fk_2"]);
    expect(readQueue()).toHaveLength(2);
  });

  it("does not queue the same clientKey twice", () => {
    enqueue(note({ clientKey: "fk_1" }));
    const queue = enqueue(note({ clientKey: "fk_1" }));
    expect(queue).toHaveLength(1);
  });

  it("keeps only the newest 50 notes", () => {
    for (let i = 0; i < 55; i++) enqueue(note({ clientKey: `fk_${i}` }));
    const queue = readQueue();
    expect(queue).toHaveLength(50);
    expect(queue[0].clientKey).toBe("fk_5");
  });
});

describe("removeFromQueue", () => {
  it("drops the matching note and leaves the rest", () => {
    enqueue(note({ clientKey: "fk_1" }));
    enqueue(note({ clientKey: "fk_2" }));
    const queue = removeFromQueue("fk_1");
    expect(queue.map((n) => n.clientKey)).toEqual(["fk_2"]);
  });
});

describe("flushQueue", () => {
  it("sends oldest first and clears what landed", async () => {
    enqueue(note({ clientKey: "fk_1" }));
    enqueue(note({ clientKey: "fk_2" }));
    const sender = vi.fn().mockResolvedValue(true);

    const result = await flushQueue(sender);

    expect(sender.mock.calls.map((c) => c[0].clientKey)).toEqual(["fk_1", "fk_2"]);
    expect(result).toEqual({ sent: 2, remaining: 0 });
    expect(readQueue()).toEqual([]);
  });

  it("stops at the first failure and keeps the rest queued in order", async () => {
    enqueue(note({ clientKey: "fk_1" }));
    enqueue(note({ clientKey: "fk_2" }));
    enqueue(note({ clientKey: "fk_3" }));
    const sender = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await flushQueue(sender);

    expect(sender).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 1, remaining: 2 });
    expect(readQueue().map((n) => n.clientKey)).toEqual(["fk_2", "fk_3"]);
  });

  it("treats a thrown sender as a failure rather than losing the note", async () => {
    enqueue(note({ clientKey: "fk_1" }));
    const sender = vi.fn().mockRejectedValue(new Error("offline"));

    const result = await flushQueue(sender);

    expect(result).toEqual({ sent: 0, remaining: 1 });
    expect(readQueue()).toHaveLength(1);
  });
});

describe("newClientKey", () => {
  it("produces distinct keys", () => {
    expect(newClientKey()).not.toBe(newClientKey());
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run lib/feedback-queue.test.ts`
Expected: FAIL — cannot resolve `@/lib/feedback-queue`.

- [ ] **Step 3: Implement `lib/feedback-queue.ts`**

```ts
/**
 * The offline queue for Feedback notes (ADR 0041).
 *
 * This is the app's only offline write. It is safe precisely because a
 * Feedback note is append-only and conflict-free — do NOT read it as a
 * precedent for queueing edits to shared plan state, which ADR 0016 still
 * declines to build.
 *
 * The clientKey is generated once when the note is written and reused on every
 * retry; the server upserts on it, so a replayed flush cannot duplicate.
 */

export type QueuedFeedbackNote = {
  clientKey: string;
  body: string;
  route: string;
  pageLabel: string;
  tripId: string | null;
  tripName: string | null;
  viewport: string | null;
  userAgent: string | null;
  authoredAt: string;
};

const STORAGE_KEY = "teepee.feedback.queue.v1";

/** Keeps a wedged queue from growing without bound on a device that stays offline. */
const MAX_QUEUED = 50;

function isQueuedNote(value: unknown): value is QueuedFeedbackNote {
  if (typeof value !== "object" || value === null) return false;
  const note = value as Record<string, unknown>;
  return (
    typeof note.clientKey === "string" &&
    typeof note.body === "string" &&
    typeof note.route === "string" &&
    typeof note.authoredAt === "string"
  );
}

function write(queue: QueuedFeedbackNote[]): QueuedFeedbackNote[] {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or blocked (private mode). The note is lost either way;
    // failing silently keeps the panel usable.
  }
  return queue;
}

/** The queued notes, oldest first. Corrupt or foreign storage reads as empty. */
export function readQueue(): QueuedFeedbackNote[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedNote);
  } catch {
    return [];
  }
}

/** Append a note, ignoring a clientKey already queued. Returns the new queue. */
export function enqueue(note: QueuedFeedbackNote): QueuedFeedbackNote[] {
  const queue = readQueue();
  if (queue.some((q) => q.clientKey === note.clientKey)) return queue;
  return write([...queue, note].slice(-MAX_QUEUED));
}

/** Drop a note by clientKey. Returns the new queue. */
export function removeFromQueue(clientKey: string): QueuedFeedbackNote[] {
  return write(readQueue().filter((q) => q.clientKey !== clientKey));
}

/**
 * Send queued notes oldest-first, stopping at the first failure so ordering is
 * preserved and a dead connection isn't hammered. `send` resolves true when the
 * note landed; a throw counts as a failure and the note stays queued.
 */
export async function flushQueue(
  send: (note: QueuedFeedbackNote) => Promise<boolean>,
): Promise<{ sent: number; remaining: number }> {
  let sent = 0;
  for (const note of readQueue()) {
    let landed = false;
    try {
      landed = await send(note);
    } catch {
      landed = false;
    }
    if (!landed) break;
    removeFromQueue(note.clientKey);
    sent++;
  }
  return { sent, remaining: readQueue().length };
}

/** A one-off key for a note, stable across retries. */
export function newClientKey(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `fk_${random}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/feedback-queue.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Baseline and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add lib/feedback-queue.ts lib/feedback-queue.test.ts
git commit -m "feat(feedback): offline queue for notes written without signal"
```

---

### Task 5: The Feedback panel

**Files:**
- Create: `lib/feedback-trip-store.ts`
- Create: `components/feedback/feedback-trip-marker.tsx`
- Create: `components/feedback/feedback-launcher.tsx`
- Test: `components/feedback/feedback-launcher.test.tsx`
- Modify: `app/(app)/layout.tsx` (mount the launcher next to `<OfflineBanner />` / `<CommandPaletteMount />`)
- Modify: `app/(app)/trips/[tripId]/layout.tsx` (mount the trip marker)
- Modify: `app/(app)/layout.test.tsx` (assert the launcher renders)

**Interfaces:**
- Consumes: `createFeedbackNote`, `listFeedbackNotes`, `deleteFeedbackNote`, `FeedbackNoteView` (Task 3); `pageLabelForRoute`, `tripIdFromRoute` (Task 2); `enqueue`, `flushQueue`, `newClientKey`, `readQueue`, `QueuedFeedbackNote` (Task 4); `useOnlineStatus` from `@/components/ui/use-online-status`; `Sheet*` from `@/components/ui/sheet`; `Button`, `Textarea`, `toast`.
- Produces: `<FeedbackLauncher />`, `<FeedbackTripMarker tripId tripName />`.

The launcher sits in the app shell and the trip name lives two layouts down, so React context can't carry it upward. Use a module-level external store read with `useSyncExternalStore`.

- [ ] **Step 1: Write `lib/feedback-trip-store.ts`**

```ts
"use client";

/**
 * Which Trip is on screen, for stamping onto a Feedback note.
 *
 * The Feedback panel lives in the app shell; the trip name is only known two
 * layouts below it, so context can't reach upward. A tiny external store does.
 */

export type CurrentTrip = { tripId: string; tripName: string };

let current: CurrentTrip | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function setCurrentTrip(trip: CurrentTrip): void {
  current = trip;
  notify();
}

export function clearCurrentTrip(): void {
  current = null;
  notify();
}

export function subscribeToCurrentTrip(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCurrentTrip(): CurrentTrip | null {
  return current;
}

/** The server never has a current trip — keeps useSyncExternalStore SSR-safe. */
export function getCurrentTripServerSnapshot(): CurrentTrip | null {
  return null;
}
```

- [ ] **Step 2: Write `components/feedback/feedback-trip-marker.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import {
  clearCurrentTrip,
  setCurrentTrip,
} from "@/lib/feedback-trip-store";

/**
 * Renders nothing; tells the Feedback panel which Trip is on screen so a note
 * written here carries the trip's name (snapshotted, see ADR 0040).
 */
export function FeedbackTripMarker({
  tripId,
  tripName,
}: {
  tripId: string;
  tripName: string;
}) {
  useEffect(() => {
    setCurrentTrip({ tripId, tripName });
    return () => clearCurrentTrip();
  }, [tripId, tripName]);

  return null;
}
```

- [ ] **Step 3: Write the failing component test**

Create `components/feedback/feedback-launcher.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createMock, listMock, deleteMock, pathnameMock, onlineMock } = vi.hoisted(
  () => ({
    createMock: vi.fn(),
    listMock: vi.fn(),
    deleteMock: vi.fn(),
    pathnameMock: vi.fn(),
    onlineMock: vi.fn(),
  }),
);

vi.mock("@/server/actions/feedback", () => ({
  createFeedbackNote: createMock,
  listFeedbackNotes: listMock,
  deleteFeedbackNote: deleteMock,
}));

vi.mock("next/navigation", () => ({
  usePathname: pathnameMock,
}));

vi.mock("@/components/ui/use-online-status", () => ({
  useOnlineStatus: onlineMock,
}));

import { FeedbackLauncher } from "@/components/feedback/feedback-launcher";

const existingNote = {
  id: "n1",
  body: "Budget totals look wrong",
  route: "/trips/t1/budget",
  pageLabel: "Budget",
  tripName: "Europe Summer 2026",
  authorId: "u2",
  authorName: "Partner",
  status: "OPEN" as const,
  authoredAt: "2026-09-07T00:00:00.000Z",
};

beforeEach(() => {
  window.localStorage.clear();
  pathnameMock.mockReturnValue("/trips/t1/plan");
  onlineMock.mockReturnValue(true);
  listMock.mockResolvedValue({ success: true, notes: [existingNote] });
  createMock.mockImplementation(async (input) => ({
    success: true,
    note: {
      id: "n2",
      body: input.body,
      route: input.route,
      pageLabel: input.pageLabel,
      tripName: input.tripName,
      authorId: "u1",
      authorName: "Cam",
      status: "OPEN",
      authoredAt: input.authoredAt,
    },
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("FeedbackLauncher", () => {
  it("renders a labelled floating button and no panel until opened", () => {
    render(<FeedbackLauncher />);
    expect(
      screen.getByRole("button", { name: /leave feedback/i }),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/what's on your mind/i)).toBeNull();
  });

  it("shows every traveller's existing notes when opened", async () => {
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));

    expect(await screen.findByText("Budget totals look wrong")).toBeInTheDocument();
    expect(screen.getByText(/Partner/)).toBeInTheDocument();
    expect(screen.getByText(/Budget/)).toBeInTheDocument();
  });

  it("sends a note stamped with the current route and page label", async () => {
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));
    await user.type(
      await screen.findByPlaceholderText(/what's on your mind/i),
      "Dragging is fiddly",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const input = createMock.mock.calls[0][0];
    expect(input.body).toBe("Dragging is fiddly");
    expect(input.route).toBe("/trips/t1/plan");
    expect(input.pageLabel).toBe("Plan editor");
    expect(input.tripId).toBe("t1");
    expect(input.clientKey).toMatch(/^fk_/);
    expect(Number.isNaN(Date.parse(input.authoredAt))).toBe(false);
  });

  it("clears the box after a note is sent", async () => {
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));
    const box = await screen.findByPlaceholderText(/what's on your mind/i);
    await user.type(box, "Dragging is fiddly");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(box).toHaveValue(""));
  });

  it("queues a note written offline and marks it pending", async () => {
    onlineMock.mockReturnValue(false);
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));
    await user.type(
      await screen.findByPlaceholderText(/what's on your mind/i),
      "No signal here",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("No signal here")).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("teepee.feedback.queue.v1")).toContain(
      "No signal here",
    );
  });

  it("flushes the queue once the connection returns", async () => {
    window.localStorage.setItem(
      "teepee.feedback.queue.v1",
      JSON.stringify([
        {
          clientKey: "fk_queued",
          body: "Written on the train",
          route: "/trips/t1/plan",
          pageLabel: "Plan editor",
          tripId: "t1",
          tripName: "Europe Summer 2026",
          viewport: "390x844",
          userAgent: "iPhone",
          authoredAt: "2026-09-08T00:00:00.000Z",
        },
      ]),
    );
    render(<FeedbackLauncher />);

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0].clientKey).toBe("fk_queued");
    await waitFor(() =>
      expect(window.localStorage.getItem("teepee.feedback.queue.v1")).toBe("[]"),
    );
  });

  it("keeps a note that failed to send rather than losing it", async () => {
    createMock.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<FeedbackLauncher />);

    await user.click(screen.getByRole("button", { name: /leave feedback/i }));
    await user.type(
      await screen.findByPlaceholderText(/what's on your mind/i),
      "Server is down",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(window.localStorage.getItem("teepee.feedback.queue.v1")).toContain(
        "Server is down",
      ),
    );
  });
});
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `npx vitest run components/feedback/feedback-launcher.test.tsx`
Expected: FAIL — cannot resolve `@/components/feedback/feedback-launcher`.

- [ ] **Step 5: Implement `components/feedback/feedback-launcher.tsx`**

Read `components/ui/sheet.tsx` for the exact `SheetContent` props (it defaults to `side="bottom"`) and `components/ui/textarea.tsx` before writing. Structure:

```tsx
"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { useOnlineStatus } from "@/components/ui/use-online-status";
import { pageLabelForRoute, tripIdFromRoute } from "@/lib/feedback-context";
import {
  enqueue,
  flushQueue,
  newClientKey,
  readQueue,
  removeFromQueue,
  type QueuedFeedbackNote,
} from "@/lib/feedback-queue";
import {
  getCurrentTrip,
  getCurrentTripServerSnapshot,
  subscribeToCurrentTrip,
} from "@/lib/feedback-trip-store";
import {
  createFeedbackNote,
  deleteFeedbackNote,
  listFeedbackNotes,
  type FeedbackNoteView,
} from "@/server/actions/feedback";

/** A note in the log: either landed on the server, or still queued locally. */
type LogEntry =
  | { kind: "sent"; note: FeedbackNoteView }
  | { kind: "pending"; note: QueuedFeedbackNote };
```

Behaviour to implement:

1. `const pathname = usePathname()`; `const online = useOnlineStatus()`; `const trip = React.useSyncExternalStore(subscribeToCurrentTrip, getCurrentTrip, getCurrentTripServerSnapshot)`.
2. State: `open`, `body`, `sent: FeedbackNoteView[]`, `pending: QueuedFeedbackNote[]`, `isSending`.
3. On mount, and whenever `online` flips to true, call `flush()`:
   ```tsx
   const flush = React.useCallback(async () => {
     const result = await flushQueue(async (note) => {
       const { clientKey, ...rest } = note;
       const res = await createFeedbackNote({ clientKey, ...rest, tripId: note.tripId, tripName: note.tripName });
       return res.success;
     });
     setPending(readQueue());
     if (result.sent > 0 && open) void refresh();
   }, [open]);
   ```
   Run it in an effect keyed on `online`, guarded so it doesn't run while offline.
4. `refresh()` calls `listFeedbackNotes()` and sets `sent` on success. Called when the sheet opens.
5. `send()`:
   - trim the body; ignore empty.
   - build the note: `clientKey: newClientKey()`, `route: pathname`, `pageLabel: pageLabelForRoute(pathname)`, `tripId: trip?.tripId ?? tripIdFromRoute(pathname)`, `tripName: trip?.tripName ?? null`, `viewport: \`${window.innerWidth}x${window.innerHeight}\``, `userAgent: navigator.userAgent.slice(0, 512)`, `authoredAt: new Date().toISOString()`.
   - **Offline** → `enqueue(note)`, `setPending(readQueue())`, clear the box, `toast({ title: "Saved — it'll send when you're back online." })`.
   - **Online** → `enqueue(note)` first (so a crash mid-send cannot lose it), then `createFeedbackNote(...)`; on success `removeFromQueue(note.clientKey)`, append the returned note to `sent`, clear the box; on failure or throw leave it queued, `setPending(readQueue())` and `toast({ variant: "destructive", title: "Couldn't send that just yet — it's saved and will retry." })`.
6. Log rendering: `sent` (ascending by `authoredAt`) then `pending` beneath, newest last. Each entry shows `authorName · pageLabel · relative time` above the body; a pending entry shows a "Pending" badge instead of the author; a `DONE`/`WONTFIX` note renders with `text-muted-foreground line-through decoration-1` and a "Done" / "Won't fix" badge. Empty state: "No feedback yet. Tell me what's annoying."
7. Delete control (`Trash2`, `aria-label={`Delete "${first 30 chars}"`}`) shown only when `note.authorId === currentUserId`. **The launcher does not know the current user id** — pass it in: `<FeedbackLauncher currentUserId={session.user.id} />` from the app layout, typed `{ currentUserId: string }`. Deleting calls `deleteFeedbackNote(id)` and drops it from `sent` on success.
8. The trigger button:
   ```tsx
   <Button
     type="button"
     size="icon"
     variant="secondary"
     aria-label="Leave feedback about TEEPEE"
     onClick={() => setOpen(true)}
     className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-40 size-11 rounded-full shadow-lg"
   >
     <MessageSquarePlus className="size-5" aria-hidden />
   </Button>
   ```
   Bottom-**left** is deliberate: `components/ui/toast.tsx` owns the bottom-right and reserves `4rem` of bottom padding on mobile.
9. Sheet content: `<SheetTitle>Feedback</SheetTitle>`, `<SheetDescription>` naming the current page ("You're on Plan editor"), the log, then the textarea with `placeholder="What's on your mind?"` and a `Send` button (disabled while `isSending` or the trimmed body is empty).

Update the test's expectations only if a genuine API mismatch appears (e.g. `Textarea` needs different props) — never weaken an assertion to make it pass.

- [ ] **Step 6: Run the component test**

Run: `npx vitest run components/feedback/feedback-launcher.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 7: Mount the launcher in the app shell**

In `app/(app)/layout.tsx`, import `FeedbackLauncher` and render it inside the outer `div`, after `<CommandPaletteMount />`:

```tsx
<FeedbackLauncher currentUserId={session.user.id} />
```

- [ ] **Step 8: Mount the trip marker**

In `app/(app)/trips/[tripId]/layout.tsx`, import `FeedbackTripMarker` and render `<FeedbackTripMarker tripId={tripId} tripName={trip.name} />` alongside the existing offline warmer.

- [ ] **Step 9: Assert the shell renders it**

Add to `app/(app)/layout.test.tsx`, following whatever mocking that file already does:

```tsx
it("mounts the feedback launcher for a signed-in traveller", async () => {
  render(await AppLayout({ children: <div /> }));
  expect(
    screen.getByRole("button", { name: /leave feedback/i }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 10: Baseline and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add lib/feedback-trip-store.ts components/feedback app/\(app\)/layout.tsx app/\(app\)/layout.test.tsx "app/(app)/trips/[tripId]/layout.tsx"
git commit -m "feat(feedback): floating panel for writing notes from any screen"
```

---

### Task 6: Inbox renderer

**Files:**
- Create: `lib/feedback-inbox.ts`
- Test: `lib/feedback-inbox.test.ts`

**Interfaces:**
- Consumes: `areaForRoute` (Task 2).
- Produces:
  - `type InboxNote = { id: string; body: string; route: string; pageLabel: string; tripName: string | null; authorName: string; status: FeedbackStatus; authoredAt: Date; resolvedAt: Date | null; resolution: string | null }`
  - `renderInbox(notes: InboxNote[], generatedAt: Date): string`

Pure string rendering, no Prisma import — the script feeds it rows.

- [ ] **Step 1: Write the failing test**

Create `lib/feedback-inbox.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderInbox, type InboxNote } from "@/lib/feedback-inbox";

const generatedAt = new Date("2026-09-08T10:00:00.000Z");

function note(overrides: Partial<InboxNote> = {}): InboxNote {
  return {
    id: "n1",
    body: "Dragging is fiddly on a phone",
    route: "/trips/t1/plan",
    pageLabel: "Plan editor",
    tripName: "Europe Summer 2026",
    authorName: "Cam",
    status: "OPEN",
    authoredAt: new Date("2026-09-07T08:00:00.000Z"),
    resolvedAt: null,
    resolution: null,
    ...overrides,
  };
}

describe("renderInbox", () => {
  it("says so plainly when there is nothing to work on", () => {
    const md = renderInbox([], generatedAt);
    expect(md).toContain("# Feedback inbox");
    expect(md).toContain("No open feedback notes.");
  });

  it("warns that the file is generated", () => {
    expect(renderInbox([], generatedAt)).toContain(
      "Generated by `npm run feedback:pull`",
    );
  });

  it("groups open notes under their area heading", () => {
    const md = renderInbox(
      [
        note({ id: "n1", route: "/trips/t1/plan" }),
        note({ id: "n2", route: "/trips/t1/budget", body: "Totals look wrong" }),
      ],
      generatedAt,
    );
    expect(md).toContain("## Open");
    expect(md).toContain("### Plan editor");
    expect(md).toContain("### Money");
    expect(md.indexOf("### Money")).toBeGreaterThan(md.indexOf("### Plan editor"));
  });

  it("prints the id so it can be pasted into feedback:resolve", () => {
    expect(renderInbox([note()], generatedAt)).toContain("`n1`");
  });

  it("carries the circumstances of each note", () => {
    const md = renderInbox([note()], generatedAt);
    expect(md).toContain("Dragging is fiddly on a phone");
    expect(md).toContain("/trips/t1/plan");
    expect(md).toContain("Europe Summer 2026");
    expect(md).toContain("Cam");
    expect(md).toContain("2026-09-07");
  });

  it("indents a multi-line body so the markdown stays a single item", () => {
    const md = renderInbox([note({ body: "line one\nline two" })], generatedAt);
    expect(md).toContain("line one");
    expect(md).toContain("line two");
    expect(md).not.toMatch(/^line two/m);
  });

  it("keeps resolved notes below, newest resolution first, with the resolution line", () => {
    const md = renderInbox(
      [
        note({ id: "old", status: "DONE", body: "Fixed ages ago", resolvedAt: new Date("2026-09-01T00:00:00.000Z"), resolution: "Fixed in the plan editor" }),
        note({ id: "recent", status: "WONTFIX", body: "Not doing this", resolvedAt: new Date("2026-09-05T00:00:00.000Z"), resolution: "Out of scope" }),
      ],
      generatedAt,
    );
    expect(md).toContain("## Resolved");
    expect(md.indexOf("## Open")).toBeLessThan(md.indexOf("## Resolved"));
    expect(md.indexOf("Not doing this")).toBeLessThan(md.indexOf("Fixed ages ago"));
    expect(md).toContain("Out of scope");
    expect(md).toContain("Won't fix");
  });

  it("counts the open notes in the summary line", () => {
    const md = renderInbox([note({ id: "a" }), note({ id: "b" })], generatedAt);
    expect(md).toContain("2 open");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run lib/feedback-inbox.test.ts`
Expected: FAIL — cannot resolve `@/lib/feedback-inbox`.

- [ ] **Step 3: Implement `lib/feedback-inbox.ts`**

```ts
import type { FeedbackStatus } from "@/lib/enums";
import { areaForRoute } from "@/lib/feedback-context";

/** A Feedback note as the inbox renders it. */
export type InboxNote = {
  id: string;
  body: string;
  route: string;
  pageLabel: string;
  tripName: string | null;
  authorName: string;
  status: FeedbackStatus;
  authoredAt: Date;
  resolvedAt: Date | null;
  resolution: string | null;
};

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  OPEN: "Open",
  DONE: "Done",
  WONTFIX: "Won't fix",
};

/** "2026-09-07" — the day is enough context; the exact minute never is. */
function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Indent continuation lines so a multi-line body stays one list item. */
function indentBody(body: string): string {
  return body.trim().split("\n").join("\n  ");
}

function renderNote(note: InboxNote): string {
  const meta = [
    note.pageLabel,
    note.tripName,
    note.authorName,
    day(note.authoredAt),
  ]
    .filter(Boolean)
    .join(" · ");

  const lines = [
    `- **${meta}** — \`${note.id}\``,
    `  ${indentBody(note.body)}`,
    `  _${note.route}_`,
  ];

  if (note.status !== "OPEN") {
    const resolved = note.resolvedAt ? ` on ${day(note.resolvedAt)}` : "";
    lines.push(
      `  → **${STATUS_LABELS[note.status]}**${resolved}${note.resolution ? `: ${note.resolution}` : ""}`,
    );
  }

  return lines.join("\n");
}

/**
 * Render the Feedback inbox (ADR 0040).
 *
 * Open notes first, grouped by the area they came from and oldest first within
 * each group — the oldest annoyance has been annoying the longest. Resolved
 * notes follow as history, most recently resolved first.
 */
export function renderInbox(notes: InboxNote[], generatedAt: Date): string {
  const open = notes
    .filter((n) => n.status === "OPEN")
    .sort((a, b) => a.authoredAt.getTime() - b.authoredAt.getTime());
  const resolved = notes
    .filter((n) => n.status !== "OPEN")
    .sort(
      (a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0),
    );

  const out: string[] = [
    "# Feedback inbox",
    "",
    "Feedback notes written from inside TEEPEE (ADR 0040). **Generated by " +
      "`npm run feedback:pull` — do not edit by hand; the database is the truth " +
      "and this file is its printout.** Close a note with " +
      "`npm run feedback:resolve -- <id> --note \"what you did\"`.",
    "",
    `_${open.length} open, ${resolved.length} resolved · pulled ${generatedAt.toISOString()}_`,
    "",
    "## Open",
    "",
  ];

  if (open.length === 0) {
    out.push("No open feedback notes.", "");
  } else {
    const areas = new Map<string, InboxNote[]>();
    for (const note of open) {
      const area = areaForRoute(note.route);
      const bucket = areas.get(area);
      if (bucket) bucket.push(note);
      else areas.set(area, [note]);
    }
    for (const [area, bucket] of areas) {
      out.push(`### ${area}`, "");
      for (const note of bucket) out.push(renderNote(note), "");
    }
  }

  if (resolved.length > 0) {
    out.push("## Resolved", "");
    for (const note of resolved) out.push(renderNote(note), "");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
```

Group ordering follows first-appearance in the open list (`Map` preserves insertion order), which is why the test's Plan-editor note is authored before the Budget one.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/feedback-inbox.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Baseline and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add lib/feedback-inbox.ts lib/feedback-inbox.test.ts
git commit -m "feat(feedback): render the feedback inbox markdown"
```

---

### Task 7: `feedback:pull` — export the inbox

**Files:**
- Create: `scripts/feedback-pull.ts`
- Create: `docs/feedback/.gitkeep` (the generated `inbox.md` lands beside it on first run)
- Modify: `package.json` (add the `feedback:pull` script; add `dotenv` to `devDependencies`)

**Interfaces:**
- Consumes: `renderInbox`, `InboxNote` (Task 6); `db` from `@/lib/db`.
- Produces: `npm run feedback:pull [-- --dry-run]`, writing `docs/feedback/inbox.md`.

`dotenv` is currently only present transitively (via Prisma). This script depends on it directly, so declare it.

- [ ] **Step 1: Add the dependency and script**

```bash
npm install --save-dev dotenv
```

In `package.json` `scripts`, after `sweep:orphaned-costs`:

```json
"feedback:pull": "tsx scripts/feedback-pull.ts",
```

- [ ] **Step 2: Write `scripts/feedback-pull.ts`**

```ts
/**
 * Export Feedback notes to docs/feedback/inbox.md (ADR 0040).
 *
 * Run command:
 *   npx tsx scripts/feedback-pull.ts [--dry-run]
 *
 * Or via the npm script:
 *   npm run feedback:pull [-- --dry-run]
 *
 * What it does:
 *   Reads every FeedbackNote row and rewrites docs/feedback/inbox.md — open
 *   notes grouped by area, resolved ones beneath as history. The file is
 *   generated: hand edits are overwritten on the next run.
 *
 *   READ-ONLY against the database. The only writer is
 *   scripts/feedback-resolve.ts, and it only touches status fields.
 *
 *   Reads production by default when .env.production.local exists (that is
 *   where the notes actually are — the app is used deployed), falling back to
 *   whatever DATABASE_URL is already set. --dry-run prints the markdown to
 *   stdout instead of writing the file.
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";

const DRY_RUN = process.argv.includes("--dry-run");

const PROD_ENV = path.join(process.cwd(), ".env.production.local");
if (existsSync(PROD_ENV)) {
  config({ path: PROD_ENV, override: true });
} else {
  config();
}

// Imported after the env is loaded — lib/db reads DATABASE_URL at import time.
const { db } = await import("../lib/db");
const { renderInbox } = await import("../lib/feedback-inbox");
const { FEEDBACK_STATUSES } = await import("../lib/enums");

const OUT_PATH = path.join(process.cwd(), "docs", "feedback", "inbox.md");

async function main() {
  const rows = await db.feedbackNote.findMany({
    orderBy: { authoredAt: "asc" },
    select: {
      id: true,
      body: true,
      route: true,
      pageLabel: true,
      tripName: true,
      status: true,
      authoredAt: true,
      resolvedAt: true,
      resolution: true,
      author: { select: { name: true } },
    },
  });

  const notes = rows.map((row) => ({
    id: row.id,
    body: row.body,
    route: row.route,
    pageLabel: row.pageLabel,
    tripName: row.tripName,
    authorName: row.author.name ?? "Traveller",
    status: (FEEDBACK_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as (typeof FEEDBACK_STATUSES)[number])
      : ("OPEN" as const),
    authoredAt: row.authoredAt,
    resolvedAt: row.resolvedAt,
    resolution: row.resolution,
  }));

  const markdown = renderInbox(notes, new Date());

  if (DRY_RUN) {
    console.log(markdown);
  } else {
    await mkdir(path.dirname(OUT_PATH), { recursive: true });
    await writeFile(OUT_PATH, markdown, "utf8");
    const open = notes.filter((n) => n.status === "OPEN").length;
    console.log(
      `Wrote ${path.relative(process.cwd(), OUT_PATH)} — ${open} open, ${notes.length - open} resolved.`,
    );
  }

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
```

If top-level `await import` trips the TypeScript config, switch to static imports and call `config()` in a tiny `scripts/load-env.ts` imported first — check `tsconfig.json`'s `module` setting before choosing.

- [ ] **Step 3: Create the docs directory placeholder**

```bash
mkdir -p docs/feedback && touch docs/feedback/.gitkeep
```

- [ ] **Step 4: Verify the script runs end to end against production**

Run: `npm run feedback:pull -- --dry-run`
Expected: the rendered markdown on stdout (an empty inbox until the first note is written — "No open feedback notes."). If the connection fails, report it; do **not** claim the script verified.

Then run it for real: `npm run feedback:pull` — expect `docs/feedback/inbox.md` to be created.

- [ ] **Step 5: Baseline and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add package.json package-lock.json scripts/feedback-pull.ts docs/feedback
git commit -m "feat(feedback): feedback:pull exports the inbox from production"
```

---

### Task 8: `feedback:resolve` — close a note

**Files:**
- Create: `scripts/feedback-resolve.ts`
- Create: `lib/feedback-resolve-args.ts`
- Test: `lib/feedback-resolve-args.test.ts`
- Modify: `package.json` (add the `feedback:resolve` script)

**Interfaces:**
- Consumes: `FEEDBACK_STATUSES` (Task 1).
- Produces:
  - `parseResolveArgs(argv: string[]): { id: string; status: FeedbackStatus; resolution: string | null } | { error: string }`
  - `npm run feedback:resolve -- <id> --note "what you did" [--wontfix]`

Arg parsing is the only part worth testing, so it lives in `lib/` where the suite reaches it.

- [ ] **Step 1: Write the failing test**

Create `lib/feedback-resolve-args.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseResolveArgs } from "@/lib/feedback-resolve-args";

describe("parseResolveArgs", () => {
  it("marks a note done with a resolution", () => {
    expect(parseResolveArgs(["n1", "--note", "Fixed the drag handle"])).toEqual({
      id: "n1",
      status: "DONE",
      resolution: "Fixed the drag handle",
    });
  });

  it("accepts --note=value form", () => {
    expect(parseResolveArgs(["n1", "--note=Fixed it"])).toEqual({
      id: "n1",
      status: "DONE",
      resolution: "Fixed it",
    });
  });

  it("marks a note won't fix", () => {
    expect(
      parseResolveArgs(["n1", "--wontfix", "--note", "Out of scope"]),
    ).toEqual({ id: "n1", status: "WONTFIX", resolution: "Out of scope" });
  });

  it("allows closing without a resolution line", () => {
    expect(parseResolveArgs(["n1"])).toEqual({
      id: "n1",
      status: "DONE",
      resolution: null,
    });
  });

  it("errors when no id is given", () => {
    expect(parseResolveArgs([])).toEqual({
      error: expect.stringContaining("id"),
    });
  });

  it("errors when --note has no value", () => {
    expect(parseResolveArgs(["n1", "--note"])).toEqual({
      error: expect.stringContaining("--note"),
    });
  });

  it("errors on an unknown flag rather than silently ignoring it", () => {
    expect(parseResolveArgs(["n1", "--done"])).toEqual({
      error: expect.stringContaining("--done"),
    });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run lib/feedback-resolve-args.test.ts`
Expected: FAIL — cannot resolve `@/lib/feedback-resolve-args`.

- [ ] **Step 3: Implement `lib/feedback-resolve-args.ts`**

```ts
import type { FeedbackStatus } from "@/lib/enums";

export type ResolveArgs = {
  id: string;
  status: FeedbackStatus;
  resolution: string | null;
};

/**
 * Parse `feedback:resolve` arguments.
 *
 * Usage: <id> [--note "what you did" | --note=…] [--wontfix]
 * Unknown flags are an error, not a shrug — a typo'd flag must never look like
 * a successful close.
 */
export function parseResolveArgs(
  argv: string[],
): ResolveArgs | { error: string } {
  let id: string | null = null;
  let status: FeedbackStatus = "DONE";
  let resolution: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--wontfix") {
      status = "WONTFIX";
    } else if (arg === "--note") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return { error: "--note needs a value, e.g. --note \"fixed the drag handle\"" };
      }
      resolution = value;
      i++;
    } else if (arg.startsWith("--note=")) {
      resolution = arg.slice("--note=".length);
    } else if (arg.startsWith("--")) {
      return { error: `Unknown flag ${arg}` };
    } else if (id === null) {
      id = arg;
    } else {
      return { error: `Unexpected argument ${arg}` };
    }
  }

  if (!id) {
    return {
      error: "A feedback note id is required, e.g. npm run feedback:resolve -- n1 --note \"fixed\"",
    };
  }

  return { id, status, resolution: resolution?.trim() || null };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/feedback-resolve-args.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Write `scripts/feedback-resolve.ts`**

```ts
/**
 * Close a Feedback note (ADR 0040).
 *
 * Run command:
 *   npm run feedback:resolve -- <id> --note "what you did" [--wontfix]
 *
 * Status changes when the work actually lands — this is the only writer to the
 * FeedbackNote table outside the app, and it touches only status, resolution
 * and resolvedAt. Re-run `npm run feedback:pull` afterwards to refresh the
 * inbox.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

const PROD_ENV = path.join(process.cwd(), ".env.production.local");
if (existsSync(PROD_ENV)) {
  config({ path: PROD_ENV, override: true });
} else {
  config();
}

const { db } = await import("../lib/db");
const { parseResolveArgs } = await import("../lib/feedback-resolve-args");

async function main() {
  const parsed = parseResolveArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.error(parsed.error);
    process.exit(1);
  }

  const existing = await db.feedbackNote.findUnique({
    where: { id: parsed.id },
    select: { id: true, body: true },
  });
  if (!existing) {
    console.error(`No feedback note with id ${parsed.id}.`);
    process.exit(1);
  }

  await db.feedbackNote.update({
    where: { id: parsed.id },
    data: {
      status: parsed.status,
      resolution: parsed.resolution,
      resolvedAt: new Date(),
    },
  });

  console.log(
    `${parsed.status === "DONE" ? "Done" : "Won't fix"}: ${existing.body.slice(0, 60)}`,
  );
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
```

Add to `package.json` `scripts`:

```json
"feedback:resolve": "tsx scripts/feedback-resolve.ts",
```

- [ ] **Step 6: Verify the failure paths without touching data**

Run: `npm run feedback:resolve` → expects the "id is required" message and exit 1.
Run: `npm run feedback:resolve -- does-not-exist --note "x"` → expects "No feedback note with id does-not-exist." and exit 1.

- [ ] **Step 7: Baseline and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add package.json scripts/feedback-resolve.ts lib/feedback-resolve-args.ts lib/feedback-resolve-args.test.ts
git commit -m "feat(feedback): feedback:resolve closes a note with a resolution line"
```

---

### Task 9: Wire the inbox into every session

**Files:**
- Modify: `/work/CLAUDE.md`
- Modify: `README.md` (scripts section)
- Modify: `docs/HANDOFF.md` (note the two scripts need `.env.production.local`)

**Interfaces:**
- Consumes: the `feedback:pull` / `feedback:resolve` scripts (Tasks 7–8).
- Produces: nothing code-level.

- [ ] **Step 1: Add the session instruction to `CLAUDE.md`**

Insert **above** the existing "At the start of every session, use the grill-with-docs skill…" line:

```markdown
## Feedback inbox — read this first

At the start of every session, before the grilling interview:

1. Run `npm run feedback:pull` — it rewrites `docs/feedback/inbox.md` from the
   Feedback notes written inside the app.
2. Read the inbox and lead with what's open in it.
3. Commit the refreshed `docs/feedback/inbox.md` on your working branch.

Close a note only when the work has actually landed:
`npm run feedback:resolve -- <id> --note "what you did"`. Never hand-edit
`docs/feedback/inbox.md` — it is generated (ADR 0040).
```

- [ ] **Step 2: Document the scripts in `README.md`**

Add to whichever list covers npm scripts, matching its existing formatting:

```markdown
| `npm run feedback:pull` | Rewrite `docs/feedback/inbox.md` from the Feedback notes written in the app (read-only; reads production when `.env.production.local` is present). |
| `npm run feedback:resolve -- <id> --note "…"` | Mark a Feedback note Done (or `--wontfix`). |
```

- [ ] **Step 3: Note the credential requirement in `docs/HANDOFF.md`**

Add a short subsection stating that both feedback scripts read `.env.production.local` when present and otherwise fall back to the local `.env`, and that `feedback:pull` never writes to the database.

- [ ] **Step 4: Verify the docs are true**

Run: `npm run feedback:pull -- --dry-run`
Expected: succeeds, confirming the documented command works exactly as written.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md docs/HANDOFF.md
git commit -m "docs(feedback): read the inbox at session start"
```

---

## Self-review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| Floating button, bottom-left, every signed-in route, safe-area aware | 5 |
| Not on `/signin` or `/share/[token]` | 5 (mounted in `(app)` layout only — those routes are outside it) |
| Log of existing notes, newest last, author + page + relative time | 5 |
| Resolved notes greyed out in the log | 5 |
| All travellers write, everyone sees | 3 (`listFeedbackNotes` unscoped), 5 |
| No type picker — text and send | 5 |
| Author can delete own note, hard delete | 3, 5 |
| Never in Activity / planning views / Summary / Calendar feed | 3 (no `recordActivity`, no `revalidatePath`) |
| Records route, page label, trip id + name snapshot, author, time, viewport, UA | 1 (columns), 5 (collection) |
| Trip snapshot survives Trip deletion | 1 (no FK on `tripId`) |
| Offline queue, pending state, flush on reconnect, idempotent | 4, 5 |
| Status Open/Done/Won't fix in Postgres | 1, 8 |
| `feedback:pull` → `docs/feedback/inbox.md`, open first then resolved | 6, 7 |
| Generated, never hand-edited | 6 (banner), 9 (instruction) |
| `CLAUDE.md` session wiring + commit the refresh | 9 |
| Unified action result, ADR 0026/0029 UI conventions, vitest with mocked db | Global Constraints, all tasks |

**Placeholder scan:** none — every step carries the actual code or the actual command. Task 5 Step 5 is prose-plus-skeleton rather than a full component listing, deliberately: the exact JSX must follow `sheet.tsx`/`textarea.tsx` as they actually are, and the test in Step 3 is the specification it has to satisfy.

**Type consistency:** `FeedbackNoteView` (Task 3) is what Task 5 renders; `QueuedFeedbackNote` (Task 4) is what Task 5 queues; `InboxNote` (Task 6) is what Task 7 builds; `FeedbackStatus` (Task 1) is used by Tasks 3, 6, 8. `clientKey` is the duplicate guard in Tasks 1, 3, 4 alike. `areaForRoute`/`pageLabelForRoute`/`tripIdFromRoute` (Task 2) are consumed by Tasks 5 and 6 under those exact names.
