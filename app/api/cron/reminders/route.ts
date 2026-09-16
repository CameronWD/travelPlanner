/**
 * GET /api/cron/reminders
 *
 * Processes due reminders and dispatches web-push notifications to trip members.
 *
 * ---
 * SCHEDULING
 * Wire this endpoint to a scheduler that calls it periodically (e.g. every minute):
 *
 *   Vercel Cron (vercel.json):
 *     { "crons": [{ "path": "/api/cron/reminders?secret=<CRON_SECRET>", "schedule": "* * * * *" }] }
 *
 *   GitHub Actions (cron job):
 *     curl -s "https://your-app.com/api/cron/reminders" \
 *       -H "Authorization: Bearer $CRON_SECRET"
 *
 * ---
 * AUTHENTICATION
 * Requires either:
 *   - Query param:  ?secret=<CRON_SECRET>
 *   - Header:       Authorization: Bearer <CRON_SECRET>
 *
 * If CRON_SECRET is not set, the endpoint returns 401 (fail-closed).
 * ---
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { sendPush, buildNotificationPayload, isPushConfigured } from "@/lib/push";
import { daysBetween } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { buildCostLabelMap, costLabel } from "@/lib/cost-labels";

// Force Node.js runtime — required for Prisma + web-push (not edge-compatible)
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

/** Constant-time string comparison (length-mismatch returns false early). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;

  // Fail-closed: if CRON_SECRET is not set, reject all requests
  if (!secret) return false;

  // Check Authorization header (constant-time to avoid leaking the secret
  // byte-by-byte via response timing).
  const authHeader = req.headers.get("authorization");
  if (authHeader && safeEqual(authHeader, `Bearer ${secret}`)) return true;

  // Check query param. NOTE: a secret in the URL can land in access logs, so
  // this branch is only safe over HTTPS (Vercel enforces this; for other hosts
  // prefer the Authorization header).
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret");
  if (querySecret && safeEqual(querySecret, secret)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Push-to-trip-members helper (shared by the Reminder pass and the due-date
// payment-alert pass below).
// ---------------------------------------------------------------------------

/**
 * Sends `payload` to every push subscription belonging to a trip's members,
 * pruning subscriptions the push service reports as gone (404/410).
 */
