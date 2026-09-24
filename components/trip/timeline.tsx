import * as React from "react";
import {
  Clock,
  ArrowRight,
  LogIn,
  LogOut,
  Hash,
  Navigation,
  CalendarDays,
  Landmark,
  Utensils,
  Footprints,
  MoonStar,
  ShoppingBag,
  TramFront,
  CircleDot,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { CategoryPill } from "./category-pill";
import { categoryClasses } from "@/lib/categories";
import { EmptyState } from "@/components/ui/empty-state";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import {
  dayHasEntries,
  orderDayEntries,
  type DayPlan,
  type TransportDepartureEntry,
  type TransportArrivalEntry,
  type AccommodationCheckinEntry,
  type AccommodationCheckoutEntry,
  type ItemEntry,
} from "@/lib/itinerary";
import { CATEGORIES, type Category } from "@/lib/categories";

const CATEGORIES_BY_VALUE = new Map<string, (typeof CATEGORIES)[number]>(CATEGORIES.map((c) => [c.value, c]));
import type { TransportMode } from "@/lib/enums";
import { AttachmentLinks } from "@/components/trip/attachment-links";
import type { AttachmentView } from "@/components/trip/attachment-list";
import { UnscheduleItemButton } from "@/components/trip/unschedule-item-button";

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
  /**
   * When true (and variant="day"), renders the Unschedule control on each
   * scheduled item row. Absent/false in the agenda variant keeps the
   * calendar overview read-only.
   */
  showUnschedule?: boolean;
}

// ---------------------------------------------------------------------------
// Timeline component
// ---------------------------------------------------------------------------

/** Timeline's "anything to show?" check — lives in lib/itinerary.ts so pure callers can share it. */
export { dayHasEntries };

