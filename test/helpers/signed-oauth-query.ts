import { makeSignature } from "better-auth/crypto";

/**
 * The query the OAuth provider puts on its redirect to the Landing or the
 * consent page (@better-auth/oauth-provider signParams): the authorise
 * request plus `exp`, `ba_iat`, the signed-parameter list `ba_param` and an
 * HMAC `sig` over the sorted parameters.
 */
export async function signOAuthQuery(fields: Record<string, string>, secret: string, expiresInSeconds = 600): Promise<string> {
  const params = new URLSearchParams(fields);
  const now = Date.now();
  params.set("exp", String(Math.floor(now / 1000) + expiresInSeconds));
  params.set("ba_iat", String(now));
  for (const name of [...new Set([...params.keys(), "ba_param"])].sort()) params.append("ba_param", name);
  const canonical = new URLSearchParams(
    [...params.entries()].sort(([ka, va], [kb, vb]) => (ka < kb ? -1 : ka > kb ? 1 : va < vb ? -1 : va > vb ? 1 : 0)),
  );
  params.set("sig", await makeSignature(canonical.toString(), secret));
  return params.toString();
}
