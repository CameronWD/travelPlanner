/**
 * GET /api/cron/digest
 *
 * The Digest dispatcher (CONTEXT.md **Digest**, ADR 0047). Every run asks a
 * single question — which subscribers are in their morning or evening *window
 * in their own timezone right now* — and sends each of them at most one Digest
 * per Trip. Nothing here broadcasts to a Trip's membership: a Digest is
 * per-person, and `dispatchDigest` pushes to that person's own devices and
 * prunes dead ones.
 *
 * ---
 * SCHEDULING
 * The workflow fires at five fixed UTC hours (.github/workflows/digest-cron.yml,
 * `0 6,9,10,19,20 * * *`) and this route filters each run by the subscriber's
 * LOCAL hour, so the fixed schedule lands at the right wall-clock time in each
 * traveller's zone. Where each run lands, and which of them actually delivers:
 *
 *     UTC   Europe/Vienna (CET)  Australia/Brisbane (AEST)  Australia/Sydney (AEDT)
 *     06:00 07:00 MORNING ✔      16:00 —                    17:00 —
 *     09:00 10:00 —              19:00 —                    20:00 EVENING ✔
 *     10:00 11:00 —              20:00 EVENING ✔            21:00 EVENING (absorbed)
 *     19:00 20:00 EVENING ✔      05:00 —                    06:00 MORNING ✔ (next day)
 *     20:00 21:00 EVENING (abs.) 06:00 MORNING ✔ (next day) 07:00 MORNING (absorbed)
 *
 * "Absorbed" is not waste: a second run inside the same window finds the ledger
 * row already claimed for that (user, trip, local date, slot) and sends nothing.
 * That redundancy is deliberate cover for a delayed run, which is also why the
 * match is a three-hour WINDOW rather than an exact hour — GitHub Actions
 * delays scheduled runs under load, and an exact-hour test would mean a run
 * that slipped past the boundary silently skipped *everyone*, with no retry
 * since eligibility is itself by hour.
 *
 * The 10:00Z run exists because UTC+10 is real and permanent: Australia/Brisbane
 * never observes daylight saving, and Australia/Sydney is UTC+10 for roughly
 * seven months of the year. Without it those zones get a morning Digest and
 * never the 8pm one, which is the product (ADR 0008 records the first trip as
 * Brisbane → Europe → Brisbane).
 *
 * A subscriber outside both windows is simply passed over, so adding a UTC hour
 * for a new region costs nothing here. Because the local date is read in the
 * subscriber's zone too, the 19:00Z and 20:00Z runs correctly date an Australian
 * traveller's morning Digest to the *following* calendar day.
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
import { slotForZone } from "@/lib/digest-schedule";
import { instantToZonedDateISO } from "@/lib/tz";

// Force Node.js runtime — required for Prisma + web-push (not edge-compatible)
export const runtime = "nodejs";

// The local wall-clock hours a Digest is sent in — and the slot resolver that
// reads them — live in lib/digest-schedule.ts, where a test can hold them
// against the workflow's cron expression. They are LOCAL hours, not UTC ones:
// the workflow's five UTC hours (06/09/10/19/20 — see SCHEDULING above) exist
// only so that every zone we serve has a run landing inside each window.
// Changing either window means revisiting that cron expression, and
// lib/digest-schedule.test.ts fails if you change one without the other.

/** A backstop against one pathological account, not a real limit. */
const MAX_TRIPS_PER_USER = 50;

