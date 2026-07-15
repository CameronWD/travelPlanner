# Transport Locations, Anchoring & Discreet Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make transport legs support free-place From/To entry, pin each leg to where it was added (no "Other transport" box), let legs be moved by edit-picker and drag, fix the delete-that-doesn't-stick bug, and remove the unused Discreet mode entirely.

**Architecture:** Three layers. (1) Remove Discreet mode (cookie-only feature, no DB) via a dependency-safe un-branch → delete order. (2) Add an `anchorStopId` to `Transport` — the stop a leg renders *after* in the Plan view — resolved by a pure `resolveTransportSlot()` function, replacing the pair-matching + "Other transport" box. (3) A `LocationCombobox` (Popover + async place search) replaces the From/To stop-dropdowns + free-text fields. Delete reliability is fixed with local optimistic state + `revalidatePath(path, 'layout')`.

**Tech Stack:** Next.js App Router (RSC + server actions), Prisma + PostgreSQL, Tailwind v4, Radix UI (Select/Popover), dnd-kit (`@dnd-kit/core` `^6.3.1`, `/sortable` `^10.0.0`, `/utilities` `^3.2.2`), Vitest + Testing Library, class-variance-authority, lucide-react.

## Global Constraints

- **Branch:** all work stays on the current branch `feat/transport-locations-anchoring`. Implementers must NOT create, switch, merge, or rebase branches, and must never touch `main`.
- **TDD:** every task writes the failing test first, watches it fail, implements, watches it pass, commits.
- **Discreet mode is being deleted** — do NOT preserve, re-add, or write new code that reads `teepee-discreet*` cookies or imports `@/lib/discreet*` or `@/components/discreet/*`.
- **Colours:** light + dark only. Use existing semantic tokens / palette utility classes; do not introduce hardcoded hex where a token exists.
- **Database:** PostgreSQL. Schema changes go through `npx prisma migrate dev --name <name>` and the generated migration is committed. Regenerate the client (`npx prisma generate`) as part of the same task.
- **Fork-scoping:** every DB query that reads/writes trip data must keep the existing `planScope(forkId)` / `forkId` handling. Never drop it.
- **Transport action input contract:** the `input` object shape passed to `createTransport`/`updateTransport` (fields `mode`, `fromStopId`, `toStopId`, `depIsHome`, `arrIsHome`, `depPlace`, `arrPlace`, `depAt`, `arrAt`, `reference`, `notes`, cost fields) must be preserved; new field `anchorStopId` is additive.
- **Commits:** conventional-commit subject; end every commit message body with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Test command:** `npx vitest run <path>` for a file; `npx tsc --noEmit` for type-check; `npm run lint` for lint. Full suite: `npx vitest run`.

---

## File Structure

**Phase 0 — Discreet removal (delete):** `components/discreet/*` (6 files), `lib/discreet.ts`, `lib/discreet.test.ts`, `lib/discreet-server.ts`, `lib/discreet-server.test.ts`, `public/discreet-icon.svg`, a CSS block in `app/globals.css`. **Un-branch:** `app/(app)/layout.tsx` (+ `.test.tsx`), `components/command-palette.tsx`, `components/command-palette-mount.tsx`, `app/(app)/trips/page.tsx`, `app/(app)/trips/new/page.tsx`, `app/(app)/trips/[tripId]/layout.tsx`, `app/(app)/trips/[tripId]/plan/page.tsx`, `app/(app)/globe/page.tsx`, `app/(app)/trips/[tripId]/compare/page.tsx` (+ `components/trip/compare-table.tsx`), `app/(app)/trips/[tripId]/wishlist/page.tsx`, `components/trip/fork-switcher.tsx` (comment), `components/trip/variant-banner.tsx` (comment).

**Phase 1–4 — Transport:**
- `prisma/schema.prisma` + a new migration — `anchorStopId` on `Transport`.
- `lib/transport-anchor.ts` (new) + `lib/transport-anchor.test.ts` — pure slot resolver.
- `server/actions/transport.ts` — `revalidatePath` scope, `anchorStopId` write, `searchPlacesAction`, `reorderTransports`.
- `lib/validations/transport.ts` — `anchorStopId` field.
- `components/trip/location-combobox.tsx` (new) + test — the From/To combobox.
- `components/trip/transport-form-dialog.tsx` — combobox wiring + "Position in plan" picker.
- `components/trip/itinerary-manager.tsx` — `localTransports` state, optimistic delete, slot rendering, add-time anchor capture, "add here" buttons, drag-to-reorder.
- `app/(app)/trips/[tripId]/plan/page.tsx` — select `anchorStopId`, pass through.

---

# PHASE 0 — Remove Discreet mode

### Task 1: Un-branch the app shell (layout + command palette)

**Files:**
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(app)/layout.test.tsx`
- Modify: `components/command-palette.tsx`
- Modify: `components/command-palette-mount.tsx`

**Interfaces:**
- Produces: `CommandPaletteMount` becomes a zero-prop component: `export function CommandPaletteMount()`.

- [ ] **Step 1: Update `layout.test.tsx` first (test drives the shape).** Remove the `vi.mock("@/lib/discreet-server", …)` block, the `vi.mock("@/components/discreet/discreet-toggle", …)` block, the `import { getDiscreetState } from "@/lib/discreet-server";` line, and the default-mock line `vi.mocked(getDiscreetState).mockResolvedValue(...)`. Replace the four discreet-specific test cases (the "shows the TEEPEE wordmark", "shows the neutral label", "renders the tent SVG in normal mode", "does NOT render the tent SVG in discreet mode" cases) with these two:

```tsx
it("renders the tent SVG wordmark", async () => {
  const ui = await AppLayout({ children: <div /> });
  const { container } = render(ui as React.ReactElement);
  expect(container.querySelector("svg[data-testid='tent-icon']")).toBeInTheDocument();
  expect(screen.getByText("TEEPEE")).toBeInTheDocument();
});

