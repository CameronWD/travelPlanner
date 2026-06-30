"use server";

import { db } from "@/lib/db";
import { requireTripAccess, requireUser } from "@/lib/guards";

export interface SearchHit {
  type: "stop" | "item" | "transport" | "accommodation";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

const TAKE = 5;

export async function searchTrip(tripId: string, query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length === 0) return [];
  await requireTripAccess(tripId);

  const base = `/trips/${tripId}`;
  const ci = { contains: q, mode: "insensitive" as const };

  const [stops, items, transports, accommodations] = await Promise.all([
    db.stop.findMany({
      where: { tripId, name: ci },
      take: TAKE,
      select: { id: true, name: true },
    }),
    db.item.findMany({
      where: { tripId, title: ci },
      take: TAKE,
      select: { id: true, title: true, date: true, stopId: true },
    }),
    db.transport.findMany({
      where: { tripId, OR: [{ depPlace: ci }, { arrPlace: ci }, { reference: ci }] },
      take: TAKE,
      select: { id: true, depPlace: true, arrPlace: true },
    }),
    db.accommodation.findMany({
      where: { tripId, name: ci },
      take: TAKE,
      select: { id: true, name: true },
    }),
  ]);

  return [
    ...stops.map(
      (s): SearchHit => ({
        type: "stop",
        id: s.id,
        label: s.name,
        href: `${base}/plan`,
      }),
    ),
    ...items.map(
      (i): SearchHit => ({
        type: "item",
        id: i.id,
        label: i.title,
        href: i.date ? `${base}/day/${i.date}` : `${base}/wishlist`,
      }),
    ),
    ...transports.map(
      (t): SearchHit => ({
        type: "transport",
        id: t.id,
        label: [t.depPlace, t.arrPlace].filter(Boolean).join(" → ") || "Transport",
        href: `${base}/plan`,
      }),
    ),
    ...accommodations.map(
      (a): SearchHit => ({
        type: "accommodation",
        id: a.id,
        label: a.name,
        href: `${base}/plan`,
      }),
    ),
  ];
}

export async function listMyTrips(): Promise<Array<{ id: string; name: string }>> {
  const user = await requireUser();
  const memberships = await db.tripMember.findMany({
    where: { userId: user.id },
    select: { trip: { select: { id: true, name: true } } },
    orderBy: { trip: { createdAt: "desc" } },
  });
  return memberships.map((m) => m.trip);
}
