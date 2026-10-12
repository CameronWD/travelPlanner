import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireTripAccess, attachmentFindUnique, stopFindMany, itemFindMany, storageRead, getDocumentProxy, extractText } =
  vi.hoisted(() => ({
    requireTripAccess: vi.fn(),
    attachmentFindUnique: vi.fn(),
    stopFindMany: vi.fn(),
    itemFindMany: vi.fn(),
    storageRead: vi.fn(),
    getDocumentProxy: vi.fn(),
    extractText: vi.fn(),
  }));

vi.mock("@/lib/guards", () => ({ requireTripAccess }));
vi.mock("@/lib/db", () => ({
  db: {
    attachment: { findUnique: attachmentFindUnique },
    stop: { findMany: stopFindMany },
    accommodation: { findMany: vi.fn().mockResolvedValue([]) },
    transport: { findMany: vi.fn().mockResolvedValue([]) },
    item: { findMany: itemFindMany },
  },
}));
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ read: storageRead }) }));
vi.mock("unpdf", () => ({ getDocumentProxy, extractText }));

import { loadAttachmentContentForMcp, MAX_IMAGE_BYTES, MAX_PDF_BYTES, MAX_TEXT_CHARS } from "./attachment-content";

const notFoundErr = () => Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

function att(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tripId: "trip-1",
    globeId: null,
    mime: "image/png",
    size: 1000,
    storageKey: "k",
    title: "Castle tickets",
    filename: "c.png",
    targetType: "ITEM",
    targetId: "i1",
    ...overrides,
  };
}

function textOf(out: { type: string; text?: string }[]): string {
  return out.map((c) => c.text ?? "").join("\n");
}

