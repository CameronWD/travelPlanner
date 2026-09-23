import * as React from "react";
import { Calendar, Hash, StickyNote, AlertTriangle, Home } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { formatDateRange, nightsBetween } from "@/lib/dates";
import { accommodationDateWarnings } from "@/lib/validations/accommodation";
import { CostEditor } from "./cost-editor";
import { MapLink } from "./map-link";
import type { CostRow } from "@/server/actions/costs";
import type { NoteView } from "./note-thread";
import type { AttachmentView } from "./attachment-list";
import { CardActionCluster } from "./card-action-cluster";

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
  checkInTime?: string | null;
  checkOutTime?: string | null;
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
  /** Notes attached to this accommodation */
  notes?: NoteView[];
  /** Current authenticated user's ID (required for notes) */
  currentUserId?: string;
  /** Attachments for this accommodation */
  attachments?: AttachmentView[];
  /** The Plan this accommodation's costs belong to — `null`/absent is the real plan */
  forkId?: string | null;
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
  notes,
  currentUserId,
  attachments,
  forkId,
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
        "flex flex-col gap-2.5 rounded-xl border border-border bg-hue-leaf/25 px-4 py-3 shadow-soft transition-shadow hover:shadow-soft-lg",
        isPending && "opacity-60 pointer-events-none",
      )}
    >
      {/* Top row: leading icon + name + controls */}
      <div className="flex items-start gap-3">
        <Home
          className="size-4 shrink-0 mt-0.5 text-hue-leaf-text"
          aria-hidden="true"
        />
        <div className="flex flex-1 items-start justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <h4 className="font-display text-base font-semibold leading-tight text-foreground truncate">
              {a.name}
            </h4>
            {a.address && (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-foreground/80">
                {/* No decorative pin here: MapLink below renders the real one,
                    and help-legend.tsx teaches that glyph as "has a location"
                    (HG-02/HG-10). This MapLink call always has a real address
                    (this whole block is gated on a.address), so it can never
                    fire via the label-only fallback — no coordinate guard
                    needed here, unlike stop-card.tsx's country line. */}
                <span className="truncate">{a.address}</span>
                <MapLink lat={a.lat} lng={a.lng} address={a.address} label={a.name} className="ml-0.5 text-foreground/80" />
              </div>
            )}
          </div>

          <CardActionCluster
            tripId={tripId}
            targetType="ACCOMMODATION"
            targetId={a.id}
            editLabel={`Edit ${a.name}`}
            deleteLabel={`Delete ${a.name}`}
            moreLabel={`More actions for ${a.name}`}
            onEdit={onEdit ? () => onEdit(a) : undefined}
            onDelete={onDelete ? () => onDelete(a.id) : undefined}
            isPending={isPending}
            notes={notes}
            currentUserId={currentUserId}
            attachments={attachments}
          />
        </div>
      </div>

      {/* Dates + nights */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/80">
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
        <div className="flex items-center gap-1.5 text-xs text-foreground/80">
          <Hash className="size-3 shrink-0" aria-hidden="true" />
          <span className="font-mono">{a.confirmation}</span>
          <span className="font-semibold text-foreground">· Confirmed</span>
        </div>
      )}

      {/* Notes */}
      {a.notes && (
        <div className="flex items-start gap-1.5 text-xs text-foreground/80">
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
        <div className="border-t border-border/60 pt-2">
          <CostEditor
            tripId={tripId}
            ownerType="ACCOMMODATION"
            ownerId={a.id}
            costs={costs}
            homeCurrency={homeCurrency}
            defaultCurrency={homeCurrency}
            forkId={forkId}
          />
        </div>
      )}
    </div>
  );
}
