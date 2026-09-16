# Sister-Onboarding Code Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the deployed app safe and welcoming for a brand-new tester: feedback notes become private to their author (admins see all), a failed attachment upload no longer strands an orphan DB row, and the trips empty state points new users at the help guide.

**Architecture:** Three independent, self-contained changes. (1) `listFeedbackNotes` gains a `where` scoped to the caller unless `isAdminEmail(user.email)`; the panel client already gates deletion by author, so no client change. (2) `uploadAttachment`'s two paths (globe, trip) wrap the blob write in try/catch and delete the just-created row on failure — the row-before-blob order stays (the row id feeds the storage key). (3) The `/trips` "No trips yet" `EmptyState` gains a secondary link to `/help`.

**Tech Stack:** Next.js 16 App Router, server actions, Prisma (mocked in tests), Vitest + Testing Library. Tests mock `@/lib/db` — no real database.

## Global Constraints

- Branch: work happens on `chore/sister-onboarding` (already checked out). NEVER commit to `main`, never merge, never deploy.
- Vocabulary: follow `CONTEXT.md` — the glossary already defines **Admin** and the author-scoped **Feedback panel**; never use terms its *Avoid* lists forbid (e.g. "user" where **Traveller** is meant, "report/ticket" for a Feedback note).
- Every change lands with a test that fails before and passes after.
- Test conventions: hoisted `vi.hoisted` mock blocks, `vi.mock("@/lib/db", ...)`, `afterEach(vi.clearAllMocks)` — copy the shape already in the file you're editing.
- Conventional commits (`feat:`/`fix:`/`test:` with scope), matching existing history (e.g. `fix(feedback): ...`).
- Verification: `npx vitest run <file>` per task; the finisher runs the full `npx vitest run`, `npx tsc --noEmit`, `npm run lint`.
- This sandbox has no local Postgres and no R2 credentials; all tests are logic-level with mocked db/storage. Do not attempt `docker compose up` or live upload verification.

---

### Task 1: Author-scope `listFeedbackNotes`, with `ADMIN_EMAILS` override

**Files:**
- Modify: `server/actions/feedback.ts` (the `listFeedbackNotes` function, ~line 105–121, and its doc comment)
- Test: `server/actions/feedback.test.ts` (the `describe("listFeedbackNotes")` block, ~line 118–135)

**Interfaces:**
- Consumes: `requireUser(): Promise<{ id: string; email?: string | null; ... }>` from `@/lib/guards` (already mocked in the test file as `requireUserMock`); `isAdminEmail(email: string | null | undefined): boolean` from `@/lib/admin` (reads `process.env.ADMIN_EMAILS`, comma-separated, case-insensitive — pure, no mocking needed; drive it via `vi.stubEnv`).
- Produces: `listFeedbackNotes(): Promise<ActionResult<{ notes: FeedbackNoteView[] }>>` — same signature as today; only the rows returned change. No other task depends on this.

**Context for the implementer:** Today the function returns *every* note to *any* signed-in user. The decided behaviour: a Traveller sees only the notes they wrote; an **Admin** (email listed in `ADMIN_EMAILS`) sees every author's notes. The panel client (`components/feedback/feedback-launcher.tsx`) already hides the delete button for notes the viewer didn't write (`entry.note.authorId === currentUserId`), so no client change is needed. The `npm run feedback:pull` script reads the DB directly and is unaffected.

- [ ] **Step 1: Rewrite the `listFeedbackNotes` tests — one scoped, one admin**

In `server/actions/feedback.test.ts`, replace the existing single test inside `describe("listFeedbackNotes", ...)` (it currently asserts `where` is `undefined` for a plain traveller — that assertion is the old behaviour) with:

