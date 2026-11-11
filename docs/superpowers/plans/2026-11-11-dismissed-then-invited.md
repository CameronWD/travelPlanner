# Dismissed, then Invited Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dismissed Access request comes back to the Admin when the person is invited to a Trip after the dismissal; privacy copy says so.

**Architecture:** One helper, `reopenedByInvite`, finds dismissed requests with a later live Trip Invite. `listAccessRequests`, `countAdminQueue`, `approveAccessRequest` and `dismissAccessRequest` consult it. The panel labels those rows; copy and docs follow.

**Tech Stack:** Next.js, Prisma/Postgres, React, Vitest (+ real-Postgres integration tests).

**Spec:** `docs/specs/2026-11-11-dismissed-then-invited.md`

## Global Constraints

- Every email compared is `.trim().toLowerCase()`'d.
- Every `/admin` server action calls `requireAdmin()` first.
- Traveller-facing copy: no em-dashes, no "Failed to", no "Please try again".
- Approved rows always end `status: "pending"` + `resolvedAt` set; dismissed rows `status: "dismissed"` + `resolvedAt` set.
- Zero comments unless the WHY is non-obvious. No push notification. No features beyond the spec.
- Verification tiers per CLAUDE.md.

## Review Focus

1. An Invite created **before** the dismissal must not reopen it (only `invite.createdAt > request.resolvedAt`). (Task 1 unit + integration.)
2. An accepted Invite, or one on a soft-deleted Trip, must not reopen it. (Task 1 integration.)
3. Approving a dismissed request with **no** later Invite is still refused "That request has already been resolved." (Task 1 test.)
4. Re-dismissing a reopened request makes it disappear from the list and the count until a newer Invite. (Task 1 integration.)
5. Mixed-case `AccessRequest.email` vs lowercased `Invite.email` still matches. (Task 1 unit.)

---

### Task 1: Reopened requests on the server

**Files:**
- Create: `lib/reopened-requests.ts`, `lib/reopened-requests.test.ts`
- Modify: `server/actions/access-requests.ts` (`AccessRequestView`, `listAccessRequests`, `approveAccessRequest`, `dismissAccessRequest`), `server/actions/access-requests.test.ts`
- Modify: `lib/admin-queue-loader.ts`, `lib/admin-queue-loader.test.ts`
- Create: `test/integration/reopened-requests.test.ts` (pattern: `test/integration/people.test.ts`)

**Interfaces:**
- Produces:

```ts
// lib/reopened-requests.ts (server-only module, uses db)
export async function reopenedByInvite(onlyId?: string): Promise<AccessRequest[]>;
// AccessRequest = Prisma model type
// AccessRequestView gains: dismissedEarlier: boolean
```

- `reopenedByInvite`: load `accessRequest` rows with `status: "dismissed"` (and `id: onlyId` when given); load `invite` rows with `email in <their lowercased emails>`, `acceptedAt: null`, `trip: { deletedAt: null }`, selecting `email`, `createdAt`; return the requests having some invite with `createdAt > request.resolvedAt`. Two queries, no N+1.

- [ ] **Step 1: Unit tests** (`lib/reopened-requests.test.ts`, mocked db like `lib/admin-queue-loader.test.ts`): `"returns a dismissed request with an Invite created after its resolvedAt"`; `"ignores an Invite created before the dismissal"`; `"matches a mixed-case request email to a lowercased Invite"`; `"onlyId restricts the dismissed lookup to that id"`. Run — FAIL. Implement. PASS.
- [ ] **Step 2: Action + loader tests** (extend existing mocks; mock `@/lib/reopened-requests` in action/loader tests):
  - `listAccessRequests`: `"includes reopened requests with dismissedEarlier true"` (pending ones have `dismissedEarlier: false`; invitedTo attached and invited-first sort unchanged).
  - `approveAccessRequest`: `"approves a reopened request: allowlists, sets status pending and resolvedAt, revives Invites"`; `"still refuses a dismissed request with no later Invite"` (message `That request has already been resolved.`).
  - `dismissAccessRequest`: `"re-dismisses a reopened request, stamping a new resolvedAt"`; still refuses an approved/resolved non-reopened request.
  - `countAdminQueue`: `"counts pending plus reopened requests"`.
  Run — FAIL. Implement: list = pending (`resolvedAt: null`) ∪ `reopenedByInvite()`; approve/dismiss refuse a resolved request unless `(await reopenedByInvite(id)).length > 0`; approve's update sets `{ status: "pending", resolvedAt: now }`; count = pending count + `(await reopenedByInvite()).length`. PASS.
