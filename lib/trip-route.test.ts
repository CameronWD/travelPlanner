import { describe, it, expect, vi } from "vitest";
import { decideTripRoute, type ResolvedTripRef } from "./trip-route";

const TRIP: ResolvedTripRef = { id: "cmtw8sgpw0001osqh3i54rx1o", slug: "christmas-in-europe-2026" };
const byRef: Record<string, ResolvedTripRef> = {
  "christmas-in-europe-2026": TRIP,
  "xmas-2026": TRIP, // an old slug
  cmtw8sgpw0001osqh3i54rx1o: TRIP,
  "cmnoslug000000000000000000": { id: "cmnoslug000000000000000000", slug: null },
};
function run(pathname: string, o: { search?: string; method?: string; member?: boolean } = {}) {
  const resolve = vi.fn(async (ref: string) => byRef[ref] ?? null);
  const isMember = vi.fn(async () => o.member ?? true);
  return { resolve, isMember, result: decideTripRoute({ pathname, search: o.search ?? "", method: o.method ?? "GET", resolve, isMember }) };
}

describe("decideTripRoute (ADR 0064)", () => {
  it("the current slug rewrites to the id route, keeping the rest of the path", async () => {
    expect(await run("/trips/christmas-in-europe-2026/day/2026-12-26").result).toEqual({ kind: "rewrite", pathname: "/trips/cmtw8sgpw0001osqh3i54rx1o/day/2026-12-26" });
    expect(await run("/trips/christmas-in-europe-2026").result).toEqual({ kind: "rewrite", pathname: "/trips/cmtw8sgpw0001osqh3i54rx1o" });
  });
  it("a bare cuid redirects a member to the current slug, preserving path and query", async () => {
    expect(await run("/trips/cmtw8sgpw0001osqh3i54rx1o/plan", { search: "?plan=f1" }).result).toEqual({ kind: "redirect", location: "/trips/christmas-in-europe-2026/plan?plan=f1" });
  });
  it("an old slug redirects a member to the current slug", async () => {
    expect(await run("/trips/xmas-2026/day/2026-12-26").result).toEqual({ kind: "redirect", location: "/trips/christmas-in-europe-2026/day/2026-12-26" });
  });
  it("a non-member or signed-out visitor is served exactly as an unknown ref — no redirect, no rewrite (review focus 1)", async () => {
    // A rewrite is visible: Next sends `x-middleware-rewrite: /trips/<id>/…`
    // on the response, which would confirm the slug exists and hand out the
    // Trip's id. So a non-member's request passes through untouched and the
    // [tripId] layout 404s on the slug, as it does for any unknown ref.
    expect(await run("/trips/christmas-in-europe-2026/plan", { member: false }).result).toEqual({ kind: "pass" });
    expect(await run("/trips/xmas-2026/plan", { member: false }).result).toEqual({ kind: "pass" });
    expect(await run("/trips/cmtw8sgpw0001osqh3i54rx1o/plan", { member: false }).result).toEqual({ kind: "pass" });
    expect(await run("/trips/xmas-2026/settings", { member: false, method: "POST" }).result).toEqual({ kind: "pass" });
  });
  it("a server action POST on an old address is rewritten, never redirected (review focus 2)", async () => {
    const r = run("/trips/xmas-2026/settings", { method: "POST" });
    expect(await r.result).toEqual({ kind: "rewrite", pathname: "/trips/cmtw8sgpw0001osqh3i54rx1o/settings" });
    expect(await run("/trips/christmas-in-europe-2026/settings", { method: "POST" }).result).toEqual({ kind: "rewrite", pathname: "/trips/cmtw8sgpw0001osqh3i54rx1o/settings" });
  });
  it("the common case costs one lookup and one membership check", async () => {
    const r = run("/trips/christmas-in-europe-2026/plan");
    await r.result;
    expect(r.resolve).toHaveBeenCalledTimes(1);
    expect(r.isMember).toHaveBeenCalledTimes(1);
    expect(r.isMember).toHaveBeenCalledWith("cmtw8sgpw0001osqh3i54rx1o");
  });
  it("unknown refs, /trips/new and non-trip paths pass through untouched", async () => {
    expect(await run("/trips/nope/plan").result).toEqual({ kind: "pass" });
    const n = run("/trips/new");
    expect(await n.result).toEqual({ kind: "pass" });
    expect(n.resolve).not.toHaveBeenCalled();
    expect(await run("/trips").result).toEqual({ kind: "pass" });
    expect(await run("/globe").result).toEqual({ kind: "pass" });
  });
  it("a Trip with no slug yet is served on its id with no redirect (and no membership check)", async () => {
    const r = run("/trips/cmnoslug000000000000000000/plan");
    expect(await r.result).toEqual({ kind: "pass" });
    expect(r.isMember).not.toHaveBeenCalled();
  });
  it("a malformed percent-encoding passes through (the route 404s as today)", async () => {
    expect(await run("/trips/%E0%A4%A/plan").result).toEqual({ kind: "pass" });
  });
});
