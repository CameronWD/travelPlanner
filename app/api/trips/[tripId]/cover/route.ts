import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripAccess, requireUser } from "@/lib/guards";
import { getStorage } from "@/lib/storage";

/**
 * GET /api/trips/:tripId/cover
 *
 * Stream a trip's cover photo. Member-gated (private trip data).
 *
 * Returns 404 when the trip has no uploaded cover — callers fall back to the
 * route-render/monogram. Returns 404 when bytes are missing from storage.
 *
 * Security model mirrors /api/attachments/[id]:
 *   1. requireUser() before any DB access — unauthenticated callers can't
 *      distinguish "no cover" from "not a member".
 *   2. requireTripAccess(tripId) — user must be a trip member.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;

  // 0. Require a valid session before touching the DB.
  await requireUser();

  // 1. Check membership — requireTripAccess redirects/throws if not a member.
  await requireTripAccess(tripId);

  // 2. Look up the cover key.
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { coverImageKey: true },
  });

  if (!trip?.coverImageKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 3. Read the bytes from storage.
  const buf = await getStorage().read(trip.coverImageKey);
  if (!buf) {
    return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
  }

  // 4. Derive content-type from the key's extension (cover is always an image).
  const ext = trip.coverImageKey.split(".").pop()?.toLowerCase();
  const mime =
    ext === "png" ? "image/png"
    : ext === "webp" ? "image/webp"
    : ext === "gif" ? "image/gif"
    : "image/jpeg";

  const headers = new Headers();
  headers.set("Content-Type", mime);
  headers.set("Content-Length", String(buf.length));
  headers.set("X-Content-Type-Options", "nosniff");
  // Private (per-user, member-gated) but cacheable briefly in the browser.
  headers.set("Cache-Control", "private, max-age=300");

  return new Response(buf.buffer as ArrayBuffer, { status: 200, headers });
}
