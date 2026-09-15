# Help Guide Refresh & Admin Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the in-app user guide up to date, make it readable rather than a wall of collapsed rows, add the three sections it is missing (Search, trip settings, Globe) — and let an admin account delete any trip it is a member of.

**Architecture:** The guide is a server component (`components/trip/help-guide.tsx`) rendering native `<details>` bodies, with every *claim* it makes about the app held as testable data in `lib/help-guide.ts` and asserted against the real nav, routes and UI source by drift guards in `lib/help-guide.test.ts`. That split is preserved throughout: new sections add data-module entries **and** bodies in the same commit, and every control the guide quotes gains a `GUIDE_UI_STRINGS` guard. Readability is achieved without giving up the no-client-state design — a `:target` CSS rule opens a linked section, and only the Expand-all button is a (tiny, separate) client component. The admin delete is an `ADMIN_EMAILS` env lookup consulted at the two places that gate deletion; `requireTripAccess` is deliberately untouched.

**Tech Stack:** Next.js 16 App Router, React 19 server components, TypeScript 5, Tailwind v4, Prisma 7, Vitest + Testing Library.

## Global Constraints

- **Guide writing rules** (already binding, in the header comment of `components/trip/help-guide.tsx` — copy verbatim into any new prose):
  - Warm, plain, second person. Short active sentences.
  - Use the UI's exact words, glossed on first use: "a Stop (a place you're based for a few nights)".
  - NEVER "activity" for a thing to do — Activity is the change-log tab.
  - NEVER "itinerary" for the Plan.
  - No personal names, no specific trip. **This ships to every user.**
  - Never mention Discreet mode. It was removed.
- **The admin delete power is NOT documented in the guide** — it ships to every user, and it is not a feature they have.
- Terminology follows `CONTEXT.md`. The surface added in Task 3 is called **Search**; "command palette" is the code name only, never user-facing prose.
- Every control name the guide quotes must be added to `GUIDE_UI_STRINGS` in `lib/help-guide.ts`, **except** single generic words whose last occurrence would survive a rename (the module's stated policy — e.g. do not add bare "Chapters", "Settings", "Delete").
- A `HELP_SECTIONS` entry with no rendered body **fails** `help-guide.test.tsx` ("gives every section a real body", minimum 200 chars). Data entry and body land in the same commit, always.
- `components/trip/help-guide.tsx` must stay a **server component**. No `"use client"` in that file.
- Existing test `help-guide.test.tsx:26` ("uses no client-side disclosure state") must keep passing **unmodified**.
- Run the suite with `npm test`. Lint with `npm run lint`.
- Work happens on branch `docs/help-guide-refresh`. Never commit to `main`.

---

### Task 1: Admin delete power

**Files:**
- Create: `lib/admin.ts`
- Create: `lib/admin.test.ts`
- Create: `docs/adr/0045-admin-delete-scoped-to-membership.md`
- Modify: `server/actions/trips.ts:250-256` (the owner check inside `deleteTrip`)
- Modify: `app/(app)/trips/[tripId]/settings/page.tsx:30` and `:195` (the `isOwner` gate)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `isAdminEmail(email: string | null | undefined): boolean` from `@/lib/admin`. No later task depends on it.

**Context an implementer needs:** `deleteTrip` currently calls `requireTripAccess(tripId)` — which `notFound()`s for non-members, deliberately, so trips can't be enumerated — and then rejects anyone whose `membership.role !== "owner"`. We are relaxing **only** the second check. Membership is still required. The Danger zone card in the settings page wraps **both** `DuplicateTripDialog` and `DangerZone`, so an admin gains both buttons; that is intended.

- [ ] **Step 1: Write the failing test**

Create `lib/admin.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { isAdminEmail } from "./admin";

const ORIGINAL = process.env.ADMIN_EMAILS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL;
});

describe("isAdminEmail", () => {
  it("is false for everyone when ADMIN_EMAILS is unset", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail("cam@example.com")).toBe(false);
  });

  it("is false for everyone when ADMIN_EMAILS is empty or whitespace", () => {
    process.env.ADMIN_EMAILS = "   ";
    expect(isAdminEmail("cam@example.com")).toBe(false);
  });

  it("recognises a listed email", () => {
    process.env.ADMIN_EMAILS = "cam@example.com";
    expect(isAdminEmail("cam@example.com")).toBe(true);
  });

  it("recognises one of several, ignoring surrounding whitespace", () => {
    process.env.ADMIN_EMAILS = " a@example.com , cam@example.com ";
    expect(isAdminEmail("cam@example.com")).toBe(true);
    expect(isAdminEmail("a@example.com")).toBe(true);
  });

  it("matches case-insensitively, since email casing is not significant here", () => {
    process.env.ADMIN_EMAILS = "Cam@Example.COM";
    expect(isAdminEmail("cam@example.com")).toBe(true);
  });

  it("rejects an unlisted email", () => {
    process.env.ADMIN_EMAILS = "cam@example.com";
    expect(isAdminEmail("someone@example.com")).toBe(false);
  });

  it("rejects null and undefined rather than throwing", () => {
    process.env.ADMIN_EMAILS = "cam@example.com";
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it("never treats the empty string as a match, even against a trailing comma", () => {
    // "a@example.com," splits to ["a@example.com", ""] — an empty candidate
    // must not match a user whose email is somehow empty.
    process.env.ADMIN_EMAILS = "a@example.com,";
    expect(isAdminEmail("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/admin.test.ts`
Expected: FAIL — cannot resolve `./admin`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/admin.ts`:

```ts
/**
 * Admin recognition.
 *
 * An admin is an email listed in the ADMIN_EMAILS env var (comma-separated).
 * Server-only: never import this into a client component, and never send the
 * result to the browser for anything but rendering an already-guarded control.
 *
 * Deliberately NOT a column on User: one operator does not justify a
 * migration, and an env var is revocable without a deploy of new code. See
 * ADR 0045 for why this grants no power over trips the admin isn't a member
 * of.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return false;
  const needle = email.trim().toLowerCase();
  if (!needle) return false;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0)
    .includes(needle);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/admin.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write the failing test for the relaxed owner check**

Open `server/actions/trips.test.ts` (it exists; find the `deleteTrip` describe block and match its existing mocking style for `requireTripAccess`, `db` and `getStorage`). Add:

```ts
describe("deleteTrip — admin override", () => {
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it("lets a non-owner member delete when their email is in ADMIN_EMAILS", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    requireTripAccessMock.mockResolvedValue({
      user: { id: "u1", email: "admin@example.com" },
      membership: { userId: "u1", role: "member" },
    });

    await expect(deleteTrip("trip_1")).rejects.toThrow(); // redirect() throws
    expect(db.trip.delete).toHaveBeenCalledWith({ where: { id: "trip_1" } });
  });

  it("still refuses a non-owner member who is not an admin", async () => {
    delete process.env.ADMIN_EMAILS;
    requireTripAccessMock.mockResolvedValue({
      user: { id: "u2", email: "someone@example.com" },
      membership: { userId: "u2", role: "member" },
    });

    const result = await deleteTrip("trip_1");
    expect(result).toEqual({
      success: false,
      error: "Only the trip owner can delete the trip.",
    });
    expect(db.trip.delete).not.toHaveBeenCalled();
  });

  it("still requires membership — an admin gets no bypass of requireTripAccess", async () => {
    // requireTripAccess notFound()s for non-members; deleteTrip must not
    // catch or route around that, so the rejection propagates.
    process.env.ADMIN_EMAILS = "admin@example.com";
    requireTripAccessMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(deleteTrip("trip_someone_elses")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(db.trip.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run server/actions/trips.test.ts -t "admin override"`
Expected: FAIL — the first test errors because the owner check returns the refusal instead of deleting.

- [ ] **Step 7: Implement the relaxed check**

In `server/actions/trips.ts`, add to the imports at the top of the file:

```ts
import { isAdminEmail } from "@/lib/admin";
```

Then replace the owner check inside `deleteTrip`:

```ts
  if (membership.role !== "owner") {
    return { success: false, error: "Only the trip owner can delete the trip." };
  }
```

with:

```ts
  // Owner, or an operator listed in ADMIN_EMAILS. Membership is still
  // required — requireTripAccess above already notFound()s for non-members,
  // and an admin gets no bypass of it (ADR 0045).
  if (membership.role !== "owner" && !isAdminEmail(user.email)) {
    return { success: false, error: "Only the trip owner can delete the trip." };
  }
```

Note `requireTripAccess` returns `{ user, membership }` — `user` is already destructured at the top of `deleteTrip` if the existing code reads `const { membership } = ...`; widen that destructure to `const { user, membership } = await requireTripAccess(tripId);`.

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run server/actions/trips.test.ts`
Expected: PASS, including the three new tests and every pre-existing `deleteTrip` test.

- [ ] **Step 9: Write the failing test for the settings-page gate**

In `app/(app)/trips/[tripId]/settings/page.test.tsx`, following the file's existing mocking style:

```ts
it("shows the Danger zone to an admin who is only a member", async () => {
  process.env.ADMIN_EMAILS = "admin@example.com";
  requireTripAccessMock.mockResolvedValue({
    user: { id: "u1", email: "admin@example.com" },
    membership: { userId: "u1", role: "member" },
  });

  render(await SettingsPage({ params: Promise.resolve({ tripId: "t1" }) }));
  expect(screen.getByText("Danger zone")).toBeTruthy();
  delete process.env.ADMIN_EMAILS;
});

it("hides the Danger zone from an ordinary member", async () => {
  delete process.env.ADMIN_EMAILS;
  requireTripAccessMock.mockResolvedValue({
    user: { id: "u2", email: "someone@example.com" },
    membership: { userId: "u2", role: "member" },
  });

  render(await SettingsPage({ params: Promise.resolve({ tripId: "t1" }) }));
  expect(screen.queryByText("Danger zone")).toBeNull();
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npx vitest run "app/(app)/trips/[tripId]/settings/page.test.tsx"`
Expected: FAIL — "Danger zone" not found for the admin member.

- [ ] **Step 11: Implement the gate**

In `app/(app)/trips/[tripId]/settings/page.tsx`, add to the imports:

```ts
import { isAdminEmail } from "@/lib/admin";
```

Change line 30 from:

```ts
  const isOwner = membership.role === "owner";
```

to:

```ts
  // Admins get the Danger zone (Duplicate + Delete) on any trip they are a
  // member of. They are still not owners for anything else. See ADR 0045.
  const isOwner = membership.role === "owner";
  const canManageTrip = isOwner || isAdminEmail(user.email);
```

and change the gate at line 195 from `{isOwner && (` to `{canManageTrip && (`. Ensure `user` is destructured from `requireTripAccess` at the top of the component.

Update the comment above the gate from `{/* ── Danger zone (owner only) — includes Duplicate ── */}` to `{/* ── Danger zone (owner or admin) — includes Duplicate ── */}`.

- [ ] **Step 12: Run test to verify it passes**

Run: `npx vitest run "app/(app)/trips/[tripId]/settings/page.test.tsx"`
Expected: PASS.

- [ ] **Step 13: Write the ADR**

Create `docs/adr/0045-admin-delete-scoped-to-membership.md`, matching the format of a recent neighbour such as `docs/adr/0040-feedback-notes-captured-in-product-exported-to-a-committed-inbox.md`:

```markdown
# 45. Admin delete is scoped to membership, not to the database

