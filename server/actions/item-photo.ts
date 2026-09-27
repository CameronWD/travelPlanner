"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { validateUpload } from "@/lib/storage";
import { scheduleBlobDeletion } from "@/lib/blob-retention";
import { type ActionResult, ok, fail } from "@/lib/action-result";
import { createAttachmentFromFile } from "@/lib/attachment-create";

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
 * (`createAttachmentFromFile`, lib/attachment-create.ts), then points
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

// `copyItemPhoto` (scheduleItem's copy-in placement / createFork's item
// copy) deliberately does NOT live here — see lib/item-photo-copy.ts's
// docblock (fix round 1, security): every export of a "use server" module
// like this one becomes a callable Server Action, and copyItemPhoto does no
// auth/ownership check of its own (it trusts already-access-checked
// callers). Moving it to a plain, non-"use server" `lib/` module makes it
// unreachable from the client entirely.
