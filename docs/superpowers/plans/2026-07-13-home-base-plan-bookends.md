# Home base bookends the plan editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the plan editor, show the trip's **Home base** as a card that bookends the itinerary — pinned above the first Stop (carrying the outbound leg) and, on a round trip, below the last Stop (carrying the return leg) — so the plan reads chronologically out from home and back, instead of the home legs sitting in the bottom "Other transport" box.

**Architecture:** Pure presentation change to the plan editor (`itinerary-manager.tsx`). No schema change; reuses the existing `Transport.depIsHome`/`arrIsHome` flags (ADR 0030) and the `Trip.homeName`/`homeCountryCode`/`roundTrip` columns. Leg identification lives in pure, unit-tested helpers in `lib/home-base.ts`. The home card is a new presentational component. Flags, nudges, budget, the date engine, the Summary, Calendar and Timeline are untouched.

**Tech Stack:** Next.js (App Router, RSC + client components), TypeScript, Prisma, Radix-based UI primitives (`@/components/ui/*`), lucide-react icons, dnd-kit (existing plan-editor drag), vitest + React Testing Library.

## Global Constraints

- **Terminology (CONTEXT.md, already updated):** the origin place is the **Home base** (never bare "Home"). In the plan editor a Home-base leg is an outbound/return **bookend** that frames the plan; a leg with an unset endpoint or one spanning Chapters is **between-legs travel**. The **outbound** leg is Home base → first Stop; the **return** leg is last Stop → Home base.
- **Home is not a Stop** (ADR 0030): the home card is not draggable, not deletable, holds no nights/dates. Home legs never feed the date engine. Do not touch firm-up/ripple/Make-it-fit.
- **Scope:** plan editor only. Do NOT change the Summary route map, Calendar, Timeline, or the stealth/spreadsheet view.
- **Bookend identity:** outbound = the transport with `depIsHome` arriving at the **first** stop (by list order); return = the transport with `arrIsHome` departing the **last** stop. Any other home-flagged leg stays in "Other transport".
- **Round-trip rule:** the bottom home card + return leg/prompt render only when `roundTrip` is true. One-way trips get the top frame only.
- **No home base:** when `homeName` is null, render nothing new — the plan looks exactly as it does today.
- **Tests:** vitest, run with `npm test` (`vitest run`). Components use RTL. `itinerary-manager.test.tsx` mocks every server action via `vi.mock()` at the top of the file (already present). `next/link` must be mocked in component tests that render it (see Task 2).
- **Commit** after each task's tests pass. Never touch `main`. Work stays on branch `feat/home-base-plan-bookends`.

---

### Task 1: Pure leg-finder helpers in `lib/home-base.ts`

**Files:**
- Modify: `lib/home-base.ts` (add two finders; refactor the two existing boolean helpers to delegate to them)
- Test: `lib/home-base.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Task 4):
  ```typescript
  export function findOutboundLeg<T extends { depIsHome?: boolean | null; toStopId?: string | null }>(transports: readonly T[], firstStopId: string | null): T | null
  export function findReturnLeg<T extends { arrIsHome?: boolean | null; fromStopId?: string | null }>(transports: readonly T[], lastStopId: string | null): T | null
  ```
  `hasOutboundLeg`/`hasReturnLeg` keep their existing signatures and behaviour (now implemented via the finders).

- [ ] **Step 1: Write the failing test.** Append to `lib/home-base.test.ts`:

```typescript
import { findOutboundLeg, findReturnLeg } from "@/lib/home-base";

