/**
 * Invite acceptance helpers.
 *
 * The pure core (decideMembershipsToCreate) is framework-free and trivially
 * unit-testable. The side-effectful acceptPendingInvitesForUser function calls
 * it and then applies the changes to the database.
 */

import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Pure core — acceptance decision
// ---------------------------------------------------------------------------

/** Minimal shape of a pending invite needed to decide acceptance. */
export interface PendingInviteLike {
  id: string;
  tripId: string;
  email: string;
}

/** Minimal shape of an existing membership needed to detect duplicates. */
export interface ExistingMembershipLike {
  tripId: string;
  userId: string;
}

/**
 * Given a set of pending invites and a user's existing memberships, return
 * only the invites for which a new TripMember should be created.
 *
 * Rules:
 *   - Skips any invite whose tripId already has a membership for userId.
 *   - Deduplicates by tripId (no double-create for the same trip).
 *   - Case-insensitive email comparison against invitedEmail.
 *
 * This function is pure and has no side-effects.
 */
export function decideMembershipsToCreate(
  pendingInvites: readonly PendingInviteLike[],
  existingMemberships: readonly ExistingMembershipLike[],
  userId: string,
  userEmail: string,
): PendingInviteLike[] {
  const memberTripIds = new Set(existingMemberships.map((m) => m.tripId));
  const seen = new Set<string>();
  const toCreate: PendingInviteLike[] = [];

  const normalEmail = userEmail.toLowerCase();

  for (const invite of pendingInvites) {
    if (invite.email.toLowerCase() !== normalEmail) continue;
    if (memberTripIds.has(invite.tripId)) continue;
    if (seen.has(invite.tripId)) continue;
    seen.add(invite.tripId);
    toCreate.push(invite);
  }

  return toCreate;
}

// ---------------------------------------------------------------------------
// Side-effectful acceptance — called from Auth.js events.signIn
// ---------------------------------------------------------------------------

/**
 * Find all un-accepted invites for the given email and, for each, create a
 * TripMember (if not already a member) and mark the invite as accepted.
 *
 * Safe to call repeatedly (idempotent) and wrapped in try/catch so a failure
 * never blocks sign-in.
 */
export async function acceptPendingInvitesForUser(
  userId: string,
  email: string,
): Promise<void> {
  try {
    const normalEmail = email.toLowerCase();

    // Find all un-accepted invites for this email.
    const pendingInvites = await db.invite.findMany({
      where: {
        email: normalEmail,
        acceptedAt: null,
      },
      select: { id: true, tripId: true, email: true },
    });

    if (pendingInvites.length === 0) return;

    // Find the user's existing memberships for the relevant trips.
    const tripIds = [...new Set(pendingInvites.map((i) => i.tripId))];
    const existingMemberships = await db.tripMember.findMany({
      where: { userId, tripId: { in: tripIds } },
      select: { tripId: true, userId: true },
    });

    const toCreate = decideMembershipsToCreate(
      pendingInvites,
      existingMemberships,
      userId,
      normalEmail,
    );

    const now = new Date();

    for (const invite of toCreate) {
      // Create member — skip silently if already exists (race condition).
      await db.tripMember
        .create({
          data: { tripId: invite.tripId, userId, role: "member" },
        })
        .catch(() => {
          // Already a member — safe to ignore.
        });

      // Mark invite accepted.
      await db.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: now },
      });
    }

    // Also mark any remaining pending invites for trips already joined as accepted.
    const toAcceptOnly = pendingInvites.filter(
      (inv) => !toCreate.some((c) => c.id === inv.id),
    );
    for (const invite of toAcceptOnly) {
      await db.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: now },
      }).catch(() => {
        // Ignore — don't fail sign-in.
      });
    }
  } catch {
    // Never block sign-in on invite-acceptance errors.
  }
}
