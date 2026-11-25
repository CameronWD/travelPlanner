import { describe, it, expect } from "vitest";
import { buildShareLeg, type ShareLegInput } from "./share-leg";

const lineOf = (l: { when: string; number: string | null }) => [l.when, l.number].filter(Boolean).join(" · ");
const BERLIN = { dep: "Europe/Berlin", arr: "Europe/Berlin" };
const base: ShareLegInput = {
  mode: "TRAIN",
  depPlace: null,
  arrPlace: null,
  depAt: null,
  arrAt: null,
  serviceNumber: null,
};

describe("buildShareLeg", () => {
  it("gives the day, route, duration and number for a train", () => {
    const leg = buildShareLeg(
      {
        ...base,
        depPlace: "Munich Hbf",
        arrPlace: "Strasbourg",
        depAt: new Date("2026-12-10T05:51:00Z"),
        arrAt: new Date("2026-12-10T09:40:00Z"),
        serviceNumber: "ICE 9572",
      },
      BERLIN,
      "Train to Strasbourg",
    );
    expect(leg).toEqual({
      mode: "TRAIN",
      label: "Train to Strasbourg",
      when: "Thu 10 Dec · Munich Hbf 06:51 → Strasbourg 10:40 · 3h 49m",
      number: "ICE 9572",
      arrivesAt: "2026-12-10T09:40:00.000Z",
      arrivesLocal: "2026-12-10 10:40",
    });
  });

  it("marks an overnight arrival and keeps the number last", () => {
    const line = lineOf(buildShareLeg(
      {
        ...base,
        mode: "FLIGHT",
        depPlace: "Denpasar (DPS)",
        arrPlace: "Munich (MUC)",
        depAt: new Date("2026-12-05T11:00:00Z"),
        arrAt: new Date("2026-12-06T05:45:00Z"),
        serviceNumber: "TG 440 / TG 924",
      },
      { dep: "Asia/Makassar", arr: "Europe/Berlin" },
      "Flight to Munich",
    ));
    expect(line).toContain("19:00 → Munich (MUC) 06:45 +1 · ");
    expect(line.endsWith("· TG 440 / TG 924")).toBe(true);
  });

  it.each(["BUS", "FERRY"] as const)("shows no number for a %s", (mode) => {
    const line = lineOf(buildShareLeg(
      { ...base, mode, depPlace: "A", arrPlace: "B", depAt: new Date("2026-12-10T05:00:00Z"), serviceNumber: "198" },
      BERLIN,
      "x",
    ));
    expect(line).not.toContain("198");
  });

  it("shows no dangling arrow or duration for a departure-only leg", () => {
    const line = lineOf(buildShareLeg(
      { ...base, depPlace: "Munich Hbf", depAt: new Date("2026-12-10T05:51:00Z") },
      BERLIN,
      "x",
    ));
    expect(line).toBe("Thu 10 Dec · Munich Hbf 06:51");
    expect(line).not.toContain("→");
  });

  it("is empty for a leg with no times and no places", () => {
    expect(lineOf(buildShareLeg(base, BERLIN, "x"))).toBe("");
  });

  it("omits a blank number and trims a padded one", () => {
    expect(lineOf(buildShareLeg({ ...base, serviceNumber: "   " }, BERLIN, "x"))).toBe("");
    expect(lineOf(buildShareLeg({ ...base, serviceNumber: "  ICE 1 " }, BERLIN, "x"))).toBe("ICE 1");
  });

  it("marks an arrival on the day before with a true minus", () => {
    const line = lineOf(buildShareLeg(
      { ...base, mode: "FLIGHT", depPlace: "Munich (MUC)", arrPlace: "Honolulu (HNL)", depAt: new Date("2026-12-05T20:00:00Z"), arrAt: new Date("2026-12-05T23:00:00Z") },
      { dep: "Asia/Tokyo", arr: "Pacific/Honolulu" },
      "x",
    ));
    expect(line).toContain("→ Honolulu (HNL) 13:00 \u22121");
  });

  it("shows an arrival-only leg with no arrow or duration", () => {
    const line = lineOf(buildShareLeg({ ...base, arrPlace: "Strasbourg", arrAt: new Date("2026-12-10T09:40:00Z") }, BERLIN, "x"));
    expect(line).toBe("Strasbourg 10:40");
  });

  it("leaves a hidden end's place out and keeps its time", () => {
    const t = { ...base, mode: "FLIGHT" as const, depPlace: "12 Example St, Gold Coast", arrPlace: "Denpasar (DPS)", depAt: new Date("2026-12-05T07:50:00Z"), arrAt: new Date("2026-12-05T14:15:00Z"), serviceNumber: "QF 1" };
    const zones = { dep: "Australia/Brisbane", arr: "Asia/Makassar" };
    const out = lineOf(buildShareLeg(t, zones, "x", { hideDepPlace: true }));
    expect(out).not.toContain("Example St");
    expect(out).toContain("17:50 \u2192 Denpasar (DPS) 22:15");
    const back = lineOf(buildShareLeg({ ...t, depPlace: "Denpasar (DPS)", arrPlace: "1 Home Rd" }, zones, "x", { hideArrPlace: true }));
    expect(back).not.toContain("Home Rd");
    expect(back).toContain("Denpasar (DPS) 17:50 \u2192 22:15");
  });

  it("carries the arrival instant and its zone for the viewer's own time", () => {
    const withArrival = buildShareLeg({ ...base, depAt: new Date("2026-12-10T05:51:00Z"), arrAt: new Date("2026-12-10T09:40:00Z") }, BERLIN, "x");
    expect(withArrival.arrivesAt).toBe("2026-12-10T09:40:00.000Z");
    expect(withArrival.arrivesLocal).toBe("2026-12-10 10:40");
    expect(withArrival).not.toHaveProperty("arrZone");
    expect(buildShareLeg(base, BERLIN, "x")).toMatchObject({ arrivesAt: null, arrivesLocal: null });
  });
});
