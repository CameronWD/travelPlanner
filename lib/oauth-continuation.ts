import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";

/**
 * Claude's sign-in passes through the Landing (ADR 0071). When /oauth2/authorize
 * finds no session it redirects to "/" (lib/auth/auth.ts `loginPage`) with the
 * authorise request in a signed query: `client_id`, `redirect_uri`, `state`,
 * PKCE, `resource`, plus `exp`, `ba_iat`, the signed-parameter list `ba_param`
 * and `sig`. After sign-in the Traveller must go back into that request, not
 * to /trips (Review Focus 5).
 *
 * The continuation is the authorise request itself, re-sent with the new
 * session: `/api/auth/oauth2/authorize?<the original parameters>`. A GET, so
 * every door can return to it (Google, the Sign-in link's callbackURL, dev
 * login). The provider's `/oauth2/continue` is a POST for its own
 * select-account and post-login steps and cannot be a redirect target.
 * authorize re-checks everything (client, redirect URI, PKCE), so the path is
 * never an open redirect, whatever the query says.
 */
export const OAUTH_AUTHORIZE_PATH = "/api/auth/oauth2/authorize";

/** Parameters the provider adds when it signs the query; not part of the authorise request. */
const SIGNING_PARAMS = ["sig", "exp", "ba_iat", "ba_pl", "ba_param"];

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export function toSearchParams(params: SearchParamsRecord): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) out.append(key, v);
  }
  return out;
}

/** True when the page was opened by the OAuth provider (an authorise request in a signed query). */
export function isOAuthQuery(params: URLSearchParams): boolean {
  return params.has("client_id") && params.has("sig");
}

/**
 * Just the signed part of the query (`sig` and every parameter `ba_param`
 * lists), the way the provider's client builds `oauth_query`: the page's
 * own parameters (`panel`, `error`) would break the signature.
 */
export function signedOAuthQuery(params: URLSearchParams): string | null {
  const signed = new Set(params.getAll("ba_param"));
  if (!params.has("sig") || signed.size === 0) return null;
  const out = new URLSearchParams();
  for (const [key, value] of params) if (key === "sig" || key === "ba_param" || signed.has(key)) out.append(key, value);
  return out.toString();
}

/**
 * Where sign-in should continue Claude's authorise request, and whether the
 * signed query still verifies (an expired one makes every sign-in POST fail:
 * the provider's client sends it along, and the server refuses it).
 * Null when the page was not opened by the OAuth provider.
 */
export async function oauthContinuation(
  params: URLSearchParams,
  secret: string,
): Promise<{ path: string; verified: boolean } | null> {
  if (!isOAuthQuery(params)) return null;
  const signed = signedOAuthQuery(params);
  const verified = signed !== null && (await verifyOAuthQueryParams(signed, secret));

  const source = new URLSearchParams(signed ?? params.toString());
  const request = new URLSearchParams();
  for (const [key, value] of source) {
    if (SIGNING_PARAMS.includes(key)) continue;
    if (key === "max_age") continue; // the Traveller has just signed in
    if (key === "prompt") {
      // Already satisfied by the sign-in; left in, authorise would send the
      // Traveller back here for ever.
      const rest = value.split(" ").filter((p) => p && p !== "login");
      if (rest.length) request.append(key, rest.join(" "));
      continue;
    }
    request.append(key, value);
  }
  return { path: `${OAUTH_AUTHORIZE_PATH}?${request}`, verified };
}
