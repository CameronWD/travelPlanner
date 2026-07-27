import { describe, it, expect } from "vitest";
import { buildChristmasEurope2026 } from "./christmas-europe-2026";
import { hasOutboundLeg, hasReturnLeg } from "@/lib/home-base";
import { CHAPTER_COLOUR_VALUES } from "@/lib/chapter-colours";
import { TRANSPORT_MODES } from "@/lib/enums";

describe("buildChristmasEurope2026", () => {
  const t = buildChristmasEurope2026();

  it("has the right envelope", () => {
    expect(t.name).toBe("Christmas in Europe 2026");
    expect(t.startDate).toBe("2026-12-04");
    expect(t.endDate).toBe("2027-01-08");
    expect(t.homeCurrency).toBe("AUD");
    expect(t.roundTrip).toBe(true);
    expect(t.home?.name).toBe("Gold Coast");
    expect(t.home?.countryCode).toBe("au");
  });

  it("has 10 dated stops in order, lowercase country codes, unique sortOrder", () => {
    expect(t.stops).toHaveLength(10);
    expect(new Set(t.stops.map((s) => s.sortOrder)).size).toBe(10);
    for (const s of t.stops) {
      expect(s.arriveDate).toBeTruthy();
      expect(s.departDate).toBeTruthy();
      expect(s.timezone).toBeTruthy();
      expect(typeof s.lat).toBe("number");
      expect(typeof s.lng).toBe("number");
      expect(s.countryCode).toBe(s.countryCode?.toLowerCase());
    }
  });

  it("stops never overlap or run backwards", () => {
    const ordered = [...t.stops].sort((a, b) => a.sortOrder - b.sortOrder);
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(ordered[i + 1].arriveDate! >= ordered[i].departDate!).toBe(true);
    }
  });

  it("has 4 chapters with valid colours, each covering its stops", () => {
    expect(t.chapters).toHaveLength(4);
    const valid = new Set<string>(CHAPTER_COLOUR_VALUES);
    for (const c of t.chapters) expect(valid.has(c.colour)).toBe(true);
    for (const s of t.stops) {
      const covered = t.chapters.some(
        (c) => c.startDate! <= s.arriveDate! && s.arriveDate! <= c.endDate!,
      );
      expect(covered).toBe(true);
    }
  });

  it("has 11 transports connecting real stops with valid modes", () => {
    expect(t.transports).toHaveLength(11);
    const stopKeys = new Set(t.stops.map((s) => s.key));
    for (const tr of t.transports) {
      expect(TRANSPORT_MODES).toContain(tr.mode);
      if (tr.fromStopKey) expect(stopKeys.has(tr.fromStopKey)).toBe(true);
      if (tr.toStopKey) expect(stopKeys.has(tr.toStopKey)).toBe(true);
    }
  });

  it("is a closed round trip (outbound from home, return to home)", () => {
    const legs = t.transports.map((x) => ({
      depIsHome: x.depIsHome,
      arrIsHome: x.arrIsHome,
      toStopId: x.toStopKey ?? null,
      fromStopId: x.fromStopKey ?? null,
    }));
    const ordered = [...t.stops].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(hasOutboundLeg(legs, ordered[0].key)).toBe(true);
    expect(hasReturnLeg(legs, ordered[ordered.length - 1].key)).toBe(true);
  });

  it("records the 3 booked costs as actual + paid", () => {
    const withCost = t.transports.filter((tr) => tr.cost);
    expect(withCost).toHaveLength(3);
    for (const tr of withCost) {
      expect(tr.cost!.paid).toBe(true);
      expect(tr.cost!.actualMinor).toBe(tr.cost!.estimatedMinor);
    }
    expect(withCost.map((tr) => tr.cost!.estimatedMinor).sort((a, b) => a - b)).toEqual([
      23521, 41438, 186752,
    ]);
    expect(withCost.filter((tr) => tr.cost!.currency === "AUD")).toHaveLength(2);
    expect(withCost.filter((tr) => tr.cost!.currency === "EUR")).toHaveLength(1);
  });

  it("seeds EUR, GBP and IDR exchange rates quoted to AUD", () => {
    expect(new Set((t.exchangeRates ?? []).map((r) => r.base))).toEqual(
      new Set(["EUR", "GBP", "IDR"]),
    );
    for (const r of t.exchangeRates ?? []) expect(r.quote).toBe("AUD");
  });

  it("has the Neuschwanstein day trip on Munich, undated, marked must-do", () => {
    expect(t.items).toHaveLength(1);
    const n = t.items.find((i) => i.title.includes("Neuschwanstein"));
    expect(n).toBeTruthy();
    expect(n!.stopKey).toBe("xmas26:stop:munich");
    expect(n!.date).toBeNull();
    expect(n!.category).toBe("SIGHTSEEING");
    expect(n!.votes?.some((v) => v.level === "MUST")).toBe(true);
  });

  it("has no accommodation booked yet", () => {
    expect(t.accommodations).toHaveLength(0);
  });

  it("has a pre-trip checklist of outstanding tasks", () => {
    const cl = t.checklist ?? [];
    expect(cl).toHaveLength(20);
    for (const c of cl) {
      expect(c.kind).toBe("PRETRIP");
      expect(c.done).toBe(false);
    }
    expect(cl.filter((c) => /Book accommodation/i.test(c.text))).toHaveLength(10);
  });
});
