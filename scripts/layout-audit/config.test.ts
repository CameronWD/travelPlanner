import { describe, expect, it } from "vitest";
import { PROFILES, profileFor, parseSets, assertLocalBaseUrl, assertOutsideRepo, resolveOutDir, buildCaptureMatrix, ROUTES, LOADING_ROUTE_LABELS, CLS_ROUTE_LABELS, SHIFT_PROFILE_IDS } from "./config";

describe("device profiles", () => {
  it("phones run in WebKit at DPR 3, mobile and touch, with an iPhone user agent", () => {
    const phones = PROFILES.filter((p) => p.kind === "phone");
    expect(phones.map((p) => p.id)).toEqual(["iphone17-browser", "iphone17-pwa", "iphone12-browser", "iphone12-pwa"]);
    expect(phones.every((p) => p.engine === "webkit" && p.deviceScaleFactor === 3 && p.isMobile && p.hasTouch && /iPhone/.test(p.userAgent ?? ""))).toBe(true);
  });
  it("an installed profile is the same phone as its browser one, only taller", () => {
    expect(profileFor("iphone17-pwa")).toMatchObject({ width: 402, height: 874 });
    expect(profileFor("iphone17-browser")).toMatchObject({ width: 402, height: 700 });
    expect(profileFor("iphone12-pwa")).toMatchObject({ width: 390, height: 844 });
    expect(profileFor("iphone12-browser")).toMatchObject({ width: 390, height: 664 });
  });
  it("desktops run in Chromium at DPR 1, the MacBook at DPR 2", () => {
    const desktops = PROFILES.filter((p) => p.kind === "desktop");
    expect(desktops.every((p) => p.engine === "chromium" && !p.isMobile && !p.hasTouch)).toBe(true);
    expect(profileFor("1024")).toMatchObject({ width: 1024, height: 768, deviceScaleFactor: 1 });
    expect(profileFor("mbp14")).toMatchObject({ width: 1512, height: 860, deviceScaleFactor: 2 });
  });
  it("throws on an unknown profile", () => expect(() => profileFor("iphone99")).toThrow(/unknown device profile/));
});

describe("parseSets", () => {
  it("unset or blank means everything", () => {
    expect(parseSets(undefined).has("resize")).toBe(true);
    expect(parseSets(" ").size).toBe(9);
  });
  it("keeps the named sets", () => expect([...parseSets("deep, cls")]).toEqual(["deep", "cls"]));
  it("refuses a typo instead of running nothing", () => expect(() => parseSets("deeep")).toThrow(/unknown set/));
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
  it("accepts a sibling of the repo that merely shares its name as a prefix", () =>
    expect(resolveOutDir({ LAYOUT_AUDIT_OUT: process.cwd() + "-audit-out" }, new Date())).toBe(process.cwd() + "-audit-out"));
});

