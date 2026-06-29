"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { chapterSchema, type ChapterInput } from "@/lib/validations/chapter";
import { chaptersOverlap, suggestChapterRuns } from "@/lib/chapters";
import { nextChapterColour } from "@/lib/chapter-colours";
import { recordActivity } from "@/server/actions/activity";
import { entityLabel, describeChanges } from "@/lib/activity";

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
  for (const p of ["", "/budget", "/summary", "/today", "/settings", "/calendar"]) {
    revalidatePath(`/trips/${tripId}${p}`);
  }
}

async function requireChapterAccess(chapterId: string): Promise<{ id: string; tripId: string }> {
  const chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, tripId: true },
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
) {
  if (!range.startDate || !range.endDate) return null; // rough chapter never overlaps
  const siblings = await db.chapter.findMany({
    where: { tripId },
    select: { id: true, startDate: true, endDate: true },
  });
  return siblings.find(
    (s) => s.id !== excludeId && s.startDate && s.endDate &&
      chaptersOverlap({ startDate: s.startDate, endDate: s.endDate }, { startDate: range.startDate!, endDate: range.endDate! }),
  ) ?? null;
}

async function nextSortOrder(tripId: string): Promise<number> {
  // sortOrder is only a stable creation-order tiebreak; chapters are ordered by startDate at read time.
  return db.chapter.count({ where: { tripId } });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createChapter(
  tripId: string,
  input: ChapterInput,
): Promise<ChapterActionResult> {
  await requireTripAccess(tripId);

  const parsed = chapterSchema.safeParse(input);
  if (!parsed.success) return validationErrors(parsed.error);

  if (await firstOverlap(tripId, parsed.data)) {
    return { success: false, errors: { startDate: ["Chapters cannot overlap another chapter's dates"] } };
  }

  const created = await db.chapter.create({
    data: { tripId, ...parsed.data, sortOrder: await nextSortOrder(tripId) },
  });

  await recordActivity({ tripId, verb: "CREATED", entityType: "CHAPTER", entityId: created.id, entityLabel: entityLabel("CHAPTER", created as unknown as Record<string, unknown>) });
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
  await recordActivity({
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
  await recordActivity({ tripId: chapter.tripId, verb: "DELETED", entityType: "CHAPTER", entityId: chapterId, entityLabel: doomed?.name ?? "" });
  revalidateChapterPaths(chapter.tripId);
  return { success: true };
}

export async function reorderChapters(
  tripId: string,
  orderedChapterIds: string[],
): Promise<ChapterActionResult> {
  await requireTripAccess(tripId);
  if (orderedChapterIds.length === 0) return { success: true };

  const chapters = await db.chapter.findMany({
    where: { id: { in: orderedChapterIds }, tripId },
    select: { id: true, startDate: true },
  });
  if (chapters.length !== orderedChapterIds.length) {
    return { success: false, errors: { chapter: ["One or more chapters aren't part of this trip."] } };
  }
  if (chapters.some((c) => c.startDate != null)) {
    return { success: false, errors: { chapter: ["Only rough (date-less) chapters can be reordered."] } };
  }

  await db.$transaction(
    orderedChapterIds.map((id, idx) =>
      db.chapter.update({ where: { id }, data: { sortOrder: idx } }),
    ),
  );

  revalidateChapterPaths(tripId);
  return { success: true };
}

export async function suggestChaptersFromCountries(tripId: string): Promise<ChapterActionResult> {
  await requireTripAccess(tripId);

  const [stops, existing] = await Promise.all([
    db.stop.findMany({
      where: { tripId },
      select: { id: true, arriveDate: true, departDate: true, country: true, sortOrder: true },
    }),
    db.chapter.findMany({
      where: { tripId },
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
    await recordActivity({
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
