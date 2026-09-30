import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Each mock is typed with a rest parameter — otherwise spreading `a: unknown[]`
// into a zero-arg mock is a tuple-arity mismatch (TS2556) under this repo's
// strict tsconfig.
const findUnique = vi.fn<(...a: unknown[]) => Promise<{ id: string; name: string }>>(async () => ({ id: "t1", name: "EU" }));
vi.mock("@/lib/db", () => ({ db: { trip: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
const getUnreadActivityCount = vi.fn<(...a: unknown[]) => Promise<number>>(async () => 3);
const getRecentActivity = vi.fn<(...a: unknown[]) => Promise<unknown[]>>(async () => []);
vi.mock("@/server/actions/activity", () => ({
  getUnreadActivityCount: (...a: unknown[]) => getUnreadActivityCount(...a),
  getRecentActivity: (...a: unknown[]) => getRecentActivity(...a),
}));
const listForks = vi.fn<(...a: unknown[]) => Promise<{ id: string; name: string; sortOrder: number }[]>>(async () => [{ id: "f1", name: "B", sortOrder: 0 }]);
vi.mock("@/server/actions/forks", () => ({ listForks: (...a: unknown[]) => listForks(...a) }));

import { readTripShell, readUnreadActivityCount, readRecentActivity, readForks, TRIP_SHELL_SELECT } from "./trip-shell-reads";

beforeEach(() => vi.clearAllMocks());

describe("trip-shell reads", () => {
  it("readTripShell selects everything the trip layout renders from", async () => {
    await readTripShell("t1");
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "t1" }, select: TRIP_SHELL_SELECT });
    for (const key of ["id", "name", "startDate", "endDate", "homeCurrency", "forksEnabled", "members", "stops"]) {
      expect(TRIP_SHELL_SELECT).toHaveProperty(key);
    }
  });

  it("the activity reads delegate with their arguments", async () => {
    expect(await readUnreadActivityCount("t1")).toBe(3);
    expect(getUnreadActivityCount).toHaveBeenCalledWith("t1");
    await readRecentActivity("t1", 10);
    expect(getRecentActivity).toHaveBeenCalledWith("t1", 10);
  });

  it("readForks delegates to listForks", async () => {
    expect(await readForks("t1")).toEqual([{ id: "f1", name: "B", sortOrder: 0 }]);
    expect(listForks).toHaveBeenCalledWith("t1");
  });
});

// React's cache() only memoises inside a server render, so the dedupe is
// pinned structurally: the layout and the pages under it must go through the
// cached reads, never the raw actions. Home keeps its own db.trip.findUnique
// (its select pulls cover/driving/home fields TRIP_SHELL_SELECT doesn't carry,
// so it isn't a subset — see the commit body), so only Home is exempted from
// the "no raw trip query" assertion.
describe("the trip layout, Home and Day pages share the cached reads", () => {
  const root = path.resolve(__dirname, "..", "app", "(app)", "trips", "[tripId]");
  it.each([
    ["layout.tsx", path.join(root, "layout.tsx")],
    ["page.tsx (Home)", path.join(root, "page.tsx")],
    ["day/[date]/page.tsx", path.join(root, "day", "[date]", "page.tsx")],
    ["day/page.tsx", path.join(root, "day", "page.tsx")],
    ["components/trip/trip-header-trailing.tsx", path.resolve(__dirname, "..", "components", "trip", "trip-header-trailing.tsx")],
  ])("%s", (_label, file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/from "@\/server\/actions\/activity"/);
    expect(src).toMatch(/from "@\/lib\/trip-shell-reads"/);
  });

  it.each([
    ["layout.tsx", path.join(root, "layout.tsx")],
    ["day/[date]/page.tsx", path.join(root, "day", "[date]", "page.tsx")],
    ["day/page.tsx", path.join(root, "day", "page.tsx")],
    ["components/trip/trip-header-trailing.tsx", path.resolve(__dirname, "..", "components", "trip", "trip-header-trailing.tsx")],
  ])("%s reads the trip only through readTripShell", (_label, file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/db\.trip\.findUnique/);
  });
});
