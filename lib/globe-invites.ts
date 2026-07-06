/**
 * Globe invite acceptance — mirrors lib/invites.ts, but for the account-level
 * Globe aggregate. A user joins at most one Globe (ADR 0023), so acceptance
 * resolves to a single invite. If the user already has a Globe we defer (the
 * two-populated-globes merge is out of scope for v1).
 */

import { db } from "@/lib/db";
import { getUserGlobe } from "@/lib/globe";

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
      where: { email: normalEmail, acceptedAt: null },
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
