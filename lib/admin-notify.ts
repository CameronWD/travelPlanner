import { db } from "@/lib/db";
import { buildDigestPayload, sendPush } from "@/lib/push";

/**
 * Notify the operator in-app. TEEPEE has no mail dependency of any kind
 * (ADRs 0047, 0050) — reuse web-push and the account-level Devices (ADR 0048).
 *
 * ACCEPTED TRADE-OFF (sitrep 2026-09-22): the operator learns of a request
 * when they next open TEEPEE, so someone may wait a day. At 10–15 Travellers
 * that beat standing up email infrastructure. The /admin badge is the source
 * of truth; this push is only the prompt, and it must be allowed to fail.
 *
 * Never throws. Admin resolution (ADMIN_EMAILS → User rows), Device lookup
 * (PushSubscription) and the send itself (sendPush, which already returns a
 * result rather than throwing) are all wrapped so a caller on the sign-in
 * path or an error-reporting path can call this and rely on it never being
 * the reason their own operation fails.
 */
export async function notifyAdmins(
  title: string,
  body: string,
  url: string,
): Promise<void> {
  try {
    const raw = process.env.ADMIN_EMAILS;
    if (!raw) return;

    const emails = raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);
    if (emails.length === 0) return;

    const admins = await db.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    if (admins.length === 0) return;

    const subscriptions = await db.pushSubscription.findMany({
      where: { userId: { in: admins.map((a) => a.id) } },
      select: { endpoint: true, p256dh: true, auth: true },
    });
    if (subscriptions.length === 0) return;

    const payload = buildDigestPayload({ title, body, url });

    for (const sub of subscriptions) {
      try {
        await sendPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
        );
      } catch (err) {
        // sendPush already swallows its own errors — this catch is
        // belt-and-braces against a future change to that contract.
        console.error("[admin-notify] sendPush failed:", err);
      }
    }
  } catch (err) {
    console.error("[admin-notify] notifyAdmins failed:", err);
  }
}
