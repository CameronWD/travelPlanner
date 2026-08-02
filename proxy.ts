import { NextResponse, type NextRequest } from "next/server";

/**
 * Guard against a poisoned Auth.js callback-url cookie.
 *
 * `assertConfig()` in @auth/core re-validates the `callback-url` cookie on
 * EVERY /api/auth/* request, and bails out with `InvalidCallbackUrl` if it
 * isn't a valid http(s) URL. That failure renders the "There is a problem
 * with the server configuration" page — so one malformed cookie locks that
 * browser out of signing in permanently, because the browser keeps resending
 * it on every request.
 *
 * We strip the malformed value before the handler sees it, and expire the cookie
 * so it doesn't come back. Valid values are passed through untouched.
 *
 * Scope gap (deliberate): `assertConfig()` performs the same check against a
 * `?callbackUrl=` query param, and this proxy does NOT guard it. It can't:
 * for App Router route handlers, Next restores the *original* request URL
 * before invoking the handler (`node_modules/next/dist/server/next-server.js`,
 * around line 690 — "Restore original URL as the handler handles it's own
 * parsing") and re-merges the original query params
 * (`base-server.js` ~line 903). @auth/core reads `new URL(req.url)` itself
 * (`@auth/core/lib/utils/web.js`), so it sees the pre-rewrite query
 * regardless of anything this proxy does to `request.nextUrl` — verified on
 * a real build: `GET /api/auth/session?callbackUrl=trips` still 500s despite
 * the proxy emitting `x-middleware-rewrite`. A `NextResponse.rewrite` simply
 * cannot reach the handler for this. This is acceptable because the query
 * param case is transient (one bad request 500s; the next request without
 * the param is fine) whereas the cookie is sticky (the browser resends it
 * forever until something clears it). Do not "fix" this with a rewrite —
 * it has already been tried and verified not to work.
 *
 * Scope gap (deliberate): this proxy's matcher only covers `/api/auth/:path*`
 * (see `config` below). `auth()` calls made directly from page routes (e.g.
 * `app/(app)/layout.tsx:48`, `lib/guards.ts:15`) run outside that matcher, so
 * a poisoned cookie still silently signs the user out of app pages — those
 * calls hit the same `assertConfig()` failure, but the page-side session
 * fetch swallows it into "no session" rather than surfacing a 500, so the
 * user just looks logged out. That lasts until their next sign-in click: at
 * that point `next-auth/react`'s `signIn` fetches `/api/auth/csrf`, which IS
 * matched, and this guard cleans the cookie there. Widening the matcher to
 * every request to close this gap is not worth the cost of running on every
 * page load; this is accepted, not a bug to fix.
 */

export const CALLBACK_URL_COOKIES = [
  "__Secure-authjs.callback-url",
  "authjs.callback-url",
];

/**
 * Mirrors `isValidHttpUrl` in @auth/core/src/lib/utils/assert.ts. Keep these in
 * lockstep: if this is stricter we break legitimate redirects, and if it's
 * looser the bad value reaches the handler and the 500 comes back. Both
 * directions of predicate drift degrade gracefully though — fail-open just
 * reinstates the original bug for one value, and fail-closed only costs a
 * post-login redirect target (login itself still works). The genuinely
 * dangerous drift is elsewhere: if @auth/core ever renames the callback-url
 * cookie (see `CALLBACK_URL_COOKIES` above, and `defaultCookies()` in
 * `@auth/core/lib/utils/cookie.ts`), this guard silently becomes a no-op —
 * it would keep checking a cookie name @auth/core no longer sets or reads,
 * and the 500-lockout bug would come back with nothing here to signal it.
 * `proxy.contract.test.ts` pins the current cookie names against the
 * installed package so a dependency bump on that front fails loudly.
 */
export function isValidHttpUrl(url: string, baseUrl: string): boolean {
  try {
    return /^https?:/.test(
      new URL(url, url.startsWith("/") ? baseUrl : undefined).protocol,
    );
  } catch {
    return false;
  }
}

/**
 * Drop the named cookies from a raw Cookie header. Operates on the raw string
 * rather than re-serialising parsed cookies, so surviving cookies keep their
 * original percent-encoding.
 */
function stripCookies(rawCookieHeader: string, names: string[]): string {
  return rawCookieHeader
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair && !names.includes(pair.split("=")[0].trim()))
    .join("; ");
}

const TRIM_SPACE_TAB = /^[ \t]+|[ \t]+$/g;

/**
 * Extract a single cookie's still-encoded value from a raw `Cookie` header,
 * trimming surrounding spaces/tabs around the key and value the way
 * @auth/core's vendored cookie parser does (lib/vendored/cookie.ts,
 * `startIndex`/`endIndex`). That parser does not strip surrounding quotes,
 * so neither do we.
 *
 * We deliberately do NOT use `request.cookies.get()` for this: it's backed
 * by `@edge-runtime/cookies`, which decodes the value eagerly and DROPS the
 * cookie entirely if `decodeURIComponent` throws. A cookie with invalid
 * percent-encoding (e.g. a lone `%`) would then look absent to us, while
 * @auth/core's parser hits the same decode failure but falls back to the
 * raw string instead of dropping it, and still feeds that raw string to
 * `isValidHttpUrl`. Reading the header ourselves keeps our view in sync
 * with what the handler actually sees.
 */
function rawCookieValue(rawCookieHeader: string, name: string): string | undefined {
  for (const pair of rawCookieHeader.split(";")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).replace(TRIM_SPACE_TAB, "");
    if (key !== name) continue;
    return pair.slice(eqIdx + 1).replace(TRIM_SPACE_TAB, "");
  }
  return undefined;
}

/**
 * Mirrors `decode()` in @auth/core/src/lib/vendored/cookie.ts exactly: skip
 * the native call when there's no `%` (a perf shortcut in the original), and
 * on a decode failure fall back to the raw string rather than throwing. This
 * fallback is exactly what `request.cookies.get()` lacks — it drops the
 * cookie instead of falling back, which is the bug this function exists to
 * avoid reproducing.
 */
function decodeCookieValue(value: string): string {
  if (value.indexOf("%") === -1) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function proxy(request: NextRequest): NextResponse {
  const { origin } = request.nextUrl;
  const rawCookieHeader = request.headers.get("cookie") ?? "";

  const poisonedCookies = CALLBACK_URL_COOKIES.filter((name) => {
    const raw = rawCookieValue(rawCookieHeader, name);
    if (!raw) return false;
    return !isValidHttpUrl(decodeCookieValue(raw), origin);
  });

  if (poisonedCookies.length === 0) {
    return NextResponse.next();
  }

  const headers = new Headers(request.headers);
  const kept = stripCookies(rawCookieHeader, poisonedCookies);
  headers.set("cookie", kept);

  const response = NextResponse.next({ request: { headers } });

  for (const name of poisonedCookies) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: name.startsWith("__Secure-"),
    });
  }

  return response;
}

export const config = {
  matcher: ["/api/auth/:path*"],
};
