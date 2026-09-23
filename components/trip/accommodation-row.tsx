"use client";

import * as React from "react";
import { ChevronDown, Home, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDateRange } from "@/lib/dates";
import { accommodationDateWarnings } from "@/lib/validations/accommodation";
import {
  AccommodationCard,
  type AccommodationCardAccommodation,
  type AccommodationCardStop,
} from "./accommodation-card";
import type { CostRow } from "@/server/actions/costs";
import type { NoteView } from "./note-thread";
import type { AttachmentView } from "./attachment-list";

export interface AccommodationRowProps {
  accommodation: AccommodationCardAccommodation;
  stop: AccommodationCardStop;
  isPending?: boolean;
  onEdit?: (a: AccommodationCardAccommodation) => void;
  onDelete?: (id: string) => void;
  costs?: CostRow[];
  tripId?: string;
  homeCurrency?: string;
  notes?: NoteView[];
  currentUserId?: string;
  attachments?: AttachmentView[];
  forkId?: string | null;
}

/**
 * Collapsed one-line accommodation row for the compact plan editor (grilling
 * 2026-09-13, Q5: b). Expands in place to the full AccommodationCard; the
 * expanded card is unchanged, so all editing/cost/notes affordances live there.
 */
export function AccommodationRow(props: AccommodationRowProps) {
  const { accommodation: a, stop, isPending = false } = props;
  const [open, setOpen] = React.useState(false);
  const warnings = accommodationDateWarnings(
    { checkIn: a.checkIn, checkOut: a.checkOut },
    stop,
  );

  // A single persistent toggle button carries aria-expanded and identity
  // across both states, so focus stays put across the toggle instead of
  // dropping to <body> when the collapsed control used to unmount.
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        disabled={isPending}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border border-border bg-hue-leaf/25 px-3 py-2 text-left text-sm shadow-soft transition-shadow hover:shadow-soft-lg",
          isPending && "pointer-events-none opacity-60",
        )}
      >
        <Home className="size-4 shrink-0 text-hue-leaf-text" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium text-hue-leaf-text">
          {a.name}
        </span>
        <span className="shrink-0 text-xs text-hue-leaf-text/80">
          {formatDateRange(a.checkIn, a.checkOut)}
        </span>
        {warnings.length > 0 && (
          <AlertTriangle
            className="size-3.5 shrink-0 text-sun-text"
            aria-label="Dates fall outside the stop"
          />
        )}
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-hue-leaf-text/60 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open && <AccommodationCard {...props} />}
    </div>
  );
}
