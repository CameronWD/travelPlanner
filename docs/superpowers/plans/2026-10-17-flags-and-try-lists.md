# Flags and Try lists (Branch 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two additions:
- The six planning Flags from R7: closed that day, before opening, after closing, late for the slot, book by soon or overdue, and still to book close to the day.
- A shared, tickable Try list on Items (R6), with MCP `set_try_list` and `tick_try_entry` (R13).

**Architecture:**
- **Try list storage.** The Try list is a JSON-text column on Item, like opening hours.
- **Sharing.** A thing to do and its placed copies share it through one generalised Item-family helper. The helper never crosses a Surprise.
- **Ticks.** Ticks are atomic: the family's rows are locked before they are read and written.
- **Flags.** The new Flags are pure rules in `lib/flags.ts`, fed by `lib/flags-loader.ts`. They reach every existing Flag surface through the existing pipeline. An Item Flag targets the new `"ITEM"` type.

**Tech Stack:** Next.js 16.4 App Router, React 19.3, Prisma 7.10 (Postgres), zod 4, Vitest 4 with Testing Library, and the MCP SDK.

**Spec:** `docs/specs/2026-10-17-planning-model-and-review.md`. Covered here: R6, R7, R13 (Branch 2 tools), the Branch 2 contents, and the "Branch 1: as built" section that this plan builds on.

## Global Constraints

### Repo and branch rules
- Work on branch `feat/plan-flags-try-lists`. Never commit to, merge into, rebase onto or push `main`. Never deploy.
- Never run `feedback:resolve` or `feedback:accept`. Subagents never run `feedback:pull`.
- Do not commit `next dev`'s CLAUDE.md block.

### Verification tiers
| When | Run |
|---|---|
| Inner loop | `npx vitest run <test files>` |
| Task done | `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>` (+ the task's integration file via `npm run test:integration -- <file>`) |
| Once, in Task Z | `npm test` + `npm run build` + `npm run test:integration` |

### Sandbox
- Integration tests run against a throwaway Postgres on localhost, with `DATABASE_URL=postgresql://trip:trip@localhost:5432/trip?schema=public` exported and `DIRECT_URL` set to the same. Never point at host.docker.internal or production.
- `next build` runs only in a throwaway copy, never in /work.

### Feedback trailer
- **Task T.13's commit alone** carries `Resolves-Feedback: cmvaig9lq000v07gwt50bn7k0`, on its own line before Co-Authored-By. No other commit carries a Resolves-Feedback trailer.

### Commits and copy
- Commit messages use `type(scope): …` and end with the attribution trailers the controller gives.
- No em-dashes in UI copy (`test/copy-style.test.ts`); en-dashes are fine.

### Vocabulary (CONTEXT.md)
- Try list, Flag, Opening hours, Slot time, Booking state, Surprise, Fork, Thing to do, Changeover day.

### Codebase rules
- PATCH contract (`lib/patch.ts`: undefined keeps, null clears).
- ActionResult (ADR 0074).
- ESLint import boundaries (`eslint.config.mjs`: add only via `S`/`I` + `rules()`).
- `"use server"` exports belong in the `lib/server-action-exports.test.ts` ALLOWLIST.
- MCP writes go through `runWrite` and return the row, and every write tool goes in `lib/mcp/tools/write-returns.test.ts`.
- MCP reads and writes use the same vocabulary.
- Surprise masking follows ADR 0051/0072.

### Section S's actual exports are authoritative
Sections F and T were drafted in parallel with S. Where they differ:
- **List operations live in `lib/try-list.ts` (S.2).** These are `TryEntryInput`, `newTryEntryId(taken?)`, `applyTryListInput(current, input)`, `withEntryTried(list, entryId, tried)`, `untickAll`, and `tryListProgress(list) → {tried,total} | null`.
  - **T.1 does NOT create `lib/try-list-ops.ts`.** Read its `resolveTryList` as `applyTryListInput`, `tickEntry` as `withEntryTried`, and `triedCount` as `tryListProgress`. Treat a null result as no list.
  - T.1 adds only what S lacks to `lib/try-list.ts`: `triedLabel`, `tryListSummary` and `sameTryEntries`, with T.1's tests adapted to the names above.
- **`tryListInputSchema` already exists from S.3.** T.2 only wires it into `itemSchema`.
- **The Item family is `lib/item-family.ts` (S.4).** It provides `itemFamilyRoot(item)`, `itemFamilyWhere(tripId, rootId)`, `itemFamilyRecipients(item, client?)` (item first, client second; default `db`) and `writeItemFamily(tx, recipients, data)`. `updateItem` builds `familyData: ItemFamilyData`, and T adds `tryList` there.
  - T's lock (`SELECT … FOR UPDATE` over the family's rows, in id order) runs inside the transaction. It passes `tx` as the recipients helper's client.
- **Where the code differs from a brief,** use what exists and list the adaptation in the report.

## Review Focus

1. **Surprise boundary.**
   - A Surprise Item that is closed on its day, and a To book stay inside a Stop hidden from a member, flag for the planner and never for the member. An Item of a visible Stop on a shared Changeover day still flags. Tested in F.2 and F.12.
   - After the S.4 refactor, opening hours behave across a Surprise exactly as before. Tested in S.4.
2. **Concurrent ticks never lose a tick.** Three Travellers tick three different entries at once on three rows of one family; every row ends with all three ticked. A dialog opened before a partner's tick keeps that tick when saved. Tested in T.3 and T.4 (integration).
3. **Opening-hours edges in the Flags.** These cases must hold: a start in the lunch gap ("reopens at 14:00"), an end exactly at close (no Flag), no end time with the start 30 minutes before close (a Flag) and 31 minutes before (none), and a `24:00` close ("midnight"). Tested in F.3.
4. **One count everywhere.**
   - The nav badge counts exactly what Summary lists, including the new kinds.
   - A Wishlist idea that is To book and overdue never flags.
   - Nothing past its own date is flagged as due for booking.
   - Compare counts the new kinds in Fork columns too, measured against the real plan's today. This is a deliberate reading of R7: Flag *lists* are real-plan only.
   - Tested in F.5–F.7, F.10 and F.12.
5. **Copies.** Duplicate trip keeps the Try list's ids and text but resets every tick. A Fork keeps the ticks. A placed copy takes its idea's list. Tested in S.5 and S.6.

---

## Section S — Shared foundation: the Try list column, model and validations, the Item family, copies and masking

### Notes

**Interfaces this section produces (for F and T):**

- **Column.** `Item.tryList String?` (S.1). It holds JSON text, null means there is no list. It is added to the generated client type `Item` and to `test/builders/index.ts` `ItemRow` (default `null`).
- **`lib/try-list.ts`** (S.2). It is zod-free, so components can import it.
  - `interface TryEntry { id: string; text: string; tried: boolean }`
  - `type TryList = TryEntry[]`
  - `interface TryEntryInput { id?: string; text: string; tried?: boolean }`
  - `const MAX_TRY_ENTRIES = 30`, `const MAX_TRY_TEXT = 80`, `const TRY_ENTRY_ID_LENGTH = 8`
  - `newTryEntryId(taken?: ReadonlySet<string>): string`: 8 characters of `[a-z0-9]`, never one already in `taken`.
  - `applyTryListInput(current: TryList | null, input: readonly TryEntryInput[]): TryList`: replaces the list and keeps the input order.
    - An input `id` that matches a current entry keeps that id. It keeps that entry's tick unless `tried` is given.
    - Any other entry gets a fresh id. It starts untried unless `tried` is given.
  - `withEntryTried(list: TryList | null, entryId: string, tried: boolean): TryList | null`: returns null when there is no such entry.
  - `untickAll(list: TryList | null): TryList | null`
  - `tryListProgress(list: TryList | null | undefined): { tried: number; total: number } | null`: null when there is no list or it is empty.
- **`lib/validations/try-list.ts`** (S.3).
  - `tryEntryTextSchema`: trimmed, 1–80 characters.
  - `tryListSchema`: the stored shape. Strict entries `{ id, text, tried }`, at most 30, unique ids.
  - `tryListInputSchema`: the writer shape. Strict entries `{ id?, text, tried? }`, at most 30, no id given twice.
  - `parseTryList(raw: string | null | undefined): TryList | null`: null when the value is empty, unreadable or invalid.
  - `serializeTryList(list: TryList | null | undefined): string | null`: an empty list stores as null.
- **`lib/item-family.ts`** (S.4). It replaces `openingHoursFamilyRoot` / `openingHoursFamilyWhere` (lib/opening-hours.ts) and the private `openingHoursFamilyRecipients` (server/actions/items.ts). The old names are deleted.
  - `itemFamilyRoot(item: { id: string; sourceItemId: string | null }): string`
  - `itemFamilyWhere(tripId: string, rootId: string): { tripId: string; OR: [{ id: string }, { sourceItemId: string }] }`
  - `itemFamilyRecipients(item: { id: string; tripId: string; sourceItemId: string | null }, client?: ItemFamilyClient): Promise<string[]>`. The default client is `db`. It never crosses a Surprise, exactly as before.
  - `type ItemFamilyData = { openingHours?: string | null; tryList?: string | null }`
  - `type ItemFamilyClient = Pick<Prisma.TransactionClient, "item">`
  - `writeItemFamily(tx: ItemFamilyClient, recipients: readonly string[], data: ItemFamilyData): Promise<void>`. It is one `updateMany`, and it is skipped when there are no recipients or no data.
  - `updateItem` now builds a `familyData: ItemFamilyData`. For now only `openingHours` goes into it. T adds `tryList` in one line, and the transaction, family write and after-commit `recordUpdate` path come for free.
- **Copies.**
  - `ideaCopyData` copies `tryList` with its ticks (S.6).
  - `ForkPlan.items[].data.tryList` carries the stored string with its ticks (S.5).
  - `DuplicatePlan.items[].data.tryList` keeps ids and text and resets every tick to untried (S.5).
- **Masking.** `PlaceholderItem` gains `tryList: null`. So does `placeholderItem()` in `test/helpers/surprise-visibility.ts` (S.7).

**Interfaces assumed from earlier sections:** none. This is the first section. From Branch 1 (as built) it uses:
- `serializeOpeningHours` (lib/validations/opening-hours.ts);
- `surpriseRootFor` (lib/surprise-guard.ts);
- `recordUpdate` / `auditedUpdate` (lib/activity-guard.ts).

**Deviations and decisions where the spec and the controller decisions are silent:**

1. **Recipients take an optional `client`.** `itemFamilyRecipients` accepts `client` (default `db`), so T's tick can read the family inside its locking transaction. Existing callers pass nothing, so behaviour is unchanged.
   - Open follow-up PM-02 (recipients are read before the write's transaction) is not fixed here. A refactor must not change behaviour. T may pass `tx`.
   - `surpriseRootFor` still reads through the global `db`. That is a plain read and stays as it is.
2. **`writeItemFamily` is the one family write.** The decision asks for "one helper". The family logic is the root, the where, the Surprise-safe recipients and the shared `updateMany`. All of it now lives in one module. It lives in `lib/`, not in `server/actions/items.ts`, because T may add a separate actions file, and every `"use server"` export is a callable action.
3. **Unknown ids from a writer.** In `applyTryListInput`, an input id that names no current entry gets a fresh server id; it is not refused. Callers never choose ids, and a stale id from Claude or a second tab still saves the text. A repeated id is refused by `tryListInputSchema`. `applyTryListInput` also guards against one: the second occurrence gets a fresh id.
4. **Id format.** Ids are 8 characters of `[a-z0-9]` from `crypto.getRandomValues`. The schema accepts `^[a-z0-9]{1,32}$`, so a hand-edited or older id still parses.
5. **Strict parsing.** The stored list parses strictly, mirroring `openingHoursSchema`. An unknown key, a duplicate id or more than 30 entries makes the whole column read as no list (null). Duplicate trip therefore drops an unreadable list rather than copying garbage.
6. **Placed copies keep the ticks.** The family shares ticks (R6: "shared ticks", "shared by a thing to do and its placed copies"), so the copy is the idea's list as it stands. A Fork copy has `sourceItemId` null and so leaves the family. That is Branch 1's existing rule for hours, and the existing integration case "a Fork-created copy … is left alone" pins it.
7. **No CHECK constraint and no index**, as Branch 1 decided for `openingHours` (S decision 9).
8. **Text may contain inner newlines.** The trim only touches the ends. The spec doesn't ask for more, and the dialog input (T) is single-line anyway.

**Review Focus candidates:**

1. **The opening-hours refactor must not change behaviour across a Surprise.** Input: an hours edit made through `updateItem` and through `setOpeningHours`.
   - On a hidden copy: only that row is written, and the family is never looked up.
   - On a visible copy: every visible family row is written, never a hidden one.
   - When the family `updateMany` throws: no Activity is recorded.
   - Tested by S.4: the unchanged `server/actions/items.test.ts` "opening hours" block, the new `lib/item-family.test.ts`, and `test/integration/opening-hours.test.ts`.
2. **Duplicate trip resets ticks and keeps the rest.** Input: an Item whose list has a ticked and an unticked entry. Expected: the copy's list has the same ids, text and order, all untried; a null or unreadable list copies as null. A Fork of the same Item keeps the ticks. Tested by S.5: `lib/duplicate-trip.test.ts`, `lib/fork-plan.test.ts` and `test/integration/fork-duplicate-copies.test.ts`.
3. **`applyTryListInput` keeps ticks by id.** Input: the current list `[a✓, b]` and the input `[{id:b, text:"B2"}, {id:a, text:"A"}, {text:"C"}, {id:"zzz", text:"D", tried:true}]`. Expected:
   - `b` is renamed and still untried;
   - `a` keeps its tick;
   - `C` gets a fresh id and is untried;
   - `D` gets a fresh id (not `zzz`) and is tried;
   - the order is `b, a, C, D`.

   Tested by S.2.

---

### Task S.1: The `Item.tryList` column (schema and migration)

**Files:**
- Modify: `prisma/schema.prisma:804-808`. Add the column after `openingHours    String?` (`:808`) in `model Item`.
- Create: `prisma/migrations/20261017130000_item_try_list/migration.sql`
- Modify: `test/builders/index.ts:45-58` (`ItemRow`) and `:106-117` (`item()`)
- Test: Create `test/integration/migration-try-list.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the column `Item.tryList` (`TEXT`, nullable, no default). After `prisma generate`, `Item` has `tryList: string | null`. `ItemRow` gains `tryList: string | null`, and the `item()` default is `null`.

- [ ] **Step 1: Write the failing test**

Create `test/integration/migration-try-list.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

// CONTEXT.md "Try list" (spec 2026-10-17 R6) against the real Postgres: the
// column exists as nullable text with no default, and a row written without it
// (every row that exists when the migration runs) has no list.
const TRIP_ID = "it-trip-try-list-migration";

describe.skipIf(process.env.INTEGRATION !== "1")("Item.tryList migration (spec 2026-10-17 R6, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it-user@example.test", name: "It User", isEmailVerified: true } });
    await db.trip.create({
      data: { id: TRIP_ID, name: "Try list migration", homeCurrency: "AUD", createdById: "it-user", members: { create: { userId: "it-user", role: "owner" } } },
    });
    await db.$executeRaw`INSERT INTO "Item" ("id", "tripId", "title", "category", "updatedAt") VALUES
      ('it-tl-item-old', ${TRIP_ID}, 'Christkindlesmarkt', 'FOOD', now())`;
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("adds Item.tryList as nullable text with no default", async () => {
    const cols = await db.$queryRaw<{ data_type: string; is_nullable: string; column_default: string | null }[]>`
      SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'Item' AND column_name = 'tryList'`;
    expect(cols).toEqual([{ data_type: "text", is_nullable: "YES", column_default: null }]);
  });

  it("an existing row has no list, and a written list reads back verbatim", async () => {
    expect(await db.item.findUniqueOrThrow({ where: { id: "it-tl-item-old" }, select: { tryList: true } })).toEqual({ tryList: null });
    const stored = JSON.stringify([{ id: "abcd1234", text: "Lebkuchen", tried: true }]);
    await db.item.update({ where: { id: "it-tl-item-old" }, data: { tryList: stored } });
    expect(await db.item.findUniqueOrThrow({ where: { id: "it-tl-item-old" }, select: { tryList: true } })).toEqual({ tryList: stored });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Start the sandbox Postgres if it is down: `/tmp/claude-1000/-work/9a77e9b0-ef00-4a02-8c0f-84c338d2470c/scratchpad/pg/start.sh`. Then:

```bash
export DATABASE_URL="postgresql://trip:trip@localhost:5432/trip?schema=public" DIRECT_URL="postgresql://trip:trip@localhost:5432/trip?schema=public"
TZ=UTC INTEGRATION=1 npx vitest run --config vitest.integration.config.ts test/integration/migration-try-list.test.ts
```

Expected:
- the first test fails: `expected [] to equal [ { data_type: 'text', … } ]`;
- the second fails: `Unknown field 'tryList'` on `select`, or tsc reports `tryList` missing on the client types.

- [ ] **Step 3: Implement**

In `prisma/schema.prisma`, `model Item`, directly after `openingHours    String?` (`:808`):

```prisma
  // CONTEXT.md "Try list" (spec 2026-10-17 R6): JSON as String (schema
  // convention), validated by lib/validations/try-list.ts; an empty list is
  // stored as null. Shared like openingHours: copied onto a placed copy
  // (ideaCopyData) and written to the whole family, so reads never join
  // through sourceItemId.
  tryList         String?
```

Create `prisma/migrations/20261017130000_item_try_list/migration.sql`. This is exactly what `prisma migrate dev --create-only` generates for the change:

```sql
-- Spec 2026-10-17 R6: the Try list on an Item (JSON text; null = no list).

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "tryList" TEXT;
```

`test/builders/index.ts`:
- `ItemRow`: after `openingHours: string | null;` (`:52`), add
  ```ts
  /** CONTEXT.md "Try list" (R6) — the stored JSON string column; null = no list. */
  tryList: string | null;
  ```
- `item()`: change `openingHours: null,` (`:111`) to `openingHours: null, tryList: null,`.

Apply the migration in the sandbox only, never with `.env.production.local` loaded:

```bash
export DATABASE_URL="postgresql://trip:trip@localhost:5432/trip?schema=public" DIRECT_URL="postgresql://trip:trip@localhost:5432/trip?schema=public"
npx prisma migrate deploy
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected:
- `deploy` prints ``Applying migration `20261017130000_item_try_list` ``;
- `diff --exit-code` exits 0 ("No difference detected").

If the local DB is unavailable, write the files anyway and say so. CI's integration job migrates.

- [ ] **Step 4: Run it, expect PASS** — run the command from Step 2: 2 passed.

- [ ] **Step 5: Task-done check**
  - `npx prisma validate`
  - `npx tsc --noEmit`. The column is nullable with no default, so no existing `create` breaks.
  - `npx eslint test/integration/migration-try-list.test.ts test/builders/index.ts`
  - `npm run test:integration -- test/integration/migration-try-list.test.ts`
  - `npx vitest related --run test/builders/index.ts`

- [ ] **Step 6: Commit** — files: `prisma/schema.prisma`, `prisma/migrations/20261017130000_item_try_list/migration.sql`, `test/builders/index.ts`, `test/integration/migration-try-list.test.ts`. Message: `feat(try-list): Item.tryList column (schema, R6)`

---

### Task S.2: The Try list model (`lib/try-list.ts`)

**Files:**
- Create: `lib/try-list.ts`
- Test: Create `lib/try-list.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TryEntry`, `TryList`, `TryEntryInput`, `MAX_TRY_ENTRIES`, `MAX_TRY_TEXT`, `TRY_ENTRY_ID_LENGTH`, `newTryEntryId`, `applyTryListInput`, `withEntryTried`, `untickAll` and `tryListProgress`. The signatures are as listed in Notes.

- [ ] **Step 1: Write the failing test**

Create `lib/try-list.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_TRY_ENTRIES, MAX_TRY_TEXT, TRY_ENTRY_ID_LENGTH, applyTryListInput, newTryEntryId,
  tryListProgress, untickAll, withEntryTried, type TryList,
} from "./try-list";

const LIST: TryList = [
  { id: "aaaa1111", text: "Drei im Weggla", tried: true },
  { id: "bbbb2222", text: "Feuerzangenbowle", tried: false },
];

afterEach(() => vi.restoreAllMocks());

describe("limits", () => {
  it("are 30 entries of 1–80 characters", () => {
    expect(MAX_TRY_ENTRIES).toBe(30);
    expect(MAX_TRY_TEXT).toBe(80);
  });
});

describe("newTryEntryId", () => {
  it("is 8 lowercase letters or digits", () => {
    expect(TRY_ENTRY_ID_LENGTH).toBe(8);
    for (let i = 0; i < 50; i++) expect(newTryEntryId()).toMatch(/^[a-z0-9]{8}$/);
  });

  it("never returns an id already taken", () => {
    const real = crypto.getRandomValues.bind(crypto);
    vi.spyOn(crypto, "getRandomValues")
      .mockImplementationOnce(((a: Uint8Array) => a.fill(0)) as never) // "aaaaaaaa"
      .mockImplementation(real as never);
    const id = newTryEntryId(new Set(["aaaaaaaa"]));
    expect(id).not.toBe("aaaaaaaa");
    expect(id).toMatch(/^[a-z0-9]{8}$/);
  });
});

describe("applyTryListInput (replace the list; ticks follow the id)", () => {
  it("keeps an existing id and its tick unless tried is given; others get a fresh id, untried by default; input order wins", () => {
    const next = applyTryListInput(LIST, [
      { id: "bbbb2222", text: "Feuerzangenbowle (Christkindlesmarkt)" },
      { id: "aaaa1111", text: "Drei im Weggla" },
      { text: "Lebkuchen" },
      { id: "zzzz9999", text: "Rauchbier", tried: true },
    ]);
    expect(next.map((e) => [e.text, e.tried])).toEqual([
      ["Feuerzangenbowle (Christkindlesmarkt)", false],
      ["Drei im Weggla", true],
      ["Lebkuchen", false],
      ["Rauchbier", true],
    ]);
    expect(next[0].id).toBe("bbbb2222");
    expect(next[1].id).toBe("aaaa1111");
    expect(next[2].id).toMatch(/^[a-z0-9]{8}$/);
    expect(next[3].id).not.toBe("zzzz9999"); // an unknown id is not adopted
    expect(new Set(next.map((e) => e.id)).size).toBe(4);
  });

  it("an explicit tried overrides the kept tick", () => {
    expect(applyTryListInput(LIST, [{ id: "aaaa1111", text: "Drei im Weggla", tried: false }])).toEqual([
      { id: "aaaa1111", text: "Drei im Weggla", tried: false },
    ]);
  });

  it("drops entries left out, starts from nothing when there is no list, and an empty input is an empty list", () => {
    expect(applyTryListInput(LIST, [{ id: "bbbb2222", text: "Feuerzangenbowle" }])).toEqual([LIST[1]]);
    expect(applyTryListInput(null, [{ text: "Lebkuchen" }])).toEqual([{ id: expect.stringMatching(/^[a-z0-9]{8}$/), text: "Lebkuchen", tried: false }]);
    expect(applyTryListInput(LIST, [])).toEqual([]);
  });

  it("a repeated id keeps the first; the second gets a fresh id", () => {
    const next = applyTryListInput(LIST, [{ id: "aaaa1111", text: "A" }, { id: "aaaa1111", text: "B" }]);
    expect(next[0]).toEqual({ id: "aaaa1111", text: "A", tried: true });
    expect(next[1].id).not.toBe("aaaa1111");
    expect(next[1].tried).toBe(false);
  });
});

describe("withEntryTried", () => {
  it("ticks or unticks one entry by id and leaves the rest", () => {
    expect(withEntryTried(LIST, "bbbb2222", true)).toEqual([LIST[0], { ...LIST[1], tried: true }]);
    expect(withEntryTried(LIST, "aaaa1111", false)).toEqual([{ ...LIST[0], tried: false }, LIST[1]]);
    expect(LIST[1].tried).toBe(false); // input untouched
  });
  it("is null when there is no such entry or no list", () => {
    expect(withEntryTried(LIST, "nope", true)).toBeNull();
    expect(withEntryTried(null, "aaaa1111", true)).toBeNull();
  });
});

describe("untickAll", () => {
  it("keeps ids, text and order with every tick cleared; no list stays no list", () => {
    expect(untickAll(LIST)).toEqual([{ ...LIST[0], tried: false }, LIST[1]]);
    expect(untickAll(null)).toBeNull();
  });
});

describe("tryListProgress", () => {
  it("counts ticks; null with no list or an empty one", () => {
    expect(tryListProgress(LIST)).toEqual({ tried: 1, total: 2 });
    expect(tryListProgress([])).toBeNull();
    expect(tryListProgress(null)).toBeNull();
    expect(tryListProgress(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/try-list.test.ts` fails with `Failed to resolve import "./try-list"`.

- [ ] **Step 3: Implement**

Create `lib/try-list.ts`:

```ts
/**
 * CONTEXT.md "Try list" (spec 2026-10-17 R6): a small tickable list inside one
 * Item — the things to try, see or buy while you are there. Shared by everyone
 * on the Trip, and by a thing to do and the copies placed from it (each row
 * holds a copy; writes go to the whole family, lib/item-family.ts). Not a
 * Checklist: no due dates, no assignees, never on the Checklists page.
 *
 * Stored as a JSON string on `Item.tryList` (validated by
 * lib/validations/try-list.ts; an empty list is stored as null). This module is
 * the zod-free model, so components can import it.
 */

export interface TryEntry {
  id: string;
  text: string;
  tried: boolean;
}
export type TryList = TryEntry[];

/** One entry as a writer sends it: `id` names an existing entry; `tried` omitted keeps its tick (a new entry starts untried). */
export interface TryEntryInput {
  id?: string;
  text: string;
  tried?: boolean;
}

export const MAX_TRY_ENTRIES = 30;
export const MAX_TRY_TEXT = 80;
export const TRY_ENTRY_ID_LENGTH = 8;

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A short random entry id not in `taken`. Minted server-side only: callers never choose ids. */
export function newTryEntryId(taken: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(TRY_ENTRY_ID_LENGTH));
    const id = Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
    if (!taken.has(id)) return id;
  }
}

/**
 * Replace `current` with `input`, in input order (the Item dialog, MCP
 * set_try_list). An input id matching a current entry keeps that id, and its
 * tick unless `tried` is given. Any other entry (no id, an unknown id, or an id
 * already used earlier in the input) gets a fresh id and starts untried unless
 * `tried` is given. Text is taken as given: the schema has already trimmed it.
 */
export function applyTryListInput(current: TryList | null, input: readonly TryEntryInput[]): TryList {
  const byId = new Map((current ?? []).map((e) => [e.id, e]));
  // Reserve every id that will be kept, so a fresh id never collides with one kept later in the input.
  const taken = new Set(input.flatMap((e) => (e.id && byId.has(e.id) ? [e.id] : [])));
  const used = new Set<string>();
  return input.map((e) => {
    const existing = e.id && !used.has(e.id) ? byId.get(e.id) : undefined;
    if (existing) {
      used.add(existing.id);
      return { id: existing.id, text: e.text, tried: e.tried ?? existing.tried };
    }
    const id = newTryEntryId(taken);
    taken.add(id);
    return { id, text: e.text, tried: e.tried ?? false };
  });
}

/** The list with one entry ticked (or unticked); null when there is no such entry. */
export function withEntryTried(list: TryList | null, entryId: string, tried: boolean): TryList | null {
  if (!list || !list.some((e) => e.id === entryId)) return null;
  return list.map((e) => (e.id === entryId ? { ...e, tried } : e));
}

/** Every entry untried, ids and text kept (Duplicate trip: a fresh Trip has tried nothing yet). */
export function untickAll(list: TryList | null): TryList | null {
  return list ? list.map((e) => ({ ...e, tried: false })) : null;
}

/** "2/5 tried" counts; null when there is no list. */
export function tryListProgress(list: TryList | null | undefined): { tried: number; total: number } | null {
  if (!list || list.length === 0) return null;
  return { tried: list.filter((e) => e.tried).length, total: list.length };
}
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/try-list.test.ts`: all pass.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/try-list.ts` + `npx tsc --noEmit` + `npx eslint lib/try-list.ts lib/try-list.test.ts`

- [ ] **Step 6: Commit** — files: `lib/try-list.ts`, `lib/try-list.test.ts`. Message: `feat(try-list): Try list model and list operations (R6)`

---

### Task S.3: Try list validation, parse and serialise (`lib/validations/try-list.ts`)

**Files:**
- Create: `lib/validations/try-list.ts`
- Test: Create `lib/validations/try-list.test.ts`

**Interfaces:**
- Consumes: S.2 `MAX_TRY_ENTRIES`, `MAX_TRY_TEXT`, `TryList`, `TryEntryInput`.
- Produces: `tryEntryTextSchema`, `tryListSchema`, `tryListInputSchema`, `parseTryList` and `serializeTryList`. T uses `tryListInputSchema` in `itemSchema`, `setTryList` and `set_try_list`. Every reader uses `parseTryList`.

- [ ] **Step 1: Write the failing test**

Create `lib/validations/try-list.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { TryEntryInput, TryList } from "@/lib/try-list";
import { parseTryList, serializeTryList, tryEntryTextSchema, tryListInputSchema, tryListSchema } from "./try-list";

const LIST = [
  { id: "aaaa1111", text: "Drei im Weggla", tried: true },
  { id: "bbbb2222", text: "Feuerzangenbowle", tried: false },
];
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id${i}`, text: `Thing ${i}`, tried: false }));

describe("tryEntryTextSchema", () => {
  it("trims, and needs 1–80 characters", () => {
    expect(tryEntryTextSchema.parse("  Lebkuchen ")).toBe("Lebkuchen");
    expect(tryEntryTextSchema.safeParse("   ").success).toBe(false);
    expect(tryEntryTextSchema.safeParse("x".repeat(80)).success).toBe(true);
    expect(tryEntryTextSchema.safeParse("x".repeat(81)).success).toBe(false);
  });
});

describe("tryListSchema (the stored shape)", () => {
  it("parses to the TryList model", () => {
    expectTypeOf<z.output<typeof tryListSchema>>().toExtend<TryList>();
    expect(tryListSchema.parse(LIST)).toEqual(LIST);
  });
  it("refuses more than 30 entries, a repeated id, a missing tick, an odd id and an unknown key", () => {
    expect(tryListSchema.safeParse(many(30)).success).toBe(true);
    expect(tryListSchema.safeParse(many(31)).success).toBe(false);
    expect(tryListSchema.safeParse([LIST[0], { ...LIST[1], id: "aaaa1111" }]).success).toBe(false);
    expect(tryListSchema.safeParse([{ id: "aaaa1111", text: "x" }]).success).toBe(false);
    expect(tryListSchema.safeParse([{ id: "Not An Id", text: "x", tried: false }]).success).toBe(false);
    expect(tryListSchema.safeParse([{ ...LIST[0], due: "2027-01-01" }]).success).toBe(false);
  });
});

describe("tryListInputSchema (what a writer sends)", () => {
  it("takes entries with optional id and tick, trimmed", () => {
    expectTypeOf<z.output<typeof tryListInputSchema>>().toExtend<TryEntryInput[]>();
    expect(tryListInputSchema.parse([{ text: " Lebkuchen " }, { id: "aaaa1111", text: "Weggla", tried: true }])).toEqual([
      { text: "Lebkuchen" },
      { id: "aaaa1111", text: "Weggla", tried: true },
    ]);
    expect(tryListInputSchema.parse([])).toEqual([]);
  });
  it("refuses more than 30 entries, an empty text and the same id twice", () => {
    expect(tryListInputSchema.safeParse(many(31).map(({ text }) => ({ text }))).success).toBe(false);
    expect(tryListInputSchema.safeParse([{ text: "  " }]).success).toBe(false);
    expect(tryListInputSchema.safeParse([{ id: "aaaa1111", text: "A" }, { id: "aaaa1111", text: "B" }]).success).toBe(false);
  });
});

describe("parseTryList / serializeTryList", () => {
  it("round-trips a list", () => {
    expect(parseTryList(serializeTryList(LIST))).toEqual(LIST);
  });
  it("an empty list is stored as null, and null/empty/unreadable/invalid reads as no list", () => {
    expect(serializeTryList([])).toBeNull();
    expect(serializeTryList(null)).toBeNull();
    expect(serializeTryList(undefined)).toBeNull();
    expect(parseTryList(null)).toBeNull();
    expect(parseTryList("")).toBeNull();
    expect(parseTryList("[]")).toBeNull();
    expect(parseTryList("not json")).toBeNull();
    expect(parseTryList(JSON.stringify(many(31)))).toBeNull();
    expect(parseTryList('{"id":"x"}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/validations/try-list.test.ts` fails with `Failed to resolve import "./try-list"`.

- [ ] **Step 3: Implement**

Create `lib/validations/try-list.ts`:

```ts
import { z } from "zod";
import { MAX_TRY_ENTRIES, MAX_TRY_TEXT, type TryList } from "@/lib/try-list";

/**
 * CONTEXT.md "Try list" (spec 2026-10-17 R6): the zod side of lib/try-list.ts.
 * Every door that writes `Item.tryList` (the Item dialog, set_try_list,
 * tick_try_entry) validates with these and stores `serializeTryList`. Every
 * reader parses with `parseTryList`, which treats anything unreadable as no list.
 */

const tryEntryIdSchema = z.string().regex(/^[a-z0-9]{1,32}$/, "Not a Try list entry id");

export const tryEntryTextSchema = z
  .string()
  .trim()
  .min(1, "Write something to try")
  .max(MAX_TRY_TEXT, `Keep each one to ${MAX_TRY_TEXT} characters or fewer`);

const TOO_MANY = `At most ${MAX_TRY_ENTRIES} things to try`;

function idsUnique(entries: readonly { id?: string }[]): boolean {
  const ids = entries.flatMap((e) => (e.id ? [e.id] : []));
  return new Set(ids).size === ids.length;
}

/** The stored shape: every entry has its own id and its tick. */
export const tryListSchema = z
  .array(z.strictObject({ id: tryEntryIdSchema, text: tryEntryTextSchema, tried: z.boolean() }))
  .max(MAX_TRY_ENTRIES, TOO_MANY)
  .refine(idsUnique, "Each entry needs its own id");

/** What a writer sends: an id names an existing entry; a tick is optional (lib/try-list.ts applyTryListInput). */
export const tryListInputSchema = z
  .array(z.strictObject({ id: tryEntryIdSchema.optional(), text: tryEntryTextSchema, tried: z.boolean().optional() }))
  .max(MAX_TRY_ENTRIES, TOO_MANY)
  .refine(idsUnique, "The same entry appears twice");

/** The stored column → the model, or null when empty, unreadable or invalid (= no list). */
export function parseTryList(raw: string | null | undefined): TryList | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = tryListSchema.safeParse(json);
  return parsed.success && parsed.data.length > 0 ? parsed.data : null;
}

/** The model → the stored column; an empty list stores as null. */
export function serializeTryList(list: TryList | null | undefined): string | null {
  return list && list.length > 0 ? JSON.stringify(list.map(({ id, text, tried }) => ({ id, text, tried }))) : null;
}
```

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/validations/try-list.test.ts`: all pass.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/validations/try-list.ts` + `npx tsc --noEmit` + `npx eslint lib/validations/try-list.ts lib/validations/try-list.test.ts`

- [ ] **Step 6: Commit** — files: `lib/validations/try-list.ts`, `lib/validations/try-list.test.ts`. Message: `feat(try-list): Try list schema, parse and serialise (R6)`

---

### Task S.4: One Item-family helper for Opening hours and the Try list (refactor, no behaviour change)

**Files:**
- Create: `lib/item-family.ts`
- Modify: `lib/opening-hours.ts:110-123`. Delete the family doc comment, `openingHoursFamilyRoot` and `openingHoursFamilyWhere`.
- Modify: `lib/opening-hours.test.ts:3` (the import) and `:131-139`. Delete the "the opening-hours family" `describe`, which moves to the new test.
- Modify: `server/actions/items.ts`:
  - imports (`:31-32`);
  - `updateItem`'s hours block (`:425-435`), its `itemData` (`:437-462`) and the write branch (`:477-488`);
  - delete `openingHoursFamilyRecipients` and its doc comment (`:556-585`);
  - `setOpeningHours` (`:586-624`): its doc comment reference and body;
  - the `ideaCopyData` doc comment (`:718-731`, which references `openingHoursFamilyWhere`).
- Modify (comments only):
  - `prisma/schema.prisma:806-807`;
  - `lib/opening-hours-stored.ts:7,11`;
  - `lib/opening-hours-stored.test.ts:8-9`;
  - `server/actions/items.test.ts:2479-2484` and `:2503-2504`;
  - `docs/open-follow-ups.md:3276` (PM-02).
- Test: Create `lib/item-family.test.ts`. Keep `server/actions/items.test.ts:2485-2640` (the opening-hours block) unchanged and green.

**Interfaces:**
- Consumes: `surpriseRootFor` (lib/surprise-guard.ts) and `db` (lib/db.ts).
- Produces: `itemFamilyRoot`, `itemFamilyWhere`, `itemFamilyRecipients`, `writeItemFamily`, `ItemFamilyData` and `ItemFamilyClient`, with the signatures in Notes. The old names are gone; this repo grep must come back empty: `grep -rn "openingHoursFamily" --include=*.ts --include=*.tsx --include=*.prisma .` (outside `node_modules`). T extends `updateItem`'s `familyData` with `tryList`, and calls `itemFamilyRecipients` and `writeItemFamily` from `setTryList` and `tickTryEntry`.

- [ ] **Step 1: Write the failing test**

Create `lib/item-family.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { itemFindManyMock, surpriseRootForMock } = vi.hoisted(() => ({
  itemFindManyMock: vi.fn(),
  surpriseRootForMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { item: { findMany: itemFindManyMock } } }));
vi.mock("@/lib/surprise-guard", () => ({ surpriseRootFor: surpriseRootForMock }));

import { itemFamilyRecipients, itemFamilyRoot, itemFamilyWhere, writeItemFamily } from "./item-family";

const COPY = { id: "copy-1", tripId: "trip-1", sourceItemId: "idea-1" };
const hiddenIf = (ids: string[]) => async (ref: { itemId?: string }) =>
  ref.itemId && ids.includes(ref.itemId) ? { type: "ITEM", id: ref.itemId } : null;

beforeEach(() => {
  vi.clearAllMocks();
  surpriseRootForMock.mockResolvedValue(null);
});

describe("the Item family (a thing to do and its placed copies: Opening hours, Try list)", () => {
  it("the root is the source idea for a placed copy, else the Item itself", () => {
    expect(itemFamilyRoot({ id: "copy-1", sourceItemId: "idea-1" })).toBe("idea-1");
    expect(itemFamilyRoot({ id: "idea-1", sourceItemId: null })).toBe("idea-1");
  });

  it("selects the root and every copy placed from it, in the Trip", () => {
    expect(itemFamilyWhere("trip-1", "idea-1")).toEqual({ tripId: "trip-1", OR: [{ id: "idea-1" }, { sourceItemId: "idea-1" }] });
  });
});

describe("itemFamilyRecipients (never crosses a Surprise)", () => {
  it("is every other family row, read by id only", async () => {
    itemFindManyMock.mockResolvedValue([{ id: "idea-1" }, { id: "copy-2" }]);
    expect(await itemFamilyRecipients(COPY)).toEqual(["idea-1", "copy-2"]);
    expect(itemFindManyMock).toHaveBeenCalledWith({
      where: { tripId: "trip-1", OR: [{ id: "idea-1" }, { sourceItemId: "idea-1" }], id: { not: "copy-1" } },
      select: { id: true },
    });
  });

  it("leaves out a row inside a live Surprise", async () => {
    itemFindManyMock.mockResolvedValue([{ id: "idea-1" }, { id: "hidden-copy" }]);
    surpriseRootForMock.mockImplementation(hiddenIf(["hidden-copy"]));
    expect(await itemFamilyRecipients(COPY)).toEqual(["idea-1"]);
  });

  it("is no one, without even reading the family, when the edited row is itself inside a Surprise", async () => {
    surpriseRootForMock.mockImplementation(hiddenIf(["copy-1"]));
    expect(await itemFamilyRecipients(COPY)).toEqual([]);
    expect(itemFindManyMock).not.toHaveBeenCalled();
  });

  it("reads the family through the client it is given (a transaction)", async () => {
    const txFindMany = vi.fn().mockResolvedValue([{ id: "idea-1" }]);
    expect(await itemFamilyRecipients(COPY, { item: { findMany: txFindMany } } as never)).toEqual(["idea-1"]);
    expect(txFindMany).toHaveBeenCalledTimes(1);
    expect(itemFindManyMock).not.toHaveBeenCalled();
  });
});

describe("writeItemFamily", () => {
  it("writes the shared columns to every recipient in one updateMany", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    await writeItemFamily({ item: { updateMany } } as never, ["idea-1", "copy-2"], { openingHours: null, tryList: "[]" });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ["idea-1", "copy-2"] } }, data: { openingHours: null, tryList: "[]" } });
  });

  it("writes nothing with no recipients or nothing to share", async () => {
    const updateMany = vi.fn();
    await writeItemFamily({ item: { updateMany } } as never, [], { openingHours: null });
    await writeItemFamily({ item: { updateMany } } as never, ["idea-1"], {});
    expect(updateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/item-family.test.ts` fails with `Failed to resolve import "./item-family"`.

- [ ] **Step 3: Implement**

Create `lib/item-family.ts`:

```ts
/**
 * The Item family (CONTEXT.md "Opening hours", "Try list"; spec 2026-10-17
 * R4, R6): a thing to do and the copies placed from it share the place's
 * Opening hours and one Try list. Each row holds its own copy (copied on
 * place by ideaCopyData), and a write goes to the whole family: the root (the
 * source idea, or the Item itself) and every Item placed from it. That way
 * reads never join, and a copy keeps its values if the idea is deleted
 * (sourceItemId SetNull). A Fork's copy has no sourceItemId, so it leaves the
 * family.
 *
 * The family never crosses a Surprise (CONTEXT.md "Surprise"; ADR 0072): a
 * write on a row inside a live Surprise reaches only that row, and a visible
 * write never reaches a hidden row.
 *
 * Callers write the edited row and the family in ONE transaction and record
 * Activity only after it commits (recordActivity writes through the global
 * db — lib/activity-guard.ts), so the family is never left half-updated and no
 * phantom UPDATED line survives a rollback.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { surpriseRootFor } from "@/lib/surprise-guard";

/** The columns a family shares. Each is the stored JSON string, or null to clear. */
export type ItemFamilyData = { openingHours?: string | null; tryList?: string | null };

export type ItemFamilyClient = Pick<Prisma.TransactionClient, "item">;

export function itemFamilyRoot(item: { id: string; sourceItemId: string | null }): string {
  return item.sourceItemId ?? item.id;
}

export function itemFamilyWhere(tripId: string, rootId: string) {
  return { tripId, OR: [{ id: rootId }, { sourceItemId: rootId }] as [{ id: string }, { sourceItemId: string }] };
}

/**
 * The ids of `item`'s family that may receive a shared write: every other row
 * of the family, minus anything inside a live Surprise. If `item` itself is
 * inside one (its own, or inherited from its Stop), no one: the write reaches
 * only that row. `client` lets a caller read the family inside its own
 * transaction; the Surprise check is a plain read through `db`.
 */
export async function itemFamilyRecipients(
  item: { id: string; tripId: string; sourceItemId: string | null },
  client: ItemFamilyClient = db,
): Promise<string[]> {
  if (await surpriseRootFor({ itemId: item.id })) return [];
  const candidates = await client.item.findMany({
    where: { ...itemFamilyWhere(item.tripId, itemFamilyRoot(item)), id: { not: item.id } },
    select: { id: true },
  });
  const recipients: string[] = [];
  for (const c of candidates) {
    if (!(await surpriseRootFor({ itemId: c.id }))) recipients.push(c.id);
  }
  return recipients;
}

/** Share `data` with `recipients` inside the caller's transaction. Silent: the edited row's own write carries the Activity. */
export async function writeItemFamily(tx: ItemFamilyClient, recipients: readonly string[], data: ItemFamilyData): Promise<void> {
  if (recipients.length === 0 || Object.keys(data).length === 0) return;
  await tx.item.updateMany({ where: { id: { in: [...recipients] } }, data });
}
```

`lib/opening-hours.ts`: delete `:110-123`. That is the doc comment beginning "Opening hours belong to the place, so a thing to do and the copies placed from it share them", plus `openingHoursFamilyRoot` and `openingHoursFamilyWhere`. Nothing else in the file references them.

`lib/opening-hours.test.ts`:
- `:3`: the import becomes `hoursOn, isClosedDate, isEmptyOpeningHours,`. Drop the two family names.
- Delete the `describe("the opening-hours family (a thing to do and its placed copies share them)", …)` block (`:131-139`). It now lives in `lib/item-family.test.ts`.

`server/actions/items.ts`:

1. Imports. Replace `:32` (`import { openingHoursFamilyRoot, openingHoursFamilyWhere, type OpeningHours } from "@/lib/opening-hours";`) with:
   ```ts
   import type { OpeningHours } from "@/lib/opening-hours";
   import { itemFamilyRecipients, writeItemFamily, type ItemFamilyData } from "@/lib/item-family";
   ```
   Keep `surpriseRootFor` in the `@/lib/surprise-guard` import (`:11`) only if another use remains in the file. After the deletion below, `grep -n "surpriseRootFor" server/actions/items.ts` decides. If none remains, the import becomes `import { requireOutsideSurprise } from "@/lib/surprise-guard";`.

2. `updateItem`. Before (`:425-435`):
   ```ts
   // CONTEXT.md "Opening hours": computed before the write (a plain read, like
   // …
   // out every row that is.
   const openingHoursStored = patch.openingHours !== undefined ? serializeOpeningHours(data.openingHours) : undefined;
   const openingHoursRecipients = patch.openingHours !== undefined ? await openingHoursFamilyRecipients(before) : [];
   ```
   After:
   ```ts
   // The Item family's shared columns (lib/item-family.ts: CONTEXT.md "Opening
   // hours"; T adds the Try list here). Computed before the write — a plain
   // read, like the FX-rate resolve above (ADR 0007 keeps extra reads outside a
   // transaction) — and only for the columns the patch actually names, so a
   // patch that doesn't touch them never re-serialises `before`'s value (which
   // may not even parse — fix round 1) back onto the row, and never re-touches
   // the family. itemFamilyRecipients never crosses a Surprise (ADR 0072).
   const familyData: ItemFamilyData = {};
   if (patch.openingHours !== undefined) familyData.openingHours = serializeOpeningHours(data.openingHours);
   const sharesWithFamily = Object.keys(familyData).length > 0;
   const familyRecipients = sharesWithFamily ? await itemFamilyRecipients(before) : [];
   ```
   In `itemData`, replace
   ```ts
       // Omitted entirely when the patch didn't name the hours (fix round 1) —
       // never present to re-serialise `before`'s value back onto the row.
       ...(openingHoursStored !== undefined ? { openingHours: openingHoursStored } : {}),
   ```
   with
   ```ts
       // Only the family columns the patch named (fix round 1) — never present
       // to re-serialise `before`'s value back onto the row.
       ...familyData,
   ```
   In the write branch (`:477-488`), keep the long "Fix round 2" comment but change "only the path that actually names the hours" to "only the path that names a family column". Then before:
   ```ts
   if (patch.openingHours !== undefined) {
     const after = await db.$transaction(async (tx) => {
       const updated = await tx.item.update({ where: { id: itemId }, data: itemData });
       if (openingHoursRecipients.length > 0) {
         await tx.item.updateMany({ where: { id: { in: openingHoursRecipients } }, data: { openingHours: openingHoursStored } });
       }
       return updated;
     });
   ```
   After:
   ```ts
   if (sharesWithFamily) {
     const after = await db.$transaction(async (tx) => {
       const updated = await tx.item.update({ where: { id: itemId }, data: itemData });
       await writeItemFamily(tx, familyRecipients, familyData);
       return updated;
     });
   ```
   The `recordUpdate(...)` line after it, and the `else { auditedUpdate(...) }`, are unchanged.

3. Delete `openingHoursFamilyRecipients` and its doc comment (`:556-585`). The Surprise rule is now documented in `lib/item-family.ts`.

4. `setOpeningHours` (`:586-624`). In the doc comment, change "(fix round 1; see `openingHoursFamilyRecipients`)" to "(lib/item-family.ts)". In the body, before:
   ```ts
   const recipients = await openingHoursFamilyRecipients(before);

   const after = await db.$transaction(async (tx) => {
     const updated = await tx.item.update({ where: { id: itemId }, data: { openingHours: stored } });
     if (recipients.length > 0) {
       await tx.item.updateMany({ where: { id: { in: recipients } }, data: { openingHours: stored } });
     }
     return updated;
   });
   ```
   After:
   ```ts
   const recipients = await itemFamilyRecipients(before);

   const after = await db.$transaction(async (tx) => {
     const updated = await tx.item.update({ where: { id: itemId }, data: { openingHours: stored } });
     await writeItemFamily(tx, recipients, { openingHours: stored });
     return updated;
   });
   ```

5. `ideaCopyData` doc comment (`:722`): replace "lib/opening-hours.ts openingHoursFamilyWhere" with "lib/item-family.ts".

Comment-only renames:
- `prisma/schema.prisma:806-807`: "(lib/opening-hours.ts\n  // openingHoursFamilyWhere)" becomes "(lib/item-family.ts)". Make the same reference in the S.1 `tryList` comment explicit: "written to the whole family (lib/item-family.ts)". This changes no SQL; `prisma migrate diff --exit-code` stays clean.
- `lib/opening-hours-stored.ts:7` and `:11`: "its own `openingHoursFamilyWhere`" becomes "its own family `where`". "the family helpers `openingHoursFamilyRoot`/`openingHoursFamilyWhere` (lib/opening-hours.ts)" becomes "the family helpers `itemFamilyRoot`/`itemFamilyWhere` (now lib/item-family.ts)".
- `lib/opening-hours-stored.test.ts:8-9`: `openingHoursFamilyWhere` becomes `itemFamilyWhere`, and "openingHoursFamilyRoot/openingHoursFamilyWhere … lib/opening-hours.test.ts" becomes "itemFamilyRoot/itemFamilyWhere … lib/item-family.test.ts".
- `server/actions/items.test.ts:2480` and `:2504`: `openingHoursFamilyRecipients` becomes `itemFamilyRecipients (lib/item-family.ts)`. No assertion changes: the mocks of `@/lib/db` and `@/lib/surprise-guard` reach `lib/item-family.ts` too, and the `findMany` / `updateMany` arguments are identical.
- `docs/open-follow-ups.md:3276` (PM-02): `openingHoursFamilyRecipients(before)` becomes `itemFamilyRecipients(before)` (lib/item-family.ts). The follow-up stays open.

- [ ] **Step 4: Run it, expect PASS**
  - `npx vitest run lib/item-family.test.ts lib/opening-hours.test.ts server/actions/items.test.ts`: all pass. The `opening hours (CONTEXT.md Opening hours…)` block in items.test.ts, including "the family never crosses a Surprise" and "when the family updateMany throws, no Activity is recorded", passes unchanged.
  - `grep -rn "openingHoursFamily" --include=*.ts --include=*.tsx --include=*.prisma . | grep -v node_modules` prints nothing.

- [ ] **Step 5: Task-done check**
  - `npx vitest related --run lib/item-family.ts lib/opening-hours.ts server/actions/items.ts lib/opening-hours-stored.ts`
  - `npx tsc --noEmit`
  - `npx eslint lib/item-family.ts lib/item-family.test.ts lib/opening-hours.ts lib/opening-hours.test.ts server/actions/items.ts server/actions/items.test.ts lib/opening-hours-stored.ts lib/opening-hours-stored.test.ts`
  - The family query moved module, though it is byte-identical. Prove it against Postgres: `npm run test:integration -- test/integration/opening-hours.test.ts`. All 9 cases pass, including "the family never crosses a Surprise" and "a Fork-created copy … is left alone".

- [ ] **Step 6: Commit** — files: `lib/item-family.ts`, `lib/item-family.test.ts`, `lib/opening-hours.ts`, `lib/opening-hours.test.ts`, `server/actions/items.ts`, `server/actions/items.test.ts`, `lib/opening-hours-stored.ts`, `lib/opening-hours-stored.test.ts`, `prisma/schema.prisma`, `docs/open-follow-ups.md`. Message: `refactor(item-family): one family helper for shared Item columns (hours unchanged)`

---

### Task S.5: A Fork copies the Try list with its ticks; Duplicate trip keeps it unticked

**Files:**
- Modify: `lib/fork-plan.ts`:
  - `ForkSourceItem` (`:138-143`): add after `openingHours?: string | null;` (`:142`);
  - `ForkPlan` items data (`:270-275`): add after `openingHours: string | null;` (`:274`);
  - the builder (`:349`): add after `openingHours: it.openingHours ?? null,`;
  - header comment `:7`.
- Modify: `lib/duplicate-trip.ts`:
  - imports (`:14`);
  - `DuplicateSourceItem` (`:59-60`);
  - `DuplicatePlan` items data (`:121`);
  - the builder (`:198`);
  - header comment (`:6-10`).
- Test:
  - `lib/fork-plan.test.ts`: append after `:135`;
  - `lib/duplicate-trip.test.ts`: the `toEqual` at `:72-84` gains `tryList: null`, plus a new case after `:96`;
  - `test/integration/fork-duplicate-copies.test.ts:36-44,77-114`.

**Interfaces:**
- Consumes: S.1 `Item.tryList`; S.2 `untickAll`; S.3 `parseTryList`, `serializeTryList`. `server/actions/forks.ts` and `server/actions/trips.ts` read full Item rows (`db.item.findMany` / `include: { items }`) and spread `...x.data` into `create`, so neither changes.
- Produces: `ForkPlan.items[].data.tryList: string | null`, which is the source string as stored, ticks included. `DuplicatePlan.items[].data.tryList: string | null`, which keeps ids and text with every tick untried, and null for no list or an unreadable one.

- [ ] **Step 1: Write the failing test**

Append to `lib/fork-plan.test.ts`:

```ts
// Spec 2026-10-17 R6: a Fork is a faithful copy, so the Try list carries into
// the variant as it stands — ticks included.
it("carries the Try list, ticks and all, into the variant; none copies as null", () => {
  const list = JSON.stringify([{ id: "aaaa1111", text: "Drei im Weggla", tried: true }, { id: "bbbb2222", text: "Lebkuchen", tried: false }]);
  expect(buildForkPlan({ ...source, items: [{ ...source.items[0], tryList: list }] }).items[0].data.tryList).toBe(list);
  expect(buildForkPlan(source).items[0].data.tryList).toBeNull();
});
```

In `lib/duplicate-trip.test.ts`, in "turns all items into unscheduled wishlist items, clearing date/time/booking, keeping research" (`:72-84`), change `openingHours: null,` to `openingHours: null, tryList: null,`. After the "keeps an Item's Opening hours; leaves Booking state and Slot time to the defaults" case (`:88-96`), add:

```ts
  // Spec 2026-10-17 R6: the Try list belongs to the thing to do, so a Duplicate
  // keeps its entries — but a fresh Trip has tried nothing yet.
  it("keeps an Item's Try list with every tick reset to untried", () => {
    const list = JSON.stringify([{ id: "aaaa1111", text: "Drei im Weggla", tried: true }, { id: "bbbb2222", text: "Lebkuchen", tried: false }]);
    const plan = buildDuplicatePlan({ ...SOURCE, items: [{ ...SOURCE.items[0], tryList: list }] }, "x");
    expect(JSON.parse(plan.items[0].data.tryList!)).toEqual([
      { id: "aaaa1111", text: "Drei im Weggla", tried: false },
      { id: "bbbb2222", text: "Lebkuchen", tried: false },
    ]);
  });

  it("an unreadable Try list is not copied", () => {
    const plan = buildDuplicatePlan({ ...SOURCE, items: [{ ...SOURCE.items[0], tryList: "not json" }] }, "x");
    expect(plan.items[0].data.tryList).toBeNull();
  });
```

In `test/integration/fork-duplicate-copies.test.ts`:
- After `HOURS` (`:36`), add:
  ```ts
  const TRY = JSON.stringify([{ id: "aaaa1111", text: "Drei im Weggla", tried: true }, { id: "bbbb2222", text: "Lebkuchen", tried: false }]);
  const TRY_UNTICKED = JSON.stringify([{ id: "aaaa1111", text: "Drei im Weggla", tried: false }, { id: "bbbb2222", text: "Lebkuchen", tried: false }]);
  ```
- In `ITEM_FIELDS` (`:41-44`), after `openingHours: HOURS,`, add `tryList: TRY,`.
- In the header comment (`:3-12`), add `tryList` to the column list. Add "Fork copies the Try list with its ticks; Duplicate keeps it with every tick reset".
- Fork case (`:77`): rename it to `"a Fork carries bookingState, …, openingHours and tryList (ticks included)"`. Its `toMatchObject(ITEM_FIELDS)` now covers `tryList`.
- Duplicate case (`:92`): rename it to `"Duplicate trip keeps openingHours and the Try list (unticked) and resets the rest to their column defaults"`. In its item `toMatchObject`, after `openingHours: HOURS,`, add `tryList: TRY_UNTICKED,`.

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/fork-plan.test.ts lib/duplicate-trip.test.ts` fails as follows:
  - the fork case: `tryList` is `undefined`;
  - the duplicate `toEqual`: missing `tryList`;
  - both new duplicate cases: `tryList` is `undefined`, so `JSON.parse` throws in the first.

- [ ] **Step 3: Implement**

`lib/fork-plan.ts`:
- `ForkSourceItem`, after `openingHours?: string | null;`:
  ```ts
  /** CONTEXT.md "Try list" (R6) — copied as stored, ticks included. */
  tryList?: string | null;
  ```
- `ForkPlan` items `data`, after `openingHours: string | null;`: add `tryList: string | null;`
- Builder items `data`, after `openingHours: it.openingHours ?? null,`: add `tryList: it.tryList ?? null,`
- Header `:7`: append ` / Try list (with ticks)` to the KEEP line.

`lib/duplicate-trip.ts`:
- Imports, after `import { creationAnchor } from "@/lib/transport-anchor";`:
  ```ts
  import { untickAll } from "@/lib/try-list";
  import { parseTryList, serializeTryList } from "@/lib/validations/try-list";
  ```
- `DuplicateSourceItem`, after `openingHours?: string | null;`:
  ```ts
  /** CONTEXT.md "Try list" (R6) — kept with the thing to do, every tick reset (a fresh Trip has tried nothing). */
  tryList?: string | null;
  ```
- `DuplicatePlan` items `data`, after `openingHours: string | null;`: add `tryList: string | null;`
- Builder items `data`, after `openingHours: it.openingHours ?? null,`:
  ```ts
  tryList: serializeTryList(untickAll(parseTryList(it.tryList))),
  ```
- Header (`:8`): "Opening hours kept;" becomes "Opening hours kept; the Try list kept with every tick reset;".

- [ ] **Step 4: Run it, expect PASS**
  - `npx vitest run lib/fork-plan.test.ts lib/duplicate-trip.test.ts`: all pass.
  - Then `npm run test:integration -- test/integration/fork-duplicate-copies.test.ts`: 2 passed.

- [ ] **Step 5: Task-done check**
  - `npx vitest related --run lib/fork-plan.ts lib/duplicate-trip.ts`. This picks up `server/actions/forks.test.ts` and `server/actions/trips.test.ts`.
  - `npx tsc --noEmit`
  - `npx eslint lib/fork-plan.ts lib/fork-plan.test.ts lib/duplicate-trip.ts lib/duplicate-trip.test.ts test/integration/fork-duplicate-copies.test.ts`
  - `npm run test:integration -- test/integration/fork-duplicate-copies.test.ts`

- [ ] **Step 6: Commit** — files: `lib/fork-plan.ts`, `lib/fork-plan.test.ts`, `lib/duplicate-trip.ts`, `lib/duplicate-trip.test.ts`, `test/integration/fork-duplicate-copies.test.ts`. Message: `feat(try-list): Fork copies the Try list with ticks; Duplicate resets them (R6)`

---

### Task S.6: A placed copy carries its idea's Try list

**Files:**
- Modify: `server/actions/items.ts:718-770`. That is `ideaCopyData`: its doc comment, parameter type and returned object.
- Test: `server/actions/items.test.ts`:
  - add a case after `:927-941` (scheduleItem "carries the idea's Opening hours onto the placed copy");
  - add one after `:1504-1521` (placeIdeaAtStop "carries the idea's Opening hours onto the thing to do; none copies as null").

**Interfaces:**
- Consumes: S.1 `Item.tryList`. Both placements read the full row (`db.item.findUnique({ where: { id } })`, `:806` and `:927`), so `tryList` is already on `fullItem`.
- Produces: every copy-in placement creates the copy with `tryList: idea.tryList ?? null`. This is the idea's list as it stands, ticks included, because the family shares ticks. That covers `scheduleItem`'s copy-in branch, `placeIdeaAtStop`, and the MCP tools that call them. T's family writes rely on each row holding its own copy.

- [ ] **Step 1: Write the failing test**

In `server/actions/items.test.ts`, inside `describe("scheduleItem")`, after "carries the idea's Opening hours onto the placed copy (spec 2026-10-17 R4)":

```ts
  it("carries the idea's Try list, ticks included, onto the placed copy (spec 2026-10-17 R6)", async () => {
    const list = JSON.stringify([{ id: "aaaa1111", text: "Drei im Weggla", tried: true }]);
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "item-1", tripId: "trip-1" })
      .mockResolvedValueOnce({
        id: "item-1", tripId: "trip-1", forkId: null, date: null, stopId: null,
        title: "Christkindlesmarkt", category: "FOOD", tryList: list,
      });
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "placed-1" });

    await scheduleItem("item-1", { date: "2026-12-05" }, null);

    expect(itemCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ tryList: list }) });
  });
```

Inside `describe("placeIdeaAtStop")`, after "carries the idea's Opening hours onto the thing to do; none copies as null":

```ts
  it("carries the idea's Try list onto the thing to do; none copies as null", async () => {
    const list = JSON.stringify([{ id: "aaaa1111", text: "Lebkuchen", tried: false }]);
    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1", forkId: null })
      .mockResolvedValueOnce({ ...IDEA, tryList: list });
    stopFindFirstMock.mockResolvedValue({ id: "s1" });
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "placed-1" });
    await placeIdeaAtStop("idea-1", "s1");
    expect(itemCreateMock).toHaveBeenLastCalledWith({ data: expect.objectContaining({ tryList: list }) });

    itemFindUniqueMock
      .mockResolvedValueOnce({ id: "idea-1", tripId: "trip-1", forkId: null })
      .mockResolvedValueOnce(IDEA); // no tryList on the row
    await placeIdeaAtStop("idea-1", "s1");
    expect(itemCreateMock).toHaveBeenLastCalledWith({ data: expect.objectContaining({ tryList: null }) });
  });
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run server/actions/items.test.ts -t "Try list"`: both fail because `tryList` is absent from the create data.

- [ ] **Step 3: Implement**

In `server/actions/items.ts`, `ideaCopyData`:
- Parameter type: after `openingHours?: string | null;`, add `tryList?: string | null;`
- Returned object: after `openingHours: fullItem.openingHours ?? null,`, add
  ```ts
      // CONTEXT.md "Try list" (R6): shared by the family, ticks and all — the
      // copy starts with the idea's list as it stands (lib/item-family.ts).
      tryList: fullItem.tryList ?? null,
  ```
- Doc comment (`:718-731`): change "the share-hidden flag and the place's Opening hours (spec 2026-10-17 R4: shared by the family …)" to "the share-hidden flag, the place's Opening hours and the Try list with its ticks (spec 2026-10-17 R4, R6: shared by the family — each row holds a copy and writes go to all of them, lib/item-family.ts)".

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run server/actions/items.test.ts`: all pass.

