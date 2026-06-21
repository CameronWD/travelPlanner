import * as React from "react";
import { MapPin, Pencil, Trash2, Calendar, Hash, StickyNote, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateRange, nightsBetween } from "@/lib/dates";
import { accommodationDateWarnings } from "@/lib/validations/accommodation";
import { CostEditor } from "./cost-editor";
import type { CostRow } from "@/server/actions/costs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccommodationCardAccommodation {
  id: string;
  stopId: string;
  name: string;
  address?: string | null;
  checkIn: string;
  checkOut: string;
  confirmation?: string | null;
  notes?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface AccommodationCardStop {
  arriveDate: string;
  departDate: string;
}

interface AccommodationCardProps {
  accommodation: AccommodationCardAccommodation;
  stop: AccommodationCardStop;
  isPending?: boolean;
  onEdit?: (a: AccommodationCardAccommodation) => void;
  onDelete?: (id: string) => void;
  /** Costs attached to this accommodation */
  costs?: CostRow[];
  /** Trip ID (required when costs are provided) */
  tripId?: string;
  /** Trip's home currency */
  homeCurrency?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccommodationCard({
  accommodation: a,
  stop,
  isPending = false,
  onEdit,
  onDelete,
  costs,
  tripId,
  homeCurrency,
}: AccommodationCardProps) {
  const nights = nightsBetween(a.checkIn, a.checkOut);
  const dateRange = formatDateRange(a.checkIn, a.checkOut);
  const warnings = accommodationDateWarnings(
    { checkIn: a.checkIn, checkOut: a.checkOut },
    stop,
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 transition-shadow hover:shadow-soft",
        isPending && "opacity-60 pointer-events-none",
      )}
    >
      {/* Top row: name + controls */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-display text-base font-semibold leading-tight text-foreground truncate">
            {a.name}
          </h4>
          {a.address && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{a.address}</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={isPending}
            onClick={() => onEdit?.(a)}
            aria-label={`Edit ${a.name}`}
            title="Edit"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isPending}
            onClick={() => onDelete?.(a.id)}
            aria-label={`Delete ${a.name}`}
            title="Delete"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Dates + nights */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{dateRange}</span>
        </div>
        <span>
          {nights === 0 ? "Same-day" : `${nights} ${nights === 1 ? "night" : "nights"}`}
        </span>
      </div>

      {/* Confirmation */}
      {a.confirmation && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Hash className="size-3 shrink-0" aria-hidden="true" />
          <span className="font-mono">{a.confirmation}</span>
        </div>
      )}

      {/* Notes */}
      {a.notes && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <StickyNote className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="line-clamp-2">{a.notes}</p>
        </div>
      )}

      {/* Soft warnings */}
      {warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          {warnings.map((w) => (
            <Badge
              key={w}
              variant="warning"
              className="flex w-fit items-center gap-1 text-xs"
            >
              <AlertTriangle className="size-3" aria-hidden="true" />
              {w}
            </Badge>
          ))}
        </div>
      )}

      {/* Costs */}
      {costs !== undefined && tripId && (
        <div className="border-t border-border/40 pt-2">
          <CostEditor
            tripId={tripId}
            ownerType="ACCOMMODATION"
            ownerId={a.id}
            costs={costs}
            homeCurrency={homeCurrency}
            defaultCurrency={homeCurrency}
          />
        </div>
      )}
    </div>
  );
}
