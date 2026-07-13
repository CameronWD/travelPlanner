import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
