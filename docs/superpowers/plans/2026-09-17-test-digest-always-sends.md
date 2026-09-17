# Test Digest Always Sends — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Settings "Send me a test" button always deliver a push, sending a clearly-marked placeholder when there is no Digest content instead of refusing.

**Architecture:** A new pure function `asTestDigest` in `lib/digest.ts` turns a `DigestPayload | null` into the payload a test send should deliver — the real digest with a `Test · ` title prefix, or a fixed placeholder when there is nothing to say. `dispatchDigest` applies it on the `force: true` path only (that flag already means "this is the Settings test send") and reports back, via a new optional `placeholder` field, which of the two went out. `sendTestDigest` drops its empty-content refusal and passes that flag to the panel, which picks between two success strings. The scheduled cron path is untouched: `buildDigest` still returns `null` on a quiet day and `dispatchDigest` still releases the claimed ledger row.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, Vitest, React Testing Library, Tailwind.

## Global Constraints

- **Domain language matters here.** A **Digest** is the once-a-day push TEEPEE sends; a **Reminder** is a Traveller's dated note. This work is about the Digest. Do not rename the Reminders settings panel — it legitimately hosts both.
- **Never claim a success that did not happen.** A test send that reaches zero devices must still return `{ ok: false }`. This rule is load-bearing throughout `server/actions/digest.ts` and must survive the change.
- **Only the empty-content refusal is being removed.** The push-not-configured refusal, the no-device-subscribed refusal, and the delivery-failure refusal all stay exactly as they are, with their existing error strings unchanged.
- **The scheduled dispatch path must not change behaviour at all.** Every existing `lib/digest-dispatch.test.ts` test that does not pass `force: true` must still pass untouched.
- Exact copy strings, to be used verbatim:
  - Placeholder push title: `Test · TEEPEE`
  - Placeholder push body: `Push is working. Your digest arrives in the evening when there's something to say.`
  - Real-content test title prefix: `Test · ` (that is a space, U+00B7 MIDDLE DOT, space)
  - Panel success, real content: `Sent today's digest to N device.` / `… N devices.`
  - Panel success, placeholder: `Sent a test to N device. There's nothing to report today, so your real digest would stay silent.` / `… N devices. There's …`
- Run tests with `npm test`. Lint with `npm run lint`. There is no separate typecheck script; `npm run build` type-checks.
- Commit after every task.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `lib/digest.ts` | Pure digest payload building. Gains `asTestDigest`, the single place the test-send wording lives. | Modify |
| `lib/digest.test.ts` | Unit tests for the pure builders. | Modify |
| `lib/digest-dispatch.ts` | Turns (user, trip, date, slot) into at most one push. Applies `asTestDigest` on the forced path; reports `placeholder`. | Modify |
| `lib/digest-dispatch.test.ts` | Dispatch behaviour, including the ledger-claim invariants. | Modify |
| `server/actions/digest.ts` | The Settings server actions. Drops the empty refusal; widens `SendTestDigestResult`. | Modify |
| `server/actions/digest.test.ts` | Server action tests. | Modify |
| `components/trip/settings/reminders-panel.tsx` | The Digest opt-in UI. Two success strings. | Modify |
| `components/trip/settings/reminders-panel.test.tsx` | Panel tests. | Modify |
| `CONTEXT.md` | Glossary. The **Digest** entry must stop implying the test probe is also silent on a quiet day. | Modify |

---

### Task 1: `asTestDigest` — the pure test payload

**Files:**
- Modify: `lib/digest.ts` (append after `buildDigest`, which ends at line 188)
- Test: `lib/digest.test.ts`

**Interfaces:**
- Consumes: `DigestPayload` (already exported from `lib/digest.ts:79` — `{ title: string; body: string; url: string }`).
- Produces: `export function asTestDigest(digest: DigestPayload | null, tripId: string): DigestPayload` — never returns null. Task 2 calls this.

- [ ] **Step 1: Write the failing tests**

Append to `lib/digest.test.ts`:

