# In-App User Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an in-app help page that teaches a non-technical co-planner how to use TEEPEE end to end, reachable from the trip More menu and the top-bar avatar dropdown, readable offline, and guarded by tests against drifting out of sync with the UI it describes.

**Architecture:** A pure data module (`lib/help-guide.ts`) holds the guide's *claims* about the app — the nav labels it names and the route segments it links to — so drift tests can assert they remain true. Two thin server-component routes (global `/help` and trip-scoped `/trips/[tripId]/help`) render one shared content component. Sections are native `<details>`/`<summary>` disclosures: no new dependency, no client state, no hydration. Icons and buttons are rendered as live specimens using the app's real components, so `tsc` catches drift.

**Tech Stack:** Next.js 16 App Router (server components), React 19, TypeScript 5, Tailwind v4, lucide-react, Vitest + jsdom + Testing Library.

## Global Constraints

- **No new runtime dependencies.** Collapsible sections use native `<details>`/`<summary>`. Do NOT add `@radix-ui/react-accordion`.
- **Server components only.** No `"use client"` in any file created by this plan. No client state, no `useState`, no effects.
- **No database queries and no live trip data.** The guide is static prose plus deep links built from `tripId`. Do not import `@/lib/db` or call `requireTripAccess` for content purposes.
- **Vocabulary is binding.** Use the exact UI words, glossed in plain English on first use. NEVER write "activity" to mean a thing-to-do — "Activity" is the change-log nav item. NEVER write "itinerary" to mean the Plan. See `CONTEXT.md` "Item" and "Plan".
- **Voice:** warm, plain, second person. Short active sentences. Generic — no personal names, no reference to any specific trip.
- **Do NOT document Discreet mode.** It was removed on 2026-07-16 and does not exist.
- **Do NOT document Settings.** Out of scope.
- **`RowActions` cannot be used in the legend.** `components/ui/row-actions.tsx:9` requires `onEdit`/`onDelete` function props, which a server component cannot pass to a client component. Replicate the pair with `Button` + icons instead (serializable props only).
- **Print CSS follows the repo pattern:** a page-local `<style>` block, as in `app/(app)/trips/[tripId]/print/page.tsx:254`. Do NOT add rules to `app/globals.css`.
- **Branch:** all work happens on `feat/in-app-user-guide`. Do NOT merge to `main`. Do NOT deploy.
- **Verification gates for every task:** `npx vitest run <file>` for the task's own tests, and `npx tsc --noEmit` before commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/help-guide.ts` | **Create.** Pure data: section metadata, the nav labels and route segments the guide claims exist, and the deep-link href builder. No React. |
| `lib/help-guide.test.ts` | **Create.** Unit tests + the two drift guards (nav labels exist, routes exist). |
| `components/trip/help-legend.tsx` | **Create.** The always-visible button/icon key, rendered as live specimens from the app's real components. |
| `components/trip/help-legend.test.tsx` | **Create.** Asserts each documented control renders and is labelled. |
| `components/trip/help-guide.tsx` | **Create.** The guide body: `<details>` sections, prose, deep links, the ADR-0022 callout, and the print `<style>` block. |
| `components/trip/help-guide.test.tsx` | **Create.** Section headings present, links carry `tripId`, degrade to text without it, callout present. |
| `app/(app)/help/page.tsx` | **Create.** Global route. Renders the content component with no `tripId`. |
| `app/(app)/help/page.test.tsx` | **Create.** Renders, has metadata, passes no `tripId`. |
| `app/(app)/trips/[tripId]/help/page.tsx` | **Create.** Trip-scoped route. Awaits params, guards access, passes `tripId`. |
| `app/(app)/trips/[tripId]/help/page.test.tsx` | **Create.** Renders, guards access, passes `tripId` through. |
| `components/trip/trip-nav.tsx` | **Modify** `moreNav()` (line 26). Add the `Help` entry. |
| `components/trip/trip-nav.test.tsx` | **Modify.** Assert Help's href and that it carries no `?plan=`. |
| `app/(app)/layout.tsx` | **Modify** the avatar dropdown (line ~122). Add a Help link to the global route. |
| `app/(app)/layout.test.tsx` | **Modify.** Assert the Help link is present with `href="/help"`. |
| `lib/offline.ts` | **Modify** `tripOfflinePaths()` (line 30). Add the trip-scoped help path. |
| `lib/offline.test.ts` | **Modify** both exact-array assertions (lines ~173 and ~187). |
| `CONTEXT.md` | **Modify.** Delete the stale Discreet mode entry (lines 167–169). |
| `DESIGN-BRIEF.md` | **Modify.** Correct 10 stale Discreet mode references. |
| `ONBOARDING.md` | **Modify.** One changelog line recording the new surface. |

**Not touched:** `public/sw.js`. The offline warm-set is driven by `tripOfflinePaths()` → `OfflineWarmer` runtime fetches (`components/offline-warmer.tsx:20`); sw.js only mirrors the *cache-strategy* classification and already treats navigations as network-first with cache fallback.

---

### Task 1: Retire the stale Discreet mode documentation

Discreet mode was removed entirely on 2026-07-16 (`ONBOARDING.md:81`) but `CONTEXT.md` still defines it as a live domain term and `DESIGN-BRIEF.md` still says it must keep working. Subagents writing user-facing prose will read these as truth. This task runs first so the rest of the plan builds on an accurate glossary.

**Files:**
- Modify: `CONTEXT.md:167-169`
- Modify: `DESIGN-BRIEF.md` lines 133, 179, 199, 209, 211, 223, 239, 256, 318, 331
- Modify: `ONBOARDING.md` (changelog line)

**Interfaces:**
- Consumes: nothing.
- Produces: an accurate glossary. No code exports.

- [ ] **Step 1: Delete the Discreet mode glossary entry**

Remove these three lines from `CONTEXT.md` (currently lines 167–169), including the blank line that followed them, so `**Calendar feed**` is followed directly by `**Vote**`:

```markdown
**Discreet mode**:
A device-local display mode (stored in a cookie, per browser) that disguises the app as a generic spreadsheet/"workspace" tool so a trip can be planned unobtrusively on a work screen. The plan view becomes an editable stop-by-stop spreadsheet. It changes presentation only — never the underlying trip data, and it is never shared with other trip members.
_Avoid_: Incognito, stealth mode, private mode, boss mode
```

- [ ] **Step 2: Correct DESIGN-BRIEF.md line 133**

This line is stale twice over — it names the removed discreet toggle *and* the retired Fraunces display font (replaced by Space Grotesk on 2026-07-14, see `design_handoff/README.md:46`). Replace with:

