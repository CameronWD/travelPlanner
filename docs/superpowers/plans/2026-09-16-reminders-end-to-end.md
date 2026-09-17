# Reminders End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TEEPEE's reminders actually reach a phone — clock-precise **Alarms** published into the Calendar feed, and one daily **Digest** push per person per trip, dispatched at fixed UTC hours filtered by each subscriber's captured timezone.

**Architecture:** Two delivery mechanisms, split by what each is good at (ADR 0047). Alarms are `VALARM` blocks inside the existing ICS feed — the traveller's calendar app fires them; we never see them. The Digest is a single web-push per person per trip per day, built by a pure function from plan data and dispatched by the existing cron route, which now runs at 06:00/09:00/19:00/20:00 UTC and sends only to devices whose local hour is 07 (travel-day morning) or 20 (evening look-ahead). A dispatch ledger keyed (user, trip, local date, slot) makes re-runs idempotent.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 + Neon Postgres, `web-push`, Vitest + Testing Library, RFC-5545 ICS.

## Global Constraints

- Work on branch `feat/reminders-end-to-end`. Never commit to `main`. Never deploy.
- **This sandbox has no Postgres.** Migrations are hand-written SQL in `prisma/migrations/<timestamp>_<name>/migration.sql` matching `prisma/schema.prisma` by hand — never run `prisma migrate dev`. Tests mock `@/lib/db`.
- **Read `CONTEXT.md` before touching anything.** The words **Alarm**, **Digest** and **Reminder** were defined for this work. Never use "notification" for a push — that word means the Activity bell's unread count.
- Auth ordering is load-bearing: `requireTripAccess` / `requireUser` must be the **first** statement in any route or server action. Never put a validation check above an auth check.
- The schema stores enum-ish values as `String` and JSON as a `String` of JSON. Do not introduce Prisma `enum` or `Json` types.
- Timezone-sensitive tests must pin `TZ` or pass an explicit zone. The bug class here is "passes in the dev machine's timezone".
- Run `npm run test` before every commit. Run `npm run lint` and `npx tsc --noEmit` before the final commit.
- Dates in this codebase are `"YYYY-MM-DD"` strings; use helpers from `@/lib/dates` (`addDays`, `daysBetween`) and `@/lib/tz` (`instantToZonedDateISO`, `instantToZonedTime`, `zonedWallTimeToInstant`) rather than hand-rolling arithmetic.

## Deliberately out of scope

- **Per-content Digest toggles** (payments/checklist/tomorrow separately). One Digest switch per person; two Alarm switches per trip. Decided in the spec.
- **Per-event push for timed Items and check-ins.** They appear in the Digest's "tomorrow" section only.
- **Merging Digests across multiple trips.** Two opted-in trips means two evening pushes.
- **Per-traveller calendar feed tokens.** The feed stays one per trip; each person silences alarms in their own calendar app.

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `Reminder` remodelled; `PushSubscription.timezone`; `CalendarFeed` alarm flags; new `DigestPreference`, `DigestDispatch` |
| `lib/ics.ts` | Pure ICS serializer — gains `VALARM` emission |
| `lib/digest.ts` | **New.** Pure Digest builder: plan data in, `{title, body, url}` or `null` out |
| `lib/digest-dispatch.ts` | **New.** DB-backed: collect a trip's digest input, claim the ledger, push to one user |
| `server/actions/reminders.ts` | Dated-note CRUD (no more `fireAt`) |
| `server/actions/digest.ts` | **New.** Digest opt-in toggle + "send me a test" |
| `server/actions/calendar-feed.ts` | Gains `updateCalendarFeedAlarms` |
| `server/actions/push.ts` | `subscribeToPush` captures the device timezone |
| `app/api/cron/reminders/route.ts` | Slot/timezone dispatcher — replaces both existing passes |
| `app/api/calendar/[token]/route.ts` | Feeds alarm flags + check-out times into `buildICS` |
| `components/trip/enable-notifications.tsx` | Timezone capture + iOS-not-installed state |
| `components/trip/settings/reminders-panel.tsx` | **New.** The Settings "Reminders" section |
| `components/trip/settings/calendar-feed-panel.tsx` | Alarm toggles + the iOS "Remove Alerts" instruction |
| `components/trip/reminders-card.tsx` | Date-only Reminder UI |
| `app/(app)/trips/[tripId]/page.tsx` | Renders Reminders in every phase |
| `.github/workflows/reminders-cron.yml` | Four UTC hours instead of one |

---

### Task 1: Schema, migration and the ADR correction

Data model only — no behaviour. Everything downstream depends on these names.

**Files:**
- Modify: `prisma/schema.prisma` (`Reminder` at line 510, `PushSubscription` at line 550, `CalendarFeed` at line 536)
- Create: `prisma/migrations/20260916000000_digest_and_alarms/migration.sql`

**Interfaces produced** (every later task depends on these exact names):
- `Reminder { id, tripId, title, date: String /* YYYY-MM-DD */, createdAt }` — `fireAt`, `sent`, `targetType`, `targetId` are **gone**.
- `PushSubscription.timezone: String?` — IANA zone captured from the browser.
- `CalendarFeed.alarmTransport: Boolean @default(true)`, `CalendarFeed.alarmCheckOut: Boolean @default(true)`.
- `DigestPreference { id, userId, tripId, enabled: Boolean @default(true), createdAt, updatedAt }` with `@@unique([userId, tripId])`.
- `DigestDispatch { id, userId, tripId, localDate: String, slot: String, createdAt }` with `@@unique([userId, tripId, localDate, slot])`.

`slot` is `"MORNING"` or `"EVENING"` (string, per the no-enum convention).

- [ ] **Step 1: Remodel `Reminder` in `prisma/schema.prisma`**

Replace the existing `model Reminder` block with:

```prisma
/// A Traveller's dated note (CONTEXT.md "Reminder"). Carries a date and never
/// a time: TEEPEE dispatches at a few fixed hours, so a promised 14:30 would
/// be a lie — an Alarm is what fires precisely. Surfaces in that day's Digest
/// and on Home. See ADR 0047.
model Reminder {
  id     String @id @default(cuid())
  tripId String
  title  String
  date   String // "YYYY-MM-DD"

  trip Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@index([tripId])
  @@index([date])
}
```

- [ ] **Step 2: Add the remaining fields and models**

Add `timezone String?` to `model PushSubscription` (after `auth`), with the comment `// IANA zone captured from the browser at subscribe time (ADR 0047)`.

Add to `model CalendarFeed`, after `includeActivities`:

```prisma
  // Alarms the external calendar app fires (CONTEXT.md "Alarm"). Default on so
  // an existing feed starts alerting as soon as its subscriber allows it.
  alarmTransport Boolean @default(true)
  alarmCheckOut  Boolean @default(true)
```

Add two new models at the end of the file:

```prisma
/// One Traveller's Digest opt-in for one Trip (ADR 0047). Absent row means
/// "never chosen" and is treated as enabled — subscribing a device is itself
/// the opt-in, so an existing subscriber is not silently muted by a missing row.
model DigestPreference {
  id      String  @id @default(cuid())
  userId  String
  tripId  String
  enabled Boolean @default(true)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  trip Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, tripId])
  @@index([tripId])
}

/// Idempotency ledger: one row per Digest actually claimed for a person, Trip,
/// local date and slot. Claimed BEFORE sending, so a re-run (or two overlapping
/// cron runs) can never double-send. Replaces the old per-cost COST_DUE marker.
model DigestDispatch {
  id        String @id @default(cuid())
  userId    String
  tripId    String
  localDate String // "YYYY-MM-DD" in the subscriber's own timezone
  slot      String // "MORNING" | "EVENING"

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  trip Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@unique([userId, tripId, localDate, slot])
  @@index([tripId])
}
```