```ts
describe("asTestDigest", () => {
  it("marks a real digest as a test without touching its body or url", () => {
    const real = buildDigest(
      input({ payments: [{ id: "c1", label: "Airbnb", amountLabel: "£240", daysUntil: 3 }] }),
    );

    const test = asTestDigest(real, "trip-1");

    expect(test.title).toBe("Test · Coming up");
    expect(test.body).toBe(real!.body);
    expect(test.url).toBe(real!.url);
  });

  it("marks a 'Tomorrow' digest too, so no test push impersonates the 8pm one", () => {
    const real = buildDigest(
      input({
        phase: "travelling",
        schedule: {
          transports: [{ id: "t1", mode: "TRAIN", route: "Vienna → Prague", localTime: "09:40" }],
          stays: [],
          items: [],
        },
      }),
    );

    expect(asTestDigest(real, "trip-1").title).toBe("Test · Tomorrow");
  });

  it("returns the placeholder when there is no digest to send", () => {
    // The whole point of the button: on a quiet day it must still prove the
    // pipe works rather than refusing (ADR 0047 calls it the push-half probe).
    const test = asTestDigest(null, "trip-1");

    expect(test).toEqual({
      title: "Test · TEEPEE",
      body: "Push is working. Your digest arrives in the evening when there's something to say.",
      url: "/trips/trip-1/settings",
    });
  });

  it("points the placeholder at the settings page the button lives on", () => {
    expect(asTestDigest(null, "trip-abc").url).toBe("/trips/trip-abc/settings");
  });

  it("does not mutate the digest it was given", () => {
    const real: DigestPayload = { title: "Tomorrow", body: "line", url: "/trips/trip-1" };

    asTestDigest(real, "trip-1");

    expect(real.title).toBe("Tomorrow");
  });
});
```

Update the import at the top of `lib/digest.test.ts` from:

```ts
import { buildDigest, type DigestInput } from "@/lib/digest";
```

to:

```ts
import { asTestDigest, buildDigest, type DigestInput, type DigestPayload } from "@/lib/digest";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/digest.test.ts`
Expected: FAIL — `asTestDigest is not a function` (or a TypeScript import error).

- [ ] **Step 3: Write the implementation**

Append to `lib/digest.ts`:

```ts
/**
 * The payload a Settings "send me a test" press should deliver.
 *
 * Two jobs, and the second is why this exists at all:
 *
 * 1. **Never refuse.** A quiet day makes `buildDigest` return null, which is
 *    correct for the 8pm run — silence when there is nothing to say is the
 *    Digest's whole contract (CONTEXT.md **Digest**). But the test button is
 *    the probe for the push half (ADR 0047), and a probe that declines to fire
 *    on a quiet day answers a question nobody asked. The placeholder goes out
 *    instead.
 * 2. **Never impersonate the real thing.** A real digest is sent verbatim so
 *    the Traveller sees true content and true formatting on their lock screen,
 *    but titled `Test · Tomorrow` rather than `Tomorrow` — otherwise a test
 *    pressed at 3pm and the genuine digest at 8pm are indistinguishable, and
 *    the second one reads as a double-send.
 */
export function asTestDigest(
  digest: DigestPayload | null,
  tripId: string,
): DigestPayload {
  if (!digest) {
    return {
      title: "Test · TEEPEE",
      body: "Push is working. Your digest arrives in the evening when there's something to say.",
      // The settings page, because that is where the button was pressed and
      // where the explanation of a silent day already lives.
      url: `/trips/${tripId}/settings`,
    };
  }
  return { ...digest, title: `Test · ${digest.title}` };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/digest.test.ts`
Expected: PASS, including every pre-existing `buildDigest` test.

- [ ] **Step 5: Commit**

```bash
git add lib/digest.ts lib/digest.test.ts
git commit -m "feat(digest): add asTestDigest, the payload a test send delivers"
```

---

### Task 2: Dispatch sends the test payload under `force`

**Files:**
- Modify: `lib/digest-dispatch.ts` (result type at lines 487-491; the `buildDigest` / null-check block at lines 551-558; the return at line 598; the doc comment at lines 493-499)
- Test: `lib/digest-dispatch.test.ts` (rewrite the test at line 346; add new ones)

**Interfaces:**
- Consumes: `asTestDigest(digest, tripId)` from Task 1.
- Produces: `DispatchDigestResult` gains an optional field —

```ts
export interface DispatchDigestResult {
  sent: number;
  skipped: boolean;
  reason?: DispatchSkipReason;
  /** Set only when a forced test send fell back to the placeholder payload. */
  placeholder?: true;
}
```

  The field is **optional and only ever set to `true`**, never `false`. That matters: existing tests assert `toEqual({ sent: 1, skipped: false })` on the content path and must keep passing unchanged. Task 3 reads `result.placeholder`.

