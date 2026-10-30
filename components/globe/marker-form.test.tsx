import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

// Prevent the Better Auth crash: AttachmentList → server actions
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));

const mock = await vi.hoisted(async () => (await import("@/test/google-maps-mock")).createGoogleMapsMock());
vi.mock("@vis.gl/react-google-maps", () => mock.module);

vi.mock("@/server/actions/globe", () => ({
  createMarker: vi.fn().mockResolvedValue({ success: true }),
  updateMarker: vi.fn().mockResolvedValue({ success: true }),
  deleteMarker: vi.fn().mockResolvedValue({ success: true }),
  reverseGeocodeAction: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/components/ui/use-toast", () => ({
  toast: vi.fn(),
}));

import { createMarker, updateMarker, deleteMarker, reverseGeocodeAction } from "@/server/actions/globe";
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
  placeId: "ChIJTower",
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

  it("clicking Delete shows confirm dialog and deleteMarker fires ONLY after confirming", async () => {
    const user = userEvent.setup();
    render(<MarkerForm {...baseProps} marker={existingMarker} />);

    // Click the Delete button — should NOT fire deleteMarker immediately
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    // Confirm dialog should appear with the marker title
    expect(
      await screen.findByRole("heading", { name: /Delete "Tokyo Tower"\?/i }),
    ).toBeInTheDocument();

    // deleteMarker must NOT have been called yet
    expect(deleteMarker).not.toHaveBeenCalled();

    // Confirm deletion — click the Delete button inside the confirm dialog
    const confirmHeading = await screen.findByRole("heading", { name: /Delete "Tokyo Tower"\?/i });
    const confirmDialog = confirmHeading.closest("[role='dialog']")!;
    await user.click(within(confirmDialog as HTMLElement).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(deleteMarker).toHaveBeenCalledWith("marker-1");
    });
  });

  it("clicking Delete and then cancelling does NOT call deleteMarker", async () => {
    const user = userEvent.setup();
    render(<MarkerForm {...baseProps} marker={existingMarker} />);

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await screen.findByRole("heading", { name: /Delete "Tokyo Tower"\?/i });

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(deleteMarker).not.toHaveBeenCalled();
  });

  it("does NOT render a Delete button in add mode", () => {
    render(<MarkerForm {...baseProps} />);
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });
});

describe("MarkerForm — place search", () => {
  const KYOTO = { placeId: "ChIJKyoto", mainText: "Kyoto", secondaryText: "Kyoto Prefecture, Japan", lat: 35.01, lng: 135.76, countryCode: "jp", country: "Japan", components: [{ longText: "Kyoto", shortText: "Kyoto", types: ["locality", "political"] }] };
  const OSAKA = { placeId: "ChIJOsaka", mainText: "Osaka", secondaryText: "Osaka Prefecture, Japan", lat: 34.69, lng: 135.5, countryCode: "jp", country: "Japan" };
  const search = () => screen.getByRole("combobox", { name: "Place search" });
  const titleField = () => screen.getByPlaceholderText(/tokyo tower/i);

  async function pickKyoto(user: ReturnType<typeof userEvent.setup>) {
    await user.type(search(), "Kyo");
    await screen.findByRole("option", { name: /Kyoto/ });
    await user.keyboard("{Enter}");
    await waitFor(() => expect(search()).toHaveValue("Kyoto"));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mock.reset();
    mock.places.predictions = [KYOTO];
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("a pick fills title, coordinates and placeId", async () => {
    const user = userEvent.setup();
    render(<MarkerForm {...baseProps} />);
    await pickKyoto(user);
    expect(titleField()).toHaveValue("Kyoto");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(createMarker).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Kyoto", lat: 35.01, lng: 135.76, city: "Kyoto", country: "Japan", countryCode: "jp", placeId: "ChIJKyoto" }),
      ),
    );
  });

  it("a second pick replaces a title the first pick filled", async () => {
    const user = userEvent.setup();
    render(<MarkerForm {...baseProps} />);
    await pickKyoto(user);
    mock.places.predictions = [OSAKA];
    await user.clear(search());
    await user.type(search(), "Osa");
    await screen.findByRole("option", { name: /Osaka/ });
    await user.keyboard("{Enter}");
    await waitFor(() => expect(titleField()).toHaveValue("Osaka"));
  });

  it("a pick leaves a title the Traveller already typed", async () => {
    const user = userEvent.setup();
    render(<MarkerForm {...baseProps} />);
    await user.type(titleField(), "Temples");
    await pickKyoto(user);
    expect(titleField()).toHaveValue("Temples");
  });

  it("editing only the note keeps the Marker's placeId and coordinates", async () => {
    const user = userEvent.setup();
    render(<MarkerForm {...baseProps} marker={existingMarker} />);
    await user.type(screen.getByPlaceholderText(/anything worth noting/i), "Go at dusk");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(updateMarker).toHaveBeenCalledWith(
        "marker-1",
        expect.objectContaining({ note: "Go at dusk", placeId: "ChIJTower", lat: 35.6585805, lng: 139.7454329 }),
      ),
    );
  });

  it("keyless, Place search is a plain field", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    render(<MarkerForm {...baseProps} />);
    expect(screen.getByLabelText("Place search")).not.toHaveAttribute("role", "combobox");
    expect(screen.getByText(/Suggestions aren't available/)).toBeInTheDocument();
  });

  it("a dropped pin prefills from reverseGeocodeAction and stores its placeId", async () => {
    vi.mocked(reverseGeocodeAction).mockResolvedValue({
      name: "Tokyo Tower, Japan", lat: 35.65, lng: 139.74, city: "Tokyo", country: "Japan", countryCode: "jp", placeId: "ChIJDrop", address: null,
    });
    const user = userEvent.setup();
    render(<MarkerForm {...baseProps} prefill={{ lat: 35.65, lng: 139.74 }} />);
    await waitFor(() => expect(titleField()).toHaveValue("Tokyo Tower"));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(createMarker).toHaveBeenCalledWith(expect.objectContaining({ placeId: "ChIJDrop", city: "Tokyo" })));
  });
});

describe("MarkerForm — initialQuery (spec 2026-10-05 §H)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prefills the place search with initialQuery in add mode, leaving the title empty", () => {
    render(<MarkerForm {...baseProps} initialQuery="Ireland" />);
    expect(screen.getByLabelText("Place search")).toHaveValue("Ireland");
    expect(screen.getByPlaceholderText(/tokyo tower/i)).toHaveValue("");
  });

  it("ignores initialQuery when editing — the marker's own title seeds the search", () => {
    render(<MarkerForm {...baseProps} marker={existingMarker} initialQuery="Ireland" />);
    expect(screen.getByLabelText("Place search")).toHaveValue("Tokyo Tower");
  });
});
