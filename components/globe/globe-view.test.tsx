import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
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
const { globeRefresh } = vi.hoisted(() => ({ globeRefresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: globeRefresh }) }));

import { searchPlacesAction } from "@/server/actions/globe";
import { toast } from "@/components/ui/use-toast";
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
    expect(globeRefresh).not.toHaveBeenCalled();

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
    expect(within(panel).getByRole("textbox", { name: "Filter your markers" })).toBeInTheDocument();
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

  it("says nothing is called that (not 'no markers yet') when the query hides every marker", async () => {
    const user = userEvent.setup();
    render(<GlobeView markers={markers} members={[]} />);
    await user.type(screen.getByRole("textbox", { name: "Filter your markers" }), "zzz");
    expect(screen.getByRole("heading", { name: "Nothing called 'zzz' on your globe yet" })).toBeInTheDocument();
    expect(screen.queryByText(/no markers yet/i)).not.toBeInTheDocument();
  });
});

describe("GlobeView — filter box can't be mistaken for adding a place (spec 2026-10-05 §H)", () => {
  const markers = [
    mk("1", "Eiffel Tower", "France"),
    mk("2", "Louvre", "France", "ACTIVITY"),
  ];
  beforeEach(() => vi.clearAllMocks());

  it("labels the box as a filter of your markers, not a place search", () => {
    render(<GlobeView markers={markers} members={[]} />);
    const box = screen.getByRole("textbox", { name: "Filter your markers" });
    expect(box).toHaveAttribute("placeholder", "Filter your markers");
    expect(screen.queryByRole("textbox", { name: "Search the globe" })).toBeNull();
    expect(screen.queryByPlaceholderText("Search places")).toBeNull();
  });

  it("a query with no matches offers 'Add {query}', which opens Add Marker with the place search prefilled", async () => {
    const user = userEvent.setup();
    render(<GlobeView markers={markers} members={[]} />);
    await user.type(screen.getByRole("textbox", { name: "Filter your markers" }), "Ireland");
    expect(screen.getByRole("heading", { name: "Nothing called 'Ireland' on your globe yet" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Ireland" }));
    expect(screen.getByRole("heading", { name: "Add Marker" })).toBeInTheDocument();
    expect(screen.getByLabelText("Place search")).toHaveValue("Ireland");
    expect(screen.getByPlaceholderText(/tokyo tower/i)).toHaveValue("");
  });

  it("the header's Add marker still opens a blank search after an 'Add {query}'", async () => {
    const user = userEvent.setup();
    render(<GlobeView markers={markers} members={[]} />);
    await user.type(screen.getByRole("textbox", { name: "Filter your markers" }), "Ireland");
    await user.click(screen.getByRole("button", { name: "Add Ireland" }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await user.click(screen.getByRole("button", { name: /add marker/i }));
    expect(screen.getByLabelText("Place search")).toHaveValue("");
  });

  it("a category with no matches and no query says 'Nothing matches' with no Add button", async () => {
    const user = userEvent.setup();
    render(<GlobeView markers={markers} members={[]} />);
    await user.click(screen.getByRole("button", { name: "Food & Drink" }));
    expect(screen.getByRole("heading", { name: "Nothing matches" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /nothing called/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Add (?!marker)/ })).toBeNull();
  });

  // R8: a query combined with another active filter (country/category) names
  // the filters, not just "yet" — the Add button still offers the way in.
  it("a query plus an active category filter says 'with these filters', keeping the Add button", async () => {
    const user = userEvent.setup();
    render(<GlobeView markers={markers} members={[]} />);
    await user.type(screen.getByRole("textbox", { name: "Filter your markers" }), "louvre");
    // Louvre matches the query alone, but not the "Food & Drink" category.
    await user.click(screen.getByRole("button", { name: "Food & Drink" }));
    expect(screen.getByRole("heading", { name: "Nothing called 'louvre' on your globe with these filters" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nothing called 'louvre' on your globe yet" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add louvre" })).toBeInTheDocument();
  });


  it("a query that matches shows the list, no empty state", async () => {
    const user = userEvent.setup();
    render(<GlobeView markers={markers} members={[]} />);
    await user.type(screen.getByRole("textbox", { name: "Filter your markers" }), "louvre");
    expect(screen.getByText("Louvre")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /nothing/i })).toBeNull();
  });

  it("zero markers: no filters, one empty state pointing to Add marker or the map", () => {
    render(<GlobeView markers={[]} members={[]} />);
    const panel = screen.getByTestId("globe-panel");
    expect(within(panel).queryByRole("textbox", { name: "Filter your markers" })).toBeNull();
    expect(within(panel).queryByRole("combobox", { name: "Country" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "All" })).toBeNull();
    expect(within(panel).getAllByRole("heading")).toHaveLength(1);
    expect(within(panel).getByRole("heading", { name: "No markers yet" })).toBeInTheDocument();
    expect(within(panel).getByText("Tap the map to drop one, or use Add marker above.")).toBeInTheDocument();
  });
});

describe("GlobeView — arriving from a logged past trip", () => {
  const pin = (id: string, name: string) => ({ id, name, lat: 35, lng: 135 });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/globe?added=t9");
  });
  afterEach(() => vi.useRealTimers());

  it("toasts the located count once the pins land, then drops ?added=", () => {
    render(<GlobeView markers={[]} members={[]} arrival={{ tripId: "t9", pins: [pin("a", "Kyoto"), pin("b", "Nara")] }} />);
    expect(toast).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(toast).toHaveBeenCalledWith({ title: "Added to your map · 2 places" });
    expect(window.location.search).toBe("");
  });
  it("one place reads singular", () => {
    render(<GlobeView markers={[]} members={[]} arrival={{ tripId: "t9", pins: [pin("a", "Kyoto")] }} />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(toast).toHaveBeenCalledWith({ title: "Added to your map · 1 place" });
  });
  it("no arrival, no toast", () => {
    render(<GlobeView markers={[]} members={[]} />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(toast).not.toHaveBeenCalled();
  });
});
