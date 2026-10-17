import { describe, expect, it } from "vitest";
import { NO_END, OUTBOUND, RETURN, SAMPLE_EXTRACTION, STAY } from "@/test/fixtures/booking-import/sample-extraction";
import { buildProposals, normDateTime, normTime, type MatchContext } from "./build";
import { NO_EXISTING } from "./duplicates";
import type { MatchStop } from "./match";
import { BOOKING_IMPORT_MESSAGES as M } from "./messages";
import type { BookingExtraction, ExtractedProposal } from "./schema";
import type { Proposal } from "./types";

const LISBON: MatchStop = { id: "s-lis", name: "Lisbon", country: "Portugal", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-08", sortOrder: 0 };
const PORTO: MatchStop = { id: "s-opo", name: "Porto", country: "Portugal", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2026-12-08", departDate: "2026-12-15", sortOrder: 1 };
const CTX: MatchContext = {
  home: { name: "Brisbane", countryCode: "au", timezone: "Australia/Brisbane" },
  stops: [LISBON, PORTO],
  blockedStopIds: new Set(),
  existing: NO_EXISTING,
  today: "2026-10-14",
};
const report = (...proposals: ExtractedProposal[]): BookingExtraction => ({ isBooking: true, notBookingReason: null, bookedOn: null, proposals });
const byId = (ps: Proposal[], id: string) => ps.find((p) => p.clientId === id)!;
const item = (over: Partial<NonNullable<ExtractedProposal["item"]>>, cost: ExtractedProposal["cost"] = null): ExtractedProposal => ({
  kind: "item",
  confidence: "high",
  doubleCheck: [],
  uncertainFields: [],
  transport: null,
  accommodation: null,
  item: { title: "Ticket", category: "SIGHTSEEING", date: "2026-12-04", startTime: null, endTime: null, place: null, address: null, city: "Lisbon", country: "Portugal", booking: null, slotTime: null, arriveByMinutes: null, refundable: null, ...over },
  cost,
});

describe("normalisers", () => {
  it("reads wall times and lone dates", () => {
    expect(normDateTime("2026-12-01T10:00")).toEqual({ date: "2026-12-01", wall: "2026-12-01T10:00" });
    expect(normDateTime("2026-12-01 9:05")).toEqual({ date: "2026-12-01", wall: "2026-12-01T09:05" });
    expect(normDateTime("2026-12-01")).toEqual({ date: "2026-12-01", wall: null });
    expect(normDateTime("2026-02-30T10:00")).toEqual({ date: null, wall: null });
    expect(normTime("24:00")).toBeNull();
  });
});

describe("buildProposals: the sample booking", () => {
  it("makes the outbound a Home → Lisbon flight with its Cost paid on the payment date", () => {
    const { proposals, dropped } = buildProposals(SAMPLE_EXTRACTION, CTX);
    expect(dropped).toBe(0);
    expect(proposals.map((p) => p.clientId)).toEqual(["p1", "p2", "p3"]);
    expect(byId(proposals, "p1")).toEqual({
      clientId: "p1",
      kind: "transport",
      confidence: "high",
      doubleCheck: ["The fare covers both flights."],
      warnings: [],
      highlight: [],
      missing: [],
      duplicateOf: null,
      blocked: null,
      input: {
        mode: "FLIGHT",
        depIsHome: true,
        depAt: "2026-12-01T10:00",
        toStopId: "s-lis",
        arrPlace: "Lisbon (LIS)",
        arrAt: "2026-12-02T07:15",
        notes: "SK101 · Seat 32A · Economy",
        reference: "QX7P2M",
        bookingState: "BOOKED",
        costMinor: 214_000,
        currency: "AUD",
        paidMinor: 214_000,
        paidAt: "2026-10-01",
      },
    });
  });

  it("warns that the return leaves Lisbon outside the stay there, and goes home", () => {
    const p2 = byId(buildProposals(SAMPLE_EXTRACTION, CTX).proposals, "p2");
    expect(p2).toMatchObject({ kind: "transport", warnings: [M.departsOutsideStay("Lisbon")] });
    expect(p2.input).toMatchObject({ fromStopId: "s-lis", depAt: "2026-12-15T21:30", arrIsHome: true, arrAt: "2026-12-17T06:00" });
    expect(p2.input).not.toHaveProperty("costMinor");
  });

  it("still warns a departure outside the stay when only its date is printed, no time (BI-04 fix round 1)", () => {
    const dated: ExtractedProposal = { ...RETURN, transport: { ...RETURN.transport!, dep: { ...RETURN.transport!.dep, localDateTime: "2026-12-15" } } };
    const p = byId(buildProposals(report(dated), CTX).proposals, "p1");
    expect(p.warnings).toContain(M.departsOutsideStay("Lisbon"));
    expect(p.input).not.toHaveProperty("depAt");
  });

  it("warns an arrival outside the stay when only its date is printed, no time (BI-04 fix round 1)", () => {
    const arrivesLate: ExtractedProposal = {
      ...OUTBOUND,
      cost: null,
      doubleCheck: [],
      transport: {
        ...OUTBOUND.transport!,
        dep: { place: "Lisbon (LIS)", city: "Lisbon", country: "Portugal", localDateTime: "2026-12-05T09:00" },
        arr: { place: "Porto (OPO)", city: "Porto", country: "Portugal", localDateTime: "2026-12-20" },
      },
    };
    const p = byId(buildProposals(report(arrivesLate), CTX).proposals, "p1");
    expect(p.warnings).toContain(M.arrivesOutsideStay("Porto"));
    expect(p.input).not.toHaveProperty("arrAt");
  });

  it("puts the stay in Lisbon with its times, confirmation and EUR Cost, and highlights the uncertain field", () => {
    const p3 = byId(buildProposals(SAMPLE_EXTRACTION, CTX).proposals, "p3");
    expect(p3).toMatchObject({ kind: "accommodation", highlight: ["checkInTime"], warnings: [] });
    expect(p3.input).toEqual({
      stopId: "s-lis",
      name: "Casa do Rio Lisboa",
      address: "Rua Ficticia 12, 1100-000 Lisboa",
      checkIn: "2026-12-02",
      checkOut: "2026-12-08",
      checkInTime: "15:00",
      checkOutTime: "11:00",
      confirmation: "CDR-55821",
      bookingState: "BOOKED",
      costMinor: 81_240,
      currency: "EUR",
      paidMinor: 81_240,
      paidAt: "2026-10-01",
    });
  });
});

describe("buildProposals: Review Focus", () => {
  it("a return flight sharing a reference: only the saved outbound is a duplicate (Review Focus 1)", () => {
    const ctx: MatchContext = {
      ...CTX,
      existing: { ...NO_EXISTING, transports: [{ id: "t-out", mode: "FLIGHT", reference: "qx7 p2m", depLocalDate: "2026-12-01", label: "Flight QX7P2M" }] },
    };
    const { proposals } = buildProposals(SAMPLE_EXTRACTION, ctx);
    expect(byId(proposals, "p1").duplicateOf).toEqual({ kind: "transport", id: "t-out", label: "Flight QX7P2M" });
    expect(byId(proposals, "p1").warnings).toContain(M.duplicate("Flight QX7P2M"));
    expect(byId(proposals, "p2").duplicateOf).toBeNull();
  });

  it("a connection airport stays free text with its own zone, and no Stop is proposed for it (Review Focus 2)", () => {
    const sin = { place: "Singapore Changi (SIN)", city: "Singapore", country: "Singapore" };
    const leg1: ExtractedProposal = { ...OUTBOUND, transport: { ...OUTBOUND.transport!, arr: { ...sin, localDateTime: "2026-12-01T16:00" } } };
    const leg2: ExtractedProposal = { ...OUTBOUND, cost: null, transport: { ...OUTBOUND.transport!, serviceNumber: "SK7", dep: { ...sin, localDateTime: "2026-12-01T23:30" } } };
    const { proposals } = buildProposals(report(leg1, leg2), CTX);
    expect(proposals.some((p) => p.kind === "stop")).toBe(false);
    expect(byId(proposals, "p1").input).toMatchObject({ depIsHome: true, arrPlace: "Singapore Changi (SIN)", arrTimezone: "Asia/Singapore", arrAt: "2026-12-01T16:00" });
    expect(byId(proposals, "p1").input).not.toHaveProperty("toStopId");
    expect(byId(proposals, "p2").input).toMatchObject({ depPlace: "Singapore Changi (SIN)", depTimezone: "Asia/Singapore", toStopId: "s-lis" });
  });

  it("Home base with no time zone: guesses one from Home's country and says so (Review Focus 3)", () => {
    const ctx: MatchContext = { ...CTX, home: { name: "Brisbane", countryCode: "au", timezone: null } };
    const { proposals } = buildProposals(SAMPLE_EXTRACTION, ctx);
    expect(byId(proposals, "p1").input).toMatchObject({ depIsHome: true, depTimezone: "Australia/Sydney" });
    expect(byId(proposals, "p1").doubleCheck).toContain(M.homeTimezoneGuess("Brisbane", "Australia/Sydney"));
    expect(byId(proposals, "p2").input).toMatchObject({ arrIsHome: true, arrTimezone: "Australia/Sydney" });

    const noCountry = buildProposals(SAMPLE_EXTRACTION, { ...ctx, home: { name: "Brisbane", countryCode: null, timezone: null } });
    expect(byId(noCountry.proposals, "p1").input).not.toHaveProperty("depTimezone");
    expect(byId(noCountry.proposals, "p1").doubleCheck).toContain(M.homeTimezoneUnknown("Brisbane"));
  });

  it("a city match beats a same-country Stop whose dates overlap (Review Focus 4)", () => {
    const portoStay: ExtractedProposal = { ...STAY, accommodation: { ...STAY.accommodation!, city: "Porto", checkIn: "2026-12-03", checkOut: "2026-12-05" } };
    const { proposals } = buildProposals(report(portoStay), CTX);
    expect(byId(proposals, "p1").input).toMatchObject({ stopId: "s-opo" });
  });
});

describe("buildProposals: proposed Stops", () => {
  it("proposes one scheduled Stop for a city that isn't on the plan, spanning every date that needs it", () => {
    const { proposals } = buildProposals(SAMPLE_EXTRACTION, { ...CTX, stops: [] });
    expect(proposals[0]).toEqual({
      clientId: "s1",
      kind: "stop",
      confidence: "medium",
      doubleCheck: [],
      warnings: [],
      highlight: [],
      missing: [],
      duplicateOf: null,
      blocked: null,
      input: { mode: "scheduled", name: "Lisbon", country: "Portugal", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-15" },
    });
    expect(byId(proposals, "p1").input).toMatchObject({ toStopId: "proposed:s1" });
    expect(byId(proposals, "p2").input).toMatchObject({ fromStopId: "proposed:s1" });
    expect(byId(proposals, "p3").input).toMatchObject({ stopId: "proposed:s1" });
  });
});

describe("buildProposals: Costs", () => {
  it("handles a 0-decimal currency and drops an untracked one with a note", () => {
    const { proposals } = buildProposals(
      report(item({ title: "Tea ceremony" }, { amount: "12000", currency: "JPY", paidAmount: null, paidDate: null }), item({ title: "Desert tour" }, { amount: "45.250", currency: "KWD", paidAmount: null, paidDate: null })),
      CTX,
    );
    expect(byId(proposals, "p1").input).toMatchObject({ costMinor: 12_000, currency: "JPY" });
    expect(byId(proposals, "p2").input).not.toHaveProperty("costMinor");
    expect(byId(proposals, "p2").doubleCheck).toContain(M.unsupportedCurrency("45.250", "KWD"));
  });

  it("widened currency list (Task 11b): keeps a KRW Cost, still drops a VND one with a note", () => {
    const { proposals } = buildProposals(
      report(item({ title: "Palace tour" }, { amount: "45000", currency: "KRW", paidAmount: null, paidDate: null }), item({ title: "Street food tour" }, { amount: "500000", currency: "VND", paidAmount: null, paidDate: null })),
      CTX,
    );
    expect(byId(proposals, "p1").input).toMatchObject({ costMinor: 45_000, currency: "KRW" });
    expect(byId(proposals, "p2").input).not.toHaveProperty("costMinor");
    expect(byId(proposals, "p2").doubleCheck).toContain(M.unsupportedCurrency("500000", "VND"));
  });

  it("dates a paid Cost by its payment, else the booking date, else today; booked alone is not paid", () => {
    const paidNoDate = { amount: "100.00", currency: "EUR", paidAmount: "100.00", paidDate: null };
    expect(byId(buildProposals({ ...report(item({}, paidNoDate)), bookedOn: "2026-10-01" }, CTX).proposals, "p1").input).toMatchObject({ paidMinor: 10_000, paidAt: "2026-10-01" });
    expect(byId(buildProposals(report(item({}, paidNoDate)), CTX).proposals, "p1").input).toMatchObject({ paidAt: "2026-10-14" });
    const booked = byId(buildProposals(report(item({}, { ...paidNoDate, paidAmount: null })), CTX).proposals, "p1").input;
    expect(booked).toMatchObject({ costMinor: 10_000 });
    expect(booked).not.toHaveProperty("paidMinor");
    expect(booked).not.toHaveProperty("paidAt");
  });

  it("an unreadable amount drops the Cost with a note (fix round 1 finding 3a)", () => {
    const p = byId(buildProposals(report(item({}, { amount: "abc", currency: "EUR", paidAmount: null, paidDate: null })), CTX).proposals, "p1");
    expect(p.input).not.toHaveProperty("costMinor");
    expect(p.doubleCheck).toContain(M.unreadableAmount("abc", "EUR"));
  });

  it("an unreadable amount paid keeps the Cost but drops Paid, with a note (fix round 1 finding 3b)", () => {
    const p = byId(buildProposals(report(item({}, { amount: "100.00", currency: "EUR", paidAmount: "lots", paidDate: null })), CTX).proposals, "p1");
    expect(p.input).toMatchObject({ costMinor: 10_000, currency: "EUR" });
    expect(p.input).not.toHaveProperty("paidMinor");
    expect(p.input).not.toHaveProperty("paidAt");
    expect(p.doubleCheck).toContain(M.unreadablePaidAmount("lots", "EUR"));
  });

  it("an amount paid of zero is not Paid (fix round 1 finding 3c)", () => {
    const p = byId(buildProposals(report(item({}, { amount: "50.00", currency: "EUR", paidAmount: "0.00", paidDate: "2026-10-01" })), CTX).proposals, "p1");
    expect(p.input).toMatchObject({ costMinor: 5_000, currency: "EUR" });
    expect(p.input).not.toHaveProperty("paidMinor");
    expect(p.input).not.toHaveProperty("paidAt");
  });

  it("reads a comma as the decimal mark only where the booking means it (fix round 1 finding 3d)", () => {
    const jpy = byId(buildProposals(report(item({ title: "Tea ceremony" }, { amount: "45,000", currency: "JPY", paidAmount: null, paidDate: null })), CTX).proposals, "p1");
    expect(jpy.input).toMatchObject({ costMinor: 45_000, currency: "JPY" });

    const euroComma = byId(buildProposals(report(item({ title: "Museum" }, { amount: "45,50", currency: "EUR", paidAmount: null, paidDate: null })), CTX).proposals, "p1");
    expect(euroComma.input).toMatchObject({ costMinor: 4_550, currency: "EUR" });

    const euroThousands = byId(buildProposals(report(item({ title: "Tour" }, { amount: "1.234,50", currency: "EUR", paidAmount: null, paidDate: null })), CTX).proposals, "p1");
    expect(euroThousands.input).toMatchObject({ costMinor: 123_450, currency: "EUR" });
  });

  it("reads \"1.234\" in a two-decimal currency as one thousand two hundred and thirty-four, with a note (final review #7)", () => {
    const p = byId(buildProposals(report(item({ title: "Tour" }, { amount: "1.234", currency: "EUR", paidAmount: "1.234", paidDate: "2026-10-01" })), CTX).proposals, "p1");
    expect(p.input).toMatchObject({ costMinor: 123_400, currency: "EUR", paidMinor: 123_400 });
    expect(p.doubleCheck.filter((n) => n === M.dotThousands("1.234", "EUR", "1234.00"))).toHaveLength(1);

    const plain = byId(buildProposals(report(item({ title: "Museum" }, { amount: "12.34", currency: "EUR", paidAmount: null, paidDate: null })), CTX).proposals, "p1");
    expect(plain.input).toMatchObject({ costMinor: 1_234 });
    expect(plain.doubleCheck.some((n) => n.includes("thousands separator"))).toBe(false);

    const yen = byId(buildProposals(report(item({ title: "Tea" }, { amount: "1.234", currency: "JPY", paidAmount: null, paidDate: null })), CTX).proposals, "p1");
    expect(yen.doubleCheck.some((n) => n.includes("thousands separator"))).toBe(false);
  });
});

describe("buildProposals: things to do, car hire, gaps", () => {
  it("every Proposal lands Booked as a choice, even a ticket that prints no reference (spec R2)", () => {
    const { proposals } = buildProposals(report(item({ booking: null })), CTX);
    expect(proposals[0].input).toMatchObject({ bookingState: "BOOKED" });
    expect(proposals[0].input).not.toHaveProperty("booking");
    const bookings = buildProposals(SAMPLE_EXTRACTION, CTX).proposals.filter((p) => p.kind !== "stop");
    expect(bookings.length).toBeGreaterThan(0);
    for (const p of bookings) expect(p.input).toMatchObject({ bookingState: "BOOKED" });
  });

  it("a day-trip ticket joins the Stop covering its date; a missing category falls back to OTHER and is highlighted", () => {
    const p = byId(
      buildProposals(report(item({ title: "Pena Palace entry", category: null, startTime: "9:30", endTime: "11:00", place: "Pena Palace", address: "Estrada da Pena", city: "Sintra", booking: "PENA-1" })), CTX).proposals,
      "p1",
    );
    expect(p.highlight).toContain("category");
    expect(p.input).toEqual({ title: "Pena Palace entry", category: "OTHER", stopId: "s-lis", date: "2026-12-04", startTime: "09:30", endTime: "11:00", address: "Pena Palace, Estrada da Pena", booking: "PENA-1", bookingState: "BOOKED" });
  });

  it("car hire is a CAR Transport from pickup to drop-off with the hire company in Notes", () => {
    const car: ExtractedProposal = {
      ...OUTBOUND,
      cost: null,
      doubleCheck: [],
      transport: {
        mode: "CAR", carrier: "Hertz", serviceNumber: null, reference: "H-778", seat: null, travelClass: null,
        dep: { place: "Hertz Lisbon Airport", city: "Lisbon", country: "Portugal", localDateTime: "2026-12-08T10:00" },
        arr: { place: null, city: "Porto", country: "Portugal", localDateTime: "2026-12-08T18:00" },
      },
    };
    expect(byId(buildProposals(report(car), CTX).proposals, "p1").input).toMatchObject({ mode: "CAR", fromStopId: "s-lis", depPlace: "Hertz Lisbon Airport", toStopId: "s-opo", notes: "Hertz", reference: "H-778" });
  });

  it("a departure with only a date is missing its time and says so", () => {
    const dated: ExtractedProposal = { ...RETURN, transport: { ...RETURN.transport!, dep: { ...RETURN.transport!.dep, localDateTime: "2026-12-15" } } };
    const p = byId(buildProposals(report(dated), CTX).proposals, "p1");
    expect(p.missing).toEqual(["Departure time"]);
    expect(p.doubleCheck).toContain(M.onlyDepartureDate("Tue 15 Dec"));
    expect(p.input).not.toHaveProperty("depAt");
  });

  it("drops what can't be saved and counts it (a partial result)", () => {
    const backwards: ExtractedProposal = { ...STAY, accommodation: { ...STAY.accommodation!, checkIn: "2026-12-08", checkOut: "2026-12-02" } };
    const untitled = item({ title: null, place: null });
    const nowhere: ExtractedProposal = { ...OUTBOUND, transport: { ...OUTBOUND.transport!, dep: NO_END, arr: NO_END } };
    const { proposals, dropped } = buildProposals(report(OUTBOUND, backwards, untitled, nowhere), CTX);
    expect(proposals).toHaveLength(1);
    expect(dropped).toBe(3);
  });

  it("reports the ticket's slot, margin and refundability; a start that is just the slot again is dropped so it defaults on save (R3)", () => {
    const p = byId(
      buildProposals(report(item({ title: "Lodge tour", startTime: "10:00", slotTime: "10:00", arriveByMinutes: 15, refundable: "no", booking: "LT-9" })), CTX).proposals,
      "p1",
    );
    expect(p.input).toEqual({ title: "Lodge tour", category: "SIGHTSEEING", stopId: "s-lis", date: "2026-12-04", slotTime: "10:00", arriveByMinutes: 15, refundable: false, booking: "LT-9", bookingState: "BOOKED" });
  });

  it("keeps a separate meeting time, reads 'yes' as refundable, and drops a margin outside 1–240 or an unreadable slot", () => {
    const meet = byId(buildProposals(report(item({ startTime: "9:40", slotTime: "10:00", arriveByMinutes: 0, refundable: "yes" })), CTX).proposals, "p1");
    expect(meet.input).toMatchObject({ startTime: "09:40", slotTime: "10:00", refundable: true });
    expect(meet.input).not.toHaveProperty("arriveByMinutes");
    const odd = byId(buildProposals(report(item({ slotTime: "25:00", arriveByMinutes: 999, refundable: null })), CTX).proposals, "p1");
    expect(odd.input).not.toHaveProperty("slotTime");
    expect(odd.input).not.toHaveProperty("arriveByMinutes");
    expect(odd.input).not.toHaveProperty("refundable");
  });

  it("an uncertain slot highlights the slot on the card", () => {
    const p = byId(buildProposals(report({ ...item({ slotTime: "10:00" }), uncertainFields: ["slotTime", "refundable"] }), CTX).proposals, "p1");
    expect(p.highlight).toEqual(expect.arrayContaining(["slotTime", "refundable"]));
  });
});

describe("buildProposals: Surprise", () => {
  it("anything belonging to a Stop the importer is surprised by is blocked", () => {
    const { proposals } = buildProposals(SAMPLE_EXTRACTION, { ...CTX, blockedStopIds: new Set(["s-lis"]) });
    expect(byId(proposals, "p1").blocked).toBe(M.blocked);
    expect(byId(proposals, "p3").blocked).toBe(M.blocked);
  });
});

describe("buildProposals: fix round 1 findings", () => {
  it("a connection city a Stay in this import covers is not just a connection: both legs link to its proposed Stop (finding 1a)", () => {
    const sin = { place: "Singapore Changi (SIN)", city: "Singapore", country: "Singapore" };
    const leg1: ExtractedProposal = { ...OUTBOUND, transport: { ...OUTBOUND.transport!, arr: { ...sin, localDateTime: "2026-12-01T22:00" } } };
    const leg2: ExtractedProposal = { ...OUTBOUND, cost: null, transport: { ...OUTBOUND.transport!, serviceNumber: "SK7", dep: { ...sin, localDateTime: "2026-12-02T09:00" } } };
    const stay: ExtractedProposal = {
      ...STAY,
      cost: null,
      accommodation: { ...STAY.accommodation!, name: "Changi Transit Hotel", city: "Singapore", country: "Singapore", checkIn: "2026-12-01", checkOut: "2026-12-02" },
    };
    const { proposals } = buildProposals(report(leg1, leg2, stay), CTX);
    const stops = proposals.filter((p) => p.kind === "stop");
    expect(stops).toHaveLength(1);
    const stopId = `proposed:${stops[0].clientId}`;
    expect(byId(proposals, "p1").input).toMatchObject({ toStopId: stopId });
    expect(byId(proposals, "p2").input).toMatchObject({ fromStopId: stopId });
    expect(byId(proposals, "p3").input).toMatchObject({ stopId });
  });

  it("a connection city that is already a Stop links both legs to it, even under 24h apart (finding 1b)", () => {
    const SINGAPORE: MatchStop = { id: "s-sin", name: "Singapore", country: "Singapore", countryCode: "sg", timezone: "Asia/Singapore", arriveDate: "2026-12-01", departDate: "2026-12-02", sortOrder: 0 };
    const ctx: MatchContext = { ...CTX, stops: [...CTX.stops, SINGAPORE] };
    const sin = { place: "Singapore Changi (SIN)", city: "Singapore", country: "Singapore" };
    const leg1: ExtractedProposal = { ...OUTBOUND, transport: { ...OUTBOUND.transport!, arr: { ...sin, localDateTime: "2026-12-01T22:00" } } };
    const leg2: ExtractedProposal = { ...OUTBOUND, cost: null, transport: { ...OUTBOUND.transport!, serviceNumber: "SK7", dep: { ...sin, localDateTime: "2026-12-02T09:00" } } };
    const { proposals } = buildProposals(report(leg1, leg2), ctx);
    expect(proposals.some((p) => p.kind === "stop")).toBe(false);
    expect(byId(proposals, "p1").input).toMatchObject({ toStopId: "s-sin" });
    expect(byId(proposals, "p2").input).toMatchObject({ fromStopId: "s-sin" });
  });

  it("a Transport end matched to a rough Stop with no time zone gets one guessed from the Stop's country (finding 2)", () => {
    const roughLisbon: MatchStop = { ...LISBON, id: "s-lis-rough", timezone: null };
    const ctx: MatchContext = { ...CTX, stops: [roughLisbon, PORTO] };
    const { proposals } = buildProposals(report(OUTBOUND), ctx);
    expect(byId(proposals, "p1").input).toMatchObject({ toStopId: "s-lis-rough", arrTimezone: "Europe/Lisbon" });
  });
});
