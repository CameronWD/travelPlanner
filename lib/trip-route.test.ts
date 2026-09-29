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
  it("a non-member or signed-out visitor is never redirected — they get today's not-found (review focus 1)", async () => {
    expect(await run("/trips/xmas-2026/plan", { member: false }).result).toEqual({ kind: "rewrite", pathname: "/trips/cmtw8sgpw0001osqh3i54rx1o/plan" });
    expect(await run("/trips/cmtw8sgpw0001osqh3i54rx1o/plan", { member: false }).result).toEqual({ kind: "pass" });
  });
  it("a server action POST on an old address is rewritten, never redirected (review focus 2)", async () => {
    const r = run("/trips/xmas-2026/settings", { method: "POST" });
    expect(await r.result).toEqual({ kind: "rewrite", pathname: "/trips/cmtw8sgpw0001osqh3i54rx1o/settings" });
    expect(r.isMember).not.toHaveBeenCalled();
  });
  it("membership is only checked on the redirect path (the common case costs one lookup)", async () => {
    const r = run("/trips/christmas-in-europe-2026/plan");
    await r.result;
    expect(r.isMember).not.toHaveBeenCalled();
    expect(r.resolve).toHaveBeenCalledTimes(1);
  });
  it("unknown refs, /trips/new and non-trip paths pass through untouched", async () => {
    expect(await run("/trips/nope/plan").result).toEqual({ kind: "pass" });
    const n = run("/trips/new");
    expect(await n.result).toEqual({ kind: "pass" });
    expect(n.resolve).not.toHaveBeenCalled();
    expect(await run("/trips").result).toEqual({ kind: "pass" });
    expect(await run("/globe").result).toEqual({ kind: "pass" });
  });
  it("a Trip with no slug yet is served on its id with no redirect", async () => {
    expect(await run("/trips/cmnoslug000000000000000000/plan").result).toEqual({ kind: "pass" });
  });
  it("a malformed percent-encoding passes through (the route 404s as today)", async () => {
    expect(await run("/trips/%E0%A4%A/plan").result).toEqual({ kind: "pass" });
  });
});
