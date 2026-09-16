import { describe, it, expect, vi, beforeEach } from "vitest";

const imageCompressionMock = vi.fn();
vi.mock("browser-image-compression", () => ({ default: imageCompressionMock }));

import { compressImage, oversizeUploadMessage } from "./image-compress";

function makeFile(bytes: number, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("compressImage", () => {
  beforeEach(() => imageCompressionMock.mockReset());

  it("passes non-image files through untouched", async () => {
    const pdf = makeFile(100, "ticket.pdf", "application/pdf");
    const out = await compressImage(pdf);
    expect(out).toBe(pdf);
    expect(imageCompressionMock).not.toHaveBeenCalled();
  });

  it("passes animated GIFs through untouched", async () => {
    const gif = makeFile(100, "anim.gif", "image/gif");
    const out = await compressImage(gif);
    expect(out).toBe(gif);
    expect(imageCompressionMock).not.toHaveBeenCalled();
  });

  it("compresses an image to a smaller .webp file", async () => {
    const jpg = makeFile(5000, "photo.jpg", "image/jpeg");
    imageCompressionMock.mockResolvedValue(
      new File([new Uint8Array(500)], "photo.jpg", { type: "image/webp" }),
    );
    const out = await compressImage(jpg);
    expect(imageCompressionMock).toHaveBeenCalledWith(
      jpg,
      expect.objectContaining({
        maxWidthOrHeight: 2048,
        maxSizeMB: 1,
        useWebWorker: true,
        fileType: "image/webp",
        initialQuality: 0.82,
      }),
    );
    expect(out).not.toBe(jpg);
    expect(out.type).toBe("image/webp");
    expect(out.name).toBe("photo.webp");
    expect(out.size).toBeLessThan(jpg.size);
  });

  it("keeps the original when the compressed result would be larger", async () => {
    const jpg = makeFile(300, "small.jpg", "image/jpeg");
    imageCompressionMock.mockResolvedValue(
      new File([new Uint8Array(9000)], "small.jpg", { type: "image/webp" }),
    );
    const out = await compressImage(jpg);
    expect(out).toBe(jpg);
  });

  it("falls back to the original when compression throws", async () => {
    const jpg = makeFile(5000, "photo.jpg", "image/jpeg");
    imageCompressionMock.mockImplementationOnce(async () => {
      throw new Error("decode failed");
    });
    const out = await compressImage(jpg);
    expect(out).toBe(jpg);
  });
});

describe("oversizeUploadMessage", () => {
  it("returns null for a file at or under the cap", () => {
    const small = new File([new Uint8Array(1024)], "a.webp", { type: "image/webp" });
    expect(oversizeUploadMessage(small)).toBeNull();
  });

  it("names the size and suggests alternatives for an oversize image", () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024)], "big.heic", { type: "image/heic" });
    const msg = oversizeUploadMessage(big);
    expect(msg).toMatch(/5\.0 MB/);
    expect(msg).toMatch(/couldn't be shrunk/i);
  });

  it("uses the non-image wording for an oversize PDF", () => {
    const pdf = new File([new Uint8Array(6 * 1024 * 1024)], "doc.pdf", { type: "application/pdf" });
    const msg = oversizeUploadMessage(pdf);
    expect(msg).toMatch(/6\.0 MB/);
    expect(msg).toMatch(/smaller copy/i);
    expect(msg).not.toMatch(/shrunk/i);
  });
});
