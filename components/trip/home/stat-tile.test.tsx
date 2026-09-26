import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatTile } from "./stat-tile";

describe("StatTile", () => {
  it("renders label, then value, then sub, in that order", () => {
    const { container } = render(<StatTile label="Cost so far" value="£1.2K" sub="£300 paid" />);
    const text = container.textContent ?? "";
    expect(text.indexOf("Cost so far")).toBeLessThan(text.indexOf("£1.2K"));
    expect(text.indexOf("£1.2K")).toBeLessThan(text.indexOf("£300 paid"));
    expect(screen.getByText("Cost so far").className).toContain("text-label");
    expect(screen.getByText("£1.2K").className).toContain("font-display");
  });

  it("is a kit Card in the given tone and fills its grid cell", () => {
    const { container } = render(<StatTile label="Reminders" value="2" tone="lilac" />);
    const tile = container.querySelector("[data-stat-tile]") as HTMLElement;
    expect(tile.className).toContain("bg-lilac");
    expect(tile.className).toMatch(/\bborder-2\b/);
    expect(tile.className).toContain("h-full");
  });

  it("links the whole tile when given an href", () => {
    render(<StatTile label="Next payment" value="£50" href="/trips/t1/budget" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/trips/t1/budget");
    expect(link).toHaveTextContent("Next payment");
  });

  it("puts extra classes on the outermost element", () => {
    const { container } = render(
      <StatTile label="Next payment" value="£50" href="/x" className="hidden lg:block" />,
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain("hidden");
    expect(outer.className).toContain("lg:block");
    expect(outer).toHaveAttribute("data-stat-tile");
  });
});
