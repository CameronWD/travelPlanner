import * as React from "react";
import { ArrowRight, Clock, StickyNote } from "lucide-react";
import { cn } from "@/lib/cn";
import { RowActions } from "@/components/ui/row-actions";
import { TRANSPORT_MODE_META, durationMinutes, formatDuration } from "@/lib/transport";
import type { TransportMode } from "@/lib/enums";
import { transportTimeDisplay, shortDate, dayDeltaSuffix } from "@/lib/time-display";
import { CostEditor } from "./cost-editor";
import type { CostRow } from "@/server/actions/costs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransportCardTransport {
  id: string;
  mode: TransportMode;
  fromStopId?: string | null;
  toStopId?: string | null;
  depPlace?: string | null;
  arrPlace?: string | null;
  depAt?: Date | null;
  arrAt?: Date | null;
  reference?: string | null;
  notes?: string | null;
  sortOrder: number;
  /** Resolved name of the fromStop (if linked) */
  fromStopName?: string | null;
  /** Resolved name of the toStop (if linked) */
  toStopName?: string | null;
  /** IANA timezone of fromStop (used for dep time display) */
  fromStopTimezone?: string | null;
  /** IANA timezone of toStop (used for arr time display) */
  toStopTimezone?: string | null;
  /** Precomputed offline drive estimate; present only for Car legs without real times. */
  driveEstimate?: { minutes: number; roadKm: number } | null;
}

interface TransportCardProps {
  transport: TransportCardTransport;
  isPending?: boolean;
  onEdit?: (t: TransportCardTransport) => void;
  onDelete?: (id: string) => void;
  /** Costs attached to this transport */
  costs?: CostRow[];
  /** Trip ID (required when costs are provided) */
  tripId?: string;
  /** Trip's home currency */
  homeCurrency?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransportCard({
  transport: t,
  isPending = false,
  onEdit,
  onDelete,
  costs,
  tripId,
  homeCurrency,
}: TransportCardProps) {
  const meta = TRANSPORT_MODE_META[t.mode];
  const Icon = meta.icon;

  const fromLabel = t.fromStopName ?? t.depPlace ?? null;
  const toLabel = t.toStopName ?? t.arrPlace ?? null;

  const td = transportTimeDisplay({
    depAt: t.depAt, arrAt: t.arrAt, fromTimezone: t.fromStopTimezone, toTimezone: t.toStopTimezone,
  });

  const mins = durationMinutes(t.depAt, t.arrAt);
  const duration = mins !== null ? formatDuration(mins) : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border border-border bg-card px-4 py-3 shadow-soft transition-shadow hover:shadow-soft-lg",
        isPending && "opacity-60 pointer-events-none",
      )}
    >
      {/* Top row: mode icon + label + from→to + controls */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {/* Mode */}
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{meta.label}</span>
            {t.reference && (
              <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                {t.reference}
              </span>
            )}
          </div>

          {/* From → To */}
          {(fromLabel || toLabel) && (
            <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              {fromLabel && <span className="font-medium text-foreground">{fromLabel}</span>}
              {fromLabel && toLabel && (
                <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              {toLabel && <span className="font-medium text-foreground">{toLabel}</span>}
            </div>
          )}
        </div>

        {/* Controls */}
        <RowActions
          onEdit={onEdit ? () => onEdit(t) : undefined}
          onDelete={onDelete ? () => onDelete(t.id) : undefined}
          editLabel="Edit Transport"
          deleteLabel="Delete Transport"
          disabled={isPending}
        />
      </div>

      {/* Times row */}
      {(td.dep || td.arr || duration || (!duration && t.driveEstimate)) && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {td.dep && (
            <span>
              <span className="font-medium text-foreground/70">dep</span>{" "}
              {shortDate(td.dep.dateISO)} {td.dep.time}{" "}
              <abbr title={t.fromStopTimezone ?? "Time zone unknown"} className="no-underline text-foreground/60">{td.dep.zone}</abbr>
            </span>
          )}
          {td.arr && (
            <span>
              <span className="font-medium text-foreground/70">arr</span>{" "}
              {td.arr.time}{" "}
              <abbr title={t.toStopTimezone ?? "Time zone unknown"} className="no-underline text-foreground/60">{td.arr.zone}</abbr>
              {dayDeltaSuffix(td.dayDelta)}
            </span>
          )}
          {duration && (
            <div className="flex items-center gap-1">
              <Clock className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{duration}</span>
            </div>
          )}
          {!duration && t.driveEstimate && (
            <div className="flex items-center gap-1" title="Rough offline estimate">
              <Clock className="size-3.5 shrink-0" aria-hidden="true" />
              <span>≈ {formatDuration(t.driveEstimate.minutes)} · ~{t.driveEstimate.roadKm} km</span>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {t.notes && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <StickyNote className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="line-clamp-2">{t.notes}</p>
        </div>
      )}

      {/* Costs */}
      {costs !== undefined && tripId && (
        <div className="border-t border-border/40 pt-2">
          <CostEditor
            tripId={tripId}
            ownerType="TRANSPORT"
            ownerId={t.id}
            costs={costs}
            homeCurrency={homeCurrency}
            defaultCurrency={homeCurrency}
          />
        </div>
      )}
    </div>
  );
}
