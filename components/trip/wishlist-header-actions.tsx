"use client";

import * as React from "react";
import { Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddItemButton, type StopOption } from "./item-form-dialog";
import { AddFromGlobeDialog } from "./add-from-globe-dialog";
import type { MarkerView } from "@/components/globe/types";

export interface WishlistHeaderActionsProps {
  tripId: string;
  stops: StopOption[];
  tripStartDate?: string | null;
  homeCurrency: string;
  /** Whether the viewing user belongs to a Globe (controls "Add from Globe"). */
  hasGlobe: boolean;
  /** All Markers on the viewer's Globe (for the browser dialog). */
  globeMarkers: MarkerView[];
  /** Marker ids already pulled into this trip's wishlist. */
  addedMarkerIds: string[];
  /** False when the board is empty — its own EmptyState carries the one add there. */
  showAdd: boolean;
}

/**
 * The Wishlist PageHeader's `actions` (AUDIT.md, Task 22): "Add from Globe"
 * (outline) then the ink "+ Add an idea" — pulled out of WishlistBoard's own
 * header, which no longer renders either.
 */
export function WishlistHeaderActions({
  tripId,
  stops,
  tripStartDate,
  homeCurrency,
  hasGlobe,
  globeMarkers,
  addedMarkerIds,
  showAdd,
}: WishlistHeaderActionsProps) {
  const [globeOpen, setGlobeOpen] = React.useState(false);

  return (
    <>
      {hasGlobe && (
        <Button type="button" variant="outline" size="md" onClick={() => setGlobeOpen(true)}>
          <Globe2 aria-hidden="true" />
          Add from Globe
        </Button>
      )}
      {showAdd && (
        <AddItemButton
          tripId={tripId}
          stops={stops}
          tripStartDate={tripStartDate ?? undefined}
          defaultUnscheduled
          homeCurrency={homeCurrency}
          label="Add an idea"
          variant="primary"
          size="md"
        />
      )}
      {hasGlobe && (
        <AddFromGlobeDialog
          tripId={tripId}
          markers={globeMarkers}
          addedMarkerIds={addedMarkerIds}
          open={globeOpen}
          onOpenChange={setGlobeOpen}
        />
      )}
    </>
  );
}
