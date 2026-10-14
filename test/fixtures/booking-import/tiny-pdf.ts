/** A minimal valid PDF with `pageCount` pages, each showing `text` (ASCII only) in Helvetica, with a correct xref table. */
export function tinyPdf(text: string, pageCount = 1): Uint8Array {
  const pageObjects: string[] = [];
  const kids: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    const pageNum = 4 + i * 2;
    const contentNum = pageNum + 1;
    const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
    kids.push(`${pageNum} 0 R`);
    pageObjects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNum} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageCount} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pageObjects,
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
