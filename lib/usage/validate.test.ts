import { describe, expect, it } from "vitest";
import {
  MAX_APPEAR_MS,
  OPEN_MODES,
  USAGE_ACTIONS,
  USAGE_DETAILS,
  USAGE_PHASES,
  USAGE_SCREENS,
  USAGE_SITES,
} from "./lists";
import { prepareUsageRows } from "./rows";
import { parseUsageBatch } from "./validate";

const NOW = Date.UTC(2026, 11, 1, 12);
const DAY = 86_400_000;
const TRIP = "it-usage-trip";

const plan = { screen: "plan", at: NOW, mode: "desktop", tripId: TRIP, phase: "planning" };
const trips = { screen: "trips", at: NOW, mode: "phone-app" };
const day = { screen: "day", at: NOW, mode: "phone-browser", tripId: TRIP, phase: "travelling", dayOffset: 2, ms: 400, saved: true };
const swipe = { action: "day-changed", detail: "swipe", at: NOW, mode: "phone-app", tripId: TRIP, phase: "travelling", dayOffset: -1 };
const search = { action: "search-opened", at: NOW, mode: "desktop" };
const share = { action: "share-link-opened", at: NOW, mode: "desktop" };

function kept(record: unknown): boolean {
  const batch = parseUsageBatch({ records: [trips, record] }, NOW);
  expect(batch).not.toBeNull();
  expect(batch!.records[0].screen).toBe("trips");
  return batch!.records.length === 2;
}

