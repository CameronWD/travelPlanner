const DAY_PATH = /^\/trips\/[^/]+\/day\/(\d{4}-\d{2}-\d{2})$/;

/**
 * The date of the Day page at this address, or null. The Day page reads its
 * date from a rewrite (lib/trip-route.ts), so on the client neither
 * `useParams()` nor `useSearchParams()` carries it: the address does.
 */
export function dayFromPathname(pathname: string): string | null {
  return DAY_PATH.exec(pathname)?.[1] ?? null;
}