describe("loadAttachmentContentForMcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
    stopFindMany.mockResolvedValue([]);
    itemFindMany.mockResolvedValue([{ id: "i1", title: "Castle", stopId: null, date: null, forkId: null }]);
    storageRead.mockResolvedValue(Buffer.from("png-bytes"));
    getDocumentProxy.mockResolvedValue({ pdf: true });
    extractText.mockResolvedValue({ totalPages: 2, text: "Train 4521 departs 09:14" });
  });

  it("an image under 3 MB returns image content with a text caption", async () => {
    attachmentFindUnique.mockResolvedValue(att());
    const out = await loadAttachmentContentForMcp("att-1");
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ type: "text", text: expect.stringContaining("Castle tickets") });
    expect(out[1]).toEqual({ type: "image", data: Buffer.from("png-bytes").toString("base64"), mimeType: "image/png" });
    expect(storageRead).toHaveBeenCalledWith("k");
  });

  it("the header shows a readable size, not 0 MB", async () => {
    attachmentFindUnique.mockResolvedValue(att({ size: 200 * 1024 }));
    const out = await loadAttachmentContentForMcp("att-1");
    expect(out[0]).toEqual({ type: "text", text: "Castle tickets (c.png, image/png, 200 KB)" });
  });

  it("a 3.4 MB image's refusal shows 3.4 MB", async () => {
    attachmentFindUnique.mockResolvedValue(att({ size: Math.round(3.4 * 1024 * 1024) }));
    const out = await loadAttachmentContentForMcp("att-1");
    expect(textOf(out)).toContain("3.4 MB");
  });

  it("an image whose stored bytes are over 3 MB is refused even if its recorded size is small", async () => {
    attachmentFindUnique.mockResolvedValue(att({ size: 1000 }));
    storageRead.mockResolvedValue(Buffer.alloc(MAX_IMAGE_BYTES + 1));
    const out = await loadAttachmentContentForMcp("att-1");
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("text");
    expect(textOf(out)).toMatch(/too large.*3 MB/);
  });

  it("a malformed or password-protected PDF says it couldn't be read, without throwing", async () => {
    attachmentFindUnique.mockResolvedValue(att({ mime: "application/pdf" }));
    getDocumentProxy.mockRejectedValue(new Error("PasswordException"));
    const out = await loadAttachmentContentForMcp("att-1");
    expect(out).toHaveLength(1);
    expect(textOf(out)).toMatch(/This PDF couldn't be read here\. Open it in the app\.$/);

  });

  it("a PDF whose text extraction fails says it couldn't be read", async () => {
    attachmentFindUnique.mockResolvedValue(att({ mime: "application/pdf" }));
    extractText.mockRejectedValue(new Error("bad xref"));
    const out = await loadAttachmentContentForMcp("att-1");
    expect(textOf(out)).toMatch(/This PDF couldn't be read here/);
  });

  it("falls back to the filename when the file has no title", async () => {
    attachmentFindUnique.mockResolvedValue(att({ title: null }));
    const out = await loadAttachmentContentForMcp("att-1");
    expect(out[0]).toEqual({ type: "text", text: expect.stringMatching(/^c\.png/) });
  });

  it("an image over 3 MB is refused with a clear message", async () => {
    attachmentFindUnique.mockResolvedValue(att({ size: MAX_IMAGE_BYTES + 1 }));
    const out = await loadAttachmentContentForMcp("att-1");
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("text");
    expect(textOf(out)).toMatch(/too large.*3 MB/);
    expect(storageRead).not.toHaveBeenCalled();
  });

  it("a PDF returns its extracted text under a heading", async () => {
    attachmentFindUnique.mockResolvedValue(att({ mime: "application/pdf", filename: "train.pdf", title: "Train ticket" }));
    storageRead.mockResolvedValue(Buffer.from("%PDF-fake"));
    const out = await loadAttachmentContentForMcp("att-1");
    expect(out).toHaveLength(1);
    const text = textOf(out);
    expect(text).toMatch(/^Train ticket \(train\.pdf, application\/pdf, .*\) · 2 pages\n\nTrain 4521 departs 09:14$/);
    expect(getDocumentProxy).toHaveBeenCalledWith(new Uint8Array(Buffer.from("%PDF-fake")));
    expect(extractText).toHaveBeenCalledWith({ pdf: true }, { mergePages: true });
  });

  it("says 1 page, not 1 pages", async () => {
    attachmentFindUnique.mockResolvedValue(att({ mime: "application/pdf" }));
    extractText.mockResolvedValue({ totalPages: 1, text: "x" });
    const out = await loadAttachmentContentForMcp("att-1");
    expect(textOf(out)).toContain("· 1 page\n");
  });

  it("a PDF with no text layer says it is a scan with no readable text", async () => {
    attachmentFindUnique.mockResolvedValue(att({ mime: "application/pdf" }));
    extractText.mockResolvedValue({ totalPages: 1, text: "   " });
    const out = await loadAttachmentContentForMcp("att-1");
    expect(textOf(out)).toMatch(/scan with no readable text/);
  });

  it("long PDF text is truncated with a note", async () => {
    attachmentFindUnique.mockResolvedValue(att({ mime: "application/pdf" }));
    extractText.mockResolvedValue({ totalPages: 30, text: "a".repeat(MAX_TEXT_CHARS + 10) });
    const out = await loadAttachmentContentForMcp("att-1");
    const text = textOf(out);
    expect(text).toMatch(/Truncated/);
    expect(text).toContain("60,000");
    expect(text.match(/a+/g)!.some((run) => run.length === MAX_TEXT_CHARS)).toBe(true);
    expect(text).not.toContain("a".repeat(MAX_TEXT_CHARS + 1));
  });

  it("a PDF over 10 MB is refused", async () => {
    attachmentFindUnique.mockResolvedValue(att({ mime: "application/pdf", size: MAX_PDF_BYTES + 1 }));
    const out = await loadAttachmentContentForMcp("att-1");
    expect(textOf(out)).toMatch(/too large.*10 MB/);
    expect(storageRead).not.toHaveBeenCalled();
    expect(extractText).not.toHaveBeenCalled();
  });

  it("another type returns metadata and says it can't be read here", async () => {
    attachmentFindUnique.mockResolvedValue(att({ mime: "text/csv", filename: "costs.csv", title: null }));
    const out = await loadAttachmentContentForMcp("att-1");
    const text = textOf(out);
    expect(text).toContain("costs.csv");
    expect(text).toContain("text/csv");
    expect(text).toMatch(/can't be read here/);
    expect(storageRead).not.toHaveBeenCalled();
  });

  it("missing bytes in storage returns a clear message, not a throw", async () => {
    attachmentFindUnique.mockResolvedValue(att());
    storageRead.mockResolvedValue(null);
    const out = await loadAttachmentContentForMcp("att-1");
    expect(out).toHaveLength(1);
    expect(textOf(out)).toMatch(/couldn't be found in storage/);
  });

  it("a row with no storage key reads like missing bytes", async () => {
    attachmentFindUnique.mockResolvedValue(att({ storageKey: null }));
    const out = await loadAttachmentContentForMcp("att-1");
    expect(textOf(out)).toMatch(/couldn't be found in storage/);
    expect(storageRead).not.toHaveBeenCalled();
  });

  it("a missing attachment reads as not found", async () => {
    attachmentFindUnique.mockResolvedValue(null);
    await expect(loadAttachmentContentForMcp("nope")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(storageRead).not.toHaveBeenCalled();
  });

  it("a Globe-owned attachment reads as not found", async () => {
    attachmentFindUnique.mockResolvedValue(att({ tripId: null, globeId: "g1", targetType: "MARKER" }));
    await expect(loadAttachmentContentForMcp("att-1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(requireTripAccess).not.toHaveBeenCalled();
    expect(storageRead).not.toHaveBeenCalled();
  });

  it("a fork-owned attachment reads as not found", async () => {
    attachmentFindUnique.mockResolvedValue(att());
    itemFindMany.mockResolvedValue([{ id: "i1", title: "Castle", stopId: null, date: null, forkId: "fork-1" }]);
    await expect(loadAttachmentContentForMcp("att-1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(storageRead).not.toHaveBeenCalled();
  });

  it("a file whose owner was deleted is still readable", async () => {
    attachmentFindUnique.mockResolvedValue(att());
    itemFindMany.mockResolvedValue([]);
    const out = await loadAttachmentContentForMcp("att-1");
    expect(out[1]).toMatchObject({ type: "image" });
  });

  it("a Journal photo (no plan owner kind) is read without an owner lookup", async () => {
    attachmentFindUnique.mockResolvedValue(att({ targetType: "JOURNAL", targetId: "j1" }));
    const out = await loadAttachmentContentForMcp("att-1");
    expect(out[1]).toMatchObject({ type: "image" });
    expect(itemFindMany).not.toHaveBeenCalled();
    expect(stopFindMany).not.toHaveBeenCalled();
  });

  it("checks trip access before reading bytes", async () => {
    attachmentFindUnique.mockResolvedValue(att());
    requireTripAccess.mockRejectedValue(notFoundErr());
    await expect(loadAttachmentContentForMcp("att-1")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(requireTripAccess).toHaveBeenCalledWith("trip-1");
    expect(storageRead).not.toHaveBeenCalled();
  });
});