- [ ] **Step 5: Task-done check** — `npx vitest related --run server/actions/items.ts` + `npx tsc --noEmit` + `npx eslint server/actions/items.ts server/actions/items.test.ts`

- [ ] **Step 6: Commit** — files: `server/actions/items.ts`, `server/actions/items.test.ts`. Message: `feat(try-list): a placed copy carries its idea's Try list (R6)`

---

### Task S.7: The Surprise placeholder masks the Try list

**Files:**
- Modify: `lib/surprise-visibility.ts`. In `PlaceholderItem`, add after `openingHours: null;` (`:45`). In the placeholder builder, add after `openingHours: null,` (`:198`).
- Modify: `test/helpers/surprise-visibility.ts:55` (`placeholderItem()` default)
- Test: Modify `lib/surprise-visibility.test.ts`, "case 5" (`:177-216`): extend the `toMatchObject` after `openingHours: null,` (`:213`).

**Interfaces:**
- Consumes: S.1 column name.
- Produces: `PlaceholderItem.tryList: null`. T's plan and day reads map placeholders into item rows from this field, and a hidden Surprise never shows a Try list, a count or ticks to its audience.

- [ ] **Step 1: Write the failing test**

In `lib/surprise-visibility.test.ts`, "case 5: a root Surprise Item produces one masked placeholder": in the `toMatchObject` object, after `openingHours: null,`, add:

```ts
      // Spec 2026-10-17 R6: the Try list says what the surprise is; it never leaks.
      tryList: null,
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/surprise-visibility.test.ts -t "case 5"`: the `toMatchObject` diff shows `tryList` missing (`undefined`).

- [ ] **Step 3: Implement**

`lib/surprise-visibility.ts`:
- `PlaceholderItem`, after `openingHours: null;`:
  ```ts
  // Spec 2026-10-17 R6: no Try list either — its entries would give the Surprise away.
  tryList: null;
  ```
- Builder `.map((i) => ({ … }))`, after `openingHours: null,`: add `tryList: null,`

`test/helpers/surprise-visibility.ts`, `placeholderItem()`: after `openingHours: null,` (`:55`), add `tryList: null,`. Without it, tsc fails on the helper's `PlaceholderItem` return type.

- [ ] **Step 4: Run it, expect PASS** — `npx vitest run lib/surprise-visibility.test.ts`: all pass.

- [ ] **Step 5: Task-done check** — `npx vitest related --run lib/surprise-visibility.ts test/helpers/surprise-visibility.ts` + `npx tsc --noEmit` + `npx eslint lib/surprise-visibility.ts lib/surprise-visibility.test.ts test/helpers/surprise-visibility.ts`

- [ ] **Step 6: Commit** — files: `lib/surprise-visibility.ts`, `lib/surprise-visibility.test.ts`, `test/helpers/surprise-visibility.ts`. Message: `feat(try-list): Surprise placeholder masks the Try list (R6)`

---

## Section F: The six Flags (R7)

### Notes

**Interfaces this section produces (for T and the final gate):**
- `lib/flags.ts`
  - `FlagTargetType` gains `"ITEM"`. The `Flag` shape is unchanged; an ITEM Flag sets `targetId` (the Item id), `date` (when the Item has one) and `stopId` (when it has one).
  - New optional fields:
    - `FlagItem`: `title`, `openingHours: OpeningHours | null` (already parsed), `slotTime`, `arriveByMinutes`, `bookingState`, `bookBy`.
    - `FlagTransport` and `FlagAccommodation`: `bookingState`, `bookBy`.
  - `DetectFlagsInput` gains three optional fields:
    - `today?: string | null`, the Trip's own today. The two booking-date rules stay silent without it.
    - `hiddenItemIds?: readonly string[]`.
    - `stopNames?: ReadonlyMap<string, string>`, every Stop's name including rough ones.
  - New rule exports:
    - `flagClosedOnDay(items)`
    - `flagOutsideOpeningHours(items)` + `CLOSING_SOON_MIN = 30`
    - `flagLateForSlot(items)`
    - `flagBookByDates(input)` + `BOOK_BY_SOON_DAYS = 7`
    - `flagStillToBookSoon(input)` + `STILL_TO_BOOK_WITHIN_DAYS = 14`
  - Flag ids:
    - `item-closed-<itemId>`
    - `item-before-open-<itemId>`
    - `item-after-close-<itemId>`
    - `item-late-slot-<itemId>`
    - `book-by-soon-<id>`
    - `book-by-overdue-<id>`
    - `still-to-book-<id>`
- `lib/next-steps.ts` `flagHref`: an ITEM Flag with a date goes to `/day/<date>`. Without a date it goes to `/plan?stop=<stopId>`, or else to `/plan`.
- `lib/flags-loader.ts`
  - `FlagsAssemblyInput` gains `today: string` (required) and `hiddenItemIds?`.
  - `FlagRows` gains `today: string` (from `tripTodayISO(allStops)`) and `hiddenItemIds: readonly string[]`.
  - `FLAG_ITEM_SELECT`, `FLAG_TRANSPORT_SELECT` and `FLAG_ACCOMMODATION_SELECT` read the Branch 1 columns. Items come back with `openingHours` parsed.
- `lib/next-steps-builder.ts` `BuildTripNextStepsInput` gains `today: string` (required) and `hiddenItemIds?`.
- `lib/compare.ts`
  - `PlanMetricsInput.today?: string`.
  - `CompareItem`, `CompareTransport` and `CompareAccommodation` gain the optional planning fields.
- MCP `get_flags`: every row gains `itemId: string | null`.
- `lib/demo/types.ts`
  - `demoBookingColumns(subject, row, reference)`.
  - `DemoItem` gains `openingHours`, `slotTime`, `arriveByMinutes`, `bookingState`, `bookBy`.
  - `DemoTransport` and `DemoAccommodation` gain `bookingState` and `bookBy`.
  - `PlanFlagOpts.today?`.

**Interfaces assumed from earlier sections:** none from Section S.
- Section F reads only Branch 1 columns and helpers, all verified in the repo today:
  - `hoursOn`, `OpeningHours`, `HoursSpan` (`lib/opening-hours.ts`)
  - `parseOpeningHours` / `serializeOpeningHours` (`lib/validations/opening-hours.ts`)
  - `withOpeningHours` (`lib/opening-hours-stored.ts`)
  - `defaultStartFromSlot` (`lib/slot-time.ts`)
  - `activeBookBy`, `bookingStateWrite`, `BookingSubject` (`lib/booking-state.ts`)
  - `BookingState` (`lib/enum-values.ts`)
  - `tripTodayISO` (`lib/trip-today.ts`)
- S's rename of `openingHoursFamilyRoot`/`openingHoursFamilyWhere` does not touch anything here.
- If S adds `tryList` to `PLAN_ITEM_SELECT` or `PlaceholderItem`, Summary's rows carry it harmlessly. Flags never read it.

**Decisions where the spec and the controller decisions are silent:**
1. **An Item Flag opens the Item's day, not the Item's dialog.**
   - No URL in the app opens an Item dialog today. There is no `?item=` handler anywhere, and `/plan?stop=` is itself not read yet (PM-04).
   - Following the existing Item link convention (`lib/still-to-book.ts:52-56`, `lib/files-index-loader.ts:51`, `server/actions/search.ts:68`), an ITEM Flag goes to `/day/<date>`, where the Item row and its dialog are one tap away. An undated thing to do goes to its Stop on the plan.
   - A real "open this Item" deep link is a follow-up candidate. Building it is new UI outside R7.
2. **Compare counts the six kinds in every column, Forks included,** with `today` set to the real plan's Trip today.
   - CONTEXT.md says a Fork "has its own projected end, **Flags** and Budget".
   - Counting the new kinds only in the real-plan column would make every Fork look healthier by exactly those Flags, so the delta row would be wrong.
   - "Real plan only" (R7) is honoured everywhere a Flag *list* is shown (Summary, badge, Next steps, get_flags all read the real plan).
   - This is Review Focus 3. If Cam reads R7 literally, the change is one line in `getComparison`: pass `today` only for `forkId === null` and skip the new fields for Forks.
3. **`today` is optional in `DetectFlagsInput` and `PlanMetricsInput`, but required in `FlagsAssemblyInput` and `BuildTripNextStepsInput`.**
   - The pure engine stays "silent when data is missing", so hundreds of existing tests keep compiling.
   - The two assemblers that every production list goes through make it a type error to forget, like `HomeTripInput.homeTimezone` (TB-01).
4. **Nothing is flagged as due for booking once its own date is past.**
   - This applies to Book by soon, Overdue, and Still to book close to the day. The "own date" is an Item's day, a leg's local departure day, or a check-in.
   - Nagging about a dinner that already happened is noise. Branch 1's backfill already marks the past Booked; this covers rows edited since then.
