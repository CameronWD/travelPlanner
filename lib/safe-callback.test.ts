import { describe, it, expect } from "vitest";
import { safeCallbackPath, panelFromParam } from "./safe-callback";

describe("safeCallbackPath", () => {
  it("keeps a same-origin path with its query", () => {
    expect(safeCallbackPath("/trips/new?fromShare=abc")).toBe("/trips/new?fromShare=abc");
    expect(safeCallbackPath(["/trips", "/x"])).toBe("/trips");
    expect(safeCallbackPath("/trips#top")).toBe("/trips#top");
    expect(safeCallbackPath("/")).toBe("/");
  });
  it.each([
    // off-site: schemes and protocol-relative
    "//evil.example",
    "///evil.example",
    "https://evil.example/",
    "http://evil.example/",
    "HTTPS://evil.example/",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    // backslash tricks (browsers read "\" as "/" in http(s) URLs)
    "/\\evil.example",
    "\\/evil.example",
    "\\\\evil.example",
    "/trips\\..\\..\\/evil",
    // encoded variants (a second decode would turn them into the above)
    "/%2F%2Fevil.example",
    "/%2f/evil.example",
    "/%5Cevil.example",
    "/%5cevil.example",
    "%2F%2Fevil.example",
    "/%252F%252Fevil.example",
    // dot segments that normalise into "//host"
    "/.//evil.example",
    "/..//evil.example",
    "/x/..//evil.example",
    // control characters and whitespace
    "/trips\n/x",
    "/\t/evil.example",
    "/\r\n/evil.example",
    " /trips",
    "/trips x",
    "/\u0000/evil.example",
    "/\u007f",
    "/ /evil.example",
    "/ /evil.example",
    // not a path
    "trips",
    "evil.example",
    "",
    "?x=1",
    "#x",
  ])("drops %j", (raw) => {
    expect(safeCallbackPath(raw)).toBeNull();
  });
  it("drops undefined and an empty array", () => {
    expect(safeCallbackPath(undefined)).toBeNull();
    expect(safeCallbackPath([])).toBeNull();
  });
  it("reads only the first value of a repeated param", () => {
    expect(safeCallbackPath(["//evil.example", "/trips"])).toBeNull();
  });
});

describe("safeCallbackPath through Auth.js's default redirect callback", () => {
  // @auth/core's default: `url.startsWith("/") ? baseUrl + url : …`. Whatever
  // we accept must still resolve on our own origin after that concatenation.
  const baseUrl = "https://teepee.example";
  it.each(["/trips/new?fromShare=abc", "/trips#top", "/", "/a/b/../c?x=%2F%2F"])("%j stays on-site", (raw) => {
    const out = safeCallbackPath(raw);
    expect(out).not.toBeNull();
    expect(out!.startsWith("/")).toBe(true);
    expect(new URL(`${baseUrl}${out}`).origin).toBe(baseUrl);
  });
});

describe("panelFromParam", () => {
  it("reads sign-in or request, ignores anything else", () => {
    expect(panelFromParam("request")).toBe("request");
    expect(panelFromParam(["sign-in"])).toBe("sign-in");
    expect(panelFromParam("denied")).toBeUndefined();
    expect(panelFromParam(undefined)).toBeUndefined();
  });
});
