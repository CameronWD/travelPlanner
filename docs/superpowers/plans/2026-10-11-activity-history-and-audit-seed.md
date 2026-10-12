# Activity history, clickInCard and demo-seed toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record Checklist, Reminder and Vote changes in Activity and make Day-title lines say what changed (TC-07); make the layout audit's `clickInCard` find `Button`-rendered triggers (TC-08); have the demo seed switch on What-if plans and Chapters when it seeds them (TC-09).

**Architecture:** Every new Activity line goes through the existing best-effort `recordActivity` hook (ADR 0012). The wording lives in pure builders in `lib/activity.ts`, written into the existing `{ summary }` payload where a line is not a field diff; one new `activityLine()` helper renders `summary ?? headline` so the feed, the bell and the MCP `get_activity` read all show the same sentence. TC-08 swaps a CSS text selector for `Locator.getByRole` (real Playwright, already a dependency). TC-09 adds a pure `demoTripToggles()` used by the demo persister.

**Tech Stack:** Next.js server actions, Prisma 7 (Postgres), Vitest (node + happy-dom projects), Playwright 1.63 (scripts only).

**Spec:** `docs/specs/2026-10-11-activity-history-and-audit-seed.md` (domain decisions: `CONTEXT.md` **Activity**, ADR 0012 amendment 2026-10-11).

## Global Constraints

