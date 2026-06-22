import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { isAiConfigured } from "@/lib/ai";
import { sortChecklist } from "@/lib/checklists";
import { listTemplates } from "@/server/actions/checklists";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checklist } from "@/components/trip/checklist";
import { PackingTemplatesBar } from "@/components/trip/packing-templates-bar";
import { AiPackingSuggestions } from "@/components/trip/ai-packing-suggestions";
import { AiBookingParser } from "@/components/trip/ai-booking-parser";
import type { ChecklistKind } from "@/lib/enums";

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
      <Tabs defaultValue="pretrip" className="w-full">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="pretrip">
            Pre-trip
            {pretripItems.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums">
                {pretripItems.filter((i) => !i.done).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="packing">
            Packing
            {packingItems.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums">
                {packingItems.filter((i) => !i.done).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="booking">
            Booking parser
          </TabsTrigger>
        </TabsList>

        {/* ── Pre-trip tab ── */}
        <TabsContent value="pretrip">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                Pre-trip checklist
              </h2>
              <p className="text-sm text-muted-foreground">
                Tasks to complete before you leave — bookings, paperwork, and
                anything with a deadline.
              </p>
            </div>
            <Checklist
              tripId={tripId}
              kind="PRETRIP"
              items={typedPretripItems}
              members={memberList}
              showDueDate
              showAssignee
            />
          </div>
        </TabsContent>

        {/* ── Packing tab ── */}
        <TabsContent value="packing">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                Packing list
              </h2>
              <p className="text-sm text-muted-foreground">
                Everything you need to pack. Check items off as you go — done items
                won&apos;t disappear until you remove them.
              </p>
            </div>

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
        </TabsContent>

        {/* ── Booking parser tab ── */}
        <TabsContent value="booking">
          <div className="flex flex-col gap-4">
            <AiBookingParser tripId={tripId} aiConfigured={aiConfigured} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
