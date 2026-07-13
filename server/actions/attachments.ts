"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { requireGlobeAccess } from "@/lib/globe";
import { getStorage, generateKey, validateUpload } from "@/lib/storage";
import { targetTypeSchema } from "@/lib/enums";
import { recordActivity } from "@/server/actions/activity";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type AttachmentActionResult =
  | { success: true; id?: string }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Locate an attachment and verify the current user has access to it.
 * Branches on globe-scoped (globeId set) vs trip-scoped (tripId set).
 * Returns the attachment or throws notFound().
 */
async function requireAttachmentAccess(id: string) {
  const attachment = await db.attachment.findUnique({
    where: { id },
    select: {
      id: true,
      tripId: true,
      globeId: true,
      storageKey: true,
      filename: true,
      mime: true,
      size: true,
      url: true,
      targetType: true,
      targetId: true,
      uploadedById: true,
      createdAt: true,
    },
  });
  if (!attachment) {
    notFound();
  }
  if (attachment.globeId) {
    const { globe } = await requireGlobeAccess();
    if (globe.id !== attachment.globeId) {
      notFound();
    }
  } else {
    await requireTripAccess(attachment.tripId!);
  }
  return attachment;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Upload a file and attach it to a trip or globe entity.
 *
 * FormData fields:
 *   - file        File   (required)
 *   - tripId      string (required for trip-scoped uploads)
 *   - globeId     string (required for globe-scoped uploads; mutually exclusive with tripId)
 *   - targetType  TargetType (required)
 *   - targetId    string (optional)
 *
 * Access-checked: the current user must be a member of the trip (trip path) or
 * own the globe (globe path).
 * Validates: MIME type + file size before writing to storage.
 */
export async function uploadAttachment(
  formData: FormData,
): Promise<AttachmentActionResult> {
  const tripId = formData.get("tripId");
  const globeId = formData.get("globeId");
  const targetTypeRaw = formData.get("targetType");
  const targetId = formData.get("targetId");
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return { success: false, error: "No file provided." };
  }

  // Parse targetType
  const parsedTargetType = targetTypeSchema.safeParse(targetTypeRaw);
  if (!parsedTargetType.success) {
    return { success: false, error: "Invalid targetType." };
  }
  const targetType = parsedTargetType.data;

  // Validate the upload (mime + size)
  const validation = validateUpload({ mime: file.type, size: file.size });
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  // Read file bytes from the FormData File object.
  const arrayBuffer = await file.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  // ---------------------------------------------------------------------------
  // Globe-scoped path
  // ---------------------------------------------------------------------------
  if (typeof globeId === "string" && globeId) {
    const { user, globe } = await requireGlobeAccess();
    if (globe.id !== globeId) {
      return { success: false, error: "Globe access denied." };
    }

    const attachment = await db.attachment.create({
      data: {
        globeId,
        targetType,
        targetId: typeof targetId === "string" && targetId ? targetId : null,
        filename: file.name,
        mime: file.type,
        size: file.size,
        url: "",
        uploadedById: user.id,
      },
    });

    const storageKey = generateKey({ globe: globeId }, attachment.id, file.name);
    await getStorage().save(storageKey, bytes, file.type);

    const publicUrl = `/api/attachments/${attachment.id}`;
    await db.attachment.update({
      where: { id: attachment.id },
      data: { url: publicUrl, storageKey },
    });

    revalidatePath("/globe");
    return { success: true, id: attachment.id };
  }

  // ---------------------------------------------------------------------------
  // Trip-scoped path
  // ---------------------------------------------------------------------------
  if (typeof tripId !== "string" || !tripId) {
    return { success: false, error: "Missing tripId." };
  }

  // Access check — must be a trip member.
  const { user } = await requireTripAccess(tripId);

  // Create the Attachment row first (we need the id for the storage key).
  const attachment = await db.attachment.create({
    data: {
      tripId,
      targetType,
      targetId: typeof targetId === "string" && targetId ? targetId : null,
      filename: file.name,
      mime: file.type,
      size: file.size,
      url: "", // placeholder — updated below
      uploadedById: user.id,
    },
  });

  // Compute a deterministic, collision-resistant storage key.
  const storageKey = generateKey({ trip: tripId }, attachment.id, file.name);

  // Persist the file bytes.
  await getStorage().save(storageKey, bytes, file.type);

  // Update the row with the final url + storage key.
  const publicUrl = `/api/attachments/${attachment.id}`;
  await db.attachment.update({
    where: { id: attachment.id },
    data: { url: publicUrl, storageKey },
  });

  await recordActivity({
    tripId,
    verb: "CREATED",
    entityType: "ATTACHMENT",
    entityId: attachment.id,
    entityLabel: file.name,
    changes: { excerpt: file.name },
  });

  revalidatePath(`/trips/${tripId}/files`);
  return { success: true, id: attachment.id };
}

/**
 * Delete an attachment (blob + database row).
 *
 * Access-checked: requireAttachmentAccess branches on globe vs trip scope.
 * Storage errors are swallowed so a missing blob never blocks row cleanup.
 */
export async function deleteAttachment(
  id: string,
): Promise<AttachmentActionResult> {
  const attachment = await requireAttachmentAccess(id);

  // Remove the blob — swallow storage errors so the row is always cleaned up.
  if (attachment.storageKey) {
    try {
      await getStorage().delete(attachment.storageKey);
    } catch {
      // Swallow: blob may already be gone; row deletion must still succeed.
    }
  }

  await db.attachment.delete({ where: { id } });

  if (attachment.globeId) {
    // Globe-scoped: no trip activity log; revalidate the globe page.
    revalidatePath("/globe");
  } else {
    const tripId = attachment.tripId!;
    await recordActivity({
      tripId,
      verb: "DELETED",
      entityType: "ATTACHMENT",
      entityId: id,
      entityLabel: attachment.filename,
      changes: { excerpt: attachment.filename },
    });
    revalidatePath(`/trips/${tripId}/files`);
  }

  return { success: true };
}
