import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { makeCoverSmall } from "./cover-small-image";

const jpeg = (w: number, h: number, orientation?: number) => {
  const s = sharp({ create: { width: w, height: h, channels: 3, background: "#c33" } }).jpeg();
  return (orientation ? s.withMetadata({ orientation }) : s).toBuffer();
};

describe("makeCoverSmall", () => {
  it("fits a landscape inside 480 wide as WebP", async () => {
    const r = (await makeCoverSmall(await jpeg(2000, 1000)))!;
    const m = await sharp(r.webp).metadata();
    expect([m.format, m.width, m.height]).toEqual(["webp", 480, 240]);
    expect([r.width, r.height]).toEqual([2000, 1000]);
  });

  it("applies EXIF rotation (orientation 6 = portrait on screen)", async () => {
    const r = (await makeCoverSmall(await jpeg(1200, 800, 6)))!;
    const m = await sharp(r.webp).metadata();
    expect([m.width, m.height]).toEqual([320, 480]);
    expect([r.width, r.height]).toEqual([800, 1200]);
  });

  it("never enlarges", async () => {
    const m = await sharp((await makeCoverSmall(await jpeg(300, 200)))!.webp).metadata();
    expect([m.width, m.height]).toEqual([300, 200]);
  });

  it("skips GIFs and garbage", async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).gif().toBuffer();
    expect(await makeCoverSmall(gif)).toBeNull();
    expect(await makeCoverSmall(Buffer.from("not an image"))).toBeNull();
  });
});
