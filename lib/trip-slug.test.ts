import { describe, it, expect } from "vitest";
import { slugifyTripName, withSuffix, slugCandidates, SLUG_MAX, RESERVED_TRIP_SLUGS } from "./trip-slug";

describe("slugifyTripName (ADR 0064, review focus 3)", () => {
  it("lowercases, strips accents, collapses non-alphanumeric runs to single hyphens and trims", () => {
    expect(slugifyTripName("Christmas in Europe 2026")).toBe("christmas-in-europe-2026");
    expect(slugifyTripName("  Côte d'Azur — été!! ")).toBe("cote-d-azur-ete");
    expect(slugifyTripName("São Paulo & Zürich")).toBe("sao-paulo-zurich");
  });
  it("is 'trip' when nothing usable remains", () => {
    expect(slugifyTripName("🌴🌴")).toBe("trip");
    expect(slugifyTripName("---")).toBe("trip");
    expect(slugifyTripName("")).toBe("trip");
  });
  it("caps at 60 characters with no trailing hyphen", () => {
    const s = slugifyTripName(`${"a".repeat(59)} b`);
    expect(s.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(s.endsWith("-")).toBe(false);
    expect(s).toBe("a".repeat(59));
  });
});

describe("withSuffix / slugCandidates", () => {
  it("n = 1 is the base; clashes take -2, -3…", () => {
    expect(withSuffix("paris", 1)).toBe("paris");
    expect(withSuffix("paris", 2)).toBe("paris-2");
    expect(slugCandidates("paris", 1, 3)).toEqual(["paris", "paris-2", "paris-3"]);
  });
  it("a suffix never pushes a slug past 60 characters", () => {
    const base = "a".repeat(60);
    expect(withSuffix(base, 2)).toBe(`${"a".repeat(58)}-2`);
    expect(withSuffix(base, 12).length).toBe(SLUG_MAX);
  });
  it("'new' is reserved: the name 'New' starts at new-2", () => {
    expect(RESERVED_TRIP_SLUGS.has("new")).toBe(true);
    expect(slugifyTripName("New")).toBe("new");
    // Reserved words are dropped from the batch, so 3 slots yield 2 candidates.
    expect(slugCandidates("new", 1, 3)).toEqual(["new-2", "new-3"]);
  });
});