// A backstop against one pathological run, not a real limit: it bounds the work
// a single invocation can take on. If the subscriber list ever approaches this,
// the fix is a cursor over the scan (paging across runs), NOT a bigger number —
// a run that hits the cap drops everyone past it for that slot.
const MAX_SUBSCRIPTIONS_PER_RUN = 2000;

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
          "Push is not configured: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be set. No Digest was built, claimed or sent.",
      },
      { status: 503 },
    );
  }

  const now = new Date();

  // Stamped on every authorized run, sent or not. This is the only signal that
  // distinguishes "nothing to say" from "the scheduler stopped" — see
  // lib/cron-health.ts. Best-effort: a failed heartbeat must never cost anyone
  // their Digest. Placed AFTER the VAPID bail above (not before it): a run
  // that cannot deliver anything has not meaningfully "run", and the bail
  // already exists specifically to avoid waking Neon and burning ledger slots
  // for work that cannot be delivered — the heartbeat write must not undo that.
  try {
    await db.cronHeartbeat.upsert({
      where: { id: "digest" },
      create: { id: "digest", lastRunAt: now },
      update: { lastRunAt: now },
    });
  } catch (err) {
    console.error("[cron/digest] heartbeat write failed:", err);
  }

  /** Distinct people examined this run, each resolved to one zone. */
  let considered = 0;
  /** dispatchDigest calls made (a skipped dispatch still counts as one). */
  let dispatched = 0;
  /** Pushes actually delivered. */
  let sent = 0;
  /** Dispatches that produced no push — disabled, already sent, or empty. */
  let skipped = 0;
  /** Dispatches that threw. One bad trip must not cost everyone else their Digest. */
  let failed = 0;

  try {
    // A subscription with no stored timezone cannot be scheduled: there is no
    // local hour to compare against, and guessing one would deliver the Digest
    // at the wrong time of day. Those rows are simply never dispatched to.
    const subscriptions = await db.pushSubscription.findMany({
      where: { timezone: { not: null } },
      select: { userId: true, timezone: true, lastSeenAt: true },
      take: MAX_SUBSCRIPTIONS_PER_RUN,
    });

    if (subscriptions.length === MAX_SUBSCRIPTIONS_PER_RUN) {
      // Truncation drops real people's Digests, so say so loudly. Silent
      // truncation is the failure mode this whole log line exists to prevent.
      console.warn(
        `[cron/digest] Subscription scan hit the ${MAX_SUBSCRIPTIONS_PER_RUN}-row cap — subscribers beyond it were not considered this run. Move the scan to a cursor.`,
      );
    }

    // One clock per PERSON, not per Device (ADR 0050). Deduplicating on
    // (userId, timezone) meant a laptop left at home kept its stale zone and
    // reached its evening window hours before the phone abroad did — and
    // because dispatchDigest pushes to every Device the person owns and the
    // ledger key carries no zone, the travelling phone got the Digest at the
    // home laptop's 8pm and nothing at its own.
    //
    // `lastSeenAt` means "last used the app" now that DeviceSync mounts in the
    // authenticated root layout (ADR 0048), so the newest one is the Device
    // the Traveller is actually carrying. On a tie (two Devices reconciled in
    // the same instant) `>` is strict, so the first row the scan returned for
    // that user keeps its spot — a deterministic pick, not a correct-by-clock
    // one, since a millisecond-identical `lastSeenAt` gives no real signal
    // about which Device the Traveller had in hand.
    const zoneByUser = new Map<string, { timezone: string; lastSeenAt: Date }>();
    for (const s of subscriptions) {
      if (!s.timezone) continue;
      const best = zoneByUser.get(s.userId);
      if (!best || s.lastSeenAt > best.lastSeenAt) {
        zoneByUser.set(s.userId, { timezone: s.timezone, lastSeenAt: s.lastSeenAt });
      }
    }
    const electedZones = [...zoneByUser.entries()].map(([userId, v]) => ({
      userId,
      timezone: v.timezone,
    }));

    for (const { userId, timezone } of electedZones) {
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
        // Contained per trip on purpose. Without this, one bad trip aborts the
        // run and every subscriber after it loses that day's Digest with no
        // retry — eligibility is by local hour, so the next run is a day away.
        // The dispatcher also claims its ledger row before building and
        // releases it only on the empty path, so a throw after the claim burns
        // that slot for good. One failure, one lost Digest.
        try {
          const result = await dispatchDigest({ userId, tripId, localDate, slot, zone: timezone });
          dispatched++;
          sent += result.sent;
          if (result.skipped) skipped++;
        } catch (err) {
          failed++;
          console.error(
            `[cron/digest] Digest dispatch failed for user ${userId} trip ${tripId}:`,
            err,
          );
        }
      }
    }

    return NextResponse.json({ considered, dispatched, sent, skipped, failed });
  } catch (err) {
    console.error("[cron/digest] Error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        considered,
        dispatched,
        sent,
        skipped,
        failed,
      },
      { status: 500 },
    );
  }
}
