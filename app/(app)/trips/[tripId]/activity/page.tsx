import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { ActivityFeed } from "@/components/trip/activity-feed";
import { MarkReadOnView } from "@/components/trip/mark-read-on-view";
import type { ActivityRow } from "@/components/trip/activity-feed";

export const metadata: Metadata = { title: "Activity" };

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
    <div className="flex flex-col gap-6">
      {/* Header — kit: display title; the event count is ours */}
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-[28px] font-extrabold leading-none tracking-[-0.035em] text-foreground sm:text-4xl">
          Activity
        </h2>
        <p className="text-xs font-semibold text-muted-foreground">
          {activities.length === 1
            ? "1 event"
            : `${activities.length} events`}
        </p>
      </div>

      <ActivityFeed activities={activities} />

      <MarkReadOnView tripId={tripId} />
    </div>
  );
}
