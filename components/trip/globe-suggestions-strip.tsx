"use client";

import * as React from "react";
import { Globe2, Plus } from "lucide-react";
import { addMarkerToWishlist } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import type { MarkerView } from "@/components/globe/types";

const SUGGESTIONS_CAP = 5;

export interface GlobeSuggestionsStripProps {
  tripId: string;
  suggestions: MarkerView[];
  addedMarkerIds: string[];
  onSeeMore: () => void;
}

export function GlobeSuggestionsStrip({
  tripId,
  suggestions,
  addedMarkerIds,
  onSeeMore,
}: GlobeSuggestionsStripProps) {
  const [justAdded, setJustAdded] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState<string | null>(null);

  const added = React.useMemo(
    () => new Set([...addedMarkerIds, ...justAdded]),
    [addedMarkerIds, justAdded],
  );

  // Exclude anything added since render; then cap.
  const visible = suggestions.filter((m) => !added.has(m.id));
  if (visible.length === 0) return null;

  const shown = visible.slice(0, SUGGESTIONS_CAP);
  const overflow = visible.length - shown.length;

  async function handleAdd(marker: MarkerView) {
    setPending(marker.id);
    try {
      const result = await addMarkerToWishlist(marker.id, tripId);
      if (result.success) {
        setJustAdded((prev) => new Set(prev).add(marker.id));
        toast({ title: "Added to Wishlist", description: marker.title, variant: "success" });
      } else {
        const firstError = Object.values(result.errors)[0]?.[0];
        toast({ variant: "destructive", title: "Couldn't add", description: firstError });
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Globe2 className="size-4 text-primary" aria-hidden="true" />
        <h3 className="font-display text-base font-semibold text-foreground">
          Suggested from your Globe
        </h3>
      </div>
      <ul className="flex flex-col gap-2">
        {shown.map((marker) => (
          <li
            key={marker.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
          >
            <div className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">
                {marker.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {marker.city ?? marker.country}
              </span>
            </div>
            <button
              type="button"
              aria-label={`Add ${marker.title}`}
              disabled={pending === marker.id}
              onClick={() => handleAdd(marker)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="size-3.5" aria-hidden="true" /> Add
            </button>
          </li>
        ))}
      </ul>
      {overflow > 0 && (
        <button
          type="button"
          onClick={onSeeMore}
          className="mt-3 text-xs font-medium text-primary hover:underline"
        >
          +{overflow} more from your Globe
        </button>
      )}
    </section>
  );
}
