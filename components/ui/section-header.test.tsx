import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHeader } from "./section-header";

describe("SectionHeader", () => {
  it("renders title and count", () => {
    render(<SectionHeader title="Wishlist" count={3} />);
    expect(screen.getByText("Wishlist")).toBeInTheDocument();
    expect(screen.getByText("(3)")).toBeInTheDocument();
  });
});