async function pushToTripMembers(
  tripId: string,
  payload: string,
): Promise<{ sent: number; skipped: number }> {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { members: { select: { userId: true } } },
  });
  const memberUserIds = trip?.members.map((m) => m.userId) ?? [];
  if (memberUserIds.length === 0) return { sent: 0, skipped: 0 };

  // Fetch push subscriptions for all trip members
  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: { in: memberUserIds } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  let sent = 0;
  let skipped = 0;
  const goneIds: string[] = [];

  for (const sub of subscriptions) {
    const result = await sendPush(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      payload,
    );

    if (result.sent) {
      sent++;
    } else if ("skipped" in result && result.skipped) {
      skipped++;
    } else if ("gone" in result && result.gone) {
      // Subscription is stale — collect for cleanup
      goneIds.push(sub.id);
    }
  }

  // Prune stale subscriptions
  if (goneIds.length > 0) {
    await db.pushSubscription.deleteMany({
      where: { id: { in: goneIds } },
    });
  }

  return { sent, skipped };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Missing VAPID config is a hard stop BEFORE any DB query. "Push failed"
  // and "push isn't configured" are different states: the first is a delivery
  // outcome worth consuming a reminder for (see the mark-sent-regardless
  // comment below), the second is a misconfiguration where consuming
  // reminders would be silent data loss — sendPush() would skip every send
  // while the loop marked them sent. Bailing here also avoids waking Neon
  // for work that cannot be delivered. 503 (not 500) so the scheduler can
  // fail loudly on this specific state.
  if (!isPushConfigured()) {
    return NextResponse.json(
      {
        error:
          "Push is not configured: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be set. No reminders were read or consumed.",
      },
      { status: 503 },
    );
  }

  const now = new Date();
  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let dueAlerts = 0;

  try {
    // Find all due, unsent reminders
    const dueReminders = await db.reminder.findMany({
      where: {
        fireAt: { lte: now },
        sent: false,
      },
      // Bounded batch: after an outage the backlog drains across successive
      // */5 runs instead of one request that can outlive a serverless timeout.
      orderBy: { fireAt: "asc" },
      take: 200,
      select: {
        id: true,
        tripId: true,
        title: true,
      },
    });

    for (const reminder of dueReminders) {
      processed++;

      // Build the notification payload
      const payload = buildNotificationPayload({
        title: reminder.title,
        body: "Trip reminder",
        url: `/trips/${reminder.tripId}`,
      });

      const result = await pushToTripMembers(reminder.tripId, payload);
      sent += result.sent;
      skipped += result.skipped;

      // Mark reminder as sent regardless of push result
      // (prevents repeated firing even if push is not configured)
      await db.reminder.update({
        where: { id: reminder.id },
        data: { sent: true },
      });
    }

    // ── Second pass: due-date payment alerts (CONTEXT.md "Due date") ───────
    // Unpaid, non-forked costs with a due date get a push at 3 days out and
    // on the day the money leaves the account. Idempotency is a marker
    // Reminder row keyed by (targetType, targetId, fireAt) — one per cost per
    // calendar day, so re-running the cron (or hitting both offsets on
    // different days) never double-sends for the same day.
    const ALERT_OFFSETS_DAYS = [3, 0] as const;
    const todayUTC = now.toISOString().slice(0, 10);

    const dueCosts = await db.cost.findMany({
      where: { dueDate: { not: null }, paidAt: null, forkId: null },
      select: {
        id: true,
        tripId: true,
        dueDate: true,
        costMinor: true,
        currency: true,
        label: true,
        ownerType: true,
        ownerId: true,
      },
    });

    // Batch owner-name resolution: one set of lookups per trip, not per cost.
    const costsByTrip = new Map<string, typeof dueCosts>();
    for (const cost of dueCosts) {
      const list = costsByTrip.get(cost.tripId);
      if (list) list.push(cost);
      else costsByTrip.set(cost.tripId, [cost]);
    }

    const labelByCostId = new Map<string, string>();
    for (const [tripId, costsForTrip] of costsByTrip) {
      const [items, accommodations, transports, stops] = await Promise.all([
        db.item.findMany({
          where: { tripId, forkId: null },
          select: { id: true, title: true },
        }),
        db.accommodation.findMany({
          where: { tripId, forkId: null },
          select: { id: true, name: true },
        }),
        db.transport.findMany({
          where: { tripId, forkId: null },
          select: { id: true, mode: true, fromStopId: true, toStopId: true },
        }),
        db.stop.findMany({
          where: { tripId, forkId: null },
          select: { id: true, name: true },
        }),
      ]);

      // Transport has no free-text place of its own when it's linked to a
      // stop — depPlace/arrPlace and fromStopId/toStopId are mutually
      // exclusive (Task 12) — so resolve stop-linked transports via the
      // trip's stop names, mirroring the budget page's caller-side
      // resolution (app/(app)/trips/[tripId]/budget/page.tsx).
      const stopName = new Map(stops.map((s) => [s.id, s.name] as const));
      const ownerNames = buildCostLabelMap({
        items,
        accommodations,
        transports: transports.map((t) => ({
          id: t.id,
          mode: t.mode,
          depPlace: t.fromStopId ? (stopName.get(t.fromStopId) ?? null) : null,
          arrPlace: t.toStopId ? (stopName.get(t.toStopId) ?? null) : null,
        })),
      });

      for (const cost of costsForTrip) {
        labelByCostId.set(cost.id, costLabel(cost, ownerNames));
      }
    }

    for (const cost of dueCosts) {
      const daysUntil = daysBetween(todayUTC, cost.dueDate!);
      if (!ALERT_OFFSETS_DAYS.includes(daysUntil as 3 | 0)) continue;

      const alertInstant = new Date(`${todayUTC}T00:00:00.000Z`);
      const existing = await db.reminder.findFirst({
        where: {
          targetType: "COST_DUE",
          targetId: cost.id,
          fireAt: alertInstant,
        },
        select: { id: true },
      });
      if (existing) continue;

      const label = labelByCostId.get(cost.id) ?? "Cost";
      const money = formatMoney(cost.costMinor, cost.currency);
      const body =
        daysUntil === 0
          ? `${label} · ${money} comes out today`
          : `${label} · ${money} comes out in ${daysUntil} days`;

      const payload = buildNotificationPayload({
        title: "Payment coming up",
        body,
        url: `/trips/${cost.tripId}/budget`,
      });

      const result = await pushToTripMembers(cost.tripId, payload);
      sent += result.sent;
      skipped += result.skipped;

      await db.reminder.create({
        data: {
          tripId: cost.tripId,
          title: body,
          fireAt: alertInstant,
          sent: true,
          targetType: "COST_DUE",
          targetId: cost.id,
        },
      });

      dueAlerts++;
    }

    return NextResponse.json({ processed, sent, skipped, dueAlerts });
  } catch (err) {
    console.error("[cron/reminders] Error:", err);
    return NextResponse.json(
      { error: "Internal server error", processed, sent, skipped, dueAlerts },
      { status: 500 },
    );
  }
}
