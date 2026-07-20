import { describe, it, expect } from "vitest";
import { buildGlobe, GLOBE_MARKER_KEYS } from "./globe";
import { CATEGORY_VALUES } from "@/lib/categories";

describe("buildGlobe", () => {
  const g = buildGlobe();
  it("has both travellers as members, one owner", () => {
    expect(g.members).toHaveLength(2);
    expect(g.members.filter((m) => m.role === "owner")).toHaveLength(1);
  });
  it("has at least 12 markers, all with valid categories and lowercase country codes", () => {
    expect(g.markers.length).toBeGreaterThanOrEqual(12);
    for (const m of g.markers) {
      expect(CATEGORY_VALUES).toContain(m.category);
      if (m.countryCode) expect(m.countryCode).toBe(m.countryCode.toLowerCase());
    }
  });
  it("covers every trip region so both trips get overlap suggestions", () => {
    const codes = new Set(g.markers.map((m) => m.countryCode));
    for (const c of ["fi", "de", "gb", "ie", "fr", "it", "ch", "jp"]) expect(codes.has(c)).toBe(true);
  });
  it("has >=2 markers carrying attachments and >=1 with both timing and link", () => {
    expect(g.markers.filter((m) => (m.attachments?.length ?? 0) > 0).length).toBeGreaterThanOrEqual(2);
    expect(g.markers.some((m) => m.timing && m.link)).toBe(true);
  });
  it("has exactly one pending globe invite", () => {
    expect(g.invites ?? []).toHaveLength(1);
  });
  it("exports the marker keys the EU wishlist links to", () => {
    const keys = new Set(g.markers.map((m) => m.key));
    expect(keys.has(GLOBE_MARKER_KEYS.versailles)).toBe(true);
    expect(keys.has(GLOBE_MARKER_KEYS.kemi)).toBe(true);
  });
});