- [ ] **Step 3: Integration test** `test/integration/reopened-requests.test.ts` (real Postgres, unique `@reopened.test` emails, cleanup in afterAll; requireAdmin mocked; `next/cache` mocked): seed an owner + Trip; a dismissed request (resolvedAt T0) with an Invite created at T0+1h → appears in `listAccessRequests` with `dismissedEarlier: true` and counts in `countAdminQueue`; a second dismissed request whose Invite was created before its resolvedAt → absent; a third whose later Invite is on a soft-deleted Trip → absent; `dismissAccessRequest` on the first → absent from list and count; then approve path on a fresh reopened one → `AllowedEmail` row exists, request `status: "pending"`. Run `INTEGRATION=1 TZ=UTC npx vitest run --config vitest.integration.config.ts test/integration/reopened-requests.test.ts` — PASS.
- [ ] **Step 4:** Task-done verification. Commit `feat(admin): a dismissed request returns when the person is invited later`.

### Task 2: Panel label, privacy copy, docs

**Files:**
- Modify: `app/(app)/admin/access-requests.tsx`, `app/(app)/admin/access-requests.test.tsx`
- Modify: `app/privacy/page.tsx` (+ its test if it asserts these strings)
- Modify: `CONTEXT.md` (**Access request**, **Waiting list**), `docs/adr/0057-one-door-sign-in-allowlist.md` (append amendment)

**Interfaces:**
- Consumes: `AccessRequestView.dismissedEarlier: boolean` (Task 1).

Exact strings:

| Where | String |
|---|---|
| Invite line, `dismissedEarlier` true | `Dismissed earlier. Now invited to {tripName} by {ownerName}.` |
| Invite line, otherwise (unchanged) | `Invited to {tripName} by {ownerName}` |
| Privacy intro first sentence | `I run Teepee, a trip planner for a small group of friends and family, and only people I have given a spot can use it.` |
| Privacy Access-requests paragraph, final sentences | `A dismissed request is closed for good. It does not come back to the Admin queue, even if you sign in again, unless someone later invites you to one of their trips.` |

- [ ] **Step 1:** Panel test `"labels a reopened request 'Dismissed earlier. Now invited to Bali 2027 by Cam.'"` — FAIL; implement; PASS.
- [ ] **Step 2:** Swap the two privacy strings exactly (leave the rest of each paragraph). Run any privacy test + `npx vitest run test/copy-style.test.ts`.
- [ ] **Step 3:** CONTEXT.md: in **Access request**, after "or dismisses them, which tells them nothing", add that a dismissed request comes back before the Admin if the person is later invited to a Trip; in **Waiting list**, note the same in one clause. ADR 0057: append `## Amendment — 2026-11-11 (feat/dismissed-invited)`: dismissal is final except when a Trip Invite is created after it; why (Invites no longer admit, so this is the only path an Owner's wish reaches the Admin; without it the person is refused forever and invisible); the reopen is computed, not written (no status change until the Admin acts); no push; /privacy states the exception.
- [ ] **Step 4:** Task-done verification. Commit `feat(admin): label reopened requests; privacy says invites reopen dismissals`.

### Branch finish

- [ ] `npm test` + `npm run build` + `npm run test:integration` — green.
