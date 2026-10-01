/**
 * The Sign-in link email (spec 2026-10-01 §B4; CONTEXT.md "Sign-in link").
 * Minimal and branded: one line, one button, the raw link for clients that
 * strip buttons, and the once/24-hours/ignore footer. Pure — the send
 * happens in lib/auth.ts's provider. Cam restyles this later; keep it
 * table-free and image-free so it reads everywhere.
 */
const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function renderSignInEmail({ url }: { url: string }): { subject: string; html: string; text: string } {
  const href = escapeHtml(url);
  const subject = "Sign in to Teepee";
  const footer = "This link works once and expires in 24 hours. If you didn't ask for it, you can ignore this email.";
  const text = [
    "Here's your sign-in link for Teepee.",
    "",
    url,
    "",
    footer,
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#FFFBF3;color:#211F1B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;">
      <p style="margin:0 0 16px;font-size:22px;font-weight:800;">Teepee</p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.5;">Here's your sign-in link for Teepee.</p>
      <p style="margin:0 0 24px;">
        <a href="${href}" style="display:inline-block;padding:14px 22px;border:2px solid #211F1B;border-radius:12px;background:#211F1B;color:#FFFBF3;font-size:16px;font-weight:700;text-decoration:none;">Sign in</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#5c5852;">If the button doesn't work, copy this link into your browser:</p>
      <p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${href}" style="color:#211F1B;">${href}</a></p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#5c5852;">${escapeHtml(footer)}</p>
    </div>
  </body>
</html>`;
  return { subject, html, text };
}
