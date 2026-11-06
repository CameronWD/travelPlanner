import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

const { shareFindFirstMock, stopFindManyMock, transportFindManyMock, fetchMapMock, legPathsMock } = vi.hoisted(() => ({
  shareFindFirstMock: vi.fn(),
  stopFindManyMock: vi.fn(),
  transportFindManyMock: vi.fn(),
  fetchMapMock: vi.fn(),
  legPathsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    shareLink: { findFirst: shareFindFirstMock },
    stop: { findMany: stopFindManyMock },
    transport: { findMany: transportFindManyMock },
  },
}));
vi.mock("@/lib/map/static-map-fetch", () => ({ fetchStaticMapDataUrl: fetchMapMock }));
vi.mock("@/lib/travel-times/read", () => ({ loadRouteLegPaths: legPathsMock }));
// Capture the element instead of running Satori.
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(public element: ReactElement, public options: unknown) {}
  },
}));

import Image, { size, dynamic } from "./opengraph-image";
import { OG_SIZE } from "@/lib/og-card";

const STOPS = [
  { id: "s1", name: "Munich", country: "Germany", lat: 48.1, lng: 11.6, timezone: "Europe/Berlin", arriveDate: "2020-12-06", departDate: "2020-12-08", sortOrder: 0, notes: "secret stop note" },
  { id: "s2", name: "London", country: "United Kingdom", lat: 51.5, lng: -0.1, timezone: "Europe/London", arriveDate: "2020-12-08", departDate: "2020-12-09", sortOrder: 1 },
];

async function html(token = "tok") {
  const res = (await Image({ params: Promise.resolve({ token }) })) as unknown as { element: ReactElement };
  return renderToStaticMarkup(res.element);
}

beforeEach(() => {
  vi.clearAllMocks();
  stopFindManyMock.mockResolvedValue(STOPS);
  transportFindManyMock.mockResolvedValue([]);
  legPathsMock.mockResolvedValue({});
  fetchMapMock.mockResolvedValue(null);
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "MAP");
});

const LIVE = {
  id: "link-1",
  showTravellers: true,
  includeTransport: true,
  trip: { id: "t1", name: "EU Christmas", startDate: "2020-12-06", endDate: "2020-12-09", homeCurrency: "EUR", homeName: null, homeLat: null, homeLng: null },
};

describe("Share link OG image (SHARE.md §3)", () => {
  it("is 1200×630 and rendered per request, so a revoked link stops previewing at once", () => {
    expect(size).toEqual(OG_SIZE);
    expect(dynamic).toBe("force-dynamic");
  });

  it("a revoked or unknown token gets the site card and no trip data", async () => {
    shareFindFirstMock.mockResolvedValue(null);
    const out = await html("gone");
    expect(out).toContain("Your whole trip, in one place.");
    expect(out).not.toContain("shared pot");
    expect(stopFindManyMock).not.toHaveBeenCalled();
    expect(fetchMapMock).not.toHaveBeenCalled();
  });

  it("a live link draws the hero: name, After month span, route sketch — nothing private", async () => {
    shareFindFirstMock.mockResolvedValue({
      id: "link-1",
      showTravellers: true,
      trip: { id: "t1", name: "EU Christmas", startDate: "2020-12-06", endDate: "2020-12-09", homeCurrency: "EUR" },
    });
    const out = await html();
    expect(out).toContain("EU Christmas");
    expect(out).toContain("Dec 2020");
    expect(out).toContain("<polyline");
    expect(out).not.toContain("secret");
    expect(out).not.toContain("EUR");
    expect(out).not.toContain("<img");
  });

  it("passes the map image to the card, built from the scheduled Stops", async () => {
    shareFindFirstMock.mockResolvedValue(LIVE);
    fetchMapMock.mockResolvedValue("data:image/png;base64,AQID");
    const out = await html();
    expect(out).toContain('src="data:image/png;base64,AQID"');
    expect(out).not.toContain("<polyline");
    expect(fetchMapMock).toHaveBeenCalledWith(
      expect.objectContaining({ mapId: "MAP", width: 280, height: 373, home: null, stops: expect.arrayContaining([expect.objectContaining({ id: "s1" })]) }),
    );
  });

  it("keeps the sketch when there is no map image or no Map ID", async () => {
    shareFindFirstMock.mockResolvedValue(LIVE);
    expect(await html()).toContain("<polyline");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    expect(await html()).toContain("<polyline");
    expect(fetchMapMock).toHaveBeenCalledTimes(1);
  });

  it("skips transports when the link does not share them", async () => {
    shareFindFirstMock.mockResolvedValue({ ...LIVE, includeTransport: false });
    await html();
    expect(transportFindManyMock).not.toHaveBeenCalled();
  });
});
