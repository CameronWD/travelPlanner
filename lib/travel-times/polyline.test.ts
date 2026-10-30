import { describe, expect, it } from "vitest";
import { decodePolyline } from "./polyline";

describe("decodePolyline", () => {
  it("decodes Google's documented sample", () => {
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pts).toHaveLength(3);
    const expected = [
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ];
    expected.forEach((e, i) => {
      expect(pts[i].lat).toBeCloseTo(e.lat, 5);
      expect(pts[i].lng).toBeCloseTo(e.lng, 5);
    });
  });

  it("decodes an empty string to no points", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});
