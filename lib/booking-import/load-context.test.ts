import { beforeEach, describe, expect, it, vi } from "vitest";
import { MARKER_WHERE } from "@/test/helpers/surprise-visibility";
import { NO_SURPRISES } from "@/lib/surprise-visibility";

const m = vi.hoisted(() => ({
  trip: vi.fn(),
  stops: vi.fn(),
  transports: vi.fn(),
  accommodations: vi.fn(),
  items: vi.fn(),
  visibility: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUnique: m.trip },
    stop: { findMany: m.stops },
    transport: { findMany: m.transports },
    accommodation: { findMany: m.accommodations },
    item: { findMany: m.items },
  },
}));
vi.mock("@/lib/surprise-visibility", async (orig) => ({
  ...(await orig<typeof import("@/lib/surprise-visibility")>()),
  loadSurpriseVisibility: m.visibility,
}));

import { loadImportContext } from "./load-context";

const LISBON = { id: "s-lis", name: "Lisbon", country: "Portugal", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-08", sortOrder: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  m.trip.mockResolvedValue({ homeName: "Brisbane", homeCountryCode: "AU", homeTimezone: "Australia/Brisbane", homeCurrency: "AUD" });
  m.stops.mockResolvedValue([LISBON]);
  m.transports.mockResolvedValue([
    // Departs home 2026-11-30T23:30Z = 09:30 on 1 Dec in Brisbane.
    { id: "t-1", mode: "FLIGHT", reference: "QX7P2M", depAt: new Date("2026-11-30T23:30:00Z"), fromStopId: null, toStopId: "s-lis", depIsHome: true, arrIsHome: false },
  ]);
  m.accommodations.mockResolvedValue([{ id: "a-1", name: "Casa do Rio Lisboa", confirmation: "CDR-55821" }]);
  m.items.mockResolvedValue([{ id: "i-1", title: "Pena Palace entry", booking: "PENA-1" }]);
  m.visibility.mockResolvedValue({ ...NO_SURPRISES, viewerId: "u1", hiddenStopIds: ["s-hidden"], where: MARKER_WHERE });
});

describe("loadImportContext", () => {
  it("reads the plan being viewed and builds the matching context", async () => {
    const { match, context } = await loadImportContext("trip-1", "fork-1", "u1");
    expect(m.stops).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "trip-1", forkId: "fork-1" } }));
    expect(match.home).toEqual({ name: "Brisbane", countryCode: "au", timezone: "Australia/Brisbane" });
    expect(match.stops).toEqual([LISBON]);
    expect([...match.blockedStopIds]).toEqual(["s-hidden"]);
    expect(match.existing.transports).toEqual([{ id: "t-1", mode: "FLIGHT", reference: "QX7P2M", depLocalDate: "2026-12-01", label: "Flight QX7P2M" }]);
    expect(match.existing.accommodations).toEqual([{ id: "a-1", confirmation: "CDR-55821", label: "Casa do Rio Lisboa" }]);
    expect(match.existing.items).toEqual([{ id: "i-1", booking: "PENA-1", label: "Pena Palace entry" }]);
    expect(context).toEqual({
      homeName: "Brisbane",
      homeTimezone: "Australia/Brisbane",
      homeCurrency: "AUD",
      stops: [{ id: "s-lis", name: "Lisbon", country: "Portugal", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-08", sortOrder: 0 }],
    });
  });

  it("leaves Accommodation and Items hidden from the importer out of the duplicate check", async () => {
    await loadImportContext("trip-1", null, "u1");
    expect(m.visibility).toHaveBeenCalledWith("trip-1", "u1");
    expect(m.accommodations).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining(MARKER_WHERE.accommodation) }));
    expect(m.items).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining(MARKER_WHERE.item) }));
  });
});