```markdown
- **Top bar** (`app/(app)/layout.tsx`): sticky, `h-14`, translucent (`bg-background/60` + backdrop-blur), bottom border. Holds the 🛖 **TEEPEE** wordmark (Space Grotesk), a command-palette trigger (⌘K), a Globe link, the light/dark toggle, and an avatar dropdown (profile, help, sign out).
```

- [ ] **Step 3: Delete DESIGN-BRIEF.md constraint 179 and renumber**

Remove item 5 entirely:

```markdown
5. **The discreet "workspace" reskin must keep working** — a privacy mode that re-maps tokens to a neutral spreadsheet look ([§C11](#c11--cross-cutting-patterns)). So keep component internals token-driven, not hard-coded.
```

Renumber the following item (currently `6. **Money & status colours are semantic:**`) to `5.`, and continue renumbering any subsequent items in that list so the numbering stays contiguous.

- [ ] **Step 4: Strip the remaining eight references**

Edit each line to remove only the Discreet clause, leaving the rest of the sentence intact and grammatical:

- **199** — delete `**Discreet mode**, ` from the Supporting list.
- **209** — delete ` (or neutral label in discreet mode)`, change `avatar dropdown (name/email, discreet toggle, sign out)` to `avatar dropdown (name/email, help, sign out)`, and delete the trailing sentence `*Discreet mode* hides Globe link + palette and swaps wordmark/title/favicon.`
- **211** — change `**ForkSwitcher** (hidden when travelling/past/discreet)` to `**ForkSwitcher** (hidden when travelling/past)`.
- **223** — change `**Do** actions like New trip / Add item / Toggle theme+discreet` to `**Do** actions like New trip / Add item / Toggle theme`.
- **239** — delete the trailing ` *Discreet:* a spreadsheet-style `ProjectTable` instead.`
- **256** — delete ` *Discreet:* a stop **spreadsheet** view.`
- **318** — delete the trailing ` *Discreet:* hidden.`
- **331** — delete the entire bullet beginning `- **Discreet / workspace reskin:**`.

- [ ] **Step 5: Verify zero live references remain**

Run:

```bash
grep -rni "discreet" CONTEXT.md DESIGN-BRIEF.md COMPONENTS.md README.md lib components app
```

Expected: **no output.** (`ONBOARDING.md:81` and `design_handoff/README.md` are dated historical records — leave them, and do not include them in this grep.)

- [ ] **Step 6: Add the ONBOARDING.md changelog line**

Add to the changelog list in `ONBOARDING.md` (the section containing the `2026-07-16` entry), as the newest entry at the top of that list:

```markdown
- **In-app user guide** (2026-08-20) — New `/help` (global) and `/trips/[tripId]/help` (trip-scoped) routes render a shared guide component: native `<details>` sections, live UI specimens for the button/icon key, deep links when a trip is in scope. Reachable from the trip **More** menu and the top-bar avatar dropdown; the trip-scoped path is in the offline warm-set. Guarded by drift tests in `lib/help-guide.test.ts` that fail if a nav label is renamed or a linked route disappears. Also retired the last **Discreet mode** references from `CONTEXT.md` and `DESIGN-BRIEF.md` (the feature itself was removed 2026-07-16).
```

- [ ] **Step 7: Commit**

```bash
git add CONTEXT.md DESIGN-BRIEF.md ONBOARDING.md
git commit -m "docs: retire stale Discreet mode references from glossary and design brief"
```

---

### Task 2: The guide data module and its drift guards

**Files:**
- Create: `lib/help-guide.ts`
- Test: `lib/help-guide.test.ts`

**Interfaces:**
- Consumes: `primaryNav`, `moreNav` from `@/components/trip/trip-nav` (test only).
- Produces:
  - `type HelpGroup = "everyday" | "advanced" | "reference"`
  - `interface HelpSection { id: string; title: string; blurb: string; group: HelpGroup }`
  - `const HELP_SECTIONS: readonly HelpSection[]`
  - `const GUIDE_TRIP_SEGMENTS: readonly string[]` and `type GuideTripSegment`
  - `const GUIDE_NAV_LABELS: readonly string[]`
  - `function sectionsInGroup(group: HelpGroup): HelpSection[]`
  - `function guideTripHref(tripId: string | undefined, segment: GuideTripSegment): string | undefined`

- [ ] **Step 1: Write the failing tests**

Create `lib/help-guide.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

// trip-nav.tsx is a client component that imports next/navigation at module
// scope; stub it so the pure primaryNav/moreNav exports can be imported here.
vi.mock("next/navigation", () => ({
  usePathname: () => "/trips/t1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/trip/nav-more-menu", () => ({ NavMoreMenu: () => null }));

import {
  HELP_SECTIONS,
  GUIDE_NAV_LABELS,
  GUIDE_TRIP_SEGMENTS,
  sectionsInGroup,
  guideTripHref,
} from "./help-guide";
import { primaryNav, moreNav } from "@/components/trip/trip-nav";

describe("HELP_SECTIONS", () => {
  it("has unique ids", () => {
    const ids = HELP_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses slug-safe ids so they work as anchor targets", () => {
    for (const s of HELP_SECTIONS) {
      expect(s.id, `${s.id} is not slug-safe`).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("gives every section a title and a blurb", () => {
    for (const s of HELP_SECTIONS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(0);
    }
  });

  it("never calls a thing-to-do an 'activity' (CONTEXT.md forbids it)", () => {
    // "Activity" is the change-log nav item. Naming a thing-to-do an activity
    // sends the reader to the wrong tab.
    for (const s of HELP_SECTIONS) {
      expect(`${s.title} ${s.blurb}`.toLowerCase()).not.toContain("activit");
    }
  });

  it("never mentions Discreet mode, which was removed", () => {
    for (const s of HELP_SECTIONS) {
      expect(`${s.title} ${s.blurb}`.toLowerCase()).not.toContain("discreet");
    }
  });

  it("orders groups everyday, then advanced, then reference", () => {
    const rank = { everyday: 0, advanced: 1, reference: 2 } as const;
    const ranks = HELP_SECTIONS.map((s) => rank[s.group]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe("sectionsInGroup", () => {
  it("returns only sections in the requested group, in document order", () => {
    const everyday = sectionsInGroup("everyday");
    expect(everyday.length).toBeGreaterThan(0);
    expect(everyday.every((s) => s.group === "everyday")).toBe(true);
    expect(everyday.map((s) => s.id)).toEqual(
      HELP_SECTIONS.filter((s) => s.group === "everyday").map((s) => s.id),
    );
  });

  it("returns an empty array for a group with no sections", () => {
    // Guards against sectionsInGroup throwing rather than returning empty.
    const groups = new Set(HELP_SECTIONS.map((s) => s.group));
    if (!groups.has("reference")) {
      expect(sectionsInGroup("reference")).toEqual([]);
    }
  });
});

describe("guideTripHref", () => {
  it("builds a trip-scoped path when a tripId is given", () => {
    expect(guideTripHref("t1", "plan")).toBe("/trips/t1/plan");
  });

  it("returns undefined with no tripId so the caller can render plain text", () => {
    expect(guideTripHref(undefined, "plan")).toBeUndefined();
  });

  it("encodes a tripId containing URL-unsafe characters", () => {
    expect(guideTripHref("a/b", "plan")).toBe("/trips/a%2Fb/plan");
  });
});

// ── Drift guards ──────────────────────────────────────────────────────────
// These fail when the app changes under the guide, instead of letting the
// guide quietly start lying.

describe("drift guard: nav labels", () => {
  it("every nav label the guide names still exists in the real nav", () => {
    const real = new Set(
      [...primaryNav("t1"), ...moreNav("t1")].map((i) => i.label),
    );
    for (const label of GUIDE_NAV_LABELS) {
      expect(real.has(label), `nav label "${label}" no longer exists`).toBe(true);
    }
  });
});

describe("drift guard: linked routes", () => {
  it("every trip route segment the guide links to still has a page", () => {
    for (const seg of GUIDE_TRIP_SEGMENTS) {
      const p = path.join(
        process.cwd(),
        "app",
        "(app)",
        "trips",
        "[tripId]",
        seg,
        "page.tsx",
      );
      expect(existsSync(p), `route /trips/[tripId]/${seg} is missing`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/help-guide.test.ts`
