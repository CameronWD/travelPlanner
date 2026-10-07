import { createHash } from "node:crypto";
import type { Route } from "next";

/**
 * Share-page attribution (SHARE.md §2): a hash prefix of the token, so a
 * sign-up can be traced to "a share page" without the raw bearer token ever
 * landing in a URL, a log or an analytics tool.
 */
export function shareRefParam(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 10);
}

export interface ShareHrefs {
  requestAccess: Route;
  useRoute: Route;
  fromScratch: Route;
}

/** The invite-only door (ADR 0057): every CTA goes through the Landing. */
export function shareHrefs(token: string): ShareHrefs {
  const ref = `ref=share&t=${shareRefParam(token)}`;
  const signIn = (callbackUrl: string): Route =>
    `/?panel=sign-in&${ref}&callbackUrl=${encodeURIComponent(callbackUrl)}`;
  return {
    requestAccess: `/?panel=request&${ref}`,
    // Carries the raw token by necessity: New trip needs it to copy the route.
    useRoute: signIn(`/trips/new?fromShare=${encodeURIComponent(token)}`),
    fromScratch: signIn("/trips/new"),
  };
}
