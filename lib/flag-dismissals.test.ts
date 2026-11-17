import { describe, expect, it } from "vitest";
import { flagTightConnections, type Flag, type FlagItem } from "@/lib/flags";
import { pointKey, type TravelLookup } from "@/lib/travel-times/hops";
import { applyMarkedFine, type MarkedFineRow } from "./flag-dismissals";

const OPTS = { windingFactor: 1.5, avgSpeedKph: 80 };
const A = { lat: 48.86, lng: 2.337 };
// ~0.9 km from A: an estimated walk of ~12 min.
const B = { lat: 48.8681, lng: 2.337 };

const item = (over: Partial<FlagItem> & { id: string }): FlagItem => ({
  stopId: null,
  date: "2026-07-02",
  startTime: null,
  endTime: null,
  sortOrder: 0,
  lat: null,
  lng: null,
  ...over,
});

const pair = (nextStart = "12:20", over: { prev?: Partial<FlagItem>; next?: Partial<FlagItem> } = {}): FlagItem[] => [
  item({ id: "a", startTime: "10:00", endTime: "12:00", ...A, ...over.prev }),
  item({ id: "b", startTime: nextStart, endTime: "13:00", ...B, sortOrder: 1, ...over.next }),
];

function tight(items: FlagItem[], opts: Partial<Parameters<typeof flagTightConnections>[2]> = {}): Flag {
  const flags = flagTightConnections(items, [], { ...OPTS, ...opts });
  expect(flags).toHaveLength(1);
  return flags[0];
}

const markedBy = (flag: Flag, over: Partial<MarkedFineRow> = {}): MarkedFineRow => ({
  flagId: flag.id,
  fingerprint: flag.fingerprint!,
  markedByName: "Xanthia",
  createdAt: new Date("2026-06-01T10:00:00Z"),
  ...over,
});

const walkRow = (minutes: number): TravelLookup =>
  new Map([[`WALK|${pointKey(A)}|${pointKey(B)}`, { status: "OK" as const, minutes, distanceM: 900, polyline: null }]]);

describe("applyMarkedFine", () => {
  it("a matching row moves the Flag to markedFine, with who marked it and when", () => {
    const flag = tight(pair());
    const other: Flag = { id: "packed-2026-07-02", severity: "info", message: "Packed.", targetType: "DAY" };
    const { shown, markedFine } = applyMarkedFine([flag, other], [markedBy(flag)]);
    expect(shown).toEqual([other]);
    expect(markedFine).toEqual([{ ...flag, markedByName: "Xanthia", markedAt: new Date("2026-06-01T10:00:00Z") }]);
  });

  it("retiming the next Item by one minute shows it again", () => {
    const row = markedBy(tight(pair("12:20")));
    const { shown, markedFine } = applyMarkedFine([tight(pair("12:21"))], [row]);
    expect(shown).toHaveLength(1);
    expect(markedFine).toEqual([]);
  });

  it("an estimated hop that later gets a 12 min row shows again", () => {
    const estimated = tight(pair());
    expect(estimated.message).toContain("(estimated)");
    const stored = tight(pair(), { lookup: walkRow(12) });
    expect(stored.message).not.toContain("(estimated)");
    expect(applyMarkedFine([stored], [markedBy(estimated)]).shown).toEqual([stored]);
  });

  it("choosing a different Hop mode for it shows it again, even at the same minutes", () => {
    const lookup: TravelLookup = new Map([
      ...walkRow(10),
      [`DRIVE|${pointKey(A)}|${pointKey(B)}`, { status: "OK" as const, minutes: 10, distanceM: 900, polyline: null }],
    ]);
    const walked = tight(pair("12:10"), { lookup, hopModes: new Map([["a|b", "WALK"]]) });
    const driven = tight(pair("12:10"), { lookup, hopModes: new Map([["a|b", "DRIVE"]]) });
    expect(walked.message).toContain("~10 min walk");
    expect(driven.message).toContain("~10 min drive");
    expect(applyMarkedFine([driven], [markedBy(walked)]).shown).toEqual([driven]);
    expect(applyMarkedFine([walked], [markedBy(walked)]).markedFine).toHaveLength(1);
  });

  it("the previous thing gaining an end pin shows it again", () => {
    const row = markedBy(tight(pair()));
    const ended = tight(pair("12:20", { prev: { endLat: 48.861, endLng: 2.337 } }));
    expect(applyMarkedFine([ended], [row]).shown).toEqual([ended]);
  });

  it("the previous thing's end pin moving shows it again", () => {
    const row = markedBy(tight(pair("12:20", { prev: { endLat: 48.861, endLng: 2.337 } })));
    const moved = tight(pair("12:20", { prev: { endLat: 48.8611, endLng: 2.337 } }));
    expect(applyMarkedFine([moved], [row]).shown).toEqual([moved]);
  });

  it("a row for a Flag that no longer fires is ignored", () => {
    const flag = tight(pair());
    const comfortable = flagTightConnections(pair("13:00"), [], OPTS);
    expect(comfortable).toEqual([]);
    expect(applyMarkedFine(comfortable, [markedBy(flag)])).toEqual({ shown: [], markedFine: [] });
  });

  it("a Flag with no fingerprint is never Marked fine, whatever a row says", () => {
    const packed: Flag = { id: "packed-2026-07-02", severity: "info", message: "Packed.", targetType: "DAY" };
    const { shown } = applyMarkedFine([packed], [{ flagId: packed.id, fingerprint: "", markedByName: "Xanthia", createdAt: new Date() }]);
    expect(shown).toEqual([packed]);
  });
});
