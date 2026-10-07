import { describe, expect, it } from "vitest";
import { coverSmallKeyFor, coverUrlForWidth, isPortrait, showsPortraitCoverFrame } from "./cover";

describe("isPortrait", () => {
  it("is true for a 3:4 portrait aspect (0.75)", () => {
    expect(isPortrait(0.75)).toBe(true);
  });

  it("is false for a 3:2 landscape aspect (1.5)", () => {
    expect(isPortrait(1.5)).toBe(false);
  });

  it("is false when the aspect is unknown (null)", () => {
    expect(isPortrait(null)).toBe(false);
  });

  it("is false when the aspect is undefined", () => {
    expect(isPortrait(undefined)).toBe(false);
  });

  it("is false exactly at the 0.9 threshold (not strictly less than)", () => {
    expect(isPortrait(0.9)).toBe(false);
  });

  it("is true just under the 0.9 threshold", () => {
    expect(isPortrait(0.89)).toBe(true);
  });
});

describe("showsPortraitCoverFrame", () => {
  it("is true for an uploaded portrait photo", () => {
    expect(showsPortraitCoverFrame({ coverImageKey: "k", coverAspect: 0.75 })).toBe(true);
  });
  it("is false with no photo, even if a stale aspect is stored", () => {
    expect(showsPortraitCoverFrame({ coverImageKey: null, coverAspect: 0.75 })).toBe(false);
  });
  it("is false for landscape or square photos", () => {
    expect(showsPortraitCoverFrame({ coverImageKey: "k", coverAspect: 1.5 })).toBe(false);
    expect(showsPortraitCoverFrame({ coverImageKey: "k", coverAspect: 1 })).toBe(false);
  });
  it("is false while the aspect is unknown (null / not selected)", () => {
    expect(showsPortraitCoverFrame({ coverImageKey: "k", coverAspect: null })).toBe(false);
    expect(showsPortraitCoverFrame({ coverImageKey: "k", coverAspect: undefined })).toBe(false);
  });
});

describe("coverSmallKeyFor (spec 2026-10-06 §H)", () => {
  it("stores the small copy under <key>-sm", () => {
    expect(coverSmallKeyFor("trips/t1/abc-cover.webp")).toBe("trips/t1/abc-cover.webp-sm");
  });
});

describe("coverUrlForWidth (spec 2026-10-06 §H)", () => {
  it("asks for the small copy at 600px or under, quantised to one URL", () => {
    expect(coverUrlForWidth("/api/trips/t1/cover?v=k", 256)).toBe("/api/trips/t1/cover?v=k&w=480");
    expect(coverUrlForWidth("/api/trips/t1/cover?v=k", 600)).toBe("/api/trips/t1/cover?v=k&w=480");
    expect(coverUrlForWidth("/api/trips/t1/cover", 96)).toBe("/api/trips/t1/cover?w=480");
  });
  it("keeps the large URL above 600px", () => {
    expect(coverUrlForWidth("/api/trips/t1/cover?v=k", 1080)).toBe("/api/trips/t1/cover?v=k");
  });
});
