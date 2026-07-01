import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VariantBanner } from "./variant-banner";

vi.mock("next/navigation", () => ({
  usePathname: () => "/trips/trip-1/plan",
}));

describe("VariantBanner", () => {
  it("names the variant and links to the real plan and Compare", () => {
    render(<VariantBanner tripId="trip-1" variantName="Italy-first" />);
    expect(screen.getByText(/Italy-first/)).toBeInTheDocument();
    expect(screen.getByText(/not live/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /switch to real plan/i })).toHaveAttribute("href", "/trips/trip-1/plan");
    expect(screen.getByRole("link", { name: /compare/i })).toHaveAttribute("href", "/trips/trip-1/compare");
  });
});
