import type { AccessRequest } from "@prisma/client";
import { envAllowedEmails } from "@/lib/allowlist";
import { db } from "@/lib/db";

export async function reopenedByInvite(onlyId?: string): Promise<AccessRequest[]> {
  const dismissed = await db.accessRequest.findMany({
    where: { status: "dismissed", resolvedAt: { not: null }, ...(onlyId ? { id: onlyId } : {}) },
  });
  if (dismissed.length === 0) return [];

  const emails = dismissed.map((r) => r.email.trim().toLowerCase());
  const [invites, spots] = await Promise.all([
    db.invite.findMany({
      where: { email: { in: emails }, acceptedAt: null, trip: { deletedAt: null } },
      select: { email: true, createdAt: true },
    }),
    db.allowedEmail.findMany({ where: { email: { in: emails } }, select: { email: true } }),
  ]);
  const hasSpot = new Set([...envAllowedEmails(), ...spots.map((s) => s.email)]);

  return dismissed.filter((request) => {
    const email = request.email.trim().toLowerCase();
    const resolvedAt = request.resolvedAt!;
    return !hasSpot.has(email) && invites.some((i) => i.email === email && i.createdAt > resolvedAt);
  });
}
