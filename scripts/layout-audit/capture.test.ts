import { describe, expect, it, vi } from "vitest";
import { sliceRanges, captureSlices } from "./capture";

describe("sliceRanges", () => {
  it("one slice when the page fits", () => expect(sliceRanges(900, 1)).toEqual([{ y: 0, h: 900 }]));
  it("respects device pixels: 2x halves the CSS slice height", () =>
    expect(sliceRanges(2500, 2)).toEqual([{ y: 0, h: 1000 }, { y: 1000, h: 1000 }, { y: 2000, h: 500 }]));
  it("covers a very tall page exactly, no gap, no overlap, no empty slice", () => {
    const s = sliceRanges(15_437, 2);
    expect(s[0].y).toBe(0);
    for (let i = 1; i < s.length; i++) expect(s[i].y).toBe(s[i - 1].y + s[i - 1].h);
    expect(s.at(-1)!.y + s.at(-1)!.h).toBe(15_437);
    expect(s.every((x) => x.h > 0 && x.h * 2 <= 2000)).toBe(true);
  });
  it("rounds fractional heights up so the bottom pixel row is included", () =>
    expect(sliceRanges(900.4, 1)).toEqual([{ y: 0, h: 901 }]));
  it("zero-height page still yields one 1px slice (never an empty list)", () =>
    expect(sliceRanges(0, 1)).toEqual([{ y: 0, h: 1 }]));
});

describe("captureSlices", () => {
  it("names a single slice without a part suffix and clips each slice", async () => {
    const page = { evaluate: vi.fn(async () => 900), screenshot: vi.fn(async () => Buffer.from("")) };
    const files = await captureSlices(page as never, { dir: "/tmp/la-test", baseName: "390-light", width: 390, deviceScaleFactor: 1 });
    expect(files).toEqual(["/tmp/la-test/390-light.png"]);
    expect(page.screenshot).toHaveBeenCalledWith(expect.objectContaining({ clip: { x: 0, y: 0, width: 390, height: 900 }, fullPage: true }));
  });
  it("suffixes parts when sliced", async () => {
    const page = { evaluate: vi.fn(async () => 2500), screenshot: vi.fn(async () => Buffer.from("")) };
    const files = await captureSlices(page as never, { dir: "/tmp/la-test", baseName: "x", width: 390, deviceScaleFactor: 2 });
    expect(files.map((f) => f.split("/").pop())).toEqual(["x-part1.png", "x-part2.png", "x-part3.png"]);
  });
});
