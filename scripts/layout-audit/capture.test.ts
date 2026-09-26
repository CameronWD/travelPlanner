import { describe, expect, it, vi } from "vitest";
import { sliceRanges, captureSlices, isShotOf, HIDE_FIXED_JS, RESTORE_FIXED_JS, SCROLL_HEIGHT_JS } from "./capture";

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
    expect(files).toEqual(["/tmp/la-test/390-light.png", "/tmp/la-test/390-light-end.png"]);
    expect(page.screenshot).toHaveBeenCalledWith(expect.objectContaining({ clip: { x: 0, y: 0, width: 390, height: 900 }, fullPage: true }));
  });
  it("suffixes parts when sliced", async () => {
    const page = { evaluate: vi.fn(async () => 2500), screenshot: vi.fn(async () => Buffer.from("")) };
    const files = await captureSlices(page as never, { dir: "/tmp/la-test", baseName: "x", width: 390, deviceScaleFactor: 2 });
    expect(files.map((f) => f.split("/").pop())).toEqual(["x-part1.png", "x-part2.png", "x-part3.png", "x-end.png"]);
  });

  // Final review: a full-page slice paints position:fixed chrome (the mobile tab bar, the
  // floating feedback button) at the first viewport's bottom, over real content. The slices
  // are taken with it hidden; one viewport shot at the page end then shows it where a
  // Traveller sees it — the state check 6 (hidden behind fixed chrome) measures.
  const recordingPage = (height: number, failOnSlice?: number) => {
    const events: string[] = [];
    let slice = 0;
    const page = {
      evaluate: vi.fn(async (js: string) => {
        if (js === HIDE_FIXED_JS) events.push("hide-fixed");
        else if (js === RESTORE_FIXED_JS) events.push("restore-fixed");
        else if (js === SCROLL_HEIGHT_JS) return height;
        else if (/scrollTo/.test(js)) events.push(/scrollHeight/.test(js) ? "scroll-end" : "scroll-top");
        else events.push(`unknown evaluate: ${js}`);
        return undefined;
      }),
      screenshot: vi.fn(async (o: { path: string; fullPage?: boolean; clip?: unknown }) => {
        if (o.clip && ++slice === failOnSlice) throw new Error("screenshot failed");
        events.push(`${o.clip ? "slice" : "viewport"} ${o.path.split("/").pop()}${o.fullPage ? " fullPage" : ""}`);
        return Buffer.from("");
      }),
    };
    return { page, events };
  };

  it("hides fixed chrome for the slices, then restores it and shoots the page end last", async () => {
    const { page, events } = recordingPage(2500);
    const files = await captureSlices(page as never, { dir: "/tmp/la-test", baseName: "x", width: 390, deviceScaleFactor: 2 });
    expect(events).toEqual([
      "hide-fixed",
      "slice x-part1.png fullPage",
      "slice x-part2.png fullPage",
      "slice x-part3.png fullPage",
      "restore-fixed",
      "scroll-end",
      "viewport x-end.png",
      "scroll-top",
    ]);
    expect(files.at(-1)).toBe("/tmp/la-test/x-end.png");
  });

  it("restores fixed chrome even when a slice fails", async () => {
    const { page, events } = recordingPage(2500, 2);
    await expect(
      captureSlices(page as never, { dir: "/tmp/la-test", baseName: "x", width: 390, deviceScaleFactor: 2 }),
    ).rejects.toThrow("screenshot failed");
    expect(events).toEqual(["hide-fixed", "slice x-part1.png fullPage", "restore-fixed"]);
  });
});

describe("HIDE_FIXED_JS / RESTORE_FIXED_JS (in a DOM)", () => {
  it("hides exactly the position:fixed elements (and their subtrees), and restores them", () => {
    document.head.innerHTML = "";
    document.body.innerHTML =
      `<main id="m"><p id="p">content</p></main>` +
      `<nav id="bar" style="position: fixed; bottom: 0"><a id="tab" style="visibility: visible">Plan</a></nav>` +
      `<button id="fab" style="position: fixed; right: 0">Feedback</button>`;
    const vis = (id: string) => getComputedStyle(document.getElementById(id)!).visibility;

    expect((0, eval)(HIDE_FIXED_JS)).toBe(2);
    expect(["bar", "tab", "fab"].map(vis)).toEqual(["hidden", "hidden", "hidden"]);
    expect(["m", "p"].map(vis)).not.toContain("hidden");

    (0, eval)(RESTORE_FIXED_JS);
    expect(["bar", "tab", "fab", "m", "p"].map(vis)).not.toContain("hidden");
    expect(document.querySelector("style")).toBeNull();
  });
});

describe("isShotOf", () => {
  it("matches a capture's own single shot, slices and end shot", () => {
    for (const f of ["390-light.png", "390-light-part1.png", "390-light-part12.png", "390-light-end.png"]) {
      expect(isShotOf("390-light", f), f).toBe(true);
    }
  });
  it("never matches a sibling capture's files in the same folder", () => {
    for (const f of ["390-light-kbd.png", "390-light-kbd-end.png", "1390-light.png", "390-dark.png", "390-light.png.bak"]) {
      expect(isShotOf("390-light", f), f).toBe(false);
    }
  });
});
