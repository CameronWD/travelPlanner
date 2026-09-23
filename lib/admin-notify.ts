import { db } from "@/lib/db";
import { buildDigestPayload, sendPush, type SendPushResult } from "@/lib/push";

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
 *
 * Fix round 1, item 3: this is awaited directly from the signIn callback
 * (lib/auth.ts, lib/access-requests.ts) rather than deferred with
 * `next/server`'s `after()`. `after()` needs Next's request-scoped
 * AsyncLocalStorage context to still be live when it's called, and Auth.js
 * v5's own issue tracker has open reports of exactly that context going
 * missing partway through callback processing (e.g. nextauthjs/next-auth#11076,
 * vercel/next.js#69516 — "X was called outside a request scope" from inside
 * an Auth.js callback). Betting the sign-in path on that holding here,
 * unverifiable in this sandbox (no live server, no browser), was judged
 * riskier than the alternative below. Instead: every push is sent
 * concurrently (not one-by-one) and individually bounded by PUSH_TIMEOUT_MS,
 * so a stalled push endpoint can cost at most one timeout window, never a
 * hang until Vercel kills the function.
 */
const PUSH_TIMEOUT_MS = 2500;

type PushOutcome = SendPushResult | { sent: false; timedOut: true };

function withTimeout(
  promise: Promise<SendPushResult>,
  ms: number,
): Promise<PushOutcome> {
  return new Promise((resolve) => {
    // Both arms below log (carry-forward, Task 16): a previous fix round
    // replaced the rejection arm's console.error with a silent discard, and
    // this timeout arm never logged at all. That was tolerable when the
    // only caller was an invite notification — a missed push just meant a
    // slower-than-usual admit. Now notifyAdmins is the error sink's own
    // delivery path (lib/error-sink.ts), so a push that rejects or silently
    // times out here means an error was recorded and NOBODY was ever told —
    // the single hardest failure mode to notice in the whole system.
    const timer = setTimeout(() => {
      console.warn(`[admin-notify] sendPush timed out after ${ms}ms`);
      resolve({ sent: false, timedOut: true });
    }, ms);
    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        console.error("[admin-notify] sendPush failed:", err);
        resolve({ sent: false });
      },
    );
  });
}

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

    // Stored User.email arrives straight from the OAuth provider and is
    // never normalised anywhere in this repo (see lib/access-requests.ts).
    // `IN` is case-sensitive in Postgres, so matching the lowercased
    // ADMIN_EMAILS needle against raw email with `in` silently drops every
    // admin whose stored email isn't already all-lowercase — no error, no
    // log, just zero notifications ever sent. Match case-insensitively on
    // both sides instead, the same way lib/admin.ts's isAdminEmail does.
    const admins = await db.user.findMany({
      where: {
        OR: emails.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })),
      },
      select: { id: true },
    });
    if (admins.length === 0) {
      // I4 (fix round 1): a caller — increasingly the error sink itself —
      // can be recording rows while ADMIN_EMAILS doesn't resolve to a
      // single real User (typo, wrong casing beyond what the insensitive
      // match above covers, nobody's signed in yet). Without this, nobody
      // is ever told, with no log line at all — the exact failure mode the
      // carry-forward logging existed to remove, one layer up.
      console.warn(
        `[admin-notify] ADMIN_EMAILS is set but matched no User row — nobody will be notified`,
      );
      return;
    }

    const subscriptions = await db.pushSubscription.findMany({
      where: { userId: { in: admins.map((a) => a.id) } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subscriptions.length === 0) {
      // I4: same reasoning — a real admin with zero registered Devices is a
      // silent dead end otherwise.
      console.warn(`[admin-notify] no admin has a registered push Device — nobody will be notified`);
      return;
    }

    const payload = buildDigestPayload({ title, body, url });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => ({
        id: sub.id,
        outcome: await withTimeout(
          // { report: false } (C1, fix round 1): without it, a sendPush
          // failure HERE — notifyAdmins's own delivery path — would call
          // reportError, which (on a new signature) calls notifyAdmins
          // again, which calls sendPush again. Push errors embed resolved
          // addresses/hostnames that vary per attempt, so the dedup
          // signature this would otherwise rely on to self-limit does not
          // stay stable — see lib/push.ts's SendPushOptions doc.
          sendPush(
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            payload,
            { report: false },
          ),
          PUSH_TIMEOUT_MS,
        ),
      })),
    );

    // Prune subscriptions sendPush reports as permanently gone (404/410),
    // same as lib/digest-dispatch.ts — otherwise a stale admin Device is
    // retried, and separately timed out, on every future notification.
    const goneIds = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<{ id: string; outcome: PushOutcome }>).value)
      .filter((v) => "gone" in v.outcome && v.outcome.gone)
      .map((v) => v.id);

    if (goneIds.length > 0) {
      await db.pushSubscription.deleteMany({ where: { id: { in: goneIds } } });
    }
  } catch (err) {
    console.error("[admin-notify] notifyAdmins failed:", err);
  }
}
