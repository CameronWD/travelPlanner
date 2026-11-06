import { describe, expect, it } from "vitest";
import {
  PLAN_FILE,
  anchorColumns,
  errorStreak,
  formatRow,
  hasAnchor,
  needsDetails,
  plannedHomeTimezone,
  plannedSet,
  plannedStopTimezone,
  readPlan,
  toleranceKm,
  verdict,
  type Plan,
} from "@/lib/backfill-places";

const origin = { lat: 35.0, lng: 139.0 };
const eastKm = (km: number) => ({ lat: 35.0, lng: 139.0 + km / (111.32 * Math.cos((35 * Math.PI) / 180)) });

const FOUND = {
  name: "Ichiran Shibuya",
  lat: 35.6615,
  lng: 139.7005,
  city: "Shibuya City",
  country: "Japan",
  countryCode: "jp", region: null,
  placeId: "ChIJVenue",
  address: "1F 1-22-7 Jinnan, Shibuya City",
};

describe("backfill places", () => {
  it("accepts a stop 20 km away, rejects 30 km", () => {
    expect(toleranceKm("stop")).toBe(25);
    expect(verdict("stop", origin, eastKm(20))).toBe("accept");
    expect(verdict("stop", origin, eastKm(30))).toBe("too-far");
  });

  it("tolerance per kind", () => {
    expect(toleranceKm("home")).toBe(25);
    for (const k of ["item", "accommodation", "transport-dep", "transport-arr", "marker"] as const) expect(toleranceKm(k)).toBe(1);
  });

  it("a distance exactly at the tolerance accepts", () => {
    const next = { lat: 35.0, lng: 139.0 };
    expect(verdict("stop", next, next)).toBe("accept");
    expect(verdict("item", { lat: 0, lng: 0 }, { lat: 0, lng: 1 / 111.19492664455873 })).toBe("accept");
  });

  it("an anchor is text or an old point", () => {
    expect(hasAnchor("", null)).toBe(false);
    expect(hasAnchor("   ", null)).toBe(false);
    expect(hasAnchor(null, null)).toBe(false);
    expect(hasAnchor("", origin)).toBe(true);
    expect(hasAnchor("Kyoto", null)).toBe(true);
  });

  it("accepts an item 0.8 km away, rejects 1.2 km", () => {
    expect(toleranceKm("item")).toBe(1);
    expect(verdict("item", origin, eastKm(0.8))).toBe("accept");
    expect(verdict("item", origin, eastKm(1.2))).toBe("too-far");
  });

  it("a row with no old point is new when Google finds it, venue or address", () => {
    expect(verdict("marker", null, origin)).toBe("new");
    expect(verdict("item", null, { ...origin, matched: "address" })).toBe("new");
  });

  it("an address match never replaces an existing pin, however close", () => {
    expect(verdict("item", origin, { ...eastKm(0.1), matched: "address" })).toBe("address-only");
    expect(verdict("marker", origin, { ...origin, matched: "address" })).toBe("address-only");
    expect(verdict("item", origin, { ...eastKm(0.1), matched: "venue" })).toBe("accept");
  });

  it("no-match when Google finds nothing", () => {
    expect(verdict("item", origin, null)).toBe("no-match");
    expect(verdict("item", null, null)).toBe("no-match");
  });

  it("formatRow prints the exact layout, with what matched and its address", () => {
    expect(
      formatRow({
        kind: "item",
        id: "c1",
        query: "Ichiran, Shibuya",
        old: { lat: 35.659, lng: 139.7 },
        next: { lat: 35.6595, lng: 139.7005, address: "1F 1-22-7 Jinnan, Shibuya City", matched: "venue" },
        verdict: "accept",
      }),
    ).toBe('item c1 · "Ichiran, Shibuya" · 35.65900,139.70000 → 35.65950,139.70050 · 0.1 km · ACCEPT · [venue] 1F 1-22-7 Jinnan, Shibuya City');
    expect(
      formatRow({ kind: "item", id: "c2", query: "Dinner, Shibuya", old: null, next: { lat: 35.6614, lng: 139.7004, address: "Shibuya City, Tokyo", matched: "address" }, verdict: "new" }),
    ).toBe('item c2 · "Dinner, Shibuya" · — → 35.66140,139.70040 · — km · NEW · [address] Shibuya City, Tokyo');
    expect(
      formatRow({ kind: "stop", id: "s1", query: "Paris, France", old: null, next: { lat: 48.8566, lng: 2.3522, address: "Paris, France" }, verdict: "new" }),
    ).toBe('stop s1 · "Paris, France" · — → 48.85660,2.35220 · — km · NEW · Paris, France');
    expect(formatRow({ kind: "marker", id: "m1", query: "Dinner", old: null, next: null, verdict: "no-anchor" })).toBe(
      'marker m1 · "Dinner" · — → — · — km · NO-ANCHOR',
    );
    expect(formatRow({ kind: "home", id: "t1", query: "Leeds", old: null, next: null, verdict: "no-match" })).toBe('home t1 · "Leeds" · — → — · — km · NO-MATCH');
    expect(formatRow({ kind: "home", id: "t2", query: "Leeds", old: null, next: null, verdict: "error" })).toBe('home t2 · "Leeds" · — → — · — km · ERROR');
  });
});

