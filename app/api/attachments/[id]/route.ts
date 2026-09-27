import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripAccess, requireUser } from "@/lib/guards";
import { requireGlobeAccess } from "@/lib/globe";
import { serveAttachment } from "@/lib/attachment-serve";

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
 *
 * The actual byte-serving (presigned 302 vs streamed 200, headers, caching)
 * lives in `lib/attachment-serve.ts`'s `serveAttachment` — shared with the
 * Share-link-scoped Journal photo route
 * (`app/share/[token]/journal-photo/[attachmentId]/route.ts`) so the two
 * routes' serving behaviour can never drift apart. This route's own job is
 * just the access check above; it never imports a server action (every
 * export of a "use server" module is a publicly callable endpoint).
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

  // 3. Access is checked — hand off to the shared byte-serving helper.
  return serveAttachment(attachment);
}
