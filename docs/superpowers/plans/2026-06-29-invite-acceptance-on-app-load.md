# Invite Acceptance on App-Load Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an invited Traveller actually join their trip, by reconciling pending invites on every authenticated app-load — not only inside the Auth.js `signIn` event (which never fires for an already-logged-in partner).

**Architecture:** The conversion of an `Invite` → `TripMember` already lives in the idempotent `acceptPendingInvitesForUser(userId, email)` in `lib/invites.ts`. We (1) harden its error handling so a failed membership-create no longer silently marks the invite accepted, then (2) call it from the authenticated `(app)` route-group layout, which is the single server-side gate every in-app page passes through. No schema, route, or UI changes.

**Tech Stack:** Next.js 16 (App Router, React Server Components), Auth.js v5 (JWT sessions), Prisma 7 (Postgres via `@prisma/adapter-pg`), Vitest.

---

## Background (read before starting)

The bug: `acceptPendingInvitesForUser` has exactly one caller — Auth.js `events.signIn` in `lib/auth.ts:84-88` — which fires only on a *fresh* login. JWT sessions last ~30 days, so a partner who is already signed in never re-triggers it and never becomes a `TripMember`. See `docs/adr/0017-invites-accepted-by-email-match-reconciled-on-app-load.md` for the decision record and `CONTEXT.md` ("Invite") for the domain term.

Two current defects in `lib/invites.ts` we are fixing along the way (lines 107-138):
- The `db.tripMember.create(...).catch(() => {})` swallows **all** errors, then the very next line marks the invite accepted regardless — so a failed create still "accepts" the invite, leaving the Traveller with no membership.
- The outer `} catch {}` swallows everything silently, which (now that this runs on every load) would hide a repeating failure forever.

## File Structure

- `lib/invites.ts` (modify) — harden the `toCreate` loop (only treat a unique-constraint race as success; otherwise skip marking accepted) and log instead of silently swallowing. The pure `decideMembershipsToCreate` is untouched.
- `lib/invites-accept.test.ts` (create) — unit tests for the side-effectful `acceptPendingInvitesForUser` with a mocked `@/lib/db`. Kept separate from `lib/invites.test.ts` so the existing pure-function tests stay mock-free.
- `app/(app)/layout.tsx` (modify) — after the existing `session.user.id` guard, call `acceptPendingInvitesForUser` with the already-loaded `session.user.email`.
- `CONTEXT.md` + `docs/adr/0017-*.md` (already written during grilling) — committed in Task 1.

---

## Task 1: Commit the agreed documentation

The glossary term and ADR were written during the grilling step and are sitting uncommitted in the working tree. Land them first so history reads docs → fix → wiring.

**Files:**
- Modify: `CONTEXT.md` (added the **Invite** term)
- Create: `docs/adr/0017-invites-accepted-by-email-match-reconciled-on-app-load.md`

- [ ] **Step 1: Confirm the doc changes are present and correct**

Run: `git status --short CONTEXT.md docs/adr/0017-invites-accepted-by-email-match-reconciled-on-app-load.md`
Expected: `CONTEXT.md` shows ` M` and the ADR shows `??`.

Run: `git diff CONTEXT.md`
Expected: a new `**Invite**:` glossary block inserted after the `**Traveller**:` block.

- [ ] **Step 2: Commit**

```bash
git add CONTEXT.md docs/adr/0017-invites-accepted-by-email-match-reconciled-on-app-load.md
git commit -m "docs(invites): glossary term + ADR 0017 for email-match acceptance"
```

---

## Task 2: Harden `acceptPendingInvitesForUser` error handling

Make membership-create failures honest: a unique-constraint race (`P2002`) means "already a member" → safe to mark accepted; any other error means we did NOT create membership → do not mark accepted (so the next app-load retries), and log it.

**Files:**
- Create: `lib/invites-accept.test.ts`
- Modify: `lib/invites.ts:107-138`

- [ ] **Step 1: Write the failing tests**

