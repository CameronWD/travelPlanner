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
});
