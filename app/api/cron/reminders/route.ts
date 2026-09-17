/**
 * GET /api/cron/reminders
 *
 * The Digest dispatcher (CONTEXT.md **Digest**, ADR 0047). Every run asks a
 * single question — which subscribers are at 07:00 or 20:00 *in their own
 * timezone right now* — and sends each of them at most one Digest per Trip.
 * Nothing here broadcasts to a Trip's membership: a Digest is per-person, and
 * `dispatchDigest` pushes to that person's own devices and prunes dead ones.
 *
 * ---
 * SCHEDULING
 * The workflow fires at four fixed UTC hours (.github/workflows/reminders-cron.yml,
 * `0 6,9,19,20 * * *`) and this route filters each run by the subscriber's
 * LOCAL hour, so the fixed schedule lands at the right wall-clock time in each
 * traveller's zone. Those four hours cover the two zones that matter today:
 *
 *     06:00Z → 07:00 CET (morning)    19:00Z → 20:00 CET (evening)
 *     09:00Z → 20:00 AEDT (evening)   20:00Z → 07:00 AEDT (morning, next day)
 *
 * A subscriber whose local hour is neither 7 nor 20 is simply passed over, so
 * adding a UTC hour for a new region costs nothing here. Because the local
 * date is read in the subscriber's zone too, the 20:00Z run correctly dates an
 * AEDT traveller's Digest to the *following* calendar day.
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
import { isPushConfigured } from "@/lib/push";
import { dispatchDigest } from "@/lib/digest-dispatch";
import type { DigestSlot } from "@/lib/digest";
import { instantToZonedDateISO, instantToZonedTime } from "@/lib/tz";

// Force Node.js runtime — required for Prisma + web-push (not edge-compatible)
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Slot hours
// ---------------------------------------------------------------------------

// The two local wall-clock hours a Digest is sent at. They are LOCAL hours, not
// UTC ones: the workflow's four UTC hours (06/09/19/20 — see SCHEDULING above)
// exist only so that every zone we care about has a run landing on one of these
// two. Changing either constant means revisiting that cron expression.
const MORNING_LOCAL_HOUR = 7;
const EVENING_LOCAL_HOUR = 20;

/** A backstop against one pathological account, not a real limit. */
const MAX_TRIPS_PER_USER = 50;

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
// Slot resolution
// ---------------------------------------------------------------------------

/** The Digest slot a zone is currently in, or null when it is in neither. */
function slotForZone(now: Date, timeZone: string): DigestSlot | null {
  // instantToZonedTime yields "HH:MM" and falls back to UTC on an unknown
  // zone, so a junk timezone string degrades to "wrong hour", never a throw.
  const localHour = Number(instantToZonedTime(now, timeZone).slice(0, 2));
  if (localHour === EVENING_LOCAL_HOUR) return "EVENING";
  if (localHour === MORNING_LOCAL_HOUR) return "MORNING";
  return null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Missing VAPID config is a hard stop BEFORE any DB query, and this bail is
  // what protects the whole run: dispatchDigest claims its ledger slot BEFORE
  // it sends, so dispatching while delivery cannot succeed would burn every
  // subscriber's slot for the day — silent, un-resendable data loss. Bailing
  // here also avoids waking Neon for work that cannot be delivered. 503 (not
  // 500) so the scheduler can fail loudly on this specific state.
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
  /** Distinct (user, zone) pairs examined this run. */
  let considered = 0;
  /** dispatchDigest calls made (a skipped dispatch still counts as one). */
  let dispatched = 0;
  /** Pushes actually delivered. */
  let sent = 0;
  /** Dispatches that produced no push — disabled, already sent, or empty. */
  let skipped = 0;

  try {
    // A subscription with no stored timezone cannot be scheduled: there is no
    // local hour to compare against, and guessing one would deliver the Digest
    // at the wrong time of day. Those rows are simply never dispatched to.
    const subscriptions = await db.pushSubscription.findMany({
      where: { timezone: { not: null } },
      select: { userId: true, timezone: true },
    });

    // Deduplicate on (userId, timezone), NOT on subscription: dispatchDigest
    // already pushes to every device the user owns, so one person with three
    // phones in one zone is ONE dispatch per trip, not three identical pushes.
    const pairs = new Map<string, { userId: string; timezone: string }>();
    for (const s of subscriptions) {
      if (!s.timezone) continue;
      pairs.set(JSON.stringify([s.userId, s.timezone]), {
        userId: s.userId,
        timezone: s.timezone,
      });
    }

    for (const { userId, timezone } of pairs.values()) {
      considered++;

      const slot = slotForZone(now, timezone);
      if (!slot) continue;

      // The local date is read in the subscriber's zone as well, so a run that
      // fires at 20:00Z dates an AEDT traveller's morning Digest to tomorrow.
      const localDate = instantToZonedDateISO(now, timezone);

      const memberships = await db.tripMember.findMany({
        where: { userId },
        select: { tripId: true },
        take: MAX_TRIPS_PER_USER,
      });

      for (const { tripId } of memberships) {
        const result = await dispatchDigest({ userId, tripId, localDate, slot });
        dispatched++;
        sent += result.sent;
        if (result.skipped) skipped++;
      }
    }

    return NextResponse.json({ considered, dispatched, sent, skipped });
  } catch (err) {
    console.error("[cron/reminders] Error:", err);
    return NextResponse.json(
      { error: "Internal server error", considered, dispatched, sent, skipped },
      { status: 500 },
    );
  }
}
