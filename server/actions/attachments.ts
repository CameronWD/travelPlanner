"use server";

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess, requireRowAccess, type RowKind } from "@/lib/guards";
import { requireGlobeAccess } from "@/lib/globe";
import { getStorage, generateKey, validateUpload } from "@/lib/storage";
import { scheduleBlobDeletion } from "@/lib/blob-retention";
import { targetTypeSchema } from "@/lib/enums";
import { recordActivity } from "@/lib/activity-record";
import { requireOutsideSurprise, type SurpriseRoot } from "@/lib/surprise-guard";
import { reportError } from "@/lib/error-sink";
import { canWriteJournal } from "@/lib/journal-window";
import { loadJournalWindow } from "@/lib/journal-window-loader";
import { createAttachmentFromFile } from "@/lib/attachment-create";
import { checkQuota } from "@/lib/storage-quota";
import { type ActionResult, formFail } from "@/lib/action-result";
import { revalidateTrip, revalidateGlobe } from "@/lib/revalidate";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type AttachmentActionResult = ActionResult<{ id?: string }>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Locate an attachment and verify the current user has access to it.
 * Branches on globe-scoped (globeId set) vs trip-scoped (tripId set); a
 * trip-scoped file also refuses a viewer surprised by what it is on
 * (CONTEXT.md Surprise). Returns the attachment (with the live Surprise it is
 * inside) or throws notFound().
 */
async function requireAttachmentAccess(id: string): Promise<{
  attachment: NonNullable<Awaited<ReturnType<typeof findAttachmentForAccess>>>;
  userId: string;
  surpriseOf: SurpriseRoot | null;
}> {
  const attachment = await findAttachmentForAccess(id);
  if (!attachment) {
    notFound();
  }
  if (attachment.globeId) {
    const { user, globe } = await requireGlobeAccess();
    if (globe.id !== attachment.globeId) {
      notFound();
    }
    return { attachment, userId: user.id, surpriseOf: null };
  }
  const { user } = await requireTripAccess(attachment.tripId!);
  const surpriseOf = await requireOutsideSurprise(user.id, { target: attachment });
  return { attachment, userId: user.id, surpriseOf };
}

/**
 * ARCH-TEN-9: targetType → RowKind for the four kinds requireRowAccess
 * covers. JOURNAL (a date) and other target types keep their existing
 * requireOutsideSurprise handling below — requireRowAccess has no row for
 * them.
 */
function kindFor(targetType: "STOP" | "ITEM" | "TRANSPORT" | "ACCOMMODATION"): RowKind {
  switch (targetType) {
    case "STOP":
      return "stop";
    case "ITEM":
      return "item";
    case "TRANSPORT":
      return "transport";
    case "ACCOMMODATION":
      return "accommodation";
  }
}

