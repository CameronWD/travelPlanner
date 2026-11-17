/**
 * Serve an Attachment's bytes, given the caller has already done its own
 * access check.
 *
 * Factored out of `app/api/attachments/[id]/route.ts` (Task 20) so the
 * Share-link-scoped Journal photo route
 * (`app/share/[token]/journal-photo/[attachmentId]/route.ts`) can reuse the
 * exact same bytes-serving behaviour — presigned 302 vs streamed 200,
 * headers, caching — without either route importing the other, and without
 * either importing a server action (every export of a "use server" module
 * is a publicly callable endpoint; this is a plain lib module, so it isn't).
 *
 * This function does NOT check access. Every caller must have already
 * verified the request is allowed to see this attachment before calling it.
 */

import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { rendersInline } from "@/lib/attachment-display";
import { PRESIGNED_REDIRECT_CACHE_CONTROL } from "@/lib/presign-redirect";

/** See `app/api/attachments/[id]/route.ts` for why 300s. */
const PRESIGN_EXPIRY_SECONDS = 300;

export interface ServableAttachment {
  filename: string;
  mime: string;
  storageKey: string | null;
  size?: number;
}

export interface ServeAttachmentOptions {
  /**
   * Overrides the default `private, max-age=3600` Cache-Control on both the
   * presigned-redirect target and the streamed-bytes fallback. The
   * Share-link-scoped Journal photo route passes a much shorter one
   * (`private, max-age=300`) so a photo behind a revoked or rotated link
   * drops out of a viewer's cache soon after, without touching the private,
   * session-gated route's (longer, unaffected-by-revocation) default.
   */
  cacheControl?: string;
  /**
   * A save for offline (spec 2026-11-17 §A2): never presign, stream the bytes
   * same-origin, because the worker cannot keep a redirect to storage.
   */
  bytes?: boolean;
}

/**
 * Returns:
 *   - 200 + streamed body when `bytes` is set, whatever the driver
 *   - 302 → presigned URL when the storage driver can presign (S3/R2)
 *   - 200 + binary body when the driver can't presign (local disk)
 *   - 404 (no-store) if there is no storage key, or the key is missing from storage
 */
export async function serveAttachment(
  attachment: ServableAttachment,
  opts?: ServeAttachmentOptions,
): Promise<Response> {
  const cacheControl = opts?.cacheControl ?? "private, max-age=3600";
  if (!attachment.storageKey) {
    return NextResponse.json(
      { error: "Attachment not fully uploaded" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Shared with the attachment links (lib/attachment-display.ts) so a file
  // the browser downloads is never given a new tab it would leave empty.
  const isInline = rendersInline(attachment.mime);

  // Strip CR/LF/quotes so a crafted filename can't inject headers (response
  // splitting) or break the Content-Disposition value.
  const safeName = attachment.filename.replace(/[\r\n"]/g, "_");
  const disposition = isInline
    ? `inline; filename="${safeName}"`
    : `attachment; filename="${safeName}"`;

  const storage = getStorage();
  const headers = new Headers();
  headers.set("Content-Type", attachment.mime);
  headers.set("Content-Disposition", disposition);
  // Prevent the browser from sniffing the MIME type.
  headers.set("X-Content-Type-Options", "nosniff");
  // Files are user-private: never cache publicly.
  headers.set("Cache-Control", cacheControl);

  if (opts?.bytes) {
    const body = await storage.readStream(attachment.storageKey);
    if (!body) return notInStorage();
    if (attachment.size !== undefined) headers.set("Content-Length", String(attachment.size));
    return new Response(body, { status: 200, headers });
  }

  // Preferred path: 302 to a presigned URL so the bytes never pass through
  // this function.
  const presignedUrl = await storage.presignDownload(attachment.storageKey, {
    expiresIn: PRESIGN_EXPIRY_SECONDS,
    contentType: attachment.mime,
    contentDisposition: disposition,
    cacheControl,
  });
  if (presignedUrl) {
    return NextResponse.redirect(presignedUrl, {
      status: 302,
      // Reusable for 240s of the presign's 300s (lib/presign-redirect.ts).
      headers: { "Cache-Control": PRESIGNED_REDIRECT_CACHE_CONTROL },
    });
  }

  // Fallback (local disk): read the bytes and stream them ourselves.
  const buf = await storage.read(attachment.storageKey);
  if (!buf) return notInStorage();
  headers.set("Content-Length", String(buf.length));

  return new Response(buf.buffer as ArrayBuffer, { status: 200, headers });
}

function notInStorage(): Response {
  return NextResponse.json(
    { error: "File not found in storage" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}
