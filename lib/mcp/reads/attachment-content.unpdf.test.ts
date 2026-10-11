/**
 * Real-library smoke check (spec 2026-10-11 Task 4): proves `unpdf` loads and
 * extracts text under this repo's Node/Vitest setup — no mocks, no network,
 * no fixture file. The PDF is a one-page document built in memory.
 */
import { describe, expect, it } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";

/** A minimal valid one-page PDF showing `text` in Helvetica, with a correct xref table. */
function tinyPdf(text: string): Uint8Array {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

describe("unpdf (real library)", () => {
  it("extracts text from an in-memory PDF", async () => {
    const pdf = await getDocumentProxy(tinyPdf("Train 4521 departs 09:14"));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    expect(totalPages).toBe(1);
    expect(text).toContain("Train 4521 departs 09:14");
  });
});