- [ ] **Step 1: Write the failing tests**

In `lib/digest-dispatch.test.ts`, **replace** the existing test at line 346 (`"does not delete a ledger row it never claimed when a forced digest is empty"`) with:

```ts
  it("sends the placeholder instead of refusing when a forced digest is empty", async () => {
    dbData.reminder = [];

    const result = await dispatch({ force: true });

    // The button's job is proving the pipe works, so an empty day must still
    // put something on the device — flagged as a placeholder, never as content.
    expect(result).toEqual({ sent: 1, skipped: false, placeholder: true });
    expect(digestDispatchDeleteMock).not.toHaveBeenCalled();
  });

  it("puts the placeholder wording on the wire when a forced digest is empty", async () => {
    dbData.reminder = [];

    await dispatch({ force: true });

    const payload = JSON.parse(sendPushMock.mock.calls[0][1] as string);
    expect(payload.title).toBe("Test · TEEPEE");
    expect(payload.body).toBe(
      "Push is working. Your digest arrives in the evening when there's something to say.",
    );
  });

  it("marks a forced send that does have content as a test", async () => {
    const result = await dispatch({ force: true });

    // Real content goes out verbatim — but titled so it cannot be mistaken
    // for the scheduled 8pm digest a few hours later.
    expect(result).toEqual({ sent: 1, skipped: false });
    const payload = JSON.parse(sendPushMock.mock.calls[0][1] as string);
    expect(payload.title).toMatch(/^Test · /);
  });

  it("leaves a scheduled empty digest silent and releases the slot", async () => {
    dbData.reminder = [];

    const result = await dispatch();

    // Unforced, nothing changes: a quiet evening still sends nothing at all.
    expect(result).toEqual({ sent: 0, skipped: true, reason: "empty" });
    expect(sendPushMock).not.toHaveBeenCalled();
  });
```

**Before writing these, read the top of `lib/digest-dispatch.test.ts`** to confirm the local helper names used above — `dispatch(...)`, `dbData`, `sendPushMock`, `digestDispatchDeleteMock` — and confirm how `sendPushMock` is called (the payload is the **second** argument to `sendPush`, per `lib/digest-dispatch.ts:570-573`). If the existing default fixture (`dbData`) does not produce a non-empty digest for the plain `dispatch({ force: true })` call, mirror whatever the existing test at line 355 (`"force bypasses both the preference and the ledger"`) relies on — that one already expects `sent: 1`, so the default fixture does have content.

If `buildDigest` is mocked in this file (there is a `buildDigestMock` referenced at line 336), the payload assertions above will not see real wording. In that case, for the two payload-wording tests only, let the real `buildDigest`/`asTestDigest` through — e.g. `buildDigestMock.mockImplementation(actualBuildDigest)` using `await vi.importActual("@/lib/digest")` — or assert on what the mock was composed with. Do **not** mock `asTestDigest`; its wording is the thing under test.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/digest-dispatch.test.ts`
Expected: FAIL — the forced-empty case still returns `{ sent: 0, skipped: true, reason: "empty" }` and `sendPush` was never called.

- [ ] **Step 3: Write the implementation**

In `lib/digest-dispatch.ts`, add `asTestDigest` to the existing import from `@/lib/digest` (lines 22-32):

```ts
import {
  asTestDigest,
  buildDigest,
  type DigestChecklistLine,
  // … the rest unchanged
} from "@/lib/digest";
```

Replace the result interface (lines 487-491) with:

```ts
export interface DispatchDigestResult {
  sent: number;
  skipped: boolean;
  reason?: DispatchSkipReason;
  /**
   * Set only when a forced test send found nothing to say and delivered the
   * placeholder instead. Absent on every other path, so the scheduled result
   * shape is unchanged.
   */
  placeholder?: true;
}
```

Replace the build-and-bail block (lines 551-558) with:

```ts
    const built = buildDigest(await collectDigestInput({ tripId, localDate, slot }));

    // A forced send is the Settings test button, and it must never refuse: an
    // empty day gets the placeholder, a day with content gets that content
    // marked as a test (lib/digest.ts asTestDigest).
    const digest = force ? asTestDigest(built, tripId) : built;
    const placeholder = force && !built;

    if (!digest) {
      // Release the slot — otherwise a quiet evening burns it and a plan edit
      // later the same day could never produce a Digest. Unreachable when
      // `force` is set, because asTestDigest never returns null.
      await releaseClaim();
      return { sent: 0, skipped: true, reason: "empty" };
    }
