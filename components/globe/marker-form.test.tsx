import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

vi.mock("@/server/actions/globe", () => ({
  createMarker: vi.fn().mockResolvedValue({ success: true }),
  updateMarker: vi.fn().mockResolvedValue({ success: true }),
  deleteMarker: vi.fn().mockResolvedValue({ success: true }),
  searchPlacesAction: vi.fn().mockResolvedValue([]),
  reverseGeocodeAction: vi.fn().mockResolvedValue(null),
}));

import { createMarker, deleteMarker } from "@/server/actions/globe";
import { MarkerForm } from "./marker-form";
import type { MarkerView } from "./types";

const existingMarker: MarkerView = {
  id: "marker-1",
  title: "Tokyo Tower",
  category: "SIGHTSEEING",
  note: null,
  link: null,
  timing: null,
  lat: 35.6585805,
  lng: 139.7454329,
  city: "Tokyo",
  country: "Japan",
  countryCode: "jp",
};

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  onSaved: vi.fn(),
};

describe("MarkerForm — add mode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders Title field, Category select, and Save button", () => {
    render(<MarkerForm {...baseProps} />);

    // Title field
    expect(screen.getByPlaceholderText(/tokyo tower/i)).toBeInTheDocument();
    // Category select trigger
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    // Save button
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });

  it("typing a title and clicking Save calls createMarker with objectContaining({ title, category })", async () => {
    const user = userEvent.setup();
    render(<MarkerForm {...baseProps} />);

    const titleInput = screen.getByPlaceholderText(/tokyo tower/i);
    await user.type(titleInput, "Shibuya Crossing");

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(createMarker).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Shibuya Crossing",
          category: "SIGHTSEEING",
        }),
      );
    });
  });
});

describe("MarkerForm — edit mode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a Delete button when marker prop is set", () => {
    render(<MarkerForm {...baseProps} marker={existingMarker} />);
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("clicking Delete calls deleteMarker with the marker id", async () => {
    const user = userEvent.setup();
    render(<MarkerForm {...baseProps} marker={existingMarker} />);

    await user.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => {
      expect(deleteMarker).toHaveBeenCalledWith("marker-1");
    });
  });

  it("does NOT render a Delete button in add mode", () => {
    render(<MarkerForm {...baseProps} />);
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });
});
