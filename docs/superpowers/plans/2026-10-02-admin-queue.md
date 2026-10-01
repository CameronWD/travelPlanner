# Admin queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Admin sees a dot on every signed-in page while anything is waiting on them (pending Access requests + Needs-review Feedback notes), an Account card saying what, and a read-only list of the Needs-review notes on `/admin`.

**Architecture:** One pure, client-safe module (`lib/admin-queue.ts`) defines the `AdminQueue` shape and the label/name helpers; one server-only loader (`lib/admin-queue-loader.ts`) runs the two `count` queries. The app layout already computes an Admin-only count and hands it down through `ShellUser`; that field becomes `adminQueue: AdminQueue`, so the avatar triggers, the phone You tab, the menu badge and the Account card all read the same numbers. `/admin` gains a fourth data call and a read-only section. Nothing about pushes changes.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before touching a route), React 19, Tailwind v4, Prisma, Vitest + Testing Library (jsdom). No new dependency.

**Spec:** `docs/specs/2026-10-02-admin-queue.md` — read it first; the plan argues from it. Glossary: `CONTEXT.md` **Admin queue**, **Admin**, **Access request**, **Feedback note**.

## Global Constraints

- Branch `feat/admin-queue-2026-10-02`, created from `main` in place (no worktree — `node_modules` and `.env` live here, as every prior branch did). Never commit to `main`; never push; never deploy; never run `npm run feedback:pull` / `feedback:resolve` / `feedback:accept` (they open production).
- Every task ends green for the files it touched: `TZ=UTC npx vitest run <paths>`, then `npx tsc --noEmit` and `npm run lint`. The full `npm test` runs once in Task 7. Pre-existing failures under node 22 (`lib/money.test.ts` ×2, two home tiles — Intl compact formatting) are not this branch's; note them, do not fix them.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No `Resolves-Feedback:` trailer — no open note asks for this.
- Pushes are untouched: `lib/admin-notify.ts`, `lib/access-requests.ts`, `lib/auth.ts`, `lib/error-sink.ts` change nothing but one doc-comment sentence in Task 7. No "seen" state; nothing new is stored; no migration.
- Errors (`ErrorReport`) are never counted in the queue.
- Copy, exact. Card title `Admin queue`; lines `{n} Access request waiting` / `{n} Access requests waiting`, `{n} Feedback note needs review` / `{n} Feedback notes need review`; empty `Nothing waiting.`; link `Open Admin`. `/admin` section `Feedback needing review`, hint `Accept or decline from the terminal`, empty `No Feedback notes waiting for review.`. Menu badge aria-label `{n} access request(s)[ and {m} feedback note(s)] waiting`. Trigger names `Open traveller menu, {t} waiting in Admin` and `You, {t} waiting in Admin`, unchanged when the queue is empty.
- The dot is Admins only and only while the total is above zero; a non-Admin never triggers a count. The dot is `aria-hidden` with `data-testid="admin-queue-dot"`; the meaning lives in the trigger's accessible name.
- Terminology in code comments and copy: Admin queue, Access request, Feedback note, Needs review. Never "notification", "alert", "inbox" for this.
- `next dev` re-adds a block to `CLAUDE.md`; never commit that change.

## Review Focus

Spec-implied inputs no task's tests would otherwise exercise, most likely to bite first; each has its pinning test in the owning task.

1. **A count query fails for an Admin** (Neon idle, timeout): the Admin link, the avatar and the Account page must all still render, with no dot and no badge — Task 2 pins the layout, Task 5 pins Account.
2. **A Needs-review note from before sites were recorded (`site: null`)** counts and lists as Main: no chip when viewed on main — Task 6 pins `toReviewView` and the action with `VERCEL_ENV=production`.
3. **A queue above nine**: the menu badge says `9+` but the Account card says the real number (`12 Access requests waiting`) — Task 2 and Task 5 pin each side.
4. **A non-Admin whose session would otherwise light the dot** (counts non-zero in the database): no query runs, no dot on any trigger or tab, no card — Task 2 (layout), Task 4 (You tab), Task 5 (Account).
5. **An approved Access request still has `status: "pending"`** and must not count; an `OPEN` note by a non-Admin must not list — Task 1 pins the `resolvedAt` predicate, Task 6 pins the `NEEDS_REVIEW` filter.

---

### Task 1: The Admin queue — pure helpers and the server-side count

**Files:**
- Create: `lib/admin-queue.ts`
- Create: `lib/admin-queue.test.ts`
- Create: `lib/admin-queue-loader.ts`
- Create: `lib/admin-queue-loader.test.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/db` (Prisma: `db.accessRequest.count`, `db.feedbackNote.count`).
- Produces (used by every later task):
  ```ts
  export interface AdminQueue { accessRequests: number; feedbackNeedingReview: number }
  export const EMPTY_ADMIN_QUEUE: AdminQueue
  export function adminQueueTotal(queue: AdminQueue): number
  export function hasAdminQueue(isAdmin: boolean, queue: AdminQueue): boolean
  export function adminQueueLabel(queue: AdminQueue): string          // "1 access request and 2 feedback notes waiting" | ""
  export function withAdminQueueName(base: string, isAdmin: boolean, queue: AdminQueue): string // "Open traveller menu, 3 waiting in Admin" | base
  // lib/admin-queue-loader.ts (server only — imports db)
  export async function countAdminQueue(): Promise<AdminQueue>
  ```

- [ ] **Step 1: Branch, and commit the refreshed feedback inbox**

The session-start `feedback:pull` already rewrote `docs/feedback/inbox.md` (it is modified and uncommitted on `main`). Carry it onto the branch first so the branch starts from a clean tree:

```bash
git checkout -b feat/admin-queue-2026-10-02
git add docs/feedback/inbox.md
git commit -m "chore: refresh feedback inbox (2 open, 1 needs review)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git status --short   # expect: nothing else modified
```

- [ ] **Step 2: Write the failing tests for the pure helpers**

`lib/admin-queue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  EMPTY_ADMIN_QUEUE,
  adminQueueLabel,
  adminQueueTotal,
  hasAdminQueue,
  withAdminQueueName,
} from "./admin-queue";

describe("adminQueueTotal", () => {
  it("sums both kinds", () => {
    expect(adminQueueTotal({ accessRequests: 2, feedbackNeedingReview: 3 })).toBe(5);
    expect(adminQueueTotal(EMPTY_ADMIN_QUEUE)).toBe(0);
  });
});

describe("hasAdminQueue", () => {
  it("is true only for an Admin with something waiting", () => {
    expect(hasAdminQueue(true, { accessRequests: 1, feedbackNeedingReview: 0 })).toBe(true);
    expect(hasAdminQueue(true, { accessRequests: 0, feedbackNeedingReview: 1 })).toBe(true);
    expect(hasAdminQueue(true, EMPTY_ADMIN_QUEUE)).toBe(false);
    expect(hasAdminQueue(false, { accessRequests: 1, feedbackNeedingReview: 1 })).toBe(false);
  });
});

describe("adminQueueLabel", () => {
  it("names each kind, pluralised, joined with 'and'", () => {
    expect(adminQueueLabel({ accessRequests: 1, feedbackNeedingReview: 0 })).toBe("1 access request waiting");
    expect(adminQueueLabel({ accessRequests: 3, feedbackNeedingReview: 0 })).toBe("3 access requests waiting");
    expect(adminQueueLabel({ accessRequests: 0, feedbackNeedingReview: 1 })).toBe("1 feedback note waiting");
    expect(adminQueueLabel({ accessRequests: 2, feedbackNeedingReview: 2 })).toBe(
      "2 access requests and 2 feedback notes waiting",
    );
  });

  it("is empty when nothing is waiting", () => {
    expect(adminQueueLabel(EMPTY_ADMIN_QUEUE)).toBe("");
  });
});

describe("withAdminQueueName", () => {
  it("appends the total only for an Admin with something waiting", () => {
    expect(withAdminQueueName("You", true, EMPTY_ADMIN_QUEUE)).toBe("You");
    expect(withAdminQueueName("You", false, { accessRequests: 1, feedbackNeedingReview: 1 })).toBe("You");
    expect(
      withAdminQueueName("Open traveller menu", true, { accessRequests: 1, feedbackNeedingReview: 1 }),
    ).toBe("Open traveller menu, 2 waiting in Admin");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `TZ=UTC npx vitest run lib/admin-queue.test.ts`
Expected: FAIL — `Failed to resolve import "./admin-queue"`.

- [ ] **Step 4: Write the pure module**

`lib/admin-queue.ts`:

```ts
/**
 * The **Admin queue** (CONTEXT.md): everything waiting on an Admin's
 * decision, counted together — pending Access requests plus Feedback notes
 * still at Needs review. Pure and client-safe (no db import), so the shell's
 * client components — the account menu, the Dock, the phone tab bar — can
 * use these helpers. The counts themselves come from
 * lib/admin-queue-loader.ts, which is server-only.
 *
 * Queue-based, not seen-based (spec 2026-10-02 §A): there is no "last
 * looked" anywhere; the total is simply what is still undecided.
 */