function findAttachmentForAccess(id: string) {
  return db.attachment.findUnique({
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
}

// `createAttachmentFromFile` deliberately does NOT live here (fix round 2,
// security): every export of a "use server" module like this one becomes a
// callable Server Action, and it does no access check of its own — it
// takes a caller-chosen tripId/targetType/targetId/userId and trusts
// already-access-checked callers (`uploadAttachment` below,
// `server/actions/item-photo.ts` `setItemPhoto`) to have derived those
// values legitimately. It now lives in lib/attachment-create.ts, a plain
// non-"use server" module, unreachable from the client.

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
    return formFail("No file provided.");
  }

  // Parse targetType
  const parsedTargetType = targetTypeSchema.safeParse(targetTypeRaw);
  if (!parsedTargetType.success) {
    return formFail("Invalid targetType.");
  }
  const targetType = parsedTargetType.data;

  // ---------------------------------------------------------------------------
  // Globe-scoped path
  // ---------------------------------------------------------------------------
  if (typeof globeId === "string" && globeId) {
    // Access check — must own the globe. Hoisted above validateUpload/
    // assertQuota/arrayBuffer() so an attacker who isn't even allowed to
    // touch this globe can't make us spend time validating or buffering
    // their file first (fix round, access-before-buffering).
    const { user, globe } = await requireGlobeAccess();
    if (globe.id !== globeId) {
      return formFail("Globe access denied.");
    }

    // Validate the upload (mime + size)
    const validation = validateUpload({ mime: file.type, size: file.size });
    if (!validation.ok) {
      return formFail(validation.error);
    }

    // Quota (spec 2026-10-02 §B): a globe-scoped upload counts only toward
    // the global cap — it has no tripId to charge against.
    const quota = await checkQuota({ tripId: null, size: file.size });
    if (!quota.ok) return formFail(quota.error);

    // Read file bytes from the FormData File object.
    const bytes = Buffer.from(await file.arrayBuffer());

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
      return formFail("Couldn't upload the file. Nothing was saved. Try again.");
    }

    const publicUrl = `/api/attachments/${attachment.id}`;
    await db.attachment.update({
      where: { id: attachment.id },
      data: { url: publicUrl, storageKey },
    });

    revalidateGlobe();
    return { success: true, id: attachment.id };
  }

  // ---------------------------------------------------------------------------
  // Trip-scoped path
  // ---------------------------------------------------------------------------
  if (typeof tripId !== "string" || !tripId) {
    return formFail("Missing tripId.");
  }

  // Access check — must be a trip member. Hoisted above validateUpload/
  // assertQuota/arrayBuffer() (fix round, access-before-buffering).
  const { user } = await requireTripAccess(tripId);
  const uploadTargetId = typeof targetId === "string" && targetId ? targetId : null;
  // ARCH-TEN-9: a STOP/ITEM/TRANSPORT/ACCOMMODATION target's own Trip must
  // match this upload's tripId — requireRowAccess also runs the same
  // Surprise check internally (surpriseRefFor), so this covers both.
  // JOURNAL (a date) and other target types keep the plain Surprise check.
  if (uploadTargetId && (targetType === "STOP" || targetType === "ITEM" || targetType === "TRANSPORT" || targetType === "ACCOMMODATION")) {
    const { row } = await requireRowAccess(kindFor(targetType), uploadTargetId);
    if (row.tripId !== tripId) notFound();
  } else {
    await requireOutsideSurprise(user.id, { target: { targetType, targetId: uploadTargetId } });
  }

  // Validate the upload (mime + size)
  const validation = validateUpload({ mime: file.type, size: file.size });
  if (!validation.ok) {
    return formFail(validation.error);
  }

  // Quota (spec 2026-10-02 §B): charged against this Trip, and the global cap.
  const quota = await checkQuota({ tripId, size: file.size });
  if (!quota.ok) return formFail(quota.error);

  // Journal photos (spec K / ADR 0058): window-checked like a Journal note,
  // and capped at one per author per date — a second upload replaces the
  // first, but only when the caller confirms via `replace=1`. The OLD
  // attachment is deleted only after the NEW one has fully landed (blob
  // written, row updated) — see `journalPhotoToReplace` below. Deleting it
  // up front, before the new blob write is even attempted, would mean a
  // failed `storage.save` destroys the Traveller's existing photo while the
  // replacement never persists — silent data loss underneath a message
  // that says "nothing was saved" (fix round 1, Important finding).
  let journalPhotoToReplace: { id: string; storageKey: string | null } | null = null;
  if (targetType === "JOURNAL") {
    // A Journal photo is a photo (final review #11): refuse any other
    // otherwise-allowed upload type (PDF etc.) here, server-side.
    if (!file.type.startsWith("image/")) {
      return formFail("A Journal photo must be an image.");
    }
    const date = typeof targetId === "string" ? targetId : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return formFail("Missing or invalid date for a Journal photo.");
    }

    const window = await loadJournalWindow(tripId);
    if (!canWriteJournal({ ...window, date })) {
      return formFail("The Journal isn't open for this day yet.");
    }

    const existingPhoto = await db.attachment.findFirst({
      where: { tripId, targetType: "JOURNAL", targetId: date, uploadedById: user.id },
      select: { id: true, storageKey: true },
    });

    if (existingPhoto) {
      const replace = formData.get("replace") === "1";
      if (!replace) {
        return formFail("You already have a photo for this day.", "JOURNAL_PHOTO_EXISTS");
      }
      journalPhotoToReplace = existingPhoto;
    }
  }

  // Create-and-persist the row + blob (factored out so setItemPhoto can
  // reuse it — see createAttachmentFromFile above).
  const created = await createAttachmentFromFile({
    tripId,
    targetType,
    targetId: typeof targetId === "string" && targetId ? targetId : null,
    file,
    userId: user.id,
    route: "server/actions/attachments.ts#uploadAttachment",
  });
  if (!created.success) {
    return formFail(created.error);
  }

  // The new photo is fully persisted (blob written, row updated) — only now
  // is it safe to remove the one it's replacing (fix round 1).
  if (journalPhotoToReplace) {
    await scheduleBlobDeletion([journalPhotoToReplace.storageKey]).catch(() => {});
    await db.attachment.delete({ where: { id: journalPhotoToReplace.id } });
  }

  await recordActivity({
    tripId,
    verb: "CREATED",
    entityType: "ATTACHMENT",
    entityId: created.id,
    entityLabel: file.name,
    changes: { excerpt: file.name },
  });

  revalidateTrip(tripId, "journal");
  return { success: true, id: created.id };
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
  const { attachment, userId, surpriseOf } = await requireAttachmentAccess(id);

  // A Journal photo belongs to its author (spec K: per-author, per-date) —
  // membership alone doesn't let a co-Traveller remove it (final review #7).
  if (attachment.targetType === "JOURNAL" && attachment.uploadedById !== userId) {
    return formFail("You can only remove your own Journal photo.");
  }

  await scheduleBlobDeletion([attachment.storageKey]).catch(() => {});

  await db.attachment.delete({ where: { id } });

  if (attachment.globeId) {
    // Globe-scoped: no trip activity log; revalidate the globe page.
    revalidateGlobe();
  } else {
    const tripId = attachment.tripId!;
    await recordActivity({
      tripId,
      verb: "DELETED",
      entityType: "ATTACHMENT",
      entityId: id,
      entityLabel: attachment.filename,
      changes: { excerpt: attachment.filename },
      surpriseOf,
    });
    revalidateTrip(tripId, "journal");
  }

  return { success: true };
}

