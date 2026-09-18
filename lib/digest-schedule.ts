import type { DigestSlot } from "@/lib/digest";
import { instantToZonedTime } from "@/lib/tz";

/**
 * When a Digest is sent, expressed in the *subscriber's* local hours.
 *
 * These live here rather than inside app/api/cron/digest/route.ts for one
 * reason: they are half of a contract whose other half is the cron expression
 * in .github/workflows/digest-cron.yml, and that contract needs a test.
 * A Next.js route module may not export anything but its handlers and route
 * config, so the constants had nowhere to be asserted against while they lived
 * there — and a schedule that agrees with the windows only in prose is a
 * schedule that silently reaches nobody the day someone edits one side.
 * `lib/digest-schedule.test.ts` reads the YAML and checks the two agree.
 *
 * Each window is three hours wide so that a GitHub Actions run delayed past
 * its hour still finds its subscribers instead of skipping the day. Widening
 * cannot double-send: dispatchDigest's ledger is keyed (user, trip, local
 * date, slot), so a second run inside the same window is absorbed as
 * already-sent.
 */
export const MORNING_WINDOW_LOCAL_HOURS: readonly number[] = [6, 7, 8];
export const EVENING_WINDOW_LOCAL_HOURS: readonly number[] = [20, 21, 22];

/**
 * The UTC hours the cron actually fires at — the other half of that contract,
 * mirrored from `.github/workflows/digest-cron.yml`.
 *
 * It lives here so a *running* surface can answer "will this device ever be
 * reached?" without re-deriving the schedule: `lib/digest-schedule.test.ts`
 * reads the YAML and fails if this list and the cron expression drift apart, so
 * there is still exactly one place to edit and one place that can be wrong.
 */
export const DIGEST_CRON_UTC_HOURS: readonly number[] = [6, 9, 10, 19, 20];

/** The Digest slot a zone is currently in, or null when it is in neither. */
export function slotForZone(now: Date, timeZone: string): DigestSlot | null {
  // instantToZonedTime yields "HH:MM" and falls back to UTC on an unknown
  // zone, so a junk timezone string degrades to "wrong hour", never a throw.
  const localHour = Number(instantToZonedTime(now, timeZone).slice(0, 2));
  if (EVENING_WINDOW_LOCAL_HOURS.includes(localHour)) return "EVENING";
  if (MORNING_WINDOW_LOCAL_HOURS.includes(localHour)) return "MORNING";
  return null;
}

/**
 * Which Digest slots the current schedule actually reaches in `timeZone`, on
 * the day `now` falls on.
 *
 * Judged at a given instant rather than across the year because the answer
 * genuinely changes with daylight saving: `America/New_York` picks up a morning
 * run under EDT and nothing at all under EST. A traveller is owed the truth
 * about today, not an average.
 *
 * An empty set means the schedule silently reaches that device never — which is
 * otherwise invisible to the only person it affects, since the cron considers
 * them on every run, matches no window, and says nothing.
 */
export function servedSlotsForZone(now: Date, timeZone: string): Set<DigestSlot> {
  const slots = new Set<DigestSlot>();
  const dayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  for (const hour of DIGEST_CRON_UTC_HOURS) {
    const slot = slotForZone(new Date(dayStart + hour * 3_600_000), timeZone);
    if (slot) slots.add(slot);
  }
  return slots;
}
