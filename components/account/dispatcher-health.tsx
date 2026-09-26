"use client";

import { TriangleAlert } from "lucide-react";
import { formatLastRun, isDispatcherStale } from "@/lib/cron-health";

export interface DispatcherHealthProps {
  lastRunAt: Date | null;
  /**
   * Stamped only once a scan completes (CD-06). `null` means either the
   * dispatcher has never finished a scan, or the deploy that added this
   * column hasn't seen one yet — both read the same to a Traveller: nothing
   * has gone out.
   */
  lastSuccessAt: Date | null;
  /** `isDispatcherUnhealthy(lastRunAt, lastSuccessAt, now)`, computed server-side. */
  stale: boolean;
  /**
   * The server's instant, passed down rather than read here. This component
   * is `"use client"` so the FORMATTING runs in the reader's timezone (see
   * the note below) — but a `new Date()` in the render body also makes the
   * clock differ between the server pass and hydration, which is a text
   * mismatch, guaranteed on the stale branch (CD-05). Only the clock moves
   * to the server; the formatting stays here.
   */
  now: Date;
}

/**
 * Says when the Digest dispatcher last ran, inside the Devices card
 * (ADR 0047's cron heartbeat) — it explains what keeps the Devices above fed,
 * so it does not stand alone as its own card.
 *
 * `"use client"` on purpose, for the same reason `DevicesPanel` is one:
 * `formatLastRun`'s stale branch calls `toLocaleDateString` with no explicit
 * timezone, so it renders in whatever timezone the code actually runs in.
 * `getDispatcherHealth` computes `stale` server-side (a duration comparison,
 * so it is timezone-independent — the same instant is stale or not regardless
 * of whose clock reads it), but the *formatted date string* is not, and this
 * component is the one place that string is built. Left as a plain function
 * component in the page's server tree, that `toLocaleDateString` call would
 * run on the server — almost certainly UTC in production — instead of in the
 * reader's own browser, silently reproducing the exact bug `formatLastSeen`'s
 * own comment (lib/devices.ts) says was deliberately avoided: a relative age
 * doesn't care, but the absolute date near local midnight would read a day
 * off for a Traveller far from the server's zone. `AccountPage` still fetches
 * `lastRunAt`/`stale` server-side and passes them down as plain props exactly
 * as it already does for `DevicesPanel`'s `initial` list (Dates cross the
 * Server→Client boundary the same way there), so nothing about *data
 * fetching* moves client-side — only the date formatting does.
 *
 * The main line always renders `formatLastRun` plainly (mirrors
 * `formatLastSeen`'s register change on the Devices list above it). The
 * second line only appears once unhealthy, and says outright that Digests
 * are not going out: the Digest panel already taught the Traveller to read
 * silence as normal, so this is the one place that has to contradict that
 * training instead of reinforcing it.
 *
 * Two distinct warnings, because `lastRunAt` and `lastSuccessAt` can go
 * stale independently (CD-06). If the route itself stopped running, nothing
 * downstream matters — "Digests are not being sent." covers it. If the route
 * is running but a scan keeps throwing before it finishes, `lastRunAt` stays
 * fresh while `lastSuccessAt` doesn't — the vaguer "not being sent" framing
 * would be actively wrong there (something IS running), so that case gets
 * its own line naming what's actually stuck.
 */
export function DispatcherHealth({
  lastRunAt,
  lastSuccessAt,
  stale,
  now,
}: DispatcherHealthProps) {
  const routeStale = isDispatcherStale(lastRunAt, now);
  const successStale = isDispatcherStale(lastSuccessAt, now);

  let warning: string | null = null;
  if (routeStale) {
    warning = "Digests are not being sent.";
  } else if (successStale) {
    warning = lastSuccessAt
      ? `Running, but nothing has been sent since ${formatLastRun(lastSuccessAt, now).replace(/^last ran /, "")}.`
      : "Running, but no Digest has ever been sent.";
  }

  return (
    <div className="flex flex-col gap-1.5 border-t-2 border-border-soft pt-3">
      <p
        className={
          stale
            ? "flex items-center gap-2 text-xs font-semibold text-destructive"
            : "flex items-center gap-2 text-xs font-semibold text-muted-foreground"
        }
      >
        {/* Status, not identity: the dot uses the status tokens. The text
            beside it carries the meaning, so the dot is decorative. */}
        <span
          aria-hidden="true"
          data-testid="dispatcher-status-dot"
          className={
            stale
              ? "size-2.5 shrink-0 rounded-full border-2 border-border bg-destructive"
              : "size-2.5 shrink-0 rounded-full border-2 border-border bg-success"
          }
        />
        <span>Digest service — {formatLastRun(lastRunAt, now)}</span>
      </p>
      {warning && (
        <p className="flex items-start gap-2 text-xs font-medium text-destructive">
          <TriangleAlert
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>{warning}</span>
        </p>
      )}
    </div>
  );
}
