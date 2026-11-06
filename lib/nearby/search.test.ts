import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { searchNearby } from "./search";

const POINT = { lat: 38.7139, lng: -9.1334 };
const FOOD = "food" as const;
const MASK =
  "places.id,places.displayName,places.location,places.formattedAddress,places.primaryTypeDisplayName,places.rating,places.userRatingCount,places.regularOpeningHours,places.currentOpeningHours,places.businessStatus,places.websiteUri,places.utcOffsetMinutes";

const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

const PLACE = {
  id: "ChIJ1",
  displayName: { text: "Cervejaria Ramiro" },
  location: { latitude: 38.72, longitude: -9.135 },
  formattedAddress: "Av. Almirante Reis 1, Lisboa",
  primaryTypeDisplayName: { text: "Seafood restaurant" },
  rating: 4.6,
  userRatingCount: 21000,
  businessStatus: "OPERATIONAL",
  utcOffsetMinutes: 60,
  websiteUri: "https://ramiro.test",
  regularOpeningHours: {
    periods: [{ open: { day: 1, hour: 12, minute: 0 }, close: { day: 1, hour: 23, minute: 0 } }],
  },
  currentOpeningHours: {
    openNow: true,
    nextCloseTime: "2026-11-06T22:00:00Z",
  },
};

describe("searchNearby", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "server-key");
  });

  it("posts the exact Nearby Search request with the field mask", async () => {
    fetchMock.mockResolvedValue(reply({ places: [] }));
    await searchNearby(POINT, FOOD);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "X-Goog-Api-Key": "server-key", "X-Goog-FieldMask": MASK });
    expect(JSON.parse(init.body)).toEqual({
      includedTypes: ["restaurant"],
      maxResultCount: 10,
      rankPreference: "POPULARITY",
      languageCode: "en",
      locationRestriction: { circle: { center: { latitude: 38.7139, longitude: -9.1334 }, radius: 1500 } },
    });
  });

  it("parses a place, with hours and rating", async () => {
    fetchMock.mockResolvedValue(reply({ places: [PLACE] }));
    const [place] = (await searchNearby(POINT, FOOD))!;
    expect(place).toMatchObject({
      placeId: "ChIJ1",
      name: "Cervejaria Ramiro",
      lat: 38.72,
      lng: -9.135,
      address: "Av. Almirante Reis 1, Lisboa",
      typeLabel: "Seafood restaurant",
      rating: 4.6,
      ratingCount: 21000,
      businessStatus: "OPERATIONAL",
      website: "https://ramiro.test",
    });
    expect(place.openingHours?.week.mon).toEqual([["12:00", "23:00"]]);
    expect(place.openingHours?.source).toContain("query_place_id=ChIJ1");
  });

  it("carries the place's UTC offset and leaves open status to serve time", async () => {
    fetchMock.mockResolvedValue(reply({ places: [PLACE, { ...PLACE, id: "n", utcOffsetMinutes: undefined }] }));
    const [a, b] = (await searchNearby(POINT, FOOD))!;
    expect(a).toMatchObject({ utcOffsetMinutes: 60, openNow: null, closesAt: null });
    expect(b.utcOffsetMinutes).toBeNull();
  });

  it("drops permanently closed places and rows without a location or name", async () => {
    fetchMock.mockResolvedValue(
      reply({
        places: [PLACE, { ...PLACE, id: "dead", businessStatus: "CLOSED_PERMANENTLY" }, { ...PLACE, id: "nowhere", location: undefined }, { ...PLACE, id: "noname", displayName: undefined }],
      }),
    );
    expect((await searchNearby(POINT, FOOD))!.map((p) => p.placeId)).toEqual(["ChIJ1"]);
  });

  it("is an empty list when Google has no places key", async () => {
    fetchMock.mockResolvedValue(reply({}));
    expect(await searchNearby(POINT, FOOD)).toEqual([]);
  });

  it("is null on a non-200", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    expect(await searchNearby(POINT, FOOD)).toBeNull();
  });

  it("is null without a server key, without calling Google", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "");
    expect(await searchNearby(POINT, FOOD)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
