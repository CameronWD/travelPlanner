import * as React from "react";
import { Pencil, Trash2, ArrowRight, Clock, StickyNote } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { TRANSPORT_MODE_META, durationMinutes, formatDuration } from "@/lib/transport";
import type { TransportMode } from "@/lib/enums";

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
}

interface TransportCardProps {
  transport: TransportCardTransport;
  isPending?: boolean;
  onEdit?: (t: TransportCardTransport) => void;
  onDelete?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatInstant(dt: Date | null | undefined, timezone?: string | null): string | null {
  if (!dt) return null;
  try {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone ?? "UTC",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(dt);
  } catch {
    return new Intl.DateTimeFormat("en-AU", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(dt);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransportCard({
  transport: t,
  isPending = false,
  onEdit,
  onDelete,
}: TransportCardProps) {
  const meta = TRANSPORT_MODE_META[t.mode];
  const Icon = meta.icon;

  const fromLabel = t.fromStopName ?? t.depPlace ?? null;
  const toLabel = t.toStopName ?? t.arrPlace ?? null;

  const depTimeStr = formatInstant(t.depAt, t.fromStopTimezone);
  const arrTimeStr = formatInstant(t.arrAt, t.toStopTimezone);

  const mins = durationMinutes(t.depAt, t.arrAt);
  const duration = mins !== null ? formatDuration(mins) : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card/60 px-4 py-3 shadow-soft transition-shadow hover:shadow-soft-lg",
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
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={isPending}
            onClick={() => onEdit?.(t)}
            aria-label="Edit transport"
            title="Edit"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isPending}
            onClick={() => onDelete?.(t.id)}
            aria-label="Delete transport"
            title="Delete"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Times row */}
      {(depTimeStr || arrTimeStr || duration) && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {depTimeStr && (
            <span>
              <span className="font-medium text-foreground/70">dep</span>{" "}
              {depTimeStr}
            </span>
          )}
          {arrTimeStr && (
            <span>
              <span className="font-medium text-foreground/70">arr</span>{" "}
              {arrTimeStr}
            </span>
          )}
          {duration && (
            <div className="flex items-center gap-1">
              <Clock className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{duration}</span>
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
    </div>
  );
}
