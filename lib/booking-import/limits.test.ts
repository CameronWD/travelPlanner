import { describe, expect, it } from "vitest";
import { MAX_BYTES } from "@/lib/storage";
import { BOOKING_IMPORT_MESSAGES as M } from "./messages";
import { checkBookingFile, MAX_IMPORT_BYTES } from "./limits";

const f = (name: string, type: string, size = 1_000) => ({ name, type, size });

// A file accepted for import must still be attachable when the Proposal is
// confirmed, so our ceiling can never exceed validateUpload's (lib/storage.ts).
it("MAX_IMPORT_BYTES does not exceed storage's own upload ceiling", () => {
  expect(MAX_IMPORT_BYTES).toBeLessThanOrEqual(MAX_BYTES);
});

describe("checkBookingFile", () => {
  it("accepts PDFs, the four image types and .eml, by extension or MIME type", () => {
    expect(checkBookingFile(f("ticket.PDF", ""))).toEqual({ ok: true, kind: "pdf" });
    expect(checkBookingFile(f("scan", "application/pdf"))).toEqual({ ok: true, kind: "pdf" });
    expect(checkBookingFile(f("shot.png", "image/png"))).toEqual({ ok: true, kind: "image", mediaType: "image/png" });
    expect(checkBookingFile(f("photo.jpeg", ""))).toEqual({ ok: true, kind: "image", mediaType: "image/jpeg" });
    expect(checkBookingFile(f("photo.webp", "image/webp"))).toEqual({ ok: true, kind: "image", mediaType: "image/webp" });
    expect(checkBookingFile(f("a.gif", "image/gif"))).toEqual({ ok: true, kind: "image", mediaType: "image/gif" });
    expect(checkBookingFile(f("Your booking.eml", ""))).toEqual({ ok: true, kind: "eml" });
    expect(checkBookingFile(f("forwarded", "message/rfc822"))).toEqual({ ok: true, kind: "eml" });
  });

  it("refuses HEIC and .msg with their hints", () => {
    expect(checkBookingFile(f("IMG_0001.HEIC", "image/heic"))).toEqual({ ok: false, message: M.heic });
    expect(checkBookingFile(f("x.heif", ""))).toEqual({ ok: false, message: M.heic });
    expect(checkBookingFile(f("booking.msg", "application/vnd.ms-outlook"))).toEqual({ ok: false, message: M.msg });
  });

  it("refuses other types and anything over 10 MB", () => {
    expect(checkBookingFile(f("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).toEqual({ ok: false, message: M.wrongType });
    expect(checkBookingFile(f("big.pdf", "application/pdf", MAX_IMPORT_BYTES + 1))).toEqual({ ok: false, message: M.tooBig });
    expect(checkBookingFile(f("ok.pdf", "application/pdf", MAX_IMPORT_BYTES))).toEqual({ ok: true, kind: "pdf" });
  });
});
