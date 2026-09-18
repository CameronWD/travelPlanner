/**
 * lib/devices.ts — how long a **Device** (CONTEXT.md) may stay quiet.
 *
 * Pure arithmetic, no I/O, no clock of its own: `now` always arrives as an
 * argument so a test can put it anywhere. Every threshold that decides what a
 * Traveller is told about a Device lives here and nowhere else.
 */

/**
 * A Device unseen for longer than this is FLAGGED — never deleted (ADR 0048).
 * Two weeks is the compromise: shorter cries wolf over a laptop nobody opened
 * for a fortnight, longer is useless for catching a dead Device before it
 * swallows a trip's worth of Digests.
 */
export const DEVICE_STALE_AFTER_DAYS = 14;

/**
 * Reconcile touches `lastSeenAt` only when the stored value is older than
 * this. Every authenticated page already wakes Neon for the session, so the
 * read is free; this keeps the WRITE down to a handful a day per Device
 * (ADR 0047 denominates everything in CU-hours).
 */
export const DEVICE_TOUCH_AFTER_MS = 6 * 60 * 60 * 1000;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Whole days from `lastSeenAt` to `now`, never negative (clocks disagree). */
function daysSince(lastSeenAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - lastSeenAt.getTime()) / DAY_MS));
}

export function isDeviceStale(lastSeenAt: Date, now: Date): boolean {
  return daysSince(lastSeenAt, now) > DEVICE_STALE_AFTER_DAYS;
}

export function needsTouch(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() > DEVICE_TOUCH_AFTER_MS;
}

/**
 * How the device list says when it last heard from a Device.
 *
 * Deliberately changes register at the staleness threshold: a relative age
 * reads as reassurance ("seen 4 days ago" — fine), an absolute date reads as a
 * question ("unseen since 28 Aug 2026" — is that thing still alive?).
 *
 * The date is rendered in the reader's own timezone on purpose — a Brisbane
 * traveller should see their own calendar's date, not UTC's. The test runner
 * is pinned to UTC so the assertion is stable across timezones.
 */
export function formatLastSeen(lastSeenAt: Date, now: Date): string {
  if (isDeviceStale(lastSeenAt, now)) {
    return `unseen since ${lastSeenAt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  }

  const days = daysSince(lastSeenAt, now);
  if (days >= 1) return `seen ${days} ${days === 1 ? "day" : "days"} ago`;

  const hours = Math.max(0, Math.floor((now.getTime() - lastSeenAt.getTime()) / HOUR_MS));
  if (hours >= 1) return `seen ${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  return "seen just now";
}
