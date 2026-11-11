"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { envAllowedEmails } from "@/lib/allowlist";
import { buildPeople, type PersonView } from "@/lib/people";
import { travellerName } from "@/lib/traveller";

export async function listPeople(): Promise<PersonView[]> {
  await requireAdmin();

  const [allowed, users, invites] = await Promise.all([
    db.allowedEmail.findMany({ select: { id: true, email: true, note: true, createdAt: true } }),
    db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        displayName: true,
        createdAt: true,
        memberships: { select: { role: true } },
        authSessions: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
        pushSubscriptions: { select: { lastSeenAt: true }, orderBy: { lastSeenAt: "desc" }, take: 1 },
      },
    }),
    db.invite.findMany({
      where: { acceptedAt: { not: null } },
      select: {
        email: true,
        acceptedAt: true,
        trip: {
          select: {
            name: true,
            members: {
              where: { role: "owner" },
              select: { user: { select: { id: true, name: true, image: true, displayName: true, email: true } } },
            },
          },
        },
      },
    }),
  ]);

  return buildPeople({
    envEmails: envAllowedEmails(),
    allowed,
    users: users.map((u) => {
      const seen = [u.authSessions[0]?.updatedAt, u.pushSubscriptions[0]?.lastSeenAt].filter((d): d is Date => !!d);
      return {
        id: u.id,
        email: u.email,
        name: travellerName(u),
        createdAt: u.createdAt,
        lastSeenAt: seen.length ? new Date(Math.max(...seen.map((d) => d.getTime()))) : null,
        tripsOwned: u.memberships.filter((m) => m.role === "owner").length,
        tripsOn: u.memberships.filter((m) => m.role === "member").length,
      };
    }),
    acceptedInvites: invites.map((i) => {
      const owner = i.trip.members[0]?.user;
      return {
        email: i.email,
        acceptedAt: i.acceptedAt!,
        tripName: i.trip.name,
        ownerName: owner ? travellerName(owner) : "Traveller",
      };
    }),
  });
}