Create `lib/invites-accept.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the side-effectful acceptPendingInvitesForUser.
 *
 * Mocks @/lib/db so we can assert Prisma call shapes and drive the
 * membership-create failure paths. Kept separate from invites.test.ts, which
 * tests the pure decideMembershipsToCreate with no mocks.
 */

const {
  inviteFindManyMock,
  inviteUpdateMock,
  tripMemberFindManyMock,
  tripMemberCreateMock,
} = vi.hoisted(() => ({
  inviteFindManyMock: vi.fn(),
  inviteUpdateMock: vi.fn(),
  tripMemberFindManyMock: vi.fn(),
  tripMemberCreateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    invite: { findMany: inviteFindManyMock, update: inviteUpdateMock },
    tripMember: { findMany: tripMemberFindManyMock, create: tripMemberCreateMock },
  },
}));

import { acceptPendingInvitesForUser } from "./invites";

const USER_ID = "user-1";
const EMAIL = "partner@example.com";

afterEach(() => vi.clearAllMocks());

describe("acceptPendingInvitesForUser", () => {
  it("creates membership and marks the invite accepted on the happy path", async () => {
    inviteFindManyMock.mockResolvedValue([{ id: "inv-1", tripId: "trip-1", email: EMAIL }]);
    tripMemberFindManyMock.mockResolvedValue([]);
    tripMemberCreateMock.mockResolvedValue({});
    inviteUpdateMock.mockResolvedValue({});

    await acceptPendingInvitesForUser(USER_ID, EMAIL);

    expect(tripMemberCreateMock).toHaveBeenCalledWith({
      data: { tripId: "trip-1", userId: USER_ID, role: "member" },
    });
    expect(inviteUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv-1" } }),
    );
  });

  it("treats a P2002 unique-constraint race as success and still marks accepted", async () => {
    inviteFindManyMock.mockResolvedValue([{ id: "inv-1", tripId: "trip-1", email: EMAIL }]);
    tripMemberFindManyMock.mockResolvedValue([]);
    tripMemberCreateMock.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );
    inviteUpdateMock.mockResolvedValue({});

    await acceptPendingInvitesForUser(USER_ID, EMAIL);

    expect(inviteUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv-1" } }),
    );
  });

  it("does NOT mark accepted when membership creation fails for a non-unique error, and logs it", async () => {
    inviteFindManyMock.mockResolvedValue([{ id: "inv-1", tripId: "trip-1", email: EMAIL }]);
    tripMemberFindManyMock.mockResolvedValue([]);
    tripMemberCreateMock.mockRejectedValue(new Error("connection refused"));
    inviteUpdateMock.mockResolvedValue({});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await acceptPendingInvitesForUser(USER_ID, EMAIL);

    expect(inviteUpdateMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns early without touching memberships when there are no pending invites", async () => {
    inviteFindManyMock.mockResolvedValue([]);

    await acceptPendingInvitesForUser(USER_ID, EMAIL);

    expect(tripMemberFindManyMock).not.toHaveBeenCalled();
    expect(tripMemberCreateMock).not.toHaveBeenCalled();
    expect(inviteUpdateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/invites-accept.test.ts`
Expected: the "does NOT mark accepted…" test FAILS (current code calls `invite.update` regardless and does not log). Others may pass.

- [ ] **Step 3: Implement the hardening**

In `lib/invites.ts`, replace the `for (const invite of toCreate)` loop, the `toAcceptOnly` loop, and the outer `catch` (current lines 107-138) with:

