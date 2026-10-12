/**
 * Surprise (CONTEXT.md) reveals that no one clicks: the automatic one, the
 * day after it is over (run from the Digest cron), and the one when the
 * planner leaves or is removed from the Trip, since nobody else could.
 *
 * recordActivity needs a signed-in Traveller, so these write the one reveal
 * line themselves with the planner as its actor. A Fork's copy is revealed
 * too but writes no line: Forks are silent (lib/activity-guard.ts).
 */
import { db } from "@/lib/db";
import { SURPRISE_SELECT, parseSurpriseFor, serializeSurpriseFor, surpriseState, type SurpriseColumns, type SurpriseOver } from "@/lib/surprise";
import { surpriseSummary } from "@/lib/activity";

type Kind = "STOP" | "ITEM";
type Row = SurpriseColumns & { id: string; tripId: string; forkId: string | null };
type SurpriseWrite = { surpriseForIds?: string; surpriseRevealedAt?: Date };
type Update = (id: string, data: SurpriseWrite) => Promise<unknown>;

const updateStop: Update = (id, data) => db.stop.update({ where: { id }, data });
const updateItem: Update = (id, data) => db.item.update({ where: { id }, data });

async function writeRevealLine(row: Row, kindOf: Kind, label: string) {
  if (!row.surprisePlannerId || row.forkId !== null) return;
  await db.activity.create({
    data: {
      tripId: row.tripId,
      actorId: row.surprisePlannerId,
      verb: "UPDATED",
      entityType: kindOf,
      entityId: row.id,
      entityLabel: label,
      surpriseOfType: null,
      surpriseOfId: null,
      changes: { ...surpriseSummary({ kind: "reveal", kindOf, label }) },
    },
  });
}

async function reveal(row: Row, kindOf: Kind, label: string, update: Update, now: Date) {
  await update(row.id, { surpriseRevealedAt: now });
  await writeRevealLine(row, kindOf, label);
}

/** Called by the digest cron: reveal every live Surprise that is over (the day after its end date in its zone). */
export async function revealDueSurprises(opts: { now?: Date } = {}): Promise<{ revealed: number }> {
  const now = opts.now ?? new Date();
  const live = { surprisePlannerId: { not: null }, surpriseRevealedAt: null };
  const [stops, items] = await Promise.all([
    db.stop.findMany({
      where: { ...live, departDate: { not: null } },
      select: { id: true, tripId: true, forkId: true, name: true, departDate: true, timezone: true, ...SURPRISE_SELECT },
    }),
    db.item.findMany({
      where: { ...live, date: { not: null } },
      select: { id: true, tripId: true, forkId: true, title: true, date: true, ...SURPRISE_SELECT, stop: { select: { timezone: true } } },
    }),
  ]);
  const due: { row: Row; over: SurpriseOver; kindOf: Kind; label: string; update: Update }[] = [
    ...stops.map((s) => ({ row: s, over: { endDate: s.departDate, timezone: s.timezone }, kindOf: "STOP" as const, label: s.name, update: updateStop })),
    ...items.map((i) => ({ row: i, over: { endDate: i.date, timezone: i.stop?.timezone ?? null }, kindOf: "ITEM" as const, label: i.title, update: updateItem })),
  ];
  let revealed = 0;
  for (const d of due) {
    if (surpriseState(d.row, d.over, now) !== "revealed") continue;
    await reveal(d.row, d.kindOf, d.label, d.update, now);
    revealed++;
  }
  return { revealed };
}

/** The planner leaving (or being removed) reveals their Surprises; they also stop being surprised by anyone else's, and one left surprising no one is revealed. */
export async function revealSurprisesPlannedBy(tripId: string, userId: string): Promise<void> {
  const now = new Date();
  const where = { tripId, surprisePlannerId: { not: null }, surpriseRevealedAt: null };
  const [stops, items] = await Promise.all([
    db.stop.findMany({ where, select: { id: true, tripId: true, forkId: true, name: true, ...SURPRISE_SELECT } }),
    db.item.findMany({ where, select: { id: true, tripId: true, forkId: true, title: true, ...SURPRISE_SELECT } }),
  ]);
  const rows: { row: Row; kindOf: Kind; label: string; update: Update }[] = [
    ...stops.map((s) => ({ row: s, kindOf: "STOP" as const, label: s.name, update: updateStop })),
    ...items.map((i) => ({ row: i, kindOf: "ITEM" as const, label: i.title, update: updateItem })),
  ];
  for (const { row, kindOf, label, update } of rows) {
    if (row.surprisePlannerId === userId) {
      await reveal(row, kindOf, label, update, now);
      continue;
    }
    const before = parseSurpriseFor(row.surpriseForIds);
    const forIds = before.filter((id) => id !== userId);
    if (forIds.length === before.length) continue;
    if (forIds.length) await update(row.id, { surpriseForIds: serializeSurpriseFor(forIds) });
    else await reveal(row, kindOf, label, update, now);
  }
}
