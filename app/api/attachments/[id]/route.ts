import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripAccess, requireUser } from "@/lib/guards";
import { getStorage } from "@/lib/storage";

/**
 * GET /api/attachments/:id
 *
 * Securely serve an attachment's bytes.
 *
 * Security model:
 *   1. requireUser() is called transitively through requireTripAccess() — the
 *      session must be valid.
 *   2. requireTripAccess(attachment.tripId) — the current user must be a
 *      member of the trip that owns the file. Guessing attachment ids alone is
 *      NOT sufficient to read a file.
 *   3. The storage key is never exposed; the route looks it up from the db row.
 *
 * Returns:
 *   - 200 + binary body  on success
 *   - 404                if the attachment doesn't exist in the db or storage
 *   - 401/redirect       if unauthenticated (from requireUser inside requireTripAccess)
 *   - 403/404            if the user is not a trip member (from requireTripAccess)
 */
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
      filename: true,
      mime: true,
      storageKey: true,
    },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 2. Access check — user must be a trip member.
  // requireTripAccess redirects/throws notFound if the check fails; those
  // propagate naturally through the Next.js route handler.
  await requireTripAccess(attachment.tripId);

  // 3. Validate we have a storage key.
  if (!attachment.storageKey) {
    return NextResponse.json(
      { error: "Attachment not fully uploaded" },
      { status: 404 },
    );
  }

  // 4. Read the bytes from storage.
  const buf = await getStorage().read(attachment.storageKey);
  if (!buf) {
    return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
  }

  // 5. Build the response with appropriate headers.
  const isInline =
    attachment.mime.startsWith("image/") || attachment.mime === "application/pdf";

  // Strip CR/LF/quotes so a crafted filename can't inject headers (response
  // splitting) or break the Content-Disposition value.
  const safeName = attachment.filename.replace(/[\r\n"]/g, "_");
  const disposition = isInline
    ? `inline; filename="${safeName}"`
    : `attachment; filename="${safeName}"`;

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
