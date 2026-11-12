"use server";

import { db } from "@/lib/db";
import { requireRowAccess, type RowKind } from "@/lib/guards";
import { type ConfirmationKind } from "@/lib/booking-confirmation";
import { type ActionResult, ok } from "@/lib/action-result";
import { revalidateTrip } from "@/lib/revalidate";

const ROW_KIND: Record<ConfirmationKind, RowKind> = {
  TRANSPORT: "transport",
  ACCOMMODATION: "accommodation",
  ITEM: "item",
};

export async function setNothingToAttach(
  kind: ConfirmationKind,
  id: string,
  nothingToAttach: boolean,
): Promise<ActionResult> {
  const { row } = await requireRowAccess(ROW_KIND[kind], id, { realPlanOnly: true });
  const data = { nothingToAttach };
  switch (kind) {
    case "TRANSPORT":
      await db.transport.update({ where: { id }, data });
      break;
    case "ACCOMMODATION":
      await db.accommodation.update({ where: { id }, data });
      break;
    case "ITEM":
      await db.item.update({ where: { id }, data });
      break;
  }
  revalidateTrip(row.tripId, "plan", "journal");
  return ok();
}
