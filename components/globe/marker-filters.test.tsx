import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkerFilters } from "./marker-filters";

describe("MarkerFilters", () => {
  it("paints the magnifier above the field so a focused field cannot cover it", () => {
    render(<MarkerFilters filter={{ category: null, country: null, query: "" }} countries={[]} onChange={vi.fn()} />);
    const field = screen.getByRole("textbox", { name: "Filter your markers" });
    const icon = field.previousElementSibling!;
    expect(icon.tagName.toLowerCase()).toBe("svg");
    expect(icon.getAttribute("class")).toContain("z-10");
  });
});
