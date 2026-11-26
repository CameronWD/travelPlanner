import { describe, it, expect } from "vitest";
import { bookingLegLabel, filesForLeg } from "./booking-files";
import type { ConnectionLeg } from "./connections";

const dps: ConnectionLeg = {
  id: "dps", mode: "FLIGHT", depPlace: "Denpasar", arrPlace: "Bangkok",
  depAt: new Date("2026-12-05T11:00:00Z"), arrAt: new Date("2026-12-05T15:15:00Z"),
  fromStopId: "bali", toStopId: null, reference: "DHZU24",
};
const bkk: ConnectionLeg = {
  id: "bkk", mode: "FLIGHT", depPlace: "Bangkok", arrPlace: "Doha",
  depAt: new Date("2026-12-05T17:50:00Z"), arrAt: new Date("2026-12-05T22:00:00Z"),
  fromStopId: null, toStopId: null, reference: " dhzu24",
};
const doh: ConnectionLeg = {
  id: "doh", mode: "FLIGHT", depPlace: "Doha", arrPlace: "London",
  depAt: new Date("2026-12-06T01:00:00Z"), arrAt: new Date("2026-12-06T07:00:00Z"),
  fromStopId: null, toStopId: "london", reference: "DHZU24",
};

const files: Record<string, string[]> = { dps: ["ticket.pdf"], bkk: ["seat.png"], doh: ["eticket.pdf", "bag.pdf"] };
const ownFiles = (id: string) => files[id] ?? [];
const labelOf = (l: ConnectionLeg) => `${l.depPlace} → ${l.arrPlace}`;

describe("filesForLeg", () => {
  it("a leg lists its own files, then its booking partner's, each partner file labelled with that leg", () => {
    expect(filesForLeg(dps, [bkk, dps], ownFiles, labelOf)).toEqual([
      { attachment: "ticket.pdf", filedOn: null },
      { attachment: "seat.png", filedOn: "Bangkok → Doha" },
    ]);
  });

  it("three legs in one booking: the middle one shows both others' files once each", () => {
    expect(filesForLeg(bkk, [doh, bkk, dps], ownFiles, labelOf)).toEqual([
      { attachment: "seat.png", filedOn: null },
      { attachment: "ticket.pdf", filedOn: "Denpasar → Bangkok" },
      { attachment: "eticket.pdf", filedOn: "Doha → London" },
      { attachment: "bag.pdf", filedOn: "Doha → London" },
    ]);
  });

  it("a leg alone lists only its own", () => {
    expect(filesForLeg(dps, [dps], ownFiles, labelOf)).toEqual([{ attachment: "ticket.pdf", filedOn: null }]);
  });

  it("two legs at the same place with different references share nothing", () => {
    const other = { ...bkk, reference: "QR7781" };
    expect(filesForLeg(dps, [dps, other], ownFiles, labelOf)).toEqual([{ attachment: "ticket.pdf", filedOn: null }]);
  });
});

describe("bookingLegLabel", () => {
  const stops = [
    { id: "bali", name: "Bali", timezone: "Asia/Makassar", arriveDate: "2026-12-01", departDate: "2026-12-05" },
    { id: "london", name: "London", timezone: "Europe/London", arriveDate: "2026-12-06", departDate: "2026-12-09" },
  ];

  it("is the route the travel card shows, without the mode word", () => {
    expect(bookingLegLabel({ ...dps, mode: "FLIGHT", depPlace: "Denpasar", arrPlace: "Bangkok" }, stops)).toBe("Denpasar → Bangkok");
    expect(bookingLegLabel({ ...doh, mode: "FLIGHT", depPlace: "Doha (DOH)", arrPlace: "London Heathrow (LHR)" }, stops)).toBe("DOH → LHR");
    expect(bookingLegLabel({ ...dps, mode: "CAR", depPlace: "Denpasar", arrPlace: "Ubud" }, stops)).toBe("Denpasar → Ubud");
  });

  it("names the route of a leg with no time yet", () => {
    expect(bookingLegLabel({ ...doh, mode: "TRAIN", depPlace: "Doha", arrPlace: null, depAt: null, arrAt: null }, stops)).toBe("Doha → London");
  });
});
