# 0070 — Stay on the Auth.js v5 beta until auth is next touched; then move to Better Auth

## Status
Accepted (2026-10-06).

## Context

TEEPEE signs Travellers in through `next-auth@5.0.0-beta.32` with the Prisma
adapter. Auth.js v5 never shipped a stable release. In 2026 the Auth.js
project joined Better Auth and entered security-patch-only maintenance; its
own guidance for new projects is Better Auth, which is MIT-licensed and ships
a Prisma adapter.

The beta is pinned exactly and works. Our sign-in logic is not trivial:
magic-link email, Google, the allowlist-or-pending-Invite door in the
`signIn` callback (ADR 0057), JWT sessions, and the dev-login shim. A
migration rewrites all of it.

## Decision

- **No migration now.** The beta stays pinned. Security advisories for
  `next-auth` are watched and patched promptly.
- **No new auth surface is built on the beta.** Anything that would extend
  sign-in (a new provider, passkeys, sessions in the database, device
  management) triggers the migration first.
- **The migration target is Better Auth**, keeping ADR 0057's one-door rule
  and every current provider. It gets its own spec and ADR when it happens.

## Considered

- **Migrate now.** Rejected: a large rewrite of working, tested code with no
  Traveller-visible gain today.
- **Lucia / hand-rolled sessions.** Rejected: Lucia is deprecated as a library;
  hand-rolled auth trades a maintained dependency for our own bugs.
