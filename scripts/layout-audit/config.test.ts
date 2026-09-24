import { describe, expect, it } from "vitest";
import { WIDTHS, viewportFor, assertLocalBaseUrl, resolveOutDir, buildCaptureMatrix, ROUTES } from "./config";

describe("viewportFor", () => {
  it("phones are mobile, touch, 2x, 800 tall", () =>
    expect(viewportFor(390)).toEqual({ width: 390, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }));
  it("430 is still a phone", () => expect(viewportFor(430).isMobile).toBe(true));
  it("768 and up are desktop, 1x, 900 tall", () =>
    expect(viewportFor(768)).toEqual({ width: 768, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 }));
});

describe("assertLocalBaseUrl", () => {
  it.each(["http://localhost:3000", "http://127.0.0.1:3000/"])("accepts %s", (u) =>
    expect(assertLocalBaseUrl(u).hostname).toMatch(/localhost|127\.0\.0\.1/));
  it.each(["https://teepee.vercel.app", "http://localhost.evil.com", "http://192.168.1.4:3000", "not a url"])("refuses %s", (u) =>
    expect(() => assertLocalBaseUrl(u)).toThrow(/localhost/));
});

describe("resolveOutDir", () => {
  it("prefers LAYOUT_AUDIT_OUT", () => expect(resolveOutDir({ LAYOUT_AUDIT_OUT: "/x/y" }, new Date())).toBe("/x/y"));
  it("defaults to a timestamped /tmp dir", () =>
    expect(resolveOutDir({}, new Date("2026-09-24T10:11:12Z"))).toBe("/tmp/layout-audit/2026-09-24T10-11-12Z"));
  it("refuses a path inside the repo", () => expect(() => resolveOutDir({ LAYOUT_AUDIT_OUT: process.cwd() + "/out" }, new Date())).toThrow(/repo/));
});

describe("buildCaptureMatrix", () => {
  const m = buildCaptureMatrix({
    overlays: [
      { id: "stop-add", form: true },
      { id: "traveller-menu", form: false },
      { id: "mobile-more", only: "phone", form: false },
      { id: "rail-more", only: "desktop", form: false },
      { id: "adjust-dates", only: "desktop", form: true },
    ],
    phaseTripsAvailable: ["sketching", "final-prep", "travelling", "past"],
  });
  const count = (set: string) => m.filter((c) => c.set === set).length;
  const tripRoutes = ROUTES.filter((r) => r.tripScoped);
  const nonPrint = ROUTES.filter((r) => r.sub !== "/print");

  it("deep: every non-print route at all 10 widths, light", () => {
    expect(count("deep")).toBe(nonPrint.length * WIDTHS.length);
    expect(m.filter((c) => c.set === "deep").every((c) => c.theme === "light")).toBe(true);
  });
  it("phase: phase-sensitive routes × 4 trips × 4 widths", () =>
    expect(count("phase")).toBe(ROUTES.filter((r) => r.phaseSensitive).length * 4 * 4));
  it("phase: skips a phase with no trip", () => {
    const m2 = buildCaptureMatrix({ overlays: [], phaseTripsAvailable: ["past"] });
    expect(m2.filter((c) => c.set === "phase").every((c) => c.trip === "past")).toBe(true);
  });
  it("empty: trip routes minus print at 375 and 1440", () =>
    expect(count("empty")).toBe(tripRoutes.filter((r) => r.sub !== "/print").length * 2));
  it("dark: non-print routes at 390 and 1440", () => {
    expect(count("dark")).toBe(nonPrint.length * 2);
    expect(m.filter((c) => c.set === "dark").every((c) => c.theme === "dark")).toBe(true);
  });
  it("print: one A4 print capture", () => {
    const p = m.filter((c) => c.set === "print");
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ width: 794, media: "print", trip: "deep" });
  });
  it("overlay: 3 widths for unrestricted ones, 2 for phone-only, 1 for desktop-only, + keyboard for non-desktop forms", () => {
    // stop-add 3 + 2 kbd, traveller-menu 3, mobile-more 2, rail-more 1, adjust-dates 1 (desktop-only form: no kbd)
    expect(count("overlay")).toBe(5 + 3 + 2 + 1 + 1);
    expect(m.filter((c) => c.keyboard).map((c) => `${c.overlay}@${c.width}`).sort()).toEqual(["stop-add@360", "stop-add@390"]);
    expect(m.filter((c) => c.overlay === "mobile-more").map((c) => c.width).sort()).toEqual([360, 390]);
    expect(m.filter((c) => c.overlay === "rail-more").map((c) => c.width)).toEqual([1440]);
  });
  it("ids are unique", () => expect(new Set(m.map((c) => c.id)).size).toBe(m.length));
  it("non-trip routes use trip 'none'", () =>
    expect(m.filter((c) => !c.route.tripScoped && c.set !== "overlay").every((c) => c.trip === "none")).toBe(true));
});
