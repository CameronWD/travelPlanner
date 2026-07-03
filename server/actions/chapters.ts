"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { chapterSchema, type ChapterInput } from "@/lib/validations/chapter";
import { chaptersOverlap, suggestChapterRuns } from "@/lib/chapters";
import { nextChapterColour } from "@/lib/chapter-colours";
import { recordPlanActivity } from "@/lib/activity-guard";
import { entityLabel, describeChanges } from "@/lib/activity";
import { REAL_PLAN, planScope, type PlanId } from "@/lib/plan-scope";
import { reflowReorderedDates, type ReflowStop } from "@/lib/reorder";
import { recomputeChapterSpans, type ReorderResult } from "@/server/actions/stops";
import type { FlowConflict } from "@/lib/firm-up";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ChapterActionResult =
  | { success: true }
  | { success: false; errors: Record<string, string[]> };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function validationErrors(error: { flatten(): { fieldErrors: Record<string, string[] | undefined> } }): ChapterActionResult {
  const fieldErrors: Record<string, string[]> = {};
  for (const [k, msgs] of Object.entries(error.flatten().fieldErrors)) {
    fieldErrors[k] = msgs ?? [];
  }
  return { success: false, errors: fieldErrors };
}

function revalidateChapterPaths(tripId: string) {
  for (const p of ["", "/budget", "/summary", "/today", "/settings", "/calendar", "/plan"]) {
    revalidatePath(`/trips/${tripId}${p}`);
  }
}

async function requireChapterAccess(chapterId: string): Promise<{ id: string; tripId: string; forkId: string | null }> {
  const chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, tripId: true, forkId: true },
  });
  if (!chapter) notFound();
  await requireTripAccess(chapter.tripId);
  return chapter;
}

async function loadFullChapter(chapterId: string) {
  return db.chapter.findUnique({ where: { id: chapterId } });
}

// Check-then-write: a concurrent pair of overlapping chapters is a theoretical TOCTOU race,
// but chapters are created rarely enough that locking (cf. ADR 0007, reserved for reorder swaps)
// isn't warranted here.
async function firstOverlap(
  tripId: string,
  range: { startDate?: string; endDate?: string },
  excludeId?: string,
  forkId?: PlanId,
) {
  if (!range.startDate || !range.endDate) return null; // rough chapter never overlaps
  const siblings = await db.chapter.findMany({
    where: { tripId, ...planScope(forkId) },
    select: { id: true, startDate: true, endDate: true },
  });
  return siblings.find(
    (s) => s.id !== excludeId && s.startDate && s.endDate &&
      chaptersOverlap({ startDate: s.startDate, endDate: s.endDate }, { startDate: range.startDate!, endDate: range.endDate! }),
  ) ?? null;
}

