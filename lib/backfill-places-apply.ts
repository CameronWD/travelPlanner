import { db } from "@/lib/db";
import { fetchVenueDetails } from "@/lib/geocode";
import { itemFamilyRecipientsForSave, writeItemFamily } from "@/lib/item-family";
import { serializeOpeningHours } from "@/lib/validations/opening-hours";
import { safeWebHref } from "@/lib/url";
import { planColumns, type PlanRow } from "@/lib/backfill-places";

// A planned row is written only if it still looks the way the dry run saw it,
// so a place picked (or a pin moved) since the plan is never overwritten.
export async function applyPlanRow(row: PlanRow): Promise<"written" | "changed"> {
  const cols = planColumns(row.kind);
  const where = {
    id: row.id,
    [cols.placeId]: null,
    [cols.lat]: row.old?.lat ?? null,
    [cols.lng]: row.old?.lng ?? null,
    ...(cols.timezone && cols.timezone in row.set ? { [cols.timezone]: null } : {}),
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
