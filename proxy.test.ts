import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { config, authCallbackCookieGuard as proxy, proxy as fullProxy } from "./proxy";
import { REQUEST_PATH_HEADER } from "./lib/sign-in-href";

// The trip branch of `proxy` lazy-imports Prisma through lib/trip-ref; stub
// it so this file keeps never loading a database. A null viewer is the
// signed-out case the request-path header exists for.
vi.mock("@/lib/trip-ref", () => ({
  resolveTripRef: vi.fn(),
  viewerIdFromRequest: vi.fn(async () => null),
  viewerIsTripMember: vi.fn(async () => false),
}));

const COOKIE = "__Secure-authjs.callback-url";
const ORIGIN = "https://travel-planner-nine-olive.vercel.app";

function request(opts: { cookie?: string } = {}): NextRequest {
  return new NextRequest(`${ORIGIN}/api/auth/signin`, {
    headers: opts.cookie ? { cookie: opts.cookie } : {},
  });
}

/** The cookie header the Auth.js handler will actually receive. */
function forwardedCookie(response: Response): string | null {
  return response.headers.get("x-middleware-request-cookie");
}

describe("proxy — Auth.js callback-url guard", () => {
  it("passes through a request with no cookies untouched", () => {
    const response = proxy(request());
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("leaves a valid absolute callback-url cookie alone", () => {
    const cookie = `${COOKIE}=${ORIGIN}/trips`;
    const response = proxy(request({ cookie }));
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(forwardedCookie(response)).toBeNull();
  });

  it("leaves a valid root-relative callback-url cookie alone", () => {
    const response = proxy(request({ cookie: `${COOKIE}=/trips` }));
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("strips a malformed callback-url cookie from the forwarded request", () => {
    const response = proxy(request({ cookie: `${COOKIE}=garbage` }));
    expect(forwardedCookie(response)).toBe("");
  });

  it("expires the malformed cookie in the browser", () => {
    const response = proxy(request({ cookie: `${COOKIE}=garbage` }));
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${COOKIE}=`);
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Secure");
  });

  it("detects, strips and expires a cookie value with invalid percent-encoding", () => {
    // "100%" is not valid percent-encoding (a lone `%` with no hex digits
    // following). `request.cookies.get()` (@edge-runtime/cookies) fails to
    // decode it and drops the cookie from its map entirely, so a naive guard
    // built on `.get()` would see nothing here and let it through — while
    // @auth/core's own parser falls back to the raw "100%" and still 500s.
    const response = proxy(request({ cookie: `${COOKIE}=100%` }));
    expect(forwardedCookie(response)).toBe("");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${COOKIE}=`);
    expect(setCookie).toContain("Max-Age=0");
  });

  it("leaves a valid percent-encoded callback-url cookie alone", () => {
    // "%2Ftrips" decodes cleanly to "/trips", a valid root-relative URL.
    const response = proxy(request({ cookie: `${COOKIE}=%2Ftrips` }));
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(forwardedCookie(response)).toBeNull();
  });

  it("keeps other cookies, with their original encoding, when stripping", () => {
    const response = proxy(
      request({
        cookie: `__Host-authjs.csrf-token=abc%7Cdef; ${COOKIE}=garbage; keep=1`,
      }),
    );
    const forwarded = forwardedCookie(response);
    expect(forwarded).toContain("__Host-authjs.csrf-token=abc%7Cdef");
    expect(forwarded).toContain("keep=1");
    expect(forwarded).not.toContain("garbage");
  });

  it("also guards the non-secure cookie name used over http", () => {
    const insecure = new NextRequest("http://localhost:3000/api/auth/signin", {
      headers: { cookie: "authjs.callback-url=garbage" },
    });
    const response = proxy(insecure);
    expect(forwardedCookie(response)).toBe("");
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });

  it("ignores an empty cookie value, matching @auth/core", () => {
    const response = proxy(request({ cookie: `${COOKIE}=` }));
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("runs on the Auth.js routes, on trip pages (slug resolution, ADR 0064) and on every other signed-in route (request path)", () => {
    expect(config.matcher).toEqual([
      "/api/auth/:path*",
      "/trips",
      "/trips/:ref/:path*",
      "/globe/:path*",
      "/account/:path*",
      "/help/:path*",
      "/whats-new/:path*",
      "/admin/:path*",
    ]);
  });
});

/** The header the page will actually receive (response.js `handleMiddlewareField`). */
function forwardedPath(response: Response): string | null {
  return response.headers.get(`x-middleware-request-${REQUEST_PATH_HEADER}`);
}

describe("proxy — request path header (spec 2026-10-01 §E)", () => {
  it("forwards pathname + search on a signed-in route outside /trips", async () => {
    const response = await fullProxy(new NextRequest(`${ORIGIN}/globe?tab=2`));
    expect(forwardedPath(response)).toBe("/globe?tab=2");
    expect(response.headers.get("x-middleware-override-headers")).toContain(REQUEST_PATH_HEADER);
  });

  it("forwards it on the trips list and on a trip page for a signed-out visitor, with no rewrite", async () => {
    expect(forwardedPath(await fullProxy(new NextRequest(`${ORIGIN}/trips`)))).toBe("/trips");
    const response = await fullProxy(new NextRequest(`${ORIGIN}/trips/kyoto/plan?day=3`));
    expect(forwardedPath(response)).toBe("/trips/kyoto/plan?day=3");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("overwrites a client-supplied value", async () => {
    const response = await fullProxy(
      new NextRequest(`${ORIGIN}/account`, { headers: { [REQUEST_PATH_HEADER]: "/evil" } }),
    );
    expect(forwardedPath(response)).toBe("/account");
  });

  it("leaves the Auth.js routes to the cookie guard, which does not set it", async () => {
    const response = await fullProxy(new NextRequest(`${ORIGIN}/api/auth/session`));
    expect(forwardedPath(response)).toBeNull();
  });
});
