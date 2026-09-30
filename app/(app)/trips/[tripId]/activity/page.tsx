import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { readTripShell } from "@/lib/trip-shell-reads";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { ActivityFeed } from "@/components/trip/activity-feed";
import { MarkReadOnView } from "@/components/trip/mark-read-on-view";
import type { ActivityRow } from "@/components/trip/activity-feed";
import { TRAVELLER_SELECT } from "@/lib/traveller";
import { PageHeader } from "@/components/ui/page-header";
import { TripHeaderTrailing } from "@/components/trip/trip-header-trailing";
import { activityMeta } from "@/lib/page-meta";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);
  const [shell, slug] = await Promise.all([readTripShell(tripId), tripSlugFor(tripId)]);

  const rawActivities = await db.activity.findMany({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      actor: {
        select: TRAVELLER_SELECT,
      },
    },
  });

  // Prisma returns verb/entityType as `string`; cast to the typed union.
  const activities = rawActivities as unknown as ActivityRow[];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={shell?.name}
        title="Activity"
        meta={activityMeta(activities.length)}
        metaOnMobile
        trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />}
      />

      <ActivityFeed activities={activities} />

      <MarkReadOnView tripId={tripId} />
    </div>
  );
}
