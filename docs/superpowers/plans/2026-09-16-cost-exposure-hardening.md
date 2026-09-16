# Cost-Exposure Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four unbounded-spend paths found in the 2026-09-16 security review — an uncapped user-text→LLM call, an expensive default model, an FX cache that never caches, and an unbounded global table scan in the cron.

**Architecture:** Four independent, behaviour-preserving changes. No schema migration, no new dependencies, no new infrastructure. Each task bounds one resource at the point where the unbounded value enters the system: a length check before the LLM call, a cheaper model constant, a freshness short-circuit before the network fetch, and a date-window predicate pushed into SQL.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 + Neon Postgres, `@anthropic-ai/sdk`, Vitest + Testing Library.

## Global Constraints

- Work on branch `fix/cost-exposure-hardening`. Never commit to `main`.
- No Prisma migration. No new npm dependencies.
- Auth ordering is load-bearing: `requireTripAccess` / `requireUser` must stay the **first** statement in any route or action. Never add a validation check above an auth check.
- The client is untrusted. Any client-side limit (e.g. a `maxLength` attribute) is a UX affordance only; the server check is the enforcement.
- Model IDs are exact strings with no date suffix: `claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-4-8`.
- Run `npm run test` before every commit. Run `npm run lint` before the final commit.

## Deliberately out of scope

- **Per-user AI quota.** Considered and declined — it needs an `AiUsage` table and migration. The length cap bounds per-call cost; it does not bound calls-per-hour. Revisit if AI is switched on and abuse appears.
- **Capping `aiSuggestActivities` / `aiDraftPackingList` inputs.** Their prompts are built from DB fields (stop name, trip name, existing item titles), not raw pasted text, so the unbounded-input vector is far narrower. Not addressed here.
- **A global rate limiter / `middleware.ts`.** Larger design decision; not part of this round.

---

### Task 1: Cap pasted booking text before it reaches the LLM

The highest-value fix. `aiParseBooking` currently interpolates unbounded user text straight into the prompt (`lib/ai.ts:238`), and `next.config.ts` allows a 12 MB server-action body. At the 1M-token context window that is roughly $5 of input tokens per click, repeatable.

**Files:**
- Create: `lib/ai-limits.ts`
- Modify: `server/actions/ai.ts` (the `aiParseBooking` function at the end of the file)
- Modify: `components/trip/ai-booking-parser.tsx:66-70` (the `<textarea>`)
- Test: `server/actions/ai.test.ts` (append to the existing `describe("aiParseBooking", ...)` block at line 295)

**Interfaces:**
- Produces: `MAX_BOOKING_TEXT_CHARS: number` exported from `lib/ai-limits.ts`. Task 2 does not depend on it.
- The module must have **zero imports** so the client component can import the constant without pulling `zod` or the Anthropic SDK into the browser bundle. Do not put this constant in `lib/ai.ts`.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("aiParseBooking", ...)` block in `server/actions/ai.test.ts` (starts at line 295). The file already mocks `@/lib/guards`, `@/lib/ai`, and `@/lib/db` via `vi.hoisted` at the top — reuse those handles; do not add new mocks and do not use `vi.mocked(...)`. The handles are named `parseBookingConfirmationMock` and `requireTripAccessMock`. The block's own `beforeEach` already calls `vi.clearAllMocks()` and primes `requireTripAccessMock`, so these tests inherit a resolved access check.

```ts
  it("rejects text over the cap without calling the lib", async () => {
    const tooLong = "x".repeat(MAX_BOOKING_TEXT_CHARS + 1);

    const result = await aiParseBooking("trip-1", tooLong);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("error");
      expect(result.message).toMatch(/too long/i);
    }
    expect(parseBookingConfirmationMock).not.toHaveBeenCalled();
  });

  it("accepts text exactly at the cap", async () => {
    const atLimit = "x".repeat(MAX_BOOKING_TEXT_CHARS);
    parseBookingConfirmationMock.mockResolvedValue({
      ok: true,
      data: { kind: "unknown" },
    });

    await aiParseBooking("trip-1", atLimit);

    expect(parseBookingConfirmationMock).toHaveBeenCalledWith({ text: atLimit });
  });

  it("checks trip access even when the text is over the cap", async () => {
    const tooLong = "x".repeat(MAX_BOOKING_TEXT_CHARS + 1);

    await aiParseBooking("trip-1", tooLong);

    expect(requireTripAccessMock).toHaveBeenCalledWith("trip-1");
  });
