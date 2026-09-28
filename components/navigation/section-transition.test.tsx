import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockSegment = vi.fn<() => string | null>(() => "plan");
vi.mock("next/navigation", () => ({ useSelectedLayoutSegment: () => mockSegment() }));

import { SectionTransition } from "./section-transition";

describe("SectionTransition", () => {
  it("wraps the layout's child segment in a keyed section", () => {
    render(<SectionTransition><p>Plan page</p></SectionTransition>);
    expect(screen.getByText("Plan page").closest("[data-section]")).toHaveAttribute("data-section", "plan");
  });
  it("names the index segment so Home is its own section", () => {
    mockSegment.mockReturnValue(null);
    render(<SectionTransition><p>Home</p></SectionTransition>);
    expect(screen.getByText("Home").closest("[data-section]")).toHaveAttribute("data-section", "__index");
  });
});
