import { describe, expect, it } from "vitest";
import { MAX_BOOKING_TEXT_CHARS } from "@/lib/ai-limits";
import { buildEml } from "@/test/fixtures/booking-import/eml";
import { tinyPdf } from "@/test/fixtures/booking-import/tiny-pdf";
import { BOOKING_IMPORT_MESSAGES as M } from "./messages";
import { pdfPageCount, prepareBookingInput } from "./input";

const file = (bytes: BlobPart, name: string, type: string) => new File([bytes], name, { type });

describe("prepareBookingInput: pasted text", () => {
  it("sends trimmed text as one text part", async () => {
    expect(await prepareBookingInput({ file: null, text: "  Flight SK101  " })).toEqual({
      ok: true,
      source: "text",
      parts: [{ type: "text", text: "Flight SK101" }],
    });
  });

  it("refuses empty and over-long text before any API call", async () => {
    expect(await prepareBookingInput({ file: null, text: "   " })).toEqual({ ok: false, reason: "invalid_file", message: M.emptyText });
    const long = await prepareBookingInput({ file: null, text: "x".repeat(MAX_BOOKING_TEXT_CHARS + 1) });
    expect(long).toMatchObject({ ok: false, reason: "invalid_file" });
    if (!long.ok) expect(long.message).toContain("too long");
  });
});

describe("prepareBookingInput: files", () => {
  it("sends a PDF as one base64 pdf part", async () => {
    const bytes = tinyPdf("Train 4521 departs 09:14");
    const result = await prepareBookingInput({ file: file(new Uint8Array(bytes), "ticket.pdf", "application/pdf"), text: null });
    expect(result).toMatchObject({ ok: true, source: "pdf" });
    if (result.ok && result.parts[0].type === "pdf") {
      expect(Buffer.from(result.parts[0].base64, "base64").equals(Buffer.from(bytes))).toBe(true);
    }
  });

  it("refuses a PDF over 30 pages", async () => {
    const result = await prepareBookingInput({ file: file(new Uint8Array(tinyPdf("Page", 31)), "big.pdf", "application/pdf"), text: null });
    expect(result).toEqual({ ok: false, reason: "invalid_file", message: M.tooManyPages });
  });

  it("calls a corrupt or empty PDF unreadable", async () => {
    expect(await prepareBookingInput({ file: file("%PDF-1.4 not really", "x.pdf", "application/pdf"), text: null })).toEqual({
      ok: false,
      reason: "unreadable",
      message: M.unreadable,
    });
    expect(await prepareBookingInput({ file: file(new Uint8Array(), "x.pdf", "application/pdf"), text: null })).toMatchObject({
      reason: "unreadable",
    });
  });

  it("sends an image as an image part with its media type", async () => {
    const result = await prepareBookingInput({ file: file(new Uint8Array([1, 2, 3]), "shot.png", "image/png"), text: null });
    expect(result).toEqual({ ok: true, source: "image", parts: [{ type: "image", mediaType: "image/png", base64: "AQID" }] });
  });

  it("refuses HEIC and .msg with their hints, before reading the bytes", async () => {
    expect(await prepareBookingInput({ file: file("x", "IMG.HEIC", "image/heic"), text: null })).toEqual({ ok: false, reason: "invalid_file", message: M.heic });
    expect(await prepareBookingInput({ file: file("x", "mail.msg", ""), text: null })).toEqual({ ok: false, reason: "invalid_file", message: M.msg });
  });

  it("counts PDF pages, and says null for a broken PDF", async () => {
    expect(await pdfPageCount(tinyPdf("a", 3))).toBe(3);
    expect(await pdfPageCount(new TextEncoder().encode("garbage"))).toBeNull();
  });
});

describe("prepareBookingInput: .eml", () => {
  it("reads an HTML-only, base64-encoded body as plain text (Review Focus 5)", async () => {
    const eml = buildEml({ html: "<html><body><p>Booking reference <b>QX7P2M</b></p><table><tr><td>Depart</td><td>10:00</td></tr></table></body></html>" });
    const result = await prepareBookingInput({ file: file(new Uint8Array(eml), "Your booking.eml", "message/rfc822"), text: null });
    expect(result).toMatchObject({ ok: true, source: "eml" });
    if (!result.ok) return;
    const text = result.parts.find((p) => p.type === "text");
    expect(text?.type === "text" && text.text).toContain("Booking reference QX7P2M");
    expect(text?.type === "text" && text.text).toContain("Subject: Your booking QX7P2M");
    expect(text?.type === "text" && text.text).not.toMatch(/<[a-z]/i);
  });

  it("sends an attached PDF before the body and never an inline logo", async () => {
    const pdf = tinyPdf("SK101 BNE LIS");
    const eml = buildEml({ text: "See the attached ticket.", pdf, inlineImage: true });
    const result = await prepareBookingInput({ file: file(new Uint8Array(eml), "ticket.eml", ""), text: null });
    expect(result.ok && result.parts.map((p) => p.type)).toEqual(["pdf", "text"]);
    if (result.ok && result.parts[0].type === "pdf") {
      expect(Buffer.from(result.parts[0].base64, "base64").equals(Buffer.from(pdf))).toBe(true);
    }
  });

  it("refuses an email whose attached PDF is over 30 pages", async () => {
    const eml = buildEml({ text: "Ticket attached.", pdf: tinyPdf("p", 31) });
    expect(await prepareBookingInput({ file: file(new Uint8Array(eml), "x.eml", ""), text: null })).toEqual({ ok: false, reason: "invalid_file", message: M.tooManyPages });
  });
});