```

Add the import at the top of the test file, alongside the existing imports:

```ts
import { MAX_BOOKING_TEXT_CHARS } from "@/lib/ai-limits";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/actions/ai.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ai-limits'`.

- [ ] **Step 3: Create the limits module**

Create `lib/ai-limits.ts`:

```ts
/**
 * Hard limits on AI inputs.
 *
 * Deliberately dependency-free so both server actions and client components
 * can import it — `lib/ai.ts` pulls in zod and (lazily) the Anthropic SDK,
 * which must never reach the browser bundle.
 */

/**
 * Longest pasted booking-confirmation text we will send to the model.
 *
 * A generous confirmation email is a few thousand characters; 20k leaves
 * plenty of headroom while bounding the cost of a single call. Without a cap
 * the 12 MB server-action body limit (next.config.ts) is the only ceiling,
 * which at the model's context window is dollars-per-click of input tokens.
 */
export const MAX_BOOKING_TEXT_CHARS = 20_000;
```

- [ ] **Step 4: Enforce it in the server action**

In `server/actions/ai.ts`, add the import alongside the existing ones:

```ts
import { MAX_BOOKING_TEXT_CHARS } from "@/lib/ai-limits";
```

Then replace the body of `aiParseBooking` so the length check sits **after** the access guard:

```ts
export async function aiParseBooking(
  tripId: string,
  text: string,
): Promise<AiResult<ParseBookingOutput>> {
  await requireTripAccess(tripId);

  // Bound the prompt before it reaches a metered API. The client sets a
  // maxLength too, but the client is untrusted — this is the enforcement.
  if (text.length > MAX_BOOKING_TEXT_CHARS) {
    return {
      ok: false,
      reason: "error",
      message: `That text is too long (${text.length.toLocaleString()} characters). Please paste at most ${MAX_BOOKING_TEXT_CHARS.toLocaleString()} characters — just the confirmation itself, not the whole email thread.`,
    };
  }

  return parseBookingConfirmation({ text });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/actions/ai.test.ts`
Expected: PASS, including the three pre-existing `aiParseBooking` tests.

- [ ] **Step 6: Add the client-side affordance**

In `components/trip/ai-booking-parser.tsx`, add the import:

```ts
import { MAX_BOOKING_TEXT_CHARS } from "@/lib/ai-limits";
```

Add `maxLength` to the `<textarea>` at line 66 (keep every existing attribute exactly as-is, just add the one line):

```tsx
        <textarea
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none min-h-[100px] sm:text-sm"
          placeholder="Paste booking confirmation email or text here…"
          value={text}
          maxLength={MAX_BOOKING_TEXT_CHARS}
          onChange={(e) => setText(e.target.value)}
          disabled={pending || !aiConfigured}
        />
```

`maxLength` silently truncates an oversized paste, which is confusing on its own. Add a counter that appears only as the user approaches the cap — insert this directly **after** the closing `/>` of the textarea and **before** the `<div className="flex justify-end">` that follows it:

```tsx
        {text.length > MAX_BOOKING_TEXT_CHARS * 0.9 && (
          <p className="text-xs text-muted-foreground text-right">
            {text.length.toLocaleString()} / {MAX_BOOKING_TEXT_CHARS.toLocaleString()} characters
          </p>
        )}
```

- [ ] **Step 7: Run the full suite**

Run: `npm run test`
Expected: PASS. If `app/(app)/trips/[tripId]/*` component tests render this parser, confirm they still pass — the added element is conditional on text length and renders nothing for an empty textarea.

- [ ] **Step 8: Commit**

```bash
git add lib/ai-limits.ts server/actions/ai.ts server/actions/ai.test.ts components/trip/ai-booking-parser.tsx
git commit -m "fix(ai): cap pasted booking text at 20k chars before the model call"
```

---

### Task 2: Make the default AI model the cheap tier

`lib/ai.ts:24` falls back to `claude-opus-4-8` ($5/$25 per MTok). `AI_MODEL` is unset in every environment, so the fallback is what would run. All three AI functions are schema-constrained extraction/suggestion tasks — `claude-haiku-4-5` ($1/$5) fits them, and the env var remains the no-deploy escape hatch if quality disappoints.

**Files:**
- Modify: `lib/ai.ts:23-25` (the `getModel` function)
- Modify: `.env.example` (the "AI features (Anthropic)" block near the end)
- Test: `lib/ai.test.ts:119-131` (an existing test asserts the old default and **will fail** until updated)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: no new exports. `getModel()` keeps its `(): string` signature.

