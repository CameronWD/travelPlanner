import { describe, it, expect } from "vitest";
import { summarise, holdViolations, type Sample } from "./checks";

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
