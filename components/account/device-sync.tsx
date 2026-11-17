"use client";

import { useEffect, useRef } from "react";
import { deviceTimeZone } from "@/lib/tz";
import { reconcileDevice } from "@/server/actions/devices";
import { readLocalDeviceState } from "@/components/account/device-state";

/**
 * Report this **Device** to the server on every visit.
 *
 * Replaces `PushTimezoneSync` and widens its job. That component refreshed the
 * stored timezone and mounted in the *trip* layout, so "each visit" meant each
 * visit to a trip. This one mounts in the authenticated root layout, so the
 * trips list, the Globe and Account count too (follow-up item 4) — which is
 * what makes `lastSeenAt` mean "last used the app" rather than "last opened
 * Settings".
 *
 * It only ever reports a subscription that ALREADY exists. Creating one here
 * would be granting notification permission on a Traveller's behalf, which is
 * theirs to give from the Account page.
 *
 * It reports again when the app returns to the foreground if the zone has
 * changed or six hours have passed, so the Digest follows the Traveller across
 * timezones.
 *
 * Silent by design: the write is one nobody asked for, and Account is where
 * the state is explained. A ref guards against the mount report running twice
 * under React strict mode.
 */
const RESEND_AFTER_MS = 6 * 60 * 60 * 1000;

export function DeviceSync() {
  const reported = useRef(false);
  const lastZone = useRef<string | null>(null);
  const lastAt = useRef(0);

  useEffect(() => {
    function report() {
      lastZone.current = deviceTimeZone();
      lastAt.current = Date.now();

      // Read at call time, not module load: a top-level constant would freeze
      // in whatever NEXT_PUBLIC_VAPID_PUBLIC_KEY was at import — which is also
      // what makes this testable, since a test can stub the env only once the
      // component is already mounting.
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
      if (!vapidPublicKey) return;

      void (async () => {
        try {
          const state = await readLocalDeviceState();
          if (!state.endpoint || !state.keys) return;

          const zone = deviceTimeZone();
          await reconcileDevice({
            endpoint: state.endpoint,
            keys: state.keys,
            ...(zone ? { timezone: zone } : {}),
            userAgent: navigator.userAgent,
          });
        } catch (err) {
          // A failed report leaves the stored state as it was — wrong, but no
          // worse than before, and Account says so out loud.
          console.error("[DeviceSync] failed to report this device:", err);
        }
      })();
    }

    if (!reported.current) {
      reported.current = true;
      report();
    }

    // A phone that flew to another timezone keeps this tab alive, so the
    // mount-time report alone would leave the Digest on the old zone.
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      const zoneChanged = deviceTimeZone() !== lastZone.current;
      if (zoneChanged || Date.now() - lastAt.current > RESEND_AFTER_MS) report();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return null;
}
