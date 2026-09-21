import { Prisma } from "@prisma/client";
import { type FlowConflict } from "@/lib/firm-up";
import { daysBetween } from "@/lib/dates";
import { shiftItemDates, shiftAccommodationDates, type PayloadShiftResult } from "@/lib/payload-shift";
import { planScope, type PlanId } from "@/lib/plan-scope";
import { spanReflow } from "@/lib/reorder";
import { compareScheduled } from "@/lib/plan-order";
import { chapterSpan } from "@/lib/chapter-span";
import { spanContributors } from "@/lib/chapters";

// ---------------------------------------------------------------------------
// lockPlanStopsTx / lockPlanTransportsTx — canonical lock acquisition (ADR 0007)
// ---------------------------------------------------------------------------

/**
 * Locks ALL of a plan's stops FOR UPDATE in canonical (id) order. ADR 0007:
 * every path that will write stop rows in a plan takes this same lock over
 * the same row set in the same order, so concurrent editors queue instead
 * of deadlocking. Returns rows sorted by sortOrder for caller convenience.
 */
export async function lockPlanStopsTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  forkId: PlanId,
): Promise<Array<{ id: string; sortOrder: number; chapterId: string | null; chapterSortOrder: number | null; arriveDate: string | null }>> {
  const rows = await tx.$queryRaw<
    Array<{ id: string; sortOrder: number; chapterId: string | null; chapterSortOrder: number | null; arriveDate: string | null }>
  >`
    SELECT "id", "sortOrder", "chapterId", "chapterSortOrder", "arriveDate"
    FROM "Stop"
    WHERE "tripId" = ${tripId}
      AND "forkId" ${forkId ? Prisma.sql`= ${forkId}` : Prisma.sql`IS NULL`}
    ORDER BY "id" ASC
    FOR UPDATE
  `;
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Same canonical lock for a plan's transports. */
export async function lockPlanTransportsTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  forkId: PlanId,
): Promise<Array<{ id: string; sortOrder: number }>> {
  return tx.$queryRaw<Array<{ id: string; sortOrder: number }>>`
    SELECT "id", "sortOrder"
    FROM "Transport"
    WHERE "tripId" = ${tripId}
      AND "forkId" ${forkId ? Prisma.sql`= ${forkId}` : Prisma.sql`IS NULL`}
    ORDER BY "id" ASC
    FOR UPDATE
  `;
}

// ---------------------------------------------------------------------------
// recomputeChapterSpans — self-healing chapter date-bands (ADR 0021)
// ---------------------------------------------------------------------------

/**
 * Recompute every chapter's startDate/endDate in the given plan so it spans
 * the stops that are rendered into it: dated stops explicitly linked by
 * `chapterId`, PLUS dated stops with no `chapterId` whose arrive date falls
 * inside the chapter's current band (union rule — mirrors ADR 0008 rendering).
 *
 * If a chapter has NO such dated members its dates are cleared to null,
 * reverting it to "rough" (fixes the "last stop made rough leaves chapter
 * stranded" case in #8).
 *
 * Called inside the SAME `$transaction` as the mutating stop action so the
 * stop mutation + chapter span update are atomic. Exported so Task 9 can
 * import it from the same module.
 */
export async function recomputeChapterSpans(
  tx: Prisma.TransactionClient,
  tripId: string,
  forkId: PlanId,
): Promise<void> {
  const [chapters, stops] = await Promise.all([
    tx.chapter.findMany({
      where: { tripId, ...planScope(forkId) },
      select: { id: true, startDate: true, endDate: true },
    }),
    tx.stop.findMany({
      where: { tripId, ...planScope(forkId) },
      select: { id: true, chapterId: true, arriveDate: true, departDate: true, sortOrder: true },
    }),
  ]);

  // Snapshot bands so date-band membership is evaluated against the pre-update
  // state, not chapters we've already rewritten in this loop.
  const snapshot = chapters.map((c) => ({
    id: c.id, name: "", colour: "", startDate: c.startDate, endDate: c.endDate,
  }));

  for (const chapter of snapshot) {
    const members = spanContributors(chapter, stops, snapshot);
    const { startDate, endDate } = chapterSpan(members);
    await tx.chapter.update({ where: { id: chapter.id }, data: { startDate, endDate } });
  }
}

// ---------------------------------------------------------------------------
// shiftStopPayloadTx — ADR 0038 payload shift on stop re-date
// ---------------------------------------------------------------------------

/**
 * ADR 0038: when a stop is re-dated, its slotted Items keep their offset from
 * the arrive date (un-slotting if the day no longer fits) and its
 * Accommodation shifts by the arrive delta. Runs inside the caller's
 * transaction; returns the shifts (with pre-images) for the Undo payload.
 *
 * ADR 0055: where the stop merely *shortened* — its arrive date unmoved — an
 * Item that would un-slot is instead handed to whichever Stop still covers its
 * (unchanged) day, so a changeover-day Item follows the card that still shows
 * it rather than vanishing into things-to-do.
 */
