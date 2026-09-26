"use client";

import { groupMarkersByCountry } from "@/lib/globe-list";
import { categoryLabel } from "@/lib/categories";
import { Globe } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { RowActions } from "@/components/ui/row-actions";
import type { MarkerView } from "@/components/globe/types";
import type { AttachmentView } from "@/components/trip/attachment-list";
import { AttachmentPopover } from "@/components/trip/attachment-popover";
import { categoryAccent } from "@/components/trip/category-pill";
import { type Category } from "@/lib/categories";
import { cn } from "@/lib/cn";

export interface MarkerListProps {
  markers: MarkerView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  globeId?: string;
  attachmentsByMarkerId?: Record<string, AttachmentView[]>;
}

export function MarkerList({ markers, selectedId, onSelect, onEdit, onDelete, globeId, attachmentsByMarkerId }: MarkerListProps) {
  const groups = groupMarkersByCountry(markers);
  if (markers.length === 0) {
    return (
      <EmptyState
        icon={Globe}
        tone="teal"
        title="No markers yet"
        description="Tap the map to drop one, or add one by name."
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.country}>
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-foreground">{group.country}</h3>
            <span className="text-[11px] font-bold text-muted-foreground">{group.markers.length}</span>
          </div>
          <ul className="flex flex-col">
            {group.markers.map((mk) => {
              const isSelected = mk.id === selectedId;
              return (
                <li key={mk.id} className="flex items-center gap-1 border-t border-border-soft py-1">
                  <ListRow
                    as="button"
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => onSelect(mk.id)}
                    data-testid={`marker-row-${mk.id}`}
                    className={cn(
                      "min-w-0 flex-1 px-1.5 py-1 hover:bg-muted focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
                      isSelected && "bg-muted",
                    )}
                    leading={
                      <span
                        aria-hidden="true"
                        className={cn("size-3.5 shrink-0 rounded-full", categoryAccent(mk.category as Category).dot)}
                      />
                    }
                    title={<span className="block break-words text-sm font-extrabold text-foreground">{mk.title}</span>}
                    sub={
                      <span className="block break-words">
                        {[mk.city, categoryLabel(mk.category as never), mk.timing].filter(Boolean).join(" · ")}
                      </span>
                    }
                    trailing={false}
                  />
                  {attachmentsByMarkerId !== undefined && globeId && (
                    <AttachmentPopover
                      globeId={globeId}
                      targetType="MARKER"
                      targetId={mk.id}
                      attachments={attachmentsByMarkerId[mk.id] ?? []}
                    />
                  )}
                  <RowActions
                    onEdit={() => onEdit(mk.id)}
                    onDelete={() => onDelete(mk.id)}
                    editLabel={`Edit ${mk.title}`}
                    deleteLabel={`Delete ${mk.title}`}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