```ts
    for (const invite of toCreate) {
      try {
        await db.tripMember.create({
          data: { tripId: invite.tripId, userId, role: "member" },
        });
      } catch (err) {
        // A unique-constraint violation (P2002) is the only "safe" failure: it
        // means a concurrent sign-in already created the membership, which is
        // exactly the end-state we want — so fall through and mark accepted.
        // Any other error means membership was NOT created; skip marking the
        // invite accepted so the next app-load retries, and surface the error.
        if (!isUniqueConstraintError(err)) {
          console.error(
            `acceptPendingInvitesForUser: failed to create membership for trip ${invite.tripId}`,
            err,
          );
          continue;
        }
      }

      // Mark invite accepted (membership now exists).
      await db.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: now },
      });
    }

    // Also mark any remaining pending invites for trips already joined as accepted.
    const toAcceptOnly = pendingInvites.filter(
      (inv) => !toCreate.some((c) => c.id === inv.id),
    );
    for (const invite of toAcceptOnly) {
      await db.invite
        .update({ where: { id: invite.id }, data: { acceptedAt: now } })
        .catch((err) => {
          console.error(
            `acceptPendingInvitesForUser: failed to mark invite ${invite.id} accepted`,
            err,
          );
        });
    }
  } catch (err) {
    // Best-effort: never block sign-in or page render on invite acceptance.
    console.error("acceptPendingInvitesForUser failed", err);
  }
}
```

Then add this helper just below the `acceptPendingInvitesForUser` function (still inside `lib/invites.ts`, at module scope):

```ts
/**
 * True for a Prisma unique-constraint violation (P2002). Checked structurally
 * (by `code`) rather than via `instanceof` so it stays driver-adapter-agnostic
 * and trivially mockable in tests.
 */
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/invites-accept.test.ts lib/invites.test.ts`
Expected: PASS — all tests in both files green.

- [ ] **Step 5: Commit**

```bash
git add lib/invites.ts lib/invites-accept.test.ts
git commit -m "fix(invites): only accept after confirmed membership; log failures"
```

---

## Task 3: Reconcile pending invites on authenticated app-load

Call the (now hardened) reconciler from the `(app)` layout so an already-signed-in partner joins the moment they next open the app.

**Files:**
- Modify: `app/(app)/layout.tsx:4-7` (imports) and `:55-61` (after the auth guard)

- [ ] **Step 1: Add the import**

In `app/(app)/layout.tsx`, add to the import block near the top (next to the existing `import { auth } from "@/lib/auth";` on line 4):

```ts
import { acceptPendingInvitesForUser } from "@/lib/invites";
```

- [ ] **Step 2: Call the reconciler after the auth guard**

In `app/(app)/layout.tsx`, the layout currently has:

```ts
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const { name, email, image } = session.user;
```

Change it to reconcile pending invites once the user is known. `acceptPendingInvitesForUser` is idempotent and best-effort (it never throws), so awaiting it is safe and guarantees membership exists before any page that reads it renders:

```ts
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const { name, email, image } = session.user;

  // An Invite becomes membership when the matching person is signed in. The
  // Auth.js signIn event only fires on a fresh login, so an already-logged-in
  // partner would never join — reconcile on every app-load too. Idempotent and
  // best-effort (see ADR 0017).
  if (email) {
    await acceptPendingInvitesForUser(session.user.id, email);
  }
```

- [ ] **Step 3: Typecheck the wiring**

Run: `npx tsc --noEmit`
Expected: no errors (confirms the import path and call signature are correct).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors/warnings for `app/(app)/layout.tsx` (e.g. no unused import).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all suites PASS (including the new `lib/invites-accept.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/layout.tsx"
git commit -m "fix(invites): accept pending invites on authenticated app-load"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** hook point in `(app)` layout → Task 3; awaited/unconditional/no-memo → Task 3 Step 2 + comment; email from session, guarded → Task 3 Step 2; harden accept loop + log → Task 2; silent auto-join (no Activity) → no code, correct by omission; docs (CONTEXT term + ADR) → Task 1; out-of-scope token/`.env` → untouched. All covered.
- **Placeholder scan:** none — every code step has complete code and exact commands.
- **Type/name consistency:** `acceptPendingInvitesForUser(userId, email)` signature matches `lib/invites.ts:73`; `isUniqueConstraintError` defined and used in the same task; `session.user.email` / `session.user.id` match the `Session` type in `types/next-auth.d.ts`.
