import { createHash, randomBytes } from "node:crypto";

/**
 * Claude's side of the OAuth connection (ADR 0071), driven against
 * authServer.handler in process: dev login for a session cookie, dynamic
 * client registration as a public PKCE client, authorise, consent, code for
 * tokens, refresh and revoke. The same steps Claude takes, minus the browser.
 *
 * Used by test/integration/mcp.test.ts (real Postgres, through
 * lib/auth-prisma.ts) and lib/auth-mcp-access.test.ts (in-memory adapter).
 */
export type AuthHandler = (req: Request) => Promise<Response>;

export type TokenSet = { access_token: string; refresh_token?: string; token_type: string; expires_in: number; scope?: string };

/** Claude's own OAuth callback, as a web client registers it (https is required). */
export const REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

const cookieHeader = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

async function expectOk(res: Response, step: string): Promise<Response> {
  if (res.status >= 400) throw new Error(`${step}: HTTP ${res.status} ${await res.text()}`);
  return res;
}

function form(base: string, path: string, fields: Record<string, string>): Request {
  return new Request(`${base}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(fields).toString(),
  });
}

/** Signs `email` (an existing User) in through the dev-login door; returns the Cookie header. */
export async function devLoginCookie(handler: AuthHandler, base: string, email: string): Promise<string> {
  const res = await expectOk(
    await handler(
      new Request(`${base}/api/auth/dev-login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({ email }),
      }),
    ),
    "dev-login",
  );
  return cookieHeader(res);
}

/** The raw RFC 7591 registration request for a public client (assert on the response yourself). */
export function registerRequest(
  base: string,
  opts: { name?: string; redirectUris?: string[]; applicationType?: "web" | "native" } = {},
): Request {
  return new Request(`${base}/api/auth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: opts.name ?? "Claude",
      redirect_uris: opts.redirectUris ?? [REDIRECT_URI],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      ...(opts.applicationType ? { application_type: opts.applicationType } : {}),
    }),
  });
}

/** RFC 7591 registration as a public client, the way Claude registers. */
export async function registerPublicClient(handler: AuthHandler, base: string, name = "Claude"): Promise<string> {
  const res = await expectOk(await handler(registerRequest(base, { name })), "register");
  const body = (await res.json()) as { client_id: string };
  return body.client_id;
}

/**
 * GET /oauth2/authorize with the session cookie, which redirects to the
 * consent page (/connect) with a signed query. Returns that query.
 */
export async function authorize(
  handler: AuthHandler,
  base: string,
  opts: { cookie: string; clientId: string; resource: string; challenge: string; state?: string; redirectUri?: string },
): Promise<{ location: string; consentQuery: string }> {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri ?? REDIRECT_URI,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    state: opts.state ?? "st-1",
    resource: opts.resource,
  });
  const res = await handler(new Request(`${base}/api/auth/oauth2/authorize?${params}`, { headers: { cookie: opts.cookie } }));
  const location = res.headers.get("location");
  if (res.status !== 302 || !location) throw new Error(`authorize: HTTP ${res.status} ${location ?? (await res.text())}`);
  const url = new URL(location, base);
  return { location, consentQuery: url.search.slice(1) };
}

/** POST /oauth2/consent as the consent page does; returns the redirect back to the client. */
export async function consent(
  handler: AuthHandler,
  base: string,
  opts: { cookie: string; consentQuery: string; accept: boolean },
): Promise<URL> {
  const res = await expectOk(
    await handler(
      new Request(`${base}/api/auth/oauth2/consent`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", cookie: opts.cookie, origin: base },
        body: JSON.stringify({ accept: opts.accept, oauth_query: opts.consentQuery }),
      }),
    ),
    "consent",
  );
  const body = (await res.json()) as { url?: string; redirect_uri?: string };
  const url = body.url ?? body.redirect_uri;
  if (!url) throw new Error(`consent: no redirect in ${JSON.stringify(body)}`);
  return new URL(url);
}

export async function exchangeCode(
  handler: AuthHandler,
  base: string,
  opts: { clientId: string; code: string; verifier: string; resource: string },
): Promise<TokenSet> {
  const res = await expectOk(
    await handler(
      form(base, "/oauth2/token", {
        grant_type: "authorization_code",
        client_id: opts.clientId,
        code: opts.code,
        code_verifier: opts.verifier,
        redirect_uri: REDIRECT_URI,
        resource: opts.resource,
      }),
    ),
    "token (authorization_code)",
  );
  return (await res.json()) as TokenSet;
}

export async function refreshTokens(
  handler: AuthHandler,
  base: string,
  opts: { clientId: string; refreshToken: string; resource: string },
): Promise<TokenSet> {
  const res = await expectOk(
    await handler(
      form(base, "/oauth2/token", {
        grant_type: "refresh_token",
        client_id: opts.clientId,
        refresh_token: opts.refreshToken,
        resource: opts.resource,
      }),
    ),
    "token (refresh_token)",
  );
  return (await res.json()) as TokenSet;
}

/** RFC 7009 revocation by the client. Returns the raw response. */
export async function revokeToken(
  handler: AuthHandler,
  base: string,
  opts: { clientId: string; token: string; hint: "access_token" | "refresh_token" },
): Promise<Response> {
  return handler(form(base, "/oauth2/revoke", { client_id: opts.clientId, token: opts.token, token_type_hint: opts.hint }));
}

export type ClaudeConnection = { clientId: string; cookie: string; tokens: TokenSet };

/** The whole first connection, start to finish, for an existing User `email`. */
export async function connectClaude(
  handler: AuthHandler,
  base: string,
  opts: { email: string; resource: string },
): Promise<ClaudeConnection> {
  const cookie = await devLoginCookie(handler, base, opts.email);
  const clientId = await registerPublicClient(handler, base);
  const { verifier, challenge } = pkcePair();
  const { consentQuery } = await authorize(handler, base, { cookie, clientId, resource: opts.resource, challenge });
  const back = await consent(handler, base, { cookie, consentQuery, accept: true });
  const code = back.searchParams.get("code");
  if (!code) throw new Error(`consent: no code in ${back}`);
  const tokens = await exchangeCode(handler, base, { clientId, code, verifier, resource: opts.resource });
  return { clientId, cookie, tokens };
}
