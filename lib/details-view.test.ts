import { describe, it, expect } from "vitest";
import { accommodationDetails, itemDetails, transportDetails, type DetailsContext, type DetailsView } from "./details-view";
import { formatMoney } from "@/lib/money/money";
import { zoneLabel } from "@/lib/time-display";
import type { AttachmentView } from "@/lib/attachment-view";
import type { CostRow } from "@/lib/money/cost-row";
import type { ItemCardItem } from "@/lib/plan-entity-views";
import type { PlaceholderItem } from "@/lib/surprise-visibility";

const file: AttachmentView = {
  id: "f1", filename: "ticket.pdf", mime: "application/pdf", size: 10, url: "/api/attachments/f1",
  uploadedById: "u1", createdAt: new Date("2026-11-01T00:00:00Z"),
};

function cost(over: Partial<CostRow> = {}): CostRow {
  return {
    id: "c1", costMinor: 12000, paidMinor: null, currency: "EUR", rateToHome: null, paidAt: null, dueDate: null,
    ownerType: "ITEM", ownerId: "i1", label: null, category: null, settlement: "BEFORE", ...over,
  };
}

const ctx: DetailsContext = { attachments: [], costs: [] };

const EMPTY: Omit<DetailsView, "title"> = {
  subtitle: null, times: [], files: [], reference: null, address: null, place: null,
  notes: null, link: null, tryList: null, openingHours: null, cost: null,
};

describe("transportDetails", () => {
  it("each end in its own zone, with its own date", () => {
    const v = transportDetails(
      {
        id: "t1", mode: "TRAIN", bookingStateSet: false, sortOrder: 0,
        fromStopName: "Paris", toStopName: "Munich",
        fromStopTimezone: "Europe/Paris", toStopTimezone: "Europe/Berlin",
        depAt: new Date("2026-12-05T08:30:00Z"), arrAt: new Date("2026-12-05T15:10:00Z"),
        reference: "ABC123", notes: "Coach 7",
      },
      { ...ctx, attachments: [file], costs: [cost({ ownerType: "TRANSPORT", ownerId: "t1" })] },
    );
    expect(v).toEqual({
      ...EMPTY,
      title: "Paris → Munich",
      subtitle: "Train",
      times: [
        { label: "Departs", value: `5 Dec 09:30 ${zoneLabel("Europe/Paris", "2026-12-05")}` },
        { label: "Arrives", value: `5 Dec 16:10 ${zoneLabel("Europe/Berlin", "2026-12-05")}` },
      ],
      files: [file],
      reference: "ABC123",
      notes: "Coach 7",
      cost: { label: formatMoney(12000, "EUR"), paid: false },
    });
  });

  it("a Home end reads in the Home zone and is named by the Home base", () => {
    const v = transportDetails(
      {
        id: "t1", mode: "FLIGHT", bookingStateSet: false, sortOrder: 0, depIsHome: true,
        toStopName: "Tokyo", toStopTimezone: "Asia/Tokyo",
        depAt: new Date("2026-12-05T00:00:00Z"), arrAt: new Date("2026-12-05T10:00:00Z"),
      },
      { ...ctx, homeBaseName: "Brisbane", homeTimezone: "Australia/Brisbane" },
    );
    expect(v.title).toBe("Brisbane → Tokyo");
    expect(v.times).toEqual([
      { label: "Departs", value: `5 Dec 10:00 ${zoneLabel("Australia/Brisbane", "2026-12-05")}` },
      { label: "Arrives", value: `5 Dec 19:00 ${zoneLabel("Asia/Tokyo", "2026-12-05")}` },
    ]);
  });

  it("no ends and no times: the mode is the title, nothing else", () => {
    const v = transportDetails({ id: "t1", mode: "TRAIN", bookingStateSet: false, sortOrder: 0, reference: "  " }, ctx);
    expect(v).toEqual({ ...EMPTY, title: "Train" });
  });
});

describe("accommodationDetails", () => {
  it("check-in and check-out, confirmation, address and its point, the Stop as subtitle", () => {
    const v = accommodationDetails(
      {
        id: "a1", stopId: "s1", name: "Hotel Laurin", bookingStateSet: false,
        checkIn: "2026-12-05", checkOut: "2026-12-08", checkInTime: "15:00", checkOutTime: null,
        confirmation: "HX-4471", address: "Via Laurin 4, Bolzano", lat: 46.5, lng: 11.35, notes: "Late arrival OK",
      },
      { ...ctx, stops: [{ id: "s1", name: "Bolzano" }] },
    );
    expect(v).toEqual({
      ...EMPTY,
      title: "Hotel Laurin",
      subtitle: "Bolzano",
      times: [
        { label: "Check-in", value: "Sat 5 Dec 15:00" },
        { label: "Check-out", value: "Tue 8 Dec" },
      ],
      reference: "HX-4471",
      address: "Via Laurin 4, Bolzano",
      place: { lat: 46.5, lng: 11.35 },
      notes: "Late arrival OK",
    });
  });
});