Add the back-relations: `digestPreferences DigestPreference[]` and `digestDispatches DigestDispatch[]` on both `model User` and `model Trip`.

- [ ] **Step 3: Hand-write the migration**

Create `prisma/migrations/20260916000000_digest_and_alarms/migration.sql`:

```sql
-- Reminders become dated notes (ADR 0047): no firing instant, no sent flag, no
-- target reference. The COST_DUE marker rows they also held are retired —
-- idempotency moves to DigestDispatch. Production held zero Reminder rows when
-- this was written (verified before deploy); the DELETE makes the NOT NULL
-- column addition safe regardless.
DELETE FROM "Reminder";
ALTER TABLE "Reminder" DROP COLUMN "fireAt";
ALTER TABLE "Reminder" DROP COLUMN "sent";
ALTER TABLE "Reminder" DROP COLUMN "targetType";
ALTER TABLE "Reminder" DROP COLUMN "targetId";
ALTER TABLE "Reminder" ADD COLUMN "date" TEXT NOT NULL;
CREATE INDEX "Reminder_date_idx" ON "Reminder"("date");

-- The device's own timezone decides its Digest hour and what "today" means.
ALTER TABLE "PushSubscription" ADD COLUMN "timezone" TEXT;

-- Alarms published into the feed for the calendar app to fire.
ALTER TABLE "CalendarFeed" ADD COLUMN "alarmTransport" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CalendarFeed" ADD COLUMN "alarmCheckOut" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "DigestPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DigestPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DigestPreference_userId_tripId_key" ON "DigestPreference"("userId", "tripId");
CREATE INDEX "DigestPreference_tripId_idx" ON "DigestPreference"("tripId");
ALTER TABLE "DigestPreference" ADD CONSTRAINT "DigestPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigestPreference" ADD CONSTRAINT "DigestPreference_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DigestDispatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DigestDispatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DigestDispatch_userId_tripId_localDate_slot_key" ON "DigestDispatch"("userId", "tripId", "localDate", "slot");
CREATE INDEX "DigestDispatch_tripId_idx" ON "DigestDispatch"("tripId");
ALTER TABLE "DigestDispatch" ADD CONSTRAINT "DigestDispatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigestDispatch" ADD CONSTRAINT "DigestDispatch_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Regenerate the Prisma client and typecheck**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: `prisma generate` succeeds. **`tsc` will report errors** in `app/api/cron/reminders/route.ts`, `server/actions/reminders.ts`, `components/trip/reminders-card.tsx` and `components/trip/home/phase-travelling.tsx` — all reference the dropped `fireAt`/`sent` fields. That is expected at this task; Tasks 8 and 9 fix them. Record the exact error list in your report so the later tasks can be checked against it.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260916000000_digest_and_alarms
git commit -m "feat(reminders): remodel Reminder as a dated note, add Digest tables

Reminder loses fireAt/sent/targetType/targetId and gains a date. Digest
opt-in and the dispatch ledger get their own tables; PushSubscription
carries the device timezone; CalendarFeed carries the two Alarm switches.

See ADR 0047."
```

---

### Task 2: `VALARM` emission in the ICS builder

Pure function work, fully testable, no DB. The feed currently emits no alarm data at all.

**Files:**
- Modify: `lib/ics.ts`
- Test: `lib/ics.test.ts` (existing file — append a new `describe`)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `IcsAccommodation` gains `checkOutTime?: string | null` and `stopId?: string | null`.
  - `IcsInput` gains `alarms?: { transport: boolean; checkOut: boolean }` — **absent means both off**, so every existing caller and test keeps its current output.
  - Exported constant `FLIGHT_ALARM_LEAD_MINUTES = 180` and `TRANSPORT_ALARM_LEAD_MINUTES = 120`.
  - Exported constant `CHECK_OUT_ALARM_LOCAL_TIME = "08:00"`.

**Alarm rules** (from ADR 0047):
- Transport with a `depAt`: one `VALARM`, `TRIGGER:-PT3H` when `mode === "FLIGHT"`, otherwise `TRIGGER:-PT2H`. Relative triggers are safe here because the event is timed.
- Accommodation: one `VALARM` on the stay event, with an **absolute** trigger at 08:00 local on the check-out date — resolved with `zonedWallTimeToInstant(checkOut, "08:00", tz)` where `tz` is the stay's stop timezone, falling back to `"UTC"`. Absolute because the stay is an all-day event and relative triggers against `VALUE=DATE` are interpreted inconsistently across clients.

- [ ] **Step 1: Write the failing tests**

Append to `lib/ics.test.ts`. Read the top of that file first and reuse its existing helper for building an `IcsInput` if one exists; otherwise build the input inline as below.

```ts
describe("alarms", () => {
  const base = {
    tripName: "Trip",
    stops: [{ id: "stop-1", name: "Vienna", timezone: "Europe/Vienna" }],
    items: [],
    transports: [],
    accommodations: [],
    generatedAt: new Date("2026-09-16T00:00:00Z"),
  };

  const flight = {
    id: "t1",
    mode: "FLIGHT",
    depPlace: "Sydney",
    arrPlace: "Vienna",
    depAt: new Date("2026-12-01T09:40:00Z"),
    arrAt: new Date("2026-12-01T21:40:00Z"),
  };
  const train = { ...flight, id: "t2", mode: "TRAIN" };

  it("emits no VALARM when alarms are not requested", () => {
    const ics = buildICS({ ...base, transports: [flight] });
    expect(ics).not.toContain("BEGIN:VALARM");
  });

  it("gives a flight a three-hour lead", () => {
    const ics = buildICS({
      ...base,
      transports: [flight],
      alarms: { transport: true, checkOut: false },
    });
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT3H");
    expect(ics).toContain("ACTION:DISPLAY");
  });

  it("gives other transport a two-hour lead", () => {
    const ics = buildICS({
      ...base,
      transports: [train],
      alarms: { transport: true, checkOut: false },
    });
    expect(ics).toContain("TRIGGER:-PT2H");
    expect(ics).not.toContain("TRIGGER:-PT3H");
  });

  it("omits transport alarms when only check-out alarms are on", () => {
    const ics = buildICS({
      ...base,
      transports: [flight],
      alarms: { transport: false, checkOut: true },
    });
    expect(ics).not.toContain("BEGIN:VALARM");
  });

  it("triggers a check-out alarm at 08:00 in the stop's timezone", () => {
    const ics = buildICS({
      ...base,
      accommodations: [
        {
          id: "a1",
          name: "Hotel Sacher",
          checkIn: "2026-12-02",
          checkOut: "2026-12-05",
          checkOutTime: "10:00",
          stopId: "stop-1",
        },
      ],
      alarms: { transport: false, checkOut: true },
    });
    // Europe/Vienna is UTC+1 in December, so 08:00 local is 07:00Z.
    expect(ics).toContain("TRIGGER;VALUE=DATE-TIME:20261205T070000Z");
  });

  it("falls back to UTC when the stay's stop has no timezone", () => {
    const ics = buildICS({
      ...base,
      stops: [],
      accommodations: [
        { id: "a1", name: "Hostel", checkIn: "2026-12-02", checkOut: "2026-12-05", stopId: "stop-gone" },
      ],
      alarms: { transport: false, checkOut: true },
    });
    expect(ics).toContain("TRIGGER;VALUE=DATE-TIME:20261205T080000Z");
  });

  it("names the check-out in the alarm description", () => {
    const ics = buildICS({
      ...base,
      accommodations: [
        { id: "a1", name: "Hotel Sacher", checkIn: "2026-12-02", checkOut: "2026-12-05", checkOutTime: "10:00", stopId: "stop-1" },
      ],
      alarms: { transport: false, checkOut: true },
    });
    expect(ics).toContain("DESCRIPTION:Check out of Hotel Sacher by 10:00");
  });

  it("keeps the alarm inside its own VEVENT", () => {
    const ics = buildICS({
      ...base,
      transports: [flight],
      alarms: { transport: true, checkOut: false },
    });
    const event = ics.slice(ics.indexOf("BEGIN:VEVENT"), ics.indexOf("END:VEVENT"));
    expect(event).toContain("BEGIN:VALARM");
    expect(event).toContain("END:VALARM");
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run lib/ics.test.ts`
Expected: the seven new tests fail (no `BEGIN:VALARM` in output); every pre-existing test in the file still passes.