5. **Only plan placements are flagged.**
   - The new rules skip an Item with neither a Stop nor a date (a Wishlist idea).
   - `loadFlagRows`' Item read has no `PLAN_PLACEMENT_WHERE` while Summary's `readPlan` does. Filtering inside the rule keeps the badge equal to the Summary list without touching the shared `where` (whose `OR` would clash with the Surprise fragment's).
6. **Surprise.**
   - The new rules filter by `hiddenItemIds` (a placeholder, or anything inside a hidden Stop) and by `hiddenStopIds` (an Item's or stay's Stop).
   - They do **not** go through `outsideHidden`. An Item of a *visible* Stop on a Changeover day shared with a hidden Stop still flags.
   - Placeholders are already masked (null hours/slot, `NONE`), so the id filter is a second line of defence, not the only one.
   - Transport is the outside of a Surprise, so a leg into a hidden Stop still flags.
7. **Wording.**
   - All messages end with "." like every existing Flag.
   - A season closure reads "… is closed on Tuesdays (Winter)." when the season has a label, and "… at that time of year." when it does not.
   - A `24:00` close reads "midnight".
   - Leg labels read like "the train from Nuremberg to Munich". CAR is "the drive"; the Home end is the Home base name.
8. **Overnight Items** (end ≤ start) get no After closing check. The end lies on the next day, so comparing it with today's spans would be false.
9. **`stopNames`** (all Stops, rough included) is passed by every assembler, so a leg to a rough Stop still names it.
10. **Day view is unchanged.** `lib/day-view-loader.ts` only shows `flagTightConnections`, not the Flag list, and Branch 1 already shows "Open 10:00–18:00 today" on the row.
11. **Demo.**
    - `prisma/demo/persist.ts` never stored a Booking state (Branch 1 gap). Every seeded leg therefore read To book even with a reference, and Still to book close to the day would fire on the final-prep demo's referenced trains.
    - F.11 stores the derived state through `bookingStateWrite`, the same rule every writer uses, and gives the final-prep demo one To-book dinner so the new Flags show.
    - `prisma/real/persist.ts` has the same gap but seeds real data that the Branch 1 backfill already corrected. It is logged as a follow-up, not changed.
12. **Compare still passes no `hiddenStopIds`** to `detectFlags` (pre-existing). The new rules are silent on masked placeholders anyway. This is noted as a follow-up, not fixed here.

**Review Focus candidates:**
1. **Surprise boundary.**
   - Input: a Surprise Item for the member that is closed on its day, and a To-book stay with no book-by inside a Stop hidden from the member, 6 days out.
   - Expected: the planner's Flags include `item-closed-<gift>` and `still-to-book-<stay>`. The member's include neither, but do include the leg into the hidden Stop. An Item of a visible Stop on the shared Changeover day still flags.
   - Tested in F.2 (unit) and F.12 (integration, real Postgres).
2. **Opening-hours edges** (hours 10:00–18:00, lunch-split 10:00–12:00 / 14:00–18:00):

   | Item | Expected Flag |
   |---|---|
   | Starts 09:45 | Before opening |
   | Starts 13:15 (in the lunch gap) | "reopens at 14:00" |
   | Ends exactly 18:00 | none |
   | No end, starts 17:30 | "30 minutes after this starts" |
   | No end, starts 17:29 | none |
   | Starts 18:30 | After closing, "this starts 18:30" |
   | 11:00–15:00 on the lunch-split hours | "closes at 12:00; this ends 15:00" |
   | Close 24:00 | the message says "midnight" |

   Tested in F.3.
3. **One count everywhere.**
   - The badge (`flagsForRows`) counts exactly what the Summary assembly lists, the new kinds included.
   - A Wishlist idea that is To book and overdue never flags anywhere.
   - Compare counts the new kinds in Fork columns (decision 2; flip if Cam disagrees).
   - Tested in F.7, F.10 and F.12.

---

### Task F.1: `"ITEM"` Flag target, and where an Item Flag links

**Files:**
- Modify: `lib/flags.ts:23-28` (`FlagTargetType`)
- Modify: `lib/next-steps.ts:79-86` (`flagHref`)
- Modify: `components/trip/flag-list.tsx:61-77` (`buildLink`)
- Test: `lib/next-steps.test.ts` (append inside `describe("flagHref (spec 2026-10-06 §F)"` at :119)
- Create: `components/trip/flag-list.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `FlagTargetType` includes `"ITEM"`.
  - `flagHref(flag, base)`: for `targetType: "ITEM"` it returns `/day/<date>` when `flag.date` is set; otherwise `/plan?stop=<stopId>`, or `/plan` when there is no `stopId`.
  - `FlagList` links ITEM Flags through `flagHref`.

- [ ] **Step 1: Write the failing tests.**

  Append to `lib/next-steps.test.ts` inside the `flagHref` describe:

  ```ts
    it("an ITEM Flag opens the Item's day; an undated thing to do opens its Stop (spec 2026-10-17 R7)", () => {
      expect(flagHref({ id: "x", severity: "warning", message: "m", targetType: "ITEM", targetId: "i1", date: "2026-07-02", stopId: "s1" }, base))
        .toBe("/trips/t/day/2026-07-02");
      expect(flagHref({ id: "x", severity: "info", message: "m", targetType: "ITEM", targetId: "i1", stopId: "s1" }, base))
        .toBe("/trips/t/plan?stop=s1");
      expect(flagHref({ id: "x", severity: "info", message: "m", targetType: "ITEM", targetId: "i1" }, base))
        .toBe("/trips/t/plan");
    });
  ```

  Create `components/trip/flag-list.test.tsx`:

  ```tsx
  import { describe, it, expect } from "vitest";
  import type { Route } from "next";
  import { render, screen } from "@testing-library/react";
  import { FlagList } from "./flag-list";
  import type { Flag } from "@/lib/flags";

  const BASE = "/trips/t" as Route;

  describe("FlagList: Item Flags (spec 2026-10-17 R7)", () => {
    it("links an Item Flag to the Item's day", () => {
      const flags: Flag[] = [
        { id: "item-closed-i1", severity: "warning", message: "Memorium Nuremberg Trials is closed on Tuesdays.", targetType: "ITEM", targetId: "i1", date: "2026-12-08", stopId: "s1" },
      ];
      render(<FlagList flags={flags} tripBasePath={BASE} />);
      expect(screen.getByRole("link", { name: /closed on Tuesdays/ })).toHaveAttribute("href", "/trips/t/day/2026-12-08");
    });

    it("links an undated Item Flag to its Stop on the plan", () => {
      const flags: Flag[] = [
        { id: "book-by-soon-i2", severity: "info", message: "Book Tram pass by Fri 4 Dec, in 3 days.", targetType: "ITEM", targetId: "i2", stopId: "s1" },
      ];
      render(<FlagList flags={flags} tripBasePath={BASE} />);
      expect(screen.getByRole("link", { name: /Tram pass/ })).toHaveAttribute("href", "/trips/t/plan?stop=s1");
    });
  });
  ```

- [ ] **Step 2: Run them, expect FAIL.**
  - Run `npx vitest run lib/next-steps.test.ts components/trip/flag-list.test.tsx`.
  - `tsc`-level: `"ITEM"` is not assignable to `FlagTargetType`.
  - At runtime: the dated ITEM case returns `/trips/t/plan?stop=s1`, and `FlagList` renders no link (its `default: return null`).

- [ ] **Step 3: Implement.**
  - `lib/flags.ts:23-28`:

    ```ts
    type FlagTargetType =
      | "STOP"
      | "TRANSPORT"
      | "ACCOMMODATION"
      | "ITEM"
      | "DAY"
      | "TRIP";
    ```

    Extend the `date` field's doc comment on `Flag` (:37) to `/** For DAY flags: the ISO date string. For ITEM flags: the Item's day, when it has one. */`.
  - `lib/next-steps.ts:79-86`: rewrite the doc line, then add the ITEM line after the DAY line:

    ```ts
    /** Where a Flag is fixed (spec 2026-10-06 §F): its day, its missing leg's form, or its Stop on the plan. An Item Flag opens the Item's day (spec 2026-10-17 R7); an undated thing to do, its Stop. */
    export function flagHref(flag: Flag, base: string): Route {
      if (flag.targetType === "DAY") return flag.date ? tripSubPath(base, `/day/${flag.date}`) : tripSubPath(base, "/calendar");
      if (flag.targetType === "ITEM" && flag.date) return tripSubPath(base, `/day/${flag.date}`);
      if (flag.connection) return addTransportHref(base, flag.connection.from, flag.connection.to);
      const stopId = flag.targetType === "STOP" ? flag.targetId : flag.stopId;
      if (stopId && flag.targetType !== "TRIP") return tripSubPath(base, `/plan?stop=${encodeURIComponent(stopId)}`);
      return tripSubPath(base, "/plan");
    }
    ```

  - `components/trip/flag-list.tsx:63-67`: add `case "ITEM":` to the group that returns `flagHref(flag, basePath)`, and extend its comment to `// Spec 2026-10-06 §F: land on the Stop (or the missing leg's form), not the Home. An Item Flag opens its day (spec 2026-10-17 R7).`
- [ ] **Step 4: Run them, expect PASS.** Run `npx vitest run lib/next-steps.test.ts components/trip/flag-list.test.tsx`.
- [ ] **Step 5: Task-done check.**
  - `npx vitest related --run lib/flags.ts lib/next-steps.ts components/trip/flag-list.tsx`
  - `npx tsc --noEmit`
  - `npx eslint lib/flags.ts lib/next-steps.ts lib/next-steps.test.ts components/trip/flag-list.tsx components/trip/flag-list.test.tsx`
- [ ] **Step 6: Commit.**
  - Files: `lib/flags.ts`, `lib/next-steps.ts`, `lib/next-steps.test.ts`, `components/trip/flag-list.tsx`, `components/trip/flag-list.test.tsx`.
  - Message: `feat(flags): ITEM Flag target; an Item Flag opens its day`.

---

### Task F.2: Closed that day (warning), plus the planning-rule filter and Surprise wiring

**Files:**
- Modify: `lib/flags.ts`:
  - imports :10-16
  - `FlagItem` :79-87
  - `DetectFlagsInput` :89-137
  - new rule section before `// Main: detectFlags` (:887)
  - `detectFlags` :891-971
- Create: `lib/flags-planning.test.ts` (the six rules' tests live here so the 1,136-line `lib/flags.test.ts` is not churned)

**Interfaces:**
- Consumes: `hoursOn`, `type OpeningHours`, `type DayHours` from `lib/opening-hours.ts`; `parseISODate`, `formatDayLabel` from `lib/dates.ts`.
- Produces:
  - `FlagItem.title?: string | null` and `FlagItem.openingHours?: OpeningHours | null`.
  - `DetectFlagsInput.hiddenItemIds?: readonly string[]`.
  - `flagClosedOnDay(items: FlagItem[]): Flag[]`.
  - Internal helpers later tasks reuse: `planningSubjects`, `itemTitle`, `itemTarget`, `itemFlag`.

- [ ] **Step 1: Write the failing test.** Create `lib/flags-planning.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import { detectFlags, flagClosedOnDay, type FlagItem, type FlagStop } from "./flags";
  import type { OpeningHours } from "@/lib/opening-hours";

  // ---------------------------------------------------------------------------
  // Fixtures (spec 2026-10-17 R7). 2026-12-08 is a Tuesday; 2026-12-24 a Thursday.
  // ---------------------------------------------------------------------------

  type Spans = [string, string][];
  const everyDay = (spans: Spans) => ({ sun: spans, mon: spans, tue: spans, wed: spans, thu: spans, fri: spans, sat: spans });
  const hours = (o: Partial<OpeningHours>): OpeningHours => ({ week: {}, seasons: [], closed: [], ...o });
  const item = (o: Partial<FlagItem> & { id: string }): FlagItem => ({
    stopId: "nbg", date: "2026-12-08", startTime: null, endTime: null, lat: null, lng: null, title: o.id, ...o,
  });
  const stop = (o: Partial<FlagStop> & Pick<FlagStop, "id" | "arriveDate" | "departDate">): FlagStop => ({
    name: o.id, timezone: "Europe/Berlin", sortOrder: 0, lat: null, lng: null, ...o,
  });

  describe("flagClosedOnDay (Closed that day, warning)", () => {
    it("an Item on a weekday its usual week marks closed", () => {
      const flags = flagClosedOnDay([
        item({ id: "i1", title: "Memorium Nuremberg Trials", openingHours: hours({ week: { ...everyDay([["09:00", "18:00"]]), tue: [] } }) }),
      ]);
      expect(flags).toEqual([
        {
          id: "item-closed-i1", severity: "warning", message: "Memorium Nuremberg Trials is closed on Tuesdays.",
          targetType: "ITEM", targetId: "i1", date: "2026-12-08", stopId: "nbg",
        },
      ]);
    });

    it("a closed date names the day", () => {
      const [f] = flagClosedOnDay([item({ id: "i1", title: "Albrecht Dürer's House", date: "2026-12-24", openingHours: hours({ week: everyDay([["10:00", "17:00"]]), closed: ["12-24"] }) })]);
      expect(f.message).toBe("Albrecht Dürer's House is closed on Thu 24 Dec.");
    });

    it("a season's closed weekday says which season", () => {
      const winter = { label: "Winter", from: "11-01", to: "03-31", week: { ...everyDay([["10:00", "16:00"]]), tue: [] } };
      const [f] = flagClosedOnDay([item({ id: "i1", title: "Kaiserburg", openingHours: hours({ week: everyDay([["09:00", "18:00"]]), seasons: [winter] }) })]);
      expect(f.message).toBe("Kaiserburg is closed on Tuesdays (Winter).");
      const [g] = flagClosedOnDay([item({ id: "i2", title: "Kaiserburg", openingHours: hours({ week: everyDay([["09:00", "18:00"]]), seasons: [{ ...winter, label: undefined }] }) })]);
      expect(g.message).toBe("Kaiserburg is closed on Tuesdays at that time of year.");
    });

    it("silent when the data is missing: no hours, the weekday not known, no date, or open that day", () => {
      expect(flagClosedOnDay([
        item({ id: "a" }),
        item({ id: "b", openingHours: hours({ week: { mon: [] } }) }), // Tuesday not entered: not known
        item({ id: "c", date: null, openingHours: hours({ week: everyDay([]) }) }),
        item({ id: "d", openingHours: hours({ week: everyDay([["09:00", "18:00"]]) }) }),
      ])).toEqual([]);
    });

    it("an untitled Item still reads as a sentence", () => {
      const [f] = flagClosedOnDay([item({ id: "i1", title: null, openingHours: hours({ week: everyDay([]) }) })]);
      expect(f.message).toBe("This thing to do is closed on Tuesdays.");
    });
  });

  describe("detectFlags: the planning Flags are Surprise-aware and plan-only (R7)", () => {
    const nbg = stop({ id: "nbg", name: "Nuremberg", arriveDate: "2026-12-06", departDate: "2026-12-08", sortOrder: 0 });
    const secret = stop({ id: "secret", name: "Secret", arriveDate: "2026-12-08", departDate: "2026-12-10", sortOrder: 1 });
    const closedTue = hours({ week: everyDay([]) });
    const base = { stops: [nbg, secret], transports: [], accommodations: [], tripStart: "2026-12-06", tripEnd: "2026-12-10" };
    const closedIds = (flags: { id: string }[]) => flags.map((f) => f.id).filter((id) => id.startsWith("item-closed-"));

    it("no Flag for an Item the viewer cannot see, nor for one inside a hidden Stop", () => {
      const items = [
        item({ id: "hidden-root", openingHours: closedTue }),
        item({ id: "in-secret", stopId: "secret", openingHours: closedTue }),
        item({ id: "visible", openingHours: closedTue }),
      ];
      expect(closedIds(detectFlags({ ...base, items, hiddenStopIds: ["secret"], hiddenItemIds: ["hidden-root"] }))).toEqual(["item-closed-visible"]);
      // Without the inputs, all three flag.
      expect(closedIds(detectFlags({ ...base, items }))).toHaveLength(3);
    });

    it("an Item of a visible Stop on the Changeover day it shares with a hidden Stop still flags", () => {
      const items = [item({ id: "visible", stopId: "nbg", date: "2026-12-08", openingHours: closedTue })];
      expect(closedIds(detectFlags({ ...base, items, hiddenStopIds: ["secret"] }))).toEqual(["item-closed-visible"]);
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/flags-planning.test.ts`. It fails because `flagClosedOnDay` is not exported, and `title`/`openingHours`/`hiddenItemIds` are not on the types.

- [ ] **Step 3: Implement** in `lib/flags.ts`.
  - Imports (:10-16): change the `@/lib/dates` import to `import { nightsBetween, isDateWithin, addDays, daysBetween, formatLongDate, formatISODate, formatDayLabel, parseISODate } from "@/lib/dates";`, then add:

    ```ts
    import { hoursOn, type DayHours, type OpeningHours } from "@/lib/opening-hours";
    ```

  - `FlagItem` (:79-87): append:

    ```ts
      /** The Item's title, for the planning Flags' wording (spec 2026-10-17 R7). */
      title?: string | null;
      /** CONTEXT.md "Opening hours", already parsed (lib/opening-hours-stored.ts withOpeningHours); read in the Stop's local time, like startTime. */
      openingHours?: OpeningHours | null;
    ```

  - `DetectFlagsInput` (after `hiddenStopIds`, :136): append:

    ```ts
      /**
       * Surprise (ADR 0051): Items the viewer may not see (a hidden root Item's
       * placeholder, every Item inside a hidden Stop). The planning Flags
       * (spec 2026-10-17 R7) never name them.
       */
      hiddenItemIds?: readonly string[];
    ```

  - New section, inserted before `// Main: detectFlags` (:887):

    ```ts
    // ---------------------------------------------------------------------------
    // Planning Flags (spec 2026-10-17 R7): what they may look at
    //
    // Plan placements only (a Wishlist idea has neither a Stop nor a day) and
    // nothing the viewer cannot see. Deliberately not `outsideHidden`: an Item of
    // a visible Stop on the Changeover day it shares with a hidden Stop still
    // flags. Placeholders are masked already (no hours, slot or booking), so the
    // id filter is a second line of defence.
    // ---------------------------------------------------------------------------

    function planningSubjects(
      items: FlagItem[],
      accommodations: FlagAccommodation[],
      hiddenStops: ReadonlySet<string>,
      hiddenItemIds: readonly string[] | undefined,
    ): { items: FlagItem[]; accommodations: FlagAccommodation[] } {
      const hiddenItems = new Set(hiddenItemIds ?? []);
      return {
        items: items.filter(
          (i) => (i.stopId || i.date) && !hiddenItems.has(i.id) && !(i.stopId && hiddenStops.has(i.stopId)),
        ),
        accommodations: accommodations.filter((a) => !hiddenStops.has(a.stopId)),
      };
    }

    function itemTitle(item: FlagItem): string | null {
      return item.title?.trim() || null;
    }

    function itemTarget(item: FlagItem): Pick<Flag, "targetType" | "targetId" | "date" | "stopId"> {
      return {
        targetType: "ITEM",
        targetId: item.id,
        ...(item.date ? { date: item.date } : {}),
        ...(item.stopId ? { stopId: item.stopId } : {}),
      };
    }

    function itemFlag(item: FlagItem, id: string, severity: FlagSeverity, message: string): Flag {
      return { id, severity, message, ...itemTarget(item) };
    }

    // ---------------------------------------------------------------------------
    // Rule 17: Closed that day (warning)
    //
    // The Item's day is closed by its Opening hours: a closed date, the governing
    // season's weekday, or the usual week's. Silent when the hours, the weekday
    // or the date is not known (hoursOn returns null).
    // ---------------------------------------------------------------------------

    const WEEKDAYS_PLURAL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"] as const;

    function closedMessage(name: string, date: string, day: DayHours): string {
      if (day.by === "closed-date") return `${name} is closed on ${formatDayLabel(date)}.`;
      const weekdays = WEEKDAYS_PLURAL[parseISODate(date).getUTCDay()];
      if (day.by === "season") {
        return day.seasonLabel
          ? `${name} is closed on ${weekdays} (${day.seasonLabel}).`
          : `${name} is closed on ${weekdays} at that time of year.`;
      }
      return `${name} is closed on ${weekdays}.`;
    }

    export function flagClosedOnDay(items: FlagItem[]): Flag[] {
      const flags: Flag[] = [];
      for (const item of items) {
        if (!item.date) continue;
        const day = hoursOn(item.openingHours, item.date);
        if (!day?.closed) continue;
        const name = itemTitle(item) ?? "This thing to do";
        flags.push(itemFlag(item, `item-closed-${item.id}`, "warning", closedMessage(name, item.date, day)));
      }
      return flags;
    }
    ```

  - `detectFlags`:
    - Add `hiddenItemIds` to the destructured parameters (after `hiddenStopIds`, :927).
    - After the `outsideHidden` line (:934), add:

      ```ts
        const planning = planningSubjects(items, accommodations, hidden, hiddenItemIds);
      ```

    - Append to the returned array (after the `flagReturnLegAfterHardEnd` line, :969):

      ```ts
          // Spec 2026-10-17 R7: the planning Flags, on what the viewer can see.
          ...flagClosedOnDay(planning.items),
      ```

    - Add to the doc comment's rule list (:894-907): `17. Closed that day (warning)`.
  - Every message here and in later tasks: no em-dashes (`test/copy-style.test.ts`).
- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run lib/flags-planning.test.ts lib/flags.test.ts`. The existing `lib/flags.test.ts` stays green because no existing input carries hours.
- [ ] **Step 5: Task-done check.**
  - `npx vitest related --run lib/flags.ts`
  - `npx tsc --noEmit`
  - `npx eslint lib/flags.ts lib/flags-planning.test.ts`
- [ ] **Step 6: Commit.**
  - Files: `lib/flags.ts`, `lib/flags-planning.test.ts`.
  - Message: `feat(flags): Closed that day, Surprise-aware and plan-only (R7)`.

---

### Task F.3: Before opening and After closing (warnings)

Before opening and After closing are one task because both read the same governing span: the first span that has not closed by the Item's start.

**Files:**
- Modify: `lib/flags.ts` (append after Rule 17 from F.2; extend `detectFlags`)
- Test: `lib/flags-planning.test.ts` (append)

**Interfaces:**
- Consumes: `planningSubjects`, `itemTitle`, `itemFlag` (F.2); `hhmmToMin` (`lib/flags.ts:613`, already handles `"24:00"` → 1440).
- Produces:
  - `export const CLOSING_SOON_MIN = 30`.
  - `export function flagOutsideOpeningHours(items: FlagItem[]): Flag[]`, with ids `item-before-open-<id>` and `item-after-close-<id>`.

- [ ] **Step 1: Write the failing test.**
  - Append to `lib/flags-planning.test.ts`.
  - Add `flagOutsideOpeningHours` to the `./flags` import.

  ```ts
  describe("flagOutsideOpeningHours (Before opening / After closing, warnings)", () => {
    const day = hours({ week: everyDay([["10:00", "18:00"]]) });
    const lunch = hours({ week: everyDay([["10:00", "12:00"], ["14:00", "18:00"]]) });
    const late = hours({ week: everyDay([["20:00", "24:00"]]) });
    const run = (o: Partial<FlagItem>) =>
      flagOutsideOpeningHours([item({ id: "i1", title: "Documentation Centre", openingHours: day, ...o })]).map((f) => [f.id, f.message]);

    it("a start before the first span opens says when it opens", () => {
      expect(run({ startTime: "09:45" })).toEqual([["item-before-open-i1", "Documentation Centre opens at 10:00; this starts 09:45."]]);
    });

    it("a start in a gap between spans says when it next opens", () => {
      expect(run({ openingHours: lunch, startTime: "13:15" })).toEqual([["item-before-open-i1", "Documentation Centre reopens at 14:00; this starts 13:15."]]);
    });

    it("an end after the governing span's close", () => {
      expect(run({ startTime: "16:00", endTime: "18:30" })).toEqual([["item-after-close-i1", "Documentation Centre closes at 18:00; this ends 18:30."]]);
      expect(run({ openingHours: lunch, startTime: "11:00", endTime: "15:00" })).toEqual([["item-after-close-i1", "Documentation Centre closes at 12:00; this ends 15:00."]]);
    });

    it("with no end, a start within 30 minutes of closing (inclusive)", () => {
      expect(run({ startTime: "17:40" })).toEqual([["item-after-close-i1", "Documentation Centre closes at 18:00, 20 minutes after this starts."]]);
      expect(run({ startTime: "17:30" })).toEqual([["item-after-close-i1", "Documentation Centre closes at 18:00, 30 minutes after this starts."]]);
      expect(run({ startTime: "17:59" })).toEqual([["item-after-close-i1", "Documentation Centre closes at 18:00, 1 minute after this starts."]]);
      expect(run({ startTime: "17:29" })).toEqual([]);
    });

    it("a start at or after the last close is after closing, whatever the end", () => {
      expect(run({ startTime: "18:30" })).toEqual([["item-after-close-i1", "Documentation Centre closes at 18:00; this starts 18:30."]]);
      expect(run({ startTime: "18:00", endTime: "19:00" })).toEqual([["item-after-close-i1", "Documentation Centre closes at 18:00; this starts 18:00."]]);
    });

    it("starting before opening and ending after closing raises both", () => {
      expect(run({ startTime: "09:00", endTime: "19:00" }).map(([id]) => id)).toEqual(["item-before-open-i1", "item-after-close-i1"]);
    });

    it("a 24:00 close reads as midnight", () => {
      expect(run({ openingHours: late, startTime: "23:45" })).toEqual([["item-after-close-i1", "Documentation Centre closes at midnight, 15 minutes after this starts."]]);
    });

    it("inside the hours, no Flag; ending exactly at close, no Flag", () => {
      expect(run({ startTime: "10:00" })).toEqual([]);
      expect(run({ startTime: "16:00", endTime: "18:00" })).toEqual([]);
    });

    it("silent when the data is missing, closed (Closed that day's job) or overnight", () => {
      expect(run({ startTime: null })).toEqual([]);
      expect(run({ date: null, startTime: "09:00" })).toEqual([]);
      expect(run({ openingHours: null, startTime: "09:00" })).toEqual([]);
      expect(run({ openingHours: hours({ week: { mon: [["10:00", "18:00"]] } }), startTime: "09:00" })).toEqual([]); // Tuesday not known
      expect(run({ openingHours: hours({ week: everyDay([]) }), startTime: "09:00" })).toEqual([]);
      expect(run({ openingHours: late, startTime: "23:00", endTime: "01:00" })).toEqual([]); // ends the next day
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/flags-planning.test.ts -t "flagOutsideOpeningHours"`. It fails because `flagOutsideOpeningHours` is not exported.
- [ ] **Step 3: Implement.** Append after Rule 17 in `lib/flags.ts`:

  ```ts
  // ---------------------------------------------------------------------------
  // Rules 18–19: Before opening / After closing (warnings)
  //
  // Read in the Stop's local time on the Item's day. The governing span is the
  // first that has not closed by the Item's start:
  //   - start before it opens            → Before opening ("opens"/"reopens at")
  //   - no span left (start ≥ last close) → After closing ("this starts …")
  //   - an end after its close            → After closing ("this ends …")
  //   - no end, start within CLOSING_SOON_MIN of its close → After closing
  // An end at or before the start runs into the next day: no end check.
  // A closed day is Closed that day's job; an unknown day stays silent.
  // ---------------------------------------------------------------------------

  export const CLOSING_SOON_MIN = 30;

  const clock = (hhmm: string) => (hhmm === "24:00" ? "midnight" : hhmm);

  export function flagOutsideOpeningHours(items: FlagItem[]): Flag[] {
    const flags: Flag[] = [];
    for (const item of items) {
      if (!item.date || !item.startTime) continue;
      const day = hoursOn(item.openingHours, item.date);
      if (!day || day.closed || day.spans.length === 0) continue;
      const name = itemTitle(item) ?? "This thing to do";
      const start = hhmmToMin(item.startTime);
      const end = item.endTime ? hhmmToMin(item.endTime) : null;
      const spans = day.spans.map(([open, close]) => ({ open, close, openMin: hhmmToMin(open), closeMin: hhmmToMin(close) }));
      const at = spans.findIndex((s) => s.closeMin > start);
      if (at === -1) {
        const last = spans[spans.length - 1];
        flags.push(itemFlag(item, `item-after-close-${item.id}`, "warning", `${name} closes at ${clock(last.close)}; this starts ${item.startTime}.`));
        continue;
      }
      const span = spans[at];
      if (start < span.openMin) {
        const verb = at === 0 ? "opens" : "reopens";
        flags.push(itemFlag(item, `item-before-open-${item.id}`, "warning", `${name} ${verb} at ${span.open}; this starts ${item.startTime}.`));
      }
      if (end !== null) {
        if (end > start && end > span.closeMin) {
          flags.push(itemFlag(item, `item-after-close-${item.id}`, "warning", `${name} closes at ${clock(span.close)}; this ends ${item.endTime}.`));
        }
      } else if (start >= span.openMin && span.closeMin - start <= CLOSING_SOON_MIN) {
        const left = span.closeMin - start;
        flags.push(itemFlag(item, `item-after-close-${item.id}`, "warning", `${name} closes at ${clock(span.close)}, ${left} minute${left === 1 ? "" : "s"} after this starts.`));
      }
    }
    return flags;
  }
  ```

  - `hhmmToMin` is declared at :613. That is above the insertion point and it is a `function` declaration, so it is hoisted either way.
  - In `detectFlags`, after `...flagClosedOnDay(planning.items),` add `...flagOutsideOpeningHours(planning.items),`.
  - Add to the doc rule list: `18–19. Before opening / After closing (warning)`.
- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run lib/flags-planning.test.ts`.
- [ ] **Step 5: Task-done check.**
  - `npx vitest related --run lib/flags.ts`
  - `npx tsc --noEmit`
  - `npx eslint lib/flags.ts lib/flags-planning.test.ts`
- [ ] **Step 6: Commit.**
  - Files: `lib/flags.ts`, `lib/flags-planning.test.ts`.
  - Message: `feat(flags): Before opening and After closing (R7)`.

---

### Task F.4: Late for the slot (warning)

**Files:**
- Modify: `lib/flags.ts`:
  - imports
  - `FlagItem`
  - new Rule 20 after Rules 18–19
  - `detectFlags`
- Test: `lib/flags-planning.test.ts` (append)

**Interfaces:**
- Consumes: `defaultStartFromSlot(slot, arriveByMinutes)` from `lib/slot-time.ts` (Branch 1; clamps at 00:00); `itemFlag`, `itemTitle` (F.2).
- Produces:
  - `FlagItem.slotTime?: string | null` and `FlagItem.arriveByMinutes?: number | null`.
  - `export function flagLateForSlot(items: FlagItem[]): Flag[]`, with id `item-late-slot-<id>`.

- [ ] **Step 1: Write the failing test.**
  - Append to `lib/flags-planning.test.ts`.
  - Add `flagLateForSlot` to the import.

  ```ts
  describe("flagLateForSlot (Late for the slot, warning)", () => {
    const run = (o: Partial<FlagItem>) =>
      flagLateForSlot([item({ id: "i1", title: "Neues Museum tour", slotTime: "12:00", arriveByMinutes: 15, ...o })]).map((f) => [f.id, f.message, f.targetType]);

    it("a start after slot − arrive-by", () => {
      expect(run({ startTime: "11:50" })).toEqual([["item-late-slot-i1", "Neues Museum tour starts 11:50, but the 12:00 slot needs you there by 11:45.", "ITEM"]]);
    });

    it("with no arrive-by, a start after the slot itself", () => {
      expect(run({ arriveByMinutes: null, startTime: "12:10" })).toEqual([["item-late-slot-i1", "Neues Museum tour starts 12:10, after its 12:00 slot.", "ITEM"]]);
      expect(run({ arriveByMinutes: 0, startTime: "12:00" })).toEqual([]);
    });

    it("on time or early, no Flag", () => {
      expect(run({ startTime: "11:45" })).toEqual([]);
      expect(run({ startTime: "11:00" })).toEqual([]);
    });

    it("silent with no slot or no start", () => {
      expect(run({ slotTime: null, startTime: "11:50" })).toEqual([]);
      expect(run({ startTime: null })).toEqual([]);
    });

    it("detectFlags leaves out an Item hidden by a Surprise", () => {
      const nbg = stop({ id: "nbg", arriveDate: "2026-12-06", departDate: "2026-12-09" });
      const items = [item({ id: "gift", slotTime: "12:00", arriveByMinutes: 15, startTime: "11:50" })];
      const ids = (hiddenItemIds?: string[]) =>
        detectFlags({ stops: [nbg], transports: [], accommodations: [], items, tripStart: "2026-12-06", tripEnd: "2026-12-09", hiddenItemIds })
          .map((f) => f.id).filter((id) => id.startsWith("item-late-slot-"));
      expect(ids()).toEqual(["item-late-slot-gift"]);
      expect(ids(["gift"])).toEqual([]);
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/flags-planning.test.ts -t "flagLateForSlot"`. It fails because the function is not exported and the slot fields are not on `FlagItem`.
- [ ] **Step 3: Implement.**
  - Import: `import { defaultStartFromSlot } from "@/lib/slot-time";`
  - `FlagItem`: append:

    ```ts
      /** CONTEXT.md "Slot time": the ticket's time ("HH:mm") and how early to be there (minutes). */
      slotTime?: string | null;
      arriveByMinutes?: number | null;
    ```

  - Rule:

    ```ts
    // ---------------------------------------------------------------------------
    // Rule 20: Late for the slot (warning)
    //
    // The Item starts after its slot less the arrive-by margin (the same
    // "be there" time the Item form defaults the start to, clamped at 00:00).
    // Covers a start the Traveller moved, or a slot changed after the start was
    // defaulted (spec 2026-10-17, Branch 1 as built, C.2).
    // ---------------------------------------------------------------------------

    export function flagLateForSlot(items: FlagItem[]): Flag[] {
      const flags: Flag[] = [];
      for (const item of items) {
        if (!item.startTime || !item.slotTime) continue;
        const beThere = defaultStartFromSlot(item.slotTime, item.arriveByMinutes);
        if (!beThere || hhmmToMin(item.startTime) <= hhmmToMin(beThere)) continue;
        const name = itemTitle(item) ?? "This thing to do";
        const message = item.arriveByMinutes
          ? `${name} starts ${item.startTime}, but the ${item.slotTime} slot needs you there by ${beThere}.`
          : `${name} starts ${item.startTime}, after its ${item.slotTime} slot.`;
        flags.push(itemFlag(item, `item-late-slot-${item.id}`, "warning", message));
      }
      return flags;
    }
    ```

  - In `detectFlags`, add `...flagLateForSlot(planning.items),` after the F.3 line, and add `20. Late for the slot (warning)` to the doc list.
- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run lib/flags-planning.test.ts`.
- [ ] **Step 5: Task-done check.**
  - `npx vitest related --run lib/flags.ts`
  - `npx tsc --noEmit`
  - `npx eslint lib/flags.ts lib/flags-planning.test.ts`
- [ ] **Step 6: Commit.**
  - Files: `lib/flags.ts`, `lib/flags-planning.test.ts`.
  - Message: `feat(flags): Late for the slot (R7)`.

---

### Task F.5: Book by soon (info) and Overdue (warning), on Items, Transport and Accommodation

**Files:**
- Modify: `lib/flags.ts`:
  - imports
  - `FlagItem` / `FlagTransport` :60-69 / `FlagAccommodation` :71-77
  - `DetectFlagsInput`
  - new Rule 21
  - `detectFlags`
- Test: `lib/flags-planning.test.ts` (append)

**Interfaces:**
- Consumes: `activeBookBy(state, bookBy)` from `lib/booking-state.ts`; `instantToZonedDateISO` (already imported); `planningSubjects`, `itemTarget`, `itemTitle` (F.2).
- Produces:
  - New optional fields:
    - `FlagItem.bookingState?: string | null` and `FlagItem.bookBy?: string | null`.
    - The same two on `FlagTransport` and on `FlagAccommodation`.
    - `DetectFlagsInput.today?: string | null` and `DetectFlagsInput.stopNames?: ReadonlyMap<string, string>`.
  - `export const BOOK_BY_SOON_DAYS = 7`.
  - `export function flagBookByDates(input: { items: FlagItem[]; transports: FlagTransport[]; accommodations: FlagAccommodation[] } & BookingContext): Flag[]`, with ids `book-by-soon-<id>` and `book-by-overdue-<id>`.
  - `BookingContext = { today: string; stops: FlagStop[]; stopNames?: ReadonlyMap<string, string>; home?: HomeBase | null; homeTimezone?: string | null }`. It is exported as a type for F.6.

- [ ] **Step 1: Write the failing test.**
  - Append to `lib/flags-planning.test.ts`.
  - Add `flagBookByDates`, `type FlagTransport` and `type FlagAccommodation` to the import.
  - Dates used: 2026-12-01 is a Tuesday, 12-02 a Wednesday, 12-03 a Thursday, 12-04 a Friday, 11-28 a Saturday, 11-30 a Monday.

  ```ts
  describe("flagBookByDates (Book by soon, info / Overdue, warning)", () => {
    const today = "2026-12-01";
    const nbg = stop({ id: "nbg", name: "Nuremberg", arriveDate: "2026-12-06", departDate: "2026-12-09", sortOrder: 0 });
    const munich = stop({ id: "munich", name: "Munich", arriveDate: "2026-12-09", departDate: "2026-12-12", sortOrder: 1 });
    const toBook = { bookingState: "TO_BOOK" };
    const leg = (o: Partial<FlagTransport> & { id: string }): FlagTransport => ({ mode: "TRAIN", fromStopId: "nbg", toStopId: "munich", depAt: null, arrAt: null, ...o });
    const stay = (o: Partial<FlagAccommodation> & { id: string }): FlagAccommodation => ({ stopId: "nbg", name: "Hotel Victoria", checkIn: "2026-12-06", checkOut: "2026-12-09", ...o });
    const run = (o: { items?: FlagItem[]; transports?: FlagTransport[]; accommodations?: FlagAccommodation[]; home?: { name: string; lat: number; lng: number; countryCode: string | null } }) =>
      flagBookByDates({ items: [], transports: [], accommodations: [], today, stops: [nbg, munich], ...o });

    it("an Item To book within the next 7 days", () => {
      const at = (bookBy: string) => run({ items: [item({ id: "i1", title: "Neues Museum tour", date: "2026-12-08", ...toBook, bookBy })] });
      expect(at("2026-12-04")).toEqual([
        { id: "book-by-soon-i1", severity: "info", message: "Book Neues Museum tour by Fri 4 Dec, in 3 days.", targetType: "ITEM", targetId: "i1", date: "2026-12-08", stopId: "nbg" },
      ]);
      expect(at("2026-12-01")[0].message).toBe("Book Neues Museum tour today: it's the book-by date.");
      expect(at("2026-12-02")[0].message).toBe("Book Neues Museum tour by tomorrow (Wed 2 Dec).");
      expect(at("2026-12-08")).toHaveLength(1); // 7 days: still soon
      expect(at("2026-12-09")).toEqual([]); // 8 days: not yet
    });

    it("a book-by date already past is overdue", () => {
      expect(run({ accommodations: [stay({ id: "a1", ...toBook, bookBy: "2026-11-30" })] })).toEqual([
        { id: "book-by-overdue-a1", severity: "warning", message: "Book Hotel Victoria now: its book-by date (Mon 30 Nov) has passed.", targetType: "ACCOMMODATION", targetId: "a1", stopId: "nbg" },
      ]);
    });

    it("a leg names its mode and ends; a Home end is the Home base", () => {
      const [f] = run({ transports: [leg({ id: "t1", ...toBook, bookBy: "2026-12-03" })] });
      expect(f).toEqual({ id: "book-by-soon-t1", severity: "info", message: "Book the train from Nuremberg to Munich by Thu 3 Dec, in 2 days.", targetType: "TRANSPORT", targetId: "t1", stopId: "nbg" });
      const [g] = run({
        transports: [leg({ id: "t2", mode: "FLIGHT", fromStopId: null, depIsHome: true, toStopId: "nbg", ...toBook, bookBy: "2026-11-28" })],
        home: { name: "Sydney", lat: -33.9, lng: 151.2, countryCode: "AU" },
      });
      expect(g.message).toBe("Book the flight from Sydney to Nuremberg now: its book-by date (Sat 28 Nov) has passed.");
      expect(g.stopId).toBe("nbg");
    });

    it("only while To book: a stale book-by on a Booked row says nothing", () => {
      expect(run({ items: [item({ id: "i1", bookingState: "BOOKED", bookBy: "2026-11-28" })] })).toEqual([]);
      expect(run({ items: [item({ id: "i2", bookingState: "TO_BOOK", bookBy: null })] })).toEqual([]);
    });

    it("nothing to book once the thing itself has happened", () => {
      expect(run({ items: [item({ id: "i1", date: "2026-11-30", ...toBook, bookBy: "2026-11-25" })] })).toEqual([]);
      expect(run({ transports: [leg({ id: "t1", depAt: "2026-11-30T08:00:00Z", ...toBook, bookBy: "2026-11-25" })] })).toEqual([]);
    });

    it("detectFlags: needs today; skips Wishlist ideas, hidden Items and stays in hidden Stops; names rough Stops", () => {
      const base = { stops: [nbg, munich], tripStart: "2026-12-06", tripEnd: "2026-12-12" };
      const items = [
        item({ id: "idea", stopId: null, date: null, ...toBook, bookBy: "2026-11-28" }),
        item({ id: "gift", ...toBook, bookBy: "2026-11-28" }),
        item({ id: "pass", stopId: "nbg", date: null, title: "Tram pass", ...toBook, bookBy: "2026-12-03" }),
      ];
      const accommodations = [stay({ id: "a-secret", stopId: "munich", ...toBook, bookBy: "2026-11-28" })];
      const transports = [leg({ id: "t-rough", toStopId: "rough", ...toBook, bookBy: "2026-12-03" })];
      const bookIds = (flags: { id: string }[]) => flags.map((f) => f.id).filter((id) => id.startsWith("book-by-"));
      expect(bookIds(detectFlags({ ...base, items, accommodations, transports }))).toEqual([]); // no today
      const flags = detectFlags({
        ...base, items, accommodations, transports, today,
        hiddenItemIds: ["gift"], hiddenStopIds: ["munich"], stopNames: new Map([["nbg", "Nuremberg"], ["munich", "Munich"], ["rough", "Somewhere"]]),
      });
      expect(bookIds(flags)).toEqual(["book-by-soon-pass", "book-by-soon-t-rough"]);
      expect(flags.find((f) => f.id === "book-by-soon-t-rough")?.message).toBe("Book the train from Nuremberg to Somewhere by Thu 3 Dec, in 2 days.");
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/flags-planning.test.ts -t "flagBookByDates"`. It fails because the function is not exported and the booking fields are missing.
- [ ] **Step 3: Implement.**
  - Import: `import { activeBookBy } from "@/lib/booking-state";`.
  - Append `bookingState?: string | null; bookBy?: string | null;` to `FlagTransport` (:60-69), `FlagAccommodation` (:71-77) and `FlagItem`, with this doc line on each:

    ```ts
      /** CONTEXT.md "Booking state" (the stored, effective state) and its book-by date, "YYYY-MM-DD" (spec 2026-10-17 R2). */
    ```

  - `DetectFlagsInput`: append:

    ```ts
      /**
       * The Trip's own today (lib/trip-today.ts tripTodayISO), "YYYY-MM-DD". The
       * book-by and still-to-book Flags (spec 2026-10-17 R7) count from it;
       * omitted, they stay silent.
       */
      today?: string | null;
      /** Every Stop's name, rough ones included, so a leg to a rough Stop still names it. Omitted: the dated `stops`. */
      stopNames?: ReadonlyMap<string, string>;
    ```

  - Rule (after Rule 20):

    ```ts
    // ---------------------------------------------------------------------------
    // Rule 21: Book by soon (info) / Overdue (warning)
    //
    // An Item, leg or stay still To book with a book-by date: overdue once the
    // date has passed (Trip-local today), soon within BOOK_BY_SOON_DAYS.
    // Nothing once the thing itself has happened (its day is past).
    // ---------------------------------------------------------------------------

    export const BOOK_BY_SOON_DAYS = 7;

    export interface BookingContext {
      today: string;
      stops: FlagStop[];
      stopNames?: ReadonlyMap<string, string>;
      home?: HomeBase | null;
      homeTimezone?: string | null;
    }

    interface BookingSubjectRow {
      id: string;
      /** Named mid-sentence: an Item's title, a stay's name, "the train from Paris to Rome". */
      label: string;
      bookingState?: string | null;
      bookBy?: string | null;
      /** When it happens: an Item's day, a leg's local departure day, a check-in. */
      when: string | null;
      target: Pick<Flag, "targetType" | "targetId" | "date" | "stopId">;
    }

    const MODE_NOUN: Record<string, string> = { FLIGHT: "flight", TRAIN: "train", BUS: "bus", CAR: "drive", FERRY: "ferry", OTHER: "transport" };

    function legLabel(t: FlagTransport, names: ReadonlyMap<string, string>, home: HomeBase | null | undefined): string {
      const end = (isHome: boolean | null | undefined, stopId: string | null | undefined) =>
        isHome ? (home?.name ?? null) : stopId ? (names.get(stopId) ?? null) : null;
      const from = end(t.depIsHome, t.fromStopId);
      const to = end(t.arrIsHome, t.toStopId);
      return `the ${MODE_NOUN[t.mode] ?? "transport"}${from ? ` from ${from}` : ""}${to ? ` to ${to}` : ""}`;
    }

    /** A leg's departure day in its own zone: the Home base's for a Home end, else its Stop's (lib/desktop-home-loader.ts reads it the same way). */
    function legDepartureDay(t: FlagTransport, stopById: Map<string, FlagStop>, homeTimezone: string | null | undefined): string | null {
      const dep = toDate(t.depAt);
      if (!dep) return null;
      const from = t.fromStopId ? stopById.get(t.fromStopId) : undefined;
      const to = t.toStopId ? stopById.get(t.toStopId) : undefined;
      return instantToZonedDateISO(dep, (t.depIsHome && homeTimezone) || from?.timezone || to?.timezone || "UTC");
    }

    function bookingSubjects(
      items: FlagItem[],
      transports: FlagTransport[],
      accommodations: FlagAccommodation[],
      ctx: BookingContext,
    ): BookingSubjectRow[] {
      const stopById = new Map(ctx.stops.map((s) => [s.id, s]));
      const names = ctx.stopNames ?? new Map(ctx.stops.map((s) => [s.id, s.name]));
      return [
        ...items.map((i) => ({
          id: i.id, label: itemTitle(i) ?? "a thing to do", bookingState: i.bookingState, bookBy: i.bookBy,
          when: i.date ?? null, target: itemTarget(i),
        })),
        ...transports.map((t) => {
          const stopId = t.fromStopId ?? t.toStopId;
          return {
            id: t.id, label: legLabel(t, names, ctx.home), bookingState: t.bookingState, bookBy: t.bookBy,
            when: legDepartureDay(t, stopById, ctx.homeTimezone),
            target: { targetType: "TRANSPORT" as const, targetId: t.id, ...(stopId ? { stopId } : {}) },
          };
        }),
        ...accommodations.map((a) => ({
          id: a.id, label: a.name, bookingState: a.bookingState, bookBy: a.bookBy, when: a.checkIn,
          target: { targetType: "ACCOMMODATION" as const, targetId: a.id, stopId: a.stopId },
        })),
      ];
    }

    export function flagBookByDates(
      input: { items: FlagItem[]; transports: FlagTransport[]; accommodations: FlagAccommodation[] } & BookingContext,
    ): Flag[] {
      const flags: Flag[] = [];
      for (const s of bookingSubjects(input.items, input.transports, input.accommodations, input)) {
        const bookBy = activeBookBy(s.bookingState, s.bookBy);
        if (!bookBy) continue;
        if (s.when && s.when < input.today) continue; // it has happened: nothing left to book
        const day = formatDayLabel(bookBy);
        const n = daysBetween(input.today, bookBy);
        if (n < 0) {
          flags.push({ id: `book-by-overdue-${s.id}`, severity: "warning", message: `Book ${s.label} now: its book-by date (${day}) has passed.`, ...s.target });
        } else if (n <= BOOK_BY_SOON_DAYS) {
          const message =
            n === 0
              ? `Book ${s.label} today: it's the book-by date.`
              : `Book ${s.label} by ${n === 1 ? `tomorrow (${day})` : `${day}, in ${n} days`}.`;
          flags.push({ id: `book-by-soon-${s.id}`, severity: "info", message, ...s.target });
        }
      }
      return flags;
    }
    ```

  - `detectFlags`:
    - Destructure `today` and `stopNames`.
    - Append after the F.4 line:

      ```ts
          ...(today
            ? flagBookByDates({ items: planning.items, transports, accommodations: planning.accommodations, today, stops, stopNames, home, homeTimezone })
            : []),
      ```

    - Add `21. Book by soon (info) / Overdue (warning)` to the doc list.
- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run lib/flags-planning.test.ts lib/flags.test.ts`.
- [ ] **Step 5: Task-done check.**
  - `npx vitest related --run lib/flags.ts`
  - `npx tsc --noEmit`
  - `npx eslint lib/flags.ts lib/flags-planning.test.ts`
- [ ] **Step 6: Commit.**
  - Files: `lib/flags.ts`, `lib/flags-planning.test.ts`.
  - Message: `feat(flags): Book by soon and Overdue on Items, legs and stays (R7)`.

---

### Task F.6: Still to book close to the day (info)

**Files:**
- Modify: `lib/flags.ts` (new Rule 22; `detectFlags`)
- Test: `lib/flags-planning.test.ts` (append)

**Interfaces:**
- Consumes: `bookingSubjects`, `BookingContext` (F.5); `activeBookBy`.
- Produces:
  - `export const STILL_TO_BOOK_WITHIN_DAYS = 14`.
  - `export function flagStillToBookSoon(input: { transports: FlagTransport[]; accommodations: FlagAccommodation[] } & BookingContext): Flag[]`, with id `still-to-book-<id>`.

- [ ] **Step 1: Write the failing test.**
  - Append to `lib/flags-planning.test.ts`.
  - Add `flagStillToBookSoon` to the import.
  - Dates used: 2026-12-09 is a Wednesday, 2026-12-15 a Tuesday.

  ```ts
  describe("flagStillToBookSoon (Still to book close to the day, info)", () => {
    const today = "2026-12-01";
    const nbg = stop({ id: "nbg", name: "Nuremberg", arriveDate: "2026-12-06", departDate: "2026-12-09", sortOrder: 0 });
    const munich = stop({ id: "munich", name: "Munich", arriveDate: "2026-12-09", departDate: "2026-12-12", sortOrder: 1 });
    const leg = (o: Partial<FlagTransport> & { id: string }): FlagTransport => ({ mode: "TRAIN", fromStopId: "nbg", toStopId: "munich", arrAt: null, bookingState: "TO_BOOK", bookBy: null, depAt: null, ...o });
    const stay = (o: Partial<FlagAccommodation> & { id: string }): FlagAccommodation => ({ stopId: "nbg", name: "Hotel Victoria", checkIn: "2026-12-06", checkOut: "2026-12-09", bookingState: "TO_BOOK", bookBy: null, ...o });
    const run = (o: { transports?: FlagTransport[]; accommodations?: FlagAccommodation[] }) =>
      flagStillToBookSoon({ transports: [], accommodations: [], today, stops: [nbg, munich], ...o });

    it("a To book leg within 14 days, with no book-by date", () => {
      expect(run({ transports: [leg({ id: "t1", depAt: "2026-12-09T08:00:00Z" })] })).toEqual([
        { id: "still-to-book-t1", severity: "info", message: "The train from Nuremberg to Munich is still to book and leaves in 8 days (Wed 9 Dec).", targetType: "TRANSPORT", targetId: "t1", stopId: "nbg" },
      ]);
      expect(run({ transports: [leg({ id: "t1", depAt: "2026-12-15T08:00:00Z" })] })[0].message).toContain("in 14 days (Tue 15 Dec)");
      expect(run({ transports: [leg({ id: "t1", depAt: "2026-12-16T08:00:00Z" })] })).toEqual([]);
    });

    it("reads the leg's day in its own zone", () => {
      // 23:30Z on 1 Dec is 00:30 on 2 Dec in Nuremberg.
      expect(run({ transports: [leg({ id: "t1", depAt: "2026-12-01T23:30:00Z" })] })[0].message)
        .toBe("The train from Nuremberg to Munich is still to book and leaves tomorrow.");
    });

    it("a To book stay checking in within 14 days", () => {
      expect(run({ accommodations: [stay({ id: "a1", checkIn: "2026-12-01" })] })).toEqual([
        { id: "still-to-book-a1", severity: "info", message: "Hotel Victoria is still to book and you check in today.", targetType: "ACCOMMODATION", targetId: "a1", stopId: "nbg" },
      ]);
    });

    it("silent with a book-by date (Book by's job), when Booked, with no date, or once past", () => {
      expect(run({
        transports: [
          leg({ id: "a", depAt: "2026-12-05T08:00:00Z", bookBy: "2026-12-03" }),
          leg({ id: "b", depAt: "2026-12-05T08:00:00Z", bookingState: "BOOKED" }),
          leg({ id: "c", depAt: null }),
          leg({ id: "d", depAt: "2026-11-30T08:00:00Z" }),
        ],
        accommodations: [stay({ id: "e", checkIn: "2026-11-29" })],
      })).toEqual([]);
    });

    it("detectFlags: never an Item; never a stay inside a hidden Stop", () => {
      const flags = detectFlags({
        stops: [nbg, munich], tripStart: "2026-12-06", tripEnd: "2026-12-12", today, hiddenStopIds: ["munich"], transports: [],
        items: [item({ id: "i1", date: "2026-12-07", bookingState: "TO_BOOK" })],
        accommodations: [stay({ id: "a-nbg" }), stay({ id: "a-secret", stopId: "munich", checkIn: "2026-12-09", checkOut: "2026-12-12" })],
      });
      expect(flags.map((f) => f.id).filter((id) => id.startsWith("still-to-book-"))).toEqual(["still-to-book-a-nbg"]);
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/flags-planning.test.ts -t "flagStillToBookSoon"`. It fails because the function is not exported.
- [ ] **Step 3: Implement.** After Rule 21:

  ```ts
  // ---------------------------------------------------------------------------
  // Rule 22: Still to book close to the day (info)
  //
  // A leg or stay still To book with no book-by date (a dated one is Rule 21's)
  // whose own day (local departure, check-in) is within
  // STILL_TO_BOOK_WITHIN_DAYS of today. Items are not included (spec R7: "a To
  // book leg or stay"); a leg with no departure time stays silent (the
  // unbooked-transport nudge covers it).
  // ---------------------------------------------------------------------------

  export const STILL_TO_BOOK_WITHIN_DAYS = 14;

  const dayFromToday = (n: number, date: string) =>
    n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days (${formatDayLabel(date)})`;

  export function flagStillToBookSoon(
    input: { transports: FlagTransport[]; accommodations: FlagAccommodation[] } & BookingContext,
  ): Flag[] {
    const flags: Flag[] = [];
    for (const s of bookingSubjects([], input.transports, input.accommodations, input)) {
      if (s.bookingState !== "TO_BOOK" || activeBookBy(s.bookingState, s.bookBy) || !s.when) continue;
      const n = daysBetween(input.today, s.when);
      if (n < 0 || n > STILL_TO_BOOK_WITHIN_DAYS) continue;
      const when = dayFromToday(n, s.when);
      const message =
        s.target.targetType === "TRANSPORT"
          ? `${s.label.charAt(0).toUpperCase()}${s.label.slice(1)} is still to book and leaves ${when}.`
          : `${s.label} is still to book and you check in ${when}.`;
      flags.push({ id: `still-to-book-${s.id}`, severity: "info", message, ...s.target });
    }
    return flags;
  }
  ```

  - In `detectFlags`, append after the F.5 entry:

    ```ts
        ...(today
          ? flagStillToBookSoon({ transports, accommodations: planning.accommodations, today, stops, stopNames, home, homeTimezone })
          : []),
    ```

  - Add `22. Still to book close to the day (info)` to the doc list.
- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run lib/flags-planning.test.ts lib/flags.test.ts`.
- [ ] **Step 5: Task-done check.**
  - `npx vitest related --run lib/flags.ts`
  - `npx tsc --noEmit`
  - `npx eslint lib/flags.ts lib/flags-planning.test.ts`
- [ ] **Step 6: Commit.**
  - Files: `lib/flags.ts`, `lib/flags-planning.test.ts`.
  - Message: `feat(flags): Still to book close to the day (R7)`.

---

### Task F.7: flags-loader reads the new columns and today; Summary passes them

`flagsFromRows` gains a required `today`, and its only production caller is the Summary page. Both therefore change in one commit, or `tsc` breaks between them.

**Files:**
- Modify `lib/flags-loader.ts`:
  - imports :24-39
  - `FlagsAssemblyInput` :60-82
  - `flagsFromRows` :90-131
  - selects :165-193
  - `FlagRows` :195-203
  - `loadFlagRows` :215-268
  - `flagsForRows` :271-283
- Modify `app/(app)/trips/[tripId]/summary/page.tsx`: imports :18-22, flags call :252-262
- Test: `lib/flags-loader.test.ts`:
  - mocks :1-28
  - flagsFromRows calls :156, :184, :202, :280
  - `VISIBLE` fixture :249
- Test: `app/(app)/trips/[tripId]/summary/page.test.tsx` (mocks :25-76; new test in the Surprise describe :425)

**Interfaces:**
- Consumes:
  - `tripTodayISO(stops)` (`lib/trip-today.ts`)
  - `withOpeningHours(row)` (`lib/opening-hours-stored.ts`)
  - `DetectFlagsInput.today`, `.hiddenItemIds`, `.stopNames` (F.2, F.5)
- Produces:
  - `FlagsAssemblyInput.today: string` (required) and `FlagsAssemblyInput.hiddenItemIds?: readonly string[]`.
  - `FlagRows.today: string` and `FlagRows.hiddenItemIds: readonly string[]`.
  - `loadFlagRows` items carry `title`, `openingHours` (parsed), `slotTime`, `arriveByMinutes`, `bookingState`, `bookBy`. Transports and accommodations carry `bookingState` and `bookBy`.

- [ ] **Step 1: Write the failing tests.**
  - In `lib/flags-loader.test.ts`, add after the existing `vi.mock("@/lib/flags", …)` (:23-26):

    ```ts
    const tripTodayISO = vi.hoisted(() => vi.fn(() => "2026-01-01"));
    vi.mock("@/lib/trip-today", () => ({ tripTodayISO }));
    ```

  - Add `today: "2026-01-01",` to the three `flagsFromRows({ … })` calls at :156, :184 and :202.
  - In the :202 call, also add `hiddenItemIds: [],` next to its `hiddenStopIds: []`.
  - In the badge test (:280), add `today: "2026-01-01", hiddenItemIds: v.hiddenItemIds,`.
  - Replace the `VISIBLE` fixture (:249) with the row the new select returns:

    ```ts
    const VISIBLE = {
      id: "vis", stopId: "s1", title: "Lunch", category: "FOOD", date: "2026-01-03", startTime: "11:00", endTime: "13:00", lat: null, lng: null,
      openingHours: null, slotTime: null, arriveByMinutes: null, bookingState: "NONE", bookBy: null,
    };
    ```

  - Append a describe:

    ```ts
    describe("loadFlagRows / flagsFromRows: the planning Flags' ingredients (spec 2026-10-17 R7)", () => {
      const ROW_HOURS = JSON.stringify({ week: { tue: [] }, seasons: [], closed: [] });

      it("selects the Branch 1 columns the six Flags read", async () => {
        await loadFlagRows(TRIP_ID, "u1");
        expect(db.item.findMany.mock.calls[0][0].select).toEqual(expect.objectContaining({
          title: true, openingHours: true, slotTime: true, arriveByMinutes: true, bookingState: true, bookBy: true,
        }));
        expect(db.transport.findMany.mock.calls[0][0].select).toEqual(expect.objectContaining({ bookingState: true, bookBy: true }));
        expect(db.accommodation.findMany.mock.calls[0][0].select).toEqual(expect.objectContaining({ bookingState: true, bookBy: true }));
      });

      it("parses each Item's opening hours once, at the row edge", async () => {
        db.item.findMany.mockResolvedValue([{ id: "i1", stopId: "s1", title: "Museum", date: "2026-01-06", openingHours: ROW_HOURS }]);
        const rows = await loadFlagRows(TRIP_ID, "u1");
        expect(rows?.items[0].openingHours).toEqual({ week: { tue: [] }, seasons: [], closed: [] });
      });

      it("carries the Trip's own today (from its Stops) and the viewer's hidden Items", async () => {
        const stops = [{ id: "s1", name: "Rome", lat: null, lng: null, timezone: "Europe/Rome", arriveDate: "2026-01-02", departDate: "2026-01-05", sortOrder: 0, nights: null, pinned: false }];
        db.stop.findMany.mockResolvedValue(stops);
        loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ placeholders: [placeholderItem({ id: "hid" })] }));
        tripTodayISO.mockReturnValueOnce("2026-01-04");
        const rows = await loadFlagRows(TRIP_ID, "u1");
        expect(tripTodayISO).toHaveBeenCalledWith(stops);
        expect(rows?.today).toBe("2026-01-04");
        expect(rows?.hiddenItemIds).toEqual(["hid"]);
      });

      it("flagsFromRows hands today, the hidden Items and every Stop's name (rough included) to detectFlags, reading no clock", () => {
        flagsFromRows({
          trip: BASE_TRIP,
          allStops: [
            { id: "s1", name: "Rome", lat: null, lng: null, timezone: "Europe/Rome", arriveDate: "2026-01-02", departDate: "2026-01-05", sortOrder: 0 },
            { id: "s2", name: "Rough idea", lat: null, lng: null, timezone: null, arriveDate: null, departDate: null, sortOrder: 1 },
          ],
          transports: [], accommodations: [], items: [],
          tripStart: "2026-01-01", tripEnd: "2026-01-10", projection: { projectedEnd: null, hardEndDate: null, deadline: null },
          today: "2026-01-03", hiddenItemIds: ["hid"],
        });
        expect(tripTodayISO).not.toHaveBeenCalled();
        expect(detectFlags).toHaveBeenCalledWith(expect.objectContaining({
          today: "2026-01-03", hiddenItemIds: ["hid"], stopNames: new Map([["s1", "Rome"], ["s2", "Rough idea"]]),
        }));
      });

      it("flagsForRows passes the rows' today and hidden Items", async () => {
        loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ placeholders: [placeholderItem({ id: "hid" })] }));
        const rows = await loadFlagRows(TRIP_ID, "u1");
        detectFlags.mockClear();
        flagsForRows(rows!, { projectedEnd: null, hardEndDate: null, deadline: null });
        expect(detectFlags).toHaveBeenCalledWith(expect.objectContaining({ today: "2026-01-01", hiddenItemIds: ["hid"] }));
      });
    });
    ```

  - Rewrite the mocks in `app/(app)/trips/[tripId]/summary/page.test.tsx` (keep the assertions):
    - Add `vi.mock("@/lib/trip-today", () => ({ tripTodayISO: vi.fn(() => "2026-01-03") }));` next to the other mocks (after :59).
    - Append inside `describe("SummaryPage — Surprise …")`:

    ```tsx
      it("hands the Trip's today and the hidden Items to the Flags (spec 2026-10-17 R7)", async () => {
        readPlanMock.mockResolvedValue(
          rowsFrom({
            trip: trip(BASE_TRIP),
            stops: [DATED_STOP],
            visibility: hiddenVisibility({ viewerId: "u1", placeholders: [placeholderItem({ id: "hid", stopId: "s1", date: "2026-01-03" })] }),
          }),
        );

        render(await renderSummary());

        const { detectFlags } = await import("@/lib/flags");
        const { tripTodayISO } = await import("@/lib/trip-today");
        expect(vi.mocked(tripTodayISO)).toHaveBeenCalledWith([expect.objectContaining({ id: "s1" })]);
        expect(vi.mocked(detectFlags)).toHaveBeenCalledWith(expect.objectContaining({ today: "2026-01-03", hiddenItemIds: ["hid"] }));
      });
    ```

    (`rowsFrom`, `renderSummary`, `hiddenVisibility` and `placeholderItem` are already in the file; check `rowsFrom`'s parameter name for visibility at its definition and match it.)
- [ ] **Step 2: Run them, expect FAIL.**
  - Run `npx vitest run lib/flags-loader.test.ts "app/(app)/trips/[tripId]/summary/page.test.tsx"`.
  - The selects lack the new keys, `rows.today` and `rows.hiddenItemIds` are undefined, and `detectFlags` gets no `today`/`stopNames`.
  - `tsc` also rejects the `today` property on `FlagsAssemblyInput`.
- [ ] **Step 3: Implement.**
  - `lib/flags-loader.ts` imports: add

    ```ts
    import { tripTodayISO } from "@/lib/trip-today";
    import { withOpeningHours } from "@/lib/opening-hours-stored";
    ```

  - `FlagsAssemblyInput` (after `hiddenStopIds`, :81):

    ```ts
      /** Items hidden from the viewer by a Surprise (placeholders included): no planning Flag names them (spec 2026-10-17 R7). */
      hiddenItemIds?: readonly string[];
      /**
       * The Trip's own today (lib/trip-today.ts tripTodayISO): the book-by and
       * still-to-book Flags count from it. Required, so no caller can forget it
       * and silently drop those Flags (TB-01).
       */
      today: string;
    ```

  - `flagsFromRows`:
    - Add `hiddenItemIds, today` to the destructure (:99).
    - Add to the `detectFlags({ … })` call (after `hiddenStopIds`, :130):

      ```ts
          hiddenItemIds,
          today,
          stopNames: new Map(allStops.map((s) => [s.id, s.name])),
      ```

    - Extend the file doc comment's `flagsFromRows` bullet with ` It reads no clock: the caller passes the Trip's today.`
  - Selects:
    - `FLAG_TRANSPORT_SELECT` (:165-174) and `FLAG_ACCOMMODATION_SELECT` (:176-182): add `bookingState: true, bookBy: true,`.
    - `FLAG_ITEM_SELECT` (:184-193): add `title: true, openingHours: true, slotTime: true, arriveByMinutes: true, bookingState: true, bookBy: true,`.
  - `FlagRows` (:195-203): append:

    ```ts
      /** Items hidden from the viewer by a Surprise (lib/surprise-visibility.ts hiddenItemIds). */
      hiddenItemIds: readonly string[];
      /** The Trip's own today, from its real-plan Stops (lib/trip-today.ts). */
      today: string;
    ```

  - `loadFlagRows` return (:260-267):

    ```ts
      return {
        trip,
        allStops,
        transports: transports as FlagTransport[],
        accommodations: accommodations as FlagAccommodation[],
        // Opening hours are parsed once, here at the row edge (Branch 1 D.11).
        items: [...items.map(withOpeningHours), ...placeholders] as FlagItem[],
        hiddenStopIds: v.hiddenStopIds,
        hiddenItemIds: v.hiddenItemIds,
        today: tripTodayISO(allStops),
      };
    ```

    The placeholder mapping (:252-258) stays as it is: masked, with no planning fields.
  - `flagsForRows` (:271-283): add `hiddenItemIds: rows.hiddenItemIds, today: rows.today,`.
  - Summary page:
    - Add `import { tripTodayISO } from "@/lib/trip-today";` after :22.
    - In the `flagsFromRows({ … })` call (:252-262), add after `hiddenStopIds: v.hiddenStopIds,`:

      ```ts
          hiddenItemIds: v.hiddenItemIds,
          // The Trip's own today (every surface's, lib/trip-today.ts): the book-by Flags count from it.
          today: tripTodayISO(allStops),
      ```

    - `rows.items` already carries the parsed hours, slot and booking columns (`lib/plan-reads.ts` `PLAN_ITEM_SELECT` :99-126), so the `items as FlagItem[]` cast needs nothing more.
- [ ] **Step 4: Run them, expect PASS.**
  - Run `npx vitest run lib/flags-loader.test.ts "app/(app)/trips/[tripId]/summary/page.test.tsx" lib/nav-counts.test.ts lib/next-steps-loader.test.ts`.
  - (If `lib/nav-counts.test.ts` does not exist, drop it from the command.)
  - The badge-equals-Summary test still passes, with the new kinds in both counts.
- [ ] **Step 5: Task-done check.**
  - `npx vitest related --run lib/flags-loader.ts "app/(app)/trips/[tripId]/summary/page.tsx"`
  - `npx tsc --noEmit`
  - `npx eslint lib/flags-loader.ts lib/flags-loader.test.ts "app/(app)/trips/[tripId]/summary/page.tsx" "app/(app)/trips/[tripId]/summary/page.test.tsx"`
  - The integration test for this read is F.12.
- [ ] **Step 6: Commit.**
  - Files: `lib/flags-loader.ts`, `lib/flags-loader.test.ts`, `app/(app)/trips/[tripId]/summary/page.tsx`, `app/(app)/trips/[tripId]/summary/page.test.tsx`.
  - Message: `feat(flags): the Flag read carries hours, slots, booking state and the Trip's today`.

---

### Task F.8: Next steps get the planning Flags (builder, Home loader, featured-card loader)

**Files:**
- Modify: `lib/next-steps-builder.ts:28-60` (input), `:71-90` (the `detectFlags` call)
- Modify: `lib/desktop-home-loader.ts`:
  - imports :26-54
  - item select :192-206
  - `items` :236-245
  - `buildTripNextSteps` call :350-375
- Modify: `lib/next-steps-loader.ts:92-117`
- Test: `lib/next-steps-builder.test.ts` (append), `lib/next-steps-loader.test.ts` (append; `BASE_ROWS` :26-45 gains `hiddenItemIds` and `today`)

**Interfaces:**
- Consumes: `DetectFlagsInput.today`, `.hiddenItemIds`, `.stopNames` (F.2, F.5); `FlagRows.hiddenItemIds` (F.7); `withOpeningHours`.
- Produces: `BuildTripNextStepsInput.today: string` (required) and `BuildTripNextStepsInput.hiddenItemIds?: readonly string[]`.

- [ ] **Step 1: Write the failing tests.**
  - Append to `lib/next-steps-builder.test.ts` (and add `buildTripNextSteps` to its import from `./next-steps-builder`):

    ```ts
    describe("buildTripNextSteps: the planning Flags (spec 2026-10-17 R7)", () => {
      const base = {
        tripBasePath: "/trips/t", phase: "planning" as const, tripStart: "2026-12-06", tripEnd: "2026-12-12", roundTrip: false, home: null,
        datedStops: [{ id: "nbg", name: "Nuremberg", arriveDate: "2026-12-06", departDate: "2026-12-12", timezone: "Europe/Berlin", sortOrder: 0, lat: null, lng: null }],
        roughStopCount: 0, allStops: [{ id: "nbg", name: "Nuremberg" }], transports: [], accommodations: [],
        projectedEnd: null, hardEndDate: null, undatedChapterCount: 0, hasPackingList: true, hasPretripList: true, limit: Number.POSITIVE_INFINITY,
      };
      const closedTue = { week: { tue: [] }, seasons: [], closed: [] };
      const museum = { id: "i1", stopId: "nbg", date: "2026-12-08", title: "Memorium Nuremberg Trials", openingHours: closedTue };
      const pass = { id: "i2", stopId: "nbg", date: null, title: "Tram pass", bookingState: "TO_BOOK", bookBy: "2026-12-03" };

      it("a closed day and a booking due become ranked steps that open where they are fixed", () => {
        const steps = buildTripNextSteps({ ...base, items: [museum, pass], today: "2026-12-01" });
        expect(steps.find((s) => s.id === "item-closed-i1")).toMatchObject({ severity: "warning", source: "flag", href: "/trips/t/day/2026-12-08", title: "Memorium Nuremberg Trials is closed on Tuesdays." });
        expect(steps.find((s) => s.id === "book-by-soon-i2")).toMatchObject({ severity: "info", href: "/trips/t/plan?stop=nbg" });
      });

      it("nothing about an Item hidden from the viewer", () => {
        const steps = buildTripNextSteps({ ...base, items: [museum], today: "2026-12-01", hiddenItemIds: ["i1"] });
        expect(steps.map((s) => s.id)).not.toContain("item-closed-i1");
      });
    });
    ```

  - In `lib/next-steps-loader.test.ts`:
    - Add `hiddenItemIds: [] as readonly string[], today: "2026-06-01",` to `BASE_ROWS`.
    - Append:

    ```ts
    describe("loadNextSteps: the planning Flags (spec 2026-10-17 R7)", () => {
      it("counts book-by dates from the today it was given, and leaves out hidden Items", async () => {
        loadFlagRowsMock.mockResolvedValue({
          ...BASE_ROWS,
          items: [
            { id: "i-pass", stopId: "s1", date: null, title: "Museum pass", bookingState: "TO_BOOK", bookBy: "2026-06-03" },
            { id: "i-gift", stopId: "s1", date: null, title: "Surprise", bookingState: "TO_BOOK", bookBy: "2026-06-03" },
          ],
          hiddenItemIds: ["i-gift"],
        });
        const ids = (await loadNextSteps("trip-1", "2026-06-01", "u1")).map((s) => s.id);
        expect(ids).toContain("book-by-soon-i-pass");
        expect(ids).not.toContain("book-by-soon-i-gift");
      });
    });
    ```

    The loader's default `limit` is 4. If the step is cut by the cap in this fixture, assert with `buildNextSteps`' ranking in mind: an info Flag ranks after the packing/pretrip nudges. Set `db.checklistItem.count.mockResolvedValue(1)` in this test so those nudges stay away.
- [ ] **Step 2: Run them, expect FAIL.**
  - Run `npx vitest run lib/next-steps-builder.test.ts lib/next-steps-loader.test.ts`.
  - `today` and `hiddenItemIds` are not on `BuildTripNextStepsInput` (a tsc error), and no `book-by-*`/`item-closed-*` step is produced.
- [ ] **Step 3: Implement.**
  - `lib/next-steps-builder.ts`: append to `BuildTripNextStepsInput` (after `hiddenStopIds`, :55):

    ```ts
      /** Items hidden from the viewer by a Surprise (placeholders included): no planning Flag names them; omitted → none. */
      hiddenItemIds?: readonly string[];
      /** The Trip's own today (lib/trip-today.ts): the book-by and still-to-book Flags count from it (spec 2026-10-17 R7). */
      today: string;
    ```

    In the `detectFlags({ … })` call add after `hiddenStopIds: input.hiddenStopIds,`:

    ```ts
        hiddenItemIds: input.hiddenItemIds,
        today: input.today,
        stopNames: new Map(input.allStops.map((s) => [s.id, s.name])),
    ```

  - `lib/desktop-home-loader.ts`:
    - Import `import { withOpeningHours } from "@/lib/opening-hours-stored";`.
    - Item select (:194-205): add `openingHours: true, slotTime: true, arriveByMinutes: true,`. `title`, `bookingState` and `bookBy` are already selected.
    - `items` (:236-237): change `...itemRows,` to `...itemRows.map(withOpeningHours),`. `stillToBook` and `surprisesToReveal` keep reading `itemRows`.
    - `buildTripNextSteps({ … })` (:350-375): add after `hiddenStopIds: v.hiddenStopIds,`:

      ```ts
            hiddenItemIds: v.hiddenItemIds,
            today,
      ```

  - `lib/next-steps-loader.ts` (`buildTripNextSteps({ … })`, :92-117): add after `hiddenStopIds: rows.hiddenStopIds,`:

    ```ts
        hiddenItemIds: rows.hiddenItemIds,
        // The caller's today, the same one the phase gate above used.
        today,
    ```

- [ ] **Step 4: Run them, expect PASS.** Run `npx vitest run lib/next-steps-builder.test.ts lib/next-steps-loader.test.ts "app/(app)/trips/[tripId]/page.test.tsx" components/trip/home/phase-planning.test.tsx`.
- [ ] **Step 5: Task-done check.**
  - `npx vitest related --run lib/next-steps-builder.ts lib/next-steps-loader.ts lib/desktop-home-loader.ts`
  - `npx tsc --noEmit`
  - `npx eslint lib/next-steps-builder.ts lib/next-steps-builder.test.ts lib/next-steps-loader.ts lib/next-steps-loader.test.ts lib/desktop-home-loader.ts`
  - The Home loader's new read is covered by F.12's integration test.
- [ ] **Step 6: Commit.**
  - Files: the five above.
  - Message: `feat(next-steps): Home and the featured card rank the planning Flags`.

---

### Task F.9: `get_flags` names the Item an Item Flag is about

**Files:**
- Modify: `lib/mcp/tools/reads.ts:146-161` (`loadFlagsForMcp`), `:350` (the description)
- Test: `lib/mcp/tools/reads.test.ts:171-183` (existing reshape test: rewrite its expected rows), plus a new test after it

**Interfaces:**
- Consumes: `Flag.targetType === "ITEM"`, `Flag.targetId` (F.1).
- Produces: `get_flags` rows `{ severity, title, detail, stopId: string | null, itemId: string | null }`. `title` is `"item"` for an Item Flag.

- [ ] **Step 1: Write the failing test.**
  - In the existing test (:171), add `itemId: null` to both expected rows.
  - Then add:

  ```ts
    it("get_flags names the Item an item Flag is about, so Claude can open or fix it (spec 2026-10-17 R7)", async () => {
      loadFlags.mockResolvedValue([
        { id: "item-closed-i1", severity: "warning", message: "Memorium Nuremberg Trials is closed on Tuesdays.", targetType: "ITEM", targetId: "i1", date: "2026-12-08", stopId: "s1" },
        { id: "still-to-book-t1", severity: "info", message: "The train from Nuremberg to Munich is still to book and leaves in 8 days (Wed 9 Dec).", targetType: "TRANSPORT", targetId: "t1", stopId: "s1" },
      ]);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "get_flags", arguments: { tripId: TRIP_ID } });
      expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual([
        { severity: "warning", title: "item", detail: "Memorium Nuremberg Trials is closed on Tuesdays.", stopId: "s1", itemId: "i1" },
        { severity: "info", title: "transport", detail: "The train from Nuremberg to Munich is still to book and leaves in 8 days (Wed 9 Dec).", stopId: "s1", itemId: null },
      ]);
    });
  ```

- [ ] **Step 2: Run it, expect FAIL.** Run `npx vitest run lib/mcp/tools/reads.test.ts -t "get_flags"`. It fails because `itemId` is missing from the rows.
- [ ] **Step 3: Implement.** In `lib/mcp/tools/reads.ts`:

  ```ts
  /**
   * `loadFlags`'s `Flag[]` reshaped to the fields a Claude connection needs:
   * `title` is the flag's targetType (what kind of thing it's about: "stop",
   * "transport", "accommodation", "item", "day", or "trip"); `detail` is its
   * message; `itemId` names the Item an "item" Flag is about (spec 2026-10-17
   * R7), so Claude can read it with get_item or fix it with set_opening_hours.
   */
  async function loadFlagsForMcp(tripId: string) {
    const { user } = await requireTripAccess(tripId);
    const flags = await loadFlags(tripId, user.id);
    return flags.map((f) => ({
      severity: f.severity,
      title: f.targetType.toLowerCase(),
      detail: f.message,
      stopId: f.stopId ?? null,
      itemId: f.targetType === "ITEM" ? (f.targetId ?? null) : null,
    }));
  }
  ```

  Description (:350): `"Reads the trip's health flags: things worth a second look, such as a stop with no accommodation booked, a packed day, a thing to do on a day it is closed, a ticket you would be late for, or a booking due soon."`

  There is still no deep mode (R7, Out of scope). The `get_flags` input schema is unchanged.
- [ ] **Step 4: Run it, expect PASS.** Run `npx vitest run lib/mcp/tools/reads.test.ts`.
- [ ] **Step 5: Task-done check.**
  - `npx vitest related --run lib/mcp/tools/reads.ts`
  - `npx tsc --noEmit`
  - `npx eslint lib/mcp/tools/reads.ts lib/mcp/tools/reads.test.ts`
- [ ] **Step 6: Commit.**
  - Files: `lib/mcp/tools/reads.ts`, `lib/mcp/tools/reads.test.ts`.
  - Message: `feat(mcp): get_flags names the Item an item Flag is about`.

---

### Task F.10: Compare counts the planning Flags

**Files:**
- Modify `lib/compare.ts`:
  - imports :10-31
  - `CompareTransport` :51-59
  - `CompareAccommodation` :61-67
  - `CompareItem` :69-78
  - `PlanMetricsInput` :96-104
  - flag mappings :294-321
  - `detectFlags` call :352-375
- Modify `server/actions/forks.ts`: imports :3-19, `getComparison` :496-521
- Test: `lib/compare.test.ts` (append to `describe("flagCounts"` :343)
- Test: `server/actions/forks.test.ts` (mocks at the top; append inside `describe("getComparison"` :1135)

**Interfaces:**
- Consumes: the planning `FlagItem`/`FlagTransport`/`FlagAccommodation` fields and `DetectFlagsInput.today`/`.stopNames` (F.2–F.6); `tripTodayISO`.
- Produces:
  - `PlanMetricsInput.today?: string`.
  - `CompareItem` gains optional `title`, `openingHours`, `slotTime`, `arriveByMinutes`, `bookingState`, `bookBy`.
  - `CompareTransport` and `CompareAccommodation` gain optional `bookingState` and `bookBy`.

- [ ] **Step 1: Write the failing tests.**
  - Append inside `describe("flagCounts"` in `lib/compare.test.ts`:

    ```ts
      it("counts the planning Flags (spec 2026-10-17 R7), counting book-by dates from the given today", () => {
        const stops = [makeStop("nbg", { name: "Nuremberg", arriveDate: "2026-12-06", departDate: "2026-12-09", timezone: "Europe/Berlin" })];
        const closedTue = { week: { tue: [] }, seasons: [], closed: [] };
        const items = [
          { id: "i1", stopId: "nbg", date: "2026-12-08", startTime: null, endTime: null, lat: null, lng: null, category: "SIGHTSEEING", title: "Memorium", openingHours: closedTue },
        ];
        const accommodations = [{ id: "a1", stopId: "nbg", name: "Hotel Victoria", checkIn: "2026-12-06", checkOut: "2026-12-09", bookingState: "TO_BOOK", bookBy: "2026-11-28" }];
        vi.mocked(detectFlags).mockClear();
        computePlanMetrics({ ...emptyInput(), stops, items, accommodations, today: "2026-12-01" });
        expect(vi.mocked(detectFlags)).toHaveBeenCalledWith(expect.objectContaining({
          today: "2026-12-01",
          stopNames: new Map([["nbg", "Nuremberg"]]),
          items: [expect.objectContaining({ title: "Memorium", openingHours: closedTue })],
          accommodations: [expect.objectContaining({ bookingState: "TO_BOOK", bookBy: "2026-11-28" })],
        }));
        const ids = vi.mocked(detectFlags).mock.results[0].value.map((f: { id: string }) => f.id);
        expect(ids).toEqual(expect.arrayContaining(["item-closed-i1", "book-by-overdue-a1"]));
      });
    ```

  - In `server/actions/forks.test.ts`, add a module mock next to the other top-level mocks:

    ```ts
    const tripTodayISOMock = vi.hoisted(() => vi.fn(() => "2026-09-20"));
    vi.mock("@/lib/trip-today", () => ({ tripTodayISO: tripTodayISOMock }));
    ```

    Then append inside `describe("getComparison"`:

    ```ts
      it("measures every plan against the real plan's today (spec 2026-10-17 R7)", async () => {
        forkFindManyMock.mockResolvedValue([{ id: "fork-a", name: "Fork A" }]);
        stopsByPlan = { real: [{ id: "s-real", name: "Real", timezone: "Europe/Rome", arriveDate: "2026-10-01", departDate: "2026-10-04", sortOrder: 0, nights: null, pinned: false, country: null, lat: null, lng: null }] };
        await getComparison("trip-1");
        expect(tripTodayISOMock).toHaveBeenCalledWith([expect.objectContaining({ id: "s-real" })]);
        expect(computePlanMetricsMock).toHaveBeenCalledTimes(2);
        for (const call of computePlanMetricsMock.mock.calls) expect(call[0]).toEqual(expect.objectContaining({ today: "2026-09-20" }));
      });
    ```

- [ ] **Step 2: Run them, expect FAIL.**
  - Run `npx vitest run lib/compare.test.ts server/actions/forks.test.ts -t "planning Flags|real plan's today"`.
  - `PlanMetricsInput` has no `today` (tsc), `detectFlags` gets neither `today` nor the item fields, and `getComparison` never calls `tripTodayISO`.
- [ ] **Step 3: Implement.**
  - `lib/compare.ts`:
    - Import `import type { OpeningHours } from "@/lib/opening-hours";`.
    - Append `bookingState?: string | null; bookBy?: string | null;` to `CompareTransport` and `CompareAccommodation`.
    - Append to `CompareItem`:

      ```ts
        /** Spec 2026-10-17 R7: what the planning Flags read (Plan rows carry them; lib/plan-reads.ts). */
        title?: string | null;
        openingHours?: OpeningHours | null;
        slotTime?: string | null;
        arriveByMinutes?: number | null;
        bookingState?: string | null;
        bookBy?: string | null;
      ```

    - Append to `PlanMetricsInput`:

      ```ts
        /**
         * The Trip's own today, the real plan's (lib/trip-today.ts), for every
         * plan alike, so a Fork's book-by Flags count like the real plan's.
         * Omitted: those Flags stay silent.
         */
        today?: string;
      ```

    - Mappings:
      - `flagTransports` (:294-302): add `bookingState: t.bookingState ?? null, bookBy: t.bookBy ?? null,`.
      - `flagAccoms` (:304-310): add `bookingState: a.bookingState ?? null, bookBy: a.bookBy ?? null,`.
      - `flagItems` (:312-320): add `title: i.title ?? null, openingHours: i.openingHours ?? null, slotTime: i.slotTime ?? null, arriveByMinutes: i.arriveByMinutes ?? null, bookingState: i.bookingState ?? null, bookBy: i.bookBy ?? null,`.
    - `detectFlags({ … })` (:352-375): add after `homeLastStop,`:

      ```ts
            today: input.today,
            stopNames: new Map(stops.map((s) => [s.id, s.name])),
      ```

  - `server/actions/forks.ts`:
    - Add `import { tripTodayISO } from "@/lib/trip-today";` with the other lib imports (:3-19).
    - In `getComparison`, after `tripFields` (:494), add:

      ```ts
        // Spec 2026-10-17 R7: every plan's book-by Flags count from the Trip's own
        // today, the real plan's (planData[0]), so the columns compare like with like.
        const today = tripTodayISO(planData[0].stops);
      ```

    - Add `today,` to the `computePlanMetrics({ … })` call (:513-521).
    - `readPlan`'s rows already carry the parsed hours and booking columns, so no read changes.
- [ ] **Step 4: Run them, expect PASS.** Run `npx vitest run lib/compare.test.ts server/actions/forks.test.ts`.
- [ ] **Step 5: Task-done check.**
  - `npx vitest related --run lib/compare.ts server/actions/forks.ts`
  - `npx tsc --noEmit`
  - `npx eslint lib/compare.ts lib/compare.test.ts server/actions/forks.ts server/actions/forks.test.ts`
  - `getComparison` is already listed in `lib/server-action-exports.test.ts`. No new export.
- [ ] **Step 6: Commit.**
  - Files: the four above.
  - Message: `feat(compare): Compare counts the planning Flags in every column`.

---

### Task F.11: Demo data carries hours, slots and Booking state, and shows the new Flags

**Files:**
- Modify `lib/demo/types.ts`:
  - imports :1-5
  - `DemoTransport` :28-33
  - `DemoAccommodation` :34
  - `DemoItem` :35-40
  - adapters :66-81
  - `PlanFlagOpts` / `planFlagInput` :83-102
- Modify `prisma/demo/persist.ts`: imports :19-27, transport create :445-466, accommodation create :492-505, item create :544-562
- Modify `lib/demo/phase-trips.ts`: `buildFinalPrepTrip` items (:188-230)
- Test: `lib/demo/types.test.ts` (append), `lib/demo/phase-trips.test.ts` (append), `lib/demo/eu-trip.test.ts:36-39` (pin `today`)

**Interfaces:**
- Consumes: `bookingStateWrite`, `activeBookBy`, `type BookingSubject` (`lib/booking-state.ts`); `type BookingState` (`lib/enum-values.ts`); `type OpeningHours`; `serializeOpeningHours` (`lib/validations/opening-hours.ts`, persister only).
- Produces:
  - `demoBookingColumns(subject: BookingSubject, row: { bookingState?: BookingState; bookBy?: string | null }, reference: string | null | undefined): { bookingState: BookingState; bookingStateSet: boolean; bookBy: string | null }`.
  - `PlanFlagOpts.today?: string`.

- [ ] **Step 1: Write the failing tests.**
  - Append to `lib/demo/types.test.ts` (and import `demoBookingColumns`):

    ```ts
    describe("demoBookingColumns (CONTEXT.md Booking state; spec 2026-10-17 R2)", () => {
      it("derives the state from the reference, as every writer stores it", () => {
        expect(demoBookingColumns("TRANSPORT", {}, "Blue Mountains Line")).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
        expect(demoBookingColumns("TRANSPORT", {}, null)).toEqual({ bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });
        expect(demoBookingColumns("ACCOMMODATION", {}, "HM-44821")).toEqual({ bookingState: "BOOKED", bookingStateSet: false, bookBy: null });
        expect(demoBookingColumns("ITEM", {}, null)).toEqual({ bookingState: "NONE", bookingStateSet: false, bookBy: null });
      });
      it("a chosen state wins, and keeps its book-by date only while To book", () => {
        expect(demoBookingColumns("ITEM", { bookingState: "TO_BOOK", bookBy: "2026-07-20" }, null)).toEqual({ bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2026-07-20" });
        expect(demoBookingColumns("ITEM", { bookingState: "BOOKED", bookBy: "2026-07-20" }, null)).toEqual({ bookingState: "BOOKED", bookingStateSet: true, bookBy: null });
      });
    });
    ```

  - Append to `lib/demo/phase-trips.test.ts`:

    ```ts
      it("final-prep trip shows the planning Flags a Traveller would see (spec 2026-10-17 R7)", () => {
        const t = buildFinalPrepTrip(today);
        const ids = detectFlags(planFlagInput(t, { tripStart: t.startDate!, tripEnd: t.endDate!, today })).map((f) => f.id);
        // A dinner still to book, due tomorrow.
        expect(ids).toContain("book-by-soon-fp:item:darleys");
        // Its trains and hotel carry references, so they read Booked: nothing still to book.
        expect(ids.filter((id) => id.startsWith("still-to-book-"))).toEqual([]);
        // Scenic World's hours fit its visit.
        expect(ids.filter((id) => /^item-(closed|before-open|after-close|late-slot)-/.test(id))).toEqual([]);
      });
    ```

  - In `lib/demo/eu-trip.test.ts:37`, add `today: "2026-11-30"` to the `planFlagInput` options. The EU real plan must stay warning-free a week before departure; info Flags such as Still to book are allowed.
- [ ] **Step 2: Run them, expect FAIL.**
  - Run `npx vitest run lib/demo/types.test.ts lib/demo/phase-trips.test.ts lib/demo/eu-trip.test.ts`.
  - `demoBookingColumns` is not exported, `PlanFlagOpts` has no `today` (tsc), and there is no Darleys item.
- [ ] **Step 3: Implement.**
  - `lib/demo/types.ts` imports:

    ```ts
    import { activeBookBy, bookingStateWrite, type BookingSubject } from "@/lib/booking-state";
    import type { BookingState } from "@/lib/enum-values";
    import type { OpeningHours } from "@/lib/opening-hours";
    ```

  - Interfaces:
    - Append `bookingState?: BookingState; bookBy?: string | null;` to `DemoTransport` (inside its braces, after `cost?`) and to `DemoAccommodation`.
    - Append to `DemoItem`: `bookingState?: BookingState; bookBy?: string | null; openingHours?: OpeningHours | null; slotTime?: string | null; arriveByMinutes?: number | null;`.
  - New helper (above `// --- Adapters to the pure engines`):

    ```ts
    /**
     * A seeded row's Booking state columns (CONTEXT.md, spec 2026-10-17 R2):
     * the data's chosen state when it names one, else derived from its
     * reference, through the same rule every writer stores
     * (lib/booking-state.ts bookingStateWrite). The book-by date survives only
     * while To book (activeBookBy). The persister writes this; the Flag
     * adapters read it, so the seeded app and these tests agree.
     */
    export function demoBookingColumns(
      subject: BookingSubject,
      row: { bookingState?: BookingState; bookBy?: string | null },
      reference: string | null | undefined,
    ): { bookingState: BookingState; bookingStateSet: boolean; bookBy: string | null } {
      const cols = bookingStateWrite(subject, null, row.bookingState, reference);
      return { ...cols, bookBy: activeBookBy(cols.bookingState, row.bookBy) };
    }
    ```

  - Adapters:

    ```ts
    function toFlagTransport(t: DemoTransport): FlagTransport {
      const b = demoBookingColumns("TRANSPORT", t, t.reference);
      return { id: t.key, fromStopId: t.fromStopKey ?? null, toStopId: t.toStopKey ?? null, depAt: t.depAt ?? null, arrAt: t.arrAt ?? null, mode: t.mode, depIsHome: t.depIsHome ?? false, arrIsHome: t.arrIsHome ?? false, bookingState: b.bookingState, bookBy: b.bookBy };
    }
    function toFlagItem(i: DemoItem): FlagItem {
      const b = demoBookingColumns("ITEM", i, i.booking);
      return {
        id: i.key, stopId: i.stopKey ?? null, date: i.date ?? null, startTime: i.startTime ?? null, endTime: i.endTime ?? null, lat: i.lat ?? null, lng: i.lng ?? null,
        title: i.title, openingHours: i.openingHours ?? null, slotTime: i.slotTime ?? null, arriveByMinutes: i.arriveByMinutes ?? null, bookingState: b.bookingState, bookBy: b.bookBy,
      };
    }
    function toFlagAccommodation(a: DemoAccommodation): FlagAccommodation {
      const b = demoBookingColumns("ACCOMMODATION", a, a.confirmation);
      return { id: a.key, stopId: a.stopKey, checkIn: a.checkIn, checkOut: a.checkOut, name: a.name, bookingState: b.bookingState, bookBy: b.bookBy };
    }
    ```

  - `PlanFlagOpts`: add `today?: string;`.
  - `planFlagInput`'s return: add `today: opts.today ?? null, stopNames: new Map(plan.stops.map((s) => [s.key, s.name])),`.
  - `prisma/demo/persist.ts`:
    - Change the types import (:24) to also take `demoBookingColumns`.
    - Add `import { serializeOpeningHours } from "@/lib/validations/opening-hours";`.
    - Transport `data` (:446-465): add `...demoBookingColumns("TRANSPORT", t, t.reference),` after `reference: t.reference ?? null,`.
    - Accommodation `data` (:493-504): add `...demoBookingColumns("ACCOMMODATION", a, a.confirmation),` after `confirmation`.
    - Item `data` (:545-561): add after `booking: it.booking ?? null,`:

      ```ts
                ...demoBookingColumns("ITEM", it, it.booking),
                slotTime: it.slotTime ?? null,
                arriveByMinutes: it.arriveByMinutes ?? null,
                openingHours: serializeOpeningHours(it.openingHours),
      ```

  - `lib/demo/phase-trips.ts` `buildFinalPrepTrip`:
    - Give Scenic World (`fp:item:scenic-world`) hours that fit its 13:00–16:00 visit:

      ```ts
            openingHours: {
              week: { sun: [["09:00", "17:00"]], mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], wed: [["09:00", "17:00"]], thu: [["09:00", "17:00"]], fri: [["09:00", "17:00"]], sat: [["09:00", "17:00"]] },
              seasons: [],
              closed: [],
            },
      ```

    - Append a fourth item after the Grand Canyon walk:

      ```ts
          {
            key: "fp:item:darleys",
            title: "Dinner at Darleys",
            category: "FOOD",
            stopKey: "fp:stop:katoomba",
            date: d.finalPrep.start,
            startTime: "19:00",
            endTime: "21:00",
            lat: -33.7316,
            lng: 150.3122,
            notes: "Hatted restaurant at Lilianfels. Book ahead.",
            bookingState: "TO_BOOK",
            bookBy: addDays(today, 1),
            sortOrder: 3,
          },
      ```

- [ ] **Step 4: Run them, expect PASS.** Run `npx vitest run lib/demo prisma/demo/persist.test.ts test/copy-style.test.ts`.
- [ ] **Step 5: Task-done check.**
  - `npx vitest related --run lib/demo/types.ts lib/demo/phase-trips.ts prisma/demo/persist.ts`
  - `npx tsc --noEmit`
  - `npx eslint lib/demo/types.ts lib/demo/types.test.ts lib/demo/phase-trips.ts lib/demo/phase-trips.test.ts lib/demo/eu-trip.test.ts prisma/demo/persist.ts`
- [ ] **Step 6: Commit.**
  - Files: the seven above.
  - Message: `feat(demo): seeded Booking state, hours and a dinner to book show the new Flags`.

---

### Task F.12: Integration test: the Flag read and Home's Next steps on real Postgres

**Files:**
- Create: `test/integration/flags-planning.test.ts`

**Interfaces:**
- Consumes: `loadFlagRows`, `flagsForRows` (F.7); `loadHomePlanningData`, `HomeTripInput` (`lib/desktop-home-loader.ts`, F.8); `serializeOpeningHours`; `todayISOInZone` (`lib/tz.ts`); `addDays` (`lib/dates.ts`).
- Produces: nothing for other tasks.

- [ ] **Step 1: Write the test.**

  ```ts
  import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
  import { db } from "@/lib/db";
  import { loadFlagRows, flagsForRows } from "@/lib/flags-loader";
  import { loadHomePlanningData, type HomeTripInput } from "@/lib/desktop-home-loader";
  import { serializeOpeningHours } from "@/lib/validations/opening-hours";
  import { addDays } from "@/lib/dates";
  import { todayISOInZone } from "@/lib/tz";

  // Real Postgres (spec 2026-10-17 R7): the six planning Flags come out of the
  // one Flag read on the real plan only, Surprise-aware, never for a Wishlist
  // idea or a Fork's row, and Home's Next steps carry the same Flags.
  // Dates are relative to the Trip's real today (lib/trip-today.ts reads the
  // clock in the current Stop's zone), so the book-by windows hold whenever
  // this runs.
  const OWNER = "it-fp-owner";
  const MEMBER = "it-fp-member";
  const TRIP_ID = "it-fp-trip";
  const FORK_ID = "it-fp-fork";
  const TZ = "Europe/Lisbon";
  const forMember = JSON.stringify([MEMBER]);
  const today = todayISOInZone(TZ);
  const D = (n: number) => addDays(today, n);
  const PROJECTION = { projectedEnd: null, hardEndDate: null, deadline: null };
  type Spans = [string, string][];
  const everyDay = (spans: Spans) => ({ sun: spans, mon: spans, tue: spans, wed: spans, thu: spans, fri: spans, sat: spans });
  const open10to6 = serializeOpeningHours({ week: everyDay([["10:00", "18:00"]]), seasons: [], closed: [] });
  const closedOn = (date: string) => serializeOpeningHours({ week: {}, seasons: [], closed: [date] });
  const TRIP: HomeTripInput = {
    id: TRIP_ID, startDate: D(3), endDate: D(10), homeCurrency: "EUR", drivingWindingFactor: 1.3, drivingAvgSpeedKph: 80,
    homeName: null, homeLat: null, homeLng: null, homeCountryCode: null, homeTimezone: null, roundTrip: false, chaptersEnabled: false,
  };

  async function flagIds(viewer: string) {
    const rows = await loadFlagRows(TRIP_ID, viewer);
    return flagsForRows(rows!, PROJECTION);
  }

  describe.skipIf(process.env.INTEGRATION !== "1")("planning Flags (real Postgres)", () => {
    beforeAll(async () => {
      for (const id of [OWNER, MEMBER]) await db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@example.test`, name: id } });
    });

    beforeEach(async () => {
      await db.trip.deleteMany({ where: { id: TRIP_ID } });
      await db.trip.create({
        data: { id: TRIP_ID, name: "IT Planning flags", homeCurrency: "EUR", createdById: OWNER, forksEnabled: true, startDate: D(3), endDate: D(10), roundTrip: false,
          members: { create: [{ userId: OWNER, role: "owner" }, { userId: MEMBER, role: "member" }] } },
      });
      await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT B", createdById: OWNER } });
      await db.stop.createMany({ data: [
        { id: "it-fp-porto", tripId: TRIP_ID, name: "IT Porto", timezone: TZ, arriveDate: D(3), departDate: D(6), nights: 3, sortOrder: 0 },
        { id: "it-fp-secret", tripId: TRIP_ID, name: "IT Secret", timezone: TZ, arriveDate: D(6), departDate: D(10), nights: 4, sortOrder: 1, surprisePlannerId: OWNER, surpriseForIds: forMember },
        { id: "it-fp-fork-stop", tripId: TRIP_ID, forkId: FORK_ID, name: "IT Fork stop", timezone: TZ, arriveDate: D(3), departDate: D(6), nights: 3, sortOrder: 0 },
      ] });
      await db.transport.create({ data: {
        id: "it-fp-leg", tripId: TRIP_ID, mode: "TRAIN", fromStopId: "it-fp-porto", toStopId: "it-fp-secret", depAt: new Date(`${D(6)}T08:00:00Z`), sortOrder: 0,
        bookingState: "TO_BOOK", bookingStateSet: false,
      } });
      await db.accommodation.createMany({ data: [
        { id: "it-fp-casa", tripId: TRIP_ID, stopId: "it-fp-porto", name: "IT Casa", checkIn: D(3), checkOut: D(6), bookingState: "TO_BOOK", bookingStateSet: true, bookBy: D(-2) },
        { id: "it-fp-hidden-stay", tripId: TRIP_ID, stopId: "it-fp-secret", name: "IT Secret hotel", checkIn: D(6), checkOut: D(10), bookingState: "TO_BOOK", bookingStateSet: false },
      ] });
      await db.item.createMany({ data: [
        { id: "it-fp-closed", tripId: TRIP_ID, stopId: "it-fp-porto", title: "IT Closed museum", category: "SIGHTSEEING", date: D(4), sortOrder: 0, openingHours: closedOn(D(4)) },
        { id: "it-fp-early", tripId: TRIP_ID, stopId: "it-fp-porto", title: "IT Gallery", category: "SIGHTSEEING", date: D(4), startTime: "09:30", endTime: "10:30", sortOrder: 1, openingHours: open10to6 },
        { id: "it-fp-late", tripId: TRIP_ID, stopId: "it-fp-porto", title: "IT Palace", category: "SIGHTSEEING", date: D(5), startTime: "17:00", endTime: "18:30", sortOrder: 2, openingHours: open10to6 },
        { id: "it-fp-slot", tripId: TRIP_ID, stopId: "it-fp-porto", title: "IT Tour", category: "ACTIVITY", date: D(5), startTime: "11:50", slotTime: "12:00", arriveByMinutes: 15, sortOrder: 3 },
        { id: "it-fp-gift", tripId: TRIP_ID, stopId: "it-fp-porto", title: "IT Gift", category: "FOOD", date: D(5), sortOrder: 4, openingHours: closedOn(D(5)), surprisePlannerId: OWNER, surpriseForIds: forMember },
        { id: "it-fp-pass", tripId: TRIP_ID, stopId: "it-fp-porto", title: "IT Tram pass", category: "GETTING_AROUND", sortOrder: 5, bookingState: "TO_BOOK", bookingStateSet: true, bookBy: D(2) },
        { id: "it-fp-idea", tripId: TRIP_ID, title: "IT Idea", category: "FOOD", sortOrder: 6, bookingState: "TO_BOOK", bookingStateSet: true, bookBy: D(-1) },
        { id: "it-fp-fork-item", tripId: TRIP_ID, forkId: FORK_ID, stopId: "it-fp-fork-stop", title: "IT Fork museum", category: "SIGHTSEEING", date: D(4), sortOrder: 0, openingHours: closedOn(D(4)) },
      ] });
    });

    afterAll(async () => {
      await db.trip.deleteMany({ where: { id: TRIP_ID } });
    });

    it("the planner sees all six kinds on the real plan, worded for them", async () => {
      const flags = await flagIds(OWNER);
      const ids = flags.map((f) => f.id);
      expect(ids).toEqual(expect.arrayContaining([
        "item-closed-it-fp-closed",
        "item-before-open-it-fp-early",
        "item-after-close-it-fp-late",
        "item-late-slot-it-fp-slot",
        "item-closed-it-fp-gift",
        "book-by-soon-it-fp-pass",
        "book-by-overdue-it-fp-casa",
        "still-to-book-it-fp-leg",
        "still-to-book-it-fp-hidden-stay",
      ]));
      expect(flags.find((f) => f.id === "item-before-open-it-fp-early")?.message).toBe("IT Gallery opens at 10:00; this starts 09:30.");
      expect(flags.find((f) => f.id === "still-to-book-it-fp-leg")?.message).toMatch(/^The train from IT Porto to IT Secret is still to book and leaves in 6 days/);
      expect(flags.find((f) => f.id === "item-closed-it-fp-closed")).toMatchObject({ targetType: "ITEM", targetId: "it-fp-closed", date: D(4), stopId: "it-fp-porto" });
    });

    it("never a Wishlist idea or a Fork's row", async () => {
      const ids = (await flagIds(OWNER)).map((f) => f.id);
      expect(ids.filter((id) => id.includes("it-fp-idea") || id.includes("it-fp-fork-item"))).toEqual([]);
    });

    it("the Traveller a Surprise is for gets nothing about what's inside it; the leg into it still flags", async () => {
      const ids = (await flagIds(MEMBER)).map((f) => f.id);
      expect(ids).not.toContain("item-closed-it-fp-gift");
      expect(ids).not.toContain("still-to-book-it-fp-hidden-stay");
      expect(ids).toEqual(expect.arrayContaining(["item-closed-it-fp-closed", "book-by-overdue-it-fp-casa", "still-to-book-it-fp-leg"]));
    });

    it("Home's Next steps carry the same Flags, linked to where they are fixed", async () => {
      const { steps } = await loadHomePlanningData(TRIP_ID, today, "planning", TRIP, OWNER);
      const ids = steps.map((s) => s.id);
      expect(ids).toEqual(expect.arrayContaining(["item-closed-it-fp-closed", "book-by-overdue-it-fp-casa", "item-late-slot-it-fp-slot"]));
      expect(steps.find((s) => s.id === "item-closed-it-fp-closed")?.href).toContain(`/day/${D(4)}`);
      const member = await loadHomePlanningData(TRIP_ID, today, "planning", TRIP, MEMBER);
      expect(member.steps.map((s) => s.id)).not.toContain("item-closed-it-fp-gift");
    });
  });
  ```

  - `loadHomePlanningData` is wrapped in React `cache()`. Outside a request it does not memoise across calls, which is the same as `test/integration/still-to-book.test.ts`, so the OWNER and MEMBER calls are independent.
  - If Section S's migration has added `Item.tryList`, it is nullable and these creates leave it null.
- [ ] **Step 2: Run it against the sandbox Postgres.**
  - Run `INTEGRATION=1 npm run test:integration -- test/integration/flags-planning.test.ts` (with the throwaway local DB up and migrated, per the sandbox recipe).
  - Every test should pass first time, because F.7 and F.8 already built the behaviour. It is an end-to-end pin, not red/green.
  - If one fails, that is a real bug in F.2–F.8: fix it test-first there, not here.
- [ ] **Step 3: Implement.** No production change expected (see Step 2).
- [ ] **Step 4: Run it, expect PASS.** Same command as Step 2.
- [ ] **Step 5: Task-done check.**
  - `npx tsc --noEmit`
  - `npx eslint test/integration/flags-planning.test.ts`
  - `npm run test:integration -- test/integration/flags-planning.test.ts`
- [ ] **Step 6: Commit.**
  - Files: `test/integration/flags-planning.test.ts`.
  - Message: `test(flags): integration test for the planning Flags read and Home's Next steps`.

---

## Section T — Try list behaviour (R6)

### Notes

**What T builds, in one paragraph.** A Try list is a JSON column on `Item` (S). T makes it writable (`createItem`/`updateItem` under PATCH, a narrow `setTryList`, and an atomic `tickTryEntry`), all of which write the Item family in one transaction that locks the family's rows. T makes it readable everywhere an Item reaches the Day view, Today, the plan editor, the Wishlist board, the Item dialog and Claude. It gives the Item dialog an editor, the Day view and both Today views a tickable list (optimistic, rolled back on failure), the Timeline a "2/5 tried" count, and Claude `set_try_list` / `tick_try_entry`.

**Assumed from Section S (exact names; the assembler reconciles if S differs):**
- `prisma/schema.prisma` `model Item`: `tryList String?` (JSON text, no default). Every select below names it `tryList`.
- `lib/try-list.ts` (zod-free):
  - `export interface TryEntry { id: string; text: string; tried: boolean }`
  - `export type TryList = TryEntry[]`
  - `export const MAX_TRY_ENTRIES = 30`
  - `export const MAX_TRY_TEXT = 80`
  - `export function newTryEntryId(): string`. T calls it only on the server, and T's pure module takes the id generator as a parameter, so it does not matter whether S's helper is client-safe.
- `lib/validations/try-list.ts`:
  - `tryListSchema` (output `TryList`; ids unique; 1–80 trimmed text; at most 30)
  - `parseTryList(raw: string | null | undefined): TryList | null` (null for none, `"[]"` or an unreadable value)
  - `serializeTryList(list: TryList | null | undefined): string | null` (an empty list is `null`)
- The Item family (decision 2):
  - `itemFamilyRoot(item)` and `itemFamilyWhere(tripId, rootId)` in `lib/item-family.ts`.
  - `itemFamilyRecipients(client, item: { id: string; tripId: string; sourceItemId: string | null }): Promise<string[]>`, where `client` is `Prisma.TransactionClient | typeof db`. It is the renamed `openingHoursFamilyRecipients` (today `server/actions/items.ts:570-584`) and keeps that function's Surprise rule. T assumes it stays a **private helper inside `server/actions/items.ts`**, because a `"use server"` file can export only allowlisted async actions. If S moved it to a lib module, import it from there instead; nothing else in T changes.
  - S's refactor of `updateItem`'s family block (today `server/actions/items.ts:434-488`) keeps the shape shown in T.3 Step 3: compute recipients, then one `$transaction` that updates the row plus `updateMany` the recipients, then `recordUpdate` after commit. If S moved the recipients read inside the transaction, keep it there. T.3 only adds the Try list's locked merge to that block.
- Copies and masking: `ideaCopyData` copies `tryList`; a Fork copies it with ticks; Duplicate resets ticks. `PlaceholderItem` (`lib/surprise-visibility.ts`) carries `tryList: null`, and so does `test/helpers/surprise-visibility.ts`.
- `test/builders/index.ts`'s item builder carries `tryList: null`. If S didn't add it, T.6 adds it (one line beside `openingHours: null`, line 111, plus the type at line 52).
- The fake `tx` in `server/actions/items.test.ts` (lines 58-77) has `item.findMany`, because `itemFamilyRecipients(tx, …)` runs on it. If S didn't add it, T.3 does: `findMany: itemFindManyMock`.

**Produces (for other sections and the assembler):**
- `lib/try-list-ops.ts` (pure, zod-free, client-safe):
  - `TryEntryInput = { id?: string; text: string; tried?: boolean }`
  - `resolveTryList(current, input, newId): TryList | null`
  - `tickEntry(list, entryId, tried): TryList | null`
  - `triedCount(list): { tried: number; total: number }`
  - `triedLabel(list): string | null` ("2/5 tried")
  - `tryListSummary(list): string`
  - `sameTryEntries(a, b): boolean`
- `lib/validations/try-list.ts` gains `tryListInputSchema` and `type TryListInput`. `itemSchema` gains `tryList?: TryEntryInput[]`, so `ItemInput` and `Patch<ItemInput>` do too.
- `lib/try-list-stored.ts`: `withTryList(row)`.
- `server/actions/items.ts`:
  - `setTryList(itemId: string, entries: TryEntryInput[] | null): Promise<ItemActionResult>`
  - `tickTryEntry(itemId: string, entryId: string, tried: boolean): Promise<ItemActionResult>`
  - `createItem` / `updateItem` accept `tryList`.
- `tryList?: TryList | null` on `ItineraryItem`, `StopDayItem`, `ItemCardItem` and `ThingToDo`. `tryList: TryList | null` on `DayRows["items"]`, `PlanRows["items"]`, `McpThingToDo` and `McpDayItem`, and so on `McpItem`.
- Components:
  - `components/trip/try-list-editor.tsx`: `TryListEditor`, `draftFromTryList`, `tryListPayload`, `TryListDraftEntry`
  - `components/trip/try-list-ticks.tsx`: `TryListTicks`
- MCP tools:
  - `set_try_list({ itemId, entries })` returns `{ item }`
  - `tick_try_entry({ itemId, entryId, tried? })` returns `{ item }`

**Decisions where the spec and the controller decisions are silent:**
1. **Ticks are not Activity; list edits are.** The checklist precedent splits (ADR 0012 amendment 2026-10-11): Pre-trip ticks are recorded, Packing and Shopping ticks are not, because "every recorded Activity notifies the partner, and the feed has no grouping". A Try list is ticked off on the day, as you go, often many in a row ("Drei im Weggla, Feuerzangenbowle, Lebkuchen"). That is the Packing/Shopping case, so a tick records nothing. The tick itself is the shared signal: both Travellers see it. Adding, removing, renaming or reordering entries records one UPDATED line on the edited Item: "Try list: Lebkuchen, Drei im Weggla → Lebkuchen, Drei im Weggla, Schäufele". A tick-only change made through `set_try_list` (`tried` given, texts unchanged) compares equal (`sameTryEntries`) and records nothing.
2. **One input shape for the dialog and Claude: `{ id?, text, tried? }`.** The server merges it onto the list it reads **under the row lock** (`resolveTryList`). An entry with a known id keeps that id, and keeps its tick unless `tried` is given. The dialog never sends `tried`. So a Traveller who opened the dialog before their partner ticked "Lebkuchen" on Today does not untick it by saving a rename.
3. **An unknown id is a new entry, with a fresh server id.** This is what a stale dialog sends after the partner removed that entry, and the friendliest result is that the rename comes back as an entry. **A repeated id is refused** ("Each entry can appear only once"). Duplicate *texts* are allowed.
4. **The lock covers the whole family**, in id order (`SELECT … FOR UPDATE`, the `reorderChecklistItem` pattern). Ticks on two rows of one family (the idea on the Wishlist and its copy on Today) are then serialised, and neither is lost. An edited row that is itself a Surprise has no recipients, so it locks only itself.
5. **A tick on an entry that is gone** is refused on `tryList` with "That one is no longer on the list." A tick to the state the entry is already in (a double tap) is a success with no write.
6. **Where it shows.**
   - The Timeline shows "2/5 tried" on any row whose Item carries a Try list.
   - The list becomes tickable only in the Timeline's `variant="day"`, which is the Day page and both Today cards (`components/trip/home/phase-travelling.tsx:174,388`). There the count moves into the list's own heading, so it follows the optimistic ticks.
   - The calendar agenda, Print and the Share page read no `tryList`, so they show nothing. This follows the opening-hours precedent (Branch 1 D, decision 2): a Share link never shows it.
   - It never touches the Checklists page or `ChecklistItem`: no task is needed for "Not a Checklist".
7. **The dialog editor does not tick.** It edits the entries (add, rename, remove, move up/down) and marks a ticked entry "Tried". Ticking belongs to Day and Today.
8. **The dialog sends `tryList` only when the editor changed it**, as it does `openingHours` and `surpriseForIds`, never through `ITEM_CLEARABLE`. An edit path that didn't load the list therefore cannot wipe it. The dialog sources (T.6, T.7) carry it so the editor shows it.
9. **`updateItem` leaves `tryList` out of `applyPatch`'s current values.** A stored list that somehow fails today's input schema then never blocks an unrelated edit (the Branch 1 corrupt-hours lesson). `patch.tryList` passes through `applyPatch` as a patch-only key. `null` clears it.
10. **`add_thing_to_do` / `update_thing_to_do` do not take `tryList`.** `set_try_list` is the one MCP write (R13), as `set_opening_hours` is for hours.
11. **Who may tick:** anyone `requireRowAccess("item", id)` admits, meaning a member of the Trip who is not surprised by the Item. Every member edits a Trip (there is no read-only role in `lib/guards.ts`). The MCP tools add `requireRealPlanRow`.

**Feedback trailer (assembler):** T.13 is Section T's last task. Its commit carries `Resolves-Feedback: cmvaig9lq000v07gwt50bn7k0`.

**Review Focus candidates:**
1. **Three Travellers tick three different entries at once, on three rows of one family** (the Wishlist idea, its real-plan copy, a Fork's copy). Every row ends with all three ticked. Repeated over five rounds against the real Postgres. Tested in T.4 (integration).
2. **An edit saved from a dialog opened before a tick keeps the tick.** The locked row has "Lebkuchen" ticked. The dialog sends `[{ id: "e1", text: "Lebkuchen" }, { text: "Schäufele" }]` and the result keeps `tried: true` on e1. This holds with the tick and the edit running concurrently too. Tested in T.3 (unit) and T.4 (integration).
3. **A tick on Today shows at once and rolls back when the server refuses.** The checkbox is checked immediately and the heading reads "1/2 tried". After `{ success: false, errors: { tryList: ["That one is no longer on the list."] } }` the box is unchecked again, the heading reads "0/2 tried", and that message is toasted. Tested in T.10.

---

### Task T.1: Try list operations (pure)

**Files:**
- Create: `lib/try-list-ops.ts`
- Test: `lib/try-list-ops.test.ts`

**Interfaces:**
- Consumes: S's `TryEntry`, `TryList` (`@/lib/try-list`), types only.
- Produces:
  - `interface TryEntryInput { id?: string; text: string; tried?: boolean }`
  - `resolveTryList(current: TryList | null | undefined, input: readonly TryEntryInput[], newId: () => string): TryList | null`
  - `tickEntry(list: TryList | null | undefined, entryId: string, tried: boolean): TryList | null`
  - `triedCount(list: TryList | null | undefined): { tried: number; total: number }`
  - `triedLabel(list: TryList | null | undefined): string | null`
  - `tryListSummary(list: TryList): string`
  - `sameTryEntries(a: TryList | null | undefined, b: TryList | null | undefined): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// lib/try-list-ops.test.ts
import { describe, expect, it } from "vitest";
import type { TryList } from "@/lib/try-list";
import { resolveTryList, sameTryEntries, tickEntry, triedCount, triedLabel, tryListSummary } from "./try-list-ops";

const LIST: TryList = [
  { id: "e1", text: "Lebkuchen", tried: true },
  { id: "e2", text: "Drei im Weggla", tried: false },
];
const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};

describe("resolveTryList (CONTEXT.md Try list: an id keeps its entry and its tick)", () => {
  it("a known id keeps its id and tick; a new entry gets a fresh id and starts untried; order follows the input", () => {
    expect(resolveTryList(LIST, [{ text: "Schäufele" }, { id: "e2", text: "Drei im Weggla (Bratwurst)" }, { id: "e1", text: "Lebkuchen" }], ids())).toEqual([
      { id: "new-1", text: "Schäufele", tried: false },
      { id: "e2", text: "Drei im Weggla (Bratwurst)", tried: false },
      { id: "e1", text: "Lebkuchen", tried: true },
    ]);
  });

  it("tried, when given, replaces the tick", () => {
    expect(resolveTryList(LIST, [{ id: "e1", text: "Lebkuchen", tried: false }, { text: "Feuerzangenbowle", tried: true }], ids())).toEqual([
      { id: "e1", text: "Lebkuchen", tried: false },
      { id: "new-1", text: "Feuerzangenbowle", tried: true },
    ]);
  });

  it("an id the list doesn't hold is a new entry (a stale dialog after the partner removed it)", () => {
    expect(resolveTryList(LIST, [{ id: "gone", text: "Rauchbier" }], ids())).toEqual([{ id: "new-1", text: "Rauchbier", tried: false }]);
  });

  it("trims text, and an empty result is no list", () => {
    expect(resolveTryList(null, [{ text: "  Lebkuchen  " }], ids())).toEqual([{ id: "new-1", text: "Lebkuchen", tried: false }]);
    expect(resolveTryList(LIST, [], ids())).toBeNull();
  });

  it("never reuses an id already on the list for a new entry", () => {
    const clash = (() => {
      const seq = ["e1", "e2", "fresh"];
      return () => seq.shift()!;
    })();
    expect(resolveTryList(LIST, [{ id: "e1", text: "Lebkuchen" }, { id: "e2", text: "Drei im Weggla" }, { text: "Schäufele" }], clash).map((e) => e.id)).toEqual(["e1", "e2", "fresh"]);
  });
});

describe("tickEntry", () => {
  it("ticks or unticks one entry by id", () => {
    expect(tickEntry(LIST, "e2", true)).toEqual([LIST[0], { ...LIST[1], tried: true }]);
    expect(tickEntry(LIST, "e1", false)).toEqual([{ ...LIST[0], tried: false }, LIST[1]]);
  });

  it("is null when the entry isn't there", () => {
    expect(tickEntry(LIST, "gone", true)).toBeNull();
    expect(tickEntry(null, "e1", true)).toBeNull();
  });
});

describe("counts and copy", () => {
  it("triedCount and the Timeline's '2/5 tried'", () => {
    expect(triedCount(LIST)).toEqual({ tried: 1, total: 2 });
    expect(triedLabel(LIST)).toBe("1/2 tried");
    expect(triedLabel([])).toBeNull();
    expect(triedLabel(null)).toBeNull();
  });

  it("tryListSummary names up to five entries, then how many more", () => {
    expect(tryListSummary(LIST)).toBe("Lebkuchen, Drei im Weggla");
    const seven = Array.from({ length: 7 }, (_, i) => ({ id: `x${i}`, text: `Thing ${i + 1}`, tried: false }));
    expect(tryListSummary(seven)).toBe("Thing 1, Thing 2, Thing 3, Thing 4, Thing 5 +2 more");
  });

  it("sameTryEntries compares the entries' texts in order, not the ticks", () => {
    expect(sameTryEntries(LIST, [{ ...LIST[0], tried: false }, { ...LIST[1], tried: true }])).toBe(true);
    expect(sameTryEntries(LIST, [LIST[1], LIST[0]])).toBe(false);
    expect(sameTryEntries(LIST, [LIST[0]])).toBe(false);
    expect(sameTryEntries(null, [])).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**: `npx vitest run lib/try-list-ops.test.ts` fails with "Failed to resolve import ./try-list-ops".

- [ ] **Step 3: Implement**

```ts
// lib/try-list-ops.ts
/**
 * CONTEXT.md "Try list": the pure operations on one. Zod-free and
 * client-safe, because the Item dialog, the Timeline and lib/activity.ts import it.
 * Validation (limits, unique ids) is lib/validations/try-list.ts's job.
 */
import type { TryList } from "@/lib/try-list";

/**
 * One entry as the Item dialog or Claude sends it. An `id` the current list
 * holds keeps that entry (and its tick, unless `tried` is given). No `id`,
 * or an id the list doesn't hold, is a new entry.
 */
export interface TryEntryInput {
  id?: string;
  text: string;
  tried?: boolean;
}

/**
 * The list `input` asks for, merged onto `current` (read under the row lock by
 * the caller, so a tick made meanwhile is the one kept). Order follows `input`.
 * `newId` mints ids for new entries; one already in use is never reused.
 * An empty result is null (no list).
 */
export function resolveTryList(
  current: TryList | null | undefined,
  input: readonly TryEntryInput[],
  newId: () => string,
): TryList | null {
  const known = new Map((current ?? []).map((e) => [e.id, e]));
  const used = new Set<string>();
  const out: TryList = [];
  for (const entry of input) {
    const existing = entry.id !== undefined && !used.has(entry.id) ? known.get(entry.id) : undefined;
    let id = existing?.id;
    if (id === undefined) {
      do id = newId();
      while (used.has(id) || known.has(id));
    }
    used.add(id);
    out.push({ id, text: entry.text.trim(), tried: entry.tried ?? existing?.tried ?? false });
  }
  return out.length > 0 ? out : null;
}

/** The list with one entry ticked (or unticked); null when the entry isn't there. */
export function tickEntry(list: TryList | null | undefined, entryId: string, tried: boolean): TryList | null {
  if (!list || !list.some((e) => e.id === entryId)) return null;
  return list.map((e) => (e.id === entryId ? { ...e, tried } : e));
}

export function triedCount(list: TryList | null | undefined): { tried: number; total: number } {
  const entries = list ?? [];
  return { tried: entries.filter((e) => e.tried).length, total: entries.length };
}

/** The Timeline's count: "2/5 tried"; null when there is no list. */
export function triedLabel(list: TryList | null | undefined): string | null {
  const { tried, total } = triedCount(list);
  return total === 0 ? null : `${tried}/${total} tried`;
}

const SUMMARY_NAMES = 5;

/** One line for the Activity feed: up to five entries by name, then "+N more". */
export function tryListSummary(list: TryList): string {
  const names = list.slice(0, SUMMARY_NAMES).map((e) => e.text).join(", ");
  const more = list.length - SUMMARY_NAMES;
  return more > 0 ? `${names} +${more} more` : names;
}

/** True when both lists name the same entries in the same order. Ticks are ignored: a tick is not a list edit. */
export function sameTryEntries(a: TryList | null | undefined, b: TryList | null | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((e, i) => e.text === y[i].text);
}
```

- [ ] **Step 4: Run it, expect PASS**: `npx vitest run lib/try-list-ops.test.ts`.
- [ ] **Step 5: Task-done check**: `npx vitest related --run lib/try-list-ops.ts` + `npx tsc --noEmit` + `npx eslint lib/try-list-ops.ts lib/try-list-ops.test.ts`.
- [ ] **Step 6: Commit**: `lib/try-list-ops.ts`, `lib/try-list-ops.test.ts`, with the message `feat(try-list): merge, tick, count and summary (pure)`.

---

### Task T.2: The Try list input schema, and `itemSchema` takes it

**Files:**
- Modify: `lib/validations/try-list.ts` (S's module): append `tryListInputSchema` and `TryListInput`.
- Modify: `lib/validations/item.ts:88-90`: after `openingHours`, add `tryList`.
- Test: `lib/validations/try-list.test.ts` (S's file; extend), `lib/validations/item.test.ts` (extend)

**Interfaces:**
- Consumes: S's `MAX_TRY_ENTRIES`, `MAX_TRY_TEXT` (`@/lib/try-list`); T.1's `TryEntryInput`.
- Produces:
  - `tryListInputSchema`: a zod array of `{ id?: string; text: string; tried?: boolean }`, strict. It enforces at most 30 entries, text trimmed to 1–80 characters, and a given id appearing at most once.
  - `type TryListInput = z.input<typeof tryListInputSchema>`
  - `ItemInput.tryList?: TryListInput`

- [ ] **Step 1: Write the failing tests**

Append to `lib/validations/try-list.test.ts`:
```ts
import { tryListInputSchema } from "./try-list";

describe("tryListInputSchema (what the Item dialog and Claude send)", () => {
  it("takes entries with or without an id, and trims text", () => {
    expect(tryListInputSchema.parse([{ id: "e1", text: " Lebkuchen " }, { text: "Schäufele", tried: true }])).toEqual([
      { id: "e1", text: "Lebkuchen" },
      { text: "Schäufele", tried: true },
    ]);
  });

  it("refuses empty or over-long text, more than 30 entries, a repeated id, and unknown keys", () => {
    expect(tryListInputSchema.safeParse([{ text: "   " }]).success).toBe(false);
    expect(tryListInputSchema.safeParse([{ text: "x".repeat(81) }]).success).toBe(false);
    expect(tryListInputSchema.safeParse(Array.from({ length: 31 }, (_, i) => ({ text: `T${i}` }))).success).toBe(false);
    const dup = tryListInputSchema.safeParse([{ id: "e1", text: "A" }, { id: "e1", text: "B" }]);
    expect(dup.success).toBe(false);
    expect(dup.error?.issues[0].message).toBe("Each entry can appear only once");
    expect(tryListInputSchema.safeParse([{ text: "A", note: "x" }]).success).toBe(false);
  });

  it("the messages say what to fix", () => {
    expect(tryListInputSchema.safeParse([{ text: "" }]).error?.issues[0].message).toBe("Each thing to try needs a name");
    expect(tryListInputSchema.safeParse([{ text: "x".repeat(81) }]).error?.issues[0].message).toBe("Keep each one to 80 characters");
    expect(tryListInputSchema.safeParse(Array.from({ length: 31 }, (_, i) => ({ text: `T${i}` }))).error?.issues[0].message).toBe(
      "A Try list holds up to 30 things",
    );
  });
});
```
Append to `lib/validations/item.test.ts`:
```ts
describe("itemSchema: tryList (CONTEXT.md Try list)", () => {
  it("passes a Try list through, and leaves it out when not given", () => {
    const r = itemSchema.parse({ title: "Lebkuchen-Schmidt", category: "FOOD", tryList: [{ text: "Elisenlebkuchen" }] });
    expect(r.tryList).toEqual([{ text: "Elisenlebkuchen" }]);
    expect(itemSchema.parse({ title: "Walk", category: "OTHER" })).not.toHaveProperty("tryList");
  });

  it("reports a bad Try list on the tryList field", () => {
    const r = itemSchema.safeParse({ title: "Market", category: "FOOD", tryList: [{ text: "" }] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path[0]).toBe("tryList");
  });
});
```
(If `itemSchema.parse` output carries `tryList: undefined` as a key, change the second assertion in the first test to `expect(...tryList).toBeUndefined()`. The point is "not given, not invented".)

- [ ] **Step 2: Run them, expect FAIL**: `npx vitest run lib/validations/try-list.test.ts lib/validations/item.test.ts`. `tryListInputSchema` is not exported, and `tryList` is stripped by `itemSchema`.

- [ ] **Step 3: Implement**

Append to `lib/validations/try-list.ts`:
```ts
import { MAX_TRY_ENTRIES, MAX_TRY_TEXT } from "@/lib/try-list"; // merge with the module's existing import

/**
 * What the Item dialog and Claude send (CONTEXT.md "Try list"): entries in
 * order. An id keeps an existing entry and its tick (lib/try-list-ops.ts
 * resolveTryList), so the dialog never sends `tried`, and a tick made
 * meanwhile survives the save.
 */
export const tryListInputSchema = z
  .array(
    z.strictObject({
      id: z.string().trim().min(1).max(64).optional(),
      text: z
        .string()
        .trim()
        .min(1, "Each thing to try needs a name")
        .max(MAX_TRY_TEXT, `Keep each one to ${MAX_TRY_TEXT} characters`),
      tried: z.boolean().optional(),
    }),
  )
  .max(MAX_TRY_ENTRIES, `A Try list holds up to ${MAX_TRY_ENTRIES} things`)
  .refine(
    (entries) => {
      const ids = entries.flatMap((e) => (e.id === undefined ? [] : [e.id]));
      return new Set(ids).size === ids.length;
    },
    { message: "Each entry can appear only once" },
  );

export type TryListInput = z.input<typeof tryListInputSchema>;
```
`lib/validations/item.ts`: add `import { tryListInputSchema } from "@/lib/validations/try-list";`, then after `openingHours` (line 90):
```ts
    /** CONTEXT.md "Try list": the entries in order; an id keeps an entry and its tick. Omitted = keep; a PATCH null clears. */
    tryList: tryListInputSchema.optional(),
```
Type check: `TryListInput[number]` must be assignable to T.1's `TryEntryInput`. Both are `{ id?: string; text: string; tried?: boolean }`. `npx tsc --noEmit` confirms it in T.3, where `resolveTryList(current, data.tryList ?? [], …)` uses it.

- [ ] **Step 4: Run them, expect PASS**: the same command.
- [ ] **Step 5: Task-done check**: `npx vitest related --run lib/validations/try-list.ts lib/validations/item.ts` + `npx tsc --noEmit` + `npx eslint lib/validations/try-list.ts lib/validations/try-list.test.ts lib/validations/item.ts lib/validations/item.test.ts`.
- [ ] **Step 6: Commit**: the four files, with the message `feat(try-list): input schema; itemSchema takes a Try list`.

---

### Task T.3: Item actions write the Try list (create, update under PATCH, `setTryList`), locked and shared by the family

**Files:**
- Modify: `server/actions/items.ts`:
  - imports (lines 1-32): add `Prisma` from `@prisma/client`; `parseTryList`, `serializeTryList`, `tryListInputSchema` from `@/lib/validations/try-list`; `newTryEntryId`, `type TryList` from `@/lib/try-list`; `resolveTryList`, `type TryEntryInput` from `@/lib/try-list-ops`
  - `createItem` create `data` (lines 196-217): add `tryList` after `openingHours` (line 214)
  - `updateItem` (lines 355-560): the family block (lines 425-488)
  - new private `lockFamilyTryList`, after `itemFamilyRecipients` (S's rename of lines 570-584)
  - new exported `setTryList`, after `setOpeningHours` (lines 599-621)
- Modify: `lib/server-action-exports.test.ts:103-113`: add `"setTryList"` between `"setOpeningHours"` and `"unscheduleItem"`.
- Test: `server/actions/items.test.ts` (extend). Add `itemQueryRawMock` to the hoisted block, `$queryRaw: itemQueryRawMock` to the fake `tx` (lines 58-77), and `findMany: itemFindManyMock` to the fake `tx.item` if S hasn't. Add a `vi.mock("@/lib/try-list", …)` that makes `newTryEntryId` deterministic.
- Create: `test/integration/try-list.test.ts`

**Interfaces:**
- Consumes:
  - T.1's `resolveTryList`, `TryEntryInput`
  - T.2's `tryListInputSchema`, `ItemInput.tryList`
  - S's `parseTryList`, `serializeTryList`, `newTryEntryId`, `TryList`
  - S's `itemFamilyRecipients(client, item)`
- Produces:
  - `createItem(tripId, { …, tryList })` stores the list with fresh ids.
  - `updateItem(itemId, patch)` with `patch.tryList: TryEntryInput[] | null | undefined`. `undefined` keeps the list. `null` (or `[]`) clears it for the family. A list is merged onto the **locked** current list and written to the family.
  - `setTryList(itemId: string, entries: TryEntryInput[] | null): Promise<ItemActionResult>` writes only `tryList`, for the family, and records one UPDATED line.
  - private `lockFamilyTryList(tx: Prisma.TransactionClient, itemId: string, recipients: string[]): Promise<string | null>` returns the edited row's stored `tryList`, read under `FOR UPDATE` on every family row in id order. T.4 reuses it.

- [ ] **Step 1: Write the failing tests**

In `server/actions/items.test.ts`:
- Hoisted block: `const itemQueryRawMock = vi.fn().mockResolvedValue([]);` (inside the same `vi.hoisted` that defines `transactionMock`, and returned from it).
- Fake `tx`: `$queryRaw: itemQueryRawMock,`.
- Top of file, beside the other `vi.mock`s:
```ts
const newTryEntryIdMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/try-list", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/try-list")>()),
  newTryEntryId: newTryEntryIdMock,
}));
```
- Then append:
```ts
import { serializeTryList } from "@/lib/validations/try-list";
import { setTryList } from "./items"; // alongside the existing imports from "./items"

describe("Try list (CONTEXT.md Try list: shared by a thing to do and its placed copies)", () => {
  const LIST = [
    { id: "e1", text: "Lebkuchen", tried: true },
    { id: "e2", text: "Drei im Weggla", tried: false },
  ];
  const STORED = serializeTryList(LIST);
  const row = {
    id: "copy-1", tripId: "trip-1", forkId: null, stopId: "stop-1", sourceItemId: "idea-1", title: "Nuremberg market", category: "FOOD",
    date: "2027-12-02", startTime: null, endTime: null, address: null, link: null, booking: null, notes: null,
    hiddenFromShares: false, openingHours: null, tryList: STORED,
  };
  const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

  beforeEach(() => {
    let n = 0;
    newTryEntryIdMock.mockImplementation(() => `new-${++n}`);
    itemFindUniqueMock.mockResolvedValue(row);
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", tripId: "trip-1", forkId: null });
    itemUpdateMock.mockResolvedValue(row);
    itemFindManyMock.mockResolvedValue([{ id: "idea-1" }]); // the family's other member
    itemQueryRawMock.mockResolvedValue([{ id: "copy-1", tryList: STORED }, { id: "idea-1", tryList: STORED }]);
  });

  it("updateItem merges the list onto the locked one and writes the row and its family", async () => {
    expect(await updateItem("copy-1", { tryList: [{ id: "e2", text: "Drei im Weggla" }, { text: "Schäufele" }] })).toMatchObject({ success: true });
    const next = serializeTryList([
      { id: "e2", text: "Drei im Weggla", tried: false },
      { id: "new-1", text: "Schäufele", tried: false },
    ]);
    expect(sqlOf(itemQueryRawMock.mock.calls[0])).toMatch(/FOR UPDATE/);
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "copy-1" }, data: expect.objectContaining({ tryList: next }) });
    expect(itemUpdateManyMock).toHaveBeenCalledWith({ where: { id: { in: ["idea-1"] } }, data: { tryList: next } });
  });

  it("an edit from a dialog opened before a tick keeps the tick (it reads the locked row, not the one it held)", async () => {
    // The held row says e2 is untried; the locked row says the partner has just ticked it.
    const ticked = serializeTryList([LIST[0], { ...LIST[1], tried: true }]);
    itemQueryRawMock.mockResolvedValue([{ id: "copy-1", tryList: ticked }, { id: "idea-1", tryList: ticked }]);
    await updateItem("copy-1", { tryList: [{ id: "e1", text: "Lebkuchen" }, { id: "e2", text: "Drei im Weggla (Bratwurst)" }] });
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: "copy-1" },
      data: expect.objectContaining({
        tryList: serializeTryList([
          { id: "e1", text: "Lebkuchen", tried: true },
          { id: "e2", text: "Drei im Weggla (Bratwurst)", tried: true },
        ]),
      }),
    });
  });

  it("updateItem that names no Try list leaves it, and the family, alone", async () => {
    await updateItem("copy-1", { notes: "cash only" });
    const call = itemUpdateMock.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data).not.toHaveProperty("tryList");
    expect(itemQueryRawMock).not.toHaveBeenCalled();
    expect(itemUpdateManyMock).not.toHaveBeenCalled();
  });

  it("updateItem with null clears the list for the family", async () => {
    await updateItem("copy-1", { tryList: null });
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "copy-1" }, data: expect.objectContaining({ tryList: null }) });
    expect(itemUpdateManyMock).toHaveBeenCalledWith({ where: { id: { in: ["idea-1"] } }, data: { tryList: null } });
  });

  it("refuses a 31-entry list on the field and writes nothing", async () => {
    const r = await updateItem("copy-1", { tryList: Array.from({ length: 31 }, (_, i) => ({ text: `Thing ${i}` })) });
    expect(r).toMatchObject({ success: false, errors: { tryList: ["A Try list holds up to 30 things"] } });
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });

  it("createItem stores a list given on create, with fresh ids, untried", async () => {
    requirePlanAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: {}, plan: null });
    itemFindFirstMock.mockResolvedValue(null);
    itemCreateMock.mockResolvedValue({ id: "new-item", title: "Market" });
    await createItem("trip-1", { title: "Market", category: "FOOD", tryList: [{ text: "Lebkuchen", tried: true }, { text: "Glühwein" }] });
    expect(itemCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tryList: serializeTryList([
          { id: "new-1", text: "Lebkuchen", tried: true },
          { id: "new-2", text: "Glühwein", tried: false },
        ]),
      }),
    });
  });

  it("setTryList writes only the list, shares it, records the edit, and revalidates the plan", async () => {
    itemUpdateMock.mockResolvedValue({ ...row, tryList: serializeTryList([LIST[0]]) });
    expect(await setTryList("copy-1", [{ id: "e1", text: "Lebkuchen" }])).toEqual({ success: true });
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "copy-1" }, data: { tryList: serializeTryList([LIST[0]]) } });
    expect(itemUpdateManyMock).toHaveBeenCalledWith({ where: { id: { in: ["idea-1"] } }, data: { tryList: serializeTryList([LIST[0]]) } });
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ verb: "UPDATED", entityType: "ITEM", entityId: "copy-1" }));
    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan");
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
  });

  it("setTryList checks access before writing, and a refused list writes nothing", async () => {
    await setTryList("copy-1", null);
    expectAccessCheckedBeforeWrite(requireRowAccessMock, itemUpdateMock);
    itemUpdateMock.mockClear();
    expect(await setTryList("copy-1", [{ text: "" }])).toMatchObject({ success: false, errors: { tryList: expect.any(Array) } });
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });

  it("a Surprise row's list reaches only itself", async () => {
    surpriseRootForMock.mockResolvedValue({ kind: "ITEM", id: "copy-1" });
    itemQueryRawMock.mockResolvedValue([{ id: "copy-1", tryList: STORED }]);
    await setTryList("copy-1", [{ id: "e1", text: "Lebkuchen" }]);
    expect(itemUpdateManyMock).not.toHaveBeenCalled();
  });
});
```
(`recordActivity` is the module-level mock at line 157. `geocodePlaceDetailedMock` and `revalidateTripMock` are the existing hoisted mocks. The Activity assertion holds once T.5 adds the field spec. Before T.5 the change list is empty and `recordActivity` returns early inside the real `lib/activity-record`. Here `recordActivity` itself is mocked, so the call is observed either way.)

Create `test/integration/try-list.test.ts`. Copy lines 1-39 of `test/integration/opening-hours.test.ts` (the mocks), with `it-oh-user` replaced by `it-tl-user`, then:
```ts
import { db } from "@/lib/db";
import { setTryList, updateItem } from "@/server/actions/items";
import { parseTryList } from "@/lib/validations/try-list";

