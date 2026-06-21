/**
 * lib/push.ts — env-gated web-push helpers.
 *
 * All push functionality is gated on three VAPID env vars. When they are
 * absent the module is fully import-safe and every function no-ops cleanly
 * (no throws, no console spam beyond a single info log at import time).
 *
 * VAPID keys can be generated with: npx web-push generate-vapid-keys
 */

// ---------------------------------------------------------------------------
// Env gate
// ---------------------------------------------------------------------------

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "";

/**
 * Returns true only when all three required VAPID env vars are present.
 */
export function isPushConfigured(): boolean {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
}

if (!isPushConfigured()) {
  // Single info log — won't spam on every call.
  // Only log server-side (no `window`) so it doesn't appear in client bundles.
  if (typeof window === "undefined") {
    console.info(
      "[push] VAPID env vars not set — web push disabled. " +
        "Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT to enable.",
    );
  }
}

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

export interface NotificationPayloadOptions {
  title: string;
  body: string;
  url: string;
}

/**
 * Pure JSON string builder for push notification payloads.
 * Used by the cron route to construct what is sent to `sendPush`.
 */
export function buildNotificationPayload(
  opts: NotificationPayloadOptions,
): string {
  return JSON.stringify({ title: opts.title, body: opts.body, url: opts.url });
}

// ---------------------------------------------------------------------------
// Push sender
// ---------------------------------------------------------------------------

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type SendPushResult =
  | { sent: true }
  | { sent: false; skipped?: true; gone?: true };

/**
 * Send a push notification to a single subscription.
 *
 * - If VAPID is not configured → returns `{ sent: false, skipped: true }` (no throw).
 * - If the subscription is stale (404/410) → returns `{ sent: false, gone: true }`.
 * - Any other error → returns `{ sent: false }` (logged, not re-thrown).
 *
 * The `web-push` import is lazy so this module is safe to import in any
 * environment, including edge runtimes that don't have VAPID keys.
 */
export async function sendPush(
  subscription: PushSubscriptionData,
  payload: string,
): Promise<SendPushResult> {
  if (!isPushConfigured()) {
    return { sent: false, skipped: true };
  }

  try {
    // Lazy import keeps this module import-safe without VAPID keys.
    const webpush = await import("web-push");

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      payload,
    );

    return { sent: true };
  } catch (err: unknown) {
    // 404/410 → subscription is gone; caller can prune it
    const status =
      err && typeof err === "object" && "statusCode" in err
        ? (err as { statusCode: number }).statusCode
        : null;

    if (status === 404 || status === 410) {
      return { sent: false, gone: true };
    }

    console.error("[push] sendNotification failed:", err);
    return { sent: false };
  }
}
