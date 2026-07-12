import { describe, it, expect } from "vitest";
import { homeMapPoint } from "@/lib/route-map";

describe("homeMapPoint", () => {
  it("returns null without coords", () => {
    expect(homeMapPoint({ homeName: "Sydney", homeLat: null, homeLng: null })).toBeNull();
    expect(homeMapPoint({ homeName: null, homeLat: -33.8, homeLng: 151.2 })).toBeNull();
  });
  it("returns the point when named + located", () => {
    expect(homeMapPoint({ homeName: "Sydney", homeLat: -33.8, homeLng: 151.2 }))
      .toEqual({ name: "Sydney", lat: -33.8, lng: 151.2 });
  });
});
