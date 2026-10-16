import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_PATH_HEADER } from "@/lib/auth/sign-in-href";

/**
 * One proxy, two jobs (Next allows a single proxy.ts):
 * - Every signed-in route: forward the requested pathname + search as the
 *   `x-request-path` request header (lib/auth/sign-in-href.ts), so a signed-out
 *   guard can send the visitor to the Landing with a callbackUrl back here
 *   (spec 2026-10-01 §E). Set before any other decision and overwriting
 *   whatever the client sent.
 * - /trips/<ref>/*: resolve a Trip's slug to its id once, at the route boundary
 *   (ADR 0064; lib/trip-route.ts has the decision table). The DB modules are
 *   imported lazily so the auth guard's path — and its tests — never load Prisma.
 *
 * The Auth.js callback-url cookie guard that used to run on `/api/auth/*`
 * here is gone (ADR 0071): Better Auth doesn't have that cookie or its
 * `assertConfig()` failure mode, so there's nothing to guard against.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  const headers = new Headers(request.headers);
  headers.set(REQUEST_PATH_HEADER, pathname + search);
  const forward = { request: { headers } };
  if (!pathname.startsWith("/trips/")) return NextResponse.next(forward);

  const [{ decideTripRoute }, { resolveTripRef, viewerIdFromRequest, viewerIsTripMember }] = await Promise.all([
    import("@/lib/trip-route"),
    import("@/lib/trip-ref"),
  ]);
  // Signed out: nothing to rewrite or redirect for (see decideTripRoute), so
  // skip the lookups too — no DB work, and no timing difference between a real
  // slug and an unknown one.
  const viewerId = await viewerIdFromRequest(request);
  if (!viewerId) return NextResponse.next(forward);
  const decision = await decideTripRoute({
    pathname,
    search,
    method: request.method,
    resolve: resolveTripRef,
    isMember: (tripId) => viewerIsTripMember(tripId, viewerId),
  });
  if (decision.kind === "redirect") return NextResponse.redirect(new URL(decision.location, request.url), 308);
  if (decision.kind === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname;
    return NextResponse.rewrite(url, forward);
  }
  return NextResponse.next(forward);
}

export const config = {
  matcher: [
    "/trips",
    "/trips/:ref/:path*",
    "/globe/:path*",
    "/account/:path*",
    "/help/:path*",
    "/whats-new/:path*",
    "/admin/:path*",
  ],
};
