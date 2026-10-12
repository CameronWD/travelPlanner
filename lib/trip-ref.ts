import type { NextRequest } from "next/server";
import { getCookieCache } from "better-auth/cookies";
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
 * The signed-in Traveller's id from Better Auth's cookie cache (ADR 0071).
 * No DB, no auth config import — keeps the proxy bundle small. Null when
 * signed out, unreadable, or on any error; the page's own
 * requireUser/requireTripAccess stay the real gate.
 *
 * `secret` falls back the same way lib/auth.ts does: `BETTER_AUTH_SECRET`,
 * then `AUTH_SECRET` (today's Vercel var keeps working).
 *
 * The cookie cache is only refreshed on session reads, so it can be up to
 * its 5-minute TTL stale after a sign-out — acceptable here, since this is
 * only used for the share page's "is the viewer a member" nicety, not a real
 * auth gate.
 */
export async function viewerIdFromRequest(req: NextRequest): Promise<string | null> {
  try {
    const cached = await getCookieCache(req, {
      secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,
    });
    return typeof cached?.user?.id === "string" ? cached.user.id : null;
  } catch {
    return null;
  }
}

export async function viewerIsTripMember(tripId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const m = await db.tripMember.findFirst({ where: { tripId, userId }, select: { userId: true } });
  return m != null;
}
