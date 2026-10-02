import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serveProfilePhoto } from "@/lib/avatar-serve";

/**
 * GET /share/:token/traveller-photo/:userId
 *
 * Share-link-scoped serve route for a Traveller's uploaded Profile photo
 * (ADR 0051 amendment 2026-09-30, the *Show who's going* dial). Deliberately
 * NO auth — Share links are public bearer URLs, the same trust model as the
 * rest of `app/share/[token]`. Never imports a server action (every export
 * of a "use server" module is a publicly callable endpoint on its own) —
 * only plain lib modules, so this route does its own scoping start to finish.
 *
 * 404 unless ALL of:
 *   1. the token resolves to a link that exists (not revoked/rotated — a
 *      rotated link's old token simply matches no row) with its
 *      `showTravellers` dial on
 *   2. `userId` is a member of THAT link's trip — so a token can never be
 *      used to probe for, or fetch photos of, anyone outside its own trip
 *   3. the Traveller has an uploaded photo
 *
 * Every refusal is the same `{ error: "Not found" }` 404 with
 * `Cache-Control: no-store`, so the response never reveals which check
 * failed (whether the user exists, or is on some other trip), and a browser
 * never caches "not found" for a link whose dial later gets turned on.
 */
function notFoundResponse() {
  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; userId: string }> },
) {
  const { token, userId } = await params;

  // 1. Token → link, dial on. ADR 0067 (Recently deleted): `findUnique`
  // can't filter on a relation, so this is a `findFirst` scoped by the
  // token's own unique column — a Trip in Recently deleted must 404 the
  // same as an unknown token.
  const shareLink = await db.shareLink.findFirst({
    where: { token, trip: { deletedAt: null } },
    select: { tripId: true, showTravellers: true },
  });
  if (!shareLink || !shareLink.showTravellers) return notFoundResponse();

  // 2. The user is a member of this link's trip.
  const member = await db.tripMember.findFirst({
    where: { tripId: shareLink.tripId, userId },
    select: { id: true },
  });
  if (!member) return notFoundResponse();

  // 3. They have an uploaded photo. The storage key never leaves the server.
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { photoKey: true },
  });
  if (!user?.photoKey) return notFoundResponse();

  // Same short lifetime as the link-scoped Journal photo route: a revoked or
  // rotated link (or a dial turned off) should stop working in a viewer's
  // browser soon, not linger behind the private route's hour-long cache.
  return serveProfilePhoto(user.photoKey, { cacheControl: "private, max-age=300" });
}
