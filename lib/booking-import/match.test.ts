import { describe, expect, it } from "vitest";
import { countryCodeOf, outsideStay, resolvePlace, sameCity, type MatchHome, type MatchStop } from "./match";

const LISBON: MatchStop = { id: "s-lis", name: "Lisbon", country: "Portugal", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-08", sortOrder: 0 };
const PORTO: MatchStop = { id: "s-opo", name: "Porto", country: "Portugal", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2026-12-08", departDate: "2026-12-15", sortOrder: 1 };
const HOME: MatchHome = { name: "Brisbane, Queensland", countryCode: "au", timezone: "Australia/Brisbane" };
const CTX = { home: HOME, stops: [LISBON, PORTO] };
const END = { allowHome: true, allowNew: true, anyStopOnDate: false };
const STAY = { allowHome: false, allowNew: true, anyStopOnDate: false };
const ITEM = { allowHome: false, allowNew: true, anyStopOnDate: true };
const q = (city: string | null, country: string | null, place: string | null = null) => ({ city, country, place });

describe("sameCity", () => {
  it("finds a Stop's name inside an airport or station name, ignoring accents and case", () => {
    expect(sameCity("Lisbon Airport (LIS)", "Lisbon")).toBe(true);
    expect(sameCity("SAO PAULO", "São Paulo, Brazil")).toBe(true);
    expect(sameCity("Lisboa", "Lisbon")).toBe(false);
    expect(sameCity("Portoroz", "Porto")).toBe(false);
    expect(sameCity(null, "Porto")).toBe(false);
  });
});

describe("countryCodeOf", () => {
  it("reads names, codes and common aliases", () => {
    expect(countryCodeOf("Portugal")).toBe("pt");
    expect(countryCodeOf("PT")).toBe("pt");
    expect(countryCodeOf("United Kingdom")).toBe("gb");
    expect(countryCodeOf("UK")).toBe("gb");
    expect(countryCodeOf("Atlantis")).toBeNull();
    expect(countryCodeOf(null)).toBeNull();
  });
});

describe("resolvePlace", () => {
  it("matches Home by city or by country alone, but not another city in Home's country", () => {
    expect(resolvePlace(q("Brisbane", "Australia", "Brisbane (BNE)"), { from: "2026-12-01", to: null }, CTX, END)).toEqual({ kind: "home" });
    expect(resolvePlace(q(null, "Australia"), { from: null, to: null }, CTX, END)).toEqual({ kind: "home" });
    expect(resolvePlace(q("Sydney", "Australia"), { from: "2026-12-01", to: null }, CTX, END)).toMatchObject({ kind: "new", name: "Sydney", countryCode: "au" });
  });

  it("matches Home by city only when the countries agree (BI-14)", () => {
    // Brisbane, California is not the Home base in Brisbane, Australia.
    expect(resolvePlace(q("Brisbane", "United States"), { from: "2026-12-01", to: null }, CTX, END)).toEqual({
      kind: "new",
      key: "brisbane|us",
      name: "Brisbane",
      country: "United States",
      countryCode: "us",
    });
    // An unknown country on either side is no disagreement (Review Focus 2).
    expect(resolvePlace(q("Brisbane", null, "Brisbane (BNE)"), { from: "2026-12-01", to: null }, CTX, END)).toEqual({ kind: "home" });
    expect(resolvePlace(q("Brisbane", "United States"), { from: null, to: null }, { ...CTX, home: { ...HOME, countryCode: null } }, END)).toEqual({ kind: "home" });
  });

  it("matches a Stop by contained city name only when the countries agree (BI-14, already true)", () => {
    const YORK: MatchStop = { id: "s-york", name: "York", country: "United Kingdom", countryCode: "gb", timezone: "Europe/London", arriveDate: "2026-12-15", departDate: "2026-12-18", sortOrder: 2 };
    expect(resolvePlace(q("New York City", "United States"), { from: "2026-12-16", to: null }, { home: HOME, stops: [YORK] }, STAY)).toMatchObject({ kind: "new", countryCode: "us" });
    expect(resolvePlace(q("Porto Alegre", "Brazil"), { from: "2026-12-09", to: null }, CTX, STAY)).toMatchObject({ kind: "new", countryCode: "br" });
  });

  it("a city match beats a Stop whose dates overlap (Review Focus 4)", () => {
    expect(resolvePlace(q("Porto", "Portugal"), { from: "2026-12-03", to: "2026-12-07" }, CTX, STAY)).toEqual({ kind: "stop", stop: PORTO });
  });

  it("with only a country, takes the Stop in that country covering the dates", () => {
    expect(resolvePlace(q(null, "Portugal"), { from: "2026-12-09", to: "2026-12-11" }, CTX, STAY)).toEqual({ kind: "stop", stop: PORTO });
  });

  it("a stay in a city that is no Stop proposes one, even inside a same-country stay", () => {
    expect(resolvePlace(q("Sintra", "Portugal"), { from: "2026-12-03", to: "2026-12-04" }, CTX, STAY)).toEqual({
      kind: "new",
      key: "sintra|pt",
      name: "Sintra",
      country: "Portugal",
      countryCode: "pt",
    });
  });

  it("a thing to do on a day trip joins the Stop covering its date", () => {
    expect(resolvePlace(q("Sintra", "Portugal"), { from: "2026-12-04", to: "2026-12-04" }, CTX, ITEM)).toEqual({ kind: "stop", stop: LISBON });
  });

  it("picks the visit nearest the booking when a city is on the plan twice", () => {
    const again: MatchStop = { ...LISBON, id: "s-lis-2", arriveDate: "2026-12-20", departDate: "2026-12-22", sortOrder: 2 };
    const ctx = { home: HOME, stops: [LISBON, PORTO, again] };
    expect(resolvePlace(q("Lisbon", "Portugal"), { from: "2026-12-21", to: "2026-12-21" }, ctx, STAY)).toEqual({ kind: "stop", stop: again });
  });

  it("finds nothing for an empty place when new Stops aren't allowed", () => {
    expect(resolvePlace(q(null, null), { from: null, to: null }, CTX, { allowHome: false, allowNew: false, anyStopOnDate: true })).toEqual({ kind: "none" });
  });
});

describe("outsideStay", () => {
  it("is true only for a date outside the Stop's arrive..depart", () => {
    expect(outsideStay(LISBON, "2026-12-15")).toBe(true);
    expect(outsideStay(LISBON, "2026-12-08")).toBe(false);
    expect(outsideStay(LISBON, null)).toBe(false);
  });
});