```

Replace the success return (line 598) with:

```ts
    return placeholder ? { sent, skipped: false, placeholder: true } : { sent, skipped: false };
```

Finally, extend the `dispatchDigest` doc comment (lines 493-499) — replace the last sentence with:

```
 * Order is load-bearing: preference → claim → build → send. `force` is for the
 * Settings "send me a test" button: it skips both the preference check and the
 * ledger so a test send never consumes the real slot, and it swaps the payload
 * through `asTestDigest` so the press always puts *something* on the device.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/digest-dispatch.test.ts`
Expected: PASS — the new tests, and every pre-existing test in the file that does not pass `force: true`, plus the three forced tests at lines 335, 355 and 426 which were written against result shapes this change preserves.

- [ ] **Step 5: Commit**

```bash
git add lib/digest-dispatch.ts lib/digest-dispatch.test.ts
git commit -m "feat(digest): a forced dispatch always delivers a marked test push"
```

---

### Task 3: `sendTestDigest` stops refusing on an empty day

**Files:**
- Modify: `server/actions/digest.ts` (result type at lines 20-22; doc comment at lines 80-95; the empty branch at lines 127-136)
- Test: `server/actions/digest.test.ts` (rewrite the test at line 268; update the one at line 293)

**Interfaces:**
- Consumes: `DispatchDigestResult.placeholder` from Task 2.
- Produces:

```ts
export type SendTestDigestResult =
  | { ok: true; sent: number; placeholder: boolean }
  | { ok: false; error: string };
```

  `placeholder` is **required and always present** on the success branch here (unlike the dispatch layer's optional flag) so the panel in Task 4 can switch on it without an undefined check.

- [ ] **Step 1: Write the failing tests**

In `server/actions/digest.test.ts`, **replace** the test at line 268 (`"surfaces the nothing-to-send error when dispatch reports zero sent and reason empty"`) with:

```ts
  it("reports a placeholder send as a success, not as nothing-to-send", async () => {
    pushSubscriptionFindManyMock.mockResolvedValue([
      { timezone: "Europe/London", createdAt: new Date("2026-01-01") },
    ]);
    dispatchDigestMock.mockResolvedValue({ sent: 1, skipped: false, placeholder: true });

    const result = await sendTestDigest(TRIP_ID);

    expect(result).toEqual({ ok: true, sent: 1, placeholder: true });
  });

  it("forces the dispatch so a test never consumes the real slot", async () => {
    pushSubscriptionFindManyMock.mockResolvedValue([
      { timezone: "Europe/London", createdAt: new Date("2026-01-01") },
    ]);
    dispatchDigestMock.mockResolvedValue({ sent: 1, skipped: false, placeholder: true });

    await sendTestDigest(TRIP_ID);

    expect(dispatchDigestMock).toHaveBeenCalledWith(
      expect.objectContaining({ force: true, tripId: TRIP_ID }),
    );
  });

  it("still fails when a test reached no device at all", async () => {
    pushSubscriptionFindManyMock.mockResolvedValue([
      { timezone: "Europe/London", createdAt: new Date("2026-01-01") },
    ]);
    dispatchDigestMock.mockResolvedValue({ sent: 0, skipped: false, placeholder: true });

    const result = await sendTestDigest(TRIP_ID);

    // Removing the empty-content refusal must not weaken the rule that this
    // never claims success when nothing was delivered.
    expect(result).toEqual({
      ok: false,
      error: "The test Digest could not be delivered.",
    });
  });
```

**Update** the existing test at line 293 — `expect(result).toEqual({ ok: true, sent: 3 })` becomes:

```ts
    expect(result).toEqual({ ok: true, sent: 3, placeholder: false });
```

Leave the three tests at lines 243, 256 and 285 (push-not-configured, no-device, and `never returns ok: true when dispatch reports zero sent for any reason`) exactly as they are — they must still pass.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- server/actions/digest.test.ts`
Expected: FAIL — the placeholder result is still reported as `{ ok: false, error: "Nothing to send right now — …" }`.

- [ ] **Step 3: Write the implementation**

In `server/actions/digest.ts`, replace the result type (lines 20-22):