export function Timeline({ day, variant = "agenda", itemDirections, attachmentsByTarget, showUnschedule }: TimelineProps) {
  const isDay = variant === "day";

  if (!dayHasEntries(day)) {
    // Day variant: the kit empty treatment. Agenda (calendar overview) keeps
    // its compact one-liner — that surface is restyled separately (Task 12b).
    return isDay ? (
      <EmptyState
        icon={CalendarDays}
        tone="sun"
        title="Nothing planned"
        description="Nothing is scheduled for this day yet."
        className="py-5"
      />
    ) : (
      <p className="py-2 text-sm text-muted-foreground italic">
        Nothing planned.
      </p>
    );
  }

  const { entries, anytime } = orderDayEntries(day);

  return (
    // Day variant: kit Days timeline — rows split by a 2px dotted rule
    // (Days.jsx / DDays.jsx day panel), no gap between rows.
    <div className={cn("flex flex-col", !isDay && "gap-1.5")}>
      {entries.map((entry) => {
        switch (entry.kind) {
          case "accommodation-checkout":
            return (
              <AccomCheckoutRow
                key={`co-${entry.accommodation.id}`}
                entry={entry}
                isDay={isDay}
                attachments={attachmentsByTarget?.[entry.accommodation.id] ?? []}
              />
            );
          case "accommodation-checkin":
            return (
              <AccomCheckinRow
                key={`ci-${entry.accommodation.id}`}
                entry={entry}
                isDay={isDay}
                attachments={attachmentsByTarget?.[entry.accommodation.id] ?? []}
              />
            );
          case "transport-departure":
          case "transport-arrival":
            return (
              <TransportRow
                key={`tr-${entry.transport.id}-${entry.kind}`}
                entry={entry}
                isDay={isDay}
                attachments={attachmentsByTarget?.[entry.transport.id] ?? []}
              />
            );
          case "item":
            return (
              <TimedItemRow
                key={`ti-${entry.item.id}`}
                entry={entry}
                isDay={isDay}
                directions={itemDirections?.[entry.item.id]}
                attachments={attachmentsByTarget?.[entry.item.id] ?? []}
                showUnschedule={showUnschedule}
              />
            );
          default:
            return null;
        }
      })}

      {/* Untimed items */}
      {anytime.length > 0 && (
        <div className={cn("flex flex-col", isDay ? "border-t-2 border-dotted border-border-soft pt-2.5 first:border-t-0 first:pt-0" : "gap-1")}>
          <p
            className={cn(
              "uppercase text-muted-foreground",
              isDay
                ? "text-[11px] font-bold tracking-[0.08em]"
                : "text-xs sm:text-[11px] font-semibold tracking-wide text-muted-foreground/70 mt-1",
            )}
          >
            Anytime
          </p>
          {anytime.map((e) => (
            <UntimedItemRow
              key={`ui-${e.item.id}`}
              entry={e}
              isDay={isDay}
              directions={itemDirections?.[e.item.id]}
              attachments={attachmentsByTarget?.[e.item.id] ?? []}
              showUnschedule={showUnschedule}
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
      className="relative inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5 pointer-coarse:after:content-['']"
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
  // Kit Days.jsx: a 44px `--type-label` column in muted ink.
  return (
    <span className="w-11 shrink-0 text-[11px] leading-7 font-bold tabular-nums text-muted-foreground">
      {time ?? ""}
    </span>
  );
}

/** Kit day-timeline row: time · 28px tile · body. Rows are split by a 2px dotted rule. */
function DayRow({
  time,
  tile,
  children,
}: {
  time?: string | null;
  tile: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      data-timeline-row=""
      className="flex items-start gap-2.5 border-t-2 border-dotted border-border-soft py-2.5 first:border-t-0 first:pt-0 last:pb-0"
    >
      <TimeGutter time={time} isDay />
      {tile}
      {/* min-w-0 lets the body shrink in its flex track so titles truncate instead of overflowing at narrow widths. */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * 28px outlined tile (onthego.jsx Today timeline). `className` sets its fill:
 * an item's category hue (identity, from lib/hues.ts) or neutral paper.
 */
function Tile({ icon: I, className }: { icon: LucideIcon | undefined; className: string }) {
  return (
    <span
      data-testid="timeline-tile"
      aria-hidden="true"
      className={cn("grid size-7 shrink-0 place-items-center rounded-sm border-2 border-border", className)}
    >
      {I ? <I className="size-[15px]" strokeWidth={2.5} /> : null}
    </span>
  );
}

const NEUTRAL_TILE = "bg-background text-foreground";

/** lucide component per category icon name (lib/categories.ts `icon`). */
const CATEGORY_ICON: Record<string, LucideIcon> = {
  landmark: Landmark,
  utensils: Utensils,
  footprints: Footprints,
  "moon-star": MoonStar,
  "shopping-bag": ShoppingBag,
  "tram-front": TramFront,
  "circle-dot": CircleDot,
};

function ItemTile({ category }: { category: Category }) {
  const meta = CATEGORIES_BY_VALUE.get(category) ?? CATEGORIES_BY_VALUE.get("OTHER")!;
  return <Tile icon={CATEGORY_ICON[meta.icon]} className={cn(categoryClasses(category).fill, "text-on-accent")} />;
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

  if (isDay) {
    return (
      <DayRow time={gutterTime} tile={<Tile icon={Icon} className={NEUTRAL_TILE} />}>
        <div className="flex min-h-7 min-w-0 flex-wrap items-center gap-1.5 text-sm leading-tight">
          <span className="font-semibold text-foreground">
            {isDep ? "Departs" : "Arrives"} — {meta?.label ?? t.mode}
          </span>
          {t.reference && (
            <span className="rounded-full border-2 border-border bg-card px-1.5 text-[10px] font-extrabold leading-4 text-foreground">
              {t.reference}
            </span>
          )}
          {sameDayLabels && (
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {sameDayLabels.dep} → {sameDayLabels.arr}
            </span>
          )}
        </div>
        {(fromLabel || toLabel) && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground">
            {fromLabel && <span className="min-w-0 truncate" title={fromLabel}>{fromLabel}</span>}
            {fromLabel && toLabel && <ArrowRight className="size-3 shrink-0" aria-hidden="true" />}
            {toLabel && <span className="min-w-0 truncate" title={toLabel}>{toLabel}</span>}
          </div>
        )}
        {isDep && depEntry && !depEntry.arrivesSameDay && depEntry.arrivalDateISO && (
          <p className="mt-0.5 text-xs font-medium text-sun-text">Arrives {depEntry.arrivalDateISO}</p>
        )}
        <AttachmentLinks attachments={attachments} />
      </DayRow>
    );
  }

  return (
    <div className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-transparent">
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
          <p className="mt-0.5 text-xs sm:text-[11px] text-sun-text">
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
  showUnschedule,
}: {
  entry: ItemEntry;
  isDay: boolean;
  directions?: ItemDirections;
  attachments: AttachmentView[];
  showUnschedule?: boolean;
}) {
  const { item } = entry;
  const timeLabel = item.endTime
    ? `${item.startTime} – ${item.endTime}`
    : item.startTime;

  if (isDay) {
    return (
      <DayRow time={item.startTime} tile={<ItemTile category={item.category as Category} />}>
        <DayItemBody
          item={item}
          timeLabel={item.endTime ? timeLabel : null}
          directions={directions}
          attachments={attachments}
          showUnschedule={showUnschedule}
        />
      </DayRow>
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
  showUnschedule,
}: {
  entry: ItemEntry;
  isDay: boolean;
  directions?: ItemDirections;
  attachments: AttachmentView[];
  showUnschedule?: boolean;
}) {
  const { item } = entry;

  if (isDay) {
    return (
      <DayRow time={null} tile={<ItemTile category={item.category as Category} />}>
        <DayItemBody
          item={item}
          timeLabel={null}
          directions={directions}
          attachments={attachments}
          showUnschedule={showUnschedule}
        />
      </DayRow>
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
  if (isDay) {
    return (
      <DayRow time={a.checkInTime ?? null} tile={<Tile icon={LogIn} className={NEUTRAL_TILE} />}>
        <span className="block truncate text-sm font-semibold leading-7 text-foreground" title={`Check-in — ${a.name}`}>
          Check-in — {a.name}
        </span>
        {a.confirmation && (
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Hash className="size-3 shrink-0" aria-hidden="true" />
            {a.confirmation}
          </p>
        )}
        <AttachmentLinks attachments={attachments} />
      </DayRow>
    );
  }
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-lg">
      <LogIn
        className="size-4 shrink-0 text-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground" title={`Check-in — ${a.name}`}>
          Check-in — {a.name}
        </span>
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
  if (isDay) {
    return (
      <DayRow time={a.checkOutTime ?? null} tile={<Tile icon={LogOut} className={NEUTRAL_TILE} />}>
        <span className="block truncate text-sm font-semibold leading-7 text-foreground" title={`Check-out — ${a.name}`}>
          Check-out — {a.name}
        </span>
        <AttachmentLinks attachments={attachments} />
      </DayRow>
    );
  }
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-lg">
      <LogOut
        className="size-4 shrink-0 text-foreground"
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

/** Title + actions, then category · time range · address — shared by timed and untimed day rows. */
function DayItemBody({
  item,
  timeLabel,
  directions,
  attachments,
  showUnschedule,
}: {
  item: ItemEntry["item"];
  timeLabel: string | null | undefined;
  directions?: ItemDirections;
  attachments: AttachmentView[];
  showUnschedule?: boolean;
}) {
  return (
    <>
      <div className="flex min-h-7 min-w-0 items-center gap-1.5">
        <span
          className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-foreground"
          title={item.title}
        >
          {item.title}
        </span>
        <DirectionsLink directions={directions} label={item.title} />
        {showUnschedule && item.date && (
          <UnscheduleItemButton
            itemId={item.id}
            itemTitle={item.title}
            date={item.date}
            startTime={item.startTime ?? null}
            endTime={item.endTime ?? null}
            hadStop={item.stopId != null}
          />
        )}
      </div>
      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
        <CategoryPill category={item.category as Category} size="sm" />
        {timeLabel && <span className="tabular-nums">{timeLabel}</span>}
        {item.address && <span className="min-w-0 truncate">{item.address}</span>}
      </div>
      <AttachmentLinks attachments={attachments} />
    </>
  );
}
