"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { ItemFormDialog } from "@/components/trip/item-form-dialog";
import { TransportFormDialog } from "@/components/trip/transport-form-dialog";
import { AccommodationFormDialog } from "@/components/trip/accommodation-form-dialog";
import { DetailsSheet } from "@/components/trip/details-sheet";
import { accommodationDetails, itemDetails, transportDetails } from "@/lib/details-view";
import type { AttachmentView } from "@/components/trip/attachment-list";
import type {
  DayEntryEditor,
  ItemCardItem,
  TransportCardTransport,
  AccommodationCardAccommodation,
} from "@/lib/plan-entity-views";

export type { DayEntryEditor };

export type DayEntryTarget =
  | { kind: "item"; item: ItemCardItem }
  | { kind: "transport"; transport: TransportCardTransport }
  | {
      kind: "accommodation";
      accommodation: AccommodationCardAccommodation;
      stopDateRange: { arriveDate: string; departDate: string };
    };

// The edit dialogs turn from a bottom sheet into a centred dialog at sm (components/ui/dialog.tsx).
const PHONE_QUERY = "(max-width: 639px)";

interface DayEntryLinkProps {
  target: DayEntryTarget;
  editor: DayEntryEditor;
  attachments: AttachmentView[];
  className?: string;
  children: React.ReactNode;
}

/**
 * Makes a Timeline row's title a button that opens the same edit dialog the
 * plan editor uses, in place — read or edit the train, the hotel or the
 * Item without leaving the day. The day page is always the real plan, so
 * every dialog gets forkId null.
 */
export function DayEntryLink({ target, editor, attachments, className, children }: DayEntryLinkProps) {
  const [open, setOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const ownerId =
    target.kind === "item" ? target.item.id : target.kind === "transport" ? target.transport.id : target.accommodation.id;
  const costs = editor.costsByOwner[ownerId] ?? [];

  // Decided at tap time, not render, so the server and first client render agree.
  const onTap = () => (editor.readFirst && window.matchMedia(PHONE_QUERY).matches ? setSheetOpen(true) : setOpen(true));
  const view = sheetOpen
    ? target.kind === "item"
      ? itemDetails(target.item, { ...editor, attachments, costs })
      : target.kind === "transport"
        ? transportDetails(target.transport, { ...editor, attachments, costs })
        : accommodationDetails(target.accommodation, { ...editor, attachments, costs })
    : null;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onTap}
        className={cn(
          "min-w-0 text-left underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none",
          className,
        )}
      >
        {children}
      </button>
      {view && (
        <DetailsSheet
          view={view}
          open
          onOpenChange={setSheetOpen}
          onEdit={() => {
            setSheetOpen(false);
            setOpen(true);
          }}
          mode={editor.localMode ?? null}
          canEdit={!(target.kind === "item" && target.item.surprise?.youAreSurprised)}
        />
      )}
      {open && target.kind === "item" && (
        <ItemFormDialog
          tripId={editor.tripId}
          stops={editor.stops}
          item={target.item}
          open
          onOpenChange={setOpen}
          homeCurrency={editor.homeCurrency}
          costs={costs}
          attachments={attachments}
          forkId={null}
        />
      )}
      {open && target.kind === "transport" && (
        <TransportFormDialog
          tripId={editor.tripId}
          stops={editor.stops}
          transport={target.transport}
          open
          onOpenChange={setOpen}
          homeCurrency={editor.homeCurrency}
          homeBaseName={editor.homeBaseName}
          homeTimezone={editor.homeTimezone}
          costs={costs}
          attachments={attachments}
          forkId={null}
        />
      )}
      {open && target.kind === "accommodation" && (
        <AccommodationFormDialog
          tripId={editor.tripId}
          stopId={target.accommodation.stopId}
          stopDateRange={target.stopDateRange}
          accommodation={target.accommodation}
          open
          onOpenChange={setOpen}
          homeCurrency={editor.homeCurrency}
          costs={costs}
          attachments={attachments}
          forkId={null}
        />
      )}
    </>
  );
}