- Branch: `feat/activity-history-and-audit-seed-2026-10-11`. Never commit to `main`. Never deploy.
- Read `node_modules/next/dist/docs/` before touching anything Next-specific (this repo's Next has breaking changes). These tasks only touch server actions and pure modules, so no new Next APIs are expected.
- `recordActivity` is called **after** the write succeeds and is best-effort — never let it change an action's return value or throw.
- Checklists, Reminders and Votes have no Plan: call `recordActivity` from `@/server/actions/activity` directly. Day titles keep `recordPlanActivity` (forks stay silent).
- No migration. `Activity.entityType` is a plain `String`; new values are added only to `ACTIVITY_ENTITY_TYPES`.
- Not recorded, ever: Packing/Shopping ticks, `setBuyState`, `reorderChecklistItem`, `saveAsTemplate`, `deleteTemplate`, `clearVote`, a vote re-set to the same level, a Day title re-set to the same text.
- Existing `DAY_TITLE` rows (entityLabel `"Day title"`, no `changes`) must keep rendering as "updated a day title" / "removed a day title".
- Verification tiers (CLAUDE.md): inner loop `npx vitest run <test files>`; task done `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. The full suite and `next build` never run per task.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. A Pre-trip item "toggled" to the state it is already in (double click, stale UI) must record nothing — Task 3 pins it.
2. Updating a Checklist item with only an unchanged field (same text) must record nothing — `recordActivity` drops an UPDATED with `[]` changes; Task 3 pins that the action passes `[]`.
3. An `applyTemplate` whose items are all already on the list (nothing added) must record nothing — Task 3 pins it.
4. A Reminder edit that only re-sends the same title/date must record nothing; one that moves the "about" Stop must show Stop **names**, not ids — Task 4 pins both.
5. The bell and MCP `get_activity` must show the `summary` sentence (today they ignore it and would print e.g. "updated the Sintra vote") — Task 1 pins it in both.

---

### Task 1: Activity vocabulary, line builders and `activityLine`

**Files:**
- Modify: `lib/activity.ts`
- Modify: `components/trip/activity-feed.tsx`
- Modify: `components/trip/notification-bell.tsx`
- Modify: `lib/mcp/tools/reads.ts` (the `get_activity` read, ~line 120-145)
- Test: `lib/activity.test.ts`, `components/trip/activity-feed.test.tsx`, `components/trip/notification-bell.test.tsx`, the existing test for `reads.ts` (find with `ls lib/mcp/tools/reads*.test.ts`)

**Interfaces:**
- Produces (all exported from `lib/activity.ts`):
  - `ACTIVITY_ENTITY_TYPES` gains `"CHECKLIST_ITEM"`, `"REMINDER"`, `"VOTE"`.
  - `FIELD_SPECS.CHECKLIST_ITEM` keys: `text` ("Text"), `dueDate` ("Due date", date), `assignedToName` ("Assigned to"). `FIELD_SPECS.REMINDER` keys: `title` ("Reminder"), `date` ("Date", date), `stopName` ("About"). `FIELD_SPECS.VOTE = []`.
  - `entityLabel("CHECKLIST_ITEM", { text })`, `entityLabel("REMINDER", { title })`, `entityLabel("VOTE", { title })`, `entityLabel("DAY_TITLE", { title })` (falls back to `"Day title"` when no title).
  - `checklistItemSummary(verb: "CREATED" | "DELETED", text: string, kind: string): ActivitySummary`
  - `checklistTickSummary(text: string, done: boolean): ActivitySummary`
  - `templateAppliedSummary(count: number, templateName: string): ActivitySummary`
  - `voteSummary(title: string, from: VoteLevel | null, to: VoteLevel): ActivitySummary`
  - `dayTitleSummary(input: { date: string; stopName: string; before: string | null; after: string | null }): ActivitySummary`
  - `activityLine(a: { verb: ActivityVerb; entityType: ActivityEntityType; entityLabel: string; changes: unknown }): string`

- [ ] **Step 1: Write the failing tests** — append to `lib/activity.test.ts`:

```ts
import {
  activityLine,
  checklistItemSummary,
  checklistTickSummary,
  dayTitleSummary,
  describeChanges,
  entityLabel,
  headline,
  templateAppliedSummary,
  voteSummary,
} from "@/lib/activity";

describe("TC-07 line builders", () => {
  it("names the list a Checklist item was added to or removed from", () => {
    expect(checklistItemSummary("CREATED", "Travel insurance", "PRETRIP")).toEqual({
      summary: "added Travel insurance to the pre-trip checklist",
    });
    expect(checklistItemSummary("DELETED", "Sunscreen", "PACKING")).toEqual({
      summary: "removed Sunscreen from the packing list",
    });
    expect(checklistItemSummary("CREATED", "Adapter", "SHOPPING").summary).toBe(
      "added Adapter to the shopping list",
    );
  });

  it("ticks and un-ticks", () => {
    expect(checklistTickSummary("Travel insurance", true).summary).toBe("ticked off Travel insurance");
    expect(checklistTickSummary("Travel insurance", false).summary).toBe("un-ticked Travel insurance");
  });

  it("counts a template's items, singular and plural", () => {
    expect(templateAppliedSummary(23, "Beach").summary).toBe(
      "added 23 items from the Beach template to the packing list",
    );
    expect(templateAppliedSummary(1, "Beach").summary).toBe(
      "added 1 item from the Beach template to the packing list",
    );
  });

  it("words a new vote and a changed vote", () => {
    expect(voteSummary("Sintra", null, "MUST").summary).toBe("voted must-do on Sintra");
    expect(voteSummary("Sintra", "KEEN", "MEH").summary).toBe(
      "changed their vote on Sintra from keen to meh",
    );
  });

  it("words a Day title set, rename and removal with the day and the Stop", () => {
    const base = { date: "2026-12-11", stopName: "Lisbon" };
    expect(dayTitleSummary({ ...base, before: null, after: "Sintra day trip" }).summary).toBe(
      "titled Fri 11 Dec in Lisbon “Sintra day trip”",
    );
    expect(dayTitleSummary({ ...base, before: "Sintra day trip", after: "Rest day" }).summary).toBe(
      "renamed Fri 11 Dec in Lisbon from “Sintra day trip” to “Rest day”",
    );
    expect(dayTitleSummary({ ...base, before: "Sintra day trip", after: null }).summary).toBe(
      "removed the “Sintra day trip” title from Fri 11 Dec in Lisbon",
    );
  });
});

describe("TC-07 entity types", () => {
  it("diffs a Checklist item's text, due date and assignee name", () => {
    expect(
      describeChanges(
        "CHECKLIST_ITEM",
        { text: "Insurance", dueDate: null, assignedToName: null },
        { text: "Travel insurance", dueDate: "2026-11-20", assignedToName: "Sam" },
      ).map((c) => [c.label, c.from, c.to]),
    ).toEqual([
      ["Text", "Insurance", "Travel insurance"],
      ["Due date", "", "Fri 20 Nov 2026"],
      ["Assigned to", "", "Sam"],
    ]);
  });

  it("diffs a Reminder's title, date and Stop name", () => {
    expect(
      describeChanges(
        "REMINDER",
        { title: "Print docs", date: "2026-11-26", stopName: null },
        { title: "Print docs", date: "2026-11-28", stopName: "Lisbon" },
      ).map((c) => c.label),
    ).toEqual(["Date", "About"]);
  });

  it("labels the new entity types from their text", () => {
    expect(entityLabel("CHECKLIST_ITEM", { text: "Sunscreen" })).toBe("Sunscreen");
    expect(entityLabel("REMINDER", { title: "Print docs" })).toBe("Print docs");
    expect(entityLabel("VOTE", { title: "Sintra" })).toBe("Sintra");
    expect(entityLabel("DAY_TITLE", { title: "Rest day" })).toBe("Rest day");
    expect(entityLabel("DAY_TITLE", {})).toBe("Day title");
  });

  it("gives the new entity types sensible fallback headlines", () => {
    expect(headline({ verb: "UPDATED", entityType: "CHECKLIST_ITEM", entityLabel: "Sunscreen" })).toBe(
      "updated the Sunscreen checklist item",
    );
    expect(headline({ verb: "CREATED", entityType: "REMINDER", entityLabel: "Print docs" })).toBe(
      "added the Print docs reminder",
    );
    expect(headline({ verb: "CREATED", entityType: "VOTE", entityLabel: "Sintra" })).toBe("voted on Sintra");
  });
});

describe("activityLine", () => {
  it("prefers a summary payload", () => {
    expect(
      activityLine({
        verb: "UPDATED",
        entityType: "VOTE",
        entityLabel: "Sintra",
        changes: { summary: "voted must-do on Sintra" },
      }),
    ).toBe("voted must-do on Sintra");
  });

  it("falls back to the headline for diffs, excerpts and null", () => {
    expect(activityLine({ verb: "UPDATED", entityType: "STOP", entityLabel: "Rome", changes: [] })).toBe(
      "updated the Rome stop",
    );
    expect(activityLine({ verb: "NOTED", entityType: "NOTE", entityLabel: "note", changes: { excerpt: "hi" } })).toBe(
      "left a note",
    );
  });

  it("still renders a legacy Day-title row as before", () => {
    expect(activityLine({ verb: "UPDATED", entityType: "DAY_TITLE", entityLabel: "Day title", changes: null })).toBe(
      "updated a day title",
    );
    expect(activityLine({ verb: "DELETED", entityType: "DAY_TITLE", entityLabel: "Day title", changes: null })).toBe(
      "removed a day title",
    );
  });
});
```

(Merge the import into the file's existing import from `@/lib/activity` rather than adding a duplicate import line.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/activity.test.ts`
Expected: FAIL — `checklistItemSummary` (etc.) is not exported; `"CHECKLIST_ITEM"` not assignable.

- [ ] **Step 3: Implement in `lib/activity.ts`**

Imports: add `formatDayLabel` to the existing `@/lib/dates` import, and `import type { VoteLevel } from "@/lib/enum-values";`.

Vocab:

```ts
export const ACTIVITY_ENTITY_TYPES = [
  "STOP",
  "ITEM",
  "TRANSPORT",
  "ACCOMMODATION",
  "CHAPTER",
  "COST",
  "NOTE",
  "FORK",
  "ATTACHMENT",
  "DAY_TITLE",
  "CHECKLIST_ITEM",
  "REMINDER",
  "VOTE",
] as const;
```

Field specs (add to `FIELD_SPECS`):

```ts
  // assignedToName is resolved to a display name by the caller — an id would
  // be meaningless in the feed.
  CHECKLIST_ITEM: [
    { key: "text", label: "Text" },
    { key: "dueDate", label: "Due date", format: (v) => dateFormat(v) },
    { key: "assignedToName", label: "Assigned to" },
  ],
  // stopName, likewise, is the "about" Stop's name, resolved by the caller.
  REMINDER: [
    { key: "title", label: "Reminder" },
    { key: "date", label: "Date", format: (v) => dateFormat(v) },
    { key: "stopName", label: "About" },
  ],
  // VOTE is always a { summary } line — nothing to diff
  VOTE: [],
```

`entityLabel` — replace the `DAY_TITLE` case and add three:

```ts
    case "DAY_TITLE":
      // Rows written before 2026-10-11 snapshot no title; they keep "Day title".
      return str(row.title) || "Day title";

    case "CHECKLIST_ITEM":
      return str(row.text) || "checklist item";

    case "REMINDER":
      return str(row.title) || "reminder";

    case "VOTE":
      return str(row.title) || "an idea";
```

`ENTITY_NOUN` gains `CHECKLIST_ITEM: "checklist item"`, `REMINDER: "reminder"`, `VOTE: "vote"`.

`headline` — add, right after the `DAY_TITLE` branch:

```ts
  // A vote line normally carries a summary ("voted must-do on Sintra"); this
  // is only the fallback, and "{verb} the Sintra vote" would misread.
  if (a.entityType === "VOTE") {
    return `voted on ${a.entityLabel}`;
  }
```

Leave the existing `DAY_TITLE` branch exactly as is (legacy rows depend on it).

New section after `headline`:

```ts
// ---------------------------------------------------------------------------
// Summary builders — TC-07 (ADR 0012 amendment 2026-10-11)
// ---------------------------------------------------------------------------

const CHECKLIST_LIST_NAME: Record<string, string> = {
  PRETRIP: "the pre-trip checklist",
  PACKING: "the packing list",
  SHOPPING: "the shopping list",
};

function checklistListName(kind: string): string {
  return CHECKLIST_LIST_NAME[kind] ?? "a checklist";
}

export function checklistItemSummary(
  verb: "CREATED" | "DELETED",
  text: string,
  kind: string,
): ActivitySummary {
  const list = checklistListName(kind);
  return { summary: verb === "CREATED" ? `added ${text} to ${list}` : `removed ${text} from ${list}` };
}

/** Only Pre-trip ticks are recorded — the caller decides; this just words it. */
export function checklistTickSummary(text: string, done: boolean): ActivitySummary {
  return { summary: done ? `ticked off ${text}` : `un-ticked ${text}` };
}

export function templateAppliedSummary(count: number, templateName: string): ActivitySummary {
  const items = count === 1 ? "1 item" : `${count} items`;
  return { summary: `added ${items} from the ${templateName} template to the packing list` };
}

const VOTE_LEVEL_WORD: Record<VoteLevel, string> = {
  MUST: "must-do",
  KEEN: "keen",
  MEH: "meh",
};

export function voteSummary(title: string, from: VoteLevel | null, to: VoteLevel): ActivitySummary {
  if (from === null) return { summary: `voted ${VOTE_LEVEL_WORD[to]} on ${title}` };
  return { summary: `changed their vote on ${title} from ${VOTE_LEVEL_WORD[from]} to ${VOTE_LEVEL_WORD[to]}` };
}

/** "Fri 11 Dec in Lisbon" — the day and Stop as they were when the title changed. */
export function dayTitleSummary(input: {
  date: string;
  stopName: string;
  before: string | null;
  after: string | null;
}): ActivitySummary {
  const where = `${formatDayLabel(input.date)} in ${input.stopName}`;
  if (input.before === null) return { summary: `titled ${where} “${input.after ?? ""}”` };
  if (input.after === null) return { summary: `removed the “${input.before}” title from ${where}` };
  return { summary: `renamed ${where} from “${input.before}” to “${input.after}”` };
}

// ---------------------------------------------------------------------------
// activityLine — the one sentence every surface shows
// ---------------------------------------------------------------------------

/**
 * The line after the actor's name: a `{ summary }` payload when the row has
 * one (ADR 0012 §3b), otherwise the generic headline. The feed, the bell and
 * the MCP `get_activity` read all go through this so they say the same thing.
 */
export function activityLine(a: {
  verb: ActivityVerb;
  entityType: ActivityEntityType;
  entityLabel: string;
  changes: unknown;
}): string {
  const c = a.changes;
  if (c !== null && typeof c === "object" && !Array.isArray(c) && typeof (c as { summary?: unknown }).summary === "string") {
    return (c as ActivitySummary).summary;
  }
  return headline(a);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run lib/activity.test.ts`
Expected: PASS. Fix any `Record<ActivityEntityType, …>` exhaustiveness errors `tsc` reports elsewhere (`npx tsc --noEmit`) — each needs the three new keys.

- [ ] **Step 5: Use `activityLine` on all three surfaces — failing tests first**

In `components/trip/notification-bell.test.tsx`, add a test that renders the bell with one recent row `{ verb: "UPDATED", entityType: "VOTE", entityLabel: "Sintra", changes: { summary: "voted must-do on Sintra" }, … }` (copy the shape of an existing row in that file) and asserts `screen.getByText(/voted must-do on Sintra/)` is present and `/voted on Sintra/` is not.

In the `reads.ts` test, add a `get_activity` case where the mocked `db.activity.findMany` returns a row with `changes: { summary: "ticked off Travel insurance" }` and assert the result's `what` is `"ticked off Travel insurance"`.

`components/trip/activity-feed.test.tsx` already covers summary rows; keep it green.

Run: `npx vitest run components/trip/notification-bell.test.tsx lib/mcp/tools/reads.test.ts` (adjust the reads test path to the real file). Expected: the two new tests FAIL.

- [ ] **Step 6: Implement**

- `components/trip/activity-feed.tsx`: delete the local `summary` extraction block; compute `const line = activityLine({ verb, entityType, entityLabel, changes: activity.changes })` and render `{line}` where it rendered `{summary ?? headlineText}`. Drop the now-unused `headline` import.
- `components/trip/notification-bell.tsx`: replace the `headline({...})` call with `activityLine({ verb: …, entityType: …, entityLabel: item.entityLabel, changes: item.changes })`, keeping the same casts.
- `lib/mcp/tools/reads.ts`: add `changes: true` to the `select`, and set `what: activityLine({ verb: r.verb as ActivityVerb, entityType: r.entityType as ActivityEntityType, entityLabel: r.entityLabel, changes: r.changes })`.

Run the three test files plus `lib/activity.test.ts`. Expected: PASS.

- [ ] **Step 7: Task-done checks and commit**

```bash
npx vitest related --run lib/activity.ts components/trip/activity-feed.tsx components/trip/notification-bell.tsx lib/mcp/tools/reads.ts
npx tsc --noEmit
npx eslint lib/activity.ts lib/activity.test.ts components/trip/activity-feed.tsx components/trip/notification-bell.tsx components/trip/notification-bell.test.tsx lib/mcp/tools/reads.ts
git add -A lib/activity.ts lib/activity.test.ts components/trip lib/mcp/tools
git commit -m "feat(activity): vocabulary and line builders for checklists, reminders, votes, day titles

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Checklist actions record Activity

**Files:**
- Modify: `server/actions/checklists.ts`
- Test: `server/actions/checklists.test.ts`

**Interfaces:**
- Consumes: `recordActivity` from `@/server/actions/activity`; `entityLabel`, `describeChanges`, `checklistItemSummary`, `checklistTickSummary`, `templateAppliedSummary` from `@/lib/activity` (Task 1); `TRAVELLER_SELECT`, `travellerName` from `@/lib/traveller`.

- [ ] **Step 1: Mock `recordActivity` and write failing tests**

At the top of `checklists.test.ts`, add `recordActivityMock: vi.fn().mockResolvedValue(undefined)` to the `vi.hoisted` block and:

```ts
vi.mock("@/server/actions/activity", () => ({ recordActivity: recordActivityMock }));
```

The access helper will now select more columns, so set a fuller default for `checklistItemFindUniqueMock` in the tests below:

```ts
const PRETRIP_ITEM = {
  id: "ci-1",
  tripId: "trip-1",
  kind: "PRETRIP",
  text: "Travel insurance",
  done: false,
  dueDate: null,
  assignedTo: null,
};
```

Tests to add (one `describe("Activity", …)` block):

```ts
it("adding records CREATED with the list named", async () => {
  checklistItemFindFirstMock.mockResolvedValue(null);
  checklistItemCreateMock.mockResolvedValue({ id: "ci-new" });
  await addChecklistItem("trip-1", { kind: "PRETRIP", text: "Travel insurance" });
  expect(recordActivityMock).toHaveBeenCalledWith({
    tripId: "trip-1",
    verb: "CREATED",
    entityType: "CHECKLIST_ITEM",
    entityId: "ci-new",
    entityLabel: "Travel insurance",
    changes: { summary: "added Travel insurance to the pre-trip checklist" },
  });
});

it("editing records UPDATED with field diffs, assignee by name", async () => {
  checklistItemFindUniqueMock.mockResolvedValue(PRETRIP_ITEM);
  tripMemberFindUniqueMock.mockResolvedValue({ userId: "user-2" });
  checklistItemUpdateMock.mockResolvedValue({
    text: "Travel insurance",
    dueDate: "2026-11-20",
    assignedTo: { id: "user-2", name: "Sam", displayName: null, email: "s@x", image: null },
  });
  await updateChecklistItem("ci-1", { text: "Travel insurance", dueDate: "2026-11-20", assignedToId: "user-2" });
  const call = recordActivityMock.mock.calls[0][0];
  expect(call).toMatchObject({ verb: "UPDATED", entityType: "CHECKLIST_ITEM", entityId: "ci-1", entityLabel: "Travel insurance" });
  expect(call.changes.map((c: { label: string }) => c.label)).toEqual(["Due date", "Assigned to"]);
});

it("an edit that changes nothing passes empty changes (recordActivity drops it)", async () => {
  checklistItemFindUniqueMock.mockResolvedValue(PRETRIP_ITEM);
  checklistItemUpdateMock.mockResolvedValue({ text: "Travel insurance", dueDate: null, assignedTo: null });
  await updateChecklistItem("ci-1", { text: "Travel insurance" });
  expect(recordActivityMock.mock.calls[0][0].changes).toEqual([]);
});

it("ticking a Pre-trip item records it; un-ticking too", async () => {
  checklistItemFindUniqueMock.mockResolvedValue(PRETRIP_ITEM);
  await toggleChecklistItem("ci-1", true);
  expect(recordActivityMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ verb: "UPDATED", changes: { summary: "ticked off Travel insurance" } }),
  );
  checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, done: true });
  await toggleChecklistItem("ci-1", false);
  expect(recordActivityMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ changes: { summary: "un-ticked Travel insurance" } }),
  );
});

