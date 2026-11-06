import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { holidayLine, holidaysOnDay, placesOnDay, type PlacesOnDayInput } from "./day";
import { parseHolidayIcs, type FeedHoliday } from "./ics";

function load(name: string) {
  return parseHolidayIcs(readFileSync(join(__dirname, "__fixtures__", `${name}.ics`), "utf8"));
}

const base: PlacesOnDayInput = {
  date: "2026-05-10",
  tripStart: "2026-05-01",
  tripEnd: "2026-05-20",
  home: { countryCode: "gb", region: "England" },
  stops: [],
  transportEnds: [],
};

const stop = (arriveDate: string | null, departDate: string | null, countryCode: string | null, region: string | null = null) => ({
  arriveDate,
  departDate,
  countryCode,
  region,
});

describe("placesOnDay", () => {
  it("gives the one Stop covering the day", () => {
    const places = placesOnDay({ ...base, stops: [stop("2026-05-05", "2026-05-12", "de", "Bavaria")] });
    expect(places).toEqual([{ countryCode: "de", region: "Bavaria" }]);
  });

  it("gives both Stops on a Changeover day", () => {
    const places = placesOnDay({
      ...base,
      stops: [stop("2026-05-05", "2026-05-10", "de", "Bavaria"), stop("2026-05-10", "2026-05-15", "fr", "Paris")],
    });
    expect(places).toEqual([
      { countryCode: "de", region: "Bavaria" },
      { countryCode: "fr", region: "Paris" },
    ]);
  });

  it("ignores rough Stops and Stops without a country", () => {
    const places = placesOnDay({ ...base, stops: [stop(null, null, "de", "Bavaria"), stop("2026-05-05", "2026-05-12", null)] });
    expect(places).toEqual([]);
  });

  it("gives nothing on a Gap day spent only in the air", () => {
    expect(placesOnDay({ ...base, transportEnds: [{ date: "2026-05-09", place: { countryCode: "id", region: "Bali" }, isHome: false }] })).toEqual([]);
  });

  it("gives the country a Transport end lands in on a Gap day", () => {
    const places = placesOnDay({
      ...base,
      transportEnds: [{ date: "2026-05-10", place: { countryCode: "id", region: "Bali" }, isHome: false }],
    });
    expect(places).toEqual([{ countryCode: "id", region: "Bali" }]);
  });

  it("gives the Home base for a home Transport end on a Gap day", () => {
    const places = placesOnDay({ ...base, transportEnds: [{ date: "2026-05-10", place: null, isHome: true }] });
    expect(places).toEqual([{ countryCode: "gb", region: "England" }]);
  });

  it("skips a Transport end with no place that is not home", () => {
    expect(placesOnDay({ ...base, transportEnds: [{ date: "2026-05-10", place: null, isHome: false }] })).toEqual([]);
  });

  it("ignores Transport ends on a day a Stop covers", () => {
    const places = placesOnDay({
      ...base,
      stops: [stop("2026-05-05", "2026-05-12", "de", "Bavaria")],
      transportEnds: [{ date: "2026-05-10", place: { countryCode: "id", region: "Bali" }, isHome: false }],
    });
    expect(places).toEqual([{ countryCode: "de", region: "Bavaria" }]);
  });

  it("adds the Home base on the first and last day only", () => {
    const stops = [stop("2026-05-01", "2026-05-20", "de", "Bavaria")];
    const first = placesOnDay({ ...base, date: "2026-05-01", stops });
    const last = placesOnDay({ ...base, date: "2026-05-20", stops });
    const middle = placesOnDay({ ...base, date: "2026-05-10", stops });
    expect(first).toContainEqual({ countryCode: "gb", region: "England" });
    expect(last).toContainEqual({ countryCode: "gb", region: "England" });
    expect(middle).toEqual([{ countryCode: "de", region: "Bavaria" }]);
  });

  it("dedupes by country and Region", () => {
    const places = placesOnDay({
      ...base,
      date: "2026-05-01",
      stops: [stop("2026-05-01", "2026-05-10", "gb", "England"), stop("2026-05-01", "2026-05-10", "gb", "england")],
    });
    expect(places).toEqual([{ countryCode: "gb", region: "England" }]);
  });
});