Date: 2026-09-15

## Status

Accepted

## Context

Deleting a Trip is owner-only: `deleteTrip` refuses anyone whose
`TripMember.role` is not `owner`. The operator of the app is not always the
owner of every Trip they are on — a Trip created by the other Traveller
cannot be deleted by them at all, which leaves abandoned Trips that only
someone else can clear up.

There is no admin concept anywhere in the codebase. `User` has no role
column; the only role in the model is `TripMember.role`, which is per-Trip.

Two guards stand between a user and deleting an arbitrary Trip:

1. `requireTripAccess` calls `notFound()` for non-members, deliberately — its
   comment records that this is so the app "never leak[s] the existence of
   trips the user can't access".
2. The owner-only check inside `deleteTrip`.

## Decision

Relax **only** the second guard. An account whose email appears in the
`ADMIN_EMAILS` environment variable may delete any Trip **it is already a
member of**, even when it is not the owner. `requireTripAccess` is untouched,
so an admin still cannot see, reach, or delete a Trip they are not on, and
Trips remain non-enumerable.

Recognition is by env var rather than an `isAdmin` column on `User`. The
variable is absent in development and test, so no test runs with admin
powers by accident.

The same check gates the Danger zone card on the Trip settings page, which
carries **Duplicate** as well as **Delete**; an admin gains both.

## Consequences

- The privacy property that motivated the `notFound()` in `requireTripAccess`
  survives intact. "Admin" here means "not blocked by ownership", not
  "sees everything".
- Granting or revoking admin is an env change, not a deploy of new code and
  not a migration.
- A privileged email is not committed to the repository.
- The power is invisible in the app: nothing announces it, and the in-app
  guide does not mention it, because the guide ships to every user.
- If a genuine operator console is ever wanted — listing Trips the operator
  is not on — that is a different decision and will need its own ADR, since
  it must knowingly break the no-enumeration guarantee.
