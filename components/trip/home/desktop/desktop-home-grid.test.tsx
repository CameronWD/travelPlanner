import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DesktopHomeGrid,
  desktopHomeGridClass,
  DESKTOP_GRID_SPANS,
  TravellingDesktopGrid,
  travellingDesktopGridClass,
  TRAVELLING_GRID_CLASS_COVER,
  TRAVELLING_GRID_CLASS_NO_COVER,
  TRAVELLING_GRID_SPANS,
  PastDesktopGrid,
  pastDesktopGridClass,
  PAST_GRID_SPANS,
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

describe("TravellingDesktopGrid (spec D)", () => {
  function renderTravelling(hasCover: boolean, journal = true) {
    render(
      <TravellingDesktopGrid
        hasCover={hasCover}
        countdown={<div data-testid="countdown" />}
        spend={<div data-testid="spend" />}
        today={<div data-testid="today" />}
        map={<div data-testid="map" />}
        journal={journal ? <div data-testid="journal" /> : null}
      />,
    );
    const slot = (id: string) => screen.getByTestId(id).parentElement as HTMLElement;
    return { grid: slot("countdown").parentElement as HTMLElement, slot };
  }

  it("is the 12-column, 18px-gap grid with a 300px first row under a cover, 200px without", () => {
    expect(travellingDesktopGridClass(true)).toBe(TRAVELLING_GRID_CLASS_COVER);
    expect(TRAVELLING_GRID_CLASS_COVER).toContain("grid grid-cols-12 gap-[18px]");
    expect(TRAVELLING_GRID_CLASS_COVER).toContain("grid-rows-[300px_minmax(26rem,auto)_auto]");
    expect(TRAVELLING_GRID_CLASS_NO_COVER).toContain("grid-rows-[200px_minmax(26rem,auto)_auto]");
  });

  it("spans row 1 8/4 (cover) · row 2 7/5 · row 3 full width, in that DOM order", () => {
    const { grid, slot } = renderTravelling(true);
    expect(grid.className).toBe(TRAVELLING_GRID_CLASS_COVER);
    expect(slot("countdown")).toHaveClass("col-span-8");
    expect(slot("spend")).toHaveClass("col-span-4");
    expect(slot("today")).toHaveClass("col-span-7");
    expect(slot("map")).toHaveClass("col-span-5");
    expect(slot("journal")).toHaveClass("col-span-12");
    expect([...grid.children].map((c) => (c.firstElementChild as HTMLElement).dataset.testid)).toEqual([
      "countdown",
      "spend",
      "today",
      "map",
      "journal",
    ]);
  });

  it("spans row 1 6/6 without a cover and drops the journal row when there is none", () => {
    const { grid, slot } = renderTravelling(false, false);
    expect(grid.className).toBe(TRAVELLING_GRID_CLASS_NO_COVER);
    expect(slot("countdown")).toHaveClass("col-span-6");
    expect(slot("spend")).toHaveClass("col-span-6");
    expect(grid.children).toHaveLength(4);
    expect(TRAVELLING_GRID_SPANS.journal).toContain("col-span-12");
  });
});

describe("PastDesktopGrid (spec D)", () => {
  it("puts the countdown + wrap-up in row 1, three stat tiles in row 2, the route full width in row 3", () => {
    render(
      <PastDesktopGrid
        hasCover
        countdown={<div data-testid="countdown" />}
        wrap={<div data-testid="wrap" />}
        stats={[<div key="a" data-testid="s1" />, <div key="b" data-testid="s2" />, <div key="c" data-testid="s3" />]}
        map={<div data-testid="map" />}
      />,
    );
    const slot = (id: string) => screen.getByTestId(id).parentElement as HTMLElement;
    const grid = slot("countdown").parentElement as HTMLElement;
    expect(grid.className).toBe(pastDesktopGridClass(true));
    expect(pastDesktopGridClass(true)).toContain("grid grid-cols-12 gap-[18px]");
    expect(pastDesktopGridClass(false)).toContain("grid-rows-[200px_auto_auto]");
    expect(slot("countdown")).toHaveClass("col-span-8");
    expect(slot("wrap")).toHaveClass("col-span-4");
    for (const id of ["s1", "s2", "s3"]) expect(slot(id)).toHaveClass("col-span-4");
    expect(slot("map")).toHaveClass("col-span-12");
    expect(PAST_GRID_SPANS.map).toContain("col-span-12");
  });
});
