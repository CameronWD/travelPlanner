import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, MARKER_WHERE } from "@/test/helpers/surprise-visibility";

type FileRow = { id: string; targetType: string; targetId: string; hiddenBySurprise?: boolean };

const m = vi.hoisted(() => ({
  files: [] as FileRow[],
  loadSurpriseVisibility: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUniqueOrThrow: vi.fn(async () => ({ startDate: "2030-06-01", endDate: "2030-06-10", homeTimezone: "Australia/Sydney" })) },
    stop: {
      findMany: vi.fn(async () => [
        { id: "bali", timezone: "Asia/Makassar", arriveDate: "2030-06-01", departDate: "2030-06-05", sortOrder: 0 },
        { id: "london", timezone: "Europe/London", arriveDate: "2030-06-06", departDate: "2030-06-10", sortOrder: 1 },
      ]),
    },
    transport: {
      findMany: vi.fn(async () => [
        {
          id: "dps", mode: "FLIGHT", bookingState: "BOOKED", nothingToAttach: false, reference: "DHZU24",
          depPlace: "Denpasar", arrPlace: "Bangkok", depPlaceId: null, arrPlaceId: null,
          depAt: new Date("2030-06-05T03:00:00Z"), arrAt: new Date("2030-06-05T07:15:00Z"),
          fromStopId: "bali", toStopId: null, depIsHome: false, arrIsHome: false, depTimezone: null, arrTimezone: "Asia/Bangkok",
        },
        {
          id: "bkk", mode: "FLIGHT", bookingState: "BOOKED", nothingToAttach: false, reference: "dhzu24 ",
          depPlace: "Bangkok", arrPlace: "London", depPlaceId: null, arrPlaceId: null,
          depAt: new Date("2030-06-05T09:50:00Z"), arrAt: new Date("2030-06-05T21:00:00Z"),
          fromStopId: null, toStopId: "london", depIsHome: false, arrIsHome: false, depTimezone: "Asia/Bangkok", arrTimezone: null,
        },
      ]),
    },
    accommodation: { findMany: vi.fn(async () => []) },
    item: { findMany: vi.fn(async () => []) },
    attachment: {
      findMany: vi.fn(async ({ where }: { where: { targetId: { in: string[] }; AND?: unknown } }) => {
        const masked = JSON.stringify(where.AND) === JSON.stringify(MARKER_WHERE.attachment.AND);
        return m.files.filter((f) => where.targetId.in.includes(f.targetId) && !(masked && f.hiddenBySurprise));
      }),
    },
  },
}));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/surprise-visibility")>()),
  loadSurpriseVisibility: m.loadSurpriseVisibility,
}));

import { loadBookingConfirmationsToAdd } from "./booking-confirmations-loader";

describe("loadBookingConfirmationsToAdd and one booking", () => {
  beforeEach(() => {
    m.files = [];
    m.loadSurpriseVisibility.mockResolvedValue(NO_SURPRISES);
  });

  it("a Booked leg with no file whose booking partner has one needs no Booking confirmation", async () => {
    m.files = [{ id: "f1", targetType: "TRANSPORT", targetId: "bkk" }];
    expect(await loadBookingConfirmationsToAdd("trip-1", "u-viewer")).toEqual([]);
  });

  it("a Booked leg with no file, when no leg of the booking has a file, each still needs one", async () => {
    expect(await loadBookingConfirmationsToAdd("trip-1", "u-viewer")).toEqual([
      { kind: "TRANSPORT", id: "dps" },
      { kind: "TRANSPORT", id: "bkk" },
    ]);
  });

  it("a Booked leg with no file: a partner's file hidden from this Traveller by a Surprise does not count", async () => {
    m.loadSurpriseVisibility.mockResolvedValue(hiddenVisibility({ hiddenStopIds: ["s-secret"] }));
    m.files = [{ id: "f1", targetType: "TRANSPORT", targetId: "bkk", hiddenBySurprise: true }];
    expect(await loadBookingConfirmationsToAdd("trip-1", "u-viewer")).toEqual([
      { kind: "TRANSPORT", id: "dps" },
      { kind: "TRANSPORT", id: "bkk" },
    ]);
  });
});
