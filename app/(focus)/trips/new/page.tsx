import type { Metadata } from "next";
import { requireUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { reconcilePendingInvites } from "@/lib/reconcile-invites";
import { NewTripFlow } from "@/components/new-trip/new-trip-flow";
import { routeStopsFromShare } from "@/server/actions/copy-route-from-share";

type SearchParams = Promise<{ past?: string; name?: string; step?: string; fromShare?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const past = (await searchParams).past === "1";
  return { title: past ? "Log a past trip" : "New trip" };
}

export default async function NewTripPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const past = sp.past === "1";
  const me = await db.user.findUnique({ where: { id: user.id }, select: { displayName: true, email: true } });
  // The layout renders in parallel with this page, so its reconcile may not
  // have run yet: wait for it (cache() shares the one run) before counting,
  // or an invited Traveller is greeted as on their first trip.
  if (me?.email) await reconcilePendingInvites(user.id, me.email);
  const tripCount = await db.tripMember.count({ where: { userId: user.id } });
  const displayName = me?.displayName?.trim().split(/\s+/)[0] || null;
  // A dead ?fromShare= link simply starts a blank trip — no error.
  const fromShare = typeof sp.fromShare === "string" && sp.fromShare ? sp.fromShare : undefined;
  const shared = fromShare ? await routeStopsFromShare(fromShare) : null;
  const initialName = shared ? `${shared.tripName} (my version)` : typeof sp.name === "string" ? sp.name : undefined;
  const step = Number(sp.step);

  return (
    <NewTripFlow
      // "Log a past trip" is a soft navigation to this same route: re-key so the
      // flow starts over in that mode with the name adopted.
      key={`${past}:${initialName ?? ""}`}
      past={past}
      firstTrip={tripCount === 0}
      displayName={displayName}
      initialName={initialName}
      initialStep={sp.step && Number.isInteger(step) ? step : undefined}
      fromShareToken={shared ? fromShare : undefined}
    />
  );
}
