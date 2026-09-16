import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripAccess, requireUser } from "@/lib/guards";
import { requireGlobeAccess } from "@/lib/globe";
import { getStorage } from "@/lib/storage";

/**
 * GET /api/attachments/:id
 *
 * Securely serve an attachment's bytes.
 *
 * Security model:
 *   1. requireUser() ensures a valid session before any db access.
 *   2a. Trip-owned: requireTripAccess(attachment.tripId) — user must be a trip member.
 *   2b. Globe-owned: requireGlobeAccess() — user must own the globe, and the
 *       returned globe.id must match the attachment's globeId.
 *   3. The storage key is never exposed; the route looks it up from the db row.
 *
 * Returns:
 *   - 302 → presigned URL when the storage driver can presign (S3/R2): bytes
 *     then flow storage → browser directly, so a slow download can't hold
 *     this function open past Vercel Hobby's 10s wall-time cap
 *   - 200 + binary body  when the driver can't presign (local disk)
 *   - 404                if the attachment doesn't exist in the db or storage
 *   - 401/redirect       if unauthenticated (from requireUser inside requireTripAccess)
 *   - 403/404            if the user is not a trip member (from requireTripAccess)
 */

/**
 * Presigned URL lifetime (seconds). The 302 is followed immediately and
 * S3/R2 check expiry at request start (an in-flight download is never cut
 * off), so this only needs to cover clock skew, quick retries, and viewers
 * re-requesting ranges shortly after — while keeping a leaked URL
 * short-lived. The 302 response itself is no-store.
 */
const PRESIGN_EXPIRY_SECONDS = 300;
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 0. Require a valid session BEFORE touching the db, so an unauthenticated
  // caller can't distinguish "id exists" (redirect) from "id missing" (404).
  await requireUser();

  // 1. Look up the attachment row.
  const attachment = await db.attachment.findUnique({
    where: { id },
    select: {
      id: true,
      tripId: true,
      globeId: true,
      filename: true,
      mime: true,
      storageKey: true,
    },
  });

  if (!attachment) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  // 2. Access check — branches on globe-scoped vs trip-scoped attachment.
  if (attachment.globeId) {
    // Globe-owned: verify the current user owns this globe.
    const { globe } = await requireGlobeAccess();
    if (globe.id !== attachment.globeId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    // Trip-owned: verify the current user is a trip member.
    // requireTripAccess redirects/throws notFound if the check fails; those
    // propagate naturally through the Next.js route handler.
    await requireTripAccess(attachment.tripId!);
  }

  // 3. Validate we have a storage key.
  if (!attachment.storageKey) {
    return NextResponse.json(
      { error: "Attachment not fully uploaded" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  // 4. Response headers (used by both the presigned and the streamed path).
  const isInline =
    attachment.mime.startsWith("image/") || attachment.mime === "application/pdf";

  // Strip CR/LF/quotes so a crafted filename can't inject headers (response
  // splitting) or break the Content-Disposition value.
  const safeName = attachment.filename.replace(/[\r\n"]/g, "_");
  const disposition = isInline
    ? `inline; filename="${safeName}"`
    : `attachment; filename="${safeName}"`;

  // 5. Preferred path: 302 to a presigned URL so the bytes never pass through
  // this function. The header values are baked into the signature.
  const storage = getStorage();
  const presignedUrl = await storage.presignDownload(attachment.storageKey, {
    expiresIn: PRESIGN_EXPIRY_SECONDS,
    contentType: attachment.mime,
    contentDisposition: disposition,
    cacheControl: "private, max-age=3600",
  });
  if (presignedUrl) {
    return NextResponse.redirect(presignedUrl, {
      status: 302,
      // Never cache the redirect: it points at a URL that expires.
      headers: { "Cache-Control": "no-store" },
    });
  }

  // 6. Fallback (local disk): read the bytes and stream them ourselves.
  const buf = await storage.read(attachment.storageKey);
  if (!buf) {
    return NextResponse.json(
      { error: "File not found in storage" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", attachment.mime);
  headers.set("Content-Disposition", disposition);
  headers.set("Content-Length", String(buf.length));
  // Prevent the browser from sniffing the MIME type.
  headers.set("X-Content-Type-Options", "nosniff");
  // Files are user-private: never cache publicly.
  headers.set("Cache-Control", "private, max-age=3600");

  return new Response(buf.buffer as ArrayBuffer, { status: 200, headers });
}
