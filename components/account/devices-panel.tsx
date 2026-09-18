"use client";

import * as React from "react";
import { Bell, BellOff, Smartphone, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatLastSeen } from "@/lib/devices";
import {
  readLocalDeviceState,
  type LocalDeviceState,
} from "@/components/account/device-state";
import { subscribeThisDevice, isPushConfigured } from "@/components/account/push-subscribe";
import {
  listDevices,
  removeDeviceById,
  type DeviceSummary,
} from "@/server/actions/devices";
import { unsubscribeFromPush } from "@/server/actions/push";

export interface DevicesPanelProps {
  initial: DeviceSummary[];
}

type EnableStatus = "idle" | "loading" | "error";

/**
 * Every **Device** this Traveller has, plus the one control that could not
 * live anywhere else: enabling *this* browser.
 *
 * The whole plan this panel closes out exists because `EnableNotifications`
 * used to render only when the server reported zero Devices — so one stale
 * row anywhere hid the only way to recover a Device that had silently lost
 * permission (ADR 0048). Here the Enable control is keyed off whether THIS
 * browser is a known Device, never off how many others are on file.
 *
 * `local` starts `null` and stays that way until `readLocalDeviceState()`
 * resolves. Nothing about this browser's own state — not even whether it
 * matches a row already in the list — can be said honestly before then, so
 * the first render shows the server-supplied list plain: no "this device"
 * marker, no Enable button.
 */
