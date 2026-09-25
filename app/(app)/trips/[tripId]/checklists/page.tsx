import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { isAiConfigured } from "@/lib/ai";
import { sortChecklist } from "@/lib/checklists";
import { listTemplates } from "@/server/actions/checklists";
import { Checklist } from "@/components/trip/checklist";
import { PackingTemplatesBar } from "@/components/trip/packing-templates-bar";
import { AiPackingSuggestions } from "@/components/trip/ai-packing-suggestions";
import { AiBookingParser } from "@/components/trip/ai-booking-parser";
import { ChecklistsLayout } from "./checklists-layout";
import type { ChecklistKind } from "@/lib/enums";

/** Kit display title (same as Activity / Wishlist). Exported for tests. */
export const CHECKLISTS_TITLE_CLASS =
  "font-display text-[28px] font-extrabold leading-none tracking-[-0.035em] text-foreground sm:text-4xl";

export default async function ChecklistsPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  await requireTripAccess(tripId);

  const aiConfigured = isAiConfigured();

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
        select: { id: true, name: true, image: true },
      },
    },
  });

  // Fetch trip members for the assignee picker
  const members = await db.tripMember.findMany({
    where: { tripId },
    select: {
      user: { select: { id: true, name: true, image: true } },
    },
  });

  const memberList = members.map((m) => m.user);

  // Fetch the current user's packing templates
  const templates = await listTemplates();

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
      <h2 className={CHECKLISTS_TITLE_CLASS}>Checklists</h2>

      <ChecklistsLayout
        panels={[
          {
            value: "pretrip",
            label: (
              <>
                Pre-trip
                {pretripItems.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums text-foreground">
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
                  <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums text-foreground">
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
            value: "booking",
            label: "Booking parser",
            content: (
              <div className="flex flex-col gap-4">
                <AiBookingParser tripId={tripId} aiConfigured={aiConfigured} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