```ts
describe("listFeedbackNotes", () => {
  it("returns only the caller's own notes, oldest first", async () => {
    requireUserMock.mockResolvedValue(author);
    feedbackNoteFindManyMock.mockResolvedValue([row]);

    const result = await listFeedbackNotes();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].authorName).toBe("Cam");
    expect(feedbackNoteFindManyMock.mock.calls[0][0].where).toEqual({
      authorId: "u1",
    });
    expect(feedbackNoteFindManyMock.mock.calls[0][0].orderBy).toEqual({
      authoredAt: "asc",
    });
  });

  it("returns every author's notes to an Admin (ADMIN_EMAILS match)", async () => {
    vi.stubEnv("ADMIN_EMAILS", "operator@example.com");
    requireUserMock.mockResolvedValue({
      ...author,
      email: "Operator@Example.com", // case-insensitive match is part of the contract
    });
    feedbackNoteFindManyMock.mockResolvedValue([row]);

    const result = await listFeedbackNotes();

    expect(result.success).toBe(true);
    expect(feedbackNoteFindManyMock.mock.calls[0][0].where).toBeUndefined();
  });

  it("does not treat a signed-in non-admin as an Admin when ADMIN_EMAILS is set", async () => {
    vi.stubEnv("ADMIN_EMAILS", "operator@example.com");
    requireUserMock.mockResolvedValue({ ...author, email: "sister@example.com" });
    feedbackNoteFindManyMock.mockResolvedValue([]);

    await listFeedbackNotes();

    expect(feedbackNoteFindManyMock.mock.calls[0][0].where).toEqual({
      authorId: "u1",
    });
  });
});
```

Notes: the existing `author` fixture is `{ id: "u1", name: "Cam" }` with no email — `isAdminEmail(undefined)` is `false`, so the first test needs no env stub. Add `vi.unstubAllEnvs()` to the file's existing `afterEach` (alongside `vi.clearAllMocks()`) so the stubbed `ADMIN_EMAILS` never leaks between tests.

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run server/actions/feedback.test.ts`
Expected: FAIL — "returns only the caller's own notes" fails because `where` is `undefined` (unscoped), the other two may pass/fail incidentally; the point is the scoping assertion fails against current code.

- [ ] **Step 3: Implement the scoping**

In `server/actions/feedback.ts`, add the import:

```ts
import { isAdminEmail } from "@/lib/admin";
```

Replace `listFeedbackNotes` (function + doc comment) with:

```ts
/**
 * The caller's own Feedback notes, oldest first — the panel reads as a private
 * log to the operator, not a shared forum. An Admin (ADMIN_EMAILS) sees every
 * author's notes; `feedback:pull` reads the database directly and is
 * unaffected by this scoping.
 */
export async function listFeedbackNotes(): Promise<
  ActionResult<{ notes: FeedbackNoteView[] }>
> {
  const user = await requireUser();

  const rows = await db.feedbackNote.findMany({
    ...(isAdminEmail(user.email) ? {} : { where: { authorId: user.id } }),
    orderBy: { authoredAt: "asc" },
    select: VIEW_SELECT,
  });

  return ok({ notes: (rows as FeedbackNoteRow[]).map(toView) });
}
```

(The spread keeps `where` *absent* — not `where: undefined` — for the admin case, matching the test's `toBeUndefined()` either way but staying honest with Prisma's types.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/actions/feedback.test.ts`
Expected: PASS — all tests in the file, not just the new ones (the createFeedbackNote/deleteFeedbackNote tests must be untouched).

- [ ] **Step 5: Commit**

```bash
git add server/actions/feedback.ts server/actions/feedback.test.ts
git commit -m "fix(feedback): scope the panel to its author, Admins see all"
```

---

### Task 2: A failed blob write cleans up its Attachment row

**Files:**
- Modify: `server/actions/attachments.ts` (`uploadAttachment` — both the globe-scoped path ~lines 112–142 and the trip-scoped path ~lines 144–192)
- Test: `server/actions/attachments.test.ts` (extend `describe("uploadAttachment")`)

**Interfaces:**
- Consumes: `getStorage().save(key, bytes, mime): Promise<void>` (mocked as `storageSaveMock`), `db.attachment.create/update/delete` (mocked), `recordActivity` (mocked). All mocks already exist in the test file's hoisted block.
- Produces: `uploadAttachment(formData): Promise<AttachmentActionResult>` — unchanged signature. On a storage-write failure it now returns `{ success: false, error: "Upload failed — nothing was saved. Please try again." }` and leaves no Attachment row behind.

**Context for the implementer:** `uploadAttachment` creates the Attachment row *first* (its id feeds the storage key via `generateKey`), then writes the blob, then updates the row with url + storageKey. If `save()` throws (e.g. storage misconfigured), the action currently throws and the placeholder row (empty `url`, null `storageKey`) is stranded forever. Keep the row-first order — it's load-bearing — and instead delete the row on write failure. The same pattern appears twice: once in the globe-scoped path, once in the trip-scoped path. Fix both. (`server/actions/cover.ts` writes blob-first and is already safe — leave it alone.)

