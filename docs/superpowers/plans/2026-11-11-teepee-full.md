# Teepee is Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close admission to people already holding a Spot, turn every sign-up surface into a waiting list, and replace /admin's allowlist panel with a People audit.

**Architecture:** The sign-in door (`lib/auth/sign-in-door.ts`) drops its Trip-Invite clause, so only `isAllowedEmail` admits. Approval revives expired Invites. `/admin` gains Invite context on Access requests and a People list built by a pure `buildPeople` over rows the server action loads. Copy changes are string swaps.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching routing/server-action APIs), Prisma/Postgres, Better Auth, Vitest + Testing Library.

**Spec:** `docs/specs/2026-11-11-teepee-full.md` (glossary: CONTEXT.md **Full**, **Spot**, **Waiting list**)

## Global Constraints

- Traveller-facing copy: no em-dashes, no "Failed to", no "Please try again" (`test/copy-style.test.ts` enforces).
- Every email written or compared is `.trim().toLowerCase()`'d.
- Refusal copy (denied panel, email-sent line) is identical for every reader and claims nothing about list membership (ADR 0057).
- The invite-panel waiting-list line is shown on **every** pending Invite, with no allowlist lookup.
- Every `/admin` server action calls `requireAdmin()` first.
- Zero comments unless the WHY is non-obvious. No new features beyond the spec.
- Verification tiers per CLAUDE.md: inner loop `npx vitest run <file>`; task done `npx vitest related --run <changed src>` + `npx tsc --noEmit` + `npx eslint <changed files>`.

## Review Focus

1. A Traveller admitted earlier by an Invite (row note "admitted by Trip Invite") must still sign in after the door changes — their `AllowedEmail` row is what admits them now. (Task 1 test.)
2. A brand-new address holding a pending Trip Invite, on the magic-link **send** pass, must get the same refused-looks-sent answer as a stranger (no mail) and be recorded as an Access request with `notify: false`. (Task 1 test.)
3. Approving must not revive an Invite that was already accepted, nor touch another email's Invites. (Task 2 test.)
4. People list: an address in both `ALLOWED_EMAILS` and `AllowedEmail` appears once; a `User` whose email differs only by case from an `AllowedEmail` row is one person, not two. (Task 4 tests.)
5. People list: a revoked person with an account shows **No access (account remains)** and offers no Revoke. (Task 4 test.)

---

### Task 1: The door admits only people with a Spot

