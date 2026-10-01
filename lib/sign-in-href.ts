import { safeCallbackPath } from "@/lib/safe-callback";

/**
 * Request header proxy.ts sets to the requested pathname + search, so a
 * server layout or guard can learn the page it is rendering (Next gives a
 * server component no URL of its own; `referer` is never trusted).
 */
export const REQUEST_PATH_HEADER = "x-request-path";

/**
 * Where a signed-out visitor is sent: the Landing, carrying the page they
 * asked for as `callbackUrl` so sign-in returns them there (spec 2026-10-01
 * §E). Only a same-origin path survives — the value may be absent or, on an
 * unmatched route, client-supplied — and the Landing checks it again.
 */
export function signInHref(requestPath: string | null | undefined): string {
  const path = safeCallbackPath(requestPath ?? undefined);
  if (!path || path === "/") return "/";
  return `/?callbackUrl=${encodeURIComponent(path)}`;
}
