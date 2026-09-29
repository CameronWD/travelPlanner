# Feedback Batch 2026-09-29 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the nine open main-site Feedback notes agreed on 2026-09-29: six Day view fixes, two plan editor fixes, and readable trip URLs built from the Trip's name.

**Architecture:** The Day view and plan editor notes are self-contained UI and pure-rule changes (Tasks 1–7), each with its own test cycle and commit. Trip links come last (Tasks 8–12). They add a nullable `Trip.slug` and a `TripSlug` history table, backfilled by the migration. `proxy.ts` resolves a slug to the Trip's id once, at the route boundary, and rewrites the request to the existing `[tripId]` routes. Pages, loaders, guards, server actions and `revalidatePath` keep working in ids. An old slug or a bare cuid gets a 308 to the current slug, but only for a signed-in member; anyone else gets today's not-found. Every internal link is built by `tripPath(ref, sub)`, and a guard test fails on hand-built `/trips/${…}` links.

**Tech Stack:** Next.js 16.3.4 (App Router, `proxy.ts`, React `<ViewTransition>`), React 19, Prisma 7 + Postgres, Tailwind, Vitest + Testing Library (`npm test` = `TZ=UTC vitest run`; `npm run test:integration` against local Postgres when `INTEGRATION=1`).

**Spec:** `docs/specs/2026-09-29-feedback-batch.md` (binding). Also read: `CONTEXT.md` (glossary), `docs/adr/0032-home-base-bookends-the-plan-editor.md` (incl. 2026-09-29 amendment), `docs/adr/0064-trip-urls-use-a-name-slug.md`, `docs/adr/0063-sibling-navigation-holds-the-current-page.md`, `docs/DEPLOY.md` §4b (migration write-path hazard).

## Global Constraints

- Work only on branch `feat/feedback-batch-2026-09-29`. Never commit to, merge into or push `main`. Never deploy.
- "Every commit that does a note's work carries a `Resolves-Feedback: <id>` trailer." Every commit also ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- "Never run `feedback:resolve`; never hand-edit `docs/feedback/inbox.md`." Do not run `npm run feedback:pull` either (it reads production).
- Use CONTEXT.md terms: **Stop**, **Transport**, **Accommodation**, **Home base** (label it with its **name**, "never the word 'Home'"), **Gap day**, **Journal**, **Day view**, **Day plan**, **Traveller**. The UI never says "hotel", "stay" or "leg".
- Desktop means `lg+` (≥1024px). "Phone (< lg): unchanged" for D2 and P2.
- `prefers-reduced-motion: reduce` → "instant swap, no fade, no glide."
- Slug rule, verbatim: "lowercase, accents stripped, non-alphanumeric runs → single `-`, trimmed, ≤ 60 chars, `trip` if empty." "Unique app-wide; clash → `-2`, `-3`…; `new` reserved."
- "Every slug a Trip has had is kept and can never be taken by another Trip. Renaming back to an own old slug reuses it."
- "An old slug or a bare cuid in the URL redirects (permanent) to the current slug, preserving the rest of the path and query." "Non-members get the same not-found as today."
- "Slug → id resolved once at the route boundary; loaders, guards and actions keep ids."
- "Share links (`/share/[token]`) and Calendar feeds unaffected." `/api/trips/[tripId]/…` routes keep ids.
- Out of scope: "Phone floating Add-stop button; any other copy." New copy only where the spec asks for it ("Nothing planned", "Edit in plan", the Journal prompt).
- ADR 0063: no new `loading.tsx` or `template.tsx` anywhere under `app/(app)/`.
- Next.js 16: the proxy file is `proxy.ts` (`middleware.ts` is deprecated). `revalidatePath` takes the **destination** path of a rewrite (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`, "Using revalidatePath with rewrites"), so the existing `revalidatePath(\`/trips/${tripId}…\`)` calls stay as they are.
- Migrations: write the SQL by hand in `prisma/migrations/<timestamp>_<name>/migration.sql`, in the repo's commented style. The new column must be nullable (DEPLOY.md §4b: a NOT NULL column with no default breaks the running build's INSERTs). Apply migrations **only** to the local docker Postgres, and only after `npx prisma migrate status` prints `at "host.docker.internal:5432"`. Never run them against any other host.
- Test command for a single file: `TZ=UTC npx vitest run <path>`. Typecheck: `npx tsc --noEmit -p .` (clean on the base commit).

## Review Focus

1. **A non-member, or a signed-out visitor, opening an old slug or a bare cuid** must get exactly today's not-found or sign-in redirect, never a 308 that reveals the Trip's current name. Pinned in Task 10 (`decideTripRoute` non-member and signed-out cases).
2. **A server action posted from a page whose URL still holds an old slug** (the settings form right after a rename) must not be redirected: a 308 on a POST re-sends or drops the action. Pinned in Task 10 (POST → rewrite, never redirect).
3. **Names that slugify awkwardly:** only punctuation or emoji, the word "New", accents, 60+ characters where the `-2` suffix would push past 60, or a clash with a slug that another Trip held before being renamed or deleted. Pinned in Task 8 (unit tests plus integration test).
4. **Tapping a visible day chip on a long desktop strip** must not jump the strip back to the start or re-centre it, even though the Day page remounts on each day change. Pinned in Task 2 (the in-view case keeps `scrollLeft`; the remembered position is the input).
5. **An outbound candidate that departs another Stop** (a leg from the second Stop back into the first on a looping route) must not be taken as the outbound leg, and a home-flagged candidate beats a free-text one. Pinned in Task 5.

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `components/trip/day/tonight-card.tsx` | Tonight card: collapsed summary button + in-place details | 1 |
| `lib/day-view-loader.ts` | Adds Accommodation details to `tonight` (1); adds the stop line to `strip` (6) | 1, 6 |
| `components/trip/day/strip-scroll.ts` (new) | Pure scroll-position rules for the Day strip | 2 |
| `components/trip/day/day-header.tsx` | lg+ centring (2); heading-text crossfade wrapper (3); `tripSlug` prop (11) | 2, 3, 11 |
| `components/trip/day/day-strip.tsx` | Scroll rule (2); gliding highlight (3); stop line (6); `useTripHref` (12) | 2, 3, 6, 12 |
| `components/trip/day/day-transition.ts`, `app/globals.css` | `DAY_TEXT_TRANSITION` + `.day-text` crossfade CSS | 3 |
| `components/trip/day/day-plan-card.tsx`, `journal-card.tsx`, `journal-compose.tsx` (new) | Content-sized cards, empty states | 4 |
| `app/(app)/trips/[tripId]/day/[date]/page.tsx` | Top-aligned columns (4); `line` prop (6); slug links (11) | 4, 6, 11 |
| `lib/home-base.ts` | The one outbound/return leg rule (by shape) | 5 |
| `components/trip/itinerary-manager.tsx` | Single bookend prompt (5); aside portal for Add stop/Chapters (7) | 5, 7 |
| `lib/day-view-model.ts` | `stopLine()` replaces `citySegments()` | 6 |
| `lib/plan-aside.ts` (new), `app/(app)/trips/[tripId]/plan/page.tsx` | Aside slot id + slot element | 7 |
| `lib/trip-slug.ts` (new) | Pure slug derivation + candidate order | 8 |
| `lib/trip-path.ts` (new) | `tripPath(ref, sub)`, the only trip-URL builder | 8 |
| `lib/trip-slug-store.ts` (new) | `assignTripSlug(tx, tripId, name)` (DB) | 8 |
| `prisma/schema.prisma`, `prisma/migrations/20260929000000_trip_slug/` | `Trip.slug`, `TripSlug`, backfill | 8 |
| `server/actions/trips.ts`, settings form, duplicate dialog, seed persisters | Slugs on create, rename, duplicate | 9 |
| `lib/trip-route.ts` (new), `lib/trip-ref.ts` (new), `proxy.ts` | Route-boundary resolve / rewrite / redirect | 10 |
| `lib/trip-slug-read.ts` (new) + server pages, layouts, loaders | Server-side link sweep | 11 |
| `components/trip/use-trip-href.ts` (new) + client components | Client-side link sweep | 12 |
| `lib/trip-links.guard.test.ts` (new) | Fails on hand-built `/trips/${…}` links | 12 |

---

### Task 1: Tonight card expands in place (D1)

**Files:**
- Modify: `lib/day-view-loader.ts` (`DayViewData.tonight` type ~line 95; `tonight` assembly ~lines 422–426)
- Modify: `components/trip/day/tonight-card.tsx` (full rewrite)
- Test: `components/trip/day/tonight-card.test.tsx` (full rewrite), `lib/day-view-loader.test.ts` (~line 222), `app/(app)/trips/[tripId]/day/[date]/page.test.tsx` (fixture `tonight`, ~line 108)

**Interfaces:**
- Produces: `DayViewData["tonight"]` = `{ id: string; name: string; nightOf: { night: number; of: number }; checkOut: string; address: string | null; confirmation: string | null; checkInTime: string | null; checkOutTime: string | null; notes: string | null; lat: number | null; lng: number | null } | null`.
- `TonightCard` props are unchanged (`tripId, tonight, isLastDay, stopId, size`). It becomes a client component.
- Consumes: `mapsUrl({ lat, lng, address, label })` from `lib/maps.ts`.

- [ ] **Step 1: Write the failing tests.** Replace `components/trip/day/tonight-card.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TonightCard } from "@/components/trip/day/tonight-card";
vi.mock("next/link", () => ({ useLinkStatus: () => ({ pending: false }), default: ({ href, children, ...r }: { href: string; children: React.ReactNode } & Record<string, unknown>) => <a href={href} {...r}>{children}</a> }));

const tonight = {
  id: "acc1",
  name: "Hôtel Cour du Corbeau",
  nightOf: { night: 3, of: 4 },
  checkOut: "2026-12-14",
  address: "6 Rue des Couples, Strasbourg",
  confirmation: "HX-4471",
  checkInTime: "15:00",
  checkOutTime: "11:00",
  notes: "Door code 1942",
  lat: 48.5795,
  lng: 7.7498,
};
const bare = { ...tonight, address: null, confirmation: null, checkInTime: null, checkOutTime: null, notes: null, lat: null, lng: null };

function toggle() {
  return screen.getByRole("button", { name: /Hôtel Cour du Corbeau/ });
}

describe("TonightCard (spec 2026-09-29 D1)", () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it("collapsed: a toggle button naming the bed, the night and the check-out day — tapping it never navigates", () => {
    render(<TonightCard tripId="t1" tonight={tonight} isLastDay={false} stopId="s1" size="desktop" />);
    expect(screen.getByText("Tonight")).toBeInTheDocument();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Night 3 of 4 · check-out Mon 14 Dec")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect((toggle().closest('[data-slot="tonight-card"]') as HTMLElement).className).toContain("bg-lilac");
  });

  it("expands in place with every detail present and an 'Edit in plan' link to the Stop; tapping again collapses", () => {
    render(<TonightCard tripId="t1" tonight={tonight} isLastDay={false} stopId="s1" size="desktop" />);
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(toggle().getAttribute("aria-controls")!) as HTMLElement;
    expect(within(panel).getByRole("link", { name: "6 Rue des Couples, Strasbourg" })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=48.5795%2C7.7498",
    );
    expect(within(panel).getByText("HX-4471")).toBeInTheDocument();
    expect(within(panel).getByText("Check-in 15:00")).toBeInTheDocument();
    expect(within(panel).getByText("Check-out 11:00")).toBeInTheDocument();
    expect(within(panel).getByText("Door code 1942")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Edit in plan" })).toHaveAttribute("href", "/trips/t1/plan#stop-s1");
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Edit in plan" })).toBeNull();
  });

  it("shows only the details that are present", () => {
    render(<TonightCard tripId="t1" tonight={bare} isLastDay={false} stopId="s1" size="phone" />);
    fireEvent.click(toggle());
    const panel = document.getElementById(toggle().getAttribute("aria-controls")!) as HTMLElement;
    expect(within(panel).queryByText(/Confirmation/)).toBeNull();
    expect(within(panel).queryByText(/Check-in/)).toBeNull();
    expect(within(panel).queryByText(/Check-out/)).toBeNull();
    expect(within(panel).getAllByRole("link")).toHaveLength(1);
    expect(within(panel).getByRole("link", { name: "Edit in plan" })).toBeInTheDocument();
  });

  it("copies the confirmation number to the clipboard", async () => {
    render(<TonightCard tripId="t1" tonight={tonight} isLastDay={false} stopId="s1" size="desktop" />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Copy confirmation number" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("HX-4471");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("a bed with no Stop: 'Edit in plan' goes to the Plan", () => {
    render(<TonightCard tripId="t1" tonight={tonight} isLastDay={false} stopId={null} size="phone" />);
    fireEvent.click(toggle());
    expect(screen.getByRole("link", { name: "Edit in plan" })).toHaveAttribute("href", "/trips/t1/plan");
  });

  it("no bed → 'No bed yet' and an add link to the Plan at that Stop", () => {
    render(<TonightCard tripId="t1" tonight={null} isLastDay={false} stopId="s1" size="desktop" />);
    expect(screen.getByText("No bed yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+ Add a stay" })).toHaveAttribute("href", "/trips/t1/plan#stop-s1");
  });

  it("hidden on the last day", () => {
    const { container } = render(<TonightCard tripId="t1" tonight={tonight} isLastDay stopId="s1" size="desktop" />);
    expect(container.firstChild).toBeNull();
  });
});
```

In `lib/day-view-loader.test.ts`, replace the `expect(d.tonight).toEqual(…)` line (~222) with:

```ts
    expect(d.tonight).toEqual({
      id: HOTEL.id,
      name: "Hôtel Cour du Corbeau",
      nightOf: { night: 3, of: 4 },
      checkOut: "2026-12-14",
      address: "6 Rue des Couples, Strasbourg",
      confirmation: null,
      checkInTime: null,
      checkOutTime: null,
      notes: null,
      lat: 48.5795,
      lng: 7.7498,
    });
```

In `app/(app)/trips/[tripId]/day/[date]/page.test.tsx`, change the fixture's `tonight` (~line 108) to:

```ts
    tonight: { id: "acc1", name: "Hôtel Cour du Corbeau", nightOf: { night: 3, of: 4 }, checkOut: "2026-12-14", address: null, confirmation: null, checkInTime: null, checkOutTime: null, notes: null, lat: null, lng: null },
```

- [ ] **Step 2: Run them to verify they fail.**

Run: `TZ=UTC npx vitest run components/trip/day/tonight-card.test.tsx lib/day-view-loader.test.ts`
Expected: FAIL. No "button" named after the hotel (today the card is a link), and the loader's `tonight` lacks `address` and the other new fields.

- [ ] **Step 3: Extend the loader.** In `lib/day-view-loader.ts`, change the `tonight` field of `DayViewData` to:

```ts
  tonight: {
    id: string;
    name: string;
    nightOf: { night: number; of: number };
    checkOut: string;
    address: string | null;
    confirmation: string | null;
    checkInTime: string | null;
    checkOutTime: string | null;
    notes: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
```

and the assembly (the `const tonight =` block after `tonightNight`) to:

```ts
  const tonight =
    tonightRaw && tonightNight
      ? {
          id: tonightRaw.id,
          name: tonightRaw.name,
          nightOf: tonightNight,
          checkOut: tonightRaw.checkOut,
          address: tonightRaw.address,
          confirmation: tonightRaw.confirmation,
          checkInTime: tonightRaw.checkInTime,
          checkOutTime: tonightRaw.checkOutTime,
          notes: tonightRaw.notes,
          lat: tonightRaw.lat,
          lng: tonightRaw.lng,
        }
      : null;
```

The Accommodation query already selects all of these fields.

- [ ] **Step 4: Rewrite `components/trip/day/tonight-card.tsx`:**

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDayLabel } from "@/lib/dates";
import { mapsUrl } from "@/lib/maps";
import type { DayViewData } from "@/lib/day-view-loader";

/**
 * Tonight (DAY_VIEW §2 right column 2, §3.7): lilac card naming tonight's bed,
 * its night-of count and check-out day. Hidden on the trip's last day.
 *
 * Tapping the card expands it in place (spec 2026-09-29 D1): address (opens
 * in maps), confirmation number (copyable), check-in/out times and notes,
 * each only when present, plus "Edit in plan" to the day's Stop on the Plan
 * (`#stop-<id>`, the anchor stop-card.tsx sets — the Plan has no
 * per-Accommodation anchor, and an Accommodation is edited from its Stop).
 */
export function TonightCard({
  tripId,
  tonight,
  isLastDay,
  stopId,
  size,
}: {
  tripId: string;
  tonight: DayViewData["tonight"];
  isLastDay: boolean;
  stopId: string | null;
  size: "desktop" | "phone";
}) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const panelId = React.useId();
  if (isLastDay) return null;

  const phone = size === "phone";
  const planHref = `/trips/${tripId}/plan${stopId ? `#stop-${stopId}` : ""}`;
  const shell = cn(
    "island flex flex-col gap-1 rounded-3xl border-2 border-border bg-lilac text-on-accent",
    phone ? "px-4 py-3.5 shadow-hard-2" : "px-[22px] py-[18px] shadow-hard-3",
  );
  const name = cn("font-display font-extrabold", phone ? "text-[18px]" : "text-[20px]", "leading-tight");
  const eyebrow = <span className="block text-[11px] font-extrabold uppercase tracking-[0.08em]">Tonight</span>;

  if (!tonight) {
    return (
      <div data-slot="tonight-card" className={shell}>
        {eyebrow}
        <p className={name}>No bed yet</p>
        <Link href={planHref} className="inline-flex min-h-11 items-center self-start text-[13px] font-bold underline underline-offset-2 md:min-h-0">
          + Add a stay
        </Link>
      </div>
    );
  }

  const mapHref = tonight.address
    ? mapsUrl({ lat: tonight.lat, lng: tonight.lng, address: tonight.address, label: tonight.name })
    : null;
  const confirmation = tonight.confirmation;
  function copyConfirmation() {
    if (!confirmation) return;
    void navigator.clipboard.writeText(confirmation).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div data-slot="tonight-card" className={shell}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="pressable flex w-full items-center justify-between gap-3 rounded-2xl text-left focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="min-w-0">
          {eyebrow}
          <span className={cn("block truncate", name)}>{tonight.name}</span>
          <span className="block text-[13px] font-semibold">{`Night ${tonight.nightOf.night} of ${tonight.nightOf.of} · check-out ${formatDayLabel(tonight.checkOut)}`}</span>
        </span>
        <ChevronDown
          className={cn("size-5 shrink-0 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")}
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div id={panelId} data-slot="tonight-details" className="mt-2 flex flex-col gap-1.5 border-t-2 border-border/30 pt-2.5 text-[13px] font-semibold">
          {tonight.address && mapHref ? (
            <a href={mapHref} target="_blank" rel="noreferrer" className="self-start underline underline-offset-2">
              {tonight.address}
            </a>
          ) : null}
          {confirmation ? (
            <div className="flex items-center gap-2">
              <span>Confirmation</span>
              <span className="font-mono">{confirmation}</span>
              <button
                type="button"
                onClick={copyConfirmation}
                aria-label={copied ? "Copied" : "Copy confirmation number"}
                className="inline-grid size-11 place-items-center rounded-[12px] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring md:size-8"
              >
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              </button>
            </div>
          ) : null}
          {tonight.checkInTime ? <p>{`Check-in ${tonight.checkInTime}`}</p> : null}
          {tonight.checkOutTime ? <p>{`Check-out ${tonight.checkOutTime}`}</p> : null}
          {tonight.notes ? <p className="whitespace-pre-line font-medium">{tonight.notes}</p> : null}
          <Link href={planHref} className="inline-flex min-h-11 items-center self-start font-bold underline underline-offset-2 md:min-h-0">
            Edit in plan
          </Link>
        </div>
      ) : null}
    </div>
  );
}
```

(The hand-built `planHref` is converted to `useTripHref` in Task 12.)

- [ ] **Step 5: Run the tests to verify they pass.**

Run: `TZ=UTC npx vitest run components/trip/day lib/day-view-loader.test.ts "app/(app)/trips/[tripId]/day" && npx tsc --noEmit -p .`
Expected: PASS, and tsc exits 0.

- [ ] **Step 6: Commit.**

```bash
git add lib/day-view-loader.ts lib/day-view-loader.test.ts components/trip/day/tonight-card.tsx components/trip/day/tonight-card.test.tsx "app/(app)/trips/[tripId]/day/[date]/page.test.tsx"
git commit -m "$(cat <<'EOF'
feat(day): Tonight card expands in place with the Accommodation's details