it("toggling a Pre-trip item to the state it is already in records nothing", async () => {
  checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, done: true });
  await toggleChecklistItem("ci-1", true);
  expect(recordActivityMock).not.toHaveBeenCalled();
});

it.each(["PACKING", "SHOPPING"])("ticking a %s item records nothing", async (kind) => {
  checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, kind });
  await toggleChecklistItem("ci-1", true);
  expect(recordActivityMock).not.toHaveBeenCalled();
});

it("removing records DELETED with the list named", async () => {
  checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, kind: "PACKING", text: "Sunscreen" });
  await deleteChecklistItem("ci-1");
  expect(recordActivityMock).toHaveBeenCalledWith(
    expect.objectContaining({ verb: "DELETED", entityLabel: "Sunscreen", changes: { summary: "removed Sunscreen from the packing list" } }),
  );
});

it("applying a template records one line with the count", async () => {
  packingTemplateFindUniqueMock.mockResolvedValue({ id: "t1", ownerId: "user-1", name: "Beach", itemsJson: '["Sunscreen","Hat"]' });
  checklistItemFindManyMock.mockResolvedValue([]);
  await applyTemplate("trip-1", "t1");
  expect(recordActivityMock).toHaveBeenCalledTimes(1);
  expect(recordActivityMock).toHaveBeenCalledWith(
    expect.objectContaining({
      verb: "CREATED",
      entityType: "CHECKLIST_ITEM",
      entityId: null,
      entityLabel: "Beach",
      changes: { summary: "added 2 items from the Beach template to the packing list" },
    }),
  );
});

