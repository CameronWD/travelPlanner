# 0057 — One door: sign-in is decided in the `signIn` callback, by allowlist or a pending Trip Invite

## Status
Accepted (2026-09-23)

## Context

`ARCH-TEN-3` (`docs/architecture-sitrep-2026-09-22.md`) found that **nothing
in the repo decided who may sign in**. `lib/auth.ts` registered Google
whenever the two env vars were set, `PrismaAdapter` minted a `User` on first
sign-in, and the only thing standing between a stranger and a full
authenticated session was Google Cloud Console's *test user* list — a
hand-maintained door outside the codebase, invisible in a diff, and one
console click from being published. Every other tenancy finding in that
sitrep assumes an attacker already holds a session; this is the finding that
decides whether they can get one.

The sitrep specified the fix ("The door — specified, not built") and left it
unbuilt. This ADR records what was actually built on `feat/rollout-gate`,
including four things that only became visible while building it and are not
in that specification.

The surrounding facts that constrain the design:

- Auth.js has **two** hooks named `signIn`. The **callback** runs *before*
  sign-in completes and returning `false` rejects it, so no `User` row is
  ever created. The **event** runs *after* sign-in has already succeeded and
  cannot block anything. Before this branch, TEEPEE registered only the
  event, which calls `acceptPendingInvitesForUser` (ADR 0017).
- Acceptance has **two** call sites, not one: that event, and
  `app/(app)/layout.tsx`'s reconcile on every authenticated app load — which
  ADR 0017 calls the important one, since the event never fires for someone
  already signed in. Both run only after a completed sign-in.
- An Invite is a pending `(tripId, email)` row with no accept-link; it
  becomes membership by email match (ADR 0017). `inviteToTrip` is
  owner-or-admin (ADR 0052). `inviteToGlobe` was gated by *nothing* —
  `ARCH-TEN-4`, fixed on this same branch.

## Decision

### 1. The gate is a `signIn` **callback**, not the `signIn` event

`lib/auth.ts`'s `callbacks.signIn` is the single call site that decides
admission. It runs for **every** provider — today Google and the dev-only
Credentials provider, tomorrow whatever is added — which is the point: a
future provider inherits the gate instead of quietly opening a second door.

**Rejected: the `signIn` event.** It cannot block. It runs after
`PrismaAdapter` has already created the `User` row, so a refusal there means
deleting an account that should never have existed, from inside a hook whose
return value nobody reads.

**Rejected: a callback-less allowlist** — that is, allowlist-only admission
with no Invite clause. Because the callback runs *before* both acceptance
paths, a plain allowlist bounces an invited Traveller before the code that
would have accepted their Invite ever runs. They cannot sign in, their Invite
sits `acceptedAt: null` for ever, and the Trip's owner has no way to tell
from inside the app that anything is wrong. The Invite clause in decision 2
exists precisely because the gate moved in front of acceptance.

### 2. Admission is **allowlist OR a pending unexpired Trip Invite** — never a Globe Invite

`lib/allowlist.ts` exposes `isAllowedEmail` and `hasPendingTripInvite`; the
callback tries them in that order and refuses if both are false.

**The Globe exclusion is the load-bearing, non-obvious part, and a future
reader will otherwise undo it as an inconsistency.** Honouring a pending
Invite in the callback makes *"who can create an Invite"* exactly equal to
*"who can create an account on this deployment"*. The two invite paths were
never equally gated:

| Path | Gate | Evidence |
|---|---|---|
| `inviteToTrip` | owner-or-admin | `server/actions/invites.ts`, ADR 0052 |
| `inviteToGlobe` | none until this branch | `ARCH-TEN-4`, now `requireGlobeOwner` |

Both acceptance helpers match on email identically, so honouring Globe
Invites would have let any Globe member mint accounts. `ARCH-TEN-4` is fixed
on this branch, so the *gate* is no longer the reason — but the exclusion
stands on its own and is permanent: **a Globe is a Traveller's personal
saved-places history, not an onboarding route.** A Globe Invite says "look at
my map", not "come and live here". Wiring it to account creation would make
every Globe owner an admissions officer for the deployment as a side effect
of sharing pins. `lib/allowlist.ts` has a test that seeds a matching Globe
Invite and asserts both the refusal *and* that `globeInvite.findFirst` is
never called (`lib/auth.test.ts`, *"does NOT admit on a Globe Invite"*), so
restoring the coupling fails the suite rather than passing silently.