Resolves-Feedback: cmum7zzsl000004l2740vynm2
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Desktop header centred; strip scrolls only when it must (D2)

**Files:**
- Create: `components/trip/day/strip-scroll.ts`, `components/trip/day/strip-scroll.test.ts`
- Modify: `components/trip/day/day-header.tsx` (the `<header>` row, lines ~110–153)
- Modify: `components/trip/day/day-strip.tsx` (scroll effect, lines ~18–37; scroller `onScroll`)
- Test: `components/trip/day/day-header.test.tsx`

**Interfaces:**
- Produces: `STRIP_CHIP_GAP_PX = 8`. `interface StripScrollInput { scrollLeft: number; viewportWidth: number; contentWidth: number; chipLeft: number; chipWidth: number; gap: number }`. `desktopStripScroll(i: StripScrollInput): number`. `phoneStripScroll(i: StripScrollInput): number`.

The Day page remounts on every day change (each date is its own segment, ADR 0063), so the strip remounts too. The desktop rule therefore starts from the position the Traveller last left that strip at, kept in module state keyed `${tripId}:${size}`. That state survives client navigations and resets on a full load, so a first render starts at the first day. The desktop strip variant also shows at md–lg, and the spec keeps "< lg" unchanged, so the new rule runs only when `(min-width: 1024px)` matches.

- [ ] **Step 1: Write the failing tests.** Create `components/trip/day/strip-scroll.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { desktopStripScroll, phoneStripScroll, STRIP_CHIP_GAP_PX } from "./strip-scroll";

// Desktop chips are 56px (w-14) with an 8px gap: a 64px stride.
const desk = { viewportWidth: 640, contentWidth: 36 * 64 - 8, chipWidth: 56, gap: STRIP_CHIP_GAP_PX };

describe("desktopStripScroll (spec 2026-09-29 D2)", () => {
  it("a fresh strip with day 1 selected stays at the first day", () => {
    expect(desktopStripScroll({ ...desk, scrollLeft: 0, chipLeft: 0 })).toBe(0);
  });
  it("leaves the strip where it is when the selected day and a day either side are in view (review focus 4)", () => {
    expect(desktopStripScroll({ ...desk, scrollLeft: 0, chipLeft: 3 * 64 })).toBe(0);
    expect(desktopStripScroll({ ...desk, scrollLeft: 320, chipLeft: 8 * 64 })).toBe(320);
  });
  it("scrolls right only far enough to show the selected day with one day's margin", () => {
    // chip 12 spans 768–824; plus one stride of margin = 888; 888 − 640 = 248.
    expect(desktopStripScroll({ ...desk, scrollLeft: 0, chipLeft: 12 * 64 })).toBe(248);
  });
  it("scrolls left only far enough to show the selected day with one day's margin", () => {
    // chip 8 starts at 512; minus one stride = 448.
    expect(desktopStripScroll({ ...desk, scrollLeft: 600, chipLeft: 8 * 64 })).toBe(448);
  });
  it("never scrolls a trip whose days all fit", () => {
    expect(desktopStripScroll({ ...desk, contentWidth: 500, scrollLeft: 0, chipLeft: 400 })).toBe(0);
  });
  it("clamps at the end of the strip", () => {
    expect(desktopStripScroll({ ...desk, scrollLeft: 0, chipLeft: 35 * 64 })).toBe(desk.contentWidth - desk.viewportWidth);
  });
});

describe("phoneStripScroll (unchanged rule)", () => {
  it("puts the selected day third, its two predecessors in view", () => {
    // Phone chips are 48px (w-12) + 8px gap: 56px stride. Chip 5 at 280 → 280 − 112.
    expect(phoneStripScroll({ scrollLeft: 0, viewportWidth: 360, contentWidth: 2000, chipLeft: 280, chipWidth: 48, gap: 8 })).toBe(168);
    expect(phoneStripScroll({ scrollLeft: 0, viewportWidth: 360, contentWidth: 2000, chipLeft: 56, chipWidth: 48, gap: 8 })).toBe(0);
  });
});
```

In `components/trip/day/day-header.test.tsx`, add inside `describe("DayHeader", …)` (after the existing tests):

```tsx
  describe("desktop centring (spec 2026-09-29 D2)", () => {
    const props = { tripId: "t1", eyebrow: "E", heading: "Sat 12 Dec", subLine: "", subLineCompact: "", dayTitle: null, prevHref: "/trips/t1/day/2026-12-11", nextHref: "/trips/t1/day/2026-12-13", prevLabel: "Previous day: Fri 11 Dec", nextLabel: "Next day: Sun 13 Dec", unreadCount: 0, recent: [], members: [], addButton: <button>+</button> };
    it("from lg the header is a 1fr | auto | 1fr grid: an empty spacer, the date with its arrows centred, the right cluster at the end", () => {
      render(<DayHeader {...props} />);
      const row = document.querySelector('[data-slot="day-header-row"]') as HTMLElement;
      expect(row.className).toContain("lg:grid");
      expect(row.className).toContain("lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]");
      const spacer = row.querySelector('[data-slot="day-header-spacer"]') as HTMLElement;
      expect(spacer).toHaveAttribute("aria-hidden", "true");
      expect(spacer.className).toContain("hidden");
      expect(spacer.className).toContain("lg:block");
      const arrows = (document.querySelector('[data-slot="day-title-block"]') as HTMLElement).parentElement as HTMLElement;
      expect(arrows.className).toContain("lg:justify-center");
      expect(arrows.className).toContain("lg:flex-none");
      expect(screen.getByRole("button", { name: "+" }).parentElement!.className).toContain("lg:justify-self-end");
    });
    it("below lg nothing changes: the row is still flex, the arrows still sit start-aligned from md", () => {
      render(<DayHeader {...props} />);
      const row = document.querySelector('[data-slot="day-header-row"]') as HTMLElement;
      expect(row.className.split(/\s+/)).toContain("flex");
      const arrows = (document.querySelector('[data-slot="day-title-block"]') as HTMLElement).parentElement as HTMLElement;
      expect(arrows.className).toContain("md:justify-start");
    });
  });
```

- [ ] **Step 2: Run them to verify they fail.**

Run: `TZ=UTC npx vitest run components/trip/day/strip-scroll.test.ts components/trip/day/day-header.test.tsx`
Expected: FAIL. `./strip-scroll` cannot be resolved, and there is no `day-header-row`.

- [ ] **Step 3: Create `components/trip/day/strip-scroll.ts`:**

```ts
/**
 * Day strip scroll rules. Pure so they can be tested without layout.
 *
 * Desktop (lg+, spec 2026-09-29 D2): the strip no longer pins the selected
 * day third from the left. It stays where it is unless the selected day —
 * with one day's margin either side — would be out of view, and then moves
 * only as far as needed. A trip whose days all fit never scrolls.
 *
 * Phone (< lg, unchanged): the selected day sits third, its two predecessors
 * fully in view.
 */
export const STRIP_CHIP_GAP_PX = 8;

export interface StripScrollInput {
  /** Where the strip starts from (desktop: where the Traveller left it). */
  scrollLeft: number;
  viewportWidth: number;
  contentWidth: number;
  /** The selected chip's left edge within the scroll content. */
  chipLeft: number;
  chipWidth: number;
  gap: number;
}

export function desktopStripScroll(i: StripScrollInput): number {
  const maxScroll = Math.max(0, i.contentWidth - i.viewportWidth);
  const stride = i.chipWidth + i.gap;
  const needLeft = i.chipLeft - stride;
  const needRight = i.chipLeft + i.chipWidth + stride;
  let next = i.scrollLeft;
  if (needLeft < next) next = needLeft;
  else if (needRight > next + i.viewportWidth) next = needRight - i.viewportWidth;
  return Math.min(maxScroll, Math.max(0, next));
}

export function phoneStripScroll(i: StripScrollInput): number {
  return Math.max(0, i.chipLeft - 2 * (i.chipWidth + i.gap));
}
```

- [ ] **Step 4: Centre the desktop header.** In `components/trip/day/day-header.tsx`:
  - Replace `<header className="flex items-end gap-4">` with:

```tsx
      <header data-slot="day-header-row" className="flex items-end gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {/* lg+: an empty first column balances the right cluster so the date and
            its arrows sit in the true centre (spec 2026-09-29 D2). */}
        <div data-slot="day-header-spacer" aria-hidden="true" className="hidden lg:block" />
```

  - On the arrows row `div`, append `lg:flex-none lg:justify-center` to its className, so it reads `"grid w-full grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-3.5 md:flex md:w-auto md:min-w-0 md:flex-1 md:justify-start lg:flex-none lg:justify-center"`.
  - On the right cluster, change `className="hidden shrink-0 items-center gap-2.5 lg:flex"` to `className="hidden shrink-0 items-center gap-2.5 lg:flex lg:justify-self-end"`.

- [ ] **Step 5: Apply the scroll rule in `components/trip/day/day-strip.tsx`.**
  - Add the import `import { desktopStripScroll, phoneStripScroll, STRIP_CHIP_GAP_PX } from "@/components/trip/day/strip-scroll";`.
  - Above `export function DayStrip`, add:

```ts
/**
 * Where the Traveller left each desktop strip, keyed `${tripId}:${size}`.
 * The strip lives inside the Day page, which remounts on every day change
 * (ADR 0063), so without this it would snap back to the first day each time.
 * Module state: kept across client navigations, reset by a full load — so a
 * first render starts at the first day (spec 2026-09-29 D2).
 */
const lastScrollLeft = new Map<string, number>();
```

  - Replace the whole `React.useLayoutEffect(() => { … }, []);` block and the comment above it with:

```ts
  const memoryKey = `${tripId}:${size}`;
  // Put the selected chip in view with scrollLeft (not scrollIntoView —
  // DAY_VIEW §3.3), before paint so the strip never visibly jumps. `scroller`
  // wraps both the chip nav and the desktop line row (one scroll container,
  // DV-01). Desktop at lg+ uses the minimal-scroll rule; phone — and the
  // md–lg band, which shows this desktop strip but is "< lg" — keep the old
  // selected-day-third rule.
  React.useLayoutEffect(() => {
    const nav = scroller.current;
    if (!nav) return;
    const el = nav.querySelector<HTMLElement>('[aria-current="date"]');
    if (!el) return;
    const wide = !phone && window.matchMedia("(min-width: 1024px)").matches;
    const chip = el.getBoundingClientRect();
    const input = {
      scrollLeft: wide ? (lastScrollLeft.get(memoryKey) ?? 0) : nav.scrollLeft,
      viewportWidth: nav.clientWidth,
      contentWidth: nav.scrollWidth,
      chipLeft: chip.left - nav.getBoundingClientRect().left + nav.scrollLeft,
      chipWidth: chip.width,
      gap: STRIP_CHIP_GAP_PX,
    };
    nav.scrollLeft = wide ? desktopStripScroll(input) : phoneStripScroll(input);
  }, [phone, memoryKey]);
```

  - On the scroller `div` (the one with `ref={scroller}`), add `onScroll={phone ? undefined : (e) => lastScrollLeft.set(memoryKey, e.currentTarget.scrollLeft)}`.

- [ ] **Step 6: Run the tests to verify they pass.**

Run: `TZ=UTC npx vitest run components/trip/day "app/(app)/trips/[tripId]/day" && npx tsc --noEmit -p .`
Expected: PASS (the existing "arrows stay put" and strip tests still pass), and tsc exits 0.

- [ ] **Step 7: Commit.**

```bash
git add components/trip/day/strip-scroll.ts components/trip/day/strip-scroll.test.ts components/trip/day/day-header.tsx components/trip/day/day-header.test.tsx components/trip/day/day-strip.tsx
git commit -m "$(cat <<'EOF'
feat(day): centre the desktop date; strip scrolls only when the day is out of view

Resolves-Feedback: cmum825bd000004l7ju9uxfsy
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Day change motion (D4)

Relies on `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md` ("Step 3: directional motion", "Anchoring the header", "Respecting reduced motion") and ADR 0063's existing body slide.

**Files:**
- Modify: `components/trip/day/day-transition.ts`, `components/trip/day/day-transition.test.ts`
- Modify: `app/globals.css` (after the `.day-back` rules, ~line 680), `app/globals.view-transition.test.ts`
- Modify: `components/trip/day/day-header.tsx` (wrap the text lines), `components/trip/day/day-header.test.tsx`
- Modify: `components/trip/day/day-strip.tsx` (gliding highlight), `components/trip/day/day-strip.test.tsx`

**Interfaces:**
- Produces: `DAY_TEXT = "day-text"` and `DAY_TEXT_TRANSITION` (same shape as `DAY_BODY_TRANSITION`), exported from `components/trip/day/day-transition.ts`.

How it works. On a day change the page remounts, so a `<ViewTransition>` inside it exits and enters. The text wrapper maps `day-forward` and `day-back` to `.day-text`, which runs a 150ms fade-out/fade-in in place. The arrows sit outside the wrapper, in the root snapshot, which `globals.css` never animates. The strip highlight is one absolutely positioned element that moves with `transform` and a CSS transition. Tapping a chip or an arrow lights the target at once (ADR 0063 pending state), so the highlight glides at tap time and is already in place when the new page swaps in. `motion-reduce:transition-none`, plus the existing reduced-motion `::view-transition-*` rule, make both instant.

- [ ] **Step 1: Write the failing tests.**

In `components/trip/day/day-transition.test.ts`, add the import `DAY_TEXT, DAY_TEXT_TRANSITION` and this test:

```ts
  it("the heading text crossfades on typed day changes and does nothing on untyped ones (spec 2026-09-29 D4)", () => {
    expect(DAY_TEXT).toBe("day-text");
    expect(DAY_TEXT_TRANSITION.enter[DAY_FORWARD]).toBe(DAY_TEXT);
    expect(DAY_TEXT_TRANSITION.enter[DAY_BACK]).toBe(DAY_TEXT);
    expect(DAY_TEXT_TRANSITION.exit[DAY_FORWARD]).toBe(DAY_TEXT);
    expect(DAY_TEXT_TRANSITION.exit[DAY_BACK]).toBe(DAY_TEXT);
    expect(DAY_TEXT_TRANSITION.enter.default).toBe("none");
    expect(DAY_TEXT_TRANSITION.default).toBe("none");
  });
