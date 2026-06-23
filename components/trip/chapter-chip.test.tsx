import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChapterChip } from "./chapter-chip";

describe("ChapterChip", () => {
  it("renders the chapter name and a colour class", () => {
    const { container } = render(<ChapterChip name="Italy" colour="rose" />);
    expect(screen.getByText("Italy")).toBeTruthy();
    expect((container.firstChild as HTMLElement).className).toContain("bg-rose-100");
  });
  it("falls back gracefully for an unknown colour", () => {
    render(<ChapterChip name="Mystery" colour="weird" />);
    expect(screen.getByText("Mystery")).toBeTruthy();
  });
});