**Rejected: honouring any pending Invite of either kind.** Simpler predicate,
one query instead of two — and it converts the weakest invite-creation gate
in the codebase into the deployment's admission policy.

**Not a risk, recorded so it is not re-litigated:** the email is taken from
Google's verified profile (`profile.email_verified !== true` refuses), so the
person signing in cannot forge a match against someone else's Invite. All the
trust sits with whoever *created* the Invite, which is why the creation gate
is what matters.

### 3. The allowlist has two sources, and that is not a contradiction of "one door"

`isAllowedEmail` consults, in order:

1. **`ALLOWED_EMAILS`** — a comma-separated env var, trimmed and lowercased.
   Bootstrap and break-glass. **Never written by code.**
2. **The `AllowedEmail` table** — everyone admitted through the product: by
   an Admin approving an Access request, or by the invite-admission write in
   decision 4.

**Why both, rather than picking one:**

- **An env var cannot be written at runtime.** Approving an Access request
  has to put the address *somewhere*, and a deployment's environment is not
  somewhere a server action can write. Table-only for approval is therefore
  forced.
- **A row is more revocable than an env var, not less.** Dropping an address
  from `ALLOWED_EMAILS` needs an edit in the Vercel dashboard and a redeploy;
  deleting a row is a button in `/admin`. The env var is the *less* agile
  source, which is exactly why it is the break-glass one.
- **Break-glass against a wiped or restored-empty table.** If the table is
  lost, `ALLOWED_EMAILS` is how the operator gets back in without a database
  edit. It is **not** break-glass against a *down* database: the adapter
  needs Postgres one line later regardless, so an outage takes sign-in down
  either way.

**"One door" means one predicate at one call site, not one storage
location.** The thing the sitrep was trying to kill was a *second decision
point* — Google's console list deciding admission in parallel with, and
invisibly to, the app. Two rows in one predicate's lookup order is not that.

**Rejected: env-var only** (the sitrep's own first sketch, shaped after
`isAdminEmail`) — approval has nowhere to write, so the whole Access request
feature collapses into "the operator edits Vercel and redeploys".
**Rejected: table only** — no bootstrap path on a fresh deployment, and no
recovery if the table is empty when the gate starts being enforced.

### 4. Admission by Invite **writes an `AllowedEmail` row**

When `hasPendingTripInvite` admits someone, `admitByTripInvite` upserts a
lowercased `AllowedEmail` row for that address before the callback returns
`true`.

**This is the single most important thing in this ADR.** Without it,
admission by Invite is a **one-shot ticket**. `acceptPendingInvitesForUser`
marks the Invite accepted moments after sign-in — from the `signIn` event,
and again from `app/(app)/layout.tsx` on every authenticated load — so
`hasPendingTripInvite` returns false from then on. Every Traveller invited
after this migration would have been **locked out of their own account on
their second sign-in**: still holding a `User` row, a `TripMember` row, and
their own Journal entries, Notes and Costs, and refused at the door with no
way back in short of an operator writing SQL. The bug would have shipped; it
was caught in review, and it is the reason this section exists rather than a
one-line "the callback also checks Invites".

Mechanics worth knowing: the write is an `upsert` with an empty `update`, so
it is idempotent and never overwrites a row an approved Access request
already wrote. It is *awaited before* returning `true`, so a failed write
refuses the sign-in rather than admitting someone with no durable record —
which is the safe direction, because the acceptance paths only run after a
successful sign-in, so the Invite stays unspent and the retry succeeds.

### 5. Invites expire after 30 days, backfilled from the **deploy date**

`INVITE_EXPIRY_MS` (`lib/invite-expiry.ts`) is a single 30-day constant used
by every Invite creation site, Trip and Globe alike. Both acceptance helpers
filter on `acceptedAt IS NULL AND (expiresAt IS NULL OR expiresAt > now())`.

Expiry matters *because* of decision 2: under Invite-as-account-grant, every
address ever invited — including one invited by typo — would otherwise hold a
permanently open door to the deployment.

`expiresAt: null` is deliberately treated as **valid**, not expired. It is
what pre-migration rows look like, and what rows written by the *old* build
during the deploy window look like.

**The migration backfills `expiresAt` to deploy date + 30 days, never
`createdAt` + 30.** Backfilling from `createdAt` would have marked every
pending Invite older than 30 days as already expired at the instant of
deploy, silently revoking live invitations someone was still waiting on. The
same reasoning is applied to `GlobeInvite.expiresAt`.

## Consequences