describe("findOutboundLeg / findReturnLeg", () => {
  it("returns the outbound leg departing home to the first stop", () => {
    const legs = [
      { id: "t1", depIsHome: true, toStopId: "s1" },
      { id: "t2", depIsHome: false, toStopId: "s1" },
    ];
    expect(findOutboundLeg(legs, "s1")?.id).toBe("t1");
    expect(findOutboundLeg(legs, "s2")).toBeNull();
    expect(findOutboundLeg(legs, null)).toBeNull();
  });
  it("returns the return leg arriving home from the last stop", () => {
    const legs = [{ id: "t9", arrIsHome: true, fromStopId: "s9" }];
    expect(findReturnLeg(legs, "s9")?.id).toBe("t9");
    expect(findReturnLeg(legs, "s1")).toBeNull();
    expect(findReturnLeg(legs, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- home-base.test.ts`
Expected: FAIL (`findOutboundLeg`/`findReturnLeg` are not exported).

- [ ] **Step 3: Implement the finders and refactor the booleans.** In `lib/home-base.ts`, replace the existing `hasOutboundLeg` and `hasReturnLeg` functions (currently at the bottom of the file) with:

```typescript
export function findOutboundLeg<T extends { depIsHome?: boolean | null; toStopId?: string | null }>(
  transports: readonly T[],
  firstStopId: string | null,
): T | null {
  if (!firstStopId) return null;
  return transports.find((t) => Boolean(t.depIsHome) && t.toStopId === firstStopId) ?? null;
}

export function findReturnLeg<T extends { arrIsHome?: boolean | null; fromStopId?: string | null }>(
  transports: readonly T[],
  lastStopId: string | null,
): T | null {
  if (!lastStopId) return null;
  return transports.find((t) => Boolean(t.arrIsHome) && t.fromStopId === lastStopId) ?? null;
}

export function hasOutboundLeg(
  transports: readonly { depIsHome?: boolean | null; toStopId?: string | null }[],
  firstStopId: string | null,
): boolean {
  return findOutboundLeg(transports, firstStopId) !== null;
}

export function hasReturnLeg(
  transports: readonly { arrIsHome?: boolean | null; fromStopId?: string | null }[],
  lastStopId: string | null,
): boolean {
  return findReturnLeg(transports, lastStopId) !== null;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- home-base.test.ts`
Expected: PASS (new finder tests + the existing `hasOutboundLeg`/`hasReturnLeg` "leg presence" tests still green).

- [ ] **Step 5: Commit**

```bash
git add lib/home-base.ts lib/home-base.test.ts
git commit -m "feat(home-base): findOutboundLeg/findReturnLeg helpers"
```

---

### Task 2: `HomeBaseCard` presentational component

**Files:**
- Create: `components/trip/home-base-card.tsx`
- Test: `components/trip/home-base-card.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces (consumed by Task 4):
  ```typescript
  export interface HomeBaseCardProps { tripId: string; name: string; countryCode?: string | null; variant: "origin" | "return" }
  export function HomeBaseCard(props: HomeBaseCardProps): JSX.Element
  ```
  Renders `🏠 {name}` with a "Home base · Trip starts here" (origin) or "Home base · Trip ends here" (return) subtitle and an optional country-code chip; the whole card links to `/trips/{tripId}/settings`.

- [ ] **Step 1: Write the failing test.** Create `components/trip/home-base-card.test.tsx`:

```tsx
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { HomeBaseCard } from "@/components/trip/home-base-card";

describe("HomeBaseCard", () => {
  it("shows the home base name and links to trip settings", () => {
    render(<HomeBaseCard tripId="t1" name="Sydney" countryCode="au" variant="origin" />);
    expect(screen.getByText("Sydney")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/trips/t1/settings");
  });

  it("labels the origin and return variants distinctly", () => {
    const { rerender } = render(<HomeBaseCard tripId="t1" name="Sydney" variant="origin" />);
    expect(screen.getByText(/Trip starts here/i)).toBeInTheDocument();
    rerender(<HomeBaseCard tripId="t1" name="Sydney" variant="return" />);
    expect(screen.getByText(/Trip ends here/i)).toBeInTheDocument();
  });

  it("shows the country code chip when provided", () => {
    render(<HomeBaseCard tripId="t1" name="Sydney" countryCode="au" variant="origin" />);
    expect(screen.getByText("au")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- home-base-card.test.tsx`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement the component.** Create `components/trip/home-base-card.tsx`:

```tsx
import Link from "next/link";
import { Home } from "lucide-react";

export interface HomeBaseCardProps {
  tripId: string;
  name: string;
  countryCode?: string | null;
  /** "origin" = trip start (rendered at the top); "return" = trip end (bottom). */
  variant: "origin" | "return";
}

/**
 * The trip's Home base shown as a card that bookends the plan editor (see
 * ADR 0030 + ADR 0032). Not a Stop: not draggable, not deletable — clicking it
 * opens trip settings, where the Home base is edited.
 */
export function HomeBaseCard({ tripId, name, countryCode, variant }: HomeBaseCardProps) {
  const label = variant === "origin" ? "Trip starts here" : "Trip ends here";
  return (
    <Link
      href={`/trips/${tripId}/settings`}
      className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 shadow-soft transition-colors hover:bg-muted/50"
      aria-label={`Home base: ${name} — edit in trip settings`}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Home className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {name}
          {countryCode ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono lowercase text-muted-foreground">
              {countryCode}
            </span>
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground">Home base · {label}</span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- home-base-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/trip/home-base-card.tsx components/trip/home-base-card.test.tsx
git commit -m "feat(home-base): HomeBaseCard bookend component"
```

---

### Task 3: Export the Home-base endpoint sentinel from the transport dialog

**Files:**
- Modify: `components/trip/transport-form-dialog.tsx` (export the existing `HOME` sentinel)

**Interfaces:**
- Consumes: nothing.
- Produces (consumed by Task 4): `export const HOME_ENDPOINT = "__home__";` — the value the dialog already interprets (via `defaultFromStopId`/`defaultToStopId`) as "this endpoint is the Home base". Passing it as a default pre-selects the 🏠 option and makes the form submit `depIsHome`/`arrIsHome = true`.

**Why this works without changing dialog logic:** for a *new* transport the form seeds `fromStopId` from `transport?.fromStopId ?? defaultFromStopId ?? NONE`. Passing `defaultFromStopId = "__home__"` selects the HOME item (present whenever `homeBaseName` is set), and the existing submit mapping already sets `depIsHome: fromStopId === HOME`. Same for `toStopId`/`arrIsHome`.

- [ ] **Step 1: Export the sentinel.** In `components/trip/transport-form-dialog.tsx`, find the sentinel declarations (around line 222):

```typescript
/** Sentinel for "none selected" in stop selects */
const NONE = "__none__";
/** Sentinel for "trip's Home base" in stop selects */
const HOME = "__home__";
```

Change the `HOME` line to export a named constant and keep the local `HOME` alias pointing at it:

```typescript
/** Sentinel for "none selected" in stop selects */
const NONE = "__none__";
/** Sentinel for "trip's Home base" in stop selects. Exported so callers (e.g. the
 * plan editor's "add outbound flight" prompt) can pre-select the Home base as an
 * endpoint via defaultFromStopId / defaultToStopId. */
export const HOME_ENDPOINT = "__home__";
const HOME = HOME_ENDPOINT;
```

- [ ] **Step 2: Verify existing dialog tests still pass + typecheck**

Run: `npm test -- transport-form-dialog.test.tsx && npx tsc --noEmit`
Expected: PASS + clean (pure additive export; no behaviour change).

- [ ] **Step 3: Commit**

```bash
git add components/trip/transport-form-dialog.tsx
git commit -m "feat(home-base): export HOME_ENDPOINT sentinel from transport dialog"
```

---

### Task 4: Render the Home-base bookends in `ItineraryManager`

**Files:**
- Modify: `components/trip/itinerary-manager.tsx`
- Test: `components/trip/itinerary-manager.test.tsx` (extend)

**Interfaces:**
- Consumes: `findOutboundLeg`, `findReturnLeg` (Task 1); `HomeBaseCard` (Task 2); `HOME_ENDPOINT` (Task 3).
- Produces (consumed by Task 5): `ItineraryManagerProps` gains `homeCountryCode?: string | null` and `roundTrip?: boolean`.

- [ ] **Step 1: Write the failing tests.** Append to `components/trip/itinerary-manager.test.tsx` a new describe block. Add this `makeTransport` fixture just below the existing `makeStop` fixture, then the block:

```tsx
function makeTransport(overrides: Partial<import("./itinerary-manager").ItineraryTransport> = {}): import("./itinerary-manager").ItineraryTransport {
  return {
    id: "tr-1",
    mode: "FLIGHT",
    fromStopId: null,
    toStopId: null,
    depIsHome: false,
    arrIsHome: false,
    depPlace: null,
    arrPlace: null,
    depAt: null,
    arrAt: null,
    reference: null,
    notes: null,
    sortOrder: 0,
    costs: [],
    ...overrides,
  };
}

describe("home base bookends", () => {
  it("renders a Home base card at the top when a home base is set", () => {
    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop({ id: "s1", name: "Paris" })]}
        homeBaseName="Sydney"
        roundTrip={false}
      />,
    );
    expect(screen.getByText(/Trip starts here/i)).toBeInTheDocument();
    expect(screen.getByText("Sydney")).toBeInTheDocument();
  });

  it("does NOT render a Home base card when no home base is set", () => {
    render(
      <ItineraryManager {...baseProps} initialStops={[makeStop({ id: "s1", name: "Paris" })]} />,
    );
    expect(screen.queryByText(/Trip starts here/i)).not.toBeInTheDocument();
  });

  it("prompts to add the outbound flight when the home base has no outbound leg yet", () => {
    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop({ id: "s1", name: "Paris" })]}
        homeBaseName="Sydney"
        roundTrip={false}
      />,
    );
    expect(screen.getByRole("button", { name: /add transport to Paris/i })).toBeInTheDocument();
  });

  it("renders the outbound leg as a bookend (not in the 'Other transport' box)", () => {
    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop({ id: "s1", name: "Paris" })]}
        initialTransports={[makeTransport({ id: "out", depIsHome: true, toStopId: "s1" })]}
        homeBaseName="Sydney"
        roundTrip={false}
      />,
    );
    // The outbound leg exists → no "add outbound" prompt, and no "Other transport" section.
    expect(screen.queryByRole("button", { name: /add transport to Paris/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Other transport/i)).not.toBeInTheDocument();
  });

  it("renders a bottom Home base card + return prompt on a round trip", () => {
    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop({ id: "s1", name: "Paris" })]}
        homeBaseName="Sydney"
        roundTrip={true}
      />,
    );
    expect(screen.getByText(/Trip ends here/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add transport home to Sydney/i })).toBeInTheDocument();
  });

  it("omits the bottom Home base card on a one-way trip", () => {
    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop({ id: "s1", name: "Paris" })]}
        homeBaseName="Sydney"
        roundTrip={false}
      />,
    );
    expect(screen.queryByText(/Trip ends here/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- itinerary-manager.test.tsx`
Expected: FAIL (no home card / prompts rendered yet).

- [ ] **Step 3: Add imports.** In `components/trip/itinerary-manager.tsx`, add to the import block near the other `@/components/trip/*` and `@/lib/*` imports:

```typescript
import { HomeBaseCard } from "./home-base-card";
import { HOME_ENDPOINT } from "./transport-form-dialog";
import { findOutboundLeg, findReturnLeg } from "@/lib/home-base";
```

- [ ] **Step 4: Add the two new props.** In `interface ItineraryManagerProps` (ends around line 175, after `homeBaseName?: string | null;`), add:

```typescript
  /** The trip's home-base country code — shown as a chip on the bookend card. */
  homeCountryCode?: string | null;
  /** Whether the trip returns to its Home base — drives the bottom bookend. */
  roundTrip?: boolean;
```

Then add them to the destructured params of `ItineraryManager({ ... })` (the list ending `homeBaseName,` around line 345):

```typescript
  homeBaseName,
  homeCountryCode,
  roundTrip,
}: ItineraryManagerProps) {
```

- [ ] **Step 5: Derive the bookends.** In the component body, immediately after the `stopsById` memo (around line 710), add:

```typescript
  // ── Home base bookends (see ADR 0032) ──
  // The Home base frames the plan: its card is pinned above the first stop
  // (with the outbound leg) and, on a round trip, below the last (with the
  // return leg). Home legs render here, NOT in the "Other transport" box.
  const hasHomeBase = Boolean(homeBaseName);
  const firstStop = stops.length > 0 ? stops[0] : null;
  const lastStop = stops.length > 0 ? stops[stops.length - 1] : null;
  const outboundLeg = findOutboundLeg(initialTransports, firstStop?.id ?? null);
  const returnLeg = findReturnLeg(initialTransports, lastStop?.id ?? null);
  const bookendLegIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (outboundLeg) ids.add(outboundLeg.id);
    if (returnLeg) ids.add(returnLeg.id);
    return ids;
  }, [outboundLeg, returnLeg]);
```

- [ ] **Step 6: Exclude bookend legs from "Other transport".** Replace the `otherTransports` memo (currently around lines 746-757) with:

```typescript
  /** Transports that DON'T link a consecutive pair (orphaned or partial),
   *  excluding the home bookend legs which render in the frame instead. */
  const otherTransports = React.useMemo(() => {
    const consecutivePairKeys = new Set<string>();
    for (let i = 0; i < stops.length - 1; i++) {
      consecutivePairKeys.add(`${stops[i].id}-${stops[i + 1].id}`);
    }

    return initialTransports.filter((t) => {
      if (bookendLegIds.has(t.id)) return false; // rendered as a home bookend
      if (!t.fromStopId || !t.toStopId) return true; // null endpoint → other
      const key = `${t.fromStopId}-${t.toStopId}`;
      return !consecutivePairKeys.has(key); // non-consecutive → other
    });
  }, [initialTransports, stops, bookendLegIds]);
```

- [ ] **Step 7: Add a bookend-leg render helper.** Just above the `renderSeam` helper (around line 1216), add:

```tsx
  // Render a home bookend leg (outbound/return) as a normal, fully-editable card.
  function renderBookendLeg(t: ItineraryTransport) {
    return (
      <TransportCard
        transport={enrichTransport(t, stops)}
        isPending={pendingId === t.id}
        onEdit={(tr) => { setEditingTransport(tr); setEditingTransportCosts(t.costs); }}
        onDelete={handleDeleteTransport}
        costs={t.costs}
        tripId={tripId}
        homeCurrency={homeCurrency}
        homeBaseName={homeBaseName}
        notes={notesByTransportId?.get(t.id) ?? []}
        attachments={attachmentsByTransportId?.get(t.id) ?? []}
        currentUserId={currentUserId}
      />
    );
  }
```

- [ ] **Step 8: Render the top frame.** In the returned JSX, insert the top bookend block **between** the firm-up amber toolbar block and the `{hasContent ? (` line (i.e. right after the closing `)}` of the toolbar block, around line 1281). It renders whenever a home base is set — including above the empty state — so the plan is framed from its origin even before stops exist:

```tsx
      {hasHomeBase && (
        <div className="flex flex-col gap-3">
          <HomeBaseCard
            tripId={tripId}
            name={homeBaseName!}
            countryCode={homeCountryCode}
            variant="origin"
          />
          {outboundLeg
            ? renderBookendLeg(outboundLeg)
            : firstStop
              ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-fit text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setAddTransportDefaults({ fromStopId: HOME_ENDPOINT, toStopId: firstStop.id })}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Add transport to {firstStop.name}
                </Button>
              )
              : null}
        </div>
      )}
```

- [ ] **Step 9: Render the bottom frame.** Inside the `DndContext`, insert the bottom bookend block **after** the "Other transports" block (after its closing `)}` around line 1637) and **before** the "Add a standalone transport" toolbar (around line 1639). It renders only on a round trip with at least one stop:

```tsx
          {/* Home base return bookend (round trips only) */}
          {hasHomeBase && roundTrip && lastStop && (
            <div className="flex flex-col gap-3">
              {returnLeg
                ? renderBookendLeg(returnLeg)
                : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-fit text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setAddTransportDefaults({ fromStopId: lastStop.id, toStopId: HOME_ENDPOINT })}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    Add transport home to {homeBaseName}
                  </Button>
                )}
              <HomeBaseCard
                tripId={tripId}
                name={homeBaseName!}
                countryCode={homeCountryCode}
                variant="return"
              />
            </div>
          )}
```

- [ ] **Step 10: Run tests + typecheck**

Run: `npm test -- itinerary-manager.test.tsx && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 11: Commit**

```bash
git add components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "feat(home-base): frame the plan editor with Home base bookends"
```

---

### Task 5: Thread `homeCountryCode` + `roundTrip` from the plan page

**Files:**
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx`

**Interfaces:**
- Consumes: `ItineraryManager`'s new `homeCountryCode` / `roundTrip` props (Task 4).
- Produces: end-to-end wired feature.

- [ ] **Step 1: Extend the trip select.** In `app/(app)/trips/[tripId]/plan/page.tsx`, the `db.trip.findUnique` select (around lines 53-61) currently lists `homeName: true`. Add the two fields:

```typescript
      select: {
        homeCurrency: true,
        homeName: true,
        homeCountryCode: true,
        roundTrip: true,
        startDate: true,
        endDate: true,
        hardEndDate: true,
        drivingWindingFactor: true,
        drivingAvgSpeedKph: true,
      },
```

- [ ] **Step 2: Pass the props.** At the `<ItineraryManager ... />` call (around line 378), where it currently passes `homeBaseName={trip?.homeName}`, add the two new props alongside it:

```tsx
        homeBaseName={trip?.homeName}
        homeCountryCode={trip?.homeCountryCode}
        roundTrip={trip?.roundTrip}
```

- [ ] **Step 3: Typecheck + full suite + build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: clean typecheck, all tests pass, successful production build.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/trips/[tripId]/plan/page.tsx"
git commit -m "feat(home-base): feed home country + round-trip into the plan editor"
```

---

### Task 6: ADR 0032 — Home base bookends the plan editor

**Files:**
- Create: `docs/adr/0032-home-base-bookends-the-plan-editor.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Write the ADR.** Create `docs/adr/0032-home-base-bookends-the-plan-editor.md`:

```markdown
# Home base bookends the plan editor

## Context

ADR 0030 made the Home base a lightweight per-Trip origin that is **not** a Stop
and never feeds the date engine, and modelled the outbound/return legs as
ordinary Transports with a Home-base endpoint. The plan editor then rendered any
leg with a non-Stop (null) endpoint in a catch-all "Other transport" box at the
bottom of the page — so the outbound flight (Home → first Stop) and the return
flight (last Stop → Home) sat at the very bottom, lumped in with genuine
cross-chapter legs, rather than at the start and end of the journey where a
traveller reads them. The plan did not read chronologically, and the Home base
had no visible presence in the editor at all.

## Decision

In the **plan editor only**, the Home base is shown as a card that **bookends**
the itinerary: pinned above the first Stop (carrying the outbound leg or a prompt
to add it) and, on a round trip, below the last Stop (carrying the return leg or
its prompt). The card is not a Stop — it is not draggable or deletable, and
clicking it opens trip settings. The outbound/return legs are identified by the
same rule the Flags already use (a `depIsHome` leg arriving at the first Stop; an
`arrIsHome` leg departing the last Stop) and are removed from the "Other
transport" box; any other home-flagged leg stays there. One-way trips
(`roundTrip = false`) get the top frame only; a Trip with no Home base renders
exactly as before.

This is a **presentation-only** change: no schema change, and Flags, Next-steps
nudges, Budget, the date engine, the Summary route map, Calendar and Timeline are
untouched.

## Consequences

- **This reintroduces a home-specific carve-out** — the very thing ADR 0030 set
  out to avoid — but confined to the plan editor's *layout*, not the data model
  or the date engine. The trade-off: a small, isolated special-case in one
  component buys a plan that reads chronologically from home and back, which the
  uniform "home is just another between-legs leg" treatment could not.
- The Summary was deliberately left alone: its route map already draws the
  home→first and last→home bookend polylines, and the Calendar/Timeline place
  legs by real times where "top/bottom" is meaningless.
- Reversible cheaply — deleting the bookend rendering restores the old
  "Other transport" behaviour; nothing else depends on it.
```

- [ ] **Step 2: Verify it renders**

Run: `test -f docs/adr/0032-home-base-bookends-the-plan-editor.md && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0032-home-base-bookends-the-plan-editor.md
git commit -m "docs(home-base): ADR 0032 — Home base bookends the plan editor"
```

---

## Self-Review

**1. Spec coverage:**
- Home card as permanent top frame when home base set → Task 4 Step 8. ✅
- Bottom frame on round trips only → Task 4 Step 9 (`roundTrip && lastStop`). ✅
- One-way = top frame only → Task 4 Step 9 guard + test. ✅
- No home base = unchanged view → `hasHomeBase` guards + test. ✅
- Outbound = depIsHome→first; return = arrIsHome→last → Task 1 finders. ✅
- Home legs leave "Other transport" → Task 4 Step 6 + test. ✅
- Card links to settings, not draggable/deletable → Task 2 (plain `Link`, no drag/delete affordances). ✅
- "Add outbound/return" prompts pre-fill home endpoint → Task 3 sentinel + Task 4 Steps 8-9. ✅
- Country chip on card → Task 2 + Task 5 threads `homeCountryCode`. ✅
- No schema/flags/budget/Summary changes → scope respected; only listed files touched. ✅

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**3. Type consistency:** `findOutboundLeg`/`findReturnLeg` signatures match between Task 1 (produce) and Task 4 (consume). `HOME_ENDPOINT` exported in Task 3, imported in Task 4. `homeCountryCode`/`roundTrip` props defined in Task 4, supplied in Task 5. `ItineraryTransport`/`makeTransport` fields match the interface. ✅

**Note (accepted, minor):** when a home base is set but there are no stops and no chapters, the top home card renders above the existing "Add your first Stop" empty state (no outbound prompt, since there is no stop to name). This satisfies "home base + no stops → card at top" and is intentional.
```
