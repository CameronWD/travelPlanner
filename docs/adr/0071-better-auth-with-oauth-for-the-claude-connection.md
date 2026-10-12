# 0071 — Move sign-in to Better Auth, with OAuth for the Claude connection

## Status
Accepted (2026-10-12). Executes ADR 0070's deferred migration and closes its 2026-10-09 amendment.

## Context

ADR 0070 pinned the unmaintained Auth.js v5 beta and ruled that the next
thing to extend sign-in would trigger the move to Better Auth. That thing
has arrived: the Claude connection (TC-03) works from Claude Code and
Desktop through operator-minted tokens, but claude.ai on the web and the
Claude phone app can only connect through OAuth sign-in, which the beta
cannot provide (ADR 0070 forbids new auth surface on it, and the beta has
no OAuth-server side).

Better Auth 1.7 ships a maintained MCP plugin (`@better-auth/mcp`) that
provides exactly what the Claude clients need: the OAuth authorisation
endpoints, discovery metadata, dynamic client registration, and a session
check for the MCP route. Building that ourselves on the beta would mean
writing security-sensitive code twice.

## Decision

1. **Sign-in moves to Better Auth** with its Prisma adapter. Every current
   door stays: Google, the Sign-in link by email (Resend), and the local-only
   dev login (rebuilt as a dev-only endpoint, gated as before, never in
   production). ADR 0057's one-door rule (allowlist or pending Invite, else
   an access request) is kept, re-expressed in Better Auth's hooks.
2. **Sessions live in the database** (Better Auth's default) instead of the
   beta's JWT cookies. Everyone signs in once more after the deploy; they
   land in the same accounts (same `User` rows; Google links migrated).
3. **The Claude connection authenticates by OAuth** through
   `@better-auth/mcp`: a Claude client registers itself, the Traveller signs
   in and allows it on a TEEPEE consent page, and `/api/mcp` accepts the
   resulting access token as that Traveller. The acting-traveller scope and
   every guard behind it are unchanged.
4. **Operator tokens are retired in the same release**: the `mcp:token`
   script and `McpToken` table go. No transition period; the number of
   connections is tiny and reconnecting takes a minute.
5. **Travellers manage their own connections** under **Connected apps** on
   the Account page, with disconnect. The operator mints nothing.
6. **Rollout goes straight to main**, not beta first. The old Auth.js tables
   are left in place for one release so a rollback to the previous build
   still signs people in; they are dropped in the follow-up cleanup.

## Considered

- **OAuth bolted onto the Auth.js beta.** Rejected: breaks ADR 0070's rule,
  and the OAuth server would be hand-assembled on an unmaintained base, then
  rewritten in the migration anyway.
- **Token in the URL for claude.ai.** Rejected: URLs leak into logs and
  history; whoever has the URL is the Traveller.
- **Keep tokens alongside OAuth for a release.** Rejected by the operator:
  not worth the dual code path for a handful of connections.
- **Beta first.** Rejected by the operator for the same reason; the
  retained old tables give a rollback path instead.

## Consequences

- Every signed-in Traveller signs in again once. Invitations, the allowlist,
  access requests and memberships are untouched (they are TEEPEE's own
  tables).
- `docs/connect-claude.md` loses the token instructions and gains the
  connect-by-sign-in flow for claude.ai, the phone app, Desktop and Code.
- Device management, passkeys and session revocation become possible later
  without another migration.
- A second cleanup branch drops the Auth.js tables once main has been live
  on Better Auth.