Expected: FAIL — `Failed to resolve import "./help-guide"`.

- [ ] **Step 3: Write the implementation**

Create `lib/help-guide.ts`:

```ts
/**
 * Pure data model for the in-app user guide.
 *
 * PURE — no React, no Prisma, no browser APIs.
 *
 * The guide's *claims* about the app live here as data, not prose, so tests
 * can assert they are still true: GUIDE_NAV_LABELS must exist in the real
 * nav, and GUIDE_TRIP_SEGMENTS must resolve to real routes. When a tab is
 * renamed or a page moves, the suite fails instead of the guide lying.
 */

/** Which block of the page a section belongs to. */
export type HelpGroup = "everyday" | "advanced" | "reference";

export interface HelpSection {
  /** Slug used as the <details> anchor id. */
  id: string;
  title: string;
  /** One-line summary shown in the collapsed <summary> row. */
  blurb: string;
  group: HelpGroup;
}

/**
 * Section order IS document order. Groups must stay contiguous and in the
 * order everyday → advanced → reference (asserted by test).
 */
export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: "sixty-seconds",
    title: "The 60-second version",
    blurb: "The whole loop, start to finish, in six steps.",
    group: "everyday",
  },
  {
    id: "trip-shape",
    title: "The shape of your trip",
    blurb: "Places, coloured bands and where you set off from.",
    group: "everyday",
  },
  {
    id: "things-to-do",
    title: "Adding things to do",
    blurb: "Park an idea under a place — the main thing you'll do here.",
    group: "everyday",
  },
  {
    id: "giving-a-day",
    title: "Giving it a day",
    blurb: "The step that puts something on the calendar.",
    group: "everyday",
  },
  {
    id: "undecided",
    title: "Ideas you haven't decided on",
    blurb: "Where maybes live, and how you two agree on them.",
    group: "everyday",
  },
  {
    id: "sleeping-moving",
    title: "Sleeping and getting around",
    blurb: "Where you stay each night, and how you get between places.",
    group: "everyday",
  },
  {
    id: "money",
    title: "Money",
    blurb: "What something costs, and what you've actually paid.",
    group: "everyday",
  },
  {
    id: "getting-ready",
    title: "Getting ready",
    blurb: "Lists to tick off, and somewhere to keep tickets.",
    group: "everyday",
  },
  {
    id: "together",
    title: "Working together",
    blurb: "Leaving notes, and seeing what the other one changed.",
    group: "everyday",
  },
  {
    id: "away",
    title: "While you're away",
    blurb: "The one screen you'll actually use on the road.",
    group: "everyday",
  },
  {
    id: "something-off",
    title: "When something looks off",
    blurb: "The app spots gaps and tells you what to fix next.",
    group: "everyday",
  },
  {
    id: "chapters",
    title: "Chapters, in depth",
    blurb: "How the coloured bands decide what's grouped with what.",
    group: "advanced",
  },
  {
    id: "dates-and-pins",
    title: "Dates, pins and firming up",
    blurb: "Turning rough ideas into real dates without losing bookings.",
    group: "advanced",
  },
  {
    id: "make-it-fit",
    title: "Make it fit",
    blurb: "When the plan runs past the day you have to be home.",
    group: "advanced",
  },
  {
    id: "forks",
    title: "Forks and comparing plans",
    blurb: "Trying two versions of the trip side by side.",
    group: "advanced",
  },
  {
    id: "word-list",
    title: "Word list",
    blurb: "Every term the app uses, in plain English.",
    group: "reference",
  },
];

/**
 * Trip route segments the guide links to. Asserted to exist as real pages —
 * add a segment here only when the guide actually links to it.
 */
export const GUIDE_TRIP_SEGMENTS = [
  "plan",
  "calendar",
  "budget",
  "summary",
  "wishlist",
  "journal",
  "checklists",
  "files",
  "activity",
  "today",
  "compare",
] as const;

export type GuideTripSegment = (typeof GUIDE_TRIP_SEGMENTS)[number];

/**
 * Nav labels the guide tells the reader to look for. Asserted against the
 * real nav. "Settings" is deliberately absent — it is out of scope.
 */
export const GUIDE_NAV_LABELS = [
  "Home",
  "Plan",
  "Calendar",
  "Budget",
  "Summary",
  "Wishlist",
  "Journal",
  "Checklists",
  "Files",
  "Activity",
] as const;

/** Sections in one group, in document order. */
export function sectionsInGroup(group: HelpGroup): HelpSection[] {
  return HELP_SECTIONS.filter((s) => s.group === group);
}

/**
 * Deep link into a trip, or undefined when there is no trip in scope (the
 * global /help route) so the caller can render plain text instead of a link.
 */
export function guideTripHref(
  tripId: string | undefined,
  segment: GuideTripSegment,
): string | undefined {
  return tripId ? `/trips/${encodeURIComponent(tripId)}/${segment}` : undefined;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/help-guide.test.ts`
Expected: PASS, all tests.

