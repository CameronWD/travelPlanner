import { tripPath } from "@/lib/trip-path";
import { RESERVED_TRIP_SLUGS } from "@/lib/trip-slug";

/**
 * The route boundary's decision for a /trips/<ref>/… request (ADR 0064).
 * Pure: the proxy supplies `resolve` (DB) and `isMember` (session + DB).
 *
 * - Current slug → rewrite to the id route, so every page, loader, guard and
 *   server action keeps working in ids, and `revalidatePath` keeps taking the
 *   id path (a rewrite's destination).
 * - Old slug or bare cuid → 308 to the current slug, preserving the rest of
 *   the path and the query — only for a signed-in member on a GET/HEAD. Anyone
 *   else is served exactly as before (the layout's requireTripAccess 404s), so
 *   a slug confirms nothing a cuid did not; a POST (server action) is never
 *   redirected.
 */
export interface ResolvedTripRef {
  id: string;
  slug: string | null;
}

export type TripRouteDecision =
  | { kind: "pass" }
  | { kind: "rewrite"; pathname: string }
  | { kind: "redirect"; location: string };

const TRIP_PATH = /^\/trips\/([^/]+)(\/.*)?$/;

export async function decideTripRoute(i: {
  pathname: string;
  search: string;
  method: string;
  resolve: (ref: string) => Promise<ResolvedTripRef | null>;
  isMember: (tripId: string) => Promise<boolean>;
}): Promise<TripRouteDecision> {
  const m = TRIP_PATH.exec(i.pathname);
  if (!m) return { kind: "pass" };
  let ref: string;
  try {
    ref = decodeURIComponent(m[1]);
  } catch {
    return { kind: "pass" };
  }
  const rest = m[2] ?? "";
  if (RESERVED_TRIP_SLUGS.has(ref)) return { kind: "pass" };

  const trip = await i.resolve(ref);
  if (!trip) return { kind: "pass" };

  const isRead = i.method === "GET" || i.method === "HEAD";
  if (trip.slug && ref !== trip.slug && isRead && (await i.isMember(trip.id))) {
    return { kind: "redirect", location: `${tripPath(trip.slug, rest)}${i.search}` };
  }
  if (ref === trip.id) return { kind: "pass" };
  return { kind: "rewrite", pathname: tripPath(trip.id, rest) };
}