- [ ] **Step 1: Write the failing tests**

In `server/actions/attachments.test.ts`, inside `describe("uploadAttachment")`, add (reusing the file's `makeFormData` helper and `ATTACHMENT_ID` constant; for the globe-path FormData, mirror whatever shape the file's existing globe-path tests use — globeId wins over the helper's default tripId because the globe branch is checked first):

```ts
describe("storage write failure", () => {
  it("trip path: deletes the placeholder row and reports failure", async () => {
    storageSaveMock.mockRejectedValueOnce(new Error("EROFS: read-only file system"));

    const result = await uploadAttachment(makeFormData());

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Upload failed — nothing was saved. Please try again.");
    expect(attachmentDeleteMock).toHaveBeenCalledWith({
      where: { id: ATTACHMENT_ID },
    });
    expect(attachmentUpdateMock).not.toHaveBeenCalled();
    expect(recordActivityMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("globe path: deletes the placeholder row and reports failure", async () => {
    storageSaveMock.mockRejectedValueOnce(new Error("EROFS: read-only file system"));

    const result = await uploadAttachment(makeFormData({ globeId: "g1" }));

    expect(result.success).toBe(false);
    expect(attachmentDeleteMock).toHaveBeenCalledWith({
      where: { id: ATTACHMENT_ID },
    });
    expect(attachmentUpdateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("still succeeds when the write works (row-first order preserved)", async () => {
    const result = await uploadAttachment(makeFormData());

    expect(result.success).toBe(true);
    expect(attachmentDeleteMock).not.toHaveBeenCalled();
    // row created before blob written — the id feeds the storage key
    expect(attachmentCreateMock.mock.invocationCallOrder[0]).toBeLessThan(
      storageSaveMock.mock.invocationCallOrder[0],
    );
  });
});
```

- [ ] **Step 2: Run to verify the failure tests fail**

Run: `npx vitest run server/actions/attachments.test.ts`
Expected: the two failure tests FAIL — today the rejected `save()` makes `uploadAttachment` itself reject (unhandled), so the tests error rather than see a `{ success: false }` result. The success-path test should already pass.

- [ ] **Step 3: Implement the cleanup in both paths**

In `server/actions/attachments.ts`, in the **globe-scoped path**, replace:

```ts
    const storageKey = generateKey({ globe: globeId }, attachment.id, file.name);
    await getStorage().save(storageKey, bytes, file.type);
```

with:

```ts
    const storageKey = generateKey({ globe: globeId }, attachment.id, file.name);
    try {
      await getStorage().save(storageKey, bytes, file.type);
    } catch (err) {
      // Blob write failed: remove the placeholder row so no orphan Attachment
      // (empty url, no storageKey) is left behind. Best-effort delete — the
      // failure we report is the write, not the cleanup.
      console.error("uploadAttachment: storage write failed", err);
      await db.attachment.delete({ where: { id: attachment.id } }).catch(() => {});
      return { success: false, error: "Upload failed — nothing was saved. Please try again." };
    }
```

And in the **trip-scoped path**, replace:

```ts
  // Persist the file bytes.
  await getStorage().save(storageKey, bytes, file.type);
```

with:

```ts
  // Persist the file bytes.
  try {
    await getStorage().save(storageKey, bytes, file.type);
  } catch (err) {
    // Blob write failed: remove the placeholder row so no orphan Attachment
    // (empty url, no storageKey) is left behind. Best-effort delete — the
    // failure we report is the write, not the cleanup.
    console.error("uploadAttachment: storage write failed", err);
    await db.attachment.delete({ where: { id: attachment.id } }).catch(() => {});
    return { success: false, error: "Upload failed — nothing was saved. Please try again." };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/actions/attachments.test.ts`
Expected: PASS — new tests and every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add server/actions/attachments.ts server/actions/attachments.test.ts
git commit -m "fix(attachments): failed blob write no longer strands an orphan row"
```

---

### Task 3: Trips empty state points a new Traveller at the help guide

**Files:**
- Modify: `app/(app)/trips/page.tsx` (the `EmptyState` in the `trips.length === 0` branch, ~lines 113–124)
- Create: `app/(app)/trips/page.test.tsx`

**Interfaces:**
- Consumes: `EmptyState` (`components/ui/empty-state.tsx` — props `icon/title/description/action`, `action` is any ReactNode), `Button` (`components/ui/button.tsx` — verify the variant name for a low-emphasis link-style button by reading that file; the repo uses cva variants, likely `ghost` or `link`), the help guide route `/help` (exists at `app/(app)/help`; the user-menu already labels it "How to use TEEPEE" in `app/(app)/layout.tsx:141` — keep that exact phrasing).
- Produces: nothing other tasks consume.

**Context for the implementer:** The help guide is freshly audited and good, but reachable only from the user-menu dropdown. A brand-new Traveller lands on `/trips` with zero trips; the empty state is the one screen we know they'll read. Add a second, lower-emphasis action linking to `/help`, keeping "New trip" primary. Match the existing copy voice (sentence case, warm, no exclamation marks beyond what's already there).

- [ ] **Step 1: Write the failing test**

Create `app/(app)/trips/page.test.tsx`. The page is an async server component that calls `requireUser()` and `db.tripMember.findMany()`; mock both, plus `next/link`, and stub the heavier child components — follow the mock idioms of `app/(app)/layout.test.tsx` (hoisted mocks, `vi.mock("@/lib/db", ...)`, plain-`<a>` link stub):

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { requireUserMock, tripMemberFindManyMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  tripMemberFindManyMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/db", () => ({
  db: { tripMember: { findMany: tripMemberFindManyMock } },
}));

// next/link renders a plain <a> in jsdom
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children?: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Client/heavy children the empty state never renders — stub to keep the
// jsdom render cheap and free of client-only hooks.
vi.mock("@/components/trip/trip-card", () => ({ TripCard: () => null }));
vi.mock("@/components/ui/animated-list", () => ({
  AnimatedList: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  AnimatedItem: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

import TripsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "u1", name: "Sis", email: "sis@example.com" });
  tripMemberFindManyMock.mockResolvedValue([]);
});

describe("TripsPage empty state", () => {
  it("offers the help guide alongside creating the first trip", async () => {
    render(await TripsPage());

    expect(screen.getByText("No trips yet")).toBeInTheDocument();

    const helpLink = screen.getByRole("link", { name: /how to use teepee/i });
    expect(helpLink).toHaveAttribute("href", "/help");

    // "New trip" stays the primary action (header + empty state).
    const newTripLinks = screen.getAllByRole("link", { name: /new trip/i });
    expect(newTripLinks.some((a) => a.getAttribute("href") === "/trips/new")).toBe(true);
  });
});
```

If the render trips over another client-only import pulled in by the page module, stub that module the same way — mock at the module boundary, don't restructure the page.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "app/(app)/trips/page.test.tsx"`
Expected: FAIL on `getByRole("link", { name: /how to use teepee/i })` — no such link exists yet. (If the render itself errors on an unmocked import, fix the test's mocks first until the only failure is the missing link.)

- [ ] **Step 3: Add the help link to the empty state**

In `app/(app)/trips/page.tsx`, replace the `EmptyState` block:

```tsx
        <EmptyState
          icon={PlaneTakeoff}
          title="No trips yet"
          description="Create your first trip and start planning your next adventure together."
          action={
            <div className="flex flex-col items-center gap-2">
              <Button asChild>
                <Link href="/trips/new">New trip</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/help">New here? How to use TEEPEE</Link>
              </Button>
            </div>
          }
        />
```

Check `components/ui/button.tsx` for the actual variant list first — if there's a `link` variant that reads better as a quiet text link, prefer it over `ghost`; keep the label text exactly "New here? How to use TEEPEE" so the accessible-name assertion holds.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/(app)/trips/page.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/trips/page.tsx" "app/(app)/trips/page.test.tsx"
git commit -m "feat(trips): point the empty state at the help guide"
```

---

## Final verification (after all tasks)

- [ ] `npx vitest run` — full suite green (baseline was fully green before this plan)
- [ ] `npx tsc --noEmit` — clean
- [ ] `npm run lint` — clean
- [ ] Confirm still on `chore/sister-onboarding`, nothing touched `main`, nothing deployed
