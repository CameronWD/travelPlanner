import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";

/**
 * The Sketching Home's Route card rows (components/trip/home/phase-sketching.tsx).
 * The caller (the Trip Home page) has already checked Trip access.
 *
 * Dated views follow the real plan — CONTEXT.md; consistent with
 * calendar/day/print/summary. Policy (not a BND-2 spelling exemption):
 * deliberately ignores `?plan=` — never wire in a variable plan here.
 * A disabled trip renders as if it had no chapters (Task 13), so the
 * chapters query is skipped entirely rather than fetch-then-discard.
 */
export async function readSketchingPlan(tripId: string, chaptersEnabled: boolean) {
  const [stops, chapters] = await Promise.all([
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: [{ chapterSortOrder: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, country: true, nights: true, chapterId: true, arriveDate: true },
    }),
    chaptersEnabled
      ? db.chapter.findMany({
          where: { tripId, ...REAL_PLAN },
          orderBy: { name: "asc" },
          select: { id: true, name: true, colour: true },
        })
      : Promise.resolve([]),
  ]);
  return { stops, chapters };
}
