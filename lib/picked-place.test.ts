import { describe, it, expect } from "vitest";
import { toPickedPlace, pickedPlaces } from "./picked-place";

const sydneyAu = { name: "Sydney NSW", lat: -33.87, lng: 151.21, city: "Sydney", country: "Australia", countryCode: "au", placeId: "ChIJSydAu", address: "Sydney NSW, Australia" };
const sydneyCa = { name: "Sydney", lat: 46.14, lng: -60.19, city: "Sydney", country: "Canada", countryCode: "ca", placeId: "ChIJSydCa", address: "Sydney, NS, Canada" };

describe("toPickedPlace", () => {
  it("takes the candidate's name and the rest of its address as the region", () => {
    expect(toPickedPlace(sydneyAu)).toEqual({ name: "Sydney NSW", region: "Australia", lat: -33.87, lng: 151.21, countryCode: "au" });
    expect(toPickedPlace(sydneyCa)?.region).toBe("NS, Canada");
  });
  it("a country-level result has no region", () => {
    expect(toPickedPlace({ name: "Japan", lat: 36, lng: 138, city: null, country: "Japan", countryCode: "jp", placeId: "ChIJJp", address: "Japan" })).toEqual({ name: "Japan", lat: 36, lng: 138, countryCode: "jp" });
  });
  it("falls back to the country as the region when there is no address", () => {
    expect(toPickedPlace({ name: "Kyoto", lat: 35, lng: 135.7, city: "Kyoto", country: "Japan", countryCode: "jp", placeId: null, address: null })?.region).toBe("Japan");
  });
  it("drops a nameless result", () => {
    expect(toPickedPlace({ name: "", lat: 0, lng: 0, city: null, country: null, countryCode: null, placeId: null, address: null })).toBeNull();
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
