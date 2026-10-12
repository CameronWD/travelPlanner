/** The codes Better Auth's magic-link and OAuth callback flows redirect a
 * refused sign-in to `/?error=<code>` with (ADR 0071; lib/sign-in-door.ts):
 * - `AccessDenied`: the door's own refusal, from `validateUserInfo` — a new
 *   magic-link User or a Google sign-in whose profile/allowlist check fails
 *   (lib/auth.ts `ACCESS_DENIED`).
 * - `failed_to_create_session`: a *returning* magic-link User refused by
 *   `databaseHooks.session.create.before` (e.g. a revoked allowlist entry) —
 *   `validateUserInfo` doesn't re-run for a returning link User, so this is
 *   that same door asking a second time, just later in the pipeline.
 * - `unable_to_create_session`: the same `session.create.before` refusal,
 *   reached via the Google/OAuth callback path instead.
 * Any other error value is ignored, as the retired /signin page did. */
const DENIED_CODES = ["AccessDenied", "failed_to_create_session", "unable_to_create_session"];

export function isAccessDenied(error: string | string[] | undefined): boolean {
  const values = Array.isArray(error) ? error : [error];
  return values.some((value) => value != null && DENIED_CODES.includes(value));
}

/** A Sign-in link that was already used, expired, or tampered with comes
 * back as `/?error=INVALID_TOKEN` (Better Auth's magic-link plugin, ADR
 * 0071). `Verification` is kept for compatibility with any link sent before
 * the Auth.js → Better Auth cutover. Open the panel so the Traveller can ask
 * for a fresh one instead of landing on a silent hero (spec 2026-10-01 §B3). */
export function isLinkExpired(error: string | string[] | undefined): boolean {
  const values = Array.isArray(error) ? error : [error];
  return values.some((value) => value === "INVALID_TOKEN" || value === "Verification");
}
