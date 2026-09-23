"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { requireGlobeAccess } from "@/lib/globe";
import { getStorage, generateKey, validateUpload } from "@/lib/storage";
import { scheduleBlobDeletion } from "@/lib/blob-retention";
import { targetTypeSchema } from "@/lib/enums";
import { recordActivity } from "@/server/actions/activity";
import { reportError } from "@/lib/error-sink";

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
    try {
      await getStorage().save(storageKey, bytes, file.type);
    } catch (err) {
      // Blob write failed: remove the placeholder row so no orphan Attachment
      // (empty url, no storageKey) is left behind, and schedule the partially-
      // written blob for retention/sweep (ARCH-DAT-3) — in the SAME
      // transaction (I3, fix round 1). The DeletedBlob record is the only
      // pointer to that partial blob: if the row-delete and the schedule ran
      // as two separate statements, a process crash between them would leave
      // the row gone and no record of the blob anywhere — a leak invisible
      // even to the sweep. If the retention insert itself fails, the whole
      // cleanup transaction rolls back (C2, final fix wave) — the placeholder
      // row survives rather than vanishing with no record of its blob — and
      // the `.catch` below logs it. Either way the failure reported to the
      // Traveller is the original blob write, not this cleanup.
      await db
        .$transaction(async (tx) => {
          await tx.attachment.delete({ where: { id: attachment.id } });
          await scheduleBlobDeletion([storageKey], tx);
        })
        .catch((cleanupErr) =>
          console.error("uploadAttachment: orphan-row cleanup failed", cleanupErr),
        );
      // I2 (fix round 1): reported AFTER cleanup, not before. reportError
      // can run a full notifyAdmins round-trip (2.5s per admin device, two
      // DB queries) — putting it ahead of the cleanup meant a function that
      // hit its time limit in that window left the orphan Attachment row
      // (the cleanup's entire purpose) behind permanently.
      await reportError(err, {
        route: "server/actions/attachments.ts#uploadAttachment",
        source: "server",
      });
      return { success: false, error: "Upload failed — nothing was saved. Please try again." };
    }

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
  try {
    await getStorage().save(storageKey, bytes, file.type);
  } catch (err) {
    // Blob write failed: remove the placeholder row so no orphan Attachment
    // (empty url, no storageKey) is left behind, and schedule the partially-
    // written blob for retention/sweep (ARCH-DAT-3) — in the SAME transaction
    // (I3, fix round 1). See the globe-scoped path above for why this must be
    // atomic: the DeletedBlob record is the only pointer to that partial
    // blob, and running the row-delete and the schedule as two separate
    // statements leaves a crash window where the row is gone and nothing
    // records the blob at all.
    await db
      .$transaction(async (tx) => {
        await tx.attachment.delete({ where: { id: attachment.id } });
        await scheduleBlobDeletion([storageKey], tx);
      })
      .catch((cleanupErr) =>
        console.error("uploadAttachment: orphan-row cleanup failed", cleanupErr),
      );
    // I2 (fix round 1): reported AFTER cleanup, not before — see the
    // globe-scoped path above for the reasoning.
    await reportError(err, {
      route: "server/actions/attachments.ts#uploadAttachment",
      source: "server",
    });
    return { success: false, error: "Upload failed — nothing was saved. Please try again." };
  }

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
 * Delete an attachment (schedules the blob for retention + database row).
 *
 * Access-checked: requireAttachmentAccess branches on globe vs trip scope.
 * The blob is not destroyed here — ARCH-DAT-3: a nightly pg_dump can outlive
 * it, so deletion is deferred via scheduleBlobDeletion (lib/blob-retention.ts)
 * and applied later by `npm run sweep:blobs`. scheduleBlobDeletion never
 * throws, so it never blocks row cleanup.
 */
export async function deleteAttachment(
  id: string,
): Promise<AttachmentActionResult> {
  const attachment = await requireAttachmentAccess(id);

  await scheduleBlobDeletion([attachment.storageKey]).catch(() => {});

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
