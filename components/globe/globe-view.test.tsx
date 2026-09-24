import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Stub the heavy dynamically-imported globe map — the marker-form flow under
// test never needs the map itself.
vi.mock("./globe-map-loader", () => ({ GlobeMapLoader: () => null }));

// Prevent the next-auth crash: MarkerList/MarkerForm → AttachmentList → server actions
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

vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { searchPlacesAction } from "@/server/actions/globe";
import { GlobeView } from "./globe-view";

const candidate = (name: string, city: string) => ({
  name,
  lat: 1,
  lng: 2,
  city,
  country: "Japan",
  countryCode: "jp",
});

describe("GlobeView — reopening Add Marker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts a fresh form each time Add Marker is reopened after a save", async () => {
    const user = userEvent.setup();
    render(<GlobeView markers={[]} members={[]} />);

    // 1. Open Add, search, pick Kyoto → title fills.
    vi.mocked(searchPlacesAction).mockResolvedValue({ status: "ok", candidates: [candidate("Kyoto, Japan", "Kyoto")] });
    await user.click(screen.getByRole("button", { name: /add marker/i }));
    await user.type(screen.getByLabelText("Place search"), "Kyoto");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    await user.click(await screen.findByRole("button", { name: /kyoto, japan/i }));
    expect(screen.getByPlaceholderText(/tokyo tower/i)).toHaveValue("Kyoto");

    // 2. Save it — dialog closes.
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/tokyo tower/i)).not.toBeInTheDocument(),
    );

    // 3. Reopen Add — the form must be blank, not carrying Kyoto over.
    await user.click(screen.getByRole("button", { name: /add marker/i }));
    expect(screen.getByPlaceholderText(/tokyo tower/i)).toHaveValue("");

    // 4. Search a new place, pick Osaka → title must update to the new place.
    vi.mocked(searchPlacesAction).mockResolvedValue({ status: "ok", candidates: [candidate("Osaka, Japan", "Osaka")] });
    await user.type(screen.getByLabelText("Place search"), "Osaka");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    await user.click(await screen.findByRole("button", { name: /osaka, japan/i }));
    expect(screen.getByPlaceholderText(/tokyo tower/i)).toHaveValue("Osaka");
  });
});

const mk = (id: string, title: string, country: string | null, category = "SIGHTSEEING") => ({
  id,
  title,
  category,
  note: null,
  link: null,
  timing: null,
  lat: null,
  lng: null,
  city: null,
  country,
  countryCode: null,
});

describe("GlobeView — Playground kit shape", () => {
  const markers = [
    mk("1", "Eiffel Tower", "France"),
    mk("2", "Louvre", "France", "ACTIVITY"),
    mk("3", "Fushimi Inari", "Japan"),
  ];

  it("uses the kit heading and keeps named header actions", () => {
    render(<GlobeView markers={markers} members={[]} />);
    expect(screen.getByRole("heading", { level: 1, name: "Your globe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add marker/i })).toBeInTheDocument();
  });

  it("shows kit stat chips counted from the markers", () => {
    render(<GlobeView markers={markers} members={[]} />);
    expect(screen.getByText("2 countries")).toBeInTheDocument();
    expect(screen.getByText("3 markers")).toBeInTheDocument();
  });

  it("singularises the stat chips", () => {
    render(<GlobeView markers={[mk("1", "Eiffel Tower", "France")]} members={[]} />);
    expect(screen.getByText("1 country")).toBeInTheDocument();
    expect(screen.getByText("1 marker")).toBeInTheDocument();
  });

  it("puts search, filters and the list in one kit Card", () => {
    render(<GlobeView markers={markers} members={[]} />);
    const panel = screen.getByTestId("globe-panel");
    expect(panel).toHaveClass("border-2", "border-border", "shadow-hard-2");
    expect(within(panel).getByRole("textbox", { name: "Search the globe" })).toBeInTheDocument();
    expect(within(panel).getByRole("combobox", { name: "Country" })).toBeInTheDocument();
    expect(within(panel).getByText("Fushimi Inari")).toBeInTheDocument();
  });

  it("carries the kit's map hint caption", () => {
    render(<GlobeView markers={markers} members={[]} />);
    expect(screen.getByText("Tap the map to drop a marker")).toBeInTheDocument();
  });

  it("shows the kit EmptyState when the Globe has no markers", () => {
    render(<GlobeView markers={[]} members={[]} />);
    expect(screen.getByRole("heading", { name: "No markers yet" })).toBeInTheDocument();
  });

  it("says nothing matches (not 'no markers yet') when filters hide every marker", async () => {
    const user = userEvent.setup();
    render(<GlobeView markers={markers} members={[]} />);
    await user.type(screen.getByRole("textbox", { name: "Search the globe" }), "zzz");
    expect(screen.getByRole("heading", { name: "Nothing matches" })).toBeInTheDocument();
    expect(screen.queryByText(/no markers yet/i)).not.toBeInTheDocument();
  });
});
