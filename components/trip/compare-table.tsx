"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Info, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { formatLongDate } from "@/lib/dates";
import { diffMetrics, diffRoute, type RouteDiffStop } from "@/lib/compare";
import type { ComparisonPlan } from "@/server/actions/forks";
import { moveFork } from "@/server/actions/forks";
import { PromoteForkDialog } from "@/components/trip/promote-fork-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * Fork card tones by fork index. The kit (shared/together.jsx Compare) draws
 * the real plan white and the fork lilac; further forks cycle through the
 * other kit accents so neighbouring cards stay distinguishable.
 */
const FORK_TONES = ["lilac", "teal", "sun"] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TripMeta {
  id: string;
  name: string;
  homeCurrency: string;
}

export interface CompareTableProps {
  trip: TripMeta;
  plans: ComparisonPlan[];
  /**
   * Whether the current Traveller owns this trip (or is an ADMIN_EMAILS
   * operator — see ADR 0045). Promoting a Fork discards the current real
   * plan and every other Fork, irreversibly (ARCH-DAT-1b), and is
   * owner-only; this drives whether the Promote button renders at all.
   * Hiding is cosmetic — promoteFork's own server-side gate is the real
   * access control. Defaults `true` so existing callers/tests that don't
   * pass it keep rendering Promote.
   */
  isOwner?: boolean;
}

// ---------------------------------------------------------------------------
// Delta formatters
// ---------------------------------------------------------------------------

function signedInt(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `${n}`;
}

function formatNightsDelta(n: number): string | null {
  if (n === 0) return null;
  const unit = Math.abs(n) === 1 ? "night" : "nights";
  return `${signedInt(n)} ${unit}`;
}

function formatStopsDelta(n: number): string | null {
  if (n === 0) return null;
  const unit = Math.abs(n) === 1 ? "stop" : "stops";
  return `${signedInt(n)} ${unit}`;
}

function formatFlightsDelta(n: number): string | null {
  if (n === 0) return null;
  const unit = Math.abs(n) === 1 ? "flight" : "flights";
  return `${signedInt(n)} ${unit}`;
}

function formatBudgetDelta(minor: number | null, currency: string): string | null {
  if (minor === null || minor === 0) return null;
  // Format the absolute magnitude then prepend sign (formatMoney includes the currency symbol)
  const abs = formatMoney(Math.abs(minor), currency);
  return minor > 0 ? `+${abs}` : `-${abs}`;
}

function formatMinutesDelta(minutes: number): string | null {
  if (minutes === 0) return null;
  const totalMins = Math.abs(minutes);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const formatted = h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
  return `${minutes > 0 ? "+" : "-"}${formatted}`;
}

function formatProjectedEndDelta(days: number | null): string | null {
  if (days === null || days === 0) return null;
  const unit = Math.abs(days) === 1 ? "day" : "days";
  if (days > 0) return `ends ${days} ${unit} later`;
  return `ends ${Math.abs(days)} ${unit} earlier`;
}

