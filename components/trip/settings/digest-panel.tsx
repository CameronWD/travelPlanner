"use client";

import * as React from "react";
import Link from "next/link";
import { Send, Smartphone, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deviceTimeZone } from "@/lib/tz";
import { servedSlotsForZone } from "@/lib/digest-schedule";
import {
  readLocalDeviceState,
  type LocalDeviceState,
} from "@/components/account/device-state";
import {
  setDigestEnabled,
  sendTestDigest,
  type DigestSettings,
  type SendTestDigestResult,
} from "@/server/actions/digest";

export interface DigestPanelProps {
  tripId: string;
  initial: DigestSettings;
}

/** A browser does not change timezone mid-render; there is nothing to watch. */
function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * The Digest opt-in for one Traveller on one Trip (CONTEXT.md **Digest**).
 *
 * Three things live here:
 *
 *   1. the switch itself,
 *   2. one line naming whether THIS device (the browser rendering this page)
 *      will actually receive it — Device *management* moved to Account
 *      (ADR 0048), but a switch that cannot say whether anything is listening
 *      is worthless, so this still answers that one question and links to
 *      Account for anything more than that,
 *   3. a test send that always delivers and reports exactly what it delivered:
 *      the real Digest, or — on a day with nothing to say — a placeholder that
 *      proves the pipe. The failures that remain (no device, no VAPID keys on
 *      the deployment, nothing got through) each need a different fix, so each
 *      error string from `sendTestDigest` is surfaced verbatim,
 *   4. the note that a silent day is by design.
 *
 * `readLocalDeviceState()` (Task 5) has no way to know this device's stored
 * timezone — only whether it currently holds a live subscription — and
 * `DigestSettings.devices` (Task 8) has no endpoint to match a row back to
 * THIS browser. The one case where a device row can be attributed to this
 * browser without guessing is when there is exactly one device on file at
 * all and this browser is holding a live subscription: nothing else it could
 * be. Anywhere else — more than one device on file — the zone-specific
 * warnings below are skipped rather than pinned to the wrong device, which is
 * the exact failure mode ADR 0048 exists to close.
 */
export function DigestPanel({ tripId, initial }: DigestPanelProps) {
  const switchId = React.useId();
  const [enabled, setEnabled] = React.useState(initial.enabled);
  const [isPending, startTransition] = React.useTransition();
  const [testing, setTesting] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<SendTestDigestResult | null>(null);
  const [local, setLocal] = React.useState<LocalDeviceState | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    readLocalDeviceState().then((state) => {
      if (!cancelled) setLocal(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The zone *this* browser is in — null on the server, so the first client
  // render matches the markup it hydrates and the answer arrives immediately
  // after. `DeviceSync` (root layout) is what actually corrects the stored
  // value on every visit; this is only how the panel avoids reading a stale
  // zone out as current while that happens.
  const liveZone = React.useSyncExternalStore(
    subscribeToNothing,
    deviceTimeZone,
    () => null,
  );

  const localResolved = local !== null;
  const hasLiveSubscription = !!local?.endpoint;

  // The one device row we can honestly attribute to THIS browser — see the
  // component doc comment for why "exactly one device on file" is the only
  // unambiguous case.
  const myDevice =
    hasLiveSubscription && initial.devices.length === 1 ? initial.devices[0] : null;
  const storedZone = myDevice?.timezone ?? null;

  // Only a mismatch we can name is worth showing: no stored zone is already
  // covered by its own warning below, and an unattributed device (more than
  // one on file) has no stored zone to compare against in the first place.
  const zoneIsStale = !!storedZone && !!liveZone && storedZone !== liveZone;

  // Does the schedule reach this zone at all? The cron fires at fixed UTC
  // hours and the route filters on a whole local hour, so a zone whose offset
  // lines none of those hours up with the morning or evening window is
  // considered on every run and reached on none of them — invisible to the
  // only person it affects. Judged today rather than in the abstract: the
  // answer moves with daylight saving (lib/digest-schedule.ts).
  const zoneIsUnserved = React.useSyncExternalStore(
    subscribeToNothing,
    () => (storedZone ? servedSlotsForZone(new Date(), storedZone).size === 0 : false),
    () => false,
  );

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
            Your digest for this trip
          </label>
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

      {/* ── Whether this device is set up to get it ── */}
      {localResolved &&
        (initial.devices.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              No device is set up yet, so there&rsquo;s nowhere to send this.
            </p>
            <Link
              href="/account"
              className="self-start text-xs font-medium text-foreground underline underline-offset-2"
            >
              Manage devices
            </Link>
          </div>
        ) : hasLiveSubscription ? (
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <Smartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">
                This device will receive it
                {myDevice ? (myDevice.timezone ? ` · ${myDevice.timezone}` : "") : liveZone ? ` · ${liveZone}` : ""}
              </span>
            </p>
            {myDevice && myDevice.timezone === null && (
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
            {zoneIsUnserved && (
              <p className="flex items-start gap-2 text-xs text-destructive">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Nothing is scheduled to reach {storedZone}. TEEPEE dispatches at a few
                  fixed UTC hours, and today none of them land in that zone&rsquo;s
                  evening or morning — so this device is considered on every run
                  and sent to on none of them, with nothing in the logs to say so.
                  Covering it means adding an hour to the cron schedule (see
                  docs/DEPLOY.md §5).
                </span>
              </p>
            )}
            {zoneIsStale && (
              <p className="flex items-start gap-2 text-xs text-destructive">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  You are in {liveZone}, but the digest is still scheduled against{" "}
                  {storedZone}, which is some other hour here. TEEPEE re-records
                  the zone whenever you open TEEPEE; reload this page, and if this
                  is still showing, the update is not getting through.
                </span>
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              This device isn&rsquo;t set up to receive your digest.
            </p>
            <Link
              href="/account"
              className="self-start text-xs font-medium text-foreground underline underline-offset-2"
            >
              Manage devices
            </Link>
          </div>
        ))}

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
        {testResult?.ok === true && (() => {
          const devices = `${testResult.sent} ${testResult.sent === 1 ? "device" : "devices"}`;
          return (
            <p className="text-xs text-foreground">
              {testResult.placeholder
                ? `Sent a test to ${devices}. There's nothing to report today, so your real digest would stay silent.`
                : `Sent today's digest to ${devices}.`}
            </p>
          );
        })()}
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