describe("assertOutsideRepo", () => {
  it.each(["/work", "/work/", "/work/out", "/work/a/../out", "out", "./tmp/x"])("refuses %s (inside /work)", (d) =>
    expect(() => assertOutsideRepo(d, "/work")).toThrow(/inside the repo/));
  it.each(["/tmp/layout-audit/x", "/work-audit", "/workspace/out", "/", "../elsewhere"])("accepts %s", (d) =>
    expect(() => assertOutsideRepo(d, "/work")).not.toThrow());
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
  const profilesOf = (set: string, label: string) => m.filter((c) => c.set === set && c.route.label === label).map((c) => c.profile);
  const PAIR = ["iphone17-pwa", "mbp14"];

  it("deep: every route (on-screen /print included) at three phone and six desktop profiles, light", () => {
    expect(count("deep")).toBe(ROUTES.length * 9);
    expect(m.filter((c) => c.set === "deep").every((c) => c.theme === "light" && c.media === "screen")).toBe(true);
    expect(profilesOf("deep", "print")).toEqual(["iphone12-pwa", "iphone17-pwa", "iphone17-browser", "768", "1024", "1280", "1440", "1920", "mbp14"]);
  });
  it("the hidden What-if compare page is gone; Reviews, More and the check-in day are in", () => {
    const labels = ROUTES.map((r) => r.label);
    expect(labels).not.toContain("compare");
    expect(labels).toEqual(expect.arrayContaining(["reviews", "more", "day-checkin"]));
  });
  it("phase: phase-sensitive routes × 4 trips × iphone17-pwa and mbp14", () =>
    expect(count("phase")).toBe(ROUTES.filter((r) => r.phaseSensitive).length * 4 * 2));
  it("phase: skips a phase with no trip", () => {
    const m2 = buildCaptureMatrix({ overlays: [], phaseTripsAvailable: ["past"] });
    expect(m2.filter((c) => c.set === "phase").every((c) => c.trip === "past")).toBe(true);
  });
  it("empty: trip routes minus print and the check-in day, at iphone17-pwa and mbp14", () => {
    expect(count("empty")).toBe(tripRoutes.filter((r) => r.sub !== "/print" && r.label !== "day-checkin").length * 2);
    expect(profilesOf("empty", "plan")).toEqual(PAIR);
  });
  it("dark: the deep set's routes (on-screen /print included) at iphone17-pwa and mbp14", () => {
    expect(count("dark")).toBe(ROUTES.length * 2);
    expect(m.filter((c) => c.set === "dark").every((c) => c.theme === "dark" && c.media === "screen")).toBe(true);
    expect(profilesOf("dark", "print")).toEqual(PAIR);
  });
  it("print: one A4 print capture", () => {
    const p = m.filter((c) => c.set === "print");
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ width: 794, media: "print", trip: "deep" });
  });
  it("overlay: 3 phone profiles + mbp14, filtered by `only`; keyboard variants for forms at the 3 phone profiles", () => {
    // stop-add 4 + 3 kbd, traveller-menu 4, mobile-more 3, rail-more 1, adjust-dates 1 (desktop-only form: no kbd)
    expect(count("overlay")).toBe(7 + 4 + 3 + 1 + 1);
    expect(m.filter((c) => c.keyboard).map((c) => `${c.overlay}@${c.profile}`).sort()).toEqual([
      "stop-add@iphone12-browser",
      "stop-add@iphone17-browser",
      "stop-add@iphone17-pwa",
    ]);
    expect(m.filter((c) => c.overlay === "mobile-more").map((c) => c.profile)).toEqual(["iphone17-browser", "iphone17-pwa", "iphone12-browser"]);
    expect(m.filter((c) => c.overlay === "rail-more").map((c) => c.profile)).toEqual(["mbp14"]);
  });
  it("loading: the main routes at iphone17-pwa and mbp14", () => {
    expect(count("loading")).toBe(LOADING_ROUTE_LABELS.length * 2);
    expect(profilesOf("loading", "trips")).toEqual(PAIR);
  });
  it("`sets` keeps only the named sets", () => {
    const only = buildCaptureMatrix({ overlays: [], phaseTripsAvailable: ["past"], sets: new Set(["phase", "empty"]) });
    expect(new Set(only.map((c) => c.set))).toEqual(new Set(["phase", "empty"]));
  });
  it("ids are unique", () => expect(new Set(m.map((c) => c.id)).size).toBe(m.length));
  it("overlay ids read overlay/<overlayId>/<profile>-<theme>[-kbd], like their shot paths", () => {
    expect(m.filter((c) => c.overlay === "stop-add").map((c) => c.id)).toEqual([
      "overlay/stop-add/iphone17-browser-light",
      "overlay/stop-add/iphone17-pwa-light",
      "overlay/stop-add/iphone12-browser-light",
      "overlay/stop-add/mbp14-light",
      "overlay/stop-add/iphone17-browser-light-kbd",
      "overlay/stop-add/iphone12-browser-light-kbd",
      "overlay/stop-add/iphone17-pwa-light-kbd",
    ]);
    expect(m.filter((c) => c.set !== "overlay").every((c) => c.id === `${c.set}/${c.route.label}/${c.trip}/${c.profile}-${c.theme}`)).toBe(true);
  });
  it("non-trip routes use trip 'none'", () =>
    expect(m.filter((c) => !c.route.tripScoped && c.set !== "overlay").every((c) => c.trip === "none")).toBe(true));
});

describe("cold-load shift coverage", () => {
  it("measures every loading route plus eight more, all of them real routes", () => {
    expect(CLS_ROUTE_LABELS).toEqual(expect.arrayContaining([...LOADING_ROUTE_LABELS, "globe", "account", "summary", "settings", "activity", "today", "more", "whats-new"]));
    expect(CLS_ROUTE_LABELS).toHaveLength(LOADING_ROUTE_LABELS.length + 8);
    const labels = new Set(ROUTES.map((r) => r.label));
    expect(CLS_ROUTE_LABELS.filter((l) => !labels.has(l))).toEqual([]);
  });
  it("measures on the installed phone and a desktop", () => expect(SHIFT_PROFILE_IDS).toEqual(["iphone17-pwa", "1440"]));
});
