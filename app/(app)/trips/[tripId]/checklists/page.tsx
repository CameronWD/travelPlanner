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

/** Reading-width wrapper applied to the tabs+content column. Exported for tests. */
export const CHECKLISTS_READING_WIDTH_CLASS = "w-full max-w-3xl";

/** Kit display title (same as Activity / Wishlist). Exported for tests. */
export const CHECKLISTS_TITLE_CLASS =
  "font-display text-[28px] font-extrabold leading-none tracking-[-0.035em] text-foreground sm:text-4xl";

/**
 * Kit Segmented, teal tone (together.jsx Checklists). Overrides the Tabs
 * primitive's ink active fill; adds the Segmented primitive's 44px coarse-
 * pointer hit area (32px pill + 6px above and below). Exported for tests.
 */
/**
 * Tab list: keeps the primitive's `overflow-x-auto` so the pill scrolls on
 * 360/375px phones instead of spilling. That overflow clips at the padding
 * box, so on touch the list grows to 48px: its 44px padding box then holds
 * each trigger's full 44px hit area. Exported for tests.
 */
export const CHECKLISTS_TABS_LIST_CLASS = "max-sm:gap-0 pointer-coarse:h-12";

export const CHECKLISTS_TAB_CLASS =
  "relative shrink-0 max-sm:px-2.5 data-[state=active]:bg-teal data-[state=active]:text-on-accent pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1.5 pointer-coarse:after:content-['']";

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

      <div className={CHECKLISTS_READING_WIDTH_CLASS}>
      <Tabs defaultValue="pretrip" className="w-full">
        <TabsList className={CHECKLISTS_TABS_LIST_CLASS}>
          <TabsTrigger value="pretrip" className={CHECKLISTS_TAB_CLASS}>
            Pre-trip
            {pretripItems.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums text-foreground">
                {pretripItems.filter((i) => !i.done).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="packing" className={CHECKLISTS_TAB_CLASS}>
            Packing
            {packingItems.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums text-foreground">
                {packingItems.filter((i) => !i.done).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="booking" className={CHECKLISTS_TAB_CLASS}>
            Booking parser
          </TabsTrigger>
        </TabsList>

        {/* ── Pre-trip tab ── */}
        <TabsContent value="pretrip">
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
        </TabsContent>

        {/* ── Packing tab ── */}
        <TabsContent value="packing">
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
        </TabsContent>

        {/* ── Booking parser tab ── */}
        <TabsContent value="booking">
          <div className="flex flex-col gap-4">
            <AiBookingParser tripId={tripId} aiConfigured={aiConfigured} />
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
