import { describe, it, expect } from "vitest";
import { summarise, holdViolations, type Sample, arrowDrift, stripReach, sectionCutViolations, changedBarFrames } from "./checks";

describe("holdViolations", () => {
  const before = { h1: "Sat 12 Dec", text: "Sat 12 Dec …" };
  it("passes when every sample before the URL change still shows the old page and the bar arrives after the delay", () => {
    const samples: Sample[] = [
      { t: 100, url: "/a", h1: "Sat 12 Dec", text: "Sat 12 Dec …", bar: false, skeleton: false },
      { t: 500, url: "/a", h1: "Sat 12 Dec", text: "Sat 12 Dec …", bar: true, skeleton: false },
      { t: 1600, url: "/b", h1: "Sun 13 Dec", text: "Sun 13 Dec …", bar: false, skeleton: false },
    ];
    expect(holdViolations(before, samples, { delayMs: 300, expectBar: true })).toEqual([]);
  });
  it("reports a blank/skeleton/changed page before the URL moved, a missing bar, and an early bar", () => {
    const samples: Sample[] = [
      { t: 100, url: "/a", h1: "Sat 12 Dec", text: "Sat 12 Dec …", bar: true, skeleton: false },
      { t: 500, url: "/a", h1: "", text: "", bar: false, skeleton: true },
    ];
    const v = holdViolations(before, samples, { delayMs: 300, expectBar: true });
    expect(v).toEqual(expect.arrayContaining([
      expect.stringContaining("progress bar visible at 100ms"),
      expect.stringContaining("h1 changed or vanished at 500ms"),
      expect.stringContaining("skeleton at 500ms"),
      expect.stringContaining("progress bar never appeared"),
    ]));
  });
  it("with expectBar false, any bar is a violation", () => {
    const samples: Sample[] = [{ t: 400, url: "/a", h1: "x", text: "x", bar: true, skeleton: false }];
    expect(holdViolations({ h1: "x", text: "x" }, samples, { delayMs: 300, expectBar: false })).toEqual([expect.stringContaining("progress bar visible at 400ms")]);
  });
});

describe("summarise", () => {
  it("exit 1 only when a hard check fails", () => {
    expect(summarise([{ name: "a", hard: true, ok: true, detail: "" }, { name: "b", hard: false, ok: false, detail: "soft" }]).exitCode).toBe(0);
    expect(summarise([{ name: "a", hard: true, ok: false, detail: "x" }]).exitCode).toBe(1);
  });
});

describe("arrowDrift (spec 2026-09-28 D2)", () => {
  it("empty when every box is identical", () => {
    expect(arrowDrift([{ x: 16, y: 120, w: 44, h: 44 }, { x: 16, y: 120, w: 44, h: 44 }])).toEqual([]);
  });
  it("names the sample and axis that moved", () => {
    expect(arrowDrift([{ x: 16, y: 120, w: 44, h: 44 }, { x: 22, y: 120, w: 44, h: 44 }, { x: 16, y: 131, w: 44, h: 44 }])).toEqual(["sample 2 x moved 16→22", "sample 3 y moved 120→131"]);
  });
});

describe("stripReach (spec 2026-09-28 D1)", () => {
  it("empty when the strip links the first and last day", () => {
    expect(stripReach(["/trips/t/day/2026-12-04", "/trips/t/day/2026-12-05", "/trips/t/day/2027-01-08"], "2026-12-04", "2027-01-08")).toEqual([]);
  });
  it("reports a missing end", () => {
    expect(stripReach(["/trips/t/day/2026-12-08", "/trips/t/day/2026-12-16"], "2026-12-04", "2027-01-08")).toEqual(["first day 2026-12-04 not in the strip", "last day 2027-01-08 not in the strip"]);
  });
});

describe("sectionCutViolations (ADR 0065)", () => {
  const expected = { sections: 2, from: "plan", to: "budget" };
  it("passes a clean cut: the resting number of sections every frame, the inner section goes straight from old to new", () => {
    const s = [
      { t: 0, sections: 2, section: "plan", animating: false },
      { t: 50, sections: 2, section: "plan", animating: false },
      { t: 100, sections: 2, section: "budget", animating: false },
      { t: 150, sections: 2, section: "budget", animating: false },
    ];
    expect(sectionCutViolations(s, expected)).toEqual([]);
  });
  it("flags an extra section in a frame, a missing or foreign section, and the old one coming back", () => {
    const s = [
      { t: 0, sections: 2, section: "plan", animating: false },
      { t: 50, sections: 3, section: "plan", animating: false },
      { t: 100, sections: 2, section: "", animating: false },
      { t: 150, sections: 2, section: "budget", animating: false },
      { t: 200, sections: 2, section: "plan", animating: false },
    ];
    expect(sectionCutViolations(s, expected)).toEqual(["3 sections at 50ms", 'section "" at 100ms', "old section back at 200ms"]);
  });
  it("flags a frame with a view transition running — a crossfade that came back keeps the DOM identical to a cut", () => {
    const s = [
      { t: 0, sections: 2, section: "plan", animating: false },
      { t: 50, sections: 2, section: "budget", animating: true },
      { t: 100, sections: 2, section: "budget", animating: false },
    ];
    expect(sectionCutViolations(s, expected)).toEqual(["view transition running at 50ms"]);
  });
});
describe("changedBarFrames", () => {
  it("returns the frames whose tab-bar pixels differ from the settled page", () => {
    expect(changedBarFrames("A", [{ t: 0, bar: "A" }, { t: 40, bar: "B" }])).toEqual([40]);
  });
});
