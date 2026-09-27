import type { Metadata } from "next";
import { requireUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { TRAVELLER_SELECT, type TravellerLike } from "@/lib/traveller";
import { listDevices } from "@/server/actions/devices";
import { listDigestSettingsForUser } from "@/server/actions/digest";
import { getDispatcherHealth } from "@/server/actions/cron-health";
import { Card, CardTitle } from "@/components/ui/card";
import { ProfileCard } from "@/components/account/profile-card";
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
 * per-trip Digest switches, a home that isn't any one Trip. The Profile
 * photo and display name (CONTEXT.md) belong here too, for the same reason
 * — set once, read on every Trip and the Globe.
 */
export default async function AccountPage() {
  const user = await requireUser();

  const [profile, devices, trips, dispatcherHealth] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: { ...TRAVELLER_SELECT, email: true },
    }),
    // The page cannot know this browser's endpoint; DevicesPanel resolves
    // `isThisDevice` itself once it has read the local state.
    listDevices(null),
    listDigestSettingsForUser(),
    getDispatcherHealth(),
  ]);

  // requireUser() succeeded, so this Traveller's own row exists; the
  // fallback is just belt-and-braces against a row vanishing mid-request.
  const profileUser: TravellerLike = profile ?? {
    id: user.id,
    name: null,
    image: null,
    displayName: null,
    photoKey: null,
    photoUpdatedAt: null,
    email: null,
  };

  // One instant for the whole page, computed on the server so the client
  // components below cannot disagree with the server pass (CD-05).
  const now = new Date();

  return (
    <div className="flex flex-col gap-3 lg:gap-[18px]">
      <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em] text-foreground lg:text-4xl">
        Account
      </h1>

      {/* ── You: Profile photo + display name — placed first. ── */}
      <Card role="region" aria-labelledby="account-you" className="p-[18px]">
        <CardTitle id="account-you">You</CardTitle>
        <div className="mt-3.5">
          <ProfileCard user={profileUser} />
        </div>
      </Card>

      {/* The kit's two-column Account grid on desktop, one column on phone. */}
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2 lg:gap-[18px]">
        {/* ── Devices ── */}
        <Card role="region" aria-labelledby="account-devices" className="p-[18px]">
          <CardTitle id="account-devices">Devices</CardTitle>
          <div className="mt-3.5 flex flex-col gap-3">
            <DevicesPanel initial={devices} now={now} />
            <DispatcherHealth
              lastRunAt={dispatcherHealth.lastRunAt}
              lastSuccessAt={dispatcherHealth.lastSuccessAt}
              stale={dispatcherHealth.stale}
              now={now}
            />
          </div>
        </Card>

        {/* ── Per-trip digest switches — no account-wide mute; each trip's own
            switch is the only control. ── */}
        <Card role="region" aria-labelledby="account-digests" className="p-[18px]">
          <CardTitle id="account-digests">Which trips send you a digest</CardTitle>
          <div className="mt-3.5">
            <TripDigestsPanel initial={trips} />
          </div>
        </Card>
      </div>
    </div>
  );
}
