import { db } from "@/lib/db";

/**
 * Sign-in allowlist (ADR 0057). ONE predicate, TWO sources:
 *
 *   - ALLOWED_EMAILS env var — bootstrap and break-glass. This is how the
 *     operator gets in on a fresh or restored deployment before any row
 *     exists. NEVER written by code.
 *   - AllowedEmail table — everyone admitted through the product, written by
 *     approving an Access request. Revocable by deleting a row, which is
 *     instant; an env-var change needs a redeploy.
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
