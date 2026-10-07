import { db } from "@/lib/db";
import { scheduleBlobDeletion } from "@/lib/blob-retention";

/**
 * How long a Trip waits in Recently deleted before it is purged for good
 * (ADR 0067). The Restore window and the purge cutoff are the same number on
 * purpose — a Trip reachable from Recently deleted is, by definition, not yet
 * eligible for the purge.
 */
const RECENTLY_DELETED_DAYS = 30;

/**
 * Hard-deletes Trips whose `deletedAt` is older than `days` (default
 * `RECENTLY_DELETED_DAYS`); schedules their cover and Attachment blobs for
 * the retention sweep first.
 *
 * Blobs are scheduled BEFORE the Trip delete on purpose: the delete cascades
 * away the Attachment rows that carry `storageKey`, and `Trip.coverImageKey`
 * goes with the row — once the Trip is gone, nothing on this path can name
 * those keys again. Losing the scheduling call after a successful delete
 * would leak the blobs forever, not just delay their cleanup.
 *
 * Both run in ONE `db.$transaction` per Trip (not two separate statements):
 * `scheduleBlobDeletion` is passed the transaction client, whose contract
 * (lib/blob-retention.ts) is to RETHROW on failure rather than swallow it —
 * so if recording the blobs for retention fails, the transaction aborts and
 * the Trip row survives instead of being deleted with its blobs now
 * unreachable by anything (a permanent leak, not just a delayed sweep).
 *
 * The delete's `where` repeats the `deletedAt: { lt: cutoff }` guard
 * alongside `id`: without it, a Restore (server/actions/trips.ts) landing
 * in the window between this function's `findMany` and its delete — which
 * clears `deletedAt` — would have its Trip purged anyway, racing the
 * Traveller who just asked to keep it. With the guard, that delete simply
 * matches zero rows.
 *
 * One Trip failing (either the delete, or scheduling the blobs) must not
 * cost every other expired Trip its purge — each is wrapped in its own
 * try/catch and logged with `console.error`, and the run keeps going.
 */
export async function purgeExpiredDeletedTrips(opts?: {
  now?: Date;
  days?: number;
}): Promise<{ purged: string[] }> {
  const now = opts?.now ?? new Date();
  const days = opts?.days ?? RECENTLY_DELETED_DAYS;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const trips = await db.trip.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: {
      id: true,
      coverImageKey: true,
      coverSmallKey: true,
      attachments: {
        where: { storageKey: { not: null } },
        select: { storageKey: true },
      },
    },
  });

  const purged: string[] = [];

  for (const trip of trips) {
    try {
      const keys = trip.attachments.map((a) => a.storageKey);
      await db.$transaction(async (tx) => {
        await scheduleBlobDeletion([trip.coverImageKey, trip.coverSmallKey, ...keys].filter(Boolean), tx);
        await tx.trip.delete({ where: { id: trip.id, deletedAt: { lt: cutoff } } });
      });
      purged.push(trip.id);
    } catch (err) {
      console.error(`[trip-purge] Failed to purge Trip ${trip.id}:`, err);
    }
  }

  return { purged };
}