describe("itemDetails", () => {
  const bare: ItemCardItem = { id: "i1", title: "Tower", category: "OTHER", bookingStateSet: false };

  it("a bare Item is its title and nothing else", () => {
    expect(itemDetails(bare, ctx)).toEqual({ ...EMPTY, title: "Tower" });
  });

  it("everything an Item carries", () => {
    const v = itemDetails(
      {
        ...bare,
        stopName: "Munich", date: "2026-12-07", startTime: "10:00", endTime: "12:00",
        slotTime: "10:30", arriveByMinutes: 15, booking: "TK-9", address: "Marienplatz 1", lat: 48.1, lng: 11.5,
        notes: "Bring ID", link: "https://example.com/tower",
        tryList: [{ id: "e1", text: "Pretzel", tried: true }],
        openingHours: { week: { mon: [["09:00", "18:00"]] }, seasons: [], closed: [] },
      },
      {
        ...ctx,
        attachments: [file],
        costs: [
          cost({ paidAt: new Date("2026-11-02T00:00:00Z"), paidMinor: 11000 }),
          cost({ id: "c2", costMinor: 500, paidAt: new Date("2026-11-02T00:00:00Z") }),
        ],
      },
    );
    expect(v).toEqual({
      title: "Tower",
      subtitle: "Munich",
      times: [
        { label: "When", value: "Mon 7 Dec 10:00–12:00" },
        { label: "Ticket", value: "Slot 10:30 · be there 10:15" },
      ],
      files: [file],
      reference: "TK-9",
      address: "Marienplatz 1",
      place: { lat: 48.1, lng: 11.5 },
      notes: "Bring ID",
      link: "https://example.com/tower",
      tryList: [{ id: "e1", text: "Pretzel", tried: true }],
      openingHours: "Open 09:00–18:00",
      cost: { label: formatMoney(11500, "EUR"), paid: true },
    });
  });

  it("an undated Item's hours read as the week; costs in two currencies are both shown, unpaid if any is", () => {
    const v = itemDetails(
      { ...bare, openingHours: { week: { mon: [["09:00", "18:00"]], tue: [] }, seasons: [], closed: [] } },
      { ...ctx, costs: [cost({ paidAt: new Date() }), cost({ id: "c2", costMinor: 3000, currency: "AUD" })] },
    );
    expect(v.openingHours).toBe("Mon 09:00–18:00 · Tue closed · Wed–Sun not set");
    expect(v.cost).toEqual({ label: `${formatMoney(12000, "EUR")} + ${formatMoney(3000, "AUD")}`, paid: false });
  });

  it("an empty Try list is no Try list", () => {
    expect(itemDetails({ ...bare, tryList: [] }, ctx).tryList).toBeNull();
  });

  it("a Surprise the viewer is being surprised with stays its masked title, whatever the context holds", () => {
    const masked: PlaceholderItem = {
      id: "i9", tripId: "t1", forkId: null, stopId: "s1", date: "2026-12-07", startTime: "19:00", endTime: null,
      title: "Surprise", category: "OTHER", address: null, link: null, booking: null, notes: null,
      lat: null, lng: null, placeId: null, businessStatus: null, countryCode: null, hiddenFromShares: false,
      sortOrder: 0, photoAttachmentId: null, sourceItemId: null, bookingState: "NONE", bookingStateSet: false,
      bookBy: null, nothingToAttach: false, slotTime: null, arriveByMinutes: null, refundable: null,
      openingHours: null, tryList: null,
      surprise: { plannerId: "u2", plannerName: "Sam", forIds: ["u1"], forNames: ["Cam"], youAreSurprised: true },
    };
    const v = itemDetails({ ...masked, stopName: "Munich" }, {
      attachments: [file], costs: [cost({ ownerId: "i9" })], stops: [{ id: "s1", name: "Munich" }],
    });
    expect(v).toEqual({ ...EMPTY, title: "Surprise" });
  });
});
