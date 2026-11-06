import { describe, expect, it } from "vitest";
import { distinctCountries, selectTargets } from "./fill-regions";

const none = { stops: [], trips: [], transports: [] };

describe("selectTargets", () => {
  it("takes Stops, homes and Transport ends that have a place ID and no Region", () => {
    const targets = selectTargets({
      stops: [{ id: "s1", name: "Munich", placeId: "P1", region: null }],
      trips: [{ id: "t1", homeName: "Home", homePlaceId: "P2", homeRegion: null }],
      transports: [
        {
          id: "x1",
          depPlace: "MUC",
          depPlaceId: "P3",
          depRegion: null,
          depCountryCode: null,
          depIsHome: false,
          arrPlace: "CDG",
          arrPlaceId: "P4",
          arrRegion: null,
          arrCountryCode: null,
          arrIsHome: false,
        },
      ],
    });
    expect(targets).toEqual([
      { kind: "stop", id: "s1", placeId: "P1", label: "Munich", needsCountry: false },
      { kind: "home", id: "t1", placeId: "P2", label: "Home", needsCountry: false },
      { kind: "transport-dep", id: "x1", placeId: "P3", label: "MUC", needsCountry: true },
      { kind: "transport-arr", id: "x1", placeId: "P4", label: "CDG", needsCountry: true },
    ]);
  });

  it("skips rows with a Region, rows without a place ID, and home ends", () => {
    const targets = selectTargets({
      stops: [
        { id: "filled", name: "A", placeId: "P", region: "Bavaria" },
        { id: "unplaced", name: "B", placeId: null, region: null },
      ],
      trips: [{ id: "t", homeName: "H", homePlaceId: "P", homeRegion: "Hesse" }],
      transports: [
        {
          id: "x",
          depPlace: "Home",
          depPlaceId: "P",
          depRegion: null,
          depCountryCode: null,
          depIsHome: true,
          arrPlace: "Rome",
          arrPlaceId: "P5",
          arrRegion: "Lazio",
          arrCountryCode: "it",
          arrIsHome: false,
        },
      ],
    });
    expect(targets).toEqual([]);
  });

  it("asks a Transport end that already has a country for the Region only", () => {
    const [target] = selectTargets({
      ...none,
      transports: [
        {
          id: "x",
          depPlace: "MUC",
          depPlaceId: "P3",
          depRegion: null,
          depCountryCode: "de",
          depIsHome: false,
          arrPlace: null,
          arrPlaceId: null,
          arrRegion: null,
          arrCountryCode: null,
          arrIsHome: false,
        },
      ],
    });
    expect(target).toMatchObject({ kind: "transport-dep", needsCountry: false });
  });
});

describe("distinctCountries", () => {
  it("lowercases, dedupes and drops blanks", () => {
    expect(distinctCountries(["de", "DE", null, "fr", " ", undefined, "fr"])).toEqual(["de", "fr"]);
  });
});
