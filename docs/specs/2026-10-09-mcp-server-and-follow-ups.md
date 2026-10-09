# Spec 2026-10-09 · Claude connection (MCP server) and follow-ups TC-02, TC-04, TC-05

One branch: `feat/mcp-and-follow-ups-2026-10-09`. Agreed with Cam in the
2026-10-09 grilling session. Domain terms: CONTEXT.md **Claude connection**,
**Activity**. Decision record: ADR 0070, amendment 2026-10-09.

---

## Part 1 · TC-05 · Operator scripts load their env and refuse a mismatched storage

Builds on spec 2026-10-09-backfill-env (`scripts/lib/storage-target.ts`).

A. `scripts/sweep-deleted-blobs.ts` (`sweep:blobs`):
   - Prints `describeTarget(process.env, !execute)` as its first output line.
   - Calls `assertStorageMatchesDatabase(process.env)` before touching the
     database or storage, **in dry runs too**. Local storage against a remote
     database is refused with that function's message.
   - Keeps `resolveSweepDriver`'s existing rule (`--execute` refuses an unset
     `STORAGE_DRIVER`). The two guards stack; neither replaces the other.
B. `scripts/backfill-geocode.ts` and `scripts/sweep-orphaned-costs.ts`:
   - Import `./load-env` first, for its side effect, before any import that
     reads env (same pattern and comment as `scripts/feedback-pull.ts`).
   - Print a target line first (database host, no credentials; DRY RUN or
     LIVE). They touch no storage, so no storage guard.
C. `scripts/verify-r2-presign.ts` is unchanged: it never touches the database
   and is run with R2 variables inline, which `load-env`'s `override: true`
   would clobber.
D. Tests: the sweep's guard ordering (refusal happens before any DB or
   storage call, dry run included), and the target line for the two
   DB-only scripts, written so no credentials appear.
E. `docs/open-follow-ups.md`: strike TC-05 with what was done.

## Part 2 · TC-04 · Layout-audit overlay recipes match the live UI

`scripts/layout-audit/overlays.ts` recipes name buttons and dialogs that no
longer render. Known stale: `stop-add` ("Add Stop", now "Add a stop") and
`item-add` ("Add Thing to Do", which renders nowhere). Several more are
ambiguous after the casing pass (`028cb095`): `accommodation-add`,
`transport-add`, `transport-edit`, `cost-add`, `item-add`, `chapter-add`,
`schedule-item`, `wishlist-add`.

A. Run the layout audit's **overlay set** against the local app (local
   Postgres + dev server). Every recipe that times out or reports a
   coverage gap gets its click and expect names, and its doc comment,
   corrected to what actually renders.
B. Re-run until every overlay captures. Update `overlays.test.ts` /
   `run.test.ts` fixtures only where they assert a renamed literal.
C. Fallback if the local DB or dev server cannot run in the sandbox: fix by
   reading each component, and **say so** in the report and in TC-04's
   strike note ("fixed by inspection, not run").
D. `docs/open-follow-ups.md`: strike TC-04.

## Part 3 · TC-02 · The two leaking component tests