it("applying a template that adds nothing records nothing", async () => {
  packingTemplateFindUniqueMock.mockResolvedValue({ id: "t1", ownerId: "user-1", name: "Beach", itemsJson: '["Sunscreen"]' });
  checklistItemFindManyMock.mockResolvedValue([{ text: "Sunscreen", sortOrder: 0 }]);
  await applyTemplate("trip-1", "t1");
  expect(recordActivityMock).not.toHaveBeenCalled();
});

it("buy state, reorder and templates record nothing", async () => {
  checklistItemFindUniqueMock.mockResolvedValue({ ...PRETRIP_ITEM, kind: "PACKING" });
  await setBuyState("ci-1", "NEEDED");
  queryRawMock.mockResolvedValue([{ id: "ci-0", sortOrder: 0 }, { id: "ci-1", sortOrder: 1 }]);
  await reorderChecklistItem("ci-1", "up");
  checklistItemFindManyMock.mockResolvedValue([]);
  packingTemplateCreateMock.mockResolvedValue({ id: "t2" });
  await saveAsTemplate("trip-1", "Ski");
  packingTemplateFindUniqueMock.mockResolvedValue({ id: "t2", ownerId: "user-1" });
  await deleteTemplate("t2");
  expect(recordActivityMock).not.toHaveBeenCalled();
});
```

Make sure the file's `afterEach` clears `recordActivityMock` (if it uses `vi.clearAllMocks()` it already does).

Run: `npx vitest run server/actions/checklists.test.ts`
Expected: the new Activity tests FAIL (no `recordActivity` calls). Some existing tests that assert exact `create`/`update` arguments will fail once Step 2 adds `select` — fix those expectations to include the new `select` in Step 3.

- [ ] **Step 2: Implement in `server/actions/checklists.ts`**

Imports:

```ts
import { recordActivity } from "@/server/actions/activity";
import {
  checklistItemSummary,
  checklistTickSummary,
  describeChanges,
  entityLabel,
  templateAppliedSummary,
} from "@/lib/activity";
import { TRAVELLER_SELECT, travellerName, type TravellerLike } from "@/lib/traveller";
```

Widen the access helper so every action has the before-row from one read:

```ts
const CHECKLIST_ITEM_ACTIVITY_SELECT = {
  id: true,
  tripId: true,
  kind: true,
  text: true,
  done: true,
  dueDate: true,
  assignedTo: { select: TRAVELLER_SELECT },
} as const;

type ChecklistItemAccess = {
  id: string;
  tripId: string;
  kind: string;
  text: string;
  done: boolean;
  dueDate: string | null;
  assignedTo: TravellerLike | null;
};

/** Diff row for describeChanges — the assignee as a name, never an id. */
function activityRow(item: { text: string; dueDate: string | null; assignedTo: TravellerLike | null }) {
  return {
    text: item.text,
    dueDate: item.dueDate,
    assignedToName: item.assignedTo ? travellerName(item.assignedTo) : null,
  };
}
```

`requireChecklistItemAccess` returns `Promise<ChecklistItemAccess>` and uses `select: CHECKLIST_ITEM_ACTIVITY_SELECT`.

`addChecklistItem` — make the create return its id and record after it:

```ts
  const created = await db.checklistItem.create({
    data: { /* unchanged */ },
    select: { id: true },
  });

  await recordActivity({
    tripId,
    verb: "CREATED",
    entityType: "CHECKLIST_ITEM",
    entityId: created.id,
    entityLabel: entityLabel("CHECKLIST_ITEM", { text: data.text }),
    changes: checklistItemSummary("CREATED", data.text, data.kind),
  });
