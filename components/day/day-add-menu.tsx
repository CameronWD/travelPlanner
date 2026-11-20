"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DragSheetContent } from "@/components/plan/drag-sheet-content";
import { useMediaQuery } from "@/components/ui/use-media-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ItemFormDialog } from "@/components/trip/item-form-dialog";
import { TransportFormDialog } from "@/components/trip/transport-form-dialog";
import { HOME_ENDPOINT } from "@/components/trip/transport-endpoints";
import { dayTransportDefaults } from "@/lib/day-transport-defaults";
import { tripPath } from "@/lib/trip-path";
import { recordUsageAction } from "@/lib/usage/client";

export type DayAddMenuProps = {
  tripId: string;
  slug: string;
  date: string;
  stop: { id: string; arriveDate: string; departDate: string } | null;
  stopOptions: Array<{ id: string; name: string; arriveDate: string | null; departDate: string | null; timezone: string | null; sortOrder: number; lat?: number | null; lng?: number | null }>;
  homeCurrency: string;
  homeBaseName: string | null;
  homeTimezone?: string | null;
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
export function DayAddMenu({ tripId, slug, date, stop, stopOptions, homeCurrency, homeBaseName, homeTimezone, label, variant, size, className }: DayAddMenuProps) {
  const [which, setWhich] = React.useState<"item" | "transport" | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const picked = React.useRef(false);
  const wide = useMediaQuery("(min-width: 768px)");
  const defaults = dayTransportDefaults(date, stop, HOME_ENDPOINT, stopOptions);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const closeForm = () => {
    setWhich(null);
    if (wide === false) setTimeout(() => triggerRef.current?.focus(), 50);
  };
  const trigger = (
    <Button ref={triggerRef} variant={variant} size={size} className={className}>
      <Plus className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
  const pick = (next: "item" | "transport") => {
    picked.current = true;
    setSheetOpen(false);
    setWhich(next);
  };
  const rowClass = "flex min-h-12 w-full items-center gap-3 px-3.5 text-left text-sm font-bold";
  return (
    <>
      {wide === false ? (
        <Sheet
          open={sheetOpen}
          onOpenChange={(o) => {
            if (o) {
              picked.current = false;
              recordUsageAction("add-to-day-opened");
            }
            setSheetOpen(o);
          }}
        >
          <SheetTrigger asChild>{trigger}</SheetTrigger>
          <DragSheetContent
            hideCloseIcon
            onDismiss={() => setSheetOpen(false)}
            onCloseAutoFocus={(e) => {
              if (picked.current) e.preventDefault();
            }}
          >
            <SheetTitle className="font-display text-[28px] leading-none">{label}</SheetTitle>
            <div role="group" aria-label="What to add" className="flex flex-col divide-y-2 divide-muted overflow-hidden rounded-[14px] border-2 border-border bg-card">
              <button type="button" onClick={() => pick("item")} className={rowClass}>
                Something to do
              </button>
              <button type="button" onClick={() => pick("transport")} className={rowClass}>
                A flight, train or drive
              </button>
            </div>
          </DragSheetContent>
        </Sheet>
      ) : (
        <DropdownMenu
          onOpenChange={(o) => {
            if (o) recordUsageAction("add-to-day-opened");
          }}
        >
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setWhich("item")}>Something to do</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setWhich("transport")}>A flight, train or drive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ItemFormDialog
        tripId={tripId}
        stops={stopOptions}
        tripStartDate={date}
        defaultUnscheduled={false}
        defaultDate={date}
        defaultStopId={stop?.id ?? null}
        open={which === "item"}
        onOpenChange={(o) => {
          if (!o) closeForm();
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
            if (!o) closeForm();
          }}
          homeCurrency={homeCurrency}
          homeBaseName={homeBaseName}
          homeTimezone={homeTimezone}
          settingsHref={tripPath(slug, "/settings")}
        />
      )}
    </>
  );
}
