# Claude connection read pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Claude connection (`/api/mcp`) the reads a real session asked for — transport places and local times, Travellers, itemised Costs, and Attachments (index, per-thing file lists, and contents) — with no new write tools.

**Architecture:** Loaders live in `lib/mcp/reads/` (one file per concern) and are registered in `lib/mcp/tools/reads.ts` through `runTool`. Every loader starts with `requireTripAccess(tripId)` and scopes plan rows with `REAL_PLAN`. Owner naming ("Accommodation: Hotel Raphael at Rome") is one shared helper used by Costs and Attachments. Local times reuse the app's `transportTimeDisplay`; Home-currency amounts reuse the Budget's `applyFxRatesToCosts` + `convertCostToHome`. `get_attachment` returns MCP image content or PDF text via a new `runToolContent` sibling of `runTool`.

**Tech Stack:** Next.js route handler + `@modelcontextprotocol/sdk` 1.32, Prisma 7, Vitest, new dependency `unpdf` (PDF text).

**Spec:** `docs/specs/2026-10-11-mcp-read-pass.md`

## Global Constraints

- Branch: `feat/activity-history-and-audit-seed-2026-10-11` (shared with the TC-07/08/09 work — do not disturb it). Never commit to `main`. Never deploy. Never run `feedback:*`, `mcp:token` or `db:*` scripts.
- **Read-only.** No new write tool, no new server action that writes, no change to any existing write tool.
- **Real plan only.** Every plan query uses `REAL_PLAN` (`lib/plan-scope.ts`); nothing accepts a `forkId`. Attachments whose owner is fork-owned are excluded.
- Every trip-scoped loader starts with `await requireTripAccess(tripId)` (a non-member reads as `NOT_FOUND_TEXT` via `runTool`). `get_attachment` checks access through the Attachment's own `tripId`; a Globe-owned or missing Attachment reads as not found.
- Tool registration follows `lib/mcp/tools/reads.ts`: `server.registerTool(name, { title, description, inputSchema, annotations: { readOnlyHint: true } }, handler)`.
- No email addresses in any output.
- Local times come only from `transportTimeDisplay` (`lib/time-display.ts`); never re-implement the zone rule.
- Home-currency amounts come only from `applyFxRatesToCosts` + `convertCostToHome` (`lib/budget.ts`) with the trip's `ExchangeRate` rows — the same assembly the Summary/Print/Home loaders use.
- Attachment limits: PDFs over **10 MB** refused; images over **3 MB** refused (Vercel's ~4.5 MB response cap; base64 inflates by a third); extracted PDF text capped at **60,000 characters** with a truncation note.
- Verification tiers (CLAUDE.md): inner loop `npx vitest run <files>`; task done `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Never the full suite or `next build` per task.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. A Transport with one end at **home** (or free-text, no Stop) must still get local times by the app's rule (the other end's zone, else UTC) — Task 1 pins it.
2. A Cost in a currency with **no rate** must show `home: null` (not 0, not a guess) and still list — Task 2 pins it.
3. A Cost (or Attachment) whose owner was **deleted** must still list, named "(removed)" rather than crashing or vanishing — Tasks 2 and 3 pin it.
4. An Attachment on a **What-if plan** Stop/Item must not appear in `list_attachments`, the plan's `files`, or be readable through `get_attachment` — Tasks 3 and 4 pin it.
5. `get_attachment` on a **missing storage object** (row exists, bytes gone) must return a clear message, not a 500 — Task 4 pins it.

---

### Task 1: `get_trip_plan` — transport places, local times, Stop timezones, Travellers

**Files:**
- Modify: `lib/mcp/reads/trip-plan.ts`
- Test: `lib/mcp/reads/trip-plan.test.ts`
- Modify: `lib/mcp/tools/reads.ts` (the `get_trip_plan` description only)

**Interfaces:**
- Produces (exported types in `trip-plan.ts`):
  - `McpLocalTime = { at: string; localTime: string; localDate: string; zone: string }`
  - `McpTransport` gains `depPlace: string | null`, `arrPlace: string | null`, `notes: string | null`, `departs: McpLocalTime | null`, `arrives: McpLocalTime | null`, `dayDelta: number` (keeps `depAt`/`arrAt`).
  - `McpStop` gains `timezone: string | null`.
  - `McpTraveller = { name: string; role: "owner" | "traveller"; you: boolean }`; `McpTripPlan` gains `travellers: McpTraveller[]`.

- [ ] **Step 1: Failing tests** — in `trip-plan.test.ts`, following the file's existing db mocks, add:

```ts
it("returns transport places, notes and local times per end", async () => {
  // Stops: LIS (Europe/Lisbon), MUC (Europe/Berlin). Transport LIS→MUC
  // depAt 2026-12-12T07:30:00Z, arrAt 2026-12-12T11:15:00Z, depPlace "Lisbon Airport", arrPlace "Munich Airport", notes "Gate closes 40 min before".
  const plan = await loadTripPlanForMcp("trip-1");
  const t = plan.transports[0];
  expect(t).toMatchObject({
    depPlace: "Lisbon Airport",
    arrPlace: "Munich Airport",
    notes: "Gate closes 40 min before",
    depAt: "2026-12-12T07:30:00.000Z",
    departs: { at: "2026-12-12T07:30:00.000Z", localTime: "07:30", localDate: "2026-12-12" },
    arrives: { at: "2026-12-12T11:15:00.000Z", localTime: "12:15", localDate: "2026-12-12" },
    dayDelta: 0,
  });
  expect(t.departs!.zone).toBeTruthy();
  expect(t.arrives!.zone).toBeTruthy();
});

it("a home-departing leg takes the arrival Stop's zone, per the app's rule", async () => {
  // Transport depIsHome true, fromStopId null, toStopId LIS, depAt 2026-12-10T22:00:00Z
  const plan = await loadTripPlanForMcp("trip-1");
  const t = plan.transports.find((x) => x.from && "home" in x.from)!;
  expect(t.departs).toMatchObject({ localTime: "22:00", localDate: "2026-12-10" }); // Lisbon is UTC+0 in December
});

it("an untimed transport has null departs/arrives", async () => {
  const plan = await loadTripPlanForMcp("trip-1");
  const untimed = plan.transports.find((x) => x.depAt === null)!;
  expect(untimed.departs).toBeNull();
  expect(untimed.arrives).toBeNull();
});

it("each Stop carries its timezone", async () => {
  const plan = await loadTripPlanForMcp("trip-1");
  expect(plan.stops.find((s) => s.name === "Munich")!.timezone).toBe("Europe/Berlin");
});

it("lists Travellers with role and a you marker, never an email", async () => {
  // requireTripAccess resolves { user: { id: "u-you" } }; tripMember.findMany returns
  // [{ role: "owner", user: { id: "u-you", name: "Cam", displayName: null, email: "c@x", image: null } },
  //  { role: "member", user: { id: "u-x", name: "Xanthia", displayName: null, email: "x@x", image: null } }]
  const plan = await loadTripPlanForMcp("trip-1");
  expect(plan.travellers).toEqual([
    { name: "Cam", role: "owner", you: true },
    { name: "Xanthia", role: "traveller", you: false },
  ]);
  expect(JSON.stringify(plan)).not.toContain("@x");
});
```

Shape the fixtures to `TRAVELLER_SELECT`'s real fields (`lib/traveller.ts`). Add a `tripMember.findMany` mock to the file's `@/lib/db` mock.

Run: `npx vitest run lib/mcp/reads/trip-plan.test.ts` — expect FAIL.

- [ ] **Step 2: Implement** in `trip-plan.ts`:
  - Import `transportTimeDisplay` from `@/lib/time-display` and `travellerName, TRAVELLER_SELECT` from `@/lib/traveller`.
  - `const { user } = await requireTripAccess(tripId);`
  - Stop select gains `timezone: true`; map it onto `McpStop`.
  - Transport select gains `depPlace`, `arrPlace`, `notes`.
  - Add `db.tripMember.findMany({ where: { tripId }, orderBy: { createdAt: "asc" }, select: { role: true, user: { select: TRAVELLER_SELECT } } })` to the `Promise.all` (check `TripMember` has `createdAt`; if not, order by `role` then user name in JS: owner first).
  - Build `const tzById = new Map(stops.map((s) => [s.id, s.timezone]))` and per transport:

```ts
  const local = (at: Date | null, part: { time: string; zone: string; dateISO: string } | null): McpLocalTime | null =>
    at && part ? { at: at.toISOString(), localTime: part.time, localDate: part.dateISO, zone: part.zone } : null;

  const transports: McpTransport[] = transportsRaw.map((t) => {
    const shown = transportTimeDisplay({
      depAt: t.depAt,
      arrAt: t.arrAt,
      fromTimezone: t.fromStopId ? tzById.get(t.fromStopId) ?? null : null,
      toTimezone: t.toStopId ? tzById.get(t.toStopId) ?? null : null,
    });
    return {
      id: t.id,
      mode: t.mode,
      from: endpoint(t.fromStopId, t.depIsHome),
      to: endpoint(t.toStopId, t.arrIsHome),
      depPlace: t.depPlace,
      arrPlace: t.arrPlace,
      depAt: t.depAt ? t.depAt.toISOString() : null,
      arrAt: t.arrAt ? t.arrAt.toISOString() : null,
      departs: local(t.depAt, shown.dep),
      arrives: local(t.arrAt, shown.arr),
      dayDelta: shown.dayDelta,
      reference: t.reference,
      notes: t.notes,
    };
  });
```

  - `travellers: members.map((m) => ({ name: travellerName(m.user), role: m.role === "owner" ? "owner" : "traveller", you: m.user.id === user.id }))`.
  - Update the file's header comment (it says "no Costs, no Attachments" — keep that true for Costs; Task 3 changes the Attachments part).
  - Update `get_trip_plan`'s description in `reads.ts`: add "Transport with departure/arrival places and local times (each end in its own zone), each Stop's timezone, and the trip's Travellers".

- [ ] **Step 3: Run** `npx vitest run lib/mcp/reads/trip-plan.test.ts lib/mcp/tools/reads.test.ts` — PASS (fix existing fixtures for the new selects; don't weaken assertions).

- [ ] **Step 4: Task-done checks and commit**

```bash
npx vitest related --run lib/mcp/reads/trip-plan.ts lib/mcp/tools/reads.ts
npx tsc --noEmit
npx eslint lib/mcp/reads/trip-plan.ts lib/mcp/reads/trip-plan.test.ts lib/mcp/tools/reads.ts
git add lib/mcp/reads/trip-plan.ts lib/mcp/reads/trip-plan.test.ts lib/mcp/tools/reads.ts
git commit -m "feat(mcp): trip plan reads transport places, local times, stop zones, travellers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `list_costs` and the shared owner-naming helper

**Files:**
- Create: `lib/mcp/reads/owners.ts`, `lib/mcp/reads/owners.test.ts`
- Create: `lib/mcp/reads/costs.ts`, `lib/mcp/reads/costs.test.ts`
- Modify: `lib/mcp/tools/reads.ts` (register `list_costs`)

**Interfaces:**
- Produces `lib/mcp/reads/owners.ts`:

```ts
export type OwnerKind = "TRIP" | "STOP" | "ACCOMMODATION" | "TRANSPORT" | "ITEM" | "OTHER";
export interface OwnerRef { kind: OwnerKind; id: string | null }
export interface McpOwner { kind: OwnerKind; id: string | null; label: string; stopId: string | null }
/** Resolves owners against the REAL PLAN only. A ref whose row is missing OR fork-owned
 *  is absent from the map — callers decide (Costs: "(removed)"; Attachments: exclude fork-owned). */
export async function loadOwners(tripId: string, refs: OwnerRef[]): Promise<{
  owners: Map<string, McpOwner>;     // key: ownerKey(kind, id)
  forkOwned: Set<string>;            // keys whose row exists but is on a What-if plan
}>;
export function ownerKey(kind: OwnerKind, id: string): string; // `${kind}:${id}`
export const REMOVED_LABEL = "(removed)";
```

  Labels: `STOP` → `"Stop: Rome"`; `ACCOMMODATION` → `"Accommodation: Hotel Raphael at Rome"`; `TRANSPORT` → `"Transport: Dublin → Como"` (each end: Stop name, else `"home"` when `depIsHome`/`arrIsHome`, else `depPlace`/`arrPlace`, else `"?"`); `ITEM` → `"Activity: Vatican tour at Rome, Sat 19 Dec"` (`at <Stop>` when it has a Stop, `, <formatDayLabel(date)>` when dated, `" (Wishlist)"` when neither). `stopId` is the owner's Stop (Transport: its from-Stop).
- Produces `lib/mcp/reads/costs.ts`: `loadCostsForMcp(tripId: string, opts: { unpaidOnly?: boolean; dueWithinDays?: number }): Promise<{ homeCurrency: string; today: string; costs: McpCost[] }>` with

```ts
export interface McpCost {
  id: string;
  amount: { minor: number; currency: string; formatted: string };
  home: { minor: number; currency: string; formatted: string } | null; // null = no rate for this currency
  paid: { minor: number; formatted: string; on: string } | null;     // on = YYYY-MM-DD
  dueDate: string | null;
  daysUntilDue: number | null; // negative = overdue
  settlement: "before-you-go" | "on-the-trip";
  label: string | null;
  category: string;            // effectiveCategory(...)
  owner: { kind: OwnerKind; label: string };
}
```

- [ ] **Step 1: Failing tests for `owners.ts`** (mock `@/lib/db`): labels for each kind exactly as above; a ref to a fork-owned row lands in `forkOwned` and not in `owners`; a ref to a missing row is in neither; a home-departing Transport reads `"Transport: home → Lisbon"`; a Transport with no Stops but places reads `"Transport: Dublin Airport → Bergamo"`. Queries must include `...REAL_PLAN`-free lookups for fork detection — implement as: query each table with `where: { tripId, id: { in: ids } }` selecting `forkId` too, then split by `forkId === null`.

- [ ] **Step 2: Failing tests for `costs.ts`** (mock `@/lib/db` and `@/lib/guards`):

```ts
it("lists each cost with own-currency and home amounts", ...);        // EUR 540.00 at rateToHome 1.6187 → AUD home
it("a foreign cost with no rate has home: null and still lists", ...); // Review Focus 2
it("uses the trip's ExchangeRate table when the cost has no snapshot rate", ...);
it("paid costs carry paid amount and date; unpaid carry dueDate and daysUntilDue", ...);
it("names owners; a cost whose owner is gone reads (removed)", ...);  // Review Focus 3
it("unpaidOnly drops paid costs", ...);
it("dueWithinDays keeps unpaid costs due within N days, overdue included, and drops undated", ...);
it("orders due-dated costs soonest first, then the rest in createdAt order", ...);
it("is real plan only and access-checked first", ...); // where includes forkId: null; requireTripAccess called before db.cost.findMany
```

Write each with concrete fixtures and exact expected values (compute the AUD figure with `convertMinor` in the test, not by hand). `today` comes from `todayISOInZone(currentTripTimezone(stops))` — mock time with `vi.setSystemTime` so `daysUntilDue` is deterministic.

Run both test files — FAIL.

- [ ] **Step 3: Implement `owners.ts`** per the interface (use `formatDayLabel` from `@/lib/dates`).

- [ ] **Step 4: Implement `costs.ts`:**

```ts
export async function loadCostsForMcp(tripId: string, opts: { unpaidOnly?: boolean; dueWithinDays?: number }) {
  await requireTripAccess(tripId);
  const [trip, rawCosts, rates, stops, items] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { homeCurrency: true } }),
    db.cost.findMany({ where: { tripId, ...REAL_PLAN }, orderBy: { createdAt: "asc" },
      select: { id: true, costMinor: true, paidMinor: true, currency: true, rateToHome: true, paidAt: true,
                dueDate: true, ownerType: true, ownerId: true, label: true, category: true, settlement: true } }),
    db.exchangeRate.findMany({ where: { tripId }, select: { base: true, quote: true, rate: true } }),
    db.stop.findMany({ where: { tripId, ...REAL_PLAN }, select: { timezone: true, arriveDate: true, departDate: true } }),
    db.item.findMany({ where: { tripId, ...REAL_PLAN }, select: { id: true, category: true } }),
  ]);
  const homeCurrency = trip?.homeCurrency ?? "AUD";
  const today = todayISOInZone(currentTripTimezone(stops));
  const budgetCosts = applyFxRatesToCosts({ costs: rawCosts, exchangeRates: rates, homeCurrency });
  const { owners } = await loadOwners(tripId, rawCosts
    .filter((c) => c.ownerType !== "OTHER" && c.ownerId)
    .map((c) => ({ kind: c.ownerType as OwnerKind, id: c.ownerId })));
  const itemCategoryById = Object.fromEntries(items.map((i) => [i.id, i.category]));
  // map each → McpCost (formatMinor for formatted strings; convertCostToHome for home/paid home;
  // owner: OTHER → { kind: "OTHER", label: c.label ?? "Other cost" }; missing → { kind, label: REMOVED_LABEL };
  // settlement: isOnTrip(c.settlement) ? "on-the-trip" : "before-you-go";
  // daysUntilDue: unpaid && dueDate ? daysBetween(today, dueDate) : null)
  // then filter (unpaidOnly; dueWithinDays → unpaid && dueDate && daysUntilDue <= N), then sort:
  // dueDate-bearing unpaid first by dueDate asc, rest keep createdAt order.
}
```

Register in `reads.ts`:

```ts
  server.registerTool(
    "list_costs",
    {
      title: "List costs",
      description:
        "Lists the trip's individual Costs on the real plan: amount in its own currency and in the home currency (null when no exchange rate is known), paid or unpaid with due date, Before you go or On the trip, and what it belongs to. unpaidOnly keeps unpaid Costs; dueWithinDays keeps unpaid Costs due within that many days (overdue included). Soonest due first.",
      inputSchema: {
        tripId: z.string(),
        unpaidOnly: z.boolean().optional(),
        dueWithinDays: z.number().int().min(0).max(366).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ tripId, unpaidOnly, dueWithinDays }) => runTool("list_costs", () => loadCostsForMcp(tripId, { unpaidOnly, dueWithinDays })),
  );
```

- [ ] **Step 5: Run** the two new test files plus `lib/mcp/tools/reads.test.ts` and `lib/mcp/prompts.test.ts` — PASS. Add one `reads.test.ts` case through the in-memory client (`lib/mcp/test-client.ts`, as other cases there do) proving `list_costs` is registered and returns JSON.

- [ ] **Step 6: Task-done checks and commit**

```bash
npx vitest related --run lib/mcp/reads/owners.ts lib/mcp/reads/costs.ts lib/mcp/tools/reads.ts
npx tsc --noEmit
npx eslint lib/mcp/reads/owners.ts lib/mcp/reads/owners.test.ts lib/mcp/reads/costs.ts lib/mcp/reads/costs.test.ts lib/mcp/tools/reads.ts lib/mcp/tools/reads.test.ts
git add lib/mcp/reads/owners.ts lib/mcp/reads/owners.test.ts lib/mcp/reads/costs.ts lib/mcp/reads/costs.test.ts lib/mcp/tools/reads.ts lib/mcp/tools/reads.test.ts
git commit -m "feat(mcp): list_costs with owner naming, home amounts and due filters

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Attachment index — `list_attachments` and `files` on the plan

**Files:**
- Create: `lib/mcp/reads/attachments.ts`, `lib/mcp/reads/attachments.test.ts`
- Modify: `lib/mcp/reads/trip-plan.ts` (+ test) — `files` on trip, Stops, Transports, Accommodations, things to do and day items
- Modify: `lib/mcp/tools/reads.ts` (register `list_attachments`)

**Interfaces:**
- Consumes: `loadOwners`, `ownerKey`, `REMOVED_LABEL`, `OwnerKind` from `lib/mcp/reads/owners.ts` (Task 2).
- Produces `lib/mcp/reads/attachments.ts`:

```ts
export interface McpFileRef { id: string; title: string }          // title ?? filename
export interface McpAttachment {
  id: string; title: string; filename: string; mime: string; size: number;
  uploadedBy: string;                                               // travellerName
  owner: { kind: OwnerKind; label: string };                        // TRIP → { kind: "TRIP", label: "Trip" }
}
/** Real-plan, trip-scoped attachments. Excludes Globe files and fork-owned owners; keeps removed owners as "(removed)". */
export async function loadTripAttachments(tripId: string): Promise<{
  attachments: McpAttachment[];
  byOwner: Map<string, McpFileRef[]>;   // key: ownerKey(kind, id); "TRIP" files under ownerKey("TRIP", tripId)
}>;
export async function loadAttachmentIndexForMcp(tripId: string): Promise<{ attachments: McpAttachment[] }>; // requireTripAccess first
```

  Attachment `targetType` values come from `TARGET_TYPES` (`lib/enum-values.ts`); map `TRIP`/`STOP`/`ACCOMMODATION`/`TRANSPORT`/`ITEM` to `OwnerKind`; any other target type (e.g. `JOURNAL`) is listed with `owner: { kind: "TRIP", label: "Journal" }` — check `TARGET_TYPES` for the full set and give each a sensible label.

- [ ] **Step 1: Failing tests** (`attachments.test.ts`, mock `@/lib/db` and `@/lib/guards`):

```ts
it("lists trip files with title, type, size, uploader and named owner", ...); // "Activity: Neuschwanstein tour at Füssen, Fri 18 Dec"
it("title falls back to filename", ...);
it("excludes files whose owner is on a What-if plan", ...);   // Review Focus 4
it("keeps a file whose owner was deleted, named (removed)", ...); // Review Focus 3
it("never lists Globe files (queries by tripId only)", ...);
it("is access-checked first", ...);
```

and in `trip-plan.test.ts`:

```ts
it("each Stop, Transport, Accommodation, thing to do and day item carries its files; the trip carries trip-level files", ...);
it("a thing with no files has files: []", ...);
```

Run — FAIL.

- [ ] **Step 2: Implement** `attachments.ts` (query `db.attachment.findMany({ where: { tripId }, orderBy: { createdAt: "desc" }, select: { id, filename, title, mime, size, targetType, targetId, uploadedBy: { select: TRAVELLER_SELECT } } })`, resolve owners via `loadOwners`, drop `forkOwned`, label missing as `REMOVED_LABEL`). In `trip-plan.ts`, call `loadTripAttachments(tripId)` inside the existing `Promise.all` and attach `files: byOwner.get(ownerKey(kind, id)) ?? []` to each Stop, Accommodation, Transport, thing to do and day item (an Item appears in both `thingsToDo` and `days` — both get its files), and `trip.files` from the TRIP key. Update `trip-plan.ts`'s header comment (it now includes file titles, not contents). Register:

```ts
  server.registerTool(
    "list_attachments",
    {
      title: "List attachments",
      description:
        "Lists the trip's files (tickets, confirmations, screenshots) on the real plan: title, type, size, who uploaded it, and what it's attached to — the trip itself, a Stop, Transport, Accommodation or thing to do. Read one with get_attachment.",
      inputSchema: { tripId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ tripId }) => runTool("list_attachments", () => loadAttachmentIndexForMcp(tripId)),
  );
```

  Also mention files in `get_trip_plan`'s description ("each thing lists its files by title").

- [ ] **Step 3: Run** `npx vitest run lib/mcp/reads/attachments.test.ts lib/mcp/reads/trip-plan.test.ts lib/mcp/tools/reads.test.ts lib/mcp/prompts.test.ts` — PASS.

- [ ] **Step 4: Task-done checks and commit**

```bash
npx vitest related --run lib/mcp/reads/attachments.ts lib/mcp/reads/trip-plan.ts lib/mcp/tools/reads.ts
npx tsc --noEmit
npx eslint lib/mcp/reads/attachments.ts lib/mcp/reads/attachments.test.ts lib/mcp/reads/trip-plan.ts lib/mcp/reads/trip-plan.test.ts lib/mcp/tools/reads.ts
git add lib/mcp/reads/attachments.ts lib/mcp/reads/attachments.test.ts lib/mcp/reads/trip-plan.ts lib/mcp/reads/trip-plan.test.ts lib/mcp/tools/reads.ts
git commit -m "feat(mcp): list_attachments and per-thing file lists on the trip plan

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `get_attachment` — images and PDF text

**Files:**
- Modify: `package.json` / `package-lock.json` (add `unpdf`)
- Create: `lib/mcp/reads/attachment-content.ts`, `lib/mcp/reads/attachment-content.test.ts`
- Modify: `lib/mcp/run-tool.ts` (+ `lib/mcp/run-tool.test.ts`) — `runToolContent`
- Modify: `lib/mcp/tools/reads.ts` (register `get_attachment`)
- Possibly modify: `next.config.*` (`serverExternalPackages`) — only if the build later fails to bundle `unpdf`; the controller runs the build at branch end and will route that back.

**Interfaces:**
- Consumes: `loadOwners` / `ownerKey` (Task 2) for the fork check; `getStorage()` from `@/lib/storage` (`read(key): Promise<Buffer | null>`).
- Produces in `run-tool.ts`:

```ts
export type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
export type ToolResult = { content: ToolContent[]; isError?: boolean };
/** Like runTool, but fn builds the content itself (images). Same error mapping. */
export async function runToolContent(name: string, fn: () => Promise<ToolContent[]>): Promise<ToolResult>;
```

  (Widening `ToolResult` is safe for `runTool` — it still only produces text.) Refactor `runTool`'s `catch` into a shared private `errorResult(name, err)` both use, so the mapping is not duplicated.
- Produces in `attachment-content.ts`:

```ts
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_TEXT_CHARS = 60_000;
export async function loadAttachmentContentForMcp(attachmentId: string): Promise<ToolContent[]>;
```

- [ ] **Step 1: Add the dependency**: `npm install unpdf@1.8.1 --save-exact` (match the repo's pinning style in `package.json` — if other deps use `^`, use `^1.8.1`). Confirm `import { extractText, getDocumentProxy } from "unpdf"` type-checks.

- [ ] **Step 2: Failing tests** (`attachment-content.test.ts`; mock `@/lib/db`, `@/lib/guards`, `@/lib/storage`, and `unpdf`):

```ts
it("an image under 3 MB returns image content with a text caption", async () => {
  // attachment: { tripId: "trip-1", globeId: null, mime: "image/png", size: 1000, storageKey: "k", title: "Castle tickets", filename: "c.png", targetType: "ITEM", targetId: "i1" }
  // storage.read → Buffer.from("png-bytes")
  const out = await loadAttachmentContentForMcp("att-1");
  expect(out[0]).toEqual({ type: "text", text: expect.stringContaining("Castle tickets") });
  expect(out[1]).toEqual({ type: "image", data: Buffer.from("png-bytes").toString("base64"), mimeType: "image/png" });
});
it("an image over 3 MB is refused with a clear message", ...);
it("a PDF returns its extracted text under a heading", ...);          // unpdf mocked → { totalPages: 2, text: "Train 4521 ..." }
it("a PDF with no text layer says it is a scan with no readable text", ...); // text "   "
it("long PDF text is truncated with a note", ...);                    // MAX_TEXT_CHARS + 10 chars → note mentions truncation
it("a PDF over 10 MB is refused", ...);
it("another type returns metadata and says it can't be read here", ...); // e.g. "text/csv" → no storage read
it("missing bytes in storage returns a clear message, not a throw", ...); // Review Focus 5: storage.read → null
it("a Globe-owned attachment reads as not found", ...);               // tripId null → notFound() thrown
it("a fork-owned attachment reads as not found", ...);                // Review Focus 4
it("checks trip access before reading bytes", ...);                   // requireTripAccess before storage.read
```

and in `run-tool.test.ts`: `runToolContent` returns the content as given; maps a `notFound()` digest to `NOT_FOUND_TEXT` exactly as `runTool` does.

Run — FAIL.

- [ ] **Step 3: Implement** `attachment-content.ts`:

```ts
export async function loadAttachmentContentForMcp(attachmentId: string): Promise<ToolContent[]> {
  const a = await db.attachment.findUnique({
    where: { id: attachmentId },
    select: { tripId: true, mime: true, size: true, storageKey: true, title: true, filename: true, targetType: true, targetId: true },
  });
  if (!a || !a.tripId) notFound();           // Globe files and missing rows look the same
  await requireTripAccess(a.tripId);
  if (a.targetType !== "TRIP" && a.targetId) {
    const kind = a.targetType as OwnerKind;   // only for STOP/ACCOMMODATION/TRANSPORT/ITEM
    const { forkOwned } = await loadOwners(a.tripId, [{ kind, id: a.targetId }]);
    if (forkOwned.has(ownerKey(kind, a.targetId))) notFound();
  }
  const name = a.title ?? a.filename;
  const header = `${name} (${a.filename}, ${a.mime}, ${formatMB(a.size)})`;
  const isPdf = a.mime === "application/pdf";
  const isImage = a.mime.startsWith("image/");
  if (!isPdf && !isImage) return [{ type: "text", text: `${header}\nThis file type can't be read here — open it in the app.` }];
  if (isImage && a.size > MAX_IMAGE_BYTES) return [{ type: "text", text: `${header}\nThis image is too large to send here (over 3 MB) — open it in the app.` }];
  if (isPdf && a.size > MAX_PDF_BYTES) return [{ type: "text", text: `${header}\nThis PDF is too large to read here (over 10 MB) — open it in the app.` }];
  const bytes = a.storageKey ? await getStorage().read(a.storageKey) : null;
  if (!bytes) return [{ type: "text", text: `${header}\nThe file's contents couldn't be found in storage — try opening it in the app.` }];
  if (isImage) return [{ type: "text", text: header }, { type: "image", data: bytes.toString("base64"), mimeType: a.mime }];
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const body = (Array.isArray(text) ? text.join("\n") : text).trim();
  if (!body) return [{ type: "text", text: `${header}\nThis PDF is a scan with no readable text — open it in the app to see it.` }];
  const truncated = body.length > MAX_TEXT_CHARS;
  return [{ type: "text", text: `${header} · ${totalPages} page${totalPages === 1 ? "" : "s"}\n\n${truncated ? body.slice(0, MAX_TEXT_CHARS) : body}${truncated ? `\n\n[Truncated: showing the first ${MAX_TEXT_CHARS.toLocaleString("en-AU")} characters.]` : ""}` }];
}
```

(Check whether an Attachment row may lack `storageKey` and serve from `url` instead — read `lib/attachment-serve.ts`; if legacy rows exist, follow its lookup rather than returning "couldn't be found". Check `formatMB`'s location — `@/lib/format-bytes`.)

Implement `runToolContent` + shared `errorResult` in `run-tool.ts`. Register:

```ts
  server.registerTool(
    "get_attachment",
    {
      title: "Get attachment",
      description:
        "Reads one file from list_attachments or a plan item's files. Images come back as images (up to 3 MB); PDFs come back as their text (up to 10 MB; a scanned PDF with no text layer says so). Other file types can't be read here.",
      inputSchema: { attachmentId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ attachmentId }) => runToolContent("get_attachment", () => loadAttachmentContentForMcp(attachmentId)),
  );
```

- [ ] **Step 4: Run** `npx vitest run lib/mcp/reads/attachment-content.test.ts lib/mcp/run-tool.test.ts lib/mcp/tools/reads.test.ts lib/mcp/prompts.test.ts` — PASS. Then one real-library smoke check without mocks: a tiny test (or a `node -e` one-off you do not commit) that runs `extractText` on a small PDF generated in-memory, to prove `unpdf` actually loads in this Node/Vitest setup. If you commit it, keep it fast (<1 s) and self-contained (no network, no fixture larger than a few KB).

- [ ] **Step 5: Task-done checks and commit**

```bash
npx vitest related --run lib/mcp/reads/attachment-content.ts lib/mcp/run-tool.ts lib/mcp/tools/reads.ts
npx tsc --noEmit
npx eslint lib/mcp/reads/attachment-content.ts lib/mcp/reads/attachment-content.test.ts lib/mcp/run-tool.ts lib/mcp/run-tool.test.ts lib/mcp/tools/reads.ts
git add package.json package-lock.json lib/mcp/reads/attachment-content.ts lib/mcp/reads/attachment-content.test.ts lib/mcp/run-tool.ts lib/mcp/run-tool.test.ts lib/mcp/tools/reads.ts
git commit -m "feat(mcp): get_attachment returns images and PDF text

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Docs — connect-claude, follow-ups, header comments

**Files:**
- Modify: `docs/connect-claude.md` ("It can read" list; "cannot touch" line)
- Modify: `docs/open-follow-ups.md` (add TC-11)
- Modify: `lib/mcp/tools/reads.ts` header comment (lists the read tools)

- [ ] **Step 1:** In `docs/connect-claude.md`'s "It can read" list: Transport now includes where it actually leaves from and arrives at, and local times in each end's own timezone; Stops include their timezone; the trip's Travellers (names and roles); **each Cost individually** (own currency and home currency, paid or due, what it belongs to — "what's due in the next 30 days?" works); **files**: which files are attached to what, and reading a file's contents (images up to 3 MB; PDFs' text up to 10 MB; scanned PDFs without text can't be read). In "It cannot touch", keep Attachments but make it "uploading, renaming or deleting Attachments". Keep the doc's voice (written to Cam and his partner).
- [ ] **Step 2:** In `docs/open-follow-ups.md`, after TC-10, add: `- **TC-11 · Booking details as their own fields.** Cancellation deadlines, "cash only", and who booked or paid for something live today in free-text notes, so "what can we still cancel?" means reading every note. A model and app-form change, not a Claude-connection change; raised 2026-10-11 by a Claude session using the connection. Payment due dates already exist on Costs (\`list_costs\`).`
- [ ] **Step 3:** Update `reads.ts`'s header comment to name the new tools (`list_costs`, `list_attachments`, `get_attachment`). In `docs/connect-claude.md`, wherever the prompts (`review-plan`, `pack-for`) are described — or, if they aren't, in a short new "Ready-made prompts" section — add `plan-day` (plans a day as timed things to do, checks addresses, getting-there options, opening hours and fixed times, builds it after you agree) and `check-day` (checks a planned day and suggests fixes), and say plainly that opening hours and travel times come from Claude's own web search, so anything it couldn't verify is marked unverified.
- [ ] **Step 4: Checks and commit**

```bash
npx eslint lib/mcp/tools/reads.ts
git add docs/connect-claude.md docs/open-follow-ups.md lib/mcp/tools/reads.ts
git commit -m "docs(mcp): read pass in connect-claude; log TC-11

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `plan-day` and `check-day` prompts

**Runs after Task 4 and before Task 5** (its prompts name `list_attachments`, which must already be registered — `lib/mcp/prompts.test.ts` asserts every tool a prompt names is registered).

**Files:**
- Modify: `lib/mcp/prompts.ts`
- Test: `lib/mcp/prompts.test.ts`

**Interfaces:**
- Consumes: registered tool names `get_trip_plan`, `get_wishlist`, `list_attachments`, `search_places`, `schedule_thing_to_do`, `add_thing_to_do`, `set_day_title`.
- Produces: prompts `plan-day` (args `tripId`, `date`, optional `brief`) and `check-day` (args `tripId`, `date`).

- [ ] **Step 1: Failing tests** — in `prompts.test.ts`, extend `PROMPT_TOOLS` (the map the "every tool name each prompt mentions is a registered tool" test iterates) with:

```ts
  "plan-day": ["get_trip_plan", "get_wishlist", "list_attachments", "search_places", "schedule_thing_to_do", "add_thing_to_do", "set_day_title"],
  "check-day": ["get_trip_plan", "list_attachments", "search_places"],
```

(If that test passes fixed `arguments: { tripId: "t1" }`, make it pass `date: "2026-12-18"` too for these two.) And add:

```ts
it("plan-day carries the date and brief, and builds real things to do, never a note", async () => {
  const c = await connectTestClient();
  const r = await c.getPrompt({ name: "plan-day", arguments: { tripId: "t1", date: "2026-12-18", brief: "castle in the afternoon" } });
  const t = textOf(r.messages[0]);
  expect(t).toContain("2026-12-18");
  expect(t).toContain("castle in the afternoon");
  expect(t).toMatch(/never put the schedule in a note/i);
  expect(t).toMatch(/change nothing until I agree/i);
});

it("plan-day without a brief still reads cleanly", async () => {
  const c = await connectTestClient();
  const r = await c.getPrompt({ name: "plan-day", arguments: { tripId: "t1", date: "2026-12-18" } });
  expect(textOf(r.messages[0])).not.toContain("undefined");
});

it("both day prompts run the logistics check with travel options and verified/unverified marks", async () => {
  const c = await connectTestClient();
  for (const name of ["plan-day", "check-day"]) {
    const t = textOf((await c.getPrompt({ name, arguments: { tripId: "t1", date: "2026-12-18" } })).messages[0]);
    expect(t).toMatch(/walk/i);
    expect(t).toMatch(/train|metro/i);
    expect(t).toMatch(/bus/i);
    expect(t).toMatch(/car|taxi/i);
    expect(t).toMatch(/opening hours/i);
    expect(t).toMatch(/unverified/i);
  }
});

it("check-day changes nothing until agreed", async () => {
  const c = await connectTestClient();
  const t = textOf((await c.getPrompt({ name: "check-day", arguments: { tripId: "t1", date: "2026-12-18" } })).messages[0]);
  expect(t).toMatch(/change nothing until I agree/i);
});
```

Run: `npx vitest run lib/mcp/prompts.test.ts` — FAIL.

- [ ] **Step 2: Implement** in `prompts.ts` (update the header comment to list four prompts):

```ts
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Shared by plan-day and check-day (spec 2026-10-11-mcp-read-pass Part E). */
const LOGISTICS_CHECK =
  "For each stop on the day, in order: (1) Address — confirm it resolves with search_places and name the place it matched. " +
  "(2) Getting there — from the previous place, give the options that apply (walk, metro or train, bus or tram, car or taxi) with a rough time for each, recommend one, and check the gap allows for it. " +
  "(3) Opening hours — check them for that date and weekday, including seasonal and holiday closures, and whether booking is needed. " +
  "(4) Fixed times — check the day's Transport (local times from get_trip_plan), check-out and check-in fit, with a buffer for airports and stations. " +
  "Mark each point verified (say how: web search, search_places) or unverified. Teepee holds no opening hours or routing data, so flag anything you can't check with your own tools — never guess.";

  server.registerPrompt(
    "plan-day",
    {
      title: "Plan a day",
      description: "Plans one day of a trip as timed things to do, checks the logistics (addresses, getting-there options, opening hours, fixed times), and builds it after you agree.",
      argsSchema: { tripId: z.string(), date: isoDate, brief: z.string().optional() },
    },
    ({ tripId, date, brief }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Plan ${date} on trip ${tripId}${brief ? ` — what I'd like: ${brief}` : ""}. ` +
              "First read get_trip_plan (the Stop for that date, what's already on the day, Transport in local time, check-in and check-out), get_wishlist (ideas and Votes — favour must-dos) and list_attachments (tickets we already have for that day). " +
              "Draft a timed itinerary that fits around the Transport and check-in/out times. Then run this logistics check on the draft and fix what fails: " +
              LOGISTICS_CHECK +
              " Propose the itinerary with the getting-there options between stops, the check results, and a suggested Day title. Change nothing until I agree. " +
              "Once I agree, build it as real things to do: place Wishlist ideas with schedule_thing_to_do; add new things with add_thing_to_do, each with the date, stopId, startTime, endTime and address; set the title with set_day_title. Never put the schedule in a note. Leave anything already on the day alone unless I say to move or delete it.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "check-day",
    {
      title: "Check a day",
      description: "Checks a planned day's logistics — addresses, getting-there options, opening hours, fixed times — and suggests fixes.",
      argsSchema: { tripId: z.string(), date: isoDate },
    },
    ({ tripId, date }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Check ${date} on trip ${tripId}: read get_trip_plan (what's on the day, Transport in local time, check-in and check-out) and list_attachments (tickets for that day), then run this logistics check on the day as it stands: ` +
              LOGISTICS_CHECK +
              " List the problems you find with suggested fixes, including better getting-there options. Change nothing until I agree.",
          },
        },
      ],
    }),
  );
```

- [ ] **Step 3: Run** `npx vitest run lib/mcp/prompts.test.ts` — PASS.

- [ ] **Step 4: Task-done checks and commit**

```bash
npx vitest related --run lib/mcp/prompts.ts
npx tsc --noEmit
npx eslint lib/mcp/prompts.ts lib/mcp/prompts.test.ts
git add lib/mcp/prompts.ts lib/mcp/prompts.test.ts
git commit -m "feat(mcp): plan-day and check-day prompts with a logistics check

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Branch finish (main session, once)

`npm test` + `npm run build` + `npm run test:integration` (local DB via a temporary 127.0.0.1:5432 forward to host.docker.internal, as earlier in this branch). Then superpowers:finishing-a-development-branch — report and wait; do not merge or deploy.
