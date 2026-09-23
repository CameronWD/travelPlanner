/**
 * Globe invite acceptance — mirrors lib/invites.ts, but for the account-level
 * Globe aggregate. A user joins at most one Globe (ADR 0023), so acceptance
 * resolves to a single invite. If the user already has a Globe we defer (the
 * two-populated-globes merge is out of scope for v1).
 */

import { db } from "@/lib/db";
import { getUserGlobe } from "@/lib/globe";

/**
 * True if a `User` account already exists for this email and that user
 * already belongs to a Globe (ADR 0023 — a Traveller belongs to at most
 * one). Used at Globe-invite *creation* time (`inviteToGlobe`) so the
 * inviter is told the real outcome instead of "Invited" for something that
 * can never be accepted — `decideGlobeMembership` below makes the analogous
 * refusal at *acceptance* time; this is a separate, earlier check and does
 * not change that one. An email with no matching `User` yet cannot be
 * checked, and that stays a legitimate, unchanged path: the Invite is still
 * created pending.
 */
export async function inviteeAlreadyHasGlobe(email: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return false;
  const globe = await getUserGlobe(user.id);
  return globe !== null;
}

export interface PendingGlobeInviteLike {
  id: string;
  globeId: string;
  email: string;
}

/**
 * Pure decision: which pending Globe invite (if any) to accept for this user.
 * Returns null if the user already belongs to a Globe or no invite matches.
 */
export function decideGlobeMembership(
  pending: readonly PendingGlobeInviteLike[],
  userAlreadyHasGlobe: boolean,
  userEmail: string,
): PendingGlobeInviteLike | null {
  if (userAlreadyHasGlobe) return null;
  const normal = userEmail.toLowerCase();
  return pending.find((i) => i.email.toLowerCase() === normal) ?? null;
}

/**
 * Find un-accepted Globe invites for this email and, if the user has no Globe
 * yet, add them to the invited Globe and mark the invite accepted. Best-effort
 * and idempotent — never throws (never blocks app load).
 */
export async function acceptPendingGlobeInvitesForUser(
  userId: string,
  email: string,
): Promise<void> {
  try {
    const normalEmail = email.toLowerCase();
    const pending = await db.globeInvite.findMany({
      where: {
        email: normalEmail,
        acceptedAt: null,
        // Expiry kills acceptance, not just sign-in admission: a stale Invite
        // must not silently grant Globe membership months later (ADR 0017,
        // amended 2026-09-22). `expiresAt: null` is a pre-migration row and
        // stays valid.
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true, globeId: true, email: true },
    });
    if (pending.length === 0) return;

    const existing = await getUserGlobe(userId);
    const chosen = decideGlobeMembership(pending, existing !== null, normalEmail);
    if (!chosen) return;

    const now = new Date();
    try {
      await db.globeMember.create({
        data: { globeId: chosen.globeId, userId, role: "member" },
      });
    } catch (err) {
      // P2002 = the membership already exists (a race, or the unique userId
      // guard) — that's the end-state we want, so fall through to mark accepted.
      if (!isUniqueConstraintError(err)) {
        console.error(
          `acceptPendingGlobeInvitesForUser: failed to add member to globe ${chosen.globeId}`,
          err,
        );
        return;
      }
    }

    await db.globeInvite.update({ where: { id: chosen.id }, data: { acceptedAt: now } });
  } catch (err) {
    console.error("acceptPendingGlobeInvitesForUser failed", err);
  }
}

/**
 * True for a Prisma unique-constraint violation (P2002). Checked structurally
 * (by `code`) rather than via `instanceof` so it stays driver-adapter-agnostic
 * and trivially mockable in tests.
 *
 * NOTE: this helper is intentionally inlined here (and in lib/invites.ts) —
 * consolidation into a shared util is tracked separately.
 */
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
