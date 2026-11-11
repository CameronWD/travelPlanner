import type { AccessRequest } from "@prisma/client";
import { db } from "@/lib/db";

export async function reopenedByInvite(onlyId?: string): Promise<AccessRequest[]> {
  const dismissed = await db.accessRequest.findMany({
    where: { status: "dismissed", ...(onlyId ? { id: onlyId } : {}) },
  });
  if (dismissed.length === 0) return [];

  const invites = await db.invite.findMany({
    where: {
      email: { in: dismissed.map((r) => r.email.trim().toLowerCase()) },
      acceptedAt: null,
      trip: { deletedAt: null },
    },
    select: { email: true, createdAt: true },
  });

  return dismissed.filter((request) => {
    const email = request.email.trim().toLowerCase();
    const resolvedAt = request.resolvedAt;
    return invites.some((i) => i.email === email && (!resolvedAt || i.createdAt > resolvedAt));
  });
}
