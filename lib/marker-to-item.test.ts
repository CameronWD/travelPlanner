import { describe, expect, it } from "vitest";
import { markerToWishlistItemData } from "./marker-to-item";
import type { MarkerView } from "@/components/globe/types";

function marker(overrides: Partial<MarkerView> = {}): MarkerView {
  return {
    id: "m1",
    title: "Tokyo Tower",
    category: "SIGHTSEEING",
    note: null,
    link: null,
    timing: null,
    lat: 35.6586,
    lng: 139.7454,
    city: "Tokyo",
    country: "Japan",
    countryCode: "jp",
    ...overrides,
  };
}

describe("markerToWishlistItemData", () => {
  it("maps title, category, and coordinates directly", () => {
    const r = markerToWishlistItemData(marker());
    expect(r.title).toBe("Tokyo Tower");
    expect(r.category).toBe("SIGHTSEEING");
    expect(r.lat).toBe(35.6586);
    expect(r.lng).toBe(139.7454);
  });

  it("joins city and country into address", () => {
    expect(markerToWishlistItemData(marker()).address).toBe("Tokyo, Japan");
  });

  it("uses whichever of city/country is present for address, or null when neither", () => {
    expect(markerToWishlistItemData(marker({ city: null })).address).toBe("Japan");
    expect(markerToWishlistItemData(marker({ country: null })).address).toBe("Tokyo");
    expect(markerToWishlistItemData(marker({ city: null, country: null })).address).toBeNull();
  });

  it("passes the note through as notes when there is no timing", () => {
    expect(markerToWishlistItemData(marker({ note: "Go at sunset" })).notes).toBe("Go at sunset");
  });

  it("folds timing into notes, appended to an existing note", () => {
    expect(
      markerToWishlistItemData(marker({ note: "Go at sunset", timing: "late Sept" })).notes,
    ).toBe("Go at sunset\n(when: late Sept)");
  });

  it("uses timing alone as notes when there is no note", () => {
    expect(markerToWishlistItemData(marker({ note: null, timing: "late Sept" })).notes).toBe(
      "(when: late Sept)",
    );
  });

  it("returns null notes when neither note nor timing is set", () => {
    expect(markerToWishlistItemData(marker()).notes).toBeNull();
  });

  it("carries the link through", () => {
    expect(markerToWishlistItemData(marker({ link: "https://x.example" })).link).toBe(
      "https://x.example",
    );
  });
});
