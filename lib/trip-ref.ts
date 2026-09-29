import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import type { ResolvedTripRef } from "@/lib/trip-route";

/**
 * DB side of the route boundary (ADR 0064), called from proxy.ts only.
 * Order: current slug (one indexed lookup — the common case), then slug
 * history, then the Trip's id (old cuid links). A history row whose Trip was
 * deleted resolves to nothing.
 */
export async function resolveTripRef(ref: string): Promise<ResolvedTripRef | null> {
  const current = await db.trip.findUnique({ where: { slug: ref }, select: { id: true, slug: true } });
  if (current) return current;
  const past = await db.tripSlug.findUnique({ where: { slug: ref }, select: { trip: { select: { id: true, slug: true } } } });
  if (past) return past.trip;
  return db.trip.findUnique({ where: { id: ref }, select: { id: true, slug: true } });
}

/**
 * The signed-in Traveller's id from the Auth.js JWT cookie (lib/auth.ts uses
 * the JWT strategy and puts the DB id on `token.id`). No DB, no next-auth
 * config import — keeps the proxy bundle small. Null when signed out or
 * unreadable; the page's own requireUser/requireTripAccess stay the real gate.
 */
export async function viewerIdFromRequest(req: NextRequest): Promise<string | null> {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie: req.nextUrl.protocol === "https:" });
  return typeof token?.id === "string" ? token.id : null;
}

export async function viewerIsTripMember(tripId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const m = await db.tripMember.findFirst({ where: { tripId, userId }, select: { userId: true } });
  return m != null;
}
