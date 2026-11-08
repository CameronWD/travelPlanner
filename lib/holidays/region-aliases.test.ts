import { describe, expect, it } from "vitest";
import { canonicalRegion } from "./region-aliases";

describe("canonicalRegion", () => {
  it("maps German local names to the feed's English", () => {
    expect(canonicalRegion("de", "Bayern")).toBe("Bavaria");
    expect(canonicalRegion("de", "  BAYERN ")).toBe("Bavaria");
    expect(canonicalRegion("DE", "Thüringen")).toBe("Thuringia");
    expect(canonicalRegion("de", "thuringen")).toBe("Thuringia");
  });

  it("leaves a name already in the feed's English unchanged", () => {
    expect(canonicalRegion("de", "Bavaria")).toBe("Bavaria");
    expect(canonicalRegion("de", "Rhineland-Palatinate")).toBe("Rhineland-Palatinate");
    expect(canonicalRegion("gb", "England")).toBe("England");
  });

  it("scopes aliases by country", () => {
    expect(canonicalRegion("at", "Bayern")).toBe("Bayern");
  });

  it("maps Swiss names", () => {
    expect(canonicalRegion("ch", "Canton of Bern")).toBe("Bern");
    expect(canonicalRegion("ch", "Genève")).toBe("Geneva");
    expect(canonicalRegion("ch", "Basel-Landschaft")).toBe("Basel-Land");
    expect(canonicalRegion("ch", "Sankt Gallen")).toBe("St. Gallen");
    expect(canonicalRegion("ch", "Luzern")).toBe("Lucerne");
  });

  it("maps Malaysian names", () => {
    expect(canonicalRegion("my", "Johor Darul Ta'zim")).toBe("Johor");
    expect(canonicalRegion("my", "Federal Territory of Kuala Lumpur")).toBe("Kuala Lumpur");
    expect(canonicalRegion("my", "Wilayah Persekutuan Labuan")).toBe("Labuan");
    expect(canonicalRegion("my", "Melaka")).toBe("Malacca");
  });

  it("returns an unknown name unchanged", () => {
    expect(canonicalRegion("de", "Atlantis")).toBe("Atlantis");
  });
});
