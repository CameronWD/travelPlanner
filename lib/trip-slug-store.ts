import type { Prisma } from "@prisma/client";
import { slugCandidates, slugifyTripName } from "@/lib/trip-slug";

/** The two delegates the store touches — a transaction client, or `db` itself. */
export type SlugTx = Pick<Prisma.TransactionClient, "trip" | "tripSlug">;

const BATCH = 20;

/**
 * Give a Trip the slug its name derives to, or the first free "-n" (ADR 0064).
 * A candidate is free when nobody has ever held it, or this Trip has (renaming
 * back reuses an own old slug). A slug another Trip holds — or once held, even
 * if that Trip was since renamed or deleted — is never taken. The slug is
 * recorded in TripSlug and set on the Trip. Returns it.
 *
 * Concurrency: two Trips racing for one candidate both see it free; the insert
 * is ON CONFLICT DO NOTHING (skipDuplicates), so the loser inserts nothing,
 * re-reads the owner, and moves on to the next candidate — no error aborts
 * the surrounding transaction.
 */
export async function assignTripSlug(tx: SlugTx, tripId: string, name: string): Promise<string> {
  const base = slugifyTripName(name);
  for (let from = 1; ; from += BATCH) {
    const candidates = slugCandidates(base, from, BATCH);
    const rows = await tx.tripSlug.findMany({ where: { slug: { in: candidates } }, select: { slug: true, tripId: true } });
    const owner = new Map(rows.map((r) => [r.slug, r.tripId]));
    for (const slug of candidates) {
      if (owner.has(slug) && owner.get(slug) !== tripId) continue;
      if (!owner.has(slug)) {
        const { count } = await tx.tripSlug.createMany({ data: [{ slug, tripId }], skipDuplicates: true });
        if (count === 0) {
          const now = await tx.tripSlug.findUnique({ where: { slug }, select: { tripId: true } });
          if (now?.tripId !== tripId) continue;
        }
      }
      await tx.trip.update({ where: { id: tripId }, data: { slug } });
      return slug;
    }
  }
}
