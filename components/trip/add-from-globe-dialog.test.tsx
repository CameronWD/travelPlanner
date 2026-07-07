import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/items", () => ({
  addMarkerToWishlist: vi.fn().mockResolvedValue({ success: true }),
}));
import { addMarkerToWishlist } from "@/server/actions/items";

vi.mock("@/components/ui/use-toast", () => ({
  toast: vi.fn(),
}));
import { toast } from "@/components/ui/use-toast";

import { AddFromGlobeDialog } from "./add-from-globe-dialog";
import type { MarkerView } from "@/components/globe/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mk = (over: Partial<MarkerView>): MarkerView => ({
  id: "x",
  title: "X",
  category: "OTHER",
  note: null,
  link: null,
  timing: null,
  lat: null,
  lng: null,
  city: null,
  country: null,
  countryCode: null,
  ...over,
});

const markers: MarkerView[] = [
  mk({ id: "m1", title: "Eiffel Tower", category: "SIGHTSEEING", country: "France", city: "Paris" }),
  mk({ id: "m2", title: "Ramen bar", category: "FOOD", country: "Japan", city: "Tokyo" }),
  mk({ id: "m3", title: "Louvre", category: "SIGHTSEEING", country: "France", city: "Paris" }),
];

const baseProps = {
  tripId: "trip-1",
  markers,
  addedMarkerIds: [] as string[],
  open: true,
  onOpenChange: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AddFromGlobeDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // Test 1: lists markers and Add button calls addMarkerToWishlist
  // -------------------------------------------------------------------------
  it("lists markers with Add buttons, clicking one calls addMarkerToWishlist and shows a toast", async () => {
    const user = userEvent.setup();
    render(<AddFromGlobeDialog {...baseProps} />);

    // All markers visible
    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.getByText("Ramen bar")).toBeInTheDocument();
    expect(screen.getByText("Louvre")).toBeInTheDocument();

    // Add button for first marker
    const addBtn = screen.getByRole("button", { name: /add eiffel tower/i });
    await user.click(addBtn);

    expect(addMarkerToWishlist).toHaveBeenCalledWith("m1", "trip-1");
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/added/i) }),
    );

    // Button flips to "Added" pill (icon + text, so query for text portion)
    expect(await screen.findByText("Added")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 2: already-added markers show "Added" and no Add button
  // -------------------------------------------------------------------------
  it("already-added markers show 'Added' and have no Add button", () => {
    render(
      <AddFromGlobeDialog
        {...baseProps}
        addedMarkerIds={["m2"]}
      />,
    );

    // m2 should show Added state
    const addedPill = screen.getByText("Added");
    expect(addedPill).toBeInTheDocument();

    // No "Add Ramen bar" button
    expect(
      screen.queryByRole("button", { name: /add ramen bar/i }),
    ).not.toBeInTheDocument();

    // Other markers still have Add buttons
    expect(screen.getByRole("button", { name: /add eiffel tower/i })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 3: empty state when no markers
  // -------------------------------------------------------------------------
  it("shows empty state when markers array is empty", () => {
    render(
      <AddFromGlobeDialog
        {...baseProps}
        markers={[]}
      />,
    );

    expect(screen.getByText(/your globe has no markers yet/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 4: filterToIds limits the visible list
  // -------------------------------------------------------------------------
  it("filterToIds limits the visible marker list", () => {
    render(
      <AddFromGlobeDialog
        {...baseProps}
        filterToIds={["m1", "m3"]}
      />,
    );

    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.getByText("Louvre")).toBeInTheDocument();
    expect(screen.queryByText("Ramen bar")).not.toBeInTheDocument();
  });
});
