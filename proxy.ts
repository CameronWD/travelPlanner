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

export function proxy(request: NextRequest): NextResponse {
  const { origin, searchParams } = request.nextUrl;

  const poisonedCookies = CALLBACK_URL_COOKIES.filter((name) => {
    const value = request.cookies.get(name)?.value;
    return !!value && !isValidHttpUrl(value, origin);
  });

  const param = searchParams.get("callbackUrl");
  const poisonedParam = !!param && !isValidHttpUrl(param, origin);

  if (poisonedCookies.length === 0 && !poisonedParam) {
    return NextResponse.next();
  }

  const headers = new Headers(request.headers);
  if (poisonedCookies.length > 0) {
    const kept = stripCookies(request.headers.get("cookie") ?? "", poisonedCookies);
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
