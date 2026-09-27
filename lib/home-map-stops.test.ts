import { describe, expect, it } from "vitest";
import { buildHomeMapStops } from "./home-map-stops";
import { stopHue } from "@/lib/stop-colours";

const stop = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  sortOrder: 0,
  lat: 1,
  lng: 2,
  countryCode: "fr",
  arriveDate: null as string | null,
  departDate: null as string | null,
  nights: null as number | null,
  ...extra,
});

describe("buildHomeMapStops", () => {
  it("keeps located Stops, numbered by plan position, coloured by sortOrder", () => {
    const out = buildHomeMapStops([
      stop("Kuta, Bali", { sortOrder: 3, arriveDate: "2026-12-04", departDate: "2026-12-08" }),
      stop("Nowhere", { lat: null, lng: null }),
      stop("Paris", { sortOrder: 1, nights: 2 }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["Kuta, Bali", "Paris"]);
    expect(out[0]).toMatchObject({ number: 1, nights: 4, stopColour: stopHue(3), nextLine: "4 nights · then Nowhere" });
    expect(out[1]).toMatchObject({ number: 3, nights: 2, stopColour: stopHue(1), nextLine: "~2 nights" });
  });
});
