"use client";

import { ChevronRight } from "lucide-react";
import { Checklist, type ChecklistItemRow, type ChecklistMoveTarget } from "@/components/trip/checklist";
import { SectionHeader } from "@/components/ui/section-header";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import type { PackingRow, PackingSections } from "@/lib/packing-sections";
import { travellerName } from "@/lib/traveller";

function toChecklistRows(rows: PackingRow[]): ChecklistItemRow[] {
  return rows.map((r) => ({ ...r, kind: "PACKING" }));
}

export function PackingList({
  tripId,
  sections,
  viewerId,
  open,
}: {
  tripId: string;
  sections: PackingSections;
  viewerId: string;
  open: boolean;
}) {
  const moveTargets: ChecklistMoveTarget[] = [
    { to: "SHARED", label: "Move to Shared" },
    { to: viewerId, label: "Move to me" },
    ...(open
      ? sections.others.map((o) => ({ to: o.traveller.id, label: `Move to ${travellerName(o.traveller)}` }))
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionHeader title="Mine" />
        <Checklist
          tripId={tripId}
          kind="PACKING"
          items={toChecklistRows(sections.mine)}
          showDueDate={false}
          showAssignee={false}
          addOwner={viewerId}
          addLabel="Add to your list"
          moveTargets={moveTargets}
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Shared" />
        <Checklist
          tripId={tripId}
          kind="PACKING"
          items={toChecklistRows(sections.shared)}
          showDueDate={false}
          showAssignee={false}
          addOwner="SHARED"
          addLabel="Add to Shared"
          showPackedBy
          moveTargets={moveTargets}
          emptyState={null}
        />
      </section>

      {sections.others.map(({ traveller, items }) => {
        const name = travellerName(traveller);
        return (
          <details key={traveller.id} className="group rounded-xl border-2 border-border-soft px-3 py-2">
            <summary className="tap-target flex cursor-pointer list-none items-center gap-2">
              <ChevronRight
                className="size-4 shrink-0 transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
              <TravellerAvatar traveller={traveller} size={24} />
              <h3 className="font-display text-base font-semibold text-foreground">{name}</h3>
              <span className="text-xs text-muted-foreground">({items.length})</span>
            </summary>
            <div className="mt-3">
              <Checklist
                tripId={tripId}
                kind="PACKING"
                items={toChecklistRows(items)}
                showDueDate={false}
                showAssignee={false}
                addOwner={traveller.id}
                addLabel={`Add to ${name}'s list`}
                readOnly
                emptyState={null}
              />
            </div>
          </details>
        );
      })}
    </div>
  );
}
