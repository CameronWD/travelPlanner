"use client";

import * as React from "react";
import { Globe2, Plus } from "lucide-react";
import { addMarkerToWishlist } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import type { MarkerView } from "@/components/globe/types";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
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

  // Chips are the kit's 28px pills; on touch the hit area grows to 44px.
  const touch = "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']";

  return (
    <Card aria-label="From your Globe" role="region" className="p-3.5">
      <div className="flex items-center gap-2">
        <Globe2 className="size-4 text-coral-text" strokeWidth={2.5} aria-hidden="true" />
        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-coral-text">
          <span
            data-testid="globe-eyebrow-dot"
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-accent"
          />
          From your Globe
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {shown.map((marker) => {
          const dot = marker.category
            ? categoryAccent(marker.category as Category).dot
            : "border-2 border-border bg-muted";
          return (
            <Chip
              key={marker.id}
              size="l"
              onClick={() => handleAdd(marker)}
              disabled={pending === marker.id}
              aria-label={`Add ${marker.title}`}
              className={touch}
            >
              <span className={cn("size-2.5 shrink-0 rounded-full", dot)} aria-hidden="true" />
              {marker.title}
              <Plus aria-hidden="true" />
            </Chip>
          );
        })}
        {overflow > 0 && (
          <Chip size="l" dashed onClick={onSeeMore} className={touch}>
            +{overflow} more
          </Chip>
        )}
      </div>
    </Card>
  );
}
