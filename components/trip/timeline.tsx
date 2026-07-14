import * as React from "react";
import {
  Clock,
  ArrowRight,
  LogIn,
  LogOut,
  Hash,
  Navigation,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { CategoryPill, categoryAccent } from "./category-pill";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import type {
  DayPlan,
  TransportDepartureEntry,
  TransportArrivalEntry,
  AccommodationCheckinEntry,
  AccommodationCheckoutEntry,
  ItemEntry,
} from "@/lib/itinerary";
import type { Category } from "@/lib/categories";
import type { TransportMode } from "@/lib/enums";
import { AttachmentLinks } from "@/components/trip/attachment-links";
import type { AttachmentView } from "@/components/trip/attachment-list";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ItemDirections {
  google: string | null;
  apple: string | null;
}

export interface TimelineProps {
  day: DayPlan;
  /**
   * "agenda" — compact one-liner rows suitable for the calendar overview.
   * "day"    — detailed rows with more whitespace and metadata.
   */
  variant?: "agenda" | "day";
  /**
   * Optional per-item directions URLs keyed by item id.
   * When present and at least one url is non-null, a small "Directions" link
   * is rendered next to that item. When absent or both urls null, nothing is
   * rendered for that item.
   */
  itemDirections?: Record<string, ItemDirections>;
  /**
   * Optional attachments keyed by entity id (transport, accommodation, item).
   * When present, each row renders its associated attachments as paperclip links.
   * Absent in the agenda variant — the prop is optional so calendar stays unaffected.
   */
  attachmentsByTarget?: Record<string, AttachmentView[]>;
}

// ---------------------------------------------------------------------------
// Timeline component
// ---------------------------------------------------------------------------

export function Timeline({ day, variant = "agenda", itemDirections, attachmentsByTarget }: TimelineProps) {
  const isDay = variant === "day";

  const hasAnything =
    day.timedItems.length > 0 ||
    day.untimedItems.length > 0 ||
    day.transportEntries.length > 0 ||
    day.accommodationEntries.length > 0;

  if (!hasAnything) {
    return (
      <p className="py-2 text-sm text-muted-foreground italic">
        Nothing planned.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col", isDay ? "gap-3" : "gap-1.5")}>
      {/* Accommodation check-ins (shown first as they set the context) */}
      {day.accommodationEntries
        .filter((e) => e.kind === "accommodation-checkin")
        .map((e) => (
          <AccomCheckinRow key={`ci-${e.accommodation.id}`} entry={e} isDay={isDay} attachments={attachmentsByTarget?.[e.accommodation.id] ?? []} />
        ))}

      {/* Timed entries: transport departures/arrivals interleaved with timed items */}
      {/* We render them in two groups — transport first for departure context, then timed items */}
      {day.transportEntries.map((e) => (
        <TransportRow key={`tr-${e.transport.id}-${e.kind}`} entry={e} isDay={isDay} attachments={attachmentsByTarget?.[e.transport.id] ?? []} />
      ))}

      {day.timedItems.map((e) => (
        <TimedItemRow
          key={`ti-${e.item.id}`}
          entry={e}
          isDay={isDay}
          directions={itemDirections?.[e.item.id]}
          attachments={attachmentsByTarget?.[e.item.id] ?? []}
        />
      ))}

      {/* Accommodation check-outs */}
      {day.accommodationEntries
        .filter((e) => e.kind === "accommodation-checkout")
        .map((e) => (
          <AccomCheckoutRow key={`co-${e.accommodation.id}`} entry={e} isDay={isDay} attachments={attachmentsByTarget?.[e.accommodation.id] ?? []} />
        ))}

      {/* Untimed items */}
      {day.untimedItems.length > 0 && (
        <div className={cn("flex flex-col", isDay ? "gap-2 mt-1" : "gap-1")}>
          <p className="text-xs sm:text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mt-1">
            Anytime
          </p>
          {day.untimedItems.map((e) => (
            <UntimedItemRow
              key={`ui-${e.item.id}`}
              entry={e}
              isDay={isDay}
              directions={itemDirections?.[e.item.id]}
              attachments={attachmentsByTarget?.[e.item.id] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Directions link helper
// ---------------------------------------------------------------------------

function DirectionsLink({
  directions,
  label,
}: {
  directions: ItemDirections | undefined;
  label: string;
}) {
  if (!directions) return null;
  const href = directions.google ?? directions.apple;
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Directions to ${label}`}
      className="inline-flex items-center gap-1 text-primary/70 hover:text-primary transition-colors"
    >
      <Navigation className="size-3.5 shrink-0" aria-hidden="true" />
    </a>
  );
}

// ---------------------------------------------------------------------------
// Row sub-components
// ---------------------------------------------------------------------------

function TimeGutter({
  time,
  isDay,
}: {
  time?: string | null;
  isDay: boolean;
}) {
  if (!isDay) return null;
  return (
    <span className="w-9 sm:w-11 shrink-0 text-right text-xs sm:text-[11px] font-mono text-muted-foreground/80 leading-tight pt-0.5">
      {time ?? ""}
    </span>
  );
}

function TransportRow({
  entry,
  isDay,
  attachments,
}: {
  entry: TransportDepartureEntry | TransportArrivalEntry;
  isDay: boolean;
  attachments: AttachmentView[];
}) {
  const t = entry.transport;
  const meta = TRANSPORT_MODE_META[t.mode as TransportMode];
  const Icon = meta?.icon;

  const isDep = entry.kind === "transport-departure";
  const depEntry = isDep ? (entry as TransportDepartureEntry) : null;
  const arrEntry = !isDep ? (entry as TransportArrivalEntry) : null;

  const fromLabel = t.depPlace ?? null;
  const toLabel = t.arrPlace ?? null;

  // Time to show in the gutter: departure time for dep rows, arrival time for arr rows
  const gutterTime = isDep
    ? (depEntry?.depTimeLabel ?? null)
    : (arrEntry?.arrTimeLabel ?? null);

  // For same-day trips, show "dep → arr" inline
  const sameDayLabels =
    depEntry && depEntry.arrivesSameDay && depEntry.arrTimeLabel
      ? { dep: depEntry.depTimeLabel, arr: depEntry.arrTimeLabel }
      : null;

  return (
    <div
      className={cn(
        "flex items-start gap-2 px-2 py-1.5",
        isDay
          ? "rounded-2xl bg-primary/5 border border-primary/10"
          : "rounded-lg bg-transparent",
      )}
    >
      <TimeGutter time={gutterTime} isDay={isDay} />

      {/* Mode icon */}
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
        {Icon && (
          <Icon
            className={cn(
              "size-4",
              isDep ? "text-primary" : "text-muted-foreground",
            )}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1 text-sm leading-tight">
          <span
            className={cn(
              "font-medium",
              isDep ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {isDep ? "Departs" : "Arrives"} — {meta?.label ?? t.mode}
          </span>
          {t.reference && (
            <span className="rounded bg-muted px-1 py-0 text-xs sm:text-[11px] font-mono text-muted-foreground">
              {t.reference}
            </span>
          )}
          {/* Same-day time summary: "08:24 → 11:47" */}
          {sameDayLabels && (
            <span className="text-xs sm:text-[11px] font-mono text-muted-foreground">
              {sameDayLabels.dep} → {sameDayLabels.arr}
            </span>
          )}
        </div>

        {/* From → To */}
        {(fromLabel || toLabel) && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            {fromLabel && <span className="min-w-0 truncate" title={fromLabel}>{fromLabel}</span>}
            {fromLabel && toLabel && (
              <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
            )}
            {toLabel && <span className="min-w-0 truncate" title={toLabel}>{toLabel}</span>}
          </div>
        )}

        {/* Multi-day notice */}
        {isDep && depEntry && !depEntry.arrivesSameDay && depEntry.arrivalDateISO && (
          <p className="mt-0.5 text-xs sm:text-[11px] text-amber-600 dark:text-amber-400">
            Arrives {depEntry.arrivalDateISO}
          </p>
        )}
        <AttachmentLinks attachments={attachments} />
      </div>
    </div>
  );
}

function TimedItemRow({
  entry,
  isDay,
  directions,
  attachments,
}: {
  entry: ItemEntry;
  isDay: boolean;
  directions?: ItemDirections;
  attachments: AttachmentView[];
}) {
  const { item } = entry;
  const timeLabel = item.endTime
    ? `${item.startTime} – ${item.endTime}`
    : item.startTime;

  if (isDay) {
    const accent = categoryAccent(item.category as Category);
    return (
      <div className="flex items-start gap-2">
        <TimeGutter time={item.startTime} isDay={isDay} />
        <div className={cn("flex-1 rounded-2xl border-l-4 bg-card px-3 py-2.5 shadow-soft", accent.borderL)}>
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="truncate text-sm font-bold leading-tight text-foreground min-w-0"
              title={item.title}
            >
              {item.title}
            </span>
            <CategoryPill category={item.category as Category} size="sm" />
            <DirectionsLink directions={directions} label={item.title} />
          </div>
          {(timeLabel || item.address) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {timeLabel && <span>{timeLabel}</span>}
              {item.address && <span>{item.address}</span>}
            </div>
          )}
          <AttachmentLinks attachments={attachments} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 px-2 py-1">
      <TimeGutter time={item.startTime} isDay={isDay} />

      <Clock
        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50"
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="truncate text-sm font-medium leading-tight text-foreground min-w-0">
            {item.title}
          </span>
          {timeLabel && (
            <span className="text-xs sm:text-[11px] text-muted-foreground">{timeLabel}</span>
          )}
          <DirectionsLink directions={directions} label={item.title} />
        </div>
        <CategoryPill category={item.category as Category} size="sm" />
        <AttachmentLinks attachments={attachments} />
      </div>
    </div>
  );
}

function UntimedItemRow({
  entry,
  isDay,
  directions,
  attachments,
}: {
  entry: ItemEntry;
  isDay: boolean;
  directions?: ItemDirections;
  attachments: AttachmentView[];
}) {
  const { item } = entry;

  if (isDay) {
    const accent = categoryAccent(item.category as Category);
    return (
      <div className="flex items-start gap-2">
        <TimeGutter time={null} isDay={isDay} />
        <div className="flex-1 flex items-center gap-2 rounded-2xl border border-dashed border-border/70 px-3 py-2.5">
          <span
            className={cn("size-2 shrink-0 rounded-full", accent.dot)}
            aria-hidden="true"
          />
          <span
            className="truncate text-sm text-foreground/90 min-w-0"
            title={item.title}
          >
            {item.title}
          </span>
          <DirectionsLink directions={directions} label={item.title} />
          <AttachmentLinks attachments={attachments} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 px-2 py-0.5">
      <TimeGutter time={null} isDay={isDay} />
      <div className="h-1.5 w-1.5 mt-2 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-foreground/80">{item.title}</span>
          <CategoryPill category={item.category as Category} size="sm" />
          <DirectionsLink directions={directions} label={item.title} />
        </div>
        <AttachmentLinks attachments={attachments} />
      </div>
    </div>
  );
}

function AccomCheckinRow({
  entry,
  isDay,
  attachments,
}: {
  entry: AccommodationCheckinEntry;
  isDay: boolean;
  attachments: AttachmentView[];
}) {
  const { accommodation: a } = entry;
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        isDay
          ? "rounded-2xl bg-emerald-100 px-3 py-2.5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "px-2 py-1 rounded-lg",
      )}
    >
      <TimeGutter time={null} isDay={isDay} />
      <LogIn
        className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground" title={`Check-in — ${a.name}`}>
          Check-in — {a.name}
        </span>
        {isDay && a.confirmation && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Hash className="size-3 shrink-0" aria-hidden="true" />
            {a.confirmation}
          </p>
        )}
        <AttachmentLinks attachments={attachments} />
      </div>
    </div>
  );
}

function AccomCheckoutRow({
  entry,
  isDay,
  attachments,
}: {
  entry: AccommodationCheckoutEntry;
  isDay: boolean;
  attachments: AttachmentView[];
}) {
  const { accommodation: a } = entry;
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        isDay
          ? "rounded-2xl bg-rose-100 px-3 py-2.5 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
          : "px-2 py-1 rounded-lg",
      )}
    >
      <TimeGutter time={null} isDay={isDay} />
      <LogOut
        className="size-4 shrink-0 text-rose-600 dark:text-rose-400"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground" title={`Check-out — ${a.name}`}>
          Check-out — {a.name}
        </span>
        <AttachmentLinks attachments={attachments} />
      </div>
    </div>
  );
}
