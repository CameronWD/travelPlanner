import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DesktopHomeGrid,
  desktopHomeGridClass,
  DESKTOP_GRID_SPANS,
} from "@/components/trip/home/desktop/desktop-home-grid";

function renderGrid(hasCover: boolean) {
  render(
    <DesktopHomeGrid
      hasCover={hasCover}
      countdown={<div data-testid="countdown" />}
      pot={<div data-testid="pot" />}
      map={<div data-testid="map" />}
      sort={<div data-testid="sort" />}
    />,
  );
  const slot = (id: string) => screen.getByTestId(id).parentElement as HTMLElement;
  return { grid: slot("countdown").parentElement as HTMLElement, slot };
}

describe("desktopHomeGridClass", () => {
  it("is a 12-column grid, 18px gaps, 300px first row with a cover", () => {
    const cls = desktopHomeGridClass(true);
    expect(cls).toContain("grid grid-cols-12 gap-[18px]");
    expect(cls).toContain("grid-rows-[300px_1fr]");
  });

  it("has a 200px first row without a cover", () => {
    expect(desktopHomeGridClass(false)).toContain("grid-rows-[200px_1fr]");
    expect(desktopHomeGridClass(false)).not.toContain("300px");
  });
});

describe("DesktopHomeGrid", () => {
  it("spans 8/4 then 7/5 with a cover", () => {
    const { grid, slot } = renderGrid(true);
    expect(grid.className).toBe(desktopHomeGridClass(true));
    expect(slot("countdown")).toHaveClass("col-span-8");
    expect(slot("pot")).toHaveClass("col-span-4");
    expect(slot("map")).toHaveClass("col-span-7");
    expect(slot("sort")).toHaveClass("col-span-5");
  });

  it("spans 6/6 then 7/5 without a cover", () => {
    const { grid, slot } = renderGrid(false);
    expect(grid.className).toBe(desktopHomeGridClass(false));
    expect(slot("countdown")).toHaveClass("col-span-6");
    expect(slot("pot")).toHaveClass("col-span-6");
    expect(slot("map")).toHaveClass("col-span-7");
    expect(slot("sort")).toHaveClass("col-span-5");
  });

  it("exports the span classes", () => {
    expect(DESKTOP_GRID_SPANS.cover.countdown).toContain("col-span-8");
    expect(DESKTOP_GRID_SPANS.noCover.pot).toContain("col-span-6");
  });
});
