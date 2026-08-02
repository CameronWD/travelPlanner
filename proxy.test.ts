import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { config, proxy } from "./proxy";

const COOKIE = "__Secure-authjs.callback-url";
const ORIGIN = "https://travel-planner-nine-olive.vercel.app";

function request(opts: { path?: string; cookie?: string } = {}): NextRequest {
  return new NextRequest(`${ORIGIN}${opts.path ?? "/api/auth/signin"}`, {
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

  it("strips a malformed callbackUrl query param", () => {
    const response = proxy(request({ path: "/api/auth/signin?callbackUrl=trips" }));
    const rewrite = response.headers.get("x-middleware-rewrite") ?? "";
    expect(rewrite).not.toContain("callbackUrl");
  });

  it("leaves a valid callbackUrl query param alone", () => {
    const response = proxy(request({ path: "/api/auth/signin?callbackUrl=/trips" }));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("only runs on the Auth.js routes", () => {
    expect(config.matcher).toEqual(["/api/auth/:path*"]);
  });
});