```

In `app/globals.view-transition.test.ts`, add `"::view-transition-old(.day-text)", "::view-transition-new(.day-text)"` to the `it.each([...])` selector list, and add:

```ts
  it("day heading text crossfades in 150ms, in step with the body slide (spec 2026-09-29 D4)", () => {
    expect(css).toMatch(/::view-transition-old\(\.day-text\)\s*\{\s*animation:\s*150ms/);
    expect(css).toMatch(/::view-transition-new\(\.day-text\)\s*\{\s*animation:\s*150ms/);
  });
```

In `components/trip/day/day-header.test.tsx`, add inside `describe("DayHeader", …)`:

```tsx
  it("wraps the changing heading text — and not the arrows — for the day-change crossfade (spec 2026-09-29 D4)", () => {
    render(<DayHeader tripId="t1" eyebrow="E" heading="Sat 12 Dec" subLine="Strasbourg" subLineCompact="Strasbourg" dayTitle="Markets" prevHref="/trips/t1/day/2026-12-11" nextHref="/trips/t1/day/2026-12-13" prevLabel="Previous day: Fri 11 Dec" nextLabel="Next day: Sun 13 Dec" unreadCount={0} recent={[]} members={[]} addButton={<button>+</button>} />);
    const text = document.querySelector('[data-slot="day-heading-text"]') as HTMLElement;
    expect(text).toContainElement(screen.getByRole("heading", { level: 1 }));
    for (const s of Array.from(document.querySelectorAll('[data-slot="day-sub-line"]'))) expect(text).toContainElement(s as HTMLElement);
    expect(text).not.toContainElement(screen.getByRole("link", { name: /Previous day/ }));
    expect(text).not.toContainElement(screen.getByRole("link", { name: /Next day/ }));
    expect(text).not.toContainElement(document.querySelector('[data-slot="day-heading-ghost"]') as HTMLElement);
  });
```

In `components/trip/day/day-strip.test.tsx`:
  - In "is a nav of day links…", replace the two `bg-coral` expectations with:

```ts
    expect(links[3]).toHaveAttribute("data-lit", "true");
    expect(links[2]).not.toHaveAttribute("data-lit");
    const highlight = nav.querySelector("[data-strip-highlight]") as HTMLElement;
    expect(highlight.className).toContain("bg-coral");
    // Desktop chips are 3.5rem + a 0.5rem gap: day index 3 → 12rem.
    expect(highlight.style.transform).toBe("translateX(12rem)");
```

  - In "lights and marks the tapped chip pending…", replace `expect(links[4].className).toContain("bg-coral");` with `expect(links[4]).toHaveAttribute("data-lit", "true");`, and `expect(links[3].className).not.toContain("bg-coral");` with `expect(links[3]).not.toHaveAttribute("data-lit");`. Then add:

```ts
    const highlight = screen.getByRole("navigation", { name: "Days" }).querySelector("[data-strip-highlight]") as HTMLElement;
    expect(highlight.style.transform).toBe("translateX(16rem)");
```

  - Add a new test:

```ts
  it("the selected highlight glides (a transform transition) and is instant under reduced motion (spec 2026-09-29 D4)", () => {
    render(<DayStrip tripId="t1" dates={dates} segments={segments} size="phone" />);
    const highlight = screen.getByRole("navigation", { name: "Days" }).querySelector("[data-strip-highlight]") as HTMLElement;
    expect(highlight).toHaveAttribute("aria-hidden", "true");
    expect(highlight.className).toContain("transition-transform");
    expect(highlight.className).toContain("motion-reduce:transition-none");
    // Phone chips are 3rem + 0.5rem: index 3 → 10.5rem.
    expect(highlight.style.transform).toBe("translateX(10.5rem)");
  });
```

- [ ] **Step 2: Run them to verify they fail.**

Run: `TZ=UTC npx vitest run components/trip/day app/globals.view-transition.test.ts`
Expected: FAIL. `DAY_TEXT` is undefined, `.day-text` CSS is missing, there is no `day-heading-text` wrapper, and there is no `[data-strip-highlight]`.

- [ ] **Step 3: Add the transition map.** Append to `components/trip/day/day-transition.ts`:

```ts
/**
 * The Day header's changing text (date, eyebrow, Day title, sub line)
 * crossfades in place on a typed day change, in step with the body slide
 * (spec 2026-09-29 D4). The arrows sit outside it and never move.
 */
export const DAY_TEXT = "day-text";

export const DAY_TEXT_TRANSITION = {
  enter: { [DAY_FORWARD]: DAY_TEXT, [DAY_BACK]: DAY_TEXT, default: "none" },
  exit: { [DAY_FORWARD]: DAY_TEXT, [DAY_BACK]: DAY_TEXT, default: "none" },
  default: "none",
} as const;
```

- [ ] **Step 4: Add the CSS.** In `app/globals.css`, directly after the `::view-transition-new(.day-back) { … }` line, add:

```css
/* Day heading text (spec 2026-09-29 D4): the old text fades out as the new
   fades in, in place, over the first 150ms of the body slide. */
::view-transition-old(.day-text) { animation: 150ms ease-in both tp-vt-fade reverse; }
::view-transition-new(.day-text) { animation: 150ms ease-out both tp-vt-fade; }
```

The existing `@media (prefers-reduced-motion: reduce) { ::view-transition-old(*), … }` block already makes this instant.

- [ ] **Step 5: Wrap the header text.** In `components/trip/day/day-header.tsx`:
  - Change the import to `import { DAY_BACK, DAY_FORWARD, DAY_TEXT_TRANSITION } from "@/components/trip/day/day-transition";` and add `import { ViewTransition } from "@/components/ui/view-transition";`.
  - Inside the `data-slot="day-title-block"` div, keep the ghost `<span>` first. Wrap the five lines that follow it (eyebrow `<p>`, `day-title-line` div, `<h1>`, both `day-sub-line` `<p>`s) in:

```tsx
            <ViewTransition {...DAY_TEXT_TRANSITION}>
              <div data-slot="day-heading-text" className="flex w-full min-w-0 flex-col items-center">
                <p className="h-4 w-0 min-w-full truncate text-[10px] font-extrabold uppercase leading-4 tracking-[0.08em] text-muted-foreground md:text-[11px]">{eyebrow}</p>
                <div data-slot="day-title-line" className="flex h-5 w-0 min-w-full items-center justify-center text-sm font-bold leading-5 text-muted-foreground">{dayTitle}</div>
                <h1 className="font-display md:whitespace-nowrap text-[30px] font-extrabold leading-none tracking-[-0.02em] text-foreground md:text-[40px]">{heading}</h1>
                <p data-slot="day-sub-line" className="mt-1 hidden h-5 w-0 min-w-full truncate text-[15px] font-semibold leading-5 text-foreground md:block">{subLine}</p>
                <p data-slot="day-sub-line" className="mt-1 h-5 w-0 min-w-full truncate text-[13px] font-semibold leading-5 text-foreground md:hidden">{subLineCompact}</p>
              </div>
            </ViewTransition>
```

  These are the five existing elements, moved inside with their classes unchanged. The ghost `<span>` stays outside, as the block's first child.

- [ ] **Step 6: Make the strip highlight glide.** In `components/trip/day/day-strip.tsx`:
  - After `const isPendingChip = …`, add:

```ts
  // One highlight that moves, rather than each chip painting its own coral,
  // so the selection glides to the tapped day (spec 2026-09-29 D4). Chips are
  // fixed-width: phone 3rem (w-12), desktop 3.5rem (w-14), plus the 0.5rem gap.
  const litIndex = dates.findIndex((d) => isLit(d.iso));
  const strideRem = phone ? 3.5 : 4;
```

  - Change `<nav aria-label="Days" className="flex w-max gap-2">` to `<nav aria-label="Days" className="relative flex w-max gap-2">` and add as its first child:

```tsx
          {litIndex >= 0 ? (
            <span
              data-strip-highlight
              aria-hidden="true"
              className={cn(
                "island pointer-events-none absolute left-0 top-0 rounded-[14px] border-2 border-border bg-coral shadow-hard-1 transition-transform duration-200 ease-out motion-reduce:transition-none",
                phone ? "h-[58px] w-12" : "h-[62px] w-14",
              )}
              style={{ transform: `translateX(${litIndex * strideRem}rem)` }}
            />
          ) : null}
```

  - On each chip `AppLink`, add `data-lit={isLit(d.iso) ? "true" : undefined}` and replace `isLit(d.iso) ? "island bg-coral shadow-hard-1" : "bg-card"` with `isLit(d.iso) ? "island bg-transparent" : "bg-card"`. The chips already have `relative`, and they come after the highlight in the DOM, so they paint above it.

- [ ] **Step 7: Run the tests to verify they pass.**

Run: `TZ=UTC npx vitest run components/trip/day app/globals.view-transition.test.ts "app/(app)/trips/[tripId]/day" && npx tsc --noEmit -p .`
Expected: PASS, and tsc exits 0.

- [ ] **Step 8: Commit.**

```bash
git add components/trip/day/day-transition.ts components/trip/day/day-transition.test.ts app/globals.css app/globals.view-transition.test.ts components/trip/day/day-header.tsx components/trip/day/day-header.test.tsx components/trip/day/day-strip.tsx components/trip/day/day-strip.test.tsx
git commit -m "$(cat <<'EOF'
feat(day): crossfade the heading text and glide the strip highlight on day change

Resolves-Feedback: cmum89gal000004l94l53w2oc
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Day plan and Journal cards size to their content (D5 + D6)

These two notes share the page's body grid and its test file, so they are one task.

**Files:**
- Modify: `components/trip/day/day-plan-card.tsx`
- Modify: `components/trip/day/journal-card.tsx`
- Create: `components/trip/day/journal-compose.tsx`
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx` (lines ~107, ~133–146)
- Test: `components/trip/day/journal-card.test.tsx`, `app/(app)/trips/[tripId]/day/[date]/page.test.tsx`

**Interfaces:**
- Produces: `JournalCompose(props: JournalEditorProps)`, a client component that shows a prompt until "Write an entry" is pressed, then `JournalEditor`.
- Consumes: `JournalEditorProps` (exported from `components/trip/journal-editor.tsx`).

- [ ] **Step 1: Write the failing tests.**

In `app/(app)/trips/[tripId]/day/[date]/page.test.tsx`:
  - Add `fireEvent` to the `@testing-library/react` import.
  - Replace the test `"no ideas → 'Nothing planned yet. Add a place, an activity or a note.'"` with:

```tsx
  it("empty day (no plans, no ideas): a compact centred 'Nothing planned' block holding the add action (spec 2026-09-29 D5)", async () => {
    getDayMock.mockResolvedValue(fixture({ ideas: { rows: [], all: [], more: 0, eyebrow: null } }));
    const { container } = await renderPage();
    const empties = Array.from(container.querySelectorAll<HTMLElement>('[data-slot="day-plan-empty"]'));
    expect(empties).toHaveLength(2); // phone + desktop trees
    for (const e of empties) {
      expect(e).toHaveTextContent("Nothing planned");
      expect(e.className).toContain("min-h-[12rem]");
      expect(e.className).toContain("justify-center");
      expect(e.querySelector("button")).not.toBeNull();
    }
    expect(screen.queryByText("Nothing planned yet. Add a place, an activity or a note.")).toBeNull();
    for (const s of Array.from(container.querySelectorAll<HTMLElement>('section[aria-labelledby^="day-plan-heading"]'))) {
      expect(s.className).not.toContain("h-full");
    }
  });

  it("a busy day keeps the max height and internal scroll", async () => {
    getDayMock.mockResolvedValue(fixture({ hasEntries: true, planCount: 9 }));
    const { container } = await renderPage();
    const body = container.querySelector('[data-slot="day-plan-body"][data-size="desktop"]') as HTMLElement;
    expect(body.className).toContain("lg:max-h-[max(20rem,calc(100dvh-22rem))]");
    expect(body.className).toContain("lg:overflow-y-auto");
    expect(body.className).not.toContain("flex-1");
  });

  it("both desktop columns are top-aligned and neither card stretches (spec 2026-09-29 D5/D6)", async () => {
    const { container } = await renderPage();
    const grid = container.querySelector("[data-day-body] > .grid") as HTMLElement;
    expect(grid.className).toContain("lg:items-start");
    expect(grid.className).not.toContain("flex-1");
    expect((container.querySelector("[data-journal]") as HTMLElement).className).not.toContain("flex-1");
  });
```

  - Replace the test `"on the day: the Journal editor, no 'Opens on the day'"` with:

```tsx
  it("on the day with nothing written: a compact prompt; the editor opens on 'Write an entry' (spec 2026-09-29 D6)", async () => {
    getDayMock.mockResolvedValue(fixture({ journal: { open: true, mine: { body: "", updatedAt: null, photo: null, extraPhotos: [], hiddenFromShares: false }, others: [] } }));
    await renderPage();
    expect(screen.queryByText("Opens on the day")).toBeNull();
    expect(screen.queryByTestId("journal-editor")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Write an entry" }));
    expect(screen.getByTestId("journal-editor")).toBeInTheDocument();
  });

  it("on the day with an entry: the editor shows straight away", async () => {
    getDayMock.mockResolvedValue(fixture({ journal: { open: true, mine: { body: "Snow!", updatedAt: new Date(), photo: null, extraPhotos: [], hiddenFromShares: false }, others: [] } }));
    await renderPage();
    expect(screen.getByTestId("journal-editor")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Write an entry" })).toBeNull();
  });
```

In `components/trip/day/journal-card.test.tsx`, add `fireEvent` to the import and add:

```tsx
  it("on the day with nothing written by anyone: prompt + 'Write an entry', which opens the editor", () => {
    render(<JournalCard tripId="t1" date="2026-12-12" dateLabel="Sat 12 Dec" journal={{ open: true, mine: { body: "  ", updatedAt: null, photo: null, extraPhotos: [], hiddenFromShares: false }, others: [] }} />);
    expect(screen.getByText("How was today? Jot a memory…")).toBeInTheDocument();
    expect(screen.queryByTestId("editor")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Write an entry" }));
    expect(screen.getByTestId("editor")).toHaveTextContent("2026-12-12");
  });
  it("a co-Traveller's entry means the card is not empty: the editor shows directly", () => {
    render(<JournalCard tripId="t1" date="2026-12-12" dateLabel="Sat 12 Dec" journal={{ open: true, mine: { body: "", updatedAt: null, photo: null, extraPhotos: [], hiddenFromShares: false }, others: [{ authorId: "u2", body: "Snow!", updatedAt: new Date(), author: null, photos: [] }] }} />);
    expect(screen.getByTestId("editor")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Write an entry" })).toBeNull();
  });
```

- [ ] **Step 2: Run them to verify they fail.**

Run: `TZ=UTC npx vitest run components/trip/day/journal-card.test.tsx "app/(app)/trips/[tripId]/day"`
Expected: FAIL. There is no `day-plan-empty`, no `day-plan-body`, no `lg:items-start`, and no "Write an entry" button.

- [ ] **Step 3: Resize the Day plan card.** In `components/trip/day/day-plan-card.tsx`, replace the `<section …>` element (the whole return) with:

```tsx
  const empty = !data.hasEntries && data.ideas.rows.length === 0;
  return (
    <section
      aria-labelledby={`day-plan-heading-${size}`}
      className={cn(
        "flex flex-col gap-3.5 border-2 border-border bg-card",
        phone ? "rounded-[20px] p-4 shadow-hard-2" : "rounded-3xl px-6 py-[22px] shadow-hard-3",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`day-plan-heading-${size}`} className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-foreground">
          Day plan
        </h2>
        <span className="text-right text-[13px] font-semibold text-muted-foreground">{planCountLabel(data.planCount)}</span>
      </div>
      {empty ? (
        // An empty day is a small block, not a tall empty card (spec 2026-09-29 D5):
        // about three or four Items' worth of room, the line and the add action centred.
        <div data-slot="day-plan-empty" className="flex min-h-[12rem] flex-col items-center justify-center gap-3.5 text-center">
          <p className="text-sm font-semibold text-muted-foreground">Nothing planned</p>
          <div className="w-full">{addButton}</div>
        </div>
      ) : (
        <>
          <div
            data-slot="day-plan-body"
            data-size={size}
            className={cn("flex flex-col gap-3.5", !phone && "lg:max-h-[max(20rem,calc(100dvh-22rem))] lg:overflow-y-auto")}
          >
            {data.hasEntries ? (
              <>
                <Timeline
                  day={data.plan}
                  variant="day"
                  size="large"
                  itemDirections={data.itemDirections}
                  attachmentsByTarget={data.attachmentsByTarget}
                  showUnschedule
                  editor={data.editor}
                />
                <DayMapPanel tripId={data.tripId} model={data.dayMap} />
                <DayFeasibility entries={data.feasibility as DayFeasibilityEntry[]} />
                <NearbyWishlist tripId={data.tripId} date={data.date} items={data.nearby} />
              </>
            ) : (
              <DayIdeasRows
                tripId={data.tripId}
                date={data.date}
                dateLabel={dateLabel}
                rows={data.ideas.all}
                eyebrow={data.ideas.eyebrow}
                size={size}
              />
            )}
          </div>
          <div>{addButton}</div>
        </>
      )}
    </section>
  );
```

Update the doc comment to say the card sizes to its content, that an empty day is a compact centred block, and that a busy day scrolls inside the card from lg.

- [ ] **Step 4: Create `components/trip/day/journal-compose.tsx`:**

```tsx
"use client";

import * as React from "react";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JournalEditor, type JournalEditorProps } from "@/components/trip/journal-editor";

/**
 * The Day view's empty Journal (spec 2026-09-29 D6): a one-line prompt and
 * the write action, so an empty card stays small. The editor opens on demand.
 */
export function JournalCompose(props: JournalEditorProps) {
  const [writing, setWriting] = React.useState(false);
  if (writing) return <JournalEditor {...props} />;
  return (
    <div data-slot="journal-prompt" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-medium text-muted-foreground">How was today? Jot a memory…</p>
      <Button variant="outline" size="sm" onClick={() => setWriting(true)}>
        <PenLine className="size-4" aria-hidden="true" />
        Write an entry
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Use it in the Journal card.** In `components/trip/day/journal-card.tsx`:
  - Add `import { JournalCompose } from "@/components/trip/day/journal-compose";`.
  - Before `return`, add:

```ts
  // Empty = the day is open, no co-Traveller has written, and the viewer's own
  // entry has no words and no photo (spec 2026-09-29 D6).
  const mine = journal.mine;
  const empty =
    journal.open &&
    journal.others.length === 0 &&
    mine != null &&
    mine.body.trim() === "" &&
    mine.photo == null &&
    (mine.extraPhotos?.length ?? 0) === 0;
```

  - Replace the `{journal.open && journal.mine ? (<JournalEditor … />) : null}` block with:

```tsx
      {journal.open && mine ? (
        empty ? (
          <JournalCompose
            tripId={tripId}
            date={date}
            initialBody={mine.body}
            updatedAt={mine.updatedAt}
            photo={mine.photo}
            extraPhotos={mine.extraPhotos}
            hiddenFromShares={mine.hiddenFromShares}
            framed={false}
          />
        ) : (
          <JournalEditor
            tripId={tripId}
            date={date}
            initialBody={mine.body}
            updatedAt={mine.updatedAt}
            photo={mine.photo}
            extraPhotos={mine.extraPhotos}
            hiddenFromShares={mine.hiddenFromShares}
            framed={false}
          />
        )
      ) : null}
```

- [ ] **Step 6: Top-align the columns.** In `app/(app)/trips/[tripId]/day/[date]/page.tsx`:
  - Replace `<div className="flex flex-col gap-3.5 lg:min-h-[calc(100dvh-4.5rem)] lg:gap-[18px]">` with `<div className="flex flex-col gap-3.5 lg:gap-[18px]">`, and delete the comment above it that describes the day filling the viewport.
  - Replace `<div data-day-body className="flex min-h-0 flex-1 flex-col gap-3.5 lg:gap-[18px]">` with `<div data-day-body className="flex flex-col gap-3.5 lg:gap-[18px]">`.
  - Replace the body grid's className `"grid min-h-0 flex-1 grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-[18px]"` with `"grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-[18px]"`.
  - Replace `<div className="hidden min-h-0 md:block">` (desktop plan wrapper) with `<div className="hidden md:block">`, and the right column `<div className="flex min-h-0 flex-col gap-3.5 lg:gap-[18px]">` with `<div className="flex flex-col gap-3.5 lg:gap-[18px]">`.
  - Remove `className="flex-1"` from `<JournalCard … />`.

- [ ] **Step 7: Run the tests to verify they pass.**

Run: `TZ=UTC npx vitest run components/trip/day "app/(app)/trips/[tripId]/day" && npx tsc --noEmit -p .`
Expected: PASS, and tsc exits 0.

- [ ] **Step 8: Commit.**

```bash
git add components/trip/day/day-plan-card.tsx components/trip/day/journal-card.tsx components/trip/day/journal-compose.tsx components/trip/day/journal-card.test.tsx "app/(app)/trips/[tripId]/day/[date]/page.tsx" "app/(app)/trips/[tripId]/day/[date]/page.test.tsx"
git commit -m "$(cat <<'EOF'
feat(day): Day plan and Journal cards size to content; columns top-aligned

Resolves-Feedback: cmum89xjz000104l95rix7a3u
Resolves-Feedback: cmum8a8la000204l98a4pdiar
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Bookend legs recognised by shape; one prompt per bookend (P1)

**Files:**
- Modify: `lib/home-base.ts` (`findOutboundLeg`, `findReturnLeg`, `hasOutboundLeg`, `hasReturnLeg`)
- Test: `lib/home-base.test.ts`, `lib/flags.test.ts` (`describe("flagMissingHomeConnection")`)
- Modify: `components/trip/itinerary-manager.tsx` (bookend block ~1106–1120; `renderHeadSlot` ~1561–1585; `renderStop` add-transport button ~1702–1720; return bookend + footer ~2112–2150)
- Test: `components/trip/itinerary-manager.test.tsx` (`describe("home base bookends")`)

**Interfaces:**
- Produces: `interface LegLike { depIsHome?: boolean | null; arrIsHome?: boolean | null; fromStopId?: string | null; toStopId?: string | null }`. `findOutboundLeg<T extends LegLike>(transports: readonly T[], firstStopId: string | null): T | null` and `findReturnLeg<T extends LegLike>(transports: readonly T[], lastStopId: string | null): T | null`. `hasOutboundLeg` and `hasReturnLeg` take `readonly LegLike[]`. The Flags (`flagMissingHomeConnection`) and Next steps (`next-steps-builder.ts`) already call `hasOutboundLeg`/`hasReturnLeg`, so they pick up the rule with no further change.

- [ ] **Step 1: Write the failing tests.** In `lib/home-base.test.ts`, replace the `describe("leg presence", …)` and `describe("findOutboundLeg / findReturnLeg", …)` blocks with:

```ts
describe("outbound / return legs by shape (ADR 0032 amendment 2026-09-29)", () => {
  it("outbound = a Transport arriving at the first Stop whose departure is not another Stop", () => {
    expect(findOutboundLeg([{ id: "a", depIsHome: true, toStopId: "s1" }], "s1")?.id).toBe("a");
    expect(findOutboundLeg([{ id: "b", depIsHome: false, fromStopId: null, toStopId: "s1" }], "s1")?.id).toBe("b"); // "Brisbane" free text
    expect(findOutboundLeg([{ id: "c", toStopId: "s1" }], "s1")?.id).toBe("c"); // unset departure
  });
  it("a leg from another Stop into the first Stop is not the outbound leg (review focus 5)", () => {
    expect(findOutboundLeg([{ id: "loop", fromStopId: "s2", toStopId: "s1" }], "s1")).toBeNull();
  });
  it("a home-flagged candidate wins over a free-text one, whatever the order", () => {
    const legs = [
      { id: "free", depIsHome: false, fromStopId: null, toStopId: "s1" },
      { id: "home", depIsHome: true, fromStopId: null, toStopId: "s1" },
    ];
    expect(findOutboundLeg(legs, "s1")?.id).toBe("home");
  });
  it("return = a Transport departing the last Stop whose arrival is not another Stop; home-flagged wins", () => {
    expect(findReturnLeg([{ id: "r", fromStopId: "s9", toStopId: null, arrIsHome: false }], "s9")?.id).toBe("r");
    expect(findReturnLeg([{ id: "x", fromStopId: "s9", toStopId: "s3" }], "s9")).toBeNull();
    expect(
      findReturnLeg([{ id: "free", fromStopId: "s9", toStopId: null }, { id: "home", fromStopId: "s9", arrIsHome: true }], "s9")?.id,
    ).toBe("home");
  });
  it("no Stop → no leg", () => {
    expect(findOutboundLeg([{ id: "a", toStopId: "s1" }], null)).toBeNull();
    expect(findReturnLeg([{ id: "a", fromStopId: "s1" }], null)).toBeNull();
  });
  it("hasOutboundLeg / hasReturnLeg use the same rule", () => {
    expect(hasOutboundLeg([{ depIsHome: false, toStopId: "s1" }], "s1")).toBe(true);
    expect(hasOutboundLeg([{ fromStopId: "s0", toStopId: "s1" }], "s1")).toBe(false);
    expect(hasReturnLeg([{ fromStopId: "s9", arrIsHome: false }], "s9")).toBe(true);
    expect(hasReturnLeg([{ fromStopId: "s9", toStopId: "s1" }], "s9")).toBe(false);
  });
});
```

In `lib/flags.test.ts`, inside `describe("flagMissingHomeConnection", …)`, add:

```ts
  it("a return leg landing at a free-text place (not the Home base's name) still counts — no missing-return Flag", () => {
    const last = homelessStops[homelessStops.length - 1];
    const first = homelessStops[0];
    const transports = [
      { depIsHome: false, arrIsHome: false, fromStopId: null, toStopId: first.id },
      { depIsHome: false, arrIsHome: false, fromStopId: last.id, toStopId: null },
    ];
    expect(flagMissingHomeConnection(homelessStops, transports, home, true)).toEqual([]);
  });
```

In `components/trip/itinerary-manager.test.tsx`, inside `describe("home base bookends", …)`, add:

```tsx
  it("a free-text outbound flight ('Brisbane') is the outbound bookend: its real endpoint shows, no outbound prompt, no generic slot", () => {
    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop({ id: "s1", name: "Denpasar" })]}
        initialTransports={[makeTransport({ id: "out", depPlace: "Brisbane", toStopId: "s1" })]}
        homeBaseName="Gold Coast"
        roundTrip={false}
      />,
    );
    expect(within(screen.getByTestId("transport-heading")).getByText("Brisbane")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add transport to Denpasar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add transport here/i })).not.toBeInTheDocument();
  });

  it("a free-text return flight is the return bookend: no 'Add transport home', no generic Add transport below it", () => {
    render(
      <ItineraryManager
        {...baseProps}
        initialStops={[makeStop({ id: "s1", name: "Rome" })]}
        initialTransports={[makeTransport({ id: "ret", fromStopId: "s1", arrPlace: "Brisbane" })]}
        homeBaseName="Gold Coast"
        roundTrip={true}
      />,
    );
    expect(within(screen.getByTestId("transport-heading")).getByText("Brisbane")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add transport home to Gold Coast/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add transport$/i })).not.toBeInTheDocument();
  });

  it("with no return leg, the return bookend prompt is the only add-transport prompt at the end", () => {
    render(
      <ItineraryManager {...baseProps} initialStops={[makeStop({ id: "s1", name: "Rome" })]} homeBaseName="Gold Coast" roundTrip={true} />,
    );
    expect(screen.getByRole("button", { name: /add transport home to Gold Coast/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add transport$/i })).not.toBeInTheDocument();
  });

  it("with no Home base the generic Add transport buttons stay (unchanged)", () => {
    render(<ItineraryManager {...baseProps} initialStops={[makeStop({ id: "s1", name: "Rome" })]} />);
    expect(screen.getAllByRole("button", { name: /^add transport$/i }).length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run them to verify they fail.**

Run: `TZ=UTC npx vitest run lib/home-base.test.ts lib/flags.test.ts components/trip/itinerary-manager.test.tsx`
Expected: FAIL. The free-text legs are not found, the missing-return Flag fires, "Add transport to Denpasar" and "Add transport here" still render, and the generic "Add transport" renders under the return bookend.

- [ ] **Step 3: Rewrite the leg rule.** In `lib/home-base.ts`, replace `findOutboundLeg`, `findReturnLeg`, `hasOutboundLeg` and `hasReturnLeg` with:

```ts
/** The fields the leg rule reads (Transport rows, Flag inputs and plan-editor legs all fit). */
export interface LegLike {
  depIsHome?: boolean | null;
  arrIsHome?: boolean | null;
  fromStopId?: string | null;
  toStopId?: string | null;
}

/**
 * The outbound leg (ADR 0032, amended 2026-09-29): a Transport arriving at the
 * first Stop whose departure is not another Stop — Home-flagged, a free-text
 * place ("Brisbane"), or unset. A Home-flagged candidate wins. This is the one
 * rule: the plan editor's bookends, the Flags and Next steps all use it, and
 * so does the Day view's stop line.
 */
export function findOutboundLeg<T extends LegLike>(transports: readonly T[], firstStopId: string | null): T | null {
  if (!firstStopId) return null;
  const candidates = transports.filter((t) => t.toStopId === firstStopId && !t.fromStopId);
  return candidates.find((t) => Boolean(t.depIsHome)) ?? candidates[0] ?? null;
}

/** The return leg: a Transport departing the last Stop whose arrival is not another Stop. A Home-flagged candidate wins. */
export function findReturnLeg<T extends LegLike>(transports: readonly T[], lastStopId: string | null): T | null {
  if (!lastStopId) return null;
  const candidates = transports.filter((t) => t.fromStopId === lastStopId && !t.toStopId);
  return candidates.find((t) => Boolean(t.arrIsHome)) ?? candidates[0] ?? null;
}

export function hasOutboundLeg(transports: readonly LegLike[], firstStopId: string | null): boolean {
  return findOutboundLeg(transports, firstStopId) !== null;
}

export function hasReturnLeg(transports: readonly LegLike[], lastStopId: string | null): boolean {
  return findReturnLeg(transports, lastStopId) !== null;
}
```

Update the Rule 15 comment in `lib/flags.ts` (~line 768) so it no longer says "departing from the home base" and instead says "the outbound/return leg as `lib/home-base.ts` defines it (by shape, ADR 0032 amendment)". Leave the code alone. `flagMissingHomeConnection`'s `Pick<FlagTransport, "depIsHome" | "arrIsHome" | "fromStopId" | "toStopId">` already fits `LegLike`.

- [ ] **Step 4: One prompt per bookend in the plan editor.** In `components/trip/itinerary-manager.tsx`:
  - After `const returnLeg = findReturnLeg(…)`, add:

```ts
  // A return bookend renders on a round trip with a Home base and a last Stop.
  // It owns the end of the plan's add-transport affordance: no generic slot
  // after the last Stop and no standalone "Add transport" below it (ADR 0032
  // amendment 2026-09-29 — at most one prompt per bookend).
  const hasReturnBookend = hasHomeBase && Boolean(roundTrip) && lastStop != null;
```

  - In `renderHeadSlot`, wrap the `<div className="flex justify-center"> … Add transport here … </div>` in `{!hasHomeBase && ( … )}`. With a Home base, the outbound bookend owns the start of the plan.
  - In `renderStop`, wrap the `{/* Single context-aware "Add transport" button per Stop slot. … */}` `<div className="flex justify-center">…</div>` in `{!(isLast && hasReturnBookend) && ( … )}`.
  - Replace `{hasHomeBase && roundTrip && lastStop && (` (the return bookend) with `{hasReturnBookend && lastStop && (`.
  - In the footer row, wrap the standalone `<Button …>… Add transport</Button>` (the one with `setAddTransportDefaults({ anchorStopId: lastStop?.id })`) in `{!hasReturnBookend && ( … )}`, and add `sm:ml-auto` to the className of the sibling `<div className="flex flex-wrap items-center gap-2">`.

- [ ] **Step 5: Run the tests to verify they pass.**

Run: `TZ=UTC npx vitest run lib/home-base.test.ts lib/flags.test.ts lib/next-steps.test.ts components/trip/itinerary-manager.test.tsx components/trip/plan-stops-nav.test.tsx && npx tsc --noEmit -p .`
Expected: PASS, and tsc exits 0.

- [ ] **Step 6: Commit.**

```bash
git add lib/home-base.ts lib/home-base.test.ts lib/flags.ts lib/flags.test.ts components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "$(cat <<'EOF'
fix(plan): recognise bookend legs by shape; one add-transport prompt per bookend

Resolves-Feedback: cmum86t22000104jnxggtl4mj
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Stop line runs Home base → Stops → Home base, through Gap days (D3)

**Files:**
- Modify: `lib/day-view-model.ts` (replace `citySegments`/`CitySegment` with `stopLine`/`StopLine`)
- Test: `lib/day-view-model.test.ts` (replace `describe("citySegments")`)
- Modify: `lib/day-view-loader.ts` (trip select adds `roundTrip`; `strip.segments` → `strip.line`)
- Test: `lib/day-view-loader.test.ts`
- Modify: `components/trip/day/day-strip.tsx` (prop `segments` → `line`; line row rendering)
- Test: `components/trip/day/day-strip.test.tsx`
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx`, `app/(app)/trips/[tripId]/day/[date]/page.test.tsx` (fixture `strip`)

**Interfaces:**
- Consumes: `findOutboundLeg`, `findReturnLeg` (Task 5).
- Produces:

```ts
export type StopLineSegment =
  | { kind: "stop"; name: string; startIndex: number; span: number; hueIndex: number }
  | { kind: "gap"; startIndex: number; span: number; mode: TransportMode | null; label: string | null };
export interface StopLine { homeStart: string | null; homeEnd: string | null; segments: StopLineSegment[] }
export interface LineStop { id: string; name: string; arriveDate: string; departDate: string; sortOrder: number }
export interface LineTransport { fromStopId: string | null; toStopId: string | null; depPlace: string | null; arrPlace: string | null; depIsHome: boolean; arrIsHome: boolean; mode: TransportMode }
export function stopLine(i: { days: string[]; stops: LineStop[]; transports: LineTransport[]; homeName: string | null; roundTrip: boolean }): StopLine
```

- `DayViewData["strip"]` becomes `{ dates: …; line: StopLine }`. `DayStrip` props become `{ tripId, dates, line: StopLine, size }`.

Day ownership rule: a night belongs to the Stop you sleep at (`arrive ≤ d < depart`, latest arrival wins on overlap). A Stop's depart day that is nobody's night stays on that Stop, since `stopForDate` counts it as covered, so it is not a **Gap day**. This is what stopped the line "ending randomly". Any other day is a Gap day.

- [ ] **Step 1: Write the failing tests.** In `lib/day-view-model.test.ts`, change the import to replace `citySegments` with `stopLine`, and replace `describe("citySegments", …)` with:

```ts
describe("stopLine (spec 2026-09-29 D3)", () => {
  const stops = [
    { id: "p", name: "Paris", arriveDate: "2026-12-06", departDate: "2026-12-10", sortOrder: 0 },
    { id: "s", name: "Strasbourg", arriveDate: "2026-12-10", departDate: "2026-12-13", sortOrder: 1 },
    { id: "c", name: "Colmar", arriveDate: "2026-12-13", departDate: "2026-12-15", sortOrder: 2 },
  ];
  it("no Home base: one segment per Stop; the last Stop keeps its depart day; the day after is an unlabelled Gap day", () => {
    const line = stopLine({ days: tripDays("2026-12-08", "2026-12-16"), stops, transports: [], homeName: null, roundTrip: true });
    expect(line.homeStart).toBeNull();
    expect(line.homeEnd).toBeNull();
    expect(line.segments).toEqual([
      { kind: "stop", name: "Paris", startIndex: 0, span: 2, hueIndex: 0 },
      { kind: "stop", name: "Strasbourg", startIndex: 2, span: 3, hueIndex: 1 },
      { kind: "stop", name: "Colmar", startIndex: 5, span: 3, hueIndex: 2 },
      { kind: "gap", startIndex: 8, span: 1, mode: null, label: null },
    ]);
  });
  it("a Gap day between Stops is a dashed stretch carrying the covering Transport's mode and route", () => {
    const two = [
      { id: "d", name: "Denpasar", arriveDate: "2026-12-05", departDate: "2026-12-09", sortOrder: 0 },
      { id: "r", name: "Rome", arriveDate: "2026-12-11", departDate: "2026-12-15", sortOrder: 1 },
    ];
    const flight = { fromStopId: "d", toStopId: "r", depPlace: null, arrPlace: null, depIsHome: false, arrIsHome: false, mode: "FLIGHT" as const };
    const line = stopLine({ days: tripDays("2026-12-05", "2026-12-14"), stops: two, transports: [flight], homeName: null, roundTrip: true });
    expect(line.segments).toEqual([
      { kind: "stop", name: "Denpasar", startIndex: 0, span: 5, hueIndex: 0 },
      { kind: "gap", startIndex: 5, span: 1, mode: "FLIGHT", label: "Denpasar → Rome" },
      { kind: "stop", name: "Rome", startIndex: 6, span: 4, hueIndex: 1 },
    ]);
  });
  it("Home base: dots at both ends labelled with its name (never 'Home'); the outbound Gap day uses the leg's real endpoint", () => {
    const one = [{ id: "d", name: "Denpasar", arriveDate: "2026-12-05", departDate: "2026-12-09", sortOrder: 0 }];
    const out = { fromStopId: null, toStopId: "d", depPlace: "Brisbane", arrPlace: null, depIsHome: false, arrIsHome: false, mode: "FLIGHT" as const };
    const line = stopLine({ days: tripDays("2026-12-04", "2026-12-09"), stops: one, transports: [out], homeName: "Gold Coast", roundTrip: true });
    expect(line.homeStart).toBe("Gold Coast");
    expect(line.homeEnd).toBe("Gold Coast");
    expect(line.segments[0]).toEqual({ kind: "gap", startIndex: 0, span: 1, mode: "FLIGHT", label: "Brisbane → Denpasar" });
    expect(JSON.stringify(line)).not.toContain('"Home"');
  });
  it("a home-flagged leg is labelled with the Home base's name", () => {
    const one = [{ id: "r", name: "Rome", arriveDate: "2027-01-01", departDate: "2027-01-07", sortOrder: 0 }];
    const ret = { fromStopId: "r", toStopId: null, depPlace: null, arrPlace: null, depIsHome: false, arrIsHome: true, mode: "FLIGHT" as const };
    const line = stopLine({ days: tripDays("2027-01-01", "2027-01-08"), stops: one, transports: [ret], homeName: "Gold Coast", roundTrip: true });
    expect(line.segments.at(-1)).toEqual({ kind: "gap", startIndex: 7, span: 1, mode: "FLIGHT", label: "Rome → Gold Coast" });
  });
  it("one-way trip: a Home base dot at the start only", () => {
    const line = stopLine({ days: tripDays("2026-12-08", "2026-12-09"), stops, transports: [], homeName: "Gold Coast", roundTrip: false });
    expect(line.homeStart).toBe("Gold Coast");
    expect(line.homeEnd).toBeNull();
  });
});
```

In `lib/day-view-loader.test.ts`, replace `expect(d.strip.segments.map((s) => s.name)).toEqual(["Paris", "Strasbourg", "Colmar"]);` with:

```ts
    expect(d.strip.line.homeStart).toBe("Brisbane");
    expect(d.strip.line.homeEnd).toBe("Brisbane"); // TRIP has no roundTrip field → defaults to a round trip
    expect(d.strip.line.segments.map((s) => (s.kind === "stop" ? s.name : "gap"))).toEqual(["gap", "Paris", "Strasbourg", "Colmar", "gap"]);
```

In `components/trip/day/day-strip.test.tsx`:
  - Replace the `segments` fixture with:

```ts
import type { StopLine } from "@/lib/day-view-model";
const segments: StopLine = {
  homeStart: "Gold Coast",
  homeEnd: "Gold Coast",
  segments: [
    { kind: "gap", startIndex: 0, span: 1, mode: "FLIGHT", label: "Brisbane → Paris" },
    { kind: "stop", name: "Paris", startIndex: 1, span: 1, hueIndex: 0 },
    { kind: "stop", name: "Strasbourg", startIndex: 2, span: 3, hueIndex: 1 },
  ],
};
```

  - Rename every `segments={segments}` prop to `line={segments}`, and in "tags chips…" change `segments={[]}` to `line={{ homeStart: null, homeEnd: null, segments: [] }}`.
  - In "desktop shows the city line…", change `[data-city-segment]` to `[data-line-segment]` and the expected Strasbourg column to `{ gridColumn: "3 / span 3" }`.
  - Add:

```ts
  it("desktop line: Home base dots at both ends by name, and the Gap day as a dashed stretch with the mode icon and route (spec 2026-09-29 D3)", () => {
    render(<DayStrip tripId="t1" dates={dates} line={segments} size="desktop" />);
    const homes = document.querySelectorAll("[data-home-dot]");
    expect(homes).toHaveLength(2);
    expect(screen.getAllByText("Gold Coast")).toHaveLength(2);
    expect(screen.queryByText("Home")).toBeNull();
    const gap = document.querySelector('[data-line-segment="gap"]') as HTMLElement;
    expect(gap).toHaveTextContent("Brisbane → Paris");
    expect(gap.querySelector("svg")).not.toBeNull();
    expect(gap.querySelector("[data-line-dashed]")).not.toBeNull();
  });
  it("an uncovered Gap day is a bare dashed stretch; no Home base → no end dots", () => {
    const bare: StopLine = { homeStart: null, homeEnd: null, segments: [{ kind: "stop", name: "Paris", startIndex: 0, span: 2, hueIndex: 0 }, { kind: "gap", startIndex: 2, span: 3, mode: null, label: null }] };
    render(<DayStrip tripId="t1" dates={dates} line={bare} size="desktop" />);
    expect(document.querySelectorAll("[data-home-dot]")).toHaveLength(0);
    const gap = document.querySelector('[data-line-segment="gap"]') as HTMLElement;
    expect(gap.textContent).toBe("");
    expect(gap.querySelector("svg")).toBeNull();
    expect(gap.querySelector("[data-line-dashed]")).not.toBeNull();
  });
```

In `app/(app)/trips/[tripId]/day/[date]/page.test.tsx`, change the fixture's `strip: { dates: [], segments: [] }` to `strip: { dates: [], line: { homeStart: null, homeEnd: null, segments: [] } }`.

- [ ] **Step 2: Run them to verify they fail.**

Run: `TZ=UTC npx vitest run lib/day-view-model.test.ts lib/day-view-loader.test.ts components/trip/day/day-strip.test.tsx`
Expected: FAIL. `stopLine` is not exported, and `strip.line` is undefined.

- [ ] **Step 3: Implement `stopLine`.** In `lib/day-view-model.ts`, add the imports `import type { TransportMode } from "@/lib/enums";` and `import { findOutboundLeg, findReturnLeg } from "@/lib/home-base";`. Delete `CitySegment` and `citySegments`, and add:

```ts
/**
 * The Day strip's stop line (spec 2026-09-29 D3): Home base → Stops → Home base.
 * Each day belongs to the Stop whose night it is; a Stop's depart day that is
 * nobody's night stays on that Stop (it is covered, not a Gap day). Any other
 * day is a Gap day, drawn as a dashed stretch labelled with the covering
 * Transport — the outbound leg before the first Stop, the return leg after the
 * last (lib/home-base.ts rule), else the leg between the neighbouring Stops.
 */
export type StopLineSegment =
  | { kind: "stop"; name: string; startIndex: number; span: number; hueIndex: number }
  | { kind: "gap"; startIndex: number; span: number; mode: TransportMode | null; label: string | null };

export interface StopLine { homeStart: string | null; homeEnd: string | null; segments: StopLineSegment[] }
export interface LineStop { id: string; name: string; arriveDate: string; departDate: string; sortOrder: number }
export interface LineTransport {
  fromStopId: string | null;
  toStopId: string | null;
  depPlace: string | null;
  arrPlace: string | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  mode: TransportMode;
}

function coveringLeg(prev: LineStop | null, next: LineStop | null, transports: LineTransport[]): LineTransport | null {
  if (!prev && next) return findOutboundLeg(transports, next.id);
  if (prev && !next) return findReturnLeg(transports, prev.id);
  if (prev && next) {
    return (
      transports.find((t) => t.fromStopId === prev.id && t.toStopId === next.id) ??
      transports.find((t) => t.fromStopId === prev.id && !t.toStopId) ??
      transports.find((t) => !t.fromStopId && t.toStopId === next.id) ??
      null
    );
  }
  return null;
}

function legLabel(t: LineTransport, byId: Map<string, LineStop>, homeName: string | null): string | null {
  // Same endpoint precedence as the Transport card (components/trip/transport-card.tsx).
  const from = t.depIsHome ? homeName : ((t.fromStopId ? byId.get(t.fromStopId)?.name : null) ?? t.depPlace);
  const to = t.arrIsHome ? homeName : ((t.toStopId ? byId.get(t.toStopId)?.name : null) ?? t.arrPlace);
  if (from && to) return `${from} → ${to}`;
  return from ?? to ?? null;
}

export function stopLine(i: { days: string[]; stops: LineStop[]; transports: LineTransport[]; homeName: string | null; roundTrip: boolean }): StopLine {
  const sorted = [...i.stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const hue = new Map(sorted.map((s, k) => [s.id, k]));
  const byId = new Map(sorted.map((s) => [s.id, s]));
  const ownerOf = (d: string): LineStop | null => {
    const night = sorted
      .filter((s) => s.arriveDate <= d && d < s.departDate)
      .reduce<LineStop | null>((best, s) => (!best || s.arriveDate > best.arriveDate ? s : best), null);
    return night ?? sorted.find((s) => s.departDate === d) ?? null;
  };
  const owners = i.days.map(ownerOf);
  const segments: StopLineSegment[] = [];
  let k = 0;
  while (k < owners.length) {
    const o = owners[k];
    let end = k;
    while (end + 1 < owners.length && (owners[end + 1]?.id ?? null) === (o?.id ?? null)) end++;
    const span = end - k + 1;
    if (o) {
      segments.push({ kind: "stop", name: o.name, startIndex: k, span, hueIndex: hue.get(o.id) ?? 0 });
    } else {
      const prev = k > 0 ? owners[k - 1] : null;
      const next = end + 1 < owners.length ? owners[end + 1] : null;
      const leg = coveringLeg(prev, next, i.transports);
      segments.push({ kind: "gap", startIndex: k, span, mode: leg?.mode ?? null, label: leg ? legLabel(leg, byId, i.homeName) : null });
    }
    k = end + 1;
  }
  return { homeStart: i.homeName, homeEnd: i.homeName && i.roundTrip ? i.homeName : null, segments };
}
```

- [ ] **Step 4: Feed it from the loader.** In `lib/day-view-loader.ts`:
  - Replace the `citySegments,` import with `stopLine,` and change the `CitySegment` type import to `StopLine`.
  - Add `roundTrip: true` to the `db.trip.findUnique` select in `getDay`.
  - Change `strip: { dates: …; segments: CitySegment[] }` in `DayViewData` to `strip: { dates: Array<{ iso: string; count: number; isCurrent: boolean; isToday: boolean }>; line: StopLine };`.
  - Replace the `segments: citySegments(…)` property of `strip` with:

```ts
    line: stopLine({
      days: windowDates,
      stops: stops.map((s) => ({ id: s.id, name: s.name, arriveDate: s.arriveDate!, departDate: s.departDate!, sortOrder: s.sortOrder })),
      transports: transports.map((t) => ({
        fromStopId: t.fromStopId,
        toStopId: t.toStopId,
        depPlace: t.depPlace,
        arrPlace: t.arrPlace,
        depIsHome: t.depIsHome,
        arrIsHome: t.arrIsHome,
        mode: t.mode as TransportMode,
      })),
      homeName: trip.homeName,
      roundTrip: trip.roundTrip ?? true,
    }),
```

- [ ] **Step 5: Draw it in the strip.** In `components/trip/day/day-strip.tsx`:
  - Change the import to `import { dotsFor, type StopLine } from "@/lib/day-view-model";` and add `import { TRANSPORT_MODE_META } from "@/lib/transport";`.
  - Change the props type `segments: CitySegment[]` to `line: StopLine`, and destructure `line` in place of `segments`.
  - Replace the whole `{!phone && segments.length > 0 ? ( … ) : null}` block with:

```tsx
        {!phone && line.segments.length > 0 ? (
          <div className="grid w-max gap-2" style={{ gridTemplateColumns: `repeat(${n}, 3.5rem)` }} aria-hidden="true">
            {line.segments.map((s, i) => {
              const first = i === 0;
              const last = i === line.segments.length - 1;
              const Icon = s.kind === "gap" && s.mode ? TRANSPORT_MODE_META[s.mode].icon : null;
              return (
                <div
                  key={`${s.kind}-${s.startIndex}`}
                  data-line-segment={s.kind}
                  className="flex min-w-0 items-center gap-1.5"
                  style={{ gridColumn: `${s.startIndex + 1} / span ${s.span}` }}
                >
                  {first && line.homeStart ? (
                    <>
                      {/* The Home base, by name, styled like a Stop's dot (never "Home" — CONTEXT.md). */}
                      <span data-home-dot className="size-2 shrink-0 rounded-full border border-border bg-muted-foreground" />
                      <span className="truncate text-xs font-bold text-foreground">{line.homeStart}</span>
                    </>
                  ) : null}
                  {s.kind === "stop" ? (
                    <>
                      <span className={cn("size-2 shrink-0 rounded-full border border-border", stopDotClass(s.hueIndex))} />
                      <span className="truncate text-xs font-bold text-foreground">{s.name}</span>
                      <span className="h-0.5 min-w-2 flex-1 rounded-full bg-border-soft" />
                    </>
                  ) : (
                    <>
                      {Icon ? <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
                      {s.label ? <span className="truncate text-xs font-bold text-muted-foreground">{s.label}</span> : null}
                      <span data-line-dashed className="h-0 min-w-2 flex-1 border-t-2 border-dashed border-border-soft" />
                    </>
                  )}
                  {last && line.homeEnd ? (
                    <>
                      <span data-home-dot className="size-2 shrink-0 rounded-full border border-border bg-muted-foreground" />
                      <span className="truncate text-xs font-bold text-foreground">{line.homeEnd}</span>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
```

- [ ] **Step 6: Wire the page.** In `app/(app)/trips/[tripId]/day/[date]/page.tsx`, change both `segments={d.strip.segments}` to `line={d.strip.line}`.

- [ ] **Step 7: Run the tests to verify they pass.**

Run: `TZ=UTC npx vitest run lib/day-view-model.test.ts lib/day-view-loader.test.ts components/trip/day "app/(app)/trips/[tripId]/day" && npx tsc --noEmit -p .`
Expected: PASS, and tsc exits 0. `grep -rn "citySegments\|CitySegment" app components lib` prints nothing.

- [ ] **Step 8: Commit.**

```bash
git add lib/day-view-model.ts lib/day-view-model.test.ts lib/day-view-loader.ts lib/day-view-loader.test.ts components/trip/day/day-strip.tsx components/trip/day/day-strip.test.tsx "app/(app)/trips/[tripId]/day/[date]/page.tsx" "app/(app)/trips/[tripId]/day/[date]/page.test.tsx"
git commit -m "$(cat <<'EOF'
feat(day): stop line runs Home base to Home base and through Gap days

Resolves-Feedback: cmum83ffz000004jnnl2w95au
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Add stop and Chapters live in the Plan aside on desktop (P2)

**Files:**
- Create: `lib/plan-aside.ts`
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx` (aside, ~lines 477–495)
- Test: `app/(app)/trips/[tripId]/plan/page.test.tsx`
- Modify: `components/trip/itinerary-manager.tsx` (footer row ~2138–2205; new portal)
- Test: `components/trip/itinerary-manager.test.tsx`

**Interfaces:**
- Produces: `export const PLAN_ASIDE_ACTIONS_ID = "plan-aside-actions";` in `lib/plan-aside.ts`.

The aside is server-rendered by the page, but the Add stop dialog state and the Chapters handlers live in the client `ItineraryManager`. So the page renders an empty slot (`hidden lg:block`) directly below `PlanOverview`, and `ItineraryManager` portals the two controls into it. The in-flow copies get `lg:hidden` only once the slot exists. With no Stops there is no aside and no slot, so the controls stay in the flow (the empty plan and chapters-only plans are unchanged). Both copies call the same `setAddStopOpen(true)`, so Add stop still appends at the end.

- [ ] **Step 1: Write the failing tests.** In `app/(app)/trips/[tripId]/plan/page.test.tsx`, inside `describe("Plan overview sticky aside (LA-038)", …)`, add:

```tsx
  it("renders the desktop actions slot directly below the overview inside the sticky aside (spec 2026-09-29 P2)", async () => {
    mockDb.stop.findMany.mockResolvedValue([STOP]);
    const div = await renderPlan();
    const marker = div.querySelector('[data-testid="plan-overview-marker"]') as HTMLElement;
    const slot = div.querySelector("#plan-aside-actions") as HTMLElement;
    expect(slot).not.toBeNull();
    expect(marker.nextElementSibling).toBe(slot);
    expect(slot.className).toContain("hidden");
    expect(slot.className).toContain("lg:block");
  });
  it("no Stops → no aside, so no actions slot", async () => {
    const div = await renderPlan();
    expect(div.querySelector("#plan-aside-actions")).toBeNull();
  });
```

In `components/trip/itinerary-manager.test.tsx`, add at the end:

```tsx
describe("Add stop + Chapters in the Plan aside (spec 2026-09-29 P2)", () => {
  function withSlot() {
    const slot = document.createElement("div");
    slot.id = "plan-aside-actions";
    document.body.appendChild(slot);
    return slot;
  }
  afterEach(() => document.getElementById("plan-aside-actions")?.remove());

  it("portals a primary Add stop and the Chapters menu into the aside; the in-flow copies are lg:hidden", async () => {
    const slot = withSlot();
    render(<ItineraryManager {...baseProps} initialStops={[makeStop({ id: "s1" })]} />);
    const asideAdd = await within(slot).findByRole("button", { name: /add stop/i });
    expect(within(slot).getByRole("button", { name: /chapters/i })).toBeInTheDocument();
    const flow = document.querySelector('[data-slot="plan-flow-actions"]') as HTMLElement;
    expect(flow.className).toContain("lg:hidden");
    expect(within(flow).getByRole("button", { name: /add stop/i })).not.toBe(asideAdd);
    // Add stop comes first in the aside.
    expect(asideAdd.compareDocumentPosition(within(slot).getByRole("button", { name: /chapters/i })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the aside Add stop opens the same Add Stop dialog", async () => {
    const user = userEvent.setup();
    const slot = withSlot();
    render(<ItineraryManager {...baseProps} initialStops={[makeStop({ id: "s1" })]} />);
    await user.click(await within(slot).findByRole("button", { name: /add stop/i }));
    expect(await screen.findByRole("dialog", { name: /add stop/i })).toBeInTheDocument();
  });

  it("without the aside slot (phone layout, or no Stops) the controls stay in the flow, visible", () => {
    render(<ItineraryManager {...baseProps} initialStops={[makeStop({ id: "s1" })]} />);
    const flow = document.querySelector('[data-slot="plan-flow-actions"]') as HTMLElement;
    expect(flow.className).not.toContain("lg:hidden");
    expect(within(flow).getByRole("button", { name: /add stop/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**

Run: `TZ=UTC npx vitest run "app/(app)/trips/[tripId]/plan/page.test.tsx" components/trip/itinerary-manager.test.tsx`
Expected: FAIL. There is no `#plan-aside-actions` and no `plan-flow-actions`.

- [ ] **Step 3: Create `lib/plan-aside.ts`:**

```ts
/**
 * The element id of the Plan aside's action slot (spec 2026-09-29 P2). The
 * plan page renders the empty slot below the Plan overview; ItineraryManager
 * portals Add stop and the Chapters menu into it. Shared so the server page
 * and the client component cannot drift.
 */
export const PLAN_ASIDE_ACTIONS_ID = "plan-aside-actions";
```

- [ ] **Step 4: Render the slot.** In `app/(app)/trips/[tripId]/plan/page.tsx`, add `import { PLAN_ASIDE_ACTIONS_ID } from "@/lib/plan-aside";`. Directly after the `<PlanOverview … />` element inside `PLAN_ASIDE_CLASS`, add:

```tsx
            {/* Desktop only: ItineraryManager portals Add stop + Chapters here (spec 2026-09-29 P2). */}
            <div id={PLAN_ASIDE_ACTIONS_ID} data-slot="plan-aside-actions" className="hidden lg:block" />
```

- [ ] **Step 5: Portal the controls.** In `components/trip/itinerary-manager.tsx`:
  - Add the imports `import { createPortal } from "react-dom";`, `import { cn } from "@/lib/cn";` and `import { PLAN_ASIDE_ACTIONS_ID } from "@/lib/plan-aside";`.
  - After `const hasContent = hasStops || hasChapters;`, add:

```ts
  // The Plan aside's action slot (spec 2026-09-29 P2) exists only when the page
  // renders an aside (it has Stops). Found after mount; re-checked when Stops
  // come or go.
  const [asideSlot, setAsideSlot] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setAsideSlot(document.getElementById(PLAN_ASIDE_ACTIONS_ID));
  }, [hasStops]);
```

  - Move the existing `<DropdownMenu>…</DropdownMenu>` (Chapters) and the `<Button variant="outline" size="md" onClick={() => setAddStopOpen(true)}>…Add Stop</Button>` out of the footer JSX into two render helpers defined just before `return (`. Keep their contents exactly:

```tsx
  const chaptersMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="md">
          <BookOpen className="size-4" aria-hidden="true" />
          Chapters
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={TAB_BAR_MENU_COLLISION_PADDING}>
        {chaptersEnabled ? (
          <>
            <DropdownMenuItem onSelect={handleNewChapter}>
              <BookOpen className="size-4" aria-hidden="true" />
              New Chapter
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleSuggestChapters} disabled={isSuggesting}>
              <Wand2 className="size-4" aria-hidden="true" />
              Suggest from countries
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleToggleChapters} disabled={pendingId === "chapters-toggle"}>
              Turn off chapters
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onSelect={handleToggleChapters} disabled={pendingId === "chapters-toggle"}>
            Group into chapters…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const addStopButton = (variant: "outline" | "primary", className?: string) => (
    <Button variant={variant} size="md" className={className} onClick={() => setAddStopOpen(true)}>
      <Plus className="size-4" aria-hidden="true" />
      Add Stop
    </Button>
  );
```

  - In the footer's `<div className="flex flex-wrap items-center gap-2 …">`, keep the "Firm up the whole trip" button where it is, and replace the two moved elements with:

```tsx
              <div data-slot="plan-flow-actions" className={cn("flex flex-wrap items-center gap-2", asideSlot && "lg:hidden")}>
                {chaptersMenu}
                {addStopButton("outline")}
              </div>
```

  - Directly after the footer row's closing `</div>` (still inside the `DndContext` branch), add:

```tsx
          {asideSlot
            ? createPortal(
                <div data-slot="plan-aside-actions-content" className="flex flex-col gap-2">
                  {addStopButton("primary", "w-full")}
                  {chaptersMenu}
                </div>,
                asideSlot,
              )
            : null}
```

- [ ] **Step 6: Run the tests to verify they pass.**

Run: `TZ=UTC npx vitest run "app/(app)/trips/[tripId]/plan" components/trip/itinerary-manager.test.tsx && npx tsc --noEmit -p .`
Expected: PASS (including the existing "bottom action row (LA-008)" test: Add Stop's parent `plan-flow-actions` has `flex-wrap`), and tsc exits 0.

- [ ] **Step 7: Commit.**

```bash
git add lib/plan-aside.ts "app/(app)/trips/[tripId]/plan/page.tsx" "app/(app)/trips/[tripId]/plan/page.test.tsx" components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "$(cat <<'EOF'
feat(plan): Add stop and Chapters sit in the sticky Plan aside on desktop

Resolves-Feedback: cmum87uqs000004lf1l401538
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Trip slugs — derivation, `tripPath`, schema, migration, store

**Files:**
- Create: `lib/trip-slug.ts`, `lib/trip-slug.test.ts`
- Create: `lib/trip-path.ts`, `lib/trip-path.test.ts`
- Modify: `prisma/schema.prisma` (`model Trip`; new `model TripSlug`)
- Create: `prisma/migrations/20260929000000_trip_slug/migration.sql`
- Create: `lib/trip-slug-store.ts`
- Create: `test/integration/trip-slug.test.ts`

**Interfaces:**
- Produces (pure, `lib/trip-slug.ts`): `SLUG_MAX = 60`; `RESERVED_TRIP_SLUGS: ReadonlySet<string>` (= `{"new"}`); `slugifyTripName(name: string): string`; `withSuffix(base: string, n: number): string`; `slugCandidates(base: string, from: number, count: number): string[]` (reserved words skipped).
- Produces (pure, `lib/trip-path.ts`): `tripPath(ref: string, sub?: string): string`, where `ref` is the Trip's slug (or its id as a fallback) and `sub` is `""` or starts with `/`, `?` or `#`.
- Produces (DB, `lib/trip-slug-store.ts`): `type SlugTx = Pick<Prisma.TransactionClient, "trip" | "tripSlug">`; `assignTripSlug(tx: SlugTx, tripId: string, name: string): Promise<string>`.
- Schema: `Trip.slug String? @unique`; `TripSlug { slug String @id; tripId String?; createdAt DateTime }`. The Prisma client delegate is `db.tripSlug`.

`Trip.slug` is nullable on purpose (DEPLOY.md §4b). The previous build keeps serving during `prisma migrate deploy && next build`, and its trip INSERT does not write `slug`. Every write path in this build sets it (Task 9). A Trip left without a slug falls back to its id in links, which still work. `TripSlug.tripId` is `ON DELETE SET NULL`, so a deleted Trip's slugs stay reserved forever and an old address can never point at a different Trip (ADR 0064).

- [ ] **Step 1: Write the failing unit tests.** Create `lib/trip-slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { slugifyTripName, withSuffix, slugCandidates, SLUG_MAX, RESERVED_TRIP_SLUGS } from "./trip-slug";

describe("slugifyTripName (ADR 0064, review focus 3)", () => {
  it("lowercases, strips accents, collapses non-alphanumeric runs to single hyphens and trims", () => {
    expect(slugifyTripName("Christmas in Europe 2026")).toBe("christmas-in-europe-2026");
    expect(slugifyTripName("  Côte d'Azur — été!! ")).toBe("cote-d-azur-ete");
    expect(slugifyTripName("São Paulo & Zürich")).toBe("sao-paulo-zurich");
  });
  it("is 'trip' when nothing usable remains", () => {
    expect(slugifyTripName("🌴🌴")).toBe("trip");
    expect(slugifyTripName("---")).toBe("trip");
    expect(slugifyTripName("")).toBe("trip");
  });
  it("caps at 60 characters with no trailing hyphen", () => {
    const s = slugifyTripName(`${"a".repeat(59)} b`);
    expect(s.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(s.endsWith("-")).toBe(false);
    expect(s).toBe("a".repeat(59));
  });
});

describe("withSuffix / slugCandidates", () => {
  it("n = 1 is the base; clashes take -2, -3…", () => {
    expect(withSuffix("paris", 1)).toBe("paris");
    expect(withSuffix("paris", 2)).toBe("paris-2");
    expect(slugCandidates("paris", 1, 3)).toEqual(["paris", "paris-2", "paris-3"]);
  });
  it("a suffix never pushes a slug past 60 characters", () => {
    const base = "a".repeat(60);
    expect(withSuffix(base, 2)).toBe(`${"a".repeat(58)}-2`);
    expect(withSuffix(base, 12).length).toBe(SLUG_MAX);
  });
  it("'new' is reserved: the name 'New' starts at new-2", () => {
    expect(RESERVED_TRIP_SLUGS.has("new")).toBe(true);
    expect(slugifyTripName("New")).toBe("new");
    // Reserved words are dropped from the batch, so 3 slots yield 2 candidates.
    expect(slugCandidates("new", 1, 3)).toEqual(["new-2", "new-3"]);
  });
});
```

Create `lib/trip-path.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tripPath } from "./trip-path";

describe("tripPath (ADR 0064)", () => {
  it("builds the Trip's root and its sub-pages", () => {
    expect(tripPath("christmas-in-europe-2026")).toBe("/trips/christmas-in-europe-2026");
    expect(tripPath("christmas-in-europe-2026", "/day/2026-12-26")).toBe("/trips/christmas-in-europe-2026/day/2026-12-26");
    expect(tripPath("x", "?plan=f1")).toBe("/trips/x?plan=f1");
    expect(tripPath("x", "#stop-s1")).toBe("/trips/x#stop-s1");
  });
  it("encodes the ref (an id fallback is always safe too)", () => {
    expect(tripPath("a/b", "/plan")).toBe("/trips/a%2Fb/plan");
    expect(tripPath("cmtw8sgpw0001osqh3i54rx1o")).toBe("/trips/cmtw8sgpw0001osqh3i54rx1o");
  });
  it("rejects a sub path that would glue onto the ref", () => {
    expect(() => tripPath("x", "plan")).toThrow(/must start with/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**

Run: `TZ=UTC npx vitest run lib/trip-slug.test.ts lib/trip-path.test.ts`
Expected: FAIL. The modules cannot be resolved.

- [ ] **Step 3: Create `lib/trip-slug.ts`:**

```ts
/**
 * A Trip's URL slug, derived from its name (ADR 0064): lowercase, accents
 * stripped, non-alphanumeric runs → single "-", trimmed, ≤ 60 chars, "trip"
 * if empty. Unique app-wide: a clash takes the next free "-2", "-3"…; "new"
 * is reserved (/trips/new is a static route). Pure — the DB side is
 * lib/trip-slug-store.ts.
 */
export const SLUG_MAX = 60;
export const RESERVED_TRIP_SLUGS: ReadonlySet<string> = new Set(["new"]);

export function slugifyTripName(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return s || "trip";
}

/** n = 1 → the base; n ≥ 2 → base-n, the base shortened so the whole stays ≤ 60. */
export function withSuffix(base: string, n: number): string {
  if (n <= 1) return base;
  const tail = `-${n}`;
  return `${base.slice(0, SLUG_MAX - tail.length).replace(/-+$/g, "")}${tail}`;
}

/** `count` candidates starting at suffix `from`, in order, reserved words left out. */
export function slugCandidates(base: string, from: number, count: number): string[] {
  return Array.from({ length: count }, (_, k) => withSuffix(base, from + k)).filter((c) => !RESERVED_TRIP_SLUGS.has(c));
}
```

- [ ] **Step 4: Create `lib/trip-path.ts`:**

```ts
/**
 * The one way to build an internal Trip page URL (ADR 0064). A test fails on
 * hand-built `/trips/${…}` links anywhere else (lib/trip-links.guard.test.ts).
 *
 * `ref` is the Trip's current slug. When no slug is known — a Trip created by
 * the previous build during a deploy's migrate-then-build window — pass its id:
 * the proxy redirects a member from an id to the slug, so a fallback costs one
 * hop and never breaks. `sub` is "" or starts with "/", "?" or "#".
 *
 * Not for `revalidatePath`: that takes the rewrite's destination (the id path),
 * and not for `/api/trips/[tripId]/…` routes, which stay on ids.
 */
export function tripPath(ref: string, sub = ""): string {
  if (sub !== "" && !/^[/?#]/.test(sub)) {
    throw new Error(`tripPath: sub must start with "/", "?" or "#" (got "${sub}")`);
  }
  return `/trips/${encodeURIComponent(ref)}${sub}`;
}
```

- [ ] **Step 5: Run the unit tests to verify they pass.**

Run: `TZ=UTC npx vitest run lib/trip-slug.test.ts lib/trip-path.test.ts`
Expected: PASS.

- [ ] **Step 6: Schema.** In `prisma/schema.prisma`, inside `model Trip`, add after `homeCurrency`:

```prisma
  // URL slug from the name (ADR 0064). Nullable only so the previous build's
  // INSERTs keep working during the migrate-then-build window (DEPLOY.md §4b);
  // every write path in this build sets it. History: TripSlug.
  slug String? @unique
```

and in Trip's relation list add `slugHistory TripSlug[]`. After `model Trip { … }`, add:

```prisma
// Every slug a Trip has ever had (its current one included), so an old address
// keeps resolving and no other Trip can ever take it (ADR 0064). A deleted
// Trip's rows stay (tripId → NULL): its slugs remain reserved.
model TripSlug {
  slug      String   @id
  tripId    String?
  trip      Trip?    @relation(fields: [tripId], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())

  @@index([tripId])
}
```

- [ ] **Step 7: Hand-write the migration.** Create `prisma/migrations/20260929000000_trip_slug/migration.sql`:

```sql
-- Trip URL slugs (ADR 0064).
--
-- Additive on the read path AND the write path (docs/DEPLOY.md §4b):
-- "slug" is nullable, so the still-running old build — whose trip INSERT does
-- not write it — cannot violate a NOT NULL constraint during the migrate-then-
-- build window. TripSlug is a new table the old build never touches. Nothing
-- is renamed, dropped, or newly constrained on an existing column. A Trip the
-- old build creates in that window has a NULL slug; links fall back to its id
-- (lib/trip-path.ts) until it is next renamed. Tightening to NOT NULL is a
-- separate, later migration.
--
-- Backfill: one slug per existing Trip, oldest first, with the same shape as
-- lib/trip-slug.ts (accents via translate(), so a character NFD does not
-- decompose — ø, ß — may differ from what a rename would derive; a backfilled
-- slug only has to be valid and unique). A PL/pgSQL loop, not a window
-- function, so a clash with a natural "-2" name can never abort the migration.

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "slug" TEXT;

-- CreateTable
CREATE TABLE "TripSlug" (
    "slug" TEXT NOT NULL,
    "tripId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripSlug_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "TripSlug_tripId_idx" ON "TripSlug"("tripId");

-- AddForeignKey
ALTER TABLE "TripSlug" ADD CONSTRAINT "TripSlug_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill
DO $$
DECLARE
  r RECORD;
  base TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR r IN SELECT "id", "name" FROM "Trip" ORDER BY "createdAt", "id" LOOP
    base := lower(translate(r."name",
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿÑñÇç',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuYyyNnCc'));
    base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
    base := trim(both '-' from base);
    base := trim(trailing '-' from left(base, 60));
    IF base = '' THEN base := 'trip'; END IF;
    candidate := base;
    n := 1;
    WHILE candidate = 'new' OR EXISTS (SELECT 1 FROM "TripSlug" WHERE "slug" = candidate) LOOP
      n := n + 1;
      candidate := trim(trailing '-' from left(base, 60 - length(n::text) - 1)) || '-' || n::text;
    END LOOP;
    INSERT INTO "TripSlug" ("slug", "tripId") VALUES (candidate, r."id");
    UPDATE "Trip" SET "slug" = candidate WHERE "id" = r."id";
  END LOOP;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "Trip_slug_key" ON "Trip"("slug");
```

- [ ] **Step 8: Apply it to the local database only.**

Run: `npx prisma migrate status`
Expected: a line `Datasource "db": PostgreSQL database "trip", schema "public" at "host.docker.internal:5432"`. **If the host is anything else, stop here and report back. Do not run the next command.**

Run: `npx prisma migrate deploy && npx prisma generate && npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
Expected: `1 migration applied` (or "All migrations have been successfully applied"), then `-- This is an empty migration.` (the hand-written SQL matches the schema exactly). If the diff prints SQL, fix the migration's names or types to match, reset only the local DB (`npx prisma migrate reset --force --skip-seed`, again only after the host check), and repeat this step.

- [ ] **Step 9: Write the integration test.** Create `test/integration/trip-slug.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { assignTripSlug } from "@/lib/trip-slug-store";

// Real Postgres (INTEGRATION=1, local docker DB). Review focus 3.
const USER = "it-slug-user";
const IDS = ["it-slug-a", "it-slug-b", "it-slug-c"];

async function makeTrip(id: string, name: string) {
  await db.trip.create({ data: { id, name, homeCurrency: "AUD", createdById: USER } });
  return db.$transaction((tx) => assignTripSlug(tx, id, name));
}

describe.skipIf(process.env.INTEGRATION !== "1")("assignTripSlug (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "slug@example.test", name: "Slug IT" } });
  });
  beforeEach(async () => {
    await db.tripSlug.deleteMany({ where: { slug: { startsWith: "it-slug-" } } });
    await db.trip.deleteMany({ where: { id: { in: IDS } } });
  });
  afterAll(async () => {
    await db.tripSlug.deleteMany({ where: { slug: { startsWith: "it-slug-" } } });
    await db.trip.deleteMany({ where: { id: { in: IDS } } });
  });

  it("derives from the name and records the slug in history", async () => {
    expect(await makeTrip("it-slug-a", "IT Slug Paris")).toBe("it-slug-paris");
    expect((await db.trip.findUnique({ where: { id: "it-slug-a" } }))?.slug).toBe("it-slug-paris");
    expect((await db.tripSlug.findUnique({ where: { slug: "it-slug-paris" } }))?.tripId).toBe("it-slug-a");
  });

  it("a clash takes -2", async () => {
    await makeTrip("it-slug-a", "IT Slug Paris");
    expect(await makeTrip("it-slug-b", "IT Slug Paris")).toBe("it-slug-paris-2");
  });

  it("a rename re-derives; the old slug stays in history and no other Trip can take it", async () => {
    await makeTrip("it-slug-a", "IT Slug Paris");
    await db.trip.update({ where: { id: "it-slug-a" }, data: { name: "IT Slug Rome" } });
    expect(await db.$transaction((tx) => assignTripSlug(tx, "it-slug-a", "IT Slug Rome"))).toBe("it-slug-rome");
    expect(await makeTrip("it-slug-b", "IT Slug Paris")).toBe("it-slug-paris-2");
  });

  it("renaming back to an own old slug reuses it", async () => {
    await makeTrip("it-slug-a", "IT Slug Paris");
    await db.$transaction((tx) => assignTripSlug(tx, "it-slug-a", "IT Slug Rome"));
    expect(await db.$transaction((tx) => assignTripSlug(tx, "it-slug-a", "IT Slug Paris"))).toBe("it-slug-paris");
    expect(await db.tripSlug.count({ where: { tripId: "it-slug-a" } })).toBe(2);
  });

  it("a deleted Trip's slugs stay reserved", async () => {
    await makeTrip("it-slug-a", "IT Slug Paris");
    await db.trip.delete({ where: { id: "it-slug-a" } });
    expect((await db.tripSlug.findUnique({ where: { slug: "it-slug-paris" } }))?.tripId).toBeNull();
    expect(await makeTrip("it-slug-b", "IT Slug Paris")).toBe("it-slug-paris-2");
  });
});
```

- [ ] **Step 10: Run it to verify it fails.**

Run: `INTEGRATION=1 npm run test:integration -- test/integration/trip-slug.test.ts`
Expected: FAIL. `@/lib/trip-slug-store` cannot be resolved.

- [ ] **Step 11: Create `lib/trip-slug-store.ts`:**

```ts
import type { Prisma } from "@prisma/client";
import { slugCandidates, slugifyTripName } from "@/lib/trip-slug";

/** The two delegates the store touches — a transaction client, or `db` itself. */
export type SlugTx = Pick<Prisma.TransactionClient, "trip" | "tripSlug">;

const BATCH = 20;

/**
 * Give a Trip the slug its name derives to, or the first free "-n" (ADR 0064).
 * A candidate is free when nobody has ever held it, or this Trip has (renaming
 * back reuses an own old slug). A slug another Trip holds — or once held, even
 * if that Trip was since renamed or deleted — is never taken. The slug is
 * recorded in TripSlug and set on the Trip. Returns it.
 *
 * Concurrency: two Trips racing for one candidate both see it free; the insert
 * is ON CONFLICT DO NOTHING (skipDuplicates), so the loser inserts nothing,
 * re-reads the owner, and moves on to the next candidate — no error aborts
 * the surrounding transaction.
 */
export async function assignTripSlug(tx: SlugTx, tripId: string, name: string): Promise<string> {
  const base = slugifyTripName(name);
  for (let from = 1; ; from += BATCH) {
    const candidates = slugCandidates(base, from, BATCH);
    const rows = await tx.tripSlug.findMany({ where: { slug: { in: candidates } }, select: { slug: true, tripId: true } });
    const owner = new Map(rows.map((r) => [r.slug, r.tripId]));
    for (const slug of candidates) {
      if (owner.has(slug) && owner.get(slug) !== tripId) continue;
      if (!owner.has(slug)) {
        const { count } = await tx.tripSlug.createMany({ data: [{ slug, tripId }], skipDuplicates: true });
        if (count === 0) {
          const now = await tx.tripSlug.findUnique({ where: { slug }, select: { tripId: true } });
          if (now?.tripId !== tripId) continue;
        }
      }
      await tx.trip.update({ where: { id: tripId }, data: { slug } });
      return slug;
    }
  }
}
```

- [ ] **Step 12: Run everything to verify it passes.**

Run: `INTEGRATION=1 npm run test:integration && TZ=UTC npx vitest run lib/trip-slug.test.ts lib/trip-path.test.ts && npx tsc --noEmit -p .`
Expected: all integration tests PASS (the existing locking test included), the unit tests PASS, and tsc exits 0.

- [ ] **Step 13: Commit.**

```bash
git add lib/trip-slug.ts lib/trip-slug.test.ts lib/trip-path.ts lib/trip-path.test.ts lib/trip-slug-store.ts prisma/schema.prisma prisma/migrations/20260929000000_trip_slug test/integration/trip-slug.test.ts
git commit -m "$(cat <<'EOF'
feat(trips): name slugs with history, tripPath helper, backfill migration

ADR 0064. Slug nullable for the deploy window (DEPLOY.md 4b).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Slugs on create, rename and duplicate

**Files:**
- Modify: `server/actions/trips.ts` (`createTrip` ~33–103, `updateTrip` ~119–200, `duplicateTrip` ~307–457)
- Test: `server/actions/trips.test.ts`
- Modify: `components/trip/settings/trip-details-form.tsx`, test `components/trip/settings/trip-details-form.test.tsx`
- Modify: `components/trip/duplicate-trip-dialog.tsx` (~line 66)
- Modify: `prisma/seed.ts` (~line 49), `prisma/demo/persist.ts` (~line 320), `prisma/real/persist.ts` (~line 154)

**Interfaces:**
- Consumes: `assignTripSlug` (Task 8), `tripPath` (Task 8).
- Produces: `UpdateTripResult = ActionResult<{ slug?: string }>`, where a successful save returns the Trip's current slug. `DuplicateTripResult` success gains `slug: string`. `createTrip` redirects to `tripPath(slug)`.

- [ ] **Step 1: Write the failing tests.** In `server/actions/trips.test.ts`:
  - Add `assignTripSlugMock: vi.fn().mockResolvedValue("japan-2026"),` to the object returned by `vi.hoisted`, include `assignTripSlugMock` in the destructuring at the top, and add after the other `vi.mock` calls:

```ts
vi.mock("@/lib/trip-slug-store", () => ({ assignTripSlug: assignTripSlugMock }));
```

  - `createTrip` tests: the three `expect(redirectMock).toHaveBeenCalledWith(\`/trips/${newTrip.id}\`);` lines (~258, ~333, ~374) become `expect(redirectMock).toHaveBeenCalledWith("/trips/japan-2026");` (the mock's default). In the first test, also add above that line:

```ts
    // The slug is assigned inside the same transaction, then the redirect uses it.
    expect(assignTripSlugMock).toHaveBeenCalledWith(expect.anything(), "trip-123", "Japan 2026");
```

  - `duplicateTrip` tests: the four `expect(result).toEqual({ success: true, tripId: "new" });` lines (~830, ~882, ~904, ~958) become `expect(result).toEqual({ success: true, tripId: "new", slug: "japan-2026" });`. In the first duplicate test (~794, "creates a new trip + owner membership…"), change the call and that assertion to:

```ts
    assignTripSlugMock.mockResolvedValueOnce("copy-of-europe-2026");
    const result = await duplicateTrip("src", "Copy of Europe 2026");

    expect(result).toEqual({ success: true, tripId: "new", slug: "copy-of-europe-2026" });
    // A fresh slug from the copy's own name (ADR 0018 + 0064).
    expect(assignTripSlugMock).toHaveBeenCalledWith(expect.anything(), "new", "Copy of Europe 2026");
```

  - Add to `describe("updateTrip", …)`:

```ts
  it("re-derives the slug from the saved name on every save and returns it (a rename moves it; an unchanged name keeps it)", async () => {
    tripUpdateMock.mockResolvedValue({});
    assignTripSlugMock.mockResolvedValueOnce("new-name");
    const res = await updateTrip(TRIP_ID, { ...VALID_INPUT, name: "New name" });
    expect(assignTripSlugMock).toHaveBeenCalledWith(expect.anything(), TRIP_ID, "New name");
    expect(res).toEqual({ success: true, slug: "new-name" });
  });

  it("assigns the slug after the name is written", async () => {
    tripUpdateMock.mockResolvedValue({});
    await updateTrip(TRIP_ID, VALID_INPUT);
    expect(tripUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(assignTripSlugMock.mock.invocationCallOrder[0]);
  });
```

  Keep the existing "No DB lookup for current homeName when key is absent" test untouched: re-deriving through the store needs no `trip.findUnique`.

In `components/trip/settings/trip-details-form.test.tsx`, add at the top (after the imports):

```ts
const replaceMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock }),
  usePathname: () => "/trips/old-name/settings",
}));
```

and a test:

```ts
  it("after a rename, moves the address bar to the new slug and refreshes the shell (ADR 0064)", async () => {
    updateMock.mockResolvedValueOnce({ success: true, slug: "new-name" });
    render(<TripDetailsForm tripId="t1" defaultValues={{ name: "New name", startDate: "2026-07-01", endDate: "2026-07-10", hardEndDate: "", homeCurrency: "AUD" }} />);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/trips/new-name/settings"));
    expect(refreshMock).toHaveBeenCalled();
  });
  it("does not navigate when the slug is unchanged", async () => {
    updateMock.mockResolvedValueOnce({ success: true, slug: "old-name" });
    render(<TripDetailsForm tripId="t1" defaultValues={{ name: "Old name", startDate: "2026-07-01", endDate: "2026-07-10", hardEndDate: "", homeCurrency: "AUD" }} />);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(replaceMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run them to verify they fail.**

Run: `TZ=UTC npx vitest run server/actions/trips.test.ts components/trip/settings/trip-details-form.test.tsx`
Expected: FAIL. `assignTripSlug` is never called, the redirect is to the id, and `updateTrip` returns no slug.

- [ ] **Step 3: Implement in `server/actions/trips.ts`.**
  - Add the imports `import { assignTripSlug } from "@/lib/trip-slug-store";` and `import { tripPath } from "@/lib/trip-path";`.
  - `createTrip`: change `const trip = await db.$transaction(async (tx) => {` to `const { trip, slug } = await db.$transaction(async (tx) => {`. Keep the existing `tx.trip.create(…)` and `tx.tripMember.create(…)` calls exactly as they are. Then replace the transaction's `return newTrip;` with:

```ts
    const slug = await assignTripSlug(tx, newTrip.id, name);
    return { trip: newTrip, slug };
```

  and replace `redirect(\`/trips/${trip.id}\`);` with `redirect(tripPath(slug));`.
  - `updateTrip`: change `export type UpdateTripResult = ActionResult;` to `export type UpdateTripResult = ActionResult<{ slug?: string }>;`. After the `db.trip.update(…)`, before `revalidatePath`, add:

```ts
  // Renaming re-derives the slug (ADR 0064). Re-deriving on every save is safe
  // and needs no extra read: an unchanged name maps to the slug this Trip
  // already owns (the store reuses own slugs), and a Trip created without one
  // during a deploy window gets one on its next save.
  const slug = await db.$transaction((tx) => assignTripSlug(tx, tripId, name));
```

  and change `return { success: true };` to `return { success: true, slug };`.
  - `duplicateTrip`: change `DuplicateTripResult` success to `{ success: true; tripId: string; slug: string }`. Inside the transaction, right after `const trip = await tx.trip.create(…)`, add `const slug = await assignTripSlug(tx, trip.id, name);`. Make the transaction return `{ trip, slug }` (destructure as `const { trip: newTrip, slug } = await db.$transaction(…)`), and return `{ success: true, tripId: newTrip.id, slug }`.

- [ ] **Step 4: Follow the new slug in the client.**
  - `components/trip/settings/trip-details-form.tsx`: add `import { usePathname, useRouter } from "next/navigation";` and `import { tripPath } from "@/lib/trip-path";`. In the component, add `const router = useRouter(); const pathname = usePathname();`. In the success branch of `handleSubmit`, add:

```ts
        // A rename moved the Trip to a new slug: put it in the address bar and
        // refresh so the shell's trip list (used by every link) picks it up.
        if (result.slug) {
          const next = tripPath(result.slug, "/settings");
          if (pathname !== next) {
            router.replace(next);
            router.refresh();
          }
        }
```

  - `components/trip/duplicate-trip-dialog.tsx`: add `import { tripPath } from "@/lib/trip-path";` and replace `router.push(\`/trips/${res.tripId}\`);` with `router.push(tripPath(res.slug));`.

- [ ] **Step 5: Seeds get slugs.** After each seeded trip is created, call the store.
  - `prisma/seed.ts`: add `import { assignTripSlug } from "../lib/trip-slug-store";` and after `const trip = await db.trip.upsert({ … });` add `await assignTripSlug(db, trip.id, trip.name);`.
  - `prisma/demo/persist.ts` and `prisma/real/persist.ts`: add `import { assignTripSlug } from "@/lib/trip-slug-store";` and after `const dbTrip = await db.trip.create({ … });` add `await assignTripSlug(db, dbTrip.id, dbTrip.name);`.

- [ ] **Step 6: Run the tests to verify they pass.**

Run: `TZ=UTC npx vitest run server/actions/trips.test.ts components/trip/settings "app/(app)/trips" && npx tsc --noEmit -p .`
Expected: PASS, and tsc exits 0. If an existing `updateTrip` test fails only because it asserts `toEqual({ success: true })`, update it to `toEqual({ success: true, slug: expect.any(String) })` or `toMatchObject({ success: true })`. That is the only acceptable adjustment.

- [ ] **Step 7: Commit.**

```bash
git add server/actions/trips.ts server/actions/trips.test.ts components/trip/settings/trip-details-form.tsx components/trip/settings/trip-details-form.test.tsx components/trip/duplicate-trip-dialog.tsx prisma/seed.ts prisma/demo/persist.ts prisma/real/persist.ts
git commit -m "$(cat <<'EOF'
feat(trips): assign slugs on create, rename and duplicate

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Resolve slugs once at the route boundary (proxy)

Relies on:
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` (Matcher; Node.js runtime is the default; `NextResponse.rewrite` / `redirect`; Server Functions are POSTs to the page route).
- `node_modules/next/dist/docs/01-app/02-guides/redirecting.md` ("`NextResponse.redirect` in Proxy", status 308 for permanent).
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md` ("Using revalidatePath with rewrites": pass the destination path, so the existing id-based calls stay correct).
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md` (on the client `usePathname` reads the browser URL; our trip pages are dynamic, not prerendered, so the rewrite hydration caveat does not apply).

A redirect from the `[tripId]` layout would not be a real 308. `app/(app)/trips/loading.tsx` wraps that segment, so the response has already started streaming by the time the layout runs, and ADR 0063 forbids moving the loading boundary. The proxy is therefore the boundary.

**Files:**
- Create: `lib/trip-route.ts`, `lib/trip-route.test.ts`
- Create: `lib/trip-ref.ts`
- Modify: `proxy.ts`, `proxy.test.ts`
- Test: `test/integration/trip-slug.test.ts` (append resolver cases)

**Interfaces:**
- Produces (pure): `interface ResolvedTripRef { id: string; slug: string | null }`. `type TripRouteDecision = { kind: "pass" } | { kind: "rewrite"; pathname: string } | { kind: "redirect"; location: string }`. `decideTripRoute(i: { pathname: string; search: string; method: string; resolve: (ref: string) => Promise<ResolvedTripRef | null>; isMember: (tripId: string) => Promise<boolean> }): Promise<TripRouteDecision>`.
- Produces (DB): `resolveTripRef(ref: string): Promise<ResolvedTripRef | null>` (current slug → history → id). `viewerIdFromRequest(req: NextRequest): Promise<string | null>` (decodes the Auth.js JWT cookie via `getToken`, no DB). `viewerIsTripMember(tripId: string, userId: string | null): Promise<boolean>`.
- `proxy.ts`: the existing guard is renamed `authCallbackCookieGuard(request): NextResponse`. `proxy` becomes async and dispatches by path. `config.matcher` = `["/api/auth/:path*", "/trips/:ref/:path*"]`.

Decision table (GET/HEAD unless stated):

| URL segment | Viewer | Result |
|---|---|---|
| `new`, or no trip segment | any | pass |
| unknown | any | pass → `[tripId]` layout's `requireTripAccess` → not-found (today's behaviour) |
| current slug | any | rewrite to `/trips/<id>/…` (a non-member then gets today's not-found) |
| old slug or cuid | member | **308** to `/trips/<current slug>/…?query` |
| old slug or cuid | non-member / signed out | rewrite (old slug) or pass (cuid) → today's not-found / sign-in redirect |
| old slug or cuid | POST (server action) | rewrite / pass, never redirect |
| cuid of a Trip with no slug yet | any | pass |

- [ ] **Step 1: Write the failing tests.** Create `lib/trip-route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { decideTripRoute, type ResolvedTripRef } from "./trip-route";

const TRIP: ResolvedTripRef = { id: "cmtw8sgpw0001osqh3i54rx1o", slug: "christmas-in-europe-2026" };
const byRef: Record<string, ResolvedTripRef> = {
  "christmas-in-europe-2026": TRIP,
  "xmas-2026": TRIP, // an old slug
  cmtw8sgpw0001osqh3i54rx1o: TRIP,
  "cmnoslug000000000000000000": { id: "cmnoslug000000000000000000", slug: null },
};
function run(pathname: string, o: { search?: string; method?: string; member?: boolean } = {}) {
  const resolve = vi.fn(async (ref: string) => byRef[ref] ?? null);
  const isMember = vi.fn(async () => o.member ?? true);
  return { resolve, isMember, result: decideTripRoute({ pathname, search: o.search ?? "", method: o.method ?? "GET", resolve, isMember }) };
}

describe("decideTripRoute (ADR 0064)", () => {
  it("the current slug rewrites to the id route, keeping the rest of the path", async () => {
    expect(await run("/trips/christmas-in-europe-2026/day/2026-12-26").result).toEqual({ kind: "rewrite", pathname: "/trips/cmtw8sgpw0001osqh3i54rx1o/day/2026-12-26" });
    expect(await run("/trips/christmas-in-europe-2026").result).toEqual({ kind: "rewrite", pathname: "/trips/cmtw8sgpw0001osqh3i54rx1o" });
  });
  it("a bare cuid redirects a member to the current slug, preserving path and query", async () => {
    expect(await run("/trips/cmtw8sgpw0001osqh3i54rx1o/plan", { search: "?plan=f1" }).result).toEqual({ kind: "redirect", location: "/trips/christmas-in-europe-2026/plan?plan=f1" });
  });
  it("an old slug redirects a member to the current slug", async () => {
    expect(await run("/trips/xmas-2026/day/2026-12-26").result).toEqual({ kind: "redirect", location: "/trips/christmas-in-europe-2026/day/2026-12-26" });
  });
  it("a non-member or signed-out visitor is never redirected — they get today's not-found (review focus 1)", async () => {
    expect(await run("/trips/xmas-2026/plan", { member: false }).result).toEqual({ kind: "rewrite", pathname: "/trips/cmtw8sgpw0001osqh3i54rx1o/plan" });
    expect(await run("/trips/cmtw8sgpw0001osqh3i54rx1o/plan", { member: false }).result).toEqual({ kind: "pass" });
  });
  it("a server action POST on an old address is rewritten, never redirected (review focus 2)", async () => {
    const r = run("/trips/xmas-2026/settings", { method: "POST" });
    expect(await r.result).toEqual({ kind: "rewrite", pathname: "/trips/cmtw8sgpw0001osqh3i54rx1o/settings" });
    expect(r.isMember).not.toHaveBeenCalled();
  });
  it("membership is only checked on the redirect path (the common case costs one lookup)", async () => {
    const r = run("/trips/christmas-in-europe-2026/plan");
    await r.result;
    expect(r.isMember).not.toHaveBeenCalled();
    expect(r.resolve).toHaveBeenCalledTimes(1);
  });
  it("unknown refs, /trips/new and non-trip paths pass through untouched", async () => {
    expect(await run("/trips/nope/plan").result).toEqual({ kind: "pass" });
    const n = run("/trips/new");
    expect(await n.result).toEqual({ kind: "pass" });
    expect(n.resolve).not.toHaveBeenCalled();
    expect(await run("/trips").result).toEqual({ kind: "pass" });
    expect(await run("/globe").result).toEqual({ kind: "pass" });
  });
  it("a Trip with no slug yet is served on its id with no redirect", async () => {
    expect(await run("/trips/cmnoslug000000000000000000/plan").result).toEqual({ kind: "pass" });
  });
  it("a malformed percent-encoding passes through (the route 404s as today)", async () => {
    expect(await run("/trips/%E0%A4%A/plan").result).toEqual({ kind: "pass" });
  });
});
```

In `proxy.test.ts`, change the import to `import { config, authCallbackCookieGuard as proxy } from "./proxy";`, and change the matcher test to:

```ts
  it("runs on the Auth.js routes and on trip pages (slug resolution, ADR 0064)", () => {
    expect(config.matcher).toEqual(["/api/auth/:path*", "/trips/:ref/:path*"]);
  });
```

Append to `test/integration/trip-slug.test.ts` (inside the `describe`), and add `import { resolveTripRef } from "@/lib/trip-ref";` at the top:

```ts
  it("resolveTripRef: current slug, old slug, id; a deleted Trip's old slug resolves to nothing", async () => {
    await makeTrip("it-slug-a", "IT Slug Paris");
    await db.$transaction((tx) => assignTripSlug(tx, "it-slug-a", "IT Slug Rome"));
    expect(await resolveTripRef("it-slug-rome")).toEqual({ id: "it-slug-a", slug: "it-slug-rome" });
    expect(await resolveTripRef("it-slug-paris")).toEqual({ id: "it-slug-a", slug: "it-slug-rome" });
    expect(await resolveTripRef("it-slug-a")).toEqual({ id: "it-slug-a", slug: "it-slug-rome" });
    expect(await resolveTripRef("it-slug-nope")).toBeNull();
    await db.trip.delete({ where: { id: "it-slug-a" } });
    expect(await resolveTripRef("it-slug-paris")).toBeNull();
  });
```

- [ ] **Step 2: Run them to verify they fail.**

Run: `TZ=UTC npx vitest run lib/trip-route.test.ts proxy.test.ts`
Expected: FAIL. `./trip-route` is missing, and `authCallbackCookieGuard` is not exported.

- [ ] **Step 3: Create `lib/trip-route.ts`:**

```ts
import { tripPath } from "@/lib/trip-path";
import { RESERVED_TRIP_SLUGS } from "@/lib/trip-slug";

/**
 * The route boundary's decision for a /trips/<ref>/… request (ADR 0064).
 * Pure: the proxy supplies `resolve` (DB) and `isMember` (session + DB).
 *
 * - Current slug → rewrite to the id route, so every page, loader, guard and
 *   server action keeps working in ids, and `revalidatePath` keeps taking the
 *   id path (a rewrite's destination).
 * - Old slug or bare cuid → 308 to the current slug, preserving the rest of
 *   the path and the query — only for a signed-in member on a GET/HEAD. Anyone
 *   else is served exactly as before (the layout's requireTripAccess 404s), so
 *   a slug confirms nothing a cuid did not; a POST (server action) is never
 *   redirected.
 */
export interface ResolvedTripRef {
  id: string;
  slug: string | null;
}

export type TripRouteDecision =
  | { kind: "pass" }
  | { kind: "rewrite"; pathname: string }
  | { kind: "redirect"; location: string };

const TRIP_PATH = /^\/trips\/([^/]+)(\/.*)?$/;

export async function decideTripRoute(i: {
  pathname: string;
  search: string;
  method: string;
  resolve: (ref: string) => Promise<ResolvedTripRef | null>;
  isMember: (tripId: string) => Promise<boolean>;
}): Promise<TripRouteDecision> {
  const m = TRIP_PATH.exec(i.pathname);
  if (!m) return { kind: "pass" };
  let ref: string;
  try {
    ref = decodeURIComponent(m[1]);
  } catch {
    return { kind: "pass" };
  }
  const rest = m[2] ?? "";
  if (RESERVED_TRIP_SLUGS.has(ref)) return { kind: "pass" };

  const trip = await i.resolve(ref);
  if (!trip) return { kind: "pass" };

  const isRead = i.method === "GET" || i.method === "HEAD";
  if (trip.slug && ref !== trip.slug && isRead && (await i.isMember(trip.id))) {
    return { kind: "redirect", location: `${tripPath(trip.slug, rest)}${i.search}` };
  }
  if (ref === trip.id) return { kind: "pass" };
  return { kind: "rewrite", pathname: tripPath(trip.id, rest) };
}
```

- [ ] **Step 4: Create `lib/trip-ref.ts`:**

```ts
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import type { ResolvedTripRef } from "@/lib/trip-route";

/**
 * DB side of the route boundary (ADR 0064), called from proxy.ts only.
 * Order: current slug (one indexed lookup — the common case), then slug
 * history, then the Trip's id (old cuid links). A history row whose Trip was
 * deleted resolves to nothing.
 */
export async function resolveTripRef(ref: string): Promise<ResolvedTripRef | null> {
  const current = await db.trip.findUnique({ where: { slug: ref }, select: { id: true, slug: true } });
  if (current) return current;
  const past = await db.tripSlug.findUnique({ where: { slug: ref }, select: { trip: { select: { id: true, slug: true } } } });
  if (past) return past.trip;
  return db.trip.findUnique({ where: { id: ref }, select: { id: true, slug: true } });
}

/**
 * The signed-in Traveller's id from the Auth.js JWT cookie (lib/auth.ts uses
 * the JWT strategy and puts the DB id on `token.id`). No DB, no next-auth
 * config import — keeps the proxy bundle small. Null when signed out or
 * unreadable; the page's own requireUser/requireTripAccess stay the real gate.
 */
export async function viewerIdFromRequest(req: NextRequest): Promise<string | null> {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie: req.nextUrl.protocol === "https:" });
  return typeof token?.id === "string" ? token.id : null;
}

export async function viewerIsTripMember(tripId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const m = await db.tripMember.findFirst({ where: { tripId, userId }, select: { userId: true } });
  return m != null;
}
```

- [ ] **Step 5: Wire the proxy.** In `proxy.ts`:
  - Rename `export function proxy(request: NextRequest): NextResponse {` to `export function authCallbackCookieGuard(request: NextRequest): NextResponse {` (body unchanged).
  - Replace `export const config = { matcher: ["/api/auth/:path*"] };` with:

```ts
/**
 * One proxy, two jobs (Next allows a single proxy.ts):
 * - /api/auth/*: the callback-url cookie guard above.
 * - /trips/<ref>/*: resolve a Trip's slug to its id once, at the route boundary
 *   (ADR 0064; lib/trip-route.ts has the decision table). The DB modules are
 *   imported lazily so the auth guard's path — and its tests — never load Prisma.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/auth/")) return authCallbackCookieGuard(request);
  if (!pathname.startsWith("/trips/")) return NextResponse.next();

  const [{ decideTripRoute }, { resolveTripRef, viewerIdFromRequest, viewerIsTripMember }] = await Promise.all([
    import("@/lib/trip-route"),
    import("@/lib/trip-ref"),
  ]);
  const decision = await decideTripRoute({
    pathname,
    search,
    method: request.method,
    resolve: resolveTripRef,
    isMember: async (tripId) => viewerIsTripMember(tripId, await viewerIdFromRequest(request)),
  });
  if (decision.kind === "redirect") return NextResponse.redirect(new URL(decision.location, request.url), 308);
  if (decision.kind === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/:path*", "/trips/:ref/:path*"],
};
```

  - In the file's top doc comment, change the "Scope gap (deliberate): this proxy's matcher only covers `/api/auth/:path*`" paragraph so it says the callback-url guard runs only on `/api/auth/*` (the proxy also matches `/trips/*` for slug resolution, and the guard is not applied there).

- [ ] **Step 6: Run the tests to verify they pass.**

Run: `TZ=UTC npx vitest run lib/trip-route.test.ts proxy.test.ts proxy.contract.test.ts && INTEGRATION=1 npm run test:integration && npx tsc --noEmit -p .`
Expected: PASS, and tsc exits 0.

- [ ] **Step 7: Check the build and the real boundary once, locally.**

Run: `npm run build`
Expected: the build succeeds and lists `ƒ Proxy (Middleware)` (or "Proxy") in the route summary.

Then run `npm run dev`, sign in with the dev login, and in the browser:
- Open `/trips/<a trip's cuid>/plan?x=1`. The URL becomes `/trips/<slug>/plan?x=1` and the Plan renders.
- The Plan tab is lit, and the console shows no hydration warning.
- Open `/trips/<slug>/day/<a date>`. It renders with no redirect.

Stop the dev server. Do not deploy.

- [ ] **Step 8: Commit.**

```bash
git add lib/trip-route.ts lib/trip-route.test.ts lib/trip-ref.ts proxy.ts proxy.test.ts test/integration/trip-slug.test.ts
git commit -m "$(cat <<'EOF'
feat(trips): resolve trip slugs at the route boundary; 308 old addresses for members

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Server-side link sweep

**Files:**
- Create: `lib/trip-slug-read.ts`, `lib/trip-slug-read.test.ts`
- Modify: every file in the table below
- Test: the existing tests of each file

**Interfaces:**
- Consumes: `tripPath` (Task 8).
- Produces: `tripSlugFor(tripId: string): Promise<string>`, `cache()`-memoised per request, returning `trip.slug ?? tripId`. New required props: `DayHeader.tripSlug: string`, `HomeHeader.tripSlug: string`, `UpcomingPaymentsCard.tripSlug: string`. `TripCardModel.ref: string`. `DigestInput.tripRef?: string`. `tripOfflinePaths(tripRef: string, …)` (first parameter renamed).

**Mechanical rules** (these apply to Task 12 as well):
- **R1, server code with data access** (pages, layouts, async server components, loaders, server actions): get the slug with `const slug = await tripSlugFor(tripId);`, or from a row you already load (add `slug: true` to its select and use `row.slug ?? row.id`). Then write `tripPath(slug, "/sub")`. `const base = tripPath(slug)` followed by `` `${base}/sub` `` is allowed. Hand-writing `/trips/${…}` is not.
- **R2, client components**: `const tripHref = useTripHref(tripId)` then `tripHref("/sub")`, or `useTripSlug(tripId)` for a pure helper that takes a ref (Task 12).
- **R3, synchronous presentational components without `"use client"` that are rendered from server code**: add a required `tripSlug: string` prop, build links with `tripPath(tripSlug, …)`, and have the caller pass it (R1).
- Never touch `revalidatePath(\`/trips/${tripId}…\`)` calls (a rewrite's destination is the id path; see Global Constraints) or `/api/trips/${…}` URLs.
- If an existing page test breaks only because its `@/lib/db` mock has no `trip.findUnique`, add `vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async (id: string) => id }));` to that test file. Expected hrefs then stay `/trips/<id>/…`. Do not change assertions otherwise.

- [ ] **Step 1: Write the failing test.** Create `lib/trip-slug-read.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { trip: { findUnique } } }));
import { tripSlugFor } from "./trip-slug-read";

describe("tripSlugFor", () => {
  beforeEach(() => findUnique.mockReset());
  it("returns the Trip's slug", async () => {
    findUnique.mockResolvedValue({ slug: "christmas-in-europe-2026" });
    expect(await tripSlugFor("t1")).toBe("christmas-in-europe-2026");
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "t1" }, select: { slug: true } });
  });
  it("falls back to the id for a Trip with no slug yet (created during a deploy window)", async () => {
    findUnique.mockResolvedValue({ slug: null });
    expect(await tripSlugFor("t2")).toBe("t2");
    findUnique.mockResolvedValue(null);
    expect(await tripSlugFor("t3")).toBe("t3");
  });
});
```

In `app/(app)/trips/[tripId]/day/[date]/page.test.tsx`, add a test (`tripFindUniqueMock` is the test's `db.trip.findUnique`):

```tsx
  it("builds its links from the Trip's slug (ADR 0064)", async () => {
    tripFindUniqueMock.mockResolvedValue({ slug: "christmas-in-europe-2026", name: "Christmas in Europe", members: [] });
    await renderPage();
    expect(screen.getByRole("link", { name: "Previous day: Fri 11 Dec" })).toHaveAttribute("href", "/trips/christmas-in-europe-2026/day/2026-12-11");
  });
```

- [ ] **Step 2: Run them to verify they fail.**

Run: `TZ=UTC npx vitest run lib/trip-slug-read.test.ts "app/(app)/trips/[tripId]/day"`
Expected: FAIL. The module is missing, and the href still holds `t1`.

- [ ] **Step 3: Create `lib/trip-slug-read.ts`:**

```ts
import { cache } from "react";
import { db } from "@/lib/db";

/**
 * The Trip's current slug for building links on the server (ADR 0064), or its
 * id when it has none yet. Memoised per request (React cache), like
 * requireTripAccess — a page and its layout share one lookup on a cold load.
 */
export const tripSlugFor = cache(async (tripId: string): Promise<string> => {
  const row = await db.trip.findUnique({ where: { id: tripId }, select: { slug: true } });
  return row?.slug ?? tripId;
});
```

- [ ] **Step 4: Sweep the server-side call sites.** Add the imports `import { tripPath } from "@/lib/trip-path";` and, where R1 needs it, `import { tripSlugFor } from "@/lib/trip-slug-read";`. Then apply:

| File (line ≈) | Change |
|---|---|
| `app/(app)/trips/[tripId]/layout.tsx` (52, 81, 98, 145) | after `await requireTripAccess(tripId);` add `const slug = await tripSlugFor(tripId);`. `daysHref` = `defaultDay ? tripPath(slug, \`/day/${defaultDay}\`) : tripPath(slug, "/plan")`. `tripOfflinePaths(slug, …)`. members link `href={tripPath(slug, "/settings#travellers")}` |
| `app/(app)/trips/[tripId]/page.tsx` (270, 386, 286) | in `renderDesktopHome` (async) add `const slug = await tripSlugFor(tripId);`. `const base = tripPath(slug);`. CountdownTile `href={tripPath(slug, "/plan")}`. `<HomeHeader … tripSlug={slug} />` |
| `app/(app)/trips/[tripId]/journal/page.tsx` (201) | `const slug = await tripSlugFor(tripId);` after the access check; `href={tripPath(slug, \`/day/${date}\`)}` |
| `app/(app)/trips/[tripId]/calendar/page.tsx` (121, 139) | `const slug = await tripSlugFor(tripId);` both `href={tripPath(slug, "/plan")}` |
| `app/(app)/trips/[tripId]/today/page.tsx` (10) | `redirect(tripPath(await tripSlugFor(tripId)));` |
| `app/(app)/trips/[tripId]/more/page.tsx` (53) | `const slug = await tripSlugFor(tripId);` `href={tripPath(slug, \`/${s.segment}\`)}` |
| `app/(app)/trips/[tripId]/compare/page.tsx` (36) | `if (!trip.forksEnabled) redirect(tripPath(await tripSlugFor(tripId), "/plan"));` |
| `app/(app)/trips/[tripId]/day/page.tsx` (16, 18) | `const slug = await tripSlugFor(tripId);` `redirect(tripPath(slug))`; `redirect(date ? tripPath(slug, \`/day/${date}\`) : tripPath(slug, "/plan"))` |
| `app/(app)/trips/[tripId]/day/[date]/page.tsx` (45, 49, DayHeader) | `const slug = await tripSlugFor(tripId);` alongside the other reads. `redirect(tripPath(slug, "/plan"))`. `const base = tripPath(slug);`. `<DayHeader … tripSlug={slug} />` |
| `app/(app)/trips/[tripId]/summary/page.tsx` (392) | `const tripBasePath = tripPath(await tripSlugFor(tripId));` |
| `app/(app)/trips/[tripId]/help/page.tsx` (32) | `<HelpGuide tripId={await tripSlugFor(tripId)} level={3} />`, with the comment `// HelpGuide builds links from this; it is the Trip's URL ref (slug), ADR 0064` |
| `app/(app)/trips/[tripId]/budget/page.tsx` | pass `tripSlug={await tripSlugFor(tripId)}` to `<UpcomingPaymentsCard …/>` |
| `components/trip/day/day-header.tsx` (135) | R3: add `tripSlug: string` to `DayHeaderProps` and destructure it; `href={tripPath(tripSlug, "/settings#travellers")}`. In `day-header.test.tsx` add `tripSlug="t1"` to every `<DayHeader>` render and to the `base`/`props` objects |
| `components/trip/home/desktop/home-header.tsx` (64) | R3: add `tripSlug: string` prop; `const base = tripPath(tripSlug);`. Update its tests' props with `tripSlug: "t1"` |
| `components/trip/upcoming-payments-card.tsx` (27) | R3: add `tripSlug: string` prop; `const href = tripPath(tripSlug, "/budget");`. Update its tests |
| `components/trip/home/phase-past.tsx` (70) | `const base = tripPath(await tripSlugFor(tripId));` |
| `components/trip/home/phase-planning.tsx` (72, 142) | `const slug = await tripSlugFor(tripId);` `const base = tripPath(slug);` `<UpcomingPaymentsCard … tripSlug={slug} />` |
| `components/trip/home/phase-sketching.tsx` (67, 102) | `const slug = await tripSlugFor(tripId);` both `href={tripPath(slug, "/plan")}` |
| `components/trip/home/phase-travelling.tsx` (283, 290, 333) | in `PhaseTravelling` add `const slug = await tripSlugFor(tripId);`. `href={tripPath(slug, \`/day/${effectiveDate}\`)}`, `href={tripPath(slug, "/calendar")}`. Pass `tripSlug={slug}` to the desktop sub-component that declares `const base` (~line 325); give it a `tripSlug: string` prop and `const base = tripPath(tripSlug);`. Pass `tripSlug={slug}` to any `<UpcomingPaymentsCard>` here |
| `components/trips/trip-card.tsx` (67) | add `ref: string` to `TripCardModel`; `href={tripPath(model.ref, "/settings")}`. Update test fixtures with `ref: "<id>"` |
| `lib/trips/trips-page-loader.ts` (47, 80, 110) | add `slug: true` to the trip select; `const ref = t.slug ?? t.id`. `href: tripPath(ref)`, `ref`. For the hero (`first` is a `CardTrip`, which has no slug), `basePath: tripPath(byId.get(first.id)?.slug ?? first.id)`. In the card map, `t` is the full row, so `const ref = t.slug ?? t.id` |
| `lib/desktop-home-loader.ts` (119) | `const base = tripPath(await tripSlugFor(tripId));` |
| `lib/next-steps-loader.ts` (56) | `const tripBasePath = tripPath(await tripSlugFor(tripId));` |
| `lib/offline.ts` (30–36) | rename the first parameter `tripId` → `tripRef`; `const base = tripPath(tripRef);`. Update the doc comment and `lib/offline.test.ts` call sites (values unchanged) |
| `lib/help-guide.ts` (348–353) | `export function guideTripHref(tripRef: string \| undefined, segment: GuideTripSegment): string \| undefined { return tripRef ? tripPath(tripRef, \`/${segment}\`) : undefined; }` (its test still passes; `tripPath` encodes) |
| `lib/digest.ts` (218, 250) | add `/** The Trip's URL ref (slug) for the tap-through link; falls back to tripId. */ tripRef?: string;` to `DigestInput`. `const ref = input.tripRef ?? input.tripId;` `const url = isPaymentOnly ? tripPath(ref, "/budget") : tripPath(ref);`. `asTestDigest(digest, tripRef: string)` → `url: tripPath(tripRef, "/settings")` |
| `lib/digest-dispatch.ts` (97–106, 293, 669–674) | add `slug: true` to the trip select; return `tripRef: trip?.slug ?? tripId` from `collectDigestInput`. At the call site: `const input = await collectDigestInput(…); const built = buildDigest(input); const digest = force ? asTestDigest(built, input.tripRef ?? tripId) : built;` |
| `server/actions/search.ts` (22) | `const base = tripPath(await tripSlugFor(tripId));` |

- [ ] **Step 5: Run the tests and typecheck.**

Run: `npm test && npx tsc --noEmit -p .`
Expected: all tests PASS and tsc exits 0. Fix failures only by the R-rules and the mock rule above.

Then run: `grep -rnE '/trips/\$\{' app lib server components/trip/home components/trip/day/day-header.tsx components/trips components/trip/upcoming-payments-card.tsx --include=*.ts --include=*.tsx | grep -v '\.test\.' | grep -v 'revalidatePath(' | grep -v '/api/trips/' | grep -v '^lib/trip-path.ts'`
Expected: no output (only client files remain, for Task 12).

- [ ] **Step 6: Commit.**

```bash
git add -A app lib server components
git commit -m "$(cat <<'EOF'
refactor(trips): build server-side trip links from the slug via tripPath

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Client-side link sweep and the hand-built-link guard

**Files:**
- Create: `components/trip/use-trip-href.ts`, `components/trip/use-trip-href.test.tsx`
- Create: `lib/trip-links.guard.test.ts`
- Modify: `components/shell/shell-user.tsx`, `app/(app)/layout.tsx`, `server/actions/search.ts` (`listMyTrips`), and every client file in the table below

**Interfaces:**
- Consumes: `tripPath`, `useShellUser()`.
- Produces: `SwitcherTrip.slug: string` (required). `useTripSlug(tripId: string): string`, which returns the shell trip list's slug and falls back to `tripId` outside the provider (tests, or a Trip missing from the list). `useTripHref(tripId: string): (sub?: string) => string`. `primaryNav(tripRef, planParam?)`, `moreNav(tripRef, planParam?)`, `tripRailItems(tripRef, planParam?, daysHref?)` and `actionsFor(tripRef, phase)` now take the ref (the param is renamed, the logic is unchanged). `listMyTrips(): Promise<Array<{ id: string; name: string; slug: string }>>`.

`app/(app)/layout.tsx` already loads every trip the viewer belongs to into `ShellUserProvider` (`trips`), and every client component under `(app)` sits beneath it. So the slug comes from there and no new provider is needed. After a rename, the settings form's `router.refresh()` (Task 9) reloads that list.

- [ ] **Step 1: Write the failing tests.** Create `components/trip/use-trip-href.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { ShellUserProvider, type ShellUser } from "@/components/shell/shell-user";
import { useTripHref, useTripSlug } from "./use-trip-href";

const shell: ShellUser = {
  user: { id: "u1", name: "Cam", email: "c@x", image: null } as ShellUser["user"],
  isAdmin: false,
  pendingAccessRequests: 0,
  trips: [{ id: "t1", slug: "christmas-in-europe-2026", name: "Christmas in Europe", statusLine: "" }],
  lastTrip: null,
};
const wrapper = ({ children }: { children: React.ReactNode }) => <ShellUserProvider value={shell}>{children}</ShellUserProvider>;

describe("useTripHref / useTripSlug (ADR 0064)", () => {
  it("builds links from the Trip's slug in the shell's trip list", () => {
    const { result } = renderHook(() => useTripHref("t1"), { wrapper });
    expect(result.current("/day/2026-12-26")).toBe("/trips/christmas-in-europe-2026/day/2026-12-26");
    expect(result.current()).toBe("/trips/christmas-in-europe-2026");
  });
  it("falls back to the id outside the provider or for an unknown Trip (the proxy redirects an id)", () => {
    expect(renderHook(() => useTripSlug("t1")).result.current).toBe("t1");
    expect(renderHook(() => useTripSlug("t9"), { wrapper }).result.current).toBe("t9");
  });
});
```

Create `lib/trip-links.guard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * ADR 0064: every internal Trip link goes through lib/trip-path.ts. Exempt:
 * `revalidatePath(…)` (takes the rewrite's destination — the id path; Next
 * docs "Using revalidatePath with rewrites") and `/api/trips/…` routes (ids).
 */
const ROOTS = ["app", "components", "lib", "server"];
const ALLOWED_FILES = new Set(["lib/trip-path.ts", "lib/trip-links.guard.test.ts"]);
const HAND_BUILT = [/\/trips\/\$\{/, /["'`]\/trips\/["'`]\s*\+/];
const EXEMPT = [/revalidatePath\(/, /\/api\/trips\//];

export function isHandBuiltTripLink(line: string): boolean {
  if (EXEMPT.some((re) => re.test(line))) return false;
  return HAND_BUILT.some((re) => re.test(line));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("trip links go through tripPath (ADR 0064)", () => {
  it("the scanner flags hand-built links and spares the exemptions", () => {
    expect(isHandBuiltTripLink("href={`/trips/${tripId}/plan`}")).toBe(true);
    expect(isHandBuiltTripLink('const u = "/trips/" + id;')).toBe(true);
    expect(isHandBuiltTripLink("revalidatePath(`/trips/${tripId}/plan`);")).toBe(false);
    expect(isHandBuiltTripLink("url: `/api/trips/${tripId}/cover`,")).toBe(false);
    expect(isHandBuiltTripLink('href={tripPath(slug, "/plan")}')).toBe(false);
  });

  it("finds no hand-built /trips/${…} link outside lib/trip-path.ts", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(path.join(process.cwd(), root))) {
        const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
        if (ALLOWED_FILES.has(rel)) continue;
        readFileSync(file, "utf8").split("\n").forEach((line, i) => {
          if (isHandBuiltTripLink(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**

Run: `TZ=UTC npx vitest run components/trip/use-trip-href.test.tsx lib/trip-links.guard.test.ts`
Expected: FAIL. `./use-trip-href` is missing. The guard lists the client offenders (trip-nav, mobile-tab-bar, day-strip, tonight-card and the others in the table below).

- [ ] **Step 3: Create `components/trip/use-trip-href.ts`:**

```ts
"use client";

import * as React from "react";
import { useShellUser } from "@/components/shell/shell-user";
import { tripPath } from "@/lib/trip-path";

/**
 * A Trip's URL ref for client-side links (ADR 0064): its slug from the app
 * shell's trip list (app/(app)/layout.tsx loads every trip the viewer is on),
 * or the id when the list does not have it — a test with no provider, or a
 * Trip created in another tab. An id still works: the proxy redirects it.
 */
export function useTripSlug(tripId: string): string {
  const shell = useShellUser();
  return shell?.trips.find((t) => t.id === tripId)?.slug ?? tripId;
}

/** `tripPath` bound to a Trip's current ref: `useTripHref(tripId)("/plan")`. */
export function useTripHref(tripId: string): (sub?: string) => string {
  const ref = useTripSlug(tripId);
  return React.useCallback((sub = "") => tripPath(ref, sub), [ref]);
}
```

- [ ] **Step 4: Put the slug in the shell data.**
  - `components/shell/shell-user.tsx`: add `/** URL ref (ADR 0064): the Trip's slug, or its id if it has none yet. */ slug: string;` to `SwitcherTrip`.
  - `app/(app)/layout.tsx`: add `slug: true` to the membership `trip.select`, and `slug: t.slug ?? t.id,` to the `SwitcherTrip` mapping.
  - `server/actions/search.ts` `listMyTrips`: select `{ id: true, name: true, slug: true }`, return `memberships.map((m) => ({ id: m.trip.id, name: m.trip.name, slug: m.trip.slug ?? m.trip.id }))`, and update the return type.
  - Add `slug: "<same as id>"` to every `SwitcherTrip` test fixture (`grep -rln statusLine --include=*.test.tsx .` lists the four files).

- [ ] **Step 5: Sweep the client call sites** (import `tripPath`, `useTripHref` or `useTripSlug` as needed):

| File (line ≈) | Change |
|---|---|
| `components/trip/trip-nav.tsx` (21–47, 85–94, 142–147) | rename the first param of `primaryNav`, `moreNav` and `tripRailItems` to `tripRef`, each with `const base = tripPath(tripRef);`. In `TripNav`: `const tripRef = useTripSlug(tripId);` and `tripRailItems(tripRef, planParam, daysHref)` |
| `components/shell/sidebar-nav.tsx` (86) | before it: `const tripRef = useTripSlug(tripId ?? "");` then `const tripItems = tripId ? tripRailItems(tripRef, planParam, daysHref) : [];` |
| `components/trip/mobile-tab-bar.tsx` (26–30, 48) | `const tripRef = useTripSlug(tripId);` `const base = tripPath(tripRef);` `primaryNav(tripRef, planParam)`, `moreNav(tripRef, planParam)`; More `href: \`${base}/more\`` stays |
| `components/trip/home/quick-actions.tsx` (19–20, 44) | `function actionsFor(tripRef: string, phase)`, `const base = tripPath(tripRef);`. In `QuickActions`: `actionsFor(useTripSlug(tripId), phase)` (call the hook at the top level) |
| `components/command-palette-results.tsx` (40–41, 84, 127–149) | `tripPages(tripRef: string)` with `const base = tripPath(tripRef);`. In the component: `const tripRef = useTripSlug(tripId ?? "");`, `tripId ? tripPages(tripRef)`. `myTrips` state type `{ id: string; name: string; slug: string }`. Trip items `href: tripPath(slug)`. Do-items `href: tripPath(tripRef, "/wishlist")` / `tripPath(tripRef, "/plan")`. Add `tripRef` to the `useMemo` deps |
| `components/shell/back-to-trip-card.tsx` (13) | `href={tripPath(trip.slug)}` |
| `components/shell/trip-switcher.tsx` (44) | `href={tripPath(trip.slug)}` |
| `components/trip/notification-bell.tsx` (163) | `const tripHref = useTripHref(tripId);` `href={tripHref("/activity")}` |
| `components/trip/month-grid.tsx` (173) | `const tripHref = useTripHref(tripId);` `href={tripHref(\`/day/${cell.dateISO}\`)}` |
| `components/trip/variant-banner.tsx` (27) | `href={useTripHref(tripId)("/compare")}` (hook called at the top of the component) |
| `components/trip/nearby-wishlist.tsx` (71, 122) | `const tripHref = useTripHref(tripId);` both `tripHref("/wishlist")` |
| `components/trip/day-ideas.tsx` (183) | `tripHref("/wishlist")` |
| `components/trip/stop-day-list.tsx` (216) | `tripHref(\`/day/${day.dateISO}\`)` |
| `components/trip/fork-switcher.tsx` (269, 401) | in each component that pushes: `const tripHref = useTripHref(tripId);` `router.push(tripHref(\`/plan?plan=${forkId}\`))`, `router.push(tripHref("/compare"))` |
| `components/trip/home/desktop/route-map-tile.tsx` (108, 135) | `const tripHref = useTripHref(tripId);` `href={tripHref("/plan?add=stop")}` and `router.push(tripHref(\`/plan#stop-${id}\`))` |
| `components/trip/day/day-strip.tsx` (66, 90) | `const tripHref = useTripHref(tripId);` `isPendingChip` compares `pendingPathname.endsWith(tripHref(\`/day/${iso}\`))`; chip `href={tripHref(\`/day/${d.iso}\`)}` |
| `components/trip/day/tonight-card.tsx` (planHref) | `const tripHref = useTripHref(tripId);` (with the other hooks, before the early return) `const planHref = tripHref(\`/plan${stopId ? \`#stop-${stopId}\` : ""}\`);` |
| `components/trip/home-base-card.tsx` (25) | add `"use client";` (only `ItineraryManager`, a client component, renders it); `href={useTripHref(tripId)("/settings")}` |
| `components/trip/agenda-view.tsx` (33) | add `"use client";` (only `CalendarViews`, a client component, renders it); `const tripHref = useTripHref(tripId);` `const dayHref = tripHref(\`/day/${day.dateISO}\`);` |

- [ ] **Step 6: Run everything.**

Run: `npm test && npx tsc --noEmit -p . && npm run lint`
Expected: all tests PASS, including `lib/trip-links.guard.test.ts` (no offenders). Tests rendered outside `ShellUserProvider` keep their `/trips/t1/…` expectations through the id fallback. tsc and lint exit 0. If the guard lists a file not in the tables, convert it by R1/R2/R3 and re-run.

Run: `INTEGRATION=1 npm run test:integration`
Expected: PASS.

- [ ] **Step 7: End-to-end check, locally.** Run `npm run dev`, sign in with the dev login, then check:
  - From the trips list, open a Trip. The address bar shows `/trips/<slug>`.
  - Click through Plan, Days (a day chip), Calendar and a Home tile. Every URL uses the slug, and the tabs light correctly.
  - Rename the Trip in Settings and save. The address bar moves to the new slug's `/settings`, and nav links now use it.
  - Paste the pre-rename URL. It redirects to the new slug.
  - Paste the Trip's `/trips/<cuid>/day/<date>`. It redirects to the slug with the date kept.

  Stop the dev server. Do not deploy.

- [ ] **Step 8: Commit** (this finishes the trip-links note):

```bash
git add -A app components lib server
git commit -m "$(cat <<'EOF'
feat(trips): readable trip URLs — every internal link built from the slug

Client links use the shell's trip list via useTripHref; a guard test
fails on any hand-built /trips/${...} link (ADR 0064).

Resolves-Feedback: cmum8awyr000304l9cokb7p7c
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Notes for the executor

- Tasks run in order. Tasks 2, 3 and 6 each edit `day-strip.tsx` on top of the previous task's version. Task 11 depends on Task 8's `tripPath` and Task 10's proxy (links may use slugs only once slugs resolve).
- The deploy for Tasks 8–12 ships a migration. Before merging, the main session should read `docs/DEPLOY.md` §4b against `20260929000000_trip_slug` (additive and nullable: no write-path window). A later migration can tighten `Trip.slug` to NOT NULL once every Trip has one.
- `flagReturnLegAfterHardEnd` (`lib/flags.ts` Rule 16) still identifies the return leg by `arrIsHome`. The spec names only the missing-return check, so it is left alone. Raise it with the main session if a free-text return leg should also be checked against the Hard end date.