- [ ] **Step 1: Update the failing test first**

`lib/ai.test.ts` line 119 currently reads `it("uses default model claude-opus-4-8 when AI_MODEL is not set", ...)` and asserts `model: "claude-opus-4-8"` at line 129. Replace that whole test with:

```ts
  it("uses default model claude-haiku-4-5 when AI_MODEL is not set", async () => {
    setEnv("sk-test-key", undefined);
    mockParse.mockResolvedValueOnce({
      parsed_output: { suggestions: [] },
    });

    const { suggestActivities } = await import("@/lib/ai");
    await suggestActivities({ stopName: "Tokyo" });

    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5" }),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ai.test.ts`
Expected: FAIL — received `model: "claude-opus-4-8"`, expected `"claude-haiku-4-5"`.

- [ ] **Step 3: Change the default**

In `lib/ai.ts`, replace the `getModel` function (lines 23-25):

```ts
/**
 * Model for all AI calls. Defaults to the cheap tier: every function here is a
 * short, schema-constrained task (suggest activities, draft a packing list,
 * extract fields from a confirmation), which is what Haiku is for —
 * $1/$5 per MTok vs $5/$25 for Opus.
 *
 * Raise AI_MODEL to "claude-sonnet-5" or "claude-opus-4-8" if output quality
 * disappoints; it takes effect without a code change or redeploy.
 */
function getModel(): string {
  return process.env.AI_MODEL ?? "claude-haiku-4-5";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/ai.test.ts`
Expected: PASS. The `"uses AI_MODEL override when set"` tests (lines 133 and 285) must still pass untouched — they set `AI_MODEL` explicitly and never depend on the default.

- [ ] **Step 5: Document the default and the upgrade path**

In `.env.example`, replace the AI block (the section headed `# AI features (Anthropic)`) with:

```
# ---------------------------------------------------------------------------
# AI features (Anthropic) — optional. Without ANTHROPIC_API_KEY the AI UI is
# disabled and no request is ever made. Get a key at:
# https://console.anthropic.com/
#
# AI_MODEL is optional and defaults to claude-haiku-4-5 ($1/$5 per MTok) —
# the right tier for the three schema-constrained tasks here. If extraction
# quality disappoints, raise it WITHOUT a code change:
#   claude-sonnet-5   $3/$15 per MTok
#   claude-opus-4-8   $5/$25 per MTok
#
# Pasted booking text is capped at MAX_BOOKING_TEXT_CHARS (lib/ai-limits.ts)
# so a single call cannot run away. There is no per-user call quota.
# ---------------------------------------------------------------------------
ANTHROPIC_API_KEY=""
AI_MODEL=""
```

- [ ] **Step 6: Commit**

```bash
git add lib/ai.ts lib/ai.test.ts .env.example
git commit -m "fix(ai): default AI_MODEL to claude-haiku-4-5 instead of opus"
```

---

### Task 3: Make the FX cache actually cache

`resolveRateForTrip` reads the stored rate, then — unless it is `manual` — **always** fetches from Frankfurter. `isRateStale()` is used only by the route to *label* the response. So `ExchangeRate` is a failure fallback, not a read-through cache, and every budget page view makes an outbound call with no rate limiting in front of it.

⚠️ **Four existing tests encode the always-fetch behaviour** and will go red. They use `fetchedAt: new Date()` (fresh) with `manual: false` and assert the fetcher was called. They are testing the *fetch* path, so the correct fix is to age their `fetchedAt` past the staleness window — **not** to weaken the implementation. Step 1 does this before the behaviour changes.

**Files:**
- Modify: `lib/fx.ts` (the `resolveRateForTrip` function — the block between the `stored?.manual` early return and `const fetched = await fetcher(B, Q);`)
- Test: `lib/fx.test.ts` (update 4 existing cases, add 2 new ones)

**Interfaces:**
- Consumes: `isRateStale(fetchedAtMs: number, nowMs: number): boolean` and `FX_STALE_AFTER_MS: number`, both already defined and exported at the top of `lib/fx.ts`. No new import needed — same module.
- Produces: no signature change. `resolveRateForTrip` keeps returning `Promise<ResolvedRate>`; a cache hit returns `{ rate, persist: null }`, so callers that conditionally call `persistRate` need no change.

- [ ] **Step 1: Age the `fetchedAt` in the four tests that assert a fetch**

