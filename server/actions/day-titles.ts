"use server";

import { db } from "@/lib/db";
import { requireRowAccess } from "@/lib/guards";
import { recordPlanActivity } from "@/lib/activity-guard";
import { requireOutsideSurprise, type SurpriseRoot } from "@/lib/surprise-guard";
import { entityLabel, dayTitleSummary } from "@/lib/activity";
import { type ActionResult, fail } from "@/lib/action-result";
import { dayIndexFor } from "@/lib/day-titles";
import { revalidateTrip } from "@/lib/revalidate";

/** CONTEXT.md "Day title" — kept short so it reads as a label, not a caption. */
const MAX_TITLE_LENGTH = 80;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface StopAccess {
  id: string;
  tripId: string;
  forkId: string | null;
  name: string;
  arriveDate: string | null;
  departDate: string | null;
  viewerId: string;
  surpriseOf: SurpriseRoot | null;
}

/**
 * Look up a stop and verify the current user has access to its trip and is
 * not surprised by it (CONTEXT.md Surprise).
 */
async function requireStopAccess(stopId: string): Promise<StopAccess> {
  const { row, user, surpriseOf } = await requireRowAccess("stop", stopId);
  return { ...row, viewerId: user.id, surpriseOf };
}

// ---------------------------------------------------------------------------
// setDayTitle
// ---------------------------------------------------------------------------

export interface SetDayTitleInput {
  stopId: string;
  date: string;
  title: string;
}

/**
 * Set (or clear) the Day title for one calendar day of a Stop's stay.
 *
 * - Access-checked via the owning Stop's trip.
 * - `dayIndex` is derived from `date` against the Stop's own arrive/depart
 *   span; a rough Stop or a date outside its stay is refused.
 * - A Changeover day (ADR 0049) carries at most one title: if `date` is the
 *   Stop's arrive or depart date, the Stop has no row of its own for it, and
 *   the *other* Stop sharing that date already has a title there, this
 *   updates that row instead of creating a second one for the same date.
 *   The Stop's own existing row is always preferred.
 * - An empty/whitespace title deletes the row (a no-op if none exists).
 * - Max 80 characters (trimmed).
 */
export async function setDayTitle(input: SetDayTitleInput): Promise<ActionResult> {
  const { stopId, date, title } = input;
  const stop = await requireStopAccess(stopId);

  const dayIndex = dayIndexFor(stop, date);
  if (dayIndex === null) {
    return fail({ date: ["That day isn't part of this stop's stay."] });
  }

  const trimmed = title.trim();
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return fail({ title: [`Keep it under ${MAX_TITLE_LENGTH} characters.`] });
  }

  // Resolve the target row: normally this Stop's own (stopId, dayIndex), but
  // on a Changeover day the *other* Stop sharing that date may already own a
  // title for it — write there instead so the date carries exactly one title.
  // The Stop's OWN existing row always wins: it's redirected to the partner
  // only when it has none (final review #9).
  let targetStopId = stopId;
  let targetDayIndex = dayIndex;
  let targetSurpriseOf = stop.surpriseOf;

  const isChangeover = date === stop.arriveDate || date === stop.departDate;
  const ownRow = isChangeover
    ? await db.dayTitle.findUnique({
        where: { stopId_dayIndex: { stopId, dayIndex } },
        select: { id: true },
      })
    : null;
  if (isChangeover && !ownRow) {
    const partner = await db.stop.findFirst({
      where: {
        tripId: stop.tripId,
        forkId: stop.forkId,
        id: { not: stopId },
        OR: [{ arriveDate: date }, { departDate: date }],
      },
      select: { id: true, arriveDate: true, departDate: true },
    });
    if (partner) {
      const partnerDayIndex = dayIndexFor(partner, date);
      if (partnerDayIndex !== null) {
        const partnerTitle = await db.dayTitle.findUnique({
          where: { stopId_dayIndex: { stopId: partner.id, dayIndex: partnerDayIndex } },
        });
        if (partnerTitle) {
          // The write lands on the partner Stop's row, so it is guarded too.
          targetSurpriseOf = await requireOutsideSurprise(stop.viewerId, { stopId: partner.id });
          targetStopId = partner.id;
          targetDayIndex = partnerDayIndex;
        }
      }
    }
  }

  if (trimmed === "") {
    const existing = await db.dayTitle.findUnique({
      where: { stopId_dayIndex: { stopId: targetStopId, dayIndex: targetDayIndex } },
    });
    if (existing) {
      await db.dayTitle.delete({ where: { id: existing.id } });
      await recordPlanActivity(stop.forkId, {
        tripId: stop.tripId,
        verb: "DELETED",
        entityType: "DAY_TITLE",
        entityId: existing.id,
        entityLabel: entityLabel("DAY_TITLE", { title: existing.title }),
        changes: dayTitleSummary({ date, stopName: stop.name, before: existing.title, after: null }),
        surpriseOf: targetSurpriseOf,
      });
    }
  } else {
    const before = await db.dayTitle.findUnique({
      where: { stopId_dayIndex: { stopId: targetStopId, dayIndex: targetDayIndex } },
      select: { title: true },
    });
    const row = await db.dayTitle.upsert({
      where: { stopId_dayIndex: { stopId: targetStopId, dayIndex: targetDayIndex } },
      create: { stopId: targetStopId, dayIndex: targetDayIndex, title: trimmed },
      update: { title: trimmed },
    });
    // The Stop the Traveller was editing names the day, even when a
    // Changeover redirected the write to the partner's row.
    if (before?.title !== trimmed) {
      await recordPlanActivity(stop.forkId, {
        tripId: stop.tripId,
        verb: before ? "UPDATED" : "CREATED",
        entityType: "DAY_TITLE",
        entityId: row.id,
        entityLabel: entityLabel("DAY_TITLE", { title: trimmed }),
        changes: dayTitleSummary({ date, stopName: stop.name, before: before?.title ?? null, after: trimmed }),
      });
    }
  }

  revalidateTrip(stop.tripId, "plan");
  return { success: true };
}