- [ ] **Step 3: Implement**

In `lib/ics.ts`:

1. Import `zonedWallTimeToInstant` (already imported) and add the constants near the top:

```ts
/** Lead times for Alarms published into the feed (ADR 0047). */
export const FLIGHT_ALARM_LEAD_MINUTES = 180;
export const TRANSPORT_ALARM_LEAD_MINUTES = 120;
/** Local wall-clock time a check-out Alarm fires on the check-out day. */
export const CHECK_OUT_ALARM_LOCAL_TIME = "08:00";
```

2. Extend the interfaces:

```ts
export interface IcsAccommodation {
  // ...existing fields...
  checkOutTime?: string | null;
  stopId?: string | null;
}

export interface IcsAlarmOptions {
  transport: boolean;
  checkOut: boolean;
}

export interface IcsInput {
  // ...existing fields...
  /** Absent means no alarms are published at all. */
  alarms?: IcsAlarmOptions;
}
```

3. Give the `event()` helper an eighth parameter `alarmLines?: string[]` and push them after `CATEGORIES` and before `END:VEVENT`:

```ts
    if (category) lines.push(`CATEGORIES:${esc(category)}`);
    if (alarmLines) lines.push(...alarmLines);
    lines.push("END:VEVENT");
```

4. Add a builder above `buildICS`:

```ts
/** A DISPLAY VALARM block. `trigger` is the full TRIGGER line's value part. */
function alarmBlock(triggerLine: string, description: string): string[] {
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    triggerLine,
    `DESCRIPTION:${esc(description)}`,
    "END:VALARM",
  ];
}
```

5. In the Transport loop, before calling `event(...)`:

```ts
    const alarm =
      input.alarms?.transport === true
        ? alarmBlock(
            `TRIGGER:-PT${t.mode === "FLIGHT" ? FLIGHT_ALARM_LEAD_MINUTES / 60 : TRANSPORT_ALARM_LEAD_MINUTES / 60}H`,
            `${route} departs soon`,
          )
        : undefined;
```

and pass `alarm` as the final argument.

6. In the Accommodation loop, before calling `event(...)`:

```ts
    const tz = (a.stopId && tzById.get(a.stopId)) || "UTC";
    const alarm =
      input.alarms?.checkOut === true
        ? alarmBlock(
            `TRIGGER;VALUE=DATE-TIME:${utcStamp(
              zonedWallTimeToInstant(a.checkOut, CHECK_OUT_ALARM_LOCAL_TIME, tz),
            )}`,
            `Check out of ${a.name}${a.checkOutTime ? ` by ${a.checkOutTime}` : ""}`,
          )
        : undefined;
```

and pass it as the final argument.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/ics.test.ts`
Expected: all pass, including every pre-existing test.

- [ ] **Step 5: Commit**

```bash
git add lib/ics.ts lib/ics.test.ts
git commit -m "feat(ics): publish Alarms for departures and check-outs

