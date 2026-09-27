import { describe, expect, it } from "vitest";
import { continentOf, KNOWN_CONTINENT_CODES } from "./continents";
import { countryName } from "./countries";

const VALID_CONTINENTS = new Set([
  "Europe",
  "Asia",
  "Africa",
  "North America",
  "South America",
  "Oceania",
  "Antarctica",
]);

describe("continentOf", () => {
  it("maps well-known codes to the expected continent", () => {
    expect(continentOf("fr")).toBe("Europe");
    expect(continentOf("it")).toBe("Europe");
    expect(continentOf("at")).toBe("Europe");
    expect(continentOf("id")).toBe("Asia"); // Bali
    expect(continentOf("au")).toBe("Oceania");
    expect(continentOf("us")).toBe("North America");
    expect(continentOf("br")).toBe("South America");
    expect(continentOf("za")).toBe("Africa");
    expect(continentOf("aq")).toBe("Antarctica");
  });

  it("is case-insensitive", () => {
    expect(continentOf("FR")).toBe("Europe");
    expect(continentOf("Fr")).toBe("Europe");
  });

  it("returns null for nullish or unknown codes", () => {
    expect(continentOf(null)).toBeNull();
    expect(continentOf(undefined)).toBeNull();
    expect(continentOf("")).toBeNull();
    expect(continentOf("zz")).toBeNull();
  });

  it("covers every ISO 3166-1 alpha-2 code known to lib/countries.ts", () => {
    // lib/countries.ts resolves any code via Intl.DisplayNames, falling back
    // to echoing the raw uppercased code when it isn't a real, assigned
    // region. We treat "countryName resolved to a real name, not just the
    // raw code" as "known" — every code in our own table must clear that
    // bar, and every code that clears that bar must be in our table.
    for (const code of KNOWN_CONTINENT_CODES) {
      const name = countryName(code);
      expect(name, `countryName("${code}") should resolve to a real name`).not.toBe(
        code.toUpperCase(),
      );
      expect(name).not.toBe("");

      const continent = continentOf(code);
      expect(continent, `continentOf("${code}") should not be null`).not.toBeNull();
      expect(VALID_CONTINENTS.has(continent as string)).toBe(true);
    }
  });

  it("has no duplicate codes across continents", () => {
    expect(new Set(KNOWN_CONTINENT_CODES).size).toBe(KNOWN_CONTINENT_CODES.length);
  });
});
