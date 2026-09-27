/**
 * `copyItemPhoto` — server-only, deliberately NOT in a "use server" module.
 *
 * Fix round 1 (Important — security): this lived in
 * server/actions/item-photo.ts, which has a top-level "use server" directive,
 * so Next.js exposed every export from that file — including this one — as a
 * callable Server Action with its own action id, regardless of whether any
 * client code actually imported it. `copyItemPhoto` does no auth and no
 * ownership check (it exists to be called from already-access-checked
 * server code, `scheduleItem` / `createFork`, with ids those callers already
 * derived themselves) — so a client that obtained the action id could pass
 * ANY `sourcePhotoAttachmentId` (another Trip's passport scan, say) and any
 * `tripId`/`targetItemId` of its choosing, and the object would be copied
 * into the caller-chosen Trip and become readable via `/api/attachments`.
 *
 * Moving this into a plain `lib/` module (no "use server") makes it
 * un-callable from the client at all — it can only be reached by other
 * server-side code that imports it directly, the same way
 * `lib/journal-loader.ts` and other server-only `lib/` modules already work
 * in this codebase. `server-only` isn't a dependency here, so this relies on
 * the same convention those modules already use rather than adding one.
 *
 * Defence in depth (belt-and-braces, since the module boundary above is the
 * real fix): even called correctly, this refuses to copy a source Attachment
 * that isn't actually an ITEM photo (`targetType !== "ITEM"`) or that belongs
 * to a DIFFERENT trip than the one being written into
 * (`source.tripId !== opts.tripId`) — a caller passing a source id, tripId
 * pair that don't belong together gets `null`, not a cross-trip copy.
 */

import { db } from "@/lib/db";
import { getStorage, generateKey } from "@/lib/storage";
import { reportError } from "@/lib/error-sink";

/**
 * Copy an Item's photo onto a NEW Item — used by `scheduleItem`'s copy-in
 * placement (ADR 0019) and `createFork`'s item copy (spec §I: "Scheduling a
 * Wishlist idea copies the storage object so the placed Item has its own
 * photo. Fork copy likewise."). The new Item gets its OWN Attachment row and
 * its OWN copy of the storage object — never the source's attachment id.
 *
 * Callers MUST have already access-checked `opts.tripId` themselves — this
 * function trusts its caller, not its arguments; the targetType/tripId check
 * below is defence in depth, not the access boundary (that boundary is
 * "only server code can import this module at all", see file docblock).
 *
 * Best-effort: any failure (missing source row, wrong targetType/tripId,
 * `storage.copy` throwing on a missing/unreadable source object, a
 * subsequent db error) is caught here and reported via `reportError`; the
 * caller gets `null` back and must proceed with no photo rather than fail
 * the whole schedule/fork.
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
      select: {
        tripId: true,
        targetType: true,
        storageKey: true,
        filename: true,
        mime: true,
        size: true,
        uploadedById: true,
      },
    });
    if (!source || !source.storageKey) return null;

    // Defence in depth: the source must actually be an ITEM photo, and must
    // belong to the SAME trip we're about to write the copy into — never a
    // different Traveller's Attachment from another Trip.
    if (source.targetType !== "ITEM" || source.tripId !== opts.tripId) {
      return null;
    }

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
      route: "lib/item-photo-copy.ts#copyItemPhoto",
      source: "server",
    });
    return null;
  }
}
