"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { getStorage, generateKey, validateUpload } from "@/lib/storage";
import { scheduleBlobDeletion } from "@/lib/blob-retention";
import { checkQuota } from "@/lib/storage-quota";

// ---------------------------------------------------------------------------
// Traveller profile actions (CONTEXT.md "Profile photo and display name")
//
// Both fields belong to the person, not any one Trip/Globe — set here on
// Account, read everywhere the Traveller is shown via lib/traveller.ts. Every
// mutation revalidates the whole layout ("/", "layout"), not a single route,
// because the avatar/name can appear in the nav, on any Trip, and on the
// Globe all at once.
//
// Uploads are not cropped: the original (compressed) picture is kept whole so
// it can be reframed later, and every avatar circle frames it on the
// Traveller's chosen focus point (User.photoFocalX/Y, NULL = centre).
// ---------------------------------------------------------------------------

const DISPLAY_NAME_MAX = 60;

/**
 * Set (or clear) the Traveller's display name. Trimmed; 1-60 characters.
 * An empty/whitespace-only string clears it back to null, which
 * lib/traveller.ts reads as "fall back to the sign-in provider's name".
 */
export async function setDisplayName(name: string): Promise<ActionResult> {
  const user = await requireUser();

  const trimmed = name.trim();
  if (trimmed.length > DISPLAY_NAME_MAX) {
    return fail({
      displayName: [`Display name must be ${DISPLAY_NAME_MAX} characters or fewer.`],
    });
  }

  await db.user.update({
    where: { id: user.id },
    data: { displayName: trimmed.length === 0 ? null : trimmed },
  });

  revalidatePath("/", "layout");
  return ok();
}

/** Extension to store the upload under, matched to the validated mime. */
function extensionFor(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

/**
 * Set (or replace) the Traveller's Profile photo. FormData field: `file`.
 * Image-only, one per Traveller — replacing schedules the previous blob for
 * retention/sweep (ARCH-DAT-3) rather than destroying it synchronously.
 */
export async function setProfilePhoto(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return fail({ file: ["No file provided."] });
  }

  const validation = validateUpload({ mime: file.type, size: file.size });
  if (!validation.ok) {
    return fail({ file: [validation.error] });
  }
  if (!file.type.startsWith("image/")) {
    return fail({ file: ["Profile photo must be an image (PNG, JPEG, WebP or GIF)."] });
  }

  // Quota (spec 2026-10-02 §B): a Profile photo creates no Attachment row,
  // so it counts only toward the global cap.
  const quota = await checkQuota({ tripId: null, size: file.size });
  if (!quota.ok) return fail({ file: [quota.error] });

  const existing = await db.user.findUnique({
    where: { id: user.id },
    select: { photoKey: true },
  });

  const bytes = Buffer.from(await file.arrayBuffer());
  const storage = getStorage();
  const key = generateKey({ user: user.id }, crypto.randomUUID(), `avatar.${extensionFor(file.type)}`);
  await storage.save(key, bytes, file.type);

  if (existing?.photoKey && existing.photoKey !== key) {
    await scheduleBlobDeletion([existing.photoKey]);
  }

  await db.user.update({
    where: { id: user.id },
    // A new picture starts centred until it is repositioned.
    data: { photoKey: key, photoUpdatedAt: new Date(), photoFocalX: null, photoFocalY: null },
  });

  revalidatePath("/", "layout");
  return ok();
}

function clampUnit(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Where the Profile photo's circle centres (CONTEXT.md "focus point"): x and
 * y are fractions 0–1 across and down the uploaded picture. The picture is
 * never altered — only framed. Mirrors setCoverFocal in cover.ts.
 */
export async function setProfilePhotoFocal(x: number, y: number): Promise<ActionResult> {
  const user = await requireUser();
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return fail({ _form: ["That point isn't on the photo."] });
  }
  await db.user.update({
    where: { id: user.id },
    data: { photoFocalX: clampUnit(x), photoFocalY: clampUnit(y) },
  });
  revalidatePath("/", "layout");
  return ok();
}

/** Remove the Traveller's Profile photo (reverts to sign-in picture / initials). */
export async function removeProfilePhoto(): Promise<ActionResult> {
  const user = await requireUser();

  const existing = await db.user.findUnique({
    where: { id: user.id },
    select: { photoKey: true },
  });

  if (existing?.photoKey) {
    await scheduleBlobDeletion([existing.photoKey]);
    await db.user.update({
      where: { id: user.id },
      data: { photoKey: null, photoUpdatedAt: null, photoFocalX: null, photoFocalY: null },
    });
  }

  revalidatePath("/", "layout");
  return ok();
}
