import { describe, expect, it } from "vitest";
import { MAX_EML_ATTACHMENTS } from "./limits";
import { bookingConfirmationFiles } from "./confirmation-files";

const eml = (parts: string[]) =>
  [
    "From: a@b.c",
    "To: d@e.f",
    "Subject: Booking",
    'Content-Type: multipart/mixed; boundary="B"',
    "",
    "--B",
    "Content-Type: text/plain",
    "",
    "hello",
    ...parts,
    "--B--",
    "",
  ].join("\r\n");
const att = (name: string, type: string, body: string) =>
  ["--B", `Content-Type: ${type}; name="${name}"`, `Content-Disposition: attachment; filename="${name}"`, "Content-Transfer-Encoding: base64", "", Buffer.from(body).toString("base64")].join("\r\n");

describe("bookingConfirmationFiles", () => {
  it("returns a PDF as itself", async () => {
    const f = new File(["%PDF-1.4"], "t.pdf", { type: "application/pdf" });
    expect(await bookingConfirmationFiles(f)).toEqual([f]);
  });

  it("returns an image as itself", async () => {
    const f = new File(["x"], "t.png", { type: "image/png" });
    expect(await bookingConfirmationFiles(f)).toEqual([f]);
  });

  it("takes each PDF out of an email under its own name", async () => {
    const f = new File([eml([att("flight.pdf", "application/pdf", "%PDF-a"), att("hotel.pdf", "application/pdf", "%PDF-b"), att("logo.png", "image/png", "png")])], "m.eml", { type: "message/rfc822" });
    const out = await bookingConfirmationFiles(f);
    expect(out.map((o) => o.name)).toEqual(["flight.pdf", "hotel.pdf"]);
    expect(out.every((o) => o.type === "application/pdf")).toBe(true);
    expect(await out[0].text()).toBe("%PDF-a");
  });

  it("returns nothing for an email with no PDF", async () => {
    const f = new File([eml([att("logo.png", "image/png", "png")])], "m.eml", { type: "message/rfc822" });
    expect(await bookingConfirmationFiles(f)).toEqual([]);
  });

  it("returns nothing for other files", async () => {
    expect(await bookingConfirmationFiles(new File(["hi"], "n.txt", { type: "text/plain" }))).toEqual([]);
  });

  it("takes at most MAX_EML_ATTACHMENTS PDFs from an email", async () => {
    const many = Array.from({ length: MAX_EML_ATTACHMENTS + 2 }, (_, i) => att(`p${i}.pdf`, "application/pdf", `%PDF-${i}`));
    const f = new File([eml(many)], "m.eml", { type: "message/rfc822" });
    expect(await bookingConfirmationFiles(f)).toHaveLength(MAX_EML_ATTACHMENTS);
  });
});