```ts
export type SendTestDigestResult =
  /**
   * `placeholder` distinguishes the two successes: false means the real
   * Digest went out, true means there was nothing to say today and the probe
   * payload went instead. Both delivered; they need different copy.
   */
  | { ok: true; sent: number; placeholder: boolean }
  | { ok: false; error: string };
```

Replace the tail of the function (lines 127-136) with:

```ts
  if (result.sent === 0) {
    return { ok: false, error: "The test Digest could not be delivered." };
  }

  return { ok: true, sent: result.sent, placeholder: result.placeholder === true };
```

Replace the third paragraph of the doc comment (lines 92-95) with:

```
 * Beyond that, this must never report success when nothing was delivered: a
 * `sent: 0` from `dispatchDigest` is surfaced as a failure rather than
 * `{ ok: true }`. An *empty* day is no longer one of those cases — the forced
 * dispatch sends a placeholder instead (lib/digest.ts asTestDigest), because
 * this button probes the push pipe and a quiet day says nothing about it.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- server/actions/digest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/actions/digest.ts server/actions/digest.test.ts
git commit -m "feat(digest): a test send on a quiet day succeeds with a placeholder"
```

---

### Task 4: The panel tells you which test you got

**Files:**
- Modify: `components/trip/settings/reminders-panel.tsx` (state type at lines 61-63; success rendering at lines 239-243; doc comment item 3 at lines 44-47)
- Test: `components/trip/settings/reminders-panel.test.tsx` (mock defaults at lines 7 and 35; the test at line 172)

**Interfaces:**
- Consumes: `SendTestDigestResult` from Task 3 — `{ ok: true; sent: number; placeholder: boolean }`.
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing tests**

In `components/trip/settings/reminders-panel.test.tsx`, first update the two mock defaults so they satisfy the widened type — line 7:

```ts
  sendTestDigest: vi.fn().mockResolvedValue({ ok: true, sent: 1, placeholder: false }),
```

and line 35:

```ts
  vi.mocked(sendTestDigest).mockResolvedValue({ ok: true, sent: 1, placeholder: false });
```

**Replace** the test at line 172 (`"reports how many devices a successful test reached"`) with:

```ts
  it("names the real digest when a successful test carried content", async () => {
    const user = userEvent.setup();
    vi.mocked(sendTestDigest).mockResolvedValue({ ok: true, sent: 2, placeholder: false });

    render(<RemindersPanel tripId="t1" initial={subscribed} />);
    await user.click(screen.getByRole("button", { name: /send me a test/i }));

    expect(await screen.findByText("Sent today's digest to 2 devices.")).toBeInTheDocument();
  });

  it("says a quiet day is a quiet day when the test was a placeholder", async () => {
    const user = userEvent.setup();
    vi.mocked(sendTestDigest).mockResolvedValue({ ok: true, sent: 1, placeholder: true });

    render(<RemindersPanel tripId="t1" initial={subscribed} />);
    await user.click(screen.getByRole("button", { name: /send me a test/i }));

    // The push arrived, so this is not an error — but the Traveller still
    // needs to know why it did not look like a digest.
    expect(
      await screen.findByText(
        "Sent a test to 1 device. There's nothing to report today, so your real digest would stay silent.",
      ),
    ).toBeInTheDocument();
  });
```

**Before writing these, read the existing test at line 172** and reuse its exact local fixture name (`subscribed` above is a guess at the existing subscribed-device fixture), its `render` call shape, and how it queries the test button. Match the file's established idiom rather than the sketch above.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- components/trip/settings/reminders-panel.test.tsx`
Expected: FAIL — the panel renders `Sent to 2 devices.` and has no placeholder branch.

- [ ] **Step 3: Write the implementation**

In `components/trip/settings/reminders-panel.tsx`, widen the state type (lines 61-63):

```ts
  const [testResult, setTestResult] = React.useState<
    { ok: true; sent: number; placeholder: boolean } | { ok: false; error: string } | null
  >(null);
```

Replace the success rendering (lines 239-243):

```tsx
        {testResult?.ok === true && (
          <p className="text-xs text-foreground">
            {testResult.placeholder
              ? `Sent a test to ${testResult.sent} ${
                  testResult.sent === 1 ? "device" : "devices"
                }. There's nothing to report today, so your real digest would stay silent.`
              : `Sent today's digest to ${testResult.sent} ${
                  testResult.sent === 1 ? "device" : "devices"
                }.`}
          </p>
        )}
