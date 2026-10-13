"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ItemFormDialog } from "@/components/trip/item-form-dialog";
import { TransportFormDialog } from "@/components/trip/transport-form-dialog";
import { HOME_ENDPOINT } from "@/components/trip/transport-endpoints";
import { dayTransportDefaults } from "@/lib/day-transport-defaults";
import { tripPath } from "@/lib/trip-path";

export type DayAddMenuProps = {
  tripId: string;
  slug: string;
  date: string;
  stop: { id: string; arriveDate: string; departDate: string } | null;
  stopOptions: Array<{ id: string; name: string; arriveDate: string | null; departDate: string | null; timezone: string | null; sortOrder: number }>;
  homeCurrency: string;
  homeBaseName: string | null;
  label: string;
  variant: "primary" | "dashed";
  size: "md";
  className?: string;
};

/**
 * The Day view's add button (spec 2026-10-13 D5–D7): a two-way menu. Something
 * to do opens the Item form with the day and its covering Stop; A flight,
 * train or drive opens the Transport form with the day-derived endpoints and
 * the departure date set.
 */
export function DayAddMenu({ tripId, slug, date, stop, stopOptions, homeCurrency, homeBaseName, label, variant, size, className }: DayAddMenuProps) {
  const [which, setWhich] = React.useState<"item" | "transport" | null>(null);
  const defaults = dayTransportDefaults(date, stop, HOME_ENDPOINT, stopOptions);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} className={className}>
            <Plus className="size-4" aria-hidden="true" />
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => setWhich("item")}>Something to do</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setWhich("transport")}>A flight, train or drive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ItemFormDialog
        tripId={tripId}
        stops={stopOptions}
        tripStartDate={date}
        defaultUnscheduled={false}
        defaultDate={date}
        defaultStopId={stop?.id ?? null}
        open={which === "item"}
        onOpenChange={(o) => {
          if (!o) setWhich(null);
        }}
        homeCurrency={homeCurrency}
      />
      {/* Mounted only while open, so its form state resets each time (as itinerary-manager does). */}
      {which === "transport" && (
        <TransportFormDialog
          tripId={tripId}
          stops={stopOptions}
          defaultFromStopId={defaults.fromStopId}
          defaultToStopId={defaults.toStopId}
          defaultAnchorStopId={stop?.id}
          defaultDate={date}
          open
          onOpenChange={(o) => {
            if (!o) setWhich(null);
          }}
          homeCurrency={homeCurrency}
          homeBaseName={homeBaseName}
          settingsHref={tripPath(slug, "/settings")}
        />
      )}
    </>
  );
}
