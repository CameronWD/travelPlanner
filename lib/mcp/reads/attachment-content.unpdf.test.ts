/**
 * Real-library smoke check (spec 2026-10-11 Task 4): proves `unpdf` loads and
 * extracts text under this repo's Node/Vitest setup — no mocks, no network,
 * no fixture file. The PDF is a one-page document built in memory.
 */
import { describe, expect, it } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { tinyPdf } from "@/test/fixtures/booking-import/tiny-pdf";

describe("unpdf (real library)", () => {
  it("extracts text from an in-memory PDF", async () => {
    const pdf = await getDocumentProxy(tinyPdf("Train 4521 departs 09:14"));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    expect(totalPages).toBe(1);
    expect(text).toContain("Train 4521 departs 09:14");
  });
});
