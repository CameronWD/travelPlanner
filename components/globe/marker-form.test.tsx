import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

// Prevent the next-auth crash: AttachmentList → server actions
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));

vi.mock("@/server/actions/globe", () => ({
  createMarker: vi.fn().mockResolvedValue({ success: true }),
  updateMarker: vi.fn().mockResolvedValue({ success: true }),
  deleteMarker: vi.fn().mockResolvedValue({ success: true }),
  searchPlacesAction: vi.fn().mockResolvedValue({ status: "ok", candidates: [] }),
  reverseGeocodeAction: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/components/ui/use-toast", () => ({
  toast: vi.fn(),
}));

import { createMarker, deleteMarker, searchPlacesAction } from "@/server/actions/globe";
import { toast } from "@/components/ui/use-toast";
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

  it("fires a success toast with title 'Marker added' after create", async () => {
    const user = userEvent.setup();
    render(<MarkerForm {...baseProps} />);

    const titleInput = screen.getByPlaceholderText(/tokyo tower/i);
    await user.type(titleInput, "Shibuya Crossing");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Marker added",
          description: "Shibuya Crossing",
          variant: "success",
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

describe("MarkerForm — place search feedback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows an 'unavailable' message when the search request errors", async () => {
    const user = userEvent.setup();
    vi.mocked(searchPlacesAction).mockResolvedValue({ status: "error" });
    render(<MarkerForm {...baseProps} />);

    await user.type(screen.getByLabelText("Place search"), "Tokyo");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
  });

  it("shows a 'no matches' message when the search succeeds with zero results", async () => {
    const user = userEvent.setup();
    vi.mocked(searchPlacesAction).mockResolvedValue({ status: "ok", candidates: [] });
    render(<MarkerForm {...baseProps} />);

    await user.type(screen.getByLabelText("Place search"), "zzzz");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText(/no matching places/i)).toBeInTheDocument();
  });

  it("lists candidates and selecting one fills the title", async () => {
    const user = userEvent.setup();
    vi.mocked(searchPlacesAction).mockResolvedValue({
      status: "ok",
      candidates: [
        { name: "Kyoto, Japan", lat: 35.01, lng: 135.76, city: "Kyoto", country: "Japan", countryCode: "jp" },
      ],
    });
    render(<MarkerForm {...baseProps} />);

    await user.type(screen.getByLabelText("Place search"), "Kyoto");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    await user.click(await screen.findByRole("button", { name: /kyoto, japan/i }));

    // Title input (placeholder "e.g. Tokyo Tower") is now populated.
    expect(screen.getByPlaceholderText(/tokyo tower/i)).toHaveValue("Kyoto");
  });

  it("overwrites the title when a different candidate is selected", async () => {
    const user = userEvent.setup();
    vi.mocked(searchPlacesAction).mockResolvedValue({
      status: "ok",
      candidates: [{ name: "Kyoto, Japan", lat: 35.01, lng: 135.76, city: "Kyoto", country: "Japan", countryCode: "jp" }],
    });
    render(<MarkerForm {...baseProps} />);

    const search = screen.getByLabelText("Place search");
    await user.type(search, "Kyoto");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    await user.click(await screen.findByRole("button", { name: /kyoto, japan/i }));
    expect(screen.getByPlaceholderText(/tokyo tower/i)).toHaveValue("Kyoto");

    // Change your mind: search again and pick a different place.
    vi.mocked(searchPlacesAction).mockResolvedValue({
      status: "ok",
      candidates: [{ name: "Osaka, Japan", lat: 34.69, lng: 135.5, city: "Osaka", country: "Japan", countryCode: "jp" }],
    });
    await user.clear(search);
    await user.type(search, "Osaka");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    await user.click(await screen.findByRole("button", { name: /osaka, japan/i }));
    expect(screen.getByPlaceholderText(/tokyo tower/i)).toHaveValue("Osaka");
  });

  it("clears the 'no matches' message once the user edits the query again", async () => {
    const user = userEvent.setup();
    vi.mocked(searchPlacesAction).mockResolvedValue({ status: "ok", candidates: [] });
    render(<MarkerForm {...baseProps} />);

    const search = screen.getByLabelText("Place search");
    await user.type(search, "zzzz");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    expect(await screen.findByText(/no matching places/i)).toBeInTheDocument();

    await user.type(search, "x"); // editing the query should clear the message
    expect(screen.queryByText(/no matching places/i)).not.toBeInTheDocument();
  });
});
