import type { NextRequest } from "next/server";
import { getCookieCache, getSessionCookie } from "better-auth/cookies";
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

/** Better Auth's signing secret, with the same fallback lib/auth.ts uses. */
function authSecret(): string | undefined {
  return process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET;
}

/**
 * The session token from Better Auth's signed `session_token` cookie value
 * (`<token>.<base64 HMAC-SHA256 of token>`), or null when the signature does
 * not verify. The same check better-call's getSignedCookie does, inlined with
 * WebCrypto so the proxy does not import the auth config.
 */
async function verifiedSessionToken(value: string, secret: string): Promise<string | null> {
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const token = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (signature.length !== 44 || !signature.endsWith("=")) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "verify",
  ]);
  const sig = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  return (await crypto.subtle.verify("HMAC", key, sig, enc.encode(token))) ? token : null;
}

/**
 * The signed-in Traveller's id (ADR 0071). Null when signed out,
 * unreadable, or on any error; the page's own requireUser/requireTripAccess
 * stay the real gate.
 *
 * First Better Auth's cookie cache (no DB). The cache lives 5 minutes and is
 * only rewritten on session reads outside server components, so a member
 * who reloads after 5 idle minutes has none. Then the session itself: the
 * signed `session_token` cookie, its signature verified with the secret,
 * looked up as an AuthSession row that has not expired. No auth config
 * import, which keeps the proxy bundle small.
 *
 * `secret` falls back the same way lib/auth.ts does: `BETTER_AUTH_SECRET`,
 * then `AUTH_SECRET` (today's Vercel var keeps working).
 */
export async function viewerIdFromRequest(req: NextRequest): Promise<string | null> {
  try {
    const secret = authSecret();
    const cached = await getCookieCache(req, { secret });
    if (typeof cached?.user?.id === "string") return cached.user.id;
    const cookie = getSessionCookie(req);
    if (!cookie || !secret) return null;
    const token = await verifiedSessionToken(cookie, secret);
    if (!token) return null;
    const session = await db.authSession.findUnique({ where: { token }, select: { userId: true, expiresAt: true } });
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    return session.userId;
  } catch {
    return null;
  }
}

export async function viewerIsTripMember(tripId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const m = await db.tripMember.findFirst({ where: { tripId, userId }, select: { userId: true } });
  return m != null;
}
