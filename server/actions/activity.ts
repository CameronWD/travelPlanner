"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";

export async function markAllRead(tripId: string): Promise<void> {
  const user = await requireUser();
  await db.tripMember.updateMany({
    where: { tripId, userId: user.id },
    data: { lastReadActivityAt: new Date() },
  });
}
