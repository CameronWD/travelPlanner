import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canWriteJournal } from "@/lib/journal-window";
import { loadJournalWindow } from "@/lib/journal-window-loader";
import { serveAttachment } from "@/lib/attachment-serve";

/**
 * GET /share/:token/journal-photo/:attachmentId
 *
 * Share-link-scoped serve route for a Journal photo (spec L / ADR 0051
 * amendment). Deliberately NO auth — Share links are public bearer URLs, the
 * same trust model as the rest of `app/share/[token]`. Never imports a
 * server action (every export of a "use server" module is a publicly
 * callable endpoint on its own, with no path-derived scoping) — only plain
 * lib modules, so this route does its own scoping start to finish.
 *
 * 404 unless ALL of:
 *   1. the token resolves to a link that exists (not revoked/rotated — a
 *      rotated link's old token simply matches no row) with its
 *      `includeJournal` dial on
 *   2. the attachment is a JOURNAL photo of THAT link's trip (never another
 *      trip's, and never a ticket/passport-scan/other Attachment)
 *   3. its date (`targetId`) is an arrived Trip day — `canWriteJournal` with
 *      the Trip's own reference-timezone "today" (the controller ruling:
 *      this check IS the "day has arrived" check here, not just for writes)
 *   4. the author's JournalEntry for that date is not `hiddenFromShares`
 *      (no entry row at all is NOT hidden — a photo with no note still
 *      shows, same as Today's Journal on Home)
 *
 * Every 404 is `Cache-Control: no-store` so a browser never heuristically
 * caches "not found" for a token that later gets a fresh photo, or a link
 * whose dial gets turned on.
 */
function notFoundResponse() {
  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; attachmentId: string }> },
) {
  const { token, attachmentId } = await params;

  // 1. Token → link, dial on.
  const shareLink = await db.shareLink.findUnique({
    where: { token },
    select: { tripId: true, includeJournal: true },
  });
  if (!shareLink || !shareLink.includeJournal) return notFoundResponse();

  // 2. Attachment is a JOURNAL photo of this link's trip.
  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      tripId: true,
      targetType: true,
      targetId: true,
      uploadedById: true,
      filename: true,
      mime: true,
      storageKey: true,
    },
  });
  if (
    !attachment ||
    attachment.targetType !== "JOURNAL" ||
    attachment.tripId !== shareLink.tripId ||
    !attachment.targetId
  ) {
    return notFoundResponse();
  }

  // 3. The day has arrived (canWriteJournal IS the "day has arrived" check).
  const window = await loadJournalWindow(shareLink.tripId);
  if (!canWriteJournal({ ...window, date: attachment.targetId })) {
    return notFoundResponse();
  }

  // 4. The author's entry for that date isn't marked "Keep off Share links".
  // No entry row at all (a photo-only day) is NOT hidden.
  const entry = await db.journalEntry.findUnique({
    where: {
      tripId_date_authorId: {
        tripId: shareLink.tripId,
        date: attachment.targetId,
        authorId: attachment.uploadedById,
      },
    },
    select: { hiddenFromShares: true },
  });
  if (entry?.hiddenFromShares) return notFoundResponse();

  return serveAttachment(attachment);
}
