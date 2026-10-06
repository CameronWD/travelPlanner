# Feedback batch 2026-10-05 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship spec 2026-10-05 §A–§I: resolved Feedback notes behind "Show resolved", Trips tally at mid widths, a dated return leg as the Trip's deadline, a stay detail view and roomier edit forms, Schedule offering that place's days, metro-line legs, clickable Stop rows and stay chip, a clearer Globe filter, and portrait covers on phones.

**Architecture:** Pure logic first in `lib/` (deadline resolver, day options, change-over places, nights-covered, 7-day rule) with unit tests, then wired into existing components. Each part lands as its own tasks with its own `Resolves-Feedback:` trailer.

**Tech Stack:** Next.js (this repo's version — read `node_modules/next/dist/docs/` before touching Next APIs), React, Prisma/Postgres, Tailwind, vitest + Testing Library (`TZ=UTC npx vitest run <path>`), Playwright for screenshots.

**Spec:** `docs/specs/2026-10-05-feedback-batch-resolved-panel-deadline-stays-schedule.md` (plus ADR 0068, CONTEXT.md **Resolution**).

## Global Constraints

- Branch `feat/feedback-batch-2026-10-05`. Never commit to `main`; never deploy; never run `npm run feedback:*` (production).
- Every commit ends `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; `Resolves-Feedback:` trailers only where a task says so.
- No migrations. No new dependencies.
- Copy uses CONTEXT.md terms (Stop, Traveller, Feedback note, Resolution, Wishlist, Globe, Marker); phones' layouts unchanged unless a task says otherwise.
- Tasks run in order; later tasks touching `components/trip/itinerary-manager.tsx` must re-read it rather than trust line numbers.

## Review Focus

1. A Resolution resolved exactly 7 days ago, or with no `resolvedAt` — still listed vs hidden must match A1's rule (tests in A1).
2. A multi-leg journey home where two legs leave the last Stop — the deadline is the earlier departure from the last Stop (test in C1).
3. Clicking a control inside the Stop header (⋯ menu items in a portal, chevron, stay chip) toggles exactly once or not at all (tests in G1/G2).
4. A Wishlist idea with coordinates but no address added to a rough Stop keeps its coordinates and source link (test in E2b).
5. `LegRow` used by bookend rows with a single leg still renders one pill on the connector with no change-over text (test in F2).

## Task order

Tasks 1–29 in order; the bracketed label ([A1], [E2b] …) is how tasks refer to each other.

---

## Part A — Feedback panel: Show resolved (spec 2026-10-05 §A)

Two tasks. A1 is the pure data layer (view shape, Prisma select, the 7-day rule, the resolution line). A2 is the panel UI that uses it, plus the `/work/CLAUDE.md` wording change. A2 depends on A1.

Decisions this plan makes (all from the spec unless marked):
- "Within the last 7 days" counts the boundary as inside: a note resolved **exactly** 7 days before "now" still shows. One millisecond later it is hidden.
- Only `DONE` and `WONTFIX` are ever hidden. An Open note never is, and neither is an unrecognised status: the panel already labels those rather than hiding them.
- (Plan decision) A Done or Won't fix note with `resolvedAt === null` (closed before the column was filled) counts as old, so it is hidden.
- (Plan decision) A blank or whitespace-only `resolution` maps to `null` in `toView`, so the line reads just "Done 5 Oct".
- "Now" for the 7-day window is the moment the panel opened (`openedAt` state, set in `onOpenChange`). That keeps `Date.now()` out of render. The same handler resets `showResolved` to false, so every open starts hidden.
- The date on the resolution line uses the viewer's local calendar day ("5 Oct"), built from `MONTH_SHORT`, which `lib/dates.ts` now exports. `toLocaleDateString("en-GB")` is not used because newer ICU renders September as "Sept".

---

### Task 1: [A1] Resolution and resolvedAt on the Feedback note view, plus the 7-day rule

**Files:**
- Modify: `/work/lib/feedback-view.ts` (lines 19–20 imports; 23–44 `FeedbackNoteView`; 47–58 `FeedbackNoteQueryRow`; 61–72 `VIEW_SELECT`; 74–95 `toView`; new exports added after line 95)
- Modify: `/work/lib/dates.ts` (line 48: `const MONTH_SHORT` → `export const MONTH_SHORT`)
- Test: `/work/lib/feedback-view.test.ts` (fixture lines 4–15; new describes appended)
- Test: `/work/server/actions/feedback.test.ts` (fixtures `row` lines 68–79 and `otherRow` lines 81–92; the `toEqual` at lines 108–119; the `toView` literal at lines 319–333; one new `listFeedbackNotes` test)

**Interfaces:**
- Consumes: Prisma `FeedbackNote.resolution: String?` and `FeedbackNote.resolvedAt: DateTime?` (already in `prisma/schema.prisma`; no migration). `FeedbackStatus` from `@/lib/enums`. `MONTH_SHORT` from `@/lib/dates`.
- Produces:
  - `FeedbackNoteView.resolution: string | null`
  - `FeedbackNoteView.resolvedAt: string | null` (ISO)
  - `FeedbackNoteQueryRow.resolution: string | null`, `FeedbackNoteQueryRow.resolvedAt: Date | null`
  - `VIEW_SELECT.resolution: true`, `VIEW_SELECT.resolvedAt: true`
  - `export const RESOLVED_SHOWN_FOR_MS: number` (7 days in ms)
  - `export function isHiddenResolved(note: Pick<FeedbackNoteView, "status" | "resolvedAt">, now: Date): boolean`
  - `export function resolutionLine(note: Pick<FeedbackNoteView, "status" | "resolution" | "resolvedAt">): string | null`
  - `export const MONTH_SHORT: string[]` from `lib/dates.ts`

- [ ] **Step 1: Write the failing tests.**

In `/work/lib/feedback-view.test.ts`, change the import on line 2 and the fixture on lines 4–15 to:

```ts
import {
  isHiddenResolved,
  RESOLVED_SHOWN_FOR_MS,
  resolutionLine,
  toView,
  type FeedbackNoteQueryRow,
} from "./feedback-view";

const row = (site: string | null): FeedbackNoteQueryRow => ({
  id: "n1",
  body: "b",
  route: "/trips",
  pageLabel: "Trips",
  tripName: null,
  authorId: "u1",
  authorName: "Cam",
  status: "OPEN",
  authoredAt: new Date("2026-09-26"),
  site,
  resolution: null,
  resolvedAt: null,
});
```

Append to the same file:

```ts
describe("toView — resolution", () => {
  it("carries the Resolution and when it was given", () => {
    const view = toView(
      {
        ...row("main"),
        status: "DONE",
        resolution: "Budget totals now add up per currency.",
        resolvedAt: new Date("2026-10-05T09:00:00.000Z"),
      },
      "u1",
      "main",
    );
    expect(view.resolution).toBe("Budget totals now add up per currency.");
    expect(view.resolvedAt).toBe("2026-10-05T09:00:00.000Z");
  });

  it("is null on an open note", () => {
    const view = toView(row("main"), "u1", "main");
    expect(view.resolution).toBeNull();
    expect(view.resolvedAt).toBeNull();
  });

  it("treats a blank Resolution as none", () => {
    const view = toView(
      { ...row("main"), status: "DONE", resolution: "   ", resolvedAt: new Date("2026-10-05T09:00:00.000Z") },
      "u1",
      "main",
    );
    expect(view.resolution).toBeNull();
  });
});

describe("isHiddenResolved", () => {
  const now = new Date("2026-10-12T12:00:00.000Z");

  it("is a week", () => {
    expect(RESOLVED_SHOWN_FOR_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("never hides an open note", () => {
    expect(isHiddenResolved({ status: "OPEN", resolvedAt: null }, now)).toBe(false);
    expect(isHiddenResolved({ status: "OPEN", resolvedAt: "2026-01-01T00:00:00.000Z" }, now)).toBe(false);
  });

  it("keeps a note resolved within the last 7 days, exactly 7 days included", () => {
    expect(isHiddenResolved({ status: "DONE", resolvedAt: "2026-10-11T00:00:00.000Z" }, now)).toBe(false);
    expect(isHiddenResolved({ status: "DONE", resolvedAt: "2026-10-05T12:00:00.000Z" }, now)).toBe(false);
    expect(isHiddenResolved({ status: "WONTFIX", resolvedAt: "2026-10-05T12:00:00.000Z" }, now)).toBe(false);
  });

  it("hides a Done or Won't fix note resolved more than 7 days ago", () => {
    expect(isHiddenResolved({ status: "DONE", resolvedAt: "2026-10-05T11:59:59.999Z" }, now)).toBe(true);
    expect(isHiddenResolved({ status: "WONTFIX", resolvedAt: "2026-09-01T00:00:00.000Z" }, now)).toBe(true);
  });

  it("counts a closed note with no resolvedAt as old", () => {
    expect(isHiddenResolved({ status: "DONE", resolvedAt: null }, now)).toBe(true);
  });

  it("never hides a status it does not recognise (the panel labels those instead)", () => {
    expect(
      isHiddenResolved({ status: "PENDING" as never, resolvedAt: "2026-01-01T00:00:00.000Z" }, now),
    ).toBe(false);
  });
});

describe("resolutionLine", () => {
  it("reads Done {date} — {Resolution}", () => {
    expect(
      resolutionLine({ status: "DONE", resolution: "Fixed the totals.", resolvedAt: "2026-10-05T09:00:00.000Z" }),
    ).toBe("Done 5 Oct — Fixed the totals.");
  });

  it("reads Won't fix {date} — {Resolution}", () => {
    expect(
      resolutionLine({ status: "WONTFIX", resolution: "Same as the Globe one.", resolvedAt: "2026-09-21T09:00:00.000Z" }),
    ).toBe("Won't fix 21 Sep — Same as the Globe one.");
  });

  it("shows just the status and date when there is no Resolution text", () => {
    expect(resolutionLine({ status: "DONE", resolution: null, resolvedAt: "2026-10-05T09:00:00.000Z" })).toBe(
      "Done 5 Oct",
    );
  });

  it("shows just the status when the date is missing too", () => {
    expect(resolutionLine({ status: "WONTFIX", resolution: null, resolvedAt: null })).toBe("Won't fix");
  });

  it("is null for a note that isn't closed", () => {
    expect(resolutionLine({ status: "OPEN", resolution: null, resolvedAt: null })).toBeNull();
  });
});
```

In `/work/server/actions/feedback.test.ts`:
- Add `resolution: null,` and `resolvedAt: null,` after `site: "local",` in both `row` (lines 68–79) and `otherRow` (lines 81–92).
- In the `createFeedbackNote` "stores the note and returns a serialisable view" `toEqual` (lines 108–119), add after `siteChip: null,`:
  ```ts
      resolution: null,
      resolvedAt: null,
  ```
- In the `toView` describe's literal (lines 319–333), add `resolution: null,` and `resolvedAt: null,` after `site: "local",`.
- Append inside `describe("listFeedbackNotes", …)`:
  ```ts
  it("reads each note's Resolution for the panel (spec 2026-10-05 §A)", async () => {
    requireUserMock.mockResolvedValue(author);
    feedbackNoteFindManyMock.mockResolvedValue([
      {
        ...row,
        status: "DONE",
        resolution: "Fixed the drag handle.",
        resolvedAt: new Date("2026-10-05T09:00:00.000Z"),
      },
    ]);

    const result = await listFeedbackNotes();

    expect(feedbackNoteFindManyMock.mock.calls[0][0].select).toEqual(
      expect.objectContaining({ resolution: true, resolvedAt: true }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.notes[0].resolution).toBe("Fixed the drag handle.");
    expect(result.notes[0].resolvedAt).toBe("2026-10-05T09:00:00.000Z");
  });
  ```

- [ ] **Step 2: Run the tests and confirm they fail.**

```
cd /work && TZ=UTC npx vitest run lib/feedback-view.test.ts server/actions/feedback.test.ts
```

Expected: FAIL. `isHiddenResolved` / `resolutionLine` are not functions and `RESOLVED_SHOWN_FOR_MS` is undefined. `toView`'s `resolution`/`resolvedAt` are `undefined`, not the expected values. The `toEqual` in `createFeedbackNote` fails because it now expects `resolution: null`. The new `listFeedbackNotes` test fails on `select`.

- [ ] **Step 3: Implement.**

`/work/lib/dates.ts` line 48:

```ts
export const MONTH_SHORT = [
```

`/work/lib/feedback-view.ts`: replace the imports on lines 19–20 with:

```ts
import type { FeedbackStatus } from "@/lib/enums";
import { MONTH_SHORT } from "@/lib/dates";
import { siteLabel, siteOf } from "@/lib/feedback-site";
```

In `FeedbackNoteView`, after `siteChip: string | null;` (line 43):

```ts
  /**
   * The operator's reply that closed this note (CONTEXT.md "Resolution"),
   * written to its author. Null while open, or when closed without one.
   */
  resolution: string | null;
  /** ISO; when the note was closed as Done / Won't fix. Null while open. */
  resolvedAt: string | null;
```

In `FeedbackNoteQueryRow`, after `site: string | null;` (line 57):

```ts
  resolution: string | null;
  resolvedAt: Date | null;
```

In `VIEW_SELECT`, after `site: true,` (line 71):

```ts
  resolution: true,
  resolvedAt: true,
```

In `toView`'s returned object, after the `siteChip` line (line 93):

```ts
    resolution: row.resolution?.trim() ? row.resolution : null,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
```

Insert after `toView` (after line 95):

```ts
/**
 * How long a closed note stays in its author's Feedback panel before it waits
 * behind "Show resolved" (spec 2026-10-05 §A): long enough to read the
 * Resolution, short enough that the log doesn't fill with finished business.
 * It stands in for a "seen" state, which was decided against.
 */
export const RESOLVED_SHOWN_FOR_MS = 7 * 24 * 60 * 60 * 1000;

const CLOSED_LABEL: Partial<Record<string, string>> = {
  DONE: "Done",
  WONTFIX: "Won't fix",
};

/**
 * Whether the panel hides this note behind "Show resolved". That is true for a
 * note closed as Done or Won't fix more than 7 days before `now`; a note
 * resolved exactly 7 days ago still shows. A closed note with no `resolvedAt`
 * counts as old. Open notes and unrecognised statuses are never hidden: the
 * panel labels an unfamiliar status rather than burying it.
 */
export function isHiddenResolved(
  note: Pick<FeedbackNoteView, "status" | "resolvedAt">,
  now: Date,
): boolean {
  if (!CLOSED_LABEL[note.status]) return false;
  if (note.resolvedAt === null) return true;
  return now.getTime() - Date.parse(note.resolvedAt) > RESOLVED_SHOWN_FOR_MS;
}

/**
 * The line beneath a closed note: "Done 5 Oct — {Resolution}", or just
 * "Done 5 Oct" when there is no Resolution text. Null for a note that isn't
 * closed. The date is the viewer's own calendar day.
 */
export function resolutionLine(
  note: Pick<FeedbackNoteView, "status" | "resolution" | "resolvedAt">,
): string | null {
  const label = CLOSED_LABEL[note.status];
  if (!label) return null;
  const when = note.resolvedAt ? new Date(note.resolvedAt) : null;
  const head = when ? `${label} ${when.getDate()} ${MONTH_SHORT[when.getMonth()]}` : label;
  return note.resolution ? `${head} — ${note.resolution}` : head;
}
```

- [ ] **Step 4: Run the tests and confirm they pass.**

```
cd /work && TZ=UTC npx vitest run lib/feedback-view.test.ts server/actions/feedback.test.ts lib/dates.test.ts && npx tsc --noEmit -p .
```

Expected: all tests pass. `tsc` reports no errors. If `tsc` flags any other literal typed as `FeedbackNoteQueryRow` or `FeedbackNoteView` for missing `resolution`/`resolvedAt`, add `resolution: null, resolvedAt: null` there.

- [ ] **Step 5: Commit.**

```
cd /work && git add lib/feedback-view.ts lib/feedback-view.test.ts lib/dates.ts server/actions/feedback.test.ts && git commit -m "feat(feedback): carry each note's Resolution and resolvedAt to the panel

FeedbackNoteView gains resolution and resolvedAt (VIEW_SELECT reads both).
isHiddenResolved holds Done/Won't fix notes resolved over 7 days ago;
resolutionLine renders 'Done 5 Oct — {Resolution}' (spec 2026-10-05 §A).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: [A2] Feedback panel hides old resolved notes behind "Show resolved (N)" and shows each Resolution

**Files:**
- Modify: `/work/components/feedback/feedback-launcher.tsx` (imports after line 43; state near lines 276–279; `entries` memo at lines 384–390; `onOpenChange` at lines 489–495; log render at lines 622–641; `SentEntry` at lines 695–742)
- Modify: `/work/CLAUDE.md` (lines 67–70, "Closing a Feedback note", "After I confirm the deploy is live" step 1)
- Test: `/work/components/feedback/feedback-launcher.test.tsx` (`existingNote` lines 46–56; the existing Done/Won't fix pill test at lines 958–975; a new `describe` block)

**Interfaces:**
- Consumes: `isHiddenResolved`, `resolutionLine`, and `FeedbackNoteView.resolution` / `.resolvedAt` from Task A1 (`@/lib/feedback-view`). `FeedbackNoteView` is still imported via `@/server/actions/feedback`.
- Produces (UI contract, used by tests):
  - a button named exactly `Show resolved (N)`, rendered only when N > 0, where N counts the sent notes hidden right now
  - while revealed, the same button reads `Hide resolved`
  - under each closed note, a `<p>` whose text is `resolutionLine(note)`
  - on every open, `showResolved = false` and `openedAt = new Date()`

- [ ] **Step 1: Write the failing tests.**

In `/work/components/feedback/feedback-launcher.test.tsx`, add `resolution: null,` and `resolvedAt: null,` to `existingNote` (lines 46–56), after `authoredAt`.

In the existing test "marks a done Feedback note with a green pill and a won't-fix one without" (lines 958–975), give both notes a recent `resolvedAt` so the 7-day rule doesn't hide them:

```ts
        { ...existingNote, id: "done", body: "Fixed one", status: "DONE", resolvedAt: new Date().toISOString() },
        { ...existingNote, id: "wontfix", body: "Skipped one", status: "WONTFIX", resolvedAt: new Date().toISOString() },
```

Append a new block inside `describe("FeedbackLauncher", …)`:

```tsx
  describe("resolved notes (spec 2026-10-05 §A)", () => {
    const NOW = new Date("2026-10-12T12:00:00.000Z");
    const recentDone = {
      ...existingNote,
      id: "recent",
      body: "Totals fixed",
      status: "DONE" as const,
      authoredAt: "2026-09-10T00:00:00.000Z",
      resolution: "Budget totals now add up per currency.",
      resolvedAt: "2026-10-10T09:00:00.000Z",
    };
    const edgeDone = {
      ...existingNote,
      id: "edge",
      body: "Resolved a week ago to the minute",
      status: "DONE" as const,
      authoredAt: "2026-09-11T00:00:00.000Z",
      resolution: null,
      resolvedAt: "2026-10-05T12:00:00.000Z",
    };
    const oldDone = {
      ...existingNote,
      id: "old",
      body: "Old fixed thing",
      status: "DONE" as const,
      authoredAt: "2026-09-01T00:00:00.000Z",
      resolution: "Fixed a while back.",
      resolvedAt: "2026-09-20T09:00:00.000Z",
    };
    const oldWontFix = {
      ...existingNote,
      id: "oldwf",
      body: "Old skipped thing",
      status: "WONTFIX" as const,
      authoredAt: "2026-09-05T00:00:00.000Z",
      resolution: null,
      resolvedAt: "2026-09-21T09:00:00.000Z",
    };

    beforeEach(() => {
      // Only Date is faked: userEvent and Radix still need real timers.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(NOW);
    });

    async function openPanel() {
      const user = userEvent.setup();
      render(<FeedbackLauncher />);
      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      await screen.findByPlaceholderText(/what's on your mind/i);
      return user;
    }

    it("lists open notes and ones resolved within 7 days, and hides older ones behind Show resolved (N)", async () => {
      listMock.mockResolvedValue({
        success: true,
        notes: [existingNote, oldDone, recentDone, edgeDone, oldWontFix],
      });
      await openPanel();

      expect(await screen.findByText("Budget totals look wrong")).toBeInTheDocument();
      expect(screen.getByText("Totals fixed")).toBeInTheDocument();
      expect(screen.getByText("Resolved a week ago to the minute")).toBeInTheDocument();
      expect(screen.queryByText("Old fixed thing")).toBeNull();
      expect(screen.queryByText("Old skipped thing")).toBeNull();
      expect(screen.getByRole("button", { name: "Show resolved (2)" })).toBeInTheDocument();
    });

    it("reveals hidden notes in their normal date order and becomes Hide resolved", async () => {
      listMock.mockResolvedValue({
        success: true,
        notes: [existingNote, oldDone, recentDone, oldWontFix],
      });
      const user = await openPanel();

      await user.click(await screen.findByRole("button", { name: "Show resolved (2)" }));

      const bodies = screen
        .getAllByRole("listitem")
        .map((li) => li.textContent ?? "");
      const order = ["Old fixed thing", "Old skipped thing", "Budget totals look wrong", "Totals fixed"].map(
        (text) => bodies.findIndex((b) => b.includes(text)),
      );
      expect(order).toEqual([0, 1, 2, 3]);

      await user.click(screen.getByRole("button", { name: "Hide resolved" }));
      expect(screen.queryByText("Old fixed thing")).toBeNull();
      expect(screen.getByRole("button", { name: "Show resolved (2)" })).toBeInTheDocument();
    });

    it("shows no Show resolved button when nothing is hidden", async () => {
      listMock.mockResolvedValue({ success: true, notes: [existingNote, recentDone] });
      await openPanel();

      expect(await screen.findByText("Totals fixed")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /show resolved/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /hide resolved/i })).toBeNull();
    });

    it("writes the status, date and Resolution beneath a closed note, or just status and date without one", async () => {
      listMock.mockResolvedValue({ success: true, notes: [recentDone, oldWontFix] });
      const user = await openPanel();

      expect(
        await screen.findByText("Done 10 Oct — Budget totals now add up per currency."),
      ).toBeInTheDocument();
      // The badge is unchanged alongside the new line.
      expect(screen.getByText("Done")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Show resolved (1)" }));
      expect(screen.getByText("Won't fix 21 Sep")).toBeInTheDocument();
    });

    it("applies the same rule to every author's notes in an Admin's panel", async () => {
      listMock.mockResolvedValue({
        success: true,
        notes: [
          { ...recentDone, authorName: "Sister", canDelete: false },
          { ...oldDone, authorName: "Sister", canDelete: false },
          { ...oldWontFix, authorName: "Cam", canDelete: true },
        ],
      });
      await openPanel();

      expect(await screen.findByText("Totals fixed")).toBeInTheDocument();
      expect(screen.queryByText("Old fixed thing")).toBeNull();
      expect(screen.queryByText("Old skipped thing")).toBeNull();
      expect(screen.getByRole("button", { name: "Show resolved (2)" })).toBeInTheDocument();
    });

    it("keeps the toggle, not the empty-log message, when every note is hidden", async () => {
      listMock.mockResolvedValue({ success: true, notes: [oldDone] });
      await openPanel();

      expect(await screen.findByRole("button", { name: "Show resolved (1)" })).toBeInTheDocument();
      expect(screen.queryByText(/no feedback yet/i)).toBeNull();
    });

    it("hides resolved notes again every time the panel opens", async () => {
      listMock.mockResolvedValue({ success: true, notes: [existingNote, oldDone] });
      const user = await openPanel();

      await user.click(await screen.findByRole("button", { name: "Show resolved (1)" }));
      expect(screen.getByText("Old fixed thing")).toBeInTheDocument();

      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      await user.click(screen.getByRole("button", { name: /leave feedback/i }));
      expect(await screen.findByRole("button", { name: "Show resolved (1)" })).toBeInTheDocument();
      expect(screen.queryByText("Old fixed thing")).toBeNull();
    });
  });
```

- [ ] **Step 2: Run the tests and confirm they fail.**

```
cd /work && TZ=UTC npx vitest run components/feedback/feedback-launcher.test.tsx
```

Expected: the new `resolved notes (spec 2026-10-05 §A)` tests FAIL. Old resolved notes are still rendered, `Unable to find role="button" and name "Show resolved (2)"`, and the resolution line is not found. Every pre-existing test still passes.

- [ ] **Step 3: Implement.**

In `/work/components/feedback/feedback-launcher.tsx`, add an import after line 43:

```ts
import { isHiddenResolved, resolutionLine } from "@/lib/feedback-view";
```

After `const [isSending, setIsSending] = React.useState(false);` (line 279), add:

```ts
  // Spec 2026-10-05 §A: a closed note stays listed for a week so its author
  // sees the Resolution, then waits behind "Show resolved". `openedAt` is the
  // "now" for that week, so render stays pure. Both are set on the way open
  // (see onOpenChange), so every open starts with old resolved notes hidden.
  // The toggle is deliberately not remembered.
  const [showResolved, setShowResolved] = React.useState(false);
  const [openedAt, setOpenedAt] = React.useState<Date>(() => new Date(0));
```

Replace the `entries` memo (lines 384–390) with:

```ts
  /** Sent notes the 7-day rule is holding back right now (spec 2026-10-05 §A). */
  const hiddenCount = React.useMemo(
    () => sent.filter((note) => isHiddenResolved(note, openedAt)).length,
    [sent, openedAt],
  );

  const entries = React.useMemo<LogEntry[]>(() => {
    const landed = sent
      .filter((note) => showResolved || !isHiddenResolved(note, openedAt))
      .sort((a, b) => a.authoredAt.localeCompare(b.authoredAt))
      .map((note): LogEntry => ({ kind: "sent", note }));
    const queued = pending.map((note): LogEntry => ({ kind: "pending", note }));
    return [...landed, ...queued];
  }, [sent, pending, showResolved, openedAt]);
```

(`filter` returns a new array, so `sort` no longer needs the `[...sent]` copy.)

Replace the `onOpenChange` body (lines 489–495) with:

```tsx
      onOpenChange={(next) => {
        // Latch on the way open, never on the way closed — see the
        // `hasOpened` declaration above for why "ever opened" and "open right
        // now" have to stay two different things.
        if (next) {
          setHasOpened(true);
          // Every open starts with old resolved notes hidden, measured from now.
          setShowResolved(false);
          setOpenedAt(new Date());
        }
        setOpen(next);
      }}
```

Replace the log render (lines 622–641) with:

```tsx
        {entries.length === 0 && hiddenCount === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-muted-foreground">{EMPTY_LOG}</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {hiddenCount > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="self-start"
                onClick={() => setShowResolved((shown) => !shown)}
              >
                {showResolved ? "Hide resolved" : `Show resolved (${hiddenCount})`}
              </Button>
            ) : null}
            <ul className="flex flex-col gap-3">
              {entries.map((entry) =>
                entry.kind === "sent" ? (
                  <SentEntry
                    key={entry.note.id}
                    note={entry.note}
                    canDelete={entry.note.canDelete}
                    onDelete={handleDelete}
                  />
                ) : (
                  <PendingEntry key={entry.note.clientKey} note={entry.note} />
                ),
              )}
            </ul>
          </div>
        )}
```

In `SentEntry` (lines 695–742), compute the line after `const closed = statusLabel !== null;`:

```ts
  const resolved = resolutionLine(note);
```

and render it inside the `min-w-0 flex-1` div, directly after the body `<p>`:

```tsx
        {resolved ? (
          <p className="mt-1 pl-3 text-xs text-muted-foreground">{resolved}</p>
        ) : null}
```

In `/work/CLAUDE.md`, replace lines 67–70:

```
1. `npm run feedback:resolve -- <id> --site <site> --note "what you did"` for
   each `Resolves-Feedback:` trailer on that site's branch (`main` for the
   live site, `beta` for beta) since that site's last deploy. Write the note
   for *me* — what changed and any caveat worth knowing — not for a changelog.
```

with:

```
1. `npm run feedback:resolve -- <id> --site <site> --note "what you did"` for
   each `Resolves-Feedback:` trailer on that site's branch (`main` for the
   live site, `beta` for beta) since that site's last deploy. The note is the
   **Resolution**: write it *to the note's author*, in plain words, because
   they read it in their Feedback panel. Operator caveats go in the commit or
   the follow-ups, never in the Resolution (CONTEXT.md **Resolution**).
```

- [ ] **Step 4: Run the tests and confirm they pass.**

```
cd /work && TZ=UTC npx vitest run components/feedback/feedback-launcher.test.tsx lib/feedback-view.test.ts server/actions/feedback.test.ts && npx tsc --noEmit -p . && npx eslint components/feedback/feedback-launcher.tsx lib/feedback-view.ts
```

Expected: every test passes, including LA-023 (the empty-state `div` is unchanged) and the focus-on-open tests. `tsc` and `eslint` are clean.

- [ ] **Step 5: Commit.**

```
cd /work && git add components/feedback/feedback-launcher.tsx components/feedback/feedback-launcher.test.tsx CLAUDE.md && git commit -m "feat(feedback): hide week-old resolved notes behind Show resolved

The panel lists Open notes plus Done/Won't fix ones resolved in the last
7 days; older ones wait behind 'Show resolved (N)', hidden again on each
open. Each closed note shows 'Done 5 Oct — {Resolution}'. CLAUDE.md: a
Resolution is written to the note's author (spec 2026-10-05 §A).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Review focus candidates
- The 7-day boundary and the `resolvedAt === null` → hidden choice: confirm that "exactly 7 days" shows, and that legacy closed rows with no date don't stay in the log forever.
- `openedAt` / `showResolved` reset lives only in `onOpenChange`. Check that SheetTrigger and Escape/X both route through it, and that the docked↔modal remount doesn't reset the toggle mid-open.
- The new scroll wrapper (a `div` around the `ul`) must keep the log scrolling under the pinned write box on phone and docked shapes. Check it in the browser, not only in jsdom.
# Plan fragment: §B (Trips map/tally row), §H (Globe filter box), §I (portrait cover on phone Trip home)

Spec: `docs/specs/2026-10-05-feedback-batch-resolved-panel-deadline-stays-schedule.md` §B, §H, §I.
Branch: `feat/feedback-batch-2026-10-05`. `SCRATCH=/tmp/claude-1000/-work/57ede0fd-0733-4004-81be-72517e20e05d/scratchpad`.

Facts checked while drafting (so the implementer doesn't re-derive them):
- B: `TRAVELS_ROW` (`app/(app)/trips/page.tsx:26`) has no height below xl; `.tally-card { container-type: size }` (`app/globals.css:318`) means the TallyCard can't size its row, so the row collapses to the map column's `min-h-[150px]`. At xl the row is `xl:flex-1` inside the `xl:h-dvh` FRAME. Tailwind sorts `xl:` after `md:`, so `xl:h-auto` beats `md:h-[360px]` at ≥1280. The loading skeleton (`app/(app)/trips/loading.tsx`) uses a separate grid with the map at `md:h-[380px]`. Nothing in `loading.test.tsx` checks that value.
- H: the zero-marker empty state currently lives in `MarkerList` ("No markers yet"), and the filters render above it anyway. The filters-hide-everything state is in `GlobeView` ("Nothing matches"). `MarkerForm` seeds its place-search `query` from `marker?.title ?? ""`, and `GlobeView` remounts it on every open through `key={openSeq…}`, so a new `initialQuery` prop only needs to seed `useState`.
- I: the phone trip name `<h1>` is **not** in the page. It's in the trip **layout** (`app/(app)/trips/[tripId]/layout.tsx`, inside `TripHeaderFrame`, which is `lg:hidden` on Home). The band is `cover` (Sketching/Travelling/Past, a direct `HOME_STACK` child) or `coverTile` (Planning/Final-prep, handed to `PhasePlanning`, which wraps it in an `AnimatedItem` grid cell). `coverAspect` is width/height (`Float?`). `isPortrait` (`lib/cover.ts`) returns true below 0.9, and null/undefined counts as not portrait. **Tapping the band today does nothing**: `CoverArt` gets `canEdit: false`, and `TripCoverCard` is a plain `Card` with no link or handler. So "does what tapping the band does" means the frame is non-interactive too. A test pins that. `TRIP_SHELL_SELECT` already carries `coverImageKey` but not `coverAspect`.
- Screenshots: `npm run audit:layout` (Playwright installed globally, so it needs `NODE_PATH=/usr/local/lib/node_modules`). It needs a running **`next dev`** on localhost:3000 and refuses anything else. Widths are 360/375/390/430/768/1024/1280/1440/1920/2560 (no 1264), and capture ids look like `deep/trips/none/768-light`. Local `.env`/`.env.local` point at a local DB with local disk storage. **Never** use `scripts/load-env.ts`-based scripts: they prefer `.env.production.local`.

---

### Task 3: [B1] Trips list map/tally row is 360px tall from md to xl

**Files:**
- Modify: `app/(app)/trips/page.tsx:26` (`TRAVELS_ROW`)
- Modify: `app/(app)/trips/loading.tsx:24` (map skeleton `md:h-[380px]` → `md:h-[360px]`)
- Test: `app/(app)/trips/page.test.tsx` (add 2 cases inside `describe("TripsPage")`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `TRAVELS_ROW` class string gains `md:h-[360px] xl:h-auto` (module-private const; the change is CSS only).

- [ ] **Step 1: Write the failing tests.** Append inside `describe("TripsPage", …)` in `app/(app)/trips/page.test.tsx`:

```tsx
  // Spec 2026-10-05 §B: .tally-card is `container-type: size`, so its content
  // can't size the row; below xl nothing else did and the tally overflowed.
  // md→xl the row is a fixed 360px; ≥xl the FRAME's flex-1 takes over again.
  it("gives the populated map/tally row a fixed 360px height from md up to xl", async () => {
    m.load.mockResolvedValue({ firstName: "Cam", cards: [card("eu", "up-next")], counts: { upcoming: 1, done: 0 }, hasDoneTrip: false, anyStops: true, mapTrips: [], stats });
    render(await TripsPage());
    const row = screen.getByTestId("map").closest("div.grid")!;
    const cls = row.className.split(/\s+/);
    expect(cls).toContain("md:h-[360px]");
    expect(cls).toContain("xl:h-auto");
    expect(cls).toContain("xl:flex-1");
    expect(row).toContainElement(screen.getByTestId("tally"));
  });
  it("gives the first-run map/tally row the same md→xl height", async () => {
    m.load.mockResolvedValue({ firstName: "Cam", cards: [], counts: { upcoming: 0, done: 0 }, hasDoneTrip: false, anyStops: false, mapTrips: [], stats });
    render(await TripsPage());
    const cls = screen.getByTestId("map").closest("div.grid")!.className.split(/\s+/);
    expect(cls).toContain("md:h-[360px]");
    expect(cls).toContain("xl:h-auto");
  });
```

- [ ] **Step 2: Run them and watch them fail.**
  `TZ=UTC npx vitest run "app/(app)/trips/page.test.tsx"`
  Expected: the two new cases FAIL with `expected [ 'grid', 'grid-cols-12', … ] to include 'md:h-[360px]'`. The other 6 pass.

- [ ] **Step 3: Implement.** In `app/(app)/trips/page.tsx`, replace line 26 with:

```tsx
// md→xl: a fixed 360px (spec 2026-10-05 §B). The TallyCard is
// `container-type: size` (globals.css), so it can't size this row itself;
// without a height the row collapsed to the map's 150px min and the tally
// overflowed. ≥xl the row is flex-1 inside the one-screen FRAME instead
// (xl:h-auto undoes the fixed height there; xl sorts after md).
const TRAVELS_ROW = "grid grid-cols-12 gap-[18px] pr-[18px] md:pr-10 md:h-[360px] xl:h-auto xl:min-h-0 xl:flex-1 xl:[@media(max-height:819px)]:min-h-[360px]";
```

  In `app/(app)/trips/loading.tsx` line 24, change the map skeleton's `md:h-[380px]` to `md:h-[360px]`. That makes the skeleton row as tall as the real one below xl. At xl the skeleton never matched flex-1 anyway.

- [ ] **Step 4: Run them and watch them pass.**
  `TZ=UTC npx vitest run "app/(app)/trips/page.test.tsx" "app/(app)/trips/loading.test.tsx"`
  Expected: all pass.

- [ ] **Step 5: Verify by screenshots at 768, 1024 and 1264.**
  1. Start the dev server in the background (Bash `run_in_background: true`): `cd /work && npm run dev`. Wait until `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/` prints 200 or 307.
  2. Run the audit captures for 768/1024 (plus 1280, to confirm xl is unchanged). The first run also writes the auth state the next step reuses:
     ```
     cd /work && NODE_PATH=/usr/local/lib/node_modules LAYOUT_AUDIT_OUT=$SCRATCH/audit-B LAYOUT_AUDIT_AUTH_STATE=$SCRATCH/auth.json LAYOUT_AUDIT_ONLY="deep/trips/none/768-light,deep/trips/none/1024-light,deep/trips/none/1280-light" npm run audit:layout
     ```
  3. 1264 isn't an audit width, so write `$SCRATCH/shots.cjs` (CommonJS, so `NODE_PATH` resolves `playwright`. Don't commit it):
     ```js
     // Ad-hoc screenshots + geometry probe. Usage:
     //   OUT=… AUTH=… node shots.cjs '[{"name":"trips-1264","path":"/trips","w":1264,"h":910}]'
     // "path" may be "trip:<name regex>" to open that Trip's Home via the Trips list.
     const { chromium } = require("playwright");
     const BASE = process.env.BASE_URL || "http://localhost:3000";
     const { OUT, AUTH } = process.env;
     const jobs = JSON.parse(process.argv[2]);
     (async () => {
       const browser = await chromium.launch();
       for (const j of jobs) {
         const mobile = j.w < 768;
         const ctx = await browser.newContext({ storageState: AUTH, viewport: { width: j.w, height: j.h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
         const page = await ctx.newPage();
         let path = j.path;
         if (path.startsWith("trip:")) {
           await page.goto(BASE + "/trips", { waitUntil: "networkidle" });
           path = await page.getByRole("link", { name: new RegExp(path.slice(5)) }).first().getAttribute("href");
         }
         await page.goto(BASE + path, { waitUntil: "networkidle" });
         await page.waitForTimeout(1200);
         const probe = await page.evaluate(() => {
           const vis = (el) => !!el && el.getBoundingClientRect().height > 0;
           const t = document.querySelector("section.tally-card");
           const frame = document.querySelector('[data-testid="portrait-cover"]');
           const bandPhotos = [...document.querySelectorAll('[data-testid="cover-photo"]')].filter((el) => !el.closest('[data-testid="portrait-cover"]'));
           return {
             tally: t ? { clientH: t.clientHeight, scrollH: t.scrollHeight, overflows: t.scrollHeight > t.clientHeight + 1, cellsShown: [...t.querySelectorAll("dl > div")].filter(vis).length } : null,
             portraitFrame: vis(frame) ? (({ x, y, width, height }) => ({ x, y, width, height }))(frame.getBoundingClientRect()) : null,
             bandPhotoVisible: bandPhotos.some(vis),
           };
         });
         console.log(j.name, JSON.stringify(probe));
         await page.screenshot({ path: `${OUT}/${j.name}.png` });
         await ctx.close();
       }
       await browser.close();
     })();
     ```
     Run:
     ```
     mkdir -p $SCRATCH/shots && cd $SCRATCH && NODE_PATH=/usr/local/lib/node_modules OUT=$SCRATCH/shots AUTH=$SCRATCH/auth.json node shots.cjs '[{"name":"trips-768","path":"/trips","w":768,"h":900},{"name":"trips-1024","path":"/trips","w":1024,"h":900},{"name":"trips-1264","path":"/trips","w":1264,"h":910},{"name":"trips-1280","path":"/trips","w":1280,"h":900}]'
     ```
  4. **What to check:**
     - Each probe line prints `"overflows":false` and `"cellsShown":4` at 768, 1024 and 1264.
     - At 1280, cells are 4 or 6. 6 is fine there: that's ≥xl, so it's unchanged.
     - Read `$SCRATCH/shots/trips-1264.png` and the audit's `$SCRATCH/audit-B/shots/deep/trips/none/{768,1024}-light*.png`. Map and tally should be the same height (360px below xl). The tally's 4 cells should sit inside its yellow card, with no text past the bottom border. The map shouldn't be squashed.
     - `findings.auto.json` in `$SCRATCH/audit-B` should have no new overflow finding on those captures.
     - If 768 shows the tally text wrapping out of a narrow column, report it. Don't widen anything.

- [ ] **Step 6: Commit.**
  ```
  git add "app/(app)/trips/page.tsx" "app/(app)/trips/loading.tsx" "app/(app)/trips/page.test.tsx"
  git commit -F - <<'EOF'
  fix(trips): map/tally row is 360px tall from md to xl

  The tally card is container-type: size, so it can't size its row;
  below xl nothing else did, the row collapsed to the map's 150px
  minimum and the tally spilled out. md→xl the row is now a fixed
  360px; ≥xl stays flex-1 in the one-screen frame. The loading
  skeleton's map matches (spec 2026-10-05 §B).

  Resolves-Feedback: cmutai0m4000604l8mtbi92xt

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  EOF
  ```

---

### Task 4: [H1] Globe filter box reads as a filter; no-match offers "Add {query}"; zero markers hide the filters

**Files:**
- Modify: `components/globe/marker-form.tsx:37-45` (props), `:55` (destructure), `:74` (`query` seed)
- Modify: `components/globe/marker-filters.tsx:20` (docblock), `:30-33` (placeholder + aria-label)
- Modify: `components/globe/globe-view.tsx:11` (icons), `:33-43` (state), `:64-67` (openers), `:122-144` (panel), `:147-156` (MarkerForm props)
- Test: `components/globe/marker-form.test.tsx` (add a describe), `components/globe/globe-view.test.tsx` (update 2 existing cases, add a describe)

**Interfaces:**
- Consumes: `filterMarkers`, `MarkerFilter` (`lib/globe-list.ts`, unchanged), `EmptyState` (`action` prop), `Button`.
- Produces: `MarkerFormProps.initialQuery?: string`. It seeds the "Place search" box in add mode and is ignored when `marker` is set. The filter input's accessible name and placeholder become `"Filter your markers"`.

- [ ] **Step 1: Write the failing tests.**

  (a) `components/globe/marker-form.test.tsx`: append at the end of the file:

```tsx
describe("MarkerForm — initialQuery (spec 2026-10-05 §H)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prefills the place search with initialQuery in add mode, leaving the title empty", () => {
    render(<MarkerForm {...baseProps} initialQuery="Ireland" />);
    expect(screen.getByLabelText("Place search")).toHaveValue("Ireland");
    expect(screen.getByPlaceholderText(/tokyo tower/i)).toHaveValue("");
    expect(searchPlacesAction).not.toHaveBeenCalled();
  });

  it("ignores initialQuery when editing — the marker's own title seeds the search", () => {
    render(<MarkerForm {...baseProps} marker={existingMarker} initialQuery="Ireland" />);
    expect(screen.getByLabelText("Place search")).toHaveValue("Tokyo Tower");
  });
});
```

  (b) `components/globe/globe-view.test.tsx`: in `describe("GlobeView — Playground kit shape")`:
  - In `"puts search, filters and the list in one kit Card"`, change `{ name: "Search the globe" }` to `{ name: "Filter your markers" }`.
  - Replace the whole `"says nothing matches (not 'no markers yet') when filters hide every marker"` case with:

```tsx
  it("says nothing is called that (not 'no markers yet') when the query hides every marker", async () => {
    const user = userEvent.setup();
    render(<GlobeView markers={markers} members={[]} />);
    await user.type(screen.getByRole("textbox", { name: "Filter your markers" }), "zzz");
    expect(screen.getByRole("heading", { name: "Nothing called 'zzz' on your globe yet" })).toBeInTheDocument();
    expect(screen.queryByText(/no markers yet/i)).not.toBeInTheDocument();
  });
```

  Then add a new describe after it:

```tsx
describe("GlobeView — filter box can't be mistaken for adding a place (spec 2026-10-05 §H)", () => {
  const markers = [
    mk("1", "Eiffel Tower", "France"),
    mk("2", "Louvre", "France", "ACTIVITY"),
  ];
  beforeEach(() => vi.clearAllMocks());

  it("labels the box as a filter of your markers, not a place search", () => {
    render(<GlobeView markers={markers} members={[]} />);
    const box = screen.getByRole("textbox", { name: "Filter your markers" });
    expect(box).toHaveAttribute("placeholder", "Filter your markers");
    expect(screen.queryByRole("textbox", { name: "Search the globe" })).toBeNull();
    expect(screen.queryByPlaceholderText("Search places")).toBeNull();
  });

  it("a query with no matches offers 'Add {query}', which opens Add Marker with the place search prefilled", async () => {
    const user = userEvent.setup();
    render(<GlobeView markers={markers} members={[]} />);
    await user.type(screen.getByRole("textbox", { name: "Filter your markers" }), "Ireland");
    expect(screen.getByRole("heading", { name: "Nothing called 'Ireland' on your globe yet" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Ireland" }));
    expect(screen.getByRole("heading", { name: "Add Marker" })).toBeInTheDocument();
    expect(screen.getByLabelText("Place search")).toHaveValue("Ireland");
    expect(screen.getByPlaceholderText(/tokyo tower/i)).toHaveValue("");
  });

  it("the header's Add marker still opens a blank search after an 'Add {query}'", async () => {
    const user = userEvent.setup();
    render(<GlobeView markers={markers} members={[]} />);
    await user.type(screen.getByRole("textbox", { name: "Filter your markers" }), "Ireland");
    await user.click(screen.getByRole("button", { name: "Add Ireland" }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await user.click(screen.getByRole("button", { name: /add marker/i }));
    expect(screen.getByLabelText("Place search")).toHaveValue("");
  });

  it("a category with no matches and no query says 'Nothing matches' with no Add button", async () => {
    const user = userEvent.setup();
    render(<GlobeView markers={markers} members={[]} />);
    await user.click(screen.getByRole("button", { name: "Food & Drink" }));
    expect(screen.getByRole("heading", { name: "Nothing matches" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /nothing called/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Add (?!marker)/ })).toBeNull();
  });

  it("a query that matches shows the list, no empty state", async () => {
    const user = userEvent.setup();
    render(<GlobeView markers={markers} members={[]} />);
    await user.type(screen.getByRole("textbox", { name: "Filter your markers" }), "louvre");
    expect(screen.getByText("Louvre")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /nothing/i })).toBeNull();
  });

  it("zero markers: no filters, one empty state pointing to Add marker or the map", () => {
    render(<GlobeView markers={[]} members={[]} />);
    const panel = screen.getByTestId("globe-panel");
    expect(within(panel).queryByRole("textbox", { name: "Filter your markers" })).toBeNull();
    expect(within(panel).queryByRole("combobox", { name: "Country" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "All" })).toBeNull();
    expect(within(panel).getAllByRole("heading")).toHaveLength(1);
    expect(within(panel).getByRole("heading", { name: "No markers yet" })).toBeInTheDocument();
    expect(within(panel).getByText("Tap the map to drop one, or use Add marker above.")).toBeInTheDocument();
  });
});
```

  If the MarkerForm footer's close button isn't named "Cancel", change `/cancel/i` in the third case to match what `DialogClose` renders in `marker-form.tsx`. Check with `grep -n "DialogClose" -A4 components/globe/marker-form.tsx`.

- [ ] **Step 2: Run them and watch them fail.**
  `TZ=UTC npx vitest run components/globe/globe-view.test.tsx components/globe/marker-form.test.tsx`
  Expected failures:
  - marker-form: "prefills…" fails with `expected '' to have value 'Ireland'`. The edit case already passes.
  - globe-view: every case that queries `{ name: "Filter your markers" }` fails with `Unable to find an accessible element with the role "textbox" and name "Filter your markers"`.
  - globe-view: the zero-markers case fails because the textbox and the Country combobox are present.

- [ ] **Step 3: Implement.**

  `components/globe/marker-form.tsx`: add the prop and seed it:

```tsx
export interface MarkerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marker?: MarkerView | null;
  prefill?: { lat: number; lng: number } | null;
  /** Add mode only: seeds the place search (the Globe's "Add {query}" from a
   * filter that matched nothing — spec 2026-10-05 §H). Ignored when editing. */
  initialQuery?: string;
  onSaved: () => void;
  globeId?: string;
  attachments?: AttachmentView[];
}
```
```tsx
export function MarkerForm({ open, onOpenChange, marker, prefill, initialQuery, onSaved, globeId, attachments }: MarkerFormProps) {
```
```tsx
  const [query, setQuery] = useState(marker?.title ?? initialQuery ?? "");
```

  `components/globe/marker-filters.tsx`: change the docblock to `/** Kit Globe list header: the "Filter your markers" field (it filters the markers below; adding a place is "Add marker"), then country + category filters as kit Chips. */`, and change the Input:

```tsx
        <Input
          className="pl-11"
          placeholder="Filter your markers"
          aria-label="Filter your markers"
          value={filter.query}
          onChange={(e) => onChange({ ...filter, query: e.target.value })}
        />
```

  `components/globe/globe-view.tsx`:
  - Line 11: `import { Globe, Plus, SearchX } from "lucide-react";`
  - After the `prefill` state:
```tsx
  // "Add {query}" (spec 2026-10-05 §H): the filter text to prefill the Add
  // Marker place search with; null for every other way of opening the form.
  const [addQuery, setAddQuery] = useState<string | null>(null);
```
  - Replace the three openers:
```tsx
  const openAdd = () => { setEditing(null); setPrefill(null); setAddQuery(null); setOpenSeq((n) => n + 1); setFormOpen(true); };
  const openAddNamed = (q: string) => { setEditing(null); setPrefill(null); setAddQuery(q); setOpenSeq((n) => n + 1); setFormOpen(true); };
  const openEdit = (id: string) => { setEditing(byId.get(id) ?? null); setPrefill(null); setAddQuery(null); setOpenSeq((n) => n + 1); setFormOpen(true); };
  const openDrop = (lat: number, lng: number) => { setEditing(null); setPrefill({ lat, lng }); setAddQuery(null); setOpenSeq((n) => n + 1); setFormOpen(true); };
```
  - Next to `hiddenByFilters`: `const query = filter.query.trim();`
  - Replace the `<Card data-testid="globe-panel" …>` body:
```tsx
        <Card data-testid="globe-panel" className="flex min-w-0 flex-col gap-3 p-3.5 lg:p-[18px]">
          {markers.length === 0 ? (
            // Nothing to filter yet: no filter box to mistake for adding a
            // place (spec 2026-10-05 §H) — one pointer to the two real ways in.
            <EmptyState
              icon={Globe}
              tone="teal"
              title="No markers yet"
              description="Tap the map to drop one, or use Add marker above."
            />
          ) : (
            <>
              <MarkerFilters filter={filter} countries={countries} onChange={setFilter} />
              {hiddenByFilters ? (
                query ? (
                  <EmptyState
                    icon={SearchX}
                    tone="teal"
                    title={`Nothing called '${query}' on your globe yet`}
                    action={
                      <Button onClick={() => openAddNamed(query)}>
                        <Plus aria-hidden="true" strokeWidth={3} />
                        Add {query}
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={SearchX}
                    tone="teal"
                    title="Nothing matches"
                    description="Try another country or category."
                  />
                )
              ) : (
                <MarkerList
                  markers={filtered}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  globeId={globeId}
                  attachmentsByMarkerId={attachmentsByMarkerId}
                />
              )}
            </>
          )}
        </Card>
```
  - On `<MarkerForm …>` add `initialQuery={addQuery ?? undefined}` (after `prefill={prefill}`).

  Note: `filter` isn't reset when markers drop to 0 (after deleting the last one). That's harmless, because the filters are hidden and the zero-marker branch wins.

- [ ] **Step 4: Run them and watch them pass.**
  `TZ=UTC npx vitest run components/globe/`
  Expected: all globe tests pass, including `marker-list.test.tsx`, which is unchanged: MarkerList keeps its own empty state.

- [ ] **Step 5: Commit.**
  ```
  git add components/globe/marker-form.tsx components/globe/marker-filters.tsx components/globe/globe-view.tsx components/globe/marker-form.test.tsx components/globe/globe-view.test.tsx
  git commit -F - <<'EOF'
  feat(globe): filter box can't be mistaken for adding a place

  The list's search box read "Search places", so Travellers typed a
  new place into it and got an empty list. It now reads "Filter your
  markers"; a query that matches nothing says "Nothing called '…' on
  your globe yet" with an "Add …" button that opens Add Marker with
  the place search prefilled; a Globe with no markers hides the
  filters behind one empty state (spec 2026-10-05 §H).

  Resolves-Feedback: cmut9zwzv000204l8tem63thb

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  EOF
  ```

---

### Task 5: [I1] Portrait cover building blocks (`fit="contain"`, `showsPortraitCoverFrame`, `PortraitCoverFrame`, `TripHomeOnly`)

**Files:**
- Modify: `components/trips/cover-photo-image.tsx:21-28` (props), `:30` (signature), `:55-56` (class/style)
- Modify: `lib/cover.ts` (append helper)
- Create: `components/trip/home/portrait-cover-frame.tsx`
- Create: `components/trip/trip-home-only.tsx`
- Test: `components/trips/cover-photo-image.test.tsx` (add a case), `lib/cover.test.ts` (add a describe), Create `components/trip/home/portrait-cover-frame.test.tsx`, Create `components/trip/trip-home-only.test.tsx`

**Interfaces:**
- Consumes: `isPortrait` (`lib/cover.ts`), `isTripHomePath` (`components/shell/app-paths.ts`), `TripCoverCard`, `CoverPhotoImage`.
- Produces:
  - `CoverPhotoImageProps.fit?: "cover" | "contain"`, default `"cover"`. With `"contain"` the image is `object-contain` and has no `objectPosition`.
  - `showsPortraitCoverFrame(trip: { coverImageKey: string | null; coverAspect: number | null | undefined }): boolean`
  - `PortraitCoverFrame({ url, name }: { url: string; name: string }): JSX.Element`. Root is `<div data-testid="portrait-cover" className="shrink-0 sm:hidden">`, holding a 96×128 (`w-24 h-32`) `TripCoverCard`.
  - `TripHomeOnly({ children }: { children: ReactNode })`. Client component: renders `children` only when `isTripHomePath(usePathname())`.

- [ ] **Step 1: Write the failing tests.**

  `components/trips/cover-photo-image.test.tsx`: add inside `describe("CoverPhotoImage")`:
```tsx
  it("fit='contain' shows the whole photo — object-contain, no focal crop (spec 2026-10-05 §I)", () => {
    const { container } = render(
      <CoverPhotoImage url="/c" alt="x" focalX={0.2} focalY={0.8} sizes="96px" fit="contain" />,
    );
    const img = container.querySelector("img")!;
    expect(img.className).toMatch(/\bobject-contain\b/);
    expect(img.className).not.toMatch(/\bobject-cover\b/);
    expect(img.style.objectPosition).toBe("");
  });

  it("defaults to object-cover at the focal point", () => {
    const { container } = render(
      <CoverPhotoImage url="/c" alt="x" focalX={0.2} focalY={0.8} sizes="96px" />,
    );
    const img = container.querySelector("img")!;
    expect(img.className).toMatch(/\bobject-cover\b/);
    expect(img.style.objectPosition).toBe("20% 80%");
  });
```

  `lib/cover.test.ts`: change the import to `import { isPortrait, showsPortraitCoverFrame } from "./cover";` and append:
```ts
describe("showsPortraitCoverFrame", () => {
  it("is true for an uploaded portrait photo", () => {
    expect(showsPortraitCoverFrame({ coverImageKey: "k", coverAspect: 0.75 })).toBe(true);
  });
  it("is false with no photo, even if a stale aspect is stored", () => {
    expect(showsPortraitCoverFrame({ coverImageKey: null, coverAspect: 0.75 })).toBe(false);
  });
  it("is false for landscape or square photos", () => {
    expect(showsPortraitCoverFrame({ coverImageKey: "k", coverAspect: 1.5 })).toBe(false);
    expect(showsPortraitCoverFrame({ coverImageKey: "k", coverAspect: 1 })).toBe(false);
  });
  it("is false while the aspect is unknown (null / not selected)", () => {
    expect(showsPortraitCoverFrame({ coverImageKey: "k", coverAspect: null })).toBe(false);
    expect(showsPortraitCoverFrame({ coverImageKey: "k", coverAspect: undefined })).toBe(false);
  });
});
```

  Create `components/trip/home/portrait-cover-frame.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/trips/cover-photo-image", () => ({
  CoverPhotoImage: (p: { url: string; alt: string; fit?: string; sizes: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img data-testid="cover-photo" src={p.url} alt={p.alt} data-fit={p.fit ?? "cover"} data-sizes={p.sizes} />
  ),
}));

import { PortraitCoverFrame } from "./portrait-cover-frame";

describe("PortraitCoverFrame (spec 2026-10-05 §I)", () => {
  it("is a small portrait frame, phones only, showing the whole photo", () => {
    render(<PortraitCoverFrame url="/api/trips/t/cover?v=k" name="Christmas in Europe" />);
    const frame = screen.getByTestId("portrait-cover");
    expect(frame.className.split(/\s+/)).toEqual(expect.arrayContaining(["shrink-0", "sm:hidden"]));
    const card = frame.firstElementChild as HTMLElement;
    expect(card.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-32", "w-24"]));
    const img = screen.getByRole("img", { name: "Christmas in Europe cover photo" });
    expect(img).toHaveAttribute("src", "/api/trips/t/cover?v=k");
    expect(img).toHaveAttribute("data-fit", "contain");
    expect(img).toHaveAttribute("data-sizes", "96px");
  });

  it("does nothing on tap, as the band never did", () => {
    render(<PortraitCoverFrame url="/c" name="T" />);
    const frame = screen.getByTestId("portrait-cover");
    expect(frame.querySelector("a, button")).toBeNull();
    expect(frame.closest("a, button")).toBeNull();
  });
});
```

  Create `components/trip/trip-home-only.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const pathname = vi.hoisted(() => vi.fn(() => "/trips/eu"));
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

import { TripHomeOnly } from "./trip-home-only";

describe("TripHomeOnly", () => {
  it("renders its children on a Trip's Home", () => {
    pathname.mockReturnValue("/trips/eu");
    render(<TripHomeOnly><span>here</span></TripHomeOnly>);
    expect(screen.getByText("here")).toBeInTheDocument();
  });
  it.each(["/trips/eu/plan", "/trips/eu/settings", "/trips/eu/day/2026-12-24"])("renders nothing on %s", (p) => {
    pathname.mockReturnValue(p);
    render(<TripHomeOnly><span>here</span></TripHomeOnly>);
    expect(screen.queryByText("here")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and watch them fail.**
  `TZ=UTC npx vitest run components/trips/cover-photo-image.test.tsx lib/cover.test.ts components/trip/home/portrait-cover-frame.test.tsx components/trip/trip-home-only.test.tsx`
  Expected:
  - cover-photo-image: the contain case fails (`/object-contain/` not matched).
  - cover.test: fails with `showsPortraitCoverFrame is not a function`.
  - The two new files fail with `Failed to resolve import "./portrait-cover-frame"` and `"./trip-home-only"`.

- [ ] **Step 3: Implement.**

  `components/trips/cover-photo-image.tsx`: add to `CoverPhotoImageProps`:
```tsx
  /** "cover" (default) fills the frame cropped at the focal point; "contain"
   * shows the whole photo, letterboxed (the phone Home's portrait frame —
   * spec 2026-10-05 §I). */
  fit?: "cover" | "contain";
```
  Signature: `export function CoverPhotoImage({ url, alt, focalX, focalY, sizes, fit = "cover" }: CoverPhotoImageProps) {`
  On the `<Image>`:
```tsx
      className={cn(fit === "contain" ? "object-contain" : "object-cover", "transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0")}
      style={fit === "contain" ? undefined : { objectPosition: `${(focalX ?? 0.5) * 100}% ${(focalY ?? 0.5) * 100}%` }}
```

  `lib/cover.ts`: append:
```ts
/**
 * Spec 2026-10-05 §I: on a phone (below sm) the Trip Home shows an uploaded
 * portrait photo whole, in a small frame beside the trip name, instead of the
 * full-width band. Needs a photo AND a known portrait aspect — no photo
 * (generated art) or an unknown/landscape/square aspect keeps the band.
 */
export function showsPortraitCoverFrame(trip: { coverImageKey: string | null; coverAspect: number | null | undefined }): boolean {
  return trip.coverImageKey != null && isPortrait(trip.coverAspect);
}
```

  Create `components/trip/home/portrait-cover-frame.tsx`:
```tsx
import { TripCoverCard } from "@/components/trip/trip-cover-card";
import { CoverPhotoImage } from "@/components/trips/cover-photo-image";

/**
 * Phone Trip Home, portrait cover (spec 2026-10-05 §I): a small 3:4 frame
 * beside the trip name in the trip layout's header, showing the whole photo
 * (object-contain, no focal crop) in place of the full-width band. Phones
 * only (sm:hidden) — from sm the band returns. Not interactive: the band it
 * replaces has no tap action either (CoverArt canEdit=false on Home).
 */
export function PortraitCoverFrame({ url, name }: { url: string; name: string }) {
  return (
    <div data-testid="portrait-cover" className="shrink-0 sm:hidden">
      <TripCoverCard className="h-32 w-24 rounded-xl">
        <CoverPhotoImage url={url} alt={`${name} cover photo`} focalX={null} focalY={null} sizes="96px" fit="contain" />
      </TripCoverCard>
    </div>
  );
}
```

  Create `components/trip/trip-home-only.tsx`:
```tsx
"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isTripHomePath } from "@/components/shell/app-paths";

/**
 * Renders its children only on a Trip's Home (/trips/:id exactly). The trip
 * layout's header is shared by every trip route; this lets it carry a
 * Home-only piece (the phone portrait cover frame, spec 2026-10-05 §I)
 * without the layout knowing the route — same pathname test as
 * TripHeaderFrame.
 */
export function TripHomeOnly({ children }: { children: ReactNode }) {
  return isTripHomePath(usePathname()) ? <>{children}</> : null;
}
```

- [ ] **Step 4: Run them and watch them pass.**
  `TZ=UTC npx vitest run components/trips/cover-photo-image.test.tsx lib/cover.test.ts components/trip/home/portrait-cover-frame.test.tsx components/trip/trip-home-only.test.tsx components/trips/trip-cover.test.tsx lib/image-loader-boundary.test.ts`
  Expected: all pass. The boundary test still passes because `CoverPhotoImage` keeps `"use client"` and the loader stays inside it.

- [ ] **Step 5: Commit.**
  ```
  git add components/trips/cover-photo-image.tsx components/trips/cover-photo-image.test.tsx lib/cover.ts lib/cover.test.ts components/trip/home/portrait-cover-frame.tsx components/trip/home/portrait-cover-frame.test.tsx components/trip/trip-home-only.tsx components/trip/trip-home-only.test.tsx
  git commit -F - <<'EOF'
  feat(trip-home): portrait cover frame building blocks

  CoverPhotoImage gains fit="contain" (whole photo, no focal crop);
  showsPortraitCoverFrame decides when the phone Home swaps the band
  for a frame (photo + known portrait aspect); PortraitCoverFrame is
  the 96x128 phones-only frame; TripHomeOnly lets the shared trip
  header carry a Home-only piece. Wired up next (spec 2026-10-05 §I).

  Resolves-Feedback: cmutd5703000004lenvgzu71m

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  EOF
  ```

---

### Task 6: [I2] Wire the portrait frame beside the trip name; hide the band below sm when it shows

**Files:**
- Modify: `lib/trip-shell-reads.ts:27-41` (`TRIP_SHELL_SELECT` += `coverAspect: true`)
- Modify: `app/(app)/trips/[tripId]/layout.tsx` (imports; name block at ~`:131-150` wrapped in a row with the frame)
- Modify: `app/(app)/trips/[tripId]/page.tsx` (imports; `cover` ~`:142-146`; `coverTile` ~`:152-156`; the `PhasePlanning` call ~`:188-197`)
- Modify: `components/trip/home/phase-planning.tsx:48-51` (prop), `:59-68` (destructure), `:227-231` (cover `AnimatedItem`)
- Test: `lib/trip-shell-reads.test.ts:27`, `components/trip/home/phase-planning.test.tsx` (add a case), `app/(app)/trips/[tripId]/page.test.tsx` (mocks + a describe), `app/(app)/trips/[tripId]/layout.test.tsx` (mock + 1 case)

**Interfaces:**
- Consumes: `showsPortraitCoverFrame`, `PortraitCoverFrame`, `TripHomeOnly` (Task I1); `cn` (`@/lib/cn`).
- Produces:
  - `PhasePlanningProps.coverClassName?: string`, merged onto the cover's `AnimatedItem` grid item.
  - `TRIP_SHELL_SELECT.coverAspect`.
  - The `TripCoverCard` band (and the Planning cover grid item) gets `max-sm:hidden` exactly when `showsPortraitCoverFrame(trip)`.

- [ ] **Step 1: Write the failing tests.**

  `lib/trip-shell-reads.test.ts:27`: add `"coverImageKey", "coverAspect"` to the key list:
```ts
    for (const key of ["id", "name", "startDate", "endDate", "homeCurrency", "forksEnabled", "coverImageKey", "coverAspect", "members", "stops"]) {
```

  `components/trip/home/phase-planning.test.tsx`: add after `"puts the cover band above the hero on a phone and back in grid order at lg"`:
```tsx
  it("adds coverClassName to the cover's grid item, so the page can hide the whole cell below sm (spec 2026-10-05 §I)", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const tree = await PhasePlanning({
      tripId: "trip-1",
      trip: baseTrip,
      today: "2025-12-01",
      phase: "planning",
      cover: <div data-testid="cover-tile" />,
      coverClassName: "max-sm:hidden",
    });
    const div = document.createElement("div");
    div.innerHTML = renderToStaticMarkup(tree as Parameters<typeof renderToStaticMarkup>[0]);
    const classes = div.querySelector('[data-testid="cover-tile"]')!.parentElement!.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["-order-1", "lg:order-none", "max-sm:hidden"]));
  });
```

  `app/(app)/trips/[tripId]/page.test.tsx`:
  - Replace the `TripCoverCard` mock so it keeps its className:
```tsx
vi.mock("@/components/trip/trip-cover-card", () => ({
  TripCoverCard: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="cover-card" className={className}>{children}</div>
  ),
}));
// The portrait frame's photo (next/image underneath) — an inspectable stub.
vi.mock("@/components/trips/cover-photo-image", () => ({
  CoverPhotoImage: (p: { url: string; alt: string; fit?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img data-testid="cover-photo" src={p.url} alt={p.alt} data-fit={p.fit ?? "cover"} />
  ),
}));
```
  - Make the `PhasePlanning` mock expose the new prop:
```tsx
vi.mock("@/components/trip/home/phase-planning", () => ({
  PhasePlanning: (props: { reminders?: React.ReactNode; cover?: React.ReactNode; coverClassName?: string }) => (
    <div data-testid="phase-marker">
      <div data-testid="cover-slot" data-cover-class={props.coverClassName ?? ""}>{props.cover}</div>
      {props.reminders}
    </div>
  ),
}));
```
  - Add `coverAspect: null as number | null,` to `BASE_TRIP` (after `coverImageKey`).
  - Add a describe after `describe("cover placement by Phase", …)`:
```tsx
  // Spec 2026-10-05 §I: below sm, a portrait photo shows whole in a small
  // frame beside the trip name (the layout's h1) instead of the band.
  describe("portrait cover on a phone", () => {
    const FUTURE = { startDate: "2099-06-01", endDate: "2099-06-10" };
    const PORTRAIT = { coverImageKey: "k1", coverAspect: 0.75 };

    it("puts a portrait frame beside the trip name and hides the band below sm (Past)", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...PORTRAIT });
      await renderTripHome();
      const frame = screen.getByTestId("portrait-cover");
      const h1 = document.querySelector("[data-trip-header] h1")!;
      expect(h1).toHaveTextContent("Test Trip");
      expect(frame.parentElement).toContainElement(h1 as HTMLElement);
      expect(frame.querySelector("img")).toHaveAttribute("src", "/api/trips/trip-1/cover?v=k1");
      expect(frame.querySelector("img")).toHaveAttribute("data-fit", "contain");
      expect(screen.getByTestId("cover-card").className.split(/\s+/)).toContain("max-sm:hidden");
    });

    it("hides the Planning grid's cover cell below sm instead", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...FUTURE, ...PORTRAIT });
      await renderTripHome();
      expect(screen.getByTestId("portrait-cover")).toBeInTheDocument();
      expect(screen.getByTestId("cover-slot")).toHaveAttribute("data-cover-class", "max-sm:hidden");
    });

    it.each([
      ["a landscape photo", { coverImageKey: "k1", coverAspect: 1.5 }],
      ["a square photo", { coverImageKey: "k1", coverAspect: 1 }],
      ["a photo whose aspect is unknown", { coverImageKey: "k1", coverAspect: null }],
      ["no photo (generated art)", { coverImageKey: null, coverAspect: 0.75 }],
    ])("keeps the band and shows no frame for %s", async (_label, cover) => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...cover });
      await renderTripHome();
      expect(screen.queryByTestId("portrait-cover")).toBeNull();
      expect(screen.getByTestId("cover-card").className.split(/\s+/)).not.toContain("max-sm:hidden");
    });

    it("keeps the Planning cover cell visible for a landscape photo", async () => {
      mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, ...FUTURE, coverImageKey: "k1", coverAspect: 1.5 });
      await renderTripHome();
      expect(screen.getByTestId("cover-slot")).toHaveAttribute("data-cover-class", "");
    });
  });
```

  `app/(app)/trips/[tripId]/layout.test.tsx`: add the same `CoverPhotoImage` stub mock next to the other `vi.mock`s:
```tsx
vi.mock("@/components/trips/cover-photo-image", () => ({
  CoverPhotoImage: (p: { url: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img data-testid="cover-photo" src={p.url} alt={p.alt} />
  ),
}));
```
  and add inside `describe("TripLayout")`:
```tsx
  // Spec 2026-10-05 §I: the portrait frame belongs to Home only.
  it("shows the portrait cover frame beside the name on Home only", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, coverImageKey: "k1", coverAspect: 0.75 });
    mockUsePathname.mockReturnValue("/trips/trip-1/plan");
    await renderLayout();
    expect(screen.queryByTestId("portrait-cover")).toBeNull();
  });
```

  (The Home-path positive case is covered in `page.test.tsx`, where `usePathname` is `/trips/trip-1`.)

- [ ] **Step 2: Run them and watch them fail.**
  `TZ=UTC npx vitest run lib/trip-shell-reads.test.ts components/trip/home/phase-planning.test.tsx "app/(app)/trips/[tripId]/page.test.tsx" "app/(app)/trips/[tripId]/layout.test.tsx"`
  Expected:
  - trip-shell-reads fails on `coverAspect`.
  - phase-planning's new case fails (`max-sm:hidden` missing).
  - page.test's two portrait cases fail with `Unable to find an element by: [data-testid="portrait-cover"]`. The landscape/unknown/no-photo cases and the layout non-Home case already pass. That's fine: they pin the edges.

- [ ] **Step 3: Implement.**

  `lib/trip-shell-reads.ts`: in `TRIP_SHELL_SELECT`, after `coverImageKey: true,` add `coverAspect: true,`.

  `components/trip/home/phase-planning.tsx`:
  - Add `import { cn } from "@/lib/cn";`.
  - In `PhasePlanningProps`, after `cover?: ReactNode;`:
```tsx
  /** Extra classes on the cover's grid item — the page passes "max-sm:hidden"
   * when the phone header shows a portrait cover frame instead (spec
   * 2026-10-05 §I). On the grid item, not the tile: a hidden tile inside a
   * visible cell would still claim a grid gap. */
  coverClassName?: string;
```
  - Destructure `coverClassName,` after `cover,`.
  - The cover item: `<AnimatedItem key="cover" index={1} className={cn("-order-1 lg:order-none", coverClassName)}>`

  `app/(app)/trips/[tripId]/page.tsx`:
  - Imports: `import { showsPortraitCoverFrame } from "@/lib/cover";` and `import { cn } from "@/lib/cn";`
  - Before `const cover = (`:
```tsx
  // Spec 2026-10-05 §I: below sm a portrait photo shows whole in a small
  // frame beside the trip name (the layout's header — PortraitCoverFrame),
  // so the band steps aside there. sm+ and landscape/square/unknown keep it.
  const phonePortrait = showsPortraitCoverFrame(trip);
```
  - `cover`: `<TripCoverCard className={cn("h-56 w-full sm:h-48", phonePortrait && "max-sm:hidden")}>`
  - `coverTile`: leave its classes alone. In the `PhasePlanning` call add `coverClassName={phonePortrait ? "max-sm:hidden" : undefined}` after `cover={coverTile}`.

  `app/(app)/trips/[tripId]/layout.tsx`:
  - Imports: `import { showsPortraitCoverFrame } from "@/lib/cover";`, `import { PortraitCoverFrame } from "@/components/trip/home/portrait-cover-frame";` and `import { TripHomeOnly } from "@/components/trip/trip-home-only";`
  - Wrap the existing name block (`<div className="flex min-w-0 flex-col gap-1"> … </div>`, the one holding the `<h1>`, the dates row and the md–xl switcher pill) in a row, with the frame after it. The inner block keeps its contents and just gains `flex-1`:
```tsx
                {/* Name block + (Home, phones, portrait photo) the cover
                    frame on its right — spec 2026-10-05 §I. sm:hidden on
                    the frame itself, so at sm+ this row is the name block. */}
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {/* …existing h1, dates row and compact switcher pill, unchanged… */}
                  </div>
                  {coverUrl && showsPortraitCoverFrame(trip) ? (
                    <TripHomeOnly>
                      <PortraitCoverFrame url={coverUrl} name={trip.name} />
                    </TripHomeOnly>
                  ) : null}
                </div>
```
    `coverUrl` is already computed above, byte-identical to the page's (and to the service-worker warm list). Reuse it.

- [ ] **Step 4: Run them and watch them pass, then the whole suite.**
  `TZ=UTC npx vitest run lib/trip-shell-reads.test.ts components/trip/home/phase-planning.test.tsx "app/(app)/trips/[tripId]/page.test.tsx" "app/(app)/trips/[tripId]/layout.test.tsx"`. Expected: all pass.
  Then `npm test`. Expected: green. Other files may render the trip layout (`grep -rln "trips/\[tripId\]/layout" --include=*.test.tsx app components`). If one renders it on the Home path with a portrait trip and no `next/image` mock, add the same `CoverPhotoImage` stub there.

- [ ] **Step 5: Verify by screenshots (portrait at 390 and 640, landscape at 390).**
  The dev server and `$SCRATCH/auth.json` come from Task B1 Step 5. If they don't exist, start `npm run dev` in the background and run the audit once with `LAYOUT_AUDIT_ONLY="deep/home/deep/390-light"` and the same `LAYOUT_AUDIT_AUTH_STATE`.
  1. Note whether the audit's deep trip ("EU Christmas 2026", local DB, local disk storage) already has a cover: open `/trips/<slug>/settings` and look for a **Remove** button beside "Cover photo". You'll restore this state at the end.
  2. Write `$SCRATCH/set-cover.cjs`. It generates a W×H PNG and uploads it through the app's own Settings cover field, so `coverAspect` is set by the real upload path:
     ```js
     // Usage: OUT=… AUTH=… node set-cover.cjs "EU Christmas 2026" 600 800
     const { chromium } = require("playwright");
     const BASE = process.env.BASE_URL || "http://localhost:3000";
     const { OUT, AUTH } = process.env;
     const [tripName, w, h] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
     (async () => {
       const browser = await chromium.launch();
       const art = await browser.newPage({ viewport: { width: w, height: h } });
       await art.setContent(`<body style="margin:0;height:100vh;background:linear-gradient(160deg,#ff7a59,#3b82f6)"><div style="font:bold 64px sans-serif;color:#fff;padding:40px">${w}x${h}</div></body>`);
       const file = `${OUT}/cover-${w}x${h}.png`;
       await art.screenshot({ path: file });
       const ctx = await browser.newContext({ storageState: AUTH, viewport: { width: 1280, height: 900 } });
       const page = await ctx.newPage();
       await page.goto(BASE + "/trips", { waitUntil: "networkidle" });
       const href = await page.getByRole("link", { name: new RegExp(tripName) }).first().getAttribute("href");
       await page.goto(BASE + href + "/settings", { waitUntil: "networkidle" });
       await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles(file);
       await page.waitForTimeout(4000);
       await page.waitForLoadState("networkidle");
       console.log("uploaded", file, "to", href);
       await browser.close();
     })();
     ```
  3. Portrait:
     ```
     cd $SCRATCH && NODE_PATH=/usr/local/lib/node_modules OUT=$SCRATCH/shots AUTH=$SCRATCH/auth.json node set-cover.cjs "EU Christmas 2026" 600 800
     cd $SCRATCH && NODE_PATH=/usr/local/lib/node_modules OUT=$SCRATCH/shots AUTH=$SCRATCH/auth.json node shots.cjs '[{"name":"home-portrait-390","path":"trip:EU Christmas 2026","w":390,"h":844},{"name":"home-portrait-640","path":"trip:EU Christmas 2026","w":640,"h":900}]'
     ```
     **Check:**
     - `home-portrait-390` probe: `portraitFrame` is about `{width:96,height:128}`, its `x` is right of the name, and `bandPhotoVisible:false`.
     - Screenshot at 390: the trip name on the left, the whole 600×800 gradient (including its "600x800" label, uncropped) in a small rounded bordered frame on the right, and no full-width band above the Home content. Check that a long trip name wraps beside the frame rather than under it, and that the avatars/bell row still sits below.
     - `home-portrait-640` probe: `portraitFrame:null` and `bandPhotoVisible:true` (sm+ unchanged).
  4. Landscape:
     ```
     cd $SCRATCH && NODE_PATH=/usr/local/lib/node_modules OUT=$SCRATCH/shots AUTH=$SCRATCH/auth.json node set-cover.cjs "EU Christmas 2026" 1200 800
     cd $SCRATCH && NODE_PATH=/usr/local/lib/node_modules OUT=$SCRATCH/shots AUTH=$SCRATCH/auth.json node shots.cjs '[{"name":"home-landscape-390","path":"trip:EU Christmas 2026","w":390,"h":844}]'
     ```
     **Check:** the probe shows `portraitFrame:null` and `bandPhotoVisible:true`, and the screenshot shows the band exactly as before.
  5. Optionally, for the phase sweep: `LAYOUT_AUDIT_ONLY="phase/home/" … npm run audit:layout` into `$SCRATCH/audit-I`. Then confirm `findings.auto.json` has no new overflow findings on the 375 home captures.
  6. Restore the deep trip's cover to what you noted in step 1: Settings → Cover photo → **Remove**, or re-upload the original.

- [ ] **Step 6: Commit.**
  ```
  git add lib/trip-shell-reads.ts lib/trip-shell-reads.test.ts components/trip/home/phase-planning.tsx components/trip/home/phase-planning.test.tsx "app/(app)/trips/[tripId]/page.tsx" "app/(app)/trips/[tripId]/page.test.tsx" "app/(app)/trips/[tripId]/layout.tsx" "app/(app)/trips/[tripId]/layout.test.tsx"
  git commit -F - <<'EOF'
  feat(trip-home): portrait cover sits whole beside the name on phones

  Below sm, a Trip whose cover photo is portrait no longer crops it into
  the full-width band: the band (or the Planning grid's cover cell)
  steps aside and a 96x128 frame beside the trip name shows the whole
  photo. Landscape, square, unknown-aspect and generated covers keep
  the band; sm+ and desktop are unchanged. The frame, like the band,
  does nothing on tap (spec 2026-10-05 §I).

  Resolves-Feedback: cmutd5703000004lenvgzu71m

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  EOF
  ```

---

## §C · A dated return leg is the Trip's deadline (ADR 0068)

Shape of the change: one pure resolver, `resolveTripDeadline`, in a new module `lib/trip-deadline.ts`. It returns the dated return leg's departure, else the Hard end date, else null. It also owns the mode-aware copy. Each reader then switches from `hardEndDate` to the resolved `TripDeadline`:

| Reader | How it gets plan transports + last Stop | Task |
|---|---|---|
| `detectFlags` (`lib/flags.ts`): Rules 11 and 16 | new optional `deadline` input; callers pass one in | C2 |
| `getTripProjection` (`server/actions/stops.ts`) → Summary, Next steps (`next-steps-loader`, `desktop-home-loader` via `buildTripNextSteps`), `nav-counts` | loads the plan's stops (+timezone) and transports itself, in plan scope, so a Fork resolves its own | C3 |
| `computePlanMetrics` (`lib/compare.ts`): Compare / promotion deltas, per Fork | has each plan's own stops and transports | C4 |
| `summarizePlan` / `fitTileModel` / `FitTile` / plan page / add-stop consequence | the plan page already loads plan-scoped `stops` and `transports` | C5 |
| `MakeItFit` (Fit tile and Summary) | given a `TripDeadline` prop | C6 |

`TransportMode` comes from `lib/enums.ts` `TRANSPORT_MODES = ["FLIGHT","TRAIN","BUS","CAR","FERRY","OTHER"]`. `Transport.mode` is a `String` column, so the resolver coerces unknown values to `"OTHER"`. `Transport.depAt` is a `DateTime?` instant. Its calendar date is taken in the **last Stop's timezone**, the same way `lib/flags.ts` uses `tzOf(fromStop)`. If the Stop has no timezone, UTC is used.

---

### Task 7: [C1] `resolveTripDeadline` resolver and mode-aware copy

**Files:**
- Create: `/work/lib/trip-deadline.ts`
- Test: `/work/lib/trip-deadline.test.ts` (create)

**Interfaces:**
- Consumes: `findReturnLeg`, `LegLike` (`lib/home-base.ts`); `orderPlanStops` (`lib/plan-order.ts`); `instantToZonedDateISO` (`lib/tz.ts`); `formatDayLabel` (`lib/dates.ts`); `TRANSPORT_MODES`, `TransportMode` (`lib/enums.ts`)
- Produces:
  - `type TripDeadline = { kind: "return-leg"; date: string; mode: TransportMode } | { kind: "hard-end"; date: string }`
  - `interface DeadlineStop { id: string; sortOrder: number; arriveDate: string | null; departDate: string | null; timezone?: string | null }`
  - `interface DeadlineLeg extends LegLike { mode: string; depAt?: Date | string | null }`
  - `lastPlanStop<S extends DeadlineStop>(stops: readonly S[]): S | null`
  - `resolveTripDeadline(input: { stops: readonly DeadlineStop[]; transports: readonly DeadlineLeg[]; hardEndDate: string | null }): TripDeadline | null`
  - `deadlineLabel(d: TripDeadline): string`: "Flying home Fri 8 Jan" / "Home by Fri 8 Jan"
  - `deadlineNoun(d: TripDeadline): string`: "flight home" / "hard end date"

- [ ] **Step 1: Write the failing test** `/work/lib/trip-deadline.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { resolveTripDeadline, lastPlanStop, deadlineLabel, deadlineNoun, type DeadlineStop, type DeadlineLeg } from "./trip-deadline";

const stop = (over: Partial<DeadlineStop> & Pick<DeadlineStop, "id">): DeadlineStop => ({
  sortOrder: 0, arriveDate: null, departDate: null, timezone: "UTC", ...over,
});
const leg = (over: Partial<DeadlineLeg>): DeadlineLeg => ({
  mode: "FLIGHT", fromStopId: null, toStopId: null, depIsHome: false, arrIsHome: false, depAt: null, ...over,
});

const ROME = stop({ id: "rome", sortOrder: 0, arriveDate: "2027-01-01", departDate: "2027-01-05", timezone: "Europe/Rome" });
const PARIS = stop({ id: "paris", sortOrder: 1, arriveDate: "2027-01-05", departDate: "2027-01-08", timezone: "Europe/Paris" });

describe("resolveTripDeadline (ADR 0068)", () => {
  it("a dated return leg is the deadline, ahead of the Hard end date", () => {
    const transports = [leg({ fromStopId: "paris", arrIsHome: true, depAt: new Date("2027-01-08T09:00:00Z") })];
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports, hardEndDate: "2027-01-20" }))
      .toEqual({ kind: "return-leg", date: "2027-01-08", mode: "FLIGHT" });
  });

  it("reads the departure's date in the last Stop's timezone", () => {
    // 23:30Z on the 8th is 00:30 on the 9th in Paris.
    const transports = [leg({ fromStopId: "paris", depAt: "2027-01-08T23:30:00Z", mode: "TRAIN" })];
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports, hardEndDate: null }))
      .toEqual({ kind: "return-leg", date: "2027-01-09", mode: "TRAIN" });
  });

  it("a return leg with no date falls back to the Hard end date", () => {
    const transports = [leg({ fromStopId: "paris", arrIsHome: true, depAt: null })];
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports, hardEndDate: "2027-01-20" }))
      .toEqual({ kind: "hard-end", date: "2027-01-20" });
  });

  it("no return leg (deleted) → the stored Hard end date resumes", () => {
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports: [], hardEndDate: "2027-01-20" }))
      .toEqual({ kind: "hard-end", date: "2027-01-20" });
  });

  it("no return leg and no Hard end date → null", () => {
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports: [], hardEndDate: null })).toBeNull();
    expect(resolveTripDeadline({ stops: [], transports: [], hardEndDate: null })).toBeNull();
  });

  it("a leg between Stops, or one leaving an earlier Stop, is not the return leg", () => {
    const transports = [
      leg({ fromStopId: "rome", toStopId: "paris", depAt: "2027-01-05T08:00:00Z" }),
      leg({ fromStopId: "rome", depAt: "2027-01-04T08:00:00Z" }),
    ];
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports, hardEndDate: "2027-01-20" }))
      .toEqual({ kind: "hard-end", date: "2027-01-20" });
  });

  it("multi-leg journey home: the leg leaving the last Stop sets the deadline, not the onward leg that lands home", () => {
    const transports = [
      leg({ fromStopId: "paris", toStopId: null, arrIsHome: false, mode: "TRAIN", depAt: "2027-01-08T07:00:00Z" }),
      leg({ fromStopId: null, toStopId: null, depIsHome: false, arrIsHome: true, mode: "FLIGHT", depAt: "2027-01-09T10:00:00Z" }),
    ];
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports, hardEndDate: null }))
      .toEqual({ kind: "return-leg", date: "2027-01-08", mode: "TRAIN" });
  });

  it("the last Stop is the last in plan order (ADR 0038), not the highest sortOrder", () => {
    // Paris has the lower sortOrder but the later dates, so it is last in plan order.
    const paris = { ...PARIS, sortOrder: 0 };
    const rome = { ...ROME, sortOrder: 1 };
    expect(lastPlanStop([paris, rome])?.id).toBe("paris");
    const transports = [leg({ fromStopId: "paris", depAt: "2027-01-08T09:00:00Z" })];
    expect(resolveTripDeadline({ stops: [paris, rome], transports, hardEndDate: null })?.kind).toBe("return-leg");
  });

  it("an unknown mode string reads as OTHER; an unparseable depAt falls back", () => {
    expect(resolveTripDeadline({ stops: [PARIS], transports: [leg({ fromStopId: "paris", mode: "ROCKET", depAt: "2027-01-08T09:00:00Z" })], hardEndDate: null }))
      .toEqual({ kind: "return-leg", date: "2027-01-08", mode: "OTHER" });
    expect(resolveTripDeadline({ stops: [PARIS], transports: [leg({ fromStopId: "paris", depAt: "not a date" })], hardEndDate: "2027-01-20" }))
      .toEqual({ kind: "hard-end", date: "2027-01-20" });
  });

  it("each plan (Fork) resolves from its own legs", () => {
    const real = [leg({ fromStopId: "paris", depAt: "2027-01-08T09:00:00Z" })];
    const fork: DeadlineLeg[] = [];
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports: real, hardEndDate: "2027-01-20" })?.date).toBe("2027-01-08");
    expect(resolveTripDeadline({ stops: [ROME, PARIS], transports: fork, hardEndDate: "2027-01-20" })?.date).toBe("2027-01-20");
  });
});

describe("deadline copy", () => {
  it("labels the return leg by mode, the Hard end date as Home by", () => {
    expect(deadlineLabel({ kind: "return-leg", date: "2027-01-08", mode: "FLIGHT" })).toBe("Flying home Fri 8 Jan");
    expect(deadlineLabel({ kind: "return-leg", date: "2027-01-08", mode: "CAR" })).toBe("Driving home Fri 8 Jan");
    expect(deadlineLabel({ kind: "return-leg", date: "2027-01-08", mode: "TRAIN" })).toBe("Train home Fri 8 Jan");
    expect(deadlineLabel({ kind: "return-leg", date: "2027-01-08", mode: "BUS" })).toBe("Bus home Fri 8 Jan");
    expect(deadlineLabel({ kind: "return-leg", date: "2027-01-08", mode: "FERRY" })).toBe("Ferry home Fri 8 Jan");
    expect(deadlineLabel({ kind: "return-leg", date: "2027-01-08", mode: "OTHER" })).toBe("Heading home Fri 8 Jan");
    expect(deadlineLabel({ kind: "hard-end", date: "2027-01-08" })).toBe("Home by Fri 8 Jan");
  });
  it("names what the plan runs past", () => {
    expect(deadlineNoun({ kind: "return-leg", date: "2027-01-08", mode: "FLIGHT" })).toBe("flight home");
    expect(deadlineNoun({ kind: "return-leg", date: "2027-01-08", mode: "CAR" })).toBe("drive home");
    expect(deadlineNoun({ kind: "return-leg", date: "2027-01-08", mode: "OTHER" })).toBe("trip home");
    expect(deadlineNoun({ kind: "hard-end", date: "2027-01-08" })).toBe("hard end date");
  });
});
```

- [ ] **Step 2: Run it.** `cd /work && TZ=UTC npx vitest run lib/trip-deadline.test.ts`. Expected: FAIL with `Failed to resolve import "./trip-deadline"`.

- [ ] **Step 3: Implement** `/work/lib/trip-deadline.ts`

```ts
/**
 * The Trip's deadline (ADR 0068, amending ADR 0013): the departure of a dated
 * return leg, else the Hard end date, else none. Every "when am I home"
 * reader goes through this — the Fit tile, Summary, Plan overview, Flags,
 * Make it fit and Compare — so only one deadline is ever shown. Pure.
 */
import { findReturnLeg, type LegLike } from "@/lib/home-base";
import { orderPlanStops } from "@/lib/plan-order";
import { instantToZonedDateISO } from "@/lib/tz";
import { formatDayLabel } from "@/lib/dates";
import { TRANSPORT_MODES, type TransportMode } from "@/lib/enums";

export type TripDeadline =
  | { kind: "return-leg"; date: string; mode: TransportMode }
  | { kind: "hard-end"; date: string };

export interface DeadlineStop {
  id: string;
  sortOrder: number;
  arriveDate: string | null;
  departDate: string | null;
  timezone?: string | null;
}

export interface DeadlineLeg extends LegLike {
  mode: string;
  depAt?: Date | string | null;
}

/** The plan's last Stop in canonical plan order (ADR 0038) — the one the return leg departs. */
export function lastPlanStop<S extends DeadlineStop>(stops: readonly S[]): S | null {
  if (stops.length === 0) return null;
  const ordered = orderPlanStops([...stops].sort((a, b) => a.sortOrder - b.sortOrder));
  return ordered[ordered.length - 1];
}

function asMode(mode: string): TransportMode {
  return (TRANSPORT_MODES as readonly string[]).includes(mode) ? (mode as TransportMode) : "OTHER";
}

export function resolveTripDeadline(input: {
  stops: readonly DeadlineStop[];
  transports: readonly DeadlineLeg[];
  hardEndDate: string | null;
}): TripDeadline | null {
  const last = lastPlanStop(input.stops);
  // For a multi-leg journey home this is the leg LEAVING the last Stop — the
  // moment you have to go — never the onward leg that lands home.
  const leg = findReturnLeg(input.transports, last?.id ?? null);
  if (leg?.depAt) {
    const instant = leg.depAt instanceof Date ? leg.depAt : new Date(leg.depAt);
    if (!Number.isNaN(instant.getTime())) {
      return { kind: "return-leg", date: instantToZonedDateISO(instant, last?.timezone || "UTC"), mode: asMode(leg.mode) };
    }
  }
  return input.hardEndDate ? { kind: "hard-end", date: input.hardEndDate } : null;
}

const HOME_LEAD: Record<TransportMode, string> = {
  FLIGHT: "Flying", TRAIN: "Train", BUS: "Bus", CAR: "Driving", FERRY: "Ferry", OTHER: "Heading",
};
const HOME_NOUN: Record<TransportMode, string> = {
  FLIGHT: "flight home", TRAIN: "train home", BUS: "bus home", CAR: "drive home", FERRY: "ferry home", OTHER: "trip home",
};

/** The Fit tile's reference line: "Flying home Fri 8 Jan" or "Home by Fri 8 Jan". */
export function deadlineLabel(d: TripDeadline): string {
  return d.kind === "return-leg"
    ? `${HOME_LEAD[d.mode]} home ${formatDayLabel(d.date)}`
    : `Home by ${formatDayLabel(d.date)}`;
}

/** What the plan runs past, for Flags and Make it fit: "flight home", or "hard end date". */
export function deadlineNoun(d: TripDeadline): string {
  return d.kind === "return-leg" ? HOME_NOUN[d.mode] : "hard end date";
}
```

- [ ] **Step 4: Run it.** `cd /work && TZ=UTC npx vitest run lib/trip-deadline.test.ts`. Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
cd /work && git add lib/trip-deadline.ts lib/trip-deadline.test.ts && git commit -m "$(cat <<'EOF'
feat(deadline): resolveTripDeadline — dated return leg ahead of hard end (ADR 0068)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: [C2] Flags check the projected end against the deadline

**Files:**
- Modify: `/work/lib/flags.ts`: imports (lines 10, 15); `DetectFlagsInput` (lines 92–95); `flagHardEndDate` (lines 668–700); `detectFlags` destructure and body (lines 862–918)
- Test: `/work/lib/flags.test.ts`: add to the `flagHardEndDate` describe (around line 805) and a new describe after `flagReturnLegAfterHardEnd` (around line 958)

**Interfaces:**
- Consumes: `TripDeadline`, `deadlineNoun` (C1); `formatLongDate` (`lib/dates.ts`)
- Produces:
  - `flagHardEndDate(projectedEnd: string | null | undefined, deadline: TripDeadline | string | null | undefined): Flag[]`. A bare string still means a Hard end date, so existing callers and tests are unchanged.
  - `DetectFlagsInput.deadline?: TripDeadline | null`. When `undefined`, it is derived from `hardEndDate` as `{ kind: "hard-end" }` (legacy callers). When provided, it wins.
  - Flag ids are unchanged (`hard-end-over`, `hard-end-approaching`), so the Summary's `isOverHardEnd` keeps working.
  - `return-after-hard-end` stays silent while `deadline.kind === "return-leg"`.

- [ ] **Step 1: Write the failing tests.** In `/work/lib/flags.test.ts`, add inside `describe("flagHardEndDate", …)`:

```ts
  it("words the warning against the trip home when the return leg is the deadline (ADR 0068)", () => {
    const flags = flagHardEndDate("2026-07-11", { kind: "return-leg", date: "2026-07-09", mode: "FLIGHT" });
    expect(flags).toHaveLength(1);
    expect(flags[0].id).toBe("hard-end-over");
    expect(flags[0].message).toBe("Your plan runs 2 nights past your flight home (Thu 9 Jul 2026).");
  });

  it("approaching wording is mode-aware too", () => {
    expect(flagHardEndDate("2026-07-09", { kind: "return-leg", date: "2026-07-09", mode: "CAR" })[0].message)
      .toBe("Your plan ends right on your drive home (Thu 9 Jul 2026).");
    expect(flagHardEndDate("2026-07-08", { kind: "return-leg", date: "2026-07-09", mode: "TRAIN" })[0].message)
      .toBe("Your plan ends within 1 night of your train home (Thu 9 Jul 2026).");
  });

  it("a hard-end deadline object reads exactly like the bare date", () => {
    expect(flagHardEndDate("2026-07-17", { kind: "hard-end", date: "2026-07-15" })).toEqual(flagHardEndDate("2026-07-17", "2026-07-15"));
  });
```

Then add a new describe after `describe("flagReturnLegAfterHardEnd", …)`:

```ts
describe("detectFlags — the Trip's deadline (ADR 0068)", () => {
  const stops = [{ ...LONDON, sortOrder: 0 }, { ...PARIS, sortOrder: 1 }];
  // Departs Paris on the 9th; lands after the stored hard end date (the 20th).
  const ret = makeTransport({
    id: "ret", fromStopId: "paris", toStopId: null, arrIsHome: true,
    depAt: new Date("2026-07-09T10:00:00Z"), arrAt: new Date("2026-07-21T06:00:00Z"),
  });
  const base = {
    stops, transports: [ret], accommodations: [], items: [],
    tripStart: "2026-07-01", tripEnd: "2026-07-10",
    projectedEnd: "2026-07-10", hardEndDate: "2026-07-20",
  };
  const ids = (flags: { id: string }[]) => flags.map((f) => f.id);

  it("checks the projected end against the return leg and silences return-after-hard-end", () => {
    const flags = detectFlags({ ...base, deadline: { kind: "return-leg", date: "2026-07-09", mode: "FLIGHT" } });
    expect(ids(flags)).toContain("hard-end-over");
    expect(flags.find((f) => f.id === "hard-end-over")!.message).toContain("past your flight home");
    expect(ids(flags)).not.toContain("return-after-hard-end");
  });

  it("without a deadline input it falls back to the hard end date (legacy callers)", () => {
    const flags = detectFlags(base);
    expect(ids(flags)).not.toContain("hard-end-over");
    expect(ids(flags)).not.toContain("hard-end-approaching");
    expect(ids(flags)).toContain("return-after-hard-end");
  });

  it("a hard-end deadline keeps return-after-hard-end live", () => {
    const flags = detectFlags({ ...base, deadline: { kind: "hard-end", date: "2026-07-20" } });
    expect(ids(flags)).toContain("return-after-hard-end");
  });

  it("an explicit null deadline means no deadline flags at all", () => {
    const flags = detectFlags({ ...base, deadline: null });
    expect(ids(flags)).not.toContain("hard-end-over");
    expect(ids(flags)).not.toContain("hard-end-approaching");
  });
});
```

- [ ] **Step 2: Run them.** `cd /work && TZ=UTC npx vitest run lib/flags.test.ts`. Expected: FAIL. The object-deadline cases fail because `daysBetween` receives an object (NaN gives `[]`, or a message mismatch), and the first `detectFlags` case fails on `toContain("hard-end-over")`.

- [ ] **Step 3: Implement** in `/work/lib/flags.ts`.

Imports. Line 10 becomes the first line below, and add the second line after line 15:
```ts
import { nightsBetween, isDateWithin, addDays, daysBetween, formatLongDate } from "@/lib/dates";
import { deadlineNoun, type TripDeadline } from "@/lib/trip-deadline";
```

`DetectFlagsInput`: below `hardEndDate?: string | null;` (line 95) add:
```ts
  /**
   * The Trip's deadline (ADR 0068) from resolveTripDeadline — a dated return
   * leg's departure, else the Hard end date. Omitted (undefined): derived from
   * `hardEndDate`. Provided (even null): it wins.
   */
  deadline?: TripDeadline | null;
```

Replace `flagHardEndDate` (lines 668–700, header comment included) with:
```ts
// ---------------------------------------------------------------------------
// Rule 11: The Trip's deadline (warning when over, info when approaching)
//
// Compares the projected end against the Trip's deadline — a dated return
// leg's departure, else the traveller-set Hard end date (ADR 0013, 0068).
// A bare string is a Hard end date. Advisory only.
// ---------------------------------------------------------------------------

export function flagHardEndDate(
  projectedEnd: string | null | undefined,
  deadline: TripDeadline | string | null | undefined,
): Flag[] {
  const d: TripDeadline | null =
    typeof deadline === "string" ? { kind: "hard-end", date: deadline } : (deadline ?? null);
  if (!projectedEnd || !d) return [];
  // Hard end keeps its historic wording; the return leg reads as the trip home.
  const ref = d.kind === "hard-end" ? `hard end date (${d.date})` : `${deadlineNoun(d)} (${formatLongDate(d.date)})`;
  const slack = daysBetween(projectedEnd, d.date); // deadline - projectedEnd, in nights
  if (slack < 0) {
    const over = -slack;
    return [
      {
        id: "hard-end-over",
        severity: "warning" as const,
        message: `Your plan runs ${over} night${over === 1 ? "" : "s"} past your ${ref}.`,
        targetType: "TRIP" as const,
      },
    ];
  }
  if (slack <= HARD_END_APPROACHING_NIGHTS) {
    const message =
      slack === 0
        ? `Your plan ends right on your ${ref}.`
        : `Your plan ends within ${slack} night${slack === 1 ? "" : "s"} of your ${ref}.`;
    return [{ id: "hard-end-approaching", severity: "info" as const, message, targetType: "TRIP" as const }];
  }
  return [];
}
```

In `detectFlags`, add `deadline,` to the destructure after `hardEndDate,`. Then directly below the `lastStopId` const add:
```ts
  const effectiveDeadline: TripDeadline | null =
    deadline !== undefined ? deadline : hardEndDate ? { kind: "hard-end", date: hardEndDate } : null;
```
Replace `...flagHardEndDate(projectedEnd, hardEndDate),` with `...flagHardEndDate(projectedEnd, effectiveDeadline),` and replace the last rule line with:
```ts
    // ADR 0068: while the return leg IS the deadline this would compare the leg with itself.
    ...(effectiveDeadline?.kind === "return-leg" ? [] : flagReturnLegAfterHardEnd(transports, hardEndDate, lastStopId)),
```
In the doc comment list above `detectFlags`, change `11. Hard end date (warning/info)` to `11. Trip deadline — return leg or hard end date (warning/info)`.

- [ ] **Step 4: Run them.** `cd /work && TZ=UTC npx vitest run lib/flags.test.ts`. Expected: PASS, with all existing `flagHardEndDate` and `flagReturnLegAfterHardEnd` cases unchanged.

- [ ] **Step 5: Commit**

```bash
cd /work && git add lib/flags.ts lib/flags.test.ts && git commit -m "$(cat <<'EOF'
feat(flags): deadline flag reads the return leg, mode-aware copy (ADR 0068)

return-after-hard-end stays silent while the return leg is the deadline.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: [C3] `getTripProjection` resolves the deadline; Summary, Next steps and nav counts pass it to Flags

**Files:**
- Modify: `/work/server/actions/stops.ts`: imports (add after line 10); `getTripProjection` (lines 1546–1568)
- Modify: `/work/app/(app)/trips/[tripId]/summary/page.tsx`: the `detectFlags({...})` call (line 356, after `hardEndDate: projection.hardEndDate,`)
- Modify: `/work/lib/nav-counts.ts`: line 136 (after `hardEndDate: projection.hardEndDate,`)
- Modify: `/work/lib/next-steps-builder.ts`: `BuildTripNextStepsInput` (line 42) and the `detectFlags` call (line 63)
- Modify: `/work/lib/next-steps-loader.ts`: line 122
- Modify: `/work/lib/desktop-home-loader.ts`: line 299
- Test: `/work/server/actions/stops.test.ts` (`getTripProjection` describe, lines 1978–2028, plus the db mock); `/work/lib/nav-counts.test.ts`

**Interfaces:**
- Consumes: `resolveTripDeadline`, `TripDeadline` (C1); `DetectFlagsInput.deadline` (C2)
- Produces: `getTripProjection(tripId, forkId?) : Promise<{ projectedEnd: string | null; hardEndDate: string | null; deadline: TripDeadline | null }>`. Both stops and transports are read in `planScope(forkId)`, so a Fork resolves its own deadline. `BuildTripNextStepsInput.deadline?: TripDeadline | null`.

- [ ] **Step 1: Write the failing tests.**

In `/work/server/actions/stops.test.ts`:
1. In the `vi.hoisted` factory, add `const transportFindManyMock = vi.fn().mockResolvedValue([]);` after `const noteCountMock = …;`. Add `transportFindManyMock,` after `noteCountMock,` in both the factory's `return { … }` object and the destructuring list at the top (line 45).
2. In the `vi.mock("@/lib/db", …)` `db` object, add `transport: { findMany: transportFindManyMock },` after the `stop: { … },` entry.
3. Change the assertion in `"returns nulls without throwing when the trip is not found"` to `expect(r).toEqual({ projectedEnd: null, hardEndDate: null, deadline: null });`.
4. Add inside `describe("getTripProjection", …)`:

```ts
  it("resolves the deadline: a dated return leg from the last Stop beats the hard end date (ADR 0068)", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", hardEndDate: "2026-07-20" });
    stopFindManyMock.mockResolvedValue([
      { id: "a", arriveDate: null, departDate: null, nights: 3, pinned: false, sortOrder: 0, timezone: null },
      { id: "b", arriveDate: null, departDate: null, nights: 4, pinned: false, sortOrder: 1, timezone: "Europe/Rome" },
    ]);
    transportFindManyMock.mockResolvedValueOnce([
      { mode: "FLIGHT", fromStopId: "b", toStopId: null, depAt: new Date("2026-07-08T09:00:00Z"), arrIsHome: true },
    ]);
    const r = await getTripProjection("trip-1");
    expect(r.hardEndDate).toBe("2026-07-20");
    expect(r.deadline).toEqual({ kind: "return-leg", date: "2026-07-08", mode: "FLIGHT" });
  });

  it("falls back to the hard end date when the return leg has no date", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01", hardEndDate: "2026-07-20" });
    stopFindManyMock.mockResolvedValue([{ id: "b", arriveDate: null, departDate: null, nights: 4, pinned: false, sortOrder: 0, timezone: null }]);
    transportFindManyMock.mockResolvedValueOnce([{ mode: "FLIGHT", fromStopId: "b", toStopId: null, depAt: null, arrIsHome: true }]);
    expect((await getTripProjection("trip-1")).deadline).toEqual({ kind: "hard-end", date: "2026-07-20" });
  });

  it("reads a Fork's own transports", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: null, hardEndDate: null });
    stopFindManyMock.mockResolvedValue([]);
    await getTripProjection("trip-1", "fork-9");
    expect(transportFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }),
    );
  });
```

In `/work/lib/nav-counts.test.ts`, add inside `describe("loadNavCounts", …)`:

```ts
  it("forwards the projection's deadline to Flags: a return leg before the projected end is a Flag even with a roomy hard end (ADR 0068)", async () => {
    const setup = () => {
      tripFindUniqueMock.mockResolvedValue({
        startDate: "2026-12-04", endDate: "2026-12-07", roundTrip: false,
        homeName: null, homeLat: null, homeLng: null, homeCountryCode: null,
        drivingWindingFactor: null, drivingAvgSpeedKph: null,
      });
      stopFindManyMock
        .mockResolvedValueOnce([{ ...DATED_STOP, departDate: "2026-12-07", nights: 3 }])
        .mockResolvedValueOnce([]);
      accommodationFindManyMock.mockResolvedValue([
        { id: "a1", stopId: "s1", name: "Hotel", checkIn: "2026-12-04", checkOut: "2026-12-07" },
      ]);
      itemFindManyMock.mockResolvedValue([
        { id: "i1", stopId: "s1", date: "2026-12-05" },
        { id: "i2", stopId: "s1", date: "2026-12-06" },
      ]);
    };
    setup();
    getTripProjectionMock.mockResolvedValue({ projectedEnd: "2026-12-07", hardEndDate: "2026-12-20", deadline: { kind: "hard-end", date: "2026-12-20" } });
    expect((await loadNavCounts("t1")).flags).toBe(0);

    setup();
    getTripProjectionMock.mockResolvedValue({
      projectedEnd: "2026-12-07", hardEndDate: "2026-12-20",
      deadline: { kind: "return-leg", date: "2026-12-06", mode: "FLIGHT" },
    });
    expect((await loadNavCounts("t1")).flags).toBe(1);
  });
```

- [ ] **Step 2: Run them.** `cd /work && TZ=UTC npx vitest run server/actions/stops.test.ts lib/nav-counts.test.ts`. Expected: FAIL. `r.deadline` is `undefined`, `transportFindManyMock` is never called, and nav-counts reports `flags` 0 where 1 is expected (the deadline is not forwarded).

- [ ] **Step 3: Implement.**

`/work/server/actions/stops.ts`: add `import { resolveTripDeadline, type TripDeadline } from "@/lib/trip-deadline";` after line 10, then replace `getTripProjection` (lines 1546–1568) with:
```ts
/**
 * Compute a plan's projected end, its hard end date and its deadline (a dated
 * return leg's departure, else the hard end date — ADR 0068) in one round
 * trip, for the Flag detector on the Summary, Home and nav counts. Stops and
 * transports are read in plan scope, so a Fork resolves its own deadline.
 */
export async function getTripProjection(
  tripId: string,
  forkId?: PlanId,
): Promise<{ projectedEnd: string | null; hardEndDate: string | null; deadline: TripDeadline | null }> {
  await requireTripAccess(tripId);
  const [trip, stops, transports] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true, hardEndDate: true } }),
    db.stop.findMany({
      where: { tripId, ...planScope(forkId) },
      orderBy: { sortOrder: "asc" },
      select: { id: true, arriveDate: true, departDate: true, nights: true, pinned: true, sortOrder: true, timezone: true },
    }),
    db.transport.findMany({
      where: { tripId, ...planScope(forkId) },
      select: { mode: true, fromStopId: true, toStopId: true, depAt: true, arrIsHome: true },
    }),
  ]);
  const hardEndDate = trip?.hardEndDate ?? null;
  return {
    projectedEnd: computeProjectedEnd(stops, trip?.startDate ?? null),
    hardEndDate,
    deadline: resolveTripDeadline({ stops, transports, hardEndDate }),
  };
}
```

`/work/app/(app)/trips/[tripId]/summary/page.tsx`, `/work/lib/nav-counts.ts`, `/work/lib/next-steps-loader.ts`, `/work/lib/desktop-home-loader.ts`: after each `hardEndDate: projection.hardEndDate,` line add
```ts
    deadline: projection.deadline,
```

`/work/lib/next-steps-builder.ts`: add `import type { TripDeadline } from "@/lib/trip-deadline";` with the imports. After `hardEndDate: string | null;` in `BuildTripNextStepsInput` add
```ts
  /** The Trip's deadline from getTripProjection (ADR 0068); omitted → derived from hardEndDate. */
  deadline?: TripDeadline | null;
```
and after `hardEndDate: input.hardEndDate,` in the `detectFlags` call add `deadline: input.deadline,`.

- [ ] **Step 4: Run them.** `cd /work && TZ=UTC npx vitest run server/actions/stops.test.ts lib/nav-counts.test.ts lib/next-steps.test.ts components/trip/home "app/(app)/trips/[tripId]/summary"`. Expected: PASS. Older mocks that return no `deadline` key get `undefined`, so `detectFlags` derives the deadline from `hardEndDate`.

- [ ] **Step 5: Commit**

```bash
cd /work && git add server/actions/stops.ts server/actions/stops.test.ts lib/nav-counts.ts lib/nav-counts.test.ts lib/next-steps-builder.ts lib/next-steps-loader.ts lib/desktop-home-loader.ts "app/(app)/trips/[tripId]/summary/page.tsx" && git commit -m "$(cat <<'EOF'
feat(deadline): getTripProjection resolves the deadline; Summary/Next steps/nav Flags use it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: [C4] Compare: each plan's hard-end state reads its own deadline

**Files:**
- Modify: `/work/lib/compare.ts`: imports (after line 29); `CompareTransport` (lines 48–55); `hardEndState` block (lines 184–196); `detectFlags` call (line 334)
- Modify: `/work/server/actions/forks.ts`: transport selects (lines 534–545, 665, 670) and the `mapTransport` param type (line 762)
- Test: `/work/lib/compare.test.ts`: `makeTransport` (lines 52–67) and the `hardEndState` describe (line 237)

**Interfaces:**
- Consumes: `resolveTripDeadline` (C1); `DetectFlagsInput.deadline` (C2)
- Produces: `CompareTransport.arrIsHome?: boolean | null`. `PlanMetrics.hardEndState` is now measured against the plan's deadline. The shape is unchanged.

- [ ] **Step 1: Write the failing test.** In `/work/lib/compare.test.ts`, extend `makeTransport`'s overrides type with `arrIsHome: boolean | null;` and its result with `arrIsHome: overrides.arrIsHome ?? false,`. Then add inside `describe("hardEndState", …)`:

```ts
  it("a dated return leg is the deadline, ahead of the hard end date (ADR 0068)", () => {
    // 4 rough nights from 07-01 → projected end 07-05. Hard end 07-20 alone would be "ok".
    const stops = [makeStop("a", { nights: 4, sortOrder: 0 })];
    const trip = makeTrip({ startDate: "2026-07-01", hardEndDate: "2026-07-20" });
    const withLeg: PlanMetricsInput = {
      ...emptyInput(), trip, stops,
      transports: [makeTransport("ret", { fromStopId: "a", toStopId: null, arrIsHome: true, depAt: "2026-07-03T10:00:00Z" })],
    };
    const m = computePlanMetrics(withLeg);
    expect(m.hardEndState).toBe("over");
    expect(m.flagCounts.warning).toBeGreaterThanOrEqual(1);
  });

  it("each plan resolves its own: a Fork without the leg is measured against the hard end date", () => {
    const stops = [makeStop("a", { nights: 4, sortOrder: 0 })];
    const trip = makeTrip({ startDate: "2026-07-01", hardEndDate: "2026-07-20" });
    expect(computePlanMetrics({ ...emptyInput(), trip, stops }).hardEndState).toBe("ok");
  });

  it("a return leg with no date leaves the hard end date in charge", () => {
    const stops = [makeStop("a", { nights: 4, sortOrder: 0 })];
    const trip = makeTrip({ startDate: "2026-07-01", hardEndDate: "2026-07-20" });
    const input: PlanMetricsInput = {
      ...emptyInput(), trip, stops,
      transports: [makeTransport("ret", { fromStopId: "a", toStopId: null, depAt: null })],
    };
    expect(computePlanMetrics(input).hardEndState).toBe("ok");
  });
```

- [ ] **Step 2: Run it.** `cd /work && TZ=UTC npx vitest run lib/compare.test.ts`. Expected: FAIL on the first new case, with `expected "ok" to be "over"`.

- [ ] **Step 3: Implement.** In `/work/lib/compare.ts`:
- Add `import { resolveTripDeadline } from "@/lib/trip-deadline";` after line 29.
- In `CompareTransport`, add `arrIsHome?: boolean | null;` after `arrAt: string | null;`.
- Replace the `hardEndState` block (lines 184–196) with:
```ts
  // ---------------------------------------------------------------------------
  // hardEndState — against this plan's own deadline (ADR 0068): a dated return
  // leg's departure, else the trip's hard end date.
  // ---------------------------------------------------------------------------

  const deadline = resolveTripDeadline({ stops, transports, hardEndDate: trip.hardEndDate });
  let hardEndState: PlanMetrics["hardEndState"] = "none";
  if (deadline && projectedEnd) {
    const slack = daysBetween(projectedEnd, deadline.date); // deadline - projectedEnd, positive = slack
    if (slack < 0) {
      hardEndState = "over";
    } else if (slack <= HARD_END_APPROACHING_NIGHTS) {
      hardEndState = "approaching";
    } else {
      hardEndState = "ok";
    }
  }
```
- In the `detectFlags({...})` call, add `deadline,` after `hardEndDate: trip.hardEndDate,`. In the `flagTransports` mapping (lines 275–282, which lists fields explicitly), add `arrIsHome: t.arrIsHome ?? false,` after `arrAt: t.arrAt,`.

In `/work/server/actions/forks.ts`: add `arrIsHome: true` to the transport `select` in `getComparison` (line ~534) and to both selects at lines 665 and 670. Extend the `mapTransport` parameter type at line 762 with `arrIsHome?: boolean | null`.

- [ ] **Step 4: Run it.** `cd /work && TZ=UTC npx vitest run lib/compare.test.ts server/actions/forks.test.ts components/trip/compare-table.test.tsx`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /work && git add lib/compare.ts lib/compare.test.ts server/actions/forks.ts && git commit -m "$(cat <<'EOF'
feat(compare): each plan's hard-end state reads its own deadline (ADR 0068)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: [C5] Plan overview: `summarizePlan`, the Fit tile and the add-stop line read the deadline

**Files:**
- Modify: `/work/lib/plan-overview.ts` (whole file: input, output and state computation)
- Modify: `/work/lib/plan/plan-model.ts`: `fitTileModel` line 278 (`of`)
- Modify: `/work/components/plan/fit-tile.tsx`: imports (lines 6–9); the header row (lines 99–106); the `MakeItFit` line 138
- Modify: `/work/app/(app)/trips/[tripId]/plan/page.tsx`: imports (line 14); transport `select` (lines 154–171); `summarizePlan` call (lines 477–488); `ItineraryManager hardEndDate` (line 546)
- Modify: `/work/components/trip/itinerary-manager.tsx`: doc comment on line 169 only
- Test (fixture updates plus new cases): `/work/lib/plan-overview.test.ts`, `/work/lib/plan/plan-model.test.ts`, `/work/components/plan/fit-tile.test.tsx`, `/work/components/plan/motion.test.tsx`, `/work/components/plan/plan-header-actions.test.tsx`, `/work/app/(app)/trips/[tripId]/plan/page.test.tsx`

**Interfaces:**
- Consumes: `resolveTripDeadline`, `deadlineLabel`, `TripDeadline` (C1)
- Produces:
  - `PlanSummaryInput = { stops: ProjectionStop[]; startDate: string | null; deadline: TripDeadline | null }`, which replaces `hardEndDate`
  - `PlanSummary.deadline: TripDeadline | null`, which replaces `PlanSummary.hardEndDate`. `HardEndState` values are unchanged; "unset" means no deadline.
  - `FitTile` with a return-leg deadline shows a plain `<span data-deadline="return-leg">Flying home Fri 8 Jan</span>` and no Home-by control. A hard-end deadline renders `HardEndDateControl` with label `"Home by …"` as before.
  - `addStopConsequence` is unchanged; the plan page passes it the deadline's date through `ItineraryManager`'s existing `hardEndDate` prop.

- [ ] **Step 1: Update fixtures and write the failing tests.**

Fixture edits (mechanical; `hardEndDate` in `addStopConsequence` inputs stays as it is):
- `/work/lib/plan-overview.test.ts`: in each `summarizePlan({...})` call, `hardEndDate: null` → `deadline: null`, and `hardEndDate: "X"` → `deadline: { kind: "hard-end", date: "X" }`. Run `sed -i -E 's/hardEndDate: null/deadline: null/g; s/hardEndDate: "([0-9-]+)"/deadline: { kind: "hard-end", date: "\1" }/g' lib/plan-overview.test.ts`.
- `/work/components/plan/plan-header-actions.test.tsx` line 147: `hardEndDate: null,` → `deadline: null,`.
- `/work/lib/plan/plan-model.test.ts` line 188, the `summary` fixture: `hardEndDate: "2027-01-08",` → `deadline: { kind: "hard-end", date: "2027-01-08" },`. Lines 209 and 239: `hardEndDate: null` → `deadline: null`. Lines 130, 142, 143, 158 and 229 are `addStopConsequence` inputs and stay unchanged.
- `/work/components/plan/fit-tile.test.tsx` line 12 and `/work/components/plan/motion.test.tsx` line 214: `hardEndDate: "2027-01-08",` → `deadline: { kind: "hard-end", date: "2027-01-08" },`. `fit-tile.test.tsx` line 46: `hardEndDate: null` → `deadline: null`.

New cases. In `/work/lib/plan-overview.test.ts`:
```ts
  it("measures slack against a return-leg deadline (ADR 0068)", () => {
    const s = summarizePlan({
      stops: [stop({ id: "a", nights: 8, sortOrder: 0 })], // projected end 07-09
      startDate: "2026-07-01",
      deadline: { kind: "return-leg", date: "2026-07-08", mode: "FLIGHT" },
    });
    expect(s.hardEndState).toBe("over");
    expect(s.hardEndSlackNights).toBe(-1);
    expect(s.deadline).toEqual({ kind: "return-leg", date: "2026-07-08", mode: "FLIGHT" });
  });
```
In `/work/lib/plan/plan-model.test.ts`, inside `describe("fitTileModel (PLAN.md §6.2)", …)`:
```ts
  it("the window runs to a return-leg deadline", () => {
    const m = fitTileModel(summary({ deadline: { kind: "return-leg", date: "2027-01-06", mode: "FLIGHT" }, hardEndState: "approaching", hardEndSlackNights: 0 }));
    expect(m.legendRight).toBe("of 33");
    expect(m).toMatchObject({ tone: "sun", words: "right on it" });
  });
```
In `/work/components/plan/fit-tile.test.tsx`, inside `describe("FitTile (PLAN.md §6.2)", …)`:
```ts
  it("return leg is the deadline: '{mode} home {date}' replaces the Home-by control, never the set prompt (ADR 0068)", () => {
    render(<FitTile {...base} summary={S({ deadline: { kind: "return-leg", date: "2027-01-08", mode: "FLIGHT" } })} />);
    expect(screen.getByText("Flying home Fri 8 Jan")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /home-by date/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Set a home-by date" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("nights spare");
  });
  it("return leg by car reads Driving home", () => {
    render(<FitTile {...base} summary={S({ deadline: { kind: "return-leg", date: "2027-01-08", mode: "CAR" }, hardEndState: "over", hardEndSlackNights: -1 })} />);
    expect(screen.getByText("Driving home Fri 8 Jan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make it fit" })).toBeInTheDocument();
  });
```
In `/work/app/(app)/trips/[tripId]/plan/page.test.tsx`: add `fitTile: undefined as Record<string, unknown> | undefined,` to `railCapture`. Change the fit-tile mock to
`vi.mock("@/components/plan/fit-tile", () => ({ FitTile: (props: Record<string, unknown>) => { railCapture.fitTile = props; return <div data-testid="fit-tile" />; }, FitStrip: () => null }));`
and add inside `describe("Plan overview sticky aside (LA-038)", …)`:
```ts
  it("a dated return leg from the last Stop is the plan's deadline: the Fit tile and the add-stop line both read it (ADR 0068)", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, hardEndDate: "2026-01-20" });
    mockDb.stop.findMany.mockResolvedValue([STOP]);
    mockDb.transport.findMany.mockResolvedValue([{
      id: "t1", mode: "FLIGHT", fromStopId: "s1", toStopId: null, anchorStopId: null,
      depPlace: "FCO", depAt: new Date("2026-01-05T09:00:00Z"), depLat: null, depLng: null,
      arrPlace: "London", arrAt: new Date("2026-01-05T12:00:00Z"), arrLat: null, arrLng: null,
      reference: null, notes: null, sortOrder: 0, depIsHome: false, arrIsHome: true,
    }]);
    await renderPlan();
    expect(mockDb.transport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ arrIsHome: true, depIsHome: true }) }),
    );
    const summary = railCapture.fitTile!.summary as { deadline: unknown };
    expect(summary.deadline).toEqual({ kind: "return-leg", date: "2026-01-05", mode: "FLIGHT" });
    expect(itineraryManagerCapture.props!.hardEndDate).toBe("2026-01-05");
  });
  it("with no return leg the stored hard end date is the deadline", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...BASE_TRIP, hardEndDate: "2026-01-20" });
    mockDb.stop.findMany.mockResolvedValue([STOP]);
    await renderPlan();
    expect((railCapture.fitTile!.summary as { deadline: unknown }).deadline).toEqual({ kind: "hard-end", date: "2026-01-20" });
    expect(itineraryManagerCapture.props!.hardEndDate).toBe("2026-01-20");
  });
```

- [ ] **Step 2: Run them.** `cd /work && TZ=UTC npx vitest run lib/plan-overview.test.ts lib/plan/plan-model.test.ts components/plan "app/(app)/trips/[tripId]/plan/page.test.tsx"`. Expected: FAIL. `summarizePlan` ignores `deadline` (state "unset"), the Fit tile has no "Flying home" text, and `railCapture.fitTile.summary.deadline` is undefined.

- [ ] **Step 3: Implement.**

`/work/lib/plan-overview.ts`:
- Add `import type { TripDeadline } from "@/lib/trip-deadline";`.
- Update the header doc to `See CONTEXT.md (Hard end date, Projected end), ADR 0013 and ADR 0068.`
- In `PlanSummaryInput`, replace `hardEndDate: string | null;` with
```ts
  /** The Trip's deadline from resolveTripDeadline — dated return leg, else hard end date (ADR 0068). */
  deadline: TripDeadline | null;
```
- In `PlanSummary`, replace `hardEndDate: string | null;` with `deadline: TripDeadline | null;`, and change the `hardEndSlackNights` doc to `deadline − projectedEnd in nights …`.
- In `summarizePlan`, destructure `{ stops, startDate, deadline }` and replace the state block with:
```ts
  let hardEndState: HardEndState;
  let hardEndSlackNights: number | null = null;
  if (!deadline) {
    hardEndState = "unset";
  } else if (!projectedEnd) {
    hardEndState = "dormant";
  } else {
    const slack = daysBetween(projectedEnd, deadline.date);
    hardEndSlackNights = slack;
    if (slack < 0) hardEndState = "over";
    else if (slack <= HARD_END_APPROACHING_NIGHTS) hardEndState = "approaching";
    else hardEndState = "ok";
  }
```
- In the returned object, replace `hardEndDate,` with `deadline,`.

`/work/lib/plan/plan-model.ts`, line 278:
```ts
  const of = s.spanStart && s.deadline ? daysBetween(s.spanStart, s.deadline.date) : null;
```

`/work/components/plan/fit-tile.tsx`: drop the `formatDayLabel` import and add `import { deadlineLabel } from "@/lib/trip-deadline";`. Replace the header block `{summary.hardEndDate && ( <HardEndDateControl … /> )}` (lines 99–106) with:
```tsx
        {summary.deadline?.kind === "return-leg" ? (
          // ADR 0068: the booked leg answers "when am I home" — no Home-by control while it rules.
          <span data-deadline="return-leg" className="inline-flex items-center px-3 text-sm font-semibold">
            {deadlineLabel(summary.deadline)}
          </span>
        ) : summary.deadline ? (
          <HardEndDateControl
            tripId={tripId}
            hardEndDate={summary.deadline.date}
            startDate={startDate}
            label={deadlineLabel(summary.deadline)}
          />
        ) : null}
```
Change the `MakeItFit` line to `hardEndDate={summary.deadline?.date ?? null}` for now (C6 switches the prop). The "Set a home-by date" branch needs no change: `hardEndState` is only "unset" when there is no deadline at all.

`/work/app/(app)/trips/[tripId]/plan/page.tsx`:
- Add `import { resolveTripDeadline } from "@/lib/trip-deadline";` next to the `summarizePlan` import.
- In the `db.transport.findMany` select (after `toStopId: true,`), add `depIsHome: true,` and `arrIsHome: true,`.
- Directly above `const planSummary = summarizePlan({`, add:
```ts
  // ADR 0068: the plan's deadline — its dated return leg (from the last Stop in
  // plan order, this plan's own legs) else the Trip's hard end date.
  const planDeadline = resolveTripDeadline({ stops: ordered, transports, hardEndDate: trip?.hardEndDate ?? null });
```
- In `summarizePlan({...})`, replace `hardEndDate: trip?.hardEndDate ?? null,` with `deadline: planDeadline,`.
- Change `hardEndDate={trip?.hardEndDate ?? null}` on `ItineraryManager` to `hardEndDate={planDeadline?.date ?? null}`.

`/work/components/trip/itinerary-manager.tsx` line 169: change the comment to `/** The Trip's deadline date (ADR 0068: dated return leg, else hard end date), for the Add a stop consequence line. */`.

- [ ] **Step 4: Run them.** `cd /work && TZ=UTC npx vitest run lib/plan-overview.test.ts lib/plan/plan-model.test.ts components/plan "app/(app)/trips/[tripId]/plan/page.test.tsx"`. Expected: PASS. Then run `cd /work && npx tsc --noEmit -p .` and check that no errors mention `plan-overview`, `fit-tile`, `plan/page` or `hardEndDate` on `PlanSummary`. Use `grep -rn "summary.hardEndDate\|planSummary.hardEndDate" components app lib` to confirm nothing still reads the removed field.

- [ ] **Step 5: Commit**

```bash
cd /work && git add lib/plan-overview.ts lib/plan-overview.test.ts lib/plan/plan-model.ts lib/plan/plan-model.test.ts components/plan/fit-tile.tsx components/plan/fit-tile.test.tsx components/plan/motion.test.tsx components/plan/plan-header-actions.test.tsx components/trip/itinerary-manager.tsx "app/(app)/trips/[tripId]/plan/page.tsx" "app/(app)/trips/[tripId]/plan/page.test.tsx" && git commit -m "$(cat <<'EOF'
feat(plan): Fit tile reads "{Flying|Driving|…} home {date}" when the return leg is the deadline

summarizePlan carries the resolved deadline; nights spare/over and the
add-stop line count against the leg's departure (ADR 0068).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: [C6] Make it fit targets the deadline (Fit tile and Summary)

**Files:**
- Modify: `/work/components/trip/make-it-fit.tsx`: imports (lines 18–28); `MakeItFitProps` (lines 36–50); `MakeItFit` (lines 52–102); `MakeItFitDialog` (lines 105–152, 196, the description at lines 206–216, the "Trimming alone" paragraph)
- Modify: `/work/components/plan/fit-tile.tsx`: the `MakeItFit` line
- Modify: `/work/app/(app)/trips/[tripId]/summary/page.tsx`: the `MakeItFit` props (line 689)
- Test: `/work/components/trip/make-it-fit.test.tsx`

**Interfaces:**
- Consumes: `TripDeadline`, `deadlineNoun` (C1); `PlanSummary.deadline` (C5); `getTripProjection().deadline` (C3)
- Produces: `MakeItFitProps.deadline: TripDeadline | null`, which replaces `hardEndDate`. Trim and drop targets use `deadline.date`.

- [ ] **Step 1: Write the failing tests.** Migrate the existing renders first, then add the new cases:
`cd /work && sed -i -E 's/hardEndDate="([0-9-]+)"/deadline={{ kind: "hard-end", date: "\1" }}/g' components/trip/make-it-fit.test.tsx`
Add inside `describe("MakeItFit", …)`:

```ts
  it("targets the return leg's departure and names the trip home (ADR 0068)", async () => {
    // Rome 6 + Florence 4 from 07-01 → ends 07-11; flight home 07-09 → 2 over.
    render(<MakeItFit tripId="t1" stops={overStops} anchor="2026-07-01" deadline={{ kind: "return-leg", date: "2026-07-09", mode: "FLIGHT" }} />);
    await userEvent.click(screen.getByRole("button", { name: /make it fit/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("2 nights past your flight home on Thu 9 Jul 2026.");
    expect(dialog).not.toHaveTextContent(/hard end date/i);
  });

  it("is hidden when the plan fits before the return leg even though it would run past a stored hard end date", () => {
    const { container } = render(
      <MakeItFit tripId="t1" stops={overStops} anchor="2026-07-01" deadline={{ kind: "return-leg", date: "2026-07-12", mode: "TRAIN" }} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("hard-end deadline keeps the hard end date wording", async () => {
    render(<MakeItFit tripId="t1" stops={overStops} anchor="2026-07-01" deadline={{ kind: "hard-end", date: "2026-07-07" }} />);
    await userEvent.click(screen.getByRole("button", { name: /make it fit/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("your hard end date of Tue 7 Jul 2026.");
  });
```

- [ ] **Step 2: Run them.** `cd /work && TZ=UTC npx vitest run components/trip/make-it-fit.test.tsx`. Expected: FAIL. The component still reads `hardEndDate`, so with only `deadline` passed `over` is 0 and the button never renders (`Unable to find role="button" name /make it fit/`).

- [ ] **Step 3: Implement** in `/work/components/trip/make-it-fit.tsx`:
- Add `import { deadlineNoun, type TripDeadline } from "@/lib/trip-deadline";`.
- In `MakeItFitProps`, replace `hardEndDate: string | null;` with
```ts
  /** The Trip's deadline (ADR 0068): a dated return leg's departure, else the hard end date. */
  deadline: TripDeadline | null;
```
- In `MakeItFit`, destructure `deadline` instead of `hardEndDate`, add `const deadlineDate = deadline?.date ?? null;`, change to `const over = nightsOver(projectedEnd, deadlineDate);`, and pass `deadline={deadline}` to `MakeItFitDialog`.
- In `MakeItFitDialog`, destructure `deadline`, add `const deadlineDate = deadline?.date ?? null;`, and replace every `hardEndDate` in `buildTrimPlan(...)`, `nightsOver(sim.projectedEnd, ...)`, `buildDropCandidates(...)` and their `useMemo` dependency arrays with `deadlineDate`.
- Replace `const hardEndLabel = hardEndDate ? formatLongDate(hardEndDate) : "";` with:
```ts
  // Hard end keeps its wording; a return leg reads as the trip home (ADR 0068).
  const deadlineRef = !deadline
    ? ""
    : deadline.kind === "hard-end"
      ? `your hard end date of ${formatLongDate(deadline.date)}`
      : `your ${deadlineNoun(deadline)} on ${formatLongDate(deadline.date)}`;
```
- In `DialogDescription`, replace `{" "}your hard end date of {hardEndLabel}.` with `{" "}{deadlineRef}.`.
- Replace the "Trimming alone…" paragraph text with:
```tsx
                {deadline?.kind === "return-leg"
                  ? `Trimming alone won't get you to your ${deadlineNoun(deadline)} — drop a stop, unpin one, or move the booking.`
                  : "Trimming alone won't reach your hard end date — drop a stop, unpin one, or move the date."}
```

`/work/components/plan/fit-tile.tsx`: the `MakeItFit` line becomes
```tsx
          <MakeItFit tripId={tripId} stops={fitStops} anchor={startDate} deadline={summary.deadline} isOwner={isOwner} />
```
`/work/app/(app)/trips/[tripId]/summary/page.tsx`: replace `hardEndDate={projection.hardEndDate}` on `MakeItFit` with `deadline={projection.deadline ?? null}`.

- [ ] **Step 4: Run them.** `cd /work && TZ=UTC npx vitest run components/trip/make-it-fit.test.tsx components/plan "app/(app)/trips/[tripId]/summary"`. Expected: PASS. Then run the full gate: `cd /work && npm test && npx tsc --noEmit -p . && npm run lint`. Expected: all green. `grep -rn "hardEndDate=" components app | grep -i makeitfit` should return nothing.

- [ ] **Step 5: Commit** (completes the user-visible change)

```bash
cd /work && git add components/trip/make-it-fit.tsx components/trip/make-it-fit.test.tsx components/plan/fit-tile.tsx "app/(app)/trips/[tripId]/summary/page.tsx" && git commit -m "$(cat <<'EOF'
feat(make-it-fit): target the dated return leg when it is the deadline (ADR 0068)

Make it fit on the Fit tile and Summary trims/drops against the leg's
departure and words it as "your flight home". A stored hard end date
stays dormant and takes over again if the leg is deleted or undated.

Resolves-Feedback: cmutb7bn2000104lbwqrew0qo
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Review focus candidates
1. In a multi-leg journey home where both legs are stored with `fromStopId` = the last Stop, `findReturnLeg` prefers the `arrIsHome` leg. The deadline would then be the onward leg's departure, not the first leg's. The resolver follows the spec ("findReturnLeg if dated"); check that the editor never saves that shape.
2. Last-Stop rules differ: the resolver uses `orderPlanStops` (the plan editor's rule, ADR 0038). `detectFlags`' `lastStopId` and `homeLastStop` use raw `sortOrder`. They can disagree when dates and sortOrder disagree. The return-after-hard-end gate uses the resolved deadline, so it stays consistent.
3. Copy left unchanged on purpose: the Compare badge still says "Over hard end", and hard-end Flag messages keep their ISO date while return-leg messages use `formatLongDate`. Check whether either should change.
## Part E: Wishlist Schedule offers that place's days

Decisions made while drafting. Reviewers should check these against the spec.
- **Stop days run from arrive to depart, both included.** This matches `buildStopDays` / `groupScheduledItemsByStop` in `lib/stop-days.ts` (the plan editor's day sections), which use `enumerateTripDays(arrive, depart)` with both ends included. So a Changeover day shows up under both stays.
- **"Within 50 km" includes 50 km itself** (`<=`, with a 1e-6 km epsilon for floating-point error). Distance comes from `haversineKm` in `lib/geo.ts`.
- **Which Plan's Stops count.** The Wishlist page currently loads `trip.stops` with no fork filter (every Plan's Stops). The day options instead use a new `planStops` query scoped with `planScope(activeForkId)`. `trip.stops` is left alone; it is not in scope here.
- **Chips start with nothing picked.** The board's `defaultDate` (first Stop's arrival, else trip start) is used only in the plain date mode.
- **When the nearest Stop within 50 km is rough,** the dialog offers "Add to {Stop}'s things to do". Any *dated* Stops within 50 km are still offered as chips. If only rough Stops are near, there are no chips, just the offer and "Pick another date".
- **A Trip with no dated Stops (and no rough Stop near the idea)** gets the plain date field, the same as today.
- **The "existing ADR 0022 path"** is `createItem(tripId, { …, stopId }, forkId)`: the "Add a thing to do" path, which makes a Plan-owned Item with a Stop and no date. Nothing that copies a Wishlist idea into a Stop's things to do exists yet. The idea stays in the Wishlist.

---

### Task 13: [E1] Pure day-options module

**Files:**
- Create: `/work/lib/schedule-day-options.ts`
- Test: `/work/lib/schedule-day-options.test.ts`

**Interfaces:**
- Consumes: `haversineKm(a: LatLng, b: LatLng): number` from `@/lib/geo`, `enumerateTripDays(start: string, end: string): string[]` from `@/lib/itinerary`, `formatWeekday`, `parseISODate` from `@/lib/dates`
- Produces:
  - `export const NEAR_STOP_KM = 50`
  - `export interface DayOptionStop { id: string; name: string; lat: number | null; lng: number | null; arriveDate: string | null; departDate: string | null }`
  - `export interface StayDays { stopId: string; stopName: string; days: string[] }`
  - `export interface ScheduleDayOptions { stays: StayDays[]; near: boolean; roughStop: { id: string; name: string } | null }`
  - `export function scheduleDayOptions(idea: { lat?: number | null; lng?: number | null }, stops: readonly DayOptionStop[]): ScheduleDayOptions`
  - `export function dayChipLabel(iso: string): string` (`"2026-09-19"` → `"Sat 19"`)

- [ ] **Step 1: Write the failing test.** Create `/work/lib/schedule-day-options.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  NEAR_STOP_KM,
  dayChipLabel,
  scheduleDayOptions,
  type DayOptionStop,
} from "./schedule-day-options";

/** Degrees of latitude spanning `km` along a meridian, on haversineKm's own sphere (R = 6371). */
const latForKm = (km: number) => (km / (2 * Math.PI * 6371)) * 360;

function stop(overrides: Partial<DayOptionStop> & { id: string }): DayOptionStop {
  return { name: overrides.id, lat: null, lng: null, arriveDate: null, departDate: null, ...overrides };
}

const ROME = stop({ id: "rome", name: "Rome", lat: 41.9, lng: 12.5, arriveDate: "2026-09-19", departDate: "2026-09-21" });
const NAPLES = stop({ id: "nap", name: "Naples", lat: 40.85, lng: 14.27, arriveDate: "2026-09-21", departDate: "2026-09-24" });
const TIVOLI = stop({ id: "tiv", name: "Tivoli", lat: 41.96, lng: 12.8, arriveDate: "2026-09-25", departDate: "2026-09-26" });
const ROME_AGAIN = stop({ id: "rome-2", name: "Rome", lat: 41.9, lng: 12.5, arriveDate: "2026-10-01", departDate: "2026-10-02" });
const FLORENCE_ROUGH = stop({ id: "flo", name: "Florence", lat: 43.77, lng: 11.25 });
const FIESOLE = stop({ id: "fie", name: "Fiesole", lat: 43.806, lng: 11.293, arriveDate: "2026-10-03", departDate: "2026-10-04" });

const ROME_DAYS = ["2026-09-19", "2026-09-20", "2026-09-21"];
const NAPLES_DAYS = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"];

describe("scheduleDayOptions (spec 2026-10-05 §E)", () => {
  it("is a 50 km radius", () => {
    expect(NEAR_STOP_KM).toBe(50);
  });

  it("offers a near Stop's days, arrive → depart inclusive (as the plan editor's day sections)", () => {
    const idea = { lat: 41.9 + latForKm(10), lng: 12.5 };
    expect(scheduleDayOptions(idea, [ROME, NAPLES])).toEqual({
      near: true,
      roughStop: null,
      stays: [{ stopId: "rome", stopName: "Rome", days: ROME_DAYS }],
    });
  });

  it("exactly 50 km counts as near; 50.5 km does not", () => {
    expect(scheduleDayOptions({ lat: 41.9 + latForKm(50), lng: 12.5 }, [ROME, NAPLES]).near).toBe(true);
    const past = scheduleDayOptions({ lat: 41.9 + latForKm(50.5), lng: 12.5 }, [ROME, NAPLES]);
    expect(past.near).toBe(false);
    expect(past.stays.map((s) => s.stopId)).toEqual(["rome", "nap"]);
  });

  it("an idea near two Stops offers both stays, in date order", () => {
    const between = { lat: 41.93, lng: 12.65 };
    const result = scheduleDayOptions(between, [TIVOLI, NAPLES, ROME]);
    expect(result.near).toBe(true);
    expect(result.stays.map((s) => s.stopId)).toEqual(["rome", "tiv"]);
  });

  it("the same city visited twice is two separate stays", () => {
    const result = scheduleDayOptions({ lat: 41.9, lng: 12.5 }, [ROME_AGAIN, ROME]);
    expect(result.stays).toEqual([
      { stopId: "rome", stopName: "Rome", days: ROME_DAYS },
      { stopId: "rome-2", stopName: "Rome", days: ["2026-10-01", "2026-10-02"] },
    ]);
  });

  it("nearest Stop rough → offers its things to do, and still the dated near stays", () => {
    const atFlorence = { lat: 43.77, lng: 11.25 };
    expect(scheduleDayOptions(atFlorence, [FLORENCE_ROUGH, FIESOLE, ROME])).toEqual({
      near: true,
      roughStop: { id: "flo", name: "Florence" },
      stays: [{ stopId: "fie", stopName: "Fiesole", days: ["2026-10-03", "2026-10-04"] }],
    });
  });

  it("only a rough Stop near → no chips, just the offer", () => {
    expect(scheduleDayOptions({ lat: 43.77, lng: 11.25 }, [FLORENCE_ROUGH, ROME])).toEqual({
      near: true,
      roughStop: { id: "flo", name: "Florence" },
      stays: [],
    });
  });

  it("a rough Stop that is near but not nearest is not offered", () => {
    const atFiesole = { lat: 43.806, lng: 11.293 };
    const result = scheduleDayOptions(atFiesole, [FLORENCE_ROUGH, FIESOLE]);
    expect(result.roughStop).toBeNull();
    expect(result.stays.map((s) => s.stopId)).toEqual(["fie"]);
  });

  it("no coordinates → every Trip day, grouped by Stop (rough Stops skipped), not near", () => {
    expect(scheduleDayOptions({ lat: null, lng: null }, [NAPLES, FLORENCE_ROUGH, ROME])).toEqual({
      near: false,
      roughStop: null,
      stays: [
        { stopId: "rome", stopName: "Rome", days: ROME_DAYS },
        { stopId: "nap", stopName: "Naples", days: NAPLES_DAYS },
      ],
    });
  });

  it("nothing within 50 km → every Trip day, not near", () => {
    const paris = { lat: 48.85, lng: 2.35 };
    const result = scheduleDayOptions(paris, [ROME, NAPLES]);
    expect(result.near).toBe(false);
    expect(result.roughStop).toBeNull();
    expect(result.stays.map((s) => s.stopId)).toEqual(["rome", "nap"]);
  });

  it("a Stop with no coordinates is never near", () => {
    const romeNoCoords = { ...ROME, lat: null, lng: null };
    expect(scheduleDayOptions({ lat: 41.9, lng: 12.5 }, [romeNoCoords]).near).toBe(false);
  });

  it("a Trip with no dated Stops offers nothing", () => {
    expect(scheduleDayOptions({ lat: 48.85, lng: 2.35 }, [FLORENCE_ROUGH])).toEqual({ near: false, roughStop: null, stays: [] });
    expect(scheduleDayOptions({}, [])).toEqual({ near: false, roughStop: null, stays: [] });
  });
});

describe("dayChipLabel", () => {
  it("is the weekday and day of month", () => {
    expect(dayChipLabel("2026-09-19")).toBe("Sat 19");
    expect(dayChipLabel("2026-10-01")).toBe("Thu 1");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** `cd /work && TZ=UTC npx vitest run lib/schedule-day-options.test.ts`. Expected: FAIL with `Failed to resolve import "./schedule-day-options"`.

- [ ] **Step 3: Write the minimal implementation.** Create `/work/lib/schedule-day-options.ts`:

```ts
/**
 * Day options for scheduling a Wishlist idea (spec 2026-10-05 §E) — PURE.
 *
 * An idea with coordinates near one or more of the current Plan's Stops
 * (≤ NEAR_STOP_KM, great-circle) is offered those Stops' days; otherwise
 * every Trip day, grouped by Stop. A Stop's days run arrive → depart
 * inclusive, exactly as the plan editor's day sections (`lib/stop-days.ts`),
 * so a Changeover day appears under both stays. When the nearest near Stop
 * is rough it has no days to offer — the dialog instead offers its things
 * to do (ADR 0022).
 */

import { haversineKm } from "@/lib/geo";
import { enumerateTripDays } from "@/lib/itinerary";
import { formatWeekday, parseISODate } from "@/lib/dates";

export const NEAR_STOP_KM = 50;
/** Floating-point slack so a Stop at exactly 50 km counts as within it. */
const EPSILON_KM = 1e-6;

export interface DayOptionStop {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  arriveDate: string | null;
  departDate: string | null;
}

export interface StayDays {
  stopId: string;
  stopName: string;
  /** YYYY-MM-DD, arrive → depart inclusive. */
  days: string[];
}

export interface ScheduleDayOptions {
  /** Stays offered as day chips, in date order. One per Stop — a city visited twice is two stays. */
  stays: StayDays[];
  /** True when `stays` are the Stops within NEAR_STOP_KM; false = every Trip day. */
  near: boolean;
  /** The nearest Stop within NEAR_STOP_KM when it is rough (no dates): offer its things to do. */
  roughStop: { id: string; name: string } | null;
}

type DatedStop = DayOptionStop & { arriveDate: string; departDate: string };

function isDated(s: DayOptionStop): s is DatedStop {
  return s.arriveDate != null && s.departDate != null;
}

function staysOf(stops: readonly DayOptionStop[]): StayDays[] {
  return stops
    .filter(isDated)
    .slice()
    .sort((a, b) => (a.arriveDate < b.arriveDate ? -1 : a.arriveDate > b.arriveDate ? 1 : 0))
    .map((s) => ({ stopId: s.id, stopName: s.name, days: enumerateTripDays(s.arriveDate, s.departDate) }));
}

export function scheduleDayOptions(
  idea: { lat?: number | null; lng?: number | null },
  stops: readonly DayOptionStop[],
): ScheduleDayOptions {
  const everyDay: ScheduleDayOptions = { stays: staysOf(stops), near: false, roughStop: null };
  if (idea.lat == null || idea.lng == null) return everyDay;
  const point = { lat: idea.lat, lng: idea.lng };

  const near = stops
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ stop: s, km: haversineKm(point, { lat: s.lat!, lng: s.lng! }) }))
    .filter((x) => x.km <= NEAR_STOP_KM + EPSILON_KM)
    .sort((a, b) => a.km - b.km);
  if (near.length === 0) return everyDay;

  const nearest = near[0].stop;
  return {
    stays: staysOf(near.map((x) => x.stop)),
    near: true,
    roughStop: isDated(nearest) ? null : { id: nearest.id, name: nearest.name },
  };
}

/** "Sat 19" — a day chip; the stay's name and the dialog give the month. */
export function dayChipLabel(iso: string): string {
  return `${formatWeekday(iso)} ${parseISODate(iso).getUTCDate()}`;
}
```

- [ ] **Step 4: Run it and confirm it passes.** `cd /work && TZ=UTC npx vitest run lib/schedule-day-options.test.ts`. Expected: PASS (13 tests).

- [ ] **Step 5: Commit**
```bash
cd /work && git add lib/schedule-day-options.ts lib/schedule-day-options.test.ts && git commit -m "feat(wishlist): pure day options for scheduling an idea near a Stop

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: [E2] ScheduleItemDialog shows day chips, the rough-Stop offer, and "Pick another date"

**Files:**
- Modify: `/work/components/trip/schedule-item-dialog.tsx` (whole file: imports at 1-15, props at 28-39, `ScheduleItemDialog` at 45-73, `ScheduleForm` at 79-178)
- Test: `/work/components/trip/schedule-item-dialog.test.tsx` (add a new describe at the end)

**Interfaces:**
- Consumes: `ScheduleDayOptions`, `dayChipLabel` from `@/lib/schedule-day-options` (E1); `formatDayLabel`, `formatDayRange` from `@/lib/dates`; `ActionResult` from `@/lib/action-result`; `Chip` from `@/components/ui/chip`
- Produces: two new optional props on `ScheduleItemDialogProps`:
  - `dayOptions?: ScheduleDayOptions`
  - `onAddToThingsToDo?: (stopId: string) => Promise<ActionResult>`

  When `dayOptions` is absent (the Calendar), or has no stays and no `roughStop`, the dialog behaves exactly as it does today.

- [ ] **Step 1: Write the failing test.** Append to `/work/components/trip/schedule-item-dialog.test.tsx`, adding these imports at the top next to the existing ones: `fireEvent` from `@testing-library/react`, and `import type { ScheduleDayOptions } from "@/lib/schedule-day-options";`.

```tsx
const ROME_STAY = { stopId: "rome", stopName: "Rome", days: ["2026-09-19", "2026-09-20", "2026-09-21"] };
const NEAR: ScheduleDayOptions = { near: true, roughStop: null, stays: [ROME_STAY] };

describe("ScheduleItemDialog — Wishlist day chips (spec 2026-10-05 §E)", () => {
  it("shows the near Stop's days as chips instead of the date field", () => {
    renderDialog({ dayOptions: NEAR });
    const group = screen.getByRole("group", { name: "Rome, Sat 19 Sep – Mon 21 Sep" });
    expect(group).toHaveTextContent("Rome");
    expect(screen.getByRole("button", { name: "Sat 19 Sep" })).toHaveTextContent("Sat 19");
    expect(screen.getByRole("button", { name: "Sun 20 Sep" })).toHaveTextContent("Sun 20");
    expect(screen.getByRole("button", { name: "Mon 21 Sep" })).toHaveTextContent("Mon 21");
    expect(screen.queryByLabelText(/^date/i)).toBeNull();
    expect(screen.queryByText("Not near any Stop — pick any day")).toBeNull();
  });

  it("picking a chip sets the date; times then work as now", async () => {
    const user = userEvent.setup();
    renderDialog({ dayOptions: NEAR });
    expect(screen.getByLabelText(/start time/i)).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Sun 20 Sep" }));
    expect(screen.getByRole("button", { name: "Sun 20 Sep" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/start time/i)).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /^schedule$/i }));
    await waitFor(() => {
      expect(scheduleItem).toHaveBeenCalledWith("item-1", expect.objectContaining({ date: "2026-09-20" }), undefined);
    });
  });

  it("starts with no chip picked, and refuses to send without one", async () => {
    const user = userEvent.setup();
    renderDialog({ dayOptions: NEAR }); // defaultDate 2026-07-10 is not one of the chips
    await user.click(screen.getByRole("button", { name: /^schedule$/i }));
    expect(scheduleItem).not.toHaveBeenCalled();
    expect(screen.getByText("Please pick a date")).toBeInTheDocument();
  });

  it("two stays in the same city are labelled separately", () => {
    renderDialog({
      dayOptions: {
        near: true,
        roughStop: null,
        stays: [ROME_STAY, { stopId: "rome-2", stopName: "Rome", days: ["2026-10-01", "2026-10-02"] }],
      },
    });
    expect(screen.getByRole("group", { name: "Rome, Sat 19 Sep – Mon 21 Sep" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Rome, Thu 1 Oct – Fri 2 Oct" })).toBeInTheDocument();
  });

  it("not near any Stop: every Trip day, with the line", () => {
    renderDialog({ dayOptions: { ...NEAR, near: false } });
    expect(screen.getByText("Not near any Stop — pick any day")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sat 19 Sep" })).toBeInTheDocument();
  });

  it("nearest Stop rough: Add to its things to do, then close", async () => {
    const user = userEvent.setup();
    const onAddToThingsToDo = vi.fn().mockResolvedValue({ success: true });
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({
      dayOptions: { near: true, roughStop: { id: "flo", name: "Florence" }, stays: [] },
      onAddToThingsToDo,
      onSaved,
      onOpenChange,
    });
    await user.click(screen.getByRole("button", { name: "Add to Florence's things to do" }));
    await waitFor(() => expect(onAddToThingsToDo).toHaveBeenCalledWith("flo"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(scheduleItem).not.toHaveBeenCalled();
  });

  it("a failed Add to things to do shows why and stays open", async () => {
    const user = userEvent.setup();
    const onAddToThingsToDo = vi
      .fn()
      .mockResolvedValue({ success: false, errors: { stopId: ["Stop does not belong to this trip"] } });
    const onSaved = vi.fn();
    renderDialog({
      dayOptions: { near: true, roughStop: { id: "flo", name: "Florence" }, stays: [] },
      onAddToThingsToDo,
      onSaved,
    });
    await user.click(screen.getByRole("button", { name: "Add to Florence's things to do" }));
    expect(await screen.findByText("Stop does not belong to this trip")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("Pick another date → the date field (keeping the chip's day) → back to the chips → a typed date sends", async () => {
    const user = userEvent.setup();
    renderDialog({ dayOptions: NEAR });
    await user.click(screen.getByRole("button", { name: "Sun 20 Sep" }));
    await user.click(screen.getByRole("button", { name: "Pick another date" }));
    expect(screen.getByLabelText(/^date/i)).toHaveValue("2026-09-20");
    expect(screen.queryByRole("button", { name: "Sun 20 Sep" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Back to the nearby days" }));
    expect(screen.getByRole("button", { name: "Sun 20 Sep" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Pick another date" }));
    fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: "2026-09-25" } });
    await user.click(screen.getByRole("button", { name: /^schedule$/i }));
    await waitFor(() => {
      expect(scheduleItem).toHaveBeenCalledWith("item-1", expect.objectContaining({ date: "2026-09-25" }), undefined);
    });
  });

  it("a Trip with no dated Stops (no stays, no rough offer) keeps the plain date field", () => {
    renderDialog({ dayOptions: { near: false, roughStop: null, stays: [] } });
    expect(screen.getByLabelText(/^date/i)).toHaveValue("2026-07-10");
    expect(screen.queryByRole("button", { name: "Pick another date" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Back to the/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** `cd /work && TZ=UTC npx vitest run components/trip/schedule-item-dialog.test.tsx`. Expected: the 4 existing tests pass. The new tests fail: `Unable to find role="group"` and `Unable to find an accessible element with the role "button" and name "Add to Florence's things to do"`. The no-dated-Stops test may already pass.

- [ ] **Step 3: Write the minimal implementation.** Replace `/work/components/trip/schedule-item-dialog.tsx` with:

```tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import {
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { scheduleItem } from "@/server/actions/items";
import { FormDialog } from "@/components/ui/form-dialog";
import { useEntityForm } from "@/components/ui/use-entity-form";
import type { ActionResult } from "@/lib/action-result";
import { formatDayLabel, formatDayRange } from "@/lib/dates";
import { dayChipLabel, type ScheduleDayOptions } from "@/lib/schedule-day-options";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormErrors {
  date?: string[];
  startTime?: string[];
  endTime?: string[];
  _form?: string[];
}

export interface ScheduleItemDialogProps {
  itemId: string;
  itemTitle: string;
  /** Default date to pre-fill — typically trip start or first stop date. */
  defaultDate?: string;
  /** When set, the scheduled copy is placed into this fork plan rather than the real plan. */
  forkId?: string | null;
  /**
   * Wishlist only (spec 2026-10-05 §E): the days to offer as chips, from
   * `lib/schedule-day-options`. Absent (the Calendar) — or with no stays and
   * no rough Stop — the dialog is the plain date field.
   */
  dayOptions?: ScheduleDayOptions;
  /** Wishlist only: "Add to {Stop}'s things to do" when the nearest Stop is rough (ADR 0022). */
  onAddToThingsToDo?: (stopId: string) => Promise<ActionResult>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function ScheduleItemDialog({
  itemId,
  itemTitle,
  defaultDate,
  forkId,
  dayOptions,
  onAddToThingsToDo,
  open,
  onOpenChange,
  onSaved,
}: ScheduleItemDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Schedule Item"
      recordId={itemId}
    >
      <p className="text-sm text-muted-foreground">
        Pick a date for{" "}
        <span className="font-medium text-foreground">{itemTitle}</span>.
      </p>
      <ScheduleForm
        itemId={itemId}
        defaultDate={defaultDate}
        forkId={forkId}
        dayOptions={dayOptions}
        onAddToThingsToDo={onAddToThingsToDo}
        onClose={() => onOpenChange(false)}
        onSaved={onSaved}
      />
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Inner form
// ---------------------------------------------------------------------------

interface ScheduleFormProps {
  itemId: string;
  defaultDate?: string;
  forkId?: string | null;
  dayOptions?: ScheduleDayOptions;
  onAddToThingsToDo?: (stopId: string) => Promise<ActionResult>;
  onClose: () => void;
  onSaved?: () => void;
}

const LINK_CLASS = "tap-target self-start text-[13px] font-bold text-coral-text";

function ScheduleForm({
  itemId,
  defaultDate,
  forkId,
  dayOptions,
  onAddToThingsToDo,
  onClose,
  onSaved,
}: ScheduleFormProps) {
  const roughStop = dayOptions?.roughStop ?? null;
  const offersDays = Boolean(dayOptions && (dayOptions.stays.length > 0 || roughStop));
  const [mode, setMode] = React.useState<"days" | "date">(offersDays ? "days" : "date");
  // Chips start unpicked: a pre-filled default that isn't one of the offered
  // days would read as a choice the Traveller never made.
  const [date, setDate] = React.useState(offersDays ? "" : (defaultDate ?? ""));
  const [startTime, setStartTime] = React.useState("");
  const [endTime, setEndTime] = React.useState("");
  const [addError, setAddError] = React.useState<string | null>(null);
  const [isAdding, startAdding] = React.useTransition();

  const timesDisabled = !date;

  function changeDate(next: string) {
    setDate(next);
    if (!next) {
      setStartTime("");
      setEndTime("");
    }
  }

  const { errors, isPending, onSubmit } = useEntityForm({
    submit: () => {
      if (!date) {
        return Promise.resolve({ success: false as const, errors: { date: ["Please pick a date"] } });
      }
      return scheduleItem(
        itemId,
        {
          date,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
        },
        forkId ?? undefined,
      );
    },
    onClose,
    onSaved,
  });

  function addToThingsToDo(stopId: string) {
    if (!onAddToThingsToDo) return;
    setAddError(null);
    startAdding(async () => {
      const result = await onAddToThingsToDo(stopId);
      if (result.success) {
        onSaved?.();
        onClose();
        return;
      }
      setAddError(Object.values(result.errors)[0]?.[0] ?? "Couldn't add it — try again.");
    });
  }

  const busy = isPending || isAdding;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {mode === "days" && dayOptions ? (
        <div className="flex flex-col gap-3">
          {roughStop && onAddToThingsToDo ? (
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-sm text-muted-foreground">{roughStop.name} has no dates yet.</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={isAdding}
                disabled={busy}
                onClick={() => addToThingsToDo(roughStop.id)}
              >
                Add to {roughStop.name}{"'s"} things to do
              </Button>
            </div>
          ) : null}

          {!dayOptions.near && !roughStop && dayOptions.stays.length > 0 ? (
            <p className="text-sm text-muted-foreground">Not near any Stop — pick any day</p>
          ) : null}

          {dayOptions.stays.map((stay) => (
            <div
              key={stay.stopId}
              role="group"
              aria-label={`${stay.stopName}, ${formatDayRange(stay.days[0], stay.days[stay.days.length - 1])}`}
              className="flex flex-wrap items-center gap-1.5"
            >
              <span className="mr-1 text-[13px] font-extrabold text-foreground">{stay.stopName}</span>
              {stay.days.map((d) => (
                <Chip
                  key={d}
                  size="l"
                  tone={date === d ? "coral" : "white"}
                  selected={date === d}
                  aria-label={formatDayLabel(d)}
                  disabled={busy}
                  onClick={() => changeDate(d)}
                  className="tap-target"
                >
                  {dayChipLabel(d)}
                </Chip>
              ))}
            </div>
          ))}

          <FormError>{(errors as FormErrors).date?.[0]}</FormError>
          <FormError>{addError}</FormError>

          <button type="button" className={LINK_CLASS} onClick={() => setMode("date")}>
            Pick another date
          </button>
        </div>
      ) : (
        <>
          <DateField
            label="Date"
            required
            value={date}
            onChange={(e) => changeDate(e.target.value)}
            error={(errors as FormErrors).date?.[0]}
            disabled={busy}
            autoFocus={!offersDays}
          />
          {offersDays && dayOptions ? (
            <button type="button" className={LINK_CLASS} onClick={() => setMode("days")}>
              {dayOptions.near ? "Back to the nearby days" : "Back to the trip days"}
            </button>
          ) : null}
        </>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Start time"
          error={(errors as FormErrors).startTime?.[0]}
          description={timesDisabled ? "Set a date first" : undefined}
        >
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={busy || timesDisabled}
          />
        </Field>
        <Field
          label="End time"
          error={(errors as FormErrors).endTime?.[0]}
          description={timesDisabled ? "Set a date first" : !startTime ? "Set a start time first" : undefined}
        >
          <Input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={busy || timesDisabled || !startTime}
          />
        </Field>
      </div>

      <FormError>{(errors as FormErrors)._form?.[0]}</FormError>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" type="button" disabled={busy}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={isPending}>
          Schedule
        </Button>
      </DialogFooter>
    </form>
  );
}
```

  Note: the existing tests click `getByRole("button", { name: /schedule/i })`. With `dayOptions` absent the only button whose name matches is still "Schedule", so they are unaffected. The new tests use `/^schedule$/i` so they cannot match a chip.

- [ ] **Step 4: Run it and confirm it passes.** `cd /work && TZ=UTC npx vitest run components/trip/schedule-item-dialog.test.tsx components/trip/calendar-views.test.tsx`. Expected: PASS. The Calendar passes no `dayOptions`, so it is unchanged.

- [ ] **Step 5: Commit**
```bash
cd /work && git add components/trip/schedule-item-dialog.tsx components/trip/schedule-item-dialog.test.tsx && git commit -m "feat(wishlist): Schedule dialog offers day chips by Stop, rough-Stop things to do, Pick another date

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: [E2b] `placeIdeaAtStop` — copy a Wishlist idea into a Stop's things to do

Supersedes the `createItem` path in E3: E3 must call `placeIdeaAtStop(item.id, stopId, forkId)` instead of `createItem(...)`, and its test asserts that call. Reason: `createItem` drops `sourceItemId`, the photo and `hiddenFromShares`, and re-geocodes coordinates from the address.

**Files:**
- Modify: `server/actions/items.ts` (add after `scheduleItem`)
- Test: `server/actions/items.test.ts` (follow its existing mocks for `db`, `requireItemAccess`, `copyItemPhoto`, `recordPlanActivity`)

**Interfaces:**
- Produces: `export async function placeIdeaAtStop(itemId: string, stopId: string, forkId?: PlanId): Promise<ActionResult<{ placedItemId?: string }>>`

- [ ] **Step 1: Write the failing tests** in `server/actions/items.test.ts`, in a new `describe("placeIdeaAtStop")`, using the file's existing fixtures/mocks:
  - an idea `{ date: null, stopId: null, forkId: null, lat: 41.89, lng: 12.49, address: null, hiddenFromShares: true, photoAttachmentId: "ph1" }` and a Stop `{ id: "s1", tripId: <same>, forkId: null }` → `db.item.create` called with `data` containing `sourceItemId: itemId, stopId: "s1", date: null, lat: 41.89, lng: 12.49, address: null, hiddenFromShares: true, forkId: null`; `copyItemPhoto` called with `targetItemId` = created id; result `{ success: true, placedItemId }`.
  - Stop from another trip, or whose `forkId` ≠ the passed `forkId` → `{ success: false }` and no create.
  - item that is not a Wishlist idea (has `date` or `stopId` or `forkId`) → `{ success: false }` and no create.
- [ ] **Step 2: Run** `TZ=UTC npx vitest run server/actions/items.test.ts -t placeIdeaAtStop` — expect FAIL (`placeIdeaAtStop` is not exported).
- [ ] **Step 3: Implement**, reusing the copy-in branch of `scheduleItem` (read it first: `server/actions/items.ts` ~511–610). Extract the shared field copy into a local helper `ideaCopyData(fullItem)` returning `{ sourceItemId, title, category, lat, lng, countryCode, address, link, notes, hiddenFromShares }` and use it in both places so they can't drift. Then:

```ts
export async function placeIdeaAtStop(
  itemId: string,
  stopId: string,
  forkId?: PlanId,
): Promise<ActionResult<{ placedItemId?: string }>> {
  const accessItem = await requireItemAccess(itemId);
  const fullItem = await db.item.findUnique({ where: { id: itemId } });
  if (!fullItem) notFound();
  const isWishlistIdea = fullItem.date === null && fullItem.stopId === null && fullItem.forkId === null;
  if (!isWishlistIdea) return { success: false, error: "Only a Wishlist idea can be added to a Stop." };

  const stop = await db.stop.findFirst({
    where: { id: stopId, tripId: accessItem.tripId, ...planScope(forkId) },
    select: { id: true },
  });
  if (!stop) return { success: false, error: "That Stop isn't in this plan." };

  const maxThing = await db.item.findFirst({
    where: { tripId: accessItem.tripId, ...planScope(forkId), stopId, date: null },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const placed = await db.item.create({
    data: {
      tripId: accessItem.tripId,
      forkId: forkId ?? null,
      ...ideaCopyData(fullItem),
      stopId,
      date: null,
      startTime: null,
      endTime: null,
      sortOrder: (maxThing?.sortOrder ?? -1) + 1,
    },
  });

  if (fullItem.photoAttachmentId) {
    const copiedPhotoId = await copyItemPhoto({
      tripId: accessItem.tripId,
      sourcePhotoAttachmentId: fullItem.photoAttachmentId,
      targetItemId: placed.id,
    });
    if (copiedPhotoId) {
      await db.item.update({ where: { id: placed.id }, data: { photoAttachmentId: copiedPhotoId } });
    }
  }

  await recordPlanActivity(forkId, {
    tripId: accessItem.tripId,
    verb: "CREATED",
    entityType: "ITEM",
    entityId: placed.id,
    entityLabel: entityLabel("ITEM", placed as unknown as Record<string, unknown>),
  });

  revalidateItemPaths(accessItem.tripId);
  return { success: true, placedItemId: placed.id };
}
```

  Match the file's actual `ActionResult` failure shape (check how `scheduleItem` returns errors and `lib/action-result.ts`); if `planScope` filters `forkId` differently for Stops, follow how `loadPlanStopsForOwnership` scopes Stops. If the codebase has an access-before-write assertion helper used by sibling actions (`expectAccessCheckedBeforeWrite` in tests), add the same test for this action.
- [ ] **Step 4: Run** `TZ=UTC npx vitest run server/actions/items.test.ts` — all PASS (including existing `scheduleItem` tests after the `ideaCopyData` extraction).
- [ ] **Step 5: Commit**

```bash
git add server/actions/items.ts server/actions/items.test.ts
git commit -m "feat(items): placeIdeaAtStop copies a Wishlist idea into a Stop's things to do

Same copy as Schedule (source link, coordinates, photo, share-hidden) with
no date, so the idea keeps its 'in this plan' marker (spec 2026-10-05 §E).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: [E3] WishlistBoard builds day options from the current Plan's Stops and adds ideas to a rough Stop's things to do

**Files:**
- Modify: `/work/components/trip/wishlist-board.tsx` (imports 1-24; `WishlistBoardProps` 36-72; destructure 78-96; add the memo and handler after `schedulingItem` state at 112; `<ScheduleItemDialog …>` at 405-418)
- Test: `/work/components/trip/wishlist-board.test.tsx` (the items mock at 20-23; the schedule-dialog mock at 91-97; the import line at 9; a new describe at the end)

**Interfaces:**
- Consumes: `scheduleDayOptions`, `DayOptionStop` (E1); the new `ScheduleItemDialog` props `dayOptions` / `onAddToThingsToDo` (E2); `createItem(tripId: string, input: ItemInput, forkId?: PlanId): Promise<ActionResult>` from `@/server/actions/items`; `toast` from `@/components/ui/use-toast`
- Produces: a new optional prop on `WishlistBoardProps`: `planStops?: DayOptionStop[]`, the current Plan's Stops (Fork-aware) with coordinates and dates. When it is absent, no day options are passed.

- [ ] **Step 1: Write the failing test.** In `/work/components/trip/wishlist-board.test.tsx`:

  (a) Change line 9 to `import { render, screen, cleanup, within, act } from "@testing-library/react";`

  (b) Change the items mock (20-23) to:
```tsx
vi.mock("@/server/actions/items", () => ({
  deleteItem: vi.fn().mockResolvedValue({ success: true }),
  addMarkerToWishlist: vi.fn().mockResolvedValue({ success: true }),
  createItem: vi.fn().mockResolvedValue({ success: true }),
}));
```
  (c) Replace the schedule-dialog capture and mock (91-97) with:
```tsx
// Capture forkId / day options so tests can inspect what was passed to the dialog.
const lastScheduleDialogProps: {
  forkId?: string | null;
  dayOptions?: unknown;
  onAddToThingsToDo?: (stopId: string) => Promise<unknown>;
} = {};

vi.mock("./schedule-item-dialog", () => ({
  ScheduleItemDialog: ({ open, itemTitle, forkId, dayOptions, onAddToThingsToDo }: {
    open: boolean;
    itemTitle: string;
    forkId?: string | null;
    dayOptions?: unknown;
    onAddToThingsToDo?: (stopId: string) => Promise<unknown>;
  }) => {
    lastScheduleDialogProps.forkId = forkId;
    lastScheduleDialogProps.dayOptions = dayOptions;
    lastScheduleDialogProps.onAddToThingsToDo = onAddToThingsToDo;
    return open ? <div role="dialog" aria-label="Schedule Item"><h2>Schedule Item</h2><p>{itemTitle}</p></div> : null;
  },
}));
```
  (d) After `import { WishlistBoard } from "./wishlist-board";`, add `import { createItem } from "@/server/actions/items";`

  (e) Append:
```tsx
describe("WishlistBoard — Schedule offers that place's days (spec 2026-10-05 §E)", () => {
  // `stops` (every Plan's, unfiltered) and `planStops` (the current Plan's)
  // deliberately disagree, so the test proves which one the dialog reads.
  const REAL_ROME = { id: "real-rome", name: "Rome", arriveDate: "2026-09-01", departDate: "2026-09-02" };
  const FORK_ROME = { id: "fork-rome", name: "Rome", lat: 41.9, lng: 12.5, arriveDate: "2026-09-19", departDate: "2026-09-21" };
  const FLORENCE_ROUGH = { id: "flo", name: "Florence", lat: 43.77, lng: 11.25, arriveDate: null, departDate: null };
  const COLOSSEUM = makeItem({ id: "idea-col", title: "Colosseum", date: null, startTime: null, endTime: null, stopId: null, stopName: null, lat: 41.89, lng: 12.49 });
  const UFFIZI = makeItem({
    id: "idea-uff", title: "Uffizi", date: null, startTime: null, endTime: null, stopId: null, stopName: null,
    lat: 43.768, lng: 11.255, address: "Piazzale degli Uffizi", link: "https://uffizi.it", notes: "Book ahead",
  });

  it("hands the dialog day options built from the current Plan's Stops (Fork active)", async () => {
    const user = userEvent.setup();
    render(
      <WishlistBoard
        tripId={TRIP_ID}
        stops={[REAL_ROME]}
        planStops={[FORK_ROME]}
        items={[COLOSSEUM]}
        activeForkId="fork-abc"
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Schedule Colosseum" }));
    await screen.findByRole("dialog", { name: "Schedule Item" });
    expect(lastScheduleDialogProps.dayOptions).toEqual({
      near: true,
      roughStop: null,
      stays: [{ stopId: "fork-rome", stopName: "Rome", days: ["2026-09-19", "2026-09-20", "2026-09-21"] }],
    });
  });

  it("no planStops → no day options (the plain date field)", async () => {
    const user = userEvent.setup();
    render(<WishlistBoard tripId={TRIP_ID} stops={[REAL_ROME]} items={[COLOSSEUM]} />);
    await user.click(await screen.findByRole("button", { name: "Schedule Colosseum" }));
    await screen.findByRole("dialog", { name: "Schedule Item" });
    expect(lastScheduleDialogProps.dayOptions).toBeUndefined();
  });

  it("Add to a rough Stop's things to do copies the idea into the active Plan via createItem (ADR 0022)", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Toaster />
        <WishlistBoard
          tripId={TRIP_ID}
          stops={[REAL_ROME]}
          planStops={[FLORENCE_ROUGH, FORK_ROME]}
          items={[UFFIZI]}
          activeForkId="fork-abc"
        />
      </>,
    );
    await user.click(await screen.findByRole("button", { name: "Schedule Uffizi" }));
    await screen.findByRole("dialog", { name: "Schedule Item" });
    expect(lastScheduleDialogProps.dayOptions).toMatchObject({ roughStop: { id: "flo", name: "Florence" } });

    await act(async () => {
      await lastScheduleDialogProps.onAddToThingsToDo!("flo");
    });
    expect(createItem).toHaveBeenCalledWith(
      TRIP_ID,
      expect.objectContaining({
        title: "Uffizi",
        category: "SIGHTSEEING",
        stopId: "flo",
        address: "Piazzale degli Uffizi",
        link: "https://uffizi.it",
        notes: "Book ahead",
      }),
      "fork-abc",
    );
    expect(await screen.findByText("Added to Florence's things to do")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** `cd /work && TZ=UTC npx vitest run components/trip/wishlist-board.test.tsx`. Expected: the 3 new tests fail. The first gets `expected undefined to deeply equal { near: true, … }`. The third gets `onAddToThingsToDo` undefined (`TypeError: … is not a function`). The second may already pass. Existing tests pass, and TypeScript in the test may flag `planStops` as an unknown prop; vitest does not type-check.

- [ ] **Step 3: Write the minimal implementation** in `/work/components/trip/wishlist-board.tsx`:

  (a) Imports. Replace `import { deleteItem } from "@/server/actions/items";` with:
```tsx
import { createItem, deleteItem } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import { scheduleDayOptions, type DayOptionStop } from "@/lib/schedule-day-options";
import type { ItemInput } from "@/lib/validations/item";
```
  (b) In `WishlistBoardProps`, after `stops: WishlistStop[];`:
```tsx
  /**
   * The CURRENT Plan's Stops (a Fork's own while one is active) with
   * coordinates and dates — the Schedule dialog offers their days (spec
   * 2026-10-05 §E). Absent = the plain date field.
   */
  planStops?: DayOptionStop[];
```
  (c) Add `planStops,` to the destructured parameters, after `stops,`.

  (d) Directly after the `handleDelete` function (under `// ── Handlers ──`), add:
```tsx
  // Spec 2026-10-05 §E: the days near this idea, on the current Plan.
  const dayOptions = React.useMemo(
    () => (schedulingItem && planStops ? scheduleDayOptions(schedulingItem, planStops) : undefined),
    [schedulingItem, planStops],
  );

  // The nearest Stop is rough: copy the idea into its things to do through
  // the ADR 0022 "Add a thing to do" path (createItem with a stopId and no
  // date), on the active Plan. The idea itself stays in the Wishlist.
  async function addIdeaToThingsToDo(idea: ItemCardItem, stopId: string) {
    const result = await createItem(
      tripId,
      {
        title: idea.title,
        category: idea.category as ItemInput["category"],
        stopId,
        address: idea.address ?? undefined,
        link: idea.link ?? undefined,
        booking: idea.booking ?? undefined,
        notes: idea.notes ?? undefined,
        hiddenFromShares: idea.hiddenFromShares ?? false,
      },
      activeForkId ?? undefined,
    );
    if (result.success) {
      const stopName = planStops?.find((s) => s.id === stopId)?.name ?? "the Stop";
      toast({ title: `Added to ${stopName}'s things to do` });
    }
    return result;
  }
```
  (e) In the `<ScheduleItemDialog …>` block (405-418), add two props after `forkId={activeForkId}`:
```tsx
          dayOptions={dayOptions}
          onAddToThingsToDo={(stopId) => addIdeaToThingsToDo(schedulingItem, stopId)}
```

- [ ] **Step 4: Run it and confirm it passes.** `cd /work && TZ=UTC npx vitest run components/trip/wishlist-board.test.tsx components/plan/banned-classes.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**
```bash
cd /work && git add components/trip/wishlist-board.tsx components/trip/wishlist-board.test.tsx && git commit -m "feat(wishlist): board hands Schedule the current Plan's day options and a rough Stop's things to do

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: [E4] Wishlist page loads the current Plan's Stops (Fork-aware)

**Files:**
- Modify: `/work/app/(app)/trips/[tripId]/wishlist/page.tsx` (import at line 5; add the query after `const activeForkId = …` around line 96; `<WishlistBoard …>` at 332-349)
- Test: `/work/app/(app)/trips/[tripId]/wishlist/page.test.tsx` (hoisted mocks 7-17, db mock 19-30, board mock 41-43, `renderPage` 47-52, new describe at the end)

**Interfaces:**
- Consumes: `planScope(forkId?: PlanId): { forkId: string | null }` from `@/lib/plan-scope`; `WishlistBoard`'s `planStops` prop (E3)
- Produces: `db.stop.findMany({ where: { tripId, forkId }, orderBy: { sortOrder: "asc" }, select: { id, name, lat, lng, arriveDate, departDate } })`, passed to the board as `planStops`

- [ ] **Step 1: Write the failing test.** In `/work/app/(app)/trips/[tripId]/wishlist/page.test.tsx`:

  (a) Add `stopFindManyMock: vi.fn().mockResolvedValue([])` and `boardProps: {} as Record<string, unknown>` to the `vi.hoisted` object, and to the destructured names: `…, attachmentFindManyMock, stopFindManyMock, boardProps }`.

  (b) Add `stop: { findMany: stopFindManyMock },` to the `db` mock.

  (c) Replace the board mock with:
```tsx
vi.mock("@/components/trip/wishlist-board", () => ({
  WishlistBoard: (props: Record<string, unknown>) => {
    Object.assign(boardProps, props);
    return <div data-testid="wishlist-board" />;
  },
}));
```
  (d) Replace `renderPage` with:
```tsx
async function renderPage(searchParams: { plan?: string } = {}) {
  render(await WishlistPage({
    params: Promise.resolve({ tripId: "t1" }),
    searchParams: Promise.resolve(searchParams),
  }));
}
```
  (e) In `beforeEach`, add `stopFindManyMock.mockResolvedValue([]);` and `for (const k of Object.keys(boardProps)) delete boardProps[k];`

  (f) Append:
```tsx
describe("WishlistPage — the current Plan's Stops for Schedule (spec 2026-10-05 §E)", () => {
  const ROW = { id: "s1", name: "Rome", lat: 41.9, lng: 12.5, arriveDate: "2026-07-01", departDate: "2026-07-04" };

  it("real plan: loads forkId-null Stops and hands them to the board", async () => {
    stopFindManyMock.mockResolvedValue([ROW]);
    await renderPage();
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "t1", forkId: null }, orderBy: { sortOrder: "asc" } }),
    );
    expect(boardProps.planStops).toEqual([ROW]);
  });

  it("Fork active: loads that Fork's Stops", async () => {
    tripFindUniqueMock.mockResolvedValue({
      id: "t1", name: "Europe", startDate: "2026-07-01", endDate: "2026-07-20",
      homeCurrency: "USD", forksEnabled: true, stops: [], items: [],
    });
    forkFindFirstMock.mockResolvedValue({ id: "fork-1", name: "Italy first" });
    await renderPage({ plan: "fork-1" });
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "t1", forkId: "fork-1" } }),
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** `cd /work && TZ=UTC npx vitest run "app/(app)/trips/[tripId]/wishlist/page.test.tsx"`. Expected: the 2 new tests fail with `expected "spy" to be called with arguments … Number of calls: 0`. The existing PageHeader test passes.

- [ ] **Step 3: Write the minimal implementation** in `/work/app/(app)/trips/[tripId]/wishlist/page.tsx`:

  (a) Change line 5 to `import { resolvePlan, REAL_PLAN, planScope } from "@/lib/plan-scope";`

  (b) Directly after `const activeForkId = activeFork ? activeFork.id : null;`:
```tsx
  // Spec 2026-10-05 §E: Schedule offers the CURRENT Plan's days — a Fork's
  // own Stops while one is active. `trip.stops` above is every Plan's.
  const planStops = await db.stop.findMany({
    where: { tripId, ...planScope(activeForkId) },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, lat: true, lng: true, arriveDate: true, departDate: true },
  });
```
  (c) In `<WishlistBoard …>`, after `stops={trip.stops}`, add `planStops={planStops}`.

- [ ] **Step 4: Run it and confirm it passes.** `cd /work && TZ=UTC npx vitest run "app/(app)/trips/[tripId]/wishlist" components/trip/wishlist-board.test.tsx components/trip/schedule-item-dialog.test.tsx lib/schedule-day-options.test.ts components/plan/banned-classes.test.ts && npx tsc --noEmit -p .`. Expected: all PASS, and tsc exits 0.

- [ ] **Step 5: Commit**
```bash
cd /work && git add "app/(app)/trips/[tripId]/wishlist/page.tsx" "app/(app)/trips/[tripId]/wishlist/page.test.tsx" && git commit -m "feat(wishlist): Schedule offers the days you're near that place, on the current Plan

Wishlist page loads the current Plan's Stops (Fork-aware) for the Schedule
dialog's day chips (spec 2026-10-05 §E).

Resolves-Feedback: cmutbubrw000004l2g7ev7p8y
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Part F: Metro-line transport legs

Decisions made while drafting:
- **Travel order is the slot's existing order.** `groupTransportsBySlot` sorts by `sortOrder` (what the 2026-10-04 §D Transport position picker writes). `LegRow` keeps the order of its children, so no re-sorting happens.
- **When a change-over is known.** It is known when the previous leg's `arrPlace` equals this leg's `depPlace`, compared trimmed and case-insensitively. The text reads "Change at {previous leg's arrPlace}" and sits above the later leg's pill, next to its dot. No new data and no Stop-id matching.
- **Station dots appear only for `kind="legs"`.** The dashed "missing" prompt and the bare line get no dot.
- **Bookend rows (outbound/return) each hold a single leg,** so they pick up the dot through `LegRow` with no call-site change.

---

### Task 18: [F1] `changeoverPlaces` helper

**Files:**
- Modify: `/work/lib/plan/leg-label.ts` (add an export after `legSlotKind`, end of file)
- Test: `/work/lib/plan/leg-label.test.ts` (import line 3; new describe at the end)

**Interfaces:**
- Consumes: `LegTransport` (same file)
- Produces: `export function changeoverPlaces(legs: readonly Pick<LegTransport, "depPlace" | "arrPlace">[]): (string | null)[]`. The output has the same length as `legs`; index 0 is always `null`; index i is the change-over place between leg i-1 and leg i.

- [ ] **Step 1: Write the failing test.** Change line 3 of `/work/lib/plan/leg-label.test.ts` to `import { changeoverPlaces, legLabel, legSlotKind, missingLegLabel, placeCode } from "./leg-label";` and append:

```ts
describe("changeoverPlaces (spec 2026-10-05 §F)", () => {
  it("names the place where one leg arrives and the next departs", () => {
    expect(
      changeoverPlaces([
        { depPlace: "Paris Gare de Lyon", arrPlace: "Milano Centrale" },
        { depPlace: "Milano Centrale", arrPlace: "Roma Termini" },
      ]),
    ).toEqual([null, "Milano Centrale"]);
  });

  it("matches trimmed and case-insensitively, showing the arriving leg's spelling", () => {
    expect(changeoverPlaces([{ arrPlace: " Milano Centrale " }, { depPlace: "milano centrale" }])).toEqual([null, "Milano Centrale"]);
  });

  it("three legs: each change-over sits with the leg that leaves from it", () => {
    expect(
      changeoverPlaces([
        { arrPlace: "Milano Centrale" },
        { depPlace: "Milano Centrale", arrPlace: "Bologna" },
        { depPlace: "Bologna" },
      ]),
    ).toEqual([null, "Milano Centrale", "Bologna"]);
  });

  it("unknown or mismatched places show nothing", () => {
    expect(changeoverPlaces([{ arrPlace: "Milano Centrale" }, { depPlace: "Milano Rogoredo" }])).toEqual([null, null]);
    expect(changeoverPlaces([{ arrPlace: null }, { depPlace: null }])).toEqual([null, null]);
    expect(changeoverPlaces([{ arrPlace: "Milano Centrale" }, {}])).toEqual([null, null]);
    expect(changeoverPlaces([{ arrPlace: "  " }, { depPlace: "  " }])).toEqual([null, null]);
  });

  it("a single leg or none has no change-over", () => {
    expect(changeoverPlaces([{ depPlace: "CDG", arrPlace: "FCO" }])).toEqual([null]);
    expect(changeoverPlaces([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** `cd /work && TZ=UTC npx vitest run lib/plan/leg-label.test.ts`. Expected: FAIL with `changeoverPlaces is not a function` (or `does not provide an export named 'changeoverPlaces'`).

- [ ] **Step 3: Write the minimal implementation.** Append to `/work/lib/plan/leg-label.ts`:

```ts
/**
 * Spec 2026-10-05 §F: the change-over place between consecutive legs on one
 * strip, only where the data already says so — leg i-1's arrival place equals
 * leg i's departure place (trimmed, case-insensitive). Index i belongs to
 * leg i (the one leaving from it); index 0 is always null. No new data.
 */
export function changeoverPlaces(
  legs: readonly Pick<LegTransport, "depPlace" | "arrPlace">[],
): (string | null)[] {
  return legs.map((leg, i) => {
    if (i === 0) return null;
    const arrived = legs[i - 1].arrPlace?.trim();
    const leaving = leg.depPlace?.trim();
    if (!arrived || !leaving) return null;
    return arrived.toLowerCase() === leaving.toLowerCase() ? arrived : null;
  });
}
```

- [ ] **Step 4: Run it and confirm it passes.** `cd /work && TZ=UTC npx vitest run lib/plan/leg-label.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**
```bash
cd /work && git add lib/plan/leg-label.ts lib/plan/leg-label.test.ts && git commit -m "feat(plan): changeoverPlaces — where consecutive legs already meet

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: [F2] `LegRow` stacks legs metro-style with station dots and change-over text

**Files:**
- Modify: `/work/components/plan/leg-pill.tsx` (`LegRowProps` and `LegRow`, lines 8-32)
- Test: `/work/components/plan/leg-pill.test.tsx` (new describe at the end)

**Interfaces:**
- Consumes: none new
- Produces: a new optional prop `LegRowProps.changeovers?: readonly (string | null)[]` (per child, from `changeoverPlaces`). The DOM hooks are:
  - `[data-leg-stack]`: the vertical column
  - `[data-leg-station]`: one per child, in order
  - `[data-station-dot]`: one per station, only when `kind="legs"`
  - `[data-changeover]`: "Change at {place}"

- [ ] **Step 1: Write the failing test.** Append to `/work/components/plan/leg-pill.test.tsx`:

```tsx
const TRAIN_A = { icon: Plane, label: "Train", sub: "Tue 15 Dec", missing: false, accessibleName: "Train from Paris to Milano Centrale. Edit." };
const TRAIN_B = { icon: Plane, label: "Train", sub: "Tue 15 Dec", missing: false, accessibleName: "Train from Milano Centrale to Bologna. Edit." };
const TRAIN_C = { icon: Plane, label: "Train", sub: "Tue 15 Dec", missing: false, accessibleName: "Train from Bologna to Rome. Edit." };

describe("LegRow — metro line (spec 2026-10-05 §F)", () => {
  it("a single leg looks as it does now, plus its station dot", () => {
    const { container } = render(<LegRow kind="legs"><LegPill label={FLIGHT} onClick={vi.fn()} /></LegRow>);
    expect(container.querySelectorAll("[data-leg-station]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-station-dot]")).toHaveLength(1);
    expect(container.querySelector("[data-changeover]")).toBeNull();
    const pill = screen.getByRole("button", { name: FLIGHT.accessibleName });
    expect(pill.className).toContain("h-[34px]");
    expect(container.querySelector("[data-station-dot]")).toHaveAttribute("aria-hidden");
  });

  it("three legs stack vertically, one per line, in the order given, each with a dot", () => {
    const { container } = render(
      <LegRow kind="legs">
        <LegPill key="a" label={TRAIN_A} onClick={vi.fn()} />
        <LegPill key="b" label={TRAIN_B} onClick={vi.fn()} />
        <LegPill key="c" label={TRAIN_C} onClick={vi.fn()} />
      </LegRow>,
    );
    const stack = container.querySelector("[data-leg-stack]") as HTMLElement;
    expect(stack.className).toContain("flex-col");
    expect(stack.className).not.toContain("flex-wrap");
    const stations = [...container.querySelectorAll("[data-leg-station]")] as HTMLElement[];
    expect(stations.map((s) => within(s).getByRole("button").getAttribute("aria-label"))).toEqual([
      TRAIN_A.accessibleName,
      TRAIN_B.accessibleName,
      TRAIN_C.accessibleName,
    ]);
    expect(container.querySelectorAll("[data-station-dot]")).toHaveLength(3);
  });

  it("a known change-over shows as small text by that leg's dot", () => {
    const { container } = render(
      <LegRow kind="legs" changeovers={[null, "Milano Centrale", null]}>
        <LegPill key="a" label={TRAIN_A} onClick={vi.fn()} />
        <LegPill key="b" label={TRAIN_B} onClick={vi.fn()} />
        <LegPill key="c" label={TRAIN_C} onClick={vi.fn()} />
      </LegRow>,
    );
    const stations = [...container.querySelectorAll("[data-leg-station]")] as HTMLElement[];
    const note = within(stations[1]).getByText("Change at Milano Centrale");
    expect(note).toHaveAttribute("data-changeover");
    expect(note.className).toContain("text-muted-foreground");
    expect(stations[0].querySelector("[data-changeover]")).toBeNull();
    expect(stations[2].querySelector("[data-changeover]")).toBeNull();
  });

  it("an unknown change-over shows nothing", () => {
    const { container } = render(
      <LegRow kind="legs" changeovers={[null, null]}>
        <LegPill key="a" label={TRAIN_A} onClick={vi.fn()} />
        <LegPill key="b" label={TRAIN_B} onClick={vi.fn()} />
      </LegRow>,
    );
    expect(container.querySelector("[data-changeover]")).toBeNull();
    expect(container.querySelectorAll("[data-station-dot]")).toHaveLength(2);
  });

  it("compact and desktop each centre the dot on their own connector", () => {
    const { container, rerender } = render(<LegRow kind="legs"><LegPill label={FLIGHT} onClick={vi.fn()} /></LegRow>);
    expect(container.querySelector("[data-leg-stack]")!.className).toContain("ml-[18px]");
    expect(container.querySelector("[data-station-dot]")!.className).toContain("left-[-19px]");
    rerender(<LegRow kind="legs" compact><LegPill label={FLIGHT} onClick={vi.fn()} compact /></LegRow>);
    expect(container.querySelector("[data-leg-stack]")!.className).toContain("ml-3");
    expect(container.querySelector("[data-station-dot]")!.className).toContain("left-[-13px]");
  });

  it("the missing prompt and the bare line get no dot", () => {
    const { container, rerender } = render(<LegRow kind="missing"><LegPill label={MISSING} onClick={vi.fn()} /></LegRow>);
    expect(container.querySelector("[data-station-dot]")).toBeNull();
    expect(screen.getByRole("button", { name: MISSING.accessibleName })).toBeInTheDocument();
    rerender(<LegRow kind="line" />);
    expect(container.querySelector("[data-leg-stack]")).toBeNull();
  });
});
```
  Also change line 2's import to `import { render, screen, within } from "@testing-library/react";`.

- [ ] **Step 2: Run it and confirm it fails.** `cd /work && TZ=UTC npx vitest run components/plan/leg-pill.test.tsx`. Expected: the existing 5 tests pass. The new tests fail with `expected [] to have a length of 1` (no `[data-leg-station]`) and `Cannot read properties of null (reading 'className')`.

- [ ] **Step 3: Write the minimal implementation.** In `/work/components/plan/leg-pill.tsx`, replace lines 8-32 (`LegRowProps` and `LegRow`) with:

```tsx
export interface LegRowProps {
  kind: "legs" | "missing" | "line";
  compact?: boolean;
  children?: React.ReactNode;
  /**
   * Spec 2026-10-05 §F: per child, the change-over place shown by its station
   * dot (`changeoverPlaces` in lib/plan/leg-label). Null/absent = nothing.
   */
  changeovers?: readonly (string | null)[];
}

/**
 * The vertical strip between two Stops (PLAN.md §2): a connector line plus,
 * when there are legs to show, the pill(s) riding on it — stacked one per
 * line in travel order, metro-style, each beside a station dot on the
 * connector (spec 2026-10-05 §F). Rough-to-rough gaps pass no children —
 * dashed connector only, no pill. The missing prompt gets no dot.
 */
export function LegRow({ kind, compact, children, changeovers }: LegRowProps) {
  const stations = React.Children.toArray(children);
  return (
    <div data-leg-kind={kind} className={cn("flex items-stretch", compact ? "min-h-10" : "min-h-[52px]")}>
      <span
        data-connector
        aria-hidden
        className={cn("shrink-0 border-l-2 border-border", compact ? "ml-5" : "ml-[26px]", kind !== "legs" && "border-dashed")}
      />
      {stations.length > 0 ? (
        <div data-leg-stack className={cn("flex min-w-0 flex-col items-start gap-1.5 py-2", compact ? "ml-3" : "ml-[18px]")}>
          {stations.map((node, i) => {
            const changeover = changeovers?.[i] ?? null;
            return (
              <div
                key={React.isValidElement(node) && node.key != null ? node.key : i}
                data-leg-station
                className="flex flex-col items-start gap-0.5"
              >
                {changeover ? (
                  <span data-changeover className="text-[11px] font-semibold leading-tight text-muted-foreground">
                    Change at {changeover}
                  </span>
                ) : null}
                <div className="relative">
                  {kind === "legs" ? (
                    // Centred on the connector: compact line centre is 21px from
                    // the row's left, the stack starts at 34px (ml-5 + 2px + ml-3);
                    // desktop 27px vs 46px (ml-[26px] + 2px + ml-[18px]).
                    <span
                      data-station-dot
                      aria-hidden
                      className={cn(
                        "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-border bg-card",
                        compact ? "left-[-13px]" : "left-[-19px]",
                      )}
                    />
                  ) : null}
                  {node}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run it and confirm it passes.** `cd /work && TZ=UTC npx vitest run components/plan/leg-pill.test.tsx components/plan/motion.test.tsx components/plan/banned-classes.test.ts components/trip/itinerary-manager.test.tsx`. Expected: PASS. The existing itinerary-manager leg tests still find their pills by role and name.

- [ ] **Step 5: Commit**
```bash
cd /work && git add components/plan/leg-pill.tsx components/plan/leg-pill.test.tsx && git commit -m "feat(plan): LegRow stacks legs metro-style with station dots and change-over text

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: [F3] Itinerary manager passes change-overs on every multi-leg strip (desktop and phone)

**Files:**
- Modify: `/work/components/trip/itinerary-manager.tsx`:
  - line 27: import
  - after `renderLegPill`, at 1603-1615: new `renderLegStack`
  - `legNodes`, 1624 and 1627
  - mobile head legs, 1977
  - desktop head legs, 2115
- Test: `/work/components/trip/itinerary-manager.test.tsx` (new describe appended at the end of the file)

**Interfaces:**
- Consumes: `changeoverPlaces` (F1); `LegRow.changeovers` (F2)
- Produces: `function renderLegStack(legs: ItineraryTransport[], compact?: boolean): JSX.Element`, internal to `ItineraryManager`. The bookend rows (1962, 2026, 2100, 2197) are unchanged: one leg each, and they get the dot through `LegRow`.

- [ ] **Step 1: Write the failing test.** Append to `/work/components/trip/itinerary-manager.test.tsx`. It uses the file-scope `PARIS` (`par`) and `ROME` (`rom`) consts, `makeTransport`, `renderPlan`, `baseProps`.

```tsx
describe("metro-line legs (spec 2026-10-05 §F)", () => {
  const legA = makeTransport({ id: "leg-a", mode: "TRAIN", fromStopId: "par", anchorStopId: "par", arrPlace: "Milano Centrale", sortOrder: 0 });
  const legB = makeTransport({ id: "leg-b", mode: "TRAIN", toStopId: "rom", anchorStopId: "par", depPlace: "Milano Centrale", sortOrder: 1 });

  it.each([["plan-desktop-list"], ["plan-mobile-list"]])(
    "%s: legs stack in travel order, a dot each, the change-over by the second",
    (testId) => {
      // Passed out of order: the strip follows sortOrder, not array order.
      renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} initialTransports={[legB, legA]} />);
      const row = screen.getByTestId(testId).querySelector("[data-leg-kind='legs']") as HTMLElement;
      const stations = [...row.querySelectorAll("[data-leg-station]")] as HTMLElement[];
      expect(stations).toHaveLength(2);
      expect(within(stations[0]).getByRole("button", { name: /^Train from Paris to Milano Centrale/ })).toBeInTheDocument();
      expect(within(stations[1]).getByRole("button", { name: /^Train from Milano Centrale to Rome/ })).toBeInTheDocument();
      expect(row.querySelectorAll("[data-station-dot]")).toHaveLength(2);
      expect(within(stations[1]).getByText("Change at Milano Centrale")).toBeInTheDocument();
      expect(stations[0].querySelector("[data-changeover]")).toBeNull();
    },
  );

  it("an unknown change-over place shows nothing", () => {
    const elsewhere = { ...legB, depPlace: "Milano Rogoredo" };
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} initialTransports={[legA, elsewhere]} />);
    expect(document.querySelector("[data-changeover]")).toBeNull();
    expect(screen.getByTestId("plan-desktop-list").querySelectorAll("[data-station-dot]")).toHaveLength(2);
  });

  it("a single outbound bookend leg keeps its one pill and gains its dot", () => {
    const outbound = makeTransport({ id: "out", depIsHome: true, toStopId: "par" });
    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} initialTransports={[outbound]} homeBaseName="Sydney" roundTrip={false} />,
    );
    const pill = desktop().getByRole("button", { name: /^Flight from Sydney to Paris/ });
    const station = pill.closest("[data-leg-station]") as HTMLElement;
    expect(station.querySelector("[data-station-dot]")).not.toBeNull();
    expect(station.querySelector("[data-changeover]")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** `cd /work && TZ=UTC npx vitest run components/trip/itinerary-manager.test.tsx -t "metro-line legs"`. Expected: the two `it.each` cases fail with `Unable to find an element with the text: Change at Milano Centrale`. The unknown-place and bookend cases already pass after F2. That is fine: they guard against regressions.

- [ ] **Step 3: Write the minimal implementation** in `/work/components/trip/itinerary-manager.tsx`:

  (a) Change line 27 to `import { changeoverPlaces, legLabel, missingLegLabel, legSlotKind } from "@/lib/plan/leg-label";`

  (b) Directly after the `renderLegPill` function (ends around line 1615), add:
```tsx
  // A strip of one or more legs, metro-style (spec 2026-10-05 §F): legs stack
  // in slot (travel) order and a change-over shows only where one leg's
  // arrival place is already the next one's departure place.
  function renderLegStack(legs: ItineraryTransport[], compact?: boolean) {
    return (
      <LegRow kind="legs" compact={compact} changeovers={changeoverPlaces(legs)}>
        {legs.map((t) => renderLegPill(t, compact))}
      </LegRow>
    );
  }
```
  (c) In `legNodes`, replace
```tsx
    if (!next) return legs.length > 0 ? <LegRow kind="legs" compact={compact}>{legs.map((t) => renderLegPill(t, compact))}</LegRow> : null;
```
  with
```tsx
    if (!next) return legs.length > 0 ? renderLegStack(legs, compact) : null;
```
  and replace
```tsx
        return <LegRow kind="legs" compact={compact}>{legs.map((t) => renderLegPill(t, compact))}</LegRow>;
```
  with
```tsx
        return renderLegStack(legs, compact);
```
  (d) Mobile head legs (around line 1977). Replace
```tsx
          {headLegs.length > 0 && <LegRow kind="legs" compact>{headLegs.map((t) => renderLegPill(t, true))}</LegRow>}
```
  with
```tsx
          {headLegs.length > 0 && renderLegStack(headLegs, true)}
```
  (e) Desktop head legs (around line 2115). Replace
```tsx
              {headLegs.length > 0 && <LegRow kind="legs">{headLegs.map((t) => renderLegPill(t))}</LegRow>}
```
  with
```tsx
              {headLegs.length > 0 && renderLegStack(headLegs)}
```

- [ ] **Step 4: Run it and confirm it passes.** `cd /work && TZ=UTC npx vitest run components/trip/itinerary-manager.test.tsx components/plan lib/plan && npx tsc --noEmit -p .`. Expected: all PASS, and tsc exits 0.

- [ ] **Step 5: Commit**
```bash
cd /work && git add components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx && git commit -m "feat(plan): multi-leg transport stacks metro-style on the connector

Every leg strip (between Stops, before the first, and the outbound/return
bookends) stacks its legs one per line in travel order with a station dot;
a change-over place shows where one leg already arrives where the next
departs (spec 2026-10-05 §F).

Resolves-Feedback: cmutb5cd5000504jugb51nurn
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Parts D and G — stay detail view, roomier edit forms, clickable Stop rows, stay chip

Spec: `docs/specs/2026-10-05-feedback-batch-resolved-panel-deadline-stays-schedule.md` §D, §G.
Order: D1 → D2 → D3 → D4 → D5 → D6 → G1 → G2. G2 needs D2/D3's stay view, and `stayView.accommodationId` must already be nullable (D3).

Context the tasks rely on (checked against the tree at b06ca9f0):
- `StayDialog` (`components/plan/stay-dialog.tsx`, 32 lines) today hosts `AccommodationRow`s with one row `defaultOpen`. It's wired in `components/trip/itinerary-manager.tsx` ~L2415–2426, with state `stayView` at L665. The stay panel's block calls `onOpenAccommodation` → `setStayView` (L1797).
- `AccommodationFormDialog`, `ItemFormDialog` and `TransportFormDialog` already pass `size="lg"` to `FormDialog`. Accommodation and Item already pair dates, times and address + confirmation/link in `sm:col-span-2 grid gap-4 sm:grid-cols-2` sub-grids. Still to do: `StopFormDialog` (still `md`, every field stacked), the cost block (`InlineCostFields`, flat siblings), Item's lone Booking reference, Transport's single column (mode tiles 3×2, Booking ref alone, Position in plan last).
- The `AccommodationFormDialog` has no Delete, and its inline cost hides when there is more than one Cost. Until now the stay dialog's `AccommodationCard` covered both (CardActionCluster delete/notes/attachments, CostEditor). The detail view keeps them so nothing regresses.
- `MapLink` (`components/trip/map-link.tsx`, built on `lib/maps.ts` `mapsUrl`) and `AttachmentLinks` (`components/trip/attachment-links.tsx`, read-only links) are reused.
- The drag listeners sit only on the grip button (`SortableStop`, itinerary-manager L265–307). Sensors are at L572–576: Pointer `distance: 6`, Touch `delay: 200, tolerance: 8`. `StopRow` is desktop-only (`plan-desktop-list`, `hidden lg:flex`). Phones use `MobileStopRow` and the stop sheet, which this part leaves alone.
- Layout audit: `npm run audit:layout` (`scripts/layout-audit.ts`) needs `next dev` and globally installed Playwright (`NODE_PATH=/usr/local/lib/node_modules`). Its desktop viewports are 900px tall, so D6 also runs a small scratchpad script at exactly 1920×911 and 1280×800.

---

### Task 21: [D1] "{n} of {m} nights" helper for one stay

**Files:**
- Modify: `lib/plan/plan-model.ts` (insert after `stayWindowLabel`, after L98)
- Test: `lib/plan/plan-model.test.ts` (import list L4–7; new `describe` appended at end of file)

**Interfaces:**
- Consumes: `nightsBetween` (`@/lib/dates`, already imported), the file-local `plural`.
- Produces:
  - `export function stayNightsOfStop(stop: { arriveDate: string | null; departDate: string | null }, a: { checkIn: string; checkOut: string }): { nights: number; total: number } | null`
  - `export function stayNightsLabel(c: { nights: number; total: number }): string`

- [ ] **Step 1: Write the failing test.** In `lib/plan/plan-model.test.ts`, change the import line `  stayCostLabel, stayCoverage, stayCoverageLine, stayStatus, stayWindowLabel, tripEyebrow,` to `  stayCostLabel, stayCoverage, stayCoverageLine, stayNightsLabel, stayNightsOfStop, stayStatus, stayWindowLabel, tripEyebrow,`, then append:

```ts
describe("stayNightsOfStop / stayNightsLabel (spec 2026-10-05 §D)", () => {
  const ROME = { arriveDate: "2026-12-15", departDate: "2026-12-20" }; // 5 nights

  it("counts this stay's nights inside the Stop, out of the Stop's nights", () => {
    const c = stayNightsOfStop(ROME, { checkIn: "2026-12-15", checkOut: "2026-12-18" });
    expect(c).toEqual({ nights: 3, total: 5 });
    expect(stayNightsLabel(c!)).toBe("3 of 5 nights");
  });

  it("clips a stay that runs past either end of the Stop", () => {
    expect(stayNightsOfStop(ROME, { checkIn: "2026-12-13", checkOut: "2026-12-22" })).toEqual({ nights: 5, total: 5 });
    expect(stayNightsOfStop(ROME, { checkIn: "2026-11-01", checkOut: "2026-11-03" })).toEqual({ nights: 0, total: 5 });
  });

  it("singular for a one-night Stop, Same-day for a day visit, null for a rough Stop", () => {
    expect(stayNightsLabel({ nights: 1, total: 1 })).toBe("1 of 1 night");
    expect(stayNightsLabel({ nights: 0, total: 0 })).toBe("Same-day");
    expect(stayNightsOfStop({ arriveDate: null, departDate: null }, { checkIn: "2026-12-15", checkOut: "2026-12-16" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `TZ=UTC npx vitest run lib/plan/plan-model.test.ts`. Expected: the new `describe` fails with `TypeError: stayNightsOfStop is not a function` (the import resolves to undefined) and every other test passes.

- [ ] **Step 3: Implement.** In `lib/plan/plan-model.ts`, directly after `stayWindowLabel` (after L98):

```ts
/**
 * Spec 2026-10-05 §D: one Accommodation's nights inside its Stop's window,
 * out of the Stop's nights — the stay detail view's "3 of 5 nights". A stay
 * running past either end is clipped to the Stop. Null for a rough Stop.
 */
export function stayNightsOfStop(
  stop: { arriveDate: string | null; departDate: string | null },
  a: { checkIn: string; checkOut: string },
): { nights: number; total: number } | null {
  if (!stop.arriveDate || !stop.departDate) return null;
  const total = nightsBetween(stop.arriveDate, stop.departDate);
  const from = a.checkIn > stop.arriveDate ? a.checkIn : stop.arriveDate;
  const to = a.checkOut < stop.departDate ? a.checkOut : stop.departDate;
  return { nights: to > from ? nightsBetween(from, to) : 0, total };
}

/** "3 of 5 nights" / "1 of 1 night" / "Same-day" (a day-visit Stop has no nights). */
export function stayNightsLabel(c: { nights: number; total: number }): string {
  if (c.total === 0) return "Same-day";
  return `${c.nights} of ${plural(c.total, "night")}`;
}
```

- [ ] **Step 4: Run it and watch it pass.** `TZ=UTC npx vitest run lib/plan/plan-model.test.ts`. Expected: all tests pass.

- [ ] **Step 5: Commit.**
```bash
git add lib/plan/plan-model.ts lib/plan/plan-model.test.ts
git commit -m "$(cat <<'EOF'
feat(plan): stayNightsOfStop — one stay's nights out of its Stop's

Spec 2026-10-05 §D: the stay detail view's "3 of 5 nights", clipped to the
Stop's window.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 22: [D2] StayDialog becomes a large detail view with stay chips

**Files:**
- Modify (full rewrite): `components/plan/stay-dialog.tsx` (L1–32)
- Test (full rewrite): `components/plan/stay-dialog.test.tsx` (L1–15)

**Interfaces:**
- Consumes: `stayNightsOfStop`, `stayNightsLabel`, `stayCostLabel`, `costPaidState` (`@/lib/plan/plan-model`); `formatDayLabel` (`@/lib/dates`); `MapLink`; `AttachmentLinks`; `CardActionCluster`; `CostEditor`; `Dialog`/`DialogContent size="lg"`/`DialogFooter`; types `AccommodationCardAccommodation`, `AttachmentView`, `NoteView`, `CostRow`.
- Produces:
  - `export interface StayDetailAccommodation extends AccommodationCardAccommodation { costs?: CostRow[]; attachments?: AttachmentView[]; noteThread?: NoteView[] }`
  - `export interface StayDialogProps { open: boolean; onOpenChange(open: boolean): void; stopName: string; stop: { arriveDate: string | null; departDate: string | null }; stays: StayDetailAccommodation[]; selectedId: string | null; homeCurrency?: string; tripId?: string; currentUserId?: string; forkId?: string | null; pendingId?: string | null; onEdit(a: StayDetailAccommodation): void; onDelete?(id: string): void; onAdd?: () => void }`
  - `export function StayDialog(props: StayDialogProps)`. The `rows` prop is gone; D3 updates the only caller.
  - DOM hooks: `data-testid="stay-detail"`, `"stay-facts"`, `"stay-empty"`, `"stay-cost-editor"`; chip group `role="group"` named `Stays in {stop}` with `aria-pressed` chips.

- [ ] **Step 1: Write the failing test.** Replace `components/plan/stay-dialog.test.tsx` with:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// CardActionCluster / CostEditor pull in server actions (next-auth) — stub them.
vi.mock("@/server/actions/costs", () => ({ createCost: vi.fn(), updateCost: vi.fn(), deleteCost: vi.fn() }));
vi.mock("@/server/actions/notes", () => ({ addNote: vi.fn(), deleteNote: vi.fn() }));
vi.mock("@/server/actions/attachments", () => ({ uploadAttachment: vi.fn(), deleteAttachment: vi.fn() }));

import { StayDialog, type StayDetailAccommodation, type StayDialogProps } from "./stay-dialog";
import { formatMoney } from "@/lib/money";

const ROME = { arriveDate: "2026-12-15", departDate: "2026-12-20" }; // 5 nights

const cost = (over = {}) => ({
  id: "c1", costMinor: 54000, paidMinor: 54000, currency: "EUR", rateToHome: null, paidAt: new Date("2026-10-01"),
  dueDate: null, ownerType: "ACCOMMODATION", ownerId: "a1", label: null, category: null, settlement: "BEFORE", ...over,
});

const ARTEMIDE: StayDetailAccommodation = {
  id: "a1",
  stopId: "r",
  name: "Hotel Artemide",
  address: "Via Nazionale 22, Roma",
  checkIn: "2026-12-15",
  checkOut: "2026-12-18",
  checkInTime: "15:00",
  checkOutTime: "11:00",
  confirmation: "ART-881",
  notes: "Late check-in desk\nAsk for a quiet room",
  lat: 41.9,
  lng: 12.49,
  costs: [cost()],
  attachments: [
    { id: "f1", filename: "artemide.pdf", mime: "application/pdf", size: 10, url: "/api/attachments/f1", uploadedById: "u1", createdAt: new Date("2026-06-01") },
  ],
  noteThread: [],
};

// No address, no booking ref, no cost, no notes (FB-09: no map link without an address).
const TRASTEVERE: StayDetailAccommodation = {
  id: "a2", stopId: "r", name: "Trastevere flat", address: null, checkIn: "2026-12-18", checkOut: "2026-12-20",
  checkInTime: null, checkOutTime: null, confirmation: null, notes: null, lat: 41.88, lng: 12.47, costs: [],
};

function renderDialog(over: Partial<StayDialogProps> = {}) {
  const props: StayDialogProps = {
    open: true, onOpenChange: vi.fn(), stopName: "Rome", stop: ROME, stays: [ARTEMIDE], selectedId: "a1",
    homeCurrency: "AUD", tripId: "trip-1", currentUserId: "u1", onEdit: vi.fn(), onDelete: vi.fn(), onAdd: vi.fn(), ...over,
  };
  render(<StayDialog {...props} />);
  return props;
}

describe("StayDialog (spec 2026-10-05 §D)", () => {
  it("is the large dialog, titled for the Stop", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Staying in Rome" });
    expect(dialog.className.split(/\s+/)).toContain("sm:max-w-dialog-lg");
  });

  it("shows the selected stay as a detail view", () => {
    renderDialog();
    const detail = screen.getByTestId("stay-detail");
    expect(within(detail).getByRole("heading", { name: "Hotel Artemide" })).toBeInTheDocument();
    expect(detail).toHaveTextContent("Via Nazionale 22, Roma");
    expect(within(detail).getByRole("link", { name: "Open Hotel Artemide in Maps" })).toBeInTheDocument();
    expect(detail).toHaveTextContent("Check-inTue 15 Dec · 15:00");
    expect(detail).toHaveTextContent("Check-outFri 18 Dec · 11:00");
    expect(detail).toHaveTextContent("3 of 5 nights");
    expect(detail).toHaveTextContent("ART-881");
    expect(detail).toHaveTextContent(formatMoney(54000, "EUR"));
    expect(within(detail).getByText("Paid")).toBeInTheDocument();
    expect(within(detail).getByText(/Late check-in desk/).textContent).toBe("Late check-in desk\nAsk for a quiet room");
    expect(detail).toHaveTextContent("artemide.pdf");
  });

  it("Edit opens the existing form for that stay; Delete goes through onDelete", async () => {
    const props = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(props.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete Hotel Artemide" }));
    expect(props.onDelete).toHaveBeenCalledWith("a1");
  });

  it("one stay: no chip row, + Add a stay sits in the footer", async () => {
    const props = renderDialog();
    expect(screen.queryByRole("group", { name: "Stays in Rome" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "+ Add a stay" }));
    expect(props.onAdd).toHaveBeenCalled();
  });

  it("several stays: opens on the chosen one, chips switch, + Add a stay ends the row", async () => {
    renderDialog({ stays: [ARTEMIDE, TRASTEVERE], selectedId: "a2" });
    const detail = () => screen.getByTestId("stay-detail");
    expect(within(detail()).getByRole("heading", { name: "Trastevere flat" })).toBeInTheDocument();
    const chips = screen.getByRole("group", { name: "Stays in Rome" });
    expect(within(chips).getByRole("button", { name: "Trastevere flat" })).toHaveAttribute("aria-pressed", "true");
    expect(within(chips).getByRole("button", { name: "Hotel Artemide" })).toHaveAttribute("aria-pressed", "false");
    const buttons = within(chips).getAllByRole("button");
    expect(buttons[buttons.length - 1]).toHaveTextContent("+ Add a stay");

    await userEvent.click(within(chips).getByRole("button", { name: "Hotel Artemide" }));
    expect(within(detail()).getByRole("heading", { name: "Hotel Artemide" })).toBeInTheDocument();
    expect(within(chips).getByRole("button", { name: "Hotel Artemide" })).toHaveAttribute("aria-pressed", "true");
    // Only one + Add a stay — the footer drops it when the chip row carries it.
    expect(screen.getAllByRole("button", { name: "+ Add a stay" })).toHaveLength(1);
  });

  it("a stay with no address has no map link, and unset facts don't show (FB-09)", () => {
    renderDialog({ stays: [TRASTEVERE], selectedId: "a2" });
    const detail = screen.getByTestId("stay-detail");
    expect(within(detail).queryByRole("link", { name: /in Maps/ })).toBeNull();
    expect(detail).not.toHaveTextContent("Booking reference");
    expect(detail).not.toHaveTextContent("Cost");
    expect(detail).toHaveTextContent("Check-inFri 18 Dec");
    expect(detail).toHaveTextContent("2 of 5 nights");
  });

  it("a Stop with no stays: No bed yet, ready to add one", async () => {
    const props = renderDialog({ stays: [], selectedId: null });
    expect(screen.queryByTestId("stay-detail")).toBeNull();
    expect(screen.getByTestId("stay-empty")).toHaveTextContent("No bed yet");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "+ Add a stay" }));
    expect(props.onAdd).toHaveBeenCalled();
  });

  it("an unknown selectedId (a stay deleted meanwhile) falls back to the first stay", () => {
    renderDialog({ stays: [ARTEMIDE, TRASTEVERE], selectedId: "gone" });
    expect(within(screen.getByTestId("stay-detail")).getByRole("heading", { name: "Hotel Artemide" })).toBeInTheDocument();
  });

  it("facts pair up only from sm — one column on a phone", () => {
    renderDialog();
    const facts = screen.getByTestId("stay-facts");
    expect(facts.className).toContain("sm:grid-cols-2");
    expect(facts.className).not.toMatch(/(^|\s)grid-cols-2/);
  });

  it("more than one Cost: the CostEditor stays reachable (the form hides its inline cost then)", () => {
    renderDialog({ stays: [{ ...ARTEMIDE, costs: [cost(), cost({ id: "c2", costMinor: 1000 })] }] });
    expect(screen.getByTestId("stay-cost-editor")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `TZ=UTC npx vitest run components/plan/stay-dialog.test.tsx`. Expected: it fails because `StayDialog` ignores `stays`. `getByTestId("stay-detail")` throws "Unable to find an element by: [data-testid="stay-detail"]", and the size test fails because the class list lacks `sm:max-w-dialog-lg`.

- [ ] **Step 3: Implement.** Replace `components/plan/stay-dialog.tsx` with:

```tsx
"use client";

import * as React from "react";
import { BedDouble } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapLink } from "@/components/trip/map-link";
import { AttachmentLinks } from "@/components/trip/attachment-links";
import { CardActionCluster } from "@/components/trip/card-action-cluster";
import { CostEditor } from "@/components/trip/cost-editor";
import { formatDayLabel } from "@/lib/dates";
import { costPaidState, stayCostLabel, stayNightsLabel, stayNightsOfStop } from "@/lib/plan/plan-model";
import type { AccommodationCardAccommodation } from "@/components/trip/accommodation-card";
import type { AttachmentView } from "@/components/trip/attachment-list";
import type { NoteView } from "@/components/trip/note-thread";
import type { CostRow } from "@/server/actions/costs";

/** One Accommodation as the stay detail view shows it: the card's fields plus its Costs, files and note thread. */
export interface StayDetailAccommodation extends AccommodationCardAccommodation {
  costs?: CostRow[];
  attachments?: AttachmentView[];
  /** The collaborative note thread (not the Accommodation's own `notes` text). */
  noteThread?: NoteView[];
}

export interface StayDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  stopName: string;
  stop: { arriveDate: string | null; departDate: string | null };
  stays: StayDetailAccommodation[];
  /** The stay to show first. Null or unknown (deleted meanwhile) → the first stay; no stays → "No bed yet". */
  selectedId: string | null;
  homeCurrency?: string;
  tripId?: string;
  currentUserId?: string;
  forkId?: string | null;
  pendingId?: string | null;
  /** Opens the existing AccommodationFormDialog on this stay. */
  onEdit(a: StayDetailAccommodation): void;
  onDelete?(id: string): void;
  onAdd?: () => void;
}

const CHIP =
  "tap-target inline-flex h-[30px] shrink-0 items-center whitespace-nowrap rounded-full border-2 border-border px-3 text-xs font-bold focus-visible:outline-[3px] focus-visible:outline-ring";

/** "Tue 15 Dec · 15:00", or just the day when no time is set. */
function when(date: string, time?: string | null): string {
  return time ? `${formatDayLabel(date)} · ${time}` : formatDayLabel(date);
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-sm font-bold text-foreground">{children}</dd>
    </div>
  );
}

function StayDetail({
  a,
  stop,
  homeCurrency,
  tripId,
  currentUserId,
  forkId,
  pending,
  onDelete,
}: {
  a: StayDetailAccommodation;
  stop: StayDialogProps["stop"];
  homeCurrency?: string;
  tripId?: string;
  currentUserId?: string;
  forkId?: string | null;
  pending: boolean;
  onDelete?(id: string): void;
}) {
  const headingId = React.useId();
  const coverage = stayNightsOfStop(stop, a);
  const cost = stayCostLabel(a.costs, homeCurrency);
  const paid = costPaidState(a.costs);
  const files = a.attachments ?? [];

  return (
    <section
      data-testid="stay-detail"
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-4", pending && "pointer-events-none opacity-60")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="flex items-center gap-2 font-display text-xl font-extrabold leading-tight">
            <BedDouble className="size-5 shrink-0" aria-hidden="true" />
            <span className="truncate">{a.name}</span>
          </h3>
          {/* Address-gated like the stay panel (FB-09 tracks coordinates-only stays). */}
          {a.address && (
            <p className="mt-1 flex min-w-0 items-center gap-1 text-sm text-foreground/80">
              <span className="truncate">{a.address}</span>
              <MapLink lat={a.lat} lng={a.lng} address={a.address} label={a.name} className="text-foreground/80" />
            </p>
          )}
        </div>
        {/* Notes thread, files and Delete — what the card's cluster offered; Edit is the footer button. */}
        <CardActionCluster
          tripId={tripId}
          targetType="ACCOMMODATION"
          targetId={a.id}
          editLabel={`Edit ${a.name}`}
          deleteLabel={`Delete ${a.name}`}
          moreLabel={`More actions for ${a.name}`}
          onDelete={onDelete ? () => onDelete(a.id) : undefined}
          isPending={pending}
          notes={a.noteThread}
          currentUserId={currentUserId}
          attachments={a.attachments}
        />
      </div>

      <dl data-testid="stay-facts" className="grid gap-3 sm:grid-cols-2">
        <Fact label="Check-in">{when(a.checkIn, a.checkInTime)}</Fact>
        <Fact label="Check-out">{when(a.checkOut, a.checkOutTime)}</Fact>
        {coverage && <Fact label="Nights">{stayNightsLabel(coverage)}</Fact>}
        {a.confirmation && (
          <Fact label="Booking reference">
            <span className="font-mono">{a.confirmation}</span>
          </Fact>
        )}
        {cost && (
          <Fact label="Cost">
            <span className="flex items-center gap-1.5">
              {cost}
              {paid === "paid" ? <Badge variant="teal">Paid</Badge> : <Badge variant="muted">Unpaid</Badge>}
            </span>
          </Fact>
        )}
      </dl>

      {a.notes && (
        <div>
          <h4 className="text-[11px] font-semibold text-muted-foreground">Notes</h4>
          <p className="whitespace-pre-line text-sm">{a.notes}</p>
        </div>
      )}

      {files.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold text-muted-foreground">Attachments</h4>
          <AttachmentLinks attachments={files} />
        </div>
      )}

      {(a.costs?.length ?? 0) > 1 && tripId && (
        <div data-testid="stay-cost-editor" className="border-t border-border/60 pt-2">
          <CostEditor
            tripId={tripId}
            ownerType="ACCOMMODATION"
            ownerId={a.id}
            costs={a.costs!}
            homeCurrency={homeCurrency}
            defaultCurrency={homeCurrency}
            forkId={forkId}
          />
        </div>
      )}
    </section>
  );
}

/**
 * The stay detail view (spec 2026-10-05 §D; was the hosted accommodation
 * rows of 2026-10-04 §B). Large dialog; one stay at a time, chosen by a chip
 * row when the Stop has several; Edit opens the existing AccommodationFormDialog.
 */
export function StayDialog({
  open,
  onOpenChange,
  stopName,
  stop,
  stays,
  selectedId,
  homeCurrency,
  tripId,
  currentUserId,
  forkId,
  pendingId,
  onEdit,
  onDelete,
  onAdd,
}: StayDialogProps) {
  const [picked, setPicked] = React.useState<string | null>(selectedId);
  const current = stays.find((s) => s.id === picked) ?? stays[0] ?? null;
  const several = stays.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Staying in {stopName}</DialogTitle>
        </DialogHeader>

        {several && (
          <div role="group" aria-label={`Stays in ${stopName}`} className="flex flex-wrap items-center gap-1.5">
            {stays.map((s) => {
              const on = s.id === current?.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(s.id)}
                  className={cn(CHIP, on ? "bg-teal/15" : "bg-card hover:bg-muted")}
                >
                  {s.name}
                </button>
              );
            })}
            {onAdd && (
              <button type="button" onClick={onAdd} className={cn(CHIP, "border-dashed bg-card text-coral-text")}>
                + Add a stay
              </button>
            )}
          </div>
        )}

        {current ? (
          <StayDetail
            key={current.id}
            a={current}
            stop={stop}
            homeCurrency={homeCurrency}
            tripId={tripId}
            currentUserId={currentUserId}
            forkId={forkId}
            pending={pendingId === current.id}
            onDelete={onDelete}
          />
        ) : (
          <div
            data-testid="stay-empty"
            className="flex flex-col items-start gap-3 rounded-[14px] border-2 border-dashed border-border bg-coral/20 px-4 py-3"
          >
            <p className="font-display text-base font-extrabold">No bed yet</p>
            {onAdd && (
              <Button variant="primary" size="md" onClick={onAdd} autoFocus>
                + Add a stay
              </Button>
            )}
          </div>
        )}

        {current && (
          <DialogFooter>
            {!several && onAdd && (
              <Button variant="outline" size="md" onClick={onAdd}>
                + Add a stay
              </Button>
            )}
            <Button variant="primary" size="md" onClick={() => onEdit(current)}>
              Edit
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run it and watch it pass.** `TZ=UTC npx vitest run components/plan/stay-dialog.test.tsx`. Expected: 10 passed. The manager still passes the old `rows` prop, so `npx tsc --noEmit` errors until D3. Run tsc only after D3.

- [ ] **Step 5: Commit.**
```bash
git add components/plan/stay-dialog.tsx components/plan/stay-dialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(plan): stay dialog is a large detail view with stay chips

Spec 2026-10-05 §D: name, address + map link, check-in/out with times,
"n of m nights", booking ref, cost and paid state, notes, files, Edit.
Several stays switch by chip, + Add a stay ends the row; no stays reads
"No bed yet" with Add. Delete, the note thread and a multi-cost CostEditor
stay reachable, as the card offered them.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 23: [D3] Wire the stay detail view into the Plan

**Files:**
- Modify: `components/trip/itinerary-manager.tsx`. The `stayView` state is at L664–665. `renderAccommodationRows` is at L1717–1744: drop its `expandedId` parameter. The `<StayDialog …>` block is at L2415–2426.
- Test: `components/trip/itinerary-manager.test.tsx` (the test "a stay panel block opens the stay dialog with that Accommodation already expanded", L2207–2253)

**Interfaces:**
- Consumes: `StayDialog`, `StayDetailAccommodation` (D2); the existing `setEditingAccommodation`, `setEditingAccommodationCosts`, `setEditingAccStop`, `handleDeleteAccommodation`, `handleAddAccommodationClick`, `attachmentsByAccommodationId`, `notesByAccommodationId`, `pendingId`.
- Produces: `stayView: { stopId: string; accommodationId: string | null } | null`. A null id means "open on the first stay, or on No bed yet". G2 relies on it.

- [ ] **Step 1: Write the failing test.** In `itinerary-manager.test.tsx`, rename the test to `"a stay panel block opens the stay detail view on that Accommodation; Edit opens its form"` and replace its last five lines (L2248–2252, from `await user.click(desktop().getByRole("button", { name: "Hotel Roma" }));` through `expect(within(dialog).getByText("Check-in 14:00")).toBeInTheDocument();`) with:

```tsx
    await user.click(desktop().getByRole("button", { name: "Hotel Roma" }));
    const dialog = await screen.findByRole("dialog", { name: "Staying in Rome" });
    const detail = within(dialog).getByTestId("stay-detail");
    expect(within(detail).getByRole("heading", { name: "Hotel Roma" })).toBeInTheDocument();
    expect(detail).toHaveTextContent("Fri 10 Jul · 14:00");
    expect(detail).toHaveTextContent("3 of 3 nights");
    expect(detail).toHaveTextContent("booking.pdf");

    await user.click(within(dialog).getByRole("button", { name: "Edit" }));
    expect(await screen.findByDisplayValue("Hotel Roma")).toBeInTheDocument();
```

- [ ] **Step 2: Run it and watch it fail.** `TZ=UTC npx vitest run components/trip/itinerary-manager.test.tsx -t "stay detail view"`. Expected: it fails at `getByTestId("stay-detail")`, because the manager passes `rows` and no `stays`, so the dialog shows "No bed yet".

- [ ] **Step 3: Implement.**
  1. L664–665:
     ```tsx
     // The stay detail view (spec 2026-10-05 §D), on one Accommodation — or, with a null id, the first stay / "No bed yet".
     const [stayView, setStayView] = React.useState<{ stopId: string; accommodationId: string | null } | null>(null);
     ```
  2. Only the phone sheet calls `renderAccommodationRows` now. Change its signature (L1720) to `function renderAccommodationRows(stop: ItineraryStop) {`, delete `defaultOpen={acc.id === expandedId}` from the `<AccommodationRow>` props, and update the comment above it: `// The existing accommodation rows, hosted by the phone sheet's Stay tab. Dated stops only: a rough stop has no check-in window to hold one.`
  3. Replace the `{stayStop && (<StayDialog … />)}` block (L2415–2426) with:
     ```tsx
      {/* Where you're staying — the stay detail view (spec 2026-10-05 §D) */}
      {stayStop && (
        <StayDialog
          key={`${stayStop.id}:${stayView?.accommodationId ?? "first"}`}
          open
          onOpenChange={(open) => {
            if (!open) setStayView(null);
          }}
          stopName={stayStop.name}
          stop={{ arriveDate: stayStop.arriveDate, departDate: stayStop.departDate }}
          stays={stayStop.accommodations.map((acc) => ({
            ...acc,
            attachments: attachmentsByAccommodationId?.get(acc.id) ?? [],
            noteThread: notesByAccommodationId?.get(acc.id) ?? [],
          }))}
          selectedId={stayView?.accommodationId ?? null}
          homeCurrency={homeCurrency}
          tripId={tripId}
          currentUserId={currentUserId}
          forkId={forkId ?? null}
          pendingId={pendingId}
          onEdit={(acc) => {
            setEditingAccommodation(acc);
            setEditingAccommodationCosts(acc.costs);
            setEditingAccStop(stayStop);
          }}
          onDelete={handleDeleteAccommodation}
          onAdd={() => handleAddAccommodationClick(stayStop)}
        />
      )}
     ```
  4. Check that the phone sheet call at L2441 is still `renderAccommodationRows(sheetStop)`. It already is.

- [ ] **Step 4: Run it and watch it pass.**
  - `TZ=UTC npx vitest run components/trip/itinerary-manager.test.tsx components/plan/stay-dialog.test.tsx components/plan/stay-panel.test.tsx components/trip/accommodation-row.test.tsx`. Expected: all pass. The stop-sheet tests keep `AccommodationRow` collapsed, so phones are unchanged.
  - `npx tsc --noEmit`. Expected: no errors.

- [ ] **Step 5: Commit.**
```bash
git add components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "$(cat <<'EOF'
feat(plan): the stay panel opens the stay detail view

Spec 2026-10-05 §D: the Plan hands StayDialog the Stop's stays (files, note
threads) and the clicked one; Edit opens the AccommodationFormDialog. The
phone sheet keeps its accommodation rows.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 24: [D4] Cost fields pair up in the wide forms

**Files:**
- Modify: `components/trip/inline-cost-fields.tsx`. Add the `paired` prop to the interface at L13–34 and the destructure at L42–58. Restructure the return at L71–135.
- Modify: `components/trip/accommodation-form-dialog.tsx` (~L416, `<InlineCostFields`), `components/trip/item-form-dialog.tsx` (~L851, `<InlineCostFields`), `components/trip/transport-form-dialog.tsx` (~L812, `<InlineCostFields`). Add `paired` to each.
- Test: `components/trip/inline-cost-fields.test.tsx` (append), `components/trip/accommodation-form-dialog.test.tsx` (append inside the top `describe`)

**Interfaces:**
- Produces: `InlineCostFieldsProps.paired?: boolean`. `false` (the default, used by `CostEditor`) renders exactly today's DOM. `true` wraps Cost with Settlement + Paid in `[data-pair="cost"]`, and You paid with Date paid in `[data-pair="paid"]`, each `grid gap-x-4 gap-y-[inherit] sm:grid-cols-2`. The row gap inherits the parent's gap, so phones keep today's spacing.

- [ ] **Step 1: Write the failing tests.** Append to `components/trip/inline-cost-fields.test.tsx`:

```tsx
describe("InlineCostFields paired (spec 2026-10-05 §D)", () => {
  it("pairs Cost with the Settlement and Paid, and You paid with Date paid, from sm", () => {
    renderFields({ paired: true, paid: true, paidAmount: "340.00", paidAt: "2026-10-01" });
    const costPair = screen.getByLabelText(/^cost amount$/i).closest("[data-pair='cost']");
    expect(costPair).not.toBeNull();
    expect(costPair).toContainElement(screen.getByRole("checkbox", { name: "Paid" }));
    const paidPair = screen.getByLabelText(/you paid amount/i).closest("[data-pair='paid']");
    expect(paidPair).toContainElement(screen.getByLabelText(/date paid/i));
    expect(paidPair!.className).toContain("sm:grid-cols-2");
    expect(paidPair!.className).not.toMatch(/(^|\s)grid-cols-2/);
  });

  it("unpaired (the CostEditor) keeps the flat layout", () => {
    renderFields({ paid: true, paidAmount: "340.00", paidAt: "2026-10-01" });
    expect(document.querySelector("[data-pair]")).toBeNull();
  });
});
```

Append inside `describe("AccommodationFormDialog", …)` in `accommodation-form-dialog.test.tsx`:

```tsx
  it("pairs You paid with Date paid in the wide form (spec 2026-10-05 §D)", async () => {
    const user = userEvent.setup();
    render(<AccommodationFormDialog {...baseProps} homeCurrency="AUD" />);
    await user.type(screen.getByRole("textbox", { name: /^cost amount$/i }), "100");
    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    const paidPair = screen.getByRole("textbox", { name: /you paid amount/i }).closest("[data-pair='paid']");
    expect(paidPair).toContainElement(screen.getByLabelText(/date paid/i));
  });
```

- [ ] **Step 2: Run them and watch them fail.** `TZ=UTC npx vitest run components/trip/inline-cost-fields.test.tsx components/trip/accommodation-form-dialog.test.tsx`. Expected: the two "pairs" tests fail because `closest("[data-pair=…]")` returns null. The "unpaired" test already passes.

- [ ] **Step 3: Implement.**
  1. In `InlineCostFieldsProps`, after `disabled?: boolean;`:
     ```ts
       /**
        * The wide entity dialogs (spec 2026-10-05 §D): from sm, Cost sits beside
        * the Settlement and Paid, and You paid beside Date paid. Off (CostEditor),
        * the fields stay one flat column.
        */
       paired?: boolean;
     ```
     Add `paired = false,` to the destructure after `disabled,`.
  2. Above the component, add `const PAIR = "grid gap-x-4 gap-y-[inherit] sm:grid-cols-2";`.
  3. Replace everything from `return (` (L71) to the closing `);` of the component with:
     ```tsx
       const costField = (
         <Field
           label="Cost"
           description="Your best number — the real price if it's already booked."
           error={errors.costMinor?.[0]}
         >
           <MoneyInput
             amount={costAmount}
             currency={currency}
             currencies={CURRENCY_CODES}
             onAmountChange={onCostChange}
             onCurrencyChange={onCurrencyChange}
             disabled={disabled}
             invalid={Boolean(errors.costMinor)}
             aria-label="Cost amount"
           />
         </Field>
       );

       const hasCost = Boolean(costAmount.trim());

       const settleAndPaid = hasCost ? (
         <>
           {/* Settlement — a plain choice, never derived from dates. */}
           <SettlementChoice value={settlement} onChange={onSettlementChange} disabled={disabled} />

           <label className="flex items-center gap-2 text-sm font-medium">
             <input
               type="checkbox"
               checked={paid}
               onChange={(e) => handlePaidToggle(e.target.checked)}
               disabled={disabled}
               className="size-4 rounded border-input accent-primary"
             />
             Paid
           </label>
         </>
       ) : null;

       const paidFields =
         hasCost && paid ? (
           <>
             <Field label="You paid" error={errors.paidMinor?.[0]}>
               <MoneyInput
                 amount={paidAmount}
                 currency={currency}
                 currencies={CURRENCY_CODES}
                 onAmountChange={onPaidAmountChange}
                 onCurrencyChange={onCurrencyChange}
                 disabled={disabled}
                 invalid={Boolean(errors.paidMinor)}
                 aria-label="You paid amount"
               />
             </Field>

             <Field label="Date paid" error={errors.paidAt?.[0]}>
               <Input type="date" value={paidAt} onChange={(e) => onPaidAtChange(e.target.value)} disabled={disabled} />
             </Field>
           </>
         ) : null;

       if (!paired) {
         return (
           <>
             {costField}
             {settleAndPaid}
             {paidFields}
           </>
         );
       }

       // Row gaps inherit the parent's, so below sm this is the flat column above.
       return (
         <>
           <div data-pair="cost" className={PAIR}>
             {costField}
             {settleAndPaid && <div className="flex flex-col gap-y-[inherit] sm:pt-7">{settleAndPaid}</div>}
           </div>
           {paidFields && (
             <div data-pair="paid" className={PAIR}>
               {paidFields}
             </div>
           )}
         </>
       );
     ```
  4. Add the `paired` prop (one line, after `disabled={isPending}`) to the `<InlineCostFields` call in `accommodation-form-dialog.tsx`, `item-form-dialog.tsx` and `transport-form-dialog.tsx`. Leave `cost-editor.tsx` alone.

- [ ] **Step 4: Run them and watch them pass.** `TZ=UTC npx vitest run components/trip/inline-cost-fields.test.tsx components/trip/accommodation-form-dialog.test.tsx components/trip/item-form-dialog.test.tsx components/trip/transport-form-dialog.test.tsx components/trip/cost-editor.test.tsx`. Expected: all pass.

- [ ] **Step 5: Commit.**
```bash
git add components/trip/inline-cost-fields.tsx components/trip/inline-cost-fields.test.tsx components/trip/accommodation-form-dialog.tsx components/trip/accommodation-form-dialog.test.tsx components/trip/item-form-dialog.tsx components/trip/transport-form-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(forms): cost fields pair up in the wide entity dialogs

Spec 2026-10-05 §D: from sm, Cost beside Settlement + Paid, You paid beside
Date paid. Row gaps inherit the parent's, so phones are unchanged; the
CostEditor keeps the flat column.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 25: [D5] Stop form goes large; Item pairs booking ref + link

**Files:**
- Modify: `components/trip/stop-form-dialog.tsx`. Add `size="lg"` to `<FormDialog …>` at L92–97. Pair Place name + Country at L235–255. Pair Nights + Chapter at L256–289.
- Modify: `components/trip/item-form-dialog.tsx`. Replace the Address + Link sub-grid and the lone Booking reference (L774–805).
- Test: `components/trip/stop-form-dialog.test.tsx`, `components/trip/item-form-dialog.test.tsx` (append inside each top `describe`)

**Interfaces:**
- Produces: DOM hooks `data-pair="place"` (Place name | Country), `data-pair="rough"` (Nights | Chapter) and `data-pair="booking"` (Item: Booking reference | Link). The Item Address goes full width (`sm:col-span-2`). Stop Notes and Attachments stay full width. Stop Timezone stays full width above the existing Arrive | Depart grid.

- [ ] **Step 1: Write the failing tests.** Append inside `describe("StopFormDialog", …)`:

```tsx
  it("is the wide dialog with Place name beside Country, and Nights beside Chapter (spec 2026-10-05 §D)", () => {
    render(<StopFormDialog {...baseProps} />);
    expect(screen.getByRole("dialog").className.split(/\s+/)).toContain("sm:max-w-dialog-lg");
    const place = screen.getByPlaceholderText(/e\.g\. london/i).closest("[data-pair='place']");
    expect(place).toContainElement(screen.getByPlaceholderText(/e\.g\. united kingdom/i));
    expect(place!.className).toContain("sm:grid-cols-2");
    expect(place!.className).not.toMatch(/(^|\s)grid-cols-2/);
    const rough = screen.getByLabelText(/nights \(rough\)/i).closest("[data-pair='rough']");
    expect(rough).not.toBeNull();
    expect(rough).toHaveTextContent("Chapter");
  });
```

Append inside `describe("ItemFormDialog", …)`:

```tsx
  it("pairs Booking reference with Link; Address runs full width (spec 2026-10-05 §D)", () => {
    render(<ItemFormDialog {...baseProps} />);
    const pair = screen.getByLabelText(/booking reference/i).closest("[data-pair='booking']");
    expect(pair).toContainElement(screen.getByLabelText(/^link$/i));
    expect(pair).not.toContainElement(screen.getByLabelText(/^address$/i));
    expect(screen.getByLabelText(/^address$/i).closest("div.sm\\:col-span-2")).not.toBeNull();
  });
```

- [ ] **Step 2: Run them and watch them fail.** `TZ=UTC npx vitest run components/trip/stop-form-dialog.test.tsx components/trip/item-form-dialog.test.tsx`. Expected: the Stop test fails because the class list lacks `sm:max-w-dialog-lg`, and the Item test fails because `closest("[data-pair='booking']")` is null.

- [ ] **Step 3: Implement.**
  1. `stop-form-dialog.tsx`, `<FormDialog …>`: add `size="lg"` after `recordId={stop?.id ?? null}`.
  2. Wrap the Name and Country `Field`s (L235–255) in `<div data-pair="place" className="grid gap-4 sm:grid-cols-2">…</div>`, with the comment `{/* Place name + Country — paired from sm (spec 2026-10-05 §D). */}`. The form is `flex flex-col gap-4`, so `gap-4` keeps phone spacing identical.
  3. In the rough branch, replace the fragment `<>…</>` around Nights and Chapter with `<div data-pair="rough" className="grid gap-4 sm:grid-cols-2">…</div>`, keeping both `Field`s and their children unchanged.
  4. `item-form-dialog.tsx`: replace the Address + Link sub-grid and the Booking reference `Field` (L774–805) with:
     ```tsx
      {/* Address — full width; a street address reads best on one line. */}
      <Field label="Address" error={(errors as FormErrors).address?.[0]} className="sm:col-span-2">
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. 12 Rue de la Paix, Paris"
          disabled={isPending}
        />
      </Field>

      {/* Booking reference + Link — own sub-grid so they always pair (spec 2026-10-05 §D). */}
      <div data-pair="booking" className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
        <Field label="Booking reference" error={(errors as FormErrors).booking?.[0]}>
          <Input
            value={booking}
            onChange={(e) => setBooking(e.target.value)}
            placeholder="e.g. BOOK-12345"
            disabled={isPending}
          />
        </Field>

        <Field label="Link" error={(errors as FormErrors).link?.[0]}>
          <Input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…"
            disabled={isPending}
          />
        </Field>
      </div>
     ```

- [ ] **Step 4: Run them and watch them pass.** `TZ=UTC npx vitest run components/trip/stop-form-dialog.test.tsx components/trip/item-form-dialog.test.tsx`. Expected: all pass.

- [ ] **Step 5: Commit.**
```bash
git add components/trip/stop-form-dialog.tsx components/trip/stop-form-dialog.test.tsx components/trip/item-form-dialog.tsx components/trip/item-form-dialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(forms): Stop form goes wide with paired fields; Item pairs booking ref + link

Spec 2026-10-05 §D: Stop's place + country and nights + chapter sit side by
side from sm; Item's Booking reference pairs with Link and Address runs full
width. Phones unchanged.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 26: [D6] Transport form pairs; screenshot the four forms at 1920×911 and 1280×800

**Files:**
- Modify: `components/trip/transport-form-dialog.tsx`. Mode tile grid at L654 (`grid grid-cols-3 gap-2`). Booking ref `Field` at L782–790. The "Position in plan" `Field` at L865–890 moves up beside Booking ref.
- Test: `components/trip/transport-form-dialog.test.tsx` (append inside `describe("TransportFormDialog", …)`)
- Create (scratchpad, not committed): `/tmp/claude-1000/-work/57ede0fd-0733-4004-81be-72517e20e05d/scratchpad/shots-D.cjs`

**Interfaces:**
- Produces: `data-pair="booking"` holding Booking ref and, when it shows (edit mode, not a bookend), Position in plan. The mode radiogroup becomes `grid grid-cols-3 gap-2 sm:grid-cols-6`.

- [ ] **Step 1: Write the failing test.**

```tsx
  it("wide layout: one row of mode tiles from sm; Booking ref beside Position in plan (spec 2026-10-05 §D)", () => {
    render(<TransportFormDialog {...baseProps} transport={{ ...existingTransport, anchorStopId: "stop-a" }} />);
    expect(screen.getByRole("radiogroup", { name: "Mode" }).className).toContain("sm:grid-cols-6");
    const pair = screen.getByText("Booking ref · only people on the trip see this").closest("[data-pair='booking']");
    expect(pair).toContainElement(screen.getByRole("combobox", { name: /position in plan/i }));
    expect(pair!.className).toContain("sm:grid-cols-2");
  });
```

- [ ] **Step 2: Run it and watch it fail.** `TZ=UTC npx vitest run components/trip/transport-form-dialog.test.tsx -t "wide layout"`. Expected: it fails because the class `grid grid-cols-3 gap-2` doesn't contain `sm:grid-cols-6`.

- [ ] **Step 3: Implement.**
  1. L654: `<div role="radiogroup" aria-label="Mode" className="grid grid-cols-3 gap-2 sm:grid-cols-6">`
  2. Replace the `{/* Booking ref */}` Field (L782–790) with:
     ```tsx
        {/* Booking ref + Position in plan — paired from sm (spec 2026-10-05 §D).
            Position: edit mode only, and not for a Home base bookend (it sits
            with the Home base card whatever its anchor). Opens on the slot the
            timeline renders the leg in; the head is only offered where a null
            anchor really lands there. */}
        <div data-pair="booking" className="grid gap-4 sm:grid-cols-2">
          <Field label="Booking ref · only people on the trip see this" error={(errors as FormErrors).reference?.[0]}>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. BA0123 or ABC123"
              disabled={isPending}
            />
          </Field>

          {isEdit && !bookend && stops.length > 0 && (
            <Field label="Position in plan">
              <Select value={positionSlot} onValueChange={setPickedSlot} disabled={isPending}>
                <SelectTrigger aria-label="Position in plan">
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  {headHolds && <SelectItem value={HEAD_SLOT}>Before {stops[0].name}</SelectItem>}
                  {stops.map((stop) => (
                    <SelectItem key={stop.id} value={stop.id}>
                      After {stop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
     ```
  3. Delete the old "Position in plan" block and its comment (L865–890, from `{/* Position in plan — edit mode only` through the closing `)}`).
  4. The outer `flex flex-col gap-4` keeps phone spacing, and `grid gap-4` stacks below sm, so phones are unchanged.

- [ ] **Step 4: Run it and watch it pass.**
  - `TZ=UTC npx vitest run components/trip/transport-form-dialog.test.tsx`. Expected: all pass, including the Task 13 position-picker tests.
  - Full gate: `npm test && npx tsc --noEmit && npm run lint`. Expected: green.

- [ ] **Step 5: Screenshot the four forms (and the stay view) at 1920×911 and 1280×800.**
  1. If no dev server is running (`curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/` doesn't print 200 or 307), start one with `npm run dev`, run in the background. Use `next dev` only, never `next start`: `start` would load `.env.production.local`.
  2. Run an audit pass. It signs in through the dev login and saves `/tmp/auth.json`, and also captures the overlay set at the audit's 900px height:
     ```bash
     NODE_PATH=/usr/local/lib/node_modules \
     LAYOUT_AUDIT_OUT=/tmp/claude-1000/-work/57ede0fd-0733-4004-81be-72517e20e05d/scratchpad/audit-D \
     LAYOUT_AUDIT_ONLY="overlay/stop-edit/1920,overlay/stop-edit/1280,overlay/transport-edit/1920,overlay/transport-edit/1280,overlay/item-add/1920,overlay/item-add/1280,overlay/accommodation-add/1920,overlay/accommodation-add/1280" \
     npm run audit:layout
     ```
     Expected: 8 captures, no `spill`/`clipped` findings for these overlays in `findings.auto.json`.
  3. Write `/tmp/claude-1000/-work/57ede0fd-0733-4004-81be-72517e20e05d/scratchpad/shots-D.cjs`:
     ```js
     // Spec 2026-10-05 §D: the four big forms + the stay detail view at the exact viewports, with real-shaped data
     // (the layout audit's "EU Christmas 2026" trip). Prints whether each dialog body fits or scrolls.
     const { chromium } = require("playwright");
     const BASE = process.env.BASE_URL || "http://localhost:3000";
     const OUT = process.argv[2];
     require("fs").mkdirSync(OUT, { recursive: true });

     async function fit(page) {
       return page.evaluate(() => {
         const d = [...document.querySelectorAll('[role="dialog"]')].pop();
         const s = [d, ...d.querySelectorAll("*")].find((el) => {
           const o = getComputedStyle(el).overflowY;
           return (o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight + 1;
         });
         return s ? `scrolls ${s.scrollHeight - s.clientHeight}px` : "fits";
       });
     }

     (async () => {
       const browser = await chromium.launch();
       for (const [w, h] of [[1920, 911], [1280, 800]]) {
         const ctx = await browser.newContext({ viewport: { width: w, height: h }, storageState: "/tmp/auth.json" });
         const page = await ctx.newPage();
         await page.goto(`${BASE}/trips`, { waitUntil: "networkidle" });
         await page.getByRole("link", { name: /EU Christmas 2026/ }).first().click();
         await page.waitForURL(/\/trips\/[^/]+/);
         const tripId = page.url().match(/\/trips\/([^/?#]+)/)[1];
         const plan = `${BASE}/trips/${tripId}/plan`;
         const list = () => page.getByTestId("plan-desktop-list");

         async function shot(name, open, dialogName) {
           await page.goto(plan, { waitUntil: "networkidle" });
           await open();
           await page.getByRole("dialog", { name: dialogName }).last().waitFor();
           await page.waitForTimeout(500);
           await page.screenshot({ path: `${OUT}/${name}-${w}x${h}.png` });
           console.log(`${name} ${w}x${h}: ${await fit(page)}`);
         }

         await shot("stop-edit", async () => {
           await list().getByRole("button", { name: /^More actions for / }).first().click();
           await page.getByRole("menuitem", { name: /^Edit name/ }).click();
         }, /^Edit /);
         await shot("transport-edit", async () => {
           await page.getByRole("button", { name: "Edit Transport", exact: true }).first().click();
         }, "Edit Transport");
         await shot("item-add", async () => {
           await page.getByRole("button", { name: "Add Thing to Do", exact: true }).first().click();
         }, "Add Item");
         const openStayDetail = async () => {
           const blocks = page.locator('[data-testid="stay-block"] button');
           const openers = list().getByRole("button", { name: /^Open / });
           for (let i = 0; (await blocks.count()) === 0 && i < 30 && (await openers.count()) > 0; i++) {
             await openers.first().click();
             await page.waitForTimeout(400);
           }
           await blocks.first().click();
         };
         await shot("stay-detail", openStayDetail, /^Staying in /);
         await shot("accommodation-edit", async () => {
           await openStayDetail();
           await page.getByRole("dialog", { name: /^Staying in / }).getByRole("button", { name: "Edit", exact: true }).click();
         }, /^Edit /);
         await ctx.close();
       }
       await browser.close();
     })().catch((e) => { console.error(e); process.exit(1); });
     ```
  4. Run it:
     ```bash
     NODE_PATH=/usr/local/lib/node_modules node /tmp/claude-1000/-work/57ede0fd-0733-4004-81be-72517e20e05d/scratchpad/shots-D.cjs /tmp/claude-1000/-work/57ede0fd-0733-4004-81be-72517e20e05d/scratchpad/shots-D
     ```
     Expected: 10 lines, one per form and viewport. The target is `transport-edit 1920x911: fits` and `accommodation-edit 1920x911: fits`. Where a line says `scrolls Npx`, that's allowed by the spec. Then the screenshot must show the pinned header and the sticky footer with its scroll-aware rule (spec 2026-10-04 §G) and nothing clipped.
  5. Open every PNG in `shots-D/` and the 8 in `audit-D/shots/overlay/` with the Read tool. Check that the pairs sit side by side (dates, times, cost | settlement+paid, you paid | date paid, booking ref | link or position, place | country), Notes and Attachments run full width, nothing overflows, and the stay view shows chips when a Stop has several stays. Report each fits/scrolls result in the task report. Commit no screenshots.

- [ ] **Step 6: Commit.**
```bash
git add components/trip/transport-form-dialog.tsx components/trip/transport-form-dialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(forms): Transport form pairs booking ref with position, one row of modes

Spec 2026-10-05 §D: from sm the six mode tiles sit in one row and Booking
ref pairs with Position in plan, so a typical leg fits at 1920×911. Checked
by screenshots of the Stop, Transport, Item and Accommodation forms and
the stay detail view at 1920×911 and 1280×800.

Resolves-Feedback: cmutc4u82000004jm8e6ck4xm
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 27: [G1] The whole Stop header toggles it

**Files:**
- Modify: `components/plan/stop-row.tsx`. Add the header handlers before `return` (~L54). Header `<div>` at L66.
- Modify: `components/plan/plan-dnd.ts` (append constants)
- Modify: `components/trip/itinerary-manager.tsx` (import at L26; sensors at L572–576)
- Test: `components/plan/stop-row.test.tsx` (append), `components/plan/plan-dnd.test.ts` (import at L2; append)

**Interfaces:**
- Produces: `export const POINTER_ACTIVATION = { distance: 6 } as const` and `export const TOUCH_ACTIVATION = { delay: 200, tolerance: 8 } as const` in `plan-dnd.ts`. The `StopRow` header gets `data-testid="stop-row-header"`, `onPointerDown` and `onClick`. It gets no role and no tabindex.
- Behaviour: a click whose press started on a non-interactive part of the header calls `onToggle()` once. Clicks are ignored when they come from `button, a, input, select, textarea, label, [role='button'], [role='menuitem']` inside the header, when they come from portalled content such as the ⋯ menu's items (those bubble through React but aren't DOM descendants), when the press started on such a control (a drag from the grip released over the header), or when text is selected.

- [ ] **Step 1: Write the failing tests.** Append to `components/plan/stop-row.test.tsx` (add `fireEvent` to the `@testing-library/react` import):

```tsx
describe("StopRow header click (spec 2026-10-05 §G)", () => {
  const GRIP = <button type="button" aria-label="Reorder Rome">≡</button>;

  it("a click anywhere on the header toggles, once", async () => {
    const { props } = renderRow();
    await userEvent.click(screen.getByRole("heading", { name: "Rome" }));
    expect(props.onToggle).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByText("Tue 15 – Tue 22 Dec"));
    expect(props.onToggle).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByText("4 plans"));
    expect(props.onToggle).toHaveBeenCalledTimes(3);
  });

  it("the chevron toggles once, not twice", async () => {
    const { props } = renderRow();
    await userEvent.click(screen.getByRole("button", { name: "Open Rome" }));
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it("the ⋯ menu and its items, the map pin and the drag handle never toggle", async () => {
    const onSelect = vi.fn();
    const { props } = renderRow({ dragHandle: GRIP, menuGroups: [[{ key: "edit", label: "Edit name & place", onSelect }]] });
    await userEvent.click(screen.getByRole("button", { name: "More actions for Rome" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit name & place" }));
    expect(onSelect).toHaveBeenCalled();
    const pin = screen.getByRole("link", { name: /in Maps/ });
    pin.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(pin);
    await userEvent.click(screen.getByRole("button", { name: "Reorder Rome" }));
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it("a press that starts on the grip and is released over the header isn't a toggle", () => {
    const { props } = renderRow({ dragHandle: GRIP });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Reorder Rome" }));
    fireEvent.click(screen.getByTestId("stop-row-header"));
    expect(props.onToggle).not.toHaveBeenCalled();
    const name = screen.getByRole("heading", { name: "Rome" });
    fireEvent.pointerDown(name);
    fireEvent.click(name);
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it("selecting the Stop's name to copy it doesn't toggle", async () => {
    const spy = vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "Rome" } as Selection);
    const { props } = renderRow();
    await userEvent.click(screen.getByRole("heading", { name: "Rome" }));
    expect(props.onToggle).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("no extra role or tab stop: the keyboard toggles through the chevron only, once", async () => {
    const { props } = renderRow();
    const header = screen.getByTestId("stop-row-header");
    expect(header).not.toHaveAttribute("role");
    expect(header).not.toHaveAttribute("tabindex");
    expect(header.className).toContain("cursor-pointer");
    screen.getByRole("button", { name: "Open Rome" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });
});
```

In `components/plan/plan-dnd.test.ts`, change L2 to `import { planCollisionDetection, POINTER_ACTIVATION, resolveItemDrop, scheduleInputFor, TOUCH_ACTIVATION } from "./plan-dnd";` and append:

```ts
describe("drag activation (spec 2026-10-05 §G)", () => {
  it("a short tap is never a drag: touch waits for a hold, a mouse press for real travel", () => {
    expect(TOUCH_ACTIVATION.delay).toBeGreaterThanOrEqual(150);
    expect(TOUCH_ACTIVATION.tolerance).toBeGreaterThan(0);
    expect(POINTER_ACTIVATION.distance).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run them and watch them fail.** `TZ=UTC npx vitest run components/plan/stop-row.test.tsx components/plan/plan-dnd.test.ts`. Expected: "a click anywhere on the header toggles" fails with `expected "spy" to be called 1 times, but got 0 times`. `getByTestId("stop-row-header")` throws. The plan-dnd test fails with `Cannot read properties of undefined (reading 'delay')`.

- [ ] **Step 3: Implement.**
  1. Append to `components/plan/plan-dnd.ts`:
     ```ts
     /**
      * Spec 2026-10-05 §G: a press only becomes a drag after real intent, so a
      * click or tap on a Stop header (which now toggles it) is never read as a
      * drag start. Mouse: 6px of travel. Touch: a 200ms hold within 8px.
      */
     export const POINTER_ACTIVATION = { distance: 6 } as const;
     export const TOUCH_ACTIVATION = { delay: 200, tolerance: 8 } as const;
     ```
  2. `itinerary-manager.tsx` L26: `import { planCollisionDetection, POINTER_ACTIVATION, resolveItemDrop, scheduleInputFor, TOUCH_ACTIVATION, type ItemDrop } from "@/components/plan/plan-dnd";`. Sensors at L573–574:
     ```tsx
         useSensor(PointerSensor, { activationConstraint: POINTER_ACTIVATION }),
         useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
     ```
  3. `stop-row.tsx`: add above `export const STOP_ROW_GRID`:
     ```tsx
     /** Clicks on these do their own thing and never toggle the row (spec 2026-10-05 §G). */
     const OWN_CLICK = "button, a, input, select, textarea, label, [role='button'], [role='menuitem']";
     ```
     Inside `StopRow`, before `return (`:
     ```tsx
       // Spec 2026-10-05 §G: the whole header toggles — a pointer convenience;
       // the chevron stays the one accessible control. A press that began on a
       // control (the grip mid-drag, the ⋯ trigger) never toggles on release.
       const pressedControl = React.useRef(false);
       function onHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
         const t = e.target as Element;
         pressedControl.current = !e.currentTarget.contains(t) || t.closest(OWN_CLICK) != null;
       }
       function onHeaderClick(e: React.MouseEvent<HTMLDivElement>) {
         const t = e.target as Element;
         const pressed = pressedControl.current;
         pressedControl.current = false;
         // Portalled content (the ⋯ menu's items) bubbles through React, not the DOM.
         if (!e.currentTarget.contains(t)) return;
         if (pressed || t.closest(OWN_CLICK)) return;
         // Selecting the name to copy it isn't a click.
         if (window.getSelection()?.toString()) return;
         onToggle();
       }
     ```
     Replace the header `<div>` opening tag (L66) with:
     ```tsx
       <div
         data-testid="stop-row-header"
         onPointerDown={onHeaderPointerDown}
         onClick={onHeaderClick}
         className={cn(STOP_ROW_GRID, "cursor-pointer", dragHandle && "grid-cols-[auto_40px_minmax(0,1fr)_auto_auto]")}
       >
     ```
     The chevron button keeps its `onClick={onToggle}` and aria attributes. Its click is excluded by `OWN_CLICK`, so it fires once.

- [ ] **Step 4: Run them and watch them pass.**
  - `TZ=UTC npx vitest run components/plan/stop-row.test.tsx components/plan/plan-dnd.test.ts components/trip/itinerary-manager.test.tsx`. Expected: all pass. The manager tests that click "More actions for …" and menu items still don't toggle.
  - `npx tsc --noEmit`. Expected: clean. The `as const` readonly objects are assignable to dnd-kit's `DistanceConstraint` and `DelayConstraint`.
  - Manual check on the running `npm run dev` at 1280×800 in a desktop browser (or the Playwright context from D6 with `hasTouch: true`). Click a Stop's name: it opens. Click again: it folds. Open the ⋯ menu and press Escape: the row doesn't change. Drag the grip: it reorders and doesn't toggle. On a touch emulation, a quick tap on the header toggles and a 200ms hold on the grip drags.

- [ ] **Step 5: Commit.**
```bash
git add components/plan/stop-row.tsx components/plan/stop-row.test.tsx components/plan/plan-dnd.ts components/plan/plan-dnd.test.ts components/trip/itinerary-manager.tsx
git commit -m "$(cat <<'EOF'
feat(plan): clicking anywhere on a Stop header opens or folds it

Spec 2026-10-05 §G: the header toggles on a click, except on its controls
(⋯ menu and items, chevron, grip, map pin), on a press that started on one,
or while text is selected. No extra role or tab stop — the chevron stays
the accessible control. Drag activation constraints named and pinned so a
tap is never a drag start.

Resolves-Feedback: cmutb6vtl000004lba7hzqysz
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 28: [G2] The stay chip opens the stay detail view

**Files:**
- Modify: `components/plan/stop-row.tsx`. Add `onOpenStay?: () => void` to `StopRowProps` (L20–33) and to the destructure (L38–51). Replace the three stay chip `<span>`s (L95–122) with `StayChip`.
- Modify: `components/trip/itinerary-manager.tsx`, the `<StopRow …>` props in `renderDesktopStop` (~L1760–1775)
- Test: `components/plan/stop-row.test.tsx` (append), `components/trip/itinerary-manager.test.tsx` (append two tests after the D3 test, in the same `describe`)

**Interfaces:**
- Consumes: `planBody.open(stopId)` (`usePlanBody`, `components/plan/plan-body.tsx` L81), and `setStayView` with a nullable id (D3).
- Produces: `StopRowProps.onOpenStay?: () => void`. With it, the stay chip is `<button type="button" data-chip>` named:
  - covered: `Stay in {stop}: {stay}`
  - partial: `Stay in {stop}: {stay}, {n} night(s) open`
  - none: `No bed yet in {stop} — add a stay`
  Without it, the chip stays a `<span data-chip>`.

- [ ] **Step 1: Write the failing tests.** Append to `components/plan/stop-row.test.tsx`:

```tsx
describe("StopRow stay chip (spec 2026-10-05 §G)", () => {
  it("is a button that opens the stay, and doesn't toggle the row", async () => {
    const onOpenStay = vi.fn();
    const { props } = renderRow({ onOpenStay });
    await userEvent.click(screen.getByRole("button", { name: "Stay in Rome: Hotel Artemide" }));
    expect(onOpenStay).toHaveBeenCalledTimes(1);
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it("partial names the open nights", () => {
    renderRow({ onOpenStay: vi.fn(), stay: { ...COVERED, kind: "partial", coveredNights: 5 } });
    expect(screen.getByRole("button", { name: "Stay in Rome: Hotel Artemide, 2 nights open" })).toBeInTheDocument();
  });

  it("No bed yet opens it ready to add one, keeping the dashed coral chip", async () => {
    const onOpenStay = vi.fn();
    renderRow({ onOpenStay, stay: { ...COVERED, kind: "none", name: null, coveredNights: 0 } });
    const chip = screen.getByRole("button", { name: "No bed yet in Rome — add a stay" });
    expect(chip).toHaveAttribute("data-chip");
    expect(chip.className).toMatch(/border-dashed/);
    expect(chip.className).toContain("bg-coral/20");
    await userEvent.click(chip);
    expect(onOpenStay).toHaveBeenCalledTimes(1);
  });

  it("without onOpenStay it stays a plain chip", () => {
    renderRow();
    expect(screen.queryByRole("button", { name: /^Stay in Rome/ })).toBeNull();
    expect(screen.getByText("Hotel Artemide").closest("[data-chip]")!.tagName).toBe("SPAN");
  });
});
```

Append to `itinerary-manager.test.tsx`, in the same `describe` as the D3 test:

```tsx
  it("the folded row's stay chip opens the Stop and the stay detail view on that stay (spec 2026-10-05 §G)", async () => {
    const user = userEvent.setup();
    const stop = makeStop({
      id: "s1",
      name: "Rome",
      arriveDate: "2026-07-10",
      departDate: "2026-07-13",
      accommodations: [
        { id: "acc-1", stopId: "s1", name: "Hotel Roma", checkIn: "2026-07-10", checkOut: "2026-07-12", costs: [] },
        { id: "acc-2", stopId: "s1", name: "Villa Sole", checkIn: "2026-07-12", checkOut: "2026-07-13", costs: [] },
      ],
    });
    renderPlan(<ItineraryManager {...baseProps} initialStops={[stop]} />);
    expect(desktop().getByRole("button", { name: "Open Rome" })).toHaveAttribute("aria-expanded", "false");

    await user.click(desktop().getByRole("button", { name: "Stay in Rome: Hotel Roma" }));
    const dialog = await screen.findByRole("dialog", { name: "Staying in Rome" });
    expect(within(within(dialog).getByTestId("stay-detail")).getByRole("heading", { name: "Hotel Roma" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Villa Sole" })).toHaveAttribute("aria-pressed", "false");
    // The Stop opened underneath (the modal hides it from the a11y tree).
    expect(desktop().getByRole("button", { name: "Fold Rome", hidden: true })).toHaveAttribute("aria-expanded", "true");
  });

  it("a No bed yet chip opens the stay view ready to add one (spec 2026-10-05 §G)", async () => {
    const user = userEvent.setup();
    const stop = makeStop({ id: "s1", name: "Rome", arriveDate: "2026-07-10", departDate: "2026-07-13" });
    renderPlan(<ItineraryManager {...baseProps} initialStops={[stop]} />);

    await user.click(desktop().getByRole("button", { name: "No bed yet in Rome — add a stay" }));
    const dialog = await screen.findByRole("dialog", { name: "Staying in Rome" });
    expect(within(dialog).getByTestId("stay-empty")).toHaveTextContent("No bed yet");
    await user.click(within(dialog).getByRole("button", { name: "+ Add a stay" }));
    expect(await screen.findByPlaceholderText(/e\.g\. Hilton/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them and watch them fail.** `TZ=UTC npx vitest run components/plan/stop-row.test.tsx components/trip/itinerary-manager.test.tsx -t "stay chip|No bed yet chip"`. Expected: `Unable to find an accessible element with the role "button" and name "Stay in Rome: Hotel Artemide"`, and the same for the manager tests. "without onOpenStay" passes.

- [ ] **Step 3: Implement.**
  1. `stop-row.tsx`, `StopRowProps`: add after `onToggle(): void;`:
     ```ts
       /** Spec 2026-10-05 §G: the stay chip opens the Stop and its stay detail view (on "No bed yet": ready to add one). */
       onOpenStay?: () => void;
     ```
     Add `onOpenStay,` to the destructure after `onToggle,`.
  2. Above `export const STOP_ROW_GRID`, add:
     ```tsx
     const CHIP = "inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-border px-2.5 text-xs font-bold";

     /** A stay chip: a button when it can open the stay view, a plain chip otherwise. */
     function StayChip({
       onOpen,
       label,
       className,
       children,
     }: {
       onOpen?: () => void;
       label: string;
       className: string;
       children: React.ReactNode;
     }) {
       if (!onOpen) {
         return (
           <span data-chip className={className}>
             {children}
           </span>
         );
       }
       return (
         <button
           type="button"
           data-chip
           aria-label={label}
           onClick={onOpen}
           className={cn(className, "tap-target cursor-pointer hover:brightness-95 focus-visible:outline-[3px] focus-visible:outline-ring")}
         >
           {children}
         </button>
       );
     }
     ```
  3. In `StopRow`, after `const hasCoords = …`:
     ```tsx
       const openNights = stay ? stay.totalNights - stay.coveredNights : 0;
       const openNightsText = `${openNights} ${openNights === 1 ? "night" : "nights"} open`;
     ```
  4. Replace the three `stay && stay.kind === …` chip blocks (L95–122) with:
     ```tsx
            {stay && stay.kind === "covered" && (
              <StayChip onOpen={onOpenStay} label={`Stay in ${stop.name}: ${stay.name}`} className={cn(CHIP, "bg-teal/15")}>
                <Check className="size-3.5" aria-hidden />
                {stay.name}
              </StayChip>
            )}
            {stay && stay.kind === "partial" && (
              <StayChip
                onOpen={onOpenStay}
                label={`Stay in ${stop.name}: ${stay.name}, ${openNightsText}`}
                className={cn(CHIP, "bg-sun/30")}
              >
                <Check className="size-3.5" aria-hidden />
                {stay.name} · {openNightsText}
              </StayChip>
            )}
            {stay && stay.kind === "none" && (
              <StayChip
                onOpen={onOpenStay}
                label={`No bed yet in ${stop.name} — add a stay`}
                className={cn(CHIP, "border-dashed bg-coral/20")}
              >
                No bed yet
              </StayChip>
            )}
     ```
     The plans/ideas count chips stay `<span data-chip>`, so clicking them toggles the row (G1). The chip `<button>` matches `OWN_CLICK`, so it never toggles.
  5. `itinerary-manager.tsx`, `<StopRow …>` in `renderDesktopStop`: add after `onToggle={() => planBody.toggle(stop.id)}`:
     ```tsx
                onOpenStay={() => {
                  // Spec 2026-10-05 §G: open the Stop and its stay detail view on the chip's stay
                  // (the first, as stayStatus names it) — or, with none, on "No bed yet".
                  planBody.open(stop.id);
                  setStayView({ stopId: stop.id, accommodationId: stop.accommodations[0]?.id ?? null });
                }}
     ```

- [ ] **Step 4: Run them and watch them pass.**
  - `TZ=UTC npx vitest run components/plan/stop-row.test.tsx components/trip/itinerary-manager.test.tsx`. Expected: all pass. That includes the existing "hides zero counts; partial and no-bed stay chips" test (`getByText` still finds the chip text) and the D3 test (`getByRole("button", { name: "Hotel Roma" })` stays unique because the chip's name is "Stay in Rome: Hotel Roma").
  - Full gate: `npm test && npx tsc --noEmit && npm run lint`. Expected: green.
  - Manual check on `npm run dev` at 1920×911: on a folded Stop, click the stay chip. The Stop opens and the stay detail view shows that stay. Do the same on a dated Stop with "No bed yet": the empty state appears, and its "+ Add a stay" opens the Accommodation form.

- [ ] **Step 5: Commit.**
```bash
git add components/plan/stop-row.tsx components/plan/stop-row.test.tsx components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "$(cat <<'EOF'
feat(plan): the stay chip opens the Stop and its stay detail view

Spec 2026-10-05 §G: the folded row's stay chip is a button — it opens the
Stop and the §D stay view on that stay; "No bed yet" opens it ready to add
one. Never toggles the row itself.

Resolves-Feedback: cmutb86et000204lb5g9y2tez
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Review focus candidates
- G1's header click guard: portalled ⋯ menu items bubble through React (`currentTarget.contains` check), and a press that started on the grip is ignored, so drag-release can't toggle. Also confirm `gap-y-[inherit]` (D4) really reproduces phone spacing in the browser, not just in class names.
- D2/D3 regressions against the old AccommodationCard path: Delete, note thread, attachment upload and the multi-cost CostEditor must all stay reachable from the stay detail view. The `key` on StayDialog must re-seed the selection whenever the chip, block or Add path opens it.
- D6 screenshot results: does Transport/Accommodation edit actually fit at 1920×911? If one scrolls, the pinned header and footer must work and nothing may be clipped, and phones (<640) must be pixel-identical.
### Task 29: [Z1] Release notes, follow-ups, full verification

**Files:**
- Modify: `lib/release-notes.ts` (top of `RELEASE_NOTES`), `docs/open-follow-ups.md` (the `## 2026-10-05` section)

- [ ] **Step 1: Release notes** — add at the top of `RELEASE_NOTES` (newest first, one line, Traveller language, no markdown), `publishedAt` decreasing by a minute from the current UTC time:
  - "Feedback: answered notes now say what was done, and older ones tuck away behind Show resolved."
  - "Plan: with a flight home booked, the plan counts against that flight instead of a separate home-by date."
  - "Plan: hotel details open in a roomier view, and edit forms use the width of your screen."
  - "Wishlist: Schedule offers the days you're actually near that place."
  - "Plan: a journey with several legs reads top to bottom, like stops on a metro line."
  - "Plan: tap anywhere on a stop to open it."
  - "Trip home: portrait cover photos show in full on phones."
  Then run `TZ=UTC npx vitest run lib/release-notes.test.ts` — PASS.
- [ ] **Step 2: Follow-ups** — append to the `## 2026-10-05` section of `docs/open-follow-ups.md` anything the tasks deferred, at minimum: the Wishlist page's `trip.stops` is not Fork-filtered (found in E4); the Compare badge still reads "Over hard end" (left by C); any review-loop deferrals recorded during execution. One bullet each, `GM-02`, `GM-03`, … numbering.
- [ ] **Step 3: Full verification** — run `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. All must pass; paste failures and fix before committing.
- [ ] **Step 4: Commit**

```bash
git add lib/release-notes.ts docs/open-follow-ups.md
git commit -m "docs: release notes and follow-ups for the 2026-10-05 batch

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
