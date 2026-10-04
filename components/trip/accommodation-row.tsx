"use client";

import * as React from "react";
import { ChevronDown, Home, AlertTriangle, Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatCheckTimes, formatDateRange } from "@/lib/dates";
import { costPaidState } from "@/lib/plan/plan-model";
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
  /** Start expanded — the stay panel opens the stay dialog on the block clicked (spec 2026-10-04 §B). */
  defaultOpen?: boolean;
}

/**
 * Collapsed one-line accommodation row for the compact plan editor (grilling
 * 2026-09-13, Q5: b). Expands in place: the full AccommodationCard renders
 * `embedded` inside the row's own bordered wrapper, below a dotted rule, so
 * the expansion reads as one tile rather than a second card. All editing/
 * cost/notes affordances still live in the card.
 */
export function AccommodationRow(props: AccommodationRowProps) {
  const { accommodation: a, stop, isPending = false, costs, defaultOpen = false } = props;
  // Paid state at a glance (shared with the stay panel): "paid ✓" once any
  // cost is marked paid, "unpaid" while costs exist but none is.
  const paidState = costPaidState(costs);
  const times = formatCheckTimes(a.checkInTime, a.checkOutTime);
  const [open, setOpen] = React.useState(defaultOpen);
  const warnings = accommodationDateWarnings(
    { checkIn: a.checkIn, checkOut: a.checkOut },
    stop,
  );

  // A single persistent toggle button carries aria-expanded and identity
  // across both states, so focus stays put across the toggle instead of
  // dropping to <body> when the collapsed control used to unmount.
  return (
    <div
      data-testid="accommodation-row"
      className="rounded-xl border border-border bg-hue-lilac/25"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        disabled={isPending}
        className={cn(
          // Below sm: two lines — name + chevron, then dates + badges — so a
          // long name never gets squeezed to one letter per line by the
          // fixed-width siblings (spec 2026-09-28 D7). From sm: one line.
          "flex w-full flex-col gap-1 px-3 py-2 text-left text-sm transition-colors hover:bg-hue-lilac/20 sm:flex-row sm:items-center sm:gap-2",
          isPending && "pointer-events-none opacity-60",
        )}
      >
        <span data-slot="accommodation-row-line-1" className="flex min-w-0 items-center gap-2 sm:contents">
          <Home className="size-4 shrink-0 text-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">{a.name}</span>
          <ChevronDown
            className={cn("size-3.5 shrink-0 text-foreground/80 transition-transform sm:hidden", open && "rotate-180")}
            aria-hidden="true"
          />
        </span>
        <span data-slot="accommodation-row-line-2" className="flex min-w-0 flex-wrap items-center gap-2 pl-6 sm:contents">
          <span className="shrink-0 text-xs text-foreground/80">{formatDateRange(a.checkIn, a.checkOut)}</span>
          {times && <span className="shrink-0 text-xs text-foreground/80">{times}</span>}
          {a.confirmation && (
            <span
              className="hidden shrink-0 items-center gap-1 font-mono text-xs text-foreground/80 sm:inline-flex"
              aria-label={`Confirmation ${a.confirmation}`}
            >
              <Hash className="size-3" aria-hidden="true" />
              {a.confirmation}
            </span>
          )}
          {paidState === "paid" && (
            <Badge variant="teal" className="shrink-0">
              paid ✓
            </Badge>
          )}
          {paidState === "unpaid" && (
            <Badge variant="muted" className="shrink-0">
              unpaid
            </Badge>
          )}
          {warnings.length > 0 && (
            <AlertTriangle className="size-3.5 shrink-0 text-sun-text" aria-label="Dates fall outside the stop" />
          )}
          <ChevronDown
            className={cn("hidden size-3.5 shrink-0 text-foreground/80 transition-transform sm:block", open && "rotate-180")}
            aria-hidden="true"
          />
        </span>
      </button>
      {open && (
        <div className="border-t border-dotted border-border">
          <AccommodationCard {...props} embedded />
        </div>
      )}
    </div>
  );
}