describe("errorStreak", () => {
  it("stops after 5 failed lookups in a row, and a success resets the count", () => {
    const streak = errorStreak();
    for (let i = 0; i < 4; i++) expect(streak.record(true)).toBe(false);
    expect(streak.record(false)).toBe(false);
    for (let i = 0; i < 4; i++) expect(streak.record(true)).toBe(false);
    expect(streak.record(true)).toBe(true);
  });
});

describe("plannedSet", () => {
  it("names each kind's own columns", () => {
    expect(plannedSet("item", FOUND)).toEqual({ lat: 35.6615, lng: 139.7005, placeId: "ChIJVenue", countryCode: "jp" });
    expect(plannedSet("marker", { ...FOUND, countryCode: null })).toEqual({ lat: 35.6615, lng: 139.7005, placeId: "ChIJVenue" });
    expect(plannedSet("accommodation", FOUND)).toEqual({ lat: 35.6615, lng: 139.7005, placeId: "ChIJVenue" });
    expect(plannedSet("stop", FOUND, "Asia/Tokyo")).toEqual({ lat: 35.6615, lng: 139.7005, placeId: "ChIJVenue", countryCode: "jp", timezone: "Asia/Tokyo" });
    expect(plannedSet("transport-dep", FOUND)).toEqual({ depLat: 35.6615, depLng: 139.7005, depPlaceId: "ChIJVenue" });
    expect(plannedSet("transport-arr", FOUND)).toEqual({ arrLat: 35.6615, arrLng: 139.7005, arrPlaceId: "ChIJVenue" });
    expect(plannedSet("home", FOUND, "Asia/Tokyo")).toEqual({
      homeLat: 35.6615,
      homeLng: 139.7005,
      homePlaceId: "ChIJVenue",
      homeCountryCode: "jp",
      homeTimezone: "Asia/Tokyo",
    });
  });
});

describe("anchorColumns", () => {
  it("names the text each kind is looked up by", () => {
    expect(anchorColumns("item")).toEqual(["title", "address"]);
    expect(anchorColumns("accommodation")).toEqual(["name", "address"]);
    expect(anchorColumns("stop")).toEqual(["name", "country"]);
    expect(anchorColumns("transport-dep")).toEqual(["depPlace"]);
    expect(anchorColumns("transport-arr")).toEqual(["arrPlace"]);
    expect(anchorColumns("marker")).toEqual(["title", "city", "country"]);
    expect(anchorColumns("home")).toEqual(["homeName"]);
  });
});

