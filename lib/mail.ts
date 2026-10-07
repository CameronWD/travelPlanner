/**
 * The one place TEEPEE talks to Resend (spec 2026-10-02 §B). Two senders
 * use it: the Sign-in link (lib/auth.ts, which still throws to Auth.js on
 * a failure) and the approval email (server/actions/access-requests.ts,
 * which must never let mail undo an approval). Never throws; a failure is
 * a value. Configured only when both AUTH_RESEND_KEY and AUTH_RESEND_FROM
 * are set (docs/resendDeploy.md).
 */
import "server-only";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendMailResult = { sent: true } | { sent: false; error: string };

export function mailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.AUTH_RESEND_KEY && env.AUTH_RESEND_FROM);
}

export async function sendMail(
  message: MailMessage,
  env: Record<string, string | undefined> = process.env,
): Promise<SendMailResult> {
  const apiKey = env.AUTH_RESEND_KEY;
  const from = env.AUTH_RESEND_FROM;
  if (!apiKey || !from) {
    return { sent: false, error: "Mail is not configured (AUTH_RESEND_KEY / AUTH_RESEND_FROM)." };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: message.to, subject: message.subject, html: message.html, text: message.text }),
    });
    if (!res.ok) return { sent: false, error: `Resend error ${res.status}: ${await res.text()}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
