import { describe, it, expect } from "vitest";
import { toPickedPlace, pickedPlaces } from "./picked-place";

const sydneyAu = { name: "Sydney, Council of the City of Sydney, New South Wales, 2000, Australia", lat: -33.87, lng: 151.21, city: "Sydney", country: "Australia", countryCode: "au" };
const sydneyCa = { name: "Sydney, Cape Breton Regional Municipality, Nova Scotia, B1P 1A1, Canada", lat: 46.14, lng: -60.19, city: "Sydney", country: "Canada", countryCode: "ca" };

describe("toPickedPlace", () => {
  it("takes the first part as the name and the last two non-postcode parts as the region", () => {
    expect(toPickedPlace(sydneyAu)).toEqual({ name: "Sydney", region: "New South Wales, Australia", lat: -33.87, lng: 151.21, countryCode: "au" });
    expect(toPickedPlace(sydneyCa)?.region).toBe("Nova Scotia, Canada");
  });
  it("a country-level result has only the country as its region", () => {
    expect(toPickedPlace({ name: "Japan", lat: 36, lng: 138, city: null, country: "Japan", countryCode: "jp" })).toEqual({ name: "Japan", lat: 36, lng: 138, countryCode: "jp" });
  });
  it("drops a nameless result", () => {
    expect(toPickedPlace({ name: "", lat: 0, lng: 0, city: null, country: null, countryCode: null })).toBeNull();
  });
});

describe("pickedPlaces", () => {
  it("de-duplicates by name and region", () => {
    expect(pickedPlaces([sydneyAu, sydneyAu, sydneyCa])).toHaveLength(2);
  });
  it("ranks nearest first when given a point (Plan's near-route ranking)", () => {
    const near = { lat: 45, lng: -63 };
    expect(pickedPlaces([sydneyAu, sydneyCa], near).map((p) => p.countryCode)).toEqual(["ca", "au"]);
  });
  it("keeps the geocoder's order without a point", () => {
    expect(pickedPlaces([sydneyAu, sydneyCa]).map((p) => p.countryCode)).toEqual(["au", "ca"]);
  });
});