**Files:**
- Modify: `lib/auth/sign-in-door.ts` (remove Invite clause, `DoorDeps.hasPendingTripInvite`, `DoorDeps.admitByTripInvite`, the notify on invite admission; `notifyAdmins` dep goes too if now unused)
- Modify: `lib/allowlist.ts` (delete `hasPendingTripInvite`, `admitByTripInvite`; fix the header doc that says Invites admit)
- Modify: `lib/auth/auth.ts:189-195` (comment referencing `admitByTripInvite`)
- Modify: `server/actions/access-requests.ts:139` (comment referencing `admitByTripInvite`)
- Test: `lib/auth/sign-in-door.test.ts`, `lib/allowlist.test.ts` (delete the two functions' describe blocks)
- Modify: `docs/adr/0057-one-door-sign-in-allowlist.md` (append amendment)

**Interfaces:**
- Produces: `decideSignIn(input, deps)` unchanged signature; `DoorDeps` = `{ isAllowedEmail; recordAccessRequest }` (+ anything else still used).

- [ ] **Step 1: Rewrite the invite tests in `sign-in-door.test.ts`.** Delete every case that expects invite admission. Add:
  - `"refuses a Google sign-in for an address whose only claim is a pending Trip Invite, and records an Access request"` — `isAllowedEmail` false → `{ allow: false, reason: "refused" }`, `recordAccessRequest` called with `{ email, name, image }` from the profile.
  - `"magic-link send pass for an invited-but-unadmitted address is refused like a stranger"` — `{ allow: false, reason: "refused" }`, `recordAccessRequest` called with `notify: false`.
  - `"an address admitted earlier by Invite (an AllowedEmail row) still signs in"` — `isAllowedEmail` true → `{ allow: true, email }`, `recordAccessRequest` not called.
- [ ] **Step 2:** `npx vitest run lib/auth/sign-in-door.test.ts` — FAIL (invited address currently admitted / deps shape).
- [ ] **Step 3:** Remove the Invite clause and the now-unused deps/imports; delete the two functions from `lib/allowlist.ts` and their tests; update the two stale comments.
- [ ] **Step 4:** `npx vitest run lib/auth/sign-in-door.test.ts lib/allowlist.test.ts lib/auth/auth.test.ts` — PASS. Then `npx knip` reports no new unused export from these files.
- [ ] **Step 5: ADR amendment.** Append `## Amendment — 2026-11-11 (feat/teepee-full, spec 2026-11-11)`: Teepee is **Full**; decision 2's Invite clause and decision 4's admission write are removed — only `isAllowedEmail` admits; an invited person without a Spot is refused and recorded as an Access request like anyone; existing `"admitted by Trip Invite"` rows keep admitting; consequence "Admission is TRANSITIVE" no longer holds; approval revives that person's expired Trip Invites (Task 2); the Globe exclusion stands trivially.
- [ ] **Step 6: Commit** `feat(door): Trip Invites no longer admit; Teepee is full` (include CONTEXT.md and the spec+plan if not yet committed).

### Task 2: Approval revives expired Trip Invites

**Files:**
- Modify: `server/actions/access-requests.ts` (`approveAccessRequest`)
- Test: `server/actions/access-requests.test.ts`

**Interfaces:**
- Consumes: `INVITE_EXPIRY_MS` from `lib/invite-expiry.ts`.

- [ ] **Step 1: Failing test** `"approving revives the address's expired, unaccepted Trip Invites"`: add an `inviteUpdateManyMock` to the `@/lib/db` mock; approve a request for `"Sam@Example.com"`; expect `inviteUpdateMany` called once with `where: { email: "sam@example.com", acceptedAt: null, expiresAt: { lt: <now> } }` and `data: { expiresAt: <now + INVITE_EXPIRY_MS> }` (use `vi.useFakeTimers()` + `setSystemTime`). Add `"dismissing never touches Invites"` (`inviteUpdateMany` not called).
- [ ] **Step 2:** `npx vitest run server/actions/access-requests.test.ts` — FAIL.
- [ ] **Step 3:** In `approveAccessRequest`, after the `accessRequest.update` and before the email, `db.invite.updateMany` as asserted. Globe Invites untouched.
- [ ] **Step 4:** Re-run — PASS.
- [ ] **Step 5: Commit** `feat(admin): approving revives the person's expired Trip Invites`.

### Task 3: Access requests show who invited them, invited first

**Files:**
- Modify: `server/actions/access-requests.ts` (`AccessRequestView`, `listAccessRequests`)
- Modify: `app/(app)/admin/access-requests.tsx`
- Test: `server/actions/access-requests.test.ts`, `app/(app)/admin/access-requests.test.tsx`

**Interfaces:**
- Produces: `AccessRequestView.invitedTo: { tripName: string; ownerName: string }[]`.

- [ ] **Step 1: Failing action tests.**
  - `"attaches each request's unaccepted Trip Invites as tripName + ownerName"`: `invite.findMany` mock returns an invite for `sam@example.com` on trip `"Bali 2027"` whose owner member's user has `displayName: "Cam"` → that request's `invitedTo` equals `[{ tripName: "Bali 2027", ownerName: "Cam" }]`; a request with no invites gets `[]`.
  - `"lists invited requests first, each group oldest first"`.
  - Query shape: `invite.findMany({ where: { email: { in: <lowercased request emails> }, acceptedAt: null }, select: { email, trip: { select: { name, members: { where: { role: "owner" }, select: { user: <TravellerLike fields + email> } } } } } })`. Expired Invites are included on purpose (approval revives them). `ownerName` = `travellerName(ownerUser)` from `lib/traveller.ts`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. Sort: `invitedTo.length > 0` first, then `createdAt` asc.
- [ ] **Step 4: Panel test** `"shows 'Invited to Bali 2027 by Cam' under an invited request"` (one line per Invite, `text-xs text-muted-foreground`, under the email). Implement in `access-requests.tsx`.
- [ ] **Step 5:** `npx vitest run server/actions/access-requests.test.ts "app/(app)/admin/access-requests.test.tsx"` — PASS.
- [ ] **Step 6: Commit** `feat(admin): Access requests show the Trip and Owner that invited them`.

### Task 4: People list replaces "Who can sign in"

**Files:**
- Create: `lib/people.ts` (pure `buildPeople`)
- Create: `lib/people.test.ts`
- Create: `server/actions/people.ts` (`listPeople`)
- Create: `test/integration/people.test.ts` (real Postgres; `describe.skipIf(process.env.INTEGRATION !== "1")`, `requireAdmin` mocked as in `test/integration/connected-apps.test.ts`)
- Create: `app/(app)/admin/people.tsx`, `app/(app)/admin/people.test.tsx`
- Delete: `app/(app)/admin/allowed-emails.tsx`, `app/(app)/admin/allowed-emails.test.tsx`; remove `listAllowedEmails` + `AllowedEmailView` from `server/actions/access-requests.ts` and their tests (keep `revokeAllowedEmail`)
- Modify: `app/(app)/admin/page.tsx` (section `id="adm-allow"` → title "People", hint "Everyone who can sign in or has an account", renders `PeoplePanel`)

**Interfaces:**
- Produces:

```ts
export type PersonStatus = "access" | "never-signed-up" | "no-access";
export type PersonSource =
  | { kind: "env" }
  | { kind: "approved" }
  | { kind: "invited"; tripName: string; ownerName: string }
  | { kind: "unknown" };
export interface PersonView {
  email: string;            // lowercased; unique key
  name: string | null;      // travellerName() when a User exists, else null
  userId: string | null;
  status: PersonStatus;
  source: PersonSource;
  joinedAt: string | null;  // ISO: User.createdAt, else AllowedEmail.createdAt, else null
  lastSeenAt: string | null;// ISO: max(AuthSession.updatedAt, PushSubscription.lastSeenAt), else null
  tripsOwned: number;
  tripsOn: number;          // memberships with role "member"
  revokeId: string | null;  // AllowedEmail.id, or `env:${email}`, or null for no-access
}
export function buildPeople(input: {
  envEmails: string[];
  allowed: { id: string; email: string; note: string | null; createdAt: Date }[];
  users: { id: string; email: string; name: string; createdAt: Date; lastSeenAt: Date | null; tripsOwned: number; tripsOn: number }[];
  acceptedInvites: { email: string; acceptedAt: Date; tripName: string; ownerName: string }[];
}): PersonView[];
export async function listPeople(): Promise<PersonView[]>; // server/actions/people.ts, "use server", requireAdmin() first
```

- Rules: key on lowercased email across all three sources. Status: admitted (env or row) + user → `access`; admitted, no user → `never-signed-up`; user, not admitted → `no-access`. Source precedence: env → row note `"Approved from an Access request"` → earliest accepted Invite → `unknown`. `revokeId`: row id if a row exists, else `env:${email}` if env-only, else null. Sort: `access`, `never-signed-up`, `no-access`; within a group by `lastSeenAt` desc (nulls last), then email.

- [ ] **Step 1: `lib/people.test.ts` failing tests:** `"env + row for the same address is one person, revokeId is the row's id, source env"`; `"User email differing by case from a row is one person with status access"`; `"row with no User is never-signed-up"`; `"User with no row and not in env is no-access with revokeId null"`; `"approved note wins over an accepted Invite"`; `"'admitted by Trip Invite' row takes source from the earliest accepted Invite"`; `"no row note and no Invite is unknown"`; `"sorts by status group, then lastSeenAt desc nulls last"`.
- [ ] **Step 2:** `npx vitest run lib/people.test.ts` — FAIL. **Step 3:** implement `buildPeople`. **Step 4:** PASS.
- [ ] **Step 5: `listPeople`** loads: env via the same split/trim/lowercase as `isAllowedEmail`; all `allowedEmail` rows; all users with `createdAt`, TravellerLike fields, `_count`-or-groupBy of `memberships` by role, latest `AuthSession.updatedAt` and latest `PushSubscription.lastSeenAt`; accepted Invites (`acceptedAt: { not: null }`) with trip name + owner user. Owner/user names via `travellerName`. Feed to `buildPeople`.
- [ ] **Step 6: Integration test** `test/integration/people.test.ts`: seed (unique `@people.test` emails, cleaned up in `afterAll`) one approved+signed-up user with a session and an owned Trip, one invited-and-accepted user (row note `"admitted by Trip Invite"`) on that Trip, one row with no User, one User with no row; assert statuses, the invited one's source `{ kind: "invited", tripName, ownerName }`, `tripsOwned`/`tripsOn`, `lastSeenAt` from the session. Run `INTEGRATION=1 npx vitest run --config vitest.integration.config.ts test/integration/people.test.ts` (local DB is up) — PASS.
- [ ] **Step 7: `PeoplePanel`** (`initial: PersonView[]`, `now: Date`, `viewerEmail: string | null`), one Card per person, styled like the old allowed-emails rows. Lines: name (or email) / email / `Has access` · `Admitted, never signed up` · `No access (account remains)` badge / source line (`Set in ALLOWED_EMAILS`, `Approved`, `Invited to {trip} by {owner}`, `Unknown`) / `Joined {relativeTime}` · `Last seen {relativeTime | "—"}` · `Owns {n} · On {n}`. Right side reuses the old panel's logic: `env:` → "Not revocable here" badge; own email → "That's you"; `no-access` → nothing; else Revoke (same confirm copy and `revokeAllowedEmail` call). On successful revoke the row's status becomes `no-access` if `userId`, else it's removed. Tests in `people.test.tsx`: status badges render, Revoke absent for `no-access` and for viewer, revoke flips status.
- [ ] **Step 8:** Delete the old panel/tests and `listAllowedEmails`; wire `page.tsx`; update `app/(app)/admin/page.test.tsx` mocks. Task-done verification + `npx knip`.
- [ ] **Step 9: Commit** `feat(admin): People list replaces the allowlist panel`.

### Task 5: Waiting-list copy

**Files:**
- Modify: `app/landing/sign-in-panel.tsx` (COPY, button label, footer text, doc comment mentioning "Become a tester")
- Modify: `app/landing/email-sign-in.tsx` (`SENT`)
- Modify: `app/share/[token]/share-cta.tsx` (non-route body + button)
- Modify: `components/trip/settings/invite-panel.tsx` (per-pending-Invite line; the "No email is sent…" helper paragraph)
- Check: `app/privacy/page.tsx`, `app/terms/page.tsx`, `ONBOARDING.md`/help pages for "tester"/"in testing" (`grep -rni "tester\|in testing" app components lib`)
- Test: the matching `*.test.tsx` files that assert old strings

Exact strings (from the spec):

| Where | String |
|---|---|
| Landing secondary button | `Join the waiting list` |
| Landing footer | `Teepee is full right now` |
| `sign-in` | title `Come on in`, line `Teepee is full right now. If you already have a spot, sign in below.` |
| `request` | title `Teepee is full`, line `There's no room for new people right now. Sign in below to ask for a spot. There's nothing else to fill in.` |
| `denied` | title `Teepee is full right now.`, line `You don't have a spot yet. I've noted your request, and if a spot opens up for you I'll email you. Not everyone gets one.` |
| `SENT` | `If you already have a spot, a sign-in link is on its way. If not, I've noted your request.` |
| Share CTA body (non-route) | `Teepee keeps the route, the days and the money in one place, for everyone who's going. It's full right now, but there's a waiting list.` |
| Share CTA button | `Join the waiting list` |
| Invite panel, under each pending Invite's email | `If they don't have a spot yet, they'll wait on the waiting list until they're let in.` |
| Invite panel helper paragraph | `No email is sent. An Invite is created here, and it turns into access the next time that person signs in with the matching email address, once they have a spot.` |

- [ ] **Step 1:** Update the tests that assert the old strings to the new ones (and add one asserting the invite-panel line renders on a pending Invite). Run them — FAIL.
- [ ] **Step 2:** Swap the strings. Keep `Badge` "Pending" on Invite rows; the new line sits under the email (`text-xs text-muted-foreground`, wraps).
- [ ] **Step 3:** Run the changed tests + `npx vitest run test/copy-style.test.ts` — PASS. Grep shows no remaining Traveller-facing "tester"/"in testing" (leave docs/ADRs alone).
- [ ] **Step 4: Commit** `feat(landing): Teepee is full, join the waiting list`.

### Branch finish

- [ ] `npm test` + `npm run build` + `npm run test:integration` — all green (known node-22 Intl failures in money.test/home tiles are pre-existing, see memory).
