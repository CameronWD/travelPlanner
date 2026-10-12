"use server";

/**
 * Surprise (CONTEXT.md): the planner making a Stop or Item a Surprise,
 * changing who is surprised, and revealing it by hand. The automatic reveal
 * (the day after it is over) and the reveal on leaving live in
 * lib/surprise-sweep.ts.
 */
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { requireOutsideSurprise, surpriseRootFor } from "@/lib/surprise-guard";
import { SURPRISE_SELECT, serializeSurpriseFor, surpriseState, validateSurpriseFor } from "@/lib/surprise";
import { surpriseSummary } from "@/lib/activity";
import { TRAVELLER_SELECT, travellerFirstName } from "@/lib/traveller";
import { recordPlanActivity } from "@/lib/activity-guard";
import { type ActionResult, fail } from "@/lib/action-result";

export type SurpriseKind = "STOP" | "ITEM";

async function loadRow(kind: SurpriseKind, id: string) {
  if (kind === "STOP") {
    const s = await db.stop.findUnique({
      where: { id },
      select: { id: true, tripId: true, forkId: true, name: true, departDate: true, timezone: true, ...SURPRISE_SELECT },
    });
    return s && { ...s, label: s.name, over: { endDate: s.departDate, timezone: s.timezone }, enclosingStopId: null as string | null };
  }
  const i = await db.item.findUnique({
    where: { id },
    select: { id: true, tripId: true, forkId: true, title: true, date: true, stopId: true, ...SURPRISE_SELECT, stop: { select: { timezone: true } } },
  });
  return i && { ...i, label: i.title, over: { endDate: i.date, timezone: i.stop?.timezone ?? null }, enclosingStopId: i.stopId };
}

type SurpriseWrite = { surprisePlannerId?: string; surpriseForIds?: string; surpriseRevealedAt: Date | null };

async function writeColumns(kind: SurpriseKind, id: string, data: SurpriseWrite) {
  if (kind === "STOP") await db.stop.update({ where: { id }, data });
  else await db.item.update({ where: { id }, data });
}

/** Make a Stop or Item a Surprise, or (planner only) change who it surprises. `forIds` defaults to everyone else on the Trip. */
export async function setSurprise(input: { kind: SurpriseKind; id: string; forIds?: string[] }): Promise<ActionResult> {
  const row = await loadRow(input.kind, input.id);
  if (!row) notFound();
  const { user } = await requireTripAccess(row.tripId);
  if (row.enclosingStopId) await requireOutsideSurprise(user.id, { stopId: row.enclosingStopId });

  const now = new Date();
  const state = surpriseState(row, row.over, now);
  if (state === "live" && row.surprisePlannerId !== user.id) {
    return fail({ _: ["Only the planner can change a surprise."] });
  }
  // A reveal is sticky: re-surprising would re-hide the history it showed.
  if (state === "revealed") return fail({ _: ["This was a surprise already. It can't be hidden again."] });

  const members = (
    await db.tripMember.findMany({ where: { tripId: row.tripId }, select: { user: { select: TRAVELLER_SELECT } } })
  ).map((m) => m.user);
  const byId = new Map(members.map((m) => [m.id, m]));
  const forIds = [...new Set(input.forIds ?? members.map((m) => m.id).filter((id) => id !== user.id))];
  const refused = validateSurpriseFor({ forIds, plannerId: user.id, memberIds: [...byId.keys()], over: row.over, now });
  if (refused) return fail(refused);

  await writeColumns(input.kind, row.id, {
    surprisePlannerId: user.id,
    surpriseForIds: serializeSurpriseFor(forIds),
    surpriseRevealedAt: null,
  });
  const forNames = forIds.map((id) => travellerFirstName(byId.get(id)!));
  await recordPlanActivity(row.forkId, {
    tripId: row.tripId,
    verb: "UPDATED",
    entityType: input.kind,
    entityId: row.id,
    entityLabel: row.label,
    surpriseOf: { type: input.kind, id: row.id },
    changes: surpriseSummary({ kind: "set", kindOf: input.kind, label: row.label, forNames }),
  });
  revalidatePath(`/trips/${row.tripId}`, "layout");
  return { success: true };
}

/** The planner reveals their Surprise: one line in the feed, unstamped unless an Item's Stop is still a Surprise. */
export async function revealSurprise(input: { kind: SurpriseKind; id: string }): Promise<ActionResult> {
  const row = await loadRow(input.kind, input.id);
  if (!row) notFound();
  const { user } = await requireTripAccess(row.tripId);
  if (surpriseState(row, row.over, new Date()) !== "live") return fail({ _: ["This isn't a surprise."] });
  if (row.surprisePlannerId !== user.id) return fail({ _: ["Only the planner can reveal a surprise."] });

  await writeColumns(input.kind, row.id, { surpriseRevealedAt: new Date() });
  // An Item revealed inside a Stop that is still a Surprise stays inside it.
  const surpriseOf = row.enclosingStopId ? await surpriseRootFor({ stopId: row.enclosingStopId }) : null;
  await recordPlanActivity(row.forkId, {
    tripId: row.tripId,
    verb: "UPDATED",
    entityType: input.kind,
    entityId: row.id,
    entityLabel: row.label,
    surpriseOf,
    changes: surpriseSummary({ kind: "reveal", kindOf: input.kind, label: row.label }),
  });
  revalidatePath(`/trips/${row.tripId}`, "layout");
  return { success: true };
}
