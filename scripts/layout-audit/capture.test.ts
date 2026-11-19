// @vitest-environment jsdom
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
  // A page stub that tracks its own scroll position, like a window would.
  const recordingPage = (height: number, viewport: number, failOnSlice?: number) => {
    const events: string[] = [];
    let scrollY = 0;
    let slice = 0;
    const page = {
      waitForTimeout: vi.fn(async () => undefined),
      evaluate: vi.fn(async (js: string) => {
        if (js === HIDE_FIXED_JS) events.push("hide-fixed");
        else if (js === RESTORE_FIXED_JS) events.push("restore-fixed");
        else if (js === SCROLL_HEIGHT_JS) return height;
        else if (/window\.scrollY/.test(js)) return scrollY;
        else if (/scrollTo/.test(js)) {
          const top = /top: document/.test(js) ? height : Number(/top: (\d+)/.exec(js)?.[1]);
          scrollY = Math.max(0, Math.min(top, height - viewport));
          events.push(`scroll ${scrollY}`);
        } else events.push(`unknown evaluate: ${js}`);
        return undefined;
      }),
      screenshot: vi.fn(async (o: { path: string; fullPage?: boolean; clip?: { y: number; height: number } }) => {
        if (o.clip && ++slice === failOnSlice) throw new Error("screenshot failed");
        const name = o.path.split("/").pop();
        events.push(o.clip ? `slice ${name} y=${o.clip.y} h=${o.clip.height}${o.fullPage ? " fullPage" : ""}` : `viewport ${name}`);
        return Buffer.from("");
      }),
    };
    return { page, events };
  };
  const shots = (events: string[]) => events.filter((e) => !e.startsWith("scroll"));

  it("names a single slice without a part suffix; the first screen and the page end come last", async () => {
    const { page } = recordingPage(900, 900);
    const files = await captureSlices(page as never, { dir: "/tmp/la-test", baseName: "1440-light", width: 1440, height: 900, deviceScaleFactor: 1 });
    expect(files).toEqual(["/tmp/la-test/1440-light.png", "/tmp/la-test/1440-light-fold.png", "/tmp/la-test/1440-light-end.png"]);
    expect(page.screenshot).toHaveBeenCalledWith(expect.objectContaining({ clip: { x: 0, y: 0, width: 1440, height: 900 } }));
  });

  it("a slice is one viewport at most, and 2000 device px at most", async () => {
    const tall = recordingPage(2500, 900);
    await captureSlices(tall.page as never, { dir: "/tmp/la-test", baseName: "x", width: 1440, height: 900, deviceScaleFactor: 1 });
    expect(shots(tall.events).filter((e) => e.startsWith("slice"))).toEqual([
      "slice x-part1.png y=0 h=900",
      "slice x-part2.png y=0 h=900",
      "slice x-part3.png y=200 h=700",
    ]);
    const phone = recordingPage(1400, 874);
    await captureSlices(phone.page as never, { dir: "/tmp/la-test", baseName: "x", width: 402, height: 874, deviceScaleFactor: 3 });
    expect(shots(phone.events).filter((e) => e.startsWith("slice"))).toEqual([
      "slice x-part1.png y=0 h=666",
      "slice x-part2.png y=140 h=666",
      "slice x-part3.png y=806 h=68",
    ]);
  });

  it("never resizes the viewport: no slice is a fullPage screenshot", async () => {
    const { page, events } = recordingPage(2500, 900);
    await captureSlices(page as never, { dir: "/tmp/la-test", baseName: "x", width: 1440, height: 900, deviceScaleFactor: 1 });
    expect(events.some((e) => e.includes("fullPage"))).toBe(false);
  });

  it("scrolls the whole page first, shoots the first screen, hides fixed chrome for the slices, then shoots the page end", async () => {
    const { page, events } = recordingPage(2500, 900);
    const files = await captureSlices(page as never, { dir: "/tmp/la-test", baseName: "x", width: 1440, height: 900, deviceScaleFactor: 1 });
    expect(events.slice(0, 4)).toEqual(["scroll 0", "scroll 900", "scroll 1600", "scroll 0"]);
    expect(shots(events)).toEqual([
      "viewport x-fold.png",
      "hide-fixed",
      "slice x-part1.png y=0 h=900",
      "slice x-part2.png y=0 h=900",
      "slice x-part3.png y=200 h=700",
      "restore-fixed",
      "viewport x-end.png",
    ]);
    expect(events.at(-1)).toBe("scroll 0");
    expect(files.at(-1)).toBe("/tmp/la-test/x-end.png");
  });

  it("restores fixed chrome even when a slice fails", async () => {
    const { page, events } = recordingPage(2500, 900, 2);
    await expect(
      captureSlices(page as never, { dir: "/tmp/la-test", baseName: "x", width: 1440, height: 900, deviceScaleFactor: 1 }),
    ).rejects.toThrow("screenshot failed");
    expect(shots(events)).toEqual(["viewport x-fold.png", "hide-fixed", "slice x-part1.png y=0 h=900", "restore-fixed"]);
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
