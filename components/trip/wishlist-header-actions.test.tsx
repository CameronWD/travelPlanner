import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MarkerView } from "@/components/globe/types";

vi.mock("./add-from-globe-dialog", () => ({
  AddFromGlobeDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Add from Globe" /> : null,
}));

vi.mock("./item-form-dialog", () => ({
  AddItemButton: ({ label, variant }: { label?: string; variant?: string }) => (
    <button data-variant={variant}>{label}</button>
  ),
}));

import { WishlistHeaderActions } from "./wishlist-header-actions";

const marker: MarkerView = {
  id: "m1",
  title: "Senso-ji Temple",
  category: "SIGHTSEEING",
  note: null,
  link: null,
  timing: null,
  lat: 35.71,
  lng: 139.79,
  city: "Tokyo",
  country: "Japan",
  countryCode: "jp",
};

const baseProps = {
  tripId: "t1",
  stops: [{ id: "s1", name: "Paris" }],
  tripStartDate: "2026-07-01",
  homeCurrency: "USD",
  hasGlobe: true,
  globeMarkers: [marker],
  addedMarkerIds: [],
  showAdd: true,
};

describe("WishlistHeaderActions", () => {
  it("renders 'Add from Globe' as an outline button and opens the dialog on click", async () => {
    const user = userEvent.setup();
    render(<WishlistHeaderActions {...baseProps} />);

    const btn = screen.getByRole("button", { name: "Add from Globe" });
    expect(btn.className).toMatch(/\bborder-2\b/);
    expect(screen.queryByRole("dialog", { name: "Add from Globe" })).not.toBeInTheDocument();

    await user.click(btn);
    expect(screen.getByRole("dialog", { name: "Add from Globe" })).toBeInTheDocument();
  });

  it("hides 'Add from Globe' when there is no Globe", () => {
    render(<WishlistHeaderActions {...baseProps} hasGlobe={false} />);
    expect(screen.queryByRole("button", { name: "Add from Globe" })).not.toBeInTheDocument();
  });

  it("renders an ink 'Add an idea' primary button when showAdd", () => {
    render(<WishlistHeaderActions {...baseProps} />);
    const btn = screen.getByRole("button", { name: "Add an idea" });
    expect(btn.dataset.variant).toBe("primary");
  });

  it("hides 'Add an idea' when showAdd is false", () => {
    render(<WishlistHeaderActions {...baseProps} showAdd={false} />);
    expect(screen.queryByRole("button", { name: "Add an idea" })).not.toBeInTheDocument();
  });

  it("has no soft shadows, 70% borders or translucent cards", () => {
    const { container } = render(<WishlistHeaderActions {...baseProps} />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
