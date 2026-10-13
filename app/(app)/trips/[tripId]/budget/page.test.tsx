import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));

const { MONEY_PAGE_CLASS, MONEY_DESKTOP_GRID_CLASS, MONEY_DESKTOP_GRID_FORK_CLASS } = await import("./page");

describe("Money desktop layout (MONEY.md §7, ruling R2 2026-10-12)", () => {
  it("12 columns from lg; both rows size to their cards so Where it goes can grow", () => {
    const classes = MONEY_DESKTOP_GRID_CLASS.split(/\s+/);
    for (const c of ["grid-cols-1", "lg:grid-cols-12", "lg:gap-[18px]", "lg:grid-rows-[auto_auto]"]) expect(classes).toContain(c);
    expect(classes).not.toContain("lg:grid-rows-[268px_minmax(0,1fr)]");
    expect(classes).not.toContain("lg:min-h-0");
    expect(classes).not.toContain("lg:flex-1");
    expect(MONEY_DESKTOP_GRID_FORK_CLASS).toBe(MONEY_DESKTOP_GRID_CLASS);
  });
  it("the page is never pinned to the viewport: it scrolls", () => {
    expect(MONEY_PAGE_CLASS).not.toMatch(/100dvh|h-\[calc/);
  });
});
