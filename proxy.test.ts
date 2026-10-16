import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { config, proxy as fullProxy } from "./proxy";
import { REQUEST_PATH_HEADER } from "./lib/auth/sign-in-href";

// The trip branch of `proxy` lazy-imports Prisma through lib/trip-ref; stub
// it so this file keeps never loading a database. A null viewer is the
// signed-out case the request-path header exists for.
vi.mock("@/lib/trip-ref", () => ({
  resolveTripRef: vi.fn(),
  viewerIdFromRequest: vi.fn(async () => null),
  viewerIsTripMember: vi.fn(async () => false),
}));

const ORIGIN = "https://travel-planner-nine-olive.vercel.app";

/** The header the page will actually receive (response.js `handleMiddlewareField`). */
function forwardedPath(response: Response): string | null {
  return response.headers.get(`x-middleware-request-${REQUEST_PATH_HEADER}`);
}

describe("proxy — matcher", () => {
  it("runs on trip pages (slug resolution, ADR 0064) and on every other signed-in route (request path)", () => {
    expect(config.matcher).toEqual([
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
});
