import type { Metadata } from "next";
import { listDevices } from "@/server/actions/devices";
import { listDigestSettingsForUser } from "@/server/actions/digest";
import { getDispatcherHealth } from "@/server/actions/cron-health";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DevicesPanel } from "@/components/account/devices-panel";
import { TripDigestsPanel } from "@/components/account/trip-digests-panel";
import { DispatcherHealth } from "@/components/account/dispatcher-health";

export const metadata: Metadata = { title: "Account" };

/**
 * TEEPEE's first account-scoped screen (as opposed to trip-scoped).
 *
 * Devices belong to a Traveller, not a Trip — rendering that account-wide
 * fact inside one Trip's Settings is a large part of why a dead device stayed
 * invisible in production (ADR 0048). This page gives Devices, and the
 * per-trip Digest switches, a home that isn't any one Trip.
 */
export default async function AccountPage() {
  const [devices, trips, dispatcherHealth] = await Promise.all([
    // The page cannot know this browser's endpoint; DevicesPanel resolves
    // `isThisDevice` itself once it has read the local state.
    listDevices(null),
    listDigestSettingsForUser(),
    getDispatcherHealth(),
  ]);

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-3.5">
      <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
        Account
      </h2>

      {/* ── Devices ── */}
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle className="font-display text-base font-bold tracking-tight">
            Devices
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-3 flex flex-col gap-4">
          <DevicesPanel initial={devices} />
          <DispatcherHealth
            lastRunAt={dispatcherHealth.lastRunAt}
            stale={dispatcherHealth.stale}
          />
        </CardContent>
      </Card>

      {/* ── Per-trip digest switches — no account-wide mute; each trip's own
          switch is the only control. ── */}
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle className="font-display text-base font-bold tracking-tight">
            Which trips send you a digest
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-3">
          <TripDigestsPanel initial={trips} />
        </CardContent>
      </Card>
    </div>
  );
}
