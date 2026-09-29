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
export function tripPath(ref: string, sub = ""): string {
  if (sub !== "" && !/^[/?#]/.test(sub)) {
    throw new Error(`tripPath: sub must start with "/", "?" or "#" (got "${sub}")`);
  }
  return `/trips/${encodeURIComponent(ref)}${sub}`;
}
