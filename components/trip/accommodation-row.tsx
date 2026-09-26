"use client";

import * as React from "react";
import { ChevronDown, Home, AlertTriangle, Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
 * 2026-09-13, Q5: b). Expands in place: the full AccommodationCard renders
 * `embedded` inside the row's own bordered wrapper, below a dotted rule, so
 * the expansion reads as one tile rather than a second card. All editing/
 * cost/notes affordances still live in the card.
 */
export function AccommodationRow(props: AccommodationRowProps) {
  const { accommodation: a, stop, isPending = false, costs } = props;
  // Paid state at a glance: "paid ✓" once any cost is marked paid, "unpaid"
  // while costs exist but none is, nothing when no cost is recorded.
  const paidState =
    costs && costs.length > 0
      ? costs.some((c) => c.paidAt != null)
        ? "paid"
        : "unpaid"
      : null;
  const [open, setOpen] = React.useState(false);
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
          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-hue-lilac/20",
          isPending && "pointer-events-none opacity-60",
        )}
      >
        <Home className="size-4 shrink-0 text-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 break-words font-medium text-foreground sm:truncate">
          {a.name}
        </span>
        <span className="shrink-0 text-xs text-foreground/80">
          {formatDateRange(a.checkIn, a.checkOut)}
        </span>
        {a.confirmation && (
          <span
            className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-foreground/80"
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
          <AlertTriangle
            className="size-3.5 shrink-0 text-sun-text"
            aria-label="Dates fall outside the stop"
          />
        )}
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-foreground/80 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="border-t border-dotted border-border">
          <AccommodationCard {...props} embedded />
        </div>
      )}
    </div>
  );
}