const TITLE_MAX = 120;

/**
 * Give a file a title (CONTEXT.md "Attachment"; spec 2026-10-02 §C) — the
 * name it is shown by wherever it is listed. Empty clears it.
 */
export async function setAttachmentTitle(
  id: string,
  title: string,
): Promise<ActionResult> {
  const { attachment } = await requireAttachmentAccess(id);
  const trimmed = title.trim();
  if (trimmed.length > TITLE_MAX) {
    return formFail(`Title must be ${TITLE_MAX} characters or fewer.`);
  }
  await db.attachment.update({ where: { id }, data: { title: trimmed.length === 0 ? null : trimmed } });
  if (attachment.tripId) revalidateTrip(attachment.tripId, "journal");
  else revalidateGlobe();
  return { success: true };
}

/**
 * Link a Trip-level file to an Item on the same Trip, or (null) unlink it
 * back to Trip-level. Files uploaded on a Stop, Transport or Accommodation
 * stay where they were put — moving those is a different feature.
 */
export async function linkAttachmentToItem(
  id: string,
  itemId: string | null,
): Promise<ActionResult> {
  const { attachment, userId } = await requireAttachmentAccess(id);
  if (!attachment.tripId) {
    return formFail("Only a trip's files can be linked to an item.");
  }
  if (attachment.targetType !== "TRIP" && attachment.targetType !== "ITEM") {
    return formFail("Only trip-level files can be linked to an item.");
  }
  if (itemId) {
    const item = await db.item.findFirst({ where: { id: itemId, tripId: attachment.tripId }, select: { id: true } });
    if (!item) return formFail("That item isn't on this trip.");
    await requireOutsideSurprise(userId, { itemId });
    await db.attachment.update({ where: { id }, data: { targetType: "ITEM", targetId: itemId } });
  } else {
    await db.attachment.update({ where: { id }, data: { targetType: "TRIP", targetId: null } });
  }
  revalidateTrip(attachment.tripId, "journal");
  return { success: true };
}