// CONTEXT.md "Try list" against the real Postgres: a write reaches the
// Wishlist idea and every copy placed from it, in any Plan, never a Surprise
// copy, and nothing else.
const USER = "it-tl-user";
const OTHER_USER = "it-tl-partner";
const TRIP_ID = "it-tl-trip";
const FORK_ID = "it-tl-fork";
const NUREMBERG = "it-tl-nuremberg";
const IDEA = "it-tl-idea";
const COPY = "it-tl-copy"; // real-plan placement of IDEA
const FORK_COPY = "it-tl-fork-copy"; // a Fork's placement of IDEA
const SURPRISE_COPY = "it-tl-surprise-copy"; // a placement of IDEA that is a live Surprise
const OTHER = "it-tl-other"; // unrelated
const listOf = async (id: string) => parseTryList((await db.item.findUnique({ where: { id } }))!.tryList);

describe.skipIf(process.env.INTEGRATION !== "1")("a Try list is shared by an idea and its placed copies (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: USER }, update: {}, create: { id: USER, email: "it-tl@example.test", name: "IT TL" } });
    await db.user.upsert({ where: { id: OTHER_USER }, update: {}, create: { id: OTHER_USER, email: "it-tl-2@example.test", name: "IT TL 2" } });
  });

  beforeEach(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Try list", homeCurrency: "AUD", createdById: USER, forksEnabled: true,
        startDate: "2027-12-01", endDate: "2027-12-05",
        members: { create: [{ userId: USER, role: "owner" }, { userId: OTHER_USER, role: "member" }] },
      },
    });
    await db.fork.create({ data: { id: FORK_ID, tripId: TRIP_ID, name: "IT Plan B", createdById: USER } });
    await db.stop.create({ data: { id: NUREMBERG, tripId: TRIP_ID, name: "IT Nuremberg", timezone: "Europe/Berlin", arriveDate: "2027-12-01", departDate: "2027-12-05", nights: 4, sortOrder: 0 } });
    await db.item.createMany({
      data: [
        { id: IDEA, tripId: TRIP_ID, title: "IT Christkindlesmarkt", category: "FOOD", sortOrder: 0 },
        { id: COPY, tripId: TRIP_ID, stopId: NUREMBERG, sourceItemId: IDEA, title: "IT Christkindlesmarkt", category: "FOOD", date: "2027-12-02", sortOrder: 1 },
        { id: FORK_COPY, tripId: TRIP_ID, forkId: FORK_ID, sourceItemId: IDEA, title: "IT Christkindlesmarkt", category: "FOOD", date: "2027-12-03", sortOrder: 0 },
        {
          id: SURPRISE_COPY, tripId: TRIP_ID, stopId: NUREMBERG, sourceItemId: IDEA, title: "IT Christkindlesmarkt", category: "FOOD", date: "2027-12-04", sortOrder: 2,
          surprisePlannerId: USER, surpriseForIds: JSON.stringify([OTHER_USER]),
        },
        { id: OTHER, tripId: TRIP_ID, stopId: NUREMBERG, title: "IT Kaiserburg", category: "SIGHTSEEING", date: "2027-12-02", sortOrder: 3 },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("a list set on a placed copy reaches the idea and the Fork's copy; not the Surprise copy, not an unrelated Item", async () => {
    expect(await setTryList(COPY, [{ text: "IT Lebkuchen" }, { text: "IT Drei im Weggla" }])).toEqual({ success: true });
    const list = await listOf(COPY);
    expect(list?.map((e) => e.text)).toEqual(["IT Lebkuchen", "IT Drei im Weggla"]);
    for (const id of [IDEA, FORK_COPY]) expect(await listOf(id)).toEqual(list);
    expect(await listOf(SURPRISE_COPY)).toBeNull();
    expect(await listOf(OTHER)).toBeNull();
  });

  it("an edit that names no list keeps it; a dialog edit keeps ids and ticks; null clears the family as SQL NULL", async () => {
    await setTryList(IDEA, [{ text: "IT Lebkuchen", tried: true }]);
    const [lebkuchen] = (await listOf(IDEA))!;
    await updateItem(COPY, { notes: "IT cash only" });
    expect((await listOf(COPY))![0]).toEqual(lebkuchen);
    await updateItem(COPY, { tryList: [{ id: lebkuchen.id, text: "IT Elisenlebkuchen" }] });
    expect(await listOf(FORK_COPY)).toEqual([{ id: lebkuchen.id, text: "IT Elisenlebkuchen", tried: true }]);
    await updateItem(COPY, { tryList: null });
    const raw = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Item" WHERE "tripId" = ${TRIP_ID} AND "tryList" IS NULL`;
    expect(Number(raw[0].n)).toBe(5);
  });

  it("a refused list writes nothing", async () => {
    expect(await setTryList(COPY, [{ text: "" }])).toMatchObject({ success: false });
    expect(await listOf(IDEA)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them, expect FAIL**:
  - `npx vitest run server/actions/items.test.ts lib/server-action-exports.test.ts`: `setTryList` is not exported, `tryList` is not in the create/update data, and the allowlist differs.
  - `npm run test:integration -- test/integration/try-list.test.ts`, with the sandbox's localhost `DATABASE_URL`/`DIRECT_URL` from Global Constraints: it fails the same way.

- [ ] **Step 3: Implement** (`server/actions/items.ts`)

1. Imports, as listed under Files.
2. `createItem` create `data`, after `openingHours` (line 214):
```ts
      // CONTEXT.md "Try list" (R6): a create has no family yet; every entry gets a fresh id.
      tryList: serializeTryList(resolveTryList(null, data.tryList ?? [], newTryEntryId)),
```
3. `updateItem`: do **not** add `tryList` to the current values passed to `applyPatch` (lines 371-381). See Notes decision 9. `patch.tryList` passes through as a patch-only key.
4. `updateItem`, the family block (today lines 425-488, after S's rename). Replace the `if (patch.openingHours !== undefined) { … } else { … }` with:
```ts
  // CONTEXT.md "Opening hours" and "Try list": both belong to the place, so a
  // patch naming either writes the whole family (never across a Surprise), in
  // one transaction, with the Activity recorded after it commits.
  const familyWrite = patch.openingHours !== undefined || patch.tryList !== undefined;
  if (familyWrite) {
    const after = await db.$transaction(async (tx) => {
      const recipients = await itemFamilyRecipients(tx, before); // (S may compute this before the transaction; keep S's placement)
      const shared: { openingHours?: string | null; tryList?: string | null } = {};
      if (openingHoursStored !== undefined) shared.openingHours = openingHoursStored;
      if (patch.tryList !== undefined) {
        // Merged onto the list as it is under the lock, so a tick made since
        // the dialog opened is kept (the dialog never sends `tried`).
        const current = parseTryList(await lockFamilyTryList(tx, itemId, recipients));
        shared.tryList = serializeTryList(resolveTryList(current, data.tryList ?? [], newTryEntryId));
      }
      const updated = await tx.item.update({ where: { id: itemId }, data: { ...itemData, ...shared } });
      if (recipients.length > 0) await tx.item.updateMany({ where: { id: { in: recipients } }, data: shared });
      return updated;
    });
    await recordUpdate("ITEM", { tripId: item.tripId, plan: item.forkId ?? null, entityId: itemId, before, after });
  } else {
    await auditedUpdate("ITEM", db.item, itemId, itemData, item.forkId ?? null, { before });
  }
```
   `itemData` keeps its conditional `openingHours` spread from Branch 1. `shared` repeats it for the family, which is harmless. Remove `openingHoursRecipients` (line 435) if S still computes it outside: `recipients` above replaces it. Keep the comment block at lines 462-476 and add one line: "A Try list in the patch joins the same transaction and also locks the family (lockFamilyTryList)."
5. After `itemFamilyRecipients`:
```ts
/**
 * CONTEXT.md "Try list": lock every row of the family (the edited row and
 * its recipients) in id order, as reorderChecklistItem does, and return the
 * edited row's stored list. Two writers on any rows of one family then run
 * one after the other, so neither loses the other's tick. Raw SQL because
 * Prisma can't express SELECT … FOR UPDATE.
 */
async function lockFamilyTryList(tx: Prisma.TransactionClient, itemId: string, recipients: string[]): Promise<string | null> {
  const rows = await tx.$queryRaw<{ id: string; tryList: string | null }[]>`
    SELECT "id", "tryList" FROM "Item"
    WHERE "id" IN (${Prisma.join([itemId, ...recipients])})
    ORDER BY "id"
    FOR UPDATE
  `;
  return rows.find((r) => r.id === itemId)?.tryList ?? null;
}
```
6. After `setOpeningHours`:
```ts
/**
 * Replace a thing's Try list (CONTEXT.md "Try list"); null or [] clears it.
 * An entry's id keeps it and its tick unless `tried` is given (resolveTryList).
 * Writes only the list, for the thing and every Item sharing its place (never
 * across a Surprise), under the family's row lock. It never re-geocodes, unlike
 * a full updateItem. One UPDATED line on the edited Item, recorded after commit;
 * a change that only moves ticks reads as no change (lib/activity.ts). The MCP
 * tool `set_try_list` calls this.
 */
export async function setTryList(itemId: string, entries: TryEntryInput[] | null): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);
  const parsed = z.object({ tryList: tryListInputSchema.nullable() }).safeParse({ tryList: entries });
  if (!parsed.success) return validationResult(parsed.error);
  const held = await db.item.findUnique({ where: { id: itemId } });
  if (!held) notFound();

  const { before, after } = await db.$transaction(async (tx) => {
    const recipients = await itemFamilyRecipients(tx, held);
    const locked = await lockFamilyTryList(tx, itemId, recipients);
    const stored = serializeTryList(resolveTryList(parseTryList(locked), parsed.data.tryList ?? [], newTryEntryId));
    const updated = await tx.item.update({ where: { id: itemId }, data: { tryList: stored } });
    if (recipients.length > 0) await tx.item.updateMany({ where: { id: { in: recipients } }, data: { tryList: stored } });
    return { before: { ...held, tryList: locked }, after: updated };
  });
  await recordUpdate("ITEM", { tripId: item.tripId, plan: item.forkId ?? null, entityId: itemId, before, after });

  revalidateTrip(item.tripId, "plan");
  return { success: true };
}
```
7. `lib/server-action-exports.test.ts`: insert `"setTryList",` after `"setOpeningHours",`.

- [ ] **Step 4: Run them, expect PASS**:
  - `npx vitest run server/actions/items.test.ts lib/server-action-exports.test.ts`
  - `npm run test:integration -- test/integration/try-list.test.ts`
  - `npx vitest run test/integration/opening-hours.test.ts` with `INTEGRATION=1`: the hours family is unchanged (decision 2).
- [ ] **Step 5: Task-done check**:
  - `npx vitest related --run server/actions/items.ts`
  - `npx tsc --noEmit`
  - `npx eslint server/actions/items.ts server/actions/items.test.ts lib/server-action-exports.test.ts test/integration/try-list.test.ts`
  - `npm run test:integration -- test/integration/try-list.test.ts test/integration/opening-hours.test.ts`
- [ ] **Step 6: Commit**: the files above, with the message `feat(items): Try lists on Items, merged under the family's row lock`.

---

### Task T.4: `tickTryEntry` (atomic; writes the family; no Activity)

**Files:**
- Modify: `server/actions/items.ts`: add exported `tickTryEntry` after `setTryList`; import `tickEntry` from `@/lib/try-list-ops`.
- Modify: `lib/server-action-exports.test.ts:103-113`: add `"tickTryEntry"` between `"setTryList"` and `"unscheduleItem"`.
- Test: `server/actions/items.test.ts` (extend the T.3 describe), `test/integration/try-list.test.ts` (extend)

**Interfaces:**
- Consumes: T.1's `tickEntry`; T.3's `lockFamilyTryList`, `itemFamilyRecipients`; S's `parseTryList`, `serializeTryList`.
- Produces: `tickTryEntry(itemId: string, entryId: string, tried: boolean): Promise<ItemActionResult>`.
  - It returns `{ success: true }` after writing the row and its family, or with no write when the entry already has that state.
  - When the entry is gone it returns `{ success: false, errors: { tryList: ["That one is no longer on the list."] } }`.
  - It records no Activity and revalidates `"plan"`, which covers Home and `/day`.

- [ ] **Step 1: Write the failing tests**

Append inside T.3's `describe("Try list …")`:
```ts
  it("tickTryEntry ticks one entry on the locked list and writes the row and its family, with no Activity", async () => {
    expect(await tickTryEntry("copy-1", "e2", true)).toEqual({ success: true });
    const next = serializeTryList([LIST[0], { ...LIST[1], tried: true }]);
    expect(sqlOf(itemQueryRawMock.mock.calls[0])).toMatch(/FOR UPDATE/);
    expect(itemUpdateMock).toHaveBeenCalledWith({ where: { id: "copy-1" }, data: { tryList: next } });
    expect(itemUpdateManyMock).toHaveBeenCalledWith({ where: { id: { in: ["idea-1"] } }, data: { tryList: next } });
    expect(recordActivity).not.toHaveBeenCalled();
    expect(revalidateTripMock).toHaveBeenCalledWith("trip-1", "plan");
  });

  it("tickTryEntry builds on the locked list, so a tick made meanwhile on another entry is kept", async () => {
    const partnerTicked = serializeTryList([{ ...LIST[0], tried: false }, { ...LIST[1], tried: true }]);
    itemQueryRawMock.mockResolvedValue([{ id: "copy-1", tryList: partnerTicked }, { id: "idea-1", tryList: partnerTicked }]);
    await tickTryEntry("copy-1", "e1", true);
    expect(itemUpdateMock).toHaveBeenCalledWith({
      where: { id: "copy-1" },
      data: { tryList: serializeTryList([{ ...LIST[0], tried: true }, { ...LIST[1], tried: true }]) },
    });
  });

  it("a tick to the state it already has writes nothing", async () => {
    expect(await tickTryEntry("copy-1", "e1", true)).toEqual({ success: true });
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });

  it("a tick on an entry that is gone is refused on the field", async () => {
    expect(await tickTryEntry("copy-1", "gone", true)).toEqual({ success: false, errors: { tryList: ["That one is no longer on the list."] } });
    expect(itemUpdateMock).not.toHaveBeenCalled();
  });

  it("tickTryEntry checks access before writing", async () => {
    await tickTryEntry("copy-1", "e2", true);
    expectAccessCheckedBeforeWrite(requireRowAccessMock, itemUpdateMock);
  });
```
Add `tickTryEntry` to the `./items` import.

Append to `test/integration/try-list.test.ts` (add `tickTryEntry` to the import):
```ts
  it("ticks on three rows of one family at once all land, on every row (five rounds)", async () => {
    for (let round = 0; round < 5; round++) {
      await setTryList(IDEA, [{ text: "IT Lebkuchen", tried: false }, { text: "IT Drei im Weggla", tried: false }, { text: "IT Glühwein", tried: false }]);
      const [a, b, c] = (await listOf(IDEA))!;
      const results = await Promise.all([tickTryEntry(COPY, a.id, true), tickTryEntry(IDEA, b.id, true), tickTryEntry(FORK_COPY, c.id, true)]);
      expect(results).toEqual([{ success: true }, { success: true }, { success: true }]);
      for (const id of [IDEA, COPY, FORK_COPY]) expect((await listOf(id))!.map((e) => e.tried)).toEqual([true, true, true]);
    }
  });

  it("a tick and a dialog edit at once: the tick and the rename both survive", async () => {
    await setTryList(IDEA, [{ text: "IT Lebkuchen" }, { text: "IT Drei im Weggla" }]);
    const [a, b] = (await listOf(IDEA))!;
    await Promise.all([
      tickTryEntry(COPY, a.id, true),
      updateItem(IDEA, { tryList: [{ id: a.id, text: "IT Lebkuchen" }, { id: b.id, text: "IT Drei im Weggla (Bratwurst)" }] }),
    ]);
    expect(await listOf(FORK_COPY)).toEqual([
      { id: a.id, text: "IT Lebkuchen", tried: true },
      { id: b.id, text: "IT Drei im Weggla (Bratwurst)", tried: false },
    ]);
  });

  it("a tick on the Surprise copy stays on it", async () => {
    await setTryList(SURPRISE_COPY, [{ text: "IT Secret stall" }]);
    const [s] = (await listOf(SURPRISE_COPY))!;
    await tickTryEntry(SURPRISE_COPY, s.id, true);
    expect(await listOf(SURPRISE_COPY)).toEqual([{ ...s, tried: true }]);
    expect(await listOf(IDEA)).toBeNull();
  });
```

- [ ] **Step 2: Run them, expect FAIL**: `npx vitest run server/actions/items.test.ts lib/server-action-exports.test.ts` and the integration file. Both fail because `tickTryEntry` is not exported.

- [ ] **Step 3: Implement** (after `setTryList`):
```ts
/**
 * Tick (or untick) one entry of a thing's Try list (CONTEXT.md "Try list"),
 * by its id: anyone on the Trip who can see the Item may. A read-modify-write
 * under the family's row lock (lockFamilyTryList), so two Travellers ticking
 * at once never lose a tick, and it reaches the Wishlist idea and every copy
 * placed from it (never across a Surprise). Not Activity: like Packing ticks
 * (ADR 0012 amendment 2026-10-11) it is bookkeeping done as you go, and the
 * tick itself is what the partner sees. The MCP tool `tick_try_entry` and the
 * Day/Today checkboxes call this.
 */
export async function tickTryEntry(itemId: string, entryId: string, tried: boolean): Promise<ItemActionResult> {
  const item = await requireItemAccess(itemId);
  const held = await db.item.findUnique({ where: { id: itemId }, select: { id: true, tripId: true, sourceItemId: true } });
  if (!held) notFound();

  const outcome = await db.$transaction(async (tx) => {
    const recipients = await itemFamilyRecipients(tx, held);
    const current = parseTryList(await lockFamilyTryList(tx, itemId, recipients));
    const entry = current?.find((e) => e.id === entryId);
    if (!entry) return "gone" as const;
    if (entry.tried === tried) return "unchanged" as const;
    const stored = serializeTryList(tickEntry(current, entryId, tried));
    await tx.item.update({ where: { id: itemId }, data: { tryList: stored } });
    if (recipients.length > 0) await tx.item.updateMany({ where: { id: { in: recipients } }, data: { tryList: stored } });
    return "ticked" as const;
  });

  if (outcome === "gone") return { success: false, errors: { tryList: ["That one is no longer on the list."] } };
  if (outcome === "ticked") revalidateTrip(item.tripId, "plan");
  return { success: true };
}
```
`lib/server-action-exports.test.ts`: insert `"tickTryEntry",` after `"setTryList",`.

- [ ] **Step 4: Run them, expect PASS**: the same commands.
- [ ] **Step 5: Task-done check**:
  - `npx vitest related --run server/actions/items.ts`
  - `npx tsc --noEmit`
  - `npx eslint server/actions/items.ts server/actions/items.test.ts lib/server-action-exports.test.ts test/integration/try-list.test.ts`
  - `npm run test:integration -- test/integration/try-list.test.ts`
- [ ] **Step 6: Commit**: the message is `feat(items): tickTryEntry, atomic across the family, not Activity`.

---

### Task T.5: Activity records a Try list edit (and not a tick)

**Files:**
- Modify: `lib/activity.ts`:
  - imports (lines 11-20): `sameTryEntries`, `tryListSummary` from `@/lib/try-list-ops`; `type TryList` from `@/lib/try-list`
  - `FieldSpec` (lines 88-92): add an optional `same`
  - a new `readTryList` / `tryListFormat` pair after `openingHoursFormat` (lines 148-155)
  - `FIELD_SPECS.ITEM` (lines 199-213): append the `tryList` spec
  - `describeChanges` (line 309): use `spec.same` when present
- Test: `lib/activity.test.ts` (extend)

**Interfaces:**
- Consumes: T.1's `tryListSummary`, `sameTryEntries`.
- Produces:
  - `describeChanges("ITEM", before, after)` emits `{ field: "tryList", label: "Try list", from, to }`. Each side is `tryListSummary(list)`, or `"Not set"`. It emits nothing when only ticks changed.
  - `FieldSpec.same?: (before: unknown, after: unknown) => boolean`.

- [ ] **Step 1: Write the failing test** (append to `lib/activity.test.ts`):
```ts
describe("describeChanges: an Item's Try list (CONTEXT.md Try list)", () => {
  const two = JSON.stringify([
    { id: "e1", text: "Lebkuchen", tried: true },
    { id: "e2", text: "Drei im Weggla", tried: false },
  ]);

  it("adding entries reads as the list before and after; none reads 'Not set'", () => {
    expect(describeChanges("ITEM", { title: "Market", tryList: null }, { title: "Market", tryList: two })).toEqual([
      { field: "tryList", label: "Try list", from: "Not set", to: "Lebkuchen, Drei im Weggla" },
    ]);
    const three = JSON.stringify([...JSON.parse(two), { id: "e3", text: "Schäufele", tried: false }]);
    expect(describeChanges("ITEM", { tryList: two }, { tryList: three })).toEqual([
      { field: "tryList", label: "Try list", from: "Lebkuchen, Drei im Weggla", to: "Lebkuchen, Drei im Weggla, Schäufele" },
    ]);
  });

  it("a change that only moves ticks is no change (ticks are not Activity)", () => {
    const ticked = JSON.stringify([
      { id: "e1", text: "Lebkuchen", tried: false },
      { id: "e2", text: "Drei im Weggla", tried: true },
    ]);
    expect(describeChanges("ITEM", { tryList: two }, { tryList: ticked })).toEqual([]);
  });

  it("an unreadable stored value still reads as a change, as 'Set'", () => {
    expect(describeChanges("ITEM", { tryList: "not json" }, { tryList: two })).toEqual([
      { field: "tryList", label: "Try list", from: "Set", to: "Lebkuchen, Drei im Weggla" },
    ]);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**: `npx vitest run lib/activity.test.ts`. There is no `tryList` spec, so the first case returns `[]`.

- [ ] **Step 3: Implement**
```ts
// FieldSpec:
interface FieldSpec {
  key: string;
  label: string;
  format?: FormatFn;
  /** Both sides non-empty: true when they count as the same (default: equal after normaliseForComparison). */
  same?: (before: unknown, after: unknown) => boolean;
}

/**
 * CONTEXT.md "Try list" (R6). `Item.tryList` is stored as a JSON string, so
 * the snapshot values are that string (or null). Plain JSON.parse, not
 * parseTryList: lib/activity.ts is client-safe (notification-bell.tsx
 * imports it), so it stays off the zod side (lib/client-zod.guard.test.ts).
 * Display only: an unreadable value reads as "Set".
 */
function readTryList(value: unknown): TryList | null {
  try {
    const parsed: unknown = JSON.parse(value as string);
    return Array.isArray(parsed) ? (parsed as TryList) : null;
  } catch {
    return null;
  }
}

function tryListFormat(value: unknown): string {
  if (isEmpty(value)) return "Not set";
  const list = readTryList(value);
  return list && list.length > 0 ? tryListSummary(list) : "Set";
}

/** A tick is not a list edit (ADR 0012 amendment: ticked as you go): the same entries in the same order are no change. */
function sameTryList(before: unknown, after: unknown): boolean {
  const b = readTryList(before);
  const a = readTryList(after);
  return b !== null && a !== null && sameTryEntries(b, a);
}

// FIELD_SPECS.ITEM, append after openingHours:
    { key: "tryList", label: "Try list", format: (v) => tryListFormat(v), same: sameTryList },

// describeChanges, replace the "Both non-empty and equal" line:
    if (!bEmpty && !aEmpty && (spec.same ? spec.same(bVal, aVal) : normaliseForComparison(bVal) === normaliseForComparison(aVal))) continue;
```

- [ ] **Step 4: Run it, expect PASS**: `npx vitest run lib/activity.test.ts server/actions/items.test.ts`.
- [ ] **Step 5: Task-done check**: `npx vitest related --run lib/activity.ts` + `npx tsc --noEmit` + `npx eslint lib/activity.ts lib/activity.test.ts`.
- [ ] **Step 6: Commit**: `lib/activity.ts`, `lib/activity.test.ts`, with the message `feat(activity): a Try list edit reads as the list; a tick is not news`.

---

### Task T.6: The Day reads carry the Try list (Day view, Today; placeholders never)

**Files:**
- Create: `lib/try-list-stored.ts`
- Test: `lib/try-list-stored.test.ts`
- Modify: `lib/day-reads.ts`:
  - the dated-items select (line 76): add `tryList: true`
  - the item rows (line 129): `...withTryList(withOpeningHours(it))`
  - the placeholder rows (line 138): add `tryList: p.tryList`
- Modify: `lib/day-view-model.ts`:
  - `DayItemRow` (lines 164-175): add `tryList: TryList | null`
  - the `buildItinerary` items mapping (lines 276-282): add `tryList: i.tryList`
- Modify: `lib/itinerary.ts:58-59` (`ItineraryItem`): add `tryList?: TryList | null`.
- Modify (fixtures that build a `DayRows["items"]` row; `npx tsc --noEmit` lists them; add `tryList: null`, keep every assertion):
  - `lib/day-view-model.test.ts:130`
  - `lib/mcp/reads/day.test.ts:25`
  - `lib/day-reads.test.ts` (its item fixture builder, if it builds one)
  - `test/builders/index.ts:52,111`, if S didn't
- Test: `test/integration/day-reads.test.ts` (extend)

**Interfaces:**
- Consumes: S's `parseTryList`, `TryList`, `PlaceholderItem.tryList: null`.
- Produces:
  - `withTryList<T extends { tryList: string | null }>(row: T): Omit<T, "tryList"> & { tryList: TryList | null }`
  - `DayRows["items"][n].tryList: TryList | null`, and `ItineraryItem.tryList`, so `DayPlan.timedItems[].item.tryList` (the Day view and both Today views, which read through `readDayRows` + `buildDayModel`) carries it.
  - The Day view editor's `items` (`lib/day-view-loader.ts:234` spreads the row) carry it to the Item dialog.
  - get_day's items carry it to T.12.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/try-list-stored.test.ts
import { describe, expect, it } from "vitest";
import { withTryList } from "./try-list-stored";

describe("withTryList", () => {
  it("parses a row's stored Try list in place; none or unreadable reads as null", () => {
    const list = [{ id: "e1", text: "Lebkuchen", tried: true }];
    expect(withTryList({ id: "i1", tryList: JSON.stringify(list) })).toEqual({ id: "i1", tryList: list });
    expect(withTryList({ id: "i2", tryList: null })).toEqual({ id: "i2", tryList: null });
    expect(withTryList({ id: "i3", tryList: "nope" })).toEqual({ id: "i3", tryList: null });
  });
});
```
Append to `test/integration/day-reads.test.ts`:
```ts
  it("a dated Item carries its Try list to the Day view; a hidden Surprise's placeholder never does", async () => {
    const list = [
      { id: "it-e1", text: "IT Pastel de nata", tried: true },
      { id: "it-e2", text: "IT Bifana", tried: false },
    ];
    await db.item.update({ where: { id: "it-dr-tram" }, data: { tryList: JSON.stringify(list) } });
    await db.item.update({ where: { id: "it-dr-dinner" }, data: { tryList: JSON.stringify([{ id: "it-s1", text: "IT birthday cake stall", tried: false }]) } });

    const planner = await readDayRows(TRIP_ID, PLANNER, none);
    if (typeof planner === "string") throw new Error(planner);
    expect(planner.rows.items.find((i) => i.id === "it-dr-tram")!.tryList).toEqual(list);
    const day = buildDayModel(planner.rows, "2027-06-02").dayPlan!;
    expect([...day.timedItems, ...day.untimedItems].find((e) => e.item.id === "it-dr-tram")!.item.tryList).toEqual(list);

    const member = await readDayRows(TRIP_ID, MEMBER, none);
    if (typeof member === "string") throw new Error(member);
    expect(member.rows.items.find((i) => i.id === "it-dr-dinner")!.tryList).toBeNull();
    expect(JSON.stringify(member.rows)).not.toContain("birthday cake stall");
  });
```

- [ ] **Step 2: Run them, expect FAIL**:
  - `npx vitest run lib/try-list-stored.test.ts` fails because the module doesn't resolve.
  - `npm run test:integration -- test/integration/day-reads.test.ts` fails because `tryList` is `undefined`.

- [ ] **Step 3: Implement**

```ts
// lib/try-list-stored.ts
/**
 * CONTEXT.md "Try list" at the database edge: a row's `tryList` column (the
 * stored JSON string, or null) parsed in place, as withOpeningHours does for
 * hours. Server-side (parseTryList is zod).
 */
import { parseTryList } from "@/lib/validations/try-list";
import type { TryList } from "@/lib/try-list";

export function withTryList<T extends { tryList: string | null }>(row: T): Omit<T, "tryList"> & { tryList: TryList | null } {
  return { ...row, tryList: parseTryList(row.tryList) };
}
```
- `lib/itinerary.ts` `ItineraryItem`: add `import type { TryList } from "@/lib/try-list";`, then after `openingHours`:
```ts
  /** CONTEXT.md "Try list": things to try there, ticked on the day; null/absent = none. */
  tryList?: TryList | null;
```
- `lib/day-reads.ts`:
  - In the select, change `openingHours: true,` to `openingHours: true, tryList: true,`.
  - The item rows become `...itemRows.map((it) => ({ ...withTryList(withOpeningHours(it)), bookingState: …, surprise: … }))`, importing `withTryList` from `@/lib/try-list-stored`.
  - In the placeholder literal, after `openingHours: p.openingHours,`, add `tryList: p.tryList,`.
- `lib/day-view-model.ts`:
  - In `DayItemRow`, add `/** CONTEXT.md "Try list"; null = none. */ tryList: TryList | null;`.
  - In the mapping, after `openingHours: i.openingHours,`, add `tryList: i.tryList,`.

- [ ] **Step 4: Run them, expect PASS**:
  - `npx vitest run lib/try-list-stored.test.ts lib/day-reads.test.ts lib/day-view-model.test.ts lib/mcp/reads/day.test.ts lib/travelling-home-loader.test.ts lib/day-view-loader.test.ts`
  - the integration file
- [ ] **Step 5: Task-done check**:
  - `npx vitest related --run lib/try-list-stored.ts lib/day-reads.ts lib/day-view-model.ts lib/itinerary.ts`
  - `npx tsc --noEmit`
  - `npx eslint` on every changed file
  - `npm run test:integration -- test/integration/day-reads.test.ts`
- [ ] **Step 6: Commit**: the message is `feat(day-view): Items carry their Try list; Surprise placeholders never`.

---

### Task T.7: The plan editor, Wishlist and dialog shapes carry the Try list (so an edit shows, and never clears, it)

**Files:**
- Modify: `lib/plan-reads.ts`:
  - `PLAN_ITEM_SELECT` (line 114): add `tryList: true`
  - `PlanItemRow` (lines 162-169): omit `"openingHours" | "tryList"` and add `tryList: TryList | null`
  - `readPlan`'s `items: mergePlanItems(...)` (lines 311-317): map with `(r) => withTryList(withOpeningHours(r))` and widen the cast the same way
- Modify: `lib/stop-days.ts:44-45` (`StopDayItem`): add `tryList?: TryList | null`.
- Modify: `lib/plan-entity-views.ts:32-33` (`ItemCardItem`): add `tryList?: TryList | null`.
- Modify: `components/plan/types.ts`: `ThingToDo` (line 58-59) gets `tryList?: TryList | null`. `toItemCardItem` (line 88) gets `tryList: it.tryList ?? null,`.
- Modify: `app/(app)/trips/[tripId]/wishlist/page.tsx`:
  - the `items` select (line 98): add `tryList: true,`
  - the `ItemCardItem` map (line 322): add `tryList: parseTryList(item.tryList),`
- Verify only: `app/(app)/trips/[tripId]/plan/page.tsx` spreads `...rest` from `rows.items` into `StopDayItem`/`ThingToDo` (Branch 1 D.7 note), so the parsed list flows with no edit. `npx tsc --noEmit` confirms it. Do not add `tryList` to `BUDGET_ITEM_SELECT`.
- Test: `test/integration/plan-reads.test.ts` (extend), `components/plan/types.test.ts` (extend)

**Interfaces:**
- Consumes: T.6's `withTryList`; S's `parseTryList`, `PlaceholderItem.tryList`.
- Produces: `PlanRows["items"][n].tryList: TryList | null`; `StopDayItem.tryList`, `ThingToDo.tryList`, `ItemCardItem.tryList`. T.9's dialog editor reads `item.tryList` on every edit path: plan editor day rows, plan editor things to do / IdeaSheet, Day view editor (T.6) and the Wishlist board.

- [ ] **Step 1: Write the failing tests**

`test/integration/plan-reads.test.ts`, inside the existing describe:
```ts
  it("an Item's Try list reads back parsed; a Surprise placeholder's never does", async () => {
    const list = [{ id: "it-e1", text: "IT Francesinha", tried: false }];
    await db.item.create({
      data: { id: "it-plan-cafe", tripId: TRIP_ID, stopId: STOP_A, title: "IT Café Santiago", category: "FOOD", date: "2027-06-02", sortOrder: 0, tryList: JSON.stringify(list) },
    });
    await db.item.create({
      data: {
        id: "it-plan-surprise-tl", tripId: TRIP_ID, stopId: STOP_A, title: "IT Secret tasting", category: "FOOD", date: "2027-06-03", sortOrder: 1,
        tryList: JSON.stringify([{ id: "it-s1", text: "IT anniversary port", tried: false }]),
        surprisePlannerId: OWNER, surpriseForIds: JSON.stringify([MEMBER]),
      },
    });
    expect((await readPlan(TRIP_ID, OWNER, null)).items.find((i) => i.id === "it-plan-cafe")!.tryList).toEqual(list);
    const surprised = (await readPlan(TRIP_ID, MEMBER, null)).items.find((i) => i.id === "it-plan-surprise-tl")!;
    expect(surprised.tryList).toBeNull();
  });
```
`components/plan/types.test.ts`, inside the existing `describe("toItemCardItem")`:
```ts
  it("carries the Try list to the edit dialog", () => {
    const list = [{ id: "e1", text: "Lebkuchen", tried: true }];
    expect(toItemCardItem({ id: "i1", title: "Market", category: "FOOD", bookingStateSet: false, tryList: list }).tryList).toEqual(list);
    expect(toItemCardItem({ id: "i2", title: "Walk", category: "OTHER", bookingStateSet: false }).tryList).toBeNull();
  });
```
(Match the existing fixtures in that file. If they omit `bookingStateSet`, omit it here too.)

- [ ] **Step 2: Run them, expect FAIL**: `npx vitest run components/plan/types.test.ts`, and `npm run test:integration -- test/integration/plan-reads.test.ts`. `tryList` is undefined.

- [ ] **Step 3: Implement** the edits under Files. In `lib/plan-reads.ts`:
```ts
import { withTryList } from "@/lib/try-list-stored";
import type { TryList } from "@/lib/try-list";

type PlanItemRow = (
  | (Omit<WithBookingState<Prisma.ItemGetPayload<{ select: typeof PLAN_ITEM_SELECT }>>, "openingHours" | "tryList"> & {
      openingHours: OpeningHours | null;
      tryList: TryList | null;
    })
  | PlaceholderItem
) & {
  surprise: SurpriseView | null;
};

// readPlan's return:
      items: mergePlanItems(
        itemRows.map((r) => withTryList(withOpeningHours(r))) as WithBookingState<
          Omit<(typeof itemRows)[number], "openingHours" | "tryList"> & { openingHours: OpeningHours | null; tryList: TryList | null }
        >[],
        v,
        plan,
      ),
```
Each type gets the field with the same doc comment: `/** CONTEXT.md "Try list": things to try there, shared by an idea and its copies; null/absent = none. */`.

- [ ] **Step 4: Run them, expect PASS**:
  - the same two commands
  - `npx vitest run lib/plan-reads.test.ts`, updating a pinned `PLAN_ITEM_SELECT` expectation if there is one and keeping the assertion
- [ ] **Step 5: Task-done check**:
  - `npx vitest related --run lib/plan-reads.ts lib/stop-days.ts lib/plan-entity-views.ts components/plan/types.ts "app/(app)/trips/[tripId]/wishlist/page.tsx"`
  - `npx tsc --noEmit`
  - `npx eslint` on the changed files
  - `npm run test:integration -- test/integration/plan-reads.test.ts`
- [ ] **Step 6: Commit**: the message is `feat(plan): the Try list reaches the plan editor, Wishlist and Item dialog`.

---

### Task T.8: The Try list editor (add, rename, remove, move up/down)

**Files:**
- Create: `components/trip/try-list-editor.tsx`
- Test: `components/trip/try-list-editor.test.tsx`

**Interfaces:**
- Consumes: T.1's `TryEntryInput`; S's `TryList`, `MAX_TRY_ENTRIES`, `MAX_TRY_TEXT` (all zod-free).
- Produces:
  - `interface TryListDraftEntry { key: string; id?: string; text: string; tried: boolean }`
  - `draftFromTryList(list: TryList | null | undefined): TryListDraftEntry[]`
  - `tryListPayload(draft: readonly TryListDraftEntry[]): TryEntryInput[]`. It trims, drops blank entries, and sends `{ id?, text }` only, never `tried`.
  - `TryListEditor({ value, onChange, disabled?, error? })`

- [ ] **Step 1: Write the failing test**

```tsx
// components/trip/try-list-editor.test.tsx
import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TryListEditor, draftFromTryList, tryListPayload, type TryListDraftEntry } from "./try-list-editor";

const LIST = [
  { id: "e1", text: "Lebkuchen", tried: true },
  { id: "e2", text: "Drei im Weggla", tried: false },
];

function Harness({ initial }: { initial: TryListDraftEntry[] }) {
  const [value, setValue] = React.useState(initial);
  return (
    <>
      <TryListEditor value={value} onChange={setValue} />
      <output data-testid="payload">{JSON.stringify(tryListPayload(value))}</output>
    </>
  );
}
const payload = () => JSON.parse(screen.getByTestId("payload").textContent!);

describe("draftFromTryList / tryListPayload", () => {
  it("round-trips ids and texts, never ticks, and drops blank entries", () => {
    const draft = draftFromTryList(LIST);
    expect(tryListPayload(draft)).toEqual([{ id: "e1", text: "Lebkuchen" }, { id: "e2", text: "Drei im Weggla" }]);
    expect(tryListPayload([...draft, { key: "k", text: "   ", tried: false }])).toHaveLength(2);
    expect(draftFromTryList(null)).toEqual([]);
  });
});

describe("TryListEditor", () => {
  it("is a collapsed 'Try list' section that says how many things it holds", async () => {
    render(<Harness initial={draftFromTryList(LIST)} />);
    expect(screen.getByText("Try list").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("2 things")).toBeInTheDocument();
  });

  it("adds an entry with the Add button or Enter, with no id", async () => {
    const user = userEvent.setup();
    render(<Harness initial={draftFromTryList(LIST)} />);
    await user.click(screen.getByText("Try list"));
    await user.type(screen.getByLabelText("New thing to try"), "Schäufele");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByLabelText("New thing to try"), "Glühwein{Enter}");
    expect(payload()).toEqual([
      { id: "e1", text: "Lebkuchen" },
      { id: "e2", text: "Drei im Weggla" },
      { text: "Schäufele" },
      { text: "Glühwein" },
    ]);
  });

  it("renames, removes and moves entries; a ticked one is marked Tried", async () => {
    const user = userEvent.setup();
    render(<Harness initial={draftFromTryList(LIST)} />);
    await user.click(screen.getByText("Try list"));
    expect(screen.getByText("Tried")).toBeInTheDocument();
    const second = screen.getByLabelText("Thing to try 2");
    await user.clear(second);
    await user.type(second, "Bratwurst");
    await user.click(screen.getByRole("button", { name: "Move Bratwurst up" }));
    expect(payload()).toEqual([{ id: "e2", text: "Bratwurst" }, { id: "e1", text: "Lebkuchen" }]);
    await user.click(screen.getByRole("button", { name: "Remove Lebkuchen" }));
    expect(payload()).toEqual([{ id: "e2", text: "Bratwurst" }]);
    expect(screen.getByRole("button", { name: "Move Bratwurst up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Bratwurst down" })).toBeDisabled();
  });

  it("stops adding at 30 and says so", async () => {
    const user = userEvent.setup();
    const thirty = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, text: `Thing ${i}`, tried: false }));
    render(<Harness initial={draftFromTryList(thirty)} />);
    await user.click(screen.getByText("Try list"));
    expect(screen.getByLabelText("New thing to try")).toBeDisabled();
    expect(screen.getByText("A Try list holds up to 30 things.")).toBeInTheDocument();
  });

  it("opens to show a server error", () => {
    render(<TryListEditor value={[]} onChange={() => {}} error="Keep each one to 80 characters" />);
    expect(screen.getByText("Try list").closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Keep each one to 80 characters")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**: `npx vitest run components/trip/try-list-editor.test.tsx` fails because the module doesn't resolve.

- [ ] **Step 3: Implement**

```tsx
// components/trip/try-list-editor.tsx
"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_TRY_ENTRIES, MAX_TRY_TEXT, type TryList } from "@/lib/try-list";
import type { TryEntryInput } from "@/lib/try-list-ops";

/**
 * CONTEXT.md "Try list" in the Item dialog: add, rename, remove and reorder
 * the things to try there. Ticking belongs to the Day view and Today, so this
 * never sends `tried`: a tick the partner made while the dialog was open
 * survives the save (server/actions/items.ts resolves ids under the row lock).
 */
export interface TryListDraftEntry {
  /** React key: the entry's id, or a local key for a new one. */
  key: string;
  id?: string;
  text: string;
  tried: boolean;
}

export function draftFromTryList(list: TryList | null | undefined): TryListDraftEntry[] {
  return (list ?? []).map((e) => ({ key: e.id, id: e.id, text: e.text, tried: e.tried }));
}

export function tryListPayload(draft: readonly TryListDraftEntry[]): TryEntryInput[] {
  return draft
    .map((e) => ({ ...(e.id !== undefined && { id: e.id }), text: e.text.trim() }))
    .filter((e) => e.text !== "");
}

export function TryListEditor({
  value,
  onChange,
  disabled,
  error,
}: {
  value: TryListDraftEntry[];
  onChange(next: TryListDraftEntry[]): void;
  disabled?: boolean;
  error?: string;
}) {
  // Controlled like OpeningHoursEditor: once open (or opened by an error) it stays open.
  const [open, setOpen] = React.useState(Boolean(error));
  const [seenError, setSeenError] = React.useState(error);
  if (error !== seenError) {
    setSeenError(error);
    if (error && !open) setOpen(true);
  }
  const [newText, setNewText] = React.useState("");
  const nextKey = React.useRef(0);
  const full = value.length >= MAX_TRY_ENTRIES;
  const count = tryListPayload(value).length;

  function add() {
    const text = newText.trim();
    if (!text || full) return;
    onChange([...value, { key: `new-${nextKey.current++}`, text, tried: false }]);
    setNewText("");
  }
  function rename(i: number, text: string) {
    onChange(value.map((e, j) => (j === i ? { ...e, text } : e)));
  }
  function remove(i: number) {
    onChange(value.filter((_, j) => j !== i));
  }
  function move(i: number, by: -1 | 1) {
    const next = [...value];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  }

  return (
    <details className="rounded-xl border-2 border-border-soft px-3 py-2" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="tap-target flex cursor-pointer flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-semibold">Try list</span>
        <span className="text-xs font-semibold text-muted-foreground">
          {count === 0 ? "Not set" : count === 1 ? "1 thing" : `${count} things`}
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Things to try, see or buy there. Tick them off on the day.</p>
        {value.length > 0 && (
          <ol className="flex flex-col gap-1.5">
            {value.map((entry, i) => {
              const name = entry.text.trim() || `thing ${i + 1}`;
              return (
                <li key={entry.key} className="flex min-w-0 items-center gap-1">
                  <Input
                    aria-label={`Thing to try ${i + 1}`}
                    value={entry.text}
                    maxLength={MAX_TRY_TEXT}
                    onChange={(e) => rename(i, e.target.value)}
                    disabled={disabled}
                    className="min-w-0 flex-1"
                  />
                  {entry.tried && <span className="shrink-0 text-xs font-semibold text-muted-foreground">Tried</span>}
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move ${name} up`} disabled={disabled || i === 0} onClick={() => move(i, -1)}>
                    <ChevronUp aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move ${name} down`} disabled={disabled || i === value.length - 1} onClick={() => move(i, 1)}>
                    <ChevronDown aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${name}`} disabled={disabled} onClick={() => remove(i)}>
                    <X aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
        <div className="flex min-w-0 items-center gap-1.5">
          <Input
            aria-label="New thing to try"
            placeholder="Add something to try, see or buy"
            value={newText}
            maxLength={MAX_TRY_TEXT}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault(); // never submits the Item dialog
                add();
              }
            }}
            disabled={disabled || full}
            className="min-w-0 flex-1"
          />
          <Button type="button" variant="secondary" size="sm" onClick={add} disabled={disabled || full || newText.trim() === ""}>
            <Plus aria-hidden="true" />
            Add
          </Button>
        </div>
        {full && <p className="text-xs text-muted-foreground">A Try list holds up to {MAX_TRY_ENTRIES} things.</p>}
        {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
      </div>
    </details>
  );
}
```
If the "Add" button's accessible name includes the icon, keep `aria-hidden` on it, as here, so the test's `{ name: "Add" }` matches. Check `components/ui/input.tsx` forwards `aria-label`/`maxLength`/`onKeyDown` (it spreads props). Use `FormError` instead of the raw `<p>` if the opening-hours editor does, for the same look.

- [ ] **Step 4: Run it, expect PASS**: `npx vitest run components/trip/try-list-editor.test.tsx lib/client-zod.guard.test.ts test/copy-style.test.ts`.
- [ ] **Step 5: Task-done check**: `npx vitest related --run components/trip/try-list-editor.tsx` + `npx tsc --noEmit` + `npx eslint components/trip/try-list-editor.tsx components/trip/try-list-editor.test.tsx`.
- [ ] **Step 6: Commit**: the message is `feat(try-list): the dialog's Try list editor`.

---

### Task T.9: The Item dialog edits the Try list

**Files:**
- Modify: `components/trip/item-form-dialog.tsx`:
  - imports (lines 39-41): add `TryListEditor`, `draftFromTryList`, `tryListPayload`
  - state, after the opening-hours state (lines 571-575)
  - `useFormDirty` (line 587)
  - the `submit` (lines 631-633)
  - the editor itself, after the Opening hours block (lines 897-906), inside the same `!onSubmitOverride` guard
- Test: `components/trip/item-form-dialog.test.tsx` (extend: a new `describe("Try list (R6)")` after `describe("Opening hours (R4)")` at line 1519, plus one case in the Proposal-mode describe near line 1374)

**Interfaces:**
- Consumes: T.8's editor and helpers; T.7's `ItemCardItem.tryList`; T.3's `updateItem`/`createItem` accepting `tryList`.
- Produces: an edit sends `tryList` only when the editor changed it. It sends `null` when every entry was removed, and otherwise `TryEntryInput[]` with ids and no ticks. A create sends it only when non-empty. `ITEM_CLEARABLE` and `buildInput()` are unchanged, so a Booking-import Proposal never carries one.

- [ ] **Step 1: Write the failing tests**

```tsx
describe("Try list (R6)", () => {
  beforeEach(() => vi.clearAllMocks());
  const LIST = [
    { id: "e1", text: "Lebkuchen", tried: true },
    { id: "e2", text: "Drei im Weggla", tried: false },
  ];

  it("an edit that leaves the list alone sends no tryList", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, tryList: LIST }} />);
    await user.type(screen.getByLabelText(/notes/i), "x");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).not.toHaveProperty("tryList");
  });

  it("adding an entry sends the list by id, without ticks, the new one without an id", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, tryList: LIST }} />);
    await user.click(screen.getByText("Try list"));
    await user.type(screen.getByLabelText("New thing to try"), "Schäufele{Enter}");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).toHaveProperty("tryList", [
      { id: "e1", text: "Lebkuchen" },
      { id: "e2", text: "Drei im Weggla" },
      { text: "Schäufele" },
    ]);
  });

  it("removing every entry sends null", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, tryList: LIST }} />);
    await user.click(screen.getByText("Try list"));
    await user.click(screen.getByRole("button", { name: "Remove Lebkuchen" }));
    await user.click(screen.getByRole("button", { name: "Remove Drei im Weggla" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).toHaveProperty("tryList", null);
  });

  it("a create with entries sends them; without, sends none", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ItemFormDialog {...baseProps} />);
    await user.type(screen.getByLabelText(/title/i), "Christkindlesmarkt");
    await user.click(screen.getByText("Try list"));
    await user.type(screen.getByLabelText("New thing to try"), "Glühwein{Enter}");
    await user.click(screen.getByRole("button", { name: /add item/i }));
    await waitFor(() => expect(createItem).toHaveBeenCalled());
    expect(vi.mocked(createItem).mock.calls[0][1]).toHaveProperty("tryList", [{ text: "Glühwein" }]);
    unmount();
    vi.mocked(createItem).mockClear();
    render(<ItemFormDialog {...baseProps} />);
    await user.type(screen.getByLabelText(/title/i), "Walk");
    await user.click(screen.getByRole("button", { name: /add item/i }));
    await waitFor(() => expect(createItem).toHaveBeenCalled());
    expect(vi.mocked(createItem).mock.calls[0][1]).not.toHaveProperty("tryList");
  });

  it("shows the server's Try list error in the editor", async () => {
    vi.mocked(updateItem).mockResolvedValueOnce({ success: false, errors: { tryList: ["A Try list holds up to 30 things"] } });
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, tryList: LIST }} />);
    await user.click(screen.getByText("Try list"));
    await user.type(screen.getByLabelText("New thing to try"), "One more{Enter}");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText("A Try list holds up to 30 things")).toBeInTheDocument();
  });
});
```
In the Proposal-mode describe (beside the "has no Opening hours editor" case at line 1374), using the same render as that case:
```tsx
  it("has no Try list editor: buildInput() never carries one", () => {
    // render exactly as the "has no Opening hours editor" case does
    expect(screen.queryByText("Try list")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it, expect FAIL**: `npx vitest run components/trip/item-form-dialog.test.tsx` fails because there is no "Try list" section.

- [ ] **Step 3: Implement**

```tsx
// imports
import { TryListEditor, draftFromTryList, tryListPayload } from "@/components/trip/try-list-editor";

// state, after the opening-hours state:
  // CONTEXT.md "Try list": sent only when changed, like the hours, so an edit
  // that never loaded it can't wipe it. Ids, never ticks: a tick made while
  // the dialog is open survives the save.
  const [tryDraft, setTryDraft] = React.useState(() => draftFromTryList(item?.tryList));
  const [initialTryList] = React.useState(() => JSON.stringify(tryListPayload(draftFromTryList(item?.tryList))));
  const tryList = tryListPayload(tryDraft);
  const tryListChanged = JSON.stringify(tryList) !== initialTryList;

// useFormDirty: add `tryList` to the watched object (after openingHours).

// submit:
      return isEdit && item
        ? updateItem(item.id, {
            ...toPatch(input, ITEM_CLEARABLE),
            ...(openingHoursChanged && { openingHours }),
            ...(tryListChanged && { tryList: tryList.length > 0 ? tryList : null }),
          })
        : createItem(tripId, { ...input, ...(openingHours && { openingHours }), ...(tryList.length > 0 && { tryList }) }, forkId ?? undefined);

// inside the existing {!onSubmitOverride && (...)} block, after the OpeningHoursEditor's div
// (wrap both in a fragment):
        <div className="sm:col-span-2">
          <TryListEditor value={tryDraft} onChange={setTryDraft} disabled={isPending} error={errors.tryList?.[0]} />
        </div>
```
Extend the comment above that block: "…and the Try list, for the same reason."

- [ ] **Step 4: Run it, expect PASS**: `npx vitest run components/trip/item-form-dialog.test.tsx lib/client-zod.guard.test.ts test/copy-style.test.ts`.
- [ ] **Step 5: Task-done check**: `npx vitest related --run components/trip/item-form-dialog.tsx` + `npx tsc --noEmit` + `npx eslint components/trip/item-form-dialog.tsx components/trip/item-form-dialog.test.tsx`.
- [ ] **Step 6: Commit**: the message is `feat(item-dialog): edit a thing's Try list`.

---

### Task T.10: Tickable Try list (optimistic, rolled back on failure)

**Files:**
- Create: `components/trip/try-list-ticks.tsx`
- Test: `components/trip/try-list-ticks.test.tsx`

**Interfaces:**
- Consumes: T.4's `tickTryEntry`; T.1's `triedLabel`; `Checkbox` (`components/ui/checkbox.tsx`); `toastRefused`, `toastRejected` (`components/ui/action-failure`).
- Produces: `TryListTicks({ itemId: string; itemTitle: string; list: TryList })`. This client component renders the "Try list · 2/5 tried" heading and one labelled checkbox per entry. A tick shows at once and reverts to the server's answer when the action settles, as `Checklist` does (`components/trip/checklist.tsx:658-674`).

- [ ] **Step 1: Write the failing test**

```tsx
// components/trip/try-list-ticks.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/items", () => ({ tickTryEntry: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { tickTryEntry } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import { TryListTicks } from "./try-list-ticks";

const LIST = [
  { id: "e1", text: "Lebkuchen", tried: false },
  { id: "e2", text: "Drei im Weggla", tried: false },
];

describe("TryListTicks (CONTEXT.md Try list, ticked on the day)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("labels each checkbox with its entry and names the list after its Item", () => {
    render(<TryListTicks itemId="i1" itemTitle="Christkindlesmarkt" list={LIST} />);
    expect(screen.getByRole("list", { name: "Try list for Christkindlesmarkt" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Lebkuchen" })).not.toBeChecked();
    expect(screen.getByText("Try list · 0/2 tried")).toBeInTheDocument();
  });

  it("a tick calls tickTryEntry with the entry and the new state", async () => {
    const user = userEvent.setup();
    render(<TryListTicks itemId="i1" itemTitle="Christkindlesmarkt" list={LIST} />);
    await user.click(screen.getByRole("checkbox", { name: "Drei im Weggla" }));
    expect(tickTryEntry).toHaveBeenCalledWith("i1", "e2", true);
  });

  it("ticks at once, and rolls back with a toast when the server refuses", async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(tickTryEntry).mockImplementationOnce(() => new Promise((r) => (resolve = r)) as never);
    const user = userEvent.setup();
    render(<TryListTicks itemId="i1" itemTitle="Christkindlesmarkt" list={LIST} />);
    const box = screen.getByRole("checkbox", { name: "Lebkuchen" });
    await user.click(box);
    expect(box).toBeChecked();
    expect(screen.getByText("Try list · 1/2 tried")).toBeInTheDocument();
    await act(async () => resolve({ success: false, errors: { tryList: ["That one is no longer on the list."] } }));
    expect(box).not.toBeChecked();
    expect(screen.getByText("Try list · 0/2 tried")).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "That one is no longer on the list." });
  });

  it("rolls back with a toast when the action rejects", async () => {
    vi.mocked(tickTryEntry).mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<TryListTicks itemId="i1" itemTitle="Christkindlesmarkt" list={LIST} />);
    const box = screen.getByRole("checkbox", { name: "Lebkuchen" });
    await user.click(box);
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(box).not.toBeChecked();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**: `npx vitest run components/trip/try-list-ticks.test.tsx` fails because the module doesn't resolve.

- [ ] **Step 3: Implement**

```tsx
// components/trip/try-list-ticks.tsx
"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
import { tickTryEntry } from "@/server/actions/items";
import { triedLabel } from "@/lib/try-list-ops";
import type { TryList } from "@/lib/try-list";

/**
 * CONTEXT.md "Try list" on the Day view and Today: tick things off as you go.
 * Shared by everyone on the Trip, so a tick shows for both. Like the
 * Checklist (spec 2026-10-06 §W) a tick shows at once and reverts to the
 * server's answer when the action settles, so a refusal rolls it back.
 */
export function TryListTicks({ itemId, itemTitle, list }: { itemId: string; itemTitle: string; list: TryList }) {
  const [shown, setShown] = React.useOptimistic(list, (state, u: { id: string; tried: boolean }) =>
    state.map((e) => (e.id === u.id ? { ...e, tried: u.tried } : e)),
  );

  function tick(id: string, tried: boolean) {
    React.startTransition(async () => {
      setShown({ id, tried });
      try {
        const r = await tickTryEntry(itemId, id, tried);
        if (!r.success) toastRefused(r.errors, "Couldn't tick that.");
      } catch {
        toastRejected("Couldn't tick that.");
      }
    });
  }

  return (
    <div data-slot="try-list" className="mt-1.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Try list · {triedLabel(shown)}</p>
      <ul aria-label={`Try list for ${itemTitle}`} className="flex flex-col">
        {shown.map((e) => (
          <li key={e.id}>
            <Checkbox label={e.text} checked={e.tried} onChange={(ev) => tick(e.id, ev.target.checked)} className="text-sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}
```
Note on rollback: when `tickTryEntry` succeeds, its `revalidateTrip` makes the page send fresh props, so `list` already holds the tick when the optimistic state is dropped. When it fails, `list` is unchanged, so the box returns to the server's state.

- [ ] **Step 4: Run it, expect PASS**: `npx vitest run components/trip/try-list-ticks.test.tsx lib/client-zod.guard.test.ts test/copy-style.test.ts`.
- [ ] **Step 5: Task-done check**: `npx vitest related --run components/trip/try-list-ticks.tsx` + `npx tsc --noEmit` + `npx eslint components/trip/try-list-ticks.tsx components/trip/try-list-ticks.test.tsx`.
- [ ] **Step 6: Commit**: the message is `feat(try-list): tick things off, at once, rolled back if refused`.

---

### Task T.11: The Timeline shows "2/5 tried", and ticks on the Day view and Today

**Files:**
- Modify: `components/trip/timeline.tsx`:
  - imports (lines 36-41): `TryListTicks` from `@/components/trip/try-list-ticks`; `triedLabel` from `@/lib/try-list-ops`
  - `Timeline`'s two item-row call sites (lines 182-193 `TimedItemRow`, 206-216 `UntimedItemRow`): pass `tickable={isDay}`
  - `TimedItemRow` (lines 433-468) and `UntimedItemRow` (lines 470-502): take `tickable?: boolean` and pass it to `DayItemBody`
  - `DayItemBody` (lines 574-641): the count in the facts line when not tickable; the `TryListTicks` block when tickable
- Modify: `components/trip/timeline.test.tsx:16-20`: add `tickTryEntry: vi.fn()` to the `@/server/actions/items` mock.
- Verify only (no edit): the three `variant="day"` call sites are `components/trip/day/day-plan-card.tsx:57`, `components/trip/home/phase-travelling.tsx:174` and `:388`. They feed `DayPlan`s built by `buildDayModel` (T.6), so they get ticking with no edit. `components/trip/agenda-view.tsx:85` (`variant="agenda"`) gets the count only, and today reads no `tryList`.
- Test: `components/trip/timeline.test.tsx` (extend)

**Interfaces:**
- Consumes: T.6's `ItineraryItem.tryList`; T.10's `TryListTicks`; T.1's `triedLabel`.
- Produces:
  - Every Timeline item row whose Item has a Try list shows its count.
  - `variant="day"` rows (the Day page, Today on phone and desktop) show the tickable list, with the count in its heading.
  - A Surprise placeholder shows neither (its `tryList` is null, and the body also skips it).

- [ ] **Step 1: Write the failing tests** (append to `components/trip/timeline.test.tsx`):
```tsx
describe("Try list on the Timeline (CONTEXT.md Try list)", () => {
  const LIST = [
    { id: "e1", text: "Lebkuchen", tried: true },
    { id: "e2", text: "Drei im Weggla", tried: true },
    { id: "e3", text: "Schäufele", tried: false },
    { id: "e4", text: "Rauchbier", tried: false },
    { id: "e5", text: "Glühwein", tried: false },
  ];
  const withList: DayPlan = {
    ...dayPlan,
    timedItems: [{ kind: "item", item: { ...dayPlan.timedItems[0]!.item, tryList: LIST } }],
  };

  it("the agenda shows '2/5 tried' and no checkboxes", () => {
    render(<Timeline day={withList} variant="agenda" />);
    expect(screen.getByText("2/5 tried")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("the Day variant lists every entry as a labelled checkbox under its count", () => {
    render(<Timeline day={withList} variant="day" />);
    expect(screen.getByText("Try list · 2/5 tried")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: `Try list for ${ITEM_TITLE}` });
    expect(within(list).getAllByRole("checkbox")).toHaveLength(5);
    expect(within(list).getByRole("checkbox", { name: "Lebkuchen" })).toBeChecked();
  });

  it("an Item with no list, or an empty one, shows nothing", () => {
    const empty: DayPlan = { ...dayPlan, timedItems: [{ kind: "item", item: { ...dayPlan.timedItems[0]!.item, tryList: [] } }] };
    render(<Timeline day={empty} variant="day" />);
    expect(screen.queryByText(/tried/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("a Surprise placeholder never shows one", () => {
    const placeholder: DayPlan = {
      ...dayPlan,
      timedItems: [{
        kind: "item",
        item: { ...dayPlan.timedItems[0]!.item, title: "Surprise", tryList: LIST, surprise: { youAreSurprised: true } as never },
      }],
    };
    render(<Timeline day={placeholder} variant="day" />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/tried/)).toBeNull();
  });
});
```
(The placeholder case is a belt-and-braces render check. In production the placeholder's `tryList` is already null, per S and T.6. Use the `SurpriseView` fixture shape this file already uses for `SurpriseBadge`, if it has one.)

- [ ] **Step 2: Run it, expect FAIL**: `npx vitest run components/trip/timeline.test.tsx` fails because there is no "2/5 tried" and no checkboxes.

- [ ] **Step 3: Implement** (`components/trip/timeline.tsx`)
- `Timeline`: on both item-row call sites, add `tickable={isDay}`.
- `TimedItemRow` / `UntimedItemRow`: add `tickable?: boolean` to the destructured props and their type, and pass `tickable={tickable}` to `DayItemBody`.
- `DayItemBody`: add `tickable?: boolean` to its props, then:
```tsx
  // CONTEXT.md "Try list": the count everywhere; the Day view and Today tick it.
  const tryList = placeholder ? null : (item.tryList ?? null);
  const tryCount = triedLabel(tryList);
```
  In the facts line, after `<OpeningHoursLine … />`:
```tsx
        {tryCount && !tickable && <span className="tabular-nums">{tryCount}</span>}
```
  After the photo block and before `<AttachmentLinks attachments={attachments} />`:
```tsx
      {tryCount && tickable && tryList && <TryListTicks itemId={item.id} itemTitle={item.title} list={tryList} />}
```
- `components/trip/timeline.test.tsx`: add `tickTryEntry: vi.fn(),` to the `@/server/actions/items` mock.
- Other tests that render `Timeline` with the actions module mocked (`grep -rln "vi.mock(\"@/server/actions/items\"" components | xargs grep -l "Timeline\|DayPlanCard\|PhaseTravelling"`): add `tickTryEntry: vi.fn()` to each mock, so a render that reaches `TryListTicks` finds the export. Keep their assertions.

- [ ] **Step 4: Run it, expect PASS**: `npx vitest run components/trip/timeline.test.tsx components/trip/day components/trip/home test/copy-style.test.ts`.
- [ ] **Step 5: Task-done check**: `npx vitest related --run components/trip/timeline.tsx` + `npx tsc --noEmit` + `npx eslint components/trip/timeline.tsx components/trip/timeline.test.tsx` (plus any test file whose mock was extended).
- [ ] **Step 6: Commit**: the message is `feat(timeline): "2/5 tried", and tick the Try list on the Day view and Today`.

---

### Task T.12: Claude reads the Try list (get_item, get_trip_plan, get_stop, get_day agree)

**Files:**
- Modify: `lib/mcp/reads/plan-shapes.ts`:
  - imports (line 13): `withTryList` from `@/lib/try-list-stored`; `parseTryList` from `@/lib/validations/try-list`; `type TryList` from `@/lib/try-list`
  - `McpThingToDo` (lines 72-73) and `McpDayItem` (lines 98-99): add `tryList: TryList | null`
  - `MCP_THING_TO_DO_SELECT` (lines 240-245): add `tryList: true`, so `MCP_DATED_ITEM_SELECT` inherits it
  - `McpItemRow` (lines 280-288): add `tryList: string | null`
  - `toMcpThingToDo` (lines 334-340): `tryList: parseTryList(i.tryList)`
  - `toMcpDayItem` (lines 343-353): `tryList: i.tryList ?? null`
  - `DatedItem` (line 366): `Omit<McpItemRow, "openingHours" | "tryList"> & { openingHours: OpeningHours | null; tryList: TryList | null; surprise: … }`
  - `withPlaceholders` (lines 382-398): scheduled rows `...withTryList(withOpeningHours(i))`; placeholder literal `tryList: p.tryList,`
- Modify: `lib/mcp/reads/entities.ts:62`: `{ ...withTryList(withOpeningHours(row)), surprise: … }`.
- Modify (fixtures and expected literals; add `tryList: null`, keep every assertion):
  - `lib/mcp/reads/plan-shapes.test.ts:22-26` (`item()`), `:33` (`datedItem` becomes `withTryList(withOpeningHours(item(o)))`), `:97` (placeholder), `:151` (expected `toMcpItem`)
  - `lib/mcp/reads/entities.test.ts:78`
  - `lib/mcp/reads/trip-plan.test.ts:221,248,773`
  - `lib/mcp/reads/day.test.ts:25`, if T.6 didn't already
- Modify: `lib/mcp/tools/reads.ts:208,232,267` (descriptions of `get_trip_plan`, `get_item`, `get_day`).
- Test: `lib/mcp/reads/plan-shapes.test.ts` (extend), `test/integration/mcp-narrow-reads.test.ts` (extend)

**Interfaces:**
- Consumes: T.6's `withTryList`, `ItineraryItem.tryList` (get_day's items come through `buildDayModel`); T.7's `StopDayItem.tryList`; S's `parseTryList`, `PlaceholderItem.tryList: null`.
- Produces: `tryList: TryList | null` (`[{ id, text, tried }]`, the same shape `set_try_list` takes) on every thing to do and day item in get_trip_plan, get_stop, get_item, get_day, and on every write's read-back.

- [ ] **Step 1: Write the failing tests**

`lib/mcp/reads/plan-shapes.test.ts`:
```ts
import { withTryList } from "@/lib/try-list-stored";

describe("Try list (CONTEXT.md Try list)", () => {
  const list = [{ id: "e1", text: "Francesinha", tried: true }];

  it("a thing to do and a day item read the stored list; an unreadable one reads as none", () => {
    const { stops } = buildMcpStops({
      stops: [stop()],
      thingsToDo: [item({ id: "t1", stopId: "s1", tryList: JSON.stringify(list) })],
      datedItems: [datedItem({ id: "d1", date: "2027-06-02", tryList: "nope" })],
      dayTitles: new Map(), hiddenStopIds: new Set(), itemView: () => null, filesFor: noFiles,
      stopNameById: new Map(),
    });
    expect(stops[0].thingsToDo[0].tryList).toEqual(list);
    expect(stops[0].days.find((d) => d.date === "2027-06-02")!.items[0].tryList).toBeNull();
  });

  it("toMcpItem carries it; a hidden Surprise's placeholder never does", () => {
    expect(toMcpItem(datedItem({ id: "i1", date: "2027-06-02", tryList: JSON.stringify(list) }), noFiles, new Map()).tryList).toEqual(list);
    const out = withPlaceholders([], { placeholderItems: [placeholder()], views: { stops: new Map(), items: new Map() } });
    expect(out[0].tryList).toBeNull();
  });
});
```
`test/integration/mcp-narrow-reads.test.ts`, beside the opening-hours case (line 190):
```ts
  it("get_item, get_trip_plan and get_day read a thing's Try list; a hidden Surprise's never leaves", async () => {
    const list = [{ id: "it-e1", text: "IT Tawny 20 years", tried: false }];
    await db.item.update({ where: { id: TOUR }, data: { tryList: JSON.stringify(list) } });
    await db.item.update({ where: { id: TASTING }, data: { tryList: JSON.stringify(list) } });
    await db.item.update({ where: { id: GIFT }, data: { tryList: JSON.stringify([{ id: "it-g1", text: "IT gift-dinner cake", tried: false }]) } });

    const plan = await as(OWNER)(() => loadTripPlanForMcp(TRIP_ID));
    const porto = plan.stops.find((s) => s.id === PORTO)!;
    expect(porto.days.find((d) => d.date === "2027-06-02")!.items.find((i) => i.id === TOUR)!.tryList).toEqual(list);
    expect(porto.thingsToDo.find((t) => t.id === TASTING)!.tryList).toEqual(list);
    expect((await as(OWNER)(() => loadItemForMcp(TOUR))).tryList).toEqual(list);
    const day = await as(OWNER)(() => loadDayForMcp(TRIP_ID, "2027-06-02"));
    if ("success" in day) throw new Error("expected a day");
    expect(day.timeline).toContainEqual(expect.objectContaining({ kind: "item", item: expect.objectContaining({ id: TOUR, tryList: list }) }));

    const memberPlan = await as(MEMBER)(() => loadTripPlanForMcp(TRIP_ID));
    const memberDay = await as(MEMBER)(() => loadDayForMcp(TRIP_ID, "2027-06-03"));
    expect(JSON.stringify([memberPlan, memberDay])).not.toContain("gift-dinner cake");
  });
```
(Match the timeline-entry shape to the opening-hours case in the same file. If it asserts differently, copy its form.)

- [ ] **Step 2: Run them, expect FAIL**: `npx vitest run lib/mcp/reads/plan-shapes.test.ts`, and `npm run test:integration -- test/integration/mcp-narrow-reads.test.ts`. `tryList` is undefined.

- [ ] **Step 3: Implement** the edits under Files. The doc comment on both shapes' field: `/** CONTEXT.md "Try list": [{ id, text, tried }] in order, the same shape set_try_list takes; null = none. */`.

Descriptions in `lib/mcp/tools/reads.ts`:
- `get_trip_plan` (line 208): after "Each thing's openingHours (same shape as set_opening_hours) is null when not known.", add " Each thing's tryList is its Try list (things to try, see or buy there, each with an id and whether it's been tried; null when it has none)."
- `get_item` (line 232): after "its openingHours (…; null when not known),", add " its tryList (each entry's id, text and tried; change it with set_try_list or tick_try_entry),".
- `get_day` (line 267): after "and its openingHours (same shape as set_opening_hours)", add " and its tryList".

- [ ] **Step 4: Run them, expect PASS**:
  - `npx vitest run lib/mcp/reads/ lib/mcp/tools/reads.test.ts`
  - the integration file
- [ ] **Step 5: Task-done check**:
  - `npx vitest related --run lib/mcp/reads/plan-shapes.ts lib/mcp/reads/entities.ts lib/mcp/tools/reads.ts`
  - `npx tsc --noEmit`
  - `npx eslint` on the changed files
  - `npm run test:integration -- test/integration/mcp-narrow-reads.test.ts`
- [ ] **Step 6: Commit**: the message is `feat(mcp): get_trip_plan, get_stop, get_item and get_day read the Try list`.

---

### Task T.13: `set_try_list` and `tick_try_entry` for Claude (closes `cmvaig9lq`)

**Files:**
- Modify: `lib/mcp/tools/plan-write.ts`:
  - header comment (lines 8-9): add a sentence for the two tools
  - imports (lines 36-45): add `setTryList`, `tickTryEntry`; `import { tryListInputSchema } from "@/lib/validations/try-list";`
  - register both tools directly after `set_opening_hours` (it ends at line 214)
- Modify: `lib/mcp/tools/write-returns.test.ts`:
  - the `@/server/actions/items` mock (lines 30-33): add `setTryList: ok(), tickTryEntry: ok()`
  - `ARGS` (after line 119): add `set_try_list: { itemId: "item-1", entries: [] }` and `tick_try_entry: { itemId: "item-1", entryId: "e1" }`
- Modify: `lib/mcp/tools/plan-write.test.ts`:
  - the hoisted mocks and the `@/server/actions/items` mock (lines 1-66): add `setTryList`, `tickTryEntry`
  - the tool list (after line 175): add `"set_try_list"`, `"tick_try_entry"`
- Test: `lib/mcp/tools/plan-write.test.ts` (extend: `describe("set_try_list and tick_try_entry (R6)")` after `describe("set_opening_hours (R4)")`, line 289)

**Interfaces:**
- Consumes: T.3's `setTryList`; T.4's `tickTryEntry`; T.2's `tryListInputSchema`; T.12's `loadItemForMcp` with `tryList`; `requireRealPlanRow` (`lib/mcp/real-plan.ts`); `runWrite` (`lib/mcp/run-tool.ts`).
- Produces:
  - MCP tool `set_try_list({ itemId: string, entries: { id?: string; text: string; tried?: boolean }[] })` returns `{ item }` (get_item's shape). `entries: []` clears the list.
  - MCP tool `tick_try_entry({ itemId: string, entryId: string, tried?: boolean })`. `tried` defaults to `true`. It returns `{ item }`.

- [ ] **Step 1: Write the failing tests**

```ts
  describe("set_try_list and tick_try_entry (R6)", () => {
    const LIST = [{ id: "e1", text: "Lebkuchen", tried: true }];

    it("set_try_list checks the real plan, saves through setTryList, and returns the item", async () => {
      setTryList.mockResolvedValue({ success: true });
      loadItemForMcp.mockResolvedValue({ id: ITEM_ID, tryList: LIST });
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "set_try_list",
        arguments: { itemId: ITEM_ID, entries: [{ id: "e1", text: "Lebkuchen" }, { text: "Schäufele", tried: false }] },
      });
      expect(r.isError).toBeFalsy();
      expect(itemFindUnique).toHaveBeenCalledWith({ where: { id: ITEM_ID, forkId: null }, select: { tripId: true } });
      expect(setTryList).toHaveBeenCalledWith(ITEM_ID, [{ id: "e1", text: "Lebkuchen" }, { text: "Schäufele", tried: false }]);
      expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ item: { id: ITEM_ID, tryList: LIST } });
    });

    it("set_try_list with no entries clears the list", async () => {
      setTryList.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "set_try_list", arguments: { itemId: ITEM_ID, entries: [] } });
      expect(setTryList).toHaveBeenCalledWith(ITEM_ID, []);
    });

    it("set_try_list refuses a repeated id or 31 entries before calling anything", async () => {
      const c = await connectTestClient();
      const dup = await c.callTool({ name: "set_try_list", arguments: { itemId: ITEM_ID, entries: [{ id: "e1", text: "A" }, { id: "e1", text: "B" }] } });
      expect(dup.isError).toBe(true);
      const many = await c.callTool({ name: "set_try_list", arguments: { itemId: ITEM_ID, entries: Array.from({ length: 31 }, (_, i) => ({ text: `T${i}` })) } });
      expect(many.isError).toBe(true);
      expect(setTryList).not.toHaveBeenCalled();
    });

    it("tick_try_entry ticks by default, unticks with tried: false, and returns the item", async () => {
      tickTryEntry.mockResolvedValue({ success: true });
      loadItemForMcp.mockResolvedValue({ id: ITEM_ID, tryList: LIST });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "tick_try_entry", arguments: { itemId: ITEM_ID, entryId: "e1" } });
      expect(tickTryEntry).toHaveBeenCalledWith(ITEM_ID, "e1", true);
      expect(JSON.parse((r.content as { text: string }[])[0].text)).toEqual({ item: { id: ITEM_ID, tryList: LIST } });
      await c.callTool({ name: "tick_try_entry", arguments: { itemId: ITEM_ID, entryId: "e1", tried: false } });
      expect(tickTryEntry).toHaveBeenLastCalledWith(ITEM_ID, "e1", false);
    });

    it("tick_try_entry on an entry that is gone reports the action's message", async () => {
      tickTryEntry.mockResolvedValue({ success: false, errors: { tryList: ["That one is no longer on the list."] } });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "tick_try_entry", arguments: { itemId: ITEM_ID, entryId: "gone" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toContain("That one is no longer on the list.");
    });

    it("both, on a Fork's row, are not found and write nothing", async () => {
      itemFindUnique.mockResolvedValue(null);
      const c = await connectTestClient();
      for (const [name, args] of [
        ["set_try_list", { itemId: ITEM_ID, entries: [] }],
        ["tick_try_entry", { itemId: ITEM_ID, entryId: "e1" }],
      ] as const) {
        const r = await c.callTool({ name, arguments: args });
        expect(r.isError).toBe(true);
        expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      }
      expect(setTryList).not.toHaveBeenCalled();
      expect(tickTryEntry).not.toHaveBeenCalled();
    });
  });
```
(The "gone" case relies on `runWrite`'s failure text carrying the action's first field message, as the existing refusal cases in this file assert. If `runWrite` formats it differently, assert the same way those cases do.)

- [ ] **Step 2: Run them, expect FAIL**: `npx vitest run lib/mcp/tools/plan-write.test.ts lib/mcp/tools/write-returns.test.ts`. The tools are unknown, and `ARGS` doesn't match the registered tools.

- [ ] **Step 3: Implement** (`lib/mcp/tools/plan-write.ts`)

Header, after the `set_opening_hours` sentence: "`set_try_list` replaces a thing's Try list and `tick_try_entry` ticks one entry (CONTEXT.md Try list, shared by an idea and its placed copies)."

After `set_opening_hours`:
```ts
  server.registerTool(
    "set_try_list",
    {
      title: "Set Try list",
      description:
        "Replaces a thing to do's Try list: the small list of things to try, see or buy while there (\"Drei im Weggla, Feuerzangenbowle, Lebkuchen\"). " +
        "Pass every entry to keep, in order; an entry left out is removed. " +
        "Give an entry its id (from get_item's tryList) to keep it and its tick; leave id out for a new entry. " +
        "tried sets the tick; left out, an existing entry keeps its tick and a new one starts untried. " +
        "Up to 30 entries, each 1 to 80 characters. Pass entries: [] to clear the list. " +
        "The list belongs to the place, so the Wishlist idea and every copy placed from it get it too. It is not a Checklist.",
      inputSchema: {
        itemId: z.string(),
        entries: tryListInputSchema.describe("The whole list, in order: { id?, text, tried? } each."),
      },
    },
    ({ itemId, entries }) =>
      runWrite(
        "set_try_list",
        async () => {
          await requireRealPlanRow("item", itemId);
          return setTryList(itemId, entries);
        },
        async () => ({ item: await loadItemForMcp(itemId) }),
      ),
  );

  server.registerTool(
    "tick_try_entry",
    {
      title: "Tick Try list entry",
      description:
        "Ticks one entry of a thing to do's Try list as tried, by the entry's id from get_item's tryList; tried: false unticks it. " +
        "Everyone on the trip sees the tick, on the thing and on every copy of it.",
      inputSchema: {
        itemId: z.string(),
        entryId: z.string(),
        tried: z.boolean().optional().describe("true (the default) ticks it; false unticks it."),
      },
    },
    ({ itemId, entryId, tried }) =>
      runWrite(
        "tick_try_entry",
        async () => {
          await requireRealPlanRow("item", itemId);
          return tickTryEntry(itemId, entryId, tried ?? true);
        },
        async () => ({ item: await loadItemForMcp(itemId) }),
      ),
  );
```
If the MCP SDK cannot turn a refined array (`tryListInputSchema` carries `.refine`) into an input property, the "registers every write tool" test fails on listing. In that case pass `tryListInputSchema` as is for validation; the SDK in this repo takes zod 4 shapes, as `openingHoursSchema` (also refined) already does for `set_opening_hours`.

`write-returns.test.ts` and `plan-write.test.ts`: the mock and list edits under Files.

- [ ] **Step 4: Run them, expect PASS**: `npx vitest run lib/mcp/tools/ test/copy-style.test.ts`.
- [ ] **Step 5: Task-done check**: `npx vitest related --run lib/mcp/tools/plan-write.ts` + `npx tsc --noEmit` + `npx eslint lib/mcp/tools/plan-write.ts lib/mcp/tools/plan-write.test.ts lib/mcp/tools/write-returns.test.ts`.
- [ ] **Step 6: Commit**: the three files, with the message:

```
feat(mcp): set_try_list and tick_try_entry, returning the item

Resolves-Feedback: cmvaig9lq000v07gwt50bn7k0
```
(The assembler appends the session's attribution lines after the trailer, per Global Constraints.)

---

## Task Z: Branch 2 gate, and the spec says what was built

**Files:**
- `docs/specs/2026-10-17-planning-model-and-review.md`: add a Branch 2 "As built" section and update the status line.
- `docs/open-follow-ups.md`: add the follow-ups that the section Notes name.

- [ ] **Step 1: The gate.** Run each check below. Fix any failure in its own `fix(...)` commit that names the task it came from.
  - `npm test`
  - `npx tsc --noEmit`
  - `npx eslint .` (0 errors)
  - `npm run knip`
  - The integration tier against the sandbox Postgres: `npx prisma migrate deploy`, then `npm run test:integration`, with the localhost URLs exported.
  - `npm run build` in a throwaway copy. Make the copy with `git archive HEAD` plus a copied `node_modules` (not symlinked) and a hand-written localhost-only `.env`. Delete the copy afterwards.
- [ ] **Step 2: As built.** Add a "Branch 2: as built (date)" section to the spec. Give one line per decision from the S, F and T Notes, and one per deviation an implementer reported. Call out what a Traveller sees:
  - the six new Flags on Summary, the badge and Next steps;
  - Item Flags open that Item's day;
  - Try lists in the Item dialog;
  - ticking on Day and Today;
  - "2/5 tried" on the Timeline.
- [ ] **Step 3: Status line.** Set it to say Branch 2 is built on `feat/plan-flags-try-lists`, awaiting Cam's review, merge and deploy, and that `cmvaig9lq000v07gwt50bn7k0` is resolved on deploy.
- [ ] **Step 4: Commit.** Use the message `docs: flags and try lists (Branch 2) built, as-built notes, follow-ups`.
