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
import { db } from "@/lib/db";
import { sendPush, buildNotificationPayload } from "@/lib/push";

// Force Node.js runtime — required for Prisma + web-push (not edge-compatible)
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;

  // Fail-closed: if CRON_SECRET is not set, reject all requests
  if (!secret) return false;

  // Check Authorization header
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  // Check query param. NOTE: a secret in the URL can land in access logs, so
  // this branch is only safe over HTTPS (Vercel enforces this; for other hosts
  // prefer the Authorization header).
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let processed = 0;
  let sent = 0;
  let skipped = 0;

  try {
    // Find all due, unsent reminders
    const dueReminders = await db.reminder.findMany({
      where: {
        fireAt: { lte: now },
        sent: false,
      },
      select: {
        id: true,
        tripId: true,
        title: true,
        trip: {
          select: {
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    for (const reminder of dueReminders) {
      processed++;

      // Build the notification payload
      const payload = buildNotificationPayload({
        title: reminder.title,
        body: "Trip reminder",
        url: `/trips/${reminder.tripId}/today`,
      });

      // Collect all member userIds
      const memberUserIds = reminder.trip.members.map((m) => m.userId);

      if (memberUserIds.length > 0) {
        // Fetch push subscriptions for all trip members
        const subscriptions = await db.pushSubscription.findMany({
          where: { userId: { in: memberUserIds } },
          select: { id: true, endpoint: true, p256dh: true, auth: true },
        });

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
      }

      // Mark reminder as sent regardless of push result
      // (prevents repeated firing even if push is not configured)
      await db.reminder.update({
        where: { id: reminder.id },
        data: { sent: true },
      });
    }

    return NextResponse.json({ processed, sent, skipped });
  } catch (err) {
    console.error("[cron/reminders] Error:", err);
    return NextResponse.json(
      { error: "Internal server error", processed, sent, skipped },
      { status: 500 },
    );
  }
}
