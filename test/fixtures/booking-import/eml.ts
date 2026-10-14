/** A small RFC 822 message with base64 parts (fictional sender), for .eml tests. */
export function buildEml(opts: { subject?: string; text?: string; html?: string; pdf?: Uint8Array; inlineImage?: boolean }): Uint8Array {
  const boundary = "teepee-test-boundary";
  const b64 = (v: string | Uint8Array) => Buffer.from(v).toString("base64").replace(/.{76}/g, "$&\r\n");
  const lines = [
    "From: Skylark Air <bookings@skylark.example>",
    "To: traveller@example.test",
    `Subject: ${opts.subject ?? "Your booking QX7P2M"}`,
    "Date: Thu, 01 Oct 2026 09:00:00 +0000",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
  ];
  if (opts.text) lines.push(`--${boundary}`, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", b64(opts.text));
  if (opts.html) lines.push(`--${boundary}`, "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", b64(opts.html));
  if (opts.pdf) {
    lines.push(`--${boundary}`, 'Content-Type: application/pdf; name="ticket.pdf"', 'Content-Disposition: attachment; filename="ticket.pdf"', "Content-Transfer-Encoding: base64", "", b64(opts.pdf));
  }
  if (opts.inlineImage) {
    lines.push(`--${boundary}`, "Content-Type: image/png", "Content-Disposition: inline", "Content-ID: <logo@skylark>", "Content-Transfer-Encoding: base64", "", b64(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])));
  }
  lines.push(`--${boundary}--`, "");
  return new TextEncoder().encode(lines.join("\r\n"));
}
