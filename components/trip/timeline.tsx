import * as React from "react";
import {
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
  MapPin,
  CircleDot,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { CategoryPill } from "./category-pill";
import { categoryClasses } from "@/lib/categories";
import { groupByCategory } from "@/lib/group-by-category";
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
import { DayEntryLink, type DayEntryEditor, type DayEntryTarget } from "@/components/trip/day-entry-link";

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
   * Both variants render the kit Days rows (time · 28px tile · body).
   * "agenda" — the calendar overview: read-only (no Unschedule), and an
   *            empty day is a one-line "Nothing planned."
   * "day"    — the Day page: Unschedule when `showUnschedule`, and an empty
   *            day is the kit EmptyState.
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
  /**
   * The day page's edit context. When present, each row whose entity is in
   * the matching map gets its title wrapped in DayEntryLink (opens that
   * entity's edit dialog in place). Absent on the Agenda and the share page,
   * which stay read-only.
   */
  editor?: DayEntryEditor;
}

// ---------------------------------------------------------------------------
// Timeline component
// ---------------------------------------------------------------------------

/** Timeline's "anything to show?" check — lives in lib/itinerary.ts so pure callers can share it. */
export { dayHasEntries };

export function Timeline({
  day,
  variant = "agenda",
  itemDirections,
  attachmentsByTarget,
  showUnschedule,
  editor,
}: TimelineProps) {
  const isDay = variant === "day";

  if (!dayHasEntries(day)) {
    // Day variant: the kit empty treatment. Agenda (one card per day on the
    // calendar) keeps a quiet one-liner — a full EmptyState per day is too loud.
    return isDay ? (
      <EmptyState
        icon={CalendarDays}
        tone="sun"
        title="Nothing planned"
        description="Nothing is scheduled for this day yet."
        className="py-5"
      />
    ) : (
      <p className="text-[13px] font-medium text-muted-foreground">Nothing planned.</p>
    );
  }

  const { entries, anytime } = orderDayEntries(day);
  // The agenda variant is a read-only overview: same kit rows, no Unschedule.
  const unschedule = isDay && showUnschedule;

  return (
    // Kit Days timeline (both variants) — rows split by a 2px dotted rule
    // (Days.jsx / DDays.jsx day panel), no gap between rows.
    <div className="flex flex-col">
      {entries.map((entry) => {
        switch (entry.kind) {
          case "accommodation-checkout":
            return (
              <AccomCheckoutRow
                key={`co-${entry.accommodation.id}`}
                entry={entry}
                attachments={attachmentsByTarget?.[entry.accommodation.id] ?? []}
                editor={editor}
              />
            );
          case "accommodation-checkin":
            return (
              <AccomCheckinRow
                key={`ci-${entry.accommodation.id}`}
                entry={entry}
                attachments={attachmentsByTarget?.[entry.accommodation.id] ?? []}
                editor={editor}
              />
            );
          case "transport-departure":
          case "transport-arrival":
            return (
              <TransportRow
                key={`tr-${entry.transport.id}-${entry.kind}`}
                entry={entry}
                attachments={attachmentsByTarget?.[entry.transport.id] ?? []}
                editor={editor}
              />
            );
          case "item":
            return (
              <TimedItemRow
                key={`ti-${entry.item.id}`}
                entry={entry}
                directions={itemDirections?.[entry.item.id]}
                attachments={attachmentsByTarget?.[entry.item.id] ?? []}
                showUnschedule={unschedule}
                editor={editor}
              />
            );
          default:
            return null;
        }
      })}

      {/* Untimed items, grouped by Category */}
      {anytime.length > 0 && (
        <div className="flex flex-col border-t-2 border-dotted border-border-soft pt-2.5 first:border-t-0 first:pt-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Anytime</p>
          {groupByCategory(anytime.map((e) => e.item)).map((group) => (
            <div key={group.category} className="flex flex-col">
              <h4 className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {group.label}
              </h4>
              {group.items.map((it) => (
                <UntimedItemRow
                  key={`ui-${it.id}`}
                  entry={{ kind: "item", item: it }}
                  directions={itemDirections?.[it.id]}
                  attachments={attachmentsByTarget?.[it.id] ?? []}
                  showUnschedule={unschedule}
                  editor={editor}
                />
              ))}
            </div>
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

function TimeGutter({ time }: { time?: string | null }) {
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
      <TimeGutter time={time} />
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
  "map-pin": MapPin,
  "circle-dot": CircleDot,
};

function ItemTile({ category }: { category: Category }) {
  const meta = CATEGORIES_BY_VALUE.get(category) ?? CATEGORIES_BY_VALUE.get("OTHER")!;
  return <Tile icon={CATEGORY_ICON[meta.icon]} className={cn(categoryClasses(category).fill, "text-on-accent")} />;
}

/**
 * A row's title: wrapped in DayEntryLink (opens its edit dialog) when the day
 * page supplied an editor that knows this entity; otherwise the title as-is.
 */
function EntryTitle({
  editor,
  target,
  attachments,
  className,
  children,
}: {
  editor: DayEntryEditor | undefined;
  target: DayEntryTarget | undefined;
  attachments: AttachmentView[];
  className?: string;
  children: React.ReactNode;
}) {
  if (!editor || !target) return <>{children}</>;
  return (
    <DayEntryLink target={target} editor={editor} attachments={attachments} className={className}>
      {children}
    </DayEntryLink>
  );
}

function TransportRow({
  entry,
  attachments,
  editor,
}: {
  entry: TransportDepartureEntry | TransportArrivalEntry;
  attachments: AttachmentView[];
  editor?: DayEntryEditor;
}) {
  const t = entry.transport;
  const meta = TRANSPORT_MODE_META[t.mode as TransportMode];
  const tx = editor?.transports[t.id];
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
    <DayRow time={gutterTime} tile={<Tile icon={Icon} className={NEUTRAL_TILE} />}>
      <div className="flex min-h-7 min-w-0 flex-wrap items-center gap-1.5 text-sm leading-tight">
        <EntryTitle
          editor={editor}
          target={tx ? { kind: "transport", transport: tx } : undefined}
          attachments={attachments}
        >
          <span className="font-semibold text-foreground">
            {isDep ? "Departs" : "Arrives"} — {meta?.label ?? t.mode}
          </span>
        </EntryTitle>
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
          {fromLabel && <span className="min-w-0 break-words">{fromLabel}</span>}
          {fromLabel && toLabel && <ArrowRight className="size-3 shrink-0" aria-hidden="true" />}
          {toLabel && <span className="min-w-0 break-words">{toLabel}</span>}
        </div>
      )}
      {isDep && depEntry && !depEntry.arrivesSameDay && depEntry.arrivalDateISO && (
        <p className="mt-0.5 text-xs font-medium text-sun-text">Arrives {depEntry.arrivalDateISO}</p>
      )}
      <AttachmentLinks attachments={attachments} />
    </DayRow>
  );
}

function TimedItemRow({
  entry,
  directions,
  attachments,
  showUnschedule,
  editor,
}: {
  entry: ItemEntry;
  directions?: ItemDirections;
  attachments: AttachmentView[];
  showUnschedule?: boolean;
  editor?: DayEntryEditor;
}) {
  const { item } = entry;
  const timeLabel = item.endTime
    ? `${item.startTime} – ${item.endTime}`
    : item.startTime;

  return (
    <DayRow time={item.startTime} tile={<ItemTile category={item.category as Category} />}>
      <DayItemBody
        item={item}
        timeLabel={item.endTime ? timeLabel : null}
        directions={directions}
        attachments={attachments}
        showUnschedule={showUnschedule}
        editor={editor}
      />
    </DayRow>
  );
}

function UntimedItemRow({
  entry,
  directions,
  attachments,
  showUnschedule,
  editor,
}: {
  entry: ItemEntry;
  directions?: ItemDirections;
  attachments: AttachmentView[];
  showUnschedule?: boolean;
  editor?: DayEntryEditor;
}) {
  const { item } = entry;

  return (
    <DayRow time={null} tile={<ItemTile category={item.category as Category} />}>
      <DayItemBody
        item={item}
        timeLabel={null}
        directions={directions}
        attachments={attachments}
        showUnschedule={showUnschedule}
        editor={editor}
      />
    </DayRow>
  );
}

function AccomCheckinRow({
  entry,
  attachments,
  editor,
}: {
  entry: AccommodationCheckinEntry;
  attachments: AttachmentView[];
  editor?: DayEntryEditor;
}) {
  const { accommodation: a } = entry;
  const accom = editor?.accommodations[a.id];
  return (
    <DayRow time={a.checkInTime ?? null} tile={<Tile icon={LogIn} className={NEUTRAL_TILE} />}>
      <EntryTitle
        editor={editor}
        target={accom ? { kind: "accommodation", ...accom } : undefined}
        attachments={attachments}
        className="block"
      >
        <span className="block break-words text-sm font-semibold leading-7 text-foreground">
          Check-in — {a.name}
        </span>
      </EntryTitle>
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

function AccomCheckoutRow({
  entry,
  attachments,
  editor,
}: {
  entry: AccommodationCheckoutEntry;
  attachments: AttachmentView[];
  editor?: DayEntryEditor;
}) {
  const { accommodation: a } = entry;
  const accom = editor?.accommodations[a.id];
  return (
    <DayRow time={a.checkOutTime ?? null} tile={<Tile icon={LogOut} className={NEUTRAL_TILE} />}>
      <EntryTitle
        editor={editor}
        target={accom ? { kind: "accommodation", ...accom } : undefined}
        attachments={attachments}
        className="block"
      >
        <span className="block break-words text-sm font-semibold leading-7 text-foreground">
          Check-out — {a.name}
        </span>
      </EntryTitle>
      <AttachmentLinks attachments={attachments} />
    </DayRow>
  );
}

/** Title + actions, then category · time range · address — shared by timed and untimed day rows. */
function DayItemBody({
  item,
  timeLabel,
  directions,
  attachments,
  showUnschedule,
  editor,
}: {
  item: ItemEntry["item"];
  timeLabel: string | null | undefined;
  directions?: ItemDirections;
  attachments: AttachmentView[];
  showUnschedule?: boolean;
  editor?: DayEntryEditor;
}) {
  const editable = editor?.items[item.id];
  return (
    <>
      <div className="flex min-h-7 min-w-0 items-center gap-1.5">
        <EntryTitle
          editor={editor}
          target={editable ? { kind: "item", item: editable } : undefined}
          attachments={attachments}
          className="flex-1"
        >
          <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-tight text-foreground">
            {item.title}
          </span>
        </EntryTitle>
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
        {item.address && <span className="min-w-0 break-words">{item.address}</span>}
      </div>
      <AttachmentLinks attachments={attachments} />
    </>
  );
}