async function nextSortOrder(tripId: string, forkId?: PlanId): Promise<number> {
  // sortOrder is only a stable creation-order tiebreak; chapters are ordered by startDate at read time.
  return db.chapter.count({ where: { tripId, ...planScope(forkId) } });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createChapter(
  tripId: string,
  input: ChapterInput,
  originStopId?: string,
  forkId?: PlanId,
): Promise<ChapterActionResult> {
  await requireTripAccess(tripId);

  const parsed = chapterSchema.safeParse(input);
  if (!parsed.success) return validationErrors(parsed.error);

  if (await firstOverlap(tripId, parsed.data, undefined, forkId)) {
    return { success: false, errors: { startDate: ["Chapters cannot overlap another chapter's dates"] } };
  }

  const created = await db.chapter.create({
    data: { tripId, forkId: forkId ?? null, ...parsed.data, sortOrder: await nextSortOrder(tripId, forkId) },
  });

  // When created from a stop ("Start a chapter here"), link a ROUGH origin
  // stop to the new chapter (explicit membership while sketching, ADR 0009).
  // A scheduled stop is already covered by the chapter's date band, so we
  // leave its chapterId alone. The new chapter has no stops yet → sortOrder 0.
  if (originStopId) {
    const origin = await db.stop.findUnique({
      where: { id: originStopId },
      select: { tripId: true, arriveDate: true, forkId: true },
    });
    if (origin && origin.tripId === tripId && origin.arriveDate === null && origin.forkId === (forkId ?? null)) {
      await db.stop.update({
        where: { id: originStopId },
        data: { chapterId: created.id, chapterSortOrder: 0 },
      });
    }
  }

  await recordPlanActivity(forkId, { tripId, verb: "CREATED", entityType: "CHAPTER", entityId: created.id, entityLabel: entityLabel("CHAPTER", created as unknown as Record<string, unknown>) });
  revalidateChapterPaths(tripId);
  return { success: true };
}

export async function updateChapter(
  chapterId: string,
  input: ChapterInput,
): Promise<ChapterActionResult> {
  const chapter = await requireChapterAccess(chapterId);

  const parsed = chapterSchema.safeParse(input);
  if (!parsed.success) return validationErrors(parsed.error);

  if (await firstOverlap(chapter.tripId, parsed.data, chapterId)) {
    return { success: false, errors: { startDate: ["Chapters cannot overlap another chapter's dates"] } };
  }

  const before = await loadFullChapter(chapterId);
  const updated = await db.chapter.update({ where: { id: chapterId }, data: parsed.data });
  await recordPlanActivity(chapter.forkId, {
    tripId: chapter.tripId,
    verb: "UPDATED",
    entityType: "CHAPTER",
    entityId: chapterId,
    entityLabel: entityLabel("CHAPTER", updated as unknown as Record<string, unknown>),
    changes: describeChanges("CHAPTER", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });
  revalidateChapterPaths(chapter.tripId);
  return { success: true };
}

export async function deleteChapter(chapterId: string): Promise<ChapterActionResult> {
  const chapter = await requireChapterAccess(chapterId);
  const doomed = await db.chapter.findUnique({ where: { id: chapterId }, select: { name: true } });
  await db.chapter.delete({ where: { id: chapterId } });
  await recordPlanActivity(chapter.forkId, { tripId: chapter.tripId, verb: "DELETED", entityType: "CHAPTER", entityId: chapterId, entityLabel: doomed?.name ?? "" });
  revalidateChapterPaths(chapter.tripId);
  return { success: true };
}

export async function reorderChapters(
  tripId: string,
  orderedChapterIds: string[],
  forkIdArg?: PlanId,
): Promise<ReorderResult> {
  await requireTripAccess(tripId);
  if (orderedChapterIds.length === 0) return { success: true, changed: [], conflicts: [] };

  const chapters = await db.chapter.findMany({
    where: { id: { in: orderedChapterIds }, tripId },
    select: { id: true, startDate: true, forkId: true },
  });
  if (chapters.length !== orderedChapterIds.length) {
    return { success: false, errors: { chapter: ["One or more chapters aren't part of this trip."] } };
  }

  // Prefer the caller-supplied plan (the editor threads the active forkId); fall
  // back to the plan derived from the chapters (all must belong to the same plan).
  const forkId: PlanId = forkIdArg ?? chapters[0]?.forkId ?? null;

  // Load all stops for the trip to compute the new order and reflow.
  const allStops = await db.stop.findMany({
    where: { tripId, ...planScope(forkId) },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true, sortOrder: true, chapterId: true,
      arriveDate: true, departDate: true, nights: true, pinned: true,
    },
  });

  // Resolve the reflow anchor.
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { startDate: true } });
  const anchor =
    trip?.startDate ??
    allStops.reduce<string | null>(
      (min, s) => (s.arriveDate && (min === null || s.arriveDate < min) ? s.arriveDate : min),
      null,
    );

  // Build the new stop order: emit each chapter's stops in the requested chapter order,
  // then any ungrouped stops (chapterId not in orderedChapterIds) at the end.
  const chapterIdSet = new Set(orderedChapterIds);
  const stopsByChapter = new Map<string, typeof allStops>();
  const ungroupedStops: typeof allStops = [];

  for (const stop of allStops) {
    if (stop.chapterId != null && chapterIdSet.has(stop.chapterId)) {
      if (!stopsByChapter.has(stop.chapterId)) stopsByChapter.set(stop.chapterId, []);
      stopsByChapter.get(stop.chapterId)!.push(stop);
    } else {
      ungroupedStops.push(stop);
    }
  }

  const orderedItems: { id: string; chapterId: string | null }[] = [];
  for (const chId of orderedChapterIds) {
    for (const stop of stopsByChapter.get(chId) ?? []) {
      orderedItems.push({ id: stop.id, chapterId: stop.chapterId });
    }
  }
  for (const stop of ungroupedStops) {
    orderedItems.push({ id: stop.id, chapterId: stop.chapterId });
  }

  let changed: { id: string; arriveDate: string; departDate: string }[] = [];
  let conflicts: FlowConflict[] = [];

  const stopIds = orderedItems.map((i) => i.id);

  await db.$transaction(async (tx) => {
    // Lock the trip's stops FOR UPDATE (ADR 0007).
    if (stopIds.length > 0) {
      await tx.$queryRaw`
        SELECT "id" FROM "Stop"
        WHERE "id" = ANY(${stopIds})
        FOR UPDATE
      `;
    }

    // Write sortOrder for all stops in the new chapter order.
    for (let idx = 0; idx < orderedItems.length; idx++) {
      const it = orderedItems[idx];
      await tx.stop.update({ where: { id: it.id }, data: { sortOrder: idx } });
    }

    // Write sortOrder for each chapter in the new requested order (ADR 0014:
    // reorderChapters persists the canonical rough-Chapter order for empty Chapters).
    for (let idx = 0; idx < orderedChapterIds.length; idx++) {
      await tx.chapter.update({ where: { id: orderedChapterIds[idx] }, data: { sortOrder: idx } });
    }

    // Re-fetch the trip's stops from the LOCKED rows so we build the reflow input
    // from post-lock data, not from the pre-tx allStops snapshot (closes a TOCTOU
    // race where a concurrent writer could change a stop's dates/nights/pinned
    // between the pre-tx read and the lock; mirrors the pattern in reorderStops).
    const lockedStops = await tx.stop.findMany({
      where: { tripId, ...planScope(forkId) },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, sortOrder: true, chapterId: true,
        arriveDate: true, departDate: true, nights: true, pinned: true,
      },
    });
    const lockedById = new Map(lockedStops.map((s) => [s.id, s]));

    // Reflow scheduled stop dates in the new order.
    const reflowInput: ReflowStop[] = orderedItems.map((it) => {
      const s = lockedById.get(it.id)!;
      return { id: s.id, arriveDate: s.arriveDate, departDate: s.departDate, nights: s.nights, pinned: s.pinned };
    });

    const { results, conflicts: flowConflicts } = reflowReorderedDates(reflowInput, anchor);
    conflicts = flowConflicts;

    const changedResults = results.filter((r) => r.changed);
    for (const r of changedResults) {
      await tx.stop.update({
        where: { id: r.id },
        data: { arriveDate: r.arriveDate, departDate: r.departDate },
      });
    }
    changed = changedResults.map((r) => ({ id: r.id, arriveDate: r.arriveDate, departDate: r.departDate }));

    // Recompute chapter date-bands.
    await recomputeChapterSpans(tx, tripId, forkId);
  });

  revalidateChapterPaths(tripId);
  return { success: true, changed, conflicts };
}

