import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripCoverCard } from "./trip-cover-card";

describe("TripCoverCard", () => {
  it("is a 2xl card that clips its child", () => {
    const { container } = render(<TripCoverCard className="h-10"><span>x</span></TripCoverCard>);
    expect(container.firstElementChild!.className).toContain("overflow-hidden");
    expect(container.firstElementChild!.className).toContain("rounded-2xl");
  });

  it("gives the cover the kit Card shape — 2px border, hard shadow", () => {
    const { container } = render(<TripCoverCard><span>x</span></TripCoverCard>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("border-2");
    expect(card.className).toMatch(/shadow-hard-\d/);
  });

  it("renders its children", () => {
    render(<TripCoverCard><span>hello</span></TripCoverCard>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});
