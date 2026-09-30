import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { hueClasses } from "@/lib/hues";
import { ChapterDivider } from "./chapter-divider";

describe("ChapterDivider (PLAN.md §1.3)", () => {
  it("an upper-cased pill in the chapter colour, a rule, and the summary", () => {
    const { container } = render(<ChapterDivider name="Italy" colour="rose" summary="2 stops · 15–27 Dec" actions={<button>Firm up</button>} />);
    const pill = screen.getByText("Italy");
    expect(pill.className).toContain("uppercase");
    expect(pill.className).toContain(hueClasses("rose").fill);
    expect(container.querySelector("[data-rule]")!.className).toContain("bg-muted");
    expect(screen.getByText("2 stops · 15–27 Dec")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Firm up" })).toBeInTheDocument();
  });
});
