import { describe, expect, it } from "vitest";
import { markerSchema } from "./marker";

describe("markerSchema", () => {
  it("accepts a minimal marker (title + category)", () => {
    const parsed = markerSchema.safeParse({ title: "Tokyo Tower", category: "SIGHTSEEING" });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty title", () => {
    const parsed = markerSchema.safeParse({ title: "  ", category: "OTHER" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown category", () => {
    const parsed = markerSchema.safeParse({ title: "X", category: "NOPE" });
    expect(parsed.success).toBe(false);
  });

  it("accepts full auto-derived location + optional fields", () => {
    const parsed = markerSchema.safeParse({
      title: "Tokyo Tower",
      category: "SIGHTSEEING",
      note: "sunset views",
      link: "https://example.com",
      timing: "late Sept",
      lat: 35.6586,
      lng: 139.7454,
      city: "Tokyo",
      country: "Japan",
      countryCode: "jp",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a javascript: link", () => {
    const parsed = markerSchema.safeParse({
      title: "X",
      category: "OTHER",
      link: "javascript:alert(1)",
    });
    expect(parsed.success).toBe(false);
  });

  it("coerces empty-string optionals to undefined", () => {
    const parsed = markerSchema.safeParse({
      title: "X",
      category: "OTHER",
      note: "",
      link: "",
      timing: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.note).toBeUndefined();
      expect(parsed.data.link).toBeUndefined();
      expect(parsed.data.timing).toBeUndefined();
    }
  });
});
