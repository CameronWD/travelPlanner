import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { isAiConfigured } from "@/lib/ai";
import { sortChecklist } from "@/lib/checklists";
import { listTemplates } from "@/server/actions/checklists";
import { Checklist } from "@/components/trip/checklist";
import { TRAVELLER_SELECT } from "@/lib/traveller";
import { PackingTemplatesBar } from "@/components/trip/packing-templates-bar";
import { AiPackingSuggestions } from "@/components/trip/ai-packing-suggestions";
import { ChecklistsLayout } from "./checklists-layout";
import type { ChecklistKind } from "@/lib/enums";
import { REAL_PLAN } from "@/lib/plan-scope";
import { orderPlanStops } from "@/lib/plan-order";
import { tripTodayISO } from "@/lib/trip-today";
import { listRemindersForTrip } from "@/server/actions/reminders";
import { RemindersCard } from "@/components/trip/reminders-card";
import { tripEyebrow } from "@/lib/plan/plan-model";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { PageHeader } from "@/components/ui/page-header";
import { TripHeaderTrailing } from "@/components/trip/trip-header-trailing";

export const metadata: Metadata = { title: "Checklists" };

/**
 * PageHeader meta (AUDIT.md Checklists): "{to do} to do · {packed} packed of
 * {total}", dropping either half when its kind has no items at all — a Trip
 * with no packing list yet shouldn't read "0 packed of 0". Exported for
 * tests.
 */
export function checklistsMeta(pretrip: { done: boolean }[], packing: { done: boolean }[]): string | undefined {
  const todo = pretrip.filter((i) => !i.done).length;
  const packed = packing.filter((i) => i.done).length;
  const parts: string[] = [];
  if (pretrip.length) parts.push(`${todo} to do`);
  if (packing.length) parts.push(`${packed} packed of ${packing.length}`);
  return parts.join(" · ") || undefined;
}

export default async function ChecklistsPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  await requireTripAccess(tripId);

  const aiConfigured = isAiConfigured();

  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { name: true, startDate: true } });
  const slug = await tripSlugFor(tripId);

  // Fetch all checklist items for this trip
  const rawItems = await db.checklistItem.findMany({
    where: { tripId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      kind: true,
      text: true,
      done: true,
      dueDate: true,
      sortOrder: true,
      assignedTo: {
        select: TRAVELLER_SELECT,
      },
    },
  });

  // Fetch trip members for the assignee picker
  const members = await db.tripMember.findMany({
    where: { tripId },
    select: {
      user: { select: TRAVELLER_SELECT },
    },
  });

  const memberList = members.map((m) => m.user);

  // Fetch the current user's packing templates
  const templates = await listTemplates();

  // Reminders live here at every width (Task 16): the desktop Home shows them
  // only as "Sort these out" rows in their last week, so this is where a
  // Traveller lists and adds them. "today" is the trip's, never the machine's.
  // Real plan only, like Home — Reminders are about the Trip, not a variant.
  const stopsRaw = await db.stop.findMany({
    where: { tripId, ...REAL_PLAN },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, sortOrder: true, timezone: true, arriveDate: true, departDate: true },
  });
  const stops = orderPlanStops(stopsRaw);
  const today = tripTodayISO(stopsRaw);
  const reminders = await listRemindersForTrip(tripId, today);

  // Split into kinds and sort
  const pretripItems = sortChecklist(
    rawItems.filter((i) => i.kind === "PRETRIP"),
  );
  const packingItems = sortChecklist(
    rawItems.filter((i) => i.kind === "PACKING"),
  );

  // Cast kind to the proper type (it comes as string from Prisma)
  const typedPretripItems = pretripItems.map((i) => ({
    ...i,
    kind: i.kind as ChecklistKind,
    dueDate: i.dueDate ?? null,
  }));
  const typedPackingItems = packingItems.map((i) => ({
    ...i,
    kind: i.kind as ChecklistKind,
    dueDate: i.dueDate ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={tripEyebrow(trip?.name ?? "", trip?.startDate ?? null)}
        title="Checklists"
        meta={checklistsMeta(pretripItems, packingItems)}
        trailing={<TripHeaderTrailing tripId={tripId} slug={slug} />}
      />

      <RemindersCard
        tripId={tripId}
        reminders={reminders}
        today={today}
        stops={stops.map((s) => ({ id: s.id, name: s.name }))}
      />

      <ChecklistsLayout
        panels={[
          {
            value: "pretrip",
            label: (
              <>
                Pre-trip
                {pretripItems.length > 0 && (
                  <span className="rounded-full border-2 border-border bg-card px-1.5 text-[11px] font-extrabold tabular-nums text-foreground">
                    {pretripItems.filter((i) => !i.done).length}
                  </span>
                )}
              </>
            ),
            content: (
              <div className="flex flex-col gap-4">
                <Checklist
                  tripId={tripId}
                  kind="PRETRIP"
                  items={typedPretripItems}
                  members={memberList}
                  showDueDate
                  showAssignee
                />
              </div>
            ),
          },
          {
            value: "packing",
            label: (
              <>
                Packing
                {packingItems.length > 0 && (
                  <span className="rounded-full border-2 border-border bg-card px-1.5 text-[11px] font-extrabold tabular-nums text-foreground">
                    {packingItems.filter((i) => !i.done).length}
                  </span>
                )}
              </>
            ),
            content: (
              <div className="flex flex-col gap-4">
                {/* AI packing list suggestions */}
                <AiPackingSuggestions tripId={tripId} aiConfigured={aiConfigured} />

                {/* Templates bar — above the list */}
                <PackingTemplatesBar tripId={tripId} templates={templates} />

                <Checklist
                  tripId={tripId}
                  kind="PACKING"
                  items={typedPackingItems}
                  members={memberList}
                  showDueDate={false}
                  showAssignee={false}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
