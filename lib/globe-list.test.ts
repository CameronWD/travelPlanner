import { describe, expect, it } from "vitest";
import { filterMarkers, groupMarkersByCountry, distinctCountries } from "./globe-list";
import type { MarkerView } from "@/components/globe/types";

const m = (over: Partial<MarkerView>): MarkerView => ({
  id: "x",
  title: "X",
  category: "OTHER",
  note: null,
  link: null,
  timing: null,
  lat: 0,
  lng: 0,
  city: null,
  country: null,
  countryCode: null,
  ...over,
});

const markers: MarkerView[] = [
  m({ id: "1", title: "Tokyo Tower", category: "SIGHTSEEING", country: "Japan", city: "Tokyo" }),
  m({ id: "2", title: "Ramen bar", category: "FOOD", country: "Japan", city: "Osaka" }),
  m({ id: "3", title: "Eiffel Tower", category: "SIGHTSEEING", country: "France", city: "Paris" }),
  m({ id: "4", title: "Someday place", category: "OTHER", country: null }),
];

describe("filterMarkers", () => {
  it("filters by category", () => {
    const r = filterMarkers(markers, { category: "FOOD", country: null, query: "" });
    expect(r.map((x) => x.id)).toEqual(["2"]);
  });
  it("filters by country", () => {
    const r = filterMarkers(markers, { category: null, country: "France", query: "" });
    expect(r.map((x) => x.id)).toEqual(["3"]);
  });
  it("filters by case-insensitive text across title/city/country", () => {
    expect(filterMarkers(markers, { category: null, country: null, query: "paris" }).map((x) => x.id)).toEqual(["3"]);
    expect(filterMarkers(markers, { category: null, country: null, query: "osaka" }).map((x) => x.id)).toEqual(["2"]);
  });
  it("returns all when filter is empty", () => {
    expect(filterMarkers(markers, { category: null, country: null, query: "" })).toHaveLength(4);
  });
});

describe("groupMarkersByCountry", () => {
  it("groups alphabetically with unresolved last as 'Unpinned'", () => {
    const groups = groupMarkersByCountry(markers);
    expect(groups.map((g) => g.country)).toEqual(["France", "Japan", "Unpinned"]);
    expect(groups[1].markers.map((x) => x.id)).toEqual(["1", "2"]);
  });
});

describe("distinctCountries", () => {
  it("returns sorted unique non-null countries", () => {
    expect(distinctCountries(markers)).toEqual(["France", "Japan"]);
  });
});
