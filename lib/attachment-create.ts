/**
 * `createAttachmentFromFile` — server-only, deliberately NOT in a "use
 * server" module.
 *
 * Fix round 2 (Important — security, introduced by Task 8's f1e7cfd): this
 * lived in server/actions/attachments.ts, which has a top-level "use server"
 * directive, so Next.js exposed it (like every export of that file) as a
 * callable Server Action with its own action id, whether or not any client
 * code imported it. It takes a caller-chosen `tripId`, `targetType`,
 * `targetId` and `userId` with NO access check and NO check that `userId`
 * is actually the caller — it exists to be called by already-access-checked
 * server code (`uploadAttachment`, `setItemPhoto`) that has already derived
 * those values itself. Calling it directly as a Server Action would have
 * let a client upload an arbitrary file into ANY trip, filed under ANY
 * targetType/targetId, attributed to ANY uploadedById (impersonating any
 * Traveller).
 *
 * Moving this into a plain `lib/` module (no "use server") makes it
 * un-callable from the client at all — only server-side code that imports
 * it directly can reach it — the same pattern used for `copyItemPhoto`
 * (lib/item-photo-copy.ts) and `loadJournalWindow`
 * (lib/journal-window-loader.ts), both fixed the same way.
 */

import { db } from "@/lib/db";
import { getStorage, generateKey } from "@/lib/storage";
import { scheduleBlobDeletion } from "@/lib/blob-retention";
import { reportError } from "@/lib/error-sink";
import type { TargetType } from "@/lib/enum-values";

export type CreateAttachmentFromFileResult =
  | { success: true; id: string; storageKey: string; url: string }
  | { success: false; error: string };

/**
 * Trip-scoped attachment upload, factored out of `uploadAttachment`'s
 * (server/actions/attachments.ts) trip-scoped path so other actions (e.g.
 * `server/actions/item-photo.ts` `setItemPhoto`) can create-and-persist a
 * file the same way without going through `uploadAttachment`'s FormData
 * parsing / Journal window checks.
 *
 * Callers MUST have already access-checked `opts.tripId` (and derived
 * `opts.userId` from the actual signed-in actor, never from client input)
 * themselves — this function trusts its caller, not its arguments (see file
 * docblock).
 *
 * Does NOT validate mime/size — callers with their own rules (e.g. an
 * image-only Item photo) call `validateUpload` (or a stricter check of
 * their own) before this. Never throws: a storage-write failure cleans up
 * the placeholder row (same atomic tx + reportError pattern as
 * `uploadAttachment`) and returns a failure result instead.
 */
export async function createAttachmentFromFile(opts: {
  tripId: string;
  targetType: TargetType;
  targetId?: string | null;
  file: File;
  userId: string;
  /** reportError's `route` tag — defaults to this file, callers may name their own action. */
  route?: string;
}): Promise<CreateAttachmentFromFileResult> {
  const route = opts.route ?? "lib/attachment-create.ts#createAttachmentFromFile";
  const arrayBuffer = await opts.file.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  // Create the Attachment row first (we need the id for the storage key).
  const attachment = await db.attachment.create({
    data: {
      tripId: opts.tripId,
      targetType: opts.targetType,
      targetId: opts.targetId ?? null,
      filename: opts.file.name,
      mime: opts.file.type,
      size: opts.file.size,
      url: "", // placeholder — updated below
      uploadedById: opts.userId,
    },
  });

  const storageKey = generateKey({ trip: opts.tripId }, attachment.id, opts.file.name);

  try {
    await getStorage().save(storageKey, bytes, opts.file.type);
  } catch (err) {
    // Blob write failed: remove the placeholder row so no orphan Attachment
    // (empty url, no storageKey) is left behind, and schedule the partially-
    // written blob for retention/sweep (ARCH-DAT-3) — in the SAME transaction
    // (I3, fix round 1). See uploadAttachment's globe-scoped path for why
    // this must be atomic.
    await db
      .$transaction(async (tx) => {
        await tx.attachment.delete({ where: { id: attachment.id } });
        await scheduleBlobDeletion([storageKey], tx);
      })
      .catch((cleanupErr) =>
        console.error("createAttachmentFromFile: orphan-row cleanup failed", cleanupErr),
      );
    await reportError(err, { route, source: "server" });
    return { success: false, error: "Upload failed — nothing was saved. Please try again." };
  }

  const publicUrl = `/api/attachments/${attachment.id}`;
  await db.attachment.update({
    where: { id: attachment.id },
    data: { url: publicUrl, storageKey },
  });

  return { success: true, id: attachment.id, storageKey, url: publicUrl };
}
