import { db } from "@/lib/db";
import { fetchVenueDetails } from "@/lib/geocode";
import { itemFamilyRecipientsForSave, writeItemFamily } from "@/lib/item-family";
import { serializeOpeningHours } from "@/lib/validations/opening-hours";
import { safeWebHref } from "@/lib/url";
import { MAX_CONSECUTIVE_ERRORS, REFUSING, errorStreak, planColumns, type Out, type PlanRow } from "@/lib/backfill-places";

// A planned row is written only if it still looks the way the dry run saw it,
// so a place picked, a pin moved or the looked-up text edited since the plan is never overwritten.
export async function applyPlanRow(row: PlanRow): Promise<"written" | "changed"> {
  const cols = planColumns(row.kind);
  const where = {
    id: row.id,
    [cols.placeId]: null,
    [cols.lat]: row.old?.lat ?? null,
    [cols.lng]: row.old?.lng ?? null,
    ...(cols.timezone && cols.timezone in row.set ? { [cols.timezone]: null } : {}),
    ...row.was,
  };
  const args = { where, data: row.set };
  const { count } = await (() => {
    switch (row.kind) {
      case "item":
        return db.item.updateMany(args);
      case "stop":
        return db.stop.updateMany(args);
      case "accommodation":
        return db.accommodation.updateMany(args);
      case "transport-dep":
      case "transport-arr":
        return db.transport.updateMany(args);
      case "marker":
        return db.marker.updateMany(args);
      case "home":
        return db.trip.updateMany(args);
    }
  })();
  return count === 1 ? "written" : "changed";
}

export type DetailsOutcome = "filled" | "empty" | "failed";

// Hours and link fill only when empty; hours go to the Item family and never cross a Surprise.
export async function fillItemDetails(itemId: string, placeId: string): Promise<DetailsOutcome> {
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { id: true, tripId: true, sourceItemId: true, stopId: true, openingHours: true, link: true },
  });
  if (!item) return "failed";
  const details = await fetchVenueDetails(placeId);
  if (!details) return "failed";
  const hours = item.openingHours ? null : serializeOpeningHours(details.openingHours);
  const link = item.link ? null : safeWebHref(details.website);
  await db.$transaction(async (tx) => {
    await tx.item.update({
      where: { id: item.id },
      data: {
        ...(hours ? { openingHours: hours } : {}),
        ...(link ? { link } : {}),
        ...(details.businessStatus ? { businessStatus: details.businessStatus } : {}),
      },
    });
    if (!hours) return;
    const recipients = await itemFamilyRecipientsForSave(item, { stopId: item.stopId }, tx);
    if (recipients.length === 0) return;
    const empty = await tx.item.findMany({ where: { id: { in: recipients }, openingHours: null }, select: { id: true } });
    await writeItemFamily(tx, empty.map((r) => r.id), { openingHours: hours });
  });
  return details.openingHours || details.website || details.businessStatus ? "filled" : "empty";
}

// A row written by an earlier run whose details failed still holds the plan's place ID and no business status.
async function detailsPending(row: PlanRow, placeId: string): Promise<boolean> {
  return (await db.item.count({ where: { id: row.id, placeId, businessStatus: null } })) === 1;
}

export interface ExecuteResult {
  ok: boolean;
  counts: { written: number; changed: number; failed: number };
  details: { calls: number; filled: number; empty: number; failed: number };
  failedDetails: string[];
}

export async function executePlan(rows: PlanRow[], out: Out): Promise<ExecuteResult> {
  const counts = { written: 0, changed: 0, failed: 0 };
  const details = { calls: 0, filled: 0, empty: 0, failed: 0 };
  const failedDetails: string[] = [];
  const streak = errorStreak();
  let ok = true;

  for (const row of rows) {
    let outcome: "written" | "changed";
    try {
      outcome = await applyPlanRow(row);
    } catch (err) {
      counts.failed++;
      out.error(`${row.kind} ${row.id}: write failed, row left unchanged: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    counts[outcome]++;
    const placeId = row.set.placeId;
    const wantsDetails = row.details && typeof placeId === "string";
    if (outcome === "changed") {
      if (!wantsDetails || !(await detailsPending(row, placeId))) {
        out.log(`${row.kind} ${row.id} · SKIPPED · changed since the plan (or already written)`);
        continue;
      }
      out.log(`${row.kind} ${row.id} · WRITTEN EARLIER · retrying details`);
    } else {
      out.log(`${row.kind} ${row.id} · WRITTEN`);
    }
    if (!wantsDetails) continue;
    details.calls++;
    const filled = await fillItemDetails(row.id, placeId).catch(() => "failed" as const);
    details[filled]++;
    if (filled === "failed") {
      failedDetails.push(row.id);
      out.error(`  item ${row.id}: coordinates and place ID committed; details failed`);
    }
    if (streak.record(filled === "failed")) {
      out.error(`\n${REFUSING}\nStopped after ${MAX_CONSECUTIVE_ERRORS} failed detail calls in a row. Re-run the same command to resume: written rows are skipped and failed details are retried.`);
      ok = false;
      break;
    }
  }

  out.log(`\nRows: ${counts.written} written / ${counts.changed} skipped (changed since the plan) / ${counts.failed} failed`);
  out.log(`Enterprise detail calls: ${details.calls} (${details.filled} filled / ${details.empty} empty / ${details.failed} failed)`);
  if (failedDetails.length) out.log(`Items whose details failed (re-run to retry): ${failedDetails.join(", ")}`);
  return { ok, counts, details, failedDetails };
}
