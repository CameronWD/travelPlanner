/**
 * Serve a Traveller's uploaded Profile photo bytes, given the caller has
 * already done its own access check.
 *
 * Factored out of `app/api/avatars/[userId]/route.ts` so the Share-link-scoped
 * Traveller photo route (`app/share/[token]/traveller-photo/[userId]/route.ts`)
 * reuses the exact same serving behaviour — presigned 302 vs streamed 200,
 * headers — without either route importing the other.
 *
 * This function does NOT check access. Every caller must have already
 * verified the request is allowed to see this photo before calling it.
 */

import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { PRESIGNED_REDIRECT_CACHE_CONTROL } from "@/lib/presign-redirect";

const PRESIGN_EXPIRY_SECONDS = 300;

/** Extension → response Content-Type, matched to server/actions/profile.ts's `extensionFor`. */
export function profilePhotoContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

/**
 * Returns:
 *   - 302 → presigned URL when the storage driver can presign (S3/R2)
 *   - 200 + binary body when it can't (local disk)
 *   - 404 (no-store) if the key is missing from storage
 */
export async function serveProfilePhoto(
  photoKey: string,
  opts: { cacheControl: string },
): Promise<Response> {
  const disposition = `inline; filename="avatar.${photoKey.split(".").pop()}"`;

  // Preferred path: 302 to a presigned URL so the bytes never pass
  // through this function.
  const storage = getStorage();
  const presignedUrl = await storage.presignDownload(photoKey, {
    expiresIn: PRESIGN_EXPIRY_SECONDS,
    contentType: profilePhotoContentType(photoKey),
    contentDisposition: disposition,
    cacheControl: opts.cacheControl,
  });
  if (presignedUrl) {
    return NextResponse.redirect(presignedUrl, {
      status: 302,
      // Reusable for 240s of the presign's 300s (lib/presign-redirect.ts).
      headers: { "Cache-Control": PRESIGNED_REDIRECT_CACHE_CONTROL },
    });
  }

  // Fallback (local disk): read the bytes and stream them ourselves.
  const buf = await storage.read(photoKey);
  if (!buf) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", profilePhotoContentType(photoKey));
  headers.set("Content-Disposition", disposition);
  headers.set("Content-Length", String(buf.length));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", opts.cacheControl);

  return new Response(buf.buffer as ArrayBuffer, { status: 200, headers });
}
