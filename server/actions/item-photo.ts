"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { getStorage, generateKey, validateUpload } from "@/lib/storage";
import { scheduleBlobDeletion } from "@/lib/blob-retention";
import { reportError } from "@/lib/error-sink";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { createAttachmentFromFile } from "@/server/actions/attachments";

// ---------------------------------------------------------------------------
// CONTEXT.md "Item photo" (spec §I): the one image an Item may carry as its
// visual reference — an Attachment (targetType ITEM) singled out via
// `Item.photoAttachmentId`. Never on a Share link (floor enforced at the
// share-page query, app/share/[token]/page.tsx, not here).
// ---------------------------------------------------------------------------

/**
 * Look up an Item and verify the current user has access to its trip.
 * Returns the item (id, tripId, current photoAttachmentId) and the actor.
 */
async function requireItemPhotoAccess(itemId: string) {
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { id: true, tripId: true, photoAttachmentId: true },
  });
  if (!item) {
    notFound();
  }
  const { user } = await requireTripAccess(item.tripId);
  return { item, user };
}

/** Best-effort: schedule the old photo's blob for retention and drop its row. */
async function discardOldPhoto(oldAttachmentId: string): Promise<void> {
  const old = await db.attachment.findUnique({
    where: { id: oldAttachmentId },
    select: { storageKey: true },
  });
  if (old) {
    await scheduleBlobDeletion([old.storageKey]).catch(() => {});
  }
  await db.attachment.delete({ where: { id: oldAttachmentId } }).catch(() => {});
}

export type ItemPhotoResult = ActionResult<{ attachmentId: string }>;

/**
 * Set (or replace) an Item's photo. Image only — the client compresses
 * before this ever runs, but the server never trusts that and rejects a
 * non-image mime itself.
 *
 * FormData fields: `itemId`, `file`.
 *
 * Uploads through the same path as `uploadAttachment`
 * (`createAttachmentFromFile`, server/actions/attachments.ts), then points
 * `Item.photoAttachmentId` at the new Attachment. An existing photo is only
 * removed once the new one has fully landed (blob written, row updated,
 * column set) — the same ordering `uploadAttachment` uses for a replaced
 * Journal photo, so a failed upload never destroys the photo it was meant
 * to replace.
 */
export async function setItemPhoto(formData: FormData): Promise<ItemPhotoResult> {
  const itemId = formData.get("itemId");
  const file = formData.get("file");

  if (typeof itemId !== "string" || !itemId) {
    return fail({ itemId: ["Missing itemId."] });
  }
  if (!(file instanceof File)) {
    return fail({ file: ["No file provided."] });
  }
  if (!file.type.startsWith("image/")) {
    return fail({ file: ["Item photos must be an image."] });
  }
  const validation = validateUpload({ mime: file.type, size: file.size });
  if (!validation.ok) {
    return fail({ file: [validation.error] });
  }

  const { item, user } = await requireItemPhotoAccess(itemId);

  const created = await createAttachmentFromFile({
    tripId: item.tripId,
    targetType: "ITEM",
    targetId: item.id,
    file,
    userId: user.id,
    route: "server/actions/item-photo.ts#setItemPhoto",
  });
  if (!created.success) {
    return fail({ file: [created.error] });
  }

  await db.item.update({ where: { id: itemId }, data: { photoAttachmentId: created.id } });

  // The replacement has fully landed — only now is it safe to remove the
  // photo it's replacing.
  if (item.photoAttachmentId) {
    await discardOldPhoto(item.photoAttachmentId);
  }

  revalidatePath(`/trips/${item.tripId}`, "layout");
  return ok({ attachmentId: created.id });
}

/**
 * Remove an Item's photo: deletes its Attachment (schedules the blob for
 * retention, ARCH-DAT-3) and nulls the column. No-op-safe when the Item has
 * no photo set.
 */
export async function removeItemPhoto(itemId: string): Promise<ActionResult> {
  const { item } = await requireItemPhotoAccess(itemId);

  if (item.photoAttachmentId) {
    await discardOldPhoto(item.photoAttachmentId);
    await db.item.update({ where: { id: itemId }, data: { photoAttachmentId: null } });
  }

  revalidatePath(`/trips/${item.tripId}`, "layout");
  return ok();
}

/**
 * Copy an Item's photo onto a NEW Item — used by `scheduleItem`'s copy-in
 * placement (ADR 0019) and `createFork`'s item copy (spec §I: "Scheduling a
 * Wishlist idea copies the storage object so the placed Item has its own
 * photo. Fork copy likewise."). The new Item gets its OWN Attachment row and
 * its OWN copy of the storage object — never the source's attachment id.
 *
 * Best-effort: any failure (missing source row, `storage.copy` throwing on a
 * missing/unreadable source object, a subsequent db error) is caught here
 * and reported via `reportError`; the caller gets `null` back and must
 * proceed with no photo rather than fail the whole schedule/fork.
 *
 * Never leaves a dangling `photoAttachmentId`: the Attachment row is only
 * ever created AFTER `storage.copy` has actually succeeded, so a failed copy
 * never creates a row at all, and the caller only sets the new Item's column
 * from this function's non-null return.
 */
export async function copyItemPhoto(opts: {
  tripId: string;
  sourcePhotoAttachmentId: string;
  targetItemId: string;
}): Promise<string | null> {
  try {
    const source = await db.attachment.findUnique({
      where: { id: opts.sourcePhotoAttachmentId },
      select: { storageKey: true, filename: true, mime: true, size: true, uploadedById: true },
    });
    if (!source || !source.storageKey) return null;

    const destKey = generateKey({ trip: opts.tripId }, crypto.randomUUID(), source.filename);
    await getStorage().copy(source.storageKey, destKey);

    const created = await db.attachment.create({
      data: {
        tripId: opts.tripId,
        targetType: "ITEM",
        targetId: opts.targetItemId,
        filename: source.filename,
        mime: source.mime,
        size: source.size,
        url: "", // placeholder — updated below
        storageKey: destKey,
        uploadedById: source.uploadedById,
      },
    });

    await db.attachment.update({
      where: { id: created.id },
      data: { url: `/api/attachments/${created.id}` },
    });

    return created.id;
  } catch (err) {
    await reportError(err, {
      route: "server/actions/item-photo.ts#copyItemPhoto",
      source: "server",
    });
    return null;
  }
}