```

- [ ] **Step 14: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS, no new failures.

- [ ] **Step 15: Commit**

```bash
git add lib/admin.ts lib/admin.test.ts server/actions/trips.ts server/actions/trips.test.ts "app/(app)/trips/[tripId]/settings/page.tsx" "app/(app)/trips/[tripId]/settings/page.test.tsx" docs/adr/0045-admin-delete-scoped-to-membership.md
git commit -m "feat(trips): let ADMIN_EMAILS accounts delete trips they're on"
```

---

### Task 2: Fix the Chapters claims

**Files:**
- Modify: `components/trip/help-guide.tsx:194-234` (the `trip-shape` section body)
- Modify: `components/trip/help-guide.tsx:692-754` (the `chapters` section body)
- Modify: `lib/help-guide.ts` (`GUIDE_UI_STRINGS`)
- Modify: `lib/help-guide.ts` (`HELP_SECTIONS` — the `trip-shape` blurb)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks depend on.

**Context an implementer needs:** `prisma/schema.prisma:121` declares `chaptersEnabled Boolean @default(false)`. Chapters are **off by default on new trips**. The guide currently teaches Chapters as one of three things that make up a trip's shape, and tells the reader to use **New Chapter** and **Suggest from countries** on the Plan — controls that do not exist until chapters are turned on.

The real control, in `components/trip/itinerary-manager.tsx:2084-2121`, is a **Chapters** dropdown button on the Plan:
- chapters off → a single item, **Group into chapters…**
- chapters on → **New Chapter**, **Suggest from countries**, a separator, **Turn off chapters**

`CONTEXT.md` agrees: "Chapters are **opt-in per Trip** ... off by default on new Trips ... while it is off the Trip renders as one flat, ungrouped plan".

- [ ] **Step 1: Write the failing test**

Add to `components/trip/help-guide.test.tsx`, inside the `describe("HelpGuide")` block:

```tsx
it("tells the reader Chapters are optional and how to switch them on", () => {
  // schema.prisma: chaptersEnabled defaults to false. A guide that teaches
  // Chapters as always-present sends a new user looking for bands that
  // aren't there.
  const { container } = render(<HelpGuide tripId="t1" />);
  const shape = container.querySelector("details#trip-shape")?.textContent ?? "";
  const chapters = container.querySelector("details#chapters")?.textContent ?? "";

  expect(shape).toContain("Group into chapters");
  expect(chapters).toContain("Group into chapters");
});

