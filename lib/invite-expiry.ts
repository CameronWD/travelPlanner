/**
 * Shared invite-expiry duration — the single source of truth for how long a
 * Trip or Globe Invite stays open before `lib/invites.ts` and
 * `lib/globe-invites.ts`'s acceptance filters treat it as expired.
 *
 * Kept in its own framework-free module (rather than inside `lib/invites.ts`
 * or `lib/globe-invites.ts`) so neither domain has to reach into the other's
 * file for it — Trip creation sites (`server/actions/invites.ts`,
 * `server/actions/trips.ts`) and the Globe creation site
 * (`server/actions/globe.ts`) all import the same name.
 *
 * This is security-relevant, not cosmetic: a later task on this branch makes
 * a pending Invite sufficient to create an account on this deployment, so
 * how long an invited-but-unclaimed address stays valid is how long that
 * door stays open. One exported constant means bumping it (e.g. for a
 * support workaround) changes the lifetime everywhere at once instead of
 * silently diverging between Trip and Globe invites.
 */
export const INVITE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