If the "linked routes" guard fails on `compare`, confirm `app/(app)/trips/[tripId]/compare/page.tsx` exists; it does at time of writing.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/help-guide.ts lib/help-guide.test.ts
git commit -m "feat(help): add guide data module with nav and route drift guards"
```

---

### Task 3: The button and icon legend

The always-visible key at the top of the guide. Every control is a **live specimen** — the app's real components, so `tsc` breaks if their props change.

**Files:**
- Create: `components/trip/help-legend.tsx`
- Test: `components/trip/help-legend.test.tsx`

**Interfaces:**
- Consumes: `Button` (`@/components/ui/button`), `Badge` (`@/components/ui/badge`), `CategoryPill` (`@/components/trip/category-pill`), `ChapterChip` (`@/components/trip/chapter-chip`), icons from `lucide-react`.
- Produces: `function HelpLegend(): React.JSX.Element` — no props.

**Critical constraint:** do NOT import `RowActions`. It requires `onEdit`/`onDelete` function props (`components/ui/row-actions.tsx:9`), which a server component cannot pass across the client boundary. Replicate the pencil/trash pair with bare `Button` elements carrying only serializable props.

- [ ] **Step 1: Write the failing test**

Create `components/trip/help-legend.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelpLegend, LEGEND_ENTRIES } from "./help-legend";