export interface AdminQueue {
  accessRequests: number;
  feedbackNeedingReview: number;
}

export const EMPTY_ADMIN_QUEUE: AdminQueue = { accessRequests: 0, feedbackNeedingReview: 0 };

export function adminQueueTotal(queue: AdminQueue): number {
  return queue.accessRequests + queue.feedbackNeedingReview;
}

/** Whether the dot shows: Admins only, and only while something is waiting. */
export function hasAdminQueue(isAdmin: boolean, queue: AdminQueue): boolean {
  return isAdmin && adminQueueTotal(queue) > 0;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The menu badge's accessible name: "1 access request and 2 feedback notes waiting" — "" when nothing is. */
export function adminQueueLabel(queue: AdminQueue): string {
  const parts: string[] = [];
  if (queue.accessRequests > 0) parts.push(plural(queue.accessRequests, "access request", "access requests"));
  if (queue.feedbackNeedingReview > 0) {
    parts.push(plural(queue.feedbackNeedingReview, "feedback note", "feedback notes"));
  }
  return parts.length === 0 ? "" : `${parts.join(" and ")} waiting`;
}

/**
 * The accessible name of a trigger the dot sits on. The dot itself is
 * decorative; this is where the meaning lives. Unchanged when there is no
 * dot, so an unlit trigger reads exactly as it always did.
 */
export function withAdminQueueName(base: string, isAdmin: boolean, queue: AdminQueue): string {
  return hasAdminQueue(isAdmin, queue) ? `${base}, ${adminQueueTotal(queue)} waiting in Admin` : base;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `TZ=UTC npx vitest run lib/admin-queue.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing test for the loader**

`lib/admin-queue-loader.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const accessRequestCountMock = vi.hoisted(() => vi.fn());
const feedbackNoteCountMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  db: {
    accessRequest: { count: accessRequestCountMock },
    feedbackNote: { count: feedbackNoteCountMock },
  },
}));

import { countAdminQueue } from "./admin-queue-loader";

beforeEach(() => {
  accessRequestCountMock.mockReset().mockResolvedValue(0);
  feedbackNoteCountMock.mockReset().mockResolvedValue(0);
});