In `lib/fx.test.ts`, add this helper just below the `StoredRate` type definition (around line 80):

```ts
/** A fetchedAt old enough to be stale (25h ago), so the fetch path still runs. */
function staleFetchedAt(): Date {
  return new Date(Date.now() - 25 * 60 * 60 * 1000);
}
```

Then, in each of these four tests, change `fetchedAt: new Date()` to `fetchedAt: staleFetchedAt()`:

- line ~149 — `"fetches, upserts, and returns fetched rate when stored is non-manual"`
- line ~172 — `"returns stale stored rate when fetch fails (returns null)"`
- line ~254 — `"falls back to the stale stored rate with no persist when the fetch fails"`
- line ~270 — `"returns null rate and no persist when the fetch fails and nothing is stored"` — **only if** it defines a stored rate; if `stored` is null here, leave it alone.

Do **not** touch the `mergeRate` tests (lines 16-60) or the `isRateStale` tests (lines 311-333). `mergeRate` is pure policy with no network call and is unaffected.

- [ ] **Step 2: Write the failing tests for the new behaviour**

Add a new block after the existing `resolveRateForTrip` describe block:

```ts
describe("resolveRateForTrip — read-through cache", () => {
  it("does not fetch when a non-manual stored rate is still fresh", async () => {
    const fetcher = vi.fn();
    const db = {
      exchangeRate: {
        findUnique: vi.fn().mockResolvedValue({
          rate: 1.55,
          manual: false,
          fetchedAt: new Date(),
        }),
      },
    } as never;

    const result = await resolveRateForTrip("trip-1", "AUD", "JPY", {
      db,
      fetcher,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.rate).toBe(1.55);
    expect(result.persist).toBeNull();
  });

  it("fetches once the stored rate passes the staleness threshold", async () => {
    const fetcher = vi.fn().mockResolvedValue(1.7);
    const db = {
      exchangeRate: {
        findUnique: vi.fn().mockResolvedValue({
          rate: 1.55,
          manual: false,
          fetchedAt: new Date(Date.now() - FX_STALE_AFTER_MS - 1000),
        }),
      },
    } as never;

    const result = await resolveRateForTrip("trip-1", "AUD", "JPY", {
      db,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith("AUD", "JPY");
    expect(result.rate).toBe(1.7);
    expect(result.persist).toEqual({ base: "AUD", quote: "JPY", rate: 1.7 });
  });
});
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npx vitest run lib/fx.test.ts`
Expected: the two new tests FAIL (`fetcher` was called when it should not have been). The four tests edited in Step 1 should now PASS.

- [ ] **Step 4: Add the freshness short-circuit**

In `lib/fx.ts`, inside `resolveRateForTrip`, insert the new block between the manual check and the fetch:

```ts
  // Manual rate — trust it, skip the network and any write.
  if (stored?.manual) {
    return { rate: stored.rate, persist: null };
  }

  // Read-through cache. A non-manual rate inside the staleness window is good
  // enough: without this the ExchangeRate row is only a failure fallback and
  // every budget render makes an outbound Frankfurter call. There is no rate
  // limiting in front of /api/fx, so that is a per-request external call.
  if (stored && !isRateStale(stored.fetchedAt.getTime(), Date.now())) {
    return { rate: stored.rate, persist: null };
  }

  const fetched = await fetcher(B, Q);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/fx.test.ts`
Expected: PASS, all cases.

- [ ] **Step 6: Verify the route's `source` labelling still behaves**

`app/api/fx/route.ts` decides `source` by re-reading the row and comparing `stored.rate === rate`. On a cache hit those are now equal, so it takes the `stale = isRateStale(...)` branch — which evaluates `false` for a fresh rate, yielding `source: "fetched"`. That is the correct label for the caller (the rate is current), and no route change is needed.

Run: `npx vitest run app/api/fx` (skip if no test file exists for the route).

- [ ] **Step 7: Commit**

```bash
git add lib/fx.ts lib/fx.test.ts
git commit -m "fix(fx): serve fresh stored rates without hitting Frankfurter"
```

---

### Task 4: Bound the cron's due-cost scan

The reminders pass is correctly bounded (`take: 200`). The payment-alert pass below it is not: it pulls **every** unpaid dated cost across **all** trips, runs four more queries per distinct trip, then filters to the 3-day/0-day offsets in JavaScript. Neon bills CU-hours. Only two calendar dates can ever match, and `Cost.dueDate` is an indexed `String?` in `"YYYY-MM-DD"` form — so the filter belongs in SQL.

