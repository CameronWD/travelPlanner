/**
 * lib/cron-health.ts — how long the Digest dispatcher may stay quiet.
 *
 * Pure arithmetic, no I/O, no clock of its own, exactly like lib/devices.ts:
 * `now` always arrives as an argument so a test can put it anywhere.
 *
 * This exists because silence is ambiguous. A Digest is deliberately not sent
 * when there is nothing to say, and the Settings panel has taught the
 * Traveller to read silence as normal — so a dispatcher that stopped running
 * altogether looks exactly like a quiet week. GitHub disables scheduled
 * workflows after 60 days of repository inactivity, which is what December
 * looks like from the outside.
 */

/**
 * Past this, the dispatcher is reported as stale. Deliberately generous:
 * GitHub delays scheduled runs under load and the workflow tolerates that by
 * design (it matches a three-hour local window, not an exact hour). Twenty-four
 * hours means at least four scheduled runs were missed — a real outage, not a
 * late one.
 */
export const DISPATCHER_STALE_AFTER_HOURS = 24;

const HOUR_MS = 3_600_000;

export function isDispatcherStale(lastRunAt: Date | null, now: Date): boolean {
  if (!lastRunAt) return true;
  return now.getTime() - lastRunAt.getTime() > DISPATCHER_STALE_AFTER_HOURS * HOUR_MS;
}

/**
 * Changes register at the threshold, for the same reason `formatLastSeen`
 * does: a relative age reads as reassurance, an absolute date reads as a
 * question.
 */
export function formatLastRun(lastRunAt: Date | null, now: Date): string {
  if (!lastRunAt) return "never run";
  if (isDispatcherStale(lastRunAt, now)) {
    return `last ran ${lastRunAt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  }
  const hours = Math.max(0, Math.floor((now.getTime() - lastRunAt.getTime()) / HOUR_MS));
  if (hours >= 1) return `last ran ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  return "last ran just now";
}

/**
 * Whether the Digest dispatcher should be reported as broken.
 *
 * Two signals, because one cannot answer the question. `lastRunAt` is stamped
 * on every authorized run, before any Digest is built — it is what separates
 * "nothing to say" from "the scheduler stopped".
 *
 * `lastSuccessAt` is stamped only when the scan completed *and* the dispatch
 * loop was not a total loss: either nothing failed, or at least one push went
 * out (app/api/cron/digest/route.ts). So it is left behind by a throw part-way
 * through the scan, and by a run in which every single dispatch threw. It is
 * deliberately NOT a claim that every Traveller got their Digest: the dispatch
 * loop catches per trip on purpose, so a run that delivered to most people and
 * failed one trip still stamps. The signal is "the dispatcher is doing work",
 * not "nothing went wrong" — a single persistently-broken trip is a job for
 * the logs, not for this panel, which would otherwise read unhealthy forever.
 *
 * Either going stale means Travellers are not getting Digests (CD-06).
 */
export function isDispatcherUnhealthy(
  lastRunAt: Date | null,
  lastSuccessAt: Date | null,
  now: Date,
): boolean {
  return isDispatcherStale(lastRunAt, now) || isDispatcherStale(lastSuccessAt, now);
}