describe("HelpLegend", () => {
  it("renders a row for every documented control", () => {
    render(<HelpLegend />);
    for (const entry of LEGEND_ENTRIES) {
      expect(
        screen.getByText(entry.meaning),
        `missing legend row: ${entry.meaning}`,
      ).toBeTruthy();
    }
  });

  it("marks every specimen aria-hidden so the key is not read as controls", () => {
    // The icons are illustrations, not buttons the reader can press. Screen
    // readers should hear the description, never a stack of unlabelled buttons.
    const { container } = render(<HelpLegend />);
    const specimens = container.querySelectorAll("[data-testid='legend-specimen']");
    expect(specimens.length).toBe(LEGEND_ENTRIES.length);
    specimens.forEach((s) => {
      expect(s.getAttribute("aria-hidden")).toBe("true");
    });
  });

  it("documents the five mobile tab bar destinations", () => {
    render(<HelpLegend />);
    for (const label of ["Home", "Plan", "Calendar", "Budget", "More"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("shows a category pill and a chapter chip as live examples", () => {
    const { container } = render(<HelpLegend />);
    expect(screen.getByText("Food & Drink")).toBeTruthy();
    expect(container.querySelector("[data-testid='chapter-chip-dot']")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/trip/help-legend.test.tsx`
Expected: FAIL — `Failed to resolve import "./help-legend"`.

- [ ] **Step 3: Write the implementation**

Create `components/trip/help-legend.tsx`:

```tsx
import * as React from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  MapPin,
  Paperclip,
  AlertTriangle,
  Clock,
  Home,
  Map,
  CalendarDays,
  Wallet,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryPill } from "@/components/trip/category-pill";
import { ChapterChip } from "@/components/trip/chapter-chip";

/**
 * The button-and-icon key for the user guide.
 *
 * Every specimen below is the app's REAL component, not a picture of one, so
 * a props or styling change shows up here immediately (and breaks tsc if the
 * API moves). Specimens are aria-hidden illustrations — the adjacent text is
 * what a screen reader announces.
 *
 * NOTE: RowActions is deliberately not used. It takes onEdit/onDelete function
 * props, which a server component cannot pass to a client component; the
 * pencil/trash pair is replicated here with bare Buttons instead.
 */

export interface LegendEntry {
  /** Plain-English description of what the control does. */
  meaning: string;
}

/** One entry per specimen row, in render order. */
export const LEGEND_ENTRIES: readonly LegendEntry[] = [
  { meaning: "Add something new" },
  { meaning: "Edit what's there" },
  { meaning: "Delete it — you'll get an undo for a few seconds" },
  { meaning: "Done, or already in this plan" },
  { meaning: "Has a location, so it shows on the map" },
  { meaning: "Has a file attached — a ticket or booking" },
  { meaning: "Something needs your attention" },
  { meaning: "Has a set time, not just a day" },
];

function Row({
  specimen,
  meaning,
}: {
  specimen: React.ReactNode;
  meaning: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        data-testid="legend-specimen"
        aria-hidden="true"
        className="flex w-11 shrink-0 items-center justify-center"
      >
        {specimen}
      </span>
      <span className="text-sm text-foreground">{meaning}</span>
    </li>
  );
}

/** A non-interactive replica of a ghost icon button. */
function IconSpecimen({ children }: { children: React.ReactNode }) {
  return (
    <Button variant="ghost" size="icon" className="size-8" tabIndex={-1}>
      {children}
    </Button>
  );
}

export function HelpLegend() {
  return (
    <div className="flex flex-col gap-6">
      {/* ── Buttons you'll tap ── */}
      <div>
        <h3 className="mb-3 font-display text-base font-semibold text-foreground">
          Buttons you&rsquo;ll tap
        </h3>
        <ul className="flex flex-col gap-2.5">
          <Row
            specimen={
              <Button variant="primary" size="sm" tabIndex={-1}>
                <Plus />
                Add
              </Button>
            }
            meaning={LEGEND_ENTRIES[0].meaning}
          />
          <Row
            specimen={
              <IconSpecimen>
                <Pencil className="size-4" />
              </IconSpecimen>
            }
            meaning={LEGEND_ENTRIES[1].meaning}
          />
          <Row
            specimen={
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive"
                tabIndex={-1}
              >
                <Trash2 className="size-4" />
              </Button>
            }
            meaning={LEGEND_ENTRIES[2].meaning}
          />
        </ul>
      </div>

      {/* ── Little markers on things ── */}
      <div>
        <h3 className="mb-3 font-display text-base font-semibold text-foreground">
          Little markers you&rsquo;ll see
        </h3>
        <ul className="flex flex-col gap-2.5">
          <Row
            specimen={<Check className="size-4 text-success" />}
            meaning={LEGEND_ENTRIES[3].meaning}
          />
          <Row
            specimen={<MapPin className="size-4 text-primary" />}
            meaning={LEGEND_ENTRIES[4].meaning}
          />
          <Row
            specimen={<Paperclip className="size-4 text-muted-foreground" />}
            meaning={LEGEND_ENTRIES[5].meaning}
          />
          <Row
            specimen={<AlertTriangle className="size-4 text-warning" />}
            meaning={LEGEND_ENTRIES[6].meaning}
          />
          <Row
            specimen={<Clock className="size-4 text-muted-foreground" />}
            meaning={LEGEND_ENTRIES[7].meaning}
          />
        </ul>
      </div>

      {/* ── Colour-coded labels ── */}
      <div>
        <h3 className="mb-3 font-display text-base font-semibold text-foreground">
          Colour-coded labels
        </h3>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryPill category="FOOD" />
            <span className="text-sm text-muted-foreground">
              The kind of thing it is. Each kind has its own colour.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ChapterChip name="Italy" colour="rose" />
            <span className="text-sm text-muted-foreground">
              Which stretch of the trip it belongs to.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">Needs attention</Badge>
            <span className="text-sm text-muted-foreground">
              Amber means have a look. Red means something&rsquo;s wrong.
            </span>
          </div>
        </div>
      </div>

      {/* ── Mobile tab bar ── */}
      <div>
        <h3 className="mb-3 font-display text-base font-semibold text-foreground">
          The bar along the bottom (on your phone)
        </h3>
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {[
            { icon: <Home className="size-5" />, label: "Home" },
            { icon: <Map className="size-5" />, label: "Plan" },
            { icon: <CalendarDays className="size-5" />, label: "Calendar" },
            { icon: <Wallet className="size-5" />, label: "Budget" },
            { icon: <Menu className="size-5" />, label: "More" },
          ].map(({ icon, label }) => (
            <li key={label} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center text-muted-foreground"
              >
                {icon}
              </span>
              <span className="text-sm text-foreground">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/trip/help-legend.test.tsx`
Expected: PASS.

If the aria-hidden assertion fails with a count mismatch, check that exactly `LEGEND_ENTRIES.length` rows use `<Row>` — the mobile tab bar list deliberately does not use `data-testid="legend-specimen"`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/trip/help-legend.tsx components/trip/help-legend.test.tsx
git commit -m "feat(help): add button and icon legend with live UI specimens"
```

---

### Task 4: The guide content component

The body of the guide: one `<details>` per section, prose, deep links, and the callout that stops the single most likely support question.

**Files:**
- Create: `components/trip/help-guide.tsx`
- Test: `components/trip/help-guide.test.tsx`

**Interfaces:**
- Consumes: `HELP_SECTIONS`, `sectionsInGroup`, `guideTripHref`, `GuideTripSegment` from `@/lib/help-guide`; `HelpLegend` from `@/components/trip/help-legend`.
- Produces:
  - `function HelpGuide({ tripId }: { tripId?: string }): React.JSX.Element`
  - `const HELP_PRINT_STYLE: string` — the print CSS, exported so it can be asserted.

- [ ] **Step 1: Write the failing test**

Create `components/trip/help-guide.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelpGuide, HELP_PRINT_STYLE } from "./help-guide";
import { HELP_SECTIONS } from "@/lib/help-guide";

describe("HelpGuide", () => {
  it("renders a heading for every section", () => {
    render(<HelpGuide tripId="t1" />);
    for (const s of HELP_SECTIONS) {
      expect(screen.getByText(s.title), `missing section: ${s.title}`).toBeTruthy();
    }
  });

  it("renders each section as a native <details> with its id as the anchor", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    for (const s of HELP_SECTIONS) {
      const el = container.querySelector(`details#${s.id}`);
      expect(el, `section ${s.id} is not a <details> with that id`).toBeTruthy();
      expect(el?.querySelector("summary")).toBeTruthy();
    }
  });

  it("uses no client-side disclosure state (native details only)", () => {
    // Guards the no-new-dependency decision: no Radix accordion roles.
    const { container } = render(<HelpGuide tripId="t1" />);
    expect(container.querySelector("[data-radix-collection-item]")).toBeNull();
    expect(container.querySelectorAll("details").length).toBe(HELP_SECTIONS.length);
  });

  it("renders the legend above the collapsible sections", () => {
    render(<HelpGuide tripId="t1" />);
    expect(screen.getByText("Buttons you’ll tap")).toBeTruthy();
  });

  it("warns prominently that an undated thing to do stays off the calendar", () => {
    // ADR 0022: a thing to do with no date appears in NO dated view. Without
    // this callout it reads as a bug.
    render(<HelpGuide tripId="t1" />);
    const callout = screen.getByTestId("undated-callout");
    expect(callout.textContent).toMatch(/won't show up|won’t show up/i);
    expect(callout.textContent).toMatch(/calendar/i);
  });

  it("deep-links into the trip when a tripId is given", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const planLink = container.querySelector('a[href="/trips/t1/plan"]');
    expect(planLink).toBeTruthy();
  });

  it("renders no trip links at all without a tripId", () => {
    const { container } = render(<HelpGuide />);
    expect(container.querySelector('a[href^="/trips/"]')).toBeNull();
  });

  it("still names the tab in plain text without a tripId", () => {
    render(<HelpGuide />);
    // The reader must still learn WHERE to go even with no link to tap.
    expect(screen.getAllByText("Plan").length).toBeGreaterThan(0);
  });

  it("never calls a thing to do an 'activity'", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toContain("activities");
    // "Activity" alone is legal — it is the real name of the change-log tab.
    expect(text).not.toContain("add an activity");
  });

  it("never mentions Discreet mode", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    expect((container.textContent ?? "").toLowerCase()).not.toContain("discreet");
  });
});

describe("HELP_PRINT_STYLE", () => {
  it("forces every collapsed section open when printing", () => {
    expect(HELP_PRINT_STYLE).toContain("@media print");
    expect(HELP_PRINT_STYLE).toContain("details");
    expect(HELP_PRINT_STYLE).toContain("display: block");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/trip/help-guide.test.tsx`
Expected: FAIL — `Failed to resolve import "./help-guide"`.

- [ ] **Step 3: Write the implementation**

Create `components/trip/help-guide.tsx`. The scaffolding below is complete; write the per-section prose following the constraints in the header comment.

```tsx
import * as React from "react";
import { ChevronRight } from "lucide-react";
import { HelpLegend } from "@/components/trip/help-legend";
import {
  HELP_SECTIONS,
  sectionsInGroup,
  guideTripHref,
  type GuideTripSegment,
  type HelpSection,
} from "@/lib/help-guide";

/**
 * The in-app user guide body.
 *
 * Server component. Native <details> disclosures — no client state and no
 * accordion dependency, so browser find-in-page still reaches collapsed text
 * and the print stylesheet can force everything open.
 *
 * WRITING RULES (binding — see the plan's Global Constraints):
 *  - Warm, plain, second person. Short active sentences.
 *  - Use the UI's exact words, glossed on first use: "a Stop (a place you're
 *    based for a few nights)".
 *  - NEVER "activity" for a thing to do — Activity is the change-log tab.
 *  - NEVER "itinerary" for the Plan.
 *  - No personal names, no specific trip. This ships to every user.
 *  - Never mention Discreet mode. It was removed.
 */

/** Print CSS: expand every section so a printout is complete. */
export const HELP_PRINT_STYLE = `
  @media print {
    details > summary { list-style: none; }
    details > *:not(summary) { display: block !important; }
    .help-print-hide { display: none !important; }
  }
`;

/** A link into the trip, degrading to bold text when there is no trip. */
function Go({
  tripId,
  segment,
  children,
}: {
  tripId?: string;
  segment: GuideTripSegment;
  children: React.ReactNode;
}) {
  const href = guideTripHref(tripId, segment);
  if (!href) {
    return <strong className="font-semibold text-foreground">{children}</strong>;
  }
  return (
    <a
      href={href}
      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
    >
      {children}
    </a>
  );
}

/** One collapsible section. */
function Section({
  section,
  children,
}: {
  section: HelpSection;
  children: React.ReactNode;
}) {
  return (
    <details
      id={section.id}
      className="group rounded-xl border border-border bg-card px-4 py-3"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
        />
        <span className="flex min-w-0 flex-col">
          <span className="font-display text-base font-semibold text-foreground">
            {section.title}
          </span>
          <span className="text-sm text-muted-foreground">{section.blurb}</span>
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3 border-t border-border/60 pt-3 text-sm leading-relaxed text-foreground">
        {children}
      </div>
    </details>
  );
}

/** Look a section up by id so bodies can't drift from the data module. */
function sectionById(id: string): HelpSection {
  const found = HELP_SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown help section: ${id}`);
  return found;
}

export function HelpGuide({ tripId }: { tripId?: string }) {
  return (
    <div className="flex flex-col gap-8">
      <style>{HELP_PRINT_STYLE}</style>

      {/* ── Always-visible key ── */}
      <section aria-labelledby="help-legend-heading">
        <h2
          id="help-legend-heading"
          className="mb-4 font-display text-xl font-bold text-foreground"
        >
          What the buttons mean
        </h2>
        <HelpLegend />
      </section>

      {/* ── Everyday sections ── */}
      <section aria-labelledby="help-everyday-heading">
        <h2
          id="help-everyday-heading"
          className="mb-4 font-display text-xl font-bold text-foreground"
        >
          Using it day to day
        </h2>
        <div className="flex flex-col gap-3">
          {/* One <Section> per everyday id, in HELP_SECTIONS order. */}
          <Section section={sectionById("sixty-seconds")}>
            {/* Write the six-step loop here. Reference the tabs with <Go>. */}
          </Section>

          <Section section={sectionById("things-to-do")}>
            {/* The main flow: Plan → a Stop → "Add Thing to Do".
                MUST include the callout below, exactly this testid. */}
            <p
              data-testid="undated-callout"
              className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2"
            >
              <strong className="font-semibold">Worth knowing:</strong> a thing
              to do won&rsquo;t show up on the{" "}
              <Go tripId={tripId} segment="calendar">
                Calendar
              </Go>{" "}
              until you give it a day. That&rsquo;s on purpose — it&rsquo;s
              parked against the place, waiting for you to decide when. Giving
              it a day is a separate step, and it&rsquo;s the next section.
            </p>
          </Section>

          {/* ...remaining everyday sections... */}
        </div>
      </section>

      {/* ── Advanced ── */}
      <section aria-labelledby="help-advanced-heading">
        <h2
          id="help-advanced-heading"
          className="mb-2 font-display text-xl font-bold text-foreground"
        >
          Going deeper
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          None of this is needed to plan a trip. Come back when you&rsquo;re
          curious.
        </p>
        <div className="flex flex-col gap-3">
          {/* One <Section> per advanced id. */}
        </div>
      </section>

      {/* ── Reference ── */}
      <section aria-labelledby="help-reference-heading">
        <h2
          id="help-reference-heading"
          className="mb-4 font-display text-xl font-bold text-foreground"
        >
          Looking something up
        </h2>
        <div className="flex flex-col gap-3">
          {/* The word-list section. */}
        </div>
      </section>
    </div>
  );
}
```

**Content requirements for the prose you write into each `<Section>`:**

Every section listed in `HELP_SECTIONS` must have a `<Section>` with real prose — the test asserts one `<details>` per entry, so an empty body fails review even though it passes the count. Cover, per section:

- **sixty-seconds** — the loop: open <Go segment="plan">Plan</Go> → tap a place → add things to do → give them days on the <Go segment="calendar">Calendar</Go> → check <Go segment="budget">Budget</Go> → glance at <Go segment="summary">Summary</Go>.
- **trip-shape** — a **Stop** (a place you're based for a few nights), a **Chapter** (a coloured band grouping a stretch), the **Home base** (where you set off from, shown top and bottom of the Plan). Say plainly that the places and dates are already set up.
- **things-to-do** — Plan → tap a Stop → **Add Thing to Do**; the fields (what it is, what kind, address, link, booking reference, notes, and roughly what it costs). Include the callout verbatim as scaffolded.
- **giving-a-day** — open <Go segment="calendar">Calendar</Go>, switch between month grid and day-by-day list, drag onto a day, or open the day itself and add there. Times are optional; things with a time sort by time, things without sit after them. Mention the day map and the weather/daylight strip.
- **undecided** — the **Wishlist** (trip-wide, kept separate from the plan), **Votes** as the how-do-we-both-feel step, the **Globe** (an everywhere-someday map shared across all your trips) and its suggestions. Explain that scheduling a Wishlist idea *copies* it in and the idea stays put, marked as already in this plan.
- **sleeping-moving** — **Accommodation** per Stop (check-in/out, address, confirmation number), **Transport** between Stops (mode, times, reference); note both take a cost.
- **money** — the important distinction: **cost** is what you reckon it costs (or the real price once booked); **paid** is money that has actually left the account, and marking something paid asks for the amount. Then <Go segment="budget">Budget</Go> for the roll-up and ticking things off in bulk. Do not use the words "estimated" or "actual" — ADR 0037 retired them.
- **getting-ready** — <Go segment="checklists">Checklists</Go> (things to sort, and a packing list), <Go segment="files">Files</Go> for tickets and confirmations.
- **together** — notes on a Stop or a thing to do, the <Go segment="activity">Activity</Go> feed as the record of who changed what, and the bell for what changed since you last looked.
- **away** — the trip Home becomes a today-focused view once you're travelling; <Go segment="journal">Journal</Go> per day; pages you've visited work without signal; the calendar feed can be followed from a phone calendar.
- **something-off** — **Flags** (gaps the app spots: a night with nowhere booked, no way to get between two places, a day with too much on) and **Next steps** on Home as the ranked to-do.
- **chapters** — bands are decided by dates, can't overlap, and heal themselves when a place is re-dated.
- **dates-and-pins** — **rough** vs **scheduled**, **Firm up** flowing dates forward, **Pinned** meaning "don't move this", and that changing one place's nights ripples to the ones after it.
- **make-it-fit** — offered when the plan runs past the date you must be home; previews trimming nights or dropping a place; nothing changes until you say so.
- **forks** — a second version of the plan to compare; edits to a fork don't touch the real one; <Go segment="compare">Compare</Go> shows them side by side; promoting one replaces the real plan and discards the rest.
- **word-list** — a definition list of: Stop, Chapter, Home base, thing to do, Wishlist, Globe, Vote, Accommodation, Transport, cost, paid, Flag, Next steps, Fork, Pinned, rough, Firm up, Journal, Activity. Plain English, consistent with `CONTEXT.md`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/trip/help-guide.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/trip/help-guide.tsx components/trip/help-guide.test.tsx
git commit -m "feat(help): add guide content component with details sections"
```

---

### Task 5: The two routes

**Files:**
- Create: `app/(app)/help/page.tsx`
- Test: `app/(app)/help/page.test.tsx`
- Create: `app/(app)/trips/[tripId]/help/page.tsx`
- Test: `app/(app)/trips/[tripId]/help/page.test.tsx`

**Interfaces:**
- Consumes: `HelpGuide` from `@/components/trip/help-guide`; `requireTripAccess` from `@/lib/guards`.
- Produces: two default-exported page components, plus `metadata` on each.

- [ ] **Step 1: Write the failing tests**

Create `app/(app)/help/page.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/trip/help-guide", () => ({
  HelpGuide: ({ tripId }: { tripId?: string }) => (
    <div data-testid="guide" data-trip-id={tripId ?? ""} />
  ),
}));

import HelpPage, { metadata } from "./page";

describe("global /help page", () => {
  it("has a title", () => {
    expect(metadata.title).toBeTruthy();
  });

  it("renders the guide with no tripId, so links degrade to text", () => {
    render(<HelpPage />);
    expect(screen.getByTestId("guide").getAttribute("data-trip-id")).toBe("");
  });

  it("renders a page heading", () => {
    render(<HelpPage />);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });
});
```

Create `app/(app)/trips/[tripId]/help/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const requireTripAccess = vi.fn();
vi.mock("@/lib/guards", () => ({ requireTripAccess: (id: string) => requireTripAccess(id) }));
vi.mock("@/components/trip/help-guide", () => ({
  HelpGuide: ({ tripId }: { tripId?: string }) => (
    <div data-testid="guide" data-trip-id={tripId ?? ""} />
  ),
}));

import TripHelpPage from "./page";

beforeEach(() => {
  requireTripAccess.mockReset();
});

describe("trip-scoped help page", () => {
  it("guards access before rendering", async () => {
    await TripHelpPage({ params: Promise.resolve({ tripId: "t1" }) });
    expect(requireTripAccess).toHaveBeenCalledWith("t1");
  });

  it("passes the tripId through so links deep-link into the trip", async () => {
    const ui = await TripHelpPage({ params: Promise.resolve({ tripId: "t1" }) });
    render(ui);
    expect(screen.getByTestId("guide").getAttribute("data-trip-id")).toBe("t1");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/help/page.test.tsx" "app/(app)/trips/[tripId]/help/page.test.tsx"`
Expected: FAIL — both `./page` imports unresolved.

- [ ] **Step 3: Write the global route**

Create `app/(app)/help/page.tsx`:

```tsx
import type { Metadata } from "next";
import { HelpGuide } from "@/components/trip/help-guide";

export const metadata: Metadata = {
  title: "How to use TEEPEE",
  description: "A short guide to planning a trip together in TEEPEE.",
};

export default function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          How to use TEEPEE
        </h1>
        <p className="text-sm text-muted-foreground">
          Everything you need, shortest bits first. Open a trip to get links
          that jump straight to the right screen.
        </p>
      </div>
      <HelpGuide />
    </div>
  );
}
```

- [ ] **Step 4: Write the trip-scoped route**

Create `app/(app)/trips/[tripId]/help/page.tsx`:

```tsx
import type { Metadata } from "next";
import { requireTripAccess } from "@/lib/guards";
import { HelpGuide } from "@/components/trip/help-guide";

export const metadata: Metadata = {
  title: "How to use TEEPEE",
  description: "A short guide to planning this trip together.",
};

export default async function TripHelpPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          How to use TEEPEE
        </h1>
        <p className="text-sm text-muted-foreground">
          Everything you need, shortest bits first. The links jump straight to
          the right screen in this trip.
        </p>
      </div>
      <HelpGuide tripId={tripId} />
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/help/page.test.tsx" "app/(app)/trips/[tripId]/help/page.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/help" "app/(app)/trips/[tripId]/help"
git commit -m "feat(help): add global and trip-scoped help routes"
```

---

### Task 6: Wire the guide into navigation

**Files:**
- Modify: `components/trip/trip-nav.tsx:26` (`moreNav`)
- Modify: `components/trip/trip-nav.test.tsx`
- Modify: `app/(app)/layout.tsx` (avatar dropdown, ~line 122)
- Modify: `app/(app)/layout.test.tsx`

**Interfaces:**
- Consumes: the routes from Task 5.
- Produces: a `Help` entry in `moreNav()` and a `/help` link in the avatar dropdown.

**Note:** Help is NOT plan-scoped, so it must NOT carry `?plan=`. Follow how `Journal`, `Checklists`, `Files` and `Activity` are built in the same function.

- [ ] **Step 1: Write the failing nav test**

Add to `components/trip/trip-nav.test.tsx`, inside the existing `describe("TripNav")` block:

```tsx
  it("includes Help in the More menu without a ?plan= param", () => {
    const hrefs = Object.fromEntries(
      moreNav("t1", "fork-9").map((i) => [i.label, i.href]),
    );
    // Help is not plan-scoped — the guide is the same for every plan.
    expect(hrefs["Help"]).toBe("/trips/t1/help");
  });

  it("puts Help last in the More menu", () => {
    const labels = moreNav("t1").map((i) => i.label);
    expect(labels[labels.length - 1]).toBe("Help");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run components/trip/trip-nav.test.tsx`
Expected: FAIL — `expected undefined to be '/trips/t1/help'`.

- [ ] **Step 3: Add the nav entry**

In `components/trip/trip-nav.tsx`, add to the array returned by `moreNav()` as the final entry, after `Settings`:

```ts
    { label: "Help", href: `${base}/help` },
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run components/trip/trip-nav.test.tsx`
Expected: PASS.

Note: `mobile-tab-bar.tsx:14` imports `moreNav`, so the mobile sheet picks Help up with no further change. Run `npx vitest run components/trip/mobile-tab-bar.test.tsx` to confirm nothing there asserted an exact item count; if it did, update that expectation.

- [ ] **Step 5: Write the failing layout test**

Add to `app/(app)/layout.test.tsx`, inside the existing top-level describe:

```tsx
  it("offers a Help link in the traveller dropdown", async () => {
    // Reuse whatever fixture the surrounding tests use to render AppLayout.
    const ui = await AppLayout({ children: <div /> });
    render(ui);
    const link = screen.getByRole("link", { name: /help/i });
    expect(link.getAttribute("href")).toBe("/help");
  });
```

If the existing tests use a shared render helper or a signed-in `auth` mock fixture, use that same setup rather than calling `AppLayout` directly.

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run "app/(app)/layout.test.tsx"`
Expected: FAIL — unable to find a link named /help/i.

- [ ] **Step 7: Add the dropdown link**

In `app/(app)/layout.tsx`, inside `<DropdownMenuContent>`, between the `<DropdownMenuSeparator />` and `<SignOutMenuItem />`:

```tsx
                <DropdownMenuItem asChild>
                  <Link href="/help">How to use TEEPEE</Link>
                </DropdownMenuItem>
```

`Link` is already imported in this file. If `DropdownMenuItem` is not yet imported, add it to the existing `@/components/ui/dropdown-menu` import.

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run "app/(app)/layout.test.tsx"`
Expected: PASS.

- [ ] **Step 9: Typecheck and commit**

```bash
npx tsc --noEmit
git add components/trip/trip-nav.tsx components/trip/trip-nav.test.tsx "app/(app)/layout.tsx" "app/(app)/layout.test.tsx"
git commit -m "feat(help): link the guide from the More menu and traveller dropdown"
```

---

### Task 7: Add the guide to the offline warm-set

**Files:**
- Modify: `lib/offline.ts:30`
- Modify: `lib/offline.test.ts` (both exact-array assertions, ~lines 173 and 187)

**Interfaces:**
- Consumes: the trip-scoped route from Task 5.
- Produces: `tripOfflinePaths()` returning six base paths instead of five.

**Do NOT modify `public/sw.js`.** It mirrors only the cache-*strategy* logic, not the warm-set; navigations are already network-first with cache fallback.

- [ ] **Step 1: Update the failing tests**

In `lib/offline.test.ts`, add `'/trips/t1/help'` to both expected arrays. First (`returns base paths + one /day/ path per date in an inclusive range`):

```ts
    expect(paths).toEqual([
      '/trips/t1',
      '/trips/t1/plan',
      '/trips/t1/summary',
      '/trips/t1/today',
      '/trips/t1/checklists',
      '/trips/t1/help',
      '/trips/t1/day/2026-07-01',
      '/trips/t1/day/2026-07-02',
      '/trips/t1/day/2026-07-03',
    ]);
```

Second (`returns only the five non-day paths when dates are null`) — rename the test to say six:

```ts
  it('returns only the six non-day paths when dates are null', () => {
    const paths = tripOfflinePaths('t1', null, null);
    expect(paths).toEqual([
      '/trips/t1',
      '/trips/t1/plan',
      '/trips/t1/summary',
      '/trips/t1/today',
      '/trips/t1/checklists',
      '/trips/t1/help',
    ]);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/offline.test.ts`
Expected: FAIL on both, with `/trips/t1/help` missing from actual.

- [ ] **Step 3: Add the path**

In `lib/offline.ts`, change the `paths` array in `tripOfflinePaths()` to:

```ts
  const paths = [base, `${base}/plan`, `${base}/summary`, `${base}/today`, `${base}/checklists`, `${base}/help`];
```

Also update that function's doc comment to mention the guide:

```ts
/**
 * The set of same-origin paths worth pre-caching for offline viewing of a trip:
 * the read-while-travelling essentials (including the user guide) + one page
 * per dated day (capped). Pure — no browser APIs.
 */
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run lib/offline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/offline.ts lib/offline.test.ts
git commit -m "feat(help): pre-cache the guide for offline reading"
```

---

### Task 8: Whole-branch verification

**Files:** none created or modified unless a gate fails.

**Interfaces:**
- Consumes: every prior task.
- Produces: evidence the branch is green.

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Full test suite**

Run: `npm run test`
Expected: all tests pass. Report the total count. Investigate any failure — do not skip or delete a failing test.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds, and both `/help` and `/trips/[tripId]/help` appear in the route manifest output.

- [ ] **Step 5: Confirm the drift guards actually bite**

Prove the guards work rather than assuming it. Temporarily rename the `Calendar` label in `primaryNav()` to `Calender`, then run:

```bash
npx vitest run lib/help-guide.test.ts
```

Expected: FAIL with `nav label "Calendar" no longer exists`. **Revert the edit** and re-run to confirm PASS.

- [ ] **Step 6: Commit any fixes and report**

```bash
git status
```

Expected: clean tree. Report to the requester: tests passing count, build result, and the guard-bites confirmation. Do NOT merge to `main`. Do NOT deploy.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Global `/help` + trip-scoped route, shared component, optional trip context | 5 |
| Static content, no queries, no live data | 4, 5 (enforced in Global Constraints) |
| Live UI specimens for icons/buttons | 3 |
| Native `<details>`, no new dependency | 4 |
| Print stylesheet forcing sections open | 4 |
| Everyday 80% above, "Going deeper" below | 2 (groups), 4 (rendering) |
| App terms glossed on first use; no "activity" | 2, 4 (asserted by test) |
| Stop-first as the default flow | 4 (`things-to-do` before `giving-a-day`) |
| Prominent undated-item callout | 4 (`data-testid="undated-callout"`) |
| Wishlist/Votes/Globe as the second path | 4 (`undecided` section) |
| Cost vs Paid, no "estimated"/"actual" | 4 (`money` section) |
| `moreNav()` entry + avatar dropdown link | 6 |
| Offline warm-set | 7 |
| Drift tests: nav labels + route existence | 2, proven in 8 |
| Prose asserted loosely, by heading only | 4 |
| Discreet mode removed from docs | 1 |
| Settings excluded | Global Constraints |
| No merge, no deploy | Global Constraints, 8 |

**Placeholder scan:** the scaffolded `<Section>` bodies in Task 4 are intentionally left for the implementer, but every one has explicit per-section content requirements listed immediately below the code block, and the callout is given verbatim. No "TBD", no "handle edge cases", no "similar to Task N".

**Type consistency:** `HelpSection`, `HelpGroup`, `GuideTripSegment`, `HELP_SECTIONS`, `sectionsInGroup`, `guideTripHref`, `LEGEND_ENTRIES`, `HelpGuide`, `HELP_PRINT_STYLE` and `HelpLegend` are each defined once in Task 2/3/4 and referenced with identical names and signatures downstream. `guideTripHref` returns `string | undefined` everywhere. `compare` is in `GUIDE_TRIP_SEGMENTS` because the `forks` section links to it.