describe("planned timezones", () => {
  const tokyo = { ...FOUND, lat: 35.68, lng: 139.76 };

  it("a new dated Stop with no zone gets the zone at its point", () => {
    expect(plannedStopTimezone({ timezone: null, arriveDate: "2026-11-01", country: "Japan" }, "new", tokyo)).toBe("Asia/Tokyo");
  });

  it("a rough Stop never gets a zone", () => {
    expect(plannedStopTimezone({ timezone: null, arriveDate: null, country: "Japan" }, "new", tokyo)).toBeNull();
  });

  it("an accepted Stop, or one with a zone, keeps what it has", () => {
    expect(plannedStopTimezone({ timezone: null, arriveDate: "2026-11-01", country: "Japan" }, "accept", tokyo)).toBeNull();
    expect(plannedStopTimezone({ timezone: "Asia/Tokyo", arriveDate: "2026-11-01", country: "Japan" }, "new", tokyo)).toBeNull();
  });

  it("a new Home base with no zone gets the zone at its point", () => {
    expect(plannedHomeTimezone({ homeTimezone: null }, "new", tokyo)).toBe("Asia/Tokyo");
    expect(plannedHomeTimezone({ homeTimezone: "Asia/Tokyo" }, "new", tokyo)).toBeNull();
    expect(plannedHomeTimezone({ homeTimezone: null }, "accept", tokyo)).toBeNull();
  });
});

describe("needsDetails", () => {
  it("only an Item whose venue matched against a real address gets Enterprise details", () => {
    expect(needsDetails("item", "Shibuya", { ...FOUND, matched: "venue" })).toBe(true);
    expect(needsDetails("item", "Shibuya", { ...FOUND, matched: "address" })).toBe(false);
    expect(needsDetails("item", "  ", { ...FOUND, matched: "venue" })).toBe(false);
    expect(needsDetails("item", "Shibuya", { ...FOUND, placeId: null, matched: "venue" })).toBe(false);
    expect(needsDetails("marker", "Tokyo, Japan", { ...FOUND, matched: "venue" })).toBe(false);
    expect(needsDetails("stop", "Tokyo", FOUND)).toBe(false);
  });
});

describe("readPlan", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const plan: Plan = {
    version: 1,
    createdAt: "2026-10-30T02:00:00.000Z",
    rows: [
      {
        kind: "item",
        id: "i1",
        query: "Ichiran, Shibuya",
        verdict: "new",
        matched: "venue",
        address: "1F 1-22-7 Jinnan",
        old: null,
        set: { lat: 35.66, lng: 139.7, placeId: "ChIJVenue", countryCode: "jp" },
        was: { title: "Ichiran", address: "Shibuya" },
        details: true,
      },
    ],
  };

  it("the plan file lives in the working directory", () => {
    expect(PLAN_FILE).toBe("backfill-places-plan.json");
  });

  it("reads a plan made within 24 hours", () => {
    expect(readPlan(JSON.stringify(plan), now)).toEqual({ ok: true, plan });
  });

  it("refuses a missing plan", () => {
    expect(readPlan(null, now)).toEqual({ ok: false, error: expect.stringContaining("No plan file") });
  });

  it("refuses a plan older than 24 hours", () => {
    const old = { ...plan, createdAt: "2026-10-29T11:59:00.000Z" };
    expect(readPlan(JSON.stringify(old), now)).toEqual({ ok: false, error: expect.stringContaining("older than 24 hours") });
  });

  it("refuses a file that isn't a plan", () => {
    expect(readPlan("not json", now)).toMatchObject({ ok: false });
    expect(readPlan(JSON.stringify({ ...plan, version: 2 }), now)).toMatchObject({ ok: false });
  });

  it("refuses a row that would set a column its kind doesn't own", () => {
    const bad = { ...plan, rows: [{ ...plan.rows[0], set: { ...plan.rows[0].set, title: "pwned" } }] };
    expect(readPlan(JSON.stringify(bad), now)).toMatchObject({ ok: false });
    const missing = { ...plan, rows: [{ ...plan.rows[0], set: { lat: 1, lng: 2 } }] };
    expect(readPlan(JSON.stringify(missing), now)).toMatchObject({ ok: false });
  });

  it("refuses a row whose captured anchor text isn't exactly its kind's", () => {
    const extra = { ...plan, rows: [{ ...plan.rows[0], was: { title: "Ichiran", address: "Shibuya", notes: "x" } }] };
    expect(readPlan(JSON.stringify(extra), now)).toMatchObject({ ok: false });
    const short = { ...plan, rows: [{ ...plan.rows[0], was: { title: "Ichiran" } }] };
    expect(readPlan(JSON.stringify(short), now)).toMatchObject({ ok: false });
  });
});
