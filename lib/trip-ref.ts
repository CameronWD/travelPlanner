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

const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";

/**
 * Whether the request carries the secure-prefixed Auth.js session cookie
 * (`defaultCookies` in @auth/core/lib/utils/cookie.ts), in either its plain
 * or chunked (`.0`, `.1`, …) form. `getToken()` needs to be told which cookie
 * name to look for via `secureCookie` — it does not sniff this itself — and
 * the request's own protocol is the wrong signal behind a TLS-terminating
 * proxy: Next sees `http://` from the proxy to the app, while the browser set
 * the `__Secure-` cookie because *it* spoke https, so a protocol check would
 * wrongly treat a real member as signed out. The cookie the browser actually
 * sent is the only reliable signal here.
 */
function hasSecureSessionCookie(req: NextRequest): boolean {
  const raw = req.headers.get("cookie") ?? "";
  return raw.split(";").some((pair) => {
    const name = pair.split("=")[0]?.trim() ?? "";
    return name === SECURE_SESSION_COOKIE || name.startsWith(`${SECURE_SESSION_COOKIE}.`);
  });
}

/**
 * The signed-in Traveller's id from the Auth.js JWT cookie (lib/auth.ts uses
 * the JWT strategy and puts the DB id on `token.id`). No DB, no next-auth
 * config import — keeps the proxy bundle small. Null when signed out or
 * unreadable; the page's own requireUser/requireTripAccess stay the real gate.
 *
 * `secret` mirrors next-auth's own fallback (`lib/env.js`:
 * `config.secret ?? (config.secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET)`)
 * so this reads the same secret lib/auth.ts ends up configured with.
 *
 * `getToken()` throws (e.g. `MissingSecret` when no secret is configured at
 * all) rather than returning null for every failure mode. A throw here is
 * uncaught in proxy.ts, so it would 500 every /trips/* request instead of the
 * signed-out pass-through this function promises — caught and folded into the
 * same "null" result.
 */
export async function viewerIdFromRequest(req: NextRequest): Promise<string | null> {
  try {
    const token = await getToken({
      req,
      secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
      secureCookie: hasSecureSessionCookie(req),
    });
    return typeof token?.id === "string" ? token.id : null;
  } catch {
    return null;
  }
}

export async function viewerIsTripMember(tripId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const m = await db.tripMember.findFirst({ where: { tripId, userId }, select: { userId: true } });
  return m != null;
}
