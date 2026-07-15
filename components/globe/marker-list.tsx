"use client";

import { groupMarkersByCountry } from "@/lib/globe-list";
import { categoryLabel } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
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
    return <p className="text-sm text-muted-foreground">No markers yet.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.country}>
          <div className="mb-1 flex items-center gap-2">
            <h3 className="font-display text-[13px] font-bold text-foreground">{group.country}</h3>
            <span className="text-[11px] text-muted-foreground">{group.markers.length}</span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {group.markers.map((mk) => {
              const isSelected = mk.id === selectedId;
              return (
                <li key={mk.id}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => onSelect(mk.id)}
                      data-testid={`marker-row-${mk.id}`}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        isSelected && "bg-primary/5 rounded-xl"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn("inline-block size-2.5 shrink-0 rounded-full", categoryAccent(mk.category as Category).dot)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {mk.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[mk.city, categoryLabel(mk.category as never), mk.timing]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
                    {attachmentsByMarkerId !== undefined && globeId && (
                      <AttachmentPopover
                        globeId={globeId}
                        targetType="MARKER"
                        targetId={mk.id}
                        attachments={attachmentsByMarkerId[mk.id] ?? []}
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label={`Edit ${mk.title}`}
                      onClick={() => onEdit(mk.id)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-destructive"
                      aria-label={`Delete ${mk.title}`}
                      onClick={() => onDelete(mk.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
