"use client";

import { groupMarkersByCountry } from "@/lib/globe-list";
import { categoryLabel } from "@/lib/categories";
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
  onSelect: (id: string) => void;
}

export function MarkerList({ markers, onSelect }: MarkerListProps) {
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
            {group.markers.map((mk) => (
              <li key={mk.id}>
                <button
                  type="button"
                  onClick={() => onSelect(mk.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
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
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
