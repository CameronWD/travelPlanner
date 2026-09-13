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

  if (open) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          aria-expanded={true}
          onClick={() => setOpen(false)}
          className="inline-flex items-center gap-1 self-start px-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className="size-3.5 rotate-180" aria-hidden="true" />
          Collapse
        </button>
        <AccommodationCard {...props} />
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-expanded={false}
      onClick={() => setOpen(true)}
      disabled={isPending}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-sm shadow-soft transition-shadow hover:shadow-soft-lg dark:border-emerald-900 dark:bg-emerald-950/40",
        isPending && "pointer-events-none opacity-60",
      )}
    >
      <Home className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-medium text-emerald-900 dark:text-emerald-100">
        {a.name}
      </span>
      <span className="shrink-0 text-xs text-emerald-700/80 dark:text-emerald-300/80">
        {formatDateRange(a.checkIn, a.checkOut)}
      </span>
      {warnings.length > 0 && (
        <AlertTriangle
          className="size-3.5 shrink-0 text-amber-600"
          aria-label="Dates fall outside the stop"
        />
      )}
      <ChevronDown className="size-3.5 shrink-0 text-emerald-700/60 dark:text-emerald-300/60" aria-hidden="true" />
    </button>
  );
}
