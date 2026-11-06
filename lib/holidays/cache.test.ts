import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { countryCode: string; status: string; holidays: unknown; fetchedAt: Date };

const { rows, db } = vi.hoisted(() => {
  const rows = new Map<string, Row>();
  const db = {
    holidayFeed: {
      findMany: vi.fn(async ({ where }: { where: { countryCode: { in: string[] }; status?: string } }) =>
        [...rows.values()].filter(
          (r) => where.countryCode.in.includes(r.countryCode) && (!where.status || r.status === where.status),
        ),
      ),
      upsert: vi.fn(async ({ where, create, update }: { where: { countryCode: string }; create: Row; update: Partial<Row> }) => {
        const existing = rows.get(where.countryCode);
        rows.set(where.countryCode, existing ? { ...existing, ...update } : create);
      }),
    },
  };
  return { rows, db };
});
vi.mock("@/lib/db", () => ({ db }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("server-only", () => ({}));

import { readHolidayFeeds, refreshHolidayFeeds } from "./cache";

const NOW = new Date("2026-11-06T12:00:00Z");
const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261225",
  "DESCRIPTION:Public holiday",
  "SUMMARY:Christmas Day",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");
const HOLIDAY = { date: "2026-12-25", name: "Christmas Day", kind: "public", regions: null, halfDay: false };
const fetchMock = vi.fn();

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function seed(countryCode: string, status: string, fetchedAt: Date) {
  rows.set(countryCode, { countryCode, status, holidays: status === "OK" ? [HOLIDAY] : [], fetchedAt });
}

beforeEach(() => {
  rows.clear();
  vi.clearAllMocks();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ status: 200, text: async () => ICS });
  vi.stubGlobal("fetch", fetchMock);
});

describe("refreshHolidayFeeds", () => {
  it("fetches a missing country once, parses it and stores OK", async () => {
    await refreshHolidayFeeds(["DE"], NOW);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://calendar.google.com/calendar/ical/en.german%23holiday%40group.v.calendar.google.com/public/basic.ics",
    );
    expect(rows.get("de")).toMatchObject({ status: "OK", holidays: [HOLIDAY], fetchedAt: NOW });
  });

  it("does not refetch a fresh OK row", async () => {
    seed("de", "OK", daysAgo(29));
    await refreshHolidayFeeds(["de"], NOW);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refetches an OK row older than 30 days", async () => {
    seed("de", "OK", daysAgo(31));
    await refreshHolidayFeeds(["de"], NOW);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rows.get("de")?.fetchedAt).toEqual(NOW);
  });

  it("stores ERROR on a non-200 response and retries only after 24 hours", async () => {
    fetchMock.mockResolvedValue({ status: 500, text: async () => "" });
    await refreshHolidayFeeds(["de"], NOW);
    expect(rows.get("de")?.status).toBe("ERROR");

    await refreshHolidayFeeds(["de"], new Date(NOW.getTime() + 23 * 60 * 60 * 1000));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue({ status: 200, text: async () => ICS });
    await refreshHolidayFeeds(["de"], new Date(NOW.getTime() + 25 * 60 * 60 * 1000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rows.get("de")?.status).toBe("OK");
  });

  it("stores ERROR when the fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    await refreshHolidayFeeds(["de"], NOW);
    expect(rows.get("de")?.status).toBe("ERROR");
  });

  it("stores NONE for a country with no feed, without fetching", async () => {
    await refreshHolidayFeeds(["zz"], NOW);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rows.get("zz")?.status).toBe("NONE");
  });

  it("leaves a NONE row alone", async () => {
    seed("zz", "NONE", daysAgo(100));
    await refreshHolidayFeeds(["zz"], NOW);
    expect(db.holidayFeed.upsert).not.toHaveBeenCalled();
  });
});

describe("readHolidayFeeds", () => {
  it("returns OK rows only, omitting ERROR, NONE and missing countries", async () => {
    seed("de", "OK", NOW);
    seed("fr", "ERROR", NOW);
    seed("zz", "NONE", NOW);
    const feeds = await readHolidayFeeds(["DE", "fr", "zz", "it"]);
    expect([...feeds.keys()]).toEqual(["de"]);
    expect(feeds.get("de")).toEqual([HOLIDAY]);
  });
});
