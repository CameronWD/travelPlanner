"use client";

import { Globe2 } from "lucide-react";
import type { MarkerView } from "@/components/globe/types";
import { Button } from "@/components/ui/button";

export interface GlobeSuggestionsStripProps {
  suggestions: MarkerView[];
  addedMarkerIds: string[];
  onSeeMore: () => void;
}

export function GlobeSuggestionsStrip({ suggestions, addedMarkerIds, onSeeMore }: GlobeSuggestionsStripProps) {
  const added = new Set(addedMarkerIds);
  const count = suggestions.filter((m) => !added.has(m.id)).length;
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
      <Globe2 className="size-4 shrink-0 text-coral-text" strokeWidth={2.5} aria-hidden="true" />
      <span className="min-w-0">
        {count === 1
          ? "1 place from your Globe is on this route"
          : `${count} places from your Globe are on this route`}
      </span>
      <Button type="button" variant="ghost" size="sm" className="min-h-11 shrink-0" onClick={onSeeMore}>
        See them
      </Button>
    </div>
  );
}
