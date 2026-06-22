"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InviteResult =
  | { success: true; inviteId: string }
  | { success: false; error: string };

export type CancelInviteResult =
  | { success: true }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// inviteToTrip
// ---------------------------------------------------------------------------

const emailSchema = z.string().email("Please enter a valid email address");

/**
 * Invite someone to a trip by email.
 *
 * - Access-checked: caller must be a member of the trip.
 * - Email is normalised to lowercase.
 * - If that email already belongs to a member, returns a friendly error.
 * - Creates (or preserves an existing un-accepted) Invite record.
 *   No email is actually sent — the partner just signs in with that Google
 *   email and is auto-accepted on first sign-in (see lib/invites.ts).
 */
export async function inviteToTrip(
  tripId: string,
  email: string,
): Promise<InviteResult> {
  await requireTripAccess(tripId);

  const parsed = emailSchema.safeParse(email.trim());
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid email" };
  }

  const normalised = parsed.data.toLowerCase();

  // Check if this email is already a trip member.
  // We look up members for this trip and compare email in application code
  // to keep the case-insensitive match portable across database providers.
  const tripMembers = await db.tripMember.findMany({
    where: { tripId },
    select: { user: { select: { email: true } } },
  });
  const alreadyMember = tripMembers.some(
    (m) => m.user.email.toLowerCase() === normalised,
  );
  if (alreadyMember) {
    return { success: false, error: "That person is already a member of this trip." };
  }

  // Idempotent + race-safe: the (tripId, email) unique constraint guarantees
  // at most one invite row per email per trip. An existing row (pending OR
  // accepted) is left untouched; acceptance de-dupes membership anyway.
  const invite = await db.invite.upsert({
    where: { tripId_email: { tripId, email: normalised } },
    update: {},
    create: {
      tripId,
      email: normalised,
      token: crypto.randomUUID(),
      role: "member",
    },
    select: { id: true },
  });

  revalidatePath(`/trips/${tripId}/settings`);
  return { success: true, inviteId: invite.id };
}

// ---------------------------------------------------------------------------
// cancelInvite
// ---------------------------------------------------------------------------

/**
 * Cancel (delete) a pending invite.
 *
 * Access-checked via the invite's trip — the caller must be a member of the
 * trip the invite belongs to.
 */
export async function cancelInvite(
  inviteId: string,
): Promise<CancelInviteResult> {
  // Fetch the invite to find its tripId for access-checking.
  const invite = await db.invite.findUnique({
    where: { id: inviteId },
    select: { tripId: true, acceptedAt: true },
  });

  if (!invite) {
    return { success: false, error: "Invite not found." };
  }

  // Access-check: caller must be a member of the invite's trip.
  await requireTripAccess(invite.tripId);

  // Don't delete an invite that's already been accepted — it records that the
  // partner joined. Cancelling only applies to still-pending invites.
  if (invite.acceptedAt) {
    return { success: false, error: "This invite has already been accepted." };
  }

  await db.invite.delete({ where: { id: inviteId } });

  revalidatePath(`/trips/${invite.tripId}/settings`);
  return { success: true };
}