export async function suggestChaptersFromCountries(tripId: string): Promise<ChapterActionResult> {
  await requireTripAccess(tripId);

  const [stops, existing] = await Promise.all([
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN },
      select: { id: true, arriveDate: true, departDate: true, country: true, sortOrder: true },
    }),
    db.chapter.findMany({
      where: { tripId, ...REAL_PLAN },
      select: { id: true, colour: true, startDate: true, endDate: true },
    }),
  ]);

  const runs = suggestChapterRuns(stops);
  const usedColours = existing.map((c) => c.colour);
  const data: {
    tripId: string;
    name: string;
    colour: string;
    startDate: string;
    endDate: string;
    sortOrder: number;
  }[] = [];

  for (const run of runs) {
    const overlapsExisting =
      existing.some((c) => chaptersOverlap(c, run)) ||
      data.some((d) => chaptersOverlap(d, run));
    if (overlapsExisting) continue;
    const colour = nextChapterColour([...usedColours, ...data.map((d) => d.colour)]);
    data.push({
      tripId,
      name: run.name,
      colour,
      startDate: run.startDate,
      endDate: run.endDate,
      sortOrder: existing.length + data.length,
    });
  }

  if (data.length > 0) {
    await db.chapter.createMany({ data });
    await recordPlanActivity(null, {
      tripId,
      verb: "CREATED",
      entityType: "CHAPTER",
      entityId: null,
      entityLabel: "",
      changes: { summary: `Created ${data.length} ${data.length === 1 ? "chapter" : "chapters"} from countries` },
    });
  }
  revalidateChapterPaths(tripId);
  return { success: true };
}