```

Replace item 3 of the component doc comment (lines 44-47):

```
 *   3. a test send that always delivers and reports exactly what it delivered:
 *      the real Digest, or — on a day with nothing to say — a placeholder that
 *      proves the pipe. The failures that remain (no device, no VAPID keys on
 *      the deployment, nothing got through) each need a different fix, so each
 *      error string from `sendTestDigest` is surfaced verbatim,
```

Leave the closing "silence is not breakage" paragraph (lines 250-256) exactly as it is — it is now accurate rather than defensive, and a test at line 328 asserts on it.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — the whole suite, not just this file. This is the first task where every layer is in place, so a break anywhere else surfaces here.

- [ ] **Step 5: Lint and type-check**

Run: `npm run lint && npm run build`
Expected: no errors. The `build` step is the type-check — the widened `SendTestDigestResult` crosses the server/client boundary, so a missed call site shows up here and nowhere else.

- [ ] **Step 6: Commit**

```bash
git add components/trip/settings/reminders-panel.tsx components/trip/settings/reminders-panel.test.tsx
git commit -m "feat(digest): distinguish a real test digest from a placeholder in Settings"
```

---

### Task 5: Reconcile the glossary

**Files:**
- Modify: `CONTEXT.md` (the **Digest** entry, line 186)

**Interfaces:** none — documentation only.

The **Digest** entry currently reads, in part: *"and is *not sent at all* when there is nothing to say."* That remains true of the scheduled Digest and is now explicitly untrue of the test probe. Left alone, the glossary contradicts the button.

`CONTEXT.md` is a glossary and nothing else — do not add implementation detail, file paths, function names, or a description of the placeholder's wording.

- [ ] **Step 1: Read the entry**

Read `CONTEXT.md` around line 186 in full, so the added clause matches the entry's register (prose, em-dashes, bolded domain terms).

- [ ] **Step 2: Add the clause**

In the **Digest** entry, immediately after the clause ending *"and is *not sent at all* when there is nothing to say."*, insert:

```
A Traveller can ask Settings for a one-off test Digest at any moment; unlike the scheduled one it always arrives, carrying that day's content where there is some and otherwise announcing itself as a test, because its job is proving the push reaches the device rather than reporting the day.
```

Do not change any other part of the entry, and do not touch the **Reminder** or **Alarm** entries.

- [ ] **Step 3: Verify nothing else references the old behaviour**

Run: `grep -rn "Nothing to send right now" --include="*.ts" --include="*.tsx" --include="*.md" . | grep -v node_modules`
Expected: no results. If any remain, they are stale references to the removed error string — fix them.

Run: `npm test`
Expected: PASS (nothing in this task should affect it; this is the guard).

- [ ] **Step 4: Commit**

```bash
git add CONTEXT.md
git commit -m "docs(context): the test Digest always arrives, unlike the scheduled one"
```

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| Content today → real digest, `Test · ` prefixed | 1, 2 |
| Nothing today → placeholder push, not a refusal | 1, 2 |
| Panel distinguishes the two successes | 3, 4 |
| Push-unconfigured refusal unchanged | 3 (existing test at line 243 left in place) |
| No-device refusal unchanged | 3 (existing test at line 256 left in place) |
| Delivery-failure refusal unchanged | 3 (new test, plus existing test at line 285) |
| Scheduled path unchanged | 2 (new unforced-empty test, plus every untouched test in the file) |
| No ADR | — deliberate, recorded in the spec |
| CONTEXT.md clause | 5 |
| Panel is not renamed | Global Constraints |

**Type consistency:** `asTestDigest(digest, tripId)` is defined in Task 1 and called with that signature in Task 2. `DispatchDigestResult.placeholder` is `?: true` (optional, only ever set) in Task 2 and read as `result.placeholder === true` in Task 3. `SendTestDigestResult`'s success branch is `{ ok: true; sent: number; placeholder: boolean }` in Task 3 and consumed with a required `placeholder` in Task 4's state type and mock fixtures. Consistent.

**Placeholder scan:** no TBDs. Every code step carries the actual code. The two places that say "read the existing file first" (Task 2 Step 1, Task 4 Step 1) do so because the test fixtures' local helper names cannot be quoted reliably from the excerpts available, and both give the exact assertion content regardless — that is a fixture-name lookup, not a deferred decision.
