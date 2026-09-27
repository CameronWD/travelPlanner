"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { recordPlanActivity } from "@/lib/activity-guard";
import { entityLabel } from "@/lib/activity";
import { type ActionResult, fail } from "@/lib/action-result";
import { dayIndexFor } from "@/lib/day-titles";

/** CONTEXT.md "Day title" — kept short so it reads as a label, not a caption. */
const MAX_TITLE_LENGTH = 80;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface StopAccess {
  id: string;
  tripId: string;
  forkId: string | null;
  arriveDate: string | null;
  departDate: string | null;
}

/**
 * Look up a stop and verify the current user has access to its trip.
 * Same pattern as the private `requireStopAccess` in stops.ts (not exported
 * from there, so replicated here rather than reaching across modules).
 */
async function requireStopAccess(stopId: string): Promise<StopAccess> {
  const stop = await db.stop.findUnique({
    where: { id: stopId },
    select: { id: true, tripId: true, forkId: true, arriveDate: true, departDate: true },
  });
  if (!stop) {
    notFound();
  }
  await requireTripAccess(stop.tripId);
  return stop;
}

function revalidateDayTitlePaths(tripId: string, date: string) {
  revalidatePath(`/trips/${tripId}/plan`);
  revalidatePath(`/trips/${tripId}/calendar`);
  revalidatePath(`/trips/${tripId}/day/${date}`);
  revalidatePath(`/trips/${tripId}`);
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
 *   Stop's arrive or depart date and the *other* Stop sharing that date
 *   already has a title there, this updates that row instead of creating a
 *   second one for the same date.
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
  let targetStopId = stopId;
  let targetDayIndex = dayIndex;

  const isChangeover = date === stop.arriveDate || date === stop.departDate;
  if (isChangeover) {
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
        entityLabel: entityLabel("DAY_TITLE", {}),
      });
    }
  } else {
    const row = await db.dayTitle.upsert({
      where: { stopId_dayIndex: { stopId: targetStopId, dayIndex: targetDayIndex } },
      create: { stopId: targetStopId, dayIndex: targetDayIndex, title: trimmed },
      update: { title: trimmed },
    });
    await recordPlanActivity(stop.forkId, {
      tripId: stop.tripId,
      verb: "UPDATED",
      entityType: "DAY_TITLE",
      entityId: row.id,
      entityLabel: entityLabel("DAY_TITLE", {}),
    });
  }

  revalidateDayTitlePaths(stop.tripId, date);
  return { success: true };
}
