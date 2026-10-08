import { describe, it, expect, vi, beforeEach } from "vitest";
const save = vi.fn();
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ save }), generateKey: (_s: unknown, id: string, name: string) => `trips/t1/${id}/${name}` }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));
import { acceptSmallCover, saveCoverFiles, coverExt, isWebpBytes } from "./cover-save";

const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(20)]);
const file = (b: Buffer<ArrayBuffer>, type: string) => new File([b], "x", { type });

beforeEach(() => save.mockReset());

describe("acceptSmallCover", () => {
  it("accepts a real small WebP", async () => expect(await acceptSmallCover(file(webp, "image/webp"))).toEqual(webp));
  it("rejects a non-WebP body declared as WebP", async () => expect(await acceptSmallCover(file(Buffer.from("GIF89a-----------"), "image/webp"))).toBeNull());
  it("rejects a non-webp type, empty, oversize and non-File", async () => {
    expect(await acceptSmallCover(file(webp, "image/png"))).toBeNull();
    expect(await acceptSmallCover(file(Buffer.alloc(0), "image/webp"))).toBeNull();
    expect(await acceptSmallCover(file(Buffer.concat([webp, Buffer.alloc(512 * 1024)]), "image/webp"))).toBeNull();
    expect(await acceptSmallCover("nope")).toBeNull();
  });
});

describe("saveCoverFiles", () => {
  it("saves large then small and returns both keys", async () => {
    const r = await saveCoverFiles({ tripId: "t1", bytes: Buffer.from("x"), mime: "image/jpeg", small: webp, route: "r" });
    expect(r.key).toMatch(/cover\.jpg$/);
    expect(r.smallKey).toBe(`${r.key}-sm`);
    expect(save.mock.calls.map((c) => c[0])).toEqual([r.key, r.smallKey]);
  });
  it("throws when the large save fails and never saves the small", async () => {
    save.mockRejectedValueOnce(new Error("down"));
    await expect(saveCoverFiles({ tripId: "t1", bytes: Buffer.from("x"), mime: "image/png", small: webp, route: "r" })).rejects.toThrow();
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("returns smallKey null when only the small save fails", async () => {
    save.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("down"));
    expect((await saveCoverFiles({ tripId: "t1", bytes: Buffer.from("x"), mime: "image/png", small: webp, route: "r" })).smallKey).toBeNull();
  });
});

it("coverExt / isWebpBytes", () => {
  expect([coverExt("image/png"), coverExt("image/webp"), coverExt("image/gif"), coverExt("image/jpeg")]).toEqual(["png", "webp", "gif", "jpg"]);
  expect(isWebpBytes(webp)).toBe(true);
  expect(isWebpBytes(Buffer.from("RIFF"))).toBe(false);
});
