import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { ActivityFeed } from "@/components/trip/activity-feed";
import { MarkReadOnView } from "@/components/trip/mark-read-on-view";
import type { ActivityRow } from "@/components/trip/activity-feed";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  await requireTripAccess(tripId);

  const rawActivities = await db.activity.findMany({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      actor: {
        select: { id: true, name: true, image: true },
      },
    },
  });

  // Prisma returns verb/entityType as `string`; cast to the typed union.
  const activities = rawActivities as unknown as ActivityRow[];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold text-foreground">
          Activity
        </h2>
        <p className="text-sm text-muted-foreground">
          {activities.length === 1
            ? "1 event"
            : `${activities.length} events`}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card px-5 py-2">
        <ActivityFeed activities={activities} />
      </div>

      <MarkReadOnView tripId={tripId} />
    </div>
  );
}
