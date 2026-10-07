"use server";

import type { Route } from "next";
import { db } from "@/lib/db";
import { requireTripAccess, requireUser } from "@/lib/guards";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
import { REAL_PLAN } from "@/lib/plan-scope";

export interface SearchHit {
  type: "stop" | "item" | "transport" | "accommodation";
  id: string;
  label: string;
  sublabel?: string;
  href: Route;
}

const TAKE = 5;

export async function searchTrip(tripId: string, query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length === 0) return [];
  await requireTripAccess(tripId);

  const ref = await tripSlugFor(tripId);
  const ci = { contains: q, mode: "insensitive" as const };

  const [stops, items, transports, accommodations] = await Promise.all([
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN, name: ci },
      take: TAKE,
      select: { id: true, name: true },
    }),
    db.item.findMany({
      where: { tripId, ...REAL_PLAN, title: ci },
      take: TAKE,
      select: { id: true, title: true, date: true, stopId: true },
    }),
    db.transport.findMany({
      where: { tripId, ...REAL_PLAN, OR: [{ depPlace: ci }, { arrPlace: ci }, { reference: ci }] },
      take: TAKE,
      select: { id: true, depPlace: true, arrPlace: true },
    }),
    db.accommodation.findMany({
      where: { tripId, ...REAL_PLAN, name: ci },
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
        href: tripPath(ref, "/plan"),
      }),
    ),
    ...items.map(
      (i): SearchHit => ({
        type: "item",
        id: i.id,
        label: i.title,
        href: i.date ? tripPath(ref, `/day/${i.date}`) : tripPath(ref, "/wishlist"),
      }),
    ),
    ...transports.map(
      (t): SearchHit => ({
        type: "transport",
        id: t.id,
        label: [t.depPlace, t.arrPlace].filter(Boolean).join(" → ") || "Transport",
        href: tripPath(ref, "/plan"),
      }),
    ),
    ...accommodations.map(
      (a): SearchHit => ({
        type: "accommodation",
        id: a.id,
        label: a.name,
        href: tripPath(ref, "/plan"),
      }),
    ),
  ];
}

export async function listMyTrips(): Promise<Array<{ id: string; name: string; slug: string }>> {
  const user = await requireUser();
  const memberships = await db.tripMember.findMany({
    where: { userId: user.id, trip: { deletedAt: null } },
    select: { trip: { select: { id: true, name: true, slug: true } } },
    orderBy: { trip: { createdAt: "desc" } },
  });
  return memberships.map((m) => ({ id: m.trip.id, name: m.trip.name, slug: m.trip.slug ?? m.trip.id }));
}
