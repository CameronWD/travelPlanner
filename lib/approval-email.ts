import { escapeHtml } from "@/lib/sign-in-email";

/**
 * The approval email (spec 2026-10-02 §B; CONTEXT.md "Access request"):
 * sent once, by lib/mail.ts, after an Admin approves. Same table-free,
 * image-free shape as the Sign-in email. The button goes to the Landing —
 * never a minted link: the Sign-in link is Auth.js's to mint, and the
 * Google path is the common one anyway.
 */
export function renderApprovalEmail({ email, signInUrl }: { email: string; signInUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "You're in: sign in to Teepee";
  const line = `Your request to use Teepee was approved. Sign in with Google, or ask for a sign-in link, using this address: ${email}`;
  const footer = "If you didn't ask for access to Teepee, you can ignore this email.";
  const href = escapeHtml(signInUrl);
  const text = [line, "", signInUrl, "", footer].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#FFFBF3;color:#211F1B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;">
      <p style="margin:0 0 16px;font-size:22px;font-weight:800;">Teepee</p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.5;">${escapeHtml(line)}</p>
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
