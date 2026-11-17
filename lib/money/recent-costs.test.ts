import { describe, it, expect } from "vitest";
import { recentCosts } from "./recent-costs";

const c = (id: string, paidAt: string | null, createdAt: string) => ({
  id,
  paidAt: paidAt ? new Date(paidAt) : null,
  createdAt: new Date(createdAt),
});
const TODAY = "2026-11-17";

describe("recentCosts", () => {
  it("puts a Cost added and paid today first, ahead of one paid earlier", () => {
    const list = [c("old", "2026-11-01", "2026-10-01T09:00:00Z"), c("lunch", "2026-11-17", "2026-11-17T12:30:00Z")];
    expect(recentCosts(list, 5, TODAY).map((x) => x.id)).toEqual(["lunch", "old"]);
  });

  it("ranks an unpaid Cost created today above one paid last week", () => {
    const list = [c("paidLast", "2026-11-10", "2026-10-01T09:00:00Z"), c("fresh", null, "2026-11-17T08:00:00Z")];
    expect(recentCosts(list, 5, TODAY).map((x) => x.id)).toEqual(["fresh", "paidLast"]);
  });

  it("does not let a future paid date outrank a Cost added today", () => {
    const list = [c("future", "2026-12-25", "2026-10-01T09:00:00Z"), c("today", null, "2026-11-17T08:00:00Z")];
    expect(recentCosts(list, 5, TODAY).map((x) => x.id)).toEqual(["today", "future"]);
  });

  it("ties on the same calendar day go to the later-created Cost", () => {
    const list = [c("late", "2026-11-17", "2026-11-17T18:00:00Z"), c("early", null, "2026-11-17T06:00:00Z")];
    expect(recentCosts(list, 5, TODAY).map((x) => x.id)).toEqual(["late", "early"]);
  });

  it("caps at the limit", () => {
    const list = Array.from({ length: 8 }, (_, i) => c(`c${i}`, `2026-11-0${i + 1}`, "2026-10-01T00:00:00Z"));
    expect(recentCosts(list, 5, TODAY)).toHaveLength(5);
    expect(recentCosts(list, 2, TODAY).map((x) => x.id)).toEqual(["c7", "c6"]);
  });
});