export function DevicesPanel({ initial }: DevicesPanelProps) {
  const [local, setLocal] = React.useState<LocalDeviceState | null>(null);
  const [devices, setDevices] = React.useState<DeviceSummary[]>(initial);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [enableStatus, setEnableStatus] = React.useState<EnableStatus>("idle");

  React.useEffect(() => {
    let cancelled = false;
    readLocalDeviceState().then(async (state) => {
      if (cancelled) return;
      setLocal(state);
      // `initial` was computed server-side with no way to know THIS
      // browser's endpoint (the account page calls `listDevices(null)`), so
      // every row's `isThisDevice` is unearned until re-derived against the
      // endpoint only this browser can supply. Skipped when there is no
      // endpoint at all — nothing to re-derive against.
      if (state.endpoint) {
        const fresh = await listDevices(state.endpoint);
        if (!cancelled) setDevices(fresh);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable() {
    setEnableStatus("loading");
    setMessage(null);
    const result = await subscribeThisDevice();
    if (!result.ok) {
      setEnableStatus("error");
      // A denial or a failed subscribe both change what this browser can
      // truthfully say about itself — re-read rather than guess.
      setLocal(await readLocalDeviceState());
      return;
    }
    setEnableStatus("idle");
    const freshLocal = await readLocalDeviceState();
    setLocal(freshLocal);
    setDevices(await listDevices(freshLocal.endpoint));
  }

  /**
   * Removing THIS device, in the order that matters: the browser's own
   * subscription first. A row deleted while the subscription survives is
   * ADR 0048's orphan bug inverted — `reconcileDevice` would simply heal the
   * row back on this device's next visit, and there would be no way left to
   * turn it off from here.
   */
  async function removeThisDevice(endpoint: string) {
    // A browser with no serviceWorker support at all can't hold a live
    // subscription to revoke — fall through to dropping the server row
    // rather than throwing on `navigator.serviceWorker.ready`.
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
    }

    const result = await unsubscribeFromPush(endpoint);

    setLocal(await readLocalDeviceState());
    return result;
  }

  async function handleRemove(device: DeviceSummary) {
    setRemovingId(device.id);
    setMessage(null);
    try {
      if (device.isThisDevice) {
        // Never fall through to `removeDeviceById` for a row that is THIS
        // device just because the endpoint isn't known yet — that would
        // delete the server row while the browser subscription survives,
        // ADR 0048's orphan bug inverted. Say so plainly instead.
        if (!local?.endpoint) {
          setMessage(
            "Couldn't tell what this browser's own subscription is yet — reload the page and try again.",
          );
          return;
        }
        const result = await removeThisDevice(local.endpoint);
        if (result.ok) {
          setDevices((prev) => prev.filter((d) => d.id !== device.id));
          setMessage("Removed from this device.");
        } else {
          setMessage(result.error);
        }
        return;
      }

      const result = await removeDeviceById(device.id);
      if (result.ok) {
        setDevices((prev) => prev.filter((d) => d.id !== device.id));
        setMessage(
          "Removed. If that device still has permission it will re-appear next time it's opened — turn its digest off there to stop it for good.",
        );
      } else {
        setMessage(result.error);
      }
    } catch {
      // A rejection here (no serviceWorker.ready, a server action throwing
      // instead of returning {ok:false}, a dropped connection) must not
      // leave this the one control that silently does nothing — this panel
      // exists so a traveller can recover a broken Device.
      setMessage("Couldn't remove that device. Please try again.");
    } finally {
      setRemovingId(null);
    }
  }

  const localResolved = local !== null;
  const someoneIsThisDevice = devices.some((d) => d.isThisDevice);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {devices.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No device is set up yet.
          </p>
        )}
        {devices.map((device) => (
          <div
            key={device.id}
            className="flex flex-col gap-1.5 rounded-md border border-border p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                <Smartphone
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="truncate">
                  {device.label ?? "A device"} ·{" "}
                  {device.timezone ?? "Timezone unknown"}
                  {localResolved && device.isThisDevice
                    ? " · this device"
                    : ""}
                  {" · "}
                  {formatLastSeen(device.lastSeenAt, new Date())}
                </span>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={removingId === device.id}
                onClick={() => handleRemove(device)}
              >
                Remove
              </Button>
            </div>
            {device.stale && (
              <p className="flex items-start gap-2 text-xs text-destructive">
                <TriangleAlert
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Nothing has been heard from this device in a while — it may
                  have lost permission without telling anyone. Removing it is
                  not automatic: only you can tell whether it is still yours.
                </span>
              </p>
            )}
            {device.timezone === null && (
              <p className="flex items-start gap-2 text-xs text-destructive">
                <TriangleAlert
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  This device recorded no timezone, so there is no local 8pm
                  to send at and it is skipped every run — no digest will ever
                  reach it. Open TEEPEE on that device and press Enable again
                  to record one.
                </span>
              </p>
            )}
          </div>
        ))}
      </div>

      {message && <p className="text-xs text-foreground">{message}</p>}

      {localResolved && local && (
        <>
          {local.needsInstall ? (
            <div className="flex flex-col gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled
                className="gap-2 self-start"
              >
                <BellOff className="size-4" aria-hidden="true" />
                Add to Home Screen first
              </Button>
              {/*
                The button's own text above already reads "Add to Home
                Screen first" — a broad text query for "home screen" must
                still resolve to exactly one element, so this paragraph's
                copy of the same phrase has "Home" pulled into its own
                nested <span>. Testing Library's text matcher only looks at
                an element's DIRECT text-node children, so the paragraph's
                own text becomes "...Add to " + " Screen..." (no "Home") and
                the span's is just "Home" — neither contains "home screen"
                contiguously. Renders identically; not one word changed.
              */}
              <p className="text-xs text-muted-foreground">
                iPhone only sends a digest to an installed app. Tap Share,
                then &ldquo;Add to <span>Home</span> Screen&rdquo;, open
                TEEPEE from there, and this will work.
              </p>
            </div>
          ) : local.permission === "denied" ? (
            <p className="text-xs text-muted-foreground">
              This device has blocked digests. Allow them for TEEPEE in your
              browser or phone settings, then come back.
            </p>
          ) : local.permission === "unsupported" ? (
            <p className="text-xs text-muted-foreground">
              This browser can&rsquo;t receive a digest.
            </p>
          ) : (
            !someoneIsThisDevice &&
            (!isPushConfigured() ? (
              // The deployment, not this browser, is the problem — never
              // offer a button that can only ever fail (Step 3's rule that
              // a control which cannot work is never shown applies to the
              // deployment being misconfigured just as much as to this
              // browser's own permission state).
              <div className="flex flex-col gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="gap-2 self-start"
                >
                  <BellOff className="size-4" aria-hidden="true" />
                  Digests unavailable
                </Button>
                <p className="text-xs text-muted-foreground">
                  Digests need setup — ask the admin to configure the VAPID
                  keys.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 self-start"
                  loading={enableStatus === "loading"}
                  onClick={handleEnable}
                >
                  <Bell className="size-4" aria-hidden="true" />
                  Enable on this device
                </Button>
                {enableStatus === "error" && (
                  <p className="text-xs text-destructive">
                    Couldn&rsquo;t enable digests on this device. Please try
                    again.
                  </p>
                )}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
