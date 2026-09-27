import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createLeafletMock } from "@/test/leaflet-mock";
import { travelPhaseHex } from "@/lib/map-palette";

const hoisted = vi.hoisted(() => ({
  leaflet: null as ReturnType<typeof import("@/test/leaflet-mock").createLeafletMock> | null,
  theme: "light" as "light" | "dark",
}));

vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: hoisted.theme, setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));

import { TravelMap, type TravelMapTrip } from "./travel-map";

const pastTrip: TravelMapTrip = {
  id: "t1",
  name: "Europe 2025",
  dateLabel: "1–10 Jan 2025",
  when: "past",
  points: [
    { lat: 48.85, lng: 2.35, name: "Paris" },
    { lat: 41.9, lng: 12.5, name: "Rome" },
  ],
};

const upcomingTrip: TravelMapTrip = {
  id: "t2",
  name: "Portugal 2027",
  dateLabel: "1–8 Mar 2027",
  when: "upcoming",
  points: [{ lat: 38.7, lng: -9.1, name: "Lisbon" }],
};

const noPointsTrip: TravelMapTrip = {
  id: "t3",
  name: "Sketching only",
  dateLabel: "Not dated yet",
  when: "upcoming",
  points: [],
};

beforeEach(() => {
  hoisted.leaflet = createLeafletMock();
  hoisted.theme = "light";
  vi.clearAllMocks();
  // See test/leaflet-mock.ts: vi.doMock, not a hoisted vi.mock, so each test
  // picks up its own fresh mock instance for the dynamic import("leaflet").
  vi.doMock("leaflet", () => hoisted.leaflet!.module);
});

describe("TravelMap", () => {
  it("renders nothing when no Trip has a located point", () => {
    const { container } = render(<TravelMap trips={[noPointsTrip]} />);
    expect(container.firstChild).toBeNull();
  });

  it("draws a polyline + a pin per point for each located Trip, omitting Trips with no points", async () => {
    render(<TravelMap trips={[pastTrip, upcomingTrip, noPointsTrip]} />);

    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    // pastTrip: 2 points -> 1 polyline segment; upcomingTrip: 1 point -> no polyline.
    expect(hoisted.leaflet!.polylines).toHaveLength(1);
    // 2 + 1 = 3 point pins total (noPointsTrip contributes none).
    expect(hoisted.leaflet!.markers).toHaveLength(3);
  });

  it("colours each Trip's route/pins by phase and dashes the upcoming leg", async () => {
    const twoPointUpcoming: TravelMapTrip = {
      ...upcomingTrip,
      points: [
        { lat: 38.7, lng: -9.1, name: "Lisbon" },
        { lat: 41.1, lng: -8.6, name: "Porto" },
      ],
    };
    render(<TravelMap trips={[pastTrip, twoPointUpcoming]} />);

    await waitFor(() => expect(hoisted.leaflet!.polylines).toHaveLength(2));
    const [pastLine, upcomingLine] = hoisted.leaflet!.polylines;
    expect(pastLine.options.color).toBe(travelPhaseHex("past", false));
    expect(pastLine.options.dashArray).toBeUndefined();
    expect(upcomingLine.options.color).toBe(travelPhaseHex("upcoming", false));
    expect(upcomingLine.options.dashArray).toBe("6 6");
  });

  it("fits bounds to every located point across all Trips", async () => {
    render(<TravelMap trips={[pastTrip, upcomingTrip]} />);

    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    const map = hoisted.leaflet!.maps[0];
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    const fitted = map.fitBounds.mock.calls[0][0] as [number, number][];
    expect(fitted).toHaveLength(3); // Paris, Rome, Lisbon
  });

  it("binds a popup naming the Trip, its dates, and Home/Plan links to each pin", async () => {
    render(<TravelMap trips={[upcomingTrip]} />);

    await waitFor(() => expect(hoisted.leaflet!.markers).toHaveLength(1));
    const [marker] = hoisted.leaflet!.markers;
    expect(marker.bindPopup).toHaveBeenCalledTimes(1);
    const html = marker.bindPopup.mock.calls[0][0] as string;
    expect(html).toContain("Portugal 2027");
    expect(html).toContain("1–8 Mar 2027");
    expect(html).toContain('href="/trips/t2"');
    expect(html).toContain('href="/trips/t2/plan"');
  });
});
