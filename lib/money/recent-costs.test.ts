import { describe, it, expect } from "vitest";
import { recentCosts } from "./recent-costs";

const c = (id: string, paidAt: string | null, createdAt?: string) => ({
  id,
  paidAt: paidAt ? new Date(paidAt) : null,
  createdAt: createdAt ? new Date(createdAt) : undefined,
});

describe("recentCosts", () => {
  it("puts a Cost added and paid today first", () => {
    const list = [c("old", "2026-11-01"), c("unpaid", null, "2026-11-10"), c("lunch", "2026-11-17")];
    expect(recentCosts(list).map((x) => x.id)).toEqual(["lunch", "unpaid", "old"]);
  });

  it("falls back to list order (oldest first) when nothing carries a date", () => {
    expect(recentCosts([c("a", null), c("b", null), c("c", null)]).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("caps at the limit", () => {
    const list = Array.from({ length: 8 }, (_, i) => c(`c${i}`, `2026-11-0${i + 1}`));
    expect(recentCosts(list)).toHaveLength(5);
    expect(recentCosts(list, 2).map((x) => x.id)).toEqual(["c7", "c6"]);
  });
});
