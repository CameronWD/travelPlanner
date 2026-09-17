import type { DigestSlot } from "@/lib/digest";
import { instantToZonedTime } from "@/lib/tz";

/**
 * When a Digest is sent, expressed in the *subscriber's* local hours.
 *
 * These live here rather than inside app/api/cron/reminders/route.ts for one
 * reason: they are half of a contract whose other half is the cron expression
 * in .github/workflows/reminders-cron.yml, and that contract needs a test.
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

/** The Digest slot a zone is currently in, or null when it is in neither. */
export function slotForZone(now: Date, timeZone: string): DigestSlot | null {
  // instantToZonedTime yields "HH:MM" and falls back to UTC on an unknown
  // zone, so a junk timezone string degrades to "wrong hour", never a throw.
  const localHour = Number(instantToZonedTime(now, timeZone).slice(0, 2));
  if (EVENING_WINDOW_LOCAL_HOURS.includes(localHour)) return "EVENING";
  if (MORNING_WINDOW_LOCAL_HOURS.includes(localHour)) return "MORNING";
  return null;
}