```

`updateChecklistItem` — `item` is already the before-row; the update returns the after-row:

```ts
  const after = await db.checklistItem.update({
    where: { id: itemId },
    data: { /* unchanged */ },
    select: { text: true, dueDate: true, assignedTo: { select: TRAVELLER_SELECT } },
  });

  await recordActivity({
    tripId: item.tripId,
    verb: "UPDATED",
    entityType: "CHECKLIST_ITEM",
    entityId: itemId,
    entityLabel: entityLabel("CHECKLIST_ITEM", { text: after.text }),
    changes: describeChanges("CHECKLIST_ITEM", activityRow(item), activityRow(after)),
  });
```

`toggleChecklistItem` — after the update:

```ts
  // ADR 0012 amendment 2026-10-11: only Pre-trip ticks are news to your
  // partner; Packing/Shopping ticks are personal bookkeeping. A toggle to the
  // state the item is already in (double click, stale UI) is not news either.
  if (item.kind === "PRETRIP" && item.done !== done) {
    await recordActivity({
      tripId: item.tripId,
      verb: "UPDATED",
      entityType: "CHECKLIST_ITEM",
      entityId: itemId,
      entityLabel: entityLabel("CHECKLIST_ITEM", { text: item.text }),
      changes: checklistTickSummary(item.text, done),
    });
  }
```

`deleteChecklistItem` — after the delete:

```ts
  await recordActivity({
    tripId: item.tripId,
    verb: "DELETED",
    entityType: "CHECKLIST_ITEM",
    entityId: itemId,
    entityLabel: entityLabel("CHECKLIST_ITEM", { text: item.text }),
    changes: checklistItemSummary("DELETED", item.text, item.kind),
  });
```

`applyTemplate` — add `name: true` to the template `select`, and after `createMany`:

```ts
  await recordActivity({
    tripId,
    verb: "CREATED",
    entityType: "CHECKLIST_ITEM",
    entityId: null,
    entityLabel: template.name,
    changes: templateAppliedSummary(newTexts.length, template.name),
  });
```

Do not touch `setBuyState`, `reorderChecklistItem`, `saveAsTemplate`, `deleteTemplate`, `listTemplates`.

- [ ] **Step 3: Run and fix**

Run: `npx vitest run server/actions/checklists.test.ts`
Expected: PASS after updating any existing exact-argument assertions for `create`/`update`/`findUnique` to include the new `select`. Also check `lib/mcp/tools/lists-write.test.ts` still passes (`npx vitest run lib/mcp/tools/lists-write.test.ts`) — it mocks the actions, so it should.

- [ ] **Step 4: Task-done checks and commit**

```bash
npx vitest related --run server/actions/checklists.ts
npx tsc --noEmit
npx eslint server/actions/checklists.ts server/actions/checklists.test.ts
git add server/actions/checklists.ts server/actions/checklists.test.ts
git commit -m "feat(activity): record checklist adds, edits, removals, pre-trip ticks, template applies

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Reminder actions record Activity

**Files:**
- Modify: `server/actions/reminders.ts`
- Test: `server/actions/reminders.test.ts`

**Interfaces:**
- Consumes: `recordActivity`; `entityLabel`, `describeChanges` (Task 1).

- [ ] **Step 1: Mock and write failing tests**

Add `recordActivityMock` to the hoisted block and `vi.mock("@/server/actions/activity", () => ({ recordActivity: recordActivityMock }));`.

```ts
describe("Activity", () => {
  it("adding records CREATED named by the Reminder's text", async () => {
    reminderCreateMock.mockResolvedValue({ id: "r-1" });
    await addReminder("trip-1", { title: "Print the insurance docs", date: "2026-11-28" });
    expect(recordActivityMock).toHaveBeenCalledWith({
      tripId: "trip-1",
      verb: "CREATED",
      entityType: "REMINDER",
      entityId: "r-1",
      entityLabel: "Print the insurance docs",
    });
  });

  it("editing records field diffs with the Stop by name", async () => {
    reminderFindUniqueMock.mockResolvedValue({
      id: "r-1", tripId: "trip-1", title: "Print docs", date: "2026-11-26", stop: null,
    });
    reminderUpdateMock.mockResolvedValue({ title: "Print docs", date: "2026-11-28", stop: { name: "Lisbon" } });
    // plus whatever mock assertStopOnTrip needs for stopId "stop-1" (see existing stopId tests)
    await updateReminder("r-1", { title: "Print docs", date: "2026-11-28", stopId: "stop-1" });
    const call = recordActivityMock.mock.calls[0][0];
    expect(call).toMatchObject({ verb: "UPDATED", entityType: "REMINDER", entityId: "r-1", entityLabel: "Print docs" });
    expect(call.changes).toEqual([
      { field: "date", label: "Date", from: "Thu 26 Nov 2026", to: "Sat 28 Nov 2026" },
      { field: "stopName", label: "About", from: "", to: "Lisbon" },
    ]);
  });

  it("an edit that re-sends the same values passes empty changes", async () => {
    reminderFindUniqueMock.mockResolvedValue({ id: "r-1", tripId: "trip-1", title: "Print docs", date: "2026-11-26", stop: null });
    reminderUpdateMock.mockResolvedValue({ title: "Print docs", date: "2026-11-26", stop: null });
    await updateReminder("r-1", { title: "Print docs", date: "2026-11-26" });
    expect(recordActivityMock.mock.calls[0][0].changes).toEqual([]);
  });

  it("removing records DELETED named by its text", async () => {
    reminderFindUniqueMock.mockResolvedValue({ id: "r-1", tripId: "trip-1", title: "Print docs", date: "2026-11-26", stop: null });
    await deleteReminder("r-1");
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "DELETED", entityType: "REMINDER", entityId: "r-1", entityLabel: "Print docs" }),
    );
  });

  it("a failed validation records nothing", async () => {
    await addReminder("trip-1", { title: "", date: "2026-11-28" });
    expect(recordActivityMock).not.toHaveBeenCalled();
  });
});
```

Use the mock names the file already has (they may differ slightly — read the hoisted block). Verify the weekday strings with `formatLongDate` before trusting them (26 Nov 2026 is a Thursday).

Run: `npx vitest run server/actions/reminders.test.ts` — expected FAIL.

- [ ] **Step 2: Implement in `server/actions/reminders.ts`**

```ts
import { recordActivity } from "@/server/actions/activity";
import { describeChanges, entityLabel } from "@/lib/activity";
```

`requireReminderAccess` selects and returns the before-row:

```ts
async function requireReminderAccess(reminderId: string): Promise<{
  id: string;
  tripId: string;
  title: string;
  date: string;
  stop: { name: string } | null;
}> {
  const reminder = await db.reminder.findUnique({
    where: { id: reminderId },
    select: { id: true, tripId: true, title: true, date: true, stop: { select: { name: true } } },
  });
  // … unchanged
}

/** Diff row — the "about" Stop by name, never by id. */
function activityRow(r: { title: string; date: string; stop: { name: string } | null }) {
  return { title: r.title, date: r.date, stopName: r.stop?.name ?? null };
}
```

