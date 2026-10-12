# Spec 2026-10-12 · TC-06: Better Auth, and OAuth for the Claude connection

Branch `feat/tc-06-claude-oauth-2026-10-12`. Agreed with Cam 2026-10-12
(grill-with-docs). Decisions in ADR 0071; terms in CONTEXT.md (**Claude
connection**, **Connected apps**). Ships straight to main.

## Part 1 · Sign-in on Better Auth

A. Replace `next-auth` + `@auth/prisma-adapter` with `better-auth` and its
   Prisma adapter. Keep every door:
   - Google (same client id and secret; callback path unchanged, so the Google
     console needs nothing), with email-verified-only linking as today.
   - Sign-in link by email through Resend (Better Auth magic-link plugin),
     still sent through `lib/mail.ts` with `renderSignInEmail`.
   - Dev login: a dev-only endpoint that signs in as any email, registered
     only when `ALLOW_DEV_LOGIN === "true"` and never in production.
B. ADR 0057's one door, unchanged in behaviour: an email signs in only if it
   is allowlisted or has a pending Invite (which is then accepted); otherwise
   an access request is recorded and admins are notified. Expressed once, in
   Better Auth's before-sign-in hook, and tested like `lib/auth.test.ts`.
C. Sessions in the database (Better Auth default, with its cookie cache).
   `requireUser` / `lib/guards.ts`, `proxy.ts`, the layouts, sign-out, the
   attachment serve route and `app/api/client-error` read the session through
   one `lib/auth.ts` surface, so call sites change imports, not logic.
D. Schema: Better Auth's `session`, `account`, `verification` tables (its own
   names, Prisma-managed migration). `User` is shared as-is; a data migration
   copies Auth.js `Account` rows for Google into the new `account` table
   (provider → providerId, providerAccountId → accountId). Old `Account`,
   `Session`, `VerificationToken` stay for one release (rollback), dropped in
   the follow-up.
E. Admin (`ADMIN_EMAILS`) and `isAdminEmail` unchanged.

## Part 2 · OAuth for the Claude connection

A. `@better-auth/mcp` provides `/.well-known/oauth-authorization-server`,
   dynamic client registration, authorise, token and revoke endpoints under
   `/api/auth`. One scope, meaning "act as me"; no finer grants.
B. Consent page (Teepee-styled): "Claude wants to access your trips as
   [name]" with Allow / Cancel; shows which client is asking. Signing in
   first if needed, through the normal doors.
C. `/api/mcp` accepts the OAuth access token, resolves the Traveller through
   the plugin's session helper, and runs `runAsTraveller` exactly as before.
   Unauthenticated requests return 401 with the `WWW-Authenticate` resource
   metadata the MCP spec requires, so clients know where to sign in. Rate
   limiting keys on the Traveller instead of the token id.
D. Remove: `lib/mcp/tokens.ts`, `scripts/mcp-token.ts`, `npm run mcp:token`,
   the `McpToken` model (dropped in this migration), and their tests.
E. Access tokens are short-lived with refresh tokens, per the plugin's
   defaults; disconnecting revokes both.

## Part 3 · Connected apps

On the Account page: each OAuth client the Traveller has allowed, with its
name, connected date, last used, and Disconnect (revokes immediately). Empty
state explains how to connect Claude. Server action access-checked to the
Traveller's own rows.

## Docs

- `docs/connect-claude.md`: replace the token sections with "Connect from
  claude.ai / phone / Desktop / Code" (add Teepee's `/api/mcp` URL as a
  connector; sign in; Allow), the Connected apps section, and what to do if
  a connection stops working (disconnect and reconnect). Desktop no longer
  needs `mcp-remote`.
- `docs/DEPLOY.md` / `docs/HANDOFF.md`: env vars (`BETTER_AUTH_SECRET`
  replaces `AUTH_SECRET`; Google and Resend vars keep their names or are
  mapped), the migration order, and the "everyone signs in again" note.
- `docs/open-follow-ups.md`: strike TC-06; add the cleanup follow-up (drop
  the Auth.js tables; remove the data-migration code) as TC-13.
- ADR 0070: add a closing note pointing at ADR 0071.

## Verification

Unit tests for the one-door hook, the dev-login gate, the consent page, the
MCP route with OAuth tokens (valid, expired, revoked, non-member), Connected
apps. Integration test `test/integration/mcp.test.ts` updated to obtain a
token through the OAuth flow. Manual, by Cam after the deploy: sign in with
Google and with the email link; connect Claude on the phone app, claude.ai
and Desktop; disconnect one and confirm it stops.

## Out of scope

Passkeys, device management, session listing (Account **Devices** stays as
is), granular OAuth scopes, dropping the old tables (TC-13), the Surprise
feature (TC-12).
