import { describe, expect, it } from "vitest";
import { clusterStops, clusterLabel, haversineKm, type GeoPoint } from "./geo-cluster";

// European cities, chosen so consecutive pairs are well within the 1500km
// single-linkage threshold (verified against lib/geo.ts's haversineKm), even
// though the extremes (e.g. Warsaw ↔ Lisbon) are not directly within it.
const paris: GeoPoint = { id: "paris", lat: 48.8566, lng: 2.3522, countryCode: "fr" };
const rome: GeoPoint = { id: "rome", lat: 41.9028, lng: 12.4964, countryCode: "it" };
const vienna: GeoPoint = { id: "vienna", lat: 48.2082, lng: 16.3738, countryCode: "at" };
const berlin: GeoPoint = { id: "berlin", lat: 52.52, lng: 13.405, countryCode: "de" };
const madrid: GeoPoint = { id: "madrid", lat: 40.4168, lng: -3.7038, countryCode: "es" };
const amsterdam: GeoPoint = { id: "amsterdam", lat: 52.3676, lng: 4.9041, countryCode: "nl" };
const prague: GeoPoint = { id: "prague", lat: 50.0755, lng: 14.4378, countryCode: "cz" };
const budapest: GeoPoint = { id: "budapest", lat: 47.4979, lng: 19.0402, countryCode: "hu" };
const warsaw: GeoPoint = { id: "warsaw", lat: 52.2297, lng: 21.0122, countryCode: "pl" };
const lisbon: GeoPoint = { id: "lisbon", lat: 38.7223, lng: -9.1393, countryCode: "pt" };
const europeStops = [
  paris, rome, vienna, berlin, madrid, amsterdam, prague, budapest, warsaw, lisbon,
];

const bali: GeoPoint = { id: "bali", lat: -8.4095, lng: 115.1889, countryCode: "id" };

describe("clusterStops", () => {
  it("puts far-apart Bali alone and groups the 10 European stops together", () => {
    const clusters = clusterStops([bali, ...europeStops]);

    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toHaveLength(10); // largest first
    expect(clusters[0].map((p) => p.id).sort()).toEqual(
      europeStops.map((p) => p.id).sort(),
    );
    expect(clusters[1]).toEqual([bali]);
  });

  it("returns one cluster of one for a single Stop", () => {
    expect(clusterStops([paris])).toEqual([[paris]]);
  });

  it("ignores points without finite lat/lng", () => {
    const broken: GeoPoint = { id: "broken", lat: NaN, lng: 2.3522, countryCode: "fr" };
    const clusters = clusterStops([paris, broken, rome]);

    const allPoints = clusters.flat();
    expect(allPoints).not.toContainEqual(broken);
    expect(allPoints.map((p) => p.id).sort()).toEqual(["paris", "rome"]);
  });

  it("returns [] for empty input", () => {
    expect(clusterStops([])).toEqual([]);
  });

  it("breaks size ties by the earliest point in input order", () => {
    // Two pairs, each internally close but far from the other pair.
    // Second pair appears first in input order, so it should win the tie.
    const a1: GeoPoint = { id: "a1", lat: 10, lng: 10 };
    const a2: GeoPoint = { id: "a2", lat: 10.1, lng: 10.1 };
    const b1: GeoPoint = { id: "b1", lat: -30, lng: -60 };
    const b2: GeoPoint = { id: "b2", lat: -30.1, lng: -60.1 };

    const clusters = clusterStops([b1, b2, a1, a2]);

    expect(clusters).toHaveLength(2);
    expect(clusters[0].map((p) => p.id)).toEqual(["b1", "b2"]);
    expect(clusters[1].map((p) => p.id)).toEqual(["a1", "a2"]);
  });

  it("respects a custom thresholdKm", () => {
    // Paris and Rome are ~1100km apart — clustered by default, split apart
    // under a tight threshold.
    const wide = clusterStops([paris, rome], 1500);
    expect(wide).toHaveLength(1);

    const tight = clusterStops([paris, rome], 500);
    expect(tight).toHaveLength(2);
  });
});

describe("clusterLabel", () => {
  it("labels a mixed-country European cluster with the shared continent", () => {
    expect(clusterLabel([paris, rome, vienna])).toBe("Europe");
  });

  it("labels a single-country cluster with the country name", () => {
    const allFrance: GeoPoint[] = [
      { id: "p1", lat: 48.8566, lng: 2.3522, countryCode: "fr" },
      { id: "p2", lat: 45.764, lng: 4.8357, countryCode: "fr" }, // Lyon
      { id: "p3", lat: 43.2965, lng: 5.3698, countryCode: "fr" }, // Marseille
    ];
    expect(clusterLabel(allFrance)).toBe("France");
  });

  it("falls back to Main route when countries and continents both differ", () => {
    expect(clusterLabel([paris, bali])).toBe("Main route");
  });

  it("falls back to Main route for an empty cluster", () => {
    expect(clusterLabel([])).toBe("Main route");
  });

  it("falls back to Main route when countryCode is missing and no shared continent applies", () => {
    const unlocated: GeoPoint[] = [{ id: "u1", lat: 1, lng: 1, countryCode: null }];
    // Single point, no countryCode: no shared country, continentOf(null) is
    // null, so no shared continent either.
    expect(clusterLabel(unlocated)).toBe("Main route");
  });
});

describe("haversineKm", () => {
  it("Sydney → Denpasar (Bali) is roughly 4,500km", () => {
    const sydney = { lat: -33.8688, lng: 151.2093 };
    const denpasar = { lat: -8.65, lng: 115.2167 };
    const km = haversineKm(sydney, denpasar);
    // True great-circle distance for these coordinates is ~4,620km; the
    // brief's "≈4,500 ± 100" is a rough ballpark, so we use a generous band
    // (matching lib/geo.test.ts's convention) rather than a tight literal
    // ±100 that would make this test coordinate-fragile.
    expect(km).toBeGreaterThan(4400);
    expect(km).toBeLessThan(4700);
  });
});