`addReminder`, after the create:

```ts
  await recordActivity({
    tripId,
    verb: "CREATED",
    entityType: "REMINDER",
    entityId: reminder.id,
    entityLabel: entityLabel("REMINDER", { title }),
  });
```

`updateReminder` — give the update `select: { title: true, date: true, stop: { select: { name: true } } }`, keep its result as `after`, then:

```ts
  await recordActivity({
    tripId: reminder.tripId,
    verb: "UPDATED",
    entityType: "REMINDER",
    entityId: id,
    entityLabel: entityLabel("REMINDER", { title: after.title }),
    changes: describeChanges("REMINDER", activityRow(reminder), activityRow(after)),
  });
```

`deleteReminder`, after the delete:

```ts
  await recordActivity({
    tripId: reminder.tripId,
    verb: "DELETED",
    entityType: "REMINDER",
    entityId: id,
    entityLabel: entityLabel("REMINDER", { title: reminder.title }),
  });
```

- [ ] **Step 3: Run and fix**

Run: `npx vitest run server/actions/reminders.test.ts` — PASS after updating existing exact-argument assertions for `findUnique`/`update` to include the new `select`.

- [ ] **Step 4: Task-done checks and commit**

```bash
npx vitest related --run server/actions/reminders.ts
npx tsc --noEmit
npx eslint server/actions/reminders.ts server/actions/reminders.test.ts
git add server/actions/reminders.ts server/actions/reminders.test.ts
git commit -m "feat(activity): record reminder adds, edits and removals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Vote actions record Activity

**Files:**
- Modify: `server/actions/votes.ts`
- Test: `server/actions/votes.test.ts`

**Interfaces:**
- Consumes: `recordActivity`; `entityLabel`, `voteSummary` (Task 1); `VoteLevel` from `@/lib/enums`.

- [ ] **Step 1: Mock and write failing tests**

Add `recordActivityMock` and a `voteFindUniqueMock` to the hoisted block; mock `@/server/actions/activity`; add `findUnique: voteFindUniqueMock` to the `vote` mock in `@/lib/db`. Make the item mock return a title: `{ id: "item-1", tripId: "trip-1", title: "Sintra" }`.

```ts
describe("Activity", () => {
  it("a first vote records CREATED with the level", async () => {
    voteFindUniqueMock.mockResolvedValue(null);
    await setVote("trip-1", "item-1", "MUST");
    expect(recordActivityMock).toHaveBeenCalledWith({
      tripId: "trip-1",
      verb: "CREATED",
      entityType: "VOTE",
      entityId: "item-1",
      entityLabel: "Sintra",
      changes: { summary: "voted must-do on Sintra" },
    });
  });

  it("changing a vote records UPDATED from → to", async () => {
    voteFindUniqueMock.mockResolvedValue({ level: "KEEN" });
    await setVote("trip-1", "item-1", "MEH");
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "UPDATED", changes: { summary: "changed their vote on Sintra from keen to meh" } }),
    );
  });

  it("re-setting the same level records nothing", async () => {
    voteFindUniqueMock.mockResolvedValue({ level: "KEEN" });
    await setVote("trip-1", "item-1", "KEEN");
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("an invalid level records nothing", async () => {
    await setVote("trip-1", "item-1", "NOPE" as never);
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("clearing a vote records nothing", async () => {
    await clearVote("trip-1", "item-1");
    expect(recordActivityMock).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run server/actions/votes.test.ts` — expected FAIL.

- [ ] **Step 2: Implement in `server/actions/votes.ts`**

```ts
import { recordActivity } from "@/server/actions/activity";
import { entityLabel, voteSummary } from "@/lib/activity";
```

`requireItemInTrip` selects `title: true` too. In `setVote`, between `requireItemInTrip` and the upsert:

```ts
  const item = await requireItemInTrip(tripId, itemId);
  const previous = await db.vote.findUnique({
    where: { tripId_itemId_userId: { tripId, itemId, userId: user.id } },
    select: { level: true },
  });
```

After the upsert:

```ts
  // ADR 0012 amendment 2026-10-11. Votes sit on the trip-wide Wishlist, so
  // there is no fork gate. Re-picking the level you already had is not news.
  const previousLevel = (previous?.level ?? null) as VoteLevel | null;
  if (previousLevel !== parsedLevel.data) {
    await recordActivity({
      tripId,
      verb: previousLevel === null ? "CREATED" : "UPDATED",
      entityType: "VOTE",
      entityId: itemId,
      entityLabel: entityLabel("VOTE", { title: item.title }),
      changes: voteSummary(item.title, previousLevel, parsedLevel.data),
    });
  }
```

`clearVote` is unchanged.

- [ ] **Step 3: Run** `npx vitest run server/actions/votes.test.ts` — PASS (fix any existing exact `item.findUnique` select assertion).

- [ ] **Step 4: Task-done checks and commit**

```bash
npx vitest related --run server/actions/votes.ts
npx tsc --noEmit
npx eslint server/actions/votes.ts server/actions/votes.test.ts
git add server/actions/votes.ts server/actions/votes.test.ts
git commit -m "feat(activity): record setting and changing a vote

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Day-title lines name the title, day and Stop; strike TC-07

**Files:**
- Modify: `server/actions/day-titles.ts`
- Test: `server/actions/day-titles.test.ts`
- Modify: `docs/open-follow-ups.md` (TC-07 entry, ~line 2820)

**Interfaces:**
- Consumes: `recordPlanActivity` (unchanged), `entityLabel`, `dayTitleSummary` (Task 1).

- [ ] **Step 1: Failing tests** — replace the existing `"records Activity for a set"` test with:

```ts
describe("Activity", () => {
  it("a new title records CREATED naming the title, day and Stop", async () => {
    stopFindUniqueMock.mockResolvedValue(LISBON);
    dayTitleFindUniqueMock.mockResolvedValue(null);
    dayTitleUpsertMock.mockResolvedValue({ id: "dt-1" });
    await setDayTitle({ stopId: LISBON.id, date: "2026-12-11", title: "Sintra day trip" });
    expect(recordActivityMock).toHaveBeenCalledWith({
      tripId: LISBON.tripId,
      verb: "CREATED",
      entityType: "DAY_TITLE",
      entityId: "dt-1",
      entityLabel: "Sintra day trip",
      changes: { summary: "titled Fri 11 Dec in Lisbon “Sintra day trip”" },
    });
  });

  it("a rename records UPDATED from → to", async () => {
    stopFindUniqueMock.mockResolvedValue(LISBON);
    dayTitleFindUniqueMock.mockResolvedValue({ id: "dt-1", title: "Sintra day trip" });
    dayTitleUpsertMock.mockResolvedValue({ id: "dt-1" });
    await setDayTitle({ stopId: LISBON.id, date: "2026-12-11", title: "Rest day" });
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "UPDATED",
        entityLabel: "Rest day",
        changes: { summary: "renamed Fri 11 Dec in Lisbon from “Sintra day trip” to “Rest day”" },
      }),
    );
  });

  it("re-setting the same text records nothing", async () => {
    stopFindUniqueMock.mockResolvedValue(LISBON);
    dayTitleFindUniqueMock.mockResolvedValue({ id: "dt-1", title: "Rest day" });
    dayTitleUpsertMock.mockResolvedValue({ id: "dt-1" });
    await setDayTitle({ stopId: LISBON.id, date: "2026-12-11", title: "  Rest day " });
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it("clearing records DELETED naming the old title", async () => {
    stopFindUniqueMock.mockResolvedValue(LISBON);
    dayTitleFindUniqueMock.mockResolvedValue({ id: "dt-1", title: "Sintra day trip" });
    await setDayTitle({ stopId: LISBON.id, date: "2026-12-11", title: "" });
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "DELETED",
        entityLabel: "Sintra day trip",
        changes: { summary: "removed the “Sintra day trip” title from Fri 11 Dec in Lisbon" },
      }),
    );
  });
});
```

Use the mock names the file already has; `LISBON` needs `name: "Lisbon"` (add it to the fixture if missing) and a stay covering 11 Dec 2026. The Stop is on the real plan (`forkId: null`), so `recordPlanActivity` passes through to the mocked `recordActivity`. Keep the existing fork-silence coverage (if a test asserts nothing is recorded for a fork Stop, it stays).

Run: `npx vitest run server/actions/day-titles.test.ts` — expected FAIL.

- [ ] **Step 2: Implement in `server/actions/day-titles.ts`**

- Import `dayTitleSummary` alongside `entityLabel`.
- `StopAccess` gains `name: string`; `requireStopAccess` selects `name: true`.
- Delete path: `existing` must include `title` (it uses `findUnique` with no select, so it already does). Record:

```ts
      await recordPlanActivity(stop.forkId, {
        tripId: stop.tripId,
        verb: "DELETED",
        entityType: "DAY_TITLE",
        entityId: existing.id,
        entityLabel: entityLabel("DAY_TITLE", { title: existing.title }),
        changes: dayTitleSummary({ date, stopName: stop.name, before: existing.title, after: null }),
      });
```

- Set path: read the target row's current title before the upsert, then record only when it changed:

```ts
    const before = await db.dayTitle.findUnique({
      where: { stopId_dayIndex: { stopId: targetStopId, dayIndex: targetDayIndex } },
      select: { title: true },
    });
    const row = await db.dayTitle.upsert({ /* unchanged */ });
    // The Stop the Traveller was editing names the day, even when a
    // Changeover redirected the write to the partner's row.
    if (before?.title !== trimmed) {
      await recordPlanActivity(stop.forkId, {
        tripId: stop.tripId,
        verb: before ? "UPDATED" : "CREATED",
        entityType: "DAY_TITLE",
        entityId: row.id,
        entityLabel: entityLabel("DAY_TITLE", { title: trimmed }),
        changes: dayTitleSummary({ date, stopName: stop.name, before: before?.title ?? null, after: trimmed }),
      });
    }
```

Existing tests that count `dayTitle.findUnique` calls or assert its arguments on the changeover paths may need their mock sequences extended by one call — update them, don't weaken them.

- [ ] **Step 3: Run** `npx vitest run server/actions/day-titles.test.ts lib/activity.test.ts` — PASS.

- [ ] **Step 4: Strike TC-07** in `docs/open-follow-ups.md`, in the same style as TC-02/TC-04 (e.g. `- ~~**TC-07 · Checklist, Reminder, Day title and Vote history in Activity.**~~ **Done 2026-10-11** (spec 2026-10-11-activity-history-and-audit-seed): …` with one or two sentences: what is recorded, what deliberately is not, that the bell and MCP `get_activity` now show summary lines, and that Day titles already recorded but now say what changed). Add, as a new un-struck idea entry immediately after it: `**TC-10 · Group a burst of Votes or edits into one feed line.** Idea, not committed — only if the per-vote lines turn out noisy (ADR 0012 amendment 2026-10-11).`

- [ ] **Step 5: Task-done checks and commit**

```bash
npx vitest related --run server/actions/day-titles.ts
npx tsc --noEmit
npx eslint server/actions/day-titles.ts server/actions/day-titles.test.ts
git add server/actions/day-titles.ts server/actions/day-titles.test.ts docs/open-follow-ups.md
git commit -m "feat(activity): day-title lines name the title, day and stop; strike TC-07

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: TC-08 — `clickInCard` scopes with `getByRole`

**Files:**
- Modify: `scripts/layout-audit/overlays.ts` (Step docblock ~lines 45-63; `roleTagSelector` ~615; `resolveClickInCardTarget` ~651)
- Test: `scripts/layout-audit/overlays.test.ts` (the `save-template` describe, ~lines 195-260)
- Modify: `docs/open-follow-ups.md` (TC-08 entry)

**Context:** Playwright is a real dependency (`playwright@1.63.0`) and `import type { Locator, Page } from "playwright"` already gives `Locator.getByRole`. The `scripts/types/playwright-shim.d.ts` the old comment cites no longer exists. `:text-is()` matches the smallest element with the text — the shared `Button`'s inner `<span>` — so `button:text-is("Save as template")` finds nothing.

- [ ] **Step 1: Failing test** — in `overlays.test.ts`, give `fakeLocator` a `getByRole` and route the Card's inner lookup through it:

```ts
  function fakeLocator(count: number, onInner?: () => FakeLocator): FakeLocator {
    const self: FakeLocator = {
      count: vi.fn(async () => count),
      first: vi.fn(() => self),
      click: vi.fn(async () => {}),
      locator: vi.fn(() => fakeLocator(0)),
      getByRole: vi.fn(() => (onInner ? onInner() : fakeLocator(0))),
      waitFor: vi.fn(async () => {}),
    };
    return self;
  }
```

(add `getByRole` to the `FakeLocator` type), build `cardLocator` as `fakeLocator(opts.card, () => fakeLocator(opts.cardButton ?? 0))`, and add to the desktop-shape test:

```ts
    const card = page.locator.mock.results.find((r) => r.value.count && r.value.getByRole.mock.calls.length)?.value;
    expect(card.getByRole).toHaveBeenCalledWith("button", { name: "Save as template", exact: undefined });
    expect(card.locator).not.toHaveBeenCalled();
```

(If that lookup is awkward, hold `cardLocator` in a variable returned from `fakePage` and assert on it directly — simpler and clearer.)

Run: `npx vitest run scripts/layout-audit/overlays.test.ts` — expected FAIL (the code still calls `card.first().locator(...)`).

- [ ] **Step 2: Implement**

```ts
async function resolveClickInCardTarget(
  page: Page,
  step: Extract<Step, { clickInCard: unknown }>["clickInCard"],
  vars: Record<string, string>,
): Promise<{ target: Locator; scoped: boolean }> {
  const name = parseName(step.name, vars);
  const heading = parseName(step.heading, vars);
  if (typeof heading === "string") {
    const card = page.locator(cardHeadingSelector(heading));
    if ((await card.count()) > 0) {
      return { target: card.first().getByRole(step.role, { name, exact: step.exact }), scoped: true };
    }
  }
  return { target: page.getByRole(step.role, { name, exact: step.exact }), scoped: false };
}
```

Delete `roleTagSelector` (now unused). Keep `textSelector` — `cardHeadingSelector` still uses it for the `h3`. Rewrite the end of the `Step` docblock (the "Built on CSS text pseudo-classes … rather than `getByRole`, because the ambient Playwright type shim …" passage) to say: the trigger inside the Card is found with `Locator.getByRole`, because a CSS `:text-is()` selector matches the smallest element carrying the text — the shared `Button`'s inner label `<span>`, not the `<button>` (TC-08); only the Card itself is found by a CSS selector on its heading. Update the section comment above `roleTagSelector` ("clickInCard — CSS-selector scoping") to match.

- [ ] **Step 3: Run** `npx vitest run scripts/layout-audit/overlays.test.ts` — PASS.

- [ ] **Step 4: Live check (only if the local app is up).** Check with `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/` — if it is not 200, skip and say so in the report. If it is up, run the layout audit for just the `save-template` overlay at 1280px the way TC-04 did (see `scripts/layout-audit.ts --help` or its header comment for the overlay filter flag) and confirm the overlay opens. Never start or stop the dev server or touch the database.

- [ ] **Step 5: Strike TC-08** in `docs/open-follow-ups.md` (same style as TC-04: `~~…~~ **Fixed 2026-10-11**: …`, saying it now scopes with `card.getByRole`, and whether the live check ran).

- [ ] **Step 6: Task-done checks and commit**

```bash
npx vitest related --run scripts/layout-audit/overlays.ts
npx tsc --noEmit
npx eslint scripts/layout-audit/overlays.ts scripts/layout-audit/overlays.test.ts
git add scripts/layout-audit/overlays.ts scripts/layout-audit/overlays.test.ts docs/open-follow-ups.md
git commit -m "fix(layout-audit): clickInCard finds Button-rendered triggers via getByRole (TC-08)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: TC-09 — demo seed switches on What-if plans and Chapters

**Files:**
- Modify: `lib/demo/types.ts` (add `demoTripToggles`)
- Modify: `prisma/demo/persist.ts` (~line 321, `db.trip.create`)
- Test: `lib/demo/types.test.ts`, `lib/demo/eu-trip.test.ts`
- Modify: `docs/open-follow-ups.md` (TC-09 entry)

**Interfaces:**
- Produces: `export function demoTripToggles(trip: Pick<DemoTrip, "chapters" | "forks">): { forksEnabled: boolean; chaptersEnabled: boolean }`

- [ ] **Step 1: Failing tests**

`lib/demo/types.test.ts`:

```ts
import { demoTripToggles } from "@/lib/demo/types";

describe("demoTripToggles", () => {
  it("is off when the trip ships neither", () => {
    expect(demoTripToggles({ chapters: [], forks: [] })).toEqual({ forksEnabled: false, chaptersEnabled: false });
    expect(demoTripToggles({ chapters: [] })).toEqual({ forksEnabled: false, chaptersEnabled: false });
  });

  it("switches on what the trip ships", () => {
    const fork = {} as NonNullable<DemoTrip["forks"]>[number];
    const chapter = {} as DemoTrip["chapters"][number];
    expect(demoTripToggles({ chapters: [chapter], forks: [] })).toEqual({ forksEnabled: false, chaptersEnabled: true });
    expect(demoTripToggles({ chapters: [], forks: [fork] })).toEqual({ forksEnabled: true, chaptersEnabled: false });
  });
});
```

`lib/demo/eu-trip.test.ts` — add (use however that file already obtains the EU trip, e.g. via `buildDemo(...)` and the trip name):

```ts
it("ships What-if plans and Chapters, so the seed switches both on (TC-09)", () => {
  expect(demoTripToggles(euTrip)).toEqual({ forksEnabled: true, chaptersEnabled: true });
});
```

If the EU trip's real-plan `chapters` is empty and chapters only appear inside forks, stop and check `lib/demo/eu-trip.ts` — the toggle must be on when *any* plan of the trip has chapters, so count fork chapters too (see Step 3).

Run: `npx vitest run lib/demo/types.test.ts lib/demo/eu-trip.test.ts` — expected FAIL.

- [ ] **Step 2: Implement `demoTripToggles` in `lib/demo/types.ts`** (near the other helpers):

```ts
/**
 * TC-09: a demo trip that ships What-if plans or Chapters must have them
 * switched on, or the app hides data the seed went to the trouble of making.
 * Worked out from the data — there is no flag on DemoTrip.
 */
export function demoTripToggles(trip: Pick<DemoTrip, "chapters" | "forks">): {
  forksEnabled: boolean;
  chaptersEnabled: boolean;
} {
  const forks = trip.forks ?? [];
  return {
    forksEnabled: forks.length > 0,
    chaptersEnabled: trip.chapters.length > 0 || forks.some((f) => f.chapters.length > 0),
  };
}
```

(`DemoFork` extends `DemoPlan`, so it has `chapters` — confirm in `types.ts`; if it doesn't, use only `trip.chapters`.)

- [ ] **Step 3: Use it in `prisma/demo/persist.ts`** — in the `db.trip.create` `data`, after `roundTrip`:

```ts
      ...demoTripToggles(trip),
```

with `demoTripToggles` added to the existing import from the demo types module.

- [ ] **Step 4: Run** `npx vitest run lib/demo/types.test.ts lib/demo/eu-trip.test.ts prisma/demo/persist.test.ts` — PASS.

- [ ] **Step 5: Strike TC-09** in `docs/open-follow-ups.md` (`~~…~~ **Fixed 2026-10-11**: the demo persister switches on What-if plans and Chapters for any demo trip that ships them (worked out from the data), so a fresh \`db:seed\` gives "EU Christmas 2026" both`). Do NOT run `db:seed` — it wipes the local demo data; leave that to the operator.

- [ ] **Step 6: Task-done checks and commit**

```bash
npx vitest related --run lib/demo/types.ts prisma/demo/persist.ts
npx tsc --noEmit
npx eslint lib/demo/types.ts lib/demo/types.test.ts lib/demo/eu-trip.test.ts prisma/demo/persist.ts
git add lib/demo/types.ts lib/demo/types.test.ts lib/demo/eu-trip.test.ts prisma/demo/persist.ts docs/open-follow-ups.md
git commit -m "fix(demo): seed switches on what-if plans and chapters it ships (TC-09)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Branch finish (main session, once)

`npm test` + `npm run build` + `npm run test:integration` (if the local DB is up). Then superpowers:finishing-a-development-branch — report and wait; do not merge or deploy.