it("does not present Chapters as part of the shape every trip has", () => {
  const { container } = render(<HelpGuide tripId="t1" />);
  const shape = container.querySelector("details#trip-shape")?.textContent ?? "";
  // The two things always present are the Stop and the Home base. Chapters
  // must be described as something you turn on, not as a third given.
  expect(shape).toMatch(/turn(ed)? (them )?on|switch (them )?on|Group into chapters/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/trip/help-guide.test.tsx -t "Chapters are optional"`
Expected: FAIL — "Group into chapters" is not in the rendered text.

- [ ] **Step 3: Rewrite the `trip-shape` body**

In `components/trip/help-guide.tsx`, in the `sectionById("trip-shape")` section, replace the three-bullet list and the sentence introducing it. The list currently opens "Three things make up the shape:" with bullets for **A Stop**, **A Chapter** and **The Home base**. Change it to two bullets plus an optional extra:

```tsx
            <p>
              It reads top to bottom, in the order you&rsquo;ll travel. Two
              things make up the shape:
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">A Stop</strong> — a place
                you&rsquo;re based for a few nights. Each one is a card showing
                its dates and how many nights you&rsquo;re there.
              </li>
              <li>
                <strong className="font-semibold">The Home base</strong> — where
                you set off from. It shows as a card above the first place and,
                if you&rsquo;re coming home again, below the last one, so the
                plan reads out from home and back to it.
              </li>
            </ul>
            <p>
              A long trip can have one more thing:{" "}
              <strong className="font-semibold">Chapters</strong>, coloured
              bands that group a stretch of the trip into one piece, the way
              you&rsquo;d talk about &ldquo;the Italy bit&rdquo;. A new trip
              doesn&rsquo;t have them — they&rsquo;re off until you ask for
              them. Open the{" "}
              <strong className="font-semibold">Chapters</strong> menu at the
              bottom of the{" "}
              <Go tripId={tripId} segment="plan">
                Plan
              </Go>{" "}
              and choose{" "}
              <strong className="font-semibold">Group into chapters</strong> to
              switch them on. There&rsquo;s a section further down on what
              they do.
            </p>
```

- [ ] **Step 4: Rewrite the opening of the `chapters` body**

In the `sectionById("chapters")` section, insert a new first paragraph **before** the existing "A **Chapter** is a coloured band over a stretch of dates" paragraph:

```tsx
            <p>
              Chapters are off to begin with, so if you&rsquo;ve never turned
              them on this whole section is about something you won&rsquo;t see
              yet. Open the{" "}
              <strong className="font-semibold">Chapters</strong> menu at the
              bottom of the{" "}
              <Go tripId={tripId} segment="plan">
                Plan
              </Go>{" "}
              and choose{" "}
              <strong className="font-semibold">Group into chapters</strong>.
              The same menu has{" "}
              <strong className="font-semibold">Turn off chapters</strong> when
              you&rsquo;ve had enough of them — your bands aren&rsquo;t thrown
              away, they just stop showing, and come back exactly as they were
              if you switch them on again.
            </p>
```

Then fix the shortcuts paragraph near the end of that section. It currently reads "Two shortcuts on the Plan: **New Chapter** draws one by hand, and **Suggest from countries** proposes a set". Replace that opening clause so it names the menu:

```tsx
            <p>
              Both ways of making one live in that same{" "}
              <strong className="font-semibold">Chapters</strong> menu on the{" "}
              <Go tripId={tripId} segment="plan">
                Plan
              </Go>
              : <strong className="font-semibold">New Chapter</strong> draws one
              by hand, and{" "}
              <strong className="font-semibold">Suggest from countries</strong>{" "}
              proposes a set based on where you&rsquo;re going. Either way you
              can rename and redraw them freely afterwards — a suggestion is only
              a starting point.
            </p>
```

- [ ] **Step 5: Update the drift guards and the blurb**

In `lib/help-guide.ts`, in `GUIDE_UI_STRINGS`, under the `// Chapters, dates and pins` comment, add above `"New Chapter"`:

```ts
  "Group into chapters",
  "Turn off chapters",
```

(Do not add bare `"Chapters"` — the module's policy excludes single generic words whose last occurrence would survive a rename.)

In `HELP_SECTIONS`, change the `trip-shape` blurb from `"Places, coloured bands and where you set off from."` to:

```ts
    blurb: "Places, where you set off from, and the optional coloured bands.",
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run components/trip/help-guide.test.tsx lib/help-guide.test.ts`
Expected: PASS. The `GUIDE_UI_STRINGS` drift guard proves "Group into chapters" and "Turn off chapters" are really on screen in `itinerary-manager.tsx`.

- [ ] **Step 7: Commit**

```bash
git add components/trip/help-guide.tsx components/trip/help-guide.test.tsx lib/help-guide.ts
git commit -m "docs(help): chapters are opt-in, and say where the toggle is"
```

---

### Task 3: Add the Search section

**Files:**
- Modify: `lib/help-guide.ts` (`HELP_SECTIONS`, `GUIDE_UI_STRINGS`)
- Modify: `components/trip/help-guide.tsx` (new `<Section>` in the everyday block)
- Modify: `components/trip/help-guide.test.tsx`

**Interfaces:**
- Consumes: the `Section`, `Go` and `sectionById` helpers already in `help-guide.tsx`; `LIST_CLASS`.
- Produces: a `HELP_SECTIONS` entry with `id: "search"`, `group: "everyday"`. Task 6 renders it in the contents list automatically by iterating `HELP_SECTIONS` — no coupling beyond the entry existing.

**Context an implementer needs (all verified against source — do not re-derive):**

`components/command-palette-mount.tsx` registers **⌘K / Ctrl+K** globally, plus a `teepee:open-palette` event. `components/command-palette-trigger.tsx` renders the header control: an icon-only button below `sm`, and above `sm` a pill reading **Search or jump…** with a `⌘K` chip.

`components/command-palette.tsx` renders three groups, in this order:
- **Go to** — the 12 trip pages (Home, Plan, Calendar, Today, Wishlist, Budget, Summary, Checklists, Files, Journal, Activity, Settings), shown only when you are inside a trip; **plus** your other trips, each marked `Switch →`.
- **Do** — Globe, New trip, and (inside a trip) Add Item, Add Stop, plus Toggle theme.
- **Find** — only inside a trip. Free-text search.

`server/actions/search.ts` `searchTrip` matches case-insensitively against Stop names, Item titles, Transport (`depPlace`, `arrPlace` or `reference`) and Accommodation names, **5 of each at most**, filtered by `REAL_PLAN` — so **Fork content is never returned**. Item hits link to the day when dated, otherwise to the Wishlist. When offline the Find group shows **Search needs a connection.** and Go to / Do keep working.

Terminology is fixed by `CONTEXT.md`: call it **Search**. Never write "command palette" in the guide.

- [ ] **Step 1: Write the failing test**

Add to `components/trip/help-guide.test.tsx`:

```tsx
it("documents Search, including that Find is real-plan only", () => {
  const { container } = render(<HelpGuide tripId="t1" />);
  const body = container.querySelector("details#search")?.textContent ?? "";
  expect(body).toContain("Search or jump");
  expect(body).toContain("Go to");
  expect(body).toContain("Find");
  expect(body).toContain("connection");
});

it("never calls Search a command palette", () => {
  // CONTEXT.md: "command palette" is the code name, as Fork is to variant.
  const { container } = render(<HelpGuide tripId="t1" />);
  expect(container.textContent?.toLowerCase()).not.toContain("command palette");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/trip/help-guide.test.tsx -t "documents Search"`
Expected: FAIL — no `details#search` element.

- [ ] **Step 3: Add the data-module entry**

In `lib/help-guide.ts`, in `HELP_SECTIONS`, insert **after** the `together` entry and **before** the `away` entry (Search is everyday, and reads naturally once the reader knows there is a lot to navigate):

```ts
  {
    id: "search",
    title: "Finding things fast",
    blurb: "One box that jumps to any screen, or finds anything you've added.",
    group: "everyday",
  },
```

In `GUIDE_UI_STRINGS`, add a new group at the end:

```ts
  // Search
  "Search or jump",
  "Search needs a connection",
  "New trip",
  "Toggle theme",
```

- [ ] **Step 4: Write the section body**

In `components/trip/help-guide.tsx`, add a new `<Section>` inside the everyday block, between the `together` section and the `away` section:

```tsx
          <Section section={sectionById("search")}>
            <p>
              Once a trip has a few weeks in it, scrolling to find one booking
              gets old. There&rsquo;s one box that solves it, and it&rsquo;s
              worth learning early: the{" "}
              <strong className="font-semibold">Search or jump…</strong> bar at
              the top of every screen. On a phone it&rsquo;s the magnifying
              glass. From a keyboard, <strong className="font-semibold">⌘K</strong>{" "}
              opens it from anywhere — <strong className="font-semibold">Ctrl+K</strong>{" "}
              if you&rsquo;re on Windows.
            </p>
            <p>Start typing and it offers three kinds of answer:</p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">Go to</strong> — every screen
                in this trip, so &ldquo;bud&rdquo; is enough to land on{" "}
                <Go tripId={tripId} segment="budget">
                  Budget
                </Go>
                . Your other trips are in here too, marked{" "}
                <strong className="font-semibold">Switch →</strong>, which is
                the quickest way to cross from one trip to another.
              </li>
              <li>
                <strong className="font-semibold">Do</strong> — a short list of
                things rather than places: start a{" "}
                <strong className="font-semibold">New trip</strong>, open your
                Globe, jump to adding a Stop or an idea, or{" "}
                <strong className="font-semibold">Toggle theme</strong> to flip
                between light and dark.
              </li>
              <li>
                <strong className="font-semibold">Find</strong> — the actual
                searching. It looks through this trip&rsquo;s places, the things
                you&rsquo;ve planned to do, your flights and trains, and where
                you&rsquo;re staying. Trains and flights also match on their
                reference, so pasting a booking code finds the leg. Each result
                takes you to where that thing lives.
              </li>
            </ul>
            <p>
              Two things worth knowing.{" "}
              <strong className="font-semibold">Find</strong> only ever searches
              the real plan — anything that only exists inside a variant
              won&rsquo;t come back, which is deliberate, so a search never
              hands you something that isn&rsquo;t really happening. And Find
              needs a signal: offline it says{" "}
              <strong className="font-semibold">
                Search needs a connection
              </strong>
              , though jumping between screens carries on working.
            </p>
          </Section>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run components/trip/help-guide.test.tsx lib/help-guide.test.ts`
Expected: PASS. The body clears the 200-char minimum comfortably, and every quoted control is proven present by the drift guard.

- [ ] **Step 6: Commit**

```bash
git add lib/help-guide.ts components/trip/help-guide.tsx components/trip/help-guide.test.tsx
git commit -m "docs(help): add a Search section"
```

---

### Task 4: Add the "Your trip's settings" section

**Files:**
- Modify: `lib/help-guide.ts` (`HELP_SECTIONS`, `GUIDE_TRIP_SEGMENTS`, `GUIDE_NAV_LABELS`, `GUIDE_UI_STRINGS`)
- Modify: `components/trip/help-guide.tsx` (new `<Section>` in the advanced block)
- Modify: `components/trip/help-guide.test.tsx`

**Interfaces:**
- Consumes: `Section`, `Go`, `sectionById`, `LIST_CLASS`.
- Produces: `"settings"` added to `GUIDE_TRIP_SEGMENTS`, making `<Go segment="settings">` legal for any later task.

**Context an implementer needs:** `lib/help-guide.ts` currently carries the comment `"Settings" is deliberately absent — it is out of scope.` on `GUIDE_NAV_LABELS`, and `GUIDE_TRIP_SEGMENTS` has no `settings` entry. Both must change, and that comment must be rewritten rather than left contradicting the code. `Settings` **is** a real nav item (`components/trip/trip-nav.tsx:36`) and `app/(app)/trips/[tripId]/settings/page.tsx` exists, so both drift guards will pass.

The settings page cards, in order (`app/(app)/trips/[tripId]/settings/page.tsx`): Trip details, Chapters (only rendered when `chaptersEnabled`), Travellers, Calendar feed, Driving estimates, Danger zone (owner — or, after Task 1, admin). Real strings: **Add a Traveller by email**, **Pending**, **Public share link**, **Include in feed**, **Create calendar feed**, **Regenerate**, **Road winding factor**, **Delete trip**, **Delete forever**, **Name for the duplicate**.

Deletion facts, from `server/actions/trips.ts:250-287` and `components/trip/settings/danger-zone.tsx`: owner-only, you type the trip's name to confirm, it cascades through every stop, item, cost, checklist and file, it also deletes the uploaded blobs from storage, and it cannot be undone. **Do not mention the admin override** (Global Constraints).

Invite semantics, from `CONTEXT.md`: an Invite "is never delivered as a link or message" — it becomes membership automatically when that person next signs in with a matching email. It is **Pending** until then and can be cancelled. Do not write that an email gets sent, because none does.

- [ ] **Step 1: Write the failing test**

Add to `components/trip/help-guide.test.tsx`:

```tsx
it("documents the trip settings, including how to delete a trip", () => {
  const { container } = render(<HelpGuide tripId="t1" />);
  const body = container.querySelector("details#trip-settings")?.textContent ?? "";
  expect(body).toContain("Delete trip");
  expect(body).toContain("Add a Traveller by email");
  expect(body).toContain("Public share link");
});

it("is honest that an invite is not emailed to anyone", () => {
  // CONTEXT.md: an Invite "is never delivered as a link or message".
  const { container } = render(<HelpGuide tripId="t1" />);
  const body = container.querySelector("details#trip-settings")?.textContent ?? "";
  expect(body).toMatch(/nothing is sent|no email|isn’t emailed|not emailed/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/trip/help-guide.test.tsx -t "documents the trip settings"`
Expected: FAIL — no `details#trip-settings` element.

- [ ] **Step 3: Extend the data module**

In `lib/help-guide.ts`:

Add to `GUIDE_TRIP_SEGMENTS`, after `"activity"`:

```ts
  "settings",
```

Replace the `GUIDE_NAV_LABELS` doc comment and add the label:

```ts
/**
 * Nav labels the guide tells the reader to look for. Asserted against the
 * real nav.
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
  "Settings",
] as const;
```

Add to `GUIDE_UI_STRINGS`, as a new trailing group:

```ts
  // Trip settings
  "Add a Traveller by email",
  "Public share link",
  "Include in feed",
  "Road winding factor",
  "Name for the duplicate",
  "Delete trip",
  "Delete forever",
```

Add to `HELP_SECTIONS`, in the **advanced** group, after the `forks` entry (so it is the last advanced section before reference):

```ts
  {
    id: "trip-settings",
    title: "Your trip's settings",
    blurb: "Who's on the trip, sharing it, and getting rid of it.",
    group: "advanced",
  },
```

- [ ] **Step 4: Write the section body**

In `components/trip/help-guide.tsx`, add a new `<Section>` in the advanced block, after the `forks` section:

```tsx
          <Section section={sectionById("trip-settings")}>
            <p>
              <Go tripId={tripId} segment="settings">
                Settings
              </Go>{" "}
              is the housekeeping — you&rsquo;ll open it a handful of times and
              then forget it exists. It&rsquo;s in the{" "}
              <strong className="font-semibold">More</strong> menu.
            </p>
            <p>
              <strong className="font-semibold">Travellers</strong> is who can
              see the trip.{" "}
              <strong className="font-semibold">Add a Traveller by email</strong>{" "}
              names the person you want on it. Nothing is emailed to them — the
              invite simply sits there marked{" "}
              <strong className="font-semibold">Pending</strong>, and turns into
              real access the next time they sign in with that address. Tell
              them yourself, in other words. You can cancel one while
              it&rsquo;s still pending.
            </p>
            <p>
              A <strong className="font-semibold">Public share link</strong> is
              the other way to let someone see the trip: a read-only page for
              people who aren&rsquo;t planning it with you — a parent who wants
              to know where you&rsquo;ll be. Anyone with the link can open it,
              so treat it as public, and turn it off when you&rsquo;re done.
              It&rsquo;s a different thing from adding a Traveller, who gets to
              edit.
            </p>
            <p>
              <strong className="font-semibold">Create calendar feed</strong> is
              the one-way feed into your phone&rsquo;s calendar described
              earlier, and{" "}
              <strong className="font-semibold">Include in feed</strong> chooses
              how much of the trip goes into it.{" "}
              <strong className="font-semibold">Regenerate</strong> makes a
              fresh link and kills the old one, which is what you want if
              you&rsquo;ve shared it too widely.
            </p>
            <p>
              <strong className="font-semibold">Road winding factor</strong> and
              the setting beside it are how the app guesses driving times. Real
              roads are longer than the straight line between two places and you
              don&rsquo;t drive them flat out; if its estimates feel wrong for
              where you&rsquo;re going, nudge these.
            </p>
            <p>
              At the bottom, in red, are the two that can&rsquo;t be taken back
              — and only the person who created the trip sees them.
            </p>
            <ul className={`list-disc ${LIST_CLASS}`}>
              <li>
                <strong className="font-semibold">Duplicate</strong> starts a
                brand-new trip from this one&rsquo;s bones — the same places,
                chapters, wishlist and checklists, with every date wiped, ready
                to sketch again. Give it a{" "}
                <strong className="font-semibold">Name for the duplicate</strong>{" "}
                and you&rsquo;re done. The trip you copied isn&rsquo;t touched.
              </li>
              <li>
                <strong className="font-semibold">Delete trip</strong> removes
                it and everything in it — every place, every thing to do, every
                cost and payment, the checklists, the journal, and the files
                you&rsquo;ve uploaded. It asks you to type the trip&rsquo;s name
                first, and then{" "}
                <strong className="font-semibold">Delete forever</strong> means
                it. There is no undo and no copy kept, so if you only want it
                out of the way, consider whether you actually want it gone.
              </li>
            </ul>
          </Section>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run components/trip/help-guide.test.tsx lib/help-guide.test.ts`
Expected: PASS. The linked-routes guard now checks `/trips/[tripId]/settings` exists, and the nav guard checks `Settings` is a real nav label — both are true.

- [ ] **Step 6: Commit**

```bash
git add lib/help-guide.ts components/trip/help-guide.tsx components/trip/help-guide.test.tsx
git commit -m "docs(help): add a trip settings section, covering deletion"
```

---

### Task 5: Add the "Your Globe" section

**Files:**
- Modify: `lib/help-guide.ts` (`HELP_SECTIONS`, `GUIDE_UI_STRINGS`)
- Modify: `components/trip/help-guide.tsx` (new `<Section>` in the advanced block, plus a `GlobeLink` helper)
- Modify: `components/trip/help-guide.test.tsx`

**Interfaces:**
- Consumes: `Section`, `sectionById`, `LIST_CLASS`.
- Produces: nothing other tasks depend on.

**Context an implementer needs:** the Globe is **not** a trip route — it lives at `/globe` (`app/(app)/globe/page.tsx`, linked from `app/(app)/layout.tsx:105`). The existing `Go` component builds `/trips/<id>/<segment>` hrefs only, and `guideTripHref` returns `undefined` without a `tripId`. So `Go` **cannot** link the Globe. The Globe link is valid on both the trip help page and the standalone `/help` page, since it is account-level, so it is always a real link — add a small dedicated helper rather than bending `Go` or adding a fake segment to `GUIDE_TRIP_SEGMENTS` (which is asserted to resolve under `app/(app)/trips/[tripId]/`, and `globe` would fail that guard).

From `CONTEXT.md`: the Globe is the account-level, cross-trip collection; each place on it is a **Marker**; pulling a Marker into a trip **copies** it and the Marker stays put; the Wishlist board suggests Markers near where a trip is going. Real strings from `components/globe/`: **Add Marker**, **Place search**. Attachments can hang off a Marker (ADR 0031).

The existing Globe prose lives inside the `undecided` (Wishlist) section, third paragraph — that paragraph should shrink to a pointer at the new section rather than be duplicated.

- [ ] **Step 1: Write the failing test**

Add to `components/trip/help-guide.test.tsx`:

```tsx
it("documents the Globe as its own thing, linked to the real /globe page", () => {
  const { container } = render(<HelpGuide tripId="t1" />);
  const section = container.querySelector("details#globe");
  expect(section).toBeTruthy();
  expect(section?.textContent).toContain("Marker");
  expect(section?.querySelector('a[href="/globe"]')).toBeTruthy();
});

it("links the Globe even with no trip in scope, since it is account-level", () => {
  const { container } = render(<HelpGuide />);
  expect(container.querySelector('a[href="/globe"]')).toBeTruthy();
});
```

Note the second test coexists with the existing `"renders no trip links at all without a tripId"` test — check that the existing test scopes its assertion to `/trips/` hrefs. If it asserts "no anchors at all", tighten it to `container.querySelectorAll('a[href^="/trips/"]')` and leave a comment explaining that `/globe` is account-level, not trip-scoped.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/trip/help-guide.test.tsx -t "documents the Globe"`
Expected: FAIL — no `details#globe` element.

- [ ] **Step 3: Add the data-module entry**

In `lib/help-guide.ts`, add to `HELP_SECTIONS` in the **advanced** group, immediately before the `trip-settings` entry added in Task 4:

```ts
  {
    id: "globe",
    title: "Your Globe",
    blurb: "The places you'd go someday, kept across every trip.",
    group: "advanced",
  },
```

Add to `GUIDE_UI_STRINGS`, as a new trailing group:

```ts
  // Globe
  "Add Marker",
  "Place search",
```

- [ ] **Step 4: Add the `GlobeLink` helper and the section body**

In `components/trip/help-guide.tsx`, add beside the `Go` component:

```tsx
/**
 * Link to the Globe.
 *
 * Not a <Go>: the Globe is account-level, at /globe, so it is neither a trip
 * segment nor dependent on a tripId — it is a real link on the standalone
 * /help page too.
 */
function GlobeLink({ children }: { children: React.ReactNode }) {
  return (
    <a
      href="/globe"
      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
    >
      {children}
    </a>
  );
}
```

Add the section in the advanced block, before the `trip-settings` section:

```tsx
          <Section section={sectionById("globe")}>
            <p>
              Everything else in here belongs to one trip. Your{" "}
              <GlobeLink>Globe</GlobeLink> doesn&rsquo;t. It&rsquo;s the map of
              everywhere you&rsquo;d like to go one day, kept across all your
              trips, so the restaurant someone recommended has a home even when
              there&rsquo;s no trip to put it on yet.
            </p>
            <p>
              Each place on it is a{" "}
              <strong className="font-semibold">Marker</strong>.{" "}
              <strong className="font-semibold">Add Marker</strong> drops one:
              use <strong className="font-semibold">Place search</strong> to
              find it and the app pins it for you. Give it a category and a
              note about why you saved it — in two years&rsquo; time
              &ldquo;Tokyo&rdquo; on its own tells you nothing. You can hang a
              file off a Marker too, for the screenshot you saved it from.
            </p>
            <p>
              The point of it is what happens when a trip finally goes that way.
              On a trip&rsquo;s{" "}
              <Go tripId={tripId} segment="wishlist">
                Wishlist
              </Go>
              , <strong className="font-semibold">Add from Globe</strong> pulls
              a Marker in, and the board suggests Markers near where
              you&rsquo;re going without you having to remember them. Pulling
              one in takes a <strong className="font-semibold">copy</strong> —
              the Marker stays on the Globe for the next trip, and editing the
              copy inside the trip doesn&rsquo;t change it.
            </p>
            <p>
              A Globe can be shared, so two of you collect into the same one.
              That&rsquo;s why the Wishlist only offers this when you&rsquo;re
              part of one.
            </p>
          </Section>
```

- [ ] **Step 5: Shrink the duplicated Globe paragraph in the Wishlist section**

In the `sectionById("undecided")` section, replace the whole third paragraph (the one beginning "If you&rsquo;re part of a Globe, an **Add from Globe** button appears...") with:

```tsx
            <p>
              If you&rsquo;re part of a Globe, an{" "}
              <strong className="font-semibold">Add from Globe</strong> button
              appears at the top of the board, pulling in places you saved on
              some earlier trip. There&rsquo;s a section on the Globe further
              down.
            </p>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run components/trip/help-guide.test.tsx lib/help-guide.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/help-guide.ts components/trip/help-guide.tsx components/trip/help-guide.test.tsx
git commit -m "docs(help): give the Globe its own section"
```

---

### Task 6: Contents list, deep-link opening, and Expand all

**Files:**
- Create: `components/trip/help-expand-all.tsx`
- Create: `components/trip/help-expand-all.test.tsx`
- Modify: `components/trip/help-guide.tsx` (contents block, `:target` CSS, first section open)
- Modify: `components/trip/help-guide.test.tsx`

**Interfaces:**
- Consumes: `HELP_SECTIONS` and `sectionsInGroup` from `@/lib/help-guide`.
- Produces: `<HelpExpandAll />`, a client component taking no props.

**Context an implementer needs:** three constraints pull against each other and the design below satisfies all of them.

1. `components/trip/help-guide.tsx` must stay a **server component** — so the Expand-all button lives in its own tiny client file, imported and rendered by the server component.
2. `help-guide.test.tsx:26` asserts no Radix collection items and `details` count `=== HELP_SECTIONS.length`. A button adds neither, so that test keeps passing **unmodified** — do not edit it.
3. Clicking a contents link to a **closed** `<details>` would scroll to a collapsed row. Solve that with CSS, not JS: the same two-rule pattern already used for print (`display` for older engines, `::details-content` for Chromium ≥131 / Safari ≥18.4 / Firefox ≥139) applied to `:target`. The header comment in `help-guide.tsx` explains why both rules are needed — reuse that reasoning.

`Section` currently renders `<details id={section.id} …>`. It needs an optional `open` prop for the first-section-open requirement.

- [ ] **Step 1: Write the failing test for the contents and open-by-default**

Add to `components/trip/help-guide.test.tsx`:

```tsx
it("offers a contents list linking every section by anchor", () => {
  const { container } = render(<HelpGuide tripId="t1" />);
  const nav = container.querySelector('nav[aria-label="Contents"]');
  expect(nav).toBeTruthy();
  for (const s of HELP_SECTIONS) {
    expect(
      nav?.querySelector(`a[href="#${s.id}"]`),
      `contents is missing a link to ${s.id}`,
    ).toBeTruthy();
  }
});

it("opens the first section so the page never lands looking empty", () => {
  const { container } = render(<HelpGuide tripId="t1" />);
  const all = Array.from(container.querySelectorAll("details"));
  expect(all[0].hasAttribute("open")).toBe(true);
  expect(all.slice(1).every((d) => !d.hasAttribute("open"))).toBe(true);
});

it("opens a section that is the current :target, without script", () => {
  render(<HelpGuide tripId="t1" />);
  // The print rules already prove why two rules are needed; the same pair is
  // required for :target, or a contents link lands on a collapsed row.
  expect(HELP_PRINT_STYLE).toContain("details:target");
  expect(HELP_PRINT_STYLE).toContain("details:target::details-content");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/trip/help-guide.test.tsx -t "contents list"`
Expected: FAIL — no `nav[aria-label="Contents"]`.

- [ ] **Step 3: Add the `:target` rules and the `open` prop**

In `components/trip/help-guide.tsx`, extend the exported style constant. Rename nothing — it is imported by name in the test file. Add the `:target` block and update the doc comment to cover both uses:

```ts
export const HELP_PRINT_STYLE = `
  @media print {
    details > summary { list-style: none; }
    details > *:not(summary) { display: block !important; }
    details::details-content { content-visibility: visible !important; }
    .help-print-hide { display: none !important; }
  }
  details:target > *:not(summary) { display: block !important; }
  details:target::details-content { content-visibility: visible !important; }
`;
```

Give `Section` an `open` prop:

```tsx
function Section({
  section,
  open,
  children,
}: {
  section: HelpSection;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      id={section.id}
      open={open}
      className="group rounded-xl border border-border bg-card px-4 py-3"
    >
```

and pass `open` on the first section only — `<Section section={sectionById("sixty-seconds")} open>`.

- [ ] **Step 4: Add the contents block**

In `HelpGuide`, immediately after `<style>{HELP_PRINT_STYLE}</style>` and before the legend section:

```tsx
      {/* ── Contents ──
          Server-rendered anchors. The :target rules above open whichever
          section is linked to, so these work with no script at all. */}
      <nav
        aria-label="Contents"
        className="help-print-hide rounded-xl border border-border bg-muted/40 px-4 py-3"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-foreground">
            What&rsquo;s in here
          </h2>
          <HelpExpandAll />
        </div>
        <ol className="flex flex-col gap-1">
          {HELP_SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-sm text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
```

Add the import at the top: `import { HelpExpandAll } from "@/components/trip/help-expand-all";` and add `HELP_SECTIONS` to the existing `@/lib/help-guide` import.

- [ ] **Step 5: Write the failing test for the Expand all control**

Create `components/trip/help-expand-all.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpExpandAll } from "./help-expand-all";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function withDetails() {
  const host = document.createElement("div");
  host.innerHTML = `
    <details id="a"><summary>A</summary><p>a</p></details>
    <details id="b" open><summary>B</summary><p>b</p></details>
  `;
  document.body.appendChild(host);
  return host;
}

describe("HelpExpandAll", () => {
  it("opens every section when told to expand", async () => {
    const host = withDetails();
    render(<HelpExpandAll />);
    await userEvent.click(screen.getByRole("button", { name: /expand all/i }));
    expect(
      Array.from(host.querySelectorAll("details")).every((d) => d.open),
    ).toBe(true);
  });

  it("closes every section when told to collapse", async () => {
    const host = withDetails();
    render(<HelpExpandAll />);
    await userEvent.click(screen.getByRole("button", { name: /collapse all/i }));
    expect(
      Array.from(host.querySelectorAll("details")).some((d) => d.open),
    ).toBe(false);
  });

  it("is hidden from print, which already forces every section open", () => {
    const { container } = render(<HelpExpandAll />);
    expect(container.firstElementChild?.className).toContain("help-print-hide");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run components/trip/help-expand-all.test.tsx`
Expected: FAIL — cannot resolve `./help-expand-all`.

- [ ] **Step 7: Implement the control**

Create `components/trip/help-expand-all.tsx`:

```tsx
"use client";

import * as React from "react";

/**
 * Expand all / Collapse all for the guide's <details> sections.
 *
 * Deliberately the ONLY client component in the guide. It holds no disclosure
 * state of its own — it toggles the `open` attribute on the already-rendered
 * <details> elements — so help-guide.tsx stays a server component, browser
 * find-in-page still reaches collapsed text, and the guard in
 * help-guide.test.tsx ("uses no client-side disclosure state") still holds:
 * this adds no <details> and no accordion dependency.
 *
 * Hidden from print, where HELP_PRINT_STYLE already forces everything open.
 */
export function HelpExpandAll() {
  function setAll(open: boolean) {
    for (const d of document.querySelectorAll<HTMLDetailsElement>(
      "details[id]",
    )) {
      d.open = open;
    }
  }

  return (
    <div className="help-print-hide flex items-center gap-2">
      <button
        type="button"
        onClick={() => setAll(true)}
        className="text-sm font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
      >
        Expand all
      </button>
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <button
        type="button"
        onClick={() => setAll(false)}
        className="text-sm font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
      >
        Collapse all
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run components/trip/help-expand-all.test.tsx components/trip/help-guide.test.tsx`
Expected: PASS, including `help-guide.test.tsx:26` **unmodified**.

- [ ] **Step 9: Check the page still builds**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean. A `"use client"` file imported by a server component is legal; the reverse would not be.

- [ ] **Step 10: Commit**

```bash
git add components/trip/help-expand-all.tsx components/trip/help-expand-all.test.tsx components/trip/help-guide.tsx components/trip/help-guide.test.tsx
git commit -m "feat(help): add contents, deep-link opening and expand all"
```

---

### Task 7: Claim-by-claim audit of the remaining sections

**Files:**
- Modify: `components/trip/help-guide.tsx` (whichever sections carry false claims)
- Modify: `lib/help-guide.ts` (`GUIDE_UI_STRINGS`, if newly-quoted controls appear)
- Modify: `components/trip/help-legend.tsx` (only if the legend is wrong)
- Create: `docs/follow-ups/2026-09-15-help-guide-audit.md`

**Interfaces:**
- Consumes: everything from Tasks 2–6 (those sections are already corrected — do not re-audit `trip-shape`, `chapters`, `search`, `trip-settings`, `globe`).
- Produces: nothing other tasks depend on.

**Context an implementer needs:** this is a verification task, not a writing task. The guide asserts dozens of facts and only *quoted control names* are covered by an automated guard. Everything else — which screen a thing is on, phone vs desktop differences, what is shared across plans vs owned by one, what a button does — is unguarded prose that can rot.

Audit these sections, one at a time, against the code that implements each claim:

| Section | Verify against |
|---|---|
| `sixty-seconds` | the six-step loop still matches the real nav and order |
| `things-to-do` | `components/trip/item-form.tsx` (or equivalent) — the field list and which are required |
| `giving-a-day` | `components/trip/` calendar + wishlist drag handlers; the drag-**moves** vs button-**copies** distinction |
| `undecided` | `CONTEXT.md` **Wishlist**; `server/actions/` wishlist scheduling — "places a copy", votes stay on the shared idea |
| `sleeping-moving` | `components/trip/` accommodation + transport forms |
| `money` | `CONTEXT.md` **Cost**/**Paid**; ADR 0037 (cost and paid replaced estimated/actual); ADR 0039 (costs survive their owners by paid state); the Budget page's real tab names |
| `getting-ready` | the checklists page tabs; `app/(app)/trips/[tripId]/files/` |
| `together` | `CONTEXT.md` **Note** and **Activity**; the notification bell's unread rule |
| `away` | `CONTEXT.md` **Today view**, **Day map**, **Day ideas**; the offline/service-worker claim |
| `something-off` | the real flag list in `lib/` flag detection; amber/blue severities |
| `dates-and-pins` | `CONTEXT.md` **Firm up**, **Pinned**; ADR 0038 (span-scoped ripples) |
| `make-it-fit` | `CONTEXT.md` **Make it fit** |
| `forks` | `CONTEXT.md` **Fork**, **Promote**, **Compare** |
| `word-list` | every entry against its `CONTEXT.md` definition |
| legend | `components/trip/help-legend.tsx` icons against the real tab bar in `components/trip/trip-nav.tsx` |

- [ ] **Step 1: Audit and record findings**

Work through the table above. For each claim that is wrong, note the section, the claim, the source of truth, and the correction. Write them into `docs/follow-ups/2026-09-15-help-guide-audit.md` as you go — this is the evidence trail, and it also captures anything found that is out of scope to fix here.

- [ ] **Step 2: Write a failing test per confirmed wrong claim**

For each correction, add a test to `components/trip/help-guide.test.tsx` asserting the *corrected* fact, in the style already used there:

```tsx
it("<states the corrected fact>", () => {
  const { container } = render(<HelpGuide tripId="t1" />);
  const body = container.querySelector("details#<section-id>")?.textContent ?? "";
  expect(body).toContain("<the corrected wording>");
});
```

If a section turns out to be entirely accurate, add no test for it — a test that cannot fail is worse than no test.

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npx vitest run components/trip/help-guide.test.tsx`
Expected: FAIL, one per confirmed wrong claim.

- [ ] **Step 4: Correct the prose**

Fix each claim in `components/trip/help-guide.tsx`, obeying the Global Constraints writing rules. If a correction introduces a newly-quoted control name, add it to `GUIDE_UI_STRINGS` (excluding single generic words per the module's policy).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Verify it in the running app**

Run: `npm run dev`, open `/help` and a trip's `/trips/<id>/help`. Confirm the contents links open their section, Expand all works, the first section is open, and nothing overflows at 320px wide.

- [ ] **Step 7: Commit**

```bash
git add components/trip/help-guide.tsx components/trip/help-guide.test.tsx lib/help-guide.ts docs/follow-ups/2026-09-15-help-guide-audit.md
git commit -m "docs(help): correct claims that no longer match the app"
```

---

## Self-Review

**Spec coverage:**

| Spec item | Task |
|---|---|
| Accuracy pass, claim-by-claim, all sections | Task 2 (Chapters, the confirmed bug) + Task 7 (the rest) |
| Chapters demoted in `trip-shape`; in-depth section says how to switch on | Task 2 |
| Jump-to contents | Task 6 |
| Expand all / Collapse all | Task 6 |
| First section open by default | Task 6 |
| Print CSS keeps working; new controls opt out | Task 6 (`help-print-hide` on both the nav and the buttons) |
| Search section, in *Using it day to day* | Task 3 |
| "Your trip's settings" section, in *Going deeper* | Task 4 |
| "Your Globe" section, in *Going deeper* | Task 5 |
| `"settings"` in `GUIDE_TRIP_SEGMENTS`, `"Settings"` in `GUIDE_NAV_LABELS` | Task 4 |
| A way to link `/globe` that `Go` doesn't support | Task 5 (`GlobeLink`) |
| **Search** glossary entry in `CONTEXT.md` | Done before planning — already committed to the working tree |
| `lib/admin.ts` reading `ADMIN_EMAILS` | Task 1 |
| Owner-or-admin in `deleteTrip` | Task 1 |
| Owner-or-admin on the Danger zone card | Task 1 |
| `requireTripAccess` untouched; membership still required | Task 1 (asserted by a test) |
| ADR 0045 | Task 1 |
| Admin power absent from the guide | Global Constraints + Task 4's context note |
| `README.md` untouched | No task touches it |

**Placeholder scan:** no TBDs; every code step carries real code; Task 7 is a verification task whose output is genuinely discovered, but its method, its sources of truth per section, and its test shape are all specified.

**Type consistency:** `isAdminEmail(email: string | null | undefined): boolean` is used identically in `trips.ts` and `settings/page.tsx`. `Section` gains `open?: boolean` in Task 6 and every existing call site keeps working (prop optional). `HelpExpandAll` takes no props in both its test and its use site. `HELP_PRINT_STYLE` keeps its exported name, so the existing import in `help-guide.test.tsx` is unaffected.

**Ordering note:** Task 6 renders a contents entry for every `HELP_SECTIONS` item, so it must run **after** Tasks 3–5 add theirs, or its contents test passes while silently omitting the new sections. Tasks 1–5 are otherwise independent of one another.