describe("countAdminQueue", () => {
  it("returns both counts", async () => {
    accessRequestCountMock.mockResolvedValue(2);
    feedbackNoteCountMock.mockResolvedValue(1);
    await expect(countAdminQueue()).resolves.toEqual({ accessRequests: 2, feedbackNeedingReview: 1 });
  });

  // Review Focus 5: approving stamps resolvedAt and leaves status "pending"
  // (server/actions/access-requests.ts), so the predicate is resolvedAt —
  // a status filter would count every approved request for ever.
  it("counts Access requests by resolvedAt, never status", async () => {
    await countAdminQueue();
    expect(accessRequestCountMock).toHaveBeenCalledWith({ where: { resolvedAt: null } });
  });

  it("counts only NEEDS_REVIEW notes, from every site", async () => {
    await countAdminQueue();
    expect(feedbackNoteCountMock).toHaveBeenCalledWith({ where: { status: "NEEDS_REVIEW" } });
  });

  it("rejects when a count rejects — callers degrade to an empty queue", async () => {
    feedbackNoteCountMock.mockRejectedValue(new Error("db down"));
    await expect(countAdminQueue()).rejects.toThrow("db down");
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `TZ=UTC npx vitest run lib/admin-queue-loader.test.ts`
Expected: FAIL — `Failed to resolve import "./admin-queue-loader"`.

- [ ] **Step 8: Write the loader**

`lib/admin-queue-loader.ts`:

```ts
import { db } from "@/lib/db";
import type { AdminQueue } from "@/lib/admin-queue";

/**
 * Count the Admin queue (CONTEXT.md). Server only — imports the db; the
 * helpers that read the result live in lib/admin-queue.ts so client
 * components never pull this in.
 *
 * Not a guard and not an action: the callers (app/(app)/layout.tsx and
 * app/(app)/account/page.tsx) gate on isAdminEmail first, so a non-Admin
 * never pays for these two counts, and nothing here is reachable over the
 * network. Pending Access requests are `resolvedAt IS NULL`, never `status`
 * — approving stamps resolvedAt and leaves status "pending"
 * (server/actions/access-requests.ts listAccessRequests). Needs-review
 * notes count from every site: beta and main share the database, and a
 * note is waiting whichever site it was written on (spec 2026-10-02 §A).
 */
export async function countAdminQueue(): Promise<AdminQueue> {
  const [accessRequests, feedbackNeedingReview] = await Promise.all([
    db.accessRequest.count({ where: { resolvedAt: null } }),
    db.feedbackNote.count({ where: { status: "NEEDS_REVIEW" } }),
  ]);
  return { accessRequests, feedbackNeedingReview };
}
```

- [ ] **Step 9: Run both test files, then the type and lint gates**

Run: `TZ=UTC npx vitest run lib/admin-queue.test.ts lib/admin-queue-loader.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS (8 tests), no type errors, no lint errors.

- [ ] **Step 10: Commit**

```bash
git add lib/admin-queue.ts lib/admin-queue.test.ts lib/admin-queue-loader.ts lib/admin-queue-loader.test.ts
git commit -m "feat(admin): the Admin queue — pure helpers and the two-count loader

Pending Access requests (resolvedAt null) plus Needs-review Feedback notes,
from every site. Label and trigger-name helpers are client-safe; the count
is server-only. Spec docs/specs/2026-10-02-admin-queue.md §A.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: ShellUser carries the Admin queue; the layout counts it; the menu badge shows the total

**Files:**
- Modify: `components/shell/shell-user.tsx:17-32` (the `ShellUser` interface and its doc)
- Modify: `app/(app)/layout.tsx` (the `listAccessRequests` import; lines 77-90; line 143)
- Modify: `components/shell/sidebar.tsx:14,45,68`
- Modify: `components/shell/sidebar-footer.tsx:22-23,36`
- Modify: `components/shell/account-menu.tsx:5,35,54,84-96`
- Test: `app/(app)/layout.test.tsx` (mocks at 15-42, `beforeEach` at 145, the "Admin nav entry" describe at 411-467)
- Test fixtures (rename only): `components/command-palette-mount.test.tsx:24`, `components/app-rail.test.tsx:40`, `components/shell/trip-switcher.test.tsx:92,102,112`, `components/shell/sidebar-nav.test.tsx:34`, `components/shell/app-shell-rail.test.tsx:41`, `components/feedback/feedback-launcher.test.tsx:246`, `components/trip/use-trip-href.test.tsx:9`, `components/trip/mobile-tab-bar.test.tsx:89`, `components/shell/sidebar.test.tsx:67,150,166,182,308`, `components/trip/trip-nav.test.tsx:247,261`

**Interfaces:**
- Consumes: `AdminQueue`, `EMPTY_ADMIN_QUEUE`, `adminQueueTotal`, `adminQueueLabel` (Task 1); `countAdminQueue` (Task 1).
- Produces: `ShellUser.adminQueue: AdminQueue` (replaces `pendingAccessRequests: number`); `SidebarProps.adminQueue: AdminQueue`; `AccountMenuContentProps` picks `"adminQueue"`. Every later task reads `shell.adminQueue` and `shell.isAdmin`.

- [ ] **Step 1: Rewrite the layout test's Admin-queue mocks and cases (failing)**

In `app/(app)/layout.test.tsx`:

Replace lines 15-19 (the `accessRequestFindManyMock` comment + declaration) with:

```ts
// The Admin queue (lib/admin-queue-loader.ts countAdminQueue) is two
// `count` queries, reached only when the signed-in Traveller is an
// ADMIN_EMAILS operator — isAdminEmail short-circuits first, so a non-admin
// session never queries at all.
const accessRequestCountMock = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const feedbackNoteCountMock = vi.hoisted(() => vi.fn().mockResolvedValue(0));
```

In the `vi.mock("@/lib/db", ...)` block replace `accessRequest: { findMany: accessRequestFindManyMock },` with:

```ts
    accessRequest: { count: accessRequestCountMock },
    feedbackNote: { count: feedbackNoteCountMock },
```

In `beforeEach`, replace `accessRequestFindManyMock.mockResolvedValue([]);` with:

```ts
  accessRequestCountMock.mockResolvedValue(0);
  feedbackNoteCountMock.mockResolvedValue(0);
```

Replace the three badge tests inside `describe("the Admin nav entry", ...)` — "shows a pending-count badge…", "shows no badge…", "still renders the Admin link even if the pending-count query fails" — with these six (keep the two tests above them unchanged):

```ts
    // The badge is load-bearing, not decorative: notifyAdmins' push only
    // reaches the operator if they have a Device registered, and never fires
    // for a typed Sign-in link address (ADR 0057), so the Admin queue is often
    // the ONLY way they learn something is waiting.
    it("shows the Admin queue total as a badge when something is waiting", async () => {
      mockUsePathname.mockReturnValue("/trips/t1");
      process.env.ADMIN_EMAILS = "alice@example.com";
      accessRequestCountMock.mockResolvedValue(2);
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      expect(within(header()).getByText("2")).toBeInTheDocument();
    });

    it("sums Access requests and Needs-review Feedback notes, and names both", async () => {
      mockUsePathname.mockReturnValue("/trips/t1");
      process.env.ADMIN_EMAILS = "alice@example.com";
      accessRequestCountMock.mockResolvedValue(1);
      feedbackNoteCountMock.mockResolvedValue(1);
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      const badge = within(header()).getByLabelText("1 access request and 1 feedback note waiting");
      expect(badge.textContent).toBe("2");
    });

    // Review Focus 3: the badge caps; the Account card (Task 5) does not.
    it("caps the badge at 9+", async () => {
      mockUsePathname.mockReturnValue("/trips/t1");
      process.env.ADMIN_EMAILS = "alice@example.com";
      accessRequestCountMock.mockResolvedValue(7);
      feedbackNoteCountMock.mockResolvedValue(5);
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      expect(within(header()).getByText("9+")).toBeInTheDocument();
    });

    it("shows no badge when the Admin queue is empty", async () => {
      mockUsePathname.mockReturnValue("/trips/t1");
      process.env.ADMIN_EMAILS = "alice@example.com";
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      const link = within(header()).getByRole("link", { name: /^admin/i });
      // Just "Admin" — no trailing count.
      expect(link.textContent?.trim()).toBe("Admin");
    });

    // Review Focus 4: a non-Admin pays nothing and sees nothing.
    it("never counts the queue for an ordinary traveller", async () => {
      mockUsePathname.mockReturnValue("/trips/t1");
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      expect(accessRequestCountMock).not.toHaveBeenCalled();
      expect(feedbackNoteCountMock).not.toHaveBeenCalled();
    });

    // Review Focus 1: the route must stay discoverable even when the count
    // can't be read — a DB hiccup must never take the whole link with it.
    it("still renders the Admin link, with no badge, if the count query fails", async () => {
      mockUsePathname.mockReturnValue("/trips/t1");
      process.env.ADMIN_EMAILS = "alice@example.com";
      accessRequestCountMock.mockRejectedValue(new Error("db down"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);

      const link = within(header()).getByRole("link", { name: /^admin/i });
      expect(link.getAttribute("href")).toBe("/admin");
      expect(link.textContent?.trim()).toBe("Admin");
      errorSpy.mockRestore();
    });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `TZ=UTC npx vitest run "app/(app)/layout.test.tsx"`
Expected: FAIL — the layout still calls `listAccessRequests` → `db.accessRequest.findMany is not a function` (every admin case), and the sum/9+ cases fail.

- [ ] **Step 3: Change the shell's shape**

`components/shell/shell-user.tsx` — add the import at the top (after the `TravellerLike` import):

```ts
import type { AdminQueue } from "@/lib/admin-queue";
```

Replace the `ShellUser` doc comment + the `pendingAccessRequests: number;` line:

```ts
/**
 * The signed-in Traveller as the app shell's chrome needs them: who they are
 * (avatar, name, email for the menu label), whether the Admin entry shows and
 * what is in the Admin queue (CONTEXT.md — the dot on the avatar / You tab
 * and the menu badge read it), and their trips (for the switcher), ordered
 * like the trips list itself (compareForTripList).
 */
export interface ShellUser {
  user: TravellerLike & { email: string | null };
  isAdmin: boolean;
  /** Always EMPTY_ADMIN_QUEUE for a non-Admin — the layout never counts for them. */
  adminQueue: AdminQueue;
  trips: SwitcherTrip[];
```

- [ ] **Step 4: Change the layout**

`app/(app)/layout.tsx`:

Remove the line `import { listAccessRequests } from "@/server/actions/access-requests";` and add:

```ts
import { countAdminQueue } from "@/lib/admin-queue-loader";
import { EMPTY_ADMIN_QUEUE, type AdminQueue } from "@/lib/admin-queue";
```

Replace lines 77-90 (from `const isAdmin = isAdminEmail(email);` through the closing `}` of the `if (isAdmin)` block) with:

```ts
  const isAdmin = isAdminEmail(email);
  // The Admin queue (CONTEXT.md): the dot on the avatar / You tab, the menu
  // badge and the Account card all read these numbers. notifyAdmins' push
  // only reaches the operator if they have a Device registered (ADR 0048),
  // and never fires for a typed Sign-in link address (ADR 0057), so this
  // count is often the ONLY way an Admin learns something is waiting.
  // Failure here must never hide the /admin link itself — only the count —
  // so a DB hiccup degrades to "no dot, no badge", not "no route".
  let adminQueue: AdminQueue = EMPTY_ADMIN_QUEUE;
  if (isAdmin) {
    try {
      adminQueue = await countAdminQueue();
    } catch (err) {
      console.error("[AppLayout] failed to count the Admin queue:", err);
    }
  }
```

Replace line 143:

```ts
  const shellUser: ShellUser = { user: traveller, isAdmin, adminQueue, trips, lastTrip };
```

- [ ] **Step 5: Rename through the sidebar and the menu**

`components/shell/sidebar.tsx`: line 14 `pendingAccessRequests: number;` → `adminQueue: AdminQueue;` (add `import type { AdminQueue } from "@/lib/admin-queue";` to the imports); line 45 destructure `pendingAccessRequests` → `adminQueue`; line 68 `<SidebarFooter user={user} isAdmin={isAdmin} adminQueue={adminQueue} />`.

`components/shell/sidebar-footer.tsx`: lines 22-23 → `adminQueue,` and `}: Pick<ShellUser, "user" | "isAdmin" | "adminQueue">) {`; line 36 → `adminQueue={adminQueue}`.

`components/shell/account-menu.tsx`: add `import { adminQueueLabel, adminQueueTotal } from "@/lib/admin-queue";` after the `Badge` import; line 35 → `Pick<ShellUser, "user" | "isAdmin" | "adminQueue">`; line 54 → `adminQueue,`; replace lines 84-96 (the `{isAdmin && (...)}` block) with:

```tsx
      {isAdmin && (
        <DropdownMenuItem asChild>
          <Link href="/admin" className="flex items-center justify-between gap-2">
            <span>Admin</span>
            {adminQueueTotal(adminQueue) > 0 && (
              <Badge variant="destructive" aria-label={adminQueueLabel(adminQueue)}>
                {adminQueueTotal(adminQueue) > 9 ? "9+" : adminQueueTotal(adminQueue)}
              </Badge>
            )}
          </Link>
        </DropdownMenuItem>
      )}
```

Also update the component doc comment's parenthetical ("Admin (with its pending Access request badge — often the operator's only signal a request is waiting, ADR 0048)") to: "Admin (with its Admin queue badge — CONTEXT.md; with the avatar dot, often the operator's only signal something is waiting)".

- [ ] **Step 6: Sweep the test fixtures**

The mechanical rename, then the import, then three hand edits:

```bash
for f in components/command-palette-mount.test.tsx components/app-rail.test.tsx components/shell/trip-switcher.test.tsx components/shell/sidebar-nav.test.tsx components/shell/app-shell-rail.test.tsx components/feedback/feedback-launcher.test.tsx components/trip/trip-nav.test.tsx components/trip/use-trip-href.test.tsx components/trip/mobile-tab-bar.test.tsx components/shell/sidebar.test.tsx; do
  sed -i '' -e 's/pendingAccessRequests: 0,/adminQueue: EMPTY_ADMIN_QUEUE,/g' -e 's/pendingAccessRequests={0}/adminQueue={EMPTY_ADMIN_QUEUE}/g' "$f"
done
grep -rln 'EMPTY_ADMIN_QUEUE' --include='*.test.tsx' components
```

In every file the grep lists, add `import { EMPTY_ADMIN_QUEUE } from "@/lib/admin-queue";` after its last `import` line.

Hand edits:
- `components/shell/sidebar.test.tsx:67` → `adminQueue={{ accessRequests: opts.pending ?? 0, feedbackNeedingReview: 0 }}`
- `components/shell/sidebar.test.tsx:308` → `expect(within(admin).getByLabelText("3 access requests waiting")).toBeInTheDocument();`
- `components/trip/trip-nav.test.tsx:247` → `adminQueue: { accessRequests: 2, feedbackNeedingReview: 0 },` (and add the `EMPTY_ADMIN_QUEUE` import only if that file still references it after the sed — it has one other fixture at line 122)
- `components/trip/trip-nav.test.tsx:261` → `expect(within(menu).getByLabelText("2 access requests waiting")).toBeInTheDocument();`

Then confirm nothing is left: `grep -rn pendingAccessRequests app components lib server` → no output.

- [ ] **Step 7: Run the touched tests and the gates**

Run:
```bash
TZ=UTC npx vitest run "app/(app)/layout.test.tsx" components/shell components/trip/trip-nav.test.tsx components/trip/use-trip-href.test.tsx components/trip/mobile-tab-bar.test.tsx components/app-rail.test.tsx components/command-palette-mount.test.tsx components/feedback/feedback-launcher.test.tsx && npx tsc --noEmit && npm run lint
```
Expected: PASS everywhere; `tsc` clean (it is the net that catches a missed fixture).

- [ ] **Step 8: Commit**

```bash
git add -A app components lib
git commit -m "feat(admin): ShellUser carries the Admin queue; the menu badge shows its total

The app layout counts the queue (Admins only, degrading to empty on a
failure) instead of listing Access requests for a length. The Admin row's
badge sums both kinds and names them. Spec 2026-10-02 §A/§B.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The dot on the three avatar triggers

**Files:**
- Create: `components/shell/admin-queue-dot.tsx`
- Modify: `app/(app)/layout.tsx:186-194` (the phone top bar's `DropdownMenuTrigger`)
- Modify: `components/shell/dock-extras.tsx:36-44` (`DockAccountMenu` — used by the trips-level Dock in `app-shell-rail.tsx` and inside a Trip by `components/trip/trip-nav.tsx`, so one edit covers both)
- Modify: `components/shell/sidebar-footer.tsx:26-32`
- Test: `app/(app)/layout.test.tsx` (new describe), `components/trip/trip-nav.test.tsx:241-265`, `components/shell/sidebar.test.tsx:303-309`

**Interfaces:**
- Consumes: `hasAdminQueue`, `withAdminQueueName` (Task 1); `shell.isAdmin`, `shell.adminQueue` (Task 2).
- Produces: `export function AdminQueueDot({ className }: { className?: string })` — an `aria-hidden` span, `data-testid="admin-queue-dot"`, absolutely positioned; the parent must be `relative`. Task 4 reuses it.

- [ ] **Step 1: Write the failing tests**

`app/(app)/layout.test.tsx` — add a new describe after `describe("the Admin nav entry", ...)`:

```ts
  // Spec 2026-10-02 §B: the Admin queue's dot on the phone top bar's avatar.
  // The dot is aria-hidden; the trigger's name carries the count.
  describe("the Admin queue dot on the phone top bar", () => {
    it("marks the avatar and names the count for an Admin with something waiting", async () => {
      mockUsePathname.mockReturnValue("/trips/t1");
      process.env.ADMIN_EMAILS = "alice@example.com";
      accessRequestCountMock.mockResolvedValue(1);
      feedbackNoteCountMock.mockResolvedValue(1);
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      const trigger = within(header()).getByRole("button", { name: "Open traveller menu, 2 waiting in Admin" });
      expect(within(trigger).getByTestId("admin-queue-dot")).toBeInTheDocument();
    });

    it("shows nothing, and keeps the plain name, when the queue is empty", async () => {
      mockUsePathname.mockReturnValue("/trips/t1");
      process.env.ADMIN_EMAILS = "alice@example.com";
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      expect(within(header()).getByRole("button", { name: "Open traveller menu" })).toBeInTheDocument();
      expect(within(header()).queryByTestId("admin-queue-dot")).toBeNull();
    });

    it("never shows for an ordinary traveller", async () => {
      mockUsePathname.mockReturnValue("/trips/t1");
      // Would light it if the layout ever read the counts for a non-admin.
      accessRequestCountMock.mockResolvedValue(5);
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      expect(within(header()).getByRole("button", { name: "Open traveller menu" })).toBeInTheDocument();
      expect(within(header()).queryByTestId("admin-queue-dot")).toBeNull();
    });
  });
```

`components/trip/trip-nav.test.tsx` — in the test "pins the signed-in Traveller's avatar menu to the bottom…" (fixture `isAdmin: true, adminQueue: { accessRequests: 2, ... }`), replace line 255 with:

```ts
    const trigger = within(rail).getByRole("button", { name: "Open traveller menu, 2 waiting in Admin" });
    expect(within(trigger).getByTestId("admin-queue-dot")).toBeInTheDocument();
```

`components/shell/sidebar.test.tsx` — inside the test "shows Admin with its pending badge for an admin" (`renderSidebar({ isAdmin: true, pending: 3 })`), add after the existing label assertion:

```ts
      const trigger = screen.getByRole("button", { name: "Open traveller menu, 3 waiting in Admin" });
      expect(within(trigger).getByTestId("admin-queue-dot")).toBeInTheDocument();
```

and add a sibling test right after it:

```ts
    it("shows no dot for an admin with an empty queue", () => {
      renderSidebar({ isAdmin: true, pending: 0 });
      expect(screen.getByRole("button", { name: "Open traveller menu" })).toBeInTheDocument();
      expect(screen.queryByTestId("admin-queue-dot")).toBeNull();
    });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `TZ=UTC npx vitest run "app/(app)/layout.test.tsx" components/trip/trip-nav.test.tsx components/shell/sidebar.test.tsx`
Expected: FAIL — no button named "…, 2 waiting in Admin"; no `admin-queue-dot`.

- [ ] **Step 3: Write the dot**

`components/shell/admin-queue-dot.tsx`:

```tsx
import { cn } from "@/lib/cn";

/**
 * The Admin queue's indicator (CONTEXT.md "Admin queue"; spec 2026-10-02 §B):
 * a filled dot, no number, on the avatar that opens the account menu and on
 * the phone's You tab. Decorative — the trigger it sits on carries the
 * meaning in its accessible name (lib/admin-queue.ts withAdminQueueName).
 * The parent must be `relative`; the default offset puts the dot on the
 * top-right edge of a 36px avatar centred in a 44px trigger. Server-safe
 * (no hooks) so the app layout can render it directly.
 */
export function AdminQueueDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="admin-queue-dot"
      className={cn(
        "pointer-events-none absolute right-1 top-1 size-3 rounded-full border-2 border-background bg-destructive",
        className,
      )}
    />
  );
}
```

- [ ] **Step 4: Put it on the three triggers**

`app/(app)/layout.tsx` — add the imports:

```ts
import { AdminQueueDot } from "@/components/shell/admin-queue-dot";
import { hasAdminQueue, withAdminQueueName } from "@/lib/admin-queue";
```

(merge the second into the existing `@/lib/admin-queue` import from Task 2). Replace the phone top bar's trigger (lines ~186-194):

```tsx
            <DropdownMenu>
              <DropdownMenuTrigger
                className="relative grid size-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={withAdminQueueName("Open traveller menu", isAdmin, adminQueue)}
              >
                <TravellerAvatar traveller={traveller} size={36} />
                {hasAdminQueue(isAdmin, adminQueue) && <AdminQueueDot />}
              </DropdownMenuTrigger>
```

`components/shell/dock-extras.tsx` — imports:

```ts
import { AdminQueueDot } from "@/components/shell/admin-queue-dot";
import { hasAdminQueue, withAdminQueueName } from "@/lib/admin-queue";
```

and the trigger inside `DockAccountMenu`:

```tsx
      <DropdownMenuTrigger
        className="relative grid size-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={withAdminQueueName("Open traveller menu", shell.isAdmin, shell.adminQueue)}
      >
        <TravellerAvatar traveller={shell.user} size={36} />
        {hasAdminQueue(shell.isAdmin, shell.adminQueue) && <AdminQueueDot />}
      </DropdownMenuTrigger>
```

Add one sentence to the `DockAccountMenu` doc comment: "Carries the Admin queue dot (spec 2026-10-02 §B) — this one component is the avatar at the Dock widths both outside a Trip (AppShellRail) and inside one (TripNav)."

`components/shell/sidebar-footer.tsx` — same two imports; the trigger (lines 27-32) becomes:

```tsx
        <DropdownMenuTrigger
          className="relative grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={withAdminQueueName("Open traveller menu", isAdmin, adminQueue)}
        >
          <TravellerAvatar traveller={user} size={36} />
          {hasAdminQueue(isAdmin, adminQueue) && <AdminQueueDot />}
        </DropdownMenuTrigger>
```

- [ ] **Step 5: Run the tests and the gates**

Run: `TZ=UTC npx vitest run "app/(app)/layout.test.tsx" components/trip/trip-nav.test.tsx components/shell && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/shell/admin-queue-dot.tsx "app/(app)/layout.tsx" "app/(app)/layout.test.tsx" components/shell/dock-extras.tsx components/shell/sidebar-footer.tsx components/trip/trip-nav.test.tsx components/shell/sidebar.test.tsx
git commit -m "feat(admin): the Admin queue dot on every avatar trigger

Phone top bar, Dock (outside and inside a Trip) and Sidebar footer. The
dot is decorative; the trigger's name carries the count. Spec 2026-10-02 §B.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The dot on the phone's You tab

**Files:**
- Modify: `components/ui/tab-bar.tsx:8-26` (`TabItem`) and `:66-73` (the default link)
- Modify: `components/shell/app-tab-bar.tsx`
- Test: `components/ui/tab-bar.test.tsx`, `components/shell/app-tab-bar.test.tsx`

**Interfaces:**
- Consumes: `AdminQueueDot` (Task 3); `EMPTY_ADMIN_QUEUE`, `hasAdminQueue`, `withAdminQueueName` (Task 1); `useShellUser` (`components/shell/shell-user.tsx`).
- Produces: `TabItem.indicator?: React.ReactNode` and `TabItem["aria-label"]?: string` — additive; the trip bar (`components/trip/mobile-tab-bar.tsx`) passes neither and renders exactly as before.

- [ ] **Step 1: Write the failing TabBar test**

In `components/ui/tab-bar.test.tsx`, after the test "renders an item's icon above its label when given one, and no svg when not", add (the file already defines `FakeIcon` and imports `TabItem`; add `within` to its `@testing-library/react` import if missing):

```tsx
  // Spec 2026-10-02 §B: the You tab carries the Admin queue dot. The mark
  // belongs to the icon's box, and the name may say more than the label.
  it("renders an item's indicator beside its icon and uses its aria-label as the name", () => {
    const items: TabItem[] = [
      {
        href: "/account",
        label: "You",
        match: (p: string) => p === "/account",
        icon: FakeIcon,
        indicator: <span data-testid="dot" />,
        "aria-label": "You, 2 waiting in Admin",
      },
    ];
    render(<TabBar items={items} />);
    const you = screen.getByRole("link", { name: "You, 2 waiting in Admin" });
    expect(within(you).getByTestId("dot")).toBeInTheDocument();
    expect(you.querySelector("svg")).not.toBeNull();
    expect(you.textContent).toContain("You");
  });
```

- [ ] **Step 2: Write the failing AppTabBar tests**

In `components/shell/app-tab-bar.test.tsx`, add imports after the existing ones:

```tsx
import { within } from "@testing-library/react";
import { ShellUserProvider, type ShellUser } from "@/components/shell/shell-user";
import { EMPTY_ADMIN_QUEUE } from "@/lib/admin-queue";

const SHELL: ShellUser = {
  user: { id: "u1", name: "Alice", image: null, email: "a@example.com" },
  isAdmin: true,
  adminQueue: { accessRequests: 1, feedbackNeedingReview: 1 },
  trips: [],
  lastTrip: null,
};
```

(merge `within` into the existing `render, screen` import), and inside `describe("AppTabBar", ...)` add:

```tsx
  // Spec 2026-10-02 §B: outside a Trip a phone has no avatar, so the You tab
  // is where the Admin queue dot lives — /trips is where a phone lands.
  it("marks the You tab and names the count for an Admin with an Admin queue", () => {
    render(
      <ShellUserProvider value={SHELL}>
        <AppTabBar />
      </ShellUserProvider>,
    );
    const you = screen.getByRole("link", { name: "You, 2 waiting in Admin" });
    expect(you).toHaveAttribute("href", "/account");
    expect(within(you).getByTestId("admin-queue-dot")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "You" })).toBeNull();
  });

  it("shows no dot for an Admin with an empty queue", () => {
    render(
      <ShellUserProvider value={{ ...SHELL, adminQueue: EMPTY_ADMIN_QUEUE }}>
        <AppTabBar />
      </ShellUserProvider>,
    );
    expect(screen.getByRole("link", { name: "You" })).toBeInTheDocument();
    expect(screen.queryByTestId("admin-queue-dot")).toBeNull();
  });

  // Review Focus 4.
  it("shows no dot for an ordinary traveller whatever the counts say", () => {
    render(
      <ShellUserProvider value={{ ...SHELL, isAdmin: false }}>
        <AppTabBar />
      </ShellUserProvider>,
    );
    expect(screen.getByRole("link", { name: "You" })).toBeInTheDocument();
    expect(screen.queryByTestId("admin-queue-dot")).toBeNull();
  });
```

The existing test renders without a provider and must keep passing (no shell → no dot).

- [ ] **Step 3: Run them to verify they fail**

Run: `TZ=UTC npx vitest run components/ui/tab-bar.test.tsx components/shell/app-tab-bar.test.tsx`
Expected: FAIL — `indicator` / `"aria-label"` are not `TabItem` props (type error) and no dot renders.

- [ ] **Step 4: Extend TabItem and the default link**

`components/ui/tab-bar.tsx` — add to `TabItem` after `icon`:

```ts
  /**
   * A mark that belongs to the icon's box — the Admin queue dot on the You
   * tab (components/shell/app-tab-bar.tsx). Only meaningful with an `icon`;
   * ignored without one.
   */
  indicator?: React.ReactNode;
  /**
   * Overrides the link's accessible name when the visible label is not the
   * whole story ("You, 2 waiting in Admin"). Leave unset to keep the label.
   */
  "aria-label"?: string;
```

Replace the default `AppLink` (the `return (<AppLink key={it.href} ...>...</AppLink>)` block) with:

```tsx
          return (
            <AppLink key={it.href} href={it.href} aria-current={matches(it, pathname) ? "page" : undefined}
              aria-label={it["aria-label"]}
              data-pending={pendingPathname != null && matches(it, pendingPathname) ? "true" : undefined}
              className={cn("relative flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 truncate rounded-md text-xs transition-colors duration-[var(--dur-fast)]", active ? "font-extrabold text-on-accent" : "font-semibold text-muted-foreground")}>
              {it.icon ? (
                <span className="relative inline-flex">
                  <it.icon className="size-4" aria-hidden="true" />
                  {it.indicator}
                </span>
              ) : null}
              {it.label}
            </AppLink>
          );
```

- [ ] **Step 5: Make the You tab read the shell**

Replace `components/shell/app-tab-bar.tsx` entirely:

```tsx
"use client";

import { LayoutGrid, Globe, UserRound } from "lucide-react";
import { TabBar, type TabItem } from "@/components/ui/tab-bar";
import { isGlobeActive, isTripsActive } from "@/components/shell/app-paths";
import { useShellUser } from "@/components/shell/shell-user";
import { AdminQueueDot } from "@/components/shell/admin-queue-dot";
import { EMPTY_ADMIN_QUEUE, hasAdminQueue, withAdminQueueName } from "@/lib/admin-queue";

const isYou = (p: string) => p === "/account" || p.startsWith("/account/");

/**
 * Phone tab bar on trips-level pages (spec D4): Trips, Globe, You — the same
 * three destinations as the tablet Dock (components/app-rail.tsx), replacing
 * the phone top bar there. Mounted by app/(app)/layout.tsx inside
 * <OutsideTrip>; inside a Trip, MobileTabBar (components/trip/mobile-tab-bar.tsx)
 * is the phone tab bar instead, and the top bar stays.
 *
 * The You tab carries the Admin queue dot (CONTEXT.md; spec 2026-10-02 §B):
 * outside a Trip a phone has no avatar, and /trips is where a phone lands
 * after sign-in, so this is the one place the dot can be seen there. Reads
 * the shell for the count; renders no dot outside ShellUserProvider or for
 * a non-Admin.
 */
export function AppTabBar() {
  const shell = useShellUser();
  const isAdmin = shell?.isAdmin ?? false;
  const queue = shell?.adminQueue ?? EMPTY_ADMIN_QUEUE;
  const lit = hasAdminQueue(isAdmin, queue);
  const items: TabItem[] = [
    { href: "/trips", label: "Trips", match: isTripsActive, icon: LayoutGrid },
    { href: "/globe", label: "Globe", match: isGlobeActive, icon: Globe },
    {
      href: "/account",
      label: "You",
      match: isYou,
      icon: UserRound,
      // On the 16px icon: a 10px dot at its top-right corner, ringed in the
      // bar's own sun so it reads on the active coral pill and off it alike.
      indicator: lit ? <AdminQueueDot className="-right-1.5 -top-1.5 size-2.5 border-sun" /> : undefined,
      "aria-label": lit ? withAdminQueueName("You", isAdmin, queue) : undefined,
    },
  ];
  return <TabBar items={items} aria-label="Teepee" className="bg-sun" />;
}
```

Confirm `lib/cn.ts` merges Tailwind classes (`grep -n twMerge lib/cn.ts` prints a line) so `size-2.5` overrides the dot's default `size-3`. If it does not, drop `size-2.5` from the className and keep the 12px dot.

- [ ] **Step 6: Run the tests and the gates**

Run: `TZ=UTC npx vitest run components/ui/tab-bar.test.tsx components/shell/app-tab-bar.test.tsx components/trip/mobile-tab-bar.test.tsx "app/(app)/layout.test.tsx" && npx tsc --noEmit && npm run lint`
Expected: PASS — including the trip bar's and the layout's existing tab-bar assertions.

- [ ] **Step 7: Commit**

```bash
git add components/ui/tab-bar.tsx components/ui/tab-bar.test.tsx components/shell/app-tab-bar.tsx components/shell/app-tab-bar.test.tsx
git commit -m "feat(admin): the Admin queue dot on the phone's You tab

TabItem gains an indicator slot and an aria-label override; the app tab bar
reads the shell and lights You for an Admin with something waiting.
Spec 2026-10-02 §B.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The Admin queue card on Account

**Files:**
- Create: `components/account/admin-queue-card.tsx`
- Modify: `app/(app)/account/page.tsx` (imports; after `const isAdmin = …` at line 64; the grid at lines 76-84)
- Test: `app/(app)/account/page.test.tsx` (db mock at 48-55, `beforeEach` at 73-80, new describe)

**Interfaces:**
- Consumes: `AdminQueue`, `EMPTY_ADMIN_QUEUE`, `adminQueueTotal` (Task 1); `countAdminQueue` (Task 1); `Card`, `CardTitle` (`components/ui/card.tsx`); `Button` with `asChild` (`components/ui/button.tsx`).
- Produces: `export function AdminQueueCard({ queue }: { queue: AdminQueue })` — a `role="region"` card named "Admin queue".

- [ ] **Step 1: Write the failing page tests**

In `app/(app)/account/page.test.tsx`:

Add two hoisted mocks after `cronHeartbeatFindUniqueMock`:

```ts
// The Admin queue card (spec 2026-10-02 §C): two counts, Admins only.
const accessRequestCountMock = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const feedbackNoteCountMock = vi.hoisted(() => vi.fn().mockResolvedValue(0));
```

Add to the `vi.mock("@/lib/db", ...)` object:

```ts
    accessRequest: { count: accessRequestCountMock },
    feedbackNote: { count: feedbackNoteCountMock },
```

Add to `beforeEach`:

```ts
  accessRequestCountMock.mockResolvedValue(0);
  feedbackNoteCountMock.mockResolvedValue(0);
```

Add a describe at the end of `describe("AccountPage", ...)`:

```tsx
  describe("the Admin queue card (spec 2026-10-02 §C)", () => {
    // Review Focus 4.
    it("is absent for an ordinary traveller, and the queue is never counted", async () => {
      render(await AccountPage());
      expect(screen.queryByRole("region", { name: "Admin queue" })).toBeNull();
      expect(accessRequestCountMock).not.toHaveBeenCalled();
      expect(feedbackNoteCountMock).not.toHaveBeenCalled();
    });

    // Review Focus 3: the real number here, where the menu badge says 9+.
    it("lists what is waiting, pluralised, with a link to /admin, directly under You", async () => {
      process.env.ADMIN_EMAILS = "cam@example.com";
      accessRequestCountMock.mockResolvedValue(12);
      feedbackNoteCountMock.mockResolvedValue(1);
      render(await AccountPage());
      const card = screen.getByRole("region", { name: "Admin queue" });
      expect(within(card).getByText("12 Access requests waiting")).toBeInTheDocument();
      expect(within(card).getByText("1 Feedback note needs review")).toBeInTheDocument();
      expect(within(card).getByRole("link", { name: "Open Admin" }).getAttribute("href")).toBe("/admin");
      const you = screen.getByRole("region", { name: "You" });
      expect(card.parentElement).toBe(you.parentElement);
      expect(you.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("omits a kind with nothing waiting, and says so when both are empty", async () => {
      process.env.ADMIN_EMAILS = "cam@example.com";
      feedbackNoteCountMock.mockResolvedValue(2);
      const first = render(await AccountPage());
      let card = screen.getByRole("region", { name: "Admin queue" });
      expect(within(card).queryByText(/access request/i)).toBeNull();
      expect(within(card).getByText("2 Feedback notes need review")).toBeInTheDocument();
      first.unmount();

      feedbackNoteCountMock.mockResolvedValue(0);
      render(await AccountPage());
      card = screen.getByRole("region", { name: "Admin queue" });
      expect(within(card).getByText("Nothing waiting.")).toBeInTheDocument();
      expect(within(card).getByRole("link", { name: "Open Admin" })).toBeInTheDocument();
    });

    // Review Focus 1: a count failure degrades to an empty card, never to a
    // broken Account page.
    it("still renders the card, empty, when the count fails", async () => {
      process.env.ADMIN_EMAILS = "cam@example.com";
      accessRequestCountMock.mockRejectedValue(new Error("db down"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      render(await AccountPage());
      const card = screen.getByRole("region", { name: "Admin queue" });
      expect(within(card).getByText("Nothing waiting.")).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Devices" })).toBeInTheDocument();
      errorSpy.mockRestore();
    });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `TZ=UTC npx vitest run "app/(app)/account/page.test.tsx"`
Expected: FAIL — no region named "Admin queue" (3 of the 4 new tests; the non-admin one passes already).

- [ ] **Step 3: Write the card**

`components/account/admin-queue-card.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { adminQueueTotal, type AdminQueue } from "@/lib/admin-queue";

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The Admin queue on Account (CONTEXT.md "Admin queue"; spec 2026-10-02 §C):
 * what is waiting, one line per kind, and the way to /admin. Renders for an
 * Admin even when nothing is waiting, so the You tab's dot always lands on
 * a card that explains itself and Account always has a way to Admin. The
 * caller decides whether the viewer is an Admin; this never checks. Shows
 * the real numbers — the menu badge caps at 9+, this does not.
 */
export function AdminQueueCard({ queue }: { queue: AdminQueue }) {
  const lines: string[] = [];
  if (queue.accessRequests > 0) {
    lines.push(`${count(queue.accessRequests, "Access request", "Access requests")} waiting`);
  }
  if (queue.feedbackNeedingReview > 0) {
    lines.push(
      `${count(queue.feedbackNeedingReview, "Feedback note", "Feedback notes")} ${
        queue.feedbackNeedingReview === 1 ? "needs" : "need"
      } review`,
    );
  }

  return (
    <Card role="region" aria-labelledby="account-admin-queue" className="p-[18px]">
      <CardTitle id="account-admin-queue">Admin queue</CardTitle>
      <div className="mt-3.5 flex flex-col gap-3">
        {adminQueueTotal(queue) === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm font-semibold text-foreground">
            {lines.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        )}
        <Button asChild variant="outline" size="md" className="self-start">
          <Link href="/admin">Open Admin</Link>
        </Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Wire the page**

`app/(app)/account/page.tsx` — imports:

```ts
import { countAdminQueue } from "@/lib/admin-queue-loader";
import { EMPTY_ADMIN_QUEUE, type AdminQueue } from "@/lib/admin-queue";
import { AdminQueueCard } from "@/components/account/admin-queue-card";
```

After `const isAdmin = isAdminEmail(profile?.email ?? null);`:

```ts
  // The Admin queue card (spec 2026-10-02 §C): Admins only, and a count
  // failure degrades to an empty card, never to a broken Account page —
  // the same shape as app/(app)/layout.tsx.
  let adminQueue: AdminQueue = EMPTY_ADMIN_QUEUE;
  if (isAdmin) {
    try {
      adminQueue = await countAdminQueue();
    } catch (err) {
      console.error("[AccountPage] failed to count the Admin queue:", err);
    }
  }
```

Replace the You card (the `<Card role="region" aria-labelledby="account-you" …>…</Card>` block, lines 77-83) with a left column holding it and the Admin card:

```tsx
        {/* ── Left column: You, then (Admins) the Admin queue — the card the
            You tab's dot leads to (spec 2026-10-02 §C). ── */}
        <div data-account-left className="flex flex-col gap-3 lg:gap-[18px]">
          <Card role="region" aria-labelledby="account-you" className="p-[18px]">
            <CardTitle id="account-you">You</CardTitle>
            <div className="mt-3.5">
              <ProfileCard user={profileUser} />
            </div>
          </Card>
          {isAdmin ? <AdminQueueCard queue={adminQueue} /> : null}
        </div>
```

The existing grid assertions (`grid.contains(you)`, You before Devices) still hold: `contains` is transitive and document order is unchanged.

- [ ] **Step 5: Run the test and the gates**

Run: `TZ=UTC npx vitest run "app/(app)/account/page.test.tsx" && npx tsc --noEmit && npm run lint`
Expected: PASS — all pre-existing Account tests included.

- [ ] **Step 6: Commit**

```bash
git add components/account/admin-queue-card.tsx "app/(app)/account/page.tsx" "app/(app)/account/page.test.tsx"
git commit -m "feat(account): the Admin queue card under You

Admins only; lists what is waiting with real numbers and links to /admin;
renders 'Nothing waiting.' when empty so the You tab's dot always lands
somewhere that explains itself. Spec 2026-10-02 §C.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `/admin` — Feedback needing review, read-only

**Files:**
- Modify: `lib/feedback-view.ts` (append the review view, its select and mapper)
- Modify: `server/actions/feedback.ts:4,16-27` (imports / type re-export) and append `listFeedbackNeedingReview`
- Create: `app/(app)/admin/feedback-review.tsx`
- Create: `app/(app)/admin/feedback-review.test.tsx`
- Modify: `app/(app)/admin/page.tsx` (imports; the `Promise.all` at 57-61; a new `<Section>` after Access requests)
- Test: `server/actions/feedback.test.ts` (guards mock at 32-34; new describe), `app/(app)/admin/page.test.tsx` (mocks at 20-45; the call-count and heading tests)

**Interfaces:**
- Consumes: `requireAdmin` (`lib/guards.ts`); `feedbackSite`, `siteOf`, `siteLabel` (`lib/feedback-site.ts`); `relativeTime(date, now)` (`lib/relative-time.ts`); `Card`, `Badge`.
- Produces:
  ```ts
  // lib/feedback-view.ts
  export type FeedbackReviewView = { id: string; body: string; pageLabel: string; tripName: string | null; authorName: string; authoredAt: string; siteChip: string | null }
  export type FeedbackReviewQueryRow = { id: string; body: string; pageLabel: string; tripName: string | null; authorName: string | null; authoredAt: Date; site: string | null }
  export const REVIEW_SELECT
  export function toReviewView(row: FeedbackReviewQueryRow, currentSite: string): FeedbackReviewView
  // server/actions/feedback.ts
  export async function listFeedbackNeedingReview(): Promise<FeedbackReviewView[]>
  // app/(app)/admin/feedback-review.tsx
  export function FeedbackReviewPanel({ notes, now }: { notes: FeedbackReviewView[]; now: Date })
  ```

- [ ] **Step 1: Write the failing action tests**

In `server/actions/feedback.test.ts`: add `requireAdminMock: vi.fn(),` to the hoisted object (and destructure it), change the guards mock to:

```ts
vi.mock("@/lib/guards", () => ({
  requireUser: requireUserMock,
  requireAdmin: requireAdminMock,
}));
```

add `listFeedbackNeedingReview` to the import from `@/server/actions/feedback`, and append:

```ts
describe("listFeedbackNeedingReview (spec 2026-10-02 §D)", () => {
  const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;
  afterEach(() => {
    if (ORIGINAL_VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
    requireAdminMock.mockReset();
    feedbackNoteFindManyMock.mockReset();
  });

  it("requires an Admin, lists NEEDS_REVIEW notes from every site oldest first, and chips the other site", async () => {
    process.env.VERCEL_ENV = "production"; // viewed on main
    requireAdminMock.mockResolvedValue({ id: "admin-1", email: "ops@example.com" });
    feedbackNoteFindManyMock.mockResolvedValue([
      {
        id: "n-beta",
        body: "Click into an idea",
        pageLabel: "Plan editor",
        tripName: "Europe",
        authorName: "Xanthia",
        authoredAt: new Date("2026-10-01T00:00:00Z"),
        site: "beta",
      },
      // Review Focus 2: a pre-site row counts as main — no chip on main.
      { id: "n-old", body: "Old note", pageLabel: "Files", tripName: null, authorName: null, authoredAt: new Date("2026-10-01T01:00:00Z"), site: null },
    ]);

    const notes = await listFeedbackNeedingReview();

    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(feedbackNoteFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "NEEDS_REVIEW" }, orderBy: { authoredAt: "asc" } }),
    );
    expect(notes[0]).toEqual({
      id: "n-beta",
      body: "Click into an idea",
      pageLabel: "Plan editor",
      tripName: "Europe",
      authorName: "Xanthia",
      authoredAt: "2026-10-01T00:00:00.000Z",
      siteChip: "Beta",
    });
    expect(notes[1].siteChip).toBeNull();
    expect(notes[1].authorName).toBe("Traveller");
    expect(notes[1]).not.toHaveProperty("status");
  });

  it("refuses a non-Admin before reading anything", async () => {
    requireAdminMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(listFeedbackNeedingReview()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(feedbackNoteFindManyMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `TZ=UTC npx vitest run server/actions/feedback.test.ts`
Expected: FAIL — `listFeedbackNeedingReview` is not exported.

- [ ] **Step 3: Add the view and the action**

Append to `lib/feedback-view.ts`:

```ts
/**
 * A Needs-review Feedback note as /admin lists it (spec 2026-10-02 §D).
 * Read-only: no status and no canDelete — the list is defined by its query
 * (status = NEEDS_REVIEW), and nothing on that page acts on a note.
 */
export type FeedbackReviewView = {
  id: string;
  body: string;
  pageLabel: string;
  tripName: string | null;
  authorName: string;
  /** ISO. */
  authoredAt: string;
  /** Label of the site this note was written on, only when it isn't the site being viewed. */
  siteChip: string | null;
};

/** The columns `REVIEW_SELECT` reads, as Prisma returns them. */
export type FeedbackReviewQueryRow = {
  id: string;
  body: string;
  pageLabel: string;
  tripName: string | null;
  authorName: string | null;
  authoredAt: Date;
  site: string | null;
};

/** The Prisma selection listFeedbackNeedingReview reads. */
export const REVIEW_SELECT = {
  id: true,
  body: true,
  pageLabel: true,
  tripName: true,
  authorName: true,
  authoredAt: true,
  site: true,
} as const;

/**
 * Deliberately NOT `toView`: that mapper renames Needs review to Open for
 * the author's panel (ADR 0040 amended 2026-09-29), which is exactly what
 * the review list must not do.
 */
export function toReviewView(row: FeedbackReviewQueryRow, currentSite: string): FeedbackReviewView {
  const site = siteOf(row.site);
  return {
    id: row.id,
    body: row.body,
    pageLabel: row.pageLabel,
    tripName: row.tripName,
    authorName: row.authorName ?? "Traveller",
    authoredAt: row.authoredAt.toISOString(),
    siteChip: site === currentSite ? null : siteLabel(site),
  };
}
```

In `server/actions/feedback.ts`: change `import { requireUser } from "@/lib/guards";` to `import { requireAdmin, requireUser } from "@/lib/guards";`; extend the `@/lib/feedback-view` import with `REVIEW_SELECT, toReviewView, type FeedbackReviewQueryRow, type FeedbackReviewView`; change the type re-export to `export type { FeedbackNoteView, FeedbackReviewView };`; append:

```ts
/**
 * Every Feedback note still at Needs review, oldest first, from every site —
 * the /admin list (spec 2026-10-02 §D; CONTEXT.md "Admin queue"). Admin-only
 * and read-only: accepting and declining stay with `npm run feedback:accept`
 * and `feedback:resolve`, the only writers of Feedback status (ADR 0040).
 */
export async function listFeedbackNeedingReview(): Promise<FeedbackReviewView[]> {
  await requireAdmin();
  const site = feedbackSite();

  const rows = await db.feedbackNote.findMany({
    where: { status: "NEEDS_REVIEW" },
    orderBy: { authoredAt: "asc" },
    select: REVIEW_SELECT,
  });

  return (rows as FeedbackReviewQueryRow[]).map((row) => toReviewView(row, site));
}
```

- [ ] **Step 4: Run the action tests**

Run: `TZ=UTC npx vitest run server/actions/feedback.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing panel test**

`app/(app)/admin/feedback-review.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FeedbackReviewPanel } from "./feedback-review";
import type { FeedbackReviewView } from "@/server/actions/feedback";
import { relativeTime } from "@/lib/relative-time";

const NOW = new Date("2026-10-02T12:00:00.000Z");

const notes: FeedbackReviewView[] = [
  {
    id: "cmup8xolg000004jtqvc2lfu7",
    body: "I would like to click into an idea",
    pageLabel: "Plan editor",
    tripName: "Christmas in Europe 2026",
    authorName: "Xanthia Mason",
    authoredAt: "2026-10-01T12:00:00.000Z",
    siteChip: "Beta",
  },
  {
    id: "n2",
    body: "Second",
    pageLabel: "Files",
    tripName: null,
    authorName: "Traveller",
    authoredAt: "2026-10-02T11:00:00.000Z",
    siteChip: null,
  },
];

describe("FeedbackReviewPanel (spec 2026-10-02 §D)", () => {
  it("shows an empty state", () => {
    render(<FeedbackReviewPanel notes={[]} now={NOW} />);
    expect(screen.getByText("No Feedback notes waiting for review.")).toBeInTheDocument();
  });

  it("lists author, page, trip, site chip, body, age and the id, in the order given", () => {
    render(<FeedbackReviewPanel notes={notes} now={NOW} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const first = within(items[0]);
    expect(first.getByText("Xanthia Mason")).toBeInTheDocument();
    expect(first.getByText("Plan editor")).toBeInTheDocument();
    expect(first.getByText("Christmas in Europe 2026")).toBeInTheDocument();
    expect(first.getByText("Beta")).toBeInTheDocument();
    expect(first.getByText("I would like to click into an idea")).toBeInTheDocument();
    expect(first.getByText("cmup8xolg000004jtqvc2lfu7").tagName).toBe("CODE");
    expect(first.getByText(relativeTime(new Date(notes[0].authoredAt), NOW))).toBeInTheDocument();
    expect(within(items[1]).queryByText("Beta")).toBeNull();
    expect(within(items[1]).getByText("Second")).toBeInTheDocument();
  });

  it("is read-only: no buttons at all", () => {
    render(<FeedbackReviewPanel notes={notes} now={NOW} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `TZ=UTC npx vitest run "app/(app)/admin/feedback-review.test.tsx"`
Expected: FAIL — `Failed to resolve import "./feedback-review"`.

- [ ] **Step 7: Write the panel**

`app/(app)/admin/feedback-review.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { relativeTime } from "@/lib/relative-time";
import type { FeedbackReviewView } from "@/server/actions/feedback";

export interface FeedbackReviewPanelProps {
  notes: FeedbackReviewView[];
  /** The server's instant (CD-05), same as the page's other panels. */
  now: Date;
}

/**
 * Needs-review Feedback notes, read-only (spec 2026-10-02 §D; CONTEXT.md
 * "Admin queue"). No Accept, no Decline, no Delete: the two scripts stay the
 * only writers of Feedback status (ADR 0040), so the id is shown for the
 * command to be typed. A Server Component — nothing here needs state, unlike
 * the panels beside it.
 */
export function FeedbackReviewPanel({ notes, now }: FeedbackReviewPanelProps) {
  if (notes.length === 0) {
    return <p className="text-sm text-muted-foreground">No Feedback notes waiting for review.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {notes.map((note) => (
        <li key={note.id}>
          <Card radius="md" shadow={1} className="flex flex-col gap-2 p-3.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="text-sm font-medium text-foreground">{note.authorName}</span>
              <span>{note.pageLabel}</span>
              {note.tripName ? <span>{note.tripName}</span> : null}
              {note.siteChip ? <Badge variant="muted">{note.siteChip}</Badge> : null}
            </div>
            <p className="whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
            <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span>{relativeTime(new Date(note.authoredAt), now)}</span>
              <code className="select-all font-mono">{note.id}</code>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 8: Run the panel test**

Run: `TZ=UTC npx vitest run "app/(app)/admin/feedback-review.test.tsx"`
Expected: PASS.

- [ ] **Step 9: Write the failing page tests**

In `app/(app)/admin/page.test.tsx`:

Add a hoisted mock after `errorReportFindManyMock`:

```ts
const feedbackNoteFindManyMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
```

Add to the `db` mock object: `feedbackNote: { findMany: feedbackNoteFindManyMock },`. Add a marker mock beside the other three:

```tsx
vi.mock("./feedback-review", () => ({
  FeedbackReviewPanel: () => <div data-testid="feedback-review-panel" />,
}));
```

Add `feedbackNoteFindManyMock.mockResolvedValue([]);` to `beforeEach`.

Update the call-count test: the comment's arithmetic becomes "1 direct + 1 inside listAccessRequests + 1 inside listFeedbackNeedingReview + 1 inside listAllowedEmails + 1 inside listErrorReports = 5. Remove the page's own `await requireAdmin()` and this drops to 4." and the assertion to `toHaveBeenCalledTimes(5)`.

In "a non-admin gets notFound() and no data is read" add `expect(feedbackNoteFindManyMock).not.toHaveBeenCalled();`.

In "renders all section headings and panels for an admin" add:

```ts
    expect(screen.getByText("Feedback needing review")).toBeInTheDocument();
    expect(screen.getByTestId("feedback-review-panel")).toBeInTheDocument();
```

Add a new test after it:

```tsx
  // Spec 2026-10-02 §D: second section — a queue of people waiting, like
  // Access requests above it; the allowlist is not — with a count badge.
  it("places Feedback needing review after Access requests and before the allowlist, counting the rows", async () => {
    feedbackNoteFindManyMock.mockResolvedValue([
      { id: "n1", body: "a", pageLabel: "Plan editor", tripName: null, authorName: "X", authoredAt: new Date(), site: "beta" },
      { id: "n2", body: "b", pageLabel: "Files", tripName: null, authorName: null, authoredAt: new Date(), site: null },
    ]);
    render(await AdminPage());
    const review = screen.getByRole("heading", { name: /Feedback needing review,\s*2/ });
    const access = screen.getByText("Access requests");
    const allow = screen.getByText("Who can sign in");
    expect(access.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(review.compareDocumentPosition(allow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Accept or decline from the terminal")).toBeInTheDocument();
  });
```

- [ ] **Step 10: Run it to verify it fails**

Run: `TZ=UTC npx vitest run "app/(app)/admin/page.test.tsx"`
Expected: FAIL — call count is 4, no "Feedback needing review" heading.

- [ ] **Step 11: Wire the page**

`app/(app)/admin/page.tsx` — imports:

```ts
import { listFeedbackNeedingReview } from "@/server/actions/feedback";
import { FeedbackReviewPanel } from "./feedback-review";
```

Replace the `Promise.all`:

```ts
  const [accessRequests, feedbackNeedingReview, allowedEmails, errorReports] = await Promise.all([
    listAccessRequests(),
    listFeedbackNeedingReview(),
    listAllowedEmails(),
    listErrorReports(),
  ]);
```

Insert a section between Access requests and "Who can sign in":

```tsx
      {/* Needs-review Feedback notes (spec 2026-10-02 §D) — read-only; the
          scripts accept and decline. Second, beside Access requests: both are
          people waiting on the operator. */}
      <Section
        id="adm-review"
        title="Feedback needing review"
        count={feedbackNeedingReview.length}
        hint="Accept or decline from the terminal"
      >
        <FeedbackReviewPanel notes={feedbackNeedingReview} now={now} />
      </Section>
```

- [ ] **Step 12: Run everything this task touched, and the gates**

Run: `TZ=UTC npx vitest run "app/(app)/admin" server/actions/feedback.test.ts lib/feedback-view.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS (if `lib/feedback-view.test.ts` does not exist, drop it from the command).

- [ ] **Step 13: Commit**

```bash
git add lib/feedback-view.ts server/actions/feedback.ts server/actions/feedback.test.ts "app/(app)/admin/feedback-review.tsx" "app/(app)/admin/feedback-review.test.tsx" "app/(app)/admin/page.tsx" "app/(app)/admin/page.test.tsx"
git commit -m "feat(admin): Feedback needing review — a read-only list on /admin

Needs-review notes from every site, oldest first, with author, page, site
chip, body, age and the id to type. No Accept or Decline: the scripts stay
the only writers of Feedback status. Spec 2026-10-02 §D.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Docs and the whole-branch gates

**Files:**
- Modify: `lib/admin-notify.ts:8-12` (the ACCEPTED TRADE-OFF paragraph)
- Modify: `docs/specs/2026-10-02-admin-queue.md:3-4` (status line)

- [ ] **Step 1: Amend the admin-notify doc comment**

In `lib/admin-notify.ts` replace:

```
 * ACCEPTED TRADE-OFF (sitrep 2026-09-22): the operator learns of a request
 * when they next open TEEPEE, so someone may wait a day. At 10–15 Travellers
 * that beat standing up email infrastructure. The /admin badge is the source
 * of truth; this push is only the prompt, and it must be allowed to fail.
```

with:

```
 * ACCEPTED TRADE-OFF (sitrep 2026-09-22): the operator learns of a request
 * when they next open TEEPEE, so someone may wait a day. At 10–15 Travellers
 * that beat standing up email infrastructure. The Admin queue (CONTEXT.md —
 * the dot on the avatar and You tab, the Account card, and /admin itself;
 * spec 2026-10-02) is the source of truth; this push is only the prompt,
 * and it must be allowed to fail.
```

- [ ] **Step 2: Mark the spec built**

In `docs/specs/2026-10-02-admin-queue.md` replace the two status lines with:

```
**Status:** built on the branch (plan docs/superpowers/plans/2026-10-02-admin-queue.md); awaiting merge and deploy.
```

- [ ] **Step 3: Run the whole-branch gates**

```bash
npx tsc --noEmit && npm run lint && npm test
```

Expected: `tsc` and `lint` clean; `npm test` green except the known node-22 Intl failures (`lib/money.test.ts` ×2, `shared-pot-tile`, `spend-so-far-tile`) if the shell is on node 22 — list exactly which failed and confirm each is in that known set. Any other failure is this branch's and must be fixed before committing.

Then `npm run build`. If it fails only because `DATABASE_URL` is unreachable (Neon idle — see the memory note), say so in the task output and move on; any other build error is this branch's.

- [ ] **Step 4: Commit**

```bash
git add lib/admin-notify.ts docs/specs/2026-10-02-admin-queue.md
git commit -m "docs(admin): admin-notify names the Admin queue; spec marked built

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git log --oneline main..HEAD
```

Expected: eight commits on `feat/admin-queue-2026-10-02` (inbox + six feature/docs), none on `main`.
