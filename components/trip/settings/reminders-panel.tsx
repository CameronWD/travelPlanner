"use client";

import * as React from "react";
import { Send, Smartphone, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnableNotifications } from "@/components/trip/enable-notifications";
import { deviceTimeZone } from "@/lib/tz";
import {
  setDigestEnabled,
  sendTestDigest,
  type DigestSettings,
} from "@/server/actions/digest";

export interface RemindersPanelProps {
  tripId: string;
  initial: DigestSettings;
}

/** A browser does not change timezone mid-render; there is nothing to watch. */
function subscribeToNothing(): () => void {
  return () => {};
}

/** "3 Sep 2026" — fixed locale so the server and the client agree. */
function formatSubscribedAt(value: Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "an unknown date";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The Digest opt-in for one Traveller on one Trip (CONTEXT.md **Digest**).
 *
 * Four things live here, because switching a Digest on is worthless if you
 * cannot tell whether it reached anywhere:
 *
 *   1. the switch itself,
 *   2. the device it would reach — or the button to subscribe one,
 *   3. a test send that reports exactly why it failed, not "something went
 *      wrong": the three failures (no device, no VAPID keys on the deployment,
 *      nothing due today) each need a different fix, so each error string from
 *      `sendTestDigest` is surfaced verbatim,
 *   4. the note that a silent day is by design.
 *
 * A device with no stored timezone is called out rather than papered over: the
 * dispatcher skips those rows outright (app/api/cron/reminders/route.ts), so
 * that person would otherwise wait forever for a Digest that is never even
 * attempted.
 */
export function RemindersPanel({ tripId, initial }: RemindersPanelProps) {
  const switchId = React.useId();
  const [enabled, setEnabled] = React.useState(initial.enabled);
  const [isPending, startTransition] = React.useTransition();
  const [testing, setTesting] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<
    { ok: true; sent: number } | { ok: false; error: string } | null
  >(null);

  const device = initial.device;
  const zone = device?.timezone ?? null;

  // The zone *this* browser is in — null on the server, so the first client
  // render matches the markup it hydrates and the answer arrives immediately
  // after. `PushTimezoneSync` (trip layout) is what actually corrects the
  // stored value; this is only how the panel avoids reading a stale zone out
  // as current while that happens.
  const liveZone = React.useSyncExternalStore(
    subscribeToNothing,
    deviceTimeZone,
    () => null,
  );

  // Only a mismatch we can name is worth showing: no stored zone is already
  // covered by its own warning below.
  const zoneIsStale = !!zone && !!liveZone && zone !== liveZone;

  const handleToggle = (next: boolean) => {
    const previous = enabled;
    setEnabled(next);
    setTestResult(null);
    setSaveError(null);
    startTransition(async () => {
      try {
        await setDigestEnabled(tripId, next);
      } catch {
        // Roll the switch back rather than leave it showing a state the server
        // never accepted — and say so here rather than let the rejection reach
        // the error boundary and take the whole Settings page down with it.
        setEnabled(previous);
        setSaveError("Couldn't save that — check your connection and try again.");
      }
    });
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await sendTestDigest(tripId));
    } catch {
      setTestResult({ ok: false, error: "The test digest could not be sent." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── The switch ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label
            htmlFor={switchId}
            className="text-sm font-medium text-foreground"
          >
            Your digest
          </label>
          {device && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {!zone
                ? "8pm · timezone unknown"
                : zoneIsStale
                  ? `8pm · ${zone} — not this device's zone`
                  : `8pm · ${zone}`}
            </p>
          )}
        </div>
        <input
          id={switchId}
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-primary"
          checked={enabled}
          disabled={isPending}
          onChange={(e) => handleToggle(e.target.checked)}
        />
      </div>

      {saveError && <p className="text-xs text-destructive">{saveError}</p>}

      <p className="text-xs text-muted-foreground">
        One push in the evening, carrying whatever is true that day — a payment
        due, checklist items falling due, that day&rsquo;s reminders, and
        tomorrow&rsquo;s plan once tomorrow falls inside the trip. On a travel
        day — one with transport or a check-out — a second, shorter one arrives
        around 7am with that day&rsquo;s plan, as cover for a calendar alarm your
        phone quietly declined to fire; it never repeats what last night&rsquo;s
        already said. It is yours alone: switching it off here changes nothing
        for the other traveller.
      </p>

      {/* ── The device it reaches ── */}
      {device ? (
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-2 text-sm text-foreground">
            <Smartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">
              {zone ?? "Timezone unknown"} · subscribed{" "}
              {formatSubscribedAt(device.subscribedAt)}
            </span>
          </p>
          {!zone && (
            <p className="flex items-start gap-2 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                This device recorded no timezone, so there is no local 8pm to
                send at and it is skipped every run — no digest will ever reach
                it. Open TEEPEE on that device and press Enable again to record
                one.
              </span>
            </p>
          )}
          {zoneIsStale && (
            <p className="flex items-start gap-2 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                You are in {liveZone}, but the digest is still scheduled against{" "}
                {zone} — so it arrives at 8pm {zone}, which is some other hour
                here. TEEPEE re-records the zone whenever you open the trip;
                reload this page, and if this is still showing, the update is
                not getting through.
              </span>
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            No device subscribed yet, so there is nowhere to send your digest.
          </p>
          <EnableNotifications />
        </div>
      )}

      {/* ── Prove it works ── */}
      <div className="flex flex-col gap-1.5">
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTest}
            loading={testing}
          >
            <Send className="size-4" aria-hidden="true" />
            Send me a test
          </Button>
        </div>
        {testResult?.ok === true && (
          <p className="text-xs text-foreground">
            Sent to {testResult.sent} {testResult.sent === 1 ? "device" : "devices"}.
          </p>
        )}
        {testResult?.ok === false && (
          <p className="text-xs text-destructive">{testResult.error}</p>
        )}
      </div>

      {/* ── Why silence is not breakage ── */}
      <p className="text-xs text-muted-foreground">
        A digest is only sent when there is something to say. On a day with no
        payment due, no checklist item, no reminder and nothing coming up, you
        get nothing at all — that is working correctly, not a delivery failure.
        Use <span className="font-medium text-foreground">Send me a test</span>{" "}
        if you want to check the pipe rather than wait.
      </p>
    </div>
  );
}
