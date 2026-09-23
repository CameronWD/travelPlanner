import { db } from "@/lib/db";

/**
 * Sign-in allowlist (ADR 0057). ONE predicate, TWO sources:
 *
 *   - ALLOWED_EMAILS env var — bootstrap and break-glass against a wiped or
 *     restored-empty AllowedEmail table. It is NOT break-glass against a
 *     *down* database: the table lookup below, and the Prisma adapter one
 *     line after this callback runs in lib/auth.ts, both need Postgres
 *     regardless, so an outage takes sign-in down either way. NEVER written
 *     by code.
 *   - AllowedEmail table — everyone admitted through the product: by
 *     approving an Access request, or, for someone who signed in on a
 *     pending Trip Invite, written by admitByTripInvite below at the moment
 *     they're admitted.
 *
 * Revocation is NOT instant for either source. Sessions are Auth.js JWTs
 * with no maxAge override (Auth.js's default is 30 days), and nothing
 * re-checks the allowlist against an existing session — so deleting a row,
 * same as dropping an address from ALLOWED_EMAILS, only takes effect at that
 * person's next sign-in. The table is easier to edit than a redeploy; it is
 * not faster to take effect.
 *
 * "One door" means one predicate at one call site, not one storage location.
 * Shaped like isAdminEmail (lib/admin.ts): server-only, trimmed, lowercased.
 */
export async function isAllowedEmail(
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false;
  const needle = email.trim().toLowerCase();
  if (!needle) return false;

  const raw = process.env.ALLOWED_EMAILS;
  if (raw) {
    const listed = raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);
    if (listed.includes(needle)) return true;
  }

  const row = await db.allowedEmail.findUnique({ where: { email: needle } });
  return row !== null;
}

/**
 * True when this address holds an unexpired, un-accepted TRIP Invite.
 *
 * TRIP INVITES ONLY — never Globe Invites, and this is load-bearing. It makes
 * "who can create an Invite" exactly equal to "who can create an account on
 * this deployment". inviteToTrip is owner-or-admin (ADR 0052); honouring
 * Globe Invites here would let any Globe member mint accounts. A Globe is a
 * personal saved-places history, not an onboarding route (ADR 0057).
 */
export async function hasPendingTripInvite(email: string): Promise<boolean> {
  const needle = email.trim().toLowerCase();
  if (!needle) return false;
  const invite = await db.invite.findFirst({
    where: {
      email: needle,
      acceptedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  return invite !== null;
}

/**
 * Promote someone admitted via a pending Trip Invite into the permanent
 * AllowedEmail table.
 *
 * Without this, admission by Invite is a one-shot ticket: the Invite itself
 * gets marked accepted moments after sign-in (the events.signIn hook in
 * lib/auth.ts, and app/(app)/layout.tsx again on every authenticated load),
 * so a second call to hasPendingTripInvite for the same address comes back
 * false. The next time that person's JWT session lapses or they sign out —
 * Auth.js's default session lifetime is 30 days — they hold a User row, a
 * TripMember row, and authored content, but the signIn callback refuses
 * them. This closes that gap by writing the same durable admission an
 * approved Access request would have written, at the moment the Invite does
 * its job.
 *
 * Upsert, not create: idempotent against being called on every sign-in that
 * takes this path, and `update: {}` deliberately never overwrites an
 * existing row (e.g. one an approved Access request already wrote with a
 * different note).
 *
 * Returns whether this call is what created the row. The caller (lib/auth.ts)
 * uses that to fire an admin notification on the FIRST admission only —
 * admission by Invite is otherwise silent, and the operator has accepted
 * that it's transitive (anyone admitted can create a Trip and invite others)
 * on condition that growth stays visible. Checking existence before the
 * upsert (rather than trying to read create-vs-update off Prisma's result,
 * which doesn't expose that) is a separate query, not atomic with the
 * upsert — the only consequence of losing that race is a duplicate
 * notification, which notifyAdmins already tolerates.
 */
export async function admitByTripInvite(
  email: string,
): Promise<{ created: boolean }> {
  const needle = email.trim().toLowerCase();
  if (!needle) return { created: false };
  const existing = await db.allowedEmail.findUnique({
    where: { email: needle },
    select: { id: true },
  });
  await db.allowedEmail.upsert({
    where: { email: needle },
    update: {},
    create: { email: needle, note: "admitted by Trip Invite" },
  });
  return { created: existing === null };
}
