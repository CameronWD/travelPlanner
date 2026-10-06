import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { isAiConfigured } from "@/lib/ai";
import { sortChecklist } from "@/lib/checklists";
import { listTemplates } from "@/server/actions/checklists";
import { Checklist } from "@/components/trip/checklist";
import { ShoppingList } from "@/components/trip/shopping-list";
import { buildShoppingEntries, shoppingOpenCount } from "@/lib/shopping-list";
import { TRAVELLER_SELECT } from "@/lib/traveller";
import { PackingTemplatesBar } from "@/components/trip/packing-templates-bar";
import { AiPackingSuggestions } from "@/components/trip/ai-packing-suggestions";
import { ChecklistsLayout } from "./checklists-layout";
import type { ChecklistKind } from "@/lib/enum-values";
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

  // One wave after the gate (spec 2026-10-06 §C). Reminders live here at every
  // width (Task 16): the desktop Home shows them only as "Sort these out" rows
  // in their last week, so this is where a Traveller lists and adds them.
  // "today" is the trip's, never the machine's, so Reminders chain on the
  // Stops. Real plan only, like Home — Reminders are about the Trip, not a
  // variant. `.then((rows) => rows)`: one settled promise for both consumers.
  const stopsPromise = db.stop
    .findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, sortOrder: true, timezone: true, arriveDate: true, departDate: true },
    })
    .then((rows) => rows);
  const [trip, slug, rawItems, members, templates, stopsRaw, reminders] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { name: true, startDate: true } }),
    tripSlugFor(tripId),
    // All checklist items for this trip
    db.checklistItem.findMany({
      where: { tripId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        kind: true,
        text: true,
        done: true,
        dueDate: true,
        sortOrder: true,
        buy: true,
        assignedTo: { select: TRAVELLER_SELECT },
      },
    }),
    // Trip members for the assignee picker
    db.tripMember.findMany({ where: { tripId }, select: { user: { select: TRAVELLER_SELECT } } }),
    // The current user's packing templates
    listTemplates(),
    stopsPromise,
    stopsPromise.then((rows) => listRemindersForTrip(tripId, tripTodayISO(rows))),
  ]);

  const memberList = members.map((m) => m.user);
  const stops = orderPlanStops(stopsRaw);
  const today = tripTodayISO(stopsRaw);

  // Split into kinds and sort
  const pretripItems = sortChecklist(
    rawItems.filter((i) => i.kind === "PRETRIP"),
  );
  const packingItems = sortChecklist(
    rawItems.filter((i) => i.kind === "PACKING"),
  );
  const shoppingItems = sortChecklist(
    rawItems.filter((i) => i.kind === "SHOPPING"),
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

  // Shopping tab (spec 2026-10-02 §G): Packing items flagged to buy, plus
  // standalone SHOPPING items. Count badge = NEEDED packing + unticked
  // standalone — the Checklists meta line and Home counts are unchanged.
  const shoppingEntries = buildShoppingEntries(packingItems, shoppingItems);
  const shoppingOpen = shoppingOpenCount(shoppingEntries);

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
          {
            value: "shopping",
            label: (
              <>
                Shopping
                {shoppingEntries.length > 0 && (
                  <span className="rounded-full border-2 border-border bg-card px-1.5 text-[11px] font-extrabold tabular-nums text-foreground">
                    {shoppingOpen}
                  </span>
                )}
              </>
            ),
            content: (
              <div className="flex flex-col gap-4">
                <ShoppingList tripId={tripId} entries={shoppingEntries} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
