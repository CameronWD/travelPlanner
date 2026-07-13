"use client";

import { groupMarkersByCountry } from "@/lib/globe-list";
import { categoryLabel } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import type { MarkerView } from "@/components/globe/types";

const CATEGORY_HEX: Record<string, string> = {
  SIGHTSEEING: "#0ea5e9",
  FOOD: "#f59e0b",
  ACTIVITY: "#10b981",
  NIGHTLIFE: "#8b5cf6",
  SHOPPING: "#f43f5e",
  OTHER: "#78716c",
};

export interface MarkerListProps {
  markers: MarkerView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function MarkerList({ markers, selectedId, onSelect, onEdit, onDelete }: MarkerListProps) {
  const groups = groupMarkersByCountry(markers);
  if (markers.length === 0) {
    return <p className="text-sm text-muted-foreground">No markers yet.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.country}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.country}
          </h3>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {group.markers.map((mk) => {
              const isSelected = mk.id === selectedId;
              return (
                <li key={mk.id}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => onSelect(mk.id)}
                      className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background${isSelected ? " bg-muted/60 ring-1 ring-ring ring-offset-1 ring-offset-background" : ""}`}
                    >
                      <span
                        aria-hidden
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{ background: CATEGORY_HEX[mk.category] ?? CATEGORY_HEX.OTHER }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {mk.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[mk.city, categoryLabel(mk.category as never), mk.timing]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
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
