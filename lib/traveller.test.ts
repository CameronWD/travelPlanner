import { describe, it, expect } from "vitest";
import {
  travellerName,
  travellerFirstName,
  travellerImageUrl,
  travellerInitials,
  needsDisplayName,
} from "./traveller";

const base = { id: "u1", name: null, image: null };

describe("travellerName", () => {
  it("prefers displayName, then provider name, then email local part", () => {
    expect(
      travellerName({ ...base, displayName: "Cam", name: "Cameron Williams" }),
    ).toBe("Cam");
    expect(travellerName({ ...base, name: "Cameron Williams" })).toBe(
      "Cameron Williams",
    );
    expect(travellerName({ ...base, email: "xanthia@example.com" })).toBe(
      "xanthia",
    );
    expect(travellerName(base)).toBe("Traveller");
  });
});

describe("travellerFirstName", () => {
  it("first name is the first word", () =>
    expect(
      travellerFirstName({ ...base, name: "Cameron Williams" }),
    ).toBe("Cameron"));
});

describe("travellerImageUrl", () => {
  it("uploaded photo wins over provider image, with a cache-buster", () => {
    expect(
      travellerImageUrl({
        ...base,
        image: "https://g/x.png",
        photoKey: "k",
        photoUpdatedAt: new Date(5),
      }),
    ).toBe("/api/avatars/u1?v=5");
    expect(travellerImageUrl({ ...base, image: "https://g/x.png" })).toBe(
      "https://g/x.png",
    );
    expect(travellerImageUrl(base)).toBeNull();
  });
});

describe("travellerInitials", () => {
  it("initials never empty", () => {
    expect(travellerInitials({ ...base, name: "cameron williams" })).toBe(
      "CW",
    );
    expect(travellerInitials(base)).toBe("T");
  });
});

describe("needsDisplayName (spec 2026-10-04 §E)", () => {
  it("is true only with no display name and no provider name", () => {
    expect(needsDisplayName({ name: null, displayName: null })).toBe(true);
    expect(needsDisplayName({ name: null })).toBe(true);
    expect(needsDisplayName({ name: "Cameron Williams", displayName: null })).toBe(false);
    expect(needsDisplayName({ name: null, displayName: "Cam" })).toBe(false);
  });

  it("treats a whitespace-only name as no name", () => {
    expect(needsDisplayName({ name: "   ", displayName: " " })).toBe(true);
  });
});
