import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TripLoading from "./loading";

describe("Trip loading", () => {
  it("renders the phone detail skeleton below lg and the desktop Home skeleton at lg+", () => {
    render(<TripLoading />);
    const desktop = screen.getByTestId("home-desktop-skeleton");
    expect(desktop.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(desktop.className).toContain("lg:flex");
    // The 12-column grid with the four tiles at their spans.
    const grid = desktop.querySelector(".grid-cols-12") as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.querySelector(".col-span-7 .bg-canvas")).not.toBeNull(); // flat map fill
    expect(grid.querySelectorAll("[data-skeleton-row]")).toHaveLength(4); // Sort these out rows
    // One status per width.
    expect(screen.getAllByRole("status", { hidden: true })).toHaveLength(2);
  });
});