**Files:**
- Modify: `app/api/cron/reminders/route.ts` (the import line, and the `dueCosts` query in the second pass)
- Test: `app/api/cron/reminders/route.test.ts:321` (an existing test asserts the old `where` clause and **will fail** until updated)

**Interfaces:**
- Consumes: `addDays(s: string, n: number): string` from `@/lib/dates` — returns a `"YYYY-MM-DD"` string, already used by the test file.
- Produces: no new exports. The route's JSON response shape (`{ processed, sent, skipped, dueAlerts }`) is unchanged.

- [ ] **Step 1: Update the existing where-clause assertion and add a bounds test**

In `app/api/cron/reminders/route.test.ts`, replace the test at line 321 (`"queries only unpaid, non-forked, due-dated costs"`) with:

```ts
  it("queries only unpaid, non-forked costs due on an alert date, bounded", async () => {
    vi.stubEnv("CRON_SECRET", "right");
    reminderFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);

    await GET(req({ secret: "right" }));

    expect(costFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dueDate: { in: [threeDaysFromNow, todayUTC] },
          paidAt: null,
          forkId: null,
        }),
        take: 500,
      }),
    );
  });
```

Note the array order is `[threeDaysFromNow, todayUTC]` — it is derived from `ALERT_OFFSETS_DAYS = [3, 0]`, in that order. `todayUTC` and `threeDaysFromNow` are already defined at line ~113 of the test file; reuse them.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/cron/reminders/route.test.ts`
Expected: FAIL — received `dueDate: { not: null }` and no `take`.

- [ ] **Step 3: Add the `addDays` import**

In `app/api/cron/reminders/route.ts`, change the dates import:

```ts
import { addDays, daysBetween } from "@/lib/dates";
```

- [ ] **Step 4: Push the date window into the query**

Replace the block that starts at `const ALERT_OFFSETS_DAYS` and ends at the `select:` of the `dueCosts` query:

```ts
    const ALERT_OFFSETS_DAYS = [3, 0] as const;
    const todayUTC = now.toISOString().slice(0, 10);

    // Only two calendar days can ever produce an alert, so ask the database
    // for exactly those two instead of pulling every unpaid dated cost in
    // every trip and filtering in JS. Cost.dueDate is a "YYYY-MM-DD" string
    // with an @@index, so this is an indexed lookup. `take` is a backstop
    // against one pathological day, mirroring the first pass's take: 200.
    const alertDates = ALERT_OFFSETS_DAYS.map((offset) =>
      addDays(todayUTC, offset),
    );

    const dueCosts = await db.cost.findMany({
      where: { dueDate: { in: alertDates }, paidAt: null, forkId: null },
      take: 500,
      select: {
```

Leave the `select` block and everything after it exactly as-is. In particular **keep** the existing JS-side guard further down:

```ts
      const daysUntil = daysBetween(todayUTC, cost.dueDate!);
      if (!ALERT_OFFSETS_DAYS.includes(daysUntil as 3 | 0)) continue;
```

It is now redundant for correctness but is cheap defence-in-depth, and removing it would break the existing `"ignores paid costs and costs due at other offsets"` test at line 301, which feeds the mock costs at offsets the query would no longer return.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/api/cron/reminders/route.test.ts`
Expected: PASS, all cases — including `"pushes a 3-days-before alert..."` (line 235) and `"pushes a due-today alert..."` (line 268), which mock `costFindManyMock` directly and are unaffected by the `where` change.

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/reminders/route.ts app/api/cron/reminders/route.test.ts
git commit -m "fix(cron): bound due-cost scan to the two alert dates"
```

---

### Task 5: Full verification

**Files:** none modified.

- [ ] **Step 1: Run the whole unit suite**

Run: `npm run test`
Expected: PASS, zero failures.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean. The most likely complaint is an unused import if a step was applied partially.

- [ ] **Step 3: Type-check via build**

Run: `npm run build`
Expected: compiles. This is what catches a `maxLength` type error in the parser component or a bad `where` shape against the Prisma client types.

- [ ] **Step 4: Confirm no secret or env file got staged**

```bash
git status --short
git log --oneline main..HEAD
```

Expected: four commits, touching only the files listed in Tasks 1-4. No `.env*` file other than `.env.example`.

- [ ] **Step 5: Report, do not merge**

Summarise what landed and stop. Per the sandbox guardrails, merging to `main` and deploying require explicit sign-off that this plan does not carry.
