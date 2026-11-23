/**
 * Server-only, deliberately NOT in a "use server" module: it trusts its caller
 * for tripId, target and userId (the same reason as lib/attachment-create.ts
 * and lib/item-photo-copy.ts). Only `fileAttachment` calls it, after its own
 * access checks.
 */

import { db } from "@/lib/db";
import { getStorage, generateKey } from "@/lib/storage";
import type { TargetType } from "@/lib/enum-values";

export async function copyAttachment(opts: {
  tripId: string;
  source: { storageKey: string | null; filename: string; mime: string; size: number };
  targetType: TargetType;
  targetId: string | null;
  title: string | null;
  userId: string;
}): Promise<string> {
  if (!opts.source.storageKey) throw new Error("copyAttachment: source has no stored object");
  const storageKey = generateKey({ trip: opts.tripId }, crypto.randomUUID(), opts.source.filename);
  // The row is created only after the object exists, so no Attachment ever points at nothing.
  await getStorage().copy(opts.source.storageKey, storageKey);
  const created = await db.attachment.create({
    data: {
      tripId: opts.tripId,
      targetType: opts.targetType,
      targetId: opts.targetId,
      filename: opts.source.filename,
      title: opts.title,
      mime: opts.source.mime,
      size: opts.source.size,
      url: "",
      storageKey,
      uploadedById: opts.userId,
    },
  });
  await db.attachment.update({ where: { id: created.id }, data: { url: `/api/attachments/${created.id}` } });
  return created.id;
}