Flights get a 3h lead, other transport 2h, and a stay gets an absolute
trigger at 08:00 local on its check-out day. Absent alarm options means no
VALARM at all, so existing feeds are byte-identical until switched on."
```

---

### Task 3: Wire Alarms through the feed route, the toggles and the iOS instruction

Makes Task 2 reachable. The one-time iOS setting is product surface here — a stripped alarm is silent.

**Files:**
- Modify: `app/api/calendar/[token]/route.ts`
- Modify: `server/actions/calendar-feed.ts`
- Modify: `components/trip/settings/calendar-feed-panel.tsx`
- Modify: `app/(app)/trips/[tripId]/settings/page.tsx:157-177` (the Calendar feed card)
- Test: `server/actions/calendar-feed.test.ts` (existing), `components/trip/settings/calendar-feed-panel.test.tsx` (existing)

**Interfaces:**
- Consumes: `CalendarFeed.alarmTransport` / `alarmCheckOut` (Task 1); `IcsInput.alarms`, `IcsAccommodation.checkOutTime`/`stopId` (Task 2).
- Produces: `updateCalendarFeedAlarms(tripId: string, alarms: { alarmTransport: boolean; alarmCheckOut: boolean }): Promise<void>` in `server/actions/calendar-feed.ts`; `CalendarFeedState` gains `alarmTransport: boolean; alarmCheckOut: boolean`.

- [ ] **Step 1: Write the failing action test**

Append to `server/actions/calendar-feed.test.ts`, following that file's existing mock setup:

```ts
describe("updateCalendarFeedAlarms", () => {
  it("checks trip access first", async () => {
    await updateCalendarFeedAlarms("trip-1", { alarmTransport: false, alarmCheckOut: true });
    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
  });

  it("writes both flags with updateMany so a missing feed is a no-op", async () => {
    await updateCalendarFeedAlarms("trip-1", { alarmTransport: false, alarmCheckOut: true });
    expect(calendarFeedUpdateManyMock).toHaveBeenCalledWith({
      where: { tripId: "trip-1" },
      data: { alarmTransport: false, alarmCheckOut: true },
    });
  });

  it("revalidates the settings page", async () => {
    await updateCalendarFeedAlarms("trip-1", { alarmTransport: true, alarmCheckOut: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1/settings");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run server/actions/calendar-feed.test.ts`
Expected: FAIL — `updateCalendarFeedAlarms is not a function`.

- [ ] **Step 3: Implement the action and widen the state**

In `server/actions/calendar-feed.ts`, add `alarmTransport: boolean; alarmCheckOut: boolean` to `CalendarFeedState`, add both to the `select` in `getCalendarFeed`, and append:

```ts
/**
 * Update which Alarms the trip's calendar feed publishes (CONTEXT.md "Alarm").
 * No-op when no feed exists. Same token — calendars pick the change up on their
 * next refresh, which can be up to a day on Google (ADR 0047).
 *
 * Access-checked: the calling user must be a member of the trip.
 */
export async function updateCalendarFeedAlarms(
  tripId: string,
  alarms: { alarmTransport: boolean; alarmCheckOut: boolean },
): Promise<void> {
  await requireTripAccess(tripId);

  await db.calendarFeed.updateMany({
    where: { tripId },
    data: {
      alarmTransport: alarms.alarmTransport,
      alarmCheckOut: alarms.alarmCheckOut,
    },
  });

  revalidatePath(`/trips/${tripId}/settings`);
}
```

- [ ] **Step 4: Feed the flags into the ICS route**

In `app/api/calendar/[token]/route.ts`: add `alarmTransport: true, alarmCheckOut: true` to the feed `select`; add `checkOutTime: true, stopId: true` to the `accommodation.findMany` select; and pass to `buildICS`:

```ts
    alarms: { transport: feed.alarmTransport, checkOut: feed.alarmCheckOut },
```

- [ ] **Step 5: Add the toggles and the iOS instruction to the panel**

In `components/trip/settings/calendar-feed-panel.tsx`, mirror the existing include-filter toggle pattern exactly (same control, same optimistic-update approach, same `useTransition` usage) for two new switches labelled **"Alarm before departures"** and **"Alarm on check-out mornings"**, calling `updateCalendarFeedAlarms`. Beneath them add this copy verbatim — it is the whole reason the alarms work or silently don't:

```tsx
<p className="mt-2 text-xs text-muted-foreground">
  <strong className="font-medium text-foreground">On iPhone, do this once:</strong>{" "}
  Settings → Apps → Calendar → Accounts → Subscribed Calendars → this trip →
  turn <strong className="font-medium text-foreground">Remove Alerts</strong> off.
  iOS strips alarms from subscribed calendars by default, and nothing tells you
  it has.
</p>
```

Extend `components/trip/settings/calendar-feed-panel.test.tsx` with a test that toggling "Alarm before departures" calls `updateCalendarFeedAlarms` with `{ alarmTransport: false, alarmCheckOut: true }` when it starts on, and one asserting the iOS instruction text renders.

- [ ] **Step 6: Pass the new props from the settings page**

In `app/(app)/trips/[tripId]/settings/page.tsx`, extend the `initialFilter` prop object (or add a sibling `initialAlarms` prop — match whatever shape you gave the panel) with `alarmTransport` and `alarmCheckOut` from `calendarFeed`, defaulting both to `true` when `calendarFeed` is null.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run server/actions/calendar-feed.test.ts components/trip/settings/calendar-feed-panel.test.tsx app/\(app\)/trips/\[tripId\]/settings/page.test.tsx`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add server/actions/calendar-feed.ts server/actions/calendar-feed.test.ts app/api/calendar components/trip/settings app/\(app\)/trips/\[tripId\]/settings
git commit -m "feat(calendar): publish Alarms and explain the iOS Remove Alerts trap

Two trip-level switches decide whether the feed carries departure and
check-out Alarms. iOS subscribes with Remove Alerts on by default, which
strips them silently, so the panel spells out the one-time fix."
```

---

### Task 4: The Digest builder

The heart of the feature. Pure, no DB, no env, no Prisma types — plain data in, one push payload or `null` out.

**Files:**
- Create: `lib/digest.ts`
- Test: `lib/digest.test.ts`

**Interfaces:**
- Consumes: `TripPhase` from `@/lib/trip-phase`.
- Produces (later tasks depend on these exact names):

```ts
export type DigestSlot = "MORNING" | "EVENING";

export interface DigestPaymentLine { id: string; label: string; amountLabel: string; daysUntil: number }
export interface DigestChecklistLine { id: string; text: string; daysUntil: number }
export interface DigestReminderLine { id: string; title: string }
export interface DigestTransportLine { id: string; mode: string; route: string; localTime: string | null }
export interface DigestStayLine { id: string; name: string; kind: "CHECK_IN" | "CHECK_OUT"; localTime: string | null }
export interface DigestItemLine { id: string; title: string; localTime: string | null }

export interface DigestInput {
  tripId: string;
  slot: DigestSlot;
  phase: TripPhase;
  payments: DigestPaymentLine[];
  checklist: DigestChecklistLine[];
  reminders: DigestReminderLine[];
  /** EVENING: tomorrow's plan. MORNING: today's. Empty outside "travelling". */
  schedule: {
    transports: DigestTransportLine[];
    stays: DigestStayLine[];
    items: DigestItemLine[];
  };
}

export interface DigestPayload { title: string; body: string; url: string }

export const DIGEST_MAX_LINES = 6;

export function buildDigest(input: DigestInput): DigestPayload | null;
```

**Rules:**
- Returns `null` when there are no lines at all.
- **MORNING returns `null` unless `schedule.transports` or a `CHECK_OUT` stay is present** — the morning slot exists only as insurance for travel days, and must not repeat the evening's payment and checklist lines. Build morning bodies from `schedule` only.
- Title: `"Today"` for MORNING; `"Tomorrow"` for EVENING when `phase === "travelling"`; `"Coming up"` for EVENING otherwise.
- Line order: payments, checklist, reminders, transports, stays, items.
- `url` is `/trips/{tripId}/budget` when **every** line is a payment; otherwise `/trips/{tripId}`.
- At most `DIGEST_MAX_LINES` lines; if more, keep the first six and append `+N more`.
- Line text:
  - payment → `` `${amountLabel} ${label} comes out today` `` when `daysUntil === 0`, else `` `${amountLabel} ${label} comes out in ${daysUntil} days` ``
  - checklist → `` `Checklist: ${text} due today` `` / `` `... due in ${daysUntil} days` ``
  - reminder → `title` verbatim
  - transport → `` `${localTime} ${routeWord} ${route}` `` where `routeWord` is the lower-cased mode (`FLIGHT` → `flight`); when `localTime` is null, drop the leading time and the space
  - stay CHECK_OUT → `` `Check out of ${name} by ${localTime}` `` (or `` `Check out of ${name}` `` when null)
  - stay CHECK_IN → `` `Check in at ${name} from ${localTime}` `` (or `` `Check in at ${name}` ``)
  - item → `` `${localTime} ${title}` `` (or `title` when null)
- `body` joins lines with `"\n"`.

- [ ] **Step 1: Write the failing tests**

Create `lib/digest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDigest, type DigestInput } from "@/lib/digest";

function input(over: Partial<DigestInput> = {}): DigestInput {
  return {
    tripId: "trip-1",
    slot: "EVENING",
    phase: "planning",
    payments: [],
    checklist: [],
    reminders: [],
    schedule: { transports: [], stays: [], items: [] },
    ...over,
  };
}

describe("buildDigest", () => {
  it("returns null when there is nothing to say", () => {
    expect(buildDigest(input())).toBeNull();
  });

  it("titles a pre-trip evening digest 'Coming up'", () => {
    const d = buildDigest(
      input({ payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 3 }] }),
    );
    expect(d?.title).toBe("Coming up");
    expect(d?.body).toBe("£240 Airbnb comes out in 3 days");
  });

  it("titles a travelling evening digest 'Tomorrow'", () => {
    const d = buildDigest(
      input({
        phase: "travelling",
        schedule: {
          transports: [{ id: "t1", mode: "TRAIN", route: "Vienna → Prague", localTime: "09:40" }],
          stays: [],
          items: [],
        },
      }),
    );
    expect(d?.title).toBe("Tomorrow");
    expect(d?.body).toBe("09:40 train Vienna → Prague");
  });

  it("says 'comes out today' at zero days", () => {
    const d = buildDigest(
      input({ payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 0 }] }),
    );
    expect(d?.body).toBe("£240 Airbnb comes out today");
  });

  it("points a payments-only digest at the budget", () => {
    const d = buildDigest(
      input({ payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 0 }] }),
    );
    expect(d?.url).toBe("/trips/trip-1/budget");
  });

  it("points a mixed digest at the trip home", () => {
    const d = buildDigest(
      input({
        payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 0 }],
        reminders: [{ id: "r1", title: "Print the insurance docs" }],
      }),
    );
    expect(d?.url).toBe("/trips/trip-1");
  });

  it("orders payments, then checklist, then reminders, then the schedule", () => {
    const d = buildDigest(
      input({
        phase: "travelling",
        payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 0 }],
        checklist: [{ id: "k1", text: "visa application", daysUntil: 3 }],
        reminders: [{ id: "r1", title: "Print the insurance docs" }],
        schedule: {
          transports: [{ id: "t1", mode: "FLIGHT", route: "Sydney → Vienna", localTime: "09:40" }],
          stays: [{ id: "a1", name: "Hotel Sacher", kind: "CHECK_OUT", localTime: "10:00" }],
          items: [{ id: "i1", title: "Christmas market", localTime: "18:00" }],
        },
      }),
    );
    expect(d?.body.split("\n")).toEqual([
      "£240 Airbnb comes out today",
      "Checklist: visa application due in 3 days",
      "Print the insurance docs",
      "09:40 flight Sydney → Vienna",
      "Check out of Hotel Sacher by 10:00",
      "18:00 Christmas market",
    ]);
  });

  it("caps the body at six lines and counts the rest", () => {
    const d = buildDigest(
      input({
        reminders: Array.from({ length: 9 }, (_, i) => ({ id: `r${i}`, title: `Note ${i}` })),
      }),
    );
    const lines = d!.body.split("\n");
    expect(lines).toHaveLength(7);
    expect(lines[6]).toBe("+3 more");
  });

  it("drops the time when an item or stay has none", () => {
    const d = buildDigest(
      input({
        phase: "travelling",
        schedule: {
          transports: [],
          stays: [{ id: "a1", name: "Hostel", kind: "CHECK_IN", localTime: null }],
          items: [{ id: "i1", title: "Wander", localTime: null }],
        },
      }),
    );
    expect(d?.body).toBe("Check in at Hostel\nWander");
  });

  describe("MORNING slot", () => {
    it("is silent when the day holds no transport and no check-out", () => {
      const d = buildDigest(
        input({
          slot: "MORNING",
          phase: "travelling",
          payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 0 }],
          reminders: [{ id: "r1", title: "Print the insurance docs" }],
          schedule: {
            transports: [],
            stays: [{ id: "a1", name: "Hotel", kind: "CHECK_IN", localTime: "15:00" }],
            items: [{ id: "i1", title: "Museum", localTime: "11:00" }],
          },
        }),
      );
      expect(d).toBeNull();
    });

    it("fires for a departure and titles itself 'Today'", () => {
      const d = buildDigest(
        input({
          slot: "MORNING",
          phase: "travelling",
          payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 0 }],
          schedule: {
            transports: [{ id: "t1", mode: "TRAIN", route: "Vienna → Prague", localTime: "09:40" }],
            stays: [],
            items: [],
          },
        }),
      );
      expect(d?.title).toBe("Today");
      // The evening slot already carried the payment; the morning is travel only.
      expect(d?.body).toBe("09:40 train Vienna → Prague");
    });

    it("fires for a check-out", () => {
      const d = buildDigest(
        input({
          slot: "MORNING",
          phase: "travelling",
          schedule: {
            transports: [],
            stays: [{ id: "a1", name: "Hotel Sacher", kind: "CHECK_OUT", localTime: "10:00" }],
            items: [],
          },
        }),
      );
      expect(d?.body).toBe("Check out of Hotel Sacher by 10:00");
    });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run lib/digest.test.ts`
Expected: FAIL — cannot resolve `@/lib/digest`.

- [ ] **Step 3: Implement `lib/digest.ts`**

Write the module to satisfy exactly the interface block above. Structure it as: one small formatter per line type, a `collectLines(input)` that returns `string[]` in the documented order (returning schedule-only lines for `MORNING`), then `buildDigest` applying the cap, the title rule and the url rule. Document at the top of the file that this is pure — no DB, no env, no `Date.now()` — so the dispatcher can be tested against it deterministically.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/digest.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/digest.ts lib/digest.test.ts
git commit -m "feat(digest): pure builder for the daily Digest payload

Phase-aware content, capped at six lines, silent when there is nothing to
say, and silent in the morning slot unless the day holds a departure or a
check-out. See ADR 0047."
```

---

### Task 5: Capture the device timezone when subscribing

Without this the dispatcher cannot know when 8pm is for anyone.

**Files:**
- Modify: `server/actions/push.ts`
- Modify: `components/trip/enable-notifications.tsx`
- Test: `server/actions/push.test.ts` (existing), `components/trip/enable-notifications.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `PushSubscription.timezone` (Task 1).
- Produces: `subscribeToPush(sub: { endpoint: string; keys: { p256dh: string; auth: string }; timezone?: string })` — `timezone` optional so an older client never breaks; persisted on both create and update so a returning device refreshes a stale zone.
- Produces: `isIosWithoutInstall(): boolean` exported from `components/trip/enable-notifications.tsx`.

- [ ] **Step 1: Write the failing action tests**

Append to `server/actions/push.test.ts`:

```ts
it("stores the device timezone on create and update", async () => {
  await subscribeToPush({
    endpoint: "https://push.example/1",
    keys: { p256dh: "p", auth: "a" },
    timezone: "Australia/Sydney",
  });

  expect(pushSubscriptionUpsertMock).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({ timezone: "Australia/Sydney" }),
      update: expect.objectContaining({ timezone: "Australia/Sydney" }),
    }),
  );
});

it("omits the timezone when the client did not send one", async () => {
  await subscribeToPush({ endpoint: "https://push.example/1", keys: { p256dh: "p", auth: "a" } });

  const arg = pushSubscriptionUpsertMock.mock.calls[0][0];
  expect(arg.create.timezone).toBeUndefined();
  expect(arg.update.timezone).toBeUndefined();
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run server/actions/push.test.ts`
Expected: FAIL — `timezone` missing from the upsert payload.

- [ ] **Step 3: Implement**

In `server/actions/push.ts`, widen the parameter type with `timezone?: string` and spread it conditionally into both branches so an absent value never overwrites a stored zone with `null`:

```ts
    const tz = sub.timezone ? { timezone: sub.timezone } : {};

    await db.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, ...tz },
      update: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, ...tz },
    });
```

- [ ] **Step 4: Send the timezone and handle iOS from the client**

In `components/trip/enable-notifications.tsx`:

1. Export the detector:

```ts
/**
 * iOS only permits web push from a PWA installed to the Home Screen — a normal
 * Safari tab cannot subscribe at all (ADR 0047). Detect that state so the
 * button explains itself instead of failing.
 */
export function isIosWithoutInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
}
```

2. Add a status branch above the `!supported || !configured` branch:

```tsx
  if (isIosWithoutInstall()) {
    return (
      <div className={className}>
        <Button variant="outline" size="sm" disabled className="gap-2">
          <BellOff className="size-4" aria-hidden="true" />
          Add to Home Screen first
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          iPhone only sends reminders to an installed app. Tap Share, then
          &ldquo;Add to Home Screen&rdquo;, open TEEPEE from there, and this
          button will work.
        </p>
      </div>
    );
  }
```

3. In `handleEnable`, pass the zone:

```ts
      await subscribeToPush({
        endpoint: subscription.endpoint,
        keys: { /* unchanged */ },
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
```

- [ ] **Step 5: Test the component**

Create or extend `components/trip/enable-notifications.test.tsx` with Testing Library, following the conventions in `components/trip/notification-bell.test.tsx`. Cover: an iOS user-agent without standalone renders "Add to Home Screen first" and no enable button; a desktop user-agent with the VAPID key set renders the enable button. Stub `navigator.userAgent` and `window.matchMedia` per test and restore them in `afterEach`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run server/actions/push.test.ts components/trip/enable-notifications.test.tsx`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add server/actions/push.ts server/actions/push.test.ts components/trip/enable-notifications.tsx components/trip/enable-notifications.test.tsx
git commit -m "feat(push): capture the device timezone and name the iOS install rule

The Digest fires at 8pm in the subscriber's own zone, so the zone is read
from the browser at subscribe time and refreshed on re-subscribe. iOS
cannot subscribe from a browser tab at all, so say that instead of failing."
```

---

### Task 6: Dispatch — collect, claim, send

The server half of the Digest: turn a (trip, user, local date, slot) into at most one push.

**Files:**
- Create: `lib/digest-dispatch.ts`
- Test: `lib/digest-dispatch.test.ts`

**Interfaces:**
- Consumes: `buildDigest`, `DigestInput`, `DigestSlot` (Task 4); `sendPush`, `buildNotificationPayload` (`@/lib/push`); `DigestDispatch`, `DigestPreference`, `PushSubscription.timezone` (Task 1); `computeTripPhase` (`@/lib/trip-phase`); `buildCostLabelMap`, `costLabel` (`@/lib/cost-labels`); `formatMoney` (`@/lib/money`); `addDays`, `daysBetween` (`@/lib/dates`); `instantToZonedTime` (`@/lib/tz`).
- Produces:

```ts
/** Days before a due date that a payment or checklist line starts appearing. */
export const DIGEST_LOOKAHEAD_DAYS = 3;

export async function collectDigestInput(opts: {
  tripId: string;
  localDate: string;
  slot: DigestSlot;
}): Promise<DigestInput>;

export async function dispatchDigest(opts: {
  userId: string;
  tripId: string;
  localDate: string;
  slot: DigestSlot;
  /** Test sends skip both the preference check and the ledger. */
  force?: boolean;
}): Promise<{ sent: number; skipped: boolean; reason?: string }>;
```

**Rules:**
- `collectDigestInput` reads only `forkId: null` rows — forks never drive reminders (CONTEXT.md **Fork**).
- Payments: `Cost` where `paidAt: null`, `forkId: null`, `dueDate` in `[localDate, addDays(localDate, DIGEST_LOOKAHEAD_DAYS)]`. Label via `buildCostLabelMap`/`costLabel`, exactly as the old cron pass did (`app/api/cron/reminders/route.ts:234-282` — lift that logic, including resolving stop-linked transports through stop names). Amount via `formatMoney(costMinor, currency)`.
- Checklist: `ChecklistItem` where `done: false`, same two dates.
- Reminders: `Reminder` where `date === localDate`.
- Schedule: for `EVENING`, the target day is `addDays(localDate, 1)`; for `MORNING` it is `localDate`. Empty unless `computeTripPhase` for that trip says `"travelling"`. Transport is matched by the trip's stop timezone on `depAt`; stays by `checkIn`/`checkOut` equalling the target date; items by `date`.
- `dispatchDigest` order: (1) resolve the preference — absent row counts as enabled; (2) unless `force`, `create` the `DigestDispatch` row and treat a unique-constraint violation as "already sent, skip"; (3) collect input and `buildDigest`; (4) if `null`, **delete the claimed ledger row** so the same slot can still fire later that day if the plan changes; (5) push to every subscription of that user, pruning 404/410 exactly as the old `pushToTripMembers` did.

- [ ] **Step 1: Write the failing tests**

Create `lib/digest-dispatch.test.ts`. Mock `@/lib/db` and `@/lib/push` with `vi.hoisted`, following the pattern at the top of `server/actions/reminders.test.ts`. Cover at minimum:

```ts
it("claims the ledger before sending", async () => { /* assert digestDispatchCreateMock called before sendPushMock */ });
it("skips when the ledger row already exists", async () => { /* create rejects with a P2002-shaped error → { skipped: true, reason: "already-sent" }, sendPush not called */ });
it("skips when the preference row says disabled", async () => { /* enabled: false → skipped, no ledger row, no push */ });
it("treats a missing preference row as enabled", async () => { /* findUnique → null → pushes */ });
it("releases the claim when the digest is empty", async () => { /* buildDigest returns null → digestDispatchDeleteMock called, sendPush not called */ });
it("force bypasses both the preference and the ledger", async () => { /* enabled: false + force → pushes, no ledger row written */ });
it("prunes a subscription the push service reports gone", async () => { /* sendPush → { sent:false, gone:true } → deleteMany with that id */ });
it("sends to every subscription the user owns", async () => { /* two subs → sendPush twice, sent === 2 */ });
```

Add a second `describe` for `collectDigestInput` covering: only unpaid costs inside the 3-day window are collected; a paid cost with a due date today is excluded; a fork's rows (`forkId: "fork-1"`) are excluded; reminders are matched on exactly `localDate`; the schedule is empty when the phase is `"planning"`; the EVENING schedule reads tomorrow and the MORNING schedule reads today.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run lib/digest-dispatch.test.ts`
Expected: FAIL — cannot resolve `@/lib/digest-dispatch`.

- [ ] **Step 3: Implement**

Write `lib/digest-dispatch.ts` to the interface above. Detect the unique-constraint violation by Prisma error code:

```ts
function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err &&
    (err as { code?: string }).code === "P2002";
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/digest-dispatch.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/digest-dispatch.ts lib/digest-dispatch.test.ts
git commit -m "feat(digest): collect, claim and send one Digest per person per slot

The ledger row is claimed before the push and released again when the
digest turns out empty, so a re-run never double-sends and a quiet evening
does not burn the slot."
```

---

### Task 7: Digest preference actions and the test send

**Files:**
- Create: `server/actions/digest.ts`
- Test: `server/actions/digest.test.ts`

**Interfaces:**
- Consumes: `dispatchDigest` (Task 6); `requireTripAccess`, `requireUser` (`@/lib/guards`); `todayISOInZone` (`@/lib/tz`).
- Produces:

```ts
export interface DigestSettings {
  enabled: boolean;
  /** Most recently subscribed device, or null when none. */
  device: { timezone: string | null; subscribedAt: Date } | null;
}

export async function getDigestSettings(tripId: string): Promise<DigestSettings>;
export async function setDigestEnabled(tripId: string, enabled: boolean): Promise<{ ok: true }>;
export async function sendTestDigest(tripId: string): Promise<
  | { ok: true; sent: number }
  | { ok: false; error: string }
>;
```

**Rules:**
- All three call `requireTripAccess(tripId)` as their **first** statement.
- `setDigestEnabled` upserts on the `(userId, tripId)` unique and revalidates `/trips/${tripId}/settings`.
- `sendTestDigest` calls `dispatchDigest` with `force: true`, `slot: "EVENING"` and `localDate` computed in the device's stored timezone (falling back to `"UTC"`). When the digest is empty it must return a **truthful** message rather than a false success: `{ ok: false, error: "Nothing to send right now — a test needs at least one thing due, a reminder today, or tomorrow's plan." }`. When the user has no subscription: `{ ok: false, error: "No device is subscribed yet. Press Enable first." }`.

- [ ] **Step 1: Write the failing tests**

Create `server/actions/digest.test.ts` mocking `@/lib/db`, `@/lib/guards`, `@/lib/digest-dispatch` and `next/cache`. Cover: access is checked first in all three actions; `setDigestEnabled` upserts with the right where/create/update; `getDigestSettings` reports `enabled: true` when no preference row exists; `getDigestSettings` returns the most recent subscription's timezone and `createdAt`; `sendTestDigest` passes `force: true`; `sendTestDigest` surfaces the "nothing to send" error when dispatch reports zero sent with an empty digest; `sendTestDigest` surfaces the no-device error when the user has no subscriptions.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run server/actions/digest.test.ts`
Expected: FAIL — cannot resolve `@/server/actions/digest`.

- [ ] **Step 3: Implement, then run**

Run: `npx vitest run server/actions/digest.test.ts`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add server/actions/digest.ts server/actions/digest.test.ts
git commit -m "feat(digest): opt-in toggle and an honest test send

The test send forces past both the preference and the ledger, and reports
plainly when there is nothing to put in a digest rather than claiming a
send that never happened."
```

---

### Task 8: The cron route becomes a slot dispatcher

Replaces both existing passes. This is where the old `pushToTripMembers` broadcast dies.

**Files:**
- Rewrite: `app/api/cron/reminders/route.ts`
- Test: `app/api/cron/reminders/route.test.ts` (existing — rewrite the body, keep the auth tests)

**Interfaces:**
- Consumes: `dispatchDigest`, `DigestSlot` (Task 6); `instantToZonedDateISO`, `instantToZonedTime` (`@/lib/tz`); `isPushConfigured` (`@/lib/push`).
- Produces: `GET` returns `{ considered, dispatched, sent, skipped }`.

**Rules — keep these behaviours exactly as they are today:**
- `isAuthorized` (constant-time compare, header or query param, fail-closed without `CRON_SECRET`) is unchanged and stays the first thing the handler does.
- The `503` bail when `!isPushConfigured()`, before any DB query, with its existing message. The GitHub workflow keys off that status.
- `export const runtime = "nodejs"`.

**New behaviour:**
1. Load every `PushSubscription` with a non-null `timezone`, selecting `userId` and `timezone`, and reduce to **distinct `(userId, timezone)`** pairs — a user with three devices in one zone is one dispatch, not three (`dispatchDigest` already pushes to all their devices).
2. For each pair, compute the local hour: `Number(instantToZonedTime(now, timezone).slice(0, 2))`. Map hour `20` → `"EVENING"`, hour `7` → `"MORNING"`, anything else → skip. The hour constants live at the top of the file as `EVENING_LOCAL_HOUR = 20` and `MORNING_LOCAL_HOUR = 7`, with a comment tying them to the workflow's UTC hours.
3. `localDate` is `instantToZonedDateISO(now, timezone)`.
4. For each matching pair, find that user's trips via `TripMember` and call `dispatchDigest` per trip, bounded by `take: 50` trips as a runaway backstop, accumulating the counts.
5. Wrap the body in the existing try/catch, returning `500` with the partial counts on error — same shape as today.

- [ ] **Step 1: Rewrite the route tests**

Rewrite `app/api/cron/reminders/route.test.ts`. Keep every existing auth test verbatim (unauthorised without the secret, header form accepted, query form accepted, fail-closed when `CRON_SECRET` is unset) and the `503` test. Replace the reminder/cost-pass tests with:

```ts
it("dispatches an evening digest to a subscriber whose local time is 20:00", async () => {
  // now = 2026-12-01T19:00:00Z, timezone Europe/Vienna (UTC+1) → local hour 20
});
it("dispatches a morning digest at local 07:00", async () => {
  // now = 2026-12-01T06:00:00Z, Europe/Vienna → local hour 7 → slot MORNING
});
it("skips a subscriber whose local hour is neither 7 nor 20", async () => {});
it("skips subscriptions with no stored timezone", async () => {});
it("dispatches once per user per trip when a user has several devices in one zone", async () => {});
it("dispatches per trip for a user in two trips", async () => {});
it("returns 503 before touching the database when VAPID is unconfigured", async () => {});
it("reports partial counts and 500 when dispatch throws", async () => {});
```

Pin `now` with `vi.setSystemTime` and mock `@/lib/digest-dispatch` so these tests assert routing, not digest content.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run app/api/cron/reminders/route.test.ts`
Expected: the new tests fail; the auth and 503 tests still pass against the old implementation.

- [ ] **Step 3: Rewrite the route**

Delete `pushToTripMembers`, both existing passes, and the now-unused imports (`addDays`, `daysBetween`, `formatMoney`, `buildCostLabelMap`, `costLabel`, `buildNotificationPayload`, `sendPush`). Keep the file's existing header comment block, updating the SCHEDULING section to describe the four UTC hours and the local-hour filter.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run app/api/cron/reminders/route.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/reminders
git commit -m "feat(cron): dispatch Digests by the subscriber's local hour

Replaces the reminder sweep and the due-cost pass with one slot dispatcher:
every run asks which subscribers are at 07:00 or 20:00 locally and sends
each of them at most one Digest per trip. Nothing broadcasts to a trip's
membership any more."
```

---

### Task 9: Reminders become dated notes, on Home in every phase

Closes the loop that made this feature undeliverable — the opt-in and the notes must not sit behind a Phase gate.

**Files:**
- Modify: `lib/validations/reminder.ts`
- Modify: `server/actions/reminders.ts`
- Modify: `components/trip/reminders-card.tsx`
- Modify: `components/trip/home/phase-travelling.tsx` (remove the Reminders section and its query)
- Modify: `app/(app)/trips/[tripId]/page.tsx`
- Test: `server/actions/reminders.test.ts` (existing), `components/trip/reminders-card.test.tsx` (create if absent)

**Interfaces:**
- Consumes: the remodelled `Reminder` (Task 1).
- Produces:
  - `reminderSchema` = `{ title: string (1..200, trimmed), date: string matching /^\d{4}-\d{2}-\d{2}$/ }`; `fireAt`, `targetType`, `targetId` removed.
  - `addReminder(tripId, input)`, `updateReminder(id, input)`, `deleteReminder(id)` — same signatures, new input shape.
  - `listRemindersForTrip(tripId: string, fromDate: string): Promise<ReminderItem[]>` — a server-side helper the Home page calls, returning reminders with `date >= fromDate`, ascending, `take: 20`.
  - `ReminderItem` = `{ id: string; title: string; date: string }`.

- [ ] **Step 1: Write the failing tests**

In `server/actions/reminders.test.ts`, replace every `fireAt` assertion with `date`, and add:

```ts
it("rejects a date that is not YYYY-MM-DD", async () => {
  const result = await addReminder("trip-1", { title: "Print docs", date: "28 Nov" });
  expect(result.success).toBe(false);
  expect(reminderCreateMock).not.toHaveBeenCalled();
});

it("stores the date verbatim, with no time component", async () => {
  reminderCreateMock.mockResolvedValue({ id: "r1" });
  await addReminder("trip-1", { title: "Print docs", date: "2026-11-28" });
  expect(reminderCreateMock).toHaveBeenCalledWith({
    data: { tripId: "trip-1", title: "Print docs", date: "2026-11-28" },
    select: { id: true },
  });
});

it("revalidates Home as well as Today", async () => {
  reminderCreateMock.mockResolvedValue({ id: "r1" });
  await addReminder("trip-1", { title: "Print docs", date: "2026-11-28" });
  expect(revalidatePathMock).toHaveBeenCalledWith("/trips/trip-1");
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run server/actions/reminders.test.ts`
Expected: FAIL on the new date shape.

- [ ] **Step 3: Implement the schema and actions**

Update `lib/validations/reminder.ts` and `server/actions/reminders.ts`. `revalidateReminderPaths` must revalidate both `/trips/${tripId}` and `/trips/${tripId}/today`. Add `listRemindersForTrip`, guarded by `requireTripAccess` as its first statement.

- [ ] **Step 4: Update the card**

In `components/trip/reminders-card.tsx`: `ReminderItem` becomes `{ id, title, date }`; the `datetime-local` input becomes `type="date"` labelled "Reminder date"; `formatWhen` becomes a date-only relative label — `"today"`, `"tomorrow"`, `` `in ${n} days` ``, `"passed"` — computed with `daysBetween` from `@/lib/dates` against a `today` prop the server passes in (do **not** call `new Date()` inside the component; that is the timezone bug class this codebase pins tests against). Drop the `sent` split and the "sent reminders" `<details>`; instead show reminders whose date is before `today` under a "Passed" collapsed section. Keep `<EnableNotifications />` out of this card — it now lives in Settings (Task 10).

- [ ] **Step 5: Render it in every phase**

Remove the Reminders `<section>` and the `db.reminder.findMany` call from `components/trip/home/phase-travelling.tsx` (including the `targetType` exclusion comment at lines 160-164, which described the retired COST_DUE markers). In `app/(app)/trips/[tripId]/page.tsx`, fetch via `listRemindersForTrip(tripId, today)` and render `<RemindersCard tripId={tripId} reminders={reminders} today={today} />` after `{phaseEl}`, so every phase gets it.

- [ ] **Step 6: Test the card**

Create `components/trip/reminders-card.test.tsx` covering: a reminder dated `today` renders "today"; one dated two days out renders "in 2 days"; a past reminder appears under "Passed"; the add form submits `{ title, date }`.

- [ ] **Step 7: Run everything touched**

Run: `npx vitest run server/actions/reminders.test.ts components/trip/reminders-card.test.tsx components/trip/home/phase-travelling.test.tsx`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add lib/validations/reminder.ts server/actions/reminders.ts components/trip/reminders-card.tsx components/trip/reminders-card.test.tsx components/trip/home/phase-travelling.tsx app/\(app\)/trips/\[tripId\]/page.tsx server/actions/reminders.test.ts
git commit -m "feat(reminders): dated notes, visible in every phase

A Reminder carries a date and no time, and now renders on Home from
Sketching onwards instead of only while travelling — the Phase gate is
what made the whole feature undeliverable."
```

---

### Task 10: The Settings panel, the cron schedule and the deploy docs

Everything that makes the feature reachable and operable. Last, because it wires up the parts.

**Files:**
- Create: `components/trip/settings/reminders-panel.tsx`
- Test: `components/trip/settings/reminders-panel.test.tsx`
- Modify: `app/(app)/trips/[tripId]/settings/page.tsx`
- Modify: `.github/workflows/reminders-cron.yml`
- Modify: `docs/DEPLOY.md` (§5), `docs/HANDOFF.md` (§6)

**Interfaces:**
- Consumes: `getDigestSettings`, `setDigestEnabled`, `sendTestDigest` (Task 7); `EnableNotifications` (Task 5).

- [ ] **Step 1: Build the panel**

`components/trip/settings/reminders-panel.tsx` is a client component taking `{ tripId, initial: DigestSettings }`. It renders, in this order: the Digest switch (label "Your digest", sub-label "8pm · {timezone}" when a device is known); `<EnableNotifications />` when no device is subscribed; the device line ("{timezone} · subscribed {date}"); a "Send me a test" button wired to `sendTestDigest`, surfacing both the success count and the error strings verbatim; and a short paragraph stating that the digest is silent when there is nothing to say — otherwise silence reads as breakage.

- [ ] **Step 2: Test the panel**

`components/trip/settings/reminders-panel.test.tsx`: the switch calls `setDigestEnabled` with the inverted value; "Send me a test" renders the returned error text on failure; the enable button shows only when no device is subscribed; the timezone appears when one is.

- [ ] **Step 3: Mount it in Settings**

In `app/(app)/trips/[tripId]/settings/page.tsx`, add a card titled **"Reminders"** immediately above the Calendar feed card (they are the two outward-delivery sections), calling `getDigestSettings(tripId)` alongside the existing data loads.

- [ ] **Step 4: Re-time the cron**

In `.github/workflows/reminders-cron.yml`, replace the single schedule with:

```yaml
on:
  schedule:
    # Each run dispatches only to subscribers whose LOCAL hour is 07 or 20
    # (app/api/cron/reminders/route.ts). These four UTC hours cover the two
    # zones that matter: Australia/Sydney (UTC+11 in December) and Central
    # Europe (UTC+1). 06:00Z = 07:00 CET · 09:00Z = 20:00 AEDT ·
    # 19:00Z = 20:00 CET · 20:00Z = 07:00 AEDT. Adding a zone is one more
    # hour here, at roughly 3 CU-h/month each (ADR 0047).
    - cron: "0 6,9,19,20 * * *"
  workflow_dispatch: {}
```

Rewrite the header comment block: the old text describes a daily cadence, the retired payment-alert pass, and a "BUMP TO HOURLY BEFORE LATE NOVEMBER 2026" warning that this design supersedes. Keep the existing skip-when-unconfigured step, the non-2xx warning and the 503-fails-the-job behaviour exactly as they are.

- [ ] **Step 5: Update the docs**

`docs/DEPLOY.md` §5: correct "every 5 minutes" to the four UTC hours and the local-hour filter, and add that `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` must all be set in Vercel **before** the deploy, because `NEXT_PUBLIC_*` is inlined at build time and a later dashboard edit does nothing without a redeploy.

`docs/HANDOFF.md` §6: replace the Vercel-Cron `* * * * *` example and the GitHub Actions `* * * * *` example with the four-hour schedule, and add a short subsection "Reminders reach a phone" listing the three one-time steps for an iPhone: install to the Home Screen, press Enable in Settings → Reminders, and turn off *Remove Alerts* on the subscribed calendar.

- [ ] **Step 6: Full verification**

Run: `npm run test`
Expected: the whole suite passes (baseline before this work: 2677 tests across 236 files; this plan adds tests and removes the old cron-pass tests, so expect a higher total and zero failures).

Run: `npx tsc --noEmit`
Expected: clean — in particular, every error recorded in Task 1 Step 4 is now gone.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add components/trip/settings app/\(app\)/trips/\[tripId\]/settings .github/workflows/reminders-cron.yml docs/DEPLOY.md docs/HANDOFF.md
git commit -m "feat(reminders): Settings panel, four-hour cron, deploy notes

The Digest opt-in, the device it will reach and the test send now live on
the trip's Settings page beside the Calendar feed. The cron runs at four
UTC hours and filters by each subscriber's local hour."
```

---

## Cannot be verified in this sandbox

State these plainly in the final report rather than claiming them:

- **Anything requiring Postgres.** The migration is hand-written and unapplied. It must run via `prisma migrate deploy` on the next deploy.
- **Before that deploy, confirm the `DELETE FROM "Reminder"` is safe** — run a `SELECT count(*) FROM "Reminder"` against production. It was zero on 2026-09-16.
- **Real push delivery to an iPhone.** Needs the deployed HTTPS URL, the PWA installed to the Home Screen, and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` present *at build time*.
- **That a calendar app honours the published `VALARM`s.** Needs a real subscription and, on iOS, *Remove Alerts* turned off.
- **That `VAPID_*` are set in Vercel and `CRON_SECRET`/`APP_URL` in GitHub.** They exist in the local `.env.production.local`, which proves nothing about either host.