function formatFlagsDelta(warnings: number, infos: number): string | null {
  const parts: string[] = [];
  if (warnings !== 0) {
    const unit = Math.abs(warnings) === 1 ? "warning" : "warnings";
    parts.push(`${signedInt(warnings)} ${unit}`);
  }
  if (infos !== 0) {
    const unit = Math.abs(infos) === 1 ? "info" : "infos";
    parts.push(`${signedInt(infos)} ${unit}`);
  }
  if (parts.length === 0) return null;
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// Hard-end state label
// ---------------------------------------------------------------------------

function hardEndLabel(state: ComparisonPlan["metrics"]["hardEndState"]): string {
  switch (state) {
    case "ok":
      return "On time";
    case "approaching":
      return "Approaching limit";
    case "over":
      return "Over hard end";
    case "none":
      return "—";
  }
}

/** Status = state: over → destructive, approaching → warning, on time → plain chip. */
function hardEndBadgeClass(state: ComparisonPlan["metrics"]["hardEndState"]): string | undefined {
  if (state === "over") return "bg-destructive text-destructive-foreground";
  if (state === "approaching") return "bg-warning text-warning-foreground";
  return undefined;
}

// ---------------------------------------------------------------------------
// Transit/driving time formatter
// ---------------------------------------------------------------------------

function formatMinutes(minutes: number): string {
  if (minutes === 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}


// ---------------------------------------------------------------------------
// Route rows (kit: one row per stop; a changed stop gets a bordered row)
// ---------------------------------------------------------------------------

function nightsLabel(n: number | null): string | null {
  return n !== null && n > 0 ? `${n}n` : null;
}

const CHANGE_PREFIX: Record<RouteDiffStop["kind"], string> = {
  same: "",
  added: "+ ",
  dropped: "− ",
  moved: "↕ ",
  renighted: "",
};

const CHANGE_SR: Record<RouteDiffStop["kind"], string | null> = {
  same: null,
  added: "added",
  dropped: "dropped",
  moved: "moved",
  renighted: "nights changed",
};

function RouteRow({ stop }: { stop: RouteDiffStop }) {
  const changed = stop.kind !== "same";
  const nights =
    stop.kind === "renighted"
      ? `${stop.baseNights ?? "?"}→${stop.nights ?? "?"}n`
      : nightsLabel(stop.nights);
  const sr = CHANGE_SR[stop.kind];
  return (
    <li
      data-testid="route-row"
      data-change={stop.kind}
      className={cn(
        "flex items-baseline justify-between gap-2 rounded-[10px] border-2 px-2.5 py-2 text-[13px]",
        changed ? "border-border bg-card" : "border-transparent",
        stop.kind === "dropped" && "line-through",
      )}
    >
      <span className="min-w-0 truncate">
        <b className="font-extrabold">
          {CHANGE_PREFIX[stop.kind]}
          {stop.name}
        </b>
        {stop.country && <span className="ml-1.5 text-xs font-semibold text-muted-foreground">{stop.country}</span>}
        {sr && <span className="sr-only"> ({sr})</span>}
      </span>
      {nights && <span className="shrink-0 font-semibold">{nights}</span>}
    </li>
  );
}

function RouteSection({ realPlan, plan }: { realPlan: ComparisonPlan; plan: ComparisonPlan }) {
  const isReal = plan.forkId === null;
  const diff = isReal ? null : diffRoute(realPlan.metrics, plan.metrics);
  const stops: RouteDiffStop[] = diff
    ? diff.stops
    : plan.metrics.route.map((s) => ({ ...s, baseNights: null, kind: "same" as const }));
  return (
    <section className="mt-3">
      <h4 className="sr-only">Route</h4>
      {stops.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {stops.map((s, i) => (
            <RouteRow key={i} stop={s} />
          ))}
        </ul>
      ) : (
        <p className="px-2.5 text-[13px] font-semibold text-muted-foreground">No stops yet</p>
      )}
      {diff?.legChanges.map((l, i) => (
        <p key={`leg-${i}`} className="mt-1.5 truncate px-2.5 text-xs font-semibold text-muted-foreground">
          {l.fromName}→{l.toName}: {l.fromMode.toLowerCase()} → {l.toMode.toLowerCase()}
        </p>
      ))}
      {isReal && plan.metrics.countries.length > 0 && (
        <p className="mt-1.5 truncate px-2.5 text-xs font-semibold text-muted-foreground">
          {plan.metrics.countries.join(" · ")}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Delta chip — the sign carries the direction; a plain kit chip stays legible
// on the white card and on the accent islands alike.
// ---------------------------------------------------------------------------

function DeltaBadge({ text }: { text: string }) {
  return <Badge>{text}</Badge>;
}

// ---------------------------------------------------------------------------
// Reorder arrows (44px targets, 3px focus ring)
// ---------------------------------------------------------------------------

const ARROW_CLASS =
  "-my-2 inline-grid size-11 place-items-center rounded-full text-muted-foreground outline-none hover:text-foreground disabled:opacity-30 focus-visible:ring-[3px] focus-visible:ring-ring";

function ReorderArrows({
  planName, isFirst, isLast, onMove, pending,
}: { planName: string; isFirst: boolean; isLast: boolean; onMove: (d: "left" | "right") => void; pending: boolean }) {
  return (
    <span className="flex items-center">
      <button
        type="button" aria-label={`Move ${planName} left`} disabled={isFirst || pending}
        onClick={() => onMove("left")}
        className={ARROW_CLASS}
      >
        <ChevronLeft className="size-4" strokeWidth={2.5} aria-hidden="true" />
      </button>
      <button
        type="button" aria-label={`Move ${planName} right`} disabled={isLast || pending}
        onClick={() => onMove("right")}
        className={ARROW_CLASS}
      >
        <ChevronRight className="size-4" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type MetricRowId =
  | "nights"
  | "budget"
  | "stops"
  | "transit"
  | "driving"
  | "flights"
  | "flags"
  | "projected-end";

/**
 * Stat grid order: the kit's Nights · Cost · Legs lead, then the rest of ours.
 * Money is one shared pot, so the cost stat is "Trip cost" (as on the trip
 * home), never a per-person figure.
 */
const METRIC_ROWS: { id: MetricRowId; label: string; wide?: boolean }[] = [
  { id: "nights", label: "Nights" },
  { id: "budget", label: "Trip cost" },
  { id: "stops", label: "Stops" },
  { id: "transit", label: "Transit time" },
  { id: "driving", label: "Driving" },
  { id: "flights", label: "Flights" },
  { id: "flags", label: "Flags" },
  { id: "projected-end", label: "Projected end", wide: true },
];

const VALUE_CLASS = "font-display text-lg font-extrabold leading-tight tracking-[-0.02em]";

export function CompareTable({ trip, plans, isOwner = true }: CompareTableProps) {
  const [promoteOpenFor, setPromoteOpenFor] = React.useState<string | null>(null);
  const router = useRouter();
  const [reorderPending, startReorder] = React.useTransition();

  function handleMove(forkId: string, direction: "left" | "right") {
    startReorder(async () => {
      await moveFork(forkId, direction);
      router.refresh();
    });
  }

  const realPlan = plans[0];
  const forkPlans = plans.slice(1);

  function renderValue(plan: ComparisonPlan, rowId: MetricRowId): React.ReactNode {
    const m = plan.metrics;
    switch (rowId) {
      case "projected-end":
        return (
          <>
            <span className={VALUE_CLASS}>{m.projectedEnd ? formatLongDate(m.projectedEnd) : "—"}</span>
            {m.hardEndState !== "none" && (
              <Badge className={cn("w-fit", hardEndBadgeClass(m.hardEndState))}>{hardEndLabel(m.hardEndState)}</Badge>
            )}
          </>
        );
      case "budget":
        return (
          <>
            <span className={VALUE_CLASS}>
              {m.budgetHomeMinor !== null ? formatMoney(m.budgetHomeMinor, trip.homeCurrency) : "—"}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">shared pot</span>
          </>
        );
      case "flags":
        return (
          <span className={cn(VALUE_CLASS, "flex flex-wrap items-center gap-x-2.5")}>
            {m.flagCounts.warning > 0 && (
              <span className="inline-flex items-center gap-1">
                <TriangleAlert className="size-4" strokeWidth={2.5} aria-hidden="true" />
                {m.flagCounts.warning}
                <span className="sr-only">{m.flagCounts.warning === 1 ? " warning" : " warnings"}</span>
              </span>
            )}
            {m.flagCounts.info > 0 && (
              <span className="inline-flex items-center gap-1">
                <Info className="size-4" strokeWidth={2.5} aria-hidden="true" />
                {m.flagCounts.info}
                <span className="sr-only">{m.flagCounts.info === 1 ? " info" : " infos"}</span>
              </span>
            )}
            {m.flagCounts.warning === 0 && m.flagCounts.info === 0 && "None"}
          </span>
        );
      case "stops":
        return <span className={VALUE_CLASS}>{m.stopCount}</span>;
      case "nights":
        return <span className={VALUE_CLASS}>{m.nightTotal}</span>;
      case "transit":
        return <span className={VALUE_CLASS}>{formatMinutes(m.transitMinutes)}</span>;
      case "driving":
        return <span className={VALUE_CLASS}>{formatMinutes(m.drivingMinutes)}</span>;
      case "flights":
        return <span className={VALUE_CLASS}>{m.flightCount}</span>;
    }
  }

  function renderDelta(plan: ComparisonPlan, rowId: MetricRowId): React.ReactNode {
    const deltas = diffMetrics(realPlan.metrics, plan.metrics);
    let text: string | null = null;
    switch (rowId) {
      case "nights":
        text = formatNightsDelta(deltas.nightTotal);
        break;
      case "stops":
        text = formatStopsDelta(deltas.stopCount);
        break;
      case "flights":
        text = formatFlightsDelta(deltas.flightCount);
        break;
      case "budget":
        text = formatBudgetDelta(deltas.budgetHomeMinor, trip.homeCurrency);
        break;
      case "transit":
        text = formatMinutesDelta(deltas.transitMinutes);
        break;
      case "driving":
        text = formatMinutesDelta(deltas.drivingMinutes);
        break;
      case "flags":
        text = formatFlagsDelta(deltas.flagWarnings, deltas.flagInfos);
        break;
      case "projected-end":
        text = formatProjectedEndDelta(deltas.projectedEndDays);
        break;
    }
    return text ? <DeltaBadge text={text} /> : null;
  }

  return (
    <>
      {/* One tree at every width: stacked cards on phones, the kit's two columns from md. */}
      <div data-slot="compare-grid" className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 md:gap-[18px]">
        {plans.map((plan, planIndex) => {
          const isReal = planIndex === 0;
          const forkIndex = planIndex - 1;
          const diffSummary = isReal ? null : diffRoute(realPlan.metrics, plan.metrics).summary;
          return (
            <Card
              key={plan.forkId ?? "real"}
              data-testid="plan-card"
              tone={isReal ? "white" : FORK_TONES[forkIndex % FORK_TONES.length]}
              shadow={isReal ? 2 : 4}
              className="min-w-0 p-3.5 md:p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 break-words font-display text-[22px] font-extrabold leading-tight tracking-[-0.03em]">
                  {plan.name}
                </h3>
                <div className="flex h-7 shrink-0 items-center gap-1">
                  {!isReal && (
                    <ReorderArrows
                      planName={plan.name}
                      isFirst={forkIndex === 0}
                      isLast={planIndex === plans.length - 1}
                      onMove={(d) => handleMove(plan.forkId!, d)}
                      pending={reorderPending}
                    />
                  )}
                  <Badge caps>{isReal ? "Real plan" : "Fork"}</Badge>
                </div>
              </div>

              <RouteSection realPlan={realPlan} plan={plan} />

              <dl className="mt-3.5 grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3">
                {METRIC_ROWS.map((row) => (
                  <div key={row.id} className={cn("min-w-0", row.wide && "col-span-2")}>
                    <dt className="text-label">{row.label}</dt>
                    <dd className="mt-0.5 flex flex-col items-start gap-1">
                      {renderValue(plan, row.id)}
                      {!isReal && renderDelta(plan, row.id)}
                    </dd>
                  </div>
                ))}
              </dl>

              {!isReal && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
                  <p className="min-w-0 text-xs font-semibold text-muted-foreground">{diffSummary}</p>
                  {isOwner && (
                    <Button onClick={() => setPromoteOpenFor(plan.forkId)} aria-label={`Promote ${plan.name}`}>
                      Promote
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Promote dialogs — one per fork */}
      {forkPlans.map((plan) => (
        <PromoteForkDialog
          key={plan.forkId}
          forkId={plan.forkId!}
          forkName={plan.name}
          open={promoteOpenFor === plan.forkId}
          onOpenChange={(open) => {
            if (!open) setPromoteOpenFor(null);
          }}
          homeCurrency={trip.homeCurrency}
        />
      ))}
    </>
  );
}
