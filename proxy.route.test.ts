import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Unit tests of `proxy()` itself for the /trips/* slug-resolution branch
 * (ADR 0064). `decideTripRoute` (lib/trip-route.ts) already has its own
 * exhaustive table-driven tests; these confirm the wiring in proxy.ts:
 * viewerIdFromRequest gates the DB lookups, and the decision it returns
 * becomes the right kind of NextResponse.
 *
 * @/lib/trip-ref is mocked wholesale (it's imported dynamically inside
 * `proxy()`, but vi.mock intercepts the specifier regardless of import
 * syntax) so no real getToken call or DB access happens here.
 */
const viewerIdFromRequest = vi.fn();
const resolveTripRef = vi.fn();
const viewerIsTripMember = vi.fn();
vi.mock("@/lib/trip-ref", () => ({
  viewerIdFromRequest: (...args: unknown[]) => viewerIdFromRequest(...args),
  resolveTripRef: (...args: unknown[]) => resolveTripRef(...args),
  viewerIsTripMember: (...args: unknown[]) => viewerIsTripMember(...args),
}));

const reportError = vi.fn();
vi.mock("@/lib/error-sink", () => ({ reportError: (...args: unknown[]) => reportError(...args) }));

const { proxy } = await import("./proxy");

const TRIP = { id: "cmtw8sgpw0001osqh3i54rx1o", slug: "christmas-in-europe-2026" };
const ORIGIN = "https://app.example.com";

function request(path: string, opts: { method?: string } = {}): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, { method: opts.method ?? "GET" });
}

describe("proxy() — /trips/* slug resolution wiring (ADR 0064)", () => {
  beforeEach(() => {
    viewerIdFromRequest.mockReset();
    resolveTripRef.mockReset();
    viewerIsTripMember.mockReset();
    reportError.mockReset();
  });

  it("a session lookup that fails answers 503 and reports it, never taking the signed-out branch", async () => {
    const err = new Error("db down");
    viewerIdFromRequest.mockRejectedValue(err);
    const response = await proxy(request("/trips/christmas-in-europe-2026/day/2026-12-26"));

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toContain("Try again");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(reportError).toHaveBeenCalledWith(err, { route: "proxy.ts", source: "server" });
    expect(resolveTripRef).not.toHaveBeenCalled();
  });

  it("a signed-out request passes through untouched, with no DB call", async () => {
    viewerIdFromRequest.mockResolvedValue(null);
    const response = await proxy(request("/trips/christmas-in-europe-2026/plan"));

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.status).not.toBe(308);
    expect(resolveTripRef).not.toHaveBeenCalled();
    expect(viewerIsTripMember).not.toHaveBeenCalled();
  });

  it("a member's GET on an old slug gets a 308 to the current slug, path and query preserved", async () => {
    viewerIdFromRequest.mockResolvedValue("user_1");
    resolveTripRef.mockResolvedValue(TRIP);
    viewerIsTripMember.mockResolvedValue(true);

    const response = await proxy(request("/trips/xmas-2026/day/2026-12-26?plan=f1"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/trips/christmas-in-europe-2026/day/2026-12-26?plan=f1`,
    );
  });

  it("a member's POST (server action) on an old slug is rewritten, not redirected", async () => {
    viewerIdFromRequest.mockResolvedValue("user_1");
    resolveTripRef.mockResolvedValue(TRIP);
    viewerIsTripMember.mockResolvedValue(true);

    const response = await proxy(request("/trips/xmas-2026/settings", { method: "POST" }));

    expect(response.status).not.toBe(308);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      `${ORIGIN}/trips/${TRIP.id}/settings`,
    );
  });

  it("a member's Day address is served by the one Day page with the date as d, the address and other query kept", async () => {
    viewerIdFromRequest.mockResolvedValue("user_1");
    resolveTripRef.mockResolvedValue(TRIP);
    viewerIsTripMember.mockResolvedValue(true);

    const response = await proxy(request("/trips/christmas-in-europe-2026/day/2026-12-26?map=1"));

    expect(response.headers.get("x-middleware-rewrite")).toBe(`${ORIGIN}/trips/${TRIP.id}/day?map=1&d=2026-12-26`);
  });

  it("a signed-out visitor's Day address reaches the Day page on the ref it gave, with no DB call", async () => {
    viewerIdFromRequest.mockResolvedValue(null);
    const response = await proxy(request("/trips/christmas-in-europe-2026/day/2026-12-26"));

    expect(response.headers.get("x-middleware-rewrite")).toBe(`${ORIGIN}/trips/christmas-in-europe-2026/day?d=2026-12-26`);
    expect(resolveTripRef).not.toHaveBeenCalled();
  });
});
