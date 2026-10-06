import { NextRequest, NextResponse } from "next/server";
import { COVER_SMALL_MAX_WIDTH } from "@/lib/cover";
import { db } from "@/lib/db";
import { requireTripAccess, requireUser } from "@/lib/guards";
import { PRESIGNED_REDIRECT_CACHE_CONTROL } from "@/lib/presign-redirect";
import { getStorage } from "@/lib/storage";

/**
 * GET /api/trips/:tripId/cover
 *
 * Stream a trip's cover photo. Member-gated (private trip data).
 *
 * Returns 404 when the trip has no uploaded cover — callers fall back to the
 * route sketch/passport stamp. Returns 404 when bytes are missing from storage.
 *
 * Security model mirrors /api/attachments/[id]:
 *   1. requireUser() before any DB access — unauthenticated callers can't
 *      distinguish "no cover" from "not a member".
 *   2. requireTripAccess(tripId) — user must be a trip member.
 *
 * Serving mirrors /api/attachments/[id] too: 302 to a presigned URL when the
 * storage driver can presign (bytes go storage → browser directly, keeping
 * the function inside Vercel Hobby's 10s wall-time cap), streamed bytes as
 * the local-disk fallback.
 */

/** See PRESIGN_EXPIRY_SECONDS in app/api/attachments/[id]/route.ts. */
const PRESIGN_EXPIRY_SECONDS = 300;
export async function GET(
  req: NextRequest,
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
    select: { coverImageKey: true, coverSmallKey: true },
  });

  if (!trip?.coverImageKey) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  // 3. Spec 2026-10-06 §H: `?w=` (set by the cover image loader) up to
  // COVER_SMALL_MAX_WIDTH gets the ~480px copy when the Trip has one.
  const w = Number(req.nextUrl.searchParams.get("w"));
  const smallKey =
    Number.isFinite(w) && w > 0 && w <= COVER_SMALL_MAX_WIDTH ? (trip.coverSmallKey ?? null) : null;
  const key = smallKey ?? trip.coverImageKey;

  const ext = trip.coverImageKey.split(".").pop()?.toLowerCase();
  const mime = smallKey
    ? "image/webp"
    : ext === "png" ? "image/png"
    : ext === "webp" ? "image/webp"
    : ext === "gif" ? "image/gif"
    : "image/jpeg";

  // 4. Preferred path: 302 to a presigned URL (header values are signed).
  const storage = getStorage();
  const presignedUrl = await storage.presignDownload(key, {
    expiresIn: PRESIGN_EXPIRY_SECONDS,
    contentType: mime,
    cacheControl: "private, max-age=300",
  });
  if (presignedUrl) {
    return NextResponse.redirect(presignedUrl, {
      status: 302,
      // Reusable for 240s of the presign's 300s (lib/presign-redirect.ts).
      headers: { "Cache-Control": PRESIGNED_REDIRECT_CACHE_CONTROL },
    });
  }

  // 5. Fallback (local disk): read the bytes and stream them ourselves.
  const buf = await storage.read(key);
  if (!buf) {
    return NextResponse.json(
      { error: "File not found in storage" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", mime);
  headers.set("Content-Length", String(buf.length));
  headers.set("X-Content-Type-Options", "nosniff");
  // Private (per-user, member-gated) but cacheable briefly in the browser.
  headers.set("Cache-Control", "private, max-age=300");

  return new Response(buf.buffer as ArrayBuffer, { status: 200, headers });
}
