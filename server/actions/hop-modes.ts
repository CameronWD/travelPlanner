"use server";

import { db } from "@/lib/db";
import { requireRowAccess } from "@/lib/guards";
import { revalidateTrip } from "@/lib/revalidate";
import { fail, type ActionResult } from "@/lib/action-result";
import type { HopModeChoice } from "@/lib/hop-modes";

const MODES: readonly string[] = ["WALK", "TRANSIT", "DRIVE"];

export async function setHopMode(fromItemId: string, toItemId: string, mode: HopModeChoice | null): Promise<ActionResult> {
  if (mode !== null && !MODES.includes(mode)) return fail({ mode: ["Pick Walk, Public transport, Drive or Automatic."] });
  if (fromItemId === toItemId) return fail({ mode: ["A hop needs two different things."] });
  const [from, to] = [
    await requireRowAccess("item", fromItemId, { realPlanOnly: true }),
    await requireRowAccess("item", toItemId, { realPlanOnly: true }),
  ];
  if (from.row.tripId !== to.row.tripId) return fail({ mode: ["Those two things are not on the same trip."] });
  const tripId = from.row.tripId;

  if (mode === null) {
    await db.hopMode.deleteMany({ where: { fromItemId, toItemId } });
  } else {
    await db.hopMode.upsert({
      where: { fromItemId_toItemId: { fromItemId, toItemId } },
      create: { tripId, fromItemId, toItemId, mode, setById: from.user.id },
      update: { mode, setById: from.user.id },
    });
  }
  revalidateTrip(tripId, "plan");
  return { success: true };
}
