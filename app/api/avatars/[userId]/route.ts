import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { serveProfilePhoto } from "@/lib/avatar-serve";

/**
 * GET /api/avatars/:userId
 *
 * Securely serve a Traveller's uploaded Profile photo (CONTEXT.md "Profile
 * photo and display name": seen only by those who share a Trip or Globe with
 * them — never on a Share link, and never reachable without a session).
 *
 * Security model, mirroring app/api/attachments/[id]/route.ts:
 *   1. requireUser() before any db access.
 *   2. Access: the requester IS `userId`, or shares a TripMember trip or a
 *      GlobeMember globe with them. Anyone else gets 404 (never leaks
 *      whether the id or the photo exists).
 *   3. The storage key is never exposed to the client — looked up from the
 *      User row by `userId`.
 *
 * Returns:
 *   - 302 → presigned URL when the storage driver can presign (S3/R2)
 *   - 200 + binary body when it can't (local disk)
 *   - 404 (no-store) if unauthorized, the user doesn't exist, or has no photo
 */

function notFound() {
  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

/** True when `requesterId` shares a Trip or a Globe with `targetId`. */
async function sharesTripOrGlobe(
  requesterId: string,
  targetId: string,
): Promise<boolean> {
  const tripShare = await db.tripMember.findFirst({
    where: {
      userId: requesterId,
      // ADR 0067 (Recently deleted): sharing a deleted Trip must not keep a
      // Profile photo visible to someone who can no longer open that Trip.
      trip: { members: { some: { userId: targetId } }, deletedAt: null },
    },
    select: { id: true },
  });
  if (tripShare) return true;

  const requesterGlobe = await db.globeMember.findUnique({
    where: { userId: requesterId },
    select: { globeId: true },
  });
  if (!requesterGlobe) return false;

  const globeShare = await db.globeMember.findFirst({
    where: { userId: targetId, globeId: requesterGlobe.globeId },
    select: { id: true },
  });
  return Boolean(globeShare);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;

  // 0. Require a valid session BEFORE touching the db, so an unauthenticated
  // caller can't distinguish "id exists" from "id missing".
  const requester = await requireUser();

  // 1. Access — skip the share lookup entirely for one's own photo.
  if (requester.id !== userId) {
    const shares = await sharesTripOrGlobe(requester.id, userId);
    if (!shares) return notFound();
  }

  // 2. Look up the target's photo key.
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { photoKey: true },
  });
  if (!user?.photoKey) return notFound();

  return serveProfilePhoto(user.photoKey, { cacheControl: "private, max-age=3600" });
}
