"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkerFilters } from "@/components/globe/marker-filters";
import { filterMarkers, distinctCountries } from "@/lib/globe-list";
import type { MarkerFilter } from "@/lib/globe-list";
import type { MarkerView } from "@/components/globe/types";
import { addMarkerToWishlist } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import { useServerAction } from "@/components/ui/use-server-action";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AddFromGlobeDialogProps {
  tripId: string;
  markers: MarkerView[];
  /** Marker IDs that have already been added to this trip's wishlist. */
  addedMarkerIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * When provided, only markers whose IDs are in this set are shown.
   * Used by the "+N more" suggestions path in the Wishlist board.
   */
  filterToIds?: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddFromGlobeDialog({
  tripId,
  markers,
  addedMarkerIds,
  open,
  onOpenChange,
  filterToIds,
}: AddFromGlobeDialogProps) {
  const [filter, setFilter] = React.useState<MarkerFilter>({
    category: null,
    country: null,
    query: "",
  });

  // Optimistically-added IDs within this dialog session
  const [locallyAdded, setLocallyAdded] = React.useState<Set<string>>(new Set());

  // Combined set of already-added IDs
  const addedSet = React.useMemo(
    () => new Set([...addedMarkerIds, ...locallyAdded]),
    [addedMarkerIds, locallyAdded],
  );

  // Apply filterToIds pre-filter first
  const scopedMarkers = React.useMemo(() => {
    if (!filterToIds) return markers;
    const ids = new Set(filterToIds);
    return markers.filter((m) => ids.has(m.id));
  }, [markers, filterToIds]);

  // Then apply search/category/country filter
  const visibleMarkers = React.useMemo(
    () => filterMarkers(scopedMarkers, filter),
    [scopedMarkers, filter],
  );

  const countries = React.useMemo(
    () => distinctCountries(scopedMarkers),
    [scopedMarkers],
  );

  // Stable ref to markers so onSuccess can look up the title without
  // being listed as a dependency (markers changes identity on every render).
  const markersRef = React.useRef(markers);
  React.useLayoutEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  const { run: addMarker, isPending } = useServerAction(addMarkerToWishlist, {
    onSuccess: (_result, markerId) => {
      setLocallyAdded((prev) => new Set([...prev, markerId]));
      const marker = markersRef.current.find((m) => m.id === markerId);
      toast({
        title: "Added to Wishlist",
        description: marker?.title ?? markerId,
        variant: "success",
      });
    },
    onError: (errors) =>
      toast({
        title: "Couldn't add marker",
        description: errors._form?.[0] ?? Object.values(errors)[0]?.[0],
        variant: "destructive",
      }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add from Globe</DialogTitle>
        </DialogHeader>

        {markers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Your Globe has no markers yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <MarkerFilters
              filter={filter}
              countries={countries}
              onChange={setFilter}
            />

            <div className="max-h-64 overflow-y-auto">
              <ul className="flex flex-col gap-2">
                {visibleMarkers.map((marker) => {
                  const isAdded = addedSet.has(marker.id);
                  return (
                    <li
                      key={marker.id}
                      className="flex items-center justify-between gap-3 rounded-md border-2 border-border bg-background py-1.5 pl-3 pr-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-extrabold text-foreground">
                          {marker.title}
                        </p>
                        {(marker.city ?? marker.country) && (
                          <p className="text-xs font-semibold text-muted-foreground">
                            {[marker.city, marker.country].filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>

                      {isAdded ? (
                        <span className="mr-1.5 inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-border bg-success px-2 py-0.5 text-[10px] font-extrabold leading-tight text-success-foreground">
                          <Check className="size-3" aria-hidden="true" />
                          Added
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="md"
                          aria-label={`Add ${marker.title}`}
                          onClick={() => addMarker(marker.id, tripId)}
                          disabled={isPending}
                          className="shrink-0"
                        >
                          Add
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
