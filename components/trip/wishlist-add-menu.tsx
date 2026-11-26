"use client";

import * as React from "react";
import { ChevronDown, Globe2, Plus, Sparkles, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ItemFormDialog, type StopOption } from "./item-form-dialog";
import { AddFromGlobeDialog } from "./add-from-globe-dialog";
import { AiActivitySuggestions } from "./ai-activity-suggestions";
import type { MarkerView } from "@/components/globe/types";

export interface WishlistAddMenuProps {
  tripId: string;
  stops: StopOption[];
  tripStartDate?: string | null;
  homeCurrency?: string;
  hasGlobe: boolean;
  globeMarkers: MarkerView[];
  addedMarkerIds: string[];
  aiConfigured: boolean;
  variant?: "primary" | "secondary";
  className?: string;
}

export function WishlistAddMenu({
  tripId,
  stops,
  tripStartDate,
  homeCurrency,
  hasGlobe,
  globeMarkers,
  addedMarkerIds,
  aiConfigured,
  variant = "primary",
  className,
}: WishlistAddMenuProps) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [globeOpen, setGlobeOpen] = React.useState(false);
  const [suggestOpen, setSuggestOpen] = React.useState(false);
  const [suggestStopId, setSuggestStopId] = React.useState("");
  const suggestStop = stops.find((s) => s.id === suggestStopId);
  const canSuggest = aiConfigured && stops.length > 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant={variant} size="md" className={className}>
            <Plus aria-hidden="true" />
            Add an idea
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="min-h-11" onSelect={() => setFormOpen(true)}>
            <Type aria-hidden="true" />
            Type it in
          </DropdownMenuItem>
          {hasGlobe && (
            <DropdownMenuItem className="min-h-11" onSelect={() => setGlobeOpen(true)}>
              <Globe2 aria-hidden="true" />
              From your Globe
            </DropdownMenuItem>
          )}
          {canSuggest && (
            <DropdownMenuItem className="min-h-11" onSelect={() => setSuggestOpen(true)}>
              <Sparkles aria-hidden="true" />
              Suggest some for a Stop
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ItemFormDialog
        tripId={tripId}
        stops={stops}
        tripStartDate={tripStartDate ?? undefined}
        defaultUnscheduled
        homeCurrency={homeCurrency}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
      {hasGlobe && (
        <AddFromGlobeDialog
          tripId={tripId}
          markers={globeMarkers}
          addedMarkerIds={addedMarkerIds}
          open={globeOpen}
          onOpenChange={setGlobeOpen}
        />
      )}
      {canSuggest && (
        <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Suggestions for a Stop</DialogTitle>
            </DialogHeader>
            <Select value={suggestStopId} onValueChange={setSuggestStopId}>
              <SelectTrigger aria-label="Stop">
                <SelectValue placeholder="Pick a Stop" />
              </SelectTrigger>
              <SelectContent>
                {stops.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suggestStop && (
              <AiActivitySuggestions
                key={suggestStop.id}
                tripId={tripId}
                stopId={suggestStop.id}
                stopName={suggestStop.name}
                aiConfigured={aiConfigured}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
