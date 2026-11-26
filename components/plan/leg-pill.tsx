"use client";

import * as React from "react";
import { Clock, Paperclip, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { LegLabel } from "@/lib/plan/leg-label";
import { BookingStateBadge } from "@/components/trip/booking-state-badge";
import { BOOKING_STATE_LABELS, bookByLabel } from "@/lib/booking-state-copy";
import type { BookingState } from "@/lib/enum-values";

export interface LegRowProps {
  kind: "legs" | "missing" | "line";
  compact?: boolean;
  children?: React.ReactNode;
  /** Per child, the finished line (`changeLabels` in lib/connections). Non-null joins that card to the one above, with the line on the join. */
  changeovers?: readonly (string | null)[];
}

/**
 * The vertical strip between two Stops (PLAN.md §2): a connector line plus,
 * when there are legs to show, the pill(s) riding on it — stacked one per
 * line in travel order, metro-style, each beside a station dot on the
 * connector (spec 2026-10-05 §F). Rough-to-rough gaps pass no children —
 * dashed connector only, no pill. The missing prompt gets no dot.
 */
export function LegRow({ kind, compact, children, changeovers }: LegRowProps) {
  const stations = React.Children.toArray(children);
  const legs = kind === "legs";
  const runs: { node: React.ReactNode; key: React.Key; joined: boolean; changeover: string | null }[][] = [];
  stations.forEach((node, i) => {
    const changeover = changeovers?.[i] ?? null;
    const joined = changeover !== null && i > 0;
    const entry = { node, key: React.isValidElement(node) && node.key != null ? node.key : i, joined, changeover };
    if (joined) runs[runs.length - 1].push(entry);
    else runs.push([entry]);
  });
  return (
    <div data-leg-kind={kind} className={cn("flex items-stretch", compact ? "min-h-10" : "min-h-[52px]")}>
      <span
        data-connector
        aria-hidden
        className={cn("shrink-0 border-l-2 border-border", compact ? "ml-5" : "ml-[26px]", kind !== "legs" && "border-dashed")}
      />
      {stations.length > 0 ? (
        <div
          data-leg-stack
          className={cn(
            "flex min-w-0 flex-col items-start max-md:items-stretch",
            // Room for the marker: the row starts 53px (compact) / 63px from the
            // left, so the stack margin is 53 - 22 = 31px / 63 - 28 = 35px.
            legs ? (compact ? "ml-[31px] gap-3 py-4" : "ml-[35px] gap-3 py-5") : cn("gap-1.5 py-2", compact ? "ml-3" : "ml-[18px]"),
          )}
        >
          {runs.map((run) => (
            <div key={run[0].key} data-leg-run className="flex min-w-0 max-w-full flex-col items-start max-md:w-full">
              {run.map(({ node, key, joined, changeover }, n) => {
                const label = React.isValidElement<LegPillProps>(node) ? node.props.label : null;
                const Icon = label && !label.missing ? label.icon : null;
                return (
                  <div key={key} data-leg-station className="flex min-w-0 max-w-full flex-col items-start max-md:w-full">
                    {joined && changeover ? <JourneyJoin label={changeover} compact={compact} /> : null}
                    <div className="relative flex min-w-0 max-w-full max-md:w-full">
                      {legs && n === 0 && label && !label.missing ? (
                        // The marker sits on the connector, centred on the row. Row start
                        // minus line centre: compact 53 - 21 = 32px, desktop 63 - 27 = 36px.
                        // Tile edges 7..35 (compact) / 11..43; the stub fills tile edge to
                        // row: 18px / 20px.
                        <>
                          <span
                            data-station-stub
                            aria-hidden
                            className={cn("absolute top-1/2 h-0.5 -translate-y-1/2 bg-border", compact ? "left-[-18px] w-[18px]" : "left-[-20px] w-5")}
                          />
                          <span
                            data-station-dot
                            aria-hidden
                            className={cn(
                              "island absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg bg-sun text-on-accent ring-2 ring-background",
                              compact ? "left-[-32px] size-7" : "left-[-36px] size-8",
                            )}
                          >
                            {Icon ? <Icon className="size-4" /> : null}
                          </span>
                        </>
                      ) : null}
                      {node}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function JourneyJoin({ label, compact }: { label: string; compact?: boolean }) {
  return (
    <div className={cn("relative flex w-full min-w-0 items-center", compact ? "h-6" : "h-7")}>
      <span aria-hidden className="absolute inset-y-0 left-10 border-l-2 border-border" />
      <span
        data-changeover
        className="relative z-10 ml-4 inline-flex min-w-0 max-w-[calc(100%-1rem)] cursor-default items-center gap-1.5 rounded-full border-2 border-border bg-background px-2.5 py-0.5 text-xs font-bold text-foreground"
      >
        <Clock className="size-3.5 shrink-0" aria-hidden />
        {label}
      </span>
    </div>
  );
}

export interface LegPillProps {
  label: LegLabel;
  onClick(): void;
  compact?: boolean;
  bookingState?: BookingState | null;
  bookBy?: string | null;
  attached?: boolean;
}

/** A single leg on the strip: a real transport, or the dashed "missing" prompt (PLAN.md §2). */
export function LegPill({ label, onClick, compact, bookingState, bookBy, attached }: LegPillProps) {
  // An explicit aria-label overrides name-from-content, so the visual
  // BookingStateBadge below would otherwise go unheard. Speak the same copy
  // here instead, and hide the badge from the accessibility tree.
  const bookingText = bookingState === "TO_BOOK" ? (bookBy ? bookByLabel(bookBy) : BOOKING_STATE_LABELS.TO_BOOK) : null;
  const accessibleName = [label.accessibleName, bookingText && `${bookingText}.`, attached && "File attached."].filter(Boolean).join(" ");
  if (label.missing) {
    return (
      <button
        type="button"
        aria-label={accessibleName}
        onClick={onClick}
        className={cn(
          "group tap-target pressable inline-flex min-w-0 max-w-full items-center gap-2 whitespace-nowrap rounded-full border-2 border-dashed border-border bg-background font-bold max-md:w-full max-md:justify-start",
          compact ? "h-7 px-2.5 text-xs" : "h-[34px] px-3 text-[13px]",
        )}
      >
        {compact ? (
          <>
            <Plus className="size-3.5" aria-hidden />
            <span>Add transport</span>
          </>
        ) : (
          <>
            <span>{label.label}</span>
            {/* MOTION.md P8 (optional): the Add label nudges on hover; no dash animation. */}
            <span className="inline-block text-coral-text transition-transform duration-[var(--dur-fast)] group-hover:translate-x-0.5">{label.sub}</span>
          </>
        )}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label={accessibleName}
      onClick={onClick}
      data-travel-row
      className={cn(
        "group tap-target pressable",
        TRAVEL_ROW_BASE,
        compact
          ? "px-4 py-3 shadow-[3px_3px_0_hsl(var(--sun))] active:shadow-[1px_1px_0_hsl(var(--sun))]!"
          : "px-5 py-3.5 shadow-[4px_4px_0_hsl(var(--sun))] active:shadow-[1px_1px_0_hsl(var(--sun))]!",
      )}
    >
      <TravelRowText label={label} compact={compact} bookingState={bookingState} bookBy={bookBy} attached={attached} />
    </button>
  );
}

const TRAVEL_ROW_BASE = "flex min-w-0 max-w-full items-start gap-2.5 rounded-2xl border-2 border-border bg-sun/30 dark:bg-sun/15 text-left max-md:w-full";

function TravelRowText({
  label,
  compact,
  bookingState,
  bookBy,
  attached,
  footer,
}: {
  label: LegLabel;
  compact?: boolean;
  bookingState?: BookingState | null;
  bookBy?: string | null;
  attached?: boolean;
  footer?: React.ReactNode;
}) {
  const when = [label.sub, label.arrival].filter(Boolean).join(" ");
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className={cn("flex min-w-0 items-center gap-2 font-bold", compact ? "text-xs" : "text-[13px]")}>
        <span className="min-w-0 truncate">{label.label}</span>
        {attached ? <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
        <BookingStateBadge state={bookingState} bookBy={bookBy} compact hidden className="ml-auto text-xs" />
      </span>
      {when ? <span data-travel-line="when" className="text-xs font-semibold tabular-nums text-foreground">{when}</span> : null}
      {label.detail ? <span data-travel-line="detail" className="break-words text-xs font-medium text-muted-foreground">
          {(() => {
            const parts = label.detail.split(" · ");
            return parts.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 ? " " : null}
                <span className="inline-block max-w-full">{i < parts.length - 1 ? `${part} ·` : part}</span>
              </React.Fragment>
            ));
          })()}
        </span> : null}
      {footer ? <span data-travel-line="footer" className="break-words text-xs font-medium text-muted-foreground">{footer}</span> : null}
    </span>
  );
}

/** A leg's card with nothing to press: the Plan's travel row, read-only (the shared view). */
export function LegCard({ label, compact, footer }: { label: LegLabel; compact?: boolean; footer?: React.ReactNode }) {
  return (
    <div
      data-travel-row
      className={cn(TRAVEL_ROW_BASE, compact ? "px-4 py-3 shadow-[3px_3px_0_hsl(var(--sun))]" : "px-5 py-3.5 shadow-[4px_4px_0_hsl(var(--sun))]")}
    >
      <TravelRowText label={label} compact={compact} footer={footer} />
    </div>
  );
}
