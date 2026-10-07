import type { Route } from "next";

/**
 * The one way to build an internal Trip page URL (ADR 0064). A test fails on
 * hand-built `/trips/${…}` links anywhere else (lib/trip-links.guard.test.ts).
 *
 * `ref` is the Trip's current slug. When no slug is known — a Trip created by
 * the previous build during a deploy's migrate-then-build window — pass its id:
 * the proxy redirects a member from an id to the slug, so a fallback costs one
 * hop and never breaks. `sub` is "" or starts with "/", "?" or "#".
 *
 * Not for `revalidatePath`: that takes the rewrite's destination (the id path),
 * and not for `/api/trips/[tripId]/…` routes, which stay on ids.
 */
export function tripPath(ref: string, sub = ""): Route {
  if (sub !== "" && !/^[/?#]/.test(sub)) {
    throw new Error(`tripPath: sub must start with "/", "?" or "#" (got "${sub}")`);
  }
  // Runtime-built, so cast once here: every Trip URL goes through this function (ADR 0064).
  return `/trips/${encodeURIComponent(ref)}${sub}` as Route;
}

/**
 * A page under a Trip URL `tripPath` already built — for the pure engines
 * handed that base rather than the ref (next-steps, sort-these-out, Flags):
 * `tripSubPath(base, "/plan")`. `sub` follows tripPath's rule.
 */
export function tripSubPath(base: string, sub: string): Route {
  if (sub !== "" && !/^[/?#]/.test(sub)) {
    throw new Error(`tripSubPath: sub must start with "/", "?" or "#" (got "${sub}")`);
  }
  // Same cast as tripPath: `base` came from it, so the result is a Trip URL.
  return `${base}${sub}` as Route;
}
