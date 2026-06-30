import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NearbyWishlist } from "./nearby-wishlist";
import type { NearbyResult } from "@/lib/nearby";

// Mock the server action so its next/server import chain doesn't load in jsdom.
vi.mock("@/server/actions/items", () => ({
  scheduleItem: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock the toast so we don't need the toast provider.
vi.mock("@/components/ui/use-toast", () => ({
  toast: vi.fn(),
}));

const emptyItems: NearbyResult[] = [];

const nonEmptyItems: NearbyResult[] = [
  { id: "item-1", title: "Senso-ji Temple", category: "ATTRACTION", distanceKm: 0.4 },
  { id: "item-2", title: "Nakamise Shopping Street", category: "FOOD", distanceKm: 1.3 },
];

describe("NearbyWishlist", () => {
  it("renders nothing when items array is empty", () => {
    const { container } = render(
      <NearbyWishlist tripId="trip-1" date="2026-07-01" items={emptyItems} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the collapsed toggle with correct item count for non-empty list", () => {
    render(
      <NearbyWishlist tripId="trip-1" date="2026-07-01" items={nonEmptyItems} />,
    );
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveTextContent("Nearby from your Wishlist (2)");
  });

  it("expands on click and shows item rows", async () => {
    const user = userEvent.setup();
    render(
      <NearbyWishlist tripId="trip-1" date="2026-07-01" items={nonEmptyItems} />,
    );

    // Initially collapsed — items not visible
    expect(screen.queryByText("Senso-ji Temple")).not.toBeInTheDocument();

    const toggleButton = screen.getByRole("button", { name: /Nearby from your Wishlist/ });
    await user.click(toggleButton);

    expect(toggleButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Senso-ji Temple")).toBeInTheDocument();
    expect(screen.getByText("Nakamise Shopping Street")).toBeInTheDocument();
  });

  it("collapses on second click", async () => {
    const user = userEvent.setup();
    render(
      <NearbyWishlist tripId="trip-1" date="2026-07-01" items={nonEmptyItems} />,
    );

    const toggleButton = screen.getByRole("button", { name: /Nearby from your Wishlist/ });
    await user.click(toggleButton);
    expect(screen.getByText("Senso-ji Temple")).toBeInTheDocument();

    await user.click(toggleButton);
    expect(screen.queryByText("Senso-ji Temple")).not.toBeInTheDocument();
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
  });

  it("formats distance as metres when < 1km and km otherwise", async () => {
    const user = userEvent.setup();
    render(
      <NearbyWishlist tripId="trip-1" date="2026-07-01" items={nonEmptyItems} />,
    );
    await user.click(screen.getByRole("button"));

    // 0.4 km → ≈400 m
    expect(screen.getByText("≈400 m")).toBeInTheDocument();
    // 1.3 km → 1.3 km
    expect(screen.getByText("1.3 km")).toBeInTheDocument();
  });
});
