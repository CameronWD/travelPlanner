# Planning model (Branch 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Booking state** to Items, Transport and Accommodation, a **Slot time** to Items and **Opening hours** to Items, each with its forms, display and Booking import and MCP support. Also show the owning Stop of each Changeover-day Item in Claude's reads.

**Architecture:** Five sections, in order: S → A → B → C → D, then gate Z.
- **S:** one migration for every new column, plus the zod schemas and pure helpers: `lib/booking-state.ts`, `lib/slot-time.ts` and `lib/opening-hours.ts` with `hoursOn`.
- **A:** wires Booking state through the actions, forms, Booking import and MCP.
- **B:** displays it: badges, plus a "Still to book" list on Home.
- **C:** Slot time, end to end.
- **D:** Opening hours (copied into placed copies; edits written across the whole family), plus the Changeover owner in MCP reads.

**Tech Stack:** Next.js 16.4, React 19.3, Prisma 7.10 (hand-written SQL migration), zod 4, Vitest 4, Testing Library.

**Spec:** `docs/specs/2026-10-17-planning-model-and-review.md`, Branch 1 (R2, R3, R4, R5 and the Branch-1 tools in R13). Vocabulary: `CONTEXT.md` (**Booking state**, **Slot time**, **Opening hours**, **Changeover day**). Each section opens with **Notes**, recording the interfaces it uses and the decisions it made where the spec is silent. Task Z writes those decisions into the spec as "As built".

## Global Constraints

- **Branch:** `feat/planning-model`.
  - Never commit to, merge into, rebase onto or push `main`. Never deploy.
  - Never run `feedback:resolve`, `feedback:accept` or `feedback:pull` (subagents especially).
  - Don't commit `next dev`'s CLAUDE.md block.
- **Section S's actual exports are authoritative.** Sections A–D were drafted in parallel and sometimes assumed different names or types. Wherever an assumption differs, use what S built, and note it in your report. Known differences:
  - **`refundable`:** S stores `Boolean?`, with null meaning not known. C assumed an enum.
  - **`openingHours`:** S stores a JSON string column with parse/serialise in `lib/validations/opening-hours.ts`. D assumed `Json?`.
  - **`hoursOn`:** returns S's `DayHours | null`, which also carries `by` and `seasonLabel`.
  - **Booking write rule:** S's `lib/booking-state.ts` (`effectiveBookingState`, `bookingStateWrite`, `activeBookBy`) is the rule. A must reuse it, not duplicate it in a second module.
  - Re-grep S's files before each later task.
- **Vocabulary:** Booking state (*No booking needed* / *To book* / *Booked*); "booking is not paying"; Slot time and arrive-by; Opening hours; Traveller; What-if plan (Claude-facing) / Fork (code). Never "member" in Traveller-facing copy.
- **Verification:**
  - Inner loop: `npx vitest run <files>`.
  - Task end: `npx vitest related --run <changed>` + `npx tsc --noEmit` + `npx eslint <changed>` + the task's integration file.
  - Never the full suite or `next build` per task.
- **Integration tier in the sandbox:** no Docker. Start the throwaway Postgres with `/tmp/claude-1000/-work/9a77e9b0-ef00-4a02-8c0f-84c338d2470c/scratchpad/pg/start.sh`, then `npm run test:integration -- <file>` with `DATABASE_URL="postgresql://trip:trip@localhost:5432/trip?schema=public"` and `DIRECT_URL` the same exported. Apply migrations with `npx prisma migrate deploy` (same URLs) and run `npx prisma generate`. Never host.docker.internal or a production URL.
- **`next build`:** never in /work, because it reads `.env.production.local`. Task Z builds in a throwaway copy.
- **Code rules:**
  - Import boundaries are ESLint errors.
  - Actions return `ActionResult` (ADR 0074).
  - Updates are PATCH (ADR 0075); forms use `toPatch(input, X_CLEARABLE)`.
  - Every MCP write goes through `runWrite` and returns the row (the F6 contract), and the "no write returns `{}`" walker test (`lib/mcp/tools/write-returns.test.ts`, or wherever F.18 put it) must cover every new write tool.
  - MCP read shapes come from `lib/mcp/reads/plan-shapes.ts`, so `get_trip_plan` and the narrow reads agree.
  - Readers of Items or Accommodation outside `readPlan` are listed in `eslint.config.mjs` `SURPRISE_VISIBILITY_READERS`.
  - A Prisma or `*-reads.ts` change extends `test/integration/`. Bug fixes go test-first. Rewrite mocks, keep assertions.
  - Copy strings: no em-dashes (`test/copy-style.test.ts`).
- **Commits:** `type(scope): …`, ending with:
  ```
  Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LnCyba4taLzC7WxHYP3aUz
  ```
  **Task D.13's commit alone** also carries `Resolves-Feedback: cmvaig4j5000u07gwgeqrvtkd`, on its own line before Co-Authored-By.
- **Line numbers are as of `1eb7c5e2`.** Re-grep. Drift caused by earlier tasks is expected.

## Review Focus

1. **Existing data after the migration:** a leg with a reference reads Booked. A leg without one reads To book, and an Item with no `booking` reads No booking needed. A blank reference doesn't count as a reference. Re-running the backfill changes nothing. Tested in S.1 (integration).
2. **A Traveller types a booking reference on a To book leg they never set by hand:** it becomes Booked. If they chose To book themselves, it stays To book. Tested in A (`booking-state` integration).
3. **A Slot time set on an Item that already has a start time:** the start time is never overwritten. With no start, it becomes slot minus arrive-by, clamped at 00:00. Tested in C.1–C.4.
4. **Opening hours across a season boundary and a closed date:** a season running from December to February applies on 5 Jan. A closed date inside a season wins. A weekday the season doesn't mention falls back to the usual week. An Item with no hours is "not known", never "closed". Tested in S.4–S.6, with D's display tests.
5. **Surprise:** a hidden Item's Booking state, Slot time and Opening hours never reach the surprised Traveller, not in "Still to book", not on a placeholder, not in MCP reads. Tested in B (Home integration), C.7, D, and A.14 (narrow reads).

---

## Section S — Schema, one migration, validations, enums and pure helpers

### Notes

**What this section produces for later sections (exact names):**

- Prisma columns (one migration, `prisma/migrations/20261017120000_planning_model/migration.sql`):
  - `Item.bookingState String @default("NONE")`, `Item.bookingStateSet Boolean @default(false)`, `Item.bookBy String?`, `Item.slotTime String?`, `Item.arriveByMinutes Int?`, `Item.refundable Boolean?`, `Item.openingHours String?`
  - `Transport.bookingState String @default("TO_BOOK")`, `Transport.bookingStateSet Boolean @default(false)`, `Transport.bookBy String?`
  - `Accommodation.bookingState String @default("TO_BOOK")`, `Accommodation.bookingStateSet Boolean @default(false)`, `Accommodation.bookBy String?`
- `lib/enum-values.ts`: `BOOKING_STATES = ["NONE", "TO_BOOK", "BOOKED"] as const`, `type BookingState`. `lib/enums.ts`: `bookingStateSchema = z.enum(BOOKING_STATES)`.
- `lib/booking-state.ts` (zod-free, client-safe):
  ```ts
  export type BookingSubject = "ITEM" | "TRANSPORT" | "ACCOMMODATION";
  export const BOOKING_STATE_LABELS: Record<BookingState, string>; // "No booking needed" | "To book" | "Booked"
  export function isBookingState(v: unknown): v is BookingState;
  export function defaultBookingState(subject: BookingSubject): BookingState;
  export function hasBookingReference(reference: string | null | undefined): boolean;
  export function derivedBookingState(subject: BookingSubject, reference: string | null | undefined): BookingState;
  export interface BookingStateRow { bookingState?: string | null; bookingStateSet?: boolean | null }
  export interface BookingStateColumns { bookingState: BookingState; bookingStateSet: boolean }
  export function effectiveBookingState(subject: BookingSubject, row: BookingStateRow, reference: string | null | undefined): BookingState;
  export function bookingStateWrite(subject: BookingSubject, current: BookingStateRow | null, change: BookingState | null | undefined, reference: string | null | undefined): BookingStateColumns;
  export function activeBookBy(state: string | null | undefined, bookBy: string | null | undefined): string | null;
  ```
- `lib/slot-time.ts` (zod-free): `export const MAX_ARRIVE_BY_MINUTES = 720;` `export function defaultStartFromSlot(slot: string | null | undefined, arriveByMinutes: number | null | undefined): string | null;`
- `lib/opening-hours.ts` (zod-free, client-safe):
  ```ts
  export const WEEKDAYS: readonly ["sun","mon","tue","wed","thu","fri","sat"]; // index = Date#getUTCDay()
  export type Weekday; export type HoursSpan = [open: string, close: string];
  export type WeekHours = Partial<Record<Weekday, HoursSpan[]>>; // key absent = not known, [] = closed
  export interface OpeningSeason { label?: string; from: string /* MM-DD */; to: string /* MM-DD */; week: WeekHours }
  export interface OpeningHours { week: WeekHours; seasons: OpeningSeason[]; closed: string[] /* YYYY-MM-DD or MM-DD */; source?: string }
  export interface DayHours { closed: boolean; spans: HoursSpan[]; by: "closed-date" | "season" | "week"; seasonLabel: string | null }
  export const MAX_SPANS_PER_DAY = 2; export const MAX_SEASONS = 12; export const MAX_CLOSED_DATES = 200;
  export function seasonCovers(season: Pick<OpeningSeason, "from" | "to">, monthDay: string): boolean;
  export function seasonOn(oh: OpeningHours, dateISO: string): OpeningSeason | null;
  export function isClosedDate(oh: OpeningHours, dateISO: string): boolean;
  export function hoursOn(oh: OpeningHours | null | undefined, dateISO: string): DayHours | null; // null = not known
  export function isEmptyOpeningHours(oh: OpeningHours): boolean;
  export function openingHoursFamilyRoot(item: { id: string; sourceItemId: string | null }): string;
  export function openingHoursFamilyWhere(tripId: string, rootId: string): { tripId: string; OR: [{ id: string }, { sourceItemId: string }] };
  ```
- `lib/validations/opening-hours.ts` (zod, server): `monthDaySchema`, `daySpansSchema`, `weekHoursSchema`, `openingSeasonSchema`, `openingHoursSchema`, `type OpeningHoursInput = z.input<typeof openingHoursSchema>`, `parseOpeningHours(raw: string | null | undefined): OpeningHours | null`, `serializeOpeningHours(oh: OpeningHours | null | undefined): string | null`.
- `lib/validations/planning.ts` (zod, server): `bookBySchema`, `slotTimeSchema`, `arriveByMinutesSchema`, `refundableSchema`, `checkSlotFields(data, ctx)` (a `superRefine` callback: arrive-by needs a slot time).
- Copies: `buildForkPlan` (`lib/fork-plan.ts`) carries every new column; `buildDuplicatePlan` (`lib/duplicate-trip.ts`) carries `openingHours` only; `ideaCopyData` (`server/actions/items.ts`) carries `openingHours` onto every placed copy.
- `PlaceholderItem` (`lib/surprise-visibility.ts`) gains masked `bookingState: "NONE"`, `bookingStateSet: false`, `bookBy: null`, `slotTime: null`, `arriveByMinutes: null`, `refundable: null`, `openingHours: null`, so B/C/D readers can map placeholders uniformly.

**What this section assumes from earlier sections:** nothing (S is first).

**What later sections must do with it (not done here):**
- A adds the Booking-state fields to `itemSchema` / `transportSchema` / `accommodationSchema` (composing `bookingStateSchema.nullable()` — null = back to automatic — and `bookBySchema`), and every writer stores `bookingStateWrite(...)`'s result. The stored `bookingState` column is therefore always the **effective** state, so readers (Home "Still to book", Branch 2 Flags) read and filter the column directly (`where: { bookingState: "TO_BOOK" }`), with no reference re-check.
- C composes `slotTimeSchema`, `arriveByMinutesSchema`, `refundableSchema` into `itemSchema` and adds `.superRefine(checkSlotFields)`.
- D writes opening hours with `db.item.updateMany({ where: openingHoursFamilyWhere(tripId, openingHoursFamilyRoot(item)), data: { openingHours: serializeOpeningHours(oh) } })` (needs an integration test there), and reads them with `parseOpeningHours` server-side, handing the typed `OpeningHours` to components, which call `hoursOn`.

**Decisions where the spec is silent (with reasons):**
1. **The stored state is the effective state, plus a `bookingStateSet` flag.** The flag is what makes "a reference implies Booked unless the Traveller set it" decidable. Storing the effective state, not a nullable "override", means Home and Flags can filter in SQL and never re-derive. `bookingStateWrite` is the one rule. `change === undefined` keeps an explicit choice, or re-derives an automatic one from the (new) reference. `change === null` hands the choice back to automatic. A value sets it explicitly. Removing the reference from an automatic row therefore takes it back to the subject's default.
2. **The book-by date is kept when the state leaves To book**, and is read only through `activeBookBy`. Toggling Booked → To book then gets the date back, and no reader shows a stale date on a Booked thing.
3. **`refundable` is `Boolean?`**: true = yes, false = no, null = not known. This follows the PATCH convention that null clears to "not known".
4. **`arriveByMinutes` is a whole number of minutes from 0 to 720, and needs a slot time** (`checkSlotFields`). `defaultStartFromSlot` clamps at 00:00 rather than rolling into the day before: an Item's start is on its own date.
5. **Opening hours are stored as a JSON `String` column, not as tables.** The schema header forbids Prisma `Json` ("store JSON-ish data as a String of JSON"; precedents: `surpriseForIds`, `PackingTemplate.itemsJson`). One column also means Branch 2's Flags get the hours from the Item row they already load: no join and no extra query per day, and one `parseOpeningHours` per Item. The structure is small, bounded (≤ 7 × 2 spans, ≤ 12 seasons, ≤ 200 closed dates) and always read and written whole. Nothing queries inside it, so tables would buy only joins.
6. **Shape choices for the hours:**
   - A **season** is a recurring month-day range (`MM-DD`). Winter hours recur every year, and a range with `from > to` spans the year end.
   - A **closed date** is either a full `YYYY-MM-DD` (a one-off closure) or a recurring `MM-DD` (Christmas).
   - **Precedence**, highest first: closed date → the season covering the date → the usual week.
   - When **several seasons** cover a date, the **shortest** wins ("August" beats "Summer"), and on a tie the one listed first.
   - A season that leaves a weekday out **falls back to the usual week** for that weekday, so "winter: closed Mondays" does not wipe out the other six days.
   - A weekday key that is absent means **not known**, and `hoursOn` returns `null` so Flags stay silent (R7). This adds to the dispatched signature: the result is `DayHours | null`, and `DayHours` also carries `by` and `seasonLabel` so Flags and the card can say why.
   - **Spans** are 1 or 2 per day, in order, not overlapping, each with `open < close`. A close of `24:00` means midnight. There are no overnight spans: a bar open until 02:00 is entered as …–24:00, plus 00:00–02:00 on the next weekday.
   - A `source` link (the `set_opening_hours` source link) lives inside the JSON.
   - Empty hours serialise to `null`.
7. **Placed copies share hours by copying on place and writing to the whole family, not by reading through the source.**
   - Today a placed copy copies its idea's title, address and notes at placement (`ideaCopyData`, `server/actions/items.ts:599-623`) and never syncs them.
   - Reading through `sourceItemId` would cost every reader a join. It would also lose the hours when the idea is deleted, because `sourceItemId` is `onDelete: SetNull`.
   - So: `ideaCopyData` copies `openingHours` (S.8), and D's writer writes the family: the root (`sourceItemId ?? id`) and every row whose `sourceItemId` is the root.
   - Known limit: a Fork's copy of a placed Item has `sourceItemId: null` (`lib/fork-plan.ts:310`), so it carries the hours over but leaves the family. Titles behave the same way today.
8. **What the copies carry:**
   - **Fork** is a faithful copy, so it carries every new column. A source without the columns gets the derived state.
   - **Duplicate** drops references, dates and times, so it carries only `openingHours`, which belongs to the place like `address` does. Booking state, book-by and slot fields fall to the column defaults.
   - The **Surprise placeholder** masks every new field (the hours and ticket time would identify the place).
9. **No `CHECK` constraints and no new indexes.** Enum-ish columns are validated in app code (schema header). Per-Trip row counts are small and `@@index([tripId])` already serves "Still to book".
10. **The migration backfill treats a whitespace-only reference as none** (`NULLIF(btrim(x), '') IS NOT NULL`). Today's actions store `data.booking ?? null` after `.trim()`, so `""` rows exist. The backfill touches only rows with `bookingStateSet = false`, which makes it idempotent. The column defaults already make every existing row correct when it has no reference.

**Review Focus candidates:**
1. Migration backfill.
   - Input: an existing Item `booking = '   '`, a Transport `reference = ''`, and a row already marked `bookingStateSet = true`.
   - Expected: Item stays `NONE`, Transport stays `TO_BOOK`, and the set row is untouched.
   - Running the backfill twice changes nothing.
   - Tested in S.1 (`test/integration/migration-planning-model.test.ts`).
2. `hoursOn` with Winter `11-01..03-31` (Saturdays closed, Tuesdays 10–16, nothing else), closed dates `12-25` and `2027-01-12`:
   - 2026-12-25 → closed by closed date
   - 2027-01-12 (Tue, inside the season) → closed by closed date
   - 2027-01-05 (Tue) → 10:00–16:00 from Winter
   - 2027-03-31 (Wed, season silent on Wednesdays) → the usual week
   - a Sunday nobody entered → `null`
   - Tested in S.4.
3. `bookingStateWrite`:
   - An explicit To book survives adding a reference.
   - `change: null` with a reference → `BOOKED`, `bookingStateSet: false`.
   - An automatic Transport whose reference is removed → `TO_BOOK`.
   - Tested in S.2.

**Feedback trailer:** none in this section; the assembler puts `Resolves-Feedback: cmvaig4j5000u07gwgeqrvtkd` on Branch 1's last task.

---

### Task S.1: Schema and the one migration for every Branch-1 column

**Files:**
- Modify: `prisma/schema.prisma:715-717` (Transport), `:748-751` (Accommodation), `:780-781` (Item)
- Create: `prisma/migrations/20261017120000_planning_model/migration.sql`
- Test: Create `test/integration/migration-planning-model.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the columns listed in Notes. `prisma generate` adds them to the generated client types `Item`, `Transport` and `Accommodation`. The backfill block sits between the markers `-- planning-model:backfill:begin` / `-- planning-model:backfill:end`, and it is exactly three `UPDATE … WHERE …;` statements.

- [ ] **Step 1: Write the failing test**

Create `test/integration/migration-planning-model.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

// Spec 2026-10-17 R2–R4 against the real Postgres. CI migrates an empty
// database, so this proves the two halves of "existing rows come out right"
// separately: (1) a row inserted WITHOUT the new columns (as every existing
// row is, at migrate time) takes the column defaults; (2) the migration's own
// hand-written backfill, run here narrowed to this test's Trip, marks rows
// with a reference Booked and leaves everything else alone.
const TRIP_ID = "it-trip-planning-model";
const MIGRATION = "prisma/migrations/20261017120000_planning_model/migration.sql";

function backfillStatements(): string[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const begin = sql.indexOf("-- planning-model:backfill:begin");
  const end = sql.indexOf("-- planning-model:backfill:end");
  if (begin < 0 || end < begin) throw new Error("backfill markers missing");
  return sql
    .slice(begin, end)
    .split(";")
    .map((s) => s.replace(/--.*$/gm, "").trim())
    .filter(Boolean)
    .map((s) => `${s} AND "tripId" = '${TRIP_ID}'`);
}

async function states() {
  const [items, transports, accs] = await Promise.all([
    db.item.findMany({ where: { tripId: TRIP_ID }, select: { id: true, bookingState: true, bookingStateSet: true } }),
    db.transport.findMany({ where: { tripId: TRIP_ID }, select: { id: true, bookingState: true, bookingStateSet: true } }),
    db.accommodation.findMany({ where: { tripId: TRIP_ID }, select: { id: true, bookingState: true, bookingStateSet: true } }),
  ]);
  return Object.fromEntries([...items, ...transports, ...accs].map((r) => [r.id, [r.bookingState, r.bookingStateSet]]));
}

describe.skipIf(process.env.INTEGRATION !== "1")("planning model migration (spec 2026-10-17 R2–R4, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it-user@example.test", name: "It User", isEmailVerified: true } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "Planning model", homeCurrency: "AUD", createdById: "it-user", members: { create: { userId: "it-user", role: "owner" } } },
    });
    await db.stop.create({ data: { id: "it-pm-stop", tripId: TRIP_ID, name: "Rome", sortOrder: 0 } });
    // Raw INSERTs that name none of the new columns — the shape of every row
    // that exists when the migration runs.
    await db.$executeRaw`INSERT INTO "Item" ("id", "tripId", "title", "category", "booking", "updatedAt") VALUES
      ('it-pm-item-ref', ${TRIP_ID}, 'Colosseum', 'SIGHTSEEING', 'BK-1', now()),
      ('it-pm-item-blank', ${TRIP_ID}, 'Gelato', 'FOOD', '   ', now()),
      ('it-pm-item-none', ${TRIP_ID}, 'Walk', 'OTHER', NULL, now())`;
    await db.$executeRaw`INSERT INTO "Transport" ("id", "tripId", "mode", "reference", "updatedAt") VALUES
      ('it-pm-leg-ref', ${TRIP_ID}, 'TRAIN', 'FR9521', now()),
      ('it-pm-leg-empty', ${TRIP_ID}, 'TRAIN', '', now()),
      ('it-pm-leg-none', ${TRIP_ID}, 'BUS', NULL, now())`;
    await db.$executeRaw`INSERT INTO "Accommodation" ("id", "tripId", "stopId", "name", "checkIn", "checkOut", "confirmation", "updatedAt") VALUES
      ('it-pm-acc-ref', ${TRIP_ID}, 'it-pm-stop', 'Hotel', '2026-07-01', '2026-07-04', 'ABC123', now()),
      ('it-pm-acc-none', ${TRIP_ID}, 'it-pm-stop', 'Flat', '2026-07-04', '2026-07-06', NULL, now())`;
    // Rows a Traveller has already set (written after deploy): the backfill must never touch them.
    await db.$executeRaw`INSERT INTO "Item" ("id", "tripId", "title", "category", "booking", "bookingState", "bookingStateSet", "updatedAt") VALUES
      ('it-pm-item-set', ${TRIP_ID}, 'Opera', 'OTHER', 'X-9', 'TO_BOOK', true, now())`;
    await db.$executeRaw`INSERT INTO "Accommodation" ("id", "tripId", "stopId", "name", "checkIn", "checkOut", "confirmation", "bookingState", "bookingStateSet", "updatedAt") VALUES
      ('it-pm-acc-set', ${TRIP_ID}, 'it-pm-stop', 'Friend', '2026-07-06', '2026-07-07', 'Z', 'NONE', true, now())`;
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("adds every column with its type, nullability and default", async () => {
    const cols = await db.$queryRaw<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]>`
      SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_name IN ('Item', 'Transport', 'Accommodation')
        AND column_name IN ('bookingState', 'bookingStateSet', 'bookBy', 'slotTime', 'arriveByMinutes', 'refundable', 'openingHours')
      ORDER BY table_name, column_name`;
    expect(cols).toEqual([
      { table_name: "Accommodation", column_name: "bookBy", data_type: "text", is_nullable: "YES", column_default: null },
      { table_name: "Accommodation", column_name: "bookingState", data_type: "text", is_nullable: "NO", column_default: "'TO_BOOK'::text" },
      { table_name: "Accommodation", column_name: "bookingStateSet", data_type: "boolean", is_nullable: "NO", column_default: "false" },
      { table_name: "Item", column_name: "arriveByMinutes", data_type: "integer", is_nullable: "YES", column_default: null },
      { table_name: "Item", column_name: "bookBy", data_type: "text", is_nullable: "YES", column_default: null },
      { table_name: "Item", column_name: "bookingState", data_type: "text", is_nullable: "NO", column_default: "'NONE'::text" },
      { table_name: "Item", column_name: "bookingStateSet", data_type: "boolean", is_nullable: "NO", column_default: "false" },
      { table_name: "Item", column_name: "openingHours", data_type: "text", is_nullable: "YES", column_default: null },
      { table_name: "Item", column_name: "refundable", data_type: "boolean", is_nullable: "YES", column_default: null },
      { table_name: "Item", column_name: "slotTime", data_type: "text", is_nullable: "YES", column_default: null },
      { table_name: "Transport", column_name: "bookBy", data_type: "text", is_nullable: "YES", column_default: null },
      { table_name: "Transport", column_name: "bookingState", data_type: "text", is_nullable: "NO", column_default: "'TO_BOOK'::text" },
      { table_name: "Transport", column_name: "bookingStateSet", data_type: "boolean", is_nullable: "NO", column_default: "false" },
    ]);
  });

  it("an existing row takes the defaults: Items need no booking, Transport and Accommodation are To book", async () => {
    expect(await states()).toEqual({
      "it-pm-item-ref": ["NONE", false], "it-pm-item-blank": ["NONE", false], "it-pm-item-none": ["NONE", false],
      "it-pm-item-set": ["TO_BOOK", true],
      "it-pm-leg-ref": ["TO_BOOK", false], "it-pm-leg-empty": ["TO_BOOK", false], "it-pm-leg-none": ["TO_BOOK", false],
      "it-pm-acc-ref": ["TO_BOOK", false], "it-pm-acc-none": ["TO_BOOK", false], "it-pm-acc-set": ["NONE", true],
    });
    const item = await db.item.findUniqueOrThrow({ where: { id: "it-pm-item-ref" } });
    expect(item).toMatchObject({ bookBy: null, slotTime: null, arriveByMinutes: null, refundable: null, openingHours: null });
  });

  it("the backfill marks a row with a reference Booked and leaves blank references and Traveller-set rows alone", async () => {
    const statements = backfillStatements();
    expect(statements).toHaveLength(3);
    await db.$transaction(statements.map((s) => db.$executeRawUnsafe(s)));
    const expected = {
      "it-pm-item-ref": ["BOOKED", false], "it-pm-item-blank": ["NONE", false], "it-pm-item-none": ["NONE", false],
      "it-pm-item-set": ["TO_BOOK", true],
      "it-pm-leg-ref": ["BOOKED", false], "it-pm-leg-empty": ["TO_BOOK", false], "it-pm-leg-none": ["TO_BOOK", false],
      "it-pm-acc-ref": ["BOOKED", false], "it-pm-acc-none": ["TO_BOOK", false], "it-pm-acc-set": ["NONE", true],
    };
    expect(await states()).toEqual(expected);

    // Idempotent: a second run changes nothing.
    await db.$transaction(backfillStatements().map((s) => db.$executeRawUnsafe(s)));
    expect(await states()).toEqual(expected);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Start the sandbox Postgres if it is down: `/tmp/claude-1000/-work/9a77e9b0-ef00-4a02-8c0f-84c338d2470c/scratchpad/pg/start.sh`. Then:

```bash
export DATABASE_URL="postgresql://trip:trip@localhost:5432/trip?schema=public" DIRECT_URL="postgresql://trip:trip@localhost:5432/trip?schema=public"
TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/migration-planning-model.test.ts
```

Expected: every test fails in `beforeAll` with `column "bookingState" of relation "Item" does not exist`. If the file type-checks at all, `tsc` also reports `bookingState` missing on the client types.

- [ ] **Step 3: Implement**

`prisma/schema.prisma`, in `model Transport`, after `sortOrder  Int       @default(0)` (`:717`):

```prisma
  // CONTEXT.md "Booking state" (spec 2026-10-17 R2) — lib/enum-values.ts
  // BOOKING_STATES. Always the EFFECTIVE state: every writer stores
  // lib/booking-state.ts bookingStateWrite's result. bookingStateSet = the
  // Traveller chose it; false = derived (a `reference` means BOOKED, else TO_BOOK).
  bookingState    String  @default("TO_BOOK")
  bookingStateSet Boolean @default(false)
  bookBy          String? // "YYYY-MM-DD" — read only while To book (lib/booking-state.ts activeBookBy)
```

In `model Accommodation`, after `lng          Float?` (`:751`):

```prisma
  // CONTEXT.md "Booking state" (spec 2026-10-17 R2) — as Transport; a
  // `confirmation` means BOOKED, else TO_BOOK.
  bookingState    String  @default("TO_BOOK")
  bookingStateSet Boolean @default(false)
  bookBy          String? // "YYYY-MM-DD" — read only while To book
```

In `model Item`, after `notes     String?` (`:781`):

```prisma
  // CONTEXT.md "Booking state" (spec 2026-10-17 R2) — as Transport; a
  // `booking` reference means BOOKED, else NONE (No booking needed).
  bookingState    String   @default("NONE")
  bookingStateSet Boolean  @default(false)
  bookBy          String?  // "YYYY-MM-DD" — read only while To book
  // CONTEXT.md "Slot time" (R3): the ticket's time, in the Stop's local timezone.
  slotTime        String?  // "HH:mm"
  arriveByMinutes Int?     // be there this many minutes before slotTime (0–720)
  refundable      Boolean? // null = not known
  // CONTEXT.md "Opening hours" (R4): JSON as String (schema convention),
  // validated by lib/validations/opening-hours.ts. Copied onto a placed copy
  // (ideaCopyData) and written to the whole family (lib/opening-hours.ts
  // openingHoursFamilyWhere), so reads never join through sourceItemId.
  openingHours    String?
```

Create `prisma/migrations/20261017120000_planning_model/migration.sql`. The `AlterTable` blocks are exactly what `prisma migrate dev --create-only` generates for this schema change (checked with `prisma migrate diff --from-schema … --to-schema … --script`). The backfill after them is hand-written:

```sql
-- Spec 2026-10-17 R2–R4: Booking state (+ book-by) on Transport,
-- Accommodation and Item; Slot time and Opening hours on Item.

-- AlterTable
ALTER TABLE "Transport" ADD COLUMN     "bookBy" TEXT,
ADD COLUMN     "bookingState" TEXT NOT NULL DEFAULT 'TO_BOOK',
ADD COLUMN     "bookingStateSet" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Accommodation" ADD COLUMN     "bookBy" TEXT,
ADD COLUMN     "bookingState" TEXT NOT NULL DEFAULT 'TO_BOOK',
ADD COLUMN     "bookingStateSet" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "arriveByMinutes" INTEGER,
ADD COLUMN     "bookBy" TEXT,
ADD COLUMN     "bookingState" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "bookingStateSet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "openingHours" TEXT,
ADD COLUMN     "refundable" BOOLEAN,
ADD COLUMN     "slotTime" TEXT;

-- Hand-written backfill. The defaults above already make every existing row
-- right when it has no reference (Transport/Accommodation To book, Item No
-- booking needed). A row WITH a reference is Booked (CONTEXT.md "Booking
-- state"). A whitespace-only reference counts as none (old writes stored "").
-- Only automatic rows (bookingStateSet = false) are touched, so this is
-- idempotent; test/integration/migration-planning-model.test.ts runs exactly
-- the statements between the markers.
-- planning-model:backfill:begin
UPDATE "Transport" SET "bookingState" = 'BOOKED' WHERE "bookingStateSet" = false AND NULLIF(btrim("reference"), '') IS NOT NULL;
UPDATE "Accommodation" SET "bookingState" = 'BOOKED' WHERE "bookingStateSet" = false AND NULLIF(btrim("confirmation"), '') IS NOT NULL;
UPDATE "Item" SET "bookingState" = 'BOOKED' WHERE "bookingStateSet" = false AND NULLIF(btrim("booking"), '') IS NOT NULL;
-- planning-model:backfill:end
```

Apply it in the sandbox. Use the local throwaway Postgres only, never a shell holding `.env.production.local`. Use `migrate deploy`, not `migrate dev`: dev would offer to reset.

```bash
export DATABASE_URL="postgresql://trip:trip@localhost:5432/trip?schema=public" DIRECT_URL="postgresql://trip:trip@localhost:5432/trip?schema=public"
npx prisma migrate deploy
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected:
- `deploy` prints ``Applying migration `20261017120000_planning_model` `` and then `All migrations have been successfully applied.`
- `diff --exit-code` exits 0 ("No difference detected"), which proves the SQL matches the schema.

If the local DB is unavailable, write the files anyway and say so in the report. CI's integration job applies migrations itself.

- [ ] **Step 4: Run it, expect PASS**

The command from Step 2: 3 passed.

- [ ] **Step 5: Task-done check**

- `npx prisma validate`
- `npx tsc --noEmit`: the client regenerated, and the new columns all have defaults or are nullable, so no existing `create` breaks.
- `npx eslint test/integration/migration-planning-model.test.ts`
- the integration file from Step 2
- `npx vitest related --run prisma/schema.prisma` has no related source files. Run `npm test -- lib/fork-plan.test.ts lib/duplicate-trip.test.ts lib/surprise-visibility.test.ts` once as a smoke test: the rows they build gain no required fields.

- [ ] **Step 6: Commit**

Files: `prisma/schema.prisma`, `prisma/migrations/20261017120000_planning_model/migration.sql`, `test/integration/migration-planning-model.test.ts`.

Message: `feat(planning): Booking state, Slot time and Opening hours columns (schema, R2–R4)`

---

### Task S.2: `BOOKING_STATES` and the Booking-state rule (`lib/booking-state.ts`)

**Files:**
- Modify: `lib/enum-values.ts:74` (append after `TARGET_TYPES`' type, before `FEEDBACK_STATUSES`), `lib/enums.ts:2-11,27`
- Create: `lib/booking-state.ts`
- Test: Create `lib/booking-state.test.ts`

**Interfaces:**
- Consumes: S.1 columns (names only; this module is pure).
- Produces: `BOOKING_STATES`, `BookingState`, `bookingStateSchema`, and everything listed under `lib/booking-state.ts` in Notes.

- [ ] **Step 1: Write the failing test**

Create `lib/booking-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BOOKING_STATES } from "@/lib/enum-values";
import {
  BOOKING_STATE_LABELS, activeBookBy, bookingStateWrite, defaultBookingState,
  derivedBookingState, effectiveBookingState, hasBookingReference, isBookingState,
} from "./booking-state";

describe("BOOKING_STATES", () => {
  it("is the three states, each with its CONTEXT.md label", () => {
    expect(BOOKING_STATES).toEqual(["NONE", "TO_BOOK", "BOOKED"]);
    expect(BOOKING_STATE_LABELS).toEqual({ NONE: "No booking needed", TO_BOOK: "To book", BOOKED: "Booked" });
    expect(isBookingState("TO_BOOK")).toBe(true);
    expect(isBookingState("PENDING")).toBe(false);
    expect(isBookingState(null)).toBe(false);
  });
});

describe("defaultBookingState / derivedBookingState", () => {
  it("an Item needs no booking; Transport and Accommodation are To book", () => {
    expect(defaultBookingState("ITEM")).toBe("NONE");
    expect(defaultBookingState("TRANSPORT")).toBe("TO_BOOK");
    expect(defaultBookingState("ACCOMMODATION")).toBe("TO_BOOK");
  });

  it("a reference means Booked; a blank one is no reference", () => {
    expect(hasBookingReference("BK1")).toBe(true);
    expect(hasBookingReference("   ")).toBe(false);
    expect(hasBookingReference("")).toBe(false);
    expect(hasBookingReference(null)).toBe(false);
    expect(hasBookingReference(undefined)).toBe(false);
    expect(derivedBookingState("ITEM", "BK1")).toBe("BOOKED");
    expect(derivedBookingState("TRANSPORT", " ")).toBe("TO_BOOK");
    expect(derivedBookingState("ACCOMMODATION", null)).toBe("TO_BOOK");
  });
});

describe("effectiveBookingState", () => {
  it("an automatic row follows its reference, whatever is stored", () => {
    expect(effectiveBookingState("TRANSPORT", { bookingState: "BOOKED", bookingStateSet: false }, null)).toBe("TO_BOOK");
    expect(effectiveBookingState("ITEM", { bookingState: "NONE", bookingStateSet: false }, "BK1")).toBe("BOOKED");
    expect(effectiveBookingState("ACCOMMODATION", {}, "ABC")).toBe("BOOKED");
  });

  it("a Traveller-set state wins over a reference", () => {
    expect(effectiveBookingState("TRANSPORT", { bookingState: "TO_BOOK", bookingStateSet: true }, "FR9521")).toBe("TO_BOOK");
    expect(effectiveBookingState("ITEM", { bookingState: "TO_BOOK", bookingStateSet: true }, null)).toBe("TO_BOOK");
  });

  it("a set row holding an unknown value falls back to the derived state", () => {
    expect(effectiveBookingState("ITEM", { bookingState: "PENDING", bookingStateSet: true }, "BK1")).toBe("BOOKED");
  });
});

describe("bookingStateWrite", () => {
  it("on create with no choice, derives from the reference", () => {
    expect(bookingStateWrite("TRANSPORT", null, undefined, "FR9521")).toEqual({ bookingState: "BOOKED", bookingStateSet: false });
    expect(bookingStateWrite("TRANSPORT", null, undefined, null)).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false });
    expect(bookingStateWrite("ITEM", null, undefined, undefined)).toEqual({ bookingState: "NONE", bookingStateSet: false });
  });

  it("an explicit choice is stored as set, whatever the reference", () => {
    expect(bookingStateWrite("ITEM", null, "TO_BOOK", "BK1")).toEqual({ bookingState: "TO_BOOK", bookingStateSet: true });
    expect(bookingStateWrite("TRANSPORT", { bookingState: "BOOKED", bookingStateSet: false }, "NONE", "X")).toEqual({ bookingState: "NONE", bookingStateSet: true });
  });

  it("an explicit To book survives adding a reference later", () => {
    expect(bookingStateWrite("TRANSPORT", { bookingState: "TO_BOOK", bookingStateSet: true }, undefined, "FR9521")).toEqual({ bookingState: "TO_BOOK", bookingStateSet: true });
  });

  it("an automatic row re-derives when its reference changes", () => {
    expect(bookingStateWrite("TRANSPORT", { bookingState: "BOOKED", bookingStateSet: false }, undefined, null)).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false });
    expect(bookingStateWrite("ITEM", { bookingState: "NONE", bookingStateSet: false }, undefined, "BK1")).toEqual({ bookingState: "BOOKED", bookingStateSet: false });
  });

  it("null hands the choice back to automatic", () => {
    expect(bookingStateWrite("ITEM", { bookingState: "NONE", bookingStateSet: true }, null, "BK1")).toEqual({ bookingState: "BOOKED", bookingStateSet: false });
    expect(bookingStateWrite("ACCOMMODATION", { bookingState: "BOOKED", bookingStateSet: true }, null, "")).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false });
  });
});

describe("activeBookBy", () => {
  it("is the book-by date only while To book", () => {
    expect(activeBookBy("TO_BOOK", "2026-11-01")).toBe("2026-11-01");
    expect(activeBookBy("BOOKED", "2026-11-01")).toBeNull();
    expect(activeBookBy("NONE", "2026-11-01")).toBeNull();
    expect(activeBookBy("TO_BOOK", null)).toBeNull();
    expect(activeBookBy("TO_BOOK", "")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run lib/booking-state.test.ts` → `Failed to resolve import "./booking-state"`.

- [ ] **Step 3: Implement**

`lib/enum-values.ts`: insert before the `FEEDBACK_STATUSES` doc comment:

```ts
/**
 * `Item.bookingState` / `Transport.bookingState` / `Accommodation.bookingState`
 * — CONTEXT.md "Booking state" (spec 2026-10-17 R2): NONE = "No booking
 * needed", TO_BOOK = "To book", BOOKED = "Booked". The rule that derives it
 * from a booking reference is lib/booking-state.ts.
 */
export const BOOKING_STATES = ["NONE", "TO_BOOK", "BOOKED"] as const;
export type BookingState = (typeof BOOKING_STATES)[number];
```

`lib/enums.ts`: add `BOOKING_STATES,` to the import list from `./enum-values`, and append:

```ts
export const bookingStateSchema = z.enum(BOOKING_STATES);
```

Create `lib/booking-state.ts`:

```ts
import { BOOKING_STATES, type BookingState } from "@/lib/enum-values";

/**
 * CONTEXT.md "Booking state" (spec 2026-10-17 R2) — the one rule, zod-free so
 * cards and badges can share it.
 *
 * Columns: `bookingState` is always the EFFECTIVE state, `bookingStateSet`
 * says the Traveller chose it. Unset, a booking reference (Item `booking`,
 * Transport `reference`, Accommodation `confirmation`) means Booked, and its
 * absence means the subject's default. Every writer stores
 * `bookingStateWrite`'s result, so readers filter the column directly.
 */
export type BookingSubject = "ITEM" | "TRANSPORT" | "ACCOMMODATION";

export const BOOKING_STATE_LABELS: Record<BookingState, string> = {
  NONE: "No booking needed",
  TO_BOOK: "To book",
  BOOKED: "Booked",
};

export function isBookingState(v: unknown): v is BookingState {
  return typeof v === "string" && (BOOKING_STATES as readonly string[]).includes(v);
}

/** An Item needs no booking unless the Traveller says so; Transport and Accommodation are To book. */
export function defaultBookingState(subject: BookingSubject): BookingState {
  return subject === "ITEM" ? "NONE" : "TO_BOOK";
}

/** A reference that is blank or whitespace is no reference. */
export function hasBookingReference(reference: string | null | undefined): boolean {
  return reference != null && reference.trim() !== "";
}

export function derivedBookingState(subject: BookingSubject, reference: string | null | undefined): BookingState {
  return hasBookingReference(reference) ? "BOOKED" : defaultBookingState(subject);
}

export interface BookingStateRow {
  bookingState?: string | null;
  bookingStateSet?: boolean | null;
}

export interface BookingStateColumns {
  bookingState: BookingState;
  bookingStateSet: boolean;
}

/** The state a row is in: the Traveller's choice when set, else derived from its reference. */
export function effectiveBookingState(
  subject: BookingSubject,
  row: BookingStateRow,
  reference: string | null | undefined,
): BookingState {
  if (row.bookingStateSet === true && isBookingState(row.bookingState)) return row.bookingState;
  return derivedBookingState(subject, reference);
}

/**
 * The two columns a write stores. `current` is the row before the write (null
 * on create); `reference` is the reference AFTER the write. `change` follows
 * the PATCH convention (lib/patch.ts):
 *  - undefined: keep the Traveller's choice if there is one, else re-derive
 *    from the (possibly new) reference;
 *  - null: hand the choice back to automatic;
 *  - a state: the Traveller's explicit choice.
 */
export function bookingStateWrite(
  subject: BookingSubject,
  current: BookingStateRow | null,
  change: BookingState | null | undefined,
  reference: string | null | undefined,
): BookingStateColumns {
  if (change === null) return { bookingState: derivedBookingState(subject, reference), bookingStateSet: false };
  if (change !== undefined) return { bookingState: change, bookingStateSet: true };
  if (current?.bookingStateSet === true && isBookingState(current.bookingState)) {
    return { bookingState: current.bookingState, bookingStateSet: true };
  }
  return { bookingState: derivedBookingState(subject, reference), bookingStateSet: false };
}

/** The book-by date that counts: kept on the row in any state, but only read while To book. */
export function activeBookBy(state: string | null | undefined, bookBy: string | null | undefined): string | null {
  return state === "TO_BOOK" && bookBy ? bookBy : null;
}
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/booking-state.test.ts`: all pass.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/booking-state.ts lib/enum-values.ts lib/enums.ts` + `npx tsc --noEmit` + `npx eslint lib/booking-state.ts lib/booking-state.test.ts lib/enum-values.ts lib/enums.ts`

- [ ] **Step 6: Commit** — files: `lib/enum-values.ts`, `lib/enums.ts`, `lib/booking-state.ts`, `lib/booking-state.test.ts`. Message: `feat(planning): Booking state enum and the reference-implies-Booked rule (R2)`

---

### Task S.3: `defaultStartFromSlot` (`lib/slot-time.ts`)

**Files:**
- Create: `lib/slot-time.ts`
- Test: Create `lib/slot-time.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MAX_ARRIVE_BY_MINUTES = 720` and `defaultStartFromSlot(slot, arriveByMinutes): string | null`. C uses it for the start default and for the "be there 11:45" copy. Branch 2's "Late for the slot" Flag compares `startTime > defaultStartFromSlot(...)`.

- [ ] **Step 1: Write the failing test**

Create `lib/slot-time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MAX_ARRIVE_BY_MINUTES, defaultStartFromSlot } from "./slot-time";

describe("defaultStartFromSlot (CONTEXT.md Slot time: start no later than slot − arrive-by)", () => {
  it("takes the arrive-by margin off the slot", () => {
    expect(defaultStartFromSlot("12:00", 15)).toBe("11:45");
    expect(defaultStartFromSlot("09:05", 90)).toBe("07:35");
    expect(defaultStartFromSlot("19:30", MAX_ARRIVE_BY_MINUTES)).toBe("07:30");
  });

  it("no margin (or none set) is the slot itself", () => {
    expect(defaultStartFromSlot("12:00", 0)).toBe("12:00");
    expect(defaultStartFromSlot("12:00", null)).toBe("12:00");
    expect(defaultStartFromSlot("12:00", undefined)).toBe("12:00");
  });

  it("never rolls into the day before: clamps at 00:00", () => {
    expect(defaultStartFromSlot("00:10", 15)).toBe("00:00");
  });

  it("a negative margin counts as none", () => {
    expect(defaultStartFromSlot("12:00", -5)).toBe("12:00");
  });

  it("no slot, or a malformed one, gives no default", () => {
    expect(defaultStartFromSlot(null, 15)).toBeNull();
    expect(defaultStartFromSlot("", 15)).toBeNull();
    expect(defaultStartFromSlot("25:00", 0)).toBeNull();
    expect(defaultStartFromSlot("9:00", 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/slot-time.test.ts` → `Failed to resolve import "./slot-time"`.

- [ ] **Step 3: Implement**

Create `lib/slot-time.ts`:

```ts
/**
 * CONTEXT.md "Slot time" (spec 2026-10-17 R3): the ticket's time and how
 * early to arrive. The Item's own start time is the Traveller's plan; when
 * only a slot is set, start defaults to slot − arrive-by. Zod-free so the
 * Item form can show the default as it is typed.
 */

/** The largest arrive-by margin accepted: 12 hours. */
export const MAX_ARRIVE_BY_MINUTES = 720;

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "HH:mm" slot less the arrive-by minutes, clamped to 00:00 (an Item's start stays on its own date). */
export function defaultStartFromSlot(
  slot: string | null | undefined,
  arriveByMinutes: number | null | undefined,
): string | null {
  if (!slot || !HHMM_RE.test(slot)) return null;
  const [h, m] = slot.split(":").map(Number);
  const total = Math.max(0, h * 60 + m - Math.max(0, arriveByMinutes ?? 0));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/slot-time.test.ts`: 5 passed.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/slot-time.ts` + `npx tsc --noEmit` + `npx eslint lib/slot-time.ts lib/slot-time.test.ts`

- [ ] **Step 6: Commit** — files: `lib/slot-time.ts`, `lib/slot-time.test.ts`. Message: `feat(planning): start defaults to slot less arrive-by (R3)`

---

### Task S.4: Opening hours model and resolver (`lib/opening-hours.ts`)

**Files:**
- Create: `lib/opening-hours.ts`
- Test: Create `lib/opening-hours.test.ts`

**Interfaces:**
- Consumes: `parseISODate` (`lib/dates.ts:17`).
- Produces: everything listed under `lib/opening-hours.ts` in Notes.

- [ ] **Step 1: Write the failing test**

Create `lib/opening-hours.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  hoursOn, isClosedDate, isEmptyOpeningHours, openingHoursFamilyRoot, openingHoursFamilyWhere,
  seasonCovers, seasonOn, type OpeningHours, type OpeningSeason, type WeekHours,
} from "./opening-hours";

// Usual week: Monday closed, Tue–Thu 10–18, Friday split (two spans), Saturday 9–18, Sunday not known.
const USUAL: WeekHours = {
  mon: [],
  tue: [["10:00", "18:00"]],
  wed: [["10:00", "18:00"]],
  thu: [["10:00", "18:00"]],
  fri: [["10:00", "13:00"], ["14:00", "20:00"]],
  sat: [["09:00", "18:00"]],
};
// Spans the year end; says nothing about Wednesdays (or Mon/Thu/Fri/Sun).
const WINTER: OpeningSeason = { label: "Winter", from: "11-01", to: "03-31", week: { tue: [["10:00", "16:00"]], sat: [] } };
const SUMMER: OpeningSeason = { label: "Summer", from: "06-01", to: "09-15", week: { tue: [["09:00", "19:00"]] } };
const AUGUST: OpeningSeason = { label: "August", from: "08-01", to: "08-31", week: { tue: [["09:00", "21:00"]], fri: [["09:00", "12:00"], ["17:00", "24:00"]] } };
const OH: OpeningHours = {
  week: USUAL,
  seasons: [SUMMER, WINTER, AUGUST],
  closed: ["12-25", "2027-01-12", "2026-08-05"],
};

describe("hoursOn — the usual week", () => {
  it("one span on an open weekday", () => {
    expect(hoursOn(OH, "2026-10-13")).toEqual({ closed: false, spans: [["10:00", "18:00"]], by: "week", seasonLabel: null }); // Tue
  });
  it("two spans", () => {
    expect(hoursOn(OH, "2026-10-16")).toEqual({ closed: false, spans: [["10:00", "13:00"], ["14:00", "20:00"]], by: "week", seasonLabel: null }); // Fri
  });
  it("a weekday entered as closed", () => {
    expect(hoursOn(OH, "2026-10-12")).toEqual({ closed: true, spans: [], by: "week", seasonLabel: null }); // Mon
  });
  it("a weekday nobody entered is not known (null), never closed", () => {
    expect(hoursOn(OH, "2026-10-18")).toBeNull(); // Sun
  });
  it("no opening hours at all is not known", () => {
    expect(hoursOn(null, "2026-10-13")).toBeNull();
    expect(hoursOn(undefined, "2026-10-13")).toBeNull();
  });
});

describe("hoursOn — seasons", () => {
  it("a season spanning the year end applies on both sides of it", () => {
    const winterTue = { closed: false, spans: [["10:00", "16:00"]], by: "season", seasonLabel: "Winter" };
    expect(hoursOn(OH, "2026-11-03")).toEqual(winterTue); // Tue, first week
    expect(hoursOn(OH, "2026-12-29")).toEqual(winterTue); // Tue, December
    expect(hoursOn(OH, "2027-01-05")).toEqual(winterTue); // Tue, January
    expect(hoursOn(OH, "2027-03-30")).toEqual(winterTue); // Tue, last week
    expect(hoursOn(OH, "2028-02-29")).toEqual(winterTue); // Tue, leap day
  });
  it("the season's bounds are inclusive and it ends where it says", () => {
    expect(hoursOn(OH, "2026-11-07")).toEqual({ closed: true, spans: [], by: "season", seasonLabel: "Winter" }); // Sat in season: closed
    expect(hoursOn(OH, "2026-10-31")).toEqual({ closed: false, spans: [["09:00", "18:00"]], by: "week", seasonLabel: null }); // Sat before it
    expect(hoursOn(OH, "2027-04-06")).toEqual({ closed: false, spans: [["10:00", "18:00"]], by: "week", seasonLabel: null }); // Tue after it
  });
  it("a weekday the season says nothing about falls back to the usual week", () => {
    expect(hoursOn(OH, "2027-03-31")).toEqual({ closed: false, spans: [["10:00", "18:00"]], by: "week", seasonLabel: null }); // Wed in Winter
  });
  it("the shortest covering season wins", () => {
    expect(hoursOn(OH, "2026-08-11")).toEqual({ closed: false, spans: [["09:00", "21:00"]], by: "season", seasonLabel: "August" }); // Tue: August ⊂ Summer
    expect(hoursOn(OH, "2026-09-15")).toEqual({ closed: false, spans: [["09:00", "19:00"]], by: "season", seasonLabel: "Summer" }); // Tue, Summer's last day
    expect(hoursOn(OH, "2026-09-16")).toEqual({ closed: false, spans: [["10:00", "18:00"]], by: "week", seasonLabel: null }); // Wed, after Summer
  });
  it("two spans inside a season, closing at midnight", () => {
    expect(hoursOn(OH, "2026-08-07")).toEqual({ closed: false, spans: [["09:00", "12:00"], ["17:00", "24:00"]], by: "season", seasonLabel: "August" }); // Fri
  });
  it("of two equally long seasons, the one listed first wins", () => {
    const a: OpeningSeason = { label: "A", from: "05-01", to: "05-10", week: { tue: [["08:00", "09:00"]] } };
    const b: OpeningSeason = { label: "B", from: "05-05", to: "05-14", week: { tue: [["20:00", "21:00"]] } };
    expect(hoursOn({ week: {}, seasons: [a, b], closed: [] }, "2026-05-05")?.seasonLabel).toBe("A"); // Tue
    expect(hoursOn({ week: {}, seasons: [b, a], closed: [] }, "2026-05-05")?.seasonLabel).toBe("B");
  });
  it("an unlabelled season reports a null label", () => {
    const s: OpeningSeason = { from: "01-01", to: "12-31", week: { tue: [] } };
    expect(hoursOn({ week: {}, seasons: [s], closed: [] }, "2026-10-13")).toEqual({ closed: true, spans: [], by: "season", seasonLabel: null });
  });
});

describe("hoursOn — closed dates", () => {
  it("a recurring MM-DD closes the day every year, over the usual week", () => {
    expect(hoursOn(OH, "2026-12-25")).toEqual({ closed: true, spans: [], by: "closed-date", seasonLabel: null }); // Fri
    expect(hoursOn(OH, "2027-12-25")).toEqual({ closed: true, spans: [], by: "closed-date", seasonLabel: null }); // Sat
  });
  it("a one-off closed date inside a season beats the season", () => {
    expect(hoursOn(OH, "2027-01-12")).toEqual({ closed: true, spans: [], by: "closed-date", seasonLabel: null }); // Tue in Winter
    expect(hoursOn(OH, "2026-08-05")).toEqual({ closed: true, spans: [], by: "closed-date", seasonLabel: null }); // Wed in August
  });
  it("a one-off closed date is that year only", () => {
    expect(hoursOn(OH, "2028-01-12")).not.toMatchObject({ by: "closed-date" });
  });
  it("closes even a day whose weekday nobody entered", () => {
    expect(hoursOn({ week: {}, seasons: [], closed: ["2026-10-18"] }, "2026-10-18")).toEqual({ closed: true, spans: [], by: "closed-date", seasonLabel: null });
  });
});

describe("seasonCovers / seasonOn / isClosedDate", () => {
  it("handles plain and year-end-spanning ranges", () => {
    expect(seasonCovers({ from: "06-01", to: "09-15" }, "06-01")).toBe(true);
    expect(seasonCovers({ from: "06-01", to: "09-15" }, "09-16")).toBe(false);
    expect(seasonCovers({ from: "11-01", to: "03-31" }, "12-31")).toBe(true);
    expect(seasonCovers({ from: "11-01", to: "03-31" }, "01-01")).toBe(true);
    expect(seasonCovers({ from: "11-01", to: "03-31" }, "04-01")).toBe(false);
    expect(seasonCovers({ from: "11-01", to: "03-31" }, "10-31")).toBe(false);
    expect(seasonCovers({ from: "07-04", to: "07-04" }, "07-04")).toBe(true);
  });
  it("seasonOn picks the governing season or none", () => {
    expect(seasonOn(OH, "2026-08-20")?.label).toBe("August");
    expect(seasonOn(OH, "2026-10-13")).toBeNull();
  });
  it("isClosedDate matches a full date or a recurring month-day", () => {
    expect(isClosedDate(OH, "2031-12-25")).toBe(true);
    expect(isClosedDate(OH, "2027-01-12")).toBe(true);
    expect(isClosedDate(OH, "2027-01-13")).toBe(false);
  });
});

describe("isEmptyOpeningHours", () => {
  it("is empty only with no weekday, season or closed date entered", () => {
    expect(isEmptyOpeningHours({ week: {}, seasons: [], closed: [] })).toBe(true);
    expect(isEmptyOpeningHours({ week: {}, seasons: [], closed: [], source: "https://example.com" })).toBe(true);
    expect(isEmptyOpeningHours({ week: { mon: [] }, seasons: [], closed: [] })).toBe(false);
    expect(isEmptyOpeningHours({ week: {}, seasons: [WINTER], closed: [] })).toBe(false);
    expect(isEmptyOpeningHours({ week: {}, seasons: [], closed: ["12-25"] })).toBe(false);
  });
});

describe("the opening-hours family (a thing to do and its placed copies share them)", () => {
  it("the root is the source idea for a placed copy, else the Item itself", () => {
    expect(openingHoursFamilyRoot({ id: "copy-1", sourceItemId: "idea-1" })).toBe("idea-1");
    expect(openingHoursFamilyRoot({ id: "idea-1", sourceItemId: null })).toBe("idea-1");
  });
  it("selects the root and every copy placed from it, in the Trip", () => {
    expect(openingHoursFamilyWhere("trip-1", "idea-1")).toEqual({ tripId: "trip-1", OR: [{ id: "idea-1" }, { sourceItemId: "idea-1" }] });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/opening-hours.test.ts` → `Failed to resolve import "./opening-hours"`.

- [ ] **Step 3: Implement**

Create `lib/opening-hours.ts`:

```ts
import { parseISODate } from "@/lib/dates";

/**
 * CONTEXT.md "Opening hours" (spec 2026-10-17 R4): the usual weekly hours,
 * seasons that replace them for a recurring date range, and closed dates. Read
 * in the Item's Stop's local time, like its start time. Stored as a JSON
 * string on `Item.openingHours` (validated by lib/validations/opening-hours.ts).
 * This module is the zod-free model and resolver, so cards can call `hoursOn`.
 *
 * Shape rules:
 *  - a weekday key ABSENT = not known; `[]` = closed; else 1–2 ordered spans;
 *  - a span is [open, close] "HH:mm", open < close, close may be "24:00";
 *  - a season is "MM-DD".."MM-DD", inclusive, and spans the year end when from > to;
 *  - a closed date is "YYYY-MM-DD" (that day) or "MM-DD" (that day every year).
 */

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const; // index = Date#getUTCDay()
export type Weekday = (typeof WEEKDAYS)[number];
export type HoursSpan = [open: string, close: string];
export type WeekHours = Partial<Record<Weekday, HoursSpan[]>>;

export interface OpeningSeason {
  label?: string;
  from: string; // "MM-DD"
  to: string; // "MM-DD"
  week: WeekHours;
}

export interface OpeningHours {
  week: WeekHours;
  seasons: OpeningSeason[];
  closed: string[]; // "YYYY-MM-DD" or "MM-DD"
  source?: string; // where the hours came from (set_opening_hours' source link)
}

export interface DayHours {
  closed: boolean;
  spans: HoursSpan[];
  /** What decided the day: a closed date, the governing season, or the usual week. */
  by: "closed-date" | "season" | "week";
  seasonLabel: string | null;
}

export const MAX_SPANS_PER_DAY = 2;
export const MAX_SEASONS = 12;
export const MAX_CLOSED_DATES = 200;

const DAY_MS = 86_400_000;

/** 0-based day of a leap year for an "MM-DD" — only for comparing season lengths. */
function leapDayOfYear(monthDay: string): number {
  const [m, d] = monthDay.split("-").map(Number);
  return Math.round((Date.UTC(2000, m - 1, d) - Date.UTC(2000, 0, 1)) / DAY_MS);
}

function seasonLength(s: Pick<OpeningSeason, "from" | "to">): number {
  const a = leapDayOfYear(s.from);
  const b = leapDayOfYear(s.to);
  return b >= a ? b - a + 1 : 366 - a + b + 1;
}

/** Whether a season's recurring range covers an "MM-DD" (inclusive; from > to spans the year end). */
export function seasonCovers(season: Pick<OpeningSeason, "from" | "to">, monthDay: string): boolean {
  const { from, to } = season;
  return from <= to ? from <= monthDay && monthDay <= to : monthDay >= from || monthDay <= to;
}

/** The season governing a date: the shortest that covers it; on a tie, the first listed. */
export function seasonOn(oh: OpeningHours, dateISO: string): OpeningSeason | null {
  const monthDay = dateISO.slice(5);
  let best: OpeningSeason | null = null;
  for (const s of oh.seasons) {
    if (!seasonCovers(s, monthDay)) continue;
    if (best === null || seasonLength(s) < seasonLength(best)) best = s;
  }
  return best;
}

export function isClosedDate(oh: OpeningHours, dateISO: string): boolean {
  const monthDay = dateISO.slice(5);
  return oh.closed.some((c) => c === dateISO || c === monthDay);
}

function dayHours(spans: HoursSpan[], by: DayHours["by"], seasonLabel: string | null): DayHours {
  return { closed: spans.length === 0, spans: spans.map(([o, c]) => [o, c]), by, seasonLabel };
}

/**
 * The hours on one calendar date: a closed date first, then the governing
 * season's entry for the weekday, then the usual week's. `null` = not known
 * (no hours, or the weekday entered nowhere), so callers (Flags) stay silent.
 */
export function hoursOn(oh: OpeningHours | null | undefined, dateISO: string): DayHours | null {
  if (!oh) return null;
  if (isClosedDate(oh, dateISO)) return { closed: true, spans: [], by: "closed-date", seasonLabel: null };
  const weekday = WEEKDAYS[parseISODate(dateISO).getUTCDay()];
  const season = seasonOn(oh, dateISO);
  const inSeason = season?.week[weekday];
  if (season && inSeason !== undefined) return dayHours(inSeason, "season", season.label ?? null);
  const usual = oh.week[weekday];
  if (usual !== undefined) return dayHours(usual, "week", null);
  return null;
}

/** Nothing entered (a source link alone says nothing) — stored as null. */
export function isEmptyOpeningHours(oh: OpeningHours): boolean {
  return WEEKDAYS.every((d) => oh.week[d] === undefined) && oh.seasons.length === 0 && oh.closed.length === 0;
}

/**
 * Opening hours belong to the place, so a thing to do and the copies placed
 * from it share them. Each row holds its own copy (copied on place by
 * ideaCopyData), and a write goes to the whole family: the root (the source
 * idea, or the Item itself) and every Item placed from it. That way reads never
 * join, and a copy keeps its hours if the idea is deleted (sourceItemId SetNull).
 */
export function openingHoursFamilyRoot(item: { id: string; sourceItemId: string | null }): string {
  return item.sourceItemId ?? item.id;
}

export function openingHoursFamilyWhere(tripId: string, rootId: string) {
  return { tripId, OR: [{ id: rootId }, { sourceItemId: rootId }] as [{ id: string }, { sourceItemId: string }] };
}
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/opening-hours.test.ts`: all pass.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/opening-hours.ts` + `npx tsc --noEmit` + `npx eslint lib/opening-hours.ts lib/opening-hours.test.ts`

- [ ] **Step 6: Commit** — files: `lib/opening-hours.ts`, `lib/opening-hours.test.ts`. Message: `feat(planning): Opening hours model and hoursOn resolver (R4)`

---

### Task S.5: Opening hours zod schema, parse and serialise (`lib/validations/opening-hours.ts`)

**Files:**
- Create: `lib/validations/opening-hours.ts`
- Test: Create `lib/validations/opening-hours.test.ts`

**Interfaces:**
- Consumes: `OpeningHours`, `WEEKDAYS`, `MAX_SPANS_PER_DAY`, `MAX_SEASONS`, `MAX_CLOSED_DATES` and `isEmptyOpeningHours` from S.4; `hhmm` and `isoDate` (`lib/validations/primitives.ts`); `isRealCalendarDate` (`lib/dates.ts:40`); `safeWebHref` (`lib/url.ts:23`).
- Produces: `monthDaySchema`, `daySpansSchema`, `weekHoursSchema`, `openingSeasonSchema`, `openingHoursSchema`, `type OpeningHoursInput`, `parseOpeningHours`, `serializeOpeningHours`. D's `set_opening_hours` tool and the Item dialog validate with `openingHoursSchema`, and readers parse with `parseOpeningHours`.

- [ ] **Step 1: Write the failing test**

Create `lib/validations/opening-hours.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { OpeningHours } from "@/lib/opening-hours";
import { openingHoursSchema, parseOpeningHours, serializeOpeningHours } from "./opening-hours";

const VALID = {
  week: { mon: [], tue: [["10:00", "18:00"]], fri: [["10:00", "13:00"], ["14:00", "24:00"]] },
  seasons: [{ label: "Winter", from: "11-01", to: "03-31", week: { sat: [] } }],
  closed: ["12-25", "2027-01-12"],
  source: "https://example.com/hours",
};
const ok = (v: unknown) => openingHoursSchema.safeParse(v).success;
const withWeek = (week: unknown) => ({ week });

describe("openingHoursSchema", () => {
  it("parses to the OpeningHours model", () => {
    expectTypeOf<z.output<typeof openingHoursSchema>>().toExtend<OpeningHours>();
    expect(openingHoursSchema.parse(VALID)).toEqual(VALID);
  });

  it("defaults seasons and closed dates to none", () => {
    expect(openingHoursSchema.parse({ week: { mon: [] } })).toEqual({ week: { mon: [] }, seasons: [], closed: [] });
  });

  it("allows one or two ordered spans a day, closing at 24:00 at the latest", () => {
    expect(ok(withWeek({ tue: [["00:00", "24:00"]] }))).toBe(true);
    expect(ok(withWeek({ tue: [["09:00", "12:00"], ["12:00", "17:00"]] }))).toBe(true); // touching is fine
    expect(ok(withWeek({ tue: [["09:00", "10:00"], ["11:00", "12:00"], ["13:00", "14:00"]] }))).toBe(false); // three
    expect(ok(withWeek({ tue: [["14:00", "18:00"], ["09:00", "12:00"]] }))).toBe(false); // out of order
    expect(ok(withWeek({ tue: [["09:00", "13:00"], ["12:00", "17:00"]] }))).toBe(false); // overlapping
    expect(ok(withWeek({ tue: [["18:00", "10:00"]] }))).toBe(false); // closes before it opens
    expect(ok(withWeek({ tue: [["10:00", "10:00"]] }))).toBe(false); // empty span
    expect(ok(withWeek({ tue: [["24:00", "24:00"]] }))).toBe(false); // 24:00 is a close only
    expect(ok(withWeek({ tue: [["9:00", "17:00"]] }))).toBe(false);
    expect(ok(withWeek({ tue: [["10:00"]] }))).toBe(false);
  });

  it("refuses a weekday that is not one", () => {
    expect(ok(withWeek({ funday: [] }))).toBe(false);
  });

  it("seasons are real month-days, at most 12", () => {
    expect(ok({ week: {}, seasons: [{ from: "02-29", to: "03-01", week: {} }] })).toBe(true);
    expect(ok({ week: {}, seasons: [{ from: "02-30", to: "03-01", week: {} }] })).toBe(false);
    expect(ok({ week: {}, seasons: [{ from: "13-01", to: "03-01", week: {} }] })).toBe(false);
    expect(ok({ week: {}, seasons: [{ from: "2026-11-01", to: "03-01", week: {} }] })).toBe(false);
    const many = Array.from({ length: 13 }, () => ({ from: "01-01", to: "01-02", week: {} }));
    expect(ok({ week: {}, seasons: many })).toBe(false);
  });

  it("closed dates are a real full date or a real month-day", () => {
    expect(ok({ week: {}, closed: ["2026-12-31", "12-31"] })).toBe(true);
    expect(ok({ week: {}, closed: ["2026-02-30"] })).toBe(false);
    expect(ok({ week: {}, closed: ["31-12"] })).toBe(false);
    expect(ok({ week: {}, closed: ["Christmas"] })).toBe(false);
  });

  it("the source must be a web address", () => {
    expect(ok({ week: {}, source: "javascript:alert(1)" })).toBe(false);
    expect(ok({ week: {}, source: "https://example.com" })).toBe(true);
  });

  it("refuses unknown top-level keys", () => {
    expect(ok({ week: {}, holidays: [] })).toBe(false);
  });
});

describe("parseOpeningHours / serializeOpeningHours", () => {
  it("round-trips", () => {
    const oh = openingHoursSchema.parse(VALID);
    expect(parseOpeningHours(serializeOpeningHours(oh))).toEqual(oh);
  });
  it("empty hours store as null", () => {
    expect(serializeOpeningHours({ week: {}, seasons: [], closed: [] })).toBeNull();
    expect(serializeOpeningHours(null)).toBeNull();
  });
  it("anything unreadable reads as not known", () => {
    expect(parseOpeningHours(null)).toBeNull();
    expect(parseOpeningHours("")).toBeNull();
    expect(parseOpeningHours("not json")).toBeNull();
    expect(parseOpeningHours(JSON.stringify({ week: { tue: [["18:00", "10:00"]] } }))).toBeNull();
    expect(parseOpeningHours(JSON.stringify({ week: {}, seasons: [], closed: [] }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/validations/opening-hours.test.ts` → `Failed to resolve import "./opening-hours"`.

- [ ] **Step 3: Implement**

Create `lib/validations/opening-hours.ts`:

```ts
import { z } from "zod";
import { isRealCalendarDate } from "@/lib/dates";
import {
  MAX_CLOSED_DATES, MAX_SEASONS, MAX_SPANS_PER_DAY, isEmptyOpeningHours, type OpeningHours,
} from "@/lib/opening-hours";
import { safeWebHref } from "@/lib/url";
import { hhmm, isoDate } from "@/lib/validations/primitives";

/**
 * CONTEXT.md "Opening hours" (spec 2026-10-17 R4): the zod side of
 * lib/opening-hours.ts. Every door that writes `Item.openingHours` (the Item
 * dialog, set_opening_hours) validates with `openingHoursSchema` and stores
 * `serializeOpeningHours`. Every reader parses with `parseOpeningHours`, which
 * treats anything unreadable as not known.
 */

const CLOSE_RE = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
const MONTH_DAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "MM-DD" naming a real day in some year (02-29 allowed). */
export const monthDaySchema = z
  .string()
  .regex(MONTH_DAY_RE, "Use MM-DD")
  .refine((s) => !MONTH_DAY_RE.test(s) || isRealCalendarDate(`2000-${s}`), "Not a real day of the year");

const spanSchema = z
  .tuple([hhmm, z.string().regex(CLOSE_RE, "Closing time must be HH:MM (24:00 for midnight)")])
  .refine(([open, close]) => open < close, "Closing time must be after opening time");

export const daySpansSchema = z
  .array(spanSchema)
  .max(MAX_SPANS_PER_DAY, `At most ${MAX_SPANS_PER_DAY} opening spans a day`)
  .refine((spans) => spans.every((s, i) => i === 0 || spans[i - 1][1] <= s[0]), "Spans must be in order and must not overlap");

/** Absent weekday = not known; [] = closed. */
export const weekHoursSchema = z.strictObject({
  sun: daySpansSchema.optional(),
  mon: daySpansSchema.optional(),
  tue: daySpansSchema.optional(),
  wed: daySpansSchema.optional(),
  thu: daySpansSchema.optional(),
  fri: daySpansSchema.optional(),
  sat: daySpansSchema.optional(),
});

export const openingSeasonSchema = z.strictObject({
  label: z.string().trim().min(1).max(40, "Season name must be 40 characters or fewer").optional(),
  from: monthDaySchema,
  to: monthDaySchema,
  week: weekHoursSchema,
});

export const openingHoursSchema = z.strictObject({
  week: weekHoursSchema.default({}),
  seasons: z.array(openingSeasonSchema).max(MAX_SEASONS, `At most ${MAX_SEASONS} seasons`).default([]),
  closed: z.array(z.union([isoDate, monthDaySchema])).max(MAX_CLOSED_DATES, `At most ${MAX_CLOSED_DATES} closed dates`).default([]),
  source: z
    .string()
    .trim()
    .refine((v) => safeWebHref(v) !== null, "Source must be a web address (http/https)")
    .optional(),
});

export type OpeningHoursInput = z.input<typeof openingHoursSchema>;

/** The stored column → the model, or null when empty, unreadable or invalid (= not known). */
export function parseOpeningHours(raw: string | null | undefined): OpeningHours | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = openingHoursSchema.safeParse(json);
  return parsed.success && !isEmptyOpeningHours(parsed.data) ? parsed.data : null;
}

/** The model → the stored column; empty hours store as null. */
export function serializeOpeningHours(oh: OpeningHours | null | undefined): string | null {
  return oh && !isEmptyOpeningHours(oh) ? JSON.stringify(oh) : null;
}
```

If `expectTypeOf(...).toExtend` is not in this Vitest's API, use `.toMatchTypeOf<OpeningHours>()`. Check with `grep -n "toExtend" node_modules/expect-type/dist/index.d.ts`.

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/validations/opening-hours.test.ts`: all pass.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/validations/opening-hours.ts` + `npx tsc --noEmit` + `npx eslint lib/validations/opening-hours.ts lib/validations/opening-hours.test.ts`

- [ ] **Step 6: Commit** — files: `lib/validations/opening-hours.ts`, `lib/validations/opening-hours.test.ts`. Message: `feat(planning): Opening hours schema, parse and serialise (R4)`

---

### Task S.6: Book-by and Slot-time field schemas (`lib/validations/planning.ts`)

**Files:**
- Create: `lib/validations/planning.ts`
- Test: Create `lib/validations/planning.test.ts`

**Interfaces:**
- Consumes: `bookingStateSchema` (S.2, `lib/enums.ts`), `MAX_ARRIVE_BY_MINUTES` (S.3), `hhmm` and `isoDateWith` (`lib/validations/primitives.ts`).
- Produces:
  ```ts
  export const bookBySchema: z.ZodType<string>;          // real YYYY-MM-DD
  export const slotTimeSchema: z.ZodType<string>;        // HH:mm
  export const arriveByMinutesSchema: z.ZodType<number>; // int 0..720
  export const refundableSchema: z.ZodBoolean;
  export function checkSlotFields(data: { slotTime?: string | null; arriveByMinutes?: number | null }, ctx: z.RefinementCtx): void;
  ```
  A composes `bookingStateSchema.nullable().optional()` and `bookBySchema.nullable().optional()` into the three entity schemas. C composes the slot fields with `.nullable().optional()` and adds `.superRefine(checkSlotFields)` to `itemSchema`.

- [ ] **Step 1: Write the failing test**

Create `lib/validations/planning.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { bookingStateSchema } from "@/lib/enums";
import { arriveByMinutesSchema, bookBySchema, checkSlotFields, refundableSchema, slotTimeSchema } from "./planning";

describe("bookingStateSchema", () => {
  it("accepts the three states only", () => {
    expect(bookingStateSchema.safeParse("TO_BOOK").success).toBe(true);
    expect(bookingStateSchema.safeParse("TENTATIVE").success).toBe(false);
  });
});

describe("bookBySchema", () => {
  it("is a real calendar date with a book-by message", () => {
    expect(bookBySchema.parse("2026-11-01")).toBe("2026-11-01");
    const bad = bookBySchema.safeParse("2026-02-30");
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe("Book-by date must be a real calendar date");
    expect(bookBySchema.safeParse("1 Nov").error?.issues[0]?.message).toBe("Book-by date must be in YYYY-MM-DD format");
  });
});

describe("slot fields", () => {
  it("slot time is HH:MM", () => {
    expect(slotTimeSchema.safeParse("12:00").success).toBe(true);
    expect(slotTimeSchema.safeParse("12").success).toBe(false);
  });
  it("arrive-by is whole minutes from 0 to 720", () => {
    expect(arriveByMinutesSchema.safeParse(0).success).toBe(true);
    expect(arriveByMinutesSchema.safeParse(720).success).toBe(true);
    expect(arriveByMinutesSchema.safeParse(721).success).toBe(false);
    expect(arriveByMinutesSchema.safeParse(-1).success).toBe(false);
    expect(arriveByMinutesSchema.safeParse(7.5).success).toBe(false);
  });
  it("refundable is yes or no (null, not known, is the caller's nullable())", () => {
    expect(refundableSchema.safeParse(false).success).toBe(true);
    expect(refundableSchema.safeParse("no").success).toBe(false);
  });
  it("an arrive-by margin needs a slot time", () => {
    const s = z
      .object({ slotTime: slotTimeSchema.nullable().optional(), arriveByMinutes: arriveByMinutesSchema.nullable().optional() })
      .superRefine(checkSlotFields);
    expect(s.safeParse({ slotTime: "12:00", arriveByMinutes: 15 }).success).toBe(true);
    expect(s.safeParse({ slotTime: "12:00" }).success).toBe(true);
    expect(s.safeParse({}).success).toBe(true);
    const bad = s.safeParse({ arriveByMinutes: 15 });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]).toMatchObject({ path: ["arriveByMinutes"], message: "Set the slot time to use an arrive-by margin" });
    expect(s.safeParse({ slotTime: null, arriveByMinutes: 15 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/validations/planning.test.ts` → `Failed to resolve import "./planning"`.

- [ ] **Step 3: Implement**

Create `lib/validations/planning.ts`:

```ts
import { z } from "zod";
import { MAX_ARRIVE_BY_MINUTES } from "@/lib/slot-time";
import { hhmm, isoDateWith } from "@/lib/validations/primitives";

/**
 * Field schemas for the planning model (spec 2026-10-17 R2–R3), composed into
 * itemSchema / transportSchema / accommodationSchema by the tasks that wire
 * the fields in. Booking state itself is `bookingStateSchema` (lib/enums.ts).
 */

/** CONTEXT.md "Booking state": the day a To book thing should be booked by. */
export const bookBySchema = isoDateWith(
  "Book-by date must be in YYYY-MM-DD format",
  "Book-by date must be a real calendar date",
);

/** CONTEXT.md "Slot time": the ticket's time, Stop-local. */
export const slotTimeSchema = hhmm;

export const arriveByMinutesSchema = z
  .number()
  .int("Arrive-by must be whole minutes")
  .min(0, "Arrive-by can't be negative")
  .max(MAX_ARRIVE_BY_MINUTES, "Arrive-by can be at most 12 hours");

/** true = refundable, false = not; the caller's `.nullable()` carries "not known". */
export const refundableSchema = z.boolean();

/** superRefine callback: an arrive-by margin only means something against a slot time. */
export function checkSlotFields(
  data: { slotTime?: string | null; arriveByMinutes?: number | null },
  ctx: z.RefinementCtx,
): void {
  if (data.arriveByMinutes != null && !data.slotTime) {
    ctx.addIssue({ code: "custom", message: "Set the slot time to use an arrive-by margin", path: ["arriveByMinutes"] });
  }
}
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/validations/planning.test.ts`: all pass.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/validations/planning.ts` + `npx tsc --noEmit` + `npx eslint lib/validations/planning.ts lib/validations/planning.test.ts`

- [ ] **Step 6: Commit** — files: `lib/validations/planning.ts`, `lib/validations/planning.test.ts`. Message: `feat(planning): book-by and slot-time field schemas (R2, R3)`

---

### Task S.7: Forks carry every new column; Duplicate keeps Opening hours

**Files:**
- Modify: `lib/fork-plan.ts`:
  - imports (`:17-19`)
  - `ForkSourceTransport` (`:62-80`), `ForkSourceAccommodation` (`:82-95`), `ForkSourceItem` (`:97-125`)
  - `ForkPlan` transports data (`:191-205`), accommodations data (`:207-220`), items data (`:222-244`)
  - the builder (`:286-317`)
- Modify: `lib/duplicate-trip.ts`:
  - `DuplicateSourceItem` (`:44-61`)
  - `DuplicatePlan` items data (`:113-121`)
  - the builder items (`:179-199`)
- Test: Modify `lib/fork-plan.test.ts` (append), `lib/duplicate-trip.test.ts:72-83` (expectation gains `openingHours: null`) plus a new case.

**Interfaces:**
- Consumes: `effectiveBookingState` (S.2); the S.1 columns (`server/actions/forks.ts:146-218` and `server/actions/trips.ts:699-711` spread `...x.data` into `create`, so nothing changes there).
- Produces:
  - `ForkPlan.transports[].data` and `.accommodations[].data` gain `bookingState: string; bookingStateSet: boolean; bookBy: string | null`.
  - `ForkPlan.items[].data` gains those three plus `slotTime: string | null; arriveByMinutes: number | null; refundable: boolean | null; openingHours: string | null`.
  - `DuplicatePlan.items[].data` gains `openingHours: string | null`.

- [ ] **Step 1: Write the failing test**

Append to `lib/fork-plan.test.ts`:

```ts
// Spec 2026-10-17 R2–R4: a Fork is a faithful copy, so Booking state, book-by,
// Slot time and Opening hours carry into the variant.
it("carries Booking state, book-by, Slot time and Opening hours into the variant", () => {
  const hours = '{"week":{"mon":[]},"seasons":[],"closed":[]}';
  const plan = buildForkPlan({
    ...source,
    transports: [{ ...source.transports[0], bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2026-06-20" }],
    accommodations: [{ ...source.accommodations[0], bookingState: "NONE", bookingStateSet: true, bookBy: null }],
    items: [{ ...source.items[0], bookingState: "BOOKED", bookingStateSet: false, bookBy: null,
              slotTime: "12:00", arriveByMinutes: 15, refundable: false, openingHours: hours }],
  });
  expect(plan.transports[0].data).toMatchObject({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2026-06-20" });
  expect(plan.accommodations[0].data).toMatchObject({ bookingState: "NONE", bookingStateSet: true, bookBy: null });
  expect(plan.items[0].data).toMatchObject({
    bookingState: "BOOKED", bookingStateSet: false, bookBy: null,
    slotTime: "12:00", arriveByMinutes: 15, refundable: false, openingHours: hours,
  });
});

it("a source row without the new columns copies the derived state and nulls", () => {
  const plan = buildForkPlan(source); // every fixture row has a reference
  expect(plan.transports[0].data).toMatchObject({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
  expect(plan.accommodations[0].data).toMatchObject({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
  expect(plan.items[0].data).toMatchObject({
    bookingState: "BOOKED", bookingStateSet: false, bookBy: null,
    slotTime: null, arriveByMinutes: null, refundable: null, openingHours: null,
  });
  const bare = buildForkPlan({ ...source, transports: [{ ...source.transports[0], reference: null }], items: [{ ...source.items[0], booking: null }] });
  expect(bare.transports[0].data.bookingState).toBe("TO_BOOK");
  expect(bare.items[0].data.bookingState).toBe("NONE");
});
```

In `lib/duplicate-trip.test.ts`, the test "turns all items into unscheduled wishlist items, clearing date/time/booking, keeping research" (`:72-83`): add `openingHours: null,` to its `toEqual` object, after `sortOrder: 0, hiddenFromShares: true,`. Then add inside `describe("buildDuplicatePlan")`:

```ts
  // Spec 2026-10-17 R4: Opening hours belong to the place, so they survive a
  // Duplicate like the address does. Booking state, book-by and Slot time go
  // with the reference and the dates: the copy's rows take the column defaults.
  it("keeps an Item's Opening hours; leaves Booking state and Slot time to the defaults", () => {
    const hours = '{"week":{"mon":[]},"seasons":[],"closed":[]}';
    const plan = buildDuplicatePlan({ ...SOURCE, items: [{ ...SOURCE.items[0], openingHours: hours }] }, "x");
    expect(plan.items[0].data.openingHours).toBe(hours);
    for (const key of ["bookingState", "bookingStateSet", "bookBy", "slotTime", "arriveByMinutes", "refundable"]) {
      expect(plan.items[0].data).not.toHaveProperty(key);
    }
    expect(plan.transports[0].data).not.toHaveProperty("bookingState");
  });
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run lib/fork-plan.test.ts lib/duplicate-trip.test.ts`. Expected failures:
- the two new fork cases: `bookingState` is `undefined`;
- the duplicate `toEqual`: missing `openingHours`;
- the new duplicate case: `openingHours` is `undefined`.

- [ ] **Step 3: Implement**

`lib/fork-plan.ts`:

1. Imports: add `import { effectiveBookingState } from "@/lib/booking-state";`.
2. `ForkSourceTransport`, after `sortOrder: number;`, and `ForkSourceAccommodation`, after `lng: number | null;`, both get:
   ```ts
   /** CONTEXT.md "Booking state" (spec 2026-10-17 R2) — optional so older-shaped rows still build. */
   bookingState?: string | null;
   bookingStateSet?: boolean | null;
   bookBy?: string | null;
   ```
3. `ForkSourceItem`, after `surpriseRevealedAt?: Date | null;`, gets the same three, plus:
   ```ts
   /** CONTEXT.md "Slot time" / "Opening hours" (R3, R4). */
   slotTime?: string | null;
   arriveByMinutes?: number | null;
   refundable?: boolean | null;
   openingHours?: string | null;
   ```
4. `ForkPlan` data types:
   - transports `data`, after `sortOrder: number;`, and accommodations `data`, after `lng: number | null;`: `bookingState: string; bookingStateSet: boolean; bookBy: string | null;`
   - items `data`, after `surpriseRevealedAt: Date | null;`: the same three plus `slotTime: string | null; arriveByMinutes: number | null; refundable: boolean | null; openingHours: string | null;`
5. Builder:
   - transports `data`: after `reference: t.reference, notes: t.notes, sortOrder: t.sortOrder,` add
     ```ts
     bookingState: effectiveBookingState("TRANSPORT", t, t.reference), bookingStateSet: t.bookingStateSet ?? false, bookBy: t.bookBy ?? null,
     ```
   - accommodations `data`: after `confirmation: a.confirmation, notes: a.notes, lat: a.lat, lng: a.lng,` add
     ```ts
     bookingState: effectiveBookingState("ACCOMMODATION", a, a.confirmation), bookingStateSet: a.bookingStateSet ?? false, bookBy: a.bookBy ?? null,
     ```
   - items `data`: after `surpriseRevealedAt: it.surpriseRevealedAt ?? null,` add
     ```ts
     bookingState: effectiveBookingState("ITEM", it, it.booking), bookingStateSet: it.bookingStateSet ?? false, bookBy: it.bookBy ?? null,
     slotTime: it.slotTime ?? null, arriveByMinutes: it.arriveByMinutes ?? null, refundable: it.refundable ?? null,
     openingHours: it.openingHours ?? null,
     ```
6. Header comment (`:7`): extend the KEEP line to `KEEP  — dates, pinned, accommodations, estimated Costs, rateToHome, Booking state / book-by / Slot time / Opening hours`.

`lib/duplicate-trip.ts`:

1. `DuplicateSourceItem`, after `notes: string | null;`: add `/** CONTEXT.md "Opening hours" — the place's, so kept like the address (spec 2026-10-17 R4). */ openingHours?: string | null;`
2. `DuplicatePlan` items `data`: after `notes: string | null; sortOrder: number;`, add `openingHours: string | null;`
3. Builder items `data`: after `notes: it.notes,` add `openingHours: it.openingHours ?? null,`
4. Header comment (`:7-10`): after "keep the skeleton (…" add "Opening hours kept;" and to the reset clause add "Booking state, book-by and Slot time fall to the column defaults with the references and dates".

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/fork-plan.test.ts lib/duplicate-trip.test.ts`: all pass.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/fork-plan.ts lib/duplicate-trip.ts` (picks up `server/actions/forks.test.ts` and `server/actions/trips.test.ts`) + `npx tsc --noEmit` + `npx eslint lib/fork-plan.ts lib/fork-plan.test.ts lib/duplicate-trip.ts lib/duplicate-trip.test.ts`

- [ ] **Step 6: Commit** — files: `lib/fork-plan.ts`, `lib/fork-plan.test.ts`, `lib/duplicate-trip.ts`, `lib/duplicate-trip.test.ts`. Message: `feat(planning): Forks carry Booking state, Slot time and Opening hours; Duplicate keeps hours`

---

### Task S.8: A placed copy carries its idea's Opening hours

**Files:**
- Modify: `server/actions/items.ts:590-623` (`ideaCopyData` and its doc comment)
- Test: Modify `server/actions/items.test.ts`: add a case after `:877-892` (scheduleItem "carries hiddenFromShares…") and one inside `describe("placeIdeaAtStop")` (after `:1411-1450`)

**Interfaces:**
- Consumes: S.1 `Item.openingHours`.
- Produces: every copy-in placement (`scheduleItem`'s copy-in branch, `placeIdeaAtStop`) creates the copy with `openingHours: idea.openingHours ?? null`. D's family writer relies on each row holding its own copy.

- [ ] **Step 1: Write the failing test**

In `server/actions/items.test.ts`, inside `describe("scheduleItem")`, after the "carries hiddenFromShares from the Wishlist idea onto the placed copy (review fix)" case:

```ts
  it("carries the idea's Opening hours onto the placed copy (spec 2026-10-17 R4)", async () => {
    const hours = '{"week":{"mon":[]},"seasons":[],"closed":[]}';
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" })
      .mockResolvedValueOnce({
        id: "item-1", tripId: "trip-1", forkId: null, date: null, stopId: null,
        title: "Uffizi", category: "SIGHTSEEING", openingHours: hours,
      });
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "placed-1" });

    await scheduleItem("item-1", { date: "2026-08-10" }, null);

    expect(itemCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ openingHours: hours }) });
  });
```

Inside `describe("placeIdeaAtStop")`, after "copies the idea onto the Stop's things to do with no date":

```ts
  it("carries the idea's Opening hours onto the thing to do; none copies as null", async () => {
    const hours = '{"week":{"tue":[["10:00","18:00"]]},"seasons":[],"closed":[]}';
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1", forkId: null })
      .mockResolvedValueOnce({ ...IDEA, openingHours: hours });
    stopFindFirstMock.mockResolvedValue({ id: "s1" });
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "placed-1" });
    await placeIdeaAtStop("idea-1", "s1");
    expect(itemCreateMock).toHaveBeenLastCalledWith({ data: expect.objectContaining({ openingHours: hours }) });

    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1", forkId: null })
      .mockResolvedValueOnce(IDEA); // no openingHours on the row
    await placeIdeaAtStop("idea-1", "s1");
    expect(itemCreateMock).toHaveBeenLastCalledWith({ data: expect.objectContaining({ openingHours: null }) });
  });
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run server/actions/items.test.ts -t "Opening hours"` → both fail: `openingHours` is absent from the create data.

- [ ] **Step 3: Implement**

In `server/actions/items.ts`, `ideaCopyData`:
- add `openingHours?: string | null;` to the parameter type, after `hiddenFromShares: boolean | null;`;
- add `openingHours: fullItem.openingHours ?? null,` to the returned object, after `hiddenFromShares`;
- update the doc comment's list to: "source link, title/category, coordinates, address, link, notes, the share-hidden flag and the place's Opening hours (spec 2026-10-17 R4: shared by the family — each row holds a copy and writes go to all of them, lib/opening-hours.ts openingHoursFamilyWhere)".

Do not copy Booking state, book-by or Slot time. The ticket belongs to the placed Item, and the copy takes the column defaults.

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run server/actions/items.test.ts`: all pass.

- [ ] **Step 5: Task-done check** — `npx vitest related --run server/actions/items.ts` + `npx tsc --noEmit` + `npx eslint server/actions/items.ts server/actions/items.test.ts`

- [ ] **Step 6: Commit** — files: `server/actions/items.ts`, `server/actions/items.test.ts`. Message: `feat(planning): a placed copy carries its idea's Opening hours (R4)`

---

### Task S.9: The Surprise placeholder masks the new Item fields

**Files:**
- Modify: `lib/surprise-visibility.ts:17-39` (`PlaceholderItem`), `:161-185` (the placeholder builder)
- Test: Modify `lib/surprise-visibility.test.ts:177-207` ("case 5": extend the `toMatchObject`)

**Interfaces:**
- Consumes: S.1 column names.
- Produces: `PlaceholderItem` gains `bookingState: "NONE"; bookingStateSet: false; bookBy: null; slotTime: null; arriveByMinutes: null; refundable: null; openingHours: null`. B, C and D map placeholders into their item rows from these fields, and a hidden Surprise never shows as "To book", with a ticket time or with the place's hours.

- [ ] **Step 1: Write the failing test**

In `lib/surprise-visibility.test.ts`, "case 5: a root Surprise Item produces one masked placeholder": add to the `toMatchObject` object, after `sourceItemId: null,`:

```ts
      // Spec 2026-10-17 R2–R4: nothing about the booking, the ticket or the place leaks.
      bookingState: "NONE",
      bookingStateSet: false,
      bookBy: null,
      slotTime: null,
      arriveByMinutes: null,
      refundable: null,
      openingHours: null,
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/surprise-visibility.test.ts -t "case 5"` → the `toMatchObject` diff shows the seven keys missing.

- [ ] **Step 3: Implement**

`lib/surprise-visibility.ts`, `PlaceholderItem`, after `sourceItemId: null;`:

```ts
  // Spec 2026-10-17 R2–R4: masked like the title — a Surprise is never "To book", ticketed or hours-bearing to its audience.
  bookingState: "NONE";
  bookingStateSet: false;
  bookBy: null;
  slotTime: null;
  arriveByMinutes: null;
  refundable: null;
  openingHours: null;
```

In the builder's `.map((i) => ({ … }))`, after `sourceItemId: null,`:

```ts
      bookingState: "NONE" as const,
      bookingStateSet: false as const,
      bookBy: null,
      slotTime: null,
      arriveByMinutes: null,
      refundable: null,
      openingHours: null,
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/surprise-visibility.test.ts`: all pass.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/surprise-visibility.ts` + `npx tsc --noEmit` + `npx eslint lib/surprise-visibility.ts lib/surprise-visibility.test.ts`

- [ ] **Step 6: Commit** — files: `lib/surprise-visibility.ts`, `lib/surprise-visibility.test.ts`. Message: `feat(planning): Surprise placeholder masks Booking state, Slot time and Opening hours`
## Section A — Booking state behaviour

### Notes

**Assumes from Section S (exact names; the assembler reconciles if S chose others):**
- Prisma, on `Item`, `Transport` and `Accommodation`:
  - `bookingState BookingState`, a Prisma enum `BookingState { NONE TO_BOOK BOOKED }`;
  - `bookingStateSet Boolean @default(false)`, true when the Traveller chose the state;
  - `bookBy String?`, YYYY-MM-DD.
- S's migration backfills every existing row: `bookingState` is the effective state (a non-blank reference gives BOOKED; otherwise TRANSPORT/ACCOMMODATION get TO_BOOK and ITEM gets NONE), and `bookingStateSet` is false. Section A does **not** rely on the column defaults. Every create path below writes all three columns explicitly.
- `lib/booking-state.ts` is pure, zod-free and client-safe. It exports:
  ```ts
  export const BOOKING_STATES = ["NONE", "TO_BOOK", "BOOKED"] as const;
  export type BookingState = (typeof BOOKING_STATES)[number];
  export type BookingKind = "ITEM" | "TRANSPORT" | "ACCOMMODATION";
  /** set && state → state; else a non-blank reference → BOOKED; else TRANSPORT/ACCOMMODATION → TO_BOOK, ITEM → NONE. */
  export function effectiveBookingState(
    input: { state: BookingState | null | undefined; set: boolean; reference: string | null | undefined },
    kind: BookingKind,
  ): BookingState;
  ```
- `lib/validations/booking-state.ts` exports `bookingStateSchema = z.enum(BOOKING_STATES)`.
- If S already put `bookingState`/`bookBy` on `itemSchema`/`transportSchema`/`accommodationSchema`, then Step 3a of A.3, A.4 and A.5 is a no-op. Keep S's version.

**Produces (for Section B, for C/D, and for the final gate):**
- `lib/booking-state-patch.ts` (A.1):
  - `interface BookingFields { bookingState: BookingState; bookingStateSet: boolean; bookBy: string | null }`
  - `interface BookingPatch { bookingState?: BookingState | null; bookBy?: string | null }`
  - `resolveBookingWrite(kind, current: BookingFields | null, patch: BookingPatch, reference): BookingFields | ActionFailure`
  - `defaultBookingFields(kind): BookingFields`
  - `copiedBookingFields(source: BookingFields): BookingFields`
  - `BOOK_BY_NEEDS_TO_BOOK`
- `lib/booking-state-copy.ts` (A.2) is zod-free and client-safe. It exports `BOOKING_STATE_LABELS: Record<BookingState, string>` ("No booking needed" / "To book" / "Booked") and `bookByLabel(date)`, which gives "Book by 20 Nov".
- The Activity `FIELD_SPECS` of ITEM, TRANSPORT and ACCOMMODATION gain `bookingState` (label "Booking") and `bookBy` (label "Book by").
- View types (A.7, A.8) gain `bookingState?: BookingState | null; bookingStateSet?: boolean | null; bookBy?: string | null` on these: `ItemCardItem`, `TransportCardTransport`, `AccommodationCardAccommodation` (lib/plan-entity-views.ts), `ThingToDo` (components/plan/types.ts), `StopDayItem` (lib/stop-days.ts), `ItineraryTransport` (components/trip/itinerary-manager.tsx), and `ItineraryItem`/`ItineraryTransport`/`ItineraryAccommodation` (lib/itinerary.ts). The `Day*Row` types (lib/day-view-model.ts) gain them as required fields. `PlaceholderItem` (lib/surprise-visibility.ts) gains `bookingState: "NONE"; bookingStateSet: false; bookBy: null`. `readPlan` and `readDayRows` select all three.
- The Proposal inputs (`ProposedTransportInput`, `ProposedAccommodationInput`, `ProposedItemInput`) gain `bookingState?: BookingState; bookBy?: string`. Booking import sets `bookingState: "BOOKED"` (A.9).
- `components/trip/booking-state-field.tsx` (A.10) exports `useBookingStateField`, `BookingStateField`, `seedFromProposal` and `BookingStateSeed`.
- MCP:
  - `lib/mcp/booking-state-fields.ts` (A.15) exports `describedBookingState`, `bookByField`, `bookingCreateShape`, `bookingPatchShape` and `bookingPatchFrom`.
  - `BOOKING_STATE_MEANING` is added to lib/mcp/vocab.ts.
  - `set_booking_state(kind, id, state, bookBy?)` lives in the new lib/mcp/tools/booking-state-write.ts, as `registerBookingStateTools` (A.16).
  - `McpAccommodation`, `McpThingToDo`, `McpDayItem` (and so `McpItem`) and `McpTransport` all carry `bookingState: BookingState; bookBy: string | null` (A.14).

**Collision notes for the assembler (C/D touch the same files):**
- `ideaCopyData` and `itemSchema` (C's slot fields). Each section adds its own keys; nothing is replaced.
- The Item form dialog (C's slot fields, D's opening hours). A.11 adds one block after the booking pair.
- `itemCreateShape`/`itemPatchShape` in plan-write.ts (C).
- `MCP_THING_TO_DO_SELECT`, `toMcpDayItem` and `withPlaceholders` in plan-shapes.ts (C/D).
- `PlaceholderItem` (C/D, if they add Item columns).
- `PLAN_ITEM_SELECT` and the day-reads item select (C/D).
- Booking import `itemProposal` (C's slot extraction).

**Decisions where the spec is silent:**
1. **Stored = effective.** Every create and update writes the effective state into `bookingState`, so no reader ever derives it. `bookingStateSet` records only whether the Traveller chose it. In a PATCH, `bookingState: null` clears the choice and re-derives it. No UI or MCP field exposes that today. It exists for the PATCH contract's completeness.
2. **Book-by rules.** A `bookBy` value sent in a patch whose resulting state is not TO_BOOK is refused on the field ("A book-by date is only for something still to book."). A stored `bookBy` is cleared silently when the state leaves TO_BOOK. That covers a Traveller choosing Booked, and an un-chosen leg gaining a reference.
3. **The form sends `bookingState` only once it's chosen.** That means the Traveller picked it in this dialog, or the row or Proposal already carried a choice. The control previews the derivation live from the reference field. So typing a booking reference on an un-chosen thing flips it to Booked, as the spec says. `bookingState` is not in the `*_CLEARABLE` lists: a null there would erase a choice. `bookBy` is.
4. **Placed copies** (`scheduleItem` copy-in, `placeIdeaAtStop`) inherit the idea's *chosen* state, and its book-by date when it is To book. An un-chosen idea's copy re-derives. References are not copied today, so that copy is No booking needed.
5. **Forks copy all three columns.** Promote re-tags rows, so it needs nothing. Duplicate trip strips references and drops stays, so it writes fresh defaults: TRANSPORT gets TO_BOOK, ITEM gets NONE.
6. **Booking import lands Booked as a choice.** `bookingStateSet` is true, so it stays Booked even when the document prints no reference. The Traveller can change it in the Proposal form before confirming. A Proposal saved before this ships has no `bookingState`, so it derives on confirm (a reference gives Booked).
7. **`set_booking_state` replaces both values.** Omitting `bookBy` means no book-by date. It reuses `updateItem`/`updateTransport`/`updateAccommodation`, so there is one write path and one Activity line, with no new server action. The `update_*` tools take `bookingState`/`bookBy` as a PATCH, and `bookBy: ""` clears.
8. **MCP exposes `bookingState` + `bookBy` only**, not `bookingStateSet`.
9. **Not changed:**
   - Flags and the "Book transport (N legs missing times)" nudge (`nudge-unbooked-transport`, lib/next-steps.ts:157), which is Branch 2's business.
   - Print and Share show no booking state.
   - The help guide is not updated. That is a follow-up candidate for the final gate.

**Proposed Resolves-Feedback:** none in A. `cmvaig4j5000u07gwgeqrvtkd` goes on Branch 1's last task, which the assembler writes.

**Review Focus candidates:**
1. **A tentative leg.**
   - A Transport with no reference and no choice is To book. Editing it in the dialog and typing a reference, without touching the control, saves Booked and clears its book-by date.
   - A leg the Traveller set to To book stays To book after a reference is added.
   - A book-by date sent with Booked is refused.
   - Tested in A.1 (pure), A.4 (integration) and A.12 (form).
2. **A museum ticket imported with no reference printed** lands Booked (`bookingStateSet` true), not "No booking needed". Tested in A.9.
3. **Claude's `set_booking_state(TRANSPORT, id, "TO_BOOK", "2027-05-01")`** returns the leg showing TO_BOOK with that book-by date. Afterwards `get_trip_plan`, `get_transport` and `get_day` all agree. Tested in A.14 (integration) and A.16.

---

### Task A.1: The write rule — `resolveBookingWrite`

**Files:**
- Create: `lib/booking-state-patch.ts`
- Test: `lib/booking-state-patch.test.ts` (create)

**Interfaces:**
- Consumes: `effectiveBookingState`, `BookingKind`, `BookingState` (S, lib/booking-state.ts); `patched` (lib/patch.ts:25); `ActionFailure` (lib/action-result.ts:21)
- Produces: `BookingFields`, `BookingPatch`, `BOOK_BY_NEEDS_TO_BOOK`, `resolveBookingWrite`, `defaultBookingFields`, `copiedBookingFields`

- [ ] **Step 1: Write the failing test** — `lib/booking-state-patch.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  BOOK_BY_NEEDS_TO_BOOK,
  copiedBookingFields,
  defaultBookingFields,
  resolveBookingWrite,
  type BookingFields,
} from "./booking-state-patch";

const unchosenToBook: BookingFields = { bookingState: "TO_BOOK", bookingStateSet: false, bookBy: "2026-11-20" };
const chosenToBook: BookingFields = { bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2026-11-20" };

describe("resolveBookingWrite (CONTEXT.md Booking state, spec R2)", () => {
  it("a new thing with no reference: Transport and Accommodation are To book, an Item needs no booking", () => {
    expect(resolveBookingWrite("TRANSPORT", null, {}, null)).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });
    expect(resolveBookingWrite("ACCOMMODATION", null, {}, "  ")).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });
    expect(resolveBookingWrite("ITEM", null, {}, undefined)).toEqual({ bookingState: "NONE", bookingStateSet: false, bookBy: null });
  });

  it("a reference implies Booked", () => {
    expect(resolveBookingWrite("TRANSPORT", null, {}, "QF1")).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
    expect(resolveBookingWrite("ITEM", null, {}, "BK-9")).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
  });

  it("a chosen state wins over the reference, and a book-by date rides with To book", () => {
    expect(resolveBookingWrite("ITEM", null, { bookingState: "TO_BOOK", bookBy: "2026-11-20" }, "BK-9"))
      .toEqual({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2026-11-20" });
  });

  it("an un-chosen To book leg that gains a reference becomes Booked and drops its book-by date", () => {
    expect(resolveBookingWrite("TRANSPORT", unchosenToBook, {}, "ICE 512")).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
  });

  it("a Traveller's To book stays To book when a reference is added, keeping its book-by date", () => {
    expect(resolveBookingWrite("TRANSPORT", chosenToBook, {}, "ICE 512")).toEqual(chosenToBook);
  });

  it("bookBy undefined keeps it; null clears it", () => {
    expect(resolveBookingWrite("TRANSPORT", unchosenToBook, { bookBy: undefined }, null)).toEqual(unchosenToBook);
    expect(resolveBookingWrite("TRANSPORT", unchosenToBook, { bookBy: null }, null)).toEqual({ ...unchosenToBook, bookBy: null });
  });

  it("choosing Booked clears the book-by date", () => {
    expect(resolveBookingWrite("ACCOMMODATION", chosenToBook, { bookingState: "BOOKED" }, null))
      .toEqual({ bookingState: "BOOKED", bookingStateSet: true, bookBy: null });
  });

  it("bookingState null clears the Traveller's choice and re-derives", () => {
    expect(resolveBookingWrite("ITEM", { bookingState: "BOOKED", bookingStateSet: true, bookBy: null }, { bookingState: null }, null))
      .toEqual({ bookingState: "NONE", bookingStateSet: false, bookBy: null });
  });

  it("refuses a book-by date for something that isn't To book", () => {
    expect(resolveBookingWrite("ITEM", null, { bookingState: "BOOKED", bookBy: "2026-11-20" }, null))
      .toEqual({ success: false, errors: { bookBy: [BOOK_BY_NEEDS_TO_BOOK] } });
    expect(resolveBookingWrite("TRANSPORT", unchosenToBook, { bookBy: "2026-11-21" }, "QF1"))
      .toEqual({ success: false, errors: { bookBy: [BOOK_BY_NEEDS_TO_BOOK] } });
  });
});

describe("defaultBookingFields / copiedBookingFields", () => {
  it("defaults per kind", () => {
    expect(defaultBookingFields("TRANSPORT")).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });
    expect(defaultBookingFields("ITEM")).toEqual({ bookingState: "NONE", bookingStateSet: false, bookBy: null });
  });

  it("a placed copy keeps the idea's chosen state and book-by date", () => {
    expect(copiedBookingFields({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2026-11-20" }))
      .toEqual({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2026-11-20" });
    expect(copiedBookingFields({ bookingState: "BOOKED", bookingStateSet: true, bookBy: null }))
      .toEqual({ bookingState: "BOOKED", bookingStateSet: true, bookBy: null });
  });

  it("an un-chosen idea's copy re-derives without the reference (which is not copied)", () => {
    expect(copiedBookingFields({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null }))
      .toEqual({ bookingState: "NONE", bookingStateSet: false, bookBy: null });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run lib/booking-state-patch.test.ts`. It fails with `Failed to resolve import "./booking-state-patch"`.

- [ ] **Step 3: Implement** — `lib/booking-state-patch.ts`

```ts
/**
 * Booking state on write (CONTEXT.md "Booking state", spec 2026-10-17 R2).
 * Every create and update of an Item, Transport or Accommodation runs its
 * booking fields through `resolveBookingWrite`, so the stored `bookingState`
 * is always the effective one and no reader derives it:
 *
 *  - a state the Traveller chose wins (`bookingStateSet`);
 *  - otherwise a booking reference (Item `booking`, Transport `reference`,
 *    Accommodation `confirmation`) means Booked, and without one Transport
 *    and Accommodation are To book, an Item needs no booking;
 *  - a book-by date only rides with To book: sent with anything else it is
 *    refused, and a stored one is dropped when the state leaves To book.
 *
 * The PATCH contract (ADR 0075): `bookingState` undefined keeps the choice
 * (or keeps deriving), null clears the choice; `bookBy` undefined keeps,
 * null clears. Pure.
 */
import type { ActionFailure } from "@/lib/action-result";
import { patched } from "@/lib/patch";
import { effectiveBookingState, type BookingKind, type BookingState } from "@/lib/booking-state";

export interface BookingFields {
  bookingState: BookingState;
  bookingStateSet: boolean;
  bookBy: string | null;
}

export interface BookingPatch {
  bookingState?: BookingState | null;
  bookBy?: string | null;
}

export const BOOK_BY_NEEDS_TO_BOOK = "A book-by date is only for something still to book.";

/** The three columns to write, or the refusal of a book-by date on something not To book. */
export function resolveBookingWrite(
  kind: BookingKind,
  current: BookingFields | null,
  patch: BookingPatch,
  reference: string | null | undefined,
): BookingFields | ActionFailure {
  const set = patch.bookingState === undefined ? (current?.bookingStateSet ?? false) : patch.bookingState !== null;
  const chosen = patch.bookingState ?? (set ? (current?.bookingState ?? null) : null);
  const bookingState = effectiveBookingState({ state: chosen, set, reference }, kind);
  if (bookingState !== "TO_BOOK") {
    if (patch.bookBy) return { success: false, errors: { bookBy: [BOOK_BY_NEEDS_TO_BOOK] } };
    return { bookingState, bookingStateSet: set, bookBy: null };
  }
  return { bookingState, bookingStateSet: set, bookBy: patched(patch.bookBy, current?.bookBy) ?? null };
}

/** A new row with nothing chosen and no reference (Wishlist from a Marker, Duplicate trip). */
export function defaultBookingFields(kind: BookingKind): BookingFields {
  return { bookingState: effectiveBookingState({ state: null, set: false, reference: null }, kind), bookingStateSet: false, bookBy: null };
}

/**
 * A placed copy of a Wishlist idea (ADR 0019): the idea's chosen state (and
 * its book-by date while To book) carries over; an un-chosen idea's copy
 * re-derives, and the reference is never copied, so it needs no booking.
 */
export function copiedBookingFields(source: BookingFields): BookingFields {
  if (!source.bookingStateSet) return defaultBookingFields("ITEM");
  return {
    bookingState: source.bookingState,
    bookingStateSet: true,
    bookBy: source.bookingState === "TO_BOOK" ? source.bookBy : null,
  };
}
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/booking-state-patch.test.ts`

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/booking-state-patch.ts` + `npx tsc --noEmit` + `npx eslint lib/booking-state-patch.ts lib/booking-state-patch.test.ts`

- [ ] **Step 6: Commit** — `lib/booking-state-patch.ts`, `lib/booking-state-patch.test.ts`. Message: `feat(booking-state): one write rule for state, choice and book-by date`

---

### Task A.2: Booking state copy and the Activity diff

**Files:**
- Create: `lib/booking-state-copy.ts`
- Modify: `lib/activity.ts:163-201` (FIELD_SPECS ITEM / TRANSPORT / ACCOMMODATION), plus a formatter beside `pinnedFormat` (`lib/activity.ts:125-128`)
- Test: `lib/booking-state-copy.test.ts` (create), `lib/activity.test.ts` (extend)

**Interfaces:**
- Consumes: `BookingState` (S); `formatDayMonth` (lib/dates.ts:174)
- Produces: `BOOKING_STATE_LABELS`, `bookByLabel(date: string): string`; Activity changes `{ field: "bookingState", label: "Booking" }` and `{ field: "bookBy", label: "Book by" }`

- [ ] **Step 1: Write the failing tests**

`lib/booking-state-copy.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { BOOKING_STATE_LABELS, bookByLabel } from "./booking-state-copy";

describe("Booking state copy (CONTEXT.md)", () => {
  it("names the three states as the glossary does", () => {
    expect(BOOKING_STATE_LABELS).toEqual({ NONE: "No booking needed", TO_BOOK: "To book", BOOKED: "Booked" });
  });
  it("says the book-by date as a day and month", () => {
    expect(bookByLabel("2026-11-20")).toBe("Book by 20 Nov");
  });
});
```

Append to `lib/activity.test.ts`:
```ts
describe("describeChanges booking state (spec 2026-10-17 R2)", () => {
  it.each(["ITEM", "TRANSPORT", "ACCOMMODATION"] as const)("%s: names the state and the book-by date in words", (kind) => {
    const changes = describeChanges(kind, { bookingState: "TO_BOOK", bookBy: "2026-11-20" }, { bookingState: "BOOKED", bookBy: null });
    expect(changes).toEqual(
      expect.arrayContaining([
        { field: "bookingState", label: "Booking", from: "To book", to: "Booked" },
        expect.objectContaining({ field: "bookBy", label: "Book by", to: "" }),
      ]),
    );
  });
  it("an unchanged state is no change", () => {
    expect(describeChanges("TRANSPORT", { bookingState: "TO_BOOK" }, { bookingState: "TO_BOOK" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them, expect FAIL**

`npx vitest run lib/booking-state-copy.test.ts lib/activity.test.ts`. The first file can't resolve `./booking-state-copy`. The new activity cases get `[]`, because there's no spec for `bookingState` yet.

- [ ] **Step 3: Implement**

`lib/booking-state-copy.ts`:
```ts
/**
 * Booking state in words (CONTEXT.md "Booking state"): the three names, and
 * the book-by date as cards and Home say it. Zod-free and React-free, so
 * client components import it (lib/client-zod.guard.test.ts).
 */
import type { BookingState } from "@/lib/booking-state";
import { formatDayMonth } from "@/lib/dates";

export const BOOKING_STATE_LABELS: Record<BookingState, string> = {
  NONE: "No booking needed",
  TO_BOOK: "To book",
  BOOKED: "Booked",
};

/** "Book by 20 Nov". */
export function bookByLabel(bookBy: string): string {
  return `Book by ${formatDayMonth(bookBy)}`;
}
```

`lib/activity.ts`:
- Import `BOOKING_STATE_LABELS` from `@/lib/booking-state-copy`.
- Add a formatter after `pinnedFormat` (:125-128):
  ```ts
  function bookingStateFormat(value: unknown): string {
    if (isEmpty(value)) return "";
    return BOOKING_STATE_LABELS[value as keyof typeof BOOKING_STATE_LABELS] ?? String(value);
  }
  ```
- Then append the same two specs to the end of each of `ITEM` (:172-179, after `address`), `TRANSPORT` (:180-191, after `reference`) and `ACCOMMODATION` (:192-200, after `confirmation`):
  ```ts
  { key: "bookingState", label: "Booking", format: (v) => bookingStateFormat(v) },
  { key: "bookBy", label: "Book by", format: (v) => dateFormat(v) },
  ```

- [ ] **Step 4: Run them, expect PASS** — `npx vitest run lib/booking-state-copy.test.ts lib/activity.test.ts`

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/booking-state-copy.ts lib/activity.ts` + `npx tsc --noEmit` + `npx eslint lib/booking-state-copy.ts lib/booking-state-copy.test.ts lib/activity.ts lib/activity.test.ts`

- [ ] **Step 6: Commit** — the four files. Message: `feat(booking-state): labels and Activity diff for booking state`

---

### Task A.3: Items write booking state (create, update, placed copies, Wishlist from a Marker)

**Files:**
- Modify:
  - `lib/validations/item.ts:19-108`: two schema fields, after `booking` (:57).
  - `server/actions/items.ts`:
    - `createItem` (:116-247): resolve after the parse at :123-128, and the create data at :182-202.
    - `addMarkerToWishlist` create data (:297-314).
    - `updateItem` (:336-478): resolve after the parse at :363-367, and `auditedUpdate` data at :397-412.
    - `ideaCopyData` (:599-626).
- Test:
  - `server/actions/items.test.ts` (extend: the unit refusal case).
  - `test/integration/booking-state.test.ts` (create).

**Interfaces:**
- Consumes: `resolveBookingWrite`, `defaultBookingFields`, `copiedBookingFields` (A.1); `bookingStateSchema` (S)
- Produces: `ItemInput` gains `bookingState?: BookingState`, `bookBy?: string`. `createItem`/`updateItem` accept and write them. `Patch<ItemInput>` therefore carries `bookingState?: BookingState | null; bookBy?: string | null`.

- [ ] **Step 1: Write the failing integration test** — `test/integration/booking-state.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Spec 2026-10-17 R2 against the real Postgres: the stored Booking state is
// the effective one, a reference implies Booked unless the Traveller chose,
// and a book-by date rides only with To book. Only the Next/auth boundary,
// the network (geocode, FX) and Activity are mocked.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: vi.fn(async () => null), geocodePlaceDetailed: vi.fn(async () => null) }));
vi.mock("@/lib/money/fx", () => ({ resolveRateForTrip: vi.fn(async () => ({ rate: 1, persist: null })), persistRate: vi.fn(async () => undefined) }));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-bs-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-bs-user" }, membership: { role: "owner" } })),
  requirePlanAccess: vi.fn(async (_t: string, forkId?: string | null) => ({ user: { id: "it-bs-user" }, membership: { role: "owner" }, plan: forkId ?? null })),
  requireRowAccess: vi.fn(async (kind: string, id: string) => {
    const { db } = await import("@/lib/db");
    const { notFound } = await import("next/navigation");
    const row = await (db as unknown as Record<string, { findUnique(a: unknown): Promise<unknown> }>)[kind].findUnique({ where: { id } });
    if (!row) notFound();
    return { row, user: { id: "it-bs-user" }, membership: { role: "owner" }, surpriseOf: null };
  }),
}));
vi.mock("@/lib/surprise-guard", async () => ({
  ...(await vi.importActual<object>("@/lib/surprise-guard")),
  requireOutsideSurprise: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { createItem, updateItem, scheduleItem } from "@/server/actions/items";

const TRIP_ID = "it-trip-booking-state";
const BOOKING = { bookingState: true, bookingStateSet: true, bookBy: true } as const;

describe.skipIf(process.env.INTEGRATION !== "1")("Booking state on write (spec R2, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: "it-bs-user" }, update: {}, create: { id: "it-bs-user", email: "it-bs@example.test", name: "BS", isEmailVerified: true } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "Booking state trip", homeCurrency: "AUD", startDate: "2027-06-01", endDate: "2027-06-10", createdById: "it-bs-user",
        members: { create: { userId: "it-bs-user", role: "owner" } } },
    });
  });
  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  describe("Item", () => {
    it("needs no booking by default; a booking reference makes it Booked", async () => {
      const plain = await createItem(TRIP_ID, { title: "Walk", category: "ACTIVITY" });
      const ticket = await createItem(TRIP_ID, { title: "Museum", category: "SIGHTSEEING", booking: "BK-1" });
      expect(await db.item.findUnique({ where: { id: (plain as { id: string }).id }, select: BOOKING }))
        .toEqual({ bookingState: "NONE", bookingStateSet: false, bookBy: null });
      expect(await db.item.findUnique({ where: { id: (ticket as { id: string }).id }, select: BOOKING }))
        .toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
    });

    it("a chosen To book keeps its book-by date; adding a reference later doesn't overrule the choice", async () => {
      const r = await createItem(TRIP_ID, { title: "Tour", category: "ACTIVITY", bookingState: "TO_BOOK", bookBy: "2027-05-20" });
      const id = (r as { id: string }).id;
      expect(await updateItem(id, { booking: "TOUR-7" })).toEqual({ success: true });
      expect(await db.item.findUnique({ where: { id }, select: BOOKING })).toEqual({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-20" });
    });

    it("refuses a book-by date on a Booked Item and leaves the row alone", async () => {
      const r = await createItem(TRIP_ID, { title: "Opera", category: "NIGHTLIFE", booking: "OP-1" });
      const id = (r as { id: string }).id;
      const res = await updateItem(id, { bookBy: "2027-05-01" });
      expect(res).toMatchObject({ success: false, errors: { bookBy: [expect.any(String)] } });
      expect(await db.item.findUnique({ where: { id }, select: BOOKING })).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
    });

    it("a placed copy of a To book idea is To book by the same date", async () => {
      const idea = await db.item.create({
        data: { tripId: TRIP_ID, title: "Cooking class", category: "ACTIVITY", sortOrder: 50, bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-15" },
      });
      const placed = await scheduleItem(idea.id, { date: "2027-06-03" });
      expect(placed.success).toBe(true);
      const copyId = (placed as { placedItemId: string }).placedItemId;
      expect(await db.item.findUnique({ where: { id: copyId }, select: BOOKING })).toEqual({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-15" });
    });
  });
});
```

Also, in `server/actions/items.test.ts`, add one unit case beside the existing `updateItem` cases, reusing that file's mocks. A patch `{ bookingState: "BOOKED", bookBy: "2027-05-01" }` returns `{ success: false, errors: { bookBy: ["A book-by date is only for something still to book."] } }` and never calls `db.item.update`. Use the file's existing `before` row fixture, extended with `bookingState: "NONE", bookingStateSet: false, bookBy: null`.

- [ ] **Step 2: Run it, expect FAIL**
- `npx vitest run server/actions/items.test.ts`: the new case fails, because `itemSchema` strips `bookingState`/`bookBy` and the update succeeds.
- If the local DB is up: `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/booking-state.test.ts`. The Booked cases fail with `bookingState: "NONE"` (or S's column default), and the TO_BOOK case gets `bookingStateSet: false`.

- [ ] **Step 3: Implement**

3a. In `lib/validations/item.ts`, import `bookingStateSchema` from `@/lib/validations/booking-state`. After `booking` (:57), add:
```ts
    /** CONTEXT.md "Booking state". Omitted = derived from `booking` (create) or kept (update) — lib/booking-state-patch.ts. */
    bookingState: bookingStateSchema.optional(),
    /** The day it should be booked by; only while To book (lib/booking-state-patch.ts refuses it otherwise). */
    bookBy: isoDate.optional(),
```

3b. `server/actions/items.ts`:
- Import `{ resolveBookingWrite, defaultBookingFields, copiedBookingFields }` from `@/lib/booking-state-patch`.
- `createItem`, directly after `const data = parsed.data;` (:128):
  ```ts
  // CONTEXT.md "Booking state": stored as the effective state (a reference implies Booked).
  const booking = resolveBookingWrite("ITEM", null, { bookingState: data.bookingState, bookBy: data.bookBy }, data.booking);
  if ("success" in booking) return booking;
  ```
  Add `...booking,` to `db.item.create({ data: { … } })` after `hiddenFromShares` (:200).
- `addMarkerToWishlist`: add `...defaultBookingFields("ITEM"),` to the create data after `sortOrder` (:312).
- `updateItem`, directly after `const data = parsed.data;` (:367). `applyPatch`'s current values (:354-358) stay without booking fields, so a patch's `bookingState`/`bookBy` reach the schema (validated) and here:
  ```ts
  const booking = resolveBookingWrite(
    "ITEM",
    { bookingState: before.bookingState, bookingStateSet: before.bookingStateSet, bookBy: before.bookBy },
    { bookingState: patch.bookingState, bookBy: patch.bookBy },
    data.booking,
  );
  if ("success" in booking) return booking;
  ```
  Add `...booking,` to the `auditedUpdate("ITEM", …)` data after `hiddenFromShares` (:411).
- `ideaCopyData` (:599-626):
  - Widen the parameter type with `bookingState: BookingState; bookingStateSet: boolean; bookBy: string | null`. Import the type `BookingState` from `@/lib/booking-state`.
  - Add `...copiedBookingFields(fullItem),` to the returned object after `hiddenFromShares`. Both callers pass the full `db.item.findUnique` row, so no call site changes.

- [ ] **Step 4: Run it, expect PASS**
- `npx vitest run server/actions/items.test.ts lib/validations/item.test.ts`
- `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/booking-state.test.ts` (DB up)

- [ ] **Step 5: Task-done check**
- `npx vitest related --run lib/validations/item.ts server/actions/items.ts`
- `npx tsc --noEmit`
- `npx eslint lib/validations/item.ts server/actions/items.ts server/actions/items.test.ts test/integration/booking-state.test.ts`
- `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/booking-state.test.ts`

- [ ] **Step 6: Commit** — the five files. Message: `feat(items): Booking state on create, update and placed copies`

---

### Task A.4: Transport writes booking state (the tentative leg)

**Files:**
- Modify:
  - `lib/validations/transport.ts:34-99`: two fields after `reference` (:61).
  - `server/actions/transport.ts`:
    - `createTransport`: resolve after :94, and the create data at :157-179.
    - `updateTransport`: the parse at :246 and the `auditedUpdate` data at :309-326.
- Test: `test/integration/booking-state.test.ts` (extend), `server/actions/transport.test.ts` (extend: the refusal case)

**Interfaces:**
- Consumes: `resolveBookingWrite` (A.1)
- Produces: `TransportInput` gains `bookingState?`, `bookBy?`. `TransportPatch` (lib/transport-patch.ts:24, `Patch<TransportInput>`) therefore carries them nullable. `mergeTransportPatch` is unchanged: the booking fields are handled beside it, not in it.

- [ ] **Step 1: Write the failing test** — append inside the top-level `describe` of `test/integration/booking-state.test.ts`, and import `createTransport, updateTransport` from `@/server/actions/transport`:

```ts
  describe("Transport", () => {
    const leg = { mode: "TRAIN" as const, depPlace: "Strasbourg", arrPlace: "Frankfurt", depAt: "2027-06-04T09:00", arrAt: "2027-06-04T11:00" };

    it("a leg with no reference is To book; one with a reference is Booked", async () => {
      const tentative = (await createTransport(TRIP_ID, leg)) as { id: string };
      const booked = (await createTransport(TRIP_ID, { ...leg, reference: "ICE 512" })) as { id: string };
      expect(await db.transport.findUnique({ where: { id: tentative.id }, select: BOOKING })).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });
      expect(await db.transport.findUnique({ where: { id: booked.id }, select: BOOKING })).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
    });

    it("an un-chosen To book leg with a book-by date becomes Booked when its reference arrives, and drops the date", async () => {
      const r = (await createTransport(TRIP_ID, { ...leg, bookBy: "2027-05-01" })) as { id: string };
      expect(await db.transport.findUnique({ where: { id: r.id }, select: BOOKING })).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: "2027-05-01" });
      expect(await updateTransport(r.id, { reference: "ICE 9" })).toEqual({ success: true });
      expect(await db.transport.findUnique({ where: { id: r.id }, select: BOOKING })).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
    });

    it("a leg the Traveller set to To book stays To book with a reference; choosing Booked clears its date", async () => {
      const r = (await createTransport(TRIP_ID, { ...leg, bookingState: "TO_BOOK", bookBy: "2027-05-02" })) as { id: string };
      await updateTransport(r.id, { reference: "ICE 10" });
      expect(await db.transport.findUnique({ where: { id: r.id }, select: BOOKING })).toEqual({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-02" });
      await updateTransport(r.id, { bookingState: "BOOKED", bookBy: null });
      expect(await db.transport.findUnique({ where: { id: r.id }, select: BOOKING })).toEqual({ bookingState: "BOOKED", bookingStateSet: true, bookBy: null });
    });
  });
```

In `server/actions/transport.test.ts`, add a unit case with the file's existing mocks. `updateTransport(id, { bookingState: "NONE", bookBy: "2027-05-01" })` returns the `bookBy` refusal and does not write. Extend the file's `before` row fixture with the three columns.

- [ ] **Step 2: Run it, expect FAIL**
- `npx vitest run server/actions/transport.test.ts`: the new case succeeds when it should refuse.
- With the DB up, the integration run fails: the fields are stripped, so each row keeps S's default.

- [ ] **Step 3: Implement**

3a. In `lib/validations/transport.ts`, import `bookingStateSchema` and `isoDate`. After `reference` (:61), add:
```ts
  /** CONTEXT.md "Booking state". Omitted = derived from `reference` (create) or kept (update). A To book leg is how a tentative journey lives in the plan. */
  bookingState: bookingStateSchema.optional(),
  /** The day it should be booked by; only while To book. */
  bookBy: isoDate.optional(),
```

3b. `server/actions/transport.ts`:
- Import `resolveBookingWrite`.
- `createTransport`, after `const data = parsed.data;` (:94):
  ```ts
  const booking = resolveBookingWrite("TRANSPORT", null, { bookingState: data.bookingState, bookBy: data.bookBy }, data.reference);
  if ("success" in booking) return booking;
  ```
  Add `...booking,` to the create data after `sortOrder` (:173).
- `updateTransport`:
  - Replace `transportSchema.safeParse({ ...merged, ...inlineCost })` (:246) with:
    ```ts
    // The booking fields aren't endpoint rules (lib/transport-patch.ts): validated here, merged by resolveBookingWrite.
    const parsed = transportSchema.safeParse({
      ...merged,
      ...inlineCost,
      bookingState: patch.bookingState ?? undefined,
      bookBy: patch.bookBy ?? undefined,
    });
    ```
  - After `const data = parsed.data;` (:251):
    ```ts
    const booking = resolveBookingWrite(
      "TRANSPORT",
      { bookingState: before.bookingState, bookingStateSet: before.bookingStateSet, bookBy: before.bookBy },
      { bookingState: patch.bookingState, bookBy: patch.bookBy },
      data.reference,
    );
    if ("success" in booking) return booking;
    ```
  - Add `...booking,` to the `auditedUpdate("TRANSPORT", …)` data after `arrLng` (:325).

- [ ] **Step 4: Run it, expect PASS**
- `npx vitest run server/actions/transport.test.ts lib/validations/transport.test.ts lib/transport-patch.test.ts`
- `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/booking-state.test.ts`

- [ ] **Step 5: Task-done check**
- `npx vitest related --run lib/validations/transport.ts server/actions/transport.ts`
- `npx tsc --noEmit`
- `npx eslint lib/validations/transport.ts server/actions/transport.ts server/actions/transport.test.ts test/integration/booking-state.test.ts`
- The integration file.

- [ ] **Step 6: Commit** — the four files. Message: `feat(transport): Booking state on legs; a To book leg is a tentative one`

---

### Task A.5: Accommodation writes booking state

**Files:**
- Modify:
  - `lib/validations/accommodation.ts:15-70`: two fields after `confirmation` (:26).
  - `server/actions/accommodation.ts`:
    - `createAccommodation`: resolve after :62, and the create data at :96-112.
    - `updateAccommodation`: resolve after :189, and the `auditedUpdate` data at :213-225.
- Test: `test/integration/booking-state.test.ts` (extend), `server/actions/accommodation.test.ts` (extend: the refusal case)

**Interfaces:**
- Consumes: `resolveBookingWrite` (A.1)
- Produces: `AccommodationInput` gains `bookingState?`, `bookBy?`.

- [ ] **Step 1: Write the failing test** — append to `test/integration/booking-state.test.ts`, and import `createAccommodation, updateAccommodation`:

```ts
  describe("Accommodation", () => {
    it("is To book without a confirmation, Booked with one, and a notes-only edit keeps the state", async () => {
      const stop = await db.stop.create({ data: { tripId: TRIP_ID, name: "Porto", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-04", nights: 3, sortOrder: 0 } });
      const open = (await createAccommodation({ stopId: stop.id, name: "Casa", checkIn: "2027-06-01", checkOut: "2027-06-04", bookBy: "2027-04-30" })) as { id: string };
      const done = (await createAccommodation({ stopId: stop.id, name: "Hotel", checkIn: "2027-06-01", checkOut: "2027-06-04", confirmation: "HX-1" })) as { id: string };
      expect(await db.accommodation.findUnique({ where: { id: open.id }, select: BOOKING })).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: "2027-04-30" });
      expect(await db.accommodation.findUnique({ where: { id: done.id }, select: BOOKING })).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
      expect(await updateAccommodation(open.id, { notes: "Late check-in" })).toEqual({ success: true });
      expect(await db.accommodation.findUnique({ where: { id: open.id }, select: BOOKING })).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: "2027-04-30" });
    });

    it("a stay with friends can be No booking needed, and stays so", async () => {
      const stop = await db.stop.create({ data: { tripId: TRIP_ID, name: "Aghalee", timezone: "Europe/London", arriveDate: "2027-06-05", departDate: "2027-06-07", nights: 2, sortOrder: 1 } });
      const r = (await createAccommodation({ stopId: stop.id, name: "Aunt's house", checkIn: "2027-06-05", checkOut: "2027-06-07", bookingState: "NONE" })) as { id: string };
      expect(await db.accommodation.findUnique({ where: { id: r.id }, select: BOOKING })).toEqual({ bookingState: "NONE", bookingStateSet: true, bookBy: null });
    });
  });
```

In `server/actions/accommodation.test.ts`, add a unit case with the file's mocks. `updateAccommodation(id, { bookingState: "BOOKED", bookBy: "2027-05-01" })` returns the `bookBy` refusal.

- [ ] **Step 2: Run it, expect FAIL** — the same two commands as A.4. They fail the same way: the fields are stripped.

- [ ] **Step 3: Implement**

3a. In `lib/validations/accommodation.ts`, import `bookingStateSchema`. After `confirmation` (:26), add:
```ts
    /** CONTEXT.md "Booking state". Omitted = derived from `confirmation` (create) or kept (update). */
    bookingState: bookingStateSchema.optional(),
    /** The day it should be booked by; only while To book. */
    bookBy: isoDate.optional(),
```

3b. `server/actions/accommodation.ts`:
- Import `resolveBookingWrite`.
- `createAccommodation`, after `const data = parsed.data;` (:62), add the resolver (kind `"ACCOMMODATION"`, reference `data.confirmation`). Add `...booking,` to the create data after `lng` (:110).
- `updateAccommodation`, after `const data = parsed.data;` (:189), add the resolver. Pass `before`'s three columns, `{ bookingState: patch.bookingState, bookBy: patch.bookBy }` and `data.confirmation`. Add `...booking,` to the `auditedUpdate` data after `lng` (:224).

  `applyPatch`'s current values (:177-180) stay without booking fields, as in A.3.

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run server/actions/accommodation.test.ts lib/validations/accommodation.test.ts`, then the integration file.

- [ ] **Step 5: Task-done check**
- `npx vitest related --run lib/validations/accommodation.ts server/actions/accommodation.ts`
- `npx tsc --noEmit`
- `npx eslint lib/validations/accommodation.ts server/actions/accommodation.ts server/actions/accommodation.test.ts test/integration/booking-state.test.ts`
- The integration file.

- [ ] **Step 6: Commit** — the four files. Message: `feat(accommodation): Booking state on stays`

---

### Task A.6: Forks carry booking state; Duplicate trip starts fresh

**Files:**
- Modify:
  - `lib/fork-plan.ts`:
    - `ForkSourceTransport` (:62-79), `ForkSourceAccommodation` (:81-94) and `ForkSourceItem` (:96-124);
    - the `ForkPlan` `data` types (:192-252);
    - `buildForkPlan` (:262-316).
  - `lib/duplicate-trip.ts`: the `DuplicatePlan` item/transport `data` types (:113-131), and the builder's items (:179-200) and transports (:201-215).
- Test: `lib/fork-plan.test.ts`, `lib/duplicate-trip.test.ts` (extend)

**Interfaces:**
- Consumes: `defaultBookingFields`, `BookingFields` (A.1)
- Produces: a Fork's Transport/Accommodation/Item rows keep the source's `bookingState`/`bookingStateSet`/`bookBy`. `createFork` reads full rows (server/actions/forks.ts:95-103, no `select`), so it needs no change.

- [ ] **Step 1: Write the failing tests**

`lib/fork-plan.test.ts`:
```ts
it("carries Booking state into the variant; a source without it copies the kind's default", () => {
  const plan = buildForkPlan({
    ...source,
    transports: [{ ...source.transports[0], bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2026-06-01" }],
    accommodations: [{ ...source.accommodations[0], bookingState: "BOOKED", bookingStateSet: false, bookBy: null }],
    items: [{ ...source.items[0], bookingState: "NONE", bookingStateSet: true, bookBy: null }],
  });
  expect(plan.transports[0].data).toMatchObject({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2026-06-01" });
  expect(plan.accommodations[0].data).toMatchObject({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
  expect(plan.items[0].data).toMatchObject({ bookingState: "NONE", bookingStateSet: true, bookBy: null });
  expect(buildForkPlan(source).transports[0].data).toMatchObject({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });
});
```

`lib/duplicate-trip.test.ts`. Use the file's existing source fixture, with the source transport set to `bookingState: "BOOKED"`:
```ts
  it("starts Booking state fresh: legs (references stripped) To book, ideas no booking needed", () => {
    // `src` = the file's existing builder input, with BOOKED source rows
    const plan = buildDuplicatePlan(srcWithBookedRows);
    expect(plan.transports[0].data).toMatchObject({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });
    expect(plan.items[0].data).toMatchObject({ bookingState: "NONE", bookingStateSet: false, bookBy: null });
  });
```
Use the file's real exported builder name and fixture. The existing transport case at `lib/duplicate-trip.test.ts:112` shows both.

- [ ] **Step 2: Run them, expect FAIL** — `npx vitest run lib/fork-plan.test.ts lib/duplicate-trip.test.ts`. `data` has no `bookingState`.

- [ ] **Step 3: Implement**

`lib/fork-plan.ts`:
- Add `bookingState?: BookingState; bookingStateSet?: boolean; bookBy?: string | null;` to each of the three source interfaces.
- Add `bookingState: BookingState; bookingStateSet: boolean; bookBy: string | null;` to each of the three `data` types.
- Add a local helper:
  ```ts
  /** Booking state carries into the variant as it stands (CONTEXT.md Booking state); a source read without it gets the kind's default. */
  function bookingOf(row: { bookingState?: BookingState; bookingStateSet?: boolean; bookBy?: string | null }, kind: BookingKind): BookingFields {
    const fallback = defaultBookingFields(kind);
    return { bookingState: row.bookingState ?? fallback.bookingState, bookingStateSet: row.bookingStateSet ?? false, bookBy: row.bookBy ?? null };
  }
  ```
- Spread `...bookingOf(t, "TRANSPORT")`, `...bookingOf(a, "ACCOMMODATION")` and `...bookingOf(it, "ITEM")` into the three `data` objects (:289-312).

`lib/duplicate-trip.ts`:
- Add the three fields to the item and transport `data` types: `bookingState: BookingState; bookingStateSet: false; bookBy: null`.
- Spread `...defaultBookingFields("ITEM")` into items' data (after `booking: null`, :187) and `...defaultBookingFields("TRANSPORT")` into transports' data (after `reference: null`, :211).
- Widen the literal types as `defaultBookingFields`'s return type requires: `bookingStateSet: boolean; bookBy: string | null`.

- [ ] **Step 4: Run them, expect PASS** — `npx vitest run lib/fork-plan.test.ts lib/duplicate-trip.test.ts server/actions/forks.test.ts`

- [ ] **Step 5: Task-done check**
- `npx vitest related --run lib/fork-plan.ts lib/duplicate-trip.ts`
- `npx tsc --noEmit`
- `npx eslint lib/fork-plan.ts lib/duplicate-trip.ts lib/fork-plan.test.ts lib/duplicate-trip.test.ts`

- [ ] **Step 6: Commit** — the four files. Message: `feat(forks): carry Booking state into a variant; duplicates start fresh`

---

### Task A.7: The Plan's reads carry booking state to the cards and dialogs

**Files:**
- Modify:
  - `lib/plan-reads.ts`: `PLAN_TRANSPORT_SELECT` (:52-71), `PLAN_ACCOMMODATION_SELECT` (:73-88), `PLAN_ITEM_SELECT` (:90-110).
  - `lib/surprise-visibility.ts`: `PlaceholderItem` (:17-39) and the placeholder builder (:161-185).
  - `lib/plan-entity-views.ts`: `ItemCardItem` (:11-32), `TransportCardTransport` (:34-59), `AccommodationCardAccommodation` (:61-74).
  - `components/plan/types.ts`: `ThingToDo` (:35-53) and `toItemCardItem` (:57-74).
  - `lib/stop-days.ts`: `StopDayItem` (:22-41).
  - `components/trip/itinerary-manager.tsx`: `ItineraryTransport` (:128-147).
  - `app/(app)/trips/[tripId]/wishlist/page.tsx`: the item `select` (:77-100) and the `ItemCardItem` map (:297-313).
- Test: `test/integration/plan-reads.test.ts` (extend), `lib/surprise-visibility.test.ts` (extend case 5), `components/plan/types.test.ts` (if it exists; otherwise the case goes in `components/trip/itinerary-manager.test.tsx`'s `toItemCardItem` coverage)

**Interfaces:**
- Consumes: the S columns
- Produces:
  - The three-field optional block `bookingState?: BookingState | null; bookingStateSet?: boolean | null; bookBy?: string | null` on each view type listed in Notes (the components side).
  - `readPlan` rows carry all three.
  - `PlaceholderItem` carries `bookingState: "NONE"`, `bookingStateSet: false`, `bookBy: null`, so a Surprise's slot never says it's To book.

- [ ] **Step 1: Write the failing tests**

In `test/integration/plan-reads.test.ts`, add a case. Seed a TO_BOOK Transport, Accommodation and Item on the real plan with the three columns set. Then:
```ts
  it("carries Booking state on Transport, Accommodation and Items (spec R2)", async () => {
    const plan = await readPlan(TRIP_ID, null, OWNER);
    expect(plan.rows.transports.find((t) => t.id === LEG_ID)).toMatchObject({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: "2027-05-01" });
    expect(plan.rows.accommodations.find((a) => a.id === STAY_ID)).toMatchObject({ bookingState: "TO_BOOK", bookBy: null });
    expect(plan.rows.items.find((i) => i.id === TOUR_ID)).toMatchObject({ bookingState: "BOOKED" });
  });
```
Use the file's real fixture ids and `readPlan` call shape (see `test/integration/plan-reads.test.ts:56-75`). Add the three rows to its seed.

In `lib/surprise-visibility.test.ts`, case 5 (:177-208), add: `expect(p).toMatchObject({ bookingState: "NONE", bookingStateSet: false, bookBy: null });`.

In whichever test covers `toItemCardItem`, add: `toItemCardItem({ id: "i", title: "T", category: "FOOD", bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-01" })` → `toMatchObject({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-01" })`.

- [ ] **Step 2: Run them, expect FAIL**
- `npx vitest run lib/surprise-visibility.test.ts components/plan`: the placeholder has no `bookingState`, and `toItemCardItem` drops the fields.
- The integration case (DB up) gets `undefined` for each field.

- [ ] **Step 3: Implement** (mechanical)
- `lib/plan-reads.ts`: add `bookingState: true, bookingStateSet: true, bookBy: true,` to each of the three selects. Put it after `reference`, `confirmation` and `booking` respectively.
- `lib/surprise-visibility.ts`:
  - In `PlaceholderItem`, after `booking: null;`, add:
    ```ts
    /** A Surprise's slot never says what it is, so it is never To book. */
    bookingState: "NONE";
    bookingStateSet: false;
    bookBy: null;
    ```
  - In the builder after `booking: null,` (:178), add `bookingState: "NONE" as const, bookingStateSet: false as const, bookBy: null,`.
- `lib/plan-entity-views.ts`: add this to the three interfaces, and import the type `BookingState` from `@/lib/booking-state`:
  ```ts
  /** CONTEXT.md "Booking state" — as stored (the effective state); absent on rows that don't read it (the Share page). */
  bookingState?: BookingState | null;
  /** True when the Traveller chose the state (the dialog then keeps it when the reference changes). */
  bookingStateSet?: boolean | null;
  /** YYYY-MM-DD the thing should be booked by; only while To book. */
  bookBy?: string | null;
  ```
- `components/plan/types.ts`:
  - Add the same three to `ThingToDo`.
  - In `toItemCardItem`, add `bookingState: it.bookingState ?? null, bookingStateSet: it.bookingStateSet ?? null, bookBy: it.bookBy ?? null,`.
- `lib/stop-days.ts` `StopDayItem` and `components/trip/itinerary-manager.tsx` `ItineraryTransport`: add the same three optional fields. The plan page spreads `readPlan` rows into these, so values flow.
  - `enrichTransport` (:417-430) spreads `...t`, so it needs no change.
  - The day rows in `groupScheduledItemsByStop` keep the item objects, so they need no change either.
- `app/(app)/trips/[tripId]/wishlist/page.tsx`: add `bookingState: true, bookingStateSet: true, bookBy: true` to the item `select`, and `bookingState: item.bookingState, bookingStateSet: item.bookingStateSet, bookBy: item.bookBy,` to the map.
- Fixture fallout: `tsc` may flag a test fixture typed as a `readPlan` row or as `PlaceholderItem`. Add the three fields to that fixture. This is a mock rewrite; the assertions stay as they are.

- [ ] **Step 4: Run them, expect PASS** — the unit command from Step 2, then `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/plan-reads.test.ts`

- [ ] **Step 5: Task-done check**
- `npx vitest related --run lib/plan-reads.ts lib/surprise-visibility.ts lib/plan-entity-views.ts components/plan/types.ts lib/stop-days.ts components/trip/itinerary-manager.tsx "app/(app)/trips/[tripId]/wishlist/page.tsx"`
- `npx tsc --noEmit`
- `npx eslint <the same files and the tests touched>`
- `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/plan-reads.test.ts`

- [ ] **Step 6: Commit** — every file touched. Message: `feat(plan): read Booking state into the Plan's cards and dialogs`

---

### Task A.8: The Day reads carry booking state (Day view, Today, get_day, Calendar)

**Files:**
- Modify:
  - `lib/day-reads.ts`: the item select (:71-74), the transport select (:79-83), the accommodation select (:89-92) and the placeholder map (:128-134).
  - `lib/day-view-model.ts`: `DayItemRow` (:163-168), `DayTransportRow` (:169-173), `DayAccommodationRow` (:174-178), and `deriveTrip`'s item, transport and accommodation maps (:265-281).
  - `lib/itinerary.ts`: `ItineraryItem` (:29-47), `ItineraryTransport` (:49-63), `ItineraryAccommodation` (:65-76).
  - `app/(app)/trips/[tripId]/calendar/page.tsx`: the `buildItinerary` items, transports and accommodations maps (:115-160).
- Test: `lib/day-view-model.test.ts` (extend; its `item()` helper :126-130 and `HOTEL` :132-135 gain the three fields), `test/integration/day-reads.test.ts` (extend)

**Interfaces:**
- Consumes: A.7's `PlaceholderItem` fields
- Produces:
  - `DayRows` items, transports and accommodations carry `bookingState: BookingState; bookingStateSet: boolean; bookBy: string | null` (required).
  - Itinerary entries (`ItemEntry.item`, `TransportDepartureEntry.transport`, `AccommodationCheckinEntry.accommodation`) carry `bookingState?`/`bookBy?`.
  - `DayEntryEditor` maps (lib/day-view-loader.ts:228-250, which spreads rows) therefore carry them to the dialogs without change.

- [ ] **Step 1: Write the failing tests**

In `lib/day-view-model.test.ts`, inside `describe("buildDayModel (card 3.M)")`:
```ts
  it("carries Booking state onto the day's entries (spec R2)", () => {
    const r = rows({
      items: [item({ id: "i-tour", date: "2026-12-11", bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2026-11-20" })],
      accommodations: [{ ...HOTEL, bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null }],
    });
    const m = buildDayModel(r, "2026-12-11");
    const entry = m.dayPlan!.itemEntries.find((e) => e.item.id === "i-tour")!;
    expect(entry.item).toMatchObject({ bookingState: "TO_BOOK", bookBy: "2026-11-20" });
    const checkin = buildDayModel(r, "2026-12-10").dayPlan!.accommodationEntries.find((e) => e.kind === "accommodation-checkin")!;
    expect(checkin.accommodation).toMatchObject({ bookingState: "TO_BOOK" });
  });
```
Use the real `DayPlan` entry field names from lib/itinerary.ts:141-170. The names above are illustrative. Before writing, read the `DayPlan` interface and use its actual arrays.
- Add `bookingState: "NONE", bookingStateSet: false, bookBy: null` to the `item()` helper defaults.
- Add `bookingState: "BOOKED", bookingStateSet: false, bookBy: null` to `HOTEL`.

In `test/integration/day-reads.test.ts`, add: a TO_BOOK leg's row from `readDayRows` carries the three fields. The surprised member's placeholder row carries `bookingState: "NONE"`.

- [ ] **Step 2: Run them, expect FAIL** — `npx vitest run lib/day-view-model.test.ts`. The entry has no `bookingState`, because `deriveTrip` picks fields.

- [ ] **Step 3: Implement** (mechanical)
- `lib/day-reads.ts`:
  - Add `bookingState: true, bookingStateSet: true, bookBy: true,` to the three selects.
  - In the placeholder map (:130-133), add `bookingState: p.bookingState, bookingStateSet: p.bookingStateSet, bookBy: p.bookBy,`.
- `lib/day-view-model.ts`: add `bookingState: BookingState; bookingStateSet: boolean; bookBy: string | null;` to the three row interfaces. In `deriveTrip`'s three maps (:265-281), add `bookingState: i.bookingState, bookBy: i.bookBy,` (and the same for `t.` and `a.`).
- `lib/itinerary.ts`: add `bookingState?: BookingState | null; bookBy?: string | null;` to the three interfaces, with a one-line CONTEXT.md comment. `buildItinerary` passes the objects through (:415-419, :385-391), so it needs no change.
- `app/(app)/trips/[tripId]/calendar/page.tsx`: add `bookingState: item.bookingState, bookBy: item.bookBy` to its item map. Add the same from `t.` and `a.` to its transport and accommodation maps. The rows come from `readPlan`, so A.7 already selects them.
- Fixture fallout: tsc flags `DayRows` fixtures in `lib/day-reads.test.ts`, `lib/day-view-loader.test.ts`, `lib/mcp/reads/day.test.ts` and `lib/travelling-home-loader` tests. Add the three fields to each fixture helper. This is a mock rewrite; the assertions stay as they are.

- [ ] **Step 4: Run them, expect PASS** — `npx vitest run lib/day-view-model.test.ts lib/day-reads.test.ts lib/day-view-loader.test.ts lib/mcp/reads/day.test.ts`, then `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/day-reads.test.ts`

- [ ] **Step 5: Task-done check**
- `npx vitest related --run lib/day-reads.ts lib/day-view-model.ts lib/itinerary.ts "app/(app)/trips/[tripId]/calendar/page.tsx"`
- `npx tsc --noEmit`
- `npx eslint <changed files>`
- `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/day-reads.test.ts test/integration/day-view-loader.test.ts test/integration/travelling-home-loader.test.ts`

- [ ] **Step 6: Commit** — every file touched. Message: `feat(days): read Booking state into the Day view, Today and the Calendar`

---

### Task A.9: Booking import lands Booked

**Files:**
- Modify:
  - `lib/booking-import/types.ts`: `ProposedTransportInput` (:52-66), `ProposedAccommodationInput` (:68-78), `ProposedItemInput` (:80-90).
  - `lib/booking-import/build.ts`: the transport input (:367), the stay input (:447-457) and the item input (:481-491).
- Test: `lib/booking-import/build.test.ts`. Extend it, and update the two full-input `toEqual` sites: p1's `input` at :56-69 and p3's `input` at :108-121. Also any other `toEqual` that compares a whole `buildProposals` input; find them with `grep -n "input).toEqual\|input: {" lib/booking-import/*.test.ts`.

**Interfaces:**
- Consumes: `BookingState` (S, type only — types.ts stays zod-free and server-free)
- Produces: `Proposed*Input.bookingState?: BookingState; bookBy?: string`. Every Proposal `buildProposals` makes carries `bookingState: "BOOKED"`. `confirmProposal` (lib/booking-import/confirm.ts:153-160) spreads the input into the create actions, so it needs no change.

- [ ] **Step 1: Write the failing test** — in `lib/booking-import/build.test.ts`, in `describe("buildProposals: things to do, car hire, gaps")`:

```ts
  it("every Proposal lands Booked as a choice, even a ticket that prints no reference (spec R2)", () => {
    const { proposals } = buildProposals(report(item({ booking: null })), CTX);
    expect(proposals[0].input).toMatchObject({ bookingState: "BOOKED" });
    expect(proposals[0].input).not.toHaveProperty("booking");
    for (const p of buildProposals(SAMPLE_EXTRACTION, CTX).proposals) {
      expect(p.input).toMatchObject({ bookingState: "BOOKED" });
    }
  });
```
Add `bookingState: "BOOKED",` to p1's expected `input` (:56-69) and to p3's (:108-121).

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/booking-import/build.test.ts`. There's no `bookingState` on the inputs.

- [ ] **Step 3: Implement**
- `lib/booking-import/types.ts`: import the type `BookingState` from `@/lib/booking-state`. Add this to the three interfaces:
  ```ts
  /** CONTEXT.md "Booking state": an imported booking is Booked (set as a choice, so it stays Booked with no reference printed). */
  bookingState?: BookingState;
  bookBy?: string;
  ```
- `lib/booking-import/build.ts`:
  - :367 becomes `const input: ProposedTransportInput = { mode, bookingState: "BOOKED" };`.
  - Add `bookingState: "BOOKED",` to the `compact<ProposedAccommodationInput>({…})` and `compact<ProposedItemInput>({…})` objects (:447 and :481), after `confirmation` and `booking` respectively.

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/booking-import`

- [ ] **Step 5: Task-done check**
- `npx vitest related --run lib/booking-import/types.ts lib/booking-import/build.ts`
- `npx tsc --noEmit`
- `npx eslint lib/booking-import/types.ts lib/booking-import/build.ts lib/booking-import/build.test.ts`
- `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/booking-import-confirm.test.ts` (DB up; this checks that a confirmed Proposal's row is Booked. If that file asserts whole rows, add `bookingState: "BOOKED"` to them.)

- [ ] **Step 6: Commit** — the touched files. Message: `feat(booking-import): imported bookings land Booked`

---

### Task A.10: The Booking state control (`BookingStateField`)

**Files:**
- Create: `components/trip/booking-state-field.tsx`
- Test: `components/trip/booking-state-field.test.tsx` (create)

**Interfaces:**
- Consumes: `BOOKING_STATES`, `effectiveBookingState`, `BookingKind`, `BookingState` (S); `BOOKING_STATE_LABELS` (A.2); `Segmented`/`SegmentedItem` (components/ui/segmented.tsx); `Field` (components/ui/field.tsx); `DateField` (components/ui/date-field.tsx)
- Produces:
  ```ts
  export interface BookingStateSeed { bookingState?: BookingState | null; bookingStateSet?: boolean | null; bookBy?: string | null }
  export function seedFromProposal(p: { bookingState?: BookingState; bookBy?: string } | undefined): BookingStateSeed | undefined;
  export function useBookingStateField(kind: BookingKind, seed: BookingStateSeed | null | undefined, reference: string): {
    shown: BookingState; bookBy: string; choose(s: BookingState): void; setBookBy(v: string): void;
    dirtyValues: { chosen: BookingState | null; bookBy: string };
    payload(): { bookingState?: BookingState; bookBy?: string };
  };
  export function BookingStateField(props: { field: ReturnType<typeof useBookingStateField>; errors: Record<string, string[] | undefined>; disabled?: boolean; className?: string }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test** — `components/trip/booking-state-field.test.tsx`

```tsx
import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BookingKind } from "@/lib/booking-state";
import { BookingStateField, seedFromProposal, useBookingStateField, type BookingStateSeed } from "./booking-state-field";

function Harness({ kind, seed, onPayload }: { kind: BookingKind; seed?: BookingStateSeed; onPayload(p: object): void }) {
  const [reference, setReference] = React.useState("");
  const field = useBookingStateField(kind, seed, reference);
  return (
    <>
      <input aria-label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
      <BookingStateField field={field} errors={{}} />
      <button type="button" onClick={() => onPayload(field.payload())}>Save</button>
    </>
  );
}

const on = (name: string) => screen.getByRole("radio", { name });

describe("BookingStateField (CONTEXT.md Booking state)", () => {
  it("a new leg shows To book with a Book by date; typing a reference previews Booked and hides the date", async () => {
    const user = userEvent.setup();
    let sent: object = {};
    render(<Harness kind="TRANSPORT" onPayload={(p) => (sent = p)} />);
    expect(on("To book")).toHaveAttribute("data-state", "on");
    expect(screen.getByLabelText("Book by")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Reference"), "ICE 512");
    expect(on("Booked")).toHaveAttribute("data-state", "on");
    expect(screen.queryByLabelText("Book by")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(sent).toEqual({}); // nothing chosen: the server derives Booked from the reference
  });

  it("a thing to do needs no booking until the Traveller says so; choosing To book sends it with the date", async () => {
    const user = userEvent.setup();
    let sent: object = {};
    render(<Harness kind="ITEM" onPayload={(p) => (sent = p)} />);
    expect(on("No booking needed")).toHaveAttribute("data-state", "on");
    await user.click(on("To book"));
    await user.type(screen.getByLabelText("Book by"), "2027-05-20");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(sent).toEqual({ bookingState: "TO_BOOK", bookBy: "2027-05-20" });
  });

  it("a saved choice is kept and re-sent; a Proposal seeds Booked as a choice", async () => {
    const user = userEvent.setup();
    let sent: object = {};
    render(<Harness kind="ACCOMMODATION" seed={{ bookingState: "NONE", bookingStateSet: true, bookBy: null }} onPayload={(p) => (sent = p)} />);
    await user.type(screen.getByLabelText("Reference"), "HX-1");
    expect(on("No booking needed")).toHaveAttribute("data-state", "on");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(sent).toEqual({ bookingState: "NONE" });
    expect(seedFromProposal({ bookingState: "BOOKED" })).toEqual({ bookingState: "BOOKED", bookingStateSet: true, bookBy: null });
    expect(seedFromProposal(undefined)).toBeUndefined();
  });

  it("says booking is not paying", () => {
    render(<Harness kind="ITEM" onPayload={() => {}} />);
    expect(screen.getByText(/booked doesn't mean paid/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run components/trip/booking-state-field.test.tsx`. It fails with `Failed to resolve import "./booking-state-field"`.

- [ ] **Step 3: Implement** — `components/trip/booking-state-field.tsx`

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Field } from "@/components/ui/field";
import { DateField } from "@/components/ui/date-field";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { BOOKING_STATES, effectiveBookingState, type BookingKind, type BookingState } from "@/lib/booking-state";
import { BOOKING_STATE_LABELS } from "@/lib/booking-state-copy";

/** A saved row's Booking state (the view types carry all three), or a Proposal's via `seedFromProposal`. */
export interface BookingStateSeed {
  bookingState?: BookingState | null;
  bookingStateSet?: boolean | null;
  bookBy?: string | null;
}

/** A Booking import Proposal's state is always a choice (it lands Booked, lib/booking-import/build.ts). */
export function seedFromProposal(p: { bookingState?: BookingState; bookBy?: string } | undefined): BookingStateSeed | undefined {
  return p?.bookingState ? { bookingState: p.bookingState, bookingStateSet: true, bookBy: p.bookBy ?? null } : undefined;
}

/**
 * The three edit dialogs' Booking state (CONTEXT.md "Booking state",
 * spec 2026-10-17 R2). Until the Traveller picks one, the control shows what
 * the reference implies, live, and the payload sends no state, so the server
 * derives it the same way (lib/booking-state-patch.ts). A book-by date is sent
 * only while To book.
 */
export function useBookingStateField(kind: BookingKind, seed: BookingStateSeed | null | undefined, reference: string) {
  const [chosen, setChosen] = React.useState<BookingState | null>(seed?.bookingStateSet ? (seed.bookingState ?? null) : null);
  const [bookBy, setBookBy] = React.useState(seed?.bookBy ?? "");
  const shown = effectiveBookingState({ state: chosen, set: chosen !== null, reference: reference.trim() || null }, kind);
  return {
    shown,
    bookBy,
    choose: setChosen,
    setBookBy,
    dirtyValues: { chosen, bookBy },
    payload(): { bookingState?: BookingState; bookBy?: string } {
      return {
        ...(chosen ? { bookingState: chosen } : {}),
        ...(shown === "TO_BOOK" && bookBy ? { bookBy } : {}),
      };
    },
  };
}

export type BookingStateFieldState = ReturnType<typeof useBookingStateField>;

export function BookingStateField({
  field,
  errors,
  disabled,
  className,
}: {
  field: BookingStateFieldState;
  errors: Record<string, string[] | undefined>;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Field label="Booking" description="Booked doesn't mean paid. Mark the cost paid on its own." error={errors.bookingState?.[0]}>
        <Segmented
          type="single"
          tone="sun"
          value={field.shown}
          onValueChange={(v) => {
            if (v) field.choose(v as BookingState);
          }}
          aria-label="Booking"
          disabled={disabled}
          className="flex-wrap"
        >
          {BOOKING_STATES.map((s) => (
            <SegmentedItem key={s} value={s}>
              {BOOKING_STATE_LABELS[s]}
            </SegmentedItem>
          ))}
        </Segmented>
      </Field>
      {field.shown === "TO_BOOK" && (
        <DateField
          label="Book by"
          value={field.bookBy}
          onChange={(e) => field.setBookBy(e.target.value)}
          error={errors.bookBy?.[0]}
          disabled={disabled}
        />
      )}
    </div>
  );
}
```
Radix ToggleGroup `type="single"` renders `role="radio"` items with `data-state`. If the installed version renders `role="button"` with `aria-pressed`, switch the test's `on()` helper to `getByRole("button", { name, pressed: true })` and keep the assertions.

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run components/trip/booking-state-field.test.tsx lib/client-zod.guard.test.ts`

- [ ] **Step 5: Task-done check**
- `npx vitest related --run components/trip/booking-state-field.tsx`
- `npx tsc --noEmit`
- `npx eslint components/trip/booking-state-field.tsx components/trip/booking-state-field.test.tsx`

- [ ] **Step 6: Commit** — the two files. Message: `feat(booking-state): the dialogs' Booking control`

---

### Task A.11: Item dialog gets the Booking control

**Files:**
- Modify: `components/trip/item-form-dialog.tsx`:
  - `ITEM_CLEARABLE` (:319);
  - state, after `booking` (:528);
  - `useFormDirty` (:542);
  - `buildInput` (:548-570);
  - JSX, after the booking/link pair (:772-792).
- Test: `components/trip/item-form-dialog.test.tsx` (extend)

**Interfaces:**
- Consumes: `useBookingStateField`, `BookingStateField`, `seedFromProposal` (A.10); `ItemCardItem` booking fields (A.7); `ProposedItemInput.bookingState` (A.9)
- Produces: `createItem`/`updateItem` receive `bookingState` (once chosen) and `bookBy` (while To book). An edit that leaves Book by empty sends `bookBy: null`.

- [ ] **Step 1: Write the failing test** — append to `components/trip/item-form-dialog.test.tsx`, using its existing render helper and action mocks:

```tsx
  describe("Booking state (spec R2)", () => {
    it("a new thing to do needs no booking; choosing To book with a date sends both", async () => {
      const user = userEvent.setup();
      renderDialog(); // the file's add-mode helper
      expect(screen.getByRole("radio", { name: "No booking needed" })).toHaveAttribute("data-state", "on");
      await user.type(screen.getByLabelText(/^title/i), "Lodge tour");
      await user.click(screen.getByRole("radio", { name: "To book" }));
      await user.type(screen.getByLabelText("Book by"), "2027-05-20");
      await user.click(screen.getByRole("button", { name: /add/i }));
      expect(vi.mocked(createItem).mock.calls[0][1]).toMatchObject({ bookingState: "TO_BOOK", bookBy: "2027-05-20" });
    });

    it("a booking reference on an un-chosen thing previews Booked and sends no state", async () => {
      const user = userEvent.setup();
      renderDialog();
      await user.type(screen.getByLabelText(/^title/i), "Museum");
      await user.type(screen.getByLabelText(/booking reference/i), "BK-1");
      expect(screen.getByRole("radio", { name: "Booked" })).toHaveAttribute("data-state", "on");
      await user.click(screen.getByRole("button", { name: /add/i }));
      expect(vi.mocked(createItem).mock.calls[0][1].bookingState).toBeUndefined();
    });

    it("an edit of a To book thing whose date is cleared sends bookBy null (PATCH)", async () => {
      const user = userEvent.setup();
      renderDialog({ item: { ...existingItem, bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-20" } });
      await user.clear(screen.getByLabelText("Book by"));
      await user.click(screen.getByRole("button", { name: /save changes/i }));
      expect(updateItem).toHaveBeenCalledWith(existingItem.id, expect.objectContaining({ bookingState: "TO_BOOK", bookBy: null }));
    });
  });
```
Match `renderDialog`, `existingItem` and the submit button's name to the file's existing helpers. Read its first 120 lines for them.

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run components/trip/item-form-dialog.test.tsx`. There's no radio named "No booking needed".

- [ ] **Step 3: Implement** — `components/trip/item-form-dialog.tsx`:
- Import `BookingStateField, seedFromProposal, useBookingStateField` from `./booking-state-field`.
- :319 becomes `const ITEM_CLEARABLE = ["stopId", "date", "startTime", "endTime", "address", "link", "booking", "notes", "paidAt", "bookBy"] as const;`. `bookingState` is deliberately absent: an un-chosen state stays derived.
- After :528, add `const bookingField = useBookingStateField("ITEM", item ?? seedFromProposal(proposed), booking);`.
- :542 `useFormDirty({ …, booking, bookingState: bookingField.dirtyValues, notes, … })`.
- `buildInput`: after `booking: booking.trim() || undefined,` (:561), add `...bookingField.payload(),`.
- JSX, directly after the `data-pair="booking"` block closes (:792), add:
  ```tsx
  {/* Booking state (CONTEXT.md): a reference implies Booked until the Traveller picks. */}
  <BookingStateField field={bookingField} errors={errors} disabled={isPending} className="sm:col-span-2" />
  ```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run components/trip/item-form-dialog.test.tsx`

- [ ] **Step 5: Task-done check**
- `npx vitest related --run components/trip/item-form-dialog.tsx`
- `npx tsc --noEmit`
- `npx eslint components/trip/item-form-dialog.tsx components/trip/item-form-dialog.test.tsx`

- [ ] **Step 6: Commit** — the two files. Message: `feat(items): Booking control in the Item dialog`

---

### Task A.12: Transport dialog gets the Booking control

**Files:**
- Modify: `components/trip/transport-form-dialog.tsx`:
  - `TRANSPORT_CLEARABLE` (:283);
  - state, after `reference` (:459);
  - `useFormDirty` (:479);
  - `buildInput` (:482-530);
  - JSX, after the booking-ref/position pair (:811-835).
- Test: `components/trip/transport-form-dialog.test.tsx` (extend)

**Interfaces:**
- Consumes: A.10; `TransportCardTransport` booking fields (A.7); `ProposedTransportInput.bookingState` (A.9)
- Produces: `createTransport`/`updateTransport` receive the booking fields.

- [ ] **Step 1: Write the failing test** — append to `components/trip/transport-form-dialog.test.tsx` with its helpers:

```tsx
  describe("Booking state (spec R2: a tentative leg is To book)", () => {
    it("a new leg is To book with a Book by date; the date goes with the save", async () => {
      const user = userEvent.setup();
      renderDialog();
      expect(screen.getByRole("radio", { name: "To book" })).toHaveAttribute("data-state", "on");
      await user.type(screen.getByLabelText("Book by"), "2027-05-01");
      await submitValidLeg(user); // the file's existing fill-and-save helper, or its inline equivalent
      expect(vi.mocked(createTransport).mock.calls[0][1]).toMatchObject({ bookBy: "2027-05-01" });
      expect(vi.mocked(createTransport).mock.calls[0][1].bookingState).toBeUndefined();
    });

    it("editing a To book leg and typing its reference saves it to become Booked, clearing the date", async () => {
      const user = userEvent.setup();
      renderDialog({ transport: { ...existingTransport, reference: null, bookingState: "TO_BOOK", bookingStateSet: false, bookBy: "2027-05-01" } });
      await user.type(screen.getByPlaceholderText(/BA0123/), "ICE 512");
      expect(screen.getByRole("radio", { name: "Booked" })).toHaveAttribute("data-state", "on");
      await user.click(screen.getByRole("button", { name: /save changes/i }));
      expect(updateTransport).toHaveBeenCalledWith(existingTransport.id, expect.objectContaining({ reference: "ICE 512", bookBy: null }));
      expect(vi.mocked(updateTransport).mock.calls[0][1].bookingState).toBeUndefined();
    });
  });
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run components/trip/transport-form-dialog.test.tsx`

- [ ] **Step 3: Implement**
- Import the field module, as in A.11.
- Add `"bookBy"` to `TRANSPORT_CLEARABLE` (:283).
- After :459, add `const bookingField = useBookingStateField("TRANSPORT", transport ?? seedFromProposal(proposed), reference);`.
- Add `bookingState: bookingField.dirtyValues` to `useFormDirty` (:479).
- In `buildInput`, after `reference: reference.trim() || undefined,` (:523), add `...bookingField.payload(),`.
- JSX, after the `data-pair="booking"` grid closes (:835), add `<BookingStateField field={bookingField} errors={errors} disabled={isPending} />`.

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run components/trip/transport-form-dialog.test.tsx`

- [ ] **Step 5: Task-done check**
- `npx vitest related --run components/trip/transport-form-dialog.tsx`
- `npx tsc --noEmit`
- `npx eslint components/trip/transport-form-dialog.tsx components/trip/transport-form-dialog.test.tsx`

- [ ] **Step 6: Commit** — the two files. Message: `feat(transport): Booking control in the Transport dialog`

---

### Task A.13: Accommodation dialog gets the Booking control

**Files:**
- Modify: `components/trip/accommodation-form-dialog.tsx`:
  - `ACCOMMODATION_CLEARABLE` (:144);
  - state, after `confirmation` (:183-185);
  - `useFormDirty` (:193);
  - `buildInput` (:210-227);
  - JSX, after the Address + Booking confirmation pair (:259-278).
- Test: `components/trip/accommodation-form-dialog.test.tsx` (extend)

**Interfaces:**
- Consumes: A.10; `AccommodationCardAccommodation` booking fields (A.7); `ProposedAccommodationInput.bookingState` (A.9)

- [ ] **Step 1: Write the failing test** — append to `components/trip/accommodation-form-dialog.test.tsx`:

```tsx
  it("a stay with no confirmation is To book; a Proposal opens Booked and confirms Booked", async () => {
    const user = userEvent.setup();
    render(<AccommodationFormDialog {...baseProps} />);
    expect(screen.getByRole("radio", { name: "To book" })).toHaveAttribute("data-state", "on");

    const onSubmitOverride = vi.fn().mockResolvedValue({ success: true });
    render(
      <AccommodationFormDialog
        {...baseProps}
        initialValues={{ stopId: "stop-1", name: "Casa do Rio", checkIn: "2026-07-10", checkOut: "2026-07-13", bookingState: "BOOKED" }}
        onSubmitOverride={onSubmitOverride}
      />,
    );
    const radios = screen.getAllByRole("radio", { name: "Booked" });
    expect(radios.at(-1)).toHaveAttribute("data-state", "on");
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onSubmitOverride).toHaveBeenCalledWith(expect.objectContaining({ bookingState: "BOOKED" }));
  });

  it("choosing No booking needed (a stay with friends) is sent as a choice", async () => {
    const user = userEvent.setup();
    render(<AccommodationFormDialog {...baseProps} accommodation={existingAccommodation} />);
    await user.click(screen.getByRole("radio", { name: "No booking needed" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateAccommodation).toHaveBeenCalledWith("acc-1", expect.objectContaining({ bookingState: "NONE", bookBy: null }));
  });
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run components/trip/accommodation-form-dialog.test.tsx`

- [ ] **Step 3: Implement**
- Import the field module.
- `"bookBy"` joins `ACCOMMODATION_CLEARABLE` (:144).
- After :185, add `const bookingField = useBookingStateField("ACCOMMODATION", accommodation ?? seedFromProposal(proposed), confirmation);`.
- Add `bookingState: bookingField.dirtyValues` to `useFormDirty` (:193).
- In `buildInput`, after `confirmation: …,` (:221), add `...bookingField.payload(),`.
- JSX, after the pair's closing `</div>` (:278), add `<BookingStateField field={bookingField} errors={errors} disabled={isPending} className="sm:col-span-2" />`.

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run components/trip/accommodation-form-dialog.test.tsx components/booking-import`

- [ ] **Step 5: Task-done check**
- `npx vitest related --run components/trip/accommodation-form-dialog.tsx`
- `npx tsc --noEmit`
- `npx eslint components/trip/accommodation-form-dialog.tsx components/trip/accommodation-form-dialog.test.tsx`

- [ ] **Step 6: Commit** — the two files. Message: `feat(accommodation): Booking control in the stay dialog`

---

### Task A.14: Claude's reads show booking state (get_trip_plan and the narrow reads agree)

**Files:**
- Modify: `lib/mcp/reads/plan-shapes.ts`:
  - the types `McpAccommodation` (:28-37), `McpThingToDo` (:39-49), `McpDayItem` (:51-63), `McpTransport` (:107-126), `McpItemRow` (:215-218) and `McpTransportRow` (:220-223);
  - the selects `MCP_ACCOMMODATION_SELECT` (:168-170), `MCP_THING_TO_DO_SELECT` (:183-186) and `MCP_TRANSPORT_SELECT` (:190-193);
  - the shape functions `toMcpThingToDo` (:237-242), `toMcpDayItem` (:245-252), `withPlaceholders` (:265-278) and `toMcpTransport` (:335-360).
- Test: `lib/mcp/reads/plan-shapes.test.ts` (extend), `test/integration/mcp-narrow-reads.test.ts` (extend; its existing cases must still pass)

**Interfaces:**
- Consumes: the S columns; A.8 (`readDayRows` items carry the fields, so `get_day`'s `toMcpDayItem(e.item)` sees them)
- Produces: `bookingState: BookingState; bookBy: string | null` on every MCP Item, Transport and Accommodation shape. Placeholders read `bookingState: "NONE", bookBy: null`.

- [ ] **Step 1: Write the failing tests**

In `lib/mcp/reads/plan-shapes.test.ts`, extend the `toMcpItem` case at :79-85 and the `toMcpTransport` case at :86-97, using the file's `item()`/transport fixtures with `bookingState: "TO_BOOK", bookBy: "2027-05-01"`:
```ts
  it("every shape carries Booking state; a placeholder is never To book", () => {
    expect(toMcpItem({ ...item({ id: "i1", date: "2027-06-02", stopId: "s1", bookingState: "TO_BOOK", bookBy: "2027-05-01" }), surprise: null }, noFiles))
      .toMatchObject({ bookingState: "TO_BOOK", bookBy: "2027-05-01" });
    const [p] = withPlaceholders([], { views: { stops: new Map(), items: new Map() }, placeholderItems: [placeholder({ id: "p1" })] });
    expect(p).toMatchObject({ bookingState: "NONE", bookBy: null });
  });
```
Use the file's existing placeholder fixture from the case at :62-77. Add `bookingState`/`bookBy` defaults to its `item()` helper, plus `bookingState: "NONE", bookingStateSet: false, bookBy: null` to its placeholder fixture.

In `test/integration/mcp-narrow-reads.test.ts`:
- In the seed, set `TOUR` to `bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-20"`, `FLIGHT` to `bookingState: "BOOKED"` and `CASA` to `bookingState: "TO_BOOK"`.
- Append to the case "get_item, get_transport and get_accommodation equal their get_trip_plan slices, plus their extras" (:98-119):
  ```ts
  expect(tourOnDay).toMatchObject({ bookingState: "TO_BOOK", bookBy: "2027-05-20" });
  expect(leg).toMatchObject({ bookingState: "BOOKED", bookBy: null });
  expect(stay).toMatchObject({ bookingState: "TO_BOOK", bookBy: null });
  ```
- In the get_day case (:133-145), add: as OWNER, `get_day` on 2027-06-02 shows TOUR with `bookingState: "TO_BOOK", bookBy: "2027-05-20"`. That is the same as `get_trip_plan`, because both go through `toMcpDayItem`.

- [ ] **Step 2: Run them, expect FAIL**
- `npx vitest run lib/mcp/reads/plan-shapes.test.ts`: `bookingState` is undefined.
- With the DB up, `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/mcp-narrow-reads.test.ts`: the new assertions fail, and the existing equalities still pass.

- [ ] **Step 3: Implement** — `lib/mcp/reads/plan-shapes.ts`:
- Import the type `BookingState` from `@/lib/booking-state`.
- Add this to `McpAccommodation`, `McpThingToDo`, `McpDayItem` and `McpTransport`:
  ```ts
  /** CONTEXT.md "Booking state": NONE (no booking needed), TO_BOOK or BOOKED. Booked is not paid (that's the Cost). */
  bookingState: BookingState;
  /** YYYY-MM-DD it should be booked by; only while TO_BOOK. */
  bookBy: string | null;
  ```
- Add `bookingState: BookingState; bookBy: string | null;` to `McpItemRow` and `McpTransportRow`.
- Add `bookingState: true, bookBy: true,` to the three selects. `MCP_DATED_ITEM_SELECT` spreads the thing-to-do select, so it follows.
- `toMcpThingToDo`: add `bookingState: i.bookingState, bookBy: i.bookBy,`.
- `toMcpDayItem` takes a `StopDayItem`, where the fields are optional: add `bookingState: i.bookingState ?? "NONE", bookBy: i.bookBy ?? null,`.
- `withPlaceholders`'s placeholder map: add `bookingState: p.bookingState, bookBy: p.bookBy,`.
- `toMcpTransport`: add `bookingState: t.bookingState, bookBy: t.bookBy,` before `files`.
- `toMcpAccommodation` spreads the row, so it needs no change.

- [ ] **Step 4: Run them, expect PASS** — `npx vitest run lib/mcp/reads lib/mcp/tools/reads.test.ts`, then the integration file.

- [ ] **Step 5: Task-done check**
- `npx vitest related --run lib/mcp/reads/plan-shapes.ts`
- `npx tsc --noEmit`
- `npx eslint lib/mcp/reads/plan-shapes.ts lib/mcp/reads/plan-shapes.test.ts test/integration/mcp-narrow-reads.test.ts`
- `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/mcp-narrow-reads.test.ts test/integration/mcp.test.ts`

- [ ] **Step 6: Commit** — the three files. Message: `feat(mcp): reads show Booking state and book-by date`

---

### Task A.15: Claude's add_/update_ tools take booking state

**Files:**
- Create: `lib/mcp/booking-state-fields.ts`
- Modify:
  - `lib/mcp/vocab.ts`: add `BOOKING_STATE_MEANING` after `VOTE_LEVEL_MEANING` (:55-59).
  - `lib/mcp/tools/plan-write.ts`:
    - `itemCreateShape` (:70-81) and `itemPatchShape` (:84-95);
    - the `update_thing_to_do` handler (:117-130): `updateItem(itemId, bookingPatchFrom(patch))`.
  - `lib/mcp/tools/bookings-write.ts`:
    - the shapes `accommodationCreateShape` (:92-102), `accommodationPatchShape` (:104-115), `transportCreateShape` (:125-139) and `transportPatchShape` (:141-163);
    - the `update_accommodation` handler (:288) and the `update_transport` handler (:375), each with `bookingPatchFrom(patch)`.
- Test: `lib/mcp/vocab.test.ts` (extend `it.each`), `lib/mcp/tools/plan-write.test.ts`, `lib/mcp/tools/bookings-write.test.ts` (extend)

**Interfaces:**
- Consumes: `bookingStateSchema` (S), `BOOKING_STATES` (S), `isoDate` (lib/validations/primitives.ts), `describeValues` (lib/mcp/vocab.ts:66)
- Produces:
  ```ts
  export const describedBookingState: z.ZodEnum<…>;          // with the vocab description
  export const bookByField: z.ZodString;                      // isoDate + description
  export const bookingCreateShape: { bookingState: …optional; bookBy: …optional };
  export const bookingPatchShape: { bookingState: …optional; bookBy: z.union([isoDate, z.literal("")]).optional() };
  export function bookingPatchFrom<T extends { bookBy?: string }>(patch: T): Omit<T, "bookBy"> & { bookBy?: string | null };
  ```

- [ ] **Step 1: Write the failing tests**
- `lib/mcp/vocab.test.ts`: add `["Booking state", BOOKING_STATES, BOOKING_STATE_MEANING]` to the `it.each` table.
- `lib/mcp/tools/bookings-write.test.ts`, with the file's client and mocks:
  ```ts
  it("update_transport passes bookingState through and turns bookBy \"\" into a clear (null)", async () => {
    updateTransport.mockResolvedValue({ success: true });
    loadTransportForMcp.mockResolvedValue({ id: "tr-1" });
    transportFindUnique.mockResolvedValue({ tripId: "trip-1" });
    await client.callTool({ name: "update_transport", arguments: { transportId: "tr-1", bookingState: "TO_BOOK", bookBy: "" } });
    expect(updateTransport).toHaveBeenCalledWith("tr-1", { bookingState: "TO_BOOK", bookBy: null });
  });
  it("add_accommodation forwards bookingState and bookBy", async () => { /* createAccommodation called with objectContaining({ bookingState: "TO_BOOK", bookBy: "2027-05-01" }) */ });
  ```
- `lib/mcp/tools/plan-write.test.ts`: the same pair for `add_thing_to_do` and `update_thing_to_do`.

- [ ] **Step 2: Run them, expect FAIL** — `npx vitest run lib/mcp/vocab.test.ts lib/mcp/tools/plan-write.test.ts lib/mcp/tools/bookings-write.test.ts`. The SDK strips the unknown keys, and `BOOKING_STATE_MEANING` doesn't exist.

- [ ] **Step 3: Implement**

`lib/mcp/vocab.ts`:
```ts
/** What each Booking state means (CONTEXT.md), for set_booking_state and the add_/update_ tools. */
export const BOOKING_STATE_MEANING: Record<BookingState, string> = {
  NONE: "no booking needed: walk in, free entry, or a stay with friends",
  TO_BOOK: "still to book. A leg you haven't bought yet, with placeholder times, is a TO_BOOK Transport",
  BOOKED: "booked: reserved or ticketed. Booked is not paid; payment is the Cost's business",
};
```
Add `import type { BookingState } from "@/lib/booking-state";` too.

`lib/mcp/booking-state-fields.ts`:
```ts
/**
 * Booking state on the Claude connection's write tools (spec 2026-10-17 R2,
 * R13): the same field on add_/update_thing_to_do, add_/update_transport and
 * add_/update_accommodation, and set_booking_state's. The action's rule
 * (lib/booking-state-patch.ts) does the rest.
 */
import { z } from "zod";
import { BOOKING_STATES } from "@/lib/booking-state";
import { bookingStateSchema } from "@/lib/validations/booking-state";
import { isoDate } from "@/lib/validations/primitives";
import { BOOKING_STATE_MEANING, describeValues } from "./vocab";

export const describedBookingState = bookingStateSchema.describe(
  describeValues(
    "Whether it still has to be booked. Omit it and a booking reference makes it BOOKED; without one a Transport leg or Accommodation is TO_BOOK and a thing to do NONE. A state you set stays when the reference changes.",
    BOOKING_STATE_MEANING,
    BOOKING_STATES,
  ),
);

export const bookByField = isoDate.describe("YYYY-MM-DD: the day it should be booked by. Only with TO_BOOK.");

export const bookingCreateShape = {
  bookingState: describedBookingState.optional(),
  bookBy: bookByField.optional(),
};

export const bookingPatchShape = {
  bookingState: describedBookingState.optional(),
  bookBy: z.union([isoDate, z.literal("")]).optional().describe('YYYY-MM-DD: the day it should be booked by, only while TO_BOOK. "" clears it.'),
};

/** An update tool's `bookBy: ""` is the PATCH clear (ADR 0075 `null`). */
export function bookingPatchFrom<T extends { bookBy?: string }>(patch: T): Omit<T, "bookBy"> & { bookBy?: string | null } {
  if (patch.bookBy !== "") return patch;
  return { ...patch, bookBy: null };
}
```

Then:
- Spread `...bookingCreateShape` into `itemCreateShape`, `accommodationCreateShape` and `transportCreateShape`.
- Spread `...bookingPatchShape` into the three patch shapes.
- Wrap the three update handlers' patch in `bookingPatchFrom(...)`.
- Append one sentence to `update_transport`'s description: `"A leg not bought yet is bookingState TO_BOOK; give bookBy for the day to book it by."`

- [ ] **Step 4: Run them, expect PASS** — the Step 2 command, plus `npx vitest run lib/mcp/tools/write-returns.test.ts`

- [ ] **Step 5: Task-done check**
- `npx vitest related --run lib/mcp/booking-state-fields.ts lib/mcp/vocab.ts lib/mcp/tools/plan-write.ts lib/mcp/tools/bookings-write.ts`
- `npx tsc --noEmit`
- `npx eslint <those files and their tests>`

- [ ] **Step 6: Commit** — the touched files. Message: `feat(mcp): add_/update_ tools take Booking state and book-by date`

---

### Task A.16: `set_booking_state` for Claude

**Files:**
- Create: `lib/mcp/tools/booking-state-write.ts`
- Modify:
  - `lib/mcp/server.ts`: import (:7-13) and `registerBookingStateTools(server)` after `registerBookingsWriteTools(server)` (:41).
  - `lib/mcp/tools/write-returns.test.ts`: the `ARGS` table (:97-150).
- Test: `lib/mcp/tools/booking-state-write.test.ts` (create)

**Interfaces:**
- Consumes:
  - `runWrite` (lib/mcp/run-tool.ts) and `requireRealPlanRow` (lib/mcp/real-plan.ts);
  - `updateItem`, `updateTransport` and `updateAccommodation` (A.3–A.5);
  - `loadItemForMcp`, `loadTransportForMcp` and `loadAccommodationForMcp` (lib/mcp/reads/entities.ts);
  - `describedBookingState` and `bookByField` (A.15).
- Produces: the tool `set_booking_state { kind: "ITEM" | "TRANSPORT" | "ACCOMMODATION", id, state, bookBy? }`. It returns `{ item }`, `{ transport }` or `{ accommodation }`, the narrow read (F6).

- [ ] **Step 1: Write the failing test** — `lib/mcp/tools/booking-state-write.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  updateItem: vi.fn(), updateTransport: vi.fn(), updateAccommodation: vi.fn(),
  loadItemForMcp: vi.fn(), loadTransportForMcp: vi.fn(), loadAccommodationForMcp: vi.fn(),
  requireRealPlanRow: vi.fn(),
}));
vi.mock("@/server/actions/items", () => ({ updateItem: m.updateItem }));
vi.mock("@/server/actions/transport", () => ({ updateTransport: m.updateTransport }));
vi.mock("@/server/actions/accommodation", () => ({ updateAccommodation: m.updateAccommodation }));
vi.mock("../reads/entities", () => ({ loadItemForMcp: m.loadItemForMcp, loadTransportForMcp: m.loadTransportForMcp, loadAccommodationForMcp: m.loadAccommodationForMcp }));
vi.mock("../real-plan", () => ({ requireRealPlanRow: m.requireRealPlanRow, requireRealPlanRows: vi.fn() }));
// buildMcpServer registers every group; these keep the rest import-clean (as vocab.test.ts does).
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(), requireUser: vi.fn(), requireRowAccess: vi.fn(), isTripOwnerOrAdmin: vi.fn() }));
vi.mock("@/lib/globe", () => ({ requireGlobeAccess: vi.fn() }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));

import { connectTestClient } from "../test-client";
import { NOT_FOUND_TEXT } from "../run-tool";

const text = (r: { content: unknown }) => (r.content as { text: string }[])[0].text;

describe("set_booking_state (spec R2, R13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.requireRealPlanRow.mockResolvedValue({ tripId: "trip-1" });
    for (const fn of [m.updateItem, m.updateTransport, m.updateAccommodation]) fn.mockResolvedValue({ success: true });
    m.loadTransportForMcp.mockResolvedValue({ id: "tr-1", bookingState: "TO_BOOK", bookBy: "2027-05-01" });
    m.loadItemForMcp.mockResolvedValue({ id: "it-1", bookingState: "BOOKED", bookBy: null });
    m.loadAccommodationForMcp.mockResolvedValue({ id: "acc-1", bookingState: "NONE", bookBy: null });
  });

  it("sets a leg To book by a date and returns the leg as it now stands", async () => {
    const c = await connectTestClient();
    const r = await c.callTool({ name: "set_booking_state", arguments: { kind: "TRANSPORT", id: "tr-1", state: "TO_BOOK", bookBy: "2027-05-01" } });
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("transport", "tr-1");
    expect(m.updateTransport).toHaveBeenCalledWith("tr-1", { bookingState: "TO_BOOK", bookBy: "2027-05-01" });
    expect(JSON.parse(text(r))).toEqual({ transport: { id: "tr-1", bookingState: "TO_BOOK", bookBy: "2027-05-01" } });
  });

  it("replaces both: no bookBy means no book-by date", async () => {
    const c = await connectTestClient();
    await c.callTool({ name: "set_booking_state", arguments: { kind: "ITEM", id: "it-1", state: "BOOKED" } });
    expect(m.updateItem).toHaveBeenCalledWith("it-1", { bookingState: "BOOKED", bookBy: null });
    await c.callTool({ name: "set_booking_state", arguments: { kind: "ACCOMMODATION", id: "acc-1", state: "NONE" } });
    expect(m.updateAccommodation).toHaveBeenCalledWith("acc-1", { bookingState: "NONE", bookBy: null });
  });

  it("reports the action's refusal and reads nothing back", async () => {
    m.updateItem.mockResolvedValue({ success: false, errors: { bookBy: ["A book-by date is only for something still to book."] } });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "set_booking_state", arguments: { kind: "ITEM", id: "it-1", state: "BOOKED", bookBy: "2027-05-01" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("bookBy: A book-by date is only for something still to book.");
    expect(m.loadItemForMcp).not.toHaveBeenCalled();
  });

  it("a Fork's row or another Trip's reads as not found", async () => {
    m.requireRealPlanRow.mockRejectedValue(Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
    const c = await connectTestClient();
    const r = await c.callTool({ name: "set_booking_state", arguments: { kind: "TRANSPORT", id: "fork-leg", state: "BOOKED" } });
    expect(text(r)).toBe(NOT_FOUND_TEXT);
    expect(m.updateTransport).not.toHaveBeenCalled();
  });
});
```

In `lib/mcp/tools/write-returns.test.ts` `ARGS`, add `set_booking_state: { kind: "TRANSPORT", id: "tr-1", state: "TO_BOOK", bookBy: "2027-05-01" },`. That file's mocks already cover the three actions and readers.

- [ ] **Step 2: Run them, expect FAIL** — `npx vitest run lib/mcp/tools/booking-state-write.test.ts lib/mcp/tools/write-returns.test.ts`. The tool is unknown, and ARGS names a tool that isn't registered.

- [ ] **Step 3: Implement** — `lib/mcp/tools/booking-state-write.ts`

```ts
/**
 * set_booking_state (spec 2026-10-17 R2, R13): whether a thing to do, a
 * Transport leg or an Accommodation still has to be booked. It runs the
 * app's own update actions with a booking-only PATCH, so the rule
 * (lib/booking-state-patch.ts), the Activity line and the real-plan check are
 * the dialogs'. Real plan only (`../real-plan.ts`). Returns the row as it now
 * stands (F6).
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { updateItem } from "@/server/actions/items";
import { updateTransport } from "@/server/actions/transport";
import { updateAccommodation } from "@/server/actions/accommodation";
import { runWrite } from "../run-tool";
import { requireRealPlanRow } from "../real-plan";
import { loadAccommodationForMcp, loadItemForMcp, loadTransportForMcp } from "../reads/entities";
import { bookByField, describedBookingState } from "../booking-state-fields";

const KINDS = ["ITEM", "TRANSPORT", "ACCOMMODATION"] as const;

export function registerBookingStateTools(server: McpServer): void {
  server.registerTool(
    "set_booking_state",
    {
      title: "Set booking state",
      description:
        "Sets whether a thing to do (ITEM), a Transport leg or an Accommodation still has to be booked. " +
        "bookBy (YYYY-MM-DD) is the day to book it by and only goes with TO_BOOK; omit it for no date. " +
        "The state you set stays even when a booking reference is added or removed. Booking is not paying: use mark_cost_paid for that.",
      inputSchema: { kind: z.enum(KINDS), id: z.string(), state: describedBookingState, bookBy: bookByField.optional() },
    },
    ({ kind, id, state, bookBy }) =>
      runWrite(
        "set_booking_state",
        async () => {
          const patch = { bookingState: state, bookBy: bookBy ?? null };
          if (kind === "ITEM") {
            await requireRealPlanRow("item", id);
            return updateItem(id, patch);
          }
          if (kind === "TRANSPORT") {
            await requireRealPlanRow("transport", id);
            return updateTransport(id, patch);
          }
          await requireRealPlanRow("accommodation", id);
          return updateAccommodation(id, patch);
        },
        async () =>
          kind === "ITEM"
            ? { item: await loadItemForMcp(id) }
            : kind === "TRANSPORT"
              ? { transport: await loadTransportForMcp(id) }
              : { accommodation: await loadAccommodationForMcp(id) },
      ),
  );
}
```
In `lib/mcp/server.ts`, add `import { registerBookingStateTools } from "./tools/booking-state-write";` and call `registerBookingStateTools(server);` after :41.

- [ ] **Step 4: Run them, expect PASS** — `npx vitest run lib/mcp`

- [ ] **Step 5: Task-done check**
- `npx vitest related --run lib/mcp/tools/booking-state-write.ts lib/mcp/server.ts`
- `npx tsc --noEmit`
- `npx eslint lib/mcp/tools/booking-state-write.ts lib/mcp/tools/booking-state-write.test.ts lib/mcp/server.ts lib/mcp/tools/write-returns.test.ts`
- `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/mcp.test.ts` (the tool list over the real route)

- [ ] **Step 6: Commit** — the four files. Message: `feat(mcp): set_booking_state`

---

## Section B — Booking state display

### Notes

**Assumes:** Section A in full:
- `BOOKING_STATE_LABELS`, `bookByLabel` (A.2);
- the view-type fields (A.7, A.8);
- `readDayRows`/`readPlan` selecting the three columns.

Also S's `BookingState`.

**Produces:**
- `components/trip/booking-state-badge.tsx`:
  ```ts
  BookingStateBadge({ state, bookBy, compact, className }: { state?: BookingState | null; bookBy?: string | null; compact?: boolean; className?: string })
  ```
  It renders nothing unless the state is TO_BOOK.
- `lib/still-to-book.ts` (pure):
  - `StillToBookSource` and `StillToBookRow`;
  - `buildStillToBook(sources, basePath): StillToBookRow[]`;
  - `STILL_TO_BOOK_LIMIT_PHONE = 5` and `STILL_TO_BOOK_LIMIT_DESKTOP = 6`.
- `HomePlanningData.stillToBook: StillToBookRow[]` (lib/desktop-home-loader.ts).
- `components/trip/home/still-to-book-card.tsx`: `StillToBookCard({ rows, limit, planHref })`. It returns `null` when `rows` is empty.
- `DesktopHomeGrid` gains an optional `stillToBook?: ReactNode` slot (a full-width third row) and `DESKTOP_GRID_SPANS.stillToBook`.

**Decisions where the spec is silent:**
1. **Badge copy and variant.**
   - Normal size is two Badges: `warning` "To book" and `muted` "Book by 20 Nov".
   - `compact` (the leg pill and the plan's day rows) is one `warning` Badge reading "Book by 20 Nov" when a date is set, else "To book".
   - Booked and No booking needed show nothing new, with one exception: the plan's day row already had a "Booked ✓" pill, which now follows `bookingState` instead of `booking`.
2. **Where the badge goes:**
   - Item cards: ItemCard, in both scheduled and Wishlist mode.
   - Transport: TransportCard (the Booking import preview) and the Plan's LegPill.
   - Accommodation: AccommodationCard and the Plan's StayPanel block.
   - Timeline: the departure and arrival transport rows, item rows and check-in rows. That covers the Day view, Today and the Calendar agenda.
   - The Plan's day rows (`components/plan/day-section.tsx`): their summary line becomes "N booked · M to book".
   - Not on the Share page or Print. They select no booking state, so nothing renders.
3. **Home "Still to book":**
   - It reads the real plan only. Wishlist ideas (no Stop, no date) are excluded.
   - It is Surprise-aware through the loader's existing `v.where.item`/`v.where.accommodation` fragments. Placeholders never join it.
   - Rows are sorted by book-by date, then the thing's own date, both nulls last, then by label.
   - A row's date is an Item's date, a leg's departure day in its own zone, or a stay's check-in. A dated Item or leg links to `/day/<date>`. A stay, or anything undated, links to `/plan?stop=<id>`, falling back to `/plan`.
   - It shows on the phone in Planning/Final-prep (`PhasePlanning`), and on desktop in Sketching/Planning/Final-prep (the `DesktopHomeGrid` third row). It is hidden when empty, and not shown while Travelling or Past.
   - Rows are capped at 5 on the phone and 6 on desktop, with "N more to book" linking to the Plan.
4. **Existing Trips light up.** S's backfill makes every leg and stay without a reference To book, so most Trips gain Still to book rows the day this ships. That is the spec as written, and worth a line in the Resolution.

**Review Focus candidates:**
1. **Surprise.** For a Traveller surprised by a Surprise Item that is To book, or by a Surprise Stop whose stay is To book, neither row appears in Still to book. The planner sees both. A Fork's To book leg never appears. Tested in B.6 (integration).
2. **Order.**
   - Input: a leg To book by 1 May, departing 4 Jun.
   - Input: a stay To book by 1 May, checking in 1 Jun.
   - Input: an Item To book with no book-by date, on 2 Jun.
   - Expected order: the stay, then the leg (book-by tie, so the earlier date first), then the Item. Tested in B.5.
3. **The plan's day row.** An Item with a reference but a Traveller-chosen To book shows "To book", not "Booked ✓". Tested in B.3.

---

### Task B.1: `BookingStateBadge`

**Files:**
- Create: `components/trip/booking-state-badge.tsx`
- Test: `components/trip/booking-state-badge.test.tsx` (create)

**Interfaces:**
- Consumes: `Badge` (components/ui/badge.tsx; `warning` and `muted` variants); `BOOKING_STATE_LABELS`, `bookByLabel` (A.2)
- Produces: `BookingStateBadge`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BookingStateBadge } from "./booking-state-badge";

describe("BookingStateBadge (CONTEXT.md Booking state)", () => {
  it("says To book, and the book-by date when there is one", () => {
    render(<BookingStateBadge state="TO_BOOK" bookBy="2026-11-20" />);
    expect(screen.getByText("To book")).toBeInTheDocument();
    expect(screen.getByText("Book by 20 Nov")).toBeInTheDocument();
  });
  it("compact is one badge: the date when set, else To book", () => {
    const { rerender } = render(<BookingStateBadge state="TO_BOOK" bookBy="2026-11-20" compact />);
    expect(screen.getByText("Book by 20 Nov")).toBeInTheDocument();
    expect(screen.queryByText("To book")).not.toBeInTheDocument();
    rerender(<BookingStateBadge state="TO_BOOK" compact />);
    expect(screen.getByText("To book")).toBeInTheDocument();
  });
  it.each(["BOOKED", "NONE", null, undefined] as const)("renders nothing for %s", (state) => {
    const { container } = render(<BookingStateBadge state={state} bookBy="2026-11-20" />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run components/trip/booking-state-badge.test.tsx`. The import is unresolved.

- [ ] **Step 3: Implement**

```tsx
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import type { BookingState } from "@/lib/booking-state";
import { BOOKING_STATE_LABELS, bookByLabel } from "@/lib/booking-state-copy";

/**
 * "To book" on a card, a leg, a stay or a Timeline row (CONTEXT.md "Booking
 * state", spec 2026-10-17 R2), with its book-by date. Nothing for Booked or
 * No booking needed: those need no attention. `compact` (pills and dense
 * rows) folds the two into one badge. Server Component (no hooks).
 */
export function BookingStateBadge({
  state,
  bookBy,
  compact = false,
  className,
}: {
  state?: BookingState | null;
  bookBy?: string | null;
  compact?: boolean;
  className?: string;
}) {
  if (state !== "TO_BOOK") return null;
  if (compact) {
    return (
      <Badge variant="warning" data-booking-state className={cn("shrink-0", className)}>
        {bookBy ? bookByLabel(bookBy) : BOOKING_STATE_LABELS.TO_BOOK}
      </Badge>
    );
  }
  return (
    <span data-booking-state className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      <Badge variant="warning">{BOOKING_STATE_LABELS.TO_BOOK}</Badge>
      {bookBy ? <Badge variant="muted">{bookByLabel(bookBy)}</Badge> : null}
    </span>
  );
}
```

- [ ] **Step 4: Run it, expect PASS**

- [ ] **Step 5: Task-done check**
- `npx vitest related --run components/trip/booking-state-badge.tsx`
- `npx tsc --noEmit`
- `npx eslint components/trip/booking-state-badge.tsx components/trip/booking-state-badge.test.tsx`

- [ ] **Step 6: Commit** — message: `feat(booking-state): the To book badge`

---

### Task B.2: "To book" on Item, Transport and Accommodation cards

**Files:**
- Modify:
  - `components/trip/item-card.tsx`: the Wishlist chip row (:122-134) and the scheduled category/time row (:222-237).
  - `components/trip/transport-card.tsx`: the subline (:119-134).
  - `components/trip/accommodation-card.tsx`: the dates + nights row (:134-142).
- Test: `components/trip/item-card.test.tsx`, `components/trip/transport-card.test.tsx`, `components/trip/accommodation-card.test.tsx` (extend each)

**Interfaces:**
- Consumes: `BookingStateBadge` (B.1); the A.7 view-type fields

- [ ] **Step 1: Write the failing tests** — one case per card file, using each file's fixture:

```tsx
it("shows To book and its book-by date (spec R2)", () => {
  render(<ItemCard item={{ ...item, bookingState: "TO_BOOK", bookBy: "2026-11-20" }} mode="scheduled" />);
  expect(screen.getByText("To book")).toBeInTheDocument();
  expect(screen.getByText("Book by 20 Nov")).toBeInTheDocument();
});
it("a Booked thing shows no badge", () => {
  render(<ItemCard item={{ ...item, bookingState: "BOOKED" }} mode="scheduled" />);
  expect(screen.queryByText("To book")).not.toBeInTheDocument();
});
```
Write the same pair for `ItemCard` in `mode="wishlist"`, for `TransportCard` (its fixture `transport`) and for `AccommodationCard` (its fixture plus `stop`).

- [ ] **Step 2: Run them, expect FAIL** — `npx vitest run components/trip/item-card.test.tsx components/trip/transport-card.test.tsx components/trip/accommodation-card.test.tsx`

- [ ] **Step 3: Implement** — import `BookingStateBadge` in each file, then:
- `item-card.tsx`:
  - In the Wishlist chip row, after the `placed` marker (:133), add `<BookingStateBadge state={item.bookingState} bookBy={item.bookBy} />`.
  - In the scheduled row, after the time span (:236), add the same.
- `transport-card.tsx`: at the end of the subline `div` (:134), add `<BookingStateBadge state={t.bookingState} bookBy={t.bookBy} />`.
- `accommodation-card.tsx`: at the end of the dates + nights row (:142), add `<BookingStateBadge state={a.bookingState} bookBy={a.bookBy} />`.

- [ ] **Step 4: Run them, expect PASS** — the Step 2 command, plus `npx vitest run components/booking-import` (the Proposal preview renders these cards; a Proposal is Booked, so no badge).

- [ ] **Step 5: Task-done check**
- `npx vitest related --run components/trip/item-card.tsx components/trip/transport-card.tsx components/trip/accommodation-card.tsx`
- `npx tsc --noEmit`
- `npx eslint <the six files>`

- [ ] **Step 6: Commit** — message: `feat(booking-state): To book on Item, Transport and stay cards`

---

### Task B.3: "To book" in the Plan editor (legs, stays, day rows)

**Files:**
- Modify:
  - `components/plan/leg-pill.tsx`: `LegPillProps` (:75-79) and the non-missing branch of `LegPill` (:107-112).
  - `components/trip/itinerary-manager.tsx:1311-1319`: `renderLegPill` passes the leg's state.
  - `components/plan/stay-panel.tsx`: `StayBlock`, after the confirmation line (:82-87).
  - `components/plan/day-section.tsx`: `daySummary` (:84-98) and `DayRow`'s pills (:259-266).
- Test: `components/plan/leg-pill.test.tsx`, `components/plan/stay-panel.test.tsx`, `components/plan/day-section.test.tsx` (extend). In day-section.test.tsx, update the fixtures that relied on `booking` to show "Booked", adding `bookingState: "BOOKED"`. That is a mock rewrite; the assertions stay as they are.

**Interfaces:**
- Consumes: `BookingStateBadge` (B.1); `ItineraryTransport`/`StopDayItem`/`StayPanelAccommodation` booking fields (A.7)
- Produces: `LegPillProps` gains `bookingState?: BookingState | null; bookBy?: string | null`.

- [ ] **Step 1: Write the failing tests**

`components/plan/leg-pill.test.tsx`:
```tsx
it("a To book leg says so on the pill, with its book-by date when set", () => {
  render(<LegPill label={label} onClick={() => {}} bookingState="TO_BOOK" bookBy="2027-05-01" />);
  expect(screen.getByRole("button")).toHaveTextContent("Book by 1 May");
});
```

`components/plan/stay-panel.test.tsx`:
```tsx
it("a stay still to book says To book beside its cost line", () => {
  render(<StayPanel {...props} accommodations={[{ ...stay, bookingState: "TO_BOOK" }]} />);
  expect(within(screen.getByTestId("stay-block")).getByText("To book")).toBeInTheDocument();
});
```

`components/plan/day-section.test.tsx`:
```tsx
it("Booked follows the Booking state, not the reference; To book shows on the row and in the summary", () => {
  renderDay({ items: [
    { ...row("a"), booking: "BK-1", bookingState: "TO_BOOK" },
    { ...row("b"), booking: null, bookingState: "BOOKED" },
  ] });
  expect(screen.getAllByText(/^Booked/)).toHaveLength(1);
  expect(screen.getByText("To book")).toBeInTheDocument();
  expect(screen.getByText(/1 booked · 1 to book/)).toBeInTheDocument();
});
```
Use each file's real fixture and helper names.

- [ ] **Step 2: Run them, expect FAIL** — `npx vitest run components/plan/leg-pill.test.tsx components/plan/stay-panel.test.tsx components/plan/day-section.test.tsx`

- [ ] **Step 3: Implement**
- `leg-pill.tsx`:
  - Add `bookingState?: BookingState | null; bookBy?: string | null;` to `LegPillProps`.
  - Destructure them in `LegPill`.
  - In the non-missing fragment, after the `sub` span (:110), add `<BookingStateBadge state={bookingState} bookBy={bookBy} compact />`.
  - The `accessibleName` stays the leg's. The badge is visible text, so it joins the button's accessible text.
- `itinerary-manager.tsx:1311`: add `bookingState={t.bookingState}` and `bookBy={t.bookBy}` to `<LegPill … />`.
- `stay-panel.tsx`: after the confirmation `<p>` (:87), add:
  ```tsx
  {a.bookingState === "TO_BOOK" && (
    <p className="flex items-center gap-1.5"><BookingStateBadge state={a.bookingState} bookBy={a.bookBy} /></p>
  )}
  ```
- `day-section.tsx`:
  - `daySummary`:
    ```ts
    const booked = items.filter((i) => i.bookingState === "BOOKED").length;
    const toBook = items.filter((i) => i.bookingState === "TO_BOOK").length;
    ```
    After the booked push, add `if (toBook > 0) parts.push(\`${toBook} to book\`);`.
  - `DayRow`: change the condition `item.booking &&` (:261) to `item.bookingState === "BOOKED" &&`. After that pill, add `<BookingStateBadge state={item.bookingState} bookBy={item.bookBy} compact />`.

- [ ] **Step 4: Run them, expect PASS** — the Step 2 command, plus `npx vitest run components/trip/itinerary-manager.test.tsx components/plan`

- [ ] **Step 5: Task-done check**
- `npx vitest related --run components/plan/leg-pill.tsx components/plan/stay-panel.tsx components/plan/day-section.tsx components/trip/itinerary-manager.tsx`
- `npx tsc --noEmit`
- `npx eslint <the changed files and tests>`

- [ ] **Step 6: Commit** — message: `feat(plan): To book on legs, stays and day rows`

---

### Task B.4: "To book" on the Timeline (Day view, Today, Calendar agenda)

**Files:**
- Modify: `components/trip/timeline.tsx`:
  - `TransportRow`, after the reference chip (:397-401);
  - `DayItemBody`, the meta row after the Surprise badge (:607);
  - `AccomCheckinRow`, after the confirmation line (:513-518).
- Test: `components/trip/timeline.test.tsx` (extend)

**Interfaces:**
- Consumes: `BookingStateBadge` (B.1); the A.8 itinerary entry fields

- [ ] **Step 1: Write the failing test** — in `components/trip/timeline.test.tsx`, with its `day()` fixture builder:

```tsx
describe("Booking state on the Timeline (spec R2)", () => {
  it("a To book leg, Item and stay each say so; a Booked one doesn't", () => {
    render(<Timeline variant="day" day={dayWith({
      transport: { ...leg, bookingState: "TO_BOOK", bookBy: "2027-05-01" },
      item: { ...tour, bookingState: "TO_BOOK" },
      checkin: { ...stay, bookingState: "BOOKED" },
    })} />);
    expect(screen.getAllByText("To book")).toHaveLength(2);
    expect(screen.getByText("Book by 1 May")).toBeInTheDocument();
  });
});
```
Build `dayWith` from the file's existing `DayPlan` fixtures. The departure row, the item row and the check-in row each come from one entry.

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run components/trip/timeline.test.tsx`

- [ ] **Step 3: Implement** — import `BookingStateBadge`, then:
- `TransportRow`: after the reference `span` (:401), add `<BookingStateBadge state={t.bookingState} bookBy={t.bookBy} compact />`.
- `DayItemBody`: after the `SurpriseBadge` (:607), add `<BookingStateBadge state={item.bookingState} bookBy={item.bookBy} compact />`. Placeholders are always NONE (A.7), so the slot says nothing.
- `AccomCheckinRow`: after the confirmation `<p>` (:518), add `{a.bookingState === "TO_BOOK" && <p className="mt-0.5"><BookingStateBadge state={a.bookingState} bookBy={a.bookBy} compact /></p>}`.

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run components/trip/timeline.test.tsx components/trip/agenda-view.test.tsx components/trip/home/phase-travelling.test.tsx`

- [ ] **Step 5: Task-done check**
- `npx vitest related --run components/trip/timeline.tsx`
- `npx tsc --noEmit`
- `npx eslint components/trip/timeline.tsx components/trip/timeline.test.tsx`

- [ ] **Step 6: Commit** — message: `feat(timeline): To book on the Day view, Today and the agenda`

---

### Task B.5: The Still to book list (pure)

**Files:**
- Create: `lib/still-to-book.ts`
- Test: `lib/still-to-book.test.ts` (create)

**Interfaces:**
- Consumes: `formatDayLabel` (lib/dates.ts:168); `tripSubPath` (lib/trip-path.ts:28); `BookingState` (S)
- Produces:
  ```ts
  export type StillToBookKind = "ITEM" | "TRANSPORT" | "ACCOMMODATION";
  export interface StillToBookSource { kind: StillToBookKind; id: string; label: string; bookingState: BookingState; bookBy: string | null; date: string | null; stopId: string | null }
  export interface StillToBookRow { id: string; kind: StillToBookKind; title: string; subtitle: string; href: Route; bookBy: string | null }
  export const STILL_TO_BOOK_LIMIT_PHONE = 5;
  export const STILL_TO_BOOK_LIMIT_DESKTOP = 6;
  export function buildStillToBook(sources: StillToBookSource[], basePath: string): StillToBookRow[];
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildStillToBook, type StillToBookSource } from "./still-to-book";

const src = (o: Partial<StillToBookSource> & Pick<StillToBookSource, "id" | "kind">): StillToBookSource => ({
  label: o.id, bookingState: "TO_BOOK", bookBy: null, date: null, stopId: null, ...o,
});

describe("buildStillToBook (Home, spec R2)", () => {
  it("lists only To book things, by book-by date then the thing's own date, undated last", () => {
    const rows = buildStillToBook(
      [
        src({ id: "tour", kind: "ITEM", date: "2027-06-02", stopId: "porto" }),
        src({ id: "leg", kind: "TRANSPORT", bookBy: "2027-05-01", date: "2027-06-04", stopId: "porto" }),
        src({ id: "stay", kind: "ACCOMMODATION", bookBy: "2027-05-01", date: "2027-06-01", stopId: "porto" }),
        src({ id: "done", kind: "TRANSPORT", bookingState: "BOOKED", date: "2027-06-01" }),
        src({ id: "walk", kind: "ITEM", bookingState: "NONE", date: "2027-06-01" }),
        src({ id: "someday", kind: "ITEM" }),
      ],
      "/trips/xmas",
    );
    expect(rows.map((r) => r.id)).toEqual(["stay", "leg", "tour", "someday"]);
  });

  it("says when to book it by and when it happens, and links to its thing", () => {
    const [leg, stay, tour, someday] = buildStillToBook(
      [
        src({ id: "leg", kind: "TRANSPORT", label: "Train · Strasbourg → Frankfurt", bookBy: "2027-05-01", date: "2027-06-04", stopId: "stras" }),
        src({ id: "stay", kind: "ACCOMMODATION", label: "Casa", bookBy: "2027-05-02", date: "2027-06-01", stopId: "porto" }),
        src({ id: "tour", kind: "ITEM", label: "Lodge tour", bookBy: "2027-05-03", date: "2027-06-02", stopId: "porto" }),
        src({ id: "someday", kind: "ITEM", label: "Fado night", bookBy: "2027-05-04", stopId: "porto" }),
      ],
      "/trips/xmas",
    );
    expect(leg).toMatchObject({ title: "Train · Strasbourg → Frankfurt", subtitle: "Book by Sat 1 May · Leaves Fri 4 Jun", href: "/trips/xmas/day/2027-06-04" });
    expect(stay).toMatchObject({ subtitle: "Book by Sun 2 May · Check-in Tue 1 Jun", href: "/trips/xmas/plan?stop=porto" });
    expect(tour).toMatchObject({ subtitle: "Book by Mon 3 May · Wed 2 Jun", href: "/trips/xmas/day/2027-06-02" });
    expect(someday).toMatchObject({ subtitle: "Book by Tue 4 May", href: "/trips/xmas/plan?stop=porto" });
  });

  it("an undated thing with no Stop and no book-by date still links to the Plan", () => {
    expect(buildStillToBook([src({ id: "x", kind: "TRANSPORT" })], "/trips/xmas")[0]).toMatchObject({ subtitle: "No date yet", href: "/trips/xmas/plan" });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/still-to-book.test.ts`. The import is unresolved.

- [ ] **Step 3: Implement** — `lib/still-to-book.ts`

```ts
/**
 * Home's "Still to book" (spec 2026-10-17 R2): every Item, Transport leg and
 * Accommodation that is To book (CONTEXT.md "Booking state"), soonest
 * book-by date first, then by when it happens, undated last. The loader
 * (lib/desktop-home-loader.ts) reads the real plan only and applies the
 * Surprise fragments, so nothing hidden from the viewer reaches here.
 *
 * PURE — no Prisma/React.
 */
import type { Route } from "next";
import type { BookingState } from "@/lib/booking-state";
import { formatDayLabel } from "@/lib/dates";
import { tripSubPath } from "@/lib/trip-path";

export type StillToBookKind = "ITEM" | "TRANSPORT" | "ACCOMMODATION";

export interface StillToBookSource {
  kind: StillToBookKind;
  id: string;
  /** An Item's title, a stay's name, a leg's "Train · A → B" (lib/money/cost-labels.ts). */
  label: string;
  bookingState: BookingState;
  bookBy: string | null;
  /** When it happens: an Item's date, a leg's departure day in its own zone, a stay's check-in. */
  date: string | null;
  /** Where it lives in the Plan: an Item's or stay's Stop, a leg's slot. */
  stopId: string | null;
}

export interface StillToBookRow {
  id: string;
  kind: StillToBookKind;
  title: string;
  subtitle: string;
  href: Route;
  bookBy: string | null;
}

export const STILL_TO_BOOK_LIMIT_PHONE = 5;
export const STILL_TO_BOOK_LIMIT_DESKTOP = 6;

const WHEN: Record<StillToBookKind, string> = { ITEM: "", TRANSPORT: "Leaves ", ACCOMMODATION: "Check-in " };

/** Ascending, nulls last. */
function byNullable(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function hrefFor(s: StillToBookSource, basePath: string): Route {
  if (s.date && s.kind !== "ACCOMMODATION") return tripSubPath(basePath, `/day/${s.date}`);
  if (s.stopId) return tripSubPath(basePath, `/plan?stop=${encodeURIComponent(s.stopId)}`);
  return tripSubPath(basePath, "/plan");
}

export function buildStillToBook(sources: StillToBookSource[], basePath: string): StillToBookRow[] {
  return sources
    .filter((s) => s.bookingState === "TO_BOOK")
    .sort((a, b) => byNullable(a.bookBy, b.bookBy) || byNullable(a.date, b.date) || a.label.localeCompare(b.label))
    .map((s) => {
      const parts = [
        s.bookBy ? `Book by ${formatDayLabel(s.bookBy)}` : null,
        s.date ? `${WHEN[s.kind]}${formatDayLabel(s.date)}` : null,
      ].filter((p): p is string => p !== null);
      return {
        id: s.id, // cuids are unique across the three tables
        kind: s.kind,
        title: s.label,
        subtitle: parts.join(" · ") || "No date yet",
        href: hrefFor(s, basePath),
        bookBy: s.bookBy,
      };
    });
}
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/still-to-book.test.ts`

- [ ] **Step 5: Task-done check**
- `npx vitest related --run lib/still-to-book.ts`
- `npx tsc --noEmit`
- `npx eslint lib/still-to-book.ts lib/still-to-book.test.ts`

- [ ] **Step 6: Commit** — message: `feat(home): the Still to book list`

---

### Task B.6: Home's loader builds Still to book (real plan, Surprise-aware)

**Files:**
- Modify: `lib/desktop-home-loader.ts`:
  - the transport select (:166-179): add `bookingState`, `bookBy`, `anchorStopId`;
  - the accommodation select (:180-183): add `bookingState`, `bookBy`;
  - the item select (:184-197): add `bookingState`, `bookBy`;
  - `HomePlanningData` (:117-130): add `stillToBook`;
  - the build, after `upcomingPayments` (:303), and the return (:362).
- Test:
  - `test/integration/still-to-book.test.ts` (create).
  - `app/(app)/trips/[tripId]/page.test.tsx`: add `stillToBook: []` to `loaderData` (:150-160 and :203-211). This is a mock rewrite.

**Interfaces:**
- Consumes:
  - `buildStillToBook`, `StillToBookRow` (B.5);
  - `resolveEndpointZones` (lib/time-display.ts:46) and `instantToZonedDateISO` (lib/tz.ts:366);
  - `ownerNames` (built at :290-299).
- Produces: `HomePlanningData.stillToBook: StillToBookRow[]`, with every row, uncapped. The components cap it.

- [ ] **Step 1: Write the failing integration test** — `test/integration/still-to-book.test.ts`

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { loadHomePlanningData, type HomeTripInput } from "@/lib/desktop-home-loader";

// Real Postgres: Home's Still to book reads the real plan only, leaves out
// Wishlist ideas and a Fork's rows, and never lists a thing inside a Surprise
// to the Traveller it's for (CONTEXT.md Surprise).
const OWNER = "it-stb-owner";
const MEMBER = "it-stb-member";
const TRIP_ID = "it-stb-trip";
const FORK_ID = "it-stb-fork";
const forMember = JSON.stringify([MEMBER]);
const TRIP: HomeTripInput = {
  id: TRIP_ID, startDate: "2027-06-01", endDate: "2027-06-10", homeCurrency: "AUD", drivingWindingFactor: 1.3, drivingAvgSpeedKph: 80,
  homeName: "Brisbane", homeLat: null, homeLng: null, homeCountryCode: "au", homeTimezone: "Australia/Brisbane", roundTrip: true, chaptersEnabled: false,
};

describe.skipIf(process.env.INTEGRATION !== "1")("Home Still to book (real Postgres)", () => {
  beforeAll(async () => {
    for (const id of [OWNER, MEMBER]) await db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@example.test`, name: id } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "IT STB", homeCurrency: "AUD", createdById: OWNER, forksEnabled: true, startDate: "2027-06-01", endDate: "2027-06-10",
        members: { create: [{ userId: OWNER, role: "owner" }, { userId: MEMBER, role: "member" }] } },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT B", createdById: OWNER } });
    await db.stop.createMany({ data: [
      { id: "it-stb-porto", tripId: TRIP_ID, name: "IT Porto", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-05", nights: 4, sortOrder: 0 },
      { id: "it-stb-secret", tripId: TRIP_ID, name: "IT Secret", timezone: "Europe/Lisbon", arriveDate: "2027-06-05", departDate: "2027-06-10", nights: 5, sortOrder: 1, surprisePlannerId: OWNER, surpriseForIds: forMember },
      { id: "it-stb-fork-stop", tripId: TRIP_ID, forkId: FORK_ID, name: "IT Fork stop", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-05", nights: 4, sortOrder: 0 },
    ] });
    const toBook = { bookingState: "TO_BOOK" as const, bookingStateSet: false };
    await db.transport.createMany({ data: [
      { id: "it-stb-leg", tripId: TRIP_ID, mode: "TRAIN", fromStopId: "it-stb-porto", toStopId: "it-stb-secret", depAt: new Date("2027-06-05T08:00:00Z"), sortOrder: 0, ...toBook, bookBy: "2027-05-01" },
      { id: "it-stb-flight", tripId: TRIP_ID, mode: "FLIGHT", depIsHome: true, toStopId: "it-stb-porto", reference: "QF1", sortOrder: 1, bookingState: "BOOKED", bookingStateSet: false },
      { id: "it-stb-fork-leg", tripId: TRIP_ID, forkId: FORK_ID, mode: "BUS", sortOrder: 0, ...toBook },
    ] });
    await db.accommodation.createMany({ data: [
      { id: "it-stb-casa", tripId: TRIP_ID, stopId: "it-stb-porto", name: "IT Casa", checkIn: "2027-06-01", checkOut: "2027-06-05", ...toBook, bookBy: "2027-05-01" },
      { id: "it-stb-hidden-stay", tripId: TRIP_ID, stopId: "it-stb-secret", name: "IT Secret hotel", checkIn: "2027-06-05", checkOut: "2027-06-10", ...toBook },
    ] });
    await db.item.createMany({ data: [
      { id: "it-stb-tour", tripId: TRIP_ID, stopId: "it-stb-porto", title: "IT Tour", category: "ACTIVITY", date: "2027-06-02", sortOrder: 0, bookingState: "TO_BOOK", bookingStateSet: true },
      { id: "it-stb-gift", tripId: TRIP_ID, stopId: "it-stb-porto", title: "IT Gift dinner", category: "FOOD", date: "2027-06-03", sortOrder: 1, bookingState: "TO_BOOK", bookingStateSet: true, surprisePlannerId: OWNER, surpriseForIds: forMember },
      { id: "it-stb-idea", tripId: TRIP_ID, title: "IT Idea", category: "FOOD", sortOrder: 2, bookingState: "TO_BOOK", bookingStateSet: true },
    ] });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("the planner sees every real-plan thing still to book, soonest book-by first; no idea, Fork row or Booked leg", async () => {
    const { stillToBook } = await loadHomePlanningData(TRIP_ID, "2027-04-20", "planning", TRIP, OWNER);
    expect(stillToBook.map((r) => r.id)).toEqual(["it-stb-casa", "it-stb-leg", "it-stb-tour", "it-stb-gift", "it-stb-hidden-stay"]);
    expect(stillToBook[1]).toMatchObject({ subtitle: "Book by Sat 1 May · Leaves Sat 5 Jun", href: expect.stringContaining("/day/2027-06-05") });
  });

  it("the Traveller a Surprise is for never sees what's inside it", async () => {
    const { stillToBook } = await loadHomePlanningData(TRIP_ID, "2027-04-20", "planning", TRIP, MEMBER);
    expect(stillToBook.map((r) => r.id)).toEqual(["it-stb-casa", "it-stb-leg", "it-stb-tour"]);
  });
});
```
The Transport leg into the Surprise Stop stays. Transport is never inside a Surprise, and a hidden Stop keeps its shell (name and legs), as the Plan shows it.

- [ ] **Step 2: Run it, expect FAIL** — `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/still-to-book.test.ts`. `stillToBook` is `undefined`.

- [ ] **Step 3: Implement** — `lib/desktop-home-loader.ts`:
- Imports: `buildStillToBook`, `type StillToBookRow` from `@/lib/still-to-book`; `resolveEndpointZones` from `@/lib/time-display`; `instantToZonedDateISO` from `@/lib/tz`.
- The selects:
  - Transport (:169-178): add `anchorStopId: true, bookingState: true, bookBy: true`.
  - Accommodation (:182): becomes `select: { id: true, stopId: true, name: true, checkIn: true, checkOut: true, bookingState: true, bookBy: true }`.
  - Item (:186-196): add `bookingState: true, bookBy: true`.
- `HomePlanningData`: add
  ```ts
  /** CONTEXT.md "Booking state": everything still To book, soonest book-by first (lib/still-to-book.ts). Real plan; nothing hidden by a Surprise. */
  stillToBook: StillToBookRow[];
  ```
- After `upcomingPayments` (:303), add the following. It filters to To book first, so the zone work only runs for the rows listed:
  ```ts
  // Still to book (spec 2026-10-17 R2): `itemRows`/`accommodations` already
  // carry the Surprise fragments; Wishlist ideas (no Stop, no date) are not in the plan.
  const tzById = new Map(allStopsRaw.map((s) => [s.id, s.timezone] as const));
  const stillToBook = buildStillToBook(
    [
      ...itemRows
        .filter((i) => i.bookingState === "TO_BOOK" && (i.stopId || i.date))
        .map((i) => ({ kind: "ITEM" as const, id: i.id, label: i.title, bookingState: i.bookingState, bookBy: i.bookBy, date: i.date, stopId: i.stopId })),
      ...transports
        .filter((t) => t.bookingState === "TO_BOOK")
        .map((t) => {
          const { depTz } = resolveEndpointZones(
            t.fromStopId ? (tzById.get(t.fromStopId) ?? null) : null,
            t.toStopId ? (tzById.get(t.toStopId) ?? null) : null,
            { depIsHome: t.depIsHome, arrIsHome: t.arrIsHome, homeTimezone: trip.homeTimezone },
          );
          return {
            kind: "TRANSPORT" as const, id: t.id, label: ownerNames.get(t.id) ?? "Transport", bookingState: t.bookingState, bookBy: t.bookBy,
            date: t.depAt ? instantToZonedDateISO(t.depAt, depTz) : null, stopId: t.anchorStopId ?? t.fromStopId ?? t.toStopId,
          };
        }),
      ...accommodations
        .filter((a) => a.bookingState === "TO_BOOK")
        .map((a) => ({ kind: "ACCOMMODATION" as const, id: a.id, label: a.name, bookingState: a.bookingState, bookBy: a.bookBy, date: a.checkIn, stopId: a.stopId })),
    ],
    base,
  );
  ```
  Add `stillToBook` to the returned object (:362).
- `page.test.tsx`: add `stillToBook: [] as unknown[]` to both `loaderData` shapes. If `components/trip/home/phase-planning.test.tsx`'s db mocks type-check against the new select, give its transport, accommodation and item fixtures `bookingState: "NONE"`. This is a mock rewrite.

- [ ] **Step 4: Run it, expect PASS** — the integration file, plus `npx vitest run "app/(app)/trips/[tripId]/page.test.tsx" components/trip/home`

- [ ] **Step 5: Task-done check**
- `npx vitest related --run lib/desktop-home-loader.ts`
- `npx tsc --noEmit`
- `npx eslint lib/desktop-home-loader.ts test/integration/still-to-book.test.ts "app/(app)/trips/[tripId]/page.test.tsx"`
- `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/still-to-book.test.ts`

- [ ] **Step 6: Commit** — message: `feat(home): load Still to book from the real plan, Surprise-aware`

---

### Task B.7: `StillToBookCard`

**Files:**
- Create: `components/trip/home/still-to-book-card.tsx`
- Test: `components/trip/home/still-to-book-card.test.tsx` (create)

**Interfaces:**
- Consumes: `StillToBookRow` (B.5); `Card` (components/ui/card.tsx); `CountBadge` (components/ui/count-badge.tsx); lucide `Plane`, `BedDouble`, `Ticket`, `ChevronRight`, `ArrowRight`
- Produces: `StillToBookCard({ rows, limit, planHref }: { rows: StillToBookRow[]; limit: number; planHref: Route })`. It returns `null` for no rows.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Route } from "next";
import { StillToBookCard } from "./still-to-book-card";
import type { StillToBookRow } from "@/lib/still-to-book";

const row = (id: string, kind: StillToBookRow["kind"] = "TRANSPORT"): StillToBookRow => ({
  id, kind, title: `Thing ${id}`, subtitle: "Book by Sat 1 May", href: `/trips/x/day/2027-06-0${id}` as Route, bookBy: "2027-05-01",
});

describe("StillToBookCard (Home, spec R2)", () => {
  it("lists each thing as a link to it, with how many there are", () => {
    render(<StillToBookCard rows={[row("1"), row("2", "ITEM")]} limit={5} planHref={"/trips/x/plan" as Route} />);
    expect(screen.getByRole("heading", { name: /still to book/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /thing 1/i })).toHaveAttribute("href", "/trips/x/day/2027-06-01");
    expect(screen.getByText("2")).toBeInTheDocument();
  });
  it("caps the rows and links the rest to the Plan", () => {
    render(<StillToBookCard rows={["1", "2", "3"].map((i) => row(i))} limit={2} planHref={"/trips/x/plan" as Route} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /1 more to book/i })).toHaveAttribute("href", "/trips/x/plan");
  });
  it("renders nothing when everything is booked", () => {
    const { container } = render(<StillToBookCard rows={[]} limit={5} planHref={"/trips/x/plan" as Route} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run components/trip/home/still-to-book-card.test.tsx`

- [ ] **Step 3: Implement** — modelled on `NextStepsCard` (components/trip/home/next-steps-card.tsx):

```tsx
import type { Route } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BedDouble, ChevronRight, Plane, Ticket } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import type { StillToBookKind, StillToBookRow } from "@/lib/still-to-book";

const ICON: Record<StillToBookKind, LucideIcon> = { TRANSPORT: Plane, ACCOMMODATION: BedDouble, ITEM: Ticket };

/**
 * Home's "Still to book" (spec 2026-10-17 R2; CONTEXT.md "Booking state"):
 * what is still To book, soonest book-by date first, each row a link to its
 * thing. Phone (Planning/Final-prep) and desktop share it; the caller sets
 * `limit`. Nothing to book, nothing shown.
 */
export function StillToBookCard({ rows, limit, planHref }: { rows: StillToBookRow[]; limit: number; planHref: Route }) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, limit);
  const more = rows.length - shown.length;
  return (
    <Card className="p-4" aria-labelledby="still-to-book-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="still-to-book-heading" className="font-display text-lg font-extrabold leading-tight tracking-[-0.03em] text-foreground">
          Still to book
        </h2>
        <CountBadge count={rows.length} />
      </div>
      <ul className="mt-1.5 flex flex-col">
        {shown.map((r) => {
          const Icon = ICON[r.kind];
          return (
            <li key={r.id}>
              <Link href={r.href} className="flex min-h-11 items-center gap-2.5 rounded-md py-1.5 transition-colors hover:bg-muted/40">
                <span aria-hidden="true" className="grid size-[34px] shrink-0 place-items-center rounded-sm border-2 border-border bg-warning text-warning-foreground">
                  <Icon className="size-4" strokeWidth={2.5} />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[15px] font-semibold text-foreground">{r.title}</span>
                  <span className="block text-xs font-medium text-muted-foreground">{r.subtitle}</span>
                </span>
                <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={2.5} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <Link href={planHref} className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-extrabold text-foreground hover:underline">
          {more} more to book <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
    </Card>
  );
}
```
Check that `CountBadge` renders its number as text. If it renders e.g. "2 items", adjust the test's `getByText`. Read components/ui/count-badge.tsx first.

- [ ] **Step 4: Run it, expect PASS**

- [ ] **Step 5: Task-done check**
- `npx vitest related --run components/trip/home/still-to-book-card.tsx`
- `npx tsc --noEmit`
- `npx eslint components/trip/home/still-to-book-card.tsx components/trip/home/still-to-book-card.test.tsx`

- [ ] **Step 6: Commit** — message: `feat(home): Still to book card`

---

### Task B.8: Still to book on Home (phone and desktop)

**Files:**
- Modify:
  - `components/trip/home/phase-planning.tsx`: read `stillToBook` (:95-97), and add an item to the tile row after Next steps (:261-273).
  - `components/trip/home/desktop/desktop-home-grid.tsx`: `DESKTOP_GRID_SPANS` (:24-35), `DesktopHomeGridProps` (:37-43) and `DesktopHomeGrid` (:45-55).
  - `app/(app)/trips/[tripId]/page.tsx`: the `<DesktopHomeGrid … />` call (:424-466).
- Test: `components/trip/home/phase-planning.test.tsx`, `components/trip/home/desktop/desktop-home-grid.test.tsx`, `app/(app)/trips/[tripId]/page.test.tsx` (extend)

**Interfaces:**
- Consumes: `StillToBookCard` (B.7); `HomePlanningData.stillToBook` (B.6); `STILL_TO_BOOK_LIMIT_PHONE`/`_DESKTOP` (B.5)
- Produces: `DesktopHomeGridProps.stillToBook?: ReactNode` (a null or absent value means no third row), and `DESKTOP_GRID_SPANS.stillToBook`.

- [ ] **Step 1: Write the failing tests**
- `desktop-home-grid.test.tsx`:
  ```tsx
  it("puts Still to book in a full-width third row, and leaves it out when there's none", () => {
    const { rerender } = render(<DesktopHomeGrid hasCover={false} countdown={<i />} cost={<i />} map={<i />} sort={<i />} stillToBook={<p>STB</p>} />);
    expect(screen.getByText("STB").parentElement).toHaveClass("col-span-12");
    rerender(<DesktopHomeGrid hasCover={false} countdown={<i />} cost={<i />} map={<i />} sort={<i />} stillToBook={null} />);
    expect(screen.queryByText("STB")).not.toBeInTheDocument();
  });
  ```
- `page.test.tsx`: set `loaderData.current.stillToBook` to one row (`{ id: "leg-1", kind: "TRANSPORT", title: "Train · A → B", subtitle: "Book by Sat 1 May", href: "/trips/trip-1/day/2026-01-04", bookBy: "2026-01-01" }`). Assert that `within(screen.getByTestId("desktop-home")).getByRole("heading", { name: /still to book/i })` is present. With `[]`, it is absent.
- `phase-planning.test.tsx`: mock the loader rows so one Item is To book. Rewrite the db mock's item row with `bookingState: "TO_BOOK", stopId: "s1", date: "2026-07-02"`. The case asserts the "Still to book" heading inside `planning-tile-row`. A second case with no To book rows asserts it's absent.

- [ ] **Step 2: Run them, expect FAIL** — `npx vitest run components/trip/home "app/(app)/trips/[tripId]/page.test.tsx"`

- [ ] **Step 3: Implement**
- `desktop-home-grid.tsx`:
  - Add `stillToBook: "col-span-12 flex min-h-0 min-w-0 flex-col",` to `DESKTOP_GRID_SPANS`. The row sits in an implicit `auto` track, so the explicit row template stays as it is.
  - Add `/** Home's Still to book (spec 2026-10-17 R2) — a full-width third row; null when nothing is To book. */ stillToBook?: ReactNode;` to the props.
  - In `DesktopHomeGrid`, after the sort cell, add `{stillToBook ? <div className={DESKTOP_GRID_SPANS.stillToBook}>{stillToBook}</div> : null}`.
- `page.tsx` (:424): add the following prop to `<DesktopHomeGrid>`, with imports for `StillToBookCard` and `STILL_TO_BOOK_LIMIT_DESKTOP`:
  ```tsx
  stillToBook={
    planning.stillToBook.length > 0 ? (
      <StillToBookCard rows={planning.stillToBook} limit={STILL_TO_BOOK_LIMIT_DESKTOP} planHref={tripPath(slug, "/plan")} />
    ) : null
  }
  ```
- `phase-planning.tsx`:
  - Destructure `stillToBook` from `loadHomePlanningData` (:95).
  - In the tile row, after the next-steps item (:262), add the block below.
  - Renumber the following `index` props (money becomes 3, actions 4) so the stagger stays in order.
  ```tsx
  {stillToBook.length > 0 ? (
    <AnimatedItem key="still-to-book" index={2}>
      <StillToBookCard rows={stillToBook} limit={STILL_TO_BOOK_LIMIT_PHONE} planHref={tripPath(slug, "/plan")} />
    </AnimatedItem>
  ) : null}
  ```

- [ ] **Step 4: Run them, expect PASS** — the Step 2 command.

- [ ] **Step 5: Task-done check**
- `npx vitest related --run components/trip/home/phase-planning.tsx components/trip/home/desktop/desktop-home-grid.tsx "app/(app)/trips/[tripId]/page.tsx"`
- `npx tsc --noEmit`
- `npx eslint <the six files>`
- `TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/still-to-book.test.ts`

- [ ] **Step 6: Commit** — message: `feat(home): Still to book on the phone and desktop Home`
## Section C — Slot time (R3)

### Notes

**Produces (for later sections and Branch 2):**
- `lib/slot-time.ts` (extends S's module, still pure and zod-free so client code imports it):
  - `startFromSlot(v: { date?: string | null; startTime?: string | null; slotTime?: string | null; arriveByMinutes?: number | null }): string | null`. This is **the one default-start rule**. An explicit start wins. With no date or no slot it returns `null`. Otherwise it returns `defaultStartFromSlot(slotTime, arriveByMinutes)`.
  - `slotLabel(v: { slotTime?: string | null; arriveByMinutes?: number | null }): string | null` gives `"Slot 12:00 · be there 11:45"`, gives `"Slot 12:00"` when the margin is 0 or null, and gives `null` with no slot.
  - `refundLabel(refundable?: string | null): string | null` gives `"Non-refundable"` for `"NO"` and `null` for anything else.
- `components/trip/slot-facts.tsx`: `<SlotFacts item={{ slotTime, arriveByMinutes, refundable }} highlight? />`. It returns a fragment of up to two `<span>`s (`data-slot-time`, `data-refund`) that sits inside an existing flex-wrap meta row. Timeline, ItemCard and the plan day row all use it.
- The view shapes gain `slotTime?: string | null; arriveByMinutes?: number | null; refundable?: Refundable | null`: `ItemCardItem` (lib/plan-entity-views.ts), `ItineraryItem` (lib/itinerary.ts), `StopDayItem` (lib/stop-days.ts) and `ThingToDo` (components/plan/types.ts). `DayItemRow` (lib/day-view-model.ts) gains them as **required** (`slotTime: string | null; arriveByMinutes: number | null; refundable: Refundable`). Branch 2's "Late for the slot" Flag can read them from `readDayRows` / `readPlan` rows with no further plumbing.
- `PlaceholderItem` (lib/surprise-visibility.ts) gains `slotTime: null; arriveByMinutes: null; refundable: "UNKNOWN"`. A Surprise placeholder never shows the ticket.
- MCP: `McpThingToDo` and `McpDayItem` (so also `McpItem` and `McpUnplacedDatedItem`) gain `slotTime: string | null`, `arriveByMinutes: number | null` and `refundable: "YES" | "NO" | "UNKNOWN"`. `MCP_THING_TO_DO_SELECT` selects them. `add_thing_to_do` and `update_thing_to_do` accept all three. `update_thing_to_do` accepts `null` on `slotTime`/`arriveByMinutes` to clear. `schedule_thing_to_do` accepts `slotTime` and `arriveByMinutes`.
- `ScheduleItemInput` (server/actions/items.ts) gains optional `slotTime` and `arriveByMinutes`.
- `ProposedItemInput` (lib/booking-import/types.ts) gains `slotTime?: string; arriveByMinutes?: number; refundable?: Refundable`. `UNCERTAIN_FIELD_NAMES` gains `"slotTime", "arriveBy", "refundable"`, which highlight card fields `slotTime` and `refundable`.
- `lib/mcp/vocab.ts`: `REFUNDABLE_MEANING: Record<Refundable, string>`.

**Assumes from section S (exact names):**
- Prisma `Item` columns: `slotTime String?` ("HH:mm", Stop-local like `startTime`), `arriveByMinutes Int?`, `refundable String @default("UNKNOWN")`.
- `lib/enum-values.ts`: `export const REFUNDABLE_VALUES = ["YES", "NO", "UNKNOWN"] as const; export type Refundable = (typeof REFUNDABLE_VALUES)[number];`. `lib/enums.ts`: `export const refundableSchema = z.enum(REFUNDABLE_VALUES);`.
- `lib/slot-time.ts`: `export function defaultStartFromSlot(slotTime: string, arriveByMinutes: number | null): string`. It returns slot minus margin as "HH:mm" and clamps at "00:00" (never the day before). `lib/slot-time.test.ts` exists.
- `lib/validations/item.ts` `itemSchema` gains three optional fields:
  - `slotTime` (`hhmm | ""`, where `""` becomes `undefined`, like `startTime`)
  - `arriveByMinutes` (an int with S's bounds, optional)
  - `refundable` (`refundableSchema.optional()`)

  **The date-less transform does NOT drop `slotTime`.** A slot is the ticket's fact, so a Wishlist idea may carry one. Only `startTime`/`endTime` are dropped. `ItemInput` therefore has `slotTime?: string`, `arriveByMinutes?: number` and `refundable?: Refundable`.
- `lib/validations/item.ts` also exports `arriveByMinutesSchema` (the same int field, reused by `scheduleDateSchema` in C.3). **If S does not export it,** C.3 adds `export const arriveByMinutesSchema = <S's field>` to lib/validations/item.ts and points `itemSchema` at it. This is the only edit C makes to S's file.
- Section A lands before C and also edits these shapes and selects (`bookingState`). Line numbers below are as of today (main + spec, 1eb7c5e2). After A they shift, but the anchors (field lists ending `booking`/`hiddenFromShares`) are unchanged.

**Decisions where the spec is silent:**
1. **The default start is computed on write, server-side, in the actions.** It runs after the schema parse, in `createItem`, `updateItem`, `scheduleItem` (both branches) and, through `ideaCopyData`, the copy-in placements. MCP and Booking import confirm go through these same actions, so every path gets the rule. Rows always hold a real `startTime`, so the Timeline sorts, the Calendar, ICS, Flags and MCP need no "effective start" logic.
2. **The default never overwrites an explicit start.** It fills only an empty start. On update, the merged row decides: a row with a start keeps it whatever the slot does. A patch that clears the start (`null`) while a slot is set re-defaults it. "When only a slot time is set, start defaults" means a dated Item with a slot always has a start. Changing the slot later does not move a start that was defaulted earlier: the server cannot tell defaulted from typed. Branch 2's "Late for the slot" Flag covers the drift. The form shows the would-be default as a hint, so nothing is hidden.
3. **No date means no default.** Times are dropped without a date (itemSchema). Scheduling the Item later (`scheduleItem` with no start) applies the default then.
4. **Copy wording.** The meta line reads `Slot 12:00 · be there 11:45`. In the dispatch example "Tour 12:00", "Tour" is the Item's title, and the title is already the row heading. "Slot" is the CONTEXT.md term ("Entry time, booking time, reservation time" are on its Avoid list). `be there` uses the derived time. Only `NO` shows a refund line ("Non-refundable"). YES and UNKNOWN say nothing, which keeps cards quiet.
5. **Placed copies and Forks carry the slot.** Scheduling or placing a Wishlist idea copies `slotTime`/`arriveByMinutes`/`refundable` onto the copy (`ideaCopyData`). A Fork copies them (`buildForkPlan`). Duplicate-trip already drops `booking` and times, and drops these with them (DB defaults). Nothing changes there.
6. **A Surprise placeholder masks the slot** (null/UNKNOWN), like `booking`. The placeholder's `startTime` already shows that the time is taken.
7. **Booking import:** the extraction gains `item.slotTime` (text), `item.arriveByMinutes` (integer) and `item.refundable` (`"yes" | "no" | null`). `build.ts` decides:
   - an arrive-by outside 1–240 is dropped
   - a `startTime` equal to the `slotTime` is dropped. It was the ticket's time reported twice. Otherwise confirm would save start 12:00 against a 12:00 slot with a 15-minute margin, which is "late for the slot" by construction. `createItem` then defaults it to slot − arrive-by.

   A start that differs from the slot (a tour that meets at 09:40 for a 10:00 entry) is kept.
8. **MCP `refundable` is not nullable** on update: `UNKNOWN` is "not known". `slotTime`/`arriveByMinutes` take `null` to clear. This is the first nullable field on `update_thing_to_do`, and its description says so.
9. **Form layout:** a native `<details>` "Ticket" disclosure, the same pattern as transport-form-dialog.tsx:716. It sits after the Start/End times and holds slot time, "Be there early" (minutes) and a Not known / Yes / No `Segmented` for refundable. It opens on load when the Item already has a slot, a margin or a known refundability, or when one of its fields has an error. When collapsed, the summary shows a muted recap (`Slot 12:00 · Non-refundable`).
10. **Not changed (candidates for follow-ups; the main session decides):**
    - the ICS calendar feed and the print page do not show the slot
    - the mobile stop sheet's day rows (components/plan/mobile/stop-sheet.tsx) do not show `SlotFacts`
    - the share page does not show the slot

    Each is a one-line `SlotFacts`/description addition if wanted.

**Proposed Resolves-Feedback:** none in this section. Branch 1's last task, written by the assembler, carries `cmvaig4j5000u07gwgeqrvtkd`.

**Review Focus candidates:**
1. **Default start on write, never overwriting.**
   - Input: `createItem` dated 2027-06-02 with `slotTime "12:00"`, `arriveByMinutes 15` and no start. Expected start `"11:45"`.
   - Input: the same with `startTime "11:00"`. Expected start `"11:00"`.
   - Input: `updateItem {slotTime: "14:00"}` on that row. Expected start stays `"11:00"`.
   - Input: `updateItem {startTime: null}`. Expected start re-defaults to `"13:45"`.
   - Input: `scheduleItem` of an idea with slot 20:00/10 and no start. Expected start on the placed copy `"19:50"`, and the copy carries the slot.

   Tested in C.2 and C.3 (unit) and C.4 (integration).
2. **Booking import does not double-report the ticket time.** Input: an extraction with `startTime "10:00"`, `slotTime "10:00"`, `arriveByMinutes 15` and `refundable "no"`. Expected proposal input: `{ slotTime: "10:00", arriveByMinutes: 15, refundable: "NO" }` with no `startTime`. A `startTime "09:40"` survives. An `arriveByMinutes` of 0 or 999 is dropped. Tested in C.11.
3. **Reads agree and a Surprise never leaks the slot.** Input: a Surprise Item with slot `19:00`, read by the surprised member. Expected: `get_day`, `get_trip_plan` and `readDayRows` show the placeholder with `slotTime: null` and `refundable: "UNKNOWN"`. For the owner, `get_item`'s day slice equals `get_trip_plan`'s, slot fields included. Tested in C.7 and C.12 (integration).

---

### Task C.1: `startFromSlot`, `slotLabel`, `refundLabel`

**Files:**
- Modify: `lib/slot-time.ts` (S's module; append)
- Test: `lib/slot-time.test.ts` (S's file; append a `describe`)

**Interfaces:**
- Consumes: `defaultStartFromSlot(slotTime: string, arriveByMinutes: number | null): string` (S)
- Produces: `startFromSlot`, `slotLabel`, `refundLabel` (signatures in Notes)

- [ ] **Step 1: Write the failing test.** Append to `lib/slot-time.test.ts`:

```ts
import { refundLabel, slotLabel, startFromSlot } from "./slot-time";

describe("startFromSlot (R3: start defaults to slot − arrive-by)", () => {
  it("an explicit start always wins", () => {
    expect(startFromSlot({ date: "2027-06-02", startTime: "11:00", slotTime: "12:00", arriveByMinutes: 15 })).toBe("11:00");
  });
  it("no start, a date and a slot: slot less the margin", () => {
    expect(startFromSlot({ date: "2027-06-02", slotTime: "12:00", arriveByMinutes: 15 })).toBe("11:45");
    expect(startFromSlot({ date: "2027-06-02", startTime: null, slotTime: "19:30", arriveByMinutes: null })).toBe("19:30");
  });
  it("no date or no slot: no start", () => {
    expect(startFromSlot({ date: null, slotTime: "12:00", arriveByMinutes: 15 })).toBeNull();
    expect(startFromSlot({ date: "2027-06-02", slotTime: null, arriveByMinutes: 15 })).toBeNull();
    expect(startFromSlot({})).toBeNull();
  });
});

describe("slotLabel / refundLabel", () => {
  it("reads the slot and when to be there", () => {
    expect(slotLabel({ slotTime: "12:00", arriveByMinutes: 15 })).toBe("Slot 12:00 · be there 11:45");
    expect(slotLabel({ slotTime: "12:00", arriveByMinutes: 0 })).toBe("Slot 12:00");
    expect(slotLabel({ slotTime: "12:00", arriveByMinutes: null })).toBe("Slot 12:00");
    expect(slotLabel({ slotTime: null, arriveByMinutes: 15 })).toBeNull();
    expect(slotLabel({})).toBeNull();
  });
  it("only a non-refundable ticket says so", () => {
    expect(refundLabel("NO")).toBe("Non-refundable");
    expect(refundLabel("YES")).toBeNull();
    expect(refundLabel("UNKNOWN")).toBeNull();
    expect(refundLabel(null)).toBeNull();
    expect(refundLabel(undefined)).toBeNull();
  });
});
```

(If the file already imports from `./slot-time`, merge the named imports into that line instead of adding a second import.)

- [ ] **Step 2: Run it and expect FAIL.** Run `npx vitest run lib/slot-time.test.ts`. It fails with `startFromSlot is not a function` (and the same for `slotLabel`/`refundLabel`).

- [ ] **Step 3: Implement.** Append to `lib/slot-time.ts`:

```ts
/**
 * The one default-start rule (spec 2026-10-17 R3): the Item's start time is
 * the Traveller's plan; when only a slot time is set, start defaults to the
 * slot less the arrive-by margin. An explicit start always wins; with no date
 * (times are dropped) or no slot there is none. The actions apply it on write
 * (server/actions/items.ts), so every row holds a real start.
 */
export function startFromSlot(v: {
  date?: string | null;
  startTime?: string | null;
  slotTime?: string | null;
  arriveByMinutes?: number | null;
}): string | null {
  if (v.startTime) return v.startTime;
  if (!v.date || !v.slotTime) return null;
  return defaultStartFromSlot(v.slotTime, v.arriveByMinutes ?? null);
}

/** "Slot 12:00 · be there 11:45" — or "Slot 12:00" with no margin; null with no slot. */
export function slotLabel(v: { slotTime?: string | null; arriveByMinutes?: number | null }): string | null {
  if (!v.slotTime) return null;
  if (!v.arriveByMinutes) return `Slot ${v.slotTime}`;
  return `Slot ${v.slotTime} · be there ${defaultStartFromSlot(v.slotTime, v.arriveByMinutes)}`;
}

/** Only a non-refundable ticket is worth a line; Yes and Not known stay quiet. */
export function refundLabel(refundable?: string | null): string | null {
  return refundable === "NO" ? "Non-refundable" : null;
}
```

- [ ] **Step 4: Run it and expect PASS.** Run `npx vitest run lib/slot-time.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/slot-time.ts`, then `npx tsc --noEmit`, then `npx eslint lib/slot-time.ts lib/slot-time.test.ts`.
- [ ] **Step 6: Commit.** Commit `lib/slot-time.ts` and `lib/slot-time.test.ts` with the message `feat(slot-time): startFromSlot default rule and slot/refund labels`.

---

### Task C.2: `createItem` / `updateItem` write the slot fields and default the start

**Files:**
- Modify: `server/actions/items.ts:7` (import), `:183-201` (createItem `db.item.create` data), `:352-361` (updateItem current values), `:397-412` (updateItem `auditedUpdate` data)
- Test: `server/actions/items.test.ts` (append two `describe`s after `:751`)

**Interfaces:**
- Consumes: `startFromSlot` (C.1). `itemSchema` fields `slotTime`, `arriveByMinutes` and `refundable` (S).
- Produces: `createItem`/`updateItem` persist `slotTime`, `arriveByMinutes` and `refundable` (default `"UNKNOWN"`), and write `startTime: startFromSlot(data)`.

- [ ] **Step 1: Write the failing test.** Append to `server/actions/items.test.ts`:

```ts
describe("createItem: Slot time (R3)", () => {
  beforeEach(() => {
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "item-1", title: "Lodge tour" });
  });
  it("persists the slot fields; refundable defaults to UNKNOWN", async () => {
    await createItem("trip-1", { ...VALID_INPUT, slotTime: "12:00", arriveByMinutes: 15 });
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ slotTime: "12:00", arriveByMinutes: 15, refundable: "UNKNOWN", startTime: null }),
    });
  });
  it("a dated Item with a slot and no start starts at slot − arrive-by", async () => {
    await createItem("trip-1", { ...VALID_INPUT, date: "2027-06-02", slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" });
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ date: "2027-06-02", startTime: "11:45", slotTime: "12:00", refundable: "NO" }),
    });
  });
  it("never overwrites an explicit start", async () => {
    await createItem("trip-1", { ...VALID_INPUT, date: "2027-06-02", startTime: "11:00", slotTime: "12:00", arriveByMinutes: 15 });
    expect(itemCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ startTime: "11:00" }) });
  });
});

describe("updateItem: Slot time (R3, PATCH)", () => {
  const row = {
    id: "item-1", tripId: "trip-1", forkId: null, stopId: null, title: "Lodge tour", category: "ACTIVITY", date: "2027-06-02",
    startTime: "11:00", endTime: null, address: null, link: null, booking: null, notes: null, hiddenFromShares: false,
    slotTime: "12:00", arriveByMinutes: 15, refundable: "NO",
  };
  beforeEach(() => {
    itemFindUniqueMock.mockResolvedValue(row);
    itemUpdateMock.mockResolvedValue(row);
  });
  it("a notes-only patch keeps the slot fields", async () => {
    await updateItem("item-1", { notes: "x" });
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "item-1" }, data: expect.objectContaining({
      slotTime: "12:00", arriveByMinutes: 15, refundable: "NO", startTime: "11:00",
    }) });
  });
  it("moving the slot keeps an existing start", async () => {
    await updateItem("item-1", { slotTime: "14:00" });
    expect(itemUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ slotTime: "14:00", startTime: "11:00" }) }));
  });
  it("clearing the start with a slot set re-defaults it", async () => {
    await updateItem("item-1", { startTime: null });
    expect(itemUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ startTime: "11:45" }) }));
  });
  it("null clears the slot and the margin", async () => {
    await updateItem("item-1", { slotTime: null, arriveByMinutes: null });
    expect(itemUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ slotTime: null, arriveByMinutes: null, startTime: "11:00" }) }));
  });
});
```

- [ ] **Step 2: Run it and expect FAIL.** Run `npx vitest run server/actions/items.test.ts -t "Slot time"`. It fails because `data` lacks `slotTime`/`refundable` and the dated case writes `startTime: null`.

- [ ] **Step 3: Implement** in `server/actions/items.ts`:
  - Add the import after `:7`: `import { startFromSlot } from "@/lib/slot-time";`
  - In the createItem create data (`:190`), replace `startTime: data.startTime ?? null,` with `startTime: startFromSlot(data),`. After `hiddenFromShares: data.hiddenFromShares ?? false,` (`:200`), add:

    ```ts
          // CONTEXT.md "Slot time" (R3): the ticket's fact; start (above) defaults from it.
          slotTime: data.slotTime ?? null,
          arriveByMinutes: data.arriveByMinutes ?? null,
          refundable: data.refundable ?? "UNKNOWN",
    ```

  - In the updateItem current values (`:354-357`), append to the object passed as `applyPatch`'s first argument:

    ```ts
            slotTime: before.slotTime, arriveByMinutes: before.arriveByMinutes,
            refundable: before.refundable as ItemInput["refundable"],
    ```

  - In the updateItem `auditedUpdate` data (`:402`), replace `startTime: data.startTime ?? null,` with `startTime: startFromSlot(data),`. After `hiddenFromShares: data.hiddenFromShares ?? false,` (`:411`), add the same three slot lines as createItem.
  - Extend the updateItem doc comment (`:320-335`) with one line: `Slot time (R3): an empty start on a dated Item with a slot defaults to slot − arrive-by (startFromSlot); an existing start is never moved.`

- [ ] **Step 4: Run it and expect PASS.** Run `npx vitest run server/actions/items.test.ts` (the whole file, because the existing PATCH tests use `objectContaining` and must stay green).
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run server/actions/items.ts`, then `npx tsc --noEmit`, then `npx eslint server/actions/items.ts server/actions/items.test.ts`.
- [ ] **Step 6: Commit.** Commit `server/actions/items.ts` and `server/actions/items.test.ts` with the message `feat(items): persist Slot time; start defaults to slot − arrive-by on write`.

---

### Task C.3: `scheduleItem` accepts the slot and defaults the start; placed copies carry the slot

**Files:**
- Modify: `server/actions/items.ts:510-538` (`scheduleDateSchema`), `:599-627` (`ideaCopyData` param type and return), `:653` (destructure), `:685-699` (copy-in create), `:716-724` (in-place update)
- Possibly modify `lib/validations/item.ts` (only if S did not export `arriveByMinutesSchema`; see Notes)
- Test: `server/actions/items.test.ts` (append after the existing `describe("scheduleItem")`)

**Interfaces:**
- Consumes: `startFromSlot` (C.1). `arriveByMinutesSchema` (S, lib/validations/item.ts). `hhmm` (lib/validations/primitives.ts).
- Produces: `ScheduleItemInput = { date; startTime?; endTime?; slotTime?; arriveByMinutes? }`. `ideaCopyData` copies `slotTime`, `arriveByMinutes` and `refundable`.

- [ ] **Step 1: Write the failing test.**

```ts
describe("scheduleItem: Slot time (R3)", () => {
  const idea = {
    id: "item-1", tripId: "trip-1", forkId: null, date: null, stopId: null, title: "Fado night", category: "NIGHTLIFE",
    slotTime: "20:00", arriveByMinutes: 10, refundable: "NO", photoAttachmentId: null,
  };
  it("a placed copy carries the idea's slot and starts at slot − arrive-by when no start is given", async () => {
    itemFindUniqueMock.mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" }).mockResolvedValueOnce(idea);
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "placed-1", title: "Fado night" });
    await scheduleItem("item-1", { date: "2027-06-02" }, null);
    expect(itemCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({
      sourceItemId: "item-1", date: "2027-06-02", startTime: "19:50", slotTime: "20:00", arriveByMinutes: 10, refundable: "NO",
    }) });
  });
  it("a slot given to the schedule call wins over the idea's, and an explicit start is kept", async () => {
    itemFindUniqueMock.mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" }).mockResolvedValueOnce(idea);
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "placed-1" });
    await scheduleItem("item-1", { date: "2027-06-02", startTime: "19:00", slotTime: "21:00" }, null);
    expect(itemCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ startTime: "19:00", slotTime: "21:00" }) });
  });
  it("an in-place move with no start defaults it from the row's slot; slot fields are written only when sent", async () => {
    const placed = { ...idea, id: "placed-1", date: "2027-06-01", stopId: null, startTime: null };
    itemFindUniqueMock.mockResolvedValueOnce({ id: "placed-1", tripId: "trip-1" }).mockResolvedValueOnce(placed);
    itemUpdateMock.mockResolvedValue({ ...placed, date: "2027-06-02", startTime: "19:50" });
    await scheduleItem("placed-1", { date: "2027-06-02" }, null);
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "placed-1" }, data: { date: "2027-06-02", stopId: null, startTime: "19:50", endTime: null } });
  });
  it("placeIdeaAtStop copies the slot fields (no date, so no start)", async () => {
    itemFindUniqueMock.mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" }).mockResolvedValueOnce(idea);
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-1", forkId: null });
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "placed-2" });
    await placeIdeaAtStop("item-1", "stop-1", null);
    expect(itemCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ startTime: null, slotTime: "20:00", arriveByMinutes: 10, refundable: "NO" }) });
  });
});
```

(Before running, check `placeIdeaAtStop`'s stop lookup at `:748-800`. If it reads the Stop through a mock other than `stopFindUniqueMock`, seed that mock the way the existing `placeIdeaAtStop` tests in this file do.)

- [ ] **Step 2: Run it and expect FAIL.** Run `npx vitest run server/actions/items.test.ts -t "scheduleItem: Slot time"`. It fails because the copies lack the slot fields and the starts are `null`.

- [ ] **Step 3: Implement.**
  - In `scheduleDateSchema` (`:510-515`), extend the object:

    ```ts
      .object({
        date: isoDate,
        startTime: hhmm.optional(),
        endTime: hhmm.optional(),
        // CONTEXT.md "Slot time" (R3): scheduling a ticket may name its slot.
        slotTime: hhmm.optional(),
        arriveByMinutes: arriveByMinutesSchema.optional(),
      })
    ```

    Import `arriveByMinutesSchema` on the `itemSchema` import line (`:7`).
  - In `ideaCopyData`, add `slotTime: string | null; arriveByMinutes: number | null; refundable: string | null;` to the param type. Add to the returned object:

    ```ts
        // A ticket's facts follow the idea onto its placed copy (R3).
        slotTime: fullItem.slotTime ?? null,
        arriveByMinutes: fullItem.arriveByMinutes ?? null,
        refundable: fullItem.refundable ?? "UNKNOWN",
    ```

  - At `:653`: `const { date, startTime, endTime, slotTime, arriveByMinutes } = parsed.data;` and, after the full-row fetch, `const slot = { slotTime: slotTime ?? fullItem.slotTime, arriveByMinutes: arriveByMinutes ?? fullItem.arriveByMinutes };`
  - In the copy-in create data (`:688-697`), after `...ideaCopyData(fullItem),` replace `startTime: startTime ?? null,` with:

    ```ts
            startTime: startFromSlot({ date, startTime, ...slot }),
            slotTime: slot.slotTime ?? null,
            arriveByMinutes: slot.arriveByMinutes ?? null,
    ```

  - In the in-place update data (`:718-723`), replace `startTime: startTime ?? null,` with `startTime: startFromSlot({ date, startTime, ...slot }),` and append `...(slotTime !== undefined && { slotTime }), ...(arriveByMinutes !== undefined && { arriveByMinutes }),`. The existing exact-`data` test at items.test.ts:894-920 stays green.
  - Extend the `scheduleItem` doc comment: `With no start, a slot (the call's, else the row's) sets it: slot − arrive-by (R3).`

- [ ] **Step 4: Run it and expect PASS.** Run `npx vitest run server/actions/items.test.ts server/actions/items.reschedule.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run server/actions/items.ts lib/validations/item.ts`, then `npx tsc --noEmit`, then `npx eslint server/actions/items.ts server/actions/items.test.ts`.
- [ ] **Step 6: Commit.** Commit `server/actions/items.ts`, `server/actions/items.test.ts` (and `lib/validations/item.ts` if touched) with the message `feat(items): scheduling takes a slot; placed copies carry it and default their start`.

---

### Task C.4: Integration test for the default-start rule

**Files:**
- Create: `test/integration/slot-time.test.ts`

**Interfaces:**
- Consumes: `createItem`, `updateItem`, `scheduleItem` (C.2, C.3), and S's migration applied to the sandbox DB.
- Produces: none

- [ ] **Step 1: Write the test.** It proves the rule against the real columns. It must pass once C.2/C.3 are in. If S's migration is not applied it fails, and that failure is the red step.

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// R3 against the real Postgres: the slot columns exist, the default start is
// written on create/update/schedule, and an explicit start is never moved.
// Mocks as test/integration/patch-updates.test.ts: only the Next/auth boundary,
// the network and Activity; the actions and Prisma run for real.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: vi.fn(async () => null), geocodePlaceDetailed: vi.fn(async () => null) }));
vi.mock("@/lib/money/fx", () => ({ resolveRateForTrip: vi.fn(async () => ({ rate: 1, persist: null })), persistRate: vi.fn(async () => undefined) }));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-slot-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-slot-user" }, membership: { role: "owner" } })),
  requirePlanAccess: vi.fn(async (_t: string, forkId?: string | null) => ({ user: { id: "it-slot-user" }, membership: { role: "owner" }, plan: forkId ?? null })),
  requireRowAccess: vi.fn(async (kind: string, id: string) => {
    const { db } = await import("@/lib/db");
    const delegate = (db as unknown as Record<string, { findUnique(a: unknown): Promise<unknown> }>)[kind];
    const row = await delegate.findUnique({ where: { id } });
    if (!row) throw new Error("NOT_FOUND");
    return { row, user: { id: "it-slot-user" }, membership: { role: "owner" }, surpriseOf: null };
  }),
}));
vi.mock("@/lib/surprise-guard", async () => ({
  ...(await vi.importActual<object>("@/lib/surprise-guard")),
  requireOutsideSurprise: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { createItem, scheduleItem, updateItem } from "@/server/actions/items";

const TRIP_ID = "it-trip-slot";
const row = (id: string) => db.item.findUniqueOrThrow({ where: { id }, select: { startTime: true, slotTime: true, arriveByMinutes: true, refundable: true, date: true } });

describe.skipIf(process.env.INTEGRATION !== "1")("Slot time: start defaults to slot − arrive-by on write (R3, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: "it-slot-user" }, update: {}, create: { id: "it-slot-user", email: "it-slot-user@example.test", name: "Slot User", isEmailVerified: true } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "Slot trip", homeCurrency: "AUD", startDate: "2027-06-01", endDate: "2027-06-07", createdById: "it-slot-user",
        members: { create: { userId: "it-slot-user", role: "owner" } } },
    });
  });
  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("create: no start → slot − arrive-by; refundable defaults to UNKNOWN", async () => {
    const r = await createItem(TRIP_ID, { title: "Lodge tour", category: "ACTIVITY", date: "2027-06-02", slotTime: "12:00", arriveByMinutes: 15 });
    if (!r.success) throw new Error(JSON.stringify(r.errors));
    expect(await row(r.id)).toEqual({ date: "2027-06-02", startTime: "11:45", slotTime: "12:00", arriveByMinutes: 15, refundable: "UNKNOWN" });
  });

  it("create: an explicit start is kept; update: moving the slot keeps it, clearing it re-defaults", async () => {
    const r = await createItem(TRIP_ID, { title: "Sitting", category: "FOOD", date: "2027-06-03", startTime: "19:00", slotTime: "19:30", arriveByMinutes: 10, refundable: "NO" });
    if (!r.success) throw new Error(JSON.stringify(r.errors));
    expect(await row(r.id)).toMatchObject({ startTime: "19:00", refundable: "NO" });
    expect(await updateItem(r.id, { slotTime: "20:00" })).toEqual({ success: true });
    expect(await row(r.id)).toMatchObject({ startTime: "19:00", slotTime: "20:00" });
    expect(await updateItem(r.id, { startTime: null })).toEqual({ success: true });
    expect(await row(r.id)).toMatchObject({ startTime: "19:50" });
  });

  it("an undated idea keeps its slot and no start; scheduling it defaults the placed copy's start", async () => {
    const idea = await createItem(TRIP_ID, { title: "Fado night", category: "NIGHTLIFE", slotTime: "21:00", arriveByMinutes: 30 });
    if (!idea.success) throw new Error(JSON.stringify(idea.errors));
    expect(await row(idea.id)).toMatchObject({ date: null, startTime: null, slotTime: "21:00" });
    const placed = await scheduleItem(idea.id, { date: "2027-06-04" });
    if (!placed.success || !placed.placedItemId) throw new Error("expected a placed copy");
    expect(await row(placed.placedItemId)).toEqual({ date: "2027-06-04", startTime: "20:30", slotTime: "21:00", arriveByMinutes: 30, refundable: "UNKNOWN" });
  });
});
```

- [ ] **Step 2: Run it.** Use the sandbox DB:

  ```bash
  export DATABASE_URL="postgresql://trip:trip@localhost:5432/trip?schema=public" DIRECT_URL="$DATABASE_URL"
  npx prisma migrate deploy && npx vitest run --config vitest.integration.config.ts test/integration/slot-time.test.ts
  ```

  If Postgres is down, start it first with `/tmp/claude-1000/-work/9a77e9b0-ef00-4a02-8c0f-84c338d2470c/scratchpad/pg/start.sh`. If C.2/C.3 were reverted, this fails on `startTime: null`.
- [ ] **Step 3: Implement.** Nothing to implement: the test covers C.2 and C.3.
- [ ] **Step 4: Run it and expect PASS.** Use the same command as Step 2.
- [ ] **Step 5: Task-done check.** Run `npx tsc --noEmit` and `npx eslint test/integration/slot-time.test.ts`, plus the integration file above.
- [ ] **Step 6: Commit.** Commit `test/integration/slot-time.test.ts` with the message `test(items): integration — Slot time default start on create, update and schedule`.

---

### Task C.5: Activity diffs name the slot fields

**Files:**
- Modify: `lib/activity.ts:172-179` (`FIELD_SPECS.ITEM`)
- Test: `lib/activity.test.ts` (append)

**Interfaces:**
- Consumes: `describeChanges(entityType, before, after)` (lib/activity.ts:250)
- Produces: ITEM diffs for `slotTime` ("Slot time"), `arriveByMinutes` ("Be there early", formatted `"15 min"`) and `refundable` ("Refundable", formatted Yes / No / Not known).

- [ ] **Step 1: Write the failing test.**

```ts
describe("describeChanges ITEM: Slot time (R3)", () => {
  it("names the slot, the margin and refundability in plain words", () => {
    expect(
      describeChanges(
        "ITEM",
        { title: "Tour", slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN" },
        { title: "Tour", slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" },
      ).map((c) => [c.label, c.from, c.to]),
    ).toEqual([
      ["Slot time", "", "12:00"],
      ["Be there early", "", "15 min"],
      ["Refundable", "Not known", "No"],
    ]);
  });
  it("an unchanged slot is no change", () => {
    expect(describeChanges("ITEM", { slotTime: "12:00", refundable: "YES" }, { slotTime: "12:00", refundable: "YES" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and expect FAIL.** Run `npx vitest run lib/activity.test.ts -t "Slot time"`. It fails with `[]` returned instead of the three diffs.
- [ ] **Step 3: Implement.** In `FIELD_SPECS.ITEM`, after `{ key: "address", label: "Address" },`:

```ts
    // CONTEXT.md "Slot time" (R3)
    { key: "slotTime", label: "Slot time" },
    { key: "arriveByMinutes", label: "Be there early", format: (v) => (isEmpty(v) ? "" : `${v} min`) },
    { key: "refundable", label: "Refundable", format: (v) => (v === "YES" ? "Yes" : v === "NO" ? "No" : "Not known") },
```

(`isEmpty` is the module's existing helper used by `describeChanges`. If its name differs, use whatever `moneyFormat` at `:155` uses.)
- [ ] **Step 4: Run it and expect PASS.** Run `npx vitest run lib/activity.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/activity.ts`, then `npx tsc --noEmit`, then `npx eslint lib/activity.ts lib/activity.test.ts`.
- [ ] **Step 6: Commit.** Commit `lib/activity.ts` and `lib/activity.test.ts` with the message `feat(activity): Item diffs name the slot time, margin and refundability`.

---

### Task C.6: A Fork copies the slot fields

**Files:**
- Modify: `lib/fork-plan.ts:97-120` (`ForkSourceItem`), `:222-240` (the `items[].data` type), `:304-315` (the `items` mapping)
- Test: `lib/fork-plan.test.ts` (append)

**Interfaces:**
- Consumes: `buildForkPlan(source)` (lib/fork-plan.ts)
- Produces: `plan.items[].data` carries `slotTime`, `arriveByMinutes` and `refundable`. `server/actions/forks.ts:192` spreads `...it.data` into `tx.item.create`, so nothing changes there.

- [ ] **Step 1: Write the failing test.**

```ts
it("carries an Item's Slot time into the variant; a missing one copies as none / UNKNOWN (R3)", () => {
  const slotted = buildForkPlan({ ...source, items: [{ ...source.items[0], slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" }] });
  expect(slotted.items[0].data).toMatchObject({ slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" });
  expect(buildForkPlan(source).items[0].data).toMatchObject({ slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN" });
});
```

- [ ] **Step 2: Run it and expect FAIL.** Run `npx vitest run lib/fork-plan.test.ts`. It fails with the `slotTime` key missing (and a TS excess-property error under tsc).
- [ ] **Step 3: Implement.**
  - In `ForkSourceItem`, after `hiddenFromShares?: boolean;`, add `/** CONTEXT.md "Slot time" — the ticket's facts travel with the Item. */ slotTime?: string | null; arriveByMinutes?: number | null; refundable?: string | null;`
  - In the `data` type, add `slotTime: string | null; arriveByMinutes: number | null; refundable: string;`
  - In the mapping, after `hiddenFromShares: it.hiddenFromShares ?? false,`, add `slotTime: it.slotTime ?? null, arriveByMinutes: it.arriveByMinutes ?? null, refundable: it.refundable ?? "UNKNOWN",`
- [ ] **Step 4: Run it and expect PASS.** Run `npx vitest run lib/fork-plan.test.ts`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/fork-plan.ts`, then `npx tsc --noEmit`, then `npx eslint lib/fork-plan.ts lib/fork-plan.test.ts`.
- [ ] **Step 6: Commit.** Commit `lib/fork-plan.ts` and `lib/fork-plan.test.ts` with the message `feat(forks): a Fork copies an Item's Slot time`.

---

### Task C.7: The plan and day reads carry the slot fields; Surprise placeholders mask them

**Files:**
- Modify: `lib/surprise-visibility.ts:17-39` (`PlaceholderItem`), `:161-185` (the placeholder map)
- Modify: `lib/plan-reads.ts:90-110` (`PLAN_ITEM_SELECT`)
- Modify: `lib/day-reads.ts:71-74` (dated item select), `:129-133` (placeholder row)
- Modify: `lib/day-view-model.ts:163-168` (`DayItemRow`), `:266-270` (the `buildItinerary` items mapping)
- Modify: `lib/itinerary.ts:29-47` (`ItineraryItem`)
- Modify: `lib/stop-days.ts:22-40` (`StopDayItem`)
- Fixtures: `lib/day-view-model.test.ts:127-131` (`item()` builder), `lib/mcp/reads/day.test.ts:11-14` (`itemRow()`), `lib/mcp/reads/plan-shapes.test.ts:63-67` (placeholder literal): each gains `slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN"` (the builders before `...o`).
- Test: `lib/surprise-visibility.test.ts:185-206` (extend the `toMatchObject`), `lib/day-view-model.test.ts` (append), `test/integration/day-reads.test.ts`, `test/integration/plan-reads.test.ts`

**Interfaces:**
- Consumes: `Refundable` (S, lib/enum-values.ts)
- Produces:
  - `DayItemRow.{slotTime: string | null; arriveByMinutes: number | null; refundable: Refundable}`
  - `ItineraryItem` and `StopDayItem` with `slotTime?`, `arriveByMinutes?` and `refundable?` (all `| null`)
  - `PlaceholderItem` masked (`null`, `null`, `"UNKNOWN"`)
  - `readPlan(...).items[*]` and `readDayRows(...).rows.items[*]` carry them
  - `buildDayModel(...)`'s day plan items carry them

- [ ] **Step 1: Write the failing tests.**
  - In `lib/surprise-visibility.test.ts`, inside the existing case-5 `toMatchObject` (`:185-206`), add `slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN",`.
  - Append to `lib/day-view-model.test.ts`, inside the describe that owns `item()` and `rows()`:

    ```ts
    it("a day's Items carry their Slot time to the Timeline (R3)", () => {
      const model = buildDayModel(rows({ items: [item({ id: "i-slot", date: "2026-12-11", startTime: "11:45", slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" })] }), "2026-12-11");
      const entry = model.dayPlan!.timedItems.find((e) => e.item.id === "i-slot")!;
      expect(entry.item).toMatchObject({ slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" });
    });
    ```

    (Use the date inside the fixture Stop's stay and the model's real day-plan field name. Read `buildDayModel`'s return type at `lib/day-view-model.ts:282+`, and mirror an existing test in this file that reads `timedItems`.)
  - In `test/integration/day-reads.test.ts`, give `it-dr-tram` `slotTime: "10:00", arriveByMinutes: 15, refundable: "NO"` and `it-dr-dinner` `slotTime: "19:45", refundable: "NO"` (both at `:46-48`). Then append:

    ```ts
    it("the slot fields come back for a seen Item and are masked on a placeholder (R3)", async () => {
      const member = await readDayRows(TRIP_ID, MEMBER, none);
      if (typeof member === "string") throw new Error(member);
      expect(member.rows.items.find((i) => i.id === "it-dr-tram")).toMatchObject({ slotTime: "10:00", arriveByMinutes: 15, refundable: "NO" });
      expect(member.rows.items.find((i) => i.id === "it-dr-dinner")).toMatchObject({ title: "Surprise", slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN" });
      const planner = await readDayRows(TRIP_ID, PLANNER, none);
      if (typeof planner === "string") throw new Error(planner);
      expect(planner.rows.items.find((i) => i.id === "it-dr-dinner")).toMatchObject({ slotTime: "19:45", refundable: "NO" });
    });
    ```

    The existing "nothing from inside" `JSON.stringify` assertion (`:85`) still holds.
  - In `test/integration/plan-reads.test.ts`, append:

    ```ts
    it("an Item's Slot time comes back in readPlan's items (R3)", async () => {
      await db.item.create({ data: { id: "it-plan-slot", tripId: TRIP_ID, stopId: STOP_A, title: "IT Lodge tour", category: "ACTIVITY", date: "2027-06-02", startTime: "11:45", slotTime: "12:00", arriveByMinutes: 15, refundable: "NO", sortOrder: 0 } });
      const rows = await readPlan(TRIP_ID, OWNER, null);
      expect(rows.items.find((i) => i.id === "it-plan-slot")).toMatchObject({ slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" });
    });
    ```

- [ ] **Step 2: Run them and expect FAIL.** Run `npx vitest run lib/surprise-visibility.test.ts lib/day-view-model.test.ts`. They fail with the missing keys. Then run the two integration files with the C.4 command. They fail because `readPlan`/`readDayRows` do not select the columns.

- [ ] **Step 3: Implement.**
  - `PlaceholderItem`: after `notes: null;`, add `slotTime: null; arriveByMinutes: null; refundable: "UNKNOWN"; // masked like booking: the placeholder's startTime already shows the time is taken`. In the map (`:174-177`), after `notes: null,`, add `slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN" as const,`.
  - `PLAN_ITEM_SELECT`: after `booking: true,`, add `slotTime: true, arriveByMinutes: true, refundable: true,`.
  - `lib/day-reads.ts:73`: after `booking: true,`, add `slotTime: true, arriveByMinutes: true, refundable: true,`. In the placeholder row (`:131`), after `booking: p.booking,`, add `slotTime: p.slotTime, arriveByMinutes: p.arriveByMinutes, refundable: p.refundable,`.
  - `DayItemRow`: after `booking: string | null;`, add `slotTime: string | null; arriveByMinutes: number | null; refundable: Refundable;` (`import type { Refundable } from "@/lib/enum-values";`). The `refundable` column is a Prisma `String`, so the day-reads row map casts it: in `itemRows.map((it) => ({ ...it, refundable: it.refundable as Refundable, surprise: … }))` at `:128`.
  - `lib/day-view-model.ts:268`: after `booking: i.booking,`, add `slotTime: i.slotTime, arriveByMinutes: i.arriveByMinutes, refundable: i.refundable,`.
  - `ItineraryItem` and `StopDayItem`: after `booking?: string | null;`, add

    ```ts
      /** CONTEXT.md "Slot time" — the ticket's time, how early to be there, and whether it can be refunded. */
      slotTime?: string | null;
      arriveByMinutes?: number | null;
      refundable?: Refundable | null;
    ```

    with `import type { Refundable } from "@/lib/enum-values";`.
  - Fixtures as listed under **Files**.

- [ ] **Step 4: Run them and expect PASS.** Run `npx vitest run lib/surprise-visibility.test.ts lib/day-view-model.test.ts lib/day-reads.test.ts lib/plan-reads.test.ts lib/mcp/reads/day.test.ts lib/mcp/reads/plan-shapes.test.ts`, plus both integration files.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/surprise-visibility.ts lib/plan-reads.ts lib/day-reads.ts lib/day-view-model.ts lib/itinerary.ts lib/stop-days.ts`, then `npx tsc --noEmit`, then `npx eslint` on the changed files, plus `test/integration/day-reads.test.ts` and `test/integration/plan-reads.test.ts`.
- [ ] **Step 6: Commit.** Commit the files above with the message `feat(reads): plan and day reads carry Slot time; Surprise placeholders mask it`.

---

### Task C.8: The edit dialog's sources carry the slot fields (so an edit never clears them)

The form (C.10) sends `slotTime`/`arriveByMinutes` as clearable, so every route into `ItemFormDialog` must hand it the saved values. Otherwise an edit of an Item's title would null its slot. This task makes sure each source carries them before the form starts sending them.

**Files:**
- Modify: `lib/plan-entity-views.ts:11-32` (`ItemCardItem`)
- Modify: `components/plan/types.ts:36-54` (`ThingToDo`), `:57-74` (`toItemCardItem`)
- Modify: `app/(app)/trips/[tripId]/wishlist/page.tsx:80-96` (select), `:297-314` (map)
- Modify: `app/(app)/trips/[tripId]/calendar/page.tsx:113-127` (agenda `items` map)
- Test: `components/plan/types.test.ts` (create if absent; otherwise append)

The sources that spread whole rows need no edit and flow through after C.7:
- the plan page (`app/(app)/trips/[tripId]/plan/page.tsx:256-263` spreads `...rest` of `readPlan` rows into `StopDayItem`/`ThingToDo` props, then `toItemCardItem`)
- the Day view editor (`lib/day-view-loader.ts:234` spreads `DayItemRow`)
- the Booking import (`initialValues`, C.11)

**Interfaces:**
- Consumes: C.7's `StopDayItem` fields
- Produces: `ItemCardItem.{slotTime?, arriveByMinutes?, refundable?}`. `toItemCardItem` copies them.

- [ ] **Step 1: Write the failing test.** `components/plan/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toItemCardItem } from "./types";

describe("toItemCardItem", () => {
  it("hands the edit dialog the Item's Slot time, so saving another field never clears it (R3)", () => {
    expect(
      toItemCardItem({ id: "i1", title: "Tour", category: "ACTIVITY", date: "2027-06-02", startTime: "11:45", slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" }),
    ).toMatchObject({ slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" });
    expect(toItemCardItem({ id: "i2", title: "Walk", category: "OTHER" })).toMatchObject({ slotTime: null, arriveByMinutes: null, refundable: null });
  });
});
```

- [ ] **Step 2: Run it and expect FAIL.** Run `npx vitest run components/plan/types.test.ts`. It fails with the `slotTime` key missing.
- [ ] **Step 3: Implement.**
  - In `ItemCardItem` and `ThingToDo`, after `booking?: string | null;`, add the same three optional fields and doc line as C.7 (`import type { Refundable } from "@/lib/enum-values";`; components may import lib types).
  - In `toItemCardItem`, after `booking: it.booking ?? null,`, add `slotTime: it.slotTime ?? null, arriveByMinutes: it.arriveByMinutes ?? null, refundable: it.refundable ?? null,`.
  - In the wishlist select, after `booking: true,`, add `slotTime: true, arriveByMinutes: true, refundable: true,`. In the map, after `booking: item.booking,`, add `slotTime: item.slotTime, arriveByMinutes: item.arriveByMinutes, refundable: item.refundable as Refundable,`.
  - In the calendar `items` map, after `booking: item.booking,`, add `slotTime: item.slotTime, arriveByMinutes: item.arriveByMinutes, refundable: item.refundable as Refundable,`. The agenda Timeline shows the slot line (C.9).
- [ ] **Step 4: Run it and expect PASS.** Run `npx vitest run components/plan/types.test.ts "app/(app)/trips/[tripId]/wishlist" "app/(app)/trips/[tripId]/calendar"` (the page tests, if present, must stay green).
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/plan-entity-views.ts components/plan/types.ts "app/(app)/trips/[tripId]/wishlist/page.tsx" "app/(app)/trips/[tripId]/calendar/page.tsx"`, then `npx tsc --noEmit`, then `npx eslint` on the same files.
- [ ] **Step 6: Commit.** Commit the files above with the message `feat(plan): every Item edit source carries Slot time`.

---

### Task C.9: `SlotFacts` on the Timeline, the Item card and the plan day row

**Files:**
- Create: `components/trip/slot-facts.tsx`
- Modify: `components/trip/timeline.tsx:597-608` (`DayItemBody` meta row)
- Modify: `components/trip/item-card.tsx:224-238` (the scheduled-mode time row) and the wishlist branch below `:216` (stop-name block)
- Modify: `components/plan/day-section.tsx:256` (sub line), `:259-266` (right cluster)
- Test: `components/trip/slot-facts.test.tsx` (create), `components/trip/timeline.test.tsx`, `components/trip/item-card.test.tsx`, `components/plan/day-section.test.tsx` (append one case each)

**Interfaces:**
- Consumes: `slotLabel` and `refundLabel` (C.1). `highlightAttrs` (components/trip/card-highlight.ts:6). C.7/C.8 view fields.
- Produces: `SlotFacts({ item, highlight? }: { item: { slotTime?: string | null; arriveByMinutes?: number | null; refundable?: string | null }; highlight?: readonly string[] })`

- [ ] **Step 1: Write the failing tests.**
  - `components/trip/slot-facts.test.tsx`:

    ```tsx
    import { describe, expect, it } from "vitest";
    import { render, screen } from "@testing-library/react";
    import { SlotFacts } from "./slot-facts";

    describe("SlotFacts (R3)", () => {
      it("says the slot, when to be there, and Non-refundable", () => {
        render(<div><SlotFacts item={{ slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" }} /></div>);
        expect(screen.getByText("Slot 12:00 · be there 11:45")).toHaveAttribute("data-slot-time");
        expect(screen.getByText("Non-refundable")).toHaveAttribute("data-refund");
      });
      it("renders nothing with no slot and a refundable or unknown ticket", () => {
        const { container } = render(<div><SlotFacts item={{ slotTime: null, refundable: "UNKNOWN" }} /></div>);
        expect(container.firstChild).toBeEmptyDOMElement();
      });
      it("marks the slot uncertain for a Booking import card", () => {
        render(<div><SlotFacts item={{ slotTime: "12:00" }} highlight={["slotTime"]} /></div>);
        expect(screen.getByText("Slot 12:00")).toHaveAttribute("data-highlight");
      });
    });
    ```

  - `components/trip/timeline.test.tsx`: append a case that renders `<Timeline day={{ ...dayPlan, timedItems: [{ kind: "item", item: { ...dayPlan.timedItems[0].item, startTime: "11:45", endTime: null, slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" } }] }} />` and asserts `screen.getByText("Slot 12:00 · be there 11:45")` and `screen.getByText("Non-refundable")`. Also assert a Surprise placeholder row (`surprise: { youAreSurprised: true, … }` with slot null) shows neither.
  - `components/trip/item-card.test.tsx`: append a case that renders `<ItemCard mode="scheduled" item={{ id: "i1", title: "Tour", category: "ACTIVITY", startTime: "11:45", slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" }} />` and asserts both texts. Also add a case for `mode="wishlist"` asserting `"Non-refundable"`.
  - `components/plan/day-section.test.tsx`: append

    ```tsx
    it("a row with a ticket shows its slot in the sub line and Non-refundable beside Booked (R3)", () => {
      renderDay({ items: [{ ...ITEMS[1], startTime: "09:45", slotTime: "10:00", arriveByMinutes: 15, refundable: "NO" }] });
      expect(screen.getByText("Slot 10:00 · be there 09:45 · Richelieu entrance")).toBeInTheDocument();
      expect(screen.getByText("Non-refundable")).toBeInTheDocument();
    });
    ```

- [ ] **Step 2: Run them and expect FAIL.** Run `npx vitest run components/trip/slot-facts.test.tsx components/trip/timeline.test.tsx components/trip/item-card.test.tsx components/plan/day-section.test.tsx`. They fail with the module missing and the text not found.

- [ ] **Step 3: Implement.**
  - `components/trip/slot-facts.tsx`:

    ```tsx
    import { highlightAttrs } from "./card-highlight";
    import { refundLabel, slotLabel } from "@/lib/slot-time";

    /**
     * CONTEXT.md "Slot time" on a row or card (spec 2026-10-17 R3): "Slot 12:00 ·
     * be there 11:45" and, only for a non-refundable ticket, "Non-refundable".
     * A fragment, so it joins the caller's own flex-wrap meta row. Nothing for an
     * Item with no slot (a Surprise placeholder is masked to none).
     */
    export function SlotFacts({
      item,
      highlight,
    }: {
      item: { slotTime?: string | null; arriveByMinutes?: number | null; refundable?: string | null };
      highlight?: readonly string[];
    }) {
      const slot = slotLabel(item);
      const refund = refundLabel(item.refundable);
      return (
        <>
          {slot && (
            <span data-slot-time {...highlightAttrs(highlight, ["slotTime", "arriveBy"], "tabular-nums")}>
              {slot}
            </span>
          )}
          {refund && (
            <span data-refund {...highlightAttrs(highlight, "refundable", "shrink-0 whitespace-nowrap font-bold text-foreground")}>
              {refund}
            </span>
          )}
        </>
      );
    }
    ```

  - Timeline `DayItemBody`: after `{timeLabel && <span className="tabular-nums">{timeLabel}</span>}` (`:600`), add `<SlotFacts item={item} />`.
  - ItemCard:
    - Scheduled mode: inside the time row's flex (`:225-237`), after the `timeLabel` span, add `<SlotFacts item={item} highlight={highlight} />`. Render that row when `timeLabel || slotLabel(item) || refundLabel(item.refundable)`. The row already renders whenever `mode === "scheduled"`, so only the inner placement changes.
    - Wishlist mode: under the stop-name `<p>` (`:210-214`), add `<p className="mt-1 flex flex-wrap gap-x-2 text-xs font-semibold text-muted-foreground"><SlotFacts item={item} highlight={highlight} /></p>`. Guard it with `{(item.slotTime || item.refundable === "NO") && …}` so an idea without a ticket gets no empty `<p>`.
  - Day section `DayRow`:
    - Sub line (`:256`): `{[slotLabel(item), item.address ?? item.notes?.split("\n")[0]].filter(Boolean).join(" · ")}` (import `slotLabel`, `refundLabel` from `@/lib/slot-time`).
    - Right cluster, after the Booked chip (`:261-266`): `{refundLabel(item.refundable) && <span className="shrink-0 whitespace-nowrap text-xs font-bold">{refundLabel(item.refundable)}</span>}`.

  Section B may restyle the Booked chip. Keep the refund span as its own element after it.

- [ ] **Step 4: Run them and expect PASS.** Use the same command as Step 2.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run components/trip/slot-facts.tsx components/trip/timeline.tsx components/trip/item-card.tsx components/plan/day-section.tsx`, then `npx tsc --noEmit`, then `npx eslint` on those four files plus their tests.
- [ ] **Step 6: Commit.** Commit the files above with the message `feat(timeline): Slot time and Non-refundable on the Timeline, Item cards and plan rows`.

---

### Task C.10: Item form "Ticket" disclosure

**Files:**
- Modify: `components/trip/item-form-dialog.tsx`:
  - `:4-17` (imports)
  - `:319` (`ITEM_CLEARABLE`)
  - `:524-542` (state and `useFormDirty`)
  - `:553-571` (`buildInput`)
  - `:732-760` (Start time description, and the disclosure inserted after the times sub-grid)
- Test: `components/trip/item-form-dialog.test.tsx` (append a `describe`)

**Interfaces:**
- Consumes: `startFromSlot` and `slotLabel`/`refundLabel` (C.1). `Segmented`/`SegmentedItem` (components/ui/segmented.tsx). `ItemCardItem` slot fields (C.8). `ProposedItemInput` slot fields (C.11; the form compiles before C.11 because `proposed?.slotTime` is `Partial<ProposedItemInput>`). If C.11 has not landed, add the three optional fields to `ProposedItemInput` here and C.11 reuses them.
- Produces: create and update send `slotTime`, `arriveByMinutes` and `refundable`. `ITEM_CLEARABLE` includes `"slotTime"` and `"arriveByMinutes"`.

- [ ] **Step 1: Write the failing test.**

```tsx
describe("Ticket (Slot time, R3)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is collapsed for a new Item and sends the slot, the margin and refundability", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} defaultUnscheduled={false} tripStartDate="2027-06-02" />);
    const ticket = screen.getByText("Ticket").closest("details")!;
    expect(ticket).not.toHaveAttribute("open");
    await user.type(screen.getByPlaceholderText(/visit the night market/i), "Lodge tour");
    await user.click(screen.getByText("Ticket"));
    await user.type(screen.getByLabelText(/slot time/i), "12:00");
    await user.type(screen.getByLabelText(/be there early/i), "15");
    await user.click(screen.getByRole("radio", { name: "No" }));
    // The empty start says what it will default to.
    expect(screen.getByText(/starts at 11:45 if left empty/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /add item/i }));
    expect(createItem).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ date: "2027-06-02", startTime: undefined, slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" }),
      undefined,
    );
  });

  it("opens with the saved ticket, and an unrelated edit sends it back unchanged", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, date: "2027-06-02", startTime: "11:45", slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" }} />);
    expect(screen.getByText("Ticket").closest("details")).toHaveAttribute("open");
    expect(screen.getByLabelText(/slot time/i)).toHaveValue("12:00");
    await user.type(screen.getByLabelText(/^notes$/i), "Bring ID");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateItem).toHaveBeenCalledWith("item-99", expect.objectContaining({ slotTime: "12:00", arriveByMinutes: 15, refundable: "NO", startTime: "11:45" }));
  });

  it("emptying the slot and the margin clears them (PATCH)", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, slotTime: "12:00", arriveByMinutes: 15 }} />);
    await user.clear(screen.getByLabelText(/slot time/i));
    await user.clear(screen.getByLabelText(/be there early/i));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateItem).toHaveBeenCalledWith("item-99", expect.objectContaining({ slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN" }));
  });
});
```

- [ ] **Step 2: Run it and expect FAIL.** Run `npx vitest run components/trip/item-form-dialog.test.tsx -t "Ticket"`. It fails because no "Ticket" text is found.

- [ ] **Step 3: Implement.**
  - Imports: `import { Segmented, SegmentedItem } from "@/components/ui/segmented";`, `import { refundLabel, slotLabel, startFromSlot } from "@/lib/slot-time";` and `import type { Refundable } from "@/lib/enum-values";`.
  - `ITEM_CLEARABLE` becomes `["stopId", "date", "startTime", "endTime", "slotTime", "arriveByMinutes", "address", "link", "booking", "notes", "paidAt"] as const;`. `refundable` is always sent, so it is not clearable.
  - State, after `endTime` (`:525`):

    ```tsx
      // CONTEXT.md "Slot time" (R3): the ticket's facts, under the "Ticket" disclosure.
      const [slotTime, setSlotTime] = React.useState(item?.slotTime ?? proposed?.slotTime ?? "");
      const [arriveBy, setArriveBy] = React.useState(() => {
        const v = item?.arriveByMinutes ?? proposed?.arriveByMinutes;
        return v == null ? "" : String(v);
      });
      const [refundable, setRefundable] = React.useState<Refundable>(item?.refundable ?? proposed?.refundable ?? "UNKNOWN");
      const [ticketOpenAtStart] = React.useState(() => Boolean(slotTime || arriveBy || refundable !== "UNKNOWN"));
    ```

    Add `slotTime, arriveBy, refundable` to the `useFormDirty({...})` object.
  - `buildInput`, after `endTime`:

    ```tsx
          slotTime: slotTime || undefined,
          arriveByMinutes: arriveBy.trim() === "" ? undefined : Number(arriveBy),
          refundable,
    ```

  - Start time `Field` description (`:739`):
    `description={timesDisabled ? "Set a date first" : !startTime && slotTime ? \`Starts at ${startFromSlot({ date, slotTime, arriveByMinutes: arriveBy ? Number(arriveBy) : null })} if left empty\` : undefined}`
  - After the times sub-grid's closing `</div>` (`:760`), insert:

    ```tsx
          {/* Ticket (CONTEXT.md "Slot time", R3) — collapsed unless the Item already has one. */}
          <details
            className="sm:col-span-2"
            open={ticketOpenAtStart || Boolean(errors.slotTime || errors.arriveByMinutes || errors.refundable) || undefined}
          >
            <summary className="tap-target cursor-pointer text-[13px] font-semibold text-muted-foreground">
              Ticket
              {(slotLabel({ slotTime, arriveByMinutes: arriveBy ? Number(arriveBy) : null }) || refundLabel(refundable)) && (
                <span className="ml-2 font-medium">
                  {[slotLabel({ slotTime, arriveByMinutes: arriveBy ? Number(arriveBy) : null }), refundLabel(refundable)].filter(Boolean).join(" · ")}
                </span>
              )}
            </summary>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <Field label="Slot time" description="The time on the ticket" error={errors.slotTime?.[0]}>
                <Input type="time" value={slotTime} onChange={(e) => setSlotTime(e.target.value)} disabled={isPending} />
              </Field>
              <Field label="Be there early" description="Minutes before the slot" error={errors.arriveByMinutes?.[0]}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={arriveBy}
                  onChange={(e) => setArriveBy(e.target.value)}
                  placeholder="15"
                  disabled={isPending}
                />
              </Field>
              <div className="sm:col-span-2">
                <p id="refundable-label" className="mb-1.5 text-sm font-semibold">Refundable</p>
                <Segmented
                  type="single"
                  tone="ink"
                  aria-labelledby="refundable-label"
                  value={refundable}
                  onValueChange={(v) => v && setRefundable(v as Refundable)}
                  disabled={isPending}
                >
                  <SegmentedItem value="UNKNOWN">Not known</SegmentedItem>
                  <SegmentedItem value="YES">Yes</SegmentedItem>
                  <SegmentedItem value="NO">No</SegmentedItem>
                </Segmented>
                {errors.refundable?.[0] && <p className="mt-1.5 text-sm font-medium text-destructive">{errors.refundable[0]}</p>}
              </div>
            </div>
          </details>
    ```

    Check that Radix ToggleGroup single-mode items expose `role="radio"` with their text as the accessible name (step-when tests use `aria-label`). If `getByRole("radio", { name: "No" })` does not resolve, add `aria-label` matching each item's text.
  - Existing tests that query `/start time/i` must still find one element. "Slot time" does not match, so they do.

- [ ] **Step 4: Run it and expect PASS.** Run `npx vitest run components/trip/item-form-dialog.test.tsx` (the whole file).
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run components/trip/item-form-dialog.tsx`, then `npx tsc --noEmit`, then `npx eslint components/trip/item-form-dialog.tsx components/trip/item-form-dialog.test.tsx`. Also run `npx vitest run lib/client-zod.guard.test.ts`: lib/slot-time.ts must be zod-free.
- [ ] **Step 6: Commit.** Commit `components/trip/item-form-dialog.tsx` and `components/trip/item-form-dialog.test.tsx` with the message `feat(items): Ticket disclosure in the Item form: slot time, be there early, refundable`.

---

### Task C.11: Booking import extracts the slot, the arrive-by margin and refundability

**Files:**
- Modify: `lib/booking-import/schema.ts:44-55` (`ItemSchema`), `:65-69` (`UNCERTAIN_FIELD_NAMES`)
- Modify: `lib/booking-import/prompt.ts:112` (the item rule)
- Modify: `lib/booking-import/types.ts:81-91` (`ProposedItemInput`)
- Modify: `lib/booking-import/build.ts:46-71` (`UNCERTAIN_TO_HIGHLIGHT`), `:463-495` (`itemProposal`)
- Modify: `components/booking-import/proposal-card.tsx:56` (pass the fields to `ItemCard`)
- Fixture: `lib/booking-import/build.test.ts:28` (the `item()` builder gains `slotTime: null, arriveByMinutes: null, refundable: null`)
- Test: `lib/booking-import/build.test.ts` (append), `lib/booking-import/extract.test.ts` (append a prompt and schema check)

**Interfaces:**
- Consumes: `normTime` (build.ts:85). `Refundable` (S).
- Produces:
  - `ExtractedProposal["item"]` gains `slotTime: string | null`, `arriveByMinutes: number | null` and `refundable: "yes" | "no" | null`.
  - `ProposedItemInput.{slotTime?, arriveByMinutes?, refundable?}`
  - confirm passes them to `createItem` unchanged (`lib/booking-import/confirm.ts:159` spreads `proposal.input`).

- [ ] **Step 1: Write the failing tests.**
  - `build.test.ts`, inside `describe("buildProposals: things to do, car hire, gaps")`:

    ```ts
    it("reports the ticket's slot, margin and refundability; a start that is just the slot again is dropped so it defaults on save (R3)", () => {
      const p = byId(
        buildProposals(report(item({ title: "Lodge tour", startTime: "10:00", slotTime: "10:00", arriveByMinutes: 15, refundable: "no", booking: "LT-9" })), CTX).proposals,
        "p1",
      );
      expect(p.input).toEqual({ title: "Lodge tour", category: "SIGHTSEEING", stopId: "s-lis", date: "2026-12-04", slotTime: "10:00", arriveByMinutes: 15, refundable: "NO", booking: "LT-9" });
    });

    it("keeps a separate meeting time, reads 'yes' as refundable, and drops a margin outside 1–240 or an unreadable slot", () => {
      const meet = byId(buildProposals(report(item({ startTime: "9:40", slotTime: "10:00", arriveByMinutes: 0, refundable: "yes" })), CTX).proposals, "p1");
      expect(meet.input).toMatchObject({ startTime: "09:40", slotTime: "10:00", refundable: "YES" });
      expect(meet.input).not.toHaveProperty("arriveByMinutes");
      const odd = byId(buildProposals(report(item({ slotTime: "25:00", arriveByMinutes: 999, refundable: null })), CTX).proposals, "p1");
      expect(odd.input).not.toHaveProperty("slotTime");
      expect(odd.input).not.toHaveProperty("arriveByMinutes");
      expect(odd.input).not.toHaveProperty("refundable");
    });

    it("an uncertain slot highlights the slot on the card", () => {
      const p = byId(buildProposals(report({ ...item({ slotTime: "10:00" }), uncertainFields: ["slotTime", "refundable"] }), CTX).proposals, "p1");
      expect(p.highlight).toEqual(expect.arrayContaining(["slotTime", "refundable"]));
    });
    ```

  - `extract.test.ts`, appended (no live call; the prompt and schema are static):

    ```ts
    import { EXTRACTION_SYSTEM_PROMPT } from "./prompt";
    import { BookingExtractionSchema, UNCERTAIN_FIELD_NAMES } from "./schema";

    describe("the extraction asks for Slot time (R3)", () => {
      it("the prompt explains slotTime, arriveByMinutes and refundable, and lists them as uncertain-able", () => {
        expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/slotTime/);
        expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/arriveByMinutes/);
        expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/refundable/);
        expect(UNCERTAIN_FIELD_NAMES).toEqual(expect.arrayContaining(["slotTime", "arriveBy", "refundable"]));
      });
      it("the schema accepts a reported ticket and rejects a made-up refundability", () => {
        const base = { isBooking: true, notBookingReason: null, bookedOn: null };
        const proposal = (refundable: unknown) => ({
          kind: "item", confidence: "high", doubleCheck: [], uncertainFields: [], transport: null, accommodation: null, cost: null,
          item: { title: "Tour", category: null, date: null, startTime: null, endTime: null, place: null, address: null, city: null, country: null, booking: null, slotTime: "10:00", arriveByMinutes: 15, refundable },
        });
        expect(BookingExtractionSchema.safeParse({ ...base, proposals: [proposal("no")] }).success).toBe(true);
        expect(BookingExtractionSchema.safeParse({ ...base, proposals: [proposal("maybe")] }).success).toBe(false);
      });
    });
    ```

    Put the imports at the top of the file, merged with the existing ones. Keep the file's existing SDK mocks, which these cases don't touch.

- [ ] **Step 2: Run them and expect FAIL.** Run `npx vitest run lib/booking-import/build.test.ts lib/booking-import/extract.test.ts`. They fail because the input lacks `slotTime` and the prompt doesn't match `/slotTime/`.

- [ ] **Step 3: Implement.**
  - `ItemSchema`, after `booking: text,`:

    ```ts
      slotTime: text, // "HH:mm": the time the ticket or reservation is for
      arriveByMinutes: z.number().int().nullable(), // how many minutes early the document asks you to arrive
      refundable: z.enum(["yes", "no"]).nullable(), // only when the document says so
    ```

  - `UNCERTAIN_FIELD_NAMES`: append `"slotTime", "arriveBy", "refundable"` to the item row.
  - Prompt, after the `item:` line (`:112`), add:

    ```ts
      "  - For an item, slotTime is the time the ticket or reservation is for (the entry, tour, show or table time). arriveByMinutes is how many minutes early the document asks you to arrive, as a whole number (\"arrive 15 minutes before\" is 15). refundable is \"yes\" when it says refundable or free cancellation, \"no\" when it says non-refundable or no refunds, otherwise null.",
      "  - Set item.startTime only when the document prints a separate start or meeting time. If the only time printed is the ticket's time, give it as slotTime and leave startTime null.",
    ```

  - `ProposedItemInput`, after `booking?: string;`: `slotTime?: string; arriveByMinutes?: number; refundable?: Refundable;` (`import type { Refundable } from "@/lib/enum-values";`).
  - `UNCERTAIN_TO_HIGHLIGHT`, after `booking: "booking",`: `slotTime: "slotTime", arriveBy: "slotTime", refundable: "refundable",`.
  - `itemProposal`, after `const endTime = …` (`:477`):

    ```ts
        // CONTEXT.md "Slot time" (R3): Claude reports, code decides. A start that
        // is only the slot reported twice is dropped, so the save defaults it to
        // slot − arrive-by (server/actions/items.ts startFromSlot).
        const slotTime = normTime(i.slotTime);
        const arriveByMinutes = i.arriveByMinutes != null && Number.isInteger(i.arriveByMinutes) && i.arriveByMinutes >= 1 && i.arriveByMinutes <= 240 ? i.arriveByMinutes : undefined;
        const refundable = i.refundable === "yes" ? "YES" : i.refundable === "no" ? "NO" : undefined;
        const plannedStart = startTime && startTime !== slotTime ? startTime : null;
    ```

    In the `compact<ProposedItemInput>({…})` call:
    - change `startTime: startTime ?? undefined,` to `startTime: plannedStart ?? undefined,`
    - change `endTime: endTime ?? undefined,` to `endTime: plannedStart ? (endTime ?? undefined) : undefined,`, because an end needs a start (itemSchema)
    - after `address,` add `slotTime: slotTime ?? undefined, arriveByMinutes, refundable,`

    The existing Pena Palace expectation (`:270`) has no slot, so it is unchanged. If S's arrive-by maximum differs from 240, use S's bound in both the code and the test.
  - Builder fixture `:28`: add `slotTime: null, arriveByMinutes: null, refundable: null` before `...over`.
  - `proposal-card.tsx:56` item prop: append `slotTime: i.slotTime, arriveByMinutes: i.arriveByMinutes, refundable: i.refundable`. The card (C.9) shows the slot line and highlights it when uncertain.
- [ ] **Step 4: Run them and expect PASS.** Run `npx vitest run lib/booking-import components/booking-import`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/booking-import/schema.ts lib/booking-import/prompt.ts lib/booking-import/types.ts lib/booking-import/build.ts components/booking-import/proposal-card.tsx`, then `npx tsc --noEmit`, then `npx eslint` on those files plus the two tests. Also run `npx vitest run --config vitest.integration.config.ts test/integration/booking-import-confirm.test.ts` with the C.4 env: confirm spreads the new fields into `createItem`.
- [ ] **Step 6: Commit.** Commit the files above with the message `feat(booking-import): extract Slot time, arrive-by and refundable from a ticket`.

---

### Task C.12: MCP reads expose the slot fields (plan-shapes), so get_item / get_trip_plan / get_day agree

**Files:**
- Modify: `lib/mcp/reads/plan-shapes.ts`:
  - `:39-49` (`McpThingToDo`)
  - `:51-62` (`McpDayItem`)
  - `:183-186` (`MCP_THING_TO_DO_SELECT`)
  - `:214-217` (`McpItemRow`)
  - `:237-252` (`toMcpThingToDo`, `toMcpDayItem`)
  - `:266-269` (`withPlaceholders` placeholder row)
- Test: `lib/mcp/reads/plan-shapes.test.ts` (append, and update the `toMcpItem` expectation at `:80-83`)
- Update the expected literals that now gain `slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN"`:
  - `lib/mcp/reads/trip-plan.test.ts:221` (`thingsToDo`), `:231-245` and the next two day-item literals in that test, and `:762-767` (placeholder)
  - `lib/mcp/reads/entities.test.ts:71-74`
  - `lib/mcp/reads/day.test.ts:63-90` (only if those `toEqual`s contain item literals)

  Run each file after the change. Every failure should be only these three keys.
- Test: `test/integration/mcp-narrow-reads.test.ts` (extend)

**Interfaces:**
- Consumes: C.7's `StopDayItem`/`ItineraryItem` fields (`toMcpDayItem` takes a `StopDayItem`; `get_day` passes `ItemEntry.item`)
- Produces: `McpThingToDo`/`McpDayItem`/`McpItem` with `slotTime: string | null`, `arriveByMinutes: number | null` and `refundable: string` (`"YES" | "NO" | "UNKNOWN"`). `McpItemRow` gains `slotTime?`, `arriveByMinutes?` and `refundable?`. They are optional so mocked rows without them read as `null`/`"UNKNOWN"`.

- [ ] **Step 1: Write the failing tests.**
  - `plan-shapes.test.ts`, appended:

    ```ts
    describe("Slot time in the Claude reads (R3)", () => {
      it("a thing to do and a day item read the slot, the margin and refundability", () => {
        const row = { ...item({ id: "i1", date: "2027-06-02", startTime: "11:45", slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" }), surprise: null };
        expect(toMcpItem(row, noFiles)).toMatchObject({ startTime: "11:45", slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" });
        const { stops } = buildMcpStops({
          stops: [stop()], thingsToDo: [item({ id: "t1", stopId: "s1", slotTime: "19:30", refundable: "YES" })], datedItems: [],
          dayTitles: new Map(), hiddenStopIds: new Set(), itemView: () => null, filesFor: noFiles,
        });
        expect(stops[0].thingsToDo[0]).toMatchObject({ slotTime: "19:30", arriveByMinutes: null, refundable: "YES" });
      });
      it("a row read without the columns says none / UNKNOWN", () => {
        expect(toMcpItem({ ...item(), surprise: null }, noFiles)).toMatchObject({ slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN" });
      });
    });
    ```

    Also add `slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN",` to the `toMcpItem` `toEqual` at `:80-83`.
  - `test/integration/mcp-narrow-reads.test.ts`:
    - give `TOUR` `slotTime: "10:15", arriveByMinutes: 15, refundable: "NO"` and `GIFT` `slotTime: "19:15", refundable: "NO"` in the `createMany` (`:57`, `:61`)
    - in the existing "get_item … equal their get_trip_plan slices" test (`:98-108`), after `expect(daySlice).toEqual(tourOnDay);`, add `expect(item).toMatchObject({ slotTime: "10:15", arriveByMinutes: 15, refundable: "NO" });`
    - append:

      ```ts
      it("get_day agrees on the slot, and the surprised member's placeholder hides it (R3)", async () => {
        const day = await as(OWNER)(() => loadDayForMcp(TRIP_ID, "2027-06-02"));
        if ("success" in day) throw new Error("expected a day");
        expect(day.timeline).toContainEqual(expect.objectContaining({ kind: "item", item: expect.objectContaining({ id: TOUR, slotTime: "10:15", arriveByMinutes: 15, refundable: "NO" }) }));
        const memberDay = await as(MEMBER)(() => loadDayForMcp(TRIP_ID, "2027-06-03"));
        if ("success" in memberDay) throw new Error("expected a day");
        expect(memberDay.timeline).toContainEqual(expect.objectContaining({ kind: "item", item: expect.objectContaining({ id: GIFT, title: "Surprise", slotTime: null, refundable: "UNKNOWN" }) }));
        const plan = await as(MEMBER)(() => loadTripPlanForMcp(TRIP_ID));
        expect(JSON.stringify(plan)).not.toContain("19:15");
      });
      ```

- [ ] **Step 2: Run them and expect FAIL.** Run `npx vitest run lib/mcp/reads/plan-shapes.test.ts`. It fails with the slot keys missing. The integration file (C.4 command) also fails on `slotTime` undefined.

- [ ] **Step 3: Implement** in `plan-shapes.ts`:
  - `McpThingToDo` and `McpDayItem`, after `booking: string | null;`:

    ```ts
      /** CONTEXT.md "Slot time": the ticket's time (HH:MM, the Stop's local time), or null. The start time is the plan; it defaults to slot less arriveByMinutes. */
      slotTime: string | null;
      /** How many minutes before the slot to be there, or null. */
      arriveByMinutes: number | null;
      /** YES, NO or UNKNOWN (not known). */
      refundable: string;
    ```

  - `MCP_THING_TO_DO_SELECT`: after `booking: true,`, add `slotTime: true, arriveByMinutes: true, refundable: true,`. `MCP_DATED_ITEM_SELECT` spreads it.
  - `McpItemRow`: after `booking: string | null;`, add `slotTime?: string | null; arriveByMinutes?: number | null; refundable?: string | null;`.
  - Define one helper next to `toMcpSurprise` and use it in both shapes:

    ```ts
    /** The Slot time fields as Claude reads them; a row without them reads as none / UNKNOWN. */
    function mcpSlot(i: { slotTime?: string | null; arriveByMinutes?: number | null; refundable?: string | null }) {
      return { slotTime: i.slotTime ?? null, arriveByMinutes: i.arriveByMinutes ?? null, refundable: i.refundable ?? "UNKNOWN" };
    }
    ```

    In `toMcpThingToDo` and `toMcpDayItem`, after `booking: …,`, add `...mcpSlot(i),`. Key order in the output does not matter to `toEqual`.
  - `withPlaceholders` placeholder row (`:266-268`): after `booking: p.booking,`, add `slotTime: p.slotTime, arriveByMinutes: p.arriveByMinutes, refundable: p.refundable,` (masked by C.7).
  - Update the expected literals listed under **Files**.
- [ ] **Step 4: Run them and expect PASS.** Run `npx vitest run lib/mcp/reads`, plus the integration file.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/mcp/reads/plan-shapes.ts`, then `npx tsc --noEmit`, then `npx eslint lib/mcp/reads/plan-shapes.ts` and the changed tests, plus `test/integration/mcp-narrow-reads.test.ts`.
- [ ] **Step 6: Commit.** Commit the files above with the message `feat(mcp): get_item, get_trip_plan and get_day read Slot time`.

---

### Task C.13: MCP writes: `add_thing_to_do`, `update_thing_to_do` and `schedule_thing_to_do` take the slot fields

**Files:**
- Modify: `lib/mcp/vocab.ts` (add `REFUNDABLE_MEANING` after `VOTE_LEVEL_MEANING`, `:55-64`)
- Modify: `lib/mcp/tools/plan-write.ts:48-58` (imports), `:72-97` (`itemCreateShape`, `itemPatchShape`), `:161-178` (`schedule_thing_to_do`)
- Test: `lib/mcp/tools/plan-write.test.ts` (append)

**Interfaces:**
- Consumes: `refundableSchema` (S, lib/enums.ts), `REFUNDABLE_VALUES`/`Refundable` (S), `arriveByMinutesSchema` (S/C.3), and `ScheduleItemInput` with slot fields (C.3)
- Produces: the tool inputs described in the Notes. Each write's read-back already returns `{ item }` through `loadItemForMcp` (C.12).

- [ ] **Step 1: Write the failing test.**

```ts
describe("Slot time on the thing-to-do tools (R3)", () => {
  it("add_thing_to_do forwards slotTime, arriveByMinutes and refundable to createItem", async () => {
    createItem.mockResolvedValue({ success: true, id: "new-1" });
    const c = await connectTestClient();
    await c.callTool({ name: "add_thing_to_do", arguments: { tripId: TRIP_ID, title: "Lodge tour", category: "ACTIVITY", date: "2027-06-02", slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" } });
    expect(createItem.mock.calls[0][1]).toEqual(expect.objectContaining({ slotTime: "12:00", arriveByMinutes: 15, refundable: "NO" }));
  });
  it("update_thing_to_do passes null through to clear the slot, and refuses a made-up refundability", async () => {
    updateItem.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "update_thing_to_do", arguments: { itemId: ITEM_ID, slotTime: null, arriveByMinutes: null } });
    expect(updateItem).toHaveBeenCalledWith(ITEM_ID, { slotTime: null, arriveByMinutes: null });
    const bad = await c.callTool({ name: "update_thing_to_do", arguments: { itemId: ITEM_ID, refundable: "MAYBE" } });
    expect(bad.isError).toBe(true);
  });
  it("schedule_thing_to_do forwards a slot; its description says start defaults from it", async () => {
    scheduleItem.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "schedule_thing_to_do", arguments: { itemId: ITEM_ID, date: "2027-06-02", slotTime: "20:00", arriveByMinutes: 10 } });
    expect(scheduleItem.mock.calls[0][1]).toEqual({ date: "2027-06-02", slotTime: "20:00", arriveByMinutes: 10 });
    const tool = (await c.listTools()).tools.find((t) => t.name === "schedule_thing_to_do")!;
    expect(tool.description).toMatch(/slot/i);
  });
  it("the slot fields are described as the ticket's, not the start", async () => {
    const c = await connectTestClient();
    const add = (await c.listTools()).tools.find((t) => t.name === "add_thing_to_do")!;
    const props = (add.inputSchema as { properties: Record<string, { description?: string }> }).properties;
    expect(props.slotTime.description).toMatch(/ticket/i);
    expect(props.refundable.description).toMatch(/UNKNOWN/);
  });
});
```

- [ ] **Step 2: Run it and expect FAIL.** Run `npx vitest run lib/mcp/tools/plan-write.test.ts -t "Slot time"`. It fails because the SDK strips the unknown keys (`createItem` is called without `slotTime`).

- [ ] **Step 3: Implement.**
  - `lib/mcp/vocab.ts`:

    ```ts
    export const REFUNDABLE_MEANING: Record<Refundable, string> = {
      YES: "the ticket can be refunded or cancelled for free",
      NO: "non-refundable",
      UNKNOWN: "not known (the default)",
    };
    ```

    (`import type { Refundable } from "@/lib/enum-values";` goes beside the file's other enum-value type imports.)
  - `plan-write.ts`:
    - Add imports: `refundableSchema` on the `@/lib/enums` line, `REFUNDABLE_VALUES` on the `@/lib/enum-values` line, `REFUNDABLE_MEANING` on the `../vocab` line, and `import { arriveByMinutesSchema } from "@/lib/validations/item";`.
    - Add the descriptions:

      ```ts
      const SLOT_TIME_DESCRIPTION =
        "The ticket's time, HH:MM in the Stop's local time: the 12:00 tour, the 19:30 sitting. Not the start time. startTime is when the Travellers plan to be there. With a date and no startTime, the start is set to slotTime less arriveByMinutes.";
      const ARRIVE_BY_DESCRIPTION = "How many minutes before the slot to be there, as the ticket asks. 15 means be there 15 minutes early.";
      const describedRefundable = refundableSchema.describe(describeValues("Whether the ticket can be refunded.", REFUNDABLE_MEANING, REFUNDABLE_VALUES));
      ```

    - In `itemCreateShape`, after `booking`:

      ```ts
        slotTime: hhmm.optional().describe(SLOT_TIME_DESCRIPTION),
        arriveByMinutes: arriveByMinutesSchema.optional().describe(ARRIVE_BY_DESCRIPTION),
        refundable: describedRefundable.optional(),
      ```

    - In `itemPatchShape`, after `booking`:

      ```ts
        slotTime: hhmm.nullable().optional().describe(`${SLOT_TIME_DESCRIPTION} null clears it.`),
        arriveByMinutes: arriveByMinutesSchema.nullable().optional().describe(`${ARRIVE_BY_DESCRIPTION} null clears it.`),
        refundable: describedRefundable.optional(),
      ```

    - In `update_thing_to_do`'s description, append: `" A null slotTime or arriveByMinutes clears it. Moving the slot never moves a start time that is already set."`
    - In `schedule_thing_to_do`:
      - `inputSchema`: add `slotTime: hhmm.optional().describe(SLOT_TIME_DESCRIPTION), arriveByMinutes: arriveByMinutesSchema.optional().describe(ARRIVE_BY_DESCRIPTION)`
      - handler: `({ itemId, date, startTime, endTime, slotTime, arriveByMinutes }) => … scheduleItem(itemId, { date, startTime, endTime, slotTime, arriveByMinutes })`
      - description: append `" With no startTime, a slot time (given here or already on the thing) sets the start to the slot less arriveByMinutes."`

      The existing test at `:265-277` uses `toEqual({ date, startTime, endTime: undefined })`. `toEqual` ignores undefined keys, so it stays green.
  - If `lib/mcp/vocab.test.ts` asserts every `*_MEANING` map is listed somewhere, add `REFUNDABLE_MEANING` there.
- [ ] **Step 4: Run it and expect PASS.** Run `npx vitest run lib/mcp/tools/plan-write.test.ts lib/mcp/tools/write-returns.test.ts lib/mcp`.
- [ ] **Step 5: Task-done check.** Run `npx vitest related --run lib/mcp/tools/plan-write.ts lib/mcp/vocab.ts`, then `npx tsc --noEmit`, then `npx eslint lib/mcp/tools/plan-write.ts lib/mcp/vocab.ts lib/mcp/tools/plan-write.test.ts`, plus `test/integration/mcp.test.ts` with the C.4 env (the real MCP route lists the new inputs).
- [ ] **Step 6: Commit.** Commit the files above with the message `feat(mcp): add/update/schedule thing to do take Slot time`.
## Section D — Opening hours (R4) and the Changeover owner in MCP reads (R5)

### Notes

**How placed copies relate, and how D shares the hours (verified against the code).**
- A placed copy is a separate `Item` row. `scheduleItem`'s copy-in branch and `placeIdeaAtStop` both build it with `ideaCopyData(fullItem)` (`server/actions/items.ts:599-626`). That sets `sourceItemId` to the Wishlist idea and **copies** title, category, address, link, notes and `hiddenFromShares` as a snapshot.
- Nothing reads through `sourceItemId` today. The title is not shared live: a copy keeps its own title. The relation is `onDelete: SetNull` (`prisma/schema.prisma:808`), so deleting the idea orphans its copies.
- The family is one level deep. Only a Wishlist idea (`stopId`, `date` and `forkId` all null) is ever copied in. A copy has `sourceItemId = idea.id`, in any Plan, Forks included.
- A Fork's copy of a real-plan Item gets `sourceItemId: null` (`lib/fork-plan.ts:310`), and Duplicate gets the same. Those copies leave the family.
- **D's decision: write-through to the family, not read-through.** Every row of the family keeps its own `openingHours` column. A write goes to the edited row (audited) plus `updateMany` over the rest: `{ tripId, OR: [{ id: root }, { sourceItemId: root }] }` with `root = sourceItemId ?? id`. A new copy gets the hours in `ideaCopyData`.
- Reasons:
  - (a) Every reader stays a plain column select: Day view, plan editor, MCP, Branch 2's Flags. No join.
  - (b) The hours survive the idea being deleted (SetNull).
  - (c) It is the pattern `ideaCopyData` already uses.
- **What D assumes from S:** only the column and the zod/pure modules below. If S chose read-through instead, D.2's helpers and D.3's `shareOpeningHours` are the only places to change. The readers in D.6, D.7 and D.11 read the row's own column either way, and they would read `sourceItem.openingHours ?? openingHours`.

**Assumed from S (exact names; reconcile if S differs):**
- `prisma/schema.prisma` `model Item`: `openingHours Json?` with no default. S's migration adds `ALTER TABLE "Item" ADD COLUMN "openingHours" JSONB;`.
- `lib/opening-hours.ts` is zod-free and client-safe, because the Item dialog, ItemCard and Timeline import it:
  - `export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;` where 0 is Sunday, as JS `getUTCDay()`.
  - `export type OpeningSpan = [string, string];` holds HH:MM open and close.
  - `export type WeeklyHours = Record<Weekday, OpeningSpan[] | null>;` Every weekday key is present. `null` means closed. Otherwise there are 1–2 spans.
  - `export interface OpeningSeason { from: string; to: string; weekly: WeeklyHours }`, with `from`/`to` as YYYY-MM-DD, inclusive.
  - `export interface OpeningHours { weekly: WeeklyHours; seasons: OpeningSeason[]; closedDates: string[]; sourceUrl?: string }`
  - `export function hoursOn(hours: OpeningHours, dateISO: string): { closed: boolean; spans: OpeningSpan[] } | null`. It applies closed dates, then a covering season, then the usual weekly hours.
- `lib/validations/opening-hours.ts`: `export const openingHoursSchema` (a zod schema whose output is `OpeningHours`). It rejects more than two spans a day.
- If S keys `weekly` by the strings `"0"`–`"6"`, change D.1's `weekly[d]` to `weekly[String(d) as keyof WeeklyHours]`. Nothing else in D depends on the key type.

**Produces (for other sections / the assembler):**
- `lib/opening-hours-display.ts` (pure, zod-free):
  - `WEEKDAY_LONG`, `MONDAY_FIRST`
  - `formatSpans(spans)`
  - `openingLine(hours, dateISO, opts?: { today?: boolean }): { text: string; closed: boolean } | null`
  - `weeklySummary(weekly)`
  - `openingHoursSummary(hours)`
- `lib/opening-hours-stored.ts` (server-side; imports zod and Prisma):
  - `readStoredOpeningHours(raw: unknown): OpeningHours | null`
  - `storedOpeningHours(h: OpeningHours | null): StoredOpeningHours`
  - `type StoredOpeningHours`
  - `openingHoursFamilyWhere(item: { id; tripId; sourceItemId })`
- `server/actions/items.ts`:
  - `itemSchema` gains `openingHours?: OpeningHours`, so `ItemInput` does too.
  - `updateItem` PATCH accepts `openingHours` (`null` clears) and writes the family.
  - New `setOpeningHours(itemId: string, hours: OpeningHours | null): Promise<ItemActionResult>`.
- New optional fields:
  - `openingHours?: OpeningHours | null` on `ItineraryItem` (lib/itinerary.ts), `StopDayItem` (lib/stop-days.ts), `ItemCardItem` (lib/plan-entity-views.ts) and `ThingToDo` (components/plan/types.ts).
  - `openingHours: OpeningHours | null` on `DayRows["items"]` (lib/day-view-model.ts) and on `PlaceholderItem`, always `null` there (lib/surprise-visibility.ts).
- MCP (plan-shapes):
  - `openingHours: OpeningHours | null` on `McpThingToDo` and on `McpDayItem`, and so on `McpItem`/get_item.
  - `owningStop: McpOwningStop | null` on `McpDayItem`, with `McpOwningStop = { id: string; name: string }`.
  - New `owningStopRef`.
  - `toMcpDayItem(i, filesFor, stopNameById)`, `toMcpItem(i, filesFor, stopNameById)` and `buildMcpStops({ …, stopNameById })` gain the names map.
- MCP tool `set_opening_hours({ itemId, hours | null, sourceUrl? })` returns `{ item }` (get_item's shape).
- Branch 2 (Flags) can rely on: every Item row's own `openingHours` column is the truth, parsed with `readStoredOpeningHours`, and the Item's `date`/`startTime` are in its Stop's local time. Flags need no zone conversion.

**Decisions where the spec is silent:**
- **"Open 10:00–18:00 today"**:
  - The word "today" is said only when the row's date *is* today: the Day view's `today`, or the Travelling Home's Today plan.
  - Any other date reads "Open 10:00–18:00", "Closed on Tuesdays" (a closed weekday, the season's included) or "Closed that day" (a closed date).
  - The Timeline is already under the date's heading.
  - The line shows on the Timeline (Day view, Travelling Home) and on `ItemCard` when the Item has a date.
  - It does not show on the plan editor's compact day rows (`components/plan/day-section.tsx`), the calendar agenda, print or Share page. Branch 2's "Closed that day" Flag covers the plan editor. Adding it there later is one `<OpeningHoursLine>` plus `PLAN_ITEM_SELECT`, already done in D.7.
- **The dialog sends `openingHours` only when the editor changed it**, the way `surpriseForIds` works, and never through `ITEM_CLEARABLE`. An edit path that didn't load the hours, such as a stale client, therefore can never wipe them.
- **R5 marks every day item, not only Changeover-day ones.** `owningStop` (`{ id, name }`, or null for a dated Item with no Stop) is on every `McpDayItem`, so on get_item too. On a Changeover day it names the Stop the Cost counts against, under both Stops' `days` and in get_day, where `stop` is the arriving one. A field present only on Changeover days would break F.8's get_item equality on some Items and not others, and Claude would need the Changeover rule to read it. `stopId` stays on get_item unchanged.
- **The owner's name on a hidden Surprise Stop** is shown. A Stop's name is its shell, which the surprised Traveller already sees, as with Transport endpoints. A hidden Surprise Item's placeholder carries `openingHours: null` everywhere: Day view, plan editor, MCP. `sourceUrl` could name the surprise.
- **Activity**: an opening-hours change is one UPDATED line on the edited Item, "Opening hours: Not set → Mon–Fri 10:00–18:00 · …". The family's other rows are written silently. They are copies of the same place, and an Activity line per copy would read as several edits.
- **A Fork edit still writes the family**, the real-plan idea included, because the hours belong to the place. As every Fork edit is, it is silent. Fork and Duplicate copies take a snapshot and leave the family, as they already do for `sourceItemId`.
- `add_thing_to_do`/`update_thing_to_do` do not take `openingHours`. `set_opening_hours` is the one MCP path (R13).
- The prompt copy in `lib/mcp/prompts.ts:22` ("Teepee holds no opening hours") becomes false with D. D.12 rewrites it.

**Feedback trailer (assembler):** D.13 is Branch 1's last implementation task, so its commit carries `Resolves-Feedback: cmvaig4j5000u07gwgeqrvtkd` (see Global Constraints). R5 is item 9 of `cmvaig9lq000v07gwt50bn7k0`, which closes on Branch 2's last task, so no `cmvaig9lq` trailer here.

**Review Focus candidates:**
1. **Hours set on a placed copy reach the Wishlist idea and every other copy, in any Plan.** Unrelated Items are untouched. An ordinary edit that names no hours keeps them. Clearing one clears all. Tested in D.3 (integration) and in D.5, where a copy placed afterwards inherits them.
2. **A hidden Surprise Item never leaks its hours.** Its placeholder carries `openingHours: null` on the Day view rows and in get_trip_plan/get_day, even when the real Item's `sourceUrl` names the surprise. Tested in D.6 (integration) and D.11 (integration).
3. **A Changeover day's Item names the same owning Stop everywhere.** A Munich-owned lunch on the Munich→Strasbourg day reads `owningStop: Munich` under both Stops' `days`, in get_stop, in get_day (whose `stop` is Strasbourg) and in get_item. F.8's existing equalities still hold. Tested in D.13 (integration).

---

### Task D.1: Opening hours copy (pure)

**Files:**
- Create: `lib/opening-hours-display.ts`
- Test: `lib/opening-hours-display.test.ts`

**Interfaces:**
- Consumes: S's `hoursOn`, `OpeningHours`, `OpeningSpan`, `Weekday`, `WeeklyHours` from `@/lib/opening-hours`.
- Produces: `WEEKDAY_LONG: readonly string[]` (index = Weekday), `MONDAY_FIRST: readonly Weekday[]`, `formatSpans(spans: readonly OpeningSpan[]): string`, `openingLine(hours: OpeningHours | null | undefined, dateISO: string, opts?: { today?: boolean }): { text: string; closed: boolean } | null`, `weeklySummary(weekly: WeeklyHours): string`, `openingHoursSummary(hours: OpeningHours): string`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/opening-hours-display.test.ts
import { describe, expect, it } from "vitest";
import type { OpeningHours } from "@/lib/opening-hours";
import { formatSpans, openingHoursSummary, openingLine, weeklySummary } from "./opening-hours-display";

// 2027-06-01 is a Tuesday.
const HOURS: OpeningHours = {
  weekly: {
    0: null,
    1: [["10:00", "18:00"]],
    2: null,
    3: [["10:00", "18:00"]],
    4: [["10:00", "18:00"]],
    5: [["10:00", "18:00"]],
    6: [["09:00", "12:00"], ["14:00", "18:00"]],
  },
  seasons: [],
  closedDates: ["2027-06-10"],
};

describe("openingLine", () => {
  it("names the day's spans, with 'today' only when the date is today", () => {
    expect(openingLine(HOURS, "2027-06-02")).toEqual({ text: "Open 10:00–18:00", closed: false });
    expect(openingLine(HOURS, "2027-06-02", { today: true })).toEqual({ text: "Open 10:00–18:00 today", closed: false });
    expect(openingLine(HOURS, "2027-06-05")).toEqual({ text: "Open 09:00–12:00, 14:00–18:00", closed: false });
  });

  it("says which weekday is shut, or that the date itself is", () => {
    expect(openingLine(HOURS, "2027-06-01")).toEqual({ text: "Closed on Tuesdays", closed: true });
    expect(openingLine(HOURS, "2027-06-10")).toEqual({ text: "Closed that day", closed: true });
    expect(openingLine(HOURS, "2027-06-01", { today: true })).toEqual({ text: "Closed today", closed: true });
  });

  it("is silent with no hours", () => {
    expect(openingLine(null, "2027-06-02")).toBeNull();
    expect(openingLine(undefined, "2027-06-02")).toBeNull();
  });
});

describe("summaries", () => {
  it("formatSpans joins spans with an en dash and a comma", () => {
    expect(formatSpans([["09:00", "12:00"], ["14:00", "18:00"]])).toBe("09:00–12:00, 14:00–18:00");
  });

  it("weeklySummary groups runs of equal days, Monday first", () => {
    expect(weeklySummary(HOURS.weekly)).toBe(
      "Mon 10:00–18:00 · Tue closed · Wed–Fri 10:00–18:00 · Sat 09:00–12:00, 14:00–18:00 · Sun closed",
    );
    const same = [["10:00", "18:00"]] as [string, string][];
    expect(weeklySummary({ 0: same, 1: same, 2: same, 3: same, 4: same, 5: same, 6: same })).toBe("Every day 10:00–18:00");
  });

  it("openingHoursSummary counts seasons and closed dates", () => {
    expect(openingHoursSummary({ ...HOURS, seasons: [{ from: "2027-11-01", to: "2028-03-31", weekly: HOURS.weekly }] })).toBe(
      "Mon 10:00–18:00 · Tue closed · Wed–Fri 10:00–18:00 · Sat 09:00–12:00, 14:00–18:00 · Sun closed · 1 season · 1 closed date",
    );
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**: `npx vitest run lib/opening-hours-display.test.ts` fails with "Failed to resolve import ./opening-hours-display".

- [ ] **Step 3: Implement**

```ts
// lib/opening-hours-display.ts
/**
 * CONTEXT.md "Opening hours": how a thing's hours read to a Traveller. Pure
 * and zod-free: the Timeline, ItemCard and the Item dialog import it.
 * The Item's date is already the Stop's local date, so no zone is needed.
 */
import { hoursOn, type OpeningHours, type OpeningSpan, type Weekday, type WeeklyHours } from "@/lib/opening-hours";

export const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const MONDAY_FIRST: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

const weekdayOf = (dateISO: string): Weekday => new Date(`${dateISO}T00:00:00Z`).getUTCDay() as Weekday;

export function formatSpans(spans: readonly OpeningSpan[]): string {
  return spans.map(([open, close]) => `${open}–${close}`).join(", ");
}

/**
 * The card / Timeline line for a thing scheduled on `dateISO`: "Open
 * 10:00–18:00" (+ " today" when it is today), "Closed on Tuesdays" for a shut
 * weekday, "Closed that day" for a closed date. Null when there are no hours.
 */
export function openingLine(
  hours: OpeningHours | null | undefined,
  dateISO: string,
  opts: { today?: boolean } = {},
): { text: string; closed: boolean } | null {
  if (!hours) return null;
  const day = hoursOn(hours, dateISO);
  if (!day) return null;
  if (!day.closed && day.spans.length > 0) {
    return { text: `Open ${formatSpans(day.spans)}${opts.today ? " today" : ""}`, closed: false };
  }
  if (opts.today) return { text: "Closed today", closed: true };
  if (hours.closedDates.includes(dateISO)) return { text: "Closed that day", closed: true };
  return { text: `Closed on ${WEEKDAY_LONG[weekdayOf(dateISO)]}s`, closed: true };
}

/** "Mon–Fri 10:00–18:00 · Sat 09:00–12:00 · Sun closed": runs of equal days, Monday first. */
export function weeklySummary(weekly: WeeklyHours): string {
  const groups: { from: Weekday; to: Weekday; label: string }[] = [];
  for (const d of MONDAY_FIRST) {
    const spans = weekly[d];
    const label = spans && spans.length > 0 ? formatSpans(spans) : "closed";
    const last = groups.at(-1);
    if (last && last.label === label) last.to = d;
    else groups.push({ from: d, to: d, label });
  }
  if (groups.length === 1) return groups[0].label === "closed" ? "Closed every day" : `Every day ${groups[0].label}`;
  return groups
    .map((g) => `${g.from === g.to ? WEEKDAY_SHORT[g.from] : `${WEEKDAY_SHORT[g.from]}–${WEEKDAY_SHORT[g.to]}`} ${g.label}`)
    .join(" · ");
}

/** One line for the whole set: the usual week, then how many seasons and closed dates. */
export function openingHoursSummary(hours: OpeningHours): string {
  const parts = [weeklySummary(hours.weekly)];
  const n = (count: number, one: string, many: string) => (count === 1 ? `1 ${one}` : `${count} ${many}`);
  if (hours.seasons.length > 0) parts.push(n(hours.seasons.length, "season", "seasons"));
  if (hours.closedDates.length > 0) parts.push(n(hours.closedDates.length, "closed date", "closed dates"));
  return parts.join(" · ");
}
```

- [ ] **Step 4: Run it, expect PASS**: `npx vitest run lib/opening-hours-display.test.ts`.
- [ ] **Step 5: Task-done check**: `npx vitest related --run lib/opening-hours-display.ts` + `npx tsc --noEmit` + `npx eslint lib/opening-hours-display.ts lib/opening-hours-display.test.ts`.
- [ ] **Step 6: Commit**: `lib/opening-hours-display.ts`, `lib/opening-hours-display.test.ts`, with the message `feat(opening-hours): the "Open 10:00–18:00" line and one-line summary`.

---

### Task D.2: Stored opening hours and the family they are shared by (pure)

**Files:**
- Create: `lib/opening-hours-stored.ts`
- Test: `lib/opening-hours-stored.test.ts`

**Interfaces:**
- Consumes: S's `openingHoursSchema` (`@/lib/validations/opening-hours`), `OpeningHours` (`@/lib/opening-hours`).
- Produces: `readStoredOpeningHours(raw: unknown): OpeningHours | null`, `type StoredOpeningHours = Prisma.InputJsonValue | typeof Prisma.DbNull`, `storedOpeningHours(hours: OpeningHours | null | undefined): StoredOpeningHours`, `openingHoursFamilyWhere(item: { id: string; tripId: string; sourceItemId: string | null }): { tripId: string; OR: [{ id: string }, { sourceItemId: string }] }`, `withOpeningHours<T extends { openingHours: unknown }>(row: T): Omit<T, "openingHours"> & { openingHours: OpeningHours | null }`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/opening-hours-stored.test.ts
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import type { OpeningHours } from "@/lib/opening-hours";
import { openingHoursFamilyWhere, readStoredOpeningHours, storedOpeningHours, withOpeningHours } from "./opening-hours-stored";

const open = [["10:00", "18:00"]] as [string, string][];
const HOURS: OpeningHours = { weekly: { 0: null, 1: open, 2: open, 3: open, 4: open, 5: open, 6: open }, seasons: [], closedDates: [] };

describe("stored opening hours", () => {
  it("reads a valid stored value and nothing else", () => {
    // jsonb hands numeric keys back as strings.
    expect(readStoredOpeningHours(JSON.parse(JSON.stringify(HOURS)))).toEqual(HOURS);
    expect(readStoredOpeningHours(null)).toBeNull();
    expect(readStoredOpeningHours({ weekly: "nonsense" })).toBeNull();
  });

  it("writes null as the database's NULL, not JSON null", () => {
    expect(storedOpeningHours(null)).toBe(Prisma.DbNull);
    expect(storedOpeningHours(undefined)).toBe(Prisma.DbNull);
    expect(storedOpeningHours(HOURS)).toEqual(HOURS);
  });

  it("withOpeningHours parses a row's column in place", () => {
    expect(withOpeningHours({ id: "i1", openingHours: JSON.parse(JSON.stringify(HOURS)) })).toEqual({ id: "i1", openingHours: HOURS });
  });
});

describe("openingHoursFamilyWhere (CONTEXT.md Opening hours: a thing to do and its placed copies share them)", () => {
  it("a placed copy's family is its Wishlist idea and every copy of it", () => {
    expect(openingHoursFamilyWhere({ id: "copy", tripId: "t1", sourceItemId: "idea" })).toEqual({
      tripId: "t1",
      OR: [{ id: "idea" }, { sourceItemId: "idea" }],
    });
  });

  it("an idea (or a thing never placed from one) is the root itself", () => {
    expect(openingHoursFamilyWhere({ id: "idea", tripId: "t1", sourceItemId: null })).toEqual({
      tripId: "t1",
      OR: [{ id: "idea" }, { sourceItemId: "idea" }],
    });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**: `npx vitest run lib/opening-hours-stored.test.ts` fails with "Failed to resolve import ./opening-hours-stored".

- [ ] **Step 3: Implement**

```ts
// lib/opening-hours-stored.ts
/**
 * CONTEXT.md "Opening hours" at the database edge. Server-side only (zod and
 * Prisma): readers parse the Json column with `readStoredOpeningHours`, and
 * writers store with `storedOpeningHours`, so a cleared value is SQL NULL.
 *
 * The hours belong to the place, so a Wishlist idea and every copy placed
 * from it (`sourceItemId`, any Plan) carry the same value. Every write goes to
 * the whole family (`openingHoursFamilyWhere`). Each row keeps its own column,
 * so every reader is a plain select and the hours survive the idea being
 * deleted (`sourceItemId` is SetNull).
 */
import { Prisma } from "@prisma/client";
import { openingHoursSchema } from "@/lib/validations/opening-hours";
import type { OpeningHours } from "@/lib/opening-hours";

export type StoredOpeningHours = Prisma.InputJsonValue | typeof Prisma.DbNull;

/** A stored value as OpeningHours; null for none or for a value that no longer validates. */
export function readStoredOpeningHours(raw: unknown): OpeningHours | null {
  if (raw === null || raw === undefined) return null;
  const parsed = openingHoursSchema.safeParse(raw);
  return parsed.success ? (parsed.data as OpeningHours) : null;
}

export function storedOpeningHours(hours: OpeningHours | null | undefined): StoredOpeningHours {
  return hours ? (hours as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
}

export function withOpeningHours<T extends { openingHours: unknown }>(row: T): Omit<T, "openingHours"> & { openingHours: OpeningHours | null } {
  return { ...row, openingHours: readStoredOpeningHours(row.openingHours) };
}

/** The Items sharing one place's hours: the root (the idea, or the thing itself) and every copy placed from it. */
export function openingHoursFamilyWhere(item: { id: string; tripId: string; sourceItemId: string | null }) {
  const root = item.sourceItemId ?? item.id;
  return { tripId: item.tripId, OR: [{ id: root }, { sourceItemId: root }] as [{ id: string }, { sourceItemId: string }] };
}
```

- [ ] **Step 4: Run it, expect PASS**: `npx vitest run lib/opening-hours-stored.test.ts`.
- [ ] **Step 5: Task-done check**: `npx vitest related --run lib/opening-hours-stored.ts` + `npx tsc --noEmit` + `npx eslint lib/opening-hours-stored.ts lib/opening-hours-stored.test.ts`.
- [ ] **Step 6: Commit**: `lib/opening-hours-stored.ts`, `lib/opening-hours-stored.test.ts`, with the message `feat(opening-hours): stored value and the idea-and-copies family`.

---

### Task D.3: Item actions take opening hours; `setOpeningHours` writes the family

**Files:**
- Modify: `lib/validations/item.ts:63-68`: after `surpriseForIds`, add `openingHours`.
- Modify: `server/actions/items.ts`:
  - imports (lines 3-27)
  - `createItem` create data (lines 182-201)
  - `updateItem` (lines 336-481): the current values (352-358), the `auditedUpdate` data (391-406), and the family write after it
  - a new private helper `shareOpeningHours` and a new exported `setOpeningHours`, both after `updateItem`
- Modify: `lib/server-action-exports.test.ts:103-112`: add `"setOpeningHours"` to `"items.ts"` (sorted).
- Test: `server/actions/items.test.ts`. Add `updateMany: itemUpdateManyMock` to the `db.item` mock (lines 151-159) and to the hoisted mocks (lines 10-60).
- Create: `test/integration/opening-hours.test.ts`

**Interfaces:**
- Consumes: D.2's `readStoredOpeningHours`, `storedOpeningHours`, `openingHoursFamilyWhere`; S's `openingHoursSchema`, `OpeningHours`.
- Produces:
  - `ItemInput.openingHours?: OpeningHours`
  - `updateItem(itemId, patch)` with `patch.openingHours: OpeningHours | null | undefined`. `undefined` keeps the hours. `null` clears them, for the whole family.
  - `setOpeningHours(itemId: string, hours: OpeningHours | null): Promise<ItemActionResult>`

- [ ] **Step 1: Write the failing tests**

In `server/actions/items.test.ts`, add `itemUpdateManyMock: vi.fn().mockResolvedValue({ count: 0 })` to the hoisted block, add `updateMany: itemUpdateManyMock` to `db.item`, then add:

```ts
import { Prisma } from "@prisma/client";
import { setOpeningHours } from "./items"; // alongside the existing imports from "./items"

const span = [["10:00", "18:00"]] as [string, string][];
const HOURS = { weekly: { 0: null, 1: span, 2: span, 3: span, 4: span, 5: span, 6: span }, seasons: [], closedDates: [] };

describe("opening hours (CONTEXT.md Opening hours: shared by a thing to do and its placed copies)", () => {
  const row = {
    id: "copy-1", tripId: "trip-1", forkId: null, stopId: "stop-1", sourceItemId: "idea-1", title: "Lello", category: "SIGHTSEEING",
    date: "2027-06-02", startTime: null, endTime: null, address: null, link: null, booking: null, notes: null,
    hiddenFromShares: false, openingHours: null,
  };
  beforeEach(() => {
    itemFindUniqueMock.mockResolvedValue(row);
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-1", forkId: null });
    itemUpdateMock.mockResolvedValue(row);
  });

  it("updateItem with hours writes the row and every other row of the family", async () => {
    expect(await updateItem("copy-1", { openingHours: HOURS })).toMatchObject({ success: true });
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "copy-1" }, data: expect.objectContaining({ openingHours: HOURS }) });
    expect(itemUpdateManyMock).toHaveBeenCalledWith({
      where: { tripId: "trip-1", OR: [{ id: "idea-1" }, { sourceItemId: "idea-1" }], id: { not: "copy-1" } },
      data: { openingHours: HOURS },
    });
  });

  it("updateItem that names no hours keeps them and leaves the family alone", async () => {
    itemFindUniqueMock.mockResolvedValue({ ...row, openingHours: HOURS });
    await updateItem("copy-1", { notes: "book ahead" });
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "copy-1" }, data: expect.objectContaining({ openingHours: HOURS }) });
    expect(itemUpdateManyMock).not.toHaveBeenCalled();
  });

  it("updateItem with null clears them for the family, as SQL NULL", async () => {
    itemFindUniqueMock.mockResolvedValue({ ...row, openingHours: HOURS });
    await updateItem("copy-1", { openingHours: null });
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "copy-1" }, data: expect.objectContaining({ openingHours: Prisma.DbNull }) });
    expect(itemUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({ data: { openingHours: Prisma.DbNull } }));
  });

  it("refuses hours with three spans in a day and writes nothing", async () => {
    const bad = { ...HOURS, weekly: { ...HOURS.weekly, 1: [["08:00", "09:00"], ["10:00", "11:00"], ["12:00", "13:00"]] } };
    const result = await setOpeningHours("copy-1", bad as never);
    expect(result).toMatchObject({ success: false, errors: { openingHours: expect.any(Array) } });
    expect(itemUpdateMock).not.toHaveBeenCalled();
    expect(itemUpdateManyMock).not.toHaveBeenCalled();
  });

  it("setOpeningHours writes only the hours, shares them, and revalidates the plan", async () => {
    expect(await setOpeningHours("copy-1", HOURS)).toEqual({ success: true });
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "copy-1" }, data: { openingHours: HOURS } });
    expect(itemUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan");
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
  });

  it("setOpeningHours checks access before writing", async () => {
    await setOpeningHours("copy-1", HOURS);
    expectAccessCheckedBeforeWrite(requireRowAccessMock, itemUpdateMock);
  });

  it("createItem stores hours given on create", async () => {
    requirePlanAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: {}, plan: null });
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "new-1", title: "Lello" });
    await createItem("trip-1", { title: "Lello", category: "SIGHTSEEING", openingHours: HOURS });
    expect(itemCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ openingHours: HOURS }) });
  });
});
```

Create `test/integration/opening-hours.test.ts` (mocks copied from `test/integration/patch-updates.test.ts:1-35`, with `requirePlanAccess` kept for D.5):

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// CONTEXT.md "Opening hours" against the real Postgres: a write reaches the
// Wishlist idea and every copy placed from it, in any Plan, and nothing else.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/geocode", () => ({ geocodePlace: vi.fn(async () => null), geocodePlaceDetailed: vi.fn(async () => null) }));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", () => ({
  requireUser: vi.fn(async () => ({ id: "it-oh-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-oh-user" }, membership: { role: "owner" } })),
  requirePlanAccess: vi.fn(async (_t: string, forkId?: string | null) => ({ user: { id: "it-oh-user" }, membership: { role: "owner" }, plan: forkId ?? null })),
  requireRowAccess: vi.fn(async (kind: string, id: string) => {
    const { db } = await import("@/lib/db");
    const delegate = (db as unknown as Record<string, { findUnique(a: unknown): Promise<unknown> }>)[kind];
    const row = await delegate.findUnique({ where: { id } });
    if (!row) throw new Error("NOT_FOUND");
    return { row, user: { id: "it-oh-user" }, membership: { role: "owner" }, surpriseOf: null };
  }),
}));
vi.mock("@/lib/surprise-guard", async () => ({
  ...(await vi.importActual<object>("@/lib/surprise-guard")),
  requireOutsideSurprise: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { setOpeningHours, updateItem } from "@/server/actions/items";
import { readStoredOpeningHours } from "@/lib/opening-hours-stored";

const USER = "it-oh-user";
const TRIP_ID = "it-oh-trip";
const FORK_ID = "it-oh-fork";
const PORTO = "it-oh-porto";
const IDEA = "it-oh-idea";
const COPY = "it-oh-copy"; // real-plan placement of IDEA
const FORK_COPY = "it-oh-fork-copy"; // a Fork's placement of IDEA
const OTHER = "it-oh-other"; // unrelated
const span = [["10:00", "18:00"]] as [string, string][];
const HOURS = { weekly: { 0: null, 1: span, 2: null, 3: span, 4: span, 5: span, 6: span }, seasons: [], closedDates: ["2027-06-10"], sourceUrl: "https://lello.example/hours" };
const hoursOf = async (id: string) => readStoredOpeningHours((await db.item.findUnique({ where: { id } }))!.openingHours);

describe.skipIf(process.env.INTEGRATION !== "1")("opening hours are shared by an idea and its placed copies (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "it-oh@example.test", name: "IT OH" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Opening hours", homeCurrency: "AUD", createdById: USER, forksEnabled: true,
        startDate: "2027-06-01", endDate: "2027-06-07", members: { create: { userId: USER, role: "owner" } },
      },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT Plan B", createdById: USER } });
    await db.stop.create({ data: { id: PORTO, tripId: TRIP_ID, name: "IT Porto", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-07", nights: 6, sortOrder: 0 } });
    await db.item.createMany({
      data: [
        { id: IDEA, tripId: TRIP_ID, title: "IT Livraria Lello", category: "SIGHTSEEING", sortOrder: 0 },
        { id: COPY, tripId: TRIP_ID, stopId: PORTO, sourceItemId: IDEA, title: "IT Livraria Lello", category: "SIGHTSEEING", date: "2027-06-02", sortOrder: 1 },
        { id: FORK_COPY, tripId: TRIP_ID, forkId: FORK_ID, sourceItemId: IDEA, title: "IT Livraria Lello", category: "SIGHTSEEING", date: "2027-06-03", sortOrder: 0 },
        { id: OTHER, tripId: TRIP_ID, stopId: PORTO, title: "IT Tram 22", category: "ACTIVITY", date: "2027-06-02", sortOrder: 2 },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("hours set on a placed copy reach the idea and the Fork's copy, and nothing else", async () => {
    expect(await setOpeningHours(COPY, HOURS)).toEqual({ success: true });
    for (const id of [IDEA, COPY, FORK_COPY]) expect(await hoursOf(id)).toEqual(HOURS);
    expect(await hoursOf(OTHER)).toBeNull();
  });

  it("an edit that names no hours keeps them; null clears the whole family", async () => {
    await setOpeningHours(IDEA, HOURS);
    await updateItem(COPY, { notes: "IT book the slot" });
    expect(await hoursOf(COPY)).toEqual(HOURS);
    await updateItem(COPY, { openingHours: null });
    for (const id of [IDEA, COPY, FORK_COPY]) expect(await hoursOf(id)).toBeNull();
    const raw = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Item" WHERE "tripId" = ${TRIP_ID} AND "openingHours" IS NULL`;
    expect(Number(raw[0].n)).toBe(4); // SQL NULL, not JSON null
  });

  it("refused hours write nothing", async () => {
    const bad = { ...HOURS, weekly: { ...HOURS.weekly, 1: [["08:00", "09:00"], ["10:00", "11:00"], ["12:00", "13:00"]] } };
    expect(await setOpeningHours(COPY, bad as never)).toMatchObject({ success: false });
    expect(await hoursOf(IDEA)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them, expect FAIL**:
  - `npx vitest run server/actions/items.test.ts` fails on `setOpeningHours` not exported, `openingHours` not in the update data, and `updateMany` never called.
  - `INTEGRATION=1 DATABASE_URL=… DIRECT_URL=… npx vitest run test/integration/opening-hours.test.ts` fails the same way. Use the sandbox's localhost URLs from Global Constraints.

- [ ] **Step 3: Implement**

`lib/validations/item.ts`: add `import { openingHoursSchema } from "@/lib/validations/opening-hours";`, then after `surpriseForIds` (line 68):

```ts
    /** CONTEXT.md "Opening hours" — the place's weekly hours, seasons and closed dates. Omitted = keep; a PATCH null clears. */
    openingHours: openingHoursSchema.optional(),
```

`server/actions/items.ts`:

1. Imports:
```ts
import { openingHoursSchema } from "@/lib/validations/opening-hours";
import { openingHoursFamilyWhere, readStoredOpeningHours, storedOpeningHours } from "@/lib/opening-hours-stored";
import type { OpeningHours } from "@/lib/opening-hours";
```
2. `createItem` create `data` (after `hiddenFromShares`, line 200): `openingHours: storedOpeningHours(data.openingHours),`. A create has no family yet, so nothing is shared.
3. `updateItem`, in the current values passed to `applyPatch` (after `hiddenFromShares: before.hiddenFromShares`, line 356): `openingHours: readStoredOpeningHours(before.openingHours),`.
4. `updateItem`, in the `auditedUpdate` data (after `hiddenFromShares`, line 405): `openingHours: storedOpeningHours(data.openingHours),`.
5. `updateItem`, directly after the `auditedUpdate(...)` call:
```ts
  // CONTEXT.md "Opening hours": they belong to the place, so a change reaches
  // the Wishlist idea and every copy placed from it. Only when the patch named them.
  if (patch.openingHours !== undefined) await shareOpeningHours(before, data.openingHours ?? null);
```
6. After `updateItem`, add:
```ts
/** Every other Item of `item`'s family takes `hours` (CONTEXT.md "Opening hours"). Silent: the edited row's own write carries the Activity. */
async function shareOpeningHours(
  item: { id: string; tripId: string; sourceItemId: string | null },
  hours: OpeningHours | null,
): Promise<void> {
  await db.item.updateMany({
    where: { ...openingHoursFamilyWhere(item), id: { not: item.id } },
    data: { openingHours: storedOpeningHours(hours) },
  });
}

/**
 * Set (or, with null, clear) a thing's opening hours (CONTEXT.md "Opening
 * hours"), for it and every Item sharing its place: the Wishlist idea and
 * each copy placed from it, in any Plan. Writes only the hours. Unlike a
 * full `updateItem`, it never re-geocodes the address. The MCP tool
 * `set_opening_hours` calls this.
 */
export async function setOpeningHours(itemId: string, hours: OpeningHours | null): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);
  const parsed = z.object({ openingHours: openingHoursSchema.nullable() }).safeParse({ openingHours: hours });
  if (!parsed.success) return validationResult(parsed.error);
  const before = await db.item.findUnique({ where: { id: itemId } });
  if (!before) notFound();
  const next = (parsed.data.openingHours ?? null) as OpeningHours | null;
  await auditedUpdate("ITEM", db.item, itemId, { openingHours: storedOpeningHours(next) }, item.forkId ?? null, { before });
  await shareOpeningHours(before, next);
  revalidateTrip(item.tripId, "plan");
  return { success: true };
}
```
7. `lib/server-action-exports.test.ts`: insert `"setOpeningHours",` between `"scheduleItem",` and `"unscheduleItem",` in the `"items.ts"` list.

- [ ] **Step 4: Run them, expect PASS**:
  - `npx vitest run server/actions/items.test.ts lib/server-action-exports.test.ts`
  - The integration file, with the localhost URLs.
- [ ] **Step 5: Task-done check**:
  - `npx vitest related --run lib/validations/item.ts server/actions/items.ts`
  - `npx tsc --noEmit`
  - `npx eslint lib/validations/item.ts server/actions/items.ts server/actions/items.test.ts lib/server-action-exports.test.ts test/integration/opening-hours.test.ts`
  - `INTEGRATION=1 … npx vitest run test/integration/opening-hours.test.ts`
- [ ] **Step 6: Commit**: the files above, with the message `feat(items): opening hours on Items, shared by an idea and its placed copies`.

---

### Task D.4: Activity records an opening-hours change

**Files:**
- Modify: `lib/activity.ts`:
  - `normaliseForComparison` (lines 150-153)
  - `FIELD_SPECS.ITEM` (lines 172-179)
  - imports (lines 11-14)
- Test: `lib/activity.test.ts`

**Interfaces:**
- Consumes: D.1's `openingHoursSummary`; S's `OpeningHours`.
- Produces: `describeChanges("ITEM", before, after)` emits `{ field: "openingHours", label: "Opening hours", from, to }`. Each side is `openingHoursSummary` of the value, or `"Not set"` when empty.

- [ ] **Step 1: Write the failing test** (append to `lib/activity.test.ts`):

```ts
describe("describeChanges: an Item's opening hours (CONTEXT.md Opening hours)", () => {
  const span = [["10:00", "18:00"]];
  const hours = { weekly: { 0: null, 1: span, 2: span, 3: span, 4: span, 5: span, 6: null }, seasons: [], closedDates: [] };

  it("reads a change as the one-line summary, and not set as 'Not set'", () => {
    expect(describeChanges("ITEM", { title: "Lello", openingHours: null }, { title: "Lello", openingHours: hours })).toEqual([
      { field: "openingHours", label: "Opening hours", from: "Not set", to: "Mon–Fri 10:00–18:00 · Sat–Sun closed" },
    ]);
  });

  it("an unchanged value (a fresh object, same contents) is no change", () => {
    expect(describeChanges("ITEM", { openingHours: hours }, { openingHours: JSON.parse(JSON.stringify(hours)) })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**: `npx vitest run lib/activity.test.ts`. The first case returns `[]`, because there is no spec for the field. The second also returns a change, because objects are compared with `===`.

- [ ] **Step 3: Implement**

```ts
// imports
import { openingHoursSummary } from "@/lib/opening-hours-display";
import type { OpeningHours } from "@/lib/opening-hours";

// normaliseForComparison: compare plain objects (a Json column) by contents.
function normaliseForComparison(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
}

function openingHoursFormat(value: unknown): string {
  if (isEmpty(value)) return "Not set";
  try {
    return openingHoursSummary(value as OpeningHours); // only ever written after openingHoursSchema
  } catch {
    return "Set";
  }
}

// FIELD_SPECS.ITEM — append:
    { key: "openingHours", label: "Opening hours", format: (v) => openingHoursFormat(v) },
```

The `JSON.stringify` comparison is sound for rows read back from Postgres: `jsonb` stores keys in one canonical order, and both `before` and `after` come from the database.

- [ ] **Step 4: Run it, expect PASS**: `npx vitest run lib/activity.test.ts`.
- [ ] **Step 5: Task-done check**: `npx vitest related --run lib/activity.ts` + `npx tsc --noEmit` + `npx eslint lib/activity.ts lib/activity.test.ts`.
- [ ] **Step 6: Commit**: `lib/activity.ts`, `lib/activity.test.ts`, with the message `feat(activity): an Item's opening-hours change reads as a summary`.

---

### Task D.5: Placed, forked and duplicated copies carry the hours

**Files:**
- Modify: `server/actions/items.ts:599-626` (`ideaCopyData`: param type and return).
- Modify: `lib/fork-plan.ts`:
  - the `ForkSourceItem` interface (around lines 100-125): add `openingHours?: unknown`
  - the `ForkPlan.items[].data` type (around lines 222-245): add `openingHours: StoredOpeningHours`
  - `buildForkPlan` items mapping (lines 304-314)
- Modify: `lib/duplicate-trip.ts`:
  - the source item type (lines 50-62)
  - the plan item data type (around line 118)
  - the mapping (lines 179-199)
- Test: `server/actions/items.test.ts`, `lib/fork-plan.test.ts`, `lib/duplicate-trip.test.ts`, `test/integration/opening-hours.test.ts` (extend)

**Interfaces:**
- Consumes: D.2's `readStoredOpeningHours`, `storedOpeningHours`, `StoredOpeningHours`; D.3's `setOpeningHours`.
- Produces: a new copy (`scheduleItem` copy-in, `placeIdeaAtStop`, `createFork`, `duplicateTrip`) starts with its source's hours. Fork and Duplicate copies keep a snapshot: their `sourceItemId` is null, so they are outside the family.

- [ ] **Step 1: Write the failing tests**

`server/actions/items.test.ts`, inside the existing `describe("scheduleItem"…)` copy-in block (reuse its idea fixture; add `openingHours`):
```ts
  it("a placed copy starts with the idea's opening hours", async () => {
    const span = [["10:00", "18:00"]];
    const hours = { weekly: { 0: null, 1: span, 2: span, 3: span, 4: span, 5: span, 6: span }, seasons: [], closedDates: [] };
    itemFindUniqueMock.mockResolvedValue({ id: "idea-1", tripId: "trip-1", forkId: null, stopId: null, date: null, title: "Lello", category: "SIGHTSEEING",
      lat: null, lng: null, countryCode: null, address: null, link: null, notes: null, hiddenFromShares: false, photoAttachmentId: null, openingHours: hours });
    requirePlanAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: {}, plan: null });
    itemFindFirstMock.mockResolvedValue(null);
    stopFindManyMock.mockResolvedValue([]);
    itemCreateMock.mockResolvedValue({ id: "placed-1", title: "Lello" });
    await scheduleItem("idea-1", { date: "2027-06-02" });
    expect(itemCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ sourceItemId: "idea-1", openingHours: hours }) });
  });
```
`lib/fork-plan.test.ts`: take an existing `buildForkPlan` fixture item, add `openingHours: HOURS`, and assert `plan.items[0].data.openingHours` equals `HOURS`. A source item without the field must yield `Prisma.DbNull`.

`lib/duplicate-trip.test.ts`: the same assertion on `buildDuplicatePlan(...).items[0].data.openingHours`.

`test/integration/opening-hours.test.ts`: add `import { scheduleItem } from "@/server/actions/items";` and:
```ts
  it("a copy placed after the hours were set starts with them, and later edits reach it", async () => {
    await setOpeningHours(IDEA, HOURS);
    const placed = await scheduleItem(IDEA, { date: "2027-06-05" });
    if (!placed.success || !placed.placedItemId) throw new Error("expected a placed copy");
    expect(await hoursOf(placed.placedItemId)).toEqual(HOURS);
    await setOpeningHours(COPY, null);
    expect(await hoursOf(placed.placedItemId)).toBeNull();
  });
```

- [ ] **Step 2: Run them, expect FAIL**:
  - `npx vitest run server/actions/items.test.ts lib/fork-plan.test.ts lib/duplicate-trip.test.ts`
  - the integration file
  
  Each fails because `openingHours` is not in the create data.

- [ ] **Step 3: Implement**

`server/actions/items.ts` `ideaCopyData`: add `openingHours: unknown;` to the param type. In the returned object, after `hiddenFromShares`, add:
```ts
    // CONTEXT.md "Opening hours": they belong to the place, so the copy starts with the idea's.
    openingHours: storedOpeningHours(readStoredOpeningHours(fullItem.openingHours)),
```
`placeIdeaAtStop` already passes the full row (`fullItem`). Confirm it with `grep -n "ideaCopyData(" server/actions/items.ts`: both call sites pass a `db.item.findUnique` full row.

`lib/fork-plan.ts`:
- Add `import { readStoredOpeningHours, storedOpeningHours, type StoredOpeningHours } from "@/lib/opening-hours-stored";`.
- In `ForkSourceItem`, add `/** CONTEXT.md "Opening hours" — the Fork's copy keeps the place's hours. */ openingHours?: unknown;`.
- In the items `data` type, add `openingHours: StoredOpeningHours;`.
- In the mapping, after `hiddenFromShares`, add `openingHours: storedOpeningHours(readStoredOpeningHours(it.openingHours)),`.

`lib/duplicate-trip.ts`: make the same three edits (source type, data type, and the mapping after `hiddenFromShares` at line 195).

- [ ] **Step 4: Run them, expect PASS**: the same commands.
- [ ] **Step 5: Task-done check**:
  - `npx vitest related --run server/actions/items.ts lib/fork-plan.ts lib/duplicate-trip.ts`
  - `npx tsc --noEmit`
  - `npx eslint` on the five changed files
  - the integration file
- [ ] **Step 6: Commit**: the message is `feat(opening-hours): placed, forked and duplicated copies carry the hours`.

---

### Task D.6: The Day view's rows carry opening hours (placeholders never do)

**Files:**
- Modify: `lib/surprise-visibility.ts`:
  - `PlaceholderItem` (lines 17-39): add `openingHours: null;`
  - construction (lines 162-185): add `openingHours: null,`
- Modify: `lib/day-reads.ts`:
  - the dated-items select (lines 70-74): add `openingHours: true`
  - the item rows (lines 127-134): parse, and give placeholders `openingHours: null`
- Modify: `lib/day-view-model.ts`:
  - `DayItemRow` (lines 164-168): add `openingHours: OpeningHours | null`
  - the `buildItinerary` items mapping (lines 266-270): add `openingHours: i.openingHours`
- Modify: `lib/itinerary.ts:29-47` (`ItineraryItem`): add `openingHours?: OpeningHours | null`.
- Modify (type literals that construct a `PlaceholderItem` or `DayRows["items"]` row; `npx tsc --noEmit` lists them): `lib/day-reads.test.ts`, `lib/day-view-model.test.ts`, `lib/mcp/reads/day.test.ts:11-14` (`itemRow`), `lib/surprise-visibility.test.ts`, `lib/mcp/reads/plan-shapes.test.ts:58-63`. Add `openingHours: null` to each fixture builder. Keep every assertion.
- Test: `test/integration/day-reads.test.ts` (extend)

**Interfaces:**
- Consumes: D.2's `readStoredOpeningHours`.
- Produces: `DayRows["items"][n].openingHours: OpeningHours | null`; `ItineraryItem.openingHours`. Hence `DayPlan.timedItems[].item.openingHours`, and the Day view editor's `items` (lib/day-view-loader.ts:234 spreads the row) carry them to the Item dialog.

- [ ] **Step 1: Write the failing test** (in `test/integration/day-reads.test.ts`, add `import { buildDayModel } from "@/lib/day-view-model";` and):

```ts
  it("a dated Item carries its opening hours to the Day view; a hidden Surprise's placeholder never does", async () => {
    const span = [["09:30", "19:00"]];
    const hours = { weekly: { 0: span, 1: span, 2: span, 3: span, 4: span, 5: span, 6: span }, seasons: [], closedDates: [], sourceUrl: "https://it-tram.example" };
    await db.item.update({ where: { id: "it-dr-tram" }, data: { openingHours: hours } });
    await db.item.update({ where: { id: "it-dr-dinner" }, data: { openingHours: { ...hours, sourceUrl: "https://it-birthday-dinner.example" } } });

    const planner = await readDayRows(TRIP_ID, PLANNER, none);
    if (typeof planner === "string") throw new Error(planner);
    expect(planner.rows.items.find((i) => i.id === "it-dr-tram")!.openingHours).toEqual(hours);
    const day = buildDayModel(planner.rows, "2027-06-02").dayPlan!;
    expect([...day.timedItems, ...day.untimedItems].find((e) => e.item.id === "it-dr-tram")!.item.openingHours).toEqual(hours);

    const member = await readDayRows(TRIP_ID, MEMBER, none);
    if (typeof member === "string") throw new Error(member);
    expect(member.rows.items.find((i) => i.id === "it-dr-dinner")!.openingHours).toBeNull();
    expect(JSON.stringify(member.rows)).not.toContain("it-birthday-dinner");
  });
```

- [ ] **Step 2: Run it, expect FAIL**: `INTEGRATION=1 … npx vitest run test/integration/day-reads.test.ts` fails, because `openingHours` is `undefined`.

- [ ] **Step 3: Implement**
- `lib/itinerary.ts` `ItineraryItem`: add `import type { OpeningHours } from "@/lib/opening-hours";`, then `/** CONTEXT.md "Opening hours" — the place's hours; null/absent = not known. */ openingHours?: OpeningHours | null;`.
- `lib/surprise-visibility.ts`:
  - In `PlaceholderItem`, add `openingHours: null; // never the real Item's — a sourceUrl can name the surprise`.
  - In the construction, add `openingHours: null,` after `photoAttachmentId: null,`.
- `lib/day-reads.ts`:
  - In the select, add `openingHours: true` after `photoAttachmentId: true`.
  - `itemRows.map((it) => ({ ...withOpeningHours(it), surprise: v.views.items.get(it.id) ?? null }))`, importing `withOpeningHours` from `@/lib/opening-hours-stored`.
  - In the placeholders map, add `openingHours: null,`.
- `lib/day-view-model.ts`:
  - In `DayItemRow`, add `openingHours: OpeningHours | null;`.
  - In the items mapping (line 269), add `openingHours: i.openingHours,`.

- [ ] **Step 4: Run it, expect PASS**:
  - the integration file
  - `npx vitest run lib/day-reads.test.ts lib/day-view-model.test.ts lib/mcp/reads/day.test.ts lib/surprise-visibility.test.ts lib/mcp/reads/plan-shapes.test.ts`
- [ ] **Step 5: Task-done check**:
  - `npx vitest related --run lib/surprise-visibility.ts lib/day-reads.ts lib/day-view-model.ts lib/itinerary.ts`
  - `npx tsc --noEmit`
  - `npx eslint` on every changed file
  - the integration file
- [ ] **Step 6: Commit**: the message is `feat(day-view): Items carry their opening hours; Surprise placeholders never`.

---

### Task D.7: The plan editor, Wishlist and dialog shapes carry opening hours

**Files:**
- Modify: `lib/plan-reads.ts`:
  - `PLAN_ITEM_SELECT` (lines 90-110): add `openingHours: true`
  - `PlanItemRow` (line 140)
  - `items: mergePlanItems(itemRows, v, plan)` in `readPlan`'s return, which becomes `mergePlanItems(itemRows.map(withOpeningHours), v, plan)`
- Modify: `lib/stop-days.ts:21-40` (`StopDayItem`): add `openingHours?: OpeningHours | null`.
- Modify: `lib/plan-entity-views.ts:11-32` (`ItemCardItem`): add `openingHours?: OpeningHours | null`.
- Modify: `components/plan/types.ts`: `ThingToDo` (lines 36-54) gets `openingHours?: OpeningHours | null`. `toItemCardItem` (lines 57-74) gets `openingHours: it.openingHours ?? null,`.
- Modify: `app/(app)/trips/[tripId]/wishlist/page.tsx`:
  - the `items` select (lines 77-95): add `openingHours: true`
  - the `ItemCardItem` map (lines 297-314): add `openingHours: readStoredOpeningHours(item.openingHours),`
- Verify only: `app/(app)/trips/[tripId]/plan/page.tsx:156-159,255-258`. The scheduled and things-to-do rows spread `...rest` from `rows.items`, so the parsed `openingHours` flows into `StopDayItem`/`ThingToDo` with no edit. `npx tsc --noEmit` confirms it.
- Test: `test/integration/plan-reads.test.ts` (extend), `components/plan/types.test.ts` (create it if absent, or extend the existing `toItemCardItem` test)

**Interfaces:**
- Consumes: D.2's `withOpeningHours`, `readStoredOpeningHours`; D.6's `PlaceholderItem.openingHours: null`.
- Produces: `PlanRows["items"][n].openingHours: OpeningHours | null`; `StopDayItem.openingHours`, `ThingToDo.openingHours`, `ItemCardItem.openingHours`. D.10's dialog editor reads `item.openingHours` from every edit path: plan editor day rows, plan editor things to do / IdeaSheet, Day view editor, Wishlist board.

- [ ] **Step 1: Write the failing tests**

`test/integration/plan-reads.test.ts`:
```ts
  it("an Item's opening hours read back parsed, with string weekday keys turned to the type", async () => {
    const span = [["10:00", "18:00"]];
    const hours = { weekly: { 0: null, 1: span, 2: span, 3: span, 4: span, 5: span, 6: span }, seasons: [], closedDates: ["2027-06-10"] };
    await db.item.create({ data: { id: "it-plan-lello", tripId: TRIP_ID, stopId: STOP_A, title: "IT Lello", category: "SIGHTSEEING", date: "2027-06-02", sortOrder: 0, openingHours: hours } });
    const rows = await readPlan(TRIP_ID, OWNER, null);
    expect(rows.items.find((i) => i.id === "it-plan-lello")!.openingHours).toEqual(hours);
  });
```
`components/plan/types.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { toItemCardItem } from "./types";

describe("toItemCardItem", () => {
  it("carries the opening hours to the edit dialog", () => {
    const hours = { weekly: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: [["10:00", "14:00"]] as [string, string][] }, seasons: [], closedDates: [] };
    expect(toItemCardItem({ id: "i1", title: "Market", category: "FOOD", openingHours: hours }).openingHours).toEqual(hours);
    expect(toItemCardItem({ id: "i2", title: "Walk", category: "OTHER" }).openingHours).toBeNull();
  });
});
```

- [ ] **Step 2: Run them, expect FAIL**: `npx vitest run components/plan/types.test.ts`, and the integration file with `INTEGRATION=1`. Both fail because `openingHours` is undefined.

- [ ] **Step 3: Implement** the edits listed under Files. In `lib/plan-reads.ts`:
```ts
import { withOpeningHours } from "@/lib/opening-hours-stored";
import type { OpeningHours } from "@/lib/opening-hours";
type PlanItemRow = ((Omit<Prisma.ItemGetPayload<{ select: typeof PLAN_ITEM_SELECT }>, "openingHours"> & { openingHours: OpeningHours | null }) | PlaceholderItem) & { surprise: SurpriseView | null };
// in readPlan's return:
      items: mergePlanItems(itemRows.map(withOpeningHours), v, plan),
```
Do not add it to `BUDGET_ITEM_SELECT`.

- [ ] **Step 4: Run them, expect PASS**:
  - the same two commands
  - `npx vitest run lib/plan-reads.test.ts`, updating its mocked select expectation if it pins `PLAN_ITEM_SELECT` and keeping the assertion
- [ ] **Step 5: Task-done check**:
  - `npx vitest related --run lib/plan-reads.ts lib/stop-days.ts lib/plan-entity-views.ts components/plan/types.ts "app/(app)/trips/[tripId]/wishlist/page.tsx"`
  - `npx tsc --noEmit`
  - `npx eslint` on the changed files
  - the integration file
- [ ] **Step 6: Commit**: the message is `feat(plan): opening hours reach the plan editor, Wishlist and Item dialog`.

---

### Task D.8: "Open 10:00–18:00" on the Timeline and the Item card

**Files:**
- Create: `components/trip/opening-hours-line.tsx`
- Modify: `components/trip/timeline.tsx`:
  - `TimelineProps` (lines 46-96): add `todayISO?: string`
  - `Timeline` (lines 98-214): compute `today`, pass it to both row kinds
  - `TimedItemRow` (lines 423-455) and `UntimedItemRow` (lines 457-486): add the `today` prop
  - `DayItemBody` (lines 555-617): render the line in the meta row, after the address
- Modify: `components/trip/day/day-plan-card.tsx:57-65`: add `todayISO={data.today}`.
- Modify: `components/trip/home/phase-travelling.tsx`. At line 173, add `todayISO={dayPlan.dateISO}`. At lines 387-392, add `todayISO={model.dayPlan.dateISO}`. Both are "Today's plan".
- Modify: `components/trip/item-card.tsx:245-258`: in the scheduled-mode category/time row add `<OpeningHoursLine hours={item.openingHours} dateISO={item.date} />`. In wishlist mode, render it under the notes snippet only when `item.date` is set.
- Test: `components/trip/opening-hours-line.test.tsx`, `components/trip/timeline.test.tsx` (extend), `components/trip/item-card.test.tsx` (extend)

**Interfaces:**
- Consumes: D.1's `openingLine`; `ItineraryItem.openingHours` (D.6); `ItemCardItem.openingHours` (D.7).
- Produces: `OpeningHoursLine({ hours, dateISO, today?, className? })`; `Timeline`'s optional `todayISO` prop.

- [ ] **Step 1: Write the failing tests**

```tsx
// components/trip/opening-hours-line.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OpeningHoursLine } from "./opening-hours-line";

const span = [["10:00", "18:00"]] as [string, string][];
const HOURS = { weekly: { 0: null, 1: span, 2: null, 3: span, 4: span, 5: span, 6: span }, seasons: [], closedDates: [] };

describe("OpeningHoursLine", () => {
  it("shows the day's hours, 'today' only on today", () => {
    const { rerender } = render(<OpeningHoursLine hours={HOURS} dateISO="2027-06-02" />);
    expect(screen.getByTestId("opening-hours-line")).toHaveTextContent("Open 10:00–18:00");
    rerender(<OpeningHoursLine hours={HOURS} dateISO="2027-06-02" today />);
    expect(screen.getByTestId("opening-hours-line")).toHaveTextContent("Open 10:00–18:00 today");
  });

  it("marks a closed day", () => {
    render(<OpeningHoursLine hours={HOURS} dateISO="2027-06-01" />);
    const line = screen.getByTestId("opening-hours-line");
    expect(line).toHaveTextContent("Closed on Tuesdays");
    expect(line).toHaveAttribute("data-closed", "true");
  });

  it("renders nothing without hours or a date", () => {
    const { container } = render(<><OpeningHoursLine hours={null} dateISO="2027-06-02" /><OpeningHoursLine hours={HOURS} dateISO={null} /></>);
    expect(container).toBeEmptyDOMElement();
  });
});
```
`components/trip/timeline.test.tsx`: add a case with its own `DayPlan`. Give the timed item `openingHours: HOURS` (the fixture above), and set `dateISO` and the item's `date` to `"2027-06-02"`. Render `<Timeline day={…} variant="day" todayISO="2027-06-02" />` and expect `screen.getByText("Open 10:00–18:00 today")`. Render again with `todayISO="2027-06-01"` and expect `screen.getByText("Open 10:00–18:00")`.

`components/trip/item-card.test.tsx`: render `<ItemCard mode="scheduled" item={{ id: "i1", title: "Lello", category: "SIGHTSEEING", date: "2027-06-01", openingHours: HOURS }} />` and expect `screen.getByText("Closed on Tuesdays")`.

- [ ] **Step 2: Run them, expect FAIL**: `npx vitest run components/trip/opening-hours-line.test.tsx components/trip/timeline.test.tsx components/trip/item-card.test.tsx`. The new module does not exist, and the text is not found.

- [ ] **Step 3: Implement**

```tsx
// components/trip/opening-hours-line.tsx
import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { openingLine } from "@/lib/opening-hours-display";
import type { OpeningHours } from "@/lib/opening-hours";

/**
 * CONTEXT.md "Opening hours": "Open 10:00–18:00 today" / "Closed on
 * Tuesdays" for a thing scheduled on `dateISO` (its Stop's local date).
 * Nothing at all when the hours or the date are not known. Telling the
 * Traveller that is Branch 2's Flags' job, not this line's.
 */
export function OpeningHoursLine({
  hours,
  dateISO,
  today = false,
  className,
}: {
  hours: OpeningHours | null | undefined;
  dateISO: string | null | undefined;
  today?: boolean;
  className?: string;
}) {
  const line = dateISO ? openingLine(hours, dateISO, { today }) : null;
  if (!line) return null;
  return (
    <span
      data-testid="opening-hours-line"
      data-closed={line.closed ? "true" : undefined}
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        line.closed ? "font-extrabold text-foreground" : "font-semibold text-muted-foreground",
        className,
      )}
    >
      <Clock className="size-3 shrink-0" aria-hidden="true" />
      {line.text}
    </span>
  );
}
```
`timeline.tsx`:
- Add `todayISO` to the props, with the doc line `/** The trip's today (Stop-local). A row on that date says "Open … today". */`.
- In `Timeline`, add `const today = todayISO !== undefined && todayISO === day.dateISO;` and pass `today={today}` to every `TimedItemRow` and `UntimedItemRow`.
- Each row forwards `today` to `DayItemBody`.
- In the `DayItemBody` meta row, after the address `<span>`, add:
```tsx
        <OpeningHoursLine hours={item.openingHours} dateISO={item.date} today={today} />
```
`item-card.tsx`: in the scheduled-mode row, after the `timeLabel` span, add `<OpeningHoursLine hours={item.openingHours} dateISO={item.date} />`. In wishlist mode, after the notes snippet, add `{wishlist && item.date && <OpeningHoursLine hours={item.openingHours} dateISO={item.date} />}`.

- [ ] **Step 4: Run them, expect PASS**: the same command.
- [ ] **Step 5: Task-done check**:
  - `npx vitest related --run components/trip/opening-hours-line.tsx components/trip/timeline.tsx components/trip/item-card.tsx components/trip/day/day-plan-card.tsx components/trip/home/phase-travelling.tsx`
  - `npx tsc --noEmit`
  - `npx eslint` on the changed files
- [ ] **Step 6: Commit**: the message is `feat(timeline): "Open 10:00–18:00 today" on scheduled things to do`.

---

### Task D.9: The opening-hours editor (collapsed weekday grid, seasons, closed dates)

**Files:**
- Create: `components/trip/opening-hours-editor.tsx`
- Test: `components/trip/opening-hours-editor.test.tsx`

**Interfaces:**
- Consumes: D.1's `openingHoursSummary`, `WEEKDAY_LONG`, `MONDAY_FIRST`; S's types (type-only import, so the client bundle stays zod-free).
- Produces: `OpeningHoursEditor({ value: OpeningHours | null; onChange(next: OpeningHours | null): void; disabled?: boolean; error?: string })`, plus `defaultWeekly(): WeeklyHours`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/trip/opening-hours-editor.test.tsx
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OpeningHours } from "@/lib/opening-hours";
import { OpeningHoursEditor } from "./opening-hours-editor";

function Harness({ initial, spy }: { initial: OpeningHours | null; spy: (v: OpeningHours | null) => void }) {
  const [value, setValue] = React.useState(initial);
  return <OpeningHoursEditor value={value} onChange={(v) => { setValue(v); spy(v); }} />;
}
const span = [["10:00", "18:00"]] as [string, string][];
const HOURS: OpeningHours = { weekly: { 0: span, 1: span, 2: span, 3: span, 4: span, 5: span, 6: span }, seasons: [], closedDates: [] };

describe("OpeningHoursEditor", () => {
  it("starts collapsed with a one-line summary, and 'Not set' with none", () => {
    const { rerender } = render(<OpeningHoursEditor value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Opening hours").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Not set")).toBeInTheDocument();
    rerender(<OpeningHoursEditor value={HOURS} onChange={vi.fn()} />);
    expect(screen.getByText("Every day 10:00–18:00")).toBeInTheDocument();
  });

  it("adds hours, closes a weekday and gives a day a second opening", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness initial={null} spy={spy} />);
    await user.click(screen.getByText("Opening hours"));
    await user.click(screen.getByRole("button", { name: "Add opening hours" }));
    await user.click(screen.getByRole("checkbox", { name: "Tuesday closed" }));
    expect(spy.mock.lastCall![0].weekly[2]).toBeNull();
    await user.click(screen.getByRole("button", { name: "Add a second opening on Saturday" }));
    expect(spy.mock.lastCall![0].weekly[6]).toHaveLength(2);
    expect(screen.getByLabelText("Saturday opens again")).toBeInTheDocument();
  });

  it("edits a span's times", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness initial={HOURS} spy={spy} />);
    await user.click(screen.getByText("Opening hours"));
    const closes = screen.getByLabelText("Monday closes");
    await user.clear(closes);
    await user.type(closes, "17:30");
    expect(spy.mock.lastCall![0].weekly[1]).toEqual([["10:00", "17:30"]]);
  });

  it("adds a season with its own week and a closed date, and removes the hours", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Harness initial={HOURS} spy={spy} />);
    await user.click(screen.getByText("Opening hours"));
    await user.click(screen.getByRole("button", { name: "Add a season" }));
    expect(spy.mock.lastCall![0].seasons).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Season 1 hours" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add a closed date" }));
    expect(spy.mock.lastCall![0].closedDates).toEqual([""]);
    await user.click(screen.getByRole("button", { name: "Remove opening hours" }));
    expect(spy.mock.lastCall![0]).toBeNull();
  });

  it("shows the server's error", async () => {
    render(<OpeningHoursEditor value={HOURS} onChange={vi.fn()} error="A season must end on or after it starts" />);
    expect(screen.getByText("A season must end on or after it starts")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**: `npx vitest run components/trip/opening-hours-editor.test.tsx` fails with "Failed to resolve import ./opening-hours-editor".

- [ ] **Step 3: Implement**

```tsx
// components/trip/opening-hours-editor.tsx
"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";
import { MONDAY_FIRST, WEEKDAY_LONG, openingHoursSummary } from "@/lib/opening-hours-display";
import type { OpeningHours, OpeningSpan, Weekday, WeeklyHours } from "@/lib/opening-hours";

const FIRST_SPAN: OpeningSpan = ["09:00", "17:00"];
const SECOND_SPAN: OpeningSpan = ["18:00", "21:00"];

/** Every day 09:00–17:00: a starting point to edit, not a guess at the place. */
export function defaultWeekly(): WeeklyHours {
  return Object.fromEntries(MONDAY_FIRST.map((d) => [d, [[...FIRST_SPAN]]])) as unknown as WeeklyHours;
}

function WeeklyGrid({ weekly, onChange, label, disabled }: { weekly: WeeklyHours; onChange(next: WeeklyHours): void; label: string; disabled?: boolean }) {
  const setDay = (d: Weekday, spans: OpeningSpan[] | null) => onChange({ ...weekly, [d]: spans });
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      {MONDAY_FIRST.map((d) => {
        const name = WEEKDAY_LONG[d];
        const spans = weekly[d];
        const closed = !spans || spans.length === 0;
        const setSpan = (i: number, part: 0 | 1, time: string) =>
          setDay(d, spans!.map((s, j) => (j === i ? ((part === 0 ? [time, s[1]] : [s[0], time]) as OpeningSpan) : s)));
        return (
          <div key={d} data-testid={`hours-row-${d}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="w-9 text-[13px] font-bold">{name.slice(0, 3)}</span>
            <Checkbox
              label="Closed"
              strike={false}
              aria-label={`${name} closed`}
              checked={closed}
              disabled={disabled}
              onChange={(e) => setDay(d, e.target.checked ? null : [[...FIRST_SPAN]])}
            />
            {!closed &&
              spans!.map((span, i) => (
                <span key={i} className="flex items-center gap-1">
                  <Input type="time" className="w-[7.25rem]" aria-label={`${name} ${i === 0 ? "opens" : "opens again"}`} value={span[0]} disabled={disabled} onChange={(e) => setSpan(i, 0, e.target.value)} />
                  <span aria-hidden="true">–</span>
                  <Input type="time" className="w-[7.25rem]" aria-label={`${name} ${i === 0 ? "closes" : "closes again"}`} value={span[1]} disabled={disabled} onChange={(e) => setSpan(i, 1, e.target.value)} />
                  {i === 1 && (
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove the second opening on ${name}`} disabled={disabled} onClick={() => setDay(d, [spans![0]])}>
                      <X aria-hidden="true" />
                    </Button>
                  )}
                </span>
              ))}
            {!closed && spans!.length === 1 && (
              <Button type="button" variant="ghost" size="sm" aria-label={`Add a second opening on ${name}`} disabled={disabled} onClick={() => setDay(d, [spans![0], [...SECOND_SPAN]])}>
                <Plus aria-hidden="true" /> Second opening
              </Button>
            )}
          </div>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        disabled={disabled}
        onClick={() => onChange(Object.fromEntries(MONDAY_FIRST.map((d) => [d, weekly[1] ? weekly[1].map((s) => [...s]) : null])) as unknown as WeeklyHours)}
      >
        Same as Monday every day
      </Button>
    </div>
  );
}

/**
 * CONTEXT.md "Opening hours" in the Item dialog: collapsed to a one-line
 * summary, opening to the usual week (each day closed or one or two
 * openings), seasons that replace it for a date range, and closed dates.
 * Read in the Item's Stop's local time. Controlled: `value` null = none.
 */
export function OpeningHoursEditor({
  value,
  onChange,
  disabled,
  error,
}: {
  value: OpeningHours | null;
  onChange(next: OpeningHours | null): void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <details className="rounded-xl border-2 border-border-soft px-3 py-2" open={error ? true : undefined}>
      <summary className="tap-target flex cursor-pointer flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-semibold">Opening hours</span>
        <span className="text-xs font-semibold text-muted-foreground">{value ? openingHoursSummary(value) : "Not set"}</span>
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        {value === null ? (
          <Button type="button" variant="secondary" size="sm" className="self-start" disabled={disabled}
            onClick={() => onChange({ weekly: defaultWeekly(), seasons: [], closedDates: [] })}>
            Add opening hours
          </Button>
        ) : (
          <>
            <WeeklyGrid label="Usual hours" weekly={value.weekly} disabled={disabled} onChange={(weekly) => onChange({ ...value, weekly })} />

            <section className="flex flex-col gap-2">
              <h4 className="text-[13px] font-bold">Seasons</h4>
              <p className="text-xs text-muted-foreground">Dates with different hours, such as winter. They replace the usual hours.</p>
              {value.seasons.map((season, i) => {
                const setSeason = (next: typeof season) => onChange({ ...value, seasons: value.seasons.map((s, j) => (j === i ? next : s)) });
                return (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border-2 border-border-soft p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input type="date" aria-label={`Season ${i + 1} from`} value={season.from} disabled={disabled} onChange={(e) => setSeason({ ...season, from: e.target.value })} className="w-auto" />
                      <span aria-hidden="true">to</span>
                      <Input type="date" aria-label={`Season ${i + 1} to`} value={season.to} disabled={disabled} onChange={(e) => setSeason({ ...season, to: e.target.value })} className="w-auto" />
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove season ${i + 1}`} disabled={disabled}
                        onClick={() => onChange({ ...value, seasons: value.seasons.filter((_, j) => j !== i) })}>
                        <X aria-hidden="true" />
                      </Button>
                    </div>
                    <WeeklyGrid label={`Season ${i + 1} hours`} weekly={season.weekly} disabled={disabled} onChange={(weekly) => setSeason({ ...season, weekly })} />
                  </div>
                );
              })}
              <Button type="button" variant="dashed" size="sm" className="self-start" disabled={disabled}
                onClick={() => onChange({ ...value, seasons: [...value.seasons, { from: "", to: "", weekly: value.weekly }] })}>
                <Plus aria-hidden="true" /> Add a season
              </Button>
            </section>

            <section className="flex flex-col gap-2">
              <h4 className="text-[13px] font-bold">Closed dates</h4>
              {value.closedDates.map((date, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input type="date" aria-label={`Closed date ${i + 1}`} value={date} disabled={disabled} className="w-auto"
                    onChange={(e) => onChange({ ...value, closedDates: value.closedDates.map((d, j) => (j === i ? e.target.value : d)) })} />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove closed date ${i + 1}`} disabled={disabled}
                    onClick={() => onChange({ ...value, closedDates: value.closedDates.filter((_, j) => j !== i) })}>
                    <X aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="dashed" size="sm" className="self-start" disabled={disabled}
                onClick={() => onChange({ ...value, closedDates: [...value.closedDates, ""] })}>
                <Plus aria-hidden="true" /> Add a closed date
              </Button>
            </section>

            {value.sourceUrl && <p className="text-xs text-muted-foreground">From {value.sourceUrl}</p>}

            <Button type="button" variant="ghost" size="sm" className="self-start text-destructive" disabled={disabled} onClick={() => onChange(null)}>
              Remove opening hours
            </Button>
          </>
        )}
        {error && <FormError>{error}</FormError>}
      </div>
    </details>
  );
}
```
An empty season date or closed date is left for `openingHoursSchema` to refuse on save, and the error comes back through `error`. The editor never silently drops what the Traveller typed.

- [ ] **Step 4: Run it, expect PASS**: `npx vitest run components/trip/opening-hours-editor.test.tsx lib/client-zod.guard.test.ts`. The guard proves the editor reaches no zod.
- [ ] **Step 5: Task-done check**: `npx vitest related --run components/trip/opening-hours-editor.tsx` + `npx tsc --noEmit` + `npx eslint components/trip/opening-hours-editor.tsx components/trip/opening-hours-editor.test.tsx`.
- [ ] **Step 6: Commit**: the message is `feat(item-dialog): opening hours editor — weekday grid, seasons, closed dates`.

---

### Task D.10: The Item dialog edits opening hours

**Files:**
- Modify: `components/trip/item-form-dialog.tsx`:
  - imports (lines 1-49)
  - state, after `hiddenFromShares` (line 530)
  - `useFormDirty` (line 542)
  - the `submit` (lines 575-584)
  - the editor itself, between Notes (lines 793-801) and "Hide from shared links" (line 803)
- Test: `components/trip/item-form-dialog.test.tsx` (extend)

**Interfaces:**
- Consumes: D.9's `OpeningHoursEditor`; `ItemCardItem.openingHours` (D.7); D.3's `updateItem`/`createItem` accepting `openingHours`.
- Produces: an edit sends `openingHours` only when the editor changed it (`null` when removed). A create sends it only when set. `ITEM_CLEARABLE` is unchanged.

- [ ] **Step 1: Write the failing tests** (append inside `describe("ItemFormDialog")`):

```tsx
  const span = [["10:00", "18:00"]] as [string, string][];
  const HOURS = { weekly: { 0: span, 1: span, 2: span, 3: span, 4: span, 5: span, 6: span }, seasons: [], closedDates: [] };

  it("an edit that leaves the hours alone sends no openingHours", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, openingHours: HOURS }} />);
    await user.type(screen.getByLabelText(/notes/i), "x");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).not.toHaveProperty("openingHours");
  });

  it("closing a weekday in the editor sends the new hours", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, openingHours: HOURS }} />);
    await user.click(screen.getByText("Opening hours"));
    await user.click(screen.getByRole("checkbox", { name: "Tuesday closed" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).toMatchObject({ openingHours: { weekly: { 2: null } } });
  });

  it("removing the hours sends null", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, openingHours: HOURS }} />);
    await user.click(screen.getByText("Opening hours"));
    await user.click(screen.getByRole("button", { name: "Remove opening hours" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).toHaveProperty("openingHours", null);
  });

  it("a create with hours set sends them; without, sends none", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} />);
    await user.type(screen.getByLabelText(/title/i), "Lello");
    await user.click(screen.getByText("Opening hours"));
    await user.click(screen.getByRole("button", { name: "Add opening hours" }));
    await user.click(screen.getByRole("button", { name: /add item|save/i }));
    await waitFor(() => expect(createItem).toHaveBeenCalled());
    expect(vi.mocked(createItem).mock.calls[0][1]).toHaveProperty("openingHours.weekly");
  });

  it("shows the server's opening-hours error in the editor", async () => {
    vi.mocked(updateItem).mockResolvedValueOnce({ success: false, errors: { openingHours: ["A season must end on or after it starts"] } });
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, openingHours: HOURS }} />);
    await user.click(screen.getByText("Opening hours"));
    await user.click(screen.getByRole("checkbox", { name: "Tuesday closed" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText("A season must end on or after it starts")).toBeInTheDocument();
  });
```
Match the create button's accessible name to the existing create tests in this file. Grep for `createItem).toHaveBeenCalled` and reuse the same button query.

- [ ] **Step 2: Run it, expect FAIL**: `npx vitest run components/trip/item-form-dialog.test.tsx` fails because there is no "Opening hours" summary.

- [ ] **Step 3: Implement**

```tsx
// imports
import { OpeningHoursEditor } from "@/components/trip/opening-hours-editor";
import type { OpeningHours } from "@/lib/opening-hours";

// state, after hiddenFromShares (line 530):
  // CONTEXT.md "Opening hours" — sent only when changed, like the Surprise:
  // an edit that never loaded them can't wipe the place's hours.
  const [openingHours, setOpeningHours] = React.useState<OpeningHours | null>(item?.openingHours ?? null);
  const [initialOpeningHours] = React.useState(() => JSON.stringify(item?.openingHours ?? null));
  const openingHoursChanged = JSON.stringify(openingHours) !== initialOpeningHours;

// useFormDirty: add openingHours to the watched object.

// submit (replace the final return):
      return isEdit && item
        ? updateItem(item.id, { ...toPatch(input, ITEM_CLEARABLE), ...(openingHoursChanged && { openingHours }) })
        : createItem(tripId, { ...input, ...(openingHours && { openingHours }) }, forkId ?? undefined);

// between Notes and "Hide from shared links":
      <div className="sm:col-span-2">
        <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} disabled={isPending} error={errors.openingHours?.[0]} />
      </div>
```
`buildInput()` (the Booking import draft) stays unchanged, so a Proposal never carries hours. `onSubmitOverride` keeps taking `input` alone.

- [ ] **Step 4: Run it, expect PASS**: `npx vitest run components/trip/item-form-dialog.test.tsx lib/client-zod.guard.test.ts`.
- [ ] **Step 5: Task-done check**: `npx vitest related --run components/trip/item-form-dialog.tsx` + `npx tsc --noEmit` + `npx eslint components/trip/item-form-dialog.tsx components/trip/item-form-dialog.test.tsx`.
- [ ] **Step 6: Commit**: the message is `feat(item-dialog): edit a thing's opening hours`.

---

### Task D.11: Claude reads opening hours (plan-shapes)

**Files:**
- Modify: `lib/mcp/reads/plan-shapes.ts`:
  - `McpThingToDo` (lines 39-49) and `McpDayItem` (lines 51-63): add `openingHours: OpeningHours | null`
  - `MCP_THING_TO_DO_SELECT` (lines 183-186): add `openingHours: true`
  - `McpItemRow` (lines 215-218): add `openingHours: unknown`
  - `toMcpThingToDo` (lines 237-243) and `toMcpDayItem` (lines 245-252)
  - `withPlaceholders` (lines 265-281): the placeholder gets `openingHours: null`
- Modify: `lib/mcp/reads/trip-plan.test.ts:215-250`, `lib/mcp/reads/entities.test.ts:65-80` and `lib/mcp/reads/plan-shapes.test.ts:18-21,80-83` fixtures and expected literals: add `openingHours: null` to rows and to the expected thing-to-do and day-item objects. Keep every assertion.
- Test: `lib/mcp/reads/plan-shapes.test.ts` (extend), `test/integration/mcp-narrow-reads.test.ts` (extend)

**Interfaces:**
- Consumes: D.2's `readStoredOpeningHours`; D.6's `ItineraryItem.openingHours` (get_day's items come through `buildDayModel`); D.7's `StopDayItem.openingHours`.
- Produces: `openingHours` on every thing to do and day item in get_trip_plan, get_stop, get_item, get_day, and on every write's read-back. `MCP_DATED_ITEM_SELECT` inherits it.

- [ ] **Step 1: Write the failing tests**

`lib/mcp/reads/plan-shapes.test.ts`:
```ts
describe("opening hours (CONTEXT.md Opening hours)", () => {
  const span = [["10:00", "18:00"]];
  const hours = { weekly: { 0: null, 1: span, 2: span, 3: span, 4: span, 5: span, 6: span }, seasons: [], closedDates: [] };

  it("a thing to do and a day item read the stored hours; a bad stored value reads as none", () => {
    const { stops } = buildMcpStops({
      stops: [stop()],
      thingsToDo: [item({ id: "t1", stopId: "s1", openingHours: hours })],
      datedItems: [{ ...item({ id: "d1", date: "2027-06-02", openingHours: { weekly: "?" } }), surprise: null }],
      dayTitles: new Map(), hiddenStopIds: new Set(), itemView: () => null, filesFor: noFiles, stopNameById: new Map(),
    });
    expect(stops[0].thingsToDo[0].openingHours).toEqual(hours);
    expect(stops[0].days.find((d) => d.date === "2027-06-02")!.items[0].openingHours).toBeNull();
  });

  it("a hidden Surprise's placeholder never carries hours", () => {
    const out = withPlaceholders([], {
      placeholderItems: [{ id: "p1", tripId: "t", forkId: null, stopId: "s1", date: "2027-06-01", startTime: null, endTime: null,
        title: "Surprise", category: "OTHER", address: null, link: null, booking: null, notes: null, lat: null, lng: null,
        countryCode: null, hiddenFromShares: false, sortOrder: 0, photoAttachmentId: null, sourceItemId: null, openingHours: null, surprise: surpriseView }],
      views: { stops: new Map(), items: new Map() },
    });
    expect(out[0].openingHours).toBeNull();
  });
});
```
(`stopNameById` is D.13's parameter. If D.11 runs first, omit it here and D.13 adds it to every `buildMcpStops` call in this file.)

`test/integration/mcp-narrow-reads.test.ts`:
```ts
  it("get_item, get_trip_plan and get_day read a thing's opening hours; a hidden Surprise's never leave", async () => {
    const span = [["10:00", "18:00"]];
    const hours = { weekly: { 0: null, 1: span, 2: span, 3: span, 4: span, 5: span, 6: span }, seasons: [], closedDates: [] };
    await db.item.update({ where: { id: TOUR }, data: { openingHours: hours } });
    await db.item.update({ where: { id: TASTING }, data: { openingHours: hours } });
    await db.item.update({ where: { id: GIFT }, data: { openingHours: { ...hours, sourceUrl: "https://it-gift-dinner.example" } } });

    const plan = await as(OWNER)(() => loadTripPlanForMcp(TRIP_ID));
    const porto = plan.stops.find((s) => s.id === PORTO)!;
    expect(porto.days.find((d) => d.date === "2027-06-02")!.items.find((i) => i.id === TOUR)!.openingHours).toEqual(hours);
    expect(porto.thingsToDo.find((t) => t.id === TASTING)!.openingHours).toEqual(hours);
    expect((await as(OWNER)(() => loadItemForMcp(TOUR))).openingHours).toEqual(hours);
    const day = await as(OWNER)(() => loadDayForMcp(TRIP_ID, "2027-06-02"));
    if ("success" in day) throw new Error("expected a day");
    expect(day.timeline).toContainEqual(expect.objectContaining({ kind: "item", item: expect.objectContaining({ id: TOUR, openingHours: hours }) }));

    const memberPlan = await as(MEMBER)(() => loadTripPlanForMcp(TRIP_ID));
    const memberDay = await as(MEMBER)(() => loadDayForMcp(TRIP_ID, "2027-06-03"));
    expect(JSON.stringify([memberPlan, memberDay])).not.toContain("it-gift-dinner");
  });
```

- [ ] **Step 2: Run them, expect FAIL**: `npx vitest run lib/mcp/reads/plan-shapes.test.ts`, and the integration file with `INTEGRATION=1`. `openingHours` is undefined.

- [ ] **Step 3: Implement** (`lib/mcp/reads/plan-shapes.ts`):
```ts
import type { OpeningHours } from "@/lib/opening-hours";
import { readStoredOpeningHours } from "@/lib/opening-hours-stored";
// McpThingToDo and McpDayItem:
  /** CONTEXT.md "Opening hours": weekly (0 = Sunday … 6 = Saturday, null = closed), seasons, closedDates, in the Stop's local time; null = not known. */
  openingHours: OpeningHours | null;
// MCP_THING_TO_DO_SELECT: add openingHours: true
// McpItemRow: add openingHours: unknown;
// toMcpThingToDo: add  openingHours: readStoredOpeningHours(i.openingHours),
// toMcpDayItem:   add  openingHours: readStoredOpeningHours(i.openingHours ?? null),
// withPlaceholders' placeholder literal: add openingHours: null,
```
`readStoredOpeningHours` is idempotent on an already-parsed value: it re-validates and returns the same shape. That is how get_day's items reach it already parsed (D.6) and get_trip_plan's raw from Prisma.

- [ ] **Step 4: Run them, expect PASS**:
  - `npx vitest run lib/mcp/reads/`
  - the integration file
- [ ] **Step 5: Task-done check**:
  - `npx vitest related --run lib/mcp/reads/plan-shapes.ts`
  - `npx tsc --noEmit`
  - `npx eslint` on the changed files
  - `INTEGRATION=1 … npx vitest run test/integration/mcp-narrow-reads.test.ts`
- [ ] **Step 6: Commit**: the message is `feat(mcp): get_trip_plan, get_stop, get_item and get_day read opening hours`.

---

### Task D.12: `set_opening_hours` for Claude

**Files:**
- Modify: `lib/mcp/tools/plan-write.ts`:
  - header comment (lines 1-30)
  - imports (lines 31-56)
  - register the tool after `update_thing_to_do` (line 140)
- Modify: `lib/mcp/tools/write-returns.test.ts`:
  - the `@/server/actions/items` mock (lines 29-32): add `setOpeningHours: ok()`
  - `ARGS` (lines 98-155): add `set_opening_hours: { itemId: "item-1", hours: null }`
- Modify: `lib/mcp/tools/plan-write.test.ts`:
  - the hoisted mocks and the `@/server/actions/items` mock (lines 1-66): add `setOpeningHours`
  - the tool list (lines 150-166): add `"set_opening_hours"`
- Modify: `lib/mcp/prompts.ts:17-22` (`LOGISTICS_CHECK`) and `lib/mcp/tools/reads.ts:232` (the `get_item` description).
- Test: `lib/mcp/tools/plan-write.test.ts` (extend), `lib/mcp/prompts.test.ts` (extend)

**Interfaces:**
- Consumes: D.3's `setOpeningHours`; `loadItemForMcp` (now with `openingHours`, D.11); S's `openingHoursSchema`; `requireRealPlanRow` (`lib/mcp/real-plan.ts`).
- Produces: MCP tool `set_opening_hours({ itemId: string, hours: OpeningHours | null, sourceUrl?: string })`. It returns `{ item }` (get_item's shape). A `sourceUrl` argument overrides `hours.sourceUrl`.

- [ ] **Step 1: Write the failing tests**

`lib/mcp/tools/plan-write.test.ts`:
```ts
  it("set_opening_hours checks the real plan, saves through setOpeningHours with the source link, and returns the item", async () => {
    setOpeningHours.mockResolvedValue({ success: true });
    loadItemForMcp.mockResolvedValue({ id: ITEM_ID, openingHours: { weekly: {}, seasons: [], closedDates: [] } });
    const span = [["10:00", "18:00"]];
    const hours = { weekly: { 0: null, 1: span, 2: span, 3: span, 4: span, 5: span, 6: span }, seasons: [], closedDates: ["2027-12-25"] };
    const c = await connectTestClient();
    const r = await c.callTool({ name: "set_opening_hours", arguments: { itemId: ITEM_ID, hours, sourceUrl: "https://lello.example/hours" } });
    expect(r.isError).toBeFalsy();
    expect(itemFindUnique).toHaveBeenCalledWith({ where: { id: ITEM_ID, forkId: null }, select: { tripId: true } });
    expect(setOpeningHours).toHaveBeenCalledWith(ITEM_ID, { ...hours, sourceUrl: "https://lello.example/hours" });
    expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ item: { id: ITEM_ID, openingHours: { weekly: {}, seasons: [], closedDates: [] } } });
  });

  it("set_opening_hours with null clears them", async () => {
    setOpeningHours.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({ name: "set_opening_hours", arguments: { itemId: ITEM_ID, hours: null } });
    expect(setOpeningHours).toHaveBeenCalledWith(ITEM_ID, null);
  });

  it("set_opening_hours on a Fork's row is not found and writes nothing", async () => {
    itemFindUnique.mockResolvedValue(null);
    const c = await connectTestClient();
    const r = await c.callTool({ name: "set_opening_hours", arguments: { itemId: ITEM_ID, hours: null } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
    expect(setOpeningHours).not.toHaveBeenCalled();
  });
```
`lib/mcp/prompts.test.ts`: in the plan-day/check-day test that already matches `/opening hours/i` (line 95), add `expect(t).toMatch(/set_opening_hours/); expect(t).not.toMatch(/holds no opening hours/);`.

- [ ] **Step 2: Run them, expect FAIL**: `npx vitest run lib/mcp/tools/plan-write.test.ts lib/mcp/tools/write-returns.test.ts lib/mcp/prompts.test.ts`. The tool is unknown, ARGS does not match the registered tools, and the prompt still says "holds no opening hours".

- [ ] **Step 3: Implement**

`plan-write.ts`:
- Add `setOpeningHours` to the `@/server/actions/items` import.
- Add `import { openingHoursSchema } from "@/lib/validations/opening-hours";` and `requireRealPlanRow` (already imported).
- In the header list, add "`set_opening_hours` (CONTEXT.md Opening hours, shared by an idea and its placed copies)".
- Register:
```ts
  server.registerTool(
    "set_opening_hours",
    {
      title: "Set opening hours",
      description:
        "Sets when the place a thing to do is about lets you in, read in its Stop's local time, replacing any hours it had. " +
        "weekly has keys 0 (Sunday) to 6 (Saturday), each null for closed or one or two [open, close] spans as HH:MM. " +
        "seasons are date ranges (from, to as YYYY-MM-DD) whose own weekly hours replace the usual ones; closedDates are YYYY-MM-DD days it is shut. " +
        "The hours belong to the place, so the Wishlist idea and every copy placed from it get them too. " +
        "Pass sourceUrl for the page you read them on. Pass hours: null to clear them. Only set hours you have checked.",
      inputSchema: {
        itemId: z.string(),
        hours: openingHoursSchema.nullable(),
        sourceUrl: z.string().url().optional().describe("The page the hours came from."),
      },
    },
    ({ itemId, hours, sourceUrl }) =>
      runWrite(
        "set_opening_hours",
        async () => {
          await requireRealPlanRow("item", itemId);
          return setOpeningHours(itemId, hours ? { ...hours, ...(sourceUrl && { sourceUrl }) } : null);
        },
        async () => ({ item: await loadItemForMcp(itemId) }),
      ),
  );
```
`prompts.ts` `LOGISTICS_CHECK`: replace point (3) and the closing sentence with:
```ts
  "(3) Opening hours: start from the thing's openingHours (get_item or get_trip_plan) when Teepee has them, then check them for that date and weekday, including seasonal and holiday closures, and whether booking is needed. Save hours you have confirmed with set_opening_hours, giving the page as sourceUrl. " +
  ...
  "Mark each point verified (say how: web search, search_places) or unverified. Teepee holds no routing data and only the opening hours someone has saved, so flag anything you can't check with your own tools, never guess.";
```
`reads.ts:232` get_item description: after "its files," add "its openingHours (null when not known; set them with set_opening_hours),".

- [ ] **Step 4: Run them, expect PASS**: the same command.
- [ ] **Step 5: Task-done check**:
  - `npx vitest related --run lib/mcp/tools/plan-write.ts lib/mcp/prompts.ts lib/mcp/tools/reads.ts`
  - `npx tsc --noEmit`
  - `npx eslint` on the changed files
- [ ] **Step 6: Commit**: the message is `feat(mcp): set_opening_hours, with a source link, returning the item`.

---

### Task D.13: Every day item names its owning Stop (R5, Changeover day)

**Files:**
- Modify: `lib/mcp/reads/plan-shapes.ts`:
  - new type `McpOwningStop` and `owningStopRef`
  - `McpDayItem` (lines 51-63): add `owningStop: McpOwningStop | null`
  - `toMcpDayItem` (lines 245-252) and `toMcpItem` (lines 254-256): add a third param `stopNameById`
  - `buildMcpStops` (lines 287-336): new input `stopNameById`, passed to `toMcpDayItem` at line 317
- Modify: `lib/mcp/reads/trip-plan.ts:84-108`: build `stopNameById` before `buildMcpStops` (it is built at line 99 today), and pass it to `buildMcpStops` and `toMcpItem` (line 108).
- Modify: `lib/mcp/reads/entities.ts`:
  - `loadItemForMcp` (lines 47-58): look up the owning Stop's name
  - `readMcpStops` (lines 126-182): add a real-plan Stop-names query to the `Promise.all` and pass the map
- Modify: `lib/mcp/reads/day.ts:73`: `toMcpDayItem(e.item, filesFor, stopName)`. `stopName` is the existing map, which must be declared before the `item` closure (move line 76 above line 73).
- Modify: `lib/mcp/tools/reads.ts:208,220,267`: the get_trip_plan, get_stop and get_day descriptions.
- Modify: `lib/mcp/reads/plan-shapes.test.ts`, `lib/mcp/reads/trip-plan.test.ts:236-250`, `lib/mcp/reads/entities.test.ts:65-80`, `lib/mcp/reads/day.test.ts`. Pass `stopNameById: new Map(...)` to every `buildMcpStops` call. Add `owningStop` to the expected day-item literals and `toMcpItem`'s expected object (line 80-83). Add a `db.stop.findMany`/`findFirst` mock returning names where the loaders' db mocks need it. Keep every assertion.
- Test: `lib/mcp/reads/plan-shapes.test.ts` (extend), `test/integration/mcp-narrow-reads.test.ts` (extend; F.8's file, keeping every existing case)

**Interfaces:**
- Consumes: `groupScheduledItemsByStop` (lib/stop-days.ts, ADR 0049 grouping by date coverage); `StopDayItem.stopId`.
- Produces:
  - `export interface McpOwningStop { id: string; name: string }`
  - `export function owningStopRef(stopId: string | null | undefined, names: ReadonlyMap<string, string>): McpOwningStop | null`
  - `McpDayItem.owningStop`, and so on `McpItem`/get_item and `unplacedDatedItems`
  - `toMcpDayItem(i: StopDayItem, filesFor: FilesFor, stopNameById: ReadonlyMap<string, string>)`
  - `toMcpItem(i, filesFor, stopNameById)`
  - `buildMcpStops({ …, stopNameById: ReadonlyMap<string, string> })`

- [ ] **Step 1: Write the failing tests**

`lib/mcp/reads/plan-shapes.test.ts`, in `describe("buildMcpStops")`:
```ts
  it("on a Changeover day each Stop lists the Item with its one owning Stop (ADR 0049)", () => {
    const { stops } = buildMcpStops({
      stops: [stop(), stop({ id: "s2", name: "Lisbon", arriveDate: "2027-06-04", departDate: "2027-06-06", sortOrder: 1 })],
      thingsToDo: [],
      datedItems: [
        { ...item({ id: "lunch", date: "2027-06-04", startTime: "12:00", stopId: "s1" }), surprise: null },
        { ...item({ id: "train", date: "2027-06-04", startTime: "09:00" }), surprise: null },
      ],
      dayTitles: new Map(), hiddenStopIds: new Set(), itemView: () => null, filesFor: noFiles,
      stopNameById: new Map([["s1", "Porto"], ["s2", "Lisbon"]]),
    });
    const owners = (items: { id: string; owningStop: unknown }[]) => Object.fromEntries(items.map((i) => [i.id, i.owningStop]));
    expect(owners(stops[0].days.at(-1)!.items)).toEqual({ train: null, lunch: { id: "s1", name: "Porto" } });
    expect(owners(stops[1].days[0].items)).toEqual({ train: null, lunch: { id: "s1", name: "Porto" } });
  });
```
`describe("toMcpItem / toMcpTransport")`: change the existing `toMcpItem` case to pass `new Map([["s1", "Porto"]])` as the third argument. Its expected object gains `owningStop: { id: "s1", name: "Porto" }` and `openingHours: null`. Add `expect(owningStopRef(null, new Map())).toBeNull()`.

`test/integration/mcp-narrow-reads.test.ts`: add `const FAREWELL = "it-narrow-farewell"; // Porto's, on the Changeover day (R5)` beside the other ids, and:
```ts
  it("marks each Changeover-day Item with its owning Stop in get_trip_plan, get_stop, get_day and get_item (R5)", async () => {
    // Created here, not in beforeEach, so the existing Changeover-day assertions keep their exact item lists.
    await db.item.create({ data: { id: FAREWELL, tripId: TRIP_ID, stopId: PORTO, title: "IT Farewell lunch", category: "FOOD", date: "2027-06-04", startTime: "12:00", sortOrder: 5 } });
    const plan = await as(OWNER)(() => loadTripPlanForMcp(TRIP_ID));
    const owners = (items: { id: string; owningStop: unknown }[]) => Object.fromEntries(items.map((i) => [i.id, i.owningStop]));
    const departing = plan.stops.find((s) => s.id === PORTO)!.days.at(-1)!;
    const arriving = plan.stops.find((s) => s.id === SECRET)!.days[0];
    expect(departing.date).toBe("2027-06-04");
    expect(arriving.date).toBe("2027-06-04");
    expect(owners(departing.items)).toEqual({ [TRAIN]: null, [FAREWELL]: { id: PORTO, name: "IT Porto" } });
    expect(owners(arriving.items)).toEqual(owners(departing.items));

    expect((await as(OWNER)(() => loadStopForMcp(SECRET))).days[0]).toEqual(arriving);

    const day = await as(OWNER)(() => loadDayForMcp(TRIP_ID, "2027-06-04"));
    if ("success" in day) throw new Error("expected a day");
    expect(day.stop?.id).toBe(SECRET); // the arriving Stop…
    expect(day.timeline).toContainEqual(expect.objectContaining({ kind: "item", item: expect.objectContaining({ id: FAREWELL, owningStop: { id: PORTO, name: "IT Porto" } }) })); // …but the lunch is Porto's

    expect((await as(OWNER)(() => loadItemForMcp(FAREWELL))).owningStop).toEqual({ id: PORTO, name: "IT Porto" });
  });
```

- [ ] **Step 2: Run them, expect FAIL**: `npx vitest run lib/mcp/reads/plan-shapes.test.ts` fails on `owningStop` undefined and `stopNameById` unknown. The integration file with `INTEGRATION=1` fails the same way.

- [ ] **Step 3: Implement**

`plan-shapes.ts`:
```ts
/** CONTEXT.md "Changeover day" (ADR 0049): the one Stop a scheduled thing is counted against. */
export interface McpOwningStop {
  id: string;
  name: string;
}

// McpDayItem — add:
  /**
   * The Stop this thing is owned by: the one whose Budget line its Cost counts
   * against. On a Changeover day the thing is listed under both Stops' days
   * (and get_day's stop is the arriving one), but it has this one owner.
   * Null for a dated thing with no Stop.
   */
  owningStop: McpOwningStop | null;

export function owningStopRef(stopId: string | null | undefined, names: ReadonlyMap<string, string>): McpOwningStop | null {
  if (!stopId) return null;
  // Only get_day can miss a name: its rows hold dated Stops, so the owner would be a rough Stop.
  return { id: stopId, name: names.get(stopId) ?? "a Stop with no dates yet" };
}

export function toMcpDayItem(i: StopDayItem, filesFor: FilesFor, stopNameById: ReadonlyMap<string, string>): McpDayItem {
  return {
    id: i.id, title: i.title, category: i.category,
    startTime: i.startTime ?? null, endTime: i.endTime ?? null, address: i.address ?? null,
    link: i.link ?? null, booking: i.booking ?? null, notes: i.notes ?? null,
    openingHours: readStoredOpeningHours(i.openingHours ?? null),
    owningStop: owningStopRef(i.stopId, stopNameById),
    files: filesFor("ITEM", i.id), surprise: toMcpSurprise(i.surprise),
  };
}

export function toMcpItem(i: McpItemRow & { surprise: SurpriseView | null }, filesFor: FilesFor, stopNameById: ReadonlyMap<string, string>): McpItem {
  return { ...toMcpDayItem(i as unknown as StopDayItem, filesFor, stopNameById), date: i.date, stopId: i.stopId };
}
// buildMcpStops: add `stopNameById: ReadonlyMap<string, string>;` to the input type, destructure it,
// and at line 317: .map((i) => toMcpDayItem(i, filesFor, stopNameById))
```
`trip-plan.ts`: move `const stopNameById = new Map(stops.map((s) => [s.id, s.name]));` to just after `const stops = maskSurpriseStops(...)`. Pass `stopNameById` into `buildMcpStops({...})`. Change line 108 to `toMcpItem(i, filesFor, stopNameById)`. A hidden Surprise Stop keeps its name (its shell), so every owner resolves.

`entities.ts`:
- `loadItemForMcp`: add `row.stopId ? db.stop.findFirst({ where: { id: row.stopId, tripId, ...REAL_PLAN }, select: { id: true, name: true } }) : Promise.resolve(null)` to the `Promise.all` as `owner`, then call `toMcpItem({...}, filesFrom(files), new Map(owner ? [[owner.id, owner.name]] : []))`.
- `readMcpStops`: add `db.stop.findMany({ where: { tripId, ...REAL_PLAN }, select: { id: true, name: true } })` to the first `Promise.all` as `names`, then pass `stopNameById: new Map(names.map((s) => [s.id, s.name]))` to `buildMcpStops`. A Stop's name is its shell, so this needs no Surprise fragment, as `loadTransportForMcp`'s endpoints show.

`day.ts`: move `const stopName = new Map(rows.stops.map((s) => [s.id, s.name]));` above `const item = …`, and use `toMcpDayItem(e.item, filesFor, stopName)`.

`reads.ts` descriptions:
- get_trip_plan (line 208): after "Day titles, things to do or see," add "each day's things naming their owningStop: on a Changeover day (one day two Stops share) a thing is listed under both Stops but is owned by, and costed against, that one Stop,".
- get_stop (line 220): append "Each day's things name their owningStop, which on a Changeover day may be the neighbouring Stop."
- get_day (line 267): after "the day's Stop (the arriving one on a Changeover day)", add "; each thing names its owningStop, which on a Changeover day can be the departing Stop".

- [ ] **Step 4: Run them, expect PASS**:
  - `npx vitest run lib/mcp/`
  - `INTEGRATION=1 … npx vitest run test/integration/mcp-narrow-reads.test.ts`. Every F.8 case is unchanged and passes: get_item's `daySlice` still equals the day item, because both now carry the same `owningStop` and `openingHours`.
- [ ] **Step 5: Task-done check**:
  - `npx vitest related --run lib/mcp/reads/plan-shapes.ts lib/mcp/reads/trip-plan.ts lib/mcp/reads/entities.ts lib/mcp/reads/day.ts lib/mcp/tools/reads.ts`
  - `npx tsc --noEmit`
  - `npx eslint` on the changed files
  - the integration file
- [ ] **Step 6: Commit**: the message is `feat(mcp): every day item names its owning Stop (Changeover day, ADR 0049)`. It carries no Feedback trailer: R5 is item 9 of `cmvaig9lq…`, which closes on Branch 2's last task.

---

## Task Z: Branch 1 gate, and the spec says what was built

**Files:** `docs/specs/2026-10-17-planning-model-and-review.md` (Branch 1 "As built" + status), `docs/open-follow-ups.md` (follow-ups the section Notes name).

- [ ] **Step 1: The gate.** Run each of these and fix any failure in its own `fix(...)` commit that names the task it came from:
  - `npm test`
  - `npx tsc --noEmit`
  - `npx eslint .` (0 errors)
  - `npm run knip`
  - the integration tier against the sandbox Postgres: start it, `npx prisma migrate deploy`, then `npm run test:integration` with the localhost URLs exported
  - `npm run build` in a throwaway copy: `git archive HEAD`, copy `node_modules` (symlinking breaks Turbopack), and a hand-written localhost-only `.env`. Delete the copy afterwards.
- [ ] **Step 2: As built.** Add a "Branch 1: as built (date)" section to the spec, with one line per decision from the S, A, B, C and D Notes, plus every deviation an implementer reported. Call out what a Traveller sees. That includes: existing legs and stays without a reference now read To book, so "Still to book" fills up on day one; the plan row's "Booked" pill follows the Booking state; and placed copies get their idea's opening hours.
- [ ] **Step 3: Status line.** Set it to: Branch 1 built on `feat/planning-model`; awaiting Cam's review, merge and deploy; on deploy, resolve `cmvaig4j5000u07gwgeqrvtkd`.
- [ ] **Step 4: Commit.** `docs: planning model (Branch 1) built — as-built notes, follow-ups`
