/** Auth.js sends a refused Google account to `/?error=AccessDenied`
 * (lib/auth.ts pages.error). Only that value opens the denied panel; every
 * other error except Verification (below) is ignored, as the retired /signin
 * page did. */
export function isAccessDenied(error: string | string[] | undefined): boolean {
  return Array.isArray(error) ? error.includes("AccessDenied") : error === "AccessDenied";
}

/** A Sign-in link that was already used, expired, or tampered with comes
 * back as `/?error=Verification` (Auth.js's `Verification` error from the
 * email callback). Open the panel so the Traveller can ask for a fresh one
 * instead of landing on a silent hero (spec 2026-10-01 §B3). */
export function isLinkExpired(error: string | string[] | undefined): boolean {
  return Array.isArray(error) ? error.includes("Verification") : error === "Verification";
}
