import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));

const { MONEY_PAGE_CLASS, MONEY_DESKTOP_GRID_CLASS, MONEY_DESKTOP_GRID_FORK_CLASS } = await import("./page");

describe("Money desktop layout (MONEY.md §7)", () => {
  it("12 columns with a 268px first row that the rest fills, from lg", () => {
    for (const c of ["lg:grid-cols-12", "lg:grid-rows-[268px_minmax(0,1fr)]", "lg:gap-[18px]", "lg:min-h-0", "lg:flex-1"]) {
      expect(MONEY_DESKTOP_GRID_CLASS.split(/\s+/)).toContain(c);
    }
    expect(MONEY_DESKTOP_GRID_CLASS.split(/\s+/)).toContain("grid-cols-1");
  });
  it("a fork's tile has no bar, so its first row sizes to the total", () => {
    expect(MONEY_DESKTOP_GRID_FORK_CLASS).toContain("lg:grid-rows-[auto_minmax(0,1fr)]");
  });
  it("the page fills the viewport from lg only when it is at least 760px tall", () => {
    expect(MONEY_PAGE_CLASS).toContain("lg:[@media(min-height:760px)]:h-[calc(100dvh-4.5rem)]");
  });
});
