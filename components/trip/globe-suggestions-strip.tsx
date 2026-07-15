"use client";

import * as React from "react";
import { Globe2, Plus } from "lucide-react";
import { addMarkerToWishlist } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import type { MarkerView } from "@/components/globe/types";
import { cn } from "@/lib/cn";
import { categoryAccent } from "./category-pill";
import type { Category } from "@/lib/categories";

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
    <section className="rounded-2xl bg-accent/10 p-3">
      <div className="flex items-center gap-2">
        <Globe2 className="size-4 text-accent" aria-hidden="true" />
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-accent">
          From your Globe
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {shown.map((marker) => {
          const dot = marker.category
            ? categoryAccent(marker.category as Category).dot
            : "bg-muted-foreground";
          return (
            <button
              key={marker.id}
              type="button"
              onClick={() => handleAdd(marker)}
              disabled={pending === marker.id}
              aria-label={`Add ${marker.title}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-soft transition-colors hover:bg-background/70 disabled:opacity-50"
            >
              <span className={cn("size-1.5 rounded-full", dot)} aria-hidden="true" />
              {marker.title}
              <Plus className="size-3" aria-hidden="true" />
            </button>
          );
        })}
        {overflow > 0 && (
          <button
            type="button"
            onClick={onSeeMore}
            className="px-1 text-xs font-semibold text-accent hover:underline"
          >
            +{overflow} more
          </button>
        )}
      </div>
    </section>
  );
}
