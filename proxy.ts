import { NextResponse, type NextRequest } from "next/server";

/**
 * Guard against a poisoned Auth.js callback-url.
 *
 * `assertConfig()` in @auth/core re-validates the `callback-url` cookie and the
 * `?callbackUrl=` query param on EVERY /api/auth/* request, and bails out with
 * `InvalidCallbackUrl` if either isn't a valid http(s) URL. That failure renders
 * the "There is a problem with the server configuration" page — so one malformed
 * cookie locks that browser out of signing in permanently, because the browser
 * keeps resending it.
 *
 * We strip the malformed value before the handler sees it, and expire the cookie
 * so it doesn't come back. Valid values are passed through untouched.
 */

const CALLBACK_URL_COOKIES = [
  "__Secure-authjs.callback-url",
  "authjs.callback-url",
];

/**
 * Mirrors `isValidHttpUrl` in @auth/core/src/lib/utils/assert.ts. Keep these in
 * lockstep: if this is stricter we break legitimate redirects, and if it's
 * looser the bad value reaches the handler and the 500 comes back.
 */
function isValidHttpUrl(url: string, baseUrl: string): boolean {
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
  const { origin, searchParams } = request.nextUrl;
  const rawCookieHeader = request.headers.get("cookie") ?? "";

  const poisonedCookies = CALLBACK_URL_COOKIES.filter((name) => {
    const raw = rawCookieValue(rawCookieHeader, name);
    if (!raw) return false;
    return !isValidHttpUrl(decodeCookieValue(raw), origin);
  });

  const param = searchParams.get("callbackUrl");
  const poisonedParam = !!param && !isValidHttpUrl(param, origin);

  if (poisonedCookies.length === 0 && !poisonedParam) {
    return NextResponse.next();
  }

  const headers = new Headers(request.headers);
  if (poisonedCookies.length > 0) {
    const kept = stripCookies(rawCookieHeader, poisonedCookies);
    headers.set("cookie", kept);
  }

  // A rewrite (not a redirect) keeps the method and body intact, which matters
  // because the sign-in flow POSTs to /api/auth/signin/<provider>.
  let response: NextResponse;
  if (poisonedParam) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("callbackUrl");
    response = NextResponse.rewrite(url, { request: { headers } });
  } else {
    response = NextResponse.next({ request: { headers } });
  }

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