describe("holidaysOnDay", () => {
  const feeds = new Map<string, FeedHoliday[]>([
    ["de", load("german")],
    ["id", load("indonesian")],
    ["gb", load("uk")],
  ]);
  const epiphany = (region: string | null) => holidaysOnDay([{ countryCode: "de", region }], "2026-01-06", feeds);

  it("shows a regional holiday for a matching Region with no named Regions", () => {
    expect(epiphany("Bavaria")).toEqual([
      { countryCode: "de", name: "Epiphany (regional holiday)", kind: "public", halfDay: false, namedRegions: null },
    ]);
  });

  it("matches a Region ignoring case and diacritics", () => {
    expect(epiphany("  baden-wurttemberg ")).toHaveLength(1);
    expect(epiphany("baden-wurttemberg")[0]?.namedRegions).toBeNull();
  });

  it("hides a regional holiday for a Region in the feed's vocabulary that it does not list", () => {
    expect(epiphany("Berlin")).toEqual([]);
  });

  it("falls back to named Regions for a Region outside the vocabulary", () => {
    expect(epiphany("Bayern")[0]?.namedRegions).toEqual(["Baden-Württemberg", "Bavaria", "Saxony-Anhalt"]);
  });

  it("falls back to named Regions when the place has no Region", () => {
    expect(epiphany(null)[0]?.namedRegions).toEqual(["Baden-Württemberg", "Bavaria", "Saxony-Anhalt"]);
  });

  it("shows Christmas Day once per country on a Changeover day", () => {
    const fr: FeedHoliday[] = [{ date: "2026-12-25", name: "Christmas Day", kind: "public", regions: null, halfDay: false }];
    const result = holidaysOnDay(
      [
        { countryCode: "de", region: "Bavaria" },
        { countryCode: "de", region: "Berlin" },
        { countryCode: "fr", region: null },
      ],
      "2026-12-25",
      new Map([...feeds, ["fr", fr]]),
    );
    expect(result.map((h) => [h.countryCode, h.name])).toEqual([
      ["de", "Christmas Day"],
      ["fr", "Christmas Day"],
    ]);
  });

  it("prefers the exact match over the named-Regions fallback within a country", () => {
    const result = holidaysOnDay(
      [
        { countryCode: "de", region: null },
        { countryCode: "de", region: "Bavaria" },
      ],
      "2026-01-06",
      feeds,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.namedRegions).toBeNull();
  });

  it("keeps the half-day public holiday", () => {
    expect(holidaysOnDay([{ countryCode: "de", region: null }], "2026-12-24", feeds)).toMatchObject([
      { name: "Christmas Eve (half-day)", kind: "public", halfDay: true },
    ]);
  });

  it("keeps only the named observances", () => {
    const obs = (name: string, date = "2026-02-14"): FeedHoliday => ({ date, name, kind: "observance", regions: null, halfDay: false });
    const f = new Map([
      [
        "xx",
        [
          obs("Valentine's Day"),
          obs("Christmas Eve", "2026-02-14"),
          obs("New Year's Eve", "2026-02-14"),
          obs("Good Friday", "2026-02-14"),
          obs("Mother's Day"),
        ],
      ],
    ]);
    expect(holidaysOnDay([{ countryCode: "xx", region: null }], "2026-02-14", f).map((h) => h.name)).toEqual([
      "Christmas Eve",
      "New Year's Eve",
      "Good Friday",
    ]);
  });

  it("drops the German Carnival Tuesday observance", () => {
    expect(holidaysOnDay([{ countryCode: "de", region: null }], "2026-02-17", feeds)).toEqual([]);
  });

  it("returns nothing for a year with no events or a country missing from feeds", () => {
    expect(holidaysOnDay([{ countryCode: "de", region: null }], "2031-12-25", feeds)).toEqual([]);
    expect(holidaysOnDay([{ countryCode: "fr", region: null }], "2026-12-25", feeds)).toEqual([]);
  });

  it("shows the Indonesian national holiday for a Bali place", () => {
    expect(holidaysOnDay([{ countryCode: "id", region: "Bali" }], "2026-03-19", feeds)).toHaveLength(1);
  });
});

describe("holidayLine", () => {
  const h = { countryCode: "de", name: "Christmas Day", kind: "public" as const, halfDay: false, namedRegions: null };

  it("writes the public form", () => {
    expect(holidayLine(h)).toBe("Christmas Day (Germany): public holiday, expect closures");
  });

  it("writes the half-day form", () => {
    expect(holidayLine({ ...h, name: "Christmas Eve", halfDay: true })).toBe(
      "Christmas Eve (Germany): half-day public holiday, many places close early",
    );
  });

  it("writes the observance form", () => {
    expect(holidayLine({ ...h, name: "Good Friday", kind: "observance" })).toBe("Good Friday (Germany): many places close early");
  });

  it("writes the regional fallback form", () => {
    expect(holidayLine({ ...h, name: "Epiphany", namedRegions: ["Baden-Württemberg", "Bavaria", "Saxony-Anhalt"] })).toBe(
      "Epiphany: public holiday in parts of Germany (Baden-Württemberg, Bavaria, Saxony-Anhalt)",
    );
  });
});