export async function shiftStopPayloadTx(
  tx: Prisma.TransactionClient,
  stop: { id: string; arriveDate: string },
  newArrive: string,
  newDepart: string,
): Promise<PayloadShiftResult> {
  const self = await tx.stop.findUnique({
    where: { id: stop.id },
    select: { tripId: true, forkId: true },
  });
  // Scheduled Stops of this Stop's own plan, with the re-dated Stop carrying
  // its NEW span — so it is never chosen as the new owner of a day it has
  // just stopped covering (ADR 0055).
  const coveringStops = self
    ? (
        await tx.stop.findMany({
          where: { tripId: self.tripId, ...planScope(self.forkId), arriveDate: { not: null } },
          select: { id: true, arriveDate: true, departDate: true },
        })
      )
        .filter((s): s is { id: string; arriveDate: string; departDate: string } =>
          s.arriveDate != null && s.departDate != null)
        .map((s) => (s.id === stop.id ? { ...s, arriveDate: newArrive, departDate: newDepart } : s))
    : [];

  const [items, accommodations] = await Promise.all([
    // `stopId` is selected so a re-file can report the owner it moved the Item
    // OFF (`prevStopId`), which is what makes the re-file Undo-reversible.
    tx.item.findMany({ where: { stopId: stop.id, date: { not: null } }, select: { id: true, date: true, stopId: true } }),
    tx.accommodation.findMany({ where: { stopId: stop.id }, select: { id: true, checkIn: true, checkOut: true } }),
  ]);
  const itemShifts = shiftItemDates(items, stop.arriveDate, newArrive, newDepart, coveringStops);
  const accShifts = shiftAccommodationDates(accommodations, daysBetween(stop.arriveDate, newArrive));
  for (const s of itemShifts) {
    await tx.item.update({
      where: { id: s.id },
      // `stopId` is written only on a re-file, so a plain date shift keeps the
      // Item on its current Stop's Budget line exactly as before.
      data: { date: s.date, ...(s.stopId ? { stopId: s.stopId } : {}) },
    });
  }
  for (const s of accShifts) {
    await tx.accommodation.update({ where: { id: s.id }, data: { checkIn: s.checkIn, checkOut: s.checkOut } });
  }
  return { items: itemShifts, accommodations: accShifts };
}

// ---------------------------------------------------------------------------
// reflowSpanTx — ADR 0038 drag reflow (shared by reorderStops / reorderChapters)
// ---------------------------------------------------------------------------

/**
 * ADR 0038 drag reflow. Reads the plan's stops in the NEW arrangement (the
 * caller has already written sortOrder), reflows only the span between the
 * first and last scheduled stop whose chronological position changed, shifts
 * each re-dated stop's payload, and self-heals chapter bands. Gap-preserving;
 * never changes the trip's overall length.
 */
export async function reflowSpanTx(
  tx: Prisma.TransactionClient,
  tripId: string,
  forkId: PlanId,
  movedIds: ReadonlySet<string>,
): Promise<{ changed: { id: string; arriveDate: string; departDate: string }[]; conflicts: FlowConflict[]; payload: PayloadShiftResult }> {
  const orderedStops = await tx.stop.findMany({
    where: { tripId, ...planScope(forkId) },
    orderBy: { sortOrder: "asc" },
    select: { id: true, arriveDate: true, departDate: true, pinned: true, sortOrder: true },
  });
  const newScheduled = orderedStops.filter(
    (s): s is (typeof orderedStops)[number] & { arriveDate: string; departDate: string } =>
      s.arriveDate != null && s.departDate != null,
  );
  const oldScheduled = [...newScheduled].sort(compareScheduled);

  const { results, conflicts } = spanReflow(oldScheduled, newScheduled, movedIds);
  const payload: PayloadShiftResult = { items: [], accommodations: [] };
  const preById = new Map(newScheduled.map((s) => [s.id, s]));
  const changedResults = results.filter((r) => r.changed);
  for (const r of changedResults) {
    const pre = preById.get(r.id)!;
    await tx.stop.update({ where: { id: r.id }, data: { arriveDate: r.arriveDate, departDate: r.departDate } });
    const shifted = await shiftStopPayloadTx(tx, { id: r.id, arriveDate: pre.arriveDate }, r.arriveDate, r.departDate);
    payload.items.push(...shifted.items);
    payload.accommodations.push(...shifted.accommodations);
  }
  await recomputeChapterSpans(tx, tripId, forkId);
  return {
    changed: changedResults.map((r) => ({ id: r.id, arriveDate: r.arriveDate, departDate: r.departDate })),
    conflicts,
    payload,
  };
}