- **Admission is TRANSITIVE, and the allowlist is not a containment
  boundary.** `createTrip` is open to any signed-in Traveller, the creator
  becomes that Trip's owner, and owners may invite (ADR 0052). So anyone
  admitted can admit anyone else, without an Admin ever being in the loop.
  An earlier code comment claimed the allowlist *contained* the deployment;
  **that claim was false** and has been removed. The operator's decision
  (2026-09-22), taken with this stated plainly, was: **accept it, document it
  honestly, and make the growth visible** — `notifyAdmins` fires on the first
  admission of each address by Invite, so the deployment grows where the
  operator can see it rather than silently. The allowlist bounds *who starts
  a chain*, not how long the chain gets.
- **The allowlist is deployment-scoped, not Trip-scoped.** Removing someone
  from a Trip (`removeTripMember`, `leaveTrip`) deletes their membership and
  any pending Invite, but **not** the `AllowedEmail` row that admitted them.
  They keep the ability to sign in and to create their own Trips. That is the
  intended shape — sign-in is about the deployment, membership is about a
  Trip — but it means Trip removal is not revocation. `/admin` therefore
  carries an explicit revoke path against the allowlist itself, which is the
  only place deployment-level access is taken away.
- **Revocation is JWT-bounded, not instant — for both sources.** Sessions are
  Auth.js JWTs with `strategy: "jwt"` and no `maxAge` override (Auth.js's
  default is 30 days), and nothing re-checks the allowlist against an
  existing session. Deleting a row, exactly like dropping an address from
  `ALLOWED_EMAILS`, takes effect at that person's **next sign-in**. A revoked
  address keeps working until its current session lapses. The table is easier
  to *edit* than a redeploy; it is not faster to *take effect*. If instant
  revocation is ever needed, that is a session-strategy change, not an
  allowlist change.
- A refused sign-in is not a dead end: the callback records (or bumps) an
  **Access request** from Google's verified profile, and `/signin` renders an
  explanatory card rather than Auth.js's unbranded error page. Both
  `pages.signIn` and `pages.error` point at `/signin`, because `AccessDenied`
  resolves against `pages.error`.
- **A bump does not notify.** Only a brand-new request notifies the Admin, and
  one other case below. A repeat attempt raises `lastAttemptAt` and `attempts`
  and nothing else — otherwise anyone refused could put a notification on the
  operator's lock screen on demand by clicking sign-in, and `status` is never
  touched so a dismissed request stays dismissed. (An earlier version of this
  ADR said a refusal "records (or bumps) … and notifies the Admin", which was
  true only of the record half.)
- **A revoked address reopens its request.** Approving stamps `resolvedAt`,
  and `/admin` lists only rows with `resolvedAt IS NULL`, so revoking
  someone's `AllowedEmail` row used to leave them stranded *and invisible*:
  signing in again bumped a row nobody would ever see, with no reopen control
  and no add-an-address control on `/admin`, and raw SQL as the only way back.
  A repeat attempt now clears `resolvedAt` and notifies when all three hold:
  the row is resolved, its `status` is not `"dismissed"`, and the address is
  no longer in `AllowedEmail`. That is exactly the revoked case. Dismissal
  still means dismissed (condition two), an already-open request still never
  re-notifies (condition one), and a standing approval is untouched
  (condition three).
- **`/signin`'s refusal card promises nothing.** It is shown to a brand-new
  stranger, someone already waiting, someone dismissed and someone revoked
  alike, and it cannot tell which is reading it — so it says the attempt was
  recorded and that not every request is granted, and stops there. It used to
  say "you'll be able to sign in here once you're approved", which was false
  for the last two and contradicted `/privacy`, which already said so.
  Telling a reader which bucket they are in would turn the page into an
  oracle about the Admin's decisions.
- The Google Cloud Console test-user list stops being a second door. The
  OAuth app can be published (`docs/DEPLOY.md`), and the 100-test-user
  ceiling stops being TEEPEE's access-control policy.
- The dev-login provider is short-circuited in the callback with its own
  `NODE_ENV !== "production"` check. That is belt-and-braces — the provider is
  already unregistrable in production — so that a future refactor of the
  provider list cannot reopen a production dev-login door through the
  callback alone.
- Every new code path that **writes** an email must lowercase it explicitly.
  `User.email` comes straight from the OAuth provider and is never normalised
  anywhere in this repo; the gate is safe only because both predicates
  lowercase on the read side, and because the migration backfills
  `AllowedEmail` via `LOWER("email")`.