In scope: `components/new-trip/new-trip-flow.test.tsx` (1 test fails under
happy-dom after the file's other 45 run) and
`components/feedback/feedback-launcher.test.tsx` (2 tests, after ~60).

A. For each file, run the diagnose loop: find the earliest preceding test
   whose presence makes the target fail, then the state it leaves behind
   (unreset mock, pending timer or promise, storage or IndexedDB residue,
   module-level singleton such as `lib/feedback-queue`).
B. Test-hygiene cause → fix the setup, remove the line-1 jsdom opt-in and
   its comment. No assertion is weakened.
C. Real component bug → fix the component (with a test that pins it), then
   as B.
D. Time-boxed. If the cause is not found, or the only fix weakens an
   assertion, the file stays on jsdom, its line-1 comment is rewritten with
   what was learned, and TC-02 stays open with that note.
E. Out of scope: `admin/page`, `step-when`, `item-photo-thumb` (known
   environment causes) and every `.ts` jsdom opt-in.

## Part 4 · TC-03 · Claude connection: a hosted MCP server

### Goal

Cam and his partner can work on their Trips from Claude Code and Claude
Desktop, with no codebase and no database credentials on their machines.

### Shape

- A Streamable HTTP MCP endpoint at **`/api/mcp`** inside the existing Next
  app, deployed with it on Vercel. Stateless (no session store). Uses the
  official MCP TypeScript SDK. Read `node_modules/next/dist/docs/` for route
  handlers before writing it.
- **Auth:** `Authorization: Bearer <token>`. A missing, unknown or revoked
  token gets a bare 401 that does not reveal whether anything exists.
- **Acting traveller:** after the token resolves to a User, every tool runs
  the **existing server actions** with that User as the acting user. The
  same guards (`requireUser`, `requireTripAccess`, `requireTripOwner`, the
  owner-or-admin checks) decide, never a parallel check. The mechanism is
  a request-scoped acting-user context that `requireUser` consults before
  `auth()`. Only `/api/mcp` can set it, and only after verifying a token.
  `notFound()` becomes a "not found" tool error and `redirect()` becomes an
  auth error; neither leaks whether a Trip exists.
- **Real plan only:** no Fork tools and no `forkId` parameters. Every write
  targets the real plan.

### Tokens (operator-minted; ADR 0070 amendment)

New model `McpToken`: id, userId, label, tokenHash (SHA-256 of a random
≥ 256-bit token), createdAt, lastUsedAt, revokedAt. Unique on
(userId, label) among live tokens.

`npm run mcp:token` (loads `.env.production.local` via `scripts/load-env.ts`,
prints a credential-free target line first):

- `-- --email <email> --label <label>` mints a token and prints it **once**.
  The email must belong to an existing User.
- `-- --list` shows id, traveller email, label, created and last used. Never
  the token.
- `-- --revoke <id>` takes effect on the next request.

No expiry. `lastUsedAt` updates on use (throttled, not on every call).

### Activity marked "via Claude"

- `Activity` gains a nullable source column. Rows written while the acting
  user came from a Claude connection carry it.
- The Activity feed and notifications render "· via Claude" on those rows.
- No new Activity kinds. Checklists, Reminders, Day titles and Votes still
  write no Activity, by anyone (decided: option (a)).

### Tools (v1)

Described to Claude in plain words: an Item is "a thing to do or see", the
Wishlist is "ideas not yet placed".

Read:
- list my Trips
- get a Trip's real Plan: Stops with nights and dates, Transport,
  Accommodation, Items by Stop and day, Day titles, Chapters
- get the Wishlist (with Votes) and Notes
- get Budget (totals in Home currency, unpaid) and Flags
- get Activity since a time
- get Reminders
- get Checklists (pre-trip, Packing, Shopping) and packing templates
- list Globe Markers (read-only)
- place search (geocode), for choosing Stop and Item locations

Write:
- **Trips:** create; edit name, dates, Hard end date
- **Stops:** add, edit, move/reorder, set nights or dates, pin/make rough,
  set notes, Firm up, delete
- **Items:** add, edit, schedule onto a day, unschedule, add to Wishlist,
  place a Wishlist idea at a Stop, delete
- **Accommodation, Transport, Costs:** add, edit, delete; mark Cost paid or
  unpaid
- **Chapters:** add, edit, assign Stops
- **Day titles:** set and clear
- **Notes:** add
- **Votes:** set and clear on Wishlist ideas
- **Reminders:** add, edit, delete
- **Checklists:** add, edit, tick/untick, reorder, delete; mark Need to buy;
  save as packing template; apply template
- **Make it fit:** preview, then apply (two tools)

Not in v1: Forks, Trip delete/duplicate/restore, members, Invites, Share
links, Calendar feeds, Attachments, Item photos, covers, Journal, Globe
writes, push, Admin, Feedback.

### Prompts (v1)

- `review-plan`: read the whole plan and its Flags and suggest fixes.
- `pack-for`: build or extend the Packing list from the Trip's places,
  dates and season.

### Hardening

- The route rejects requests without a valid token before parsing the MCP
  body.
- Tool inputs are validated with zod; a schema error is a tool error, not
  a 500.
- Server errors are reported to the existing error sink without the token.

### Docs

- `docs/connect-claude.md`: how a Traveller connects, and how the operator
  mints and revokes tokens.
  - **Claude Code** (verified, code.claude.com/docs/en/mcp): `claude mcp add
    --transport http teepee <url> --header "Authorization: Bearer <token>"`,
    or `.mcp.json` with `"headers"`, where the token may be `${TEEPEE_TOKEN}`
    from the environment.
  - **Claude Desktop:** its own static-header connectors are an org-level
    beta, not per-person tokens, so it is **not** the route. Use a local
    config entry running the `mcp-remote` bridge (`npx mcp-remote <url>
    --header ...`). This needs Node, not the codebase. Not confirmed in docs:
    the build verifies the exact config against the bridge's current README.
    If it cannot be made to work, the doc says Desktop waits for OAuth
    (TC-06).
- `docs/DEPLOY.md`: the migration and the route, under deploy steps.
- `docs/open-follow-ups.md`: strike TC-03 v1; add TC-06, "OAuth Claude
  connection after Better Auth (bound by ADR 0070 amendment)", and a
  "Checklist and Reminder history in Activity" idea for later.

### Tests

- Guards: the acting-user context is honoured by `requireUser`; it cannot be
  set outside the MCP route; a non-member gets "not found" through a tool.
- Token: hash-at-rest, mint/list/revoke, revoked and unknown both give the
  same 401.
- Activity: a write through a tool records the source; the feed renders
  "via Claude".
- Each tool group: one happy path through the real action, one access
  refusal.
- Integration (when the local DB is up): mint a token, call `/api/mcp`
  end to end, see the change and its Activity row.

### Out of scope

OAuth (TC-06, after Better Auth). An Account-page token UI. Rate limiting
beyond what Vercel gives. Bundling a local stdio server.

### Deploy note

The branch adds one migration (`McpToken`, `Activity` source column).
Nothing deploys and no migration is applied to production without Cam's
go-ahead.
