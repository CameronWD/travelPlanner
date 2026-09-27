/**
 * Pure helper for CONTEXT.md "Item photo": the one image an Item may carry
 * as its visual reference. `Item.photoAttachmentId` is deliberately not a
 * Prisma relation (schema.prisma) — it's resolved leniently here from a
 * caller-supplied lookup rather than a query join, so a stale id (its
 * Attachment row gone without going through removeItemPhoto/setItemPhoto)
 * just renders no photo instead of a hard error.
 *
 * No I/O: callers load the Item and the Attachments themselves (usually one
 * batched `db.attachment.findMany` for a whole page of Items) and pass the
 * result in as `attachmentsById`.
 */

export interface ItemPhotoLookupItem {
  photoAttachmentId: string | null;
}

export interface ItemPhotoAttachment {
  url: string;
}

/**
 * The Item's photo URL (`/api/attachments/<id>`, per Attachment.url), or
 * null when the Item has no photo set OR the id it points at isn't in
 * `attachmentsById` (deleted/missing — resolved leniently, never throws).
 */
export function itemPhotoUrl(
  item: ItemPhotoLookupItem,
  attachmentsById: Record<string, ItemPhotoAttachment> | Map<string, ItemPhotoAttachment>,
): string | null {
  if (!item.photoAttachmentId) return null;

  const attachment =
    attachmentsById instanceof Map
      ? attachmentsById.get(item.photoAttachmentId)
      : attachmentsById[item.photoAttachmentId];

  return attachment?.url ?? null;
}
