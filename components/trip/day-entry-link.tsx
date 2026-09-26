"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { ItemFormDialog, type StopOption } from "@/components/trip/item-form-dialog";
import { TransportFormDialog } from "@/components/trip/transport-form-dialog";
import { AccommodationFormDialog } from "@/components/trip/accommodation-form-dialog";
import type { ItemCardItem } from "@/components/trip/item-card";
import type { TransportCardTransport } from "@/components/trip/transport-card";
import type { AccommodationCardAccommodation } from "@/components/trip/accommodation-card";
import type { CostRow } from "@/server/actions/costs";
import type { AttachmentView } from "@/components/trip/attachment-list";

export type DayEntryTarget =
  | { kind: "item"; item: ItemCardItem }
  | { kind: "transport"; transport: TransportCardTransport }
  | {
      kind: "accommodation";
      accommodation: AccommodationCardAccommodation;
      stopDateRange: { arriveDate: string; departDate: string };
    };

/** Everything the three edit dialogs need, built once by the day page and looked up by entity id. */
export interface DayEntryEditor {
  tripId: string;
  stops: (StopOption & { timezone?: string | null })[];
  homeCurrency?: string;
  homeBaseName?: string | null;
  items: Record<string, ItemCardItem>;
  transports: Record<string, TransportCardTransport>;
  accommodations: Record<
    string,
    { accommodation: AccommodationCardAccommodation; stopDateRange: { arriveDate: string; departDate: string } }
  >;
  costsByOwner: Record<string, CostRow[]>;
}

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
  const ownerId =
    target.kind === "item" ? target.item.id : target.kind === "transport" ? target.transport.id : target.accommodation.id;
  const costs = editor.costsByOwner[ownerId] ?? [];

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn(
          "min-w-0 text-left underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none",
          className,
        )}
      >
        {children}
      </button>
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