it("ramps the content width up on large screens", async () => {
  const ui = await AppLayout({ children: <div /> });
  render(ui as React.ReactElement);
  const main = screen.getByTestId("app-main");
  expect(main.className).toContain("max-w-5xl");
  expect(main.className).toContain("lg:max-w-6xl");
  expect(main.className).toContain("2xl:max-w-7xl");
});
```

- [ ] **Step 2: Run the test, expect FAIL** (layout still imports `getDiscreetState`). Run: `npx vitest run app/\(app\)/layout.test.tsx`

- [ ] **Step 3: Un-branch `layout.tsx`.** Apply exactly:
  - Delete imports: `import { getDiscreetState } from "@/lib/discreet-server";` and `import { DiscreetToggle } from "@/components/discreet/discreet-toggle";`.
  - `generateMetadata` → `export async function generateMetadata(): Promise<Metadata> { return {}; }`.
  - Delete the line `const { discreet, label } = await getDiscreetState();`.
  - Root div: `<div className={cn("flex min-h-full flex-col", discreet && "discreet")}>` → `<div className="flex min-h-full flex-col">`. (If `cn` becomes unused, drop its import.)
  - `<CommandPaletteMount disabled={discreet} />` → `<CommandPaletteMount />`.
  - Wordmark `<Link>`: `aria-label={discreet ? label : "TEEPEE — go to your trips"}` → `aria-label="TEEPEE — go to your trips"`, and replace its `{discreet ? ( label ) : ( <>…tent svg…TEEPEE</> )}` children with just the `<>…tent svg…TEEPEE</>` branch (keep the existing tent `<svg data-testid="tent-icon" … className="size-6 text-primary">` exactly as it was in the non-discreet branch).
  - `{!discreet && <CommandPaletteTrigger />}` → `<CommandPaletteTrigger />`.
  - `{!discreet && ( <Link href="/globe" …>Globe</Link> )}` → the bare `<Link href="/globe" …>Globe</Link>`.
  - Delete the `<DiscreetToggle discreet={discreet} label={label} />` line.

- [ ] **Step 4: Un-branch `command-palette-mount.tsx`.** Signature `export function CommandPaletteMount({ disabled }: { disabled: boolean })` → `export function CommandPaletteMount()`; delete both `if (disabled) return;` / `if (disabled) return null;` guards and the JSDoc line mentioning discreet.

- [ ] **Step 5: Un-branch `command-palette.tsx`.** Delete `import { DISCREET_COOKIE } from "@/lib/discreet";`, delete the entire `toggleDiscreet()` function, and delete the `{ label: "Toggle Discreet", onActivate: toggleDiscreet }` entry from the commands array. (If `readCookie`/`setCookie`/`clearCookie` become unused, remove them.)

- [ ] **Step 6: Run tests + typecheck.** `npx vitest run app/\(app\)/layout.test.tsx` (PASS) and `npx tsc --noEmit`.

- [ ] **Step 7: Commit.** `git add -A && git commit` — `refactor(discreet): un-branch app shell (layout + command palette)`.

---

### Task 2: Un-branch the Discreet consumer pages

**Files:**
- Modify: `app/(app)/trips/page.tsx`, `app/(app)/trips/new/page.tsx`, `app/(app)/trips/[tripId]/layout.tsx`, `app/(app)/trips/[tripId]/plan/page.tsx`, `app/(app)/globe/page.tsx`, `app/(app)/trips/[tripId]/compare/page.tsx`, `app/(app)/trips/[tripId]/wishlist/page.tsx`
- Modify: `components/trip/compare-table.tsx`, `components/trip/fork-switcher.tsx`, `components/trip/variant-banner.tsx`

**Interfaces:**
- Produces: `CompareTable` prop `discreet` removed → `export function CompareTable({ trip, plans }: CompareTableProps)`.

- [ ] **Step 1: `trips/page.tsx`** — delete imports `getDiscreetState` and `{ ProjectTable, type ProjectRow }`; `generateMetadata` → `return { title: "Your trips · TEEPEE" };`; delete the whole `const { discreet } = await getDiscreetState(); if (discreet) { … ProjectTable … }` block, keeping the normal render path below it. (Drop now-unused imports like `Table`, `describePhase`, `formatDateRange` **only if** nothing else in the file uses them — verify with a grep before removing.)

- [ ] **Step 2: `trips/new/page.tsx`** — delete `getDiscreetState` import; `generateMetadata` → `return { title: "New trip · TEEPEE" };`.

- [ ] **Step 3: `trips/[tripId]/layout.tsx`** — delete `getDiscreetState` import; drop `getDiscreetState()` from the `Promise.all([...])` and the `{ discreet }` destructure; `const showForkSwitcher = !discreet && (tripPhase !== "travelling" && tripPhase !== "past");` → `const showForkSwitcher = tripPhase !== "travelling" && tripPhase !== "past";`.

- [ ] **Step 4: `trips/[tripId]/plan/page.tsx`** — delete imports `StopSpreadsheet`, `getDiscreetState`, `buildStopSheetRows`; delete the entire `const { discreet } = await getDiscreetState(); if (discreet) { … StopSpreadsheet … }` block. (Verify `convertMinor`/`DEFAULT_HOME_CURRENCY` are still used elsewhere in the file before removing their imports.)

- [ ] **Step 5: `globe/page.tsx`** — delete `getDiscreetState` import; `generateMetadata` → `return { title: "Globe · TEEPEE" };`.

- [ ] **Step 6: `compare/page.tsx`** — delete `getDiscreetState` import; `const [data, { discreet }] = await Promise.all([getComparison(tripId), getDiscreetState()]);` → `const data = await getComparison(tripId);`; `if (plans.length <= 1 && !discreet)` → `if (plans.length <= 1)`; delete the `discreet={discreet}` prop passed to `<CompareTable … />`.

- [ ] **Step 7: `compare-table.tsx`** — delete the `discreet?: boolean` field + its doc comment from `CompareTableProps`; signature → `export function CompareTable({ trip, plans }: CompareTableProps)`; delete the `if (discreet) { return <…neutral placeholder…/>; }` gate block.

- [ ] **Step 8: `wishlist/page.tsx`** — delete `getDiscreetState` import and the `const { discreet } = await getDiscreetState();` line; `{activeFork && !discreet && <VariantBanner … />}` → `{activeFork && <VariantBanner … />}`.

- [ ] **Step 9: comment-only** — in `fork-switcher.tsx` and `variant-banner.tsx`, delete the lines in the doc comments that mention discreet mode (leave the rest of each comment intact).

- [ ] **Step 10: Typecheck + affected tests.** `npx tsc --noEmit`; `npx vitest run components/trip/compare-table.test.tsx`. Both green. (compare-table.test.tsx may reference `discreet` — if so, remove those cases/props as part of Step 7.)

- [ ] **Step 11: Commit.** `refactor(discreet): un-branch consumer pages and compare table`.

---

### Task 3: Delete orphaned Discreet modules, styles, and assets

**Files:**
- Delete: `components/discreet/discreet-toggle.tsx`, `components/discreet/discreet-toggle.test.tsx`, `components/discreet/project-table.tsx`, `components/discreet/project-table.test.tsx`, `components/discreet/stop-spreadsheet.tsx`, `components/discreet/stop-spreadsheet.test.tsx`, `lib/discreet.ts`, `lib/discreet.test.ts`, `lib/discreet-server.ts`, `lib/discreet-server.test.ts`, `public/discreet-icon.svg`
- Modify: `app/globals.css` (remove the discreet CSS block)

- [ ] **Step 1: Confirm orphaned.** Run `rg -n "discreet|@/lib/discreet|components/discreet|DISCREET_COOKIE|getDiscreetState|buildStopSheetRows|ProjectTable|StopSpreadsheet" --glob '!docs/**'`. Expect matches ONLY inside the files about to be deleted and the `app/globals.css` block. If any live source outside those references them, un-branch it before deleting (do not proceed with a dangling reference).

- [ ] **Step 2: Delete the files.** `git rm` the 11 files listed above.

- [ ] **Step 3: Remove the CSS block** in `app/globals.css` — the `.discreet` "Workspace skin" block (comment header `── Discreet "Workspace" skin ──` through the last `.dark .discreet { … }` rule). Leave surrounding rules untouched.

- [ ] **Step 4: Full verification.** `rg -ni "discreet"` returns nothing under `app/`, `components/`, `lib/`, `public/` (docs/ may retain plan references — that's fine). Then `npx tsc --noEmit`, `npm run lint`, and the full suite `npx vitest run` — all green.

- [ ] **Step 5: Commit.** `chore(discreet): delete orphaned discreet modules, styles, and asset`.

---

# PHASE 1 — Delete reliability + local transport state

### Task 4: Broaden transport revalidation to layout scope

**Files:**
- Modify: `server/actions/transport.ts` (the three `revalidatePath` calls in `createTransport`, `updateTransport`, `deleteTransport`)
- Test: `server/actions/transport.test.ts`

**Why:** `revalidatePath('/trips/${id}')` only invalidates the base page, not `/trips/${id}/plan`. Layout scope cascades to every sub-route (plan, calendar, day, today), so mutations reflect everywhere.

- [ ] **Step 1: Write the failing test.** In `transport.test.ts`, add a test that mocks `next/cache` and asserts delete uses layout scope. Follow the file's existing mock style; the assertion:

```ts
import { revalidatePath } from "next/cache";
// ...inside a test that creates a trip + transport, then:
await deleteTransport(created.id);
expect(revalidatePath).toHaveBeenCalledWith(`/trips/${tripId}`, "layout");
```

If `next/cache` is not already mocked in this file, add `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));` at top.

- [ ] **Step 2: Run, expect FAIL** (currently called with one arg). `npx vitest run server/actions/transport.test.ts`

- [ ] **Step 3: Implement.** Change all three calls: `revalidatePath(\`/trips/${tripId}\`)` and `revalidatePath(\`/trips/${transport.tripId}\`)` → add the `, "layout"` second argument.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit.** `fix(transport): revalidate trip layout so all sub-views refresh`.

---

### Task 5: Local transport state + optimistic delete

**Files:**
- Modify: `components/trip/itinerary-manager.tsx`
- Test: `components/trip/itinerary-manager.test.tsx` (create if absent; otherwise add a case)

**Interfaces:**
- Produces: a `localTransports` state array (typed `ItineraryTransport[]`) that mirrors `initialStops`→`localStops` pattern and is the single source for every transport render path.

- [ ] **Step 1: Write the failing test.** A component test rendering `ItineraryManager` with two stops and one transport linking them, mocking `@/server/actions/transport`'s `deleteTransport` to resolve `{ success: true }` and mocking the confirm dialog to auto-confirm. Assert the transport card is present, click its delete control, then assert it is removed from the DOM without any prop change:

```tsx
it("optimistically removes a transport on delete", async () => {
  // render with initialTransports=[legAB]; auto-confirm; deleteTransport → {success:true}
  const card = await screen.findByTestId("transport-heading");
  // trigger delete via the row action…
  await waitFor(() => expect(screen.queryByTestId("transport-heading")).not.toBeInTheDocument());
});
```

Match the existing test setup/mocks in the repo (look at how other `itinerary-manager`/`transport-card` tests mock `confirm` and server actions).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** Mirror the `localStops` pattern already in the file:

```tsx
const [localTransports, setLocalTransports] = React.useState<ItineraryTransport[]>(initialTransports);
const [trackedInitialTransports, setTrackedInitialTransports] = React.useState(initialTransports);
if (trackedInitialTransports !== initialTransports) {
  setTrackedInitialTransports(initialTransports);
  setLocalTransports(initialTransports);
}
```

Replace **every** read of `initialTransports` in the render/memos (`transportByPair`, `betweenLegsIds`, `otherTransports`, bookend lookups, `handleDeleteTransport`'s label lookup) with `localTransports`. Then make delete optimistic with rollback:

```tsx
if (!confirmed) return;
const snapshot = localTransports;
setLocalTransports((prev) => prev.filter((t) => t.id !== transportId));
setPendingId(transportId);
try {
  const res = await deleteTransport(transportId);
  if (!res.success) {
    setLocalTransports(snapshot); // rollback
    toast({ variant: "destructive", title: "Couldn't delete that transport." });
  }
} catch {
  setLocalTransports(snapshot);
  toast({ variant: "destructive", title: "Couldn't delete that transport." });
} finally {
  setPendingId(null);
}
```

Use the file's existing `toast` import/util.

- [ ] **Step 4: Run, expect PASS**; then `npx tsc --noEmit`.

- [ ] **Step 5: Commit.** `fix(transport): optimistic delete via local transport state`.

---

# PHASE 2 — Anchor model + slot rendering

### Task 6: Add `anchorStopId` to Transport (schema + migration + plumbing)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_transport_anchor/migration.sql` (generated)
- Modify: `lib/validations/transport.ts`
- Modify: `server/actions/transport.ts` (`createTransport`, `updateTransport` write `anchorStopId`; `validateStopBelongsToTrip` covers it)
- Modify: `components/trip/itinerary-manager.tsx` (`ItineraryTransport` type gains `anchorStopId`)
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx` (select + map `anchorStopId`)
- Test: `server/actions/transport.test.ts`

**Interfaces:**
- Produces: `Transport.anchorStopId: string | null`; `TransportInput.anchorStopId?: string | ""`; `ItineraryTransport.anchorStopId?: string | null`.

- [ ] **Step 1: Schema.** In `prisma/schema.prisma` `Transport` model add:
```prisma
  anchorStopId String?
  anchorStop   Stop?   @relation("TransportAnchorStop", fields: [anchorStopId], references: [id], onDelete: SetNull)
```
and on `Stop` add the back-relation:
```prisma
  anchorTransports Transport[] @relation("TransportAnchorStop")
```
Add `@@index([anchorStopId])` to `Transport`.

- [ ] **Step 2: Generate migration + client.** `npx prisma migrate dev --name add_transport_anchor`. Then edit the generated `migration.sql` to append a backfill after the ALTER/INDEX/FK statements:
```sql
-- Backfill: anchor existing legs to their departure stop where known.
UPDATE "Transport" SET "anchorStopId" = "fromStopId" WHERE "fromStopId" IS NOT NULL;
```
Re-run `npx prisma migrate reset --force` (dev DB) or re-apply so the backfill runs, then `npx prisma generate`.

- [ ] **Step 3: Validation.** In `lib/validations/transport.ts` add to the schema (next to `toStopId`):
```ts
  /** Stop this leg renders after in the Plan view (position anchor). */
  anchorStopId: z.string().trim().min(1).optional().or(z.literal("")),
```

- [ ] **Step 4: Write failing test.** In `transport.test.ts`, a test that creates two stops + a transport with `anchorStopId: stopB.id` and asserts the persisted row has `anchorStopId === stopB.id`. Also assert that an invalid `anchorStopId` (a stop from another trip) is rejected by `validateStopBelongsToTrip`.

- [ ] **Step 5: Run, expect FAIL** (action drops the field).

- [ ] **Step 6: Implement action writes.** In `createTransport`/`updateTransport`: normalise `const anchorStopId = data.anchorStopId || null;`, include `anchorStopId` in the `validateStopBelongsToTrip(tripId, [fromStopId, toStopId, anchorStopId], forkId)` call, and add `anchorStopId` to the `db.transport.create`/`update` `data`.

- [ ] **Step 7: Plumb the read path.** In `itinerary-manager.tsx` add `anchorStopId?: string | null;` to `ItineraryTransport`. In `plan/page.tsx` add `anchorStopId: true` to the transport `select` and include `anchorStopId: t.anchorStopId` in the mapping that builds `initialTransports`.

- [ ] **Step 8: Run test (PASS) + `npx tsc --noEmit`.**

- [ ] **Step 9: Commit.** `feat(transport): add anchorStopId column, validation, and plumbing`.

---

### Task 7: Pure slot resolver

**Files:**
- Create: `lib/transport-anchor.ts`
- Test: `lib/transport-anchor.test.ts`

**Interfaces:**
- Produces:
  - `HEAD_SLOT = "__head__"` (constant).
  - `type AnchorStopLike = { id: string }`
  - `type AnchorTransportLike = { id: string; anchorStopId?: string | null; fromStopId?: string | null; toStopId?: string | null; sortOrder: number }`
  - `resolveTransportSlot(t: AnchorTransportLike, orderedStops: readonly AnchorStopLike[]): string` — returns a stop id (render *after* it) or `HEAD_SLOT`.
  - `groupTransportsBySlot(transports, orderedStops, excludeIds?): Map<string, T[]>` — keyed by slot, each list sorted by `sortOrder` then `id`.

**Resolution rules (in order):**
1. `anchorStopId` set AND that id is in `orderedStops` → return `anchorStopId`.
2. else `fromStopId` set AND in `orderedStops` → return `fromStopId`.
3. else `toStopId` set AND in `orderedStops` → return the id of the stop immediately *before* it, or `HEAD_SLOT` if it's the first stop.
4. else → `HEAD_SLOT`.

- [ ] **Step 1: Write the failing tests.**
```ts
import { describe, it, expect } from "vitest";
import { resolveTransportSlot, groupTransportsBySlot, HEAD_SLOT } from "./transport-anchor";

const stops = [{ id: "a" }, { id: "b" }, { id: "c" }];
const t = (o: Partial<Parameters<typeof resolveTransportSlot>[0]>) =>
  ({ id: "x", sortOrder: 0, ...o }) as Parameters<typeof resolveTransportSlot>[0];

describe("resolveTransportSlot", () => {
  it("uses explicit anchorStopId when the stop exists", () => {
    expect(resolveTransportSlot(t({ anchorStopId: "b" }), stops)).toBe("b");
  });
  it("falls back to fromStopId", () => {
    expect(resolveTransportSlot(t({ fromStopId: "a" }), stops)).toBe("a");
  });
  it("anchors an arrival above its to-stop (previous stop's slot)", () => {
    expect(resolveTransportSlot(t({ toStopId: "b" }), stops)).toBe("a");
  });
  it("arrival at the first stop → head slot", () => {
    expect(resolveTransportSlot(t({ toStopId: "a" }), stops)).toBe(HEAD_SLOT);
  });
  it("no usable endpoint → head slot", () => {
    expect(resolveTransportSlot(t({}), stops)).toBe(HEAD_SLOT);
  });
  it("ignores an anchorStopId that no longer exists, falling through", () => {
    expect(resolveTransportSlot(t({ anchorStopId: "zzz", fromStopId: "c" }), stops)).toBe("c");
  });
});

describe("groupTransportsBySlot", () => {
  it("groups by slot and sorts within a slot by sortOrder", () => {
    const legs = [
      { id: "1", anchorStopId: "a", sortOrder: 2 },
      { id: "2", anchorStopId: "a", sortOrder: 1 },
      { id: "3", toStopId: "a", sortOrder: 0 },
    ];
    const g = groupTransportsBySlot(legs, stops);
    expect(g.get("a")!.map((l) => l.id)).toEqual(["2", "1"]);
    expect(g.get(HEAD_SLOT)!.map((l) => l.id)).toEqual(["3"]);
  });
  it("excludes ids in the exclude set (e.g. home bookends)", () => {
    const legs = [{ id: "1", anchorStopId: "a", sortOrder: 0 }];
    expect(groupTransportsBySlot(legs, stops, new Set(["1"])).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (module missing).

- [ ] **Step 3: Implement `lib/transport-anchor.ts`:**
```ts
export const HEAD_SLOT = "__head__";

export interface AnchorStopLike {
  id: string;
}
export interface AnchorTransportLike {
  id: string;
  anchorStopId?: string | null;
  fromStopId?: string | null;
  toStopId?: string | null;
  sortOrder: number;
}

export function resolveTransportSlot(
  t: AnchorTransportLike,
  orderedStops: readonly AnchorStopLike[],
): string {
  const has = (id: string | null | undefined): id is string =>
    Boolean(id) && orderedStops.some((s) => s.id === id);

  if (has(t.anchorStopId)) return t.anchorStopId;
  if (has(t.fromStopId)) return t.fromStopId;
  if (has(t.toStopId)) {
    const idx = orderedStops.findIndex((s) => s.id === t.toStopId);
    return idx > 0 ? orderedStops[idx - 1].id : HEAD_SLOT;
  }
  return HEAD_SLOT;
}

export function groupTransportsBySlot<T extends AnchorTransportLike>(
  transports: readonly T[],
  orderedStops: readonly AnchorStopLike[],
  excludeIds?: ReadonlySet<string>,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const t of transports) {
    if (excludeIds?.has(t.id)) continue;
    const slot = resolveTransportSlot(t, orderedStops);
    const arr = map.get(slot) ?? [];
    arr.push(t);
    map.set(slot, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  }
  return map;
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit.** `feat(transport): pure slot resolver for leg anchoring`.

---

### Task 8: Render legs by slot; remove the "Other transport" box

**Files:**
- Modify: `components/trip/itinerary-manager.tsx`
- Test: `components/trip/itinerary-manager.test.tsx`

**Interfaces:**
- Consumes: `groupTransportsBySlot`, `HEAD_SLOT` from `lib/transport-anchor`; `localTransports` (Task 5); `ItineraryTransport.anchorStopId` (Task 6).

- [ ] **Step 1: Write the failing test.** Render `ItineraryManager` with stops `[A, B]` and a transport whose `fromStopId = A.id`, `toStopId = null`, `arrPlace = "Hakone"`, `anchorStopId = A.id`. Assert the leg's card renders inside the DOM subtree of stop A's slot (e.g. appears after A's card and before B's card), and assert there is **no** element with the text "Other transport".

```tsx
it("renders a free-place leg anchored under its stop, with no Other-transport box", async () => {
  // stops [A,B]; leg {fromStopId:A, arrPlace:'Hakone', anchorStopId:A}
  expect(await screen.findByText(/Hakone/)).toBeInTheDocument();
  expect(screen.queryByText("Other transport")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run, expect FAIL** (leg currently lands in the "Other transport" box).

- [ ] **Step 3: Implement.** Add memo:
```tsx
const legsBySlot = React.useMemo(
  () => groupTransportsBySlot(localTransports, stops, bookendLegIds),
  [localTransports, stops, bookendLegIds],
);
```
In `renderStop`, replace the `legTransports = transportByPair.get(...)` line with `const legTransports = legsBySlot.get(stop.id) ?? [];`, and render those legs **after the stop's own content regardless of `isLast`** (an anchored leg can sit under the last stop). Render each with the existing `<TransportCard … transport={enrichTransport(t, stops)} … />` block. Before the first stop card in the main list, render the `HEAD_SLOT` legs: `{(legsBySlot.get(HEAD_SLOT) ?? []).map(renderLegCard)}` (extract a small `renderLegCard(t)` helper from the existing TransportCard JSX to avoid duplication). Keep the "Add Transport to {nextStop}" button as-is for now (Task 12 revises entry points).

- [ ] **Step 4: Delete dead code.** Remove `transportByPair`, `otherTransports`, `betweenLegsIds`, the `renderSeam` helper and its call sites, and the entire "Other transport" `{otherTransports.length > 0 && (…)}` block. Remove now-unused imports (`isTransportBetweenLegs`). Keep `bookendLegIds`, `findOutboundLeg`, `findReturnLeg`, `renderBookendLeg`.

- [ ] **Step 5: Run tests + typecheck + full suite for this component area.** `npx vitest run components/trip/itinerary-manager.test.tsx`; `npx tsc --noEmit`.

- [ ] **Step 6: Commit.** `feat(transport): anchor-based slot rendering, drop Other-transport box`.

---

# PHASE 3 — First-class From/To location entry

### Task 9: `searchPlacesAction` server action

**Files:**
- Modify: `server/actions/transport.ts`
- Test: `server/actions/transport.test.ts`

**Interfaces:**
- Produces: `export async function searchPlacesAction(tripId: string, query: string): Promise<PlaceSearchOutcome>`.

- [ ] **Step 1: Write the failing test.** Mock `@/lib/geocode`'s `searchPlacesWithStatus` to return `{ status: "ok", candidates: [{ name: "Hakone, Japan", lat: 35.2, lng: 139.0, city: "Hakone", country: "Japan", countryCode: "jp" }] }`; call `searchPlacesAction(tripId, "Hakone")` for a trip the user can access; assert it returns that outcome. Assert it throws / notFound for an inaccessible trip (mirror how other actions test `requireTripAccess`).

- [ ] **Step 2: Run, expect FAIL** (export missing).

- [ ] **Step 3: Implement.** Add near the top imports: `import { searchPlacesWithStatus, type PlaceSearchOutcome } from "@/lib/geocode";` (extend the existing geocode import). Add:
```ts
export async function searchPlacesAction(
  tripId: string,
  query: string,
): Promise<PlaceSearchOutcome> {
  await requireTripAccess(tripId);
  const q = query.trim();
  if (q === "") return { status: "ok", candidates: [] };
  return searchPlacesWithStatus(q);
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit.** `feat(transport): trip-scoped searchPlacesAction`.

---

### Task 10: `LocationCombobox` component

**Files:**
- Create: `components/trip/location-combobox.tsx`
- Test: `components/trip/location-combobox.test.tsx`

**Interfaces:**
- Produces:
```ts
export type LocationValue =
  | { kind: "none" }
  | { kind: "home" }
  | { kind: "stop"; stopId: string; name: string }
  | { kind: "place"; name: string };
export interface LocationComboboxProps {
  label: string;
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  stops: { id: string; name: string }[];
  homeBaseName?: string | null;
  tripId: string;
  disabled?: boolean;
  "data-testid"?: string;
}
export function LocationCombobox(props: LocationComboboxProps): JSX.Element;
```

Behaviour: a `Popover` whose trigger button shows the current value's display text (or "— none —"). The content has a text `Input`; below it, quick options filtered by the query — always "— none —", "🏠 {homeBaseName}" (when provided), and each stop whose name matches the query (case-insensitive). A "Search places" affordance: when the query is ≥ 2 chars, show a button "Search \"{query}\"" that calls `searchPlacesAction(tripId, query)` in a transition; render returned candidates as selectable rows (display `candidate.name`). Selecting any option calls `onChange` with the right variant and closes the popover. Mirror `marker-form.tsx`'s search/candidate pattern (button-triggered search, not debounced).

- [ ] **Step 1: Write the failing tests.**
```tsx
it("lists existing stops and selects one", async () => {
  const onChange = vi.fn();
  render(<LocationCombobox label="From" value={{ kind: "none" }} onChange={onChange}
    stops={[{ id: "s1", name: "Tokyo" }]} tripId="t1" />);
  await userEvent.click(screen.getByRole("button", { name: /From/i }));
  await userEvent.click(await screen.findByText("Tokyo"));
  expect(onChange).toHaveBeenCalledWith({ kind: "stop", stopId: "s1", name: "Tokyo" });
});

it("searches places and selects a candidate", async () => {
  vi.mocked(searchPlacesAction).mockResolvedValue({ status: "ok",
    candidates: [{ name: "Hakone, Japan", lat: 1, lng: 2, city: "Hakone", country: "Japan", countryCode: "jp" }] });
  const onChange = vi.fn();
  render(<LocationCombobox label="To" value={{ kind: "none" }} onChange={onChange}
    stops={[]} tripId="t1" />);
  await userEvent.click(screen.getByRole("button", { name: /To/i }));
  await userEvent.type(screen.getByRole("textbox"), "Hakone");
  await userEvent.click(screen.getByRole("button", { name: /Search/i }));
  await userEvent.click(await screen.findByText("Hakone, Japan"));
  expect(onChange).toHaveBeenCalledWith({ kind: "place", name: "Hakone, Japan" });
});
```
Mock `@/server/actions/transport`'s `searchPlacesAction`. Use the repo's existing Popover test patterns if any.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** using `@/components/ui/popover` (`Popover`, `PopoverTrigger`, `PopoverContent`), `@/components/ui/input`, `@/components/ui/button`, `React.useTransition` for search, and `searchPlacesAction`. Keep it a `"use client"` component. Display text helper: `none → "— none —"`, `home → "🏠 " + homeBaseName`, `stop → name`, `place → name`.

- [ ] **Step 4: Run, expect PASS**; `npx tsc --noEmit`.

- [ ] **Step 5: Commit.** `feat(transport): LocationCombobox (stop-or-place picker with search)`.

---

### Task 11: Wire the combobox into the transport form

**Files:**
- Modify: `components/trip/transport-form-dialog.tsx`
- Test: `components/trip/transport-form-dialog.test.tsx`

**Interfaces:**
- Consumes: `LocationCombobox`, `LocationValue` (Task 10).
- The submit `input` contract is unchanged except it must map the combobox value → `{ fromStopId?, depIsHome, depPlace? }` (and the `to`/`arr` equivalents).

**Mapping (per endpoint):** `none → { stopId: undefined, isHome: false, place: undefined }`; `home → { isHome: true }`; `stop → { stopId }`; `place → { place: name }`.

- [ ] **Step 1: Write/adjust the failing test.** In `transport-form-dialog.test.tsx`, a test that opens the form, picks a From stop and a To place via the combobox, submits, and asserts `createTransport` was called with `fromStopId` set and `arrPlace` set (and `depPlace`/`toStopId` undefined). Keep/port existing coverage that a Home selection yields `depIsHome: true`.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** Replace the two `<Select>` From/To blocks **and** the two "Departure place"/"Arrival place" `<Input>` blocks with two `<LocationCombobox>`s. Model state as `const [fromValue, setFromValue] = React.useState<LocationValue>(initialFrom)` / `toValue`, deriving `initialFrom` from the `transport`/`default*` props:
  - edit + `depIsHome` → `{ kind: "home" }`; edit + `fromStopId` → `{ kind: "stop", stopId, name }` (look up name in `stops`); edit + `depPlace` → `{ kind: "place", name: depPlace }`; add + `defaultFromStopId === HOME_ENDPOINT` → home; add + `defaultFromStopId` → the stop; else `{ kind: "none" }`.
  In the submit builder, replace the `fromStopId`/`depIsHome`/`depPlace` (and `arr`) fields with values mapped from `fromValue`/`toValue` per the table above. Preserve every other input field and the cost block.

- [ ] **Step 4: Run tests (PASS) + `npx tsc --noEmit`.**

- [ ] **Step 5: Commit.** `feat(transport): combobox From/To replaces stop-dropdowns + place inputs`.

---

# PHASE 4 — Move a leg (add-anchor, edit-picker, drag)

### Task 12: Capture the anchor at add-time + "Add transport here" affordances

**Files:**
- Modify: `components/trip/itinerary-manager.tsx`
- Modify: `components/trip/transport-form-dialog.tsx`
- Test: `components/trip/itinerary-manager.test.tsx`

**Interfaces:**
- `addTransportDefaults` state type gains `anchorStopId?: string`.
- `TransportFormDialog`/`TransportForm` gain a `defaultAnchorStopId?: string` prop, included in the create `input` as `anchorStopId`.

- [ ] **Step 1: Write the failing test.** Render the manager with stops `[A, B]`; click the "Add transport here" button rendered in A's slot; assert the opened dialog, on submit, calls `createTransport` with `anchorStopId: A.id`. (Mock `createTransport`.)

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.**
  - Extend state: `const [addTransportDefaults, setAddTransportDefaults] = React.useState<{ fromStopId?: string; toStopId?: string; anchorStopId?: string } | null>(null);`
  - The existing between-stops button: add `anchorStopId: stop.id` to its `setAddTransportDefaults({...})`.
  - Add a small "Add transport here" ghost button in **each** stop slot (inside `renderStop`, after the anchored legs) that calls `setAddTransportDefaults({ anchorStopId: stop.id })`. Add one for the head slot too (`setAddTransportDefaults({ anchorStopId: undefined })` → head). Replace the bottom "Add Transport (Other)" button so it targets the last stop: `setAddTransportDefaults({ anchorStopId: lastStop?.id })` (label it "Add transport"). Leave the two Home bookend buttons unchanged.
  - Pass `defaultAnchorStopId={addTransportDefaults.anchorStopId}` to `<TransportFormDialog>`.
  - In `transport-form-dialog.tsx`: thread `defaultAnchorStopId` through `TransportFormDialog` → `TransportForm`; in the submit builder add `anchorStopId: transport?.anchorStopId ?? defaultAnchorStopId ?? undefined` (edit keeps the leg's existing anchor unless the picker in Task 13 changes it).

- [ ] **Step 4: Run tests (PASS) + `npx tsc --noEmit`.**

- [ ] **Step 5: Commit.** `feat(transport): capture position anchor when adding a leg`.

---

### Task 13: "Position in plan" picker in the edit form

**Files:**
- Modify: `components/trip/transport-form-dialog.tsx`
- Test: `components/trip/transport-form-dialog.test.tsx`

**Interfaces:**
- `TransportForm` gains the picker only in **edit** mode. Its value maps to `anchorStopId` in the update `input`.

- [ ] **Step 1: Write the failing test.** Open the form in edit mode for a leg anchored to A, with stops `[A, B]`; change the "Position in plan" select to "After B"; submit; assert `updateTransport` called with `anchorStopId: B.id`. Selecting "Before {firstStop}" (head) → `anchorStopId: ""` (cleared → null).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** Add a `<Field label="Position in plan">` with a `<Select>` (only when `isEdit`). Options: one per stop labelled `After {stop.name}` with value = stop id, plus a leading `Before {stops[0].name}` option with the `NONE`/`__head__` sentinel. State `const [anchorStopId, setAnchorStopId] = React.useState(transport?.anchorStopId ?? "")`. Map into the submit builder: `anchorStopId: anchorStopId === HEAD_SENTINEL ? "" : (anchorStopId || undefined)` — where selecting head sends `""` (server normalises to null). Reuse the `stops` prop for the option list.

- [ ] **Step 4: Run tests (PASS) + `npx tsc --noEmit`.**

- [ ] **Step 5: Commit.** `feat(transport): edit-form position-in-plan picker`.

---

### Task 14: Drag-to-reorder legs

**Files:**
- Modify: `components/trip/itinerary-manager.tsx`
- Modify: `server/actions/transport.ts` (new `reorderTransports`)
- Test: `server/actions/transport.test.ts`, `components/trip/itinerary-manager.test.tsx`

**Interfaces:**
- Produces: `export async function reorderTransports(tripId: string, items: { id: string; anchorStopId: string | null; sortOrder: number }[], forkId?: PlanId): Promise<TransportActionResult>`.

- [ ] **Step 1: Write the failing server test.** Create trip + stops `[A,B]` + two legs anchored to A; call `reorderTransports` to move one leg's `anchorStopId` to B and set new `sortOrder`s; assert the DB rows reflect the new `anchorStopId`/`sortOrder`. Assert legs from another trip are rejected.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `reorderTransports`.** Mirror `reorderStops`'s guard/validation/transaction shape (`requireTripAccess`, verify each id belongs to `tripId` within `planScope(forkId)`, then a `$transaction` updating each row's `anchorStopId` + `sortOrder`). `revalidatePath(\`/trips/${tripId}\`, "layout")`. Return `{ success: true }`.

- [ ] **Step 4: Write the failing component test.** With stops `[A,B]` and one leg anchored to A, simulate a drag of the leg onto B's droppable and assert `reorderTransports` is called with that leg's id and `anchorStopId: B.id`. (Follow how existing stop-drag tests fire dnd-kit events; if direct DnD simulation is impractical in jsdom, test the pure reducer helper instead — see Step 5.)

- [ ] **Step 5: Implement drag.** Add a `SortableTransport` wrapper mirroring `SortableStop` (`useSortable({ id: t.id, data: { type: "transport", anchorStopId: <slot> } })`, a `data-testid="drag-handle-transport"` grab handle). Render each anchored leg card inside `SortableTransport` (wrap in the existing `SortableContext` used for stops, or a per-slot `SortableContext` keyed by slot). Extend `handleDragEnd` with an `activeType === "transport"` branch: derive the target slot from `over` (the stop whose slot was dropped into, or another leg's slot), compute the new ordered list for affected slots, optimistically `setLocalTransports(...)`, then call `reorderTransports`; on failure, revert to the snapshot and `toast`. Extract the ordering math into a small pure helper `reorderTransportItems(...)` and unit-test that if the DnD event simulation is not feasible in jsdom.

- [ ] **Step 6: Run all new tests (PASS) + `npx tsc --noEmit`.**

- [ ] **Step 7: Commit.** `feat(transport): drag-to-reorder legs across slots`.

---

## Final verification (controller runs before whole-branch review)

- [ ] `npx prisma generate` then `npx tsc --noEmit` — clean.
- [ ] `npm run lint` — clean.
- [ ] `npx vitest run` — full suite green.
- [ ] `rg -ni "discreet" app components lib public` — no matches (docs/ may retain plan text).

---

## Self-Review (author checklist — completed)

**Spec coverage:** ① combobox → Tasks 9–11. ② anchoring + no Other box → Tasks 6–8. ③ move via edit-picker (Task 13) + drag (Task 14). ④ delete fix → Tasks 4–5. Discreet removal → Tasks 1–3. All spec points map to tasks.

**Type consistency:** `anchorStopId` is `string | null` on the model, `string | ""` in the Zod input, `string | null | undefined` on `ItineraryTransport` and the resolver's `AnchorTransportLike`. `HEAD_SLOT`/`HEAD_SENTINEL` are the head markers (`resolveTransportSlot` returns `HEAD_SLOT`; the edit picker uses a local head sentinel that maps to `""` on submit). `LocationValue` variants are consistent across Tasks 10–11. `resolveTransportSlot`/`groupTransportsBySlot` signatures match their consumers in Task 8.

**Placeholder scan:** no TBD/"handle edge cases"/"similar to Task N" — each task carries its own code or exact edit anchors.

**Ordering/dependency:** Phase 0 order is dependency-safe (un-branch consumers → strip CSS → delete modules). `localTransports` (T5) precedes slot rendering (T8) and drag (T14). Schema (T6) precedes resolver/render (T7–T8). Combobox backend/UI (T9–T10) precede form wiring (T11); form wiring precedes anchor capture (T12) and edit picker (T13).