describe("parseUsageBatch", () => {
  it("normalises a screen and an action", () => {
    expect(parseUsageBatch({ records: [day, swipe] }, NOW)).toEqual({
      records: [
        { screen: "day", action: null, detail: null, tripId: TRIP, phase: "travelling", mode: "phone-browser", appearMs: 400, savedCopy: true, dayOffset: 2, occurredAt: new Date(NOW) },
        { screen: null, action: "day-changed", detail: "swipe", tripId: TRIP, phase: "travelling", mode: "phone-app", appearMs: null, savedCopy: false, dayOffset: -1, occurredAt: new Date(NOW) },
      ],
    });
  });

  it.each([
    ["a plain trip screen", plan],
    ["an app screen", trips],
    ["a Day screen with everything", day],
    ["a day change", swipe],
    ["an action with no Trip", search],
    ["an action on a Trip", { ...search, tripId: TRIP, phase: "past" }],
    ["the share link opened", share],
    ["a More row", { action: "more-row-chosen", detail: "files", at: NOW, mode: "desktop", tripId: TRIP, phase: "planning" }],
    ["a Review kind", { action: "review-started", detail: "deep", at: NOW, mode: "desktop", tripId: TRIP, phase: "planning" }],
    ["a day change with no offset", { ...swipe, dayOffset: undefined }],
    ["ms at 0", { ...plan, ms: 0 }],
    ["ms at the ceiling", { ...plan, ms: MAX_APPEAR_MS }],
    ["dayOffset at -1000", { ...day, dayOffset: -1000 }],
    ["dayOffset at 1000", { ...day, dayOffset: 1000 }],
    ["a 64-character tripId", { ...plan, tripId: "t".repeat(64) }],
    ["What’s new", { screen: "whats-new", at: NOW, mode: "desktop" }],
    ["the More page", { ...plan, screen: "more" }],
  ])("keeps %s", (_, record) => {
    expect(kept(JSON.parse(JSON.stringify(record)))).toBe(true);
  });

  it.each([
    ["a name key", { ...plan, name: "Northvale" }],
    ["a userId key", { ...plan, userId: "someone-else" }],
    ["a site key", { ...plan, site: "main" }],
    ["a url key", { ...trips, url: "/trips/northvale" }],
    ["both screen and action", { ...plan, action: "search-opened" }],
    ["neither screen nor action", { at: NOW, mode: "desktop" }],
    ["an unknown screen", { ...trips, screen: "paris" }],
    ["an unknown action", { ...search, action: "clicked" }],
    ["an unknown mode", { ...trips, mode: "tablet" }],
    ["an unknown phase", { ...plan, phase: "dreaming" }],
    ["a non-string screen", { ...trips, screen: 7 }],
    ["a detail on a screen", { ...plan, detail: "swipe" }],
    ["a detail on an action that takes none", { ...search, detail: "swipe" }],
    ["a missing detail where one is required", { ...swipe, detail: undefined }],
    ["a detail from another action’s list", { ...swipe, detail: "deep" }],
    ["a free-text detail", { ...swipe, detail: "Northvale café" }],
    ["an at too old", { ...trips, at: NOW - 180 * DAY - 1 }],
    ["an at too far ahead", { ...trips, at: NOW + 5 * 60_000 + 1 }],
    ["a fractional at", { ...trips, at: NOW + 0.5 }],
    ["a string at", { ...trips, at: String(NOW) }],
    ["a missing at", { ...trips, at: undefined }],
    ["a negative ms", { ...plan, ms: -1 }],
    ["an ms over the ceiling", { ...plan, ms: MAX_APPEAR_MS + 1 }],
    ["a fractional ms", { ...plan, ms: 1.5 }],
    ["a null ms", { ...plan, ms: null }],
    ["ms on an action", { ...search, ms: 10 }],
    ["a non-boolean saved", { ...plan, saved: "yes" }],
    ["saved on an action", { ...search, saved: true }],
    ["a dayOffset under -1000", { ...day, dayOffset: -1001 }],
    ["a dayOffset over 1000", { ...day, dayOffset: 1001 }],
    ["a fractional dayOffset", { ...day, dayOffset: 0.5 }],
    ["a dayOffset on another screen", { ...plan, dayOffset: 1 }],
    ["a dayOffset on another action", { ...search, tripId: TRIP, phase: "planning", dayOffset: 1 }],
    ["a trip screen with no tripId", { screen: "plan", at: NOW, mode: "desktop" }],
    ["an app screen with a tripId", { ...trips, tripId: TRIP, phase: "planning" }],
    ["the share link opened with a tripId", { ...share, tripId: TRIP, phase: "planning" }],
    ["an empty tripId", { ...plan, tripId: "" }],
    ["a 65-character tripId", { ...plan, tripId: "t".repeat(65) }],
    ["a numeric tripId", { ...plan, tripId: 12 }],
    ["a phase with no tripId", { ...trips, phase: "planning" }],
    ["a tripId with no phase", { ...plan, phase: undefined }],
    ["a non-object record", "trips"],
    ["a null record", null],
    ["an array record", [trips]],
  ])("drops a record with %s, alone", (_, record) => {
    expect(kept(record === null || typeof record !== "object" ? record : JSON.parse(JSON.stringify(record)))).toBe(false);
  });

  it("keeps the at window's edges", () => {
    expect(kept({ ...trips, at: NOW - 180 * DAY })).toBe(true);
    expect(kept({ ...trips, at: NOW + 5 * 60_000 })).toBe(true);
  });

  it("drops a record whose __proto__ is set by the JSON", () => {
    expect(kept(JSON.parse(`{"screen":"trips","at":${NOW},"mode":"desktop","__proto__":{"x":1}}`))).toBe(false);
  });

  it.each([
    ["not an object", "records"],
    ["null", null],
    ["an array", [trips]],
    ["no records", {}],
    ["records not an array", { records: trips }],
    ["an extra top-level key", { records: [trips], extra: 1 }],
    ["an empty batch with an extra key", { records: [], extra: 1 }],
    ["an empty batch", { records: [] }],
    ["101 records", { records: Array.from({ length: 101 }, () => trips) }],
  ])("refuses a body that is %s", (_, body) => {
    expect(parseUsageBatch(body, NOW)).toBeNull();
  });

  it("takes 100 records", () => {
    expect(parseUsageBatch({ records: Array.from({ length: 100 }, () => trips) }, NOW)!.records).toHaveLength(100);
  });

  it("a batch of only bad records is well formed and keeps nothing", () => {
    expect(parseUsageBatch({ records: [{ ...trips, screen: "paris" }] }, NOW)).toEqual({ records: [] });
  });
});

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("free text cannot get in", () => {
  const COLUMNS = ["action", "appearMs", "dayOffset", "detail", "mode", "occurredAt", "phase", "savedCopy", "screen", "site", "tripId", "userId"];
  const rand = mulberry32(0x5eed_2026);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const NOISE = ["Northvale café", "<script>alert(1)</script>", "it's \"quoted\"", "https://example.test/trips/westby?q=1", "Westby Loop", " plan", "PLAN", "trips ", ""];
  const randomString = () => (rand() < 0.5 ? pick(NOISE) : rand().toString(36).slice(2, 2 + Math.floor(rand() * 12)));
  const randomNumber = () => pick([0, 1, -1, 2.5, 1e9, -1e9, NaN, Infinity, NOW, NOW - 200 * DAY, NOW + DAY, MAX_APPEAR_MS + 1]);

  function field<T>(valid: () => T): unknown {
    const r = rand();
    if (r < 0.85) return valid();
    if (r < 0.9) return randomString();
    if (r < 0.94) return randomNumber();
    if (r < 0.97) return null;
    return undefined;
  }

  function randomRecord(): Record<string, unknown> {
    const isScreen = rand() < 0.5;
    const record: Record<string, unknown> = isScreen
      ? {
          screen: field(() => pick(USAGE_SCREENS)),
          ms: rand() < 0.5 ? field(() => Math.floor(rand() * MAX_APPEAR_MS)) : undefined,
          saved: rand() < 0.5 ? field(() => rand() < 0.5) : undefined,
        }
      : {
          action: field(() => pick(USAGE_ACTIONS)),
          detail: rand() < 0.6 ? field(() => pick(USAGE_DETAILS)) : undefined,
        };
    record.at = field(() => NOW - Math.floor(rand() * 10 * DAY));
    record.mode = field(() => pick(OPEN_MODES));
    if (rand() < 0.6) {
      record.tripId = field(() => TRIP);
      record.phase = field(() => pick(USAGE_PHASES));
    }
    if (rand() < 0.4) record.dayOffset = field(() => Math.floor(rand() * 20) - 10);
    if (rand() < 1 / 3) record[pick(["name", "userId", "site", "url", "title", "note", randomString() || "x"])] = randomString();
    for (const key of Object.keys(record)) if (record[key] === undefined) delete record[key];
    return record;
  }

  it("every stored row holds only listed names, the session’s id and a member Trip’s id", () => {
    const rows = [];
    for (let i = 0; i < 50; i++) {
      const batch = parseUsageBatch({ records: Array.from({ length: 100 }, randomRecord) }, NOW);
      expect(batch).not.toBeNull();
      rows.push(
        ...prepareUsageRows(batch!.records, {
          userId: "it-usage-a",
          site: "main",
          memberTripIds: new Set([TRIP]),
          surprisedTripIds: new Set(),
        }),
      );
    }

    expect(rows.length).toBeGreaterThanOrEqual(200);
    const inList = (list: readonly string[], v: unknown) => v === null || (typeof v === "string" && list.includes(v));
    const intIn = (v: unknown, min: number, max: number) => v === null || (Number.isInteger(v) && (v as number) >= min && (v as number) <= max);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(COLUMNS);
      expect(inList(USAGE_SCREENS, row.screen)).toBe(true);
      expect(inList(USAGE_ACTIONS, row.action)).toBe(true);
      expect(inList(USAGE_DETAILS, row.detail)).toBe(true);
      expect(inList(USAGE_PHASES, row.phase)).toBe(true);
      expect(OPEN_MODES).toContain(row.mode);
      expect(USAGE_SITES).toContain(row.site);
      expect((row.screen === null) !== (row.action === null)).toBe(true);
      expect(row.tripId === null || row.tripId === TRIP).toBe(true);
      expect(row.userId).toBe("it-usage-a");
      expect(intIn(row.appearMs, 0, MAX_APPEAR_MS)).toBe(true);
      expect(intIn(row.dayOffset, -1000, 1000)).toBe(true);
      expect(typeof row.savedCopy).toBe("boolean");
      expect(row.occurredAt).toBeInstanceOf(Date);
      expect(Number.isNaN(row.occurredAt.getTime())).toBe(false);
    }
  });
});
